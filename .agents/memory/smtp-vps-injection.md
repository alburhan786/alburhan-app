---
name: SMTP VPS injection
description: How SMTP credentials reach the VPS bundle and how getCachedConfig reads them
---

## Rule
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM are added to `injectKeys` in `artifacts/api-server/build.ts`. The build bakes them into `dist/index.cjs` so VPS never needs .env for email.

**Why:** VPS starts without .env — only DATABASE_URL and SESSION_SECRET are in PM2 env. All API keys must be baked in at build time.

**How to apply:** Any new external service credential that isn't DB/session-related should be added to `injectKeys` in build.ts and tested with `pnpm --filter @workspace/api-server run build` — look for "✅ Injecting X (len=N)" in output.

## getCachedConfig fallback chain for smtp
1. If api_settings has smtp row AND enabled=false → return null (email disabled)
2. If api_settings has smtp row AND apiKey decrypts to non-empty → use DB config
3. Otherwise → use env var fallback: process.env.SMTP_PASS, SMTP_HOST, SMTP_USER, SMTP_PORT
4. decrypt() fails gracefully (returns "") for invalid/plaintext ciphertext — safe to store plaintext as fallback

## Migration auto-inserts smtp row
If SMTP_HOST+USER+PASS env vars are set AND no smtp row exists in api_settings, the startup migration inserts one. This means admin doesn't need to manually configure SMTP in API Settings for the first deploy.
