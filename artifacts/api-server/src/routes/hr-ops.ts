// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;

export async function ensureHROopsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_types (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name        TEXT NOT NULL UNIQUE,
      days_allowed INT DEFAULT 0,
      is_paid     BOOLEAN DEFAULT true,
      carry_forward BOOLEAN DEFAULT false,
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO leave_types (name, days_allowed, is_paid, carry_forward) VALUES
      ('Annual Leave', 21, true, true),
      ('Sick Leave', 12, true, false),
      ('Casual Leave', 6, false, false),
      ('Unpaid Leave', 0, false, false),
      ('Maternity Leave', 90, true, false),
      ('Paternity Leave', 7, true, false)
    ON CONFLICT (name) DO NOTHING;

    CREATE TABLE IF NOT EXISTS leave_requests (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      employee_id     TEXT NOT NULL,
      leave_type_id   TEXT REFERENCES leave_types(id),
      leave_type_name TEXT,
      from_date       DATE NOT NULL,
      to_date         DATE NOT NULL,
      days            INT NOT NULL,
      reason          TEXT,
      status          TEXT DEFAULT 'pending',
      approved_by     TEXT,
      approved_at     TIMESTAMPTZ,
      rejected_reason TEXT,
      half_day        BOOLEAN DEFAULT false,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lr_employee ON leave_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_lr_status ON leave_requests(status);
    CREATE INDEX IF NOT EXISTS idx_lr_dates ON leave_requests(from_date, to_date);

    CREATE TABLE IF NOT EXISTS leave_balances (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      employee_id     TEXT NOT NULL,
      leave_type_id   TEXT REFERENCES leave_types(id),
      leave_type_name TEXT,
      year            INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
      allocated       INT DEFAULT 0,
      used            INT DEFAULT 0,
      pending         INT DEFAULT 0,
      balance         INT GENERATED ALWAYS AS (allocated - used - pending) STORED,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (employee_id, leave_type_id, year)
    );
    CREATE INDEX IF NOT EXISTS idx_lb_employee ON leave_balances(employee_id);

    CREATE TABLE IF NOT EXISTS salary_slips (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      employee_id     TEXT NOT NULL,
      payroll_run_id  TEXT,
      month           INT NOT NULL,
      year            INT NOT NULL,
      basic_salary    NUMERIC(12,2) DEFAULT 0,
      hra             NUMERIC(12,2) DEFAULT 0,
      conveyance      NUMERIC(12,2) DEFAULT 0,
      other_allowances NUMERIC(12,2) DEFAULT 0,
      gross_salary    NUMERIC(12,2) DEFAULT 0,
      pf_deduction    NUMERIC(12,2) DEFAULT 0,
      esi_deduction   NUMERIC(12,2) DEFAULT 0,
      tds_deduction   NUMERIC(12,2) DEFAULT 0,
      advance_deduction NUMERIC(12,2) DEFAULT 0,
      other_deductions NUMERIC(12,2) DEFAULT 0,
      total_deductions NUMERIC(12,2) DEFAULT 0,
      net_salary      NUMERIC(12,2) DEFAULT 0,
      days_present    INT DEFAULT 0,
      days_absent     INT DEFAULT 0,
      days_leave      INT DEFAULT 0,
      payment_mode    TEXT DEFAULT 'bank_transfer',
      paid_at         TIMESTAMPTZ,
      status          TEXT DEFAULT 'draft',
      notes           TEXT,
      generated_by    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (employee_id, month, year)
    );
    CREATE INDEX IF NOT EXISTS idx_ss_employee ON salary_slips(employee_id);
    CREATE INDEX IF NOT EXISTS idx_ss_period ON salary_slips(year, month);
    CREATE INDEX IF NOT EXISTS idx_ss_status ON salary_slips(status);
  `);
}

// ── Leave Types ───────────────────────────────────────────────────────────────
router.get("/leave-types", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM leave_types WHERE is_active=true ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch leave types" }); }
});

router.post("/leave-types", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, days_allowed, is_paid, carry_forward } = req.body;
    if (!name) return void res.status(400).json({ error: "name required" });
    const row = await q1(
      `INSERT INTO leave_types (name, days_allowed, is_paid, carry_forward) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, days_allowed || 0, is_paid ?? true, carry_forward ?? false]
    );
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "Leave type already exists" });
    res.status(500).json({ error: "Failed to create leave type" });
  }
});

// ── Leave Requests ────────────────────────────────────────────────────────────
router.get("/leaves", requireAdmin as any, async (req, res) => {
  try {
    const { employee_id, status, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (employee_id) { params.push(employee_id); filters.push(`lr.employee_id=$${params.length}`); }
    if (status)      { params.push(status);      filters.push(`lr.status=$${params.length}`); }
    if (from)        { params.push(from);        filters.push(`lr.from_date >= $${params.length}`); }
    if (to)          { params.push(to);          filters.push(`lr.to_date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT lr.*, e.name AS employee_name, e.department, e.designation
       FROM leave_requests lr LEFT JOIN employees e ON e.id=lr.employee_id
       ${where} ORDER BY lr.created_at DESC`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch leaves" }); }
});

router.post("/leaves", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { employee_id, leave_type_id, leave_type_name, from_date, to_date, reason, half_day, notes } = req.body;
    if (!employee_id || !from_date || !to_date) return void res.status(400).json({ error: "employee_id, from_date, to_date required" });

    const d1 = new Date(from_date);
    const d2 = new Date(to_date);
    let days = Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1;
    if (half_day) days = 0.5;

    const row = await q1(
      `INSERT INTO leave_requests (employee_id, leave_type_id, leave_type_name, from_date, to_date, days, reason, half_day, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [employee_id, leave_type_id || null, leave_type_name || null, from_date, to_date, days, reason || null, half_day || false, notes || null]
    );

    // Update pending in leave_balance
    if (leave_type_id) {
      await pool.query(
        `INSERT INTO leave_balances (employee_id, leave_type_id, leave_type_name, year, allocated, pending)
         VALUES ($1,$2,$3,$4,(SELECT days_allowed FROM leave_types WHERE id=$2),1)
         ON CONFLICT (employee_id, leave_type_id, year)
         DO UPDATE SET pending = leave_balances.pending + 1, updated_at=NOW()`,
        [employee_id, leave_type_id, leave_type_name || null, new Date().getFullYear()]
      );
    }
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to submit leave request" }); }
});

router.post("/leaves/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const lr = await q1(`SELECT * FROM leave_requests WHERE id=$1`, [req.params.id]);
    if (!lr) return void res.status(404).json({ error: "Leave request not found" });
    if (lr.status !== "pending") return void res.status(400).json({ error: "Only pending requests can be approved" });

    await pool.query(
      `UPDATE leave_requests SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user?.name ?? "admin", req.params.id]
    );

    // Move from pending to used
    if (lr.leave_type_id) {
      await pool.query(
        `UPDATE leave_balances SET used=used+$1, pending=GREATEST(0, pending-1), updated_at=NOW()
         WHERE employee_id=$2 AND leave_type_id=$3 AND year=$4`,
        [Math.ceil(lr.days), lr.employee_id, lr.leave_type_id, new Date(lr.from_date).getFullYear()]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to approve leave" }); }
});

router.post("/leaves/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    const lr = await q1(`SELECT * FROM leave_requests WHERE id=$1`, [req.params.id]);
    if (!lr) return void res.status(404).json({ error: "Not found" });

    await pool.query(
      `UPDATE leave_requests SET status='rejected', rejected_reason=$1, approved_by=$2, approved_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [reason || null, req.user?.name ?? "admin", req.params.id]
    );

    if (lr.leave_type_id) {
      await pool.query(
        `UPDATE leave_balances SET pending=GREATEST(0, pending-1), updated_at=NOW() WHERE employee_id=$1 AND leave_type_id=$2 AND year=$3`,
        [lr.employee_id, lr.leave_type_id, new Date(lr.from_date).getFullYear()]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to reject leave" }); }
});

// ── Leave Balances ────────────────────────────────────────────────────────────
router.get("/leave-balances/:employeeId", requireAdmin as any, async (req, res) => {
  try {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const rows = await q(
      `SELECT lb.*, lt.name AS type_name, lt.is_paid, lt.carry_forward
       FROM leave_balances lb LEFT JOIN leave_types lt ON lt.id=lb.leave_type_id
       WHERE lb.employee_id=$1 AND lb.year=$2 ORDER BY lt.name`,
      [req.params.employeeId, year]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch balances" }); }
});

// ── Salary Slips ──────────────────────────────────────────────────────────────
router.get("/salary-slips", requireAdmin as any, async (req, res) => {
  try {
    const { employee_id, month, year, status } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (employee_id) { params.push(employee_id); filters.push(`ss.employee_id=$${params.length}`); }
    if (month)       { params.push(Number(month)); filters.push(`ss.month=$${params.length}`); }
    if (year)        { params.push(Number(year));  filters.push(`ss.year=$${params.length}`); }
    if (status)      { params.push(status);       filters.push(`ss.status=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT ss.*, e.name AS employee_name, e.department, e.designation
       FROM salary_slips ss LEFT JOIN employees e ON e.id=ss.employee_id
       ${where} ORDER BY ss.year DESC, ss.month DESC`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch salary slips" }); }
});

router.get("/salary-slips/:id", requireAdmin as any, async (req, res) => {
  try {
    const slip = await q1(
      `SELECT ss.*, e.name AS employee_name, e.department, e.designation, e.bank_account, e.bank_name, e.ifsc
       FROM salary_slips ss LEFT JOIN employees e ON e.id=ss.employee_id WHERE ss.id=$1`,
      [req.params.id]
    );
    if (!slip) return void res.status(404).json({ error: "Salary slip not found" });
    res.json(slip);
  } catch (e) { res.status(500).json({ error: "Failed to fetch salary slip" }); }
});

router.post("/salary-slips/generate", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { employee_id, month, year, basic_salary, hra, conveyance, other_allowances, pf_deduction, esi_deduction, tds_deduction, advance_deduction, other_deductions, days_present, days_absent, days_leave, notes } = req.body;
    if (!employee_id || !month || !year) return void res.status(400).json({ error: "employee_id, month, year required" });

    const gross = Number(basic_salary || 0) + Number(hra || 0) + Number(conveyance || 0) + Number(other_allowances || 0);
    const deductions = Number(pf_deduction || 0) + Number(esi_deduction || 0) + Number(tds_deduction || 0) + Number(advance_deduction || 0) + Number(other_deductions || 0);
    const net = gross - deductions;

    const slip = await q1(
      `INSERT INTO salary_slips (employee_id, month, year, basic_salary, hra, conveyance, other_allowances, gross_salary, pf_deduction, esi_deduction, tds_deduction, advance_deduction, other_deductions, total_deductions, net_salary, days_present, days_absent, days_leave, notes, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (employee_id, month, year) DO UPDATE SET
         basic_salary=$4, hra=$5, conveyance=$6, other_allowances=$7, gross_salary=$8, pf_deduction=$9, esi_deduction=$10, tds_deduction=$11, advance_deduction=$12, other_deductions=$13, total_deductions=$14, net_salary=$15, days_present=$16, days_absent=$17, days_leave=$18, notes=$19, generated_by=$20, status='draft'
       RETURNING *`,
      [employee_id, month, year, basic_salary || 0, hra || 0, conveyance || 0, other_allowances || 0, gross, pf_deduction || 0, esi_deduction || 0, tds_deduction || 0, advance_deduction || 0, other_deductions || 0, deductions, net, days_present || 0, days_absent || 0, days_leave || 0, notes || null, req.user?.name ?? "admin"]
    );
    res.json(slip);
  } catch (e) { res.status(500).json({ error: "Failed to generate salary slip" }); }
});

router.post("/salary-slips/:id/pay", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { payment_mode } = req.body;
    await pool.query(
      `UPDATE salary_slips SET status='paid', paid_at=NOW(), payment_mode=$1 WHERE id=$2`,
      [payment_mode || "bank_transfer", req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to mark as paid" }); }
});

// ── HR Stats ──────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [empStats, leaveStats, payStats] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM employees`),
      q1(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*) FILTER (WHERE status='approved')::int AS approved, COUNT(*) FILTER (WHERE from_date >= CURRENT_DATE)::int AS upcoming FROM leave_requests`),
      q1(`SELECT COALESCE(SUM(net_salary),0)::numeric AS total_payroll, COUNT(*)::int AS slips, COUNT(*) FILTER (WHERE status='paid')::int AS paid FROM salary_slips WHERE month=EXTRACT(MONTH FROM CURRENT_DATE)::int AND year=EXTRACT(YEAR FROM CURRENT_DATE)::int`),
    ]);
    res.json({ employees: empStats, leaves: leaveStats, payroll_this_month: payStats });
  } catch (e) { res.status(500).json({ error: "Failed to fetch HR stats" }); }
});

export default router;
