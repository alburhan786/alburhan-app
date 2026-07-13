import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();

router.get("/", requireAdmin as any, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT z.*, 
        b.bus_number, b.driver_name, b.driver_mobile,
        hg.year as group_year,
        (SELECT COUNT(*)::int FROM ziyarat_attendance za WHERE za.schedule_id = z.id AND za.checked_in = true) AS checked_in_count
      FROM ziyarat_schedules z
      LEFT JOIN buses b ON z.bus_id = b.id
      LEFT JOIN hajj_groups hg ON z.group_id = hg.id
      ORDER BY z.schedule_date DESC, z.departure_time ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", requireAdmin as any, async (req, res) => {
  try {
    const {
      name, location, city = "Makkah", schedule_date, departure_time, return_time,
      bus_id, group_id, guide_name, guide_mobile, capacity = 50, notes, status = "scheduled"
    } = req.body;
    if (!name || !location || !schedule_date) return void res.status(400).json({ message: "name, location, schedule_date required" });
    const id = randomUUID();
    await pool.query(
      `INSERT INTO ziyarat_schedules (id, name, location, city, schedule_date, departure_time, return_time, bus_id, group_id, guide_name, guide_mobile, capacity, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, name, location, city, schedule_date, departure_time || null, return_time || null,
       bus_id || null, group_id || null, guide_name || null, guide_mobile || null, capacity, notes || null, status]
    );
    const row = await pool.query(`SELECT * FROM ziyarat_schedules WHERE id=$1`, [id]);
    res.status(201).json(row.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", requireAdmin as any, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, location, city, schedule_date, departure_time, return_time,
      bus_id, group_id, guide_name, guide_mobile, capacity, notes, status
    } = req.body;
    await pool.query(
      `UPDATE ziyarat_schedules SET name=COALESCE($1,name), location=COALESCE($2,location), city=COALESCE($3,city),
       schedule_date=COALESCE($4,schedule_date), departure_time=$5, return_time=$6, bus_id=$7, group_id=$8,
       guide_name=$9, guide_mobile=$10, capacity=COALESCE($11,capacity), notes=$12, status=COALESCE($13,status),
       updated_at=NOW() WHERE id=$14`,
      [name, location, city, schedule_date, departure_time || null, return_time || null,
       bus_id || null, group_id || null, guide_name || null, guide_mobile || null, capacity, notes || null, status, id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM ziyarat_attendance WHERE schedule_id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM ziyarat_schedules WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id/attendance", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT za.*, p.full_name, p.mobile_india, p.photo_url
      FROM ziyarat_attendance za
      LEFT JOIN pilgrims p ON za.pilgrim_id = p.id
      WHERE za.schedule_id = $1
      ORDER BY p.full_name
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/attendance", requireAdmin as any, async (req, res) => {
  try {
    const { pilgrim_id, checked_in, notes } = req.body;
    await pool.query(
      `INSERT INTO ziyarat_attendance (schedule_id, pilgrim_id, checked_in, check_in_time, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (schedule_id, pilgrim_id) DO UPDATE SET
         checked_in = EXCLUDED.checked_in,
         check_in_time = CASE WHEN EXCLUDED.checked_in THEN NOW() ELSE NULL END,
         notes = EXCLUDED.notes`,
      [req.params.id, pilgrim_id, checked_in, null, notes || null]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/bulk-add-group", requireAdmin as any, async (req, res) => {
  try {
    const { group_id } = req.body;
    const pilgrims = await pool.query(`SELECT id FROM pilgrims WHERE group_id=$1`, [group_id]);
    for (const p of pilgrims.rows) {
      await pool.query(
        `INSERT INTO ziyarat_attendance (schedule_id, pilgrim_id, checked_in) VALUES ($1,$2,false)
         ON CONFLICT (schedule_id, pilgrim_id) DO NOTHING`,
        [req.params.id, p.id]
      );
    }
    res.json({ added: pilgrims.rows.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
