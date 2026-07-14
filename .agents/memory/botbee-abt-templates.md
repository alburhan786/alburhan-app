---
name: BotBee ABT Production Templates
description: 7 approved BotBee templates that replace broken template 333473 (July 2026)
---

## The 7 Production Templates

| Event | Template Name | ID | Parameters (in order) |
|---|---|---|---|
| Booking Submitted | bookingsubmitted | 407645 | name, packageName, bookingId, invoiceUrl |
| Payment Received | paymentreceived | 407646 | name, packageName, bookingId, "Paid", invoiceUrl |
| Pending Payment | pending_payment_reminder | 407648 | name, packageName, bookingId, paymentUrl |
| Booking Approved | approve | 407642 | name, packageName, bookingId, invoiceUrl |
| Departure Reminder | departure_reminder | 407664 | name, packageName, flightNumber, departureDate, reportingTime, departureAirport, hotelName, emergencyContact |
| Visa Issued | visa_issued | 407667 | name, bookingId, packageName, visaUrl |
| Flight Ticket | flight | 361654 | name, bookingId, flightNumber, departureDate, ticketUrl |

## Code Location

- **botbee.ts**: `ABT_TEMPLATES` constant + 7 exported sender functions (sendBookingSubmittedTemplate, sendPaymentReceivedTemplate, etc.)
- **notificationEngine.ts**: `ABT_TEMPLATE_EVENTS` set + `sendBotBeeEventTemplate()` routes each EventType to the correct template function
- Priority order: ABT template → wa_templates DB lookup → free-form session message

## Old Template

Template 333473 "conformation" returned "Message template not found" from BotBee — it is kept in botbee.ts as deprecated `sendConfirmationTemplate` but is no longer called anywhere.

**Why:**
The business registered 7 new approved templates on BotBee dashboard. The old template ID was invalid/deleted.

**How to apply:**
When adding a new WhatsApp notification event:
1. Add the template name+ID to `ABT_TEMPLATES` in botbee.ts
2. Add a typed sender function using `bodyParams()`
3. Add the EventType to `ABT_TEMPLATE_EVENTS` set in notificationEngine.ts
4. Add a case to `sendBotBeeEventTemplate()` switch statement
