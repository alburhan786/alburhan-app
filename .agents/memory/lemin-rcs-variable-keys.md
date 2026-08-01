---
name: Lemin RCS variable key formats
description: Exact variable key formats for each Jio RCS template (3651–3663), confirmed by live API probe. Used in rcs_template_mappings.variables_required.
---

## Approved templates — confirmed by live API probe (Aug 2026)

| Event | Template ID | Variable keys (exact Lemin format) |
|---|---|---|
| booking_submitted | 3651 | `name` |
| booking_confirmed | 3652 | `name` |
| booking_approved | 3652 | `name` |
| pending_payment_reminder | 3655 | `name` |
| payment_received | 3656 | `booking id`, `invoice no`, `{{amount}}`, `{{customer_name}}` |
| invoice_ready | 3657 | `{{customer_name}}`, `{{invoice_number}}`, `{{booking_id}}`, `{{amount}}` |
| flight_ticket | 3659 | `{{customer_name}}`, `{{booking_id}}`, `{{ticket_number}}`, `{{flight_number}}`, `{{departure_date}} at {{departure_time}}` |
| visa_ready | 3660 | `{{booking_id}}`, `{{visa_number}}`, `{{package_name}}`, `{{customer_name}}` |
| agreement_ready | 3661 | `#!name!#`, `: #!agreement!#`, `🔗 #!download!#`, `#!bookingid!#` |
| login_otp (+ 8 aliases) | 3663 | `otp` |

## Three distinct variable key formats

### Type A — plain key (3651, 3652, 3655)
```json
{ "name": "Ahmad Khan" }
```
Populated in resolveVariables(): `vars["name"] = customer_name`

### Type B1 — plain English with spaces (3656 only — payment_received)
```json
{ "booking id": "ABT-001", "invoice no": "INV-2026-001", "{{amount}}": "50000", "{{customer_name}}": "Ahmad Khan" }
```
Populated in resolveVariables(): `vars["booking id"] = booking_number`, `vars["invoice no"] = invoice_number`

### Type B2 — double-brace `{{key}}` (3657, 3659, 3660)
Populated in resolveVariables(): standard `{{customer_name}}`, `{{booking_id}}`, etc.

**3659 composite key** (flight_ticket):
```json
{ "{{departure_date}} at {{departure_time}}": "15 Nov 2026 at 06:00" }
```
This entire string is the JSON key — it's not two separate fields.

### Type C — hash-bang with literal prefixes (3661 — agreement_ready)
```json
{
  "#!name!#": "Ahmad Khan",
  ": #!agreement!#": "ABT-AGR-2026-000001",
  "🔗 #!download!#": "https://alburhantravels.com/sign-agreement/{id}",
  "#!bookingid!#": "ABT26352695"
}
```
The `: ` and `🔗 ` are literal parts of the JSON key — not separators.

## How variables flow

1. `rcs_template_mappings.variables_required` stores the exact Lemin key names
2. `resolveVariables()` populates every key variant from real DB data
3. `sendRCSForEvent()` filters `resolved` to only the `variables_required` keys before sending
4. The filtered object is sent as `payload.variables` to Lemin

**Why:** Sending ALL resolved vars (50+ keys) caused "Variable mismatch" errors.
Storing the exact Lemin key names in `variables_required` + filtering on send was the fix.

## Response shape

message_id is at `body.data.id`:
```json
{ "success": true, "data": { "id": "37ceeeae-8df4-11f1-8026-0a58a9feac02" }, "bot_name": "alburhan_jio" }
```
Extraction: `body.data?.id || body.data?.message_id || body.message_id || body.id`

## Status endpoint

`GET /api/messages/status` redirects to `/sign-in` — requires session auth, not available server-to-server.
Delivery status updates come via Lemin webhook at `POST /api/webhooks/lemin-rcs` only.
`pollMessageStatus()` returns `"unknown"` on redirect — delivery_status stays `"queued"`.

## OTP template (3663)

Single variable: `{"otp": "VALUE"}`. 9 alias events all map to 3663.
Use `sendRCSForOTP(mobile, otp)` — not `sendRCSForEvent`. OTP is masked as `"******"` in logs.

## Webhook

Canonical URL: `https://alburhantravels.com/api/webhooks/lemin-rcs`
Legacy alias: `https://alburhantravels.com/api/webhook/rcs`
Both handled by the same `handleLeminRCSWebhook` function in routes/webhooks.ts.
Message-ID-based update is preferred over phone-based when `message_id` is present.
