---
name: Agreement RICH_SELECT fix
description: hg.group_number does not exist in production hajj_groups table — removes it from agreements RICH_SELECT
---

## Rule
Never add `hg.group_number` to the agreements RICH_SELECT. The production `hajj_groups` table does not have that column.

**Why:** Using `hg.group_number` in RICH_SELECT caused "column hg.group_number does not exist" SQL error on every `GET /api/agreements/my/:id` call, making every customer see "Agreement not found".

**How to apply:** The safe hajj_groups columns in RICH_SELECT are: `hg.group_name`, `hg.departure_date`, `hg.return_date`. Any reference to `ag.group_number` in `buildPdfOpts` is safe via `ag.group_number || null` (undefined || null = null).

## RICH_SELECT safe template (hajj_groups part)
```sql
hg.group_name, hg.departure_date, hg.return_date,
```
