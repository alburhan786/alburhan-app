// @ts-nocheck
import { Router } from "express";
import { getTenantId } from "../lib/tenantContext.js";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { generateInvoicePdfBuffer } from "../lib/paymentDocs.js";
import { sendInvoiceEmail, sendPaymentReceipt } from "../services/emailService.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";

// Fire-and-forget: upload PDF to GCS/disk and save pdf_path in invoices table.
// Non-blocking — the HTTP response is sent first, this runs in the background.
async function saveInvoicePdfToStorage(bookingId: string, invoiceNumber: string, buf: Buffer) {
  try {
    const safeNum = (invoiceNumber || bookingId).replace(/[^a-zA-Z0-9\-_]/g, "_");
    const url = await uploadToGCS(buf, `Invoice-${safeNum}.pdf`, "application/pdf", "invoices");
    await pool.query(`UPDATE invoices SET pdf_path=$1, updated_at=NOW() WHERE booking_id=$2`, [url, bookingId]);
    console.log(`[invoices] pdf saved → ${url.slice(0, 80)}`);
  } catch (err) {
    console.warn("[invoices] pdf_path save failed (non-fatal):", err?.message || err);
  }
}

const router = Router();

function round2(n: number) { return Math.round(n * 100) / 100; }

function deriveInvoiceStatus(total: number, paid: number, dueDate?: string | Date | null): string {
  const isOverdue = dueDate ? new Date(dueDate) < new Date() : false;
  if (paid >= total - 0.01) return "paid";
  if (paid <= 0) return isOverdue ? "overdue" : "pending";
  return isOverdue ? "overdue" : "partial";
}

async function generateInvoiceNumber(year: number): Promise<string> {
  const prefix = `ABT/${year}/`;
  const res = await pool.query(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '/', 3) AS BIGINT)), 0) + 1 AS next_seq
     FROM invoices WHERE invoice_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = Number(res.rows[0]?.next_seq ?? 1);
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export async function upsertInvoiceForBooking(bookingId: string): Promise<Record<string, unknown> | null> {
  const bRes = await pool.query(
    `SELECT * FROM bookings WHERE id = $1 LIMIT 1`,
    [bookingId]
  );
  const b = bRes.rows[0];
  if (!b) return null;

  const year = new Date().getFullYear();

  const existing = await pool.query(
    `SELECT * FROM invoices WHERE booking_id = $1 LIMIT 1`,
    [bookingId]
  );

  const subtotal    = round2(Number(b.total_amount)      || 0);
  const discount    = round2(Number(b.discount_amount)   || 0);
  const gstAmount   = round2(Number(b.gst_amount)        || 0);
  const tcsAmount   = round2(Number(b.tcs_amount)        || 0);
  const total       = round2(Number(b.final_amount)      || subtotal + gstAmount);
  const paid        = round2(
    Math.max(Number(b.paid_amount) || 0, Number(b.advance_amount) || 0)
  );
  const balance     = round2(total - paid);

  // due_date = 30 days from today for new invoices (used by payment reminder cron)
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (existing.rows[0]) {
    const inv = existing.rows[0];
    // Pass the stored due_date so paid-past-due invoices become "overdue"
    const invoiceStatus = deriveInvoiceStatus(total, paid, inv.due_date);
    await pool.query(
      `UPDATE invoices
       SET subtotal=$1, discount=$2, gst_amount=$3, tcs_amount=$4,
           total=$5, paid=$6, balance=$7, invoice_status=$8,
           due_date=COALESCE(due_date, $9), updated_at=NOW()
       WHERE id=$10`,
      [subtotal, discount, gstAmount, tcsAmount, total, paid, balance, invoiceStatus, dueDate, inv.id]
    );
    return { ...inv, subtotal, discount, gst_amount: gstAmount, tcs_amount: tcsAmount,
             total, paid, balance, invoice_status: invoiceStatus, due_date: inv.due_date || dueDate };
  }

  // New invoice — due_date is 30 days from now so cannot be overdue yet
  const invoiceStatus = deriveInvoiceStatus(total, paid);
  const invoiceNumber = await generateInvoiceNumber(year);
  const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await pool.query(
    `INSERT INTO invoices
     (id, invoice_number, booking_id, customer_id, invoice_date, due_date,
      subtotal, discount, gst_amount, tcs_amount, total, paid, balance, invoice_status)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, invoiceNumber, bookingId, b.customer_id || null, dueDate,
     subtotal, discount, gstAmount, tcsAmount, total, paid, balance, invoiceStatus]
  );

  await pool.query(
    `UPDATE bookings SET invoice_number=$1 WHERE id=$2`,
    [invoiceNumber, bookingId]
  );

  return { id, invoice_number: invoiceNumber, booking_id: bookingId,
    customer_id: b.customer_id, subtotal, discount, gst_amount: gstAmount,
    tcs_amount: tcsAmount, total, paid, balance, invoice_status: invoiceStatus };
}

router.get("/", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, b.booking_number, b.customer_name, b.customer_mobile,
              b.package_name, b.status as booking_status, b.number_of_pilgrims,
              b.is_offline, b.created_at as booking_date
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       WHERE (b.is_deleted IS NULL OR b.is_deleted = false)
       ORDER BY i.created_at DESC`
    );
    res.json({ invoices: result.rows });
  } catch (err) {
    console.error("[invoices] GET /:", err);
    res.status(500).json({ message: "Failed to list invoices" });
  }
});

router.post("/generate-all", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const bRes = await pool.query(
      `SELECT b.id FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE (b.is_deleted IS NULL OR b.is_deleted = false)
         AND i.id IS NULL
       ORDER BY b.created_at ASC`
    );
    const bookingIds: string[] = bRes.rows.map((r: any) => r.id);
    let generated = 0;
    for (const id of bookingIds) {
      try {
        await upsertInvoiceForBooking(id);
        generated++;
      } catch (e) {
        console.error("[invoices] generate-all skip:", id, e);
      }
    }
    res.json({ message: `Generated ${generated} invoice(s)`, count: generated });
  } catch (err) {
    console.error("[invoices] POST /generate-all:", err);
    res.status(500).json({ message: "Failed to generate invoices" });
  }
});

// ── Public PDF download by booking number — GET /api/invoices/by-number/:bookingNumber/pdf ──
// The booking number acts as the access token — but ONLY if payment has been recorded.
// Pending/unpaid invoices are never served to protect financial data.
router.get("/by-number/:bookingNumber/pdf", async (req, res) => {
  try {
    const { bookingNumber } = req.params;
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number as inv_num, i.pdf_path, i.paid as inv_paid, i.invoice_status
       FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.booking_number = $1 LIMIT 1`,
      [bookingNumber]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ message: "Booking not found" });

    // Security: never serve invoice PDF before payment is received
    const paidAmount = Number(b.paid_amount || b.inv_paid || 0);
    if (paidAmount <= 0) {
      return void res.status(403).json({
        message: "Invoice not available. Please complete your payment to access the invoice.",
        code: "PAYMENT_REQUIRED",
      });
    }

    // Always generate fresh PDF from current DB state — never serve stale cached
    // GCS redirect, which shows old "PENDING" status before payment was recorded.
    const invoiceNumber = b.inv_num || b.invoice_number;
    const buf = await generateInvoicePdfBuffer({
      bookingNumber: b.booking_number,
      customerName: b.customer_name,
      customerMobile: b.customer_mobile,
      customerEmail: b.customer_email,
      packageName: b.package_name,
      numberOfPilgrims: b.number_of_pilgrims,
      totalAmount: Number(b.total_amount) || 0,
      finalAmount: Number(b.final_amount) || 0,
      paidAmount: Number(b.paid_amount) || 0,
      balanceAmount: Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0)),
      invoiceNumber,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber || bookingNumber}.pdf"`);
    res.send(buf);
    // Save to GCS/disk in the background (non-blocking)
    if (b.id) saveInvoicePdfToStorage(b.id, invoiceNumber, buf).catch(() => {});
  } catch (err) {
    console.error("[invoices] GET /by-number/:bookingNumber/pdf:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

router.get("/:bookingId/pdf", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number as inv_num, i.paid as inv_paid
       FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ message: "Booking not found" });
    if (req.user?.role !== "admin" && b.customer_mobile !== req.user?.mobile) {
      return void res.status(403).json({ message: "Forbidden" });
    }
    // Non-admin customers cannot download pending invoices (no payment recorded)
    if (req.user?.role !== "admin") {
      const paidAmount = Number(b.paid_amount || b.inv_paid || 0);
      if (paidAmount <= 0) {
        return void res.status(403).json({
          message: "Invoice not available until payment is received.",
          code: "PAYMENT_REQUIRED",
        });
      }
    }
    const invoiceNumber = b.inv_num || b.invoice_number;
    const buf = await generateInvoicePdfBuffer({
      bookingNumber: b.booking_number,
      customerName: b.customer_name,
      customerMobile: b.customer_mobile,
      customerEmail: b.customer_email,
      packageName: b.package_name,
      numberOfPilgrims: b.number_of_pilgrims,
      totalAmount: Number(b.total_amount) || 0,
      finalAmount: Number(b.final_amount) || 0,
      paidAmount: Number(b.paid_amount) || 0,
      balanceAmount: Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0)),
      invoiceNumber,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber || b.booking_number}.pdf"`);
    res.send(buf);
    // Save to GCS/disk in the background (non-blocking)
    saveInvoicePdfToStorage(bookingId, invoiceNumber, buf).catch(() => {});
  } catch (err) {
    console.error("[invoices] GET /:bookingId/pdf:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

router.post("/:bookingId/regenerate", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const inv = await upsertInvoiceForBooking(bookingId);
    if (!inv) return void res.status(404).json({ message: "Booking not found" });
    res.json({ invoice: inv });
  } catch (err) {
    console.error("[invoices] POST /:id/regenerate:", err);
    res.status(500).json({ message: "Failed to regenerate invoice" });
  }
});

// ── Send invoice email to customer — POST /api/invoices/:bookingId/send-email ─
// Admin-triggered: generates invoice PDF and emails it to the customer using
// the MSG91 SMTP branded template. Safe to call multiple times (idempotent).
router.post("/:bookingId/send-email", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;

    // Fetch booking + existing invoice in one query
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number as inv_num, i.id as inv_id,
              i.subtotal, i.discount, i.gst_amount, i.tcs_amount,
              i.total, i.paid, i.balance, i.invoice_status, i.due_date
       FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ message: "Booking not found" });

    const customerEmail = b.customer_email;
    if (!customerEmail) {
      return void res.status(422).json({ message: "Customer has no email address on file" });
    }

    // Ensure invoice exists (create if missing)
    const inv = await upsertInvoiceForBooking(bookingId);
    const invoiceNumber = (inv as any)?.invoice_number || b.inv_num || b.invoice_number || `ABT/${new Date().getFullYear()}/000000`;

    // Generate PDF attachment
    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await generateInvoicePdfBuffer({
        bookingNumber:    b.booking_number,
        customerName:     b.customer_name,
        customerMobile:   b.customer_mobile,
        customerEmail:    customerEmail,
        packageName:      b.package_name,
        numberOfPilgrims: b.number_of_pilgrims,
        totalAmount:      Number(b.total_amount) || 0,
        finalAmount:      Number(b.final_amount) || 0,
        paidAmount:       Number(b.paid_amount)  || 0,
        balanceAmount:    Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0)),
        invoiceNumber,
      });
    } catch (pdfErr) {
      console.warn("[invoices] PDF gen failed, sending without attachment:", pdfErr);
    }

    // Send branded invoice email via MSG91 SMTP
    const result = await sendInvoiceEmail(
      customerEmail,
      {
        customerName:  b.customer_name,
        bookingNumber: b.booking_number,
        invoiceNumber,
        packageName:   b.package_name,
        invoiceDate:   b.created_at,
        dueDate:       (inv as any)?.due_date || b.due_date,
        subtotal:      Number((inv as any)?.subtotal  || b.total_amount  || 0),
        discount:      Number((inv as any)?.discount  || b.discount_amount || 0),
        gstAmount:     Number((inv as any)?.gst_amount || b.gst_amount   || 0),
        totalAmount:   Number((inv as any)?.total     || b.final_amount  || 0),
        paidAmount:    Number((inv as any)?.paid      || b.paid_amount   || 0),
        balanceDue:    Number((inv as any)?.balance   || Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0))),
        invoiceStatus: (inv as any)?.invoice_status || "pending",
      },
      pdfBuffer
    );

    if (!result.ok) {
      console.error(`[invoices] send-email failed to ${customerEmail}:`, result.error);
      return void res.status(500).json({ message: "Failed to send invoice email", error: result.error });
    }

    console.log(`[invoices] Invoice email sent to ${customerEmail} for booking ${b.booking_number}`);
    res.json({ ok: true, message: `Invoice email sent to ${customerEmail}`, messageId: result.messageId });
  } catch (err: any) {
    console.error("[invoices] POST /:bookingId/send-email:", err);
    res.status(500).json({ message: "Failed to send invoice email", error: err?.message });
  }
});

router.get("/by-booking/:bookingId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, b.booking_number, b.customer_name, b.customer_mobile, b.package_name
       FROM invoices i JOIN bookings b ON b.id = i.booking_id
       WHERE i.booking_id = $1 LIMIT 1`,
      [req.params.bookingId]
    );
    if (!result.rows[0]) return void res.status(404).json({ message: "Invoice not found" });
    res.json({ invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to get invoice" });
  }
});

// ── Send invoice WhatsApp — POST /api/invoices/:bookingId/send-whatsapp ────────
// Admin-triggered: sends the invoice_ready template to the customer's WhatsApp.
router.post("/:bookingId/send-whatsapp", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number AS inv_num, i.total, i.paid, i.balance
       FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ message: "Booking not found" });

    const inv = await upsertInvoiceForBooking(bookingId);
    const invoiceUrl = `https://alburhantravels.com/invoice/${b.booking_number}`;

    await triggerWorkflow("invoice_generated", {
      customerName: b.customer_name,
      customerMobile: b.mobile_india || b.customer_mobile,
      bookingNumber: b.booking_number,
      packageName: b.package_name,
      finalAmount: Number(b.final_amount) || 0,
      invoiceNumber: (inv as any)?.invoice_number || b.inv_num,
      invoiceUrl,
    }, b.id, b.customer_id);

    res.json({ ok: true, message: "Invoice WhatsApp sent" });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
