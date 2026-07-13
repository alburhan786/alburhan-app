import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess } from "../lib/auth.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";

const router = Router();
router.use(requireModuleAccess("pilgrims") as any);

const VISA_STATUSES = ["not_applied", "applied", "in_process", "received", "rejected"];

// GET visa list for all pilgrims
router.get("/", requireAdmin as any, async (req, res) => {
  const { groupId, status } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds: string[] = [];
  if (groupId) { params.push(groupId); conds.push(`p.group_id = $${params.length}`); }
  if (status) { params.push(status); conds.push(`COALESCE(p.visa_status,'not_applied') = $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  try {
    const result = await pool.query(
      `SELECT p.id, p.full_name, p.mobile_india, p.gender, p.serial_number,
        p.passport_number, p.passport_expiry_date,
        p.visa_number, p.visa_status, p.visa_type, p.visa_applied_date, p.visa_received_date,
        p.group_id, hg.group_name, p.family_id
       FROM pilgrims p
       LEFT JOIN hajj_groups hg ON hg.id = p.group_id
       ${where}
       ORDER BY hg.group_name, p.serial_number`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("[visa] GET / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET visa stats
router.get("/stats", requireAdmin as any, async (req, res) => {
  const { groupId } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds: string[] = [];
  if (groupId) { params.push(groupId); conds.push(`group_id = $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE COALESCE(visa_status,'not_applied') = 'not_applied')::int AS not_applied,
        COUNT(*) FILTER (WHERE visa_status = 'applied')::int AS applied,
        COUNT(*) FILTER (WHERE visa_status = 'in_process')::int AS in_process,
        COUNT(*) FILTER (WHERE visa_status = 'received')::int AS received,
        COUNT(*) FILTER (WHERE visa_status = 'rejected')::int AS rejected
       FROM pilgrims ${where}`,
      params
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update visa for a pilgrim
router.put("/:pilgrimId", requireAdmin as any, async (req, res) => {
  const { visaStatus, visaNumber, visaType, visaAppliedDate, visaReceivedDate } = req.body;
  if (visaStatus && !VISA_STATUSES.includes(visaStatus)) {
    return void res.status(400).json({ error: "Invalid visa status" });
  }
  try {
    await pool.query(
      `UPDATE pilgrims SET visa_status=$1, visa_number=$2, visa_type=$3,
        visa_applied_date=$4, visa_received_date=$5, updated_at=NOW()
       WHERE id=$6`,
      [visaStatus||null, visaNumber||null, visaType||null, visaAppliedDate||null, visaReceivedDate||null, req.params.pilgrimId]
    );
    res.json({ message: "Visa updated" });
    if (visaStatus === "received" || visaStatus === "approved") {
      pool.query(`SELECT full_name, mobile_india, booking_id FROM pilgrims WHERE id=$1`, [req.params.pilgrimId])
        .then(r => {
          if (!r.rows[0]) return;
          const p = r.rows[0];
          fireNotificationEvent("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india, visaNumber: visaNumber || undefined }).catch(() => {});
          triggerWorkflow("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india, pilgramName: p.full_name, bookingId: p.booking_id, visaStatus: "approved" }).catch(() => {});
        }).catch(() => {});
    } else if (visaStatus === "rejected") {
      pool.query(`SELECT full_name, mobile_india, booking_id FROM pilgrims WHERE id=$1`, [req.params.pilgrimId])
        .then(r => {
          if (!r.rows[0]) return;
          const p = r.rows[0];
          fireNotificationEvent("visa_rejected", { customerName: p.full_name, customerMobile: p.mobile_india }).catch(() => {});
          triggerWorkflow("visa_rejected", { customerName: p.full_name, customerMobile: p.mobile_india, pilgramName: p.full_name, bookingId: p.booking_id, visaStatus: "rejected" }).catch(() => {});
        }).catch(() => {});
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk update visa status
router.post("/bulk-update", requireAdmin as any, async (req, res) => {
  const { pilgrimIds, visaStatus, visaReceivedDate, visaAppliedDate } = req.body;
  if (!pilgrimIds?.length) return void res.status(400).json({ error: "No pilgrims selected" });
  if (visaStatus && !VISA_STATUSES.includes(visaStatus)) {
    return void res.status(400).json({ error: "Invalid visa status" });
  }
  try {
    const placeholders = pilgrimIds.map((_: string, i: number) => `$${i + 4}`).join(",");
    await pool.query(
      `UPDATE pilgrims SET visa_status=$1, visa_received_date=$2, visa_applied_date=$3, updated_at=NOW()
       WHERE id IN (${placeholders})`,
      [visaStatus, visaReceivedDate||null, visaAppliedDate||null, ...pilgrimIds]
    );
    res.json({ message: `Updated ${pilgrimIds.length} pilgrims`, count: pilgrimIds.length });
    if (visaStatus === "received" || visaStatus === "approved") {
      pool.query(`SELECT id, full_name, mobile_india, booking_id FROM pilgrims WHERE id=ANY($1)`, [pilgrimIds])
        .then(r => {
          for (const p of r.rows) {
            fireNotificationEvent("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india }).catch(() => {});
            triggerWorkflow("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india, pilgramName: p.full_name, bookingId: p.booking_id, visaStatus: "approved" }).catch(() => {});
          }
        }).catch(() => {});
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
