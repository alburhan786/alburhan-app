import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// Points per action
const POINTS = {
  booking: 100,
  payment_1000: 10,  // per ₹1000 paid
  referral: 200,
  review: 50,
  repeat_booking: 150,
};

router.get("/", requireAdmin as any, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lp.id, lp.customer_id, lp.customer_name, lp.customer_mobile,
        lp.total_points, lp.redeemed_points, lp.tier, lp.bookings_count,
        lp.total_spent, lp.last_activity, lp.created_at,
        (lp.total_points - lp.redeemed_points) as available_points
      FROM loyalty_points lp
      ORDER BY lp.total_points DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int as total_members,
        COALESCE(SUM(total_points),0)::int as total_points_issued,
        COALESCE(SUM(redeemed_points),0)::int as total_points_redeemed,
        COUNT(*) FILTER (WHERE tier='bronze')::int as bronze,
        COUNT(*) FILTER (WHERE tier='silver')::int as silver,
        COUNT(*) FILTER (WHERE tier='gold')::int as gold,
        COUNT(*) FILTER (WHERE tier='platinum')::int as platinum
      FROM loyalty_points
    `);
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:customerId", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT *, (total_points - redeemed_points) as available_points FROM loyalty_points WHERE customer_id=$1`,
      [req.params.customerId]
    );
    if (!r.rows[0]) return void res.status(404).json({ message: "Not found" });
    const txn = await pool.query(
      `SELECT * FROM loyalty_transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.customerId]
    );
    res.json({ ...r.rows[0], transactions: txn.rows });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Award points manually
router.post("/award", requireAdmin as any, async (req, res) => {
  try {
    const { customer_id, customer_name, customer_mobile, points, reason, source = "manual" } = req.body;
    if (!customer_id || !points) return void res.status(400).json({ message: "customer_id and points required" });

    // Upsert loyalty record
    await pool.query(`
      INSERT INTO loyalty_points (customer_id, customer_name, customer_mobile, total_points, tier, last_activity)
      VALUES ($1, $2, $3, $4, 'bronze', NOW())
      ON CONFLICT (customer_id) DO UPDATE SET
        total_points = loyalty_points.total_points + $4,
        customer_name = COALESCE($2, loyalty_points.customer_name),
        customer_mobile = COALESCE($3, loyalty_points.customer_mobile),
        last_activity = NOW(),
        tier = CASE
          WHEN (loyalty_points.total_points + $4) >= 5000 THEN 'platinum'
          WHEN (loyalty_points.total_points + $4) >= 2000 THEN 'gold'
          WHEN (loyalty_points.total_points + $4) >= 500 THEN 'silver'
          ELSE 'bronze'
        END
    `, [customer_id, customer_name, customer_mobile, points]);

    await pool.query(`
      INSERT INTO loyalty_transactions (customer_id, points, type, reason, source, created_at)
      VALUES ($1, $2, 'credit', $3, $4, NOW())
    `, [customer_id, points, reason || "Manual award", source]);

    const updated = await pool.query(
      `SELECT *, (total_points - redeemed_points) as available_points FROM loyalty_points WHERE customer_id=$1`,
      [customer_id]
    );
    res.json(updated.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Redeem points
router.post("/redeem", requireAdmin as any, async (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || !points) return void res.status(400).json({ message: "customer_id and points required" });

    const r = await pool.query(`SELECT total_points, redeemed_points FROM loyalty_points WHERE customer_id=$1`, [customer_id]);
    if (!r.rows[0]) return void res.status(404).json({ message: "Customer not in loyalty program" });
    const available = r.rows[0].total_points - r.rows[0].redeemed_points;
    if (points > available) return void res.status(400).json({ message: `Only ${available} points available` });

    await pool.query(
      `UPDATE loyalty_points SET redeemed_points = redeemed_points + $1, last_activity = NOW() WHERE customer_id = $2`,
      [points, customer_id]
    );
    await pool.query(
      `INSERT INTO loyalty_transactions (customer_id, points, type, reason, source, created_at) VALUES ($1, $2, 'debit', $3, 'redemption', NOW())`,
      [customer_id, points, reason || "Points redeemed"]
    );
    res.json({ ok: true, redeemed: points, remaining: available - points });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Sync loyalty from bookings (auto-calculate)
router.post("/sync", requireAdmin as any, async (_req, res) => {
  try {
    const bookings = await pool.query(`
      SELECT b.customer_id, b.customer_name, b.customer_mobile,
             COUNT(b.id)::int as bookings_count,
             COALESCE(SUM(b.paid_amount::numeric),0) as total_spent
      FROM bookings b
      WHERE b.customer_id IS NOT NULL
        AND b.status IN ('confirmed','approved','completed','partially_paid')
      GROUP BY b.customer_id, b.customer_name, b.customer_mobile
    `);

    let synced = 0;
    for (const row of bookings.rows) {
      const pts = (row.bookings_count * POINTS.booking)
        + Math.floor((parseFloat(row.total_spent) / 1000) * POINTS.payment_1000)
        + (row.bookings_count > 1 ? (row.bookings_count - 1) * POINTS.repeat_booking : 0);

      const tier = pts >= 5000 ? "platinum" : pts >= 2000 ? "gold" : pts >= 500 ? "silver" : "bronze";

      await pool.query(`
        INSERT INTO loyalty_points (customer_id, customer_name, customer_mobile, total_points, tier, bookings_count, total_spent, last_activity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          customer_name = COALESCE($2, loyalty_points.customer_name),
          customer_mobile = COALESCE($3, loyalty_points.customer_mobile),
          total_points = $4,
          tier = $5,
          bookings_count = $6,
          total_spent = $7,
          last_activity = NOW()
      `, [row.customer_id, row.customer_name, row.customer_mobile, pts, tier, row.bookings_count, parseFloat(row.total_spent)]);
      synced++;
    }
    res.json({ synced, message: `Synced ${synced} customers` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
