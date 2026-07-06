---
name: Journey Status Schema & Notification Pattern
description: journey_status column on bookings, user profile columns, and the auto-notification endpoint pattern for the 19-stage travel journey
---

## journey_status column (bookings table)
- Column: `journey_status TEXT DEFAULT 'booking_requested'`
- Added via migration (pool.query ALTER TABLE), NOT in Drizzle schema — use pool.query for reads/writes
- Exposed in `formatBooking()` as `journeyStatus: get("journeyStatus", "journey_status") ?? "booking_requested"`
- Update endpoint: `POST /api/bookings/:id/journey-status` body: `{ journey_status: "visa_approved" }`
- Endpoint auto-fires: sendJourneyStatusNotification + trackNotification + triggerWorkflow + auditLog

## 19 valid journey_status values (in order)
booking_requested → documents_pending → documents_received → admin_verification →
payment_pending → payment_received → invoice_generated → visa_processing →
visa_approved → flight_confirmed → hotel_confirmed → bus_allocated →
room_allocated → departure_ready → journey_started → reached_makkah →
reached_madinah → return_flight → journey_completed

## User profile columns (users table)
Added via migration (pool.query):
- `blood_group TEXT`
- `emergency_contact_name TEXT`
- `emergency_contact_mobile TEXT`
- `profile_photo_url TEXT`

GET /api/auth/me — returns all profile fields including blood_group, emergency_contact_*
PATCH /api/auth/profile — accepts name, email, blood_group, emergency_contact_name, emergency_contact_mobile

**Why:** journey_status is a separate TEXT column (not pgEnum) to avoid schema migration complexity. The 6 existing booking statuses (pending/approved/rejected/confirmed/cancelled/partially_paid) handle payment/approval flow; journey_status handles the 19-stage travel journey shown to customers in their dashboard.

**How to apply:** Always use pool.query for journey_status operations. The frontend BookingJourneyTimeline component reads booking.journeyStatus. The admin BookingDetailModal has the Update & Notify control.
