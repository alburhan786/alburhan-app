# Stage B — Production Backup and Restore Verification Report
**Date:** 2026-08-03  
**Auditor:** Replit Agent (Stage B)  
**Branch audited:** `feature/saas-multitenancy` (NOT deployed — read-only backup of existing production)

---

## How to complete Stage B

SSH into the Hostinger VPS and run the backup script:

```bash
# 1. Copy the script to VPS (from your local machine)
scp artifacts/api-server/scripts/stage-b-backup.sh root@<VPS-IP>:/root/stage-b-backup.sh

# 2. SSH into VPS
ssh root@<VPS-IP>

# 3. Run the script
chmod +x /root/stage-b-backup.sh
bash /root/stage-b-backup.sh 2>&1 | tee /tmp/stage-b-output.txt

# 4. Share the output with the Replit Agent
cat /tmp/stage-b-output.txt
```

The script is fully non-destructive. It:
- Runs `pg_dump` (read-only) against `alburhan_db`
- Stores the backup in `/var/backups/alburhan/postgres/` (not web root)
- Creates a temporary restore database to verify backup integrity
- Prints all results without ever displaying passwords or connection strings

---

## Pre-filled Section — Verified via HTTP from Replit

### Production Server Status

| Item | Value | Verified by |
|------|-------|-------------|
| Production domain | `https://alburhantravels.com` | HTTP |
| HTTP status | `200 OK` | `curl` |
| API health | `status: ok` | `/api/health` endpoint |
| Health timestamp | `2026-08-03T10:56:37.539Z` | `/api/health` |
| Node.js version | `v20.20.2` | `/api/health` |
| PID | `1555866` (PM2-managed) | `/api/health` |
| Web server | `nginx/1.24.0 (Ubuntu)` | HTTP response headers |
| SSL | Active (HTTPS 200) | `curl -sI https://...` |

### Known VPS Configuration (from repository)

| Item | Value | Source |
|------|-------|--------|
| VPS root | `/var/www/alburhan` | `pm2.ecosystem.config.cjs` |
| PM2 app name | `alburhan-api` | `pm2.ecosystem.config.cjs` |
| PM2 PDF app | `pdf-enterprise` | `pm2.ecosystem.config.cjs` |
| DB name | `alburhan_db` | `.env.production.example` |
| DB user | `alburhan` | `.env.production.example` |
| DB host | `localhost:5432` | `.env.production.example` |
| Backup dir | `/var/backups/alburhan/postgres/` | `stage-b-backup.sh` |
| API bundle path | `/var/www/alburhan/artifacts/api-server/dist/index.cjs` | deployment docs |

### Repository (pre-backup) State

| Item | Value |
|------|-------|
| Branch | `feature/saas-multitenancy` |
| HEAD commit | `b57c067` |
| Production branch | `master` (tagged `saas-pre-phase1` @ `15fe9da`) |
| All 317 tests | PASS (0 failures) |
| Build | Verified — `dist/index.cjs` 6.9 MB, `dist/migrations/` 9 SQL files |

---

## Section to fill in after running stage-b-backup.sh on VPS

### Step 1 — VPS Access

| Item | Value |
|------|-------|
| VPS hostname | `<fill in>` |
| Logged-in user | `<fill in>` |
| Disk used / total | `<fill in>` |
| Disk available | `<fill in>` |
| PostgreSQL client | `<fill in>` |
| PM2 alburhan-api status | `<fill in — online/stopped/errored>` |
| PM2 pdf-enterprise status | `<fill in>` |

### Step 2 — Database Identification

| Item | Value |
|------|-------|
| DB host | `localhost:5432` |
| DB name | `alburhan_db` |
| DB user | `alburhan` |
| PostgreSQL server version | `<fill in>` |
| Database size | `<fill in>` |
| Table count | `<fill in>` |

### Step 3 — Backup Created

| Item | Value |
|------|-------|
| Backup timestamp | `<fill in — YYYYMMDD_HHMMSS>` |
| Full backup path | `/var/backups/alburhan/postgres/alburhan_db_full_<timestamp>.dump` |
| Schema backup path | `/var/backups/alburhan/postgres/alburhan_db_schema_<timestamp>.sql` |
| Checksum file | `/var/backups/alburhan/postgres/alburhan_db_full_<timestamp>.sha256` |
| Full backup size | `<fill in>` |
| SHA-256 checksum | `<fill in — first 16 chars>...` |
| Backup duration | `<fill in>` |
| Backup directory permissions | `700` |
| Backup file permissions | `600` |
| Located in web root | `NO — /var/backups/ is not served by nginx` |

### Step 4 — Backup File Verification

| Check | Result |
|-------|--------|
| File exists and non-empty | `<fill in>` |
| `pg_restore --list` succeeded | `<fill in>` |
| Tables with data in backup | `<fill in>` |
| `users` table present | `<fill in>` |
| `bookings` table present | `<fill in>` |
| `packages` table present | `<fill in>` |
| `payment_transactions` present | `<fill in>` |
| `invoices` present | `<fill in>` |
| `agreements` present | `<fill in>` |
| `documents` present | `<fill in>` |
| `notification_logs` present | `<fill in>` |
| `leads` present | `<fill in>` |
| `tenants` present | `<fill in — may not exist yet in production>` |

### Step 5 — Restore Verification

| Item | Value |
|------|-------|
| Restore database name | `alburhan_db_restore_verify_<timestamp>` |
| Restore duration | `<fill in>` |
| Row count mismatches | `<fill in — 0 expected>` |
| Table count match | `<fill in>` |
| Sequence count | `<fill in>` |

#### Critical Row Count Comparison

| Table | Production count | Restored count | Match |
|-------|-----------------|---------------|-------|
| users | `<fill in>` | `<fill in>` | |
| bookings | `<fill in>` | `<fill in>` | |
| pilgrims | `<fill in>` | `<fill in>` | |
| packages | `<fill in>` | `<fill in>` | |
| payment_transactions | `<fill in>` | `<fill in>` | |
| invoices | `<fill in>` | `<fill in>` | |
| agreements | `<fill in>` | `<fill in>` | |
| documents | `<fill in>` | `<fill in>` | |
| leads | `<fill in>` | `<fill in>` | |
| notification_logs | `<fill in>` | `<fill in>` | |
| api_settings | `<fill in>` | `<fill in>` | |

### Step 6 — Application Compatibility

| Check | Result |
|-------|--------|
| Login schema readable in restored DB | `<fill in>` |
| Bookings readable | `<fill in>` |
| Invoices readable | `<fill in>` |
| Application server started against restored DB | `NO (by design — not started)` |

---

## Retention and Cleanup

| Item | Decision |
|------|---------|
| Production backup retained | YES — `/var/backups/alburhan/postgres/alburhan_db_full_<ts>.dump` |
| Restore test DB status | Retained for Stage C/D UAT (drop manually when no longer needed) |
| Cleanup command | `sudo -u postgres dropdb alburhan_db_restore_verify_<timestamp>` |

---

## Emergency Restore Commands

```bash
# Restore backup to a new database
sudo -u postgres createdb alburhan_db_rollback
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=alburhan \
  --dbname=alburhan_db_rollback \
  --no-owner \
  --no-acl \
  /var/backups/alburhan/postgres/alburhan_db_full_<timestamp>.dump

# To make this the live database, update DATABASE_URL and restart PM2:
# pm2 restart alburhan-api --update-env
```

---

## Status

```
< AWAITING VPS EXECUTION — run stage-b-backup.sh and fill in the sections above >
```

Once all sections are filled in and all row counts match:

```
PASS — STAGE B BACKUP AND RESTORE VERIFIED — AWAITING STAGE C APPROVAL
```
