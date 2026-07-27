/**
 * Delivery status webhooks — updates notification_logs with real provider confirmations.
 *
 * Routes:
 *   POST /api/webhook/rcs          — Lemin AI RCS delivery status
 *   POST /api/webhook/botbee       — BotBee production webhook (DLR + inbound messages)
 *   POST /api/webhook/whatsapp-dlr — BotBee WhatsApp delivery report (legacy alias)
 *   POST /api/webhook/sms-dlr      — Fast2SMS SMS delivery report
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { addTimeline } from "../lib/workflowEngine.js";
import { broadcastToInbox } from "./inbox.js";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise any phone string to 10-digit India mobile (strips +91/91 prefix) */
function normaliseMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0"))  return digits.slice(1);
  return digits.slice(-10);
}

/** Detect BotBee payload type */
type BotBeePayloadKind =
  | "dlr"           // delivery receipt / status update
  | "text"          // incoming plain-text message from customer
  | "media"         // incoming image / document / audio / video
  | "interactive"   // button reply or list reply
  | "location"      // incoming location share
  | "unknown";

function detectKind(body: Record<string, any>): BotBeePayloadKind {
  const type = (body.type || "").toLowerCase();
  const status = (body.status || body.event || "").toLowerCase();

  // Delivery receipts: BotBee sends status field with deliver/read/fail keywords
  const dlrStatuses = ["delivered", "read", "seen", "failed", "error", "sent", "0", "1"];
  if (status && dlrStatuses.some(s => status.includes(s))) return "dlr";
  if (body.message_id && body.status) return "dlr";

  if (type === "text" || body.text?.body) return "text";
  if (type === "interactive" || body.interactive) return "interactive";
  if (type === "location" || body.location) return "location";
  if (["image","document","audio","video","sticker","voice"].includes(type)) return "media";
  return "unknown";
}

/** Look up customer + active booking by mobile number */
async function lookupCustomer(mobile10: string): Promise<{
  customerId: string | null;
  customerName: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  packageName: string | null;
}> {
  try {
    const r = await pool.query(
      `SELECT u.id AS customer_id, u.name AS customer_name,
              b.id AS booking_id, b.booking_number, b.package_name
       FROM users u
       LEFT JOIN bookings b ON b.customer_id = u.id
         AND b.status NOT IN ('rejected','cancelled','completed')
       WHERE u.mobile = $1 OR u.mobile = $2
       ORDER BY b.created_at DESC NULLS LAST
       LIMIT 1`,
      [mobile10, "91" + mobile10]
    );
    const row = r.rows[0];
    if (!row) return { customerId: null, customerName: null, bookingId: null, bookingNumber: null, packageName: null };
    return {
      customerId:   row.customer_id,
      customerName: row.customer_name,
      bookingId:    row.booking_id    || null,
      bookingNumber:row.booking_number || null,
      packageName:  row.package_name  || null,
    };
  } catch { return { customerId: null, customerName: null, bookingId: null, bookingNumber: null, packageName: null }; }
}

/** Append an entry to botbee_webhook_log (created on first use) */
async function logWebhookEntry(payload: {
  kind: string;
  mobile: string;
  messageId?: string | null;
  raw: string;
}): Promise<void> {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS botbee_webhook_log (
        id          BIGSERIAL PRIMARY KEY,
        kind        TEXT,
        mobile      TEXT,
        message_id  TEXT,
        raw_payload JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )`,
    );
    await pool.query(
      `INSERT INTO botbee_webhook_log (kind, mobile, message_id, raw_payload)
       VALUES ($1,$2,$3,$4)`,
      [payload.kind, payload.mobile, payload.messageId ?? null, payload.raw]
    );
  } catch { /* non-blocking */ }
}

/** Write or update OTP sessions table when customer sends a reply */
async function handleOtpReply(mobile10: string, text: string): Promise<boolean> {
  const cleaned = text.trim().replace(/\D/g, "");
  if (cleaned.length !== 6) return false;
  try {
    const r = await pool.query(
      `UPDATE otp_sessions SET status='verified', verified_at=NOW()
       WHERE mobile=$1 AND otp=$2 AND status='pending' AND expires_at > NOW()
       RETURNING id`,
      [mobile10, cleaned]
    );
    return (r.rowCount ?? 0) > 0;
  } catch { return false; }
}

// ── POST /api/webhook/botbee — BotBee production webhook ─────────────────────
//
// Handles:
//   1. Delivery receipts (status updates from BotBee/Meta)
//   2. Incoming customer messages (text, media, interactive, location)
//   3. OTP auto-verification replies
//   4. Customer timeline entries
//   5. Support ticket creation for inbound messages
//   6. notification_logs DLR update
//
// BotBee does not sign webhook payloads with HMAC — no signature verification.
// Rate-limit and IP allowlist via nginx upstream if needed.
//
router.post("/botbee", async (req, res) => {
  // ── 0. Return 200 immediately — BotBee retries on timeout ─────────────────
  res.status(200).json({ ok: true, received: true });

  const body: Record<string, any> = req.body ?? {};
  const raw = JSON.stringify(body);
  const kind = detectKind(body);

  // Extract phone from all known BotBee payload shapes
  const rawPhone: string =
    body.phone_number || body.phone || body.from || body.sender ||
    body.recipient || body.contact?.phone || "";
  const mobile10 = rawPhone ? normaliseMobile(rawPhone) : "";

  const messageId: string = body.message_id || body.id || body.wamid || "";
  const timestamp: string = body.timestamp
    ? new Date(Number(body.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  console.log(
    `[Webhook][BotBee] kind=${kind} mobile=${mobile10 || "?"} ` +
    `msgId=${messageId || "-"} raw=${raw.slice(0, 300)}`
  );

  // ── 1. Persist to raw webhook log (non-blocking) ──────────────────────────
  logWebhookEntry({ kind, mobile: mobile10, messageId, raw }).catch(() => {});

  // ── 2. Delivery receipt handling ──────────────────────────────────────────
  if (kind === "dlr" && mobile10) {
    const event = (body.status || body.event || body.type || "").toLowerCase();
    let dlrStatus: "delivered" | "read" | "failed" | "clicked" | null = null;
    if (event.includes("deliver") || event === "1")          dlrStatus = "delivered";
    else if (event.includes("read") || event.includes("seen")) dlrStatus = "read";
    else if (event.includes("fail") || event.includes("error") || event === "0") dlrStatus = "failed";
    else if (event.includes("click"))                          dlrStatus = "clicked";

    if (dlrStatus) {
      // Update notification_logs
      await updateDeliveryStatus(mobile10, "whatsapp", dlrStatus, body);

      // Update meta_messages if wamid present
      if (messageId) {
        await pool.query(
          `UPDATE meta_messages SET status=$1, updated_at=NOW()
           WHERE wamid=$2 AND status NOT IN ('read')`,
          [dlrStatus, messageId]
        ).catch(() => {});
      }

      console.log(`[Webhook][BotBee][DLR] ${mobile10} → ${dlrStatus} (msgId=${messageId})`);
    }
    return;
  }

  // ── 3. Inbound message handling (text / media / interactive / location) ───
  if (kind === "unknown" && !mobile10) return; // nothing actionable

  // Look up customer + active booking
  const customer = mobile10 ? await lookupCustomer(mobile10) : {
    customerId: null, customerName: null,
    bookingId: null, bookingNumber: null, packageName: null,
  };

  const { customerId, customerName, bookingId, bookingNumber, packageName } = customer;

  // ── 3a. Text message ───────────────────────────────────────────────────────
  if (kind === "text") {
    const text: string = body.text?.body || body.message || body.content || "";

    // Check if it's a 6-digit OTP reply
    const wasOtp = await handleOtpReply(mobile10, text);
    if (wasOtp) {
      console.log(`[Webhook][BotBee][OTP] Auto-verified OTP for ${mobile10}`);
      // Log OTP verification to timeline
      if (customerId) {
        await addTimeline({
          customerId,
          bookingId: bookingId ?? undefined,
          eventType: "otp_verified",
          title:    "OTP Verified via WhatsApp",
          description: "Customer replied with OTP via WhatsApp — session verified.",
          icon: "🔐",
        });
      }
      return;
    }

    // Log to notification_logs as inbound
    await pool.query(
      `INSERT INTO notification_logs
         (id, event_type, channel, recipient, message, status, provider_response, provider_name, sent_at, retry_count)
       VALUES ($1,'inbound_message','whatsapp',$2,$3,'received',$4,'BotBee',NOW(),0)
       ON CONFLICT DO NOTHING`,
      [
        `bb_in_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        mobile10,
        text.slice(0, 500),
        JSON.stringify({ kind, raw: body, at: timestamp }),
      ]
    ).catch(() => {});

    // Broadcast to SSE inbox clients (real-time update for admin Omnichannel Inbox)
    broadcastToInbox("new_message", {
      lead_id: null, // will be resolved by inbox when it reloads
      mobile: mobile10,
      platform: "whatsapp",
      preview: text.slice(0, 80),
      at: Date.now(),
    });

    // Add to customer timeline
    if (customerId) {
      await addTimeline({
        customerId,
        bookingId: bookingId ?? undefined,
        eventType: "customer_message",
        title:    "Customer Replied on WhatsApp",
        description: text.slice(0, 200),
        icon: "💬",
      });
    }

    // Create or append to open support ticket for this inbound message
    if (customerId) {
      try {
        const openTicket = await pool.query(
          `SELECT id FROM support_tickets
           WHERE customer_id=$1 AND status='open'
           ORDER BY created_at DESC LIMIT 1`,
          [customerId]
        );
        if (openTicket.rows[0]) {
          // Append message to existing open ticket
          await pool.query(
            `INSERT INTO support_messages
               (ticket_id, sender_type, sender_id, message, created_at)
             VALUES ($1,'customer',$2,$3,NOW())`,
            [openTicket.rows[0].id, customerId, text.slice(0, 2000)]
          );
        } else {
          // Open a new ticket with the first message as subject
          const newTicket = await pool.query(
            `INSERT INTO support_tickets
               (customer_id, booking_id, subject, status, channel, created_at, updated_at)
             VALUES ($1,$2,$3,'open','whatsapp',NOW(),NOW())
             RETURNING id`,
            [customerId, bookingId ?? null, text.slice(0, 100)]
          );
          if (newTicket.rows[0]) {
            await pool.query(
              `INSERT INTO support_messages
                 (ticket_id, sender_type, sender_id, message, created_at)
               VALUES ($1,'customer',$2,$3,NOW())`,
              [newTicket.rows[0].id, customerId, text.slice(0, 2000)]
            );
          }
        }
      } catch { /* support tables might not exist — non-fatal */ }
    }

    console.log(
      `[Webhook][BotBee][Text] ${mobile10} "${text.slice(0, 80)}" ` +
      `customer=${customerName ?? "unknown"} booking=${bookingNumber ?? "none"}`
    );
    return;
  }

  // ── 3b. Media message (image / document / audio / video) ──────────────────
  if (kind === "media") {
    const mediaType: string = (body.type || "document").toLowerCase();
    const caption: string  = body.caption || body[mediaType]?.caption || "";
    const mediaId: string  = body[mediaType]?.id || body.media_id || "";

    await pool.query(
      `INSERT INTO notification_logs
         (id, event_type, channel, recipient, message, status, provider_response, provider_name, sent_at, retry_count)
       VALUES ($1,'inbound_media','whatsapp',$2,$3,'received',$4,'BotBee',NOW(),0)
       ON CONFLICT DO NOTHING`,
      [
        `bb_media_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        mobile10,
        `[${mediaType}] ${caption}`.slice(0, 300),
        JSON.stringify({ kind, mediaType, mediaId, caption, raw: body, at: timestamp }),
      ]
    ).catch(() => {});

    if (customerId) {
      await addTimeline({
        customerId,
        bookingId: bookingId ?? undefined,
        eventType: "customer_message",
        title:    `Customer Sent ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} via WhatsApp`,
        description: caption || `Inbound ${mediaType} received`,
        icon: mediaType === "image" ? "🖼️" : mediaType === "document" ? "📄" : mediaType === "audio" ? "🎵" : "📎",
      });
    }

    console.log(`[Webhook][BotBee][Media] ${mobile10} type=${mediaType} id=${mediaId}`);
    return;
  }

  // ── 3c. Interactive (button reply / list reply) ────────────────────────────
  if (kind === "interactive") {
    const itype = body.interactive?.type || "";
    const btnId: string    = body.interactive?.button_reply?.id    || body.button_id    || "";
    const btnTitle: string = body.interactive?.button_reply?.title || body.button_title || "";
    const listId: string   = body.interactive?.list_reply?.id      || "";
    const listTitle:string = body.interactive?.list_reply?.title   || "";

    const replyId    = btnId    || listId;
    const replyTitle = btnTitle || listTitle;

    console.log(
      `[Webhook][BotBee][Interactive] ${mobile10} type=${itype} ` +
      `id="${replyId}" title="${replyTitle}" customer=${customerName ?? "unknown"}`
    );

    await pool.query(
      `INSERT INTO notification_logs
         (id, event_type, channel, recipient, message, status, provider_response, provider_name, sent_at, retry_count)
       VALUES ($1,'inbound_interactive','whatsapp',$2,$3,'received',$4,'BotBee',NOW(),0)
       ON CONFLICT DO NOTHING`,
      [
        `bb_btn_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        mobile10,
        `[button] ${replyTitle || replyId}`.slice(0, 300),
        JSON.stringify({ kind, itype, replyId, replyTitle, raw: body, at: timestamp }),
      ]
    ).catch(() => {});

    if (customerId) {
      await addTimeline({
        customerId,
        bookingId: bookingId ?? undefined,
        eventType: "customer_message",
        title:    "Customer Tapped Button on WhatsApp",
        description: replyTitle || replyId,
        icon: "🔘",
      });
    }
    return;
  }

  // ── 3d. Location share ─────────────────────────────────────────────────────
  if (kind === "location") {
    const lat  = body.location?.latitude  || body.latitude  || "";
    const lon  = body.location?.longitude || body.longitude || "";
    const name = body.location?.name || "";

    console.log(`[Webhook][BotBee][Location] ${mobile10} lat=${lat} lon=${lon} name=${name}`);

    if (customerId) {
      await addTimeline({
        customerId,
        bookingId: bookingId ?? undefined,
        eventType: "customer_message",
        title:    "Customer Shared Location via WhatsApp",
        description: name || `${lat}, ${lon}`,
        icon: "📍",
      });
    }
    return;
  }

  // ── 4. Unknown payload — log for inspection ────────────────────────────────
  console.log(`[Webhook][BotBee][Unknown] kind=${kind} body=${raw.slice(0,300)}`);
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
