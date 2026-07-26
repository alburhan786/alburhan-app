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
import {
  isFirebaseConfigured,
  getFirebaseWebConfig,
  sendFCMToToken,
  sendFCMBatch,
  cleanupInvalidTokens,
  getTokensByFilter,
  logPushCampaign,
} from "../lib/fcm.js";
import { pool } from "@workspace/db";

const router = Router();

// ── Public: Firebase web SDK config (safe to expose — these are not secrets) ─
router.get("/firebase-web-config", (_req, res) => {
  const cfg = getFirebaseWebConfig();
  res.json(cfg);
});

// ── Public: VAPID key (for legacy VAPID subscriptions) ───────────────────────
router.get("/vapid-key", async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to retrieve VAPID key" });
  }
});

// ── Customer: Register FCM token ─────────────────────────────────────────────
router.post("/register-token", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { token, platform, deviceInfo } = req.body;
  if (!token || typeof token !== "string" || token.length < 10) {
    return res.status(400).json({ error: "Valid FCM token required" });
  }

  try {
    await pool.query(
      `INSERT INTO customer_push_tokens (id, customer_id, token, platform, device_info, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (customer_id, token) DO UPDATE
         SET platform = EXCLUDED.platform,
             device_info = EXCLUDED.device_info,
             updated_at = NOW()`,
      [randomUUID(), userId, token, platform || "web", deviceInfo || null]
    );
    console.log(`[FCM] Token registered for user=${userId} platform=${platform}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[FCM] register-token error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Customer: Remove FCM token ────────────────────────────────────────────────
router.post("/unregister-token", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  try {
    await pool.query(
      `DELETE FROM customer_push_tokens WHERE customer_id = $1 AND token = $2`,
      [userId, token]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Customer: Push subscription status ───────────────────────────────────────
router.get("/status", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const [fcmRes, vapidRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS cnt FROM customer_push_tokens WHERE customer_id = $1 AND token IS NOT NULL AND length(token) > 10`, [userId]),
      getSubscriptionCount(userId).catch(() => 0),
    ]);
    const fcmCount  = fcmRes.rows[0]?.cnt || 0;
    res.json({ subscribed: fcmCount > 0 || vapidRes > 0, fcmCount, vapidCount: vapidRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy VAPID subscribe (keep for backwards compatibility) ─────────────────
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
    const [configured, subRes] = await Promise.all([
      isFirebaseConfigured(),
      pool.query(`
        SELECT COUNT(DISTINCT customer_id)::int AS unique_subs,
               COUNT(*)::int AS total_tokens
        FROM customer_push_tokens
        WHERE token IS NOT NULL AND length(token) > 10
      `).catch(() => ({ rows: [{ unique_subs: 0, total_tokens: 0 }] })),
    ]);
    res.json({
      configured,
      unique_subscribers: subRes.rows[0]?.unique_subs || 0,
      total_tokens:       subRes.rows[0]?.total_tokens || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Stats ──────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [subCount, byPlatform, recentSent, campaigns] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT customer_id)::int AS unique_subscribers,
               COUNT(*)::int AS total_tokens
        FROM customer_push_tokens
        WHERE token IS NOT NULL AND length(token) > 10
      `).catch(() => ({ rows: [{ unique_subscribers: 0, total_tokens: 0 }] })),
      pool.query(`
        SELECT platform, COUNT(*)::int AS cnt
        FROM customer_push_tokens
        WHERE token IS NOT NULL
        GROUP BY platform ORDER BY cnt DESC
      `).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT COUNT(*)::int AS sent_24h,
               COUNT(*) FILTER (WHERE status='failed')::int AS failed_24h
        FROM notification_logs
        WHERE channel='push' AND created_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ sent_24h: 0, failed_24h: 0 }] })),
      pool.query(`
        SELECT COUNT(*)::int AS total, SUM(sent)::int AS total_sent
        FROM push_campaigns
      `).catch(() => ({ rows: [{ total: 0, total_sent: 0 }] })),
    ]);
    res.json({
      unique_subscribers: subCount.rows[0]?.unique_subscribers || 0,
      total_tokens:       subCount.rows[0]?.total_tokens       || 0,
      by_platform:        byPlatform.rows,
      sent_24h:           recentSent.rows[0]?.sent_24h  || 0,
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
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT id, title, body, url, filter, total_tokens, sent, failed, status, error, sent_at
         FROM push_campaigns
         ORDER BY sent_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ).catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM push_campaigns`).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);
    res.json({ campaigns: rows.rows, total: total.rows[0]?.cnt || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Send to specific customer ─────────────────────────────────────────
router.post("/send", requireAdmin as any, async (req, res) => {
  const { customerId, title, body, url, icon, data } = req.body;
  if (!customerId || !title || !body) {
    return res.status(400).json({ error: "customerId, title and body required" });
  }
  try {
    const tokensRes = await pool.query(
      `SELECT token FROM customer_push_tokens WHERE customer_id = $1 AND token IS NOT NULL AND length(token) > 10`,
      [customerId]
    );
    if (!tokensRes.rows.length) {
      return res.json({ ok: false, reason: "Customer has no registered push tokens" });
    }
    const results = await Promise.allSettled(
      tokensRes.rows.map(r => sendFCMToToken(r.token, { title, body, url: url || "/customer/dashboard", icon, data }))
    );
    const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const failed = results.length - sent;
    const invalidTokens = results
      .filter(r => r.status === "fulfilled" && !r.value.ok && r.value.invalidToken)
      .map((_, i) => tokensRes.rows[i]?.token)
      .filter(Boolean);
    await cleanupInvalidTokens(invalidTokens);
    console.log(`[FCM] Sent to customer=${customerId}: sent=${sent} failed=${failed}`);
    res.json({ ok: true, sent, failed, total: results.length });
  } catch (err: any) {
    console.error("[FCM] /send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Broadcast (send-all / filtered) ────────────────────────────────────
router.post("/send-all", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { title, body, url, icon, filter = "all", data } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  // Respond immediately and run in background
  const campaignId = randomUUID();
  res.json({ ok: true, campaignId, message: "Sending in background — check campaigns list for progress" });

  // Background send (non-blocking)
  setImmediate(async () => {
    let sent = 0; let failed = 0; let totalTokens = 0; let error: string | undefined;
    try {
      const recipients = await getTokensByFilter(filter);
      totalTokens = recipients.length;
      console.log(`[FCM] Campaign ${campaignId}: filter=${filter} tokens=${totalTokens}`);

      if (totalTokens === 0) {
        error = "No push tokens found for the selected audience";
      } else {
        const tokens = recipients.map(r => r.token);
        const result = await sendFCMBatch(tokens, {
          title, body,
          url: url || "https://alburhantravels.online/customer/dashboard",
          icon: icon || "/opengraph.jpg",
          data: data || {},
        });
        sent   = result.sent;
        failed = result.failed;
        await cleanupInvalidTokens(result.invalidTokens);
        console.log(`[FCM] Campaign ${campaignId} done: sent=${sent} failed=${failed} invalid=${result.invalidTokens.length}`);
      }
    } catch (err: any) {
      error = err.message;
      console.error(`[FCM] Campaign ${campaignId} error:`, err.message);
    }
    await logPushCampaign({ id: campaignId, title, body, url, filter, totalTokens, sent, failed, sentBy: adminId, error });
  });
});

// ── Admin: Test notification (sends to current admin's registered tokens) ─────
router.post("/test", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { token: specificToken } = req.body;

  const title = "🔔 Al Burhan Push Test";
  const body  = "Firebase Cloud Messaging is working correctly!";
  const url   = "/admin/notifications";

  try {
    // Try admin's own tokens first, or a specific token if provided
    let targetTokens: string[] = [];
    if (specificToken) {
      targetTokens = [specificToken];
    } else if (adminId) {
      const r = await pool.query(
        `SELECT token FROM customer_push_tokens WHERE customer_id = $1 AND token IS NOT NULL AND length(token) > 10`,
        [adminId]
      );
      targetTokens = r.rows.map(row => row.token);
    }

    if (!targetTokens.length) {
      return res.status(400).json({
        error: "No FCM token available. Open the app in Chrome/Edge and enable push notifications first, then retry.",
      });
    }

    const results = await Promise.allSettled(
      targetTokens.map(t => sendFCMToToken(t, { title, body, url, data: { test: "true" } }))
    );
    const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const errors = results
      .filter(r => r.status === "fulfilled" && !r.value.ok)
      .map(r => (r as any).value.error)
      .filter(Boolean);

    if (sent > 0) {
      res.json({ ok: true, sent, message: "Test notification sent! You should see it within 5 seconds." });
    } else {
      res.status(500).json({ ok: false, error: errors[0] || "Send failed — check Firebase credentials" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Retry a failed campaign ───────────────────────────────────────────
router.post("/retry/:id", requireAdmin as any, async (req, res) => {
  const adminId = (req.session as any)?.userId;
  const { id } = req.params;
  try {
    const campRes = await pool.query(`SELECT * FROM push_campaigns WHERE id = $1`, [id]);
    if (!campRes.rows.length) return res.status(404).json({ error: "Campaign not found" });
    const camp = campRes.rows[0];

    const newId = randomUUID();
    res.json({ ok: true, campaignId: newId, message: "Retry started" });

    setImmediate(async () => {
      let sent = 0; let failed = 0; let error: string | undefined;
      let totalTokens = 0;
      try {
        const recipients = await getTokensByFilter(camp.filter || "all");
        totalTokens = recipients.length;
        const tokens = recipients.map(r => r.token);
        const result = await sendFCMBatch(tokens, {
          title: camp.title, body: camp.body,
          url: camp.url || "https://alburhantravels.online/customer/dashboard",
        });
        sent   = result.sent;
        failed = result.failed;
        await cleanupInvalidTokens(result.invalidTokens);
      } catch (err: any) {
        error = err.message;
      }
      await logPushCampaign({
        id: newId, title: camp.title, body: camp.body, url: camp.url,
        filter: camp.filter || "all", totalTokens, sent, failed, sentBy: adminId, error,
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Preview audience count for a filter ────────────────────────────────
router.get("/audience-count", requireAdmin as any, async (req, res) => {
  const { filter = "all" } = req.query as { filter?: string };
  try {
    const recipients = await getTokensByFilter(filter);
    res.json({ count: recipients.length, filter });
  } catch (err: any) {
    res.json({ count: 0, filter, error: err.message });
  }
});

export default router;
