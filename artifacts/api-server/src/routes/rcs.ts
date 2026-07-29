// @ts-nocheck
/**
 * routes/rcs.ts — RCS Template Mapping admin API
 *
 * GET    /api/rcs/mappings          — list all event→template mappings
 * PUT    /api/rcs/mappings/:event   — update one mapping (admin)
 * POST   /api/rcs/test              — test-send: event + mobile + bookingId (admin)
 * POST   /api/rcs/production-validate — run all approved templates against test booking
 * GET    /api/rcs/status/:messageId — poll Lemin delivery status
 * GET    /api/rcs/logs              — recent notification_logs for channel=rcs
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// ── GET /api/rcs/mappings ─────────────────────────────────────────────────────
router.get("/mappings", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM rcs_template_mappings ORDER BY erp_event`);
    res.json({ ok: true, mappings: r.rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── PUT /api/rcs/mappings/:event ──────────────────────────────────────────────
router.put("/mappings/:event", requireAdmin as any, async (req, res) => {
  const event = req.params.event;
  const { template_id, alt_template_id, carrier, template_type, variables_required, enabled, notes, template_name } = req.body;

  try {
    const existing = await pool.query(`SELECT erp_event FROM rcs_template_mappings WHERE erp_event=$1`, [event]);
    if (!existing.rows.length) {
      return void res.status(404).json({ ok: false, error: `No mapping found for event "${event}"` });
    }

    // Build SET clauses dynamically (only update provided fields)
    const updates: string[] = ["updated_at=NOW()"];
    const vals: any[]       = [];
    let i = 1;
    if (template_name   !== undefined) { updates.push(`template_name=$${i++}`);   vals.push(template_name); }
    if (template_id     !== undefined) { updates.push(`template_id=$${i++}`);     vals.push(template_id || null); }
    if (alt_template_id !== undefined) { updates.push(`alt_template_id=$${i++}`); vals.push(alt_template_id || null); }
    if (carrier         !== undefined) { updates.push(`carrier=$${i++}`);         vals.push(carrier); }
    if (template_type   !== undefined) { updates.push(`template_type=$${i++}`);   vals.push(template_type); }
    if (enabled         !== undefined) { updates.push(`enabled=$${i++}`);         vals.push(Boolean(enabled)); }
    if (notes           !== undefined) { updates.push(`notes=$${i++}`);           vals.push(notes); }
    if (variables_required !== undefined) {
      updates.push(`variables_required=$${i++}`);
      vals.push(Array.isArray(variables_required) ? variables_required : []);
    }
    vals.push(event);
    await pool.query(`UPDATE rcs_template_mappings SET ${updates.join(",")} WHERE erp_event=$${i}`, vals);

    const updated = await pool.query(`SELECT * FROM rcs_template_mappings WHERE erp_event=$1`, [event]);
    res.json({ ok: true, mapping: updated.rows[0] });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/rcs/test ────────────────────────────────────────────────────────
router.post("/test", requireAdmin as any, async (req, res) => {
  const { event, mobile, bookingId, skipIdempotency, templateIdOverride, variables: varOverrides } = req.body;
  if (!event || !mobile) return void res.status(400).json({ ok: false, error: "event and mobile are required" });

  try {
    const { sendRCSForEvent, sendCustomRCS, resolveVariables, loadMapping } = await import("../lib/rcs.js");

    // Preview: load mapping + resolve variables before send
    const mapping = await loadMapping(event);
    const tplId = templateIdOverride || mapping?.template_id || null;

    if (!tplId) {
      return void res.json({
        ok: false,
        preview: { mapping, resolvedVars: null },
        error: "No template_id configured for this event. Save an approved template ID first.",
      });
    }

    const resolved = await resolveVariables(event, bookingId, varOverrides || {});
    const preview  = { mapping, resolvedVars: resolved, templateId: tplId, mobile };

    const result = templateIdOverride
      ? await sendCustomRCS({ mobile, templateId: templateIdOverride, variables: resolved as Record<string,string>, bookingId, eventLabel: `test:${event}` })
      : await sendRCSForEvent(event, mobile, bookingId, varOverrides || {}, { skipIdempotency: !!skipIdempotency });

    res.json({ ok: result.ok, preview, result: { ...result, requestPayload: result.requestPayload /* user_id already stripped */ } });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/rcs/production-validate ────────────────────────────────────────
router.post("/production-validate", requireAdmin as any, async (req, res) => {
  const { mobile, bookingId: bodyBookingId } = req.body;
  if (!mobile) return void res.status(400).json({ ok: false, error: "mobile required" });

  try {
    const { sendCustomRCS, resolveVariables, listMappings } = await import("../lib/rcs.js");

    // Find test booking
    let bid = bodyBookingId;
    if (!bid) {
      const r = await pool.query(`SELECT id FROM bookings WHERE customer_mobile='9893989786' AND status IN ('approved','confirmed') ORDER BY created_at DESC LIMIT 1`);
      if (!r.rows.length) {
        const r2 = await pool.query(`SELECT id FROM bookings WHERE status IN ('approved','confirmed') ORDER BY created_at DESC LIMIT 1`);
        if (r2.rows.length) bid = r2.rows[0].id;
      } else bid = r.rows[0].id;
    }

    const mappings = await listMappings();
    const results: Record<string, any> = {};

    for (const m of mappings) {
      if (!m.template_id) {
        results[m.erp_event] = { ok: false, templateId: null, status: "skipped", error: "Template not mapped" };
        continue;
      }
      const resolved = await resolveVariables(m.erp_event, bid, {});
      // Check for missing vars
      const missing = m.variables_required.filter((k: string) => !resolved[k] || resolved[k] === "");

      const result = await sendCustomRCS({
        mobile,
        templateId: m.template_id,
        variables: resolved as Record<string,string>,
        bookingId: bid,
        eventLabel: `prod_validate:${m.erp_event}`,
      });

      results[m.erp_event] = {
        ok: result.ok,
        templateId: m.template_id,
        templateName: m.template_name,
        messageId: result.messageId,
        deliveryStatus: result.deliveryStatus,
        httpStatus: result.httpStatus,
        missingVars: missing.length ? missing : undefined,
        error: result.errorMessage,
      };
    }

    const passed = Object.values(results).filter((r: any) => r.ok).length;
    const total  = mappings.filter((m: any) => !!m.template_id).length;

    res.json({
      ok: passed > 0,
      bookingId: bid,
      mobile,
      passed, total,
      results,
      validatedAt: new Date().toISOString(),
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/rcs/status/:messageId ───────────────────────────────────────────
router.get("/status/:messageId", requireAdmin as any, async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) return void res.status(400).json({ ok: false, error: "messageId required" });
  try {
    const { refreshMessageStatus } = await import("../lib/rcs.js");
    const result = await refreshMessageStatus(messageId);
    res.json({ ok: true, ...result });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/rcs/fallback-stats ──────────────────────────────────────────────
// Returns RCS delivery health + "SMS coverage" metric for the Notification Health panel.
// "SMS coverage" = RCS failed AND the same booking+event had SMS sent within 5 minutes.
router.get("/fallback-stats", requireAdmin as any, async (_req, res) => {
  try {
    const [stats7d, stats24h, perEvent, smsCoverage] = await Promise.all([
      // ── 7-day totals ────────────────────────────────────────────────────────
      pool.query(`
        SELECT
          COUNT(*)                                        AS total,
          COUNT(*) FILTER (WHERE status='sent')           AS sent,
          COUNT(*) FILTER (WHERE status='failed')         AS failed,
          MAX(CASE WHEN status='sent'   THEN sent_at END) AS last_success,
          MAX(CASE WHEN status='failed' THEN sent_at END) AS last_failure
        FROM notification_logs
        WHERE channel='rcs' AND sent_at > NOW() - INTERVAL '7 days'
      `),

      // ── Last 24h totals (for alert threshold) ───────────────────────────────
      pool.query(`
        SELECT
          COUNT(*)                                        AS total,
          COUNT(*) FILTER (WHERE status='sent')           AS sent,
          COUNT(*) FILTER (WHERE status='failed')         AS failed
        FROM notification_logs
        WHERE channel='rcs' AND sent_at > NOW() - INTERVAL '24 hours'
      `),

      // ── Per-event breakdown (7d) ─────────────────────────────────────────────
      pool.query(`
        SELECT
          event_type,
          COUNT(*)                                        AS total,
          COUNT(*) FILTER (WHERE status='sent')           AS sent,
          COUNT(*) FILTER (WHERE status='failed')         AS failed,
          MAX(CASE WHEN status='sent'   THEN sent_at END) AS last_success,
          MAX(CASE WHEN status='failed' THEN sent_at END) AS last_failure,
          -- Most common failure reason from provider_response
          MODE() WITHIN GROUP (ORDER BY
            COALESCE(
              provider_response::json->>'errorMessage',
              provider_response::json->'providerResponse'->>'errorMessage',
              'unknown'
            )
          ) FILTER (WHERE status='failed') AS top_error
        FROM notification_logs
        WHERE channel='rcs' AND sent_at > NOW() - INTERVAL '7 days'
        GROUP BY event_type
        ORDER BY total DESC
      `),

      // ── SMS coverage: RCS failed but SMS succeeded for same booking+event ────
      // within 5-minute window → shows parallel SMS channel covered the customer
      pool.query(`
        SELECT
          rcs.event_type,
          COUNT(*) AS sms_covered_count
        FROM notification_logs rcs
        WHERE rcs.channel = 'rcs'
          AND rcs.status  = 'failed'
          AND rcs.booking_id IS NOT NULL
          AND rcs.sent_at > NOW() - INTERVAL '7 days'
          AND EXISTS (
            SELECT 1
            FROM notification_logs sms
            WHERE sms.channel     = 'sms'
              AND sms.status      = 'sent'
              AND sms.booking_id  = rcs.booking_id
              AND sms.event_type  = rcs.event_type
              AND ABS(EXTRACT(EPOCH FROM (sms.sent_at - rcs.sent_at))) < 300
          )
        GROUP BY rcs.event_type
      `),
    ]);

    const s7 = stats7d.rows[0] || {};
    const s24 = stats24h.rows[0] || {};
    const total7d   = Number(s7.total   || 0);
    const sent7d    = Number(s7.sent    || 0);
    const failed7d  = Number(s7.failed  || 0);
    const total24h  = Number(s24.total  || 0);
    const sent24h   = Number(s24.sent   || 0);
    const failed24h = Number(s24.failed || 0);

    const rate7d  = total7d  > 0 ? Math.round((sent7d  / total7d)  * 100) : null;
    const rate24h = total24h > 0 ? Math.round((sent24h / total24h) * 100) : null;
    const failureRate24h = total24h > 0 ? Math.round((failed24h / total24h) * 100) : 0;

    // Build SMS coverage index
    const smsCoverageMap: Record<string, number> = {};
    for (const r of smsCoverage.rows) {
      smsCoverageMap[r.event_type] = Number(r.sms_covered_count);
    }
    const totalSmsCovered = Object.values(smsCoverageMap).reduce((a, b) => a + b, 0);

    const events = perEvent.rows.map((r: any) => ({
      event:         r.event_type,
      total:         Number(r.total),
      sent:          Number(r.sent),
      failed:        Number(r.failed),
      rate:          Number(r.total) > 0 ? Math.round((Number(r.sent) / Number(r.total)) * 100) : null,
      lastSuccess:   r.last_success || null,
      lastFailure:   r.last_failure || null,
      topError:      r.top_error || null,
      smsCovered:    smsCoverageMap[r.event_type] || 0,
    }));

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      alert: failureRate24h >= 50 && total24h > 0,
      alertThreshold: 50,
      summary7d: {
        total: total7d, sent: sent7d, failed: failed7d,
        rate: rate7d,
        lastSuccess: s7.last_success || null,
        lastFailure: s7.last_failure || null,
        smsCoveredTotal: totalSmsCovered,
      },
      summary24h: {
        total: total24h, sent: sent24h, failed: failed24h,
        rate: rate24h, failureRate: failureRate24h,
      },
      events,
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/rcs/logs ─────────────────────────────────────────────────────────
router.get("/logs", requireAdmin as any, async (req, res) => {
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  try {
    const r = await pool.query(`
      SELECT id, event_type, recipient, customer_name, booking_number, booking_id,
             template_id, template_name, message_id, status, delivery_status,
             http_status, error_code, message,
             sent_at, delivered_at, read_at, last_status_check, created_at,
             -- provider_response for details but never return request_payload (may have user_id in legacy rows)
             provider_response
      FROM notification_logs
      WHERE channel='rcs'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const cnt = await pool.query(`SELECT COUNT(*)::int AS total FROM notification_logs WHERE channel='rcs'`);
    res.json({ ok: true, logs: r.rows, total: cnt.rows[0]?.total || 0 });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;
