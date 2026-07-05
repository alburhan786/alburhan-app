import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { retryNotification, EVENT_TYPES, CHANNELS, sendBulkNotification, type Channel } from "../lib/notificationEngine.js";
import { randomUUID } from "crypto";

const router = Router();

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [todayRes, deliveredRes, failedRes, pendingRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='sent' AND created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='failed' AND created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='pending'`),
    ]);
    const sent = Number(todayRes.rows[0]?.count ?? 0);
    const delivered = Number(deliveredRes.rows[0]?.count ?? 0);
    const failed = Number(failedRes.rows[0]?.count ?? 0);
    const pending = Number(pendingRes.rows[0]?.count ?? 0);
    const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

    const byChannel = await pool.query(
      `SELECT channel, status, COUNT(*) as cnt FROM notification_logs WHERE created_at >= $1 GROUP BY channel, status`,
      [`${today}T00:00:00Z`]
    );
    const channelStats: Record<string, Record<string, number>> = {};
    for (const row of byChannel.rows) {
      if (!channelStats[row.channel]) channelStats[row.channel] = {};
      channelStats[row.channel][row.status] = Number(row.cnt);
    }

    const allTime = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='sent') as total_sent FROM notification_logs`);
    const campaignCount = await pool.query(`SELECT COUNT(*) FROM notification_campaigns`).catch(() => ({ rows: [{ count: 0 }] }));

    res.json({ sent, delivered, failed, pending, deliveryRate, channelStats, allTime: allTime.rows[0], campaignCount: Number(campaignCount.rows[0]?.count ?? 0) });
  } catch (err) {
    console.error("[notification-center] GET /stats:", err);
    res.status(500).json({ message: "Failed to get stats" });
  }
});

// ── Delivery Logs ─────────────────────────────────────────────────────────────
router.get("/logs/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Log not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[notification-center] GET /logs/:id:", err);
    res.status(500).json({ message: "Failed to get log" });
  }
});

router.get("/logs", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, channel, event_type, limit = "100", offset = "0", search } = req.query as any;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) { conditions.push(`status=$${idx++}`); params.push(status); }
    if (channel) { conditions.push(`channel=$${idx++}`); params.push(channel); }
    if (event_type) { conditions.push(`event_type=$${idx++}`); params.push(event_type); }
    if (search) {
      conditions.push(`(recipient ILIKE $${idx} OR message ILIKE $${idx} OR booking_id ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT * FROM notification_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, Number(limit), Number(offset)]
    );
    const countRes = await pool.query(`SELECT COUNT(*) FROM notification_logs ${where}`, params);
    res.json({ logs: result.rows, total: Number(countRes.rows[0]?.count ?? 0) });
  } catch (err) {
    console.error("[notification-center] GET /logs:", err);
    res.status(500).json({ message: "Failed to get logs" });
  }
});

// ── Automation Settings ───────────────────────────────────────────────────────
router.get("/settings", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_settings ORDER BY event_type, channel`);
    res.json({ settings: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.put("/settings", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { settings } = req.body as { settings: Array<{ event_type: string; channel: string; enabled: boolean; template_id?: string }> };
    if (!Array.isArray(settings)) return res.status(400).json({ message: "settings must be an array" });
    for (const s of settings) {
      await pool.query(
        `INSERT INTO notification_settings (id, event_type, channel, enabled, template_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (event_type, channel) DO UPDATE SET enabled=$4, template_id=$5, updated_at=NOW()`,
        [`ns_${s.event_type}_${s.channel}`, s.event_type, s.channel, s.enabled, s.template_id || null]
      );
    }
    res.json({ message: "Settings updated" });
  } catch (err) {
    console.error("[notification-center] PUT /settings:", err);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

// ── Templates ─────────────────────────────────────────────────────────────────
router.get("/templates", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_templates ORDER BY event_type, channel, name`);
    res.json({ templates: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get templates" });
  }
});

router.post("/templates", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, event_type, channel, subject, body, variables } = req.body;
    if (!name || !channel || !body) return res.status(400).json({ message: "name, channel, body required" });
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await pool.query(
      `INSERT INTO notification_templates (id, name, event_type, channel, subject, body, variables)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, event_type || null, channel, subject || null, body, JSON.stringify(variables || [])]
    );
    res.json({ template: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to create template" });
  }
});

router.put("/templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, event_type, channel, subject, body, variables } = req.body;
    const result = await pool.query(
      `UPDATE notification_templates SET name=$1,event_type=$2,channel=$3,subject=$4,body=$5,variables=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, event_type || null, channel, subject || null, body, JSON.stringify(variables || []), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Template not found" });
    res.json({ template: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to update template" });
  }
});

router.delete("/templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`DELETE FROM notification_templates WHERE id=$1`, [req.params.id]);
    res.json({ message: "Template deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// ── Retry ──────────────────────────────────────────────────────────────────────
router.post("/retry/:logId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await retryNotification(req.params.logId);
    if (!result.success) return res.status(400).json({ message: result.error || "Retry failed" });
    res.json({ message: "Retried successfully" });
  } catch (err) {
    res.status(500).json({ message: "Retry failed" });
  }
});

router.post("/retry-all-failed", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const failed = await pool.query(
      `SELECT id FROM notification_logs WHERE status='failed' AND retry_count < 3 ORDER BY created_at DESC LIMIT 50`
    );
    let success = 0; let failed_count = 0;
    for (const row of failed.rows) {
      const r = await retryNotification(row.id);
      if (r.success) success++; else failed_count++;
    }
    res.json({ message: `Retried ${failed.rows.length} messages`, success, failed: failed_count });
  } catch (err) {
    res.status(500).json({ message: "Bulk retry failed" });
  }
});

// ── Scheduled ─────────────────────────────────────────────────────────────────
router.get("/scheduled", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM scheduled_notifications ORDER BY scheduled_at ASC`);
    res.json({ scheduled: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get scheduled" });
  }
});

router.post("/scheduled", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { event_type, channel, recipient, customer_id, booking_id, customer_name, message, subject, scheduled_at } = req.body;
    if (!event_type || !channel || !recipient || !message || !scheduled_at) {
      return res.status(400).json({ message: "event_type, channel, recipient, message, scheduled_at required" });
    }
    const id = `sn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await pool.query(
      `INSERT INTO scheduled_notifications (id, event_type, channel, recipient, customer_id, booking_id, customer_name, message, subject, scheduled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
      [id, event_type, channel, recipient, customer_id || null, booking_id || null, customer_name || null, message, subject || null, scheduled_at]
    );
    res.json({ scheduled: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to create scheduled notification" });
  }
});

router.delete("/scheduled/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`DELETE FROM scheduled_notifications WHERE id=$1`, [req.params.id]);
    res.json({ message: "Scheduled notification cancelled" });
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel" });
  }
});

router.post("/process-scheduled", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const due = await pool.query(
      `SELECT * FROM scheduled_notifications WHERE status='pending' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 20`
    );
    let sent = 0;
    const { sendWhatsApp, sendDLTSMS, sendEmail, sendRCS } = await import("../lib/notifications.js");
    for (const sn of due.rows) {
      let ok = false;
      try {
        if (sn.channel === "whatsapp") ok = Boolean(await sendWhatsApp(sn.recipient, sn.message));
        else if (sn.channel === "sms") { await sendDLTSMS(sn.recipient, sn.recipient, "", ""); ok = true; }
        else if (sn.channel === "email") { await sendEmail(sn.recipient, sn.subject || "Notification", sn.message); ok = true; }
        else if (sn.channel === "rcs") ok = Boolean(await sendRCS(sn.recipient, sn.customer_name || "", sn.message));
      } catch { ok = false; }
      await pool.query(`UPDATE scheduled_notifications SET status=$1, sent_at=$2 WHERE id=$3`,
        [ok ? "sent" : "failed", ok ? new Date().toISOString() : null, sn.id]);
      if (ok) sent++;
    }
    res.json({ processed: due.rows.length, sent });
  } catch (err) {
    res.status(500).json({ message: "Failed to process scheduled" });
  }
});

// ── Campaign Manager ──────────────────────────────────────────────────────────

// GET available audience groups for campaigns
router.get("/campaigns/audiences", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const [groups, buses, allCount, outstandingCount, visaPendingCount, flightPendingCount] = await Promise.all([
      pool.query(`SELECT id, name FROM hajj_groups WHERE is_deleted=false ORDER BY name LIMIT 50`),
      pool.query(`SELECT id, bus_number FROM buses WHERE is_deleted=false ORDER BY bus_number LIMIT 100`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`),
      pool.query(`SELECT COUNT(DISTINCT customer_mobile) FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`),
    ]);
    res.json({
      groups: groups.rows,
      buses: buses.rows,
      counts: {
        all_pilgrims: Number(allCount.rows[0]?.count ?? 0),
        outstanding_payments: Number(outstandingCount.rows[0]?.count ?? 0),
        visa_pending: Number(visaPendingCount.rows[0]?.count ?? 0),
        all_customers: Number(flightPendingCount.rows[0]?.count ?? 0),
      },
    });
  } catch (err) {
    console.error("[campaigns] GET /audiences:", err);
    res.status(500).json({ message: "Failed to get audiences" });
  }
});

// GET audience preview count
router.post("/campaigns/preview", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { audience_type, audience_id } = req.body;
    let count = 0;
    if (audience_type === "all_pilgrims") {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "group" && audience_id) {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE group_id=$1 AND mobile_india IS NOT NULL`, [audience_id]);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "bus" && audience_id) {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrim_bus_assignments pba JOIN pilgrims p ON p.id=pba.pilgrim_id WHERE pba.bus_id=$1 AND p.mobile_india IS NOT NULL`, [audience_id]);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "outstanding_payments") {
      const r = await pool.query(`SELECT COUNT(DISTINCT customer_mobile) FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "visa_pending") {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    }
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: "Preview failed" });
  }
});

// GET list campaigns
router.get("/campaigns", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notification_campaigns ORDER BY created_at DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    res.json({ campaigns: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get campaigns" });
  }
});

// POST create & send campaign
router.post("/campaigns", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, audience_type, audience_id, channel, message } = req.body;
    if (!audience_type || !channel || !message?.trim()) {
      return res.status(400).json({ message: "audience_type, channel, message required" });
    }

    // Fetch recipients
    let recipients: Array<{ mobile: string; name: string; customerId?: string }> = [];

    if (audience_type === "all_pilgrims") {
      const r = await pool.query(`SELECT full_name, mobile_india FROM pilgrims WHERE mobile_india IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name }));
    } else if (audience_type === "group" && audience_id) {
      const r = await pool.query(`SELECT full_name, mobile_india, id FROM pilgrims WHERE group_id=$1 AND mobile_india IS NOT NULL`, [audience_id]);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    } else if (audience_type === "bus" && audience_id) {
      const r = await pool.query(`SELECT p.full_name, p.mobile_india, p.id FROM pilgrim_bus_assignments pba JOIN pilgrims p ON p.id=pba.pilgrim_id WHERE pba.bus_id=$1 AND p.mobile_india IS NOT NULL`, [audience_id]);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    } else if (audience_type === "outstanding_payments") {
      const r = await pool.query(`SELECT DISTINCT customer_name, customer_mobile FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.customer_mobile, name: p.customer_name }));
    } else if (audience_type === "visa_pending") {
      const r = await pool.query(`SELECT full_name, mobile_india, id FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    }

    if (recipients.length === 0) {
      return res.status(400).json({ message: "No recipients found for the selected audience" });
    }

    // Create campaign record
    const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO notification_campaigns (id, name, audience_type, audience_id, channel, message, status, total_count, sent_count, failed_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'sending',$7,0,0,NOW())`,
      [campaignId, name || `Campaign ${new Date().toLocaleDateString("en-IN")}`, audience_type, audience_id || null, channel, message, recipients.length]
    ).catch(() => {});

    // Send (respond immediately, process in background)
    res.json({ message: `Campaign started — sending to ${recipients.length} recipients`, campaignId, total: recipients.length });

    // Background send
    sendBulkNotification({
      campaignId,
      channel: channel as Channel,
      message,
      recipients,
    }).catch(err => console.error("[campaigns] bulk send error:", err));

  } catch (err: any) {
    console.error("[campaigns] POST /campaigns:", err);
    res.status(500).json({ message: err.message || "Failed to send campaign" });
  }
});

// ── Customer Preferences ──────────────────────────────────────────────────────
router.get("/preferences/:customerId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer_notification_preferences WHERE customer_id=$1`,
      [req.params.customerId]
    ).catch(() => ({ rows: [] }));
    if (!result.rows[0]) {
      res.json({ preferences: { customer_id: req.params.customerId, whatsapp: true, sms: true, email: false, rcs: false, push: false } });
    } else {
      res.json({ preferences: result.rows[0] });
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to get preferences" });
  }
});

router.put("/preferences/:customerId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { whatsapp, sms, email, rcs, push } = req.body;
    await pool.query(
      `INSERT INTO customer_notification_preferences (customer_id, whatsapp, sms, email, rcs, push, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (customer_id) DO UPDATE SET whatsapp=$2,sms=$3,email=$4,rcs=$5,push=$6,updated_at=NOW()`,
      [req.params.customerId, whatsapp ?? true, sms ?? true, email ?? false, rcs ?? false, push ?? false]
    ).catch(() => {});
    res.json({ message: "Preferences updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

// ── Meta ──────────────────────────────────────────────────────────────────────
router.get("/event-types", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const { EVENT_LABELS, EVENT_GROUPS } = await import("../lib/notificationEngine.js");
  res.json({ eventTypes: EVENT_TYPES, channels: CHANNELS, labels: EVENT_LABELS, groups: EVENT_GROUPS });
});

export default router;
