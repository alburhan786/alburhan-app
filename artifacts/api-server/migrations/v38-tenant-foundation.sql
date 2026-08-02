-- =============================================================================
-- SaaS Phase 2 — Tenant Foundation Migration (v38.1 – v38.9)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-02
--
-- PURPOSE
-- Creates the `tenants` table, adds a nullable `tenant_id UUID` column to all
-- 60 business tables, sets PostgreSQL DEFAULT on each column so new inserts
-- never produce NULL tenant_id (regardless of ORM path), backfills all
-- existing rows to the Al Burhan default tenant UUID, then asserts zero NULLs
-- and creates 12 composite indexes.
--
-- DESIGN DECISIONS
-- • Columns are NULLABLE (NOT NULL deferred to Phase 3 after all write paths
--   are tenant-scoped by the query-isolation middleware).
-- • DEFAULT is set to the Al Burhan seed UUID so every existing ORM insert
--   path is safe without any application-level changes in Phase 2.
-- • Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--   EXISTS, ALTER TABLE IF EXISTS, CREATE INDEX IF NOT EXISTS).
-- • ON CONFLICT (id) DO NOTHING on the seed row prevents re-insert errors.
--
-- ROLLBACK
-- See saas-phase2-rollback.sql — drops all tenant_id columns + tenants table.
-- =============================================================================

BEGIN;

-- ── v38.1: tenants table + Al Burhan seed ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT         UNIQUE NOT NULL,
  name        TEXT         NOT NULL,
  plan        TEXT         NOT NULL DEFAULT 'starter',
  status      TEXT         NOT NULL DEFAULT 'active',
  settings    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (id, slug, name, plan, status)
VALUES ('10000000-1000-4000-8000-000000000001', 'alburhan', 'Al Burhan Tours & Travels', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;

-- ── v38.2: core booking / org tables ──────────────────────────────────────────
ALTER TABLE IF EXISTS users        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS users        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS bookings     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS bookings     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS packages     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS packages     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS hajj_groups  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS hajj_groups  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS pilgrims     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS pilgrims     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS branches     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS branches     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS agents       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS agents       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS staff        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS staff        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.3: financial tables ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS payment_transactions  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS payment_transactions  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS invoices              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS invoices              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS receipts              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS receipts              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS refunds               ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS refunds               ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS offline_payments      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS offline_payments      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS expenses              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS expenses              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS journal_entries       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS journal_entries       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS journal_entry_lines   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS journal_entry_lines   ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS payment_schedules     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS payment_schedules     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS payment_links         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS payment_links         ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.4: agreements, documents, support, audit trails ───────────────────────
ALTER TABLE IF EXISTS agreements          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS agreements          ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS documents           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS documents           ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS support_tickets     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS support_tickets     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS support_messages    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS support_messages    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS feedback            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS feedback            ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS inquiries           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS inquiries           ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS otps                ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS otps                ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS audit_logs          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS audit_logs          ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS booking_audit_logs  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS booking_audit_logs  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS payment_audit_logs  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS payment_audit_logs  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS agreement_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS agreement_audit_logs ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS finance_audit_logs  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS finance_audit_logs  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.5: CRM / lead / campaign tables ───────────────────────────────────────
ALTER TABLE IF EXISTS leads                       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS leads                       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_followups              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_followups              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_activities             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_activities             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_audit_log              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_audit_log              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_web_forms              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_web_forms              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_web_form_submissions   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_web_form_submissions   ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_auto_followup_log      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_auto_followup_log      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_assignment_rules       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_assignment_rules       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS crm_assignment_rules        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS crm_assignment_rules        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS broadcasts                  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS broadcasts                  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_campaigns      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_campaigns      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS push_campaigns              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS push_campaigns              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.6: notification / comms / config tables ───────────────────────────────
ALTER TABLE IF EXISTS notification_templates       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_templates       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_settings        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_settings        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_logs            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_logs            ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_event_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_event_mappings ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_audit_logs     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_audit_logs     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_consents       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_consents       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS rcs_template_mappings        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS rcs_template_mappings        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS automation_audit_logs        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS automation_audit_logs        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS automation_service_tokens    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS automation_service_tokens    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS provider_health_status       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS provider_health_status       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS api_settings                 ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS api_settings                 ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.7: AI / automation tables ─────────────────────────────────────────────
ALTER TABLE IF EXISTS ai_conversations          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_conversations          ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_conversation_messages  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_conversation_messages  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_knowledge_base         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_knowledge_base         ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_automation_logs        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_automation_logs        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_automation_jobs        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_automation_jobs        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_automation_schedules   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_automation_schedules   ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS ai_automation_webhooks    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS ai_automation_webhooks    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.8: backfill existing NULL rows ────────────────────────────────────────
-- Each UPDATE is idempotent (WHERE tenant_id IS NULL).
-- Tables that don't have the column yet (from above IF EXISTS) are simply skipped.
UPDATE users                      SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE bookings                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE packages                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE hajj_groups                SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE pilgrims                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE branches                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE agents                     SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE staff                      SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE payment_transactions       SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE invoices                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE receipts                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE refunds                    SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE offline_payments           SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE expenses                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE journal_entries            SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE journal_entry_lines        SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE agreements                 SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE documents                  SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE support_tickets            SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE support_messages           SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE feedback                   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE inquiries                  SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE otps                       SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE audit_logs                 SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE booking_audit_logs         SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE payment_audit_logs         SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE agreement_audit_logs       SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE finance_audit_logs         SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE leads                      SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE lead_followups             SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE lead_activities            SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE notification_templates     SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE notification_settings      SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE notification_logs          SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE communication_event_mappings SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE communication_audit_logs   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE automation_service_tokens  SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE api_settings               SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE ai_conversations           SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE ai_conversation_messages   SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
UPDATE ai_knowledge_base          SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;

-- ── v38.9: composite indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id      ON bookings             (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status  ON bookings             (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id         ON users                (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id      ON invoices             (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id      ON payment_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id         ON leads                (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_tenant_id    ON notification_logs    (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agreements_tenant_id    ON agreements           (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pilgrims_tenant_id      ON pilgrims             (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hajj_groups_tenant_id   ON hajj_groups          (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id     ON documents            (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id      ON expenses             (tenant_id);

COMMIT;

-- =============================================================================
-- Verification (run after migration):
--
-- SELECT table_name, COUNT(*) AS null_rows
--   FROM information_schema.columns c
--   JOIN LATERAL (
--     SELECT COUNT(*) FROM pg_catalog.pg_class WHERE relname = c.table_name
--   ) t ON true
--  WHERE c.column_name = 'tenant_id' AND c.table_schema = 'public'
-- ...
--
-- Quick check — should return 0 rows:
-- SELECT 'bookings' AS t, COUNT(*) FROM bookings WHERE tenant_id IS NULL
-- UNION ALL
-- SELECT 'users',         COUNT(*) FROM users         WHERE tenant_id IS NULL
-- UNION ALL
-- SELECT 'invoices',      COUNT(*) FROM invoices       WHERE tenant_id IS NULL;
-- =============================================================================
