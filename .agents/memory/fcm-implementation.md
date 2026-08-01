---
name: FCM implementation — Node 20 / OpenSSL 3 private key rules
description: How Firebase service account credentials are loaded, normalised, and used for JWT signing via built-in crypto (no firebase-admin).
---

## Rule
Firebase service account private keys are PKCS#8 RSA PEM (`-----BEGIN PRIVATE KEY-----`).
On Node.js 20 / OpenSSL 3.0 (Ubuntu 22.04), two patterns are required:

### 1. PEM normalisation — always rebuild the key
`error:1E08010C:DECODER routines::unsupported` occurs when:
- The base64 body has non-64-char lines (missing internal newlines)
- There are CRLF (`\r\n`) or bare `\r` line endings
- The header/footer are missing trailing newlines
- A literal `\\n` string survived JSON or env-var transport without conversion

`normalizePemKey(raw: string)` in `lib/fcm.ts`:
1. `.replace(/\\n/g, "\n")` — literal backslash-n → real LF
2. `.replace(/\r\n/g, "\n")` — CRLF → LF
3. `.replace(/\r/g, "\n")` — bare CR → LF
4. Regex-extract header / base64-body / footer
5. Strip ALL whitespace from body
6. Rebuild with exactly 64-char lines
7. Output: `${header}\n${lines.join("\n")}\n${footer}\n`

### 2. Use crypto.createPrivateKey() before sign()
Do NOT pass a raw PEM string directly to `sign.sign(privateKey)` on Node 20.
Instead:
```typescript
const keyObject = crypto.createPrivateKey({ key: normalizedPem, format: "pem" });
const signer = crypto.createSign("RSA-SHA256");
signer.update(payload);
const sig = signer.sign(keyObject, "base64url");
```
This gives a precise error (e.g. "wrong key type") instead of the opaque decoder error,
and is more reliable across all Node.js/OpenSSL version combinations.

## Credential loading priority
1. `FIREBASE_PRIVATE_KEY` env var — only used if PEM headers present AND len > 200 (guards against placeholder values)
2. `api_key_encrypted` in DB — tries `JSON.parse()` first (full service account JSON); falls back to raw PEM
3. `extra_fields_encrypted.service_account_json` — last resort if api_key had no private_key

## Decrypt helper
`decryptToString()` wraps `decrypt()` with an explicit `Buffer.from(raw).toString("utf8")` to avoid the implicit coercion in `decipher.update(buf) + decipher.final("utf8")`.

## Test connection diagnostics
`testFCMConnection()` returns:
- `keyDiagnostics: { firstLine, lastLine, length }` — never the full key
- `stack` — full error stack trace
- `hint` — human-readable suggestion matched to common error patterns

**Why:** The opaque `DECODER routines::unsupported` error was the only signal before;
adding diagnostics made the real cause immediately obvious.

## How to apply
Any time FCM test connection fails with an OpenSSL error, check:
1. First/last line of the PEM (from keyDiagnostics in the response)
2. Key length (should be ~1700 chars for RSA-2048)
3. Whether `normalizePemKey()` is applied before `createPrivateKey()`
