---
name: OTP DLT production configuration
description: Correct Fast2SMS sender and template ID for OTP delivery; how to configure and test
---

## Correct OTP configuration (production-verified)
- **otp_sender**: `ALBURH` (NOT ABURHA — ABURHA fails with "Invalid Message ID")
- **otp_template_id**: `164844`
- **route**: `dlt` only — Quick/Promotional blocked
- **variables_values**: `{otp}|` (OTP value + pipe separator)
- **API endpoint**: `GET https://www.fast2sms.com/dev/bulkV2?authorization={key}&route=dlt&sender_id=ALBURH&message=164844&variables_values={otp}|&numbers={phone}&flash=0`

## How to configure / re-configure
`POST /api/migrate/configure-otp-template` with body:
```json
{ "key": "alburhan-migrate-2026", "otp_template_id": "164844", "otp_sender": "ALBURH" }
```
This writes to `api_settings.extra_fields_encrypted` (encrypted) and calls `invalidateCache()`.

## How to test live (no rate limit)
`POST /api/migrate/test-otp-dlt` with body:
```json
{ "key": "alburhan-migrate-2026", "mobile": "9893989786", "test_otp": "123456" }
```
Returns full request URL (masked), HTTP status, Fast2SMS response body, delivery status.

## Why
- The code previously had a hardcoded fallback `otp_template_id || "164844"` — this silently sent with an invalid template if the DB field was empty
- The sender was ABURHA globally, but the OTP template is bound to ALBURH in TRAI DLT — mismatch causes "Invalid Message ID (or Template, Entity ID)"
- Fix: removed hardcoded fallback, added pre-send validation with clear error messages, added otp_sender per-event config

**How to apply**: if OTP SMS fails in future, first check `/api/migrate/fast2sms-templates` to confirm sender and template are set, then run `/api/migrate/test-otp-dlt` to get exact Fast2SMS response.
