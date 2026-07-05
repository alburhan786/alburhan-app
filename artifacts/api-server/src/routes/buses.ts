import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

const router = Router();
router.use(requireModuleAccess("groups") as any);

// GET all buses
router.get("/", requireAdmin as any, async (req, res) => {
  const { groupId } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds = ["b.is_deleted = false"];
  if (groupId) { params.push(groupId); conds.push(`b.group_id = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT b.*, hg.group_name,
        (SELECT COUNT(*)::int FROM pilgrim_bus_assignments pba WHERE pba.bus_id = b.id) AS assigned_count
       FROM buses b
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE ${conds.join(" AND ")}
       ORDER BY hg.group_name, b.bus_number`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("[buses] GET / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET pilgrims on a bus
router.get("/:busId/pilgrims", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pba.*, p.full_name, p.mobile_india, p.family_id, p.gender, p.serial_number
       FROM pilgrim_bus_assignments pba
       JOIN pilgrims p ON p.id = pba.pilgrim_id
       WHERE pba.bus_id = $1
       ORDER BY pba.seat_number NULLS LAST, p.full_name`,
      [req.params.busId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create bus
router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { busNumber, groupId, capacity, vehicleType, driverName, driverMobile, routeDescription, notes } = req.body;
  if (!busNumber || !groupId) return res.status(400).json({ error: "Bus number and group ID are required" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO buses (id, bus_number, group_id, capacity, vehicle_type, driver_name, driver_mobile, route_description, notes, is_deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,NOW(),NOW()) RETURNING *`,
      [id, busNumber, groupId, capacity||45, vehicleType||"Coach", driverName||null, driverMobile||null, routeDescription||null, notes||null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("[buses] POST / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update bus
router.put("/:id", requireAdmin as any, async (req, res) => {
  const { busNumber, groupId, capacity, vehicleType, driverName, driverMobile, routeDescription, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE buses SET bus_number=$1, group_id=$2, capacity=$3, vehicle_type=$4, driver_name=$5, driver_mobile=$6,
        route_description=$7, notes=$8, updated_at=NOW()
       WHERE id=$9 AND is_deleted=false RETURNING *`,
      [busNumber, groupId, capacity||45, vehicleType||"Coach", driverName||null, driverMobile||null, routeDescription||null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Bus not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (soft delete)
router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`UPDATE buses SET is_deleted=true, deleted_at=NOW(), updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: "Bus deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign pilgrim to bus
router.post("/:busId/assign", requireAdmin as any, async (req, res) => {
  const { pilgrimId, seatNumber } = req.body;
  if (!pilgrimId) return res.status(400).json({ error: "pilgrimId required" });
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO pilgrim_bus_assignments (id, bus_id, pilgrim_id, seat_number, assigned_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (bus_id, pilgrim_id) DO UPDATE SET seat_number=EXCLUDED.seat_number`,
      [id, req.params.busId, pilgrimId, seatNumber||null]
    );
    // Also update pilgrims.bus_number for quick reference
    const bus = await pool.query(`SELECT bus_number FROM buses WHERE id=$1`, [req.params.busId]);
    if (bus.rows[0]) {
      await pool.query(`UPDATE pilgrims SET bus_number=$1, seat_number=$2 WHERE id=$3`, [bus.rows[0].bus_number, seatNumber||null, pilgrimId]);
    }
    res.json({ message: "Assigned" });
    pool.query(`SELECT p.full_name, p.mobile_india, b.bus_number FROM pilgrims p, buses b WHERE p.id=$1 AND b.id=$2`, [pilgrimId, req.params.busId])
      .then(r => { if (r.rows[0]) fireNotificationEvent("bus_assigned", { customerName: r.rows[0].full_name, customerMobile: r.rows[0].mobile_india, busNumber: r.rows[0].bus_number, seatNumber: seatNumber || undefined }).catch(() => {}); }).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE assignment
router.delete("/:busId/assign/:pilgrimId", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`DELETE FROM pilgrim_bus_assignments WHERE bus_id=$1 AND pilgrim_id=$2`, [req.params.busId, req.params.pilgrimId]);
    res.json({ message: "Unassigned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
