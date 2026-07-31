# Al Burhan Tours & Travels — Production Deployment Guide

## How it works

Every push (or merge) to `main` triggers **GitHub Actions**, which:

1. Checks out the source, installs deps
2. Type-checks frontend + backend
3. Builds frontend (`pnpm --filter @workspace/alburhan run build`)
4. Builds backend (`pnpm --filter @workspace/api-server run build`)
5. Validates routes, bundle size, syntax, and no-secrets
6. SSHs into the Hostinger VPS
7. Uploads compiled artifacts to a timestamped staging dir
8. Backs up the running deployment
9. Atomically swaps frontend + backend
10. Restarts only the correct PM2 process (`alburhan-api` or `alburhan-tours`)
11. Waits for `/api/health` → 200
12. Checks OAuth callback → 400
13. Checks all 5 login routes → 200
14. Auto-rolls back if any health check fails
15. Cleans staging dir; prunes old backups (keeps 5)

**Concurrency**: only one deployment runs at a time.  
A newer push cancels an older pending (not running) deployment.

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | **Production** — every push deploys automatically |
| `testing` | Optional pre-production branch — no auto-deploy |

---

## One-time VPS SSH setup

Do this **once** before the first deployment.

### A. Generate a dedicated deployment SSH key (on your local machine)

```bash
# Generate ED25519 key (no passphrase — Actions needs unattended access)
ssh-keygen -t ed25519 -C "github-actions-alburhan-deploy" \
  -f ~/.ssh/alburhan_deploy -N ""

# You now have two files:
#   ~/.ssh/alburhan_deploy      ← PRIVATE KEY (goes into GitHub secret)
#   ~/.ssh/alburhan_deploy.pub  ← PUBLIC KEY  (goes onto VPS)
```

### B. Add the public key to the VPS

```bash
# Copy public key to VPS (enter VPS root password when prompted)
ssh-copy-id -i ~/.ssh/alburhan_deploy.pub root@187.127.141.192

# OR manually append it:
cat ~/.ssh/alburhan_deploy.pub | ssh root@187.127.141.192 \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### C. Verify SSH key authentication works

```bash
ssh -i ~/.ssh/alburhan_deploy root@187.127.141.192 "echo 'SSH OK — $(hostname)'"
# Expected output: SSH OK — <your vps hostname>
```

### D. Add GitHub repository secrets

Go to **GitHub → alburhan786/alburhan-app → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|-------------|-------|
| `VPS_HOST` | `187.127.141.192` |
| `VPS_USER` | `root` |
| `VPS_PORT` | `22` |
| `VPS_APP_PATH` | `/var/www/alburhan` |
| `VPS_SSH_PRIVATE_KEY` | *(paste the full contents of `~/.ssh/alburhan_deploy`)* |

> ⚠️ The private key must include the `-----BEGIN OPENSSH PRIVATE KEY-----` header and `-----END OPENSSH PRIVATE KEY-----` footer.

### E. Ensure backup directory exists on VPS

```bash
ssh root@187.127.141.192 "mkdir -p /var/www/alburhan/backups"
```

---

## First deployment test

1. Confirm all 5 GitHub secrets are set.
2. Go to **Actions → Deploy to Production → Run workflow → Run workflow**.
3. Watch the run — each step logs its result.
4. At the end, check the **Deployment Summary** tab.

**Expected results:**

```
/api/health                                → HTTP 200
/api/social-media/oauth/meta/callback     → HTTP 400 (controlled JSON)
/admin/login                              → HTTP 200
/staff/login                              → HTTP 200
/branch/login                             → HTTP 200
/agent/login                              → HTTP 200
/customer/login                           → HTTP 200
```

---

## Everyday workflow

From now on, when you make changes in Replit:

1. Edit code in Replit as normal.
2. Commit your changes (Replit Git pane, or `git commit -am "message"`).
3. Push to `main` — either from the Git pane or:
   ```bash
   git push github main
   ```
4. GitHub Actions automatically builds, validates, and deploys to production.
5. Check the Actions tab for the result.

No more ZIPs. No more SCP. No more manual PM2 restarts.

---

## Manual rollback

If you need to roll back without GitHub:

```bash
ssh root@187.127.141.192

# List backups (newest first)
ls -1dt /var/www/alburhan/backups/*

# Roll back to the most recent backup
BACKUP=$(ls -1dt /var/www/alburhan/backups/* | head -1)
cp "${BACKUP}/index.cjs" /var/www/alburhan/artifacts/api-server/dist/index.cjs
rsync -a --delete "${BACKUP}/public/" /var/www/alburhan/artifacts/alburhan/dist/public/
pm2 restart alburhan-api --update-env
curl http://127.0.0.1:3000/api/health
```

---

## What is NEVER touched by the deploy

- `/var/www/alburhan/.env` — VPS environment file
- `/var/www/alburhan/artifacts/api-server/uploads/` — customer documents
- Database — never modified
- SSL certificates — never modified
- DNS — never modified
- Nginx config — only tested (`nginx -t`) and reloaded; never rewritten
- Unrelated PM2 processes — only `alburhan-api` / `alburhan-tours` are restarted
