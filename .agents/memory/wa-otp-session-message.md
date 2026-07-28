---
name: WA OTP session message approach
description: Why WhatsApp OTP uses sendText (session message) instead of sendTemplate, and what the root failure was
---

## Rule
WA OTP in auth.ts MUST use `sendText()` (session message), NOT `sendTemplate()` with the alburhan_login_otp template (ID 330483).

## Why
Template 330483 is **AUTHENTICATION category** with a `{{1}}` positional variable in the body.
BotBee's `sendTemplate()` wraps all named variable keys as `#!key!#` before sending to its API (e.g. `{"1": otp}` becomes `{"#!1!#": otp}`).
BotBee then tries to substitute `#!1!#` into the body, but the body uses `{{1}}` (Meta positional format), so no match is found.
BotBee sends the raw 87-char body as "parameter at index 0" → rejected with "Parameter at index 0 exceeds the parameter length limit 15".

This caused 6,000+ `permanently_failed` entries in `notification_logs`.

## How to apply
- `auth.ts` send-otp: call `sendText(cleanMobile, waMessage)` where `waMessage` is a plain-text string containing the OTP.
- The function export name is `sendText` (NOT `sendBotBeeWhatsApp` — that function does not exist).
- WA session messages only work within 24h of the user last messaging the bot. Failure is expected for cold users; the chain falls through to SMS automatically.
- OTP delivery chain: **RCS (2-min cooldown per number) → WA session → SMS DLT → Email**.
- Do NOT re-introduce `sendTemplate` for OTP unless the template category changes from AUTHENTICATION to UTILITY and BotBee's API handles the `#!...!#` → `{{n}}` mismatch.
