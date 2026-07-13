---
name: BotBee WhatsApp Template Status
description: BotBee /whatsapp/send/template endpoint exists and returns JSON, but "WhatsApp account not found" for all numbers — BotBee dashboard setup required. Also: PHONE_NUMBER_ID has trailing space — always trim.
---
# BotBee WhatsApp Template

## Critical: Trim all credentials
`BOTBEE_PHONE_NUMBER_ID` env var has a trailing space (`+918989701701 ` len=14).
Without `.trim()`, BotBee returns "Please enter a valid mobile number. After clearing all non-numeric characters it is empty."
Fixed in `getCredentials()` and `sendTemplate()` — both use `.trim()` now.

## Endpoint facts
- Session messages: `POST ${baseUrl}/whatsapp/send` with `application/x-www-form-urlencoded`
- Template messages: `POST ${baseUrl}/whatsapp/send/template` with `application/json`
- BOTBEE_BASE = `https://app.botbee.io/api/v1`

## Current runtime status
- Session messages (within 24h): ✅ Works
- Session messages (outside 24h): ❌ "Sending outside 24h window not allowed" — expected
- Templates: ❌ "WhatsApp account not found" — BotBee DASHBOARD issue, not code

**Why:** "WhatsApp account not found" is a BotBee account configuration issue.
Templates must be registered in app.botbee.io dashboard for that phone_number_id.

## How to apply
Code is correct. User action needed:
1. Log into app.botbee.io
2. Connect WhatsApp Business Account (Meta WABA)
3. Import templates (booking_confirmed, payment_received, booking_approved, invoice_ready)
4. Wait for Meta approval
5. `sendTemplate` in botbee.ts will then work without code change
