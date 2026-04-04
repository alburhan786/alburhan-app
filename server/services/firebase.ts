import * as adminNs from "firebase-admin";
import pRetry, { AbortError } from "p-retry";
// CJS/ESM interop: in some production environments (CommonJS), all exports land
// on `.default` instead of the namespace itself.  Fall back gracefully.
const admin: typeof adminNs = (adminNs as any).default ?? adminNs;

const FCM_CHANNEL_ID = "alburhan-push";

// Error codes that definitively mean the token is permanently invalid and must be removed.
// Intentionally excludes messaging/invalid-argument (can indicate payload issues, not token staleness)
const STALE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/authentication-error",
  "messaging/unauthorized-registration",
]);

// Error codes that are transient — safe to retry with backoff
const TRANSIENT_FCM_CODES = new Set([
  "messaging/internal-error",
  "messaging/quota-exceeded",
  "messaging/unavailable",
  "messaging/server-unavailable",
  "messaging/network-error",
]);

// Error codes that suggest the image URL was rejected — strip image and retry
const IMAGE_FALLBACK_CODES = new Set([
  "messaging/invalid-argument",
]);

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s, 2s, 4s

function isTransient(code: string): boolean {
  return TRANSIENT_FCM_CODES.has(code);
}

let initialized = false;

function getApp(): adminNs.app.App | null {
  if (initialized) {
    try { return admin.app(); } catch { initialized = false; }
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log("[FCM] Firebase Admin SDK initialized");
    return admin.app();
  } catch (err: any) {
    console.error("[FCM] Failed to initialize Firebase Admin:", err.message);
    return null;
  }
}

export function isFcmEnabled(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

export function initFirebaseEager(): void {
  getApp();
}

export async function getExpoPushTokenFromFirestore(userId: number): Promise<string | null> {
  const app = getApp();
  if (!app) return null;
  try {
    const doc = await admin.firestore().collection("users").doc(String(userId)).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return (data?.expoPushToken as string) || null;
  } catch (err: any) {
    console.warn(`[Firestore] getExpoPushTokenFromFirestore(${userId}) error:`, err?.message ?? err);
    return null;
  }
}

function buildAndroidConfig(imageUrl?: string) {
  return {
    priority: "high" as const,
    notification: {
      channelId: FCM_CHANNEL_ID,
      sound: "default",
      priority: "max" as const,
      visibility: "public" as const,
      ...(imageUrl ? { imageUrl } : {}),
    },
  };
}

// imageUrl triggers mutableContent so iOS downloads and displays the attachment
function buildApnsConfig(title: string, body: string, imageUrl?: string) {
  return {
    headers: { "apns-priority": "10" },
    payload: {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: 1,
        ...(imageUrl ? { mutableContent: true } : {}),
      },
    },
  };
}

export async function sendFcmToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string,
): Promise<{ success: boolean; staleTokens: string[]; retryCount: number; errorCode?: string }> {
  const app = getApp();
  if (!app) return { success: false, staleTokens: [], retryCount: 0 };
  const tokenPrefix = token.slice(0, 20);
  let retryCount = 0;
  let lastErrorCode: string | undefined;
  // May be cleared on image-related rejection so subsequent retries omit the image
  let activeImageUrl: string | undefined = imageUrl;

  try {
    await pRetry(
      async (attemptNumber: number) => {
        if (attemptNumber > 1) {
          console.log(`[FCM] token=${tokenPrefix}... retry attempt ${attemptNumber}${activeImageUrl ? "" : " (no image)"}`);
        }
        try {
          const messageId = await admin.messaging().send({
            token,
            notification: { title, body, ...(activeImageUrl ? { image: activeImageUrl } : {}) },
            data: data || {},
            android: buildAndroidConfig(activeImageUrl),
            apns: buildApnsConfig(title, body, activeImageUrl),
          });
          console.log(`[FCM] token=${tokenPrefix}... OK messageId=${messageId}`);
        } catch (err: unknown) {
          const fcmErr = err as { code?: string; message?: string };
          const code: string = fcmErr.code ?? "?";
          lastErrorCode = code;
          retryCount = attemptNumber - 1;
          const isStale = STALE_TOKEN_CODES.has(code);
          // Image rejected — strip image and let p-retry fire again without it
          if (activeImageUrl && IMAGE_FALLBACK_CODES.has(code)) {
            console.warn(`[FCM] token=${tokenPrefix}... image rejected (${code}), retrying without image`);
            activeImageUrl = undefined;
            throw err; // trigger retry
          }
          console.error(
            `[FCM] token=${tokenPrefix}... FAILED attempt=${attemptNumber} code=${code} message=${fcmErr.message}` +
            (isStale ? " → STALE" : isTransient(code) ? " → will retry" : "")
          );
          if (isStale || !isTransient(code)) {
            // Abort immediately — do not retry stale or unknown errors
            throw new AbortError(fcmErr.message ?? code);
          }
          throw err; // Rethrow to trigger p-retry
        }
      },
      { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
    );
    return { success: true, staleTokens: [], retryCount };
  } catch {
    const isStale = lastErrorCode ? STALE_TOKEN_CODES.has(lastErrorCode) : false;
    return { success: false, staleTokens: isStale ? [token] : [], retryCount, errorCode: lastErrorCode };
  }
}

export async function sendFcmMulticast(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string,
): Promise<{
  success: number;
  failure: number;
  tokenResults: boolean[];
  staleTokens: string[];
  totalRetries: number;
  errorCodes: string[];
  perTokenErrorCodes: Array<string | null>;
}> {
  const app = getApp();
  if (!app || tokens.length === 0) {
    return { success: 0, failure: 0, tokenResults: [], staleTokens: [], totalRetries: 0, errorCodes: [], perTokenErrorCodes: [] };
  }

  const staleTokens: string[] = [];
  const errorCodes: string[] = [];
  let results: boolean[] = tokens.map(() => false);
  // Track per-token error codes to distinguish transient from permanent failures
  const perTokenErrorCode: Array<string | null> = tokens.map(() => null);
  let totalRetries = 0;
  // May be cleared if FCM rejects the image URL, so retries omit it
  let activeImageUrl: string | undefined = imageUrl;

  // Initial multicast send
  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body, ...(activeImageUrl ? { image: activeImageUrl } : {}) },
      data: data || {},
      android: buildAndroidConfig(activeImageUrl),
      apns: buildApnsConfig(title, body, activeImageUrl),
    });

    results = result.responses.map((r, idx) => {
      const prefix = tokens[idx].slice(0, 20);
      if (r.success) {
        console.log(`[FCM] token=${prefix}... OK messageId=${r.messageId}`);
        return true;
      } else {
        const code: string = r.error?.code ?? "?";
        const isStale = STALE_TOKEN_CODES.has(code);
        console.error(
          `[FCM] token=${prefix}... FAILED code=${code} message=${r.error?.message ?? "unknown"}` +
          (isStale ? " → STALE" : "")
        );
        perTokenErrorCode[idx] = code;
        if (isStale) staleTokens.push(tokens[idx]);
        else errorCodes.push(code);
        return false;
      }
    });

    console.log(
      `[FCM] Multicast: ${result.successCount}/${tokens.length} delivered, ` +
      `${result.failureCount} failed` +
      (staleTokens.length > 0 ? `, ${staleTokens.length} stale token(s) will be deleted` : "")
    );
  } catch (initialErr: unknown) {
    const e0 = initialErr as { code?: string; message?: string };
    const initCode: string = e0.code ?? "messaging/network-error";
    console.error(`[FCM] sendFcmMulticast initial error: code=${initCode} message=${e0.message}`);
    // Image rejected — strip image and retry immediately without image
    if (activeImageUrl && IMAGE_FALLBACK_CODES.has(initCode)) {
      console.warn(`[FCM] Multicast image rejected (${initCode}), retrying without image`);
      activeImageUrl = undefined;
    }
    // Entire call failed — retry with p-retry if transient (or if we just cleared imageUrl)
    if (isTransient(initCode) || (imageUrl && activeImageUrl === undefined && IMAGE_FALLBACK_CODES.has(initCode))) {
      try {
        await pRetry(
          async (attemptNumber: number) => {
            totalRetries = attemptNumber;
            try {
              const retryResult = await admin.messaging().sendEachForMulticast({
                tokens,
                notification: { title, body, ...(activeImageUrl ? { image: activeImageUrl } : {}) },
                data: data || {},
                android: buildAndroidConfig(activeImageUrl),
                apns: buildApnsConfig(title, body, activeImageUrl),
              });
              retryResult.responses.forEach((r, idx) => {
                results[idx] = r.success;
                if (!r.success && r.error) {
                  const c = r.error.code ?? "?";
                  perTokenErrorCode[idx] = c;
                  if (STALE_TOKEN_CODES.has(c) && !staleTokens.includes(tokens[idx])) staleTokens.push(tokens[idx]);
                }
              });
              console.log(`[FCM] Multicast retry ${attemptNumber} succeeded: ${retryResult.responses.filter(r => r.success).length}/${tokens.length}`);
            } catch (retryErr: unknown) {
              const re = retryErr as { code?: string; message?: string };
              const retryCode = re.code ?? "messaging/network-error";
              console.error(`[FCM] Multicast retry ${attemptNumber} failed: code=${retryCode}`);
              if (!isTransient(retryCode)) {
                throw new AbortError(re.message ?? retryCode);
              }
              throw retryErr;
            }
          },
          { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
        );
      } catch {
        // All retries exhausted — proceed with failed results array
      }
    }
  }

  // Retry tokens that failed with image-related error (per-response, not thrown) without image
  if (activeImageUrl) {
    const imageFailIndices = results
      .map((ok, idx) => {
        if (ok) return -1;
        const errCode = perTokenErrorCode[idx];
        if (!errCode || !IMAGE_FALLBACK_CODES.has(errCode)) return -1;
        return idx;
      })
      .filter((idx): idx is number => idx !== -1);

    if (imageFailIndices.length > 0) {
      console.warn(`[FCM] ${imageFailIndices.length} token(s) had per-response image rejection, retrying without image`);
      for (const idx of imageFailIndices) {
        const token = tokens[idx];
        const tokenPrefix = token.slice(0, 20);
        try {
          const msgId = await admin.messaging().send({
            token,
            notification: { title, body },
            data: data || {},
            android: buildAndroidConfig(undefined),
            apns: buildApnsConfig(title, body, undefined),
          });
          results[idx] = true;
          perTokenErrorCode[idx] = null;
          console.log(`[FCM] token=${tokenPrefix}... image-fallback OK messageId=${msgId}`);
        } catch (fallbackErr: unknown) {
          const e = fallbackErr as { code?: string; message?: string };
          const code: string = e.code ?? "?";
          perTokenErrorCode[idx] = code;
          console.error(`[FCM] token=${tokenPrefix}... image-fallback FAILED code=${code}`);
          if (STALE_TOKEN_CODES.has(code) && !staleTokens.includes(token)) staleTokens.push(token);
          else if (!staleTokens.includes(token)) errorCodes.push(code);
        }
      }
    }
  }

  // Retry ONLY individual tokens that failed with transient error codes (using p-retry)
  const transientIndices = results
    .map((ok, idx) => {
      if (ok) return -1;
      const errCode = perTokenErrorCode[idx];
      if (!errCode || !isTransient(errCode)) return -1;
      if (staleTokens.includes(tokens[idx])) return -1;
      return idx;
    })
    .filter((idx): idx is number => idx !== -1);

  for (const idx of transientIndices) {
    const token = tokens[idx];
    const tokenPrefix = token.slice(0, 20);
    let retriesForToken = 0;
    let tokenImageUrl: string | undefined = activeImageUrl;
    try {
      await pRetry(
        async (attemptNumber: number) => {
          retriesForToken = attemptNumber - 1;
          try {
            const msgId = await admin.messaging().send({
              token,
              notification: { title, body, ...(tokenImageUrl ? { image: tokenImageUrl } : {}) },
              data: data || {},
              android: buildAndroidConfig(tokenImageUrl),
              apns: buildApnsConfig(title, body, tokenImageUrl),
            });
            results[idx] = true;
            perTokenErrorCode[idx] = null;
            console.log(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} OK messageId=${msgId}`);
          } catch (retryErr: unknown) {
            const e = retryErr as { code?: string; message?: string };
            const retryCode: string = e.code ?? "?";
            if (tokenImageUrl && IMAGE_FALLBACK_CODES.has(retryCode)) {
              console.warn(`[FCM] token=${tokenPrefix}... image rejected on retry, retrying without image`);
              tokenImageUrl = undefined;
              perTokenErrorCode[idx] = retryCode;
              throw retryErr;
            }
            // Always record the most recent error code before any branching or AbortError throw
            perTokenErrorCode[idx] = retryCode;
            if (STALE_TOKEN_CODES.has(retryCode) && !staleTokens.includes(token)) {
              staleTokens.push(token);
            }
            if (!isTransient(retryCode)) {
              console.error(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} non-retryable code=${retryCode}`);
              throw new AbortError(e.message ?? retryCode);
            }
            console.warn(`[FCM] token=${tokenPrefix}... retry ${attemptNumber} failed code=${retryCode}`);
            throw retryErr;
          }
        },
        { retries: MAX_RETRIES - 1, minTimeout: RETRY_BASE_MS, factor: 2 }
      );
    } catch {
      // Token failed after all retries — already logged above
    }
    totalRetries += retriesForToken;
  }

  const totalSuccess = results.filter(Boolean).length;
  const totalFailure = results.length - totalSuccess;
  return {
    success: totalSuccess,
    failure: totalFailure,
    tokenResults: results,
    staleTokens,
    totalRetries,
    errorCodes,
    perTokenErrorCodes: perTokenErrorCode,
  };
}
