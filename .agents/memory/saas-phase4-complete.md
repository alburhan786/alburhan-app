---
name: SaaS Phase 4 — Quota, Credentials, RLS
description: Phase 4 deliverables: tenant_quotas + tenant_credentials tables, RLS on 57 tables, cross-tenant security test suite
---

## Summary

Phase 4 adds four security layers on top of Phase 3 application-level filters:

1. **Quota enforcement** — `tenant_quotas` table; `checkQuota()` in bookings POST (HTTP 429 + `QUOTA_EXCEEDED`); fail-open on non-quota errors; Al Burhan seeded with 999999 limits for all resources.

2. **Credential isolation** — `tenant_credentials` table (AES-256-GCM); master key = `scryptSync(SESSION_SECRET, 'abt-tenant-credentials-v1', 32)`; default tenant falls back to `process.env` env vars.

3. **PostgreSQL RLS** — PERMISSIVE policy on all 57 tenant-scoped tables; allows ALL when `COALESCE(current_setting('app.current_tenant', true), '') = ''` (backward compat for all existing pool.query calls); restricts by `tenant_id` when session var is set via `withTenantConnection()`.

4. **Test suite** — `tests/cross-tenant-security.sh`, 59 tests, 9 sections (RLS infra, app isolation, quota, credentials, API auth, RLS DB, migration, source structural, backward compat).

## Key files

- `migrations/v40-tenant-quotas.sql` — steps v40.1–v40.3
- `migrations/v40-tenant-credentials.sql` — steps v40.4–v40.6
- `migrations/v40-rls.sql` — steps v40.7–v40.9
- `src/lib/tenantQuota.ts` — QuotaExceededError, checkQuota, getQuotaStatus
- `src/lib/tenantCredentials.ts` — setCredential, getCredential, AES-256-GCM
- `src/lib/tenantRls.ts` — withTenantConnection, isRlsEnabledOnTable, getRlsPolicyCount

## RLS design decision

**Why:** Permissive-by-default means zero code changes needed for existing routes. The `COALESCE(…) = ''` guard makes the policy a no-op unless `withTenantConnection()` explicitly sets the session variable.

**How to apply:** Any new code that needs cross-tenant safety wraps its DB calls in `withTenantConnection(tenantId, client => client.query(…))`. All existing `pool.query()` calls are unaffected.

## psql boolean comparison caveat

`relrowsecurity::text` returns `"true"`/`"false"` (not `"t"`/`"f"`). Shell tests must compare against `"true"`, not `"t"`.

## By-design gaps (not covered by RLS)

- `webhooks.ts` notification_logs UPDATE — provider callbacks carry no tenant context
- `customer-journey.ts`, `medical.ts` — PK lookups with requireAuth owner check
- `hr-ops.ts` employee/leave tables — no tenant_id column
