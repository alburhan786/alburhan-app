import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();

router.get("/", requireAdmin as any, async (req, res) => {
  try {
    const { site, group_id } = req.query as Record<string, string>;
    let sql = `
      SELECT ha.*, p.full_name as pilgrim_name, p.mobile_india,
             hg.year as group_year, hg.name as group_name
      FROM holy_site_allocations ha
      LEFT JOIN pilgrims p ON ha.pilgrim_id = p.id
      LEFT JOIN hajj_groups hg ON ha.group_id = hg.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (site) { params.push(site); sql += ` AND ha.site = $${params.length}`; }
    if (group_id) { params.push(group_id); sql += ` AND ha.group_id = $${params.length}`; }
    sql += ` ORDER BY ha.site, ha.tent_number, ha.camp_number`;
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
        site,
        COUNT(*)::int as total,
        COUNT(DISTINCT tent_number) FILTER (WHERE tent_number IS NOT NULL)::int as tents_used,
        COUNT(DISTINCT group_id) FILTER (WHERE group_id IS NOT NULL)::int as groups
      FROM holy_site_allocations
      GROUP BY site
    `);
    const out: Record<string, any> = { mina: {}, arafat: {}, muzdalifah: {} };
    for (const row of r.rows) out[row.site] = row;
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", requireAdmin as any, async (req, res) => {
  try {
    const {
      site, pilgrim_id, family_id, group_id,
      tent_number, camp_number, area, capacity, guide_name, notes
    } = req.body;
    if (!site || !["mina", "arafat", "muzdalifah"].includes(site)) {
      return res.status(400).json({ message: "site must be mina, arafat, or muzdalifah" });
    }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO holy_site_allocations (id, site, pilgrim_id, family_id, group_id, tent_number, camp_number, area, capacity, guide_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, site, pilgrim_id || null, family_id || null, group_id || null,
       tent_number || null, camp_number || null, area || null, capacity || null, guide_name || null, notes || null]
    );
    const row = await pool.query(`SELECT * FROM holy_site_allocations WHERE id=$1`, [id]);
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", requireAdmin as any, async (req, res) => {
  try {
    const { id } = req.params;
    const { site, pilgrim_id, family_id, group_id, tent_number, camp_number, area, capacity, guide_name, notes } = req.body;
    await pool.query(
      `UPDATE holy_site_allocations SET
         site=COALESCE($1,site), pilgrim_id=$2, family_id=$3, group_id=$4,
         tent_number=$5, camp_number=$6, area=$7, capacity=$8, guide_name=$9, notes=$10,
         updated_at=NOW()
       WHERE id=$11`,
      [site, pilgrim_id || null, family_id || null, group_id || null,
       tent_number || null, camp_number || null, area || null, capacity || null, guide_name || null, notes || null, id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM holy_site_allocations WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
