---
name: Invoice E2E deploy patterns
description: Invoice auto-creation, PDF endpoint, admin payment route, migration endpoints, VPS deploy one-liner
---

## Invoice auto-creation
`upsertInvoiceForBooking(bookingId)` fires fire-and-forget after:
- `POST /api/admin/bookings/:id/payments` when `isFullyPaid`
- `POST /api/payments/verify` when `isFullyPaid`

Invoice response shape: `{ invoice: { invoiceNumber, invoiceStatus, ... } }` — NOT flat.
Invoice INSERT uses columns: `subtotal, discount, gst_amount, tcs_amount, total, paid, balance`
(NOT `discount_amount`, `total_amount`, `paid_amount`, `balance_due` — those are wrong names).
`due_date` is now set in INSERT (NOW() + 30 days).

**Why:** Invoices table was created with wrong column names in the original SQL migration.
The VPS SQL migration (v2) includes DO $$ RENAME blocks to fix old tables automatically.

## Admin payment route
`POST /api/admin/bookings/:id/payments` — adminPaymentsRouter is mounted at `/admin/bookings`.
Valid modes: `cash | neft | upi | cheque | online | bank_transfer | imps | rtgs | dd`
Booking must be approved first. Status must be: `approved | partially_paid | confirmed`.

## Migration endpoints — MUST be before router
In app.ts, migration routes MUST be registered **BEFORE** `app.use("/api", router)`.
In production mode the catch-all 404 handler blocks routes registered after it.

## VPS deploy — one-liner (uses deploy.sh endpoint)
```
bash <(curl -fsSL "https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev/api/migrate/deploy.sh?key=alburhan-migrate-2026")
```
This: downloads 6MB bundle + runs SQL migration + deploys frontend + restarts PM2.

After first SSH deploy: future deploys need NO SSH:
```
curl -X POST "https://alburhantravels.com/api/migrate/self-update?key=alburhan-migrate-2026"
```

## DB migration (v2 SQL file)
`GET /api/migrate/vps-update.sql?key=...` — 372-line idempotent script.
Includes: DO $$ RENAME blocks for invoices columns, due_date on bookings+invoices,
payment_transactions + reminder_logs tables, all notification tables.
