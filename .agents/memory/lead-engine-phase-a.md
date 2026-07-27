---
name: Lead Engine Phase A
description: Architecture and key rules for the Phase A CRM lead engine (scoring, assignment, follow-up automation, opt-out)
---

## Core rule
All lead business logic lives in `lib/leadEngine.ts`. Routes in `routes/lead-engine.ts` stay thin. Mounted at `/api/leads` in `routes/index.ts`.

## Key patterns

**Duplicate detection order:** meta_lead_id → platform_user_id+platform → mobile (last 10 digits regex) → email. Returns existing leadId or null.

**Follow-up sequence:** titles prefixed `LD-SEQ-{key}` (e.g. `LD-SEQ-30min_alert`). This prefix distinguishes auto-sequence items from manual tasks everywhere — filter `title NOT ILIKE 'LD-SEQ-%'` to show only manual tasks.

**Cron:** `runFollowupCron()` wired in `index.ts` inside `app.listen()` callback, 5-min interval with 30s startup delay. Same pattern as all other cron jobs there.

**Assignment:** 3-step fallback — (1) `lead_assignment_rules` (legacy platform-specific), (2) `crm_assignment_rules` (priority-ordered, 3 methods), (3) most active admin user. `crm_assignment_rules.method` values: `round_robin`, `least_active`, `specific_user`.

**New DB tables:** `crm_assignment_rules` (id TEXT PK, priority INT, method TEXT, conditions JSONB, team_user_ids TEXT[], assign_to_user_id TEXT, sla_minutes INT), `lead_auto_followup_log` (id TEXT PK, lead_id TEXT, seq_key TEXT, UNIQUE(lead_id, seq_key)).

**Opt-out:** Written to `communication_consents` (mobile+channel UNIQUE). Check with `isOptedOut(mobile, channel)` before any outbound message. Keywords: stop/unsubscribe/opt out/remove me/block/रुको.

**Score:** `calculateLeadScore()` returns `{score, score_factors, score_points}`. Hot=70+, Warm=45+, Cold=<45. Recalculate via `POST /api/leads/:id/score`.

**AssignmentRules page:** `/admin/assignment-rules` (added to App.tsx). Calls `/api/leads/assignment-rules` not `/api/crm/`.

**Why:** Centralised engine means webhook handlers (Phase B Meta, Phase B Instagram) only need to call `createOrUpdateLead(input)` and the whole pipeline (dedup, score, assign, sequence) fires automatically.

**How to apply:** Any new lead source (webhook, form, manual) → call `createOrUpdateLead()` from `lib/leadEngine.ts`. Never insert into `leads` directly from routes.
