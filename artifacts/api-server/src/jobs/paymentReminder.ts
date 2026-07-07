import cron from "node-cron";
import { db, bookingsTable, reminderLogsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, inArray, and, gt, sql, desc } from "drizzle-orm";
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

const ELIGIBLE_STATUSES = ["pending", "approved", "partially_paid"] as const;

function fmt(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export async function sendReminderForBookingId(
  bookingId: string,
  triggeredBy: "cron" | "admin" | "intraday" = "admin"
): Promise<{ success: boolean; message: string }> {
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  const booking = bookings[0];

  if (!booking) return { success: false, message: "Booking not found" };
  if (!booking.customerMobile) return { success: false, message: "No mobile number on booking" };
  if (!(ELIGIBLE_STATUSES as readonly string[]).includes(booking.status)) {
    return { success: false, message: `Booking status "${booking.status}" is not eligible for reminder` };
  }

  const finalAmount = Number(booking.finalAmount || 0);
  const paidAmount = Number(booking.paidAmount || 0);
  const remaining = finalAmount - paidAmount;
  if (remaining <= 0) return { success: false, message: "No outstanding balance" };

  const payLink = `${PROD_DOMAIN}/pay/${booking.bookingNumber}`;

  try {
    // Fire ALL 4 channels via the central notification engine
    await fireNotificationEvent("balance_reminder", {
      customerName: booking.customerName || "Pilgrim",
      customerMobile: booking.customerMobile,
      customerEmail: booking.customerEmail ?? undefined,
      customerId: booking.customerId ?? undefined,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber ?? undefined,
      packageName: booking.packageName ?? undefined,
      amount: finalAmount,
      balanceAmount: remaining,
      description: payLink,
    });

    await db.insert(reminderLogsTable).values({
      bookingId: booking.id,
      channel: "all",
      status: "sent",
      triggeredBy,
      notes: `All-channel reminder sent. Balance: ${fmt(remaining)}`,
    });

    return {
      success: true,
      message: `Reminder sent (WA+SMS+RCS+Email) to ${booking.customerName} (${booking.customerMobile}) — balance ${fmt(remaining)}`,
    };
  } catch (err: any) {
    await db.insert(reminderLogsTable).values({
      bookingId: booking.id,
      channel: "all",
      status: "failed",
      triggeredBy,
      notes: err?.message || "Unknown error",
    });
    return { success: false, message: err?.message || "Reminder send failed" };
  }
}

async function getEligibleBookingsWithBalance(): Promise<Array<{
  id: string; bookingNumber: string; customerName: string; customerMobile: string;
  customerEmail: string | null; finalAmount: string; paidAmount: string; dueDate: string | null;
}>> {
  const res = await pool.query(`
    SELECT id, booking_number, customer_name, customer_mobile, customer_email,
           final_amount, paid_amount, due_date
    FROM bookings
    WHERE status = ANY($1)
      AND CAST(COALESCE(final_amount,'0') AS numeric) > 0
      AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0
    LIMIT 200
  `, [ELIGIBLE_STATUSES]);
  return res.rows;
}

async function wasReminderRecentlySent(bookingId: string, windowHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const recent = await db
    .select({ bookingId: reminderLogsTable.bookingId })
    .from(reminderLogsTable)
    .where(
      and(
        eq(reminderLogsTable.bookingId, bookingId),
        eq(reminderLogsTable.status, "sent"),
        gt(reminderLogsTable.sentAt, cutoff)
      )
    )
    .limit(1);
  return recent.length > 0;
}

// ── Daily run (30/15/7/3/1 day reminders) ──────────────────────────────────
export async function runDailyReminders(): Promise<void> {
  if (!remindersEnabled) {
    console.log("[PaymentReminder] Reminders are disabled — skipping run");
    return;
  }
  console.log("[PaymentReminder] Starting daily reminder run…");
  try {
    const eligible = await getEligibleBookingsWithBalance();
    if (eligible.length === 0) {
      console.log("[PaymentReminder] No eligible bookings for reminders.");
      return;
    }

    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const booking of eligible) {
      // Dedup: skip if sent within last 23 hours (daily run)
      const recentlySent = await wasReminderRecentlySent(booking.id, 23);
      if (recentlySent) { skippedCount++; continue; }

      const result = await sendReminderForBookingId(booking.id, "cron");
      if (result.success) sentCount++; else failCount++;
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[PaymentReminder] Daily done — sent: ${sentCount}, failed: ${failCount}, skipped (recent): ${skippedCount}`);
  } catch (err: any) {
    console.error("[PaymentReminder] Error during daily run:", err?.message);
  }
}

// ── Intraday run (12h / 6h / 2h reminders before due_date) ──────────────────
export async function runIntradayReminders(): Promise<void> {
  if (!remindersEnabled) return;

  const WINDOWS = [
    { hours: 12, label: "12h" },
    { hours: 6,  label: "6h" },
    { hours: 2,  label: "2h" },
  ];

  for (const { hours, label } of WINDOWS) {
    try {
      // Find bookings whose due_date falls within the next `hours` window (±30 min tolerance)
      const res = await pool.query(`
        SELECT id, booking_number, customer_name, customer_mobile, customer_email,
               final_amount, paid_amount, due_date
        FROM bookings
        WHERE status = ANY($1)
          AND due_date IS NOT NULL
          AND due_date::timestamptz BETWEEN NOW() + interval '${hours} hours' - interval '30 minutes'
                                        AND NOW() + interval '${hours} hours' + interval '30 minutes'
          AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0
        LIMIT 50
      `, [ELIGIBLE_STATUSES]);

      for (const booking of res.rows) {
        // Dedup: skip if sent within last 1 hour for intraday
        const recentlySent = await wasReminderRecentlySent(booking.id, 1);
        if (recentlySent) continue;

        console.log(`[PaymentReminder][${label}] Sending intraday reminder to ${booking.customer_name}`);
        await sendReminderForBookingId(booking.id, "intraday");
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err: any) {
      console.error(`[PaymentReminder][${label}] Error:`, err?.message);
    }
  }
}

// ── Cron schedule ─────────────────────────────────────────────────────────
export function startPaymentReminderCron(): void {
  // Daily run at 10:00 AM IST (04:30 UTC)
  cron.schedule("30 4 * * *", () => {
    void runDailyReminders();
  }, { timezone: "UTC" });

  // Intraday run every hour — catches 12h/6h/2h windows relative to due_date
  cron.schedule("0 * * * *", () => {
    void runIntradayReminders();
  }, { timezone: "UTC" });

  console.log("[PaymentReminder] Cron scheduled: daily at 10:00 AM IST + intraday every hour");
}

export async function getReminderHistory(bookingId: string) {
  return db
    .select()
    .from(reminderLogsTable)
    .where(eq(reminderLogsTable.bookingId, bookingId))
    .orderBy(desc(reminderLogsTable.sentAt));
}
