import axios from "axios";
import { pool } from "@workspace/db";
import { getCachedConfig } from "./apiSettingsProvider.js";

// ── Credentials & config ──────────────────────────────────────────────────────

function getConfig() {
  const db = getCachedConfig("fast2sms");
  const apiKey = db.apiKey || process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY || "";
  const enabled = db.enabled !== false;
  const ex = db.extra || {};
  const globalSender = ex.sender_id || "ALBURH";
  // Emergency quick-route fallback — must be EXPLICITLY enabled by admin
  const emergencyFallbackEnabled = ex.emergency_sms_fallback_enabled === "1";
  return {
    apiKey,
    enabled,
    ex,
    sender_id: globalSender,
    emergencyFallbackEnabled,
    // Per-event template IDs — fall back to generic notify_template_id
    notify_tid: ex.notify_template_id || "",
    tids: {
      booking_created:       ex.booking_created_tid       || ex.notify_template_id || "",
      booking_confirmed:     ex.booking_confirmed_tid     || ex.notify_template_id || "",
      booking_rejected:      ex.booking_rejected_tid      || ex.notify_template_id || "",
      payment_received:      ex.payment_received_tid      || ex.notify_template_id || "",
      partial_payment:       ex.partial_payment_tid       || ex.payment_received_tid || ex.notify_template_id || "",
      pending_payment:       ex.pending_payment_tid       || ex.notify_template_id || "",
      invoice_created:       ex.invoice_created_tid       || ex.notify_template_id || "",
      agreement_signed:      ex.agreement_signed_tid      || ex.notify_template_id || "",
      ticket_issued:         ex.ticket_issued_tid         || ex.notify_template_id || "",
      visa_issued:           ex.visa_issued_tid           || ex.notify_template_id || "",
      hotel_voucher:         ex.hotel_voucher_issued_tid  || ex.notify_template_id || "",
      departure_reminder:    ex.departure_reminder_tid    || ex.notify_template_id || "",
      arrival_reminder:      ex.arrival_reminder_tid      || ex.notify_template_id || "",
      welcome_saudi_arabia:  ex.welcome_saudi_arabia_tid  || ex.notify_template_id || "",
      return_reminder:       ex.return_reminder_tid       || ex.notify_template_id || "",
      eid_greeting:          ex.eid_greeting_tid          || ex.notify_template_id || "",
      custom:                ex.custom_tid                || ex.notify_template_id || "",
    },
    // Per-event sender IDs — fall back to global sender_id
    senders: {
      booking_created:       ex.booking_created_sender       || globalSender,
      booking_confirmed:     ex.booking_confirmed_sender     || globalSender,
      booking_rejected:      ex.booking_rejected_sender      || globalSender,
      payment_received:      ex.payment_received_sender      || globalSender,
      partial_payment:       ex.partial_payment_sender       || globalSender,
      pending_payment:       ex.pending_payment_sender       || globalSender,
      invoice_created:       ex.invoice_created_sender       || globalSender,
      agreement_signed:      ex.agreement_signed_sender      || globalSender,
      ticket_issued:         ex.ticket_issued_sender         || globalSender,
      visa_issued:           ex.visa_issued_sender           || globalSender,
      hotel_voucher:         ex.hotel_voucher_sender         || globalSender,
      departure_reminder:    ex.departure_reminder_sender    || globalSender,
      arrival_reminder:      ex.arrival_reminder_sender      || globalSender,
      welcome_saudi_arabia:  ex.welcome_saudi_arabia_sender  || globalSender,
      return_reminder:       ex.return_reminder_sender       || globalSender,
      eid_greeting:          ex.eid_greeting_sender          || globalSender,
      custom:                ex.custom_sender                || globalSender,
      otp:                   ex.otp_sender                   || globalSender,
      forgot_password_otp:   ex.forgot_password_otp_sender   || ex.otp_sender || globalSender,
    },
  };
}

// ── Approved sender ID cache (DB-backed, refreshed every 60 s) ─────────────────
let _senderIdCache: { ids: string[]; ts: number } | null = null;
const FALLBACK_SENDER_IDS = ["ABURHA", "ALBURH", "ALBUR", "ABTUMR", "ABTTHJ"];

async function getApprovedSenderIds(): Promise<string[]> {
  const TTL = 60_000;
  if (_senderIdCache && Date.now() - _senderIdCache.ts < TTL) return _senderIdCache.ids;
  try {
    const r = await pool.query(
      `SELECT sender_id FROM sender_ids WHERE status = 'active' ORDER BY default_sender DESC, sender_id`
    );
    const ids: string[] = r.rows.map((row: any) => row.sender_id as string);
    _senderIdCache = { ids: ids.length ? ids : FALLBACK_SENDER_IDS, ts: Date.now() };
    return _senderIdCache.ids;
  } catch {
    // DB table may not exist yet — fall back to known approved list
    return FALLBACK_SENDER_IDS;
  }
}

/** Bust the sender ID cache (called after DB updates) */
export function bustSenderIdCache() { _senderIdCache = null; }

function toPhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  if (clean.length > 10) return clean.slice(-10);
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

// ── Notification log ──────────────────────────────────────────────────────────

async function logSMS(data: {
  eventType: string;
  mobile: string;
  templateId: string;
  senderId?: string;
  message?: string;
  status: "sent" | "failed";
  httpStatus?: number;
  responsePayload?: unknown;
  errorMessage?: string;
  messageId?: string | null;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  bookingNumber?: string;
  retryCount?: number;
}) {
  try {
    const id = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, channel, recipient, message, status,
        provider_response, provider_name, api_endpoint, http_status, request_payload,
        sent_at, retry_count, sender_id, wamid, customer_name, booking_number)
       VALUES ($1,$2,$3,$4,'sms',$5,$6,$7,$8,'Fast2SMS',
               'https://www.fast2sms.com/dev/bulkV2',
               $9,$10,NOW(),$11,$12,$13,$14,$15)`,
      [
        id, data.eventType,
        data.customerId || null, data.bookingId || null,
        data.mobile,
        data.message || null,
        data.status,
        JSON.stringify({ ok: data.status === "sent", templateId: data.templateId, senderId: data.senderId, response: data.responsePayload, error: data.errorMessage }),
        data.httpStatus || null,
        JSON.stringify({ mobile: data.mobile, template_id: data.templateId, sender_id: data.senderId, route: "dlt" }),
        data.retryCount ?? 0,
        data.senderId || null,
        data.messageId || null,
        data.customerName || null,
        data.bookingNumber || null,
      ]
    );
  } catch (e) {
    console.error("[SMS] logSMS failed:", e);
  }
}

// ── Core DLT sender ───────────────────────────────────────────────────────────

export interface SMSResult {
  ok: boolean;
  provider: "Fast2SMS";
  templateId: string;
  mobile: string;
  httpStatus?: number;
  responsePayload?: unknown;
  errorMessage?: string;
  messageId?: string | null;
  logId?: string;
}

function buildQuickMessage(eventType: string, variables: string[], fallback?: string): string {
  const name = variables[0] || "Customer";
  const booking = variables[1] || "";
  const pkg = variables[2] || "Hajj/Umrah";
  const amount = variables[3] || "";
  const balance = variables[4] || "";
  switch (eventType) {
    case "partial_payment":
      return `Dear ${name}, we have received Rs.${amount} for your booking ${booking} (${pkg}). Balance Rs.${balance} is pending. Contact us for any queries. - Al Burhan Travels`;
    case "payment_received":
      return `Dear ${name}, your payment of Rs.${amount} for booking ${booking} (${pkg}) has been received. Thank you! - Al Burhan Travels`;
    case "new_booking":
      return `Dear ${name}, your booking ${booking} for ${pkg} has been created. Our team will contact you shortly. - Al Burhan Travels`;
    case "booking_approved":
      return `Dear ${name}, your booking ${booking} for ${pkg} is confirmed! We look forward to serving you. - Al Burhan Travels`;
    case "booking_rejected":
      return `Dear ${name}, we regret that booking ${booking} for ${pkg} could not be processed. Please contact us. - Al Burhan Travels`;
    case "balance_reminder":
    case "pending_payment":
      return `Dear ${name}, your balance of Rs.${balance} is pending for booking ${booking}. Please clear it at the earliest. - Al Burhan Travels`;
    default:
      return fallback || `Dear ${name}, a notification regarding your booking ${booking}. - Al Burhan Travels`;
  }
}

async function sendQuickRoute(
  mobile: string,
  message: string,
  opts: {
    eventType: string;
    message?: string;
    bookingId?: string;
    customerId?: string;
    emergencyReason?: string;
    emergencyEnabledBy?: string;
    emergencyEnabledAt?: string;
    primaryDltFailureReason?: string;
    dltSenderIdAttempted?: string;
  }
): Promise<SMSResult> {
  const { apiKey, enabled, ex } = getConfig();
  if (!enabled || !apiKey) {
    return { ok: false, provider: "Fast2SMS", templateId: "quick_route_emergency", mobile, errorMessage: "Fast2SMS disabled or API key missing" };
  }
  const phone = toPhone(mobile);
  const reason = opts.emergencyReason || (ex.emergency_reason as string) || "Emergency fallback";
  const enabledBy = opts.emergencyEnabledBy || (ex.emergency_enabled_by as string) || "unknown";
  const enabledAt = opts.emergencyEnabledAt || (ex.emergency_enabled_at as string) || new Date().toISOString();
  const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodeURIComponent(message)}&numbers=${phone}&flash=0`;
  try {
    const resp = await withRetry(() => axios.get(url, { timeout: 12000 }), 2, 1500);
    const ok = resp.data?.return === true;
    const respMsg: string = resp.data?.message || "";
    if (ok) console.warn(`[SMS][${opts.eventType}] ⚠ EMERGENCY QUICK ROUTE USED — ${reason} (by ${enabledBy}) → ${phone}`);
    else console.error(`[SMS][${opts.eventType}] ❌ Emergency quick route failed: ${respMsg}`);
    // Full emergency audit payload — stored in notification_logs.provider_response
    const auditPayload = {
      ok,
      templateId: "quick_route_emergency",
      route: "quick_route_emergency",
      senderIdUsed: "Quick Route (no Sender ID)",
      dltSenderIdAttempted: opts.dltSenderIdAttempted || null,
      emergencyReason: reason,
      emergencyEnabledBy: enabledBy,
      emergencyEnabledAt: enabledAt,
      primaryRouteFailed: !!opts.primaryDltFailureReason,
      primaryDltFailureReason: opts.primaryDltFailureReason || null,
      providerResponse: resp.data,
      error: ok ? null : respMsg,
    };
    await logSMS({
      eventType: opts.eventType, mobile, templateId: "quick_route_emergency", message,
      status: ok ? "sent" : "failed", httpStatus: resp.status,
      responsePayload: auditPayload,
      errorMessage: ok ? undefined : respMsg,
      bookingId: opts.bookingId, customerId: opts.customerId,
    });
    return { ok, provider: "Fast2SMS", templateId: "quick_route_emergency", mobile, httpStatus: resp.status, responsePayload: auditPayload, errorMessage: ok ? undefined : respMsg };
  } catch (err: any) {
    const errorMessage = err?.response?.data?.message || err.message;
    console.error(`[SMS][${opts.eventType}] ❌ Emergency quick route error:`, errorMessage);
    await logSMS({ eventType: opts.eventType, mobile, templateId: "quick_route_emergency", message, status: "failed",
      responsePayload: { route: "quick_route_emergency", emergencyReason: reason, emergencyEnabledBy: enabledBy, primaryDltFailureReason: opts.primaryDltFailureReason || null },
      errorMessage, bookingId: opts.bookingId, customerId: opts.customerId });
    return { ok: false, provider: "Fast2SMS", templateId: "quick_route_emergency", mobile, errorMessage };
  }
}

async function sendDLT(
  mobile: string,
  templateId: string,
  variables: string[],
  opts: {
    eventType: string;
    message?: string;
    bookingId?: string;
    customerId?: string;
    customerName?: string;
    bookingNumber?: string;
    senderOverride?: string; // per-template sender ID (from senders map)
  }
): Promise<SMSResult> {
  const { apiKey, sender_id, enabled } = getConfig();

  if (!enabled) {
    return { ok: false, provider: "Fast2SMS", templateId, mobile, errorMessage: "Fast2SMS disabled in API Settings" };
  }
  if (!apiKey) {
    console.warn("[SMS] API key not configured for", opts.eventType, "→", mobile);
    return { ok: false, provider: "Fast2SMS", templateId, mobile, errorMessage: "Fast2SMS API key not configured" };
  }

  // Use per-template sender override if provided, otherwise fall back to global
  const effectiveSenderId = opts.senderOverride || sender_id;

  // ── POLICY VALIDATION — block before any HTTP call ──────────────────────────
  // 1. Sender ID must be in the approved DLT-registered list (loaded from DB)
  const approvedIds = await getApprovedSenderIds();
  if (!approvedIds.includes(effectiveSenderId)) {
    const msg = `SMS BLOCKED — sender_id "${effectiveSenderId}" is not in the approved list [${approvedIds.join(", ")}]. Add it in Admin → SMS Settings → Sender ID Management.`;
    console.error(`[SMS][${opts.eventType}] ⛔ ${msg}`);
    await logSMS({ eventType: opts.eventType, mobile, templateId, status: "failed", errorMessage: msg, bookingId: opts.bookingId, customerId: opts.customerId });
    return { ok: false, provider: "Fast2SMS", templateId, mobile, errorMessage: msg };
  }
  // 2. Route must be DLT (hardcoded — this guard catches any future drift)
  const ROUTE = "dlt";
  // 3. DLT template ID must be configured
  // Quick route is only allowed when admin explicitly enables Emergency SMS Fallback
  if (!templateId) {
    const { emergencyFallbackEnabled, ex: cfgEx } = getConfig();
    if (emergencyFallbackEnabled) {
      const reason = (cfgEx.emergency_reason as string) || "Emergency fallback enabled";
      console.warn(`[SMS][${opts.eventType}] ⚠ DLT template not configured — using EMERGENCY quick route (reason: ${reason})`);
      const qMsg = buildQuickMessage(opts.eventType, variables, opts.message);
      return sendQuickRoute(mobile, qMsg, {
        ...opts,
        emergencyReason: reason,
        emergencyEnabledBy: cfgEx.emergency_enabled_by as string,
        emergencyEnabledAt: cfgEx.emergency_enabled_at as string,
        primaryDltFailureReason: `DLT template not configured for event "${opts.eventType}"`,
        dltSenderIdAttempted: effectiveSenderId,
      });
    }
    const msg = `DLT template not configured for "${opts.eventType}". Set ${opts.eventType}_tid in Admin → DLT Template Manager. Quick route is disabled — enable Emergency SMS Fallback to use it temporarily.`;
    console.warn(`[SMS][${opts.eventType}] ⛔ ${msg}`);
    await logSMS({ eventType: opts.eventType, mobile, templateId: "not_configured", status: "failed", errorMessage: msg, bookingId: opts.bookingId, customerId: opts.customerId });
    return { ok: false, provider: "Fast2SMS", templateId: "not_configured", mobile, errorMessage: msg };
  }
  console.log(`[SMS][${opts.eventType}] ✔ Validation passed — sender=${effectiveSenderId} route=DLT template=${templateId} → ${mobile}`);

  const phone = toPhone(mobile);
  const vars = encodeURIComponent(variables.map(v => {
    const s = String(v);
    // URLs may be up to 100 chars; other variables capped at 30
    return (s.startsWith("http://") || s.startsWith("https://")) ? s.substring(0, 100) : s.substring(0, 30);
  }).join("|") + "|");
  const endpoint = `https://www.fast2sms.com/dev/bulkV2`;
  const url = `${endpoint}?authorization=${apiKey}&route=${ROUTE}&sender_id=${effectiveSenderId}&message=${templateId}&variables_values=${vars}&numbers=${phone}&flash=0`;
  const maskedUrl = url.replace(apiKey, `${apiKey.slice(0, 6)}***`);

  let httpStatus = 0;
  let responsePayload: unknown;

  try {
    const resp = await withRetry(() => axios.get(url, { timeout: 12000 }), 3, 1500);
    httpStatus = resp.status;
    responsePayload = resp.data;
    const ok = resp.data?.return === true;
    // 4. Detect "template not approved" from Fast2SMS error codes
    const respMsg: string = resp.data?.message || "";
    const isTemplateError = !ok && (
      respMsg.toLowerCase().includes("invalid message") ||
      respMsg.toLowerCase().includes("invalid template") ||
      respMsg.toLowerCase().includes("template not found") ||
      String(resp.data?.status_code) === "401"
    );
    const errorMessage = ok ? undefined
      : isTemplateError ? `Template not approved — ${respMsg}`
      : (respMsg || "DLT delivery failed");

    if (ok) {
      console.log(`[SMS][${opts.eventType}] ✅ Delivered via ${effectiveSenderId}/DLT → ${maskedUrl.slice(0, 80)}`);
    } else if (isTemplateError) {
      // DLT template rejected — log failure and STOP. Per production policy:
      // "If DLT rejects the SMS: Do NOT use Quick SMS. Do NOT use Emergency SMS."
      // WhatsApp and Email continue independently via their own channels.
      const dltFailMsg = `DLT template rejected by Fast2SMS: ${respMsg}`;
      console.warn(`[SMS][${opts.eventType}] ⛔ ${dltFailMsg} — NOT falling back to Quick Route (production policy)`);
      await logSMS({
        eventType: opts.eventType, mobile, templateId, senderId: effectiveSenderId,
        message: opts.message, status: "failed",
        httpStatus, responsePayload,
        errorMessage: dltFailMsg,
        bookingId: opts.bookingId, customerId: opts.customerId,
        customerName: opts.customerName, bookingNumber: opts.bookingNumber,
      });
      return { ok: false, provider: "Fast2SMS", templateId, mobile, httpStatus, responsePayload, errorMessage: dltFailMsg };
    } else {
      console.error(`[SMS][${opts.eventType}] ❌ Delivery failed — ${respMsg}`);
    }

    const messageId: string | null = (resp.data as any)?.request_id || null;
    if (ok && messageId) console.log(`[SMS][${opts.eventType}] Message ID: ${messageId}`);

    await logSMS({
      eventType: opts.eventType, mobile, templateId, senderId: effectiveSenderId,
      message: opts.message, status: ok ? "sent" : "failed",
      httpStatus, responsePayload, errorMessage, messageId,
      bookingId: opts.bookingId, customerId: opts.customerId,
      customerName: opts.customerName, bookingNumber: opts.bookingNumber,
    });

    return { ok, provider: "Fast2SMS", templateId, mobile, httpStatus, responsePayload, messageId };
  } catch (err: any) {
    const resp = err?.response;
    httpStatus = resp?.status || 0;
    responsePayload = resp?.data || { error: err.message };
    const errorMessage = resp?.data?.message || err.message;

    console.error(`[SMS][${opts.eventType}] ✗ after 3 retries for ${mobile}:`, errorMessage);

    await logSMS({
      eventType: opts.eventType, mobile, templateId, senderId: effectiveSenderId,
      message: opts.message, status: "failed",
      httpStatus, responsePayload, errorMessage,
      bookingId: opts.bookingId, customerId: opts.customerId,
      customerName: opts.customerName, bookingNumber: opts.bookingNumber,
      retryCount: 2,
    });

    return { ok: false, provider: "Fast2SMS", templateId, mobile, httpStatus, responsePayload, errorMessage };
  }
}

// ── SMSService — 11 public methods ───────────────────────────────────────────

export interface BookingCtx {
  mobile: string;
  customerName: string;
  bookingNumber: string;
  packageName?: string;
  bookingId?: string;
  customerId?: string;
}

export async function sendBookingCreated(ctx: BookingCtx): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.booking_created,
    [ctx.customerName, ctx.bookingNumber, ctx.packageName || "Hajj/Umrah"],
    { eventType: "new_booking", message: `Booking #${ctx.bookingNumber} created`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.booking_created }
  );
}

export async function sendBookingConfirmed(ctx: BookingCtx): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.booking_confirmed,
    [ctx.customerName, ctx.bookingNumber, ctx.packageName || "Hajj/Umrah"],
    { eventType: "booking_approved", message: `Booking #${ctx.bookingNumber} confirmed`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.booking_confirmed }
  );
}

export async function sendBookingRejected(ctx: BookingCtx & { reason?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.booking_rejected,
    [ctx.customerName, ctx.bookingNumber, ctx.reason || "Please contact us for details"],
    { eventType: "booking_rejected", message: `Booking #${ctx.bookingNumber} rejected`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.booking_rejected }
  );
}

export async function sendPaymentReceived(ctx: BookingCtx & { amount: string; invoiceNumber?: string; invoiceUrl?: string }): Promise<SMSResult> {
  const { tids, ex, senders } = getConfig();
  const vars: string[] = [ctx.customerName, ctx.bookingNumber, ctx.amount];
  if (ctx.invoiceUrl && ex.payment_url_in_sms === "1") vars.push(ctx.invoiceUrl);
  return sendDLT(
    ctx.mobile, tids.payment_received,
    vars,
    { eventType: "payment_received", message: `Payment ₹${ctx.amount} for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.payment_received }
  );
}

export async function sendPartialPaymentReceived(ctx: BookingCtx & { paidAmount: string; balanceAmount: string; invoiceUrl?: string }): Promise<SMSResult> {
  const { tids, ex, senders } = getConfig();
  const vars: string[] = [ctx.customerName, ctx.bookingNumber, ctx.packageName || "your package", ctx.paidAmount, ctx.balanceAmount];
  if (ctx.invoiceUrl && ex.payment_url_in_sms === "1") vars.push(ctx.invoiceUrl);
  return sendDLT(
    ctx.mobile, tids.partial_payment,
    vars,
    { eventType: "partial_payment", message: `Partial payment ₹${ctx.paidAmount} for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.partial_payment }
  );
}

export async function sendPendingPaymentReminder(ctx: BookingCtx & { balance: string; dueDate?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.pending_payment,
    [ctx.customerName, ctx.bookingNumber, ctx.balance],
    { eventType: "balance_reminder", message: `Balance ₹${ctx.balance} due for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.pending_payment }
  );
}

export async function sendInvoiceCreated(ctx: BookingCtx & { invoiceNumber?: string; amount?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.invoice_created,
    [ctx.customerName, ctx.bookingNumber, ctx.invoiceNumber || ctx.bookingNumber],
    { eventType: "invoice_generated", message: `Invoice for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.invoice_created }
  );
}

export async function sendFlightTicketIssued(ctx: BookingCtx & { flightNumber?: string; departureDate?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.ticket_issued,
    [ctx.customerName, ctx.bookingNumber, ctx.flightNumber || "TBA"],
    { eventType: "ticket_issued", message: `Ticket issued for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.ticket_issued }
  );
}

export async function sendVisaIssued(ctx: BookingCtx & { visaNumber?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.visa_issued,
    [ctx.customerName, ctx.bookingNumber, ctx.visaNumber || "Approved"],
    { eventType: "visa_ready", message: `Visa approved for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.visa_issued }
  );
}

export async function sendDepartureReminder(ctx: BookingCtx & { departureDate: string; flightNumber?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.departure_reminder,
    [ctx.customerName, ctx.bookingNumber, ctx.departureDate],
    { eventType: "departure_reminder", message: `Departure reminder for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.departure_reminder }
  );
}

export async function sendHotelVoucherIssued(ctx: BookingCtx & { hotelName?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.hotel_voucher,
    [ctx.customerName, ctx.bookingNumber, ctx.hotelName || "Your Hotel"],
    { eventType: "hotel_voucher", message: `Hotel voucher ready for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.hotel_voucher }
  );
}

export async function sendArrivalReminder(ctx: BookingCtx & { arrivalDate?: string; destination?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.arrival_reminder,
    [ctx.customerName, ctx.bookingNumber, ctx.arrivalDate || "As scheduled"],
    { eventType: "arrival_reminder", message: `Arrival welcome for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId, senderOverride: senders.arrival_reminder }
  );
}

export async function sendEidGreeting(ctx: { mobile: string; customerName: string; customerId?: string }): Promise<SMSResult> {
  const { tids, senders } = getConfig();
  return sendDLT(
    ctx.mobile, tids.eid_greeting,
    [ctx.customerName, "Al Burhan Tours & Travels", ""],
    { eventType: "feedback_request", message: `Eid greeting to ${ctx.customerName}`, customerId: ctx.customerId, senderOverride: senders.eid_greeting }
  );
}

export async function sendCustomSMS(ctx: {
  mobile: string;
  message: string;
  templateId?: string;
  variables?: string[];
  bookingId?: string;
  customerId?: string;
}): Promise<SMSResult> {
  // ⛔ POLICY: Quick/Promotional routes are BLOCKED. India DLT requires a pre-registered template.
  // If a templateId is provided, route through DLT. Otherwise block.
  const { tids } = getConfig();
  const tid = ctx.templateId || tids.custom;

  if (!tid) {
    const msg = `SMS BLOCKED — No DLT template ID configured for custom_sms to ${ctx.mobile}. Set custom_tid (or notify_template_id as fallback) in API Settings → Fast2SMS. Quick/Promotional routes are not permitted.`;
    console.error(`[SMS][custom_sms] ⛔ ${msg}`);
    await logSMS({
      eventType: "custom_sms", mobile: ctx.mobile, templateId: "not_configured",
      message: ctx.message.substring(0, 200), status: "failed", errorMessage: msg,
      bookingId: ctx.bookingId, customerId: ctx.customerId,
    });
    return { ok: false, provider: "Fast2SMS", templateId: "not_configured", mobile: ctx.mobile, errorMessage: msg };
  }

  // Route through DLT with the configured template ID
  const vars = ctx.variables?.length ? ctx.variables : [ctx.message.substring(0, 50)];
  return sendDLT(ctx.mobile, tid, vars, {
    eventType: "custom_sms",
    message: ctx.message,
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
  });
}

// ── Convenience: fire-and-forget with WhatsApp+Email fallback ─────────────────

export async function sendSMSWithFallback(
  ctx: BookingCtx,
  method: "booking_created" | "booking_confirmed" | "payment_received" | "pending_payment" | "invoice_created",
  extra?: Record<string, string>
): Promise<SMSResult> {
  const methods: Record<string, () => Promise<SMSResult>> = {
    booking_created:   () => sendBookingCreated(ctx),
    booking_confirmed: () => sendBookingConfirmed(ctx),
    payment_received:  () => sendPaymentReceived({ ...ctx, amount: extra?.amount || "0" }),
    pending_payment:   () => sendPendingPaymentReminder({ ...ctx, balance: extra?.balance || "0" }),
    invoice_created:   () => sendInvoiceCreated({ ...ctx, invoiceNumber: extra?.invoiceNumber }),
  };

  const fn = methods[method];
  if (!fn) return { ok: false, provider: "Fast2SMS", templateId: "unknown", mobile: ctx.mobile, errorMessage: "Unknown method" };

  const result = await fn();
  if (!result.ok) {
    console.warn(`[SMS] ${method} failed for ${ctx.mobile} → WhatsApp/Email fallback handled separately`);
  }
  return result;
}
