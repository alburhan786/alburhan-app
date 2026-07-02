---
name: VPS deployment path
description: Where the api-server on VPS actually serves static frontend files from, and how the migration tar.gz must be structured.
---

The VPS at `/var/www/alburhan/` has the **full monorepo** cloned/copied there (not just the compiled api-server). So `process.cwd()` = `/var/www/alburhan/` and the server's first candidate path resolves to:

```
/var/www/alburhan/artifacts/alburhan/dist/public
```

This is the path the server actually serves static files from.

**Why this matters:** The migration `frontend.tar.gz` must be structured so that extracting it in `/var/www/alburhan/` puts files into `artifacts/alburhan/dist/public/`. The endpoint was updated to do `tar -czf - -C <workspaceRoot> artifacts/alburhan/dist/public`.

**Pitfall:** Extracting with `tar -xzf frontend.tar.gz` (creating `public/`) or `tar -xzf -C dist` (creating `dist/public/`) both go to the WRONG location. The server ignores those and keeps serving the stale copy in `artifacts/alburhan/dist/public/`.

**Future deploy command on VPS:**
```bash
cd /var/www/alburhan
wget -O frontend.tar.gz "<replit_url>/api/migrate/frontend.tar.gz?key=alburhan-migrate-2026"
tar -xzf frontend.tar.gz
rm frontend.tar.gz
pm2 restart api-server
```
(Now extracts correctly to `artifacts/alburhan/dist/public/`.)
