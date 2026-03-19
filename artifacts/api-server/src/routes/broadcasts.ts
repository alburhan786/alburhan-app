import { Router } from "express";
import { db, broadcastsTable, customerNotificationsTable, bookingsTable, usersTable, packagesTable } from "@workspace/db";
import { eq, desc, ilike, or, inArray } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";
import axios from "axios";

const router = Router();

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

async function sendBroadcastSMS(mobile: string, message: string): Promise<boolean> {
  if (!FAST2SMS_API_KEY) return false;
  try {
    const phone = mobile.replace(/\D/g, "").replace(/^91/, "").slice(-10);
    const encoded = encodeURIComponent(message);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${encoded}&language=english&flash=0&numbers=${phone}`;
    const res = await axios.get(url, { timeout: 10000 });
    console.log("[Broadcast-SMS] Sent to", mobile, res.data);
    return true;
  } catch (err: any) {
    console.error("[Broadcast-SMS] Error for", mobile, err?.response?.data || err.message);
    return false;
  }
}

async function getRecipients(audience: string): Promise<{ mobile: string; customerId: string; name: string }[]> {
  if (audience === "all") {
    const users = await db.select({ id: usersTable.id, mobile: usersTable.mobile, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.role, "customer"));
    return users.map(u => ({ mobile: u.mobile, customerId: u.id, name: u.name || "" }));
  }

  if (audience === "hajj_2026" || audience === "hajj_2027") {
    const year = audience === "hajj_2026" ? "2026" : "2027";
    const bkgs = await db
      .select({ mobile: bookingsTable.customerMobile, id: bookingsTable.customerId, name: bookingsTable.customerName })
      .from(bookingsTable)
      .where(
        or(
          ilike(bookingsTable.packageName, `%${year}%`),
          ilike(bookingsTable.packageName, `%Hajj ${year}%`)
        )
      );
    const seen = new Set<string>();
    return bkgs.filter(b => b.mobile && !seen.has(b.mobile) && seen.add(b.mobile)).map(b => ({
      mobile: b.mobile,
      customerId: b.id || b.mobile,
      name: b.name || "",
    }));
  }

  if (audience === "confirmed" || audience === "approved" || audience === "partially_paid") {
    const bkgs = await db
      .select({ mobile: bookingsTable.customerMobile, id: bookingsTable.customerId, name: bookingsTable.customerName })
      .from(bookingsTable)
      .where(eq(bookingsTable.status, audience as any));
    const seen = new Set<string>();
    return bkgs.filter(b => b.mobile && !seen.has(b.mobile) && seen.add(b.mobile)).map(b => ({
      mobile: b.mobile,
      customerId: b.id || b.mobile,
      name: b.name || "",
    }));
  }

  return [];
}

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { title, message, type, audience, channels } = req.body;
  if (!title || !message || !audience || !Array.isArray(channels)) {
    res.status(400).json({ message: "title, message, audience, and channels are required" });
    return;
  }

  const recipients = await getRecipients(audience);
  if (recipients.length === 0) {
    res.status(400).json({ message: "No recipients found for selected audience" });
    return;
  }

  const [broadcast] = await db.insert(broadcastsTable).values({
    title,
    message,
    type: type || "general",
    audience,
    channels,
    recipientCount: recipients.length,
    sentBy: req.user?.mobile,
  }).returning();

  res.json({
    id: broadcast.id,
    message: `Broadcast queued for ${recipients.length} recipients`,
    recipientCount: recipients.length,
  });

  const whatsappText = `🕋 *${title}*\n\n${message}\n\n_Al Burhan Tours & Travels_`;

  for (const r of recipients) {
    const tasks: Promise<any>[] = [];

    if (channels.includes("whatsapp")) {
      tasks.push(sendWhatsApp(r.mobile, whatsappText).catch(() => {}));
    }
    if (channels.includes("sms")) {
      tasks.push(sendBroadcastSMS(r.mobile, `${title}\n${message}\n-Al Burhan Tours`).catch(() => {}));
    }
    if (channels.includes("dashboard")) {
      tasks.push(
        db.insert(customerNotificationsTable).values({
          customerId: r.customerId,
          broadcastId: broadcast.id,
          title,
          message,
          type: type || "general",
          isRead: false,
        }).catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
  }
});

router.get("/", requireAdmin as any, async (_req, res) => {
  const broadcasts = await db.select().from(broadcastsTable).orderBy(desc(broadcastsTable.sentAt)).limit(100);
  res.json(broadcasts.map(b => ({
    ...b,
    sentAt: b.sentAt?.toISOString?.(),
  })));
});

router.post("/:id/resend", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const [original] = await db.select().from(broadcastsTable).where(eq(broadcastsTable.id, id));
  if (!original) {
    res.status(404).json({ message: "Broadcast not found" });
    return;
  }

  const recipients = await getRecipients(original.audience);

  const [newBroadcast] = await db.insert(broadcastsTable).values({
    title: original.title,
    message: original.message,
    type: original.type,
    audience: original.audience,
    channels: original.channels,
    recipientCount: recipients.length,
    sentBy: req.user?.mobile,
  }).returning();

  res.json({
    id: newBroadcast.id,
    message: `Resent to ${recipients.length} recipients`,
    recipientCount: recipients.length,
  });

  const whatsappText = `🕋 *${original.title}*\n\n${original.message}\n\n_Al Burhan Tours & Travels_`;

  for (const r of recipients) {
    const tasks: Promise<any>[] = [];
    if (original.channels.includes("whatsapp")) tasks.push(sendWhatsApp(r.mobile, whatsappText).catch(() => {}));
    if (original.channels.includes("sms")) tasks.push(sendBroadcastSMS(r.mobile, `${original.title}\n${original.message}`).catch(() => {}));
    if (original.channels.includes("dashboard")) {
      tasks.push(db.insert(customerNotificationsTable).values({
        customerId: r.customerId, broadcastId: newBroadcast.id,
        title: original.title, message: original.message,
        type: original.type, isRead: false,
      }).catch(() => {}));
    }
    await Promise.allSettled(tasks);
  }
});

export default router;
