---
name: Accounting module b.user_id bug
description: All accounting endpoints that join bookings→users used b.user_id which doesn't exist; must use b.customer_id
---

## Rule
In any SQL query joining `bookings b` to `users u`, the FK column is `b.customer_id` (NOT `b.user_id`). Using `b.user_id` causes "column does not exist" and 500 errors.

**Why:** The `bookings` table was designed with `customer_id` as the FK to `users.id`. The field `user_id` was never added to this table on the VPS schema.

**How to apply:** Any new SQL that touches bookings→users must use `JOIN users u ON u.id=b.customer_id`. Run `grep -n "b.user_id" <file>` as a quick audit after writing accounting/booking queries.

## Also: payment_mode enum cast
`payment_transactions.payment_mode` is a PostgreSQL USER-DEFINED enum type. Comparing it to text parameters fails:
- WRONG: `pt.payment_mode = ANY($1)` (text array)
- WRONG: `pt.payment_mode = $1` (text param)
- RIGHT: `pt.payment_mode::text = ANY($1)` or `pt.payment_mode::text = $1`
