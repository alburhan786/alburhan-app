---
name: Deploy tar exclusions
description: On-the-fly frontend tar must exclude *.tar.gz and *.cjs to avoid 117MB bloat
---

The GET /api/migrate/frontend.tar.gz handler in app.ts tars the ENTIRE
artifacts/alburhan/dist/public/ directory. That directory contains:
- frontend-dist.tar.gz (~117 MB) — stale artifact from prior builds
- dl-*.cjs — API server bundle (~6 MB)

Without --exclude flags, every VPS frontend deploy transfers ~125 MB instead of ~8 MB.

**Why:** emptyOutDir:true wipes dist/public before each vite build, but
frontend-dist.tar.gz and API bundles re-appear (created by external steps/deploys).

**How to apply:** tar command must always use:
  --exclude=*.tar.gz
  --exclude=*.cjs

Fixed in app.ts line ~273.

Also: artifacts/api-server/src/alburhan-frontend.tar.gz is the FALLBACK tar
(served if dist/public is absent). Must regenerate after every major build:
  tar -czf artifacts/api-server/src/alburhan-frontend.tar.gz \
    --exclude="*.tar.gz" --exclude="*.cjs" \
    -C /home/runner/workspace artifacts/alburhan/dist/public
