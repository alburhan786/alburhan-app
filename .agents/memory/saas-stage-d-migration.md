---
name: SaaS Stage D migration outcome
description: Production migration results for v38–v41; dry-run findings; v41-strict-rls deferral; Stage E migration permission issue
---

## What ran on production (2026-08-03)

All migrations applied via `sudo -u postgres psql -d alburhan_db -f /tmp/stage-d-migrations/<file>`.  
SQL files must be in `/tmp` (not `/root`) — postgres OS user cannot read `/root` (mode 700).

| Migration | Status |
|---|---|
| v38-tenant-foundation | ✅ Applied |
| v39-tenant-not-null | ✅ Applied |
| v40-tenant-quotas | ✅ Applied |
| v40-tenant-credentials | ✅ Applied |
| v40-rls | ✅ Applied (52 permissive policies) |
| v41-quota-expansion | ✅ Applied |
| v41-credential-audit | ✅ Applied |
| v41-strict-rls | ⚠️ Deferred (rolls back — see below) |

Post-migration: 158 tables (was 154), zero NULL tenant_id rows, production health ok.

## Why v41-strict-rls deferred

v41.2 verifies that `ai_conversations` + `automation_service_tokens` have FORCE RLS.  
These tables are created by v37 (AI Automation), which hasn't run on current production.  
When Stage E deploys the new SaaS bundle, v37 runs first → those tables exist → v41.2 passes.  
v40 permissive policies (`empty tenant = allow all`) are active and backward-compatible in the meantime.

## Stage E migration permission issue

The migration runner in index.ts connects via DATABASE_URL as `app_user`.  
`app_user` is NOT the table owner and cannot ALTER TABLE → migrations will fail with "must be owner".  
The try/catch logs errors but doesn't crash the server.  

**Recommended fix for Stage E:** Run a pre-startup migration script as `alburhan` (the table owner)  
before starting the app, so migration DDL runs with correct privileges and v38–v41 are no-ops when app starts.

## Dry run finding

Running dry run on restore DB (restored from production backup before v37):  
Same rollback for v41-strict-rls because restore DB also lacks v37 tables.  
All other migrations passed clean on restore DB, confirming production safety.

## Rollback

Stage B backup: `/var/backups/alburhan/postgres/alburhan_db_full_20260803_132559.dump`  
Restore DB kept: `alburhan_db_restore_verify_20260803_132559`
