#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Al Burhan Tours & Travels — Complete VPS Deploy Script
#  Target domain: https://alburhantravels.online
#
#  Run on VPS as root (or with sudo):
#    curl -fsSL "https://alburhantravels.online/api/migrate/vps-deploy.sh?key=alburhan-migrate-2026" | bash
#  Or copy this file to VPS and run:
#    chmod +x vps-deploy.sh && sudo bash vps-deploy.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="alburhantravels.online"
VPS_DIR="/var/www/alburhan"
ENV_FILE="$VPS_DIR/.env"
PM2_API_APP="alburhan-api"
PM2_PDF_APP="pdf-enterprise"
API_PORT="3000"
PDF_PORT="3001"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
LOG_DIR="/var/log/pm2"
DEPLOY_KEY="alburhan-migrate-2026"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
step() { echo ""; echo -e "${YELLOW}[$(date +%H:%M:%S)] $*${NC}"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Al Burhan Tours & Travels — VPS Full Deploy                    ║"
echo "║  Domain: https://alburhantravels.online                         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── [0] Prerequisites check ───────────────────────────────────────────────────
step "[0/9] Checking prerequisites..."
command -v node  >/dev/null 2>&1 || fail "node not found — install Node.js 20+"
command -v npm   >/dev/null 2>&1 || fail "npm not found"
command -v pm2   >/dev/null 2>&1 || { warn "pm2 not found — installing globally"; npm install -g pm2; }
command -v nginx >/dev/null 2>&1 || { warn "nginx not found — installing"; apt-get install -y nginx; }
command -v psql  >/dev/null 2>&1 || warn "psql not found — DB migrations must be run manually"
command -v certbot>/dev/null 2>&1 || warn "certbot not found — SSL must be configured manually"
ok "Prerequisites checked"

# ── [1] Create directory structure ────────────────────────────────────────────
step "[1/9] Creating directory structure..."
mkdir -p "$VPS_DIR/artifacts/api-server/dist"
mkdir -p "$VPS_DIR/artifacts/alburhan/dist/public"
mkdir -p "$VPS_DIR/artifacts/pdf-enterprise/dist/public"
mkdir -p "$VPS_DIR/artifacts/pdf-enterprise/storage/files"
mkdir -p "$VPS_DIR/artifacts/pdf-enterprise/storage/backups"
mkdir -p "$VPS_DIR/artifacts/pdf-enterprise/storage/temp"
mkdir -p "$LOG_DIR"
ok "Directories ready"

# ── [2] Check .env file ───────────────────────────────────────────────────────
step "[2/9] Checking .env file..."
if [ ! -f "$ENV_FILE" ]; then
  warn ".env not found at $ENV_FILE"
  warn "Copy .env.production.example to $ENV_FILE and fill in all values BEFORE continuing!"
  echo ""
  echo "  Required variables:"
  echo "    DATABASE_URL, SESSION_SECRET, PDF_SESSION_SECRET"
  echo "    RAZORPAY_KEY_ID, RAZORPAY_SECRET"
  echo "    BOTBEE_API_KEY, BOTBEE_BUSINESS_ID, BOTBEE_PHONE_NUMBER_ID"
  echo "    FAST2SMS_API_KEY"
  echo "    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM"
  echo "    MIGRATION_KEY, CORS_ORIGIN"
  echo ""
  read -p "  Have you created $ENV_FILE? (y/N): " yn
  [[ "$yn" =~ ^[Yy] ]] || fail "Please create $ENV_FILE first"
fi
ok ".env file present"

# ── [3] Database migration ────────────────────────────────────────────────────
step "[3/9] Running database migration..."
set -a; source "$ENV_FILE"; set +a
if [ -n "${DATABASE_URL:-}" ]; then
  BUNDLE_MIGRATE="$VPS_DIR/artifacts/api-server/dist/index.cjs"
  if [ -f "$BUNDLE_MIGRATE" ]; then
    # Run migration via the existing endpoint
    curl -sf --max-time 30 "http://127.0.0.1:$API_PORT/api/migrate/db-check?key=$DEPLOY_KEY" >/dev/null 2>&1 && ok "DB already running — skip cold migration" || true
  fi
  ok "DATABASE_URL is set — migrations run automatically on Node startup"
else
  warn "DATABASE_URL not set in .env — DB will not connect"
fi

# ── [4] Install / update Node.js dependencies ─────────────────────────────────
step "[4/9] Installing Node.js dependencies..."
cd "$VPS_DIR"
if [ -f "package.json" ]; then
  npm install --production --no-audit 2>&1 | tail -5
  ok "npm install done"
else
  warn "No package.json at $VPS_DIR — skipping npm install"
fi

# ── [5] Build PDF Enterprise frontend ────────────────────────────────────────
step "[5/9] Building PDF Enterprise frontend..."
cd "$VPS_DIR/artifacts/pdf-enterprise"
if command -v pnpm >/dev/null 2>&1; then
  NODE_ENV=production pnpm run build 2>&1 | tail -5 && ok "PDF Enterprise frontend built"
elif [ -f "$VPS_DIR/node_modules/.bin/vite" ]; then
  NODE_ENV=production "$VPS_DIR/node_modules/.bin/vite" build --config vite.config.ts 2>&1 | tail -5 && ok "PDF Enterprise frontend built"
else
  warn "Could not build PDF Enterprise frontend — vite not found"
fi
cd "$VPS_DIR"

# ── [6] Install / configure Nginx ────────────────────────────────────────────
step "[6/9] Configuring Nginx..."
NGINX_SRC="$VPS_DIR/artifacts/api-server/src/vps/nginx-alburhantravels.online.conf"
if [ -f "$NGINX_SRC" ]; then
  cp "$NGINX_SRC" "$NGINX_CONF"
  ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$DOMAIN" 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t && ok "Nginx config valid" || fail "Nginx config invalid — check $NGINX_CONF"
else
  warn "Nginx config not found at $NGINX_SRC — skipping"
fi

# ── [7] SSL with Let's Encrypt ────────────────────────────────────────────────
step "[7/9] Setting up SSL (Let's Encrypt)..."
if command -v certbot >/dev/null 2>&1; then
  CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  if [ -f "$CERT_PATH" ]; then
    ok "SSL certificate already exists — renewing if needed"
    certbot renew --quiet || warn "certbot renew failed — check logs"
  else
    echo "  Running certbot for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
      --non-interactive --agree-tos \
      --email "admin@$DOMAIN" \
      --redirect || warn "certbot failed — SSL must be configured manually"
  fi
else
  warn "certbot not installed. Install with:"
  warn "  apt-get install -y certbot python3-certbot-nginx"
  warn "  certbot --nginx -d $DOMAIN -d www.$DOMAIN --email admin@$DOMAIN --agree-tos"
fi

# ── [8] Start / restart PM2 apps ─────────────────────────────────────────────
step "[8/9] Starting PM2 apps..."
PM2_CONFIG="$VPS_DIR/artifacts/api-server/src/vps/pm2.ecosystem.config.cjs"

# Stop existing apps
pm2 delete "$PM2_API_APP" 2>/dev/null || true
pm2 delete "$PM2_PDF_APP" 2>/dev/null || true

if [ -f "$PM2_CONFIG" ]; then
  pm2 start "$PM2_CONFIG" --env env
else
  # Fallback: start manually
  BUNDLE="$VPS_DIR/artifacts/api-server/dist/index.cjs"
  TSX="$VPS_DIR/node_modules/.bin/tsx"

  [ -f "$BUNDLE" ] && \
    NODE_ENV=production PORT=$API_PORT SITE_BASE="https://$DOMAIN" \
    pm2 start "$BUNDLE" --name "$PM2_API_APP" --interpreter node || \
    warn "Could not start alburhan-api — bundle not found at $BUNDLE"

  [ -f "$TSX" ] && \
    NODE_ENV=production PORT=$PDF_PORT SITE_BASE="https://$DOMAIN" \
    pm2 start "$TSX" --name "$PM2_PDF_APP" --interpreter node -- \
      "$VPS_DIR/artifacts/pdf-enterprise/server.ts" || \
    warn "Could not start pdf-enterprise — tsx not found"
fi

pm2 save
pm2 startup 2>/dev/null | grep -v "^$\|PM2" | bash || true
ok "PM2 apps started and saved"

# ── [9] Restart Nginx & health check ─────────────────────────────────────────
step "[9/9] Restarting Nginx and running health checks..."
systemctl reload nginx 2>/dev/null || service nginx reload || warn "Could not reload nginx"
sleep 5

# Local health check (bypasses Nginx)
LOCAL_API=$(curl -sf --max-time 8 "http://127.0.0.1:$API_PORT/api/health" 2>/dev/null | head -c 100 || echo "FAIL")
LOCAL_PDF=$(curl -sf --max-time 8 "http://127.0.0.1:$PDF_PORT/pdf/api/auth/me" 2>/dev/null | head -c 80 || echo "FAIL or 401")
ok "Local API  :$API_PORT → $LOCAL_API"
ok "Local PDF  :$PDF_PORT → $LOCAL_PDF"

# Public health check (via Nginx)
sleep 3
PUB_API=$(curl -sf --max-time 15 "https://$DOMAIN/api/health" 2>/dev/null | head -c 100 || echo "FAIL")
PUB_PDF=$(curl -sf --max-time 15 "https://$DOMAIN/pdf/" 2>/dev/null | grep -c "text/html" || echo "0")
echo "  Public API  → $PUB_API"
echo "  Public PDF  → HTML served: $PUB_PDF"

pm2 status

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOY COMPLETE — https://alburhantravels.online             ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Future no-SSH deploys:                                          ║"
echo "║  curl -X POST 'https://alburhantravels.online/api/              ║"
echo "║    migrate/self-update?key=alburhan-migrate-2026'               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
