---
name: Notification system dual architecture
description: Two parallel notification/reminder systems coexist in the Al Burhan API server — check both before adding new event types or cron jobs.
---

The codebase has two independently-evolved systems for customer notifications:

1. **notificationEngine.ts** (`EventType` union + `EVENT_LABELS`/`EVENT_GROUPS` + `fireNotificationEvent`) — used by `notifyCustomer()` (unified entry point) and the Communication Dashboard / notification_logs / notification_retry_queue.
2. **workflowEngine.ts** (`WorkflowTrigger` union + `workflow_rules` table + `triggerWorkflow()`) — drives cron-based reminders (balance, document/passport/visa expiry, departure, ziyarat, document-reminder) and writes to `workflow_logs`/`customer_timeline`.

**Why:** They were built at different times for different purposes and were never merged. Balance reminders (30/15/7/3/1-day + overdue) and passport/visa expiry reminders (90/60/30/7-day) are already fully implemented via workflowEngine crons — a second, differently-named reminder for the same real-world event will fire duplicate notifications to customers.

**How to apply:** Before adding a new reminder/event type (e.g. "passport_reminder", "balance_reminder_30d"), grep both `notificationEngine.ts` EventType/EVENT_GROUPS and `workflowEngine.ts` WorkflowTrigger/cron functions for existing coverage of that business event. If workflowEngine already covers it, extend/reuse that cron rather than wiring a new EventType through notifyCustomer.
