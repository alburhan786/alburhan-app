// @ts-nocheck
import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import {
  getVapidPublicKey,
  storeSubscription,
  removeSubscription,
  getSubscriptionCount,
} from "../lib/webPush.js";
import { getTenantId } from "../lib/tenantContext.js";
import {
  isFirebaseConfigured,
  getFirebaseWebConfig,
  sendFCMToToken,
  sendFCMBatch,
  cleanupInvalidTokens,
  getTokensByFilter,
  logPushCampaign,
  testFCMConnection,
} from "../lib/fcm.js";
import { pool } from "@workspace/db";

const router = Router();

// ── Public: Firebase web SDK config (safe to expose — not secrets) ────────────
router.get("/firebase-web-config", (_req, res) => {
  res.json(getFirebaseWebConfig());
});

// ── Public: VAPID key ─────────────────────────────────────────────────────────
router.get("/vapid-key", async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch {
    res.status(500).json({ error: "Failed to retrieve VAPID key" });
  }
});

// ── Customer/Staff/Admin: Register FCM token ──────────────────────────────────
router.post("/register-token", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { token, userType, platform, browser, operatingSystem, deviceInfo } = req.body;
  if (!token || typeof token !== "string" || token.length < 10) {
    return res.status(400).json({ error: "Valid FCM token required" });
  }

  // Resolve user_type: trust the session role
  const sessionRole = (req.session as any)?.role || userType || "customer";
  const resolvedUserType = sessionRole;

  try {
    await pool.query(
      `INSERT INTO customer_push_tokens
         (id, customer_id, user_id, user_type, token, platform, browser, operating_system, device_info, last_seen, updated_at, created_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
       ON CONFLICT (customer_id, token) DO UPDATE
         SET user_id         = EXCLUDED.user_id,
             user_type       = EXCLUDED.user_type,
             platform        = EXCLUDED.platform,
             browser         = EXCLUDED.browser,
             operating_system= EXCLUDED.operating_system,
             device_info     = EXCLUDED.device_info,
             last_seen       = NOW(),
             updated_at      = NOW()`,
      [randomUUID(), userId, resolvedUserType, token, platform || "web", browser || null, operatingSystem || null, deviceInfo || null]
    );
    console.log(`[FCM] Token registered: user=${userId} type=${resolvedUserType} platform=${platform} browser=${browser}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[FCM] register-token error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Heartbeat: update last_seen (called every 30 min by frontend) ─────────────
router.post("/heartbeat", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const { token } = req.body;
  if (!token) return res.json({ ok: true }); // silently ok
  try {
    await pool.query(
      `UPDATE customer_push_tokens SET last_seen = NOW() WHERE (user_id = $1 OR customer_id = $1) AND token = $2`,
      [userId, token]
    );
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // non-fatal
  }
});

// ── Customer/Staff/Admin: Remove FCM token ────────────────────────────────────
router.post("/unregister-token", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  try {
    await pool.query(
      `DELETE FROM customer_push_tokens WHERE (user_id = $1 OR customer_id = $1) AND token = $2`,
      [userId, token]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Push subscription status for current user ─────────────────────────────────
router.get("/status", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const [fcmRes, vapidRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS cnt, MAX(last_seen) AS last_seen
         FROM customer_push_tokens
         WHERE (user_id = $1 OR customer_id = $1) AND token IS NOT NULL AND length(token) > 10`,
        [userId]
      ),
      getSubscriptionCount(userId).catch(() => 0),
    ]);
    const fcmCount = fcmRes.rows[0]?.cnt || 0;
    res.json({
      subscribed: fcmCount > 0 || vapidRes > 0,
      fcmCount,
      vapidCount: vapidRes,
      lastSeen: fcmRes.rows[0]?.last_seen || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy VAPID subscribe ────────────────────────────────────────────────────
router.post("/subscribe", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const { subscription, platform } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid push subscription" });
  try {
    await storeSubscription(userId, subscription, platform || "web");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/unsubscribe", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  try {
    await removeSubscription(userId, endpoint);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: FCM configuration status ──────────────────────────────────────────
router.get("/fcm-status", requireAdmin as any, async (_req, res) => {
  try {
    // Use env-var presence check — same guard that getAccessToken() uses.
    // We do NOT call isFirebaseConfigured() here because that makes a live
    // Google OAuth network round-trip which can fail/timeout even when the
    // keys are correctly injected (esbuild static replacement).
    const projectId   = process.env.FIREBASE_PROJECT_ID   || "";
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY  || "";
    const configured  = !!(projectId && clientEmail && privateKey);
    const missingServerKeys: string[] = [
      ...(!projectId   ? ["FIREBASE_PROJECT_ID"]   : []),
      ...(!clientEmail ? ["FIREBASE_CLIENT_EMAIL"] : []),
      ...(!privateKey  ? ["FIREBASE_PRIVATE_KEY"]  : []),
    ];

    const [subRes, byTypeRes, lastTestRes] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT COALESCE(user_id, customer_id))::int AS unique_subs,
               COUNT(*)::int AS total_tokens
        FROM customer_push_tokens
        WHERE token IS NOT NULL AND length(token) > 10
      `).catch(() => ({ rows: [{ unique_subs: 0, total_tokens: 0 }] })),
      pool.query(`
        SELECT COALESCE(user_type, 'customer') AS user_type,
               COUNT(DISTINCT COALESCE(user_id, customer_id))::int AS users
        FROM customer_push_tokens
        WHERE token IS NOT NULL AND length(token) > 10
        GROUP BY user_type ORDER BY users DESC
      `).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT MAX(created_at) AS last_test_at
        FROM notification_logs
        WHERE channel = 'push'
      `).catch(() => ({ rows: [{}] })),
    ]);

    res.json({
      configured,
      project_id:          configured ? projectId : null,
      missing_server_keys: missingServerKeys,
      unique_subscribers:  subRes.rows[0]?.unique_subs   || 0,
      total_tokens:        subRes.rows[0]?.total_tokens  || 0,
      by_user_type:        byTypeRes.rows,
      last_test_at:        lastTestRes.rows[0]?.last_test_at || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Stats ──────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const [subCount, byPlatform, byType, recentSent, campaigns] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT COALESCE(user_id,customer_id))::int AS unique_subscribers,
               COUNT(*)::int AS total_tokens
        FROM customer_push_tokens WHERE token IS NOT NULL AND length(token) > 10
      `).catch(() => ({ rows: [{ unique_subscribers: 0, total_tokens: 0 }] })),
      pool.query(`
        SELECT platform, COUNT(*)::int AS cnt
        FROM customer_push_tokens WHERE token IS NOT NULL
        GROUP BY platform ORDER BY cnt DESC
      `).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT COALESCE(user_type,'customer') AS user_type, COUNT(DISTINCT COALESCE(user_id,customer_id))::int AS cnt
        FROM customer_push_tokens WHERE token IS NOT NULL AND length(token)>10
        GROUP BY user_type ORDER BY cnt DESC
      `).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT COUNT(*)::int AS sent_24h,
               COUNT(*) FILTER (WHERE status='failed')::int AS failed_24h
        FROM notification_logs WHERE channel='push' AND tenant_id=$1::uuid AND created_at >= NOW() - INTERVAL '24 hours'
      `, [tenantId]).catch(() => ({ rows: [{ sent_24h: 0, failed_24h: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS total, SUM(sent)::int AS total_sent FROM push_campaigns WHERE tenant_id=$1::uuid`,
        [tenantId]
      ).catch(() => ({ rows: [{ total: 0, total_sent: 0 }] })),
    ]);
    res.json({
      unique_subscribers: subCount.rows[0]?.unique_subscribers || 0,
      total_tokens:       subCount.rows[0]?.total_tokens || 0,
      by_platform:        byPlatform.rows,
      by_user_type:       byType.rows,
      sent_24h:           recentSent.rows[0]?.sent_24h || 0,
      failed_24h:         recentSent.rows[0]?.failed_24h || 0,
      campaigns_total:    campaigns.rows[0]?.total || 0,
      campaigns_sent:     campaigns.rows[0]?.total_sent || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: List push campaigns ────────────────────────────────────────────────
router.get("/campaigns", requireAdmin as any, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;
    const tenantId = getTenantId(req);
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT id, title, body, url, filter, total_tokens, sent, failed, status, error, sent_at
         FROM push_campaigns WHERE tenant_id=$3::uuid ORDER BY sent_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset, tenantId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM push_campaigns WHERE tenant_id=$1::uuid`,
        [tenantId]
      ).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);
    res.json({ campaigns: rows.rows, total: total.rows[0]?.cnt || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Send to specific user by ID ───────────────────────────────────────
router.post("/send", requireAdmin as any, async (req, res) => {
  const { customerId, userId, title, body, url, data } = req.body;
  const targetId = userId || customerId;
  if (!targetId || !title || !body) {
    return res.status(400).json({ error: "userId/customerId, title and body required" });
  }
  try {
    const tokensRes = await pool.query(
      `SELECT token FROM customer_push_tokens
       WHERE (user_id = $1 OR customer_id = $1) AND token IS NOT NULL AND length(token) > 10`,
      [targetId]
    );
    if (!tokensRes.rows.length) {
      return res.json({ ok: false, reason: "User has no registered push tokens" });
    }
    const results = await Promise.allSettled(
      tokensRes.rows.map(r => sendFCMToToken(r.token, { title, body, url: url || "/customer/dashboard", data }))
    );
    const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const failed = results.length - sent;
    const invalid = results
      .filter(r => r.status === "fulfilled" && !r.value.ok && r.value.invalidToken)
      .map((_, i) => tokensRes.rows[i]?.token).filter(Boolean);
    await cleanupInvalidTokens(invalid);
    res.json({ ok: true, sent, failed, total: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Broadcast (filtered) ───────────────────────────────────────────────
router.post("/send-all", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { title, body, url, filter = "all", data } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  const campaignId = randomUUID();
  res.json({ ok: true, campaignId, message: "Sending in background — check campaigns list for results" });

  setImmediate(async () => {
    let sent = 0, failed = 0, totalTokens = 0, error: string | undefined;
    try {
      const recipients = await getTokensByFilter(filter);
      totalTokens = recipients.length;
      if (!totalTokens) {
        error = "No push tokens found for the selected audience";
      } else {
        const tokens = recipients.map(r => r.token);
        const result = await sendFCMBatch(tokens, {
          title, body,
          url: url || "https://alburhantravels.com/customer/dashboard",
          data: data || {},
        });
        sent   = result.sent;
        failed = result.failed;
        await cleanupInvalidTokens(result.invalidTokens);
      }
    } catch (err: any) {
      error = err.message;
    }
    await logPushCampaign({ id: campaignId, title, body, url, filter, totalTokens, sent, failed, sentBy: adminId, error });
  });
});

// ── Admin: Test FCM credentials (OAuth2 token exchange, no push sent) ────────
router.post("/test-connection", requireAdmin as any, async (_req, res) => {
  try {
    const result = await testFCMConnection();
    res.json(result);
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Admin: Test notification ─────────────────────────────────────────────────
router.post("/test", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { token: specificToken } = req.body;

  const title = "🔔 Al Burhan Push Test";
  const body  = "Firebase Cloud Messaging is working correctly!";
  const url   = "/admin/notifications";

  try {
    let targetTokens: string[] = [];
    if (specificToken) {
      targetTokens = [specificToken];
    } else if (adminId) {
      const r = await pool.query(
        `SELECT token FROM customer_push_tokens
         WHERE (user_id = $1 OR customer_id = $1) AND token IS NOT NULL AND length(token) > 10
         ORDER BY last_seen DESC NULLS LAST LIMIT 3`,
        [adminId]
      );
      targetTokens = r.rows.map((row: any) => row.token);
    }

    if (!targetTokens.length) {
      return res.status(400).json({
        error: "No FCM token found. Open the app in Chrome/Edge and enable push notifications first.",
      });
    }

    const results = await Promise.allSettled(
      targetTokens.map(t => sendFCMToToken(t, { title, body, url }))
    );
    const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const errors = results.filter(r => r.status === "fulfilled" && !r.value.ok).map(r => (r as any).value.error).filter(Boolean);

    if (sent > 0) {
      res.json({ ok: true, sent, message: "Test notification sent! You should see it within 5 seconds." });
    } else {
      res.status(500).json({ ok: false, error: errors[0] || "Send failed — check Firebase credentials" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Retry a campaign ───────────────────────────────────────────────────
router.post("/retry/:id", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { id } = req.params;
  try {
    const tenantId = getTenantId(req);
    const campRes = await pool.query(
      `SELECT * FROM push_campaigns WHERE id = $1 AND tenant_id=$2::uuid`,
      [id, tenantId]
    );
    if (!campRes.rows.length) return res.status(404).json({ error: "Campaign not found" });
    const camp = campRes.rows[0];
    const newId = randomUUID();
    res.json({ ok: true, campaignId: newId, message: "Retry started" });
    setImmediate(async () => {
      let sent = 0, failed = 0, error: string | undefined, totalTokens = 0;
      try {
        const recipients = await getTokensByFilter(camp.filter || "all");
        totalTokens = recipients.length;
        const result = await sendFCMBatch(recipients.map(r => r.token), {
          title: camp.title, body: camp.body,
          url: camp.url || "https://alburhantravels.com/customer/dashboard",
        });
        sent = result.sent; failed = result.failed;
        await cleanupInvalidTokens(result.invalidTokens);
      } catch (err: any) { error = err.message; }
      await logPushCampaign({ id: newId, title: camp.title, body: camp.body, url: camp.url, filter: camp.filter || "all", totalTokens, sent, failed, sentBy: adminId, error });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Audience count preview ─────────────────────────────────────────────
router.get("/audience-count", requireAdmin as any, async (req, res) => {
  const { filter = "all" } = req.query as { filter?: string };
  try {
    const recipients = await getTokensByFilter(filter);
    res.json({ count: recipients.length, filter });
  } catch (err: any) {
    res.json({ count: 0, filter, error: err.message });
  }
});

// ── Admin: Search customers for individual send ───────────────────────────────
router.get("/search-users", requireAdmin as any, async (req, res) => {
  const { q = "" } = req.query as { q?: string };
  if (!q || q.trim().length < 2) return res.json({ users: [] });
  try {
    const rows = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.role,
              (SELECT COUNT(*)::int FROM customer_push_tokens cpt WHERE (cpt.user_id = u.id OR cpt.customer_id = u.id) AND cpt.token IS NOT NULL AND length(cpt.token)>10) AS token_count
       FROM users u
       WHERE (u.name ILIKE $1 OR u.mobile ILIKE $1 OR u.mobile ILIKE $2)
         AND u.is_active = TRUE
       ORDER BY u.name LIMIT 10`,
      [`%${q}%`, `%${q.replace(/[^0-9]/g, "")}%`]
    );
    res.json({ users: rows.rows });
  } catch (err: any) {
    res.json({ users: [], error: err.message });
  }
});

export default router;
