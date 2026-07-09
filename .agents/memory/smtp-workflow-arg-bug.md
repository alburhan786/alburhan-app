---
name: triggerWorkflow/fireNotificationEvent argument mismatch (fixed)
description: Historical bug where triggerWorkflow passed args in the wrong order to fireNotificationEvent, silently breaking all notifications routed through it.
---

`triggerWorkflow()` in `workflowEngine.ts` called `fireNotificationEvent(eventType, ctx.customerMobile, ctx)` — a 3-arg call — but `fireNotificationEvent`'s real signature is `(eventType, ctx, opts)`. This meant the mobile-number string was passed as the `ctx` object and the real context object was silently discarded into the `opts` parameter.

**Why this mattered:** every payment/booking notification fired via `triggerWorkflow` (the production trigger hub — see automation-engine.md) had `customerName`/`customerEmail`/`amount`/attachments all undefined inside the message builder and email sender, producing "Assalamu Alaikum undefined", ₹0 amounts, "No email address" failures, and PDF invoice/receipt attachments being dropped — even though SMTP itself was correctly configured and working when called directly.

**How to apply:** when notifications "silently don't fire" or arrive with blank/undefined fields despite SMTP/WhatsApp/SMS credentials being valid, suspect an argument-order/shape mismatch between `triggerWorkflow` and `fireNotificationEvent` (or similar wrapper mismatches) before assuming it's a credentials or provider issue. Test the underlying send functions directly (e.g. call `sendEmail`/`sendBookingConfirmationNotification` with real data) vs. testing through the full trigger path — a gap between the two indicates a call-signature bug in the orchestration layer, not the provider.
