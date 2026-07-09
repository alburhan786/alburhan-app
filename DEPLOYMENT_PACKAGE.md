# Production Deployment Package — Payment Notification Fix

Generated: 2026-07-09

## 0. What this deploy contains

The payment-success notification pipeline was rewritten so that after a successful
Razorpay payment (full **or** partial), the server now:
1. Generates the Invoice PDF and Receipt PDF (`paymentDocs.ts`)
2. Sends the customer SMS + WhatsApp + Email (with PDF attachments) via the
   notification engine, **awaited** (no more fire-and-forget)
3. Sends the Admin alert (WhatsApp + Email + Dashboard entry)
4. Writes a `notification_logs` row per channel with status
   `Queued → Sending → Delivered/Failed` and the raw provider response
5. Adds a booking timeline entry for the payment

This replaces the old code path where all three call sites (`/verify`,
`/sync-payment`, `/webhook`) fired notifications without awaiting them and
without attachments — so a slow/failed call was silently dropped and never
retried.

Relevant commit already on `master`: **`b9074bc` — "Improve payment success
notifications and PDF generation"**. Nothing else is pending; `git status`
is clean except for a one-line fix to `ecosystem.config.cjs` (see §5).

Files touched:
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/api-server/src/lib/notificationEngine.ts`
- `artifacts/api-server/src/lib/workflowEngine.ts`
- `artifacts/api-server/src/lib/notifications.ts`
- `artifacts/api-server/src/lib/paymentDocs.ts`

---

## 1. Complete deployment commands (Ubuntu VPS)

Run these **on the VPS**, as the deploy user, from `/var/www/alburhan`:

```bash
# 0. Go to the app directory
cd /var/www/alburhan

# 1. Pull latest code
git pull origin master

# 2. Install/update dependencies (workspace-aware, deterministic)
pnpm install --frozen-lockfile

# 3. Run database migrations (safe/idempotent — only applies new columns/tables)
pnpm --filter @workspace/db run push

# 4. Build frontend + API server
bash scripts/build-prod.sh
# (equivalent to:
#   BASE_PATH=/ pnpm --filter @workspace/alburhan run build
#   pnpm --filter @workspace/api-server run build
# )

# 5. Restart the API server under PM2
pm2 restart alburhan-tours --update-env

# 6. Reload nginx (only needed if nginx config changed — safe to run anyway)
sudo nginx -t && sudo systemctl reload nginx

# 7. Health check
curl -s https://alburhantravels.com/api/communication/health | jq .
pm2 status alburhan-tours
pm2 logs alburhan-tours --lines 50 --nostream
```

If this is the **first time** deploying this app on the box, follow the
one-time VPS setup in `DEPLOY.md` first (Node 20+, pnpm, PM2, nginx,
Postgres, `.env`, `pm2 start ecosystem.config.cjs --env production`).

### Rollback (if something breaks)
```bash
cd /var/www/alburhan
git log --oneline -5          # find the previous good commit
git checkout <previous-commit-sha>
pnpm install --frozen-lockfile
bash scripts/build-prod.sh
pm2 restart alburhan-tours --update-env
```

---

## 2. Environment variables

Set these in `/var/www/alburhan/.env` (loaded by PM2 via `ecosystem.config.cjs`).
**Only the variables actually read by the code are listed as required** — a few
you asked about (`JWT_SECRET`, `META_WHATSAPP_TOKEN`, `RCS_API_KEY`, `CRON *`)
don't exist in this codebase; the real equivalents are noted below so you don't
set dead variables.

### Required — core

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | your VPS/managed Postgres, not Replit's |
| `SESSION_SECRET` | Express session signing | long random string (`openssl rand -hex 32`). *(This is the "JWT_SECRET" equivalent — the app uses signed sessions, not JWTs.)* |
| `NODE_ENV` | `production` | |
| `PORT` | `5000` | must match nginx `proxy_pass` and `ecosystem.config.cjs` |
| `CORS_ORIGIN` | `https://alburhantravels.com,https://www.alburhantravels.com` | |
| `UPLOADS_DIR` | e.g. `/var/www/alburhan/uploads` | |
| `STATIC_FILES_DIR` | e.g. `/var/www/alburhan/artifacts/alburhan/dist/public` | |

### Required — payments
| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay key id |
| `RAZORPAY_SECRET` | Razorpay key secret *(you called this `RAZORPAY_KEY_SECRET` — same value, the code reads `RAZORPAY_SECRET`)* |

### Required — notifications (this fix depends on these)
| Variable | Purpose |
|---|---|
| `FAST2SMS_API_KEY` | SMS provider |
| `BOTBEE_API_KEY` | WhatsApp provider |
| `BOTBEE_BUSINESS_ID` | WhatsApp provider |
| `BOTBEE_PHONE_NUMBER_ID` | WhatsApp provider |
| `SMTP_HOST` | Email — **currently unset, blocks email sending** |
| `SMTP_PORT` | Email |
| `SMTP_USER` | Email |
| `SMTP_PASS` | Email |
| `SMTP_FROM` | "From" address shown to customers (falls back to `SMTP_USER` if unset — set explicitly for a branded sender) |

> **Action needed from you:** SMTP is not yet configured anywhere (dev or
> prod). Send me the host/port/user/pass/from and I'll add them as secrets
> here and wire them in; until then, email delivery will show `Failed` in
> the notification logs (SMS/WhatsApp/PDF/timeline/admin-alerts are
> unaffected and will work without SMTP).

### Optional — only if you use these features
| Variable | Purpose |
|---|---|
| `FAST2SMS_XXL_API_KEY` | Only if using Fast2SMS's XXL/long-message tier |
| `LEMIN_USER_ID`, `LEMIN_API_KEY`, `LEMIN_API_URL`, `LEMIN_TEMPLATE_ID` | RCS Business Messaging via Lemin AI *(this is the actual "RCS_API_KEY" — the code doesn't use Meta RCS directly)* |
| `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `FIREBASE_SENDER_ID`, `FIREBASE_SERVER_KEY` | Push notifications |
| `ADMIN_MOBILE` | Where admin SMS/WhatsApp alerts are sent |
| `MIGRATION_KEY` | Protects the temporary `/api/migrate/*` diagnostic endpoints — should be a long random value, or removed after this migration (see §5) |
| `DELETE_ADMIN_PASSWORD` | Protects a destructive admin endpoint |
| `PUBLIC_DOMAIN` / `SITE_URL` | Used to build absolute links (invoice/dashboard links) in SMS/WhatsApp/Email — set to `https://alburhantravels.com` |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | Only relevant on Replit; leave blank on VPS (uploads fall back to disk) |
| `PAYMENT_REMINDERS_ENABLED` | Toggles the payment-due reminder cron |

### Not used by this codebase (safe to ignore)
`JWT_SECRET`, `META_WHATSAPP_TOKEN`, `RAZORPAY_KEY_SECRET` (use `RAZORPAY_SECRET`
instead), `RCS_API_KEY` (use `LEMIN_*` instead), and any `CRON_*` variable —
scheduled jobs are wired in-process (node-cron style) and controlled only by
`PAYMENT_REMINDERS_ENABLED`, not by env-configured cron strings.

---

## 3. Code-completeness check

- `git status` is clean on `master`; the notification fix (commit `b9074bc`)
  and all dependent files are committed — nothing is stuck uncommitted in
  this dev environment.
- `pnpm --filter @workspace/api-server run build` succeeds cleanly with no
  new TypeScript errors introduced by the fix.
- Found and fixed one unrelated issue while preparing this package:
  `ecosystem.config.cjs` had gotten corrupted (an old unrelated task
  description had been prepended to the file, though the actual
  `module.exports` config at the bottom was intact and still worked). It's
  fixed now — pull will bring in the clean version.
- SMTP is the only missing piece — see the callout in §2. Everything else
  needed for SMS, WhatsApp, PDF invoices/receipts, admin alerts, and
  dashboard/timeline entries is in place and will work as soon as this
  build is deployed with the existing Fast2SMS/BotBee/Razorpay credentials.

---

## 4. Post-deployment verification checklist

Run through this immediately after `pm2 restart`:

1. **Service up**
   - [ ] `pm2 status alburhan-tours` shows `online`, 0 restarts since deploy
   - [ ] `curl -s https://alburhantravels.com/api/communication/health` returns
     `BotBee`, `Fast2SMS` as `"online"` (SMTP will show `"offline"` until
     credentials are set)
2. **Real ₹10 payment test**
   - [ ] Create a real booking, pay ₹10 via the live Razorpay checkout
   - [ ] Payment appears in `payment_transactions` table with correct amount/status
   - [ ] Booking's `paid_amount` / status updates correctly (full vs partial)
   - [ ] Invoice PDF and Receipt PDF are generated and downloadable from the
     customer dashboard
   - [ ] Customer receives SMS ("Payment Received..." template)
   - [ ] Customer receives WhatsApp message with amount/balance/booking number
   - [ ] Customer receives Email with PDF invoice + receipt attached
     *(will fail/skip until SMTP is configured — expected)*
   - [ ] Admin receives WhatsApp + Email alert for the payment
   - [ ] Booking timeline shows a new "Payment Received" / "Partial Payment
     Received" entry
   - [ ] `notification_logs` table has one row per channel (SMS, WhatsApp,
     Email) with status `Delivered` (or `Failed` + provider response, for
     SMTP specifically) and no duplicate/missing rows
3. **Regression checks**
   - [ ] Existing bookings/login/dashboard pages still load
   - [ ] No new errors in `pm2 logs alburhan-tours --lines 200`
   - [ ] nginx serving the site over HTTPS without certificate warnings

Once you've deployed, tell me and I'll walk through the `notification_logs`
table with you (or you can share `pm2 logs` output) so we can confirm the
₹10 test fully succeeded end-to-end, and finish the final report you
requested (root cause, files changed, APIs fixed, notification logs, test
results).
