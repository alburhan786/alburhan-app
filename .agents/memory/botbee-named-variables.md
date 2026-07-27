---
name: BotBee template variable substitution — definitive root cause and fix
description: Why #!Name!# appeared unsubstituted and what the confirmed correct payload format is
---

## Root Cause (DEFINITIVE — confirmed 2026-07-26)

BotBee templates (IDs 409950–410040) have two substitution layers:
- `body_content` with `{{1}}-{{N}}` — Meta Cloud API substitutes these when routing via Meta
- `mixed_body_text` with `#!Name!#`, `#!BookingID!#`, ... — BotBee CRM substitutes these

**BotBee's `/whatsapp/send/template` endpoint uses `mixed_body_text` for delivery.**
It substitutes `#!VarName!#` ONLY when `variables` is a **named object** whose keys match
`variable_map` exactly: `{"Name":"value", "BookingID":"value2", ...}`

**Flat positional arrays** (`["value1","value2",...]`) return HTTP 200 + valid wamid but
`#!Name!#` etc. remain UNSUBSTITUTED in the delivered message. This was the production bug.

## Correct Payload Format

```json
POST /api/v1/whatsapp/send/template
{
  "apiToken": "...",
  "phone_number_id": "965912196611113",
  "phone_number": "919867114562",
  "template_id": 409950,
  "variables": { "Name": "Mohammed Altaf", "BookingID": "ABT26421971", "PackageContent": "Economy Umrah", "Amount": "94,500", "Paymenturllink": "https://alburhantravels.com/invoice/ABT26421971" },
  "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "Mohammed Altaf" }, ...] }]
}
```

Both `variables` (named object) and `components` are sent. BotBee uses `variables` for
`mixed_body_text` substitution; `components` supports BotBee's internal Meta Cloud API routing.

## What Was Fixed (July 2026)

`sendTemplate()` FALLBACK PATH was sending `Object.values(namedVars)` (flat array) instead
of `namedVars` (named object). Changed to send named object + components in parallel.

`sendBotBeeEventTemplate()` in notificationEngine.ts was NOT setting `forceTemplateApi:true`,
so customers in an active 24h WhatsApp session received locally-rendered plain text (worked),
but customers outside the 24h window fell through to the template API with flat array (broken).
Fix: always use `forceTemplateApi:true` to guarantee template API delivery for all customers.

## forceTemplateApi Rule

**ALL ERP-initiated outbound notifications must set `forceTemplateApi: true`** in opts.
This bypasses the 24h session window check and goes directly to the template API endpoint.
Without it: customers outside the 24h window fall through to template API with wrong format.

## Variable Key Names by Template (from variable_map)

```
409950 booking_approved:      Name, BookingID, PackageContent, Amount, Paymenturllink
409953 payment_received:      Name, BookingID, Invoice, Amount
409956 invoice_ready:         Name, BookingID, Invoice, Amount, Paymenturllink
409958 agreement_ready:       Name, BookingID, Agreement, Download
409965 agreement_signed:      Name, Agreement
409991 visa_issued:           Name, BookingID, Visano, Download
409994 ticket_issued:         Name, BookingID, Flightnumber, Download
409999 flight_reminder:       Name, BookingID, PackageContent, Flightnumber, Departuredate, Reportingtime, Airport
410000 return_flight_reminder: Name, BookingID, Flightnumber, Departuredate, Reportingtime, Airport
410008 room_allocation:        Name, BookingID, Hotel, Roomnumber
410022 group_orientation:      Name, date, Time, Hussainhall
410026 departure_reminde:      Name, BookingID, Departuredate, Reportingtime, T2
410030 welcome_saudi:          Name
410031 arrival_india:          Name
410040 hajj_package_launch:    Name, 2027 (literal key, maps to year)
```

## Validation Added

`sendTemplate()` now:
1. Blocks send if any variable VALUE contains `#!VarName!#` or `{{N}}` (unresolved placeholder)
2. Warns (but allows) if any variable value is empty string or `"-"`
3. Warns if no variables are passed at all

## CORRECT_PHONE_NUMBER_ID

Must be `965912196611113` (15 digits). Hardcoded as `CORRECT_PHONE_NUMBER_ID` in botbee.ts.
Any 14-digit version blocks all template delivery.

## 2026-07-27 Update — Pre-render fallback

ALL BotBee variable formats return status:1 + wamid but deliver #!Name!# unsubstituted:
- Named object: {Name:"v1", BookingID:"v2"} → NOT substituted
- Positional array: ["v1","v2"] → NOT substituted
- Index-keyed: {"1":"v1","2":"v2"} → NOT substituted
- Components [{type:"text",text:"v1"}] → NOT substituted
- Pre-render + message field: {template_id:N, message:"rendered text", variables:{...}} → STATUS UNKNOWN (pending phone check)

CURRENT FIX: FALLBACK PATH now sends `message` field with pre-rendered body text alongside `variables`.
Debug endpoint: GET /api/debug/notifications/:bookingId?key=alburhan-migrate-2026
