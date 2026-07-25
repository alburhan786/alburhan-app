// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;

export async function ensureFlightOpsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airline_master (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      iata_code   TEXT UNIQUE,
      icao_code   TEXT,
      name        TEXT NOT NULL,
      country     TEXT,
      logo_url    TEXT,
      contact     TEXT,
      is_active   BOOLEAN DEFAULT true,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pnr_records (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      pnr_number      TEXT NOT NULL,
      booking_id      TEXT,
      group_id        TEXT,
      airline_id      TEXT,
      airline_name    TEXT,
      flight_number   TEXT,
      sector          TEXT,
      departure_date  DATE,
      departure_time  TEXT,
      arrival_time    TEXT,
      seat_count      INT DEFAULT 0,
      seat_numbers    TEXT,
      status          TEXT DEFAULT 'active',
      ticket_numbers  TEXT,
      issued_at       TIMESTAMPTZ,
      issued_by       TEXT,
      cancelled_at    TIMESTAMPTZ,
      cancellation_reason TEXT,
      fare_amount     NUMERIC(12,2),
      tax_amount      NUMERIC(12,2),
      notes           TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pnr_booking ON pnr_records(booking_id);
    CREATE INDEX IF NOT EXISTS idx_pnr_group ON pnr_records(group_id);
    CREATE INDEX IF NOT EXISTS idx_pnr_status ON pnr_records(status);

    CREATE TABLE IF NOT EXISTS pnr_passengers (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      pnr_id      TEXT NOT NULL REFERENCES pnr_records(id) ON DELETE CASCADE,
      pilgrim_id  TEXT,
      pilgrim_name TEXT,
      passport_number TEXT,
      seat_number TEXT,
      ticket_number TEXT,
      status      TEXT DEFAULT 'confirmed',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pnr_passengers_pnr ON pnr_passengers(pnr_id);

    CREATE TABLE IF NOT EXISTS flight_baggage (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      pnr_id          TEXT,
      pilgrim_id      TEXT,
      booking_id      TEXT,
      tag_number      TEXT UNIQUE,
      pieces          INT DEFAULT 1,
      weight_kg       NUMERIC(6,2),
      status          TEXT DEFAULT 'checked_in',
      last_scan_location TEXT,
      last_scan_at    TIMESTAMPTZ,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_baggage_pnr ON flight_baggage(pnr_id);
  `);
}

// ── Airline Master ──────────────────────────────────────────────────────────
router.get("/airlines", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM airline_master ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch airlines" }); }
});

router.post("/airlines", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { iata_code, icao_code, name, country, logo_url, contact, notes } = req.body;
    if (!name) return void res.status(400).json({ error: "name is required" });
    const row = await q1(
      `INSERT INTO airline_master (iata_code, icao_code, name, country, logo_url, contact, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [iata_code || null, icao_code || null, name, country || null, logo_url || null, contact || null, notes || null]
    );
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "IATA code already exists" });
    res.status(500).json({ error: "Failed to create airline" });
  }
});

router.put("/airlines/:id", requireAdmin as any, async (req, res) => {
  try {
    const { name, iata_code, icao_code, country, logo_url, contact, is_active, notes } = req.body;
    await pool.query(
      `UPDATE airline_master SET name=$1, iata_code=$2, icao_code=$3, country=$4, logo_url=$5, contact=$6, is_active=$7, notes=$8, updated_at=NOW() WHERE id=$9`,
      [name, iata_code, icao_code, country, logo_url, contact, is_active ?? true, notes, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update airline" }); }
});

router.delete("/airlines/:id", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE airline_master SET is_active=false, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to deactivate airline" }); }
});

// ── PNR Management ──────────────────────────────────────────────────────────
router.get("/pnr", requireAdmin as any, async (req, res) => {
  try {
    const { status, group_id, booking_id, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (status)     { params.push(status);     filters.push(`pr.status=$${params.length}`); }
    if (group_id)   { params.push(group_id);   filters.push(`pr.group_id=$${params.length}`); }
    if (booking_id) { params.push(booking_id); filters.push(`pr.booking_id=$${params.length}`); }
    if (from)       { params.push(from);       filters.push(`pr.departure_date >= $${params.length}`); }
    if (to)         { params.push(to);         filters.push(`pr.departure_date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT pr.*, a.iata_code, COUNT(pp.id)::int AS passenger_count
       FROM pnr_records pr
       LEFT JOIN airline_master a ON a.id=pr.airline_id
       LEFT JOIN pnr_passengers pp ON pp.pnr_id=pr.id
       ${where}
       GROUP BY pr.id, a.iata_code
       ORDER BY pr.departure_date DESC`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch PNR records" }); }
});

router.get("/pnr/:id", requireAdmin as any, async (req, res) => {
  try {
    const [pnr, passengers, baggage] = await Promise.all([
      q1(`SELECT pr.*, a.name AS airline_full_name, a.iata_code FROM pnr_records pr LEFT JOIN airline_master a ON a.id=pr.airline_id WHERE pr.id=$1`, [req.params.id]),
      q(`SELECT * FROM pnr_passengers WHERE pnr_id=$1 ORDER BY pilgrim_name`, [req.params.id]),
      q(`SELECT * FROM flight_baggage WHERE pnr_id=$1 ORDER BY created_at DESC`, [req.params.id]),
    ]);
    if (!pnr) return void res.status(404).json({ error: "PNR not found" });
    res.json({ ...pnr, passengers, baggage });
  } catch (e) { res.status(500).json({ error: "Failed to fetch PNR" }); }
});

router.post("/pnr", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { pnr_number, booking_id, group_id, airline_id, airline_name, flight_number, sector, departure_date, departure_time, arrival_time, seat_count, seat_numbers, fare_amount, tax_amount, notes, passengers = [] } = req.body;
    if (!pnr_number || !flight_number) return void res.status(400).json({ error: "pnr_number and flight_number required" });

    await pool.query("BEGIN");
    try {
      const pnr = await q1(
        `INSERT INTO pnr_records (pnr_number, booking_id, group_id, airline_id, airline_name, flight_number, sector, departure_date, departure_time, arrival_time, seat_count, seat_numbers, fare_amount, tax_amount, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [pnr_number, booking_id || null, group_id || null, airline_id || null, airline_name || null, flight_number, sector || null, departure_date || null, departure_time || null, arrival_time || null, seat_count || 0, seat_numbers || null, fare_amount || null, tax_amount || null, notes || null, req.user?.name ?? "admin"]
      );
      for (const p of passengers) {
        await pool.query(
          `INSERT INTO pnr_passengers (pnr_id, pilgrim_id, pilgrim_name, passport_number, seat_number, ticket_number)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [pnr.id, p.pilgrim_id || null, p.pilgrim_name || null, p.passport_number || null, p.seat_number || null, p.ticket_number || null]
        );
      }
      await pool.query("COMMIT");
      res.json(pnr);
    } catch (e) { await pool.query("ROLLBACK"); throw e; }
  } catch (e) { res.status(500).json({ error: "Failed to create PNR" }); }
});

router.put("/pnr/:id", requireAdmin as any, async (req, res) => {
  try {
    const { flight_number, sector, departure_date, departure_time, arrival_time, seat_count, seat_numbers, fare_amount, tax_amount, notes } = req.body;
    await pool.query(
      `UPDATE pnr_records SET flight_number=$1, sector=$2, departure_date=$3, departure_time=$4, arrival_time=$5, seat_count=$6, seat_numbers=$7, fare_amount=$8, tax_amount=$9, notes=$10, updated_at=NOW() WHERE id=$11`,
      [flight_number, sector, departure_date, departure_time, arrival_time, seat_count, seat_numbers, fare_amount, tax_amount, notes, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update PNR" }); }
});

router.post("/pnr/:id/issue-tickets", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { ticket_numbers } = req.body;
    await pool.query(
      `UPDATE pnr_records SET status='ticketed', ticket_numbers=$1, issued_at=NOW(), issued_by=$2, updated_at=NOW() WHERE id=$3`,
      [ticket_numbers || null, req.user?.name ?? "admin", req.params.id]
    );
    res.json({ ok: true, message: "Tickets issued" });
  } catch (e) { res.status(500).json({ error: "Failed to issue tickets" }); }
});

router.post("/pnr/:id/cancel", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    await pool.query(
      `UPDATE pnr_records SET status='cancelled', cancelled_at=NOW(), cancellation_reason=$1, updated_at=NOW() WHERE id=$2`,
      [reason || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to cancel PNR" }); }
});

// ── Flight Manifest ─────────────────────────────────────────────────────────
router.get("/manifest/:groupId", requireAdmin as any, async (req, res) => {
  try {
    const group = await q1(`SELECT * FROM hajj_groups WHERE id=$1`, [req.params.groupId]);
    const pnrs = await q(
      `SELECT pr.*, COUNT(pp.id)::int AS pax_count
       FROM pnr_records pr LEFT JOIN pnr_passengers pp ON pp.pnr_id=pr.id
       WHERE pr.group_id=$1 GROUP BY pr.id ORDER BY pr.departure_date`, [req.params.groupId]
    );
    const passengers = await q(
      `SELECT pp.*, pr.pnr_number, pr.flight_number, pr.sector, pr.departure_date
       FROM pnr_passengers pp JOIN pnr_records pr ON pr.id=pp.pnr_id
       WHERE pr.group_id=$1 ORDER BY pr.departure_date, pp.pilgrim_name`, [req.params.groupId]
    );
    res.json({ group, pnrs, passengers, generated_at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: "Failed to generate manifest" }); }
});

// ── Baggage Tracking ────────────────────────────────────────────────────────
router.get("/baggage", requireAdmin as any, async (req, res) => {
  try {
    const { pnr_id, booking_id, status } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (pnr_id)     { params.push(pnr_id);     filters.push(`b.pnr_id=$${params.length}`); }
    if (booking_id) { params.push(booking_id); filters.push(`b.booking_id=$${params.length}`); }
    if (status)     { params.push(status);     filters.push(`b.status=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT b.*, pr.pnr_number, pr.flight_number FROM flight_baggage b LEFT JOIN pnr_records pr ON pr.id=b.pnr_id ${where} ORDER BY b.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch baggage" }); }
});

router.post("/baggage", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { pnr_id, pilgrim_id, booking_id, tag_number, pieces, weight_kg, notes } = req.body;
    const row = await q1(
      `INSERT INTO flight_baggage (pnr_id, pilgrim_id, booking_id, tag_number, pieces, weight_kg, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [pnr_id || null, pilgrim_id || null, booking_id || null, tag_number, pieces || 1, weight_kg || null, notes || null]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create baggage record" }); }
});

router.post("/baggage/:id/scan", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, location } = req.body;
    await pool.query(
      `UPDATE flight_baggage SET status=$1, last_scan_location=$2, last_scan_at=NOW() WHERE id=$3`,
      [status, location || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update baggage scan" }); }
});

// ── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [airlines, pnrStats, baggageStats] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM airline_master`),
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='ticketed')::int AS ticketed, COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled, COALESCE(SUM(seat_count),0)::int AS total_seats FROM pnr_records`),
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='delivered')::int AS delivered FROM flight_baggage`),
    ]);
    res.json({ airlines, pnr: pnrStats, baggage: baggageStats });
  } catch (e) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

export default router;
