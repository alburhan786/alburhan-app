-- Al Burhan Tours VPS Schema Sync — idempotent, run-safe
-- Generated: 2026-07-13 (v2 — fixes invoices column names, adds due_date to bookings)

-- ── session table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
ALTER TABLE "session" ADD CONSTRAINT IF NOT EXISTS "session_pkey" PRIMARY KEY ("sid");
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ── users new columns ────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_mobile TEXT;

-- ── bookings new columns ─────────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_number TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS number_of_pilgrims INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS online_paid_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS traveller_details_status TEXT NOT NULL DEFAULT 'not_submitted';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pilgrims JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS preferred_departure_date TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_included BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 5;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_rate NUMERIC(5,2) DEFAULT 2;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(12,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS journey_status TEXT DEFAULT 'not_started';
-- due_date: payment deadline for balance reminders (used by payment reminder cron)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- ── booking_settings ─────────────────────────────────────────────────────────
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
);
INSERT INTO booking_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ── invoices table ────────────────────────────────────────────────────────────
-- NOTE: Column names MUST match what the application code uses:
--   discount (not discount_amount), total (not total_amount),
--   paid (not paid_amount), balance (not balance_due)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  booking_id TEXT NOT NULL,
  customer_id TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tcs_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  invoice_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  line_items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rename columns if they were created with old (wrong) names
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='invoices' AND column_name='discount_amount') THEN
    ALTER TABLE invoices RENAME COLUMN discount_amount TO discount;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='invoices' AND column_name='total_amount') THEN
    ALTER TABLE invoices RENAME COLUMN total_amount TO total;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='invoices' AND column_name='paid_amount') THEN
    ALTER TABLE invoices RENAME COLUMN paid_amount TO paid;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='invoices' AND column_name='balance_due') THEN
    ALTER TABLE invoices RENAME COLUMN balance_due TO balance;
  END IF;
END $$;

-- Add any missing invoice columns (handles upgrades from old schema)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS inv_booking_idx ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS inv_number_idx ON invoices(invoice_number);

-- ── offline_payments + bank_settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  bank_name TEXT NOT NULL DEFAULT 'Al Burhan Bank Account',
  account_name TEXT NOT NULL DEFAULT 'Al Burhan Tours & Travels',
  account_number TEXT NOT NULL DEFAULT '',
  ifsc_code TEXT NOT NULL DEFAULT '',
  upi_id TEXT,
  branch TEXT,
  instructions TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO bank_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS offline_payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  customer_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  payment_date TEXT,
  notes TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS op_booking_idx ON offline_payments(booking_id);
CREATE INDEX IF NOT EXISTS op_status_idx ON offline_payments(status);

-- ── notification_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  notification_id TEXT,
  booking_id TEXT,
  customer_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  http_status INTEGER,
  sent_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS api_endpoint TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS http_status INTEGER;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS request_payload JSONB;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error_code TEXT;
CREATE INDEX IF NOT EXISTS nl_event_idx ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS nl_status_idx ON notification_logs(status);
CREATE INDEX IF NOT EXISTS nl_created_idx ON notification_logs(created_at DESC);

-- ── notification_retry_queue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_retry_queue (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nrq_status_idx ON notification_retry_queue(status);
CREATE INDEX IF NOT EXISTS nrq_next_retry_idx ON notification_retry_queue(next_retry_at);

-- ── notification_templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  event_type TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  template_name TEXT,
  body_text TEXT,
  variables JSONB DEFAULT '[]',
  header_text TEXT,
  footer_text TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS whatsapp_template_name TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS sms_template TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS sms_template_id TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS dlt_entity_id TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS email_body TEXT;

-- ── api_settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_settings (
  id TEXT PRIMARY KEY,
  provider TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  api_url TEXT,
  api_key TEXT,
  extra_fields JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unknown';
ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_tested TIMESTAMPTZ;
ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_sms_status TEXT;
ALTER TABLE api_settings ADD COLUMN IF NOT EXISTS last_sms_at TIMESTAMPTZ;

-- ── workflow_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_logs (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  trigger_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  execution_time_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wf_logs_status_idx ON workflow_logs(status);
CREATE INDEX IF NOT EXISTS wf_logs_created_idx ON workflow_logs(created_at DESC);

-- ── customer_timeline ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_timeline (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  customer_id TEXT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ct_booking_idx ON customer_timeline(booking_id);
CREATE INDEX IF NOT EXISTS ct_customer_idx ON customer_timeline(customer_id);

-- ── pilgrims new columns ──────────────────────────────────────────────────────
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS barcode_id TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_id TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_relation TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS family_head BOOLEAN DEFAULT false;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_notes TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_hotel TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS room_number TEXT;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS bus_number TEXT;

-- ── hajj_groups new columns ───────────────────────────────────────────────────
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS company_id TEXT;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS starting_serial_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS hotels JSONB DEFAULT '{}';
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS flight_number TEXT;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS maktab_number TEXT;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS departure_date TEXT;
ALTER TABLE hajj_groups ADD COLUMN IF NOT EXISTS return_date TEXT;

-- ── attendance tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'general',
  event_date TEXT,
  location TEXT,
  scan_token TEXT,
  scan_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS scan_token TEXT;
ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS scan_token_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS attendance_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  pilgrim_id TEXT NOT NULL,
  pilgrim_name TEXT,
  scan_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scan_method TEXT DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── payment_transactions (ensure table exists with all columns) ───────────────
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
);
CREATE INDEX IF NOT EXISTS pt_booking_idx ON payment_transactions(booking_id);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── reminder_logs (payment reminder cron history) ────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  booking_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'sent',
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  notes TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rl_booking_idx ON reminder_logs(booking_id);
CREATE INDEX IF NOT EXISTS rl_sent_at_idx ON reminder_logs(sent_at DESC);

SELECT 'VPS schema sync complete — v2' AS result;

-- ── v31.0 — RCS Template Mappings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rcs_template_mappings (
  erp_event           TEXT PRIMARY KEY,
  template_name       TEXT NOT NULL DEFAULT '',
  template_id         TEXT,
  alt_template_id     TEXT,
  carrier             TEXT DEFAULT 'jio',
  template_type       TEXT DEFAULT 'transactional',
  variables_required  TEXT[] DEFAULT '{}',
  enabled             BOOLEAN DEFAULT true,
  last_success_at     TIMESTAMPTZ,
  last_failure_at     TIMESTAMPTZ,
  last_failure_reason TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO rcs_template_mappings (erp_event, template_name, template_id, variables_required, notes) VALUES
  ('booking_submitted',        'Booking_Submitted',          '3651', ARRAY['customer_name','booking_id','package_name'],                                      NULL),
  ('booking_confirmed',        'Booking_Approved',           '3652', ARRAY['customer_name','booking_id','package_name','amount'],                             NULL),
  ('booking_approved',         'Booking_Approved',           '3652', ARRAY['customer_name','booking_id','package_name','amount'],                             NULL),
  ('payment_received',         'Payment_Received',           '3654', ARRAY['customer_name','booking_id','amount','receipt_number'],                           '3656 also available as alternative'),
  ('pending_payment_reminder', 'Pending_Payment_Reminder',   '3655', ARRAY['customer_name','booking_id','balance_amount'],                                    NULL),
  ('invoice_ready',            'Invoice_Generated',          '3657', ARRAY['customer_name','booking_id','invoice_number','amount'],                           NULL),
  ('flight_ticket',            'Ticket_Issued',              '3659', ARRAY['customer_name','booking_id','flight_number','airline_name','departure_date'],      NULL),
  ('visa_ready',               'Visa_Issued',                '3660', ARRAY['customer_name','booking_id'],                                                     NULL),
  ('agreement_ready',          'Agreement_Ready',            '3661', ARRAY['customer_name','booking_id','agreement_number','document_url'],                   NULL),
  ('hotel_voucher',            'Hotel_Voucher',              NULL,   ARRAY['customer_name','booking_id','hotel_name'],                                        'Template not mapped — add approved Lemin template ID'),
  ('departure_reminder',       'Departure_Reminder',         NULL,   ARRAY['customer_name','booking_id','departure_date'],                                    'Template not mapped — add approved Lemin template ID')
ON CONFLICT (erp_event) DO NOTHING;

-- ── v31.0 — notification_logs RCS tracking columns ───────────────────────────
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS message_id        TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS delivery_status   TEXT DEFAULT 'unknown';
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS last_status_check TIMESTAMPTZ;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS read_at           TIMESTAMPTZ;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS template_id       TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS template_name     TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idempotency_key   TEXT;
CREATE INDEX IF NOT EXISTS idx_nl_message_id   ON notification_logs(message_id)       WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nl_idempotency  ON notification_logs(idempotency_key)  WHERE idempotency_key IS NOT NULL;

SELECT 'VPS schema sync complete — v31.0 (RCS)' AS result;
