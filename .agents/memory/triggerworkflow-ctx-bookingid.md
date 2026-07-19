---
name: triggerWorkflow ctx missing bookingId
description: Why bookingId+customerId must always be inside the ctx object, not as extra positional args
---

## The Problem
`triggerWorkflow(triggerType, ctx)` only has 2 parameters. Any extra positional args are silently ignored by JS/TS.

Pattern that FAILS (extra args dropped):
```typescript
triggerWorkflow("agreement_signed", {
  customerName: name,
  customerMobile: mobile,
}, booking_id, customer_id)  // ← SILENTLY DROPPED
```

Result: `customer_timeline` entries get `booking_id=NULL, customer_id=NULL`.

## The Fix
Include bookingId and customerId inside the ctx object:
```typescript
triggerWorkflow("agreement_signed", {
  customerName:   name,
  customerMobile: mobile,
  bookingId:      booking_id,    // ← MUST be in ctx
  customerId:     customer_id,   // ← MUST be in ctx
})
```

**Why:** The `addTimeline()` call inside `triggerWorkflow` reads `ctx.bookingId` and `ctx.customerId`. If they're undefined, timeline rows have NULL foreign keys and can't be queried per-booking.

**How to apply:** Any new `triggerWorkflow()` call must include bookingId+customerId in the ctx object if timeline logging is needed.
