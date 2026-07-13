---
name: SMS DLT → Quick route fallback
description: sendDLTSMS now tries DLT (template) first, falls back to Fast2SMS quick route if DLT fails or template ID missing
---
# SMS DLT + Quick Route Fallback

## Rule
`sendDLTSMS` in `notifications.ts` now has two routes:
1. **DLT** (primary): uses `notify_template_id` from api_settings (default fallback "211277"). DLT requires registered TRAI template; "211277" is INVALID for this Fast2SMS account.
2. **Quick** (fallback): plain text, no DLT registration needed. Route=q with booking confirmation message. Confirmed working.

**Why:** Template ID "211277" returns "Invalid Message ID" from Fast2SMS. Fast2SMS returns HTTP 200 even on failure so the old code logged false "sent" status. The quick route (`route=q`) sends successfully as confirmed via direct API test.

## How to apply
- If user registers a proper DLT notification template, set its ID in Admin → API Settings → Fast2SMS → extra_fields.notify_template_id
- Until then, quick route handles notification SMS reliably
- OTP SMS uses template "164844" (separate path, not affected)
