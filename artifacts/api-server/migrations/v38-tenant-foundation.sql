-- =============================================================================
-- SaaS Phase 2 — Tenant Foundation Migration (v38.1 – v38.9)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-02
--
-- AUTHORITATIVE EXECUTION PATH
-- This SQL file is the single source of truth for the v38 migration.
-- It is executed at startup by the API server (index.ts v38 block).
-- It can also be applied manually: psql $DATABASE_URL -f v38-tenant-foundation.sql
--
-- DESIGN
-- • Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS / to_regclass guards).
-- • All backfill and index DDL inside DO $$ blocks guarded by to_regclass()
--   so no absent optional table can abort the transaction.
-- • Columns are NULLABLE — NOT NULL deferred to Phase 3.
-- • SET DEFAULT '10000000-1000-4000-8000-000000000001' on every tenant_id
--   column so ALL insert paths (Drizzle ORM, raw SQL, future code) produce
--   non-NULL tenant_id without any application-level changes in Phase 2.
-- • Al Burhan fixed UUID: 10000000-1000-4000-8000-000000000001
--
-- ROLLBACK: see saas-phase2-rollback.sql
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
ALTER TABLE IF EXISTS agreements            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS agreements            ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS documents             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS documents             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS support_tickets       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS support_tickets       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS support_messages      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS support_messages      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS feedback              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS feedback              ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS inquiries             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS inquiries             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS otps                  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS otps                  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS audit_logs            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS audit_logs            ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS booking_audit_logs    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS booking_audit_logs    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS payment_audit_logs    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS payment_audit_logs    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS agreement_audit_logs  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS agreement_audit_logs  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS finance_audit_logs    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS finance_audit_logs    ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.5: CRM / lead / campaign tables ───────────────────────────────────────
ALTER TABLE IF EXISTS leads                      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS leads                      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_followups             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_followups             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_activities            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_activities            ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_audit_log             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_audit_log             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_web_forms             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_web_forms             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_web_form_submissions  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_web_form_submissions  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_auto_followup_log     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_auto_followup_log     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS lead_assignment_rules      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS lead_assignment_rules      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS crm_assignment_rules       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS crm_assignment_rules       ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS broadcasts                 ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS broadcasts                 ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_campaigns     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_campaigns     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS push_campaigns             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS push_campaigns             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

-- ── v38.6: notification / comms / config tables ───────────────────────────────
ALTER TABLE IF EXISTS notification_templates        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_templates        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_settings         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_settings         ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS notification_logs             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS notification_logs             ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_event_mappings  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_event_mappings  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_audit_logs      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_audit_logs      ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS communication_consents        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS communication_consents        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS rcs_template_mappings         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS rcs_template_mappings         ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS automation_audit_logs         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS automation_audit_logs         ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS automation_service_tokens     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS automation_service_tokens     ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS provider_health_status        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS provider_health_status        ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';
ALTER TABLE IF EXISTS api_settings                  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS api_settings                  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

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

-- ── v38.8: safe backfill using to_regclass() guards ───────────────────────────
-- Each table is individually guarded: if the relation does not exist in this
-- deployment or the column was not added, the UPDATE is skipped without
-- aborting the transaction.
DO $$
DECLARE
  tbl  TEXT;
  n    BIGINT;
  tot  BIGINT := 0;
  abt  CONSTANT UUID := '10000000-1000-4000-8000-000000000001';
  tbls TEXT[] := ARRAY[
    'users','bookings','packages','hajj_groups','pilgrims','branches','agents','staff',
    'payment_transactions','invoices','receipts','refunds','offline_payments',
    'expenses','journal_entries','journal_entry_lines','payment_schedules','payment_links',
    'agreements','documents','support_tickets','support_messages',
    'feedback','inquiries','otps',
    'audit_logs','booking_audit_logs','payment_audit_logs','agreement_audit_logs','finance_audit_logs',
    'leads','lead_followups','lead_activities','lead_audit_log',
    'lead_web_forms','lead_web_form_submissions','lead_auto_followup_log',
    'lead_assignment_rules','crm_assignment_rules',
    'broadcasts','notification_campaigns','push_campaigns',
    'notification_templates','notification_settings','notification_logs',
    'communication_event_mappings','communication_audit_logs','communication_consents',
    'rcs_template_mappings','automation_audit_logs','automation_service_tokens',
    'provider_health_status','api_settings',
    'ai_conversations','ai_conversation_messages','ai_knowledge_base',
    'ai_automation_logs','ai_automation_jobs','ai_automation_schedules','ai_automation_webhooks'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE 'v38.8 skip backfill % (table absent)', tbl;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      RAISE NOTICE 'v38.8 skip backfill % (tenant_id column absent)', tbl;
      CONTINUE;
    END IF;
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl)
      USING abt;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE 'v38.8 backfilled % rows in %', n, tbl;
    END IF;
    tot := tot + n;
  END LOOP;
  RAISE NOTICE 'v38.8 backfill complete: % total rows across % tables', tot, array_length(tbls,1);
END $$;

-- ── v38.9a: safe composite indexes using to_regclass() and TEXT[] parallel arrays
-- Uses three parallel TEXT[] arrays (valid PL/pgSQL) — not RECORD[].
DO $$
DECLARE
  i          INT;
  idx_names  TEXT[] := ARRAY[
    'idx_bookings_tenant_id',     'idx_bookings_tenant_status',
    'idx_users_tenant_id',        'idx_invoices_tenant_id',
    'idx_payments_tenant_id',     'idx_leads_tenant_id',
    'idx_notif_logs_tenant_id',   'idx_agreements_tenant_id',
    'idx_pilgrims_tenant_id',     'idx_hajj_groups_tenant_id',
    'idx_documents_tenant_id',    'idx_expenses_tenant_id'
  ];
  idx_tables TEXT[] := ARRAY[
    'bookings',            'bookings',
    'users',               'invoices',
    'payment_transactions','leads',
    'notification_logs',   'agreements',
    'pilgrims',            'hajj_groups',
    'documents',           'expenses'
  ];
  idx_cols   TEXT[] := ARRAY[
    'tenant_id',           'tenant_id, status',
    'tenant_id',           'tenant_id',
    'tenant_id',           'tenant_id',
    'tenant_id',           'tenant_id',
    'tenant_id',           'tenant_id',
    'tenant_id',           'tenant_id'
  ];
BEGIN
  FOR i IN 1..array_length(idx_names, 1) LOOP
    IF to_regclass('public.' || idx_tables[i]) IS NULL THEN
      RAISE NOTICE 'v38.9 skip index % (table % absent)', idx_names[i], idx_tables[i];
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = idx_names[i]) THEN
      EXECUTE format('CREATE INDEX %I ON %I (%s)', idx_names[i], idx_tables[i], idx_cols[i]);
      RAISE NOTICE 'v38.9 created index %', idx_names[i];
    ELSE
      RAISE NOTICE 'v38.9 index % already exists', idx_names[i];
    END IF;
  END LOOP;
END $$;

-- ── v38.9b: strict assertion — raises EXCEPTION if required tables have NULL rows
-- This aborts the transaction on any integrity violation so the caller knows
-- the migration did not complete successfully.
DO $$
DECLARE
  tbl        TEXT;
  null_count BIGINT;
  issues     INT := 0;
  required   TEXT[] := ARRAY[
    'users','bookings','packages','pilgrims',
    'payment_transactions','invoices','agreements','documents',
    'leads','notification_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      RAISE WARNING 'v38.9 ASSERT FAIL: %.tenant_id column is MISSING', tbl;
      issues := issues + 1;
      CONTINUE;
    END IF;
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL', tbl) INTO null_count;
    IF null_count > 0 THEN
      RAISE WARNING 'v38.9 ASSERT FAIL: % has % rows with tenant_id IS NULL', tbl, null_count;
      issues := issues + 1;
    END IF;
  END LOOP;

  IF issues > 0 THEN
    RAISE EXCEPTION
      'v38.9 assertion FAILED: % required table(s) have missing column or NULL tenant_id. '
      'Roll back and investigate before proceeding to Phase 3.',
      issues;
  END IF;

  RAISE NOTICE 'v38.9 assertion PASSED — all % required tables fully tenantized', array_length(required,1);
END $$;

COMMIT;
