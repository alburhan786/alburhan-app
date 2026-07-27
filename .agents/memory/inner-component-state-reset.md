---
name: Inner function component state reset
description: Components defined as inner functions inside a parent component lose their state when the parent re-renders, because React treats the new function reference as a different component type and unmounts/remounts.
---

## The rule
Never define a React component inside another component's function body if the inner component holds (or wraps something that holds) local state you need to persist across parent re-renders.

## Why
React reconciles components by their **type identity** (the function reference). Each render of the parent creates a new function reference for any inner component. React sees `fn1 !== fn2`, unmounts the old subtree, mounts a new one. All local state in the remounted subtree resets to its initial value.

## How to apply
- Inner function components are only safe when they hold NO state (pure display).
- If an inner component manages state (open/close, form values, etc.), either:
  1. **Lift the state** to the parent component and pass it down as props.
  2. **Move the component definition** to module level (outside the parent function).
  3. **Use a portal** (`createPortal`) if the inner component needs to escape the subtree anyway.

## Al Burhan instance
`AdminNotificationCenter` rendered inside `SidebarHeader` (inner function of `AdminLayout`).
Bell click → `setOpen(true)` → `refresh()` → `setNotifications()` → `AdminLayout` re-renders →
new `SidebarHeader` reference → React unmounts old `AdminNotificationCenter` (open=true) →
mounts new one (open=false). Dropdown appeared to do nothing.

Fixed by: lifting `notifOpen` to `AdminLayout`, putting bell button in `SidebarHeader` closure
(reads AdminLayout state via closure, stores nothing locally), rendering `AdminNotificationCenter`
at `AdminLayout` level as a `createPortal` drawer.
