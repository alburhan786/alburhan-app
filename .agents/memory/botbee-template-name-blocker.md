---
name: BotBee booking_approved template name blocker
description: The "Booking Approved" WhatsApp template (ID 407642) cannot be found by name; BotBee has no template listing API. Admin must check dashboard for exact name.
---

# BotBee booking_approved Template Name Blocker

## The Problem
Template ID 407642 (used for "Booking Approved" WhatsApp message) returns
"Message template not found" for every name tried:
- approve, bookingapproved, booking_approved, approved, approval, confirmation,
  conformation, bookingconfirmation, booking_confirmation, hajjapproval

BotBee provides **no working template list API** — 7 endpoint patterns all return 404:
- /api/v1/whatsapp/templates, /api/v1/whatsapp/template, /api/v1/templates,
- /api/v1/whatsapp/templates/list, /api/v1/whatsapp/approved-templates,
- /api/v1/business/templates, /api/v1/whatsapp/template/all

**Why:** The name registered in BotBee for ID 407642 is unknown and cannot be guessed.

## How to Fix
1. Admin logs in to BotBee dashboard → Templates → find ID 407642 or "Booking Approved"
2. Copy exact registered name (case-sensitive, as stored in BotBee)
3. SSH to VPS: `echo 'BOTBEE_BOOKING_APPROVED_TEMPLATE=<exact_name>' >> /var/www/alburhan/.env`
4. `pm2 restart alburhan`
5. Test: `POST https://alburhantravels.com/api/migrate/test-approval-template`
   with body `{"key":"alburhan-migrate-2026","mobile":"9867114562","overrideName":"<exact_name>"}`
   → should return `"ok": true`

## Infrastructure Already Built
- `BOTBEE_BOOKING_APPROVED_TEMPLATE` env var read at startup by `ABT_TEMPLATES` in botbee.ts
- Central config: `artifacts/api-server/src/lib/templateConfig.ts`
- Admin page: `/admin/notification-templates` has Test button per template
- Probe: `GET /api/migrate/botbee-discovery` (confirmed all BotBee list APIs → 404)
- Probe: `POST /api/migrate/test-approval-template?key=...` with `overrideName` param

## Current Default
`bookingapproved` (changed from old `approve` which had 85 failures)
Both fail identically — the template simply doesn't exist under any guessed name.
