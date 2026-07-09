---
name: Per-route auth pattern
description: How authentication middleware is applied across api-server routes — relevant before doing any security audit.
---

Most route files in `artifacts/api-server/src/routes/` do NOT apply `requireAdmin`/`requireAuth` at the top of the file via `router.use(...)`. Instead, each individual route handler imports and applies the middleware inline, e.g. `router.get("/accounts", requireAdmin as any, async (...) => {...})`.

**Why:** This lets a single router mix public and protected endpoints (e.g. a public verification route alongside admin CRUD routes in the same file).

**How to apply:** When auditing for unprotected routes, grep for `requireAdmin|requireAuth` inside the specific route file itself — do not conclude a route is unprotected just because `routes/index.ts` mounts it with a bare `router.use("/path", someRouter)`. Only flag truly public routes (no requireAdmin/requireAuth anywhere in the file) as real gaps, e.g. `/api/diag` and the `/api/download-*` deploy-bundle endpoints were genuinely unprotected until fixed.
