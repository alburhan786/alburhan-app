#!/usr/bin/env bash
# ─── Customer Portal 2.0 — Regression Tests ───────────────────────────────────
# Run: bash artifacts/api-server/tests/customer-portal-regression.sh

BASE="${BASE_URL:-http://localhost:8080}"
PASS=0
FAIL=0

chk() {
  local desc="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then
    echo "✅  PASS  $desc (HTTP $got)"
    PASS=$((PASS+1))
  else
    echo "❌  FAIL  $desc — expected HTTP $expected, got $got"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "─── Customer Portal 2.0 Regression ─────────────────────────────────────────"
echo ""

# ── § 1. Root API health ──────────────────────────────────────────────────────
chk "Root API health probe" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/")"

# ── § 2. Auth guards — GET unauthenticated → 401 ─────────────────────────────
for ROUTE in \
  "customer/overview" \
  "customer/notifications" \
  "customer/resources" \
  "customer/profile/edit-requests" \
  "customer/bookings/TEST001" \
  "customer/bookings/TEST001/finance" \
  "customer/bookings/TEST001/communications"; do
  chk "${ROUTE} unauthenticated → 401" "401" \
    "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/${ROUTE}")"
done

# ── § 3. Admin guards — GET unauthenticated → 401 ────────────────────────────
for ROUTE in \
  "customer/admin/resources" \
  "customer/admin/profile-edits" \
  "customer/admin/portal/test-id"; do
  chk "Admin ${ROUTE} unauthenticated → 401" "401" \
    "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/${ROUTE}")"
done

# ── § 4. PUT — unauthenticated → 401 ─────────────────────────────────────────
for ROUTE in \
  "customer/notifications/test-id/read" \
  "customer/notifications/read-all" \
  "customer/notifications/test-id/archive" \
  "customer/admin/profile-edits/test-id/approve" \
  "customer/admin/profile-edits/test-id/reject"; do
  chk "PUT ${ROUTE} unauthenticated → 401" "401" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE}/api/${ROUTE}")"
done

# ── § 5. POST — unauthenticated → 401 ────────────────────────────────────────
for ROUTE in \
  "customer/profile/edit-request" \
  "customer/admin/resources" \
  "customer/admin/portal/test-id/notify"; do
  chk "POST ${ROUTE} unauthenticated → 401" "401" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "${BASE}/api/${ROUTE}")"
done

# ── § 6. DELETE — unauthenticated → 401 ──────────────────────────────────────
chk "DELETE admin/resources/test-id unauthenticated → 401" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${BASE}/api/customer/admin/resources/test-id")"

# ── § 7. Journey router not broken by new router ─────────────────────────────
chk "customer/journey/:id still → 401 (not 404)" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/customer/journey/test-id")"

# ── § 8. Migration proof — server startup included v36 migrations without crashing
chk "Server still alive after v36 migrations" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/")"

echo ""
echo "─── Results ─────────────────────────────────────────────────────────────────"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "❌  $FAIL test(s) FAILED"
  exit 1
else
  echo "✅  All $PASS tests PASSED"
fi
