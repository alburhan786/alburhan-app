import axios from "axios";
import { pool } from "@workspace/db";
import { getCachedConfig } from "./apiSettingsProvider.js";

// ── Credentials & config ──────────────────────────────────────────────────────

function getConfig() {
  const db = getCachedConfig("fast2sms");
  const apiKey = db.apiKey || process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_XXL_API_KEY || "";
  const enabled = db.enabled !== false;
  const ex = db.extra || {};
  return {
    apiKey,
    enabled,
    sender_id: ex.sender_id || "ALBURH",
    // Per-event template IDs — fall back to generic notify_template_id
    notify_tid: ex.notify_template_id || "211277",
    tids: {
      booking_created:    ex.booking_created_tid    || ex.notify_template_id || "211277",
      booking_confirmed:  ex.booking_confirmed_tid  || ex.notify_template_id || "211277",
      payment_received:   ex.payment_received_tid   || ex.notify_template_id || "211277",
      partial_payment:    ex.partial_payment_tid    || ex.payment_received_tid || ex.notify_template_id || "211277",
      pending_payment:    ex.pending_payment_tid    || ex.notify_template_id || "211277",
      invoice_created:    ex.invoice_created_tid    || ex.notify_template_id || "211277",
      ticket_issued:      ex.ticket_issued_tid      || ex.notify_template_id || "211277",
      visa_issued:        ex.visa_issued_tid        || ex.notify_template_id || "211277",
      departure_reminder: ex.departure_reminder_tid || ex.notify_template_id || "211277",
      arrival_reminder:   ex.arrival_reminder_tid   || ex.notify_template_id || "211277",
      eid_greeting:       ex.eid_greeting_tid       || ex.notify_template_id || "211277",
      custom:             ex.custom_tid             || ex.notify_template_id || "211277",
    },
  };
}

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
  message?: string;
  status: "sent" | "failed";
  httpStatus?: number;
  responsePayload?: unknown;
  errorMessage?: string;
  bookingId?: string;
  customerId?: string;
  retryCount?: number;
}) {
  try {
    const id = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, channel, recipient, message, status,
        provider_response, provider_name, api_endpoint, http_status, request_payload,
        sent_at, retry_count)
       VALUES ($1,$2,$3,$4,'sms',$5,$6,$7,$8,'Fast2SMS',
               'https://www.fast2sms.com/dev/bulkV2',
               $9,$10,NOW(),$11)`,
      [
        id, data.eventType,
        data.customerId || null, data.bookingId || null,
        data.mobile,
        data.message || null,
        data.status,
        JSON.stringify({ ok: data.status === "sent", templateId: data.templateId, response: data.responsePayload, error: data.errorMessage }),
        data.httpStatus || null,
        JSON.stringify({ mobile: data.mobile, template_id: data.templateId, route: "dlt" }),
        data.retryCount ?? 0,
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
  logId?: string;
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

  const phone = toPhone(mobile);
  const vars = encodeURIComponent(variables.map(v => String(v).substring(0, 30)).join("|") + "|");
  const endpoint = `https://www.fast2sms.com/dev/bulkV2`;
  const url = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${sender_id}&message=${templateId}&variables_values=${vars}&numbers=${phone}&flash=0`;
  const maskedUrl = url.replace(apiKey, `${apiKey.slice(0, 6)}***`);

  let httpStatus = 0;
  let responsePayload: unknown;

  try {
    const resp = await withRetry(() => axios.get(url, { timeout: 12000 }), 3, 1500);
    httpStatus = resp.status;
    responsePayload = resp.data;
    const ok = resp.data?.return === true;

    console.log(`[SMS][${opts.eventType}] ${ok ? "✅" : "❌"} → ${maskedUrl.slice(0, 120)}`);

    await logSMS({
      eventType: opts.eventType, mobile, templateId,
      message: opts.message, status: ok ? "sent" : "failed",
      httpStatus, responsePayload,
      errorMessage: ok ? undefined : (resp.data?.message || "DLT delivery failed"),
      bookingId: opts.bookingId, customerId: opts.customerId,
    });

    return { ok, provider: "Fast2SMS", templateId, mobile, httpStatus, responsePayload };
  } catch (err: any) {
    const resp = err?.response;
    httpStatus = resp?.status || 0;
    responsePayload = resp?.data || { error: err.message };
    const errorMessage = resp?.data?.message || err.message;

    console.error(`[SMS][${opts.eventType}] ✗ after 3 retries for ${mobile}:`, errorMessage);

    await logSMS({
      eventType: opts.eventType, mobile, templateId,
      message: opts.message, status: "failed",
      httpStatus, responsePayload, errorMessage,
      bookingId: opts.bookingId, customerId: opts.customerId,
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
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.booking_created,
    [ctx.customerName, ctx.bookingNumber, ctx.packageName || "Hajj/Umrah"],
    { eventType: "new_booking", message: `Booking #${ctx.bookingNumber} created`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendBookingConfirmed(ctx: BookingCtx): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.booking_confirmed,
    [ctx.customerName, ctx.bookingNumber, ctx.packageName || "Hajj/Umrah"],
    { eventType: "booking_approved", message: `Booking #${ctx.bookingNumber} confirmed`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendPaymentReceived(ctx: BookingCtx & { amount: string; invoiceNumber?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.payment_received,
    [ctx.customerName, ctx.bookingNumber, ctx.amount],
    { eventType: "payment_received", message: `Payment ₹${ctx.amount} for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendPartialPaymentReceived(ctx: BookingCtx & { paidAmount: string; balanceAmount: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.partial_payment,
    [ctx.customerName, ctx.bookingNumber, ctx.packageName || "your package", ctx.paidAmount, ctx.balanceAmount],
    { eventType: "partial_payment", message: `Partial payment ₹${ctx.paidAmount} for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendPendingPaymentReminder(ctx: BookingCtx & { balance: string; dueDate?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.pending_payment,
    [ctx.customerName, ctx.bookingNumber, ctx.balance],
    { eventType: "balance_reminder", message: `Balance ₹${ctx.balance} due for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendInvoiceCreated(ctx: BookingCtx & { invoiceNumber?: string; amount?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.invoice_created,
    [ctx.customerName, ctx.bookingNumber, ctx.invoiceNumber || ctx.bookingNumber],
    { eventType: "invoice_generated", message: `Invoice for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendFlightTicketIssued(ctx: BookingCtx & { flightNumber?: string; departureDate?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.ticket_issued,
    [ctx.customerName, ctx.bookingNumber, ctx.flightNumber || "TBA"],
    { eventType: "ticket_issued", message: `Ticket issued for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendVisaIssued(ctx: BookingCtx & { visaNumber?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.visa_issued,
    [ctx.customerName, ctx.bookingNumber, ctx.visaNumber || "Approved"],
    { eventType: "visa_ready", message: `Visa approved for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendDepartureReminder(ctx: BookingCtx & { departureDate: string; flightNumber?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.departure_reminder,
    [ctx.customerName, ctx.bookingNumber, ctx.departureDate],
    { eventType: "departure_reminder", message: `Departure reminder for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendArrivalReminder(ctx: BookingCtx & { arrivalDate?: string; destination?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.arrival_reminder,
    [ctx.customerName, ctx.bookingNumber, ctx.arrivalDate || "As scheduled"],
    { eventType: "arrival_reminder", message: `Arrival welcome for #${ctx.bookingNumber}`, bookingId: ctx.bookingId, customerId: ctx.customerId }
  );
}

export async function sendEidGreeting(ctx: { mobile: string; customerName: string; customerId?: string }): Promise<SMSResult> {
  const { tids } = getConfig();
  return sendDLT(
    ctx.mobile, tids.eid_greeting,
    [ctx.customerName, "Al Burhan Tours & Travels", ""],
    { eventType: "feedback_request", message: `Eid greeting to ${ctx.customerName}`, customerId: ctx.customerId }
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
  const { tids, apiKey, sender_id, enabled } = getConfig();

  if (!enabled) return { ok: false, provider: "Fast2SMS", templateId: ctx.templateId || "custom", mobile: ctx.mobile, errorMessage: "Fast2SMS disabled" };
  if (!apiKey) return { ok: false, provider: "Fast2SMS", templateId: ctx.templateId || "custom", mobile: ctx.mobile, errorMessage: "Fast2SMS API key not configured" };

  // Custom SMS uses Quick route so free-form message is supported without a DLT template
  const phone = toPhone(ctx.mobile);
  const endpoint = "https://www.fast2sms.com/dev/bulkV2";
  const url = `${endpoint}?authorization=${apiKey}&route=q&message=${encodeURIComponent(ctx.message)}&numbers=${phone}&flash=0`;

  let httpStatus = 0;
  let responsePayload: unknown;

  try {
    const resp = await withRetry(() => axios.get(url, { timeout: 12000 }), 3, 1500);
    httpStatus = resp.status;
    responsePayload = resp.data;
    const ok = resp.data?.return === true;

    await logSMS({
      eventType: "custom_sms", mobile: ctx.mobile, templateId: ctx.templateId || "quick",
      message: ctx.message.substring(0, 200), status: ok ? "sent" : "failed",
      httpStatus, responsePayload,
      errorMessage: ok ? undefined : (resp.data?.message || "Delivery failed"),
      bookingId: ctx.bookingId, customerId: ctx.customerId,
    });

    return { ok, provider: "Fast2SMS", templateId: ctx.templateId || "quick", mobile: ctx.mobile, httpStatus, responsePayload };
  } catch (err: any) {
    const resp = err?.response;
    httpStatus = resp?.status || 0;
    responsePayload = resp?.data || { error: err.message };
    const errorMessage = resp?.data?.message || err.message;

    await logSMS({
      eventType: "custom_sms", mobile: ctx.mobile, templateId: ctx.templateId || "quick",
      message: ctx.message.substring(0, 200), status: "failed",
      httpStatus, responsePayload, errorMessage,
      bookingId: ctx.bookingId, customerId: ctx.customerId, retryCount: 2,
    });

    return { ok: false, provider: "Fast2SMS", templateId: ctx.templateId || "quick", mobile: ctx.mobile, httpStatus, responsePayload, errorMessage };
  }
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
