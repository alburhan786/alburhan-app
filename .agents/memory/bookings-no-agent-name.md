---
name: bookings no agent_name - use agents join
description: bookings table has no agent_name column; agent info requires JOIN agents via agent_id (UUID)
---

# Rule
`bookings` has no `agent_name` TEXT column. Agent name requires joining:

```sql
LEFT JOIN agents ag ON ag.id = b.agent_id
-- Then use: COALESCE(ag.name, 'Unassigned') as agent_name
-- Group by: ag.name
```

**Type facts:**
- `bookings.agent_id` = UUID
- `agents.id` = UUID (correct join)
- `users.id` = TEXT (WRONG — do NOT join users ON users.id = b.agent_id)

**Why:** analytics.ts agent-performance used `LEFT JOIN users u ON u.id = b.agent_id` (TEXT vs UUID) AND referenced `b.agent_name` (non-existent column) — both caused 500 errors.

**agents columns:** id (UUID), name, mobile, email, city, branch_id, commission_rate, is_active, notes
