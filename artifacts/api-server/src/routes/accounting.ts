import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  const r = await pool.query(text, params);
  return r.rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  const r = await pool.query(text, params);
  return r.rows?.[0] ?? null;
}

// ── CHART OF ACCOUNTS ──────────────────────────────────────────────────────

// GET /api/accounting/accounts
router.get("/accounts", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM accounts ORDER BY code`);
    res.json(rows);
  } catch (err) {
    console.error("[accounting] accounts:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// POST /api/accounting/accounts
router.post("/accounts", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { code, name, type, sub_type, parent_id, opening_balance, description } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });
    const row = await q1(
      `INSERT INTO accounts (id, code, name, type, sub_type, parent_id, opening_balance, description, is_system)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, false)
       RETURNING *`,
      [code, name, type, sub_type || null, parent_id || null, opening_balance || 0, description || null]
    );
    res.json(row);
  } catch (err: any) {
    console.error("[accounting] create account:", err);
    if (err.code === "23505") return res.status(409).json({ error: "Account code already exists" });
    res.status(500).json({ error: "Failed to create account" });
  }
});

// PUT /api/accounting/accounts/:id
router.put("/accounts/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, sub_type, opening_balance, description, is_active } = req.body;
    const row = await q1(
      `UPDATE accounts SET name=$1, sub_type=$2, opening_balance=$3, description=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, sub_type || null, opening_balance || 0, description || null, is_active !== false, id]
    );
    if (!row) return res.status(404).json({ error: "Account not found" });
    res.json(row);
  } catch (err) {
    console.error("[accounting] update account:", err);
    res.status(500).json({ error: "Failed to update account" });
  }
});

// DELETE /api/accounting/accounts/:id
router.delete("/accounts/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const acct = await q1(`SELECT is_system FROM accounts WHERE id=$1`, [id]);
    if (!acct) return res.status(404).json({ error: "Account not found" });
    if (acct.is_system) return res.status(400).json({ error: "Cannot delete system account" });
    await pool.query(`DELETE FROM accounts WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("[accounting] delete account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// GET /api/accounting/accounts/:id/ledger — general ledger per account
router.get("/accounts/:id/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query as Record<string, string>;
    const account = await q1(`SELECT * FROM accounts WHERE id=$1`, [id]);
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Opening balance from account + journal entries before 'from' date
    const openingAdj = from ? await q1(
      `SELECT COALESCE(SUM(jel.debit),0)::numeric AS total_debit, COALESCE(SUM(jel.credit),0)::numeric AS total_credit
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE jel.account_id=$1 AND je.date < $2`,
      [id, from]
    ) : null;

    const openingBal = Number(account.opening_balance || 0)
      + (openingAdj ? Number(openingAdj.total_debit) - Number(openingAdj.total_credit) : 0);

    // Get lines in range
    const lines = await q(`
      SELECT je.date, je.entry_number, je.narration AS je_narration, je.reference, je.source,
             jel.debit, jel.credit, jel.narration AS line_narration
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE jel.account_id = $1
        ${from ? "AND je.date >= $2" : ""}
        ${to ? `AND je.date <= ${from ? "$3" : "$2"}` : ""}
      ORDER BY je.date, je.created_at
    `, from && to ? [id, from, to] : from ? [id, from] : to ? [id, to] : [id]);

    let balance = openingBal;
    const withBalance = lines.map(l => {
      balance += Number(l.debit) - Number(l.credit);
      return { ...l, running_balance: balance };
    });

    res.json({ account, openingBalance: openingBal, lines: withBalance, closingBalance: balance });
  } catch (err) {
    console.error("[accounting] account ledger:", err);
    res.status(500).json({ error: "Failed to fetch account ledger" });
  }
});

// ── FINANCIAL YEARS ────────────────────────────────────────────────────────

router.get("/financial-years", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM financial_years ORDER BY start_date DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch financial years" });
  }
});

router.post("/financial-years", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (!name || !start_date || !end_date) return res.status(400).json({ error: "name, start_date, end_date required" });
    const row = await q1(
      `INSERT INTO financial_years (id, name, start_date, end_date, is_active)
       VALUES (gen_random_uuid()::text, $1, $2, $3, false) RETURNING *`,
      [name, start_date, end_date]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create financial year" });
  }
});

router.put("/financial-years/:id/activate", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE financial_years SET is_active = false`);
    const row = await q1(`UPDATE financial_years SET is_active=true WHERE id=$1 RETURNING *`, [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to activate financial year" });
  }
});

router.put("/financial-years/:id/close", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const row = await q1(`UPDATE financial_years SET is_closed=true, is_active=false WHERE id=$1 RETURNING *`, [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to close financial year" });
  }
});

// ── JOURNAL ENTRIES ────────────────────────────────────────────────────────

router.get("/journal-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, source } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateFrom = from || d30;
    const dateTo = to || today;

    const params: any[] = [dateFrom, dateTo];
    if (source && source !== "all") params.push(source);

    const entries = await q(`
      SELECT je.*,
        json_agg(json_build_object(
          'id', jel.id, 'account_id', jel.account_id, 'account_name', a.name,
          'account_code', a.code, 'debit', jel.debit, 'credit', jel.credit, 'narration', jel.narration
        ) ORDER BY jel.debit DESC) AS lines,
        SUM(jel.debit)::numeric AS total_debit,
        SUM(jel.credit)::numeric AS total_credit
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      LEFT JOIN accounts a ON a.id = jel.account_id
      WHERE je.date BETWEEN $1 AND $2
        ${source && source !== "all" ? "AND je.source = $3" : ""}
      GROUP BY je.id
      ORDER BY je.date DESC, je.created_at DESC
    `, params);

    res.json(entries);
  } catch (err) {
    console.error("[accounting] journal-entries:", err);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
});

router.post("/journal-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { date, narration, reference, lines, financial_year_id } = req.body;
    if (!date || !narration || !lines?.length) {
      return res.status(400).json({ error: "date, narration, lines required" });
    }
    const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: `Journal entry not balanced: Dr ${totalDebit} ≠ Cr ${totalCredit}` });
    }
    // Generate entry number
    const count = await q1(`SELECT COUNT(*) FROM journal_entries WHERE source='manual'`);
    const entryNum = `JV-${String(parseInt(count?.count || "0") + 1).padStart(5, "0")}`;

    const entry = await q1(
      `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, financial_year_id, created_by)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'manual', $5, $6) RETURNING *`,
      [entryNum, date, narration, reference || null, financial_year_id || null, (req as any).user?.id || "admin"]
    );

    for (const line of lines) {
      await pool.query(
        `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit, narration)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
        [entry.id, line.account_id, Number(line.debit || 0), Number(line.credit || 0), line.narration || null]
      );
    }

    res.json({ ...entry, lines });
  } catch (err) {
    console.error("[accounting] create journal entry:", err);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

// Auto-sync: create journal entries for payment_transactions that don't have one
router.post("/journal-entries/sync", requireAdmin as any, async (_req, res) => {
  try {
    // Get accounts
    const cashAcct = await q1(`SELECT id FROM accounts WHERE code='1001'`);
    const bankAcct = await q1(`SELECT id FROM accounts WHERE code='1002'`);
    const receivableAcct = await q1(`SELECT id FROM accounts WHERE code='1003'`);
    const salesAcct = await q1(`SELECT id FROM accounts WHERE code='4001'`);

    if (!cashAcct || !bankAcct || !salesAcct || !receivableAcct) {
      return res.status(500).json({ error: "Chart of accounts not set up. Please ensure accounts table is seeded." });
    }

    // Find payment_transactions without journal entries
    const payments = await q(`
      SELECT pt.*, b.booking_number
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      WHERE pt.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.source = 'payment' AND je.source_id = pt.id
        )
      ORDER BY pt.payment_date
      LIMIT 500
    `);

    let created = 0;
    for (const pt of payments) {
      const isCash = pt.payment_mode === "cash";
      const debitAcctId = isCash ? cashAcct.id : bankAcct.id;
      const entryNum = `REC-${String(created + 1).padStart(5, "0")}`;

      const entry = await q1(
        `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'payment', $5) RETURNING id`,
        [entryNum, pt.payment_date?.toISOString?.()?.slice(0, 10) || pt.payment_date, `Receipt from booking ${pt.booking_number}`, pt.booking_number, pt.id]
      );
      await pool.query(
        `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit) VALUES (gen_random_uuid()::text, $1, $2, $3, 0), (gen_random_uuid()::text, $1, $4, 0, $3)`,
        [entry.id, debitAcctId, Number(pt.amount), salesAcct.id]
      );
      created++;
    }

    // Find expenses without journal entries
    const expenses = await q(`
      SELECT * FROM expenses
      WHERE NOT EXISTS (
        SELECT 1 FROM journal_entries je WHERE je.source = 'expense' AND je.source_id = expenses.id
      )
      ORDER BY date LIMIT 500
    `);

    // Category → expense account mapping
    const catMap: Record<string, string> = {
      flights: "5001", hotels: "5002", visa: "5003", transport: "5004",
      food: "5005", laundry: "5006", zamzam: "5007", salary: "5008",
      marketing: "5009", office: "5010", misc: "5011",
    };

    for (const exp of expenses) {
      const expAcctCode = catMap[exp.category] || "5011";
      const expAcct = await q1(`SELECT id FROM accounts WHERE code=$1`, [expAcctCode]);
      if (!expAcct) continue;
      const isCash = (exp.payment_method || "cash") === "cash";
      const creditAcctId = isCash ? cashAcct.id : bankAcct.id;
      const entryNum = `EXP-${String(created + 1).padStart(5, "0")}`;

      const entry = await q1(
        `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'expense', $5) RETURNING id`,
        [entryNum, exp.date, exp.description, exp.invoice_number || null, exp.id]
      );
      await pool.query(
        `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit) VALUES (gen_random_uuid()::text, $1, $2, $3, 0), (gen_random_uuid()::text, $1, $4, 0, $3)`,
        [entry.id, expAcct.id, Number(exp.amount), creditAcctId]
      );
      created++;
    }

    res.json({ synced: created, payments: payments.length, expenses: expenses.length });
  } catch (err) {
    console.error("[accounting] sync journal entries:", err);
    res.status(500).json({ error: "Sync failed" });
  }
});

// ── BANK RECONCILIATION ────────────────────────────────────────────────────

router.get("/bank-reconciliation", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, status } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateFrom = from || d30;
    const dateTo = to || today;

    const rows = await q(`
      SELECT pt.id, pt.payment_date::text AS date, pt.amount::numeric,
             pt.payment_mode AS mode, pt.reference_number,
             COALESCE(pt.bank_name, '') AS bank_name,
             pt.is_reconciled, pt.reconciled_date, pt.reconciled_by,
             b.booking_number,
             COALESCE(u.name, u.mobile) AS customer_name
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      JOIN users u ON u.id = b.user_id
      WHERE pt.is_deleted = false
        AND pt.payment_date::text BETWEEN $1 AND $2
        ${status === "reconciled" ? "AND pt.is_reconciled = true" : status === "unreconciled" ? "AND pt.is_reconciled = false" : ""}
      ORDER BY pt.payment_date DESC
    `, [dateFrom, dateTo]);

    const summary = {
      total: rows.reduce((s, r) => s + Number(r.amount), 0),
      reconciled: rows.filter(r => r.is_reconciled).reduce((s, r) => s + Number(r.amount), 0),
      unreconciled: rows.filter(r => !r.is_reconciled).reduce((s, r) => s + Number(r.amount), 0),
      count: rows.length,
      reconciledCount: rows.filter(r => r.is_reconciled).length,
    };

    res.json({ rows, summary });
  } catch (err) {
    console.error("[accounting] bank-reconciliation:", err);
    res.status(500).json({ error: "Failed to fetch reconciliation data" });
  }
});

router.post("/bank-reconciliation/:id/reconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { bank_statement_date, notes } = req.body;
    const row = await q1(
      `UPDATE payment_transactions SET is_reconciled=true, reconciled_date=$1, reconciled_by=$2
       WHERE id=$3 RETURNING id, is_reconciled, reconciled_date`,
      [bank_statement_date || new Date().toISOString().slice(0, 10), (req as any).user?.name || "admin", id]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to reconcile" });
  }
});

router.post("/bank-reconciliation/:id/unreconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const row = await q1(
      `UPDATE payment_transactions SET is_reconciled=false, reconciled_date=NULL, reconciled_by=NULL WHERE id=$1 RETURNING id, is_reconciled`,
      [id]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to unreconcile" });
  }
});

// Bulk reconcile
router.post("/bank-reconciliation/bulk-reconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { ids, bank_statement_date } = req.body;
    if (!ids?.length) return res.status(400).json({ error: "ids required" });
    await pool.query(
      `UPDATE payment_transactions SET is_reconciled=true, reconciled_date=$1, reconciled_by=$2 WHERE id = ANY($3)`,
      [bank_statement_date || new Date().toISOString().slice(0, 10), (req as any).user?.name || "admin", ids]
    );
    res.json({ updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Bulk reconcile failed" });
  }
});

// ── CASH FLOW STATEMENT ────────────────────────────────────────────────────

router.get("/cash-flow", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);

    // Operating: Collections from customers
    const [collections] = await q(
      `SELECT COALESCE(SUM(pt.amount::numeric), 0) AS total
       FROM payment_transactions pt WHERE pt.is_deleted=false AND pt.payment_date::text BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    );

    // Operating: Payments to suppliers (expenses by category)
    const expensesByCategory = await q(
      `SELECT category, COALESCE(SUM(amount::numeric), 0) AS total
       FROM expenses WHERE date BETWEEN $1 AND $2 GROUP BY category ORDER BY category`,
      [dateFrom, dateTo]
    );

    // Non-operating expenses (salary as separate line)
    const [salaryExp] = await q(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM expenses WHERE category='salary' AND date BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    );
    const [officeExp] = await q(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM expenses WHERE category IN ('office','marketing') AND date BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    );

    const totalCollections = Number(collections?.total || 0);
    const totalOperatingExpenses = expensesByCategory
      .filter(e => !["salary"].includes(e.category))
      .reduce((s, e) => s + Number(e.total), 0);
    const totalSalary = Number(salaryExp?.total || 0);
    const netOperating = totalCollections - totalOperatingExpenses - totalSalary;

    res.json({
      period: { from: dateFrom, to: dateTo },
      operating: {
        inflows: [
          { label: "Collections from Customers", amount: totalCollections },
        ],
        outflows: [
          ...expensesByCategory
            .filter(e => !["salary"].includes(e.category))
            .map(e => ({ label: `${e.category.charAt(0).toUpperCase() + e.category.slice(1)} Expenses`, amount: -Number(e.total), category: e.category })),
          ...(totalSalary > 0 ? [{ label: "Salaries Paid", amount: -totalSalary, category: "salary" }] : []),
        ],
        net: netOperating,
      },
      investing: {
        inflows: [],
        outflows: [],
        net: 0,
      },
      financing: {
        inflows: [],
        outflows: [],
        net: 0,
      },
      netCashChange: netOperating,
    });
  } catch (err) {
    console.error("[accounting] cash-flow:", err);
    res.status(500).json({ error: "Failed to generate cash flow" });
  }
});

// ── EXISTING ENDPOINTS (kept from original) ────────────────────────────────

router.get("/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    const rows = await q(`
      SELECT b.id AS booking_id, b.booking_number,
        COALESCE(u.name, u.mobile) AS customer_name, u.mobile,
        b.group_name,
        b.final_amount::numeric AS debit,
        COALESCE(b.paid_amount::numeric, 0) AS credit,
        GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric, 0), 0) AS balance,
        b.status, b.created_at
      FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL
        ${search ? `AND (u.name ILIKE '%' || $1 || '%' OR u.mobile ILIKE '%' || $1 || '%' OR b.booking_number ILIKE '%' || $1 || '%')` : ""}
      ORDER BY b.created_at DESC LIMIT 500
    `, search ? [search] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

router.get("/cashbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, type } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const cashIn = type !== "out" ? await q(`
      SELECT pt.payment_date::text AS date, 'receipt' AS type,
        COALESCE(u.name, u.mobile) AS party, 'Customer Payment' AS narration,
        b.booking_number AS reference, pt.payment_mode AS mode,
        pt.amount::numeric AS amount, 0 AS expense, pt.amount::numeric AS cash_in
      FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id JOIN users u ON u.id=b.user_id
      WHERE pt.payment_mode='cash' AND pt.is_deleted=false
        AND pt.payment_date::text >= $1 AND pt.payment_date::text <= $2
    `, [dateFrom, dateTo]) : [];
    const cashOut = type !== "in" ? await q(`
      SELECT e.date, 'payment' AS type, COALESCE(e.vendor,'N/A') AS party,
        e.description AS narration, COALESCE(e.invoice_number,'') AS reference,
        e.payment_method AS mode, e.amount::numeric AS amount, e.amount::numeric AS expense, 0 AS cash_in
      FROM expenses e WHERE e.payment_method='cash' AND e.date >= $1 AND e.date <= $2
    `, [dateFrom, dateTo]) : [];
    const combined = [...cashIn, ...cashOut].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let balance = 0;
    const withBalance = combined.map(row => {
      balance += Number(row.cash_in || 0) - Number(row.expense || 0);
      return { ...row, running_balance: balance };
    });
    res.json({ rows: withBalance, summary: { totalIn: cashIn.reduce((s, r) => s + Number(r.amount || 0), 0), totalOut: cashOut.reduce((s, r) => s + Number(r.amount || 0), 0), netBalance: balance } });
  } catch (err) { res.status(500).json({ error: "Failed to fetch cash book" }); }
});

router.get("/bankbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const bankModes = ["neft", "bank", "cheque", "rtgs", "imps", "upi", "online", "card"];
    const bankIn = await q(`
      SELECT pt.payment_date::text AS date, 'receipt' AS type,
        COALESCE(u.name, u.mobile) AS party, b.booking_number AS reference,
        pt.payment_mode AS mode, COALESCE(pt.bank_name,'') AS bank_name,
        COALESCE(pt.reference_number,'') AS ref_number,
        pt.amount::numeric AS amount, 0 AS expense, pt.amount::numeric AS bank_in
      FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id JOIN users u ON u.id=b.user_id
      WHERE pt.payment_mode = ANY($1) AND pt.is_deleted=false
        AND pt.payment_date::text >= $2 AND pt.payment_date::text <= $3
    `, [bankModes, dateFrom, dateTo]);
    const bankOut = await q(`
      SELECT e.date, 'payment' AS type, COALESCE(e.vendor,'N/A') AS party,
        COALESCE(e.invoice_number,'') AS reference, e.payment_method AS mode,
        '' AS bank_name, '' AS ref_number,
        e.amount::numeric AS amount, e.amount::numeric AS expense, 0 AS bank_in
      FROM expenses e WHERE e.payment_method = ANY($1) AND e.date >= $2 AND e.date <= $3
    `, [["bank", "cheque", "neft", "rtgs", "imps", "upi", "online", "card"], dateFrom, dateTo]);
    const combined = [...bankIn, ...bankOut].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let balance = 0;
    const withBalance = combined.map(row => {
      balance += Number(row.bank_in || 0) - Number(row.expense || 0);
      return { ...row, running_balance: balance };
    });
    res.json({ rows: withBalance, summary: { totalIn: bankIn.reduce((s, r) => s + Number(r.amount || 0), 0), totalOut: bankOut.reduce((s, r) => s + Number(r.amount || 0), 0), netBalance: balance } });
  } catch (err) { res.status(500).json({ error: "Failed to fetch bank book" }); }
});

router.get("/journal", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const receipts = await q(`
      SELECT pt.payment_date::text AS date, b.booking_number AS reference,
        COALESCE(u.name,u.mobile) AS party, 'Customer Receipt' AS account_dr,
        'Sales / Revenue' AS account_cr, pt.amount::numeric AS debit, pt.amount::numeric AS credit,
        pt.payment_mode AS narration, 'receipt' AS entry_type
      FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id JOIN users u ON u.id=b.user_id
      WHERE pt.is_deleted=false AND pt.payment_date::text >= $1 AND pt.payment_date::text <= $2
    `, [dateFrom, dateTo]);
    const expenses = await q(`
      SELECT e.date, COALESCE(e.invoice_number,e.id) AS reference, COALESCE(e.vendor,'N/A') AS party,
        e.category AS account_dr, 'Cash / Bank' AS account_cr,
        e.amount::numeric AS debit, e.amount::numeric AS credit, e.description AS narration, 'expense' AS entry_type
      FROM expenses e WHERE e.date >= $1 AND e.date <= $2
    `, [dateFrom, dateTo]);
    const combined = [...receipts, ...expenses].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    res.json(combined);
  } catch (err) { res.status(500).json({ error: "Failed to fetch journal" }); }
});

router.get("/payment-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, mode } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const rows = await q(`
      SELECT pt.id, pt.payment_date::text AS date, b.booking_number,
        COALESCE(u.name,u.mobile) AS customer_name, u.mobile, b.group_name,
        pt.payment_mode AS mode, COALESCE(pt.reference_number,'') AS reference,
        COALESCE(pt.bank_name,'') AS bank_name, COALESCE(pt.received_by,'') AS received_by,
        pt.amount::numeric AS amount, pt.is_reconciled, pt.created_at
      FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id JOIN users u ON u.id=b.user_id
      WHERE pt.is_deleted=false AND pt.payment_date::text >= $1 AND pt.payment_date::text <= $2
        ${mode && mode !== "all" ? "AND pt.payment_mode = $3" : ""}
      ORDER BY pt.payment_date DESC, pt.created_at DESC
    `, mode && mode !== "all" ? [dateFrom, dateTo, mode] : [dateFrom, dateTo]);
    res.json({ rows, total: rows.reduce((s, r) => s + Number(r.amount || 0), 0) });
  } catch (err) { res.status(500).json({ error: "Failed to fetch payment entries" }); }
});

router.get("/outstanding", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    const rows = await q(`
      SELECT b.id AS booking_id, b.booking_number,
        COALESCE(u.name,u.mobile) AS customer_name, u.mobile, b.group_name,
        b.final_amount::numeric AS total_amount, COALESCE(b.paid_amount::numeric,0) AS paid_amount,
        GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) AS outstanding,
        b.status, b.created_at
      FROM bookings b JOIN users u ON u.id=b.user_id
      WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL
        AND b.final_amount::numeric > COALESCE(b.paid_amount::numeric,0)
        ${search ? `AND (u.name ILIKE '%'||$1||'%' OR u.mobile ILIKE '%'||$1||'%')` : ""}
      ORDER BY outstanding DESC
    `, search ? [search] : []);
    res.json({ rows, total: rows.reduce((s, r) => s + Number(r.outstanding || 0), 0), count: rows.length });
  } catch (err) { res.status(500).json({ error: "Failed to fetch outstanding" }); }
});

router.get("/pl", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const [rev] = await q(`SELECT COALESCE(SUM(pt.amount::numeric),0) AS total_revenue, COUNT(DISTINCT b.id) AS booking_count FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id WHERE pt.is_deleted=false AND pt.payment_date::text BETWEEN $1 AND $2`, [dateFrom, dateTo]);
    const byMonth = await q(`SELECT to_char(pt.payment_date,'YYYY-MM') AS month, COALESCE(SUM(pt.amount::numeric),0) AS amount FROM payment_transactions pt WHERE pt.is_deleted=false AND pt.payment_date::text BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [dateFrom, dateTo]);
    const expCats = await q(`SELECT category, COALESCE(SUM(amount::numeric),0) AS total FROM expenses WHERE date BETWEEN $1 AND $2 GROUP BY category ORDER BY total DESC`, [dateFrom, dateTo]);
    const expByMonth = await q(`SELECT substring(date FROM 1 FOR 7) AS month, COALESCE(SUM(amount::numeric),0) AS amount FROM expenses WHERE date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [dateFrom, dateTo]);
    const totalRevenue = Number(rev?.total_revenue || 0);
    const totalExpenses = expCats.reduce((s, r) => s + Number(r.total || 0), 0);
    res.json({ period: { from: dateFrom, to: dateTo }, revenue: { total: totalRevenue, bookingCount: Number(rev?.booking_count || 0), byMonth: byMonth.map(r => ({ month: r.month, amount: Number(r.amount) })) }, expenses: { total: totalExpenses, byCategory: expCats.map(r => ({ category: r.category, total: Number(r.total) })), byMonth: expByMonth.map(r => ({ month: r.month, amount: Number(r.amount) })) }, grossProfit: totalRevenue - totalExpenses, netProfit: totalRevenue - totalExpenses });
  } catch (err) { res.status(500).json({ error: "Failed to generate P&L" }); }
});

router.get("/balance-sheet", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
    const [receipts] = await q(`SELECT COALESCE(SUM(CASE WHEN pt.payment_mode='cash' THEN pt.amount::numeric ELSE 0 END),0) AS cash, COALESCE(SUM(CASE WHEN pt.payment_mode!='cash' THEN pt.amount::numeric ELSE 0 END),0) AS bank FROM payment_transactions pt WHERE pt.is_deleted=false AND pt.payment_date::text<=$1`, [asOf]);
    const [outstanding] = await q(`SELECT COALESCE(SUM(GREATEST(b.final_amount::numeric-COALESCE(b.paid_amount::numeric,0),0)),0) AS receivables FROM bookings b WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL AND b.created_at::text<=$1`, [asOf + "T23:59:59Z"]);
    const [expTotal] = await q(`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM expenses WHERE date<=$1`, [asOf]);
    const cashAsset = Number(receipts?.cash || 0);
    const bankAsset = Number(receipts?.bank || 0);
    const receivables = Number(outstanding?.receivables || 0);
    const expensePaid = Number(expTotal?.total || 0);
    const totalAssets = cashAsset + bankAsset + receivables;
    res.json({ asOf, assets: { cash: cashAsset, bank: bankAsset, accountsReceivable: receivables, total: totalAssets }, liabilities: { expensesPaid: expensePaid, total: expensePaid }, equity: totalAssets - expensePaid });
  } catch (err) { res.status(500).json({ error: "Failed to generate balance sheet" }); }
});

router.get("/trial-balance", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);
    const [rev] = await q(`SELECT COALESCE(SUM(pt.amount::numeric),0) AS total FROM payment_transactions pt WHERE pt.is_deleted=false AND pt.payment_date::text BETWEEN $1 AND $2`, [dateFrom, dateTo]);
    const expCats = await q(`SELECT category, COALESCE(SUM(amount::numeric),0) AS total FROM expenses WHERE date BETWEEN $1 AND $2 GROUP BY category ORDER BY category`, [dateFrom, dateTo]);
    const [outstd] = await q(`SELECT COALESCE(SUM(GREATEST(b.final_amount::numeric-COALESCE(b.paid_amount::numeric,0),0)),0) AS total FROM bookings b WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL`, []);
    const totalRevenue = Number(rev?.total || 0);
    const debtors = Number(outstd?.total || 0);
    const allEntries = [
      ...expCats.map(r => ({ account: `Expense - ${r.category}`, debit: Number(r.total), credit: 0 })),
      { account: "Accounts Receivable (Debtors)", debit: debtors, credit: 0 },
      { account: "Sales Revenue", debit: 0, credit: totalRevenue },
    ];
    const totalDebit = allEntries.reduce((s, r) => s + r.debit, 0);
    const totalCredit = allEntries.reduce((s, r) => s + r.credit, 0);
    res.json({ period: { from: dateFrom, to: dateTo }, entries: allEntries, totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 } });
  } catch (err) { res.status(500).json({ error: "Failed to generate trial balance" }); }
});

export default router;
