// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { postExpenseJournal } from "../lib/journalHelper.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// ── Migrations ───────────────────────────────────────────────────────────────
export async function ensurePurchaseTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      po_number     TEXT UNIQUE,
      vendor_id     TEXT,
      vendor_name   TEXT NOT NULL,
      category      TEXT DEFAULT 'others',
      status        TEXT NOT NULL DEFAULT 'draft',
      order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
      expected_date DATE,
      subtotal      NUMERIC(12,2) DEFAULT 0,
      tax_amount    NUMERIC(12,2) DEFAULT 0,
      total_amount  NUMERIC(12,2) DEFAULT 0,
      notes         TEXT,
      approved_by   TEXT,
      approved_at   TIMESTAMPTZ,
      received_at   TIMESTAMPTZ,
      created_by    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      po_id       TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity    NUMERIC(10,3) DEFAULT 1,
      unit_price  NUMERIC(12,2) DEFAULT 0,
      total_price NUMERIC(12,2) DEFAULT 0,
      received_qty NUMERIC(10,3) DEFAULT 0,
      account_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id);

    CREATE TABLE IF NOT EXISTS vendor_bills (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      bill_number   TEXT UNIQUE,
      vendor_id     TEXT,
      vendor_name   TEXT NOT NULL,
      po_id         TEXT,
      invoice_number TEXT,
      bill_date     DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date      DATE,
      subtotal      NUMERIC(12,2) DEFAULT 0,
      tax_amount    NUMERIC(12,2) DEFAULT 0,
      total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
      paid_amount   NUMERIC(12,2) DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      notes         TEXT,
      approved_by   TEXT,
      approved_at   TIMESTAMPTZ,
      created_by    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vb_vendor ON vendor_bills(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vb_status ON vendor_bills(status);

    CREATE TABLE IF NOT EXISTS vendor_bill_payments (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      bill_id     TEXT NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
      amount      NUMERIC(12,2) NOT NULL,
      payment_mode TEXT DEFAULT 'bank_transfer',
      payment_date DATE DEFAULT CURRENT_DATE,
      reference   TEXT,
      notes       TEXT,
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

function nextPoNum(): string {
  return `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}
function nextBillNum(): string {
  return `BILL-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

// ══ PURCHASE ORDERS ═══════════════════════════════════════════════════════════

router.get("/orders", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, vendor_id, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (status)    { params.push(status);    filters.push(`po.status=$${params.length}`); }
    if (vendor_id) { params.push(vendor_id); filters.push(`po.vendor_id=$${params.length}`); }
    if (from)      { params.push(from);      filters.push(`po.order_date >= $${params.length}`); }
    if (to)        { params.push(to);        filters.push(`po.order_date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT po.*,
              COUNT(poi.id)::int AS item_count
       FROM purchase_orders po
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
       ${where}
       GROUP BY po.id ORDER BY po.created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed to fetch purchase orders" }); }
});

router.get("/orders/:id", requireAdmin as any, async (req, res) => {
  try {
    const po = await q1(`SELECT * FROM purchase_orders WHERE id=$1`, [req.params.id]);
    if (!po) return void res.status(404).json({ error: "PO not found" });
    const items = await q(`SELECT * FROM purchase_order_items WHERE po_id=$1 ORDER BY rowid`, [req.params.id]);
    res.json({ ...po, items });
  } catch (err) { res.status(500).json({ error: "Failed to fetch PO" }); }
});

router.post("/orders", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { vendor_id, vendor_name, category, order_date, expected_date, notes, items = [] } = req.body;
    if (!vendor_name) return void res.status(400).json({ error: "vendor_name is required" });

    const subtotal = items.reduce((s: number, i: any) => s + Number(i.total_price ?? 0), 0);
    const taxAmount = Number(req.body.tax_amount ?? 0);
    const totalAmount = subtotal + taxAmount;

    await pool.query("BEGIN");
    try {
      const po = await q1(
        `INSERT INTO purchase_orders (po_number, vendor_id, vendor_name, category, order_date, expected_date, subtotal, tax_amount, total_amount, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [nextPoNum(), vendor_id || null, vendor_name, category || "others", order_date || new Date().toISOString().split("T")[0], expected_date || null, subtotal, taxAmount, totalAmount, notes || null, req.user?.name ?? "admin"]
      );
      for (const item of items) {
        await pool.query(
          `INSERT INTO purchase_order_items (po_id, description, quantity, unit_price, total_price, account_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [po.id, item.description, item.quantity ?? 1, item.unit_price ?? 0, item.total_price ?? 0, item.account_id || null]
        );
      }
      await pool.query("COMMIT");
      res.json(po);
    } catch (e) { await pool.query("ROLLBACK"); throw e; }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create PO" });
  }
});

router.put("/orders/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const po = await q1(`SELECT * FROM purchase_orders WHERE id=$1`, [id]);
    if (!po) return void res.status(404).json({ error: "PO not found" });
    if (po.status === "received" || po.status === "cancelled") {
      return void res.status(400).json({ error: "Cannot edit a received or cancelled PO" });
    }
    const { vendor_name, category, expected_date, notes, items, tax_amount } = req.body;
    const subtotal = Array.isArray(items) ? items.reduce((s: number, i: any) => s + Number(i.total_price ?? 0), 0) : Number(po.subtotal);
    const taxAmount = Number(tax_amount ?? po.tax_amount ?? 0);

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE purchase_orders SET vendor_name=$1, category=$2, expected_date=$3, notes=$4, subtotal=$5, tax_amount=$6, total_amount=$7, updated_at=NOW() WHERE id=$8`,
        [vendor_name ?? po.vendor_name, category ?? po.category, expected_date ?? po.expected_date, notes ?? po.notes, subtotal, taxAmount, subtotal + taxAmount, id]
      );
      if (Array.isArray(items)) {
        await pool.query(`DELETE FROM purchase_order_items WHERE po_id=$1`, [id]);
        for (const item of items) {
          await pool.query(
            `INSERT INTO purchase_order_items (po_id, description, quantity, unit_price, total_price, account_id)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, item.description, item.quantity ?? 1, item.unit_price ?? 0, item.total_price ?? 0, item.account_id || null]
          );
        }
      }
      await pool.query("COMMIT");
    } catch (e) { await pool.query("ROLLBACK"); throw e; }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to update PO" }); }
});

router.post("/orders/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const po = await q1(`SELECT status FROM purchase_orders WHERE id=$1`, [req.params.id]);
    if (!po) return void res.status(404).json({ error: "PO not found" });
    if (po.status !== "draft") return void res.status(400).json({ error: "Only draft POs can be approved" });
    await pool.query(
      `UPDATE purchase_orders SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user?.name ?? "admin", req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Approval failed" }); }
});

router.post("/orders/:id/receive", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `UPDATE purchase_orders SET status='received', received_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to mark received" }); }
});

router.post("/orders/:id/cancel", requireAdmin as any, async (_req, res) => {
  try {
    await pool.query(
      `UPDATE purchase_orders SET status='cancelled', updated_at=NOW() WHERE id=$1`, [_req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to cancel" }); }
});

// ══ VENDOR BILLS ═══════════════════════════════════════════════════════════════

router.get("/bills", requireAdmin as any, async (req, res) => {
  try {
    const { status, vendor_id, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (status)    { params.push(status);    filters.push(`vb.status=$${params.length}`); }
    if (vendor_id) { params.push(vendor_id); filters.push(`vb.vendor_id=$${params.length}`); }
    if (from)      { params.push(from);      filters.push(`vb.bill_date >= $${params.length}`); }
    if (to)        { params.push(to);        filters.push(`vb.bill_date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT vb.*, (vb.total_amount - vb.paid_amount)::numeric AS outstanding
       FROM vendor_bills vb ${where}
       ORDER BY vb.created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed to fetch bills" }); }
});

router.get("/bills/summary", requireAdmin as any, async (_req, res) => {
  try {
    const summary = await q1(`
      SELECT
        COALESCE(SUM(total_amount) FILTER (WHERE status='pending'),0)::numeric AS pending_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE status='approved'),0)::numeric AS approved_amount,
        COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status NOT IN ('cancelled','paid')),0)::numeric AS outstanding,
        COALESCE(SUM(paid_amount),0)::numeric AS total_paid,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled'))::int AS overdue_count,
        COUNT(*)::int AS total_bills
      FROM vendor_bills
    `);
    res.json(summary);
  } catch (err) { res.status(500).json({ error: "Failed to fetch bill summary" }); }
});

router.get("/bills/:id", requireAdmin as any, async (req, res) => {
  try {
    const bill = await q1(`SELECT * FROM vendor_bills WHERE id=$1`, [req.params.id]);
    if (!bill) return void res.status(404).json({ error: "Bill not found" });
    const payments = await q(`SELECT * FROM vendor_bill_payments WHERE bill_id=$1 ORDER BY created_at DESC`, [req.params.id]);
    res.json({ ...bill, payments });
  } catch (err) { res.status(500).json({ error: "Failed to fetch bill" }); }
});

router.post("/bills", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { vendor_id, vendor_name, po_id, invoice_number, bill_date, due_date, subtotal, tax_amount, total_amount, notes } = req.body;
    if (!vendor_name || !total_amount) return void res.status(400).json({ error: "vendor_name and total_amount required" });

    const bill = await q1(
      `INSERT INTO vendor_bills (bill_number, vendor_id, vendor_name, po_id, invoice_number, bill_date, due_date, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [nextBillNum(), vendor_id || null, vendor_name, po_id || null, invoice_number || null, bill_date || new Date().toISOString().split("T")[0], due_date || null, subtotal || 0, tax_amount || 0, total_amount, notes || null, req.user?.name ?? "admin"]
    );
    res.json(bill);
  } catch (err) { res.status(500).json({ error: "Failed to create bill" }); }
});

router.post("/bills/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const bill = await q1(`SELECT status FROM vendor_bills WHERE id=$1`, [req.params.id]);
    if (!bill) return void res.status(404).json({ error: "Bill not found" });
    if (bill.status !== "pending") return void res.status(400).json({ error: "Only pending bills can be approved" });
    await pool.query(
      `UPDATE vendor_bills SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user?.name ?? "admin", req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Approval failed" }); }
});

router.post("/bills/:id/pay", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_mode, payment_date, reference, notes } = req.body;
    if (!amount || Number(amount) <= 0) return void res.status(400).json({ error: "Invalid amount" });

    const bill = await q1(`SELECT * FROM vendor_bills WHERE id=$1`, [id]);
    if (!bill) return void res.status(404).json({ error: "Bill not found" });
    if (bill.status === "cancelled") return void res.status(400).json({ error: "Cannot pay a cancelled bill" });

    const newPaid = Number(bill.paid_amount) + Number(amount);
    const newStatus = newPaid >= Number(bill.total_amount) ? "paid" : "partially_paid";

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE vendor_bills SET paid_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
        [newPaid, newStatus, id]
      );
      await pool.query(
        `INSERT INTO vendor_bill_payments (bill_id, amount, payment_mode, payment_date, reference, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, amount, payment_mode || "bank_transfer", payment_date || new Date().toISOString().split("T")[0], reference || null, notes || null, req.user?.name ?? "admin"]
      );
      // Auto-post expense journal entry
      postExpenseJournal({
        expId: `bill-${id}-${Date.now()}`,
        amount: Number(amount),
        category: "office",
        paymentMethod: payment_mode || "bank",
        date: payment_date || new Date().toISOString().split("T")[0],
        description: `Vendor payment — ${bill.vendor_name}`,
      }).catch(() => {});

      await pool.query("COMMIT");
    } catch (e) { await pool.query("ROLLBACK"); throw e; }
    res.json({ ok: true, paid_amount: newPaid, status: newStatus });
  } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});

router.post("/bills/:id/cancel", requireAdmin as any, async (_req, res) => {
  try {
    await pool.query(
      `UPDATE vendor_bills SET status='cancelled', updated_at=NOW() WHERE id=$1`, [_req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to cancel" }); }
});

// ── GET /api/purchase/stats ──────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [poStats, billStats] = await Promise.all([
      q1(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='draft')::int AS draft,
          COUNT(*) FILTER (WHERE status='approved')::int AS approved,
          COUNT(*) FILTER (WHERE status='received')::int AS received,
          COALESCE(SUM(total_amount),0)::numeric AS total_value
        FROM purchase_orders WHERE status != 'cancelled'
      `),
      q1(`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(total_amount),0)::numeric AS total_billed,
          COALESCE(SUM(paid_amount),0)::numeric AS total_paid,
          COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status NOT IN ('paid','cancelled')),0)::numeric AS outstanding
        FROM vendor_bills
      `),
    ]);
    res.json({ purchase_orders: poStats, bills: billStats });
  } catch (err) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

export default router;
