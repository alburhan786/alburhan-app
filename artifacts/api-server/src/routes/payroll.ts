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

// ── Process Monthly Payroll ───────────────────────────────────────────────────
router.post("/run", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      employee_id, month, present_days, working_days,
      advance_deduction, tds_deduction, other_deductions, notes
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
    const allowTotal = Object.values(allowances).reduce((s: number, v: any) => s + parseFloat(v || 0), 0) * ratio;
    const gross = basic + hra + allowTotal;

    // PF: 12% of basic (mandatory if basic ≤ 15000 under EPFO)
    const pfDeduction = basic <= 15000 ? basic * 0.12 : 1800;
    // ESI: 0.75% of gross if gross ≤ 21000/month
    const esiDeduction = gross <= 21000 ? gross * 0.0075 : 0;
    const tds = parseFloat(tds_deduction || 0);
    const advance = parseFloat(advance_deduction || 0);
    const other = parseFloat(other_deductions || 0);

    const totalDeductions = pfDeduction + esiDeduction + tds + advance + other;
    const netSalary = Math.max(0, gross - totalDeductions);

    // Check if payroll already run for this employee + month
    const existing = await q1(`SELECT id FROM payroll_runs WHERE employee_id=$1 AND month=$2`, [employee_id, month]);
    if (existing) {
      // Update existing run
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
      return res.json({ ...row, employee: emp });
    }

    const row = await q1(
      `INSERT INTO payroll_runs
        (id,employee_id,month,present_days,working_days,gross_salary,basic_salary,hra,allowances,
         pf_deduction,esi_deduction,tds_deduction,advance_deduction,other_deductions,total_deductions,net_salary,notes)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [employee_id, month, pd, wd, gross, basic, hra, JSON.stringify(allowances),
       pfDeduction, esiDeduction, tds, advance, other, totalDeductions, netSalary, notes||null]
    );
    res.json({ ...row, employee: emp });
  } catch (err) {
    console.error("[payroll] POST /run:", err);
    res.status(500).json({ error: "Failed to process payroll" });
  }
});

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
