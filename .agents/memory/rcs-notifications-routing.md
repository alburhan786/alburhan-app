---
name: RCS notification routing — sendRCSForEvent vs sendRCS
description: All notification helper functions must use sendRCSForEvent (event-specific Jio templates), not sendRCS (generic Lemin template 1473)
---

## Rule
All ERP notification helper functions in `notifications.ts` must call `sendRCSForEvent(eventName, mobile, ctx)`, **not** the old `sendRCS(mobile, name, message)`.

## Why
- `sendRCS()` uses generic Lemin template 1473 — a plain-text fallback with no event context. It does not reach Jio RCS users and doesn't log event type properly.
- `sendRCSForEvent()` uses the `rcs_template_mappings` table (9 event-specific Jio templates, IDs 3651–3663) and logs correctly to `notification_logs`.
- Three functions had the old call: `sendBookingSubmissionNotification`, `sendBookingConfirmationNotification`, `sendAdminDocumentReadyNotification`.

## How to apply
Use dynamic import pattern to avoid circular deps:
```ts
import("./rcs.js").then(({ sendRCSForEvent }) =>
  sendRCSForEvent("booking_submitted", mobile, ctx).catch(() => {})
);
```
For OTP specifically, use `sendRCSForOTP(mobile, otp)` which handles masking and the `login_otp` template (3663).
