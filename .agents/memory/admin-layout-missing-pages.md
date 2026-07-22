---
name: Admin pages missing AdminLayout
description: Several admin pages had NO AdminLayout wrapper (rendered without sidebar); one used public MainLayout
---

## The Problem
`AdminRoute` in App.tsx does `return <Component />` with no layout wrapper. Pages must explicitly use `<AdminLayout>` in their JSX or they render without sidebar/header/breadcrumb.

## Pages That Were Fixed (2026-07-22)
These pages had NO sidebar at all before being fixed:
- `LoyaltyManager.tsx` — added AdminLayout
- `AutomationCenter.tsx` — added AdminLayout
- `WorkflowCenter.tsx` — added AdminLayout
- `SmsAuditLog.tsx` — added AdminLayout
- `NotificationTemplates.tsx` — added AdminLayout
- `InquiryManager.tsx` — added AdminLayout (adjusted height to `calc(100vh-260px)`)
- `CommunicationCenter.tsx` — added AdminLayout
- `SupportManager.tsx` — was using PUBLIC `MainLayout`, changed to AdminLayout

## Rule
Any new admin page created must explicitly use `<AdminLayout>` in its return, or it will render without sidebar. Check with:
```bash
grep -rL "AdminLayout" artifacts/alburhan/src/pages/admin/*.tsx
```
Modal files (BulkImportModal, QuickAddModal) don't need it.

**Why:** AdminRoute only checks auth, never adds layout. Layout is always per-page.
