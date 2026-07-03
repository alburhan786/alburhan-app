import { Router } from "express";
import { db, expensesTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

const CATEGORIES = ["flights","hotels","visa","transport","food","laundry","zamzam","salary","marketing","office","misc"];

router.get("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId, category, from, to } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (groupId) conditions.push(eq(expensesTable.groupId, groupId));
    if (category && CATEGORIES.includes(category)) conditions.push(eq(expensesTable.category, category));
    const rows = await db.select().from(expensesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt));
    let result = rows;
    if (from) result = result.filter(r => r.date >= from);
    if (to) result = result.filter(r => r.date <= to);
    res.json(result);
  } catch (err) {
    console.error("[expenses] GET /", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.get("/accounting-summary", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const [expStats] = await db.execute(sql`
      SELECT
        COALESCE(SUM(amount::numeric), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN date >= date_trunc('month', NOW())::text THEN amount::numeric ELSE 0 END), 0) AS this_month_expenses,
        json_agg(json_build_object('category', category, 'total', cat_total) ORDER BY cat_total DESC) AS by_category
      FROM (
        SELECT category, SUM(amount::numeric) AS cat_total FROM expenses GROUP BY category
      ) sub
    `) as any;

    const [bookingStats] = await db.execute(sql`
      SELECT
        COALESCE(SUM(paid_amount::numeric), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN paid_amount::numeric ELSE 0 END), 0) AS this_month_collected,
        COALESCE(SUM(GREATEST(final_amount::numeric - COALESCE(paid_amount::numeric,0), 0)), 0) AS total_outstanding,
        COUNT(*)::int AS total_bookings
      FROM bookings
      WHERE final_amount IS NOT NULL
    `) as any;

    const monthlyRows = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(paid_amount::numeric), 0) AS collected
      FROM bookings
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1
    `) as any;

    const monthlyExpRows = await db.execute(sql`
      SELECT
        substring(date FROM 1 FOR 7) AS month,
        COALESCE(SUM(amount::numeric), 0) AS expenses
      FROM expenses
      WHERE date >= to_char(NOW() - INTERVAL '12 months', 'YYYY-MM-DD')
      GROUP BY 1 ORDER BY 1
    `) as any;

    const bStats = Array.isArray(bookingStats) ? bookingStats[0] : (bookingStats as any)?.rows?.[0] ?? {};
    const eStats = Array.isArray(expStats) ? expStats[0] : (expStats as any)?.rows?.[0] ?? {};
    const mRows = Array.isArray(monthlyRows) ? monthlyRows : (monthlyRows as any)?.rows ?? [];
    const meRows = Array.isArray(monthlyExpRows) ? monthlyExpRows : (monthlyExpRows as any)?.rows ?? [];

    const totalCollected = parseFloat(bStats.total_collected ?? 0);
    const totalExpenses = parseFloat(eStats.total_expenses ?? 0);

    res.json({
      totalCollected,
      thisMonthCollected: parseFloat(bStats.this_month_collected ?? 0),
      totalOutstanding: parseFloat(bStats.total_outstanding ?? 0),
      totalBookings: parseInt(bStats.total_bookings ?? 0),
      totalExpenses,
      thisMonthExpenses: parseFloat(eStats.this_month_expenses ?? 0),
      netProfit: totalCollected - totalExpenses,
      byCategory: eStats.by_category ?? [],
      monthly: mRows,
      monthlyExpenses: meRows,
    });
  } catch (err) {
    console.error("[expenses] accounting-summary error:", err);
    res.status(500).json({ error: "Failed to fetch accounting summary" });
  }
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId, category, vendor, description, amount, date, paidBy, paymentMethod, invoiceNumber, notes } = req.body;
    if (!category || !description || !amount || !date) {
      return res.status(400).json({ error: "category, description, amount, date required" });
    }
    const [row] = await db.insert(expensesTable).values({
      groupId: groupId || null,
      category,
      vendor,
      description,
      amount: String(amount),
      date,
      paidBy,
      paymentMethod: paymentMethod || "cash",
      invoiceNumber,
      notes,
    }).returning();
    res.json(row);
  } catch (err) {
    console.error("[expenses] POST /", err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { category, vendor, description, amount, date, paidBy, paymentMethod, invoiceNumber, notes, groupId } = req.body;
    const [row] = await db.update(expensesTable)
      .set({ category, vendor, description, amount: String(amount), date, paidBy, paymentMethod, invoiceNumber, notes, groupId: groupId || null, updatedAt: new Date() })
      .where(eq(expensesTable.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[expenses] PUT", err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await db.delete(expensesTable).where(eq(expensesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[expenses] DELETE", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;
