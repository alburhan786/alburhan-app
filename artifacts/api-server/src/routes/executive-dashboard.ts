// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";

const router = Router();
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];

// ── GET /api/executive/dashboard — comprehensive KPIs ────────────────────────
router.get("/dashboard", requireAdmin as any, async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 8) + "01";
    const yearStart  = today.slice(0, 5) + "01-01";

    const [
      revenueToday, revenueMonth, revenueYear,
      bookingsToday, bookingsMonth, activeBookings,
      outstanding, pilgrims, flightsToday,
      visaPending, roomStatus, agentRanking, branchRanking,
      cashFlow, growth, expenses
    ] = await Promise.all([
      // Revenue today
      q1(`SELECT COALESCE(SUM(amount::numeric),0) AS rev FROM payment_transactions WHERE payment_date::date=CURRENT_DATE AND is_deleted=false`),
      // Revenue this month
      q1(`SELECT COALESCE(SUM(amount::numeric),0) AS rev FROM payment_transactions WHERE payment_date::date >= $1 AND is_deleted=false`, [monthStart]),
      // Revenue this year
      q1(`SELECT COALESCE(SUM(amount::numeric),0) AS rev FROM payment_transactions WHERE payment_date::date >= $1 AND is_deleted=false`, [yearStart]),
      // Bookings today
      q1(`SELECT COUNT(*)::int AS cnt FROM bookings WHERE created_at::date=CURRENT_DATE AND (is_deleted IS NULL OR is_deleted=false)`),
      // Bookings this month
      q1(`SELECT COUNT(*)::int AS cnt FROM bookings WHERE created_at::date >= $1 AND (is_deleted IS NULL OR is_deleted=false)`, [monthStart]),
      // Active bookings
      q1(`SELECT COUNT(*)::int AS cnt FROM bookings WHERE status NOT IN ('cancelled') AND (is_deleted IS NULL OR is_deleted=false)`),
      // Outstanding receivables
      q1(`SELECT COALESCE(SUM(GREATEST(final_amount::numeric - paid_amount::numeric,0)),0) AS amt FROM bookings WHERE status NOT IN ('cancelled') AND (is_deleted IS NULL OR is_deleted=false)`),
      // Active pilgrims
      q1(`SELECT COUNT(*)::int AS cnt FROM pilgrims WHERE (is_deleted IS NULL OR is_deleted=false)`).catch(() => ({ cnt: 0 })),
      // Flights today
      q1(`SELECT COUNT(DISTINCT id)::int AS cnt FROM group_flights WHERE departure_date=CURRENT_DATE`).catch(() => ({ cnt: 0 })),
      // Visa pending
      q1(`SELECT COUNT(*)::int AS cnt FROM pilgrims WHERE (visa_status IS NULL OR visa_status='pending') AND (is_deleted IS NULL OR is_deleted=false)`).catch(() => ({ cnt: 0 })),
      // Room allocation status
      q1(`SELECT COUNT(DISTINCT pr.pilgrim_id)::int AS allocated, COUNT(*)::int AS total_rooms FROM pilgrim_room_assignments pr JOIN hajj_rooms hr ON hr.id=pr.room_id`).catch(() => ({ allocated: 0, total_rooms: 0 })),
      // Agent ranking (top 5)
      q(`SELECT a.id, a.name, COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS revenue, COUNT(b.id)::int AS bookings FROM agents a JOIN bookings b ON b.agent_id=a.id AND b.created_at::date >= $1 AND (b.is_deleted IS NULL OR b.is_deleted=false) GROUP BY a.id, a.name ORDER BY revenue DESC LIMIT 5`, [monthStart]),
      // Branch ranking (top 5)
      q(`SELECT br.id, br.name, br.city, COALESCE(SUM(b.paid_amount::numeric),0)::numeric AS revenue, COUNT(b.id)::int AS bookings FROM branches br JOIN bookings b ON b.branch_id=br.id AND b.created_at::date >= $1 AND (b.is_deleted IS NULL OR b.is_deleted=false) GROUP BY br.id, br.name, br.city ORDER BY revenue DESC LIMIT 5`, [monthStart]),
      // Cash flow (last 7 days)
      q(`SELECT payment_date::date AS date, COALESCE(SUM(amount::numeric),0)::numeric AS collected FROM payment_transactions WHERE payment_date::date >= CURRENT_DATE - INTERVAL '7 days' AND is_deleted=false GROUP BY payment_date::date ORDER BY date`),
      // Monthly growth (last 6 months)
      q(`SELECT TO_CHAR(DATE_TRUNC('month', payment_date),'YYYY-MM') AS month, COALESCE(SUM(amount::numeric),0)::numeric AS revenue, COUNT(DISTINCT booking_id)::int AS bookings FROM payment_transactions WHERE payment_date >= NOW() - INTERVAL '6 months' AND is_deleted=false GROUP BY DATE_TRUNC('month',payment_date) ORDER BY month`),
      // Expenses last 30 days
      q1(`SELECT COALESCE(SUM(amount::numeric),0)::numeric AS total FROM expenses WHERE date >= CURRENT_DATE - INTERVAL '30 days'`).catch(() => ({ total: 0 })),
    ]);

    // Pending commissions
    const commPending = await q1(`SELECT COALESCE(SUM(commission_amount),0)::numeric AS amt, COUNT(*)::int AS cnt FROM agent_commissions WHERE status='pending'`).catch(() => ({ amt: 0, cnt: 0 }));
    // Pending vendor bills
    const billsPending = await q1(`SELECT COALESCE(SUM(total_amount - paid_amount),0)::numeric AS amt, COUNT(*)::int AS cnt FROM vendor_bills WHERE status NOT IN ('paid','cancelled')`).catch(() => ({ amt: 0, cnt: 0 }));
    // Upcoming departures (7 days)
    const upcomingDeps = await q1(`SELECT COUNT(DISTINCT booking_id)::int AS cnt FROM group_flights WHERE departure_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`).catch(() => ({ cnt: 0 }));
    // Active vehicles
    const vehicles = await q1(`SELECT COUNT(*)::int AS active FROM vehicles WHERE is_active=true`).catch(() => ({ active: 0 }));

    const totalProfit = Number(revenueYear?.rev ?? 0) - Number(expenses?.total ?? 0);

    res.json({
      revenue: {
        today: Number(revenueToday?.rev ?? 0),
        month: Number(revenueMonth?.rev ?? 0),
        year:  Number(revenueYear?.rev ?? 0),
      },
      bookings: {
        today:   bookingsToday?.cnt ?? 0,
        month:   bookingsMonth?.cnt ?? 0,
        active:  activeBookings?.cnt ?? 0,
      },
      operations: {
        active_pilgrims:   pilgrims?.cnt ?? 0,
        flights_today:     flightsToday?.cnt ?? 0,
        visa_pending:      visaPending?.cnt ?? 0,
        rooms_allocated:   roomStatus?.allocated ?? 0,
        upcoming_departures: upcomingDeps?.cnt ?? 0,
        active_vehicles:   vehicles?.active ?? 0,
      },
      finance: {
        outstanding:          Number(outstanding?.amt ?? 0),
        total_profit_ytd:     totalProfit,
        commissions_pending:  Number(commPending?.amt ?? 0),
        bills_pending:        Number(billsPending?.amt ?? 0),
        expenses_last_30d:    Number(expenses?.total ?? 0),
      },
      agent_ranking:   agentRanking,
      branch_ranking:  branchRanking,
      cash_flow_7d:    cashFlow,
      monthly_growth:  growth,
      generated_at:    new Date().toISOString(),
    });
  } catch (err) {
    console.error("[executive-dashboard]", err);
    res.status(500).json({ error: "Failed to load executive dashboard" });
  }
});

// ── GET /api/executive/collection-summary ─────────────────────────────────────
router.get("/collection-summary", requireAdmin as any, async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const dateTo   = to   || new Date().toISOString().split("T")[0];

    const [byMode, byDay, totals] = await Promise.all([
      q(`SELECT payment_mode, COALESCE(SUM(amount::numeric),0)::numeric AS amount, COUNT(*)::int AS count FROM payment_transactions WHERE payment_date::date BETWEEN $1 AND $2 AND is_deleted=false GROUP BY payment_mode ORDER BY amount DESC`, [dateFrom, dateTo]),
      q(`SELECT payment_date::date AS date, COALESCE(SUM(amount::numeric),0)::numeric AS amount, COUNT(*)::int AS count FROM payment_transactions WHERE payment_date::date BETWEEN $1 AND $2 AND is_deleted=false GROUP BY payment_date::date ORDER BY date`, [dateFrom, dateTo]),
      q1(`SELECT COALESCE(SUM(amount::numeric),0)::numeric AS total, COUNT(DISTINCT booking_id)::int AS bookings FROM payment_transactions WHERE payment_date::date BETWEEN $1 AND $2 AND is_deleted=false`, [dateFrom, dateTo]),
    ]);
    res.json({ by_mode: byMode, by_day: byDay, totals, period: { from: dateFrom, to: dateTo } });
  } catch (e) { res.status(500).json({ error: "Failed to load collection summary" }); }
});

// ── GET /api/executive/alerts ────────────────────────────────────────────────
router.get("/alerts", requireAdmin as any, async (_req, res) => {
  try {
    const alerts: any[] = [];

    // Overdue vendor bills
    const overdueBills = await q1(`SELECT COUNT(*)::int AS cnt FROM vendor_bills WHERE due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled')`).catch(() => ({ cnt: 0 }));
    if (overdueBills?.cnt > 0) alerts.push({ type: "warning", module: "Purchase", message: `${overdueBills.cnt} overdue vendor bill(s)`, priority: "high" });

    // Pending commissions
    const pendingComm = await q1(`SELECT COUNT(*)::int AS cnt FROM agent_commissions WHERE status='pending' AND created_at < NOW() - INTERVAL '7 days'`).catch(() => ({ cnt: 0 }));
    if (pendingComm?.cnt > 0) alerts.push({ type: "info", module: "Commissions", message: `${pendingComm.cnt} commission(s) pending approval for >7 days`, priority: "medium" });

    // Expired vehicle documents
    const expiredVehicles = await q1(`SELECT COUNT(*)::int AS cnt FROM vehicles WHERE is_active=true AND (insurance_expiry < CURRENT_DATE OR permit_expiry < CURRENT_DATE OR fitness_expiry < CURRENT_DATE)`).catch(() => ({ cnt: 0 }));
    if (expiredVehicles?.cnt > 0) alerts.push({ type: "error", module: "Transport", message: `${expiredVehicles.cnt} vehicle(s) with expired documents`, priority: "high" });

    // Visa pending (>10 days)
    const staleVisa = await q1(`SELECT COUNT(*)::int AS cnt FROM pilgrims WHERE (visa_status IS NULL OR visa_status='pending') AND created_at < NOW() - INTERVAL '10 days'`).catch(() => ({ cnt: 0 }));
    if (staleVisa?.cnt > 0) alerts.push({ type: "warning", module: "Visa", message: `${staleVisa.cnt} pilgrim(s) with visa pending >10 days`, priority: "medium" });

    // Pending leave requests
    const pendingLeaves = await q1(`SELECT COUNT(*)::int AS cnt FROM leave_requests WHERE status='pending' AND created_at < NOW() - INTERVAL '3 days'`).catch(() => ({ cnt: 0 }));
    if (pendingLeaves?.cnt > 0) alerts.push({ type: "info", module: "HR", message: `${pendingLeaves.cnt} leave request(s) pending >3 days`, priority: "low" });

    res.json({ alerts, generated_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: "Failed to fetch alerts" }); }
});

export default router;
