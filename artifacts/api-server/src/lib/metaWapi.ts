// @ts-nocheck
/**
 * Meta WhatsApp Cloud API — v30.0 Production Integration
 *
 * Priority order: Meta Cloud API → BotBee → SMS → Email
 * Activated when META_ACCESS_TOKEN is set in environment secrets.
 * Falls back gracefully to BotBee when not configured.
 *
 * Setup: Add META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WABA_ID,
 *        META_BUSINESS_ACCOUNT_ID, META_APP_ID, META_APP_SECRET,
 *        META_VERIFY_TOKEN, META_WEBHOOK_SECRET in Replit Secrets.
 */

import { getCachedConfig } from "./apiSettingsProvider.js";
import { pool } from "@workspace/db";
import * as crypto from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

export const META_PHONE_NUMBER_ID = "965912196611113"; // fallback default

// Retry schedule: retry_count index → minutes to wait before next attempt
const RETRY_SCHEDULE_MINUTES = [1, 5, 15, 30, 60, 1440]; // 1m,5m,15m,30m,1h,24h

// ── Runtime token override ─────────────────────────────────────────────────────
// esbuild replaces process.env.META_ACCESS_TOKEN with a compile-time constant ("").
// autoSyncBotBeeMetaToken() calls setMetaRuntimeToken() to inject the live BotBee
// WABA token at runtime, bypassing the esbuild define substitution entirely.
let _runtimeMetaToken = "";
export function setMetaRuntimeToken(token: string): void {
  _runtimeMetaToken = token.trim();
  console.log(`[MetaWAPI] Runtime token set (len=${_runtimeMetaToken.length}) — Meta Cloud API ${_runtimeMetaToken.length > 10 ? "ENABLED" : "DISABLED"}`);
}

// ── Credentials ───────────────────────────────────────────────────────────────

function getMeta() {
  const cfg = getCachedConfig("meta_wapi");
  const token          = (cfg?.apiKey || _runtimeMetaToken || process.env.META_ACCESS_TOKEN || "").trim();
  const phoneId        = (cfg?.extra?.phone_number_id       || process.env.META_PHONE_NUMBER_ID       || META_PHONE_NUMBER_ID).trim();
  const wabaId         = (cfg?.extra?.waba_id               || process.env.META_WABA_ID               || "").trim();
  const businessId     = (cfg?.extra?.business_account_id   || process.env.META_BUSINESS_ACCOUNT_ID   || "").trim();
  const appId          = (cfg?.extra?.app_id                || process.env.META_APP_ID                || "").trim();
  const appSecret      = (cfg?.extra?.app_secret            || process.env.META_APP_SECRET            || "").trim();
  const verifyToken    = (cfg?.extra?.verify_token          || process.env.META_VERIFY_TOKEN          || "").trim();
  const webhookSecret  = (cfg?.extra?.webhook_secret        || process.env.META_WEBHOOK_SECRET        || "").trim();
  const apiVersion     = (cfg?.extra?.api_version           || process.env.META_API_VERSION           || "v20.0").trim();
  return { token, phoneId, wabaId, businessId, appId, appSecret, verifyToken, webhookSecret, apiVersion, enabled: !!token };
}

// Kept for backward compat (used internally)
function getMetaCredentials() { return getMeta(); }

export function isMetaWapiConfigured(): boolean {
  return getMeta().enabled;
}

// ── Missing secrets reporter ──────────────────────────────────────────────────

export function getMissingMetaSecrets(): string[] {
  const required = [
    "META_ACCESS_TOKEN", "META_PHONE_NUMBER_ID", "META_WABA_ID",
    "META_BUSINESS_ACCOUNT_ID", "META_APP_ID", "META_APP_SECRET",
    "META_VERIFY_TOKEN", "META_WEBHOOK_SECRET",
  ];
  return required.filter(k => !process.env[k]?.trim());
}

// ── Event → Template name mapping ─────────────────────────────────────────────
// Template names must match exactly what is approved in Meta Business Manager.
// Overridden at runtime by meta_templates DB table after syncMetaTemplates().

export const META_EVENT_TEMPLATE_MAP: Record<string, string> = {
  new_booking:             "booking_confirmation",
  booking_approved:        "booking_approved",
  booking_cancelled:       "booking_cancelled",
  payment_received:        "payment_received",
  partial_payment:         "partial_payment",
  payment_due:             "payment_reminder",
  balance_reminder:        "payment_reminder",
  invoice_ready:           "invoice_ready",
  invoice_generated:       "invoice_ready",
  agreement_ready:         "agreement_ready",
  agreement_signed:        "agreement_signed",
  visa_approved:           "visa_approved",
  visa_rejected:           "visa_rejected",
  visa_ready:              "visa_received",
  visa_issued:             "visa_received",
  ticket_issued:           "flight_assigned",
  flight_assigned:         "flight_assigned",
  hotel_assigned:          "hotel_assigned",
  room_assigned:           "room_allocated",
  room_allocation:         "room_allocated",
  departure_reminder:      "departure_reminder",
  arrival_reminder:        "arrival_reminder",
  mobile_otp:              "otp_login",
  customer_registration:   "otp_login",
  refund:                  "refund_processed",
  support_reply:           "support_reply",
  journey_status_changed:  "departure_reminder",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetaTemplateResult {
  ok: boolean;
  provider: "MetaCloudAPI";
  endpoint: string;
  messageId?: string;
  wamid?: string;
  errorMessage?: string;
  httpStatus?: number;
  responsePayload?: unknown;
}

// ── Phone normalizer ──────────────────────────────────────────────────────────

function toE164(mobile: string): string {
  if (!mobile) throw new Error("Missing mobile number");
  const clean = mobile.replace(/\D/g, "");
  if (!clean) throw new Error("Invalid mobile number");
  if (clean.length === 10) return `91${clean}`;
  return clean;
}

// ── Variable builder ──────────────────────────────────────────────────────────

function formatINR(n: number) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

export function buildMetaVariables(eventType: string, ctx: Record<string, any>): string[] {
  const name    = ctx.customerName    || "Customer";
  const booking = ctx.bookingNumber   || "-";
  const pkg     = ctx.packageName     || "Hajj/Umrah Package";
  const amount  = ctx.amount != null ? formatINR(ctx.amount) : ctx.finalAmount != null ? formatINR(ctx.finalAmount) : "-";
  const paid    = ctx.paidAmount != null ? formatINR(ctx.paidAmount) : amount;
  const balance = ctx.balanceAmount != null ? formatINR(ctx.balanceAmount) : "-";
  const dep     = ctx.departureDate   || "-";
  const hotel   = ctx.hotelName       || "-";
  const room    = ctx.roomNumber      || "-";
  const flight  = ctx.flightNumber    || "-";
  const airline = ctx.airline         || "-";
  const visa    = ctx.visaNumber      || "-";
  const inv     = ctx.invoiceNumber   || booking;
  const siteBase = "https://alburhantravels.com";
  const invUrl  = ctx.invoiceUrl || (booking !== "-" ? `${siteBase}/invoice/${booking}` : siteBase);
  const payUrl  = booking !== "-" ? `${siteBase}/pay/${booking}` : siteBase;

  switch (eventType) {
    case "new_booking":                    return [name, pkg, booking, invUrl];
    case "booking_approved":               return [name, pkg, booking, amount, invUrl];
    case "booking_cancelled":              return [name, booking, ctx.reason || "cancelled"];
    case "payment_received":
    case "partial_payment":                return [name, paid, booking, balance, invUrl];
    case "payment_due":
    case "balance_reminder":               return [name, balance, booking, payUrl];
    case "invoice_ready":
    case "invoice_generated":              return [name, inv, amount, invUrl];
    case "agreement_ready":                return [name, booking, invUrl];
    case "agreement_signed":               return [name, booking];
    case "visa_approved":
    case "visa_ready":
    case "visa_issued":                    return [name, visa, booking];
    case "visa_rejected":                  return [name, booking, ctx.reason || "check with office"];
    case "ticket_issued":
    case "flight_assigned":                return [name, flight, airline, dep, booking];
    case "hotel_assigned":                 return [name, hotel, dep, booking];
    case "room_assigned":
    case "room_allocation":                return [name, hotel, room, booking];
    case "departure_reminder":             return [name, dep, booking];
    case "arrival_reminder":               return [name, dep, booking];
    case "mobile_otp":
    case "customer_registration":          return [String(ctx.otp || ctx.code || "------")];
    case "refund":                         return [name, amount, booking];
    case "support_reply":                  return [name, ctx.description || "Your support ticket has been updated"];
    default:                               return [name, booking];
  }
}

// ── Core: send template via Meta Cloud API ────────────────────────────────────

export async function sendMetaTemplate(
  to: string,
  templateName: string,
  variables: string[],
  opts?: {
    eventType?: string;
    bookingId?: string;
    customerId?: string;
    customerName?: string;
    bookingNumber?: string;
    languageCode?: string;
    metaMsgId?: string;
  }
): Promise<MetaTemplateResult> {
  const { token, phoneId, apiVersion, enabled } = getMeta();
  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`;

  if (!enabled) {
    return { ok: false, provider: "MetaCloudAPI", endpoint, errorMessage: "META_ACCESS_TOKEN not configured — add it in Replit Secrets" };
  }

  let phone: string;
  try { phone = toE164(to); }
  catch (err: any) { return { ok: false, provider: "MetaCloudAPI", endpoint, errorMessage: err?.message }; }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: opts?.languageCode || "en_US" },
      ...(variables.length > 0 ? {
        components: [{
          type: "body",
          parameters: variables.map(v => ({ type: "text", text: String(v ?? "-") })),
        }],
      } : {}),
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const httpStatus = response.status;
    const data = (await response.json()) as any;
    const messageId = data?.messages?.[0]?.id;
    const ok = response.ok && !!messageId;

    console.log(
      `[MetaWAPI] ${templateName} → ${phone} | HTTP ${httpStatus} | ok=${ok} | wamid=${messageId || "none"}${ok ? "" : " | err=" + (data?.error?.message || "unknown")}`
    );

    if (opts?.eventType) {
      await logMetaResult({
        eventType: opts.eventType, bookingId: opts.bookingId, customerId: opts.customerId,
        customerName: opts.customerName, bookingNumber: opts.bookingNumber,
        recipient: to, templateName, messageId,
        status: ok ? "sent" : "failed", httpStatus,
        errorMessage: ok ? undefined : (data?.error?.message || `HTTP ${httpStatus}`),
        responsePayload: data,
      });
    }

    // Persist to meta_messages table
    const msgId = opts?.metaMsgId || `meta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (ok && messageId) {
      await pool.query(
        `INSERT INTO meta_messages (id, wamid, recipient, template_name, event_type, booking_id, customer_id, status, http_status, retry_count, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',$8,0,NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET wamid=$2, status='sent', http_status=$8, updated_at=NOW()`,
        [msgId, messageId, to, templateName, opts?.eventType || null, opts?.bookingId || null, opts?.customerId || null, httpStatus]
      ).catch(() => {});
    } else if (!ok) {
      const errMsg = data?.error?.message || `HTTP ${httpStatus}`;
      const nextRetryMinutes = RETRY_SCHEDULE_MINUTES[0];
      await pool.query(
        `INSERT INTO meta_messages (id, wamid, recipient, template_name, event_type, booking_id, customer_id, status, http_status, error_message, retry_count, next_retry_at, created_at, updated_at)
         VALUES ($1,NULL,$2,$3,$4,$5,$6,'failed',$7,$8,0,NOW()+($9::int||' minutes')::interval,NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [msgId, to, templateName, opts?.eventType || null, opts?.bookingId || null, opts?.customerId || null, httpStatus, errMsg, nextRetryMinutes]
      ).catch(() => {});
    }

    return {
      ok, provider: "MetaCloudAPI", endpoint, httpStatus, messageId, wamid: messageId,
      errorMessage: ok ? undefined : (data?.error?.message || `HTTP ${httpStatus}`),
      responsePayload: data,
    };
  } catch (err: any) {
    console.error(`[MetaWAPI] sendTemplate error:`, err?.message);
    return { ok: false, provider: "MetaCloudAPI", endpoint, errorMessage: err?.message || "Network error" };
  }
}

// ── High-level: send for event type (primary entry point) ─────────────────────

export async function sendMetaEventTemplate(
  eventType: string,
  ctx: Record<string, any>,
  opts?: { bookingId?: string; customerId?: string; languageCode?: string }
): Promise<MetaTemplateResult> {
  if (!isMetaWapiConfigured()) {
    return { ok: false, provider: "MetaCloudAPI", endpoint: "", errorMessage: "META_ACCESS_TOKEN not configured" };
  }

  // 1. Look up template name — DB overrides static map
  let templateName = META_EVENT_TEMPLATE_MAP[eventType];
  try {
    const dbTpl = await pool.query(
      `SELECT template_name FROM meta_templates WHERE event_type=$1 AND status='APPROVED' ORDER BY synced_at DESC LIMIT 1`,
      [eventType]
    );
    if (dbTpl.rows.length > 0) templateName = dbTpl.rows[0].template_name;
  } catch {}

  if (!templateName) {
    return { ok: false, provider: "MetaCloudAPI", endpoint: "", errorMessage: `No Meta template mapped for event: ${eventType}` };
  }

  const to = (ctx.customerMobile || ctx.mobile || "").toString().trim();
  if (!to) {
    return { ok: false, provider: "MetaCloudAPI", endpoint: "", errorMessage: "No mobile number in context" };
  }

  const variables = buildMetaVariables(eventType, ctx);
  return sendMetaTemplate(to, templateName, variables, {
    eventType,
    bookingId:    opts?.bookingId    || ctx.bookingId,
    customerId:   opts?.customerId   || ctx.customerId,
    customerName: ctx.customerName,
    bookingNumber: ctx.bookingNumber,
    languageCode: opts?.languageCode,
  });
}

// ── Media upload with caching ─────────────────────────────────────────────────

export async function uploadMetaMedia(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ ok: boolean; mediaId?: string; errorMessage?: string }> {
  const { token, phoneId, apiVersion, enabled } = getMeta();
  if (!enabled) return { ok: false, errorMessage: "META_ACCESS_TOKEN not configured" };

  // Check cache by SHA-256 hash
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  try {
    const cached = await pool.query(
      `SELECT media_id FROM meta_media_cache WHERE file_hash=$1 AND expires_at > NOW() LIMIT 1`,
      [hash]
    );
    if (cached.rows.length > 0) return { ok: true, mediaId: cached.rows[0].media_id };
  } catch {}

  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, filename);
    formData.append("type", mimeType);
    formData.append("messaging_product", "whatsapp");

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData, signal: AbortSignal.timeout(30_000) }
    );
    const data = (await response.json()) as any;
    if (!response.ok || !data.id) {
      return { ok: false, errorMessage: data?.error?.message || `HTTP ${response.status}` };
    }

    const mediaId = data.id;
    // Meta media expires after 30 days — cache for 29 days
    const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
    await pool.query(
      `INSERT INTO meta_media_cache (id, media_id, filename, content_type, file_hash, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (file_hash) DO UPDATE SET media_id=$2, expires_at=$6`,
      [`mc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, mediaId, filename, mimeType, hash, expiresAt]
    ).catch(() => {});

    return { ok: true, mediaId };
  } catch (err: any) {
    return { ok: false, errorMessage: err?.message || "Upload failed" };
  }
}

// ── Send media message (document / image) ─────────────────────────────────────

export async function sendMetaMedia(
  to: string,
  mediaId: string,
  mimeType: string,
  caption?: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<{ ok: boolean; wamid?: string; errorMessage?: string }> {
  const { token, phoneId, apiVersion, enabled } = getMeta();
  if (!enabled) return { ok: false, errorMessage: "META_ACCESS_TOKEN not configured" };

  let phone: string;
  try { phone = toE164(to); }
  catch (err: any) { return { ok: false, errorMessage: err?.message }; }

  const type = mimeType === "application/pdf" || mimeType.includes("document")
    ? "document"
    : mimeType.startsWith("image/") ? "image" : "document";

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type,
    [type]: { id: mediaId, ...(caption ? { caption } : {}) },
  };

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json()) as any;
    const wamid = data?.messages?.[0]?.id;
    const ok = response.ok && !!wamid;
    console.log(`[MetaWAPI] sendMedia ${type} → ${phone} | ok=${ok} | wamid=${wamid || "none"}`);
    return { ok, wamid, errorMessage: ok ? undefined : (data?.error?.message || `HTTP ${response.status}`) };
  } catch (err: any) {
    return { ok: false, errorMessage: err?.message };
  }
}

// ── Template sync from Meta WABA ──────────────────────────────────────────────

export async function syncMetaTemplates(): Promise<{
  ok: boolean; synced: number; errors: string[];
}> {
  const { token, wabaId, apiVersion, enabled } = getMeta();
  if (!enabled) return { ok: false, synced: 0, errors: ["META_ACCESS_TOKEN not configured — add it in Replit Secrets"] };
  if (!wabaId)  return { ok: false, synced: 0, errors: ["META_WABA_ID not configured — add it in Replit Secrets"] };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?limit=100&fields=name,status,category,language,components`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
    );
    const data = (await response.json()) as any;
    if (!response.ok) {
      return { ok: false, synced: 0, errors: [data?.error?.message || `HTTP ${response.status}`] };
    }

    const templates = data.data || [];
    let synced = 0;
    const errors: string[] = [];

    for (const tpl of templates) {
      try {
        const bodyComp  = tpl.components?.find((c: any) => c.type === "BODY");
        const varCount  = bodyComp ? (bodyComp.text?.match(/\{\{[0-9]+\}\}/g) || []).length : 0;
        const eventType = Object.entries(META_EVENT_TEMPLATE_MAP).find(([, v]) => v === tpl.name)?.[0] || null;

        await pool.query(
          `INSERT INTO meta_templates (id, template_name, status, category, language, components, variable_count, event_type, synced_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (template_name) DO UPDATE SET
             status=$3, category=$4, components=$6, variable_count=$7,
             event_type=COALESCE(meta_templates.event_type,$8), synced_at=NOW()`,
          [
            `mt_${tpl.name}`, tpl.name, tpl.status, tpl.category,
            tpl.language || "en", JSON.stringify(tpl.components || []),
            varCount, eventType,
          ]
        );
        synced++;
      } catch (e: any) { errors.push(`${tpl.name}: ${e.message}`); }
    }

    console.log(`[MetaWAPI] syncTemplates: ${synced} synced, ${errors.length} errors`);
    return { ok: true, synced, errors };
  } catch (err: any) {
    return { ok: false, synced: 0, errors: [err?.message || "Sync failed"] };
  }
}

// ── Token + permission validation ─────────────────────────────────────────────

export async function validateMetaToken(): Promise<{
  ok: boolean;
  phoneNumber?: string;
  verifiedName?: string;
  wabaId?: string;
  permissions?: string[];
  tokenExpiry?: string;
  missingPermissions?: string[];
  errorMessage?: string;
}> {
  const { token, phoneId, wabaId, appId, appSecret, apiVersion, enabled } = getMeta();
  if (!enabled) return { ok: false, errorMessage: "META_ACCESS_TOKEN not configured" };

  const REQUIRED_PERMISSIONS = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "business_management",
  ];

  try {
    // 1. Validate phone number ID
    const phoneRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneId}?fields=display_phone_number,verified_name,quality_rating,status`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );
    const phoneData = (await phoneRes.json()) as any;
    if (!phoneRes.ok) {
      return { ok: false, errorMessage: phoneData?.error?.message || `Phone ID check failed: HTTP ${phoneRes.status}` };
    }

    const phoneNumber  = phoneData.display_phone_number;
    const verifiedName = phoneData.verified_name;

    // 2. Debug token for permissions + expiry (requires App ID + Secret)
    let permissions: string[] = [];
    let tokenExpiry: string | undefined;
    if (appId && appSecret) {
      try {
        const appToken = `${appId}|${appSecret}`;
        const debugRes = await fetch(
          `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${token}&access_token=${encodeURIComponent(appToken)}`,
          { signal: AbortSignal.timeout(10_000) }
        );
        const debugData = (await debugRes.json()) as any;
        if (debugRes.ok && debugData?.data) {
          permissions = debugData.data.scopes || [];
          const expiry = debugData.data.expires_at;
          if (expiry && expiry > 0) tokenExpiry = new Date(expiry * 1000).toISOString();
        }
      } catch {}
    }

    const missingPermissions = REQUIRED_PERMISSIONS.filter(p => !permissions.includes(p));

    // 3. Persist token status
    await pool.query(
      `INSERT INTO meta_token_status (id, token_valid, phone_number, verified_name, waba_id, permissions, token_expires_at, error_message, last_checked_at)
       VALUES ('current',$1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET
         token_valid=$1, phone_number=$2, verified_name=$3, waba_id=$4,
         permissions=$5, token_expires_at=$6, error_message=$7, last_checked_at=NOW()`,
      [
        true, phoneNumber, verifiedName, wabaId || null,
        JSON.stringify(permissions), tokenExpiry || null,
        missingPermissions.length ? `Missing: ${missingPermissions.join(", ")}` : null,
      ]
    ).catch(() => {});

    return { ok: true, phoneNumber, verifiedName, wabaId, permissions, tokenExpiry, missingPermissions };
  } catch (err: any) {
    return { ok: false, errorMessage: err?.message || "Validation failed" };
  }
}

// ── Webhook signature verification ────────────────────────────────────────────

export function verifyMetaWebhookSignature(
  rawBody: string | Buffer,
  signature: string
): boolean {
  const { webhookSecret } = getMeta();
  if (!webhookSecret) {
    console.warn("[MetaWAPI] META_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  try {
    const expected = "sha256=" + crypto
      .createHmac("sha256", webhookSecret)
      .update(typeof rawBody === "string" ? rawBody : rawBody)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

// ── Delivery status update (called from webhook handler) ──────────────────────

export async function updateMetaDeliveryStatus(
  wamid: string,
  status: string,
  timestamp: string,
  conversationId?: string,
  errorCode?: number,
  errorTitle?: string,
  rawPayload?: unknown
): Promise<void> {
  try {
    const id = `mdl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Convert Unix timestamp to SQL timestamp
    const tsMs = parseInt(timestamp) * 1000;
    const tsISO = isNaN(tsMs) ? new Date().toISOString() : new Date(tsMs).toISOString();

    await pool.query(
      `INSERT INTO meta_delivery_logs (id, wamid, status, timestamp, conversation_id, error_code, error_title, raw_payload, created_at)
       VALUES ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,NOW())
       ON CONFLICT DO NOTHING`,
      [id, wamid, status, tsISO, conversationId || null, errorCode || null, errorTitle || null,
       rawPayload ? JSON.stringify(rawPayload) : null]
    );

    // Update meta_messages
    const finalStatus = ["read","delivered","failed","sent"].includes(status) ? status : "sent";
    await pool.query(
      `UPDATE meta_messages SET status=$1, updated_at=NOW() WHERE wamid=$2`,
      [finalStatus, wamid]
    );

    // Update notification_logs wamid status on failure
    if (status === "failed" && errorCode) {
      await pool.query(
        `UPDATE notification_logs SET error_code=$1, status='failed', updated_at=NOW() WHERE wamid=$2`,
        [String(errorCode), wamid]
      );
    }
  } catch (err) {
    console.error("[MetaWAPI] updateMetaDeliveryStatus error:", err);
  }
}

// ── Retry queue processor ─────────────────────────────────────────────────────

export async function processMetaRetryQueue(): Promise<{ processed: number; succeeded: number }> {
  if (!isMetaWapiConfigured()) return { processed: 0, succeeded: 0 };
  try {
    const due = await pool.query(
      `SELECT id, recipient, template_name, event_type, booking_id, customer_id, retry_count
       FROM meta_messages
       WHERE status IN ('failed','retrying') AND next_retry_at <= NOW() AND retry_count < $1
       ORDER BY next_retry_at
       LIMIT 20`,
      [RETRY_SCHEDULE_MINUTES.length]
    );
    let processed = 0, succeeded = 0;
    for (const row of due.rows) {
      const result = await sendMetaTemplate(row.recipient, row.template_name, [], {
        eventType: row.event_type, bookingId: row.booking_id, customerId: row.customer_id,
        metaMsgId: row.id,
      });
      processed++;
      if (result.ok) {
        succeeded++;
      } else {
        const nextIdx    = Math.min(row.retry_count + 1, RETRY_SCHEDULE_MINUTES.length - 1);
        const nextMinutes = RETRY_SCHEDULE_MINUTES[nextIdx];
        await pool.query(
          `UPDATE meta_messages SET status='retrying', retry_count=$1, next_retry_at=NOW()+($2::int||' minutes')::interval, updated_at=NOW() WHERE id=$3`,
          [row.retry_count + 1, nextMinutes, row.id]
        ).catch(() => {});
      }
    }
    // Mark expired entries
    await pool.query(
      `UPDATE meta_messages SET status='expired', updated_at=NOW()
       WHERE status IN ('failed','retrying') AND retry_count >= $1 AND next_retry_at IS NOT NULL AND next_retry_at <= NOW()`,
      [RETRY_SCHEDULE_MINUTES.length]
    ).catch(() => {});

    if (processed > 0) console.log(`[MetaWAPI] Retry queue: processed=${processed} succeeded=${succeeded}`);
    return { processed, succeeded };
  } catch (err) {
    console.error("[MetaWAPI] processMetaRetryQueue error:", err);
    return { processed: 0, succeeded: 0 };
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkMetaWapiHealth(): Promise<{
  status: "ok" | "degraded" | "down";
  detail: string;
  configured: boolean;
}> {
  const { token, phoneId, apiVersion, enabled } = getMeta();
  if (!enabled) {
    return {
      status: "degraded",
      detail: "META_ACCESS_TOKEN not set — WhatsApp using BotBee fallback. Add META_ACCESS_TOKEN in Replit Secrets.",
      configured: false,
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }
    );
    const data = (await res.json()) as any;
    if (res.ok && data?.display_phone_number) {
      return {
        status: "ok",
        detail: `Meta Cloud API connected — ${data.display_phone_number} (${data.verified_name || "verified"})`,
        configured: true,
      };
    }
    return {
      status: "down",
      detail: `Meta API error: ${data?.error?.message || `HTTP ${res.status}`}`,
      configured: true,
    };
  } catch (err: any) {
    return { status: "down", detail: `Meta API unreachable: ${err?.message}`, configured: true };
  }
}

// ── Internal: log to notification_logs ────────────────────────────────────────

async function logMetaResult(opts: {
  eventType: string; bookingId?: string; customerId?: string;
  customerName?: string; bookingNumber?: string; recipient: string;
  templateName: string; messageId?: string;
  status: "sent" | "failed"; httpStatus?: number;
  errorMessage?: string; responsePayload?: unknown;
}) {
  try {
    const id = `nl_meta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { apiVersion, phoneId } = getMeta();
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, customer_id, booking_id, customer_name, booking_number,
        template, message, status, provider_name, api_endpoint, http_status,
        request_payload, provider_response, error_code, wamid, sent_at, created_at, updated_at)
       VALUES ($1,$2,'whatsapp',$3,$4,$5,$6,$7,$8,$9,$10,'MetaCloudAPI',$11,$12,$13,$14,$15,$16,CASE WHEN $10='sent' THEN NOW() ELSE NULL END,NOW(),NOW())`,
      [
        id, opts.eventType, opts.recipient,
        opts.customerId || null, opts.bookingId || null,
        opts.customerName || null, opts.bookingNumber || null,
        opts.templateName, `[meta:${opts.templateName}]`, opts.status,
        `https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,
        opts.httpStatus || null, null,
        opts.responsePayload ? JSON.stringify(opts.responsePayload) : null,
        opts.errorMessage || null, opts.messageId || null,
      ]
    );
  } catch (err) {
    console.error("[MetaWAPI] logMetaResult failed:", err);
  }
}
