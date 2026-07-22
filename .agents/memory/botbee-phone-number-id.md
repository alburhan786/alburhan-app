---
name: BotBee phone_number_id
description: Correct 15-digit Meta Phone Number ID for BotBee WhatsApp sending; a 14-digit typo was hardcoded for months.
---

# BotBee Correct Phone Number ID

**Correct value:** `965912196611113` (15 digits)
**Wrong value (old typo):** `96591219661113` (14 digits — missing the 4th-from-last digit)

## Source of truth
- Hardcoded as `CORRECT_PHONE_NUMBER_ID` in `artifacts/api-server/src/lib/botbee.ts`
- This constant overrides DB and env var to prevent typos propagating
- DB (`api_settings` extra_fields_encrypted) and env var `BOTBEE_PHONE_NUMBER_ID` should also be `965912196611113`

## Confirmed working
- GET call with `phone_number_id=965912196611113` → `{"status":"1","message":"Template message has been sent successfully."}`
- POST `/api/migrate/test-botbee-template` after deploy → status=1

**Why:** BotBee's template API uses this ID to look up the WhatsApp Business Account. One missing digit causes "WhatsApp account not found." on every template send.

**How to apply:** If template sends ever break again with "WhatsApp account not found", check `CORRECT_PHONE_NUMBER_ID` in `botbee.ts` first — it must be exactly 15 digits: `965912196611113`.
