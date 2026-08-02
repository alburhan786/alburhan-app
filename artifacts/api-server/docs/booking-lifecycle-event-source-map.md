# Booking Lifecycle — Event Source Map

**Generated:** 2026-08-02  
**Purpose:** Permanent reference for every customer-facing notification event in the booking/payment/agreement lifecycle. Consult this before adding or modifying notification triggers.

---

## Event: `new_booking`

| Field | Value |
|---|---|
| **Trigger condition** | Customer submits a booking (online OR offline) |
| **Source files** | `routes/bookings.ts` (online: ~line 576, offline: implicit via admin-SSE only) |
| **Channel path** | `triggerWorkflow("new_booking")` → `workflowEngine` → `fireNotificationEvent` → `sendBotBeeEventTemplate` → `sendBookingSubmittedTemplate` |
| **Customer channels** | WhatsApp (template 409897), SMS (DLT booking_confirmed), Email (booking_submitted) |
| **Template variables** | `Name`, `BookingID` (booking number), `PackageContent`, `Amount` |
| **Idempotency key** | `new_booking:{bookingId}:{channel}` |
| **Duplicate paths** | `notifyNewBooking()` is **admin SSE only** (dashboard live feed). No customer message. |
| **Guard** | enrichCtxFromDB loads packageName + amount from DB if blank. |

---

## Event: `booking_approved`

| Field | Value |
|---|---|
| **Trigger condition** | Admin clicks "Approve" on a booking |
| **Source files** | `routes/bookings.ts` (~line 760) |
| **Channel path** | `triggerWorkflow("booking_approved")` → `sendApprovalTemplate` |
| **Customer channels** | WhatsApp (template 409950), SMS (DLT booking_confirmed), Email |
| **Template variables** | `Name`, `BookingID`, `PackageContent`, `Amount`, `Paymenturllink` (agreement URL) |
| **Idempotency key** | `booking_approved:{bookingId}:{channel}` |
| **Post-trigger** | `autoGenerateAgreement(bookingId)` — fires AFTER approval, not at creation. |
| **Guard** | `sendApprovalTemplate` blocks if `Paymenturllink` is malformed or non-HTTPS. |

---

## Event: `agreement_ready` (via `agreement_generated` workflow trigger)

| Field | Value |
|---|---|
| **Trigger condition** | `autoGenerateAgreement()` completes — called ONLY from: (1) booking approval route, (2) payment processing (`payments.ts` ~line 275) |
| **Source files** | `routes/agreements.ts` (`autoGenerateAgreement` function, ~line 590) |
| **Channel path** | `triggerWorkflow("agreement_generated")` → `sendAgreementReadyTemplate` |
| **Customer channels** | WhatsApp (template 409958), SMS, Email |
| **Template variables** | `Name`, `BookingID`, `Agreement` (agreement number), `Download` (signing URL with access_token) |
| **Idempotency key** | `agreement_ready:{bookingId}:{channel}` |
| **Guard** | KYC gate in `autoGenerateAgreement`: skips if mobile/passport/dob/nationality missing. Existing agreement check prevents duplicates. |
| **⛔ REMOVED CALL** | `autoGenerateAgreement` was previously called at **offline booking creation** — this caused agreement_ready messages on unapproved bookings. Permanently removed 2026-08-02. |

---

## Event: `agreement_signed`

| Field | Value |
|---|---|
| **Trigger condition** | Customer submits signed agreement via `/sign` endpoint |
| **Source files** | `routes/agreements.ts` (sign endpoint) |
| **Channel path** | `fireNotificationEvent("agreement_signed")` → `sendAgreementSignedTemplate` |
| **Customer channels** | WhatsApp (template 409965), SMS |
| **Template variables** | `Name`, `Agreement` (booking number) |
| **Idempotency key** | `agreement_signed:{bookingId}:{channel}` |
| **Does NOT trigger** | Payment notifications. Agreement signing has no payment side-effect. |

---

## Event: `payment_received` / `partial_payment`

| Field | Value |
|---|---|
| **Trigger condition** | Payment recorded (online Razorpay webhook, offline admin entry) |
| **Source files** | `routes/payments.ts` (`processPaymentSuccessNotifications`, ~line 260) |
| **Channel path** | `triggerWorkflow("payment_received")` → `sendPaymentReceivedTemplate` |
| **Customer channels** | WhatsApp (template 409953), SMS, Email (with PDF receipt attachment) |
| **Template variables** | `Name`, `BookingID`, `Invoice` (invoice number), `Amount` |
| **Idempotency key** | `payment_received:{bookingId}:{paymentId}:{channel}` |
| **Guard** | Dedup key in `processPaymentSuccessNotifications` prevents duplicate webhook calls for same paymentId. |
| **Post-trigger** | `autoGenerateAgreement(bookingId)` — creates agreement if not yet present. |

---

## Event: `invoice_generated` / `invoice_ready`

| Field | Value |
|---|---|
| **Trigger condition** | Admin clicks "Send Invoice Notification" (POST `/:id/send-invoice`) |
| **Source files** | `routes/bookings.ts` (~line 1167) |
| **Channel path** | Direct: `sendWhatsApp` (text) + `sendDLTSMS` + `sendInvoiceEmail`. Also: `fireNotificationEvent("invoice_generated")` for logging. |
| **Customer channels** | WhatsApp (text message), SMS (DLT invoice template), Email |
| **Template variables** | invoiceNumber, bookingNumber, finalAmount |
| **Guard (added 2026-08-02)** | Endpoint now returns HTTP 422 if: (1) booking status is `pending`/`submitted`, (2) `finalAmount` is 0 or null. |
| **Does NOT fire from** | Booking submission, payment processing, or any automated path. Admin-only manual action. |

---

## Idempotency Architecture

- **Database level:** `UNIQUE INDEX uq_notification_logs_idempotency ON notification_logs(idempotency_key) WHERE idempotency_key IS NOT NULL`
- **Insert pattern:** `INSERT … ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`
- **Key format:** `{eventType}:{bookingId}:{channel}` (or `{eventType}:{bookingId}:{paymentId}:{channel}` for payment events)

---

## Variable Validation Architecture (in `botbee.ts` `sendTemplate`)

1. **HARD BLOCK:** any variable value that is `undefined`, `null`, `"undefined"`, or `"null"` → returns `{ ok: false }` with `UNRESOLVED_TEMPLATE_VARIABLE` log entry
2. **HARD BLOCK:** any variable value containing `#!...!#` or `{{N}}` (unrendered placeholder) → blocked
3. **WARN:** empty string `""` or default `"-"` values are allowed but logged as warnings
4. **Format conversion:** `{ Name: "val" }` → `{ "#!Name!#": "val" }` before BotBee template API call (required for `#!Name!#` substitution)

---

## What Does NOT Trigger Customer Notifications

| Action | Customer notification? |
|---|---|
| Offline booking creation | ❌ No (admin creates on behalf of customer; `new_booking` not fired for offline) |
| Agreement signing | ❌ No payment/invoice notification fires |
| Admin viewing booking | ❌ |
| `notifyNewBooking()` | ❌ Admin SSE only — dashboard live feed |
| `notifyBookingApproved()` | ❌ Admin SSE only |
| `sendAdminNewBookingEmail()` | ❌ Admin email only |
