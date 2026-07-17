---
name: Invoice overdue status
description: How deriveInvoiceStatus handles the overdue state and where due_date comes from.
---

## Rule
`deriveInvoiceStatus(total, paid, dueDate?)` in `routes/invoices.ts`:
- Returns `"paid"` if `paid >= total - 0.01`
- Returns `"overdue"` if unpaid/partially-paid AND `dueDate` is in the past
- Returns `"pending"` (paid=0, no overdue) or `"partial"` (0<paid<total, no overdue) otherwise

For existing invoices: pass `inv.due_date` — allows overdue detection on stale unpaid invoices.
For new invoices: omit dueDate — new invoices set due_date=+30d so they can never be immediately overdue.

## Why
Old function had no overdue concept. Overdue status is important for payment reminders and admin dashboards.

## How to apply
- `upsertInvoiceForBooking` is the only caller — two branches (existing vs new), each passes appropriate dueDate
- Overdue status is lazily updated: refreshed whenever `upsertInvoiceForBooking` is called (on GET /invoices/:id, on payment, on admin view)
- The list endpoint (GET /invoices) queries stored status — may be stale for rarely-accessed invoices
