---
name: Invoice & Payment Status Architecture
description: Single source of truth for invoice/receipt PDF status, receipt PDF fields, admin report completeness
---

# Invoice & Payment Status — Single Source of Truth

## deriveStatusFromAmounts (paymentDocs.ts)
The canonical status computation is now the shared helper `deriveStatusFromAmounts(paid, total, overdue?)` in `paymentDocs.ts`. Both `generateInvoicePdfBuffer` and `generateReceiptPdfBuffer` use it. Frontend `StatusBadge` in Invoice.tsx mirrors the same logic.

**Rules:**
- paid <= 0 → PENDING PAYMENT (Orange)
- paid > 0 AND balance > 0.01 AND !overdue → PARTIALLY PAID (Blue)
- balance <= 0.01 → PAID IN FULL (Green)
- overdue AND balance > 0 → OVERDUE (Red)

## derivePaymentStatus (bookings.ts)
Returns Paid/Partial/Pending for the invoice JSON API. Uses `max(paidAmount, advanceAmount)` — NEVER `advanceAmount` alone, because online Razorpay partial payments have advanceAmount=0 but paidAmount>0.

## buildInvoiceResponse (bookings.ts)
Response now includes `paidAmount` (max of paidAmount+advanceAmount) and `balanceDue` explicitly. Frontend must use `invoice.paidAmount` not `invoice.advanceAmount` for balance computation.

## Invoice.tsx (public page)
Line ~121: `const paidAmount = (invoice as any).paidAmount ?? advanceAmount;` — fallback to advanceAmount for old bookings that predate the paidAmount field.

## Receipt PDF Fields (generateReceiptPdfBuffer)
Now includes all required fields:
- Receipt No. (auto-generated RCP-{bookingNumber}-{6-digit-timestamp})
- Invoice No., Booking No., Customer, Mobile, Email, Package, Pilgrims
- Amount Paid, Total Paid, Grand Total, Balance Due
- Transaction ID (paymentRef), Payment Method, Payment Date, Status
- Status badge (same colors as invoice)

## Admin Payment Report (/api/admin/reports/payments)
Now includes `status IN ('confirmed','partially_paid')` by default.
Supports `?status=confirmed|partially_paid|all` query param.
Returns: paymentStatus (Paid/Partial/Pending), paidAmount, balanceDue, lastPaymentDate.

**Why:** Original report only returned `confirmed` bookings — all partial payments were invisible to finance.

## Public Invoice Endpoint Access
Both `/by-number/:bookingNumber/invoice-public` and `/by-invoice-number/:invoiceNumber/invoice-public` and `/:id/invoice` now allow `['confirmed','partially_paid']` statuses (not just `'confirmed'`).

**Why:** `partially_paid` customers need to see their invoices.
