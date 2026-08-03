---
name: Approval notification URL and variable substitution fix
description: Root causes and fixes for booking_approved WhatsApp unresolved variables and malformed agreement URLs.
---

## Root Cause 1 — Malformed agreement URL (`https:// UUID`)

`getSiteBase()` in `routes/agreements.ts` and both `siteBase` usages in `routes/payments.ts`
used `process.env.REPLIT_DEV_DOMAIN` as the base when set. On VPS this env var was set to an old
Replit preview domain (e.g., `57456384-023a-43e4-a60f-e6d8f967.id.repl.co`) with a leading space,
producing `https:// <uuid>.repl.co/sign-agreement/...`.

**Fix:** Remove `REPLIT_DEV_DOMAIN` from ALL URL builders. Always use
`(process.env.SITE_URL || "https://alburhantravels.com").trim()`.

A new shared helper `buildAgreementUrl(bookingNumber)` was exported from `routes/agreements.ts`.
It validates the URL with `new URL()` and throws `INVALID_AGREEMENT_URL` on malformed input.

Files changed: `routes/agreements.ts`, `routes/payments.ts` (2 locations), `lib/rcs.ts`.

## Root Cause 2 — WhatsApp unresolved `#!Name!#` variables in `booking_approved`

`sendApprovalTemplate` in `lib/botbee.ts` inherited `forceTemplateApi: true` from the opts
forwarded by `sendBotBeeEventTemplate`. With `forceTemplateApi: true`, the code skips the
PRIMARY PATH (Meta Cloud API + local pre-render) and goes straight to BotBee's
`/whatsapp/send/template` endpoint.

BotBee's `/whatsapp/send/template` returns HTTP 200 + wamid but does NOT substitute
`#!Name!#` placeholders in the delivered `mixed_body_text`.

The PRIMARY PATH (entered when `forceTemplateApi` is NOT set) tries Meta Cloud API first.
Meta Cloud API uses `body_content` with positional `{{1}}`...`{{5}}` substitution which
DOES resolve correctly.

**Fix:** `sendApprovalTemplate` now explicitly omits `forceTemplateApi` from the opts
it forwards to `sendTemplate`. This lets the PRIMARY PATH run (Meta Cloud API → local
pre-render → text API → BotBee template API as last resort).

**Why:**` forceTemplateApi: true` is correct for all other ERP templates to avoid the
24 h session window. For `booking_approved` specifically, the template body IS in
`TEMPLATE_BODIES["409950"]` so the PRIMARY PATH can always render locally + send via
the session-based text API, and Meta Cloud API handles cold-session cases.

## Root Cause 3 — `BookingID` used internal UUID

`sendApprovalTemplate` ctx had `bookingId` mapped to `BookingID` variable. If the caller
passed the internal UUID (e.g., `510b7dee-619a-4b69-9e1c-1bd70058f771`) instead of the
ABT booking number, `{{2}}` in the template showed a UUID.

**Fix:** Added `bookingNumber?: string` to `sendApprovalTemplate` ctx. `BookingID` now
uses `ctx.bookingNumber || ctx.bookingId`. `notificationEngine.ts` `booking_approved`
case explicitly passes `bookingNumber: ctx.bookingNumber || bookingRef`.

## Root Cause 4 — `Paymenturllink` showed invoice URL, not agreement URL

At approval time, `{{5}}` (Paymenturllink) held the invoice/payment page URL even though
customers must sign the agreement before paying. `sendApprovalTemplate` now accepts
`agreementUrl?: string` and uses it as `Paymenturllink` when present. The approval ctx in
`routes/bookings.ts` sets `agreementUrl: buildAgreementUrl(updated.bookingNumber)`.

## Template body (local fallback)

`TEMPLATE_BODIES["409950"]` updated to show agreement URL text:
```
Assalamu Alaikum wa Rahmatullahi wa Barakatuh {{1}}
Alhamdulillah! Your booking has been approved.
Booking ID: {{2}}  Package: {{3}}  Total Amount: ₹{{4}}
Your agreement is ready for review and digital signature:
{{5}}
For assistance: +91 9893225590
Jazak Allah Khair. Al Burhan Tours & Travels
```
