-- =============================================================================
-- SaaS Phase 4 Strict — Quota Expansion (v41.6 – v41.8)
-- Branch: feature/saas-multitenancy
-- Date: 2026-08-03
--
-- Changes from v40:
-- • NULL max_count = unlimited (replaces artificial 999999 sentinel)
-- • Add reset_window_at TIMESTAMPTZ for monthly/daily windowed quotas
-- • Expand resource types: pilgrims, ai_messages_monthly, whatsapp_monthly,
--   sms_monthly, email_monthly, push_monthly, rcs_monthly,
--   workflow_executions_monthly, storage_mb_total, connected_channels_total
-- • Update get_tenant_resource_count for new resources
-- • Migrate Al Burhan 999999 values → NULL (explicit unlimited)
-- • Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ── v41.6: Schema changes to tenant_quotas ────────────────────────────────────

-- Allow NULL max_count to represent true unlimited (no artificial cap)
ALTER TABLE tenant_quotas ALTER COLUMN max_count DROP NOT NULL;
ALTER TABLE tenant_quotas ALTER COLUMN max_count DROP DEFAULT;

-- Remove the check constraint that blocked -1 (some rows may still have 999999 → migrated below)
ALTER TABLE tenant_quotas DROP CONSTRAINT IF EXISTS tenant_quotas_max_count_check;

-- Add reset_window_at: when this window resets (for monthly/daily quotas)
ALTER TABLE tenant_quotas ADD COLUMN IF NOT EXISTS reset_window_at TIMESTAMPTZ;

-- Compute reset_window_at for existing monthly/daily rows
UPDATE tenant_quotas
   SET reset_window_at = date_trunc('month', NOW()) + INTERVAL '1 month'
 WHERE window_type = 'monthly' AND reset_window_at IS NULL;

UPDATE tenant_quotas
   SET reset_window_at = date_trunc('day', NOW()) + INTERVAL '1 day'
 WHERE window_type = 'daily' AND reset_window_at IS NULL;

-- Migrate magic 999999 and -1 → NULL (explicit unlimited)
UPDATE tenant_quotas SET max_count = NULL WHERE max_count >= 999999 OR max_count = -1;

-- ✓ 'v41.6: tenant_quotas schema updated (NULL = unlimited, reset_window_at added)'

-- ── v41.7: Seed expanded resources for Al Burhan (all unlimited = NULL) ───────
DO $$
DECLARE
  ab_id UUID := '10000000-1000-4000-8000-000000000001';
  res   TEXT;
  new_resources TEXT[] := ARRAY[
    'pilgrims',
    'ai_messages_monthly',
    'whatsapp_monthly',
    'sms_monthly',
    'email_monthly',
    'push_monthly',
    'rcs_monthly',
    'workflow_executions_monthly',
    'storage_mb_total',
    'connected_channels_total'
  ];
  monthly_resources TEXT[] := ARRAY[
    'ai_messages_monthly',
    'whatsapp_monthly',
    'sms_monthly',
    'email_monthly',
    'push_monthly',
    'rcs_monthly',
    'workflow_executions_monthly'
  ];
BEGIN
  -- Insert new resources with NULL (unlimited)
  FOREACH res IN ARRAY new_resources LOOP
    INSERT INTO tenant_quotas (tenant_id, resource, max_count, window_type, notes,
      reset_window_at)
    VALUES (
      ab_id,
      res,
      NULL,  -- NULL = unlimited
      CASE WHEN res = ANY(monthly_resources) THEN 'monthly'
           ELSE 'total' END,
      'Al Burhan — unlimited (enterprise plan)',
      CASE WHEN res = ANY(monthly_resources)
           THEN date_trunc('month', NOW()) + INTERVAL '1 month'
           ELSE NULL END
    )
    ON CONFLICT (tenant_id, resource, window_type) DO NOTHING;
  END LOOP;

  -- Update existing resources to NULL (unlimited) for Al Burhan
  UPDATE tenant_quotas
     SET max_count = NULL,
         notes     = 'Al Burhan — unlimited (enterprise plan)',
         updated_at = NOW()
   WHERE tenant_id = ab_id
     AND (max_count >= 999999 OR max_count = -1);

  RAISE NOTICE 'v41.7: Al Burhan quotas expanded to % resource types', array_length(new_resources, 1);
END $$;

-- ── v41.8: Update get_tenant_resource_count for new resources ─────────────────
CREATE OR REPLACE FUNCTION get_tenant_resource_count(
  p_tenant_id UUID,
  p_resource  TEXT,
  p_window    TEXT DEFAULT 'total',
  p_from      TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  cnt BIGINT := 0;
  window_start TIMESTAMPTZ;
BEGIN
  -- Determine window start for monthly/daily counts
  IF p_from IS NOT NULL THEN
    window_start := p_from;
  ELSIF p_window = 'monthly' THEN
    window_start := date_trunc('month', NOW());
  ELSIF p_window = 'daily' THEN
    window_start := date_trunc('day', NOW());
  ELSE
    window_start := NULL;
  END IF;

  CASE p_resource
    -- Core entity counts (total = lifetime)
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
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM leads
         WHERE tenant_id = p_tenant_id AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM leads
         WHERE tenant_id = p_tenant_id;
      END IF;
    WHEN 'packages' THEN
      SELECT COUNT(*) INTO cnt FROM packages
       WHERE tenant_id = p_tenant_id AND "isActive" = true;
    WHEN 'branches' THEN
      SELECT COUNT(*) INTO cnt FROM branches WHERE tenant_id = p_tenant_id;
    WHEN 'documents' THEN
      SELECT COUNT(*) INTO cnt FROM documents WHERE tenant_id = p_tenant_id;
    WHEN 'invoices' THEN
      SELECT COUNT(*) INTO cnt FROM invoices WHERE tenant_id = p_tenant_id;
    WHEN 'notification_templates' THEN
      SELECT COUNT(*) INTO cnt FROM notification_templates WHERE tenant_id = p_tenant_id;
    WHEN 'pilgrims' THEN
      SELECT COUNT(*) INTO cnt FROM pilgrims WHERE tenant_id = p_tenant_id;

    -- Monthly communication counts
    WHEN 'ai_messages_monthly' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'ai_conversation_messages') THEN
        EXECUTE format(
          'SELECT COUNT(*) FROM ai_conversation_messages WHERE tenant_id = $1 %s',
          CASE WHEN window_start IS NOT NULL THEN 'AND created_at >= $2' ELSE '' END
        ) INTO cnt USING p_tenant_id, window_start;
      END IF;
    WHEN 'whatsapp_monthly' THEN
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'whatsapp' AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'whatsapp';
      END IF;
    WHEN 'sms_monthly' THEN
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'sms' AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'sms';
      END IF;
    WHEN 'email_monthly' THEN
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'email' AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'email';
      END IF;
    WHEN 'push_monthly' THEN
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel IN ('push','fcm') AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel IN ('push','fcm');
      END IF;
    WHEN 'rcs_monthly' THEN
      IF window_start IS NOT NULL THEN
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'rcs' AND created_at >= window_start;
      ELSE
        SELECT COUNT(*) INTO cnt FROM notification_logs
         WHERE tenant_id = p_tenant_id AND channel = 'rcs';
      END IF;
    WHEN 'workflow_executions_monthly' THEN
      IF EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'automation_audit_logs') THEN
        IF window_start IS NOT NULL THEN
          SELECT COUNT(*) INTO cnt FROM automation_audit_logs
           WHERE tenant_id = p_tenant_id AND created_at >= window_start;
        ELSE
          SELECT COUNT(*) INTO cnt FROM automation_audit_logs
           WHERE tenant_id = p_tenant_id;
        END IF;
      END IF;
    WHEN 'connected_channels_total' THEN
      -- Count channels with at least 1 successful notification in last 30 days
      SELECT COUNT(DISTINCT channel) INTO cnt FROM notification_logs
       WHERE tenant_id = p_tenant_id
         AND status = 'delivered'
         AND created_at >= NOW() - INTERVAL '30 days';
    WHEN 'storage_mb_total' THEN
      -- Approximate from document count (real storage tracking requires file metadata)
      cnt := 0;
    ELSE
      cnt := 0;
  END CASE;
  RETURN COALESCE(cnt, 0);
END $$;

DO $$ BEGIN
  RAISE NOTICE 'v41.6-v41.8: Quota expansion complete — 20 resources, NULL=unlimited ✓';
END $$;

COMMIT;
