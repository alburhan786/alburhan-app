import { Router } from "express";
import { requirePortalUser } from "../lib/auth.js";
import {
  registerSseClient,
  unregisterSseClient,
  getAdminNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteAdminNotification,
} from "../lib/adminNotifications.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

// GET /admin-notifications/stream — SSE stream (long-lived connection)
router.get("/stream", requirePortalUser as any, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Initial ping so the client knows the stream is open
  res.write(`: connected\n\n`);
  registerSseClient(res);

  // Heartbeat every 25s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(`:ping\n\n`); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterSseClient(res);
  });
});

// GET /admin-notifications — list recent notifications
router.get("/", requirePortalUser as any, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const data = await getAdminNotifications(limit, unreadOnly);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /admin-notifications/unread-count
router.get("/unread-count", requirePortalUser as any, async (_req, res) => {
  try {
    const count = await getUnreadCount();
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// PATCH /admin-notifications/:id/read
router.patch("/:id/read", requirePortalUser as any, async (req, res) => {
  try {
    await markNotificationRead(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /admin-notifications/mark-all-read
router.post("/mark-all-read", requirePortalUser as any, async (_req, res) => {
  try {
    await markAllNotificationsRead();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// DELETE /admin-notifications/:id
router.delete("/:id", requirePortalUser as any, async (req, res) => {
  try {
    await deleteAdminNotification(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
