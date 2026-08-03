import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();
router.use(requireModuleAccess("gst") as any);

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// ── GST Summary ───────────────────────────────────────────────────────────────
router.get("/summary", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from, to } = req.query as Record<string, string>;
    // tenantId is always $1
    const params: any[] = [tenantId];
    let bWhere = `WHERE tenant_id=$1::uuid AND (is_deleted IS NULL OR is_deleted=false) AND gst_amount IS NOT NULL AND gst_amount > 0`;
    let eWhere = `WHERE tenant_id=$1::uuid`;

    if (from) {
      params.push(from);
      bWhere += ` AND DATE(created_at)>=$${params.length}`;
      eWhere += ` AND date>=$${params.length}`;
    }
    if (to) {
      params.push(to);
      bWhere += ` AND DATE(created_at)<=$${params.length}`;
      eWhere += ` AND date<=$${params.length}`;
    }

    // Sales: GST collected from bookings
    const sales = await q1(`
      SELECT
        COALESCE(SUM(final_amount::numeric), 0) AS total_revenue,
        COALESCE(SUM(gst_amount::numeric), 0) AS total_gst_collected,
        COALESCE(SUM(COALESCE(taxable_amount::numeric, final_amount::numeric - gst_amount::numeric)), 0) AS taxable_revenue,
        COUNT(*) AS invoice_count
      FROM bookings ${bWhere}
    `, params);

    // Purchase: GST paid on expenses
    const purchase = await q1(`
      SELECT
        COALESCE(SUM(amount::numeric), 0) AS total_expenses,
        COALESCE(SUM(COALESCE(cgst_amount::numeric, 0)), 0) AS total_cgst_paid,
        COALESCE(SUM(COALESCE(sgst_amount::numeric, 0)), 0) AS total_sgst_paid,
        COALESCE(SUM(COALESCE(igst_amount::numeric, 0)), 0) AS total_igst_paid,
        COALESCE(SUM(COALESCE(cgst_amount::numeric, 0) + COALESCE(sgst_amount::numeric, 0) + COALESCE(igst_amount::numeric, 0)), 0) AS total_gst_paid
      FROM expenses ${eWhere}
    `, params);

    const gstCollected = parseFloat(sales?.total_gst_collected ?? 0);
    const gstPaid = parseFloat(purchase?.total_gst_paid ?? 0);

    res.json({
      period: { from: from || null, to: to || null },
      sales: {
        totalRevenue: parseFloat(sales?.total_revenue ?? 0),
        taxableRevenue: parseFloat(sales?.taxable_revenue ?? 0),
        totalGstCollected: gstCollected,
        invoiceCount: parseInt(sales?.invoice_count ?? 0),
      },
      purchase: {
        totalExpenses: parseFloat(purchase?.total_expenses ?? 0),
        totalCgstPaid: parseFloat(purchase?.total_cgst_paid ?? 0),
        totalSgstPaid: parseFloat(purchase?.total_sgst_paid ?? 0),
        totalIgstPaid: parseFloat(purchase?.total_igst_paid ?? 0),
        totalGstPaid: gstPaid,
      },
      netGstPayable: gstCollected - gstPaid,
    });
  } catch (err) {
    console.error("[gst] summary:", err);
    res.status(500).json({ error: "Failed to fetch GST summary" });
  }
});

// ── GST Sales Register (Bookings) ────────────────────────────────────────────
router.get("/sales-register", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from, to } = req.query as Record<string, string>;
    const params: any[] = [tenantId];
    let where = `WHERE b.tenant_id=$1::uuid AND (b.is_deleted IS NULL OR b.is_deleted=false)`;
    if (from) { params.push(from); where += ` AND DATE(b.created_at)>=$${params.length}`; }
    if (to)   { params.push(to);   where += ` AND DATE(b.created_at)<=$${params.length}`; }

    const rows = await q(`
      SELECT
        b.id, b.booking_number, b.invoice_number,
        b.customer_name, b.customer_mobile,
        b.package_name, b.group_id,
        DATE(b.created_at) AS invoice_date,
        b.status,
        COALESCE(b.total_amount::numeric, 0) AS total_amount,
        COALESCE(b.taxable_amount::numeric, 0) AS taxable_amount,
        COALESCE(b.gst_rate::numeric, 0) AS gst_rate,
        COALESCE(b.gst_amount::numeric, 0) AS gst_amount,
        COALESCE(b.final_amount::numeric, 0) AS final_amount,
        g.name AS group_name
      FROM bookings b
      LEFT JOIN hajj_groups g ON g.id=b.group_id
      ${where}
      ORDER BY b.created_at DESC
    `, params);

    res.json(rows.map(r => ({
      ...r,
      cgst_amount: parseFloat(r.gst_amount) / 2,
      sgst_amount: parseFloat(r.gst_amount) / 2,
    })));
  } catch (err) {
    console.error("[gst] sales-register:", err);
    res.status(500).json({ error: "Failed to fetch GST sales register" });
  }
});

// ── GST Purchase Register (Expenses) ─────────────────────────────────────────
router.get("/purchase-register", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const tenantId = getTenantId(req);
    const params: any[] = [tenantId];
    let where = `WHERE e.tenant_id=$1::uuid AND (cgst_amount IS NOT NULL OR sgst_amount IS NOT NULL OR igst_amount IS NOT NULL)`;
    if (from) { params.push(from); where += ` AND date>=$${params.length}`; }
    if (to)   { params.push(to);   where += ` AND date<=$${params.length}`; }

    const rows = await q(`
      SELECT
        e.id, e.date, e.category, e.vendor, e.description,
        e.invoice_number, e.payment_method,
        COALESCE(e.amount::numeric, 0) AS amount,
        COALESCE(e.gst_percent::numeric, 0) AS gst_percent,
        COALESCE(e.cgst_amount::numeric, 0) AS cgst_amount,
        COALESCE(e.sgst_amount::numeric, 0) AS sgst_amount,
        COALESCE(e.igst_amount::numeric, 0) AS igst_amount,
        e.hsn_sac,
        COALESCE(e.cgst_amount::numeric, 0) + COALESCE(e.sgst_amount::numeric, 0) + COALESCE(e.igst_amount::numeric, 0) AS total_gst,
        v.name AS vendor_name, v.gst_number AS vendor_gstin
      FROM expenses e
      LEFT JOIN vendors v ON v.id=e.vendor_id
      ${where}
      ORDER BY e.date DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error("[gst] purchase-register:", err);
    res.status(500).json({ error: "Failed to fetch GST purchase register" });
  }
});

export default router;
