// @ts-nocheck
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

// ── GET /api/finance-reports/dashboard ───────────────────────────────────────
// Real-time financial KPIs for the analytics dashboard
router.get("/dashboard", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const firstOfMonth = today.slice(0, 8) + "01";
    const firstOfYear = today.slice(0, 5) + "01-01";

    const [todayStats, monthStats, yearStats, outstanding, cashBank, agentStats, branchStats, bookingStatus] = await Promise.all([
      // Today's revenue + bookings
      q1(`
        SELECT
          COALESCE(SUM(pt.amount::numeric),0) AS revenue,
          COUNT(DISTINCT pt.booking_id)::int AS payment_count
        FROM payment_transactions pt WHERE pt.payment_date::date = CURRENT_DATE AND pt.is_deleted=false
      `),
      // This month
      q1(`
        SELECT
          COALESCE(SUM(pt.amount::numeric),0) AS revenue,
          COUNT(DISTINCT b.id)::int AS bookings
        FROM payment_transactions pt
        JOIN bookings b ON b.id=pt.booking_id
        WHERE pt.payment_date >= $1 AND pt.is_deleted=false`, [firstOfMonth]),
      // This year
      q1(`
        SELECT
          COALESCE(SUM(pt.amount::numeric),0) AS revenue,
          COUNT(DISTINCT b.id)::int AS bookings
        FROM payment_transactions pt
        JOIN bookings b ON b.id=pt.booking_id
        WHERE pt.payment_date >= $1 AND pt.is_deleted=false`, [firstOfYear]),
      // Outstanding receivables
      q1(`
        SELECT COALESCE(SUM(GREATEST(b.final_amount::numeric - b.paid_amount::numeric, 0)),0) AS outstanding
        FROM bookings b WHERE b.status NOT IN ('cancelled') AND (b.is_deleted IS NULL OR b.is_deleted=false)
          AND b.final_amount::numeric > b.paid_amount::numeric`),
      // Cash + Bank balances from journal
      q1(`
        SELECT
          COALESCE(SUM(jel.debit - jel.credit) FILTER (WHERE a.code='1001'),0)::numeric AS cash_balance,
          COALESCE(SUM(jel.debit - jel.credit) FILTER (WHERE a.code='1002'),0)::numeric AS bank_balance
        FROM journal_entry_lines jel
        JOIN accounts a ON a.id=jel.account_id
        WHERE a.code IN ('1001','1002')`),
      // Top 5 agents by revenue
      q(`
        SELECT a.name, a.commission_rate,
          COALESCE(SUM(b.paid_amount::numeric),0) AS revenue,
          COUNT(b.id)::int AS bookings
        FROM agents a JOIN bookings b ON b.agent_id=a.id AND (b.is_deleted IS NULL OR b.is_deleted=false)
        GROUP BY a.id, a.name, a.commission_rate ORDER BY revenue DESC LIMIT 5`),
      // Top 5 branches by revenue
      q(`
        SELECT br.name, br.city,
          COALESCE(SUM(b.paid_amount::numeric),0) AS revenue,
          COUNT(b.id)::int AS bookings
        FROM branches br JOIN bookings b ON b.branch_id=br.id AND (b.is_deleted IS NULL OR b.is_deleted=false)
        GROUP BY br.id, br.name, br.city ORDER BY revenue DESC LIMIT 5`),
      // Booking status breakdown
      q(`SELECT status, COUNT(*)::int AS count FROM bookings WHERE is_deleted IS NULL OR is_deleted=false GROUP BY status ORDER BY count DESC`),
    ]);

    // Pending counts
    const [pendingVisa, pendingPassport, pendingAgreements, upcomingFlights] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS cnt FROM bookings b WHERE (b.is_deleted IS NULL OR b.is_deleted=false) AND b.status NOT IN ('cancelled') AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.booking_id=b.id AND d.type='visa')`),
      q1(`SELECT COUNT(*)::int AS cnt FROM bookings b WHERE (b.is_deleted IS NULL OR b.is_deleted=false) AND b.status NOT IN ('cancelled') AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.booking_id=b.id AND d.type='passport')`),
      q1(`SELECT COUNT(*)::int AS cnt FROM agreements WHERE status='pending_signature'`).catch(() => ({ cnt: 0 })),
      q1(`SELECT COUNT(DISTINCT bf.booking_id)::int AS cnt FROM booking_flights bf WHERE bf.departure_date >= CURRENT_DATE AND bf.departure_date <= CURRENT_DATE + INTERVAL '7 days'`).catch(() => ({ cnt: 0 })),
    ]);

    res.json({
      today:          { revenue: Number(todayStats?.revenue ?? 0), payments: todayStats?.payment_count ?? 0 },
      month:          { revenue: Number(monthStats?.revenue ?? 0), bookings: monthStats?.bookings ?? 0 },
      year:           { revenue: Number(yearStats?.revenue ?? 0), bookings: yearStats?.bookings ?? 0 },
      outstanding:    Number(outstanding?.outstanding ?? 0),
      cash_balance:   Number(cashBank?.cash_balance ?? 0),
      bank_balance:   Number(cashBank?.bank_balance ?? 0),
      pending: {
        visa:        pendingVisa?.cnt ?? 0,
        passport:    pendingPassport?.cnt ?? 0,
        agreements:  pendingAgreements?.cnt ?? 0,
        payments:    (bookingStatus || []).find((r: any) => r.status === "pending")?.count ?? 0,
      },
      upcoming_flights: upcomingFlights?.cnt ?? 0,
      top_agents:     agentStats,
      top_branches:   branchStats,
      booking_status: bookingStatus,
    });
  } catch (err) {
    console.error("[finance-reports] dashboard:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ── GET /api/finance-reports/daily-sales ──────────────────────────────────────
router.get("/daily-sales", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, branch_id, agent_id } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];
    const params: any[] = [dateFrom, dateTo];
    const filters: string[] = [];
    if (branch_id) { params.push(branch_id); filters.push(`b.branch_id=$${params.length}`); }
    if (agent_id)  { params.push(agent_id);  filters.push(`b.agent_id=$${params.length}`); }
    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const rows = await q(`
      SELECT pt.payment_date::date AS date,
        COUNT(DISTINCT pt.booking_id)::int AS bookings,
        COALESCE(SUM(pt.amount::numeric),0)::numeric AS collected,
        COUNT(DISTINCT b.customer_id)::int AS customers,
        COUNT(DISTINCT pt.id)::int AS transactions
      FROM payment_transactions pt
      JOIN bookings b ON b.id=pt.booking_id
      WHERE pt.payment_date::date BETWEEN $1 AND $2 AND pt.is_deleted=false ${where}
      GROUP BY pt.payment_date::date ORDER BY date DESC
    `, params);

    const summary = {
      total_collected: rows.reduce((s, r) => s + Number(r.collected), 0),
      total_bookings:  rows.reduce((s, r) => s + r.bookings, 0),
      avg_daily:       rows.length ? rows.reduce((s, r) => s + Number(r.collected), 0) / rows.length : 0,
    };
    res.json({ rows, summary, period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate daily sales report" }); }
});

// ── GET /api/finance-reports/branch-summary ────────────────────────────────────
router.get("/branch-summary", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];

    const rows = await q(`
      SELECT br.id, br.name AS branch_name, br.city, br.is_active,
        COUNT(DISTINCT b.id)::int AS total_bookings,
        COUNT(DISTINCT b.customer_id)::int AS customers,
        COALESCE(SUM(b.final_amount::numeric),0)::numeric AS total_billed,
        COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS total_collected,
        COALESCE(SUM(GREATEST(b.final_amount::numeric - b.paid_amount::numeric,0)),0)::numeric AS outstanding,
        COUNT(DISTINCT a.id)::int AS agents_count
      FROM branches br
      LEFT JOIN bookings b ON b.branch_id=br.id
        AND b.created_at::date BETWEEN $1 AND $2
        AND (b.is_deleted IS NULL OR b.is_deleted=false)
      LEFT JOIN agents a ON a.branch_id=br.id AND a.is_active=true
      GROUP BY br.id, br.name, br.city, br.is_active
      ORDER BY total_collected DESC
    `, [dateFrom, dateTo]);
    res.json({ rows, period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate branch summary" }); }
});

// ── GET /api/finance-reports/agent-summary ────────────────────────────────────
router.get("/agent-summary", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to, branch_id } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];
    const params: any[] = [dateFrom, dateTo];
    const brFilter = branch_id ? (params.push(branch_id), `AND a.branch_id=$${params.length}`) : "";

    const rows = await q(`
      SELECT a.id, a.name, a.mobile, a.commission_rate, a.city, br.name AS branch_name,
        COUNT(DISTINCT b.id)::int AS total_bookings,
        COALESCE(SUM(b.final_amount::numeric),0)::numeric AS total_billed,
        COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS total_collected,
        COALESCE(SUM(ac.commission_amount) FILTER (WHERE ac.status='paid'),0)::numeric AS commissions_paid,
        COALESCE(SUM(ac.commission_amount) FILTER (WHERE ac.status IN ('pending','approved')),0)::numeric AS commissions_pending
      FROM agents a
      LEFT JOIN branches br ON br.id=a.branch_id
      LEFT JOIN bookings b ON b.agent_id=a.id
        AND b.created_at::date BETWEEN $1 AND $2
        AND (b.is_deleted IS NULL OR b.is_deleted=false)
      LEFT JOIN agent_commissions ac ON ac.booking_id=b.id
      WHERE a.is_active=true ${brFilter}
      GROUP BY a.id, a.name, a.mobile, a.commission_rate, a.city, br.name
      ORDER BY total_collected DESC
    `, params);
    res.json({ rows, period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate agent summary" }); }
});

// ── GET /api/finance-reports/package-sales ───────────────────────────────────
router.get("/package-sales", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];

    const rows = await q(`
      SELECT b.package_name,
        COUNT(*)::int AS bookings,
        SUM(b.number_of_pilgrims)::int AS pilgrims,
        COALESCE(SUM(b.final_amount::numeric),0)::numeric AS total_billed,
        COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS total_collected,
        COALESCE(SUM(GREATEST(b.final_amount::numeric - b.paid_amount::numeric,0)),0)::numeric AS outstanding,
        AVG(b.final_amount::numeric)::numeric AS avg_booking_value
      FROM bookings b
      WHERE b.created_at::date BETWEEN $1 AND $2 AND (b.is_deleted IS NULL OR b.is_deleted=false)
        AND b.status NOT IN ('cancelled')
      GROUP BY b.package_name ORDER BY total_collected DESC
    `, [dateFrom, dateTo]);
    res.json({ rows, period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate package sales" }); }
});

// ── GET /api/finance-reports/outstanding ──────────────────────────────────────
router.get("/outstanding", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { type = "receivable", from, to, branch_id } = req.query as Record<string, string>;
    if (type === "receivable") {
      const params: any[] = [];
      const filters: string[] = ["b.status NOT IN ('cancelled')", "(b.is_deleted IS NULL OR b.is_deleted=false)", "b.final_amount::numeric > b.paid_amount::numeric"];
      if (from) { params.push(from); filters.push(`b.created_at::date >= $${params.length}`); }
      if (to)   { params.push(to);   filters.push(`b.created_at::date <= $${params.length}`); }
      if (branch_id) { params.push(branch_id); filters.push(`b.branch_id=$${params.length}`); }
      const where = filters.join(" AND ");
      const rows = await q(`
        SELECT b.id, b.booking_number, b.customer_name, b.customer_mobile,
          b.package_name, b.final_amount::numeric AS total, b.paid_amount::numeric AS paid,
          (b.final_amount::numeric - b.paid_amount::numeric)::numeric AS outstanding,
          b.status, b.created_at::date AS booking_date,
          a.name AS agent_name, br.name AS branch_name
        FROM bookings b
        LEFT JOIN agents a ON a.id=b.agent_id
        LEFT JOIN branches br ON br.id=b.branch_id
        WHERE ${where}
        ORDER BY outstanding DESC
      `, params);
      const total = rows.reduce((s, r) => s + Number(r.outstanding), 0);
      res.json({ type: "receivable", rows, total });
    } else {
      // Payable — vendor bills outstanding
      const rows = await q(`
        SELECT vb.*, (vb.total_amount - vb.paid_amount)::numeric AS outstanding
        FROM vendor_bills vb WHERE vb.status NOT IN ('paid','cancelled') AND vb.total_amount > vb.paid_amount
        ORDER BY vb.due_date NULLS LAST
      `);
      const total = rows.reduce((s, r) => s + Number(r.outstanding), 0);
      res.json({ type: "payable", rows, total });
    }
  } catch (err) { res.status(500).json({ error: "Failed to generate outstanding report" }); }
});

// ── GET /api/finance-reports/profit-loss ──────────────────────────────────────
router.get("/profit-loss", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];

    const [income, expenses, bookingRevenue] = await Promise.all([
      q(`
        SELECT a.name, a.code, COALESCE(SUM(jel.credit - jel.debit),0)::numeric AS amount
        FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id
        JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
        WHERE a.type='income'
        GROUP BY a.id, a.name, a.code ORDER BY amount DESC
      `, [dateFrom, dateTo]),
      q(`
        SELECT a.name, a.code, COALESCE(SUM(jel.debit - jel.credit),0)::numeric AS amount
        FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id
        JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.date BETWEEN $1 AND $2
        WHERE a.type='expense'
        GROUP BY a.id, a.name, a.code ORDER BY amount DESC
      `, [dateFrom, dateTo]),
      q1(`
        SELECT COALESCE(SUM(pt.amount::numeric),0) AS total
        FROM payment_transactions pt WHERE pt.payment_date::date BETWEEN $1 AND $2 AND pt.is_deleted=false
      `, [dateFrom, dateTo]),
    ]);

    const totalIncome = income.reduce((s, r) => s + Number(r.amount), 0) || Number(bookingRevenue?.total ?? 0);
    const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);
    res.json({
      period: { from: dateFrom, to: dateTo },
      income: { items: income, total: totalIncome },
      expenses: { items: expenses, total: totalExpenses },
      gross_profit: totalIncome - totalExpenses,
      net_profit: totalIncome - totalExpenses,
      profit_margin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(2) : "0.00",
    });
  } catch (err) { res.status(500).json({ error: "Failed to generate P&L" }); }
});

// ── GET /api/finance-reports/monthly-trend ────────────────────────────────────
router.get("/monthly-trend", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const months = Number(req.query.months ?? 12);
    const rows = await q(`
      SELECT TO_CHAR(DATE_TRUNC('month', pt.payment_date), 'YYYY-MM') AS month,
        COALESCE(SUM(pt.amount::numeric),0)::numeric AS revenue,
        COUNT(DISTINCT pt.booking_id)::int AS bookings
      FROM payment_transactions pt
      WHERE pt.payment_date >= NOW() - INTERVAL '${months} months' AND pt.is_deleted=false
      GROUP BY DATE_TRUNC('month', pt.payment_date) ORDER BY month ASC
    `);

    const expRows = await q(`
      SELECT TO_CHAR(DATE_TRUNC('month', date::date), 'YYYY-MM') AS month,
        COALESCE(SUM(amount::numeric),0)::numeric AS expenses
      FROM expenses WHERE date >= NOW() - INTERVAL '${months} months'
      GROUP BY DATE_TRUNC('month', date::date) ORDER BY month ASC
    `);
    const expMap: Record<string, number> = {};
    for (const e of expRows) expMap[e.month] = Number(e.expenses);

    const enriched = rows.map(r => ({
      ...r,
      expenses: expMap[r.month] ?? 0,
      profit: Number(r.revenue) - (expMap[r.month] ?? 0),
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: "Failed to generate monthly trend" }); }
});

// ── GET /api/finance-reports/cancellation ────────────────────────────────────
router.get("/cancellation", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];
    const rows = await q(`
      SELECT b.booking_number, b.customer_name, b.customer_mobile, b.package_name,
        b.final_amount::numeric AS total, b.paid_amount::numeric AS paid, b.updated_at::date AS cancelled_date,
        a.name AS agent_name, br.name AS branch_name
      FROM bookings b
      LEFT JOIN agents a ON a.id=b.agent_id
      LEFT JOIN branches br ON br.id=b.branch_id
      WHERE b.status='cancelled' AND b.updated_at::date BETWEEN $1 AND $2
        AND (b.is_deleted IS NULL OR b.is_deleted=false)
      ORDER BY b.updated_at DESC
    `, [dateFrom, dateTo]);

    const summary = {
      total: rows.length,
      total_billed: rows.reduce((s, r) => s + Number(r.total), 0),
      total_paid: rows.reduce((s, r) => s + Number(r.paid), 0),
    };
    res.json({ rows, summary, period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate cancellation report" }); }
});

// ── GET /api/finance-reports/expense-analysis ─────────────────────────────────
router.get("/expense-analysis", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];
    const [byCategory, byDay, total] = await Promise.all([
      q(`
        SELECT category, COUNT(*)::int AS count, COALESCE(SUM(amount::numeric),0)::numeric AS total
        FROM expenses WHERE date BETWEEN $1 AND $2
        GROUP BY category ORDER BY total DESC
      `, [dateFrom, dateTo]),
      q(`
        SELECT date, COALESCE(SUM(amount::numeric),0)::numeric AS total, COUNT(*)::int AS count
        FROM expenses WHERE date BETWEEN $1 AND $2
        GROUP BY date ORDER BY date DESC
      `, [dateFrom, dateTo]),
      q1(`SELECT COALESCE(SUM(amount::numeric),0)::numeric AS total FROM expenses WHERE date BETWEEN $1 AND $2`, [dateFrom, dateTo]),
    ]);
    res.json({ by_category: byCategory, by_day: byDay, total: Number(total?.total ?? 0), period: { from: dateFrom, to: dateTo } });
  } catch (err) { res.status(500).json({ error: "Failed to generate expense analysis" }); }
});

export default router;
