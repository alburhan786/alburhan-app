---
name: Notification Engine Bug Patterns
description: Production bugs found and fixed in the notification/workflow pipeline — patterns to watch for future changes
---

## sendDLTSMS returns boolean — always check it

`sendDLTSMS(mobile, var1, var2, var3): Promise<boolean>` in `notifications.ts`.
**Never** discard the return value and assume success. The function returns `false` when:
- Fast2SMS key is missing/disabled
- DLT template call returns HTTP 200 with `return:false` in body
- Network error on both DLT and quick routes

Pattern to follow:
```typescript
const ok = await sendDLTSMS(mobile, name, bookingNum, "");
return { status: ok ? "sent" : "failed", providerResponse: { ok, provider: "Fast2SMS" } };
```

## TRIGGER_TO_EVENT must use valid EventType values

`workflowEngine.ts::TRIGGER_TO_EVENT` maps workflow trigger names to EventType.
All values must exist in the `EventType` union in `notificationEngine.ts`.
Invalid mappings cause `fireNotificationEvent` to get an unrecognized type
and send default/generic messages (the event falls through to `buildDefaultMessage`).

Verified correct mappings (as of July 2026):
- `payment_reminder_*` → `"balance_reminder"` (NOT `"payment_reminder"` — doesn't exist)
- `document_reminder` → `"passport_uploaded"` (NOT `"document_uploaded"` — doesn't exist)
- `return_reminder` → `"return_reminder"` (NOT `"return_flight"` — doesn't exist)
- `document_expiry_*` → `"passport_expiry"` (NOT `"document_expiry"` — doesn't exist)

## Razorpay order max amount

Payment LINKS already have `RAZORPAY_MAX_LINK_AMOUNT = 500000` cap.
The public `by-number/:bookingNumber/create-order` route also needs
this cap (₹5,00,000). Without it, bookings with large remaining balance
hit "Amount exceeds maximum amount allowed" from Razorpay.

## SMS retry in retryNotification

`retryNotification` in `notificationEngine.ts` must read `log.customer_name`
and `log.booking_number` from the notification_logs row — NOT use `log.recipient`
as the customer name variable.
