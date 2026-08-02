---
name: Communication Center Foundation
description: v35.x migration tables, new library files, and frontend tabs added for the Centralized Communication Center task
---

## What was built (v35.x)

**New library files:**
- `lib/communicationContext.ts` — `buildCommunicationContext()` loads all booking/customer/finance/document data from DB into one `CommunicationContext` object; `validateContext()` checks for raw UUIDs, localhost URLs, unresolved placeholders
- `lib/variableResolver.ts` — `resolveTemplateVariables()` handles all 6 variable formats: `#!Name!#` (BotBee), `{{1}}` (Meta positional), `{key}` (email/generic), plain keys, Lemin RCS key-with-spaces, case-sensitive provider keys

**New route:**
- `routes/comm-mgmt.ts` — mounted at `/api/comm-mgmt`; provides: event-mappings CRUD, event-mappings/matrix (merged view), provider-health, circuit-reset (Super Admin + audit), resend with mandatory reason + audit log, communication_status_history, enhanced template CRUD, schedules CRUD

**New DB tables (all idempotent):**
- `communication_event_mappings` — richer than notification_settings; adds primary_provider, fallback_provider, retry_policy, send_timing, attachment_policy, recipient_type; seeded from notification_settings with provider defaults (botbee/fast2sms/smtp/lemin/fcm)
- `communication_status_history` — per-notification status change log with FK to notification_logs
- `provider_health_status` — circuit breaker state per provider; seeded with 8 providers (botbee, meta, fast2sms, smtp, lemin, fcm, webpush, telegram)
- `communication_audit_logs` — all template/mapping/resend/circuit changes logged with actor/reason/IP
- `communication_schedules` — scheduled message records with idempotency_key UNIQUE

**New notification_logs columns (v35.1):**
canonical_event, is_test, is_manual_resend, original_log_id, rendered_preview, request_payload_safe, permanently_failed_at, next_retry_at, business_reference, scheduled_message_id

**New notification_templates columns (v35.2):**
provider_template_id, provider_template_name, approval_status, required_variables, optional_variables, fallback_template_id, last_tested_at, version, created_by, updated_by

**Frontend additions to CommunicationCenter.tsx:**
- 3 new tabs added: Event Mapping (🗺️), Provider Health (🏥), Audit Logs (🔍)
- EventMappingTab — full matrix view + edit modal per event×channel mapping
- ProviderHealthTab — live health check cards + circuit breaker state table + reset UI
- AuditLogsTab — paginated audit log viewer with action/entity filters

**What was NOT changed:**
- `notificationEngine.ts`, `workflowEngine.ts`, all provider libs — untouched
- All existing routes, migrations, Finance Phase 1 tables — intact
- Regression: 68/68 passing

**Why:**
task spec required one authoritative event mapping table, persisted provider health, audit trail for all comms changes, and centralized context/variable resolution. The existing notification_settings was too sparse; communication_event_mappings is the authoritative source going forward.

**How to apply:**
Any new notification feature should use `buildCommunicationContext()` before calling `fireNotificationEvent()`. Any template change should go through `/api/comm-mgmt/templates/:id` (not the old notification-center route) so audit logs are written. Circuit breaker resets require a reason and write to `communication_audit_logs`.
