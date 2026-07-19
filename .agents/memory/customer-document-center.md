---
name: Customer Document Center
description: New /customer/documents page — structure, API calls, navigation
---

## Route
- URL: `/customer/documents`
- File: `artifacts/alburhan/src/pages/customer/DocumentCenter.tsx`
- Protected by `CustomerRoute` in `App.tsx`

## API Calls
1. `GET /api/bookings` (credentials:include) → get customer bookings (filters to active statuses)
2. `GET /api/documents/:bookingId` (credentials:include) → get docs for selected booking

## Document Groups
```
Travel Documents: visa, flight_ticket, hotel_voucher, transport_voucher, departure_letter, luggage_tag, id_card
Official Documents: model_contract, invoice, receipt
Personal Documents: passport, aadhaar, pan, photo, medical_certificate, vaccination_certificate
```
Uncategorized docs shown in "Other" section.

## Navigation Links
- Booking card in Dashboard has "📁 My Documents — All in One Place" link (shown for approved/confirmed/partially_paid bookings)
- DocumentCenter has "← Back to Dashboard" link
- Route registered: `<Route path="/customer/documents" component={() => <CustomerRoute component={DocumentCenter} />} />`

**Why:** Customers had no unified place to find all their documents; they were buried inside the Dashboard booking cards with no way to download or preview easily.
