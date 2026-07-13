---
name: Payment reminder system
description: How automatic payment reminders work — schedule, cron, dedup, DLT variables, admin UI
---

## Schedule logic (getReminderType in paymentReminder.ts)
Calculates days between today (IST midnight) and due_date (IST midnight):
- diffDays === 7 → "7d"
- diffDays === 3 → "3d"
- diffDays === 1 → "1d"
- diffDays === 0 → "due"
- diffDays < 0 AND (-diffDays) % 3 === 0 → "post{N}d" (every 3 days after)
- Otherwise → null (not a scheduled day, skip)

## Dedup
Checks `reminder_logs` WHERE `notes LIKE 'type:{reminderType}%'` AND `status='sent'` AND `sent_at > NOW() - 20h`.
Notes format: `type:7d | Balance: ₹50,000`
No new DB column needed — uses existing `notes TEXT` field.

## Cron
`cron.schedule("30 3 * * *", ...)` = 9:00 AM IST (03:30 UTC daily)

## All DB ops via pool.query()
The reminderLogsTable Drizzle schema has a pgEnum for channel ("whatsapp","sms") that conflicts with "all" inserts. Use pool.query directly to bypass Drizzle enum validation.

## SMS DLT variables for balance_reminder
notificationEngine.ts SMS handler has explicit case for balance_reminder:
- var1 = customerName (ctx.customerName)
- var2 = pending balance as integer string (Math.round(ctx.balanceAmount))
- Sender ID configured in fast2sms API settings (should be ABURHA)

## API routes (all under /api/payments/reminders/)
- GET /status → { enabled }
- POST /enable → enable cron
- POST /disable → disable cron
- POST /run-now → fire runDailyReminders() async
- GET /stats → full stats: total, lastSent, eligibleCount, recentLogs, upcomingDueDates, schedule
- POST /:bookingId/send-reminder → per-booking manual send
- GET /:bookingId/reminder-history → booking's reminder log

## Admin UI
Page: /admin/payment-reminders → PaymentReminderSettings.tsx
- Enable/disable toggle, Send Now button, 4-stat cards
- Visual schedule, DLT message preview, upcoming due dates table, recent logs

## Customer Dashboard
Orange "Payment Status" card shown when balance > 0 and status=approved/partially_paid.
Shows: pending balance, due date, next reminder date (calculated inline).
Uses (booking as any).dueDate since TypeScript type may not include it yet.

**Why:** The schedule must be based on due_date-relative slots (not arbitrary 23h dedup). DLT template expects var1=name, var2=balance (not bookingNumber as default did). Admin needs visibility into who is getting reminded and when.
