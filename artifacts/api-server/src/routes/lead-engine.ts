// @ts-nocheck
/**
 * Lead Engine Routes — Phase A
 * POST /api/leads/create          — create/dedup lead from any source
 * GET  /api/leads                 — list with filters + pagination
 * GET  /api/leads/stats           — dashboard counters
 * GET  /api/leads/:id             — full lead detail
 * PATCH /api/leads/:id            — update lead fields
 * POST /api/leads/:id/score       — recalculate score
 * POST /api/leads/:id/assign      — manual assignment
 * POST /api/leads/:id/convert     — convert to booking
 * DELETE /api/leads/:id           — soft delete (mark spam)
 *
 * GET  /api/leads/assignment-rules
 * POST /api/leads/assignment-rules
 * PATCH /api/leads/assignment-rules/:id
 * DELETE /api/leads/assignment-rules/:id
 *
 * POST /api/leads/opt-out         — manual opt-out
 * GET  /api/leads/:id/consent     — consent status
 * POST /api/leads/bulk-assign     — bulk reassign
 * GET  /api/leads/followup-queue  — overdue follow-ups
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";
import {
  createOrUpdateLead,
  findDuplicateLead,
  calculateLeadScore,
  assignLead,
  processOptOut,
  isOptedOut,
  ensureFollowupSequence,
  ensureLeadEngineSchema,
  type CreateLeadInput,
} from "../lib/leadEngine.js";

const router = Router();

// Run schema migration on startup
ensureLeadEngineSchema().catch(e => console.error("[LeadEngine Routes] Schema error:", e));

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD CREATION (public-safe endpoint for internal sources)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/create", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const input: CreateLeadInput = {
      name: req.body.name,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      mobile: req.body.mobile,
      whatsapp_number: req.body.whatsapp_number,
      email: req.body.email,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      source: req.body.source || "manual",
      platform: req.body.platform,
      platform_user_id: req.body.platform_user_id,
      package_interest: req.body.package_interest,
      budget: req.body.budget,
      message: req.body.message,
      travel_month: req.body.travel_month,
      num_travellers: req.body.num_travellers ? parseInt(req.body.num_travellers) : undefined,
      meta_lead_id: req.body.meta_lead_id,
      campaign_id: req.body.campaign_id,
      campaign_name: req.body.campaign_name,
      utm_params: req.body.utm_params,
      consent_whatsapp: req.body.consent_whatsapp,
      consent_sms: req.body.consent_sms,
      consent_email: req.body.consent_email,
      priority: req.body.priority,
      created_by: req.user?.id?.toString(),
    };

    if (!input.name && !input.mobile && !input.email) {
      return res.status(400).json({ ok: false, error: "At least name, mobile, or email required" });
    }

    const { leadId, isNew, isDuplicate } = await createOrUpdateLead(input, {
      triggeredBy: req.user?.id?.toString(),
    });

    // Trigger follow-up sequence for new leads
    if (isNew && input.mobile) {
      await ensureFollowupSequence(leadId, input.mobile);
    }

    const lead = await pool.query(`SELECT * FROM leads WHERE id=$1`, [leadId]);

    res.status(isNew ? 201 : 200).json({
      ok: true, leadId, isNew, isDuplicate, lead: lead.rows[0]
    });
  } catch (err: any) {
    console.error("[LeadEngine] POST /create error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD STATS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const [totals, byScore, bySource, byStage, todayLeads, overdueFollowups, recentLeads] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('converted','lost','spam','cancelled'))::int AS active,
            COUNT(*) FILTER (WHERE status = 'converted')::int AS converted,
            COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7d,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d
          FROM leads
        `),
        pool.query(`SELECT COALESCE(score,'cold') AS score, COUNT(*)::int AS count FROM leads WHERE status NOT IN ('spam') GROUP BY score ORDER BY count DESC`),
        pool.query(`SELECT COALESCE(source,'unknown') AS source, COUNT(*)::int AS count FROM leads GROUP BY source ORDER BY count DESC LIMIT 12`),
        pool.query(`SELECT COALESCE(pipeline_stage,'new_lead') AS stage, COUNT(*)::int AS count FROM leads WHERE status NOT IN ('spam') GROUP BY pipeline_stage ORDER BY count DESC LIMIT 10`),
        pool.query(`SELECT COUNT(*)::int AS count FROM leads WHERE created_at::date = CURRENT_DATE`),
        pool.query(`
          SELECT COUNT(*)::int AS count FROM lead_followups
          WHERE status='pending' AND due_at < NOW() AND title NOT ILIKE 'LD-SEQ-%'
        `),
        pool.query(`
          SELECT l.id, l.lead_number, l.name, l.mobile, l.source, l.score, l.pipeline_stage,
                 l.assigned_name, l.created_at
          FROM leads l ORDER BY l.created_at DESC LIMIT 5
        `),
      ]);

    res.json({
      ok: true,
      totals: totals.rows[0],
      byScore: byScore.rows,
      bySource: bySource.rows,
      byStage: byStage.rows,
      todayLeads: todayLeads.rows[0].count,
      overdueFollowups: overdueFollowups.rows[0].count,
      recentLeads: recentLeads.rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAD LIST
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/", requireAdmin, async (req, res) => {
  try {
    const {
      search, source, score, stage, status, assignedTo, priority, dateFrom, dateTo,
      page = "1", limit = "50", sortBy = "created_at", sortDir = "desc",
    } = req.query as Record<string, string>;

    const conds: string[] = ["1=1"];
    const params: any[] = [];

    const p = (val: any) => { params.push(val); return `$${params.length}`; };

    if (search) {
      const s = p(`%${search}%`);
      conds.push(`(l.name ILIKE ${s} OR l.mobile ILIKE ${s} OR l.email ILIKE ${s} OR l.lead_number ILIKE ${s} OR l.facebook_name ILIKE ${s})`);
    }
    if (source && source !== "all") conds.push(`l.source = ${p(source)}`);
    if (score && score !== "all") conds.push(`l.score = ${p(score)}`);
    if (stage && stage !== "all") conds.push(`l.pipeline_stage = ${p(stage)}`);
    if (status && status !== "all") conds.push(`l.status = ${p(status)}`);
    if (assignedTo) conds.push(`l.assigned_to = ${p(assignedTo)}`);
    if (priority && priority !== "all") conds.push(`l.priority = ${p(priority)}`);
    if (dateFrom) conds.push(`l.created_at >= ${p(dateFrom)}`);
    if (dateTo) conds.push(`l.created_at <= ${p(dateTo)} + INTERVAL '1 day'`);

    const where = `WHERE ${conds.join(" AND ")}`;
    const safeSortBy = ["created_at","updated_at","name","score","pipeline_stage","last_communication_at"].includes(sortBy) ? sortBy : "created_at";
    const safeSortDir = sortDir === "asc" ? "ASC" : "DESC";
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const [leadsR, countR] = await Promise.all([
      pool.query(`
        SELECT l.*,
          (SELECT COUNT(*)::int FROM lead_activities la WHERE la.lead_id=l.id) AS activity_count,
          (SELECT COUNT(*)::int FROM lead_followups lf WHERE lf.lead_id=l.id AND lf.status='pending' AND lf.title NOT ILIKE 'LD-SEQ-%') AS pending_tasks
        FROM leads l
        ${where}
        ORDER BY l.${safeSortBy} ${safeSortDir} NULLS LAST
        LIMIT ${limitNum} OFFSET ${offset}
      `, params),
      pool.query(`SELECT COUNT(*)::int AS total FROM leads l ${where}`, params),
    ]);

    res.json({
      ok: true,
      leads: leadsR.rows,
      total: countR.rows[0].total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(countR.rows[0].total / limitNum),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOW-UP QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/followup-queue", requireAdmin, async (req, res) => {
  try {
    const { assignedTo, status = "pending", overdue } = req.query as Record<string, string>;
    const conds: string[] = ["lf.status=$1", "lf.title NOT ILIKE 'LD-SEQ-%'"];
    const params: any[] = [status];

    if (assignedTo) { params.push(assignedTo); conds.push(`lf.assigned_to=$${params.length}`); }
    if (overdue === "true") conds.push(`lf.due_at < NOW()`);

    const result = await pool.query(`
      SELECT lf.*, l.name AS lead_name, l.mobile AS lead_mobile, l.lead_number,
             l.pipeline_stage, l.score, l.assigned_name
      FROM lead_followups lf
      JOIN leads l ON l.id=lf.lead_id
      WHERE ${conds.join(" AND ")}
      ORDER BY lf.due_at ASC NULLS LAST, lf.created_at DESC
      LIMIT 200
    `, params);

    res.json({ ok: true, followups: result.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ASSIGNMENT RULES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/assignment-rules", requireAdmin, async (_req, res) => {
  try {
    const [advanced, legacy] = await Promise.all([
      pool.query(`SELECT * FROM crm_assignment_rules ORDER BY priority ASC, created_at ASC`),
      pool.query(`SELECT * FROM lead_assignment_rules ORDER BY created_at ASC`),
    ]);
    res.json({ ok: true, rules: advanced.rows, legacyRules: legacy.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/assignment-rules", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      rule_name, priority = 10, method = "round_robin",
      conditions = {}, team_user_ids = [], assign_to_user_id,
      assign_to_branch, sla_minutes = 120, is_active = true,
    } = req.body;

    if (!rule_name?.trim()) return res.status(400).json({ ok: false, error: "rule_name required" });

    const id = randomUUID();
    await pool.query(
      `INSERT INTO crm_assignment_rules
       (id, rule_name, priority, method, conditions, team_user_ids, assign_to_user_id, assign_to_branch, sla_minutes, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, rule_name, priority, method, JSON.stringify(conditions), team_user_ids,
       assign_to_user_id, assign_to_branch, sla_minutes, is_active, req.user?.id?.toString()]
    );

    const row = await pool.query(`SELECT * FROM crm_assignment_rules WHERE id=$1`, [id]);
    res.status(201).json({ ok: true, rule: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/assignment-rules/:id", requireAdmin, async (req, res) => {
  try {
    const sets: string[] = ["updated_at=NOW()"];
    const params: any[] = [];
    const f = (col: string, val: any) => {
      if (val !== undefined) { params.push(typeof val === "object" ? JSON.stringify(val) : val); sets.push(`${col}=$${params.length}`); }
    };
    f("rule_name", req.body.rule_name); f("priority", req.body.priority);
    f("method", req.body.method); f("conditions", req.body.conditions);
    f("team_user_ids", req.body.team_user_ids); f("assign_to_user_id", req.body.assign_to_user_id);
    f("assign_to_branch", req.body.assign_to_branch); f("sla_minutes", req.body.sla_minutes);
    f("is_active", req.body.is_active);

    params.push(req.params.id);
    await pool.query(`UPDATE crm_assignment_rules SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const row = await pool.query(`SELECT * FROM crm_assignment_rules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, rule: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/assignment-rules/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM crm_assignment_rules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPT-OUT
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/opt-out", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { mobile, email, channel = "whatsapp", reason } = req.body;
    if (!mobile && !email) return res.status(400).json({ ok: false, error: "mobile or email required" });

    if (mobile) {
      const norm = mobile.replace(/\D/g, "").slice(-10);
      await pool.query(
        `INSERT INTO communication_consents (id, mobile, channel, status, source, consent_text)
         VALUES ($1,$2,$3,'opted_out','admin_action',$4)
         ON CONFLICT (mobile, channel) DO UPDATE SET status='opted_out', updated_at=NOW(), consent_text=EXCLUDED.consent_text`,
        [randomUUID(), norm, channel, reason || "Admin opt-out"]
      );
    }
    if (email) {
      try {
        await pool.query(
          `INSERT INTO communication_consents (id, email, channel, status, source, consent_text)
           VALUES ($1,$2,$3,'opted_out','admin_action',$4)
           ON CONFLICT (email, channel) DO UPDATE SET status='opted_out', updated_at=NOW()`,
          [randomUUID(), email, channel, reason || "Admin opt-out"]
        );
      } catch {}
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BULK ASSIGN
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/bulk-assign", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { lead_ids, assigned_to, assigned_name, assigned_branch } = req.body;
    if (!Array.isArray(lead_ids) || !lead_ids.length) return res.status(400).json({ ok: false, error: "lead_ids required" });
    if (!assigned_to) return res.status(400).json({ ok: false, error: "assigned_to required" });

    await pool.query(
      `UPDATE leads SET assigned_to=$1, assigned_name=$2, assigned_branch=$3, updated_at=NOW()
       WHERE id = ANY($4::text[])`,
      [assigned_to, assigned_name, assigned_branch, lead_ids]
    );

    // Log activity for each lead
    const actRows = lead_ids.map((lid: string) => [randomUUID(), lid, req.user?.id?.toString()]);
    for (const [actId, leadId, by] of actRows) {
      await pool.query(
        `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
         VALUES ($1,$2,'assignment','Lead bulk-assigned to ' || $3,$4,$5,$6)`,
        [actId, leadId, assigned_name, JSON.stringify({ assigned_to, method: "bulk" }), by, req.user?.name]
      );
    }

    res.json({ ok: true, updated: lead_ids.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE LEAD OPERATIONS (must come after specific routes)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const [lead, activities, followups, consents] = await Promise.all([
      pool.query(`SELECT * FROM leads WHERE id=$1`, [req.params.id]),
      pool.query(`SELECT * FROM lead_activities WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]),
      pool.query(`SELECT * FROM lead_followups WHERE lead_id=$1 ORDER BY due_at ASC NULLS LAST LIMIT 50`, [req.params.id]),
      pool.query(`SELECT channel, status, updated_at FROM communication_consents WHERE lead_id=$1 OR (mobile IS NOT NULL AND mobile=(SELECT REGEXP_REPLACE(mobile,'\\D','','g') FROM leads WHERE id=$1))`, [req.params.id]),
    ]);
    if (!lead.rows[0]) return res.status(404).json({ ok: false, error: "Lead not found" });
    res.json({ ok: true, lead: lead.rows[0], activities: activities.rows, followups: followups.rows, consents: consents.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const allowed = [
      "name","first_name","last_name","mobile","whatsapp_number","email","city","state","country",
      "source","platform","package_interest","budget","num_travellers","travel_month",
      "assigned_to","assigned_name","assigned_branch","expected_conversion_amount",
      "lost_reason","notes","priority","status","tags",
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
    const row = await pool.query(
      `UPDATE leads SET ${sets.join(",")} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!row.rows[0]) return res.status(404).json({ ok: false, error: "Lead not found" });

    // Log update activity
    const changed = Object.keys(req.body).filter(k => allowed.includes(k));
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'update','Lead updated',$3,$4,$5)`,
      [randomUUID(), req.params.id, JSON.stringify({ fields: changed }), req.user?.id?.toString(), req.user?.name]
    );

    res.json({ ok: true, lead: row.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/:id/score", requireAdmin, async (req, res) => {
  try {
    const lead = await pool.query(`SELECT * FROM leads WHERE id=$1`, [req.params.id]);
    if (!lead.rows[0]) return res.status(404).json({ ok: false, error: "Lead not found" });
    const l = lead.rows[0];
    const { score, score_factors, score_points } = calculateLeadScore({
      name: l.name, mobile: l.mobile, email: l.email, source: l.source,
      package_interest: l.package_interest, budget: l.budget,
      num_travellers: l.num_travellers, travel_month: l.travel_month,
      message: l.message, city: l.city, state: l.state, priority: l.priority,
    });
    await pool.query(
      `UPDATE leads SET score=$1, score_factors=$2, updated_at=NOW() WHERE id=$3`,
      [score, JSON.stringify(score_factors), req.params.id]
    );
    res.json({ ok: true, score, score_factors, score_points });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/:id/assign", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { assigned_to, assigned_name, assigned_branch, reason } = req.body;
    if (!assigned_to) return res.status(400).json({ ok: false, error: "assigned_to required" });

    await pool.query(
      `UPDATE leads SET assigned_to=$1, assigned_name=$2, assigned_branch=$3,
       assignment_notified_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [assigned_to, assigned_name, assigned_branch, req.params.id]
    );

    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'assignment','Lead manually assigned to ' || $3,$4,$5,$6)`,
      [randomUUID(), req.params.id, assigned_name, JSON.stringify({ assigned_to, reason, method: "manual" }),
       req.user?.id?.toString(), req.user?.name]
    );

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/:id/convert", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id, notes } = req.body;
    await pool.query(
      `UPDATE leads SET status='converted', pipeline_stage='full_payment_received',
       conversion_booking_id=$1, converted_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [booking_id || null, req.params.id]
    );
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'conversion','Lead converted to booking',$3,$4,$5)`,
      [randomUUID(), req.params.id, JSON.stringify({ booking_id, notes }), req.user?.id?.toString(), req.user?.name]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `UPDATE leads SET status='spam', pipeline_stage='spam', inbox_status='closed', updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'marked_spam','Lead marked as spam / deleted','{}',$3,$4)`,
      [randomUUID(), req.params.id, req.user?.id?.toString(), req.user?.name]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE B ROUTES
// ═══════════════════════════════════════════════════════════════════════════
import {
  aiScoreLead,
  createBookingFromLead,
  exportLeadsToExcel,
  importLeadsFromExcel,
  syncFbAdsData,
  getReportPipelineVelocity,
  getReportSourceROI,
  getReportAgentPerformance,
  getReportConversionFunnel,
  listWebForms,
  createWebForm,
  updateWebForm,
  getWebFormEmbed,
  submitWebForm,
  getLeadAuditLog,
  ensureLeadEnginePhaseBSchema,
} from "../lib/leadEnginePhaseB.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Run Phase B schema on load
ensureLeadEnginePhaseBSchema().catch(e => console.error("[LeadEnginePhaseB] Schema error:", e));

// ── AI Scoring ───────────────────────────────────────────────────────────────
router.post("/:id/ai-score", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await aiScoreLead(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Create Booking from Lead ─────────────────────────────────────────────────
router.post("/:id/create-booking", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await createBookingFromLead(req.params.id, req.user?.id?.toString() || "");
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Audit Log ────────────────────────────────────────────────────────────────
router.get("/:id/audit-log", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const log = await getLeadAuditLog(req.params.id);
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Export ───────────────────────────────────────────────────────────────────
router.get("/export/excel", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const filters: any = {};
    if (req.query.source)     filters.source     = String(req.query.source);
    if (req.query.stage)      filters.stage      = String(req.query.stage);
    if (req.query.status)     filters.status     = String(req.query.status);
    if (req.query.assignedTo) filters.assignedTo = String(req.query.assignedTo);
    if (req.query.from)       filters.from       = String(req.query.from);
    if (req.query.to)         filters.to         = String(req.query.to);

    const buf = await exportLeadsToExcel(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${date}.xlsx"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Import ───────────────────────────────────────────────────────────────────
router.post("/import/excel", requireAdmin, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = await importLeadsFromExcel(req.file.buffer);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Reports ──────────────────────────────────────────────────────────────────
router.get("/reports/pipeline", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = String(req.query.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const to   = String(req.query.to   || new Date().toISOString().slice(0, 10));
    res.json(await getReportPipelineVelocity(from, to));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports/source-roi", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = String(req.query.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const to   = String(req.query.to   || new Date().toISOString().slice(0, 10));
    res.json(await getReportSourceROI(from, to));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports/agent-performance", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = String(req.query.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const to   = String(req.query.to   || new Date().toISOString().slice(0, 10));
    res.json(await getReportAgentPerformance(from, to));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports/conversion-funnel", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = String(req.query.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const to   = String(req.query.to   || new Date().toISOString().slice(0, 10));
    res.json(await getReportConversionFunnel(from, to));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── FB Ads ───────────────────────────────────────────────────────────────────
router.post("/fb-ads/sync", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { access_token, ad_account_id, since, until } = req.body;
    if (!access_token || !ad_account_id) return res.status(400).json({ error: "access_token and ad_account_id required" });
    const from = since || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to   = until || new Date().toISOString().slice(0, 10);
    const result = await syncFbAdsData(access_token, ad_account_id, from, to);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/fb-ads/data", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const from = String(req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    const to   = String(req.query.to   || new Date().toISOString().slice(0, 10));
    const result = await pool.query(
      `SELECT campaign_name, SUM(spend)::numeric(10,2) as spend, SUM(leads_count)::int as leads,
              SUM(clicks)::int as clicks, AVG(cpl)::numeric(10,2) as cpl, MIN(date)::text as from_date, MAX(date)::text as to_date
       FROM fb_ads_sync WHERE date BETWEEN $1 AND $2 GROUP BY campaign_name ORDER BY spend DESC`,
      [from, to],
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Web Forms ────────────────────────────────────────────────────────────────
router.get("/web-forms", requireAdmin, async (_req, res) => {
  try { res.json(await listWebForms()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/web-forms", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const form = await createWebForm(req.body, req.user?.id?.toString() || "");
    res.status(201).json(form);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/web-forms/:formId", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const form = await updateWebForm(req.params.formId, req.body);
    res.json(form);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/web-forms/:formId/embed", requireAdmin, async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await getWebFormEmbed(req.params.formId, baseUrl);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public submit endpoint — no auth
router.post("/web-forms/:formId/submit", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "");
    const ua = String(req.headers["user-agent"] || "");
    const result = await submitWebForm(req.params.formId, req.body, ip, ua);
    res.json(result);
  } catch (err: any) {
    res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// Public form preview HTML (for iframe embed)
router.get("/web-forms/:formId/preview", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM lead_web_forms WHERE id=$1 AND is_active=true`, [req.params.formId]);
    if (!rows[0]) return res.status(404).send("<p>Form not found</p>");
    const form = rows[0];
    const fields: any[] = form.fields || [];
    const color = form.theme_color || "#0A3D2A";
    const submitUrl = `/api/leads/web-forms/${form.id}/submit`;

    const fieldsHtml = fields.map(f => {
      const label = f.label || f.name;
      const name  = f.name || f.label?.toLowerCase().replace(/\s+/g, "_");
      const required = f.required ? "required" : "";
      if (f.type === "select" && f.options?.length) {
        const opts = f.options.map((o: string) => `<option value="${o}">${o}</option>`).join("");
        return `<div class="field"><label>${label}${f.required ? " *" : ""}</label><select name="${name}" ${required}><option value="">Select...</option>${opts}</select></div>`;
      }
      if (f.type === "textarea") {
        return `<div class="field"><label>${label}${f.required ? " *" : ""}</label><textarea name="${name}" rows="3" placeholder="${f.placeholder || ""}" ${required}></textarea></div>`;
      }
      return `<div class="field"><label>${label}${f.required ? " *" : ""}</label><input type="${f.type || "text"}" name="${name}" placeholder="${f.placeholder || ""}" ${required}/></div>`;
    }).join("\n");

    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{padding:20px;background:#fff}
h2{color:${color};margin-bottom:16px;font-size:18px}
.field{margin-bottom:14px}
label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px}
input,select,textarea{width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;outline:none;transition:border-color .2s}
input:focus,select:focus,textarea:focus{border-color:${color}}
button{width:100%;padding:12px;background:${color};color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px}
button:hover{opacity:.9}
.success{color:green;font-weight:600;text-align:center;padding:16px;display:none}
.error{color:red;font-size:13px;margin-top:8px;display:none}
</style></head><body>
<h2>${form.name}</h2>
${form.description ? `<p style="color:#666;font-size:13px;margin-bottom:16px">${form.description}</p>` : ""}
<form id="lf" onsubmit="submitForm(event)">
${fieldsHtml}
<div class="error" id="err"></div>
<button type="submit" id="btn">Submit Enquiry</button>
</form>
<div class="success" id="ok">${form.success_message}</div>
<script>
async function submitForm(e){
  e.preventDefault();
  const btn=document.getElementById('btn');
  const err=document.getElementById('err');
  btn.disabled=true; btn.textContent='Sending...'; err.style.display='none';
  const data=Object.fromEntries(new FormData(e.target));
  try{
    const r=await fetch('${submitUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const j=await r.json();
    if(j.success){document.getElementById('lf').style.display='none';document.getElementById('ok').style.display='block';}
    else{err.textContent=j.error||'Submission failed';err.style.display='block';btn.disabled=false;btn.textContent='Submit Enquiry';}
  }catch(ex){err.textContent='Network error, please try again';err.style.display='block';btn.disabled=false;btn.textContent='Submit Enquiry';}
}
</script></body></html>`);
  } catch (err: any) { res.status(500).send("<p>Error loading form</p>"); }
});

// Named export bypasses esbuild CJS default-export interop issue
export { router as leadEngineRouter };
export default router;
