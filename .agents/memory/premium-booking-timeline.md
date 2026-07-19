---
name: Premium Booking Timeline
description: PremiumTimeline component in customer Dashboard — fetch pattern, endpoint, UI structure
---

## Component
File: `artifacts/alburhan/src/pages/customer/Dashboard.tsx`
Component: `PremiumTimeline({ bookingId, journeyStatus })`
Replaces: `BookingJourneyTimeline` (simple stepper only)

## Structure
1. Top: Horizontal journey stepper (same as before — 19 stages from booking_requested to journey_completed)
2. Bottom: Collapsible "📋 Full Activity Log" button
   - Lazy-fetches timeline on first open
   - Shows vertical event list: icon + title + timestamp + description
   - Shows event count badge when events are loaded

## API Endpoint
`GET /api/bookings/:id/timeline` (requireAuth, added to routes/bookings.ts)
- Verifies `booking.customer_id = req.user.id` before returning
- Returns: `{ events: [{ id, event_type, title, description, icon, created_at }] }`
- Data source: `customer_timeline` table WHERE booking_id = :id

## Data Quality
Before fix: customer_timeline had many NULL booking_id rows (from wrong-arity triggerWorkflow calls)
After fix: agreements.ts now passes bookingId+customerId inside ctx → rows properly linked

**Why:** Old stepper showed just the current stage with no history. Customers couldn't see when payment was received, agreement was generated, visa was uploaded, etc.

**How to apply:** All new `addTimeline()` calls must pass both `customerId` and `bookingId`. For customer-visible events, ensure booking_id is populated or the timeline endpoint won't return them.
