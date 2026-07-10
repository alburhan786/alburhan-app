#!/bin/bash
# ============================================================================
# Al Burhan Tours — VPS full production recovery script
#
# Run this ON THE VPS (not in Replit) as the deploy user, e.g.:
#   cd /var/www/alburhan && bash scripts/vps-recover.sh
#
# If the repo isn't at /var/www/alburhan yet, pass its path or let it clone:
#   bash scripts/vps-recover.sh /var/www/alburhan https://github.com/you/repo.git
#
# It is safe to re-run — every step is idempotent.
# ============================================================================
set -e

APP_DIR="${1:-/var/www/alburhan}"
REPO_URL="${2:-}"
PM2_NAME="alburhan-tours"

echo "=== 1. Locate / restore project at $APP_DIR ==="
if [ ! -d "$APP_DIR/.git" ]; then
  if [ -n "$REPO_URL" ]; then
    echo "No git repo found at $APP_DIR — cloning $REPO_URL"
    sudo mkdir -p "$APP_DIR"
    sudo chown "$USER":"$USER" "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
  else
    echo "ERROR: $APP_DIR is missing or not a git repo, and no REPO_URL was given."
    echo "Re-run as: bash scripts/vps-recover.sh $APP_DIR <git-repo-url>"
    exit 1
  fi
else
  echo "Repo found at $APP_DIR — pulling latest"
  cd "$APP_DIR"
  git pull
fi

cd "$APP_DIR"

echo "=== 2. Verify Node / pnpm / pm2 are installed ==="
command -v node >/dev/null || { echo "ERROR: node not installed. See DEPLOY.md step 1."; exit 1; }
node -v
if ! command -v pnpm >/dev/null; then
  echo "pnpm missing — installing globally"
  npm install -g pnpm
fi
pnpm -v
if ! command -v pm2 >/dev/null; then
  echo "pm2 missing — installing globally"
  npm install -g pm2
fi
pm2 -v

echo "=== 3. Check .env exists (DATABASE_URL, SESSION_SECRET, FAST2SMS_API_KEY etc.) ==="
if [ ! -f "$APP_DIR/.env" ]; then
  echo "WARNING: $APP_DIR/.env is missing. The backend needs at least DATABASE_URL and SESSION_SECRET."
  echo "Copy .env.example to .env and fill it in, then re-run this script:"
  echo "  cp $APP_DIR/.env.example $APP_DIR/.env && nano $APP_DIR/.env"
else
  echo ".env found. Checking required keys are present (not showing values):"
  for key in DATABASE_URL SESSION_SECRET FAST2SMS_API_KEY BOTBEE_API_KEY RAZORPAY_KEY_ID RAZORPAY_SECRET; do
    if grep -q "^${key}=" "$APP_DIR/.env" 2>/dev/null; then
      echo "  ✅ $key is set in .env"
    else
      echo "  ⚠️  $key NOT found in .env (may be injected into the build instead, or missing)"
    fi
  done
fi

echo "=== 4. Install dependencies ==="
pnpm install --frozen-lockfile || pnpm install

echo "=== 5. Run DB migrations (safe/idempotent) ==="
pnpm --filter @workspace/db run push || echo "WARNING: db push failed — check DATABASE_URL in .env"

echo "=== 6. Build frontend + backend ==="
if [ -f "$APP_DIR/scripts/build-prod.sh" ]; then
  bash "$APP_DIR/scripts/build-prod.sh"
else
  echo "scripts/build-prod.sh not found — building manually"
  BASE_PATH=/ pnpm --filter @workspace/alburhan run build
  pnpm --filter @workspace/api-server run build
fi

if [ ! -f "$APP_DIR/artifacts/api-server/dist/index.cjs" ]; then
  echo "ERROR: build did not produce artifacts/api-server/dist/index.cjs — check build errors above."
  exit 1
fi
echo "✅ Backend bundle present: artifacts/api-server/dist/index.cjs"

echo "=== 7. Ensure ecosystem.config.cjs points at the compiled backend & correct port ==="
ECOSYSTEM="$APP_DIR/ecosystem.config.cjs"
cat > "$ECOSYSTEM" <<'EOF'
module.exports = {
  apps: [{
    name: 'alburhan-tours',
    script: 'artifacts/api-server/dist/index.cjs',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000,
    }
  }]
};
EOF
echo "✅ ecosystem.config.cjs written (script=artifacts/api-server/dist/index.cjs, PORT=5000 default)"

echo "=== 8. (Re)start with PM2 ==="
pm2 delete "$PM2_NAME" 2>/dev/null || true
pm2 start "$ECOSYSTEM" --env production
pm2 save

echo "=== 9. Wait for boot, then verify ==="
sleep 3
pm2 status "$PM2_NAME"

echo "--- pm2 logs (last 40 lines) ---"
pm2 logs "$PM2_NAME" --lines 40 --nostream || true

echo "--- curl /api/health ---"
HEALTH=$(curl -s -o /tmp/health.out -w "%{http_code}" http://localhost:5000/api/health || echo "000")
cat /tmp/health.out; echo
if [ "$HEALTH" = "200" ]; then
  echo "✅ /api/health returned 200"
else
  echo "❌ /api/health returned HTTP $HEALTH — backend is not healthy. Check 'pm2 logs $PM2_NAME' above."
  exit 1
fi

echo "=== 10. Test OTP send end-to-end ==="
read -p "Enter a 10-digit mobile number to send a test OTP to (blank to skip): " TEST_MOBILE
if [ -n "$TEST_MOBILE" ]; then
  curl -s -X POST http://localhost:5000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d "{\"mobile\":\"$TEST_MOBILE\"}" | tee /tmp/otp.out
  echo
  if grep -q '"success":true' /tmp/otp.out; then
    echo "✅ OTP send request succeeded — check the phone for the SMS/WhatsApp message."
  else
    echo "❌ OTP send failed — see response above and 'pm2 logs $PM2_NAME' for [OTP-SEND] lines."
  fi
else
  echo "Skipped live OTP test."
fi

echo "=== Recovery script complete ==="
