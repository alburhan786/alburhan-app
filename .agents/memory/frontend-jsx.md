---
name: Frontend JSX convention
description: This project uses React not Preact — className= not class=, react not preact/hooks
---

# Rule
All frontend code in `artifacts/alburhan/src/` uses **React** (not Preact).

**Why:** The build pipeline imports from `react` and `react-dom`. Using `preact/hooks` or `@preact/signals` will cause a hard Vite build failure: "Failed to resolve import 'preact/hooks'".

**How to apply:**
- Always use `import { useState, useEffect } from "react"` — never `preact/hooks`
- Always use `className=` in JSX — never bare `class=`
- Never use `@preact/signals` — use React's `useState` / `useRef` for state
- Existing pages like `ZiyaratManager.tsx` and `AllocationsManager.tsx` are the reference pattern
