---
name: pilgrims table schema
description: pilgrims table links via group_id (NOT booking_id); uses full_name (NOT name) and mobile_india (NOT mobile). No direct booking foreign key.
---

# pilgrims table schema quirks

## Key column names
- Name column: **`full_name`** (NOT `name`)
- Mobile column: **`mobile_india`** (NOT `mobile`)
- Foreign key to groups: **`group_id`** (NOT `booking_id`)

**Why this matters:** There is NO `booking_id` column on pilgrims. Pilgrims belong to hajj_groups, and hajj_groups belong to bookings via `bookings.group_id`. To query pilgrims for a booking:
```sql
SELECT p.id, p.full_name AS name, p.mobile_india AS mobile, p.passport_number, p.barcode_id
FROM pilgrims p
WHERE p.group_id = (SELECT group_id FROM bookings WHERE id=$1 LIMIT 1)
ORDER BY p.full_name
```

## To search bookings by passport number
```sql
SELECT b.id AS booking_id
FROM pilgrims p
JOIN bookings b ON b.group_id = p.group_id AND (b.is_deleted IS NULL OR b.is_deleted=false)
WHERE LOWER(p.passport_number)=LOWER($1)
LIMIT 1
```

## To join pilgrims to bookings (for search)
```sql
LEFT JOIN pilgrims p ON p.group_id = b.group_id AND b.group_id IS NOT NULL
```
