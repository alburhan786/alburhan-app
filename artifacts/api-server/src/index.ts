// Load .env file before anything else (needed for VPS where PM2 doesn't auto-load .env)
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: "/var/www/alburhan/.env" });
dotenvConfig(); // also try local .env as fallback

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION] Server will NOT exit:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION] Server will NOT exit:", reason);
});

import app from "./app";
import { db, pool, usersTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { ADMIN_MOBILES } from "./routes/auth.js";
import { startPaymentReminderCron } from "./jobs/paymentReminder.js";
import { startFeedbackReminderCron } from "./jobs/feedbackReminder.js";

async function runMigrations() {
  // Session table — must exist BEFORE connect-pg-simple initializes
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      ) WITH (OIDS=FALSE)
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
    console.log("[Migration] session table ensured");
  } catch (err) {
    console.error("[Migration] session table failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    console.log("[Migration] users columns ensured");
  } catch (err) {
    console.error("[Migration] users columns failed:", err);
  }
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
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_number TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS number_of_pilgrims INTEGER NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS online_paid_amount NUMERIC(12,2) DEFAULT 0`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_number TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_type TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS traveller_details_status TEXT NOT NULL DEFAULT 'not_submitted'`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_name TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_email TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pilgrims JSONB DEFAULT '[]'`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS preferred_departure_date TEXT`);
    console.log("[Migration] bookings columns ensured");
  } catch (err) {
    console.error("[Migration] bookings columns failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS company_id TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS starting_serial_number INTEGER NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS hotels JSONB DEFAULT '{}'`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS notes TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS flight_number TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS maktab_number TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS departure_date TEXT`);
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS return_date TEXT`);
    console.log("[Migration] hajj_groups all columns ensured");
  } catch (err) {
    console.error("[Migration] hajj_groups columns failed:", err);
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
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        group_id TEXT,
        category TEXT NOT NULL,
        vendor TEXT,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        date TEXT NOT NULL,
        paid_by TEXT,
        payment_method TEXT DEFAULT 'cash',
        invoice_number TEXT,
        attachment_url TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] expenses table ensured");
  } catch (err) {
    console.error("[Migration] expenses table failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS group_flights (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        flight_type TEXT NOT NULL DEFAULT 'outbound',
        airline TEXT,
        flight_number TEXT,
        pnr TEXT,
        departure_airport TEXT,
        arrival_airport TEXT,
        departure_date TEXT,
        departure_time TEXT,
        arrival_date TEXT,
        arrival_time TEXT,
        baggage_allowance TEXT,
        meal_type TEXT,
        status TEXT DEFAULT 'scheduled',
        notes TEXT,
        pilgrims_assigned JSONB DEFAULT '[]',
        ticket_numbers JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] group_flights table ensured");
  } catch (err) {
    console.error("[Migration] group_flights table failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_by TEXT`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`UPDATE bookings SET is_deleted = true WHERE deleted_at IS NOT NULL AND is_deleted = false`);
    console.log("[Migration] bookings soft-delete columns ensured");
  } catch (err) {
    console.error("[Migration] bookings soft-delete columns failed:", err);
  }
  try {
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS bank_name TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS received_by TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS edited_by TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS deleted_by TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS deletion_reason TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`);
    console.log("[Migration] payment_transactions soft-delete + extra columns ensured");
  } catch (err) {
    console.error("[Migration] payment_transactions columns failed:", err);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_audit_logs (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_amount NUMERIC(12,2),
        new_amount NUMERIC(12,2),
        old_mode TEXT,
        new_mode TEXT,
        old_date TEXT,
        new_date TEXT,
        changed_by TEXT,
        changed_by_name TEXT,
        change_reason TEXT,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] payment_audit_logs table ensured");
  } catch (err) {
    console.error("[Migration] payment_audit_logs failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_audit_logs (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        action TEXT NOT NULL,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT
      )
    `);
    console.log("[Migration] booking_audit_logs table ensured");
  } catch (err) {
    console.error("[Migration] booking_audit_logs failed:", err);
  }
  // Phase 5: Hotel Management
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hotels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT,
        stars INTEGER,
        group_id TEXT,
        check_in_date TEXT,
        check_out_date TEXT,
        total_rooms INTEGER,
        contact_phone TEXT,
        notes TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ,
        deleted_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hotel_rooms (
        id TEXT PRIMARY KEY,
        hotel_id TEXT NOT NULL,
        room_number TEXT NOT NULL,
        floor TEXT,
        capacity INTEGER NOT NULL DEFAULT 2,
        bed_type TEXT DEFAULT 'Double',
        notes TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pilgrim_room_assignments (
        id TEXT PRIMARY KEY,
        hotel_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        pilgrim_id TEXT NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(pilgrim_id, hotel_id)
      )
    `);
    console.log("[Migration] hotels, hotel_rooms, pilgrim_room_assignments tables ensured");
  } catch (err) {
    console.error("[Migration] hotels tables failed:", err);
  }
  // Phase 6: Bus Management
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS buses (
        id TEXT PRIMARY KEY,
        bus_number TEXT NOT NULL,
        group_id TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 45,
        vehicle_type TEXT DEFAULT 'Coach',
        driver_name TEXT,
        driver_mobile TEXT,
        route_description TEXT,
        notes TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pilgrim_bus_assignments (
        id TEXT PRIMARY KEY,
        bus_id TEXT NOT NULL,
        pilgrim_id TEXT NOT NULL,
        seat_number TEXT,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(bus_id, pilgrim_id)
      )
    `);
    console.log("[Migration] buses, pilgrim_bus_assignments tables ensured");
  } catch (err) {
    console.error("[Migration] buses tables failed:", err);
  }
  // Phase 7: Medical Module
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_cases (
        id TEXT PRIMARY KEY,
        pilgrim_id TEXT NOT NULL,
        group_id TEXT,
        case_type TEXT NOT NULL DEFAULT 'general',
        description TEXT,
        severity TEXT NOT NULL DEFAULT 'low',
        status TEXT NOT NULL DEFAULT 'open',
        handled_by TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] medical_cases table ensured");
  } catch (err) {
    console.error("[Migration] medical_cases table failed:", err);
  }
  // Phase 8: Visa Tracking columns on pilgrims
  try {
    await pool.query(`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_status TEXT`);
    await pool.query(`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_type TEXT`);
    await pool.query(`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_applied_date TEXT`);
    await pool.query(`ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_received_date TEXT`);
    console.log("[Migration] visa tracking columns ensured");
  } catch (err) {
    console.error("[Migration] visa tracking columns failed:", err);
  }
  try {
    await pool.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
    console.log("[Migration] otps.attempts column ensured");
  } catch (err) {
    console.error("[Migration] otps.attempts failed:", err);
  }
}

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;
const finalPort = Number.isNaN(port) || port <= 0 ? 8080 : port;

// Run migrations FIRST, then start server — ensures session table exists before any request
async function start() {
  console.log("[Startup] Running migrations...");
  await runMigrations();

  try {
    await db.update(usersTable)
      .set({ role: "admin" })
      .where(inArray(usersTable.mobile, ADMIN_MOBILES));
    console.log("[Startup] Admin roles synced");
  } catch (err) {
    console.error("[Startup] Failed to sync admin roles:", err);
  }

  app.listen(finalPort, () => {
    console.log(`Server listening on port ${finalPort}`);
    startPaymentReminderCron();
    startFeedbackReminderCron();
  });
}

start().catch(err => {
  console.error("[Startup] Fatal error:", err);
  process.exit(1);
});
