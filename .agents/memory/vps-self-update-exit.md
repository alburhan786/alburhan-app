---
name: VPS self-update uses process.exit(0) not pm2 restart
description: The self-update endpoint must call process.exit(0) after writing the new bundle — PM2 detects the exit and restarts with the new file. spawn("pm2", ...) silently fails.
---

## Rule
`/api/migrate/self-update` (and `/api/hot-reload`) must call `process.exit(0)` after writing the new bundle to disk. Do NOT use `spawn("pm2", ["restart", ...])` — PM2 is not in the PATH of the Node process and the spawn silently fails.

**Why:** When `pm2 restart` is spawned as a child process, it silently fails (PM2 not in PATH). The old process continues running with the old in-memory code even though the new bundle file is on disk. `process.exit(0)` forces PM2 to detect the crash and restart with the bundle file on disk.

**How to apply:** Any time the self-update flow is modified, ensure the response is sent first (`res.json({...})`), then `setTimeout(() => process.exit(0), 500)`. PM2 typically restarts within 1-2 seconds.

**Zombie process caveat:** If the VPS process was manually started (not via PM2), `process.exit(0)` will kill it but PM2 won't restart it. Only SSH `kill -9 <PID>` + `pm2 start` can fix a manual zombie. The `/api/migrate/kill-self` route was added to handle this case (calls process.exit(0) directly, key-protected).

**Migration key:** `alburhan-migrate-2026`
**Hot-reload auth:** `X-Admin-Password: $DELETE_ADMIN_PASSWORD` header
