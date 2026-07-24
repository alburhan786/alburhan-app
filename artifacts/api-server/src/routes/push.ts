// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  getVapidPublicKey,
  storeSubscription,
  removeSubscription,
  getSubscriptionCount,
} from "../lib/webPush.js";

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

export default router;
