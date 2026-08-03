// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// ── Migrations ───────────────────────────────────────────────────────────────
export async function ensureCommissionTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_commissions (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      booking_id    TEXT NOT NULL,
      booking_number TEXT,
      agent_id      TEXT NOT NULL,
      agent_name    TEXT,
      base_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
      commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      approved_by   TEXT,
      approved_at   TIMESTAMPTZ,
      paid_at       TIMESTAMPTZ,
      payment_mode  TEXT,
      payment_reference TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent ON agent_commissions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_commissions_booking ON agent_commissions(booking_id);
    CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON agent_commissions(status);

    CREATE TABLE IF NOT EXISTS agent_wallet_transactions (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      agent_id        TEXT NOT NULL,
      type            TEXT NOT NULL,
      amount          NUMERIC(12,2) NOT NULL,
      reference_id    TEXT,
      reference_type  TEXT,
      balance_after   NUMERIC(12,2),
      notes           TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_wallet_agent ON agent_wallet_transactions(agent_id);
  `);
}

// Helper: compute agent wallet balance
async function agentBalance(agentId: string): Promise<number> {
  const r = await q1(
    `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0)::numeric AS balance
     FROM agent_wallet_transactions WHERE agent_id=$1`,
    [agentId]
  );
  return Number(r?.balance ?? 0);
}

// ── Auto-calculate commission when booking is approved ─────────────────────
export async function autoCreateCommission(bookingId: string): Promise<void> {
  try {
    const existing = await q1(
      `SELECT id FROM agent_commissions WHERE booking_id=$1 LIMIT 1`, [bookingId]
    );
    if (existing) return;

    const booking = await q1(
      `SELECT b.id, b.booking_number, b.agent_id, b.final_amount,
              a.name AS agent_name, a.commission_rate
       FROM bookings b
       LEFT JOIN agents a ON a.id = b.agent_id
       WHERE b.id=$1`, [bookingId]
    );
    if (!booking?.agent_id || !booking?.commission_rate) return;

    const base = Number(booking.final_amount ?? 0);
    const rate = Number(booking.commission_rate ?? 0);
    const commAmt = Math.round((base * rate / 100) * 100) / 100;
    if (commAmt <= 0) return;

    await pool.query(
      `INSERT INTO agent_commissions
         (booking_id, booking_number, agent_id, agent_name, base_amount, commission_rate, commission_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [bookingId, booking.booking_number, booking.agent_id, booking.agent_name, base, rate, commAmt]
    );
  } catch (err) {
    console.error("[commissions] autoCreateCommission (non-fatal):", err);
  }
}

// ── GET /api/commissions — list all commissions ───────────────────────────
router.get("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = getTenantId(req);
    const { agent_id, status, from, to } = req.query as Record<string, string>;
    const params: any[] = [tenantId];
    const filters: string[] = [`a.tenant_id=$1::uuid`];
    if (agent_id) { params.push(agent_id); filters.push(`ac.agent_id=$${params.length}`); }
    if (status)   { params.push(status);   filters.push(`ac.status=$${params.length}`); }
    if (from)     { params.push(from);     filters.push(`ac.created_at::date >= $${params.length}`); }
    if (to)       { params.push(to);       filters.push(`ac.created_at::date <= $${params.length}`); }
    const where = `WHERE ${filters.join(" AND ")}`;
    const rows = await q(
      `SELECT ac.*, a.mobile AS agent_mobile, a.email AS agent_email, a.city AS agent_city
       FROM agent_commissions ac
       LEFT JOIN agents a ON a.id = ac.agent_id
       ${where}
       ORDER BY ac.created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed to fetch commissions" }); }
});

// ── GET /api/commissions/summary — totals by agent ────────────────────────
router.get("/summary", requireAdmin as any, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await q(`
      SELECT a.id, a.name, a.commission_rate,
        COUNT(ac.id)::int AS total_entries,
        COALESCE(SUM(ac.commission_amount) FILTER (WHERE ac.status='pending'),0)::numeric AS pending_amount,
        COALESCE(SUM(ac.commission_amount) FILTER (WHERE ac.status='approved'),0)::numeric AS approved_amount,
        COALESCE(SUM(ac.commission_amount) FILTER (WHERE ac.status='paid'),0)::numeric AS paid_amount,
        COALESCE(SUM(ac.commission_amount),0)::numeric AS total_earned
      FROM agents a
      LEFT JOIN agent_commissions ac ON ac.agent_id = a.id
      WHERE a.tenant_id=$1::uuid AND a.is_active = true
      GROUP BY a.id, a.name, a.commission_rate
      ORDER BY total_earned DESC
    `, [tenantId]);

    // Fetch wallet balances
    const balances = await q(
      `SELECT agent_id, COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0)::numeric AS balance
       FROM agent_wallet_transactions GROUP BY agent_id`
    );
    const balMap: Record<string, number> = {};
    for (const b of balances) balMap[b.agent_id] = Number(b.balance);

    const enriched = rows.map(r => ({ ...r, wallet_balance: balMap[r.id] ?? 0 }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: "Failed to fetch summary" }); }
});

// ── GET /api/commissions/agent/:agentId — agent detail ───────────────────
router.get("/agent/:agentId", requireAdmin as any, async (req, res) => {
  try {
    const { agentId } = req.params;
    const [agent, commissions, wallet] = await Promise.all([
      q1(`SELECT a.*, b_stats.booking_count, b_stats.total_revenue
          FROM agents a
          LEFT JOIN (
            SELECT agent_id, COUNT(*)::int AS booking_count,
                   COALESCE(SUM(paid_amount::numeric),0) AS total_revenue
            FROM bookings WHERE agent_id=$1 AND (is_deleted IS NULL OR is_deleted=false)
            GROUP BY agent_id
          ) b_stats ON b_stats.agent_id = a.id
          WHERE a.id=$1`, [agentId]),
      q(`SELECT ac.*, b.status AS booking_status
         FROM agent_commissions ac
         LEFT JOIN bookings b ON b.id = ac.booking_id
         WHERE ac.agent_id=$1 ORDER BY ac.created_at DESC`, [agentId]),
      q(`SELECT * FROM agent_wallet_transactions WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 50`, [agentId]),
    ]);
    if (!agent) return void res.status(404).json({ error: "Agent not found" });
    const balance = await agentBalance(agentId);
    res.json({ agent, commissions, wallet, balance });
  } catch (err) { res.status(500).json({ error: "Failed to fetch agent detail" }); }
});

// ── POST /api/commissions/:id/approve ─────────────────────────────────────
router.post("/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const comm = await q1(`SELECT * FROM agent_commissions WHERE id=$1`, [id]);
    if (!comm) return void res.status(404).json({ error: "Commission not found" });
    if (comm.status !== "pending") return void res.status(400).json({ error: "Only pending commissions can be approved" });

    await pool.query(
      `UPDATE agent_commissions SET status='approved', approved_by=$1, approved_at=NOW(), notes=COALESCE($2, notes), updated_at=NOW() WHERE id=$3`,
      [req.user?.name ?? "admin", notes ?? null, id]
    );
    res.json({ ok: true, message: "Commission approved" });
  } catch (err) { res.status(500).json({ error: "Failed to approve commission" }); }
});

// ── POST /api/commissions/:id/reject ──────────────────────────────────────
router.post("/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    await pool.query(
      `UPDATE agent_commissions SET status='rejected', notes=$1, updated_at=NOW() WHERE id=$2`,
      [notes ?? null, id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Failed to reject" }); }
});

// ── POST /api/commissions/:id/pay — mark as paid + credit wallet ──────────
router.post("/:id/pay", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { payment_mode, payment_reference, notes } = req.body;
    const comm = await q1(`SELECT * FROM agent_commissions WHERE id=$1`, [id]);
    if (!comm) return void res.status(404).json({ error: "Commission not found" });
    if (comm.status !== "approved") return void res.status(400).json({ error: "Commission must be approved before paying" });

    const balance = await agentBalance(comm.agent_id);
    const newBalance = balance + Number(comm.commission_amount);

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE agent_commissions SET status='paid', paid_at=NOW(), payment_mode=$1, payment_reference=$2, notes=COALESCE($3, notes), updated_at=NOW() WHERE id=$4`,
        [payment_mode ?? "bank_transfer", payment_reference ?? null, notes ?? null, id]
      );
      await pool.query(
        `INSERT INTO agent_wallet_transactions (agent_id, type, amount, reference_id, reference_type, balance_after, notes, created_by)
         VALUES ($1,'credit',$2,$3,'commission',$4,$5,$6)`,
        [comm.agent_id, comm.commission_amount, id, newBalance, `Commission paid for ${comm.booking_number}`, req.user?.name ?? "admin"]
      );
      await pool.query("COMMIT");
    } catch (e) { await pool.query("ROLLBACK"); throw e; }

    res.json({ ok: true, balance: newBalance });
  } catch (err) { res.status(500).json({ error: "Failed to mark as paid" }); }
});

// ── POST /api/commissions/bulk-sync — auto-create for unlinked bookings ──
router.post("/bulk-sync", requireAdmin as any, async (_req, res) => {
  try {
    const bookings = await q(`
      SELECT b.id, b.booking_number, b.agent_id, b.final_amount, a.name AS agent_name, a.commission_rate
      FROM bookings b
      JOIN agents a ON a.id = b.agent_id
      WHERE b.agent_id IS NOT NULL AND a.commission_rate > 0
        AND (b.is_deleted IS NULL OR b.is_deleted=false)
        AND NOT EXISTS (SELECT 1 FROM agent_commissions ac WHERE ac.booking_id = b.id)
      LIMIT 1000
    `);

    let created = 0;
    for (const b of bookings) {
      const base = Number(b.final_amount ?? 0);
      const rate = Number(b.commission_rate ?? 0);
      const commAmt = Math.round((base * rate / 100) * 100) / 100;
      if (commAmt <= 0) continue;
      await pool.query(
        `INSERT INTO agent_commissions (booking_id, booking_number, agent_id, agent_name, base_amount, commission_rate, commission_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [b.id, b.booking_number, b.agent_id, b.agent_name, base, rate, commAmt]
      );
      created++;
    }
    res.json({ ok: true, created, total: bookings.length });
  } catch (err) { res.status(500).json({ error: "Bulk sync failed" }); }
});

// ── POST /api/commissions/wallet/:agentId/adjustment — manual adjustment ─
router.post("/wallet/:agentId/adjustment", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId } = req.params;
    const { type, amount, notes } = req.body;
    if (!["credit", "debit"].includes(type)) return void res.status(400).json({ error: "type must be credit or debit" });
    if (!amount || Number(amount) <= 0) return void res.status(400).json({ error: "Invalid amount" });

    const balance = await agentBalance(agentId);
    const newBalance = type === "credit" ? balance + Number(amount) : balance - Number(amount);
    if (newBalance < 0) return void res.status(400).json({ error: "Insufficient wallet balance" });

    await pool.query(
      `INSERT INTO agent_wallet_transactions (agent_id, type, amount, reference_type, balance_after, notes, created_by)
       VALUES ($1,$2,$3,'adjustment',$4,$5,$6)`,
      [agentId, type, amount, newBalance, notes ?? null, req.user?.name ?? "admin"]
    );
    res.json({ ok: true, balance: newBalance });
  } catch (err) { res.status(500).json({ error: "Adjustment failed" }); }
});

export default router;
