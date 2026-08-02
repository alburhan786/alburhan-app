// @ts-nocheck
/**
 * CENTRALIZED COMMUNICATION CONTEXT BUILDER
 * Loads all booking / customer / finance / document / travel / company data
 * from DB and returns one normalized CommunicationContext object used by
 * every channel before sending.
 *
 * This is the single authoritative source — no route file may assemble its
 * own partial context. Pass what you have; this loader fills the rest.
 */

import { pool } from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommunicationContext {
  // ── Customer
  customer_name: string;
  first_name: string;
  mobile: string;
  dial_code: string;
  email: string;
  nationality?: string;
  city?: string;

  // ── Booking
  booking_id?: string;
  booking_number?: string;
  booking_status?: string;
  package_name?: string;
  package_type?: string;
  departure_date?: string;
  return_date?: string;
  duration?: string;
  sharing_type?: string;

  // ── Finance
  package_amount?: string;
  discount_amount?: string;
  gst_amount?: string;
  tcs_amount?: string;
  grand_total?: string;
  amount_paid?: string;
  outstanding_amount?: string;
  payment_status?: string;
  payment_due_date?: string;
  payment_url?: string;
  invoice_number?: string;
  invoice_url?: string;
  receipt_number?: string;
  receipt_url?: string;

  // ── Agreement
  agreement_number?: string;
  agreement_url?: string;
  agreement_status?: string;

  // ── Documents
  document_type?: string;
  document_name?: string;
  document_url?: string;
  visa_url?: string;
  ticket_url?: string;
  voucher_url?: string;
  id_card_url?: string;

  // ── Travel
  airline?: string;
  flight_number?: string;
  flight_date?: string;
  reporting_time?: string;
  airport?: string;
  makkah_hotel?: string;
  madinah_hotel?: string;
  room_number?: string;
  bus_number?: string;

  // ── Company
  company_name: string;
  support_phone: string;
  support_email: string;
  website_url: string;
  whatsapp_number: string;

  // ── Extras (pass-through for templates)
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.FRONTEND_URL || process.env.VITE_API_URL || "";

function formatCurrency(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(val: unknown): string {
  if (!val) return "";
  try {
    return new Date(val as string).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
  } catch { return String(val); }
}

function normalizeMobile(mobile: unknown): string {
  if (!mobile) return "";
  return String(mobile).replace(/\D/g, "").slice(-10);
}

/** Company defaults — overridden by api_settings if present */
const COMPANY_DEFAULTS = {
  company_name: "Al Burhan Tours & Travels",
  support_phone: "+91 9893225590",
  support_email: "info@alburhantravels.com",
  website_url: "https://alburhantravels.com",
  whatsapp_number: "+91 9893225590",
};

// ── Main builder ──────────────────────────────────────────────────────────────

export interface BuildContextOpts {
  event: string;
  bookingId?: string;
  customerId?: string;
  paymentId?: string;
  invoiceId?: string;
  agreementId?: string;
  documentId?: string;
  /** Extra key/value overrides applied on top of DB-loaded data */
  overrides?: Record<string, unknown>;
}

export async function buildCommunicationContext(opts: BuildContextOpts): Promise<CommunicationContext> {
  const { bookingId, customerId, paymentId, invoiceId, agreementId, documentId, overrides = {} } = opts;

  // ── Parallel DB loads ──────────────────────────────────────────────────────
  const [bookingRow, companyRow, invoiceRow, agreementRow, paymentRow, documentRow] = await Promise.all([
    // Booking + customer + package + flight + hotel in one query
    bookingId
      ? pool.query(
          `SELECT b.*,
                  u.name AS customer_name, u.mobile AS customer_mobile,
                  u.email AS customer_email, u.nationality, u.city,
                  u.id AS user_id,
                  pkg.name AS package_name, pkg.package_type,
                  f.flight_number, f.airline, f.departure_date AS flight_date,
                  f.reporting_time, f.departure_airport AS airport,
                  h.hotel_name AS makkah_hotel,
                  h2.hotel_name AS madinah_hotel
           FROM bookings b
           LEFT JOIN users u ON u.id = b.customer_id
           LEFT JOIN packages pkg ON pkg.id = b.package_id
           LEFT JOIN flights f ON f.booking_id = b.id AND f.leg = 'outbound'
           LEFT JOIN hotels h ON h.booking_id = b.id AND lower(h.city) LIKE '%makkah%'
           LEFT JOIN hotels h2 ON h2.booking_id = b.id AND lower(h2.city) LIKE '%madinah%'
           WHERE b.id = $1 LIMIT 1`,
          [bookingId]
        ).then(r => r.rows[0] || null)
      : customerId
      ? pool.query(
          `SELECT b.*,
                  u.name AS customer_name, u.mobile AS customer_mobile,
                  u.email AS customer_email, u.nationality, u.city,
                  pkg.name AS package_name, pkg.package_type
           FROM bookings b
           LEFT JOIN users u ON u.id = b.customer_id
           LEFT JOIN packages pkg ON pkg.id = b.package_id
           WHERE b.customer_id = $1
           ORDER BY b.created_at DESC LIMIT 1`,
          [customerId]
        ).then(r => r.rows[0] || null)
      : null,

    // Company settings
    pool.query(
      `SELECT extra FROM api_settings WHERE provider = 'company' LIMIT 1`
    ).then(r => r.rows[0]?.extra || {}).catch(() => ({})),

    // Invoice
    invoiceId
      ? pool.query(`SELECT * FROM invoices WHERE id=$1 LIMIT 1`, [invoiceId]).then(r => r.rows[0] || null)
      : bookingId
      ? pool.query(`SELECT * FROM invoices WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [bookingId]).then(r => r.rows[0] || null)
      : null,

    // Agreement
    agreementId
      ? pool.query(`SELECT * FROM agreements WHERE id=$1 LIMIT 1`, [agreementId]).then(r => r.rows[0] || null)
      : bookingId
      ? pool.query(`SELECT * FROM agreements WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`, [bookingId]).then(r => r.rows[0] || null)
      : null,

    // Payment
    paymentId
      ? pool.query(`SELECT * FROM payment_transactions WHERE id=$1 LIMIT 1`, [paymentId]).then(r => r.rows[0] || null)
      : null,

    // Document
    documentId
      ? pool.query(`SELECT * FROM documents WHERE id=$1 LIMIT 1`, [documentId]).then(r => r.rows[0] || null)
      : null,
  ]);

  // ── Company ────────────────────────────────────────────────────────────────
  const company = {
    company_name: companyRow?.company_name || COMPANY_DEFAULTS.company_name,
    support_phone: companyRow?.support_phone || COMPANY_DEFAULTS.support_phone,
    support_email: companyRow?.support_email || COMPANY_DEFAULTS.support_email,
    website_url: companyRow?.website_url || COMPANY_DEFAULTS.website_url,
    whatsapp_number: companyRow?.whatsapp_number || COMPANY_DEFAULTS.whatsapp_number,
  };

  // ── Customer ───────────────────────────────────────────────────────────────
  const rawMobile = bookingRow?.customer_mobile || "";
  const mobile10 = normalizeMobile(rawMobile);
  const customerName = bookingRow?.customer_name || "";
  const firstName = customerName.split(" ")[0] || customerName;

  // ── Booking ────────────────────────────────────────────────────────────────
  const booking = bookingRow;
  const depDate = booking?.departure_date || booking?.preferred_departure_date;
  const retDate = booking?.return_date;

  let durationStr = "";
  if (depDate && retDate) {
    try {
      const d1 = new Date(depDate), d2 = new Date(retDate);
      const days = Math.round((d2.getTime() - d1.getTime()) / 86400000);
      durationStr = days > 0 ? `${days} days` : "";
    } catch {}
  }

  // ── Finance ────────────────────────────────────────────────────────────────
  const inv = invoiceRow;
  const pmt = paymentRow;

  const grandTotal = inv?.grand_total || booking?.total_amount || booking?.package_amount;
  const paidAmt = inv?.total_paid != null ? inv.total_paid : (booking?.paid_amount || 0);
  const outstandingAmt = inv?.outstanding_amount != null
    ? inv.outstanding_amount
    : (Number(grandTotal || 0) - Number(paidAmt));

  // Build payment URL: prefer stored, fall back to public booking payment page
  let paymentUrl = booking?.payment_link || "";
  if (!paymentUrl && booking?.id) {
    paymentUrl = `${BASE_URL}/pay/${booking.id}`;
  }

  // Invoice URL
  let invoiceUrl = inv?.pdf_url || inv?.file_url || "";
  if (!invoiceUrl && inv?.id) {
    invoiceUrl = `${BASE_URL}/api/invoices/${inv.id}/pdf`;
  }

  // Receipt
  let receiptRow: any = null;
  if (pmt?.id) {
    receiptRow = await pool.query(
      `SELECT * FROM receipts WHERE payment_id=$1 LIMIT 1`, [pmt.id]
    ).then(r => r.rows[0] || null).catch(() => null);
  }
  const receiptUrl = receiptRow?.pdf_url || (receiptRow?.id ? `${BASE_URL}/api/receipts/${receiptRow.id}/pdf` : "");

  // ── Agreement ──────────────────────────────────────────────────────────────
  const agr = agreementRow;
  let agreementUrl = agr?.agreement_url || agr?.pdf_url || agr?.file_url || "";
  if (!agreementUrl && agr?.id) {
    agreementUrl = `${BASE_URL}/api/agreements/${agr.id}/download`;
  }
  if (!agreementUrl && agr?.access_token) {
    agreementUrl = `${BASE_URL}/sign/${agr.access_token}`;
  }

  // ── Document ───────────────────────────────────────────────────────────────
  const doc = documentRow;
  const docType = doc?.document_type || doc?.type || "";
  const docUrl = doc?.file_url || doc?.gcs_url || doc?.url || "";
  let visaUrl = "", ticketUrl = "", voucherUrl = "", idCardUrl = "";
  if (docType === "visa") visaUrl = docUrl;
  else if (docType === "ticket" || docType === "flight_ticket") ticketUrl = docUrl;
  else if (docType === "voucher" || docType === "hotel_voucher") voucherUrl = docUrl;
  else if (docType === "id_card") idCardUrl = docUrl;

  // ── Room + Bus ─────────────────────────────────────────────────────────────
  let roomNumber = "";
  let busNumber = "";
  if (booking?.id) {
    const [roomRow, busRow] = await Promise.all([
      pool.query(
        `SELECT room_number FROM pilgrim_rooms WHERE booking_id=$1 LIMIT 1`, [booking.id]
      ).then(r => r.rows[0]?.room_number || "").catch(() => ""),
      pool.query(
        `SELECT bus_number FROM bus_allocations WHERE booking_id=$1 LIMIT 1`, [booking.id]
      ).then(r => r.rows[0]?.bus_number || "").catch(() => ""),
    ]);
    roomNumber = roomRow;
    busNumber = busRow;
  }

  // ── Compose final context ──────────────────────────────────────────────────
  const ctx: CommunicationContext = {
    // Customer
    customer_name: customerName,
    first_name: firstName,
    mobile: mobile10,
    dial_code: "+91",
    email: booking?.customer_email || "",
    nationality: booking?.nationality || "",
    city: booking?.city || "",

    // Booking
    booking_id: booking?.booking_number || booking?.id || "",
    booking_number: booking?.booking_number || "",
    booking_status: booking?.status || "",
    package_name: booking?.package_name || booking?.package || "",
    package_type: booking?.package_type || "",
    departure_date: depDate ? formatDate(depDate) : "",
    return_date: retDate ? formatDate(retDate) : "",
    duration: durationStr,
    sharing_type: booking?.sharing_type || booking?.accommodation_type || "",

    // Finance
    package_amount: formatCurrency(booking?.package_amount || booking?.base_amount),
    discount_amount: formatCurrency(inv?.discount_amount || booking?.discount_amount || 0),
    gst_amount: formatCurrency(inv?.gst_amount || 0),
    tcs_amount: formatCurrency(inv?.tcs_amount || 0),
    grand_total: formatCurrency(grandTotal),
    amount_paid: formatCurrency(paidAmt),
    outstanding_amount: formatCurrency(outstandingAmt),
    payment_status: inv?.payment_status || booking?.payment_status || "",
    payment_due_date: inv?.due_date ? formatDate(inv.due_date) : "",
    payment_url: paymentUrl,
    invoice_number: inv?.invoice_number || "",
    invoice_url: invoiceUrl,
    receipt_number: receiptRow?.receipt_number || "",
    receipt_url: receiptUrl,

    // Agreement
    agreement_number: agr?.agreement_number || agr?.id || "",
    agreement_url: agreementUrl,
    agreement_status: agr?.status || "",

    // Documents
    document_type: docType,
    document_name: doc?.name || doc?.document_name || docType,
    document_url: docUrl,
    visa_url: visaUrl,
    ticket_url: ticketUrl,
    voucher_url: voucherUrl,
    id_card_url: idCardUrl,

    // Travel
    airline: booking?.airline || "",
    flight_number: booking?.flight_number || "",
    flight_date: booking?.flight_date ? formatDate(booking.flight_date) : "",
    reporting_time: booking?.reporting_time || "",
    airport: booking?.airport || "",
    makkah_hotel: booking?.makkah_hotel || "",
    madinah_hotel: booking?.madinah_hotel || "",
    room_number: roomNumber,
    bus_number: busNumber,

    // Company
    ...company,

    // Legacy aliases (used by older templates)
    customerName: customerName,
    customerMobile: mobile10,
    customerEmail: booking?.customer_email || "",
    bookingId: booking?.booking_number || "",
    bookingNumber: booking?.booking_number || "",
    packageName: booking?.package_name || "",
    amount: Number(grandTotal || 0),
    paidAmount: Number(paidAmt),
    balanceAmount: Number(outstandingAmt),
    invoiceNumber: inv?.invoice_number || "",
    invoiceUrl: invoiceUrl,
    invoicePdfUrl: invoiceUrl,
    finalAmount: Number(grandTotal || 0),
  };

  // Apply caller overrides last
  Object.assign(ctx, overrides);

  return ctx;
}

// ── Validate that no critical field is a raw UUID, localhost URL, or unresolved placeholder ──

export function validateContext(ctx: CommunicationContext): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BAD_URL_RE = /localhost|127\.0\.0\.1|replit\.dev/i;
  const PLACEHOLDER_RE = /#![A-Za-z]+!#|\{\{[0-9]+\}\}/;

  if (!ctx.customer_name) issues.push("customer_name is blank");
  if (!ctx.mobile) issues.push("mobile is blank");

  // booking_id should be customer-facing booking number, not a UUID
  if (ctx.booking_id && UUID_RE.test(String(ctx.booking_id))) {
    issues.push(`booking_id is a raw UUID (${ctx.booking_id}) — customer should see booking number`);
  }

  // URLs must be HTTPS, not localhost/dev
  const urlFields = ["payment_url", "invoice_url", "receipt_url", "agreement_url", "document_url", "visa_url", "ticket_url"];
  for (const f of urlFields) {
    const v = ctx[f as keyof CommunicationContext];
    if (v && typeof v === "string" && v.length > 0) {
      if (BAD_URL_RE.test(v)) issues.push(`${f} contains localhost/dev URL: ${v}`);
      if (!v.startsWith("https://")) issues.push(`${f} is not HTTPS: ${v}`);
    }
  }

  // No unresolved placeholders in any string field
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string" && PLACEHOLDER_RE.test(v)) {
      issues.push(`Field "${k}" contains unresolved placeholder: ${v}`);
    }
  }

  return { valid: issues.length === 0, issues };
}
