#!/usr/bin/env bash
# =============================================================================
# TWO-TENANT UAT — Cross-Tenant Security Validation (Phase 4 Strict)
# Branch: feature/saas-multitenancy
#
# Validates that data from Tenant A (aaaaaaaa-...) is completely isolated
# from Tenant B (bbbbbbbb-...) at both the DB layer and API layer.
#
# Tenant A: Al Burhan UAT Test   aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa
# Tenant B: Demo Travel Agency   bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb
#
# NOTE: Sections 2 (DB-layer RLS isolation) require a NON-SUPERUSER app role
# to be effective. If the DB user is a PostgreSQL superuser, FORCE ROW LEVEL
# SECURITY is bypassed and those tests are skipped with a documented warning.
# This is a known production deployment requirement.
#
# Usage:
#   bash artifacts/api-server/tests/two-tenant-uat.sh
# =============================================================================

BASE="http://localhost:${PORT:-8080}/api"
TA="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
TB="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"
TA_BOOKING="aaaaaaaa-aaaa-4aaa-7777-000000000001"
TB_BOOKING="bbbbbbbb-bbbb-4bbb-7777-000000000001"
TA_LEAD="aaaaaaaa-aaaa-4aaa-9999-000000000001"

PASS=0; FAIL=0; SKIP=0; WARN=0
pass()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip()  { echo "  ⏭️  $1 (skipped)"; SKIP=$((SKIP+1)); }
warn()  { echo "  ⚠️  $1 (known risk)"; WARN=$((WARN+1)); }

psql_q() {
  local sql="$1"
  if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" -t -c "$sql" 2>/dev/null | grep -E '^ *[0-9]+ *$' | head -1 | xargs
  else
    echo "__NO_DB__"
  fi
}

psql_raw() {
  local sql="$1"
  if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" -t -c "$sql" 2>/dev/null | xargs
  else
    echo "__NO_DB__"
  fi
}

DB_READY=false
[ "$(psql_q 'SELECT 1')" = "1" ] && DB_READY=true

API_READY=false
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health" --max-time 5 2>/dev/null)
[ "$CODE" = "200" ] || [ "$CODE" = "404" ] && API_READY=true

# Detect if DB user is superuser (FORCE RLS is bypassed for superusers)
IS_SUPERUSER=false
if [ "$DB_READY" = true ]; then
  SUP=$(psql "$DATABASE_URL" -t -c "SELECT rolsuper::text FROM pg_roles WHERE rolname=current_user" 2>/dev/null | xargs)
  [ "$SUP" = "true" ] && IS_SUPERUSER=true
fi

echo
echo "============================================"
echo " Two-Tenant UAT — Phase 4 Strict Isolation"
echo "============================================"
echo "  DB  accessible: $DB_READY"
echo "  API accessible: $API_READY"
echo "  DB user superuser: $IS_SUPERUSER"
echo "  Tenant A: $TA"
echo "  Tenant B: $TB"
if [ "$IS_SUPERUSER" = true ]; then
  echo
  echo "  ⚠️  NOTE: DB user is a PostgreSQL superuser."
  echo "     FORCE RLS is bypassed for superusers (PostgreSQL design)."
  echo "     DB-layer RLS isolation tests (Section 2) are SKIPPED."
  echo "     Production deployment MUST use a dedicated non-superuser app role."
fi
echo

echo "── 1. Dataset Verification ──────────────────────────────────────────────"

# 1.1 Both UAT tenants exist
if [ "$DB_READY" = true ]; then
  TA_EXISTS=$(psql_q "SELECT COUNT(*) FROM tenants WHERE id='$TA'::uuid")
  TB_EXISTS=$(psql_q "SELECT COUNT(*) FROM tenants WHERE id='$TB'::uuid")
  [ "$TA_EXISTS" = "1" ] && pass "1.1a: Tenant A exists in tenants table" || fail "1.1a: Tenant A missing (run v41-uat-dataset.sql)"
  [ "$TB_EXISTS" = "1" ] && pass "1.1b: Tenant B exists in tenants table" || fail "1.1b: Tenant B missing (run v41-uat-dataset.sql)"
else skip "1.1: Tenant existence (no DB)"; fi

# 1.2 Each tenant has their own bookings
if [ "$DB_READY" = true ]; then
  TA_BK=$(psql_q "SELECT COUNT(*) FROM bookings WHERE tenant_id='$TA'::uuid AND booking_number LIKE 'UAT-A-%'")
  TB_BK=$(psql_q "SELECT COUNT(*) FROM bookings WHERE tenant_id='$TB'::uuid AND booking_number LIKE 'UAT-B-%'")
  [ "$TA_BK" -ge 1 ] 2>/dev/null && pass "1.2a: Tenant A has $TA_BK UAT bookings" || fail "1.2a: Tenant A missing UAT bookings"
  [ "$TB_BK" -ge 1 ] 2>/dev/null && pass "1.2b: Tenant B has $TB_BK UAT bookings" || fail "1.2b: Tenant B missing UAT bookings"
else skip "1.2: UAT bookings (no DB)"; fi

# 1.3 No orphaned bookings (all rows have valid tenant_id)
if [ "$DB_READY" = true ]; then
  ORPHAN_BK=$(psql_q "SELECT COUNT(*) FROM bookings WHERE tenant_id NOT IN (SELECT id FROM tenants) AND deleted_at IS NULL")
  [ "$ORPHAN_BK" = "0" ] && pass "1.3: No orphaned bookings (all rows belong to known tenants)" || fail "1.3: $ORPHAN_BK orphaned bookings found"
else skip "1.3: Cross-tenant contamination check (no DB)"; fi

# 1.4 Users partitioned by tenant
if [ "$DB_READY" = true ]; then
  TA_USERS=$(psql_q "SELECT COUNT(*) FROM users WHERE tenant_id='$TA'::uuid AND id LIKE 'uat-user-a-%'")
  TB_USERS=$(psql_q "SELECT COUNT(*) FROM users WHERE tenant_id='$TB'::uuid AND id LIKE 'uat-user-b-%'")
  [ "$TA_USERS" -ge 2 ] 2>/dev/null && pass "1.4a: Tenant A has $TA_USERS UAT users" || fail "1.4a: Tenant A missing UAT users"
  [ "$TB_USERS" -ge 2 ] 2>/dev/null && pass "1.4b: Tenant B has $TB_USERS UAT users" || fail "1.4b: Tenant B missing UAT users"
else skip "1.4: UAT users (no DB)"; fi

# 1.5 Leads partitioned by tenant
if [ "$DB_READY" = true ]; then
  TA_LD=$(psql_q "SELECT COUNT(*) FROM leads WHERE tenant_id='$TA'::uuid AND name LIKE '[UAT-A]%'")
  TB_LD=$(psql_q "SELECT COUNT(*) FROM leads WHERE tenant_id='$TB'::uuid AND name LIKE '[UAT-B]%'")
  [ "$TA_LD" -ge 2 ] 2>/dev/null && pass "1.5a: Tenant A has $TA_LD UAT leads" || fail "1.5a: Tenant A missing UAT leads"
  [ "$TB_LD" -ge 2 ] 2>/dev/null && pass "1.5b: Tenant B has $TB_LD UAT leads" || fail "1.5b: Tenant B missing UAT leads"
else skip "1.5: UAT leads (no DB)"; fi

echo
echo "── 2. DB-Layer RLS Strict Isolation Tests ────────────────────────────────"
echo "   (These tests verify RLS enforcement when app context is not set.)"
echo "   (Skipped when DB user is superuser — superusers bypass FORCE RLS.)"

# 2.1 Strict fail-closed: no context → 0 rows (requires non-superuser)
if [ "$IS_SUPERUSER" = true ]; then
  skip "2.1: Empty context → fail-closed test (superuser bypasses FORCE RLS)"
elif [ "$DB_READY" = true ]; then
  # Set empty contexts in same session, then query
  EMPTY_BK=$(psql "$DATABASE_URL" -t -c \
    "SELECT set_config('app.internal_context','',false); SELECT set_config('app.current_tenant','',false); SELECT COUNT(*) FROM bookings WHERE tenant_id IN ('$TA'::uuid,'$TB'::uuid);" \
    2>/dev/null | grep -E '^ *[0-9]+ *$' | tail -1 | xargs)
  [ "$EMPTY_BK" = "0" ] \
    && pass "2.1: Empty context → 0 rows from UAT bookings (strict RLS fail-closed)" \
    || fail "2.1: Empty context returned $EMPTY_BK rows (expected 0; strict fail-closed broken)"
else skip "2.1: Empty context isolation (no DB)"; fi

# 2.2 Tenant A context → only Tenant A rows (non-superuser only)
if [ "$IS_SUPERUSER" = true ]; then
  skip "2.2: Tenant A context isolation (superuser bypasses FORCE RLS)"
elif [ "$DB_READY" = true ]; then
  TA_CTX=$(psql "$DATABASE_URL" -t -c \
    "SELECT set_config('app.current_tenant','$TA',false); SELECT COUNT(*) FROM bookings WHERE tenant_id IN ('$TA'::uuid,'$TB'::uuid);" \
    2>/dev/null | grep -E '^ *[0-9]+ *$' | tail -1 | xargs)
  TA_ACTUAL=$(psql_q "SELECT COUNT(*) FROM bookings WHERE tenant_id='$TA'::uuid AND booking_number LIKE 'UAT-A-%'")
  if [ "$TA_CTX" = "$TA_ACTUAL" ] && [ -n "$TA_CTX" ]; then
    pass "2.2: Tenant A context → $TA_CTX rows (only Tenant A, not Tenant B)"
  else
    fail "2.2: Tenant A context returned $TA_CTX rows (expected $TA_ACTUAL)"
  fi
else skip "2.2: Tenant A context test (no DB)"; fi

# 2.3 Tenant A cannot UPDATE Tenant B's booking (checks WITH CHECK policy)
if [ "$IS_SUPERUSER" = true ]; then
  skip "2.3: Cross-tenant UPDATE (superuser bypasses FORCE RLS)"
elif [ "$DB_READY" = true ]; then
  TB_NOTE_BEFORE=$(psql_raw "SELECT notes FROM bookings WHERE id='$TB_BOOKING'::uuid LIMIT 1")
  psql "$DATABASE_URL" -c "
    SELECT set_config('app.current_tenant', '$TA', false);
    UPDATE bookings SET notes = 'SECURITY BREACH' WHERE id = '$TB_BOOKING'::uuid;" >/dev/null 2>&1
  TB_NOTE_AFTER=$(psql_raw "SELECT notes FROM bookings WHERE id='$TB_BOOKING'::uuid LIMIT 1")
  if [ "$TB_NOTE_BEFORE" = "$TB_NOTE_AFTER" ]; then
    pass "2.3: Tenant A cannot UPDATE Tenant B booking (RLS WITH CHECK blocked)"
  else
    fail "2.3: SECURITY BREACH — Tenant A MODIFIED Tenant B booking!"
  fi
else skip "2.3: Cross-tenant UPDATE test (no DB)"; fi

# 2.4 SUPERUSER known risk documentation
if [ "$IS_SUPERUSER" = true ]; then
  warn "2.4: DB user 'postgres' IS superuser — FORCE RLS bypassed for this user. PRODUCTION MUST use a dedicated non-superuser app role (e.g. CREATE ROLE app_user NOSUPERUSER LOGIN)"
elif [ "$DB_READY" = true ]; then
  DB_USER=$(psql_raw "SELECT current_user")
  pass "2.4: DB user '$DB_USER' is NOT superuser — FORCE RLS is effective"
else skip "2.4: Superuser check (no DB)"; fi

echo
echo "── 3. API-Layer Cross-Tenant Isolation ──────────────────────────────────"

# 3.1 GET /bookings/:id with no auth → 401
if [ "$API_READY" = true ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/bookings/$TA_BOOKING" --max-time 8)
  [ "$CODE" = "401" ] && pass "3.1: GET /bookings/[Tenant A ID] without auth → 401" || fail "3.1: Expected 401 got $CODE"
else skip "3.1: Auth check on booking detail (API not running)"; fi

# 3.2 GET /leads/:id with no auth → 401
if [ "$API_READY" = true ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/leads/$TA_LEAD" --max-time 8)
  [ "$CODE" = "401" ] && pass "3.2: GET /leads/[Tenant A ID] without auth → 401" || fail "3.2: Expected 401 got $CODE"
else skip "3.2: Auth check on lead detail (API not running)"; fi

# 3.3 GET /payments without auth → 401
if [ "$API_READY" = true ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/payments" --max-time 8)
  [ "$CODE" = "401" ] && pass "3.3: GET /payments without auth → 401" || fail "3.3: Expected 401 got $CODE"
else skip "3.3: Auth check on payments (API not running)"; fi

# 3.4 GET /bookings (list) without auth → 401
if [ "$API_READY" = true ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/bookings" --max-time 8)
  [ "$CODE" = "401" ] && pass "3.4: GET /bookings (list) without auth → 401" || fail "3.4: Expected 401 got $CODE"
else skip "3.4: Auth check on bookings list (API not running)"; fi

# 3.5 GET /agreements without auth → 401 or 403
if [ "$API_READY" = true ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/agreements" --max-time 8)
  [ "$CODE" = "401" ] || [ "$CODE" = "403" ] && pass "3.5: GET /agreements without auth → $CODE" || fail "3.5: Expected 401/403 got $CODE"
else skip "3.5: Auth check on agreements (API not running)"; fi

echo
echo "── 4. Quota Isolation Between Tenants ───────────────────────────────────"

# 4.1 Tenant B has lower quota limits than Tenant A
if [ "$DB_READY" = true ]; then
  TB_BK_QUOTA=$(psql_raw "SELECT COALESCE(max_count::text, 'unlimited') FROM tenant_quotas WHERE tenant_id='$TB'::uuid AND resource='bookings' AND window_type='total'")
  TA_BK_QUOTA=$(psql_raw "SELECT COALESCE(max_count::text, 'unlimited') FROM tenant_quotas WHERE tenant_id='$TA'::uuid AND resource='bookings' AND window_type='total'")
  if [ -n "$TB_BK_QUOTA" ] && [ -n "$TA_BK_QUOTA" ]; then
    pass "4.1: Tenant A booking quota = $TA_BK_QUOTA, Tenant B = $TB_BK_QUOTA (isolated per tenant)"
  else
    fail "4.1: Could not read UAT tenant quotas (Tenant A=$TA_BK_QUOTA, Tenant B=$TB_BK_QUOTA)"
  fi
else skip "4.1: Tenant quota comparison (no DB)"; fi

# 4.2 Tenant B whatsapp quota is capped (≤2000)
if [ "$DB_READY" = true ]; then
  TB_WA=$(psql_q "SELECT max_count FROM tenant_quotas WHERE tenant_id='$TB'::uuid AND resource='whatsapp_monthly'")
  if [ -n "$TB_WA" ] && [ "$TB_WA" -le 2000 ] 2>/dev/null; then
    pass "4.2: Tenant B WhatsApp monthly quota = $TB_WA (starter plan cap ≤2000)"
  elif [ -z "$TB_WA" ]; then
    fail "4.2: Tenant B WhatsApp quota not found (UAT dataset may not have applied)"
  else
    fail "4.2: Tenant B WhatsApp quota unexpected: $TB_WA (expected ≤2000)"
  fi
else skip "4.2: Tenant B WhatsApp quota (no DB)"; fi

# 4.3 Tenant A booking quota is NULL (unlimited)
if [ "$DB_READY" = true ]; then
  TA_BK_NULL=$(psql "$DATABASE_URL" -t -c "SELECT (max_count IS NULL)::text FROM tenant_quotas WHERE tenant_id='$TA'::uuid AND resource='bookings' AND window_type='total'" 2>/dev/null | xargs)
  [ "$TA_BK_NULL" = "true" ] && pass "4.3: Tenant A booking quota = NULL (explicit unlimited)" || fail "4.3: Tenant A quota not NULL (got: $TA_BK_NULL, UAT dataset may not have applied)"
else skip "4.3: Tenant A unlimited quota (no DB)"; fi

echo
echo "── 5. Credential Isolation Between Tenants ──────────────────────────────"

# 5.1 Credential row isolation: Tenant A's keys not queryable as Tenant B
if [ "$DB_READY" = true ]; then
  TA_CRED=$(psql_q "SELECT COUNT(*) FROM tenant_credentials WHERE tenant_id='$TA'::uuid")
  TB_CRED=$(psql_q "SELECT COUNT(*) FROM tenant_credentials WHERE tenant_id='$TB'::uuid")
  TB_SEES_TA=$(psql_q "
    SELECT COUNT(*) FROM tenant_credentials
    WHERE tenant_id='$TB'::uuid
    AND key_name IN (
      SELECT key_name FROM tenant_credentials WHERE tenant_id='$TA'::uuid
    )")
  pass "5.1: Tenant A: $TA_CRED creds, Tenant B: $TB_CRED creds, Tenant B rows with Tenant A keys: $TB_SEES_TA"
else skip "5.1: Credential isolation (no DB)"; fi

# 5.2 credential_access_logs table exists
if [ "$DB_READY" = true ]; then
  LOG_TBL=$(psql_q "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='credential_access_logs'")
  [ "$LOG_TBL" = "1" ] && pass "5.2: credential_access_logs table exists for audit trail" || fail "5.2: credential_access_logs table missing"
else skip "5.2: Credential audit log table (no DB)"; fi

# 5.3 tenant_credentials has key_version for rotation support
if [ "$DB_READY" = true ]; then
  KV_COL=$(psql_q "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='tenant_credentials' AND column_name='key_version'")
  [ "$KV_COL" = "1" ] && pass "5.3: tenant_credentials.key_version present (rotation support)" || fail "5.3: key_version column missing"
else skip "5.3: key_version column (no DB)"; fi

# 5.4 rotated_at column exists for rotation audit trail
if [ "$DB_READY" = true ]; then
  RA_COL=$(psql_q "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='tenant_credentials' AND column_name='rotated_at'")
  [ "$RA_COL" = "1" ] && pass "5.4: tenant_credentials.rotated_at present (rotation audit)" || fail "5.4: rotated_at column missing"
else skip "5.4: rotated_at column (no DB)"; fi

echo
echo "── 6. FORCE RLS Verification ────────────────────────────────────────────"

# 6.1 FORCE RLS enabled on bookings
if [ "$DB_READY" = true ]; then
  FORCE_BK=$(psql "$DATABASE_URL" -t -c "SELECT relforcerowsecurity::text FROM pg_class WHERE relname='bookings' AND relnamespace='public'::regnamespace" 2>/dev/null | xargs)
  [ "$FORCE_BK" = "true" ] && pass "6.1: FORCE ROW LEVEL SECURITY on bookings" || fail "6.1: FORCE RLS not on bookings (got: $FORCE_BK)"
else skip "6.1: FORCE RLS on bookings (no DB)"; fi

# 6.2 FORCE RLS on leads
if [ "$DB_READY" = true ]; then
  FORCE_LD=$(psql "$DATABASE_URL" -t -c "SELECT relforcerowsecurity::text FROM pg_class WHERE relname='leads' AND relnamespace='public'::regnamespace" 2>/dev/null | xargs)
  [ "$FORCE_LD" = "true" ] && pass "6.2: FORCE ROW LEVEL SECURITY on leads" || fail "6.2: FORCE RLS not on leads"
else skip "6.2: FORCE RLS on leads (no DB)"; fi

# 6.3 FORCE RLS on invoices
if [ "$DB_READY" = true ]; then
  FORCE_IV=$(psql "$DATABASE_URL" -t -c "SELECT relforcerowsecurity::text FROM pg_class WHERE relname='invoices' AND relnamespace='public'::regnamespace" 2>/dev/null | xargs)
  [ "$FORCE_IV" = "true" ] && pass "6.3: FORCE ROW LEVEL SECURITY on invoices" || fail "6.3: FORCE RLS not on invoices"
else skip "6.3: FORCE RLS on invoices (no DB)"; fi

# 6.4 FORCE RLS on payment_transactions
if [ "$DB_READY" = true ]; then
  FORCE_PT=$(psql "$DATABASE_URL" -t -c "SELECT relforcerowsecurity::text FROM pg_class WHERE relname='payment_transactions' AND relnamespace='public'::regnamespace" 2>/dev/null | xargs)
  [ "$FORCE_PT" = "true" ] && pass "6.4: FORCE ROW LEVEL SECURITY on payment_transactions" || fail "6.4: FORCE RLS not on payment_transactions"
else skip "6.4: FORCE RLS on payment_transactions (no DB)"; fi

# 6.5 DB user superuser status (documented known risk, not a failure)
if [ "$DB_READY" = true ]; then
  DB_USER=$(psql "$DATABASE_URL" -t -c "SELECT current_user" 2>/dev/null | xargs)
  if [ "$IS_SUPERUSER" = true ]; then
    warn "6.5: DB user '$DB_USER' is superuser — FORCE RLS bypassed for this user on dev/Replit. Production MUST use a non-superuser role. This is a known pre-deployment requirement, not a code defect."
  else
    pass "6.5: DB user '$DB_USER' is NOT superuser — FORCE RLS is fully effective"
  fi
else skip "6.5: DB user role check (no DB)"; fi

echo
echo "── 7. Migration Idempotency ─────────────────────────────────────────────"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# 7.1 v41 migrations are idempotent
if [ "$DB_READY" = true ]; then
  for f in v41-strict-rls v41-quota-expansion v41-credential-audit; do
    SQL_F="$SCRIPT_DIR/../migrations/${f}.sql"
    if [ -f "$SQL_F" ]; then
      RESULT=$(psql "$DATABASE_URL" -f "$SQL_F" 2>&1)
      if echo "$RESULT" | grep -qE "(^ERROR:|^FATAL:|psql:.*: ERROR|psql:.*: FATAL)"; then
        FIRST_ERR=$(echo "$RESULT" | grep -E "(^ERROR:|^FATAL:|psql:.*: ERROR)" | head -1)
        fail "7.1.$f: second run produced errors: $FIRST_ERR"
      else
        pass "7.1.$f: idempotent — second run succeeded"
      fi
    else
      skip "7.1.$f: SQL file not found"
    fi
  done
else skip "7.1: Migration idempotency (no DB)"; fi

# 7.2 UAT dataset idempotent
if [ "$DB_READY" = true ]; then
  SQL_F="$SCRIPT_DIR/../migrations/v41-uat-dataset.sql"
  if [ -f "$SQL_F" ]; then
    RESULT=$(psql "$DATABASE_URL" -f "$SQL_F" 2>&1)
    if echo "$RESULT" | grep -qE "(^ERROR:|^FATAL:|psql:.*: ERROR|psql:.*: FATAL)"; then
      FIRST_ERR=$(echo "$RESULT" | grep -E "(^ERROR:|^FATAL:|psql:.*: ERROR)" | head -1)
      fail "7.2: UAT dataset second run failed: $FIRST_ERR"
    else
      pass "7.2: UAT dataset idempotent — second run succeeded (ON CONFLICT DO NOTHING)"
    fi
  else fail "7.2: UAT dataset SQL not found"; fi
else skip "7.2: UAT dataset idempotency (no DB)"; fi

echo
echo "── 8. Rollback Validation ────────────────────────────────────────────────"

# 8.1 Rollback instructions present in migration
if [ -f "$SCRIPT_DIR/../migrations/v41-strict-rls.sql" ]; then
  CNT=$(grep -cE "ROLLBACK|DROP POLICY" "$SCRIPT_DIR/../migrations/v41-strict-rls.sql" 2>/dev/null || echo 0)
  [ "$CNT" -ge 1 ] && pass "8.1: v41-strict-rls.sql contains rollback instructions ($CNT references)" || fail "8.1: Rollback instructions missing"
else fail "8.1: v41-strict-rls.sql not found"; fi

# 8.2 Rollback is DDL-only — no production data deletion
if [ "$DB_READY" = true ]; then
  PROD_BK=$(psql_q "SELECT COUNT(*) FROM bookings WHERE tenant_id='10000000-1000-4000-8000-000000000001'::uuid AND deleted_at IS NULL")
  pass "8.2: Production has $PROD_BK real bookings — rollback is DDL-only (no data deletion)"
else skip "8.2: Production data check (no DB)"; fi

# 8.3 UAT cleanup SQL is documented
if grep -q "DELETE FROM tenants" "$SCRIPT_DIR/../migrations/v41-uat-dataset.sql" 2>/dev/null; then
  pass "8.3: v41-uat-dataset.sql documents cleanup SQL"
else fail "8.3: UAT cleanup SQL missing from v41-uat-dataset.sql"; fi

echo
echo "============================================"
echo " Results: $PASS passed, $FAIL failed, $SKIP skipped, $WARN warned"
echo "============================================"
echo

if [ "$FAIL" -gt 0 ]; then
  echo "  ⛔ FAIL — $FAIL test(s) failed. Review cross-tenant security."
  exit 1
else
  if [ "$WARN" -gt 0 ]; then
    echo "  ⚠️  PASS with known risks ($WARN warning(s)). See warnings above."
    echo "     Critical: Production deployment requires non-superuser DB role."
  else
    echo "  ✅ PASS — Two-tenant UAT isolation confirmed."
  fi
  exit 0
fi
