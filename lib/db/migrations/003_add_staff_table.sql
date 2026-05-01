-- Migration: Create staff table for Airport & Catering Staff ID Cards
-- Applied: Task #140 — Staff ID Card System

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  staff_id TEXT UNIQUE,
  company_id TEXT NOT NULL DEFAULT 'alburhan',
  group_id TEXT,
  full_name TEXT NOT NULL,
  father_name TEXT,
  designation TEXT,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'airport_staff',
  employee_code TEXT,
  mobile_india TEXT,
  blood_group TEXT,
  date_of_birth TEXT,
  address TEXT,
  aadhaar_last_4 TEXT,
  emergency_contact TEXT,
  emergency_mobile TEXT,
  joining_date TEXT,
  valid_upto TEXT,
  photo_url TEXT,
  qr_token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_company_id_idx ON staff (company_id);
CREATE INDEX IF NOT EXISTS staff_role_idx ON staff (role);
CREATE INDEX IF NOT EXISTS staff_status_idx ON staff (status);
