---
name: VPS deployment path
description: Where pm2 runs the api-server from on VPS, and where the frontend static files live.
---

The VPS at `/var/www/alburhan/` has the **full monorepo** structure (not just the compiled api-server).

## PM2 server bundle path (CONFIRMED)
```
/var/www/alburhan/artifacts/api-server/dist/index.cjs
```
This is the ACTUAL path pm2 runs the server from. Previous deploys to `/var/www/alburhan/dist/index.cjs` silently failed because pm2 was reading from the monorepo path above.

## Frontend static files path
```
/var/www/alburhan/artifacts/alburhan/dist/public
```
`process.cwd()` = `/var/www/alburhan/` so the server's candidate path resolves there.

## Correct VPS deploy command
```bash
# Server
curl -s "<replit_url>/api/migrate/server.cjs?key=alburhan-migrate-2026" \
  -o /var/www/alburhan/artifacts/api-server/dist/index.cjs \
  && pm2 restart api-server

# Frontend
curl -s "<replit_url>/api/migrate/frontend.tar.gz?key=alburhan-migrate-2026" \
  -o /tmp/frontend.tar.gz && tar -xzf /tmp/frontend.tar.gz -C /var/www/alburhan/
```

**Why:** The monorepo is cloned at /var/www/alburhan/. pm2 ecosystem config points to the monorepo's artifacts/api-server/dist/index.cjs path, not a flat dist/ folder.

**Pitfall:** Never write to `/var/www/alburhan/dist/index.cjs` — that path is ignored by pm2.
