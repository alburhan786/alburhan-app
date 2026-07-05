import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

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

async function upsertInvoiceForBooking(bookingId: string): Promise<Record<string, unknown> | null> {
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

  if (existing.rows[0]) {
    const inv = existing.rows[0];
    await pool.query(
      `UPDATE invoices SET subtotal=$1,discount=$2,gst_amount=$3,tcs_amount=$4,
       total=$5,paid=$6,balance=$7,invoice_status=$8,updated_at=NOW()
       WHERE id=$9`,
      [subtotal, discount, gstAmount, tcsAmount, total, paid, balance, invoiceStatus, inv.id]
    );
    return { ...inv, subtotal, discount, gst_amount: gstAmount, tcs_amount: tcsAmount, total, paid, balance, invoice_status: invoiceStatus };
  }

  const invoiceNumber = await generateInvoiceNumber(year);
  const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await pool.query(
    `INSERT INTO invoices
     (id, invoice_number, booking_id, customer_id, invoice_date,
      subtotal, discount, gst_amount, tcs_amount, total, paid, balance, invoice_status)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, invoiceNumber, bookingId, b.customer_id || null,
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

router.post("/:bookingId/regenerate", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const inv = await upsertInvoiceForBooking(bookingId);
    if (!inv) return res.status(404).json({ message: "Booking not found" });
    res.json({ invoice: inv });
  } catch (err) {
    console.error("[invoices] POST /:id/regenerate:", err);
    res.status(500).json({ message: "Failed to regenerate invoice" });
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
    if (!result.rows[0]) return res.status(404).json({ message: "Invoice not found" });
    res.json({ invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to get invoice" });
  }
});

export default router;
