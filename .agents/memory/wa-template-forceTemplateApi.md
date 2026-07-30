---
name: WhatsApp forceTemplateApi root cause
description: Why #!Name!# appears literally in delivered WhatsApp messages, and the definitive fix.
---

## The rule
ALL ERP-initiated ABT WhatsApp template sends MUST use `forceTemplateApi: true` in opts.

## Why
Without it the primary path in `sendTemplate` runs: BotBee text API (`/whatsapp/send`) is tried first.
Outside the 24h customer-reply window (which is almost always for ERP-initiated sends), BotBee either:
- Returns HTTP 200 ok but Meta silently drops the message (no delivery), OR
- Re-delivers the template's `mixed_body_text` (which contains `#!Name!#`, `#!BookingID!#`, etc.) WITHOUT substituting variables, because the text API doesn't trigger BotBee's CRM variable_map substitution engine.

Result: customer sees literal `#!Name!# #!BookingID!#` etc. in the received message.

## How to apply
In `sendBotBeeEventTemplate` opts (notificationEngine.ts):
```ts
const opts = { ..., forceTemplateApi: true };
```
This forces the template API path (`/whatsapp/send/template`) which sends named vars as
`{ "#!Name!#": "Mohammed", "#!BookingID!#": "ABT123", ... }` and BotBee CRM substitutes correctly.

## Priority 2 (wa_templates DB fallback) bug
`sendWhatsAppForEvent` was passing `variableValues` as a flat array to `sendBotBeeTemplate`.
`Object.keys(["a","b"])` returns `["0","1"]`, producing `{ "#!0!#": "val" }` keys that never match
BotBee's `#!Name!#` variable_map. Fixed: build named object `{ varName: value }` instead.

## Template variable schema
Full mapping (BotBee key → ERP field → slot) is in `TEMPLATE_VARIABLE_SCHEMA` const in
`artifacts/api-server/src/routes/notification-center.ts` (template-preview endpoint).
Also viewable in the "🔍 Template Preview" tab of Communication Center (/admin/communication-center).
