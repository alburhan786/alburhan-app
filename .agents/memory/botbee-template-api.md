---
name: BotBee Template API — 4-param ID-only send
description: BotBee sendTemplate() uses only 4 fields: apiToken, phone_number_id, phone_number, template_id. No template name, language, or components.
---

## Rule
`sendTemplate(to, templateId, opts?)` in botbee.ts sends exactly:
```json
{ "apiToken": "...", "phone_number_id": "...", "phone_number": "...", "template_id": "407642" }
```
No `template.name`, no `template.language`, no `template.components` in the payload.

**Why:** BotBee requires only the numeric template_id, not the template name. All name-based approaches (10+ tried) returned 404/error. The 4-param format is the correct one per BotBee dashboard.

**How to apply:**
- Every new template send must use the numeric template_id from BotBee dashboard
- Store template_id in wa_templates.template_id column (TEXT)
- OTP template_id comes from wa_templates WHERE event_type='mobile_otp' AND enabled=true AND template_id IS NOT NULL
- ABT_TEMPLATES built-in events use hardcoded IDs (407642, 407645, 407646, 407648, 407664, 407667, 361654)
- Request log excludes apiToken; response is logged in full JSON
