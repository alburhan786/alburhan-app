---
name: Automation engine triggers
description: How workflowEngine.ts is structured and which routes must call triggerWorkflow() vs fireNotificationEvent()
---

# Rule
Every route that sends a customer-facing notification MUST call `triggerWorkflow()` in addition to (or instead of) `fireNotificationEvent()`. Calling only `fireNotificationEvent()` bypasses workflow_logs and customer_timeline — the customer never appears in the automation pipeline UI.

**Why:** The WorkflowCenter and AutomationCenter UI read from `workflow_logs` table, which is only written by `triggerWorkflow()`. Direct `fireNotificationEvent()` calls fire the message but leave no audit trail.

**How to apply:**
- When adding a new event trigger in any route, always call `triggerWorkflow(triggerType, ctx)` after the DB update
- Keep any existing `fireNotificationEvent()` call as-is (it handles multi-channel delivery); add `triggerWorkflow()` as an additional call
- New WorkflowTrigger types must be added to: WorkflowTrigger union, TRIGGER_TO_EVENT map, DEFAULT_RULES array, and the relevant cron if scheduled

# Cron inventory (as of Phase 3)
- `startDepartureReminderCron()` — hourly, 7d/3d/1d/12h/6h/2h before departure
- `startDocumentExpiryCron()` — daily 07:30 IST, passport/visa expiry at 90/60/30/7 days
- `startReturnAndFeedbackCron()` — daily 10:00 IST, return day + 3 days after return
- `startBalanceReminderCron()` — daily 08:30 IST, balance due at 30/15/7/3/1 days + overdue every 7 days
- `startDocumentReminderCron()` — every 3 days, missing passport/photo reminder
- `startZiyaratReminderCron()` — daily 20:30 IST, next-day ziyarat notification

All 6 crons are started in `artifacts/api-server/src/index.ts` inside `app.listen()`.
