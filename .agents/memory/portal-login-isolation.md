---
name: Portal login isolation
description: Each login portal only authenticates its own account type; portal field required in every OTP request.
---

## The rule
Every `POST /api/auth/send-otp` and `POST /api/auth/verify-otp` call MUST include `portal: "customer"|"agent"|"branch"|"staff"|"admin"`.
The backend rejects with HTTP 403 if the mobile's actual role does not match the requested portal.

## How it works
**send-otp:** reads `req.body.portal` (default "customer") → looks up existing user's role (or detects it from entity tables for new users) → rejects if role not in `PORTAL_ALLOWED_ROLES[portal]` → stores OTP with `purpose = portal` column.

**verify-otp:** reads `req.body.portal` → OTP lookup includes `AND (purpose IS NULL OR purpose=$portal)` → after user lookup checks role again → rejects 403 if mismatch → logs success to `audit_logs`.

## Portal → role mapping
- `customer` → `["customer"]`
- `agent` → `["agent"]`
- `branch` → `["branch_manager"]`
- `staff` → `["staff"]`
- `admin` → `["admin", "super_admin"]`

## Frontend
- `Login.tsx` accepts `portalType` prop (default "customer") — passes `portal` in both API calls.
- App.tsx routes: `/login` (customer), `/admin/login`, `/agent/login`, `/branch/login`, `/staff/login`.
- Protected route wrappers redirect to their portal's login page on unauthenticated access.

## Database
- `otps.purpose TEXT DEFAULT 'customer'` column added via migration.
- All login attempts (success and mismatch) logged to `audit_logs` with `entity_table='login_attempts'`.

## Legacy OTPs
Old OTP rows have `purpose IS NULL` — the lookup uses `(purpose IS NULL OR purpose=$portal)` so they still verify correctly.
