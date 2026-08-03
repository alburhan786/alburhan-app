// @ts-nocheck
/**
 * Customer Portal 2.0 — API routes
 * Mounted at /api/customer  (alongside /api/customer/journey which stays on its own router)
 *
 * All customer-facing routes require requireAuth and verify customer_id === req.user.id
 * Admin resource-management routes require requireAdmin.
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS } from "../lib/notifications.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { generateAgreementPdfBuffer, CONSENT_CATEGORIES } from "../lib/agreementPdf.js";
import { sendDocumentToCustomer } from "../lib/documentDelivery.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { buildPdfOpts, getSiteBase } from "./agreements.js";
import { createHash } from "crypto";
import crypto from "crypto";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

async function logActivity(customerId: string, action: string, opts: {
  bookingId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  ua?: string;
} = {}) {
  try {
    await pool.query(
      `INSERT INTO customer_portal_activity
         (customer_id, booking_id, action, metadata, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [customerId, opts.bookingId ?? null, action, JSON.stringify(opts.metadata ?? {}),
        opts.ip ?? null, opts.ua ?? null]
    );
  } catch { /* non-critical */ }
}

// Strip sensitive fields from notification_logs before sending to customer
function sanitizeNotifLog(row: any) {
  const { api_payload, request_payload, error_message, idempotency_key,
    wamid, recipient_wamid, ...safe } = row;
  return safe;
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────

/**
 * GET /api/customer/overview
 * Returns a snapshot: bookings[], active booking finance, unread count, profile.
 */
router.get("/overview", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [bookingsRes, profileRes, unreadRes] = await Promise.all([
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.journey_status,
                b.preferred_departure_date, b.return_date,
                pkg.name AS package_name, pkg.package_type,
                hg.group_name, hg.departure_date, hg.return_date AS group_return_date,
                hg.flight_number, hg.maktab_number,
                inv.total_amount, inv.paid_amount, inv.status AS invoice_status
         FROM bookings b
         LEFT JOIN packages pkg ON pkg.id = b.package_id
         LEFT JOIN hajj_groups hg ON hg.id = b.group_id
         LEFT JOIN invoices inv ON inv.booking_id = b.id
         WHERE b.customer_id = $1
           AND b.tenant_id = (SELECT tenant_id FROM users WHERE id = $1 LIMIT 1)
         ORDER BY b.created_at DESC
         LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT id, full_name, email, mobile, city, state, address,
                blood_group, emergency_contact_name, emergency_contact_mobile,
                profile_image_url, created_at
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt
         FROM customer_notifications
         WHERE customer_id = $1 AND is_read = false AND (is_archived IS NULL OR is_archived = false)
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId]
      ),
    ]);

    const bookings = bookingsRes.rows;
    const profile  = profileRes.rows[0] || null;
    const unreadCount = parseInt(unreadRes.rows[0]?.cnt ?? "0", 10);

    // Pending profile-edit requests
    const pendingEditsRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM customer_profile_edits WHERE customer_id=$1 AND status='pending'`,
      [userId]
    );
    const pendingEdits = parseInt(pendingEditsRes.rows[0]?.cnt ?? "0", 10);

    // Recent notifications (5)
    const recentNotifRes = await pool.query(
      `SELECT id, title, message, type, category, is_read, action_url, priority, created_at
       FROM customer_notifications
       WHERE customer_id=$1 AND (is_archived IS NULL OR is_archived=false)
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    logActivity(userId, "overview_view", { ip: req.ip, ua: req.headers["user-agent"] as string });

    res.json({
      ok: true,
      profile,
      bookings,
      unreadCount,
      pendingEdits,
      recentNotifications: recentNotifRes.rows,
    });
  } catch (e: any) {
    console.error("[CustomerPortal] overview error:", e);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// ─── BOOKING DETAIL ──────────────────────────────────────────────────────────

/**
 * GET /api/customer/bookings/:bookingNumber
 * Full booking detail including pilgrims, group, package.
 */
router.get("/bookings/:bookingNumber", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { bookingNumber } = req.params;

    // Explicit safe projection — internal/operational columns (razorpay_order_id,
    // provider_ref, raw webhook payloads, internal notes, etc.) deliberately excluded
    const bkRes = await pool.query(
      `SELECT b.id, b.booking_number, b.customer_id, b.group_id, b.package_id,
              b.booking_date, b.journey_status, b.status, b.booking_status,
              b.final_amount, b.paid_amount, b.advance_amount, b.due_amount,
              b.currency, b.customer_name, b.customer_email, b.customer_mobile,
              b.number_of_pilgrims, b.special_requests, b.created_at, b.updated_at,
              pkg.name AS package_name, pkg.package_type, pkg.duration_days,
              pkg.description AS package_description,
              hg.group_name, hg.departure_date AS group_departure_date,
              hg.return_date AS group_return_date, hg.flight_number,
              hg.maktab_number, hg.hotels AS group_hotels_json,
              hg.group_number
       FROM bookings b
       LEFT JOIN packages pkg ON pkg.id = b.package_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE b.booking_number = $1 AND b.customer_id = $2
       LIMIT 1`,
      [bookingNumber, userId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });

    // Pilgrims: only return pilgrims matching this customer's mobile number.
    // Using mobile matching (same pattern as customer-journey.ts) prevents PII leakage
    // to unrelated pilgrims in the same hajj group.
    // Restrict to pilgrims matching THIS customer's mobile — no cross-group leakage.
    // When customer_mobile is absent/empty we intentionally return no pilgrims rather
    // than bypass the predicate (empty string pattern would match every row).
    const customerMobile = (booking.customer_mobile || "")
      .replace(/\D/g, "").replace(/^91/, "").slice(-9);
    const mobilePattern = customerMobile ? `%${customerMobile}` : "__NOMATCH__";

    // Pilgrim response deliberately omits sensitive travel-ID fields (passport_number,
    // visa_number, date_of_birth, passport_expiry, visa_expiry) — a single phone number
    // may map to multiple family members; individual identity documents are not needed
    // for self-service portal flows (journey status, room/bus allocation, etc.).
    const pilgrimsRes = await pool.query(
      `SELECT p.id, p.full_name, p.gender, p.nationality, p.blood_group,
              p.serial_number, p.family_id, p.family_relation, p.family_head,
              p.room_number, p.bus_number, p.seat_number
       FROM pilgrims p
       WHERE p.group_id = $1
         AND REPLACE(REPLACE(COALESCE(p.mobile_india,''), ' ', ''), '-', '') LIKE $2
       ORDER BY p.serial_number`,
      [booking.group_id, mobilePattern]
    );

    // Agreement status
    const agrRes = await pool.query(
      `SELECT id, status, created_at, signed_at FROM agreements WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [booking.id]
    );

    // Documents count
    const docCountRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM documents WHERE booking_id=$1`,
      [booking.id]
    );

    logActivity(userId, "booking_view", { bookingId: booking.id, ip: req.ip, ua: req.headers["user-agent"] as string });

    res.json({
      ok: true,
      booking: {
        ...booking,
        group_hotels: (() => {
          try { return JSON.parse(booking.group_hotels_json || "[]"); } catch { return []; }
        })(),
      },
      pilgrims: pilgrimsRes.rows,
      agreement: agrRes.rows[0] || null,
      documentCount: parseInt(docCountRes.rows[0]?.cnt ?? "0", 10),
    });
  } catch (e: any) {
    console.error("[CustomerPortal] booking detail error:", e);
    res.status(500).json({ error: "Failed to load booking detail" });
  }
});

// ─── FINANCE ─────────────────────────────────────────────────────────────────

/**
 * GET /api/customer/bookings/:bookingNumber/finance
 */
router.get("/bookings/:bookingNumber/finance", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { bookingNumber } = req.params;

    const bkRes = await pool.query(
      `SELECT id FROM bookings WHERE booking_number=$1 AND customer_id=$2 LIMIT 1`,
      [bookingNumber, userId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });

    const [invoiceRes, receiptsRes, txRes, refundsRes] = await Promise.all([
      pool.query(
        `SELECT id, invoice_number, total_amount, paid_amount, status,
                due_date, created_at, notes
         FROM invoices WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [booking.id]
      ),
      pool.query(
        `SELECT id, receipt_number, amount, created_at, notes
         FROM receipts WHERE booking_id=$1 ORDER BY created_at DESC`,
        [booking.id]
      ),
      pool.query(
        `SELECT id, amount, payment_mode, payment_date, notes, status, created_at
         FROM payment_transactions WHERE booking_id=$1 ORDER BY created_at DESC`,
        [booking.id]
      ),
      pool.query(
        `SELECT id, amount, reason, status, created_at FROM refunds WHERE booking_id=$1 ORDER BY created_at DESC`,
        [booking.id]
      ),
    ]);

    logActivity(userId, "finance_view", { bookingId: booking.id, ip: req.ip, ua: req.headers["user-agent"] as string });

    res.json({
      ok: true,
      invoice: invoiceRes.rows[0] || null,
      receipts: receiptsRes.rows,
      transactions: txRes.rows,
      refunds: refundsRes.rows,
    });
  } catch (e: any) {
    console.error("[CustomerPortal] finance error:", e);
    res.status(500).json({ error: "Failed to load finance details" });
  }
});

// ─── COMMUNICATIONS ──────────────────────────────────────────────────────────

/**
 * GET /api/customer/bookings/:bookingNumber/communications
 * Returns sanitised notification_logs (no API keys, no raw payloads).
 */
router.get("/bookings/:bookingNumber/communications", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { bookingNumber } = req.params;
    const page  = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const bkRes = await pool.query(
      `SELECT id FROM bookings WHERE booking_number=$1 AND customer_id=$2 LIMIT 1`,
      [bookingNumber, userId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });

    const [logsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, event_type, channel, status, recipient,
                error_code, provider_response,
                sent_at, created_at, template_id, provider_name,
                delivery_status, delivery_updated_at
         FROM notification_logs
         WHERE booking_id=$1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [booking.id, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM notification_logs WHERE booking_id=$1`,
        [booking.id]
      ),
    ]);

    res.json({
      ok: true,
      logs: logsRes.rows.map(sanitizeNotifLog),
      total: parseInt(countRes.rows[0]?.cnt ?? "0", 10),
      page,
      limit,
    });
  } catch (e: any) {
    console.error("[CustomerPortal] comms error:", e);
    res.status(500).json({ error: "Failed to load communications" });
  }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

/**
 * GET /api/customer/notifications
 */
router.get("/notifications", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const page     = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const limit    = 20;
    const offset   = (page - 1) * limit;
    const archived = req.query.archived === "true";
    const unread   = req.query.unread === "true";
    const category = req.query.category as string | undefined;

    let where = `customer_id=$1 AND (is_archived ${archived ? "= true" : "IS NULL OR is_archived = false"})`;
    const params: any[] = [userId];
    let pi = 2;

    if (unread) { where += ` AND is_read = false`; }
    if (category) { where += ` AND category = $${pi++}`; params.push(category); }
    where += ` AND (expires_at IS NULL OR expires_at > NOW())`;

    const [rows, countRes] = await Promise.all([
      pool.query(
        `SELECT id, title, message, type, category, is_read, is_archived,
                action_url, priority, created_at, expires_at
         FROM customer_notifications
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM customer_notifications WHERE ${where}`,
        params
      ),
    ]);

    res.json({
      ok: true,
      notifications: rows.rows,
      total: parseInt(countRes.rows[0]?.cnt ?? "0", 10),
      page,
      limit,
    });
  } catch (e: any) {
    console.error("[CustomerPortal] notifications error:", e);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

/**
 * PUT /api/customer/notifications/:id/read
 */
router.put("/notifications/:id/read", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    await pool.query(
      `UPDATE customer_notifications SET is_read=true WHERE id=$1 AND customer_id=$2`,
      [id, userId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to mark read" });
  }
});

/**
 * PUT /api/customer/notifications/read-all
 */
router.put("/notifications/read-all", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    await pool.query(
      `UPDATE customer_notifications SET is_read=true WHERE customer_id=$1 AND is_read=false`,
      [userId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to mark all read" });
  }
});

/**
 * PUT /api/customer/notifications/:id/archive
 */
router.put("/notifications/:id/archive", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    await pool.query(
      `UPDATE customer_notifications SET is_archived=true, is_read=true WHERE id=$1 AND customer_id=$2`,
      [id, userId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to archive notification" });
  }
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

/**
 * POST /api/customer/profile/edit-request
 * Customer requests a field change; admin must approve before it takes effect.
 */
router.post("/profile/edit-request", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { fields } = req.body as { fields: { field_name: string; new_value: string }[] };
    if (!Array.isArray(fields) || fields.length === 0) {
      return void res.status(400).json({ error: "fields array required" });
    }

    // Allowed editable fields
    const EDITABLE = new Set(["full_name", "email", "city", "state", "address",
      "blood_group", "emergency_contact_name", "emergency_contact_mobile"]);

    const userRes = await pool.query(
      `SELECT full_name, email, mobile, city, state, address, blood_group,
              emergency_contact_name, emergency_contact_mobile FROM users WHERE id=$1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) return void res.status(404).json({ error: "User not found" });

    const inserted: any[] = [];
    for (const f of fields) {
      if (!EDITABLE.has(f.field_name)) continue;
      const old_value = user[f.field_name] ?? null;
      const r = await pool.query(
        `INSERT INTO customer_profile_edits
           (customer_id, field_name, old_value, new_value, status)
         VALUES ($1,$2,$3,$4,'pending')
         RETURNING id, field_name, new_value, status, created_at`,
        [userId, f.field_name, old_value, f.new_value]
      );
      inserted.push(r.rows[0]);
    }

    res.json({ ok: true, requests: inserted });
  } catch (e: any) {
    console.error("[CustomerPortal] edit-request error:", e);
    res.status(500).json({ error: "Failed to submit edit request" });
  }
});

/**
 * GET /api/customer/profile/edit-requests
 */
router.get("/profile/edit-requests", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const rows = await pool.query(
      `SELECT id, field_name, old_value, new_value, status, notes, created_at, reviewed_at
       FROM customer_profile_edits WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    res.json({ ok: true, requests: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load edit requests" });
  }
});

// ─── ORIENTATION RESOURCES (PUBLIC READ) ────────────────────────────────────

/**
 * GET /api/customer/resources
 */
router.get("/resources", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId   = req.user!.id;
    const category = req.query.category as string | undefined;
    const search   = req.query.q as string | undefined;

    let where = `is_published=true`;
    const params: any[] = [];
    let pi = 1;

    if (category) { where += ` AND category=$${pi++}`; params.push(category); }
    if (search)   { where += ` AND (title ILIKE $${pi} OR description ILIKE $${pi})`; params.push(`%${search}%`); pi++; }

    const rows = await pool.query(
      `SELECT id, title, description, category, resource_type, content,
              external_url, file_url, thumbnail_url, language, view_count, sort_order, created_at
       FROM orientation_resources WHERE ${where}
       ORDER BY sort_order ASC, created_at DESC`,
      params
    );

    // Increment view counts for fetched resources (fire-and-forget)
    const ids = rows.rows.map((r: any) => r.id);
    if (ids.length > 0) {
      pool.query(`UPDATE orientation_resources SET view_count=view_count+1 WHERE id=ANY($1::uuid[])`, [ids])
        .catch(() => {});
    }

    logActivity(userId, "resources_view", { metadata: { category, search }, ip: req.ip });

    res.json({ ok: true, resources: rows.rows });
  } catch (e: any) {
    console.error("[CustomerPortal] resources error:", e);
    res.status(500).json({ error: "Failed to load resources" });
  }
});

// ─── ADMIN — RESOURCES CRUD ──────────────────────────────────────────────────

router.get("/admin/resources", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM orientation_resources ORDER BY sort_order ASC, created_at DESC`
    );
    res.json({ ok: true, resources: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/resources", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, category = "general", resource_type = "article",
      content, external_url, file_url, thumbnail_url, language = "en",
      is_published = true, sort_order = 0 } = req.body;
    if (!title) return void res.status(400).json({ error: "title required" });

    const r = await pool.query(
      `INSERT INTO orientation_resources
         (title, description, category, resource_type, content, external_url,
          file_url, thumbnail_url, language, is_published, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [title, description, category, resource_type, content, external_url,
        file_url, thumbnail_url, language, is_published, sort_order, req.user!.id]
    );
    res.json({ ok: true, resource: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/resources/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, resource_type, content,
      external_url, file_url, thumbnail_url, language, is_published, sort_order } = req.body;
    const r = await pool.query(
      `UPDATE orientation_resources SET
         title=$1, description=$2, category=$3, resource_type=$4, content=$5,
         external_url=$6, file_url=$7, thumbnail_url=$8, language=$9,
         is_published=$10, sort_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title, description, category, resource_type, content, external_url,
        file_url, thumbnail_url, language, is_published, sort_order, id]
    );
    if (!r.rows[0]) return void res.status(404).json({ error: "Not found" });
    res.json({ ok: true, resource: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/admin/resources/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM orientation_resources WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN — PROFILE EDIT APPROVALS ─────────────────────────────────────────

router.get("/admin/profile-edits", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const status = req.query.status as string || "pending";
    const rows = await pool.query(
      `SELECT cpe.*, u.full_name AS customer_name, u.email AS customer_email, u.mobile AS customer_mobile
       FROM customer_profile_edits cpe
       JOIN users u ON u.id = cpe.customer_id
       WHERE cpe.status=$1
       ORDER BY cpe.created_at DESC LIMIT 100`,
      [status]
    );
    res.json({ ok: true, edits: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/profile-edits/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    const editRes = await pool.query(
      `UPDATE customer_profile_edits
         SET status='approved', reviewed_by=$1, reviewed_at=NOW(), notes=$2
       WHERE id=$3 RETURNING *`,
      [req.user!.id, notes || null, id]
    );
    const edit = editRes.rows[0];
    if (!edit) return void res.status(404).json({ error: "Not found" });

    // Apply the change to users table
    const ALLOWED = ["full_name","email","city","state","address",
      "blood_group","emergency_contact_name","emergency_contact_mobile"];
    if (ALLOWED.includes(edit.field_name)) {
      await pool.query(
        `UPDATE users SET ${edit.field_name}=$1 WHERE id=$2`,
        [edit.new_value, edit.customer_id]
      );
    }

    res.json({ ok: true, edit });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/profile-edits/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body || {};
    const r = await pool.query(
      `UPDATE customer_profile_edits
         SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), notes=$2
       WHERE id=$3 RETURNING *`,
      [req.user!.id, notes || null, id]
    );
    if (!r.rows[0]) return void res.status(404).json({ error: "Not found" });
    res.json({ ok: true, edit: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN — CUSTOMER PORTAL HEALTH ─────────────────────────────────────────

/**
 * GET /api/customer/admin/portal/:customerId
 * Admin sees: bookings, activity log, pending edits, documents, notifications.
 */
router.get("/admin/portal/:customerId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { customerId } = req.params;

    const [profileRes, bookingsRes, activityRes, pendingEditsRes, notifRes] = await Promise.all([
      pool.query(`SELECT id, full_name, email, mobile, city, created_at FROM users WHERE id=$1`, [customerId]),
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.journey_status, b.preferred_departure_date,
                inv.total_amount, inv.paid_amount, inv.status AS invoice_status
         FROM bookings b
         LEFT JOIN invoices inv ON inv.booking_id=b.id
         WHERE b.customer_id=$1 ORDER BY b.created_at DESC`,
        [customerId]
      ),
      pool.query(
        `SELECT action, metadata, ip_address, created_at
         FROM customer_portal_activity WHERE customer_id=$1
         ORDER BY created_at DESC LIMIT 30`,
        [customerId]
      ),
      pool.query(
        `SELECT id, field_name, old_value, new_value, status, created_at
         FROM customer_profile_edits WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 10`,
        [customerId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE is_read=false) AS unread,
                COUNT(*) AS total
         FROM customer_notifications WHERE customer_id=$1`,
        [customerId]
      ),
    ]);

    const profile = profileRes.rows[0];
    if (!profile) return void res.status(404).json({ error: "Customer not found" });

    res.json({
      ok: true,
      profile,
      bookings: bookingsRes.rows,
      recentActivity: activityRes.rows,
      profileEdits: pendingEditsRes.rows,
      notificationStats: notifRes.rows[0],
    });
  } catch (e: any) {
    console.error("[CustomerPortal] admin portal error:", e);
    res.status(500).json({ error: "Failed to load customer portal data" });
  }
});

/**
 * POST /api/customer/admin/portal/:customerId/notify
 * Admin sends a targeted notification to a customer.
 */
router.post("/admin/portal/:customerId/notify", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { customerId } = req.params;
    const { title, message, type = "info", category = "admin", action_url, priority = "normal" } = req.body;
    if (!title || !message) return void res.status(400).json({ error: "title and message required" });

    const r = await pool.query(
      `INSERT INTO customer_notifications
         (customer_id, title, message, type, category, action_url, priority, is_read)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false)
       RETURNING id`,
      [customerId, title, message, type, category, action_url || null, priority]
    );

    res.json({ ok: true, notificationId: r.rows[0].id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PORTAL: Agreement Signing (session-authenticated, no access_token in URLs) ─

/**
 * POST /api/customer/agreements/:id/request-otp
 * Sends a signing OTP to the customer's registered mobile.
 * Auth: session cookie — no access_token needed.
 */
router.post("/agreements/:id/request-otp", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user!.id;

    // Ownership via bookings.customer_id (authoritative) OR agreements.customer_id (legacy)
    const agRes = await pool.query(
      `SELECT a.id, a.status, a.agreement_number, a.booking_id,
              b.customer_mobile, b.booking_number, b.customer_id AS booking_customer_id
       FROM agreements a
       JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1
         AND (b.customer_id = $2 OR a.customer_id = $2)
         AND a.status NOT IN ('cancelled','superseded')
       LIMIT 1`,
      [id, customerId]
    );
    const ag = agRes.rows[0];
    if (!ag) return void res.status(404).json({ error: "Agreement not found" });
    if (ag.status === "signed") return void res.status(400).json({ error: "Agreement already signed" });

    const mobile = ag.customer_mobile;
    if (!mobile) return void res.status(400).json({ error: "No mobile number on record. Please contact support." });

    const otp    = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    const upd = await pool.query(
      `UPDATE agreements SET signing_otp=$1, signing_otp_expires_at=$2, updated_at=NOW()
       WHERE id=$3 AND status='pending_signature' RETURNING id`,
      [otp, expiry, ag.id]
    );
    if (!upd.rowCount) return void res.status(409).json({ error: "Agreement is not in a signable state" });

    const smsOk = await sendOtpSMS(mobile, otp);
    console.log(`[CustomerPortal] Agreement OTP ${smsOk ? "✅" : "⚠"} → ***${mobile.slice(-4)} agr=${ag.agreement_number}`);
    await logActivity(customerId, "agreement_otp_requested", { bookingId: ag.booking_id, agreementId: ag.id });

    res.json({ ok: true, message: "OTP sent to your registered mobile number" });
  } catch (e: any) {
    console.error("[CustomerPortal] agreement request-otp error:", e?.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

/**
 * POST /api/customer/agreements/:id/sign
 * Signs the agreement using session auth + OTP verification.
 * No access_token required — session cookie proves ownership.
 * Body: { otp, termsAccepted: { [consentId]: true } }
 */
router.post("/agreements/:id/sign", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user!.id;
    const { otp, termsAccepted } = req.body;

    if (!otp || !termsAccepted) return void res.status(400).json({ error: "OTP and terms acceptance are required" });

    // Ownership via bookings.customer_id (authoritative) OR agreements.customer_id (legacy)
    const agRes = await pool.query(
      `SELECT a.*, b.customer_mobile, b.booking_number, b.package_name,
              b.customer_id AS booking_customer_id
       FROM agreements a
       JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1
         AND (b.customer_id = $2 OR a.customer_id = $2)
         AND a.status NOT IN ('cancelled','superseded')
       LIMIT 1`,
      [id, customerId]
    );
    const ag = agRes.rows[0];
    if (!ag) return void res.status(404).json({ error: "Agreement not found" });
    if (ag.status === "signed") return void res.json({ ok: true, alreadySigned: true, agreementNumber: ag.agreement_number });

    if (!ag.signing_otp || ag.signing_otp !== String(otp)) {
      return void res.status(400).json({ error: "Invalid OTP. Please request a new one." });
    }
    if (!ag.signing_otp_expires_at || new Date() > new Date(ag.signing_otp_expires_at)) {
      return void res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    const requiredConsents = CONSENT_CATEGORIES.map((c: any) => c.id);
    const unaccepted = requiredConsents.filter((cid: string) => !termsAccepted[cid]);
    if (unaccepted.length > 0) {
      return void res.status(400).json({ error: `Please accept all consent categories. Missing: ${unaccepted.join(", ")}` });
    }

    const ip        = (req.headers["x-forwarded-for"] as string || req.socket?.remoteAddress || "").split(",")[0].trim();
    const userAgent = (req.headers["user-agent"] || "").substring(0, 200);
    const now       = new Date();
    // signatureData is minimal for portal signing (OTP-verified = consent proof)
    const signatureData = `portal-otp-verified:${customerId}:${now.toISOString()}`;
    const hashInput = `${ag.id}:${ag.agreement_number}:${signatureData}:${now.toISOString()}:${ip}`;
    const digitalHash = createHash("sha256").update(hashInput).digest("hex");

    const signResult = await pool.query(
      `UPDATE agreements SET status='signed', signature_data=$1, terms_accepted=$2,
         signed_at=$3, signed_ip=$4, signed_user_agent=$5,
         otp_verified=true, otp_verified_at=$3,
         signing_otp=NULL, signing_otp_expires_at=NULL,
         signing_metadata=$6, digital_hash=$7,
         access_token=NULL, access_token_expires_at=NULL,
         updated_at=NOW()
       WHERE id=$8 AND status='pending_signature' RETURNING id`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent,
        JSON.stringify({ via: "portal", userAgent, timestamp: now.toISOString() }),
        digitalHash, ag.id]
    );
    if (!signResult.rowCount) return void res.status(409).json({ error: "Agreement is no longer in a signable state." });

    await logActivity(customerId, "agreement_signed", { bookingId: ag.booking_id, agreementId: ag.id });

    // Notify + generate PDF fire-and-forget
    const agId = ag.id;
    ;(async () => {
      try {
        if (ag.customer_mobile) {
          triggerWorkflow("agreement_signed", {
            customerName: ag.customer_name || "Valued Customer",
            customerMobile: ag.customer_mobile,
            bookingNumber: ag.booking_number,
            packageName: ag.package_name,
            signedDate: now.toLocaleDateString("en-IN"),
            bookingId: ag.booking_id,
            customerId,
          }).catch(() => {});
        }
        // PDF generation — uses buildPdfOpts exported from agreements.ts
        const siteBase = getSiteBase();
        const pdfBuffer = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase, {
          signatureData, signedAt: now, signedIp: ip, userAgent,
          otpVerified: true, otpVerifiedAt: now, verificationUrl: "",
          termsAccepted, status: "signed",
          customerPhotoBuffer: null, passportPhotoBuffer: null,
        }));
        await pool.query(`UPDATE agreements SET pdf_generated=true, updated_at=NOW() WHERE id=$1`, [agId]);
        const pdfFilename = `Agreement-${ag.agreement_number}.pdf`;
        const savedFileUrl = await uploadToGCS(pdfBuffer, pdfFilename, "application/pdf", "agreements");
        const savedDocId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO documents
             (id, booking_id, document_type, file_name, file_key, file_url, uploaded_by,
              customer_id, is_visible_to_customer, notification_sent,
              file_size, mime_type, original_filename, created_at)
           VALUES ($1,$2,'model_contract',$3,$4,$5,'admin',$6,true,false,$7,'application/pdf',$3,NOW())
           ON CONFLICT DO NOTHING`,
          [savedDocId, ag.booking_id, pdfFilename, savedFileUrl, savedFileUrl, customerId, pdfBuffer.length]
        );
        await sendDocumentToCustomer({
          docId: savedDocId, bookingId: ag.booking_id, bookingNumber: ag.booking_number,
          customerId, customerName: ag.customer_name || "Valued Customer",
          customerMobile: ag.customer_mobile || "", customerEmail: ag.user_email || "",
          documentType: "model_contract", fileName: pdfFilename, fileUrl: savedFileUrl, mimeType: "application/pdf",
          packageName: ag.package_name || "Hajj Package",
        }).catch(() => {});
      } catch (e: any) {
        console.error("[CustomerPortal] agreement sign PDF error:", e?.message);
      }
    })();

    res.json({ ok: true, agreementNumber: ag.agreement_number, message: "Agreement signed successfully." });
  } catch (e: any) {
    console.error("[CustomerPortal] agreement sign error:", e?.message);
    res.status(500).json({ error: "Failed to sign agreement" });
  }
});

export default router;
