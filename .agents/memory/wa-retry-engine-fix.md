---
name: WhatsApp retry engine fix
description: Fix for WhatsApp retry using text API (24h window) instead of template API; both retry paths now use forceTemplateApi + stored named vars
---

# WhatsApp Retry Engine — Template API Fix

## The Rule
ALL WhatsApp retries must use `forceTemplateApi: true` + the original `variables` from
`request_payload` stored in `notification_logs`. The text/session API ALWAYS fails outside 24h.

## Why
The retry engine in `index.ts` and `retryNotification()` in `notificationEngine.ts` both used
`sendText` / `sendWhatsApp` (text API) for retries. Text API fails with "Sending message outside
24 hour window is not allowed" for ALL ERP-initiated outbound retries. This created a spam loop:
fail → retry via text → 24h error → permanently_failed after 5 retries.

## How to Apply
- `index.ts` retry engine (runRetryEngine): Extract `variables` from `log.request_payload`.
  Call `sendTemplate(recipient, templateId, { forceTemplateApi: true, variables: origVars, ... })`.
  Messages with NO templateId (plain text sends): mark permanently_failed immediately, no retry.
- `notificationEngine.ts` `retryNotification()`: Same pattern — extract `storedTemplateId` and
  `storedVars` from `log.request_payload`, call `bbSendTemplate(...)` with forceTemplateApi.
- Template vars are stored in notification_logs.request_payload as `variables: {Name: "...", ...}`.

## Permanent Error Cleanup
The startup block (index.ts lines ~2738-2745) marks any `status='failed'` WhatsApp message with
`'24 hour'` in provider_response as `permanently_failed`. This cleans residual failures on restart.

## BotBee Named Vars (re-confirmation)
Send `variables` as NAMED OBJECT `{Name: "...", BookingID: "..."}` matching template variable_map.
Flat arrays are silently accepted by BotBee (HTTP 200 + wamid) but NOT substituted in delivery.
