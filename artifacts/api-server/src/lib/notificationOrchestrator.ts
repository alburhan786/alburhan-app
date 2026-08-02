/**
 * notificationOrchestrator.ts
 * Central orchestrator for all customer notifications.
 *
 * Loads complete booking + customer context fresh from DB, normalises phone
 * numbers, resolves customer email from users table when missing from booking
 * record, then delegates to fireNotificationEvent.
 *
 * Usage:
 *   import { sendCustomerNotification } from "./notificationOrchestrator.js";
 *   await sendCustomerNotification({ event: "new_booking", bookingId: booking.id });
 */

import { pool } from "@workspace/db";
import { fireNotificationEvent, type EventType } from "./notificationEngine.js";

/** Strip non-digits and normalise Indian mobile numbers to 10 digits */
function normaliseMobile(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw.replace(/\D/g, "");
  // +91XXXXXXXXXX → 10-digit
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  // Any number longer than 10 digits — take last 10
  if (clean.length > 10) return clean.slice(-10);
  return clean;
}

export interface CustomerNotificationOpts {
  /** EventType string — forwarded to fireNotificationEvent */
  event: EventType | string;
  /** UUID of the row in the bookings table */
  bookingId: string;
  /**
   * Optional payment transaction UUID.
   * When provided, `amount`, `paymentMode`, and `paymentDate` are loaded from
   * the payment_transactions row and passed to fireNotificationEvent.
   */
  paymentId?: string;
  /** Override the payment amount (if paymentId is not provided) */
  amount?: number;
  /** Override paidAmount (cumulative, for partial-payment context) */
  paidAmount?: number;
  /** Override balanceAmount (final_amount − paidAmount) */
  balanceAmount?: number;
  /** Invoice number (overrides DB lookup) */
  invoiceNumber?: string;
  /** Invoice URL (overrides auto-generated link) */
  invoiceUrl?: string;
  /**
   * PDF / file attachments — delivered via WhatsApp document channel
   * after the template message is sent.
   */
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  /**
   * Extra context fields (e.g. visaNumber, flightNumber, hotelName, etc.).
   * Merged into the NotificationContext before dispatch.
   */
  extra?: Record<string, unknown>;
}

/**
 * sendCustomerNotification
 *
 * The single safe entry-point for all customer notification dispatches.
 * Never passes incomplete context — always reloads from DB.
 */
export async function sendCustomerNotification(opts: CustomerNotificationOpts): Promise<void> {
  const { event, bookingId, paymentId } = opts;
  const siteBase = process.env.SITE_URL || "https://alburhantravels.com";

  // ── 1. Load booking + customer + invoice from DB ───────────────────────────
  let row: Record<string, any>;
  try {
    const res = await pool.query(
      `SELECT
         b.id, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
         b.customer_id, b.package_name, b.final_amount, b.paid_amount, b.status,
         b.preferred_departure_date,
         -- Resolve email: booking row wins; fall back to users table
         COALESCE(NULLIF(b.customer_email, ''), u.email) AS resolved_email,
         u.mobile                                        AS user_mobile,
         i.invoice_number, i.id                         AS invoice_id
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );
    if (!res.rows[0]) {
      console.error(`[orchestrator] ❌ Booking not found: ${bookingId}`);
      return;
    }
    row = res.rows[0];
  } catch (err) {
    console.error(`[orchestrator] ❌ DB error loading booking ${bookingId}:`, err);
    return;
  }

  // ── 2. Optionally load payment transaction ────────────────────────────────
  let paymentRow: Record<string, any> | null = null;
  if (paymentId) {
    try {
      const pr = await pool.query(
        `SELECT amount, payment_mode, payment_date FROM payment_transactions WHERE id = $1 LIMIT 1`,
        [paymentId]
      );
      paymentRow = pr.rows[0] ?? null;
    } catch { /* non-fatal */ }
  }

  // ── 3. Resolve and validate required fields ───────────────────────────────
  const customerMobile = normaliseMobile(row.customer_mobile || row.user_mobile);
  const customerEmail  = (row.resolved_email || undefined) as string | undefined;

  if (!customerMobile) {
    console.error(`[orchestrator] ❌ No mobile for booking ${row.booking_number} — cannot dispatch ${event}`);
    return;
  }

  const finalAmount   = Number(row.final_amount || 0);
  const dbPaidAmount  = Number(row.paid_amount  || 0);
  const thisAmount    = opts.amount    ?? (paymentRow ? Number(paymentRow.amount) : dbPaidAmount);
  const paidAmount    = opts.paidAmount ?? dbPaidAmount;
  const balanceAmount = opts.balanceAmount ?? Math.max(0, finalAmount - dbPaidAmount);
  const invoiceNumber = opts.invoiceNumber || row.invoice_number || undefined;
  const invoiceUrl    = opts.invoiceUrl   || (row.booking_number ? `${siteBase}/invoice/${row.booking_number}` : undefined);

  // ── 4. Build notification context ─────────────────────────────────────────
  const ctx: Record<string, unknown> = {
    bookingId:     row.id,
    bookingNumber: row.booking_number,
    customerId:    row.customer_id  || undefined,
    customerName:  row.customer_name,
    customerMobile,
    customerEmail,
    packageName:   row.package_name || undefined,
    amount:        thisAmount,
    paidAmount,
    totalPaid:     paidAmount,
    balanceAmount,
    invoiceNumber,
    invoiceUrl,
    dashboardUrl:  `${siteBase}/customer/dashboard`,
    departureDate: row.preferred_departure_date || undefined,
    // Payment-mode label (e.g. "Online", "Bank Transfer")
    ...(paymentRow?.payment_mode ? {
      paymentMode: String(paymentRow.payment_mode)
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase()),
      paymentDate: paymentRow.payment_date
        ? new Date(paymentRow.payment_date).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : undefined,
    } : {}),
    // Caller-supplied extras (e.g. visaNumber, flightNumber, hotelName)
    ...(opts.extra || {}),
    // PDF attachments
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  };

  console.log(
    `[orchestrator] ▶ ${event} | booking=${row.booking_number} | ` +
    `mobile=${customerMobile} | email=${customerEmail || "none"} | ` +
    `amount=${thisAmount} | paid=${paidAmount} | balance=${balanceAmount}`
  );

  await fireNotificationEvent(event as EventType, ctx as any);
}
