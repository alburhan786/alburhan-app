---
name: DLT SMS Per-Event Template System
description: How per-event DLT templates are configured, where template IDs must be entered, and the production migration state.
---

## Architecture

- `sms.ts` — single `sendDLT()` function, pure DLT (NO Quick SMS fallback), per-event `tids` map
- `notifications.ts` — all event functions now import from `sms.ts`; Quick SMS is permanently disabled for production events
- `sender_id` — "ABURHA" (DLT-registered, updated in production DB via migration 2026-07-21)

## Template ID Config Keys (api_settings.fast2sms.extra)

| Event | Config key |
|---|---|
| Booking Received | `booking_created_tid` |
| Booking Approved | `booking_confirmed_tid` |
| Booking Rejected | `booking_rejected_tid` |
| Payment Received | `payment_received_tid` |
| Partial Payment | `partial_payment_tid` |
| Invoice Ready | `invoice_created_tid` |
| Payment Reminder | `pending_payment_tid` |
| Flight Ticket | `ticket_issued_tid` |
| Flight Reminder | `departure_reminder_tid` |
| Visa Ready | `visa_issued_tid` |

All fall back to `notify_template_id` if not set. If empty string, SMS is skipped with a warning log (no Quick SMS fallback).

## Admin Setup Required

Admin must enter real Fast2SMS DLT template IDs in:
**Admin → API Settings → Fast2SMS → numbered template fields (1-10)**

## Production State (2026-07-21)

- sender_id = "ABURHA" (updated via POST /api/migrate/update-sms-sender)
- No template IDs configured yet — SMS events skip with warning until admin enters them
- Same endpoint accepts `templateIds` body to bulk-set: `{"key":"...","templateIds":{"booking_created_tid":"123456"}}`

**Why:** Admin must get IDs from Fast2SMS dashboard → DLT Templates and enter per-event IDs. Never use Quick SMS for India production DLT compliance.
