---
name: Journey status trigger mapping
description: All required WorkflowTrigger entries for journey status notifications to fire
---

## Rule
Every journey status string passed to `triggerWorkflow(journey_status, ctx)` in bookings.ts must appear in BOTH:
1. `WorkflowTrigger` union type (workflowEngine.ts)
2. `TRIGGER_TO_EVENT` map (workflowEngine.ts)

Missing entries → notifications silently skipped (no log, no SMS, no email).

## Current mappings (all added)
- documents_pending/received/admin_verification → "journey_status_changed"
- payment_pending → "balance_reminder"  
- flight_confirmed → "flight_assigned"
- hotel_confirmed/room_allocated → "room_allocation"
- bus_allocated → "bus_assigned"
- departure_ready → "departure_reminder"
- reached_makkah → "welcome_saudi"
- visa_processing/reached_madinah/journey_started → "journey_status_changed"
- return_flight → "return_flight_reminder"
- journey_completed → "arrival_india"
- room_allocated/departure_ready → also in TIMELINE_LABELS

## triggerWorkflow context
Must include `journeyStatus: journey_status` in ctx so `buildDefaultMessage("journey_status_changed", ctx)` produces the correct per-status message.

## notification routing
- journey_status_changed is NOT in ABT_TEMPLATE_EVENTS (no WhatsApp template)
- SMS (sendDLTSMS) + email fire; WhatsApp expected-fails (24h Meta window)
- dedup window = 0 (each status change fires immediately)

**Why:** Journey status changes are time-critical (pilgrim in Makkah/Madinah); each change must notify the customer immediately regardless of prior messages.
