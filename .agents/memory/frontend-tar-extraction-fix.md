---
name: Frontend tar extraction path — dual-root fix
description: The hotdeploy handler was extracting the frontend tar to the wrong directory, leaving the old frontend live on nginx.
---

## Rule
The frontend tar is created with paths **relative to workspace root**:
- `artifacts/alburhan/dist/public/index.html`
- `artifacts/alburhan/dist/public/assets/...`

The `tar -xzf` extraction must target the **workspace-root equivalent**, NOT the dist directory itself.

**Wrong**: `-C /root/artifacts/alburhan/dist` → files land at `/root/artifacts/alburhan/dist/artifacts/alburhan/dist/public/` (deeply nested, never served)

**Correct**: Extract to ALL of:
- `/var/www/alburhan` (nginx root — resolves as `path.resolve(__dirname, "../../..")` when bundle at `/var/www/alburhan/artifacts/api-server/dist/index.cjs`)
- `/root` (PM2 cwd — Express static fallback)

Files land at `/var/www/alburhan/artifacts/alburhan/dist/public/` (served by nginx) and `/root/artifacts/alburhan/dist/public/` (served by Express).

**Why:** nginx serves static files directly from `/var/www/alburhan/artifacts/alburhan/dist/public`; the Express static middleware falls back to `/root/artifacts/alburhan/dist/public` (cwd-relative). Both paths must be updated.

## How to apply
- When debugging "old frontend still showing" on production, verify the JS chunk hash:
  ```
  curl -sL https://alburhantravels.com/ | grep 'assets/index-'
  ```
  Compare with `ls artifacts/alburhan/dist/public/assets/index-*.js`
- If hashes differ, the frontend tar was extracted to the wrong path — call `hotdeploy?backend=0` to trigger the frontend-only extraction with the fixed dual-root logic.
- The hotdeploy runs on the **currently running** code, not the newly written bundle. If you've just pushed a hotdeploy fix, you need a second hotdeploy call (frontend-only) after PM2 restarts with the new code.

## Service worker cache busting
Whenever a new frontend is deployed and the SW might have cached old assets, bump `CACHE` in `public/sw.js`:
- `alburhan-v9` → `alburhan-v10` → etc.
- The activate handler deletes all caches with different names, forcing full reload.
