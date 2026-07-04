import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requirePermission, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();
router.use(requirePermission("assets", "view") as any);

async function q(text: string, params?: any[]): Promise<any[]> {
  return (await pool.query(text, params)).rows ?? [];
}
async function q1(text: string, params?: any[]): Promise<any> {
  return (await pool.query(text, params)).rows?.[0] ?? null;
}

// Default depreciation rates by category (WDV method)
const DEFAULT_RATES: Record<string, number> = {
  laptop: 0.40,
  printer: 0.30,
  scanner: 0.30,
  furniture: 0.10,
  vehicle: 0.25,
  mobile: 0.50,
  phone: 0.50,
  ac: 0.15,
  generator: 0.15,
  camera: 0.25,
  other: 0.15,
};

function computeBookValue(purchasePrice: number, rate: number, purchaseDate: string): number {
  const years = (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, purchasePrice * Math.pow(1 - rate, years));
}

router.get("/", requireAdmin as any, async (_req, res) => {
  try {
    const assets = await q(`SELECT * FROM assets WHERE is_active=true ORDER BY name`);
    const enriched = assets.map(a => {
      const rate = parseFloat(a.depreciation_rate || DEFAULT_RATES[a.category] || 0.15);
      const price = parseFloat(a.purchase_price || 0);
      const bookValue = computeBookValue(price, rate, a.purchase_date);
      const warrantyDate = a.warranty_date ? new Date(a.warranty_date) : null;
      const warrantyExpired = warrantyDate ? warrantyDate < new Date() : null;
      const ageYears = a.purchase_date
        ? (Date.now() - new Date(a.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        : 0;
      return {
        ...a,
        purchase_price: price,
        depreciation_rate: rate,
        book_value: parseFloat(bookValue.toFixed(2)),
        depreciation_total: parseFloat((price - bookValue).toFixed(2)),
        age_years: parseFloat(ageYears.toFixed(1)),
        warranty_expired: warrantyExpired,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error("[assets] GET /:", err);
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

router.get("/default-rates", requireAdmin as any, (_req, res) => {
  res.json(DEFAULT_RATES);
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, category, purchase_date, purchase_price, vendor, serial_number,
      warranty_date, depreciation_rate, location, notes
    } = req.body;
    if (!name || !purchase_date || !purchase_price) {
      return res.status(400).json({ error: "name, purchase_date, purchase_price required" });
    }
    const rate = depreciation_rate || DEFAULT_RATES[category] || 0.15;
    const row = await q1(
      `INSERT INTO assets
        (id,name,category,purchase_date,purchase_price,vendor,serial_number,warranty_date,depreciation_rate,location,notes)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, category||"other", purchase_date, String(purchase_price), vendor||null,
       serial_number||null, warranty_date||null, String(rate), location||null, notes||null]
    );
    res.json(row);
  } catch (err) {
    console.error("[assets] POST /:", err);
    res.status(500).json({ error: "Failed to create asset" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, category, purchase_date, purchase_price, vendor, serial_number,
      warranty_date, depreciation_rate, location, notes, is_active
    } = req.body;
    const rate = depreciation_rate || DEFAULT_RATES[category] || 0.15;
    const row = await q1(
      `UPDATE assets SET
        name=$1, category=$2, purchase_date=$3, purchase_price=$4, vendor=$5,
        serial_number=$6, warranty_date=$7, depreciation_rate=$8, location=$9,
        notes=$10, is_active=COALESCE($11, is_active), updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [name, category||"other", purchase_date, String(purchase_price), vendor||null,
       serial_number||null, warranty_date||null, String(rate), location||null,
       notes||null, is_active !== undefined ? is_active : null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Asset not found" });
    res.json(row);
  } catch (err) {
    console.error("[assets] PUT /:id:", err);
    res.status(500).json({ error: "Failed to update asset" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`UPDATE assets SET is_active=false WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[assets] DELETE /:id:", err);
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

export default router;
