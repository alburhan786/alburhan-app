---
name: Fast2SMS OTP stale-key fix
description: Why OTP failed on VPS after redeploy, and the permanent fix applied to autoImportFast2SmsFromEnv
---

## The Bug

`autoImportFast2SmsFromEnv()` in `apiSettingsProvider.ts` had this guard:

```typescript
if (existing?.apiKey && !isPlaceholderKey(existing.apiKey)) return; // DB already has a real key
```

This meant: if the DB had ANY non-placeholder key (even stale/wrong), it would skip syncing the new bundle's injected key. When a redeploy brought a new bundle with a fresh `FAST2SMS_API_KEY`, the DB kept the old encrypted key — which may have been encrypted with a different `SESSION_SECRET` (returning garbage on decrypt) or was simply an old/expired key value.

## The Fix

Changed the guard to compare env key vs DB key, and sync whenever they differ:

```typescript
// Already in sync — skip the write
if (dbKey && !isPlaceholderKey(dbKey) && dbKey === envKey) {
  console.log("[ApiSettings] fast2sms: DB key matches env key — no sync needed");
  return;
}
// Otherwise: sync env → DB (reason: stale/different/missing)
```

**Why:** The bundle's injected env key is always the authoritative value (baked in at build time from Replit secrets). The DB is a cache. The DB should always match the bundle's key after deploy.

## How to Apply

- Any time `autoImportFast2SmsFromEnv` is touched, preserve the `envKey === dbKey` equality check.
- If OTP fails after a deploy, call `POST /api/migrate/resync-fast2sms` (key-protected, no session) or `POST /api/admin/resync-fast2sms` (requires admin session) to force-write the bundle key to DB.
- The `GET /api/migrate/fast2sms-diag` endpoint shows `env_key`, `db_key`, and `in_sync` (all masked, no full key exposed).

## Diagnostic Confirmation (VPS, post-fix)
```json
{"env_valid": true, "db_valid": true, "in_sync": true, "db_enabled": true}
```
Deploy status: `sms: "configured", whatsapp: "configured", db: "connected"` ✓
