import cron from "node-cron";
import { db, bookingsTable, reminderLogsTable } from "@workspace/db";
import { eq, inArray, and, gt, sql, desc } from "drizzle-orm";
import { sendWhatsApp } from "../lib/notifications.js";

const PROD_DOMAIN = "https://alburhantravels.com";

function fmt(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function buildReminderMessage(opts: {
  customerName: string;
  bookingNumber: string;
  remaining: number;
  payLink: string;
}): string {
  return (
    `Assalamu Alaikum ${opts.customerName},\n\n` +
    `This is a gentle reminder that your booking *#${opts.bookingNumber}* with Al Burhan Tours & Travels has an outstanding balance of *${fmt(opts.remaining)}*.\n\n` +
    `Pay securely online:\n${opts.payLink}\n\n` +
    `For any assistance, please contact us:\n+91 8989701701 / +91 9893989786\n\n` +
    `Jazak Allah Khair!\nAl Burhan Tours & Travels`
  );
}

export async function sendReminderForBookingId(
  bookingId: string,
  triggeredBy: "cron" | "admin" = "admin"
): Promise<{ success: boolean; message: string }> {
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  const booking = bookings[0];

  if (!booking) return { success: false, message: "Booking not found" };
  if (!booking.customerMobile) return { success: false, message: "No mobile number on booking" };
  if (!["approved", "partially_paid"].includes(booking.status)) {
    return { success: false, message: `Booking status "${booking.status}" is not eligible for reminder` };
  }

  const finalAmount = Number(booking.finalAmount || 0);
  const paidAmount = Number(booking.paidAmount || 0);
  const remaining = finalAmount - paidAmount;
  if (remaining <= 0) return { success: false, message: "No outstanding balance" };

  const payLink = `${PROD_DOMAIN}/pay/${booking.bookingNumber}`;
  const msg = buildReminderMessage({
    customerName: booking.customerName || "Pilgrim",
    bookingNumber: booking.bookingNumber || "",
    remaining,
    payLink,
  });

  const sent = await sendWhatsApp(booking.customerMobile, msg);
  const status = sent ? "sent" : "failed";

  await db.insert(reminderLogsTable).values({
    bookingId: booking.id,
    channel: "whatsapp",
    status,
    triggeredBy,
    notes: sent ? null : "WhatsApp delivery failed",
  });

  return {
    success: sent,
    message: sent
      ? `Reminder sent to ${booking.customerName} (${booking.customerMobile})`
      : "WhatsApp send failed — logged as failed",
  };
}

export async function runDailyReminders(): Promise<void> {
  console.log("[PaymentReminder] Starting daily reminder run…");
  try {
    const eligible = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          inArray(bookingsTable.status, ["approved", "partially_paid"]),
          gt(sql`CAST(${bookingsTable.finalAmount} AS numeric)`, sql`0`),
          gt(
            sql`CAST(${bookingsTable.finalAmount} AS numeric) - CAST(${bookingsTable.paidAmount} AS numeric)`,
            sql`0`
          )
        )
      );

    if (eligible.length === 0) {
      console.log("[PaymentReminder] No eligible bookings for reminders.");
      return;
    }

    const bookingIds = eligible.map(b => b.id);
    const recentCutoff = new Date(Date.now() - 23 * 60 * 60 * 1000);
    const recentLogs = await db
      .select({ bookingId: reminderLogsTable.bookingId })
      .from(reminderLogsTable)
      .where(
        and(
          inArray(reminderLogsTable.bookingId, bookingIds),
          eq(reminderLogsTable.status, "sent"),
          gt(reminderLogsTable.sentAt, recentCutoff)
        )
      );

    const recentlySentIds = new Set(recentLogs.map(l => l.bookingId));
    const toSend = eligible.filter(b => !recentlySentIds.has(b.id));

    console.log(`[PaymentReminder] ${eligible.length} eligible, ${recentlySentIds.size} already sent recently, ${toSend.length} to send`);

    let sentCount = 0;
    let failCount = 0;

    for (const booking of toSend) {
      const result = await sendReminderForBookingId(booking.id, "cron");
      if (result.success) sentCount++;
      else failCount++;
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[PaymentReminder] Done — sent: ${sentCount}, failed: ${failCount}`);
  } catch (err: any) {
    console.error("[PaymentReminder] Error during daily run:", err?.message);
  }
}

export function startPaymentReminderCron(): void {
  cron.schedule("0 10 * * *", () => {
    void runDailyReminders();
  }, {
    timezone: "Asia/Kolkata",
  });
  console.log("[PaymentReminder] Cron scheduled: daily at 10:00 AM IST");
}

export async function getReminderHistory(bookingId: string) {
  return db
    .select()
    .from(reminderLogsTable)
    .where(eq(reminderLogsTable.bookingId, bookingId))
    .orderBy(desc(reminderLogsTable.sentAt));
}
