---
name: Admin page API pattern
description: How admin pages in the alburhan frontend make API calls — no shared apiUrl helper, use VITE_API_URL env directly
---

## Rule
Admin pages use `const API = import.meta.env.VITE_API_URL || ""` at the top of the file, then inline as `` `${API}/api/route` ``.

**Why:** There is no `@/lib/api` module in the alburhan frontend. Importing from it causes a build failure.

**How to apply:** Any new admin page that needs to call backend APIs must declare the API constant locally — do not import from `@/lib/api`.
