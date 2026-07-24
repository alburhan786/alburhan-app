---
name: Web Push Notifications (VAPID-based)
description: Real browser push notification channel — no Firebase, no BotBee; works with just web-push npm package and VAPID keys.
---

## Architecture

- **`src/lib/webPush.ts`** — VAPID key generation (auto on first call, persisted to api_settings key='vapid_keys'), `sendPushToCustomer(customerId, payload)`, `storeSubscription()`, `removeSubscription()`
- **`src/routes/push.ts`** — mounted at `/api/push`; GET /vapid-key (public), POST /subscribe (requireAuth), DELETE /unsubscribe, GET /status
- **`customer_push_tokens` table** — `subscription JSONB` column added (migration); `token` = endpoint URL; `UNIQUE(customer_id, token)`
- **Both push cases in notificationEngine.ts** (`sendOnChannel` and `sendOnChannelWithType`) replaced Firebase stub with `sendPushToCustomer()` dynamic import
- **notification_settings** — push channel seeded for 10 key events on startup

## Frontend

- **`public/sw.js` v4.0** — push event handler (showNotification), notificationclick handler (focuses existing window or opens URL)
- **`src/hooks/usePushNotifications.ts`** — React hook; `urlBase64ToUint8Array()` converts VAPID public key; handles subscribe/unsubscribe; checks server subscription status on mount
- **CustomerDashboard.tsx** — amber "Enable" banner when permission=default; green badge when granted+subscribed

## Key Rules

- `web-push` npm package bundles fine into CJS (no native addons); NOT in RUNTIME_EXTERNAL list in build.ts
- VAPID keys are generated once per deployment and stored in api_settings; they MUST persist or all existing subscriptions break
- Remove stale subscriptions on HTTP 410/404 response from sendNotification()
- `userVisibleOnly: true` is required for Chrome/Android — cannot change this
- Push only delivers when customer has enabled permission AND service worker is registered

**Why:** WhatsApp is broken (WABA mismatch + 24h session policy prevents unilateral sends). Push is the replacement real-time channel that actually works without BotBee.
