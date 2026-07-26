// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import {
  checkMetaWapiHealth,
  validateMetaToken,
  syncMetaTemplates,
  processMetaRetryQueue,
  isMetaWapiConfigured,
  getMissingMetaSecrets,
  META_EVENT_TEMPLATE_MAP,
  sendMetaEventTemplate,
} from "../lib/metaWapi.js";

const router = Router();

// ── GET /api/meta/health — comprehensive JSON health check (no auth needed) ──
router.get("/health", async (req, res) => {
  const configured = isMetaWapiConfigured();
  const missing    = getMissingMetaSecrets();

  // Connection health
  const waHealth = await checkMetaWapiHealth().catch(() => ({
    status: "down" as const, detail: "Error checking Meta API", configured,
  }));

  // DB stats (7 days)
  const queueStats: Record<string, number> = { total: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, retrying: 0, expired: 0 };
  let templateCount = 0;
  let tokenStatus: any = null;
  let recentErrors: any[] = [];
  let lastOkR: any = null;

  try {
    const [msgR, tplR, tokR, errR, _lastOkR] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) cnt FROM meta_messages WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY status`),
      pool.query(`SELECT COUNT(*) FROM meta_templates WHERE status='APPROVED'`),
      pool.query(`SELECT * FROM meta_token_status WHERE id='current'`),
      pool.query(`SELECT wamid, error_message, error_code, created_at FROM meta_messages WHERE status='failed' ORDER BY created_at DESC LIMIT 5`),
      pool.query(`SELECT wamid, recipient, template_name, event_type, created_at FROM meta_messages WHERE status IN ('delivered','read') ORDER BY created_at DESC LIMIT 1`),
    ]);
    for (const r of msgR.rows) {
      queueStats[r.status] = parseInt(r.cnt);
      queueStats.total += parseInt(r.cnt);
    }
    templateCount = parseInt(tplR.rows[0]?.count || "0");
    tokenStatus   = tokR.rows[0] || null;
    recentErrors  = errR.rows;
    lastOkR       = _lastOkR;
  } catch {}

  const total        = queueStats.total || 1;
  const deliveryRate = Math.round(((queueStats.delivered + queueStats.read) / total) * 100);
  const failureRate  = Math.round((queueStats.failed / total) * 100);
  const readRate     = Math.round((queueStats.read / total) * 100);

  // Score 0-100
  const score = configured
    ? Math.min(100,
        (waHealth.status === "ok" ? 40 : 0) +
        (templateCount > 0 ? 20 : 0) +
        (deliveryRate > 80 ? 20 : deliveryRate > 50 ? 10 : 0) +
        (failureRate < 10 ? 20 : failureRate < 30 ? 10 : 0) +
        (missing.length === 0 ? 0 : 0)  // no bonus for secrets — missing already shown
      )
    : 0;

  const lastMsg = lastOkR?.rows[0] || null;
  const securityStatus = {
    webhookSignatureEnabled: !!(process.env.META_WEBHOOK_SECRET),
    appSecretConfigured:     !!(process.env.META_APP_SECRET),
    tokenValid:              tokenStatus?.token_valid || false,
    missingSecretCount:      missing.length,
    status: missing.length === 0 && tokenStatus?.token_valid ? "secure" : missing.length > 0 ? "pending_secrets" : "token_invalid",
  };

  res.json({
    ok: waHealth.status === "ok",
    configured,
    connection: waHealth.status,
    connectionDetail: waHealth.detail,
    webhook: "https://alburhantravels.online/api/social-media/webhook/meta",
    phoneNumber: tokenStatus?.phone_number || null,
    verifiedName: tokenStatus?.verified_name || null,
    business: {
      wabaId: process.env.META_WABA_ID || null,
      accountId: process.env.META_BUSINESS_ACCOUNT_ID || null,
    },
    templates: {
      approved: templateCount,
      mapped: Object.keys(META_EVENT_TEMPLATE_MAP).length,
    },
    token: {
      valid: tokenStatus?.token_valid || false,
      expiresAt: tokenStatus?.token_expires_at || null,
      lastChecked: tokenStatus?.last_checked_at || null,
      permissions: tokenStatus?.permissions ? JSON.parse(tokenStatus.permissions) : [],
    },
    queue: queueStats,
    deliveryRate,
    failureRate,
    readRate,
    retryCount: queueStats.retrying,
    failedCount: queueStats.failed,
    recentErrors,
    lastSuccessfulMessage: lastMsg ? {
      wamid: lastMsg.wamid,
      recipient: lastMsg.recipient,
      templateName: lastMsg.template_name,
      eventType: lastMsg.event_type,
      sentAt: lastMsg.created_at,
    } : null,
    securityStatus,
    score,
    missingSecrets: missing,
    version: process.env.META_API_VERSION || "v20.0",
    buildStamp: process.env.BUILD_STAMP || "v30.0-meta-production",
    provider: "MetaCloudAPI",
    fallback: "BotBee",
  });
});

// ── GET /api/meta/stats — detailed delivery stats ────────────────────────────
router.get("/stats", requireAdmin as any, async (req, res) => {
  try {
    const [msgStats, dlvStats, tplStats, tokenStat, retryStats] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) cnt FROM meta_messages GROUP BY status ORDER BY status`),
      pool.query(`SELECT status, COUNT(*) cnt FROM meta_delivery_logs WHERE created_at > NOW()-INTERVAL '24 hours' GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) cnt FROM meta_templates GROUP BY status ORDER BY status`),
      pool.query(`SELECT * FROM meta_token_status WHERE id='current'`),
      pool.query(`SELECT retry_count, COUNT(*) cnt FROM meta_messages WHERE status IN ('retrying','failed') GROUP BY retry_count ORDER BY retry_count`),
    ]);
    res.json({
      messages:    msgStats.rows,
      deliveries:  dlvStats.rows,
      templates:   tplStats.rows,
      tokenStatus: tokenStat.rows[0] || null,
      retryBreakdown: retryStats.rows,
      missingSecrets: getMissingMetaSecrets(),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/meta/templates — list synced templates ──────────────────────────
router.get("/templates", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT template_name, status, category, language, variable_count, event_type, synced_at
       FROM meta_templates ORDER BY status DESC, template_name`
    );
    res.json({ templates: r.rows, eventMap: META_EVENT_TEMPLATE_MAP });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/meta/sync-templates — pull from Meta WABA API ─────────────────
router.post("/sync-templates", requireAdmin as any, async (req, res) => {
  try {
    const result = await syncMetaTemplates();
    res.json(result);
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/meta/validate-token — validate token + permissions ─────────────
router.post("/validate-token", requireAdmin as any, async (req, res) => {
  try {
    const result = await validateMetaToken();
    res.json(result);
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/meta/retry — trigger retry queue ───────────────────────────────
router.post("/retry", requireAdmin as any, async (req, res) => {
  try {
    const result = await processMetaRetryQueue();
    res.json({ ok: true, ...result });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/meta/missing-secrets — list unconfigured secrets ────────────────
router.get("/missing-secrets", requireAdmin as any, async (req, res) => {
  res.json({ missing: getMissingMetaSecrets(), total: 8, configured: 8 - getMissingMetaSecrets().length });
});

// ── POST /api/meta/test-send — test send to a number (admin only) ────────────
router.post("/test-send", requireAdmin as any, async (req, res) => {
  const { mobile, eventType = "new_booking", customerName = "Test Customer", bookingNumber = "TEST-001" } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, error: "mobile required" });
  try {
    const result = await sendMetaEventTemplate(eventType, {
      customerMobile: mobile.trim(), customerName, bookingNumber, packageName: "Test Package",
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/meta/messages — recent message log ──────────────────────────────
router.get("/messages", requireAdmin as any, async (req, res) => {
  try {
    const limit  = Math.min(100, parseInt(String(req.query.limit || "50")));
    const status = req.query.status as string | undefined;
    const r = await pool.query(
      `SELECT id, wamid, recipient, template_name, event_type, status, retry_count, error_message, created_at
       FROM meta_messages
       ${status ? "WHERE status=$2" : ""}
       ORDER BY created_at DESC LIMIT $1`,
      status ? [limit, status] : [limit]
    );
    res.json({ messages: r.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/meta/delivery-logs — recent delivery callbacks ──────────────────
router.get("/delivery-logs", requireAdmin as any, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(String(req.query.limit || "50")));
    const r = await pool.query(
      `SELECT id, wamid, status, timestamp, conversation_id, error_code, error_title, created_at
       FROM meta_delivery_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ logs: r.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
