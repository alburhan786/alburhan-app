// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";
import axios from "axios";

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
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [unread, todayLeads, todayMsgs, openConvos, followUps] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(unread_count),0)::int as total FROM leads WHERE inbox_status='open'`),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE created_at::date = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int as count FROM social_messages WHERE created_at::date = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE inbox_status='open' AND status NOT IN ('converted','lost','cancelled','completed')`),
      pool.query(`SELECT COUNT(*)::int as count FROM leads WHERE follow_up_date::text = CURRENT_DATE::text AND status NOT IN ('converted','lost','cancelled','completed')`),
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
    const { platform, status, assignedTo, unread, priority, search, limit = "60", offset = "0" } = req.query as any;
    const conds: string[] = ["1=1"];
    const params: any[] = [];

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

export default router;
