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
  // Add missing columns (safe ALTERs)
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS lead_text_id TEXT`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'incoming'`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS reply_text TEXT`);
  // Back-fill existing rows so direction-based queries work
  await pool.query(`UPDATE social_messages SET direction='incoming' WHERE direction IS NULL`);

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
    // ── Token validation for Meta platforms ────────────────────────────────
    const META_PLATFORMS = ["facebook_page","facebook_messenger","facebook_leads","instagram","instagram_dm","whatsapp_meta"];
    if (META_PLATFORMS.includes(platform)) {
      const newFbToken = extra_fields?.page_access_token && !String(extra_fields.page_access_token).startsWith("••") ? String(extra_fields.page_access_token) : null;
      const newWaToken = extra_fields?.access_token && !String(extra_fields.access_token).startsWith("••") ? String(extra_fields.access_token) : null;
      const tokenToValidate = newFbToken || newWaToken;
      if (tokenToValidate) {
        try {
          const GRAPH = "https://graph.facebook.com/v19.0";
          const checkUrl = platform === "whatsapp_meta" && newExtra.phone_number_id
            ? `${GRAPH}/${newExtra.phone_number_id}?fields=id,display_phone_number&access_token=${tokenToValidate}`
            : `${GRAPH}/me?fields=id,name&access_token=${tokenToValidate}`;
          await axios.get(checkUrl, { timeout: 8000 });
        } catch (vErr: any) {
          const apiErr = vErr?.response?.data?.error;
          if (apiErr?.code === 190 || apiErr?.code === 102 || apiErr?.type === "OAuthException") {
            return void res.status(422).json({
              message: `❌ Token validation failed: ${apiErr.message}`,
              error_code: apiErr.code,
              hint: "Generate a new long-lived Page Access Token from Meta Business Suite → Settings → Advanced → Page Access Token.",
            });
          }
          // Network errors or unknown — allow save with a warning
        }
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
router.get("/webhook/telegram", (_req, res) => {
  res.json({ ok: true, service: "telegram-webhook", status: "active" });
});
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
      INSERT INTO social_messages (platform,message_id,sender_id,sender_name,sender_phone,message_text,message_type,raw_data,direction)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'incoming')
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
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;

  if (!mode || !token || !challenge) {
    return void res.status(400).send("Missing hub parameters");
  }
  if (mode !== "subscribe") {
    return void res.status(403).send("Forbidden");
  }

  // ── Primary: compare against META_VERIFY_TOKEN env var ────────────────────
  const envToken = (process.env.META_VERIFY_TOKEN || "").trim();
  if (envToken && token === envToken) {
    // Mark all whatsapp_meta configs verified in DB (best-effort, non-blocking)
    pool.query(
      `UPDATE social_platform_configs SET webhook_verified=true WHERE platform='whatsapp_meta'`
    ).catch(() => {});
    res.setHeader("Content-Type", "text/plain");
    return void res.status(200).send(challenge);
  }

  // ── Secondary: compare against DB-stored webhook_verify_token ─────────────
  try {
    const rows = await pool.query(
      `SELECT extra_fields_encrypted FROM social_platform_configs
       WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')
       AND enabled=true`
    );
    for (const row of rows.rows) {
      const extra = decryptExtra(row.extra_fields_encrypted);
      if (token === extra?.webhook_verify_token) {
        await pool.query(
          `UPDATE social_platform_configs SET webhook_verified=true
           WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')
           AND enabled=true`
        );
        res.setHeader("Content-Type", "text/plain");
        return void res.status(200).send(challenge);
      }
    }
  } catch (_) {}

  res.status(403).send("Forbidden");
});

router.post("/webhook/meta", async (req, res) => {
  res.json({ ok: true });
  try {
    // Optional webhook signature verification
    const sig = req.headers["x-hub-signature-256"] as string | undefined;
    if (sig) {
      try {
        const { verifyMetaWebhookSignature } = await import("../lib/metaWapi.js");
        const rawBody = JSON.stringify(req.body);
        if (!verifyMetaWebhookSignature(rawBody, sig)) {
          console.warn("[SocialMedia] Meta webhook signature mismatch — processing anyway (configure META_WEBHOOK_SECRET to enforce)");
        }
      } catch {}
    }

    const body = req.body;
    const object = body.object;
    for (const entry of (body.entry || [])) {
      // ── WhatsApp Cloud API: delivery status + incoming messages ─────────────
      for (const change of (entry.changes || [])) {
        if (change.field === "messages" && change.value?.messaging_product === "whatsapp") {
          // Delivery status callbacks: sent, delivered, read, failed
          const statuses = change.value.statuses || [];
          if (statuses.length > 0) {
            try {
              const { updateMetaDeliveryStatus } = await import("../lib/metaWapi.js");
              for (const st of statuses) {
                await updateMetaDeliveryStatus(
                  st.id,
                  st.status,
                  st.timestamp,
                  st.conversation?.id,
                  st.errors?.[0]?.code,
                  st.errors?.[0]?.title,
                  st
                ).catch(() => {});
                console.log(`[MetaWebhook] delivery: wamid=${st.id} status=${st.status}`);
              }
            } catch (e: any) { console.error("[MetaWebhook] delivery status error:", e.message); }
          }
          // Incoming WhatsApp messages (log for CRM)
          const messages = change.value.messages || [];
          for (const msg of messages) {
            await pool.query(`
              INSERT INTO social_messages (platform, message_id, sender_id, message_text, message_type, raw_data, direction)
              VALUES ('whatsapp_cloud', $1, $2, $3, $4, $5, 'incoming')
              ON CONFLICT DO NOTHING
            `, [
              msg.id || String(Date.now()),
              String(msg.from || "unknown"),
              msg.text?.body || msg.caption || "[attachment]",
              msg.type || "text",
              JSON.stringify(msg),
            ]).catch(() => {});
          }
          continue; // handled — don't fall through to leadgen check
        }

        // Lead Ads
        if (change.field === "leadgen" && change.value) {
          const insertR = await pool.query(`
            INSERT INTO social_messages (platform,message_id,sender_id,message_text,message_type,raw_data,direction)
            VALUES ($1,$2,$3,$4,$5,$6,'incoming') ON CONFLICT DO NOTHING RETURNING id
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

      // Messenger / Instagram DMs
      for (const event of (entry.messaging || [])) {
        if (!event.message) continue;
        const platform = object === "instagram" ? "instagram_dm" : "facebook_messenger";
        const insertR = await pool.query(`
          INSERT INTO social_messages (platform,message_id,sender_id,message_text,message_type,raw_data,direction)
          VALUES ($1,$2,$3,$4,$5,$6,'incoming') ON CONFLICT DO NOTHING RETURNING id
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

// ── GET /api/social-media/meta/health ────────────────────────────────────────
// Full end-to-end Meta Graph API verification: every test makes a REAL API call
// and returns status_code, raw_response, error_code, error_type, and a fix hint.
router.get("/meta/health", requireAdmin as any, async (_req, res) => {
  const GRAPH = "https://graph.facebook.com/v19.0";
  const WEBHOOK_URL = "https://alburhantravels.com/api/social-media/webhook/meta";
  const TO = 10000;

  // ── Load all Meta platform configs ─────────────────────────────────────────
  const cfgRows = await pool.query(
    `SELECT platform, extra_fields_encrypted, api_key_encrypted, webhook_verified
     FROM social_platform_configs
     WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')`
  );
  const cfgMap: Record<string, any> = {};
  for (const row of cfgRows.rows) {
    const extra = decryptExtra(row.extra_fields_encrypted);
    const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null;
    cfgMap[row.platform] = { ...extra, _apiKey: apiKey, webhook_verified: row.webhook_verified };
  }

  const fbToken = cfgMap["facebook_page"]?.page_access_token || cfgMap["facebook_messenger"]?.page_access_token
    || cfgMap["facebook_leads"]?.page_access_token || cfgMap["instagram"]?.page_access_token || cfgMap["instagram_dm"]?.page_access_token;
  const fbPageId = cfgMap["facebook_page"]?.page_id || cfgMap["facebook_messenger"]?.page_id || cfgMap["facebook_leads"]?.page_id;
  const fbAppId = cfgMap["facebook_page"]?.app_id || cfgMap["facebook_messenger"]?.app_id;
  const fbAppSecret = cfgMap["facebook_page"]?.app_secret || cfgMap["facebook_messenger"]?.app_secret;
  const igId = cfgMap["instagram"]?.instagram_account_id || cfgMap["instagram_dm"]?.instagram_account_id;
  const waToken = cfgMap["whatsapp_meta"]?.access_token || cfgMap["whatsapp_meta"]?._apiKey;
  const waPhoneId = cfgMap["whatsapp_meta"]?.phone_number_id;
  const waWabaId = cfgMap["whatsapp_meta"]?.waba_id;
  const webhookVerifyToken = cfgMap["facebook_page"]?.webhook_verify_token || cfgMap["whatsapp_meta"]?.webhook_verify_token;
  const appAccessToken = fbAppId && fbAppSecret ? `${fbAppId}|${fbAppSecret}` : null;

  const tests: any[] = [];

  // ── Helper: run one real API test ──────────────────────────────────────────
  type TestOpts = {
    id: string; name: string; category: string; endpoint: string;
    skip?: string | null;
    run: () => Promise<Response>;
    onResult?: (ok: boolean, data: any, t: any) => void;
    fix_error?: (errCode: number, errType: string | null, errMsg: string) => string;
  };

  function defaultFix(code: number, type: string | null, id: string): string {
    if (type === "OAuthException" || code === 190 || code === 102)
      return "Token expired or revoked. Go to Meta Business Suite → Settings → Advanced → Page Access Token. Click 'Generate Token' for your Page and save it here.";
    if (code === 10 || code === 200 || code === 230)
      return "Permission denied. Add the required permission in Meta App → App Review → Permissions, then re-generate your token.";
    if (code === 100)
      return "Invalid parameter — check the Page ID or Instagram Account ID in your platform settings matches the actual Meta ID.";
    if (code === 104)
      return "No access token provided — ensure the token field is saved in the platform config.";
    if (code === 803)
      return "Object does not exist — the ID configured is wrong. Open Meta Business Manager and copy the correct numeric ID.";
    if (code === 368)
      return "Account restricted — check your Meta Business account for policy violations in Meta Business Suite.";
    if (id.startsWith("wa_"))
      return "WhatsApp: verify Phone Number ID and System User access token in Meta Business Manager → WhatsApp Manager → Phone Numbers.";
    if (id.startsWith("ig_"))
      return "Instagram: ensure the account is a Business Account linked to your Facebook Page. Check Instagram → Professional Dashboard for the numeric Account ID.";
    if (id.startsWith("leads_"))
      return "Lead Ads: add 'leads_retrieval' permission to your Meta App. Ensure the Page has lead forms.";
    return "Open Meta App Dashboard → Tools → Graph API Explorer and test this endpoint manually.";
  }

  async function runTest(opts: TestOpts): Promise<any> {
    if (opts.skip) {
      const t = { id: opts.id, name: opts.name, category: opts.category, endpoint: opts.endpoint,
        ok: false, skipped: true, skip_reason: opts.skip, duration_ms: 0 };
      tests.push(t);
      return t;
    }
    const t0 = Date.now();
    const t: any = { id: opts.id, name: opts.name, category: opts.category, endpoint: opts.endpoint,
      ok: false, skipped: false };
    try {
      const resp = await opts.run();
      t.duration_ms = Date.now() - t0;
      t.status_code = resp.status;
      const bodyText = await resp.text();
      let raw: any;
      try { raw = JSON.parse(bodyText); } catch { raw = { _raw: bodyText.slice(0, 500) }; }
      // Trim large arrays
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const trimmed: any = {};
        for (const k of Object.keys(raw)) {
          const v = raw[k];
          trimmed[k] = Array.isArray(v) ? v.slice(0, 3) : v;
        }
        t.raw_response = trimmed;
      } else {
        t.raw_response = raw;
      }
      if (raw?.error) {
        t.error = raw.error.message;
        t.error_code = raw.error.code;
        t.error_subcode = raw.error.error_subcode;
        t.error_type = raw.error.type;
        t.ok = false;
        t.fix = opts.fix_error ? opts.fix_error(raw.error.code, raw.error.type, raw.error.message) : defaultFix(raw.error.code, raw.error.type, opts.id);
        if (opts.onResult) opts.onResult(false, raw, t);
      } else if (!resp.ok && resp.status >= 400) {
        t.error = `HTTP ${resp.status}`;
        t.ok = false;
        t.fix = opts.fix_error ? opts.fix_error(resp.status, null, "") : defaultFix(resp.status, null, opts.id);
        if (opts.onResult) opts.onResult(false, raw, t);
      } else {
        t.ok = true;
        if (opts.onResult) opts.onResult(true, raw, t);
      }
    } catch (e: any) {
      t.duration_ms = Date.now() - t0;
      t.error = e.message;
      t.ok = false;
      t.fix = "Network error — ensure the server can reach graph.facebook.com (check DNS and firewall).";
    }
    tests.push(t);
    return t;
  }

  // ══════════ OAUTH TESTS ═══════════════════════════════════════════════════

  await runTest({
    id: "oauth_app", name: "Meta App Credentials", category: "OAuth",
    endpoint: `GET /${fbAppId || "{app_id}"}?fields=name,category`,
    skip: !fbAppId || !fbAppSecret ? "App ID or App Secret not configured — add them in Facebook Page platform settings" : null,
    run: () => fetch(`${GRAPH}/${fbAppId}?fields=name,category,link&access_token=${appAccessToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { app_name: d.name, category: d.category }; },
  });

  const fbDebugResult = await runTest({
    id: "oauth_fb_debug", name: "Facebook Token — /debug_token", category: "OAuth",
    endpoint: "GET /debug_token?input_token={fb_token}",
    skip: !fbToken ? "Facebook Page Access Token not configured" : !appAccessToken ? "App ID + Secret required for debug_token" : null,
    run: () => fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(fbToken!)}&access_token=${encodeURIComponent(appAccessToken!)}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (!ok) return;
      const td = d.data;
      t.data = {
        is_valid: td?.is_valid,
        type: td?.type,
        app_id: td?.app_id,
        expires_at: td?.expires_at === 0 ? "never (page token)" : td?.expires_at ? new Date(td.expires_at * 1000).toISOString() : null,
        issued_at: td?.issued_at ? new Date(td.issued_at * 1000).toISOString() : null,
        scopes: td?.scopes || [],
        granted_scopes_count: (td?.scopes || []).length,
        token_error: td?.error?.message || null,
      };
      if (!td?.is_valid) {
        t.ok = false;
        t.error = td?.error?.message || "Token is_valid=false";
        t.error_type = "OAuthException";
        t.fix = "Facebook token is invalid or revoked. Re-generate in Meta Business Suite → Settings → Advanced → Page Access Token.";
      }
    },
    fix_error: () => "Cannot call /debug_token — check App ID and App Secret are correct and the app is in Live mode.",
  });

  await runTest({
    id: "oauth_wa_debug", name: "WhatsApp Token — /debug_token", category: "OAuth",
    endpoint: "GET /debug_token?input_token={wa_token}",
    skip: !waToken ? "WhatsApp Cloud API access token not configured" : !appAccessToken ? "App ID + Secret required" : null,
    run: () => fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(waToken!)}&access_token=${encodeURIComponent(appAccessToken!)}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (!ok) return;
      const td = d.data;
      t.data = { is_valid: td?.is_valid, type: td?.type, expires_at: td?.expires_at === 0 ? "never" : td?.expires_at ? new Date(td.expires_at * 1000).toISOString() : null, scopes: td?.scopes || [] };
      if (!td?.is_valid) { t.ok = false; t.error = td?.error?.message || "Token is_valid=false"; t.fix = "WhatsApp token expired — create a new System User token in Meta Business Manager → System Users → Generate Token."; }
    },
    fix_error: () => "Cannot inspect WhatsApp token — check App ID and App Secret are correct.",
  });

  // ══════════ FACEBOOK PAGE TESTS ═══════════════════════════════════════════

  let discoveredPageId = fbPageId;

  const fbMeResult = await runTest({
    id: "fb_me", name: "Facebook — GET /me (Token + Page Identity)", category: "Facebook",
    endpoint: "GET /me?fields=id,name",
    skip: !fbToken ? "Facebook Page Access Token not configured — see Setup Guide below" : null,
    run: () => fetch(`${GRAPH}/me?fields=id,name&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (!ok) return;
      discoveredPageId = d.id || discoveredPageId;
      t.data = { page_id: d.id, page_name: d.name };
      // Detect if this is a User token (not a Page token) — page tokens return the page name, user tokens return a person name
      if (d.id && !d.name?.toLowerCase().includes("tour") && !d.name?.toLowerCase().includes("travel") && !d.name?.toLowerCase().includes("hajj") && !d.name?.toLowerCase().includes("umrah") && !d.name?.toLowerCase().includes("al burhan")) {
        t.ok = false;
        t.error = `This appears to be a User Access Token for "${d.name}" (user ID: ${d.id}), not a Facebook Page Access Token. Page tokens return the Page name, not a person's name. See Setup Guide to generate the correct token.`;
        t.fix = "In Graph API Explorer: (1) Select your App, (2) click 'Get User or Page Access Token', (3) check ALL page permissions, (4) change the dropdown from 'User Token' to your Page name. The token next to your Page name is the Page Access Token.";
        discoveredPageId = null; // reset — this page ID is a user ID, not a page ID
      }
    },
    fix_error: (c, tp) => defaultFix(c, tp, "fb_me"),
  });

  await runTest({
    id: "fb_page", name: "Facebook — GET /{page_id} (Full Page Details)", category: "Facebook",
    endpoint: `GET /${discoveredPageId || "{page_id}"}?fields=id,name,about,fan_count,followers_count,website,link`,
    skip: !fbToken ? "No token" : !discoveredPageId ? "Page ID unknown — fb_me must succeed first" : null,
    run: () => fetch(`${GRAPH}/${discoveredPageId}?fields=id,name,about,fan_count,followers_count,category,website,verification_status,link&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { page_name: d.name, fans: d.fan_count, followers: d.followers_count, website: d.website, link: d.link }; },
    fix_error: (c, tp) => defaultFix(c, tp, "fb_page"),
  });

  await runTest({
    id: "fb_conversations", name: "Facebook — GET /{page_id}/conversations (Messenger Threads)", category: "Facebook",
    endpoint: `GET /${discoveredPageId || "{page_id}"}/conversations?limit=5`,
    skip: !fbToken ? "No token" : !discoveredPageId ? "Page ID required" : !fbMeResult.ok ? "fb_me failed — token invalid, skip dependent tests" : null,
    run: () => fetch(`${GRAPH}/${discoveredPageId}/conversations?limit=5&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { thread_count: d.data?.length ?? 0, total: d.summary?.total_count }; },
    fix_error: (c, tp) => {
      if (c === 10 || c === 200) return "Missing permission 'pages_messaging'. Add it in Meta App → App Review → Permissions and re-generate the token.";
      return defaultFix(c, tp, "fb_conversations");
    },
  });

  await runTest({
    id: "fb_feed", name: "Facebook — GET /{page_id}/feed (Page Posts)", category: "Facebook",
    endpoint: `GET /${discoveredPageId || "{page_id}"}/feed?limit=5&fields=id,message,story,created_time`,
    skip: !fbToken ? "No token" : !discoveredPageId ? "Page ID required" : null,
    run: () => fetch(`${GRAPH}/${discoveredPageId}/feed?limit=5&fields=id,message,story,created_time&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (ok) t.data = { post_count: d.data?.length ?? 0, sample: (d.data || []).slice(0, 2).map((p: any) => ({ id: p.id, preview: (p.message || p.story || "").slice(0, 80) })) };
    },
    fix_error: (c, tp) => {
      if (c === 10) return "Missing permission 'pages_read_user_content'. Add it in Meta App → App Review.";
      return defaultFix(c, tp, "fb_feed");
    },
  });

  let subscribedFields: string[] = [];
  await runTest({
    id: "fb_subscribed_apps", name: "Facebook — GET /me/subscribed_apps (Webhook Fields)", category: "Facebook",
    endpoint: "GET /me/subscribed_apps",
    skip: !fbToken ? "No token" : null,
    run: () => fetch(`${GRAPH}/me/subscribed_apps?access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (!ok) return;
      subscribedFields = d.data?.[0]?.subscribed_fields || [];
      const required = ["messages", "messaging_postbacks", "message_deliveries", "leadgen", "feed"];
      const missing = required.filter((f: string) => !subscribedFields.includes(f));
      t.data = { subscribed_fields: subscribedFields, missing_required: missing };
      if (missing.length > 0) {
        t.ok = false;
        t.error = `Missing required webhook fields: ${missing.join(", ")}`;
        t.fix = `Click 'Subscribe All Webhook Fields' to add: ${missing.join(", ")}`;
      }
    },
    fix_error: (c, tp) => defaultFix(c, tp, "fb_subscribed_apps"),
  });

  // ══════════ INSTAGRAM TESTS ════════════════════════════════════════════════

  let effectiveIgId = igId;

  const igDiscovery = await runTest({
    id: "ig_discovery", name: "Instagram — Discover Account ID from Facebook Page", category: "Instagram",
    endpoint: `GET /${discoveredPageId || "me"}?fields=instagram_business_account`,
    skip: !fbToken ? "No FB token" : !discoveredPageId ? "Page ID required" : null,
    run: () => fetch(`${GRAPH}/${discoveredPageId || "me"}?fields=instagram_business_account&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (!ok) return;
      const linked = d.instagram_business_account?.id;
      effectiveIgId = effectiveIgId || linked;
      t.data = { linked_ig_id: linked || null, configured_ig_id: igId || null, match: !igId || linked === igId };
      if (linked && igId && linked !== igId) {
        t.ok = false;
        t.error = `Configured ID (${igId}) ≠ Page-linked account (${linked})`;
        t.fix = `Update Instagram Account ID to ${linked} in your Instagram platform settings.`;
        effectiveIgId = linked;
      } else if (!linked) {
        t.ok = false;
        t.error = "No Instagram Business Account linked to this Facebook Page";
        t.fix = "In Instagram app → Settings → Account → Switch to Professional Account, then link to your Facebook Page via Facebook → Settings → Instagram.";
      }
    },
    fix_error: (c, tp) => c === 10 ? "Missing 'instagram_basic' permission." : defaultFix(c, tp, "ig_discovery"),
  });

  await runTest({
    id: "ig_account", name: "Instagram — GET /{ig_id} (Account Details + Followers)", category: "Instagram",
    endpoint: `GET /${effectiveIgId || "{ig_id}"}?fields=id,username,followers_count,media_count,biography,website`,
    skip: !fbToken ? "No FB token" : !effectiveIgId ? "Instagram Account ID not configured or discoverable — fix ig_discovery first" : null,
    run: () => fetch(`${GRAPH}/${effectiveIgId}?fields=id,username,name,followers_count,media_count,biography,website&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { ig_id: d.id, username: d.username, followers: d.followers_count, media_count: d.media_count }; },
    fix_error: (c, tp) => {
      if (c === 100) return `Account ID ${effectiveIgId} not found. Use the ID from the Discovery test above.`;
      return defaultFix(c, tp, "ig_account");
    },
  });

  await runTest({
    id: "ig_conversations", name: "Instagram — GET /{ig_id}/conversations (DMs)", category: "Instagram",
    endpoint: `GET /${effectiveIgId || "{ig_id}"}/conversations?platform=instagram&limit=5`,
    skip: !fbToken ? "No token" : !effectiveIgId ? "Instagram Account ID required" : null,
    run: () => fetch(`${GRAPH}/${effectiveIgId}/conversations?platform=instagram&limit=5&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { thread_count: d.data?.length ?? 0 }; },
    fix_error: (c, tp) => {
      if (c === 10 || c === 200) return "Missing 'instagram_manage_messages' permission. Add it in Meta App → App Review → Permissions.";
      return defaultFix(c, tp, "ig_conversations");
    },
  });

  // ══════════ WHATSAPP CLOUD API TESTS (OPTIONAL — BotBee is production provider) ══

  // WhatsApp Cloud API is intentionally OPTIONAL. Production WhatsApp delivery uses BotBee,
  // not Meta Cloud API directly. These tests are skipped unless WA credentials are configured.
  const waSkipReason = "WhatsApp Cloud API is optional — production delivery uses BotBee. Configure WA credentials only if you want direct Meta Cloud API access alongside BotBee.";

  await runTest({
    id: "wa_phone", name: "WhatsApp Cloud API — Phone Number (Optional)", category: "WhatsApp",
    endpoint: `GET /${waPhoneId || "{phone_id}"}?fields=display_phone_number,verified_name,quality_rating,status`,
    skip: !waToken ? waSkipReason : !waPhoneId ? "Phone Number ID not configured — optional, add in WhatsApp Meta settings if needed" : null,
    run: () => fetch(`${GRAPH}/${waPhoneId}?fields=display_phone_number,verified_name,quality_rating,status,name_status&access_token=${waToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { phone: d.display_phone_number, verified_name: d.verified_name, quality: d.quality_rating, status: d.status }; },
    fix_error: (c, tp) => {
      if (c === 100 || c === 803) return `Phone Number ID ${waPhoneId} not found. Copy the correct ID from Meta Business Manager → WhatsApp Manager → Phone Numbers.`;
      return defaultFix(c, tp, "wa_phone");
    },
  });

  await runTest({
    id: "wa_waba", name: "WhatsApp Cloud API — Business Account (Optional)", category: "WhatsApp",
    endpoint: `GET /${waWabaId || "{waba_id}"}?fields=name,currency,timezone_id,account_review_status`,
    skip: !waToken ? waSkipReason : !waWabaId ? "WABA ID not configured — optional" : null,
    run: () => fetch(`${GRAPH}/${waWabaId}?fields=name,currency,timezone_id,account_review_status&access_token=${waToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => { if (ok) t.data = { waba_name: d.name, currency: d.currency, timezone: d.timezone_id, status: d.account_review_status }; },
    fix_error: (c, tp) => defaultFix(c, tp, "wa_waba"),
  });

  await runTest({
    id: "wa_templates", name: "WhatsApp Cloud API — Templates (Optional)", category: "WhatsApp",
    endpoint: `GET /${waWabaId || "{waba_id}"}/message_templates?limit=5`,
    skip: !waToken ? waSkipReason : !waWabaId ? "WABA ID required — optional" : null,
    run: () => fetch(`${GRAPH}/${waWabaId}/message_templates?limit=5&access_token=${waToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (ok) t.data = { template_count: d.data?.length ?? 0, templates: (d.data || []).slice(0, 3).map((tp: any) => ({ name: tp.name, status: tp.status, language: tp.language })) };
    },
    fix_error: (c, tp) => {
      if (c === 10) return "Missing 'whatsapp_business_management' permission.";
      return defaultFix(c, tp, "wa_templates");
    },
  });

  // ══════════ LEAD ADS TESTS ════════════════════════════════════════════════

  await runTest({
    id: "leads_forms", name: "Lead Ads — GET /{page_id}/leadgen_forms", category: "Lead Ads",
    endpoint: `GET /${discoveredPageId || "{page_id}"}/leadgen_forms?limit=5&fields=id,name,status,leads_count`,
    skip: !fbToken ? "No FB token" : !discoveredPageId ? "Page ID required" : null,
    run: () => fetch(`${GRAPH}/${discoveredPageId}/leadgen_forms?limit=5&fields=id,name,status,leads_count&access_token=${fbToken}`, { signal: AbortSignal.timeout(TO) }),
    onResult: (ok, d, t) => {
      if (ok) t.data = { form_count: d.data?.length ?? 0, forms: (d.data || []).slice(0, 3).map((f: any) => ({ id: f.id, name: f.name, status: f.status, leads: f.leads_count })) };
    },
    fix_error: (c, tp) => {
      if (c === 10 || c === 200) return "Missing 'leads_retrieval' permission. Add it in Meta App → App Review. Ensure the Page has Lead Ads active.";
      return defaultFix(c, tp, "leads_forms");
    },
  });

  // Webhook field subscription check for leadgen (no API call — uses data from fb_subscribed_apps)
  tests.push({
    id: "leads_webhook", name: "Lead Ads — Webhook 'leadgen' Field Subscribed", category: "Lead Ads",
    endpoint: "Derived from fb_subscribed_apps result",
    ok: subscribedFields.includes("leadgen"),
    skipped: false, duration_ms: 0,
    data: { leadgen_subscribed: subscribedFields.includes("leadgen"), all_subscribed_fields: subscribedFields.length > 0 ? subscribedFields : null },
    error: subscribedFields.includes("leadgen") ? undefined : subscribedFields.length === 0 ? "fb_subscribed_apps did not return fields (likely token error)" : "leadgen not in subscribed webhook fields",
    fix: subscribedFields.includes("leadgen") ? undefined : "Click 'Subscribe All Webhook Fields' on this page to subscribe the leadgen field.",
  });

  // ══════════ WEBHOOK TESTS ═════════════════════════════════════════════════

  const verifyTokenOk = !!webhookVerifyToken && !webhookVerifyToken.startsWith("http");
  tests.push({
    id: "webhook_config", name: "Webhook — Verify Token Configuration", category: "Webhooks",
    endpoint: "Config validation (no API call)",
    ok: verifyTokenOk,
    skipped: false, duration_ms: 0,
    data: { verify_token_set: !!webhookVerifyToken, is_url: webhookVerifyToken?.startsWith("http") || false, webhook_url: WEBHOOK_URL },
    error: !webhookVerifyToken ? "No verify token configured" : webhookVerifyToken.startsWith("http") ? "Verify token is a URL — must be a short secret string" : undefined,
    fix: !webhookVerifyToken ? "Set a verify token (e.g. 'alburhan_verify_2026') in Facebook Page platform settings. Meta uses this to confirm your webhook URL." : webhookVerifyToken.startsWith("http") ? "Replace the URL with a short secret string like 'alburhan_verify_2026'." : undefined,
  });

  // Live challenge test — hits our own webhook endpoint with the real verify token
  const challengeResult = await runTest({
    id: "webhook_challenge", name: "Webhook — Live Challenge Request (Self-Test)", category: "Webhooks",
    endpoint: `GET ${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=***&hub.challenge=test_ok_12345`,
    skip: !verifyTokenOk ? "Verify token not set or is a URL — fix webhook_config first" : null,
    run: () => fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken!)}&hub.challenge=test_ok_12345`, { signal: AbortSignal.timeout(TO) }),
    onResult: (_ok, d, t) => {
      // Response is plain text: "test_ok_12345" if verify token matches
      const raw = d?._raw ?? (typeof d === "string" ? d : null);
      if (t.status_code === 200 && raw?.includes("test_ok_12345")) {
        t.ok = true;
        t.data = { challenge_echoed: raw?.trim(), verified: true };
        t.error = undefined;
        t.fix = undefined;
      } else {
        t.ok = false;
        t.error = t.status_code === 403 ? "403 Forbidden — verify token mismatch" : `Expected 'test_ok_12345' back, got: ${String(raw || "").slice(0, 80)}`;
        t.fix = "The verify token saved here does not match what's in your Meta App → Webhooks. Update the Meta App webhook verify token to match.";
      }
    },
    fix_error: (_c, _tp) => "Webhook challenge failed — check the server is reachable and the verify token matches your Meta App setting.",
  });
  void challengeResult; // used via tests array

  // DB check: events received
  let lastReceived: any = null;
  let totalEvents = 0;
  try {
    const lr = await pool.query(`SELECT created_at, platform FROM social_messages WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta') ORDER BY created_at DESC LIMIT 1`);
    const cnt = await pool.query(`SELECT COUNT(*) as c FROM social_messages WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')`);
    lastReceived = lr.rows[0]?.created_at || null;
    totalEvents = parseInt(cnt.rows[0]?.c || "0");
  } catch { /* best-effort */ }

  tests.push({
    id: "webhook_events", name: "Webhook — Events Received (DB Audit)", category: "Webhooks",
    endpoint: "SELECT COUNT(*) FROM social_messages WHERE platform IN (meta platforms)",
    ok: totalEvents > 0,
    skipped: false, duration_ms: 0,
    data: { total_events: totalEvents, last_received: lastReceived, last_platform: null },
    error: totalEvents === 0 ? "No Meta webhook events received yet in the database" : undefined,
    fix: totalEvents === 0 ? "No events logged: (1) Register the webhook URL in your Meta App, (2) Subscribe to webhook fields, (3) Send a test message to your Facebook Page from another account." : undefined,
  });

  // ══════════ Summary ════════════════════════════════════════════════════════
  const passed = tests.filter((t: any) => t.ok).length;
  const failed = tests.filter((t: any) => !t.ok && !t.skipped).length;
  const skipped = tests.filter((t: any) => t.skipped).length;

  // Collect FB token scopes for permissions checklist (from debug test data)
  const fbScopes: string[] = fbDebugResult?.data?.scopes || [];

  res.json({
    checkedAt: new Date().toISOString(),
    tests,
    summary: { total: tests.length, passed, failed, skipped },
    fb_scopes: fbScopes,
    config_present: {
      fb_token: !!fbToken, fb_page_id: !!fbPageId, app_id: !!fbAppId, app_secret: !!fbAppSecret,
      ig_id: !!igId, wa_token: !!waToken, wa_phone_id: !!waPhoneId, wa_waba_id: !!waWabaId,
      webhook_verify_token: !!webhookVerifyToken,
    },
  });
});

// ── POST /api/social-media/meta/quick-configure ───────────────────────────────
// Saves Page Access Token + verify token to all Facebook/Instagram platforms at once.
// Also optionally discovers and saves Page ID + IG ID from the token.
router.post("/meta/quick-configure", requireAdmin as any, async (req, res) => {
  const GRAPH = "https://graph.facebook.com/v19.0";
  const { page_access_token, verify_token, page_id: manualPageId, ig_id: manualIgId } = req.body;
  const results: any[] = [];

  if (!page_access_token?.trim()) {
    return void res.status(400).json({ ok: false, error: "page_access_token is required" });
  }
  const tok = page_access_token.trim();
  const verTok = verify_token?.trim() || "alburhan2026";

  // Step 1: validate token + discover page ID
  let pageId = manualPageId?.trim() || null;
  let pageName = "";
  try {
    const r = await fetch(`${GRAPH}/me?fields=id,name&access_token=${tok}`, { signal: AbortSignal.timeout(10000) });
    const d = await r.json() as any;
    if (d.error) {
      return void res.status(400).json({ ok: false, error: `Token validation failed: ${d.error.message} (code ${d.error.code})` });
    }
    pageId = pageId || d.id;
    pageName = d.name;
    results.push({ step: "Token validated", id: d.id, name: d.name });
  } catch (e: any) {
    return void res.status(500).json({ ok: false, error: `Graph API unreachable: ${e.message}` });
  }

  // Step 2: discover IG ID if not provided
  let igId = manualIgId?.trim() || null;
  if (pageId && !igId) {
    try {
      const r = await fetch(`${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${tok}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json() as any;
      if (d.instagram_business_account?.id) {
        igId = d.instagram_business_account.id;
        results.push({ step: "Instagram Account ID discovered", ig_id: igId });
      } else {
        results.push({ step: "Instagram Account ID", note: "Not linked to this Page — link in Meta Business Suite → Accounts → Instagram Accounts" });
      }
    } catch { /* best effort */ }
  }

  // Step 3: upsert each platform config
  const PLATFORMS_TO_UPDATE = [
    { platform: "facebook_page", extraFields: { page_access_token: tok, page_id: pageId, webhook_verify_token: verTok } },
    { platform: "facebook_messenger", extraFields: { page_access_token: tok, page_id: pageId, webhook_verify_token: verTok } },
    { platform: "facebook_leads", extraFields: { page_access_token: tok, page_id: pageId, webhook_verify_token: verTok } },
    ...(igId ? [
      { platform: "instagram", extraFields: { page_access_token: tok, page_id: pageId, instagram_account_id: igId, webhook_verify_token: verTok } },
      { platform: "instagram_dm", extraFields: { page_access_token: tok, page_id: pageId, instagram_account_id: igId, webhook_verify_token: verTok } },
    ] : []),
  ];

  for (const { platform, extraFields } of PLATFORMS_TO_UPDATE) {
    const existing = await pool.query(`SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform=$1`, [platform]);
    const currentExtra = existing.rows[0] ? decryptExtra(existing.rows[0].extra_fields_encrypted) : {};
    const merged = { ...currentExtra, ...extraFields };
    const encExtra = encrypt(JSON.stringify(merged));
    if (existing.rows[0]) {
      await pool.query(`UPDATE social_platform_configs SET extra_fields_encrypted=$1, enabled=true, status='active', updated_at=NOW() WHERE platform=$2`, [encExtra, platform]);
    } else {
      await pool.query(`INSERT INTO social_platform_configs (platform, enabled, status, extra_fields_encrypted) VALUES ($1, true, 'active', $2)`, [platform, encExtra]);
    }
    results.push({ step: `Saved ${platform}`, page_id: pageId, ig_id: igId || undefined, verify_token: verTok });
  }

  res.json({
    ok: true,
    page_id: pageId,
    page_name: pageName,
    ig_id: igId,
    verify_token: verTok,
    platforms_updated: PLATFORMS_TO_UPDATE.length,
    results,
    next_steps: [
      `✅ Token saved to ${PLATFORMS_TO_UPDATE.length} platforms`,
      `Set verify token "${verTok}" in: Meta App Dashboard → Products → Webhooks → Edit Subscription → Verify Token`,
      `Webhook URL to register: https://alburhantravels.com/api/social-media/webhook/meta`,
      `Then click "Subscribe All Webhook Fields" on this page`,
      !igId ? "Instagram not linked — in Instagram app: Settings → Account → Switch to Professional, then link to your Facebook Page" : `Instagram Account ID ${igId} saved`,
    ],
  });
});

// ── POST /api/social-media/meta/test-message ──────────────────────────────────
// Sends a real test WhatsApp message via Meta Cloud API to verify send capability
router.post("/meta/test-message", requireAdmin as any, async (req, res) => {
  const { to } = req.body;
  if (!to?.trim()) return void res.status(400).json({ ok: false, error: "Recipient phone number (to) required — include country code, no '+' or spaces e.g. 919876543210" });
  const cfgRows = await pool.query(`SELECT extra_fields_encrypted, api_key_encrypted FROM social_platform_configs WHERE platform='whatsapp_meta'`);
  const row = cfgRows.rows[0];
  if (!row) return void res.status(400).json({ ok: false, error: "WhatsApp Meta platform not configured" });
  const extra = decryptExtra(row.extra_fields_encrypted);
  const waToken = extra.access_token || (row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null);
  const waPhoneId = extra.phone_number_id;
  if (!waToken) return void res.status(400).json({ ok: false, error: "WhatsApp access token not configured" });
  if (!waPhoneId) return void res.status(400).json({ ok: false, error: "Phone Number ID not configured" });
  const t0 = Date.now();
  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: to.trim().replace(/\D/g, ""),
        type: "text",
        text: { body: `🔷 Al Burhan ERP — Meta API Test\n\nThis is a live test message from your Meta Connection Health dashboard.\n\nSent at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const duration = Date.now() - t0;
    const bodyText = await resp.text();
    let data: any;
    try { data = JSON.parse(bodyText); } catch { data = { _raw: bodyText }; }
    if (resp.ok && data?.messages?.[0]?.id) {
      res.json({ ok: true, message_id: data.messages[0].id, status: data.messages[0].message_status, duration_ms: duration, raw: data });
    } else {
      res.json({ ok: false, error: data?.error?.message || "Unknown error", error_code: data?.error?.code, error_type: data?.error?.type, duration_ms: duration, raw: data });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/social-media/meta/auto-repair ───────────────────────────────────
// Attempts every possible automatic repair: token extension, ID discovery/save,
// webhook re-subscription, challenge verification. Returns a full repair log.
router.post("/meta/auto-repair", requireAdmin as any, async (_req, res) => {
  const GRAPH = "https://graph.facebook.com/v19.0";
  const WEBHOOK_URL = "https://alburhantravels.com/api/social-media/webhook/meta";
  const TO = 10000;
  const repairs: any[] = [];

  // ── Load configs ────────────────────────────────────────────────────────────
  const cfgRows = await pool.query(
    `SELECT platform, extra_fields_encrypted, api_key_encrypted FROM social_platform_configs
     WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')`
  );
  const cfgMap: Record<string, any> = {};
  const rawRows: Record<string, any> = {};
  for (const row of cfgRows.rows) {
    const extra = decryptExtra(row.extra_fields_encrypted);
    const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null;
    cfgMap[row.platform] = { ...extra, _apiKey: apiKey };
    rawRows[row.platform] = row;
  }

  const fbToken = cfgMap.facebook_page?.page_access_token || cfgMap.facebook_messenger?.page_access_token
    || cfgMap.facebook_leads?.page_access_token || cfgMap.instagram?.page_access_token || cfgMap.instagram_dm?.page_access_token;
  const fbAppId = cfgMap.facebook_page?.app_id || cfgMap.facebook_messenger?.app_id;
  const fbAppSecret = cfgMap.facebook_page?.app_secret || cfgMap.facebook_messenger?.app_secret;
  const igId = cfgMap.instagram?.instagram_account_id || cfgMap.instagram_dm?.instagram_account_id;
  const waToken = cfgMap.whatsapp_meta?.access_token || cfgMap.whatsapp_meta?._apiKey;
  const waPhoneId = cfgMap.whatsapp_meta?.phone_number_id;
  const waWabaId = cfgMap.whatsapp_meta?.waba_id;
  const webhookVerifyToken = cfgMap.facebook_page?.webhook_verify_token || cfgMap.whatsapp_meta?.webhook_verify_token;

  // ── Helper: log a repair ───────────────────────────────────────────────────
  type RepairResult = "fixed" | "failed" | "skipped" | "validated";
  const log = (action: string, result: RepairResult, detail: string, data?: any) =>
    repairs.push({ action, result, detail, data: data || null, ts: new Date().toISOString() });

  // ── Helper: save updated extra fields to a platform ────────────────────────
  async function saveExtra(platform: string, updates: Record<string, any>): Promise<boolean> {
    const row = rawRows[platform];
    if (!row) return false;
    const existing = decryptExtra(row.extra_fields_encrypted);
    const merged = { ...existing, ...updates };
    const encExtra = encrypt(JSON.stringify(merged));
    await pool.query(`UPDATE social_platform_configs SET extra_fields_encrypted=$1, updated_at=NOW() WHERE platform=$2`, [encExtra, platform]);
    return true;
  }

  // ── Helper: safe fetch + parse ─────────────────────────────────────────────
  async function gfetch(url: string, opts?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TO), ...opts });
      const txt = await r.text();
      let data: any;
      try { data = JSON.parse(txt); } catch { data = { _raw: txt.slice(0, 200) }; }
      return { ok: r.ok && !data?.error, status: r.status, data };
    } catch (e: any) {
      return { ok: false, status: 0, data: { error: { message: e.message } } };
    }
  }

  // ══ Repair 1: Extend Facebook User/Page Access Token ═══════════════════════
  let activeFbToken = fbToken;
  if (fbToken && fbAppId && fbAppSecret) {
    const r = await gfetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${fbAppId}&client_secret=${fbAppSecret}&fb_exchange_token=${encodeURIComponent(fbToken)}`);
    if (r.ok && r.data.access_token && r.data.access_token !== fbToken) {
      activeFbToken = r.data.access_token;
      for (const plat of ["facebook_page", "facebook_messenger", "facebook_leads", "instagram", "instagram_dm"]) {
        if (cfgMap[plat]?.page_access_token === fbToken) await saveExtra(plat, { page_access_token: activeFbToken });
      }
      log("Extend Facebook Access Token (fb_exchange_token)", "fixed",
        `Token extended successfully. Expires in ${r.data.expires_in ? Math.round(r.data.expires_in / 86400) + " days" : "unknown"}. Saved to all configured platforms.`,
        { expires_in: r.data.expires_in });
    } else if (r.data?.error) {
      const msg = r.data.error.message || "";
      const isExpired = r.data.error.code === 190 || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid");
      log("Extend Facebook Access Token", "failed",
        isExpired
          ? `Token has expired and cannot be extended automatically. Manual action required: generate a new Page Access Token in Meta Business Suite → Settings → Advanced → Page Access Token.`
          : `Exchange failed: ${msg} (code ${r.data.error.code})`,
        { error: r.data.error });
    } else {
      log("Extend Facebook Access Token", "validated", "Token returned is the same — it is already a long-lived Page token (Page tokens never expire unless revoked).");
    }
  } else if (fbToken && !fbAppId) {
    log("Extend Facebook Access Token", "skipped", "App ID and App Secret required. Add them in Facebook Page platform settings to enable token extension.");
  } else {
    log("Extend Facebook Access Token", "skipped", "No Facebook Page Access Token configured.");
  }

  // ══ Repair 2: Discover + save Facebook Page ID ════════════════════════════
  let discoveredPageId: string | null = null;
  if (activeFbToken) {
    const r = await gfetch(`${GRAPH}/me?fields=id,name,fan_count&access_token=${activeFbToken}`);
    if (r.ok && r.data.id) {
      discoveredPageId = r.data.id;
      let saved = false;
      for (const plat of ["facebook_page", "facebook_messenger", "facebook_leads"]) {
        if (rawRows[plat] && cfgMap[plat]?.page_id !== r.data.id) {
          await saveExtra(plat, { page_id: r.data.id });
          saved = true;
        }
      }
      log("Discover and Save Facebook Page ID", saved ? "fixed" : "validated",
        saved ? `Saved Page ID ${r.data.id} ("${r.data.name}") to facebook_page, facebook_messenger, facebook_leads.`
          : `Page ID ${r.data.id} ("${r.data.name}") already correctly configured.`,
        { page_id: r.data.id, page_name: r.data.name, fan_count: r.data.fan_count });
    } else {
      log("Discover Facebook Page ID", "failed", `GET /me failed: ${r.data?.error?.message} (code ${r.data?.error?.code})`, { error: r.data?.error });
    }
  } else {
    log("Discover Facebook Page ID", "skipped", "No Facebook token available.");
  }

  // ══ Repair 3: Discover + save Instagram Account ID ════════════════════════
  const effectivePageId = discoveredPageId || cfgMap.facebook_page?.page_id || cfgMap.facebook_messenger?.page_id;
  if (activeFbToken && effectivePageId) {
    const r = await gfetch(`${GRAPH}/${effectivePageId}?fields=instagram_business_account&access_token=${activeFbToken}`);
    if (r.ok && r.data.instagram_business_account?.id) {
      const correctIgId = r.data.instagram_business_account.id;
      let saved = false;
      for (const plat of ["instagram", "instagram_dm"]) {
        if (rawRows[plat] && cfgMap[plat]?.instagram_account_id !== correctIgId) {
          await saveExtra(plat, { instagram_account_id: correctIgId });
          saved = true;
        } else if (!rawRows[plat] && igId !== correctIgId) {
          // Platform not configured — note the correct ID for the user
        }
      }
      if (correctIgId !== igId && !rawRows.instagram && !rawRows.instagram_dm) {
        log("Discover Instagram Account ID", "validated",
          `Correct Instagram Account ID is ${correctIgId} — but Instagram platform is not configured in Social Media settings. Add the Instagram DM platform and set this ID.`,
          { suggested_id: correctIgId });
      } else {
        log("Discover and Save Instagram Account ID", saved ? "fixed" : "validated",
          saved ? `Updated Instagram Account ID to ${correctIgId} (was: ${igId || "not set"}).`
            : `Instagram Account ID ${correctIgId} is already correct.`,
          { instagram_account_id: correctIgId, was: igId || null });
      }
    } else if (!r.data?.instagram_business_account) {
      log("Discover Instagram Account ID", "failed",
        "No Instagram Business Account linked to this Facebook Page. To fix: In Instagram app → Settings → Account → Switch to Professional, then link to your Facebook Page via Facebook → Settings → Linked Accounts.", {});
    } else {
      log("Discover Instagram Account ID", "failed", `API error: ${r.data?.error?.message}`, { error: r.data?.error });
    }
  } else {
    log("Discover Instagram Account ID", "skipped", !activeFbToken ? "No Facebook token." : "Page ID could not be determined — run repair 2 first.");
  }

  // ══ Repair 4: Validate WhatsApp Phone Number ID ═══════════════════════════
  if (waToken && waPhoneId) {
    const r = await gfetch(`${GRAPH}/${waPhoneId}?fields=id,display_phone_number,verified_name,quality_rating,status&access_token=${waToken}`);
    if (r.ok && r.data.id) {
      log("Validate WhatsApp Phone Number ID", "validated",
        `Phone Number ID ${waPhoneId} confirmed valid. Number: ${r.data.display_phone_number}, Name: ${r.data.verified_name}, Quality: ${r.data.quality_rating}, Status: ${r.data.status}.`,
        { phone: r.data.display_phone_number, name: r.data.verified_name, quality: r.data.quality_rating, status: r.data.status });
    } else {
      log("Validate WhatsApp Phone Number ID", "failed",
        `Phone Number ID ${waPhoneId} is invalid: ${r.data?.error?.message} (code ${r.data?.error?.code}). Check Meta Business Manager → WhatsApp Manager → Phone Numbers for the correct numeric ID.`,
        { error: r.data?.error });
    }
  } else {
    log("Validate WhatsApp Phone Number ID", "skipped", !waToken ? "WhatsApp access token not configured." : "Phone Number ID not configured in WhatsApp Meta settings.");
  }

  // ══ Repair 5: Validate WhatsApp Business Account (WABA) ══════════════════
  if (waToken && waWabaId) {
    const r = await gfetch(`${GRAPH}/${waWabaId}?fields=id,name,currency,account_review_status&access_token=${waToken}`);
    if (r.ok && r.data.id) {
      log("Validate WhatsApp Business Account (WABA)", "validated",
        `WABA ID ${waWabaId} confirmed: "${r.data.name}", Currency: ${r.data.currency}, Status: ${r.data.account_review_status}.`,
        { waba_name: r.data.name, currency: r.data.currency, review_status: r.data.account_review_status });
    } else {
      log("Validate WhatsApp Business Account (WABA)", "failed",
        `WABA ID ${waWabaId} is invalid: ${r.data?.error?.message} (code ${r.data?.error?.code}). Open Meta Business Manager and copy the correct WABA ID.`,
        { error: r.data?.error });
    }
  } else {
    log("Validate WhatsApp Business Account (WABA)", "skipped", !waToken ? "No WA token." : "WABA ID not configured in WhatsApp Meta settings.");
  }

  // ══ Repair 6: Re-subscribe all webhook fields ═════════════════════════════
  const finalPageId = discoveredPageId || cfgMap.facebook_page?.page_id || cfgMap.facebook_messenger?.page_id;
  if (activeFbToken && finalPageId) {
    const FIELDS = ["messages","messaging_postbacks","message_deliveries","message_reads","messaging_optins","messaging_referrals","leadgen","feed","mention","instagram_manage_messages","instagram_manage_comments"].join(",");
    const r = await gfetch(
      `${GRAPH}/${finalPageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(FIELDS)}&access_token=${activeFbToken}`,
      { method: "POST" }
    );
    if (r.ok && r.data.success) {
      await pool.query(`UPDATE social_platform_configs SET webhook_verified=true WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm')`);
      log("Re-subscribe Webhook Fields", "fixed",
        `Page ${finalPageId} subscribed to all 11 fields: messages, messaging_postbacks, message_deliveries, message_reads, messaging_optins, messaging_referrals, leadgen, feed, mention, instagram_manage_messages, instagram_manage_comments.`);
    } else {
      log("Re-subscribe Webhook Fields", "failed",
        `Subscription failed: ${r.data?.error?.message || JSON.stringify(r.data)} (HTTP ${r.status}). Check that the token has 'pages_manage_metadata' permission.`,
        { error: r.data?.error });
    }
  } else {
    log("Re-subscribe Webhook Fields", "skipped", !activeFbToken ? "No FB token." : "Page ID unavailable.");
  }

  // ══ Repair 7: Verify webhook challenge ════════════════════════════════════
  if (webhookVerifyToken && !webhookVerifyToken.startsWith("http")) {
    const r = await gfetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken)}&hub.challenge=repair_verify_54321`);
    const raw = r.data?._raw ?? "";
    if (r.status === 200 && String(raw).includes("repair_verify_54321")) {
      log("Verify Webhook Challenge (Live Self-Test)", "fixed",
        "Webhook endpoint is live and responding correctly to Meta challenge requests. The verify token is correct and the server is reachable.",
        { challenge_echoed: String(raw).trim() });
    } else {
      log("Verify Webhook Challenge", "failed",
        `Challenge failed — HTTP ${r.status}. ${r.status === 403 ? "Verify token mismatch: the token saved here does not match what's in your Meta App → Webhooks." : `Response: ${String(raw).slice(0, 80)}`}`,
        { http_status: r.status, response: String(raw).slice(0, 100) });
    }
  } else {
    log("Verify Webhook Challenge", "skipped",
      !webhookVerifyToken ? "No verify token configured — set one in Facebook Page platform settings."
        : "Verify token is a URL — must be a short secret string like 'alburhan_verify_2026'.");
  }

  // ══ Repair 8: Reconnect disconnected assets (mark platforms active) ════════
  let reconnected = 0;
  for (const plat of ["facebook_page", "facebook_messenger", "facebook_leads", "instagram", "instagram_dm"]) {
    const row = rawRows[plat];
    if (row && cfgMap[plat]) {
      const tokenOk = activeFbToken && cfgMap[plat]?.page_access_token;
      if (tokenOk) {
        await pool.query(`UPDATE social_platform_configs SET status='active', last_tested=NOW() WHERE platform=$1`, [plat]);
        reconnected++;
      }
    }
  }
  if (waToken) {
    await pool.query(`UPDATE social_platform_configs SET status='active', last_tested=NOW() WHERE platform='whatsapp_meta'`);
    reconnected++;
  }
  if (reconnected > 0) {
    log("Reconnect Configured Assets", "fixed", `Marked ${reconnected} platform(s) as active and updated last_tested timestamp.`);
  } else {
    log("Reconnect Configured Assets", "skipped", "No platforms with valid tokens to reconnect.");
  }

  const summary = {
    total: repairs.length,
    fixed: repairs.filter(r => r.result === "fixed").length,
    validated: repairs.filter(r => r.result === "validated").length,
    failed: repairs.filter(r => r.result === "failed").length,
    skipped: repairs.filter(r => r.result === "skipped").length,
  };

  res.json({ repairedAt: new Date().toISOString(), repairs, summary });
});

// ── GET /api/social-media/meta/platform/:platform ─────────────────────────────
// Per-platform focused live test — returns detailed API data for one platform
router.get("/meta/platform/:platform", requireAdmin as any, async (req, res) => {
  const { platform } = req.params;
  const GRAPH = "https://graph.facebook.com/v19.0";
  const TO = 10000;
  const t0 = Date.now();

  const cfgRows = await pool.query(
    `SELECT platform, extra_fields_encrypted, api_key_encrypted, webhook_verified
     FROM social_platform_configs
     WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')`
  );
  const cfgMap: Record<string, any> = {};
  for (const row of cfgRows.rows) {
    const extra = decryptExtra(row.extra_fields_encrypted);
    const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null;
    cfgMap[row.platform] = { ...extra, _apiKey: apiKey, webhook_verified: row.webhook_verified };
  }

  const fbToken = cfgMap.facebook_page?.page_access_token || cfgMap.facebook_messenger?.page_access_token
    || cfgMap.facebook_leads?.page_access_token || cfgMap.instagram?.page_access_token || cfgMap.instagram_dm?.page_access_token;
  const fbPageId = cfgMap.facebook_page?.page_id || cfgMap.facebook_messenger?.page_id || cfgMap.facebook_leads?.page_id;
  const igId = cfgMap.instagram?.instagram_account_id || cfgMap.instagram_dm?.instagram_account_id;
  const waToken = cfgMap.whatsapp_meta?.access_token || cfgMap.whatsapp_meta?._apiKey;
  const waPhoneId = cfgMap.whatsapp_meta?.phone_number_id;
  const waWabaId = cfgMap.whatsapp_meta?.waba_id;
  const webhookVerifyToken = cfgMap.facebook_page?.webhook_verify_token || cfgMap.whatsapp_meta?.webhook_verify_token;

  async function gfetch(url: string, opts?: RequestInit) {
    const t1 = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TO), ...opts });
      const txt = await r.text();
      let data: any;
      try { data = JSON.parse(txt); } catch { data = { _raw: txt.slice(0, 300) }; }
      // Trim arrays
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const trimmed: any = {};
        for (const k of Object.keys(data)) {
          const v = data[k];
          trimmed[k] = Array.isArray(v) ? v.slice(0, 5) : v;
        }
        data = trimmed;
      }
      return { ok: r.ok && !data?.error, status: r.status, ms: Date.now() - t1, data };
    } catch (e: any) {
      return { ok: false, status: 0, ms: Date.now() - t1, data: { error: { message: e.message } } };
    }
  }

  type PTest = { name: string; endpoint: string; ok: boolean; status: number; ms: number; data: any; error?: string };
  const tests: PTest[] = [];
  const summary: any = {};

  const addTest = (name: string, endpoint: string, r: any, extract?: (d: any) => any) => {
    const ok = r.ok;
    tests.push({ name, endpoint, ok, status: r.status, ms: r.ms, data: extract ? extract(r.data) : null, error: !ok ? (r.data?.error?.message || `HTTP ${r.status}`) : undefined });
    return r;
  };

  try {
    if (platform === "facebook") {
      if (!fbToken) return void res.json({ platform, ok: false, error: "Page Access Token not configured", tests, duration_ms: Date.now() - t0 });
      const me = await gfetch(`${GRAPH}/me?fields=id,name,fan_count,followers_count,category,verification_status,about,website&access_token=${fbToken}`);
      addTest("GET /me (Identity + Followers)", `/me`, me, d => ({ page_id: d.id, page_name: d.name, fans: d.fan_count, followers: d.followers_count, category: d.category }));
      const pageId = me.data?.id || fbPageId;
      if (pageId) {
        const feed = await gfetch(`${GRAPH}/${pageId}/feed?limit=5&fields=id,message,story,created_time,likes.summary(true)&access_token=${fbToken}`);
        addTest("GET /{page_id}/feed (Recent Posts)", `/${pageId}/feed`, feed, d => ({ post_count: d.data?.length ?? 0, posts: (d.data || []).map((p: any) => ({ id: p.id, preview: (p.message || p.story || "").slice(0, 80), created: p.created_time })) }));
        const inbox = await gfetch(`${GRAPH}/${pageId}/conversations?limit=5&fields=id,snippet,updated_time,message_count&access_token=${fbToken}`);
        addTest("GET /{page_id}/conversations (Inbox / Messenger Threads)", `/${pageId}/conversations`, inbox, d => ({ thread_count: d.data?.length ?? 0, total: d.summary?.total_count }));
        const leads = await gfetch(`${GRAPH}/${pageId}/leadgen_forms?limit=5&fields=id,name,status,leads_count&access_token=${fbToken}`);
        addTest("GET /{page_id}/leadgen_forms (Lead Ads Forms)", `/${pageId}/leadgen_forms`, leads, d => ({ form_count: d.data?.length ?? 0, forms: (d.data || []).map((f: any) => ({ name: f.name, status: f.status, leads: f.leads_count })) }));
      }
      // DB: leads in social_messages
      try {
        const dbLeads = await pool.query(`SELECT COUNT(*) as c FROM social_messages WHERE platform='facebook_leads'`);
        tests.push({ name: "DB: Lead Events Received", endpoint: "social_messages WHERE platform='facebook_leads'", ok: true, status: 200, ms: 0, data: { total_lead_events: parseInt(dbLeads.rows[0]?.c || "0") } });
      } catch { /* best-effort */ }

    } else if (platform === "instagram") {
      if (!fbToken) return void res.json({ platform, ok: false, error: "Facebook token required for Instagram", tests, duration_ms: Date.now() - t0 });
      const pageId = fbPageId;
      // Discover IG ID from page
      let effectiveIgId = igId;
      if (pageId) {
        const disc = await gfetch(`${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${fbToken}`);
        addTest("GET /{page_id}?fields=instagram_business_account (Discover IG ID)", `/${pageId}?fields=instagram_business_account`, disc, d => ({ linked_ig_id: d.instagram_business_account?.id, configured_ig_id: igId, match: d.instagram_business_account?.id === igId }));
        effectiveIgId = effectiveIgId || disc.data?.instagram_business_account?.id;
      }
      if (effectiveIgId) {
        const acct = await gfetch(`${GRAPH}/${effectiveIgId}?fields=id,username,name,biography,followers_count,media_count,website&access_token=${fbToken}`);
        addTest("GET /{ig_id} (Account + Followers)", `/${effectiveIgId}`, acct, d => ({ ig_id: d.id, username: `@${d.username}`, followers: d.followers_count, media_count: d.media_count, bio: d.biography }));
        const dms = await gfetch(`${GRAPH}/${effectiveIgId}/conversations?platform=instagram&limit=5&fields=id,updated_time&access_token=${fbToken}`);
        addTest("GET /{ig_id}/conversations (DMs)", `/${effectiveIgId}/conversations`, dms, d => ({ dm_count: d.data?.length ?? 0 }));
        const media = await gfetch(`${GRAPH}/${effectiveIgId}/media?limit=5&fields=id,caption,media_type,timestamp,like_count,comments_count&access_token=${fbToken}`);
        addTest("GET /{ig_id}/media (Recent Posts)", `/${effectiveIgId}/media`, media, d => ({ post_count: d.data?.length ?? 0, posts: (d.data || []).map((m: any) => ({ type: m.media_type, caption: (m.caption || "").slice(0, 60), likes: m.like_count, comments: m.comments_count })) }));
        // story replies require stories permission — attempt gracefully
        const stories = await gfetch(`${GRAPH}/${effectiveIgId}/stories?fields=id,media_type,timestamp&access_token=${fbToken}`);
        addTest("GET /{ig_id}/stories (Story Replies)", `/${effectiveIgId}/stories`, stories, d => ({ story_count: d.data?.length ?? 0 }));
      } else {
        tests.push({ name: "Instagram Account Tests", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: "Instagram Account ID not available — configure it in Instagram platform settings" });
      }

    } else if (platform === "whatsapp") {
      if (!waToken) return void res.json({ platform, ok: false, error: "WhatsApp access token not configured", tests, duration_ms: Date.now() - t0 });
      if (waPhoneId) {
        const phone = await gfetch(`${GRAPH}/${waPhoneId}?fields=id,display_phone_number,verified_name,quality_rating,status,name_status&access_token=${waToken}`);
        addTest("GET /{phone_id} (Phone Number)", `/${waPhoneId}`, phone, d => ({ phone: d.display_phone_number, name: d.verified_name, quality: d.quality_rating, status: d.status }));
      } else {
        tests.push({ name: "Phone Number Check", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: "Phone Number ID not configured" });
      }
      if (waWabaId) {
        const waba = await gfetch(`${GRAPH}/${waWabaId}?fields=id,name,currency,timezone_id,account_review_status&access_token=${waToken}`);
        addTest("GET /{waba_id} (Business Account)", `/${waWabaId}`, waba, d => ({ name: d.name, currency: d.currency, timezone: d.timezone_id, status: d.account_review_status }));
        const templates = await gfetch(`${GRAPH}/${waWabaId}/message_templates?limit=10&fields=id,name,status,language,category&access_token=${waToken}`);
        addTest("GET /{waba_id}/message_templates", `/${waWabaId}/message_templates`, templates, d => ({ template_count: d.data?.length ?? 0, templates: (d.data || []).map((t: any) => ({ name: t.name, status: t.status, lang: t.language })) }));
        const phoneNumbers = await gfetch(`${GRAPH}/${waWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${waToken}`);
        addTest("GET /{waba_id}/phone_numbers (All Numbers)", `/${waWabaId}/phone_numbers`, phoneNumbers, d => ({ phone_count: d.data?.length ?? 0, numbers: (d.data || []).map((n: any) => ({ id: n.id, phone: n.display_phone_number, name: n.verified_name })) }));
      } else {
        tests.push({ name: "WABA + Templates Check", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: "WABA ID not configured" });
      }
      // DB: WA events
      try {
        const r = await pool.query(`SELECT COUNT(*) as c, MAX(created_at) as last FROM social_messages WHERE platform='whatsapp_meta'`);
        tests.push({ name: "DB: WhatsApp Events Received", endpoint: "social_messages", ok: true, status: 200, ms: 0, data: { total: parseInt(r.rows[0]?.c || "0"), last_received: r.rows[0]?.last } });
      } catch { /* best-effort */ }

    } else if (platform === "messenger") {
      if (!fbToken) return void res.json({ platform, ok: false, error: "Page Access Token not configured", tests, duration_ms: Date.now() - t0 });
      const pageId = fbPageId;
      if (pageId) {
        const convs = await gfetch(`${GRAPH}/${pageId}/conversations?limit=5&fields=id,snippet,updated_time,message_count,participants&access_token=${fbToken}`);
        addTest("GET /{page_id}/conversations (Threads)", `/${pageId}/conversations`, convs, d => ({ thread_count: d.data?.length ?? 0, total: d.summary?.total_count, threads: (d.data || []).slice(0, 3).map((c: any) => ({ snippet: c.snippet?.slice(0, 60), updated: c.updated_time, messages: c.message_count })) }));
        // Check subscribed_apps
        const subs = await gfetch(`${GRAPH}/me/subscribed_apps?access_token=${fbToken}`);
        const fields = subs.data?.data?.[0]?.subscribed_fields || [];
        addTest("GET /me/subscribed_apps (Messenger Webhook Fields)", `/me/subscribed_apps`, subs, d => ({ subscribed_fields: d.data?.[0]?.subscribed_fields || [], has_messages: (d.data?.[0]?.subscribed_fields || []).includes("messages") }));
        // DB: messenger inbox events
        try {
          const r = await pool.query(`SELECT COUNT(*) as c, MAX(created_at) as last FROM social_messages WHERE platform IN ('facebook_messenger','facebook_page')`);
          tests.push({ name: "DB: Messenger Messages Received", endpoint: "social_messages", ok: true, status: 200, ms: 0, data: { total: parseInt(r.rows[0]?.c || "0"), last_received: r.rows[0]?.last } });
        } catch { /* best-effort */ }
        void fields;
      } else {
        tests.push({ name: "Messenger Tests", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: "Page ID not configured" });
      }

    } else if (platform === "leads") {
      if (!fbToken) return void res.json({ platform, ok: false, error: "Page Access Token not configured", tests, duration_ms: Date.now() - t0 });
      const pageId = fbPageId;
      if (pageId) {
        const forms = await gfetch(`${GRAPH}/${pageId}/leadgen_forms?limit=10&fields=id,name,status,leads_count,created_time&access_token=${fbToken}`);
        addTest("GET /{page_id}/leadgen_forms", `/${pageId}/leadgen_forms`, forms, d => ({ form_count: d.data?.length ?? 0, forms: (d.data || []).map((f: any) => ({ id: f.id, name: f.name, status: f.status, leads: f.leads_count, created: f.created_time })) }));
        // Check leadgen webhook subscription
        const subs = await gfetch(`${GRAPH}/me/subscribed_apps?access_token=${fbToken}`);
        const fields = subs.data?.data?.[0]?.subscribed_fields || [];
        addTest("GET /me/subscribed_apps (leadgen field check)", `/me/subscribed_apps`, subs, d => ({ leadgen_subscribed: (d.data?.[0]?.subscribed_fields || []).includes("leadgen"), all_fields: d.data?.[0]?.subscribed_fields || [] }));
        // DB: lead events
        try {
          const r = await pool.query(`SELECT COUNT(*) as c, MAX(created_at) as last FROM social_messages WHERE platform='facebook_leads'`);
          tests.push({ name: "DB: Lead Events Received", endpoint: "social_messages WHERE platform='facebook_leads'", ok: true, status: 200, ms: 0, data: { total: parseInt(r.rows[0]?.c || "0"), last_received: r.rows[0]?.last } });
        } catch { /* best-effort */ }
        void fields;
      } else {
        tests.push({ name: "Lead Ads Tests", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: "Page ID not configured" });
      }

    } else if (platform === "webhooks") {
      // Challenge self-test
      const verifyOk = !!webhookVerifyToken && !webhookVerifyToken.startsWith("http");
      const WEBHOOK_URL = "https://alburhantravels.com/api/social-media/webhook/meta";
      if (verifyOk) {
        const r = await gfetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken!)}&hub.challenge=platform_test_99887`);
        const raw = r.data?._raw ?? "";
        const challenged = String(raw).includes("platform_test_99887");
        tests.push({ name: "Live Webhook Challenge (Self-Test)", endpoint: WEBHOOK_URL, ok: challenged, status: r.status, ms: r.ms, data: { challenge_echoed: challenged, response: String(raw).slice(0, 50) }, error: !challenged ? "Challenge not echoed — verify token mismatch" : undefined });
      } else {
        tests.push({ name: "Webhook Challenge", endpoint: "skipped", ok: false, status: 0, ms: 0, data: null, error: !webhookVerifyToken ? "Verify token not configured" : "Verify token is a URL — must be a secret string" });
      }
      if (fbToken) {
        const subs = await gfetch(`${GRAPH}/me/subscribed_apps?access_token=${fbToken}`);
        addTest("GET /me/subscribed_apps (All Subscribed Fields)", `/me/subscribed_apps`, subs, d => ({ subscribed_fields: d.data?.[0]?.subscribed_fields || [], count: (d.data?.[0]?.subscribed_fields || []).length }));
      }
      // DB: all Meta events
      try {
        const r = await pool.query(`SELECT platform, COUNT(*) as c, MAX(created_at) as last FROM social_messages WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta') GROUP BY platform`);
        tests.push({ name: "DB: All Meta Events Received", endpoint: "social_messages GROUP BY platform", ok: r.rows.length > 0, status: 200, ms: 0, data: { by_platform: r.rows.map(row => ({ platform: row.platform, count: parseInt(row.c), last: row.last })), total: r.rows.reduce((sum: number, row: any) => sum + parseInt(row.c), 0) } });
      } catch { /* best-effort */ }
      // Last sync from social_platform_configs
      try {
        const r = await pool.query(`SELECT platform, last_tested, webhook_verified, status FROM social_platform_configs WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')`);
        tests.push({ name: "DB: Platform Sync Status", endpoint: "social_platform_configs.last_tested", ok: true, status: 200, ms: 0, data: { platforms: r.rows } });
      } catch { /* best-effort */ }

    } else {
      return void res.status(400).json({ ok: false, error: `Unknown platform: ${platform}. Valid: facebook, instagram, whatsapp, messenger, leads, webhooks` });
    }

    const passed = tests.filter(t => t.ok).length;
    const failed = tests.filter(t => !t.ok).length;
    summary.total = tests.length;
    summary.passed = passed;
    summary.failed = failed;

    res.json({ platform, ok: failed === 0, checkedAt: new Date().toISOString(), duration_ms: Date.now() - t0, tests, summary });
  } catch (e: any) {
    res.status(500).json({ ok: false, platform, error: e.message, tests, duration_ms: Date.now() - t0 });
  }
});

// ── POST /api/social-media/meta/subscribe-webhooks ──────────────────────────
// Subscribes the Facebook Page to all required webhook fields
router.post("/meta/subscribe-webhooks", requireAdmin as any, async (_req, res) => {
  const GRAPH = "https://graph.facebook.com/v19.0";
  try {
    const cfgRows = await pool.query(
      `SELECT platform, extra_fields_encrypted FROM social_platform_configs
       WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm')`
    );
    let fbToken: string | null = null;
    let pageId: string | null = null;
    for (const row of cfgRows.rows) {
      const extra = decryptExtra(row.extra_fields_encrypted);
      if (extra.page_access_token) fbToken = extra.page_access_token;
      if (extra.page_id) pageId = extra.page_id;
    }
    if (!fbToken) return void res.status(400).json({ ok: false, message: "Page Access Token not configured" });

    // If no page_id configured, try to get it from /me
    if (!pageId) {
      const meR = await axios.get(`${GRAPH}/me?fields=id&access_token=${fbToken}`, { timeout: 8000 });
      pageId = meR.data?.id;
    }
    if (!pageId) return void res.status(400).json({ ok: false, message: "Could not determine Page ID" });

    const FIELDS = [
      "messages","messaging_postbacks","message_deliveries","message_reads",
      "messaging_optins","messaging_referrals","leadgen","feed","mention",
      "instagram_manage_messages","instagram_manage_comments",
    ].join(",");

    const resp = await axios.post(
      `${GRAPH}/${pageId}/subscribed_apps`,
      null,
      { params: { subscribed_fields: FIELDS, access_token: fbToken }, timeout: 10000 }
    );

    if (resp.data?.success) {
      // Mark webhook_verified in DB for all Facebook platforms
      await pool.query(
        `UPDATE social_platform_configs SET webhook_verified=true WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm')`
      );
      res.json({ ok: true, message: `✅ Subscribed to ${FIELDS.split(",").length} webhook fields on Page ${pageId}`, page_id: pageId, fields: FIELDS.split(",") });
    } else {
      res.json({ ok: false, message: "Subscription returned unexpected response", detail: resp.data });
    }
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message;
    res.status(500).json({ ok: false, message: `Webhook subscription failed: ${msg}` });
  }
});

// ── POST /api/social-media/reply ─────────────────────────────────────────────
// Send a reply to a message via the appropriate platform API
router.post("/reply", requireAdmin as any, async (req, res) => {
  const { platform, sender_id, message_text, message_id } = req.body;
  if (!platform || !sender_id || !message_text?.trim()) {
    return void res.status(400).json({ ok: false, message: "platform, sender_id and message_text are required" });
  }
  try {
    const r = await pool.query(`SELECT * FROM social_platform_configs WHERE platform=$1`, [platform]);
    const row = r.rows[0];
    if (!row) return void res.status(404).json({ ok: false, message: "Platform not configured" });
    const extra = decryptExtra(row.extra_fields_encrypted);

    let sent = false;
    let sentDetail: any = null;

    if (platform === "telegram_bot") {
      const token = extra.bot_token;
      if (!token) return void res.status(400).json({ ok: false, message: "Telegram bot token not configured" });
      const resp = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: sender_id, text: message_text },
        { timeout: 10000 }
      );
      sent = resp.data?.ok === true;
      sentDetail = resp.data;
    } else if (["facebook_messenger", "instagram_dm"].includes(platform)) {
      const token = extra.page_access_token;
      if (!token) return void res.status(400).json({ ok: false, message: "Page access token not configured" });
      const resp = await axios.post(
        `https://graph.facebook.com/v19.0/me/messages`,
        { recipient: { id: sender_id }, message: { text: message_text } },
        { params: { access_token: token }, timeout: 10000 }
      );
      sent = !!resp.data?.message_id;
      sentDetail = resp.data;
    } else if (platform === "whatsapp_meta") {
      const token = extra.access_token;
      const phoneId = extra.phone_number_id;
      if (!token || !phoneId) return void res.status(400).json({ ok: false, message: "Access token and Phone Number ID required" });
      const resp = await axios.post(
        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
        { messaging_product: "whatsapp", to: sender_id, type: "text", text: { body: message_text } },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 10000 }
      );
      sent = !!resp.data?.messages?.[0]?.id;
      sentDetail = resp.data;
    } else {
      return void res.status(400).json({ ok: false, message: `Reply not supported for ${platform}` });
    }

    if (sent) {
      await pool.query(`
        INSERT INTO social_messages (platform, message_id, sender_id, message_text, message_type, direction, status)
        VALUES ($1,$2,$3,$4,'text','outgoing','sent')
      `, [platform, `reply_${Date.now()}`, sender_id, message_text]);
      if (message_id) {
        await pool.query(`UPDATE social_messages SET status='replied', replied_at=NOW(), reply_text=$1 WHERE id=$2`,
          [message_text, message_id]);
      }
    }

    res.json({ ok: sent, message: sent ? "Reply sent" : "Send failed", detail: sentDetail });
  } catch (e: any) {
    const errMsg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    res.status(500).json({ ok: false, message: `Reply failed: ${errMsg}` });
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH HUB — Real OAuth flows for Meta, Google, Telegram
// ═══════════════════════════════════════════════════════════════════════════

const OAUTH_REDIRECT_BASE = "https://alburhantravels.com/api/social-media/oauth";

// ── Ensure oauth_connections table ───────────────────────────────────────────
async function ensureOAuthTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_connections (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider      TEXT NOT NULL,
        platform      TEXT NOT NULL,
        account_name  TEXT,
        account_id    TEXT,
        access_token  TEXT,
        refresh_token TEXT,
        token_expiry  TIMESTAMPTZ,
        scope         TEXT,
        extra         JSONB DEFAULT '{}',
        connected_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (provider, platform)
      )
    `);
  } catch {}
}
ensureOAuthTable();

// ── GET /oauth/status — List all connected OAuth accounts ────────────────────
router.get("/oauth/status", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT provider, platform, account_name, account_id, connected_at, updated_at,
              token_expiry, scope,
              CASE WHEN access_token IS NOT NULL THEN true ELSE false END AS connected
       FROM oauth_connections ORDER BY connected_at DESC`
    );
    res.json({ connections: r.rows });
  } catch (e: any) {
    res.json({ connections: [] });
  }
});

// ── GET /oauth/:provider/start — Initiate OAuth redirect ────────────────────
router.get("/oauth/:provider/start", requireAdmin as any, async (req: any, res: any) => {
  const { provider } = req.params;
  const { platform = provider } = req.query as any;

  try {
    if (provider === "meta") {
      // Load Meta app credentials from DB
      const cfgR = await pool.query(
        `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform='facebook_page' LIMIT 1`
      );
      const extra = cfgR.rows[0] ? decryptExtra(cfgR.rows[0].extra_fields_encrypted) : {};
      const appId = extra.app_id || process.env.META_APP_ID;
      if (!appId) {
        return void res.status(400).json({
          error: "Meta App ID not configured",
          instruction: "Go to Social Media → Facebook Page → configure App ID and App Secret first",
        });
      }
      const scope = [
        "pages_manage_metadata", "pages_read_engagement", "pages_messaging",
        "instagram_basic", "instagram_manage_messages",
        "leads_retrieval", "whatsapp_business_messaging",
        "business_management", "public_profile", "email",
      ].join(",");
      const state = `meta:${platform}:${Date.now()}`;
      const callbackUrl = `${OAUTH_REDIRECT_BASE}/meta/callback`;
      const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
      res.json({ redirect_url: url, provider: "meta", platform, state });

    } else if (provider === "google") {
      // Load Google credentials from DB or env
      const cfgR = await pool.query(
        `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform='google' LIMIT 1`
      ).catch(() => ({ rows: [] }));
      const extra = cfgR.rows[0] ? decryptExtra(cfgR.rows[0].extra_fields_encrypted) : {};
      const clientId = extra.client_id || process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return void res.status(400).json({
          error: "Google Client ID not configured",
          instruction: "Go to Social Media → Google → configure Client ID and Client Secret first",
        });
      }
      const platformScopes: Record<string, string> = {
        google_business:  "https://www.googleapis.com/auth/business.manage",
        google_calendar:  "https://www.googleapis.com/auth/calendar",
        google_drive:     "https://www.googleapis.com/auth/drive",
        youtube:          "https://www.googleapis.com/auth/youtube",
        google:           "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      };
      const scope = (platformScopes[String(platform)] || platformScopes.google) + " openid email profile";
      const state = `google:${platform}:${Date.now()}`;
      const callbackUrl = `${OAUTH_REDIRECT_BASE}/google/callback`;
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code&access_type=offline&prompt=consent`;
      res.json({ redirect_url: url, provider: "google", platform, state });

    } else if (provider === "telegram") {
      res.json({
        provider: "telegram",
        instruction: "Telegram uses a bot token (not OAuth). Go to @BotFather on Telegram, create a bot, and paste the token in Social Media → Telegram settings.",
        manual: true,
      });
    } else {
      res.status(400).json({ error: `Unknown OAuth provider: ${provider}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /oauth/meta/callback — Meta OAuth callback ───────────────────────────
router.get("/oauth/meta/callback", async (req: any, res: any) => {
  const { code, state, error: oauthError } = req.query as any;
  if (oauthError) {
    return void res.redirect(`/admin/social-oauth?error=${encodeURIComponent(oauthError)}`);
  }
  const [, platform] = (state || "meta::").split(":");
  try {
    const cfgR = await pool.query(
      `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform='facebook_page' LIMIT 1`
    );
    const extra = cfgR.rows[0] ? decryptExtra(cfgR.rows[0].extra_fields_encrypted) : {};
    const appId     = extra.app_id     || process.env.META_APP_ID;
    const appSecret = extra.app_secret || process.env.META_APP_SECRET;
    const callbackUrl = `${OAUTH_REDIRECT_BASE}/meta/callback`;

    const tokenResp = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${appSecret}&code=${code}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const tokenData = await tokenResp.json() as any;
    if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));

    // Exchange for long-lived token
    let longToken = tokenData.access_token;
    try {
      const llR = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`, { signal: AbortSignal.timeout(10000) });
      const ll = await llR.json() as any;
      if (ll.access_token) longToken = ll.access_token;
    } catch {}

    // Get account info
    const meR = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${longToken}`, { signal: AbortSignal.timeout(8000) });
    const me = await meR.json() as any;
    const expiry = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    await pool.query(
      `INSERT INTO oauth_connections (provider, platform, account_name, account_id, access_token, token_expiry, scope, connected_at, updated_at)
       VALUES ('meta', $1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (provider, platform) DO UPDATE
         SET account_name=EXCLUDED.account_name, account_id=EXCLUDED.account_id,
             access_token=EXCLUDED.access_token, token_expiry=EXCLUDED.token_expiry,
             scope=EXCLUDED.scope, updated_at=NOW()`,
      [platform || "facebook_page", me.name || "Meta Account", me.id, encrypt(longToken), expiry, "pages_manage_metadata,pages_messaging,instagram_basic"]
    );
    res.redirect(`/admin/social-oauth?connected=meta&account=${encodeURIComponent(me.name || "Meta Account")}`);
  } catch (e: any) {
    res.redirect(`/admin/social-oauth?error=${encodeURIComponent(e.message)}`);
  }
});

// ── GET /oauth/google/callback — Google OAuth callback ───────────────────────
router.get("/oauth/google/callback", async (req: any, res: any) => {
  const { code, state, error: oauthError } = req.query as any;
  if (oauthError) {
    return void res.redirect(`/admin/social-oauth?error=${encodeURIComponent(oauthError)}`);
  }
  const [, platform] = (state || "google::").split(":");
  try {
    const cfgR = await pool.query(
      `SELECT extra_fields_encrypted FROM social_platform_configs WHERE platform='google' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const extra = cfgR.rows[0] ? decryptExtra(cfgR.rows[0].extra_fields_encrypted) : {};
    const clientId     = extra.client_id     || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = extra.client_secret || process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl  = `${OAUTH_REDIRECT_BASE}/google/callback`;

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenResp.json() as any;
    if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));

    const userR = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`, { signal: AbortSignal.timeout(8000) });
    const user  = await userR.json() as any;
    const expiry = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    await pool.query(
      `INSERT INTO oauth_connections (provider, platform, account_name, account_id, access_token, refresh_token, token_expiry, scope, connected_at, updated_at)
       VALUES ('google', $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (provider, platform) DO UPDATE
         SET account_name=EXCLUDED.account_name, account_id=EXCLUDED.account_id,
             access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
             token_expiry=EXCLUDED.token_expiry, scope=EXCLUDED.scope, updated_at=NOW()`,
      [platform || "google", user.name || user.email, user.id, encrypt(tokenData.access_token), tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null, expiry, tokenData.scope]
    );
    res.redirect(`/admin/social-oauth?connected=google&account=${encodeURIComponent(user.name || user.email)}`);
  } catch (e: any) {
    res.redirect(`/admin/social-oauth?error=${encodeURIComponent(e.message)}`);
  }
});

// ── DELETE /oauth/:provider/disconnect — Remove OAuth connection ─────────────
router.delete("/oauth/:provider/disconnect", requireAdmin as any, async (req: any, res: any) => {
  const { provider } = req.params;
  const { platform } = req.query as any;
  try {
    await pool.query(
      `DELETE FROM oauth_connections WHERE provider=$1 AND platform=$2`,
      [provider, platform || provider]
    );
    res.json({ ok: true, message: `Disconnected ${provider}/${platform}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

