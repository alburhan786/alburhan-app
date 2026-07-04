import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  const r = await pool.query(text, params);
  return r.rows ?? [];
}

// GET /api/accounting/ledger — Customer-wise debit/credit ledger
router.get("/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { search, from, to } = req.query as Record<string, string>;
    const rows = await q(`
      SELECT
        b.id AS booking_id,
        b.booking_number,
        COALESCE(u.name, u.mobile) AS customer_name,
        u.mobile,
        b.group_name,
        b.final_amount::numeric AS debit,
        COALESCE(b.paid_amount::numeric, 0) AS credit,
        GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric, 0), 0) AS balance,
        b.status,
        b.created_at
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.deleted_at IS NULL
        AND b.final_amount IS NOT NULL
        ${search ? `AND (u.name ILIKE '%' || $1 || '%' OR u.mobile ILIKE '%' || $1 || '%' OR b.booking_number ILIKE '%' || $1 || '%')` : ""}
      ORDER BY b.created_at DESC
      LIMIT 500
    `, search ? [search] : []);
    res.json(rows);
  } catch (err) {
    console.error("[accounting] ledger:", err);
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

// GET /api/accounting/cashbook — Cash in + cash out chronological
router.get("/cashbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, type } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    // Cash IN: payment_transactions with cash mode
    const cashIn = type !== "out" ? await q(`
      SELECT
        pt.payment_date::text AS date,
        'receipt' AS type,
        COALESCE(u.name, u.mobile) AS party,
        u.mobile AS party_mobile,
        'Customer Payment' AS narration,
        b.booking_number AS reference,
        pt.payment_mode AS mode,
        pt.amount::numeric AS amount,
        0 AS expense,
        pt.amount::numeric AS cash_in
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE pt.payment_mode = 'cash'
        AND pt.is_deleted = false
        AND pt.payment_date::text >= $1
        AND pt.payment_date::text <= $2
    `, [dateFrom, dateTo]) : [];

    // Cash OUT: expenses with cash payment method
    const cashOut = type !== "in" ? await q(`
      SELECT
        e.date AS date,
        'payment' AS type,
        COALESCE(e.vendor, 'N/A') AS party,
        '' AS party_mobile,
        e.description AS narration,
        COALESCE(e.invoice_number, '') AS reference,
        e.payment_method AS mode,
        e.amount::numeric AS amount,
        e.amount::numeric AS expense,
        0 AS cash_in
      FROM expenses e
      WHERE e.payment_method = 'cash'
        AND e.date >= $1
        AND e.date <= $2
        ${type !== "in" ? "" : ""}
    `, [dateFrom, dateTo]) : [];

    const combined = [...cashIn, ...cashOut].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );

    // Running balance
    let balance = 0;
    const withBalance = combined.map(row => {
      balance += Number(row.cash_in || 0) - Number(row.expense || 0);
      return { ...row, running_balance: balance };
    });

    res.json({
      rows: withBalance,
      summary: {
        totalIn: cashIn.reduce((s, r) => s + Number(r.amount || 0), 0),
        totalOut: cashOut.reduce((s, r) => s + Number(r.amount || 0), 0),
        netBalance: balance,
      },
    });
  } catch (err) {
    console.error("[accounting] cashbook:", err);
    res.status(500).json({ error: "Failed to fetch cash book" });
  }
});

// GET /api/accounting/bankbook — Bank transfers in + out
router.get("/bankbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const bankModes = ['neft', 'bank', 'cheque', 'rtgs', 'imps'];

    const bankIn = await q(`
      SELECT
        pt.payment_date::text AS date,
        'receipt' AS type,
        COALESCE(u.name, u.mobile) AS party,
        b.booking_number AS reference,
        pt.payment_mode AS mode,
        COALESCE(pt.bank_name, '') AS bank_name,
        COALESCE(pt.reference_number, '') AS ref_number,
        pt.amount::numeric AS amount,
        0 AS expense,
        pt.amount::numeric AS bank_in
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE pt.payment_mode = ANY($1)
        AND pt.is_deleted = false
        AND pt.payment_date::text >= $2
        AND pt.payment_date::text <= $3
    `, [bankModes, dateFrom, dateTo]);

    const bankOut = await q(`
      SELECT
        e.date AS date,
        'payment' AS type,
        COALESCE(e.vendor, 'N/A') AS party,
        COALESCE(e.invoice_number, '') AS reference,
        e.payment_method AS mode,
        '' AS bank_name,
        '' AS ref_number,
        e.amount::numeric AS amount,
        e.amount::numeric AS expense,
        0 AS bank_in
      FROM expenses e
      WHERE e.payment_method = ANY($1)
        AND e.date >= $2
        AND e.date <= $3
    `, [['bank', 'cheque', 'neft', 'rtgs', 'imps'], dateFrom, dateTo]);

    const combined = [...bankIn, ...bankOut].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );

    let balance = 0;
    const withBalance = combined.map(row => {
      balance += Number(row.bank_in || 0) - Number(row.expense || 0);
      return { ...row, running_balance: balance };
    });

    res.json({
      rows: withBalance,
      summary: {
        totalIn: bankIn.reduce((s, r) => s + Number(r.amount || 0), 0),
        totalOut: bankOut.reduce((s, r) => s + Number(r.amount || 0), 0),
        netBalance: balance,
      },
    });
  } catch (err) {
    console.error("[accounting] bankbook:", err);
    res.status(500).json({ error: "Failed to fetch bank book" });
  }
});

// GET /api/accounting/journal — Journal entries (all transactions)
router.get("/journal", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const receipts = await q(`
      SELECT
        pt.payment_date::text AS date,
        b.booking_number AS reference,
        COALESCE(u.name, u.mobile) AS party,
        'Customer Receipt' AS account_dr,
        'Sales / Revenue' AS account_cr,
        pt.amount::numeric AS debit,
        pt.amount::numeric AS credit,
        pt.payment_mode AS narration,
        'receipt' AS entry_type
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE pt.is_deleted = false
        AND pt.payment_date::text >= $1
        AND pt.payment_date::text <= $2
    `, [dateFrom, dateTo]);

    const expenses = await q(`
      SELECT
        e.date AS date,
        COALESCE(e.invoice_number, e.id) AS reference,
        COALESCE(e.vendor, 'N/A') AS party,
        e.category AS account_dr,
        'Cash / Bank' AS account_cr,
        e.amount::numeric AS debit,
        e.amount::numeric AS credit,
        e.description AS narration,
        'expense' AS entry_type
      FROM expenses e
      WHERE e.date >= $1 AND e.date <= $2
    `, [dateFrom, dateTo]);

    const combined = [...receipts, ...expenses].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );

    res.json(combined);
  } catch (err) {
    console.error("[accounting] journal:", err);
    res.status(500).json({ error: "Failed to fetch journal" });
  }
});

// GET /api/accounting/payment-entries — All payments received
router.get("/payment-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, mode } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const rows = await q(`
      SELECT
        pt.id,
        pt.payment_date::text AS date,
        b.booking_number,
        COALESCE(u.name, u.mobile) AS customer_name,
        u.mobile,
        b.group_name,
        pt.payment_mode AS mode,
        COALESCE(pt.reference_number, '') AS reference,
        COALESCE(pt.bank_name, '') AS bank_name,
        COALESCE(pt.received_by, '') AS received_by,
        pt.amount::numeric AS amount,
        pt.created_at
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE pt.is_deleted = false
        AND pt.payment_date::text >= $1
        AND pt.payment_date::text <= $2
        ${mode && mode !== "all" ? "AND pt.payment_mode = $3" : ""}
      ORDER BY pt.payment_date DESC, pt.created_at DESC
    `, mode && mode !== "all" ? [dateFrom, dateTo, mode] : [dateFrom, dateTo]);

    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    res.json({ rows, total });
  } catch (err) {
    console.error("[accounting] payment-entries:", err);
    res.status(500).json({ error: "Failed to fetch payment entries" });
  }
});

// GET /api/accounting/outstanding — Customer outstanding balances
router.get("/outstanding", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;

    const rows = await q(`
      SELECT
        b.id AS booking_id,
        b.booking_number,
        COALESCE(u.name, u.mobile) AS customer_name,
        u.mobile,
        b.group_name,
        b.final_amount::numeric AS total_amount,
        COALESCE(b.paid_amount::numeric, 0) AS paid_amount,
        GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric, 0), 0) AS outstanding,
        b.status,
        b.created_at
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.deleted_at IS NULL
        AND b.final_amount IS NOT NULL
        AND b.final_amount::numeric > COALESCE(b.paid_amount::numeric, 0)
        ${search ? `AND (u.name ILIKE '%' || $1 || '%' OR u.mobile ILIKE '%' || $1 || '%')` : ""}
      ORDER BY outstanding DESC
    `, search ? [search] : []);

    const total = rows.reduce((s, r) => s + Number(r.outstanding || 0), 0);
    res.json({ rows, total, count: rows.length });
  } catch (err) {
    console.error("[accounting] outstanding:", err);
    res.status(500).json({ error: "Failed to fetch outstanding" });
  }
});

// GET /api/accounting/pl — Profit & Loss statement
router.get("/pl", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date().getFullYear() + "-04-01"; // FY start
    const dateTo = to || new Date().toISOString().slice(0, 10);

    // Revenue
    const revenue = await q(`
      SELECT
        COALESCE(SUM(pt.amount::numeric), 0) AS total_revenue,
        COUNT(DISTINCT b.id) AS booking_count
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      WHERE pt.is_deleted = false
        AND pt.payment_date::text >= $1
        AND pt.payment_date::text <= $2
    `, [dateFrom, dateTo]);

    // Revenue by month
    const revenueByMonth = await q(`
      SELECT
        to_char(pt.payment_date, 'YYYY-MM') AS month,
        COALESCE(SUM(pt.amount::numeric), 0) AS amount
      FROM payment_transactions pt
      WHERE pt.is_deleted = false
        AND pt.payment_date::text >= $1
        AND pt.payment_date::text <= $2
      GROUP BY 1 ORDER BY 1
    `, [dateFrom, dateTo]);

    // Expenses by category
    const expensesByCategory = await q(`
      SELECT
        category,
        COALESCE(SUM(amount::numeric), 0) AS total
      FROM expenses
      WHERE date >= $1 AND date <= $2
      GROUP BY category
      ORDER BY total DESC
    `, [dateFrom, dateTo]);

    // Expenses by month
    const expensesByMonth = await q(`
      SELECT
        substring(date FROM 1 FOR 7) AS month,
        COALESCE(SUM(amount::numeric), 0) AS amount
      FROM expenses
      WHERE date >= $1 AND date <= $2
      GROUP BY 1 ORDER BY 1
    `, [dateFrom, dateTo]);

    const totalRevenue = Number(revenue[0]?.total_revenue || 0);
    const totalExpenses = expensesByCategory.reduce((s, r) => s + Number(r.total || 0), 0);
    const grossProfit = totalRevenue - totalExpenses;

    res.json({
      period: { from: dateFrom, to: dateTo },
      revenue: {
        total: totalRevenue,
        bookingCount: Number(revenue[0]?.booking_count || 0),
        byMonth: revenueByMonth.map(r => ({ month: r.month, amount: Number(r.amount) })),
      },
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory.map(r => ({ category: r.category, total: Number(r.total) })),
        byMonth: expensesByMonth.map(r => ({ month: r.month, amount: Number(r.amount) })),
      },
      grossProfit,
      netProfit: grossProfit,
    });
  } catch (err) {
    console.error("[accounting] pl:", err);
    res.status(500).json({ error: "Failed to generate P&L" });
  }
});

// GET /api/accounting/balance-sheet — Simple balance sheet
router.get("/balance-sheet", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);

    // Assets: Cash received + bank + outstanding receivables
    const [receipts] = await q(`
      SELECT
        COALESCE(SUM(CASE WHEN pt.payment_mode='cash' THEN pt.amount::numeric ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN pt.payment_mode != 'cash' THEN pt.amount::numeric ELSE 0 END), 0) AS bank,
        COALESCE(SUM(pt.amount::numeric), 0) AS total_received
      FROM payment_transactions pt
      WHERE pt.is_deleted = false AND pt.payment_date::text <= $1
    `, [asOf]);

    const [outstanding] = await q(`
      SELECT COALESCE(SUM(GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric, 0), 0)), 0) AS receivables
      FROM bookings b
      WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL AND b.created_at::text <= $1
    `, [asOf + "T23:59:59Z"]);

    // Liabilities: Total expense outflow
    const [expTotal] = await q(`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM expenses WHERE date <= $1
    `, [asOf]);

    const cashAsset = Number(receipts?.cash || 0);
    const bankAsset = Number(receipts?.bank || 0);
    const receivables = Number(outstanding?.receivables || 0);
    const expensePaid = Number(expTotal?.total || 0);

    const totalAssets = cashAsset + bankAsset + receivables;
    const totalLiabilities = expensePaid;
    const equity = totalAssets - totalLiabilities;

    res.json({
      asOf,
      assets: {
        cash: cashAsset,
        bank: bankAsset,
        accountsReceivable: receivables,
        total: totalAssets,
      },
      liabilities: {
        expensesPaid: expensePaid,
        total: totalLiabilities,
      },
      equity,
    });
  } catch (err) {
    console.error("[accounting] balance-sheet:", err);
    res.status(500).json({ error: "Failed to generate balance sheet" });
  }
});

// GET /api/accounting/trial-balance — Trial balance
router.get("/trial-balance", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date().getFullYear() + "-04-01";
    const dateTo = to || new Date().toISOString().slice(0, 10);

    // Revenue = credit side
    const [rev] = await q(`
      SELECT COALESCE(SUM(pt.amount::numeric), 0) AS total
      FROM payment_transactions pt
      WHERE pt.is_deleted = false AND pt.payment_date::text BETWEEN $1 AND $2
    `, [dateFrom, dateTo]);

    // Expenses by category = debit side
    const expCats = await q(`
      SELECT category, COALESCE(SUM(amount::numeric), 0) AS total
      FROM expenses
      WHERE date BETWEEN $1 AND $2
      GROUP BY category ORDER BY category
    `, [dateFrom, dateTo]);

    // Outstanding as debtor (debit)
    const [outstd] = await q(`
      SELECT COALESCE(SUM(GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric, 0), 0)), 0) AS total
      FROM bookings b WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL
    `, []);

    const totalRevenue = Number(rev?.total || 0);
    const totalExpenses = expCats.reduce((s, r) => s + Number(r.total || 0), 0);
    const debtors = Number(outstd?.total || 0);

    const debitEntries = [
      ...expCats.map(r => ({ account: `Expense - ${r.category}`, debit: Number(r.total), credit: 0 })),
      { account: "Accounts Receivable (Debtors)", debit: debtors, credit: 0 },
    ];
    const creditEntries = [
      { account: "Sales Revenue", debit: 0, credit: totalRevenue },
    ];

    const allEntries = [...debitEntries, ...creditEntries];
    const totalDebit = allEntries.reduce((s, r) => s + r.debit, 0);
    const totalCredit = allEntries.reduce((s, r) => s + r.credit, 0);

    res.json({
      period: { from: dateFrom, to: dateTo },
      entries: allEntries,
      totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 },
    });
  } catch (err) {
    console.error("[accounting] trial-balance:", err);
    res.status(500).json({ error: "Failed to generate trial balance" });
  }
});

export default router;
