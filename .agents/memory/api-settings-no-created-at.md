---
name: api_settings no created_at
description: api_settings table has no created_at column; only updated_at
---

# Rule
`api_settings` table columns: id, provider, enabled, api_url, api_key_encrypted, extra_fields_encrypted, updated_at, updated_by, status, last_tested, last_sms_status, last_sms_at, key, value.

**No `created_at` column.** Any INSERT into api_settings must use only `updated_at`, not `created_at`.

**Why:** webPush.ts and app.ts both had `INSERT INTO api_settings (key, value, created_at, updated_at)` which crashed VAPID key initialization on every restart.

**Fix pattern:**
```sql
INSERT INTO api_settings (key, value, updated_at) VALUES ($1, $2, NOW())
ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
```
