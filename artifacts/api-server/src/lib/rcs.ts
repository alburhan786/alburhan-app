// @ts-nocheck
/**
 * rcs.ts — Lemin AI RCS engine (production)
 *
 * Architecture:
 *  - Template mappings live in rcs_template_mappings (DB, admin-editable)
 *  - Variables resolved from real booking/customer/payment/invoice/pilgrim data
 *  - Pre-send validation: missing required vars → validation_failed (no send)
 *  - Idempotency: booking_id + event + template_id, checked in notification_logs
 *  - Status polling: GET /api/messages/status (up to 5 probes, non-blocking)
 *  - user_id (LEMIN_API_KEY) is NEVER logged, returned, or stored anywhere
 */

import axios from "axios";
import { pool } from "@workspace/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RCSResult {
  ok: boolean;
  provider: "LeminAI";
  endpoint: string;
  httpStatus?: number;
  messageId?: string;
  deliveryStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Safe payload sent (user_id omitted) */
  requestPayload?: Record<string, unknown>;
  /** Raw provider response */
  responsePayload?: unknown;
  /** Set when pre-validation fails — lists missing variable names */
  missingVars?: string[];
}

export type RCSDeliveryStatus =
  | "queued" | "sent" | "delivered" | "read"
  | "failed" | "expired" | "validation_failed" | "unknown";

interface TemplateMapping {
  erp_event: string;
  template_name: string;
  template_id: string | null;
  alt_template_id: string | null;
  carrier: string;
  template_type: string;
  variables_required: string[];
  enabled: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  notes: string | null;
}

export interface ResolvedVars {
  customer_name?: string;
  booking_id?: string;
  agreement_number?: string;
  invoice_number?: string;
  receipt_number?: string;
  package_name?: string;
  amount?: string;
  paid_amount?: string;
  balance_amount?: string;
  payment_status?: string;
  document_url?: string;
  dashboard_url?: string;
  departure_date?: string;
  return_date?: string;
  flight_number?: string;
  airline_name?: string;
  hotel_name?: string;
  support_phone?: string;
  [key: string]: string | undefined;
}

// ── Config helpers ────────────────────────────────────────────────────────────

function getLeminKey(): string {
  // 1. Env var (injected at build time for VPS)
  if (process.env.LEMIN_API_KEY) return process.env.LEMIN_API_KEY;
  // 2. DB-stored "User ID (Developer API Key)" saved via Admin → API Settings → Lemin AI RCS
  try {
    const { getCachedConfig } = require("./apiSettingsProvider.js");
    const cfg = getCachedConfig("lemin");
    return cfg.apiKey || cfg.extra?.user_id || "";
  } catch { return ""; }
}
function getLeminBase():  string { return (process.env.LEMIN_BASE_URL  || "https://rcs.leminai.com").replace(/\/$/, ""); }
function getDialCode():   string { return process.env.LEMIN_DIAL_CODE  || "+91"; }
function getRcsAgent():   string { return process.env.LEMIN_AGENT      || "jio"; }

/**
 * Normalise any raw Indian mobile string to exactly 10 digits.
 * Handles: leading +, spaces, hyphens, leading 0, leading country code 91.
 */
function normalizeIndianMobile(raw: string): string {
  let clean = raw.replace(/[\s\-\+]/g, "");  // strip spaces, hyphens, leading +
  if (clean.startsWith("0")) clean = clean.slice(1); // remove leading 0
  if (clean.startsWith("91") && clean.length === 12) clean = clean.slice(2); // strip 91 prefix
  return clean.slice(-10); // always return last 10 digits
}

function getSendEndpoint(): string { return `${getLeminBase()}/api/send/template`; }
function getStatusEndpoint(): string { return `${getLeminBase()}/api/messages/status`; }

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Template mapping loader ───────────────────────────────────────────────────

export async function loadMapping(event: string): Promise<TemplateMapping | null> {
  try {
    const r = await pool.query(`SELECT * FROM rcs_template_mappings WHERE erp_event=$1`, [event]);
    return r.rows[0] || null;
  } catch { return null; }
}

export async function listMappings(): Promise<TemplateMapping[]> {
  try {
    const r = await pool.query(`SELECT * FROM rcs_template_mappings ORDER BY erp_event`);
    return r.rows;
  } catch { return []; }
}

// ── Variable resolver ─────────────────────────────────────────────────────────
// Loads real data from DB; ctx provides overrides / fallback values.

export async function resolveVariables(
  event: string,
  bookingId: string | undefined,
  ctx: Partial<ResolvedVars> = {}
): Promise<ResolvedVars> {
  const vars: ResolvedVars = { ...ctx };

  if (!bookingId) return vars;

  try {
    // Core booking + customer
    const bRow = await pool.query(`
      SELECT b.booking_number, b.customer_name, b.customer_mobile, b.package_name,
             b.final_amount, b.paid_amount, b.preferred_departure_date,
             b.invoice_number AS booking_invoice_number
      FROM bookings b
      WHERE b.id=$1 LIMIT 1`, [bookingId]
    ).catch(() => ({ rows: [] }));

    if (bRow.rows.length) {
      const b = bRow.rows[0];
      if (!vars.customer_name) vars.customer_name  = b.customer_name || "";
      if (!vars.booking_id)    vars.booking_id     = b.booking_number || bookingId;
      if (!vars.package_name)  vars.package_name   = b.package_name || "";
      if (!vars.paid_amount)   vars.paid_amount    = String(Math.round(Number(b.paid_amount) || 0));
      if (!vars.amount)        vars.amount         = String(Math.round(Number(b.paid_amount) || 0));
      if (!vars.departure_date) vars.departure_date = b.preferred_departure_date
        ? new Date(b.preferred_departure_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      if (!vars.return_date)   vars.return_date    = b.return_date
        ? new Date(b.return_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      const fa = Number(b.final_amount) || 0;
      const pa = Number(b.paid_amount) || 0;
      if (!vars.balance_amount) vars.balance_amount = String(Math.round(fa - pa));
      if (!vars.payment_status) vars.payment_status = pa >= fa ? "Paid" : pa > 0 ? "Partial" : "Pending";
      if (!vars.dashboard_url)  vars.dashboard_url  = "https://alburhantravels.com/my-bookings";
      if (!vars.support_phone)  vars.support_phone  = "7045009898";
      // Use invoice_number from bookings row as fallback before hitting invoices table
      if (!vars.invoice_number && b.booking_invoice_number) vars.invoice_number = b.booking_invoice_number;
    }

    // Latest payment receipt
    if (event === "payment_received" || !vars.receipt_number) {
      const ptRow = await pool.query(
        `SELECT id, amount, payment_date FROM payment_transactions WHERE booking_id=$1 ORDER BY payment_date DESC LIMIT 1`,
        [bookingId]
      ).catch(() => ({ rows: [] }));
      if (ptRow.rows.length) {
        const pt = ptRow.rows[0];
        if (!vars.receipt_number) vars.receipt_number = `RCP-${pt.id.slice(0,8).toUpperCase()}`;
        if (!vars.amount) vars.amount = String(Math.round(Number(pt.amount) || 0));
      }
    }

    // Latest invoice
    if (event === "invoice_ready" || !vars.invoice_number) {
      const invRow = await pool.query(
        `SELECT invoice_number, total FROM invoices WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [bookingId]
      ).catch(() => ({ rows: [] }));
      if (invRow.rows.length) {
        const inv = invRow.rows[0];
        if (!vars.invoice_number) vars.invoice_number = inv.invoice_number || "";
        if (!vars.amount) vars.amount = String(Math.round(Number(inv.total) || 0));
      }
    }

    // Agreement
    if (event === "agreement_ready" || !vars.agreement_number) {
      const agrRow = await pool.query(
        `SELECT a.id, a.agreement_number, b.booking_number
         FROM agreements a
         LEFT JOIN bookings b ON b.id = a.booking_id
         WHERE a.booking_id=$1 ORDER BY a.created_at DESC LIMIT 1`,
        [bookingId]
      ).catch(() => ({ rows: [] }));
      if (agrRow.rows.length) {
        const agr = agrRow.rows[0];
        if (!vars.agreement_number) vars.agreement_number = agr.agreement_number || agr.id?.slice(0,8).toUpperCase() || "";
        // Use booking_number in public signing URL (short, readable, matches what WhatsApp message sends)
        if (!vars.document_url) {
          const linkId = agr.booking_number || agr.id;
          vars.document_url = `https://alburhantravels.com/sign-agreement/${linkId}`;
        }
      }
    }

    // Pilgrim flight / visa / hotel  (use actual DB columns — hajj_groups owns flight/hotel)
    if (["flight_ticket","visa_ready","hotel_voucher","departure_reminder"].includes(event)) {
      const pilRow = await pool.query(
        `SELECT p.visa_number, p.passport_number,
                hj.flight_number,
                hj.departure_date AS flight_date,
                hj.hotels->0->>'name' AS hotel_name
         FROM pilgrims p
         JOIN bookings b ON b.group_id = p.group_id
         LEFT JOIN hajj_groups hj ON hj.id = p.group_id
         WHERE b.id=$1 LIMIT 1`,
        [bookingId]
      ).catch(() => ({ rows: [] }));
      if (pilRow.rows.length) {
        const p = pilRow.rows[0];
        if (!vars.flight_number) vars.flight_number = p.flight_number || "";
        if (!vars.hotel_name)    vars.hotel_name    = p.hotel_name || "";
        if (!vars.visa_number)   vars.visa_number   = p.visa_number || "";
        if (!vars.departure_date && p.flight_date) {
          vars.departure_date = new Date(p.flight_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        }
      }
    }
  } catch (err: any) {
    console.warn("[rcs] resolveVariables error:", err.message);
  }

  // ── Lemin API key aliases ─────────────────────────────────────────────────────
  // Different Lemin templates use different variable key formats (plain/{{...}}/#!...!#).
  // Populate all variants here so sendRCSForEvent can filter by variables_required keys.
  const cn  = vars.customer_name || "";
  const bid = vars.booking_id    || "";

  // Type A — plain "name" (templates 3651/3652/3655)
  if (!vars["name"]) vars["name"] = cn;

  // Template 3656 (payment_received) uses unique plain-English keys with spaces
  if (!vars["booking id"]) vars["booking id"] = bid;
  if (!vars["invoice no"]) vars["invoice no"] = vars.invoice_number || "";

  // Type B — double-brace format (templates 3657/3659/3660)
  if (!vars["{{customer_name}}"]) vars["{{customer_name}}"] = cn;
  if (!vars["{{booking_id}}"])    vars["{{booking_id}}"]    = bid;
  if (!vars["{{invoice_number}}"]) vars["{{invoice_number}}"] = vars.invoice_number || "";
  if (!vars["{{amount}}"])         vars["{{amount}}"]         = vars.amount         || "";
  if (!vars["{{visa_number}}"])    vars["{{visa_number}}"]    = vars.visa_number    || "";
  if (!vars["{{package_name}}"])   vars["{{package_name}}"]   = vars.package_name   || "";
  if (!vars["{{ticket_number}}"]) vars["{{ticket_number}}"]  = vars.flight_number  || "";  // flight_number doubles as ticket
  if (!vars["{{flight_number}}"]) vars["{{flight_number}}"]  = vars.flight_number  || "";

  // Composite departure key for template 3659 — "15 Nov 2026 at 06:00"
  const depDate = vars.departure_date || "";
  const depTime = (vars as any)["departure_time"] || "06:00";
  const compositeKey = "{{departure_date}} at {{departure_time}}";
  if (!vars[compositeKey]) vars[compositeKey] = depDate ? `${depDate} at ${depTime}` : "";

  // Type C — hash-bang format (template 3661)
  if (!vars["#!name!#"])        vars["#!name!#"]        = cn;
  if (!vars[": #!agreement!#"]) vars[": #!agreement!#"] = vars.agreement_number || "";
  if (!vars["🔗 #!download!#"]) vars["🔗 #!download!#"] = vars.document_url    || "https://alburhantravels.com/my-bookings";
  if (!vars["#!bookingid!#"])   vars["#!bookingid!#"]   = bid;

  return vars;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateVariables(
  required: string[],
  resolved: ResolvedVars
): { ok: boolean; missing: string[] } {
  const missing = required.filter(key => {
    const val = resolved[key];
    return !val || val === "undefined" || val === "null" || val === "" || /\{\{/.test(val);
  });
  return { ok: missing.length === 0, missing };
}

// ── Idempotency check ─────────────────────────────────────────────────────────

async function checkIdempotency(idempotencyKey: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT id FROM notification_logs WHERE idempotency_key=$1 AND created_at >= NOW() - INTERVAL '24 hours' AND status IN ('sent','queued','delivered') LIMIT 1`,
      [idempotencyKey]
    );
    return r.rows.length > 0; // true = duplicate (skip send)
  } catch { return false; }
}

// ── Notification log writer ───────────────────────────────────────────────────

async function logRCSNotification(opts: {
  event: string;
  mobile: string;
  templateId: string | null;
  templateName: string;
  variables: Record<string, string>;
  status: string;
  httpStatus?: number;
  requestPayload?: Record<string, unknown>; // user_id MUST be stripped before passing
  responsePayload?: unknown;
  errorCode?: string;
  errorMessage?: string;
  messageId?: string;
  deliveryStatus?: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  bookingNumber?: string;
  idempotencyKey?: string;
}): Promise<string> {
  const logId = `rcs-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  try {
    await pool.query(`
      INSERT INTO notification_logs
        (id, event_type, channel, recipient, message, status,
         provider_name, api_endpoint, http_status, request_payload,
         provider_response, error_code, sent_at, retry_count,
         booking_id, customer_id, customer_name, booking_number,
         template_id, template_name, message_id, delivery_status, idempotency_key, created_at)
      VALUES ($1,$2,'rcs',$3,$4,$5,'LeminAI',$6,$7,$8,$9,$10,
        CASE WHEN $5 IN ('sent','queued') THEN NOW() ELSE NULL END,
        0,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
      [
        logId, opts.event || "rcs_event",
        opts.mobile,
        `RCS tpl:${opts.templateId} vars:${JSON.stringify(opts.variables).slice(0,200)}`,
        opts.status,
        getSendEndpoint(),
        opts.httpStatus ?? null,
        opts.requestPayload ? JSON.stringify(opts.requestPayload) : null,  // user_id stripped
        JSON.stringify(opts.responsePayload ?? null),
        opts.errorCode ?? null,
        opts.bookingId ?? null,
        opts.customerId ?? null,
        opts.customerName ?? null,
        opts.bookingNumber ?? null,
        opts.templateId ?? null,
        opts.templateName ?? null,
        opts.messageId ?? null,
        opts.deliveryStatus ?? (opts.status === "sent" ? "queued" : opts.status),
        opts.idempotencyKey ?? null,
      ]
    );
  } catch (err: any) {
    console.error("[rcs] log failed:", err.message);
  }
  return logId;
}

// ── Status polling ────────────────────────────────────────────────────────────

const FINAL_STATUSES = new Set(["delivered","read","failed","expired"]);

export async function pollMessageStatus(messageId: string): Promise<RCSDeliveryStatus> {
  const base   = getLeminBase();
  const apiKey = getLeminKey();
  if (!apiKey || !messageId) return "unknown";

  const statusUrl = getStatusEndpoint();
  const finalStates = FINAL_STATUSES;

  for (let i = 0; i < 5; i++) {
    if (i > 0) await sleep(4000);
    try {
      const r = await axios.get(statusUrl, {
        params: { message_id: messageId, user_id: apiKey }, // user_id to Lemin only
        timeout: 8000,
        maxRedirects: 0,   // Lemin status endpoint requires session auth; redirect = unavailable
        validateStatus: (s) => s < 400,
      });
      // If redirected to sign-in page, status polling is not available — return unknown
      const isHtml = typeof r.data === "string" && r.data.includes("sign-in");
      if (isHtml || r.status === 302 || r.status === 301) return "unknown";
      const st = (r.data?.status || r.data?.delivery_status || "").toLowerCase() as RCSDeliveryStatus;
      if (st && (finalStates.has(st) || st === "sent")) return st;
    } catch (e: any) {
      // Redirect or network error — stop retrying
      if (e?.response?.status === 302 || e?.response?.status === 301) return "unknown";
      /* continue polling on other errors */
    }
  }
  return "unknown";
}

/** Non-blocking: polls status after initial send, updates notification_logs */
async function scheduleStatusUpdate(logId: string, messageId: string): Promise<void> {
  (async () => {
    await sleep(5000);
    try {
      const st = await pollMessageStatus(messageId);
      if (st && st !== "unknown") {
        await pool.query(
          `UPDATE notification_logs SET delivery_status=$1, last_status_check=NOW(),
             delivered_at = CASE WHEN $1 IN ('delivered','read') AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
             read_at = CASE WHEN $1='read' AND read_at IS NULL THEN NOW() ELSE read_at END,
             updated_at=NOW()
           WHERE id=$2`,
          [st, logId]
        ).catch(() => {});
      }
    } catch { /* swallow — non-critical */ }
  })();
}

// ── Core send ─────────────────────────────────────────────────────────────────

/** Main entry point: send RCS for a named ERP event */
export async function sendRCSForEvent(
  event: string,
  mobile: string,
  bookingId?: string,
  ctx: Partial<ResolvedVars> = {},
  opts: { skipIdempotency?: boolean; customerId?: string; bookingNumber?: string; customerName?: string } = {}
): Promise<RCSResult> {
  const endpoint = getSendEndpoint();

  // 1. Load template mapping
  const mapping = await loadMapping(event);
  if (!mapping) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: `No template mapping found for event "${event}"` };
  }
  if (!mapping.enabled) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: `RCS disabled for event "${event}"` };
  }
  if (!mapping.template_id) {
    return {
      ok: false, provider: "LeminAI", endpoint,
      errorMessage: `Template not mapped for event "${event}" — add an approved Lemin template ID in RCS Template Mappings`,
    };
  }

  // 2. Lemin credentials
  const leminKey = getLeminKey();
  if (!leminKey) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: "LEMIN_API_KEY secret not configured" };
  }

  // 3. Normalize phone — strips spaces/hyphens/+, leading 0, leading 91 → exactly 10 digits
  const phone = normalizeIndianMobile(mobile);
  if (phone.length !== 10) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: `Invalid mobile number: ${mobile}` };
  }

  const templateId   = mapping.template_id;
  const templateName = mapping.template_name;
  const dialCode     = getDialCode();

  // 4. Idempotency
  const idemKey = `${bookingId || "no-booking"}:${event}:${templateId}`;
  if (!opts.skipIdempotency && bookingId) {
    const isDupe = await checkIdempotency(idemKey);
    if (isDupe) {
      return { ok: false, provider: "LeminAI", endpoint, errorMessage: `Duplicate: RCS already sent for ${event} on booking ${bookingId} (24h window)` };
    }
  }

  // 5. Resolve variables
  const resolved = await resolveVariables(event, bookingId, ctx);
  const { ok: varsOk, missing } = validateVariables(mapping.variables_required, resolved);
  if (!varsOk) {
    // Log validation failure but do not send
    const customerName = resolved.customer_name || opts.customerName || "";
    const bookingNumber = resolved.booking_id || opts.bookingNumber || bookingId || "";
    await logRCSNotification({
      event, mobile: phone, templateId, templateName, variables: resolved as Record<string,string>,
      status: "failed", errorMessage: `Missing variables: ${missing.join(", ")}`,
      deliveryStatus: "validation_failed", bookingId, customerId: opts.customerId,
      customerName, bookingNumber, idempotencyKey: idemKey,
    });
    // Update mapping last_failure
    await pool.query(
      `UPDATE rcs_template_mappings SET last_failure_at=NOW(), last_failure_reason=$1 WHERE erp_event=$2`,
      [`Missing vars: ${missing.join(", ")}`, event]
    ).catch(() => {});
    return {
      ok: false, provider: "LeminAI", endpoint,
      missingVars: missing,
      errorMessage: `Validation failed — required variables missing: ${missing.join(", ")}`,
    };
  }

  // 6. Build Lemin payload — filter to ONLY the keys the template requires.
  //    This ensures we send exactly {"name":"..."} for simple templates and
  //    {"{{customer_name}}":"..."} etc for double-brace templates.
  const requiredKeys = (mapping.variables_required as string[]) || [];
  const templateVars: Record<string, string> = {};
  for (const key of requiredKeys) {
    templateVars[key] = String(resolved[key] || "");
  }

  const safePayload: Record<string, unknown> = {
    type: "single", dial_code: dialCode, template: templateId, phone,
    variables: templateVars,
  };
  const leminPayload = { ...safePayload, user_id: leminKey };

  // 7. Send
  let lastResult: RCSResult = { ok: false, provider: "LeminAI", endpoint, errorMessage: "Max retries exceeded" };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2000);
    try {
      const resp = await axios.post(endpoint, leminPayload, {
        headers: { "Content-Type": "application/json" }, timeout: 12000,
      });
      const body = resp.data || {};
      const errTxt = String(body.message || body.error || "").toLowerCase();

      // Strict ok: HTTP 2xx + no explicit failure in body
      const authFailed = errTxt.includes("invalid user") || errTxt.includes("unauthorized");
      const tplNotFound = errTxt.includes("template not found") || errTxt.includes("template_not_found");
      const bodyFailed  = body.success === false || body.status === false || authFailed || tplNotFound;
      const ok = resp.status >= 200 && resp.status < 300 && !bodyFailed;

      const messageId = body.data?.id || body.data?.message_id || body.message_id || body.id || body.msg_id || undefined;
      lastResult = {
        ok, provider: "LeminAI", endpoint,
        httpStatus: resp.status,
        requestPayload: safePayload,
        responsePayload: body,
        messageId,
        deliveryStatus: ok ? "queued" : "failed",
        errorCode: String(body.code || body.error_code || ""),
        errorMessage: ok ? undefined : (body.message || body.error || `HTTP ${resp.status}`),
      };

      if (ok) break;
      // On template_not_found or auth failure, don't retry
      if (authFailed || tplNotFound) break;
    } catch (e: any) {
      const er = e?.response;
      const body = er?.data || {};
      lastResult = {
        ok: false, provider: "LeminAI", endpoint,
        httpStatus: er?.status || 0,
        requestPayload: safePayload,
        responsePayload: body,
        errorCode: String(body.code || ""),
        errorMessage: body.message || body.error || e.message,
      };
    }
  }

  // 8. Log result
  const customerName  = resolved.customer_name || opts.customerName || "";
  const bookingNumber = resolved.booking_id     || opts.bookingNumber || bookingId || "";
  const logId = await logRCSNotification({
    event, mobile: phone, templateId, templateName, variables: resolved as Record<string,string>,
    status: lastResult.ok ? "sent" : "failed",
    httpStatus: lastResult.httpStatus,
    requestPayload: safePayload,
    responsePayload: lastResult.responsePayload,
    errorCode: lastResult.errorCode,
    errorMessage: lastResult.errorMessage,
    messageId: lastResult.messageId,
    deliveryStatus: lastResult.ok ? "queued" : "failed",
    bookingId, customerId: opts.customerId,
    customerName, bookingNumber, idempotencyKey: idemKey,
  });

  // 9. Update mapping stats
  if (lastResult.ok) {
    await pool.query(`UPDATE rcs_template_mappings SET last_success_at=NOW() WHERE erp_event=$1`, [event]).catch(() => {});
    if (lastResult.messageId) scheduleStatusUpdate(logId, lastResult.messageId);
  } else {
    await pool.query(
      `UPDATE rcs_template_mappings SET last_failure_at=NOW(), last_failure_reason=$1 WHERE erp_event=$2`,
      [lastResult.errorMessage?.slice(0,255), event]
    ).catch(() => {});
  }

  return lastResult;
}

/** Update delivery status for an existing message_id from Lemin status endpoint */
export async function refreshMessageStatus(messageId: string): Promise<{
  messageId: string; deliveryStatus: RCSDeliveryStatus; updated: boolean;
}> {
  const status = await pollMessageStatus(messageId);
  if (status !== "unknown") {
    await pool.query(
      `UPDATE notification_logs SET delivery_status=$1, last_status_check=NOW(),
         delivered_at = CASE WHEN $1 IN ('delivered','read') AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
         read_at = CASE WHEN $1='read' AND read_at IS NULL THEN NOW() ELSE read_at END,
         updated_at=NOW()
       WHERE message_id=$2`,
      [status, messageId]
    ).catch(() => {});
  }
  return { messageId, deliveryStatus: status, updated: status !== "unknown" };
}

/** Low-level: send with explicit templateId (bypasses event mapping, for testing) */
export async function sendCustomRCS(opts: {
  mobile: string;
  templateId: string;
  variables: Record<string, string>;
  bookingId?: string;
  customerId?: string;
  eventLabel?: string;
}): Promise<RCSResult> {
  const endpoint = getSendEndpoint();
  const leminKey = getLeminKey();
  if (!leminKey) return { ok: false, provider: "LeminAI", endpoint, errorMessage: "LEMIN_API_KEY not configured" };

  const phone = normalizeIndianMobile(opts.mobile);
  const dialCode = getDialCode();

  const safePayload: Record<string, unknown> = {
    type: "single", dial_code: dialCode, template: opts.templateId, phone,
    variables: opts.variables,
  };
  const leminPayload = { ...safePayload, user_id: leminKey };

  try {
    const resp = await axios.post(endpoint, leminPayload, {
      headers: { "Content-Type": "application/json" }, timeout: 12000,
    });
    const body = resp.data || {};
    const errTxt = String(body.message || body.error || "").toLowerCase();
    const authFailed  = errTxt.includes("invalid user") || errTxt.includes("unauthorized");
    const tplNotFound = errTxt.includes("template not found");
    const bodyFailed  = body.success === false || body.status === false || authFailed || tplNotFound;
    const ok = resp.status >= 200 && resp.status < 300 && !bodyFailed;
    const messageId = body.data?.id || body.data?.message_id || body.message_id || body.id || undefined;

    await logRCSNotification({
      event: opts.eventLabel || "rcs_custom",
      mobile: phone, templateId: opts.templateId, templateName: `custom:${opts.templateId}`,
      variables: opts.variables, status: ok ? "sent" : "failed",
      httpStatus: resp.status, requestPayload: safePayload, responsePayload: body,
      messageId, deliveryStatus: ok ? "queued" : "failed",
      errorMessage: ok ? undefined : (body.message || body.error),
      bookingId: opts.bookingId, customerId: opts.customerId,
    });

    if (ok && messageId) {
      const logRow = await pool.query(`SELECT id FROM notification_logs WHERE message_id=$1 ORDER BY created_at DESC LIMIT 1`, [messageId]).catch(() => ({ rows: [] }));
      if (logRow.rows.length) scheduleStatusUpdate(logRow.rows[0].id, messageId);
    }

    return { ok, provider: "LeminAI", endpoint, httpStatus: resp.status, requestPayload: safePayload, responsePayload: body, messageId, deliveryStatus: ok ? "queued" : "failed", errorMessage: ok ? undefined : (body.message || body.error || `HTTP ${resp.status}`) };
  } catch (e: any) {
    const er = e?.response;
    const body = er?.data || {};
    await logRCSNotification({
      event: opts.eventLabel || "rcs_custom",
      mobile: phone, templateId: opts.templateId, templateName: `custom:${opts.templateId}`,
      variables: opts.variables, status: "failed",
      httpStatus: er?.status || 0, requestPayload: safePayload, responsePayload: body,
      errorMessage: body.message || e.message,
      deliveryStatus: "failed", bookingId: opts.bookingId, customerId: opts.customerId,
    });
    return { ok: false, provider: "LeminAI", endpoint, httpStatus: er?.status || 0, requestPayload: safePayload, responsePayload: body, errorCode: String(body.code || ""), errorMessage: body.message || body.error || e.message };
  }
}

// ── OTP Events set (all alias to template 3663) ───────────────────────────────
const OTP_EVENTS = new Set([
  "login_otp","otp_login","customer_login_otp","admin_login_otp",
  "agent_login_otp","branch_login_otp","staff_login_otp",
  "password_reset_otp","mobile_verification_otp",
]);

/**
 * Send an OTP via Lemin AI RCS — template 3663 (alburhan_login_otp).
 *
 * Security contract:
 *  - The actual OTP value is NEVER written to notification_logs or any log line.
 *  - requestPayload logged with {otp:"******"}.
 *  - 2-minute per-mobile resend cooldown enforced.
 *  - user_id (LEMIN_API_KEY) never returned to callers or logged.
 */
export async function sendRCSForOTP(
  mobile: string,
  otp: string,
  opts: { eventLabel?: string } = {}
): Promise<RCSResult> {
  const endpoint = getSendEndpoint();
  const leminKey  = getLeminKey();
  const dialCode  = getDialCode();

  if (!leminKey) return { ok: false, provider: "LeminAI", endpoint, errorMessage: "LEMIN_API_KEY not configured" };
  if (!otp)      return { ok: false, provider: "LeminAI", endpoint, errorMessage: "OTP value required" };

  // Normalise mobile
  const clean = mobile.replace(/\D/g, "");
  const phone = clean.startsWith("91") && clean.length === 12 ? clean.slice(2) : clean.slice(-10);

  // Load mapping (canonical event = login_otp)
  const mRow = await pool.query(
    `SELECT template_id, template_name, enabled FROM rcs_template_mappings WHERE erp_event='login_otp' LIMIT 1`
  ).catch(() => ({ rows: [] as any[] }));
  const mapping = mRow.rows[0];
  if (!mapping?.enabled || !mapping?.template_id) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: "RCS OTP mapping not configured or disabled" };
  }

  const templateId   = mapping.template_id as string;
  const templateName = mapping.template_name as string;
  const event        = opts.eventLabel || "login_otp";

  // 2-minute resend cooldown per mobile
  const recentRow = await pool.query(
    `SELECT id FROM notification_logs
     WHERE channel='rcs' AND event_type=ANY($1) AND recipient=$2
       AND status='sent' AND created_at > NOW() - INTERVAL '2 minutes' LIMIT 1`,
    [[...OTP_EVENTS], phone]
  ).catch(() => ({ rows: [] as any[] }));
  if (recentRow.rows[0]) {
    return { ok: false, provider: "LeminAI", endpoint, errorMessage: "OTP resend cooldown: please wait 2 minutes before requesting again via RCS" };
  }

  // Payloads — OTP sent to Lemin but NEVER stored in logs
  // Normalise mobile for OTP path
  const cleanOtp = normalizeIndianMobile(mobile);

  const leminPayload  = { type: "single", dial_code: dialCode, template: templateId, phone: cleanOtp, variables: { otp }, user_id: leminKey };
  const safePayload   = { type: "single", dial_code: dialCode, template: templateId, phone: cleanOtp, variables: { otp: "******" } };

  let lastResult: RCSResult = { ok: false, provider: "LeminAI", endpoint, errorMessage: "Max retries exceeded" };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2000);
    try {
      const resp = await axios.post(endpoint, leminPayload, {
        headers: { "Content-Type": "application/json" }, timeout: 12000,
      });
      const body      = resp.data || {};
      const authFailed = typeof body.message === "string" && (body.message.toLowerCase().includes("auth") || body.message.toLowerCase().includes("invalid key"));
      const bodyFailed = body.success === false || authFailed;
      const ok         = resp.status >= 200 && resp.status < 300 && !bodyFailed;
      const messageId  = body.data?.id || body.data?.message_id || body.message_id || body.id || undefined;

      lastResult = {
        ok, provider: "LeminAI", endpoint,
        httpStatus: resp.status,
        requestPayload: safePayload,
        responsePayload: body,
        messageId,
        errorMessage: ok ? undefined : (body.message || body.error || `HTTP ${resp.status}`),
      };
      if (ok) break;
    } catch (e: any) {
      const er = e?.response;
      lastResult = { ok: false, provider: "LeminAI", endpoint, httpStatus: er?.status || 0, requestPayload: safePayload, responsePayload: er?.data, errorMessage: e.message };
    }
  }

  // Log — OTP value is masked; never stored in notification_logs
  const logId = await logRCSNotification({
    event, mobile: phone, templateId, templateName,
    variables: { otp: "******" },          // ← always masked
    status: lastResult.ok ? "sent" : "failed",
    httpStatus: lastResult.httpStatus,
    requestPayload: safePayload,           // ← OTP already "******" in safePayload
    responsePayload: lastResult.responsePayload,
    errorMessage: lastResult.errorMessage,
    messageId: lastResult.messageId,
    deliveryStatus: lastResult.ok ? "queued" : "failed",
  });

  if (lastResult.ok) {
    await pool.query(`UPDATE rcs_template_mappings SET last_success_at=NOW() WHERE erp_event='login_otp'`).catch(() => {});
    if (lastResult.messageId) scheduleStatusUpdate(logId, lastResult.messageId);
  } else {
    await pool.query(
      `UPDATE rcs_template_mappings SET last_failure_at=NOW(), last_failure_reason=$1 WHERE erp_event='login_otp'`,
      [lastResult.errorMessage?.slice(0, 255)]
    ).catch(() => {});
  }

  return lastResult;
}

// ── ERP event convenience wrappers ────────────────────────────────────────────

export const rcs = {
  bookingSubmitted: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; packageName?: string }) =>
    sendRCSForEvent("booking_submitted", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, package_name: opts.packageName }, opts),

  bookingConfirmed: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; packageName?: string; amount?: string }) =>
    sendRCSForEvent("booking_confirmed", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, package_name: opts.packageName, amount: opts.amount }, opts),

  bookingApproved: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; packageName?: string; amount?: string }) =>
    sendRCSForEvent("booking_approved", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, package_name: opts.packageName, amount: opts.amount }, opts),

  paymentReceived: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; amount?: string; receiptNumber?: string }) =>
    sendRCSForEvent("payment_received", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, amount: opts.amount, receipt_number: opts.receiptNumber }, opts),

  pendingPaymentReminder: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; balanceAmount?: string }) =>
    sendRCSForEvent("pending_payment_reminder", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, balance_amount: opts.balanceAmount }, opts),

  invoiceReady: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; invoiceNumber?: string; amount?: string }) =>
    sendRCSForEvent("invoice_ready", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, invoice_number: opts.invoiceNumber, amount: opts.amount }, opts),

  flightTicket: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; flightNumber?: string; airlineName?: string; departureDate?: string }) =>
    sendRCSForEvent("flight_ticket", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, flight_number: opts.flightNumber, airline_name: opts.airlineName, departure_date: opts.departureDate }, opts),

  visaReady: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string }) =>
    sendRCSForEvent("visa_ready", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber }, opts),

  agreementReady: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; agreementNumber?: string; documentUrl?: string }) =>
    sendRCSForEvent("agreement_ready", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, agreement_number: opts.agreementNumber, document_url: opts.documentUrl }, opts),

  hotelVoucher: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; hotelName?: string }) =>
    sendRCSForEvent("hotel_voucher", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, hotel_name: opts.hotelName }, opts),

  departureReminder: (opts: { mobile: string; bookingId?: string; customerId?: string; customerName?: string; bookingNumber?: string; departureDate?: string }) =>
    sendRCSForEvent("departure_reminder", opts.mobile, opts.bookingId, { customer_name: opts.customerName, booking_id: opts.bookingNumber, departure_date: opts.departureDate }, opts),
};

// Legacy compat — old callers in notifications.ts / notificationEngine.ts
export { sendRCSForEvent as sendRCS };
// sendCustomRCS is already exported as a named function above
// Keep old named exports for callers in rcs.ts that were using per-event functions
export const sendBookingCreated       = rcs.bookingSubmitted;
export const sendBookingConfirmed     = rcs.bookingConfirmed;
export const sendPaymentReceived      = rcs.paymentReceived;
export const sendPendingPaymentReminder = rcs.pendingPaymentReminder;
export const sendInvoiceCreated       = rcs.invoiceReady;
export const sendFlightTicketIssued   = rcs.flightTicket;
export const sendVisaIssued           = rcs.visaReady;
export const sendDepartureReminder    = rcs.departureReminder;
