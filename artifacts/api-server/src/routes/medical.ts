import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

const router = Router();
router.use(requireModuleAccess("pilgrims") as any);

// GET all medical cases
router.get("/cases", requireAdmin as any, async (req, res) => {
  const { groupId, status, severity } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds: string[] = [];
  if (groupId) { params.push(groupId); conds.push(`mc.group_id = $${params.length}`); }
  if (status) { params.push(status); conds.push(`mc.status = $${params.length}`); }
  if (severity) { params.push(severity); conds.push(`mc.severity = $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  try {
    const result = await pool.query(
      `SELECT mc.*, p.full_name, p.mobile_india, p.family_id, p.blood_group, p.gender,
        hg.group_name
       FROM medical_cases mc
       LEFT JOIN pilgrims p ON p.id = mc.pilgrim_id
       LEFT JOIN hajj_groups hg ON hg.id = mc.group_id
       ${where}
       ORDER BY
         CASE mc.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         mc.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("[medical] GET /cases error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET stats
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'in_treatment')::int AS in_treatment,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
        COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical,
        COUNT(*) FILTER (WHERE severity = 'high')::int AS high_priority
      FROM medical_cases
    `);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create case
router.post("/cases", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { pilgrimId, groupId, caseType, description, severity, handledBy, notes } = req.body;
  if (!pilgrimId) return res.status(400).json({ error: "pilgrimId required" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO medical_cases (id, pilgrim_id, group_id, case_type, description, severity, status, handled_by, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,NOW()) RETURNING *`,
      [id, pilgrimId, groupId||null, caseType||"general", description||null, severity||"low", handledBy||null, notes||null]
    );
    res.json(result.rows[0]);
    if (["critical", "high"].includes(severity || "")) {
      pool.query(`SELECT full_name, mobile_india FROM pilgrims WHERE id=$1`, [pilgrimId])
        .then(r => { if (r.rows[0]) fireNotificationEvent("medical_emergency", { customerName: r.rows[0].full_name, customerMobile: r.rows[0].mobile_india, severity: severity || undefined, description: description || undefined }).catch(() => {}); }).catch(() => {});
    }
  } catch (err: any) {
    console.error("[medical] POST /cases error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update case
router.put("/cases/:id", requireAdmin as any, async (req, res) => {
  const { caseType, description, severity, status, handledBy, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE medical_cases
       SET case_type=$1, description=$2, severity=$3, status=$4, handled_by=$5, notes=$6,
           resolved_at = CASE WHEN $4='resolved' THEN NOW() ELSE resolved_at END,
           updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [caseType, description||null, severity, status, handledBy||null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Case not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE case
router.delete("/cases/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM medical_cases WHERE id=$1`, [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET pilgrim medical profile
router.get("/pilgrim/:pilgrimId", requireAdmin as any, async (req, res) => {
  try {
    const [cases, profile] = await Promise.all([
      pool.query(`SELECT * FROM medical_cases WHERE pilgrim_id=$1 ORDER BY created_at DESC`, [req.params.pilgrimId]),
      pool.query(`SELECT id, full_name, blood_group, medical_condition, mobile_india FROM pilgrims WHERE id=$1`, [req.params.pilgrimId]),
    ]);
    res.json({ cases: cases.rows, profile: profile.rows[0] || {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update pilgrim medical profile (extends existing medical_condition field)
router.put("/pilgrim/:pilgrimId/profile", requireAdmin as any, async (req, res) => {
  const { medicalCondition, bloodGroup } = req.body;
  try {
    await pool.query(
      `UPDATE pilgrims SET medical_condition=$1, blood_group=$2 WHERE id=$3`,
      [medicalCondition||null, bloodGroup||null, req.params.pilgrimId]
    );
    res.json({ message: "Profile updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
