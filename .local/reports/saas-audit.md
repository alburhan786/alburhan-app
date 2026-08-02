# SaaS Phase 1 — Architecture Audit Report

**Date:** 2026-08-02  
**Branch:** `feature/saas-multitenancy`  
**Tag:** `saas-pre-phase1`  
**Auditor:** Replit Agent (main)  
**Status:** AUDIT COMPLETE — AWAITING IMPLEMENTATION APPROVAL

---

## 1. Regression Baseline (Pre-Audit)

| Suite | Result |
|---|---|
| Automation regression (22 checks) | ✅ 22/22 PASS |
| Comms regression (96 checks) | ✅ 96/96 PASS |
| Finance regression (56 checks) | ✅ 56/56 PASS |

Schema dump saved: `.local/backups/saas_schema_<timestamp>.sql`

---

## 2. Database Inventory

**Total tables:** 164 (confirmed from `pg_tables` live query)  
**Total with `tenant_id`:** 0 (zero — the entire schema is single-tenant today)

> One exception noted: `marketing_campaigns` has `tenant_id TEXT DEFAULT 'default'` added by `analytics.ts`, but it is never enforced or filtered — it is cosmetic only.

### Full Table List (164 tables)

```
account_opening_balances, accounts, admin_events, admin_notifications,
agent_commissions, agent_wallet_transactions, agents, agreement_audit_logs,
agreements, ai_conversation_messages, ai_conversations, ai_knowledge_base,
airline_master, api_settings, assets, attendance_events, attendance_logs,
audit_logs, automation_audit_logs, automation_service_tokens, bank_settings,
booking_audit_logs, booking_confirmation_notifications, booking_settings,
bookings, branches, broadcasts, buses, comm_events, comment_automation_rules,
communication_audit_logs, communication_consents, communication_event_mappings,
communication_schedules, communication_status_history, companies,
crm_assignment_rules, customer_ledger_entries, customer_notification_preferences,
customer_notifications, customer_portal_activity, customer_profile_edits,
customer_profiles, customer_push_tokens, customer_timeline, delete_audit_log,
document_download_logs, documents, drivers, employee_advances, employees,
error_request_logs, expenses, fb_ads_sync, feedback, finance_audit_logs,
financial_years, flight_baggage, fuel_logs, gallery_images, group_broadcast_logs,
group_flights, group_tracking, hajj_groups, hajj_rooms, holy_site_allocations,
hotel_checkins, hotel_contracts, hotel_rooms, hotel_vouchers, hotels,
inquiries, invoices, journal_entries, journal_entry_lines, lead_activities,
lead_assignment_rules, lead_audit_log, lead_auto_followup_log, lead_followups,
lead_web_form_submissions, lead_web_forms, leads, leave_balances, leave_requests,
leave_types, loyalty_points, loyalty_transactions, luggage_tags, maintenance_logs,
marketing_campaigns, medical_cases, meta_delivery_logs, meta_media_cache,
meta_messages, meta_templates, meta_token_status, notification_auto_settings,
notification_campaigns, notification_logs, notification_logs_dup_audit,
notification_retry_queue, notification_settings, notification_templates,
oauth_connections, offline_payments, orientation_resources, otps,
package_media, package_requests, packages, payment_audit_logs, payment_schedules,
payment_transactions, payroll_entries, payroll_runs, pdf_audit_logs, pdf_backups,
pdf_file_versions, pdf_files, pdf_folders, pdf_sessions, pdf_users,
pilgrim_bus_assignments, pilgrim_room_assignments, pilgrims, pilgrims_families,
pnr_passengers, pnr_records, provider_health_status, purchase_order_items,
purchase_orders, push_campaigns, rcs_template_mappings, receipts, refunds,
reminder_logs, salary_components, salary_slips, scheduled_notifications,
sender_ids, session, social_messages, social_platform_configs, staff, suppliers,
support_messages, support_tickets, tasks, tent_allocations, transport_routes,
transport_trips, users, vehicles, vendor_bill_payments, vendor_bills, vendors,
wa_templates, webhook_events, workflow_logs, workflow_queue, workflow_rules,
ziyarat_attendance, ziyarat_schedules
```

### Table Groupings for Tenancy Migration

#### Group A — CORE BUSINESS DATA (must have tenant_id — highest priority)
| Table | Notes |
|---|---|
| bookings | Root entity; 52 columns; all downstream joins start here |
| pilgrims | Linked to bookings via group_id (NOT booking_id) |
| hajj_groups | group_name column (NOT name) |
| packages | Drizzle-managed; uses quoted camelCase columns |
| users | Customers and admins; role-based |
| payment_transactions | Has UNIQUE(reference_number) index |
| invoices | Financial root for billing |
| receipts | Created per payment |
| refunds | Linked to payments/bookings |
| agreements | Has verification_token for public access |
| documents | Has access_token for shareable public links |

#### Group B — OPERATIONAL DATA (tenant-scoped, lower risk)
| Table | Notes |
|---|---|
| hotels, hotel_rooms, hotel_checkins, hotel_contracts, hotel_vouchers | All hotel lifecycle |
| buses, pilgrim_bus_assignments | Transport |
| group_flights, flight_baggage, pnr_records, pnr_passengers | Flight ops |
| hajj_rooms, pilgrim_room_assignments | Makkah/Madinah rooms |
| ziyarat_schedules, ziyarat_attendance | Ziyarat program |
| holy_site_allocations | Mina/Arafat/Muzdalifah |
| luggage_tags | Pilgrim baggage |
| staff | Airport/operations staff |
| attendance_events, attendance_logs | Event-based check-in |
| medical_cases | Pilgrim medical |
| group_tracking | Live group location |
| tent_allocations | Camp allocations |
| transport_routes, transport_trips | Ground transport |

#### Group C — FINANCE & ACCOUNTING (tenant-scoped)
| Table | Notes |
|---|---|
| accounts, account_opening_balances | Chart of accounts |
| financial_years | Fiscal year config |
| journal_entries, journal_entry_lines | Double-entry bookkeeping |
| expenses | Operational spend |
| vendors, vendor_bills, vendor_bill_payments | Procurement |
| purchase_orders, purchase_order_items | PO management |
| assets | Asset register |
| employees, payroll_runs, payroll_entries, salary_components, salary_slips | HR/Payroll |
| employee_advances | Staff advances |
| leave_types, leave_requests, leave_balances | Leave management |
| customer_ledger_entries | Customer statement |
| agent_commissions, agent_wallet_transactions | Agent financials |
| finance_audit_logs | Immutable finance trail |

#### Group D — CRM & LEADS (tenant-scoped)
| Table | Notes |
|---|---|
| leads, lead_followups, lead_activities, lead_audit_log | Core CRM |
| lead_assignment_rules, crm_assignment_rules | Auto-routing rules |
| lead_auto_followup_log | Auto-sequence log |
| lead_web_forms, lead_web_form_submissions | Web form capture |
| fb_ads_sync | Facebook Ads sync |
| inquiries | Pre-lead inquiries |
| feedback | Post-trip feedback |

#### Group E — NOTIFICATIONS & COMMUNICATIONS (partially tenant-scoped)
| Table | Notes |
|---|---|
| notification_logs | High-volume; per-booking |
| notification_settings | Config table; one per tenant |
| notification_templates | DLT/channel templates; per-tenant |
| notification_campaigns | Bulk sends; per-tenant |
| notification_retry_queue | Retry queue; per-booking |
| notification_auto_settings | Toggle flags; per-tenant |
| scheduled_notifications | Scheduled sends |
| reminder_logs | Reminder tracking |
| broadcasts | Admin broadcasts |
| group_broadcast_logs | Group-level broadcast log |
| comm_events | Communication center events |
| communication_event_mappings, communication_schedules | Channel config |
| communication_status_history | Delivery tracking |
| communication_audit_logs | Audit trail |
| communication_consents | Customer opt-in/out |
| customer_notification_preferences | Per-customer channel prefs |
| customer_notifications | In-app inbox |
| push_campaigns | FCM broadcast history |
| customer_push_tokens | Device tokens |

#### Group F — GLOBAL SYSTEM CONFIG (SHARED — NOT tenant-scoped in MVP)
| Table | Notes |
|---|---|
| api_settings | Provider credentials; one shared row per provider |
| wa_templates | WhatsApp template library |
| rcs_template_mappings | RCS templates (Lemin/Jio) |
| sender_ids | DLT registered senders |
| meta_templates, meta_token_status, meta_media_cache | Meta Cloud API state |
| provider_health_status | Channel health dashboard |
| notification_logs_dup_audit | Historical dedup audit |
| oauth_connections | Google OAuth tokens |
| social_platform_configs, social_messages | Social media |
| booking_settings | Global booking config |
| companies | Company profile |
| gallery_images | Marketing gallery |
| orientation_resources | Hajj orientation content |
| airline_master | Shared airline reference |
| bank_settings | Bank account details |

#### Group G — AUDIT & SECURITY (global append-only)
| Table | Notes |
|---|---|
| audit_logs | Admin actions; purged after 12 months |
| booking_audit_logs | Booking change trail |
| payment_audit_logs | Payment change trail |
| agreement_audit_logs | Agreement signing trail |
| communication_audit_logs | Comms audit trail |
| automation_audit_logs | AI automation audit |
| delete_audit_log | Deletion records |
| error_request_logs | API error log |
| document_download_logs | Document access log |

#### Group H — AI AUTOMATION (per-tenant, already token-scoped)
| Table | Notes |
|---|---|
| automation_service_tokens | Service-to-service auth tokens |
| ai_conversations | Chatbot conversation sessions |
| ai_conversation_messages | Message history |
| ai_knowledge_base | FAQ/knowledge content |

#### Group I — CUSTOMER PORTAL (customer-scoped, NOT tenant-scoped)
| Table | Notes |
|---|---|
| otps | Login OTPs |
| session | Express session store |
| customer_profiles | Extended customer profile |
| customer_portal_activity | Portal action log |
| customer_profile_edits | Edit approval queue |
| customer_timeline | Booking journey events |
| loyalty_points, loyalty_transactions | Loyalty program |
| support_tickets, support_messages | Customer support |
| workflow_logs, workflow_queue, workflow_rules | Automation engine |

#### Group J — BRANCHES & AGENTS (tenant-scoped roles)
| Table | Notes |
|---|---|
| branches | Branch offices |
| agents | Agent profiles |
| portal.ts | Branch/agent/staff login portal |

#### Group K — PDF ENTERPRISE (SEPARATE ARTIFACT — not in scope)
| Table | Notes |
|---|---|
| pdf_files, pdf_folders, pdf_file_versions | Managed by pdf-enterprise artifact |
| pdf_backups, pdf_audit_logs, pdf_sessions, pdf_users | Separate product DB |

---

## 3. Route Files Inventory (87 files)

| File | Auth Level | DB Method | Cross-Tenant Risk |
|---|---|---|---|
| accounting.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM accounts/financial_years/journal_entries |
| admin-notifications.ts | requireAdmin | pool.query | MEDIUM — scoped to admin_notifications table |
| admin-payments.ts | requireAdmin | pool.query | MEDIUM — payment scoping by booking/date |
| admin.ts | requireAdmin | pool.query | **HIGH** — global stats queries over all bookings |
| agreements.ts | mixed (admin/requireAuth/public) | pool.query | MEDIUM — booking_id scoped for customer access |
| ai-automation-admin.ts | requireAdmin | pool.query | LOW — new, service-token scoped |
| ai.ts | requireAdmin | pool.query | LOW — knowledge base only |
| allocations.ts | requireAdmin | pool.query | MEDIUM — group_id scoped |
| analytics.ts | requireAdmin | pool.query | **HIGH** — aggregates over all bookings/payments |
| api-settings.ts | mixed | pool.query | **HIGH** — global provider credentials; shared config |
| assets.ts | requireAdmin | pool.query | MEDIUM — asset register, admin-only |
| attendance.ts | mixed (admin + public scan) | pool.query | MEDIUM — event_id scoped |
| audit.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM audit_logs (global) |
| auth.ts | public/mixed | pool.query | LOW — OTP/session; scoped by mobile |
| automation.ts | service-token | pool.query | LOW — explicitly scoped by service token |
| autoNotifications.ts | requireAdmin | pool.query | MEDIUM — notification settings |
| bookings.ts | mixed | pool.query | MEDIUM — customer_id scoped for customer access |
| broadcasts.ts | requireAdmin | pool.query | HIGH — sends to ALL bookings in segment |
| buses.ts | requireAdmin | pool.query | MEDIUM — group_id/bus_id scoped |
| commissions.ts | requireAdmin | pool.query | MEDIUM — agent_id scoped |
| comm-mgmt.ts | requireAdmin | pool.query | HIGH — global communication config tables |
| comms-engine.ts | requireAdmin | pool.query | HIGH — fires notifications globally |
| communication.ts | requireAdmin | pool.query | MEDIUM — customer consent scoped |
| crm.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM leads/comment_automation_rules/webhook_events |
| customer360.ts | requireAdmin | pool.query | MEDIUM — customer_id scoped |
| customer-journey.ts | requireAuth | pool.query | LOW — booking_id + customer auth check |
| customer-portal.ts | requireAuth | pool.query | LOW — customer_id from session |
| delete-auth.ts | requireAdmin | pool.query | **CRITICAL** — hard delete capability; no tenant scope |
| documents.ts | mixed | pool.query | MEDIUM — booking_id/access_token scoped |
| e2e.ts | requireAdmin | pool.query | LOW — test endpoint only |
| enterprise.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM leads/marketing_campaigns/suppliers/group_tracking |
| error-logs.ts | requireAdmin | pool.query | MEDIUM — error log viewer |
| executive-dashboard.ts | requireAdmin | pool.query | **HIGH** — global aggregation KPIs |
| expenses.ts | requireAdmin | pool.query | HIGH — global expense list |
| feedback.ts | mixed | pool.query | MEDIUM — booking_id scoped for customer |
| finance-reports.ts | requireAdmin | pool.query | **HIGH** — global financial aggregations |
| finance.ts | requireAdmin | pool.query | **HIGH** — journal_entries/accounts global |
| flight-ops.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM airline_master/group_flights |
| flights.ts | requireAdmin | pool.query | HIGH — group_flights global list |
| gallery.ts | mixed | pool.query | LOW — public gallery images |
| group-ops.ts | requireAdmin | pool.query | HIGH — global group operations |
| groups.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM hajj_groups (3622 lines) |
| gst.ts | requireAdmin | pool.query | HIGH — global GST reports |
| health.ts | public | pool.query | LOW — server health only |
| hotel-ops.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM hotel_contracts/hotel_vouchers |
| hotels.ts | requireAdmin | pool.query | HIGH — global hotel list |
| hr-ops.ts | requireAdmin | pool.query | HIGH — employees/payroll global |
| inbox.ts | requireAdmin | pool.query | MEDIUM — admin notifications |
| index.ts (routes) | — | — | Route aggregator — no queries |
| inquiry.ts | mixed | pool.query | LOW — inquiry_id scoped |
| invoices.ts | mixed | pool.query | MEDIUM — booking_id scoped for customer |
| itinerary.ts | requireAdmin | pool.query | MEDIUM — group_id scoped |
| kyc.ts | requireAdmin | pool.query | MEDIUM — customer KYC |
| lead-engine.ts | requireAdmin | pool.query | HIGH — global lead assignment rules |
| loyalty.ts | requireAdmin | pool.query | HIGH — global loyalty overview |
| luggage.ts | requireAdmin | pool.query | MEDIUM — group/booking scoped |
| medical.ts | requireAdmin | pool.query | MEDIUM — pilgrim/booking scoped |
| meta.ts | mixed (webhook/admin) | pool.query | HIGH — global Meta API state |
| notification-center.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM notification_settings/templates |
| notifications.ts | requireAdmin | pool.query | HIGH — fires + logs across all bookings |
| offline-payments.ts | mixed | pool.query | MEDIUM — booking_id scoped |
| package-media.ts | mixed | pool.query | LOW — package_id scoped |
| packages.ts | mixed | Drizzle | HIGH — global package list (public-accessible) |
| payments.ts | mixed | pool.query | MEDIUM — booking_id scoped for customer |
| payroll.ts | requireAdmin | pool.query | HIGH — global payroll data |
| portal.ts | portal-auth | pool.query | MEDIUM — portal role isolation |
| purchase.ts | requireAdmin | pool.query | HIGH — global procurement |
| push.ts | requireAdmin | pool.query | HIGH — broadcasts to ALL customer tokens |
| rcs.ts | requireAdmin | pool.query | HIGH — global RCS config |
| requests.ts | mixed | pool.query | LOW — package_request scoped |
| scan.ts | public | pool.query | LOW — QR token scoped |
| settings.ts | requireAdmin | pool.query | HIGH — global settings |
| sms-settings.ts | requireAdmin | pool.query | HIGH — global SMS DLT config |
| social-media.ts | requireAdmin | pool.query | HIGH — global social config |
| staff.ts | mixed (admin + public scan) | pool.query | MEDIUM — staff_id scoped for public scan |
| storage.ts | requireAdmin | pool.query | MEDIUM — file storage proxy |
| support.ts | mixed | pool.query | MEDIUM — ticket_id + customer_id scoped |
| system-health.ts | requireAdmin | pool.query | HIGH — global provider health + circuit breakers |
| transport-ops.ts | requireAdmin | pool.query | HIGH — global transport routes/trips |
| users-admin.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM users |
| vendors.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM vendors |
| verify.ts | public | pool.query | LOW — payment verification; Razorpay-scoped |
| visa.ts | requireAdmin | pool.query | MEDIUM — group/booking scoped |
| webhooks.ts | public (Meta webhook) | pool.query | MEDIUM — wamid scoped |
| whatsapp.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM wa_templates |
| workflows.ts | requireAdmin | pool.query | **HIGH** — SELECT * FROM workflow_rules/logs |
| ziyarat.ts | requireAdmin | pool.query | LOW — ziyarat schedule-scoped |

### Risk Summary
| Classification | Count |
|---|---|
| **HIGH / CRITICAL** (unscoped global queries) | 34 files |
| MEDIUM (partially scoped, needs audit) | 34 files |
| LOW (already scoped or config-only) | 19 files |

---

## 4. Background Jobs Inventory (14 cron jobs — ALL globally scoped)

| Job | Schedule | Tables Touched | Tenant Risk |
|---|---|---|---|
| `startPaymentReminderCron` | `jobs/paymentReminder.ts` | invoices, bookings, reminder_logs | **HIGH** — fires for ALL due invoices |
| `startFeedbackReminderCron` | Daily | bookings, reminder_logs | HIGH |
| `startDepartureReminderCron` | Hourly | pilgrims, group_flights, notification_logs | HIGH |
| `startDocumentExpiryCron` | Daily 07:30 IST | pilgrims (passport_expiry) | HIGH |
| `startReturnAndFeedbackCron` | Daily 10:00 IST | pilgrims, group_flights | HIGH |
| `startBalanceReminderCron` | Daily 08:00 IST | bookings, payment_transactions | HIGH |
| `startDocumentReminderCron` | Periodic | documents, bookings | HIGH |
| `startZiyaratReminderCron` | Periodic | ziyarat_schedules | MEDIUM |
| `startAgreementIntegrityCron` | Periodic | agreements | HIGH |
| `startAgreementReminderCron` | Hourly at :45 | agreements, reminder_logs | HIGH |
| `startVisaReminderCron` | Periodic | pilgrims | HIGH |
| `startDailyAdminReportCron` | Daily | bookings, payments, leads | HIGH |
| `startTicketDepartureReminderCron` | Periodic | bookings, group_flights | HIGH |
| `runFollowupCron` (Lead Engine) | Every 5 min | leads, lead_followups, crm_assignment_rules | HIGH |
| `runLeadReminderCron` (Lead Engine B) | Hourly | lead_followups, leads | HIGH |
| `startGoogleHealthCheckCron` | Every 6h | social_platform_configs, oauth_connections | LOW |
| WA RetryEngine | Every 60s | notification_logs | HIGH |
| GenericRetryEngine | Every 30s | notification_retry_queue | HIGH |
| BotBee Template Sync | Every 10 min | wa_templates | LOW |
| Meta Retry Queue | Every 60s | meta_delivery_logs | MEDIUM |
| AuditRetention | Daily 00:00 IST | audit_logs | LOW |

**Critical finding:** Every business-data cron runs a global `SELECT … FROM <table>` with no tenant filter. In a multi-tenant deployment, all crons would fire notifications for ALL tenants from a single process — this is a Phase 3/4 concern requiring a cron-per-tenant or `WHERE tenant_id = ?` approach.

---

## 5. Critical Architecture Findings

### Finding 1: Zero Tenant Isolation Today
Every admin route and background job operates on all 164 tables globally. There is no application-level or database-level concept of "this data belongs to tenant X." The single current tenant (`alburhan`) implicitly owns everything.

### Finding 2: DB Method Is Predominantly `pool.query`
25+ route files use `// @ts-nocheck` due to Drizzle schema type mismatches. Nearly all business logic uses raw `pool.query()` rather than Drizzle ORM. This is actually **advantageous for Phase 2/3**: adding `AND tenant_id = $N` to raw SQL is mechanical and straightforward. There is no ORM query-builder layer that needs special tenant scope injection.

### Finding 3: Shared Global Config Tables
`api_settings`, `wa_templates`, `rcs_template_mappings`, `sender_ids`, `booking_settings`, `notification_settings` are global config tables. In SaaS:
- Option A: One row per `(tenant_id, provider)` — each tenant has their own API keys/providers
- Option B: Shared platform-level config — tenants cannot bring their own WhatsApp/SMS keys

**Recommended for MVP:** Option A — add `tenant_id` to config tables so each tenant can have their own notification channels. This matches the Hajj tour operator use case where each operator has their own WhatsApp Business number.

### Finding 4: PDF Enterprise Is a Separate Product
The `pdf_*` tables (7 tables) belong to the `artifacts/pdf-enterprise` application, which has its own user management (`pdf_users`). These tables are **not in scope** for the ERP multi-tenancy migration and should be handled separately if PDF Enterprise goes SaaS.

### Finding 5: Public Endpoints with No Auth
Several endpoints are intentionally public (QR scan, payment verification, agreement signing, WhatsApp webhook). These are scoped by `token`/`wamid`/`booking_id` parameters, not session auth. They are **safe** from cross-tenant leakage because the scoping parameter is cryptographically generated (UUID or Razorpay signature). No changes needed for Phase 2.

### Finding 6: Portal Auth Is Already Role-Isolated
`portal.ts` uses its own login flow (`branch_manager`/`agent`/`staff` roles) with separate OTP purpose isolation. Portal users are already scoped by their assigned branch/agent record. Adding `tenant_id` to `branches` and `agents` tables is sufficient to scope all portal access.

### Finding 7: `delete-auth.ts` Is the Highest Risk Route
`delete-auth.ts` contains hard-delete endpoints protected by `DELETE_ADMIN_PASSWORD`. In a multi-tenant environment, a mistake here could wipe another tenant's data. Phase 4 must add tenant ownership verification to all delete operations before any SaaS go-live.

---

## 6. Proposed Tenancy Strategy

### Recommended: Row-Level Tenancy with `tenant_id TEXT NOT NULL`

**Approach:** Add `tenant_id TEXT NOT NULL DEFAULT 'alburhan'` to all Group A–E tables. Use a `tenants` master table to register tenants. Enforce via a middleware function that extracts `tenant_id` from the admin session and injects it into all queries.

**NOT recommended:**
- Schema-per-tenant (PostgreSQL schemas): Too complex with 164 tables; breaks current migration pattern
- Database-per-tenant: Operationally expensive; doesn't match current single-DB architecture
- Drizzle ORM rewrite: Would require rebuilding 87 route files; unacceptably risky

### Phase 2 Scope (Tenant Foundation)
1. Create `tenants` table (id, name, slug, plan, config)
2. Add `tenant_id TEXT NOT NULL DEFAULT 'alburhan'` to ~60 core tables (Groups A–E)
3. Backfill existing data to `tenant_id = 'alburhan'`
4. Create `tenant_id` indexes on all modified tables
5. Write `requireTenant(req)` middleware helper — injects `tenant_id` from admin session
6. Update `users` table: add `tenant_id`; link admin users to their tenant
7. Rollback SQL: `ALTER TABLE <t> DROP COLUMN IF EXISTS tenant_id` for all modified tables

### Phase 3 Scope (Query Isolation)
1. Update all HIGH-risk routes (34 files) to add `AND tenant_id = $N` WHERE clauses
2. Update all cron jobs to iterate per-tenant or pass `tenant_id` to all notification sends
3. Update `requireAdmin` middleware to load and attach `req.tenantId` from the session
4. Update `requireAuth` (customer) to validate customer `tenant_id` matches booking `tenant_id`
5. Regression test every modified route

### Phase 4 Scope (Security + Quotas)
1. Add `tenant_id` ownership check to all delete routes
2. Add per-tenant quotas (bookings/month, notifications/day, storage/GB)
3. Cross-tenant penetration test (attempt to read another tenant's booking via admin API)
4. Rate limiting per `tenant_id`

---

## 7. Tables That Need `tenant_id` in Phase 2

**60 tables prioritized for Phase 2:**

```sql
-- Core booking lifecycle (must be first)
bookings, pilgrims, hajj_groups, packages, users,
payment_transactions, invoices, receipts, refunds, agreements, documents,

-- Group operations
hotels, hotel_rooms, hotel_checkins, hotel_contracts, hotel_vouchers,
buses, pilgrim_bus_assignments, group_flights, flight_baggage,
pnr_records, pnr_passengers, hajj_rooms, pilgrim_room_assignments,
ziyarat_schedules, ziyarat_attendance, holy_site_allocations, luggage_tags,
staff, attendance_events, attendance_logs, medical_cases, group_tracking,
tent_allocations, transport_routes, transport_trips,

-- Finance
accounts, account_opening_balances, financial_years,
journal_entries, journal_entry_lines, expenses, vendors,
vendor_bills, vendor_bill_payments, purchase_orders, purchase_order_items,
assets, employees, payroll_runs, payroll_entries, salary_slips,
leave_requests, customer_ledger_entries,

-- CRM
leads, lead_followups, lead_assignment_rules,
marketing_campaigns, inquiries, feedback,

-- Notifications (config per-tenant)
notification_settings, notification_templates, wa_templates,
notification_logs, reminder_logs
```

**Deferred to Phase 3/4 (global shared or audit tables):**
```
api_settings, audit_logs, session, otps, rcs_template_mappings,
sender_ids, meta_*, api_settings, booking_settings,
workflow_rules (if kept global), companies
```

---

## 8. Safety Constraints (From Planning Phase)

All the following constraints remain in effect for Phases 2–4:

1. ✅ Never modify production data
2. ✅ Never overwrite existing env vars
3. ✅ Never delete any table, column, index, or constraint
4. ✅ Never rename existing APIs
5. ✅ Never change customer-facing functionality
6. ✅ Never commit to `main`
7. ✅ Git tag before every phase
8. ✅ Full rollback SQL committed alongside every migration
9. ✅ Verify production backup restoration before Phase 2
10. ✅ CRITICAL issue detected → stop immediately, wait for manual approval

---

## 9. Conclusion

The Al Burhan ERP is a mature single-tenant application with 164 tables, 87 API route files, and 21 background jobs. The architecture is well-suited for row-level tenancy migration:

- The predominant use of raw `pool.query()` makes `AND tenant_id = $N` injection mechanical
- There are no cross-cutting ORM abstractions that complicate tenant filtering
- Public endpoints are already correctly scoped by cryptographic tokens
- Customer portal auth is session-scoped and will not leak across tenants

The migration carries **medium risk** overall. The highest-risk areas are:
1. Background crons (must be made tenant-aware before any second tenant is onboarded)
2. `delete-auth.ts` (must add tenant ownership check)
3. `analytics.ts` / `finance-reports.ts` (aggregation queries that currently span all tenants)

**Recommended next step:** Proceed with Phase 2 (Tenant Foundation) on the `feature/saas-multitenancy` branch.

---
*Generated: 2026-08-02 | Commit: see saas-pre-phase1 tag*
