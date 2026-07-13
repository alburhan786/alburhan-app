---
name: Payment notification isPaymentStatus gate
description: The admin-payments POST payment endpoint had a gate that silently skipped notifications for manual payments when booking status didn't change to confirmed/partially_paid.
---

## Rule
`admin-payments.ts` POST `/:id/payments` must fire `processPaymentSuccessNotifications` unconditionally after any successful payment INSERT — do NOT gate it on `result.updated?.newStatus`.

**Why:** `recalculateBookingPayment` can return `newStatus="approved"` when the booking was already fully paid from a prior source (e.g. the `paid_amount` column had a prior value). The old `if (isPaymentStatus)` check mapped to `confirmed || partially_paid`, silently skipping notifications for any edge case that keeps status as `approved`. Root-confirmed via `notif-trace` endpoint — no `payment_received` workflow logs despite successful payment inserts.

**How to apply:** Always use the unconditional pattern:
```js
const isFullyPaid = result.updated?.newStatus === "confirmed";
const newPaidAmount = result.updated?.totalPaid ?? Number(amount);
if (isFullyPaid) upsertInvoiceForBooking(bookingId).catch(...);
processPaymentSuccessNotifications({ ..., isFullyPaid, newPaidAmount, ... }).catch(...);
```

## BotBee uploadMedia field name
BotBee's `/whatsapp/upload/media` endpoint requires the file field to be named `media_file`, not `file`. Using `file` silently returns `{ ok: false, errorMessage: "No file was uploaded. Use the field name media_file." }`.

## form-data npm package not installed on VPS
`form-data` was not in `package.json` and thus not available on VPS. Fixed by using Node 20 native `FormData` + `fetch` — no npm package needed:
```js
const form = new FormData();
form.append("media_file", new Blob([fileBuffer], { type: mimeType }), fileName);
const r = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
```
