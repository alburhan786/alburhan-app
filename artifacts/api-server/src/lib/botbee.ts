import axios from "axios";
import { getCachedConfig } from "./apiSettingsProvider.js";
import { pool } from "@workspace/db";

const BOTBEE_BASE = "https://app.botbee.io/api/v1";

export interface BotBeeResult {
  ok: boolean;
  provider: string;
  endpoint: string;
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string;
  errorMessage?: string;
  messageId?: string;
}

function getCredentials() {
  const bbCfg = getCachedConfig("botbee");
  const apiToken = (bbCfg.apiKey || process.env.BOTBEE_API_KEY || "").trim();
  const phone_number_id = (bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "").trim();
  const enabled = bbCfg.enabled !== false;
  const rawUrl = bbCfg.apiUrl || BOTBEE_BASE;
  const baseUrl = rawUrl.replace(/\/whatsapp\/?$/, "");
  return { apiToken, phone_number_id, enabled, baseUrl };
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

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function logToDb(data: {
  eventType: string; channel: string; recipient: string;
  bookingId?: string; customerId?: string; message?: string;
  status: "sent" | "failed"; result: BotBeeResult;
}) {
  try {
    const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, channel, recipient, message, status,
        provider_response, provider_name, api_endpoint, http_status, request_payload, error_code,
        sent_at, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),0)`,
      [
        id, data.eventType, data.customerId || null, data.bookingId || null,
        data.channel, data.recipient, data.message || null, data.status,
        JSON.stringify(data.result),
        data.result.provider, data.result.endpoint, data.result.httpStatus || null,
        data.result.requestPayload ? JSON.stringify(data.result.requestPayload) : null,
        data.result.errorCode || null,
      ]
    );
  } catch (err) {
    console.error("[BotBee] logToDb failed:", err);
  }
}

// ── Core API methods ──────────────────────────────────────────────────────────

export async function sendText(
  to: string, message: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string; logMessage?: string }
): Promise<BotBeeResult> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/send`;
  if (!enabled) return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled in API Settings" };
  if (!apiToken || !phone_number_id) return { ok: false, provider: "BotBee", endpoint, errorMessage: "BotBee API key or Phone Number ID not configured" };

  let phone: string;
  try {
    phone = toBotBeePhone(to);
  } catch (err: any) {
    const result: BotBeeResult = { ok: false, provider: "BotBee", endpoint, errorMessage: err?.message || "Invalid mobile number" };
    if (opts?.eventType) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, message: opts.logMessage || message.substring(0, 300), status: "failed", result });
    }
    return result;
  }
  const reqPayload = { phone_number_id, phone_number: phone, message };
  const params = new URLSearchParams({ apiToken, phone_number_id, phone_number: phone, message });

  let result: BotBeeResult;
  try {
    const response = await withRetry(() =>
      axios.post(endpoint, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 12000,
      })
    );
    const data = response.data;
    if (data?.status === "0" || data?.status === 0) {
      console.warn("[BotBee] sendText failed for", to, ":", data.message);
      result = { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data, errorMessage: data.message || "BotBee: message delivery failed" };
    } else {
      console.log("[BotBee] sendText sent to", to, data);
      result = { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data };
    }
  } catch (err: any) {
    const resp = err?.response;
    console.error("[BotBee] sendText error after retries for", to, ":", resp?.data || err.message);
    result = {
      ok: false, provider: "BotBee", endpoint,
      httpStatus: resp?.status, requestPayload: reqPayload, responsePayload: resp?.data,
      errorCode: String(resp?.data?.code || resp?.data?.error_code || ""),
      errorMessage: resp?.data?.message || resp?.data?.error || err.message,
    };
  }

  if (opts?.eventType) {
    await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: opts.logMessage || message.substring(0, 300), status: result.ok ? "sent" : "failed", result });
  }
  return result;
}

export async function sendTemplate(
  to: string, templateName: string, components: object[],
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/send/template`;
  if (!enabled) return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled in API Settings" };
  if (!apiToken || !phone_number_id) return { ok: false, provider: "BotBee", endpoint, errorMessage: "BotBee credentials not configured" };

  let phone: string;
  try {
    phone = toBotBeePhone(to);
  } catch (err: any) {
    const result: BotBeeResult = { ok: false, provider: "BotBee", endpoint, errorMessage: err?.message || "Invalid mobile number" };
    if (opts?.eventType) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, message: `Template: ${templateName}`, status: "failed", result });
    }
    return result;
  }
  const BOTBEE_BUSINESS_ID = (process.env.BOTBEE_BUSINESS_ID || "").trim();
  const payload: Record<string, unknown> = { apiToken, phone_number_id, phone_number: phone, template: { name: templateName, language: { code: "en" }, components } };
  if (BOTBEE_BUSINESS_ID) payload.business_account_id = BOTBEE_BUSINESS_ID;
  const reqPayload = { ...payload, apiToken: "***" };

  let result: BotBeeResult;
  try {
    const response = await withRetry(() =>
      axios.post(endpoint, payload, { headers: { "Content-Type": "application/json" }, timeout: 12000 })
    );
    const data = response.data;
    const failed = data?.status === "0" || data?.status === 0 || !!data?.error;
    result = failed
      ? { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data, errorMessage: data.message || data.error || "Template send failed" }
      : { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data };
    console.log(result.ok ? "[BotBee] sendTemplate sent" : "[BotBee] sendTemplate failed", templateName, "to", to);
  } catch (err: any) {
    const resp = err?.response;
    result = { ok: false, provider: "BotBee", endpoint, httpStatus: resp?.status, requestPayload: reqPayload, responsePayload: resp?.data, errorMessage: resp?.data?.message || err.message };
    console.error("[BotBee] sendTemplate error:", err.message);
  }

  if (opts?.eventType) {
    await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: `Template: ${templateName}`, status: result.ok ? "sent" : "failed", result });
  }
  return result;
}

export async function sendInteractiveButtons(
  to: string, body: string, buttons: Array<{ id: string; title: string }>,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/send/interactive-buttons`;
  if (!enabled) return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled" };
  if (!apiToken || !phone_number_id) return { ok: false, provider: "BotBee", endpoint, errorMessage: "BotBee credentials not configured" };

  let phone: string;
  try {
    phone = toBotBeePhone(to);
  } catch (err: any) {
    const result: BotBeeResult = { ok: false, provider: "BotBee", endpoint, errorMessage: err?.message || "Invalid mobile number" };
    if (opts?.eventType) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, message: body, status: "failed", result });
    }
    return result;
  }
  const payload = {
    apiToken, phone_number_id, phone_number: phone,
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  };
  const reqPayload = { ...payload, apiToken: "***" };

  let result: BotBeeResult;
  try {
    const response = await withRetry(() =>
      axios.post(endpoint, payload, { headers: { "Content-Type": "application/json" }, timeout: 12000 })
    );
    const data = response.data;
    result = data?.error
      ? { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data, errorMessage: data.error }
      : { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data };
    console.log(result.ok ? "[BotBee] sendButtons sent to" : "[BotBee] sendButtons failed for", to);
  } catch (err: any) {
    const resp = err?.response;
    result = { ok: false, provider: "BotBee", endpoint, httpStatus: resp?.status, requestPayload: reqPayload, responsePayload: resp?.data, errorMessage: resp?.data?.message || err.message };
    console.error("[BotBee] sendButtons error:", err.message);
  }

  if (opts?.eventType) {
    await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: body, status: result.ok ? "sent" : "failed", result });
  }
  return result;
}

export async function sendFile(
  to: string, mediaId: string, caption?: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/send/file`;
  if (!enabled) return { ok: false, provider: "BotBee", endpoint, errorMessage: "WhatsApp disabled" };
  if (!apiToken || !phone_number_id) return { ok: false, provider: "BotBee", endpoint, errorMessage: "BotBee credentials not configured" };

  let phone: string;
  try {
    phone = toBotBeePhone(to);
  } catch (err: any) {
    const result: BotBeeResult = { ok: false, provider: "BotBee", endpoint, errorMessage: err?.message || "Invalid mobile number" };
    if (opts?.eventType) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, message: `File: ${mediaId}${caption ? ` — ${caption}` : ""}`, status: "failed", result });
    }
    return result;
  }
  const payload = { apiToken, phone_number_id, phone_number: phone, media_id: mediaId, caption: caption || "" };
  const reqPayload = { ...payload, apiToken: "***" };

  let result: BotBeeResult;
  try {
    const response = await withRetry(() =>
      axios.post(endpoint, payload, { headers: { "Content-Type": "application/json" }, timeout: 12000 })
    );
    const data = response.data;
    result = data?.error
      ? { ok: false, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data, errorMessage: data.error }
      : { ok: true, provider: "BotBee", endpoint, httpStatus: response.status, requestPayload: reqPayload, responsePayload: data };
    console.log(result.ok ? "[BotBee] sendFile sent to" : "[BotBee] sendFile failed for", to);
  } catch (err: any) {
    const resp = err?.response;
    result = { ok: false, provider: "BotBee", endpoint, httpStatus: resp?.status, requestPayload: reqPayload, responsePayload: resp?.data, errorMessage: resp?.data?.message || err.message };
    console.error("[BotBee] sendFile error:", err.message);
  }

  if (opts?.eventType) {
    await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: `File: ${mediaId}${caption ? ` — ${caption}` : ""}`, status: result.ok ? "sent" : "failed", result });
  }
  return result;
}

// ── High-level booking methods ────────────────────────────────────────────────

export async function sendInvoice(to: string, ctx: {
  customerName: string; bookingNumber: string; invoiceNumber?: string;
  amount?: number; invoiceUrl?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  const url = ctx.invoiceUrl || `https://alburhantravels.com/invoice/${ctx.bookingNumber}`;
  const message = `Assalamu Alaikum ${ctx.customerName},\n\n📄 Your invoice${ctx.invoiceNumber ? ` #${ctx.invoiceNumber}` : ""} for booking #${ctx.bookingNumber} is ready.\n\n📎 View/Download:\n${url}${ctx.amount ? `\n\n💰 Total: ₹${ctx.amount.toLocaleString("en-IN")}` : ""}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
  const result = await sendText(to, message, { eventType: "invoice_generated", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendTicket(to: string, ctx: {
  customerName: string; bookingNumber: string; flightNumber?: string;
  airline?: string; departureDate?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  const message = `Assalamu Alaikum ${ctx.customerName},\n\n✈️ Your flight ticket for booking #${ctx.bookingNumber} has been issued!\n\nAirline: ${ctx.airline || "TBA"}\nFlight No: ${ctx.flightNumber || "TBA"}\nDeparture: ${ctx.departureDate || "TBA"}\n\nPlease check-in 3 hours before departure.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
  const result = await sendText(to, message, { eventType: "ticket_issued", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendVisa(to: string, ctx: {
  customerName: string; bookingNumber: string; visaNumber?: string;
  packageName?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  const message = `Assalamu Alaikum ${ctx.customerName},\n\nAlhamdulillah! 🕌 Your Visa for booking #${ctx.bookingNumber} (${ctx.packageName || "Hajj/Umrah"}) has been APPROVED${ctx.visaNumber ? `.\nVisa No: ${ctx.visaNumber}` : ""}.\n\nPlease visit our office to collect your documents.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
  const result = await sendText(to, message, { eventType: "visa_ready", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendVoucher(to: string, ctx: {
  customerName: string; bookingNumber: string; hotelName?: string;
  checkIn?: string; checkOut?: string; voucherUrl?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  const message = `Assalamu Alaikum ${ctx.customerName},\n\n🏨 Hotel Voucher for booking #${ctx.bookingNumber}\n\nHotel: ${ctx.hotelName || "TBA"}\nCheck-in: ${ctx.checkIn || "TBA"}\nCheck-out: ${ctx.checkOut || "TBA"}${ctx.voucherUrl ? `\n\n📎 Voucher: ${ctx.voucherUrl}` : ""}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
  const result = await sendText(to, message, { eventType: "hotel_assigned", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendImage(
  to: string, imageUrl: string, caption?: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const message = caption ? `${caption}\n\n${imageUrl}` : imageUrl;
  return sendText(to, message, { eventType: opts?.eventType || "new_booking", bookingId: opts?.bookingId, customerId: opts?.customerId });
}

export async function sendPDF(
  to: string, pdfUrl: string, caption?: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const message = `${caption || "Document ready"}:\n📎 ${pdfUrl}`;
  return sendText(to, message, { eventType: opts?.eventType || "invoice_generated", bookingId: opts?.bookingId, customerId: opts?.customerId });
}

export async function sendButtons(
  to: string, body: string, buttons: Array<{ id: string; title: string }>,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  return sendInteractiveButtons(to, body, buttons, opts);
}

export async function uploadMedia(
  fileBuffer: Buffer, mimeType: string, fileName: string
): Promise<{ ok: boolean; mediaId?: string; errorMessage?: string; responsePayload?: unknown }> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/upload/media`;
  if (!enabled) return { ok: false, errorMessage: "WhatsApp disabled in API Settings" };
  if (!apiToken || !phone_number_id) return { ok: false, errorMessage: "BotBee credentials not configured" };

  try {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("apiToken", apiToken);
    form.append("phone_number_id", phone_number_id);
    form.append("file", fileBuffer, { filename: fileName, contentType: mimeType });

    const response = await withRetry(() =>
      axios.post(endpoint, form, { headers: form.getHeaders(), timeout: 30000 })
    );
    const data = response.data;
    const mediaId = data?.media_id || data?.id || data?.data?.id;
    if (!mediaId) {
      return { ok: false, errorMessage: data?.message || "No media ID in response", responsePayload: data };
    }
    console.log("[BotBee] uploadMedia success, mediaId:", mediaId);
    return { ok: true, mediaId, responsePayload: data };
  } catch (err: any) {
    const resp = err?.response;
    console.error("[BotBee] uploadMedia error:", resp?.data || err.message);
    return { ok: false, errorMessage: resp?.data?.message || err.message, responsePayload: resp?.data };
  }
}

// ── PDF document sending ──────────────────────────────────────────────────────

/**
 * Upload a PDF buffer to BotBee media storage, then send it as a WhatsApp
 * document to the given number. Logs every attempt (success or failure) in
 * notification_logs. Returns the BotBeeResult of the sendFile call, or an
 * upload-failure result if the media upload step fails.
 */
export async function sendPDFDocument(
  to: string,
  pdfBuffer: Buffer,
  filename: string,
  caption?: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string }
): Promise<BotBeeResult> {
  const { enabled, baseUrl } = getCredentials();
  const uploadEndpoint = `${baseUrl}/whatsapp/upload/media`;
  if (!enabled) {
    const res: BotBeeResult = { ok: false, provider: "BotBee", endpoint: uploadEndpoint, errorMessage: "WhatsApp disabled" };
    if (opts?.eventType) await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: `PDF: ${filename}`, status: "failed", result: res });
    return res;
  }

  // Step 1: upload the PDF buffer as WhatsApp media
  const up = await uploadMedia(pdfBuffer, "application/pdf", filename);
  if (!up.ok || !up.mediaId) {
    console.warn("[BotBee] sendPDFDocument upload failed:", up.errorMessage);
    const res: BotBeeResult = { ok: false, provider: "BotBee", endpoint: uploadEndpoint, errorMessage: up.errorMessage || "PDF upload failed", responsePayload: up.responsePayload };
    if (opts?.eventType) await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, message: `PDF upload failed: ${filename}`, status: "failed", result: res });
    return res;
  }

  // Step 2: send the media file as a document
  return sendFile(to, up.mediaId, caption || filename, opts);
}

// ── Template management ───────────────────────────────────────────────────────

export interface WaTemplate {
  name: string;
  status: string;
  category: string;
  language: string;
  id?: string;
  components: Array<{
    type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
    format?: string;
    text?: string;
    example?: Record<string, unknown>;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

export async function fetchTemplates(): Promise<{ ok: boolean; templates?: WaTemplate[]; errorMessage?: string; responsePayload?: unknown }> {
  const { apiToken, phone_number_id, enabled, baseUrl } = getCredentials();
  const bbCfg = getCachedConfig("botbee");
  const business_id = bbCfg.extra?.business_id || process.env.BOTBEE_BUSINESS_ID || "";

  if (!enabled) return { ok: false, errorMessage: "WhatsApp disabled in API Settings" };
  if (!apiToken || !phone_number_id) return { ok: false, errorMessage: "BotBee credentials not configured" };

  const endpoint = `${baseUrl}/whatsapp/templates`;
  try {
    const params = new URLSearchParams({ apiToken, phone_number_id });
    if (business_id) params.set("business_id", business_id);
    const response = await axios.get(`${endpoint}?${params}`, { timeout: 15000 });
    const data = response.data;

    // BotBee may wrap in data/templates/result
    const raw: WaTemplate[] = data?.templates || data?.data?.templates || data?.data || data?.result || (Array.isArray(data) ? data : []);
    if (!Array.isArray(raw)) return { ok: false, errorMessage: "Unexpected response format", responsePayload: data };

    const templates = raw.map((t: any) => ({
      name: t.name,
      status: (t.status || "UNKNOWN").toUpperCase(),
      category: t.category || "UTILITY",
      language: t.language || (t.language_code) || "en",
      id: t.id || t.template_id,
      components: Array.isArray(t.components) ? t.components : [],
    }));

    return { ok: true, templates };
  } catch (err: any) {
    const resp = err?.response;
    console.error("[BotBee] fetchTemplates error:", resp?.data || err.message);
    return { ok: false, errorMessage: resp?.data?.message || err.message, responsePayload: resp?.data };
  }
}

// ── Fallback + send-with-fallback ─────────────────────────────────────────────

async function smsFallback(to: string, bookingId?: string, customerId?: string) {
  try {
    const { sendDLTSMS } = await import("./notifications.js");
    await sendDLTSMS(to, to, bookingId || "", "notification");
    console.log("[BotBee] SMS fallback sent to", to);
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, channel, recipient, message, status, provider_response, provider_name, sent_at, retry_count)
       VALUES ($1,'whatsapp_fallback_sms',$2,$3,'sms',$4,'Fallback SMS sent','sent',$5,'Fast2SMS',NOW(),0)`,
      [`nl_fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, customerId || null, bookingId || null, to, JSON.stringify({ ok: true, provider: "Fast2SMS", fallback: true })]
    );
  } catch (err) {
    console.error("[BotBee] SMS fallback failed:", err);
  }
}

async function emailFallback(to: string, subject: string, message: string) {
  try {
    const { sendEmail } = await import("./notifications.js");
    const result = await sendEmail(to, subject, message);
    if (result.ok) console.log("[BotBee] Email fallback sent to", to);
    else console.warn("[BotBee] Email fallback also failed for", to, ":", result.errorMessage);
  } catch (err) {
    console.error("[BotBee] Email fallback error:", err);
  }
}

export async function sendWithFallback(
  to: string, message: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string; email?: string; emailSubject?: string }
): Promise<BotBeeResult> {
  const result = await sendText(to, message, opts);
  if (!result.ok) {
    console.warn("[BotBee] WhatsApp failed → triggering SMS+Email fallback for", to);
    await smsFallback(to, opts?.bookingId, opts?.customerId);
    if (opts?.email) {
      await emailFallback(opts.email, opts.emailSubject || "Al Burhan Tours — Important Update", message);
    }
  }
  return result;
}
