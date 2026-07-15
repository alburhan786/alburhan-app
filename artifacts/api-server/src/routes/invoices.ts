// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { generateInvoicePdfBuffer } from "../lib/paymentDocs.js";
import { sendInvoiceEmail, sendPaymentReceipt } from "../services/emailService.js";

const router = Router();

function round2(n: number) { return Math.round(n * 100) / 100; }

function deriveInvoiceStatus(total: number, paid: number): string {
  if (paid <= 0) return "pending";
  if (paid >= total - 0.01) return "paid";
  return "partial";
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
  const invoiceStatus = deriveInvoiceStatus(total, paid);

  // due_date = 30 days from today (used by payment reminder cron)
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (existing.rows[0]) {
    const inv = existing.rows[0];
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
// No session required. The booking number acts as the access token (unique, shown on booking docs).
// This is the canonical download URL for customers and admins — avoids all session/mobile-match issues.
router.get("/by-number/:bookingNumber/pdf", async (req, res) => {
  try {
    const { bookingNumber } = req.params;
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number as inv_num, i.pdf_path
       FROM bookings b
       LEFT JOIN invoices i ON i.booking_id = b.id
       WHERE b.booking_number = $1 LIMIT 1`,
      [bookingNumber]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ message: "Booking not found" });

    // If a pre-generated PDF is stored in object storage, serve it directly
    if (b.pdf_path) {
      // Redirect to stored URL for fast delivery
      if (b.pdf_path.startsWith("http")) {
        return void res.redirect(302, b.pdf_path);
      }
      // Internal path — proxy it
      const fs = await import("fs");
      const path = await import("path");
      const fullPath = path.resolve(process.cwd(), b.pdf_path.replace(/^\//, ""));
      if (fs.existsSync(fullPath)) {
        const invoiceNumber = b.inv_num || b.invoice_number;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber || bookingNumber}.pdf"`);
        return void res.sendFile(fullPath);
      }
    }

    // Generate PDF on-the-fly
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
  } catch (err) {
    console.error("[invoices] GET /by-number/:bookingNumber/pdf:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

router.get("/:bookingId/pdf", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number as inv_num
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

export default router;
