// @ts-nocheck
import { Router } from "express";
import { db, broadcastsTable, customerNotificationsTable, bookingsTable, usersTable } from "@workspace/db";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendRCS, type RcsRichData } from "../lib/notifications.js";
import axios from "axios";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();
router.use(requireModuleAccess("customers") as any);

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;

interface Recipient {
  mobile: string;
  customerId: string;
  name: string;
  group: string;
  bus: string;
  hotel: string;
}

function applyVariables(text: string, r: Recipient): string {
  return text
    .replace(/\{name\}/gi, r.name || "Pilgrim")
    .replace(/\{phone\}/gi, r.mobile || "")
    .replace(/\{group\}/gi, r.group || "")
    .replace(/\{bus\}/gi, r.bus || "")
    .replace(/\{hotel\}/gi, r.hotel || "");
}

async function sendBroadcastSMS(_mobile: string, _message: string): Promise<boolean> {
  // ⛔ SMS BLOCKED — India DLT regulations prohibit free-form (non-template) SMS.
  // Bulk custom messages cannot be sent via Quick or Promotional routes.
  // Use WhatsApp or Email for custom broadcast messages instead.
  console.error("[Broadcast-SMS] ⛔ BLOCKED — Non-DLT SMS broadcasts are prohibited. Route=q/promotional routes are not permitted. Use WhatsApp or Email for custom messages.");
  return false;
}

async function getRecipients(audience: string, tenantId: string): Promise<Recipient[]> {
  const tenantFilter = sql`tenant_id = ${tenantId}::uuid`;
  if (audience === "all") {
    const users = await db.select({ id: usersTable.id, mobile: usersTable.mobile, name: usersTable.name })
      .from(usersTable).where(sql`role = 'customer' AND tenant_id = ${tenantId}::uuid`);
    return users.map(u => ({ mobile: u.mobile, customerId: u.id, name: u.name || "", group: "", bus: "", hotel: "" }));
  }

  if (audience === "hajj_2026" || audience === "hajj_2027") {
    const year = audience === "hajj_2026" ? "2026" : "2027";
    const bkgs = await db
      .select({ mobile: bookingsTable.customerMobile, id: bookingsTable.customerId, name: bookingsTable.customerName, pkg: bookingsTable.packageName })
      .from(bookingsTable)
      .where(
        sql`tenant_id = ${tenantId}::uuid AND (package_name ILIKE ${'%' + year + '%'} OR package_name ILIKE ${'%Hajj ' + year + '%'})`
      );
    const seen = new Set<string>();
    return bkgs
      .filter(b => b.mobile && !seen.has(b.mobile) && seen.add(b.mobile))
      .map(b => ({ mobile: b.mobile, customerId: b.id || b.mobile, name: b.name || "", group: b.pkg || `Hajj ${year}`, bus: "", hotel: "" }));
  }

  if (audience === "confirmed" || audience === "approved" || audience === "partially_paid") {
    const bkgs = await db
      .select({ mobile: bookingsTable.customerMobile, id: bookingsTable.customerId, name: bookingsTable.customerName, pkg: bookingsTable.packageName })
      .from(bookingsTable)
      .where(sql`tenant_id = ${tenantId}::uuid AND status = ${audience}`);
    const seen = new Set<string>();
    return bkgs
      .filter(b => b.mobile && !seen.has(b.mobile) && seen.add(b.mobile))
      .map(b => ({ mobile: b.mobile, customerId: b.id || b.mobile, name: b.name || "", group: b.pkg || "", bus: "", hotel: "" }));
  }

  return [];
}

async function dispatchToRecipient(
  r: Recipient,
  broadcast: { id: string; title: string; type: string },
  rawMessage: string,
  channels: string[],
  rcsOptions?: { url?: string; agent?: string; richMode?: boolean }
): Promise<void> {
  const personalized = applyVariables(rawMessage, r);
  const stdMessage = `🕋 ${broadcast.title}\n${personalized}\n\n- Al Burhan Tours & Travels`;
  const waMessage = `🕋 *${broadcast.title}*\n\n${personalized}\n\n_Al Burhan Tours & Travels_`;

  const tasks: Promise<any>[] = [];

  if (channels.includes("whatsapp")) {
    tasks.push(sendWhatsApp(r.mobile, waMessage).catch(() => {}));
  }

  if (channels.includes("sms")) {
    tasks.push(sendBroadcastSMS(r.mobile, stdMessage).catch(() => {}));
  }

  if (channels.includes("rcs")) {
    const richData: RcsRichData | undefined = rcsOptions?.richMode && rcsOptions?.url
      ? { url: rcsOptions.url, agent: rcsOptions.agent || "jio", active: true }
      : undefined;

    tasks.push(
      sendRCS(r.mobile, r.name, personalized, richData).then(async (ok) => {
        if (!ok) {
          console.warn("[RCS→WA] Falling back to WhatsApp for", r.mobile);
          const waOk = await sendWhatsApp(r.mobile, waMessage).catch(() => false);
          if (!waOk) {
            console.warn("[RCS→WA→SMS] Falling back to SMS for", r.mobile);
            await sendBroadcastSMS(r.mobile, stdMessage).catch(() => {});
          }
        }
      }).catch(async () => {
        console.warn("[RCS] Exception — falling back to WhatsApp for", r.mobile);
        const waOk = await sendWhatsApp(r.mobile, waMessage).catch(() => false);
        if (!waOk) {
          await sendBroadcastSMS(r.mobile, stdMessage).catch(() => {});
        }
      })
    );
  }

  if (channels.includes("dashboard")) {
    tasks.push(
      db.insert(customerNotificationsTable).values({
        customerId: r.customerId,
        broadcastId: broadcast.id,
        title: broadcast.title,
        message: personalized,
        type: broadcast.type,
        isRead: false,
      }).catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
}

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { title, message, type, audience, channels, rcsUrl, rcsAgent, rcsRichMode } = req.body;
  if (!title || !message || !audience || !Array.isArray(channels)) {
    res.status(400).json({ message: "title, message, audience, and channels are required" });
    return;
  }

  const recipients = await getRecipients(audience, getTenantId(req));
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

  const rcsOptions = { url: rcsUrl, agent: rcsAgent, richMode: !!rcsRichMode };
  for (const r of recipients) {
    await dispatchToRecipient(r, { id: broadcast.id, title, type: type || "general" }, message, channels, rcsOptions);
  }
});

router.get("/", requireAdmin as any, async (req, res) => {
  const tenantId = getTenantId(req);
  const broadcasts = await db.select().from(broadcastsTable)
    .where(sql`broadcasts.tenant_id = ${tenantId}::uuid`)
    .orderBy(desc(broadcastsTable.sentAt)).limit(100);
  res.json(broadcasts.map(b => ({
    ...b,
    sentAt: b.sentAt?.toISOString?.(),
  })));
});

router.post("/:id/resend", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tenantId = getTenantId(req);
  const [original] = await db.select().from(broadcastsTable)
    .where(sql`id = ${id} AND tenant_id = ${tenantId}::uuid`);
  if (!original) {
    res.status(404).json({ message: "Broadcast not found" });
    return;
  }

  const recipients = await getRecipients(original.audience, tenantId);

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

  for (const r of recipients) {
    await dispatchToRecipient(
      r,
      { id: newBroadcast.id, title: original.title, type: original.type },
      original.message,
      original.channels,
      {}
    );
  }
});

export default router;
