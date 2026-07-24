// @ts-nocheck
import { Router } from "express";
import { SendNotificationBody } from "@workspace/api-zod";
import { requireAdmin, requireAuth, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendEmail } from "../lib/notifications.js";
import { db, pool, customerNotificationsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";

const router = Router();

router.post("/send", requireModuleAccess("customers") as any, requireAdmin as any, async (req: AuthenticatedRequest, res) => {
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
  const { search, category } = req.query as any;
  try {
    const params: unknown[] = [userId];
    const conditions: string[] = ["customer_id = $1"];
    let idx = 2;
    if (search) { conditions.push(`(title ILIKE $${idx} OR message ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (category && category !== "all") { conditions.push(`(type ILIKE $${idx} OR category = $${idx})`); params.push(category); idx++; }
    const where = conditions.join(" AND ");
    const result = await pool.query(
      `SELECT id, customer_id AS "customerId", title, message, type, is_read AS "isRead", category, created_at AS "createdAt"
       FROM customer_notifications WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json(result.rows.map((n: any) => ({ ...n, createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt })));
  } catch {
    // Fallback to Drizzle if pool.query fails (e.g. category column not yet migrated)
    const notifications = await db.select().from(customerNotificationsTable)
      .where(eq(customerNotificationsTable.customerId, userId))
      .orderBy(desc(customerNotificationsTable.createdAt)).limit(100);
    res.json(notifications.map(n => ({ ...n, createdAt: n.createdAt?.toISOString?.() })));
  }
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

router.delete("/my/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  await pool.query(`DELETE FROM customer_notifications WHERE id=$1 AND customer_id=$2`, [req.params.id, userId]);
  res.json({ success: true });
});

router.delete("/my", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return; }
  await pool.query(`DELETE FROM customer_notifications WHERE customer_id=$1`, [userId]);
  res.json({ success: true });
});

export default router;
