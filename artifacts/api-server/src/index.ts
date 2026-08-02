// Load .env file before anything else (needed for VPS where PM2 doesn't auto-load .env)
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

// Try multiple candidate paths — first one that exists wins
const ENV_CANDIDATES = [
  "/var/www/alburhan/.env",
  "/var/www/alburhan/api-server/.env",
  "/var/www/alburhan/artifacts/api-server/.env",
  process.cwd() + "/.env",
  process.cwd() + "/../../.env",
];

let loadedEnvPath: string | null = null;
for (const p of ENV_CANDIDATES) {
  if (fs.existsSync(p)) {
    // override: true — ensure .env file always wins over PM2's baked-in env
    const result = dotenvConfig({ path: p, override: true });
    if (!result.error) {
      loadedEnvPath = p;
      break;
    }
  }
}
// Only fall back to CWD .env if no candidate was found — prevents /root/.env
// from overriding a good /var/www/alburhan/.env with stale values
if (!loadedEnvPath) {
  dotenvConfig({ override: true });
}

// ── Startup diagnostic: print immediately so it appears in pm2 logs ──────────
console.log("=".repeat(60));
console.log("[STARTUP] Al Burhan API Server starting");
console.log("[STARTUP] Node:", process.version, "| PID:", process.pid);
console.log("[STARTUP] CWD:", process.cwd());
console.log("[STARTUP] .env searched:", ENV_CANDIDATES.join(", "));
console.log("[STARTUP] .env loaded from:", loadedEnvPath || "NONE FOUND — env must come from PM2/system");
console.log("[STARTUP] ENV CHECK:");
const _envKeys = [
  "FAST2SMS_API_KEY",
  "FAST2SMS_XXL_API_KEY",
  "DATABASE_URL",
  "SESSION_SECRET",
  "BOTBEE_API_KEY",
  "BOTBEE_PHONE_NUMBER_ID",
  "NODE_ENV",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "MIGRATION_KEY",   // deploy auth — must be set on both Replit and VPS
];
for (const k of _envKeys) {
  const v = process.env[k];
  if (!v) {
    console.log(`[STARTUP]   ❌ ${k} = NOT SET`);
  } else {
    const masked = k.includes("SECRET") || k.includes("KEY") || k.includes("URL") || k.includes("DATABASE")
      ? `${v.slice(0, 6)}...${v.slice(-4)} (len=${v.length})`
      : v;
    console.log(`[STARTUP]   ✅ ${k} = ${masked}`);
  }
}
console.log("=".repeat(60));

// ── Fatal startup guard: DATABASE_URL is required for the app to function ────
// Fail fast and loud instead of booting into a broken state (undefined pool,
// silent query failures, session store crashes, etc.)
if (!process.env.DATABASE_URL) {
  console.error("=".repeat(60));
  console.error("[FATAL STARTUP ERROR] DATABASE_URL is not set.");
  console.error("[FATAL STARTUP ERROR] The server cannot start without a database connection.");
  console.error("[FATAL STARTUP ERROR] Checked .env paths:", ENV_CANDIDATES.join(", "));
  console.error("[FATAL STARTUP ERROR] Fix: add DATABASE_URL=postgres://... to your .env file");
  console.error("[FATAL STARTUP ERROR] on the VPS (e.g. /var/www/alburhan/.env), then restart PM2:");
  console.error("[FATAL STARTUP ERROR]   pm2 restart alburhan-tours --update-env");
  console.error("=".repeat(60));
  process.exit(1);
}

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
import { startAgreementReminderCron } from "./jobs/agreementReminder.js";
import { startTicketDepartureReminderCron } from "./jobs/ticketDepartureReminder.js";
import { startDepartureReminderCron, startDocumentExpiryCron, startReturnAndFeedbackCron, startBalanceReminderCron, startDocumentReminderCron, startZiyaratReminderCron, startAgreementIntegrityCron, startVisaReminderCron, startDailyAdminReportCron } from "./lib/workflowEngine.js";
import { DEFAULT_RULES } from "./routes/workflows.js";
import { runFollowupCron } from "./lib/leadEngine.js";
import { ensureLeadEnginePhaseBSchema, runLeadReminderCron } from "./lib/leadEnginePhaseB.js";
import { startGoogleHealthCheckCron } from "./jobs/googleHealthCheck.js";

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
    await db.execute(sql`ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS service_label TEXT`);
    console.log("[Migration] hajj_groups.service_label column ensured");
  } catch (err) {
    console.error("[Migration] hajj_groups.service_label failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ`);
    console.log("[Migration] bookings.last_payment_date column ensured");
  } catch (err) {
    console.error("[Migration] bookings.last_payment_date failed:", err);
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
    // Ensure id column is TEXT (was previously SERIAL/INTEGER in some deploys)
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reminder_logs' AND column_name = 'id'
            AND data_type IN ('integer','bigint','smallint')
        ) THEN
          ALTER TABLE reminder_logs DROP CONSTRAINT IF EXISTS reminder_logs_pkey;
          ALTER TABLE reminder_logs ADD COLUMN IF NOT EXISTS id_text TEXT;
          UPDATE reminder_logs SET id_text = id::TEXT WHERE id_text IS NULL;
          ALTER TABLE reminder_logs DROP COLUMN id;
          ALTER TABLE reminder_logs RENAME COLUMN id_text TO id;
          ALTER TABLE reminder_logs ADD PRIMARY KEY (id);
        END IF;
      END $$
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
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_type TEXT`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_reason TEXT`);
    console.log("[Migration] bookings columns ensured");
  } catch (err) {
    console.error("[Migration] bookings columns failed:", err);
  }
  try {
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_included BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_enabled BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_rate NUMERIC(5,2) DEFAULT 2`);
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(12,2)`);
    console.log("[Migration] bookings GST/TCS columns ensured");
  } catch (err) {
    console.error("[Migration] bookings GST/TCS columns failed:", err);
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        gst_enabled BOOLEAN NOT NULL DEFAULT true,
        gst_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
        gst_included BOOLEAN NOT NULL DEFAULT false,
        tcs_enabled BOOLEAN NOT NULL DEFAULT false,
        tcs_rate NUMERIC(5,2) NOT NULL DEFAULT 2,
        tcs_included BOOLEAN NOT NULL DEFAULT false,
        discount_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`INSERT INTO booking_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`);
    console.log("[Migration] booking_settings table ensured");
  } catch (err) {
    console.error("[Migration] booking_settings table failed:", err);
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        payment_mode TEXT NOT NULL DEFAULT 'cash',
        payment_date TEXT,
        reference_number TEXT,
        notes TEXT,
        recorded_by TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ,
        deletion_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS pt_booking_idx ON payment_transactions(booking_id)`);
    console.log("[Migration] payment_transactions table ensured");
  } catch (err) {
    console.error("[Migration] payment_transactions table create failed:", err);
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
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body JSONB NOT NULL DEFAULT '{}',
        booking_id TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS admin_notif_created_idx ON admin_notifications(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS admin_notif_unread_idx ON admin_notifications(is_read) WHERE is_read = false`);
    console.log("[Migration] admin_notifications table ensured");
  } catch (err) {
    console.error("[Migration] admin_notifications failed:", err);
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
    await pool.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS otp_hash TEXT`);
    await pool.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'customer'`);
    console.log("[Migration] otps.attempts + otps.otp_hash + otps.purpose columns ensured");
  } catch (err) {
    console.error("[Migration] otps columns failed:", err);
  }
  try {
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by TEXT`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_reason TEXT`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS package_id TEXT`);
    console.log("[Migration] expenses approval columns ensured");
  } catch (err) {
    console.error("[Migration] expenses approval columns failed:", err);
  }
  // ── Chart of Accounts ──────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        sub_type TEXT,
        parent_id TEXT,
        opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_system BOOLEAN NOT NULL DEFAULT false,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_idx ON accounts(code)`);
    console.log("[Migration] accounts table ensured");
  } catch (err) {
    console.error("[Migration] accounts table failed:", err);
  }
  // Seed default Chart of Accounts (only if empty)
  try {
    const existing = await pool.query(`SELECT COUNT(*) FROM accounts`);
    if (parseInt(existing.rows[0].count) === 0) {
      const seedAccounts = [
        ["1001","Cash in Hand","asset","current_asset",true],
        ["1002","Bank Account","asset","current_asset",true],
        ["1003","Accounts Receivable (Debtors)","asset","current_asset",true],
        ["1004","Advance to Suppliers","asset","current_asset",false],
        ["1005","Fixed Assets","asset","fixed_asset",false],
        ["2001","Accounts Payable (Creditors)","liability","current_liability",true],
        ["2002","GST Payable","liability","current_liability",false],
        ["2003","Advance from Customers","liability","current_liability",false],
        ["3001","Owner Capital","equity","capital",true],
        ["3002","Retained Earnings","equity","retained_earnings",true],
        ["4001","Hajj Package Revenue","income","sales",true],
        ["4002","Umrah Package Revenue","income","sales",true],
        ["4003","Ziyarat Package Revenue","income","sales",false],
        ["4004","Tour Package Revenue","income","sales",false],
        ["4005","Other Income","income","other_income",false],
        ["5001","Flight Expenses","expense","operating",true],
        ["5002","Hotel Expenses","expense","operating",true],
        ["5003","Visa Expenses","expense","operating",true],
        ["5004","Transport Expenses","expense","operating",true],
        ["5005","Food Expenses","expense","operating",false],
        ["5006","Laundry Expenses","expense","operating",false],
        ["5007","Zam Zam Expenses","expense","operating",false],
        ["5008","Staff Salary","expense","payroll",true],
        ["5009","Marketing Expenses","expense","operating",false],
        ["5010","Office Expenses","expense","operating",false],
        ["5011","Miscellaneous Expenses","expense","operating",false],
        ["5012","Bank Charges","expense","finance",false],
      ];
      for (const [code, name, type, sub_type, is_system] of seedAccounts) {
        await pool.query(
          `INSERT INTO accounts (id, code, name, type, sub_type, is_system, opening_balance) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 0) ON CONFLICT (code) DO NOTHING`,
          [code, name, type, sub_type, is_system]
        );
      }
      console.log("[Migration] accounts seeded with default chart of accounts");
    }
  } catch (err) {
    console.error("[Migration] accounts seed failed:", err);
  }
  // ── Financial Years ────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_years (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT false,
        is_closed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Seed current FY if none exist
    const fyCount = await pool.query(`SELECT COUNT(*) FROM financial_years`);
    if (parseInt(fyCount.rows[0].count) === 0) {
      const now = new Date();
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      await pool.query(
        `INSERT INTO financial_years (id, name, start_date, end_date, is_active) VALUES (gen_random_uuid()::text, $1, $2, $3, true)`,
        [`FY ${fyYear}-${(fyYear+1).toString().slice(2)}`, `${fyYear}-04-01`, `${fyYear+1}-03-31`]
      );
    }
    console.log("[Migration] financial_years table ensured");
  } catch (err) {
    console.error("[Migration] financial_years failed:", err);
  }
  // ── Journal Entries ────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        entry_number TEXT NOT NULL,
        date TEXT NOT NULL,
        narration TEXT NOT NULL,
        reference TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        financial_year_id TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id TEXT PRIMARY KEY,
        journal_entry_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        debit NUMERIC(14,2) NOT NULL DEFAULT 0,
        credit NUMERIC(14,2) NOT NULL DEFAULT 0,
        narration TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS jel_entry_idx ON journal_entry_lines(journal_entry_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS jel_account_idx ON journal_entry_lines(account_id)`);
    console.log("[Migration] journal_entries + journal_entry_lines tables ensured");
  } catch (err) {
    console.error("[Migration] journal_entries failed:", err);
  }
  // ── Bank Reconciliation columns on payment_transactions ──────────────────
  try {
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS reconciled_date TEXT`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS reconciled_by TEXT`);
    console.log("[Migration] payment_transactions reconciliation columns ensured");
  } catch (err) {
    console.error("[Migration] payment_transactions reconciliation columns failed:", err);
  }
  // ── Vendors ────────────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        gst_number TEXT,
        pan TEXT,
        bank_account TEXT,
        ifsc TEXT,
        contact TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] vendors table ensured");
  } catch (err) {
    console.error("[Migration] vendors table failed:", err);
  }
  try {
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_id TEXT`);
    console.log("[Migration] expenses.vendor_id column ensured");
  } catch (err) {
    console.error("[Migration] expenses.vendor_id failed:", err);
  }
  // ── Per-account per-FY opening balances ───────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_opening_balances (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        financial_year_id TEXT NOT NULL,
        opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, financial_year_id)
      )
    `);
    console.log("[Migration] account_opening_balances table ensured");
  } catch (err) {
    console.error("[Migration] account_opening_balances failed:", err);
  }
  // ── GST fields on expenses ─────────────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5,2)`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS hsn_sac TEXT`);
    console.log("[Migration] expenses GST columns ensured");
  } catch (err) {
    console.error("[Migration] expenses GST columns failed:", err);
  }
  // ── GST fields on bookings ─────────────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14,2)`);
    console.log("[Migration] bookings GST columns ensured");
  } catch (err) {
    console.error("[Migration] bookings GST columns failed:", err);
  }
  // ── Employees table ────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        designation TEXT,
        department TEXT,
        mobile TEXT,
        email TEXT,
        bank_account TEXT,
        ifsc TEXT,
        pan TEXT,
        pf_number TEXT,
        esi_number TEXT,
        joining_date TEXT,
        basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        hra NUMERIC(12,2) NOT NULL DEFAULT 0,
        allowances JSONB NOT NULL DEFAULT '{}',
        total_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] employees table ensured");
  } catch (err) {
    console.error("[Migration] employees table failed:", err);
  }
  // ── Payroll runs table ─────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        month TEXT NOT NULL,
        present_days NUMERIC(5,2) NOT NULL DEFAULT 26,
        working_days NUMERIC(5,2) NOT NULL DEFAULT 26,
        gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        hra NUMERIC(12,2) NOT NULL DEFAULT 0,
        allowances JSONB NOT NULL DEFAULT '{}',
        pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        esi_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        tds_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(employee_id, month)
      )
    `);
    console.log("[Migration] payroll_runs table ensured");
  } catch (err) {
    console.error("[Migration] payroll_runs table failed:", err);
  }
  // ── Admin role column on users ─────────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role TEXT NOT NULL DEFAULT 'read_only'`);
    // Ensure default is least-privilege for all existing + new installations
    await pool.query(`ALTER TABLE users ALTER COLUMN admin_role SET DEFAULT 'read_only'`);
    console.log("[Migration] users.admin_role column ensured");
  } catch (err) {
    console.error("[Migration] users.admin_role failed:", err);
  }
  // ── Guide group assignment column ──────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_group_ids TEXT[] NOT NULL DEFAULT '{}'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
    console.log("[Migration] users.assigned_group_ids / password_hash / is_active columns ensured");
  } catch (err) {
    console.error("[Migration] users.assigned_group_ids failed:", err);
  }
  // ── Unified Audit Logs table ───────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_name TEXT,
        action TEXT NOT NULL,
        entity_table TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS al_entity_idx ON audit_logs(entity_table, entity_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS al_actor_idx ON audit_logs(actor_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS al_created_idx ON audit_logs(created_at)`);
    console.log("[Migration] audit_logs table ensured");
  } catch (err) {
    console.error("[Migration] audit_logs table failed:", err);
  }
  // ── Salary components (structured salary breakdown per employee) ───────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_components (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'earning',
        calculation TEXT NOT NULL DEFAULT 'fixed',
        value NUMERIC(12,2) NOT NULL DEFAULT 0,
        basis TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS sc_employee_idx ON salary_components(employee_id)`);
    console.log("[Migration] salary_components table ensured");
  } catch (err) {
    console.error("[Migration] salary_components table failed:", err);
  }
  // ── Payroll entries (line items per payroll run) ────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_entries (
        id TEXT PRIMARY KEY,
        payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id TEXT NOT NULL,
        month TEXT NOT NULL,
        component_name TEXT NOT NULL,
        component_type TEXT NOT NULL DEFAULT 'earning',
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS pe_run_idx ON payroll_entries(payroll_run_id)`);
    console.log("[Migration] payroll_entries table ensured");
  } catch (err) {
    console.error("[Migration] payroll_entries table failed:", err);
  }
  // ── Employee advances ──────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_advances (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        amount NUMERIC(12,2) NOT NULL,
        date TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        payroll_run_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ea_employee_idx ON employee_advances(employee_id)`);
    console.log("[Migration] employee_advances table ensured");
  } catch (err) {
    console.error("[Migration] employee_advances table failed:", err);
  }
  // ── Notification Engine tables ──────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id TEXT PRIMARY KEY,
        notification_id TEXT,
        event_type TEXT NOT NULL,
        customer_id TEXT,
        booking_id TEXT,
        channel TEXT NOT NULL,
        template TEXT,
        recipient TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_response JSONB,
        sent_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_event_idx ON notification_logs(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_status_idx ON notification_logs(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_created_idx ON notification_logs(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_updated_idx ON notification_logs(updated_at)`);
    // Before creating the UNIQUE index, remove any duplicate idempotency_key rows
    // that may exist from before this index was introduced. Keeping the most recent row per key.
    // Without this step, CREATE UNIQUE INDEX fails silently on a DB with existing duplicates.
    await pool.query(`
      DELETE FROM notification_logs
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY created_at DESC, id DESC) AS rn
          FROM notification_logs
          WHERE idempotency_key IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
    `);
    // Partial unique index — prevents duplicate log rows for the same send
    // (e.g. sms.ts internal log + notificationEngine log, or duplicate webhook calls)
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_logs_idempotency ON notification_logs (idempotency_key) WHERE idempotency_key IS NOT NULL`);
    console.log("[Migration] notification_logs table ensured");
  } catch (err) {
    console.error("[Migration] notification_logs failed:", err);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        template_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(event_type, channel)
      )
    `);
    const events = [
      'new_booking','booking_approved','booking_cancelled','payment_received',
      'payment_due','invoice_generated','receipt_generated','visa_ready',
      'flight_assigned','hotel_assigned','room_assigned','bus_assigned',
      'passport_expiry','departure_reminder','arrival_reminder','return_reminder','feedback_request'
    ];
    const channels = ['whatsapp','sms','rcs','email','push'];
    const defaultOn = { whatsapp: true, sms: true, rcs: false, email: false, push: false };
    for (const ev of events) {
      for (const ch of channels) {
        const enabled = (defaultOn as any)[ch] ?? false;
        await pool.query(
          `INSERT INTO notification_settings (id, event_type, channel, enabled) VALUES ($1,$2,$3,$4) ON CONFLICT (event_type, channel) DO NOTHING`,
          [`ns_${ev}_${ch}`, ev, ch, enabled]
        );
      }
    }
    console.log("[Migration] notification_settings table ensured");
  } catch (err) {
    console.error("[Migration] notification_settings failed:", err);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        event_type TEXT,
        channel TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        variables JSONB DEFAULT '[]',
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] notification_templates table ensured");
  } catch (err) {
    console.error("[Migration] notification_templates failed:", err);
  }
  try {
    await pool.query(`
      ALTER TABLE notification_templates
        ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
        ADD COLUMN IF NOT EXISTS botbee_template_id TEXT,
        ADD COLUMN IF NOT EXISTS dlt_template_id TEXT,
        ADD COLUMN IF NOT EXISTS dlt_entity_id TEXT,
        ADD COLUMN IF NOT EXISTS sender_id TEXT,
        ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'generic',
        ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
        ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'UTILITY',
        ADD COLUMN IF NOT EXISTS header_text TEXT,
        ADD COLUMN IF NOT EXISTS footer_text TEXT,
        ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS html_body TEXT,
        ADD COLUMN IF NOT EXISTS rcs_agent_id TEXT,
        ADD COLUMN IF NOT EXISTS rcs_campaign_id TEXT,
        ADD COLUMN IF NOT EXISTS rich_card JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true
    `);
    console.log("[Migration] notification_templates extended columns ensured");
  } catch (err) {
    console.error("[Migration] notification_templates extended columns failed:", err);
  }
  try {
    // Ensure variable_count column exists (used by DLT manager UI)
    await pool.query(`ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variable_count INTEGER DEFAULT 0`);
  } catch (_) { /* ignore */ }
  try {
    // Upsert 10 TRAI-approved Fast2SMS DLT templates (seeded at startup; won't overwrite if admin changed body)
    const ENTITY_ID = "1701164759668728160";
    const SENDER    = "ALBURH";
    const DLT_SEED = [
      { id: "dlt-booking-approved-222039",  event_type: "booking_approved",      name: "Booking Approved",              dlt_template_id: "222039", variable_count: 4, body: "Assalamu Alaikum {customer_name}\n\nAlhamdulillah! Your booking is APPROVED.\n\nBooking ID: {booking_id}\nPackage: {package_name}\nAmount: Rs {total_amount}\n\nPlease complete your payment to confirm your seat.\nCall us: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels" },
      { id: "dlt-payment-received-222040",  event_type: "payment_received",      name: "Payment Received",              dlt_template_id: "222040", variable_count: 4, body: "Assalamu Alaikum {customer_name}\n\nPayment Received Successfully!\n\nBooking ID: {booking_id}\nInvoice No: {invoice_number}\nAmount: Rs {payment_amount}\n\nJazak Allah Khair for your payment.\nAl Burhan Tours & Travels\n+91 9893225590" },
      { id: "dlt-invoice-generated-222041", event_type: "invoice_generated",     name: "Invoice Generated",             dlt_template_id: "222041", variable_count: 5, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nYour invoice has been generated.\n\nBooking ID: {booking_id}\nInvoice No: {invoice_number}\nAmount: Rs {invoice_amount}\n\nDownload your invoice below.\n\n{invoice_download_url}" },
      { id: "dlt-agreement-ready-222042",   event_type: "agreement_ready",       name: "Agreement Ready",               dlt_template_id: "222042", variable_count: 4, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nYour Hajj/Umrah Agreement is ready.\n\nBooking ID: {booking_id}\nAgreement No: {agreement_number}\n\nDownload Agreement: {agreement_download_url}\n\nPlease review and complete the digital signature if required." },
      { id: "dlt-visa-issued-222043",       event_type: "visa_approved",         name: "Visa Issued",                   dlt_template_id: "222043", variable_count: 4, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nCongratulations!\n\nYour visa has been issued successfully.\n\nBooking ID: {booking_id}\nVisa Number: {visa_number}\nDownload Visa: {visa_download_url}" },
      { id: "dlt-orientation-inv-222044",   event_type: "orientation_invitation", name: "Orientation Invitation",       dlt_template_id: "222044", variable_count: 4, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nYou are invited to attend the Hajj/Umrah Orientation Programme.\n\nDate: {orientation_date}\nTime: {orientation_time}\nLocation: {orientation_location}" },
      { id: "dlt-booking-update-222045",    event_type: "booking_update",        name: "Booking Update",                dlt_template_id: "222045", variable_count: 2, body: "Assalamu Alaikum {customer_name}\n\nImportant update regarding your booking {booking_update_message}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels" },
      { id: "dlt-departure-rem-222046",     event_type: "departure_reminder",    name: "Departure Reminder",            dlt_template_id: "222046", variable_count: 5, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nYour departure date is approaching.\n\nBooking ID: {booking_id}\nDeparture: {departure_date}\nReporting Time: {reporting_time}\nAirport: {airport_name}\n\nPlease carry your Passport, Visa, Flight Ticket, ID Card, and other required documents." },
      { id: "dlt-ticket-issued-222047",     event_type: "ticket_issued",         name: "Flight Ticket Issued",          dlt_template_id: "222047", variable_count: 4, body: "Assalamu Alaikum wa Rahmatullahi wa Barakatuh {customer_name}\n\nYour flight ticket has been issued.\n\nBooking ID: {booking_id}\nFlightnumber: {flight_number}\n\nDownload Ticket: {ticket_download_url}\n\nSafe Travels." },
      { id: "dlt-payment-pending-222038",   event_type: "pending_payment",       name: "Payment Pending Reminder",      dlt_template_id: "222038", variable_count: 4, body: "Assalamu Alaikum {customer_name}\n\nFriendly Reminder - Payment Pending\n\nBooking ID: {booking_id}\nPackage: {package_name}\nOutstanding: Rs {outstanding_amount}\n\nPlease complete payment to secure your seat.\nContact +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels" },
    ];
    for (const t of DLT_SEED) {
      await pool.query(
        `INSERT INTO notification_templates
           (id, name, event_type, channel, dlt_template_id, dlt_entity_id, sender_id,
            body, provider, priority, enabled, is_default, variable_count, variables)
         VALUES ($1,$2,$3,'sms',$4,$5,$6,$7,'fast2sms',10,true,true,$8,'[]')
         ON CONFLICT (id) DO UPDATE SET
           dlt_template_id = EXCLUDED.dlt_template_id,
           dlt_entity_id   = EXCLUDED.dlt_entity_id,
           sender_id       = EXCLUDED.sender_id,
           name            = EXCLUDED.name,
           variable_count  = EXCLUDED.variable_count,
           updated_at      = NOW()`,
        [t.id, t.name, t.event_type, t.dlt_template_id, ENTITY_ID, SENDER, t.body, t.variable_count]
      );
    }
    console.log("[Migration] 10 approved DLT Fast2SMS templates seeded");
  } catch (err) {
    console.error("[Migration] DLT template seed failed:", err);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        customer_id TEXT,
        booking_id TEXT,
        customer_name TEXT,
        message TEXT NOT NULL,
        subject TEXT,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS sn_status_idx ON scheduled_notifications(status, scheduled_at)`);
    console.log("[Migration] scheduled_notifications table ensured");
  } catch (err) {
    console.error("[Migration] scheduled_notifications failed:", err);
  }
  // ── notification_campaigns ─────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        audience_type TEXT NOT NULL,
        audience_id TEXT,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_count INT NOT NULL DEFAULT 0,
        sent_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    console.log("[Migration] notification_campaigns table ensured");
  } catch (err) {
    console.error("[Migration] notification_campaigns failed:", err);
  }
  // ── customer_notification_preferences ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_notification_preferences (
        customer_id TEXT PRIMARY KEY,
        whatsapp BOOLEAN NOT NULL DEFAULT true,
        sms BOOLEAN NOT NULL DEFAULT true,
        email BOOLEAN NOT NULL DEFAULT false,
        rcs BOOLEAN NOT NULL DEFAULT false,
        push BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] customer_notification_preferences table ensured");
  } catch (err) {
    console.error("[Migration] customer_notification_preferences failed:", err);
  }
  // ── Seed new notification event types ─────────────────────────────────────
  try {
    const newEvents = [
      'booking_rejected','booking_completed','payment_failed','balance_reminder',
      'invoice_paid','invoice_cancelled','passport_uploaded','visa_approved',
      'visa_rejected','flight_changed','flight_cancelled','room_changed',
      'seat_changed','airport_checkin','missing_pilgrim','medical_emergency'
    ];
    const channels2 = ['whatsapp','sms','rcs','email','push'];
    const defaultOn2: Record<string, boolean> = { whatsapp: true, sms: true, rcs: false, email: false, push: false };
    for (const ev of newEvents) {
      for (const ch of channels2) {
        await pool.query(
          `INSERT INTO notification_settings (id, event_type, channel, enabled) VALUES ($1,$2,$3,$4) ON CONFLICT (event_type, channel) DO NOTHING`,
          [`ns_${ev}_${ch}`, ev, ch, defaultOn2[ch] ?? false]
        );
      }
    }
    console.log("[Migration] new event types seeded");
  } catch (err) {
    console.error("[Migration] new event types seed failed:", err);
  }
  // ── Invoices table ─────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        booking_id TEXT NOT NULL,
        customer_id TEXT,
        invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount NUMERIC(12,2) NOT NULL DEFAULT 0,
        gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        tcs_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        invoice_status TEXT NOT NULL DEFAULT 'pending',
        pdf_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS inv_booking_idx ON invoices(booking_id)`);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ`).catch(() => {});
    console.log("[Migration] invoices table ensured");
  } catch (err) {
    console.error("[Migration] invoices table failed:", err);
  }
  // ── Assets table ───────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        purchase_date TEXT NOT NULL,
        purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
        vendor TEXT,
        serial_number TEXT,
        warranty_date TEXT,
        depreciation_rate NUMERIC(6,4) NOT NULL DEFAULT 0.15,
        location TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] assets table ensured");
  } catch (err) {
    console.error("[Migration] assets table failed:", err);
  }
  // ── Workflow Engine tables ─────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL UNIQUE,
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        group_name TEXT NOT NULL DEFAULT 'general',
        config JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] workflow_rules table ensured");
  } catch (err) { console.error("[Migration] workflow_rules failed:", err); }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id SERIAL PRIMARY KEY,
        trigger_type TEXT NOT NULL,
        booking_id TEXT,
        customer_id TEXT,
        customer_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        execution_time_ms INTEGER,
        context JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS wf_logs_status_idx ON workflow_logs(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS wf_logs_created_idx ON workflow_logs(created_at DESC)`);
    console.log("[Migration] workflow_logs table ensured");
  } catch (err) { console.error("[Migration] workflow_logs failed:", err); }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_queue (
        id SERIAL PRIMARY KEY,
        trigger_type TEXT NOT NULL,
        booking_id TEXT,
        customer_id TEXT,
        context JSONB,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] workflow_queue table ensured");
  } catch (err) { console.error("[Migration] workflow_queue failed:", err); }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_timeline (
        id SERIAL PRIMARY KEY,
        customer_id TEXT,
        booking_id TEXT,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS timeline_booking_idx ON customer_timeline(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS timeline_customer_idx ON customer_timeline(customer_id)`);
    console.log("[Migration] customer_timeline table ensured");
  } catch (err) { console.error("[Migration] customer_timeline failed:", err); }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_events (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        booking_id TEXT,
        customer_name TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] admin_events table ensured");
  } catch (err) { console.error("[Migration] admin_events failed:", err); }
  // ── Phase 2: Ziyarat tables ────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ziyarat_schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT 'Makkah',
        schedule_date TEXT NOT NULL,
        departure_time TEXT,
        return_time TEXT,
        bus_id TEXT,
        group_id TEXT,
        guide_name TEXT,
        guide_mobile TEXT,
        capacity INTEGER DEFAULT 50,
        notes TEXT,
        status TEXT DEFAULT 'scheduled',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ziyarat_attendance (
        id SERIAL PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        pilgrim_id TEXT NOT NULL,
        checked_in BOOLEAN DEFAULT false,
        check_in_time TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(schedule_id, pilgrim_id)
      )
    `);
    console.log("[Migration] ziyarat tables ensured");
  } catch (err) { console.error("[Migration] ziyarat tables failed:", err); }
  // ── Phase 2: Holy Site Allocations (Mina/Arafat/Muzdalifah) ───────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holy_site_allocations (
        id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        pilgrim_id TEXT,
        family_id TEXT,
        group_id TEXT,
        tent_number TEXT,
        camp_number TEXT,
        area TEXT,
        capacity INTEGER,
        guide_name TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] holy_site_allocations table ensured");
  } catch (err) { console.error("[Migration] holy_site_allocations failed:", err); }
  // ── Phase 2: Luggage Tags ──────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS luggage_tags (
        id TEXT PRIMARY KEY,
        tag_number TEXT UNIQUE NOT NULL,
        pilgrim_id TEXT,
        booking_id TEXT,
        pilgrim_name TEXT,
        group_id TEXT,
        weight NUMERIC(6,2),
        status TEXT DEFAULT 'assigned',
        location TEXT,
        delivery_status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] luggage_tags table ensured");
  } catch (err) { console.error("[Migration] luggage_tags failed:", err); }
  // ── Phase 2: Extra columns on existing tables ──────────────────────────────
  try {
    await pool.query(`ALTER TABLE hotels ADD COLUMN IF NOT EXISTS distance_from_haram TEXT`);
    await pool.query(`ALTER TABLE hotels ADD COLUMN IF NOT EXISTS contact_person TEXT`);
    await pool.query(`ALTER TABLE hotels ADD COLUMN IF NOT EXISTS email TEXT`);
    await pool.query(`ALTER TABLE buses ADD COLUMN IF NOT EXISTS guide_name TEXT`);
    await pool.query(`ALTER TABLE group_flights ADD COLUMN IF NOT EXISTS terminal TEXT`);
    await pool.query(`ALTER TABLE hotel_rooms ADD COLUMN IF NOT EXISTS room_type TEXT`);
    await pool.query(`ALTER TABLE hotel_rooms ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'vacant'`);
    console.log("[Migration] Phase 2 extra columns ensured");
  } catch (err) { console.error("[Migration] Phase 2 extra columns failed:", err); }
  // ── Loyalty tables ─────────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_points (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id TEXT NOT NULL UNIQUE,
        customer_name TEXT,
        customer_mobile TEXT,
        total_points INT NOT NULL DEFAULT 0,
        redeemed_points INT NOT NULL DEFAULT 0,
        tier TEXT NOT NULL DEFAULT 'bronze',
        bookings_count INT NOT NULL DEFAULT 0,
        total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
        last_activity TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id TEXT NOT NULL,
        points INT NOT NULL,
        type TEXT NOT NULL DEFAULT 'credit',
        reason TEXT,
        source TEXT DEFAULT 'system',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id)`);
    console.log("[Migration] loyalty tables ensured");
  } catch (err) { console.error("[Migration] loyalty tables failed:", err); }
  // ── api_settings table ─────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider TEXT NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        api_url TEXT,
        api_key_encrypted TEXT,
        extra_fields_encrypted TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      )
    `);
    console.log("[Migration] api_settings table ensured");
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unknown'`);
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_tested TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_sms_status TEXT`);
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_sms_at TIMESTAMPTZ`);
    console.log("[Migration] api_settings last_sms_status/last_sms_at columns ensured");
    // key/value columns for generic kv storage (VAPID keys, template overrides, etc.)
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS key TEXT UNIQUE`);
    await pool.query(`ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS value TEXT`);
    console.log("[Migration] api_settings key/value columns ensured");
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS provider_name TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS api_endpoint TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS http_status INTEGER`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS request_payload JSONB`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error_code TEXT`);
  } catch (err) { console.error("[Migration] api_settings table failed:", err); }
  // ── notification_logs: customer_name + booking_number columns ──────────────
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS customer_name TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS booking_number TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_booking_number_idx ON notification_logs(booking_number)`);
    console.log("[Migration] notification_logs customer_name/booking_number ensured");
  } catch (err) { console.error("[Migration] notification_logs customer_name/booking_number failed:", err); }
  // ── notification_logs: wamid + template columns ─────────────────────────────
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS wamid TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS template TEXT`);
    console.log("[Migration] notification_logs wamid+template ensured");
  } catch (err) { console.error("[Migration] notification_logs wamid+template failed:", err); }
  // ── notification_auto_settings table ───────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_auto_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT 'true',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] notification_auto_settings table ensured");
  } catch (err) { console.error("[Migration] notification_auto_settings table failed:", err); }
  // ── wa_templates table ─────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wa_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'UTILITY',
        language TEXT NOT NULL DEFAULT 'en',
        status TEXT NOT NULL DEFAULT 'local',
        header_type TEXT NOT NULL DEFAULT 'none',
        header_text TEXT,
        body_text TEXT NOT NULL,
        footer_text TEXT,
        buttons JSONB NOT NULL DEFAULT '[]',
        variables JSONB NOT NULL DEFAULT '[]',
        event_type TEXT,
        meta_template_name TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        is_builtin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] wa_templates table ensured");

    // Seed 16 built-in templates
    const BUILTIN_TEMPLATES = [
      {
        name: "booking_submitted", display_name: "Booking Submitted", category: "UTILITY", event_type: "new_booking",
        body_text: "Assalamu Alaikum {{customer_name}},\n\nJazak Allah Khair for choosing Al Burhan Tours & Travels! 🕌\n\nYour booking has been received.\n\n📋 Booking ID: {{booking_id}}\n📦 Package: {{package_name}}\n\nOur team will review and confirm shortly.\n\nFor queries: +91 9893225590\n\nWarm Regards,\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","package_name"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "booking_approved", display_name: "Booking Approved", category: "UTILITY", event_type: "booking_approved",
        body_text: "Assalamu Alaikum {{customer_name}},\n\nAlhamdulillah! ✅ Your booking is APPROVED.\n\n📋 Booking ID: {{booking_id}}\n📦 Package: {{package_name}}\n💰 Amount: ₹{{amount}}\n\nPlease complete your payment to confirm your seat.\n\nCall us: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","package_name","amount"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "payment_received", display_name: "Payment Received", category: "UTILITY", event_type: "payment_received",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n💰 Payment Received Successfully!\n\n📋 Booking ID: {{booking_id}}\n🧾 Invoice No: {{invoice_number}}\n💵 Amount: ₹{{amount}}\n\nJazak Allah Khair for your payment.\n\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","booking_id","invoice_number","amount"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "pending_payment_reminder", display_name: "Pending Payment Reminder", category: "UTILITY", event_type: "payment_due",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n⚠️ Friendly Reminder — Payment Pending\n\n📋 Booking ID: {{booking_id}}\n📦 Package: {{package_name}}\n💰 Outstanding: ₹{{amount}}\n\nPlease complete payment to secure your seat.\n\nContact: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","package_name","amount"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "invoice_generated", display_name: "Invoice Generated", category: "UTILITY", event_type: "invoice_generated",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n📄 Your Invoice is Ready!\n\n🧾 Invoice No: {{invoice_number}}\n📋 Booking ID: {{booking_id}}\n💰 Total: ₹{{amount}}\n\nPlease visit our office or contact us to collect your invoice.\n\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","invoice_number","booking_id","amount"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "ticket_issued", display_name: "Ticket Issued", category: "UTILITY", event_type: "ticket_issued",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n✈️ Your Flight Ticket has been Issued!\n\n📋 Booking ID: {{booking_id}}\n🎫 Ticket No: {{ticket_number}}\n✈️ Flight: {{flight_number}}\n📅 Departure: {{departure_date}} at {{departure_time}}\n\nPlease check-in 3 hours before departure.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","booking_id","ticket_number","flight_number","departure_date","departure_time"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "visa_issued", display_name: "Visa Issued", category: "UTILITY", event_type: "visa_ready",
        body_text: "Assalamu Alaikum {{customer_name}},\n\nAlhamdulillah! 🕌 Your Visa is APPROVED!\n\n📋 Booking ID: {{booking_id}}\n🛂 Visa No: {{visa_number}}\n📦 Package: {{package_name}}\n\nPlease visit our office to collect your documents.\n\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","booking_id","visa_number","package_name"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "hotel_confirmation", display_name: "Hotel Confirmation", category: "UTILITY", event_type: "hotel_assigned",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🏨 Hotel Confirmation\n\n📋 Booking ID: {{booking_id}}\n🏨 Hotel: {{hotel_name}}\n🛏️ Room: {{room_number}}\n\nYour accommodation has been confirmed. Please carry this message as reference.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","booking_id","hotel_name","room_number"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "flight_details", display_name: "Flight Details", category: "UTILITY", event_type: "ticket_issued",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n✈️ Flight Details — {{booking_id}}\n\n🛫 Flight: {{flight_number}}\n📅 Date: {{departure_date}}\n⏰ Time: {{departure_time}}\n🏨 Hotel: {{hotel_name}}\n\nHave a blessed journey!\n\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name","booking_id","flight_number","departure_date","departure_time","hotel_name"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "departure_reminder", display_name: "Departure Reminder", category: "UTILITY", event_type: "departure_reminder",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🕌 Departure Reminder!\n\nYour journey begins tomorrow, Insha'Allah.\n\n📋 Booking: {{booking_id}}\n✈️ Flight: {{flight_number}}\n📅 Date: {{departure_date}}\n⏰ Time: {{departure_time}}\n\nPlease report 3 hours before departure.\n\nMay Allah accept your Hajj/Umrah. Ameen!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","flight_number","departure_date","departure_time"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "arrival_welcome", display_name: "Arrival Welcome", category: "MARKETING", event_type: "custom_admin",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🌙 Welcome to the Holy Land!\n\nAlhamdulillah, you have arrived safely.\n\n📋 Booking: {{booking_id}}\n🏨 Hotel: {{hotel_name}}\n🛏️ Room: {{room_number}}\n\nFor any assistance, contact your group leader or call +91 9893225590.\n\nMay Allah bless your journey!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","hotel_name","room_number"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "refund", display_name: "Refund Processed", category: "UTILITY", event_type: "custom_admin",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n💸 Refund Processed\n\n📋 Booking ID: {{booking_id}}\n💰 Refund Amount: ₹{{amount}}\n🧾 Reference: {{invoice_number}}\n\nYour refund has been processed and will reflect within 5-7 business days.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","amount","invoice_number"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "cancellation", display_name: "Cancellation Notice", category: "UTILITY", event_type: "booking_cancelled",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n❌ Booking Cancelled\n\n📋 Booking ID: {{booking_id}}\n📦 Package: {{package_name}}\n\nYour booking has been cancelled as per your request. Our team will process any applicable refund.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels",
        variables: ["customer_name","booking_id","package_name"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "eid_greeting", display_name: "Eid Greeting", category: "MARKETING", event_type: "custom_admin",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🌙✨ Eid Mubarak! ✨🌙\n\nWishing you and your family a blessed Eid filled with joy, peace, and prosperity.\n\nMay Allah accept your prayers and grant you His blessings.\n\nTaqabbalallahu Minna Wa Minkum!\n\nWarm Regards,\nAl Burhan Tours & Travels\n+91 9893225590",
        variables: ["customer_name"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "hajj_promotion", display_name: "Hajj Promotion", category: "MARKETING", event_type: "custom_admin",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🕌 Hajj 2025 — Limited Seats Available!\n\nAl Burhan Tours & Travels is pleased to announce our Hajj packages.\n\n📦 Package: {{package_name}}\n💰 Starting from: ₹{{amount}}\n\nEarly registration ensures your seat. Book now!\n\nContact: +91 9893225590\nVisit: alburhantravels.com\n\nJazak Allah Khair!\nAl Burhan Tours & Travels",
        variables: ["customer_name","package_name","amount"], footer_text: "Al Burhan Tours & Travels",
      },
      {
        name: "umrah_promotion", display_name: "Umrah Promotion", category: "MARKETING", event_type: "custom_admin",
        body_text: "Assalamu Alaikum {{customer_name}},\n\n🌙 Umrah Packages — Al Burhan Tours & Travels\n\nFulfill your spiritual journey with our blessed Umrah packages.\n\n📦 Package: {{package_name}}\n💰 Starting from: ₹{{amount}}\n\nIncludes: Visa, Flights, Hotel & Ziyarat\n\nBook Now: +91 9893225590\nVisit: alburhantravels.com\n\nMay Allah accept your Umrah. Ameen!\nAl Burhan Tours & Travels",
        variables: ["customer_name","package_name","amount"], footer_text: "Al Burhan Tours & Travels",
      },
    ];

    for (const t of BUILTIN_TEMPLATES) {
      await pool.query(`
        INSERT INTO wa_templates (name, display_name, category, language, status, header_type, body_text, footer_text, variables, event_type, enabled, is_builtin)
        VALUES ($1,$2,$3,'en','local','none',$4,$5,$6::jsonb,$7,true,true)
        ON CONFLICT (name) DO NOTHING
      `, [t.name, t.display_name, t.category, t.body_text, t.footer_text || null, JSON.stringify(t.variables), t.event_type || null]);
    }
    console.log("[Migration] wa_templates built-in templates seeded");
  } catch (err) { console.error("[Migration] wa_templates failed:", err); }

  // ── journey_status + user profile columns ─────────────────────────────────
  try {
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS journey_status TEXT DEFAULT 'booking_requested'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_group TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_mobile TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    console.log("[Migration] journey_status + user profile columns ensured");
  } catch (err) { console.error("[Migration] journey_status/profile migration failed:", err); }

  // ── BI analytics columns ───────────────────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_status TEXT`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS max_pilgrims INTEGER`);
    console.log("[Migration] BI analytics columns ensured");
  } catch (err) { console.error("[Migration] BI analytics columns failed:", err); }

  // ── bank_settings + offline_payments ──────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        bank_name TEXT DEFAULT 'State Bank of India',
        branch TEXT DEFAULT '',
        account_name TEXT DEFAULT 'Al Burhan Tours & Travels',
        account_number TEXT DEFAULT '',
        ifsc_code TEXT DEFAULT '',
        swift_code TEXT DEFAULT '',
        upi_id TEXT DEFAULT '',
        qr_code_url TEXT DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`INSERT INTO bank_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS offline_payments (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        mobile TEXT,
        email TEXT,
        amount_paid NUMERIC(12,2),
        payment_date TEXT,
        payment_time TEXT,
        bank_name TEXT,
        branch_name TEXT,
        payment_method TEXT,
        utr_number TEXT UNIQUE,
        sender_account_last4 TEXT,
        remarks TEXT,
        proof_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        verified_at TIMESTAMPTZ,
        verified_by TEXT,
        verified_by_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS offline_payments_booking_idx ON offline_payments(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS offline_payments_customer_idx ON offline_payments(customer_id)`);
    // Add new columns if not exist (upgrade)
    await pool.query(`ALTER TABLE offline_payments ADD COLUMN IF NOT EXISTS payment_reference TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE offline_payments ADD COLUMN IF NOT EXISTS admin_remarks TEXT`).catch(() => {});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS offline_payments_ref_idx ON offline_payments(payment_reference) WHERE payment_reference IS NOT NULL`).catch(() => {});
    console.log("[Migration] bank_settings + offline_payments tables ensured");
  } catch (err) { console.error("[Migration] offline payments migration failed:", err); }

  // ── notification_settings: enable email+rcs for all key pipeline events ────
  try {
    const keyEvents = [
      "booking_approved", "payment_received", "visa_approved", "visa_rejected",
      "flight_assigned", "hotel_assigned", "new_booking", "booking_rejected",
      "booking_completed", "ticket_issued", "room_assigned", "bus_assigned",
      "departure_reminder", "invoice_generated",
    ];
    const allChannels: Array<[string, boolean]> = [
      ["whatsapp", true], ["sms", true], ["email", true], ["rcs", true], ["push", false],
    ];
    for (const ev of keyEvents) {
      for (const [ch, enabled] of allChannels) {
        await pool.query(
          `INSERT INTO notification_settings (id, event_type, channel, enabled)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_type, channel) DO UPDATE SET enabled = $4`,
          [`ns_${ev}_${ch}`, ev, ch, enabled]
        );
      }
    }
    console.log("[Migration] notification_settings: email+rcs enabled for all key events");
  } catch (err) { console.error("[Migration] notification_settings key events failed:", err); }

  // ── documents: extra tracking columns + download logs ─────────────────────
  try {
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_download_logs (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        customer_id TEXT,
        downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ddl_doc_idx ON document_download_logs(document_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ddl_booking_idx ON document_download_logs(booking_id)`);
    console.log("[Migration] documents tracking columns + download_logs ensured");
  } catch (err) { console.error("[Migration] documents tracking migration failed:", err); }

  // ── Support Center tables ────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        ticket_number TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        booking_id TEXT,
        subject TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'normal',
        assigned_to TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS st_customer_idx ON support_tickets(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS st_status_idx ON support_tickets(status)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL CHECK (sender_type IN ('customer','admin')),
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        message TEXT NOT NULL,
        attachment_url TEXT,
        is_internal BOOLEAN NOT NULL DEFAULT false,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS sm_ticket_idx ON support_messages(ticket_id)`);
    console.log("[Migration] support_tickets + support_messages tables ensured");
  } catch (err) { console.error("[Migration] support tables failed:", err); }

  // ── documents: extend enum + full lifecycle columns ─────────────────────────
  try {
    const newDocTypes = [
      "hotel_voucher","payment_receipt","ziyarat_schedule","insurance",
      "hajj_id","luggage_tag","emergency_contact_card","medical_certificate",
      "vaccination_certificate","passport_copy",
    ];
    for (const t of newDocTypes) {
      try { await pool.query(`ALTER TYPE document_type ADD VALUE IF NOT EXISTS '${t}'`); } catch(_) {}
    }
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS customer_id TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_visible_to_customer BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT`);
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename TEXT`);
    await pool.query(`
      UPDATE documents d SET customer_id = b.customer_id
      FROM bookings b WHERE d.booking_id = b.id AND d.customer_id IS NULL
    `);
    console.log("[Migration] documents: extended enum + lifecycle columns ensured");
  } catch (err) { console.error("[Migration] documents lifecycle migration failed:", err); }

  // ── booking_confirmation_notifications ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_confirmation_notifications (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS bcn_booking_idx ON booking_confirmation_notifications(booking_id)`);
    console.log("[Migration] booking_confirmation_notifications table ensured");
  } catch (err) { console.error("[Migration] booking_confirmation_notifications failed:", err); }

  // ── Seed default workflow rules ────────────────────────────────────────────
  try {
    for (const rule of DEFAULT_RULES) {
      await pool.query(
        `INSERT INTO workflow_rules (name, trigger_type, description, enabled, group_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trigger_type) DO NOTHING`,
        [rule.name, rule.trigger_type, rule.description, rule.enabled, rule.group_name]
      );
    }
    console.log("[Migration] workflow rules seeded");
  } catch (err) { console.error("[Migration] workflow rules seed failed:", err); }

  // ── notification_retry_queue: generic cross-channel retry (5/15/30 min, max 3) ──
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_retry_queue (
        id TEXT PRIMARY KEY,
        notification_log_id TEXT,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL,
        customer_id TEXT,
        booking_id TEXT,
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        context JSONB,
        retry_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS nrq_status_idx ON notification_retry_queue(status, next_retry_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nrq_booking_idx ON notification_retry_queue(booking_id)`);
    console.log("[Migration] notification_retry_queue table ensured");
  } catch (err) { console.error("[Migration] notification_retry_queue migration failed:", err); }

  // ── meta_messages: outbound Meta Cloud API WhatsApp messages (v30.0) ─────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_messages (
        id TEXT PRIMARY KEY,
        wamid TEXT UNIQUE,
        recipient TEXT NOT NULL,
        template_name TEXT,
        event_type TEXT,
        booking_id TEXT,
        customer_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        http_status INTEGER,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_messages_status ON meta_messages(status, next_retry_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_messages_wamid ON meta_messages(wamid)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_messages_booking ON meta_messages(booking_id)`);
    console.log("[Migration] meta_messages table ensured");
  } catch (err) { console.error("[Migration] meta_messages migration failed:", err); }

  // ── meta_delivery_logs: delivery/read/failed callbacks from Meta webhook ─────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_delivery_logs (
        id TEXT PRIMARY KEY,
        wamid TEXT,
        status TEXT,
        timestamp TIMESTAMPTZ,
        conversation_id TEXT,
        error_code INTEGER,
        error_title TEXT,
        raw_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_delivery_wamid ON meta_delivery_logs(wamid)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_delivery_status ON meta_delivery_logs(status, created_at)`);
    console.log("[Migration] meta_delivery_logs table ensured");
  } catch (err) { console.error("[Migration] meta_delivery_logs migration failed:", err); }

  // ── meta_templates: synced from Meta WABA API ─────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_templates (
        id TEXT PRIMARY KEY,
        template_name TEXT UNIQUE NOT NULL,
        status TEXT,
        category TEXT,
        language TEXT DEFAULT 'en',
        components JSONB,
        variable_count INTEGER DEFAULT 0,
        event_type TEXT,
        synced_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_templates_event ON meta_templates(event_type)`);
    console.log("[Migration] meta_templates table ensured");
  } catch (err) { console.error("[Migration] meta_templates migration failed:", err); }

  // ── meta_token_status: token validation results ───────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_token_status (
        id TEXT PRIMARY KEY DEFAULT 'current',
        token_valid BOOLEAN DEFAULT false,
        phone_number TEXT,
        verified_name TEXT,
        waba_id TEXT,
        permissions TEXT,
        token_expires_at TIMESTAMPTZ,
        error_message TEXT,
        last_checked_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Migration] meta_token_status table ensured");
  } catch (err) { console.error("[Migration] meta_token_status migration failed:", err); }

  // ── meta_media_cache: uploaded media IDs (expires 29 days) ───────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_media_cache (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        file_hash TEXT UNIQUE,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_meta_media_hash ON meta_media_cache(file_hash)`);
    console.log("[Migration] meta_media_cache table ensured");
  } catch (err) { console.error("[Migration] meta_media_cache migration failed:", err); }

  // ── customer_push_tokens: Firebase Cloud Messaging device tokens ────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_push_tokens (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        token TEXT NOT NULL,
        platform TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(customer_id, token)
      )
    `);
    console.log("[Migration] customer_push_tokens table ensured");
  } catch (err) { console.error("[Migration] customer_push_tokens migration failed:", err); }

  // ── customer_notifications: add category column for inbox filtering ──────
  try {
    await pool.query(`ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`);
    console.log("[Migration] customer_notifications.category column ensured");
  } catch (err) { console.error("[Migration] customer_notifications.category migration failed:", err); }

  // ── customer_push_tokens: add web push subscription column ───────────────
  try {
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS subscription JSONB`);
    console.log("[Migration] customer_push_tokens.subscription column ensured");
  } catch (err) { console.error("[Migration] push subscription column failed:", err); }

  // ── push_campaigns: FCM batch send history ────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_campaigns (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        body         TEXT,
        url          TEXT,
        filter       TEXT DEFAULT 'all',
        total_tokens INT  DEFAULT 0,
        sent         INT  DEFAULT 0,
        failed       INT  DEFAULT 0,
        status       TEXT DEFAULT 'completed',
        sent_by      TEXT,
        error        TEXT,
        sent_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_campaigns_sent_at ON push_campaigns(sent_at DESC)`);
    console.log("[Migration] push_campaigns table ensured");
  } catch (err) { console.error("[Migration] push_campaigns migration failed:", err); }

  // ── customer_push_tokens: device_info + updated_at columns ───────────────
  try {
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS device_info TEXT`);
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    console.log("[Migration] customer_push_tokens device_info + updated_at ensured");
  } catch (err: any) { console.warn("[Migration] customer_push_tokens column additions (non-fatal):", err.message); }

  // ── customer_push_tokens: extended device metadata + multi-role support ───
  try {
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS user_id TEXT`);
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'customer'`);
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS browser TEXT`);
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS operating_system TEXT`);
    await pool.query(`ALTER TABLE customer_push_tokens ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`UPDATE customer_push_tokens SET user_id = customer_id WHERE user_id IS NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id   ON customer_push_tokens(user_id)   WHERE user_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_type ON customer_push_tokens(user_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_last_seen ON customer_push_tokens(last_seen DESC)`);
    console.log("[Migration] customer_push_tokens user_id/user_type/browser/os/last_seen ensured");
  } catch (err: any) { console.warn("[Migration] customer_push_tokens extended columns (non-fatal):", err.message); }

  // ── VAPID keys: ensure api_settings row exists (webPush.ts generates on first use) ───
  // No seeding needed — webPush.ts generates + persists VAPID keys on first call.

  // ── notification_settings: enable push channel for key events ─────────────
  try {
    const pushEvents = [
      "new_booking", "booking_approved", "payment_received", "partial_payment",
      "agreement_ready", "invoice_ready", "visa_issued", "ticket_issued",
      "departure_reminder", "balance_reminder",
    ];
    for (const evt of pushEvents) {
      await pool.query(
        `INSERT INTO notification_settings (id, event_type, channel, enabled, created_at)
         VALUES (gen_random_uuid()::text, $1, 'push', true, NOW())
         ON CONFLICT (event_type, channel) DO NOTHING`,
        [evt]
      );
    }
    console.log("[Migration] push channel enabled for key notification events");
  } catch (err: any) {
    console.warn("[Migration] push notification_settings seeding (non-fatal):", err.message);
  }

  // ── notification_settings: ensure sms+email for ALL critical events ──────
  try {
    const criticalEvents = [
      "new_booking","booking_approved","booking_rejected","payment_received",
      "partial_payment","partial_payment_received","agreement_generated","agreement_ready",
      "agreement_signed","invoice_generated","invoice_ready","receipt_generated",
      "visa_issued","visa_approved","ticket_issued","departure_reminder",
      "balance_reminder","journey_status_changed","custom_admin",
    ];
    for (const evt of criticalEvents) {
      for (const ch of ["sms", "email"]) {
        await pool.query(
          `INSERT INTO notification_settings (id, event_type, channel, enabled, created_at)
           VALUES (gen_random_uuid()::text, $1, $2, true, NOW())
           ON CONFLICT (event_type, channel) DO NOTHING`,
          [evt, ch]
        );
      }
    }
    console.log("[Migration] sms+email channels seeded for all critical events");
  } catch (err: any) {
    console.warn("[Migration] critical event channel seeding (non-fatal):", err.message);
  }

  // ── notification_settings: enable push for ALL 19 spec events ────────────
  try {
    const allPushEvents = [
      "booking_rejected", "receipt_generated", "hotel_assigned",
      "room_allocation", "passport_expiry", "flight_changed",
      "return_reminder", "custom_admin", "journey_status_changed",
    ];
    for (const evt of allPushEvents) {
      await pool.query(
        `INSERT INTO notification_settings (id, event_type, channel, enabled, created_at)
         VALUES (gen_random_uuid()::text, $1, 'push', true, NOW())
         ON CONFLICT (event_type, channel) DO NOTHING`,
        [evt]
      );
    }
    console.log("[Migration] push channel enabled for extended notification events");
  } catch (err: any) {
    console.warn("[Migration] extended push seeding (non-fatal):", err.message);
  }

  // ── Performance indexes (additive, safe — production stabilization pass) ────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_group_id_idx ON bookings(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS pilgrims_group_id_idx ON pilgrims(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS notification_logs_booking_id_idx ON notification_logs(booking_id)`);
    console.log("[Migration] performance indexes ensured");
  } catch (err) { console.error("[Migration] performance indexes failed:", err); }

  // ── Agreements + audit tables ─────────────────────────────────────────────
  try {
    // NOTE: bookings.id / users.id are TEXT (not UUID) in this schema,
    //       so booking_id and customer_id must also be TEXT.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_number TEXT UNIQUE NOT NULL,
        booking_id TEXT NOT NULL,
        customer_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        terms_accepted JSONB,
        signature_data TEXT,
        signed_at TIMESTAMPTZ,
        signed_ip TEXT,
        signed_user_agent TEXT,
        otp_verified BOOLEAN DEFAULT FALSE,
        otp_verified_at TIMESTAMPTZ,
        signing_otp TEXT,
        signing_otp_expires_at TIMESTAMPTZ,
        pdf_generated BOOLEAN DEFAULT FALSE,
        verification_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
        cancelled_at TIMESTAMPTZ,
        cancelled_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Fix column types if table was created with wrong UUID type (idempotent)
    try { await pool.query(`ALTER TABLE agreements ALTER COLUMN booking_id TYPE TEXT USING booking_id::text`); } catch {}
    try { await pool.query(`ALTER TABLE agreements ALTER COLUMN customer_id TYPE TEXT USING customer_id::text`); } catch {}
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agreement_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agreement_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS agreements_booking_id_idx ON agreements(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS agreements_customer_id_idx ON agreements(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS agreements_status_idx ON agreements(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS agreements_token_idx ON agreements(verification_token)`);
    console.log("[Migration] agreements + agreement_audit_logs tables ensured");
  } catch (err) { console.error("[Migration] agreements migration failed:", err); }

  // ── SMTP auto-config: bake env-injected SMTP vars into api_settings ────────
  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = process.env.SMTP_PORT || "587";
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    if (smtpHost && smtpUser && smtpPass) {
      const existing = await pool.query(`SELECT id FROM api_settings WHERE provider='smtp'`);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO api_settings (provider, enabled, api_url, api_key_encrypted, extra_fields_encrypted, updated_at, updated_by)
           VALUES ('smtp', true, $1, $2, $3, NOW(), 'migration')`,
          [smtpHost, smtpPass, JSON.stringify({ user: smtpUser, port: smtpPort, from_email: smtpFrom, from_name: "Al Burhan Tours & Travels" })]
        );
        console.log("[Migration] SMTP auto-configured in api_settings from env");
      }
    }
  } catch (err) { console.error("[Migration] SMTP auto-config failed:", err); }

  // ── Email circuit breaker: insert row if missing; keep 'suspended' until admin re-enables ──
  // This was added after Hostinger suspended info@alburhantravels.com for suspicious sending.
  // The row is only written if it doesn't exist yet, so once an admin re-enables it the
  // flag stays enabled across restarts.
  try {
    await pool.query(`
      INSERT INTO api_settings (key, value, provider, enabled, updated_at, updated_by)
      VALUES ('email_circuit_breaker', 'suspended', 'email_circuit_breaker', false, NOW(), 'migration-email-suspension')
      ON CONFLICT (key) DO NOTHING
    `);
    const cbRow = await pool.query(`SELECT value FROM api_settings WHERE key='email_circuit_breaker' LIMIT 1`);
    const cbValue = cbRow.rows[0]?.value;
    console.log(`[Migration] email_circuit_breaker = '${cbValue}' (suspended until admin re-enables via System Health)`);
  } catch (err) { console.error("[Migration] email_circuit_breaker setup failed:", err); }

  // ── Enterprise: tasks, marketing_campaigns, leads, suppliers ─────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to TEXT,
        assigned_name TEXT,
        due_date DATE,
        category TEXT DEFAULT 'general',
        booking_id TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_date)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL,
        segment TEXT NOT NULL,
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        total_recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        created_by TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mobile TEXT,
        email TEXT,
        source TEXT DEFAULT 'website',
        status TEXT DEFAULT 'new',
        message TEXT,
        package_interest TEXT,
        budget TEXT,
        assigned_to TEXT,
        assigned_name TEXT,
        follow_up_date DATE,
        notes TEXT,
        conversion_booking_id TEXT,
        converted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS leads_source_idx ON leads(source)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        contact_name TEXT,
        contact_mobile TEXT,
        contact_email TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        gst_number TEXT,
        payment_terms TEXT,
        notes TEXT,
        contract_expiry DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS suppliers_type_idx ON suppliers(type)`);
    console.log("[Migration] Enterprise tables (tasks, marketing_campaigns, leads, suppliers) ensured");
  } catch (err) { console.error("[Migration] Enterprise tables failed:", err); }

  // ── Group live tracking ───────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_tracking (
        group_id TEXT PRIMARY KEY,
        current_city TEXT,
        current_activity TEXT,
        next_activity TEXT,
        notes TEXT,
        meeting_point TEXT,
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] group_tracking table ensured");
  } catch (err) { console.error("[Migration] group_tracking failed:", err); }

  // Branches + Agents
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        city TEXT,
        address TEXT,
        manager_name TEXT,
        manager_mobile TEXT,
        manager_email TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        mobile TEXT,
        email TEXT,
        city TEXT,
        branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )
    `);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS branch_id UUID`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_id UUID`);
    console.log("[Migration] branches + agents tables ensured");
  } catch (err) { console.error("[Migration] branches/agents failed:", err); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        staff_id TEXT,
        company_id TEXT NOT NULL DEFAULT 'alburhan',
        full_name TEXT NOT NULL,
        designation TEXT,
        department TEXT,
        role TEXT NOT NULL DEFAULT 'airport_staff',
        employee_code TEXT,
        mobile_india TEXT,
        blood_group TEXT,
        date_of_birth TEXT,
        address TEXT,
        emergency_contact TEXT,
        emergency_mobile TEXT,
        joining_date TEXT,
        valid_upto TEXT,
        photo_url TEXT,
        qr_token TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        group_id TEXT,
        father_name TEXT,
        aadhaar_last_4 TEXT
      )
    `);
    console.log("[Migration] staff table ensured");
  } catch (err) { console.error("[Migration] staff table failed:", err); }

  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS staff_staff_id_unique ON staff (staff_id) WHERE staff_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS staff_qr_token_unique ON staff (qr_token) WHERE qr_token IS NOT NULL`);
    console.log("[Migration] staff unique indexes ensured");
  } catch (err) { console.error("[Migration] staff unique indexes failed:", err); }

  // ── Staff ID sequences (concurrency-safe ID generation) ───────────────────
  try {
    // Derive start value from existing max so the sequence never produces a
    // collision with IDs that were already assigned by the old MAX() approach.
    const abtMax = await pool.query(
      `SELECT COALESCE(MAX(CAST(split_part(staff_id, '-', 3) AS INTEGER)), 0) AS n FROM staff WHERE staff_id LIKE 'ABT-STAFF-%'`
    );
    const hznMax = await pool.query(
      `SELECT COALESCE(MAX(CAST(split_part(staff_id, '-', 3) AS INTEGER)), 0) AS n FROM staff WHERE staff_id LIKE 'HZN-STAFF-%'`
    );
    const abtStart = (abtMax.rows[0]?.n ?? 0) + 1;
    const hznStart = (hznMax.rows[0]?.n ?? 0) + 1;
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS staff_id_seq_abt START WITH ${abtStart} MINVALUE 1`);
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS staff_id_seq_hzn START WITH ${hznStart} MINVALUE 1`);
    console.log("[Migration] staff ID sequences ensured (abt_start=%d, hzn_start=%d)", abtStart, hznStart);
  } catch (err) { console.error("[Migration] staff ID sequences failed:", err); }

  // ── sender_ids: DLT approved sender headers ───────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sender_ids (
        id TEXT PRIMARY KEY,
        sender_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        default_sender BOOLEAN NOT NULL DEFAULT FALSE,
        header_type TEXT,
        creator TEXT,
        header_classification TEXT,
        valid_till DATE,
        registration_date DATE,
        operator_status TEXT,
        global_status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const APPROVED = [
      { id: "sid_aburha", sender_id: "ABURHA", default_sender: true,  header_type: "Transactional", creator: "Al Burhan Tours & Travels", header_classification: "Transaction", operator_status: "Registered", global_status: "Approved" },
      { id: "sid_alburh", sender_id: "ALBURH", default_sender: false, header_type: "Transactional", creator: "Al Burhan Tours & Travels", header_classification: "Transaction", operator_status: "Registered", global_status: "Approved" },
      { id: "sid_albur",  sender_id: "ALBUR",  default_sender: false, header_type: "Transactional", creator: "Al Burhan Tours & Travels", header_classification: "Transaction", operator_status: "Registered", global_status: "Approved" },
      { id: "sid_abtumr", sender_id: "ABTUMR", default_sender: false, header_type: "Transactional", creator: "Al Burhan Tours & Travels", header_classification: "Transaction", operator_status: "Registered", global_status: "Approved" },
      { id: "sid_abtthj", sender_id: "ABTTHJ", default_sender: false, header_type: "Transactional", creator: "Al Burhan Tours & Travels", header_classification: "Transaction", operator_status: "Registered", global_status: "Approved" },
    ];
    for (const s of APPROVED) {
      await pool.query(
        `INSERT INTO sender_ids (id, sender_id, status, default_sender, header_type, creator, header_classification, operator_status, global_status, created_at, updated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,NOW(),NOW())
         ON CONFLICT (sender_id) DO NOTHING`,
        [s.id, s.sender_id, s.default_sender, s.header_type, s.creator, s.header_classification, s.operator_status, s.global_status]
      );
    }
    console.log("[Migration] sender_ids table ensured (5 approved DLT sender IDs seeded)");
  } catch (err) { console.error("[Migration] sender_ids migration failed:", err); }

  // v29.1-pre — Ensure payment_transactions has created_at/updated_at (older DBs may be missing it)
  try {
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  } catch (err: any) { console.warn("[Migration] v29.1-pre payment_transactions timestamps:", err.message); }

  // v29.1 — Performance indexes for high-frequency query columns (each independent)
  const v291Indexes: [string, string][] = [
    ["idx_attendance_logs_event_id",        "CREATE INDEX IF NOT EXISTS idx_attendance_logs_event_id ON attendance_logs(event_id)"],
    ["idx_pilgrims_barcode_id",             "CREATE INDEX IF NOT EXISTS idx_pilgrims_barcode_id ON pilgrims(barcode_id)"],
    ["idx_pilgrims_family_id",              "CREATE INDEX IF NOT EXISTS idx_pilgrims_family_id ON pilgrims(family_id)"],
    ["idx_pilgrims_mobile_india",           "CREATE INDEX IF NOT EXISTS idx_pilgrims_mobile_india ON pilgrims(mobile_india)"],
    ["idx_payment_transactions_created_at", "CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at DESC)"],
    ["idx_notification_logs_channel",       "CREATE INDEX IF NOT EXISTS idx_notification_logs_channel ON notification_logs(channel)"],
    ["idx_reminder_logs_booking_id",        "CREATE INDEX IF NOT EXISTS idx_reminder_logs_booking_id ON reminder_logs(booking_id)"],
    ["idx_reminder_logs_sent_at",           "CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at ON reminder_logs(sent_at DESC)"],
  ];
  let v291ok = 0;
  for (const [name, sql] of v291Indexes) {
    try { await pool.query(sql); v291ok++; }
    catch (err: any) { console.warn(`[Migration] v29.1 index ${name} skipped: ${err.message}`); }
  }
  console.log(`[Migration] v29.1 performance indexes: ${v291ok}/${v291Indexes.length} ensured`);

  // v29.2 — notification_logs.sender_id column (was mistakenly added to notification_templates only)
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS sender_id TEXT`);
    console.log("[Migration] v29.2 notification_logs.sender_id ensured");
  } catch (err: any) { console.warn("[Migration] v29.2 notification_logs.sender_id:", err.message); }

  // v29.2 — Fast2SMS api_settings: seed notify_template_id + otp_template_id + sender_id if blank
  // api_settings column is "provider" (not "service"); extra is stored encrypted in extra_fields_encrypted.
  // The apiSettingsProvider already has hardcoded defaults; this updates the DB so getCachedConfig()
  // reads real values instead of overriding with empty strings from an under-populated DB row.
  // NOTE: extra_fields_encrypted is AES-encrypted by apiSettingsProvider — we can't safely write it
  // here. Instead, delete any fast2sms row that has an empty/null extra so the env-based default
  // (notify_template_id=211277, otp_template_id=164844, sender_id=ALBURH) kicks in via fallback.
  try {
    // Only delete if the DB row has empty/missing notify_template_id (i.e. it's the stale placeholder)
    // apiSettingsProvider will re-create it properly on next cache warm with env-based defaults.
    const chk = await pool.query(`
      SELECT id, extra_fields_encrypted FROM api_settings WHERE provider = 'fast2sms' LIMIT 1`);
    if (chk.rows.length > 0) {
      // Row exists — apiSettingsProvider handles merging; no action needed here.
      console.log("[Migration] v29.2 Fast2SMS api_settings: row exists, apiSettingsProvider will handle defaults");
    } else {
      console.log("[Migration] v29.2 Fast2SMS api_settings: no row — apiSettingsProvider will create on first init");
    }
  } catch (err: any) { console.warn("[Migration] v29.2 Fast2SMS api_settings:", err.message); }

  // v29.2 — Exhaust notification_retry_queue entries stuck on deprecated BotBee template 333473
  // That template no longer exists in the BotBee account; retrying it floods PM2 logs.
  // notification_retry_queue uses column "context" (JSONB) for payload data, plus "message" TEXT.
  try {
    const r = await pool.query(`
      UPDATE notification_retry_queue
      SET status = 'failed', retry_count = 10,
          last_error = 'Deprecated template 333473 (conformation) removed from BotBee account — exhausted by migration v29.2',
          updated_at = NOW()
      WHERE status = 'pending'
        AND (message LIKE '%333473%' OR context::text LIKE '%333473%' OR context::text LIKE '%conformation%')`);
    if (r.rowCount && r.rowCount > 0)
      console.log(`[Migration] v29.2 exhausted ${r.rowCount} stuck retry entries (template 333473)`);
    else
      console.log("[Migration] v29.2 no pending template-333473 retry entries found");
  } catch (err: any) { console.warn("[Migration] v29.2 retry queue cleanup:", err.message); }

  // v29.2 — Also mark notification_logs for template 333473 as permanently failed
  try {
    await pool.query(`
      UPDATE notification_logs
      SET status = 'failed', retry_count = 10
      WHERE channel = 'whatsapp'
        AND status = 'failed'
        AND (provider_response::text LIKE '%333473%' OR provider_response::text LIKE '%conformation%')
        AND retry_count < 10`);
  } catch (_) {}

  // v30.3 — Replace any legacy domain references stored in DB with the canonical
  //          alburhantravels.com domain. Idempotent UPDATEs safe to run on every startup.
  //          Old domain decoded at runtime (base64) so esbuild cannot fold the literal.
  const _old = Buffer.from("YWxidXJoYW50cmF2ZWxzLm9ubGluZQ==", "base64").toString();
  const _new = "alburhantravels.com";
  try {
    const { rowCount: wcRows } = await pool.query(
      `UPDATE social_platform_configs SET webhook_url = REPLACE(webhook_url, $1, $2) WHERE webhook_url LIKE $3`,
      [_old, _new, "%" + _old + "%"]
    );
    if (wcRows && wcRows > 0)
      console.log(`[Migration] v30.3 updated ${wcRows} social_platform_configs webhook_url row(s) to .com`);
  } catch (_) {}

  try {
    const { rowCount: asRows } = await pool.query(
      `UPDATE api_settings SET value = REPLACE(value, $1, $2) WHERE value LIKE $3`,
      [_old, _new, "%" + _old + "%"]
    );
    if (asRows && asRows > 0)
      console.log(`[Migration] v30.3 updated ${asRows} api_settings value row(s) to .com`);
  } catch (_) {}

  try {
    const { rowCount: nbRows } = await pool.query(
      `UPDATE notifications SET message = REPLACE(message, $1, $2) WHERE message LIKE $3 AND created_at > NOW() - INTERVAL '90 days'`,
      [_old, _new, "%" + _old + "%"]
    );
    if (nbRows && nbRows > 0)
      console.log(`[Migration] v30.3 updated ${nbRows} recent notification message(s) to .com`);
  } catch (_) {}

  // v30.4 — Migrate Firebase api_settings from legacy Server Key to FCM v1 format.
  //          CONDITIONAL — only clears values that are genuinely legacy/corrupted;
  //          preserves valid PEM private keys and service-account JSON.
  //          Safe to run on every startup.
  try {
    // Always clear legacy api_url (FCM v1 uses a fixed endpoint, not configurable)
    await pool.query(
      `UPDATE api_settings SET api_url = NULL
       WHERE provider = 'firebase' AND api_url IS NOT NULL AND api_url != ''`
    );

    const fbRow = await pool.query(
      `SELECT api_key_encrypted, extra_fields_encrypted FROM api_settings WHERE provider='firebase'`
    );
    if (fbRow.rows[0]) {
      const row = fbRow.rows[0];
      const { decrypt } = await import("./lib/encryption.js");

      // ── api_key_encrypted: only clear if NOT a valid PEM or service-account JSON ──
      if (row.api_key_encrypted) {
        const keyStr = decrypt(row.api_key_encrypted);
        const normalized = (keyStr || "").replace(/\\n/g, "\n").trim();
        const isValidPem  = normalized.startsWith("-----BEGIN PRIVATE KEY-----");
        let   isValidJson = false;
        try { const sa = JSON.parse(keyStr); isValidJson = !!(sa && sa.private_key); } catch {}

        if (!isValidPem && !isValidJson) {
          // Looks like a legacy Server Key or corrupted value — clear it
          await pool.query(`UPDATE api_settings SET api_key_encrypted = NULL WHERE provider='firebase'`);
          console.log("[Migration v30.4] Cleared legacy/corrupted Firebase api_key_encrypted");
        }
        // else: valid FCM v1 key — silently preserve it
      }

      // ── extra_fields_encrypted: only clear if it has ONLY legacy sender_id (no modern fields) ──
      if (row.extra_fields_encrypted) {
        let extra: Record<string, any> = {};
        try { extra = JSON.parse(decrypt(row.extra_fields_encrypted)); } catch {}
        const hasLegacyOnly = extra.sender_id !== undefined &&
                              !extra.project_id && !extra.client_email;
        if (hasLegacyOnly) {
          await pool.query(`UPDATE api_settings SET extra_fields_encrypted = NULL WHERE provider='firebase'`);
          console.log("[Migration v30.4] Cleared legacy Firebase sender_id extra_fields");
        }
        // else: has project_id / client_email — preserve it
      }
    }
  } catch (err: any) {
    console.warn("[Migration] v30.4 firebase legacy cleanup:", err.message);
  }

  // v30.5 — One-time clean slate: wipe ALL Firebase credentials (api_key + extra_fields)
  //          so corrupted values from earlier sessions cannot persist.
  //          A marker row "_fb_cleared_v305" prevents this from running on subsequent startups.
  try {
    const markerCheck = await pool.query(
      `SELECT 1 FROM api_settings WHERE provider = '_fb_cleared_v305'`
    );
    if (!markerCheck.rows.length) {
      // Clear corrupted credentials
      await pool.query(
        `UPDATE api_settings
         SET api_key_encrypted = NULL, extra_fields_encrypted = NULL
         WHERE provider = 'firebase'`
      );
      // Write the marker so this never runs again
      await pool.query(
        `INSERT INTO api_settings (provider, enabled, updated_at, updated_by)
         VALUES ('_fb_cleared_v305', false, NOW(), 'migration')
         ON CONFLICT (provider) DO NOTHING`
      );
      console.log("[Migration v30.5] Firebase credentials cleared — re-enter via API Settings → Firebase Push (FCM v1)");
    }
  } catch (err: any) {
    console.warn("[Migration v30.5] firebase clean slate:", err.message);
  }
}

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;
const finalPort = Number.isNaN(port) || port <= 0 ? 8080 : port;

// Run migrations FIRST, then start server — ensures session table exists before any request
async function start() {
  console.log("[Startup] Running migrations...");
  await runMigrations();

  // Init API Settings provider (loads encrypted credentials from DB into memory cache)
  const { initApiSettingsProvider } = await import("./lib/apiSettingsProvider.js");
  await initApiSettingsProvider();

  // Auto-configure Meta Cloud API from BotBee's embedded WABA token.
  // This enables proper {{1}},{{2}} variable substitution — BotBee's own template API never substitutes.
  import("./lib/botbee.js").then(({ autoSyncBotBeeMetaToken }) => {
    autoSyncBotBeeMetaToken().then(r => {
      if (r.ok) console.log("[Startup] Meta Cloud API ✅:", r.message);
      else console.warn("[Startup] Meta Cloud API not configured:", r.message);
    }).catch(err => console.warn("[Startup] autoSyncBotBeeMetaToken failed (non-fatal):", err?.message));
  }).catch(() => {});

  try {
    await db.update(usersTable)
      .set({ role: "admin" })
      .where(inArray(usersTable.mobile, ADMIN_MOBILES));
    // Controlled backfill: explicitly assign super_admin to known admin accounts
    await pool.query(
      `UPDATE users SET admin_role = 'super_admin' WHERE mobile = ANY($1) AND admin_role = 'read_only'`,
      [ADMIN_MOBILES]
    );
    console.log("[Startup] Admin roles synced");
  } catch (err) {
    console.error("[Startup] Failed to sync admin roles:", err);
  }

  // Auto-sync journal entries for historical data (non-blocking)
  import("./lib/journalHelper.js").then(({ syncAllJournalEntries }) => {
    syncAllJournalEntries().then(({ payments, expenses }) => {
      if (payments + expenses > 0)
        console.log(`[Startup] Journal sync: ${payments} payment entries + ${expenses} expense entries created`);
      else
        console.log("[Startup] Journal sync: all entries already up to date");
    }).catch(err => console.error("[Startup] Journal sync failed (non-fatal):", err));
  }).catch(() => {});

  // ── user_role enum: add portal roles missing from original Drizzle migration ─
  try {
    for (const val of ["branch_manager", "agent", "staff", "super_admin"]) {
      try {
        await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS '${val}'`);
      } catch (_) {}
    }
    console.log("[Migration] user_role enum values ensured (branch_manager, agent, staff, super_admin)");
  } catch (err) { console.error("[Migration] user_role enum extension failed:", err); }

  // ── otps table: ensure attempts column ─────────────────────────────────────
  try {
    await pool.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
    console.log("[Migration] otps.attempts column ensured");
  } catch (err) { console.error("[Migration] otps.attempts failed:", err); }

  // ── users table: ensure all columns used by auth code ─────────────────────
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id TEXT`);
    console.log("[Migration] users: status, is_verified, branch_id columns ensured");
  } catch (err) { console.error("[Migration] users extra columns failed:", err); }

  // ── feedback table ─────────────────────────────────────────────────────────
  try {
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status') THEN
          CREATE TYPE feedback_status AS ENUM ('open','in_review','resolved','closed');
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        pilgrim_mobile TEXT NOT NULL,
        pilgrim_name TEXT,
        booking_id TEXT,
        company_id TEXT,
        group_id TEXT,
        group_name TEXT,
        rating_overall INTEGER,
        rating_accommodation_makkah1 INTEGER,
        rating_accommodation_makkah2 INTEGER,
        rating_accommodation_madinah INTEGER,
        rating_transportation INTEGER,
        rating_food INTEGER,
        rating_guide INTEGER,
        rating_visa_documentation INTEGER,
        comment TEXT,
        what_did_you_like TEXT,
        suggestions TEXT,
        would_recommend TEXT,
        is_complaint BOOLEAN NOT NULL DEFAULT false,
        status feedback_status NOT NULL DEFAULT 'open',
        assigned_to TEXT,
        internal_notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[Migration] feedback table ensured");
  } catch (err) { console.error("[Migration] feedback table failed:", err); }

  // v30.0 — notification_templates: add custom/custom_sms/custom_admin SMS template entries
  // These allow admin to configure DLT template IDs for custom admin notifications via
  // Admin → DLT Template Manager. Inserted with enabled=false until DLT IDs are configured.
  try {
    const customEntries = [
      { id: "tpl_seed_custom_sms",   name: "Custom SMS",         event_type: "custom_sms" },
      { id: "tpl_seed_custom_admin", name: "Custom Admin SMS",   event_type: "custom_admin" },
      { id: "tpl_seed_custom",       name: "Generic Custom SMS", event_type: "custom" },
      { id: "tpl_seed_agr_ready",    name: "Agreement Ready",    event_type: "agreement_ready" },
      { id: "tpl_seed_agr_signed",   name: "Agreement Signed",   event_type: "agreement_signed" },
    ];
    for (const e of customEntries) {
      await pool.query(`
        INSERT INTO notification_templates
          (id, name, event_type, channel, body, is_default, enabled, provider, language, category, created_at, updated_at)
        VALUES ($1,$2,$3,'sms',''::text,false,false,'fast2sms','en','UTILITY',NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [e.id, e.name, e.event_type]);
    }
    console.log("[Migration] v30.0 custom SMS notification_templates seed ensured");
  } catch (err: any) { console.warn("[Migration] v30.0 custom SMS templates:", err.message); }

  // v30.0 — notification_templates: update sender_id from ABURHA → ALBURH on all SMS rows
  // ALBURH is the registered transactional sender ID per DLT config (OTP DLT doc)
  try {
    await pool.query(`
      UPDATE notification_templates
      SET sender_id='ALBURH', updated_at=NOW()
      WHERE channel='sms' AND (sender_id='ABURHA' OR sender_id IS NULL OR sender_id='')
    `);
    console.log("[Migration] v30.0 notification_templates sender_id ABURHA→ALBURH updated");
  } catch (err: any) { console.warn("[Migration] v30.0 sender_id update:", err.message); }

  // v30.1 — notification_templates: seed missing SMS event rows (disabled by default; admin enables + sets TID)
  try {
    // Events with no working DLT template yet — seeded as disabled placeholders
    const disabledSeeds = [
      ["booking_rejected",      "Booking Rejected",              "new_booking"],
      ["partial_payment",       "Partial Payment Received",      "payment_received"],
      ["visa_approved",         "Visa Issued",                   "ticket_issued"],
      ["hotel_assigned",        "Hotel Voucher Issued",          "ticket_issued"],
      ["arrival_reminder",      "Arrival Reminder",              "departure_reminder"],
      ["welcome_saudi_arabia",  "Welcome to Saudi Arabia",       "departure_reminder"],
      ["return_reminder",       "Return Reminder",               "departure_reminder"],
      ["eid_greeting",          "Eid Greeting",                  "eid_greeting"],
      ["room_allocation",       "Room Allocated",                "hotel_assigned"],
      ["agreement_ready",       "Agreement Ready to Sign",       "agreement_signed"],
    ];
    for (const [event_type, name] of disabledSeeds) {
      await pool.query(`
        INSERT INTO notification_templates
          (id, channel, event_type, name, body, dlt_template_id, sender_id, enabled, created_at, updated_at)
        SELECT gen_random_uuid(), 'sms', $1, $2, '', '', 'ALBURH', false, NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM notification_templates WHERE channel='sms' AND event_type=$1
        )
      `, [event_type, name]);
    }
    // OTP events — enabled but blank TID (admin must fill in)
    const otpSeeds = [
      ["mobile_otp",          "Login / Registration OTP"],
      ["forgot_password_otp", "Forgot Password OTP"],
    ];
    for (const [event_type, name] of otpSeeds) {
      await pool.query(`
        INSERT INTO notification_templates
          (id, channel, event_type, name, body, dlt_template_id, sender_id, enabled, created_at, updated_at)
        SELECT gen_random_uuid(), 'sms', $1, $2, '', '', 'ALBURH', true, NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM notification_templates WHERE channel='sms' AND event_type=$1
        )
      `, [event_type, name]);
    }
    console.log("[Migration] v30.1 missing SMS notification_templates rows seeded");
  } catch (err: any) { console.warn("[Migration] v30.1 SMS template seed:", err.message); }

  // ── v31.0 — RCS Template Mappings + notification_logs RCS columns ───────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rcs_template_mappings (
        erp_event          TEXT PRIMARY KEY,
        template_name      TEXT NOT NULL DEFAULT '',
        template_id        TEXT,
        alt_template_id    TEXT,
        carrier            TEXT DEFAULT 'jio',
        template_type      TEXT DEFAULT 'transactional',
        variables_required TEXT[] DEFAULT '{}',
        enabled            BOOLEAN DEFAULT true,
        last_success_at    TIMESTAMPTZ,
        last_failure_at    TIMESTAMPTZ,
        last_failure_reason TEXT,
        notes              TEXT,
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        updated_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed approved Jio RCS templates (ON CONFLICT = skip if already exists)
    await pool.query(`
      INSERT INTO rcs_template_mappings (erp_event, template_name, template_id, variables_required, notes) VALUES
        ('booking_submitted',        'Booking_Submitted',          '3651', ARRAY['customer_name','booking_id','package_name'],                     NULL),
        ('booking_confirmed',        'Booking_Approved',           '3652', ARRAY['customer_name','booking_id','package_name','amount'],            NULL),
        ('booking_approved',         'Booking_Approved',           '3652', ARRAY['customer_name','booking_id','package_name','amount'],            NULL),
        ('payment_received',         'Payment_Received',           '3654', ARRAY['customer_name','booking_id','amount','receipt_number'],          '3656 also available as alternative'),
        ('pending_payment_reminder', 'Pending_Payment_Reminder',   '3655', ARRAY['customer_name','booking_id','balance_amount'],                   NULL),
        ('invoice_ready',            'Invoice_Generated',          '3657', ARRAY['customer_name','booking_id','invoice_number','amount'],          NULL),
        ('flight_ticket',            'Ticket_Issued',              '3659', ARRAY['customer_name','booking_id','flight_number','airline_name','departure_date'], NULL),
        ('visa_ready',               'Visa_Issued',                '3660', ARRAY['customer_name','booking_id'],                                    NULL),
        ('agreement_ready',          'Agreement_Ready',            '3661', ARRAY['customer_name','booking_id','agreement_number','document_url'],  NULL),
        ('hotel_voucher',            'Hotel_Voucher',              NULL,   ARRAY['customer_name','booking_id','hotel_name'],                       'Template not mapped — add approved Lemin template ID'),
        ('departure_reminder',       'Departure_Reminder',         NULL,   ARRAY['customer_name','booking_id','departure_date'],                   'Template not mapped — add approved Lemin template ID'),
        -- OTP template 3663 (alburhan_login_otp) — all aliases share the same template
        ('login_otp',              'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('otp_login',              'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('customer_login_otp',     'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('admin_login_otp',        'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('agent_login_otp',        'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('branch_login_otp',       'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('staff_login_otp',        'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('password_reset_otp',     'alburhan_login_otp', '3663', ARRAY['otp'], NULL),
        ('mobile_verification_otp','alburhan_login_otp', '3663', ARRAY['otp'], NULL)
      ON CONFLICT (erp_event) DO NOTHING
    `);
    console.log("[Migration] v31.0 rcs_template_mappings seeded");
  } catch (err: any) { console.warn("[Migration] v31.0 rcs_template_mappings:", err.message); }

  // ── v31.1 — Correct approved template IDs + exact Lemin variable key names ──
  // Variables confirmed by probing each template with the Lemin API (error messages list exact keys).
  // Key format varies per template family:
  //   3651/3652/3655 → plain "name"
  //   3656           → "booking id", "invoice no", "{{amount}}", "{{customer_name}}"
  //   3657/3659/3660 → "{{double_brace}}" format
  //   3661           → "#!hash_bang!#" format + emoji prefix variants
  //   3663           → plain "otp"
  try {
    await pool.query(`
      INSERT INTO rcs_template_mappings
        (erp_event, template_name, template_id, variables_required, enabled, notes)
      VALUES
        ('booking_submitted',        'Booking_Submitted',          '3651',
          ARRAY['name'],
          true, 'Lemin key: name'),
        ('booking_confirmed',        'Booking_Approved',           '3652',
          ARRAY['name'],
          true, 'Lemin key: name'),
        ('booking_approved',         'Booking_Approved',           '3652',
          ARRAY['name'],
          true, 'Lemin key: name'),
        ('payment_received',         'Payment_Received',           '3656',
          ARRAY['booking id','invoice no','{{amount}}','{{customer_name}}'],
          true, 'Lemin keys: booking id, invoice no, {{amount}}, {{customer_name}}'),
        ('pending_payment_reminder', 'Pending_Payment_Reminder',   '3655',
          ARRAY['name'],
          true, 'Lemin key: name'),
        ('invoice_ready',            'Invoice_Generated',          '3657',
          ARRAY['{{customer_name}}','{{invoice_number}}','{{booking_id}}','{{amount}}'],
          true, 'Lemin keys: {{customer_name}}, {{invoice_number}}, {{booking_id}}, {{amount}}'),
        ('flight_ticket',            'Ticket_Issued',              '3659',
          ARRAY['{{customer_name}}','{{booking_id}}','{{ticket_number}}','{{flight_number}}','{{departure_date}} at {{departure_time}}'],
          true, 'Lemin keys: {{customer_name}}, {{booking_id}}, {{ticket_number}}, {{flight_number}}, composite departure'),
        ('visa_ready',               'Visa_Issued',                '3660',
          ARRAY['{{booking_id}}','{{visa_number}}','{{package_name}}','{{customer_name}}'],
          true, 'Lemin keys: {{booking_id}}, {{visa_number}}, {{package_name}}, {{customer_name}}'),
        ('agreement_ready',          'Agreement_Ready',            '3661',
          ARRAY['#!name!#',': #!agreement!#','🔗 #!download!#','#!bookingid!#'],
          true, 'Lemin keys: #!name!#, : #!agreement!#, 🔗 #!download!#, #!bookingid!#'),
        ('login_otp',                'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('otp_login',                'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('customer_login_otp',       'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('admin_login_otp',          'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('agent_login_otp',          'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('branch_login_otp',         'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('staff_login_otp',          'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('password_reset_otp',       'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL),
        ('mobile_verification_otp',  'alburhan_login_otp',         '3663', ARRAY['otp'], true, NULL)
      ON CONFLICT (erp_event) DO UPDATE
        SET template_id        = EXCLUDED.template_id,
            template_name      = EXCLUDED.template_name,
            variables_required = EXCLUDED.variables_required,
            enabled            = EXCLUDED.enabled,
            notes              = EXCLUDED.notes,
            updated_at         = NOW()
    `);
    console.log("[Migration] v31.1 rcs_template_mappings corrected — exact Lemin variable keys set");
  } catch (err: any) { console.warn("[Migration] v31.1 rcs_template_mappings fix:", err.message); }

  // ── v32.0 — Google OAuth: add health columns to oauth_connections + repair stale records ──
  try {
    await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS connection_status  TEXT DEFAULT 'unknown'`);
    await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS last_refresh_at    TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS last_error         TEXT`);
    await pool.query(`ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS last_api_call_at   TIMESTAMPTZ`);
    // Repair: google rows with access_token but no refresh_token → reconnect_required
    await pool.query(`
      UPDATE oauth_connections
      SET connection_status = 'reconnect_required',
          last_error        = 'No refresh token stored — reconnect required'
      WHERE provider = 'google'
        AND (refresh_token IS NULL OR refresh_token = '')
        AND  access_token IS NOT NULL AND access_token != ''
        AND (connection_status IS NULL OR connection_status IN ('unknown',''))
    `);
    // google rows with both tokens → mark connected (health cron will verify)
    await pool.query(`
      UPDATE oauth_connections
      SET connection_status = 'connected'
      WHERE provider = 'google'
        AND refresh_token IS NOT NULL AND refresh_token != ''
        AND (connection_status IS NULL OR connection_status IN ('unknown',''))
    `);
    console.log("[Migration] v32.0 oauth_connections Google health columns ensured");
  } catch (err: any) { console.warn("[Migration] v32.0 google health cols:", err.message); }

  // ── v31.2 — Fix api_settings.extra.template_id for lemin if it contains non-numeric garbage ──
  // Root cause: admin saved placeholder/help text as the template_id value. Any non-numeric value
  // is replaced with "3651" (the approved booking_submitted template).
  try {
    await pool.query(`
      UPDATE api_settings
      SET extra = jsonb_set(extra, '{template_id}', '"3651"'::jsonb)
      WHERE provider = 'lemin'
        AND (
          extra->>'template_id' IS NULL
          OR extra->>'template_id' = ''
          OR extra->>'template_id' !~ '^[0-9]+$'
        )
    `);
    console.log("[Migration] v31.2 lemin template_id sanitised — non-numeric values replaced with 3651");
  } catch (err: any) { console.warn("[Migration] v31.2 lemin template_id fix:", err.message); }

  // v31.0 — notification_logs: add RCS tracking columns
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS message_id        TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS delivery_status   TEXT DEFAULT 'unknown'`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS last_status_check TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS read_at           TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS template_id       TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS template_name     TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idempotency_key   TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nl_message_id ON notification_logs(message_id) WHERE message_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nl_idempotency ON notification_logs(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    console.log("[Migration] v31.0 notification_logs RCS columns ensured");
  } catch (err: any) { console.warn("[Migration] v31.0 notification_logs cols:", err.message); }

  // v32.0 — notification_logs: provider_message_id, failed_at, error_message columns (Task #327)
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS provider_message_id TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS failed_at           TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error_message       TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nl_provider_msg ON notification_logs(provider_message_id) WHERE provider_message_id IS NOT NULL`);
    console.log("[Migration] v32.0 notification_logs provider_message_id/failed_at/error_message ensured");
  } catch (err: any) { console.warn("[Migration] v32.0 notification_logs cols:", err.message); }

  // ── v33.0 — documents: add access_token for secure public shareable links ───
  try {
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_token TEXT`);
    await pool.query(`
      UPDATE documents
      SET    access_token = gen_random_uuid()::text
      WHERE  access_token IS NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_docs_access_token
      ON documents(access_token)
      WHERE  access_token IS NOT NULL
    `);
    console.log("[Migration] v33.0 documents.access_token ensured + backfilled");
  } catch (err: any) { console.warn("[Migration] v33.0 documents access_token:", err.message); }

  // ── v33.1 — payment_transactions: UNIQUE index on reference_number (concurrent payment dedup) ──
  // Without this, two concurrent verify+webhook calls for the same Razorpay paymentId can both
  // pass the application-level WHERE NOT EXISTS check and insert duplicate payment records.
  // The UNIQUE index is the DB-level safety net that rejects the second insert with code 23505.
  try {
    // Deduplicate existing rows before creating the unique index (keeps oldest row per reference_number)
    const dupPayRows = await pool.query(
      `SELECT reference_number, MIN(created_at) AS keep_at
       FROM payment_transactions
       WHERE reference_number IS NOT NULL
       GROUP BY reference_number
       HAVING COUNT(*) > 1`
    );
    let dupPayDeleted = 0;
    for (const row of dupPayRows.rows) {
      const d = await pool.query(
        `DELETE FROM payment_transactions
         WHERE reference_number=$1
           AND ctid NOT IN (
             SELECT ctid FROM payment_transactions
             WHERE reference_number=$1
             ORDER BY created_at ASC LIMIT 1
           )`,
        [row.reference_number]
      );
      dupPayDeleted += d.rowCount ?? 0;
    }
    if (dupPayDeleted > 0) console.log(`[Migration] v33.1 removed ${dupPayDeleted} duplicate payment_transactions rows`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_reference_number
      ON payment_transactions(reference_number)
      WHERE reference_number IS NOT NULL
    `);
    console.log("[Migration] v33.1 payment_transactions UNIQUE(reference_number) index ensured");
  } catch (err: any) { console.warn("[Migration] v33.1 payment_transactions unique index:", err.message); }

  // ── v33.2 — notification_logs: add superseded_at/superseded_by for duplicate audit trail ──
  try {
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS superseded_at  TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS superseded_by  TEXT REFERENCES notification_logs(id) ON DELETE SET NULL`);
    console.log("[Migration] v33.2 notification_logs superseded_at/superseded_by columns ensured");
  } catch (err: any) { console.warn("[Migration] v33.2 notification_logs superseded cols:", err.message); }

  // ── v33.3 — notification_logs: soft-mark historical duplicates (no deletes, no resends) ──
  // For each (booking_id, event_type, channel) group with more than one 'sent' row and no
  // idempotency_key: keep the oldest row, mark all later ones superseded_by=oldest_id.
  // This preserves the complete audit trail while making it clear which was the canonical send.
  try {
    // Create audit backup table before touching anything
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs_dup_audit (
        id            TEXT PRIMARY KEY,
        snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        original_id   TEXT NOT NULL,
        booking_id    TEXT,
        event_type    TEXT,
        channel       TEXT,
        status        TEXT,
        created_at    TIMESTAMPTZ,
        superseded_by TEXT,
        reason        TEXT
      )
    `);
    // Identify true duplicates: same booking+event+channel, status=sent, no idempotency key
    const dupGroups = await pool.query(`
      SELECT booking_id, event_type, channel,
             MIN(id) AS keep_id,
             ARRAY_AGG(id ORDER BY created_at ASC) AS all_ids
      FROM notification_logs
      WHERE status = 'sent'
        AND idempotency_key IS NULL
        AND booking_id IS NOT NULL
        AND superseded_at IS NULL
      GROUP BY booking_id, event_type, channel
      HAVING COUNT(*) > 1
    `);
    let markedCount = 0;
    for (const grp of dupGroups.rows) {
      const keepId: string = grp.keep_id;
      const laterIds: string[] = (grp.all_ids as string[]).filter((id: string) => id !== keepId);
      for (const dupId of laterIds) {
        // Write to audit table first
        await pool.query(
          `INSERT INTO notification_logs_dup_audit (id, original_id, booking_id, event_type, channel, status, created_at, superseded_by, reason)
           SELECT gen_random_uuid()::text, nl.id, nl.booking_id, nl.event_type, nl.channel, nl.status, nl.created_at, $2, 'historical_duplicate_no_idempotency_key'
           FROM notification_logs nl WHERE nl.id=$1 ON CONFLICT DO NOTHING`,
          [dupId, keepId]
        );
        // Soft-mark as superseded — does NOT change status (row still reads as 'sent' for history)
        await pool.query(
          `UPDATE notification_logs SET superseded_at=NOW(), superseded_by=$2, updated_at=NOW()
           WHERE id=$1 AND superseded_at IS NULL`,
          [dupId, keepId]
        );
        markedCount++;
      }
    }
    console.log(`[Migration] v33.3 notification_logs duplicate audit: ${dupGroups.rows.length} groups, ${markedCount} rows soft-marked superseded`);
  } catch (err: any) { console.warn("[Migration] v33.3 notification_logs dup cleanup:", err.message); }

  // ── v34.1 — invoices: tax snapshot + payment_status + immutability columns ──
  try {
    const cols = [
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tcs_rate NUMERIC(5,2)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(12,2)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS visa_charges NUMERIC(12,2) DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS additional_charges NUMERIC(12,2) DEFAULT 0`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2)`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date TIMESTAMPTZ`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS package_name TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS package_type TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS actor_id TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by TEXT`,
      `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT false`,
    ];
    for (const s of cols) await pool.query(s).catch(() => {});
    // Backfill derived columns for existing rows
    await pool.query(`UPDATE invoices SET grand_total=total WHERE grand_total IS NULL`).catch(() => {});
    await pool.query(`UPDATE invoices SET issue_date=invoice_date WHERE issue_date IS NULL`).catch(() => {});
    await pool.query(`
      UPDATE invoices SET payment_status=CASE
        WHEN paid >= total-0.01 THEN 'paid'
        WHEN paid > 0 THEN 'partially_paid'
        ELSE 'unpaid'
      END WHERE payment_status='unpaid' OR payment_status IS NULL`).catch(() => {});
    // Backfill customer_name / package_name from bookings
    await pool.query(`
      UPDATE invoices i SET
        customer_name=COALESCE(i.customer_name, b.customer_name),
        package_name=COALESCE(i.package_name, b.package_name)
      FROM bookings b WHERE b.id=i.booking_id
        AND (i.customer_name IS NULL OR i.package_name IS NULL)`).catch(() => {});
    console.log("[Migration] v34.1 invoices extended columns ensured");
  } catch (err: any) { console.warn("[Migration] v34.1 invoices extension:", err.message); }

  // ── v34.2 — invoice_number_seq + receipt_number_seq + refund_number_seq ───────
  try {
    const maxInvRes = await pool.query(`
      SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number,'/',3) AS BIGINT)),0) AS m
      FROM invoices WHERE invoice_number ~ '^ABT/[0-9]{4}/[0-9]+'`);
    const invStart = Number(maxInvRes.rows[0]?.m ?? 0) + 1;
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq MINVALUE 1`);
    // Ensure sequence is at least at invStart (setval with is_called=false sets NEXT value)
    await pool.query(`SELECT setval('invoice_number_seq', GREATEST((SELECT last_value FROM invoice_number_seq), $1), true)`, [invStart]).catch(() => {});
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS receipt_number_seq MINVALUE 1`);
    await pool.query(`CREATE SEQUENCE IF NOT EXISTS refund_number_seq MINVALUE 1`);
    console.log("[Migration] v34.2 financial sequences ensured (inv_start=%d)", invStart);
  } catch (err: any) { console.warn("[Migration] v34.2 sequences:", err.message); }

  // ── v34.3 — receipts table ────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        receipt_number TEXT UNIQUE NOT NULL,
        payment_id TEXT UNIQUE NOT NULL,
        booking_id TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        booking_number TEXT,
        package_name TEXT,
        payment_date TEXT,
        payment_method TEXT,
        reference_number TEXT,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        received_by TEXT,
        company_name TEXT NOT NULL DEFAULT 'Al Burhan Tours & Travels',
        pdf_path TEXT,
        is_void BOOLEAN NOT NULL DEFAULT false,
        void_reason TEXT,
        voided_at TIMESTAMPTZ,
        voided_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS rec_booking_idx ON receipts(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS rec_payment_idx ON receipts(payment_id)`);
    console.log("[Migration] v34.3 receipts table ensured");
  } catch (err: any) { console.warn("[Migration] v34.3 receipts:", err.message); }

  // ── v34.4 — refunds table ─────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        refund_number TEXT UNIQUE NOT NULL,
        booking_id TEXT NOT NULL,
        payment_id TEXT,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        refund_method TEXT NOT NULL DEFAULT 'bank_transfer',
        refund_reason TEXT NOT NULL,
        reference_number TEXT,
        requested_by TEXT,
        approved_by TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        approved_at TIMESTAMPTZ,
        processed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ref_booking_idx ON refunds(booking_id)`);
    console.log("[Migration] v34.4 refunds table ensured");
  } catch (err: any) { console.warn("[Migration] v34.4 refunds:", err.message); }

  // ── v34.5 — finance_audit_logs table ──────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        booking_id TEXT,
        actor_id TEXT,
        actor_name TEXT,
        actor_role TEXT,
        ip_address TEXT,
        user_agent TEXT,
        old_values JSONB,
        new_values JSONB,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fal_booking_idx ON finance_audit_logs(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fal_action_idx ON finance_audit_logs(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fal_created_idx ON finance_audit_logs(created_at DESC)`);
    console.log("[Migration] v34.5 finance_audit_logs table ensured");
  } catch (err: any) { console.warn("[Migration] v34.5 finance_audit_logs:", err.message); }

  // ── v34.6 — customer_ledger_entries table ──────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_ledger_entries (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        doc_type TEXT NOT NULL,
        doc_number TEXT,
        doc_id TEXT,
        description TEXT NOT NULL,
        debit NUMERIC(12,2) NOT NULL DEFAULT 0,
        credit NUMERIC(12,2) NOT NULL DEFAULT 0,
        running_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        source TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cle_booking_idx ON customer_ledger_entries(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cle_date_idx ON customer_ledger_entries(booking_id, entry_date ASC)`);
    console.log("[Migration] v34.6 customer_ledger_entries table ensured");
  } catch (err: any) { console.warn("[Migration] v34.6 customer_ledger_entries:", err.message); }

  // ── v34.7 — booking_settings: finance columns + bookings.payment_status ───────
  try {
    const fCols = [
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS standard_advance_pct NUMERIC(5,2) DEFAULT 50`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS balance_due_after_days INTEGER DEFAULT 50`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS discount_full_payment_required BOOLEAN DEFAULT true`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS block_visa_balance_pending BOOLEAN DEFAULT true`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'INR'`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS sar_reference_rate NUMERIC(8,2) DEFAULT 25.70`,
      `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS spc_charge NUMERIC(10,2) DEFAULT 5500`,
    ];
    for (const s of fCols) await pool.query(s).catch(() => {});
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'`).catch(() => {});
    // Backfill payment_status from paid_amount vs final_amount
    await pool.query(`
      UPDATE bookings SET payment_status = CASE
        WHEN final_amount IS NULL OR final_amount <= 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount,0) <= 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount,0) >= final_amount - 0.01 THEN 'paid'
        ELSE 'partially_paid'
      END WHERE payment_status='unpaid' OR payment_status IS NULL`).catch(() => {});
    console.log("[Migration] v34.7 finance settings columns + bookings.payment_status ensured");
  } catch (err: any) { console.warn("[Migration] v34.7 finance settings:", err.message); }

  // ── v34.8 — authoritative GST: backfill NULL gst_rate/tcs_rate on bookings ──
  // The Phase 1 delivery noted ambiguity: some bookings have NULL gst_rate.
  // These must use the system default from booking_settings, not 0.
  // This migration writes the system default into each NULL row so the
  // booking row itself becomes the authoritative snapshot going forward.
  try {
    const sysRates = await pool.query(
      `SELECT gst_rate, tcs_rate, gst_enabled, tcs_enabled FROM booking_settings WHERE id='default' LIMIT 1`
    );
    const sysGst = sysRates.rows[0]?.gst_rate ?? 5;
    const sysTcs = sysRates.rows[0]?.tcs_rate ?? 2;

    // Backfill bookings with NULL gst_rate (use system default as the snapshot)
    const gstFix = await pool.query(
      `UPDATE bookings SET gst_rate=$1 WHERE gst_rate IS NULL RETURNING id`,
      [sysGst]
    );
    // Backfill bookings with NULL tcs_rate (keep tcs = 0 if tcs not enabled, else system default)
    const tcsEnabled = sysRates.rows[0]?.tcs_enabled ?? false;
    const tcsFillValue = tcsEnabled ? sysTcs : 0;
    const tcsFix = await pool.query(
      `UPDATE bookings SET tcs_rate=$1 WHERE tcs_rate IS NULL RETURNING id`,
      [tcsFillValue]
    );

    // Backfill existing invoices that have NULL gst_rate (snapshot forward)
    await pool.query(
      `UPDATE invoices i SET gst_rate=b.gst_rate, tcs_rate=b.tcs_rate
       FROM bookings b WHERE b.id=i.booking_id
         AND (i.gst_rate IS NULL OR i.tcs_rate IS NULL)`
    ).catch(() => {});

    console.log(`[Migration] v34.8 GST/TCS backfill: ${gstFix.rowCount} bookings fixed gst_rate=${sysGst}, ${tcsFix.rowCount} bookings fixed tcs_rate=${tcsFillValue}`);
  } catch (err: any) { console.warn("[Migration] v34.8 GST backfill:", err.message); }

  // ── v35.1 — notification_logs: Communication Center required columns ────────
  try {
    await pool.query(`
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS canonical_event TEXT;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS is_manual_resend BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS original_log_id TEXT;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS rendered_preview TEXT;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS request_payload_safe JSONB;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS permanently_failed_at TIMESTAMPTZ;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS business_reference TEXT;
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS scheduled_message_id TEXT;
    `);
    // Back-fill canonical_event from event_type for existing rows
    await pool.query(`
      UPDATE notification_logs SET canonical_event = event_type
      WHERE canonical_event IS NULL AND event_type IS NOT NULL
    `);
    console.log("[Migration] v35.1 notification_logs communication columns ensured");
  } catch (err: any) { console.warn("[Migration] v35.1 notification_logs comms cols:", err.message); }

  // ── v35.2 — notification_templates: provider/approval/version columns ───────
  try {
    await pool.query(`
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS provider_template_id TEXT;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS provider_template_name TEXT;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS required_variables JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS optional_variables JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS fallback_template_id TEXT;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
    // Back-fill provider_template_id from existing dlt_template_id / botbee_template_id / meta_template_id
    await pool.query(`
      UPDATE notification_templates SET
        provider_template_id = COALESCE(provider_template_id, dlt_template_id, botbee_template_id, meta_template_id)
      WHERE provider_template_id IS NULL
        AND (dlt_template_id IS NOT NULL OR botbee_template_id IS NOT NULL OR meta_template_id IS NOT NULL)
    `).catch(() => {});
    console.log("[Migration] v35.2 notification_templates approval/version columns ensured");
  } catch (err: any) { console.warn("[Migration] v35.2 notification_templates:", err.message); }

  // ── v35.3 — communication_event_mappings table ──────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communication_event_mappings (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        primary_provider TEXT,
        fallback_provider TEXT,
        template_id TEXT,
        fallback_template_id TEXT,
        retry_max INTEGER NOT NULL DEFAULT 3,
        retry_policy JSONB NOT NULL DEFAULT '{"delays":[300,1800,7200,43200]}'::jsonb,
        recipient_type TEXT NOT NULL DEFAULT 'customer',
        send_timing TEXT NOT NULL DEFAULT 'immediate',
        attachment_policy TEXT NOT NULL DEFAULT 'link_only',
        notes TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(event_type, channel)
      )
    `);
    // Seed from notification_settings for backward compat
    await pool.query(`
      INSERT INTO communication_event_mappings (id, event_type, channel, enabled, template_id)
      SELECT
        'cem_' || event_type || '_' || channel,
        event_type, channel, enabled, template_id
      FROM notification_settings
      ON CONFLICT (event_type, channel) DO NOTHING
    `).catch(() => {});
    // Set default providers
    await pool.query(`
      UPDATE communication_event_mappings SET primary_provider = 'botbee'  WHERE channel='whatsapp' AND primary_provider IS NULL;
      UPDATE communication_event_mappings SET primary_provider = 'fast2sms' WHERE channel='sms'      AND primary_provider IS NULL;
      UPDATE communication_event_mappings SET primary_provider = 'smtp'     WHERE channel='email'    AND primary_provider IS NULL;
      UPDATE communication_event_mappings SET primary_provider = 'lemin'    WHERE channel='rcs'      AND primary_provider IS NULL;
      UPDATE communication_event_mappings SET primary_provider = 'fcm'      WHERE channel='push'     AND primary_provider IS NULL;
    `).catch(() => {});
    console.log("[Migration] v35.3 communication_event_mappings table ensured");
  } catch (err: any) { console.warn("[Migration] v35.3 communication_event_mappings:", err.message); }

  // ── v35.4 — communication_status_history ────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communication_status_history (
        id SERIAL PRIMARY KEY,
        log_id TEXT NOT NULL REFERENCES notification_logs(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        status_detail TEXT,
        provider_message_id TEXT,
        webhook_payload JSONB,
        actor TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS csh_log_id_idx ON communication_status_history(log_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS csh_created_idx ON communication_status_history(created_at DESC)`);
    console.log("[Migration] v35.4 communication_status_history table ensured");
  } catch (err: any) { console.warn("[Migration] v35.4 communication_status_history:", err.message); }

  // ── v35.5 — provider_health_status ──────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_health_status (
        provider TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        display_name TEXT NOT NULL,
        circuit_state TEXT NOT NULL DEFAULT 'closed',
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_success_at TIMESTAMPTZ,
        last_failure_at TIMESTAMPTZ,
        last_failure_reason TEXT,
        last_test_at TIMESTAMPTZ,
        last_test_result TEXT,
        total_sent_24h INTEGER NOT NULL DEFAULT 0,
        total_failed_24h INTEGER NOT NULL DEFAULT 0,
        avg_response_ms INTEGER,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Seed known providers
    const providers = [
      ["botbee",    "whatsapp", "BotBee WhatsApp"],
      ["meta",      "whatsapp", "Meta Cloud API"],
      ["fast2sms",  "sms",      "Fast2SMS (DLT)"],
      ["smtp",      "email",    "SMTP Email"],
      ["lemin",     "rcs",      "Lemin AI / Jio RCS"],
      ["fcm",       "push",     "Firebase FCM"],
      ["webpush",   "push",     "Web Push (VAPID)"],
      ["telegram",  "telegram", "Telegram Bot"],
    ];
    for (const [p, ch, dn] of providers) {
      await pool.query(
        `INSERT INTO provider_health_status (provider, channel, display_name)
         VALUES ($1,$2,$3) ON CONFLICT (provider) DO NOTHING`,
        [p, ch, dn]
      );
    }
    console.log("[Migration] v35.5 provider_health_status table ensured");
  } catch (err: any) { console.warn("[Migration] v35.5 provider_health_status:", err.message); }

  // ── v35.6 — communication_audit_logs ────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communication_audit_logs (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_role TEXT,
        entity_type TEXT,
        entity_id TEXT,
        old_values JSONB,
        new_values JSONB,
        reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS cal_action_idx ON communication_audit_logs(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cal_actor_idx  ON communication_audit_logs(actor_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cal_created_idx ON communication_audit_logs(created_at DESC)`);
    console.log("[Migration] v35.6 communication_audit_logs table ensured");
  } catch (err: any) { console.warn("[Migration] v35.6 communication_audit_logs:", err.message); }

  // ── v35.7 — communication_schedules ─────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communication_schedules (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        booking_id TEXT,
        group_id TEXT,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        template_id TEXT,
        scheduled_at TIMESTAMPTZ NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        status TEXT NOT NULL DEFAULT 'pending',
        cancellation_reason TEXT,
        idempotency_key TEXT UNIQUE,
        template_version INTEGER NOT NULL DEFAULT 1,
        context JSONB,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS cs_scheduled_idx ON communication_schedules(scheduled_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cs_booking_idx   ON communication_schedules(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cs_status_idx    ON communication_schedules(status)`);
    console.log("[Migration] v35.7 communication_schedules table ensured");
  } catch (err: any) { console.warn("[Migration] v35.7 communication_schedules:", err.message); }

  // ── v36.1 — orientation_resources table ────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orientation_resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        resource_type TEXT DEFAULT 'article',
        content TEXT,
        external_url TEXT,
        file_url TEXT,
        thumbnail_url TEXT,
        language TEXT DEFAULT 'en',
        is_published BOOLEAN DEFAULT true,
        view_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS or_category_idx ON orientation_resources(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS or_published_idx ON orientation_resources(is_published)`);
    console.log("[Migration] v36.1 orientation_resources table ensured");
  } catch (err: any) { console.warn("[Migration] v36.1 orientation_resources:", err.message); }

  // ── v36.2 — customer_portal_activity table ──────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_activity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id TEXT NOT NULL,
        booking_id TEXT,
        action TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS cpa_customer_idx ON customer_portal_activity(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cpa_created_idx  ON customer_portal_activity(created_at DESC)`);
    console.log("[Migration] v36.2 customer_portal_activity table ensured");
  } catch (err: any) { console.warn("[Migration] v36.2 customer_portal_activity:", err.message); }

  // ── v36.3 — customer_profile_edits table ────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_profile_edits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS cpe_customer_idx ON customer_profile_edits(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cpe_status_idx   ON customer_profile_edits(status)`);
    console.log("[Migration] v36.3 customer_profile_edits table ensured");
  } catch (err: any) { console.warn("[Migration] v36.3 customer_profile_edits:", err.message); }

  // ── v36.4 — enhance customer_notifications ──────────────────────────────────
  try {
    await pool.query(`ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS action_url   TEXT`);
    await pool.query(`ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS priority      TEXT DEFAULT 'normal'`);
    await pool.query(`ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE customer_notifications ADD COLUMN IF NOT EXISTS is_archived   BOOLEAN DEFAULT false`);
    console.log("[Migration] v36.4 customer_notifications enhancement ensured");
  } catch (err: any) { console.warn("[Migration] v36.4 customer_notifications:", err.message); }

  // ── v37.1 — automation_service_tokens ────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS automation_service_tokens (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        token_name    TEXT NOT NULL,
        token_hash    TEXT NOT NULL UNIQUE,
        scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
        allowed_ips   JSONB,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        expires_at    TIMESTAMPTZ,
        revoked_at    TIMESTAMPTZ,
        last_used_at  TIMESTAMPTZ,
        created_by    TEXT,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ast_hash_idx ON automation_service_tokens(token_hash)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ast_active_idx ON automation_service_tokens(is_active) WHERE is_active = true`);
    // Seed N8N token if env var is set and no token exists yet
    const n8nToken = process.env.N8N_SERVICE_TOKEN;
    if (n8nToken) {
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(n8nToken).digest("hex");
      await pool.query(
        `INSERT INTO automation_service_tokens (id, token_name, token_hash, scopes, is_active, created_by, notes)
         VALUES (gen_random_uuid()::text, 'n8n-main', $1,
           '["packages:read","leads:create","leads:update","support:create","conversations:create","knowledge:read"]'::jsonb,
           true, 'system', 'Auto-seeded from N8N_SERVICE_TOKEN env var')
         ON CONFLICT (token_hash) DO NOTHING`,
        [hash]
      );
    }
    console.log("[Migration] v37.1 automation_service_tokens ensured");
  } catch (err: any) { console.warn("[Migration] v37.1 automation_service_tokens:", err.message); }

  // ── v37.2 — ai_conversations ─────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        conversation_key          TEXT NOT NULL UNIQUE,
        channel                   TEXT NOT NULL,
        external_contact_id       TEXT,
        customer_id               TEXT,
        lead_id                   TEXT,
        booking_id                TEXT,
        customer_name             TEXT,
        mobile_masked             TEXT,
        language                  TEXT NOT NULL DEFAULT 'en',
        status                    TEXT NOT NULL DEFAULT 'ai_active'
                                    CHECK (status IN ('ai_active','human_required','human_active','closed')),
        last_ai_message_at        TIMESTAMPTZ,
        last_customer_message_at  TIMESTAMPTZ,
        closed_at                 TIMESTAMPTZ,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ac_key_idx    ON ai_conversations(conversation_key)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ac_status_idx ON ai_conversations(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ac_channel_idx ON ai_conversations(channel)`);
    console.log("[Migration] v37.2 ai_conversations ensured");
  } catch (err: any) { console.warn("[Migration] v37.2 ai_conversations:", err.message); }

  // ── v37.3 — ai_conversation_messages ─────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_conversation_messages (
        id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        conversation_id      TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        direction            TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
        sender_type          TEXT NOT NULL CHECK (sender_type IN ('customer','ai','staff','system')),
        channel              TEXT NOT NULL,
        message_type         TEXT NOT NULL DEFAULT 'text',
        message_text         TEXT NOT NULL,
        provider_message_id  TEXT,
        request_id           TEXT,
        ai_model             TEXT,
        tool_calls           JSONB,
        confidence           NUMERIC(4,3),
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS acm_conv_idx ON ai_conversation_messages(conversation_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS acm_dir_idx  ON ai_conversation_messages(direction)`);
    console.log("[Migration] v37.3 ai_conversation_messages ensured");
  } catch (err: any) { console.warn("[Migration] v37.3 ai_conversation_messages:", err.message); }

  // ── v37.4 — automation_audit_logs ───────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS automation_audit_logs (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        actor_type   TEXT NOT NULL DEFAULT 'service_token',
        actor_id     TEXT NOT NULL,
        action       TEXT NOT NULL,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT,
        request_id   TEXT,
        ip_address   TEXT,
        before_data  JSONB,
        after_data   JSONB,
        result       TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure')),
        error_code   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS aal_actor_idx  ON automation_audit_logs(actor_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS aal_action_idx ON automation_audit_logs(action, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS aal_entity_idx ON automation_audit_logs(entity_type, entity_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS aal_idem_idx   ON automation_audit_logs((after_data->>'idempotency_key')) WHERE after_data->>'idempotency_key' IS NOT NULL`);
    console.log("[Migration] v37.4 automation_audit_logs ensured");
  } catch (err: any) { console.warn("[Migration] v37.4 automation_audit_logs:", err.message); }

  // ── v37.5 — ai_knowledge_base ───────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_base (
        id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        category         TEXT NOT NULL,
        question         TEXT NOT NULL,
        answer           TEXT NOT NULL,
        language         TEXT NOT NULL DEFAULT 'en',
        tags             JSONB,
        sort_order       INTEGER,
        version          INTEGER NOT NULL DEFAULT 1,
        status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
        approval_status  TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
        approved_by      TEXT,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        last_reviewed_at TIMESTAMPTZ,
        created_by       TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS akb_cat_idx    ON ai_knowledge_base(category, sort_order NULLS LAST)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS akb_status_idx ON ai_knowledge_base(status, is_active)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS akb_lang_idx   ON ai_knowledge_base(language)`);
    // Add DB soft-switch for AI kill switch (admin can toggle without env var change)
    await pool.query(
      `INSERT INTO api_settings (key, value, provider, enabled, updated_at)
       VALUES ('ai_assistant_enabled', 'false', 'ai_automation', false, NOW())
       ON CONFLICT (key) DO NOTHING`,
    ).catch(() => {
      // api_settings may use (provider) as PK — try alternate upsert
      pool.query(
        `INSERT INTO api_settings (provider, enabled, updated_at)
         VALUES ('ai_automation', false, NOW())
         ON CONFLICT (provider) DO NOTHING`
      ).catch(() => {});
    });
    console.log("[Migration] v37.5 ai_knowledge_base + ai_automation api_settings ensured");
  } catch (err: any) { console.warn("[Migration] v37.5 ai_knowledge_base:", err.message); }

  // ══════════════════════════════════════════════════════════════════════════════
  // SaaS PHASE 2 — Tenant foundation & row-level backfill (v38.1 – v38.9)
  // AUTHORITATIVE SOURCE: migrations/v38-tenant-foundation.sql
  // Fixed tenant UUID: 10000000-1000-4000-8000-000000000001 (Al Burhan default)
  // Columns NULLABLE — NOT NULL enforcement deferred to Phase 3
  // ══════════════════════════════════════════════════════════════════════════════
  // NOTE: Everything below is delegated to the SQL file. Do NOT duplicate DDL here.
  // ── v38: execute SQL migration file (single authoritative path) ──────────────
  // migrations/v38-tenant-foundation.sql is the single source of truth.
  // It runs in a transaction: if the v38.9b assertion DO block raises EXCEPTION,
  // the transaction rolls back and the error surfaces here as CRITICAL.
  try {
    // ESM-compatible path: fileURLToPath(import.meta.url) gives the current file's path.
    // esbuild's banner polyfill (build.ts) ensures import.meta.url resolves correctly
    // in the CJS bundle via: __importMetaUrl = pathToFileURL(__filename).href
    //
    // The build step (build.ts) copies migrations/ → dist/migrations/ so both paths
    // below exist after a production build. Try production-bundled path first, then
    // fall back to dev source-tree path.
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const v38SqlCandidates = [
      // Production: dist/index.cjs → dist/migrations/ (build.ts copies migrations here)
      path.join(thisDir, "migrations", "v38-tenant-foundation.sql"),
      // Development: src/index.ts → src/../migrations/ = artifacts/api-server/migrations/
      path.join(thisDir, "..", "migrations", "v38-tenant-foundation.sql"),
    ];
    let v38Sql: string | null = null;
    for (const candidate of v38SqlCandidates) {
      try { v38Sql = fs.readFileSync(candidate, "utf8"); break; } catch {}
    }
    if (!v38Sql) {
      const tried = v38SqlCandidates.join(", ");
      throw Object.assign(new Error(`SQL file not found in: ${tried}`), { code: "ENOENT" });
    }
    await pool.query(v38Sql);
    console.log("[Migration] v38 tenant foundation SQL executed successfully");
  } catch (err: any) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("[Migration] v38 CRITICAL: SQL file not found — tenant foundation unapplied. Build did not copy migrations/.");
    } else {
      // RAISE EXCEPTION from the v38.9b assertion DO block surfaces here
      console.error("[Migration] v38 CRITICAL: tenant foundation migration failed:", err.message);
    }
    // Phase 3 middleware will enforce tenant_id != NULL and will surface any incomplete state
  }

  // ── Startup route confirmation ──────────────────────────────────────────────
  // Express 5 initialises the router lazily (no _router until first request),
  // so counting via app._router at startup already shows 0 in dev mode.
  // Routes are verified live at GET /api/routes (VPS confirmed 467 routes).
  console.log("[Startup] ✅ Routes mounted — verify live at GET /api/routes");

  app.listen(finalPort, () => {
    console.log(`Server listening on port ${finalPort}`);
    startPaymentReminderCron();
    startFeedbackReminderCron();
    startDepartureReminderCron();
    startDocumentExpiryCron();
    startReturnAndFeedbackCron();
    startBalanceReminderCron();
    startDocumentReminderCron();
    startZiyaratReminderCron();
    startAgreementIntegrityCron();
    startAgreementReminderCron();
    startVisaReminderCron();
    startDailyAdminReportCron();
    startTicketDepartureReminderCron();
    startGoogleHealthCheckCron();
    // Lead engine follow-up automation — runs every 5 minutes
    setTimeout(() => {
      runFollowupCron().catch(e => console.error("[LeadEngine] Initial cron error:", e));
      setInterval(() => runFollowupCron().catch(e => console.error("[LeadEngine] Cron error:", e)), 5 * 60 * 1000);
    }, 30 * 1000); // 30s startup delay
    // Phase B — lead reminder cron (overdue & upcoming follow-up alerts)
    ensureLeadEnginePhaseBSchema().catch(e => console.error("[LeadEnginePhaseB] Schema error:", e));
    setTimeout(() => {
      runLeadReminderCron().catch(e => console.error("[LeadReminder] Initial error:", e));
      setInterval(() => runLeadReminderCron().catch(e => console.error("[LeadReminder] Cron error:", e)), 60 * 60 * 1000);
    }, 45 * 1000); // 45s startup delay
    const scheduleAuditRetention = () => {
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setUTCHours(18, 30, 0, 0); // 00:00 IST = 18:30 UTC
      if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      setTimeout(async () => {
        try {
          const result = await pool.query(`DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '12 months'`);
          console.log(`[AuditRetention] Purged ${result.rowCount} entries older than 12 months`);
        } catch (err) {
          console.error("[AuditRetention] Purge failed:", err);
        }
        scheduleAuditRetention();
      }, nextRun.getTime() - now.getTime());
    };
    scheduleAuditRetention();
    console.log("[AuditRetention] Scheduled: daily purge of audit_logs older than 12 months");

    // ── BotBee template auto-sync every 10 minutes ──────────────────────────
    const syncBotBeeTemplates = async () => {
      try {
        const { fetchTemplates } = await import("./lib/botbee.js");
        const result = await fetchTemplates();
        if (result.ok && result.templates) {
          for (const lt of result.templates) {
            await pool.query(
              `UPDATE wa_templates SET status=$1, updated_at=NOW() WHERE meta_template_name=$2 OR name=$2`,
              [lt.status?.toLowerCase() || "unknown", lt.name]
            ).catch(() => {});
          }
          console.log(`[BotBee] Auto-synced ${result.templates.length} templates`);
        } else if (!result.ok) {
          // Silently suppress "route not found" (BotBee WABA not yet connected — expected)
          const msg = result.errorMessage || "";
          if (!msg.includes("not found") && !msg.includes("404") && !msg.includes("could not be found")) {
            console.warn("[BotBee] Template sync skipped:", msg);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (!msg.includes("not found") && !msg.includes("404")) {
          console.warn("[BotBee] Auto-sync failed:", msg);
        }
      }
    };
    syncBotBeeTemplates();
    setInterval(syncBotBeeTemplates, 10 * 60 * 1000);
    console.log("[BotBee] Template auto-sync scheduled every 10 minutes");

    // ── Meta Cloud API v30.0: retry queue processor (runs every 60s) ─────────
    ;(async () => {
      try {
        const { processMetaRetryQueue, isMetaWapiConfigured, syncMetaTemplates } = await import("./lib/metaWapi.js");
        if (isMetaWapiConfigured()) {
          // Sync templates on startup
          setTimeout(async () => {
            console.log("[Meta] Running startup template sync…");
            const syncResult = await syncMetaTemplates().catch((e: any) => ({ ok: false, synced: 0, errors: [String(e?.message)] }));
            console.log(`[Meta] Template sync: ok=${syncResult.ok} synced=${syncResult.synced} errors=${syncResult.errors.length}`);
          }, 8000);
          // Retry queue — every 60 seconds
          setInterval(async () => {
            const r = await processMetaRetryQueue().catch(() => ({ processed: 0, succeeded: 0 }));
            if (r.processed > 0) console.log(`[Meta] Retry queue processed=${r.processed} succeeded=${r.succeeded}`);
          }, 60 * 1000);
          console.log("[Meta] Cloud API retry queue scheduler active (60s interval)");
        } else {
          console.log("[Meta] META_ACCESS_TOKEN not configured — Cloud API inactive (BotBee remains primary)");
        }
      } catch (e: any) {
        console.warn("[Meta] Failed to start retry scheduler:", e?.message);
      }
    })();

    // ── Load any stored template ID overrides from api_settings ─────────────
    // Admin calls POST /api/migrate/activate-new-templates after recreating templates
    // in BotBee dashboard with proper {{1}} Meta variable format. Overrides are
    // persisted here and applied on every server restart without a code redeploy.
    pool.query(`SELECT value FROM api_settings WHERE key='botbee_template_overrides' LIMIT 1`)
      .then(async r => {
        if (!r.rows[0]?.value) return;
        try {
          const overrides = JSON.parse(r.rows[0].value) as Record<string, { id: string; body: string }>;
          const { applyTemplateOverrides } = await import("./lib/botbee.js");
          applyTemplateOverrides(overrides);
        } catch (e: any) {
          console.warn("[BotBee] Failed to load template overrides from DB:", e.message);
        }
      })
      .catch(() => {});

    // ── WhatsApp template startup validation ─────────────────────────────────
    // Logs every configured template name + failure rate from notification_logs.
    // A template with 0 successes or >80% failures triggers a clear error log.
    setTimeout(async () => {
      try {
        const { TEMPLATE_CONFIGS } = await import("./lib/templateConfig.js");
        console.log("[TemplateValidation] Checking configured WhatsApp templates:");
        for (const t of TEMPLATE_CONFIGS) {
          const envOverride = (process.env[t.envVar] || "").trim();
          const source = envOverride ? `env:${t.envVar}` : "default";
          const statsRes = await pool.query(
            `SELECT status, COUNT(*) AS n FROM notification_logs
             WHERE channel='whatsapp' AND event_type = ANY($1)
             GROUP BY status`,
            [t.eventTypes]
          ).catch(() => ({ rows: [] as { status: string; n: string }[] }));
          const stats = { sent: 0, failed: 0 };
          for (const row of statsRes.rows as { status: string; n: string }[]) {
            if (row.status === "sent") stats.sent += parseInt(row.n, 10);
            else stats.failed += parseInt(row.n, 10);
          }
          const total = stats.sent + stats.failed;
          const rate = total > 0 ? Math.round((stats.sent / total) * 100) : null;
          const rateStr = rate !== null ? `${rate}% success (${stats.sent}/${total})` : "untested";
          if (total > 0 && (rate === null || rate < 20)) {
            console.error(
              `[TemplateValidation] ❌ FAILING  "${t.displayName}" → name="${t.name}" id=${t.id} [${source}] | ${rateStr}`,
              `\n  → Set env var ${t.envVar} to the correct BotBee template name.`
            );
          } else if (total > 0 && rate !== null && rate < 60) {
            console.warn(`[TemplateValidation] ⚠️  WARNING  "${t.displayName}" → name="${t.name}" id=${t.id} [${source}] | ${rateStr}`);
          } else {
            console.log(`[TemplateValidation] ✅ OK       "${t.displayName}" → name="${t.name}" id=${t.id} [${source}] | ${rateStr}`);
          }
        }
      } catch (err: any) {
        console.error("[TemplateValidation] Failed:", err.message);
      }
    }, 5000); // Run 5s after server starts (after DB migrations complete)

    // ── WhatsApp retry engine — runs every 60 seconds, exponential backoff, max 5 retries ──
    // Errors that indicate a PERMANENT failure (never worth retrying):
    const WA_PERMANENT_ERRORS = [
      "outside 24 hour window",
      "24 hour window",
      "not in window",
      "user not opted in",
      "blocked by user",
      "parameter at index",           // BotBee template variable format error — unrecoverable
      "exceeds the parameter",        // parameter length limit exceeded — unrecoverable
      "parameter length limit",       // variant of the same
    ];
    const isWAPermanentError = (msg: string): boolean =>
      WA_PERMANENT_ERRORS.some(e => msg?.toLowerCase().includes(e));

    // Clean up permanently-failed rows: max retries reached, or 24h-window error
    pool.query(
      `UPDATE notification_logs SET status='permanently_failed', updated_at=NOW()
       WHERE channel='whatsapp' AND status='failed'
         AND (retry_count >= 5
              OR provider_response::text ILIKE '%24 hour%'
              OR provider_response::text ILIKE '%outside 24 hour%'
              OR provider_response::text ILIKE '%24h window%'
              OR provider_response::text ILIKE '%parameter at index%'
              OR provider_response::text ILIKE '%exceeds the parameter%'
              OR provider_response::text ILIKE '%parameter length limit%')`
    ).catch(() => {});

    const runRetryEngine = async () => {
      try {
        // Only retry messages that: failed, have retries left, waited long enough
        // Exponential backoff: 2min, 5min, 15min, 30min, 60min between attempts
        const failed = await pool.query(
          `SELECT id, event_type, recipient, message, retry_count, request_payload, updated_at,
                  provider_response
           FROM notification_logs
           WHERE channel='whatsapp' AND status='failed' AND retry_count < 5
             AND updated_at < NOW() - (INTERVAL '2 minutes' * POWER(2, retry_count))
           ORDER BY updated_at ASC LIMIT 5`
        );
        if (!failed.rowCount || failed.rowCount === 0) return;

        const { sendText, sendTemplate } = await import("./lib/botbee.js");
        for (const log of failed.rows) {
          try {
            // Check if this is a permanent error from a previous attempt — if so, give up now
            const prevResponse = log.provider_response;
            if (prevResponse) {
              const prevMsg = typeof prevResponse === "string"
                ? prevResponse
                : JSON.stringify(prevResponse);
              if (isWAPermanentError(prevMsg)) {
                await pool.query(
                  `UPDATE notification_logs SET status='permanently_failed', updated_at=NOW() WHERE id=$1`,
                  [log.id]
                ).catch(() => {});
                continue; // Don't log this — it would spam
              }
            }

            const reqPayload = log.request_payload as any;
            const templateId = reqPayload?.template_id || reqPayload?.template?.id;
            let result: any;
            if (templateId) {
              // Re-use original named variables so BotBee substitutes #!VarName!# correctly.
              // Always force template API — plain text (session) retries always fail outside 24h.
              const origVars = reqPayload?.variables &&
                typeof reqPayload.variables === "object" &&
                !Array.isArray(reqPayload.variables)
                  ? reqPayload.variables as Record<string, string>
                  : undefined;
              result = await sendTemplate(log.recipient, String(templateId), {
                eventType: log.event_type,
                forceTemplateApi: true,
                variables: origVars,
                bookingId: log.booking_id,
                customerId: log.customer_id,
              });
            } else {
              // No template ID — was a plain text send; text API always fails outside 24h.
              // Mark permanently_failed immediately rather than burning retries.
              await pool.query(
                `UPDATE notification_logs SET status='permanently_failed', updated_at=NOW() WHERE id=$1`,
                [log.id]
              ).catch(() => {});
              continue;
            }

            // If this attempt itself returned a permanent error, mark done immediately
            const resultMsg = result?.errorMessage || JSON.stringify(result);
            const isPermanent = !result.ok && isWAPermanentError(resultMsg);
            const newStatus = result.ok ? "sent" : (isPermanent ? "permanently_failed" : "failed");

            await pool.query(
              `UPDATE notification_logs SET retry_count=retry_count+1, status=$1, provider_response=$2, updated_at=NOW() WHERE id=$3`,
              [newStatus, JSON.stringify(result), log.id]
            ).catch(() => {});

            if (!isPermanent) {
              console.log(`[RetryEngine] ${log.id} → ${result.ok ? "sent ✓" : "failed"} (retry #${log.retry_count + 1})`);
            }
            await new Promise(r => setTimeout(r, 1500));
          } catch (err) { console.error("[RetryEngine] retry error:", err); }
        }
      } catch (err) { console.error("[RetryEngine] engine error:", err); }
    };
    setInterval(runRetryEngine, 60 * 1000); // every 60s instead of every 15s
    console.log("[RetryEngine] WhatsApp retry engine scheduled every 60 seconds (exponential backoff, max 5 retries)");

    // ── Generic cross-channel retry engine (SMS/RCS/Email/Push) ─────────────────
    // Backoff schedule: 1m → 5m → 15m → 1h → 24h.  Max 5 attempts for SMS/RCS/Push.
    // Email is capped at 3 attempts and is skipped entirely while the circuit breaker
    // is set to 'suspended' (toggled via Admin → System Health → Email Circuit Breaker).
    // Interval is 30 s — previously 10 s, which caused ~60 SMTP connections/min when
    // emails failed en masse and was the root cause of Hostinger's suspension.
    const RETRY_DELAYS_SEC = [60, 300, 900, 3600, 86400];
    const EMAIL_MAX_RETRIES = 3;
    const runGenericRetryEngine = async () => {
      try {
        const due = await pool.query(
          `SELECT * FROM notification_retry_queue
           WHERE status='pending' AND retry_count < 5 AND next_retry_at <= NOW()
           ORDER BY next_retry_at ASC LIMIT 20`
        );
        if (!due.rowCount) return;
        console.log(`[GenericRetryEngine] ${due.rowCount} item(s) due for retry`);
        const { sendRCS, sendEmail } = await import("./lib/notifications.js");
        const { sendCustomSMS } = await import("./lib/sms.js");
        const { isEmailEnabled } = await import("./lib/apiSettingsProvider.js");
        const emailOn = await isEmailEnabled();
        for (const item of due.rows) {
          // ── Email-specific guards ─────────────────────────────────────────────
          if (item.channel === "email") {
            if (!emailOn) {
              // Silent skip — circuit breaker is closed; don't update retry_count
              continue;
            }
            if (item.retry_count >= EMAIL_MAX_RETRIES) {
              await pool.query(
                `UPDATE notification_retry_queue SET status='failed', last_error=$1, updated_at=NOW() WHERE id=$2`,
                ["Email max retries (3) reached", item.id]
              );
              console.warn(`[GenericRetryEngine] email → capped at ${EMAIL_MAX_RETRIES} retries (${item.recipient})`);
              continue;
            }
          }

          let ok = false;
          let errorMessage: string | undefined;
          try {
            if (item.channel === "sms") {
              const r = await sendCustomSMS({ mobile: item.recipient, message: item.message });
              ok = !!r.ok; errorMessage = (r as any).errorMessage;
            } else if (item.channel === "rcs") {
              const r = await sendRCS(item.recipient, item.recipient, item.message);
              ok = r.ok; errorMessage = r.errorMessage;
            } else if (item.channel === "email") {
              const r = await sendEmail(item.recipient, "Update from Al Burhan Tours & Travels", item.message.replace(/\n/g, "<br>"));
              ok = r.ok; errorMessage = r.errorMessage;
            } else if (item.channel === "push") {
              try {
                const { sendPushToCustomer } = await import("./lib/webPush.js");
                const pushResult = await sendPushToCustomer(item.customer_id, {
                  title: "Al Burhan Tours & Travels",
                  body: item.message?.substring(0, 200) || "Update from Al Burhan Tours & Travels",
                  url: "https://alburhantravels.com/customer/dashboard",
                });
                ok = pushResult.ok;
                errorMessage = pushResult.ok ? undefined : "Push delivery failed (no active subscriptions)";
              } catch (pushErr: any) {
                errorMessage = pushErr?.message || "Push retry error";
              }
            }
          } catch (err: any) {
            errorMessage = err?.message || "Retry error";
          }

          const newRetryCount = item.retry_count + 1;
          if (ok) {
            await pool.query(
              `UPDATE notification_retry_queue SET status='sent', retry_count=$1, updated_at=NOW() WHERE id=$2`,
              [newRetryCount, item.id]
            );
            await pool.query(
              `UPDATE notification_logs SET status='sent', retry_count=$1 WHERE id=$2`,
              [newRetryCount, item.notification_log_id]
            ).catch(() => {});
            console.log(`[GenericRetryEngine] ${item.channel} → SENT on retry #${newRetryCount} (${item.recipient})`);
          } else if (newRetryCount >= 5) {
            await pool.query(
              `UPDATE notification_retry_queue SET status='failed', retry_count=$1, last_error=$2, updated_at=NOW() WHERE id=$3`,
              [newRetryCount, errorMessage || "Max retries (5) reached", item.id]
            );
            await pool.query(
              `UPDATE notification_logs SET retry_count=$1 WHERE id=$2`,
              [newRetryCount, item.notification_log_id]
            ).catch(() => {});
            console.warn(`[GenericRetryEngine] ${item.channel} → giving up after ${newRetryCount} attempts (${item.recipient})`);
          } else {
            const delaySec = RETRY_DELAYS_SEC[newRetryCount] ?? 30;
            await pool.query(
              `UPDATE notification_retry_queue SET retry_count=$1, last_error=$2, next_retry_at=NOW() + ($3 || ' seconds')::interval, updated_at=NOW() WHERE id=$4`,
              [newRetryCount, errorMessage || "Retry failed", String(delaySec), item.id]
            );
            console.log(`[GenericRetryEngine] ${item.channel} → retry #${newRetryCount} failed, next attempt in ${delaySec}s (${item.recipient})`);
          }
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error("[GenericRetryEngine] engine error:", err);
      }
    };
    // ── Pause any pending email retries that built up before this fix ────────
    pool.query(
      `UPDATE notification_retry_queue
       SET status='failed', last_error='Email paused — automatic retry suspended pending SMTP review'
       WHERE channel='email' AND status='pending'`
    ).then((r: any) => {
      if ((r.rowCount ?? 0) > 0)
        console.log(`[GenericRetryEngine] Paused ${r.rowCount} stuck email retry item(s) in queue`);
    }).catch(() => {});

    setInterval(runGenericRetryEngine, 30 * 1000); // was 10 s — 30 s prevents SMTP hammering
    console.log("[GenericRetryEngine] SMS/RCS/Email retry engine: 30s interval, 1m/5m/15m/1h/24h backoff, max 5 (SMS/RCS/Push) / 3 (Email) retries");
  });
}

start().catch(err => {
  console.error("[Startup] Fatal error:", err);
  process.exit(1);
});
