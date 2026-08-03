---
name: SaaS Tenant Isolation — Phase 3 progress
description: Which route files have been patched with tenant_id filters, which are done, and what remains for Phase 4.
---

## Status: Phase 3 complete — awaiting user approval to start Phase 4

### Branch: `feature/saas-multitenancy`
### Final state: build ✅ 6.9MB | comms 96/96 ✅ | automation 22/22 ✅

---

## Fully patched route files (all SELECT/UPDATE/DELETE carry tenant_id=$N::uuid)

**Session 1 (prior):**
bookings.ts, payments.ts, invoices.ts, groups.ts, crm.ts, documents.ts, support.ts,
expenses.ts, agreements.ts, notifications.ts, admin-payments.ts, users-admin.ts,
packages.ts, lead-engine.ts

**Session 2 (prior):**
audit.ts, rcs.ts, communication.ts, notification-center.ts, push.ts, broadcasts.ts,
feedback.ts, loyalty.ts, inquiry.ts, admin.ts, analytics.ts, comm-mgmt.ts,
comms-engine.ts, customer360.ts, gst.ts, executive-dashboard.ts, visa.ts, inbox.ts,
commissions.ts, portal.ts, finance.ts, finance-reports.ts, accounting.ts (journal-entries,
cashbook, bankbook, journal)

**Session 3 (this session):**
accounting.ts — payment-entries, outstanding, ledger (customer), accounts/:id/ledger (journal_entries je.tenant_id)
enterprise.ts — GET /campaigns (marketing_campaigns)
staff.ts — GET / switched from Drizzle to pool.query with tenant filter
ai-automation-admin.ts — tokens GET, conversations (stats+list), audit, knowledge
automation.ts — GET /packages, GET /packages/:id, leads mobile-check, crm_assignment_rules (all use req.serviceToken!.tenantId)
vendors.ts — GET / and /:id/ledger expenses
social-media.ts — GET /lead-pipeline (FROM leads), GET /analytics (leads count)
customer-portal.ts — overview bookings query (defense-in-depth; already scoped by customer_id)

---

## By-design cross-tenant or low-risk gaps (documented, not patched)

- **webhooks.ts** notification_logs UPDATE: scoped by `recipient` + `channel` (provider's callback doesn't carry tenant context — intentionally cross-tenant for status delivery)
- **customer-journey.ts** bookings: single-record lookups already scoped by booking_id + requireAuth owner check; notification_logs filtered by booking_id (low risk)
- **medical.ts** pilgrims: single-record PK lookups (non-guessable UUIDs); medical_cases not in tenant-60 list
- **hr-ops.ts** employees/leave: HR tables (employees, leave_requests, salary_slips) are NOT in the 60-table tenant list — all-tenant internal HR ops is by-design
- **social-media.ts /messages**: social_messages not in tenant-60 list

---

## Phase 4 — DO NOT START until Task #359 is marked complete and user approves
- Quota enforcement (per-tenant limits)
- Row-level security (PostgreSQL RLS policies)
- Credential isolation (per-tenant encrypted secrets)

**Why:** Phase 3 is application-layer isolation; Phase 4 adds DB-layer enforcement. User explicitly asked to block Phase 4 until #359 approval.
