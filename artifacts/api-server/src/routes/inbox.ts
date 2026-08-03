// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";
import axios from "axios";
import { getTenantId } from "../lib/tenantContext.js";

// ── Multer: memory storage for inbox media uploads ────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image|audio|video|application\/pdf|application\/msword|application\/vnd\.|text\/)/.test(file.mimetype);
    cb(null, allowed || file.mimetype.startsWith("image") || file.mimetype.startsWith("audio"));
  },
});

// ── SSE: Real-time inbox broadcast ───────────────────────────────────────────
const sseClients = new Set<any>();

/** Broadcast an event to all connected admin inbox tabs */
export function broadcastToInbox(event: string, data: Record<string, unknown>) {
  if (sseClients.size === 0) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

const router = Router();

// ── Migration ─────────────────────────────────────────────────────────────────
async function ensureInboxTables() {
  // Add is_internal_note to social_messages
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'incoming'`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS replied_by TEXT`);
  // Inbox tags + priority on leads (already has priority, add tags)
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[]`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS inbox_status VARCHAR(50) DEFAULT 'open'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0`);
  // Index for fast inbox queries
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_lead_created ON social_messages(lead_text_id, created_at DESC)`);
  console.log("[Inbox] Migration complete");
}
ensureInboxTables().catch(e => console.error("[Inbox] Migration error:", e));

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLATFORM_GROUPS: Record<string, string> = {
  whatsapp_botbee: "whatsapp", whatsapp_meta: "whatsapp",
  facebook_page: "facebook", facebook_messenger: "messenger", facebook_leads: "facebook",
  instagram: "instagram", instagram_dm: "instagram",
  telegram_bot: "telegram", telegram_channel: "telegram",
  website_contact: "website", website_booking: "website", website_support: "website",
  website_inquiry: "website", website_livechat: "website", website_ai_chat: "website",
  fast2sms: "sms", smtp_email: "email",
};

// ── GET /api/inbox/stats ──────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [unread, todayLeads, todayMsgs, openConvos, followUps] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(unread_count),0)::int as total FROM leads WHERE tenant_id=$1::uuid AND inbox_status='open'`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE tenant_id=$1::uuid AND created_at::date = CURRENT_DATE`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM social_messages WHERE created_at::date = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE tenant_id=$1::uuid AND inbox_status='open' AND status NOT IN ('converted','lost','cancelled','completed')`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE tenant_id=$1::uuid AND follow_up_date::text = CURRENT_DATE::text AND status NOT IN ('converted','lost','cancelled','completed')`, [tenantId]),
    ]);
    res.json({
      unread: unread.rows[0].total,
      today_leads: todayLeads.rows[0].count,
      today_messages: todayMsgs.rows[0].count,
      open_conversations: openConvos.rows[0].count,
      follow_ups_today: followUps.rows[0].count,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/inbox/conversations ──────────────────────────────────────────────
router.get("/conversations", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { platform, status, assignedTo, unread, priority, search, limit = "60", offset = "0" } = req.query as any;
    const conds: string[] = [`l.tenant_id=$1::uuid`];
    const params: any[] = [tenantId];

    if (platform && platform !== "all") {
      params.push(platform); conds.push(`(l.platform = $${params.length} OR l.source = $${params.length})`);
    }
    if (status && status !== "all") { params.push(status); conds.push(`l.status = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); conds.push(`l.assigned_to = $${params.length}`); }
    if (unread === "true") { conds.push(`l.unread_count > 0`); }
    if (priority && priority !== "all") { params.push(priority); conds.push(`l.priority = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conds.push(`(l.name ILIKE $${n} OR l.mobile ILIKE $${n} OR l.email ILIKE $${n} OR l.telegram_username ILIKE $${n} OR l.instagram_username ILIKE $${n} OR l.facebook_name ILIKE $${n} OR l.message ILIKE $${n})`);
    }

    params.push(parseInt(limit)); params.push(parseInt(offset));
    const where = "WHERE " + conds.join(" AND ");

    const r = await pool.query(`
      SELECT
        l.*,
        (
          SELECT message_text FROM social_messages
          WHERE lead_text_id = l.id AND is_internal_note IS NOT TRUE
          ORDER BY created_at DESC LIMIT 1
        ) as last_message,
        (
          SELECT created_at FROM social_messages
          WHERE lead_text_id = l.id
          ORDER BY created_at DESC LIMIT 1
        ) as last_message_at,
        (
          SELECT COUNT(*)::int FROM social_messages
          WHERE lead_text_id = l.id
        ) as total_messages
      FROM leads l
      ${where}
      ORDER BY COALESCE(
        (SELECT MAX(created_at) FROM social_messages WHERE lead_text_id = l.id),
        l.created_at
      ) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countR = await pool.query(
      `SELECT COUNT(*)::int as total FROM leads l ${where}`,
      params.slice(0, -2)
    );

    res.json({ conversations: r.rows, total: countR.rows[0].total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/inbox/conversations/:id/messages ─────────────────────────────────
router.get("/conversations/:id/messages", requireAdmin as any, async (req, res) => {
  try {
    const { id } = req.params;

    // Get lead info
    const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
    const lead = leadR.rows[0];
    if (!lead) return void res.status(404).json({ error: "Conversation not found" });

    // Get all social messages (incoming + outgoing + notes)
    const msgs = await pool.query(`
      SELECT id, platform, message_id, sender_name, sender_phone,
             message_text, message_type, media_url, status,
             is_internal_note, direction, replied_by, created_at
      FROM social_messages
      WHERE lead_text_id = $1
      ORDER BY created_at ASC
      LIMIT 300
    `, [id]);

    // Get outgoing notification logs for this mobile
    let outgoing: any[] = [];
    if (lead.mobile) {
      const logsR = await pool.query(`
        SELECT id::text, channel as platform, message as message_text,
               'text' as message_type, status, 'outgoing' as direction, created_at
        FROM notification_logs
        WHERE recipient = $1
        ORDER BY created_at ASC LIMIT 100
      `, [lead.mobile]);
      outgoing = logsR.rows;
    }

    // Mark as read
    await pool.query(`
      UPDATE social_messages SET status = CASE WHEN status='unread' THEN 'read' ELSE status END
      WHERE lead_text_id = $1 AND status = 'unread'
    `, [id]);
    await pool.query(`UPDATE leads SET unread_count = 0 WHERE id = $1`, [id]);

    res.json({ lead, messages: msgs.rows, outgoing });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/inbox/conversations/:id ───────────────────────────────────────
router.patch("/conversations/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, priority, assignedName, assignedTo, assignedBranch, followUpDate, notes, tags, inboxStatus } = req.body;
    const r = await pool.query(`
      UPDATE leads SET
        status = COALESCE($1, status),
        priority = COALESCE($2, priority),
        assigned_name = COALESCE($3, assigned_name),
        assigned_to = COALESCE($4, assigned_to),
        assigned_branch = COALESCE($5, assigned_branch),
        follow_up_date = COALESCE($6, follow_up_date),
        notes = COALESCE($7, notes),
        tags = COALESCE($8, tags),
        inbox_status = COALESCE($9, inbox_status),
        converted_at = CASE WHEN $1 IN ('converted','booked','confirmed') AND converted_at IS NULL THEN NOW() ELSE converted_at END,
        updated_at = NOW()
      WHERE id = $10 RETURNING *
    `, [status||null, priority||null, assignedName||null, assignedTo||null,
        assignedBranch||null, followUpDate||null, notes||null,
        tags ? tags : null, inboxStatus||null, req.params.id]);
    res.json(r.rows[0] || { error: "Not found" });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/reply ───────────────────────────────────
router.post("/conversations/:id/reply", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, channel } = req.body;
    if (!message?.trim()) return void res.status(400).json({ error: "Message required" });

    const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
    const lead = leadR.rows[0];
    if (!lead) return void res.status(404).json({ error: "Lead not found" });

    let sent = false;
    let errorMsg = "";
    const adminName = (req as any).user?.name || "Admin";

    if (channel === "whatsapp" || (!channel && lead.mobile)) {
      if (!lead.mobile) return void res.status(400).json({ error: "No mobile number for this lead" });
      const ok = await sendWhatsApp(lead.mobile, message);
      sent = !!ok;
      if (!sent) errorMsg = "WhatsApp send failed";
    } else if (channel === "sms") {
      if (!lead.mobile) return void res.status(400).json({ error: "No mobile number for this lead" });
      const ok = await sendDLTSMS(lead.mobile, message);
      sent = !!ok;
      if (!sent) errorMsg = "SMS send failed";
    } else if (channel === "email") {
      if (!lead.email) return void res.status(400).json({ error: "No email for this lead" });
      try {
        const { emailService } = await import("../services/emailService.js") as any;
        await emailService.sendEmail({ to: lead.email, subject: "Al Burhan Tours & Travels", text: message });
        sent = true;
      } catch (e: any) { errorMsg = e.message; sent = false; }
    } else if (channel === "telegram") {
      const cfgR = await pool.query(`SELECT * FROM social_platform_configs WHERE platform='telegram_bot' LIMIT 1`);
      if (cfgR.rows[0]) {
        const { decrypt } = await import("../lib/encryption.js") as any;
        let extra: any = {};
        try { extra = JSON.parse(decrypt(cfgR.rows[0].extra_fields_encrypted)); } catch {}
        const token = extra.bot_token;
        const chatId = lead.platform_user_id || lead.telegram_username;
        if (token && chatId) {
          const cleanId = String(chatId).replace("@", "");
          const resp = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: cleanId, text: message }, { timeout: 8000 });
          sent = resp.data?.ok === true;
          if (!sent) errorMsg = "Telegram send failed";
        } else { errorMsg = "No Telegram chat ID or bot token"; }
      } else { errorMsg = "Telegram not configured"; }
    }

    // Save outgoing message to social_messages
    if (sent) {
      const effectiveChannel = channel || (lead.mobile ? "whatsapp" : "sms");
      await pool.query(`
        INSERT INTO social_messages (platform, message_text, message_type, lead_text_id, direction, replied_by, sender_name, status)
        VALUES ($1, $2, 'text', $3, 'outgoing', $4, $5, 'sent')
      `, [effectiveChannel, message, req.params.id, adminName, adminName]);

      await pool.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
      res.json({ ok: true, channel: effectiveChannel });
    } else {
      res.status(500).json({ ok: false, error: errorMsg || "Failed to send message" });
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/note ────────────────────────────────────
router.post("/conversations/:id/note", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return void res.status(400).json({ error: "Note text required" });
    const adminName = (req as any).user?.name || "Admin";
    const r = await pool.query(`
      INSERT INTO social_messages (platform, message_text, message_type, lead_text_id, direction, is_internal_note, sender_name, status)
      VALUES ('internal', $1, 'note', $2, 'note', true, $3, 'sent')
      RETURNING *
    `, [text.trim(), req.params.id, adminName]);
    res.json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/mark-read ───────────────────────────────
router.post("/conversations/:id/mark-read", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE social_messages SET status='read' WHERE lead_text_id=$1 AND status='unread'`, [req.params.id]);
    await pool.query(`UPDATE leads SET unread_count=0 WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/close ───────────────────────────────────
router.post("/conversations/:id/close", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE leads SET inbox_status='closed', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/reopen ──────────────────────────────────
router.post("/conversations/:id/reopen", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE leads SET inbox_status='open', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/website-message ──────────────────────────────────────────
// Called by website live chat / contact forms
router.post("/website-message", async (req, res) => {
  try {
    const { name, mobile, email, message, platform = "website_livechat", page_url } = req.body;
    if (!message?.trim()) return void res.status(400).json({ error: "Message required" });

    // Find or create lead
    let leadId: string | null = null;
    if (mobile) {
      const existing = await pool.query(`SELECT id FROM leads WHERE REGEXP_REPLACE(mobile,'\\D','','g') LIKE $1 LIMIT 1`, [`%${mobile.replace(/\D/g,"").slice(-10)}`]);
      if (existing.rows[0]) leadId = existing.rows[0].id;
    }
    if (!leadId) {
      leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      await pool.query(`
        INSERT INTO leads (id, name, mobile, email, source, message, platform, status, priority, follow_up_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'website',$5,$6,'new','normal', CURRENT_DATE + INTERVAL '1 day', NOW(), NOW())
      `, [leadId, name||"Website Visitor", mobile||null, email||null, message, platform]);
    }

    // Save the message
    const insertR = await pool.query(`
      INSERT INTO social_messages (platform, message_text, message_type, lead_text_id, sender_name, sender_phone, direction, status)
      VALUES ($1, $2, 'text', $3, $4, $5, 'incoming', 'unread') RETURNING id
    `, [platform, message, leadId, name||"Website Visitor", mobile||null]);

    // Increment unread count
    await pool.query(`UPDATE leads SET unread_count = COALESCE(unread_count,0)+1, last_message_at=NOW() WHERE id=$1`, [leadId]);

    res.json({ ok: true, lead_id: leadId, message_id: insertR.rows[0].id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/inbox/unread-count ───────────────────────────────────────────────
router.get("/unread-count", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int as count FROM social_messages WHERE status='unread'`);
    res.json({ count: r.rows[0].count });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PHASE B — CONVERSATION REPLY & TIMELINE
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/inbox/conversation/:leadId ──────────────────────────────────────
// Full message thread for a lead (both directions)
router.get("/conversation/:leadId", requireAdmin as any, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sm.*, 
             CASE WHEN sm.replied_by IS NOT NULL THEN u.name ELSE NULL END as replied_by_name
      FROM social_messages sm
      LEFT JOIN users u ON u.id = sm.replied_by
      WHERE sm.lead_text_id = $1
      ORDER BY sm.created_at ASC
      LIMIT 300
    `, [req.params.leadId]);

    // Mark all as read
    await pool.query(
      `UPDATE social_messages SET status='read', read_at=NOW() WHERE lead_text_id=$1 AND status='unread'`,
      [req.params.leadId],
    );
    await pool.query(
      `UPDATE leads SET unread_count=0 WHERE id=$1`,
      [req.params.leadId],
    );

    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversation/:leadId/reply ────────────────────────────────
// Send a WhatsApp/SMS reply to a lead from the admin
router.post("/conversation/:leadId/reply", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, channel = "whatsapp" } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    const leadRes = await pool.query(`SELECT * FROM leads WHERE id=$1`, [req.params.leadId]);
    if (!leadRes.rows[0]) return res.status(404).json({ error: "Lead not found" });
    const lead = leadRes.rows[0];

    if (!lead.mobile) return res.status(400).json({ error: "Lead has no mobile number" });

    let sent = false;
    let errorMsg = "";

    if (channel === "sms") {
      try {
        await sendDLTSMS(lead.mobile, "custom_sms", { message });
        sent = true;
      } catch (e: any) { errorMsg = e.message; }
    } else {
      try {
        await sendWhatsApp(lead.mobile, message);
        sent = true;
      } catch (e: any) { errorMsg = e.message; }
    }

    // Save outbound message to social_messages regardless of send status
    const insertRes = await pool.query(`
      INSERT INTO social_messages 
        (platform, message_text, message_type, lead_text_id, sender_name, sender_phone, 
         direction, status, replied_by, delivery_status, created_at)
      VALUES ($1, $2, 'text', $3, $4, $5, 'outgoing', 'sent', $6, $7, NOW())
      RETURNING id
    `, [
      channel === "sms" ? "fast2sms" : "whatsapp_botbee",
      message, req.params.leadId,
      req.user?.name || "Admin", null,
      req.user?.id?.toString() || null,
      sent ? "delivered" : "failed",
    ]);

    // Log activity on lead
    await pool.query(`
      INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
      VALUES (gen_random_uuid()::text, $1, 'message_sent', $2, $3, $4, $5)
    `, [
      req.params.leadId,
      `Sent ${channel.toUpperCase()} reply: ${message.slice(0, 100)}`,
      JSON.stringify({ channel, sent, message_id: insertRes.rows[0].id }),
      req.user?.id?.toString(),
      req.user?.name || "Admin",
    ]);

    res.json({ ok: true, sent, messageId: insertRes.rows[0].id, error: errorMsg || undefined });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversation/:leadId/note ─────────────────────────────────
// Add an internal note to a lead's conversation (not sent to customer)
router.post("/conversation/:leadId/note", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: "note required" });

    const insertRes = await pool.query(`
      INSERT INTO social_messages
        (platform, message_text, message_type, lead_text_id, sender_name,
         direction, status, replied_by, is_internal_note, created_at)
      VALUES ('internal', $1, 'text', $2, $3, 'outgoing', 'read', $4, true, NOW())
      RETURNING id
    `, [note, req.params.leadId, req.user?.name || "Admin", req.user?.id?.toString()]);

    res.json({ ok: true, messageId: insertRes.rows[0].id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/inbox/lead/:leadId/read ────────────────────────────────────────
router.patch("/lead/:leadId/read", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE social_messages SET status='read', read_at=NOW() WHERE lead_text_id=$1 AND status='unread'`, [req.params.leadId]);
    await pool.query(`UPDATE leads SET unread_count=0 WHERE id=$1`, [req.params.leadId]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/inbox/leads ──────────────────────────────────────────────────────
// Inbox-style lead list sorted by latest message / unread first
router.get("/leads", requireAdmin as any, async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search}%` : null;
    const status = req.query.status || "open";
    const page   = Math.max(0, parseInt(String(req.query.page || "0")));
    const limit  = 30;

    let where = `l.status NOT IN ('spam','cancelled')`;
    const params: any[] = [];

    if (status !== "all") { params.push(status); where += ` AND l.inbox_status = $${params.length}`; }
    if (search) { params.push(search); where += ` AND (l.name ILIKE $${params.length} OR l.mobile ILIKE $${params.length} OR l.email ILIKE $${params.length})`; }

    params.push(limit, page * limit);
    const { rows } = await pool.query(`
      SELECT l.id, l.lead_number, l.name, l.mobile, l.email, l.source, l.pipeline_stage as stage,
             l.priority, l.unread_count, l.inbox_status, l.score, l.ai_score,
             l.ai_next_action, l.assigned_to,
             u.name as assigned_to_name,
             sm.message_text as last_message, sm.created_at as last_message_at,
             sm.direction as last_direction
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to
      LEFT JOIN LATERAL (
        SELECT message_text, created_at, direction FROM social_messages
        WHERE lead_text_id = l.id ORDER BY created_at DESC LIMIT 1
      ) sm ON true
      WHERE ${where}
      ORDER BY COALESCE(l.unread_count,0) DESC, COALESCE(sm.created_at, l.created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM leads l WHERE ${where}`, params.slice(0, -2));
    res.json({ leads: rows, total: countRes.rows[0]?.total || 0, page, limit });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/inbox/stream ─────────────────────────────────────────────────────
/**
 * Server-Sent Events endpoint for real-time inbox updates.
 * Keeps the HTTP connection alive and emits events whenever a new inbound
 * message is broadcast via broadcastToInbox().
 */
router.get("/stream", requireAdmin as any, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering
  });
  res.write("event: connected\ndata: {}\n\n");
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); sseClients.delete(res); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ── POST /api/inbox/conversations/:id/media ───────────────────────────────────
/**
 * Upload and send a file attachment (image / document / video) via WhatsApp.
 * Accepts multipart/form-data with field `file` and optional `caption` text.
 * Uses BotBee uploadMedia → sendFile pipeline.
 */
router.post(
  "/conversations/:id/media",
  requireAdmin as any,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) return void res.status(400).json({ error: "No file uploaded" });
      const { caption = "" } = req.body;

      const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
      const lead = leadR.rows[0];
      if (!lead) return void res.status(404).json({ error: "Lead not found" });
      if (!lead.mobile) return void res.status(400).json({ error: "Lead has no mobile number" });

      // Determine WhatsApp message type from MIME
      const mime = req.file.mimetype;
      let msgType = "document";
      if (mime.startsWith("image/")) msgType = "image";
      else if (mime.startsWith("audio/")) msgType = "audio";
      else if (mime.startsWith("video/")) msgType = "video";

      // Upload buffer to BotBee media store to get a media_id
      const { uploadMedia, sendFile } = await import("../lib/botbee.js") as any;
      const up = await uploadMedia(req.file.buffer, mime, req.file.originalname);
      if (!up.mediaId) {
        return void res.status(500).json({ error: "Media upload failed", detail: up.errorMessage });
      }

      // Send the media via WhatsApp
      const sendResult = await sendFile(lead.mobile, up.mediaId, caption || req.file.originalname);
      const adminName = (req as any).user?.name || "Admin";

      // Persist in conversation thread
      await pool.query(`
        INSERT INTO social_messages
          (platform, message_text, message_type, media_url, lead_text_id, direction, replied_by, sender_name, status)
        VALUES ('whatsapp', $1, $2, $3, $4, 'outgoing', $5, $5, 'sent')
      `, [caption || req.file.originalname, msgType, up.mediaId, req.params.id, adminName]);

      await pool.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [req.params.id]);

      res.json({ ok: sendResult.ok, mediaId: up.mediaId, type: msgType,
        error: sendResult.ok ? undefined : sendResult.errorMessage });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  }
);

// ── POST /api/inbox/conversations/:id/voice ───────────────────────────────────
/**
 * Upload a browser-recorded audio blob and send as a WhatsApp voice note.
 * Accepts multipart/form-data with field `audio` (ogg/webm/mp4 audio).
 */
router.post(
  "/conversations/:id/voice",
  requireAdmin as any,
  upload.single("audio"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) return void res.status(400).json({ error: "No audio uploaded" });

      const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
      const lead = leadR.rows[0];
      if (!lead) return void res.status(404).json({ error: "Lead not found" });
      if (!lead.mobile) return void res.status(400).json({ error: "Lead has no mobile number" });

      const mime = req.file.mimetype || "audio/ogg";
      const filename = req.file.originalname || `voice_${Date.now()}.ogg`;

      const { uploadMedia, sendFile } = await import("../lib/botbee.js") as any;
      const up = await uploadMedia(req.file.buffer, mime, filename);
      if (!up.mediaId) {
        return void res.status(500).json({ error: "Voice upload failed", detail: up.errorMessage });
      }

      const sendResult = await sendFile(lead.mobile, up.mediaId, "");
      const adminName = (req as any).user?.name || "Admin";

      await pool.query(`
        INSERT INTO social_messages
          (platform, message_text, message_type, media_url, lead_text_id, direction, replied_by, sender_name, status)
        VALUES ('whatsapp', '🎙️ Voice Note', 'audio', $1, $2, 'outgoing', $3, $3, 'sent')
      `, [up.mediaId, req.params.id, adminName]);

      await pool.query(`UPDATE leads SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
      res.json({ ok: sendResult.ok, mediaId: up.mediaId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  }
);

// ── GET /api/inbox/conversations/:id/customer360 ─────────────────────────────
/**
 * Returns a quick Customer 360 snapshot for the conversation panel:
 * booking status, last payment, pilgrim count, open tickets, recent activity.
 */
router.get("/conversations/:id/customer360", requireAdmin as any, async (req, res) => {
  try {
    const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
    const lead = leadR.rows[0];
    if (!lead) return void res.status(404).json({ error: "Lead not found" });

    const mobile = lead.mobile;
    const email  = lead.email;

    // Find linked user/booking (match by mobile or email)
    let booking: any = null;
    let user: any    = null;
    if (mobile || email) {
      const conds = [];
      const params: any[] = [];
      if (mobile) { params.push(mobile.replace(/\D/g, "").slice(-10)); conds.push(`REGEXP_REPLACE(mobile,'\\D','','g') LIKE $${params.length}`); }
      if (email)  { params.push(email.toLowerCase()); conds.push(`LOWER(email) = $${params.length}`); }
      const uRes = await pool.query(
        `SELECT id, name, email, mobile, created_at FROM users WHERE ${conds.join(" OR ")} LIMIT 1`, params
      );
      user = uRes.rows[0] || null;
      if (user) {
        const bRes = await pool.query(`
          SELECT b.id, b.booking_number, b.status, b.final_amount, b.paid_amount,
                 b.created_at, p.name as package_name
          FROM bookings b LEFT JOIN packages p ON p.id = b.package_id
          WHERE b.customer_id = $1
          ORDER BY b.created_at DESC LIMIT 1
        `, [user.id]);
        booking = bRes.rows[0] || null;
      }
    }

    // Open support tickets
    const ticketR = await pool.query(
      `SELECT COUNT(*)::int as count FROM support_tickets WHERE customer_id = $1 AND status != 'closed'`,
      [user?.id || "none"]
    ).catch(() => ({ rows: [{ count: 0 }] }));

    res.json({
      lead,
      user,
      booking,
      openTickets: ticketR.rows[0]?.count || 0,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/inbox/conversations/:id/ai-suggest ─────────────────────────────
// Returns 3 AI-generated reply suggestions for a conversation
router.post("/conversations/:id/ai-suggest", requireAdmin as any, async (req, res) => {
  try {
    const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
    if (!leadRes.rows[0]) return res.status(404).json({ error: "Conversation not found" });
    const l = leadRes.rows[0];

    const msgs = await pool.query(`
      SELECT message_text, direction, created_at
        FROM social_messages
       WHERE lead_text_id = $1
       ORDER BY created_at DESC LIMIT 10
    `, [req.params.id]);

    const history = msgs.rows
      .reverse()
      .map((m: any) =>
        `${m.direction === "outgoing" ? "Agent" : "Customer"}: ${m.message_text || "(media)"}`)
      .join("\n");

    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

    if (!apiKey || !baseURL) {
      // Fallback: context-aware templates
      const name = l.name || "valued customer";
      return res.json({ suggestions: [
        `Assalamu Alaikum ${name}, JazakAllah khair for your interest! We have excellent ${l.package_interest || "Hajj/Umrah"} packages available. How many travellers will be joining?`,
        `Thank you for reaching out, ${name}! Our team would love to help you plan your spiritual journey. Could you please share your preferred travel dates and budget?`,
        `Dear ${name}, we're delighted to assist with your ${l.package_interest || "Hajj/Umrah"} booking. Please allow us 24 hours to prepare a personalised package quote for you.`,
      ], source: "template" });
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey, baseURL });

    const prompt = `You are a professional sales agent for Al Burhan Tours & Travels, a trusted Hajj and Umrah travel company in India.

Customer profile:
- Name: ${l.name || "Unknown"}
- Mobile: ${l.mobile || "N/A"}
- Source: ${l.source || "Unknown"}
- Package interest: ${l.package_interest || "General Hajj/Umrah"}
- Budget: ${l.budget ? "₹" + Number(l.budget).toLocaleString("en-IN") : "Not specified"}
- Stage: ${l.pipeline_stage || "new_lead"}
- Priority: ${l.priority || "normal"}

${history ? `Recent conversation:\n${history}` : "(No prior messages — this will be the first contact)"}

Generate exactly 3 short, professional reply suggestions in the tone of a helpful Islamic travel consultant. Each reply should be natural, warm, and move the conversation forward toward booking. 
Return ONLY a valid JSON array of 3 strings, nothing else.
Example format: ["Reply 1 text", "Reply 2 text", "Reply 3 text"]`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.text || "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      if (!Array.isArray(suggestions)) suggestions = [text];
    } catch {
      suggestions = [text];
    }

    res.json({ suggestions: suggestions.slice(0, 3), source: "ai" });
  } catch (err: any) {
    res.status(500).json({ error: err.message, suggestions: [] });
  }
});

export default router;
