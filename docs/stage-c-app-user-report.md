# Stage C — app_user Role Creation & DATABASE_URL Update Report

**Date:** 2026-08-03  
**Time:** 13:38 UTC  
**Operator:** Replit Agent (SSH)  
**Verdict:** ✅ PASS

---

## What Was Done

Stage C addressed Blocker B1 from the Stage A audit: the production database was being accessed by the `alburhan` role (which happens to own all 154 tables). While `alburhan` already had `rolbypassrls=f`, switching to a dedicated non-owner runtime role means RLS is enforced unconditionally — no reliance on `FORCE ROW LEVEL SECURITY` is needed at all.

---

## Step-by-Step Results

### Step 1 — Pre-flight
| Check | Result |
|-------|--------|
| pg_hba.conf found | `/etc/postgresql/16/main/pg_hba.conf` ✅ |
| `.env` exists with DATABASE_URL | ✅ |
| Rollback URL saved | `/root/stage-c-rollback-database-url.txt` ✅ |
| Pre-flight production health | `ok` ✅ |

### Step 2 — Role Creation
```sql
CREATE ROLE app_user
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS INHERIT;
```
| Attribute | Value | Required |
|-----------|-------|---------|
| rolsuper | false | ✅ must be false |
| rolbypassrls | false | ✅ must be false |
| rolcanlogin | true | ✅ must be true |
| rolcreatedb | false | ✅ must be false |

### Step 3 — Privileges Granted
- `GRANT CONNECT ON DATABASE alburhan_db` ✅
- `GRANT USAGE ON SCHEMA public` ✅
- `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public` → **154 tables** ✅
- `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public` ✅
- `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public` ✅
- `ALTER DEFAULT PRIVILEGES` set for future tables/sequences/functions ✅

### Step 4 — pg_hba.conf
```
# app_user — Stage C: non-superuser runtime role
host    alburhan_db    app_user    127.0.0.1/32    scram-sha-256
host    alburhan_db    app_user    ::1/128         scram-sha-256
```
- Backup saved: `/etc/postgresql/16/main/pg_hba.conf.stage-c-backup` ✅
- `pg_reload_conf()` called ✅

### Step 5 — TCP Connectivity Test
```
current_user=app_user | is_superuser=off
SELECT COUNT(*) FROM bookings → 28  ✅
```

### Step 6 — DATABASE_URL Update
- `.env` updated from `postgresql://alburhan:...@localhost:5432/alburhan_db`  
  to `postgresql://app_user:...@127.0.0.1:5432/alburhan_db`
- Duplicate `DATABASE_URL` line (pre-existing) cleaned up ✅
- Verified via Python re-read ✅

### Step 7 — PM2 Restart
```
alburhan-api  │ fork │ PID 1577429 │ online │ 0% CPU │ 192 MB
```
Restarted cleanly, picked up new DATABASE_URL ✅

### Step 8 — Post-restart Health Check
- First attempt (5s after restart): `ok` ✅
- No rollback required

### Step 9 — Final Verification
| Check | Value | Status |
|-------|-------|--------|
| DATABASE_URL user in .env | `app_user` | ✅ |
| Live DB user (direct connect test) | `app_user` | ✅ |
| is_superuser | `false` | ✅ |
| Tables owned by app_user | 0 | ✅ RLS unconditional |
| SELECT grants | 154 tables | ✅ |
| Production health | `ok` | ✅ |

---

## RLS Posture After Stage C

| Factor | Before Stage C | After Stage C |
|--------|---------------|---------------|
| App DB user | `alburhan` (table owner) | `app_user` (non-owner) |
| User is superuser | No | No |
| User has BYPASSRLS | No | No |
| User owns tables | Yes (154 tables) | No (0 tables) |
| RLS enforcement | Depends on FORCE RLS | **Unconditional** |
| FORCE ROW LEVEL SECURITY needed | Yes (for table owner) | No (non-owner) |

`app_user` is a non-owner, so PostgreSQL enforces RLS policies against it without any additional configuration. The v41 `FORCE ROW LEVEL SECURITY` setting (applied in Stage D/E migrations) adds a redundant second layer — a defence-in-depth bonus, not a requirement.

---

## Emergency Rollback

If needed, restore the original `alburhan` credentials:

```bash
# On VPS as root:
OLD=$(cat /root/stage-c-rollback-database-url.txt)
python3 -c "
import re
with open('/var/www/alburhan/.env') as f: c = f.read()
with open('/var/www/alburhan/.env', 'w') as f:
    f.write(re.sub(r'^DATABASE_URL=.*$', 'DATABASE_URL=$OLD', c, flags=re.MULTILINE))
"
# Replace $OLD with the literal URL from the file
pm2 restart alburhan-api --update-env
```

The rollback file is at `/root/stage-c-rollback-database-url.txt`.

---

## Verdict

| Check | Result |
|-------|--------|
| app_user role created with correct attributes | ✅ PASS |
| Privileges granted on all 154 tables | ✅ PASS |
| pg_hba.conf updated and reloaded | ✅ PASS |
| TCP connectivity verified | ✅ PASS |
| DATABASE_URL updated in .env | ✅ PASS |
| PM2 restarted cleanly | ✅ PASS |
| Production health check | ✅ PASS |
| app_user is non-owner → RLS unconditional | ✅ PASS |

### ✅ STAGE C — PASS

**Gate status:** Awaiting explicit approval to proceed to Stage D.

---

## What Stage D Will Do (for your review before approval)

Stage D applies the SaaS database migrations (v38–v41) to production. These are the migrations that:

- **v38** — Add `tenant_id UUID NOT NULL` column to all 62 scoped tables; seed the Al Burhan tenant row; backfill `tenant_id` on all existing rows
- **v39** — Add NOT NULL constraints and foreign keys to `tenant_id`; create `tenants` table indexes
- **v40** — Enable Row Level Security on all 62 tables with the permissive policy
- **v41** — Replace v40 policies with strict fail-closed RLS; set `FORCE ROW LEVEL SECURITY`; add `tenant_quotas` and `tenant_credentials` tables

**This is the highest-risk stage** — it adds columns and constraints to live production tables. The Stage B backup is the rollback point.

Key safeguards already in place:
- All migrations use `IF NOT EXISTS` / `DO EXCEPTION` patterns — idempotent and safe to re-run
- The v38 migration backfills all existing rows with `DEFAULT_TENANT_ID` before adding NOT NULL
- The `alburhan_db_restore_verify_*` database on the VPS can be used to dry-run the migrations first (recommended as part of Stage D)
- app_user is now ready to connect; the pool context (`app_layer`) will be set at startup

**Approval required before continuing.**
