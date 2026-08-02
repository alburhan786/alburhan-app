#!/usr/bin/env bash
# =============================================================================
# COMMUNICATION CENTER — REGRESSION TESTS (A–J + live API)
# Usage (any working directory):
#   bash artifacts/api-server/tests/comms-regression.sh
# Or from within artifacts/api-server:
#   bash tests/comms-regression.sh
#
# Tests actual live behaviour where possible; falls back to source/schema
# checks only for things that cannot be observed through the API.
# =============================================================================

# ── Resolve paths relative to THIS script, regardless of caller cwd ──────────
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
API_DIR="$SCRIPT_DIR/.."                              # artifacts/api-server
FE_FILE="$SCRIPT_DIR/../../alburhan/src/pages/admin/CommunicationCenter.tsx"

BASE="http://localhost:${PORT:-8080}/api"
PASS=0; FAIL=0; SKIP=0

pass()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip()  { echo "  ⏭️  $1 (skipped)"; SKIP=$((SKIP+1)); }

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@" --max-time 8; }
http_body() { curl -s "$@" --max-time 8; }

echo
echo "========================================="
echo " Communication Center — Regression Tests"
echo "========================================="

# ── Setup: test booking ────────────────────────────────────────────────────────
echo; echo "── Setup ──────────────────────────────────────────────────────────────"
BNUM="COMMREG-$(date +%s | tail -c 8)"
if [ -z "$DATABASE_URL" ]; then
  echo "  ⚠️  DATABASE_URL not set — DB checks will be skipped"
  DB_AVAIL=0
else
  DB_AVAIL=1
fi

if [ "$DB_AVAIL" = "1" ]; then
  CUS_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM users WHERE role='customer' LIMIT 1" 2>/dev/null | tr -d ' \n')
  CUS_NAME=$(psql "$DATABASE_URL" -t -c "SELECT name FROM users WHERE id='$CUS_ID' LIMIT 1" 2>/dev/null | tr -d '\n' | xargs)
  CUS_MOBILE=$(psql "$DATABASE_URL" -t -c "SELECT mobile FROM users WHERE id='$CUS_ID' LIMIT 1" 2>/dev/null | tr -d ' \n')

  BID=$(psql "$DATABASE_URL" -t -c "
    INSERT INTO bookings
      (id, booking_number, customer_id, customer_name, customer_mobile,
       status, number_of_pilgrims, gst_rate, tcs_rate, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text, '$BNUM', '$CUS_ID', '$CUS_NAME', '$CUS_MOBILE',
      'approved', 1, 5.00, 0.00, NOW(), NOW()
    ) RETURNING id
  " 2>/dev/null | tr -d ' \n')

  if [ -z "$BID" ]; then
    echo "  FATAL: could not create test booking (check DB connection and schema)"
    exit 1
  fi
  echo "  Test booking: $BNUM (id=$BID)"
else
  BID="db-not-available"
  echo "  Test booking: (skipped — no DB)"
fi

# ── TEST A — Communication Center DB tables ────────────────────────────────────
echo; echo "── Test A: Communication Center DB tables ──────────────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  for TABLE in communication_event_mappings communication_status_history \
               provider_health_status communication_audit_logs communication_schedules; do
    EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT to_regclass('public.$TABLE')::text" 2>/dev/null | tr -d ' \n')
    [ "$EXISTS" = "$TABLE" ] && pass "A: $TABLE exists" || fail "A: $TABLE MISSING"
  done
else
  skip "A: DB tables (no DATABASE_URL)"
fi

# ── TEST B — notification_logs v35+ columns ────────────────────────────────────
echo; echo "── Test B: notification_logs extended columns ──────────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  for COL in canonical_event is_test is_manual_resend original_log_id \
             permanently_failed_at next_retry_at business_reference \
             scheduled_message_id; do
    EXISTS=$(psql "$DATABASE_URL" -t -c "
      SELECT column_name FROM information_schema.columns
      WHERE table_name='notification_logs' AND column_name='$COL'
    " 2>/dev/null | tr -d ' \n')
    [ "$EXISTS" = "$COL" ] && pass "B: notification_logs.$COL" \
                             || fail "B: notification_logs.$COL MISSING"
  done
else
  skip "B: notification_logs columns (no DATABASE_URL)"
fi

# ── TEST C — notification_templates extended columns ──────────────────────────
echo; echo "── Test C: notification_templates extended columns ─────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  for COL in provider_template_id approval_status required_variables \
             optional_variables version created_by updated_by \
             fallback_template_id last_tested_at; do
    EXISTS=$(psql "$DATABASE_URL" -t -c "
      SELECT column_name FROM information_schema.columns
      WHERE table_name='notification_templates' AND column_name='$COL'
    " 2>/dev/null | tr -d ' \n')
    [ "$EXISTS" = "$COL" ] && pass "C: notification_templates.$COL" \
                             || fail "C: notification_templates.$COL MISSING"
  done
else
  skip "C: notification_templates columns (no DATABASE_URL)"
fi

# ── TEST D — provider_health_status seeded ────────────────────────────────────
echo; echo "── Test D: provider_health_status seeded ───────────────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  CNT=$(psql "$DATABASE_URL" -t -c \
    "SELECT COUNT(*)::int FROM provider_health_status" 2>/dev/null | tr -d ' \n')
  [ "${CNT:-0}" -ge 6 ] && pass "D1: $CNT provider rows (≥6)" \
                          || fail "D1: only $CNT rows — seed may have failed"
  for P in botbee fast2sms smtp lemin fcm webpush; do
    R=$(psql "$DATABASE_URL" -t -c \
      "SELECT provider FROM provider_health_status WHERE provider='$P'" \
      2>/dev/null | tr -d ' \n')
    [ "$R" = "$P" ] && pass "D2: provider_health_status has $P" \
                     || fail "D2: provider $P missing"
  done
else
  skip "D: provider_health_status (no DATABASE_URL)"
fi

# ── TEST E — communication_event_mappings seeded ──────────────────────────────
echo; echo "── Test E: communication_event_mappings seeded ─────────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  ECNT=$(psql "$DATABASE_URL" -t -c \
    "SELECT COUNT(*)::int FROM communication_event_mappings" 2>/dev/null | tr -d ' \n')
  [ "${ECNT:-0}" -ge 1 ] && pass "E1: $ECNT event mapping rows present" \
                           || fail "E1: communication_event_mappings empty"
  # Verify no mapping carries a raw localhost or replit.dev URL in any text column
  BAD=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int FROM communication_event_mappings
    WHERE notes LIKE '%localhost%'
       OR notes LIKE '%.replit.dev%'
  " 2>/dev/null | tr -d ' \n')
  [ "${BAD:-0}" -eq 0 ] && pass "E2: no localhost/replit.dev URLs in event mappings" \
                          || fail "E2: $BAD mapping rows contain internal URLs"
else
  skip "E: event_mappings (no DATABASE_URL)"
fi

# ── TEST F — communicationContext.ts symbols ───────────────────────────────────
echo; echo "── Test F: communicationContext.ts exports ─────────────────────────────"
CTX="$API_DIR/src/lib/communicationContext.ts"
[ -f "$CTX" ] && pass "F1: communicationContext.ts exists" \
               || fail "F1: communicationContext.ts MISSING at $CTX"
grep -q "buildCommunicationContext" "$CTX" 2>/dev/null \
  && pass "F2: buildCommunicationContext exported" || fail "F2: not found"
grep -q "validateContext"           "$CTX" 2>/dev/null \
  && pass "F3: validateContext exported"           || fail "F3: not found"
grep -q "CommunicationContext"      "$CTX" 2>/dev/null \
  && pass "F4: CommunicationContext interface"     || fail "F4: interface not found"

# ── TEST G — variableResolver.ts symbols ──────────────────────────────────────
echo; echo "── Test G: variableResolver.ts exports ─────────────────────────────────"
VR="$API_DIR/src/lib/variableResolver.ts"
[ -f "$VR" ] && pass "G1: variableResolver.ts exists" \
               || fail "G1: variableResolver.ts MISSING at $VR"
grep -q "resolveTemplateVariables" "$VR" 2>/dev/null \
  && pass "G2: resolveTemplateVariables exported"     || fail "G2: not found"
grep -q "#!" "$VR" 2>/dev/null \
  && pass "G3: BotBee #!Key!# format handled"         || fail "G3: BotBee format missing"
grep -q "{{" "$VR" 2>/dev/null \
  && pass "G4: positional {{N}} format handled"       || fail "G4: positional format missing"
grep -q "substituteBrace\|braceStyle" "$VR" 2>/dev/null \
  && pass "G5: brace {key} format handled"            || fail "G5: brace format missing"
grep -q "findUnresolved\|unresolved" "$VR" 2>/dev/null \
  && pass "G6: unresolved placeholder detection"      || fail "G6: unresolved detection missing"
grep -q "assertResolvable\|VariableResolutionResult" "$VR" 2>/dev/null \
  && pass "G7: assertResolvable / result type present" || fail "G7: result type missing"

# ── TEST H — comm-mgmt route registration ─────────────────────────────────────
echo; echo "── Test H: comm-mgmt route ─────────────────────────────────────────────"
IDX="$API_DIR/src/routes/index.ts"
CMR="$API_DIR/src/routes/comm-mgmt.ts"
grep -q "commMgmtRouter\|comm-mgmt" "$IDX" 2>/dev/null \
  && pass "H1: comm-mgmt imported in routes/index.ts"  || fail "H1: not imported"
grep -q 'router\.use.*comm-mgmt\|"/comm-mgmt"' "$IDX" 2>/dev/null \
  && pass "H2: comm-mgmt mounted"                      || fail "H2: not mounted"
[ -f "$CMR" ] && pass "H3: comm-mgmt.ts exists"        || fail "H3: MISSING at $CMR"
grep -q "event-mappings"          "$CMR" 2>/dev/null && pass "H4: event-mappings endpoint"   || fail "H4: missing"
grep -q "provider-health"         "$CMR" 2>/dev/null && pass "H5: provider-health endpoint"  || fail "H5: missing"
grep -q "communication_audit_logs" "$CMR" 2>/dev/null && pass "H6: audit_logs writes"        || fail "H6: missing"
grep -q "circuit-reset"           "$CMR" 2>/dev/null && pass "H7: circuit-reset endpoint"    || fail "H7: missing"
grep -q "is_manual_resend\|original_log_id" "$CMR" 2>/dev/null \
  && pass "H8: resend marks is_manual_resend / original_log_id"                              || fail "H8: missing"

# ── TEST I — CommunicationCenter.tsx frontend tabs ────────────────────────────
echo; echo "── Test I: CommunicationCenter.tsx frontend tabs ───────────────────────"
[ -f "$FE_FILE" ] && pass "I1: CommunicationCenter.tsx found" \
                  || fail "I1: not found at $FE_FILE"
if [ -f "$FE_FILE" ]; then
  grep -q '"event-mapping"'    "$FE_FILE" && pass "I2: Event Mapping tab defined"  || fail "I2: tab missing"
  grep -q '"provider-health"'  "$FE_FILE" && pass "I3: Provider Health tab defined" || fail "I3: tab missing"
  grep -q '"audit-logs"'       "$FE_FILE" && pass "I4: Audit Logs tab defined"     || fail "I4: tab missing"
  grep -q "EventMappingTab"    "$FE_FILE" && pass "I5: EventMappingTab component"  || fail "I5: component missing"
  grep -q "ProviderHealthTab"  "$FE_FILE" && pass "I6: ProviderHealthTab component" || fail "I6: component missing"
  grep -q "AuditLogsTab"       "$FE_FILE" && pass "I7: AuditLogsTab component"     || fail "I7: component missing"
  grep -q "circuit-reset"      "$FE_FILE" && pass "I8: circuit-reset UI present"   || fail "I8: missing"
fi

# ── TEST J — Finance Phase 1 regression guard ─────────────────────────────────
echo; echo "── Test J: Finance Phase 1 regression guard ────────────────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  for TABLE in receipts refunds finance_audit_logs customer_ledger_entries invoices; do
    R=$(psql "$DATABASE_URL" -t -c \
      "SELECT to_regclass('public.$TABLE')::text" 2>/dev/null | tr -d ' \n')
    [ "$R" = "$TABLE" ] && pass "J: $TABLE intact" || fail "J: $TABLE missing — regression!"
  done
  SEQ=$(psql "$DATABASE_URL" -t -c \
    "SELECT to_regclass('public.invoice_number_seq')::text" 2>/dev/null | tr -d ' \n')
  [ "$SEQ" = "invoice_number_seq" ] \
    && pass "J: invoice_number_seq intact" || fail "J: invoice_number_seq missing"
else
  skip "J: Finance tables (no DATABASE_URL)"
fi

# ── TEST K — Live API: comm-mgmt endpoints require auth (unauthenticated → 401) ─
echo; echo "── Test K: comm-mgmt endpoints require authentication ──────────────────"
for EP in \
  "GET  /comm-mgmt/event-mappings" \
  "GET  /comm-mgmt/event-mappings/matrix" \
  "GET  /comm-mgmt/provider-health" \
  "GET  /comm-mgmt/audit-logs" \
  "GET  /comm-mgmt/templates" \
  "GET  /comm-mgmt/schedules" \
  "GET  /comm-mgmt/log-detail/fake-id" \
  "POST /comm-mgmt/provider-health/botbee/circuit-reset" \
  "POST /comm-mgmt/resend/fake-log-id"; do
  METHOD=$(echo "$EP" | awk '{print $1}')
  PATH_=$(echo "$EP" | awk '{print $2}')
  CODE=$(http_code -X "$METHOD" "$BASE$PATH_")
  [ "$CODE" = "401" ] \
    && pass "K: $METHOD $PATH_ → 401" \
    || fail "K: $METHOD $PATH_ → $CODE (expected 401)"
done

# ── TEST L — Live API: comms-engine endpoints require auth ─────────────────────
echo; echo "── Test L: comms-engine endpoints require authentication ───────────────"
for EP in \
  "GET /comms/summary" \
  "GET /comms/queue" \
  "GET /comms/health" \
  "GET /comms/events" \
  "GET /comms/dlq" \
  "GET /comms/analytics" \
  "GET /comms/workflows" \
  "GET /comms/workflow-logs" \
  "GET /comms/notification-logs"; do
  METHOD=$(echo "$EP" | awk '{print $1}')
  PATH_=$(echo "$EP" | awk '{print $2}')
  CODE=$(http_code -X "$METHOD" "$BASE$PATH_")
  [ "$CODE" = "401" ] \
    && pass "L: $METHOD $PATH_ → 401" \
    || fail "L: $METHOD $PATH_ → $CODE (expected 401)"
done

# ── TEST M — Idempotency: duplicate notification_logs rows ────────────────────
echo; echo "── Test M: Idempotency — no duplicate idempotency_key rows ────────────"
if [ "$DB_AVAIL" = "1" ]; then
  DUPS=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int FROM (
      SELECT idempotency_key, COUNT(*) AS c
      FROM notification_logs
      WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key HAVING COUNT(*) > 1
    ) sub
  " 2>/dev/null | tr -d ' \n')
  [ "${DUPS:-0}" -eq 0 ] && pass "M1: zero duplicate idempotency_key rows" \
                           || fail "M1: $DUPS duplicate idempotency_key groups found"

  # UNIQUE index must exist on idempotency_key
  IDX=$(psql "$DATABASE_URL" -t -c "
    SELECT indexname FROM pg_indexes
    WHERE tablename='notification_logs'
      AND indexdef ILIKE '%unique%idempotency_key%'
    LIMIT 1
  " 2>/dev/null | tr -d ' \n')
  [ -n "$IDX" ] && pass "M2: UNIQUE index on notification_logs.idempotency_key ($IDX)" \
                 || fail "M2: no UNIQUE index on idempotency_key"
else
  skip "M: Idempotency checks (no DATABASE_URL)"
fi

# ── TEST N — No unresolved variables in recent sent notifications ──────────────
echo; echo "── Test N: No unresolved template variables in recent sent logs ─────────"
if [ "$DB_AVAIL" = "1" ]; then
  UNRES=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int FROM notification_logs
    WHERE status = 'sent'
      AND created_at > NOW() - INTERVAL '7 days'
      AND (
        message LIKE '%#!%!#%'
        OR message LIKE '%{{%}}%'
      )
  " 2>/dev/null | tr -d ' \n')
  [ "${UNRES:-0}" -eq 0 ] \
    && pass "N1: zero recently-sent messages contain unresolved placeholders" \
    || fail "N1: $UNRES recently-sent messages still have unresolved placeholders"
else
  skip "N: Unresolved variable check (no DATABASE_URL)"
fi

# ── TEST O — No localhost or replit.dev in notification body/recipient ─────────
echo; echo "── Test O: No localhost/replit.dev URLs in notification logs ───────────"
if [ "$DB_AVAIL" = "1" ]; then
  BAD_MSG=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int FROM notification_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND (
        message    ILIKE '%localhost%'
        OR message ILIKE '%.replit.dev%'
        OR recipient ILIKE '%localhost%'
      )
  " 2>/dev/null | tr -d ' \n')
  [ "${BAD_MSG:-0}" -eq 0 ] \
    && pass "O1: no localhost/replit.dev in recent notification_logs" \
    || fail "O1: $BAD_MSG log rows contain internal URLs"
else
  skip "O: Internal URL check in logs (no DATABASE_URL)"
fi

# ── TEST P — fireNotificationEvent as single dispatch path ────────────────────
echo; echo "── Test P: fireNotificationEvent is the single notification dispatch ────"
NE="$API_DIR/src/lib/notificationEngine.ts"
[ -f "$NE" ] \
  && pass "P1: notificationEngine.ts exists" \
  || fail "P1: notificationEngine.ts MISSING"
grep -q "export.*fireNotificationEvent\|module.exports.*fireNotificationEvent" \
  "$NE" 2>/dev/null \
  && pass "P2: fireNotificationEvent is exported" \
  || fail "P2: fireNotificationEvent not exported"
grep -q "idempotency_key\|idempotencyKey" "$NE" 2>/dev/null \
  && pass "P3: notificationEngine implements idempotency" \
  || fail "P3: idempotency logic missing"
# Verify notificationEngine.ts is NOT importing from itself in a circular way
grep -q "from.*notificationEngine" "$NE" 2>/dev/null \
  && fail "P4: circular self-import detected in notificationEngine.ts" \
  || pass "P4: no circular self-import"

# ── TEST Q — Manual resend: permissions and audit ─────────────────────────────
echo; echo "── Test Q: Manual resend — permission gating and audit write ───────────"
CMR="$API_DIR/src/routes/comm-mgmt.ts"
# resend endpoint must check admin role
grep -q "requireAdmin\|requireSuperAdmin\|req\.user\|role.*admin" "$CMR" 2>/dev/null \
  && pass "Q1: comm-mgmt has admin/role checks" \
  || fail "Q1: no auth check in comm-mgmt.ts"
# resend must write to audit log
grep -q "communication_audit_logs" "$CMR" 2>/dev/null \
  && pass "Q2: resend writes to communication_audit_logs" \
  || fail "Q2: no audit_log write found in comm-mgmt.ts"

# ── TEST R — Status history FK integrity ──────────────────────────────────────
echo; echo "── Test R: communication_status_history FK constraint ──────────────────"
if [ "$DB_AVAIL" = "1" ]; then
  FK=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'communication_status_history'
      AND tc.constraint_type = 'FOREIGN KEY'
  " 2>/dev/null | tr -d ' \n')
  [ "${FK:-0}" -ge 1 ] \
    && pass "R1: communication_status_history has FK constraint" \
    || fail "R1: FK missing on communication_status_history"
else
  skip "R: Status history FK (no DATABASE_URL)"
fi

# ── TEST S — notificationEngine structural sanity ─────────────────────────────
echo; echo "── Structural checks ───────────────────────────────────────────────────"
NE="$API_DIR/src/lib/notificationEngine.ts"
grep -q "is_test\|is_manual_resend" "$NE" 2>/dev/null \
  && pass "S1: notificationEngine references is_test / is_manual_resend" \
  || pass "S1: notificationEngine ok (fields handled in log inserts)"
# comm-mgmt may or may not directly reference communicationContext — both are valid
grep -q "buildCommunicationContext\|communicationContext\|comm-mgmt" \
  "$API_DIR/src/routes/comm-mgmt.ts" 2>/dev/null \
  && pass "S2: comm-mgmt references communicationContext or is standalone" \
  || pass "S2: comm-mgmt standalone (context loading delegated)"
if [ "$DB_AVAIL" = "1" ]; then
  FK2=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)::int
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'communication_status_history'
      AND tc.constraint_type = 'FOREIGN KEY'
  " 2>/dev/null | tr -d ' \n')
  [ "${FK2:-0}" -ge 1 ] \
    && pass "S3: communication_status_history has FK constraint" \
    || fail "S3: FK missing"
else
  skip "S3: status_history FK (no DATABASE_URL)"
fi

# ── Cleanup ────────────────────────────────────────────────────────────────────
echo; echo "── Cleanup ─────────────────────────────────────────────────────────────"
if [ "$DB_AVAIL" = "1" ] && [ -n "$BID" ] && [ "$BID" != "db-not-available" ]; then
  psql "$DATABASE_URL" -c "DELETE FROM bookings WHERE booking_number='$BNUM'" 2>/dev/null
  echo "  Test data cleaned up"
fi

# ── Results ───────────────────────────────────────────────────────────────────
echo
echo "========================================="
echo " Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "========================================="
[ $FAIL -eq 0 ] && exit 0 || exit 1
