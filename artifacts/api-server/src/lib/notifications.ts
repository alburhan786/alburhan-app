import axios from "axios";
import nodemailer from "nodemailer";
import { pool } from "@workspace/db";
import { getCachedConfig } from "./apiSettingsProvider.js";
import { isPlaceholderKey } from "./keyValidation.js";
import {
  sendBookingCreated as smsSendBookingCreated,
  sendBookingConfirmed as smsSendBookingConfirmed,
  sendBookingRejected as smsSendBookingRejected,
  sendPaymentReceived as smsSendPaymentReceived,
  sendPartialPaymentReceived as smsSendPartialPaymentReceived,
  sendPendingPaymentReminder as smsSendPendingPayment,
  sendInvoiceCreated as smsSendInvoiceCreated,
  sendFlightTicketIssued as smsSendTicket,
  sendVisaIssued as smsSendVisa,
  sendHotelVoucherIssued as smsSendHotelVoucher,
  sendDepartureReminder as smsSendDepartureReminder,
} from "./sms.js";

export interface SendResult {
  ok: boolean;
  provider: string;
  endpoint: string;
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 1500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// Read at call time — DB settings take priority, fall back to process.env
function getFast2SMSKey(): string | undefined {
  const dbCfg = getCachedConfig("fast2sms");
  if (dbCfg.enabled === false) return undefined;
  if (dbCfg.apiKey && !isPlaceholderKey(dbCfg.apiKey)) return dbCfg.apiKey;
  const k = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
  if (isPlaceholderKey(k)) return undefined;
  return k;
}

function getFast2SMSExtra() {
  const dbCfg = getCachedConfig("fast2sms");
  const ex = dbCfg.extra || {};
  const globalSender = ex.sender_id || "ALBURH";  // ALBURH is the approved DLT header (NOT ABURHA)
  return {
    sender_id: globalSender,
    // Per-event OTP sender — falls back to global sender_id
    otp_sender: ex.otp_sender || globalSender,
    // Hardcoded DLT defaults: otp_template_id=164844, notify_template_id=211277, sender=ALBURH
    // DB non-empty values override these via getCachedConfig() merge logic.
    otp_template_id:    ex.otp_template_id    || "164844",
    notify_template_id: ex.notify_template_id  || "",
  };
}

const BOTBEE_BASE_URL = "https://app.botbee.io/api/v1/whatsapp";

function toFast2SMSPhone(mobile: string | null | undefined): string {
  if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
    throw new Error("Missing or invalid mobile number");
  }
  const clean = mobile.replace(/\D/g, "");
  // Strip country code: +919876543210 or 919876543210 (12 digits)
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  // Strip leading zero: 09876543210 (11 digits)
  if (clean.startsWith("0") && clean.length === 11) return clean.slice(1);
  return clean;
}

function toBotBeePhone(mobile: string | null | undefined): string {
  if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
    throw new Error("Missing or invalid mobile number");
  }
  const clean = mobile.replace(/\D/g, "");
  if (!clean) throw new Error("Missing or invalid mobile number");
  if (clean.length === 10) return `91${clean}`;
  if (mobile.trim().startsWith("+")) return clean;
  return clean;
}

/** Strip leading + from phone_number_id (BotBee expects digits only, e.g. 918989701701 not +918989701701) */
function normalizeBotBeePhoneNumberId(id: string): string {
  return id.replace(/^\+/, "").replace(/\s/g, "");
}

// ── In-memory SMS attempt log (last 50 entries) ─────────────────────────────

export interface SmsRouteAttempt {
  route: string;
  requestUrl: string;
  httpStatus?: number;
  responseBody?: any;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface SmsAttemptLog {
  id: string;
  ts: string;
  mobileMasked: string;
  otp: string;
  finalSuccess: boolean;
  finalRoute?: string;
  attempts: SmsRouteAttempt[];
  totalDurationMs: number;
  apiKeyPresent: boolean;
  apiKeyMasked: string;
}

const SMS_LOG: SmsAttemptLog[] = [];
let _logId = 0;

function pushSmsLog(entry: SmsAttemptLog) {
  SMS_LOG.unshift(entry);
  if (SMS_LOG.length > 50) SMS_LOG.pop();
}

export function getSmsAttemptLog(): SmsAttemptLog[] {
  return SMS_LOG;
}

function maskMobile(mobile: string): string {
  if (mobile.length >= 4) return `*****${mobile.slice(-4)}`;
  return "****";
}

function extractF2sError(data: any): { code?: string; message: string } {
  if (!data) return { message: "No response body" };
  const msgs: string[] = Array.isArray(data.message)
    ? data.message
    : data.message
      ? [String(data.message)]
      : [];
  const code = data.status_code ? String(data.status_code) : data.code ? String(data.code) : undefined;
  let message = msgs.join("; ") || JSON.stringify(data);
  if (code === "412" || /invalid authentication/i.test(message)) {
    message = "Fast2SMS API Key is invalid. Please update it from Admin Settings.";
  }
  return { code, message };
}

// ── Main OTP SMS sender ──────────────────────────────────────────────────────

export interface SmsResult {
  sent: boolean;
  providerResponse?: any;
  error?: string;
  route?: string;
  urlUsed?: string;
  logId?: string;
}

export async function sendOtpSMS(mobile: string, otp: string): Promise<SmsResult> {
  const apiKey = getFast2SMSKey();
  const id = `sms_${++_logId}`;
  const overallStart = Date.now();

  const apiKeyPresent = !!apiKey;
  const apiKeyMasked = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "NOT_FOUND";

  // ── Pre-flight: API key ───────────────────────────────────────────────────
  if (!apiKey) {
    const msg = "Fast2SMS API Key is not configured.";
    console.error(`[OTP-SMS] ❌ ${msg}`);
    const logEntry: SmsAttemptLog = {
      id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp,
      finalSuccess: false, attempts: [], totalDurationMs: 0,
      apiKeyPresent: false, apiKeyMasked: "NOT_FOUND",
    };
    pushSmsLog(logEntry);
    return { sent: false, error: msg, logId: id };
  }

  const f2sExtra = getFast2SMSExtra();

  // ── Pre-flight: OTP DLT template must be configured ───────────────────────
  if (!f2sExtra.otp_template_id) {
    const msg = "OTP DLT Template is not configured. Go to Admin → API Settings → Fast2SMS and set the otp_template_id field with your TRAI-registered DLT template ID.";
    console.error(`[OTP-SMS] ❌ ${msg}`);
    const logEntry: SmsAttemptLog = {
      id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp,
      finalSuccess: false, attempts: [], totalDurationMs: Date.now() - overallStart,
      apiKeyPresent, apiKeyMasked,
    };
    pushSmsLog(logEntry);
    return { sent: false, error: msg, logId: id };
  }

  // ── Pre-flight: sender ID must be in the approved DLT list ───────────────
  const effectiveSender = f2sExtra.otp_sender;
  let approvedSenderIds: string[] = [];
  try {
    const r = await pool.query(
      `SELECT sender_id FROM sender_ids WHERE status = 'active' ORDER BY default_sender DESC`
    );
    approvedSenderIds = r.rows.map((row: any) => row.sender_id as string);
  } catch {
    // Table may not exist yet — fall back to known approved list
    approvedSenderIds = ["ABURHA", "ALBURH", "ALBUR", "ABTUMR", "ABTTHJ"];
  }
  if (!approvedSenderIds.includes(effectiveSender)) {
    const msg = `OTP SMS BLOCKED — Sender ID "${effectiveSender}" is not in the approved DLT list [${approvedSenderIds.join(", ")}]. Go to Admin → SMS Settings → Sender ID Management.`;
    console.error(`[OTP-SMS] ❌ ${msg}`);
    const logEntry: SmsAttemptLog = {
      id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp,
      finalSuccess: false, attempts: [], totalDurationMs: Date.now() - overallStart,
      apiKeyPresent, apiKeyMasked,
    };
    pushSmsLog(logEntry);
    return { sent: false, error: msg, logId: id };
  }

  const phone = toFast2SMSPhone(mobile);
  const attempts: SmsRouteAttempt[] = [];
  const errors: string[] = [];

  // ⛔ POLICY: DLT route ONLY. Quick/Promotional routes are not permitted.
  // If DLT fails, OTP delivery fails — WhatsApp OTP is the secondary channel (fire-and-forget).
  // Set otp_template_id in API Settings → Fast2SMS to enable OTP via DLT.

  console.log(`[OTP-SMS] Pre-flight passed — sender=${effectiveSender} template=${f2sExtra.otp_template_id} route=dlt mobile=${phone}`);

  // ── DLT route (registered Sender ID + Template) — ONLY permitted route ────
  {
    const t0 = Date.now();
    const variables = encodeURIComponent(`${otp}|`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${effectiveSender}&message=${f2sExtra.otp_template_id}&variables_values=${variables}&numbers=${phone}&flash=0`;
    const maskedUrl = url.replace(apiKey, apiKeyMasked);
    console.log(`[OTP-SMS][dlt] Sending → sender=${effectiveSender} template=${f2sExtra.otp_template_id} mobile=${phone}`);
    console.log(`[OTP-SMS][dlt] Request URL (masked): ${maskedUrl}`);
    try {
      const r = await axios.get(url, { timeout: 12000 });
      const durationMs = Date.now() - t0;
      const { code, message } = extractF2sError(r.data);
      const success = r.data?.return === true;
      console.log(`[OTP-SMS][dlt] Response — HTTP ${r.status} | return=${r.data?.return} | code=${code || "none"} | message="${message}" | duration=${durationMs}ms`);
      if (success) {
        console.log(`[OTP-SMS][dlt] ✅ DELIVERED — sender=${effectiveSender} template=${f2sExtra.otp_template_id} → ${phone}`);
      } else {
        console.error(`[OTP-SMS][dlt] ❌ REJECTED by Fast2SMS — code=${code} message="${message}" sender=${effectiveSender} template=${f2sExtra.otp_template_id}`);
        console.error(`[OTP-SMS][dlt] Full Fast2SMS response: ${JSON.stringify(r.data)}`);
      }
      attempts.push({ route: "dlt", requestUrl: maskedUrl, httpStatus: r.status, responseBody: r.data, success, errorCode: code, errorMessage: success ? undefined : message, durationMs });
      const log: SmsAttemptLog = { id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp, finalSuccess: success, finalRoute: success ? "dlt" : undefined, attempts, totalDurationMs: Date.now() - overallStart, apiKeyPresent, apiKeyMasked };
      pushSmsLog(log);
      if (success) return { sent: true, providerResponse: r.data, route: "dlt", urlUsed: maskedUrl, logId: id };
      // DLT failed — no Quick/Promotional fallback permitted
      const rejectionReason = message || "Fast2SMS rejected the request — check sender ID and template ID configuration";
      errors.push(`DLT rejected: ${rejectionReason}`);
      return { sent: false, route: "dlt_failed", providerResponse: r.data, urlUsed: maskedUrl, error: rejectionReason, logId: id };
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      const errBody = err?.response?.data;
      const errMsg = errBody ? extractF2sError(errBody).message : (err?.message || String(err));
      console.error(`[OTP-SMS][dlt] ✗ Network/timeout error: ${errMsg} (${durationMs}ms)`);
      console.error(`[OTP-SMS][dlt] Full error: ${JSON.stringify(errBody || err?.message)}`);
      attempts.push({ route: "dlt", requestUrl: maskedUrl, httpStatus: err?.response?.status, responseBody: errBody, success: false, errorMessage: errMsg, durationMs });
      errors.push(`DLT error: ${errMsg}`);
      const log: SmsAttemptLog = { id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp, finalSuccess: false, attempts, totalDurationMs: Date.now() - overallStart, apiKeyPresent, apiKeyMasked };
      pushSmsLog(log);
      return { sent: false, error: errors.join(" | "), logId: id };
    }
  }
}

// ── Admin diagnostics: fire all 3 routes against a test number ──────────────
export async function testSmsDiagnostics(phone: string, otp: string): Promise<Record<string, any>> {
  const apiKey = getFast2SMSKey();
  const envKeys = Object.keys(process.env).filter(k => k.includes("FAST2SMS"));
  const cleanPhone = toFast2SMSPhone(phone);
  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "NOT_FOUND";

  const diag: Record<string, any> = {
    apiKeyFound: !!apiKey,
    maskedKey,
    envKeysFound: envKeys,
    phone: cleanPhone,
    otp,
    otp_route: null,
    dlt: null,
    quick: null,
  };

  if (!apiKey) return diag;

  // OTP route — SKIPPED: requires website verification (status_code 996 on this account)
  diag.otp_route = { skipped: true, reason: "route=otp requires Fast2SMS website verification (status_code 996). Use DLT or Quick instead." };

  // DLT route
  try {
    const t0 = Date.now();
    const diagExtra = getFast2SMSExtra();
    const variables = encodeURIComponent(`${otp}|`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${diagExtra.sender_id}&message=${diagExtra.otp_template_id}&variables_values=${variables}&numbers=${cleanPhone}&flash=0`;
    const r = await axios.get(url, { timeout: 12000 });
    diag.dlt = { status: r.status, body: r.data, durationMs: Date.now() - t0 };
  } catch (e: any) {
    diag.dlt = { error: e?.response?.data || e?.message };
  }

  // Quick route — BLOCKED per India DLT compliance policy
  diag.quick = { skipped: true, reason: "route=q (Quick/Promotional) is blocked. Only DLT route is permitted for production SMS." };

  return diag;
}

export async function sendDLTSMS(
  mobile: string | null | undefined,
  var1: string,
  var2: string,
  var3: string
): Promise<boolean> {
  if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
    console.error("[SMS-DLT] Aborted — missing/invalid mobile number. vars:", var1, var2, var3);
    return false;
  }
  const apiKey = getFast2SMSKey();
  if (!apiKey) {
    console.log("[SMS-DLT] API key not set — vars:", var1, var2, var3, "for:", mobile);
    return false;
  }
  const phone = toFast2SMSPhone(mobile);
  const f2sExtra = getFast2SMSExtra();

  // ── Route 1: DLT (registered template, required for production India) ────
  if (f2sExtra.notify_template_id) {
    try {
      const variables = encodeURIComponent(`${var1}|${var2}|${var3}|`);
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${f2sExtra.sender_id}&message=${f2sExtra.notify_template_id}&variables_values=${variables}&numbers=${phone}&flash=0`;
      const response = await withRetry(() => axios.get(url));
      const data = response.data;
      // Fast2SMS returns HTTP 200 even on failure — must check body
      if (data?.return === false || data?.status_code >= 400) {
        console.error(`[SMS-DLT] ⛔ SMS BLOCKED — DLT delivery failed for ${mobile}:`, JSON.stringify(data), "Reason: DLT API returned error. Quick/Promotional routes are not permitted. Continuing with Email/WhatsApp.");
      } else {
        console.log("[SMS-DLT] ✅ Sent via DLT to", mobile, data);
        return true;
      }
    } catch (err: any) {
      console.error(`[SMS-DLT] ⛔ SMS BLOCKED — DLT request error for ${mobile}:`, err?.message, "Quick/Promotional routes are not permitted. Continuing with Email/WhatsApp.");
    }
  } else {
    console.warn("[SMS-DLT] ⛔ SMS BLOCKED — No DLT template ID (notify_template_id) configured in API Settings → Fast2SMS. Quick/Promotional routes are not permitted.");
  }

  // ⛔ FINAL BLOCK: No fallback routes permitted. India DLT compliance requires approved template.
  // Continuing Email/WhatsApp channels.
  return false;
}

export async function sendWhatsApp(mobile: string | null | undefined, message: string): Promise<SendResult> {
  const bbCfg = getCachedConfig("botbee");
  const bbBaseUrl = bbCfg.apiUrl || BOTBEE_BASE_URL;
  const endpoint = `${bbBaseUrl}/send`;
  if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
    return { ok: false, provider: "BotBee", endpoint, errorMessage: "Missing or invalid mobile number" };
  }
  if (bbCfg.enabled === false) {
    return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled in API Settings" };
  }
  const BOTBEE_API_KEY = bbCfg.apiKey || process.env.BOTBEE_API_KEY;
  const BOTBEE_PHONE_NUMBER_ID = normalizeBotBeePhoneNumberId(bbCfg.extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "");
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    return { ok: false, provider: "BotBee", endpoint, errorMessage: "API key or Phone Number ID not configured" };
  }
  try {
    const phone = toBotBeePhone(mobile);
    const safePayload = { phone_number_id: BOTBEE_PHONE_NUMBER_ID, phone_number: phone, message };
    const params = new URLSearchParams({
      apiToken: BOTBEE_API_KEY,
      phone_number_id: BOTBEE_PHONE_NUMBER_ID,
      phone_number: phone,
      message,
    });
    const response = await withRetry(() =>
      axios.post(endpoint, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000,
      })
    );
    const result = response.data;
    if (result?.status === "0" || result?.status === 0) {
      const errMsg: string = result.message || "Message delivery failed";
      console.warn("[WhatsApp] Session msg failed for", mobile, ":", errMsg);
      // 24-hour window: customer hasn't messaged the bot recently — template API not supported by BotBee
      if (errMsg.toLowerCase().includes("24 hour") || errMsg.toLowerCase().includes("outside")) {
        console.log("[WhatsApp] 24h window for", mobile, "— cold contact, message skipped");
        return { ok: false, window24h: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: safePayload, responsePayload: result, errorMessage: "24h window: customer has not messaged in the last 24h. WhatsApp message not delivered." };
      }
      return { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: safePayload, responsePayload: result, errorMessage: errMsg };
    }
    console.log("[WhatsApp] Session msg sent to", mobile, result);
    return { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: safePayload, responsePayload: result };
  } catch (err: any) {
    const resp = err?.response;
    const errMsg: string = resp?.data?.message || resp?.data?.error || err.message || "";
    console.error("[WhatsApp] Error after retries for", mobile, ":", resp?.data || err.message);
    // 24-hour window error can also surface as an HTTP error
    if (errMsg.toLowerCase().includes("24 hour") || errMsg.toLowerCase().includes("outside")) {
      console.log("[WhatsApp] 24h window (catch) for", mobile, "— cold contact, message skipped");
      return { ok: false, window24h: true, provider: "BotBee", endpoint, httpStatus: resp?.status, requestPayload: { phone_number: mobile, message: message.substring(0, 200) }, responsePayload: resp?.data, errorMessage: "24h window: customer has not messaged in the last 24h. WhatsApp message not delivered." };
    }
    return {
      ok: false, provider: "BotBee", endpoint,
      httpStatus: resp?.status,
      requestPayload: { phone_number: mobile, message: message.substring(0, 200) },
      responsePayload: resp?.data,
      errorCode: String(resp?.data?.code || resp?.data?.error_code || ""),
      errorMessage: errMsg,
    };
  }
}

export interface RcsRichData {
  url?: string;
  agent?: "jio" | "vi" | string;
  active?: boolean;
}

export async function sendRCS(
  mobile: string | null | undefined,
  customerName: string,
  messageText: string,
  richData?: RcsRichData
): Promise<SendResult> {
  const leminCfg = getCachedConfig("lemin");
  const endpoint = leminCfg.apiUrl || process.env.LEMIN_API_URL || "https://rcs.leminai.com/api/send/template";
  if (!mobile || typeof mobile !== "string" || !mobile.trim()) {
    return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "Missing or invalid mobile number" };
  }
  if (leminCfg.enabled === false) {
    return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "RCS disabled in API Settings" };
  }
  // apiKey IS the Developer API Key (user_id); fall back to legacy extra.user_id
  const lemin_user_id = leminCfg.apiKey || leminCfg.extra.user_id || process.env.LEMIN_USER_ID || "";
  const lemin_template_id = leminCfg.extra.template_id || process.env.LEMIN_TEMPLATE_ID || "1473";
  if (!lemin_user_id) {
    return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "Lemin Developer API Key (user_id) not configured" };
  }
  try {
    const clean = mobile.replace(/\D/g, "");
    const phone = clean.startsWith("91") && clean.length === 12 ? clean.slice(2) : clean;
    const payload: Record<string, unknown> = {
      type: "single", dial_code: "+91", template: lemin_template_id,
      phone, user_id: lemin_user_id,
      variables: { name: customerName || "Pilgrim", message: messageText },
    };
    if (richData?.active && richData?.url) {
      payload.rich_data = { url: richData.url, agent: richData.agent || "jio", active: "true" };
    }
    const response = await withRetry(() =>
      axios.post(endpoint, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      })
    );
    const result = response.data;
    if (result?.status === false || result?.success === false) {
      console.warn("[RCS] Send failed for", mobile, ":", result?.message || result?.error);
      return { ok: false, provider: "Lemin AI", endpoint, httpStatus: response.status, requestPayload: payload, responsePayload: result, errorMessage: result?.message || result?.error || "RCS delivery failed" };
    }
    console.log("[RCS] Sent to", mobile, result);
    return { ok: true, provider: "Lemin AI", endpoint, httpStatus: response.status, requestPayload: payload, responsePayload: result };
  } catch (err: any) {
    const resp = err?.response;
    const rcsErrMsg: string = resp?.data?.message || resp?.data?.error || err.message || "";
    // "Invalid User ID" means Lemin credentials aren't configured correctly — treat as "not configured"
    if (rcsErrMsg.toLowerCase().includes("invalid user") || rcsErrMsg.toLowerCase().includes("invalid_user")) {
      console.warn("[RCS] Lemin user_id is invalid — configure LEMIN_USER_ID in API Settings to enable RCS");
      return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "RCS not configured: invalid Lemin user_id. Set in Admin → API Settings." };
    }
    console.error("[RCS] Error after retries for", mobile, ":", resp?.data || err.message);
    return {
      ok: false, provider: "Lemin AI", endpoint,
      httpStatus: resp?.status,
      requestPayload: { phone: mobile, dial_code: "+91", template: lemin_template_id },
      responsePayload: resp?.data,
      errorCode: String(resp?.data?.code || resp?.data?.error_code || ""),
      errorMessage: rcsErrMsg,
    };
  }
}

export async function sendWhatsAppTemplate(
  mobile: string,
  templateName: string,
  components: object[]
): Promise<boolean> {
  const bbCfg2 = getCachedConfig("botbee");
  if (bbCfg2.enabled === false) { console.log("[WhatsApp-Template] disabled in API Settings"); return false; }
  const BOTBEE_API_KEY = bbCfg2.apiKey || process.env.BOTBEE_API_KEY;
  const BOTBEE_PHONE_NUMBER_ID = normalizeBotBeePhoneNumberId(bbCfg2.extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "");
  const BOTBEE_BUSINESS_ID = bbCfg2.extra.business_id || process.env.BOTBEE_BUSINESS_ID;
  const bbBaseUrl2 = bbCfg2.apiUrl || BOTBEE_BASE_URL;
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    console.log("[WhatsApp-Template] API not configured, skipping:", mobile);
    return false;
  }
  try {
    const phone = toBotBeePhone(mobile);
    const payload: Record<string, unknown> = {
      apiToken: BOTBEE_API_KEY,
      phone_number_id: BOTBEE_PHONE_NUMBER_ID,
      phone_number: phone,
      template: {
        name: templateName,
        language: { code: "en" },
        components,
      },
    };
    if (BOTBEE_BUSINESS_ID) {
      payload.business_account_id = BOTBEE_BUSINESS_ID;
    }
    const response = await withRetry(() =>
      axios.post(
        `${bbBaseUrl2}/send-template`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      )
    );
    console.log("[WhatsApp-Template] Sent", templateName, "to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[WhatsApp-Template] Error after retries for", mobile, ":", err?.response?.data || err.message);
    return false;
  }
}

function getEmailTransport() {
  const smtpCfg = getCachedConfig("smtp");
  if (smtpCfg.enabled === false) return null;
  const host = smtpCfg.apiUrl || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(smtpCfg.extra.port || process.env.SMTP_PORT || 587);
  const user = smtpCfg.extra.user || process.env.SMTP_USER;
  const pass = smtpCfg.apiKey || process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

/** Build a properly styled HTML email — avoids spam filters, renders correctly */
function buildHtmlEmail(bodyText: string): string {
  const escaped = bodyText
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Al Burhan Tours &amp; Travels</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0B3D2E;padding:24px 32px;text-align:center;">
    <h1 style="color:#C9A84C;margin:0;font-size:20px;font-weight:bold;">Al Burhan Tours &amp; Travels</h1>
    <p style="color:#90c4a8;margin:4px 0 0;font-size:12px;">Trusted Hajj &amp; Umrah Services — 35+ Years</p>
  </td></tr>
  <tr><td style="padding:32px;color:#333333;font-size:15px;line-height:1.7;">
    ${escaped}
  </td></tr>
  <tr><td style="background:#f8f8f8;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
    <p style="margin:0;font-size:12px;color:#888888;">Al Burhan Tours &amp; Travels | Bhopal, India</p>
    <p style="margin:4px 0 0;font-size:12px;color:#888888;">📞 +91 9893225590 | ✉ info@alburhantravels.online</p>
    <p style="margin:4px 0 0;font-size:11px;color:#aaaaaa;">This is an automated notification. Please do not reply to this email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(to: string, subject: string, body: string, htmlBody?: string, attachments?: EmailAttachment[]): Promise<SendResult> {
  if (!to) return { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No recipient email" };
  const transport = getEmailTransport();
  if (!transport) {
    return { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "SMTP not configured — check API Settings" };
  }
  const smtpCfg = getCachedConfig("smtp");
  const smtpHost = smtpCfg.apiUrl || process.env.SMTP_HOST || "smtp.gmail.com";
  const endpoint = `smtp://${smtpHost}`;
  // IMPORTANT: 'from' MUST match the SMTP authenticated user, otherwise Gmail/SMTP rejects it
  // Use the auth user as the sender; set replyTo to the business address
  const smtpUser = smtpCfg.extra.user || process.env.SMTP_USER || "";
  const fromDisplay = smtpCfg.extra.from_name || "Al Burhan Tours & Travels";
  const replyTo = smtpCfg.extra.from_email || "info@alburhantravels.online";
  const from = `${fromDisplay} <${smtpUser}>`;

  // Strip HTML tags from body text for plain-text version
  const plainText = body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");

  try {
    await withRetry(() =>
      transport!.sendMail({
        from,
        replyTo,
        to, subject,
        text: plainText,
        html: htmlBody || buildHtmlEmail(plainText),
        attachments: attachments?.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      })
    );
    console.log("[Email] Sent to:", to, "Subject:", subject, attachments?.length ? `(+${attachments.length} attachment${attachments.length > 1 ? "s" : ""})` : "");
    return { ok: true, provider: "SMTP", endpoint, requestPayload: { from, to, subject }, responsePayload: { delivered: true } };
  } catch (err: any) {
    console.error("[Email] Error after retries to", to, ":", err?.message);
    return {
      ok: false, provider: "SMTP", endpoint,
      requestPayload: { to, subject },
      errorCode: err?.code || err?.responseCode || "",
      errorMessage: err?.message || "SMTP delivery failed",
    };
  }
}

export async function sendBookingSubmissionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  packageName: string;
  numberOfPilgrims: number;
  bookingId?: string | null;
  pool?: any;
}) {
  const customerMsg = `Assalamu Alaikum ${opts.customerName},\n\nYour booking #${opts.bookingNumber} for "${opts.packageName}" (${opts.numberOfPilgrims} pilgrim${opts.numberOfPilgrims > 1 ? "s" : ""}) has been submitted.\n\nOur team will review shortly and notify you once approved.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;
  const adminMsg = `New Booking Alert!\n\nBooking #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nPackage: ${opts.packageName}\nPilgrims: ${opts.numberOfPilgrims}\n\nReview from admin dashboard.`;

  const [waRes, smsRes, emailRes, rcsRes] = await Promise.allSettled([
    sendWhatsApp(opts.mobile, customerMsg),
    smsSendBookingCreated({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, packageName: opts.packageName, bookingId: opts.bookingId || undefined })
      .then((r): SendResult => ({ ok: r.ok, provider: r.provider, endpoint: "sms-dlt", responsePayload: r.responsePayload, errorMessage: r.errorMessage }))
      .catch((e: any): SendResult => ({ ok: false, provider: "Fast2SMS", endpoint: "sms-dlt", errorMessage: e?.message || "SMS error" })),
    opts.email ? sendEmail(opts.email, "Booking Submitted – Al Burhan Tours & Travels", customerMsg) : Promise.resolve({ ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No email" } as SendResult),
    sendRCS(opts.mobile, opts.customerName, customerMsg),
  ]);

  // Fire admin WhatsApp alerts (fire-and-forget)
  Promise.allSettled([
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]).catch(() => {});

  const waOk    = waRes.status === "fulfilled"    && (waRes.value as SendResult).ok;
  const smsOk   = smsRes.status === "fulfilled"   && (smsRes.value as SendResult).ok;
  const emailOk = emailRes.status === "fulfilled" && (emailRes.value as SendResult).ok;
  const rcsOk   = rcsRes.status === "fulfilled"   && (rcsRes.value as SendResult).ok;

  console.log("[Submission] WA:", waOk, "SMS:", smsOk, "Email:", emailOk, "RCS:", rcsOk);
  if (!waOk)    console.error("[Submission] WhatsApp:", waRes.status === "rejected" ? waRes.reason : (waRes.value as SendResult).errorMessage);
  if (!smsOk)   console.error("[Submission] SMS:", smsRes.status === "rejected" ? smsRes.reason : (smsRes.value as SendResult).errorMessage);
  if (!emailOk) console.error("[Submission] Email:", emailRes.status === "rejected" ? emailRes.reason : (emailRes.value as SendResult).errorMessage);
  if (!rcsOk)   console.error("[Submission] RCS:", rcsRes.status === "rejected" ? rcsRes.reason : (rcsRes.value as SendResult).errorMessage);

  // Log to booking_confirmation_notifications so UI shows real delivery status
  if (opts.bookingId && opts.pool) {
    const { randomUUID } = await import("crypto");
    const channelRows: Array<{ ch: string; ok: boolean; msg?: string }> = [
      { ch: "whatsapp", ok: waOk,    msg: !waOk    ? String((waRes.status === "rejected" ? waRes.reason : (waRes.value as SendResult).errorMessage) ?? "failed") : undefined },
      { ch: "sms",      ok: smsOk,   msg: !smsOk   ? String((smsRes.status === "rejected" ? smsRes.reason : (smsRes.value as SendResult).errorMessage) ?? "failed") : undefined },
      { ch: "email",    ok: emailOk, msg: !emailOk ? String((emailRes.status === "rejected" ? emailRes.reason : (emailRes.value as SendResult).errorMessage) ?? "failed") : undefined },
      { ch: "rcs",      ok: rcsOk,   msg: !rcsOk   ? String((rcsRes.status === "rejected" ? rcsRes.reason : (rcsRes.value as SendResult).errorMessage) ?? "failed") : undefined },
    ];
    for (const row of channelRows) {
      await opts.pool.query(
        `INSERT INTO booking_confirmation_notifications (id, booking_id, channel, status, error_message, sent_at, retry_count)
         VALUES ($1, $2, $3, $4, $5, NOW(), 0)
         ON CONFLICT (id) DO NOTHING`,
        [randomUUID(), opts.bookingId, row.ch, row.ok ? "sent" : "failed", row.ok ? null : row.msg]
      ).catch((e: any) => console.error("[Submission] DB log failed:", e?.message));
    }
  }
}

export async function sendBookingApprovalNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nYour booking #${opts.bookingNumber} with Al Burhan Tours & Travels has been APPROVED.\n\nPlease login to complete payment.\n\nHelp: +91 8989701701 / +91 9893989786\n\nJazak Allah Khair!`;
  await Promise.allSettled([
    smsSendBookingConfirmed({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Approved – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendBookingRejectionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  reason?: string | null;
}) {
  const reasonText = opts.reason ? `\n\nReason: ${opts.reason}` : "";
  const message = `Assalamu Alaikum ${opts.customerName},\n\nWe regret that your booking #${opts.bookingNumber} could not be processed.${reasonText}\n\nPlease contact us:\n+91 8989701701\n+91 9893989786`;
  await Promise.allSettled([
    smsSendBookingRejected({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, reason: opts.reason || undefined }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Update – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

/**
 * Notifies office admins of a payment event via WhatsApp + Email + Dashboard.
 * Customer-facing notifications (WhatsApp/SMS/Email with retry + logging) are
 * handled separately via triggerWorkflow()/fireNotificationEvent() — this is
 * ONLY the admin-side alert. Every channel result is tracked so failures are
 * never silent (see notification_logs / admin_notifications).
 */
export async function sendAdminPaymentAlert(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  mobile: string;
  amount: string;
  isFullyPaid: boolean;
  invoiceNumber?: string | null;
  balance?: string;
}): Promise<{ whatsapp: SendResult[]; email: SendResult[] }> {
  const label = opts.isFullyPaid ? "Full Payment Received — Booking CONFIRMED" : "Partial Payment Received";
  const adminMsg = `💰 ${label}\n\nBooking: #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nAmount: Rs.${opts.amount}${opts.balance ? `\nBalance: Rs.${opts.balance}` : ""}${opts.invoiceNumber ? `\nInvoice: ${opts.invoiceNumber}` : ""}`;
  const adminNumbers = ["9893989786", "8989701701"];
  const adminEmails = ["admin@alburhantravels.online", "altaf@alburhantravels.online"];

  const [waResults, emailResults] = await Promise.all([
    Promise.all(adminNumbers.map((n) => sendWhatsApp(n, adminMsg))),
    Promise.all(adminEmails.map((e) => sendEmail(e, `[Al Burhan] ${label}`, adminMsg))),
  ]);

  waResults.forEach((r, i) => { if (!r.ok) console.error(`[AdminAlert] WhatsApp to ${adminNumbers[i]} failed:`, r.errorMessage); });
  emailResults.forEach((r, i) => { if (!r.ok) console.error(`[AdminAlert] Email to ${adminEmails[i]} failed:`, r.errorMessage); });

  try {
    const { createAdminNotification } = await import("./adminNotifications.js");
    await createAdminNotification("payment_received", `${label} — ${opts.customerName}`, {
      bookingId: opts.bookingId,
      bookingNumber: opts.bookingNumber,
      customerName: opts.customerName,
      customerMobile: opts.mobile,
      amount: opts.amount,
      extra: { isFullyPaid: opts.isFullyPaid, balance: opts.balance, invoiceNumber: opts.invoiceNumber },
    });
  } catch (err: any) {
    console.error("[AdminAlert] Dashboard notification failed:", err?.message);
  }

  return { whatsapp: waResults, email: emailResults };
}

/** @deprecated kept temporarily; superseded by triggerWorkflow("payment_received") + sendAdminPaymentAlert */
export async function sendPaymentConfirmationNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  amount: string;
  invoiceNumber: string;
  invoiceUrl?: string;
}) {
  const invoiceLine = opts.invoiceUrl ? `\n\nInvoice: ${opts.invoiceUrl}` : "";
  const message = `Assalamu Alaikum ${opts.customerName},\n\nPayment of Rs.${opts.amount} received for booking #${opts.bookingNumber}.\n\nYour booking is CONFIRMED!\nInvoice No: ${opts.invoiceNumber}${invoiceLine}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;

  await Promise.allSettled([
    smsSendPaymentReceived({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, amount: opts.amount }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Confirmed – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

/** @deprecated kept temporarily; superseded by triggerWorkflow("partial_payment_received") + sendAdminPaymentAlert */
export async function sendPartialPaymentNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  paidAmount: string;
  remainingAmount: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nPartial payment of Rs.${opts.paidAmount} received for booking #${opts.bookingNumber}.\n\nBalance remaining: Rs.${opts.remainingAmount}\n\nPlease login to pay the remaining amount.\n\nAl Burhan Tours & Travels\n+91 8989701701`;
  await Promise.allSettled([
    smsSendPartialPaymentReceived({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, paidAmount: opts.paidAmount, balanceAmount: opts.remainingAmount }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Partial Payment Received – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendCustomerDocumentUploadNotification(opts: {
  customerName: string;
  customerMobile: string;
  bookingNumber: string;
  documentType: string;
}) {
  const docLabel = opts.documentType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const adminMsg = `Document Uploaded!\n\nBooking: #${opts.bookingNumber}\nCustomer: ${opts.customerName} (${opts.customerMobile})\nDocument: ${docLabel}\n\nReview in admin dashboard.`;
  await Promise.allSettled([
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}

const ADMIN_NOTIFICATION_EMAILS = [
  "admin@alburhantravels.online",
  "altaf@alburhantravels.online",
];

export async function sendAdminNewBookingEmail(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  packageName?: string | null;
  finalAmount?: number | null;
  numberOfPilgrims: number;
  isOffline: boolean;
}): Promise<void> {
  const transport = getEmailTransport();
  if (!transport) {
    console.log("[AdminEmail] SMTP not configured — skipping admin booking email");
    return;
  }
  const from = process.env.SMTP_USER || "info@alburhantravels.online";
  const subject = opts.isOffline
    ? `[Al Burhan] New Offline Booking — ${opts.customerName}`
    : `[Al Burhan] New Booking Request — ${opts.customerName}`;
  const dashLink = `https://alburhantravels.online/admin/bookings`;
  const amountLine = opts.finalAmount
    ? `₹${Number(opts.finalAmount).toLocaleString("en-IN")}`
    : "To be calculated";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;color:#222">
  <div style="background:#1a3c5e;padding:20px 28px;border-radius:10px 10px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">
      ${opts.isOffline ? "📋 New Offline Booking" : "📬 New Booking Request"}
    </h2>
    <p style="color:#a8c4e0;margin:4px 0 0">Al Burhan Tours &amp; Travels — Admin Alert</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555;width:40%"><strong>Customer Name</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee">${opts.customerName}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Mobile</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee">${opts.customerMobile}</td></tr>
      ${opts.customerEmail ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Email</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee">${opts.customerEmail}</td></tr>` : ""}
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Booking ID</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee;font-family:monospace">${opts.bookingNumber}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Package</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee">${opts.packageName ?? "—"}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Pilgrims</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee">${opts.numberOfPilgrims}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555"><strong>Total Amount</strong></td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;color:#1a3c5e">${amountLine}</td></tr>
      <tr><td style="padding:8px 0;color:#555"><strong>Date &amp; Time</strong></td><td style="padding:8px 0">${new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}</td></tr>
    </table>
    <div style="margin-top:24px;text-align:center">
      <a href="${dashLink}" style="background:#1a3c5e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
        View Booking in Dashboard →
      </a>
    </div>
  </div>
  <p style="color:#aaa;font-size:11px;text-align:center;margin-top:16px">Al Burhan Tours &amp; Travels · admin@alburhantravels.online</p>
</body>
</html>`;

  const results = await Promise.allSettled(
    ADMIN_NOTIFICATION_EMAILS.map((to) =>
      transport!.sendMail({
        from: `Al Burhan Tours & Travels <${from}>`,
        to,
        subject,
        html,
        text: `New Booking: ${opts.customerName}\nMobile: ${opts.customerMobile}\nBooking: ${opts.bookingNumber}\nPackage: ${opts.packageName ?? "—"}\nPilgrims: ${opts.numberOfPilgrims}\nAmount: ${amountLine}\n\nView: ${dashLink}`,
      }),
    ),
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`[AdminEmail] Sent admin booking alert to ${ADMIN_NOTIFICATION_EMAILS[i]}`);
    } else {
      console.error(`[AdminEmail] Failed to ${ADMIN_NOTIFICATION_EMAILS[i]}:`, (r as PromiseRejectedResult).reason?.message);
    }
  });
}

export async function sendAdminDocumentReadyNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  documentType: string;
}) {
  const docLabel = opts.documentType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const message = `Assalamu Alaikum ${opts.customerName},\n\nYour ${docLabel} for booking #${opts.bookingNumber} is ready.\n\nPlease login to your dashboard to view and download it.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;
  const docSmsMap: Record<string, () => Promise<any>> = {
    ticket:  () => smsSendTicket({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    visa:    () => smsSendVisa({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    voucher: () => smsSendHotelVoucher({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
  };
  const smsKey = Object.keys(docSmsMap).find(k => opts.documentType.toLowerCase().includes(k));
  await Promise.allSettled([
    smsKey ? docSmsMap[smsKey]() : smsSendInvoiceCreated({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, `Your ${docLabel} is Ready – Al Burhan Tours & Travels`, message) : Promise.resolve(),
    sendRCS(opts.mobile, opts.customerName, message, { active: true, url: "https://www.alburhantravels.online/dashboard", agent: "jio" }),
  ]);
}

const JOURNEY_STATUS_MESSAGES: Record<string, { title: string; body: (name: string, bn: string) => string }> = {
  booking_requested:  { title: "Booking Submitted",     body: (n, b) => `Assalamu Alaikum ${n},\n\nYour booking #${b} has been submitted. Our team will review shortly and notify you once approved.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701` },
  documents_pending:  { title: "Documents Required",    body: (n, b) => `Assalamu Alaikum ${n},\n\n📄 We need your documents for booking #${b}.\n\nPlease upload: Passport, Aadhaar, PAN Card & Photo in your dashboard.\n\nLogin: alburhantravels.online\n\nAl Burhan Tours & Travels\n+91 8989701701` },
  documents_received: { title: "Documents Received",    body: (n, b) => `Assalamu Alaikum ${n},\n\n✅ Documents received for booking #${b}.\n\nWe are reviewing your documents. You will be notified once verification is complete.\n\nAl Burhan Tours & Travels` },
  admin_verification: { title: "Under Verification",    body: (n, b) => `Assalamu Alaikum ${n},\n\n🔍 Booking #${b} is currently under admin verification.\n\nWe will notify you as soon as the process is complete.\n\nAl Burhan Tours & Travels` },
  payment_pending:    { title: "Payment Pending",        body: (n, b) => `Assalamu Alaikum ${n},\n\n💰 Payment pending for booking #${b}.\n\nPlease login to complete your payment and secure your seat.\n\nLogin: alburhantravels.online\n\nAl Burhan Tours & Travels\n+91 8989701701` },
  payment_received:   { title: "Payment Received",       body: (n, b) => `Assalamu Alaikum ${n},\n\n✅ Payment received for booking #${b}.\n\nJazak Allah Khair! Your seat is now confirmed.\n\nAl Burhan Tours & Travels` },
  invoice_generated:  { title: "Invoice Generated",      body: (n, b) => `Assalamu Alaikum ${n},\n\n🧾 Your invoice for booking #${b} is ready.\n\nLogin to download it from your dashboard.\n\nalburhantravels.online\n\nAl Burhan Tours & Travels` },
  visa_processing:    { title: "Visa Processing",        body: (n, b) => `Assalamu Alaikum ${n},\n\n🛂 Your visa application for booking #${b} has been submitted.\n\nWe will notify you as soon as the visa is approved, Insha'Allah.\n\nAl Burhan Tours & Travels` },
  visa_approved:      { title: "Visa Approved",          body: (n, b) => `Assalamu Alaikum ${n},\n\nAlhamdulillah! 🎉 Your VISA is APPROVED for booking #${b}.\n\nPlease visit our office to collect your travel documents.\n\nAl Burhan Tours & Travels\n+91 8989701701` },
  flight_confirmed:   { title: "Flight Ticket Issued",   body: (n, b) => `Assalamu Alaikum ${n},\n\n✈️ Flight ticket issued for booking #${b}.\n\nYour flight is confirmed. Login to view your e-ticket.\n\nalburhantravels.online\n\nAl Burhan Tours & Travels` },
  hotel_confirmed:    { title: "Hotel Confirmed",        body: (n, b) => `Assalamu Alaikum ${n},\n\n🏨 Hotel confirmed for booking #${b}.\n\nYour accommodation has been booked. Login to view details.\n\nAl Burhan Tours & Travels` },
  bus_allocated:      { title: "Bus Allocated",          body: (n, b) => `Assalamu Alaikum ${n},\n\n🚌 Bus details assigned for booking #${b}.\n\nYour bus has been allocated. Login to view your bus number and schedule.\n\nAl Burhan Tours & Travels` },
  room_allocated:     { title: "Room Allocated",         body: (n, b) => `Assalamu Alaikum ${n},\n\n🛏️ Room allocated for booking #${b}.\n\nYour room assignment is ready. Login to view details.\n\nAl Burhan Tours & Travels` },
  departure_ready:    { title: "Departure Ready",        body: (n, b) => `Assalamu Alaikum ${n},\n\n🧳 DEPARTURE READY — Booking #${b}\n\nAlhamdulillah! Everything is set for your departure.\n\nPlease check your dashboard for all travel details and report time.\n\nMay Allah accept your Hajj/Umrah. Ameen!\nAl Burhan Tours & Travels\n+91 8989701701` },
  journey_started:    { title: "Journey Started",        body: (n, b) => `Assalamu Alaikum ${n},\n\n🛫 Bismillah! Your journey has begun — Booking #${b}.\n\nMay Allah make your journey safe, blessed and accepted. Ameen!\n\nAl Burhan Tours & Travels` },
  reached_makkah:     { title: "Reached Makkah",        body: (n, b) => `Assalamu Alaikum ${n},\n\nAlhamdulillah! 🕋 You have reached Makkah Al-Mukarramah — Booking #${b}.\n\nMay Allah grant you Tawaf, Sa'ee and all the blessings of this sacred land. Ameen!\n\nAl Burhan Tours & Travels` },
  reached_madinah:    { title: "Reached Madinah",       body: (n, b) => `Assalamu Alaikum ${n},\n\nAlhamdulillah! 🕌 You have reached Madinah Al-Munawwarah — Booking #${b}.\n\nMay Allah grant you the honour of Salawat at Masjid Al-Nabawi. Ameen!\n\nAl Burhan Tours & Travels` },
  return_flight:      { title: "Return Journey",         body: (n, b) => `Assalamu Alaikum ${n},\n\n🛫 Return journey has begun for Booking #${b}.\n\nMay Allah accept all your ibadah and grant you Hajj Mabroor. Ameen!\n\nAl Burhan Tours & Travels` },
  journey_completed:  { title: "Journey Completed",      body: (n, b) => `Assalamu Alaikum ${n},\n\nAlhamdulillah! 🏠 Welcome home! Booking #${b} — Journey Completed.\n\nMay Allah accept your Hajj/Umrah and grant you Hajj Mabroor.\n\nJazak Allah Khair for choosing Al Burhan Tours & Travels!\n+91 8989701701` },
};

export async function sendJourneyStatusNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  journeyStatus: string;
}) {
  const entry = JOURNEY_STATUS_MESSAGES[opts.journeyStatus];
  if (!entry) return;
  const message = entry.body(opts.customerName, opts.bookingNumber);

  // Journey status DLT SMS: route to the closest matching approved template
  const departureStatuses = ["departed", "flight_departed", "in_flight", "checked_in"];
  const isDeparture = departureStatuses.includes((opts.journeyStatus || "").toLowerCase());
  await Promise.allSettled([
    sendWhatsApp(opts.mobile, message),
    isDeparture
      ? smsSendDepartureReminder({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, departureDate: "As scheduled" })
      : Promise.resolve(),
    opts.email
      ? import("../services/emailService.js").then(({ sendBookingStatusEmail }) =>
          sendBookingStatusEmail(opts.email!, {
            customerName:  opts.customerName,
            bookingNumber: opts.bookingNumber,
            newStatus:     opts.journeyStatus,
          })
        )
      : Promise.resolve(),
  ]);
}

// ── Booking Confirmation Notification (rich, full-detail) ─────────────────

export interface ConfirmationChannelResult {
  whatsapp: SendResult;
  sms: SendResult;
  email: SendResult;
  rcs: SendResult;
  dashboard: { ok: boolean; errorMessage?: string };
}

export async function sendBookingConfirmationNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  packageName?: string | null;
  numberOfPilgrims?: number | null;
  departureDate?: string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
  balanceAmount?: number | string | null;
  customerId?: string | null;
  bookingId?: string | null;
  pool: any;
}): Promise<ConfirmationChannelResult> {
  const fmt = (n: any) => n != null && Number(n) > 0 ? Number(n).toLocaleString("en-IN") : "0";
  const total   = fmt(opts.totalAmount);
  const paid    = fmt(opts.paidAmount);
  const balance = fmt(opts.balanceAmount ?? (Number(opts.totalAmount || 0) - Number(opts.paidAmount || 0)));
  const dep     = opts.departureDate ? new Date(opts.departureDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "To be announced";
  const pilgrims = opts.numberOfPilgrims ?? 1;
  const pkg = opts.packageName || "Hajj / Umrah Package";

  const waMsg =
`🌙 Assalamu Alaikum ${opts.customerName},

Alhamdulillah!

Your Hajj/Umrah booking with Al Burhan Tours & Travels has been successfully confirmed.

📌 Booking ID:
${opts.bookingNumber}

🕋 Package:
${pkg}

👤 Pilgrims:
${pilgrims}

📅 Departure:
${dep}

💰 Total Package Cost:
₹${total}

💳 Amount Paid:
₹${paid}

💵 Balance:
₹${balance}

Please log in to your customer dashboard to:

• Complete your travel profile
• Upload Passport, PAN & Aadhaar
• Submit bank payment (NEFT/RTGS/IMPS) if pending
• Track visa status
• Download Invoice
• Download Flight Ticket
• Download Hotel Voucher
• Download Visa
• View Journey Status

Dashboard:
https://www.alburhantravels.online/dashboard

Need Help?

📞 +91 9893225590
📧 info@alburhantravels.online
🌐 https://www.alburhantravels.online

May Allah accept your pilgrimage.

Al Burhan Tours & Travels`;

  const smsMsg =
`Dear ${opts.customerName},

Your Hajj/Umrah booking with Al Burhan Tours & Travels has been confirmed.

Booking ID:
${opts.bookingNumber}

Package:
${pkg}

Departure:
${dep}

Login:
https://www.alburhantravels.online/dashboard

Support:
+91 9893225590`;

  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0B3D2E 0%,#1a6b4a 100%);padding:32px 40px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">AL BURHAN TOURS &amp; TRAVELS</h1>
          <p style="color:#a8d5b5;margin:6px 0 0;font-size:13px">Hajj &amp; Umrah Specialists</p>
        </td></tr>
        <!-- Green banner -->
        <tr><td style="background:#16a34a;padding:18px 40px;text-align:center">
          <p style="color:#fff;margin:0;font-size:18px;font-weight:bold">✅ Booking Confirmed — Alhamdulillah!</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px">
          <p style="color:#374151;font-size:15px;margin:0 0 16px">Assalamu Alaikum <strong>${opts.customerName}</strong>,</p>
          <p style="color:#374151;font-size:14px;margin:0 0 24px">Your Hajj/Umrah booking has been <strong>successfully confirmed</strong>. May Allah accept your pilgrimage. Ameen!</p>

          <!-- Booking Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
            <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-weight:bold;color:#0B3D2E;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Booking Details</td></tr>
            <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px;width:45%">Booking ID</td><td style="padding:10px 16px;font-family:monospace;font-weight:bold;font-size:14px;color:#0B3D2E">${opts.bookingNumber}</td></tr>
            <tr style="background:#f9fafb;border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px">Package</td><td style="padding:10px 16px;font-size:14px;font-weight:600">${pkg}</td></tr>
            <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px">Pilgrims</td><td style="padding:10px 16px;font-size:14px">${pilgrims}</td></tr>
            <tr style="background:#f9fafb;border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px">Departure</td><td style="padding:10px 16px;font-size:14px;font-weight:600">${dep}</td></tr>
          </table>

          <!-- Payment Summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px">
            <tr style="background:#f9fafb"><td colspan="2" style="padding:12px 16px;font-weight:bold;color:#0B3D2E;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Payment Summary</td></tr>
            <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px;width:45%">Total Package Cost</td><td style="padding:10px 16px;font-family:monospace;font-weight:bold;color:#0B3D2E">₹${total}</td></tr>
            <tr style="background:#f9fafb;border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px">Amount Paid</td><td style="padding:10px 16px;font-family:monospace;font-weight:bold;color:#16a34a">₹${paid}</td></tr>
            <tr style="border-top:1px solid #e5e7eb"><td style="padding:10px 16px;color:#6b7280;font-size:13px">Balance Due</td><td style="padding:10px 16px;font-family:monospace;font-weight:bold;color:#dc2626">₹${balance}</td></tr>
          </table>

          <!-- CTA Button -->
          <div style="text-align:center;margin-bottom:28px">
            <a href="https://www.alburhantravels.online/dashboard" style="background:#0B3D2E;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              🕋 Login to Your Dashboard
            </a>
          </div>

          <!-- Next Steps -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px">
            <p style="color:#15803d;font-weight:bold;font-size:13px;margin:0 0 10px">📋 Next Steps — Please Complete:</p>
            <ul style="color:#374151;font-size:13px;margin:0;padding-left:20px;line-height:1.8">
              <li>Complete your travel profile</li>
              <li>Upload Passport, PAN &amp; Aadhaar</li>
              <li>Submit bank payment if balance is pending</li>
              <li>Track your visa status</li>
              <li>Download Invoice, Flight Ticket &amp; Hotel Voucher</li>
            </ul>
          </div>

          <!-- Contact -->
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;text-align:center">
            <p style="color:#6b7280;font-size:13px;margin:0 0 6px">Need Help? We're here for you.</p>
            <p style="color:#374151;font-size:13px;margin:0">📞 +91 9893225590 &nbsp;|&nbsp; 📧 info@alburhantravels.online</p>
            <p style="color:#374151;font-size:13px;margin:4px 0 0">🌐 <a href="https://www.alburhantravels.online" style="color:#0B3D2E">www.alburhantravels.online</a></p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#0B3D2E;padding:20px 40px;text-align:center">
          <p style="color:#a8d5b5;margin:0;font-size:12px">Al Burhan Tours &amp; Travels · Hajj &amp; Umrah Specialists</p>
          <p style="color:#6b9e7a;margin:4px 0 0;font-size:11px">May Allah accept your Hajj/Umrah. Ameen.</p>
        </td></tr>
        <!-- T&C -->
        <tr><td style="padding:16px 40px;text-align:center">
          <p style="color:#9ca3af;font-size:11px;margin:0">This is an automated confirmation. Booking is subject to availability and terms &amp; conditions of Al Burhan Tours &amp; Travels. For cancellations, contact us at least 30 days before departure.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const [waResult, smsResult, emailResult, rcsResult] = await Promise.all([
    // ── WhatsApp ──────────────────────────────────────────────────────────────
    sendWhatsApp(opts.mobile, waMsg),

    // ── SMS (DLT) — uses booking_confirmed template via sms.ts ───────────────
    smsSendBookingConfirmed({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, packageName: opts.packageName ?? undefined, bookingId: opts.bookingId ?? undefined, customerId: opts.customerId ?? undefined })
      .then((r): SendResult => ({ ok: r.ok, provider: r.provider, endpoint: "sms-dlt", responsePayload: r.responsePayload, errorMessage: r.errorMessage }))
      .catch((err: any): SendResult => ({ ok: false, provider: "Fast2SMS", endpoint: "sms-dlt", errorMessage: err?.message || "SMS error" })),

    // ── Email — use sendEmail() helper so from-address matches SMTP auth user ─
    opts.email
      ? sendEmail(opts.email, "Booking Confirmed | Al Burhan Tours & Travels", smsMsg, emailHtml)
          .catch((err: any): SendResult => ({ ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: err?.message || "Email failed" }))
      : Promise.resolve({ ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No email provided" } as SendResult),

    // ── RCS (Lemin AI / Jio) ──────────────────────────────────────────────────
    sendRCS(opts.mobile, opts.customerName, smsMsg, { active: true, url: "https://www.alburhantravels.online/dashboard", agent: "jio" }),
  ]);

  let dashboardResult: { ok: boolean; errorMessage?: string } = { ok: false, errorMessage: "No bookingId" };
  if (opts.bookingId) {
    try {
      const { randomUUID } = await import("crypto");
      await opts.pool.query(
        `INSERT INTO customer_timeline (customer_id, booking_id, event_type, title, description, icon)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          opts.customerId || null,
          opts.bookingId,
          "booking_confirmed",
          "Booking Confirmed ✅",
          `Congratulations! Your booking has been approved successfully.\n\nBooking ID: ${opts.bookingNumber}\n\nPlease complete your travel profile and upload required documents to continue your pilgrimage process.`,
          "🕋",
        ]
      );
      dashboardResult = { ok: true };
    } catch (err: any) {
      dashboardResult = { ok: false, errorMessage: err?.message || "Dashboard notification failed" };
    }
  }

  console.log("[Confirmation] WA:", waResult.ok, "SMS:", smsResult.ok, "Email:", emailResult.ok, "RCS:", rcsResult.ok, "Dashboard:", dashboardResult.ok);
  if (!waResult.ok)    console.error("[Confirmation] WhatsApp failed:", waResult.errorMessage);
  if (!smsResult.ok)   console.error("[Confirmation] SMS failed:", smsResult.errorMessage);
  if (!emailResult.ok) console.error("[Confirmation] Email failed:", emailResult.errorMessage);
  if (!rcsResult.ok)   console.error("[Confirmation] RCS failed:", rcsResult.errorMessage);

  return { whatsapp: waResult, sms: smsResult, email: emailResult, rcs: rcsResult, dashboard: dashboardResult };
}

// ── Offline Bank Transfer Notifications ───────────────────────────────────

export async function sendOfflinePaymentApprovedNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingId: string;
  bookingNumber?: string | null;
  amount: number | string;
  utrNumber: string;
}) {
  const ref = opts.bookingNumber || opts.bookingId;
  const amt = Number(opts.amount).toLocaleString("en-IN");
  const message =
`Dear ${opts.customerName},

Assalamu Alaikum! ✅

Your bank transfer has been *verified successfully*.

📋 *Booking ID:* ${ref}
💰 *Amount:* ₹${amt}
🔖 *UTR:* ${opts.utrNumber}

Your invoice and receipt have been generated. You will receive them shortly.

Jazakallah Khair for choosing Al Burhan Tours & Travels. 🕌
May Allah accept your Hajj/Umrah. Ameen.`;

  const adminMsg =
`[Al Burhan] Bank Transfer Approved
Booking: ${ref} | ₹${amt}
UTR: ${opts.utrNumber}
Customer: ${opts.customerName}`;

  await Promise.allSettled([
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Payment Verified Successfully – Al Burhan Tours & Travels", message) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}

export async function sendOfflinePaymentRejectedNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingId: string;
  bookingNumber?: string | null;
  reason: string;
}) {
  const ref = opts.bookingNumber || opts.bookingId;
  const message =
`Dear ${opts.customerName},

Assalamu Alaikum.

Your submitted bank payment could not be verified. ❌

📋 *Booking ID:* ${ref}
📝 *Reason:* ${opts.reason}

Please upload the correct payment proof or contact us for assistance.

Al Burhan Tours & Travels
📞 For help, contact our support team.`;

  await Promise.allSettled([
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Payment Verification Failed – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendOfflinePaymentSubmittedNotification(opts: {
  mobile: string;
  customerName: string;
  bookingId: string;
  bookingNumber?: string | null;
  amount: number | string;
  utrNumber: string;
}) {
  const ref = opts.bookingNumber || opts.bookingId;
  const amt = Number(opts.amount).toLocaleString("en-IN");
  const message =
`Dear ${opts.customerName},

Assalamu Alaikum! 🕌

We have received your *bank transfer details*.

📋 *Booking ID:* ${ref}
💰 *Amount:* ₹${amt}
🔖 *UTR:* ${opts.utrNumber}

⏳ Status: *Waiting for Verification*

Our team will verify your payment within 24 hours. You will be notified once verified.

Jazakallah Khair – Al Burhan Tours & Travels`;

  const adminMsg =
`[Al Burhan] New Bank Transfer Submitted 🏦
Booking: ${ref} | ₹${amt}
UTR: ${opts.utrNumber}
Customer: ${opts.customerName}
Action needed: Verify payment`;

  await Promise.allSettled([
    sendWhatsApp(opts.mobile, message),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}
