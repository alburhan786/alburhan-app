---
name: Service worker caches Vite dev modules
description: SW cache-first strategy intercepts /src/ and /@vite/ paths, making all Vite hot-module edits invisible to the browser.
---

## The Rule
`public/sw.js` must ALWAYS bypass (not intercept) Vite dev-server paths. Any change to a source file will be silently ignored if the SW serves the old cached version.

**Paths that must never be SW-intercepted:**
- `/src/` — Vite-served source files
- `/@vite/` — Vite client
- `/@react-refresh` — React Refresh runtime
- `/@fs/` — Vite filesystem access
- `/node_modules/` — pre-bundled deps
- `/__vite` — Vite internals

## Why
The SW used cache-first for ALL static GET requests. On first load it cached `/src/App.tsx`, `/src/pages/admin/ProcurementPage.tsx`, etc. Every subsequent edit was invisible because the SW returned the cached (stale) version. This caused a React hook-count crash because an old multi-hook module was being served while React Refresh expected the new zero-hook version.

The symptom: "An error occurred in the <ComponentName> component" with a component name that doesn't match any current export — proving an old cached module is being served.

## How to Apply
When any page crashes inexplicably and resists all code-level fixes:
1. Check if a service worker is registered (see `public/sw.js`, check index.html)
2. If SW has cache-first strategy for static assets, add bypass for `/src/` and `/@` paths
3. Bump the CACHE version string (e.g. `alburhan-v1` → `alburhan-v2`) to force SW to delete old caches on activate
4. After SW update, the second page load (after activate) will see fresh modules
