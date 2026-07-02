---
name: Family management schema
description: How family grouping works in the pilgrim schema and QR code safety rule for print pages.
---

## Family fields on pilgrims table
- `familyId` (TEXT) — shared ID string across all members of a family (e.g. "FAM001")
- `familyHead` (BOOLEAN) — true for the designated head of family
- `familyRelation` (TEXT) — relation label (e.g. "Wife", "Son", "Daughter")

## Correct tab count for Families tab
Use `new Set(pilgrims.filter(p => p.familyId).map(p => p.familyId!)).size` — NOT `families.length` (which is derived from a separate API call that may lag).

## QR code rule for print pages
**Never use `QRCodeCanvas` from `qrcode.react` on print pages** — it crashes or renders blank on print-triggered pages.
Use `QrImg` instead: `<img src={https://api.qrserver.com/v1/create-qr-code/?size=${n}x${n}&data=...} />`.

The `QrImg` helper is defined as a function component inside `PilgrimManager.tsx` and `PrintFamilySheet.tsx`.

## FamilyGroup type
Constructed from the API response at `GET /api/groups/:groupId/families`, grouping pilgrims by familyId into `{ familyId, head, members[] }`.

**Why:** The head field drives the QR verify URL (`/verify/family/:groupId/:familyId`) and the sync-logistics endpoint uses the head's room/bus as the source of truth.
