import cron from "node-cron";
import { pool } from "@workspace/db";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

// ── Ticket Departure Reminder Cron ────────────────────────────────────────────
// Runs every hour. Finds group flights departing in exactly 72h, 24h, or 6h,
// and sends WhatsApp + SMS reminders to all assigned pilgrims.
// Deduplicates via reminder_logs.
// ─────────────────────────────────────────────────────────────────────────────

const SLOTS = [
  { hours: 72, label: "tdep_72h", message: "72 hours" },
  { hours: 24, label: "tdep_24h", message: "24 hours" },
  { hours: 6,  label: "tdep_6h",  message: "6 hours" },
] as const;

const SLOT_WINDOW_HOURS = 2;
const DEDUP_HOURS = 4;

async function wasReminderSent(flightId: string, pilgrimId: string, slot: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - DEDUP_HOURS * 3600_000);
    const res = await pool.query(
      `SELECT 1 FROM reminder_logs
       WHERE booking_id = $1 AND notes LIKE $2 AND status = 'sent' AND sent_at > $3 LIMIT 1`,
      [flightId, `${slot}|pilgrim:${pilgrimId}%`, cutoff]
    );
    return res.rows.length > 0;
  } catch { return false; }
}

async function logReminder(flightId: string, pilgrimId: string, slot: string, channel: "sms" | "whatsapp", status: "sent" | "failed") {
  try {
    const id = `tdr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await pool.query(
      `INSERT INTO reminder_logs (id, booking_id, channel, status, triggered_by, notes, sent_at)
       VALUES ($1,$2,$3,$4,'cron',$5,NOW())`,
      [id, flightId, channel, status, `${slot}|pilgrim:${pilgrimId}|Departure reminder`]
    );
  } catch { /* ignore */ }
}

async function runDepartureReminders() {
  console.log("[TicketDepartureReminder] Running departure reminder check...");
  let sent = 0;

  for (const slot of SLOTS) {
    const minHours = slot.hours - SLOT_WINDOW_HOURS;
    const maxHours = slot.hours + SLOT_WINDOW_HOURS;

    try {
      // Find flights departing in this slot window
      const flightRes = await pool.query(
        `SELECT gf.id, gf.flight_number, gf.airline, gf.departure_date, gf.departure_time,
                gf.pnr, gf.departure_airport, gf.arrival_airport, gf.pilgrims_assigned
         FROM group_flights gf
         WHERE gf.departure_date IS NOT NULL
           AND gf.departure_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           AND (gf.departure_date::date + COALESCE(gf.departure_time::time, '00:00'::time))
               BETWEEN NOW() + INTERVAL '${minHours} hours' AND NOW() + INTERVAL '${maxHours} hours'
           AND gf.status != 'cancelled'`
      );

      for (const flight of flightRes.rows) {
        const pilgrimIds: string[] = Array.isArray(flight.pilgrims_assigned)
          ? flight.pilgrims_assigned
          : [];

        if (pilgrimIds.length === 0) continue;

        // Get pilgrim details
        const pilgrimRes = await pool.query(
          `SELECT id, full_name, mobile_india FROM pilgrims
           WHERE id = ANY($1) AND mobile_india IS NOT NULL`,
          [pilgrimIds]
        );

        for (const pilgrim of pilgrimRes.rows) {
          const alreadySent = await wasReminderSent(flight.id, pilgrim.id, slot.label);
          if (alreadySent) continue;

          const depDateTime = `${flight.departure_date || ""}${flight.departure_time ? " at " + flight.departure_time : ""}`;

          try {
            await fireNotificationEvent("departure_reminder", {
              customerName: pilgrim.full_name,
              customerMobile: pilgrim.mobile_india,
              flightNumber: flight.flight_number || "—",
              airline: flight.airline || "—",
              departureDate: depDateTime,
              departureAirport: flight.departure_airport || "",
              pnr: flight.pnr || "",
            });
            await logReminder(flight.id, pilgrim.id, slot.label, "whatsapp", "sent");
            sent++;
          } catch (err) {
            await logReminder(flight.id, pilgrim.id, slot.label, "whatsapp", "failed");
            console.error(`[TicketDepartureReminder] Failed for pilgrim ${pilgrim.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[TicketDepartureReminder] Error for slot ${slot.label}:`, err);
    }
  }

  if (sent > 0) {
    console.log(`[TicketDepartureReminder] Done — sent ${sent} departure reminders`);
  }
}

export function startTicketDepartureReminderCron() {
  // Run immediately on startup (15s delay)
  setTimeout(() => runDepartureReminders().catch(() => {}), 15_000);

  // Then run every hour at :50 (offset from other crons)
  cron.schedule("50 * * * *", () => {
    runDepartureReminders().catch((err) => {
      console.error("[TicketDepartureReminder] Cron error:", err);
    });
  }, { timezone: "Asia/Kolkata" });

  console.log("[TicketDepartureReminder] Cron scheduled: hourly at :50 for 72h/24h/6h departure reminders");
}
