// @ts-nocheck
/**
 * Firebase Cloud Messaging — FCM v1 HTTP API (no firebase-admin SDK)
 * Authenticates via service account credentials (env vars or DB-stored JSON).
 * JWT signing with Node.js built-in crypto. Zero extra dependencies.
 * Supports Android, iOS (APNs), and Web push in a single message.
 */
import crypto from "crypto";
import { pool } from "@workspace/db";

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
    return {
      projectId:  envProjectId,
      clientEmail: envClientEmail,
      privateKey:  envPrivateKey.replace(/\\n/g, "\n"),
    };
  }

  // Fallback: DB-stored service account credentials (cached 5 min)
  if (_dbCreds && Date.now() < _dbCredsLoadedAt + DB_CREDS_TTL) return _dbCreds;

  try {
    const { decrypt } = await import("./encryption.js");
    const r = await pool.query(
      "SELECT api_key_encrypted, extra_fields_encrypted FROM api_settings WHERE provider='firebase'"
    );
    if (!r.rows[0]) {
      throw new Error(
        "Firebase not configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY " +
        "or upload a service account JSON in API Settings → Firebase Push"
      );
    }
    const row = r.rows[0];
    let projectId = "", clientEmail = "", privateKey = "";

    if (row.api_key_encrypted) {
      const keyStr = decrypt(row.api_key_encrypted);
      try {
        // Stored as full service account JSON
        const sa = JSON.parse(keyStr);
        if (sa.project_id && sa.private_key) {
          projectId   = sa.project_id   || "";
          clientEmail = sa.client_email || "";
          privateKey  = (sa.private_key || "").replace(/\\n/g, "\n");
        } else {
          // Stored as raw PEM private key
          privateKey = keyStr.replace(/\\n/g, "\n");
        }
      } catch {
        privateKey = keyStr.replace(/\\n/g, "\n");
      }
    }

    // Extra fields can override individual values
    if (row.extra_fields_encrypted) {
      try {
        const extra = JSON.parse(decrypt(row.extra_fields_encrypted));
        if (extra.project_id)   projectId   = extra.project_id;
        if (extra.client_email) clientEmail = extra.client_email;
      } catch {}
    }

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Firebase credentials incomplete in DB — ensure project_id, client_email and private_key " +
        "are all present (upload full service account JSON)"
      );
    }

    _dbCreds         = { projectId, clientEmail, privateKey };
    _dbCredsLoadedAt = Date.now();
    return _dbCreds;
  } catch (err: any) {
    throw err;
  }
}

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const { projectId, clientEmail, privateKey } = await getCredentials();

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const hdr = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const pay = Buffer.from(JSON.stringify({
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
}> {
  // Flush token cache so we always do a fresh exchange
  _cachedToken = null;
  _tokenExpiry = 0;

  try {
    const creds = await getCredentials();
    await getAccessToken(); // throws if credentials are invalid
    return {
      ok: true,
      projectId:   creds.projectId,
      clientEmail: creds.clientEmail,
      message:     `Connected to Firebase project "${creds.projectId}" — credentials are valid`,
    };
  } catch (err: any) {
    const msg = String(err?.message || "Unknown error");
    let hint = "";

    if (/PEM|PRIVATE KEY|private_key/i.test(msg)) {
      hint = "The private key format is invalid. Ensure newlines inside the PEM block are literal \\n (not escaped).";
    } else if (/invalid_grant|Invalid JWT|JWT/i.test(msg)) {
      hint = "Service account credentials are invalid or expired. Generate a new key from Firebase Console → Project Settings → Service Accounts.";
    } else if (/not authorized|permission_denied|403/i.test(msg)) {
      hint = "Service account lacks Firebase Messaging permissions. Enable the Firebase Cloud Messaging API in Google Cloud Console.";
    } else if (/not configured|incomplete/i.test(msg)) {
      hint = "Upload a service account JSON in API Settings → Firebase Push, or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY environment variables.";
    } else if (/token exchange/i.test(msg)) {
      hint = "Google OAuth2 token exchange failed — verify the private_key and client_email match the same service account.";
    }

    return { ok: false, error: msg, hint };
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
