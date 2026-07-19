// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";

const router = Router();

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
    const completedAt = status === "completed" ? "NOW()" : "completed_at";
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

    // Resolve recipients based on segment
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

    // Send in background
    let sent = 0;
    const results = await Promise.allSettled(
      uniqueMobiles.map(async (mobile: string) => {
        if (c.channel === "whatsapp") return sendWhatsApp(mobile, c.message);
        if (c.channel === "sms") return sendDLTSMS(mobile, c.message);
        return false;
      })
    );
    sent = results.filter((r: any) => r.status === "fulfilled" && r.value).length;
    const failed = total - sent;

    await pool.query(
      `UPDATE marketing_campaigns SET status='sent', total_recipients=$1, sent_count=$2, failed_count=$3, sent_at=NOW() WHERE id=$4`,
      [total, sent, failed, c.id]
    );

    // Log to notification_logs
    try {
      await pool.query(
        `INSERT INTO notification_logs (id, channel, status, message, created_at) VALUES (gen_random_uuid()::text, $1, 'sent', $2, NOW())`,
        [c.channel, `Campaign: ${c.name} — ${sent}/${total} sent`]
      );
    } catch {}

    res.json({ ok: true, total, sent, failed });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
//  LEAD MANAGEMENT
// ════════════════════════════════════════════════════════════════════

router.get("/leads", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, source, assignedTo } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (source) { params.push(source); conds.push(`source = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); conds.push(`assigned_to = $${params.length}`); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const r = await pool.query(`SELECT * FROM leads ${where} ORDER BY created_at DESC`, params);
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/leads", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, email, source = "website", message, packageInterest, assignedTo, assignedName, followUpDate, notes, budget } = req.body;
    if (!name?.trim()) return void res.status(400).json({ error: "Name is required" });
    const id = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO leads (id, name, mobile, email, source, message, package_interest, assigned_to, assigned_name, follow_up_date, notes, budget)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, name.trim(), mobile || null, email || null, source, message || null,
       packageInterest || null, assignedTo || null, assignedName || null,
       followUpDate || null, notes || null, budget || null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/leads/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, email, source, status, assignedTo, assignedName, followUpDate, notes, packageInterest, budget, conversionBookingId } = req.body;
    const r = await pool.query(
      `UPDATE leads SET
         name = COALESCE($1, name), mobile = COALESCE($2, mobile), email = COALESCE($3, email),
         source = COALESCE($4, source), status = COALESCE($5, status),
         assigned_to = COALESCE($6, assigned_to), assigned_name = COALESCE($7, assigned_name),
         follow_up_date = COALESCE($8, follow_up_date), notes = COALESCE($9, notes),
         package_interest = COALESCE($10, package_interest), budget = COALESCE($11, budget),
         conversion_booking_id = COALESCE($12, conversion_booking_id),
         converted_at = CASE WHEN $5 = 'converted' AND converted_at IS NULL THEN NOW() ELSE converted_at END,
         updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [name||null, mobile||null, email||null, source||null, status||null,
       assignedTo||null, assignedName||null, followUpDate||null, notes||null,
       packageInterest||null, budget||null, conversionBookingId||null, req.params.id]
    );
    res.json(r.rows[0] || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/leads/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE id = $1", [req.params.id]);
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
         current_city = EXCLUDED.current_city,
         current_activity = EXCLUDED.current_activity,
         next_activity = EXCLUDED.next_activity,
         notes = EXCLUDED.notes,
         meeting_point = EXCLUDED.meeting_point,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [req.params.groupId, currentCity || null, currentActivity || null,
       nextActivity || null, notes || null, meetingPoint || null, req.user?.id || null]
    );
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public endpoint — customer reads their group status
router.get("/my-group-status/:bookingId", async (req: AuthenticatedRequest, res) => {
  try {
    // Get booking → group_id
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

    const sosMsg = `🆘 EMERGENCY SOS\nCustomer: ${customerName || "Unknown"}\nMobile: ${customerMobile || "—"}\nBooking: ${bookingId}\nMessage: ${message || "Emergency assistance needed"}\nTime: ${new Date().toLocaleString("en-IN")}`;

    // Get admin mobiles to alert
    const admins = await pool.query("SELECT mobile FROM users WHERE role IN ('admin','super_admin') AND mobile IS NOT NULL LIMIT 5");
    await Promise.allSettled(admins.rows.map((a: any) => sendWhatsApp(a.mobile, sosMsg)));

    // Log the SOS
    try {
      await pool.query(
        `INSERT INTO notification_logs (id, channel, recipient, status, message, created_at) VALUES (gen_random_uuid()::text,'whatsapp',$1,'sent',$2,NOW())`,
        [customerMobile || "sos", `SOS from ${customerName} (${bookingId})`]
      );
    } catch {}

    res.json({ ok: true, message: "SOS alert sent to emergency team" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
