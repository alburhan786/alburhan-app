---
name: Agreement signing API fields
description: Exact field names and structure for the customer agreement signing endpoints
---

## Sign endpoint: POST /api/agreements/my/:id/sign
Required body fields:
- `otp`: string — the signing OTP (from /api/agreements/my/:id/request-otp)
- `signatureData`: string — base64 data URI of signature image (NOT `signature`)
- `termsAccepted`: object — ALL 13 clause IDs must be present and true

## All 13 Hajj Agreement Clause IDs
booking_confirmation, payment_terms, cancellation_policy, package_inclusions,
visa_documents, health_requirements, conduct_discipline, liability_insurance,
force_majeure, privacy_data, amendments, governing_law, digital_signature_declaration

**Why:** The endpoint uses `signatureData` to match the AgreementSigning.tsx frontend field name. termsAccepted validation iterates HAJJ_AGREEMENT_CLAUSES.map(c=>c.id) and rejects if any are missing.

## Route flow
1. POST /api/agreements/my/:id/request-otp → OTP sent to customer mobile, stored in agreements.signing_otp
2. POST /api/agreements/my/:id/sign {otp, signatureData, termsAccepted} → signs, generates PDF, sends via email+WhatsApp
3. GET /api/agreements/verify/:token → public QR verify, returns {status, isValid, signedAt, ...}

## Admin generate
POST /api/agreements/generate/:bookingId (requires admin session)
Returns {ok:true, agreement:{...}} — does NOT return pdfBase64 (only sign does)
