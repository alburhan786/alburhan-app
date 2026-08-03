---
name: Notification dedup — skipLog pattern
description: How double notification_logs rows are prevented when notificationEngine calls sms.ts / rcs.ts, and how the PDF IIFE race was eliminated.
---

## The rule

When `notificationEngine.ts` calls `sms.ts` or `rcs.ts` functions, it MUST pass `skipLog: true` in the context. Without it, both the provider module and `trackNotification` each INSERT a row — two rows for one send.

## Three-layer dedup architecture

1. **paymentRef-level** (in `fireNotificationEvent`): for `payment_received` / `partial_payment` events, checks `notification_logs WHERE idempotency_key LIKE 'pay:<paymentRef>:%'` before dispatching any channel. If found, entire second call is skipped (blocks the verify-public vs webhook race).

2. **Channel-level** (in `trackNotification`): each channel INSERT uses `ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`. Key formats:
   - WhatsApp / Email / RCS / SMS (via notificationEngine): `pay:<paymentRef>:<eventType>:<channel>`
   - SMS (via sms.ts internal, when skipLog=false): `sms:<bookingId>:<eventType>:<fast2sms_request_id>`
   - RCS (via rcs.ts internal): `<bookingId>:<event>:<templateId>`

3. **DB-level** (migration): partial unique index `uq_notification_logs_idempotency ON notification_logs (idempotency_key) WHERE idempotency_key IS NOT NULL`.

## skipLog threading

- `BookingCtx` in `sms.ts` has `skipLog?: boolean`
- All event-specific SMS functions (sendPaymentReceived, sendBookingCreated, etc.) pass `skipLog: ctx.skipLog` to `sendDLT`
- `sendDLT` gates ALL `logSMS` calls (success, failure, validation errors) on `!opts.skipLog`
- `sendRCSForEvent` takes `skipLog?: boolean` in opts; gates `logRCSNotification` on `!opts.skipLog`
- `notificationEngine.ts` smsCtx includes `skipLog: true`; sendRCSForEvent opts include `skipLog: true`

## WhatsApp PDF sends

- PDF delivery for payment events: ONLY via `notificationEngine` attachment IIFE in `sendOnChannelWithType` (reads `ctx.attachments`)
- The separate PDF IIFE that was in `processPaymentSuccessNotifications` was REMOVED to eliminate the double-delivery path
- The notificationEngine PDF IIFE is fire-and-forget and runs from the first call only (second call is blocked by paymentRef dedup before reaching `sendOnChannelWithType`)

**Why:**
- Both code paths used the same `attachments` array, sending each PDF twice to the customer
- Removing the payments.ts IIFE makes notificationEngine the single authoritative PDF delivery path

## Test endpoint

`POST /api/migrate/dedup-notification-test?key=MIGRATION_KEY` — creates a test booking, calls `processPaymentSuccessNotifications` twice with the same paymentRef (4-channel: WhatsApp, SMS, RCS, Email), waits 8 s after first call for async IIFEs to settle, compares row counts before/after second call. Cleans up test data.

**Expected result:** `rows_added_by_second_call: 0` for all channels. WhatsApp legitimately has 3 rows (1 template + 2 PDF documents) — idempotency is measured as "second call adds 0" not "1 row total".
