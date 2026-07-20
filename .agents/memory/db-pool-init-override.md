---
name: DB pool init — override guard
description: lib/db creates Pool at module-init; env reader must unconditionally override DATABASE_URL or PM2's placeholder wins
---

## Rule
In `lib/db/src/index.ts`, the self-contained `.env` reader must use `process.env[key] = val` (always set) — never `if (!process.env[key])`. The Pool is created at module-init time, before `index.ts` dotenv runs, so DATABASE_URL is whatever PM2 inherited when it first started.

**Why:** PM2 inherits env from the shell that ran `pm2 start`. If the shell had `DATABASE_URL=postgresql://...` (placeholder, 16 chars), the Pool gets created with ENOTFOUND. The dotenv call in `index.ts` (with `override: true`) fixes `process.env` at request time but the Pool is already created with the wrong string.

**How to apply:** Any time `lib/db/src/index.ts` is edited, confirm the env-reader loop body is unconditional: `if (key && val) { process.env[key] = val; }`. The early-return guard (`length > 20`) must NOT fire for short placeholders like `postgresql://...` (16 chars).
