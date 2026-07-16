---
name: Payment notification dedup fix
description: payment_received dedup was 12h causing silent skips; now 0 like partial_payment. BotBee endpoints differ.
---

## Rule
`defaultDedupWindow("payment_received")` must be `0` — NOT 12h.

**Why:** The 12h dedup blocked re-delivery if the first notification was logged as "sent" (BotBee HTTP 200) but the customer never received it (template not yet approved, wrong phone format, etc.). Razorpay webhook idempotency is handled upstream via razorpayPaymentId uniqueness — not by the dedup window.

**How to apply:** In `notificationEngine.ts` → `defaultDedupWindow()`, keep `payment_received` and `partial_payment` together in the `return 0` group. Never move `payment_received` back into the 12h group.

## BotBee endpoints — two separate routes
- Template **listing** (auto-sync background job): `GET /whatsapp/templates` — this 404s with "route not found" every 10 min. HARMLESS.
- Template **sending** (actual delivery): `POST /whatsapp/send/template` — different path, works fine.
The background `fetchTemplates` errors in logs do NOT mean templates fail to send.

## Admin resend endpoint
`POST /api/payments/resend-notification/:bookingId` (requireAdmin) — fires full `processPaymentSuccessNotifications` for a booking using `pool.query` snake_case fields. Since dedup=0 for payment events, this always fires regardless of prior logs.
