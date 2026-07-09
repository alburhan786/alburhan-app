---
name: Customer profile save 403 investigation
description: What was checked when customer "Save Details" reported 403, and what the actual fix scope became
---

`requireAuth` only ever returns 401 (missing/invalid session), never 403 — only `requireAdmin`/`requirePermission`/`requireModuleAccess` return 403. So a 403 on a customer-only route (like `PATCH /api/auth/profile`) cannot come from that route's own auth middleware; suspect either a route/ownership check elsewhere (e.g. document upload's `booking.customerId !== req.user.id` check) or something outside the app (reverse proxy/WAF) if it can't be reproduced by direct curl against the app.

**Why:** Wasted time re-reading auth middleware before confirming this. Direct curl testing with a real OTP-derived session cookie reproduced the save flow as a 200 in this environment — the bug wasn't in `requireAuth` itself.

**How to apply:** When a 403/401 bug report can't be reproduced via curl with a valid session against the app directly, treat it as likely production/infra-specific (proxy, stale deployed bundle, cookie domain/SameSite mismatch) rather than continuing to re-read the same middleware.

Separately, the customer profile "Save Details" form only persisted 5 basic fields on `users` (name/email/blood_group/emergency contact) while a full KYC-style schema (`customer_profiles` table: DOB, gender, address, passport, Aadhaar, PAN, photos) already existed via `/api/kyc/*` routes but wasn't wired into the Dashboard's simple edit modal. Fixed by having `PATCH /api/auth/profile` upsert extended fields into `customer_profiles` too, so one form/endpoint covers both.

Also found and fixed: no global Express error-handling middleware existed, so multer upload errors (bad file type, file too large) fell through to Express's default HTML error page instead of JSON — added a catch-all JSON error handler in `app.ts` after the API router.
