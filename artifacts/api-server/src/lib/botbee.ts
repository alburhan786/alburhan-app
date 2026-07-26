import axios from "axios";
import { getCachedConfig } from "./apiSettingsProvider.js";
import { pool } from "@workspace/db";

const BOTBEE_BASE = "https://app.botbee.io/api/v1";

/** Shared options for all BotBee template send functions */
export interface BotBeeTemplateOpts {
  eventType?: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  language?: string;
  /** When true, a template send failure is NOT written to notification_logs.
   *  Use this when the caller will fall back to a plain-text message so that
   *  only the final outcome (text ok/fail) appears in the logs. */
  skipFailureLog?: boolean;
  /**
   * When true, suppress ALL internal logToDb calls from sendTemplate.
   * Use this when the caller (e.g. notificationEngine trackNotification) will
   * write the log entry itself so we don't create duplicate notification_logs rows.
   */
  noInternalLog?: boolean;
  /**
   * When true, skip the PRIMARY PATH (WhatsApp text/session API) entirely and go
   * straight to the BotBee template API (/whatsapp/send/template).
   *
   * WHY: The text/session API only works within a 24h window after the customer
   * messages the business. For ERP-initiated outbound notifications the window is
   * almost never open, so the text API silently succeeds on BotBee but Meta drops
   * the message. The template API bypasses the session restriction and returns a
   * real wamid confirming Meta accepted the delivery.
   *
   * Set this for ALL ABT template sends from the notification engine.
   */
  forceTemplateApi?: boolean;
  /**
   * Named variable values keyed by the EXACT BotBee variable name from the
   * template's variable_map (e.g. {Name:"...", BookingID:"...", Amount:"..."}).
   * BotBee maps these keys to {{1}},{{2}},... positions internally and substitutes
   * them before sending to Meta.  Keys come from the #!VarName!# placeholders
   * in the template, stripped of #! and !#.
   *
   * Do NOT use a flat array — BotBee accepts arrays but does NOT substitute them.
   * Do NOT use Meta-style components — accepted but also NOT substituted by BotBee.
   */
  variables?: Record<string, string>;
}

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

/**
 * Returns true when BotBee's /whatsapp/send failed because the Meta 24-hour
 * session window has expired — i.e. the customer has not replied to the business
 * number within the last 24 hours.
 *
 * When this is detected, callers must retry with an approved WhatsApp template
 * via /whatsapp/send/template (which bypasses the session restriction) instead
 * of sending plain text.
 *
 * Known BotBee / Meta error signatures for the 24h window:
 *   - status 0, message contains "24 hour", "session", "window", "expired"
 *   - Meta error code 131026 (message outside 24h session window)
 *   - Meta error code 131047 (message expired / re-engagement required)
 */
export function is24hWindowError(result: BotBeeResult): boolean {
  if (result.ok) return false;
  const raw = [
    result.errorMessage || "",
    JSON.stringify(result.responsePayload ?? ""),
  ].join(" ").toLowerCase();
  return (
    raw.includes("24 hour") ||
    raw.includes("24h") ||
    raw.includes("session expired") ||
    (raw.includes("session") && raw.includes("expired")) ||
    raw.includes("outside window") ||
    raw.includes("window expired") ||
    raw.includes("not in session") ||
    raw.includes("131026") ||   // Meta: outside 24h session window
    raw.includes("131047")      // Meta: message expired / re-engagement required
  );
}

// Known-correct Meta Phone Number ID from BotBee dashboard.
// Overrides the env/DB value to guard against typos in the secret.
const CORRECT_PHONE_NUMBER_ID = "965912196611113";

export function getCredentials() {
  const bbCfg = getCachedConfig("botbee");
  const apiToken = (bbCfg.apiKey || process.env.BOTBEE_API_KEY || "").trim();
  const rawPhoneId = (bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "").trim();
  // Always use the correct 15-digit Meta Phone Number ID regardless of env typos
  const phone_number_id = CORRECT_PHONE_NUMBER_ID;
  if (rawPhoneId && rawPhoneId !== CORRECT_PHONE_NUMBER_ID) {
    console.warn(`[BotBee] phone_number_id override: env/DB has "${rawPhoneId}", using correct value "${CORRECT_PHONE_NUMBER_ID}"`);
  }
  const business_id = (bbCfg.extra?.business_id || process.env.BOTBEE_BUSINESS_ID || "").trim();
  const enabled = bbCfg.enabled !== false;
  const rawUrl = bbCfg.apiUrl || BOTBEE_BASE;
  const baseUrl = rawUrl.replace(/\/whatsapp\/?$/, "");
  return { apiToken, phone_number_id, business_id, enabled, baseUrl };
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
  bookingId?: string; customerId?: string; customerName?: string;
  templateId?: string; message?: string;
  status: "sent" | "failed"; result: BotBeeResult;
}) {
  try {
    const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rp = data.result.responsePayload as Record<string, unknown> | null | undefined;
    const msgArr = Array.isArray(rp?.messages) ? (rp!.messages as Array<Record<string, unknown>>) : null;
    // BotBee template API returns wa_message_id; text API may return msg_id; Meta direct returns messages[0].id
    const wamid = (rp?.wa_message_id || rp?.msg_id || rp?.message_id || rp?.wamid || msgArr?.[0]?.id || null) as string | null;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, customer_name, channel, recipient, message, status,
        template, provider_response, provider_name, api_endpoint, http_status, request_payload, error_code,
        wamid, sent_at, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),0)`,
      [
        id, data.eventType, data.customerId || null, data.bookingId || null,
        data.customerName || null,
        data.channel, data.recipient, data.message || null, data.status,
        data.templateId || null,
        JSON.stringify(data.result),
        data.result.provider, data.result.endpoint, data.result.httpStatus || null,
        data.result.requestPayload ? JSON.stringify(data.result.requestPayload) : null,
        data.result.errorCode || null,
        wamid,
      ]
    );
    if (wamid) console.log(`[BotBee] logToDb: wamid=${wamid} event=${data.eventType} recipient=${data.recipient}`);
  } catch (err) {
    console.error("[BotBee] logToDb failed:", err);
  }
}

// ── Core API methods ──────────────────────────────────────────────────────────

export async function sendText(
  to: string, message: string,
  opts?: { eventType?: string; bookingId?: string; customerId?: string; customerName?: string; templateId?: string; logMessage?: string; skipLog?: boolean }
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
    if (opts?.eventType && !opts.skipLog) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, customerName: opts.customerName, templateId: opts.templateId, message: opts.logMessage || message.substring(0, 300), status: "failed", result });
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

  if (opts?.eventType && !opts.skipLog) {
    await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, customerName: opts.customerName, templateId: opts.templateId, message: opts.logMessage || message.substring(0, 300), status: result.ok ? "sent" : "failed", result });
  }
  return result;
}

// ── Template body store (from BotBee body_content / template_json, fetched 2026-07-18) ────────────
// These are the EXACT bodies registered on Meta ({{1}}, {{2}}, … positional variables).
// PRIMARY PATH: renderTemplateBody() substitutes {{N}} with Object.values(vars) → sendText().
// FALLBACK PATH (outside 24h window): BotBee template API receives variables as flat positional
// array (Object.values(namedVars)) so BotBee maps index 0→{{1}}, index 1→{{2}} correctly on Meta.
// variable_map.body (BotBee): {"1":"#!Name!#","2":"#!BookingID!#",...} — insertion order matches sender function variable order.
export const TEMPLATE_BODIES: Record<string, string> = {
  "409950": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\nAlhamdulillah! ✅\n\nYour booking has been APPROVED.\n\n📋 Booking ID: {{2}}\n📦 Package: {{3}}\n💰 Amount: ₹ {{4}}\n\nPlease complete your payment using the link below.\n\n🔗 {{5}}\n\n📞 +91 9893225590\n\nJazak Allah Khair.\nAl Burhan Tours & Travels",
  "409953": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nAlhamdulillah! 🎉\n\nWe have successfully received your payment.\n\n📋 Booking ID:{{2}}\n🧾 Invoice No: {{3}}\n💰 Amount Received: ₹ {{4}}\n\nYour booking is confirmed.\n\nJazak Allah Khair.\n\nAl Burhan Tours & Travels",
  "409956": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nYour invoice has been generated.\n\n📋 Booking ID:{{2}}\n🧾 Invoice No:{{3}}\n💰 Amount: ₹ {{4}}\nDownload your invoice below.\n\n🔗 {{5}}\n\nThank you for choosing Al Burhan Tours & Travels.",
  "409958": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nYour Hajj/Umrah Agreement is ready.\n\n📋 Booking ID: {{2}}\n📄 Agreement No: {{3}}\n\nDownload your agreement below.\n\n🔗 {{4}}\n\nPlease review and complete the digital signature if required.\n\nAl Burhan Tours & Travels",
  "409965": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nAlhamdulillah!\n\nYour agreement has been successfully signed.\n\n📄 Agreement ID: {{2}}\n\nThank you for completing the documentation.\n\nAl Burhan Tours & Travels",
  "409991": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nCongratulations!\n\nYour visa has been issued successfully.\n\n📋 Booking ID:{{2}}\n🛂 Visa Number: {{3}}\nDownload Visa: {{4}}\n\n\nMay Allah accept your journey.\n\nAl Burhan Tours & Travels",
  "409994": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nYour flight ticket has been issued.\n\n📋 Booking ID:{{2}}\n✈ PNR:{{3}}\n\nDownload Ticket:{{4}}\n\n\nSafe Travels.\n\nAl Burhan Tours & Travels",
  "409999": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nThis is a reminder for your upcoming journey.\n\n📋 Booking ID:{{2}}\n🕌 Package: {{3}}\n\n✈ Flight:{{4}}\n📅 Departure Date: {{5}}\n🕒 Reporting Time {{6}}\n🏢 Airport {{7}}\n\nKindly report at the airport at least 4 hours before departure with your original passport and required travel documents.\n\nMay Allah (SWT) accept your Hajj/Umrah and grant you a safe journey.\n\nAl Burhan Tours & Travels",
  "410000": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nThis is a reminder for your return journey.\n\n📋 Booking ID: {{2}}\n\n✈ Flight: {{3}}\n📅 Return Date: {{4}}\n🕒 Reporting Time: {{5}}\n🏢 Airport:{{6}}\n\nPlease arrive at the airport well before your reporting time.\n\nMay Allah (SWT) accept all your prayers and grant you a safe journey home.\n\nAl Burhan Tours & Travels",
  "410008": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\nYour accommodation details are ready.\n\n📋 Booking ID: {{2}}\n\n🏨 Hotel: {{3}}\n🚪 Room No:{{4}}\n\nPlease keep these details for your reference during your stay.\n\nMay Allah (SWT) make your stay comfortable and blessed.\n\nAl Burhan Tours & Travels",
  "410022": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nYou are invited to attend the Hajj/Umrah Orientation Programme.\n\n📅 Date: {{2}}\n🕒 Time: {{3}}\n📍 Venue: {{4}}\n\nYour attendance is highly recommended to understand travel procedures, rituals, and important guidelines.\n\nJazak Allah Khair.\n\nAl Burhan Tours & Travels",
  "410026": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nYour departure date is approaching.\n\n📋 Booking ID: {{2}}\n📅 Departure:{{3}}\n🛄 Reporting Time: {{4}}\n🏢 Airport {{5}}\n\nPlease carry your Passport, Visa, Flight Ticket, ID Card, and other required documents.\n\nMay Allah (SWT) bless your journey.\n\nAl Burhan Tours & Travels",
  "410030": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nWelcome to the Kingdom of Saudi Arabia.\n\nAlhamdulillah, we pray that your Hajj/Umrah journey is filled with peace, blessings, and acceptance.\n\nIf you require any assistance during your stay, please contact our team.\n\nJazak Allah Khair.\n\nAl Burhan Tours & Travels",
  "410031": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\nAlhamdulillah!\n\nWelcome back to India.\n\nWe pray that Allah (SWT) accepts your Hajj/Umrah, forgives your sins, and grants you countless blessings.\n\nThank you for travelling with Al Burhan Tours & Travels.\n\nJazak Allah Khair.",
  "410040": "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}\n\n🕌 Hajj {{2}} Bookings Are Now Open!\n\nBook your Hajj journey with Al Burhan Tours & Travels.\n\n✅ Government Approved Services\n✅ Comfortable Accommodation\n✅ Experienced Tour Guides\n✅ Complete Visa & Travel Assistance\n\n📞 Contact: +91 9893225590\n🌐 www.alburhantravels.com\n\nReserve your seat today and begin your sacred journey with confidence.\n\nJazak Allah Khair.\n\nAl Burhan Tours & Travels",
};

/**
 * Apply runtime template ID + body overrides loaded from api_settings.
 * Call once at startup (from index.ts) to hot-patch TEMPLATE_BODIES + ABT_TEMPLATES
 * without a code redeploy — used when admin recreates templates with proper {{1}} Meta vars.
 *
 * overrides format: { "booking_approved": { id: "NEW_ID", body: "...{{1}}..." }, ... }
 */
export function applyTemplateOverrides(overrides: Record<string, { id: string; body: string }>) {
  let count = 0;
  for (const [slug, { id, body }] of Object.entries(overrides)) {
    if (!id || !body) continue;
    if (ABT_TEMPLATES[slug]) {
      const oldId = ABT_TEMPLATES[slug].id;
      if (oldId && TEMPLATE_BODIES[oldId] !== undefined) delete TEMPLATE_BODIES[oldId];
      ABT_TEMPLATES[slug].id = id;
    }
    TEMPLATE_BODIES[id] = body;
    count++;
  }
  console.log(`[BotBee] applyTemplateOverrides: activated ${count} template overrides`);
}

/**
 * Replace template placeholders with actual values.
 * Handles TWO formats:
 *   #!VarName!#  — old BotBee CRM format (current templates, approved as static text)
 *   {{N}}        — Meta variable format (new templates being recreated with proper {{1}},{{2}} slots)
 *
 * For {{N}} templates, variables are substituted positionally: {{1}} → vars[0], {{2}} → vars[1], etc.
 * (Object.values preserves insertion order, so sender functions must pass vars in template order.)
 */
function renderTemplateBody(body: string, vars: Record<string, string>): string {
  let result = body;

  // 1. Replace #!VarName!# (named CRM variable format)
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`#!${key}!#`).join(String(value ?? "-"));
  }

  // 2. Replace {{N}} (Meta positional variable format)
  const values = Object.values(vars);
  result = result.replace(/\{\{(\d+)\}\}/g, (match, n) => {
    const idx = parseInt(n, 10) - 1; // {{1}} → index 0
    return idx >= 0 && idx < values.length ? String(values[idx] ?? "-") : match;
  });

  return result;
}

export async function sendTemplate(
  to: string, templateId: string,
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  const { enabled } = getCredentials();
  if (!enabled) return { ok: false, provider: "BotBee", endpoint: "disabled", errorMessage: "WhatsApp disabled in API Settings" };

  const isNumericId = /^\d+$/.test((templateId || "").trim());
  const templateBody = isNumericId ? TEMPLATE_BODIES[templateId.trim()] : null;
  const namedVars = opts?.variables && Object.keys(opts.variables).length > 0 ? opts.variables : undefined;

  // ── PRIMARY PATH: manual substitution + sendText ─────────────────────────
  // BotBee's send/template API accepts all variable formats (named object, flat array,
  // components) but does NOT substitute #!VarName!# in the delivered message.
  // The real delivery body is mixed_body_text with #!VarName!# placeholders.
  // We render it ourselves and send via /whatsapp/send (text API).
  //
  // IMPORTANT: This path is DISABLED when opts.forceTemplateApi=true because:
  // - The text API is session-based (24h window). If the customer hasn't messaged first,
  //   BotBee may return HTTP 200 "ok" but Meta silently drops the message — no delivery,
  //   no wamid. The template API (/whatsapp/send/template) bypasses this restriction.
  // - All ERP-initiated outbound notifications must use forceTemplateApi:true to guarantee
  //   delivery and a real wamid.
  if (templateBody && !opts?.forceTemplateApi) {
    // ── Meta Cloud API first: sends approved templates outside 24-hour session window ─
    try {
      const { isMetaWapiConfigured, sendMetaTemplate } = await import("./metaWapi.js");
      if (isMetaWapiConfigured()) {
        // Reverse-map numeric template ID → approved Meta template name
        const tplEntry = Object.values(ABT_TEMPLATES).find(v => v.id === templateId);
        const templateName = tplEntry?.name || templateId;
        const varValues = namedVars ? Object.values(namedVars).map(v => String(v ?? "-")) : [];
        const metaResult = await sendMetaTemplate(to, templateName, varValues, {
          eventType: opts?.eventType,
          bookingId: opts?.bookingId,
          customerId: opts?.customerId,
          customerName: opts?.customerName,
        });
        if (metaResult.ok) {
          console.log(`[BotBee] Meta Cloud API ✅ ${templateName} → ${to} (wamid=${metaResult.messageId})`);
          return { ok: true, provider: "MetaCloudAPI" as any, endpoint: metaResult.endpoint, messageId: metaResult.messageId };
        }
        console.warn(`[BotBee] Meta Cloud API failed (${metaResult.errorMessage}), falling back to BotBee text API`);
      }
    } catch (metaErr: any) {
      console.warn(`[BotBee] Meta Cloud API import/call error:`, metaErr?.message);
    }
    // ── Existing BotBee text API path (session-based fallback) ───────────────────
    const rendered = namedVars ? renderTemplateBody(templateBody, namedVars) : templateBody;

    // Sanity check: warn if any placeholders remain unsubstituted (#!Var!# or {{N}})
    const remaining = [
      ...[...rendered.matchAll(/#![^!]+!#/g)].map(m => m[0]),
      ...[...rendered.matchAll(/\{\{\d+\}\}/g)].map(m => m[0]),
    ];
    if (remaining.length) {
      console.warn("[BotBee] sendTemplate: unsubstituted placeholders after render:", remaining, "vars keys:", namedVars ? Object.keys(namedVars) : "none");
    }

    console.log("[BotBee] sendTemplate RENDER →", JSON.stringify({
      templateId, to,
      vars: namedVars ? Object.fromEntries(Object.entries(namedVars).map(([k,v]) => [k, String(v).substring(0, 40)])) : null,
      preview: rendered.substring(0, 120).replace(/\r\n/g, "↵"),
      unsubstituted: remaining,
    }));

    const textResult = await sendText(to, rendered, {
      eventType: opts?.eventType,
      bookingId: opts?.bookingId,
      customerId: opts?.customerId,
      customerName: opts?.customerName,
      templateId,
      logMessage: `[tpl:${templateId}] ${rendered.substring(0, 250)}`,
      skipLog: true,  // sendTemplate owns the log; suppress intermediate text-send log
    });

    // ── 24h session window detection ────────────────────────────────────────────
    // BotBee's /whatsapp/send is session-based: it only works when the customer
    // has messaged the business number within the last 24 hours.  When that window
    // has expired, automatically fall through to the template API below which
    // sends an approved WhatsApp template and bypasses the session restriction.
    // For any other outcome (success or non-window failure) return immediately.
    if (!textResult.ok && is24hWindowError(textResult)) {
      console.warn(
        `[BotBee] sendTemplate: 24h session window detected` +
        ` (error="${(textResult.errorMessage || "").slice(0, 100)}")` +
        ` → falling through to approved template API (templateId=${templateId})`
      );
      // Do NOT log the text-send attempt here — the template API path below
      // owns the final log entry so only one outcome appears in notification_logs.
    } else {
      // Success or non-window failure — log the final result and return.
      if (opts?.eventType && !opts?.noInternalLog) {
        await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, customerName: opts.customerName, templateId, message: `[tpl:${templateId}] ${rendered.substring(0, 250)}`, status: textResult.ok ? "sent" : "failed", result: textResult });
      }
      return textResult;
    }
  }

  // ── FALLBACK PATH: approved WhatsApp template API ────────────────────────────
  // Reached when: (a) templateBody is absent from TEMPLATE_BODIES (unrecognised ID),
  // or (b) the 24h session window was detected above and we must send a template
  // instead of a plain-text session message.
  // Variables are sent as a flat positional array: index 0 → {{1}}, index 1 → {{2}}.
  const { apiToken, phone_number_id, business_id, baseUrl } = getCredentials();
  const endpoint = `${baseUrl}/whatsapp/send/template`;
  if (!apiToken || !phone_number_id) return { ok: false, provider: "BotBee", endpoint, errorMessage: "BotBee credentials not configured" };
  if (!templateId?.trim()) return { ok: false, provider: "BotBee", endpoint, errorMessage: "Template ID is required" };

  let phone: string;
  try {
    phone = toBotBeePhone(to);
  } catch (err: any) {
    const result: BotBeeResult = { ok: false, provider: "BotBee", endpoint, errorMessage: err?.message || "Invalid mobile number" };
    if (opts?.eventType && !opts?.noInternalLog) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to || "unknown", bookingId: opts.bookingId, customerId: opts.customerId, customerName: opts.customerName, templateId, message: `Template ID: ${templateId}`, status: "failed", result });
    }
    return result;
  }

  // Pass variables as a flat positional array so BotBee maps index 0 → {{1}}, index 1 → {{2}}.
  // Sender functions build the variable object in exact insertion order matching variable_map positions.
  const positionalVars = namedVars ? Object.values(namedVars) : undefined;

  const payload: Record<string, unknown> = {
    apiToken, phone_number_id, phone_number: phone,
    ...(business_id ? { business_id } : {}),
    ...(isNumericId ? { template_id: Number(templateId) } : { template_name: templateId }),
    ...(positionalVars ? { variables: positionalVars } : {}),
  };

  const reqPayload: Record<string, unknown> = {
    phone_number_id, phone_number: phone,
    ...(business_id ? { business_id } : {}),
    ...(isNumericId ? { template_id: Number(templateId) } : { template_name: templateId }),
    ...(positionalVars ? { variables: positionalVars } : {}),
  };

  console.log("[BotBee] sendTemplate REQUEST →", JSON.stringify(reqPayload));

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
    console.log("[BotBee] sendTemplate RESPONSE ←", JSON.stringify({ templateId, httpStatus: response.status, ok: result.ok, data }));
  } catch (err: any) {
    const resp = err?.response;
    result = { ok: false, provider: "BotBee", endpoint, httpStatus: resp?.status, requestPayload: reqPayload, responsePayload: resp?.data, errorMessage: resp?.data?.message || err.message };
    console.error("[BotBee] sendTemplate ERROR:", JSON.stringify({ templateId, error: err.message, response: resp?.data }));
  }

  if (opts?.eventType && !opts?.noInternalLog) {
    if (result.ok || !opts.skipFailureLog) {
      await logToDb({ eventType: opts.eventType, channel: "whatsapp", recipient: to, bookingId: opts.bookingId, customerId: opts.customerId, customerName: opts.customerName, templateId, message: `Template ID: ${templateId}`, status: result.ok ? "sent" : "failed", result });
    }
  }
  return result;
}

export async function sendInteractiveButtons(
  to: string, body: string, buttons: Array<{ id: string; title: string }>,
  opts?: BotBeeTemplateOpts
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
  opts?: BotBeeTemplateOpts
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
  // Route through the approved template (works inside AND outside the 24h window)
  const result = await sendInvoiceReadyTemplate(to, {
    customerName: ctx.customerName,
    bookingId: ctx.bookingNumber,
    invoiceNumber: ctx.invoiceNumber,
    amount: ctx.amount,
    invoiceUrl: ctx.invoiceUrl || `https://alburhantravels.com/invoice/${ctx.bookingNumber}`,
  }, { eventType: "invoice_generated", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendTicket(to: string, ctx: {
  customerName: string; bookingNumber: string; flightNumber?: string;
  airline?: string; departureDate?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  // Route through the approved template (works inside AND outside the 24h window)
  const result = await sendFlightTemplate(to, {
    customerName: ctx.customerName,
    bookingId: ctx.bookingNumber,
    flightNumber: ctx.flightNumber,
    departureDate: ctx.departureDate,
  }, { eventType: "ticket_issued", bookingId: ctx.bookingId, customerId: ctx.customerId });
  if (!result.ok) await smsFallback(to, ctx.bookingId, ctx.customerId);
  return result;
}

export async function sendVisa(to: string, ctx: {
  customerName: string; bookingNumber: string; visaNumber?: string;
  packageName?: string; bookingId?: string; customerId?: string;
}): Promise<BotBeeResult> {
  // Route through the approved template (works inside AND outside the 24h window)
  const result = await sendVisaIssuedTemplate(to, {
    customerName: ctx.customerName,
    bookingId: ctx.bookingNumber,
    packageName: ctx.packageName,
    visaNumber: ctx.visaNumber,
  }, { eventType: "visa_ready", bookingId: ctx.bookingId, customerId: ctx.customerId });
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
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  const message = caption ? `${caption}\n\n${imageUrl}` : imageUrl;
  return sendText(to, message, { eventType: opts?.eventType || "new_booking", bookingId: opts?.bookingId, customerId: opts?.customerId });
}

export async function sendPDF(
  to: string, pdfUrl: string, caption?: string,
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  const message = `${caption || "Document ready"}:\n📎 ${pdfUrl}`;
  return sendText(to, message, { eventType: opts?.eventType || "invoice_generated", bookingId: opts?.bookingId, customerId: opts?.customerId });
}

export async function sendButtons(
  to: string, body: string, buttons: Array<{ id: string; title: string }>,
  opts?: BotBeeTemplateOpts
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
    // Use Node 20 native FormData + fetch (no npm form-data package needed)
    const form = new FormData();
    form.append("apiToken", apiToken);
    form.append("phone_number_id", phone_number_id);
    form.append("media_file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName);

    const rawResponse = await withRetry(async () => {
      const r = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
      return r;
    });
    const data: any = await rawResponse.json();
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
  opts?: BotBeeTemplateOpts
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

// ── Approved BotBee Confirmation Template (ID 333473 / "conformation") ────────
//
// Utility template — Category: Utility, Language: English (UK)
// Variables in order:
//   {{User-Name}}                  → customerName
//   {{system-appointment-name}}    → packageName
//   {{system-cart-total-price}}    → totalAmount  (pre-formatted, e.g. "₹90,000")
//   {{system-attachment-link}}     → attachmentLink (invoice page URL)
//
// Use ONLY for:
//   • payment_received  (fully paid — booking confirmed + invoice generated)
//   • booking_approved  (admin approval confirmation)
//
// Do NOT use for: flight reminder, visa, tickets, travel docs, payment reminders,
// or any other general notification.

export const CONFIRMATION_TEMPLATE_NAME = "conformation";
export const CONFIRMATION_TEMPLATE_ID   = "333473";

export async function sendConfirmationTemplate(
  to: string,
  _ctx: { customerName: string; packageName: string; bookingRef: string; attachmentLink: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, CONFIRMATION_TEMPLATE_ID, opts);
}

// ── Al Burhan Production Templates — env-var backed, never hardcoded ─────────
// All template names are read from environment variables at startup.
// Override any name by setting the corresponding env var (e.g. on the VPS).
// Central config: src/lib/templateConfig.ts
// Fallback defaults are used only when the env var is not set.

// ── Approved BotBee production templates ──────────────────────────────────────
// Each entry maps an internal key to the exact template slug approved on BotBee.
// Non-numeric names are sent via template_name field; numeric IDs via template_id.
// Env-var overrides allow changing slugs on VPS without redeploying.
export const ABT_TEMPLATES: Record<string, { id: string; name: string }> = {
  // ── Core booking & payment ─────────────────────────────────────────────────
  // IDs confirmed from live BotBee API 2026-07-18 — used as template_id in sends
  // id="" means NOT in BotBee → graceful no-op fallback
  booking_submitted:     { id: "409897", name: (process.env.BOTBEE_BOOKING_RECEIVE_TEMPLATE       || "booking_receive").trim() },
  booking_approved:      { id: "409950", name: (process.env.BOTBEE_BOOKING_APPROVED_TEMPLATE      || "booking_approved").trim() },
  payment_received:      { id: "409953", name: (process.env.BOTBEE_PAYMENT_RECEIVED_TEMPLATE      || "payment_received").trim() },
  pending_payment:       { id: "",       name: (process.env.BOTBEE_PENDING_PAYMENT_TEMPLATE       || "pending_payment_reminder").trim() },
  // ── Documents ─────────────────────────────────────────────────────────────
  invoice_ready:         { id: "409956", name: (process.env.BOTBEE_INVOICE_READY_TEMPLATE         || "invoice_ready").trim() },
  agreement_ready:       { id: "409958", name: (process.env.BOTBEE_AGREEMENT_READY_TEMPLATE       || "agreement_ready").trim() },
  agreement_signed:      { id: "409965", name: (process.env.BOTBEE_AGREEMENT_SIGNED_TEMPLATE      || "agreement_signed").trim() },
  visa_issued:           { id: "409991", name: (process.env.BOTBEE_VISA_ISSUED_TEMPLATE           || "visa_issued").trim() },
  ticket_issued:         { id: "409994", name: (process.env.BOTBEE_TICKET_ISSUED_TEMPLATE         || "ticket_issued").trim() },
  // ── Travel reminders ──────────────────────────────────────────────────────
  flight_reminder:       { id: "409999", name: (process.env.BOTBEE_FLIGHT_REMINDER_TEMPLATE       || "flight_reminder").trim() },
  return_flight_reminder:{ id: "410000", name: (process.env.BOTBEE_RETURN_FLIGHT_TEMPLATE         || "return_flight_reminder").trim() },
  departure_reminder:    { id: "410026", name: (process.env.BOTBEE_DEPARTURE_REMINDER_TEMPLATE    || "departure_reminde").trim() },
  // ── On-ground ─────────────────────────────────────────────────────────────
  room_allocation:       { id: "410008", name: (process.env.BOTBEE_ROOM_ALLOCATION_TEMPLATE       || "room_allocation").trim() },
  group_orientation:     { id: "410022", name: (process.env.BOTBEE_GROUP_ORIENTATION_TEMPLATE     || "group_orientation").trim() },
  welcome_saudi:         { id: "410030", name: (process.env.BOTBEE_WELCOME_SAUDI_TEMPLATE         || "welcome_saudi").trim() },
  arrival_india:         { id: "410031", name: (process.env.BOTBEE_ARRIVAL_INDIA_TEMPLATE         || "arrival_india").trim() },
  // ── Special ───────────────────────────────────────────────────────────────
  hajj_mubarak:          { id: "",       name: (process.env.BOTBEE_HAJJ_MUBARAK_TEMPLATE          || "hajj_mubarak").trim() },
  hajj_package_launch:   { id: "410040", name: (process.env.BOTBEE_HAJJ_PACKAGE_LAUNCH_TEMPLATE   || "hajj_package_launch").trim() },
};

function bodyParams(texts: (string | null | undefined)[]): object[] {
  if (!texts.length) return [];
  return [{
    type: "body",
    parameters: texts.map(t => ({ type: "text", text: String(t ?? "-") })),
  }];
}

// ── Variable mapping for all ABT templates ────────────────────────────────────
// ALL BotBee ABT templates use Meta WhatsApp Cloud API {{1}},{{2}},… positional
// placeholders in body_content.  Variable substitution REQUIRES the Meta-style
// components format (type:"body", parameters:[{type:"text",text:"..."}]).
//
// Sending a flat variables:[] array is silently accepted (HTTP 200 + wamid) but
// variables are NOT substituted — recipient sees the raw #!Name!# display labels.
//
// Confirmed bodies from GET /api/v1/whatsapp/template/list — 2026-07-18:
//   409950 booking_approved     : {{1}}=name {{2}}=bookingId {{3}}=package {{4}}=amount {{5}}=invoiceUrl  (5)
//   409953 payment_received     : {{1}}=name {{2}}=bookingId {{3}}=invoiceNo {{4}}=amount                 (4)
//   409956 invoice_ready        : {{1}}=name {{2}}=bookingId {{3}}=invoiceNo {{4}}=amount {{5}}=invoiceUrl(5)
//   409958 agreement_ready      : {{1}}=name {{2}}=bookingId {{3}}=agreementNo {{4}}=agreementUrl         (4)
//   409965 agreement_signed     : {{1}}=name {{2}}=agreementId                                            (2)
//   409991 visa_issued          : {{1}}=name {{2}}=bookingId {{3}}=visaNo {{4}}=visaUrl                   (4)
//   409994 ticket_issued        : {{1}}=name {{2}}=bookingId {{3}}=pnr {{4}}=ticketUrl                    (4)
//   409999 flight_reminder      : {{1}}=name {{2}}=bookingId {{3}}=package {{4}}=flight {{5}}=depDate {{6}}=repTime {{7}}=airport (7)
//   410000 return_flight_reminder: {{1}}=name {{2}}=bookingId {{3}}=flight {{4}}=returnDate {{5}}=repTime {{6}}=airport (6)
//   410008 room_allocation      : {{1}}=name {{2}}=bookingId {{3}}=hotel {{4}}=roomNo                     (4)
//   410022 group_orientation    : {{1}}=name {{2}}=date {{3}}=time {{4}}=venue                            (4)
//   410026 departure_reminde    : {{1}}=name {{2}}=bookingId {{3}}=depDate {{4}}=repTime {{5}}=airport     (5)
//   410030 welcome_saudi        : {{1}}=name                                                              (1)
//   410031 arrival_india        : {{1}}=name                                                              (1)
//   410040 hajj_package_launch  : {{1}}=name {{2}}=year                                                  (2)

const SITE = "https://alburhantravels.com";
function fmtAmount(v: string | number | undefined | null): string {
  // Return the raw number WITHOUT ₹ symbol — template bodies already have "₹ #!Amount!#"
  // so including ₹ here would produce "₹ ₹1,89,000" (double rupee).
  const n = Number(v);
  return isNaN(n) || n === 0 ? "-" : n.toLocaleString("en-IN");
}

// Helper: resolve template identifier — prefer id when numeric, fall through to name slug
function tplId(key: keyof typeof ABT_TEMPLATES): string {
  const t = ABT_TEMPLATES[key];
  return t.id || t.name;
}

/** booking_receive — fires when a new booking is submitted (no BotBee template — graceful no-op) */
export async function sendBookingSubmittedTemplate(
  to: string,
  ctx: { customerName: string; packageName: string; bookingId: string; amount?: string | number; invoiceUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("booking_submitted"), {
    ...opts,
    variables: { Name: ctx.customerName, BookingID: ctx.bookingId, PackageContent: ctx.packageName || "Hajj/Umrah Package", Amount: fmtAmount(ctx.amount) },
  });
}

/** payment_received — fires on full/partial payment
 *  BotBee vars: Name, BookingID, Invoice, Amount
 */
export async function sendPaymentReceivedTemplate(
  to: string,
  ctx: { customerName: string; packageName?: string; bookingId: string; invoiceNumber?: string; amount?: string | number; invoiceUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("payment_received"), {
    ...opts,
    variables: { Name: ctx.customerName, BookingID: ctx.bookingId, Invoice: ctx.invoiceNumber || ctx.bookingId, Amount: fmtAmount(ctx.amount) },
  });
}

/** payment_received (pending variant) — fires for unpaid bookings at 3d/7d/15d (no BotBee template — graceful no-op) */
export async function sendPendingPaymentTemplate(
  to: string,
  ctx: { customerName: string; packageName: string; bookingId: string; balance?: string | number; paymentUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("pending_payment"), {
    ...opts,
    variables: { Name: ctx.customerName, BookingID: ctx.bookingId, PackageContent: ctx.packageName || "Hajj/Umrah Package", Amount: fmtAmount(ctx.balance), Paymenturllink: ctx.paymentUrl || `${SITE}/pay/${ctx.bookingId}` },
  });
}

/** booking_approved — fires when admin approves a booking
 *  BotBee vars: Name, BookingID, PackageContent, Amount, Paymenturllink
 */
export async function sendApprovalTemplate(
  to: string,
  ctx: { customerName: string; packageName: string; bookingId: string; amount?: string | number; invoiceUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("booking_approved"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      PackageContent: ctx.packageName || "Hajj/Umrah Package",
      Amount: fmtAmount(ctx.amount),
      Paymenturllink: ctx.invoiceUrl || `${SITE}/invoice/${ctx.bookingId}`,
    },
  });
}

/** departure_reminde — fires 7d/3d/2d/1d/12h/6h/3h before departure
 *  BotBee vars: Name, BookingID, Departuredate, Reportingtime, T2
 *  Note: template name in BotBee is "departure_reminde" (15-char limit truncated)
 */
export async function sendDepartureReminderTemplate(
  to: string,
  ctx: {
    customerName: string; packageName?: string; bookingId: string;
    flightNumber?: string; departureDate?: string; reportingTime?: string;
    departureAirport?: string; hotelName?: string; emergencyContact?: string;
  },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("departure_reminder"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Departuredate: ctx.departureDate || "TBA",
      Reportingtime: ctx.reportingTime || "4 hours before departure",
      T2: ctx.departureAirport || "TBA",
    },
  });
}

/** visa_issued — fires when visa is uploaded/approved
 *  BotBee vars: Name, BookingID, Visano, Download
 */
export async function sendVisaIssuedTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; packageName?: string; visaNumber?: string; visaUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("visa_issued"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Visano: ctx.visaNumber || "-",
      Download: ctx.visaUrl || `${SITE}/invoice/${ctx.bookingId}`,
    },
  });
}

/** ticket_issued — fires when flight ticket is issued
 *  BotBee vars: Name, BookingID, Flightnumber, Download
 */
export async function sendFlightTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; flightNumber?: string; departureDate?: string; ticketNumber?: string; ticketUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("ticket_issued"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Flightnumber: ctx.ticketNumber || ctx.flightNumber || "TBA",
      Download: ctx.ticketUrl || `${SITE}/invoice/${ctx.bookingId}`,
    },
  });
}

/** invoice_ready — fires when invoice is generated
 *  BotBee vars: Name, BookingID, Invoice, Amount, Paymenturllink
 */
export async function sendInvoiceReadyTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; packageName?: string; invoiceNumber?: string; amount?: string | number; invoiceUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("invoice_ready"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Invoice: ctx.invoiceNumber || ctx.bookingId,
      Amount: fmtAmount(ctx.amount),
      Paymenturllink: ctx.invoiceUrl || `${SITE}/invoice/${ctx.bookingId}`,
    },
  });
}

/** agreement_ready — fires when agreement is ready for signing
 *  BotBee vars: Name, BookingID, Agreement, Download
 */
export async function sendAgreementReadyTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; packageName?: string; agreementNumber?: string; agreementUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("agreement_ready"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Agreement: ctx.agreementNumber || ctx.bookingId,
      Download: ctx.agreementUrl || `${SITE}/agreement/${ctx.bookingId}`,
    },
  });
}

/** agreement_signed — fires when customer signs the agreement
 *  BotBee vars: Name, Agreement
 */
export async function sendAgreementSignedTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; signedDate?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("agreement_signed"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      Agreement: ctx.bookingId,
    },
  });
}

/** flight_reminder — fires when a flight is assigned to pilgrim
 *  BotBee vars: Name, BookingID, PackageContent, Flightnumber, Departuredate, Reportingtime, Airport
 */
export async function sendFlightReminderTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; packageName?: string; flightNumber?: string; departureDate?: string; departureAirport?: string; reportingTime?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("flight_reminder"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      PackageContent: ctx.packageName || "Hajj/Umrah Package",
      Flightnumber: ctx.flightNumber || "TBA",
      Departuredate: ctx.departureDate || "TBA",
      Reportingtime: ctx.reportingTime || "3 hours before departure",
      Airport: ctx.departureAirport || "TBA",
    },
  });
}

/** return_flight_reminder — fires before return journey
 *  BotBee vars: Name, BookingID, Flightnumber, Departuredate, Reportingtime, Airport
 */
export async function sendReturnFlightReminderTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; flightNumber?: string; returnDate?: string; returnAirport?: string; reportingTime?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("return_flight_reminder"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Flightnumber: ctx.flightNumber || "TBA",
      Departuredate: ctx.returnDate || "TBA",
      Reportingtime: ctx.reportingTime || "3 hours before departure",
      Airport: ctx.returnAirport || "TBA",
    },
  });
}

/** room_allocation — fires when hotel room is assigned
 *  BotBee vars: Name, BookingID, Hotel, Roomnumber
 */
export async function sendRoomAllocationTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; hotelName?: string; roomNumber?: string; checkInDate?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("room_allocation"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      BookingID: ctx.bookingId,
      Hotel: ctx.hotelName || "Hotel TBA",
      Roomnumber: ctx.roomNumber || "TBA",
    },
  });
}

/** group_orientation — fires when group orientation is scheduled
 *  BotBee vars: Name, date, Time, Hussainhall
 */
export async function sendGroupOrientationTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; groupName?: string; orientationDate?: string; orientationTime?: string; location?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("group_orientation"), {
    ...opts,
    variables: {
      Name: ctx.customerName,
      date: ctx.orientationDate || "TBA",
      Time: ctx.orientationTime || "TBA",
      Hussainhall: ctx.location || "Al Burhan Office",
    },
  });
}

/** welcome_saudi — fires on arrival in Saudi Arabia
 *  BotBee vars: Name
 */
export async function sendWelcomeSaudiTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; hotelName?: string; groupName?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("welcome_saudi"), {
    ...opts,
    variables: { Name: ctx.customerName },
  });
}

/** arrival_india — fires when pilgrim arrives back in India
 *  BotBee vars: Name
 */
export async function sendArrivalIndiaTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string; flightNumber?: string; arrivalDate?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("arrival_india"), {
    ...opts,
    variables: { Name: ctx.customerName },
  });
}

/** hajj_mubarak — sent after Hajj completion (no BotBee template — graceful no-op) */
export async function sendHajjMubarakTemplate(
  to: string,
  ctx: { customerName: string; bookingId: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  return sendTemplate(to, tplId("hajj_mubarak"), {
    ...opts,
    variables: { Name: ctx.customerName },
  });
}

/** hajj_package_launch — bulk broadcast for new package announcements
 *  BotBee vars: Name, 2027  (year variable is literally named "2027" in BotBee dashboard)
 */
export async function sendHajjPackageLaunchTemplate(
  to: string,
  ctx: { customerName: string; packageName?: string; launchUrl?: string },
  opts?: BotBeeTemplateOpts
): Promise<BotBeeResult> {
  const year = ctx.packageName?.match(/\d{4}/)?.[0] || "2027";
  return sendTemplate(to, tplId("hajj_package_launch"), {
    ...opts,
    variables: { Name: ctx.customerName, "2027": year },
  });
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
  const business_id = (bbCfg.extra?.business_id || process.env.BOTBEE_BUSINESS_ID || "").trim();

  if (!enabled) return { ok: false, errorMessage: "WhatsApp disabled in API Settings" };
  if (!apiToken || !phone_number_id) return { ok: false, errorMessage: "BotBee credentials not configured" };

  // Official BotBee endpoint: POST /api/v1/whatsapp/template/list
  const endpoint = `${baseUrl}/whatsapp/template/list`;
  try {
    const body: Record<string, string> = { apiToken, phone_number_id };
    if (business_id) body.business_id = business_id;
    const response = await axios.post(endpoint, body, { headers: { "Content-Type": "application/json" }, timeout: 15000 });
    const data = response.data;

    // BotBee signals failure with status:"0" even on HTTP 200.
    // Must check BEFORE trying to parse templates — otherwise we silently return
    // ok:true with an empty array and hide the real error from the admin.
    const botbeeStatus = String(data?.status ?? "");
    if (botbeeStatus === "0" || botbeeStatus === "false") {
      const errMsg = (typeof data?.message === "string" && data.message) ? data.message : "BotBee returned an error (status:0)";
      console.error(`[BotBee] fetchTemplates: API returned failure — ${errMsg}`);
      return { ok: false, errorMessage: errMsg, responsePayload: data };
    }

    // BotBee POST /template/list returns { status: "1", message: [ { template_name, template_id, template_category, ... } ] }
    // Fallback: standard paths used by some other providers
    const rawArr: unknown[] =
      (Array.isArray(data?.message) ? data.message : null) ||
      data?.templates ||
      data?.data?.templates ||
      data?.data ||
      data?.result ||
      (Array.isArray(data) ? data : []);

    if (!Array.isArray(rawArr)) return { ok: false, errorMessage: `Unexpected response format — raw: ${JSON.stringify(data).slice(0, 200)}`, responsePayload: data };

    // Normalise BotBee field names (template_name → name, template_category → category, etc.)
    const raw: WaTemplate[] = rawArr.map((t: any) => ({
      id:         String(t.template_id || t.id || ""),
      name:       (t.template_name || t.name || "").toLowerCase(),
      status:     (t.template_status || t.status || "UNKNOWN").toUpperCase(),
      category:   (t.template_category || t.category || "UTILITY").toUpperCase(),
      language:   t.template_language || t.language || "en",
      components: Array.isArray(t.components) ? t.components : [],
    }));
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
    // sendDLTSMS signature: (mobile, var1=customerName, var2=bookingNumber, var3)
    // Only mobile is available in this context; DLT will block if notify_template_id not set
    await sendDLTSMS(to, "Customer", bookingId || "", "");
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
