---
name: AI Automation API Foundation
description: Architecture, security model, and activation instructions for the /api/automation/* service-token API (V1.0)
---

## Tables created (v37.1–v37.5)
- `automation_service_tokens` — token_hash (SHA-256), scopes JSONB, allowed_ips JSONB, is_active, expires_at, revoked_at, last_used_at
- `ai_conversations` — conversation_key UNIQUE, status enum (ai_active/human_required/human_active/closed), mobile_masked
- `ai_conversation_messages` — FK to ai_conversations, direction/sender_type CHECK constraints, tool_calls JSONB
- `automation_audit_logs` — actor_type/actor_id, action, entity_type/entity_id, after_data JSONB (idempotency_key stored here)
- `ai_knowledge_base` — status/approval_status enums, is_active, sort_order, language

## Route files
- `routes/automation.ts` — public service-token API at /api/automation/*
- `routes/ai-automation-admin.ts` — session-auth admin management at /api/admin/ai-automation/*

## Kill switch (two layers)
- Hard: `AI_ASSISTANT_ENABLED=true` env var MUST be set — if absent, ALL protected endpoints return 503
- Soft: `api_settings` row with `key='ai_assistant_enabled'` value='true'/'false' (admin can toggle without env change)
- Admin UI at /admin/ai-assistant-control (AIAssistantControlCenter.tsx)

## Scopes
packages:read, leads:read, leads:create, leads:update, support:create, conversations:create, knowledge:read

## Security invariants
- Never logs raw token — only SHA-256 hash stored
- Rate limiting: 120 req/60s per token, in-memory Map keyed by token ID
- Idempotency: stored in automation_audit_logs.after_data->>'idempotency_key'
- Mobile always masked before storage (maskMobile helper)
- PAN/Aadhaar pattern detection blocks message logging

## Token provisioning
- N8N_SERVICE_TOKEN env var: v37.1 migration auto-seeds as 'n8n-main' with all scopes on startup
- Admin UI: POST /api/admin/ai-automation/tokens (super_admin only), returns raw_token ONCE
- Security: only super_admin can create/revoke tokens or toggle kill switch

**Why:** External AI (n8n) needs a stable, audited, scope-limited API. Session cookies don't work for server-to-server calls. Service token pattern isolates AI from booking lifecycle.
**How to apply:** When adding new automation endpoints, always use `requireServiceToken("scope:action")` middleware and write to automation_audit_logs.
