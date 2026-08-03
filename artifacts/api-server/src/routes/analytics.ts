// @ts-nocheck
/**
 * Analytics routes — Phase D Executive Analytics
 * All routes require admin auth.
 * Provides: Booking Funnel, Revenue Analytics, Marketing Campaigns CRUD,
 * Lead Source ROI, Agent Performance, AI Revenue Forecasting.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  DB Migration — marketing_campaigns table
// ─────────────────────────────────────────────────────────────────────────────
async function ensureAnalyticsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id            TEXT PRIMARY KEY DEFAULT 'mc_' || gen_random_uuid()::text,
      name          TEXT NOT NULL,
      channel       TEXT NOT NULL DEFAULT 'whatsapp',
      status        TEXT NOT NULL DEFAULT 'draft',
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add columns that may be missing if the table pre-existed with a different schema
  const alterCols = [
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'awareness'`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS budget NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS spend NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS leads_gen INTEGER DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS revenue_attr NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS start_date DATE`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS end_date DATE`,
    `ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS notes TEXT`,
  ];
  for (const sql of alterCols) { await pool.query(sql).catch(() => {}); }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_tenant ON marketing_campaigns(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_status ON marketing_campaigns(status, start_date DESC)`);
  console.log("[Analytics] Tables ensured");
}
ensureAnalyticsTables().catch(e => console.error("[Analytics] Migration error:", e));

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/booking-funnel
//  Returns stage-by-stage funnel data from leads → bookings → confirmed → departed
// ─────────────────────────────────────────────────────────────────────────────
router.get("/booking-funnel", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [leads, bookings, payments, confirmed, departed] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE tenant_id=$1::uuid AND created_at >= NOW() - INTERVAL '90 days'`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM bookings WHERE tenant_id=$1::uuid AND created_at >= NOW() - INTERVAL '90 days'`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM bookings WHERE tenant_id=$1::uuid AND paid_amount > 0 AND created_at >= NOW() - INTERVAL '90 days'`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM bookings WHERE tenant_id=$1::uuid AND status IN ('confirmed','completed') AND created_at >= NOW() - INTERVAL '90 days'`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM bookings WHERE tenant_id=$1::uuid AND status = 'completed' AND created_at >= NOW() - INTERVAL '90 days'`, [tenantId]),
    ]);

    // Lead stage breakdown
    const leadStages = await pool.query(`
      SELECT pipeline_stage as stage, COUNT(*)::int as count
      FROM leads WHERE tenant_id=$1::uuid AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY pipeline_stage ORDER BY count DESC
    `, [tenantId]);

    // Monthly booking trend (last 6 months)
    const monthlyTrend = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'Mon YY') as month,
        TO_CHAR(created_at, 'YYYY-MM') as month_key,
        COUNT(*)::int as bookings,
        COALESCE(SUM(final_amount),0)::bigint as revenue
      FROM bookings
      WHERE tenant_id=$1::uuid AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY month_key, month
      ORDER BY month_key ASC
    `, [tenantId]);

    const totalLeads = leads.rows[0].count || 1;

    res.json({
      funnel: [
        { stage: "Leads (90d)",         count: leads.rows[0].count,    pct: 100, color: "#8b5cf6" },
        { stage: "Bookings Created",    count: bookings.rows[0].count, pct: Math.round((bookings.rows[0].count/totalLeads)*100), color: "#3b82f6" },
        { stage: "Payment Started",     count: payments.rows[0].count, pct: Math.round((payments.rows[0].count/totalLeads)*100), color: "#f59e0b" },
        { stage: "Confirmed",           count: confirmed.rows[0].count,pct: Math.round((confirmed.rows[0].count/totalLeads)*100), color: "#10b981" },
        { stage: "Departed",            count: departed.rows[0].count, pct: Math.round((departed.rows[0].count/totalLeads)*100), color: "#0d9488" },
      ],
      leadStages: leadStages.rows,
      monthlyTrend: monthlyTrend.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/revenue
//  Detailed revenue breakdown: monthly, by package, by agent, by source
// ─────────────────────────────────────────────────────────────────────────────
router.get("/revenue", requireAdmin as any, async (req, res) => {
  try {
    const months = parseInt(String(req.query.months || "12"));

    const tenantId = getTenantId(req);
    const [monthly, byPackage, bySource, summary] = await Promise.all([
      pool.query(`
        SELECT
          TO_CHAR(pt.created_at, 'Mon YY') as month,
          TO_CHAR(pt.created_at, 'YYYY-MM') as month_key,
          COALESCE(SUM(pt.amount),0)::bigint as collected,
          COUNT(DISTINCT pt.booking_id)::int as bookings
        FROM payment_transactions pt
        WHERE pt.tenant_id=$2::uuid
          AND pt.created_at >= NOW() - ($1 || ' months')::INTERVAL
          AND (pt.is_deleted IS NULL OR pt.is_deleted=false)
        GROUP BY month_key, month ORDER BY month_key ASC
      `, [months, tenantId]),

      pool.query(`
        SELECT
          p.name as package_name,
          COUNT(DISTINCT b.id)::int as bookings,
          COALESCE(SUM(b.final_amount),0)::bigint as revenue,
          COALESCE(SUM(b.paid_amount),0)::bigint as collected,
          COALESCE(SUM(b.final_amount - b.paid_amount),0)::bigint as outstanding
        FROM bookings b
        LEFT JOIN packages p ON p.id = b.package_id
        WHERE b.tenant_id=$2::uuid AND b.created_at >= NOW() - ($1 || ' months')::INTERVAL
        GROUP BY p.name ORDER BY revenue DESC LIMIT 10
      `, [months, tenantId]),

      pool.query(`
        SELECT
          COALESCE(l.source, 'direct') as source,
          COUNT(DISTINCT b.id)::int as bookings,
          COALESCE(SUM(b.final_amount),0)::bigint as revenue
        FROM bookings b
        LEFT JOIN leads l ON l.converted_booking_id = b.id
        WHERE b.tenant_id=$2::uuid AND b.created_at >= NOW() - ($1 || ' months')::INTERVAL
        GROUP BY source ORDER BY revenue DESC LIMIT 10
      `, [months, tenantId]),

      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN (pt.is_deleted IS NULL OR pt.is_deleted=false) THEN pt.amount ELSE 0 END),0)::bigint as total_collected,
          COALESCE(SUM(b.final_amount - b.paid_amount),0)::bigint as total_outstanding,
          COALESCE(SUM(b.final_amount),0)::bigint as total_revenue,
          COUNT(DISTINCT b.id)::int as total_bookings,
          COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.id END)::int as confirmed_bookings
        FROM bookings b
        LEFT JOIN payment_transactions pt ON pt.booking_id = b.id
        WHERE b.tenant_id=$2::uuid AND b.created_at >= NOW() - ($1 || ' months')::INTERVAL
      `, [months, tenantId]),
    ]);

    res.json({
      summary: summary.rows[0],
      monthly: monthly.rows,
      byPackage: byPackage.rows,
      bySource: bySource.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/marketing
//  Marketing campaign performance dashboard data
// ─────────────────────────────────────────────────────────────────────────────
router.get("/marketing", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const campaigns = await pool.query(`
      SELECT *, 
        CASE WHEN spend > 0 THEN ROUND((revenue_attr / spend * 100)::numeric, 1) ELSE 0 END as roi_pct,
        CASE WHEN impressions > 0 THEN ROUND((clicks::numeric / impressions * 100), 2) ELSE 0 END as ctr,
        CASE WHEN leads_gen > 0 THEN ROUND((conversions::numeric / leads_gen * 100), 1) ELSE 0 END as conv_rate,
        CASE WHEN spend > 0 AND leads_gen > 0 THEN ROUND(spend / leads_gen, 0) ELSE 0 END as cpl
      FROM marketing_campaigns WHERE tenant_id=$1::uuid
      ORDER BY created_at DESC LIMIT 50
    `, [tenantId]);

    const summary = await pool.query(`
      SELECT
        COUNT(*)::int as total_campaigns,
        COUNT(CASE WHEN status='active' THEN 1 END)::int as active,
        COALESCE(SUM(budget),0)::bigint as total_budget,
        COALESCE(SUM(spend),0)::bigint as total_spend,
        COALESCE(SUM(leads_gen),0)::int as total_leads,
        COALESCE(SUM(conversions),0)::int as total_conversions,
        COALESCE(SUM(revenue_attr),0)::bigint as total_revenue,
        CASE WHEN SUM(spend) > 0 THEN ROUND(SUM(revenue_attr)/SUM(spend)*100,1) ELSE 0 END as overall_roi
      FROM marketing_campaigns WHERE tenant_id=$1::uuid
    `, [tenantId]);

    // Channel breakdown
    const byChannel = await pool.query(`
      SELECT channel, COUNT(*)::int as campaigns,
        COALESCE(SUM(spend),0)::bigint as spend,
        COALESCE(SUM(leads_gen),0)::int as leads,
        COALESCE(SUM(revenue_attr),0)::bigint as revenue
      FROM marketing_campaigns WHERE tenant_id=$1::uuid GROUP BY channel ORDER BY spend DESC
    `, [tenantId]);

    res.json({ campaigns: campaigns.rows, summary: summary.rows[0], byChannel: byChannel.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CRUD: Marketing Campaigns
// ─────────────────────────────────────────────────────────────────────────────
router.post("/marketing/campaigns", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, channel, campaign_type, status, budget, spend, impressions,
            clicks, leads_gen, conversions, revenue_attr, start_date, end_date, notes } = req.body;
    if (!name?.trim()) return void res.status(400).json({ error: "Campaign name required" });

    const r = await pool.query(`
      INSERT INTO marketing_campaigns
        (name, channel, campaign_type, status, budget, spend, impressions, clicks,
         leads_gen, conversions, revenue_attr, start_date, end_date, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [name.trim(), channel||"whatsapp", campaign_type||"awareness", status||"draft",
        budget||0, spend||0, impressions||0, clicks||0, leads_gen||0, conversions||0,
        revenue_attr||0, start_date||null, end_date||null, notes||null,
        (req as any).user?.name || "Admin"]);

    res.status(201).json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/marketing/campaigns/:id", requireAdmin as any, async (req, res) => {
  try {
    const { name, channel, campaign_type, status, budget, spend, impressions,
            clicks, leads_gen, conversions, revenue_attr, start_date, end_date, notes } = req.body;
    const r = await pool.query(`
      UPDATE marketing_campaigns SET
        name=COALESCE($1,name), channel=COALESCE($2,channel), campaign_type=COALESCE($3,campaign_type),
        status=COALESCE($4,status), budget=COALESCE($5,budget), spend=COALESCE($6,spend),
        impressions=COALESCE($7,impressions), clicks=COALESCE($8,clicks),
        leads_gen=COALESCE($9,leads_gen), conversions=COALESCE($10,conversions),
        revenue_attr=COALESCE($11,revenue_attr), start_date=COALESCE($12,start_date),
        end_date=COALESCE($13,end_date), notes=COALESCE($14,notes), updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [name||null, channel||null, campaign_type||null, status||null,
        budget!==undefined?budget:null, spend!==undefined?spend:null,
        impressions!==undefined?impressions:null, clicks!==undefined?clicks:null,
        leads_gen!==undefined?leads_gen:null, conversions!==undefined?conversions:null,
        revenue_attr!==undefined?revenue_attr:null, start_date||null, end_date||null,
        notes||null, req.params.id]);
    if (!r.rows[0]) return void res.status(404).json({ error: "Campaign not found" });
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/marketing/campaigns/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM marketing_campaigns WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/agent-performance
//  Agent leaderboard with booking + lead metrics
// ─────────────────────────────────────────────────────────────────────────────
router.get("/agent-performance", requireAdmin as any, async (req, res) => {
  try {
    const months = parseInt(String(req.query.months || "3"));
    const agents = await pool.query(`
      SELECT
        COALESCE(ag.name, 'Unassigned') as agent_name,
        COUNT(DISTINCT b.id)::int as bookings,
        COUNT(DISTINCT CASE WHEN b.status IN ('confirmed','completed') THEN b.id END)::int as confirmed,
        COALESCE(SUM(b.paid_amount),0)::bigint as collected,
        COALESCE(AVG(b.final_amount),0)::bigint as avg_ticket,
        COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END)::int as completed
      FROM bookings b
      LEFT JOIN agents ag ON ag.id = b.agent_id
      WHERE b.created_at >= NOW() - ($1 || ' months')::INTERVAL
        AND b.agent_id IS NOT NULL
      GROUP BY ag.name ORDER BY collected DESC LIMIT 20
    `, [months]);

    // Lead performance per agent
    const leadAgents = await pool.query(`
      SELECT
        COALESCE(assigned_name, assigned_to, 'Unassigned') as agent_name,
        COUNT(*)::int as leads_assigned,
        COUNT(CASE WHEN status='converted' OR converted_booking_id IS NOT NULL THEN 1 END)::int as converted,
        ROUND(AVG(COALESCE(ai_score,0)),1) as avg_ai_score
      FROM leads
      WHERE created_at >= NOW() - ($1 || ' months')::INTERVAL
        AND (assigned_name IS NOT NULL OR assigned_to IS NOT NULL)
      GROUP BY agent_name ORDER BY leads_assigned DESC LIMIT 20
    `, [months]);

    res.json({ agents: agents.rows, leadAgents: leadAgents.rows, months });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/analytics/forecast
//  AI-powered revenue forecast for next 3 months
// ─────────────────────────────────────────────────────────────────────────────
router.get("/forecast", requireAdmin as any, async (_req, res) => {
  try {
    // Gather last 12 months of revenue data for the model
    const historyR = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(amount),0)::bigint as revenue,
        COUNT(DISTINCT booking_id)::int as bookings
      FROM payment_transactions
      WHERE (is_deleted IS NULL OR is_deleted=false)
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month ASC
    `);

    const history = historyR.rows;
    const avgRevenue = history.length > 0
      ? history.reduce((s: number, m: any) => s + Number(m.revenue), 0) / history.length
      : 0;

    // Lead pipeline for conversion estimate
    const pipelineR = await pool.query(`
      SELECT
        COUNT(*)::int as active_leads,
        COUNT(CASE WHEN pipeline_stage IN ('qualified','proposal','negotiation') THEN 1 END)::int as hot_leads,
        COALESCE(AVG(CASE WHEN budget ~ '^[0-9]+$' THEN budget::numeric ELSE NULL END),0)::bigint as avg_budget
      FROM leads
      WHERE status NOT IN ('converted','lost','cancelled','spam')
    `);
    const pipeline = pipelineR.rows[0];

    // Try AI forecast
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

    let forecast: any[] = [];
    let narrative = "";
    let source = "rule";

    // Build simple rule-based forecast (always available)
    const trend = history.length >= 2
      ? (Number(history[history.length-1].revenue) - Number(history[0].revenue)) / history.length
      : 0;
    const baseRevenue = history.length > 0 ? Number(history[history.length-1].revenue) : avgRevenue;

    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const projected = Math.max(0, baseRevenue + trend * i);
      const hotLeadConversion = pipeline.hot_leads * 0.25 * (pipeline.avg_budget || 50000);
      forecast.push({
        month: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        month_key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
        low:  Math.round(projected * 0.80),
        mid:  Math.round(projected + hotLeadConversion * 0.3),
        high: Math.round(projected * 1.25 + hotLeadConversion * 0.5),
      });
    }

    if (apiKey && baseURL) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey, baseURL });
        const historyStr = history.map((m: any) =>
          `${m.month}: ₹${Number(m.revenue).toLocaleString("en-IN")} (${m.bookings} bookings)`
        ).join("\n");

        const response = await client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 600,
          messages: [{
            role: "user",
            content: `You are a financial analyst for Al Burhan Tours & Travels, a Hajj/Umrah travel company in India.

Revenue history (last 12 months):
${historyStr || "(no data yet)"}

Active lead pipeline:
- Total active leads: ${pipeline.active_leads}
- Hot leads (qualified/proposal/negotiation): ${pipeline.hot_leads}
- Average lead budget: ₹${Number(pipeline.avg_budget).toLocaleString("en-IN")}

Write a concise 2-3 sentence revenue forecast narrative for the next 3 months, referencing seasonal Hajj/Umrah booking patterns. Be specific about risks and opportunities. Return ONLY the narrative text, no JSON.`,
          }],
        });

        narrative = response.content[0]?.text?.trim() || "";
        source = "ai";
      } catch (e) {
        narrative = "";
      }
    }

    if (!narrative) {
      const perf = avgRevenue > 0 ? "positive" : "building";
      narrative = `Based on ${history.length} months of data with an average monthly collection of ₹${Math.round(avgRevenue).toLocaleString("en-IN")}, revenue is on a ${perf} trajectory. With ${pipeline.hot_leads} hot leads in the pipeline, near-term conversions could contribute ₹${Math.round(pipeline.hot_leads * 0.25 * (pipeline.avg_budget || 50000)).toLocaleString("en-IN")} in additional bookings. Seasonal Hajj registration periods typically see a 30-50% spike — monitor lead conversion closely.`;
    }

    res.json({ history, forecast, narrative, pipeline, source });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
