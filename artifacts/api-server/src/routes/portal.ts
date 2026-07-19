// @ts-nocheck
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();

// ── Branch Manager Portal ────────────────────────────────────────────────────
router.get("/branch", requireAuth as any, async (req: any, res) => {
  if (req.user?.role !== "branch_manager") {
    res.status(403).json({ message: "Branch manager access required" });
    return;
  }
  try {
    const mobile = req.user.mobile;

    const [branchRes, statsRes, revenueRes, agentsRes, recentBookings] = await Promise.all([
      pool.query(
        `SELECT * FROM branches WHERE manager_mobile=$1 LIMIT 1`,
        [mobile]
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT b.status, COUNT(*)::int AS cnt
         FROM bookings b
         JOIN agents a ON a.id = b.agent_id
         JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1
           AND b.deleted_at IS NULL
         GROUP BY b.status`,
        [mobile]
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT COALESCE(SUM(pt.amount),0)::numeric AS total
         FROM payment_transactions pt
         JOIN bookings b ON b.id = pt.booking_id
         JOIN agents a ON a.id = b.agent_id
         JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1`,
        [mobile]
      ).catch(() => ({ rows: [{ total: 0 }] })),

      pool.query(
        `SELECT COUNT(*)::int AS cnt
         FROM agents a
         JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1 AND a.is_active=true`,
        [mobile]
      ).catch(() => ({ rows: [{ cnt: 0 }] })),

      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.total_amount,
                u.name AS customer_name, u.mobile AS customer_mobile,
                pk.name AS package_name, b.created_at
         FROM bookings b
         JOIN agents a ON a.id = b.agent_id
         JOIN branches br ON br.id = a.branch_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN packages pk ON pk.id = b.package_id
         WHERE br.manager_mobile=$1
           AND b.deleted_at IS NULL
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [mobile]
      ).catch(() => ({ rows: [] })),
    ]);

    const branch = branchRes.rows[0];
    if (!branch) {
      res.status(404).json({ message: "Branch not found for this mobile number" });
      return;
    }

    const statusMap: Record<string, number> = {};
    statsRes.rows.forEach((r: any) => { statusMap[r.status] = r.cnt; });

    res.json({
      branch,
      statusMap,
      totalRevenue: Number(revenueRes.rows[0]?.total || 0),
      activeAgents: agentsRes.rows[0]?.cnt || 0,
      recentBookings: recentBookings.rows,
    });
  } catch (err: any) {
    console.error("[portal/branch]", err.message);
    res.status(500).json({ message: "Failed to load branch portal data" });
  }
});

// ── Agent Portal ──────────────────────────────────────────────────────────────
router.get("/agent", requireAuth as any, async (req: any, res) => {
  if (req.user?.role !== "agent") {
    res.status(403).json({ message: "Agent access required" });
    return;
  }
  try {
    const mobile = req.user.mobile;

    const [agentRes, statsRes, revenueRes, recentBookings] = await Promise.all([
      pool.query(
        `SELECT a.*, b.name AS branch_name, b.city AS branch_city
         FROM agents a
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.mobile=$1 LIMIT 1`,
        [mobile]
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT b.status, COUNT(*)::int AS cnt
         FROM bookings b
         JOIN agents a ON a.id = b.agent_id
         WHERE a.mobile=$1
           AND b.deleted_at IS NULL
         GROUP BY b.status`,
        [mobile]
      ).catch(() => ({ rows: [] })),

      pool.query(
        `SELECT COALESCE(SUM(pt.amount),0)::numeric AS total
         FROM payment_transactions pt
         JOIN bookings b ON b.id = pt.booking_id
         JOIN agents a ON a.id = b.agent_id
         WHERE a.mobile=$1`,
        [mobile]
      ).catch(() => ({ rows: [{ total: 0 }] })),

      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.total_amount,
                u.name AS customer_name, u.mobile AS customer_mobile,
                pk.name AS package_name, b.created_at
         FROM bookings b
         JOIN agents a ON a.id = b.agent_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN packages pk ON pk.id = b.package_id
         WHERE a.mobile=$1
           AND b.deleted_at IS NULL
         ORDER BY b.created_at DESC
         LIMIT 20`,
        [mobile]
      ).catch(() => ({ rows: [] })),
    ]);

    const agent = agentRes.rows[0];
    if (!agent) {
      res.status(404).json({ message: "Agent not found for this mobile number" });
      return;
    }

    const statusMap: Record<string, number> = {};
    statsRes.rows.forEach((r: any) => { statusMap[r.status] = r.cnt; });

    const totalRevenue = Number(revenueRes.rows[0]?.total || 0);
    const commissionEarned = (totalRevenue * Number(agent.commission_rate || 0)) / 100;

    res.json({
      agent,
      statusMap,
      totalRevenue,
      commissionEarned,
      recentBookings: recentBookings.rows,
    });
  } catch (err: any) {
    console.error("[portal/agent]", err.message);
    res.status(500).json({ message: "Failed to load agent portal data" });
  }
});

// ── Staff Portal ──────────────────────────────────────────────────────────────
router.get("/staff", requireAuth as any, async (req: any, res) => {
  if (req.user?.role !== "staff") {
    res.status(403).json({ message: "Staff access required" });
    return;
  }
  try {
    const mobile = req.user.mobile;
    const r = await pool.query(
      `SELECT * FROM staff WHERE mobile_india=$1 AND status='active' LIMIT 1`,
      [mobile]
    );
    const member = r.rows[0];
    if (!member) {
      res.status(404).json({ message: "Staff record not found for this mobile number" });
      return;
    }
    res.json({ member });
  } catch (err: any) {
    console.error("[portal/staff]", err.message);
    res.status(500).json({ message: "Failed to load staff portal data" });
  }
});

export default router;
