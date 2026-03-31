# Hostinger VPS Deployment Guide — Al Burhan Tours & Travels

## Architecture

On the VPS, a single Express process serves:
- All API routes under `/api/*`
- The built React frontend (static files) for all other routes
- Uploaded files (images, documents) from the `uploads/` directory

PM2 manages the process and nginx acts as a reverse proxy.

---

## VPS Setup (one-time)

### 1. Install Node.js 20+
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # should print v20.x.x or higher
```

### 2. Install pnpm
```bash
npm install -g pnpm
```

### 3. Install PM2
```bash
npm install -g pm2
```

### 4. Install nginx
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 5. Set up PostgreSQL
Either install locally or point to an external hosted DB (e.g. Supabase, Neon, Hostinger MySQL → use a managed Postgres service).

```bash
# Local Postgres option:
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER alburhan WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE alburhan_db OWNER alburhan;"
```

---

## First Deployment

### 1. Upload the project
```bash
# From your local machine (or use Git):
scp -r . user@your-vps-ip:/var/www/alburhan

# Or via Git:
git clone https://github.com/yourrepo/alburhan.git /var/www/alburhan
```

### 2. Set up environment variables
```bash
cd /var/www/alburhan
cp .env.example .env
nano .env   # Fill in all required values
```

Required values to fill in:
- `DATABASE_URL` — your PostgreSQL connection string
- `SESSION_SECRET` — a long random string (run: `openssl rand -hex 32`)
- `CORS_ORIGIN` — `https://alburhantravels.com,https://www.alburhantravels.com`
- `RAZORPAY_KEY_ID` and `RAZORPAY_SECRET`
- `FAST2SMS_API_KEY`
- `BOTBEE_API_KEY`, `BOTBEE_BUSINESS_ID`, `BOTBEE_PHONE_NUMBER_ID`
- `UPLOADS_DIR` — e.g. `/var/www/alburhan/uploads`
- `STATIC_FILES_DIR` — e.g. `/var/www/alburhan/artifacts/alburhan/dist/public`

### 3. Create the uploads directory
```bash
mkdir -p /var/www/alburhan/uploads
chmod 755 /var/www/alburhan/uploads
```

### 4. Install dependencies
```bash
cd /var/www/alburhan
pnpm install
```

### 5. Run database migrations
```bash
pnpm --filter @workspace/db run push
```

### 6. Build the app
```bash
bash scripts/build-prod.sh
```

This builds:
- React frontend → `artifacts/alburhan/dist/public/`
- API server → `artifacts/api-server/dist/index.cjs`

### 7. Start with PM2
```bash
# Load .env into PM2 process
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list (survives reboots)
pm2 save

# Register PM2 startup script
pm2 startup
# Copy and run the command it prints
```

### 8. Configure nginx
```bash
sudo nano /etc/nginx/sites-available/alburhan
```

Paste:
```nginx
server {
    listen 80;
    server_name alburhantravels.com www.alburhantravels.com;

    # Increase max upload size for document and image uploads
    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/alburhan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Enable HTTPS with Let's Encrypt
```bash
sudo certbot --nginx -d alburhantravels.com -d www.alburhantravels.com
```

Certbot will automatically update the nginx config with SSL.

---

## Updating the Deployment

```bash
cd /var/www/alburhan
git pull
pnpm install
bash scripts/build-prod.sh
pm2 restart alburhan-tours
```

---

## Useful PM2 Commands

```bash
pm2 status              # Check app status
pm2 logs alburhan-tours # View live logs
pm2 restart alburhan-tours
pm2 stop alburhan-tours
pm2 delete alburhan-tours
```

---

## Environment Notes

| Variable | Replit | VPS |
|---|---|---|
| `PORT` | Set by Replit automatically | Set in `.env` or `ecosystem.config.cjs` |
| `DATABASE_URL` | Replit managed DB | Your PostgreSQL connection string |
| `NODE_ENV` | `development` (dev) | `production` |
| `CORS_ORIGIN` | Not set (allows all) | `https://alburhantravels.com` |
| `UPLOADS_DIR` | `../../uploads` (relative) | Absolute path e.g. `/var/www/alburhan/uploads` |
| `STATIC_FILES_DIR` | Not needed (separate dev servers) | Absolute path to React build output |

---

## Persistent File Storage

Uploaded images and documents go to `UPLOADS_DIR`. Back them up regularly:

```bash
# Example: rsync to a backup location daily
rsync -av /var/www/alburhan/uploads/ /backups/alburhan-uploads/
```

Or use a cron job:
```bash
crontab -e
# Add:
0 2 * * * rsync -av /var/www/alburhan/uploads/ /backups/alburhan-uploads/
```
