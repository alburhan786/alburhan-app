---
name: API server bundle external strategy
description: How to correctly configure esbuild externals so VPS (no node_modules) never gets a MODULE_NOT_FOUND crash
---

## Rule
Externalize ONLY devDependencies + pdfkit. Bundle ALL runtime dependencies.

**Previous broken strategy (DO NOT restore):** opt-in allowlist — any package
in pkg.dependencies but NOT in the allowlist was marked external → crash on VPS.

**Correct strategy (in place since 2026-07-20):**
```ts
const devDeps = Object.keys(pkg.devDependencies || {});
const externals = [...devDeps, "pdfkit"];
// Everything in pkg.dependencies is bundled automatically
```

**Why:** VPS has no node_modules. Every runtime dep must be inside dist/index.cjs.
pdfkit is the ONLY exception — it reads AFM/ICC font files from __dirname at runtime
(see pdfkit-bundle-external.md).

**How to apply:** When adding a new npm package to api-server:
- Add it to `dependencies` (not devDependencies) → it's automatically bundled, done.
- Never add runtime packages to devDependencies or they'll be external on VPS.

## Build validation
build.ts now exits with error code 1 if any runtime dep ends up in externals unexpectedly.
Check the build log line "📦 Bundling N runtime deps into CJS" — N should equal
the number of entries in pkg.dependencies minus workspace packages minus pdfkit.
