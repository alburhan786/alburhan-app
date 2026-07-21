---
name: BotBee send/template endpoint broken
description: BotBee's /send/template endpoint returns "WhatsApp account not found" for this account; only /whatsapp/send works.
---

## Rule
Never use `forceTemplateApi: true` or fall through to `/send/template` for this BotBee account. The `/send/template` endpoint is non-functional for account 96591219661113 — it always returns `{"status":"0","message":"WhatsApp account not found."}` regardless of phone_number_id, business_id, or template format.

**Why:** BotBee's `/whatsapp/send` endpoint correctly identifies the account and delivers messages when the customer is in a 24h session window. The `/send/template` endpoint uses a different internal lookup that fails for this account (possibly a BotBee platform bug or misconfigured account connection).

**How to apply:**
- All sends must go through `/whatsapp/send` (the text endpoint)
- `CORRECT_PHONE_NUMBER_ID = "96591219661113"` is hardcoded in `botbee.ts` — do NOT inject from env (typos in the secret caused repeated failures)
- `BOTBEE_PHONE_NUMBER_ID` is excluded from `build.ts` injectKeys for this reason
- "Outside 24h window" response from `/whatsapp/send` = account IS found, credentials correct; customer just hasn't messaged in 24h
- If BotBee fixes `/send/template` in future, re-enable by restoring the fallthrough in `sendTemplate()` and adding `forceTemplateApi:true` back to notificationEngine opts
- OTP template: `wa_templates` table must have a row with `event_type='mobile_otp'`, `template_id='330483'`, `name='alburhan_login_otp'`, `enabled=true`
