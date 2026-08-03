import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { retryWorkflowLog, addTimeline, triggerWorkflow } from "../lib/workflowEngine.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

const DEFAULT_RULES = [
  { name: "New Booking", trigger_type: "new_booking", description: "Triggered when a customer submits a new booking", group_name: "Bookings", enabled: true },
  { name: "Booking Approved", trigger_type: "booking_approved", description: "Triggered when admin approves a booking", group_name: "Bookings", enabled: true },
  { name: "Booking Rejected", trigger_type: "booking_rejected", description: "Triggered when admin rejects a booking", group_name: "Bookings", enabled: true },
  { name: "Payment Received", trigger_type: "payment_received", description: "Triggered when any payment is received", group_name: "Payments", enabled: true },
  { name: "Payment Reminder — 30 Days", trigger_type: "payment_reminder_30", description: "Auto-reminder 30 days before due date", group_name: "Payments", enabled: true },
  { name: "Payment Reminder — 15 Days", trigger_type: "payment_reminder_15", description: "Auto-reminder 15 days before due date", group_name: "Payments", enabled: true },
  { name: "Payment Reminder — 7 Days", trigger_type: "payment_reminder_7", description: "Auto-reminder 7 days before due date", group_name: "Payments", enabled: true },
  { name: "Payment Reminder — 3 Days", trigger_type: "payment_reminder_3", description: "Auto-reminder 3 days before due date", group_name: "Payments", enabled: true },
  { name: "Payment Reminder — 1 Day", trigger_type: "payment_reminder_1", description: "Auto-reminder 1 day before due date", group_name: "Payments", enabled: true },
  { name: "Passport Uploaded", trigger_type: "passport_uploaded", description: "Triggered when passport is uploaded for a pilgrim", group_name: "Documents", enabled: true },
  { name: "Visa Approved", trigger_type: "visa_approved", description: "Triggered when visa status set to approved", group_name: "Documents", enabled: true },
  { name: "Visa Rejected", trigger_type: "visa_rejected", description: "Triggered when visa is rejected", group_name: "Documents", enabled: true },
  { name: "Flight Assigned", trigger_type: "flight_assigned", description: "Triggered when flight is assigned to pilgrims", group_name: "Travel", enabled: true },
  { name: "Hotel / Room Assigned", trigger_type: "hotel_assigned", description: "Triggered when a room is assigned", group_name: "Travel", enabled: true },
  { name: "Bus Assigned", trigger_type: "bus_assigned", description: "Triggered when a bus seat is assigned", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 7 Days", trigger_type: "departure_reminder_7d", description: "Auto-reminder 7 days before departure", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 3 Days", trigger_type: "departure_reminder_3d", description: "Auto-reminder 3 days before departure", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 1 Day", trigger_type: "departure_reminder_1d", description: "Auto-reminder 1 day before departure", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 12 Hours", trigger_type: "departure_reminder_12h", description: "Auto-reminder 12 hours before departure", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 6 Hours", trigger_type: "departure_reminder_6h", description: "Auto-reminder 6 hours before departure", group_name: "Travel", enabled: true },
  { name: "Return Reminder", trigger_type: "return_reminder", description: "Sent on the day of return flight", group_name: "Travel", enabled: true },
  { name: "Feedback Request", trigger_type: "feedback_request", description: "Auto-sent 3 days after return", group_name: "Post-Trip", enabled: true },
  { name: "Document Expiry — 90 Days", trigger_type: "document_expiry_90", description: "Notify 90 days before passport/visa expiry", group_name: "Documents", enabled: true },
  { name: "Document Expiry — 60 Days", trigger_type: "document_expiry_60", description: "Notify 60 days before passport/visa expiry", group_name: "Documents", enabled: true },
  { name: "Document Expiry — 30 Days", trigger_type: "document_expiry_30", description: "Notify 30 days before passport/visa expiry", group_name: "Documents", enabled: true },
  { name: "Document Expiry — 7 Days", trigger_type: "document_expiry_7", description: "Notify 7 days before passport/visa expiry", group_name: "Documents", enabled: true },
  { name: "Medical Emergency", trigger_type: "medical_emergency", description: "Triggered on critical/high severity medical case", group_name: "Safety", enabled: true },
  { name: "Booking Completed", trigger_type: "booking_completed", description: "Triggered when a trip is marked complete — sends thank-you + feedback link", group_name: "Bookings", enabled: true },
  { name: "Balance Reminder — 30 Days", trigger_type: "balance_reminder_30", description: "Auto-reminder when balance due in 30 days", group_name: "Payments", enabled: true },
  { name: "Balance Reminder — 15 Days", trigger_type: "balance_reminder_15", description: "Auto-reminder when balance due in 15 days", group_name: "Payments", enabled: true },
  { name: "Balance Reminder — 7 Days", trigger_type: "balance_reminder_7", description: "Auto-reminder when balance due in 7 days", group_name: "Payments", enabled: true },
  { name: "Balance Reminder — 3 Days", trigger_type: "balance_reminder_3", description: "Auto-reminder when balance due in 3 days", group_name: "Payments", enabled: true },
  { name: "Balance Reminder — 1 Day", trigger_type: "balance_reminder_1", description: "Auto-reminder when balance due tomorrow", group_name: "Payments", enabled: true },
  { name: "Balance Overdue", trigger_type: "balance_overdue", description: "Repeating reminder every 7 days after due date passes", group_name: "Payments", enabled: true },
  { name: "Document Upload Reminder", trigger_type: "document_reminder", description: "Remind pilgrims every 3 days to upload missing documents", group_name: "Documents", enabled: true },
  { name: "Ziyarat Reminder", trigger_type: "ziyarat_reminder", description: "Sent the evening before a scheduled ziyarat trip", group_name: "Travel", enabled: true },
  { name: "Departure Reminder — 2 Hours", trigger_type: "departure_reminder_2h", description: "Auto-reminder 2 hours before departure", group_name: "Travel", enabled: true },
];

router.get("/rules", requireAdmin as any, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM workflow_rules ORDER BY group_name, name`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/rules/:id", requireAdmin as any, async (req, res) => {
  try {
    const { enabled, name, description, config } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (typeof enabled === "boolean") { updates.push(`enabled=$${idx++}`); values.push(enabled); }
    if (name !== undefined) { updates.push(`name=$${idx++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description=$${idx++}`); values.push(description); }
    if (config !== undefined) { updates.push(`config=$${idx++}`); values.push(JSON.stringify(config)); }
    updates.push(`updated_at=NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE workflow_rules SET ${updates.join(", ")} WHERE id=$${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/rules/:id/clone", requireAdmin as any, async (req, res) => {
  try {
    const orig = await pool.query(`SELECT * FROM workflow_rules WHERE id=$1`, [req.params.id]);
    if (!orig.rows[0]) { res.status(404).json({ message: "Rule not found" }); return; }
    const r = orig.rows[0];
    const cloned = await pool.query(
      `INSERT INTO workflow_rules (name, trigger_type, description, enabled, group_name, config)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [`${r.name} (Copy)`, `${r.trigger_type}_copy_${Date.now()}`, r.description, false, r.group_name, JSON.stringify(r.config)]
    );
    res.json(cloned.rows[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/rules/:id", requireAdmin as any, async (req: any, res) => {
  try {
    if (req.user?.adminRole !== "super_admin") {
      res.status(403).json({ message: "Only Super Admin can delete workflow rules" });
      return;
    }
    await pool.query(`DELETE FROM workflow_rules WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/rules/:id/test", requireAdmin as any, async (req, res) => {
  try {
    const rule = await pool.query(`SELECT * FROM workflow_rules WHERE id=$1`, [req.params.id]);
    if (!rule.rows[0]) { res.status(404).json({ message: "Rule not found" }); return; }
    const r = rule.rows[0];
    const testCtx = {
      bookingId: "TEST-001",
      bookingNumber: "AB-TEST-001",
      customerName: "Test Customer",
      customerMobile: req.body?.mobile ?? "9999999999",
      customerEmail: req.body?.email ?? "test@example.com",
      packageName: "Hajj Package 2025",
      amount: 150000,
      balance: 50000,
      ...req.body,
    };
    await triggerWorkflow(r.trigger_type, testCtx);
    res.json({ success: true, message: `Test triggered for ${r.name}` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/logs", requireAdmin as any, async (req, res) => {
  try {
    const { status, trigger, search, limit = "50", offset = "0", date } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status && status !== "all") { conditions.push(`status=$${idx++}`); values.push(status); }
    if (trigger && trigger !== "all") { conditions.push(`trigger_type=$${idx++}`); values.push(trigger); }
    if (search) { conditions.push(`(customer_name ILIKE $${idx} OR booking_id ILIKE $${idx})`); values.push(`%${search}%`); idx++; }
    if (date) { conditions.push(`created_at::date=$${idx++}`); values.push(date); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await pool.query(`SELECT COUNT(*) FROM workflow_logs ${where}`, values);
    const dataRes = await pool.query(
      `SELECT * FROM workflow_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, parseInt(limit), parseInt(offset)]
    );

    res.json({ total: parseInt(countRes.rows[0].count), rows: dataRes.rows });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/stats", requireAdmin as any, async (_req, res) => {
  try {
    const today = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='completed') AS completed,
        COUNT(*) FILTER (WHERE status='failed') AS failed,
        COUNT(*) FILTER (WHERE status='running') AS running,
        COUNT(*) FILTER (WHERE status='skipped') AS skipped,
        COUNT(*) AS total
      FROM workflow_logs
      WHERE created_at >= CURRENT_DATE
    `);
    const recentFailed = await pool.query(`
      SELECT id, trigger_type, customer_name, booking_id, error_message, retry_count, created_at
      FROM workflow_logs WHERE status='failed' ORDER BY created_at DESC LIMIT 5
    `);
    const byTrigger = await pool.query(`
      SELECT trigger_type, COUNT(*) AS count, COUNT(*) FILTER (WHERE status='failed') AS failed
      FROM workflow_logs WHERE created_at >= CURRENT_DATE - interval '7 days'
      GROUP BY trigger_type ORDER BY count DESC LIMIT 10
    `);
    const rulesCount = await pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM workflow_rules`);

    res.json({
      today: today.rows[0],
      recentFailed: recentFailed.rows,
      byTrigger: byTrigger.rows,
      rules: rulesCount.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/retry/:logId", requireAdmin as any, async (req, res) => {
  try {
    const result = await retryWorkflowLog(parseInt(req.params.logId));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/retry-all-failed", requireAdmin as any, async (_req, res) => {
  try {
    const failed = await pool.query(
      `SELECT id FROM workflow_logs WHERE status='failed' AND retry_count < 3 ORDER BY created_at DESC LIMIT 50`
    );
    let retried = 0;
    for (const row of failed.rows) {
      const r = await retryWorkflowLog(row.id);
      if (r.success) retried++;
    }
    res.json({ retried, total: failed.rows.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/admin-events", requireAdmin as any, async (req, res) => {
  try {
    const since = req.query.since as string;
    const cond = since ? `AND created_at > $1` : "";
    const vals = since ? [since] : [];
    const result = await pool.query(
      `SELECT * FROM admin_events ${since ? "WHERE" : ""} ${since ? `created_at > $1` : ""}
       ORDER BY created_at DESC LIMIT 20`,
      vals
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/admin-events/read-all", requireAdmin as any, async (_req, res) => {
  try {
    await pool.query(`UPDATE admin_events SET is_read=true WHERE is_read=false`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/timeline/:bookingId", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer_timeline WHERE booking_id=$1 ORDER BY created_at ASC`,
      [req.params.bookingId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/timeline-customer/:customerId", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer_timeline WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.customerId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/timeline", requireAdmin as any, async (req, res) => {
  try {
    const { customerId, bookingId, eventType, title, description, icon } = req.body;
    await addTimeline({ customerId, bookingId, eventType, title, description, icon });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
export { DEFAULT_RULES };
