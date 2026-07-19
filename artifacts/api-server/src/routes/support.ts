// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";
import multer from "multer";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── CUSTOMER ROUTES ──────────────────────────────────────────────────────────

// GET /api/support/tickets — customer's own tickets
router.get("/tickets", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, 
        (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'admin' AND m.read_at IS NULL) AS unread_count
       FROM support_tickets t
       WHERE t.customer_id = $1
       ORDER BY t.updated_at DESC`,
      [req.user?.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/support/tickets — create ticket
router.post("/tickets", requireAuth as any, upload.single("attachment") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId, subject, category, message, priority } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return void res.status(400).json({ error: "Subject and message are required" });
    }

    let attachmentUrl: string | null = null;
    if (req.file) {
      try {
        const key = `support/${randomUUID()}-${req.file.originalname}`;
        const { url } = await uploadToGCS(req.file.buffer, key, req.file.mimetype);
        attachmentUrl = url;
      } catch { /* ignore upload failures */ }
    }

    const ticketId = randomUUID();
    const msgId = randomUUID();
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

    // Get customer info for notification
    const userRes = await pool.query(`SELECT name, mobile, email FROM users WHERE id = $1`, [req.user?.id]);
    const user = userRes.rows[0];

    await pool.query(
      `INSERT INTO support_tickets (id, ticket_number, customer_id, booking_id, subject, category, status, priority, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,NOW(),NOW())`,
      [ticketId, ticketNumber, req.user?.id, bookingId || null, subject.trim(), category || "general", priority || "normal"]
    );

    await pool.query(
      `INSERT INTO support_messages (id, ticket_id, sender_type, sender_id, sender_name, message, attachment_url, created_at)
       VALUES ($1,$2,'customer',$3,$4,$5,$6,NOW())`,
      [msgId, ticketId, req.user?.id, user?.name || "Customer", message.trim(), attachmentUrl]
    );

    // Notify admin via notification
    fireNotificationEvent("support_ticket_created", {
      customerName: user?.name || "Customer",
      customerMobile: user?.mobile || "",
      ticketNumber,
      subject: subject.trim(),
    }).catch(() => {});

    res.json({ id: ticketId, ticketNumber, status: "open" });
  } catch (err: any) {
    console.error("[support] POST /tickets error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/tickets/:id — ticket detail with messages
router.get("/tickets/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const ticketRes = await pool.query(
      `SELECT * FROM support_tickets WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [req.params.id, req.user?.id]
    );
    if (!ticketRes.rows[0]) return void res.status(404).json({ error: "Ticket not found" });

    const msgRes = await pool.query(
      `SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    // Mark admin messages as read
    await pool.query(
      `UPDATE support_messages SET read_at = NOW()
       WHERE ticket_id = $1 AND sender_type = 'admin' AND read_at IS NULL`,
      [req.params.id]
    ).catch(() => {});

    res.json({ ticket: ticketRes.rows[0], messages: msgRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/support/tickets/:id/messages — customer reply
router.post("/tickets/:id/messages", requireAuth as any, upload.single("attachment") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const ticketRes = await pool.query(
      `SELECT * FROM support_tickets WHERE id = $1 AND customer_id = $2 LIMIT 1`,
      [req.params.id, req.user?.id]
    );
    if (!ticketRes.rows[0]) return void res.status(404).json({ error: "Ticket not found" });
    if (ticketRes.rows[0].status === "closed") {
      return void res.status(400).json({ error: "This ticket is closed. Please create a new ticket." });
    }

    const { message } = req.body;
    if (!message?.trim()) return void res.status(400).json({ error: "Message is required" });

    let attachmentUrl: string | null = null;
    if (req.file) {
      try {
        const key = `support/${randomUUID()}-${req.file.originalname}`;
        const { url } = await uploadToGCS(req.file.buffer, key, req.file.mimetype);
        attachmentUrl = url;
      } catch { /* ignore */ }
    }

    const userRes = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user?.id]);
    const msgId = randomUUID();

    await pool.query(
      `INSERT INTO support_messages (id, ticket_id, sender_type, sender_id, sender_name, message, attachment_url, created_at)
       VALUES ($1,$2,'customer',$3,$4,$5,$6,NOW())`,
      [msgId, req.params.id, req.user?.id, userRes.rows[0]?.name || "Customer", message.trim(), attachmentUrl]
    );

    await pool.query(
      `UPDATE support_tickets SET status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.json({ id: msgId, message: message.trim(), attachmentUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// GET /api/support/admin/tickets — all tickets for admin
router.get("/admin/tickets", requireAdmin as any, async (req, res) => {
  try {
    const { status, priority, search } = req.query as Record<string, string>;
    const params: any[] = [];
    const conds: string[] = [];

    if (status && status !== "all") { params.push(status); conds.push(`t.status = $${params.length}`); }
    if (priority && priority !== "all") { params.push(priority); conds.push(`t.priority = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conds.push(`(t.subject ILIKE $${params.length} OR t.ticket_number ILIKE $${params.length} OR u.name ILIKE $${params.length})`); }

    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

    const result = await pool.query(
      `SELECT t.*, u.name AS customer_name, u.mobile AS customer_mobile,
        (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
        (SELECT COUNT(*)::int FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'customer' AND m.read_at IS NULL) AS unread_count,
        (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.customer_id
       ${where}
       ORDER BY t.updated_at DESC
       LIMIT 200`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/admin/tickets/:id — ticket detail for admin
router.get("/admin/tickets/:id", requireAdmin as any, async (req, res) => {
  try {
    const ticketRes = await pool.query(
      `SELECT t.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.customer_id
       WHERE t.id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!ticketRes.rows[0]) return void res.status(404).json({ error: "Ticket not found" });

    const msgRes = await pool.query(
      `SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    // Mark customer messages as read
    await pool.query(
      `UPDATE support_messages SET read_at = NOW()
       WHERE ticket_id = $1 AND sender_type = 'customer' AND read_at IS NULL`,
      [req.params.id]
    ).catch(() => {});

    res.json({ ticket: ticketRes.rows[0], messages: msgRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/support/admin/tickets/:id — update status, priority, assignee
router.patch("/admin/tickets/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, priority, assignedTo, internalNote } = req.body;
    const sets: string[] = ["updated_at = NOW()"];
    const params: any[] = [req.params.id];

    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (priority) { params.push(priority); sets.push(`priority = $${params.length}`); }
    if (assignedTo !== undefined) { params.push(assignedTo || null); sets.push(`assigned_to = $${params.length}`); }
    if (status === "resolved" || status === "closed") {
      sets.push("resolved_at = NOW()");
    }

    await pool.query(`UPDATE support_tickets SET ${sets.join(", ")} WHERE id = $1`, params);

    // Add internal note as admin message if provided
    if (internalNote?.trim()) {
      const msgId = randomUUID();
      await pool.query(
        `INSERT INTO support_messages (id, ticket_id, sender_type, sender_id, sender_name, message, is_internal, created_at)
         VALUES ($1,$2,'admin',$3,$4,$5,true,NOW())`,
        [msgId, req.params.id, req.user?.id, req.user?.name || "Admin", internalNote.trim()]
      );
    }

    // Notify customer on status change
    if (status === "resolved" || status === "closed") {
      const ticketRes = await pool.query(
        `SELECT t.ticket_number, u.name, u.mobile FROM support_tickets t JOIN users u ON u.id = t.customer_id WHERE t.id = $1`,
        [req.params.id]
      );
      if (ticketRes.rows[0]) {
        const { name, mobile, ticket_number } = ticketRes.rows[0];
        fireNotificationEvent("support_ticket_resolved", {
          customerName: name || "Customer",
          customerMobile: mobile || "",
          ticketNumber: ticket_number,
          status,
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/support/admin/tickets/:id/messages — admin reply
router.post("/admin/tickets/:id/messages", requireAdmin as any, upload.single("attachment") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, isInternal } = req.body;
    if (!message?.trim()) return void res.status(400).json({ error: "Message required" });

    let attachmentUrl: string | null = null;
    if (req.file) {
      try {
        const key = `support/${randomUUID()}-${req.file.originalname}`;
        const { url } = await uploadToGCS(req.file.buffer, key, req.file.mimetype);
        attachmentUrl = url;
      } catch { /* ignore */ }
    }

    const msgId = randomUUID();
    await pool.query(
      `INSERT INTO support_messages (id, ticket_id, sender_type, sender_id, sender_name, message, attachment_url, is_internal, created_at)
       VALUES ($1,$2,'admin',$3,$4,$5,$6,$7,NOW())`,
      [msgId, req.params.id, req.user?.id, req.user?.name || "Admin", message.trim(), attachmentUrl, isInternal === "true" || isInternal === true]
    );

    await pool.query(
      `UPDATE support_tickets SET status = CASE WHEN status = 'open' THEN 'pending' ELSE status END, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    // Notify customer of admin reply (non-internal only)
    if (!isInternal || isInternal === "false") {
      const ticketRes = await pool.query(
        `SELECT t.ticket_number, u.name, u.mobile FROM support_tickets t JOIN users u ON u.id = t.customer_id WHERE t.id = $1`,
        [req.params.id]
      );
      if (ticketRes.rows[0]) {
        const { name, mobile, ticket_number } = ticketRes.rows[0];
        fireNotificationEvent("support_ticket_reply", {
          customerName: name || "Customer",
          customerMobile: mobile || "",
          ticketNumber: ticket_number,
          message: message.trim().slice(0, 100),
        }).catch(() => {});
      }
    }

    res.json({ id: msgId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/admin/stats — ticket stats for admin dashboard
router.get("/admin/stats", requireAdmin as any, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
        COUNT(*) FILTER (WHERE priority = 'urgent')::int AS urgent_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS today_count
       FROM support_tickets`
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
