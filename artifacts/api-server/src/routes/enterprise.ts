// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";

const router = Router();

// ── Lead Intelligence Migration ───────────────────────────────────────────────
async function ensureLeadIntelligenceTables() {
  // Campaign ROI columns
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS interested_count INT DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS bookings_generated INT DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS revenue_generated NUMERIC(14,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS roi_percent NUMERIC(8,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS channel_tag TEXT`);
  // Campaign engagement metrics
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS opened_count INT DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS clicked_count INT DEFAULT 0`);
  await pool.query(`ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS replies_count INT DEFAULT 0`);
  // Lead intelligence columns
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score VARCHAR(20) DEFAULT 'cold'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS passport_number TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS aadhaar_last4 TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pan_number TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignment_notified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_assignment_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      branch_name TEXT,
      executive_name TEXT,
      executive_mobile TEXT,
      platform TEXT,
      source TEXT,
      city_regex TEXT,
      priority INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      auto_welcome_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[LeadIntelligence] Migration complete");
}
ensureLeadIntelligenceTables().catch(e => console.error("[LeadIntelligence] Migration error:", e));

// ── AI Lead Scoring ────────────────────────────────────────────────────────────
async function computeLeadScore(leadId: string): Promise<{ score: string; factors: Record<string, number> }> {
  try {
    const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
    if (!lead) return { score: "cold", factors: {} };

    const factors: Record<string, number> = {};
    let total = 0;

    // +30 for prior Umrah/Hajj history (check bookings by mobile)
    if (lead.mobile) {
      const mobile10 = lead.mobile.replace(/\D/g, "").slice(-10);
      if (mobile10.length >= 8) {
        const hist = await pool.query(
          `SELECT COUNT(*)::int as c FROM bookings WHERE REGEXP_REPLACE(customer_mobile,'\\D','','g') LIKE $1 AND status IN ('confirmed','completed')`,
          [`%${mobile10}`]
        );
        if ((hist.rows[0]?.c || 0) > 0) { factors.prior_hajj_umrah = 30; total += 30; }
      }
    }

    // +20 for known budget
    if (lead.budget && parseFloat(String(lead.budget)) > 0) { factors.budget_set = 20; total += 20; }

    // +15 for travel month hint in package_interest
    const pi = (lead.package_interest || "").toLowerCase();
    const monthHints = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec","2025","2026","2027","hajj","umrah"];
    if (monthHints.some(m => pi.includes(m))) { factors.travel_month_near = 15; total += 15; }

    // +5 per reply (capped at 5 replies = max 25 points)
    const msgs = await pool.query(`SELECT COUNT(*)::int as c FROM social_messages WHERE lead_text_id=$1`, [leadId]);
    const replyCount = Math.min(msgs.rows[0]?.c || 0, 5);
    if (replyCount > 0) { factors.replies = replyCount * 5; total += factors.replies; }

    // −20 if no activity for 14 days
    const inactive = await pool.query(
      `SELECT 1 FROM leads WHERE id=$1 AND COALESCE(last_message_at, updated_at, created_at) < NOW() - INTERVAL '14 days'`,
      [leadId]
    );
    if (inactive.rows.length > 0) { factors.inactive_14d = -20; total -= 20; }

    // Map to tier
    let score = "cold";
    if (lead.status === "lost" || lead.status === "cancelled") score = "lost";
    else if (total >= 60) score = "hot";
    else if (total >= 30) score = "warm";
    else if (total >= 10) score = "cold";
    else score = "lost";

    await pool.query(`UPDATE leads SET score=$1, score_factors=$2 WHERE id=$3`, [score, JSON.stringify(factors), leadId]);
    return { score, factors };
  } catch {
    return { score: "cold", factors: {} };
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────
async function findExistingLead(mobile?: string, email?: string, passport?: string, aadhaar?: string, pan?: string): Promise<string | null> {
  const conds: string[] = [];
  const params: any[] = [];

  if (mobile) {
    const m10 = mobile.replace(/\D/g, "").slice(-10);
    if (m10.length >= 8) {
      params.push(`%${m10}`);
      conds.push(`(mobile IS NOT NULL AND REGEXP_REPLACE(mobile,'\\D','','g') LIKE $${params.length})`);
    }
  }
  if (email?.trim()) {
    params.push(email.toLowerCase().trim());
    conds.push(`(email IS NOT NULL AND LOWER(TRIM(email)) = $${params.length})`);
  }
  if (passport?.trim()) {
    params.push(passport.toUpperCase().trim());
    conds.push(`(passport_number IS NOT NULL AND UPPER(TRIM(passport_number)) = $${params.length})`);
  }
  if (aadhaar?.trim()) {
    params.push(aadhaar.trim());
    conds.push(`(aadhaar_last4 IS NOT NULL AND aadhaar_last4 = $${params.length})`);
  }
  if (pan?.trim()) {
    params.push(pan.toUpperCase().trim());
    conds.push(`(pan_number IS NOT NULL AND UPPER(TRIM(pan_number)) = $${params.length})`);
  }

  if (conds.length === 0) return null;
  const r = await pool.query(`SELECT id FROM leads WHERE ${conds.join(" OR ")} ORDER BY created_at DESC LIMIT 1`, params);
  return r.rows[0]?.id || null;
}

// ── Auto-Assignment Pipeline ───────────────────────────────────────────────────
async function autoAssignLead(leadId: string): Promise<void> {
  try {
    const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
    if (!lead || lead.assigned_name) return; // Skip if already manually assigned

    const rulesR = await pool.query(`
      SELECT * FROM lead_assignment_rules WHERE is_active = true
      ORDER BY
        CASE WHEN platform IS NOT NULL AND platform = $1 THEN 0
             WHEN source IS NOT NULL AND source = $2 THEN 1
             ELSE 2 END,
        priority DESC, created_at ASC
      LIMIT 1
    `, [lead.platform || "", lead.source || ""]);

    const rule = rulesR.rows[0];
    if (!rule) return;

    await pool.query(`
      UPDATE leads SET
        assigned_name = COALESCE($1, assigned_name),
        assigned_branch = COALESCE($2, assigned_branch),
        assignment_notified_at = NOW(),
        followup_due_at = NOW() + INTERVAL '24 hours',
        updated_at = NOW()
      WHERE id = $3
    `, [rule.executive_name || null, rule.branch_name || null, leadId]);

    // Create follow-up task (24h deadline)
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    await pool.query(`
      INSERT INTO tasks (id, title, description, priority, assigned_name, due_date, category, created_at, updated_at)
      VALUES ($1, $2, $3, 'high', $4, (NOW() + INTERVAL '24 hours')::date, 'lead_followup', NOW(), NOW())
    `, [taskId,
        `Follow up: ${lead.name}`,
        `New lead from ${lead.source || lead.platform || "unknown"}. Mobile: ${lead.mobile || "-"}, Package: ${lead.package_interest || "-"}`,
        rule.executive_name || null]);

    // Notify executive
    if (rule.executive_mobile) {
      const notif = `🎯 New Lead Assigned!\n\nName: ${lead.name}\nMobile: ${lead.mobile || "-"}\nSource: ${lead.source || lead.platform || "Unknown"}\nPackage: ${lead.package_interest || "Not specified"}\n\nPlease follow up within 24 hours.\n\nAl Burhan CRM`;
      sendWhatsApp(rule.executive_mobile, notif).catch(() => {});
    }

    // Send welcome to customer
    if (lead.mobile) {
      const welcome = rule.auto_welcome_message ||
        `Assalamu Alaikum ${lead.name}!\n\nThank you for your interest in Al Burhan Tours & Travels. Our team will contact you shortly.\n\nFor immediate assistance: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
      sendWhatsApp(lead.mobile, welcome).catch(() => {});
    }

    // Log to customer_timeline if the mobile matches a user
    if (lead.mobile) {
      const mobile10 = lead.mobile.replace(/\D/g, "").slice(-10);
      pool.query(`
        INSERT INTO customer_timeline (customer_id, event_type, title, description, icon, created_at)
        SELECT u.id, 'lead_assigned', 'Lead Assigned', $1, '👤', NOW()
        FROM users u WHERE REGEXP_REPLACE(COALESCE(u.mobile,''),'\\D','','g') LIKE $2 LIMIT 1
      `, [`Assigned to ${rule.executive_name || "team"} (${rule.branch_name || "HQ"})`, `%${mobile10}`]).catch(() => {});
    }
  } catch (e) {
    console.error("[autoAssign] Error:", e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  TASK MANAGEMENT
// ════════════════════════════════════════════════════════════════════

router.get("/tasks", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, assignedTo, category } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); conds.push(`assigned_to = $${params.length}`); }
    if (category) { params.push(category); conds.push(`category = $${params.length}`); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const r = await pool.query(
      `SELECT * FROM tasks ${where} ORDER BY
         CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         due_date ASC NULLS LAST, created_at DESC`,
      params
    );
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/tasks", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, priority = "medium", assignedTo, assignedName, dueDate, category = "general", bookingId } = req.body;
    if (!title?.trim()) return void res.status(400).json({ error: "Title is required" });
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO tasks (id, title, description, priority, assigned_to, assigned_name, due_date, category, booking_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, title.trim(), description || null, priority, assignedTo || null, assignedName || null,
       dueDate || null, category, bookingId || null, req.user?.id || null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/tasks/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, priority, status, assignedTo, assignedName, dueDate, category } = req.body;
    const r = await pool.query(
      `UPDATE tasks SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         priority = COALESCE($3, priority),
         status = COALESCE($4, status),
         assigned_to = COALESCE($5, assigned_to),
         assigned_name = COALESCE($6, assigned_name),
         due_date = COALESCE($7, due_date),
         category = COALESCE($8, category),
         completed_at = CASE WHEN $4 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title || null, description || null, priority || null, status || null,
       assignedTo || null, assignedName || null, dueDate || null, category || null, req.params.id]
    );
    res.json(r.rows[0] || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/tasks/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/tasks/stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status != 'completed' AND due_date < CURRENT_DATE)::int AS overdue,
        COUNT(*) FILTER (WHERE status != 'completed' AND due_date = CURRENT_DATE)::int AS due_today
      FROM tasks
    `);
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  MARKETING CAMPAIGNS
// ════════════════════════════════════════════════════════════════════

router.get("/campaigns", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const r = await pool.query("SELECT * FROM marketing_campaigns ORDER BY created_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/campaigns", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, message, channel, segment, subject } = req.body;
    if (!name || !message || !channel || !segment) return void res.status(400).json({ error: "name, message, channel, segment are required" });
    const id = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO marketing_campaigns (id, name, message, channel, segment, subject, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING *`,
      [id, name, message, channel, segment, subject || null, req.user?.id || null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/campaigns/:id/send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const camp = await pool.query("SELECT * FROM marketing_campaigns WHERE id = $1", [req.params.id]);
    if (!camp.rows[0]) return void res.status(404).json({ error: "Campaign not found" });
    const c = camp.rows[0];

    let mobiles: string[] = [];
    let emails: string[] = [];
    const seg = c.segment;

    if (seg === "all") {
      const r = await pool.query("SELECT mobile, email FROM users WHERE role = 'customer' AND mobile IS NOT NULL");
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
      emails = r.rows.map((x: any) => x.email).filter(Boolean);
    } else if (seg === "hajj") {
      const r = await pool.query(`SELECT DISTINCT b.customer_mobile AS mobile, u.email FROM bookings b LEFT JOIN users u ON u.mobile = b.customer_mobile WHERE b.status = 'confirmed' AND b.package_name ILIKE '%hajj%'`);
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
      emails = r.rows.map((x: any) => x.email).filter(Boolean);
    } else if (seg === "umrah") {
      const r = await pool.query(`SELECT DISTINCT b.customer_mobile AS mobile, u.email FROM bookings b LEFT JOIN users u ON u.mobile = b.customer_mobile WHERE b.status = 'confirmed' AND b.package_name ILIKE '%umrah%'`);
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
      emails = r.rows.map((x: any) => x.email).filter(Boolean);
    } else if (seg === "pending_payment") {
      const r = await pool.query(`SELECT DISTINCT customer_mobile AS mobile FROM bookings WHERE status IN ('approved','pending')`);
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
    } else if (seg === "confirmed") {
      const r = await pool.query(`SELECT DISTINCT b.customer_mobile AS mobile, u.email FROM bookings b LEFT JOIN users u ON u.mobile = b.customer_mobile WHERE b.status = 'confirmed'`);
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
      emails = r.rows.map((x: any) => x.email).filter(Boolean);
    } else if (seg === "leads") {
      const r = await pool.query("SELECT mobile FROM leads WHERE mobile IS NOT NULL");
      mobiles = r.rows.map((x: any) => x.mobile).filter(Boolean);
    }

    const uniqueMobiles = [...new Set(mobiles)];
    const total = uniqueMobiles.length;

    if (total === 0) {
      await pool.query("UPDATE marketing_campaigns SET status='sent', total_recipients=0, sent_count=0, sent_at=NOW() WHERE id=$1", [c.id]);
      return void res.json({ ok: true, total: 0, sent: 0, message: "No recipients in segment" });
    }

    // Email channel: send to email addresses instead of mobiles
    if (c.channel === "email") {
      const uniqueEmails = [...new Set(emails)];
      const emailTotal = uniqueEmails.length;
      if (emailTotal === 0) {
        await pool.query("UPDATE marketing_campaigns SET status='sent', total_recipients=0, sent_count=0, sent_at=NOW() WHERE id=$1", [c.id]);
        return void res.json({ ok: true, total: 0, sent: 0, message: "No email recipients in segment" });
      }
      const { sendEmail } = await import("../lib/notifications.js");
      const emailResults = await Promise.allSettled(
        uniqueEmails.map((email: string) =>
          sendEmail(email, c.subject || c.name, c.message)
        )
      );
      const emailSent = emailResults.filter((r: any) => r.status === "fulfilled" && r.value?.ok).length;
      const emailFailed = emailTotal - emailSent;
      await pool.query(
        `UPDATE marketing_campaigns SET status='sent', total_recipients=$1, sent_count=$2, failed_count=$3, sent_at=NOW() WHERE id=$4`,
        [emailTotal, emailSent, emailFailed, c.id]
      );
      try {
        await pool.query(
          `INSERT INTO notification_logs (id, channel, status, message, created_at) VALUES (gen_random_uuid()::text, $1, 'sent', $2, NOW())`,
          ["email", `Campaign: ${c.name} — ${emailSent}/${emailTotal} sent`]
        );
      } catch {}
      return void res.json({ ok: true, total: emailTotal, sent: emailSent, failed: emailFailed });
    }

    // Unsupported channels (facebook, instagram, telegram): return structured error
    if (!["whatsapp", "sms"].includes(c.channel)) {
      return void res.status(422).json({
        error: `Direct send is not supported for channel "${c.channel}". Use the platform's native tools.`,
        channel: c.channel,
        unsupported: true,
      });
    }

    const results = await Promise.allSettled(
      uniqueMobiles.map(async (mobile: string) => {
        if (c.channel === "whatsapp") return sendWhatsApp(mobile, c.message);
        if (c.channel === "sms") return sendDLTSMS(mobile, c.message);
        return false;
      })
    );
    const sent = results.filter((r: any) => r.status === "fulfilled" && r.value).length;
    const failed = total - sent;

    await pool.query(
      `UPDATE marketing_campaigns SET status='sent', total_recipients=$1, sent_count=$2, failed_count=$3, sent_at=NOW() WHERE id=$4`,
      [total, sent, failed, c.id]
    );

    try {
      await pool.query(
        `INSERT INTO notification_logs (id, channel, status, message, created_at) VALUES (gen_random_uuid()::text, $1, 'sent', $2, NOW())`,
        [c.channel, `Campaign: ${c.name} — ${sent}/${total} sent`]
      );
    } catch {}

    res.json({ ok: true, total, sent, failed });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Campaign ROI + Engagement Update ─────────────────────────────────────────
// Accessible at both /api/enterprise/campaigns/:id/stats
// and /api/marketing/campaigns/:id/stats (alias mount in routes/index.ts)
router.put("/campaigns/:id/stats", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const {
      interested_count, bookings_generated, revenue_generated, roi_percent, channel_tag,
      opened_count, clicked_count, replies_count,
    } = req.body;
    await pool.query(
      `UPDATE marketing_campaigns SET
        interested_count  = COALESCE($1,  interested_count),
        bookings_generated = COALESCE($2, bookings_generated),
        revenue_generated = COALESCE($3,  revenue_generated),
        roi_percent       = COALESCE($4,  roi_percent),
        channel_tag       = COALESCE($5,  channel_tag),
        opened_count      = COALESCE($6,  opened_count),
        clicked_count     = COALESCE($7,  clicked_count),
        replies_count     = COALESCE($8,  replies_count)
       WHERE id = $9`,
      [
        interested_count  != null ? parseInt(interested_count)      : null,
        bookings_generated!= null ? parseInt(bookings_generated)    : null,
        revenue_generated != null ? parseFloat(revenue_generated)   : null,
        roi_percent       != null ? parseFloat(roi_percent)         : null,
        channel_tag || null,
        opened_count      != null ? parseInt(opened_count)          : null,
        clicked_count     != null ? parseInt(clicked_count)         : null,
        replies_count     != null ? parseInt(replies_count)         : null,
        id,
      ]
    );
    const r = await pool.query(`SELECT * FROM marketing_campaigns WHERE id = $1`, [id]);
    res.json(r.rows[0] || { error: "not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  LEAD MANAGEMENT — with dedup, scoring & auto-assignment
// ════════════════════════════════════════════════════════════════════

router.get("/lead-stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [totals, bySource, byStatus, followUps, byScore] = await Promise.all([
      pool.query(`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status='converted')::int as converted,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int as today,
        COUNT(*) FILTER (WHERE status='new')::int as new_count,
        COUNT(*) FILTER (WHERE last_message_at >= NOW()-INTERVAL '24h')::int as active_today
      FROM leads`),
      pool.query(`SELECT source, COUNT(*)::int as count FROM leads GROUP BY source ORDER BY count DESC LIMIT 15`),
      pool.query(`SELECT status, COUNT(*)::int as count FROM leads GROUP BY status ORDER BY count DESC`),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE follow_up_date::text = $1 AND status NOT IN ('converted','lost'))::int as today,
        COUNT(*) FILTER (WHERE follow_up_date < $1::date AND status NOT IN ('converted','lost'))::int as overdue
      FROM leads`, [today]),
      pool.query(`SELECT COALESCE(score,'cold') as score, COUNT(*)::int as count FROM leads GROUP BY score ORDER BY count DESC`),
    ]);
    const total = totals.rows[0].total || 1;
    res.json({
      ...totals.rows[0],
      conversion_rate: Math.round((totals.rows[0].converted / total) * 100),
      by_source: bySource.rows,
      by_status: byStatus.rows,
      follow_ups: followUps.rows[0],
      by_score: byScore.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/leads", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, source, platform, assignedTo, search, score, limit = "200" } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (source) { params.push(source); conds.push(`source = $${params.length}`); }
    if (platform) { params.push(platform); conds.push(`platform = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); conds.push(`assigned_to = $${params.length}`); }
    if (score) { params.push(score); conds.push(`COALESCE(score,'cold') = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conds.push(`(name ILIKE $${n} OR mobile ILIKE $${n} OR email ILIKE $${n} OR telegram_username ILIKE $${n} OR instagram_username ILIKE $${n} OR facebook_name ILIKE $${n})`);
    }
    params.push(parseInt(limit));
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const r = await pool.query(`
      SELECT l.*,
        COALESCE(sm.conversation_count, 0)::int AS conversation_count
      FROM leads l
      LEFT JOIN (
        SELECT lead_text_id, COUNT(*)::int AS conversation_count
        FROM social_messages GROUP BY lead_text_id
      ) sm ON sm.lead_text_id = l.id
      ${where} ORDER BY COALESCE(l.last_message_at, l.updated_at, l.created_at) DESC LIMIT $${params.length}
    `, params);
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/leads/:id/conversations", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const msgs = await pool.query(
      `SELECT * FROM social_messages WHERE lead_text_id=$1 ORDER BY created_at ASC LIMIT 200`,
      [id]
    );
    const lead = await pool.query(`SELECT mobile FROM leads WHERE id=$1`, [id]);
    let outgoing: any[] = [];
    if (lead.rows[0]?.mobile) {
      const logs = await pool.query(
        `SELECT id::text, 'outgoing' as direction, channel::text as platform, message, status, created_at
         FROM notification_logs WHERE recipient=$1 ORDER BY created_at ASC LIMIT 50`,
        [lead.rows[0].mobile]
      );
      outgoing = logs.rows;
    }
    res.json({ messages: msgs.rows, outgoing });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /leads — with deduplication + auto-score + auto-assign
router.post("/leads", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, email, source = "manual_entry", message, packageInterest, assignedTo, assignedName,
            followUpDate, notes, budget, platform, priority, assignedBranch,
            passportNumber, aadhaarLast4, panNumber } = req.body;
    if (!name?.trim()) return void res.status(400).json({ error: "Name is required" });

    // Deduplication check
    const existingId = await findExistingLead(mobile, email, passportNumber, aadhaarLast4, panNumber);
    if (existingId) {
      // Update existing lead instead of creating duplicate
      const r = await pool.query(
        `UPDATE leads SET
           name = COALESCE($1, name), mobile = COALESCE($2, mobile), email = COALESCE($3, email),
           source = COALESCE($4, source), message = COALESCE($5, message),
           package_interest = COALESCE($6, package_interest), budget = COALESCE($7, budget),
           notes = COALESCE($8, notes), updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [name.trim(), mobile||null, email||null, source, message||null,
         packageInterest||null, budget||null, notes||null, existingId]
      );
      computeLeadScore(existingId).catch(() => {});
      return void res.json({ ...r.rows[0], _merged: true });
    }

    const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO leads (id, name, mobile, email, source, message, package_interest, assigned_to, assigned_name,
         follow_up_date, notes, budget, platform, priority, assigned_branch, passport_number, aadhaar_last4, pan_number, score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'cold') RETURNING *`,
      [id, name.trim(), mobile||null, email||null, source, message||null,
       packageInterest||null, assignedTo||null, assignedName||null,
       followUpDate||null, notes||null, budget||null,
       platform||null, priority||"normal", assignedBranch||null,
       passportNumber||null, aadhaarLast4||null, panNumber||null]
    );
    const lead = r.rows[0];

    // Async: score + auto-assign (non-blocking)
    computeLeadScore(id).catch(() => {});
    if (!assignedName) autoAssignLead(id).catch(() => {});

    res.json(lead);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/leads/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, email, source, status, assignedTo, assignedName, followUpDate, notes, packageInterest,
            budget, conversionBookingId, priority, assignedBranch, platform, instagramUsername,
            facebookName, telegramUsername, passportNumber, aadhaarLast4, panNumber } = req.body;
    const r = await pool.query(
      `UPDATE leads SET
         name = COALESCE($1, name), mobile = COALESCE($2, mobile), email = COALESCE($3, email),
         source = COALESCE($4, source), status = COALESCE($5, status),
         assigned_to = COALESCE($6, assigned_to), assigned_name = COALESCE($7, assigned_name),
         follow_up_date = COALESCE($8, follow_up_date), notes = COALESCE($9, notes),
         package_interest = COALESCE($10, package_interest), budget = COALESCE($11, budget),
         conversion_booking_id = COALESCE($12, conversion_booking_id),
         priority = COALESCE($13, priority), assigned_branch = COALESCE($14, assigned_branch),
         platform = COALESCE($15, platform), instagram_username = COALESCE($16, instagram_username),
         facebook_name = COALESCE($17, facebook_name), telegram_username = COALESCE($18, telegram_username),
         passport_number = COALESCE($19, passport_number),
         aadhaar_last4 = COALESCE($20, aadhaar_last4),
         pan_number = COALESCE($21, pan_number),
         converted_at = CASE WHEN $5 = 'converted' AND converted_at IS NULL THEN NOW() ELSE converted_at END,
         updated_at = NOW()
       WHERE id = $22 RETURNING *`,
      [name||null, mobile||null, email||null, source||null, status||null,
       assignedTo||null, assignedName||null, followUpDate||null, notes||null,
       packageInterest||null, budget||null, conversionBookingId||null,
       priority||null, assignedBranch||null, platform||null,
       instagramUsername||null, facebookName||null, telegramUsername||null,
       passportNumber||null, aadhaarLast4||null, panNumber||null,
       req.params.id]
    );
    const updated = r.rows[0];
    if (updated?.id) computeLeadScore(updated.id).catch(() => {});
    res.json(updated || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/leads/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /leads/:id/assign — manual assignment trigger
router.post("/leads/:id/assign", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { assignedName, assignedBranch, executiveMobile, welcomeMessage } = req.body;
    const { id } = req.params;

    const lead = (await pool.query(`SELECT * FROM leads WHERE id=$1`, [id])).rows[0];
    if (!lead) return void res.status(404).json({ error: "Lead not found" });

    await pool.query(`
      UPDATE leads SET assigned_name=$1, assigned_branch=$2, assignment_notified_at=NOW(),
        followup_due_at=NOW() + INTERVAL '24 hours', updated_at=NOW() WHERE id=$3
    `, [assignedName||lead.assigned_name, assignedBranch||lead.assigned_branch, id]);

    // Create follow-up task
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    await pool.query(`
      INSERT INTO tasks (id, title, description, priority, assigned_name, due_date, category, created_at, updated_at)
      VALUES ($1,$2,$3,'high',$4,(NOW()+INTERVAL '24 hours')::date,'lead_followup',NOW(),NOW())
    `, [taskId, `Follow up: ${lead.name}`, `Lead source: ${lead.source||lead.platform||"unknown"}. Mobile: ${lead.mobile||"-"}`, assignedName||null]);

    // Notify executive
    if (executiveMobile) {
      const msg = `🎯 Lead Assigned to You!\n\nName: ${lead.name}\nMobile: ${lead.mobile||"-"}\nSource: ${lead.source||"Unknown"}\nPackage: ${lead.package_interest||"Not specified"}\n\nFollow up within 24 hours.\nAl Burhan CRM`;
      sendWhatsApp(executiveMobile, msg).catch(() => {});
      sendDLTSMS(executiveMobile, msg).catch(() => {});
    }

    // Welcome customer
    if (lead.mobile) {
      const wMsg = welcomeMessage || `Assalamu Alaikum ${lead.name}!\n\nThank you for contacting Al Burhan Tours & Travels. Our team will reach you shortly.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!`;
      sendWhatsApp(lead.mobile, wMsg).catch(() => {});
    }

    computeLeadScore(id).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /leads/:id/score — manually trigger score recompute
router.post("/leads/:id/score", requireAdmin as any, async (req, res) => {
  try {
    const result = await computeLeadScore(req.params.id);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  LEAD ASSIGNMENT RULES
// ════════════════════════════════════════════════════════════════════

router.get("/lead-assignment-rules", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM lead_assignment_rules ORDER BY priority DESC, created_at ASC`);
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/lead-assignment-rules", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { ruleName, branchName, executiveName, executiveMobile, platform, source, cityRegex, priority, autoWelcomeMessage } = req.body;
    if (!ruleName?.trim()) return void res.status(400).json({ error: "Rule name is required" });
    const id = `lar_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const r = await pool.query(`
      INSERT INTO lead_assignment_rules (id, rule_name, branch_name, executive_name, executive_mobile, platform, source, city_regex, priority, auto_welcome_message)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [id, ruleName.trim(), branchName||null, executiveName||null, executiveMobile||null,
        platform||null, source||null, cityRegex||null, priority||0, autoWelcomeMessage||null]);
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/lead-assignment-rules/:id", requireAdmin as any, async (req, res) => {
  try {
    const { ruleName, branchName, executiveName, executiveMobile, platform, source, cityRegex, priority, isActive, autoWelcomeMessage } = req.body;
    const r = await pool.query(`
      UPDATE lead_assignment_rules SET
        rule_name = COALESCE($1, rule_name), branch_name = COALESCE($2, branch_name),
        executive_name = COALESCE($3, executive_name), executive_mobile = COALESCE($4, executive_mobile),
        platform = COALESCE($5, platform), source = COALESCE($6, source),
        city_regex = COALESCE($7, city_regex), priority = COALESCE($8, priority),
        is_active = COALESCE($9, is_active), auto_welcome_message = COALESCE($10, auto_welcome_message),
        updated_at = NOW()
      WHERE id = $11 RETURNING *
    `, [ruleName||null, branchName||null, executiveName||null, executiveMobile||null,
        platform||null, source||null, cityRegex||null, priority??null, isActive??null, autoWelcomeMessage||null,
        req.params.id]);
    res.json(r.rows[0] || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/lead-assignment-rules/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM lead_assignment_rules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  SUPPLIER MANAGEMENT
// ════════════════════════════════════════════════════════════════════

router.get("/suppliers", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { type } = req.query as any;
    const r = type
      ? await pool.query("SELECT * FROM suppliers WHERE type = $1 AND is_active = true ORDER BY name", [type])
      : await pool.query("SELECT * FROM suppliers ORDER BY type, name");
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/suppliers", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, type, contactName, contactMobile, contactEmail, address, city, country, gstNumber, paymentTerms, notes, contractExpiry } = req.body;
    if (!name?.trim() || !type) return void res.status(400).json({ error: "name and type are required" });
    const id = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO suppliers (id, name, type, contact_name, contact_mobile, contact_email, address, city, country, gst_number, payment_terms, notes, contract_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, name.trim(), type, contactName||null, contactMobile||null, contactEmail||null,
       address||null, city||null, country||null, gstNumber||null, paymentTerms||null, notes||null, contractExpiry||null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/suppliers/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, type, contactName, contactMobile, contactEmail, address, city, country, gstNumber, paymentTerms, notes, isActive, contractExpiry } = req.body;
    const r = await pool.query(
      `UPDATE suppliers SET
         name = COALESCE($1, name), type = COALESCE($2, type),
         contact_name = COALESCE($3, contact_name), contact_mobile = COALESCE($4, contact_mobile),
         contact_email = COALESCE($5, contact_email), address = COALESCE($6, address),
         city = COALESCE($7, city), country = COALESCE($8, country),
         gst_number = COALESCE($9, gst_number), payment_terms = COALESCE($10, payment_terms),
         notes = COALESCE($11, notes), is_active = COALESCE($12, is_active),
         contract_expiry = COALESCE($13, contract_expiry), updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [name||null, type||null, contactName||null, contactMobile||null, contactEmail||null,
       address||null, city||null, country||null, gstNumber||null, paymentTerms||null,
       notes||null, isActive??null, contractExpiry||null, req.params.id]
    );
    res.json(r.rows[0] || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/suppliers/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query("UPDATE suppliers SET is_active = false, updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  GROUP LIVE TRACKING
// ════════════════════════════════════════════════════════════════════

router.get("/group-tracking", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM group_tracking ORDER BY updated_at DESC");
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/group-tracking/:groupId", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM group_tracking WHERE group_id = $1", [req.params.groupId]);
    res.json(r.rows[0] || null);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/group-tracking/:groupId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentCity, currentActivity, nextActivity, notes, meetingPoint } = req.body;
    const r = await pool.query(
      `INSERT INTO group_tracking (group_id, current_city, current_activity, next_activity, notes, meeting_point, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (group_id) DO UPDATE SET
         current_city = EXCLUDED.current_city, current_activity = EXCLUDED.current_activity,
         next_activity = EXCLUDED.next_activity, notes = EXCLUDED.notes,
         meeting_point = EXCLUDED.meeting_point, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [req.params.groupId, currentCity||null, currentActivity||null, nextActivity||null, notes||null, meetingPoint||null, req.user?.id||null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/my-group-status/:bookingId", async (req: AuthenticatedRequest, res) => {
  try {
    const bk = await pool.query("SELECT group_id FROM bookings WHERE id = $1", [req.params.bookingId]);
    if (!bk.rows[0]?.group_id) return void res.json(null);
    const groupId = bk.rows[0].group_id;
    const tr = await pool.query("SELECT * FROM group_tracking WHERE group_id = $1", [groupId]);
    const gr = await pool.query("SELECT group_name, departure_date, return_date FROM hajj_groups WHERE id = $1", [groupId]);
    res.json({ tracking: tr.rows[0] || null, group: gr.rows[0] || null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  EMERGENCY SOS
// ════════════════════════════════════════════════════════════════════

router.post("/sos", async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId, customerName, customerMobile, message } = req.body;
    if (!bookingId) return void res.status(400).json({ error: "bookingId required" });

    const sosMsg = `🆘 EMERGENCY SOS\nCustomer: ${customerName||"Unknown"}\nMobile: ${customerMobile||"—"}\nBooking: ${bookingId}\nMessage: ${message||"Emergency assistance needed"}\nTime: ${new Date().toLocaleString("en-IN")}`;

    const admins = await pool.query("SELECT mobile FROM users WHERE role IN ('admin','super_admin') AND mobile IS NOT NULL LIMIT 5");
    await Promise.allSettled(admins.rows.map((a: any) => sendWhatsApp(a.mobile, sosMsg)));

    try {
      await pool.query(
        `INSERT INTO notification_logs (id, channel, recipient, status, message, created_at) VALUES (gen_random_uuid()::text,'whatsapp',$1,'sent',$2,NOW())`,
        [customerMobile||"sos", `SOS from ${customerName} (${bookingId})`]
      );
    } catch {}

    res.json({ ok: true, message: "SOS alert sent to emergency team" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
