-- =============================================================================
-- SaaS Phase 4.1 — Tenant Quota Enforcement (v40.1 – v40.3)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- DESIGN
-- • tenant_quotas  — per-tenant per-resource hard limits
-- • Default Al Burhan quotas: essentially unlimited (999999 = no effective cap)
-- • resource names: bookings | users | staff | agents | leads | packages
-- • window_type:   total (lifetime cap) | monthly | daily
-- • -1 = unlimited (special sentinel)
-- • Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ── v40.1: tenant_quotas table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_quotas (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource     TEXT         NOT NULL,
  max_count    INTEGER      NOT NULL DEFAULT 999999 CHECK (max_count = -1 OR max_count >= 0),
  window_type  TEXT         NOT NULL DEFAULT 'total' CHECK (window_type IN ('total','monthly','daily')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource, window_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant
  ON tenant_quotas (tenant_id);

-- ── v40.2: seed default Al Burhan quotas (unlimited) ─────────────────────────
-- 999999 chosen over -1 so COUNT(*) comparisons are always numeric.
-- To impose real limits for new tenants, INSERT rows with lower max_count.
DO $$
DECLARE
  ab_id UUID := '10000000-1000-4000-8000-000000000001';
  resources TEXT[] := ARRAY['bookings','users','staff','agents','leads','packages',
                             'branches','documents','invoices','notification_templates'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY resources LOOP
    INSERT INTO tenant_quotas (tenant_id, resource, max_count, window_type, notes)
    VALUES (ab_id, r, 999999, 'total', 'Al Burhan default — unlimited')
    ON CONFLICT (tenant_id, resource, window_type) DO NOTHING;
  END LOOP;
  RAISE NOTICE 'v40.2: seeded default Al Burhan unlimited quotas for % resources', array_length(resources, 1);
END $$;

-- ── v40.3: get_tenant_resource_count helper function ──────────────────────────
CREATE OR REPLACE FUNCTION get_tenant_resource_count(
  p_tenant_id UUID,
  p_resource  TEXT
) RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  cnt BIGINT := 0;
BEGIN
  CASE p_resource
    WHEN 'bookings' THEN
      SELECT COUNT(*) INTO cnt FROM bookings
       WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
    WHEN 'users' THEN
      SELECT COUNT(*) INTO cnt FROM users
       WHERE tenant_id = p_tenant_id;
    WHEN 'staff' THEN
      SELECT COUNT(*) INTO cnt FROM staff
       WHERE tenant_id = p_tenant_id AND status != 'terminated';
    WHEN 'agents' THEN
      SELECT COUNT(*) INTO cnt FROM agents
       WHERE tenant_id = p_tenant_id;
    WHEN 'leads' THEN
      SELECT COUNT(*) INTO cnt FROM leads
       WHERE tenant_id = p_tenant_id;
    WHEN 'packages' THEN
      SELECT COUNT(*) INTO cnt FROM packages
       WHERE tenant_id = p_tenant_id AND "isActive" = true;
    WHEN 'branches' THEN
      SELECT COUNT(*) INTO cnt FROM branches
       WHERE tenant_id = p_tenant_id;
    WHEN 'documents' THEN
      SELECT COUNT(*) INTO cnt FROM documents
       WHERE tenant_id = p_tenant_id;
    WHEN 'invoices' THEN
      SELECT COUNT(*) INTO cnt FROM invoices
       WHERE tenant_id = p_tenant_id;
    WHEN 'notification_templates' THEN
      SELECT COUNT(*) INTO cnt FROM notification_templates
       WHERE tenant_id = p_tenant_id;
    ELSE
      cnt := 0;
  END CASE;
  RETURN cnt;
END $$;

DO $$ BEGIN
  RAISE NOTICE 'v40.1-v40.3: tenant quota tables + function created/verified ✓';
END $$;

COMMIT;
