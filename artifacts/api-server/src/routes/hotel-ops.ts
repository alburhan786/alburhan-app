// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;

export async function ensureHotelOpsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hotel_contracts (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      hotel_id        TEXT,
      hotel_name      TEXT NOT NULL,
      contract_number TEXT UNIQUE,
      season          TEXT,
      valid_from      DATE NOT NULL,
      valid_to        DATE NOT NULL,
      room_type       TEXT DEFAULT 'standard',
      rate_per_night  NUMERIC(10,2) NOT NULL,
      total_rooms     INT DEFAULT 0,
      contracted_rooms INT DEFAULT 0,
      meal_plan       TEXT DEFAULT 'bb',
      payment_terms   TEXT,
      cancellation_policy TEXT,
      status          TEXT DEFAULT 'active',
      signed_by       TEXT,
      signed_at       DATE,
      notes           TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hc_hotel ON hotel_contracts(hotel_id);
    CREATE INDEX IF NOT EXISTS idx_hc_status ON hotel_contracts(status);

    CREATE TABLE IF NOT EXISTS hotel_vouchers (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      voucher_number  TEXT UNIQUE,
      booking_id      TEXT,
      group_id        TEXT,
      hotel_id        TEXT,
      hotel_name      TEXT NOT NULL,
      check_in_date   DATE NOT NULL,
      check_out_date  DATE NOT NULL,
      nights          INT DEFAULT 1,
      room_type       TEXT,
      room_count      INT DEFAULT 1,
      meal_plan       TEXT DEFAULT 'bb',
      pilgrim_count   INT DEFAULT 1,
      pilgrim_names   TEXT,
      rate_per_night  NUMERIC(10,2),
      total_amount    NUMERIC(12,2),
      status          TEXT DEFAULT 'issued',
      special_requests TEXT,
      issued_at       TIMESTAMPTZ DEFAULT NOW(),
      issued_by       TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hv_booking ON hotel_vouchers(booking_id);
    CREATE INDEX IF NOT EXISTS idx_hv_group ON hotel_vouchers(group_id);

    CREATE TABLE IF NOT EXISTS hotel_checkins (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      hotel_id        TEXT,
      hotel_name      TEXT,
      booking_id      TEXT,
      group_id        TEXT,
      room_number     TEXT,
      room_type       TEXT,
      pilgrim_ids     TEXT,
      guest_names     TEXT NOT NULL,
      expected_checkin DATE,
      expected_checkout DATE,
      actual_checkin  TIMESTAMPTZ,
      actual_checkout TIMESTAMPTZ,
      status          TEXT DEFAULT 'reserved',
      key_handed      BOOLEAN DEFAULT false,
      notes           TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hci_hotel ON hotel_checkins(hotel_id);
    CREATE INDEX IF NOT EXISTS idx_hci_booking ON hotel_checkins(booking_id);
    CREATE INDEX IF NOT EXISTS idx_hci_status ON hotel_checkins(status);
  `);
}

function nextVoucherNum(): string {
  return `HV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}
function nextContractNum(): string {
  return `HC-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
}

// ── Hotel Contracts ─────────────────────────────────────────────────────────
router.get("/contracts", requireAdmin as any, async (req, res) => {
  try {
    const { hotel_id, status, season } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (hotel_id) { params.push(hotel_id); filters.push(`hotel_id=$${params.length}`); }
    if (status)   { params.push(status);   filters.push(`status=$${params.length}`); }
    if (season)   { params.push(season);   filters.push(`season=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT * FROM hotel_contracts ${where} ORDER BY valid_from DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch contracts" }); }
});

router.post("/contracts", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { hotel_id, hotel_name, season, valid_from, valid_to, room_type, rate_per_night, total_rooms, contracted_rooms, meal_plan, payment_terms, cancellation_policy, notes } = req.body;
    if (!hotel_name || !valid_from || !valid_to || !rate_per_night) return void res.status(400).json({ error: "hotel_name, valid_from, valid_to, rate_per_night required" });
    const row = await q1(
      `INSERT INTO hotel_contracts (hotel_id, hotel_name, contract_number, season, valid_from, valid_to, room_type, rate_per_night, total_rooms, contracted_rooms, meal_plan, payment_terms, cancellation_policy, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [hotel_id || null, hotel_name, nextContractNum(), season || null, valid_from, valid_to, room_type || "standard", rate_per_night, total_rooms || 0, contracted_rooms || 0, meal_plan || "bb", payment_terms || null, cancellation_policy || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create contract" }); }
});

router.put("/contracts/:id", requireAdmin as any, async (req, res) => {
  try {
    const { hotel_name, season, valid_from, valid_to, room_type, rate_per_night, total_rooms, contracted_rooms, meal_plan, payment_terms, cancellation_policy, status, notes } = req.body;
    await pool.query(
      `UPDATE hotel_contracts SET hotel_name=$1, season=$2, valid_from=$3, valid_to=$4, room_type=$5, rate_per_night=$6, total_rooms=$7, contracted_rooms=$8, meal_plan=$9, payment_terms=$10, cancellation_policy=$11, status=$12, notes=$13, updated_at=NOW() WHERE id=$14`,
      [hotel_name, season, valid_from, valid_to, room_type, rate_per_night, total_rooms, contracted_rooms, meal_plan, payment_terms, cancellation_policy, status, notes, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update contract" }); }
});

// ── Hotel Vouchers ──────────────────────────────────────────────────────────
router.get("/vouchers", requireAdmin as any, async (req, res) => {
  try {
    const { booking_id, group_id, hotel_id, status } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (booking_id) { params.push(booking_id); filters.push(`booking_id=$${params.length}`); }
    if (group_id)   { params.push(group_id);   filters.push(`group_id=$${params.length}`); }
    if (hotel_id)   { params.push(hotel_id);   filters.push(`hotel_id=$${params.length}`); }
    if (status)     { params.push(status);     filters.push(`status=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT * FROM hotel_vouchers ${where} ORDER BY check_in_date DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch vouchers" }); }
});

router.post("/vouchers", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id, group_id, hotel_id, hotel_name, check_in_date, check_out_date, room_type, room_count, meal_plan, pilgrim_count, pilgrim_names, rate_per_night, special_requests, notes } = req.body;
    if (!hotel_name || !check_in_date || !check_out_date) return void res.status(400).json({ error: "hotel_name, check_in_date, check_out_date required" });

    const d1 = new Date(check_in_date);
    const d2 = new Date(check_out_date);
    const nights = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
    const totalAmt = rate_per_night ? Number(rate_per_night) * nights * (room_count || 1) : null;

    const row = await q1(
      `INSERT INTO hotel_vouchers (voucher_number, booking_id, group_id, hotel_id, hotel_name, check_in_date, check_out_date, nights, room_type, room_count, meal_plan, pilgrim_count, pilgrim_names, rate_per_night, total_amount, special_requests, notes, issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [nextVoucherNum(), booking_id || null, group_id || null, hotel_id || null, hotel_name, check_in_date, check_out_date, nights, room_type || "standard", room_count || 1, meal_plan || "bb", pilgrim_count || 1, pilgrim_names || null, rate_per_night || null, totalAmt, special_requests || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create voucher" }); }
});

router.post("/vouchers/:id/cancel", requireAdmin as any, async (_req, res) => {
  try {
    await pool.query(`UPDATE hotel_vouchers SET status='cancelled' WHERE id=$1`, [_req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to cancel voucher" }); }
});

// ── Check-in / Check-out ────────────────────────────────────────────────────
router.get("/checkins", requireAdmin as any, async (req, res) => {
  try {
    const { hotel_id, status, date } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (hotel_id) { params.push(hotel_id); filters.push(`hotel_id=$${params.length}`); }
    if (status)   { params.push(status);   filters.push(`status=$${params.length}`); }
    if (date)     { params.push(date);     filters.push(`expected_checkin=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT * FROM hotel_checkins ${where} ORDER BY expected_checkin`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch checkins" }); }
});

router.post("/checkins", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { hotel_id, hotel_name, booking_id, group_id, room_number, room_type, pilgrim_ids, guest_names, expected_checkin, expected_checkout, notes } = req.body;
    if (!guest_names) return void res.status(400).json({ error: "guest_names required" });
    const row = await q1(
      `INSERT INTO hotel_checkins (hotel_id, hotel_name, booking_id, group_id, room_number, room_type, pilgrim_ids, guest_names, expected_checkin, expected_checkout, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [hotel_id || null, hotel_name || null, booking_id || null, group_id || null, room_number || null, room_type || null, pilgrim_ids || null, guest_names, expected_checkin || null, expected_checkout || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create checkin record" }); }
});

router.post("/checkins/:id/checkin", requireAdmin as any, async (req, res) => {
  try {
    const { room_number, key_handed } = req.body;
    await pool.query(
      `UPDATE hotel_checkins SET status='checked_in', actual_checkin=NOW(), room_number=COALESCE($1, room_number), key_handed=$2, updated_at=NOW() WHERE id=$3`,
      [room_number || null, key_handed ?? false, req.params.id]
    );
    res.json({ ok: true, message: "Checked in" });
  } catch (e) { res.status(500).json({ error: "Check-in failed" }); }
});

router.post("/checkins/:id/checkout", requireAdmin as any, async (req, res) => {
  try {
    const { notes } = req.body;
    await pool.query(
      `UPDATE hotel_checkins SET status='checked_out', actual_checkout=NOW(), notes=COALESCE($1, notes), updated_at=NOW() WHERE id=$2`,
      [notes || null, req.params.id]
    );
    res.json({ ok: true, message: "Checked out" });
  } catch (e) { res.status(500).json({ error: "Check-out failed" }); }
});

// ── Occupancy ───────────────────────────────────────────────────────────────
router.get("/occupancy", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`
      SELECT hotel_name, hotel_id,
        COUNT(*) FILTER (WHERE status='checked_in')::int AS occupied,
        COUNT(*) FILTER (WHERE status='reserved')::int AS reserved,
        COUNT(*) FILTER (WHERE status='checked_out')::int AS checked_out,
        COUNT(*)::int AS total
      FROM hotel_checkins
      GROUP BY hotel_name, hotel_id ORDER BY occupied DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch occupancy" }); }
});

// ── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [contracts, vouchers, checkins] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active FROM hotel_contracts`),
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='issued')::int AS active FROM hotel_vouchers`),
      q1(`SELECT COUNT(*) FILTER (WHERE status='checked_in')::int AS occupied, COUNT(*) FILTER (WHERE status='reserved')::int AS reserved, COUNT(*) FILTER (WHERE status='checked_out')::int AS checked_out FROM hotel_checkins`),
    ]);
    res.json({ contracts, vouchers, checkins });
  } catch (e) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

export default router;
