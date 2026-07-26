import cron from "node-cron";
import { pool } from "@workspace/db";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

// ── Agreement Reminder Cron ────────────────────────────────────────────────────
// Runs every hour. Finds fully-paid confirmed bookings where the agreement is
// still unsigned, and sends WhatsApp + SMS + Email reminders at:
//   • 24 h after agreement generated
//   • 48 h after agreement generated
//   • 72 h after agreement generated
// Stops automatically once agreement is signed.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = "https://alburhantravels.online";
const REMINDER_HOURS = [24, 48, 72] as const;
const SLOT_WINDOW_HOURS = 5;    // ±5 h around each slot
const DEDUP_WINDOW_HOURS = 20;  // Don't re-send within 20 h window per slot

let reminderEnabled = true;
export function setAgreementReminderEnabled(v: boolean) { reminderEnabled = v; }

async function wasReminderSent(bookingId: string, slot: number): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000);
    const res = await pool.query(
      `SELECT 1 FROM reminder_logs
       WHERE booking_id = $1 AND notes LIKE $2 AND status = 'sent' AND sent_at > $3 LIMIT 1`,
      [bookingId, `type:agr_${slot}h%`, cutoff]
    );
    return res.rows.length > 0;
  } catch { return false; }
}

async function logReminder(
  bookingId: string,
  channel: "sms" | "whatsapp",
  status: "sent" | "failed",
  slot: number,
  extra?: string
) {
  try {
    const id = `arl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const notes = status === "sent"
      ? `type:agr_${slot}h | Unsigned agreement reminder`
      : `type:agr_${slot}h | Error: ${extra || "unknown"}`;
    await pool.query(
      `INSERT INTO reminder_logs (id, booking_id, channel, status, triggered_by, notes, sent_at)
       VALUES ($1, $2, $3, $4, 'cron', $5, NOW())`,
      [id, bookingId, channel, status, notes]
    );
  } catch {}
}

export async function runAgreementReminders(): Promise<void> {
  if (!reminderEnabled) return;
  console.log("[AgreementReminder] ▶ Starting hourly run…");

  try {
    const now = new Date();

    // Find confirmed bookings (fully paid) with pending_signature agreements
    // created within 76 h window (24 h already elapsed minimum, 76 h max so we stop)
    const res = await pool.query(`
      SELECT
        b.id                     AS booking_id,
        b.booking_number,
        b.customer_name,
        b.customer_mobile,
        b.customer_email,
        b.customer_id,
        b.package_name,
        a.id                     AS agreement_id,
        a.agreement_number,
        a.created_at             AS agr_created_at
      FROM bookings b
      JOIN agreements a
        ON a.booking_id = b.id
       AND a.status = 'pending_signature'
      WHERE b.status IN ('confirmed', 'approved', 'partially_paid')
        AND CAST(COALESCE(b.final_amount, '0') AS numeric) > 0
        AND (
          CAST(COALESCE(b.paid_amount, '0') AS numeric)
            >= CAST(COALESCE(b.final_amount, '0') AS numeric) * 0.9
          OR b.status = 'confirmed'
        )
        AND a.created_at < NOW() - INTERVAL '20 hours'
        AND a.created_at > NOW() - INTERVAL '76 hours'
      ORDER BY a.created_at ASC
      LIMIT 200
    `);

    if (res.rows.length === 0) {
      console.log("[AgreementReminder] No unsigned eligible agreements.");
      return;
    }

    let sent = 0, skipped = 0;

    for (const row of res.rows) {
      const agrCreated = new Date(row.agr_created_at);
      const hoursElapsed = (now.getTime() - agrCreated.getTime()) / 3600_000;

      // Which slot does this fall into?
      let slot: typeof REMINDER_HOURS[number] | null = null;
      for (const h of REMINDER_HOURS) {
        if (hoursElapsed >= h && hoursElapsed < h + SLOT_WINDOW_HOURS) {
          slot = h; break;
        }
      }
      if (!slot) { skipped++; continue; }

      // Dedup check
      if (await wasReminderSent(row.booking_id, slot)) { skipped++; continue; }

      const agreementUrl = `${SITE}/agreement/${row.agreement_id}/sign`;

      let notifyError: string | null = null;
      try {
        await fireNotificationEvent("agreement_ready", {
          customerName:    row.customer_name   || "Valued Customer",
          customerMobile:  row.customer_mobile,
          customerEmail:   row.customer_email  ?? undefined,
          customerId:      row.customer_id     ?? undefined,
          bookingId:       row.booking_id,
          bookingNumber:   row.booking_number  ?? undefined,
          packageName:     row.package_name    ?? undefined,
          agreementNumber: row.agreement_number,
          agreementUrl,
        } as any);
      } catch (e: any) {
        notifyError = e?.message || "unknown";
        console.error(`[AgreementReminder] notify failed for ${row.booking_number}:`, notifyError);
      }

      const status = notifyError ? "failed" : "sent";
      await logReminder(row.booking_id, "whatsapp", status, slot, notifyError ?? undefined);
      await logReminder(row.booking_id, "sms",      status, slot, notifyError ?? undefined);

      if (!notifyError) {
        sent++;
        console.log(`[AgreementReminder] ✅ ${slot}h reminder → ${row.customer_name} (${row.booking_number})`);
      }

      await new Promise(r => setTimeout(r, 300)); // rate-limit
    }

    console.log(`[AgreementReminder] Done — sent:${sent} skipped:${skipped}`);
  } catch (err: any) {
    console.error("[AgreementReminder] Fatal error:", err?.message);
  }
}

// Run at :45 past every hour (offset from paymentReminder at :30 UTC = 9 AM IST)
export function startAgreementReminderCron(): void {
  cron.schedule("45 * * * *", () => {
    void runAgreementReminders();
  }, { timezone: "UTC" });

  // Run once immediately on startup (catches any missed reminders)
  setTimeout(() => runAgreementReminders().catch(() => {}), 10_000);

  console.log("[AgreementReminder] Cron scheduled: hourly at :45");
}
