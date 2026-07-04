import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();
router.use(requireModuleAccess("payroll") as any);

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// ── Employee CRUD ─────────────────────────────────────────────────────────────
router.get("/employees", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM employees WHERE is_active=true ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error("[payroll] GET /employees:", err);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

router.post("/employees", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, designation, department, mobile, email, bank_account, ifsc, pan,
      pf_number, esi_number, joining_date, basic_salary, hra, allowances, notes
    } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const gross = (parseFloat(basic_salary || 0) + parseFloat(hra || 0) +
      (typeof allowances === "object" && allowances
        ? Object.values(allowances).reduce((s: number, v: any) => s + parseFloat(v || 0), 0)
        : 0));
    const row = await q1(
      `INSERT INTO employees
        (id,name,designation,department,mobile,email,bank_account,ifsc,pan,pf_number,esi_number,joining_date,basic_salary,hra,allowances,total_salary,notes)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16) RETURNING *`,
      [name, designation||null, department||null, mobile||null, email||null,
       bank_account||null, ifsc||null, pan||null, pf_number||null, esi_number||null,
       joining_date||null, String(basic_salary||0), String(hra||0),
       JSON.stringify(allowances||{}), String(gross), notes||null]
    );
    res.json(row);
  } catch (err) {
    console.error("[payroll] POST /employees:", err);
    res.status(500).json({ error: "Failed to create employee" });
  }
});

router.put("/employees/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, designation, department, mobile, email, bank_account, ifsc, pan,
      pf_number, esi_number, joining_date, basic_salary, hra, allowances, notes, is_active
    } = req.body;
    const gross = (parseFloat(basic_salary || 0) + parseFloat(hra || 0) +
      (typeof allowances === "object" && allowances
        ? Object.values(allowances).reduce((s: number, v: any) => s + parseFloat(v || 0), 0)
        : 0));
    const row = await q1(
      `UPDATE employees SET
        name=$1, designation=$2, department=$3, mobile=$4, email=$5,
        bank_account=$6, ifsc=$7, pan=$8, pf_number=$9, esi_number=$10,
        joining_date=$11, basic_salary=$12, hra=$13, allowances=$14::jsonb,
        total_salary=$15, notes=$16, is_active=COALESCE($17, is_active), updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [name, designation||null, department||null, mobile||null, email||null,
       bank_account||null, ifsc||null, pan||null, pf_number||null, esi_number||null,
       joining_date||null, String(basic_salary||0), String(hra||0),
       JSON.stringify(allowances||{}), String(gross), notes||null,
       is_active !== undefined ? is_active : null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Employee not found" });
    res.json(row);
  } catch (err) {
    console.error("[payroll] PUT /employees/:id:", err);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

router.delete("/employees/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`UPDATE employees SET is_active=false WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[payroll] DELETE /employees/:id:", err);
    res.status(500).json({ error: "Failed to deactivate employee" });
  }
});

// ── Advance Management ────────────────────────────────────────────────────────
router.get("/advances/:employeeId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await q(
      `SELECT ea.*, e.name AS employee_name
       FROM employee_advances ea
       JOIN employees e ON e.id=ea.employee_id
       WHERE ea.employee_id=$1 ORDER BY ea.created_at DESC`,
      [req.params.employeeId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[payroll] GET /advances/:id:", err);
    res.status(500).json({ error: "Failed to fetch advances" });
  }
});

router.get("/advances", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(
      `SELECT ea.*, e.name AS employee_name, e.department
       FROM employee_advances ea
       JOIN employees e ON e.id=ea.employee_id
       ORDER BY ea.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error("[payroll] GET /advances:", err);
    res.status(500).json({ error: "Failed to fetch advances" });
  }
});

router.post("/advances", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { employee_id, amount, date, reason } = req.body;
    if (!employee_id || !amount || !date) return res.status(400).json({ error: "employee_id, amount, date required" });
    const row = await q1(
      `INSERT INTO employee_advances (id,employee_id,amount,date,reason)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4) RETURNING *`,
      [employee_id, String(amount), date, reason||null]
    );
    res.json(row);
  } catch (err) {
    console.error("[payroll] POST /advances:", err);
    res.status(500).json({ error: "Failed to record advance" });
  }
});

router.put("/advances/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    const row = await q1(
      `UPDATE employee_advances SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Advance not found" });
    res.json(row);
  } catch (err) {
    console.error("[payroll] PUT /advances/:id:", err);
    res.status(500).json({ error: "Failed to update advance" });
  }
});

// ── Process Monthly Payroll ───────────────────────────────────────────────────
router.post("/run", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      employee_id, month, present_days, working_days,
      tds_deduction, other_deductions, notes
    } = req.body;
    if (!employee_id || !month) return res.status(400).json({ error: "employee_id and month required" });

    const emp = await q1(`SELECT * FROM employees WHERE id=$1 AND is_active=true`, [employee_id]);
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const wd = parseFloat(working_days || 26);
    const pd = parseFloat(present_days || wd);
    const ratio = Math.min(pd / wd, 1);

    const basic = parseFloat(emp.basic_salary || 0) * ratio;
    const hra = parseFloat(emp.hra || 0) * ratio;
    const allowances = emp.allowances || {};
    const allowTotal = Object.values(allowances as Record<string, any>).reduce((s: number, v: any) => s + parseFloat(v || 0), 0) * ratio;
    const gross = basic + hra + allowTotal;

    // PF: 12% of basic (mandatory if basic ≤ 15000 under EPFO)
    const pfDeduction = basic <= 15000 ? basic * 0.12 : 1800;
    // ESI: 0.75% of gross if gross ≤ 21000/month
    const esiDeduction = gross <= 21000 ? gross * 0.0075 : 0;
    const tds = parseFloat(tds_deduction || 0);
    const other = parseFloat(other_deductions || 0);

    // Auto-fetch pending advances for this employee and sum them
    const pendingAdvances = await q(
      `SELECT * FROM employee_advances WHERE employee_id=$1 AND status='pending' ORDER BY date`,
      [employee_id]
    );
    const autoAdvance = pendingAdvances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
    // Allow manual override: if body has advance_deduction, use that; otherwise use auto-sum
    const manualAdvance = req.body.advance_deduction !== undefined ? parseFloat(req.body.advance_deduction) : null;
    const advance = manualAdvance !== null ? manualAdvance : autoAdvance;

    const totalDeductions = pfDeduction + esiDeduction + tds + advance + other;
    const netSalary = Math.max(0, gross - totalDeductions);

    // Check if payroll already run for this employee + month
    const existing = await q1(`SELECT id FROM payroll_runs WHERE employee_id=$1 AND month=$2`, [employee_id, month]);
    let runId: string;

    if (existing) {
      const row = await q1(
        `UPDATE payroll_runs SET
          present_days=$1, working_days=$2, gross_salary=$3, basic_salary=$4, hra=$5,
          allowances=$6::jsonb, pf_deduction=$7, esi_deduction=$8, tds_deduction=$9,
          advance_deduction=$10, other_deductions=$11, total_deductions=$12, net_salary=$13,
          notes=$14, updated_at=NOW()
         WHERE id=$15 RETURNING *`,
        [pd, wd, gross, basic, hra, JSON.stringify(allowances), pfDeduction, esiDeduction,
         tds, advance, other, totalDeductions, netSalary, notes||null, existing.id]
      );
      runId = existing.id;
      // Delete old entries for re-run
      await pool.query(`DELETE FROM payroll_entries WHERE payroll_run_id=$1`, [runId]);
      // Mark advances as deducted
      if (pendingAdvances.length > 0) {
        await pool.query(
          `UPDATE employee_advances SET status='deducted', payroll_run_id=$1 WHERE employee_id=$2 AND status='pending'`,
          [runId, employee_id]
        );
      }
      // Create fresh payroll entries
      await insertPayrollEntries(runId, employee_id, month, { basic, hra, allowances, allowTotal, gross, pfDeduction, esiDeduction, tds, advance, other });
      return res.json({ ...row, employee: emp, advance_auto_detected: autoAdvance, pending_advances_count: pendingAdvances.length });
    }

    const row = await q1(
      `INSERT INTO payroll_runs
        (id,employee_id,month,present_days,working_days,gross_salary,basic_salary,hra,allowances,
         pf_deduction,esi_deduction,tds_deduction,advance_deduction,other_deductions,total_deductions,net_salary,notes)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [employee_id, month, pd, wd, gross, basic, hra, JSON.stringify(allowances),
       pfDeduction, esiDeduction, tds, advance, other, totalDeductions, netSalary, notes||null]
    );
    runId = row.id;

    // Mark advances as deducted
    if (pendingAdvances.length > 0) {
      await pool.query(
        `UPDATE employee_advances SET status='deducted', payroll_run_id=$1 WHERE employee_id=$2 AND status='pending'`,
        [runId, employee_id]
      );
    }

    // Create payroll_entries line items
    await insertPayrollEntries(runId, employee_id, month, { basic, hra, allowances, allowTotal, gross, pfDeduction, esiDeduction, tds, advance, other });

    res.json({ ...row, employee: emp, advance_auto_detected: autoAdvance, pending_advances_count: pendingAdvances.length });
  } catch (err) {
    console.error("[payroll] POST /run:", err);
    res.status(500).json({ error: "Failed to process payroll" });
  }
});

async function insertPayrollEntries(
  runId: string, employeeId: string, month: string,
  { basic, hra, allowances, allowTotal, gross, pfDeduction, esiDeduction, tds, advance, other }:
  { basic: number; hra: number; allowances: Record<string, any>; allowTotal: number; gross: number;
    pfDeduction: number; esiDeduction: number; tds: number; advance: number; other: number }
) {
  const entries: Array<[string, string, string, string, string, number]> = [
    [runId, employeeId, month, "Basic Salary", "earning", basic],
    [runId, employeeId, month, "HRA", "earning", hra],
  ];
  Object.entries(allowances).forEach(([k, v]) => {
    const amt = parseFloat(String(v || 0));
    if (amt > 0) entries.push([runId, employeeId, month, k.charAt(0).toUpperCase() + k.slice(1) + " Allowance", "earning", amt]);
  });
  entries.push([runId, employeeId, month, "PF Deduction", "deduction", pfDeduction]);
  if (esiDeduction > 0) entries.push([runId, employeeId, month, "ESI Deduction", "deduction", esiDeduction]);
  if (tds > 0) entries.push([runId, employeeId, month, "TDS", "deduction", tds]);
  if (advance > 0) entries.push([runId, employeeId, month, "Advance Recovery", "deduction", advance]);
  if (other > 0) entries.push([runId, employeeId, month, "Other Deductions", "deduction", other]);

  for (const [rid, eid, m, name, type, amount] of entries) {
    await pool.query(
      `INSERT INTO payroll_entries (id,payroll_run_id,employee_id,month,component_name,component_type,amount)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6)`,
      [rid, eid, m, name, type, amount]
    );
  }
}

// ── Payroll Register ──────────────────────────────────────────────────────────
router.get("/register", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = "";
    if (month) { params.push(month); where = `WHERE pr.month=$1`; }

    const rows = await q(`
      SELECT pr.*, e.name AS employee_name, e.designation, e.department, e.mobile
      FROM payroll_runs pr
      JOIN employees e ON e.id=pr.employee_id
      ${where}
      ORDER BY pr.month DESC, e.name
    `, params);
    res.json(rows);
  } catch (err) {
    console.error("[payroll] GET /register:", err);
    res.status(500).json({ error: "Failed to fetch payroll register" });
  }
});

// ── Payslip Data ──────────────────────────────────────────────────────────────
router.get("/payslip/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const run = await q1(
      `SELECT pr.*, e.name AS employee_name, e.designation, e.department,
              e.mobile, e.bank_account, e.ifsc, e.pan, e.pf_number, e.esi_number
       FROM payroll_runs pr
       JOIN employees e ON e.id=pr.employee_id
       WHERE pr.id=$1`,
      [req.params.id]
    );
    if (!run) return res.status(404).json({ error: "Payroll run not found" });
    res.json(run);
  } catch (err) {
    console.error("[payroll] GET /payslip/:id:", err);
    res.status(500).json({ error: "Failed to fetch payslip" });
  }
});

// ── Payroll runs per employee ─────────────────────────────────────────────────
router.get("/employee/:id/history", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await q(
      `SELECT * FROM payroll_runs WHERE employee_id=$1 ORDER BY month DESC LIMIT 24`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("[payroll] GET /employee/:id/history:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
