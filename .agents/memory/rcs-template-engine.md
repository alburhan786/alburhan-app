---
name: RCS Template Engine
description: Lemin AI RCS — DB-backed template mappings, variable resolver, idempotency, status polling
---

## Architecture
- `src/lib/rcs.ts` — central engine: `sendRCSForEvent(event, mobile, bookingId, ctx)` is the sole ERP entry point
- `src/routes/rcs.ts` — admin routes mounted at `/api/rcs/*`
- `rcs_template_mappings` DB table — admin-editable; seeded with 9 approved Jio RCS templates
- `notification_logs` — 7 new columns: `message_id`, `delivery_status`, `last_status_check`, `read_at`, `template_id`, `template_name`, `idempotency_key`
- Frontend: `src/pages/admin/RCSTemplateManager.tsx` → route `/admin/rcs-templates`

## Approved Template IDs (Jio RCS, Lemin)
| Event | Template ID | Template Name |
|---|---|---|
| booking_submitted | 3651 | Booking_Submitted |
| booking_confirmed / booking_approved | 3652 | Booking_Approved |
| payment_received | 3654 | Payment_Received |
| pending_payment_reminder | 3655 | Pending_Payment_Reminder |
| invoice_ready | 3657 | Invoice_Generated |
| flight_ticket | 3659 | Ticket_Issued |
| visa_ready | 3660 | Visa_Issued |
| agreement_ready | 3661 | Agreement_Ready |
| hotel_voucher | null (unmapped) | — |
| departure_reminder | null (unmapped) | — |

## Key Constraints
- **user_id (LEMIN_API_KEY) is NEVER in logs, responses, or frontend.** Only goes in the outbound Lemin payload.
- `"Template not found"` from Lemin = delivery failure (NOT ok). Auth-pass ≠ delivery success.
- Idempotency key: `${bookingId}:${event}:${templateId}` — checked in notification_logs (24h window).
- Status polling: non-blocking (scheduleStatusUpdate after send); up to 5 polls via `refreshMessageStatus(messageId)`.
- `sendCustomRCS` accepts explicit templateId + variables, bypasses event mapping (used for test/validate).

## Migration Tag
- v31.0: `rcs_template_mappings` table + `notification_logs` 7 new columns

## Why
- Old rcs.ts used `api_settings.extra` tids + hardcoded template 1473 fallback.
- New engine: DB-backed, admin-editable, full variable resolver from real DB data, idempotent, status-trackable.
