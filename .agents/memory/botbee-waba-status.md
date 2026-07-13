---
name: BotBee WABA not connected — templates API 404
description: BotBee API returns "The route api/v1/whatsapp/templates could not be found." — WABA is not connected on BotBee dashboard, not a code issue
---

## Status (as of July 2026)
BotBee is configured in the bundle (API key, phone number ID, business ID all injected at build time). The `/api/whatsapp/templates` endpoint is correctly implemented and auth-protected (returns 401 without session, 200 with session). However, BotBee's API returns:

```json
{"ok":false,"errorMessage":"The route api/v1/whatsapp/templates could not be found."}
```

**Why:** The WhatsApp Business Account (WABA) is not connected on the BotBee dashboard. BotBee requires WABA onboarding before their template management APIs are available.

**Code is correct.** BotBee base URL: `https://app.botbee.io/api/v1`. The API key, phone number ID, and business ID are all present and valid in the bundle.

**Fix:** Connect WABA on BotBee dashboard (admin action, not code change).

**OTP WhatsApp:** Also uses BotBee template `otp_alburhan` — falls through to Fast2SMS SMS when BotBee fails. SMS OTP delivery confirmed working (smsSent: true, smsRoute: dlt).
