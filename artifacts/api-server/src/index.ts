// Load .env file before anything else (needed for VPS where PM2 doesn't auto-load .env)
import { config as dotenvConfig } from "dotenv";
import fs from "fs";

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
    const result = dotenvConfig({ path: p });
    if (!result.error) {
      loadedEnvPath = p;
      break;
    }
  }
}
// Always also try CWD fallback
dotenvConfig();

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
import { startDepartureReminderCron, startDocumentExpiryCron, startReturnAndFeedbackCron, startBalanceReminderCron, startDocumentReminderCron, startZiyaratReminderCron } from "./lib/workflowEngine.js";
import { DEFAULT_RULES } from "./routes/workflows.js";

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
    console.log("[Migration] otps.attempts column ensured");
  } catch (err) {
    console.error("[Migration] otps.attempts failed:", err);
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
    console.log("[Migration] users.assigned_group_ids column ensured");
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
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_event_idx ON notification_logs(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_status_idx ON notification_logs(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_created_idx ON notification_logs(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS nl_updated_idx ON notification_logs(updated_at)`);
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
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS provider_name TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS api_endpoint TEXT`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS http_status INTEGER`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS request_payload JSONB`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error_code TEXT`);
  } catch (err) { console.error("[Migration] api_settings table failed:", err); }
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

  // ── Performance indexes (additive, safe — production stabilization pass) ────
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bookings_group_id_idx ON bookings(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS pilgrims_group_id_idx ON pilgrims(group_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS notification_logs_booking_id_idx ON notification_logs(booking_id)`);
    console.log("[Migration] performance indexes ensured");
  } catch (err) { console.error("[Migration] performance indexes failed:", err); }
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

  // ── Startup route dump — prints every registered route so PM2 logs confirm registration ──
  {
    const registeredRoutes: string[] = [];
    (app._router?.stack ?? []).forEach((layer: any) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(",");
        registeredRoutes.push(`${methods} ${layer.route.path}`);
      } else if (layer.name === "router" && layer.handle?.stack) {
        layer.handle.stack.forEach((rLayer: any) => {
          if (rLayer.route) {
            const methods = Object.keys(rLayer.route.methods).map(m => m.toUpperCase()).join(",");
            registeredRoutes.push(`${methods} /api${rLayer.route.path}`);
          }
        });
      }
    });
    const keyRoutes = ["/api/health", "/api/auth/send-otp", "/api/auth/verify-otp", "/api/me"];
    const missing = keyRoutes.filter(r => !registeredRoutes.some(reg => reg.includes(r.replace("/api", ""))));
    console.log(`[Startup] Registered ${registeredRoutes.length} routes total`);
    if (missing.length === 0) {
      console.log("[Startup] ✅ All critical routes confirmed: /api/health, /api/auth/send-otp, /api/auth/verify-otp, /api/me");
    } else {
      console.error("[Startup] ❌ MISSING CRITICAL ROUTES:", missing.join(", "), "— check routes/index.ts imports");
    }
  }

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
        }
      } catch (err) {
        console.error("[BotBee] Auto-sync failed:", err);
      }
    };
    syncBotBeeTemplates();
    setInterval(syncBotBeeTemplates, 10 * 60 * 1000);
    console.log("[BotBee] Template auto-sync scheduled every 10 minutes");

    // ── WhatsApp retry engine — runs every 60 seconds, exponential backoff, max 5 retries ──
    // Errors that indicate a PERMANENT failure (never worth retrying):
    const WA_PERMANENT_ERRORS = [
      "outside 24 hour window",
      "24 hour window",
      "not in window",
      "user not opted in",
      "blocked by user",
    ];
    const isWAPermanentError = (msg: string): boolean =>
      WA_PERMANENT_ERRORS.some(e => msg?.toLowerCase().includes(e));

    // First, clean up any existing permanently-failed rows so they stop clogging the queue
    pool.query(
      `UPDATE notification_logs SET status='permanently_failed', updated_at=NOW()
       WHERE channel='whatsapp' AND status='failed' AND retry_count >= 5`
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
            const templateName = reqPayload?.template?.name;
            const message = log.message;
            let result: any;
            if (templateName) {
              result = await sendTemplate(log.recipient, templateName, reqPayload?.template?.components || [], { eventType: log.event_type });
            } else if (message) {
              result = await sendText(log.recipient, message.replace(/^\[template\] /, ""), { eventType: log.event_type });
            } else { continue; }

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

    // ── Generic cross-channel retry engine (SMS/RCS/Email/Push) — 30s backoff, max 3 ──
    const RETRY_DELAYS_SEC = [30, 30, 30];
    const runGenericRetryEngine = async () => {
      try {
        const due = await pool.query(
          `SELECT * FROM notification_retry_queue
           WHERE status='pending' AND retry_count < 3 AND next_retry_at <= NOW()
           ORDER BY next_retry_at ASC LIMIT 20`
        );
        if (!due.rowCount) return;
        console.log(`[GenericRetryEngine] ${due.rowCount} item(s) due for retry`);
        const { sendRCS, sendEmail } = await import("./lib/notifications.js");
        const { sendCustomSMS } = await import("./lib/sms.js");
        for (const item of due.rows) {
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
            } else {
              errorMessage = "Push retry not supported (Firebase not configured)";
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
          } else if (newRetryCount >= 3) {
            await pool.query(
              `UPDATE notification_retry_queue SET status='failed', retry_count=$1, last_error=$2, updated_at=NOW() WHERE id=$3`,
              [newRetryCount, errorMessage || "Max retries reached", item.id]
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
    setInterval(runGenericRetryEngine, 10 * 1000);
    console.log("[GenericRetryEngine] SMS/RCS/Email retry engine scheduled every 10 seconds (30s backoff, max 3 retries)");
  });
}

start().catch(err => {
  console.error("[Startup] Fatal error:", err);
  process.exit(1);
});
