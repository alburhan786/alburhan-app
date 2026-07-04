import { pool } from "@workspace/db";
import { Response } from "express";
import { randomUUID } from "crypto";

export type AdminNotifType =
  | "booking_new"
  | "booking_approved"
  | "booking_rejected"
  | "booking_cancelled"
  | "payment_received";

export interface AdminNotifBody {
  bookingId?: string;
  bookingNumber?: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string | null;
  packageName?: string | null;
  finalAmount?: number | null;
  numberOfPilgrims?: number;
  isOffline?: boolean;
  amount?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}

export interface AdminNotification {
  id: string;
  type: AdminNotifType;
  title: string;
  body: AdminNotifBody;
  bookingId: string | null;
  isRead: boolean;
  createdAt: string;
}

// ── SSE Client Registry ───────────────────────────────────────────────────────
const sseClients = new Set<Response>();

export function registerSseClient(res: Response) {
  sseClients.add(res);
  console.log(`[AdminNotif] SSE client connected. Total: ${sseClients.size}`);
}

export function unregisterSseClient(res: Response) {
  sseClients.delete(res);
  console.log(`[AdminNotif] SSE client disconnected. Total: ${sseClients.size}`);
}

function broadcastSse(eventName: string, data: unknown) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ── DB Operations ─────────────────────────────────────────────────────────────
export async function createAdminNotification(
  type: AdminNotifType,
  title: string,
  body: AdminNotifBody,
): Promise<AdminNotification | null> {
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO admin_notifications (id, type, title, body, booking_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING id, type, title, body, booking_id, is_read, created_at`,
      [id, type, title, JSON.stringify(body), body.bookingId ?? null],
    );
    const row = result.rows[0];
    if (!row) return null;
    const notif: AdminNotification = {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      bookingId: row.booking_id,
      isRead: row.is_read,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
    broadcastSse("notification", notif);
    console.log(`[AdminNotif] Created + broadcast: [${type}] ${title}`);
    return notif;
  } catch (err: any) {
    console.error("[AdminNotif] createAdminNotification failed:", err?.message);
    return null;
  }
}

export async function getAdminNotifications(limit = 50, onlyUnread = false): Promise<AdminNotification[]> {
  try {
    const where = onlyUnread ? "WHERE is_read = false" : "";
    const result = await pool.query(
      `SELECT id, type, title, body, booking_id, is_read, created_at
       FROM admin_notifications
       ${where}
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      bookingId: row.booking_id,
      isRead: row.is_read,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  } catch (err: any) {
    console.error("[AdminNotif] getAdminNotifications failed:", err?.message);
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const result = await pool.query(`SELECT COUNT(*) FROM admin_notifications WHERE is_read = false`);
    return parseInt(result.rows[0]?.count ?? "0", 10);
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  try {
    await pool.query(`UPDATE admin_notifications SET is_read = true WHERE id = $1`, [id]);
    broadcastSse("read", { id });
    return true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await pool.query(`UPDATE admin_notifications SET is_read = true WHERE is_read = false`);
    broadcastSse("all_read", {});
    return true;
  } catch {
    return false;
  }
}

export async function deleteAdminNotification(id: string): Promise<boolean> {
  try {
    await pool.query(`DELETE FROM admin_notifications WHERE id = $1`, [id]);
    broadcastSse("deleted", { id });
    return true;
  } catch {
    return false;
  }
}

// ── Convenience trigger functions (called from booking routes) ─────────────────
export function notifyNewBooking(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  packageName?: string | null;
  finalAmount?: number | null;
  numberOfPilgrims: number;
  isOffline: boolean;
}) {
  const label = opts.isOffline ? "Offline Booking" : "New Booking";
  const title = `${label}: ${opts.customerName}`;
  createAdminNotification("booking_new", title, {
    bookingId: opts.bookingId,
    bookingNumber: opts.bookingNumber,
    customerName: opts.customerName,
    customerMobile: opts.customerMobile,
    customerEmail: opts.customerEmail,
    packageName: opts.packageName,
    finalAmount: opts.finalAmount,
    numberOfPilgrims: opts.numberOfPilgrims,
    isOffline: opts.isOffline,
  }).catch(console.error);
}

export function notifyBookingApproved(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
}) {
  createAdminNotification(
    "booking_approved",
    `Booking Approved: ${opts.customerName} (${opts.bookingNumber})`,
    {
      bookingId: opts.bookingId,
      bookingNumber: opts.bookingNumber,
      customerName: opts.customerName,
      customerMobile: opts.customerMobile,
    },
  ).catch(console.error);
}

export function notifyBookingRejected(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  reason?: string;
}) {
  createAdminNotification(
    "booking_rejected",
    `Booking Rejected: ${opts.customerName} (${opts.bookingNumber})`,
    {
      bookingId: opts.bookingId,
      bookingNumber: opts.bookingNumber,
      customerName: opts.customerName,
      customerMobile: opts.customerMobile,
      reason: opts.reason,
    },
  ).catch(console.error);
}

export function notifyPaymentReceived(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  amount: string;
}) {
  createAdminNotification(
    "payment_received",
    `Payment Received: ₹${opts.amount} from ${opts.customerName}`,
    {
      bookingId: opts.bookingId,
      bookingNumber: opts.bookingNumber,
      customerName: opts.customerName,
      customerMobile: opts.customerMobile,
      amount: opts.amount,
    },
  ).catch(console.error);
}

export function notifyBookingCancelled(opts: {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  reason?: string;
}) {
  createAdminNotification(
    "booking_cancelled",
    `Booking Cancelled: ${opts.customerName} (${opts.bookingNumber})`,
    {
      bookingId: opts.bookingId,
      bookingNumber: opts.bookingNumber,
      customerName: opts.customerName,
      customerMobile: opts.customerMobile,
      reason: opts.reason,
    },
  ).catch(console.error);
}
