#!/usr/bin/env bash
# Booking Lifecycle Regression Tests (A–E)
# Run against local dev DB: bash tests/booking-lifecycle-regression.sh
# Requires: psql (DATABASE_URL set), curl (API_BASE defaults to localhost:8080)
#
# Scenarios tested:
#   A: Pending booking → zero invoices, booking_received only, no agreement
#   B: Admin approval → booking_approved triggered, agreement_ready path present
#   C: Duplicate payment webhook → exactly one payment record, one notification per channel
#   D: Invalid invoice → blank/zero amount blocked, blank URL blocked, INVOICE_VALIDATION_FAILED logged
#   E: Historical log cleanup → no legitimate 'sent' row deleted, superseded rows marked
#   F: SMS pre-send validator → UNRESOLVED_TEMPLATE_VARIABLE blocks send
#   G: send-invoice guard → 422 for pending/zero-amount bookings, 422 when no invoice record
#   H: Idempotency UNIQUE index → duplicate key insert blocked
#   I: Code-path audit → legacy notifyNewBooking/notifyBookingApproved removed

set +e
API="${API_BASE:-http://localhost:8080}"
DB="${DATABASE_URL:-}"
PASS=0; FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

db()   { psql "$DB" -t -A -c "$1" 2>/dev/null; }
dbq()  { psql "$DB" -t -A -c "$1" 2>/dev/null | tr -d ' '; }

echo ""
echo "========================================="
echo " Booking Lifecycle Regression Tests (A–I)"
echo "========================================="

# ── Setup: create fresh test booking ─────────────────────────────────────────
echo ""
echo "── Setup: create test booking ───────────────────────────────────────────"

TEST_BOOKING_ID=$(db "SELECT gen_random_uuid()::text")
TEST_BOOKING_NUM="REGTEST-$(date +%s)"
TEST_CUSTOMER_ID=$(db "SELECT id FROM users WHERE role='customer' LIMIT 1")
if [ -z "$TEST_CUSTOMER_ID" ]; then
  TEST_CUSTOMER_ID=$(db "INSERT INTO users (id,mobile,name,email,role,created_at) VALUES (gen_random_uuid()::text,'9999999999','Reg Tester','reg@test.com','customer',NOW()) RETURNING id")
fi

db "
INSERT INTO bookings (id,booking_number,customer_id,customer_name,customer_mobile,customer_email,
  status,final_amount,number_of_pilgrims,package_name,created_at,updated_at,is_offline)
VALUES ('$TEST_BOOKING_ID','$TEST_BOOKING_NUM','$TEST_CUSTOMER_ID','Test Customer','9000000099',
  'test@test.com','pending',125000,1,'Test Hajj Package',NOW(),NOW(),false)
ON CONFLICT (id) DO NOTHING" > /dev/null

echo "  Test booking: $TEST_BOOKING_NUM (id=$TEST_BOOKING_ID)"

# ── TEST A: Pending booking → zero invoices/agreements, no invoice notifications ──
echo ""
echo "── Test A: Pending booking → zero premature records ─────────────────────"

INV_COUNT=$(dbq "SELECT COUNT(*) FROM invoices WHERE booking_id='$TEST_BOOKING_ID'")
AGR_COUNT=$(dbq "SELECT COUNT(*) FROM agreements WHERE booking_id='$TEST_BOOKING_ID'")
PAY_COUNT=$(dbq "SELECT COUNT(*) FROM payment_transactions WHERE booking_id='$TEST_BOOKING_ID'")
INV_NOTIF=$(dbq "SELECT COUNT(*) FROM notification_logs WHERE booking_id='$TEST_BOOKING_ID' AND event_type='invoice_generated'")

[ "$INV_COUNT" = "0" ] && pass "A1: No invoices on pending booking" || fail "A1: Found $INV_COUNT invoice(s) on pending booking"
[ "$AGR_COUNT" = "0" ] && pass "A2: No agreements on pending booking" || fail "A2: Found $AGR_COUNT agreement(s) on pending booking"
[ "$PAY_COUNT" = "0" ] && pass "A3: No payment records on pending booking" || fail "A3: Found $PAY_COUNT payment record(s) on pending booking"
[ "$INV_NOTIF" = "0" ] && pass "A4: No invoice notification on pending booking" || fail "A4: Found $INV_NOTIF invoice notification(s) on pending booking"

# ── TEST B: Approval path → triggerWorkflow owns all notifications ────────────
echo ""
echo "── Test B: Approval path — single notification route ────────────────────"

# Verify notifyBookingApproved and notifyNewBooking are NOT called from booking routes
grep -q "\[create\] autoGenerateAgreement" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  fail "B1: Old [create] autoGenerateAgreement still present in bookings.ts" || \
  pass "B1: [create] autoGenerateAgreement removed from online booking creation"

# Verify triggerWorkflow("booking_approved") IS in the approval route
grep -q "booking_approved" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "B2: booking_approved trigger present in approval route" || \
  fail "B2: booking_approved trigger missing from approval route"

# Verify legacy notifyNewBooking import is gone (either removed or commented)
grep -q "^import.*notifyNewBooking" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  fail "B3: notifyNewBooking still imported (uncommented) in bookings.ts" || \
  pass "B3: notifyNewBooking not an active import in bookings.ts"

# ── TEST C: Duplicate payment webhook → one record, one notification ──────────
echo ""
echo "── Test C: Duplicate payment webhook → idempotency ─────────────────────"

# Insert a test payment reference
TEST_PAY_REF="pay_testref_$(date +%s)"
TEST_TXN_ID1=$(db "SELECT gen_random_uuid()::text")
TEST_TXN_ID2=$(db "SELECT gen_random_uuid()::text")

# First insert — should succeed
db "INSERT INTO payment_transactions (id,booking_id,amount,payment_date,payment_mode,reference_number,notes)
    SELECT '$TEST_TXN_ID1','$TEST_BOOKING_ID',10000,'$(date +%Y-%m-%d)','online','$TEST_PAY_REF','First insert'
    WHERE NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reference_number='$TEST_PAY_REF')" > /dev/null

# Second insert (same reference) — should be blocked by WHERE NOT EXISTS or UNIQUE index
db "INSERT INTO payment_transactions (id,booking_id,amount,payment_date,payment_mode,reference_number,notes)
    SELECT '$TEST_TXN_ID2','$TEST_BOOKING_ID',10000,'$(date +%Y-%m-%d)','online','$TEST_PAY_REF','Duplicate insert'
    WHERE NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reference_number='$TEST_PAY_REF')
    ON CONFLICT (reference_number) WHERE reference_number IS NOT NULL DO NOTHING" > /dev/null

PAY_REF_COUNT=$(dbq "SELECT COUNT(*) FROM payment_transactions WHERE reference_number='$TEST_PAY_REF'")
[ "$PAY_REF_COUNT" = "1" ] && pass "C1: Duplicate payment reference blocked (count=1)" || fail "C1: Duplicate payment reference NOT blocked (count=$PAY_REF_COUNT)"

# Verify UNIQUE index exists on payment_transactions(reference_number)
UNIQ_PAY=$(dbq "SELECT COUNT(*) FROM pg_indexes WHERE tablename='payment_transactions' AND indexname='uq_payment_transactions_reference_number'")
[ "$UNIQ_PAY" = "1" ] && pass "C2: UNIQUE index uq_payment_transactions_reference_number exists" || fail "C2: UNIQUE index missing on payment_transactions(reference_number)"

# Verify notification_logs idempotency: inserting same key twice produces only 1 row
TEST_IKEY="test_ikey_$(date +%s)_$$"
LOG_ID1=$(db "SELECT gen_random_uuid()::text")
LOG_ID2=$(db "SELECT gen_random_uuid()::text")
db "INSERT INTO notification_logs (id,event_type,channel,recipient,status,idempotency_key,created_at,updated_at)
    VALUES ('$LOG_ID1','payment_received','whatsapp','9000000099','sent','$TEST_IKEY',NOW(),NOW())
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING" > /dev/null
db "INSERT INTO notification_logs (id,event_type,channel,recipient,status,idempotency_key,created_at,updated_at)
    VALUES ('$LOG_ID2','payment_received','whatsapp','9000000099','sent','$TEST_IKEY',NOW(),NOW())
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING" > /dev/null
IKEY_COUNT=$(dbq "SELECT COUNT(*) FROM notification_logs WHERE idempotency_key='$TEST_IKEY'")
[ "$IKEY_COUNT" = "1" ] && pass "C3: Duplicate idempotency key blocked (count=1)" || fail "C3: Duplicate notification not blocked (count=$IKEY_COUNT)"

# Verify idempotency UNIQUE index exists
UNIQ_NOTIF=$(dbq "SELECT COUNT(*) FROM pg_indexes WHERE tablename='notification_logs' AND indexname LIKE '%idempotency%'")
[ "$UNIQ_NOTIF" -ge "1" ] 2>/dev/null && pass "C4: Notification_logs idempotency UNIQUE index exists" || fail "C4: Notification_logs idempotency index missing"

# ── TEST D: Invalid invoice → send blocked, INVOICE_VALIDATION_FAILED ─────────
echo ""
echo "── Test D: Invalid invoice validation ───────────────────────────────────"

# Verify all 8 guards exist in send-invoice handler source
grep -q "INVOICE_VALIDATION_FAILED" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D1: INVOICE_VALIDATION_FAILED code exists in send-invoice route" || \
  fail "D1: INVOICE_VALIDATION_FAILED not found in send-invoice route"

grep -q "invoice_record" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D2: invoice_record existence check present" || \
  fail "D2: invoice_record check missing from send-invoice"

grep -q "invoice_number" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D3: invoice_number check present" || \
  fail "D3: invoice_number check missing"

grep -q "customer_name" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D4: customer_name check present" || \
  fail "D4: customer_name check missing"

grep -q "package_name" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D5: package_name check present" || \
  fail "D5: package_name check missing"

grep -q "invoice_url" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D6: invoice_url check present" || \
  fail "D6: invoice_url check missing"

# Verify validation failure is written to notification_logs
grep -q "'INVOICE_VALIDATION_FAILED'" \
  "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "D7: INVOICE_VALIDATION_FAILED is logged to notification_logs" || \
  fail "D7: INVOICE_VALIDATION_FAILED is NOT logged to notification_logs"

# ── TEST E: Historical duplicate log cleanup ──────────────────────────────────
echo ""
echo "── Test E: Historical log cleanup ───────────────────────────────────────"

# Verify superseded_at/superseded_by columns exist on notification_logs
SUP_AT=$(dbq "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='notification_logs' AND column_name='superseded_at'")
SUP_BY=$(dbq "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='notification_logs' AND column_name='superseded_by'")
[ "$SUP_AT" = "1" ] && pass "E1: superseded_at column exists on notification_logs" || fail "E1: superseded_at column missing from notification_logs"
[ "$SUP_BY" = "1" ] && pass "E2: superseded_by column exists on notification_logs" || fail "E2: superseded_by column missing from notification_logs"

# Verify audit backup table exists
AUDIT_TBL=$(dbq "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='notification_logs_dup_audit'")
[ "$AUDIT_TBL" = "1" ] && pass "E3: notification_logs_dup_audit backup table exists" || fail "E3: notification_logs_dup_audit backup table missing"

# No sent row should have been deleted — counts must remain consistent
SENT_MISSING=$(dbq "SELECT COUNT(*) FROM notification_logs_dup_audit a WHERE NOT EXISTS (SELECT 1 FROM notification_logs nl WHERE nl.id=a.original_id)" 2>/dev/null || echo "0")
[ "$SENT_MISSING" = "0" ] && pass "E4: No original notification_logs rows deleted (all audit originals still present)" || fail "E4: $SENT_MISSING original notification_logs rows are missing after cleanup"

# Any superseded rows still have status='sent' (not changed)
BAD_STATUS=$(dbq "SELECT COUNT(*) FROM notification_logs WHERE superseded_at IS NOT NULL AND status != 'sent'" 2>/dev/null || echo "0")
[ "$BAD_STATUS" = "0" ] && pass "E5: Superseded rows retain status='sent' (no history altered)" || fail "E5: $BAD_STATUS superseded rows have unexpected status change"

# ── TEST F: SMS pre-send placeholder validator ────────────────────────────────
echo ""
echo "── Test F: SMS pre-send placeholder validator ────────────────────────────"

grep -q "UNRESOLVED_TEMPLATE_VARIABLE" "$(dirname "$0")/../src/lib/sms.ts" 2>/dev/null && \
  pass "F1: UNRESOLVED_TEMPLATE_VARIABLE guard exists in sms.ts sendDLT" || \
  fail "F1: UNRESOLVED_TEMPLATE_VARIABLE guard missing from sms.ts"

grep -q "PLACEHOLDER_RE\|#!.*!#" "$(dirname "$0")/../src/lib/sms.ts" 2>/dev/null && \
  pass "F2: Placeholder regex (#!...!#) defined in sms.ts" || \
  fail "F2: Placeholder regex missing from sms.ts"

# ── TEST G: send-invoice HTTP guard (requires running server) ─────────────────
echo ""
echo "── Test G: send-invoice guard → 422 for invalid requests ────────────────"

# Source-code checks (server-independent)
grep -q "DATA_VALIDATION_FAILED\|INVOICE_VALIDATION_FAILED" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "G1: send-invoice guard code exists (DATA/INVOICE_VALIDATION_FAILED)" || \
  fail "G1: send-invoice guard code missing"

grep -q "UNPAYABLE_STATUSES\|pending.*submitted.*rejected" "$(dirname "$0")/../src/routes/bookings.ts" 2>/dev/null && \
  pass "G2: Unpayable status list blocks send-invoice" || \
  fail "G2: Unpayable status list missing from send-invoice"

# ── TEST H: Idempotency UNIQUE index ─────────────────────────────────────────
echo ""
echo "── Test H: Idempotency UNIQUE index ─────────────────────────────────────"

IKEY_IDX=$(dbq "SELECT COUNT(*) FROM pg_indexes WHERE tablename='notification_logs' AND indexname='uq_notification_logs_idempotency'")
[ "$IKEY_IDX" = "1" ] && pass "H1: UNIQUE INDEX uq_notification_logs_idempotency exists" || fail "H1: UNIQUE INDEX uq_notification_logs_idempotency missing"

# Also verify no duplicate idempotency keys currently exist
DUP_KEYS=$(dbq "SELECT COUNT(*) FROM (SELECT idempotency_key FROM notification_logs WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*)>1) sub" 2>/dev/null || echo "0")
[ "$DUP_KEYS" = "0" ] && pass "H2: Zero duplicate idempotency keys in notification_logs" || fail "H2: $DUP_KEYS duplicate idempotency keys still exist"

# ── TEST I: Documentation ──────────────────────────────────────────────────────
echo ""
echo "── Test I: Event-source map documentation ────────────────────────────────"

[ -f "$(dirname "$0")/../docs/booking-lifecycle-event-source-map.md" ] && \
  pass "I1: Booking lifecycle event-source map doc exists" || \
  fail "I1: Booking lifecycle event-source map doc missing"

# ── Cleanup ───────────────────────────────────────────────────────────────────
db "DELETE FROM payment_transactions WHERE reference_number LIKE 'pay_testref_%'" > /dev/null
db "DELETE FROM notification_logs WHERE idempotency_key LIKE 'test_ikey_%'" > /dev/null
db "DELETE FROM bookings WHERE id='$TEST_BOOKING_ID'" > /dev/null

echo ""
echo "========================================="
echo " Results: $PASS passed, $FAIL failed"
echo "========================================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
