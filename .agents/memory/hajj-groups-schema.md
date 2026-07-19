---
name: hajj_groups table schema
description: Column names in the hajj_groups table — needed when JOINing in SQL
---

## hajj_groups column names
The `hajj_groups` table uses `group_name` (NOT `name`) for the group label.

```sql
-- WRONG:
SELECT g.name FROM hajj_groups g ...

-- CORRECT:
SELECT g.group_name FROM hajj_groups g ...
```

**Why:** The column was created as `group_name TEXT NOT NULL` in the migration.
Any SQL that JOINs hajj_groups and selects the label must use `g.group_name`.

**How to apply:** Whenever writing a JOIN to `hajj_groups`, always reference `g.group_name`.
The existing search endpoint in accounting.ts already avoids joining hajj_groups for this reason
(it uses `b.package_name` from the bookings table instead).
