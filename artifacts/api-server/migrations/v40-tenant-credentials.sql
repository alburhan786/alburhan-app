-- =============================================================================
-- SaaS Phase 4.2 — Tenant Credential Isolation (v40.4 – v40.6)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- DESIGN
-- • tenant_credentials — per-tenant encrypted API keys / secrets
-- • Values encrypted with AES-256-GCM; key derived from SESSION_SECRET
-- • iv + auth_tag stored alongside ciphertext (all base64)
-- • Al Burhan default tenant falls back to global env vars for backward compat
-- • Also adds tenant_id to vendors + marketing_campaigns (Phase 3 gap tables)
-- • Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ── v40.4: tenant_credentials table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_credentials (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_name        TEXT         NOT NULL,
  encrypted_value TEXT         NOT NULL,
  iv              TEXT         NOT NULL,
  auth_tag        TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_credentials_tenant
  ON tenant_credentials (tenant_id);

-- ── v40.5: vendors — add tenant_id (table was not in v38/v39 scope) ──────────
ALTER TABLE IF EXISTS vendors
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS vendors
  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

DO $$
DECLARE
  null_ct BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='vendors' AND column_name='tenant_id') THEN
    SELECT COUNT(*) INTO null_ct FROM vendors WHERE tenant_id IS NULL;
    IF null_ct > 0 THEN
      UPDATE vendors SET tenant_id = '10000000-1000-4000-8000-000000000001' WHERE tenant_id IS NULL;
      RAISE NOTICE 'v40.5: backfilled % vendors rows with default tenant_id', null_ct;
    END IF;
    -- Promote to NOT NULL
    ALTER TABLE vendors ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_tenant
  ON vendors (tenant_id) WHERE tenant_id IS NOT NULL;

-- ── v40.6: marketing_campaigns — add tenant_id (added by analytics.ts migration) ──
ALTER TABLE IF EXISTS marketing_campaigns
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE IF EXISTS marketing_campaigns
  ALTER COLUMN tenant_id SET DEFAULT '10000000-1000-4000-8000-000000000001';

DO $$
DECLARE
  null_ct BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='marketing_campaigns'
              AND column_name='tenant_id') THEN
    SELECT COUNT(*) INTO null_ct FROM marketing_campaigns WHERE tenant_id IS NULL;
    IF null_ct > 0 THEN
      UPDATE marketing_campaigns
         SET tenant_id = '10000000-1000-4000-8000-000000000001'
       WHERE tenant_id IS NULL;
      RAISE NOTICE 'v40.6: backfilled % marketing_campaigns rows', null_ct;
    END IF;
    ALTER TABLE marketing_campaigns ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant
  ON marketing_campaigns (tenant_id) WHERE tenant_id IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE 'v40.4-v40.6: tenant_credentials + gap-table tenant_id columns created ✓';
END $$;

COMMIT;
