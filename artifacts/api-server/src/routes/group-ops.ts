// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendText } from "../lib/botbee.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;

export async function ensureGroupOpsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tent_allocations (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      group_id        TEXT NOT NULL,
      pilgrim_id      TEXT NOT NULL,
      mina_camp       TEXT,
      tent_number     TEXT,
      bed_number      TEXT,
      maktab_number   TEXT,
      maktab_name     TEXT,
      maktab_area     TEXT,
      arafat_camp     TEXT,
      muzdalifah_camp TEXT,
      status          TEXT DEFAULT 'allocated',
      notes           TEXT,
      allocated_by    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (group_id, pilgrim_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ta_group ON tent_allocations(group_id);
    CREATE INDEX IF NOT EXISTS idx_ta_pilgrim ON tent_allocations(pilgrim_id);

    CREATE TABLE IF NOT EXISTS group_broadcast_logs (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      group_id    TEXT NOT NULL,
      message     TEXT NOT NULL,
      channel     TEXT DEFAULT 'whatsapp',
      sent_count  INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      sent_by     TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gbl_group ON group_broadcast_logs(group_id);
  `);
}

// ── Tent / Maktab Allocations ────────────────────────────────────────────────
router.get("/tent-allocations/:groupId", requireAdmin as any, async (req, res) => {
  try {
    const rows = await q(`
      SELECT ta.*, p.full_name AS pilgrim_name, p.mobile_india, p.passport_number
      FROM tent_allocations ta
      LEFT JOIN pilgrims p ON p.id=ta.pilgrim_id
      WHERE ta.group_id=$1
      ORDER BY ta.tent_number, ta.bed_number`, [req.params.groupId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch tent allocations" }); }
});

router.get("/tent-allocations", requireAdmin as any, async (req, res) => {
  try {
    const { maktab_number, mina_camp, status } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (maktab_number) { params.push(maktab_number); filters.push(`ta.maktab_number=$${params.length}`); }
    if (mina_camp)     { params.push(mina_camp);     filters.push(`ta.mina_camp=$${params.length}`); }
    if (status)        { params.push(status);        filters.push(`ta.status=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT ta.*, p.full_name AS pilgrim_name, p.mobile_india FROM tent_allocations ta LEFT JOIN pilgrims p ON p.id=ta.pilgrim_id ${where} ORDER BY ta.mina_camp, ta.tent_number`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch allocations" }); }
});

router.post("/tent-allocations", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { group_id, pilgrim_id, mina_camp, tent_number, bed_number, maktab_number, maktab_name, maktab_area, arafat_camp, muzdalifah_camp, notes } = req.body;
    if (!group_id || !pilgrim_id) return void res.status(400).json({ error: "group_id and pilgrim_id required" });
    const row = await q1(
      `INSERT INTO tent_allocations (group_id, pilgrim_id, mina_camp, tent_number, bed_number, maktab_number, maktab_name, maktab_area, arafat_camp, muzdalifah_camp, notes, allocated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (group_id, pilgrim_id) DO UPDATE SET
         mina_camp=$3, tent_number=$4, bed_number=$5, maktab_number=$6, maktab_name=$7, maktab_area=$8, arafat_camp=$9, muzdalifah_camp=$10, notes=$11, allocated_by=$12, updated_at=NOW()
       RETURNING *`,
      [group_id, pilgrim_id, mina_camp || null, tent_number || null, bed_number || null, maktab_number || null, maktab_name || null, maktab_area || null, arafat_camp || null, muzdalifah_camp || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to upsert tent allocation" }); }
});

router.put("/tent-allocations/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { mina_camp, tent_number, bed_number, maktab_number, maktab_name, maktab_area, arafat_camp, muzdalifah_camp, status, notes } = req.body;
    await pool.query(
      `UPDATE tent_allocations SET mina_camp=$1, tent_number=$2, bed_number=$3, maktab_number=$4, maktab_name=$5, maktab_area=$6, arafat_camp=$7, muzdalifah_camp=$8, status=$9, notes=$10, allocated_by=$11, updated_at=NOW() WHERE id=$12`,
      [mina_camp, tent_number, bed_number, maktab_number, maktab_name, maktab_area, arafat_camp, muzdalifah_camp, status ?? "allocated", notes, req.user?.name ?? "admin", req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update tent allocation" }); }
});

router.delete("/tent-allocations/:id", requireAdmin as any, async (_req, res) => {
  try {
    await pool.query(`DELETE FROM tent_allocations WHERE id=$1`, [_req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete allocation" }); }
});

// Bulk upsert: import CSV data
router.post("/tent-allocations/bulk", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { allocations = [] } = req.body;
    let created = 0;
    for (const a of allocations) {
      await pool.query(
        `INSERT INTO tent_allocations (group_id, pilgrim_id, mina_camp, tent_number, bed_number, maktab_number, maktab_name, allocated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (group_id, pilgrim_id) DO UPDATE SET
           mina_camp=$3, tent_number=$4, bed_number=$5, maktab_number=$6, maktab_name=$7, allocated_by=$8, updated_at=NOW()`,
        [a.group_id, a.pilgrim_id, a.mina_camp || null, a.tent_number || null, a.bed_number || null, a.maktab_number || null, a.maktab_name || null, req.user?.name ?? "admin"]
      );
      created++;
    }
    res.json({ ok: true, processed: created });
  } catch (e) { res.status(500).json({ error: "Bulk allocation failed" }); }
});

// ── Room Sharing Matrix ──────────────────────────────────────────────────────
router.get("/room-sharing/:groupId", requireAdmin as any, async (req, res) => {
  try {
    const rooms = await q(`
      SELECT hr.room_number, hr.capacity, hr.floor, hr.hotel_id,
        COUNT(pra.pilgrim_id)::int AS occupied,
        JSON_AGG(JSON_BUILD_OBJECT(
          'id', p.id, 'name', p.full_name, 'gender', p.gender,
          'passport', p.passport_number, 'mobile', p.mobile_india
        ) ORDER BY p.full_name) FILTER (WHERE p.id IS NOT NULL) AS pilgrims
      FROM hajj_rooms hr
      LEFT JOIN pilgrim_room_assignments pra ON pra.room_id=hr.id
      LEFT JOIN pilgrims p ON p.id=pra.pilgrim_id
      WHERE hr.group_id=$1
      GROUP BY hr.id, hr.room_number, hr.capacity, hr.floor, hr.hotel_id
      ORDER BY hr.floor, hr.room_number
    `, [req.params.groupId]);
    res.json({ group_id: req.params.groupId, rooms });
  } catch (e) { res.status(500).json({ error: "Failed to fetch room sharing matrix" }); }
});

// ── Pilgrim Manifest ─────────────────────────────────────────────────────────
router.get("/manifest/:groupId", requireAdmin as any, async (req, res) => {
  try {
    const [group, pilgrims, tentAllocs, roomAllocs] = await Promise.all([
      q1(`SELECT g.*, hg.group_name FROM bookings b JOIN hajj_groups hg ON hg.id=$1 WHERE b.id=hg.booking_id LIMIT 1`, [req.params.groupId]).catch(() => q1(`SELECT * FROM hajj_groups WHERE id=$1`, [req.params.groupId])),
      q(`
        SELECT p.*, ta.tent_number, ta.bed_number, ta.maktab_number, ta.mina_camp,
          hr.room_number AS room_number, b.booking_number,
          COALESCE(pf.flight_number, '') AS flight_number, COALESCE(pf.departure_date::text, '') AS departure_date
        FROM pilgrims p
        LEFT JOIN tent_allocations ta ON ta.pilgrim_id=p.id AND ta.group_id=$1
        LEFT JOIN pilgrim_room_assignments pra ON pra.pilgrim_id=p.id
        LEFT JOIN hajj_rooms hr ON hr.id=pra.room_id AND hr.group_id=$1
        LEFT JOIN bookings b ON b.id=p.booking_id
        LEFT JOIN group_flights pf ON pf.group_id=$1
        WHERE p.group_id=$1
        ORDER BY p.full_name
      `, [req.params.groupId]),
      q1(`SELECT COUNT(*)::int AS total, COUNT(tent_number)::int AS allocated FROM tent_allocations WHERE group_id=$1`, [req.params.groupId]),
      q1(`SELECT COUNT(DISTINCT pilgrim_id)::int AS assigned FROM pilgrim_room_assignments pra JOIN hajj_rooms hr ON hr.id=pra.room_id WHERE hr.group_id=$1`, [req.params.groupId]),
    ]);

    res.json({
      group,
      pilgrims,
      summary: {
        total: pilgrims.length,
        tent_allocated: tentAllocs?.allocated ?? 0,
        room_assigned: roomAllocs?.assigned ?? 0,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: "Failed to generate manifest" }); }
});

// ── Group WhatsApp Broadcast ─────────────────────────────────────────────────
router.post("/broadcast/:groupId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { message } = req.body;
    if (!message) return void res.status(400).json({ error: "message is required" });

    const pilgrims = await q(
      `SELECT p.mobile_india, p.full_name FROM pilgrims p WHERE p.group_id=$1 AND p.mobile_india IS NOT NULL AND LENGTH(p.mobile_india) >= 10`,
      [req.params.groupId]
    );

    let sent = 0, failed = 0;
    for (const p of pilgrims) {
      try {
        const mobile = "91" + p.mobile_india.replace(/\D/g, "").slice(-10);
        await sendText(mobile, `Dear ${p.full_name},\n\n${message}`);
        sent++;
      } catch { failed++; }
    }

    await pool.query(
      `INSERT INTO group_broadcast_logs (group_id, message, sent_count, failed_count, sent_by) VALUES ($1,$2,$3,$4,$5)`,
      [req.params.groupId, message, sent, failed, req.user?.name ?? "admin"]
    );
    res.json({ ok: true, sent, failed, total: pilgrims.length });
  } catch (e) { res.status(500).json({ error: "Broadcast failed" }); }
});

router.get("/broadcast-logs/:groupId", requireAdmin as any, async (req, res) => {
  try {
    const rows = await q(`SELECT * FROM group_broadcast_logs WHERE group_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.groupId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch broadcast logs" }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [tents, maktabs, rooms] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS total, COUNT(tent_number)::int AS allocated, COUNT(DISTINCT group_id)::int AS groups FROM tent_allocations`),
      q1(`SELECT COUNT(DISTINCT maktab_number)::int AS total, COUNT(DISTINCT CONCAT(group_id, maktab_number))::int AS group_maktabs FROM tent_allocations WHERE maktab_number IS NOT NULL`),
      q1(`SELECT COUNT(*)::int AS total_rooms, COALESCE(SUM(capacity),0)::int AS total_capacity FROM hajj_rooms`),
    ]);
    res.json({ tents, maktabs, rooms });
  } catch (e) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

export default router;
