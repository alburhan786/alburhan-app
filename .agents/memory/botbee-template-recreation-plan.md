---
name: BotBee template recreation plan
description: Step-by-step plan for recreating 15 BotBee WhatsApp templates with proper Meta {{1}} variable format after confirming API cannot do it programmatically
---

## Root Cause
BotBee submitted all 15 templates to Meta using `#!Name!#` as literal body text. Meta registered them as static text — no variable slots. `template_json` shows `{{1}}` (BotBee's internal converted format) but the ACTUAL approved body on Meta has `#!Name!#` literally.

## BotBee API Limitations (confirmed by exhaustive probe)
- NO template creation API (all paths 404: create, save, store, submit, add)
- NO template deletion API (all paths 404: delete, destroy, remove, DELETE verb)
- NO settings/account API exposing Meta access token (all paths 404)
- Template management is DASHBOARD-ONLY at https://app.botbee.io

## Backend Changes Already Deployed
- `renderTemplateBody()` in botbee.ts handles BOTH `#!VarName!#` and `{{N}}` formats
- `applyTemplateOverrides()` exported from botbee.ts — hot-patches TEMPLATE_BODIES + ABT_TEMPLATES in-memory
- Overrides persisted in `api_settings` key `botbee_template_overrides` (JSON)
- Startup loader in index.ts reads overrides from DB on every server restart
- `POST /api/migrate/activate-new-templates` — accepts new IDs + bodies, activates immediately + persists

## Activation Curl Command
After templates approved on BotBee dashboard, call:
```
POST https://alburhantravels.com/api/migrate/activate-new-templates
{ key: "alburhan-migrate-2026", templates: { "booking_approved": { id: "NEW_ID", body: "...{{1}}..." }, ... } }
```

## Template Bodies (ready to copy-paste)
See chat history for all 15 template bodies with {{1}},{{2}},... format.

## Critical instruction for BotBee dashboard
Do NOT use BotBee's "Add Variable" button (inserts #!Name!# CRM format).
Type {{1}}, {{2}} directly as literal text in the template body editor.
