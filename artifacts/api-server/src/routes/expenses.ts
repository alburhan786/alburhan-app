import { Router } from "express";
import { db, pool, expensesTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import { postExpenseJournal, voidJournalEntry } from "../lib/journalHelper.js";

const router = Router();
router.use(requireModuleAccess("expenses") as any);

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
  const ZERO_RESPONSE = {
    totalCollected: 0, thisMonthCollected: 0, totalOutstanding: 0,
    totalBookings: 0, totalExpenses: 0, thisMonthExpenses: 0,
    netProfit: 0, byCategory: [], monthly: [], monthlyExpenses: [],
  };

  // Helper: run raw SQL via pool.query() — works in both dev (tsx) and VPS (bundled CJS)
  async function rawQuery(queryText: string): Promise<any[]> {
    const result = await pool.query(queryText);
    return result.rows ?? [];
  }

  try {
    // Expense stats
    let eStats: Record<string, any> = {};
    try {
      const [row] = await rawQuery(`
        SELECT
          COALESCE(SUM(amount::numeric), 0) AS total_expenses,
          COALESCE(SUM(CASE WHEN date >= to_char(date_trunc('month', NOW()), 'YYYY-MM-DD') THEN amount::numeric ELSE 0 END), 0) AS this_month_expenses
        FROM expenses
      `);
      eStats = row ?? {};
    } catch (err) {
      console.error("[expenses] accounting-summary: expense stats query failed:", err);
    }

    // Expenses by category
    let byCategory: any[] = [];
    try {
      byCategory = await rawQuery(`
        SELECT category, COALESCE(SUM(amount::numeric), 0) AS total
        FROM expenses
        GROUP BY category
        ORDER BY total DESC
      `);
    } catch (err) {
      console.error("[expenses] accounting-summary: by-category query failed:", err);
    }

    // Booking stats — exclude soft-deleted
    let bStats: Record<string, any> = {};
    try {
      const [row] = await rawQuery(`
        SELECT
          COALESCE(SUM(paid_amount::numeric), 0) AS total_collected,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN paid_amount::numeric ELSE 0 END), 0) AS this_month_collected,
          COALESCE(SUM(GREATEST(final_amount::numeric - COALESCE(paid_amount::numeric,0), 0)), 0) AS total_outstanding,
          COUNT(*)::int AS total_bookings
        FROM bookings
        WHERE final_amount IS NOT NULL AND deleted_at IS NULL
      `);
      bStats = row ?? {};
    } catch (err) {
      // Fallback without deleted_at filter (column may not exist on older VPS)
      try {
        const [row] = await rawQuery(`
          SELECT
            COALESCE(SUM(paid_amount::numeric), 0) AS total_collected,
            COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN paid_amount::numeric ELSE 0 END), 0) AS this_month_collected,
            COALESCE(SUM(GREATEST(final_amount::numeric - COALESCE(paid_amount::numeric,0), 0)), 0) AS total_outstanding,
            COUNT(*)::int AS total_bookings
          FROM bookings
          WHERE final_amount IS NOT NULL
        `);
        bStats = row ?? {};
      } catch (err2) {
        console.error("[expenses] accounting-summary: booking stats query failed:", err2);
      }
    }

    // Monthly collections
    let monthly: any[] = [];
    try {
      monthly = await rawQuery(`
        SELECT
          to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(paid_amount::numeric), 0) AS collected
        FROM bookings
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND deleted_at IS NULL
        GROUP BY 1 ORDER BY 1
      `);
    } catch {
      try {
        monthly = await rawQuery(`
          SELECT
            to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COALESCE(SUM(paid_amount::numeric), 0) AS collected
          FROM bookings
          WHERE created_at >= NOW() - INTERVAL '12 months'
          GROUP BY 1 ORDER BY 1
        `);
      } catch (err2) {
        console.error("[expenses] accounting-summary: monthly collections query failed:", err2);
      }
    }

    // Monthly expenses
    let monthlyExpenses: any[] = [];
    try {
      monthlyExpenses = await rawQuery(`
        SELECT
          substring(date FROM 1 FOR 7) AS month,
          COALESCE(SUM(amount::numeric), 0) AS expenses
        FROM expenses
        WHERE date >= to_char(NOW() - INTERVAL '12 months', 'YYYY-MM-DD')
        GROUP BY 1 ORDER BY 1
      `);
    } catch (err) {
      console.error("[expenses] accounting-summary: monthly expenses query failed:", err);
    }

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
      byCategory: byCategory.map(r => ({ category: r.category, total: parseFloat(r.total) })),
      monthly: monthly.map(r => ({ month: r.month, collected: parseFloat(r.collected) })),
      monthlyExpenses: monthlyExpenses.map(r => ({ month: r.month, expenses: parseFloat(r.expenses) })),
    });
  } catch (err) {
    console.error("[expenses] accounting-summary: unexpected error:", err);
    // Return zeros instead of a 500 — dashboard shows ₹0 rather than "Failed to load data"
    res.json(ZERO_RESPONSE);
  }
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId, category, vendor, vendorId, description, amount, date, paidBy, paymentMethod, invoiceNumber, notes,
      gst_percent, cgst_amount, sgst_amount, igst_amount, hsn_sac } = req.body;
    if (!category || !description || !amount || !date) {
      return res.status(400).json({ error: "category, description, amount, date required" });
    }
    const [row] = await db.insert(expensesTable).values({
      groupId: groupId || null,
      category,
      vendor,
      vendorId: vendorId || null,
      description,
      amount: String(amount),
      date,
      paidBy,
      paymentMethod: paymentMethod || "cash",
      invoiceNumber,
      notes,
      gstPercent: gst_percent ? String(gst_percent) : null,
      cgstAmount: cgst_amount ? String(cgst_amount) : null,
      sgstAmount: sgst_amount ? String(sgst_amount) : null,
      igstAmount: igst_amount ? String(igst_amount) : null,
      hsnSac: hsn_sac || null,
    }).returning();

    // Audit log
    auditLog({ req, action: "created", entityTable: "expenses", entityId: row.id, newValue: row }).catch(() => {});

    // Auto-post double-entry journal (fire-and-forget, non-fatal)
    postExpenseJournal({
      expId: row.id,
      amount: Number(amount),
      category: String(category),
      paymentMethod: String(paymentMethod || "cash"),
      date: String(date),
      description: String(description),
      invoiceNumber: invoiceNumber ? String(invoiceNumber) : null,
    }).catch(() => {});

    res.json(row);
  } catch (err) {
    console.error("[expenses] POST /", err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { category, vendor, vendorId, description, amount, date, paidBy, paymentMethod, invoiceNumber, notes, groupId,
      gst_percent, cgst_amount, sgst_amount, igst_amount, hsn_sac, status, rejectedReason } = req.body;
    const [row] = await db.update(expensesTable)
      .set({
        category, vendor, vendorId: vendorId || null, description,
        amount: amount !== undefined ? String(amount) : undefined,
        date, paidBy, paymentMethod, invoiceNumber, notes,
        groupId: groupId || null,
        gstPercent: gst_percent !== undefined ? (gst_percent ? String(gst_percent) : null) : undefined,
        cgstAmount: cgst_amount !== undefined ? (cgst_amount ? String(cgst_amount) : null) : undefined,
        sgstAmount: sgst_amount !== undefined ? (sgst_amount ? String(sgst_amount) : null) : undefined,
        igstAmount: igst_amount !== undefined ? (igst_amount ? String(igst_amount) : null) : undefined,
        hsnSac: hsn_sac !== undefined ? (hsn_sac || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(expensesTable.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    auditLog({ req, action: "updated", entityTable: "expenses", entityId: row.id, newValue: { category: row.category, amount: row.amount, description: row.description } }).catch(() => {});

    // Sync journal: void old entry + re-post with new values (fire-and-forget, non-fatal)
    voidJournalEntry("expense", row.id).then(() =>
      postExpenseJournal({
        expId: row.id,
        amount: Number(row.amount),
        category: String(row.category),
        paymentMethod: String(row.paymentMethod || "cash"),
        date: String(row.date),
        description: String(row.description),
        invoiceNumber: row.invoiceNumber ?? null,
      })
    ).catch(() => {});

    res.json(row);
  } catch (err) {
    console.error("[expenses] PUT", err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const expId = req.params.id as string;
    // Snapshot before delete for audit/restore
    const [snap] = await db.select().from(expensesTable).where(eq(expensesTable.id, expId)).limit(1);
    await db.delete(expensesTable).where(eq(expensesTable.id, expId));
    // Audit log
    auditLog({ req, action: "deleted", entityTable: "expenses", entityId: expId, oldValue: snap || null }).catch(() => {});
    // Void journal entry for deleted expense (fire-and-forget, non-fatal)
    voidJournalEntry("expense", expId).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error("[expenses] DELETE", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;
