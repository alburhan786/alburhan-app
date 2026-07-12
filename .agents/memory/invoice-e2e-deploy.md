---
name: Invoice E2E deploy patterns
description: Key lessons from invoice auto-creation, PDF endpoint, VPS deploy, and BotBee template API
---

## Invoice auto-creation
`upsertInvoiceForBooking(bookingId)` must be called fire-and-forget after:
- `POST /api/admin/bookings/:id/payments` (admin-payments.ts) when `isFullyPaid`
- `POST /api/payments/verify` (payments.ts) when `isFullyPaid`

**Why:** The invoices table record is NOT created by the booking flow itself — only by explicit call to `upsertInvoiceForBooking`.

## PDF download endpoint
`GET /api/invoices/:bookingId/pdf` — added to invoices.ts, uses `generateInvoicePdfBuffer` from paymentDocs.ts.
Auth: `requireAuth` + mobile-match check (admin can see all, customer only their own).

## BotBee WhatsApp template API (July 2026)
BotBee has **removed all template API endpoints** — `/send/template`, `/send-template`, `/template` all return HTML 404.
Only `/whatsapp/send` works (session messages, within 24h window).
**Fix:** Removed the hello_world template fallback retry in notifications.ts — on 24h window error, skip gracefully.
**Why:** Retrying template 3× (1.5s backoff) was wasting ~5s per event and flooding logs.

## VPS deploy (no SSH from Replit)
- VPS at `/var/www/alburhan`, pm2 `alburhan-api`, runs `dist/index.cjs`
- GET `/api/deploy-dist` now accepts `x-admin-password` header (no session needed)
- POST `/api/hot-reload` endpoint added for future self-deploy (requires bundleUrl + password)
- First-time deploy: user must SSH and run curl + pm2 restart manually
