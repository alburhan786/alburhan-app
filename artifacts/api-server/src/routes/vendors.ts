import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

router.get("/", requireAdmin as any, async (_req, res) => {
  try {
    const vendors = await q(`SELECT * FROM vendors WHERE is_deleted=false ORDER BY name`);
    res.json(vendors);
  } catch (err) {
    console.error("[vendors] GET /", err);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, category, gst_number, pan, bank_account, ifsc, contact, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const row = await q1(
      `INSERT INTO vendors (id,name,category,gst_number,pan,bank_account,ifsc,contact,email,address,notes)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, category || "other", gst_number || null, pan || null, bank_account || null, ifsc || null,
       contact || null, email || null, address || null, notes || null]
    );
    res.json(row);
  } catch (err) {
    console.error("[vendors] POST /", err);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, category, gst_number, pan, bank_account, ifsc, contact, email, address, notes, is_active } = req.body;
    const row = await q1(
      `UPDATE vendors SET name=$1,category=$2,gst_number=$3,pan=$4,bank_account=$5,ifsc=$6,
       contact=$7,email=$8,address=$9,notes=$10,is_active=$11,updated_at=NOW()
       WHERE id=$12 AND is_deleted=false RETURNING *`,
      [name, category || "other", gst_number || null, pan || null, bank_account || null, ifsc || null,
       contact || null, email || null, address || null, notes || null, is_active !== false, req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Vendor not found" });
    res.json(row);
  } catch (err) {
    console.error("[vendors] PUT /:id", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const row = await q1(
      `UPDATE vendors SET is_deleted=true,deleted_at=NOW() WHERE id=$1 AND is_deleted=false RETURNING id`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Vendor not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("[vendors] DELETE /:id", err);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

router.get("/:id/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const vendor = await q1(`SELECT * FROM vendors WHERE id=$1 AND is_deleted=false`, [req.params.id]);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    let sql = `SELECT e.*, g.name AS group_name FROM expenses e
               LEFT JOIN hajj_groups g ON g.id=e.group_id
               WHERE e.vendor_id=$1`;
    const params: any[] = [req.params.id];
    if (from) { params.push(from); sql += ` AND e.date>=$${params.length}`; }
    if (to)   { params.push(to);   sql += ` AND e.date<=$${params.length}`; }
    sql += ` ORDER BY e.date DESC, e.created_at DESC`;

    const expenses = await q(sql, params);
    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    // Add running balance to each expense row
    let running = 0;
    const expensesWithBalance = expenses.map((e: any) => {
      running += Number(e.amount || 0);
      return { ...e, running_balance: running };
    });

    // Outstanding = total expenses recorded (no "paid" concept for vendors yet, all expenses are liabilities)
    res.json({ vendor, expenses: expensesWithBalance, totalAmount, outstandingAmount: totalAmount });
  } catch (err) {
    console.error("[vendors] GET /:id/ledger", err);
    res.status(500).json({ error: "Failed to fetch vendor ledger" });
  }
});

export default router;
