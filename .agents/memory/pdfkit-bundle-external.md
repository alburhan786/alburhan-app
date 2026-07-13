---
name: pdfkit must stay external in esbuild bundle
description: pdfkit loads AFM font files and ICC color profiles from disk at runtime using __dirname — bundling it breaks PDF generation on VPS
---

## Rule
Never add `"pdfkit"` to the `allowlist` in `artifacts/api-server/build.ts`. Keep it external.

**Why:** pdfkit loads binary data files (AFM fonts, sRGB ICC profile) from disk using `__dirname/data/...` at runtime. When esbuild bundles pdfkit's JS, `__dirname` points to the bundle directory, not pdfkit's own `node_modules/pdfkit/js/` path. This causes `ENOENT` errors on every PDF generation call, returning HTTP 500 "Failed to generate PDF".

**How to apply:** The `allowlist` in `build.ts` controls which packages are inlined. pdfkit is intentionally commented out with an explanation. If it's ever re-added, all PDF endpoints (invoice PDF, receipt PDF, group card PDF) will silently fail on VPS.

**Symptom:** `{"message":"Failed to generate PDF"}` — HTTP 500 on `/api/invoices/:id/pdf`. Confirmed by `/api/migrate/pdf-debug` returning `{ok:false, error:"..."}`.

**Fix confirmed:** Removing pdfkit from allowlist → `pdf-debug` returns `{ok:true, bytes:1264, pdfkitVersion:"0.18.0"}` and `/api/invoices/:id/pdf` returns HTTP 200 with 222,847 byte valid PDF.
