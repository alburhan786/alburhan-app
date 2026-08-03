// @ts-nocheck
/**
 * COMMUNICATION MANAGEMENT API
 * Provides: event mappings, provider health, communication audit logs,
 * resend with audit trail, circuit breaker management.
 *
 * Mounted at /api/comm-mgmt
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();
router.use(requireAdmin as any);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeAuditLog(data: {
  action: string;
  actorId?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO communication_audit_logs
         (action, actor_id, actor_role, entity_type, entity_id,
          old_values, new_values, reason, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        data.action, data.actorId || null, data.actorRole || null,
        data.entityType || null, data.entityId || null,
        data.oldValues ? JSON.stringify(data.oldValues) : null,
        data.newValues ? JSON.stringify(data.newValues) : null,
        data.reason || null, data.ipAddress || null, data.userAgent || null,
      ]
    );
  } catch (e: any) {
    console.warn("[comm-mgmt] audit log write failed:", e.message);
  }
}

// ── EVENT MAPPINGS ────────────────────────────────────────────────────────────

/** GET /event-mappings — list all */
router.get("/event-mappings", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { event_type, channel } = req.query;
    const conds: string[] = [`tenant_id=$1::uuid`];
    const params: any[] = [tenantId];
    if (event_type) { conds.push(`event_type=$${params.length+1}`); params.push(event_type); }
    if (channel)    { conds.push(`channel=$${params.length+1}`); params.push(channel); }
    const where = `WHERE ${conds.join(" AND ")}`;
    const rows = await pool.query(
      `SELECT * FROM communication_event_mappings ${where} ORDER BY event_type, channel`,
      params
    );
    res.json({ mappings: rows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** PUT /event-mappings — upsert one mapping */
router.put("/event-mappings", async (req: any, res) => {
  const actor = (req as any).user;
  try {
    const {
      event_type, channel, enabled, primary_provider, fallback_provider,
      template_id, fallback_template_id, retry_max, retry_policy,
      recipient_type, send_timing, attachment_policy, notes,
    } = req.body;

    if (!event_type || !channel) {
      return res.status(400).json({ error: "event_type and channel are required" });
    }

    const old = await pool.query(
      `SELECT * FROM communication_event_mappings WHERE event_type=$1 AND channel=$2`,
      [event_type, channel]
    ).then(r => r.rows[0] || null);

    const row = await pool.query(
      `INSERT INTO communication_event_mappings
         (id, event_type, channel, enabled, primary_provider, fallback_provider,
          template_id, fallback_template_id, retry_max, retry_policy,
          recipient_type, send_timing, attachment_policy, notes, updated_by, updated_at)
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()
       )
       ON CONFLICT (event_type, channel) DO UPDATE SET
         enabled=EXCLUDED.enabled, primary_provider=EXCLUDED.primary_provider,
         fallback_provider=EXCLUDED.fallback_provider, template_id=EXCLUDED.template_id,
         fallback_template_id=EXCLUDED.fallback_template_id, retry_max=EXCLUDED.retry_max,
         retry_policy=EXCLUDED.retry_policy, recipient_type=EXCLUDED.recipient_type,
         send_timing=EXCLUDED.send_timing, attachment_policy=EXCLUDED.attachment_policy,
         notes=EXCLUDED.notes, updated_by=EXCLUDED.updated_by, updated_at=NOW()
       RETURNING *`,
      [
        `cem_${event_type}_${channel}`, event_type, channel, enabled !== false,
        primary_provider || null, fallback_provider || null,
        template_id || null, fallback_template_id || null,
        retry_max ?? 3, JSON.stringify(retry_policy || { delays: [300, 1800, 7200, 43200] }),
        recipient_type || "customer", send_timing || "immediate",
        attachment_policy || "link_only", notes || null,
        actor?.id || null,
      ]
    );

    await writeAuditLog({
      action: old ? "event_mapping_updated" : "event_mapping_created",
      actorId: actor?.id, actorRole: actor?.role,
      entityType: "event_mapping", entityId: `${event_type}_${channel}`,
      oldValues: old, newValues: row.rows[0],
      ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    // Sync back to notification_settings for backward compat
    await pool.query(
      `INSERT INTO notification_settings (id, event_type, channel, enabled, template_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_type, channel) DO UPDATE SET enabled=EXCLUDED.enabled, template_id=EXCLUDED.template_id`,
      [`ns_${event_type}_${channel}`, event_type, channel, enabled !== false, template_id || null]
    ).catch(() => {});

    res.json({ mapping: row.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** GET /event-mappings/matrix — full event × channel enablement matrix */
router.get("/event-mappings/matrix", async (_req, res) => {
  try {
    const [mappings, settings] = await Promise.all([
      pool.query(`SELECT * FROM communication_event_mappings ORDER BY event_type, channel`),
      pool.query(`SELECT * FROM notification_settings WHERE tenant_id=$1::uuid ORDER BY event_type, channel`, [getTenantId(req)]),
    ]);

    // Merge: comm_event_mappings wins; fall back to notification_settings
    const map: Record<string, any> = {};
    for (const s of settings.rows) {
      map[`${s.event_type}::${s.channel}`] = { ...s, source: "notification_settings" };
    }
    for (const m of mappings.rows) {
      map[`${m.event_type}::${m.channel}`] = { ...m, source: "communication_event_mappings" };
    }
    res.json({ matrix: Object.values(map) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PROVIDER HEALTH ────────────────────────────────────────────────────────────

/** GET /provider-health — all provider health rows */
router.get("/provider-health", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rows = await pool.query(
      `SELECT * FROM provider_health_status WHERE tenant_id=$1::uuid ORDER BY channel, provider`,
      [tenantId]
    );
    res.json({ providers: rows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /provider-health/:provider/circuit-reset — Super Admin resets circuit breaker */
router.post("/provider-health/:provider/circuit-reset", async (req: any, res) => {
  const actor = (req as any).user;
  const { provider } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: "reason is required for circuit breaker reset" });
  }

  try {
    const old = await pool.query(
      `SELECT * FROM provider_health_status WHERE provider=$1`, [provider]
    ).then(r => r.rows[0] || null);

    const updated = await pool.query(
      `UPDATE provider_health_status
       SET circuit_state='closed', consecutive_failures=0, updated_at=NOW()
       WHERE provider=$1 RETURNING *`,
      [provider]
    );
    if (!updated.rows[0]) {
      return res.status(404).json({ error: `Provider "${provider}" not found` });
    }

    await writeAuditLog({
      action: "circuit_breaker_reset",
      actorId: actor?.id, actorRole: actor?.role,
      entityType: "provider", entityId: provider,
      oldValues: old, newValues: updated.rows[0],
      reason, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, provider: updated.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /provider-health/:provider/toggle — enable/disable a provider */
router.post("/provider-health/:provider/toggle", async (req: any, res) => {
  const actor = (req as any).user;
  const { provider } = req.params;
  const { enabled, reason } = req.body;

  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) required" });
  if (!reason) return res.status(400).json({ error: "reason is required" });

  try {
    const updated = await pool.query(
      `UPDATE provider_health_status SET is_enabled=$1, updated_at=NOW() WHERE provider=$2 RETURNING *`,
      [enabled, provider]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: "Provider not found" });

    await writeAuditLog({
      action: enabled ? "provider_enabled" : "provider_disabled",
      actorId: actor?.id, actorRole: actor?.role,
      entityType: "provider", entityId: provider,
      newValues: { enabled }, reason,
      ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, provider: updated.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── RESEND WITH AUDIT ──────────────────────────────────────────────────────────

/** POST /resend/:logId — resend a specific notification log with mandatory reason + audit */
router.post("/resend/:logId", async (req: any, res) => {
  const actor = (req as any).user;
  const { logId } = req.params;
  const { reason, channel: overrideChannel } = req.body;

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({
      error: "A reason of at least 5 characters is required for manual resend",
    });
  }

  try {
    const logRow = await pool.query(`SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`, [logId]);
    if (!logRow.rows[0]) return res.status(404).json({ error: "Notification log not found" });
    const log = logRow.rows[0];

    // Blocked resend cases
    if (log.event_type === "mobile_otp" || log.event_type === "customer_registration_otp") {
      return res.status(400).json({ error: "Cannot resend OTP notifications — OTPs expire and must be re-requested by the customer" });
    }
    if (log.status === "cancelled") {
      return res.status(400).json({ error: "Cannot resend a cancelled communication" });
    }

    // Warn if previously delivered/read
    const alreadyDelivered = log.status === "delivered" || log.status === "read";

    const newQueueId = `nrq_resend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newLogId = `nl_resend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Insert new log row marked as manual resend
    await pool.query(
      `INSERT INTO notification_logs
         (id, event_type, customer_id, booking_id, booking_number, customer_name,
          channel, recipient, message, status,
          is_manual_resend, original_log_id, canonical_event,
          template_id, template_name, provider_name,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',true,$10,$11,$12,$13,$14,NOW(),NOW())`,
      [
        newLogId, log.event_type, log.customer_id, log.booking_id, log.booking_number,
        log.customer_name, overrideChannel || log.channel, log.recipient, log.message,
        logId, log.canonical_event || log.event_type,
        log.template_id, log.template_name, log.provider_name,
      ]
    ).catch(() => {});

    // Queue for delivery
    await pool.query(
      `INSERT INTO notification_retry_queue
         (id, notification_log_id, event_type, channel, customer_id, booking_id,
          recipient, message, context, retry_count, status, last_error, next_retry_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'pending',$10,NOW())`,
      [
        newQueueId, newLogId, log.event_type, overrideChannel || log.channel,
        log.customer_id, log.booking_id, log.recipient, log.message || "",
        JSON.stringify({
          eventType: log.event_type, bookingId: log.booking_id,
          bookingNumber: log.booking_number, customerName: log.customer_name,
        }),
        `Manual resend by ${actor?.name || actor?.id || "admin"}: ${reason}`,
      ]
    );

    await writeAuditLog({
      action: "manual_resend",
      actorId: actor?.id, actorRole: actor?.role,
      entityType: "notification_log", entityId: logId,
      newValues: { newLogId, newQueueId, channel: overrideChannel || log.channel, reason, alreadyDelivered },
      reason, ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    // Insert status history entry
    await pool.query(
      `INSERT INTO communication_status_history
         (log_id, status, status_detail, actor)
       VALUES ($1,'pending',$2,$3)`,
      [newLogId, `Manual resend queued. Reason: ${reason}`, actor?.id || "admin"]
    ).catch(() => {});

    res.json({
      ok: true,
      newLogId,
      queueId: newQueueId,
      alreadyDeliveredWarning: alreadyDelivered
        ? "The original message was already delivered/read — this will send a duplicate"
        : null,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── AUDIT LOGS ─────────────────────────────────────────────────────────────────

/** GET /audit-logs — paginated audit log viewer */
router.get("/audit-logs", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { limit = "50", offset = "0", action, actor_id, entity_type } = req.query as any;
    const conds: string[] = [`tenant_id=$1::uuid`];
    const params: any[] = [tenantId];
    if (action)      { conds.push(`action=$${params.length+1}`); params.push(action); }
    if (actor_id)    { conds.push(`actor_id=$${params.length+1}`); params.push(actor_id); }
    if (entity_type) { conds.push(`entity_type=$${params.length+1}`); params.push(entity_type); }
    const where = `WHERE ${conds.join(" AND ")}`;
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT * FROM communication_audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, Number(limit), Number(offset)]
      ),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM communication_audit_logs ${where}`, params),
    ]);
    res.json({ logs: rows.rows, total: total.rows[0]?.cnt || 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── COMMUNICATION STATUS HISTORY ──────────────────────────────────────────────

/** GET /status-history/:logId */
router.get("/status-history/:logId", async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM communication_status_history WHERE log_id=$1 ORDER BY created_at ASC`,
      [req.params.logId]
    );
    res.json({ history: rows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /status-history/:logId — record a new status event (webhook / internal) */
router.post("/status-history/:logId", async (req, res) => {
  try {
    const { status, status_detail, provider_message_id, webhook_payload, actor } = req.body;
    if (!status) return res.status(400).json({ error: "status required" });
    const row = await pool.query(
      `INSERT INTO communication_status_history
         (log_id, status, status_detail, provider_message_id, webhook_payload, actor)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.logId, status, status_detail || null, provider_message_id || null,
       webhook_payload ? JSON.stringify(webhook_payload) : null, actor || null]
    );
    // Also update main log status
    await pool.query(
      `UPDATE notification_logs SET status=$1, delivery_status=$1, updated_at=NOW()
       WHERE id=$2`,
      [status, req.params.logId]
    ).catch(() => {});
    res.json({ entry: row.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATION LOG DETAIL (enhanced) ────────────────────────────────────────

/** GET /log-detail/:id — full log detail with status history */
router.get("/log-detail/:id", async (req, res) => {
  try {
    const [logRow, historyRows] = await Promise.all([
      pool.query(`SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`, [req.params.id]),
      pool.query(
        `SELECT * FROM communication_status_history WHERE log_id=$1 ORDER BY created_at ASC`,
        [req.params.id]
      ),
    ]);
    if (!logRow.rows[0]) return res.status(404).json({ error: "Log not found" });

    const log = logRow.rows[0];

    // Mask sensitive fields before returning
    const safe = { ...log };
    if (safe.request_payload) {
      try {
        const rp = typeof safe.request_payload === "string"
          ? JSON.parse(safe.request_payload) : safe.request_payload;
        // Remove API keys / tokens
        const MASK_KEYS = ["apiKey","api_key","authorization","Authorization","token","password","otp","secret"];
        for (const k of MASK_KEYS) {
          if (rp[k]) rp[k] = "***MASKED***";
        }
        safe.request_payload_safe = rp;
        delete safe.request_payload;
      } catch {}
    }

    res.json({ log: safe, statusHistory: historyRows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── TEMPLATE MANAGEMENT (enhanced) ────────────────────────────────────────────

/** GET /templates — list with full spec fields */
router.get("/templates", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel, event_type, approval_status, provider } = req.query as any;
    const conds: string[] = [`tenant_id=$1::uuid`];
    const params: any[] = [tenantId];
    if (channel)         { conds.push(`channel=$${params.length+1}`); params.push(channel); }
    if (event_type)      { conds.push(`event_type=$${params.length+1}`); params.push(event_type); }
    if (approval_status) { conds.push(`approval_status=$${params.length+1}`); params.push(approval_status); }
    if (provider)        { conds.push(`provider=$${params.length+1}`); params.push(provider); }
    const where = `WHERE ${conds.join(" AND ")}`;
    const rows = await pool.query(
      `SELECT id, name, event_type, channel, provider, subject,
              body, variables, required_variables, optional_variables,
              provider_template_id, provider_template_name, approval_status,
              fallback_template_id, is_default, enabled, version,
              last_tested_at, last_success_at, last_failure_at, last_failure_reason,
              created_by, updated_by, created_at, updated_at
       FROM notification_templates ${where} ORDER BY event_type, channel, name`,
      params
    );
    res.json({ templates: rows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** PUT /templates/:id — update with enhanced fields + audit */
router.put("/templates/:id", async (req: any, res) => {
  const actor = (req as any).user;
  try {
    const old = await pool.query(
      `SELECT * FROM notification_templates WHERE id=$1`, [req.params.id]
    ).then(r => r.rows[0] || null);
    if (!old) return res.status(404).json({ error: "Template not found" });

    const {
      name, event_type, channel, provider, subject, body,
      variables, required_variables, optional_variables,
      provider_template_id, provider_template_name, approval_status,
      fallback_template_id, enabled,
      // Provider-specific
      dlt_template_id, botbee_template_id, meta_template_id, sender_id, language,
    } = req.body;

    const updated = await pool.query(
      `UPDATE notification_templates SET
         name=COALESCE($1,name), event_type=COALESCE($2,event_type),
         channel=COALESCE($3,channel), provider=COALESCE($4,provider),
         subject=$5, body=COALESCE($6,body),
         variables=COALESCE($7,variables),
         required_variables=COALESCE($8,required_variables),
         optional_variables=COALESCE($9,optional_variables),
         provider_template_id=$10, provider_template_name=$11,
         approval_status=COALESCE($12,approval_status),
         fallback_template_id=$13,
         enabled=COALESCE($14,enabled),
         dlt_template_id=COALESCE($15,dlt_template_id),
         botbee_template_id=COALESCE($16,botbee_template_id),
         meta_template_id=COALESCE($17,meta_template_id),
         sender_id=COALESCE($18,sender_id),
         language=COALESCE($19,language),
         version = COALESCE(version,1) + 1,
         updated_by=$20, updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [
        name, event_type, channel, provider,
        subject || null, body,
        variables ? JSON.stringify(variables) : null,
        required_variables ? JSON.stringify(required_variables) : null,
        optional_variables ? JSON.stringify(optional_variables) : null,
        provider_template_id || null, provider_template_name || null,
        approval_status || null, fallback_template_id || null,
        enabled,
        dlt_template_id || null, botbee_template_id || null,
        meta_template_id || null, sender_id || null, language || null,
        actor?.id || null, req.params.id,
      ]
    );

    await writeAuditLog({
      action: "template_updated",
      actorId: actor?.id, actorRole: actor?.role,
      entityType: "template", entityId: req.params.id,
      oldValues: { name: old.name, body: old.body, approval_status: old.approval_status },
      newValues: { name, body, approval_status },
      ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    res.json({ template: updated.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── SCHEDULED MESSAGES ─────────────────────────────────────────────────────────

/** GET /schedules — list scheduled messages */
router.get("/schedules", async (req, res) => {
  try {
    const { status, booking_id } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (status)     { conds.push(`status=$${params.length+1}`); params.push(status); }
    if (booking_id) { conds.push(`booking_id=$${params.length+1}`); params.push(booking_id); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rows = await pool.query(
      `SELECT * FROM communication_schedules ${where} ORDER BY scheduled_at ASC LIMIT 200`,
      params
    );
    res.json({ schedules: rows.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** POST /schedules — create */
router.post("/schedules", async (req: any, res) => {
  const actor = (req as any).user;
  try {
    const {
      event_type, booking_id, group_id, recipient, channel,
      template_id, scheduled_at, timezone = "Asia/Kolkata", context,
    } = req.body;

    if (!event_type || !recipient || !channel || !scheduled_at) {
      return res.status(400).json({ error: "event_type, recipient, channel, scheduled_at are required" });
    }

    const idKey = `sched_${event_type}_${channel}_${booking_id || "none"}_${new Date(scheduled_at).toISOString()}`;
    const row = await pool.query(
      `INSERT INTO communication_schedules
         (id, event_type, booking_id, group_id, recipient, channel,
          template_id, scheduled_at, timezone, status, context,
          idempotency_key, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        `cs_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        event_type, booking_id || null, group_id || null,
        recipient, channel, template_id || null,
        new Date(scheduled_at).toISOString(), timezone,
        context ? JSON.stringify(context) : null,
        idKey, actor?.id || null,
      ]
    );

    if (!row.rows[0]) return res.json({ ok: true, skipped: true, reason: "Duplicate schedule (idempotency)" });

    await writeAuditLog({
      action: "schedule_created", actorId: actor?.id, actorRole: actor?.role,
      entityType: "schedule", entityId: row.rows[0].id,
      newValues: row.rows[0],
      ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, schedule: row.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** DELETE /schedules/:id — cancel */
router.delete("/schedules/:id", async (req: any, res) => {
  const actor = (req as any).user;
  const { reason } = req.body;
  try {
    const updated = await pool.query(
      `UPDATE communication_schedules
       SET status='cancelled', cancellation_reason=$1, updated_at=NOW()
       WHERE id=$2 AND status='pending' RETURNING *`,
      [reason || "Cancelled by admin", req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: "Schedule not found or already sent/cancelled" });

    await writeAuditLog({
      action: "schedule_cancelled", actorId: actor?.id, actorRole: actor?.role,
      entityType: "schedule", entityId: req.params.id,
      reason: reason || "Cancelled by admin",
      ipAddress: req.ip, userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, schedule: updated.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
