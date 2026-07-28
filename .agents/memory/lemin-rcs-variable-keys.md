---
name: Lemin RCS variable key formats
description: Exact variable key formats for each Jio RCS template (3651–3661), messageId location in Lemin response, and status endpoint behavior.
---

## Three distinct variable key formats

Different Lemin templates accept different JSON key shapes. `resolveVariables()` now
populates ALL three variants; `sendRCSForEvent` filters to `variables_required` keys.

### Type A — plain `name` key (templates 3651, 3652, 3654, 3655)
```json
{ "name": "Customer Name" }
```
Events: booking_submitted, booking_approved, payment_received, pending_payment_reminder

### Type B — double-brace `{{key}}` keys (templates 3657, 3659, 3660)

**3657 (invoice_ready):**
```json
{ "{{customer_name}}": "...", "{{invoice_number}}": "...", "{{booking_id}}": "...", "{{amount}}": "..." }
```

**3659 (flight_ticket):** note composite departure key
```json
{
  "{{customer_name}}": "...",
  "{{booking_id}}": "...",
  "{{ticket_number}}": "...",
  "{{flight_number}}": "...",
  "{{departure_date}} at {{departure_time}}": "15 Nov 2026 at 06:00"
}
```
`ticket_number` = same as `flight_number` (no separate ticket DB column)

**3660 (visa_ready):**
```json
{ "{{booking_id}}": "...", "{{visa_number}}": "...", "{{package_name}}": "...", "{{customer_name}}": "..." }
```

### Type C — hash-bang `#!key!#` with literal emoji/punctuation prefixes (template 3661)

**3661 (agreement_ready):** keys include literal `: ` prefix and `🔗 ` prefix
```json
{
  "#!name!#": "Customer Name",
  ": #!agreement!#": "ABT-AGR-2026-000001",
  "🔗 #!download!#": "https://alburhantravels.online/sign-agreement/{id}",
  "#!bookingid!#": "ABT26352695"
}
```
The `: ` and `🔗 ` are literal parts of the JSON key — not separators.

## Response shape

Lemin returns message ID at `body.data.id`, NOT `body.id`:
```json
{ "success": true, "data": { "id": "uuid...", "message": "Message request has been created" }, "bot_name": "alburhan_jio" }
```
Extraction: `body.data?.id || body.data?.message_id || body.message_id || body.id`

## Status endpoint

`GET /api/messages/status` redirects to `/sign-in` — requires session auth not available in server-to-server calls.
Delivery status updates come via Lemin webhook only (not polling).
`pollMessageStatus()` is hardened with `maxRedirects:0`; returns `"unknown"` on redirect — delivery_status stays `"queued"`.

## `variables_required` in DB

Stores the exact Lemin key names (not internal field names), so `sendRCSForEvent` can
filter `resolved` directly using these keys. `resolveVariables` populates every variant.

**Why:** Sending ALL resolved vars (50+ keys) to Lemin caused "Variable mismatch" errors on every template. Each template expects a specific key set. Storing the exact keys in `variables_required` and filtering on send was the fix.

## OTP template (3663 — alburhan_login_otp)

Variable: `{"otp": "VALUE"}` only — single key, plain (not double-brace or hash-bang).

9 alias events all map to template 3663: `login_otp`, `otp_login`, `customer_login_otp`,
`admin_login_otp`, `agent_login_otp`, `branch_login_otp`, `staff_login_otp`,
`password_reset_otp`, `mobile_verification_otp`.

Use `sendRCSForOTP(mobile, otp)` — NOT `sendRCSForEvent`. The dedicated function:
- Masks OTP as `"******"` in notification_logs.request_payload (never stored plaintext)
- Enforces a 2-minute per-mobile resend cooldown
- Never exposes LEMIN_API_KEY in any log

## OTP security in auth.ts

- `otps` table: `otp="[hashed]"`, `otp_hash=SHA256(otp+":"+mobile)` — plaintext never stored
- `verify-otp` matches: `(otp_hash=$hash OR (otp_hash IS NULL AND otp=$plain))` — backward-compatible
- Fallback delivery chain: RCS → WA template → SMS DLT → Email (sequential, never simultaneous)
- `otp_hash TEXT` column added via migration on startup
