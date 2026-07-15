---
name: emailService.ts location and pattern
description: Where the email service lives, how it's wired, and a critical routing lesson about the test endpoint
---

## File
`artifacts/api-server/src/services/emailService.ts`

## Exports
8 functions: sendOTPEmail, sendBookingConfirmation, sendPaymentReceipt, sendInvoiceEmail, sendTicketEmail, sendVisaEmail, sendPasswordResetEmail, sendGenericEmail, sendBookingStatusEmail

## Transport pattern
- Creates Nodemailer transport lazily and caches it (re-creates only if credentials change)
- Reads SMTP_HOST/PORT/USER/PASS/FROM/FROM_NAME from process.env only — never hardcoded
- All 6 SMTP env vars are baked into VPS bundle via build.ts injectKeys

## Integration points
- auth.ts: sendOTPEmail fires after SMS OTP (tertiary channel, fire-and-forget, only if user has email on profile)
- documents.ts: sendTicketEmail/sendVisaEmail fire after admin uploads flight_ticket/visa (fire-and-forget, if custEmail set)
- invoices.ts: POST /api/invoices/:bookingId/send-email — admin-triggered, sends invoice PDF via email
- app.ts: GET /api/test-email?to= — test endpoint registered at app level

## Critical: test endpoint must be in app.ts, NOT index.ts
app.ts registers `app.use("/api", router)` at line 694, then a 404 catch-all `/api` handler in production at line 712.
If the test endpoint is registered in index.ts (runs after app.ts setup), Express never reaches it because the `/api` 404 handler already ran.
**Always add new top-level app routes to app.ts, before `app.use("/api", router)`.**

**Why:** Express processes middleware in registration order. index.ts routes added after app.ts middleware chain are never reached in production.

## SMTP_FROM_NAME
Set as shared env var (not secret, it's a display name): "Al Burhan Tours & Travels"
