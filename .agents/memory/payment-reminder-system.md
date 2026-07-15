---
name: Payment reminder system
description: paymentReminder.ts schema quirks, VPS column names, reminder_logs constraints
---

## VPS schema quirks

- `bookings` table has NO `due_date` column on VPS — use `preferred_departure_date AS due_date` alias in all SELECT queries
- `reminder_logs.channel` is an enum type `reminder_channel` that only accepts `{sms, whatsapp}` — never insert `'all'`
- `reminder_logs.id` has NO default — must supply a value (e.g. `rl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

## Schedule logic

- admin-triggered: always `reminderType = "manual"`  
- cron-triggered: 7d/3d/1d/due/post-3d slots based on `preferred_departure_date`
- dedup via notes field `"type:7d"` or similar; 9 AM IST daily cron

## Notifications

- `fireNotificationEvent("balance_reminder", ...)` fires WhatsApp template `pending_payment_reminder` (id 407648) + SMS DLT + Email
- SMS uses Fast2SMS DLT (var1=name, var2=balance)
- WhatsApp template lookup failure is non-fatal; SMS is fallback
- notification_logs captures all attempts per channel (2 whatsapp entries = ABT template attempt + free-form fallback)

**Why:** `due_date` was silently failing on VPS because the column doesn't exist in the production schema. This caused the entire booking SELECT to throw, propagating as 500 "Failed to send reminder" masked by enum error in old catch block.

**How to apply:** Any new query on bookings that needs the payment due date must use `preferred_departure_date` not `due_date`.

## Admin page

`/admin/payment-reminders` — enable/disable, run-now, stats
