import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { syncAllJournalEntries } from "../lib/journalHelper.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  const r = await pool.query(text, params);
  return r.rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// ── CHART OF ACCOUNTS CRUD ──────────────────────────────────────────────────

router.get("/accounts", requireAdmin as any, async (_req, res) => {
  try { res.json(await q(`SELECT * FROM accounts ORDER BY code`)); }
  catch (err) { res.status(500).json({ error: "Failed to fetch accounts" }); }
});

router.post("/accounts", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { code, name, type, sub_type, parent_id, opening_balance, description } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });
    const row = await q1(
      `INSERT INTO accounts (id,code,name,type,sub_type,parent_id,opening_balance,description,is_system)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,false) RETURNING *`,
      [code, name, type, sub_type || null, parent_id || null, opening_balance || 0, description || null]
    );
    res.json(row);
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "Account code already exists" });
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.put("/accounts/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, sub_type, opening_balance, description, is_active } = req.body;
    const row = await q1(
      `UPDATE accounts SET name=$1,sub_type=$2,opening_balance=$3,description=$4,is_active=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, sub_type || null, opening_balance || 0, description || null, is_active !== false, id]
    );
    if (!row) return res.status(404).json({ error: "Account not found" });
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to update account" }); }
});

router.delete("/accounts/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const acct = await q1(`SELECT is_system FROM accounts WHERE id=$1`, [req.params.id]);
    if (!acct) return res.status(404).json({ error: "Account not found" });
    if (acct.is_system) return res.status(400).json({ error: "Cannot delete system account" });
    await pool.query(`DELETE FROM accounts WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete account" }); }
});

// ── GENERAL LEDGER (per account, driven by journal tables) ──────────────────

router.get("/accounts/:id/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { from, to, fy_id } = req.query as Record<string, string>;
    const account = await q1(`SELECT * FROM accounts WHERE id=$1`, [id]);
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Resolve opening balance: check per-FY table first
    const fyId = fy_id || (await q1(`SELECT id FROM financial_years WHERE is_active=true LIMIT 1`))?.id;
    const fyOb = fyId ? await q1(
      `SELECT opening_balance FROM account_opening_balances WHERE account_id=$1 AND financial_year_id=$2 LIMIT 1`,
      [id, fyId]
    ) : null;
    const baseOb = Number(fyOb?.opening_balance ?? account.opening_balance ?? 0);

    // Opening balance adjustment: journal entries BEFORE 'from' date
    const preAdj = from ? await q1(
      `SELECT COALESCE(SUM(jel.debit),0)::numeric AS dr, COALESCE(SUM(jel.credit),0)::numeric AS cr
       FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE jel.account_id=$1 AND je.date < $2`,
      [id, from]
    ) : null;
    const openingBal = baseOb + (preAdj ? Number(preAdj.dr) - Number(preAdj.cr) : 0);

    // Period lines
    const params: any[] = [id];
    let dateClause = "";
    if (from && to) { params.push(from, to); dateClause = "AND je.date BETWEEN $2 AND $3"; }
    else if (from) { params.push(from); dateClause = "AND je.date >= $2"; }
    else if (to) { params.push(to); dateClause = "AND je.date <= $2"; }

    const lines = await q(`
      SELECT je.date, je.entry_number, je.narration AS je_narration, je.reference, je.source,
             jel.debit::numeric AS debit, jel.credit::numeric AS credit, jel.narration AS line_narration
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id
      WHERE jel.account_id=$1 ${dateClause}
      ORDER BY je.date, je.created_at
    `, params);

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
  try { res.json(await q(`SELECT * FROM financial_years ORDER BY start_date DESC`)); }
  catch (err) { res.status(500).json({ error: "Failed to fetch financial years" }); }
});

router.post("/financial-years", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, start_date, end_date } = req.body;
    if (!name || !start_date || !end_date) return res.status(400).json({ error: "name, start_date, end_date required" });
    const row = await q1(
      `INSERT INTO financial_years (id,name,start_date,end_date,is_active)
       VALUES (gen_random_uuid()::text,$1,$2,$3,false) RETURNING *`,
      [name, start_date, end_date]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to create financial year" }); }
});

router.put("/financial-years/:id/activate", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`UPDATE financial_years SET is_active=false`);
    const row = await q1(`UPDATE financial_years SET is_active=true WHERE id=$1 RETURNING *`, [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to activate financial year" }); }
});

router.put("/financial-years/:id/close", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const row = await q1(`UPDATE financial_years SET is_closed=true,is_active=false WHERE id=$1 RETURNING *`, [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to close financial year" }); }
});

// ── PER-ACCOUNT PER-FY OPENING BALANCES ────────────────────────────────────

router.get("/opening-balances", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { fy_id } = req.query as Record<string, string>;
    const fyId = fy_id || (await q1(`SELECT id FROM financial_years WHERE is_active=true LIMIT 1`))?.id;
    if (!fyId) return res.status(400).json({ error: "No active financial year found" });
    const rows = await q(`
      SELECT a.id AS account_id, a.code, a.name, a.type, a.sub_type,
        COALESCE(ob.opening_balance, a.opening_balance, 0)::numeric AS opening_balance,
        ob.notes
      FROM accounts a
      LEFT JOIN account_opening_balances ob ON ob.account_id=a.id AND ob.financial_year_id=$1
      WHERE a.is_active=true
      ORDER BY a.code
    `, [fyId]);
    res.json({ fy_id: fyId, rows });
  } catch (err) { res.status(500).json({ error: "Failed to fetch opening balances" }); }
});

router.post("/opening-balances/bulk-save", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { fy_id, balances } = req.body;
    if (!fy_id || !balances?.length) return res.status(400).json({ error: "fy_id and balances required" });
    let saved = 0;
    for (const b of balances) {
      await pool.query(
        `INSERT INTO account_opening_balances (id,account_id,financial_year_id,opening_balance,notes)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4)
         ON CONFLICT (account_id,financial_year_id)
         DO UPDATE SET opening_balance=$3,notes=$4,updated_at=NOW()`,
        [b.account_id, fy_id, Number(b.opening_balance) || 0, b.notes || null]
      );
      saved++;
    }
    res.json({ saved });
  } catch (err) { res.status(500).json({ error: "Failed to save opening balances" }); }
});

// ── JOURNAL ENTRIES ────────────────────────────────────────────────────────

router.get("/journal-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, source } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const params: any[] = [from || d30, to || today];
    if (source && source !== "all") params.push(source);
    const entries = await q(`
      SELECT je.*,
        json_agg(json_build_object(
          'id',jel.id,'account_id',jel.account_id,'account_name',a.name,'account_code',a.code,
          'debit',jel.debit::numeric,'credit',jel.credit::numeric,'narration',jel.narration
        ) ORDER BY jel.debit DESC) AS lines,
        SUM(jel.debit)::numeric AS total_debit, SUM(jel.credit)::numeric AS total_credit
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
      LEFT JOIN accounts a ON a.id=jel.account_id
      WHERE je.date BETWEEN $1 AND $2
        ${source && source !== "all" ? "AND je.source=$3" : ""}
      GROUP BY je.id ORDER BY je.date DESC, je.created_at DESC
    `, params);
    res.json(entries);
  } catch (err) { res.status(500).json({ error: "Failed to fetch journal entries" }); }
});

router.post("/journal-entries", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { date, narration, reference, lines, financial_year_id } = req.body;
    if (!date || !narration || !lines?.length) return res.status(400).json({ error: "date, narration, lines required" });
    const totalDr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const totalCr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.01) return res.status(400).json({ error: `Unbalanced: Dr ${totalDr} ≠ Cr ${totalCr}` });
    const count = await q1(`SELECT COUNT(*) FROM journal_entries WHERE source='manual'`);
    const entryNum = `JV-${String(parseInt(count?.count || "0") + 1).padStart(5, "0")}`;
    const entry = await q1(
      `INSERT INTO journal_entries (id,entry_number,date,narration,reference,source,financial_year_id,created_by)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'manual',$5,$6) RETURNING *`,
      [entryNum, date, narration, reference || null, financial_year_id || null, (req as any).user?.id || "admin"]
    );
    for (const line of lines) {
      await pool.query(
        `INSERT INTO journal_entry_lines (id,journal_entry_id,account_id,debit,credit,narration)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5)`,
        [entry.id, line.account_id, Number(line.debit || 0), Number(line.credit || 0), line.narration || null]
      );
    }
    res.json({ ...entry, lines });
  } catch (err) { res.status(500).json({ error: "Failed to create journal entry" }); }
});

router.post("/journal-entries/sync", requireAdmin as any, async (_req, res) => {
  try {
    const result = await syncAllJournalEntries();
    res.json({ synced: result.payments + result.expenses, ...result });
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// ── CASHBOOK — from journal_entry_lines for Cash account (1001) ────────────

router.get("/cashbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const cashAcct = await q1(`SELECT id FROM accounts WHERE code='1001' LIMIT 1`);
    if (!cashAcct?.id) {
      return res.json({ rows: [], summary: { totalIn: 0, totalOut: 0, netBalance: 0 }, hint: "Accounts not seeded. Run journal sync." });
    }

    const rows = await q(`
      SELECT je.date, je.entry_number, je.narration, je.reference, je.source,
        jel.debit::numeric AS cash_in, jel.credit::numeric AS expense,
        CASE WHEN jel.debit > 0 THEN 'receipt' ELSE 'payment' END AS type
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id
      WHERE jel.account_id=$1 AND je.date BETWEEN $2 AND $3
      ORDER BY je.date, je.created_at
    `, [cashAcct.id, dateFrom, dateTo]);

    let balance = 0;
    const withBalance = rows.map(r => {
      balance += Number(r.cash_in) - Number(r.expense);
      return { ...r, running_balance: balance, mode: r.source, party: r.narration };
    });
    const totalIn = rows.reduce((s, r) => s + Number(r.cash_in), 0);
    const totalOut = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json({ rows: withBalance, summary: { totalIn, totalOut, netBalance: balance } });
  } catch (err) {
    console.error("[accounting] cashbook:", err);
    res.status(500).json({ error: "Failed to fetch cash book" });
  }
});

// ── BANKBOOK — from journal_entry_lines for Bank account (1002) ────────────

router.get("/bankbook", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const bankAcct = await q1(`SELECT id FROM accounts WHERE code='1002' LIMIT 1`);
    if (!bankAcct?.id) {
      return res.json({ rows: [], summary: { totalIn: 0, totalOut: 0, netBalance: 0 }, hint: "Accounts not seeded. Run journal sync." });
    }

    const rows = await q(`
      SELECT je.date, je.entry_number, je.narration, je.reference, je.source,
        jel.debit::numeric AS bank_in, jel.credit::numeric AS expense,
        CASE WHEN jel.debit > 0 THEN 'receipt' ELSE 'payment' END AS type
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id
      WHERE jel.account_id=$1 AND je.date BETWEEN $2 AND $3
      ORDER BY je.date, je.created_at
    `, [bankAcct.id, dateFrom, dateTo]);

    let balance = 0;
    const withBalance = rows.map(r => {
      balance += Number(r.bank_in) - Number(r.expense);
      return { ...r, running_balance: balance, mode: r.source, party: r.narration };
    });
    const totalIn = rows.reduce((s, r) => s + Number(r.bank_in), 0);
    const totalOut = rows.reduce((s, r) => s + Number(r.expense), 0);
    res.json({ rows: withBalance, summary: { totalIn, totalOut, netBalance: balance } });
  } catch (err) {
    console.error("[accounting] bankbook:", err);
    res.status(500).json({ error: "Failed to fetch bank book" });
  }
});

// ── JOURNAL — from journal_entries + journal_entry_lines ──────────────────

router.get("/journal", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const entries = await q(`
      SELECT je.date, je.entry_number AS reference, je.narration, je.source AS entry_type,
        MAX(CASE WHEN jel.debit > 0 THEN a.name END) AS account_dr,
        MAX(CASE WHEN jel.credit > 0 THEN a.name END) AS account_cr,
        MAX(CASE WHEN jel.debit > 0 THEN a.code END) AS code_dr,
        MAX(CASE WHEN jel.credit > 0 THEN a.code END) AS code_cr,
        SUM(jel.debit)::numeric AS debit,
        SUM(jel.credit)::numeric AS credit,
        '' AS party
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
      JOIN accounts a ON a.id=jel.account_id
      WHERE je.date BETWEEN $1 AND $2
      GROUP BY je.id, je.date, je.entry_number, je.narration, je.source
      ORDER BY je.date, je.created_at
    `, [dateFrom, dateTo]);
    res.json(entries);
  } catch (err) {
    console.error("[accounting] journal:", err);
    res.status(500).json({ error: "Failed to fetch journal" });
  }
});

// ── PAYMENT ENTRIES ────────────────────────────────────────────────────────

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
      WHERE pt.is_deleted=false AND pt.payment_date::text BETWEEN $1 AND $2
        ${mode && mode !== "all" ? "AND pt.payment_mode=$3" : ""}
      ORDER BY pt.payment_date DESC, pt.created_at DESC
    `, mode && mode !== "all" ? [dateFrom, dateTo, mode] : [dateFrom, dateTo]);
    res.json({ rows, total: rows.reduce((s, r) => s + Number(r.amount || 0), 0) });
  } catch (err) { res.status(500).json({ error: "Failed to fetch payment entries" }); }
});

// ── OUTSTANDING ────────────────────────────────────────────────────────────

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

// ── CUSTOMER LEDGER ────────────────────────────────────────────────────────

router.get("/ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    const rows = await q(`
      SELECT b.id AS booking_id, b.booking_number,
        COALESCE(u.name,u.mobile) AS customer_name, u.mobile, b.group_name,
        b.final_amount::numeric AS debit, COALESCE(b.paid_amount::numeric,0) AS credit,
        GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) AS balance,
        b.status, b.created_at
      FROM bookings b JOIN users u ON u.id=b.user_id
      WHERE b.deleted_at IS NULL AND b.final_amount IS NOT NULL
        ${search ? `AND (u.name ILIKE '%'||$1||'%' OR u.mobile ILIKE '%'||$1||'%' OR b.booking_number ILIKE '%'||$1||'%')` : ""}
      ORDER BY b.created_at DESC LIMIT 500
    `, search ? [search] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed to fetch ledger" }); }
});

// ── P&L — from journal tables (income/expense accounts) ──────────────────

router.get("/pl", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const incomeRows = await q(`
      SELECT a.code, a.name,
        COALESCE(SUM(jel.credit),0)::numeric AS credit,
        COALESCE(SUM(jel.debit),0)::numeric AS debit
      FROM accounts a
      JOIN journal_entry_lines jel ON jel.account_id=a.id
      JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
      WHERE a.type='income'
      GROUP BY a.id, a.code, a.name ORDER BY a.code
    `, [dateFrom, dateTo]);

    const expenseRows = await q(`
      SELECT a.code, a.name,
        COALESCE(SUM(jel.debit),0)::numeric AS debit,
        COALESCE(SUM(jel.credit),0)::numeric AS credit
      FROM accounts a
      JOIN journal_entry_lines jel ON jel.account_id=a.id
      JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
      WHERE a.type='expense'
      GROUP BY a.id, a.code, a.name ORDER BY a.code
    `, [dateFrom, dateTo]);

    const byMonth = await q(`
      SELECT je.date AS month_key, SUM(jel.credit)::numeric AS amount
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
      JOIN accounts a ON a.id=jel.account_id AND a.type='income'
      GROUP BY je.date ORDER BY je.date
    `, [dateFrom, dateTo]);

    const totalRevenue = incomeRows.reduce((s, r) => s + Number(r.credit) - Number(r.debit), 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0);

    res.json({
      period: { from: dateFrom, to: dateTo },
      revenue: {
        total: totalRevenue,
        byAccount: incomeRows.map(r => ({ name: r.name, code: r.code, total: Number(r.credit) - Number(r.debit) })),
        byMonth: byMonth.map(r => ({ month: r.month_key?.slice?.(0,7) || "", amount: Number(r.amount) })),
      },
      expenses: {
        total: totalExpenses,
        byCategory: expenseRows.map(r => ({ category: r.name, code: r.code, total: Number(r.debit) - Number(r.credit) })),
        byMonth: [],
      },
      grossProfit: totalRevenue - totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    });
  } catch (err) {
    console.error("[accounting] pl:", err);
    res.status(500).json({ error: "Failed to generate P&L" });
  }
});

// ── BALANCE SHEET — from journal tables ────────────────────────────────────

router.get("/balance-sheet", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);

    const accts = await q(`
      WITH period_mv AS (
        SELECT jel.account_id,
          COALESCE(SUM(jel.debit),0)::numeric AS total_dr,
          COALESCE(SUM(jel.credit),0)::numeric AS total_cr
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date <= $1
        GROUP BY jel.account_id
      )
      SELECT a.code, a.name, a.type, a.sub_type,
        COALESCE(ob.opening_balance, a.opening_balance, 0)::numeric AS opening_bal,
        COALESCE(pm.total_dr, 0)::numeric AS total_dr,
        COALESCE(pm.total_cr, 0)::numeric AS total_cr
      FROM accounts a
      LEFT JOIN account_opening_balances ob ON ob.account_id=a.id
        AND ob.financial_year_id=(SELECT id FROM financial_years WHERE is_active=true LIMIT 1)
      LEFT JOIN period_mv pm ON pm.account_id=a.id
      WHERE a.is_active=true
      ORDER BY a.code
    `, [asOf]);

    function getBalance(a: any, drNormal: boolean) {
      return drNormal
        ? Number(a.opening_bal) + Number(a.total_dr) - Number(a.total_cr)
        : Number(a.opening_bal) + Number(a.total_cr) - Number(a.total_dr);
    }

    const assets = accts.filter(a => a.type === "asset").map(a => ({ ...a, balance: getBalance(a, true) }));
    const liabilities = accts.filter(a => a.type === "liability").map(a => ({ ...a, balance: getBalance(a, false) }));
    const equityAccts = accts.filter(a => a.type === "equity").map(a => ({ ...a, balance: getBalance(a, false) }));
    const incomeNet = accts.filter(a => a.type === "income").reduce((s, a) => s + Number(a.total_cr) - Number(a.total_dr), 0);
    const expenseNet = accts.filter(a => a.type === "expense").reduce((s, a) => s + Number(a.total_dr) - Number(a.total_cr), 0);
    const netIncome = incomeNet - expenseNet;

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equityAccts.reduce((s, a) => s + a.balance, 0) + netIncome;

    res.json({
      asOf,
      assets: {
        cash: assets.find(a => a.code === "1001")?.balance || 0,
        bank: assets.find(a => a.code === "1002")?.balance || 0,
        accountsReceivable: assets.find(a => a.code === "1003")?.balance || 0,
        items: assets.map(a => ({ name: a.name, sub_type: a.sub_type, balance: a.balance })),
        total: totalAssets,
      },
      liabilities: {
        items: liabilities.map(a => ({ name: a.name, balance: a.balance })),
        total: totalLiabilities,
      },
      equity: {
        items: equityAccts.map(a => ({ name: a.name, balance: a.balance })),
        netIncome,
        total: totalEquity,
      },
    });
  } catch (err) {
    console.error("[accounting] balance-sheet:", err);
    res.status(500).json({ error: "Failed to generate balance sheet" });
  }
});

// ── TRIAL BALANCE — from journal tables ────────────────────────────────────

router.get("/trial-balance", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);

    const rows = await q(`
      WITH period_mv AS (
        SELECT jel.account_id,
          COALESCE(SUM(jel.debit),0)::numeric AS period_debit,
          COALESCE(SUM(jel.credit),0)::numeric AS period_credit
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id=jel.journal_entry_id
        WHERE je.date BETWEEN $1 AND $2
        GROUP BY jel.account_id
      )
      SELECT a.code, a.name, a.type, a.sub_type,
        COALESCE(ob.opening_balance, a.opening_balance, 0)::numeric AS opening_bal,
        COALESCE(pm.period_debit,0) AS period_debit,
        COALESCE(pm.period_credit,0) AS period_credit
      FROM accounts a
      LEFT JOIN account_opening_balances ob ON ob.account_id=a.id
        AND ob.financial_year_id=(SELECT id FROM financial_years WHERE is_active=true LIMIT 1)
      LEFT JOIN period_mv pm ON pm.account_id=a.id
      WHERE a.is_active=true
        AND (COALESCE(ob.opening_balance, a.opening_balance, 0) != 0
          OR COALESCE(pm.period_debit,0) != 0
          OR COALESCE(pm.period_credit,0) != 0)
      ORDER BY a.code
    `, [dateFrom, dateTo]);

    const entries = rows.map(r => {
      const ob = Number(r.opening_bal);
      const dr = Number(r.period_debit);
      const cr = Number(r.period_credit);
      // Dr-normal: asset, expense → net = ob + dr - cr
      // Cr-normal: liability, equity, income → net = ob + cr - dr
      const drNormal = r.type === "asset" || r.type === "expense";
      const net = drNormal ? ob + dr - cr : ob + cr - dr;
      return {
        account: `${r.code} — ${r.name}`,
        type: r.type,
        opening: ob,
        period_debit: dr,
        period_credit: cr,
        debit: net > 0 && drNormal ? net : (!drNormal && net < 0 ? Math.abs(net) : 0),
        credit: net > 0 && !drNormal ? net : (drNormal && net < 0 ? Math.abs(net) : 0),
      };
    });

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    res.json({ period: { from: dateFrom, to: dateTo }, entries, totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 } });
  } catch (err) {
    console.error("[accounting] trial-balance:", err);
    res.status(500).json({ error: "Failed to generate trial balance" });
  }
});

// ── BANK RECONCILIATION (bank-only transactions) ──────────────────────────

const BANK_MODES = ["neft", "bank", "cheque", "rtgs", "imps", "upi", "online", "card"];

router.get("/bank-reconciliation", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, status } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateFrom = from || d30;
    const dateTo = to || today;

    const rows = await q(`
      SELECT pt.id, pt.payment_date::text AS date, pt.amount::numeric,
        pt.payment_mode AS mode, pt.reference_number, COALESCE(pt.bank_name,'') AS bank_name,
        pt.is_reconciled, pt.reconciled_date, pt.reconciled_by,
        b.booking_number, COALESCE(u.name,u.mobile) AS customer_name
      FROM payment_transactions pt
      JOIN bookings b ON b.id=pt.booking_id JOIN users u ON u.id=b.user_id
      WHERE pt.is_deleted=false
        AND pt.payment_mode = ANY($1)
        AND pt.payment_date::text BETWEEN $2 AND $3
        ${status === "reconciled" ? "AND pt.is_reconciled=true" : status === "unreconciled" ? "AND pt.is_reconciled=false" : ""}
      ORDER BY pt.payment_date DESC
    `, [BANK_MODES, dateFrom, dateTo]);

    const summary = {
      total: rows.reduce((s, r) => s + Number(r.amount), 0),
      reconciled: rows.filter(r => r.is_reconciled).reduce((s, r) => s + Number(r.amount), 0),
      unreconciled: rows.filter(r => !r.is_reconciled).reduce((s, r) => s + Number(r.amount), 0),
      count: rows.length,
      reconciledCount: rows.filter(r => r.is_reconciled).length,
    };
    res.json({ rows, summary });
  } catch (err) { res.status(500).json({ error: "Failed to fetch reconciliation data" }); }
});

router.post("/bank-reconciliation/:id/reconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bank_statement_date } = req.body;
    const row = await q1(
      `UPDATE payment_transactions SET is_reconciled=true,reconciled_date=$1,reconciled_by=$2 WHERE id=$3 RETURNING id,is_reconciled,reconciled_date`,
      [bank_statement_date || new Date().toISOString().slice(0, 10), (req as any).user?.name || "admin", req.params.id]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to reconcile" }); }
});

router.post("/bank-reconciliation/:id/unreconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const row = await q1(`UPDATE payment_transactions SET is_reconciled=false,reconciled_date=NULL,reconciled_by=NULL WHERE id=$1 RETURNING id,is_reconciled`, [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed to unreconcile" }); }
});

router.post("/bank-reconciliation/bulk-reconcile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { ids, bank_statement_date } = req.body;
    if (!ids?.length) return res.status(400).json({ error: "ids required" });
    await pool.query(
      `UPDATE payment_transactions SET is_reconciled=true,reconciled_date=$1,reconciled_by=$2 WHERE id=ANY($3)`,
      [bank_statement_date || new Date().toISOString().slice(0, 10), (req as any).user?.name || "admin", ids]
    );
    res.json({ updated: ids.length });
  } catch (err) { res.status(500).json({ error: "Bulk reconcile failed" }); }
});

// ── CASH FLOW ─────────────────────────────────────────────────────────────

router.get("/cash-flow", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const dateFrom = from || `${fyYear}-04-01`;
    const dateTo = to || new Date().toISOString().slice(0, 10);

    // Operating inflows: movements into Cash/Bank from income accounts
    const [cashIn] = await q(`
      SELECT COALESCE(SUM(jel.debit),0)::numeric AS total
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
      WHERE jel.account_id IN (SELECT id FROM accounts WHERE code IN ('1001','1002'))
        AND jel.debit > 0
    `, [dateFrom, dateTo]);

    // Operating outflows: movements out of Cash/Bank to expense accounts
    const expenseOutflows = await q(`
      SELECT a.name, a.code,
        COALESCE(SUM(jel_exp.debit),0)::numeric AS amount
      FROM accounts a
      JOIN journal_entry_lines jel_exp ON jel_exp.account_id=a.id AND jel_exp.debit > 0
      JOIN journal_entries je ON je.id=jel_exp.journal_entry_id AND je.date BETWEEN $1 AND $2
      WHERE a.type='expense'
      GROUP BY a.id, a.name, a.code
      ORDER BY amount DESC
    `, [dateFrom, dateTo]);

    const totalIn = Number(cashIn?.total || 0);
    const totalOut = expenseOutflows.reduce((s, r) => s + Number(r.amount), 0);
    const netOperating = totalIn - totalOut;

    res.json({
      period: { from: dateFrom, to: dateTo },
      operating: {
        inflows: [{ label: "Collections from Customers", amount: totalIn }],
        outflows: expenseOutflows.map(r => ({ label: r.name, amount: -Number(r.amount), code: r.code })),
        net: netOperating,
      },
      investing: { inflows: [], outflows: [], net: 0 },
      financing: { inflows: [], outflows: [], net: 0 },
      netCashChange: netOperating,
    });
  } catch (err) {
    console.error("[accounting] cash-flow:", err);
    res.status(500).json({ error: "Failed to generate cash flow" });
  }
});

// ── CUSTOMER LEDGER ──────────────────────────────────────────────────────────

router.get("/customer-ledger/search", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { q: query } = req.query as Record<string, string>;
    if (!query || query.trim().length < 2) return res.json([]);
    const term = `%${query.trim()}%`;
    const rows = await q(
      `SELECT u.id, u.mobile, u.name, u.email,
        COUNT(b.id)::int AS booking_count,
        COALESCE(SUM(b.final_amount::numeric),0)::numeric AS total_billed,
        COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS total_paid
       FROM users u
       LEFT JOIN bookings b ON b.customer_mobile=u.mobile AND (b.is_deleted IS NULL OR b.is_deleted=false)
       WHERE u.role='customer' AND (u.mobile ILIKE $1 OR u.name ILIKE $1)
       GROUP BY u.id, u.mobile, u.name, u.email
       ORDER BY u.name
       LIMIT 20`,
      [term]
    );
    res.json(rows);
  } catch (err) {
    console.error("[accounting] customer-ledger/search:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/customer-ledger/:mobile", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { mobile } = req.params;
    const { from, to } = req.query as Record<string, string>;

    const customer = await q1(`SELECT id, mobile, name, email FROM users WHERE mobile=$1 LIMIT 1`, [mobile]);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    let bSql = `SELECT b.id, b.booking_number, b.package_name, b.group_id,
                  b.status, b.final_amount, b.paid_amount, b.advance_amount,
                  b.invoice_number, b.created_at, b.notes, b.preferred_departure_date,
                  b.number_of_pilgrims, b.room_type,
                  g.name AS group_name
               FROM bookings b
               LEFT JOIN hajj_groups g ON g.id=b.group_id
               WHERE b.customer_mobile=$1 AND (b.is_deleted IS NULL OR b.is_deleted=false)`;
    const bParams: any[] = [mobile];
    if (from) { bParams.push(from); bSql += ` AND DATE(b.created_at)>=$${bParams.length}`; }
    if (to)   { bParams.push(to);   bSql += ` AND DATE(b.created_at)<=$${bParams.length}`; }
    bSql += ` ORDER BY b.created_at DESC`;

    const bookings = await q(bSql, bParams);

    const bookingIds = bookings.map((b: any) => b.id);
    let payments: any[] = [];
    if (bookingIds.length > 0) {
      payments = await q(
        `SELECT pt.booking_id, pt.id, pt.amount, pt.mode, pt.payment_date,
                pt.received_by, pt.bank_name, pt.notes, pt.is_deleted
         FROM payment_transactions pt
         WHERE pt.booking_id=ANY($1::text[]) AND (pt.is_deleted IS NULL OR pt.is_deleted=false)
         ORDER BY pt.payment_date ASC`,
        [bookingIds]
      );
    }

    const paymentsByBooking: Record<string, any[]> = {};
    for (const p of payments) {
      if (!paymentsByBooking[p.booking_id]) paymentsByBooking[p.booking_id] = [];
      paymentsByBooking[p.booking_id].push(p);
    }

    const enriched = bookings.map((b: any) => ({
      ...b,
      final_amount: Number(b.final_amount || 0),
      paid_amount: Number(b.paid_amount || 0),
      balance: Math.max(0, Number(b.final_amount || 0) - Number(b.paid_amount || 0)),
      payments: paymentsByBooking[b.id] || [],
    }));

    const totalBilled = enriched.reduce((s: number, b: any) => s + b.final_amount, 0);
    const totalPaid = enriched.reduce((s: number, b: any) => s + b.paid_amount, 0);
    const totalBalance = enriched.reduce((s: number, b: any) => s + b.balance, 0);

    res.json({ customer, bookings: enriched, summary: { totalBilled, totalPaid, totalBalance } });
  } catch (err) {
    console.error("[accounting] customer-ledger/:mobile:", err);
    res.status(500).json({ error: "Failed to fetch customer ledger" });
  }
});

// ── HAJJI PAYMENT LEDGER ─────────────────────────────────────────────────────

router.get("/hajji-ledger/search", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { q: query } = req.query as Record<string, string>;
    if (!query || query.trim().length < 2) return res.json([]);
    const term = `%${query.trim()}%`;
    const rows = await q(
      `SELECT b.id, b.booking_number, b.customer_name, b.customer_mobile,
              b.package_name, b.status, b.final_amount, b.paid_amount, b.created_at
       FROM bookings b
       WHERE (b.is_deleted IS NULL OR b.is_deleted=false)
         AND (b.booking_number ILIKE $1 OR b.customer_name ILIKE $1 OR b.customer_mobile ILIKE $1)
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [term]
    );
    res.json(rows);
  } catch (err) {
    console.error("[accounting] hajji-ledger/search:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/hajji-ledger/:bookingId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await q1(
      `SELECT b.*, g.name AS group_name
       FROM bookings b
       LEFT JOIN hajj_groups g ON g.id=b.group_id
       WHERE b.id=$1 AND (b.is_deleted IS NULL OR b.is_deleted=false)`,
      [bookingId]
    );
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const payments = await q(
      `SELECT pt.id, pt.amount, pt.mode, pt.payment_date, pt.received_by,
              pt.bank_name, pt.notes, pt.invoice_number, pt.is_deleted
       FROM payment_transactions pt
       WHERE pt.booking_id=$1 AND (pt.is_deleted IS NULL OR pt.is_deleted=false)
       ORDER BY pt.payment_date ASC, pt.created_at ASC`,
      [bookingId]
    );

    const pilgrims = await q(
      `SELECT id, name, mobile, passport_number, barcode_id
       FROM pilgrims WHERE booking_id=$1 ORDER BY name`,
      [bookingId]
    );

    const finalAmount = Number(booking.final_amount || 0);
    const paidAmount = Number(booking.paid_amount || 0);
    const balance = Math.max(0, finalAmount - paidAmount);

    // Build running balance statement
    let running = 0;
    const statement = payments.map((p: any) => {
      running += Number(p.amount || 0);
      return {
        ...p,
        amount: Number(p.amount),
        running_balance: running,
        balance_remaining: Math.max(0, finalAmount - running),
      };
    });

    const modeBreakdown: Record<string, number> = {};
    for (const p of payments) {
      const mode = p.mode || "cash";
      modeBreakdown[mode] = (modeBreakdown[mode] || 0) + Number(p.amount || 0);
    }

    res.json({
      booking: { ...booking, final_amount: finalAmount, paid_amount: paidAmount, balance },
      statement,
      pilgrims,
      summary: {
        totalInstallments: payments.length,
        totalPaid: paidAmount,
        totalBilled: finalAmount,
        balance,
        modeBreakdown,
      },
    });
  } catch (err) {
    console.error("[accounting] hajji-ledger/:bookingId:", err);
    res.status(500).json({ error: "Failed to fetch hajji ledger" });
  }
});

export default router;
