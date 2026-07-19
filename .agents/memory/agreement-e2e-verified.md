---
name: Agreement signing E2E verified
description: All 15 production signing steps confirmed working with independent DB/API verification
---

## Rule
After signing, the system must:
1. Save PDF to `documents` table (document_type='model_contract', uploaded_by='admin', is_visible_to_customer=true)
2. Log OTP SMS to `notification_logs` (channel='sms', event_type='otp_sent', provider_name='fast2sms')
3. Write audit events to `agreement_audit_logs`: auto_generated → agreement_signed → pdf_generated → pdf_stored → email_sent → whatsapp_sent

**Why:** These three additions (documents table, notification_logs, audit trail) were missing from the initial implementation. Without them steps 9, 3, and 14 could not be independently verified.

**How to apply:**
- `uploadToGCS` is imported in agreements.ts and used after PDF generation in the sign route
- notification_logs insert is in the request-otp route right after logAgreementAudit
- logAgreementAudit is exported from agreements.ts (no longer a private function)

## QR Code Verification
- Endpoint: GET /api/agreements/verify/:token
- Returns: { agreementNumber, bookingNumber, customerName, status, signedAt, otpVerified, isValid }
- isValid=true requires: status='signed' AND otpVerified=true

## WhatsApp PDF delivery
- notification_logs shows event_type='agreement_signed', channel='whatsapp', http_status=200
- wamid may be null (BotBee PDF upload endpoint differs from message endpoint)
