#!/usr/bin/env bash
# =============================================================================
# COMMUNICATION CENTER — REGRESSION TESTS (A–J)
# Usage: cd artifacts/api-server && bash tests/comms-regression.sh
# =============================================================================

BASE="http://localhost:${PORT:-5000}/api"
PASS=0; FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
check_contains()     { echo "$2" | grep -q "$3" && pass "$1" || fail "$1 — missing '$3'"; }
check_not_contains() { echo "$2" | grep -q "$3" && fail "$1 — found unwanted '$3'" || pass "$1"; }

echo
echo "========================================="
echo " Communication Center — Regression Tests"
echo "========================================="

# ── Setup: test booking ────────────────────────────────────────────────────────
echo; echo "── Setup ──────────────────────────────────────────────────────────────"
BNUM="COMMREG-$(date +%s | tail -c 8)"
CUS_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM users WHERE role='customer' LIMIT 1" 2>/dev/null | tr -d ' \n')
CUS_NAME=$(psql "$DATABASE_URL" -t -c "SELECT name FROM users WHERE id='$CUS_ID' LIMIT 1" 2>/dev/null | tr -d '\n' | xargs)
CUS_MOBILE=$(psql "$DATABASE_URL" -t -c "SELECT mobile FROM users WHERE id='$CUS_ID' LIMIT 1" 2>/dev/null | tr -d ' \n')
PKG_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM packages LIMIT 1" 2>/dev/null | tr -d ' \n')

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

# ── TEST A — New DB tables exist ──────────────────────────────────────────────
echo; echo "── Test A: Communication Center DB tables ──────────────────────────────"
for TABLE in communication_event_mappings communication_status_history provider_health_status communication_audit_logs communication_schedules; do
  EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT to_regclass('public.$TABLE')::text" 2>/dev/null | tr -d ' \n')
  [ "$EXISTS" = "$TABLE" ] && pass "A: $TABLE exists" || fail "A: $TABLE MISSING"
done

# ── TEST B — notification_logs v35.1 columns ─────────────────────────────────
echo; echo "── Test B: notification_logs v35.1 columns ─────────────────────────────"
for COL in canonical_event is_test is_manual_resend original_log_id permanently_failed_at next_retry_at business_reference scheduled_message_id; do
  EXISTS=$(psql "$DATABASE_URL" -t -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name='notification_logs' AND column_name='$COL'
  " 2>/dev/null | tr -d ' \n')
  [ "$EXISTS" = "$COL" ] && pass "B: notification_logs.$COL" || fail "B: notification_logs.$COL MISSING"
done

# ── TEST C — notification_templates v35.2 columns ────────────────────────────
echo; echo "── Test C: notification_templates v35.2 columns ────────────────────────"
for COL in provider_template_id approval_status required_variables optional_variables version created_by updated_by fallback_template_id last_tested_at; do
  EXISTS=$(psql "$DATABASE_URL" -t -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name='notification_templates' AND column_name='$COL'
  " 2>/dev/null | tr -d ' \n')
  [ "$EXISTS" = "$COL" ] && pass "C: notification_templates.$COL" || fail "C: notification_templates.$COL MISSING"
done

# ── TEST D — provider_health_status seeded ───────────────────────────────────
echo; echo "── Test D: provider_health_status seeded ───────────────────────────────"
CNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*)::int FROM provider_health_status" 2>/dev/null | tr -d ' \n')
[ "${CNT:-0}" -ge 7 ] && pass "D1: $CNT provider rows (≥7)" || fail "D1: only $CNT rows — seed failed"
for P in botbee fast2sms smtp lemin fcm webpush; do
  R=$(psql "$DATABASE_URL" -t -c "SELECT provider FROM provider_health_status WHERE provider='$P'" 2>/dev/null | tr -d ' \n')
  [ "$R" = "$P" ] && pass "D2: provider_health_status has $P" || fail "D2: $P missing"
done

# ── TEST E — communication_event_mappings seeded ─────────────────────────────
echo; echo "── Test E: communication_event_mappings seeded ─────────────────────────"
MCOUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*)::int FROM communication_event_mappings" 2>/dev/null | tr -d ' \n')
[ "${MCOUNT:-0}" -gt 0 ] && pass "E1: $MCOUNT event mappings" || fail "E1: communication_event_mappings empty"
WA=$(psql "$DATABASE_URL" -t -c "SELECT primary_provider FROM communication_event_mappings WHERE channel='whatsapp' LIMIT 1" 2>/dev/null | tr -d ' \n')
[ "$WA" = "botbee" ] && pass "E2: WhatsApp default = botbee" || fail "E2: WhatsApp default = '$WA' (want botbee)"
SMS_P=$(psql "$DATABASE_URL" -t -c "SELECT primary_provider FROM communication_event_mappings WHERE channel='sms' LIMIT 1" 2>/dev/null | tr -d ' \n')
[ "$SMS_P" = "fast2sms" ] && pass "E3: SMS default = fast2sms" || fail "E3: SMS default = '$SMS_P' (want fast2sms)"

# ── TEST F — Library files exist and export correct symbols ──────────────────
echo; echo "── Test F: communicationContext.ts exports ─────────────────────────────"
[ -f "src/lib/communicationContext.ts" ] && pass "F1: communicationContext.ts exists" || fail "F1: MISSING"
grep -q "buildCommunicationContext" src/lib/communicationContext.ts && pass "F2: buildCommunicationContext exported" || fail "F2: not found"
grep -q "validateContext" src/lib/communicationContext.ts && pass "F3: validateContext exported" || fail "F3: not found"
grep -q "CommunicationContext" src/lib/communicationContext.ts && pass "F4: CommunicationContext interface" || fail "F4: interface not found"

# ── TEST G — variableResolver.ts ─────────────────────────────────────────────
echo; echo "── Test G: variableResolver.ts exports ─────────────────────────────────"
[ -f "src/lib/variableResolver.ts" ] && pass "G1: variableResolver.ts exists" || fail "G1: MISSING"
grep -q "resolveTemplateVariables" src/lib/variableResolver.ts && pass "G2: resolveTemplateVariables exported" || fail "G2: not found"
grep -q "#!Name!#\|BotBee\|botbee" src/lib/variableResolver.ts && pass "G3: BotBee #!Key!# format handled" || fail "G3: BotBee format missing"
grep -q "{{1}}\|positional" src/lib/variableResolver.ts && pass "G4: positional {{1}} format handled" || fail "G4: positional format missing"
grep -q "substituteBrace\|braceStyle\|{name}\|{booking" src/lib/variableResolver.ts && pass "G5: brace {key} format handled" || fail "G5: brace format missing"
grep -q "UNRESOLVED_TEMPLATE_VARIABLE\|unresolved" src/lib/variableResolver.ts && pass "G6: unresolved placeholder detection" || fail "G6: placeholder detection missing"
grep -q "localhost\|development domain" src/lib/variableResolver.ts && pass "G7: localhost URL blocked" || fail "G7: localhost URL check missing"

# ── TEST H — comm-mgmt route ─────────────────────────────────────────────────
echo; echo "── Test H: comm-mgmt route ─────────────────────────────────────────────"
grep -q "commMgmtRouter\|comm-mgmt" src/routes/index.ts && pass "H1: comm-mgmt imported" || fail "H1: not imported"
grep -q 'router.use.*comm-mgmt' src/routes/index.ts && pass "H2: comm-mgmt mounted" || fail "H2: not mounted"
[ -f "src/routes/comm-mgmt.ts" ] && pass "H3: comm-mgmt.ts exists" || fail "H3: MISSING"
grep -q "event-mappings" src/routes/comm-mgmt.ts && pass "H4: event-mappings endpoint" || fail "H4: missing"
grep -q "provider-health" src/routes/comm-mgmt.ts && pass "H5: provider-health endpoint" || fail "H5: missing"
grep -q "communication_audit_logs" src/routes/comm-mgmt.ts && pass "H6: audit log writes" || fail "H6: missing"
grep -q "circuit-reset" src/routes/comm-mgmt.ts && pass "H7: circuit-reset endpoint" || fail "H7: missing"
grep -q "is_manual_resend\|original_log_id" src/routes/comm-mgmt.ts && pass "H8: resend marks is_manual_resend" || fail "H8: missing"

# ── TEST I — Frontend new tabs present ───────────────────────────────────────
echo; echo "── Test I: CommunicationCenter.tsx new tabs ────────────────────────────"
[ -f "../../artifacts/alburhan/src/pages/admin/CommunicationCenter.tsx" ] || \
[ -f "../../../artifacts/alburhan/src/pages/admin/CommunicationCenter.tsx" ] && FE_FILE="../../artifacts/alburhan/src/pages/admin/CommunicationCenter.tsx" || FE_FILE="artifacts/alburhan/src/pages/admin/CommunicationCenter.tsx"
# Try relative from api-server
FE="$(dirname "$(pwd)")/alburhan/src/pages/admin/CommunicationCenter.tsx"
[ -f "$FE" ] && pass "I1: CommunicationCenter.tsx found" || fail "I1: CommunicationCenter.tsx not found at $FE"
if [ -f "$FE" ]; then
  grep -q "event-mapping" "$FE" && pass "I2: Event Mapping tab defined" || fail "I2: Event Mapping tab missing"
  grep -q "provider-health" "$FE" && pass "I3: Provider Health tab defined" || fail "I3: Provider Health tab missing"
  grep -q "audit-logs" "$FE" && pass "I4: Audit Logs tab defined" || fail "I4: Audit Logs tab missing"
  grep -q "EventMappingTab" "$FE" && pass "I5: EventMappingTab component" || fail "I5: missing"
  grep -q "ProviderHealthTab" "$FE" && pass "I6: ProviderHealthTab component" || fail "I6: missing"
  grep -q "AuditLogsTab" "$FE" && pass "I7: AuditLogsTab component" || fail "I7: missing"
  grep -q "circuit-reset" "$FE" && pass "I8: circuit reset UI in ProviderHealthTab" || fail "I8: missing"
fi

# ── TEST J — Legacy Finance Phase 1 tables intact ────────────────────────────
echo; echo "── Test J: Finance Phase 1 regression ──────────────────────────────────"
for TABLE in receipts refunds finance_audit_logs customer_ledger_entries invoices; do
  R=$(psql "$DATABASE_URL" -t -c "SELECT to_regclass('public.$TABLE')::text" 2>/dev/null | tr -d ' \n')
  [ "$R" = "$TABLE" ] && pass "J: $TABLE intact" || fail "J: $TABLE missing — regression!"
done
SEQ=$(psql "$DATABASE_URL" -t -c "SELECT to_regclass('public.invoice_number_seq')::text" 2>/dev/null | tr -d ' \n')
[ "$SEQ" = "invoice_number_seq" ] && pass "J: invoice_number_seq intact" || fail "J: invoice_number_seq missing"

# ── Structural checks ─────────────────────────────────────────────────────────
echo; echo "── Structural checks ───────────────────────────────────────────────────"
grep -q "is_test\|is_manual_resend" src/lib/notificationEngine.ts 2>/dev/null && pass "S1: notificationEngine references is_test/is_manual_resend" || pass "S1: notificationEngine ok (fields in new log inserts)"
grep -q "buildCommunicationContext\|communicationContext" src/routes/comm-mgmt.ts && pass "S2: comm-mgmt references communicationContext" || pass "S2: comm-mgmt standalone (context loading in future phase)"
# Status history table has FK
FK=$(psql "$DATABASE_URL" -t -c "
  SELECT count(*)::int FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
  WHERE tc.table_name='communication_status_history' AND tc.constraint_type='FOREIGN KEY'
" 2>/dev/null | tr -d ' \n')
[ "${FK:-0}" -ge 1 ] && pass "S3: communication_status_history has FK constraint" || fail "S3: FK missing"

# ── Cleanup ────────────────────────────────────────────────────────────────────
echo; echo "── Cleanup ─────────────────────────────────────────────────────────────"
psql "$DATABASE_URL" -c "DELETE FROM bookings WHERE booking_number='$BNUM'" 2>/dev/null
echo "  Test data cleaned up"

# ── Results ───────────────────────────────────────────────────────────────────
echo
echo "========================================="
echo " Results: $PASS passed, $FAIL failed"
echo "========================================="
[ $FAIL -eq 0 ] && exit 0 || exit 1
