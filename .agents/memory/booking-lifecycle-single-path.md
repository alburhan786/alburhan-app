---
name: Booking Lifecycle Single Notification Path
description: All customer booking notifications now route exclusively through triggerWorkflow(); legacy helpers permanently removed from booking creation/approval routes.
---

# Booking Lifecycle — Single Notification Path (2026-08-02)

## The Rule
Customer-facing notifications for booking events MUST flow through `triggerWorkflow()` in `lib/workflowEngine.ts` ONLY. No direct calls to legacy helpers from booking routes.

**Permanently removed from `routes/bookings.ts`:**
- `notifyNewBooking()` — was called after online booking creation (line ~607)
- `notifyBookingApproved()` — was called after booking approval (line ~771)
- `sendPaymentConfirmationNotification()` — was called in offline booking creation if isPaid
- `sendBookingApprovalNotification()` — was called in offline booking creation if !isPaid

**What replaced them:**
- Online booking POST `/` → still calls `triggerWorkflow("new_booking")` (unchanged)
- Approval POST `/:id/approve` → still calls `triggerWorkflow("booking_approved")` (unchanged)
- Offline booking POST `/offline` → now calls `triggerWorkflow("payment_received")` if isPaid, `triggerWorkflow("booking_approved")` if !isPaid

**Why:** The legacy helpers were separate code paths that bypassed notification_logs, idempotency checks, and the dedup window. Customers received duplicate messages (one from the legacy path, one from triggerWorkflow) on every booking event.

## autoGenerateAgreement in Offline Bookings
Offline bookings ARE created with status=approved/confirmed (by admin), so `autoGenerateAgreement()` IS intentionally called at offline creation. The bug that was removed was calling it on ONLINE pending bookings (the `[create]` label).

## SMS Pre-Send Placeholder Guard (2026-08-02)
`lib/sms.ts` `sendDLT()` now blocks sends where any variable contains:
- `#!...!#` or `{{...}}` patterns (unresolved template placeholders)
- Literal "undefined" or "null"
Returns `{ ok: false, errorCode: "UNRESOLVED_TEMPLATE_VARIABLE" }`.

Email and push channels do NOT have this guard yet — see task #345.

## Idempotency Pre-Reservation (2026-08-02)
`lib/notificationEngine.ts` `fireNotificationEvent()` now:
1. Computes idempotency keys for ALL channels BEFORE calling any provider
2. Queries notification_logs to skip channels already reserved/sent
3. Pre-inserts `status='pending'` rows to hold the slot
4. Calls providers
5. Uses `ON CONFLICT DO UPDATE SET status=...` in trackNotification to update pending rows to final status

**Why:** Without pre-reservation, concurrent webhook+verify calls could both pass the time-window dedup check and both call the provider. The pending row acts as a distributed lock.

## Invoice Send Guard (2026-08-02)
`POST /:id/send-invoice` now checks (in order):
1. Booking status is not pending/submitted
2. finalAmount > 0
3. A real invoice record exists in the `invoices` table (NOT just an invoice_number on bookings)
4. That invoice has total > 0

Returns 422 `DATA_VALIDATION_FAILED` if any check fails.

## Payment Transaction Idempotency (2026-08-02)
- `payment_transactions` now has `UNIQUE INDEX uq_payment_transactions_reference_number` on `(reference_number) WHERE NOT NULL` (migration v33.1)
- `recordOnlinePaymentTransaction` uses `pg_try_advisory_xact_lock(hashtextextended(paymentId))` before the INSERT to prevent concurrent races
- `/verify` endpoint has an early idempotency check (SELECT before any writes) and returns success with `alreadyProcessed:true` if the paymentId was already recorded
- 23505 unique_violation from the index is caught and treated as a duplicate skip

## Duplicate Notification Log Cleanup (2026-08-02)
- Added `superseded_at TIMESTAMPTZ` and `superseded_by TEXT` to `notification_logs` (migration v33.2)
- `notification_logs_dup_audit` table created as permanent backup of all pre-cleanup snapshots
- Migration v33.3 soft-marks later duplicates (same booking/event/channel, status=sent, no idempotency_key): 35 groups, 103 rows marked; originals untouched, status preserved
- Zero deletes — full history retained

## Invoice Validation (2026-08-02)
`POST /:id/send-invoice` now runs 8 checks before any channel is contacted:
1. Status not in UNPAYABLE_STATUSES (pending/submitted/rejected/cancelled)
2. Invoice record exists in `invoices` table (not just invoice_number on booking)
3. invoice_number not blank
4. total_amount > 0
5. customer_name not blank
6. package_name not blank
7. invoice_url complete and valid https://

Returns 422 with `{ message: "INVOICE_VALIDATION_FAILED", failures: [{field, reason}...] }`.
Failure is also written to notification_logs with error_code='INVOICE_VALIDATION_FAILED'.

## Regression Test
`artifacts/api-server/tests/booking-lifecycle-regression.sh` — 30/30 pass (A1–I1).
