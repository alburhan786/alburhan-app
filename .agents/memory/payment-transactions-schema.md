---
name: payment_transactions table schema quirks
description: Actual column names in payment_transactions — payment_mode (not mode), no invoice_number column. Mode is a PostgreSQL ordered-set aggregate so unquoted usage causes WITHIN GROUP error.
---

# payment_transactions column names

The column for payment method is **`payment_mode`** (type: `payment_mode` enum), NOT `mode`.

**Why:** PostgreSQL 16+ has `mode()` as an ordered-set aggregate function. Writing `pt.mode` (without table-qualification override) causes:
`ERROR: WITHIN GROUP is required for ordered-set aggregate mode`
Even `pt."mode"` (double-quoted) fails when the column doesn't exist — PostgreSQL falls back to trying to parse it as the aggregate.

**How to apply:** Always use `pt.payment_mode AS mode` in all SELECT queries on payment_transactions.

## Columns that DO exist
- `id`, `booking_id`, `amount`, `payment_date`, `payment_mode`, `reference_number`
- `notes`, `recorded_by`, `received_by`, `bank_name`, `created_at`, `edited_at`, `edited_by`
- `deleted_at`, `deleted_by`, `deletion_reason`, `is_deleted`, `is_reconciled`, `reconciled_date`, `reconciled_by`

## Columns that do NOT exist
- `mode` — use `payment_mode` instead
- `invoice_number` — does not exist on payment_transactions
