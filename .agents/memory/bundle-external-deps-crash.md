---
name: Bundle external deps VPS crash pattern
description: Any package NOT in build.ts allowlist becomes require() at runtime on VPS — VPS has no node_modules so PM2 crashes and stops retrying.
---

## Rule
**Never introduce a new npm package in API server code without adding it to the `allowlist` in `build.ts`.**

The esbuild config externalizes ALL package.json deps EXCEPT those in `allowlist`. On VPS, there is no `node_modules/` directory — only the bundled CJS file. If a package is external, VPS crashes on startup with `MODULE_NOT_FOUND`, PM2 retries hit the limit, and the entire site goes 502.

**Why:** bcryptjs was installed, imported in users-admin.ts, but not added to allowlist → `require("bcryptjs")` in bundle → VPS PM2 crash loop → 502 for all routes including self-update → manual SSH required.

**How to apply:**
- After `pnpm add <pkg>`, immediately add it to `allowlist` in `artifacts/api-server/build.ts`.
- Exception: packages that MUST stay external (like pdfkit — uses `__dirname` for data files at runtime). These stay in externals AND must be installed on VPS manually.
- Prefer Node.js built-ins (crypto, util, path, etc.) over external packages when possible — they are always available and never need bundling.
- If VPS goes 502 after a deploy, first suspect a new external package not in allowlist.

## Recovery when PM2 stops retrying
PM2 has ~16 max_restarts. When hit, the entire API goes 502 including self-update.
SSH into VPS:
```bash
wget -O /var/www/alburhan/artifacts/api-server/dist/index.cjs \
  "https://<REPLIT_DEV_DOMAIN>/api/migrate/server.cjs?key=alburhan-migrate-2026"
pm2 restart all
```
Then run any new DB migrations manually via psql on VPS.
