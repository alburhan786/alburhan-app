import axios from "axios";
import nodemailer from "nodemailer";
import { getCachedConfig } from "./apiSettingsProvider.js";
import {
  sendBookingCreated as smsSendBookingCreated,
  sendBookingConfirmed as smsSendBookingConfirmed,
  sendPaymentReceived as smsSendPaymentReceived,
  sendPendingPaymentReminder as smsSendPendingPayment,
  sendInvoiceCreated as smsSendInvoiceCreated,
  sendFlightTicketIssued as smsSendTicket,
  sendVisaIssued as smsSendVisa,
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
  if (dbCfg.apiKey) return dbCfg.apiKey;
  const k = process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY;
  if (!k || k === "your_key_here" || k === "your-fast2sms-key-here") return undefined;
  return k;
}

function getFast2SMSExtra() {
  const dbCfg = getCachedConfig("fast2sms");
  return {
    sender_id: dbCfg.extra.sender_id || "ALBURH",
    otp_template_id: dbCfg.extra.otp_template_id || "164844",
    notify_template_id: dbCfg.extra.notify_template_id || "211277",
  };
}

const BOTBEE_BASE_URL = "https://app.botbee.io/api/v1/whatsapp";

function toFast2SMSPhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  // Strip country code: +919876543210 or 919876543210 (12 digits)
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  // Strip leading zero: 09876543210 (11 digits)
  if (clean.startsWith("0") && clean.length === 11) return clean.slice(1);
  return clean;
}

function toBotBeePhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) return `91${clean}`;
  if (clean.startsWith("+")) return clean.slice(1);
  return clean;
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
  return { code, message: msgs.join("; ") || JSON.stringify(data) };
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

  if (!apiKey) {
    const envKeys = Object.keys(process.env).filter(k => k.includes("FAST2SMS")).join(", ");
    const msg = `FAST2SMS_API_KEY not set. Env keys found: [${envKeys || "none"}]`;
    console.error(`[OTP-SMS] ❌ ${msg}`);
    const logEntry: SmsAttemptLog = {
      id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp,
      finalSuccess: false, attempts: [], totalDurationMs: 0,
      apiKeyPresent: false, apiKeyMasked: "NOT_FOUND",
    };
    pushSmsLog(logEntry);
    return { sent: false, error: msg, logId: id };
  }

  const phone = toFast2SMSPhone(mobile);
  const attempts: SmsRouteAttempt[] = [];
  const errors: string[] = [];

  // NOTE: Fast2SMS route=otp requires website verification (status_code 996).
  // That step has not been completed on this account, so we skip it entirely
  // and go straight to DLT (registered template) → Quick fallback.

  const f2sExtra = getFast2SMSExtra();
  // ── Route 1: DLT route (registered Sender ID + Template) ─────────────────
  {
    const t0 = Date.now();
    const variables = encodeURIComponent(`${otp}|`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${f2sExtra.sender_id}&message=${f2sExtra.otp_template_id}&variables_values=${variables}&numbers=${phone}&flash=0`;
    const maskedUrl = url.replace(apiKey, apiKeyMasked);
    console.log(`[OTP-SMS][dlt] → ${maskedUrl}`);
    try {
      const r = await axios.get(url, { timeout: 12000 });
      const durationMs = Date.now() - t0;
      const { code, message } = extractF2sError(r.data);
      const success = r.data?.return === true;
      console.log(`[OTP-SMS][dlt] ← HTTP ${r.status} | return=${r.data?.return} | ${message} (${durationMs}ms)`);
      attempts.push({ route: "dlt", requestUrl: maskedUrl, httpStatus: r.status, responseBody: r.data, success, errorCode: code, errorMessage: success ? undefined : message, durationMs });
      if (success) {
        const log: SmsAttemptLog = { id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp, finalSuccess: true, finalRoute: "dlt", attempts, totalDurationMs: Date.now() - overallStart, apiKeyPresent, apiKeyMasked };
        pushSmsLog(log);
        return { sent: true, providerResponse: r.data, route: "dlt", urlUsed: maskedUrl, logId: id };
      }
      errors.push(`dlt: ${message}`);
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      const errBody = err?.response?.data;
      const errMsg = errBody ? extractF2sError(errBody).message : (err?.message || String(err));
      console.error(`[OTP-SMS][dlt] ✗ ${errMsg} (${durationMs}ms)`);
      attempts.push({ route: "dlt", requestUrl: maskedUrl, httpStatus: err?.response?.status, responseBody: errBody, success: false, errorMessage: errMsg, durationMs });
      errors.push(`dlt: ${errMsg}`);
    }
  }

  // ── Route 3: Quick route fallback ─────────────────────────────────────────
  {
    const t0 = Date.now();
    const msg = encodeURIComponent(`Your Al Burhan Tours OTP is ${otp}. Valid 5 mins. Do not share.`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${msg}&numbers=${phone}&flash=0`;
    const maskedUrl = url.replace(apiKey, apiKeyMasked);
    console.log(`[OTP-SMS][quick] → ${maskedUrl}`);
    try {
      const r = await axios.get(url, { timeout: 12000 });
      const durationMs = Date.now() - t0;
      const { code, message } = extractF2sError(r.data);
      const success = r.data?.return === true;
      console.log(`[OTP-SMS][quick] ← HTTP ${r.status} | return=${r.data?.return} | ${message} (${durationMs}ms)`);
      attempts.push({ route: "quick", requestUrl: maskedUrl, httpStatus: r.status, responseBody: r.data, success, errorCode: code, errorMessage: success ? undefined : message, durationMs });
      const log: SmsAttemptLog = { id, ts: new Date().toISOString(), mobileMasked: maskMobile(mobile), otp, finalSuccess: success, finalRoute: success ? "quick" : undefined, attempts, totalDurationMs: Date.now() - overallStart, apiKeyPresent, apiKeyMasked };
      pushSmsLog(log);
      if (success) return { sent: true, providerResponse: r.data, route: "quick", urlUsed: maskedUrl, logId: id };
      errors.push(`quick: ${message}`);
      return { sent: false, route: "all_failed", providerResponse: r.data, error: errors.join(" | "), logId: id };
    } catch (err: any) {
      const durationMs = Date.now() - t0;
      const errBody = err?.response?.data;
      const errMsg = errBody ? extractF2sError(errBody).message : (err?.message || String(err));
      console.error(`[OTP-SMS][quick] ✗ ${errMsg} (${durationMs}ms)`);
      attempts.push({ route: "quick", requestUrl: maskedUrl, httpStatus: err?.response?.status, responseBody: errBody, success: false, errorMessage: errMsg, durationMs });
      errors.push(`quick: ${errMsg}`);
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

  // Quick route
  try {
    const t0 = Date.now();
    const msg = encodeURIComponent(`Test OTP: ${otp}. Al Burhan Tours.`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${msg}&numbers=${cleanPhone}&flash=0`;
    const r = await axios.get(url, { timeout: 12000 });
    diag.quick = { status: r.status, body: r.data, durationMs: Date.now() - t0 };
  } catch (e: any) {
    diag.quick = { error: e?.response?.data || e?.message };
  }

  return diag;
}

export async function sendDLTSMS(
  mobile: string,
  var1: string,
  var2: string,
  var3: string
): Promise<boolean> {
  const apiKey = getFast2SMSKey();
  if (!apiKey) {
    console.log("[SMS-DLT] API key not set — vars:", var1, var2, var3, "for:", mobile);
    return false;
  }
  try {
    const phone = toFast2SMSPhone(mobile);
    const f2sExtra = getFast2SMSExtra();
    const variables = encodeURIComponent(`${var1}|${var2}|${var3}|`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=dlt&sender_id=${f2sExtra.sender_id}&message=${f2sExtra.notify_template_id}&variables_values=${variables}&numbers=${phone}&flash=0`;
    const response = await withRetry(() => axios.get(url));
    console.log("[SMS-DLT] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    const errData = err?.response?.data || err.message;
    console.error("[SMS-DLT] Error after retries for", mobile, ":", JSON.stringify(errData));
    return false;
  }
}

export async function sendWhatsApp(mobile: string, message: string): Promise<SendResult> {
  const bbCfg = getCachedConfig("botbee");
  const bbBaseUrl = bbCfg.apiUrl || BOTBEE_BASE_URL;
  const endpoint = `${bbBaseUrl}/send`;
  if (bbCfg.enabled === false) {
    return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled in API Settings" };
  }
  const BOTBEE_API_KEY = bbCfg.apiKey || process.env.BOTBEE_API_KEY;
  const BOTBEE_PHONE_NUMBER_ID = bbCfg.extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID;
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
      console.warn("[WhatsApp] Session msg failed for", mobile, ":", result.message);
      return { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: safePayload, responsePayload: result, errorMessage: result.message || "Message delivery failed" };
    }
    console.log("[WhatsApp] Session msg sent to", mobile, result);
    return { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: safePayload, responsePayload: result };
  } catch (err: any) {
    const resp = err?.response;
    console.error("[WhatsApp] Error after retries for", mobile, ":", resp?.data || err.message);
    return {
      ok: false, provider: "BotBee", endpoint,
      httpStatus: resp?.status,
      requestPayload: { phone_number: mobile, message: message.substring(0, 200) },
      responsePayload: resp?.data,
      errorCode: String(resp?.data?.code || resp?.data?.error_code || ""),
      errorMessage: resp?.data?.message || resp?.data?.error || err.message,
    };
  }
}

export interface RcsRichData {
  url?: string;
  agent?: "jio" | "vi" | string;
  active?: boolean;
}

export async function sendRCS(
  mobile: string,
  customerName: string,
  messageText: string,
  richData?: RcsRichData
): Promise<SendResult> {
  const leminCfg = getCachedConfig("lemin");
  const endpoint = leminCfg.apiUrl || process.env.LEMIN_API_URL || "https://rcs.leminai.com/api/send";
  if (leminCfg.enabled === false) {
    return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "RCS disabled in API Settings" };
  }
  const LEMIN_API_KEY = leminCfg.apiKey || process.env.LEMIN_API_KEY;
  const lemin_user_id = leminCfg.extra.user_id || process.env.LEMIN_USER_ID || "0x89mqd53ph";
  const lemin_template_id = leminCfg.extra.template_id || process.env.LEMIN_TEMPLATE_ID || "1473";
  if (!LEMIN_API_KEY) {
    return { ok: false, provider: "Lemin AI", endpoint, errorMessage: "LEMIN_API_KEY not configured" };
  }
  try {
    const clean = mobile.replace(/\D/g, "");
    const phone = clean.startsWith("91") ? clean.slice(2) : clean;
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
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LEMIN_API_KEY}` },
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
    console.error("[RCS] Error after retries for", mobile, ":", resp?.data || err.message);
    return {
      ok: false, provider: "Lemin AI", endpoint,
      httpStatus: resp?.status,
      requestPayload: { phone: mobile, dial_code: "+91", template: lemin_template_id },
      responsePayload: resp?.data,
      errorCode: String(resp?.data?.code || resp?.data?.error_code || ""),
      errorMessage: resp?.data?.message || resp?.data?.error || err.message,
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
  const BOTBEE_PHONE_NUMBER_ID = bbCfg2.extra.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID;
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
  });
}

export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  if (!to) return { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No recipient email" };
  const transport = getEmailTransport();
  if (!transport) {
    return { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "SMTP not configured — check API Settings" };
  }
  const smtpCfg = getCachedConfig("smtp");
  const smtpHost = smtpCfg.apiUrl || process.env.SMTP_HOST || "smtp.gmail.com";
  const endpoint = `smtp://${smtpHost}`;
  const from = smtpCfg.extra.from_email || smtpCfg.extra.user || process.env.SMTP_USER || "info@alburhantravels.com";
  try {
    await withRetry(() =>
      transport!.sendMail({
        from: `Al Burhan Tours & Travels <${from}>`,
        to, subject,
        text: body,
        html: body.replace(/\n/g, "<br>"),
      })
    );
    console.log("[Email] Sent to:", to, "Subject:", subject);
    return { ok: true, provider: "SMTP", endpoint, requestPayload: { from, to, subject }, responsePayload: { delivered: true } };
  } catch (err: any) {
    console.error("[Email] Error after retries to", to, ":", err?.message);
    return {
      ok: false, provider: "SMTP", endpoint,
      requestPayload: { to, subject },
      errorCode: err?.code || "",
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
}) {
  const customerMsg = `Assalamu Alaikum ${opts.customerName},\n\nYour booking #${opts.bookingNumber} for "${opts.packageName}" (${opts.numberOfPilgrims} pilgrim${opts.numberOfPilgrims > 1 ? "s" : ""}) has been submitted.\n\nOur team will review shortly and notify you once approved.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;
  const adminMsg = `New Booking Alert!\n\nBooking #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nPackage: ${opts.packageName}\nPilgrims: ${opts.numberOfPilgrims}\n\nReview from admin dashboard.`;

  await Promise.allSettled([
    smsSendBookingCreated({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, packageName: opts.packageName }),
    sendWhatsApp(opts.mobile, customerMsg),
    opts.email ? sendEmail(opts.email, "Booking Submitted – Al Burhan Tours & Travels", customerMsg) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
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
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "REJECTED"),  // no dedicated event type; use generic
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Update – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

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
  const adminMsg = `Payment Received!\n\nBooking: #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nAmount: Rs.${opts.amount}\nInvoice: ${opts.invoiceNumber}`;

  await Promise.allSettled([
    smsSendPaymentReceived({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, amount: opts.amount }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Confirmed – Al Burhan Tours & Travels", message) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}

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
    smsSendPendingPayment({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber, balance: opts.remainingAmount }),
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
  "admin@alburhantravels.com",
  "altaf@alburhantravels.com",
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
  const from = process.env.SMTP_USER || "info@alburhantravels.com";
  const subject = opts.isOffline
    ? `[Al Burhan] New Offline Booking — ${opts.customerName}`
    : `[Al Burhan] New Booking Request — ${opts.customerName}`;
  const dashLink = `https://alburhantravels.in/admin/bookings`;
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
  <p style="color:#aaa;font-size:11px;text-align:center;margin-top:16px">Al Burhan Tours &amp; Travels · admin@alburhantravels.com</p>
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
    ticket: () => smsSendTicket({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    visa:   () => smsSendVisa({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
  };
  const smsKey = Object.keys(docSmsMap).find(k => opts.documentType.toLowerCase().includes(k));
  await Promise.allSettled([
    smsKey ? docSmsMap[smsKey]() : smsSendInvoiceCreated({ mobile: opts.mobile, customerName: opts.customerName, bookingNumber: opts.bookingNumber }),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, `Your ${docLabel} is Ready – Al Burhan Tours & Travels`, message) : Promise.resolve(),
  ]);
}
