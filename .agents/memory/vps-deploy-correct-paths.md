---
name: VPS correct deployment paths
description: VPS PM2 exec cwd is /root, API bundle path is in /var/www/alburhan/artifacts/api-server/dist/
---

# VPS Correct Deployment Paths

**Why:** Direct SCP deploys were going to wrong paths; self-update endpoint handles copy internally.

## PM2 Process Details
- **Script path**: `/var/www/alburhan/artifacts/api-server/dist/index.cjs`
- **exec cwd**: `/root` (NOT `/var/www/alburhan`)

## Correct Direct Deploy Paths
1. **API bundle**: `gunzip > /var/www/alburhan/artifacts/api-server/dist/index.cjs`
2. **Frontend tar**: `tar xzf ... -C /root/artifacts/alburhan/dist/` → lands at `/root/artifacts/alburhan/dist/public/`

## Wrong paths (cause silent failures)
- `/var/www/alburhan/dist/index.cjs` → self-update endpoint reads here then copies, but direct deploy to this path misses PM2
- `/var/www/alburhan/artifacts/alburhan/dist/public/` → wrong frontend path; cwd is /root

## Self-Update Flow
Self-update endpoint: POST /api/migrate/self-update → downloads bundle → writes to `/var/www/alburhan/dist/index.cjs` → copies to `/var/www/alburhan/artifacts/api-server/dist/index.cjs` → process.exit(0) → PM2 restarts

## Verify
- `curl http://localhost:5000/api/social-media/integration-status` → 401 (not 404) = route exists
- `pm2 describe alburhan-tours | grep cwd` → confirms /root
