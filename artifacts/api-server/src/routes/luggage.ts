import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();

router.get("/", requireAdmin as any, async (req, res) => {
  try {
    const { group_id, status, q } = req.query as Record<string, string>;
    let sql = `
      SELECT lt.*, p.full_name as pilgrim_name_resolved, p.mobile_india, p.photo_url, hg.year as group_year
      FROM luggage_tags lt
      LEFT JOIN pilgrims p ON lt.pilgrim_id = p.id
      LEFT JOIN hajj_groups hg ON lt.group_id = hg.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (group_id) { params.push(group_id); sql += ` AND lt.group_id = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND lt.status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (lt.tag_number ILIKE $${params.length} OR lt.pilgrim_name ILIKE $${params.length} OR p.full_name ILIKE $${params.length})`; }
    sql += ` ORDER BY lt.created_at DESC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status='assigned')::int as assigned,
        COUNT(*) FILTER (WHERE status='in_transit')::int as in_transit,
        COUNT(*) FILTER (WHERE status='delivered')::int as delivered,
        COUNT(*) FILTER (WHERE status='lost')::int as lost,
        COALESCE(SUM(weight),0)::numeric as total_weight
      FROM luggage_tags
    `);
    res.json(r.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", requireAdmin as any, async (req, res) => {
  try {
    const {
      tag_number, pilgrim_id, booking_id, pilgrim_name, group_id,
      weight, status = "assigned", location, delivery_status = "pending", notes
    } = req.body;
    if (!tag_number) return void res.status(400).json({ message: "tag_number required" });
    const id = randomUUID();
    await pool.query(
      `INSERT INTO luggage_tags (id, tag_number, pilgrim_id, booking_id, pilgrim_name, group_id, weight, status, location, delivery_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, tag_number, pilgrim_id || null, booking_id || null, pilgrim_name || null,
       group_id || null, weight || null, status, location || null, delivery_status, notes || null]
    );
    const row = await pool.query(`SELECT * FROM luggage_tags WHERE id=$1`, [id]);
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") return void res.status(400).json({ message: "Tag number already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", requireAdmin as any, async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_number, pilgrim_id, booking_id, pilgrim_name, group_id, weight, status, location, delivery_status, notes } = req.body;
    await pool.query(
      `UPDATE luggage_tags SET
         tag_number=COALESCE($1,tag_number), pilgrim_id=$2, booking_id=$3, pilgrim_name=$4,
         group_id=$5, weight=$6, status=COALESCE($7,status), location=$8,
         delivery_status=COALESCE($9,delivery_status), notes=$10, updated_at=NOW()
       WHERE id=$11`,
      [tag_number, pilgrim_id || null, booking_id || null, pilgrim_name || null,
       group_id || null, weight || null, status, location || null, delivery_status, notes || null, id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === "23505") return void res.status(400).json({ message: "Tag number already exists" });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM luggage_tags WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
