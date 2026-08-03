---
name: FCM implementation — Node 20 / OpenSSL 3 private key rules + migration gotcha
description: How Firebase service account credentials are loaded, normalised, and used for JWT signing via built-in crypto (no firebase-admin). Includes the migration wipe bug.
---

## Critical: v30.4 migration was wiping credentials on every restart
The original v30.4 migration unconditionally ran `UPDATE api_settings SET api_key_encrypted = NULL` and `SET extra_fields_encrypted = NULL` on **every startup**. This meant any credentials saved by the user were erased on the next deploy/restart.

Fixed to be conditional:
- `api_key_encrypted`: only cleared if the decrypted value is NOT a valid PEM (`-----BEGIN PRIVATE KEY-----`) and NOT a valid service-account JSON (with `private_key` field)
- `extra_fields_encrypted`: only cleared if it contains ONLY legacy `sender_id` field and no `project_id`/`client_email`
- `api_url`: always cleared (FCM v1 uses a fixed endpoint, not configurable)

**Rule**: Any migration that clears credentials must be conditional. Never use `UPDATE ... SET field = NULL WHERE field IS NOT NULL` without first checking the decrypted value.

## Rule: PEM normalisation — always rebuild the key
`error:1E08010C:DECODER routines::unsupported` on Node 20 / OpenSSL 3 fires when the base64 body of a PEM key doesn't have exactly 64-character lines.

`normalizePemKey(raw: string)` in `lib/fcm.ts`:
1. `.replace(/\\n/g, "\n")` — literal backslash-n → real LF
2. `.replace(/\r\n/g, "\n")` — CRLF → LF
3. `.replace(/\r/g, "\n")` — bare CR → LF
4. Regex-extract header / base64-body / footer
5. Strip ALL whitespace from body
6. Rebuild with exactly 64-char lines
7. Output: `${header}\n${lines.join("\n")}\n${footer}\n`

## Rule: Use crypto.createPrivateKey() before sign()
Do NOT pass a raw PEM string directly to `sign.sign(privateKey)` on Node 20.
Instead:
```typescript
const keyObject = crypto.createPrivateKey({ key: normalizedPem, format: "pem" });
const signer = crypto.createSign("RSA-SHA256");
signer.update(payload);
const sig = signer.sign(keyObject, "base64url");
```

## Credential loading priority
1. `FIREBASE_PRIVATE_KEY` env var — only used if PEM headers present AND len > 200 (guards against placeholder values)
2. `api_key_encrypted` in DB — tries `JSON.parse()` first (full service account JSON); falls back to raw PEM
3. `extra_fields_encrypted.service_account_json` — last resort if api_key had no private_key

## Frontend: "Parse JSON → Fill Fields" contract
- Uses `JSON.parse(raw)` — never regex, line-matching, or substring extraction
- Extracts ONLY: `parsed.project_id`, `parsed.client_email`, `parsed.private_key`
- Validates before committing to state:
  - projectId: no quotes or commas
  - clientEmail: matches `.iam.gserviceaccount.com`
  - privateKey: starts with `-----BEGIN PRIVATE KEY-----`, ends with `-----END PRIVATE KEY-----`, length > 1000
- Sets `api_key = privateKey` (NOT `private_key_id`)
- Clears `service_account_json` textarea after successful parse
- Save strips `service_account_json` from `extra_fields` before sending to backend

## Test connection diagnostics
`testFCMConnection()` returns:
- `keyDiagnostics: { firstLine, lastLine, length }` — never the full key
- `stack` — full error stack trace
- `hint` — human-readable suggestion matched to common error patterns
