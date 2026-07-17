---
name: Agreement signing API fields
description: Sign endpoint payload shape, consent validation, and new metadata columns after 6-page agreement rewrite
---

## Sign endpoint: POST /api/agreements/my/:id/sign

**Required body fields:**
- `otp` — 6-digit SMS OTP
- `signatureData` — base64 PNG data URL from canvas (NOT `signature`)
- `termsAccepted` — object with **9 CONSENT_CATEGORIES** IDs as keys (changed from old 13 HAJJ_AGREEMENT_CLAUSES)

**Optional fields (from frontend getDeviceMeta()):**
- `signingBrowser`, `signingDevice`, `signingOS`, `signingGPS`

**9 consent IDs that must all be `true` in termsAccepted:**
```
terms_conditions, payment_policy, refund_policy, privacy_policy,
medical_declaration, visa_declaration, force_majeure, airline_disclaimer, baggage_policy
```

**DB columns written on sign:**
- `status = 'signed'`, `signature_data`, `terms_accepted` JSONB, `signed_at`, `signed_ip`, `signed_user_agent`
- `otp_verified = true`, `otp_verified_at`, `signing_otp = NULL` (cleared)
- `signing_metadata` JSONB — `{browser, device, os, gps, userAgent, timestamp}`
- `digital_hash` TEXT — SHA-256 of `id:agreementNumber:signatureData:timestamp:ip`

## Customer route flow
1. GET /api/agreements/my/:id → returns agreement + `clauses` = CONSENT_CATEGORIES (9 items)
2. POST /api/agreements/my/:id/request-otp → OTP sent to mobile, stored in agreements.signing_otp
3. POST /api/agreements/my/:id/sign {otp, signatureData, termsAccepted, signingBrowser...} → signs, PDF, email+WhatsApp

## Customer_profiles extended columns (added in agreements.ts migration)
`father_name`, `nationality`, `city`, `state`, `country` (DEFAULT 'India'),
`passport_issue_date` DATE, `passport_expiry` DATE, `nominee`, `nominee_relation`, `whatsapp_number`

## New agreements columns (added in startup migration)
`signing_metadata JSONB`, `digital_hash TEXT`, `revision_number INTEGER DEFAULT 1`,
`void_at TIMESTAMPTZ`, `void_reason TEXT`

## New admin endpoints
- `GET /:id/image?format=png|jpeg` — GhostScript PDF→image, falls back to PDF if gs absent
- `POST /:id/void {reason}` — sets status='void', void_at, void_reason
- `POST /:id/reissue` — bumps revision_number, resets signing fields → 'pending_signature'

## PDF structure (6 pages)
Page 1: KYC + Package + Financial | Page 2: Flights + Hotels + Transport + Includes/Excludes
Page 3: 13 legal clauses + Declaration | Page 4: Payment Policy + Refund Table + Medical + Visa
Page 5: 9 Consent checkboxes + OTP + Signature + Audit Trail | Page 6: Baggage + Airline + Execution + QR

**Why:** Separated the 13 legal clauses (permanent PDF text, Page 3) from the 9 explicit consent declarations (signing gate + Page 5). 13 clauses → legal text; 9 categories → digital consent.
