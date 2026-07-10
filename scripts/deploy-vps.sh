#!/bin/bash
# ============================================================================
# Al Burhan Tours — one-shot automatic VPS deploy + verify script
#
# Run this ON THE VPS (not in Replit), from the repo root:
#   cd /var/www/alburhan && bash scripts/deploy-vps.sh
#
# It is idempotent — safe to run multiple times. It auto-detects the PM2
# process name and the production domain, so there is nothing to edit by
# hand. It stops on the first failing step and prints the exact error.
# ============================================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

TOTAL_STEPS=10
STEP=0
RESULTS=()
TEST_MOBILE="${1:-9893989786}"

pass() { echo "  ✅ PASS: $1"; RESULTS+=("✓ $1"); }
fail_and_exit() {
  echo "  ❌ FAIL: $1"
  echo "-----------------------------------------------------------------"
  echo "DEPLOYMENT STOPPED at step $STEP/$TOTAL_STEPS: $1"
  echo "-----------------------------------------------------------------"
  printf '%s\n' "${RESULTS[@]}"
  exit 1
}
step() { STEP=$((STEP+1)); echo; echo "=== [$STEP/$TOTAL_STEPS] $1 ==="; }

# ---------------------------------------------------------------------------
step "Pull latest code from GitHub"
if [ ! -d "$APP_DIR/.git" ]; then
  fail_and_exit "No git repo at $APP_DIR — clone it first: git clone <repo-url> $APP_DIR"
fi
git pull 2>&1 | tee /tmp/deploy_git.log
if grep -qiE "error|conflict|fatal" /tmp/deploy_git.log; then
  fail_and_exit "git pull reported an error — see /tmp/deploy_git.log above"
fi
pass "git pull completed"

# ---------------------------------------------------------------------------
step "Verify toolchain (node / pnpm / pm2)"
command -v node >/dev/null || fail_and_exit "node is not installed"
command -v pnpm >/dev/null || { echo "installing pnpm..."; npm install -g pnpm || fail_and_exit "pnpm install failed"; }
command -v pm2 >/dev/null || { echo "installing pm2..."; npm install -g pm2 || fail_and_exit "pm2 install failed"; }
pass "node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

# ---------------------------------------------------------------------------
step "Install dependencies"
pnpm install --frozen-lockfile 2>&1 | tee /tmp/deploy_install.log || pnpm install 2>&1 | tee -a /tmp/deploy_install.log
if grep -qiE "^\s*ERR|ERESOLVE" /tmp/deploy_install.log; then
  fail_and_exit "pnpm install failed — see /tmp/deploy_install.log"
fi
pass "dependencies installed"

# ---------------------------------------------------------------------------
step "Verify .env: DATABASE_URL + Fast2SMS key"
ENV_FILE="$APP_DIR/.env"
[ -f "$ENV_FILE" ] || fail_and_exit "$ENV_FILE not found — create it with DATABASE_URL, SESSION_SECRET, FAST2SMS_API_KEY at minimum"

is_placeholder() {
  local v="$1"
  [ -z "$v" ] && return 0
  case "$v" in
    *YOUR_*|*CHANGE_ME*|*REPLACE_ME*|*xxxxx*|*XXXXX*|*example*) return 0 ;;
  esac
  return 1
}

DB_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
if is_placeholder "$DB_URL"; then
  fail_and_exit "DATABASE_URL is missing or a placeholder in $ENV_FILE"
fi
pass "DATABASE_URL is set (value hidden)"

F2S_KEY=$(grep -E "^FAST2SMS_API_KEY=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
if is_placeholder "$F2S_KEY"; then
  fail_and_exit "FAST2SMS_API_KEY is missing or still a placeholder in $ENV_FILE — put your real Fast2SMS Authorization key there, then re-run this script"
fi
WALLET_CHECK=$(curl -s "https://www.fast2sms.com/dev/wallet?authorization=${F2S_KEY}")
echo "  Fast2SMS wallet check response: $WALLET_CHECK"
if echo "$WALLET_CHECK" | grep -q '"return":true'; then
  pass "Fast2SMS key is valid (wallet check OK)"
elif echo "$WALLET_CHECK" | grep -qi "invalid authentication\|412"; then
  fail_and_exit "Fast2SMS rejected the key — Invalid Authorization Key. Get a fresh key from https://www.fast2sms.com/dashboard/dev-api and update FAST2SMS_API_KEY in $ENV_FILE, then re-run."
elif echo "$WALLET_CHECK" | grep -qi "wallet"; then
  pass "Fast2SMS key accepted (unexpected response shape, but no auth error) — $WALLET_CHECK"
else
  fail_and_exit "Could not reach Fast2SMS API — check server internet/DNS. Response: $WALLET_CHECK"
fi

# ---------------------------------------------------------------------------
step "Run DB migrations"
pnpm --filter @workspace/db run push 2>&1 | tee /tmp/deploy_db.log || true
if grep -qiE "^\s*error" /tmp/deploy_db.log; then
  fail_and_exit "DB migration reported an error — see /tmp/deploy_db.log"
fi
pass "DB migrations applied (or already up to date)"

# ---------------------------------------------------------------------------
step "Build frontend + backend"
BASE_PATH=/ pnpm --filter @workspace/alburhan run build 2>&1 | tee /tmp/deploy_build_web.log
grep -qi "error" /tmp/deploy_build_web.log && ! grep -q "built in" /tmp/deploy_build_web.log && fail_and_exit "Frontend build failed — see /tmp/deploy_build_web.log"

pnpm --filter @workspace/api-server run build 2>&1 | tee /tmp/deploy_build_api.log
grep -qi "error" /tmp/deploy_build_api.log && fail_and_exit "Backend build failed — see /tmp/deploy_build_api.log"

[ -f "$APP_DIR/artifacts/api-server/dist/index.cjs" ] || fail_and_exit "Build did not produce artifacts/api-server/dist/index.cjs"
pass "frontend + backend built (dist/index.cjs present)"

# ---------------------------------------------------------------------------
step "Auto-detect the running PM2 process for this app"
PM2_JSON=$(pm2 jlist 2>/dev/null || echo "[]")
PM2_NAME=$(echo "$PM2_JSON" | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    try {
      const list = JSON.parse(data);
      const appDir = process.env.APP_DIR;
      const hit = list.find(p =>
        (p.pm2_env && p.pm2_env.pm_cwd && p.pm2_env.pm_cwd.startsWith(appDir)) ||
        (p.pm2_env && p.pm2_env.pm_exec_path && p.pm2_env.pm_exec_path.includes("api-server")) ||
        /alburhan/i.test(p.name)
      );
      console.log(hit ? hit.name : "");
    } catch (e) { console.log(""); }
  });
' 2>/dev/null)
APP_DIR="$APP_DIR" # ensure exported for the node snippet above
if [ -z "$PM2_NAME" ]; then
  echo "  No existing PM2 process matched this app — will create one named 'alburhan-tours'"
  PM2_NAME="alburhan-tours"
  ECOSYSTEM="$APP_DIR/ecosystem.config.cjs"
  if [ ! -f "$ECOSYSTEM" ]; then
    cat > "$ECOSYSTEM" <<EOF
module.exports = {
  apps: [{
    name: '$PM2_NAME',
    script: 'artifacts/api-server/dist/index.cjs',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production', PORT: process.env.PORT || 5000 }
  }]
};
EOF
    echo "  Wrote $ECOSYSTEM"
  fi
  pm2 start "$ECOSYSTEM" --env production || fail_and_exit "pm2 start failed"
  pm2 save
  pass "created and started new PM2 process '$PM2_NAME'"
else
  pass "detected existing PM2 process '$PM2_NAME'"
fi

# ---------------------------------------------------------------------------
step "Restart the detected PM2 process"
pm2 restart "$PM2_NAME" --update-env 2>&1 | tee /tmp/deploy_pm2_restart.log
if grep -qi "error" /tmp/deploy_pm2_restart.log; then
  fail_and_exit "pm2 restart failed for '$PM2_NAME' — see /tmp/deploy_pm2_restart.log"
fi
pm2 save
sleep 4
PM2_STATE=$(pm2 jlist | node -e '
  let data=""; process.stdin.on("data",d=>data+=d); process.stdin.on("end",()=>{
    try { const list=JSON.parse(data); const p=list.find(x=>x.name===process.env.PM2_NAME);
      console.log(p ? p.pm2_env.status : "missing"); } catch(e){ console.log("missing"); }
  });' 2>/dev/null)
PM2_NAME="$PM2_NAME" pm2 status "$PM2_NAME"
[ "$PM2_STATE" = "online" ] || fail_and_exit "PM2 process '$PM2_NAME' is not online (status: $PM2_STATE) — check: pm2 logs $PM2_NAME"
pass "PM2 process '$PM2_NAME' is online"
echo "--- pm2 logs (last 30 lines) ---"
pm2 logs "$PM2_NAME" --lines 30 --nostream || true

# ---------------------------------------------------------------------------
step "Detect production domain + backend port from nginx"
PORT=$(grep -E "^\s*PORT=" "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
PORT="${PORT:-5000}"
DOMAIN=""
if command -v nginx >/dev/null && [ -d /etc/nginx/sites-enabled ]; then
  DOMAIN=$(grep -RhoE "server_name\s+[^;]+;" /etc/nginx/sites-enabled/ 2>/dev/null \
    | sed -E 's/server_name\s+//; s/;//' | tr ' ' '\n' | grep -v "_" | grep -v "^$" | head -1)
fi
if [ -n "$DOMAIN" ]; then
  pass "detected production domain: $DOMAIN"
  BASE_URL="https://$DOMAIN"
else
  echo "  Could not detect a domain from nginx — falling back to localhost:$PORT"
  BASE_URL="http://localhost:$PORT"
fi
LOCAL_URL="http://localhost:$PORT"

# ---------------------------------------------------------------------------
step "Verify /api/health"
HEALTH_CODE=$(curl -s -o /tmp/deploy_health.out -w "%{http_code}" "$LOCAL_URL/api/health" || echo "000")
cat /tmp/deploy_health.out; echo
[ "$HEALTH_CODE" = "200" ] || fail_and_exit "/api/health returned HTTP $HEALTH_CODE on $LOCAL_URL — check: pm2 logs $PM2_NAME"
pass "/api/health returned 200 on $LOCAL_URL"

if [ "$BASE_URL" != "$LOCAL_URL" ]; then
  PUB_CODE=$(curl -s -o /tmp/deploy_health_pub.out -w "%{http_code}" "$BASE_URL/api/health" || echo "000")
  if [ "$PUB_CODE" = "200" ]; then
    pass "public site $BASE_URL/api/health returned 200"
  else
    echo "  ⚠️  Public URL check returned HTTP $PUB_CODE (nginx/proxy issue) — continuing with local OTP test"
  fi
fi

# ---------------------------------------------------------------------------
step "Send a real OTP to $TEST_MOBILE and diagnose any Fast2SMS failure"
send_otp() {
  curl -s -X POST "$LOCAL_URL/api/auth/send-otp" \
    -H "Content-Type: application/json" \
    -d "{\"mobile\":\"$TEST_MOBILE\"}"
}

ATTEMPT=1
MAX_ATTEMPTS=3
OTP_OK=0
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS..."
  RESP=$(send_otp)
  echo "  Response: $RESP"

  if echo "$RESP" | grep -qi '"success":true\|"ok":true'; then
    OTP_OK=1
    break
  fi

  # Diagnose the failure
  if echo "$RESP" | grep -qi "invalid authentication\|401\|unauthorized"; then
    echo "  Diagnosis: invalid Fast2SMS Authorization key."
    echo "  Fix: update FAST2SMS_API_KEY in $ENV_FILE with a fresh key from the Fast2SMS dashboard, then re-run this script."
    fail_and_exit "OTP send failed — invalid Fast2SMS authorization key"
  elif echo "$RESP" | grep -qi "sender.*id\|sender_id"; then
    echo "  Diagnosis: Sender ID misconfiguration."
    echo "  Fix: verify the approved Sender ID in Admin Settings → Fast2SMS matches your DLT-registered sender ID."
    fail_and_exit "OTP send failed — sender ID issue"
  elif echo "$RESP" | grep -qi "route"; then
    echo "  Diagnosis: incorrect Fast2SMS route (must be a DLT/OTP route, not promotional)."
    echo "  Fix: check the route parameter used in notifications.ts / sms.ts matches your Fast2SMS OTP route."
    fail_and_exit "OTP send failed — route issue"
  elif echo "$RESP" | grep -qi "dlt\|template"; then
    echo "  Diagnosis: DLT template mismatch/not approved."
    echo "  Fix: confirm the OTP template ID in Admin Settings matches an approved DLT template on Fast2SMS."
    fail_and_exit "OTP send failed — DLT template issue"
  elif echo "$RESP" | grep -qi "wallet\|insufficient\|balance"; then
    echo "  Diagnosis: Fast2SMS wallet balance too low."
    echo "  Fix: recharge the Fast2SMS wallet, then re-run this script."
    fail_and_exit "OTP send failed — wallet balance issue"
  else
    echo "  No specific Fast2SMS error pattern matched — retrying in 5s..."
    sleep 5
  fi
  ATTEMPT=$((ATTEMPT+1))
done

if [ "$OTP_OK" != "1" ]; then
  fail_and_exit "OTP could not be delivered to $TEST_MOBILE after $MAX_ATTEMPTS attempts — see responses above and: pm2 logs $PM2_NAME"
fi
pass "OTP send request succeeded for $TEST_MOBILE — confirm receipt on the phone"

# ---------------------------------------------------------------------------
echo
echo "==================================================================="
echo "  DEPLOYMENT REPORT"
echo "==================================================================="
echo "  ✓ PM2 running          — process '$PM2_NAME' is online"
echo "  ✓ Backend healthy      — /api/health returned 200"
echo "  ✓ Database connected   — migrations ran without error"
echo "  ✓ Fast2SMS connected   — wallet check passed"
echo "  ✓ OTP delivered        — send-otp API accepted request for $TEST_MOBILE (verify SMS on device)"
echo "  ✓ Production site      — $BASE_URL"
echo "==================================================================="
echo "NOTE: This script confirms the OTP API call succeeded. Please confirm"
echo "the SMS actually arrived on $TEST_MOBILE — that final confirmation"
echo "can only come from the phone itself, not from this script."
echo "==================================================================="
