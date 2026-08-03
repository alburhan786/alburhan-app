// @ts-nocheck
import { Router } from "express";
import { getTenantId } from "../lib/tenantContext.js";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();

// ── Pipeline stages (26-stage spec) ──────────────────────────────────────────
export const PIPELINE_STAGES = [
  { key: "new_lead",                  label: "New Lead",                  color: "#6366f1", order: 1  },
  { key: "auto_response_sent",        label: "Auto Response Sent",        color: "#8b5cf6", order: 2  },
  { key: "assigned",                  label: "Assigned",                  color: "#a855f7", order: 3  },
  { key: "contact_attempted",         label: "Contact Attempted",         color: "#ec4899", order: 4  },
  { key: "contacted",                 label: "Contacted",                 color: "#f59e0b", order: 5  },
  { key: "interested",                label: "Interested",                color: "#f97316", order: 6  },
  { key: "package_shared",            label: "Package Shared",            color: "#10b981", order: 7  },
  { key: "quotation_sent",            label: "Quotation Sent",            color: "#06b6d4", order: 8  },
  { key: "passport_awaited",          label: "Passport Awaited",          color: "#3b82f6", order: 9  },
  { key: "documents_received",        label: "Documents Received",        color: "#0ea5e9", order: 10 },
  { key: "advance_payment_pending",   label: "Advance Payment Pending",   color: "#f59e0b", order: 11 },
  { key: "advance_paid",              label: "Advance Paid",              color: "#84cc16", order: 12 },
  { key: "agreement_pending",         label: "Agreement Pending",         color: "#eab308", order: 13 },
  { key: "agreement_signed",          label: "Agreement Signed",          color: "#22c55e", order: 14 },
  { key: "visa_processing",           label: "Visa Processing",           color: "#14b8a6", order: 15 },
  { key: "ticket_pending",            label: "Ticket Pending",            color: "#f97316", order: 16 },
  { key: "ticket_issued",             label: "Ticket Issued",             color: "#10b981", order: 17 },
  { key: "hotel_confirmed",           label: "Hotel Confirmed",           color: "#06b6d4", order: 18 },
  { key: "balance_payment_pending",   label: "Balance Payment Pending",   color: "#fb923c", order: 19 },
  { key: "full_payment_received",     label: "Full Payment Received",     color: "#22c55e", order: 20 },
  { key: "travel_ready",              label: "Travel Ready",              color: "#16a34a", order: 21 },
  { key: "travel_completed",          label: "Travel Completed",          color: "#15803d", order: 22 },
  { key: "review_requested",          label: "Review Requested",          color: "#8b5cf6", order: 23 },
  { key: "future_remarketing",        label: "Future Remarketing",        color: "#6366f1", order: 24 },
  { key: "lost",                      label: "Lost",                      color: "#ef4444", order: 25 },
  { key: "spam",                      label: "Spam",                      color: "#6b7280", order: 26 },
];

// ── Migrations ────────────────────────────────────────────────────────────────
async function ensureCRMTables() {
  // Pipeline stage + extra lead columns
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new_lead'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS num_travellers INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS travel_month TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_lead_id TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_params JSONB DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_number TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_conversion_amount NUMERIC(14,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_communication_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_updated_at TIMESTAMPTZ DEFAULT NOW()`);

  // Auto-generate lead_number for existing rows
  await pool.query(`
    UPDATE leads SET lead_number = 'LD-' || LPAD(EXTRACT(EPOCH FROM created_at)::bigint::text, 10, '0')
    WHERE lead_number IS NULL
  `);

  // lead_activities — full timeline
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_activities (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      performed_by TEXT,
      performed_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON lead_activities(created_at DESC)`);

  // lead_followups — task management
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_followups (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_at TIMESTAMPTZ,
      type TEXT NOT NULL DEFAULT 'call',
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_to TEXT,
      assigned_to_name TEXT,
      completed_at TIMESTAMPTZ,
      completed_notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_followups_lead ON lead_followups(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_followups_status ON lead_followups(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_followups_due ON lead_followups(due_at)`);

  // comment_automation_rules
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comment_automation_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'facebook',
      keywords TEXT[] DEFAULT '{}',
      match_type TEXT NOT NULL DEFAULT 'any',
      public_reply TEXT,
      private_message TEXT,
      create_lead BOOLEAN DEFAULT false,
      lead_source TEXT DEFAULT 'facebook',
      assign_to TEXT,
      assign_to_name TEXT,
      cooldown_minutes INTEGER DEFAULT 60,
      is_active BOOLEAN DEFAULT true,
      trigger_count INTEGER DEFAULT 0,
      last_triggered_at TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // communication_consents
  await pool.query(`
    CREATE TABLE IF NOT EXISTS communication_consents (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      customer_id TEXT,
      mobile TEXT,
      email TEXT,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'opted_in',
      source TEXT,
      consent_text TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(mobile, channel),
      UNIQUE(email, channel)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consents_mobile ON communication_consents(mobile)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consents_lead ON communication_consents(lead_id)`);

  // webhook_events — idempotency store for Meta webhooks
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB,
      processed BOOLEAN DEFAULT false,
      processed_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_webhook_events_platform ON webhook_events(platform, event_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC)`);

  console.log("[CRM] Migration complete");
}
ensureCRMTables().catch(e => console.error("[CRM] Migration error:", e));

// ── Helper: log activity ───────────────────────────────────────────────────────
async function logActivity(
  leadId: string,
  type: string,
  content: string,
  metadata: object = {},
  performedBy?: string,
  performedByName?: string
) {
  await pool.query(
    `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), leadId, type, content, JSON.stringify(metadata), performedBy, performedByName]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/stages — list all 26 stages
router.get("/stages", requireAdmin, (_req, res) => {
  res.json({ ok: true, stages: PIPELINE_STAGES });
});

// GET /api/crm/pipeline — leads grouped by stage, with counts
router.get("/pipeline", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const search = (req.query.search as string || "").trim();
    const assignedTo = req.query.assigned_to as string;
    const source = req.query.source as string;

    let where = "1=1";
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (l.name ILIKE $${params.length} OR l.mobile ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.lead_number ILIKE $${params.length})`;
    }
    if (assignedTo) {
      params.push(assignedTo);
      where += ` AND l.assigned_to = $${params.length}`;
    }
    if (source) {
      params.push(source);
      where += ` AND l.source = $${params.length}`;
    }

    // Leads with stage info
    const leadsRes = await pool.query(
      `SELECT l.id, l.lead_number, l.name, l.first_name, l.last_name, l.mobile, l.email,
              l.source, l.pipeline_stage, l.status, l.score, l.budget, l.package_interest,
              l.assigned_to, l.city, l.state, l.expected_conversion_amount, l.num_travellers,
              l.travel_month, l.last_communication_at, l.pipeline_updated_at,
              l.created_at, l.updated_at,
              (SELECT COUNT(*)::int FROM lead_activities la WHERE la.lead_id = l.id) AS activity_count,
              (SELECT COUNT(*)::int FROM lead_followups lf WHERE lf.lead_id = l.id AND lf.status='pending') AS pending_followups
       FROM leads l
       WHERE ${where}
       ORDER BY l.pipeline_updated_at DESC NULLS LAST, l.created_at DESC
       LIMIT 2000`,
      params
    );

    // Group by stage
    const stageMap: Record<string, any[]> = {};
    for (const s of PIPELINE_STAGES) stageMap[s.key] = [];

    for (const lead of leadsRes.rows) {
      const stage = lead.pipeline_stage || "new_lead";
      if (!stageMap[stage]) stageMap[stage] = [];
      stageMap[stage].push(lead);
    }

    // Stage counts summary
    const countsRes = await pool.query(
      `SELECT COALESCE(pipeline_stage,'new_lead') AS stage, COUNT(*)::int AS count FROM leads GROUP BY pipeline_stage`
    );
    const stageCounts: Record<string, number> = {};
    for (const row of countsRes.rows) stageCounts[row.stage] = row.count;

    res.json({ ok: true, stages: PIPELINE_STAGES, stageMap, stageCounts, total: leadsRes.rows.length });
  } catch (err: any) {
    console.error("[CRM] GET /pipeline error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/crm/leads/:id/stage — move lead to new pipeline stage
router.patch("/leads/:id/stage", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { stage, reason } = req.body;

    if (!PIPELINE_STAGES.find(s => s.key === stage)) {
      return res.status(400).json({ ok: false, error: "Invalid stage key" });
    }

    const prev = await pool.query(`SELECT pipeline_stage, name FROM leads WHERE id=$1`, [id]);
    if (!prev.rows[0]) return res.status(404).json({ ok: false, error: "Lead not found" });

    const prevStage = prev.rows[0].pipeline_stage || "new_lead";
    const prevLabel = PIPELINE_STAGES.find(s => s.key === prevStage)?.label || prevStage;
    const newLabel = PIPELINE_STAGES.find(s => s.key === stage)?.label || stage;

    await pool.query(
      `UPDATE leads SET pipeline_stage=$1, pipeline_updated_at=NOW(), updated_at=NOW()
       ${stage === "lost" && reason ? ", lost_reason=$3" : ""}
       WHERE id=$2`,
      stage === "lost" && reason ? [stage, id, reason] : [stage, id]
    );

    await logActivity(
      id, "stage_change",
      `Stage moved: ${prevLabel} → ${newLabel}${reason ? ` (${reason})` : ""}`,
      { from: prevStage, to: stage, reason },
      req.user?.id?.toString(),
      req.user?.name
    );

    res.json({ ok: true, previous: prevStage, current: stage });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/leads/:id/activities
router.get("/leads/:id/activities", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM lead_activities WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [req.params.id]
    );
    res.json({ ok: true, activities: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/crm/leads/:id/activities
router.post("/leads/:id/activities", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { type = "note", content, metadata = {} } = req.body;

    if (!content?.trim()) return res.status(400).json({ ok: false, error: "content required" });

    const actId = randomUUID();
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [actId, id, type, content, JSON.stringify(metadata), req.user?.id?.toString(), req.user?.name]
    );

    // Update lead's last_communication_at for communication types
    if (["call", "message", "email", "sms", "whatsapp"].includes(type)) {
      await pool.query(`UPDATE leads SET last_communication_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]);
    }

    const row = await pool.query(`SELECT * FROM lead_activities WHERE id=$1`, [actId]);
    res.status(201).json({ ok: true, activity: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/crm/leads/:id/activities/:actId
router.delete("/leads/:id/activities/:actId", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM lead_activities WHERE id=$1 AND lead_id=$2`, [req.params.actId, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD FOLLOWUPS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/leads/:id/followups
router.get("/leads/:id/followups", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM lead_followups WHERE lead_id=$1 ORDER BY due_at ASC NULLS LAST, created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ ok: true, followups: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/crm/followups — all pending followups (admin overview)
router.get("/followups", requireAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || "pending";
    const result = await pool.query(
      `SELECT lf.*, l.name AS lead_name, l.mobile AS lead_mobile, l.pipeline_stage
       FROM lead_followups lf
       LEFT JOIN leads l ON l.id = lf.lead_id
       WHERE lf.status=$1
       ORDER BY lf.due_at ASC NULLS LAST, lf.created_at DESC
       LIMIT 200`,
      [status]
    );
    res.json({ ok: true, followups: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/crm/leads/:id/followups
router.post("/leads/:id/followups", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, due_at, type = "call", assigned_to, assigned_to_name } = req.body;

    if (!title?.trim()) return res.status(400).json({ ok: false, error: "title required" });

    const fId = randomUUID();
    await pool.query(
      `INSERT INTO lead_followups (id, lead_id, title, description, due_at, type, assigned_to, assigned_to_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fId, id, title, description, due_at || null, type, assigned_to, assigned_to_name, req.user?.id?.toString()]
    );

    await logActivity(id, "followup_created", `Follow-up scheduled: ${title}`, { type, due_at }, req.user?.id?.toString(), req.user?.name);

    // Update lead followup_due_at
    if (due_at) {
      await pool.query(`UPDATE leads SET followup_due_at=$1, updated_at=NOW() WHERE id=$2`, [due_at, id]);
    }

    const row = await pool.query(`SELECT * FROM lead_followups WHERE id=$1`, [fId]);
    res.status(201).json({ ok: true, followup: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/crm/leads/:id/followups/:fid — complete, cancel, update
router.patch("/leads/:id/followups/:fid", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, fid } = req.params;
    const { status, completed_notes, title, description, due_at, type } = req.body;

    const sets: string[] = ["updated_at=NOW()"];
    const params: any[] = [];

    if (status) { params.push(status); sets.push(`status=$${params.length}`); }
    if (completed_notes) { params.push(completed_notes); sets.push(`completed_notes=$${params.length}`); }
    if (title) { params.push(title); sets.push(`title=$${params.length}`); }
    if (description !== undefined) { params.push(description); sets.push(`description=$${params.length}`); }
    if (due_at) { params.push(due_at); sets.push(`due_at=$${params.length}`); }
    if (type) { params.push(type); sets.push(`type=$${params.length}`); }
    if (status === "completed") sets.push(`completed_at=NOW()`);

    params.push(fid, id);
    await pool.query(
      `UPDATE lead_followups SET ${sets.join(",")} WHERE id=$${params.length - 1} AND lead_id=$${params.length}`,
      params
    );

    if (status === "completed") {
      await logActivity(id, "followup_completed", completed_notes || "Follow-up marked complete", {}, req.user?.id?.toString(), req.user?.name);
    }

    const row = await pool.query(`SELECT * FROM lead_followups WHERE id=$1`, [fid]);
    res.json({ ok: true, followup: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/crm/leads/:id/followups/:fid
router.delete("/leads/:id/followups/:fid", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM lead_followups WHERE id=$1 AND lead_id=$2`, [req.params.fid, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENT AUTOMATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/comment-automation
router.get("/comment-automation", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM comment_automation_rules ORDER BY created_at DESC`);
    res.json({ ok: true, rules: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/crm/comment-automation
router.post("/comment-automation", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      rule_name, platform = "facebook", keywords = [], match_type = "any",
      public_reply, private_message, create_lead = false, lead_source,
      assign_to, assign_to_name, cooldown_minutes = 60, is_active = true
    } = req.body;

    if (!rule_name?.trim()) return res.status(400).json({ ok: false, error: "rule_name required" });

    const id = randomUUID();
    await pool.query(
      `INSERT INTO comment_automation_rules
       (id, rule_name, platform, keywords, match_type, public_reply, private_message,
        create_lead, lead_source, assign_to, assign_to_name, cooldown_minutes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, rule_name, platform, keywords, match_type, public_reply, private_message,
       create_lead, lead_source || platform, assign_to, assign_to_name, cooldown_minutes, is_active,
       req.user?.id?.toString()]
    );

    const row = await pool.query(`SELECT * FROM comment_automation_rules WHERE id=$1`, [id]);
    res.status(201).json({ ok: true, rule: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/crm/comment-automation/:id
router.patch("/comment-automation/:id", requireAdmin, async (req, res) => {
  try {
    const {
      rule_name, platform, keywords, match_type, public_reply, private_message,
      create_lead, lead_source, assign_to, assign_to_name, cooldown_minutes, is_active
    } = req.body;

    const sets: string[] = ["updated_at=NOW()"];
    const params: any[] = [];

    const field = (col: string, val: any) => { if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`); } };
    field("rule_name", rule_name); field("platform", platform); field("keywords", keywords);
    field("match_type", match_type); field("public_reply", public_reply);
    field("private_message", private_message); field("create_lead", create_lead);
    field("lead_source", lead_source); field("assign_to", assign_to);
    field("assign_to_name", assign_to_name); field("cooldown_minutes", cooldown_minutes);
    field("is_active", is_active);

    params.push(req.params.id);
    await pool.query(`UPDATE comment_automation_rules SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    const row = await pool.query(`SELECT * FROM comment_automation_rules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, rule: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/crm/comment-automation/:id
router.delete("/comment-automation/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM comment_automation_rules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/crm/comment-automation/test — simulate a comment match
router.post("/comment-automation/test", requireAdmin, async (req, res) => {
  try {
    const { comment_text } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ ok: false, error: "comment_text required" });

    const rules = await pool.query(`SELECT * FROM comment_automation_rules WHERE is_active=true ORDER BY created_at`);
    const text = comment_text.toLowerCase();
    const matched = [];

    for (const rule of rules.rows) {
      const kws = (rule.keywords || []).map((k: string) => k.toLowerCase().trim()).filter(Boolean);
      let matches = false;
      if (rule.match_type === "any") matches = kws.some((k: string) => text.includes(k));
      else if (rule.match_type === "all") matches = kws.every((k: string) => text.includes(k));
      else if (rule.match_type === "exact") matches = kws.some((k: string) => text === k);
      if (matches) matched.push({ rule_name: rule.rule_name, platform: rule.platform, public_reply: rule.public_reply, private_message: rule.private_message });
    }

    res.json({ ok: true, comment_text, matched_rules: matched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATION CONSENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/consents
router.get("/consents", requireAdmin, async (req, res) => {
  try {
    const { mobile, email, lead_id } = req.query;
    const conds: string[] = [];
    const params: any[] = [];

    if (mobile) { params.push(`%${mobile}%`); conds.push(`mobile ILIKE $${params.length}`); }
    if (email)  { params.push(`%${email}%`);  conds.push(`email ILIKE $${params.length}`);  }
    if (lead_id){ params.push(lead_id);         conds.push(`lead_id = $${params.length}`);   }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const result = await pool.query(`SELECT * FROM communication_consents ${where} ORDER BY updated_at DESC LIMIT 500`, params);
    res.json({ ok: true, consents: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/crm/consents — upsert a consent record
router.post("/consents", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { lead_id, customer_id, mobile, email, channel, status = "opted_in", source, consent_text } = req.body;

    if (!channel) return res.status(400).json({ ok: false, error: "channel required" });
    if (!mobile && !email) return res.status(400).json({ ok: false, error: "mobile or email required" });

    const id = randomUUID();
    await pool.query(
      `INSERT INTO communication_consents (id, lead_id, customer_id, mobile, email, channel, status, source, consent_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (mobile, channel) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`,
      [id, lead_id, customer_id, mobile, email, channel, status, source, consent_text]
    );

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/webhook-events
router.get("/webhook-events", requireAdmin, async (req, res) => {
  try {
    const platform = req.query.platform as string;
    const params: any[] = [];
    let where = "";
    if (platform) { params.push(platform); where = `WHERE platform=$1`; }

    const result = await pool.query(
      `SELECT * FROM webhook_events ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ ok: true, events: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD DETAIL (enhanced with CRM data)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/leads/:id — full lead detail with activities + followups
router.get("/leads/:id", requireAdmin, async (req, res) => {
  try {
    const lead = await pool.query(`SELECT * FROM leads WHERE id=$1`, [req.params.id]);
    if (!lead.rows[0]) return res.status(404).json({ ok: false, error: "Not found" });

    const activities = await pool.query(
      `SELECT * FROM lead_activities WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    const followups = await pool.query(
      `SELECT * FROM lead_followups WHERE lead_id=$1 ORDER BY due_at ASC NULLS LAST LIMIT 20`,
      [req.params.id]
    );
    const messages = await pool.query(
      `SELECT * FROM social_messages WHERE lead_text_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );

    res.json({
      ok: true,
      lead: lead.rows[0],
      activities: activities.rows,
      followups: followups.rows,
      messages: messages.rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/crm/leads/:id — update lead fields
router.patch("/leads/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const allowed = [
      "name","first_name","last_name","mobile","email","city","state","country",
      "source","package_interest","budget","num_travellers","travel_month",
      "assigned_to","expected_conversion_amount","lost_reason","notes"
    ];
    const sets: string[] = ["updated_at=NOW()"];
    const params: any[] = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        sets.push(`${key}=$${params.length}`);
      }
    }

    if (sets.length === 1) return res.status(400).json({ ok: false, error: "No fields to update" });

    params.push(req.params.id);
    await pool.query(`UPDATE leads SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    const row = await pool.query(`SELECT * FROM leads WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, lead: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/crm/dashboard
router.get("/dashboard", requireAdmin, async (_req, res) => {
  try {
    const [stageCounts, scoreBreakdown, sourceBreakdown, pendingFollowups, recentActivities, overdueFollowups] =
      await Promise.all([
        pool.query(`SELECT COALESCE(pipeline_stage,'new_lead') AS stage, COUNT(*)::int AS count FROM leads GROUP BY pipeline_stage ORDER BY count DESC`),
        pool.query(`SELECT COALESCE(score,'cold') AS score, COUNT(*)::int AS count FROM leads GROUP BY score ORDER BY count DESC`),
        pool.query(`SELECT COALESCE(source,'unknown') AS source, COUNT(*)::int AS count FROM leads GROUP BY source ORDER BY count DESC LIMIT 10`),
        pool.query(`SELECT COUNT(*)::int AS count FROM lead_followups WHERE status='pending'`),
        pool.query(`SELECT la.*, l.name AS lead_name FROM lead_activities la LEFT JOIN leads l ON l.id=la.lead_id ORDER BY la.created_at DESC LIMIT 10`),
        pool.query(`SELECT lf.*, l.name AS lead_name, l.mobile AS lead_mobile FROM lead_followups lf LEFT JOIN leads l ON l.id=lf.lead_id WHERE lf.status='pending' AND lf.due_at < NOW() ORDER BY lf.due_at ASC LIMIT 10`),
      ]);

    const total = stageCounts.rows.reduce((s: number, r: any) => s + r.count, 0);
    const wonCount = (stageCounts.rows.find((r: any) => r.stage === "full_payment_received")?.count || 0) +
                     (stageCounts.rows.find((r: any) => r.stage === "travel_completed")?.count || 0);
    const lostCount = stageCounts.rows.find((r: any) => r.stage === "lost")?.count || 0;
    const conversionRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;

    res.json({
      ok: true,
      summary: { total, wonCount, lostCount, conversionRate, pendingFollowups: pendingFollowups.rows[0]?.count || 0 },
      stageCounts: stageCounts.rows,
      scoreBreakdown: scoreBreakdown.rows,
      sourceBreakdown: sourceBreakdown.rows,
      recentActivities: recentActivities.rows,
      overdueFollowups: overdueFollowups.rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
