---
name: marketing_campaigns pre-existing schema mismatch
description: marketing_campaigns table pre-existed without analytics columns; migration pattern required
---

# Rule
The `marketing_campaigns` table was created by the enterprise module (WhatsApp campaigns) with a different schema than what analytics.ts expects. When analytics.ts runs `CREATE TABLE IF NOT EXISTS`, it silently skips the creation, then fails on `CREATE INDEX ON marketing_campaigns(tenant_id)` because `tenant_id` doesn't exist.

**Fix:** enterprise.ts `ensureLeadIntelligenceTables()` must include `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id/campaign_type/budget/spend/etc` before analytics.ts runs. These are idempotent.

**Why:** analytics.ts `ensureAnalyticsTables()` may fail silently (caught by top-level `.catch()`), so enterprise.ts is the reliable migration point.

**Columns added via ALTER (must persist):** tenant_id, campaign_type, budget, spend, impressions, leads_gen, conversions, revenue_attr, start_date, end_date, notes
