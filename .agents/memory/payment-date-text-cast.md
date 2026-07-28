---
name: payment_date TEXT cast rule
description: payment_transactions.payment_date and expenses.date are TEXT columns; casting rules for SQL comparisons
---

# Rule
`payment_transactions.payment_date` and `expenses.date` are TEXT (not DATE or TIMESTAMP).

**How to apply:**
- `DATE_TRUNC('month', payment_date)` → MUST be `DATE_TRUNC('month', payment_date::date)`
- `payment_date >= NOW() - INTERVAL '...'` → MUST be `payment_date::date >= CURRENT_DATE - INTERVAL '...'`
- `payment_date >= $1` where $1 is a YYYY-MM-DD string → FINE as TEXT-to-TEXT
- `payment_date::date >= $1::date` → also fine when $1 is a date string

**Why:** These columns were stored as TEXT historically. Comparing TEXT to TIMESTAMP (NOW()) triggers PostgreSQL type error. Using `::date` cast allows arithmetic. String params from query params (YYYY-MM-DD) compare lexicographically fine.

**Files fixed:** executive-dashboard.ts, finance-reports.ts (monthly-trend), analytics.ts was separate issue
