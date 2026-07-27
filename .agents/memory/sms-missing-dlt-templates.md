---
name: SMS DLT templates missing for agreement/partial_payment events
description: agreement_ready, agreement_signed, partial_payment have no DLT template IDs; custom_sms template 211277 is invalid — need Altaf to configure
---

# Missing SMS DLT Templates

## Configured (working) SMS DLT templates
- new_booking: 219801 (ABURHA)
- booking_approved: 219802, 214139 (ABURHA)
- payment_received: 219803 (ABURHA)
- balance_reminder: 219804 (ABURHA)
- invoice_generated: 219805 (ABURHA)
- ticket_issued: 214142 (ABURHA)
- departure_reminder: 214143 (ABURHA)
- flight_assigned: 214144 (ABURHA)
- pending_payment: 214148 (ABURHA)

## Missing — need Altaf to register and configure
- `agreement_ready` — no DLT template ID registered
- `agreement_signed` — no DLT template ID registered
- `partial_payment` — no DLT template ID registered (`partial_payment_tid` key in fast2sms settings)
- `custom_sms` — template ID 211277 is INVALID (Fast2SMS 424 "Invalid Message ID")

## Impact
WhatsApp covers agreement_ready/signed (19/16 sent per event). SMS is secondary. partial_payment
is also covered by WhatsApp template API. SMS failures for these events are non-blocking but
Altaf should register the templates in India's DLT portal and add IDs via Admin → DLT Manager.

## How to Configure
Add to notification_templates table via Admin → SMS Template Manager (or direct DB insert):
  INSERT INTO notification_templates (id, name, event_type, channel, dlt_template_id, sender_id, enabled)
  VALUES ('tpl_...', 'Agreement Ready', 'agreement_ready', 'sms', '<DLT_ID_FROM_ALTAF>', 'ABURHA', true);
