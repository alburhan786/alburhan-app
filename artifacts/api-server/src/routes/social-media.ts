// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { encrypt, decrypt } from "../lib/encryption.js";
import axios from "axios";

const router = Router();

// ── Migration ────────────────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_platform_configs (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(80) UNIQUE NOT NULL,
      enabled BOOLEAN DEFAULT false,
      status VARCHAR(50) DEFAULT 'disconnected',
      api_key_encrypted TEXT,
      extra_fields_encrypted TEXT,
      webhook_url TEXT,
      webhook_verified BOOLEAN DEFAULT false,
      last_tested TIMESTAMPTZ,
      last_sync TIMESTAMPTZ,
      test_result JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_messages (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(80) NOT NULL,
      message_id VARCHAR(255),
      sender_id VARCHAR(255),
      sender_name VARCHAR(255),
      sender_phone VARCHAR(50),
      message_text TEXT,
      message_type VARCHAR(50) DEFAULT 'text',
      media_url TEXT,
      raw_data JSONB,
      lead_id INTEGER,
      lead_text_id TEXT,
      status VARCHAR(50) DEFAULT 'unread',
      assigned_to INTEGER,
      notes TEXT,
      replied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add lead_text_id if missing (safe ALTER)
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS lead_text_id TEXT`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_platform ON social_messages(platform)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_status ON social_messages(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_lead ON social_messages(lead_text_id)`);

  // ── Lead assignment rules ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_assignment_rules (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(80) NOT NULL,
      assigned_name VARCHAR(100),
      assigned_to TEXT,
      branch_name VARCHAR(100),
      auto_reply_text TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── Extend leads table with social/platform columns ───────────────────────
  const cols = [
    "ADD COLUMN IF NOT EXISTS platform VARCHAR(80)",
    "ADD COLUMN IF NOT EXISTS platform_user_id VARCHAR(255)",
    "ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50)",
    "ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100)",
    "ADD COLUMN IF NOT EXISTS facebook_name VARCHAR(100)",
    "ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100)",
    "ADD COLUMN IF NOT EXISTS conversation_count INTEGER DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ",
    "ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'",
    "ADD COLUMN IF NOT EXISTS assigned_branch VARCHAR(100)",
    "ADD COLUMN IF NOT EXISTS auto_reply_sent BOOLEAN DEFAULT false",
  ];
  for (const col of cols) {
    await pool.query(`ALTER TABLE leads ${col}`).catch(() => {});
  }

  console.log("[SocialMedia] Migration complete");
}
ensureTables().catch(e => console.error("[SocialMedia] Migration error:", e));

// ── Helpers ──────────────────────────────────────────────────────────────────
function decryptExtra(enc: string | null): Record<string, any> {
  if (!enc) return {};
  try { return JSON.parse(decrypt(enc)); } catch { return {}; }
}

function maskVal(v: string): string {
  if (!v || v.length < 8) return "••••••";
  return v.slice(0, 4) + "•".repeat(Math.min(v.length - 8, 12)) + v.slice(-4);
}

// Map social platform → lead source value
const PLATFORM_TO_SOURCE: Record<string, string> = {
  whatsapp_botbee: "whatsapp",
  whatsapp_meta: "whatsapp",
  facebook_page: "facebook",
  facebook_messenger: "messenger",
  facebook_leads: "facebook_ads",
  instagram: "instagram",
  instagram_dm: "instagram",
  telegram_bot: "telegram",
  telegram_channel: "telegram",
  website_contact: "website",
  website_booking: "website",
  website_support: "website",
  website_inquiry: "website",
  website_livechat: "website",
  website_ai_chat: "website",
  fast2sms: "sms",
  smtp_email: "email",
  google_rcs: "rcs",
  jio_rcs: "rcs",
};

// ── Auto Lead Creation ───────────────────────────────────────────────────────
async function autoCreateLeadFromMessage(msg: {
  id: number;
  platform: string;
  sender_id: string;
  sender_name?: string;
  sender_phone?: string;
  message_text: string;
  message_type?: string;
}) {
  try {
    const source = PLATFORM_TO_SOURCE[msg.platform] || "other";

    // Get assignment rule for this platform
    const ruleR = await pool.query(
      `SELECT * FROM lead_assignment_rules WHERE platform=$1 AND is_active=true LIMIT 1`,
      [msg.platform]
    );
    const rule = ruleR.rows[0];

    // Try to find existing lead by platform_user_id or phone
    let existingLead: any = null;
    if (msg.sender_id) {
      const byPlatformId = await pool.query(
        `SELECT * FROM leads WHERE platform_user_id=$1 AND platform=$2 LIMIT 1`,
        [msg.sender_id, msg.platform]
      );
      existingLead = byPlatformId.rows[0] || null;
    }
    if (!existingLead && msg.sender_phone) {
      const clean = msg.sender_phone.replace(/\D/g, "").slice(-10);
      const byPhone = await pool.query(
        `SELECT * FROM leads WHERE REGEXP_REPLACE(mobile,'\\D','','g') LIKE $1 LIMIT 1`,
        [`%${clean}`]
      );
      existingLead = byPhone.rows[0] || null;
    }

    let leadId: string;

    if (existingLead) {
      // Update existing lead
      leadId = existingLead.id;
      await pool.query(`
        UPDATE leads SET
          conversation_count = COALESCE(conversation_count, 0) + 1,
          last_message_at = NOW(),
          status = CASE WHEN status IN ('converted','lost') THEN status ELSE 'contacted' END,
          updated_at = NOW()
        WHERE id = $1
      `, [leadId]);
    } else {
      // Create new lead
      leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const name = msg.sender_name || `${source.charAt(0).toUpperCase() + source.slice(1)} Lead`;
      const followUpDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10); // tomorrow

      // Platform-specific username fields
      const igUsername = msg.platform.includes("instagram") ? msg.sender_id : null;
      const fbName = msg.platform.includes("facebook") || msg.platform === "facebook_messenger" ? msg.sender_name : null;
      const tgUsername = msg.platform.includes("telegram") ? msg.sender_id : null;

      await pool.query(`
        INSERT INTO leads (
          id, name, mobile, source, message, status, platform, platform_user_id,
          instagram_username, facebook_name, telegram_username,
          assigned_name, assigned_to, assigned_branch,
          follow_up_date, conversation_count, last_message_at,
          priority, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,'new',$6,$7,$8,$9,$10,$11,$12,$13,$14,1,NOW(),'normal',NOW(),NOW())
      `, [
        leadId,
        name,
        msg.sender_phone || null,
        source,
        msg.message_text?.slice(0, 1000) || null,
        msg.platform,
        msg.sender_id,
        igUsername,
        fbName,
        tgUsername,
        rule?.assigned_name || null,
        rule?.assigned_to || null,
        rule?.branch_name || null,
        followUpDate,
      ]);

      // Notify admins about new lead
      notifyNewLead(leadId, name, source, msg.message_text).catch(() => {});
    }

    // Link the message to this lead
    await pool.query(
      `UPDATE social_messages SET lead_text_id=$1, status='linked' WHERE id=$2`,
      [leadId, msg.id]
    );

    return leadId;
  } catch (e: any) {
    console.error("[SocialMedia] autoCreateLead error:", e.message);
    return null;
  }
}

// ── Notify admins about new lead ─────────────────────────────────────────────
async function notifyNewLead(leadId: string, name: string, source: string, message: string) {
  try {
    const admins = await pool.query(
      `SELECT mobile FROM users WHERE role='admin' AND mobile IS NOT NULL LIMIT 5`
    );
    const { sendDLTSMS } = await import("../lib/notifications.js") as any;
    const text = `🔔 New ${source} lead: ${name}. Message: "${message?.slice(0, 80)}". Login to ERP to assign.`;
    for (const a of admins.rows) {
      if (a.mobile) sendDLTSMS(a.mobile, text).catch(() => {});
    }
    // Log to admin_notifications table
    await pool.query(
      `INSERT INTO admin_notifications (id, type, title, message, data, created_at)
       VALUES (gen_random_uuid(),'new_lead','New Lead from ${source}', $1, $2::jsonb, NOW())`,
      [text, JSON.stringify({ leadId, source, name })]
    ).catch(() => {});
  } catch {}
}

// ── PLATFORM DEFINITIONS ─────────────────────────────────────────────────────
const PLATFORM_META = {
  whatsapp_meta: {
    group: "WhatsApp", name: "WhatsApp Cloud API",
    fields: ["access_token", "phone_number_id", "waba_id", "webhook_verify_token"],
    sensitiveFields: ["access_token"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  facebook_page: {
    group: "Facebook", name: "Facebook Page",
    fields: ["page_access_token", "page_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  facebook_messenger: {
    group: "Facebook", name: "Facebook Messenger",
    fields: ["page_access_token", "page_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  facebook_leads: {
    group: "Facebook", name: "Facebook Lead Ads",
    fields: ["page_access_token", "page_id", "form_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  instagram: {
    group: "Instagram", name: "Instagram Business",
    fields: ["page_access_token", "instagram_account_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  instagram_dm: {
    group: "Instagram", name: "Instagram Direct Messages",
    fields: ["page_access_token", "instagram_account_id", "app_id", "app_secret"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/social-media/webhook/meta",
  },
  telegram_bot: {
    group: "Telegram", name: "Telegram Bot",
    fields: ["bot_token", "bot_username", "webhook_secret"],
    sensitiveFields: ["bot_token", "webhook_secret"],
    webhookPath: "/api/social-media/webhook/telegram",
  },
  telegram_channel: {
    group: "Telegram", name: "Telegram Channel",
    fields: ["bot_token", "channel_id", "channel_username"],
    sensitiveFields: ["bot_token"],
    webhookPath: "/api/social-media/webhook/telegram",
  },
  google_rcs: {
    group: "RCS", name: "Google RCS Business Messaging",
    fields: ["api_key", "service_account_json", "agent_id", "project_id"],
    sensitiveFields: ["api_key", "service_account_json"],
    webhookPath: "/api/webhook/rcs-google",
  },
  jio_rcs: {
    group: "RCS", name: "Jio RCS",
    fields: ["username", "password", "sender_id", "api_url"],
    sensitiveFields: ["password"],
    webhookPath: "/api/webhook/rcs-jio",
  },
  firebase: {
    group: "Push", name: "Firebase Push Notifications",
    fields: ["server_key", "project_id", "vapid_key"],
    sensitiveFields: ["server_key", "vapid_key"],
    webhookPath: null,
  },
};

// ── GET /api/social-media/platforms ─────────────────────────────────────────
router.get("/platforms", requireAdmin as any, async (_req, res) => {
  try {
    const [smRows, apiRows] = await Promise.all([
      pool.query(`SELECT * FROM social_platform_configs ORDER BY platform`),
      pool.query(`SELECT provider, enabled, status, last_tested FROM api_settings`),
    ]);

    const smMap: Record<string, any> = {};
    for (const r of smRows.rows) {
      const extra = decryptExtra(r.extra_fields_encrypted);
      const maskedExtra: Record<string, string> = {};
      const meta = PLATFORM_META[r.platform as keyof typeof PLATFORM_META];
      for (const [k, v] of Object.entries(extra)) {
        const isSensitive = meta?.sensitiveFields?.includes(k);
        maskedExtra[k] = isSensitive ? maskVal(String(v)) : String(v ?? "");
      }
      smMap[r.platform] = {
        platform: r.platform, enabled: r.enabled, status: r.status,
        webhook_url: r.webhook_url, webhook_verified: r.webhook_verified,
        last_tested: r.last_tested, last_sync: r.last_sync,
        test_result: r.test_result, extra_fields: maskedExtra,
        has_key: !!r.api_key_encrypted, updated_at: r.updated_at,
      };
    }

    const apiMap: Record<string, any> = {};
    for (const r of apiRows.rows) { apiMap[r.provider] = r; }

    const managed = [
      { platform: "whatsapp_botbee", group: "WhatsApp", name: "WhatsApp BotBee (Active)", apiKey: "botbee" },
      { platform: "fast2sms", group: "SMS", name: "Fast2SMS", apiKey: "fast2sms" },
      { platform: "smtp_email", group: "Email", name: "SMTP Email", apiKey: "smtp" },
      { platform: "firebase_push", group: "Push", name: "Firebase FCM", apiKey: "firebase" },
      { platform: "lemin_rcs", group: "RCS", name: "Lemin RCS", apiKey: "lemin" },
    ];

    const managedPlatforms = managed.map(m => {
      const api = apiMap[m.apiKey] || {};
      return {
        platform: m.platform, group: m.group, name: m.name,
        managed: true, managed_by: "api_settings", managed_provider: m.apiKey,
        enabled: api.enabled !== false,
        status: api.enabled !== false ? (api.status || "connected") : "disconnected",
        last_tested: api.last_tested,
      };
    });

    const website = [
      "website_contact", "website_booking", "website_support",
      "website_inquiry", "website_livechat", "website_ai_chat",
    ].map(p => ({
      platform: p, group: "Website",
      name: p.replace("website_", "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      builtin: true, enabled: true, status: "connected",
    }));

    const custom = Object.values(smMap).map((s: any) => {
      const meta = PLATFORM_META[s.platform as keyof typeof PLATFORM_META];
      return { ...s, group: meta?.group ?? "Other", name: meta?.name ?? s.platform };
    });

    res.json({ managed: managedPlatforms, website, custom });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/social-media/platforms/:platform ────────────────────────────────
router.get("/platforms/:platform", requireAdmin as any, async (req, res) => {
  try {
    const { platform } = req.params;
    const r = await pool.query(`SELECT * FROM social_platform_configs WHERE platform=$1`, [platform]);
    if (!r.rows[0]) return void res.json({ platform, configured: false, extra_fields: {} });
    const row = r.rows[0];
    const extra = decryptExtra(row.extra_fields_encrypted);
    const meta = PLATFORM_META[platform as keyof typeof PLATFORM_META];
    const maskedExtra: Record<string, string> = {};
    for (const [k, v] of Object.entries(extra)) {
      maskedExtra[k] = meta?.sensitiveFields?.includes(k) ? maskVal(String(v)) : String(v ?? "");
    }
    res.json({
      platform, configured: true, enabled: row.enabled, status: row.status,
      webhook_url: row.webhook_url, webhook_verified: row.webhook_verified,
      last_tested: row.last_tested, test_result: row.test_result, extra_fields: maskedExtra,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── PUT /api/social-media/platforms/:platform ────────────────────────────────
router.put("/platforms/:platform", requireAdmin as any, async (req, res) => {
  try {
    const { platform } = req.params;
    if (!PLATFORM_META[platform as keyof typeof PLATFORM_META]) {
      return void res.status(400).json({ message: "Unknown platform" });
    }
    const { enabled, extra_fields } = req.body;
    const existing = await pool.query(`SELECT * FROM social_platform_configs WHERE platform=$1`, [platform]);
    const existingRow = existing.rows[0];
    let existingExtra: Record<string, any> = decryptExtra(existingRow?.extra_fields_encrypted);
    const newExtra: Record<string, any> = { ...existingExtra };
    if (extra_fields && typeof extra_fields === "object") {
      for (const [k, v] of Object.entries(extra_fields as Record<string, string>)) {
        const val = String(v ?? "").trim();
        if (val && !val.startsWith("••")) newExtra[k] = val;
      }
    }
    const encExtra = encrypt(JSON.stringify(newExtra));
    const apiKey = newExtra.bot_token || newExtra.access_token || newExtra.page_access_token || newExtra.api_key;
    const encKey = apiKey ? encrypt(apiKey) : existingRow?.api_key_encrypted ?? null;
    const webhookBase = `https://alburhantravels.com`;
    const meta = PLATFORM_META[platform as keyof typeof PLATFORM_META];
    const webhookUrl = meta?.webhookPath ? `${webhookBase}${meta.webhookPath}` : null;
    const isEnabled = enabled !== undefined ? Boolean(enabled) : (existingRow?.enabled ?? false);
    if (existingRow) {
      await pool.query(
        `UPDATE social_platform_configs SET enabled=$1,extra_fields_encrypted=$2,api_key_encrypted=$3,webhook_url=$4,status=$5,updated_at=NOW() WHERE platform=$6`,
        [isEnabled, encExtra, encKey, webhookUrl, isEnabled ? "configured" : "disconnected", platform]
      );
    } else {
      await pool.query(
        `INSERT INTO social_platform_configs (platform,enabled,extra_fields_encrypted,api_key_encrypted,webhook_url,status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [platform, isEnabled, encExtra, encKey, webhookUrl, isEnabled ? "configured" : "disconnected"]
      );
    }
    res.json({ ok: true, message: `${meta.name} configuration saved.` });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/social-media/platforms/:platform/test ──────────────────────────
router.post("/platforms/:platform/test", requireAdmin as any, async (req, res) => {
  const { platform } = req.params;
  try {
    const r = await pool.query(`SELECT * FROM social_platform_configs WHERE platform=$1`, [platform]);
    const row = r.rows[0];
    if (!row) return void res.status(404).json({ ok: false, message: "Platform not configured" });
    const extra = decryptExtra(row.extra_fields_encrypted);
    let testResult: { ok: boolean; message: string; detail?: any } = { ok: false, message: "Test not implemented" };

    if (platform === "telegram_bot" || platform === "telegram_channel") {
      const token = extra.bot_token;
      if (!token) { testResult = { ok: false, message: "Bot token not configured" }; }
      else {
        try {
          const resp = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10000 });
          if (resp.data?.ok) {
            const bot = resp.data.result;
            testResult = { ok: true, message: `✅ Connected to @${bot.username} (${bot.first_name})`, detail: bot };
          } else { testResult = { ok: false, message: "Telegram API error", detail: resp.data }; }
        } catch (e: any) { testResult = { ok: false, message: `Telegram error: ${e?.response?.data?.description || e?.message}` }; }
      }
    } else if (["facebook_page","facebook_messenger","facebook_leads","instagram","instagram_dm"].includes(platform)) {
      const token = extra.page_access_token;
      if (!token) { testResult = { ok: false, message: "Page access token not configured" }; }
      else {
        try {
          const resp = await axios.get(`https://graph.facebook.com/v19.0/me`, { params: { access_token: token, fields: "id,name,category" }, timeout: 10000 });
          testResult = { ok: true, message: `✅ Connected: ${resp.data.name}`, detail: resp.data };
        } catch (e: any) { testResult = { ok: false, message: `Meta error: ${e?.response?.data?.error?.message || e?.message}` }; }
      }
    } else if (platform === "whatsapp_meta") {
      const token = extra.access_token;
      const phoneId = extra.phone_number_id;
      if (!token || !phoneId) { testResult = { ok: false, message: "Access token and Phone Number ID required" }; }
      else {
        try {
          const resp = await axios.get(`https://graph.facebook.com/v19.0/${phoneId}`, { params: { access_token: token }, timeout: 10000 });
          testResult = { ok: true, message: `✅ WhatsApp: ${resp.data.display_phone_number || phoneId}`, detail: resp.data };
        } catch (e: any) { testResult = { ok: false, message: `Meta error: ${e?.response?.data?.error?.message || e?.message}` }; }
      }
    } else if (platform === "firebase") {
      const serverKey = extra.server_key;
      if (!serverKey) { testResult = { ok: false, message: "Firebase Server Key not configured" }; }
      else {
        try {
          const resp = await axios.post("https://fcm.googleapis.com/fcm/send",
            { registration_ids: ["test_dry_run"], dry_run: true },
            { headers: { Authorization: `key=${serverKey}`, "Content-Type": "application/json" }, timeout: 8000 }
          );
          testResult = { ok: true, message: "✅ Firebase Server Key valid", detail: resp.data };
        } catch (e: any) {
          testResult = e?.response?.status === 401
            ? { ok: false, message: "Invalid Firebase Server Key (401)" }
            : { ok: false, message: `Firebase error: ${e?.message}` };
        }
      }
    } else {
      testResult = { ok: true, message: "Configuration saved. Live test not available for this platform." };
    }

    await pool.query(`UPDATE social_platform_configs SET status=$1,last_tested=NOW(),test_result=$2 WHERE platform=$3`,
      [testResult.ok ? "connected" : "error", JSON.stringify(testResult), platform]);
    res.json({ ...testResult, platform, tested_at: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// ── POST /api/social-media/platforms/:platform/disconnect ────────────────────
router.post("/platforms/:platform/disconnect", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE social_platform_configs SET enabled=false,status='disconnected',updated_at=NOW() WHERE platform=$1`, [req.params.platform]);
    res.json({ ok: true, message: "Platform disconnected" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Assignment Rules ──────────────────────────────────────────────────────────
router.get("/assignment-rules", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM lead_assignment_rules ORDER BY platform`);
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

router.put("/assignment-rules/:platform", requireAdmin as any, async (req, res) => {
  try {
    const { platform } = req.params;
    const { assigned_name, assigned_to, branch_name, auto_reply_text, is_active } = req.body;
    const existing = await pool.query(`SELECT id FROM lead_assignment_rules WHERE platform=$1`, [platform]);
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE lead_assignment_rules SET assigned_name=$1,assigned_to=$2,branch_name=$3,auto_reply_text=$4,is_active=$5,updated_at=NOW() WHERE platform=$6`,
        [assigned_name||null, assigned_to||null, branch_name||null, auto_reply_text||null, is_active!==false, platform]
      );
    } else {
      await pool.query(
        `INSERT INTO lead_assignment_rules (platform,assigned_name,assigned_to,branch_name,auto_reply_text,is_active) VALUES ($1,$2,$3,$4,$5,$6)`,
        [platform, assigned_name||null, assigned_to||null, branch_name||null, auto_reply_text||null, is_active!==false]
      );
    }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/social-media/messages ──────────────────────────────────────────
router.get("/messages", requireAdmin as any, async (req, res) => {
  try {
    const { platform, status, limit = "50", offset = "0" } = req.query as any;
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (platform && platform !== "all") { params.push(platform); where += ` AND m.platform=$${params.length}`; }
    if (status && status !== "all") { params.push(status); where += ` AND m.status=$${params.length}`; }
    params.push(parseInt(limit)); params.push(parseInt(offset));
    const msgs = await pool.query(
      `SELECT m.*, l.name as lead_name, l.status as lead_status
       FROM social_messages m LEFT JOIN leads l ON l.id=m.lead_text_id
       ${where} ORDER BY m.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    const countR = await pool.query(`SELECT COUNT(*) FROM social_messages m ${where.replace(/LIMIT.*|OFFSET.*/g,"")}`,
      params.slice(0, params.length - 2));
    res.json({ messages: msgs.rows, total: parseInt(countR.rows[0].count) });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/social-media/messages/:id/assign ───────────────────────────────
router.post("/messages/:id/assign", requireAdmin as any, async (req, res) => {
  try {
    const { user_id, status, notes } = req.body;
    await pool.query(`UPDATE social_messages SET assigned_to=$1,status=$2,notes=$3 WHERE id=$4`,
      [user_id||null, status||"in_progress", notes||null, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/social-media/analytics ─────────────────────────────────────────
router.get("/analytics", requireAdmin as any, async (_req, res) => {
  try {
    const [platforms, msgs, msgsByPlat, notifStats, leadsBySource] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='connected') as connected, COUNT(*) as total FROM social_platform_configs`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='unread') as unread, COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '24h') as today FROM social_messages`),
      pool.query(`SELECT platform, COUNT(*) as count FROM social_messages GROUP BY platform ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT channel::text, COUNT(*) as total, COUNT(*) FILTER (WHERE status='sent') as sent, COUNT(*) FILTER (WHERE status='failed') as failed FROM notification_logs WHERE created_at>=NOW()-INTERVAL '7d' GROUP BY channel`),
      pool.query(`SELECT source, COUNT(*) as count FROM leads WHERE created_at>=NOW()-INTERVAL '30d' GROUP BY source ORDER BY count DESC`),
    ]);
    const totalConnected = parseInt(platforms.rows[0]?.connected||"0") + 11; // +6 website +5 managed
    res.json({
      platforms: { connected: totalConnected, total_configured: parseInt(platforms.rows[0]?.total||"0") + 11 },
      messages: msgs.rows[0], byPlatform: msgsByPlat.rows,
      notifications: notifStats.rows, leadsBySource: leadsBySource.rows,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Webhook: Telegram ────────────────────────────────────────────────────────
router.post("/webhook/telegram", async (req, res) => {
  res.json({ ok: true });
  try {
    const update = req.body;
    const msg = update.message || update.edited_message || update.channel_post;
    if (!msg) return;
    const senderName = msg.from ? `${msg.from.first_name||""} ${msg.from.last_name||""}`.trim() : "Telegram User";
    const text = msg.text || msg.caption || "[media]";
    const chatId = String(msg.chat?.id);

    const insertR = await pool.query(`
      INSERT INTO social_messages (platform,message_id,sender_id,sender_name,sender_phone,message_text,message_type,raw_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING RETURNING id
    `, [
      "telegram_bot", String(update.update_id), chatId, senderName,
      msg.from?.username ? `@${msg.from.username}` : null, text,
      msg.photo ? "photo" : msg.document ? "document" : msg.voice ? "voice" : "text",
      JSON.stringify(update),
    ]);

    if (insertR.rows[0]) {
      await autoCreateLeadFromMessage({
        id: insertR.rows[0].id,
        platform: "telegram_bot",
        sender_id: chatId,
        sender_name: senderName,
        sender_phone: msg.from?.username ? `@${msg.from.username}` : undefined,
        message_text: text,
      });
    }
  } catch (e: any) { console.error("[SocialMedia] Telegram webhook error:", e.message); }
});

// ── Webhook: Meta (Facebook / Instagram) ────────────────────────────────────
router.get("/webhook/meta", async (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const rows = await pool.query(
      `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta') AND enabled=true`
    );
    let verified = false;
    for (const row of rows.rows) {
      const extra = decryptExtra(row.extra_fields_encrypted);
      if (mode === "subscribe" && token && token === extra.webhook_verify_token) { verified = true; break; }
    }
    if (verified) {
      await pool.query(`UPDATE social_platform_configs SET webhook_verified=true WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta') AND enabled=true`);
      return void res.status(200).send(challenge);
    }
    res.status(403).json({ error: "Verification failed" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/webhook/meta", async (req, res) => {
  res.json({ ok: true });
  try {
    const body = req.body;
    const object = body.object;
    for (const entry of (body.entry || [])) {
      // Messenger / Instagram DMs
      for (const event of (entry.messaging || [])) {
        if (!event.message) continue;
        const platform = object === "instagram" ? "instagram_dm" : "facebook_messenger";
        const insertR = await pool.query(`
          INSERT INTO social_messages (platform,message_id,sender_id,message_text,message_type,raw_data)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id
        `, [platform, event.message.mid || String(Date.now()), String(event.sender?.id),
            event.message.text || "[attachment]", event.message.attachments ? "attachment" : "text", JSON.stringify(event)]);
        if (insertR.rows[0]) {
          await autoCreateLeadFromMessage({
            id: insertR.rows[0].id, platform,
            sender_id: String(event.sender?.id),
            sender_name: undefined,
            message_text: event.message.text || "[attachment]",
          });
        }
      }
      // Lead Ads
      for (const change of (entry.changes || [])) {
        if (change.field === "leadgen" && change.value) {
          const insertR = await pool.query(`
            INSERT INTO social_messages (platform,message_id,sender_id,message_text,message_type,raw_data)
            VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id
          `, ["facebook_leads", String(change.value.leadgen_id||Date.now()),
              String(change.value.page_id||"unknown"), `Lead from form ${change.value.form_id}`, "lead", JSON.stringify(change.value)]);
          if (insertR.rows[0]) {
            await autoCreateLeadFromMessage({
              id: insertR.rows[0].id, platform: "facebook_leads",
              sender_id: String(change.value.page_id||Date.now()),
              message_text: `Facebook Lead Ad submission — Form ${change.value.form_id}`,
            });
          }
        }
      }
    }
  } catch (e: any) { console.error("[SocialMedia] Meta webhook error:", e.message); }
});

// ── POST /api/social-media/telegram/set-webhook ──────────────────────────────
router.post("/telegram/set-webhook", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM social_platform_configs WHERE platform='telegram_bot'`);
    if (!r.rows[0]) return void res.status(404).json({ ok: false, message: "Telegram not configured" });
    const extra = decryptExtra(r.rows[0].extra_fields_encrypted);
    const token = extra.bot_token;
    if (!token) return void res.status(400).json({ ok: false, message: "Bot token not configured" });
    const webhookUrl = "https://alburhantravels.com/api/social-media/webhook/telegram";
    const resp = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url: webhookUrl,
      secret_token: extra.webhook_secret || undefined,
      allowed_updates: ["message", "edited_message", "channel_post"],
    }, { timeout: 10000 });
    if (resp.data?.ok) {
      await pool.query(`UPDATE social_platform_configs SET webhook_url=$1,webhook_verified=true WHERE platform='telegram_bot'`, [webhookUrl]);
      res.json({ ok: true, message: `✅ Telegram webhook set: ${webhookUrl}`, detail: resp.data });
    } else {
      res.json({ ok: false, message: "Telegram webhook failed", detail: resp.data });
    }
  } catch (e: any) { res.status(500).json({ ok: false, message: e?.response?.data?.description || e?.message }); }
});

// ── POST /api/social-media/website-inquiry ──────────────────────────────────
// Called by website contact/inquiry forms to auto-create a lead
router.post("/website-inquiry", async (req, res) => {
  try {
    const { name, mobile, email, message, platform = "website_contact", package_interest } = req.body;
    if (!name?.trim()) return void res.status(400).json({ error: "Name required" });
    const msgId = `web_${Date.now()}`;
    const insertR = await pool.query(`
      INSERT INTO social_messages (platform,message_id,sender_name,sender_phone,message_text,message_type)
      VALUES ($1,$2,$3,$4,$5,'text') RETURNING id
    `, [platform, msgId, name, mobile||null, message||`Inquiry from ${name}`]);
    const leadId = await autoCreateLeadFromMessage({
      id: insertR.rows[0].id, platform,
      sender_id: email || mobile || msgId,
      sender_name: name, sender_phone: mobile,
      message_text: message || `New inquiry from ${name}`,
    });
    // Also set email and package if provided
    if (leadId && (email || package_interest)) {
      await pool.query(`UPDATE leads SET email=COALESCE($1,email), package_interest=COALESCE($2,package_interest) WHERE id=$3`,
        [email||null, package_interest||null, leadId]);
    }
    res.json({ ok: true, lead_id: leadId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
