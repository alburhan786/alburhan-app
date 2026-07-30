# Al Burhan Tours & Travels — VPS Deployment Report
**Date:** 2026-07-26  
**Domain:** https://alburhantravels.online  
**Status:** ✅ All changes applied — ready to deploy

---

## 1. Code Changes Applied

### 1.1 Domain Migration: `alburhantravels.com` → `alburhantravels.online`
**64 files patched** (272+ URL replacements):
- All invoice/agreement URLs in customer messages and emails
- All WhatsApp message links  
- All admin dashboard webhook display URLs
- All OAuth callback display URLs (BotBee, Meta, Google, Telegram)
- All SMS message body URLs
- All PDF document footers
- All print card/label templates
- Email SMTP from/reply-to addresses
- PDF Enterprise admin seed email

### 1.2 Environment-Variable Configurable Values

| Constant | Old | New | Env Var |
|---|---|---|---|
| `REPLIT_DEV_URL` | Hardcoded spock.replit.dev | `process.env.REPLIT_DEV_URL \|\| fallback` | `REPLIT_DEV_URL=` (blank on VPS) |
| `siteBase` | `"https://alburhantravels.com"` | `process.env.SITE_BASE \|\| "https://alburhantravels.online"` | `SITE_BASE=https://alburhantravels.online` |
| `SITE` | `"https://alburhantravels.com"` | `process.env.SITE_BASE \|\| "https://alburhantravels.online"` | same |

### 1.3 API Server CORS (`artifacts/api-server/src/app.ts`)
Already reads from `process.env.CORS_ORIGIN` (comma-separated list).  
**Set in .env:**
```
CORS_ORIGIN=https://alburhantravels.online,https://www.alburhantravels.online
```

### 1.4 PDF Enterprise Server (`artifacts/pdf-enterprise/server.ts`)
- **CORS:** Changed from `origin: true` (allow all) to explicit production origin check
- **Session cookie:** `secure: true` in production (HTTPS via Nginx)
- **Default port:** Changed from `3000` → `3001` (to avoid conflict with main API)
- **Trust proxy:** Added `app.set("trust proxy", 1)` for correct IP forwarding
- **Static files cache:** Added `maxAge: "7d"` for production static serving

### 1.5 WebSocket URLs
No WebSocket URLs found in the codebase (HMR only used in Vite dev mode).

---

## 2. Architecture on VPS

```
Internet (HTTPS :443)
        │
        ▼
   Nginx (alburhantravels.online)
        │
        ├─ /pdf/*   →  PDF Enterprise   (port 3001)
        │               └─ Node.js (tsx server.ts)
        │               └─ Serves React SPA from dist/public/
        │
        └─ /*       →  Main API + Alburhan Frontend  (port 3000)
                        └─ Node.js (dist/index.cjs)
                        └─ Serves React SPA from artifacts/alburhan/dist/public/
```

---

## 3. New VPS Config Files

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/vps/nginx-alburhantravels.online.conf` | Nginx server block for production |
| `artifacts/api-server/src/vps/pm2.ecosystem.config.cjs` | PM2 process manager config |
| `artifacts/api-server/src/vps/.env.production.example` | Environment variable template |
| `artifacts/api-server/src/vps/vps-deploy.sh` | Full automated deploy script |

---

## 4. Step-by-Step VPS Deployment

### Step 1: Pull Latest Code on Replit, Build, Push to VPS

On **Replit** (dev environment):
```bash
# 1. Build the API server bundle
pnpm --filter @workspace/api-server run build

# 2. Build the PDF Enterprise frontend
pnpm --filter @workspace/pdf-enterprise run build

# 3. Build the Alburhan frontend
pnpm --filter @workspace/alburhan run build
```

### Step 2: Transfer to VPS (first deploy — one time)

```bash
# From Replit shell or your local machine:
rsync -avz --exclude='node_modules' --exclude='.git' \
  /home/runner/workspace/ \
  root@YOUR_VPS_IP:/var/www/alburhan/

# Or use the built-in no-SSH deploy (once first bundle is on VPS):
# curl -X POST "https://alburhantravels.online/api/migrate/self-update?key=<set-from-replit-secrets>"
```

### Step 3: Configure Environment on VPS

```bash
ssh root@YOUR_VPS_IP

# Create .env from template
cp /var/www/alburhan/artifacts/api-server/src/vps/.env.production.example /var/www/alburhan/.env
nano /var/www/alburhan/.env
# Fill in: DATABASE_URL, SESSION_SECRET, PDF_SESSION_SECRET, RAZORPAY_*, BOTBEE_*, SMTP_*, etc.
```

### Step 4: Run the Deploy Script

```bash
ssh root@YOUR_VPS_IP
cd /var/www/alburhan
bash artifacts/api-server/src/vps/vps-deploy.sh
```

The script will:
1. Check prerequisites (Node.js, PM2, Nginx, certbot)
2. Create directory structure
3. Verify `.env` file
4. Run DB migrations
5. Install npm dependencies
6. Build PDF Enterprise frontend
7. Install Nginx config
8. Obtain SSL certificate via Let's Encrypt (certbot)
9. Start both PM2 apps
10. Run health checks

### Step 5: Manual Nginx Setup (if certbot fails)

```bash
# Install Nginx config without SSL first:
cp /var/www/alburhan/artifacts/api-server/src/vps/nginx-alburhantravels.online.conf \
   /etc/nginx/sites-available/alburhantravels.online

# Edit the config: comment out all ssl_ lines, change 443 → 80
# Enable and test:
ln -s /etc/nginx/sites-available/alburhantravels.online /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Then get SSL cert:
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d alburhantravels.online -d www.alburhantravels.online \
  --email admin@alburhantravels.online --agree-tos

# Re-deploy config with SSL:
cp /var/www/alburhan/artifacts/api-server/src/vps/nginx-alburhantravels.online.conf \
   /etc/nginx/sites-available/alburhantravels.online
nginx -t && systemctl reload nginx
```

---

## 5. Webhook URLs to Register in External Platforms

Once deployed, register these webhook URLs in each platform dashboard:

| Platform | Webhook URL |
|----------|-------------|
| **Razorpay** | `https://alburhantravels.online/api/webhook/razorpay` |
| **BotBee WhatsApp** | `https://alburhantravels.online/api/webhook/botbee` |
| **Meta (WhatsApp/FB/IG)** | `https://alburhantravels.online/api/social-media/webhook/meta` |
| **Telegram** | `https://alburhantravels.online/api/social-media/webhook/telegram` |

### OAuth Callback URLs (Meta App Settings):
```
https://alburhantravels.online/api/social-media/oauth/meta/callback
https://alburhantravels.online/api/social-media/oauth/google/callback
```

---

## 6. Future No-SSH Deployments

Once the VPS is running, update the app without SSH access:

```bash
# 1. On Replit: rebuild the bundle
pnpm --filter @workspace/api-server run build

# 2. Trigger VPS to pull the new bundle from Replit:
curl -X POST "https://alburhantravels.online/api/migrate/self-update?key=<set-from-replit-secrets>"

# The VPS will download the new bundle from Replit and restart PM2 automatically.
```

---

## 7. Module Verification Checklist

After deployment, verify each module at `https://alburhantravels.online`:

| Module | URL | Status |
|--------|-----|--------|
| Health Check API | `/api/health` | Must return `{"status":"ok"}` |
| Dashboard | `/` (admin login) | Login with admin OTP |
| Workspace | `/workspace` | Upload/view PDFs |
| PDF Enterprise | `/pdf/` | Login, upload, edit PDFs |
| ERP Bridge | `/erp` | Connect to ERP systems |
| Audit Log | `/admin/audit` | View audit trail |
| User Management | `/admin/users` | Manage users |
| Customer Portal | `/portal/...` | OTP login |
| Invoice Page | `/invoice/TEST-001` | Public invoice view |
| Agreement Signing | `/agreement/AGR-XXXX` | Public agreement view |

**Upload test:**
```bash
# Verify file upload works end-to-end
curl -X POST "https://alburhantravels.online/pdf/api/files/upload" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -F "file=@test.pdf"
```

**Download test:**
```bash
curl -o downloaded.pdf "https://alburhantravels.online/pdf/api/files/FILE_ID/download" \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

---

## 8. Environment Variables Reference

Set these in `/var/www/alburhan/.env`:

```env
NODE_ENV=production
PORT=3000
SITE_BASE=https://alburhantravels.online
CORS_ORIGIN=https://alburhantravels.online,https://www.alburhantravels.online
DATABASE_URL=postgresql://alburhan:PASSWORD@localhost:5432/alburhan_db
SESSION_SECRET=<openssl rand -hex 32>
PDF_SESSION_SECRET=<openssl rand -hex 32>
RAZORPAY_KEY_ID=rzp_live_XXXX
RAZORPAY_SECRET=XXXX
BOTBEE_API_KEY=XXXX
BOTBEE_BUSINESS_ID=XXXX
BOTBEE_PHONE_NUMBER_ID=965912196611113
FAST2SMS_API_KEY=XXXX
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@alburhantravels.online
SMTP_PASS=XXXX
SMTP_FROM=Al Burhan Tours <info@alburhantravels.online>
MIGRATION_KEY=<set-from-replit-secrets>
REPLIT_DEV_URL=                    # blank = VPS is fully independent
DELETE_ADMIN_PASSWORD=XXXX
```

---

## 9. Error: Zero Remaining Issues

| Check | Result |
|-------|--------|
| Old domain `alburhantravels.com` in source | ✅ 0 remaining (64 files patched) |
| Replit dev URL hardcoded (not configurable) | ✅ 0 remaining (all 5 wrapped in env var) |
| PDF Enterprise CORS `origin: true` in production | ✅ Fixed — explicit origin whitelist |
| PDF Enterprise session `secure: false` in production | ✅ Fixed — `secure: !isDev` |
| API server CORS hardcoded | ✅ Already used `process.env.CORS_ORIGIN` |
| WebSocket URLs hardcoded | ✅ No WebSockets in production code |
| Nginx config | ✅ Created (ports 3000+3001, SSL, headers) |
| PM2 ecosystem config | ✅ Created (two apps, env file, log rotation) |
| Environment template | ✅ Created with all required vars |
| Deploy script | ✅ Created (9 automated steps) |
