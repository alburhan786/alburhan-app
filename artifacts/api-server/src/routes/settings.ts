import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

async function ensureSettingsRow() {
  await pool.query(`
    INSERT INTO booking_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING
  `);
}

router.get("/", async (_req, res) => {
  try {
    await ensureSettingsRow();
    const { rows } = await pool.query(`SELECT * FROM booking_settings WHERE id = 'default'`);
    const s = rows[0] || {};
    res.json({
      gstEnabled: s.gst_enabled ?? true,
      gstRate: s.gst_rate != null ? Number(s.gst_rate) : 5,
      gstIncluded: s.gst_included ?? false,
      tcsEnabled: s.tcs_enabled ?? false,
      tcsRate: s.tcs_rate != null ? Number(s.tcs_rate) : 2,
      tcsIncluded: s.tcs_included ?? false,
      discountEnabled: s.discount_enabled ?? true,
      updatedAt: s.updated_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load settings" });
  }
});

router.put("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      gstEnabled, gstRate, gstIncluded,
      tcsEnabled, tcsRate, tcsIncluded,
      discountEnabled,
    } = req.body;
    await ensureSettingsRow();
    await pool.query(`
      UPDATE booking_settings SET
        gst_enabled = $1,
        gst_rate = $2,
        gst_included = $3,
        tcs_enabled = $4,
        tcs_rate = $5,
        tcs_included = $6,
        discount_enabled = $7,
        updated_at = NOW()
      WHERE id = 'default'
    `, [
      gstEnabled !== false,
      Number(gstRate) || 5,
      gstIncluded === true,
      tcsEnabled === true,
      Number(tcsRate) || 2,
      tcsIncluded === true,
      discountEnabled !== false,
    ]);
    const { rows } = await pool.query(`SELECT * FROM booking_settings WHERE id = 'default'`);
    const s = rows[0] || {};
    res.json({
      gstEnabled: s.gst_enabled ?? true,
      gstRate: s.gst_rate != null ? Number(s.gst_rate) : 5,
      gstIncluded: s.gst_included ?? false,
      tcsEnabled: s.tcs_enabled ?? false,
      tcsRate: s.tcs_rate != null ? Number(s.tcs_rate) : 2,
      tcsIncluded: s.tcs_included ?? false,
      discountEnabled: s.discount_enabled ?? true,
      updatedAt: s.updated_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to save settings" });
  }
});

export default router;
