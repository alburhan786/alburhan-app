/**
 * Delivery status webhooks — updates notification_logs with real provider confirmations.
 *
 * Routes:
 *   POST /api/webhook/rcs          — Lemin AI RCS delivery status
 *   POST /api/webhook/whatsapp-dlr — BotBee WhatsApp delivery report
 *   POST /api/webhook/sms-dlr      — Fast2SMS SMS delivery report
 */
import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// Helper: update notification_logs by recipient + channel + most-recent pending/sent
async function updateDeliveryStatus(
  recipient: string,
  channel: string,
  newStatus: "delivered" | "read" | "failed" | "clicked",
  rawPayload: unknown
): Promise<void> {
  try {
    await pool.query(
      `UPDATE notification_logs
       SET status        = $1,
           provider_response = provider_response || $2::jsonb,
           updated_at    = NOW()
       WHERE id = (
         SELECT id FROM notification_logs
         WHERE recipient = $3
           AND channel   = $4
           AND status IN ('sent','delivered')
         ORDER BY sent_at DESC
         LIMIT 1
       )`,
      [newStatus, JSON.stringify({ dlr: rawPayload, dlr_at: new Date().toISOString() }), recipient, channel]
    );
  } catch (err: any) {
    console.error(`[Webhook][${channel}] DB update failed:`, err?.message);
  }
}

// ── POST /api/webhook/rcs — Lemin AI ──────────────────────────────────────
router.post("/rcs", async (req, res) => {
  const body = req.body ?? {};
  console.log("[Webhook][RCS] Received:", JSON.stringify(body).slice(0, 500));

  // Lemin AI payload shapes vary; normalise the key fields
  const phone: string = body.phone || body.recipient || body.mobile || "";
  const event: string = (body.event || body.status || body.type || "").toLowerCase();

  let newStatus: "delivered" | "read" | "failed" | "clicked" | null = null;
  if (event.includes("deliver")) newStatus = "delivered";
  else if (event.includes("read") || event.includes("seen")) newStatus = "read";
  else if (event.includes("click")) newStatus = "clicked";
  else if (event.includes("fail") || event.includes("error")) newStatus = "failed";

  if (phone && newStatus) {
    const clean = phone.replace(/\D/g, "");
    const mobile = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    await updateDeliveryStatus(mobile, "rcs", newStatus, body);
    console.log(`[Webhook][RCS] ${mobile} → ${newStatus}`);
  }

  res.json({ ok: true });
});

// ── POST /api/webhook/botbee — BotBee general webhook (logs every request) ──
router.post("/botbee", async (req, res) => {
  const body = req.body ?? {};
  const raw = JSON.stringify(body);
  console.log("[Webhook][BotBee] Received:", raw.slice(0, 500));

  try {
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response, provider_name, sent_at, retry_count)
       VALUES ($1,'webhook_received','whatsapp_webhook',$2,$3,'received',$4,'BotBee',NOW(),0)`,
      [
        `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        body.phone_number || body.phone || "unknown",
        raw.slice(0, 300),
        JSON.stringify(body),
      ]
    );
  } catch (e) { console.error("[Webhook][BotBee] DB log failed:", e); }

  // Also process delivery status if present
  const phone: string = body.phone_number || body.phone || body.recipient || "";
  const event: string = (body.status || body.event || body.type || "").toLowerCase();
  let newStatus: "delivered" | "read" | "failed" | "clicked" | null = null;
  if (event.includes("deliver")) newStatus = "delivered";
  else if (event.includes("read") || event.includes("seen")) newStatus = "read";
  else if (event.includes("fail") || event.includes("error") || event === "0") newStatus = "failed";
  else if (event.includes("click")) newStatus = "clicked";

  if (phone && newStatus) {
    const clean = phone.replace(/\D/g, "");
    const mobile = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    await updateDeliveryStatus(mobile, "whatsapp", newStatus, body);
    console.log(`[Webhook][BotBee] ${mobile} → ${newStatus}`);
  }

  res.status(200).json({ ok: true, received: true });
});

// ── POST /api/webhook/whatsapp-dlr — BotBee ───────────────────────────────
router.post("/whatsapp-dlr", async (req, res) => {
  const body = req.body ?? {};
  console.log("[Webhook][WhatsApp-DLR] Received:", JSON.stringify(body).slice(0, 500));

  // BotBee DLR payload: { phone_number, status: "delivered"|"read"|"failed", ... }
  const phone: string = body.phone_number || body.phone || body.recipient || "";
  const event: string = (body.status || body.event || body.type || "").toLowerCase();

  let newStatus: "delivered" | "read" | "failed" | "clicked" | null = null;
  if (event.includes("deliver")) newStatus = "delivered";
  else if (event.includes("read") || event.includes("seen")) newStatus = "read";
  else if (event.includes("fail") || event.includes("error") || event === "0") newStatus = "failed";
  else if (event.includes("click")) newStatus = "clicked";

  if (phone && newStatus) {
    const clean = phone.replace(/\D/g, "");
    const mobile = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    await updateDeliveryStatus(mobile, "whatsapp", newStatus, body);
    console.log(`[Webhook][WhatsApp-DLR] ${mobile} → ${newStatus}`);
  }

  res.json({ ok: true });
});

// ── POST /api/webhook/sms-dlr — Fast2SMS ─────────────────────────────────
router.post("/sms-dlr", async (req, res) => {
  const body = req.body ?? {};
  console.log("[Webhook][SMS-DLR] Received:", JSON.stringify(body).slice(0, 500));

  // Fast2SMS DLR payload: { phone, status, message_id, ... }
  const phone: string = body.phone || body.mobile || body.number || "";
  const event: string = (body.status || body.delivery_status || "").toLowerCase();

  let newStatus: "delivered" | "read" | "failed" | null = null;
  if (event.includes("deliver") || event === "1") newStatus = "delivered";
  else if (event.includes("fail") || event === "0" || event.includes("undeliver")) newStatus = "failed";

  if (phone && newStatus) {
    const clean = phone.replace(/\D/g, "");
    const mobile = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    await updateDeliveryStatus(mobile, "sms", newStatus, body);
    console.log(`[Webhook][SMS-DLR] ${mobile} → ${newStatus}`);
  }

  res.json({ ok: true });
});

// ── POST /api/webhook/email-open — Generic email pixel tracker ────────────
router.post("/email-open", async (req, res) => {
  const body = req.body ?? {};
  const email: string = body.email || body.recipient || "";
  if (email) {
    await pool.query(
      `UPDATE notification_logs
       SET status = 'read',
           provider_response = provider_response || $1::jsonb,
           updated_at = NOW()
       WHERE id = (
         SELECT id FROM notification_logs
         WHERE recipient = $2 AND channel = 'email' AND status IN ('sent','delivered')
         ORDER BY sent_at DESC LIMIT 1
       )`,
      [JSON.stringify({ opened_at: new Date().toISOString(), payload: body }), email]
    ).catch(() => {});
    console.log(`[Webhook][Email-Open] ${email}`);
  }
  res.json({ ok: true });
});

// ── GET /api/webhook/email-open — pixel tracker (1×1 transparent gif) ────
router.get("/email-open", async (req, res) => {
  const email = (req.query.e as string) || "";
  if (email) {
    await pool.query(
      `UPDATE notification_logs
       SET status = 'read', provider_response = provider_response || $1::jsonb, updated_at = NOW()
       WHERE id = (
         SELECT id FROM notification_logs
         WHERE recipient = $2 AND channel = 'email' AND status IN ('sent','delivered')
         ORDER BY sent_at DESC LIMIT 1
       )`,
      [JSON.stringify({ opened_at: new Date().toISOString(), via: "pixel" }), email]
    ).catch(() => {});
  }
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(pixel);
});

export default router;
