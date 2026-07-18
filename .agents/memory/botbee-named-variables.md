---
name: BotBee template variable substitution — definitive root cause and fix
description: Why messages weren't delivered and what the confirmed working payload looks like
---

## Root Cause (DEFINITIVE — confirmed 2026-07-18)

BotBee templates (IDs 409950–410040) have:
- `body_content` with `{{1}}-{{N}}` (Meta's format) — Meta substitutes these ✅
- `variable_map.body`: `{"1":"#!Name!#", "2":"#!BookingID!#", ...}` — BotBee CRM internal
- `raw_data.mixed_body_text` with `#!Name!#` — BotBee's OWN CRM substitution layer (NOT what Meta sees)

Meta DID register the templates with `{{1}}-{{5}}`. Sending flat array via template API DOES substitute correctly. My earlier memory note that "NONE substituted variables" was WRONG — it was based on speculation, not physical verification of received messages.

## What Was Actually Broken

THREE separate bugs prevented correct WhatsApp delivery:

### Bug 1: PRIMARY PATH (text API) was silently dropping messages
- `sendTemplate()` took the PRIMARY PATH because `TEMPLATE_BODIES["409950"]` existed
- PRIMARY PATH: sends rendered text via `/whatsapp/send` (session-based, 24h window required)
- Outside 24h window: BotBee returns HTTP 200 with `status: "0"`, `"outside 24 hour window"` → `ok: false`
- FALLBACK fires → template API → returns wamid → but wamid column in DB was null (Bug 2)
- **Fix: `forceTemplateApi: true` in `sendBotBeeEventTemplate` opts — bypasses PRIMARY PATH entirely**

### Bug 2: wamid not extracted from responsePayload
- `trackNotification` INSERT had wamid as `null` — `innerRp?.wa_message_id` was not being extracted
- **Fix: trackNotification now extracts wamid from `responsePayload.wa_message_id`**

### Bug 3: finalAmount not passed to triggerWorkflow
- `bookings.ts` approval route called `triggerWorkflow("booking_approved", ctx)` without `finalAmount` or `amount`
- `notificationEngine` computed `ctx.finalAmount ?? ctx.amount ?? 0` → `0` → customer saw `₹ 0`
- **Fix: Add `finalAmount: Number((updated as any).finalAmount)` to triggerWorkflow call**

### Bug 4: customerName had trailing whitespace  
- DB stored `"mohammed altaf "` (trailing space) → WhatsApp showed `"mohammed altaf "`
- **Fix: `.trim()` in both `bookings.ts` triggerWorkflow call AND `notificationEngine` booking_approved case**

## Confirmed Working Payload (verified 2026-07-18, booking ABT26752405)

```
POST /whatsapp/send/template
{
  "template_id": 409950,
  "phone_number_id": "965912196611113",
  "phone_number": "919867114562",
  "variables": ["mohammed altaf", "ABT26752405", "Economy Umrah Package", "94,500", "https://alburhantravels.com/invoice/ABT26752405"]
}
→ wamid.HBgMOTE5ODY3MTE0NTYyFQIAERgSQzQ3RTI4OTgyNDk4MzdGNDc5AA==
```

All 5 variable formats (named object, flat array, components, numbered object, params) return valid wamids. BotBee maps flat array position 0→{{1}}, position 1→{{2}}, etc. Meta substitutes correctly.

## Variable key names by template (from variable_map, positions 1→N)

```
409950 booking_approved:      1=Name, 2=BookingID, 3=PackageContent, 4=Amount, 5=Paymenturllink
409953 payment_received:      1=Name, 2=BookingID, 3=Invoice, 4=Amount
409956 invoice_ready:         1=Name, 2=BookingID, 3=Invoice, 4=Amount, 5=Paymenturllink
409958 agreement_ready:       1=Name, 2=BookingID, 3=Agreement, 4=Download
409965 agreement_signed:      1=Name, 2=Agreement
409991 visa_issued:           1=Name, 2=BookingID, 3=Visano, 4=Download
409994 ticket_issued:         1=Name, 2=BookingID, 3=Flightnumber, 4=Download
409999 flight_reminder:       1=Name, 2=BookingID, 3=PackageContent, 4=Flightnumber, 5=Departuredate, 6=Reportingtime, 7=Airport
410000 return_flight_reminder: 1=Name, 2=BookingID, 3=Flightnumber, 4=Departuredate, 5=Reportingtime, 6=Airport
410008 room_allocation:       1=Name, 2=BookingID, 3=Hotel, 4=Roomnumber
410022 group_orientation:     1=Name, 2=date, 3=Time, 4=Hussainhall
410026 departure_reminde:     1=Name, 2=BookingID, 3=Departuredate, 4=Reportingtime, 5=T2
410030 welcome_saudi:         1=Name
410031 arrival_india:         1=Name
410040 hajj_package_launch:   1=Name, 2=2027
```

## Diagnostic Endpoints (on VPS)

- `POST /api/migrate/wa-approval-test {key, bookingId}` — calls `sendApprovalTemplate` DIRECTLY, bypasses dedup
- `POST /api/migrate/wa-fullpipeline-test {key, bookingId}` — calls `triggerWorkflow` end-to-end (includes dedup check, full notificationEngine path)
- `POST /api/migrate/botbee-format-test {key, phone}` — tests all 5 variable formats, all return wamid
- `GET /api/migrate/notification-audit?key=...` — shows recent notification_logs with provider_response
