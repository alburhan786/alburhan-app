---
name: Notification Bug Root Causes (Aug 2026)
description: Root causes and fixes for the production notification delivery failures — email suspended, Meta Cloud API wrong priority, partial_payment SMS missing DLT template
---

# Notification Bug Root Causes — August 2026

## Bug 1: SMTP Email suspended since July 30
**Root cause**: `api_settings` row with `key='email_circuit_breaker'` had `value='suspended'`.
All email sends returned "Email sending is currently suspended" immediately.
**Fix**: Added migration endpoint `POST /api/migrate/reset-email-circuit` (migration-key auth).
Reset the circuit breaker + 4 stuck email retry-queue items.
**Admin toggle**: System Health admin page → Email Circuit Breaker toggle.

## Bug 2: MetaCloudAPI permanently_failed spam for new_booking
**Root cause**: `sendWhatsAppForEvent()` tried Meta Cloud API FIRST for all events including ABT_TEMPLATE_EVENTS.
Meta doesn't have the `booking_confirmation` template in `en_US` → always #132001 error → logged as permanently_failed.
BotBee fallback DID work, but the permanently_failed log confused the admin dashboard.
**Fix**: Added `&& !ABT_TEMPLATE_EVENTS.has(eventType)` guard at line 793 of notificationEngine.ts.
ABT events now skip Meta entirely and go directly to BotBee (Priority 1).

## Bug 3: new_booking email never dispatched
**Root cause**: `booking.customerEmail` in bookings.ts comes from the POST body (`data.customerEmail`).
If the customer portal form doesn't submit the email field, it's null → email silently filtered at
`if (c === "email" && !ctx.customerEmail) return false` in notificationEngine.ts.
**Fix**: After booking INSERT, load email from `users` table when `booking.customerEmail` is null.

## Bug 4: partial_payment SMS dlt_template_missing
**Root cause**: `notification_templates` table has partial_payment row with `dlt_template_id=null, enabled=false`.
api_settings `extra_fields_encrypted` also doesn't have `partial_payment_tid`.
`resolveConfig()` returns empty string for partial_payment → `dlt_template_missing`.
`payment_received` has templates: 219803 and 222040 (both enabled in notification_templates).
**Fix**: `sendPartialPaymentReceived()` in sms.ts now uses:
`const effectiveTid = tids.partial_payment || tids.payment_received;`
Falls back to payment_received DLT template when partial_payment_tid is empty.

## NotificationOrchestrator
New file: `lib/notificationOrchestrator.ts`
Single entry point: `sendCustomerNotification({ event, bookingId, paymentId?, ... })`
Loads all context from DB (including user email from users table via COALESCE join).
Normalises mobile numbers (strips leading 0 / country code 91).
Can be used instead of triggerWorkflow() for guaranteed complete context.

## Key DB facts
- fast2sms DLT templates configured via `notification_templates` (channel='sms', enabled=true)
- Confirmed working DLT IDs: new_booking=219801, booking_approved=219802/222039, payment_received=219803/222040, invoice_generated=219805/222041, balance_reminder=219804
- email_circuit_breaker: can go suspended automatically or via admin UI; can reset via migration endpoint
