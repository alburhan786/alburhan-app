---
name: verify-public pipeline fix
description: The public payment page (PaymentPage.tsx) calls verify-public which previously skipped the entire post-payment pipeline.
---

## Rule
`POST /api/payments/verify-public` (the unauthenticated endpoint used by customers paying via WhatsApp link) was missing the entire post-payment pipeline. It only updated DB status to "confirmed" and returned — no invoice, no agreement, no notifications.

## Fix Applied
Added fire-and-forget async pipeline block after `res.json()` in `verify-public`:
1. `upsertInvoiceForBooking(bookingId)` — creates/updates invoice record
2. Journey status advance to `payment_received`
3. `processPaymentSuccessNotifications(...)` — PDFs, WhatsApp, SMS, Email, logs, autoGenerateAgreement

## Related Bug
`autoGenerateAgreement` in `agreements.ts` used `booking.mobile_india` (non-existent column). Fixed to `booking.customer_mobile || booking.whatsapp_number || booking.mobile_india`.

## Key Facts
- `use-payment.ts` (authenticated dashboard) calls `/api/payments/verify` (requireAuth) — pipeline works correctly
- `PaymentPage.tsx` (public WhatsApp link page) calls `/api/payments/verify-public` — previously broken, now fixed
- Both routes now run the identical pipeline

## Why
Silent failure: `verify-public` returned `{ success: true }` so the customer saw "Payment Successful" but nothing else happened. No logs, no errors — purely a missing code path.
