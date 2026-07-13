---
name: Document delivery module
description: How admin-uploaded travel docs are automatically delivered to customers via WhatsApp/Email/SMS
---

## Key files
- `artifacts/api-server/src/lib/documentDelivery.ts` — core engine
- `artifacts/api-server/src/routes/documents.ts` — upload hook + resend endpoint

## How it works
1. Admin uploads a travel doc via `POST /api/documents/upload`
2. Upload route calls `sendDocumentToCustomer()` fire-and-forget (respond 201 first)
3. `sendDocumentToCustomer()`:
   - Fetches file buffer from disk (`/api/documents/files/`) or GCS (`/api/storage/objects/`)
   - WhatsApp: PDF → `sendPDFDocument()` (BotBee upload+send); image → `uploadMedia()+sendFile()`; fallback → `sendText()` with dashboard link
   - Email: `sendEmail()` with file attachment (if buffer available)
   - SMS: `smsSendTicket` for flight_ticket, `smsSendVisa` for visa, `smsSendInvoiceCreated` for all others
   - Updates `documents.notification_sent = TRUE`

## Resend endpoint
`POST /api/documents/:id/resend` (admin only) — re-fires `sendDocumentToCustomer()` regardless of notification_sent flag; responds immediately (async delivery).

## TRAVEL_DOC_TYPES set
Only admin-uploaded docs whose `documentType` is in `TRAVEL_DOC_TYPES` get auto-delivered. KYC docs (passport, aadhaar, pan_card, etc.) uploaded by customers are not auto-delivered to anyone.

## Admin UI
`BookingsManager.tsx` → `AdminDocumentsSection` → `renderDoc()`: travel docs show a violet Send button (Lucide `Send` icon) that calls `handleResend()`. Shows spinner while resending. Shows "✓ Delivered" vs "Not sent" based on `notificationSent` flag.

**Why:** Customer should receive documents automatically seconds after upload, without requiring admin to manually send. One-click resend allows fixing delivery failures.
