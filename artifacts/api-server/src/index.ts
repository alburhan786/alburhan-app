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
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS attendance_events (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'other',
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
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);

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
