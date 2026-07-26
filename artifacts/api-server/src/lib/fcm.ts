// @ts-nocheck
/**
 * Firebase Cloud Messaging — REST API implementation
 * Uses FCM v1 HTTP API directly (no firebase-admin SDK needed — works in bundled VPS environment).
 * All JWT signing done with Node.js built-in crypto. Zero extra dependencies.
 */
import crypto from "crypto";
import { pool } from "@workspace/db";

// ── Access token cache (valid 60 min, refresh at 50 min) ─────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const projectId   = process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY || "";

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error("Firebase not configured: missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY");
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now  = Math.floor(Date.now() / 1000);
  const exp  = now + 3600;
  const hdr  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const pay  = Buffer.from(JSON.stringify({
    iss: clientEmail, sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${hdr}.${pay}`);
  const sig = signer.sign(privateKey, "base64url");
  const jwt = `${hdr}.${pay}.${sig}`;

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);

  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 min
  return _cachedToken;
}

// ── Configuration check ───────────────────────────────────────────────────────
export async function isFirebaseConfigured(): Promise<boolean> {
  try { await getAccessToken(); return true; } catch { return false; }
}

export function getFirebaseWebConfig() {
  return {
    apiKey:            process.env.VITE_FIREBASE_API_KEY            || process.env.FIREBASE_API_KEY || "",
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
    projectId:         process.env.FIREBASE_PROJECT_ID              || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "",
    appId:             process.env.VITE_FIREBASE_APP_ID             || "",
  };
}

// ── Send to single token ──────────────────────────────────────────────────────
export async function sendFCMToToken(
  token: string,
  payload: { title: string; body: string; url?: string; icon?: string; imageUrl?: string; data?: Record<string, string> }
): Promise<{ ok: boolean; messageId?: string; error?: string; invalidToken?: boolean }> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  try {
    const accessToken = await getAccessToken();
    const url = payload.url || "https://alburhantravels.online/customer/dashboard";
    const msg: any = {
      token,
      notification: { title: payload.title, body: payload.body },
      webpush: {
        fcmOptions: { link: url },
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || "/opengraph.jpg",
          badge: "/favicon.ico",
          requireInteraction: false,
        },
        data: { url, ...(payload.data || {}) },
      },
    };
    if (payload.imageUrl) msg.notification.imageUrl = payload.imageUrl;

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      const isInvalid = msg.includes("UNREGISTERED") || msg.includes("INVALID_ARGUMENT") || res.status === 404;
      return { ok: false, error: msg, invalidToken: isInvalid };
    }
    const data = await res.json();
    return { ok: true, messageId: data.name };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ── Send to multiple tokens (batch via sequential calls — FCM v1 has no multicast) ──
export async function sendFCMBatch(
  tokens: string[],
  payload: { title: string; body: string; url?: string; icon?: string; data?: Record<string, string> }
): Promise<{ sent: number; failed: number; invalidTokens: string[] }> {
  if (!tokens.length) return { sent: 0, failed: 0, invalidTokens: [] };

  const CONCURRENCY = 10;
  let sent = 0; let failed = 0; const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const slice = tokens.slice(i, i + CONCURRENCY);
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

// ── Clean up invalid/expired tokens ──────────────────────────────────────────
export async function cleanupInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (!invalidTokens.length) return;
  try {
    for (const t of invalidTokens) {
      await pool.query(`DELETE FROM customer_push_tokens WHERE token = $1`, [t]).catch(() => {});
    }
    console.log(`[FCM] Cleaned ${invalidTokens.length} invalid tokens`);
  } catch {}
}

// ── Token filters ─────────────────────────────────────────────────────────────
export async function getTokensByFilter(
  filter: string
): Promise<Array<{ customerId: string; token: string; customerName?: string }>> {
  let sql: string;
  const params: any[] = [];

  switch (filter) {
    case "all":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "hajj":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND (b.package_type ILIKE '%hajj%' OR b.package_name ILIKE '%hajj%')
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "umrah":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND (b.package_type ILIKE '%umrah%' OR b.package_name ILIKE '%umrah%')
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "payment_pending":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND COALESCE(b.paid_amount, 0) < COALESCE(b.final_amount, b.total_amount, 0)
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "visa_ready":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.journey_status = 'visa_ready'
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "ticket_issued":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.journey_status = 'ticket_issued'
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    case "agreement_signed":
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN agreements ag ON ag.customer_id = cpt.customer_id AND ag.status = 'signed'
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      break;
    default:
      // package-wise
      sql = `SELECT DISTINCT ON (cpt.customer_id) cpt.customer_id, cpt.token, u.name AS customer_name
             FROM customer_push_tokens cpt
             JOIN bookings b ON b.customer_id = cpt.customer_id
             LEFT JOIN users u ON u.id = cpt.customer_id
             WHERE cpt.token IS NOT NULL AND length(cpt.token) > 10
               AND b.package_name ILIKE $1
               AND b.status NOT IN ('cancelled','rejected')
             ORDER BY cpt.customer_id, cpt.created_at DESC`;
      params.push(`%${filter}%`);
  }

  const res = await pool.query(sql, params);
  return res.rows.map((r: any) => ({ customerId: r.customer_id, token: r.token, customerName: r.customer_name }));
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
