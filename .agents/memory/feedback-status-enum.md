---
name: feedback status enum
description: feedback.status enum values in PostgreSQL DB
---

# Rule
`feedback.status` PostgreSQL enum = `{open, in_review, resolved, closed}`

**NOT `in_progress`** — Drizzle schema and any code comparing/inserting feedback status must use these exact values.

**STATUS_ORDER for UI sort:** `['open', 'in_review', 'resolved', 'closed']`

**Why:** Original code had `"in_progress"` in 4 places in feedback.ts + Drizzle enum definition; all inserts/filters with that value failed silently or with enum cast errors.
