---
name: VPS deploy requires pnpm build first
description: Must run pnpm build before self-update or VPS gets stale CJS bundle
---

## Rule

Always run `pnpm --filter @workspace/api-server run build` BEFORE calling `POST /api/migrate/self-update`.

The self-update endpoint downloads `dist/index.cjs` from the Replit dev server. If the build hasn't run, it serves the old compiled bundle regardless of source edits.

**How to detect stale deploy:** `bytes` field in the self-update response is identical to the previous deploy.

## VPS Deploy Sequence

```bash
# 1. Build the CJS bundle (runs tsx ./build.ts → dist/index.cjs)
pnpm --filter @workspace/api-server run build

# 2. Push to VPS (downloads from Replit dev server)
curl -X POST "https://alburhantravels.com/api/migrate/self-update?key=alburhan-migrate-2026"

# 3. Wait for PM2 restart (~22s)
sleep 22

# 4. Verify new build stamp
curl https://alburhantravels.com/api/version

# 5. Build and deploy frontend (separate step)
pnpm --filter @workspace/alburhan run build
curl -X POST "https://alburhantravels.com/api/migrate/deploy-frontend?key=alburhan-migrate-2026"
```

**Why:** `pnpm dev` runs TypeScript directly via tsx; it does NOT regenerate dist/index.cjs. The Replit workflow uses `pnpm dev`, so editing source files and restarting the workflow alone is not enough.
