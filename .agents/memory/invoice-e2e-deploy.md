---
name: Invoice E2E deploy patterns
description: Key lessons from invoice auto-creation, PDF endpoint, admin payment route, migration endpoint positions, VPS deploy
---

## Invoice auto-creation
`upsertInvoiceForBooking(bookingId)` fires fire-and-forget after:
- `POST /api/admin/bookings/:id/payments` (admin-payments.ts) when `isFullyPaid`
- `POST /api/payments/verify` (payments.ts) when `isFullyPaid`

Invoice response shape: `{ invoice: { invoiceNumber, invoiceStatus, ... } }` — NOT flat.
Must unwrap `.invoice` when consuming the API response.

**Why:** The invoices table record is NOT created by the booking flow — only by explicit call.

## Admin payment route
`POST /api/admin/bookings/:id/payments` — adminPaymentsRouter is mounted at `/admin/bookings`, not `/admin/payments`.
Requires booking to be in status: `approved | partially_paid | confirmed`. Booking must be approved first.

## PDF download endpoint
`GET /api/invoices/:bookingId/pdf` — uses `generateInvoicePdfBuffer` from paymentDocs.ts.

## Migration endpoints — MUST be before router
In app.ts, migration routes MUST be registered **BEFORE** `app.use("/api", router)`.
In production mode, there is a `app.use('/api', 404-handler)` that blocks any unhandled `/api/*`
routes. If migration routes come after this (as they were before the fix), they are unreachable on VPS.

## VPS self-update mechanism
`POST /api/migrate/self-update?key=alburhan-migrate-2026` — downloads bundle from source URL,
writes to `dist/index.cjs`, triggers `pm2 restart alburhan-api` (detached, fire-and-forget).
Default source: Replit dev server URL. After one-time SSH deploy of new bundle, future deploys
are fully automated via this endpoint.

## VPS deploy (one-time SSH, then automated)
- VPS at `/var/www/alburhan`, pm2 `alburhan-api`, runs `dist/index.cjs`
- One-time SSH: `curl -fsSL "${DEV}/api/migrate/server.cjs?key=alburhan-migrate-2026" -o /var/www/alburhan/artifacts/api-server/dist/index.cjs && pm2 restart alburhan-api`
- SQL migration: `curl -fsSL "${DEV}/api/migrate/vps-update.sql?key=alburhan-migrate-2026" | psql $DATABASE_URL`
- Future deploys: `curl -X POST "https://alburhantravels.com/api/migrate/self-update?key=alburhan-migrate-2026"`
