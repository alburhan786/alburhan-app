---
name: Notification packageName bug pattern
description: triggerWorkflow() calls in payments.ts and bookings.ts must always include packageName or messages fall back to "your package"
---

## Rule
Every `triggerWorkflow()` call that sends customer-facing notifications MUST include `packageName` in the context object. The fallback in `notificationEngine.ts` is `ctx.packageName || "your package"`.

**Why:** In v19, `processPaymentSuccessNotifications()` in `payments.ts` did not include `packageName: booking.packageName ?? undefined` in its `triggerWorkflow()` call, causing all payment notification messages to read "📦 Package: your package" instead of the actual package name. Fixed in v19.1.

**How to apply:** 
- Whenever adding/editing a `triggerWorkflow()` call, check the context includes `packageName`.
- Same applies to the fallback path in `bookings.ts` `booking_approved`.
- The Drizzle `bookingsTable` schema has `packageName: text("package_name")` so the value is available from any Drizzle query/update `.returning()`.
