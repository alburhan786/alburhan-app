---
name: BotBee template variable substitution — definitive root cause
description: Why #!Name!# appears literally and what the hybrid fix does
---

## Root Cause (DEFINITIVE — verified 2026-07-18)

BotBee templates were created in BotBee's UI using their `#!Name!#` CRM variable syntax.
When BotBee submitted these to Meta for approval, Meta received `#!Name!#` as LITERAL TEXT (not Meta's {{1}} format). Meta approved all 15 templates as **static text** with no variable slots.

Evidence:
- `raw_data.mixed_body_text` = actual delivery body, contains `#!Name!#` literally
- `template_json.components[0].text` shows `{{1}}` — this is what BotBee stored internally but it does NOT reflect what Meta has registered
- 10 tested API formats (named object, flat array, components, params, numbered object, hash-bang keys, top-level keys, etc.) — ALL accepted (HTTP 200 + real wamid) but NONE substituted variables
- BotBee's substitution only works via their CRM automation engine (not raw API calls)

## Current sendTemplate() three-way situation (as of 2026-07-18)

### Path A — PRIMARY PATH (text API via /whatsapp/send) — was default before forceTemplateApi fix
- Renders TEMPLATE_BODIES["409950"] ({{1}} format) locally with real values
- Sends as plain text message via `/whatsapp/send` (session-based API)
- Within 24h window: customer sees correct content ✅; but no real wamid (text msg, not template)
- Outside 24h window: BotBee returns HTTP 200 "ok" but Meta silently drops the message ❌; status="sent" in DB is a LIE

### Path B — FALLBACK (template API via /whatsapp/send/template) — now forced via forceTemplateApi:true
- Calls BotBee template API with flat-array variables
- Real wamid returned ✅, message actually delivered ✅
- But message content shows `#!Name!# #!BookingID!#` etc. literally ❌ (no substitution)
- wamid stored in notification_logs ✅

### forceTemplateApi fix (deployed 2026-07-18):
- Added `forceTemplateApi?: boolean` to BotBeeTemplateOpts
- `sendBotBeeEventTemplate` opts now include `forceTemplateApi: true` → all ERP notification sends go to Path B
- TRADEOFF: message delivered (wamid proves it), but variables show literally
- Confirmed: wamid `wamid.HBgMOTE5ODY3MTE0NTYyFQIAERgSMjhCQzlERkJDNjZCNzVDMjQ0AA==` for ABT26582778

## Permanent Fix Required (admin action)

Admin must go to BotBee dashboard and:
1. Delete all 15 existing ABT templates (IDs 409950–410040)
2. Recreate them using `{{1}}`, `{{2}}`, etc. in the body text (Meta's variable format)
3. Wait for Meta approval (24–48h)
4. The new template IDs will auto-sync (ABT_TEMPLATES patch + syncBotBeeTemplates on startup)

Once recreated correctly with {{1}} variables, Path B (template API) will correctly substitute variables AND deliver with wamid.

## Double-₹ Bug (fixed 2026-07-18)
Template bodies already have `₹ #!Amount!#`. fmtAmount() was returning `₹1,89,000` → double rupee.
Fix: fmtAmount() now returns just `1,89,000` (no ₹ prefix).

## Variable key names by template (from variable_map, use in sendTemplate variables object)
```
409950 booking_approved:      Name, BookingID, PackageContent, Amount, Paymenturllink
409953 payment_received:      Name, BookingID, Invoice, Amount
409956 invoice_ready:         Name, BookingID, Invoice, Amount, Paymenturllink
409958 agreement_ready:       Name, BookingID, Agreement, Download
409965 agreement_signed:      Name, Agreement
409991 visa_issued:            Name, BookingID, Visano, Download
409994 ticket_issued:          Name, BookingID, Flightnumber, Download
409999 flight_reminder:        Name, BookingID, PackageContent, Flightnumber, Departuredate, Reportingtime, Airport
410000 return_flight_reminder: Name, BookingID, Flightnumber, Departuredate, Reportingtime, Airport
410008 room_allocation:        Name, BookingID, Hotel, Roomnumber
410022 group_orientation:      Name, date, Time, Hussainhall
410026 departure_reminde:      Name, BookingID, Departuredate, Reportingtime, T2
410030 welcome_saudi:          Name
410031 arrival_india:          Name
410040 hajj_package_launch:    Name, 2027
```
