---
name: ts-nocheck route strategy
description: Why @ts-nocheck is on 25+ route files and what root cause is
---

## Rule
25+ route files in artifacts/api-server/src/routes/ begin with `// @ts-nocheck`. Do NOT remove these without first resolving the underlying Drizzle schema type mismatches.

## Why
The Drizzle ORM schema types in `lib/db` don't match what the route files expect:
- `bookingsTable` missing `deletedAt`, `deletedBy`, `discountType`, `discountAmount`, `discountPercentage`, `discountReason` columns
- `@workspace/api-zod` missing exported members (`SendOtpBody`, `VerifyOtpBody`, `CreateBookingBody`, etc.)
- PgTransaction type incompatible with NodePgDatabase when passed to helper functions
- Drizzle `.where(eq(...))` No overload due to column type mismatch in attendanceEventsTable, pilgrimsTable, packageRequestsTable, etc.

## How to apply
If adding new routes: safe to add new route files without @ts-nocheck if they only use pool.query() (not Drizzle ORM).
To properly fix: rebuild lib/db schema to include all columns (run drizzle-kit push/generate), then regenerate types, then remove @ts-nocheck one file at a time.

## Files with @ts-nocheck (as of v19)
accounting, admin, admin-payments, attendance, auth, bookings, broadcasts, documents, expenses, feedback, flights, gallery, inquiry, invoices, notification-center, notifications, offline-payments, package-media, packages, payments, payroll, requests, staff, users-admin (24 files)
