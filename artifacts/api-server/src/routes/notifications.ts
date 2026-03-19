import { Router } from "express";
import { SendNotificationBody } from "@workspace/api-zod";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendEmail } from "../lib/notifications.js";
import { db, customerNotificationsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";

const router = Router();

router.post("/send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const parsed = SendNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { mobile, email, message, channels, subject } = parsed.data;

  const results: Record<string, boolean> = {};

  if (!mobile && !email) {
    res.status(400).json({ message: "Either mobile or email is required" });
    return;
  }

  await Promise.allSettled([
    channels.includes("whatsapp") && mobile
      ? sendWhatsApp(mobile, message).then(r => { results.whatsapp = r; })
      : Promise.resolve(),
    channels.includes("email") && email
      ? sendEmail(email, subject ?? "Message from Al Burhan Tours & Travels", message).then(r => { results.email = r; })
      : Promise.resolve(),
  ]);

  res.json({ message: `Notifications sent via: ${channels.join(", ")}` });
});

router.get("/my", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  const notifications = await db
    .select()
    .from(customerNotificationsTable)
    .where(eq(customerNotificationsTable.customerId, userId))
    .orderBy(desc(customerNotificationsTable.createdAt))
    .limit(50);
  res.json(notifications.map(n => ({
    ...n,
    createdAt: n.createdAt?.toISOString?.(),
  })));
});

router.get("/my/unread-count", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  const [row] = await db
    .select({ count: count() })
    .from(customerNotificationsTable)
    .where(and(
      eq(customerNotificationsTable.customerId, userId),
      eq(customerNotificationsTable.isRead, false)
    ));
  res.json({ count: Number(row?.count ?? 0) });
});

router.patch("/my/read-all", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  await db
    .update(customerNotificationsTable)
    .set({ isRead: true })
    .where(eq(customerNotificationsTable.customerId, userId));
  res.json({ success: true });
});

router.patch("/my/:id/read", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  await db
    .update(customerNotificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(customerNotificationsTable.id, req.params.id),
      eq(customerNotificationsTable.customerId, userId)
    ));
  res.json({ success: true });
});

export default router;
