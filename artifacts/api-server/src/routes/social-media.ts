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
      status VARCHAR(50) DEFAULT 'unread',
      assigned_to INTEGER,
      notes TEXT,
      replied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_platform ON social_messages(platform)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_messages_status ON social_messages(status)`);
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

// ── PLATFORM DEFINITIONS ─────────────────────────────────────────────────────
const PLATFORM_META = {
  whatsapp_meta: {
    group: "WhatsApp", name: "WhatsApp Cloud API",
    fields: ["access_token", "phone_number_id", "waba_id", "webhook_verify_token"],
    sensitiveFields: ["access_token"],
    webhookPath: "/api/webhook/meta",
  },
  facebook_page: {
    group: "Facebook", name: "Facebook Page",
    fields: ["page_access_token", "page_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/webhook/meta",
  },
  facebook_messenger: {
    group: "Facebook", name: "Facebook Messenger",
    fields: ["page_access_token", "page_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/webhook/meta",
  },
  facebook_leads: {
    group: "Facebook", name: "Facebook Lead Ads",
    fields: ["page_access_token", "page_id", "form_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/webhook/meta",
  },
  instagram: {
    group: "Instagram", name: "Instagram Business",
    fields: ["page_access_token", "instagram_account_id", "app_id", "app_secret", "webhook_verify_token"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/webhook/meta",
  },
  instagram_dm: {
    group: "Instagram", name: "Instagram Direct Messages",
    fields: ["page_access_token", "instagram_account_id", "app_id", "app_secret"],
    sensitiveFields: ["page_access_token", "app_secret"],
    webhookPath: "/api/webhook/meta",
  },
  telegram_bot: {
    group: "Telegram", name: "Telegram Bot",
    fields: ["bot_token", "bot_username", "webhook_secret"],
    sensitiveFields: ["bot_token", "webhook_secret"],
    webhookPath: "/api/webhook/telegram",
  },
  telegram_channel: {
    group: "Telegram", name: "Telegram Channel",
    fields: ["bot_token", "channel_id", "channel_username"],
    sensitiveFields: ["bot_token"],
    webhookPath: "/api/webhook/telegram",
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
        platform: r.platform,
        enabled: r.enabled,
        status: r.status,
        webhook_url: r.webhook_url,
        webhook_verified: r.webhook_verified,
        last_tested: r.last_tested,
        last_sync: r.last_sync,
        test_result: r.test_result,
        extra_fields: maskedExtra,
        has_key: !!r.api_key_encrypted,
        updated_at: r.updated_at,
      };
    }

    const apiMap: Record<string, any> = {};
    for (const r of apiRows.rows) {
      apiMap[r.provider] = r;
    }

    // Managed platforms (from api_settings)
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
        platform: m.platform,
        group: m.group,
        name: m.name,
        managed: true,
        managed_by: "api_settings",
        managed_provider: m.apiKey,
        enabled: api.enabled !== false,
        status: api.enabled !== false ? (api.status || "connected") : "disconnected",
        last_tested: api.last_tested,
      };
    });

    // Website built-in channels (always connected)
    const website = [
      "website_contact", "website_booking", "website_support",
      "website_inquiry", "website_livechat", "website_ai_chat",
    ].map(p => ({
      platform: p,
      group: "Website",
      name: p.replace("website_", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      builtin: true,
      enabled: true,
      status: "connected",
    }));

    // Custom platforms from social_platform_configs
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
      const isSensitive = meta?.sensitiveFields?.includes(k);
      maskedExtra[k] = isSensitive ? maskVal(String(v)) : String(v ?? "");
    }
    res.json({
      platform,
      configured: true,
      enabled: row.enabled,
      status: row.status,
      webhook_url: row.webhook_url,
      webhook_verified: row.webhook_verified,
      last_tested: row.last_tested,
      test_result: row.test_result,
      extra_fields: maskedExtra,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/social-media/platforms/:platform ────────────────────────────────
router.put("/platforms/:platform", requireAdmin as any, async (req, res) => {
  try {
    const { platform } = req.params;
    if (!PLATFORM_META[platform as keyof typeof PLATFORM_META]) {
      return void res.status(400).json({ message: "Unknown platform" });
    }
    const { enabled, extra_fields } = req.body;

    // Load existing to preserve encrypted values for masked placeholders
    const existing = await pool.query(`SELECT * FROM social_platform_configs WHERE platform=$1`, [platform]);
    const existingRow = existing.rows[0];
    let existingExtra: Record<string, any> = decryptExtra(existingRow?.extra_fields_encrypted);

    // Merge: only overwrite non-masked values
    const newExtra: Record<string, any> = { ...existingExtra };
    if (extra_fields && typeof extra_fields === "object") {
      for (const [k, v] of Object.entries(extra_fields as Record<string, string>)) {
        const val = String(v ?? "").trim();
        if (val && !val.startsWith("••")) {
          newExtra[k] = val;
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
      await pool.query(`
        UPDATE social_platform_configs
        SET enabled=$1, extra_fields_encrypted=$2, api_key_encrypted=$3, webhook_url=$4, status=$5, updated_at=NOW()
        WHERE platform=$6
      `, [isEnabled, encExtra, encKey, webhookUrl, isEnabled ? "configured" : "disconnected", platform]);
    } else {
      await pool.query(`
        INSERT INTO social_platform_configs (platform, enabled, extra_fields_encrypted, api_key_encrypted, webhook_url, status)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [platform, isEnabled, encExtra, encKey, webhookUrl, isEnabled ? "configured" : "disconnected"]);
    }

    res.json({ ok: true, message: `${meta.name} configuration saved.` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
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
      if (!token) {
        testResult = { ok: false, message: "Bot token not configured" };
      } else {
        try {
          const resp = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10000 });
          if (resp.data?.ok) {
            const bot = resp.data.result;
            testResult = {
              ok: true,
              message: `✅ Connected to @${bot.username} (${bot.first_name})`,
              detail: { bot_id: bot.id, username: bot.username, first_name: bot.first_name, can_join_groups: bot.can_join_groups },
            };
          } else {
            testResult = { ok: false, message: "Telegram API returned error", detail: resp.data };
          }
        } catch (e: any) {
          testResult = { ok: false, message: `Telegram API error: ${e?.response?.data?.description || e?.message}` };
        }
      }
    } else if (["facebook_page", "facebook_messenger", "facebook_leads", "instagram", "instagram_dm"].includes(platform)) {
      const token = extra.page_access_token;
      if (!token) {
        testResult = { ok: false, message: "Page access token not configured" };
      } else {
        try {
          const resp = await axios.get(`https://graph.facebook.com/v19.0/me`, {
            params: { access_token: token, fields: "id,name,category" },
            timeout: 10000,
          });
          testResult = {
            ok: true,
            message: `✅ Connected: ${resp.data.name} (ID: ${resp.data.id})`,
            detail: resp.data,
          };
        } catch (e: any) {
          const detail = e?.response?.data?.error;
          testResult = { ok: false, message: `Meta API error: ${detail?.message || e?.message}`, detail };
        }
      }
    } else if (platform === "whatsapp_meta") {
      const token = extra.access_token;
      const phoneId = extra.phone_number_id;
      if (!token || !phoneId) {
        testResult = { ok: false, message: "Access token and Phone Number ID required" };
      } else {
        try {
          const resp = await axios.get(`https://graph.facebook.com/v19.0/${phoneId}`, {
            params: { access_token: token },
            timeout: 10000,
          });
          testResult = {
            ok: true,
            message: `✅ WhatsApp Phone: ${resp.data.display_phone_number || phoneId}`,
            detail: resp.data,
          };
        } catch (e: any) {
          const detail = e?.response?.data?.error;
          testResult = { ok: false, message: `Meta API error: ${detail?.message || e?.message}`, detail };
        }
      }
    } else if (platform === "google_rcs") {
      const apiKey = extra.api_key;
      if (!apiKey) {
        testResult = { ok: false, message: "Google RCS API key not configured" };
      } else {
        testResult = { ok: true, message: "✅ Google RCS configuration saved. Full verification requires Google Business Messaging console approval." };
      }
    } else if (platform === "jio_rcs") {
      const username = extra.username;
      const password = extra.password;
      if (!username || !password) {
        testResult = { ok: false, message: "Username and password required for Jio RCS" };
      } else {
        testResult = { ok: true, message: "✅ Jio RCS credentials saved. Contact Jio for webhook activation." };
      }
    } else if (platform === "firebase") {
      const serverKey = extra.server_key;
      if (!serverKey) {
        testResult = { ok: false, message: "Firebase Server Key not configured" };
      } else {
        try {
          const resp = await axios.post(
            "https://fcm.googleapis.com/fcm/send",
            { registration_ids: ["test_dry_run"], dry_run: true },
            { headers: { Authorization: `key=${serverKey}`, "Content-Type": "application/json" }, timeout: 8000 }
          );
          if (resp.data?.failure === 1 && resp.data?.results?.[0]?.error === "InvalidRegistration") {
            testResult = { ok: true, message: "✅ Firebase Server Key is valid (dry run succeeded)", detail: resp.data };
          } else {
            testResult = { ok: true, message: "✅ Firebase connected", detail: resp.data };
          }
        } catch (e: any) {
          if (e?.response?.status === 401) {
            testResult = { ok: false, message: "Invalid Firebase Server Key (401 Unauthorized)" };
          } else {
            testResult = { ok: false, message: `Firebase error: ${e?.message}` };
          }
        }
      }
    } else {
      testResult = { ok: true, message: "Configuration saved. Live test not available for this platform." };
    }

    await pool.query(`
      UPDATE social_platform_configs
      SET status=$1, last_tested=NOW(), test_result=$2
      WHERE platform=$3
    `, [testResult.ok ? "connected" : "error", JSON.stringify(testResult), platform]);

    res.json({ ...testResult, platform, tested_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ── POST /api/social-media/platforms/:platform/disconnect ────────────────────
router.post("/platforms/:platform/disconnect", requireAdmin as any, async (req, res) => {
  try {
    const { platform } = req.params;
    await pool.query(`
      UPDATE social_platform_configs
      SET enabled=false, status='disconnected', updated_at=NOW()
      WHERE platform=$1
    `, [platform]);
    res.json({ ok: true, message: "Platform disconnected" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/social-media/messages ──────────────────────────────────────────
router.get("/messages", requireAdmin as any, async (req, res) => {
  try {
    const { platform, status, limit = "50", offset = "0" } = req.query as any;
    let where = "WHERE 1=1";
    const params: any[] = [];
    if (platform && platform !== "all") { params.push(platform); where += ` AND platform=$${params.length}`; }
    if (status && status !== "all") { params.push(status); where += ` AND status=$${params.length}`; }
    params.push(parseInt(limit)); params.push(parseInt(offset));

    const [msgs, countR] = await Promise.all([
      pool.query(`
        SELECT m.*, u.name as assigned_name
        FROM social_messages m
        LEFT JOIN users u ON u.id = m.assigned_to
        ${where}
        ORDER BY m.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      pool.query(`SELECT COUNT(*) FROM social_messages ${where.replace(/ LIMIT.*| OFFSET.*/g, "")}`,
        params.slice(0, params.length - 2)),
    ]);

    res.json({ messages: msgs.rows, total: parseInt(countR.rows[0].count), limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/social-media/messages/:id/assign ───────────────────────────────
router.post("/messages/:id/assign", requireAdmin as any, async (req, res) => {
  try {
    const { user_id, status, notes } = req.body;
    await pool.query(`
      UPDATE social_messages SET assigned_to=$1, status=$2, notes=$3 WHERE id=$4
    `, [user_id || null, status || "in_progress", notes || null, req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/social-media/analytics ─────────────────────────────────────────
router.get("/analytics", requireAdmin as any, async (_req, res) => {
  try {
    const [platforms, msgs, msgsByPlat, notifStats, msgsByDay] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='connected') as connected,
                          COUNT(*) FILTER (WHERE status='disconnected' OR status='error') as disconnected,
                          COUNT(*) as total
                   FROM social_platform_configs`),
      pool.query(`SELECT COUNT(*) as total,
                          COUNT(*) FILTER (WHERE status='unread') as unread,
                          COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '24h') as today
                   FROM social_messages`),
      pool.query(`SELECT platform, COUNT(*) as count FROM social_messages GROUP BY platform ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT channel::text, COUNT(*) as total,
                          COUNT(*) FILTER (WHERE status='sent') as sent,
                          COUNT(*) FILTER (WHERE status='failed') as failed
                   FROM notification_logs WHERE created_at >= NOW()-INTERVAL '7d' GROUP BY channel`),
      pool.query(`SELECT DATE(created_at) as day, COUNT(*) as count
                   FROM social_messages WHERE created_at >= NOW()-INTERVAL '7d'
                   GROUP BY day ORDER BY day`),
    ]);

    // Count built-in + managed as connected
    const builtInCount = 6; // website channels
    const managedCount = 5; // botbee, fast2sms, smtp, firebase, lemin
    const totalConnected = parseInt(platforms.rows[0]?.connected || "0") + builtInCount + managedCount;

    res.json({
      platforms: {
        connected: totalConnected,
        disconnected: parseInt(platforms.rows[0]?.disconnected || "0"),
        total_configured: parseInt(platforms.rows[0]?.total || "0") + builtInCount + managedCount,
      },
      messages: msgs.rows[0],
      byPlatform: msgsByPlat.rows,
      notifications: notifStats.rows,
      byDay: msgsByDay.rows,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Webhook: Telegram ────────────────────────────────────────────────────────
router.post("/webhook/telegram", async (req, res) => {
  res.json({ ok: true }); // Acknowledge immediately
  try {
    const update = req.body;
    const msg = update.message || update.edited_message || update.channel_post;
    if (!msg) return;

    const senderName = msg.from
      ? `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim()
      : "Unknown";
    const text = msg.text || msg.caption || "[media]";
    const chatId = String(msg.chat?.id);

    await pool.query(`
      INSERT INTO social_messages (platform, message_id, sender_id, sender_name, sender_phone, message_text, message_type, raw_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING
    `, [
      "telegram_bot",
      String(update.update_id),
      chatId,
      senderName,
      msg.from?.username ? `@${msg.from.username}` : null,
      text,
      msg.photo ? "photo" : msg.document ? "document" : msg.voice ? "voice" : "text",
      JSON.stringify(update),
    ]);
  } catch (e: any) {
    console.error("[SocialMedia] Telegram webhook error:", e.message);
  }
});

// ── Webhook: Meta (Facebook / Instagram) ────────────────────────────────────
router.get("/webhook/meta", async (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Check against stored verify tokens
    const rows = await pool.query(`
      SELECT extra_fields_encrypted FROM social_platform_configs
      WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')
      AND enabled=true
    `);

    let verified = false;
    for (const row of rows.rows) {
      const extra = decryptExtra(row.extra_fields_encrypted);
      if (mode === "subscribe" && token && token === extra.webhook_verify_token) {
        verified = true;
        break;
      }
    }

    if (verified) {
      await pool.query(`
        UPDATE social_platform_configs SET webhook_verified=true
        WHERE platform IN ('facebook_page','facebook_messenger','facebook_leads','instagram','instagram_dm','whatsapp_meta')
        AND enabled=true
      `);
      return void res.status(200).send(challenge);
    }
    res.status(403).json({ error: "Verification failed" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/webhook/meta", async (req, res) => {
  res.json({ ok: true });
  try {
    const body = req.body;
    const object = body.object;
    const entries = body.entry || [];

    for (const entry of entries) {
      // Messenger / Page messages
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (!event.message) continue;
        const platform = object === "instagram" ? "instagram_dm" : "facebook_messenger";
        await pool.query(`
          INSERT INTO social_messages (platform, message_id, sender_id, message_text, message_type, raw_data)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
        `, [
          platform,
          event.message.mid || String(Date.now()),
          String(event.sender?.id),
          event.message.text || "[attachment]",
          event.message.attachments ? "attachment" : "text",
          JSON.stringify(event),
        ]);
      }

      // Lead Ads
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === "leadgen" && change.value) {
          await pool.query(`
            INSERT INTO social_messages (platform, message_id, sender_id, message_text, message_type, raw_data)
            VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
          `, [
            "facebook_leads",
            String(change.value.leadgen_id || Date.now()),
            String(change.value.page_id || "unknown"),
            `Lead from form ${change.value.form_id}`,
            "lead",
            JSON.stringify(change.value),
          ]);
        }
      }
    }
  } catch (e: any) {
    console.error("[SocialMedia] Meta webhook error:", e.message);
  }
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
      await pool.query(`UPDATE social_platform_configs SET webhook_url=$1, webhook_verified=true WHERE platform='telegram_bot'`, [webhookUrl]);
      res.json({ ok: true, message: `✅ Telegram webhook set: ${webhookUrl}`, detail: resp.data });
    } else {
      res.json({ ok: false, message: "Telegram webhook failed", detail: resp.data });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.response?.data?.description || e?.message });
  }
});

export default router;
