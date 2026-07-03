import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();

const CITIES = ["Makkah", "Madinah", "Aziziah", "Mina", "Arafat", "Other"];

// GET all hotels
router.get("/", requireAdmin as any, async (req, res) => {
  const { groupId, city, includeDeleted } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds: string[] = [];
  if (!includeDeleted) conds.push("h.is_deleted = false");
  if (groupId) { params.push(groupId); conds.push(`h.group_id = $${params.length}`); }
  if (city) { params.push(city); conds.push(`h.city = $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  try {
    const result = await pool.query(
      `SELECT h.*,
        hg.group_name,
        (SELECT COUNT(*)::int FROM hotel_rooms r WHERE r.hotel_id = h.id AND r.is_deleted = false) AS room_count,
        (SELECT COUNT(*)::int FROM pilgrim_room_assignments ra WHERE ra.hotel_id = h.id) AS assigned_count
       FROM hotels h
       LEFT JOIN hajj_groups hg ON hg.id = h.group_id
       ${where}
       ORDER BY h.city, h.name`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("[hotels] GET / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET rooms for a hotel
router.get("/:hotelId/rooms", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*)::int FROM pilgrim_room_assignments ra WHERE ra.room_id = r.id) AS assigned_count
       FROM hotel_rooms r
       WHERE r.hotel_id = $1 AND r.is_deleted = false
       ORDER BY r.floor NULLS LAST, r.room_number`,
      [req.params.hotelId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET room assignments for a hotel
router.get("/:hotelId/assignments", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ra.*, p.full_name, p.mobile_india, p.family_id,
        r.room_number, r.floor, r.bed_type
       FROM pilgrim_room_assignments ra
       JOIN pilgrims p ON p.id = ra.pilgrim_id
       JOIN hotel_rooms r ON r.id = ra.room_id
       WHERE ra.hotel_id = $1
       ORDER BY r.floor NULLS LAST, r.room_number, p.full_name`,
      [req.params.hotelId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create hotel
router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { name, city, address, stars, groupId, checkInDate, checkOutDate, totalRooms, contactPhone, notes } = req.body;
  if (!name || !city) return res.status(400).json({ error: "Name and city are required" });
  if (city && !CITIES.includes(city)) return res.status(400).json({ error: "Invalid city" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO hotels (id, name, city, address, stars, group_id, check_in_date, check_out_date, total_rooms, contact_phone, notes, is_deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,NOW(),NOW()) RETURNING *`,
      [id, name, city, address||null, stars||null, groupId||null, checkInDate||null, checkOutDate||null, totalRooms||null, contactPhone||null, notes||null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("[hotels] POST / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update hotel
router.put("/:id", requireAdmin as any, async (req, res) => {
  const { name, city, address, stars, groupId, checkInDate, checkOutDate, totalRooms, contactPhone, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE hotels SET name=$1, city=$2, address=$3, stars=$4, group_id=$5, check_in_date=$6, check_out_date=$7,
        total_rooms=$8, contact_phone=$9, notes=$10, updated_at=NOW()
       WHERE id=$11 AND is_deleted=false RETURNING *`,
      [name, city, address||null, stars||null, groupId||null, checkInDate||null, checkOutDate||null, totalRooms||null, contactPhone||null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Hotel not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (soft delete)
router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `UPDATE hotels SET is_deleted=true, deleted_at=NOW(), deleted_by=$1, updated_at=NOW() WHERE id=$2`,
      [req.user?.name || "admin", req.params.id]
    );
    res.json({ message: "Hotel moved to trash" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST restore
router.post("/:id/restore", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE hotels SET is_deleted=false, deleted_at=NULL, deleted_by=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: "Hotel restored" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST add room
router.post("/:hotelId/rooms", requireAdmin as any, async (req, res) => {
  const { roomNumber, floor, capacity, bedType, notes } = req.body;
  if (!roomNumber) return res.status(400).json({ error: "Room number required" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO hotel_rooms (id, hotel_id, room_number, floor, capacity, bed_type, notes, is_deleted, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW()) RETURNING *`,
      [id, req.params.hotelId, roomNumber, floor||null, capacity||2, bedType||"Double", notes||null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE room
router.delete("/:hotelId/rooms/:roomId", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE hotel_rooms SET is_deleted=true WHERE id=$1 AND hotel_id=$2`, [req.params.roomId, req.params.hotelId]);
    res.json({ message: "Room deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign pilgrim to room
router.post("/:hotelId/rooms/:roomId/assign", requireAdmin as any, async (req, res) => {
  const { pilgrimId } = req.body;
  if (!pilgrimId) return res.status(400).json({ error: "pilgrimId required" });
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO pilgrim_room_assignments (id, hotel_id, room_id, pilgrim_id, assigned_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (pilgrim_id, hotel_id) DO UPDATE SET room_id=EXCLUDED.room_id, assigned_at=NOW()`,
      [id, req.params.hotelId, req.params.roomId, pilgrimId]
    );
    res.json({ message: "Assigned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE pilgrim assignment
router.delete("/:hotelId/rooms/:roomId/assign/:pilgrimId", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM pilgrim_room_assignments WHERE hotel_id=$1 AND room_id=$2 AND pilgrim_id=$3`,
      [req.params.hotelId, req.params.roomId, req.params.pilgrimId]
    );
    res.json({ message: "Unassigned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
