---
name: Analytics Phase D routes
description: Phase D analytics router — new file analytics.ts, endpoints, and frontend pages
---

# Analytics Phase D

**Why:** Phase D added Executive Analytics suite for Al Burhan ERP.

## New backend file
`artifacts/api-server/src/routes/analytics.ts` — mounted at `/api/analytics` in app.ts.

## Key endpoints
- `/booking-funnel` — lead-to-departed 90d funnel
- `/revenue?months=N` — monthly + by-package + by-source breakdown
- `/marketing` — campaign performance; CRUD at `/marketing/campaigns`
- `/agent-performance?months=N`
- `/forecast` — Anthropic Claude + rule-based 3-month forecast

## marketing_campaigns table
Auto-migrated on startup in analytics.ts. Columns: id, tenant_id, name, channel, campaign_type, status, budget, spend, impressions, clicks, leads_gen, conversions, revenue_attr, start_date, end_date.

## Frontend pages
- `BookingFunnel.tsx` → `/admin/funnel`
- `RevenueAnalytics.tsx` → `/admin/revenue`
- `AiForecast.tsx` → `/admin/forecast`

All use named import `{ AdminLayout }` (not default export).
