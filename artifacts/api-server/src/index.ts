process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION] Server will NOT exit:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION] Server will NOT exit:", reason);
});

import app from "./app";
import { db, usersTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { ADMIN_MOBILES } from "./routes/auth.js";
import { startPaymentReminderCron } from "./jobs/paymentReminder.js";
import { startFeedbackReminderCron } from "./jobs/feedbackReminder.js";

async function runMigrations() {
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS barcode_id TEXT`);
    console.log("[Migration] barcode_id column ensured");
  } catch (err) {
    console.error("[Migration] barcode_id failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_id TEXT`);
    console.log("[Migration] family_id column ensured");
  } catch (err) {
    console.error("[Migration] family_id failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_relation TEXT`);
    console.log("[Migration] family_relation column ensured");
  } catch (err) {
    console.error("[Migration] family_relation failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_head BOOLEAN DEFAULT false`);
    console.log("[Migration] family_head column ensured");
  } catch (err) {
    console.error("[Migration] family_head failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_notes TEXT`);
    console.log("[Migration] room_notes column ensured");
  } catch (err) {
    console.error("[Migration] room_notes failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS attendance_events (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'other',
        scan_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] attendance_events table ensured");
  } catch (err) {
    console.error("[Migration] attendance_events failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        pilgrim_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'present',
        scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scanned_by TEXT
      )
    `);
    console.log("[Migration] attendance_logs table ensured");
  } catch (err) {
    console.error("[Migration] attendance_logs failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS scan_token TEXT`);
    await db.execute(sql`UPDATE attendance_events SET scan_token = gen_random_uuid()::text WHERE scan_token IS NULL`);
    await db.execute(sql`ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS scan_token_expires_at TIMESTAMPTZ`);
    await db.execute(sql`UPDATE attendance_events SET scan_token_expires_at = NOW() + INTERVAL '24 hours' WHERE scan_token_expires_at IS NULL`);
    console.log("[Migration] attendance_events.scan_token + expires_at ensured");
  } catch (err) {
    console.error("[Migration] attendance_events.scan_token failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS delete_audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        deleted_by TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        success BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] delete_audit_log table ensured");
  } catch (err) {
    console.error("[Migration] delete_audit_log failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reminder_logs (
        id SERIAL PRIMARY KEY,
        booking_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        status TEXT NOT NULL DEFAULT 'sent',
        triggered_by TEXT NOT NULL DEFAULT 'cron',
        notes TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] reminder_logs table ensured");
  } catch (err) {
    console.error("[Migration] reminder_logs failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pilgrims_families (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        family_name TEXT,
        head_pilgrim_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] pilgrims_families table ensured");
  } catch (err) {
    console.error("[Migration] pilgrims_families failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2)`);
    console.log("[Migration] bookings amount columns ensured");
  } catch (err) {
    console.error("[Migration] bookings amount columns failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS company_id TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS starting_serial_number INTEGER NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    console.log("[Migration] hajj_groups new columns ensured");
  } catch (err) {
    console.error("[Migration] hajj_groups new columns failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_id TEXT`);
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_hotel TEXT`);
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_number TEXT`);
    await db.execute(sql`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS bus_number TEXT`);
    console.log("[Migration] pilgrims room/bus columns ensured");
  } catch (err) {
    console.error("[Migration] pilgrims room/bus columns failed:", err);
  }
}

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;

if (Number.isNaN(port) || port <= 0) {
  console.error(`[Startup] Invalid PORT value "${rawPort}", defaulting to 8080`);
}

const finalPort = Number.isNaN(port) || port <= 0 ? 8080 : port;

app.listen(finalPort, async () => {
  console.log(`Server listening on port ${finalPort}`);

  await runMigrations();

  try {
    await db.update(usersTable)
      .set({ role: "admin" })
      .where(inArray(usersTable.mobile, ADMIN_MOBILES));
    console.log("[Startup] Admin roles synced for ADMIN_MOBILES");
  } catch (err) {
    console.error("[Startup] Failed to sync admin roles:", err);
  }

  startPaymentReminderCron();
  startFeedbackReminderCron();
});
