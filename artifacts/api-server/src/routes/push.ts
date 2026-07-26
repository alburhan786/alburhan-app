// @ts-nocheck
import { Router } from "express";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import {
  getVapidPublicKey,
  storeSubscription,
  removeSubscription,
  getSubscriptionCount,
  sendPushToAllCustomers,
} from "../lib/webPush.js";
import { pool } from "@workspace/db";

const router = Router();

// GET /api/push/vapid-key — public endpoint (no auth needed to get the public key)
router.get("/vapid-key", async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (err: any) {
    console.error("[push] vapid-key error:", err.message);
    res.status(500).json({ error: "Failed to retrieve VAPID key" });
  }
});

// POST /api/push/subscribe — register a push subscription for the logged-in customer
router.post("/subscribe", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { subscription, platform } = req.body;
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: "Invalid push subscription object" });
  }

  try {
    await storeSubscription(userId, subscription, platform || "web");
    const count = await getSubscriptionCount(userId);
    console.log(`[push] Subscription stored for user=${userId} (total: ${count})`);
    res.json({ ok: true, subscriptions: count });
  } catch (err: any) {
    console.error("[push] subscribe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/push/unsubscribe — remove a specific push subscription
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

// GET /api/push/status — check if current user has any push subscriptions
router.get("/status", requireAuth as any, async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const count = await getSubscriptionCount(userId);
    res.json({ subscribed: count > 0, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin endpoints ─────────────────────────────────────────────────────────

// GET /api/push/admin/stats — subscriber counts and recent sends
router.get("/admin/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [subCount, byPlatform, recentSent] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT customer_id)::int AS unique_subscribers,
               COUNT(*)::int                    AS total_tokens
        FROM customer_push_subscriptions`).catch(() => ({ rows: [{ unique_subscribers: 0, total_tokens: 0 }] })),
      pool.query(`
        SELECT platform, COUNT(*)::int AS cnt
        FROM customer_push_subscriptions
        GROUP BY platform ORDER BY cnt DESC`).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT COUNT(*)::int AS sent_24h,
               COUNT(*) FILTER (WHERE status='failed')::int AS failed_24h
        FROM notification_logs
        WHERE channel='push' AND created_at >= NOW() - INTERVAL '24 hours'`).catch(() => ({ rows: [{ sent_24h: 0, failed_24h: 0 }] })),
    ]);
    res.json({
      unique_subscribers: subCount.rows[0]?.unique_subscribers || 0,
      total_tokens:       subCount.rows[0]?.total_tokens       || 0,
      by_platform:        byPlatform.rows,
      sent_24h:           recentSent.rows[0]?.sent_24h  || 0,
      failed_24h:         recentSent.rows[0]?.failed_24h || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/admin/broadcast — send push notification to all subscribers
router.post("/admin/broadcast", requireAdmin as any, async (req, res) => {
  const { title, body, url } = req.body;
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  try {
    const result = await sendPushToAllCustomers({ title, body, url: url || "/" });
    console.log(`[push] Admin broadcast: sent=${result.sent} failed=${result.failed}`);
    res.json({ ok: true, sent: result.sent, failed: result.failed });
  } catch (err: any) {
    console.error("[push] broadcast error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
