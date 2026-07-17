---
name: Booking notification duplicate pattern
description: The root cause of duplicate customer WhatsApp/SMS messages on booking creation and approval, and which functions are safe to keep.
---

## Rule
`notifyNewBooking()` and `notifyBookingApproved()` (from adminNotifications.ts) only write to the **admin dashboard** (`admin_notifications` table). They do NOT send WhatsApp/SMS to the customer. Do NOT remove them — they are not duplicates.

The actual customer-facing duplicates were:
1. **Online booking creation**: `sendBookingSubmissionNotification(...)` (old system) fired then `triggerWorkflow("new_booking")` (new system) also fired. Removed the old call; `triggerWorkflow` is canonical.
2. **Booking approval**: `sendBookingConfirmationNotification(...)` IIFE (old system, lines 544-587) fired then `triggerWorkflow("booking_approved")` also fired. Removed the old IIFE; `triggerWorkflow` is canonical.

## Why
The old notification functions (`sendBookingSubmissionNotification`, `sendBookingConfirmationNotification`) were not removed when `triggerWorkflow` was added. Both ran concurrently → customer received 2 WhatsApp + 2 SMS messages per event.

## How to apply
- Keep `notifyNewBooking` / `notifyBookingApproved` — admin dashboard only
- Keep old functions ONLY in the **resend endpoint** (`POST /:id/resend-confirmation`) — that's a legitimate manual re-trigger
- For new automatic flows, use `triggerWorkflow` exclusively (logs workflow_logs + customer_timeline + admin_events + notification_logs)
