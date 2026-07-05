import axios from "axios";
import { pool } from "@workspace/db";
import { getCachedConfig } from "./apiSettingsProvider.js";

export interface RCSResult {
  ok: boolean;
  provider: "LeminAI";
  endpoint: string;
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string;
  errorMessage?: string;
  messageId?: string;
}

interface RCSConfig {
  enabled: boolean;
  apiKey: string;
  apiUrl: string;
  userId: string;
  brandName: string;
  templateId: string;
  booking_created_tid?: string;
  booking_confirmed_tid?: string;
  payment_received_tid?: string;
  pending_payment_tid?: string;
  invoice_created_tid?: string;
  ticket_issued_tid?: string;
  visa_issued_tid?: string;
  departure_reminder_tid?: string;
  arrival_reminder_tid?: string;
  eid_greeting_tid?: string;
}

function getConfig(): RCSConfig {
  const db = getCachedConfig("lemin");
  return {
    enabled: db.enabled !== false,
    apiKey: db.apiKey || process.env.LEMIN_API_KEY || "",
    apiUrl: db.apiUrl || "https://rcs.leminai.com/api/send/template",
    // apiKey IS the Developer API Key (user_id); fall back to legacy extra.user_id
    userId: db.apiKey || db.extra?.user_id || process.env.LEMIN_USER_ID || "",
    brandName: db.extra?.brand_name || "Al Burhan Tours & Travels",
    templateId: db.extra?.template_id || "1473",
    booking_created_tid: db.extra?.booking_created_tid,
    booking_confirmed_tid: db.extra?.booking_confirmed_tid,
    payment_received_tid: db.extra?.payment_received_tid,
    pending_payment_tid: db.extra?.pending_payment_tid,
    invoice_created_tid: db.extra?.invoice_created_tid,
    ticket_issued_tid: db.extra?.ticket_issued_tid,
    visa_issued_tid: db.extra?.visa_issued_tid,
    departure_reminder_tid: db.extra?.departure_reminder_tid,
    arrival_reminder_tid: db.extra?.arrival_reminder_tid,
    eid_greeting_tid: db.extra?.eid_greeting_tid,
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function getTid(cfg: RCSConfig, key: keyof RCSConfig): string {
  return (cfg[key] as string | undefined) || cfg.templateId;
}

async function logRCS(opts: {
  mobile: string;
  templateId: string;
  variables: Record<string, string>;
  status: "sent" | "failed";
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string;
  bookingId?: string;
  customerId?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status,
        provider_name, api_endpoint, http_status, request_payload,
        provider_response, error_code, sent_at, retry_count, booking_id, customer_id)
       VALUES (gen_random_uuid(),'rcs_event','rcs',$1,$2,$3,
        'LeminAI','https://rcs.leminai.com/api/send/template',$4,$5,$6,$7,NOW(),0,$8,$9)`,
      [
        opts.mobile,
        `RCS tpl:${opts.templateId} vars:${JSON.stringify(opts.variables)}`,
        opts.status,
        opts.httpStatus ?? null,
        JSON.stringify(opts.requestPayload),
        JSON.stringify(opts.responsePayload ?? null),
        opts.errorCode ?? null,
        opts.bookingId ?? null,
        opts.customerId ?? null,
      ]
    );
  } catch (e) {
    console.error("[rcs] logRCS failed:", e);
  }
}

async function sendRCSWithRetry(opts: {
  mobile: string;
  templateId: string;
  variables: Record<string, string>;
  bookingId?: string;
  customerId?: string;
}): Promise<RCSResult> {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, provider: "LeminAI", endpoint: cfg.apiUrl, errorMessage: "RCS not configured — set Lemin API key in API Settings" };
  }

  const phone = opts.mobile.replace(/\D/g, "").slice(-10);
  const endpoint = cfg.apiUrl;
  const reqPayload = {
    type: "single",
    dial_code: "+91",
    template: opts.templateId,
    phone,
    user_id: cfg.userId,
    variables: opts.variables,
  };

  let lastResult: RCSResult = { ok: false, provider: "LeminAI", endpoint, errorMessage: "Max retries exceeded" };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    try {
      const resp = await axios.post(endpoint, reqPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 12000,
      });
      const ok = resp.status >= 200 && resp.status < 300;
      lastResult = {
        ok,
        provider: "LeminAI",
        endpoint,
        httpStatus: resp.status,
        requestPayload: reqPayload,
        responsePayload: resp.data,
        messageId: resp.data?.message_id || resp.data?.id,
        errorMessage: ok ? undefined : (resp.data?.message || "RCS delivery failed"),
      };
      if (ok) {
        await logRCS({ ...opts, templateId: opts.templateId, status: "sent", httpStatus: resp.status, requestPayload: reqPayload, responsePayload: resp.data });
        return lastResult;
      }
    } catch (e: any) {
      const er = e?.response;
      lastResult = {
        ok: false, provider: "LeminAI", endpoint,
        httpStatus: er?.status || 0,
        requestPayload: reqPayload,
        responsePayload: er?.data || { error: e.message },
        errorCode: String(er?.data?.code || ""),
        errorMessage: er?.data?.message || e.message,
      };
    }
  }

  await logRCS({ ...opts, templateId: opts.templateId, status: "failed", httpStatus: lastResult.httpStatus, requestPayload: reqPayload, responsePayload: lastResult.responsePayload, errorCode: lastResult.errorCode });
  return lastResult;
}

export async function sendBookingCreated(opts: { mobile: string; customerName: string; bookingNumber: string; packageName?: string | null; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "booking_created_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, package: opts.packageName || "your package" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendBookingConfirmed(opts: { mobile: string; customerName: string; bookingNumber: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "booking_confirmed_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendPaymentReceived(opts: { mobile: string; customerName: string; bookingNumber: string; amount: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "payment_received_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, amount: opts.amount }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendPendingPaymentReminder(opts: { mobile: string; customerName: string; bookingNumber: string; balance: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "pending_payment_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, balance: opts.balance }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendInvoiceCreated(opts: { mobile: string; customerName: string; bookingNumber: string; invoiceNumber?: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "invoice_created_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, invoice: opts.invoiceNumber || "" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendFlightTicketIssued(opts: { mobile: string; customerName: string; bookingNumber: string; airline?: string; flightNumber?: string; departureDate?: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "ticket_issued_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, airline: opts.airline || "TBA", flight: opts.flightNumber || "TBA", date: opts.departureDate || "TBA" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendVisaIssued(opts: { mobile: string; customerName: string; bookingNumber: string; visaNumber?: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "visa_issued_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, visa: opts.visaNumber || "" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendDepartureReminder(opts: { mobile: string; customerName: string; bookingNumber: string; packageName?: string; departureDate?: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "departure_reminder_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, package: opts.packageName || "your journey", date: opts.departureDate || "scheduled date" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendArrivalReminder(opts: { mobile: string; customerName: string; bookingNumber: string; packageName?: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "arrival_reminder_tid"), variables: { name: opts.customerName, booking: opts.bookingNumber, package: opts.packageName || "your journey" }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendEidGreeting(opts: { mobile: string; customerName: string; bookingId?: string; customerId?: string }) {
  const cfg = getConfig();
  return sendRCSWithRetry({ mobile: opts.mobile, templateId: getTid(cfg, "eid_greeting_tid"), variables: { name: opts.customerName }, bookingId: opts.bookingId, customerId: opts.customerId });
}

export async function sendCustomRCS(opts: { mobile: string; templateId: string; variables: Record<string, string>; bookingId?: string; customerId?: string }) {
  return sendRCSWithRetry(opts);
}
