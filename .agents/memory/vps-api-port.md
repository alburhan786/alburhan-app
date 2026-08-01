---
name: VPS API port
description: The production API process listens on port 5000, not 3000. All localhost self-update/health curl commands must use port 5000.
---

## Rule

VPS API process listens on **port 5000** (set via PORT env var in PM2 ecosystem config).

All `curl http://localhost:PORT/api/...` commands for VPS SSH bootstrap must use port 5000.

```bash
# CORRECT
curl -s -X POST "http://localhost:5000/api/migrate/self-update?key=$KEY"
curl -s "http://localhost:5000/api/health"
curl -s "http://localhost:5000/api/version"

# WRONG — port 3000 is NOT the API process
curl -s -X POST "http://localhost:3000/api/migrate/self-update?key=$KEY"
```

**Why:** PORT=5000 is in the VPS ecosystem config. Earlier bootstrap ran on port 3000 (no process there), returned garbage or connected to a different stale process, but the actual API on 5000 was never updated. This caused the new bundle to never be installed despite `ok:true` appearing to succeed.

## Key extraction from bundle

MIGRATION_KEY is baked into the bundle via esbuild define (not in PM2 env). Extract it with:

```bash
BUNDLE=$(find /var/www /root -name "index.cjs" -path "*/api-server/dist/*" 2>/dev/null | head -1)
KEY=$(python3 -c "import re; d=open('$BUNDLE','rb').read().decode('utf-8','replace'); m=[h for h in re.findall(r'[a-zA-Z0-9]{96}',d) if h[:4]=='3bdc' and h[-4:]=='e17a']; print(m[0] if m else '')" 2>/dev/null)
```

## Deploy endpoints on VPS

- `POST /api/migrate/self-update` — localhost-only; installs new bundle from DEPLOY_SOURCE_URL
- `POST /api/migrate/deploy-frontend` — external HTTPS; installs new frontend from DEPLOY_SOURCE_URL
- `POST /api/migrate/backend-pull` — external HTTPS (added in v30.2); installs new bundle from DEPLOY_SOURCE_URL
