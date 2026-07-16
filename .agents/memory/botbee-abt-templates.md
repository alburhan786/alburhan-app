---
name: BotBee ABT template send — BROKEN (WABA mismatch) + workaround applied
description: All BotBee template sends fail with "Message template not found"; root cause, workaround, and admin action required.
---

## The 7 Production Templates (defined in botbee.ts)

| Event | Template Name | ID | Parameters (in order) |
|---|---|---|---|
| Booking Submitted | bookingsubmitted | 407645 | name, packageName, bookingId, invoiceUrl |
| Payment Received | paymentreceived | 407646 | name, packageName, bookingId, "Paid", invoiceUrl |
| Pending Payment | pending_payment_reminder | 407648 | name, packageName, bookingId, paymentUrl |
| Booking Approved | approve | 407642 | name, bookingId, packageName, amount (₹) |
| Departure Reminder | departure_reminder | 407664 | name, packageName, flightNumber, departureDate, reportingTime, departureAirport, hotelName, emergencyContact |
| Visa Issued | visa_issued | 407667 | name, bookingId, packageName, visaUrl |
| Flight Ticket | flight | 361654 | name, bookingId, flightNumber, departureDate, ticketUrl |

## Status (July 2026): ALL TEMPLATE SENDS FAIL

`POST /api/v1/whatsapp/send/template` returns "Message template not found" for EVERY template.
Zero successful template sends in notification_logs history (confirmed via DB query).

## Root Cause
Templates in BotBee's list are registered under a **different WABA/phone_number_id** than the sending number (`965912196611113`). BotBee's template list (`POST /api/v1/whatsapp/template/list`) returns all 31 templates regardless, but send requires the template to be bound to the specific phone number used for sending.

Tried 8 payload formats (meta-components, variable_map, whatsapp_business_id, template_id+vars, to-field, business_account_id, whatsapp_bot_id) — all return same error.

## What WORKS
- Plain-text WhatsApp via `sendWhatsApp()` / `sendText()` — different BotBee endpoint, works fine
- `sendWhatsAppForEvent()` in notificationEngine.ts has text fallback when templates fail
- Template failures now SUPPRESSED from notification_logs (`skipFailureLog: true`)

## Admin Action Required to Fix Templates
Contact BotBee support:
1. Link templates to phone_number_id `965912196611113`
2. Re-sync/re-approve templates under current WABA
3. Verify Meta access_token in template_json is not expired

## Code Changes Applied (July 2026)
- `skipFailureLog?: boolean` added to `BotBeeTemplateOpts` interface in botbee.ts
- `sendBotBeeEventTemplate()` in notificationEngine.ts passes `skipFailureLog: true` — template failures don't pollute notification_logs; only text fallback outcome is logged
- BotBee auto-sync from BOTBEE_API_KEY env var → DB added in `initApiSettingsProvider()` (same pattern as Fast2SMS)
- `whatsapp.ts` connection test and automation-test now use `POST /whatsapp/template/list` (correct endpoint, was wrong GET)
- Admin UI (ApiSettings.tsx BotBee section) shows amber warning with actionable steps

## Code Structure
- **botbee.ts**: `ABT_TEMPLATES` + 7 exported sender functions + `BotBeeTemplateOpts` shared interface
- **notificationEngine.ts**: `ABT_TEMPLATE_EVENTS` set + `sendBotBeeEventTemplate()` routes EventType → correct template function
- Priority: ABT template (skipFailureLog) → wa_templates DB lookup → free-form session text
