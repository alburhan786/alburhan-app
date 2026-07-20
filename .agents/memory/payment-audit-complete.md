---
name: Payment lifecycle audit completions
description: All gaps found and fixed during the July 2026 comprehensive payment lifecycle audit
---

## Rule
All 4 payment UPDATE routes (verify/sync-payment/webhook/verify-public) set last_payment_date=NOW().

**Why:** `last_payment_date` was missing from bookings table; added via ALTER TABLE migration in runMigrations().

## How to apply
- Any new payment UPDATE must include `last_payment_date=NOW()` in the SET clause
- processPaymentSuccessNotifications always receives paymentMode + paymentDate

## Key fixes applied
- payment_transactions CREATE TABLE added to runMigrations (safety: table may not exist on fresh VPS)
- Customer bookings GET "/" supplements lastPaymentDate via separate pool.query (column not in Drizzle schema)
- Webhook has idempotency guard: checks payment_transactions before processing duplicate paymentId
- Offline payment approve: inserts into payment_transactions + sets last_payment_date=NOW()
- triggerWorkflow enriched with paymentMode, paymentDate, totalPaid, paymentRef fields
