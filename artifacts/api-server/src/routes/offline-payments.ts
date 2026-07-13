// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import multer from "multer";
import { randomUUID } from "crypto";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import { trackNotification } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import {
  sendOfflinePaymentApprovedNotification,
  sendOfflinePaymentRejectedNotification,
  sendOfflinePaymentSubmittedNotification,
} from "../lib/notifications.js";

const router = Router();

// ── File upload config — 25 MB, PDF + JPG + JPEG + PNG + WEBP ─────────────

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/jpg", "image/png", "image/webp",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF, JPG, JPEG, PNG, WEBP files allowed (max 25 MB)"));
  },
});

// ── Payment reference generator: PAY-2026-000145 ──────────────────────────

async function generatePaymentReference(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  const seq = await pool.query(
    `SELECT COUNT(*) AS n FROM offline_payments WHERE payment_reference LIKE $1`,
    [`${prefix}%`]
  );
  const n = parseInt(seq.rows[0]?.n || "0") + 1;
  return `${prefix}${String(n).padStart(6, "0")}`;
}

// ── Bank Settings (public read, admin write) ───────────────────────────────

router.get("/bank-settings", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM bank_settings WHERE id='default'`);
    res.json(rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/bank-settings", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bankName, branch, accountName, accountNumber, ifscCode, swiftCode, upiId, qrCodeUrl } = req.body;
    await pool.query(`
      UPDATE bank_settings SET
        bank_name=$1, branch=$2, account_name=$3, account_number=$4,
        ifsc_code=$5, swift_code=$6, upi_id=$7, qr_code_url=$8,
        updated_at=NOW()
      WHERE id='default'
    `, [bankName, branch, accountName, accountNumber, ifscCode, swiftCode, upiId, qrCodeUrl]);
    const { rows } = await pool.query(`SELECT * FROM bank_settings WHERE id='default'`);
    auditLog({ req, action: "updated", entityTable: "bank_settings", entityId: "default", newValue: req.body }).catch(() => {});
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Submit Payment (customer) ──────────────────────────────────────────────

router.post(
  "/",
  requireAuth as any,
  proofUpload.single("proof"),
  async (req: AuthenticatedRequest & { file?: Express.Multer.File }, res) => {
    try {
      const userId = req.user?.id;
      const {
        bookingId, customerName, mobile, email, amountPaid,
        paymentDate, paymentTime, bankName, branchName,
        paymentMethod, utrNumber, senderAccountLast4, remarks,
      } = req.body;

      if (!bookingId || !utrNumber || !amountPaid) {
        return void res.status(400).json({ message: "bookingId, utrNumber and amountPaid are required" });
      }

      // Validate file size/type again server-side
      if (req.file) {
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return void res.status(400).json({ message: "Invalid file type. Only PDF, JPG, JPEG, PNG, WEBP allowed." });
        }
        if (req.file.size > 25 * 1024 * 1024) {
          return void res.status(400).json({ message: "File too large. Maximum size is 25 MB." });
        }
      }

      // Check UTR uniqueness
      const existing = await pool.query(`SELECT id FROM offline_payments WHERE utr_number=$1`, [utrNumber]);
      if (existing.rows.length > 0) {
        return void res.status(409).json({ message: "This UTR number has already been submitted. Please check and try again." });
      }

      // Verify booking belongs to customer
      const bkRes = await pool.query(
        `SELECT id, booking_number, customer_id, customer_name, customer_mobile, customer_email, status FROM bookings WHERE id=$1 LIMIT 1`,
        [bookingId]
      );
      if (!bkRes.rows.length) return void res.status(404).json({ message: "Booking not found" });
      const bk = bkRes.rows[0];

      // Upload proof if provided
      let proofUrl: string | null = null;
      if (req.file) {
        proofUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "offline_payment_proofs");
      }

      // Generate payment reference
      const paymentReference = await generatePaymentReference();
      const id = randomUUID();

      await pool.query(`
        INSERT INTO offline_payments
          (id, booking_id, customer_id, customer_name, mobile, email,
           amount_paid, payment_date, payment_time, bank_name, branch_name,
           payment_method, utr_number, sender_account_last4, remarks, proof_url,
           payment_reference, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending')
      `, [
        id, bookingId, bk.customer_id || userId,
        customerName || bk.customer_name,
        mobile || bk.customer_mobile,
        email || bk.customer_email,
        amountPaid, paymentDate, paymentTime, bankName, branchName,
        paymentMethod, utrNumber, senderAccountLast4, remarks, proofUrl,
        paymentReference,
      ]);

      // Send submission notification
      sendOfflinePaymentSubmittedNotification({
        mobile: mobile || bk.customer_mobile,
        customerName: customerName || bk.customer_name,
        bookingId: bookingId,
        bookingNumber: bk.booking_number,
        amount: amountPaid,
        utrNumber,
      }).catch(() => {});

      trackNotification({ eventType: "payment_submitted", channel: "whatsapp", recipient: mobile || bk.customer_mobile, bookingId, status: "sent" }).catch(() => {});
      triggerWorkflow("offline_payment_submitted", { bookingId, paymentId: id, amount: amountPaid, utrNumber }).catch(() => {});
      auditLog({ req, action: "created", entityTable: "offline_payments", entityId: id, newValue: { bookingId, utrNumber, amountPaid, paymentReference } }).catch(() => {});

      res.json({
        id,
        status: "pending",
        paymentReference,
        message: "Your payment details have been submitted successfully. Our Accounts Team will verify your payment within 24 hours.",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }
);

// ── List (admin: all; customer: own) ──────────────────────────────────────

router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
    const userId = req.user?.id;
    const statusFilter = req.query.status as string || "";
    let query: string;
    let params: unknown[];

    if (isAdmin) {
      if (statusFilter && statusFilter !== "all") {
        query = `
          SELECT op.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount
          FROM offline_payments op
          LEFT JOIN bookings b ON b.id = op.booking_id
          WHERE op.status=$1
          ORDER BY op.created_at DESC
        `;
        params = [statusFilter];
      } else {
        query = `
          SELECT op.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount
          FROM offline_payments op
          LEFT JOIN bookings b ON b.id = op.booking_id
          ORDER BY op.created_at DESC
        `;
        params = [];
      }
    } else {
      query = `
        SELECT op.*, b.booking_number, b.package_name, b.final_amount
        FROM offline_payments op
        LEFT JOIN bookings b ON b.id = op.booking_id
        WHERE op.customer_id=$1
        ORDER BY op.created_at DESC
      `;
      params = [userId];
    }

    const { rows } = await pool.query(query, params);
    res.json({ payments: rows });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get single ────────────────────────────────────────────────────────────

router.get("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT op.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount
       FROM offline_payments op
       LEFT JOIN bookings b ON b.id = op.booking_id
       WHERE op.id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return void res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get payments for a booking (customer) ─────────────────────────────────

router.get("/booking/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM offline_payments WHERE booking_id=$1 ORDER BY created_at DESC`,
      [req.params.bookingId]
    );
    res.json({ payments: rows });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get all payments for current customer (across all bookings) ────────────

router.get("/customer/all", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const { rows } = await pool.query(
      `SELECT op.*, b.booking_number, b.package_name
       FROM offline_payments op
       LEFT JOIN bookings b ON b.id = op.booking_id
       WHERE op.customer_id=$1
       ORDER BY op.created_at DESC`,
      [userId]
    );
    res.json({ payments: rows });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Stats (admin) ──────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pending') AS pending,
        COUNT(*) FILTER (WHERE status='approved') AS approved,
        COUNT(*) FILTER (WHERE status='rejected') AS rejected,
        COUNT(*) FILTER (WHERE status='correction_requested') AS need_clarification,
        COALESCE(SUM(amount_paid) FILTER (WHERE status='approved'), 0) AS total_approved_amount,
        COUNT(*) AS total
      FROM offline_payments
    `);
    res.json(r.rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Approve ────────────────────────────────────────────────────────────────

router.post("/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { adminRemarks } = req.body;
    const { rows } = await pool.query(
      `SELECT op.*, b.booking_number, b.customer_mobile, b.customer_email, b.final_amount, b.paid_amount
       FROM offline_payments op
       LEFT JOIN bookings b ON b.id = op.booking_id
       WHERE op.id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return void res.status(404).json({ message: "Payment not found" });
    const op = rows[0];

    const adminName = req.user?.name || req.user?.id || "Admin";

    // Update offline_payment status
    await pool.query(
      `UPDATE offline_payments SET status='approved', verified_at=NOW(), verified_by=$1, verified_by_name=$2, admin_remarks=$3, updated_at=NOW() WHERE id=$4`,
      [req.user?.id, adminName, adminRemarks || null, req.params.id]
    );

    // Update booking paid_amount and status
    const currentPaid = await pool.query(
      `SELECT paid_amount, final_amount, online_paid_amount FROM bookings WHERE id=$1`, [op.booking_id]
    );
    const bk = currentPaid.rows[0] || {};
    const newPaid = Number(bk.paid_amount || 0) + Number(op.amount_paid || 0);
    const finalAmt = Number(bk.final_amount || 0);
    const balance = Math.max(0, finalAmt - newPaid);
    const newStatus = finalAmt > 0 && newPaid >= finalAmt ? "confirmed" : "partially_paid";

    await pool.query(
      `UPDATE bookings SET paid_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
      [String(newPaid), newStatus, op.booking_id]
    );

    // Upsert invoice
    await upsertInvoiceForBooking(op.booking_id);

    // Get invoice number
    const invRes = await pool.query(`SELECT invoice_number FROM bookings WHERE id=$1`, [op.booking_id]);
    const invoiceNumber = invRes.rows[0]?.invoice_number || op.payment_reference;

    // Send full notification suite: WhatsApp + SMS + Email + dashboard
    sendOfflinePaymentApprovedNotification({
      mobile: op.mobile || op.customer_mobile,
      email: op.email || op.customer_email,
      customerName: op.customer_name,
      bookingId: op.booking_id,
      bookingNumber: op.booking_number,
      amount: op.amount_paid,
      utrNumber: op.utr_number,
      balance,
      receiptNo: invoiceNumber,
    }).catch(() => {});

    trackNotification({ eventType: "payment_verified", channel: "whatsapp", recipient: op.mobile, bookingId: op.booking_id, status: "sent" }).catch(() => {});
    triggerWorkflow("offline_payment_approved", { bookingId: op.booking_id, paymentId: op.id, utrNumber: op.utr_number }).catch(() => {});
    auditLog({ req, action: "approved", entityTable: "offline_payments", entityId: op.id, newValue: { approvedBy: adminName, bookingId: op.booking_id, balance } }).catch(() => {});

    res.json({ message: "Payment approved. Customer notified via all channels.", newBookingStatus: newStatus, newPaid, balance });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Reject ────────────────────────────────────────────────────────────────

router.post("/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { reason, adminRemarks } = req.body;
    if (!reason) return void res.status(400).json({ message: "Rejection reason is required" });

    const { rows } = await pool.query(
      `SELECT op.*, b.booking_number, b.customer_mobile, b.customer_email
       FROM offline_payments op
       LEFT JOIN bookings b ON b.id = op.booking_id
       WHERE op.id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return void res.status(404).json({ message: "Payment not found" });
    const op = rows[0];

    await pool.query(
      `UPDATE offline_payments SET status='rejected', rejection_reason=$1, admin_remarks=$2, verified_at=NOW(), verified_by=$3, verified_by_name=$4, updated_at=NOW() WHERE id=$5`,
      [reason, adminRemarks || reason, req.user?.id, req.user?.name || "Admin", req.params.id]
    );

    sendOfflinePaymentRejectedNotification({
      mobile: op.mobile || op.customer_mobile,
      email: op.email || op.customer_email,
      customerName: op.customer_name,
      bookingId: op.booking_id,
      bookingNumber: op.booking_number,
      reason,
    }).catch(() => {});

    auditLog({ req, action: "rejected", entityTable: "offline_payments", entityId: op.id, newValue: { reason } }).catch(() => {});

    res.json({ message: "Payment rejected. Customer notified." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Request More Information / Need Clarification ─────────────────────────

router.post("/:id/request-correction", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { message: correctionMsg, adminRemarks } = req.body;
    if (!correctionMsg) return void res.status(400).json({ message: "Message is required" });

    const { rows } = await pool.query(
      `SELECT op.*, b.booking_number, b.customer_mobile
       FROM offline_payments op
       LEFT JOIN bookings b ON b.id = op.booking_id
       WHERE op.id=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return void res.status(404).json({ message: "Payment not found" });
    const op = rows[0];

    await pool.query(
      `UPDATE offline_payments SET status='correction_requested', rejection_reason=$1, admin_remarks=$2, updated_at=NOW() WHERE id=$3`,
      [correctionMsg, adminRemarks || correctionMsg, req.params.id]
    );

    sendOfflinePaymentRejectedNotification({
      mobile: op.mobile || op.customer_mobile,
      email: op.email,
      customerName: op.customer_name,
      bookingId: op.booking_id,
      bookingNumber: op.booking_number,
      reason: correctionMsg,
    }).catch(() => {});

    auditLog({ req, action: "correction_requested", entityTable: "offline_payments", entityId: op.id, newValue: { message: correctionMsg } }).catch(() => {});

    res.json({ message: "Clarification requested. Customer notified." });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Proof download proxy ───────────────────────────────────────────────────

router.get("/:id/proof", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`SELECT proof_url, customer_name, utr_number FROM offline_payments WHERE id=$1`, [req.params.id]);
    if (!rows.length || !rows[0].proof_url) return void res.status(404).json({ message: "No proof uploaded" });
    const proofUrl = rows[0].proof_url;
    if (proofUrl.startsWith("http")) return void res.redirect(proofUrl);
    res.redirect(proofUrl);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Internal: upsert invoice for booking ──────────────────────────────────

async function upsertInvoiceForBooking(bookingId: string) {
  try {
    const bkRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
    const b = bkRes.rows[0];
    if (!b) return;

    const subtotal = Number(b.total_amount) || Number(b.final_amount) || 0;
    const gstAmt = Number(b.gst_amount) || 0;
    const total = Number(b.final_amount) || subtotal + gstAmt;
    const paid = Number(b.paid_amount) || 0;
    const balance = Math.max(0, total - paid);
    const invStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";

    const existing = await pool.query(`SELECT id FROM invoices WHERE booking_id=$1 LIMIT 1`, [bookingId]);
    if (existing.rows.length) {
      await pool.query(
        `UPDATE invoices SET subtotal=$1, gst_amount=$2, total=$3, paid=$4, balance=$5, invoice_status=$6, updated_at=NOW() WHERE booking_id=$7`,
        [subtotal, gstAmt, total, paid, balance, invStatus, bookingId]
      );
    } else {
      const year = new Date().getFullYear();
      const seqRes = await pool.query(
        `SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number,'/',3) AS BIGINT)),0)+1 AS n FROM invoices WHERE invoice_number LIKE $1`,
        [`ABT/${year}/%`]
      );
      const seq = String(seqRes.rows[0]?.n || 1).padStart(4, "0");
      const invoiceNumber = `ABT/${year}/${seq}`;
      const invId = randomUUID();
      await pool.query(
        `INSERT INTO invoices (id,invoice_number,booking_id,customer_id,invoice_date,subtotal,gst_amount,total,paid,balance,invoice_status)
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10)`,
        [invId, invoiceNumber, bookingId, b.customer_id, subtotal, gstAmt, total, paid, balance, invStatus]
      );
      await pool.query(`UPDATE bookings SET invoice_number=$1 WHERE id=$2`, [invoiceNumber, bookingId]);
    }
  } catch (err) {
    console.error("[offline-payments] upsertInvoice failed:", err);
  }
}

export default router;
