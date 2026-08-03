// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();
const q  = async (t: string, p?: any[]) => (await pool.query(t, p)).rows ?? [];
const q1 = async (t: string, p?: any[]) => (await pool.query(t, p)).rows?.[0] ?? null;

export async function ensureTransportOpsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      reg_number      TEXT UNIQUE NOT NULL,
      type            TEXT DEFAULT 'bus',
      make            TEXT,
      model           TEXT,
      year            INT,
      capacity        INT DEFAULT 40,
      fuel_type       TEXT DEFAULT 'diesel',
      color           TEXT,
      insurance_expiry DATE,
      permit_expiry   DATE,
      fitness_expiry  DATE,
      pollution_expiry DATE,
      is_active       BOOLEAN DEFAULT true,
      current_driver_id TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON vehicles(reg_number);
    CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(is_active);

    CREATE TABLE IF NOT EXISTS drivers (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name            TEXT NOT NULL,
      mobile          TEXT NOT NULL,
      license_number  TEXT UNIQUE,
      license_expiry  DATE,
      badge_number    TEXT,
      photo_url       TEXT,
      address         TEXT,
      emergency_contact TEXT,
      joining_date    DATE,
      is_active       BOOLEAN DEFAULT true,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_drivers_mobile ON drivers(mobile);

    CREATE TABLE IF NOT EXISTS transport_routes (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name            TEXT NOT NULL,
      from_location   TEXT NOT NULL,
      to_location     TEXT NOT NULL,
      distance_km     NUMERIC(8,2),
      estimated_mins  INT,
      route_type      TEXT DEFAULT 'airport_transfer',
      notes           TEXT,
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transport_trips (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      vehicle_id      TEXT REFERENCES vehicles(id),
      driver_id       TEXT REFERENCES drivers(id),
      route_id        TEXT,
      group_id        TEXT,
      booking_id      TEXT,
      trip_date       DATE NOT NULL,
      departure_time  TEXT,
      arrival_time    TEXT,
      from_location   TEXT,
      to_location     TEXT,
      passenger_count INT DEFAULT 0,
      status          TEXT DEFAULT 'scheduled',
      odometer_start  NUMERIC(10,2),
      odometer_end    NUMERIC(10,2),
      notes           TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON transport_trips(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_trips_driver ON transport_trips(driver_id);
    CREATE INDEX IF NOT EXISTS idx_trips_date ON transport_trips(trip_date);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON transport_trips(status);

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      vehicle_id      TEXT NOT NULL REFERENCES vehicles(id),
      date            DATE NOT NULL DEFAULT CURRENT_DATE,
      liters          NUMERIC(8,2) NOT NULL,
      rate_per_liter  NUMERIC(6,2),
      amount          NUMERIC(10,2),
      odometer        NUMERIC(10,2),
      fuel_station    TEXT,
      bill_number     TEXT,
      recorded_by     TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_vehicle ON fuel_logs(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_fuel_date ON fuel_logs(date);

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      vehicle_id      TEXT NOT NULL REFERENCES vehicles(id),
      date            DATE NOT NULL DEFAULT CURRENT_DATE,
      type            TEXT DEFAULT 'routine',
      description     TEXT NOT NULL,
      cost            NUMERIC(10,2),
      vendor          TEXT,
      odometer        NUMERIC(10,2),
      next_service_date DATE,
      next_service_km NUMERIC(10,2),
      status          TEXT DEFAULT 'completed',
      bill_number     TEXT,
      recorded_by     TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_maint_vehicle ON maintenance_logs(vehicle_id);
  `);
}

// ── Vehicles ──────────────────────────────────────────────────────────────────
router.get("/vehicles", requireAdmin as any, async (req, res) => {
  try {
    const { type, is_active } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (type)      { params.push(type);       filters.push(`v.type=$${params.length}`); }
    if (is_active !== undefined) { params.push(is_active !== "false"); filters.push(`v.is_active=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT v.*, d.name AS driver_name, d.mobile AS driver_mobile FROM vehicles v LEFT JOIN drivers d ON d.id=v.current_driver_id ${where} ORDER BY v.reg_number`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch vehicles" }); }
});

router.post("/vehicles", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { reg_number, type, make, model, year, capacity, fuel_type, color, insurance_expiry, permit_expiry, fitness_expiry, pollution_expiry, notes } = req.body;
    if (!reg_number) return void res.status(400).json({ error: "reg_number required" });
    const row = await q1(
      `INSERT INTO vehicles (reg_number, type, make, model, year, capacity, fuel_type, color, insurance_expiry, permit_expiry, fitness_expiry, pollution_expiry, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [reg_number, type || "bus", make || null, model || null, year || null, capacity || 40, fuel_type || "diesel", color || null, insurance_expiry || null, permit_expiry || null, fitness_expiry || null, pollution_expiry || null, notes || null]
    );
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "Registration number already exists" });
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

router.put("/vehicles/:id", requireAdmin as any, async (req, res) => {
  try {
    const { reg_number, type, make, model, year, capacity, fuel_type, color, insurance_expiry, permit_expiry, fitness_expiry, pollution_expiry, is_active, current_driver_id, notes } = req.body;
    await pool.query(
      `UPDATE vehicles SET reg_number=$1, type=$2, make=$3, model=$4, year=$5, capacity=$6, fuel_type=$7, color=$8, insurance_expiry=$9, permit_expiry=$10, fitness_expiry=$11, pollution_expiry=$12, is_active=$13, current_driver_id=$14, notes=$15, updated_at=NOW() WHERE id=$16`,
      [reg_number, type, make, model, year, capacity, fuel_type, color, insurance_expiry, permit_expiry, fitness_expiry, pollution_expiry, is_active ?? true, current_driver_id || null, notes, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update vehicle" }); }
});

// ── Drivers ──────────────────────────────────────────────────────────────────
router.get("/drivers", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`
      SELECT d.*, v.reg_number AS assigned_vehicle
      FROM drivers d
      LEFT JOIN vehicles v ON v.current_driver_id=d.id AND v.is_active=true
      WHERE d.is_active=true ORDER BY d.name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch drivers" }); }
});

router.post("/drivers", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, license_number, license_expiry, badge_number, address, emergency_contact, joining_date, notes } = req.body;
    if (!name || !mobile) return void res.status(400).json({ error: "name and mobile required" });
    const row = await q1(
      `INSERT INTO drivers (name, mobile, license_number, license_expiry, badge_number, address, emergency_contact, joining_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, mobile, license_number || null, license_expiry || null, badge_number || null, address || null, emergency_contact || null, joining_date || null, notes || null]
    );
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "License number already exists" });
    res.status(500).json({ error: "Failed to create driver" });
  }
});

router.put("/drivers/:id", requireAdmin as any, async (req, res) => {
  try {
    const { name, mobile, license_number, license_expiry, badge_number, address, emergency_contact, is_active, notes } = req.body;
    await pool.query(
      `UPDATE drivers SET name=$1, mobile=$2, license_number=$3, license_expiry=$4, badge_number=$5, address=$6, emergency_contact=$7, is_active=$8, notes=$9, updated_at=NOW() WHERE id=$10`,
      [name, mobile, license_number, license_expiry, badge_number, address, emergency_contact, is_active ?? true, notes, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to update driver" }); }
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.get("/routes", requireAdmin as any, async (_req, res) => {
  try {
    const rows = await q(`SELECT * FROM transport_routes WHERE is_active=true ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch routes" }); }
});

router.post("/routes", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, from_location, to_location, distance_km, estimated_mins, route_type, notes } = req.body;
    if (!name || !from_location || !to_location) return void res.status(400).json({ error: "name, from_location, to_location required" });
    const row = await q1(
      `INSERT INTO transport_routes (name, from_location, to_location, distance_km, estimated_mins, route_type, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, from_location, to_location, distance_km || null, estimated_mins || null, route_type || "airport_transfer", notes || null]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create route" }); }
});

// ── Trips ─────────────────────────────────────────────────────────────────────
router.get("/trips", requireAdmin as any, async (req, res) => {
  try {
    const { status, vehicle_id, driver_id, date } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (status)     { params.push(status);     filters.push(`t.status=$${params.length}`); }
    if (vehicle_id) { params.push(vehicle_id); filters.push(`t.vehicle_id=$${params.length}`); }
    if (driver_id)  { params.push(driver_id);  filters.push(`t.driver_id=$${params.length}`); }
    if (date)       { params.push(date);       filters.push(`t.trip_date=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(
      `SELECT t.*, v.reg_number AS vehicle_reg, d.name AS driver_name, d.mobile AS driver_mobile
       FROM transport_trips t
       LEFT JOIN vehicles v ON v.id=t.vehicle_id
       LEFT JOIN drivers d ON d.id=t.driver_id
       ${where} ORDER BY t.trip_date DESC, t.departure_time`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch trips" }); }
});

router.post("/trips", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { vehicle_id, driver_id, route_id, group_id, booking_id, trip_date, departure_time, arrival_time, from_location, to_location, passenger_count, notes } = req.body;
    if (!trip_date) return void res.status(400).json({ error: "trip_date required" });
    const row = await q1(
      `INSERT INTO transport_trips (vehicle_id, driver_id, route_id, group_id, booking_id, trip_date, departure_time, arrival_time, from_location, to_location, passenger_count, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [vehicle_id || null, driver_id || null, route_id || null, group_id || null, booking_id || null, trip_date, departure_time || null, arrival_time || null, from_location || null, to_location || null, passenger_count || 0, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to create trip" }); }
});

router.post("/trips/:id/start", requireAdmin as any, async (req, res) => {
  try {
    const { odometer_start } = req.body;
    await pool.query(`UPDATE transport_trips SET status='in_progress', odometer_start=$1, updated_at=NOW() WHERE id=$2`, [odometer_start || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to start trip" }); }
});

router.post("/trips/:id/complete", requireAdmin as any, async (req, res) => {
  try {
    const { odometer_end, notes } = req.body;
    await pool.query(`UPDATE transport_trips SET status='completed', odometer_end=$1, notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3`, [odometer_end || null, notes || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to complete trip" }); }
});

// ── Fuel Logs ─────────────────────────────────────────────────────────────────
router.get("/fuel", requireAdmin as any, async (req, res) => {
  try {
    const { vehicle_id, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (vehicle_id) { params.push(vehicle_id); filters.push(`f.vehicle_id=$${params.length}`); }
    if (from)       { params.push(from);       filters.push(`f.date >= $${params.length}`); }
    if (to)         { params.push(to);         filters.push(`f.date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT f.*, v.reg_number FROM fuel_logs f LEFT JOIN vehicles v ON v.id=f.vehicle_id ${where} ORDER BY f.date DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch fuel logs" }); }
});

router.post("/fuel", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { vehicle_id, date, liters, rate_per_liter, odometer, fuel_station, bill_number, notes } = req.body;
    if (!vehicle_id || !liters) return void res.status(400).json({ error: "vehicle_id and liters required" });
    const amount = rate_per_liter ? Number(liters) * Number(rate_per_liter) : null;
    const row = await q1(
      `INSERT INTO fuel_logs (vehicle_id, date, liters, rate_per_liter, amount, odometer, fuel_station, bill_number, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [vehicle_id, date || new Date().toISOString().split("T")[0], liters, rate_per_liter || null, amount, odometer || null, fuel_station || null, bill_number || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to log fuel" }); }
});

// ── Maintenance Logs ──────────────────────────────────────────────────────────
router.get("/maintenance", requireAdmin as any, async (req, res) => {
  try {
    const { vehicle_id, type, from, to } = req.query as Record<string, string>;
    const params: any[] = [];
    const filters: string[] = [];
    if (vehicle_id) { params.push(vehicle_id); filters.push(`m.vehicle_id=$${params.length}`); }
    if (type)       { params.push(type);       filters.push(`m.type=$${params.length}`); }
    if (from)       { params.push(from);       filters.push(`m.date >= $${params.length}`); }
    if (to)         { params.push(to);         filters.push(`m.date <= $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await q(`SELECT m.*, v.reg_number FROM maintenance_logs m LEFT JOIN vehicles v ON v.id=m.vehicle_id ${where} ORDER BY m.date DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to fetch maintenance logs" }); }
});

router.post("/maintenance", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { vehicle_id, date, type, description, cost, vendor, odometer, next_service_date, next_service_km, bill_number, notes } = req.body;
    if (!vehicle_id || !description) return void res.status(400).json({ error: "vehicle_id and description required" });
    const row = await q1(
      `INSERT INTO maintenance_logs (vehicle_id, date, type, description, cost, vendor, odometer, next_service_date, next_service_km, bill_number, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [vehicle_id, date || new Date().toISOString().split("T")[0], type || "routine", description, cost || null, vendor || null, odometer || null, next_service_date || null, next_service_km || null, bill_number || null, notes || null, req.user?.name ?? "admin"]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: "Failed to log maintenance" }); }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const [vehicles, drivers, trips, fuel, maint] = await Promise.all([
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE type='bus')::int AS buses FROM vehicles`),
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM drivers`),
      q1(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='scheduled')::int AS scheduled, COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress, COUNT(*) FILTER (WHERE status='completed')::int AS completed FROM transport_trips`),
      q1(`SELECT COALESCE(SUM(liters),0)::numeric AS total_liters, COALESCE(SUM(amount),0)::numeric AS total_cost FROM fuel_logs WHERE date >= CURRENT_DATE - INTERVAL '30 days'`),
      q1(`SELECT COALESCE(SUM(cost),0)::numeric AS total_cost, COUNT(*)::int AS total FROM maintenance_logs WHERE date >= CURRENT_DATE - INTERVAL '30 days'`),
    ]);
    res.json({ vehicles, drivers, trips, fuel_last30d: fuel, maintenance_last30d: maint });
  } catch (e) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

export default router;
