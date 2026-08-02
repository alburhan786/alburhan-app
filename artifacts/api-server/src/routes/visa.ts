import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess } from "../lib/auth.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { checkVisaPaymentEligibility } from "../lib/financeService.js";

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
  const { visaStatus, visaNumber, visaType, visaAppliedDate, visaReceivedDate, overrideReason } = req.body;
  if (visaStatus && !VISA_STATUSES.includes(visaStatus)) {
    return void res.status(400).json({ error: "Invalid visa status" });
  }
  try {
    // ── Payment guard: block visa issuance when balance is pending ────────────
    if (visaStatus === "received" || visaStatus === "approved") {
      // Resolve the booking for this pilgrim
      const pilgrimRow = await pool.query(
        `SELECT p.group_id,
           (SELECT b.id FROM bookings b WHERE b.group_id=p.group_id
            AND (b.is_deleted IS NULL OR b.is_deleted=false)
            ORDER BY b.created_at DESC LIMIT 1) AS booking_id
         FROM pilgrims p WHERE p.id=$1`,
        [req.params.pilgrimId]
      );
      const bookingId = pilgrimRow.rows[0]?.booking_id;
      if (bookingId) {
        const eligibility = await checkVisaPaymentEligibility(bookingId);
        if (!eligibility.eligible) {
          // Allow super_admin override with a reason
          const actor = (req as any).user;
          if (!overrideReason?.trim() || actor?.role !== "super_admin") {
            return void res.status(402).json({
              error: "VISA_PAYMENT_BLOCKED",
              message: eligibility.reason,
              outstanding: eligibility.outstanding,
              required_advance: eligibility.required_advance,
              current_paid: eligibility.current_paid,
              override_hint: "Super admin can override by supplying overrideReason in the request body",
            });
          }
          // Log the override
          await pool.query(
            `INSERT INTO finance_audit_logs
               (id, action, entity_type, entity_id, booking_id, actor_id, actor_name, actor_role, reason, new_values, created_at)
             VALUES (gen_random_uuid()::text,'visa_payment_override','pilgrim',$1,$2,$3,$4,$5,$6,$7,NOW())`,
            [
              req.params.pilgrimId, bookingId,
              actor?.id, actor?.name, actor?.role,
              overrideReason,
              JSON.stringify({ visa_status: visaStatus, outstanding: eligibility.outstanding }),
            ]
          ).catch(() => {});
          console.log(`[visa] ⚠️  payment override by ${actor?.name} for pilgrim ${req.params.pilgrimId} | reason: ${overrideReason}`);
        }
      }
    }

    await pool.query(
      `UPDATE pilgrims SET visa_status=$1, visa_number=$2, visa_type=$3,
        visa_applied_date=$4, visa_received_date=$5, updated_at=NOW()
       WHERE id=$6`,
      [visaStatus||null, visaNumber||null, visaType||null, visaAppliedDate||null, visaReceivedDate||null, req.params.pilgrimId]
    );
    res.json({ message: "Visa updated" });
    if (visaStatus === "received" || visaStatus === "approved") {
      pool.query(
        `SELECT p.full_name, p.mobile_india,
          (SELECT b.id FROM bookings b WHERE b.group_id = p.group_id AND (b.is_deleted IS NULL OR b.is_deleted=false) ORDER BY b.created_at DESC LIMIT 1) AS booking_id
         FROM pilgrims p WHERE p.id=$1`,
        [req.params.pilgrimId]
      ).then(r => {
          if (!r.rows[0]) return;
          const p = r.rows[0];
          fireNotificationEvent("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india, visaNumber: visaNumber || undefined }).catch(() => {});
          triggerWorkflow("visa_approved", { customerName: p.full_name, customerMobile: p.mobile_india, pilgramName: p.full_name, bookingId: p.booking_id, visaStatus: "approved" }).catch(() => {});
        }).catch(() => {});
    } else if (visaStatus === "rejected") {
      pool.query(
        `SELECT p.full_name, p.mobile_india,
          (SELECT b.id FROM bookings b WHERE b.group_id = p.group_id AND (b.is_deleted IS NULL OR b.is_deleted=false) ORDER BY b.created_at DESC LIMIT 1) AS booking_id
         FROM pilgrims p WHERE p.id=$1`,
        [req.params.pilgrimId]
      ).then(r => {
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
  const { pilgrimIds, visaStatus, visaReceivedDate, visaAppliedDate, overrideReason } = req.body;
  if (!pilgrimIds?.length) return void res.status(400).json({ error: "No pilgrims selected" });
  if (visaStatus && !VISA_STATUSES.includes(visaStatus)) {
    return void res.status(400).json({ error: "Invalid visa status" });
  }
  try {
    // ── Payment guard: check all bookings before committing the bulk update ──
    if (visaStatus === "received" || visaStatus === "approved") {
      const pilgrімRows = await pool.query(
        `SELECT p.id AS pilgrim_id,
           (SELECT b.id FROM bookings b WHERE b.group_id=p.group_id
            AND (b.is_deleted IS NULL OR b.is_deleted=false)
            ORDER BY b.created_at DESC LIMIT 1) AS booking_id
         FROM pilgrims p WHERE p.id=ANY($1)`,
        [pilgrimIds]
      );
      // Collect unique booking IDs that are blocked
      const seenBookings = new Set<string>();
      const blocked: { pilgrim_id: string; booking_id: string; reason: string; outstanding: number; required_advance: number }[] = [];
      for (const row of pilgrімRows.rows) {
        if (!row.booking_id || seenBookings.has(row.booking_id)) continue;
        seenBookings.add(row.booking_id);
        const eligibility = await checkVisaPaymentEligibility(row.booking_id);
        if (!eligibility.eligible) {
          blocked.push({
            pilgrim_id:      row.pilgrim_id,
            booking_id:      row.booking_id,
            reason:          eligibility.reason ?? "Payment not sufficient",
            outstanding:     eligibility.outstanding ?? 0,
            required_advance: eligibility.required_advance ?? 0,
          });
        }
      }
      if (blocked.length > 0) {
        const actor = (req as any).user;
        // Allow super_admin override with a reason
        if (!overrideReason?.trim() || actor?.role !== "super_admin") {
          return void res.status(402).json({
            error: "VISA_PAYMENT_BLOCKED",
            message: `${blocked.length} booking(s) blocked — advance payment not sufficient`,
            blocked,
            override_hint: "Super admin can override by supplying overrideReason in the request body",
          });
        }
        // Log bulk override for each blocked booking
        for (const b of blocked) {
          await pool.query(
            `INSERT INTO finance_audit_logs
               (id, action, entity_type, entity_id, booking_id, actor_id, actor_name, actor_role, reason, new_values, created_at)
             VALUES (gen_random_uuid()::text,'visa_bulk_payment_override','booking',$1,$2,$3,$4,$5,$6,$7,NOW())`,
            [
              b.booking_id, b.booking_id,
              actor?.id, actor?.name, actor?.role,
              overrideReason,
              JSON.stringify({ visa_status: visaStatus, outstanding: b.outstanding, bulk: true, pilgrim_count: pilgrimIds.length }),
            ]
          ).catch(() => {});
        }
        console.log(`[visa] ⚠️  bulk payment override by ${actor?.name} — ${blocked.length} blocked bookings | reason: ${overrideReason}`);
      }
    }

    const placeholders = pilgrimIds.map((_: string, i: number) => `$${i + 4}`).join(",");
    await pool.query(
      `UPDATE pilgrims SET visa_status=$1, visa_received_date=$2, visa_applied_date=$3, updated_at=NOW()
       WHERE id IN (${placeholders})`,
      [visaStatus, visaReceivedDate||null, visaAppliedDate||null, ...pilgrimIds]
    );
    res.json({ message: `Updated ${pilgrimIds.length} pilgrims`, count: pilgrimIds.length });
    if (visaStatus === "received" || visaStatus === "approved") {
      pool.query(
        `SELECT p.id, p.full_name, p.mobile_india,
          (SELECT b.id FROM bookings b WHERE b.group_id = p.group_id AND (b.is_deleted IS NULL OR b.is_deleted=false) ORDER BY b.created_at DESC LIMIT 1) AS booking_id
         FROM pilgrims p WHERE p.id=ANY($1)`,
        [pilgrimIds]
      ).then(r => {
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
