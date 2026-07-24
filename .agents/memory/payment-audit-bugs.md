---
name: Payment-invoice audit July 2026
description: Root causes found during full payment/invoice/finance audit. Key bugs in invoice PDF stale cache, journal entries missing for online payments, webhook journey_status, and admin revenue stats.
---

## Bug pattern: Invoice PDF stale after payment
`invoices.pdf_path` stores a GCS URL written before payment. Any redirect to
that URL shows the old "PENDING" PDF. Fix: always regenerate on-the-fly from
current DB state. Never serve redirects from `pdf_path`.

**Why:** PDF is generated async post-payment; GCS upload completes seconds later;
if user opens PDF link immediately they get the stale version.

**How to apply:** Any new PDF-serving endpoint should NOT redirect to a stored
URL. Always re-generate from current DB row. Background save is fine for caching
but must never be served.

## Bug pattern: postPaymentJournal never called for online payments
Only admin-payments.ts (manual cash/bank) called postPaymentJournal(). All
Razorpay routes (/verify, /webhook, /verify-public) skipped it.

**Why:** Finance module was added after payment routes were built; journal wiring
was only done for manual entries.

**How to apply:** Any new payment route must call postPaymentJournal() after
recording in payment_transactions. Pass txnId returned from the INSERT.

## Bug pattern: Webhook missing journey_status advancement
/webhook handler updated booking.status but not journey_status, so SSE
broadcastCustomerJourneyUpdate() was never called for payment-link payments.
/verify and /verify-public both had the journey_status block; webhook didn't.

## Bug pattern: Admin revenue query status filter
Monthly revenue CASE WHEN must include 'partially_paid' alongside 'confirmed',
or partial payments are silently excluded from finance charts.
