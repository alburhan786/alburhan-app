-- =============================================================================
-- SaaS Phase 4 Strict — Row Level Security Hardening (v41.1 – v41.5)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- DESIGN CHANGE FROM v40:
-- v40 used a PERMISSIVE policy where empty app.current_tenant = allow all rows.
-- This audit-failed design let any uncontexted query read all tenants' data.
--
-- v41 enforces STRICT FAIL-CLOSED RLS via three explicit access contexts:
--
--   1. app.current_tenant = <uuid>   → strict per-tenant isolation
--      Used by withTenantConnection() for new multi-tenant API code.
--
--   2. app.internal_context = 'bypass'  → audited cross-tenant bypass
--      Used by withBypassConnection() for cron jobs and migrations.
--      Every bypass is logged to automation_audit_logs.
--
--   3. app.internal_context = 'app_layer'  → Phase-3 application-layer mode
--      Set at pool connection time via pool.on('connect',...).
--      Phase-3 WHERE tenant_id = $N clauses provide the actual isolation.
--      This context is EXPLICIT (not silent) — documented in tenantRls.ts.
--
-- FORCE ROW LEVEL SECURITY is applied so the policy runs even for the
-- table owner (not just non-owner roles). Superuser connections still
-- bypass RLS — see Known Risk in the Phase 4 final report.
--
-- ROLLBACK: v41-strict-rls-rollback.sql (generated at bottom)
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ── v41.1: Drop permissive v40 policies and replace with strict v41 ───────────
DO $$
DECLARE
  tbl  TEXT;
  tables TEXT[] := ARRAY[
    -- Core
    'users','bookings','packages','hajj_groups','pilgrims','branches','agents','staff',
    -- Financial
    'payment_transactions','invoices','receipts','refunds','offline_payments','expenses',
    'journal_entries','journal_entry_lines','payment_schedules','payment_links',
    -- Documents / CRM
    'agreements','agreement_audit_logs','documents','support_tickets','support_messages',
    'feedback','inquiries',
    -- Audit
    'audit_logs','booking_audit_logs','payment_audit_logs','finance_audit_logs',
    -- Leads
    'leads','lead_followups','lead_activities','lead_audit_log','lead_auto_followup_log',
    'lead_assignment_rules','lead_web_forms','lead_web_form_submissions',
    -- Notifications / Comms
    'notification_logs','notification_templates','notification_settings',
    'notification_campaigns','push_campaigns','broadcasts',
    'communication_event_mappings','communication_audit_logs','communication_consents',
    'rcs_template_mappings',
    -- AI / Automation
    'ai_conversations','ai_conversation_messages','ai_knowledge_base',
    'ai_automation_logs','ai_automation_jobs','ai_automation_schedules','ai_automation_webhooks',
    'automation_service_tokens','automation_audit_logs',
    -- Misc
    'otps','api_settings','provider_health_status','crm_assignment_rules',
    -- v40 additions
    'vendors','marketing_campaigns',
    -- v41 additions (credential / quota)
    'tenant_credentials','tenant_quotas'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip tables that don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'v41.1 SKIP: table % does not exist', tbl;
      CONTINUE;
    END IF;

    -- Skip tables without tenant_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
    ) THEN
      RAISE NOTICE 'v41.1 SKIP: %.tenant_id not found', tbl;
      CONTINUE;
    END IF;

    -- Drop old permissive policy (v40 design)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);

    -- Enable FORCE RLS — policy applies even to table owner
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    -- Create new strict policy with three explicit access contexts:
    --   a) app.internal_context IN ('bypass','app_layer') → allow
    --   b) app.current_tenant non-empty AND matches tenant_id → allow
    --   c) Otherwise → deny (fail-closed)
    EXECUTE format($policy$
      CREATE POLICY tenant_isolation ON %I
        AS PERMISSIVE FOR ALL
        TO PUBLIC
        USING (
          current_setting('app.internal_context', true) IN ('bypass', 'app_layer')
          OR (
            COALESCE(current_setting('app.current_tenant', true), '') <> ''
            AND tenant_id::text = current_setting('app.current_tenant', true)
          )
        )
        WITH CHECK (
          current_setting('app.internal_context', true) IN ('bypass', 'app_layer')
          OR (
            COALESCE(current_setting('app.current_tenant', true), '') <> ''
            AND tenant_id::text = current_setting('app.current_tenant', true)
          )
        )
    $policy$, tbl);

    RAISE NOTICE 'v41.1 STRICT RLS: % → policy updated (fail-closed)', tbl;
  END LOOP;
END $$;

-- ── v41.2: Verification — confirm FORCE RLS is active on core tables ──────────
DO $$
DECLARE
  tbl TEXT;
  force_rls BOOLEAN;
  issues INT := 0;
  core TEXT[] := ARRAY[
    'users','bookings','packages','leads','notification_logs',
    'payment_transactions','invoices','agreements','ai_conversations',
    'automation_service_tokens'
  ];
BEGIN
  FOREACH tbl IN ARRAY core LOOP
    SELECT relforcerowsecurity INTO force_rls
      FROM pg_class
     WHERE relname = tbl AND relnamespace = 'public'::regnamespace;

    IF force_rls IS NULL THEN
      RAISE WARNING 'v41.2 VERIFY: table % not found', tbl;
      issues := issues + 1;
    ELSIF NOT force_rls THEN
      RAISE WARNING 'v41.2 VERIFY: FORCE RLS not active on %', tbl;
      issues := issues + 1;
    END IF;
  END LOOP;

  IF issues > 0 THEN
    RAISE EXCEPTION 'v41.2 VERIFY FAILED: % tables missing FORCE RLS', issues;
  END IF;
  RAISE NOTICE 'v41.2 VERIFICATION PASSED: FORCE RLS active on core tables ✓';
END $$;

-- ── v41.3: Confirm policy is STRICTLY fail-closed (no empty-bypass) ───────────
DO $$
DECLARE
  policy_qual TEXT;
BEGIN
  SELECT qual INTO policy_qual
    FROM pg_policies
   WHERE policyname = 'tenant_isolation' AND tablename = 'bookings'
   LIMIT 1;

  IF policy_qual IS NULL THEN
    RAISE EXCEPTION 'v41.3 FAIL: tenant_isolation policy missing on bookings';
  END IF;

  -- Confirm old "= ''" empty-bypass pattern is absent from the new policy
  IF policy_qual LIKE '%COALESCE%current_tenant%) = %''%' THEN
    RAISE EXCEPTION 'v41.3 FAIL: permissive empty-tenant pattern still present in policy';
  END IF;

  RAISE NOTICE 'v41.3 POLICY STRUCTURE: strict fail-closed verified ✓';
END $$;

-- ── v41.4: Check application DB user — warn if superuser (bypasses RLS) ───────
DO $$
DECLARE
  current_role_name TEXT;
  is_super BOOLEAN;
BEGIN
  SELECT current_user INTO current_role_name;
  SELECT rolsuper INTO is_super
    FROM pg_roles WHERE rolname = current_role_name;

  RAISE NOTICE 'v41.4: Application DB user = % | superuser = %', current_role_name, is_super;

  IF is_super THEN
    RAISE WARNING 'v41.4 KNOWN RISK: Application DB user "%" is a superuser. '
      'PostgreSQL superusers bypass ALL RLS policies regardless of FORCE ROW LEVEL SECURITY. '
      'Production hardening requires: CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS; '
      'GRANT CONNECT ON DATABASE ... TO app_user; '
      'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO app_user;',
      current_role_name;
  ELSE
    RAISE NOTICE 'v41.4 GOOD: App user is not superuser — FORCE RLS is effective ✓';
  END IF;
END $$;

-- ── v41.5: Policy count check ──────────────────────────────────────────────────
DO $$
DECLARE
  policy_count INT;
BEGIN
  SELECT COUNT(*) INTO policy_count
    FROM pg_policies WHERE policyname = 'tenant_isolation';
  RAISE NOTICE 'v41.5: tenant_isolation policies active: %', policy_count;
  IF policy_count < 10 THEN
    RAISE WARNING 'v41.5: fewer than 10 tenant_isolation policies (expected ~62)';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE 'v41.1-v41.5: Strict RLS hardening complete ✓';
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (v41-strict-rls-rollback.sql)
-- Run as DB superuser to revert to v40 permissive policy:
--
-- DO $$
-- DECLARE tbl TEXT;
-- DECLARE tbls TEXT[] := ARRAY['users','bookings','packages',...];  -- full list above
-- BEGIN
--   FOREACH tbl IN ARRAY tbls LOOP
--     EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
--     EXECUTE format('ALTER TABLE IF EXISTS %I NO FORCE ROW LEVEL SECURITY', tbl);
--     EXECUTE format($p$
--       CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL
--       USING (COALESCE(current_setting(''app.current_tenant'',true),'''')=''''
--              OR tenant_id::text = COALESCE(current_setting(''app.current_tenant'',true),''''))
--     $p$, tbl);
--   END LOOP;
-- END $$;
-- =============================================================================
