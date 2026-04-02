-- Migration: Add traveller_details_status column to bookings table
-- Applied: Task #72 — Customer Detail Form (Post-Approval Step)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS traveller_details_status TEXT NOT NULL DEFAULT 'not_submitted';
