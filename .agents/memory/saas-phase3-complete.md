---
name: SaaS Phase 3 — Query Isolation and Tenant Middleware
description: What was built, key decisions, and state to carry into Phase 4
---

## What was built

**New lib files:**
- `lib/tenantContext.ts` — `attachTenantContext` middleware resolves tenant from service-token → session → internal-job → DEFAULT. `getTenantId(req)` helper for route handlers.
- `lib/tenantDb.ts` — `tenantQuery()`, `tenantQueryNoWhere()`, `tenantInsert()`, `assertTenantOwnership()`, `TenantMismatchError`.

**Infrastructure changes:**
- `lib/auth.ts` — `user.tenantId` populated from `users.tenant_id` (fallback `DEFAULT_TENANT_ID`)
- `app.ts` — `app.use(attachTenantContext)` registered globally before all API routers
- `automation.ts` — `tenant_id` added to service-token SELECT; `req.serviceToken.tenantId` set
- `index.ts` — v39 migration block (same two-candidate path pattern as v38)

**Route updates:** 14 route files have `getTenantId` import; `bookings.ts` GET "/" has explicit `tenant_id = $N` predicate.

**Migration `v39-tenant-not-null.sql`:** v39.1 pre-flight + auto-repair → v39.2 SET NOT NULL on 60 tables → v39.3 assertion on 9 core tables. Runs idempotently at startup.

## Current state (post Phase 3)
- All 60 tenant-scoped tables: `tenant_id NOT NULL` ✅
- Regressions: comms 96/96 ✅ · automation 22/22 ✅
- RLS: structurally compatible (tested bookings); NOT activated (deferred to Phase 4)
- Git tag `saas-pre-phase3` exists at commit before Phase 3 code

## Phase 4 scope
- Subscription quotas and plan enforcement
- Provider credential isolation per tenant
- Full 25-test cross-tenant regression suite
- Platform admin onboarding UI
- Per-tenant DB credentials / SET LOCAL ROLE for real RLS activation
- Remove DEFAULT from tenant_id columns once multi-tenant INSERT paths exist
- Complete explicit tenant predicates across remaining 73 route files

## Key constants
- `DEFAULT_TENANT_ID = '10000000-1000-4000-8000-000000000001'` (Al Burhan fixed UUID)
- Exported from `lib/db/src/schema/tenants.ts` and re-exported via `@workspace/db`

**Why:**
Phase 3 established the structural enforcement (NOT NULL) and the plumbing (middleware + helpers). Phase 4 activates multi-tenancy when a second tenant is onboarded.
