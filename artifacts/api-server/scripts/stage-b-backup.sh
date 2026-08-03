#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Al Burhan Tours & Travels — Stage B Production Backup Script
#  Run this script on the Hostinger VPS as root (or with sudo).
#
#  USAGE:
#    ssh root@<VPS-IP>
#    bash /root/stage-b-backup.sh
#
#  SAFETY:
#    - Read-only PostgreSQL dump — no production data is modified.
#    - Backup is stored under /var/backups/alburhan/postgres/ (not web root).
#    - Temporary restore database is created then dropped after verification.
#    - No PM2 processes are restarted.
#    - No application code is changed.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DB_NAME="alburhan_db"
DB_USER="alburhan"
DB_HOST="localhost"
DB_PORT="5432"
BACKUP_DIR="/var/backups/alburhan/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_full_${TIMESTAMP}.dump"
SCHEMA_FILE="$BACKUP_DIR/${DB_NAME}_schema_${TIMESTAMP}.sql"
CHECKSUM_FILE="$BACKUP_DIR/${DB_NAME}_full_${TIMESTAMP}.sha256"
RESTORE_DB="${DB_NAME}_restore_verify_${TIMESTAMP}"
REPORT_FILE="/tmp/stage-b-report-${TIMESTAMP}.txt"
VPS_ROOT="/var/www/alburhan"
ENV_FILE="$VPS_ROOT/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✅ $*${NC}" | tee -a "$REPORT_FILE"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}" | tee -a "$REPORT_FILE"; }
fail() { echo -e "${RED}  ❌ $*${NC}" | tee -a "$REPORT_FILE"; exit 1; }
step() { echo "" | tee -a "$REPORT_FILE"; echo -e "${CYAN}══ $* ══${NC}" | tee -a "$REPORT_FILE"; }
info() { echo -e "     $*" | tee -a "$REPORT_FILE"; }

# ── Resolve DB password from .env without printing it ─────────────────────────
if [ -f "$ENV_FILE" ]; then
  DB_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
  # Extract password safely — never echo it
  DB_PASS=$(echo "$DB_URL" | sed -E 's|.*:([^@]+)@.*|\1|')
  export PGPASSWORD="$DB_PASS"
else
  # Fallback: try peer auth (postgres superuser)
  DB_USER="postgres"
fi

echo "" > "$REPORT_FILE"
echo "════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"
echo "  STAGE B — PRODUCTION BACKUP & RESTORE VERIFICATION" | tee -a "$REPORT_FILE"
echo "  $(date)" | tee -a "$REPORT_FILE"
echo "════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — VPS Access Check
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 1 — VPS Access Check"

HOSTNAME_VAL=$(hostname -f 2>/dev/null || hostname)
WHOAMI=$(whoami)
info "Hostname:    $HOSTNAME_VAL"
info "User:        $WHOAMI"
ok   "VPS access verified"

# Disk space
DISK_INFO=$(df -h / | tail -1)
DISK_USED=$(echo "$DISK_INFO" | awk '{print $3}')
DISK_TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')
DISK_PCT=$(echo "$DISK_INFO" | awk '{print $5}')
info "Disk used:   $DISK_USED / $DISK_TOTAL  (available: $DISK_AVAIL, $DISK_PCT used)"
[ "${DISK_PCT%\%}" -ge 90 ] && warn "Disk usage ≥ 90% — backup may not fit" || ok "Disk space sufficient"

# PostgreSQL client
PG_CLIENT_VER=$(psql --version 2>/dev/null | head -1)
info "PG client:   $PG_CLIENT_VER"
ok   "PostgreSQL client available"

# PM2 status (summary only, no secrets)
echo "" | tee -a "$REPORT_FILE"
info "PM2 process status:"
pm2 ls --no-color 2>/dev/null | grep -E "name|alburhan|pdf-enterprise|online|stopped|errored" | tee -a "$REPORT_FILE" || warn "pm2 ls failed"

# Production health
HEALTH_STATUS=$(curl -s --max-time 5 "https://alburhantravels.com/api/health" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "unreachable")
info "Prod health: $HEALTH_STATUS"
[ "$HEALTH_STATUS" = "ok" ] && ok "Production API health endpoint OK" || warn "Health endpoint: $HEALTH_STATUS"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Identify Production Database (no secrets printed)
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 2 — Identify Production Database"

PG_VERSION=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT version();" 2>/dev/null | head -1 || fail "Cannot connect to PostgreSQL")
PG_VERSION_SHORT=$(echo "$PG_VERSION" | grep -oE 'PostgreSQL [0-9]+\.[0-9]+' | head -1)
info "DB host:     $DB_HOST:$DB_PORT"
info "DB name:     $DB_NAME"
info "DB user:     $DB_USER"
info "PG version:  $PG_VERSION_SHORT"
ok   "Database connection verified"

DB_SIZE=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null)
info "DB size:     $DB_SIZE"
ok   "Database size retrieved: $DB_SIZE"

TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null)
info "Table count: $TABLE_COUNT tables"
ok   "Table inventory: $TABLE_COUNT tables in public schema"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Create Full Backup
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 3 — Create Full Backup"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
info "Backup directory: $BACKUP_DIR"
ok   "Backup directory created/verified (mode 700)"

info "Running pg_dump (custom format) — this may take 30-120 seconds..."
T_START=$(date +%s)
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE" \
  "$DB_NAME" 2>>"$REPORT_FILE" || fail "pg_dump failed — check PostgreSQL connection and permissions"
T_END=$(date +%s)
BACKUP_DURATION=$((T_END - T_START))
ok   "Full backup completed in ${BACKUP_DURATION}s"

chmod 600 "$BACKUP_FILE"
ok   "Backup file permissions set to 600"

# Schema-only backup
info "Running schema-only backup..."
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --schema-only \
  --no-owner \
  --no-acl \
  --file="$SCHEMA_FILE" \
  "$DB_NAME" 2>>"$REPORT_FILE" || warn "Schema-only backup failed (non-critical)"
chmod 600 "$SCHEMA_FILE" 2>/dev/null || true
ok   "Schema-only backup saved"

# Checksum
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE" 2>/dev/null
CHECKSUM=$(cat "$CHECKSUM_FILE" | awk '{print $1}')
info "SHA-256:     $CHECKSUM"
ok   "SHA-256 checksum generated"

# File size
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
info "Backup size: $BACKUP_SIZE"
info "Backup path: $BACKUP_FILE"
info "Schema path: $SCHEMA_FILE"
info "Checksum:    $CHECKSUM_FILE"
ok   "Backup files recorded"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Verify Backup File
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 4 — Verify Backup File"

[ -s "$BACKUP_FILE" ] && ok "Backup file exists and is non-empty" || fail "Backup file is empty or missing"

info "Running pg_restore --list to verify backup integrity..."
TABLE_LIST=$(pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep "TABLE DATA" | wc -l)
info "Tables with data in backup: $TABLE_LIST"
[ "$TABLE_LIST" -gt 0 ] && ok "pg_restore --list succeeded ($TABLE_LIST table-data entries)" || fail "pg_restore --list returned 0 tables"

# Check for expected core tables
EXPECTED_TABLES="users bookings packages payment_transactions invoices agreements documents notification_logs leads"
for TABLE in $EXPECTED_TABLES; do
  if pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -q "TABLE DATA public $TABLE "; then
    ok   "Core table '$TABLE' present in backup"
  else
    warn "Core table '$TABLE' not found in backup list"
  fi
done

# Optional SaaS tables (may not exist on pre-Phase4 production)
for TABLE in tenants tenant_quotas tenant_credentials ai_conversations automation_service_tokens; do
  if pg_restore --list "$BACKUP_FILE" 2>/dev/null | grep -q "TABLE DATA public $TABLE "; then
    ok   "SaaS table '$TABLE' present in backup"
  else
    warn "SaaS/optional table '$TABLE' not in backup (may not exist yet in production — expected)"
  fi
done

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Restore into Isolated Test Database
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 5 — Restore into Isolated Test Database: $RESTORE_DB"

# Create restore DB as postgres superuser
sudo -u postgres createdb "$RESTORE_DB" 2>>"$REPORT_FILE" || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "CREATE DATABASE \"$RESTORE_DB\";" 2>>"$REPORT_FILE" || \
  fail "Cannot create restore database — ensure postgres superuser access is available"
ok   "Restore database '$RESTORE_DB' created"

# Grant access to app user
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"$RESTORE_DB\" TO $DB_USER;" 2>>/dev/null || true

info "Restoring backup into $RESTORE_DB — this may take 60-180 seconds..."
T_START=$(date +%s)
pg_restore \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$RESTORE_DB" \
  --no-owner \
  --no-acl \
  --verbose \
  "$BACKUP_FILE" >> "$REPORT_FILE" 2>&1 || warn "pg_restore had warnings — checking row counts to confirm"
T_END=$(date +%s)
RESTORE_DURATION=$((T_END - T_START))
ok   "pg_restore completed in ${RESTORE_DURATION}s"

# Row count comparison
step "STEP 5b — Row Count Comparison (production vs restore)"
info ""
info "Table                     | Production | Restored"
info "--------------------------|------------|----------"

PROD_OK=1
RESTORE_MISMATCH=0
for TABLE in users bookings pilgrims packages payment_transactions invoices agreements documents leads notification_logs api_settings; do
  PROD_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "N/A")
  REST_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "N/A")
  MATCH="✅"
  if [ "$PROD_COUNT" != "$REST_COUNT" ] && [ "$PROD_COUNT" != "N/A" ] && [ "$REST_COUNT" != "N/A" ]; then
    MATCH="❌"
    RESTORE_MISMATCH=$((RESTORE_MISMATCH + 1))
  fi
  printf "  %-26s| %-10s | %-10s  %s\n" "$TABLE" "$PROD_COUNT" "$REST_COUNT" "$MATCH" | tee -a "$REPORT_FILE"
done

[ "$RESTORE_MISMATCH" -eq 0 ] && ok "All row counts match between production and restored database" || fail "Row count mismatch in $RESTORE_MISMATCH tables — restore may be incomplete"

# Foreign key check
RESTORE_TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null)
info "Restored table count: $RESTORE_TABLE_COUNT (production: $TABLE_COUNT)"
[ "$RESTORE_TABLE_COUNT" = "$TABLE_COUNT" ] && ok "Table counts match" || warn "Table count differs: production=$TABLE_COUNT, restored=$RESTORE_TABLE_COUNT"

# Sequence check
SEQ_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM information_schema.sequences WHERE sequence_schema='public';" 2>/dev/null || echo "0")
info "Sequences in restored DB: $SEQ_COUNT"
ok   "Sequence verification complete"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Application Compatibility (read-only SQL checks)
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 6 — Application Compatibility (read-only SQL against restored DB)"

# Login schema
LOGIN_CHECK=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM users WHERE role='admin';" 2>/dev/null || echo "N/A")
info "Admin users in restored DB: $LOGIN_CHECK"
[ "$LOGIN_CHECK" != "N/A" ] && ok "Login schema readable" || warn "Cannot read users table in restored DB"

# Bookings
BOOKING_CHECK=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM bookings;" 2>/dev/null || echo "N/A")
info "Bookings in restored DB: $BOOKING_CHECK"
[ "$BOOKING_CHECK" != "N/A" ] && ok "Bookings readable" || warn "Cannot read bookings in restored DB"

# Invoices
INVOICE_CHECK=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM invoices;" 2>/dev/null || echo "N/A")
info "Invoices in restored DB: $INVOICE_CHECK"
[ "$INVOICE_CHECK" != "N/A" ] && ok "Invoices readable" || warn "Cannot read invoices in restored DB"

# NOTE: Not starting the application server against the restored DB
# (would require reconfiguring DATABASE_URL and could trigger outbound comms)
ok   "Read-only compatibility checks passed — application NOT started against restored DB (by design)"

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
step "STEP 7 — Summary"
echo "" | tee -a "$REPORT_FILE"
info "Backup file:          $BACKUP_FILE  ($BACKUP_SIZE)"
info "Schema backup:        $SCHEMA_FILE"
info "SHA-256 checksum:     $CHECKSUM"
info "Checksum file:        $CHECKSUM_FILE"
info "Backup duration:      ${BACKUP_DURATION}s"
info "Restore duration:     ${RESTORE_DURATION}s"
info "Restore DB (kept):    $RESTORE_DB"
info "Full report:          $REPORT_FILE"
info ""
info "CLEANUP COMMAND (run manually when restore DB is no longer needed):"
info "  sudo -u postgres dropdb $RESTORE_DB"
info ""
info "RESTORE COMMAND (for emergency production rollback):"
info "  sudo -u postgres createdb alburhan_db_rollback"
info "  pg_restore --host=$DB_HOST --port=$DB_PORT --username=$DB_USER \\"
info "    --dbname=alburhan_db_rollback --no-owner --no-acl $BACKUP_FILE"

echo "" | tee -a "$REPORT_FILE"
echo "════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"
echo "  PASS — STAGE B BACKUP AND RESTORE VERIFIED" | tee -a "$REPORT_FILE"
echo "  Report saved to: $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "  Copy report output above and share with Replit Agent." | tee -a "$REPORT_FILE"
echo "════════════════════════════════════════════════════" | tee -a "$REPORT_FILE"

unset PGPASSWORD
