---
name: Notification Health Endpoints
description: How the notification health dashboard, run-checks, and e2e-test endpoints are registered — bypass pattern for requireModuleAccess guard
---

## Rule
All three notification health endpoints must be registered directly on `app` in `app.ts`, NOT inside the admin router (`admin.ts`).

**Why:** `admin.ts` has `router.use(requireModuleAccess("reports"))` at the router level. This blocks ALL routes mounted under it for users whose `adminRole` is anything other than `"admin"` / `"super_admin"`. It also blocks `POST` routes entirely for accounts with restricted roles. Moving these endpoints to `app.ts` lets them use inline `requireAdmin` (or migration-key bypass) without being caught by the module-access guard.

## Current endpoints (all in app.ts)
- `GET  /api/admin/notification-health` — enriched 5-channel stats + provider status + daily/top-events/recent logs. Supports `?key=<MIGRATION_KEY>` bypass.
- `POST /api/admin/notification-health/run-checks` — live connectivity probe for all 5 providers (BotBee, Fast2SMS, SMTP, Firebase, Lemin). Updates `api_settings.status + last_tested`. Supports migration-key bypass.
- `POST /api/admin/e2e-test` — fires real test messages: WA (template 409950 via `sendTemplate` from botbee.ts), SMS (`sendBookingConfirmed`), Email, Push (FCM), RCS (Lemin). Supports migration-key bypass.

## How to apply
Any new monitoring/health endpoint that must be accessible by all admin roles should go into `app.ts` directly (before `app.use("/api", router)`), never into the admin router.

## E2E test channel bindings (confirmed working 2026-07-28)
- WhatsApp: `sendTemplate(phone, "409950", { forceTemplateApi: true, variables: {...} })` from `./lib/botbee.js`
  - Must use numeric template ID (409950), NOT string name like "booking_confirmed"
  - Must use `forceTemplateApi: true` to bypass 24h session window
- SMS: `sendBookingConfirmed({...})` from `./lib/sms.js` — uses template 214139 (confirmed working)
- Email: `sendEmail(to, subject, body)` from `./lib/notifications.js`
- Push: FCM via `./lib/webPush.js` — fails gracefully if no admin tokens registered
- RCS: `sendRCS(phone, msg)` from `./lib/notifications.js` — fails gracefully if Lemin unconfigured
