---
name: BotBee named variables format
description: The ONLY variable format that substitutes {{1}},{{2}} in BotBee templates is a named object with exact keys from variable_map.
---

## Rule
Send `variables` as a named object: `{ Name: "val", BookingID: "val2", PackageContent: "val3", ... }`  
Keys must EXACTLY match the BotBee variable names from `variable_map.body` (stripped of `#!` and `!#`).

**Why:** BotBee maps the named keys to {{1}},{{2}},... positions internally before sending to Meta.  
Flat array `variables: [...]` → HTTP 200 + wamid, but NOT substituted.  
Meta-style `components: [{type:"body",parameters:[...]}]` → HTTP 200 + wamid, but NOT substituted.  
Only named object causes actual substitution.

**How to apply:** When adding a new BotBee template:
1. Fetch `variable_map` from `GET /api/v1/whatsapp/template/list` for the template
2. Strip `#!` and `!#` from each value to get the key names
3. Pass `variables: { KeyName: "value", ... }` to `sendTemplate()`

## Confirmed variable maps (verified 2026-07-18)
```
409950 booking_approved      → Name, BookingID, PackageContent, Amount, Paymenturllink
409953 payment_received      → Name, BookingID, Invoice, Amount
409956 invoice_ready         → Name, BookingID, Invoice, Amount, Paymenturllink
409958 agreement_ready       → Name, BookingID, Agreement, Download
409965 agreement_signed      → Name, Agreement
409991 visa_issued           → Name, BookingID, Visano, Download
409994 ticket_issued         → Name, BookingID, Flightnumber, Download
409999 flight_reminder       → Name, BookingID, PackageContent, Flightnumber, Departuredate, Reportingtime, Airport
410000 return_flight_reminder → Name, BookingID, Flightnumber, Departuredate, Reportingtime, Airport
410008 room_allocation       → Name, BookingID, Hotel, Roomnumber
410022 group_orientation     → Name, date, Time, Hussainhall
410026 departure_reminde     → Name, BookingID, Departuredate, Reportingtime, T2
410030 welcome_saudi         → Name
410031 arrival_india         → Name
410040 hajj_package_launch   → Name, 2027
```

Note: `T2` = departure terminal/airport for departure_reminde.  
Note: `2027` is the literal variable name for hajj_package_launch year.  
Note: `PackageContent` (not `Package`) for booking_approved and flight_reminder.
