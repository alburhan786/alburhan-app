---
name: Invoice Visibility Rules
description: Security rules controlling when invoice PDFs and invoice cards are shown to customers — never for unpaid/pending bookings
---

## Rule
Never serve or display invoice data to customers unless `paid_amount > 0`.

**Why:** Financial compliance + security. A customer who hasn't paid should not be able to
download or share an invoice. An invoice PDF accessible via booking number URL before
payment is a data leak.

## API enforcement (two endpoints)
Both PDF endpoints block access when `paid_amount <= 0`:

1. **Public** `GET /api/invoices/by-number/:bookingNumber/pdf`
   — Returns HTTP 403 + `{ code: "PAYMENT_REQUIRED" }` if `paid_amount <= 0`.
   — Admin bypass: none — this is a public endpoint.

2. **Authenticated** `GET /api/invoices/:bookingId/pdf`
   — Non-admin: returns HTTP 403 if `paid_amount <= 0`.
   — Admin: always allowed.

SQL columns checked: `b.paid_amount` (from bookings) and `i.paid` aliased as `inv_paid` (from invoices).
Fallback: `Number(b.paid_amount || b.inv_paid || 0)`.

## Frontend enforcement (Dashboard.tsx)
Three invoice display locations all require both conditions:
- `booking.invoiceNumber && Number(booking.paidAmount || 0) > 0 && (status === 'confirmed' || status === 'partially_paid')`

1. Invoice number badge in booking card header
2. Invoice Card (View + Share buttons) 
3. Download Invoice PDF button

**How to apply:** Any new invoice display location must include the `paidAmount > 0` check.
The `status === 'confirmed'` check alone is insufficient because admins can manually set
status without recording a payment.

## Booking status → invoice visibility mapping
| Status | paidAmount | Show invoice? |
|--------|-----------|---------------|
| pending | 0 | ❌ Never |
| approved | 0 | ❌ Never |
| approved | >0 | ❌ Never (status wrong) |
| partially_paid | >0 | ✅ Yes (partial payment) |
| confirmed | >0 | ✅ Yes (full payment) |
| confirmed | 0 (manual admin) | ❌ No (paidAmount guard) |
| rejected | any | ❌ Never |
