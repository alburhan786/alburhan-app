---
name: FCM implementation pattern
description: Firebase Cloud Messaging setup for VPS-bundled Node.js — no firebase-admin SDK, pure REST
---

## Rule
Never use firebase-admin SDK on the VPS API server. Use FCM v1 REST API + Node.js built-in `crypto` for JWT signing.

**Why:** firebase-admin bundles native modules that break when bundled into CJS for VPS (MODULE_NOT_FOUND on startup). The FCM v1 REST API accepts a signed JWT (RS256) + OAuth2 token exchange — pure Node crypto handles this with zero extra deps.

**How to apply:**
- `lib/fcm.ts` uses `crypto.createSign("RSA-SHA256")` to sign JWT claims
- Exchange at `https://oauth2.googleapis.com/token` for an access token (cached 50 min)
- Send to `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
- `FIREBASE_PRIVATE_KEY` has literal `\n` (not newlines) in env vars — always call `.replace(/\\n/g, "\n")` before use

## Token registration
- Frontend: `useFCM` hook registers FCM token via `POST /api/push/register-token` after `getToken()` succeeds
- Tokens stored in `customer_push_tokens(id, customer_id, token, platform, device_info, updated_at, created_at)`
- ON CONFLICT (customer_id, token) DO UPDATE — deduplication handled at DB level
- `push_campaigns` table logs all broadcast sends (filter, total_tokens, sent, failed, status)

## Service worker
- Using existing `sw.js` (not a separate `firebase-messaging-sw.js`) — useFCM passes `serviceWorkerRegistration: sw` to `getToken()` so Firebase uses the existing SW
- SW must handle BOTH FCM nested format `{notification:{title,body}, data:{url}}` AND legacy flat format `{title,body,url}`

## Audience filters
`getTokensByFilter(filter)` supports: all, hajj, umrah, payment_pending, visa_ready, ticket_issued, agreement_signed, (default) package name ILIKE

## Build/deploy
- All 8 Firebase keys added to `build.ts` injectKeys so they're baked into VPS bundle
- Frontend VITE_* vars read at Vite build time; backend reads same VITE_ vars for `getFirebaseWebConfig()` endpoint
- Always run `pnpm build` before VPS self-update to ensure new Firebase keys are in the bundle
