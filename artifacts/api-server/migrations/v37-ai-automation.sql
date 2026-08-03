-- v37 — AI Automation Module (extracted from index.ts v37.1–v37.5)
-- Creates: automation_service_tokens, ai_conversations, ai_conversation_messages,
--          automation_audit_logs, ai_knowledge_base
-- Safe to re-run: all CREATE TABLE / CREATE INDEX use IF NOT EXISTS
-- Run this BEFORE v41-strict-rls to satisfy its v41.2 core-table verification.

-- ── v37.1 — automation_service_tokens ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_service_tokens (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token_name    TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_ips   JSONB,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  created_by    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ast_hash_idx   ON automation_service_tokens(token_hash);
CREATE INDEX IF NOT EXISTS ast_active_idx ON automation_service_tokens(is_active) WHERE is_active = true;

-- ── v37.2 — ai_conversations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_key          TEXT NOT NULL UNIQUE,
  channel                   TEXT NOT NULL,
  external_contact_id       TEXT,
  customer_id               TEXT,
  lead_id                   TEXT,
  booking_id                TEXT,
  customer_name             TEXT,
  mobile_masked             TEXT,
  language                  TEXT NOT NULL DEFAULT 'en',
  status                    TEXT NOT NULL DEFAULT 'ai_active'
                              CHECK (status IN ('ai_active','human_required','human_active','closed')),
  last_ai_message_at        TIMESTAMPTZ,
  last_customer_message_at  TIMESTAMPTZ,
  closed_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ac_key_idx    ON ai_conversations(conversation_key);
CREATE INDEX IF NOT EXISTS ac_status_idx ON ai_conversations(status);
CREATE INDEX IF NOT EXISTS ac_channel_idx ON ai_conversations(channel);

-- ── v37.3 — ai_conversation_messages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id      TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  direction            TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type          TEXT NOT NULL CHECK (sender_type IN ('customer','ai','staff','system')),
  channel              TEXT NOT NULL,
  message_type         TEXT NOT NULL DEFAULT 'text',
  message_text         TEXT NOT NULL,
  provider_message_id  TEXT,
  request_id           TEXT,
  ai_model             TEXT,
  tool_calls           JSONB,
  confidence           NUMERIC(4,3),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acm_conv_idx ON ai_conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS acm_dir_idx  ON ai_conversation_messages(direction);

-- ── v37.4 — automation_audit_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_audit_logs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_type   TEXT NOT NULL DEFAULT 'service_token',
  actor_id     TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  request_id   TEXT,
  ip_address   TEXT,
  before_data  JSONB,
  after_data   JSONB,
  result       TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure')),
  error_code   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aal_actor_idx  ON automation_audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aal_action_idx ON automation_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS aal_entity_idx ON automation_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS aal_idem_idx   ON automation_audit_logs((after_data->>'idempotency_key'))
  WHERE after_data->>'idempotency_key' IS NOT NULL;

-- ── v37.5 — ai_knowledge_base ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category         TEXT NOT NULL,
  question         TEXT NOT NULL,
  answer           TEXT NOT NULL,
  language         TEXT NOT NULL DEFAULT 'en',
  tags             JSONB,
  sort_order       INTEGER,
  version          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','approved','archived')),
  approval_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  last_reviewed_at TIMESTAMPTZ,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS akb_cat_idx    ON ai_knowledge_base(category, sort_order NULLS LAST);
CREATE INDEX IF NOT EXISTS akb_status_idx ON ai_knowledge_base(status, is_active);
CREATE INDEX IF NOT EXISTS akb_lang_idx   ON ai_knowledge_base(language);

-- ai_assistant_enabled kill-switch in api_settings
INSERT INTO api_settings (key, value, provider, enabled, updated_at)
VALUES ('ai_assistant_enabled', 'false', 'ai_automation', false, NOW())
ON CONFLICT (key) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE 'v37 complete: automation_service_tokens, ai_conversations, ai_conversation_messages, automation_audit_logs, ai_knowledge_base ensured';
END $$;
