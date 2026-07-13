---
name: BotBee WhatsApp Template Status
description: BotBee /whatsapp/send/template endpoint exists and returns JSON, but "WhatsApp account not found" for all numbers — BotBee dashboard setup required
---
# BotBee WhatsApp Template

## Rule
- **Endpoint**: `POST /api/v1/whatsapp/send/template` (slash, not hyphen `/send-template` which is 404)
- **Session messages**: `/api/v1/whatsapp/send` works (returns 24h window error for real numbers, not 404)
- **Template messages**: Returns `{"status":"0","message":"WhatsApp account not found."}` for ALL numbers including real ones with `business_account_id` included

**Why:** "WhatsApp account not found" is a BotBee ACCOUNT configuration issue, not a code issue. The template messaging feature must be enabled and templates must be registered in the BotBee dashboard before template sends will work.

## How to apply
Code is correct. User action needed:
1. Log into app.botbee.io
2. Enable template messaging for the phone number
3. Import WhatsApp Business templates (hello_world, booking_confirmed, payment_received, etc.)
4. Once done, `sendTemplate` in botbee.ts will work without any code change

## Note on `business_account_id`
Added `BOTBEE_BUSINESS_ID` to the template payload in botbee.ts. Does not fix "account not found" but is correct per BotBee API spec.
