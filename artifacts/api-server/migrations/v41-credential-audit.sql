-- =============================================================================
-- SaaS Phase 4 Strict — Credential Audit & Key Rotation (v41.9 – v41.11)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- Changes from v40:
-- • Add key_version INT to tenant_credentials (increment on rotation)
-- • Add rotated_at TIMESTAMPTZ to tenant_credentials
-- • Add previous_key_hash TEXT (SHA-256 of ciphertext, for audit continuity)
-- • Create credential_access_logs table (who accessed what, when, from where)
-- • Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ── v41.9: Extend tenant_credentials with rotation fields ─────────────────────
ALTER TABLE tenant_credentials
  ADD COLUMN IF NOT EXISTS key_version  INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rotated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_key_hash TEXT;

-- Index for version lookups
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_version
  ON tenant_credentials (tenant_id, key_name, key_version);

-- ✓ 'v41.9: tenant_credentials rotation columns added'

-- ── v41.10: Create credential_access_logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS credential_access_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_name    TEXT        NOT NULL,
  operation   TEXT        NOT NULL CHECK (operation IN ('get','set','delete','rotate','list','check')),
  accessed_by TEXT,       -- user_id, 'system', or cron identifier
  client_ip   TEXT,       -- IP from request headers (stored as TEXT for IPv4/IPv6)
  success     BOOLEAN     NOT NULL DEFAULT TRUE,
  key_version INT,        -- which version was accessed/set
  notes       TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_cred_access_logs_tenant
  ON credential_access_logs (tenant_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cred_access_logs_key
  ON credential_access_logs (tenant_id, key_name, accessed_at DESC);

-- ✓ 'v41.10: credential_access_logs table created'

-- ── v41.11: Verification ───────────────────────────────────────────────────────
DO $$
DECLARE
  issues INT := 0;
BEGIN
  -- Check key_version exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tenant_credentials' AND column_name = 'key_version'
  ) THEN
    RAISE WARNING 'v41.11: tenant_credentials.key_version missing';
    issues := issues + 1;
  END IF;

  -- Check credential_access_logs exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'credential_access_logs'
  ) THEN
    RAISE WARNING 'v41.11: credential_access_logs table missing';
    issues := issues + 1;
  END IF;

  IF issues > 0 THEN
    RAISE EXCEPTION 'v41.11 VERIFY FAILED: % issues', issues;
  END IF;
  RAISE NOTICE 'v41.11 VERIFICATION PASSED: credential audit tables ready ✓';
END $$;

DO $$ BEGIN
  RAISE NOTICE 'v41.9-v41.11: Credential audit & rotation support complete ✓';
END $$;

COMMIT;
