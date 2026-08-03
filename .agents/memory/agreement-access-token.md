---
name: Agreement access_token security system
description: Cryptographic access_token added to agreement signing URLs for security; validation logic, backward-compat rules, and backfill approach.
---

## Implementation (deployed Aug 2, 2026)

### DB columns added
`agreements.access_token TEXT` + `agreements.access_token_expires_at TIMESTAMPTZ`

### Token format
`crypto.randomBytes(32).toString("hex")` — 64 hex chars, generated in Node.js (NOT in SQL)

### URL format
`/sign-agreement/ABT26373792?token=<64hex>` — booking number in path, access_token in query string

### Backward compat cutoff
`ACCESS_TOKEN_ENFORCE_AFTER = new Date("2026-08-02T00:00:00Z")`
- Agreements created BEFORE this date: work without token (legacy links already sent)
- Agreements created AFTER this date: access_token required

### validatePublicAccess() logic (order matters)
1. Signed → always OK (post-signing PDF always accessible without token)
2. Cancelled/void → 410 AGREEMENT_CANCELLED
3. Legacy + no stored token → OK (backward compat for existing links sent without tokens)
4. Token provided + stored token exists → validate; mismatch = 401 TOKEN_INVALID; expired = 401 TOKEN_EXPIRED
5. No token provided + isLegacy → OK (legacy catch-all)
6. No token provided + new agreement → 401 TOKEN_MISSING

**Why:** Old links sent to customers have no token — they must keep working. New agreements created after cutoff always get a token in the INSERT.

### Token revocation
On signing success: `SET access_token=NULL, access_token_expires_at=NULL`
Post-signing PDF download: always allowed (step 1 in validatePublicAccess)

### SQL backfill
DO NOT use `encode(gen_random_bytes(32), 'hex')` — requires pgcrypto extension, NOT available on VPS.
Use: `REPLACE(gen_random_uuid()::text,'-','') || REPLACE(gen_random_uuid()::text,'-','')` → 64 hex chars from 2 UUIDs.

### Admin endpoints
- `POST /:id/refresh-token` (requireAdmin) — generates new 72h token + fires agreement_generated notification
- `POST /:id/reissue` (requireAdmin) — reset to pending_signature + generates new access_token
- `POST /api/migrate/backfill-access-tokens` — migration key auth, backfills NULL tokens for pending_signature rows

### Frontend changes
- `PublicAgreementSign.tsx`: reads `?token=` from `window.location.search`
- `signApi(suffix)` helper appends `?token=` to all API calls
- New `accessError` state: TOKEN_MISSING, TOKEN_INVALID, TOKEN_EXPIRED, AGREEMENT_CANCELLED → branded error screen
- Signed PDF link works without token (backend allows it)

### PII / log safety
- Use `tokenLogPrefix(t)` → `t.slice(0,8)+"…"` for logs (never full token)
- OTP: never log value, only "sent/failed" + last-4 of mobile
- signatureData: never logged (only SHA-256 hash of hash-input stored)

### Payments.ts (resend-all)
- Now fetches `access_token`, `access_token_expires_at`, `status` from agreements table
- Generates fresh token if missing/expired for unsigned agreement
- Uses `buildSigningUrl()` for correct URL format
