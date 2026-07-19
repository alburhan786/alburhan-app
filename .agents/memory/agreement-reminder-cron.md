---
name: Agreement Reminder Cron
description: How the agreement reminder cron works — slot logic, dedup, DB logging, startup run
---

File: `artifacts/api-server/src/jobs/agreementReminder.ts`
Registered in: `artifacts/api-server/src/index.ts` as `startAgreementReminderCron()`

## Design
- Hourly cron at :45 UTC (offset from paymentReminder at :30)
- Runs immediately on startup via 10s setTimeout (catches missed reminders)
- Finds bookings where: status IN (confirmed, approved, partially_paid) AND agreement status = pending_signature AND final_amount > 0 AND paid_amount >= 90% of final_amount OR status = confirmed
- Agreement created_at window: < NOW() - 20h AND > NOW() - 76h

## Reminder Slots
REMINDER_HOURS = [24, 48, 72]
SLOT_WINDOW_HOURS = 5 — each slot fires if hoursElapsed >= h AND < h+5
DEDUP_WINDOW_HOURS = 20 — skip if same slot sent within 20h

## Logging
reminder_logs table: id (custom arl_TIMESTAMP_RAND), booking_id, channel (whatsapp|sms), status, triggered_by='cron', notes='type:agr_24h | Unsigned agreement reminder'

**Why:** Agreement reminders were completely missing (0% coverage before this); customers were not being nudged to sign, causing delays. 3-touch cadence (24h/48h/72h) with graceful stop after 72h.

**How to apply:** Check reminder_logs WHERE notes LIKE 'type:agr_%' to debug. The SLOT_WINDOW_HOURS=5 means at 24h the window is 24-29h, at 48h it's 48-53h, at 72h it's 72-77h.
