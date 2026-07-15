import cron from "node-cron";
import { pool } from "@workspace/db";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

const PROD_DOMAIN = "https://alburhantravels.com";

let remindersEnabled: boolean = process.env.PAYMENT_REMINDERS_ENABLED !== "false";

export function isRemindersEnabled(): boolean {
  return remindersEnabled;
}

export function setRemindersEnabled(enabled: boolean): void {
  remindersEnabled = enabled;
  console.log(`[PaymentReminder] Reminders ${enabled ? "ENABLED" : "DISABLED"} by admin`);
}

const ELIGIBLE_STATUSES = ["pending", "approved", "partially_paid"];

function fmt(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// Schedule: which days relative to due_date trigger a reminder
// negative = N days before; 0 = on due date; positive = N days after
// After due date: every 3 days (3, 6, 9, 12…)
function getReminderType(dueDate: Date | null): string | null {
  if (!dueDate) return null;

  const now = new Date();
  // Work in IST (UTC+5:30) to align with 9 AM IST cron
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(now.getTime() + istOffset);
  const dueDateIST = new Date(dueDate.getTime() + istOffset);

  const todayMidnight = Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate());
  const dueMidnight   = Date.UTC(dueDateIST.getUTCFullYear(), dueDateIST.getUTCMonth(), dueDateIST.getUTCDate());

  const diffDays = Math.round((dueMidnight - todayMidnight) / (24 * 60 * 60 * 1000));

  if (diffDays === 7)  return "7d";
  if (diffDays === 3)  return "3d";
  if (diffDays === 1)  return "1d";
  if (diffDays === 0)  return "due";
  // After due date: fire every 3 days (day 3, 6, 9…)
  if (diffDays < 0 && (-diffDays) % 3 === 0) return `post${-diffDays}d`;

  return null; // not a scheduled day
}

// Dedup: check if this reminder type was already sent in the last 20 hours
async function wasReminderSentForType(bookingId: string, reminderType: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const res = await pool.query(
    `SELECT 1 FROM reminder_logs
     WHERE booking_id = $1 AND notes LIKE $2 AND status = 'sent' AND sent_at > $3 LIMIT 1`,
    [bookingId, `type:${reminderType}%`, cutoff]
  );
  return res.rows.length > 0;
}

export async function sendReminderForBookingId(
  bookingId: string,
  triggeredBy: "cron" | "admin" | "intraday" = "admin",
  reminderTypeOverride?: string
): Promise<{ success: boolean; message: string }> {
  let res: Awaited<ReturnType<typeof pool.query>>;
  try {
    res = await pool.query(
      `SELECT id, booking_number, customer_name, customer_mobile, customer_email, customer_id,
              package_name, final_amount, paid_amount, preferred_departure_date AS due_date, invoice_number, status
       FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
  } catch (qErr: any) {
    console.error("[PaymentReminder] booking query failed:", qErr?.message);
    return { success: false, message: `DB error: ${qErr?.message}` };
  }
  const booking = res.rows[0];

  if (!booking) return { success: false, message: "Booking not found" };
  if (!booking.customer_mobile) return { success: false, message: "No mobile number on booking" };
  if (!ELIGIBLE_STATUSES.includes(booking.status)) {
    return { success: false, message: `Booking status "${booking.status}" is not eligible for reminder` };
  }

  const finalAmount = Number(booking.final_amount || 0);
  const paidAmount  = Number(booking.paid_amount  || 0);
  const remaining   = finalAmount - paidAmount;
  if (remaining <= 0) return { success: false, message: "No outstanding balance" };

  const payLink = booking.booking_number
    ? `${PROD_DOMAIN}/invoice/${booking.booking_number}`
    : PROD_DOMAIN;

  const reminderType = reminderTypeOverride
    || (triggeredBy === "admin" ? "manual"
      : (getReminderType(booking.due_date ? new Date(booking.due_date) : null) || "manual"));

  const notesSent   = `type:${reminderType} | Balance: ${fmt(remaining)}`;
  const notesFailed = `type:${reminderType} | Error: `;

  const logReminderChannel = async (ch: "sms" | "whatsapp", status: "sent" | "failed", extra?: string) => {
    try {
      const id = `rl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO reminder_logs (id, booking_id, channel, status, triggered_by, notes, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [id, booking.id, ch, status, triggeredBy, status === "sent" ? notesSent : `${notesFailed}${extra || "unknown"}`]
      );
    } catch (logErr: any) {
      console.error("[PaymentReminder] logReminderChannel failed:", logErr?.message);
    }
  };

  let notifyError: string | null = null;
  try {
    await fireNotificationEvent("balance_reminder", {
      customerName:  booking.customer_name  || "Pilgrim",
      customerMobile: booking.customer_mobile,
      customerEmail:  booking.customer_email ?? undefined,
      customerId:     booking.customer_id   ?? undefined,
      bookingId:      booking.id,
      bookingNumber:  booking.booking_number ?? undefined,
      packageName:    booking.package_name  ?? undefined,
      invoiceNumber:  booking.invoice_number ?? undefined,
      amount:         finalAmount,
      balanceAmount:  remaining,
      paidAmount:     finalAmount - remaining,
      description:    payLink,
    });
  } catch (err: any) {
    notifyError = err?.message || "Reminder send failed";
    console.error("[PaymentReminder] fireNotificationEvent error:", notifyError);
  }

  await Promise.all([
    logReminderChannel("sms",      notifyError ? "failed" : "sent", notifyError ?? undefined),
    logReminderChannel("whatsapp", notifyError ? "failed" : "sent", notifyError ?? undefined),
  ]);

  if (notifyError) {
    return { success: false, message: notifyError };
  }

  return {
    success: true,
    message: `Reminder sent to ${booking.customer_name} (${booking.customer_mobile}) — balance ${fmt(remaining)}`,
  };
}

async function getEligibleBookingsWithBalance() {
  const res = await pool.query(`
    SELECT id, booking_number, customer_name, customer_mobile, customer_email,
           final_amount, paid_amount, preferred_departure_date AS due_date
    FROM bookings
    WHERE status = ANY($1)
      AND CAST(COALESCE(final_amount,'0') AS numeric) > 0
      AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0
    LIMIT 300
  `, [ELIGIBLE_STATUSES]);
  return res.rows as Array<{
    id: string; booking_number: string; customer_name: string; customer_mobile: string;
    customer_email: string | null; final_amount: string; paid_amount: string; due_date: string | null;
  }>;
}

// ── Daily run at 9 AM IST ───────────────────────────────────────────────────
export async function runDailyReminders(): Promise<void> {
  if (!remindersEnabled) {
    console.log("[PaymentReminder] Reminders disabled — skipping");
    return;
  }
  console.log("[PaymentReminder] Starting daily reminder run…");
  try {
    const eligible = await getEligibleBookingsWithBalance();
    if (eligible.length === 0) {
      console.log("[PaymentReminder] No eligible bookings.");
      return;
    }

    let sentCount = 0, failCount = 0, skippedCount = 0;

    for (const booking of eligible) {
      const dueDate      = booking.due_date ? new Date(booking.due_date) : null;
      const reminderType = getReminderType(dueDate);

      // Not a scheduled reminder day for this booking
      if (!reminderType) { skippedCount++; continue; }

      // Already sent this type today
      const alreadySent = await wasReminderSentForType(booking.id, reminderType);
      if (alreadySent) { skippedCount++; continue; }

      console.log(`[PaymentReminder] Sending ${reminderType} reminder → ${booking.customer_name} (due: ${booking.due_date})`);
      const result = await sendReminderForBookingId(booking.id, "cron", reminderType);
      if (result.success) sentCount++; else failCount++;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[PaymentReminder] Done — sent:${sentCount} failed:${failCount} skipped:${skippedCount}`);
  } catch (err: any) {
    console.error("[PaymentReminder] Error:", err?.message);
  }
}

// ── Cron: 9:00 AM IST = 03:30 UTC ─────────────────────────────────────────
export function startPaymentReminderCron(): void {
  cron.schedule("30 3 * * *", () => {
    void runDailyReminders();
  }, { timezone: "UTC" });

  console.log("[PaymentReminder] Cron scheduled: daily at 9:00 AM IST (03:30 UTC)");
}

export async function getReminderHistory(bookingId: string) {
  const res = await pool.query(
    `SELECT * FROM reminder_logs WHERE booking_id = $1 ORDER BY sent_at DESC LIMIT 20`,
    [bookingId]
  );
  return res.rows;
}
