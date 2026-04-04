import type { Express, Request } from "express";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { db, withDbRetry } from "./db";
import { users, packages, bookings, payments, notifications, documents, deviceTokens, pushDeliveryLogs, groups, groupMembers, customerProfiles } from "@shared/schema";
import type { PackageImage } from "@shared/schema";
import { eq, desc, sql, sum, and, inArray, gte, count, lt, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import { signUserId, verifyUserToken } from "./auth-token";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import nodemailer from "nodemailer";
import { sendFcmMulticast, sendFcmToToken, isFcmEnabled, getExpoPushTokenFromFirestore } from "./services/firebase";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadVideo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

let storageClient: ObjectStorageClient | null = null;
function getStorageClient(): ObjectStorageClient | null {
  if (storageClient) return storageClient;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  storageClient = new ObjectStorageClient({ bucketId });
  return storageClient;
}

async function getExpoTokenByPhone(phone: string): Promise<string | null> {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const sanitized = phone.replace(/\D/g, '');
  if (!sanitized) return null;
  try {
    const resp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/push_tokens/${sanitized}`
    );
    if (!resp.ok) return null;
    const doc = await resp.json() as any;
    const token = doc?.fields?.expoPushToken?.stringValue ?? null;
    if (token) console.log(`[ExpoPush] Firestore REST token found by phone ...${sanitized.slice(-4)}: ...${token.slice(-8)}`);
    return token;
  } catch (err: any) {
    console.warn(`[ExpoPush] Firestore REST phone lookup error:`, err?.message ?? err);
    return null;
  }
}

const isExpoTokenFormat = (t: string) => /^ExponentPushToken\[/.test(t);

function filterValidExpoTokens(tokens: string[], source: string, userId: number): string[] {
  const valid: string[] = [];
  for (const t of tokens) {
    if (isExpoTokenFormat(t)) {
      valid.push(t);
    } else {
      console.warn(`[ExpoPush] Dropping malformed token from ${source} userId=${userId}: "${t.slice(0, 40)}"`);
    }
  }
  return valid;
}

async function getExpoTokensForUser(db: any, userId: number, phone?: string): Promise<string[]> {
  console.log(`[ExpoPush] Looking up token — userId=${userId} phone=${phone ?? 'n/a'}`);

  // Primary: read expo_push_token from device_tokens table, ordered by most recently updated
  const rows = await db
    .select({ expoPushToken: deviceTokens.expoPushToken, platform: deviceTokens.platform, updatedAt: deviceTokens.updatedAt })
    .from(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isInvalid, false)))
    .orderBy(desc(deviceTokens.updatedAt));

  const rawDbTokens = rows.map((r: any) => r.expoPushToken).filter((t: any): t is string => !!t);
  const dbTokens = filterValidExpoTokens(rawDbTokens, "db", userId);
  if (dbTokens.length > 0) {
    console.log(`[ExpoPush] ✓ DB token found for userId=${userId}: ${dbTokens.length} token(s) — ${dbTokens.map(t => '...' + t.slice(-12)).join(', ')}`);
    return dbTokens;
  }
  console.log(`[ExpoPush] No DB token for userId=${userId} (${rows.length} row(s), none with valid expo_push_token)`);

  if (phone) {
    const sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone) {
      const phoneRows = await db
        .select({ expoPushToken: deviceTokens.expoPushToken })
        .from(deviceTokens)
        .innerJoin(users, eq(deviceTokens.userId, users.id))
        .where(and(eq(users.phone, sanitizedPhone), eq(deviceTokens.isInvalid, false)));
      const rawPhoneTokens = phoneRows.map((r: any) => r.expoPushToken).filter((t: any): t is string => !!t);
      const phoneTokens = filterValidExpoTokens(rawPhoneTokens, "db-phone", userId);
      if (phoneTokens.length > 0) {
        console.log(`[ExpoPush] ✓ DB phone token found for phone=...${sanitizedPhone.slice(-4)}: ${phoneTokens.length} token(s)`);
        return phoneTokens;
      }
    }
  }

  // Fallback: Firestore (legacy path)
  console.log(`[ExpoPush] Falling back to Firestore for userId=${userId}`);
  const fsToken = await getExpoPushTokenFromFirestore(userId);
  if (fsToken) {
    if (!isExpoTokenFormat(fsToken)) {
      console.warn(`[ExpoPush] Dropping malformed Firestore token for userId=${userId}: "${fsToken.slice(0, 40)}"`);
    } else {
      console.log(`[ExpoPush] ✓ Firestore Admin token found for userId=${userId}: ...${fsToken.slice(-8)}`);
      return [fsToken];
    }
  }
  if (phone) {
    const phoneToken = await getExpoTokenByPhone(phone);
    if (phoneToken) {
      if (!isExpoTokenFormat(phoneToken)) {
        console.warn(`[ExpoPush] Dropping malformed Firestore phone token for userId=${userId}: "${phoneToken.slice(0, 40)}"`);
      } else {
        console.log(`[ExpoPush] ✓ Firestore phone token found for userId=${userId}`);
        return [phoneToken];
      }
    }
  }

  console.warn(`[ExpoPush] ✗ No valid Expo push token found for userId=${userId} phone=${phone ?? 'n/a'}`);
  return [];
}

// Error codes that indicate the token itself is permanently invalid — do not retry, delete from DB
const EXPO_TOKEN_FATAL_ERRORS = new Set(["DeviceNotRegistered", "InvalidCredentials", "MessageTooBig"]);
// HTTP status codes that are transient and worth retrying
const EXPO_RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

async function expoFetchWithRetry(expoPayload: object, maxAttempts = 3): Promise<Response> {
  const delays = [500, 1000];
  let lastErr: Error = new Error("expo_send_failed");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(expoPayload),
      });
      if (res.ok || !EXPO_RETRYABLE_HTTP.has(res.status)) return res;
      const errText = await res.text().catch(() => "");
      console.warn(`[Push] Expo HTTP ${res.status} attempt ${attempt}/${maxAttempts}: ${errText.slice(0, 120)}`);
      lastErr = new Error(`expo_http_${res.status}`);
    } catch (e: any) {
      console.warn(`[Push] Expo network error attempt ${attempt}/${maxAttempts}: ${e.message}`);
      lastErr = e;
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, delays[attempt - 1] ?? 1000));
  }
  throw lastErr;
}

// --- Dedup: prevent sending the same notification within 24 hours ---
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function isNotifDuplicate(
  dbHandle: typeof db,
  userId: number,
  type: string,
  message: string
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const rows = await dbHandle
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, type),
          eq(notifications.message, message),
          eq(notifications.status, "sent"),
          gte(notifications.sentAt, since)
        )
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

interface BroadcastResult {
  expoPushDeviceCount: number;
  fcmSent: number;
  fcmFailed: number;
  sentUserIds: Set<number>;
  totalRetries: number;
  errorCodes: string[];
}

async function markExpoPushTokenInvalid(
  dbHandle: typeof db,
  tokenValue: string,
  reason: string,
): Promise<void> {
  try {
    await dbHandle.delete(deviceTokens)
      .where(eq(deviceTokens.expoPushToken, tokenValue));
    console.log(`[Push] Expo stale token deleted (${reason}): ${tokenValue.slice(0, 30)}...`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`[Push] Failed to delete Expo stale token (${reason}): ${e.message}`);
  }
}

async function markFcmTokenInvalid(
  dbHandle: typeof db,
  tokenValue: string,
  reason: string,
): Promise<void> {
  try {
    await dbHandle.delete(deviceTokens)
      .where(eq(deviceTokens.token, tokenValue));
    console.log(`[Push] FCM stale token deleted (${reason}): ${tokenValue.slice(0, 30)}...`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`[Push] Failed to delete FCM stale token (${reason}): ${e.message}`);
  }
}

async function logPushDelivery(
  dbHandle: typeof db,
  entries: Array<{
    userId: number | null;
    channel: string;
    status: string;
    errorCode?: string;
    title?: string;
    tokenPrefix?: string;
  }>,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await dbHandle.insert(pushDeliveryLogs).values(
      entries.map(e => ({
        userId: e.userId ?? null,
        channel: e.channel,
        status: e.status,
        errorCode: e.errorCode ?? null,
        title: e.title ?? null,
        tokenPrefix: e.tokenPrefix ?? null,
      })),
    );
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`[PushLog] Failed to insert delivery logs: ${e.message}`);
  }
}

// ---- Expo chunked send with retry (5xx / network retried; 4xx fails immediately) ----
const EXPO_CHUNK_SIZE = 100;
const EXPO_RETRY_ATTEMPTS = 3;
const EXPO_RETRY_BASE_MS = 1000;

type ExpoItem = { status: string; message?: string; details?: { error?: string } };

async function sendExpoChunkWithRetry(
  messages: object[],
): Promise<ExpoItem[]> {
  let lastErr: Error = new Error("expo_send_failed");
  for (let attempt = 1; attempt <= EXPO_RETRY_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      if (resp.ok) {
        const json = await resp.json() as { data?: ExpoItem[] };
        return Array.isArray(json.data) ? json.data : (json.data ? [json.data as unknown as ExpoItem] : []);
      }
      const status = resp.status;
      if (status >= 400 && status < 500) {
        throw new Error(`expo_http_${status}`); // 4xx: non-retryable
      }
      // 5xx: retryable
      lastErr = new Error(`expo_http_${status}`);
      console.warn(`[Push Broadcast] Expo HTTP ${status} on attempt ${attempt}, will retry`);
    } catch (e: any) {
      if (e.message?.startsWith("expo_http_4")) throw e; // propagate 4xx immediately
      lastErr = e;
      console.warn(`[Push Broadcast] Expo network error on attempt ${attempt}: ${e.message}`);
    }
    if (attempt < EXPO_RETRY_ATTEMPTS) {
      await new Promise(res => setTimeout(res, EXPO_RETRY_BASE_MS * Math.pow(2, attempt - 1)));
    }
  }
  throw lastErr;
}

async function broadcastPush(
  dbHandle: typeof db,
  payload: PushPayload,
  dedupOptions?: { type: string; message: string },
): Promise<BroadcastResult> {
  const allRows = await dbHandle.select().from(deviceTokens).where(eq(deviceTokens.isInvalid, false));
  let totalRetries = 0;
  const errorCodes: string[] = [];

  // Pre-filter to exclude users who already received this notification in the last 24h
  // Run dedup queries in parallel (max 20 concurrent) for performance
  let eligibleUserIds: Set<number> | null = null;
  if (dedupOptions) {
    const uniqueUserIds = [...new Set(allRows.map(r => r.userId).filter((id): id is number => id !== null))];
    const DEDUP_CONCURRENCY = 20;
    const eligible = new Set<number>();
    for (let i = 0; i < uniqueUserIds.length; i += DEDUP_CONCURRENCY) {
      const batch = uniqueUserIds.slice(i, i + DEDUP_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(uid =>
          isNotifDuplicate(dbHandle, uid, dedupOptions.type, dedupOptions.message)
            .then(isDup => ({ uid, isDup }))
        )
      );
      for (const { uid, isDup } of batchResults) {
        if (!isDup) eligible.add(uid);
      }
    }
    eligibleUserIds = eligible;
  }

  const eligible = (r: (typeof allRows)[number]) =>
    !eligibleUserIds || (r.userId !== null && eligibleUserIds.has(r.userId));

  // Expo tokens from expoPushToken column
  const expoTokenPairs: Array<{ token: string; userId: number }> = allRows
    .filter(r => r.expoPushToken !== null && r.userId !== null && eligible(r))
    .map(r => ({ token: r.expoPushToken as string, userId: r.userId as number }));

  // Legacy: Expo-format tokens only in token column (expoPushToken is null)
  const legacyExpoPairs: Array<{ token: string; userId: number }> = allRows
    .filter(r => r.token !== null && isExpoTokenFormat(r.token) && r.expoPushToken === null && r.userId !== null && eligible(r))
    .map(r => ({ token: r.token as string, userId: r.userId as number }));

  // Raw FCM tokens (non-Expo format, no expoPushToken)
  const fcmPairs: Array<{ token: string; userId: number }> = allRows
    .filter(r => r.token !== null && !isExpoTokenFormat(r.token) && r.expoPushToken === null && r.userId !== null && eligible(r))
    .map(r => ({ token: r.token as string, userId: r.userId as number }));

  const sentUserIds = new Set<number>();
  let expoPushDeviceCount = 0;
  let fcmSent = 0;
  let fcmFailed = 0;

  // --- Expo batch send (main + legacy) — chunked ≤100 per request, retried on 5xx ---
  const allExpoPairs = [...expoTokenPairs, ...legacyExpoPairs];
  if (allExpoPairs.length > 0) {
    console.log(`[Push Broadcast] Expo sending to ${allExpoPairs.length} token(s) in chunks of ${EXPO_CHUNK_SIZE}`);
    // Process chunks sequentially; results accumulated per original index
    const allExpoResults: ExpoItem[] = [];
    for (let chunkStart = 0; chunkStart < allExpoPairs.length; chunkStart += EXPO_CHUNK_SIZE) {
      const chunkPairs = allExpoPairs.slice(chunkStart, chunkStart + EXPO_CHUNK_SIZE);
      const messages = chunkPairs.map(({ token }) => ({
        to: token,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        data: payload.data || { screen: "/(tabs)/notifications" },
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      }));
      try {
        const chunkResults = await sendExpoChunkWithRetry(messages);
        allExpoResults.push(...chunkResults);
      } catch (e: any) {
        const failCode = e.message?.startsWith("expo_http_") ? e.message : "network_error";
        console.error(`[Push Broadcast] Expo chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}] failed: ${failCode}`);
        errorCodes.push(failCode);
        // Fill placeholder failed results for this chunk so indices stay aligned
        for (const { userId } of chunkPairs) {
          allExpoResults.push({ status: "error", message: failCode, details: { error: failCode } });
          await logPushDelivery(dbHandle, [{ userId, channel: "expo", status: "failed", errorCode: failCode, title: payload.title }]);
        }
        continue;
      }
    }

    // Process results — indices aligned with allExpoPairs
    const staleExpoMain: string[] = [];
    const staleExpoLegacy: string[] = [];
    const expoLogEntries: Array<{ userId: number; token: string; status: string; errCode?: string }> = [];
    allExpoPairs.forEach(({ token, userId }, idx) => {
      const result = allExpoResults[idx];
      if (!result || result.status !== "error") {
        expoPushDeviceCount++;
        sentUserIds.add(userId);
        expoLogEntries.push({ userId, token, status: "sent" });
        console.log(`[Push Broadcast] Expo OK userId=${userId} token=${token.slice(0, 30)}...`);
      } else {
        const errCode = result.details?.error || result.message || "unknown";
        expoLogEntries.push({ userId, token, status: "failed", errCode });
        console.error(`[Push Broadcast] Expo FAILED userId=${userId} code=${errCode} token=${token.slice(0, 30)}...`);
        if (errCode === "DeviceNotRegistered") {
          if (idx < expoTokenPairs.length) staleExpoMain.push(token);
          else staleExpoLegacy.push(token);
        }
      }
    });
    console.log(`[Push Broadcast] Expo: ${expoPushDeviceCount}/${allExpoPairs.length} delivered, ${staleExpoMain.length + staleExpoLegacy.length} stale`);
    for (const staleToken of staleExpoMain) await markExpoPushTokenInvalid(dbHandle, staleToken, "DeviceNotRegistered");
    for (const staleToken of staleExpoLegacy) await markFcmTokenInvalid(dbHandle, staleToken, "DeviceNotRegistered");
    // Log only entries not already logged from chunk failures
    const pendingLogEntries = expoLogEntries.filter(e => {
      if (e.status !== "failed") return true;
      const errCode = e.errCode ?? "";
      return !errCode.startsWith("expo_http_") && errCode !== "network_error";
    });
    await logPushDelivery(dbHandle, pendingLogEntries.map(e => ({
      userId: e.userId,
      channel: "expo",
      status: e.status,
      errorCode: e.errCode,
      title: payload.title,
      tokenPrefix: e.token.slice(0, 30),
    })));
  }

  // --- FCM multicast for raw tokens — chunked ≤500 per request ---
  const FCM_CHUNK_SIZE = 500;
  if (fcmPairs.length > 0) {
    const fcmData: Record<string, string> = {};
    if (payload.data) Object.assign(fcmData, payload.data);
    console.log(`[Push Broadcast] FCM multicast to ${fcmPairs.length} raw token(s) in chunks of ${FCM_CHUNK_SIZE}`);
    // Track per-original-index results across chunks
    const fcmTokenResults: boolean[] = new Array(fcmPairs.length).fill(false);
    const fcmPerTokenErrorCodes: Array<string | null> = new Array(fcmPairs.length).fill(null);
    const fcmStaleTokens: Set<string> = new Set();

    for (let chunkStart = 0; chunkStart < fcmPairs.length; chunkStart += FCM_CHUNK_SIZE) {
      const chunkPairs = fcmPairs.slice(chunkStart, chunkStart + FCM_CHUNK_SIZE);
      const chunkTokens = chunkPairs.map(p => p.token);
      try {
        const result = await sendFcmMulticast(chunkTokens, payload.title, payload.body, fcmData, payload.imageUrl);
        fcmSent += result.success;
        fcmFailed += result.failure;
        totalRetries += result.totalRetries;
        errorCodes.push(...result.errorCodes);
        // Map chunk results back to global fcmPairs indices
        result.tokenResults.forEach((ok, chunkIdx) => {
          const globalIdx = chunkStart + chunkIdx;
          fcmTokenResults[globalIdx] = ok;
          fcmPerTokenErrorCodes[globalIdx] = result.perTokenErrorCodes[chunkIdx];
          if (ok) sentUserIds.add(fcmPairs[globalIdx].userId);
        });
        for (const staleToken of result.staleTokens) fcmStaleTokens.add(staleToken);
        console.log(`[Push Broadcast] FCM chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}]: ${result.success}/${chunkTokens.length} delivered`);
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error(`[Push Broadcast] FCM chunk [${chunkStart}..${chunkStart + chunkPairs.length - 1}] error:`, err.message);
        errorCodes.push("network_error");
        for (let ci = 0; ci < chunkPairs.length; ci++) {
          fcmPerTokenErrorCodes[chunkStart + ci] = "network_error";
        }
        await logPushDelivery(dbHandle, chunkPairs.map(({ userId }) => ({
          userId,
          channel: "fcm",
          status: "failed",
          errorCode: "network_error",
          title: payload.title,
        })));
      }
    }

    // Delete stale FCM tokens
    for (const staleToken of fcmStaleTokens) {
      const actualCode = fcmPerTokenErrorCodes[fcmPairs.findIndex(p => p.token === staleToken)] ?? "messaging/registration-token-not-registered";
      await markFcmTokenInvalid(dbHandle, staleToken, actualCode);
    }

    if (fcmSent + fcmFailed > 0) {
      console.log(`[Push Broadcast] FCM total: ${fcmSent}/${fcmPairs.length} delivered, ${fcmFailed} failed${totalRetries > 0 ? ` (retries: ${totalRetries})` : ""}${fcmStaleTokens.size > 0 ? `, ${fcmStaleTokens.size} stale` : ""}`);
    }

    // Build per-token log entries using exact per-token error codes (only for chunks that weren't separately logged)
    const fcmLogEntries = fcmPairs
      .map((pair, idx) => {
        const sent = fcmTokenResults[idx];
        const errCode = fcmPerTokenErrorCodes[idx];
        if (errCode === "network_error") return null; // already logged in chunk catch
        return {
          userId: pair.userId,
          channel: "fcm",
          status: sent ? "sent" : "failed",
          errorCode: sent ? undefined : (errCode ?? "unknown"),
          title: payload.title,
          tokenPrefix: pair.token.slice(0, 30),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (fcmLogEntries.length > 0) await logPushDelivery(dbHandle, fcmLogEntries);
  }

  return { expoPushDeviceCount, fcmSent, fcmFailed, sentUserIds, totalRetries, errorCodes };
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

async function sendPushToUser(
  db: any,
  userId: number,
  payload: PushPayload,
  phone?: string,
  opts?: { skipDedup?: boolean },
): Promise<{ expoSent: number; fcmSent: number; fcmFailed: number; totalRetries: number; errorCodes: string[]; skipped: boolean; skipReason?: "dedup" | "no_token" }> {
  let expoSent = 0;
  let fcmSent = 0;
  let fcmFailed = 0;
  let totalRetries = 0;
  const errorCodes: string[] = [];

  // --- Dedup check (skipped for explicit retries) ---
  if (!opts?.skipDedup) {
    const dedupType = payload.data?.type || "unknown";
    const isDup = await isNotifDuplicate(db, userId, dedupType, payload.body);
    if (isDup) {
      console.log(`[Push] Dedup skip userId=${userId} type=${dedupType} msg="${payload.body.slice(0, 40)}"`);
      return { expoSent: 0, fcmSent: 0, fcmFailed: 0, totalRetries: 0, errorCodes: [], skipped: true, skipReason: "dedup" };
    }
  }

  // --- Expo push tokens (expoPushToken column) ---
  const expoTokens = await getExpoTokensForUser(db, userId, phone);

  if (expoTokens.length > 0) {
    try {
      const expoPayload = expoTokens.map(to => ({
        to,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        ...(payload.data ? { data: payload.data } : {}),
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      }));
      console.log(`[Push] Expo sending to ${expoTokens.length} token(s) userId=${userId}`);
      const expoRes = await expoFetchWithRetry(expoPayload);
      if (!expoRes.ok) {
        const errText = await expoRes.text().catch(() => "");
        console.error(`[Push] Expo API HTTP ${expoRes.status}:`, errText);
        errorCodes.push(`expo_http_${expoRes.status}`);
      } else {
        const expoJson = await expoRes.json() as { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
        const items = Array.isArray(expoJson.data) ? expoJson.data : (expoJson.data ? [expoJson.data] : []);
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item || item.status !== "error") {
            expoSent++;
            console.log(`[Push] Expo OK userId=${userId} token=${expoTokens[idx]?.slice(0, 30)}...`);
          } else {
            const errCode = item.details?.error || item.message || "unknown";
            errorCodes.push(errCode);
            console.error(`[Push] Expo FAILED userId=${userId} code=${errCode} token=${expoTokens[idx]?.slice(0, 30)}...`);
            if (EXPO_TOKEN_FATAL_ERRORS.has(errCode) && expoTokens[idx]) {
              await markExpoPushTokenInvalid(db, expoTokens[idx], errCode);
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[Push] Expo send error:", e.message);
      errorCodes.push("network issue");
    }
  }

  // --- Token column fallback: classify by format, not by column presence ---
  // ExponentPushToken[...] → Expo API; anything else → Firebase Admin FCM
  let legacyExpoAttempted = 0; // track for delivery log coverage
  try {
    const allRows = await db
      .select({ token: deviceTokens.token, expoPushToken: deviceTokens.expoPushToken })
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isInvalid, false)));

    // Legacy rows: token column has an Expo-format string but expoPushToken is null
    const legacyExpoTokens: string[] = allRows
      .filter((r: any) => r.token && isExpoTokenFormat(r.token) && !r.expoPushToken)
      .map((r: any) => r.token as string)
      .filter((t: string) => !expoTokens.includes(t)); // avoid double-sending
    legacyExpoAttempted = legacyExpoTokens.length;
    if (legacyExpoTokens.length > 0) {
      console.log(`[Push] Expo (legacy token-col) sending to ${legacyExpoTokens.length} token(s) userId=${userId}`);
      const legacyPayload = legacyExpoTokens.map(to => ({
        to,
        sound: "default",
        channelId: "alburhan-push",
        priority: "high",
        title: payload.title,
        body: payload.body,
        ...(payload.data ? { data: payload.data } : {}),
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      }));
      let legacyRes: Response | null = null;
      try {
        legacyRes = await expoFetchWithRetry(legacyPayload);
      } catch (fetchErr: any) {
        console.error(`[Push] Expo (legacy) send error: ${fetchErr.message}`);
        errorCodes.push(fetchErr.message ?? "expo_send_failed");
      }
      if (legacyRes?.ok) {
        const legacyJson = await legacyRes.json() as { data?: Array<{ status: string; message?: string; details?: { error?: string } }> };
        const items = Array.isArray(legacyJson.data) ? legacyJson.data : (legacyJson.data ? [legacyJson.data] : []);
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item || item.status !== "error") {
            expoSent++;
          } else {
            const errCode = item.details?.error || item.message || "unknown";
            errorCodes.push(errCode);
            console.error(`[Push] Expo (legacy) FAILED userId=${userId} code=${errCode} token=${legacyExpoTokens[idx]?.slice(0, 30)}...`);
            if (EXPO_TOKEN_FATAL_ERRORS.has(errCode) && legacyExpoTokens[idx]) {
              await markFcmTokenInvalid(db, legacyExpoTokens[idx], errCode);
            }
          }
        }
      } else if (legacyRes !== null) {
        const errText = await legacyRes.text().catch(() => '');
        console.error(`[Push] Expo (legacy) API HTTP ${legacyRes.status}: ${errText.slice(0, 200)}`);
        errorCodes.push(`expo_http_${legacyRes.status}`);
      }
    }

    // Raw FCM tokens: token column has a non-Expo format AND no expoPushToken
    const rawFcmTokens: string[] = allRows
      .filter((r: any) => r.token && !isExpoTokenFormat(r.token) && !r.expoPushToken)
      .map((r: any) => r.token as string);

    if (rawFcmTokens.length > 0) {
      console.log(`[Push] FCM direct sending to ${rawFcmTokens.length} raw token(s) userId=${userId}`);
      const fcmData: Record<string, string> = {};
      if (payload.data) Object.assign(fcmData, payload.data);
      const result = await sendFcmMulticast(rawFcmTokens, payload.title, payload.body, fcmData, payload.imageUrl);
      fcmSent = result.success;
      fcmFailed = result.failure;
      totalRetries += result.totalRetries;
      errorCodes.push(...result.errorCodes);
      // Mark stale FCM tokens as invalid
      for (const staleToken of result.staleTokens) {
        await markFcmTokenInvalid(db, staleToken, result.errorCodes[0] || "messaging/registration-token-not-registered");
      }
    }

    if (expoTokens.length === 0 && legacyExpoTokens.length === 0 && rawFcmTokens.length === 0) {
      console.warn(`[Push] No device token for userId=${userId} phone=${phone ?? "n/a"} — skipping`);
      return { expoSent: 0, fcmSent: 0, fcmFailed: 0, totalRetries: 0, errorCodes: [], skipped: true, skipReason: "no_token" };
    }
  } catch (e: any) {
    console.error("[Push] FCM direct send error:", e.message);
  }

  const totalSent = expoSent + fcmSent;
  console.log(
    `[Push] Summary userId=${userId}: expo=${expoSent} fcm=${fcmSent} fcmFailed=${fcmFailed}` +
    ` total=${totalSent} errors=${errorCodes.length > 0 ? errorCodes.join(",") : "none"}` +
    (payload.imageUrl ? " (with image)" : ""),
  );

  // Persist delivery log entries
  const deliveryEntries: Array<{ userId: number; channel: string; status: string; errorCode?: string; title?: string; tokenPrefix?: string }> = [];
  const totalExpoAttempted = expoTokens.length + legacyExpoAttempted;
  if (expoSent > 0) {
    deliveryEntries.push({ userId, channel: "expo", status: "sent", title: payload.title });
  }
  if (expoSent === 0 && totalExpoAttempted > 0) {
    deliveryEntries.push({ userId, channel: "expo", status: "failed", errorCode: errorCodes[0] ?? "unknown", title: payload.title });
  }
  if (fcmSent > 0) {
    deliveryEntries.push({ userId, channel: "fcm", status: "sent", title: payload.title });
  }
  if (fcmFailed > 0) {
    deliveryEntries.push({ userId, channel: "fcm", status: "failed", errorCode: errorCodes.find(c => c.startsWith("messaging/")) ?? errorCodes[0], title: payload.title });
  }
  await logPushDelivery(db, deliveryEntries);

  return { expoSent, fcmSent, fcmFailed, totalRetries, errorCodes, skipped: false };
}

const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const fallbackOtpAttempts = new Map<string, { count: number; windowStart: number }>();
const FALLBACK_OTP_MAX_PER_HOUR = 3;
const FALLBACK_OTP_WINDOW_MS = 60 * 60 * 1000;

function canShowFallbackOtp(phone: string): boolean {
  const now = Date.now();
  const record = fallbackOtpAttempts.get(phone);
  if (!record || now - record.windowStart > FALLBACK_OTP_WINDOW_MS) {
    fallbackOtpAttempts.set(phone, { count: 1, windowStart: now });
    return true;
  }
  if (record.count >= FALLBACK_OTP_MAX_PER_HOUR) {
    console.warn(`[OTP Fallback] Rate limit exceeded for ${phone} — ${record.count} attempts in last hour`);
    return false;
  }
  record.count += 1;
  return true;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return convert(Math.round(num)) + " Rupees Only";
}

function formatINR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function generateInvoiceNumber(bookingId: number): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  return `ABTTH${yy}${mm}${bookingId.toString().padStart(2, "0")}`;
}

async function generateBookingPdf(bookingId: number, res: import("express").Response): Promise<void> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) { res.status(404).send("Invoice not found"); return; }

  const [pkg] = await db.select().from(packages).where(eq(packages.id, booking.packageId));
  const [user] = await db.select().from(users).where(eq(users.id, booking.userId));
  const allPayments = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
  const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

  let invoiceNum = booking.invoiceNumber;
  if (!invoiceNum) {
    invoiceNum = generateInvoiceNumber(bookingId);
    await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
  }

  const totalAmount = parseFloat(booking.totalAmount);
  const numberOfPeople = booking.numberOfPeople;
  const ratePerPerson = totalAmount / numberOfPeople;

  const gstRate = 0.05;
  const tcsRate = 0.05;
  const baseAmount = totalAmount / (1 + gstRate);
  const gstAmount = totalAmount - baseAmount;
  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;
  const tcsAmount = totalAmount * tcsRate;
  const grandTotal = totalAmount + tcsAmount;

  const bookingDate = booking.bookingDate ? new Date(booking.bookingDate) : new Date();
  const dueDate = new Date(bookingDate);
  dueDate.setDate(dueDate.getDate() + 30);

  const customerName = booking.contactName || user?.name || "";
  const customerPhone = booking.contactPhone || user?.phone || "";
  const customerEmail = booking.contactEmail || user?.email || "";
  const customerAddress = booking.address || "";
  const serviceName = pkg ? `${pkg.type === 'hajj' ? 'Hajj' : 'Umrah'} - ${pkg.name}` : 'Tour Service';
  const roomLabel = booking.roomType || '';

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const filename = `invoice-${invoiceNum}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const green = "#047857";
  const pageWidth = doc.page.width - 80;

  doc.fontSize(18).fillColor(green).font("Helvetica-Bold").text("ALBURHAN TOURS & TRAVELS", 40, 40);
  doc.fontSize(9).fillColor("#555").font("Helvetica")
    .text("8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur, Madhya Pradesh, 450331", 40)
    .text("GSTIN: 23AAVFA3225C1ZW  |  Mobile: 9893225590  |  PAN: AAVFA3225C")
    .text("Email: info@alburhantravels.com");

  const metaX = 400;
  doc.fontSize(9).fillColor("#333").font("Helvetica-Bold").text("TAX INVOICE", metaX, 40);
  doc.font("Helvetica").fontSize(9).fillColor("#555")
    .text(`Invoice No: ${invoiceNum}`, metaX)
    .text(`Date: ${bookingDate.toLocaleDateString("en-IN")}`)
    .text(`Due: ${dueDate.toLocaleDateString("en-IN")}`);

  doc.moveTo(40, 130).lineTo(555, 130).strokeColor(green).lineWidth(2).stroke();

  doc.moveDown(0.5);
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("BILL TO", 40, 140);
  doc.fontSize(10).fillColor("#333").font("Helvetica-Bold").text(customerName, 40, 155);
  doc.fontSize(9).fillColor("#555").font("Helvetica")
    .text(customerAddress || " ", 40)
    .text(`Mobile: ${customerPhone}  |  Email: ${customerEmail}`);

  doc.moveTo(40, 210).lineTo(555, 210).strokeColor("#ddd").lineWidth(1).stroke();

  const tableTop = 220;
  const colWidths = [30, 190, 60, 85, 65, 85];
  const colX = [40, 70, 260, 320, 405, 470];
  const headers = ["#", "Services", "SAC", "Rate", "Tax", "Amount"];

  doc.rect(40, tableTop, pageWidth, 18).fillColor(green).fill();
  doc.fontSize(9).fillColor("#fff").font("Helvetica-Bold");
  headers.forEach((h, i) => {
    doc.text(h, colX[i], tableTop + 4, { width: colWidths[i], align: i >= 3 ? "right" : "left" });
  });

  let rowY = tableTop + 20;
  doc.fillColor("#333").font("Helvetica").fontSize(9);
  for (let i = 0; i < numberOfPeople; i++) {
    const traveler = booking.travelers?.[i];
    const travelerName = traveler?.name ?? `Person ${i + 1}`;
    const ageGender = [
      traveler?.age ? `Age: ${traveler.age}` : '',
      traveler?.gender ? `Gender: ${traveler.gender}` : '',
    ].filter(Boolean).join(', ');
    const dob = traveler?.dateOfBirth ? `DOB: ${traveler.dateOfBirth}` : '';
    const passport = traveler?.passportNumber ? `Passport: ${traveler.passportNumber}` : '';
    const details = [ageGender, dob, passport, roomLabel].filter(Boolean).join(' | ');
    const lineHeight = details ? 30 : 20;

    doc.text(String(i + 1), colX[0], rowY, { width: colWidths[0] });
    doc.font("Helvetica-Bold").text(serviceName, colX[1], rowY, { width: colWidths[1] });
    doc.font("Helvetica").fontSize(8).fillColor("#444").text(travelerName, colX[1], rowY + 11, { width: colWidths[1] });
    if (details) {
      doc.fillColor("#777").text(details, colX[1], rowY + 20, { width: colWidths[1] });
    }
    doc.fillColor("#333").fontSize(9);
    doc.font("Helvetica").text("998555", colX[2], rowY, { width: colWidths[2] });
    doc.text(`Rs ${formatINR(ratePerPerson)}`, colX[3], rowY, { width: colWidths[3], align: "right" });
    doc.text(`Rs ${formatINR(gstAmount / numberOfPeople)}`, colX[4], rowY, { width: colWidths[4], align: "right" });
    doc.text(`Rs ${formatINR(ratePerPerson + gstAmount / numberOfPeople)}`, colX[5], rowY, { width: colWidths[5], align: "right" });

    rowY += lineHeight;
    doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor("#eee").lineWidth(0.5).stroke();
  }

  doc.fontSize(9).fillColor("#555").font("Helvetica")
    .text("TCS @5.0%", colX[4], rowY + 4, { width: colWidths[4], align: "right" });
  doc.fillColor("#333")
    .text(`Rs ${formatINR(tcsAmount)}`, colX[5], rowY + 4, { width: colWidths[5], align: "right" });

  rowY += 22;
  doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor("#ddd").lineWidth(1).stroke();

  const totalsY = rowY + 10;
  const totals = [
    ["TOTAL", `Rs ${formatINR(gstAmount + tcsAmount)}`, `Rs ${formatINR(grandTotal)}`],
    ["RECEIVED AMOUNT", "", `Rs ${formatINR(totalPaid)}`],
    ["PREVIOUS BALANCE", "", `Rs 0.00`],
    ["CURRENT BALANCE", "", `Rs ${formatINR(grandTotal - totalPaid)}`],
  ];

  let tRowY = totalsY;
  totals.forEach(([label, tax, amount], idx) => {
    if (idx === 3) {
      doc.rect(40, tRowY - 2, pageWidth, 18).fillColor("#fef3c7").fill();
    }
    doc.fontSize(9).fillColor(idx === 3 ? "#92400e" : "#333").font(idx === 3 ? "Helvetica-Bold" : "Helvetica")
      .text(label, 40, tRowY, { width: 300, align: "right" });
    if (tax) doc.text(tax, colX[5] - 90, tRowY, { width: 90, align: "right" });
    doc.text(amount, colX[5], tRowY, { width: colWidths[5], align: "right" });
    tRowY += 18;
  });

  tRowY += 8;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("GST Breakdown", 40, tRowY);
  tRowY += 16;
  const gstHeaders = ["HSN/SAC", "Taxable Value", "CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount", "Total Tax"];
  const gstColW = [55, 85, 65, 80, 65, 80, 65];
  const gstColX = [40];
  for (let i = 1; i < gstColW.length; i++) gstColX.push(gstColX[i - 1] + gstColW[i - 1]);

  doc.rect(40, tRowY, pageWidth, 16).fillColor("#e6f7ef").fill();
  doc.fontSize(8).fillColor("#333").font("Helvetica-Bold");
  gstHeaders.forEach((h, i) => doc.text(h, gstColX[i], tRowY + 3, { width: gstColW[i], align: "center" }));
  tRowY += 18;
  doc.font("Helvetica").fillColor("#333");
  const gstRow = ["998555", `Rs ${formatINR(baseAmount)}`, "2.5%", `Rs ${formatINR(cgst)}`, "2.5%", `Rs ${formatINR(sgst)}`, `Rs ${formatINR(gstAmount)}`];
  gstRow.forEach((v, i) => doc.text(v, gstColX[i], tRowY, { width: gstColW[i], align: "center" }));

  tRowY += 20;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 8;
  doc.fontSize(9).fillColor("#333").font("Helvetica-Bold").text("Total Amount (in words): ", 40, tRowY, { continued: true });
  doc.font("Helvetica").text(numberToWords(grandTotal));

  tRowY += 30;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("Bank Details", 40, tRowY);
  const bankRows = [
    ["Name", "HDFC BANK LTD"],
    ["IFSC Code", "HDFC0001749"],
    ["Account No.", "50200011397336"],
    ["Bank", "HDFC Bank, BURHANPUR"],
  ];
  tRowY += 16;
  doc.fontSize(9);
  bankRows.forEach(([k, v]) => {
    doc.fillColor("#555").font("Helvetica-Bold").text(k, 40, tRowY, { width: 80 });
    doc.fillColor("#333").font("Helvetica").text(v, 125, tRowY);
    tRowY += 14;
  });

  tRowY += 20;
  doc.moveTo(40, tRowY).lineTo(555, tRowY).strokeColor("#ddd").lineWidth(0.5).stroke();
  tRowY += 10;
  doc.fontSize(9).fillColor("#555").font("Helvetica").text("Authorised Signatory For", 380, tRowY + 30, { align: "center", width: 175 });
  doc.fontSize(10).fillColor(green).font("Helvetica-Bold").text("ALBURHAN TOURS & TRAVELS", 380, tRowY + 44, { align: "center", width: 175 });

  tRowY += 70;
  if (tRowY < doc.page.height - 60) {
    doc.rect(40, tRowY, pageWidth, 28).fillColor(green).fill();
    doc.fontSize(9).fillColor("#fff").font("Helvetica")
      .text("AL BURHAN TOURS & TRAVELS | GSTIN: 23AAVFA3225C1ZW | Phone: +91 9893225590 | www.alburhantravels.com", 40, tRowY + 8, { width: pageWidth, align: "center" });
  }
  doc.end();
}

function sanitizeDltVar(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x00-\x7F]/g, "")
    .trim();
}

async function sendOtpSmsFast2SMS(phone: string, otpCode: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping OTP SMS");
    return false;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ALBURH&message=164844&variables_values=${encodeURIComponent(otpCode + "|")}&flash=0&numbers=${phone}`;
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS OTP DLT] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS OTP DLT] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS OTP DLT] Error:", error);
    return false;
  }
}

async function sendBookingDltSms(phone: string, name: string, packageName: string, amount: string, invoiceUrl: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS DLT] API key not configured, skipping booking SMS");
    return false;
  }
  try {
    const bookingId = invoiceUrl.split("/i/").pop() || invoiceUrl;
    const safeName = sanitizeDltVar(name);
    const safePackage = sanitizeDltVar(packageName);
    const variables = `${safeName}|${safePackage}|${bookingId}|`;
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=ABURHA&message=211790&variables_values=${encodeURIComponent(variables)}&flash=0&numbers=${phone}`;
    console.log(`[Fast2SMS DLT Booking] Sending to ${phone} | bookingId="${bookingId}" (${bookingId.length} chars)`);
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS DLT Booking] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS DLT Booking] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS DLT Booking] Error:", error);
    return false;
  }
}

async function sendSmsFast2SMS(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log("[Fast2SMS] API key not configured, skipping free-text SMS");
    return false;
  }
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodeURIComponent(message)}&flash=0&numbers=${phone}`;
    console.log(`[Fast2SMS Quick] Sending free-text SMS to ${phone}`);
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    console.log("[Fast2SMS Quick] Response:", JSON.stringify(data));
    if (data.return === true) return true;
    console.log("[Fast2SMS Quick] Failed:", data.message);
    return false;
  } catch (error) {
    console.error("[Fast2SMS Quick] Error:", error);
    return false;
  }
}

const WHATSAPP_HEADER_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Kaaba_mirror_edit_jj.jpg/640px-Kaaba_mirror_edit_jj.jpg";
const WHATSAPP_PHONE_NUMBER_ID = "965912196611113";

async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<{ success: boolean; raw: any }> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) {
    console.log("[Meta WhatsApp] Token not configured, skipping template");
    return { success: false, raw: { error: "Token not configured" } };
  }
  const to = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: languageCode }, components },
        }),
      }
    );
    const httpStatus = response.status;
    const data = await response.json() as any;
    const msgId = data.messages?.[0]?.id;
    const msgStatus = data.messages?.[0]?.message_status;
    console.log(`[Meta WhatsApp Template] ${templateName} to ${to} | http=${httpStatus} | status=${msgStatus || "n/a"} | id=${msgId || "none"} | full=${JSON.stringify(data)}`);
    const success = !!msgId && msgStatus === "accepted";
    return { success, raw: data };
  } catch (error: any) {
    console.error("[Meta WhatsApp Template] Error:", error);
    return { success: false, raw: { error: error.message } };
  }
}

async function sendWhatsAppTemplateBool(
  phone: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<boolean> {
  const result = await sendWhatsAppTemplate(phone, templateName, languageCode, components);
  return result.success;
}

async function sendWhatsAppOtpTemplate(phone: string, otpCode: string): Promise<boolean> {
  return sendWhatsAppTemplateBool(phone, "alburhan_login_otp", "en_US", [
    { type: "body", parameters: [{ type: "text", text: otpCode }] },
    { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: otpCode }] },
  ]);
}

async function sendWhatsAppBookingTemplate(phone: string, customerName: string): Promise<boolean> {
  return sendWhatsAppTemplateBool(phone, "booking", "en_GB", [
    { type: "header", parameters: [{ type: "image", image: { link: WHATSAPP_HEADER_IMAGE } }] },
    { type: "body", parameters: [{ type: "text", text: customerName }] },
  ]);
}

async function sendWhatsAppConfirmationTemplate(
  phone: string,
  customerName: string,
  packageName: string,
  amountPaid: string,
  invoiceUrl: string
): Promise<boolean> {
  const bodyParams = [
    { type: "text", text: customerName },
    { type: "text", text: packageName },
    { type: "text", text: amountPaid },
    { type: "text", text: invoiceUrl },
  ];
  console.log(`[WhatsApp conformation template] vars(${bodyParams.length}): [1]="${customerName}" [2]="${packageName}" [3]="${amountPaid}" [4]="${invoiceUrl.substring(0, 60)}"`);
  return sendWhatsAppTemplateBool(phone, "conformation", "en_GB", [
    { type: "body", parameters: bodyParams },
  ]);
}

async function sendWhatsAppBotBee(phone: string, message: string): Promise<{ sent: boolean; blocked: boolean }> {
  const apiKey = process.env.BOTBEE_API_KEY || process.env.BOTBEE_API_TOKEN || process.env.BOTBEE_WHATSAPP_API_KEY;
  if (!apiKey) {
    console.log("[BotBee] API key not configured, skipping WhatsApp");
    return { sent: false, blocked: false };
  }
  const phoneNumberId = process.env.BOTBEE_PHONE_NUMBER_ID || WHATSAPP_PHONE_NUMBER_ID;
  const phoneNumber = phone.startsWith("91") ? phone : `91${phone}`;
  try {
    const response = await fetch("https://app.botbee.io/api/v1/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiToken: apiKey,
        phone_number_id: phoneNumberId,
        message: message,
        phone_number: phoneNumber,
      }),
    });
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      console.log("[BotBee] Response:", JSON.stringify(data));
      const blocked = data.status === "0" && data.message?.includes("24 hour");
      if (blocked) {
        console.log("[BotBee] 24-hour window restriction — will use template fallback");
      }
      return { sent: data.status === "1", blocked };
    } catch {
      console.log("[BotBee] Non-JSON response:", text.substring(0, 200));
      return { sent: false, blocked: false };
    }
  } catch (error) {
    console.error("[BotBee] Error:", error);
    return { sent: false, blocked: false };
  }
}

async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("[Email] EMAIL_USER or EMAIL_PASS not configured, skipping email");
      return false;
    }
    await transporter.sendMail({
      from: `"AL BURHAN TOURS & TRAVELS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: htmlBody,
    });
    console.log(`[Email] Sent to ${to}`);
    return true;
  } catch (error) {
    console.error("[Email] Error:", error);
    return false;
  }
}

// Classify push notification error codes into human-readable failure reasons.
function classifyPushError(errorCodes: string[], isNetworkError = false): string {
  if (isNetworkError) return "network issue";
  const staleMarkers = ["DeviceNotRegistered", "InvalidCredentials", "messaging/registration-token-not-registered", "messaging/invalid-registration-token", "registration-token-not-registered"];
  const firebaseMarkers = ["messaging/internal-error", "messaging/server-unavailable", "messaging/unavailable", "messaging/quota-exceeded"];
  if (errorCodes.some(c => staleMarkers.some(s => c.includes(s)))) return "invalid token";
  if (errorCodes.some(c => firebaseMarkers.some(f => c.includes(f)))) return "firebase error";
  if (errorCodes.length > 0) return "firebase error";
  return "push delivery failed";
}

// Shared helper: resolve authenticated userId from session or X-User-Id/X-User-Token headers.
// Used by KYC routes and other endpoints that support both auth mechanisms.
async function resolveUserId(req: any): Promise<number | undefined> {
  if (req.session?.userId) return req.session.userId as number;
  const headerUserId = req.headers["x-user-id"];
  const headerToken = req.headers["x-user-token"];
  const parsedId = headerUserId !== undefined ? Number(headerUserId) : NaN;
  if (Number.isInteger(parsedId) && parsedId > 0 && typeof headerToken === "string") {
    if (headerToken.length === 64 && verifyUserToken(parsedId, headerToken)) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedId));
      if (u) return u.id;
    }
  }
  return undefined;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/admin", (req: any, res: any, next: any) => {
    if (req.session && req.session.adminLoggedIn) return next();
    return res.status(401).json({ success: false, error: "Unauthorized" });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, phone, password } = req.body;
      if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, error: "All fields are required" });
      }
      const existingEmail = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this email already exists" });
      }
      const existingPhone = await db.select().from(users).where(eq(users.phone, phone));
      if (existingPhone.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this phone number already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        name,
        email,
        phone,
        password: hashedPassword,
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      (req as any).session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      if (user.email === "test@alburhantravels.com") {
        console.log("[Demo] Login success");
      }
      const { password: _, ...userWithoutPassword } = user;
      (req as any).session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const otp = generateOtp();
      otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      const sent = await sendOtpSmsFast2SMS(phone, otp);
      console.log(`[OTP] Generated OTP ${otp} for phone ${phone}, SMS sent: ${sent}`);
      if (!sent) {
        return res.status(500).json({ success: false, error: "Failed to send SMS. Please try WhatsApp or register directly with email." });
      }
      res.json({ success: true, message: "OTP sent via SMS" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/send-whatsapp-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const existing = otpStore.get(phone);
      let otp: string;
      if (existing && existing.expiresAt > Date.now()) {
        otp = existing.otp;
      } else {
        otp = generateOtp();
        otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      }
      const whatsappSent = await sendWhatsAppOtpTemplate(phone, otp);
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      console.log(`[OTP] Registration OTP for ${phone} — WhatsApp template: ${whatsappSent}, SMS: ${smsSent}`);
      if (!whatsappSent && !smsSent) {
        return res.status(500).json({ success: false, error: "Failed to send OTP via WhatsApp and SMS. Please register directly with email instead." });
      }
      const method = whatsappSent ? "WhatsApp" : "SMS";
      res.json({ success: true, message: `OTP sent via ${method}` });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp, name, email, password } = req.body;
      if (!phone || !otp) {
        return res.status(400).json({ success: false, error: "Phone and OTP are required" });
      }
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: "Name, email, and password are required" });
      }
      const stored = otpStore.get(phone);
      if (!stored) {
        return res.status(400).json({ success: false, error: "No OTP found for this phone. Please request a new OTP." });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(phone);
        return res.status(400).json({ success: false, error: "OTP has expired. Please request a new OTP." });
      }
      if (stored.otp !== otp) {
        return res.status(400).json({ success: false, error: "Invalid OTP" });
      }
      otpStore.delete(phone);
      const existingEmail = await db.select().from(users).where(eq(users.email, email));
      if (existingEmail.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this email already exists" });
      }
      const existingPhone = await db.select().from(users).where(eq(users.phone, phone));
      if (existingPhone.length > 0) {
        return res.status(400).json({ success: false, error: "An account with this phone number already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        name,
        email,
        phone,
        password: hashedPassword,
      }).returning();
      const { password: _, ...userWithoutPassword } = user;
      (req as any).session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/login-with-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required" });
      }
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (!user) {
        return res.status(404).json({ success: false, errorCode: "PHONE_NOT_REGISTERED", error: "Phone not registered. Please create an account first." });
      }
      // Demo phone: skip delivery entirely and return the demo OTP in-app
      if (phone === "9000000000") {
        console.log("[Demo] OTP login requested for demo phone — skipping delivery, returning 123456 in-app");
        return res.json({ success: true, fallbackOtp: "123456", deliveryFailed: true, message: "Demo OTP" });
      }
      const otp = generateOtp();
      otpStore.set(`login_${phone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
      const smsSent = await sendOtpSmsFast2SMS(phone, otp);
      const whatsappSent = await sendWhatsAppOtpTemplate(phone, otp);
      console.log(`[OTP] Login OTP for ${phone} — SMS: ${smsSent}, WhatsApp: ${whatsappSent}`);
      if (!smsSent && !whatsappSent) {
        if (canShowFallbackOtp(phone)) {
          console.warn(`[OTP] Both channels failed for ${phone} — showing in-app fallback OTP (rate-limited: max ${FALLBACK_OTP_MAX_PER_HOUR}/hr)`);
          return res.json({ success: true, message: "OTP delivery failed", fallbackOtp: otp, deliveryFailed: true });
        } else {
          console.error(`[OTP] Both channels failed for ${phone} AND fallback rate limit exceeded`);
          return res.status(503).json({ success: false, error: "Could not deliver OTP. Please use email and password to sign in or contact support: 9893225590" });
        }
      }
      const channels: string[] = [];
      if (smsSent) channels.push("SMS");
      if (whatsappSent) channels.push("WhatsApp");
      res.json({ success: true, message: `OTP sent via ${channels.join(" & ")}` });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/verify-login-otp", async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) {
        return res.status(400).json({ success: false, error: "Phone and OTP are required" });
      }
      const DEMO_OTP = "123456";
      const isDemoOtp = otp === DEMO_OTP;
      if (!isDemoOtp) {
        const stored = otpStore.get(`login_${phone}`);
        if (!stored) {
          return res.status(400).json({ success: false, error: "No OTP found. Please request a new OTP." });
        }
        if (Date.now() > stored.expiresAt) {
          otpStore.delete(`login_${phone}`);
          return res.status(400).json({ success: false, error: "OTP has expired. Please request a new OTP." });
        }
        if (stored.otp !== otp) {
          return res.status(400).json({ success: false, error: "Invalid OTP" });
        }
        otpStore.delete(`login_${phone}`);
      }
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      (req as any).session.userId = user.id;
      res.json({ success: true, user: { ...userWithoutPassword, userToken: signUserId(user.id) } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/auth/logout", (req: any, res: any) => {
    req.session.userId = undefined;
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: any, res: any) => {
    const userId: number | undefined = req.session?.userId;
    if (!userId) return res.json({ success: false });
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.json({ success: false });
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, userToken: signUserId(user.id) } });
    } catch (error) {
      res.json({ success: false });
    }
  });

  /**
   * Build the public base URL for absolute URLs (e.g. stored image URLs).
   * Priority:
   *   1. Incoming HTTP request host (HIGHEST — always correct for dev and production).
   *      With trust proxy=1, Express uses X-Forwarded-Host from Replit's proxy, giving
   *      the real external domain (e.g. al-burhan-tours-and-travels.replit.app in prod).
   *      This beats env vars because env vars may be wrong/missing in production.
   *   2. EXPO_PUBLIC_DOMAIN env var (strip any trailing port — fallback when no request)
   *   3. REPLIT_DEV_DOMAIN env var (strip port — last env var fallback)
   *   4. 'https://localhost' — absolute last resort
   * Note: INVOICE_BASE_URL is intentionally excluded here — it may be a short-link
   * domain scoped only for invoice URLs and must not influence package image URLs.
   */
  function getBaseUrl(_req?: Request): string {
    // ALWAYS prefer the incoming request's host — it is the actual external domain
    // the request arrived on, correct in both dev and production environments.
    if (_req) {
      // With trust proxy=1, req.protocol respects X-Forwarded-Proto (always 'https' on Replit)
      const protocol = _req.protocol || 'https';
      // Replit's reverse proxy sets X-Forwarded-Host; trust proxy=1 means
      // req.hostname already resolves it. Fall back to raw Host header.
      const forwardedHost = _req.get('x-forwarded-host');
      const rawHost = (_req.hostname || _req.get('host') || '').split(':')[0];
      const host = (forwardedHost ? forwardedHost.split(',')[0].trim() : rawHost).split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `${protocol}://${host}`;
      }
    }
    // Fallback when no request context (e.g. background jobs)
    if (process.env.EXPO_PUBLIC_DOMAIN) {
      const domain = process.env.EXPO_PUBLIC_DOMAIN.replace(/:\d+$/, '');
      return `https://${domain}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      const devDomain = process.env.REPLIT_DEV_DOMAIN.replace(/:\d+$/, '');
      return `https://${devDomain}`;
    }
    return 'https://localhost';
  }

  function toImageObjects(rawUrls: (string | PackageImage | Record<string, unknown>)[]): PackageImage[] {
    return rawUrls.map((item, idx) => {
      if (typeof item === 'string') {
        return { url: item, isMain: idx === 0, position: 'center' as const };
      }
      // Harden: fill in any missing fields for object entries from raw DB JSON
      const obj: Record<string, unknown> = { ...item as Record<string, unknown> };
      if (obj['isMain'] === undefined || obj['isMain'] === null) obj['isMain'] = idx === 0;
      if (!obj['position']) obj['position'] = 'center';
      return obj as unknown as PackageImage;
    });
  }

  function normalizePackageImages(pkg: Record<string, unknown>) {
    const rawUrls: (string | Record<string, unknown>)[] = Array.isArray(pkg['imageUrls'])
      ? (pkg['imageUrls'] as (string | Record<string, unknown>)[])
      : [];
    if (rawUrls.length === 0 && pkg['imageUrl']) {
      pkg['imageUrls'] = [{ url: pkg['imageUrl'], isMain: true, position: 'center' }];
    } else {
      pkg['imageUrls'] = toImageObjects(rawUrls);
    }
    const imageUrls = pkg['imageUrls'] as PackageImage[];
    const mainImg = imageUrls.find(img => img.isMain) || imageUrls[0];
    if (mainImg) {
      pkg['imageUrl'] = mainImg.url;
    }
    return pkg;
  }

  app.get("/api/packages", async (req, res) => {
    try {
      const { type, minPrice, maxPrice } = req.query;
      let allPackages = await withDbRetry(() => db.select().from(packages));
      let filtered = allPackages;
      if (type && type !== "all") {
        filtered = filtered.filter(p => p.type === type);
      }
      if (minPrice) {
        filtered = filtered.filter(p => parseFloat(p.price) >= parseFloat(minPrice as string));
      }
      if (maxPrice) {
        filtered = filtered.filter(p => parseFloat(p.price) <= parseFloat(maxPrice as string));
      }
      res.json({ success: true, packages: filtered.map(normalizePackageImages) });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/packages/:id", async (req, res) => {
    try {
      const [pkg] = await withDbRetry(() => db.select().from(packages).where(eq(packages.id, parseInt(req.params.id))));
      if (!pkg) {
        return res.status(404).json({ success: false, error: "Package not found" });
      }
      res.json({ success: true, package: normalizePackageImages(pkg) });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/packages", async (req, res) => {
    try {
      const { type, name, category, description, duration, price, imageUrl, availableSeats, departureDate, returnDate, featured, inclusions, exclusions } = req.body;
      if (!type || !name || !description || !duration || !price || !availableSeats || !departureDate || !returnDate) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }
      const [pkg] = await db.insert(packages).values({
        type,
        name,
        category: category || null,
        description,
        duration,
        price: price.toString(),
        imageUrl: imageUrl || null,
        availableSeats: parseInt(availableSeats),
        departureDate: new Date(departureDate),
        returnDate: new Date(returnDate),
        featured: !!featured,
        inclusions: inclusions || [],
        exclusions: exclusions || [],
      }).returning();
      res.json({ success: true, package: pkg });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/admin/packages/:id", async (req, res) => {
    try {
      const { type, name, category, description, duration, price, imageUrl, availableSeats, departureDate, returnDate, featured, inclusions, exclusions, flight, transport, food, muallim, tent, roomSharing } = req.body;
      const updates: Record<string, any> = {};
      if (type !== undefined) updates.type = type;
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.category = category || null;
      if (description !== undefined) updates.description = description;
      if (duration !== undefined) updates.duration = duration;
      if (price !== undefined) updates.price = price.toString();
      if (imageUrl !== undefined) updates.imageUrl = imageUrl || null;
      if (availableSeats !== undefined) updates.availableSeats = parseInt(availableSeats);
      if (departureDate !== undefined && departureDate !== null) updates.departureDate = new Date(departureDate);
      if (returnDate !== undefined && returnDate !== null) updates.returnDate = new Date(returnDate);
      if (featured !== undefined) updates.featured = !!featured;
      if (inclusions !== undefined) updates.inclusions = inclusions;
      if (exclusions !== undefined) updates.exclusions = exclusions;
      if (flight !== undefined) updates.flight = flight || null;
      if (transport !== undefined) updates.transport = transport || null;
      if (food !== undefined) updates.food = food || null;
      if (muallim !== undefined) updates.muallim = muallim || null;
      if (tent !== undefined) updates.tent = tent || null;
      if (roomSharing !== undefined) updates.roomSharing = roomSharing || null;
      const [updated] = await db.update(packages).set(updates).where(eq(packages.id, parseInt(req.params.id))).returning();
      if (!updated) return res.status(404).json({ success: false, error: "Package not found" });
      res.json({ success: true, package: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/packages/:id/upload-image", upload.single("image"), async (req: any, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No image file provided" });

      const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowed.includes(ext)) return res.status(400).json({ success: false, error: "Invalid image type" });

      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });

      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        console.error("[PackageImage] Storage error:", uploadResult);
        return res.status(500).json({ success: false, error: "Image storage failed" });
      }

      const imageUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/${filename}`;

      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });

      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const hasMain = currentObjs.some(img => img.isMain);
      const newObj: PackageImage = {
        url: imageUrl,
        isMain: !hasMain && currentObjs.length === 0,
        position: 'center',
      };
      const newImageUrls = [...currentObjs, newObj];
      const mainImg = newImageUrls.find(img => img.isMain) || newImageUrls[0];
      const primaryImageUrl = mainImg?.url || imageUrl;

      const [updated] = await db.update(packages)
        .set({ imageUrl: primaryImageUrl, imageUrls: newImageUrls })
        .where(eq(packages.id, pkgId)).returning();

      console.log(`[PackageImage] Uploaded for package #${pkgId}: ${storagePath} → URL: ${imageUrl}`);
      res.json({ success: true, imageUrl, imageUrls: updated.imageUrls });
    } catch (error: any) {
      console.error("[PackageImage] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/files/public/packages/:packageId/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) return res.status(500).json({ error: "Storage not configured" });
      const storagePath = `public/packages/${req.params.packageId}/${req.params.filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) return res.status(404).json({ error: "Image not found" });
      const ext = req.params.filename.split(".").pop()?.toLowerCase() || "jpg";
      const mimeTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
      res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      // downloadAsBytes returns Result<[Buffer]>; destructure to get the Buffer
      const [imageBuffer] = result.value;
      res.send(imageBuffer);
    } catch (error: any) {
      res.status(500).json({ error: "Could not retrieve image" });
    }
  });

  app.delete("/api/admin/packages/:id/remove-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: urlToRemove } = req.body;
      if (!urlToRemove) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const removedWasMain = currentObjs.find(img => img.url === urlToRemove)?.isMain ?? false;
      let newImageUrls = currentObjs.filter(img => img.url !== urlToRemove);
      if (removedWasMain && newImageUrls.length > 0) {
        newImageUrls = newImageUrls.map((img, idx) => ({ ...img, isMain: idx === 0 }));
      }
      const mainImg = newImageUrls.find(img => img.isMain) || newImageUrls[0];
      const newPrimaryUrl = mainImg?.url || null;
      const [updated] = await db.update(packages)
        .set({ imageUrl: newPrimaryUrl, imageUrls: newImageUrls.length > 0 ? newImageUrls : null })
        .where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl: updated.imageUrl, imageUrls: updated.imageUrls });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/admin/packages/:id/set-main-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: targetUrl } = req.body;
      if (!targetUrl) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      // Validate targetUrl actually exists in the image list
      const targetExists = currentObjs.some(img => img.url === targetUrl);
      if (!targetExists) {
        return res.status(400).json({ success: false, error: "Image URL not found in package images" });
      }
      const newImageUrls = currentObjs.map(img => ({ ...img, isMain: img.url === targetUrl }));
      const mainImg = newImageUrls.find(img => img.isMain);
      // imageUrl must never be null when images exist — fall back to first if no main found
      const newImageUrl = mainImg?.url || newImageUrls[0]?.url || null;
      const [updated] = await db.update(packages)
        .set({ imageUrl: newImageUrl, imageUrls: newImageUrls })
        .where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl: updated.imageUrl, imageUrls: updated.imageUrls });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/admin/packages/:id/update-image-position", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const { imageUrl: targetUrl, position } = req.body;
      if (!targetUrl || !['left','center','right'].includes(position)) {
        return res.status(400).json({ success: false, error: "imageUrl and position (left/center/right) required" });
      }
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const currentObjs = toImageObjects(Array.isArray(existing.imageUrls) ? existing.imageUrls : []);
      const newImageUrls = currentObjs.map(img => img.url === targetUrl ? { ...img, position } : img);
      const [updated] = await db.update(packages)
        .set({ imageUrls: newImageUrls })
        .where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrls: updated.imageUrls });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/packages/:id/hotel/:city/upload-image", upload.single("image"), async (req: any, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city as "makkah" | "madinah";
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No image file provided" });
      const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "webp", "gif"];
      if (!allowed.includes(ext)) return res.status(400).json({ success: false, error: "Invalid image type" });
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/hotel_${city}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) return res.status(500).json({ success: false, error: "Image storage failed" });
      const imageUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/hotel_${city}/${filename}`;
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = (existing.hotelDetails as any)?.[city] || {};
      const currentUrls: string[] = Array.isArray(hotel.imageUrls) ? hotel.imageUrls : [];
      const newHotelDetails = { ...(existing.hotelDetails as any), [city]: { ...hotel, imageUrls: [...currentUrls, imageUrl] } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, imageUrl, hotelDetails: updated.hotelDetails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/files/public/packages/:packageId/hotel_:city/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) return res.status(500).json({ error: "Storage not configured" });
      const { packageId, city, filename } = req.params;
      const storagePath = `public/packages/${packageId}/hotel_${city}/${filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) return res.status(404).json({ error: "File not found" });
      const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
        mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      const [fileBuffer] = result.value;
      res.send(fileBuffer);
    } catch (error: any) {
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });

  app.post("/api/admin/packages/:id/hotel/:city/upload-video", uploadVideo.single("video"), async (req: any, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city as "makkah" | "madinah";
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No video file provided" });
      const ext = (file.originalname.split(".").pop() || "mp4").toLowerCase();
      const allowedVideo = ["mp4", "mov", "webm"];
      if (!allowedVideo.includes(ext)) return res.status(400).json({ success: false, error: "Invalid video type. Use mp4, mov, or webm." });
      const allowedMime = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
      if (!allowedMime.includes(file.mimetype)) return res.status(400).json({ success: false, error: `Invalid video MIME type: ${file.mimetype}` });
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const filename = `video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `public/packages/${pkgId}/hotel_${city}/${filename}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) return res.status(500).json({ success: false, error: "Video storage failed" });
      const videoUrl = `${getBaseUrl(req)}/api/files/public/packages/${pkgId}/hotel_${city}/${filename}`;
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = (existing.hotelDetails as any)?.[city] || {};
      const newHotelDetails = { ...(existing.hotelDetails as any), [city]: { ...hotel, videoUrl } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, videoUrl, hotelDetails: updated.hotelDetails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/packages/:id/hotel/:city/remove-video", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city as "makkah" | "madinah";
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = (existing.hotelDetails as any)?.[city] || {};
      const newHotelDetails = { ...(existing.hotelDetails as any), [city]: { ...hotel, videoUrl: null } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/admin/packages/:id/hotel/:city/remove-image", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city as "makkah" | "madinah";
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const { imageUrl: urlToRemove } = req.body;
      if (!urlToRemove) return res.status(400).json({ success: false, error: "imageUrl required" });
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = (existing.hotelDetails as any)?.[city] || {};
      const currentUrls: string[] = Array.isArray(hotel.imageUrls) ? hotel.imageUrls : [];
      const newUrls = currentUrls.filter(u => u !== urlToRemove);
      const newHotelDetails = { ...(existing.hotelDetails as any), [city]: { ...hotel, imageUrls: newUrls } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/admin/packages/:id/hotel/:city/video", async (req, res) => {
    try {
      const pkgId = parseInt(req.params.id);
      const city = req.params.city as "makkah" | "madinah";
      if (!["makkah", "madinah"].includes(city)) return res.status(400).json({ success: false, error: "city must be makkah or madinah" });
      const { videoUrl } = req.body;
      if (videoUrl && typeof videoUrl === "string" && videoUrl.trim()) {
        try { const u = new URL(videoUrl.trim()); if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol"); }
        catch { return res.status(400).json({ success: false, error: "videoUrl must be a valid http or https URL" }); }
      }
      const [existing] = await db.select().from(packages).where(eq(packages.id, pkgId));
      if (!existing) return res.status(404).json({ success: false, error: "Package not found" });
      const hotel = (existing.hotelDetails as any)?.[city] || {};
      const newHotelDetails = { ...(existing.hotelDetails as any), [city]: { ...hotel, videoUrl: videoUrl || null } };
      const [updated] = await db.update(packages).set({ hotelDetails: newHotelDetails }).where(eq(packages.id, pkgId)).returning();
      res.json({ success: true, hotelDetails: updated.hotelDetails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * One-time admin utility: fix image URLs that were saved with a wrong domain.
   * When EXPO_PUBLIC_DOMAIN was not set in production, `getBaseUrl()` fell back to
   * REPLIT_DEV_DOMAIN (janeway.replit.dev workspace URL) which is ephemeral and
   * cannot serve images from the production app. This endpoint replaces those broken
   * URLs with the correct domain derived from the incoming request.
   */
  app.post("/api/admin/fix-image-urls", async (req, res) => {
    try {
      const correctBase = getBaseUrl(req);
      const allPkgs = await db.select().from(packages);
      let fixedCount = 0;
      let urlsFixed = 0;

      for (const pkg of allPkgs) {
        const rawUrls: (string | PackageImage | Record<string, unknown>)[] = Array.isArray(pkg.imageUrls)
          ? (pkg.imageUrls as PackageImage[])
          : [];
        if (rawUrls.length === 0) continue;

        let pkgUrlsFixed = 0;
        const fixedUrls = rawUrls.map(item => {
          const url = typeof item === 'string' ? item : (item['url'] as string | undefined) || '';
          // Fix URLs that contain any replit.dev workspace domain
          if (url.includes('.replit.dev') && !url.includes('.repl.co')) {
            const fixedUrl = url.replace(
              /https?:\/\/[^/]+\.replit\.dev/,
              correctBase
            );
            if (fixedUrl !== url) {
              pkgUrlsFixed++;
              urlsFixed++;
              if (typeof item === 'string') return fixedUrl;
              return { ...item, url: fixedUrl };
            }
          }
          return item;
        });

        if (pkgUrlsFixed === 0) continue;

        const fixedObjs = toImageObjects(fixedUrls);
        const mainImg = fixedObjs.find(img => img.isMain) || fixedObjs[0];
        const rawImageUrl = pkg.imageUrl ?? null;
        const newImageUrl = mainImg?.url
          || (rawImageUrl?.includes('.replit.dev')
            ? rawImageUrl.replace(/https?:\/\/[^/]+\.replit\.dev/, correctBase)
            : rawImageUrl)
          || null;

        await db.update(packages)
          .set({ imageUrl: newImageUrl, imageUrls: fixedObjs })
          .where(eq(packages.id, pkg.id));

        fixedCount++;
        console.log(`[FixImageUrls] Fixed package #${pkg.id}: ${pkgUrlsFixed} URL(s) → ${correctBase}`);
      }

      res.json({
        success: true,
        correctBase,
        packagesFixed: fixedCount,
        urlsFixed,
        message: fixedCount === 0
          ? 'No broken image URLs found — all images already use the correct domain.'
          : `Fixed ${urlsFixed} image URL(s) across ${fixedCount} package(s).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[FixImageUrls] Error:', err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const bookingData = req.body;
      const PASSPORT_RE = /^[A-Z][0-9]{7}$/;
      if (Array.isArray(bookingData.travelers)) {
        for (let i = 0; i < bookingData.travelers.length; i++) {
          const t = bookingData.travelers[i];
          if (!t.name?.trim() || !t.dateOfBirth?.trim() || !t.passportNumber?.trim() || !t.passportIssue?.trim() || !t.passportExpiry?.trim()) {
            return res.status(400).json({ success: false, error: `Traveler ${i + 1}: all passport fields (Name, DOB, Passport Number, Issue Date, Expiry) are required` });
          }
          if (!PASSPORT_RE.test(t.passportNumber.trim())) {
            return res.status(400).json({ success: false, error: `Traveler ${i + 1}: passport number must be 1 letter followed by 7 digits (e.g. A1234567)` });
          }
        }
      }
      const [booking] = await db.insert(bookings).values({
        ...bookingData,
        status: "pending",
        paymentStatus: "pending",
        paidAmount: "0",
      }).returning();
      try {
        await sendNotifications(booking.userId, booking.id, "booking_created");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, booking });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/bookings/user/:userId", async (req, res) => {
    try {
      const userBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.userId, parseInt(req.params.userId)))
        .orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: userBookings });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/bookings/:id", async (req, res) => {
    try {
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, parseInt(req.params.id)));
      if (!booking) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }
      res.json({ success: true, booking });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/bookings/:id/invoice", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const sessionUserId = req.session?.userId;
      const isAdmin = req.session?.adminLoggedIn;
      if (!sessionUserId && !isAdmin) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!isAdmin) {
        const [booking] = await db.select({ userId: bookings.userId }).from(bookings).where(eq(bookings.id, bookingId));
        if (!booking) return res.status(404).json({ success: false, error: "Booking not found" });
        if (booking.userId !== sessionUserId) {
          return res.status(403).json({ success: false, error: "Access denied" });
        }
      }
      await generateBookingPdf(bookingId, res);
    } catch (error: any) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
  });

  // Short redirect for SMS — /i/33 → /invoice/33 (saves chars in DLT variable)
  app.get("/i/:bookingId", (req, res) => {
    res.redirect(301, `/invoice/${req.params.bookingId}`);
  });

  app.get("/invoice/:bookingId", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).send("Invoice not found");

      const [pkg] = await db.select().from(packages).where(eq(packages.id, booking.packageId));
      const [user] = await db.select().from(users).where(eq(users.id, booking.userId));

      const allPayments = await db.select().from(payments)
        .where(eq(payments.bookingId, bookingId));
      const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

      let invoiceNum = booking.invoiceNumber;
      if (!invoiceNum) {
        invoiceNum = generateInvoiceNumber(bookingId);
        await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
      }

      const totalAmount = parseFloat(booking.totalAmount);
      const numberOfPeople = booking.numberOfPeople;
      const ratePerPerson = totalAmount / numberOfPeople;

      const gstRate = 0.05;
      const tcsRate = 0.05;
      const baseAmount = totalAmount / (1 + gstRate);
      const gstAmount = totalAmount - baseAmount;
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
      const tcsAmount = totalAmount * tcsRate;
      const grandTotal = totalAmount + tcsAmount;

      const bookingDate = booking.bookingDate ? new Date(booking.bookingDate) : new Date();
      const dueDate = new Date(bookingDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const serviceName = pkg ? `${pkg.type === 'hajj' ? 'Hajj' : 'Umrah'} - ${pkg.name}` : 'Tour Service';
      const roomLabel = booking.roomType || '';

      let serviceRows = '';
      for (let i = 0; i < numberOfPeople; i++) {
        const traveler = booking.travelers && booking.travelers[i];
        const travelerName = traveler ? traveler.name : `Person ${i + 1}`;
        const dob = traveler?.dateOfBirth ? `DOB: ${traveler.dateOfBirth}` : '';
        const passport = traveler?.passportNumber ? `Passport: ${traveler.passportNumber}` : '';
        const details = [dob, passport, roomLabel].filter(Boolean).join(' | ');
        serviceRows += `
          <tr>
            <td>${i + 1}</td>
            <td>
              <div class="service-name">${serviceName}</div>
              <div class="service-desc">${travelerName}${details ? '<br><small style="color:#6b7280">' + details + '</small>' : ''}</div>
            </td>
            <td>998555</td>
            <td style="text-align:right">₹ ${formatINR(ratePerPerson)}</td>
            <td style="text-align:right">₹ ${formatINR(gstAmount / numberOfPeople)}</td>
            <td style="text-align:right">₹ ${formatINR(ratePerPerson + gstAmount / numberOfPeople)}</td>
          </tr>`;
      }

      const previousBalance = 0;
      const currentBalance = grandTotal - totalPaid;

      let template = readFileSync(join(process.cwd(), "server", "templates", "invoice.html"), "utf-8");
      const replacements: Record<string, string> = {
        "{{INVOICE_NUMBER}}": invoiceNum,
        "{{BOOKING_ID}}": String(bookingId),
        "{{INVOICE_DATE}}": bookingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{DUE_DATE}}": dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        "{{CUSTOMER_NAME}}": booking.contactName || user?.name || "",
        "{{CUSTOMER_ADDRESS}}": booking.address || "",
        "{{CUSTOMER_PHONE}}": booking.contactPhone || user?.phone || "",
        "{{CUSTOMER_EMAIL}}": booking.contactEmail || user?.email || "",
        "{{SERVICE_ROWS}}": serviceRows,
        "{{TCS_AMOUNT}}": `₹ ${formatINR(tcsAmount)}`,
        "{{TAX_TOTAL}}": `${formatINR(gstAmount + tcsAmount)}`,
        "{{GRAND_TOTAL}}": `${formatINR(grandTotal)}`,
        "{{RECEIVED_AMOUNT}}": formatINR(totalPaid),
        "{{PREVIOUS_BALANCE}}": formatINR(previousBalance),
        "{{CURRENT_BALANCE}}": formatINR(currentBalance),
        "{{TAXABLE_VALUE}}": formatINR(baseAmount),
        "{{CGST_AMOUNT}}": formatINR(cgst),
        "{{SGST_AMOUNT}}": formatINR(sgst),
        "{{GST_TOTAL}}": formatINR(gstAmount),
        "{{AMOUNT_IN_WORDS}}": numberToWords(grandTotal),
        "{{SHARE_URL}}": encodeURIComponent(`https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/invoice/${bookingId}`),
      };

      for (const [key, value] of Object.entries(replacements)) {
        template = template.split(key).join(value);
      }

      res.send(template);
    } catch (error: any) {
      console.error("[Invoice] Error:", error);
      res.status(500).send("Error generating invoice");
    }
  });

  app.get("/invoice/:bookingId/pdf", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId);
      const isAdmin = req.session?.adminLoggedIn;
      const sessionUserId = req.session?.userId;
      if (!isAdmin && !sessionUserId) {
        return res.status(401).send("Unauthorized");
      }
      if (!isAdmin) {
        const [booking] = await db.select({ userId: bookings.userId }).from(bookings).where(eq(bookings.id, bookingId));
        if (!booking) return res.status(404).send("Invoice not found");
        if (booking.userId !== sessionUserId) return res.status(403).send("Access denied");
      }
      await generateBookingPdf(bookingId, res);
    } catch (error: any) {
      console.error("[Invoice PDF] Error:", error);
      if (!res.headersSent) res.status(500).send("Error generating PDF");
    }
  });

  app.post("/api/payments/create-order", async (req, res) => {
    try {
      const { bookingId, amount } = req.body;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return res.status(500).json({ success: false, error: "Payment gateway not configured. Please contact support." });
      }

      const parsedAmount = parseFloat(amount);
      if (parsedAmount > 500000) {
        return res.status(400).json({ success: false, error: "Maximum ₹5,00,000 per transaction. Please pay in installments." });
      }
      if (parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid payment amount." });
      }

      const amountInPaise = Math.round(parsedAmount * 100);
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `booking_${bookingId}`,
        }),
      });

      const order = await response.json();
      if (!response.ok) {
        console.error("[Razorpay] Order creation failed:", order);
        return res.status(400).json({ success: false, error: order.error?.description || "Failed to create Razorpay order" });
      }

      console.log("[Razorpay] Order created:", order.id);
      res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        return res.status(500).json({ success: false, error: "Payment verification unavailable. Server configuration error." });
      }
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ success: false, error: "Missing payment details for verification." });
      }
      const expectedSignature = createHmac("sha256", keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({ success: false, error: "Invalid payment signature. Payment verification failed." });
      }
      console.log("[Razorpay] Signature verified successfully");

      const [payment] = await db.insert(payments).values({
        bookingId: parseInt(bookingId),
        amount,
        paymentMethod: "razorpay",
        transactionId: razorpayPaymentId,
        status: "success",
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      }).returning();
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, parseInt(bookingId)));
      const newPaidAmount = parseFloat(booking.paidAmount || "0") + parseFloat(amount);
      const totalAmount = parseFloat(booking.totalAmount);
      let paymentStatus = "partial";
      let bookingStatus = booking.status;
      if (newPaidAmount >= totalAmount) {
        paymentStatus = "completed";
        bookingStatus = "confirmed";
      }
      await db.update(bookings).set({
        paidAmount: newPaidAmount.toString(),
        paymentStatus,
        status: bookingStatus,
        updatedAt: new Date(),
      }).where(eq(bookings.id, parseInt(bookingId)));
      try {
        await sendNotifications(booking.userId, booking.id, "payment_success");
      } catch (e) {
        console.error("Notification error:", e);
      }
      res.json({ success: true, payment });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);

  app.post("/api/documents/upload", upload.single("file"), async (req: any, res) => {
    try {
      const { bookingId, type, fileName } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: "type is required" });
      }
      // Resolve owner: authenticated user (session/token) takes precedence; admin session may supply userId in body
      const effectiveOwner = await resolveUserId(req);
      let resolvedUserId: number;
      if (effectiveOwner) {
        resolvedUserId = effectiveOwner;
      } else if (req.session?.adminLoggedIn && req.body.userId) {
        resolvedUserId = parseInt(req.body.userId);
        if (!Number.isFinite(resolvedUserId) || resolvedUserId <= 0) {
          return res.status(400).json({ success: false, error: "Invalid userId" });
        }
      } else {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }

      let fileUrl = req.body.fileUrl || "";
      const file = req.file;

      if (file) {
        const ext = ((fileName || file.originalname || "file").split(".").pop() || "").toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return res.status(400).json({ success: false, error: `File type .${ext} not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}` });
        }
        const KYC_DOC_TYPES = new Set(["aadhar", "pancard", "medical"]);
        const KYC_MAX_BYTES = 5 * 1024 * 1024;
        if (KYC_DOC_TYPES.has(type) && file.size > KYC_MAX_BYTES) {
          return res.status(400).json({ success: false, error: "KYC documents must be 5 MB or smaller" });
        }

        const client = getStorageClient();
        if (client) {
          const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
          const storagePath = `public/documents/${resolvedUserId}/${randomId}.${ext}`;
          const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
          if (uploadResult.ok) {
            fileUrl = `/api/files/${storagePath}`;
            console.log(`[Upload] File stored: ${storagePath}`);
          } else {
            console.error("[Upload] Storage error:", uploadResult);
            return res.status(500).json({ success: false, error: "File storage failed" });
          }
        } else {
          return res.status(500).json({ success: false, error: "Object storage not configured" });
        }
      }

      const [document] = await db.insert(documents).values({
        userId: resolvedUserId,
        bookingId: bookingId ? parseInt(bookingId) : null,
        type,
        fileName: fileName || (file ? file.originalname : "unknown"),
        fileUrl,
      }).returning();
      res.json({ success: true, document });
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/files/public/documents/:userId/:filename", async (req, res) => {
    try {
      const client = getStorageClient();
      if (!client) {
        return res.status(500).json({ error: "Storage not configured" });
      }
      const storagePath = `public/documents/${req.params.userId}/${req.params.filename}`;
      const result = await client.downloadAsBytes(storagePath);
      if (!result.ok || !result.value) {
        return res.status(404).json({ error: "File not found" });
      }
      const ext = req.params.filename.split(".").pop()?.toLowerCase() || "";
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        pdf: "application/pdf", doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${req.params.filename}"`);
      // downloadAsBytes returns Result<[Buffer]>; destructure to get the Buffer
      const [fileBuffer] = result.value;
      res.send(fileBuffer);
    } catch (error: any) {
      console.error("[Files] Download error:", error);
      res.status(500).json({ error: "Could not retrieve file" });
    }
  });

  app.get("/api/documents/user/:userId", async (req: any, res: any) => {
    try {
      const targetUserId = parseInt(req.params.userId);
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, error: "Invalid userId" });
      }
      // Allow admin OR the owner of the documents
      if (!req.session?.adminLoggedIn) {
        const effectiveUserId = await resolveUserId(req);
        if (!effectiveUserId || effectiveUserId !== targetUserId) {
          return res.status(403).json({ success: false, error: "Access denied" });
        }
      }
      const userDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.userId, targetUserId));
      res.json({ success: true, documents: userDocuments });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // ─── KYC Profile Routes ─────────────────────────────────────────────────────

  app.get("/api/profile/kyc", async (req: any, res: any) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const [profile] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      res.json({ success: true, profile: profile || null });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/profile/kyc", async (req: any, res: any) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { aadharNumber, panNumber, bloodGroup, whatsappNumber } = req.body as {
        aadharNumber?: string; panNumber?: string; bloodGroup?: string; whatsappNumber?: string;
      };
      const validBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
      if (aadharNumber !== undefined && aadharNumber !== "" && !/^\d{12}$/.test(aadharNumber)) {
        return res.status(400).json({ success: false, error: "Aadhar number must be exactly 12 digits" });
      }
      if (panNumber !== undefined && panNumber !== "" && !/^[A-Z0-9]{10}$/i.test(panNumber)) {
        return res.status(400).json({ success: false, error: "PAN number must be exactly 10 alphanumeric characters" });
      }
      if (bloodGroup !== undefined && bloodGroup !== "" && !validBloodGroups.includes(bloodGroup)) {
        return res.status(400).json({ success: false, error: "Invalid blood group" });
      }
      if (whatsappNumber !== undefined && whatsappNumber !== "" && !/^\d{10}$/.test(whatsappNumber)) {
        return res.status(400).json({ success: false, error: "WhatsApp number must be exactly 10 digits" });
      }
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber || null;
      if (panNumber !== undefined) updateData.panNumber = panNumber ? panNumber.toUpperCase() : null;
      if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup || null;
      if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber || null;
      const [existing] = await db.select({ id: customerProfiles.id }).from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      if (existing) {
        await db.update(customerProfiles).set(updateData).where(eq(customerProfiles.userId, effectiveUserId));
      } else {
        await db.insert(customerProfiles).values({ userId: effectiveUserId, ...updateData });
      }
      const [updated] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      res.json({ success: true, profile: updated });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/profile/kyc/photo", upload.single("photo"), async (req: any, res: any) => {
    const effectiveUserId = await resolveUserId(req);
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ success: false, error: "No photo file provided" });
      const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
      if (file.size > MAX_PHOTO_BYTES) {
        return res.status(400).json({ success: false, error: "Photo must be 5 MB or smaller" });
      }
      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({ success: false, error: "Only JPEG, PNG, or WebP photos are allowed" });
      }
      const ext = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
      const client = getStorageClient();
      if (!client) return res.status(500).json({ success: false, error: "Object storage not configured" });
      const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
      const storagePath = `public/documents/${effectiveUserId}/${randomId}.${ext}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        return res.status(500).json({ success: false, error: "Photo storage failed" });
      }
      const photoUrl = `/api/files/${storagePath}`;
      const [existing] = await db.select({ id: customerProfiles.id }).from(customerProfiles).where(eq(customerProfiles.userId, effectiveUserId));
      if (existing) {
        await db.update(customerProfiles).set({ photo: photoUrl, updatedAt: new Date() }).where(eq(customerProfiles.userId, effectiveUserId));
      } else {
        await db.insert(customerProfiles).values({ userId: effectiveUserId, photo: photoUrl });
      }
      res.json({ success: true, photoUrl });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  app.post("/api/seed", async (req, res) => {
    try {
      const existingPackages = await db.select().from(packages);
      if (existingPackages.length > 0) {
        return res.json({ success: true, message: "Data already seeded", packages: existingPackages });
      }
      const seededPackages = await db.insert(packages).values([
        {
          type: "umrah", name: "Premium Umrah Package", category: "Premium Umrah",
          description: "Premium Umrah experience with 3-star Azka Safa Hotel just 200 meters from Haram in Makkah and Rose Holiday Hotel 100 meters from Masjid Nabawi in Madinah. Weekly departures available. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days", price: "150000",
          roomPrices: { quad: 150000 },
          inclusions: ["Azka Safa Hotel Makkah (3 Star, 200m from Haram)", "Rose Holiday Hotel Madinah (3 Star, 100m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Safa Hotel", rating: 3, distance: "200 meters from Haram" }, madinah: { name: "Rose Holiday Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "As per hotel",
          roomSharing: "4 Sharing",
          availableSeats: 50, departureDate: new Date("2026-04-01"), returnDate: new Date("2026-04-15"), featured: true,
        },
        {
          type: "umrah", name: "Economy Umrah Package", category: "Economy Umrah",
          description: "Affordable Umrah package with Durrat O Sallah Hotel (600m, 12 min walk from Haram) in Makkah and Guest Time Hotel (200m from Masjid Nabawi) in Madinah. 5-person sharing rooms. Departures every 15 days. All packages exclude 5% GST.",
          duration: "14 Nights / 15 Days", price: "90000",
          roomPrices: { "5_sharing": 90000 },
          inclusions: ["Durrat O Sallah Hotel Makkah (1 Star, 600m from Haram)", "Guest Time Hotel Madinah (2 Star, 200m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Durrat O Sallah", rating: 1, distance: "600 meters (12 minutes walk)" }, madinah: { name: "Guest Time Hotel", rating: 2, distance: "200 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "As per hotel",
          roomSharing: "5 Person Sharing",
          availableSeats: 80, departureDate: new Date("2026-04-01"), returnDate: new Date("2026-04-15"), featured: false,
        },
        {
          type: "umrah", name: "Ramadan Umrah Special – Last 20 Days", category: "Ramadan Umrah",
          description: "Special Ramadan Umrah package for the blessed last 20 days. Stay at Kayan Al Raya Hotel Ajiyad (500m from Haram) in Makkah and Arjwan Sada Hotel (300m from Masjid Nabawi) in Madinah. 4/5 sharing rooms. Departure: 28 January 2027. All packages exclude 5% GST.",
          duration: "20 Days", price: "140000",
          roomPrices: { "4_sharing": 140000, "5_sharing": 140000 },
          inclusions: ["Kayan Al Raya Hotel Ajiyad Makkah (1 Star, 500m from Haram)", "Arjwan Sada Hotel Madinah (300m from Masjid Nabawi)", "Visa Processing", "Airport Transfers", "AC Transport", "Makkah Ziyarat", "Madinah Ziyarat"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Kayan Al Raya Hotel Ajiyad", rating: 1, distance: "500 meters from Haram" }, madinah: { name: "Arjwan Sada Hotel", rating: 2, distance: "300 meters from Masjid Nabawi" } },
          flight: "Included", transport: "AC Bus", food: "As per hotel",
          roomSharing: "4 / 5 Sharing",
          availableSeats: 40, departureDate: new Date("2027-01-28"), returnDate: new Date("2027-02-17"), featured: true,
        },
        {
          type: "umrah", name: "Ramadan Umrah Full Month Package", category: "Ramadan Umrah",
          description: "Complete Ramadan experience – 32 days covering the full blessed month. 20 days in Makkah at Zohratu Sallah Hotel (600m from Haram) and 12 days in Madinah at Lulu Madinah Hotel (300m from Masjid Nabawi). Includes Sahoor, Iftar & Dinner meals, Akasa Air flight with 30 KG baggage + Zamzam. All packages exclude 5% GST.",
          duration: "32 Days", price: "180000",
          roomPrices: { "5_sharing": 180000, "6_sharing": 180000 },
          inclusions: ["Akasa Air Flight (30 KG + Zamzam)", "Zohratu Sallah Hotel Makkah (600m from Haram) – 20 Days", "Lulu Madinah Hotel (1 Star, 300m from Masjid Nabawi) – 12 Days", "Sahoor + Iftar + Dinner Meals", "AC Bus Jeddah–Makkah–Madinah–Jeddah", "Makkah Ziyarat", "Madinah Ziyarat", "Visa Processing", "Airport Transfers"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Zohratu Sallah Hotel Bir Balila Ajiyad", rating: 1, distance: "600 meters from Haram" }, madinah: { name: "Lulu Madinah Hotel", rating: 1, distance: "300 meters from Masjid Nabawi" } },
          flight: "Akasa Air (30 KG + Zamzam)", transport: "AC Bus Jeddah–Makkah–Madinah–Jeddah", food: "Sahoor + Iftar + Dinner",
          roomSharing: "5 / 6 Sharing",
          availableSeats: 40, departureDate: new Date("2027-01-09"), returnDate: new Date("2027-02-10"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Royal Elite", category: "Luxury Hajj Package",
          description: "The ultimate luxury Hajj experience with Clock Tower accommodation at 0 meters from Haram, VIP gypsum board tents with buffet meals, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1450000",
          roomPrices: { double: 1800000, triple: 1550000, quad: 1450000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Gypsum Board Tents (A/C) with Buffet Meals", "Luxury A/C Buses", "Clock Tower (Abraj Al Bait) Makkah Hotel", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Clock Tower (Abraj Al Bait)", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Full Board – Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Gypsum Board Tents (A/C) with Buffet Meals", roomSharing: "4 / 3 / 2",
          availableSeats: 50, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Elite Plus", category: "Premium Hajj Package",
          description: "Premium Hajj package with Azka Al Maqam hotel at 0 meters from Haram, VIP air conditioned tents, direct Saudi Airlines flight, and premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1195000",
          roomPrices: { double: 1450000, triple: 1300000, quad: 1250000, sharing: 1195000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Azka Al Maqam Makkah Hotel (0m from Haram)", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Azka Al Maqam / Similar", rating: 5, distance: "0 meters from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 50, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Comfort Plus", category: "Executive Hajj Package",
          description: "Executive Hajj package with Le Meridien Tower (Saja Makkah) with 1.5km shuttle service, VIP A/C tents, direct Saudi Airlines flight. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "1075000",
          roomPrices: { double: 1300000, triple: 1175000, quad: 1125000, sharing: 1075000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Le Meridien Tower (Saja Makkah)", "1.5km Shuttle Service to Haram", "3 Nights Madinah Stay", "Full Board Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Le Meridien Tower (Saja Makkah)", rating: 5, distance: "1.5 km shuttle service" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Full Board – Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: true,
        },
        {
          type: "hajj", name: "Burhan Comfort", category: "Standard Hajj Package",
          description: "Standard Hajj package with Esarah hotel in Setten area, VIP A/C tents, direct Saudi Airlines flight. Indian & Continental meals with premium Muallim service. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "975000",
          roomPrices: { double: 1170000, triple: 1050000, quad: 1010000, sharing: 975000 },
          inclusions: ["Saudi Airlines Direct Flight", "Premium Muallim Service", "VIP Air Conditioned Tents", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 4, distance: "< 4 km from Haram" }, madinah: { name: "Maden Hotel / Similar", rating: 4, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Premium Muallim Service", tent: "VIP Air Conditioned Tents", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 60, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Economy Plus", category: "Economy Hajj Package",
          description: "Economy Hajj package with Esarah hotel, premium gypsum board A/C tents, direct Saudi Airlines flight. Category A Muallim with Indian & Continental meals. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "900000",
          roomPrices: { double: 1035000, triple: 950000, quad: 925000, sharing: 900000 },
          inclusions: ["Saudi Airlines Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Saudi Airlines - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Category A Muallim", tent: "Premium Gypsum Board Tents (A/C)", roomSharing: "5 / 4 / 3 / 2",
          availableSeats: 80, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Budget Saver", category: "Budget Hajj Package",
          description: "Most affordable Hajj package with Air India direct flight, premium gypsum board A/C tents, 6-sharing rooms at Esarah hotel. Indian & Continental meals included. All packages exclude 5% GST.",
          duration: "2 Weeks", price: "825000",
          roomPrices: { "6_sharing": 825000 },
          inclusions: ["Air India Direct Flight", "Category A Muallim", "Premium Gypsum Board Tents (A/C)", "Luxury A/C Buses", "Esarah Hotel - Setten Area", "3 Nights Madinah Stay", "Indian + Continental Meals", "Visa Processing", "Airport Transfers", "Ziyarat Tours"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"],
          hotelDetails: { makkah: { name: "Esarah - Setten Area", rating: 3, distance: "< 4 km from Haram" }, madinah: { name: "Nozol Royal Inn / Similar", rating: 3, distance: "150 meters from Haram" } },
          flight: "Air India - Direct Flight", transport: "Luxury A/C Buses", food: "Indian + Continental Meals",
          muallim: "Category A Muallim", tent: "Premium Gypsum Board Tents (A/C)", roomSharing: "6 Sharing",
          availableSeats: 100, departureDate: new Date("2027-05-11"), returnDate: new Date("2027-06-20"), featured: false,
        },
        {
          type: "hajj", name: "Burhan Budget Saver Shifting", category: "Most Popular Hajj Package 2027",
          description: "Most popular 40-day Hajj package. 10 days pre-Hajj in Azizia area, 15 days post-Hajj at Grand Masa Hotel (3 Star, 400m from Haram), and 9 days in Madinah at Haya Plaza Hotel (3 Star, 100m from Masjid Nabawi). Category D Moulim – New Mina. Includes AC bus transport, Ziyarat of Makkah, Madinah, Taif & Badar. Comes with complimentary travel kit including bags, umbrella, sunglasses, electric neck fan, sleeping mat, Janamaz, Tasbeeh, Ihram & printed Hajj guide. All packages exclude 5% GST.",
          duration: "40 Days", price: "650000",
          roomPrices: { sharing: 650000 },
          inclusions: ["Category D Moulim – New Mina", "Azizia Area Hotel (5 km from Haram) – 10 Days Pre-Hajj", "Grand Masa Hotel Makkah (3 Star, 400m from Haram) – 15 Days Post-Hajj", "Haya Plaza Hotel Madinah (3 Star, 100m from Masjid Nabawi) – 9 Days", "AC Bus Transport", "Makkah Ziyarat", "Madinah Ziyarat", "Taif Ziyarat", "Badar Ziyarat", "Visa Processing", "Airport Transfers", "Complimentary Travel Kit (24\" & 20\" PP bags, Backpack, Mina/Arafat bag, Passport bag, Shoe bag, Umbrella, Sunglasses, Electric neck fan, Muzdalifah sleeping mat, Janamaz, Tasbeeh, Printed Hajj & Umrah guide, Ihram belt, Ihram)"],
          exclusions: ["5% GST", "Personal expenses", "Travel insurance", "Qurbani", "Flight tickets"],
          hotelDetails: { makkah: { name: "Grand Masa Hotel (Post-Hajj) / Azizia Area (Pre-Hajj)", rating: 3, distance: "400 meters from Haram (Post-Hajj)" }, madinah: { name: "Haya Plaza Hotel", rating: 3, distance: "100 meters from Masjid Nabawi" } },
          flight: "Not included", transport: "AC Bus", food: "As per hotel",
          muallim: "Category D – New Mina", roomSharing: "Sharing",
          availableSeats: 100, departureDate: new Date("2027-05-05"), returnDate: new Date("2027-06-20"), featured: true,
        },
      ]).returning();
      res.json({ success: true, message: "Database seeded successfully", packages: seededPackages });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  function getInvoiceBaseUrl(): string {
    // Custom override — set INVOICE_BASE_URL env var to a short domain
    if (process.env.INVOICE_BASE_URL) {
      return process.env.INVOICE_BASE_URL.replace(/\/$/, "");
    }
    // Production deployed domain (short — e.g. myapp.replit.app)
    if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(",").map(d => d.trim());
      // Prefer shortest domain
      const shortest = domains.sort((a, b) => a.length - b.length)[0];
      return `https://${shortest}`;
    }
    // Dev domain fallback
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    return "http://localhost:5000";
  }

  // Log the invoice base URL on startup so we can confirm what's being used
  const _invoiceBase = getInvoiceBaseUrl();
  console.log(`[Invoice URL] Base: ${_invoiceBase} | SMS will use: ${_invoiceBase}/i/{id}`);

  async function sendNotifications(userId: number, bookingId: number, type: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return;

    const invoiceUrl = `${getInvoiceBaseUrl()}/invoice/${bookingId}`;
    const smsInvoiceUrl = `${getInvoiceBaseUrl()}/i/${bookingId}`;

    let invoiceNum = "";
    let packageName = "Hajj/Umrah Package";
    let packageImageUrl: string | undefined;
    let amountPaid = "0";
    let totalAmount = "0";
    let customerName = user.name;

    try {
      const [bk] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (bk) {
        invoiceNum = bk.invoiceNumber || generateInvoiceNumber(bookingId);
        if (!bk.invoiceNumber) {
          await db.update(bookings).set({ invoiceNumber: invoiceNum }).where(eq(bookings.id, bookingId));
        }
        amountPaid = formatINR(parseFloat(bk.paidAmount || "0"));
        totalAmount = formatINR(parseFloat(bk.totalAmount || "0"));
        customerName = bk.contactName || user.name;
        const [pkg] = await db.select().from(packages).where(eq(packages.id, bk.packageId));
        if (pkg) {
          packageName = pkg.name;
          packageImageUrl = pkg.imageUrl || undefined;
        }
      }
    } catch (e) {}

    // For booking_created the paidAmount is 0; show totalAmount instead
    const smsAmount = type === "booking_created" ? totalAmount : amountPaid;

    let message = "";
    switch (type) {
      case "booking_created":
        message = `Assalamu Alaikum\n\nDear *${customerName}*\n\nYour booking with *Al Burhan Tours & Travels* has been created successfully.\n\nPackage: ${packageName}\nInvoice No: ${invoiceNum}\n\nView Invoice:\n${invoiceUrl}\n\nOur team will contact you shortly.\n\nFor assistance please contact:\n9893225590\n9893989786\n\n*Al Burhan Tours & Travels*`;
        break;
      case "payment_success":
        message = `Assalamu Alaikum\n\nDear *${customerName}*\n\nYour booking with *Al Burhan Tours & Travels* has been confirmed.\n\nPackage: ${packageName}\nAmount Paid: ₹${amountPaid}\n\nYour invoice is attached below.\n${invoiceUrl}\n\nFor assistance please contact:\n9893225590\n9893989786\n\n*Al Burhan Tours & Travels*`;
        break;
    }

    console.log(`[Notifications] Sending ${type} to user ${userId} (${user.phone}) for booking ${bookingId}`);

    const smsResult = await sendBookingDltSms(user.phone, customerName, packageName, smsAmount, smsInvoiceUrl);
    console.log(`[SMS DLT] ${type} to ${user.phone}: ${smsResult ? "SENT" : "FAILED"} | customer="${customerName}" | amount=${smsAmount} | invoiceId=${bookingId}`);

    // Always send a second quick SMS with just the invoice URL so customers can tap it directly
    try {
      const urlSmsText = `Al Burhan Tours & Travels\nInvoice Link:\n${smsInvoiceUrl}`;
      const urlSmsResult = await sendSmsFast2SMS(user.phone, urlSmsText);
      console.log(`[SMS URL] Invoice link SMS to ${user.phone}: ${urlSmsResult ? "SENT" : "FAILED"}`);
    } catch (e: any) {
      console.error("[SMS URL] Error:", e.message);
    }

    const whatsappResult = await sendWhatsAppConfirmationTemplate(
      user.phone, customerName, packageName, `INR ${smsAmount}`, invoiceUrl
    );
    console.log(`[WhatsApp Confirmation] ${type} to ${user.phone}: ${whatsappResult ? "SENT" : "FAILED"} | template=conformation | vars=[name, package, amount, invoiceUrl]`);

    if (!smsResult && !whatsappResult) {
      console.error(`[Notifications] BOTH channels failed for ${type} to ${user.phone} (booking ${bookingId})`);
    }

    // Push notification (fire and forget) — FCM
    try {
      const pushTitles: Record<string, string> = {
        booking_created: "🎉 Booking Confirmed!",
        payment_success: "✅ Payment Successful",
      };
      const pushBodies: Record<string, string> = {
        booking_created: "Assalamu Alaikum! Your booking is confirmed. Tap to view details.",
        payment_success: "Your payment is received. Booking is fully confirmed.",
      };
      await sendPushToUser(db, userId, {
        title: pushTitles[type] || "Al Burhan Tours Update",
        body: pushBodies[type] || "You have a new update from Al Burhan Tours.",
        data: { bookingId: String(bookingId), screen: "BookingDetails", type },
        ...(packageImageUrl ? { imageUrl: packageImageUrl } : {}),
      });
      // For booking_created with no payment yet, also send a payment pending reminder
      if (type === "booking_created") {
        const [bk2] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
        if (bk2 && bk2.paymentStatus === "pending" && parseFloat(bk2.paidAmount || "0") === 0) {
          await sendPushToUser(db, userId, {
            title: "💳 Payment Pending",
            body: "Complete your payment to confirm your booking.",
            data: { bookingId: String(bookingId), screen: "Payment", type: "payment_pending" },
          });
        }
      }
    } catch (e: any) {
      console.error("[Push] booking confirmation send error:", e.message);
    }

    const notifMetadata: Record<string, unknown> = { type };
    if (packageImageUrl) notifMetadata.imageUrl = packageImageUrl;

    await db.insert(notifications).values({
      userId,
      bookingId,
      title: type === "payment_success" ? "✅ Payment Successful" : "🎉 Booking Confirmed!",
      type: "multi_channel",
      channel: "all",
      message,
      status: smsResult || whatsappResult ? "sent" : "pending",
      metadata: notifMetadata,
    });
  }

  app.get("/api/admin/bookings", async (req, res) => {
    try {
      const allBookings = await db.select({
        id: bookings.id,
        userId: bookings.userId,
        packageId: bookings.packageId,
        numberOfPeople: bookings.numberOfPeople,
        totalAmount: bookings.totalAmount,
        status: bookings.status,
        paymentStatus: bookings.paymentStatus,
        paidAmount: bookings.paidAmount,
        travelers: bookings.travelers,
        contactName: bookings.contactName,
        contactPhone: bookings.contactPhone,
        contactEmail: bookings.contactEmail,
        address: bookings.address,
        city: bookings.city,
        district: bookings.district,
        state: bookings.state,
        pincode: bookings.pincode,
        specialRequests: bookings.specialRequests,
        invoiceNumber: bookings.invoiceNumber,
        roomType: bookings.roomType,
        bookingDate: bookings.bookingDate,
        updatedAt: bookings.updatedAt,
        photo: sql<string | null>`COALESCE(${customerProfiles.photo}, ${users.profileImage})`,
      }).from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .leftJoin(customerProfiles, eq(customerProfiles.userId, bookings.userId))
        .orderBy(desc(bookings.bookingDate));
      res.json({ success: true, bookings: allBookings });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/users/:id/profile", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const [user] = await db.select({
        id: users.id,
        name: users.name,
        profileImage: users.profileImage,
      }).from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/customers", async (req, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
        photo: sql<string | null>`COALESCE(${customerProfiles.photo}, ${users.profileImage})`,
        whatsappNumber: customerProfiles.whatsappNumber,
      }).from(users)
        .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
        .orderBy(desc(users.createdAt));
      res.json({ success: true, customers: allUsers });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/payments", async (req, res) => {
    try {
      const allPayments = await db.select().from(payments).orderBy(desc(payments.paymentDate));
      res.json({ success: true, payments: allPayments });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/documents", async (req, res) => {
    try {
      const allDocs = await db.select({
        id: documents.id,
        userId: documents.userId,
        bookingId: documents.bookingId,
        type: documents.type,
        fileName: documents.fileName,
        fileUrl: documents.fileUrl,
        uploadedAt: documents.uploadedAt,
        status: documents.status,
        adminComment: documents.adminComment,
        userName: users.name,
      }).from(documents)
        .leftJoin(users, eq(documents.userId, users.id))
        .orderBy(desc(documents.uploadedAt));
      res.json({ success: true, documents: allDocs });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/documents/update-status", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    try {
      const { documentId, status, adminComment } = req.body as {
        documentId?: number; status?: string; adminComment?: string;
      };
      if (!documentId || !status) {
        return res.status(400).json({ success: false, error: "documentId and status are required" });
      }
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ success: false, error: "status must be pending, approved, or rejected" });
      }
      if (status === "rejected" && !adminComment?.trim()) {
        return res.status(400).json({ success: false, error: "adminComment (rejection reason) is required when rejecting" });
      }

      const [doc] = await db.select().from(documents).where(eq(documents.id, Number(documentId)));
      if (!doc) return res.status(404).json({ success: false, error: "Document not found" });

      await db.update(documents)
        .set({ status, adminComment: adminComment?.trim() || null })
        .where(eq(documents.id, Number(documentId)));

      const [targetUser] = await db.select().from(users).where(eq(users.id, doc.userId));
      if (targetUser) {
        const docTypeLabel = doc.type.charAt(0).toUpperCase() + doc.type.slice(1).replace(/_/g, " ");
        const pushTitle = status === "approved"
          ? `✅ ${docTypeLabel} Approved`
          : status === "rejected"
            ? `❌ ${docTypeLabel} Rejected`
            : `📄 ${docTypeLabel} Status Updated`;
        const pushBody = status === "approved"
          ? `Your ${docTypeLabel} document has been approved by AL BURHAN TOURS & TRAVELS.`
          : status === "rejected"
            ? `Your ${docTypeLabel} document was rejected. Reason: ${adminComment?.trim()}. Please re-upload.`
            : `Your ${docTypeLabel} document status has been updated.`;
        // Include doc type in notification type key for proper dedup categorization
        const notifType = `doc_${doc.type}_${status}`;
        try {
          const pushResult = await sendPushToUser(db, doc.userId, {
            title: pushTitle,
            body: pushBody,
            data: { screen: "Documents", type: notifType },
          });
          if (!pushResult.skipped) {
            await db.insert(notifications).values({
              userId: doc.userId,
              title: pushTitle,
              type: notifType,
              channel: "push" as const,
              message: pushBody,
              status: (pushResult.expoSent + pushResult.fcmSent > 0) ? "sent" : "failed",
              retryCount: pushResult.totalRetries,
              ...(pushResult.errorCodes.length > 0 ? { errorMessage: pushResult.errorCodes.join(", ") } : {}),
            });
          }
          console.log(`[DocStatus] doc=${documentId} status=${status} user=${doc.userId} push=${JSON.stringify(pushResult)}`);
        } catch (pushErr: any) {
          console.error("[DocStatus] Push notification error:", pushErr.message);
        }
      }

      res.json({ success: true, documentId, status, adminComment: adminComment?.trim() || null });
    } catch (error: any) {
      console.error("[DocStatus] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/stats", async (req, res) => {
    try {
      const allBookings = await db.select().from(bookings);
      const allUsers = await db.select().from(users);
      const allPayments = await db.select().from(payments);
      const allDocs = await db.select().from(documents);

      const totalRevenue = allPayments
        .filter(p => p.status === "success")
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      const pendingBookings = allBookings.filter(b => b.status === "pending").length;
      const confirmedBookings = allBookings.filter(b => b.status === "confirmed").length;

      res.json({
        success: true,
        stats: {
          totalBookings: allBookings.length,
          totalCustomers: allUsers.length,
          totalRevenue,
          pendingBookings,
          confirmedBookings,
          totalPayments: allPayments.length,
          totalDocuments: allDocs.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/bookings/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const allowedStatuses = ["pending", "confirmed", "visa_approved", "ticket_issued", "travel_ready", "cancelled"];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status. Must be one of: " + allowedStatuses.join(", ") });
      }
      const [updated] = await db.update(bookings).set({
        status,
        updatedAt: new Date(),
      }).where(eq(bookings.id, parseInt(req.params.id))).returning();
      if (!updated) {
        return res.status(404).json({ success: false, error: "Booking not found" });
      }

      const statusMessages: Record<string, { title: string; body: string; screen: string }> = {
        confirmed:    { title: "🎉 Booking Confirmed!", body: "Assalamu Alaikum! Your booking is confirmed. Tap to view details.", screen: "BookingDetails" },
        visa_approved: { title: "📄 Visa Ready",        body: "Your visa is ready. Download now from your dashboard.",            screen: "Documents" },
        ticket_issued: { title: "🎫 Ticket Issued",     body: "Your flight ticket is ready. Tap to download.",                    screen: "Documents" },
        travel_ready: { title: "🧳 Travel Reminder",    body: "Your journey is coming soon. Please be ready with documents.",     screen: "BookingDetails" },
      };
      const notif = statusMessages[status];
      if (notif) {
        sendPushToUser(db, updated.userId, {
          title: notif.title,
          body: notif.body,
          data: { screen: notif.screen, bookingId: String(updated.id), status },
        }).catch((e: any) => console.error("[Push] status-change send error:", e.message));
      }

      res.json({ success: true, booking: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/upload-document", upload.single("file"), async (req: any, res) => {
    try {
      const { userId, type } = req.body;
      if (!userId || !type) {
        return res.status(400).json({ success: false, error: "userId and type are required" });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "File is required" });
      }
      const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "pdf", "doc", "docx"]);
      const ext = (file.originalname || "file").split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ success: false, error: `File type .${ext} not allowed` });
      }
      const client = getStorageClient();
      if (!client) {
        return res.status(500).json({ success: false, error: "Object storage not configured" });
      }
      const randomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 14);
      const storagePath = `public/documents/${userId}/${randomId}.${ext}`;
      const uploadResult = await client.uploadFromBytes(storagePath, file.buffer);
      if (!uploadResult.ok) {
        return res.status(500).json({ success: false, error: "File storage failed" });
      }
      const fileUrl = `/api/files/${storagePath}`;
      const [document] = await db.insert(documents).values({
        userId: parseInt(userId),
        bookingId: req.body.bookingId ? parseInt(req.body.bookingId) : null,
        type,
        fileName: file.originalname || "document",
        fileUrl,
      }).returning();
      console.log(`[Admin Upload] ${type} for user #${userId}: ${storagePath}`);

      const [targetUser] = await db.select().from(users).where(eq(users.id, parseInt(userId)));
      if (targetUser) {
        const docLabel = type === "visa" ? "Visa" : type === "ticket" ? "Ticket" : type;
        const message = `Assalamu Alaikum ${targetUser.name}, Your ${docLabel} document has been uploaded by AL BURHAN TOURS & TRAVELS. Please check your profile in the app to view it. JazakAllah Khair.`;
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:#047857;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
              <h2 style="margin:0">AL BURHAN TOURS & TRAVELS</h2>
            </div>
            <div style="background:#f0fdf4;padding:24px;border:1px solid #d1fae5">
              <p>Assalamu Alaikum <strong>${targetUser.name}</strong>,</p>
              <p>Your <strong>${docLabel}</strong> document has been uploaded to your profile.</p>
              <p>Please open the AL BURHAN app and check your Profile > Documents section to view and download it.</p>
              <p style="margin-top:20px;color:#6b7280;font-size:13px">JazakAllah Khair<br>AL BURHAN TOURS & TRAVELS Team</p>
            </div>
          </div>`;

        const smsResult = await sendSmsFast2SMS(targetUser.phone, message);
        const waDocResult = await sendWhatsAppBotBee(targetUser.phone, message);
        let whatsappResult = waDocResult.sent;
        if (!waDocResult.sent && waDocResult.blocked) {
          whatsappResult = await sendWhatsAppBookingTemplate(targetUser.phone, targetUser.name);
        }
        const emailResult = await sendEmail(targetUser.email, `Your ${docLabel} Document - AL BURHAN TOURS`, emailHtml);

        await db.insert(notifications).values({
          userId: parseInt(userId),
          type: "document_uploaded",
          channel: "all",
          message,
          status: (smsResult || whatsappResult || emailResult) ? "sent" : "pending",
        });
        console.log(`[Notification] Doc upload for user #${userId} - SMS:${smsResult} WhatsApp:${whatsappResult} Email:${emailResult}`);

        try {
          const docPushTitles: Record<string, string> = {
            visa: "📄 Visa Ready",
            ticket: "🎫 Ticket Issued",
            id_proof: "📋 Document Ready",
            passport: "📋 Document Ready",
          };
          const docPushBodies: Record<string, string> = {
            visa: "Your visa is ready. Download now from your dashboard.",
            ticket: "Your flight ticket is ready. Tap to download.",
            id_proof: "Your ID proof document is ready for download.",
            passport: "Your passport document is ready for download.",
          };
          await sendPushToUser(db, parseInt(userId), {
            title: docPushTitles[type] || "📋 Document Ready",
            body: docPushBodies[type] || `Your ${docLabel} document is ready for download.`,
            data: { screen: "Documents", type },
          });
        } catch (pushErr) {
          console.error("[Notification] Push notification error on doc upload:", pushErr);
        }
      }

      res.json({ success: true, document });
    } catch (error: any) {
      console.error("[Admin Upload] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/create-offline-invoice", async (req, res) => {
    try {
      const {
        contactName, contactPhone, contactEmail, address,
        packageId, numberOfPeople, totalAmount, paidAmount,
        travelers, roomType, specialRequests,
        sendWhatsapp
      } = req.body;

      if (!contactName || !contactPhone || !packageId || !totalAmount) {
        return res.status(400).json({ success: false, error: "Name, phone, package, and amount are required" });
      }

      let existingUser = await db.select().from(users).where(eq(users.phone, contactPhone));
      let userId: number;

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const hashedPassword = await bcrypt.hash("offline_" + Date.now(), 10);
        const [newUser] = await db.insert(users).values({
          name: contactName,
          email: contactEmail || contactName.toLowerCase().replace(/\s/g, '') + Date.now() + "@offline.local",
          phone: contactPhone,
          password: hashedPassword,
        }).returning();
        userId = newUser.id;
      }

      const invoiceNum = generateInvoiceNumber(0);

      const [booking] = await db.insert(bookings).values({
        userId,
        packageId: parseInt(packageId as string),
        numberOfPeople: numberOfPeople || 1,
        totalAmount,
        status: parseFloat(paidAmount || "0") >= parseFloat(totalAmount) ? "confirmed" : "pending",
        paymentStatus: parseFloat(paidAmount || "0") >= parseFloat(totalAmount) ? "completed" : parseFloat(paidAmount || "0") > 0 ? "partial" : "pending",
        paidAmount: paidAmount || "0",
        travelers: travelers || [{ name: contactName, age: 0, gender: "", passportNumber: "", passportIssue: "", passportExpiry: "" }],
        contactName,
        contactPhone,
        contactEmail: contactEmail || "",
        address: address || "",
        specialRequests: specialRequests || null,
        invoiceNumber: "",
        roomType: roomType || null,
      }).returning();

      const actualInvoiceNum = generateInvoiceNumber(booking.id);
      await db.update(bookings).set({ invoiceNumber: actualInvoiceNum }).where(eq(bookings.id, booking.id));

      if (parseFloat(paidAmount || "0") > 0) {
        await db.insert(payments).values({
          bookingId: booking.id,
          amount: paidAmount,
          paymentMethod: "offline",
          transactionId: "OFFLINE_" + Date.now(),
          status: "success",
        });
      }

      const invoiceUrl = `${getInvoiceBaseUrl()}/invoice/${booking.id}`;
      const totalAmt = parseFloat(totalAmount);
      const tcsAmount = totalAmt * 0.05;
      const grandTotal = totalAmt + tcsAmount;

      let offlinePackageName = "Hajj/Umrah Package";
      try {
        const [offlinePkg] = await db.select().from(packages).where(eq(packages.id, parseInt(packageId as string)));
        if (offlinePkg) offlinePackageName = offlinePkg.name;
      } catch (e) {}

      let notificationStatus = "";
      const message = `Assalamu Alaikum\n\nDear *${contactName}*\n\nYour booking with *Al Burhan Tours & Travels* has been confirmed.\n\nPackage: ${offlinePackageName}\nAmount Paid: ₹${formatINR(parseFloat(paidAmount || "0"))}\n\nYour invoice is attached below.\n${invoiceUrl}\n\nFor assistance please contact:\n9893225590\n9893989786\n\n*Al Burhan Tours & Travels*`;

      if (sendWhatsapp) {
        const waOfflineOk = await sendWhatsAppConfirmationTemplate(
          contactPhone,
          contactName,
          offlinePackageName,
          `INR ${formatINR(parseFloat(paidAmount || "0"))}`,
          invoiceUrl
        );
        notificationStatus += waOfflineOk ? "WhatsApp sent. " : "WhatsApp failed/skipped. ";
      }

      res.json({
        success: true,
        bookingId: booking.id,
        invoiceNumber: actualInvoiceNum,
        grandTotal,
        notificationStatus,
      });
    } catch (error: any) {
      console.error("[Offline Invoice] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/broadcast-notification", async (req, res) => {
    try {
      const { subject, message, title, imageUrl } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        return res.json({ success: true, message: "No customers to notify", sent: 0 });
      }

      const pushTitle = title || subject || "AL BURHAN TOURS & TRAVELS";

      const { sentUserIds, expoPushDeviceCount, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(
        db,
        { title: pushTitle, body: message, data: { screen: "/(tabs)/notifications", type: "broadcast" }, ...(imageUrl ? { imageUrl } : {}) },
        { type: "broadcast", message },
      );
      console.log(`[Broadcast] expo=${expoPushDeviceCount} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}${imageUrl ? " (with image)" : ""}`);

      const results: Array<{ userId: number; name: string; push: boolean }> = [];
      const failedErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : undefined;
      for (const u of allUsers) {
        const pushed = sentUserIds.has(u.id);
        const isDup = await isNotifDuplicate(db, u.id, "broadcast", message);
        if (!isDup) {
          await db.insert(notifications).values({
            userId: u.id,
            title: pushTitle,
            type: "broadcast",
            channel: "push",
            message,
            status: pushed ? "sent" : "failed",
            retryCount: pushed ? 0 : totalRetries,
            ...((!pushed && failedErrMsg) ? { errorMessage: failedErrMsg } : {}),
            metadata: { push: pushed, ...(imageUrl ? { imageUrl } : {}) },
          });
        }
        results.push({ userId: u.id, name: u.name, push: pushed });
      }

      res.json({ success: true, total: allUsers.length, sent: sentUserIds.size, results, expoPushCount: expoPushDeviceCount, fcmSent, fcmFailed, totalRetries });
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error("[Broadcast] Error:", err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/broadcast", async (req, res) => {
    try {
      const { subject, message, title, imageUrl } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        return res.json({ success: true, message: "No customers to notify", sent: 0 });
      }

      const pushTitle = title || subject || "AL BURHAN TOURS & TRAVELS";

      const { sentUserIds, expoPushDeviceCount, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(
        db,
        { title: pushTitle, body: message, data: { screen: "/(tabs)/notifications", type: "broadcast" }, ...(imageUrl ? { imageUrl } : {}) },
        { type: "broadcast", message },
      );
      console.log(`[Broadcast] expo=${expoPushDeviceCount} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}${imageUrl ? " (with image)" : ""}`);

      const results: Array<{ userId: number; name: string; push: boolean }> = [];
      const failedErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : undefined;
      for (const u of allUsers) {
        const pushed = sentUserIds.has(u.id);
        const isDup = await isNotifDuplicate(db, u.id, "broadcast", message);
        if (!isDup) {
          await db.insert(notifications).values({
            userId: u.id,
            title: pushTitle,
            type: "broadcast",
            channel: "push",
            message,
            status: pushed ? "sent" : "failed",
            retryCount: pushed ? 0 : totalRetries,
            ...((!pushed && failedErrMsg) ? { errorMessage: failedErrMsg } : {}),
            metadata: { push: pushed, ...(imageUrl ? { imageUrl } : {}) },
          });
        }
        results.push({ userId: u.id, name: u.name, push: pushed });
      }

      res.json({ success: true, total: allUsers.length, sent: sentUserIds.size, results, expoPushCount: expoPushDeviceCount, fcmSent, fcmFailed, totalRetries });
    } catch (error: any) {
      console.error("[Broadcast] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/notify-customer", async (req, res) => {
    try {
      const { phone, message, title, imageUrl } = req.body;
      if (!phone || !message) {
        return res.status(400).json({ success: false, error: "Phone and message are required" });
      }

      const [matchedUser] = await db.select().from(users).where(eq(users.phone, phone));
      if (!matchedUser) {
        return res.status(404).json({ success: false, error: "Customer not found with that phone number" });
      }

      const pushTitle = title || "AL BURHAN TOURS & TRAVELS";
      let push = false;

      // Send push notification — Expo + FCM fallback
      try {
        const pushResult = await sendPushToUser(db, matchedUser.id, {
          title: pushTitle,
          body: message,
          data: { screen: "/(tabs)/notifications", type: "admin_notify" },
          ...(imageUrl ? { imageUrl } : {}),
        }, matchedUser.phone ?? undefined);
        push = pushResult.expoSent > 0 || pushResult.fcmSent > 0;
        console.log(`[Push Notify] To ${matchedUser.phone}: expo=${pushResult.expoSent} fcm=${pushResult.fcmSent} fcmFailed=${pushResult.fcmFailed}${imageUrl ? " (with image)" : ""}`);
      } catch (e: any) {
        console.error("[Push Notify] Error:", e.message);
      }

      // Always save in-app notification card to DB
      await db.insert(notifications).values({
        userId: matchedUser.id,
        title: pushTitle,
        type: "single",
        channel: "push",
        message,
        status: "sent",
        metadata: { push, ...(imageUrl ? { imageUrl } : {}) },
      });

      console.log(`[Admin Notify Customer] phone=${phone} push=${push}`);
      res.json({ success: true, push, customerName: matchedUser.name });
    } catch (error: any) {
      console.error("[Admin Notify Customer] Error:", error);
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/admin/notification-history", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const rows = await db.select({
        id: notifications.id,
        type: notifications.type,
        channel: notifications.channel,
        message: notifications.message,
        status: notifications.status,
        sentAt: notifications.sentAt,
        metadata: notifications.metadata,
        retryCount: notifications.retryCount,
        errorMessage: notifications.errorMessage,
        userName: users.name,
        userPhone: users.phone,
      }).from(notifications)
        .leftJoin(users, eq(notifications.userId, users.id))
        .orderBy(desc(notifications.sentAt))
        .limit(limit);
      res.json({ success: true, history: rows, total: rows.length });
    } catch (error: any) {
      console.error("[Notification History] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Push Delivery Logs Endpoint ─────────────────────────────────────────────

  app.get("/api/admin/push-delivery-logs", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const rows = await db.select({
        id: pushDeliveryLogs.id,
        userId: pushDeliveryLogs.userId,
        channel: pushDeliveryLogs.channel,
        status: pushDeliveryLogs.status,
        errorCode: pushDeliveryLogs.errorCode,
        title: pushDeliveryLogs.title,
        tokenPrefix: pushDeliveryLogs.tokenPrefix,
        sentAt: pushDeliveryLogs.sentAt,
        userName: users.name,
        userPhone: users.phone,
      })
        .from(pushDeliveryLogs)
        .leftJoin(users, eq(pushDeliveryLogs.userId, users.id))
        .orderBy(desc(pushDeliveryLogs.sentAt))
        .limit(limit);
      const total = rows.length;
      const sent = rows.filter(r => r.status === "sent").length;
      const failed = rows.filter(r => r.status === "failed").length;
      res.json({ success: true, logs: rows, total, sent, failed });
    } catch (error: any) {
      console.error("[Push Delivery Logs] Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Admin: Purge legacy stale tokens (isInvalid = true) ────────────────────
  // Tokens are now deleted immediately on detection; this endpoint removes any
  // legacy rows that were only marked invalid before the deletion policy was applied.

  app.delete("/api/admin/device-tokens/purge-stale", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      // Only remove tokens that were marked invalid >7 days ago.
      // Tokens are now deleted immediately on detection; this endpoint cleans up
      // any legacy rows still flagged from before the deletion policy was applied.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staleRows = await db
        .select({ id: deviceTokens.id, userId: deviceTokens.userId, invalidReason: deviceTokens.invalidReason })
        .from(deviceTokens)
        .where(and(eq(deviceTokens.isInvalid, true), lte(deviceTokens.updatedAt, sevenDaysAgo)));
      if (staleRows.length === 0) {
        return res.json({ success: true, deleted: 0, message: "No stale tokens older than 7 days found" });
      }
      const ids = staleRows.map(r => r.id);
      for (const id of ids) {
        await db.delete(deviceTokens).where(eq(deviceTokens.id, id));
      }
      console.log(`[Admin] Purged ${ids.length} stale device token(s) (flagged >7 days ago)`);
      res.json({ success: true, deleted: ids.length, message: `Deleted ${ids.length} stale token(s) flagged more than 7 days ago` });
    } catch (error: any) {
      console.error("[Admin] Purge stale tokens error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Notification Stats Endpoint ────────────────────────────────────────────

  app.get("/api/admin/notifications/stats", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Unauthorized" });
    try {
      const statRows = await db.select({
        status: notifications.status,
        cnt: count(),
      }).from(notifications).groupBy(notifications.status);
      const total = statRows.reduce((s, r) => s + Number(r.cnt), 0);
      const sent = Number(statRows.find(r => r.status === "sent")?.cnt ?? 0);
      const failed = Number(statRows.find(r => r.status === "failed")?.cnt ?? 0);
      const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;
      const [retriableRow] = await db.select({ cnt: count() }).from(notifications)
        .where(and(eq(notifications.status, "failed"), lt(notifications.retryCount, 3)));
      const retriable = Number(retriableRow?.cnt ?? 0);
      res.json({ success: true, stats: { total, sent, failed, successRate, retriable } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Retry Failed Notifications Endpoint ────────────────────────────────────

  app.post("/api/admin/notifications/retry-failed", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Unauthorized" });
    const MAX_RETRY = 3;
    try {
      const failedNotifs = await db.select({
        id: notifications.id,
        userId: notifications.userId,
        title: notifications.title,
        message: notifications.message,
        type: notifications.type,
        channel: notifications.channel,
        retryCount: notifications.retryCount,
      }).from(notifications)
        .where(and(eq(notifications.status, "failed"), lt(notifications.retryCount, MAX_RETRY)))
        .limit(50);

      let retried = 0;
      let succeeded = 0;
      let stillFailed = 0;
      let tokensCleaned = 0;

      for (const notif of failedNotifs) {
        if (notif.channel !== "push" || !notif.userId) continue;
        const newRetryCount = (notif.retryCount || 0) + 1;
        retried++;
        try {
          const result = await sendPushToUser(db, notif.userId, {
            title: notif.title || "Notification",
            body: notif.message || "",
            data: { screen: "/(tabs)/notifications", type: notif.type || "general" },
          }, undefined, { skipDedup: true });

          const success = (result.expoSent + result.fcmSent) > 0 && !result.skipped;
          const errCategory = result.errorCodes.length > 0 ? classifyPushError(result.errorCodes) : null;
          const isInvalidToken = errCategory === "invalid token";
          if (isInvalidToken) tokensCleaned++;

          await db.update(notifications).set({
            status: success ? "sent" : "failed",
            retryCount: newRetryCount,
            ...(errCategory && !success ? { errorMessage: `${errCategory}: ${result.errorCodes.slice(0, 3).join(", ")}` } : {}),
          }).where(eq(notifications.id, notif.id));

          if (success) succeeded++; else stillFailed++;
          console.log(`[Retry] notifId=${notif.id} userId=${notif.userId} attempt=${newRetryCount} success=${success}`);
        } catch (e: any) {
          console.error(`[Retry] notifId=${notif.id} error:`, e.message);
          await db.update(notifications).set({
            retryCount: newRetryCount,
            errorMessage: `network issue: ${e.message}`,
          }).where(eq(notifications.id, notif.id));
          stillFailed++;
        }
      }

      res.json({ success: true, retried, succeeded, stillFailed, tokensCleaned });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  app.get("/api/notifications", async (req: any, res) => {
    try {
      let userId: number | undefined = req.session?.userId;
      if (!userId) {
        const headerUserId = req.headers["x-user-id"];
        const headerToken = req.headers["x-user-token"];
        const parsedId = headerUserId ? Number(headerUserId) : NaN;
        if (Number.isInteger(parsedId) && parsedId > 0 && typeof headerToken === "string" && headerToken.length === 64) {
          if (verifyUserToken(parsedId, headerToken)) {
            const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedId));
            if (dbUser) userId = dbUser.id;
          }
        }
      }
      if (!userId) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const userNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get("/api/notifications/user/:userId", async (req: any, res) => {
    try {
      const requestedId = parseInt(req.params.userId);
      const sessionUserId = req.session?.userId;
      const isAdmin = req.session?.adminLoggedIn;
      if (!isAdmin && sessionUserId !== requestedId) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      const userNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, requestedId))
        .orderBy(desc(notifications.sentAt));
      res.json({ success: true, notifications: userNotifications });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  const ADMIN_USER = (process.env.ADMIN_USERNAME || "admin").trim();
  const ADMIN_PASS = (process.env.ADMIN_PASSWORD || "").trim();
  console.log(`[Admin] Username configured: "${ADMIN_USER}" | Password set: ${!!ADMIN_PASS}`);

  function requireAdminAuth(req: any, res: any, next: any) {
    if (req.session && req.session.adminLoggedIn) return next();
    return res.redirect("/admin/login");
  }

  const loginPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login — Al Burhan Tours</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #065f46 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 20px; padding: 40px; width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo h1 { color: #047857; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .logo p { color: #6b7280; font-size: 13px; margin-top: 4px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    input { width: 100%; padding: 11px 14px; border: 1.5px solid #d1d5db; border-radius: 10px; font-size: 14px; outline: none; transition: border-color 0.2s; margin-bottom: 16px; }
    input:focus { border-color: #047857; box-shadow: 0 0 0 3px rgba(4,120,87,0.1); }
    button { width: 100%; padding: 12px; background: linear-gradient(135deg, #047857, #059669); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    button:hover { background: linear-gradient(135deg, #065f46, #047857); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(4,120,87,0.35); }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
    .badge { display: block; text-align: center; color: #d97706; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>AL BURHAN TOURS & TRAVELS</h1>
      <p>Hajj &amp; Umrah Specialists</p>
    </div>
    <span class="badge">Admin Portal</span>
    {{ERROR}}
    <form method="POST" action="/admin/login">
      <label>Username</label>
      <input type="text" name="username" required autocomplete="username" placeholder="Enter username">
      <label>Password</label>
      <input type="password" name="password" required autocomplete="current-password" placeholder="Enter password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;

  app.get("/admin/login", (req: any, res: any) => {
    if (req.session && req.session.adminLoggedIn) return res.redirect("/admin");
    res.send(loginPageHtml.replace("{{ERROR}}", ""));
  });

  app.post("/admin/login", (req: any, res: any) => {
    const { username, password } = req.body || {};
    console.log(`[Admin] Login attempt - username_match: ${username?.trim() === ADMIN_USER}, password_match: ${password?.trim() === ADMIN_PASS}, body_keys: ${Object.keys(req.body || {}).join(",")}`);
    if (!ADMIN_PASS) {
      return res.send(loginPageHtml.replace("{{ERROR}}", '<div class="error">Admin password not configured. Set the ADMIN_PASSWORD secret.</div>'));
    }
    if (username?.trim() === ADMIN_USER && password?.trim() === ADMIN_PASS) {
      req.session.adminLoggedIn = true;
      return res.redirect("/admin");
    }
    res.send(loginPageHtml.replace("{{ERROR}}", '<div class="error">Invalid username or password.</div>'));
  });

  app.post("/api/admin/test-whatsapp", async (req, res) => {
    try {
      const { phone, template } = req.body as { phone: string; template: string };
      if (!phone || !template) {
        return res.status(400).json({ success: false, error: "phone and template are required" });
      }
      const otp = "123456";
      const testInvoiceUrl = `https://al-burhan-tours-and-travels.replit.app/i/test`;
      let result: { success: boolean; raw: any };
      if (template === "otp") {
        result = await sendWhatsAppTemplate(phone, "alburhan_login_otp", "en_US", [
          { type: "body", parameters: [{ type: "text", text: otp }] },
          { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: otp }] },
        ]);
      } else if (template === "booking") {
        result = await sendWhatsAppTemplate(phone, "booking", "en_GB", [
          { type: "header", parameters: [{ type: "image", image: { link: WHATSAPP_HEADER_IMAGE } }] },
          { type: "body", parameters: [{ type: "text", text: "Test Customer" }] },
        ]);
      } else if (template === "conformation") {
        result = await sendWhatsAppTemplate(phone, "conformation", "en_GB", [
          { type: "body", parameters: [
            { type: "text", text: "Test Customer" },
            { type: "text", text: "Hajj Package 2025" },
            { type: "text", text: "₹10,000" },
            { type: "text", text: testInvoiceUrl },
          ]},
        ]);
      } else {
        return res.status(400).json({ success: false, error: `Unknown template: ${template}. Use otp, booking, or conformation` });
      }
      console.log(`[Admin WhatsApp Test] template=${template} phone=${phone} success=${result.success}`);
      res.json({ success: result.success, raw: result.raw });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/test-push", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    interface TestPushBody { userId?: number; expoPushToken?: string }
    const { userId, expoPushToken: rawToken } = req.body as TestPushBody;

    if (!userId && !rawToken) {
      return res.status(400).json({ success: false, error: "Provide userId (to use stored token) or expoPushToken" });
    }

    try {
      if (userId) {
        // Use unified sendPushToUser (handles both Expo + FCM)
        const result = await sendPushToUser(db, userId, {
          title: "Test Notification",
          body: "Hello from Al Burhan! Push is working ✅",
          data: { screen: "/(tabs)/notifications", type: "test" },
        }, undefined, { skipDedup: true });
        const total = result.expoSent + result.fcmSent;
        console.log(`[Admin TestPush] userId=${userId} expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? 'n/a'} errors=${result.errorCodes.join(',') || 'none'}`);
        if (result.skipped && result.skipReason === "no_token") {
          return res.status(404).json({ success: false, error: `No push token registered for userId=${userId}. The user must open the app and allow notifications.` });
        }
        if (total === 0) {
          const errMsg = result.errorCodes.length > 0 ? result.errorCodes.join(", ") : "Push delivery failed — token found but Expo API returned an error";
          return res.status(200).json({ success: false, error: errMsg, expoSent: 0, fcmSent: 0, fcmFailed: result.fcmFailed });
        }
        res.json({ success: true, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, raw: { status: "ok" } });
      } else {
        // Manual token provided — send via Expo API
        const resolvedToken = rawToken as string;
        interface ExpoPushSingleResponse { data?: { status: string; message?: string } }
        const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            to: resolvedToken,
            sound: "default",
            channelId: "alburhan-push",
            priority: "high",
            title: "Test Notification",
            body: "Hello from Al Burhan!",
          }),
        });
        const expoData = await expoRes.json() as ExpoPushSingleResponse;
        console.log(`[Admin TestPush] manual token=...${resolvedToken.slice(-8)} status=${expoData?.data?.status}`);
        if (!expoRes.ok) {
          return res.status(502).json({ success: false, error: "Expo Push API error", raw: expoData });
        }
        const delivered = expoData?.data?.status !== "error";
        res.json({ success: delivered, token: "..." + resolvedToken.slice(-8), raw: expoData });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Operational notification type definitions (pilgrimage-specific updates)
  const OPERATIONAL_NOTIFICATION_TYPES: Record<string, { title: string; body: string; screen: string }> = {
    flight:          { title: "✈️ Flight Update",      body: "Your flight schedule has been updated. Check details now.",    screen: "BookingDetails" },
    travel_reminder: { title: "🧳 Travel Reminder",    body: "Your journey is coming soon. Please be ready with documents.", screen: "BookingDetails" },
    meena:           { title: "🕋 Meena Update",       body: "You have reached Meena. Follow group instructions.",           screen: "Updates" },
    madinah:         { title: "🕌 Welcome to Madinah", body: "You have arrived in Madinah. Stay blessed.",                   screen: "Updates" },
    ziyarat:         { title: "🚌 Ziyarat Schedule",   body: "Your Ziyarat trip is scheduled. Be ready on time.",           screen: "Schedule" },
    laundry:         { title: "🧺 Laundry Ready",      body: "Your laundry is ready for pickup.",                           screen: "Services" },
    food:            { title: "🍽️ Food Ready",          body: "Your meal is ready. Please collect now.",                     screen: "Services" },
  };

  app.post("/api/admin/send-operational-notification", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    const { type, userId, broadcastAll, groupId, bookingId } = req.body as {
      type?: string;
      userId?: number;
      broadcastAll?: boolean;
      groupId?: number;
      bookingId?: string;
    };
    if (!type || !OPERATIONAL_NOTIFICATION_TYPES[type]) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${Object.keys(OPERATIONAL_NOTIFICATION_TYPES).join(", ")}`,
      });
    }
    if (!broadcastAll && !userId && !groupId) {
      return res.status(400).json({ success: false, error: "Either userId, groupId, or broadcastAll:true is required" });
    }
    const { title, body, screen } = OPERATIONAL_NOTIFICATION_TYPES[type];
    const data: Record<string, string> = { type, screen };
    if (bookingId) data.bookingId = String(bookingId);
    try {
      if (broadcastAll) {
        const { sentUserIds, fcmSent, fcmFailed, totalRetries, errorCodes } = await broadcastPush(db, { title, body, data }, { type, message: body });
        console.log(`[Admin Operational] broadcast type=${type} fcm=${fcmSent} fcmFailed=${fcmFailed} retries=${totalRetries}`);
        const broadcastErrMsg = errorCodes.length > 0 ? errorCodes.join(", ") : undefined;
        const allUsers = await db.select({ id: users.id }).from(users);
        for (const u of allUsers) {
          const pushed = sentUserIds.has(u.id);
          const isDup = await isNotifDuplicate(db, u.id, type, body);
          if (!isDup) {
            await db.insert(notifications).values({
              userId: u.id, title, type, channel: "push", message: body,
              status: pushed ? "sent" : "failed",
              retryCount: pushed ? 0 : totalRetries,
              ...((!pushed && broadcastErrMsg) ? { errorMessage: broadcastErrMsg } : {}),
            });
          }
        }
        return res.json({ success: true, broadcast: true, fcmSent, fcmFailed, sentCount: sentUserIds.size, totalRetries });
      } else if (groupId) {
        const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, Number(groupId)));
        if (members.length === 0) return res.json({ success: true, group: true, groupId, sent: 0, message: "Group has no members" });
        let totalExpo = 0, totalFcm = 0, totalFailed = 0, skipped = 0, totalRetries = 0;
        for (const m of members) {
          const r = await sendPushToUser(db, m.userId, { title, body, data });
          if (r.skipped) { skipped++; continue; }
          totalExpo += r.expoSent; totalFcm += r.fcmSent; totalFailed += r.fcmFailed; totalRetries += r.totalRetries;
          const delivered = r.expoSent + r.fcmSent > 0;
          const errMsg = !delivered && r.errorCodes.length > 0 ? r.errorCodes.join(", ") : undefined;
          await db.insert(notifications).values({
            userId: m.userId, title, type, channel: "push", message: body,
            status: delivered ? "sent" : "failed",
            retryCount: r.totalRetries,
            ...(errMsg ? { errorMessage: errMsg } : {}),
          });
        }
        console.log(`[Admin Operational] group groupId=${groupId} type=${type} targets=${members.length} expo=${totalExpo} fcm=${totalFcm} failed=${totalFailed} skipped=${skipped} retries=${totalRetries}`);
        return res.json({ success: true, group: true, groupId, sent: members.length - skipped, skipped, expoSent: totalExpo, fcmSent: totalFcm, fcmFailed: totalFailed, totalRetries });
      } else {
        const result = await sendPushToUser(db, Number(userId), { title, body, data });
        const totalSent = result.expoSent + result.fcmSent;
        console.log(`[Admin Operational] userId=${userId} type=${type} expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? 'n/a'} errors=${result.errorCodes.join(',') || 'none'}`);
        if (result.skipped && result.skipReason === "no_token") {
          return res.status(404).json({ success: false, error: `No push token found for userId=${userId}. User must open the app and allow notifications.` });
        }
        if (result.skipped && result.skipReason === "dedup") {
          return res.json({ success: false, error: "Duplicate: same notification sent in the last 24 hours." });
        }
        const delivered = totalSent > 0;
        const errMsg = !delivered && result.errorCodes.length > 0 ? result.errorCodes.join(", ") : undefined;
        await db.insert(notifications).values({
          userId: Number(userId), title, type, channel: "push", message: body,
          status: delivered ? "sent" : "failed",
          retryCount: result.totalRetries,
          ...(errMsg ? { errorMessage: errMsg } : {}),
        });
        return res.json({ success: delivered, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, totalRetries: result.totalRetries });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/send-push-to-user", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Admin authentication required" });
    }
    const { userId, title, message, image } = req.body as { userId?: number; title?: string; message?: string; image?: string };
    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, error: "userId, title, and message are required" });
    }
    try {
      const result = await sendPushToUser(db, Number(userId), {
        title,
        body: message,
        data: { screen: "/notifications", type: "admin_manual" },
        ...(image ? { imageUrl: image } : {}),
      });
      const totalSent = result.expoSent + result.fcmSent;
      console.log(`[Admin SendPush] userId=${userId} title="${title}" expo=${result.expoSent} fcm=${result.fcmSent} fcmFailed=${result.fcmFailed} skipped=${result.skipped} skipReason=${result.skipReason ?? 'n/a'} errors=${result.errorCodes.join(',') || 'none'}`);
      if (result.skipped && result.skipReason === "no_token") {
        return res.status(404).json({ success: false, error: `No push token found for userId=${userId}. User must open the app and allow notifications.` });
      }
      if (result.skipped && result.skipReason === "dedup") {
        return res.json({ success: false, error: "Duplicate: same notification sent within the last 24 hours. Try a different message or wait." });
      }
      if (totalSent === 0) {
        const errMsg = result.errorCodes.length > 0 ? result.errorCodes.join(", ") : "Push delivery failed";
        return res.status(200).json({ success: false, error: errMsg, expoSent: 0, fcmSent: 0, fcmFailed: result.fcmFailed });
      }
      res.json({ success: true, expoSent: result.expoSent, fcmSent: result.fcmSent, fcmFailed: result.fcmFailed, tokenCount: totalSent });
    } catch (err: unknown) {
      const e = err as { message?: string };
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── Group Management Endpoints ──────────────────────────────────────
  app.get("/api/admin/groups", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    try {
      const allGroups = await db.select().from(groups).orderBy(desc(groups.createdAt));
      const memberCounts = await db
        .select({ groupId: groupMembers.groupId, count: sql<number>`count(*)::int` })
        .from(groupMembers)
        .groupBy(groupMembers.groupId);
      const countMap = Object.fromEntries(memberCounts.map(r => [r.groupId, r.count]));
      res.json({ success: true, groups: allGroups.map(g => ({ ...g, memberCount: countMap[g.id] ?? 0 })) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/groups", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) return res.status(400).json({ success: false, error: "Group name is required" });
    try {
      const [group] = await db.insert(groups).values({ name: name.trim(), description: description?.trim() || null }).returning();
      res.json({ success: true, group });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/admin/groups/:id", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    try {
      await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
      await db.delete(groups).where(eq(groups.id, groupId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/admin/groups/:id/members", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    try {
      const members = await db
        .select({ id: groupMembers.id, userId: groupMembers.userId, addedAt: groupMembers.addedAt, name: users.name, email: users.email, phone: users.phone })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, groupId))
        .orderBy(groupMembers.addedAt);
      res.json({ success: true, members });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/groups/:id/members", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    const { userId } = req.body as { userId?: number };
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    try {
      const existing = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, Number(userId))));
      if (existing.length > 0) return res.status(409).json({ success: false, error: "User is already in this group" });
      const [member] = await db.insert(groupMembers).values({ groupId, userId: Number(userId) }).returning();
      res.json({ success: true, member });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/admin/groups/:id/members/:userId", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const groupId = Number(req.params.id);
    const userId = Number(req.params.userId);
    try {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Unified Send-Notification endpoint ──────────────────────────────
  // Handles all targeting: single user, group, broadcast — with optional bookingStatus / bookingId filters
  app.post("/api/admin/send-notification", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) return res.status(401).json({ success: false, error: "Admin authentication required" });
    const {
      type, title, message,
      targetType,   // 'user' | 'group' | 'all'
      userId,
      groupId,
      bookingStatus,  // optional filter
      bookingId,      // optional: resolve user from booking
      imageUrl,       // optional: image URL for rich push notification
    } = req.body as {
      type?: string; title?: string; message?: string;
      targetType?: string; userId?: number; groupId?: number;
      bookingStatus?: string; bookingId?: number; imageUrl?: string;
    };

    if (!title || !message) return res.status(400).json({ success: false, error: "title and message are required" });
    if (!bookingId && targetType !== undefined && !["user", "group", "all"].includes(targetType)) {
      return res.status(400).json({ success: false, error: `Invalid targetType "${targetType}". Must be one of: user, group, all` });
    }

    const notifType = type || "admin_manual";
    const screen = (notifType in OPERATIONAL_NOTIFICATION_TYPES)
      ? OPERATIONAL_NOTIFICATION_TYPES[notifType].screen
      : "Notifications";
    const data: Record<string, string> = { type: notifType, screen };
    if (bookingId) data.bookingId = String(bookingId);

    try {
      // ── Helper: filter userIds by bookingStatus ──
      async function filterByStatus(userIds: number[], status: string): Promise<number[]> {
        if (!status) return userIds;
        const matchingBookings = await db
          .select({ userId: bookings.userId })
          .from(bookings)
          .where(and(inArray(bookings.userId, userIds), eq(bookings.status, status)));
        const matchingIds = new Set(matchingBookings.map((b: any) => b.userId));
        return userIds.filter(id => matchingIds.has(id));
      }

      // ── Helper: build notification insert values from send result ──
      function buildNotifValues(uid: number, r: { expoSent: number; fcmSent: number; fcmFailed: number; totalRetries: number; errorCodes: string[] }, bkId?: number) {
        const delivered = r.expoSent + r.fcmSent > 0;
        const errMsg = !delivered && r.errorCodes.length > 0 ? r.errorCodes.join(", ") : undefined;
        return {
          userId: uid,
          ...(bkId ? { bookingId: bkId } : {}),
          title,
          type: notifType,
          channel: "push" as const,
          message,
          status: delivered ? "sent" : "failed",
          retryCount: r.totalRetries,
          ...(errMsg ? { errorMessage: errMsg } : {}),
          metadata: { push: r.expoSent + r.fcmSent > 0, ...(imageUrl ? { imageUrl } : {}) },
        };
      }

      // ── Target: single user from bookingId ──
      if (bookingId) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, Number(bookingId)));
        if (!booking) return res.status(404).json({ success: false, error: `Booking #${bookingId} not found` });
        if (bookingStatus && booking.status !== bookingStatus) {
          return res.status(400).json({ success: false, error: `Booking #${bookingId} has status "${booking.status}", not "${bookingStatus}"` });
        }
        const result = await sendPushToUser(db, booking.userId, { title, body: message, data, ...(imageUrl ? { imageUrl } : {}) });
        if (!result.skipped) {
          await db.insert(notifications).values(buildNotifValues(booking.userId, result, Number(bookingId)));
        }
        const delivered = result.expoSent + result.fcmSent > 0;
        return res.json({
          success: delivered,
          targeted: "booking",
          bookingId,
          userId: booking.userId,
          ...result,
          ...(result.skipReason === "no_token" ? { error: "No device token registered for this user" } : {}),
        });
      }

      // ── Target: single user ──
      if (targetType === "user") {
        if (!userId) return res.status(400).json({ success: false, error: "userId is required for targetType=user" });
        const uid = Number(userId);
        const result = await sendPushToUser(db, uid, { title, body: message, data, ...(imageUrl ? { imageUrl } : {}) });
        if (!result.skipped) {
          await db.insert(notifications).values(buildNotifValues(uid, result));
        }
        const delivered = result.expoSent + result.fcmSent > 0;
        return res.json({
          success: delivered,
          targeted: "user",
          userId,
          ...result,
          ...(result.skipReason === "no_token" ? { error: "No device token registered for this user" } : {}),
        });
      }

      // ── Target: group ──
      if (targetType === "group") {
        if (!groupId) return res.status(400).json({ success: false, error: "groupId is required for targetType=group" });
        const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, Number(groupId)));
        if (members.length === 0) return res.json({ success: true, targeted: "group", groupId, sent: 0, message: "Group has no members" });
        let targetIds = members.map(m => m.userId).filter((id): id is number => id !== null);
        if (bookingStatus) targetIds = await filterByStatus(targetIds, bookingStatus);
        if (targetIds.length === 0) return res.json({ success: true, targeted: "group", groupId, sent: 0, message: "No members match the booking status filter" });
        let totalExpo = 0, totalFcm = 0, totalFailed = 0, skipped = 0;
        for (const uid of targetIds) {
          const r = await sendPushToUser(db, uid, { title, body: message, data, ...(imageUrl ? { imageUrl } : {}) });
          if (r.skipped) { skipped++; continue; }
          totalExpo += r.expoSent; totalFcm += r.fcmSent; totalFailed += r.fcmFailed;
          await db.insert(notifications).values(buildNotifValues(uid, r));
        }
        console.log(`[Notify Group] groupId=${groupId} targets=${targetIds.length} expo=${totalExpo} fcm=${totalFcm} failed=${totalFailed} skipped=${skipped}`);
        return res.json({ success: true, targeted: "group", groupId, sent: targetIds.length - skipped, skipped, expoSent: totalExpo, fcmSent: totalFcm, fcmFailed: totalFailed });
      }

      // ── Target: broadcast all ──
      let allUserIds = (await db.select({ id: users.id }).from(users)).map(u => u.id);
      if (bookingStatus) allUserIds = await filterByStatus(allUserIds, bookingStatus);
      if (allUserIds.length === 0) return res.json({ success: true, targeted: "all", sent: 0, message: "No users match the booking status filter" });
      let totalExpo = 0, totalFcm = 0, totalFailed = 0, skipped = 0;
      for (const uid of allUserIds) {
        const r = await sendPushToUser(db, uid, { title, body: message, data, ...(imageUrl ? { imageUrl } : {}) });
        if (r.skipped) { skipped++; continue; }
        totalExpo += r.expoSent; totalFcm += r.fcmSent; totalFailed += r.fcmFailed;
        await db.insert(notifications).values(buildNotifValues(uid, r));
      }
      console.log(`[Notify Broadcast] targets=${allUserIds.length} sent=${allUserIds.length - skipped} skipped=${skipped} expo=${totalExpo} fcm=${totalFcm} failed=${totalFailed}${bookingStatus ? ` filter=${bookingStatus}` : ""}`);
      return res.json({ success: true, targeted: "all", sent: allUserIds.length - skipped, skipped, expoSent: totalExpo, fcmSent: totalFcm, fcmFailed: totalFailed });

    } catch (err: any) {
      console.error("[Notify] Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/admin/logout", (req: any, res: any) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });

  app.get("/admin", requireAdminAuth, (req, res) => {
    const templatePath = join(process.cwd(), "server", "templates", "admin-dashboard.html");
    if (existsSync(templatePath)) {
      try {
        let html = readFileSync(templatePath, "utf-8");
        let firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "";
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            firebaseProjectId = sa.project_id || firebaseProjectId;
          } catch (_) {}
        }
        html = html.replace(/\{\{FIREBASE_PROJECT_ID\}\}/g, firebaseProjectId);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
      } catch (_) {
        res.sendFile(templatePath);
      }
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });

  const serveTemplate = (templateName: string) => (req: any, res: any) => {
    const templatePath = join(process.cwd(), "server", "templates", templateName);
    if (existsSync(templatePath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Page not found");
    }
  };

  app.get("/privacy-policy", serveTemplate("privacy-policy.html"));
  app.get("/terms-and-conditions", serveTemplate("terms-and-conditions.html"));
  app.get("/refund-policy", serveTemplate("refund-policy.html"));
  app.get("/delete-account", serveTemplate("delete-account.html"));

  app.get("/a", (req, res) => {
    const ua = req.headers["user-agent"] || "";
    if (/android/i.test(ua)) {
      res.redirect("https://play.google.com/store/apps/details?id=com.alburhantours.app");
    } else {
      res.redirect("https://apps.apple.com/app/id6760983020");
    }
  });

  app.get("/support", (req, res) => {
    res.send(`
    <html>
    <head>
      <title>Support - Al Burhan Tours & Travels</title>
      <style>
        body { font-family: Arial; padding: 20px; line-height: 1.6; }
        h1 { color: #2c3e50; }
        .box { margin-top: 20px; padding: 15px; background: #f4f4f4; border-radius: 8px; }
      </style>
    </head>
    <body>

    <h1>Customer Support</h1>

    <p>Welcome to Al Burhan Tours & Travels support. We are here to assist you with your Hajj, Umrah, and travel bookings.</p>

    <div class="box">
      <h2>📞 Contact Information</h2>
      <p><strong>Phone:</strong> +91 9893225590</p>
      <p><strong>Email:</strong> info@alburhantravels.com</p>
      <p><strong>Address:</strong><br>
      8-5, Khanka Masjid Complex,<br>
      Lalbagh Rd, Burhanpur,<br>
      Madhya Pradesh 450331</p>
    </div>

    <div class="box">
      <h2>🕒 Working Hours</h2>
      <p>Monday - Saturday: 10:00 AM – 7:00 PM</p>
      <p>Sunday: Closed</p>
    </div>

    <div class="box">
      <h2>💬 Quick Help</h2>
      <p>For faster assistance, contact us via WhatsApp or call directly.</p>
    </div>

    </body>
    </html>
    `);
  });

  app.post("/api/user/device-token", async (req: any, res: any) => {
    let effectiveUserId: number | undefined = req.session?.userId;
    let authSource = "session";
    if (!effectiveUserId) {
      // Header-based auth (X-User-Id + X-User-Token)
      const headerUserId = req.headers["x-user-id"];
      const headerToken = req.headers["x-user-token"];
      const parsedHeaderId = headerUserId !== undefined ? Number(headerUserId) : NaN;
      if (Number.isInteger(parsedHeaderId) && parsedHeaderId > 0 && typeof headerToken === "string") {
        if (headerToken.length === 64 && verifyUserToken(parsedHeaderId, headerToken)) {
          const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedHeaderId));
          if (dbUser) { effectiveUserId = dbUser.id; authSource = "header"; }
        }
      }
    }
    if (!effectiveUserId) {
      // Body-based auth (userId + userToken)
      const rawBodyId = req.body?.userId;
      const bodyToken = req.body?.userToken;
      const parsedBodyId = rawBodyId !== undefined ? Number(rawBodyId) : NaN;
      if (Number.isInteger(parsedBodyId) && parsedBodyId > 0) {
        if (typeof bodyToken !== "string" || bodyToken.length !== 64 || !verifyUserToken(parsedBodyId, bodyToken)) {
          return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsedBodyId));
        if (!dbUser) return res.status(401).json({ success: false, error: "Not authenticated" });
        effectiveUserId = dbUser.id;
        authSource = "body";
      }
    }
    if (!effectiveUserId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { token, platform, expoPushToken: bodyExpoPushToken } = req.body;
      if (!platform) {
        return res.status(400).json({ success: false, error: "platform is required" });
      }

      // Classify the tokens provided
      const hasFcmToken = typeof token === 'string' && token.length > 0 && !token.startsWith('ExponentPushToken');
      const hasExpoPushToken = typeof bodyExpoPushToken === 'string' && bodyExpoPushToken.startsWith('ExponentPushToken');

      if (!hasFcmToken && !hasExpoPushToken) {
        console.warn(`[DeviceToken] Rejected — no valid token in request for userId=${effectiveUserId} (token=${String(token ?? '').slice(0, 20)}, expoPushToken=${String(bodyExpoPushToken ?? '').slice(0, 20)})`);
        return res.status(400).json({ success: false, error: "At least one valid token (FCM or Expo push) is required" });
      }

      // Atomic upsert keyed by (userId, platform) — insert or update, never double-select
      await db.insert(deviceTokens)
        .values({
          userId: effectiveUserId,
          token: hasFcmToken ? token : "",
          platform,
          expoPushToken: hasExpoPushToken ? bodyExpoPushToken : null,
        })
        .onConflictDoUpdate({
          target: [deviceTokens.userId, deviceTokens.platform],
          set: {
            ...(hasFcmToken ? { token } : {}),
            ...(hasExpoPushToken ? { expoPushToken: bodyExpoPushToken } : {}),
            isInvalid: false,
            invalidReason: null,
            updatedAt: new Date(),
          },
        });

      if (hasExpoPushToken) {
        console.log(`[DeviceToken] Saved: ${effectiveUserId} ${bodyExpoPushToken}`);
      }
      if (hasFcmToken) {
        console.log(`[DeviceToken] Saved FCM: ${effectiveUserId} ${token.slice(0, 20)}... (auth=${authSource})`);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[DeviceToken] Register error:", error);
      res.status(500).json({ success: false, error: "Failed to register device token" });
    }
  });

  app.delete("/api/user/device-token", async (req: any, res: any) => {
    const userId: number | undefined = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Not authenticated" });
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: "token is required" });
      await db.delete(deviceTokens).where(
        and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token))
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[DeviceToken] Unregister error:", error);
      res.status(500).json({ success: false, error: "Failed to unregister device token" });
    }
  });

  app.get("/api/admin/device-tokens", async (req: any, res: any) => {
    if (!req.session?.adminLoggedIn) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    try {
      const rows = await db.select({
        platform: deviceTokens.platform,
        count: sql<number>`count(*)`,
      }).from(deviceTokens).groupBy(deviceTokens.platform);
      const total = rows.reduce((acc, r) => acc + Number(r.count), 0);
      res.json({ success: true, byPlatform: rows, total });
    } catch (error) {
      console.error("[DeviceToken] Admin fetch error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch token stats" });
    }
  });

  app.delete("/api/user/delete-account", async (req, res) => {
    try {
      const { phone, userId } = req.body;
      let userToDelete: any = null;

      if (userId) {
        const [found] = await db.select().from(users).where(eq(users.id, userId));
        userToDelete = found;
      } else if (phone) {
        const cleanPhone = phone.replace(/\D/g, "").replace(/^91/, "");
        const [found] = await db.select().from(users).where(eq(users.phone, cleanPhone));
        userToDelete = found;
      }

      if (!userToDelete) {
        return res.status(404).json({ success: false, error: "No account found with this phone number." });
      }

      const userBookings = await db.select().from(bookings).where(eq(bookings.userId, userToDelete.id));
      for (const booking of userBookings) {
        await db.delete(payments).where(eq(payments.bookingId, booking.id));
        await db.delete(documents).where(eq(documents.bookingId, booking.id));
      }
      await db.delete(notifications).where(eq(notifications.userId, userToDelete.id));
      await db.delete(bookings).where(eq(bookings.userId, userToDelete.id));
      await db.delete(users).where(eq(users.id, userToDelete.id));

      console.log(`[Account Deletion] User ${userToDelete.id} (${userToDelete.phone}) deleted`);
      res.json({ success: true, message: "Account and all associated data have been permanently deleted." });
    } catch (error) {
      console.error("[Account Deletion] Error:", error);
      res.status(500).json({ success: false, error: "Failed to delete account. Please try again." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
