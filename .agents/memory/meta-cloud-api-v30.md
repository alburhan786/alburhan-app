---
name: Meta Cloud API v30.0 integration
description: WhatsApp Cloud API as primary provider; secrets needed on VPS; key files and DB tables; activation checklist
---

## Rule
Meta Cloud API is the PRIMARY WhatsApp provider. Notification priority: Meta Cloud API → BotBee → SMS → Email.
The system gracefully degrades to BotBee when META_ACCESS_TOKEN is not set.

**Why:** Customer required Meta as primary to reduce per-message costs and gain delivery analytics.

**How to apply:** When adding new notification events, add the event type to `META_EVENT_TEMPLATE_MAP` in `metaWapi.ts`. The notificationEngine Priority-0 block fires automatically for all events in that map.

## Key files
- `artifacts/api-server/src/lib/metaWapi.ts` — all Meta Cloud API logic
- `artifacts/api-server/src/routes/meta.ts` — admin API routes at `/api/meta/*`
- `artifacts/api-server/src/lib/notificationEngine.ts` — Priority 0 block in `sendWhatsAppForEvent()`
- `artifacts/api-server/src/routes/social-media.ts` — webhook POST handles statuses[] delivery callbacks
- `artifacts/alburhan/src/pages/admin/MetaHealth.tsx` — `MetaCloudPanel` component at top of page

## DB tables (meta_*)
`meta_messages`, `meta_delivery_logs`, `meta_templates`, `meta_token_status`, `meta_media_cache`
All created IF NOT EXISTS in `runMigrations()` in `index.ts`.

## Secrets needed on VPS .env to activate
```
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WABA_ID
META_BUSINESS_ACCOUNT_ID
META_APP_ID
META_APP_SECRET
META_VERIFY_TOKEN
META_WEBHOOK_SECRET
META_API_VERSION   (optional — defaults to v20.0)
```
Without these, `/api/meta/health` returns `configured: false` and `connection: "degraded"` — BotBee is used.

## Retry schedule
6 slots: 1m, 5m, 15m, 30m, 1h, 24h — stored in `meta_messages.retry_count` / `next_retry_at`.

## Webhook URL
`https://alburhantravels.com/api/social-media/webhook/meta`
Handles: WA delivery statuses (statuses[]), incoming WA messages, Facebook lead ads, Messenger/IG DMs.

## Admin endpoints (all require requireAdmin)
- GET /api/meta/health — full status dashboard data
- GET /api/meta/stats — 7d message stats
- GET /api/meta/templates — synced templates from DB
- POST /api/meta/sync-templates — pull templates from WABA API
- POST /api/meta/validate-token — test token + phone number
- POST /api/meta/retry — trigger retry queue manually
- GET /api/meta/missing-secrets — list unconfigured secrets
- POST /api/meta/test-send — send test message (admin only)

## /admin/meta-status page
Full production status dashboard at `/admin/meta-status`. Shows all 13 fields,
missing-secrets alert, validate-token/sync-templates/retry buttons,
10-event E2E Certification runner, printable Production Certification Report.

## Deployed
v30.0-meta-production — 2026-07-25 · frontend redeployed with MetaStatus page
