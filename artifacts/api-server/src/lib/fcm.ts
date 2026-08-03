// @ts-nocheck
/**
 * Firebase Cloud Messaging — FCM v1 HTTP API (no firebase-admin SDK)
 * Authenticates via service account credentials (env vars or DB-stored JSON).
 * JWT signing with Node.js built-in crypto. Zero extra dependencies.
 * Supports Android, iOS (APNs), and Web push in a single message.
 */
import crypto from "crypto";
import { pool } from "@workspace/db";

// ── PEM normalisation ─────────────────────────────────────────────────────────
/**
 * Accepts any of the common malformed formats produced by encryption round-trips,
 * JSON encoding, copy-paste from consoles, CRLF line-endings, etc. and returns
 * a strict RFC-7468 PEM with exactly 64-char base64 lines.
 *
 * Node 20 / OpenSSL 3 raises  error:1E08010C:DECODER routines::unsupported
 * whenever the base64 body has non-64-char lines OR the header/footer are
 * missing a trailing newline, even if the key material itself is valid.
 */
function normalizePemKey(raw: string): string {
  // 1. Unescape literal \n that survived JSON or env-var transport
  let s = raw
    .replace(/\\n/g, "\n")   // literal backslash-n  → real LF
    .replace(/\r\n/g, "\n")  // Windows CRLF         → LF
    .replace(/\r/g, "\n");   // bare CR              → LF

  // 2. Pull out header / body / footer (tolerates RSA PRIVATE KEY too)
  const m = s.match(
    /(-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})([\s\S]+?)(-{5}END [A-Z ]*PRIVATE KEY-{5})/
  );
  if (!m) {
    // Give the caller something actionable, without leaking key bytes
    const preview = s.slice(0, 30).replace(/\n/g, "\\n");
    throw new Error(
      `Private key has no PEM markers. ` +
      `len=${s.length}, first30="${preview}". ` +
      `Ensure you paste the full JSON and click "Parse JSON → Fill Fields".`
    );
  }

  const header = m[1]; // -----BEGIN PRIVATE KEY-----
  const body   = m[2].replace(/\s+/g, ""); // strip ALL whitespace from body
  const footer = m[3]; // -----END PRIVATE KEY-----

  // 3. Rebuild body with exactly 64-char lines (RFC 7468 / OpenSSL 3 requirement)
  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));

  return `${header}\n${lines.join("\n")}\n${footer}\n`;
}

/** Safe decrypt helper that always returns a proper UTF-8 string (avoids
 *  the implicit Buffer+string coercion in the raw decrypt() return path). */
async function decryptToString(ciphertext: string): Promise<string> {
  const { decrypt } = await import("./encryption.js");
  const raw = decrypt(ciphertext);
  // decrypt() returns decipher.update(buf)+decipher.final("utf8").
  // When the buffer straddles a chunk boundary the implicit Buffer.toString()
  // is fine for pure-ASCII PEM, but let's be explicit just in case.
  return typeof raw === "string" ? raw : Buffer.from(raw as any).toString("utf8");
}

// ── Access token cache (valid 60 min, refresh at 50 min) ─────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

// ── DB credential cache ───────────────────────────────────────────────────────
let _dbCreds: { projectId: string; clientEmail: string; privateKey: string } | null = null;
let _dbCredsLoadedAt = 0;
const DB_CREDS_TTL = 5 * 60 * 1000; // 5 min

/** Call after saving new service account credentials so stale cache is dropped */
export function invalidateFCMCredCache(): void {
  _dbCreds         = null;
  _dbCredsLoadedAt = 0;
  _cachedToken     = null;
  _tokenExpiry     = 0;
}

/**
 * Resolves credentials in priority order:
 *   1. Environment variables (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)
 *   2. DB api_settings row (service account JSON or individual fields)
 */
async function getCredentials(): Promise<{ projectId: string; clientEmail: string; privateKey: string }> {
  const envProjectId   = process.env.FIREBASE_PROJECT_ID   || "";
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const envPrivateKey  = process.env.FIREBASE_PRIVATE_KEY  || "";

  if (envProjectId && envClientEmail && envPrivateKey) {
    const normalizedKey = envPrivateKey.replace(/\\n/g, "\n").trim();
    // Only use env vars when the key is actually a real PEM block.
    // If FIREBASE_PRIVATE_KEY is a placeholder / dummy value (e.g. len<200,
    // no BEGIN marker) fall through silently to DB-stored credentials.
    const isRealPem =
      normalizedKey.includes("-----BEGIN") &&
      normalizedKey.includes("PRIVATE KEY-----") &&
      normalizedKey.length > 200;
    if (isRealPem) {
      return {
        projectId:   envProjectId,
        clientEmail: envClientEmail,
        privateKey:  normalizedKey,
      };
    }
    // Placeholder key in env — try DB credentials instead
    console.warn(
      "[FCM] FIREBASE_PRIVATE_KEY env var does not look like a real PEM key " +
      `(len=${envPrivateKey.length}); checking DB credentials`
    );
  }

  // Fallback: DB-stored service account credentials (cached 5 min)
  if (_dbCreds && Date.now() < _dbCredsLoadedAt + DB_CREDS_TTL) return _dbCreds;

  const r = await pool.query(
    "SELECT api_key_encrypted, extra_fields_encrypted FROM api_settings WHERE provider='firebase'"
  );
  if (!r.rows[0]) {
    throw new Error(
      "Firebase not configured: upload a service account JSON in API Settings → Firebase Push, " +
      "or set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars."
    );
  }
  const row = r.rows[0];
  let projectId = "", clientEmail = "", privateKey = "";

  if (row.api_key_encrypted) {
    const keyStr = await decryptToString(row.api_key_encrypted);
    try {
      // Preferred: api_key stored as full service account JSON
      // JSON.parse restores real newlines from \n escape sequences
      const sa = JSON.parse(keyStr);
      if (sa.private_key) {
        // sa.private_key already has real newlines (JSON.parse handled them)
        privateKey  = sa.private_key;
        projectId   = sa.project_id   || "";
        clientEmail = sa.client_email || "";
      }
    } catch {
      // Fallback: api_key stored as raw PEM string
      privateKey = keyStr;
    }
  }

  // extra_fields can supply / override project_id and client_email,
  // and as a last resort can contain the full service_account_json
  if (row.extra_fields_encrypted) {
    try {
      const extra = JSON.parse(await decryptToString(row.extra_fields_encrypted));
      if (extra.project_id)   projectId   = extra.project_id;
      if (extra.client_email) clientEmail = extra.client_email;

      // If api_key had no private_key, try service_account_json in extra_fields
      if (!privateKey && extra.service_account_json) {
        try {
          const sa2 = JSON.parse(extra.service_account_json);
          if (sa2.private_key) {
            privateKey  = sa2.private_key;
            projectId   = projectId   || sa2.project_id   || "";
            clientEmail = clientEmail || sa2.client_email || "";
          }
        } catch {}
      }
    } catch {}
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Firebase credentials incomplete — missing: ` +
      [!projectId && "project_id", !clientEmail && "client_email", !privateKey && "private_key"]
        .filter(Boolean).join(", ") +
      `. Upload a full service account JSON in API Settings → Firebase Push.`
    );
  }

  // Normalise the private key: fix line endings, rebuild 64-char PEM lines
  const normalizedKey = normalizePemKey(privateKey);

  _dbCreds         = { projectId, clientEmail, privateKey: normalizedKey };
  _dbCredsLoadedAt = Date.now();
  return _dbCreds;
}

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const { projectId, clientEmail, privateKey } = await getCredentials();

  // Create an explicit KeyObject — this is the step that validates the PEM and
  // gives a precise error (e.g. "wrong key type", "unsupported algorithm") rather
  // than the opaque OpenSSL decoder error you get when passing a raw string to
  // sign() on Node 20 / OpenSSL 3.
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey({ key: privateKey, format: "pem" });
  } catch (err: any) {
    const lines = privateKey.split("\n").filter(l => l.trim());
    throw new Error(
      `crypto.createPrivateKey failed: ${err.message}\n` +
      `  first line: "${lines[0] ?? "(empty)"}"\n` +
      `  last  line: "${lines[lines.length - 1] ?? "(empty)"}"\n` +
      `  key length: ${privateKey.length} chars`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const pay = Buffer.from(JSON.stringify({
    iss: clientEmail, sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })).toString("base64url");

  // Sign using the KeyObject (not a raw string) — reliable on all Node/OpenSSL versions
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${hdr}.${pay}`);
  const sig = signer.sign(keyObject, "base64url");
  const jwt = `${hdr}.${pay}.${sig}`;

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`OAuth2 token exchange failed: ${JSON.stringify(data)}`);
  }

  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 min
  return _cachedToken;
}

// ── Configuration check ───────────────────────────────────────────────────────
export async function isFirebaseConfigured(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}

export function getFirebaseWebConfig() {
  return {
    apiKey:            process.env.VITE_FIREBASE_API_KEY             || process.env.FIREBASE_API_KEY || "",
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN         || "",
    projectId:         process.env.FIREBASE_PROJECT_ID               || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId:             process.env.VITE_FIREBASE_APP_ID              || "",
  };
}

// ── Test FCM credentials by exchanging a real OAuth2 token ───────────────────
export async function testFCMConnection(): Promise<{
  ok: boolean;
  projectId?: string;
  clientEmail?: string;
  message?: string;
  error?: string;
  hint?: string;
  stack?: string;
  keyDiagnostics?: { firstLine: string; lastLine: string; length: number };
}> {
  // Flush ALL caches so we always do a full fresh round-trip
  _cachedToken     = null;
  _tokenExpiry     = 0;
  _dbCreds         = null;
  _dbCredsLoadedAt = 0;

  try {
    const creds = await getCredentials();

    // Log first/last PEM lines (never log the full key)
    const keyLines = creds.privateKey.split("\n").filter(l => l.trim());
    const firstLine = keyLines[0]  ?? "(empty)";
    const lastLine  = keyLines[keyLines.length - 1] ?? "(empty)";
    console.log(
      `[FCM] testConnection project="${creds.projectId}" client="${creds.clientEmail}" ` +
      `key_len=${creds.privateKey.length} ` +
      `first="${firstLine}" last="${lastLine}"`
    );

    await getAccessToken(); // throws if JWT signing or OAuth2 exchange fails

    return {
      ok:          true,
      projectId:   creds.projectId,
      clientEmail: creds.clientEmail,
      message:     `Connected to Firebase project "${creds.projectId}" — credentials valid`,
      keyDiagnostics: { firstLine, lastLine, length: creds.privateKey.length },
    };
  } catch (err: any) {
    const msg   = String(err?.message || "Unknown error");
    const stack = String(err?.stack   || msg);
    let hint    = "";

    if (/no PEM markers|PEM markers/i.test(msg)) {
      hint = "The stored private key has no '-----BEGIN PRIVATE KEY-----' markers. " +
             "Re-paste the service account JSON and click 'Parse JSON → Fill Fields', then save.";
    } else if (/createPrivateKey|DECODER|unsupported|ASN1/i.test(msg)) {
      hint = "OpenSSL could not decode the private key. The key may be truncated, have extra " +
             "characters, or be in the wrong format. Re-download the service account JSON from " +
             "Firebase Console → Project Settings → Service Accounts → Generate new private key.";
    } else if (/PEM|PRIVATE KEY|private_key/i.test(msg)) {
      hint = "The private key format is invalid. Use 'Parse JSON → Fill Fields' to extract the " +
             "key from the original service account JSON rather than copying it manually.";
    } else if (/invalid_grant|Invalid JWT|JWT/i.test(msg)) {
      hint = "Service account credentials are invalid or expired. Generate a new key from " +
             "Firebase Console → Project Settings → Service Accounts.";
    } else if (/not authorized|permission_denied|403/i.test(msg)) {
      hint = "Service account lacks Firebase Messaging permissions. Enable the Firebase Cloud " +
             "Messaging API in Google Cloud Console → APIs & Services.";
    } else if (/not configured|incomplete/i.test(msg)) {
      hint = "Upload a service account JSON in API Settings → Firebase Push.";
    } else if (/token exchange/i.test(msg)) {
      hint = "Google OAuth2 exchange failed — verify the private_key and client_email belong " +
             "to the same service account.";
    }

    console.error(`[FCM] testConnection failed: ${msg}`);
    return { ok: false, error: msg, hint, stack };
  }
}

// ── Send to single token (Android + iOS + Web) ────────────────────────────────
export async function sendFCMToToken(
  token: string,
  payload: {
    title: string;
    body: string;
    url?: string;
    icon?: string;
    imageUrl?: string;
    data?: Record<string, string>;
  }
): Promise<{ ok: boolean; messageId?: string; error?: string; invalidToken?: boolean }> {
  try {
    const creds       = await getCredentials();
    const accessToken = await getAccessToken();
    const url         = payload.url || "https://alburhantravels.com/customer/dashboard";
    const extraData   = { url, ...(payload.data || {}) };

    // ── Web Push (Chrome / Edge / Firefox / Safari desktop + Android Chrome) ──
    const webpush: any = {
      headers: { Urgency: "high" },
      fcmOptions: { link: url },
      notification: {
        title:             payload.title,
        body:              payload.body,
        icon:              payload.icon || "/opengraph.jpg",
        badge:             "/favicon.ico",
        requireInteraction: false,
        vibrate:           [200, 100, 200],
      },
      data: extraData,
    };
    if (payload.imageUrl) webpush.notification.image = payload.imageUrl;

    // ── Android native app ────────────────────────────────────────────────────
    const android: any = {
      priority: "high",
      notification: {
        title:        payload.title,
        body:         payload.body,
        icon:         "ic_notification",
        color:        "#2D7B4F",
        sound:        "default",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        channel_id:   "abt_default",
      },
      data: extraData,
    };
    if (payload.imageUrl) android.notification.image = payload.imageUrl;

    // ── iOS (APNs via FCM) ────────────────────────────────────────────────────
    const apns: any = {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: "default",
          badge: 1,
          "content-available": 1,
          "mutable-content":   1,
        },
        ...extraData,
      },
    };
    if (payload.imageUrl) apns.fcmOptions = { image: payload.imageUrl };

    // ── Base notification (fallback for all platforms) ────────────────────────
    const notification: any = { title: payload.title, body: payload.body };
    if (payload.imageUrl) notification.imageUrl = payload.imageUrl;

    const msg: any = {
      token,
      notification,
      webpush,
      android,
      apns,
      // Data payload received by the app on all platforms
      data: Object.fromEntries(
        Object.entries(extraData).map(([k, v]) => [k, String(v)])
      ),
    };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body:   JSON.stringify({ message: msg }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) {
      const err      = await res.json().catch(() => ({}));
      const errMsg   = err?.error?.message || `HTTP ${res.status}`;
      const isInvalid =
        errMsg.includes("UNREGISTERED") ||
        errMsg.includes("INVALID_ARGUMENT") ||
        res.status === 404;
      return { ok: false, error: errMsg, invalidToken: isInvalid };
    }

    const data = await res.json();
    return { ok: true, messageId: data.name };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Send to multiple tokens (10-at-a-time concurrency) ───────────────────────
export async function sendFCMBatch(
  tokens: string[],
  payload: { title: string; body: string; url?: string; icon?: string; data?: Record<string, string> }
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  if (!tokens.length) return { sent: 0, failed: 0, invalidTokens: [] };

  const CONCURRENCY  = 10;
  let sent = 0, failed = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const slice   = tokens.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(slice.map(t => sendFCMToToken(t, payload)));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value.ok) {
        sent++;
      } else {
        failed++;
        const val = r.status === "fulfilled" ? r.value : null;
        if (val?.invalidToken) invalidTokens.push(slice[idx]);
      }
    });
  }
  return { sent, failed, invalidTokens };
}

// ── Clean up invalid / expired tokens ────────────────────────────────────────
export async function cleanupInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (!invalidTokens.length) return;
  try {
    for (const t of invalidTokens) {
      await pool.query(
        `DELETE FROM customer_push_tokens WHERE token = $1`, [t]
      ).catch(() => {});
    }
    console.log(`[FCM] Cleaned ${invalidTokens.length} invalid tokens`);
  } catch {}
}

// ── Token filters (all user types) ───────────────────────────────────────────
export async function getTokensByFilter(
  filter: string
): Promise<Array<{ userId: string; token: string; customerName?: string; userType?: string }>> {
  let sql: string;
  const params: any[] = [];

  if (filter.startsWith("individual:")) {
    const uid = filter.split(":")[1];
    sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
           FROM customer_push_tokens cpt
           LEFT JOIN users u ON u.id = cpt.user_id
           WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
             AND (cpt.user_id = $1 OR cpt.customer_id = $1)
           ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
    params.push(uid);
    const res = await pool.query(sql, params);
    return res.rows.map((r: any) => ({ userId: r.user_id || uid, token: r.token, customerName: r.customer_name, userType: r.user_type }));
  }

  switch (filter) {
    case "all":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "customers":
    case "customer":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND (cpt.user_type = 'customer' OR cpt.user_type IS NULL)
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "admin":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND cpt.user_type IN ('admin','super_admin')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "staff":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND cpt.user_type = 'staff'
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "agent":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND cpt.user_type = 'agent'
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "branch_manager":
    case "branch":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND cpt.user_type = 'branch_manager'
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "finance":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND cpt.user_type IN ('admin','super_admin','staff')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "hajj":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND (b.package_type ILIKE '%hajj%' OR b.package_name ILIKE '%hajj%')
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "umrah":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND (b.package_type ILIKE '%umrah%' OR b.package_name ILIKE '%umrah%')
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "payment_pending":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND COALESCE(b.paid_amount, 0) < COALESCE(b.final_amount, b.total_amount, 0)
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "visa_ready":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.journey_status = 'visa_ready'
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "ticket_issued":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.journey_status = 'ticket_issued'
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    case "agreement_signed":
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN agreements ag ON ag.customer_id = cpt.user_id AND ag.status = 'signed'
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      break;
    default:
      sql = `SELECT DISTINCT ON (cpt.user_id) cpt.user_id, cpt.token, u.name AS customer_name, cpt.user_type
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.user_id
             LEFT JOIN users u ON u.id = cpt.user_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.package_name ILIKE $1
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.user_id, cpt.last_seen DESC NULLS LAST`;
      params.push(`%${filter}%`);
  }

  const res = await pool.query(sql, params);
  return res.rows.map((r: any) => ({
    userId:       r.user_id,
    token:        r.token,
    customerName: r.customer_name,
    userType:     r.user_type,
  }));
}

// ── Auto push for booking events (called from workflowEngine) ────────────────
const PUSH_MESSAGES: Record<string, (ctx: any) => { title: string; body: string; url?: string }> = {
  new_booking:              ctx => ({ title: "📋 Booking Received",      body: `Your booking${ctx.bookingNumber ? ` #${ctx.bookingNumber}` : ""} has been submitted. We'll confirm shortly!`,           url: "/customer/dashboard" }),
  booking_submitted:        ctx => ({ title: "📋 Booking Received",      body: `Your booking${ctx.bookingNumber ? ` #${ctx.bookingNumber}` : ""} has been submitted. We'll confirm shortly!`,           url: "/customer/dashboard" }),
  booking_approved:         ctx => ({ title: "✅ Booking Confirmed!",    body: `Great news${ctx.customerName ? `, ${ctx.customerName.split(" ")[0]}` : ""}! Your ${ctx.packageName || "package"} booking is confirmed.`, url: "/customer/dashboard" }),
  payment_received:         ctx => ({ title: "💰 Payment Received",      body: `₹${ctx.amount ? Number(ctx.amount).toLocaleString("en-IN") : ""} received for ${ctx.bookingNumber || "your booking"}. Thank you!`,      url: "/customer/dashboard" }),
  partial_payment_received: ctx => ({ title: "💳 Partial Payment Noted", body: `Partial payment received for ${ctx.bookingNumber || "your booking"}. Balance due: ₹${ctx.balanceDue ? Number(ctx.balanceDue).toLocaleString("en-IN") : "pending"}.`, url: "/customer/dashboard" }),
  invoice_generated:        ctx => ({ title: "🧾 Invoice Ready",         body: `Your invoice for ${ctx.bookingNumber || "your booking"} is ready to view and download.`,                                url: "/customer/dashboard" }),
  agreement_generated:      ctx => ({ title: "📝 Agreement Ready",       body: `Your travel agreement for ${ctx.bookingNumber || "your booking"} is ready. Please review and sign.`,                   url: "/customer/dashboard" }),
  agreement_signed:         ctx => ({ title: "✍️ Agreement Signed",      body: `Your agreement for ${ctx.bookingNumber || "your booking"} has been signed successfully!`,                               url: "/customer/dashboard" }),
  visa_approved:            ctx => ({ title: "🛂 Visa Approved!",        body: `Great news! Your visa for ${ctx.packageName || "your package"} has been approved.`,                                    url: "/customer/dashboard" }),
  visa_issued:              ctx => ({ title: "🛂 Visa Ready",            body: `Your visa for ${ctx.bookingNumber || "your booking"} is ready! Journey status updated.`,                               url: "/customer/dashboard" }),
  ticket_issued:            ctx => ({ title: "✈️ Flight Ticket Uploaded", body: `Your flight ticket for ${ctx.bookingNumber || "your booking"} is now available to download.`,                         url: "/customer/dashboard" }),
  hotel_voucher_uploaded:   ctx => ({ title: "🏨 Hotel Voucher Ready",   body: `Your hotel voucher for ${ctx.bookingNumber || "your booking"} has been uploaded.`,                                     url: "/customer/dashboard" }),
  departure_reminder:       ctx => ({ title: "⏰ Departure Reminder",    body: `Your ${ctx.packageName || "journey"} departs soon. Check all documents are ready!`,                                    url: "/customer/dashboard" }),
  payment_due:              ctx => ({ title: "💰 Payment Reminder",      body: `Balance payment reminder for ${ctx.bookingNumber || "your booking"}. Please ensure timely payment.`,                   url: "/customer/dashboard" }),
  balance_reminder:         ctx => ({ title: "💰 Balance Due",           body: `Reminder: balance payment for ${ctx.bookingNumber || "your booking"} is due soon.`,                                    url: "/customer/dashboard" }),
};

/**
 * Called by workflowEngine after each trigger — fire-and-forget FCM push to customer devices.
 * ctx must have customerId or customerMobile.
 */
export async function sendPushForBooking(
  customerId: string,
  trigger: string,
  ctx: Record<string, any>
): Promise<void> {
  try {
    if (!customerId) return;
    if (!(await isFirebaseConfigured())) return;

    const msgFn = PUSH_MESSAGES[trigger];
    if (!msgFn) return;

    const { title, body, url } = msgFn(ctx);

    const tokensRes = await pool.query(
      `SELECT token FROM customer_push_tokens
       WHERE (user_id = $1 OR customer_id = $1)
         AND token IS NOT NULL AND length(token) > 10
       ORDER BY last_seen DESC NULLS LAST LIMIT 5`,
      [customerId]
    );
    if (!tokensRes.rows.length) return;

    const results = await Promise.allSettled(
      tokensRes.rows.map((r: any) => sendFCMToToken(r.token, { title, body, url }))
    );
    const sent    = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const invalid = results
      .filter(r => r.status === "fulfilled" && !r.value.ok && r.value.invalidToken)
      .map((r, i) => tokensRes.rows[i]?.token)
      .filter(Boolean);
    await cleanupInvalidTokens(invalid);
    if (sent > 0) console.log(`[FCM] Auto-push "${trigger}" → customer=${customerId} sent=${sent}`);
  } catch (err: any) {
    console.warn(`[FCM] sendPushForBooking failed for trigger=${trigger}:`, err?.message);
  }
}

// ── Log a push campaign result ────────────────────────────────────────────────
export async function logPushCampaign(opts: {
  id: string;
  title: string;
  body: string;
  url?: string;
  filter: string;
  totalTokens: number;
  sent: number;
  failed: number;
  sentBy?: string;
  error?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO push_campaigns
       (id, title, body, url, filter, total_tokens, sent, failed, status, sent_by, error, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT DO NOTHING`,
      [
        opts.id, opts.title, opts.body, opts.url || null, opts.filter,
        opts.totalTokens, opts.sent, opts.failed,
        opts.error ? "failed" : "completed",
        opts.sentBy || null, opts.error || null,
      ]
    );
  } catch (err: any) {
    console.warn("[FCM] logPushCampaign failed:", err.message);
  }
}
