---
name: pilgrims no booking_id - join via group_id
description: pilgrims table has no booking_id FK; correct join to bookings is via group_id
---

# Rule
`pilgrims` table has NO `booking_id` column. Its FK to booking context is `group_id`.

**Correct join pattern:**
```sql
-- Get booking for pilgrim (may return multiple if group has multiple bookings)
LEFT JOIN bookings b ON b.group_id = p.group_id AND (b.is_deleted IS NULL OR b.is_deleted=false)

-- Subquery for single booking_id in fire-and-forget notifications:
(SELECT b.id FROM bookings b WHERE b.group_id = p.group_id 
 AND (b.is_deleted IS NULL OR b.is_deleted=false) ORDER BY b.created_at DESC LIMIT 1) AS booking_id
```

**Why:** Original code wrongly used `p.booking_id` across multiple files (autoNotifications.ts, buses.ts, visa.ts, workflowEngine.ts). All caused `column p.booking_id does not exist` 500 errors.

**Columns that DO exist on pilgrims:** id, full_name, mobile_india, mobile_saudi, group_id, passport_number, photo_url, visa_number, visa_status, etc. (39 columns total, no booking_id)
