/**
 * notifyCustomer(eventType, bookingId) — Unified Notification Engine entry point.
 *
 * Loads booking + customer context from the DB and fires the event across every
 * enabled channel independently (WhatsApp/SMS/Email/RCS/Push) via fireNotificationEvent.
 * Every channel is attempted regardless of whether another channel failed or succeeded.
 * Failed attempts are logged and picked up by the retry queue.
 */
import { pool } from "@workspace/db";
import { fireNotificationEvent, type EventType, type NotificationContext } from "./notificationEngine.js";

export async function notifyCustomer(
  eventType: EventType,
  bookingId: string,
  extra: Partial<NotificationContext> = {}
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await pool.query(
      `SELECT id, booking_number, customer_id, customer_name, customer_mobile, customer_email,
              package_name, final_amount, paid_amount, invoice_number
       FROM bookings WHERE id=$1 LIMIT 1`,
      [bookingId]
    );
    const b = res.rows[0];
    if (!b) return { ok: false, reason: "Booking not found" };

    const finalAmount = Number(b.final_amount || 0);
    const paidAmount = Number(b.paid_amount || 0);

    const ctx: NotificationContext = {
      customerName: b.customer_name,
      customerMobile: b.customer_mobile,
      customerEmail: b.customer_email || undefined,
      customerId: b.customer_id || undefined,
      bookingId: b.id,
      bookingNumber: b.booking_number,
      packageName: b.package_name || undefined,
      amount: finalAmount,
      paidAmount,
      balanceAmount: Math.max(finalAmount - paidAmount, 0),
      invoiceNumber: b.invoice_number || undefined,
      ...extra,
    };

    await fireNotificationEvent(eventType, ctx);
    return { ok: true };
  } catch (err: any) {
    console.error(`[notifyCustomer] Failed for ${eventType}/${bookingId}:`, err?.message);
    return { ok: false, reason: err?.message || "Unknown error" };
  }
}

/**
 * Variant for events that are not tied to a booking (e.g. registration, OTP, login alert).
 * Caller supplies the full context directly.
 */
export async function notifyByContext(eventType: EventType, ctx: NotificationContext): Promise<{ ok: boolean; reason?: string }> {
  try {
    await fireNotificationEvent(eventType, ctx);
    return { ok: true };
  } catch (err: any) {
    console.error(`[notifyCustomer] notifyByContext failed for ${eventType}:`, err?.message);
    return { ok: false, reason: err?.message || "Unknown error" };
  }
}
