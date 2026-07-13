---
name: Auto notification system
description: Flight reminder automation (7d/3d/2d/1d/12h/6h/3h) and document delivery notifications setup and key decisions
---

## Flight Reminder Cron (workflowEngine.ts)
`startDepartureReminderCron()` is already called in index.ts (on startup).
Slots: 7d/3d/2d/1d/12h/6h/3h (hourly check, ±1h window).
SQL joins: pilgrims → bookings → hajj_groups → group_flights (flight_type='outbound').
Context passed: flightNumber, departureDate, departureTime, departureAirport, arrivalAirport, terminal, customerEmail.

## departure_reminder message (notificationEngine.ts)
Full template with: flight number, departure airport, arrival airport, reporting time, terminal.
"Please report at the airport at least 4 hours before departure. May Allah accept your journey."

## notification_auto_settings table
key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ.
Used by /api/auto-notifications/auto-settings (GET/POST).
Keys: whatsapp_enabled, sms_enabled, email_enabled, rcs_enabled, flight_reminders_enabled, doc_notifications_enabled.
Default: all "true" (unset = enabled).

## Routes at /api/auto-notifications/
- GET/POST /auto-settings
- GET /flight-reminder/stats
- POST /flight-reminder/run-now
- GET /document-notify/stats
- POST /document-notify/retry-failed (sends to docs with notification_sent=false, uploaded_by='admin', >5 min ago)

## Document delivery
sendDocumentToCustomer() fires fire-and-forget on every admin upload in documents.ts.
Per-booking "Send Again" button already exists in BookingsManager (POST /api/documents/:id/resend).
notification_sent=TRUE is set on documents table after successful send.

## Admin page
/admin/auto-notifications → AutoNotificationSettings.tsx
Channel toggles (WhatsApp/SMS/Email/RCS), flight reminder section, doc notify section.

## notification_logs columns (after v17)
customer_name TEXT and booking_number TEXT added via ALTER TABLE migration.
trackNotification() accepts and stores these fields. fireNotificationEvent() passes ctx.customerName + ctx.bookingNumber.

## run-now endpoint
POST /api/auto-notifications/flight-reminder/run-now now calls the exported
runDepartureReminderCheck() function (not a stub). Returns { processed, skipped, message }.

## test-notification endpoint
POST /api/auto-notifications/test-notification — { mobile, channel } — fires
fireNotificationEvent("custom_admin", ...) to test WA/SMS delivery.

**Why:** Channel toggle keys must match the `key` field in notification_auto_settings. The notification engine does NOT yet read these toggles automatically — they are informational/for future enforcement. The cron runs regardless of toggle state (toggle is advisory UI for now unless wired to engine).
