---
name: Agreement generation — all payments
description: autoGenerateAgreement must fire for every payment, not just fully paid ones
---

# Agreement Generation for All Payments

## Rule
Remove any `if (isFullyPaid)` guard before calling `autoGenerateAgreement(booking.id)`.

**Why:** Partial payment customers also need the agreement document. The `agreements.ts` function already handles `partially_paid` status in its internal query (`WHERE b.status IN ('approved','confirmed','partially_paid')`). The guard was a premature restriction that broke the workflow for all partial payers.

**How to apply:** In any payment processing function that conditionally calls `autoGenerateAgreement`, remove the condition. The function itself handles idempotency — it won't duplicate if one already exists.

## Related
- payments.ts `processPaymentSuccessNotifications` — the fix site
- agreements.ts `autoGenerateAgreement` — already supports partial status
