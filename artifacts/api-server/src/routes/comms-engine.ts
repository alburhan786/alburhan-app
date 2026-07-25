// @ts-nocheck
/**
 * COMMUNICATION ENGINE API
 * Central hub for the Communication & Automation Center admin module.
 * Provides: Live Queue, Event Log, Dead Letter Queue, Provider Health, Analytics, Workflow Management.
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { publishEvent, ensureCommEventsTable } from "../lib/eventBus.js";

const router = Router();
router.use(requireAdmin as any);

// ── Init ──────────────────────────────────────────────────────────────────
ensureCommEventsTable().catch(() => {});

// ── GET /summary — Dashboard summary stats ─────────────────────────────────
router.get("/summary", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [notifStats, queueStats, workflowStats, eventStats, dlqStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                               AS total,
          COUNT(*) FILTER (WHERE status='sent')::int                 AS sent,
          COUNT(*) FILTER (WHERE status='failed')::int               AS failed,
          COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1h')::int AS last_hour,
          COUNT(*) FILTER (WHERE DATE(created_at) = $1)::int         AS today,
          ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(delivered_at, updated_at) - created_at))*1000))::int AS avg_ms
        FROM notification_logs WHERE created_at >= NOW() - INTERVAL '7 days'`, [today]),
      pool.query(`
        SELECT status, COUNT(*)::int AS cnt
        FROM notification_retry_queue
        GROUP BY status`),
      pool.query(`
        SELECT
          COUNT(*)::int                                               AS total,
          COUNT(*) FILTER (WHERE status='completed')::int            AS completed,
          COUNT(*) FILTER (WHERE status='failed')::int               AS failed,
          COUNT(*) FILTER (WHERE DATE(created_at) = $1)::int         AS today
        FROM workflow_logs WHERE created_at >= NOW() - INTERVAL '7 days'`, [today]),
      pool.query(`
        SELECT
          COUNT(*)::int                                               AS total,
          COUNT(*) FILTER (WHERE status='processed')::int            AS processed,
          COUNT(*) FILTER (WHERE status='failed')::int               AS failed,
          COUNT(*) FILTER (WHERE DATE(created_at) = $1)::int         AS today
        FROM comm_events WHERE created_at >= NOW() - INTERVAL '7 days'`).catch(() => ({
          rows: [{ total: 0, processed: 0, failed: 0, today: 0 }]
        })),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM notification_retry_queue WHERE status='failed'`),
    ]);

    const ns = notifStats.rows[0] || {};
    const ws = workflowStats.rows[0] || {};
    const es = eventStats.rows[0] || {};
    const queueMap: Record<string,number> = {};
    for (const r of queueStats.rows) queueMap[r.status] = r.cnt;

    res.json({
      notifications: {
        total: ns.total || 0, sent: ns.sent || 0, failed: ns.failed || 0,
        last_hour: ns.last_hour || 0, today: ns.today || 0, avg_ms: ns.avg_ms || 0,
        success_rate: ns.total > 0 ? Math.round(ns.sent / ns.total * 100) : 0,
      },
      queue: {
        pending:   queueMap.pending  || 0,
        sending:   queueMap.sending  || 0,
        sent:      queueMap.sent     || 0,
        failed:    queueMap.failed   || 0,
      },
      workflows: {
        total: ws.total || 0, completed: ws.completed || 0, failed: ws.failed || 0, today: ws.today || 0,
      },
      events: {
        total: es.total || 0, processed: es.processed || 0, failed: es.failed || 0, today: es.today || 0,
      },
      dlq: { total: dlqStats.rows[0]?.cnt || 0 },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /queue — Live notification queue (with full filter support) ─────────
router.get("/queue", async (req, res) => {
  const limit      = Math.min(Number(req.query.limit  || 50), 200);
  const offset     = Number(req.query.offset || 0);
  const status     = req.query.status     as string | undefined;
  const eventType  = req.query.event_type as string | undefined;
  const channel    = req.query.channel    as string | undefined;
  const search     = req.query.search     as string | undefined;   // booking_id / customer / mobile
  const dateFrom   = req.query.date_from  as string | undefined;
  const dateTo     = req.query.date_to    as string | undefined;
  try {
    const conds: string[] = ["1=1"];
    const params: any[]   = [];
    let pi = 1;
    if (status)    { conds.push(`rq.status = $${pi++}`);                       params.push(status.replace(/'/g,"")); }
    if (eventType) { conds.push(`rq.event_type ILIKE $${pi++}`);               params.push(`%${eventType}%`); }
    if (channel)   { conds.push(`rq.channel = $${pi++}`);                      params.push(channel); }
    if (dateFrom)  { conds.push(`rq.created_at >= $${pi++}::date`);            params.push(dateFrom); }
    if (dateTo)    { conds.push(`rq.created_at < ($${pi++}::date + INTERVAL '1 day')`); params.push(dateTo); }
    if (search) {
      conds.push(`(rq.booking_id ILIKE $${pi} OR rq.recipient ILIKE $${pi} OR nl.customer_name ILIKE $${pi} OR nl.booking_number ILIKE $${pi})`);
      params.push(`%${search}%`); pi++;
    }
    const where = `WHERE ${conds.join(" AND ")}`;
    const r = await pool.query(`
      SELECT rq.id, rq.event_type, rq.channel, rq.customer_id, rq.booking_id,
             rq.recipient, rq.message, rq.status, rq.retry_count, rq.last_error,
             rq.next_retry_at, rq.created_at, rq.updated_at,
             nl.customer_name, nl.booking_number, nl.provider_name
      FROM notification_retry_queue rq
      LEFT JOIN notification_logs nl ON nl.id = rq.notification_log_id
      ${where}
      ORDER BY rq.updated_at DESC
      LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]);
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM notification_retry_queue rq
       LEFT JOIN notification_logs nl ON nl.id = rq.notification_log_id
       ${where}`, params
    );
    res.json({ items: r.rows, total: cnt.rows[0]?.cnt || 0, limit, offset });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /events — Event log from comm_events ───────────────────────────────
router.get("/events", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  || 50), 200);
  const offset = Number(req.query.offset || 0);
  const type   = req.query.type   as string | undefined;
  const source = req.query.source as string | undefined;
  const status = req.query.status as string | undefined;

  try {
    const where: string[] = ["1=1"];
    const params: any[]   = [];
    let pi = 1;
    if (type)   { where.push(`event_type = $${pi++}`); params.push(type); }
    if (source) { where.push(`source = $${pi++}`);     params.push(source); }
    if (status) { where.push(`status = $${pi++}`);     params.push(status); }

    const r = await pool.query(
      `SELECT id, event_type, source, customer_id, booking_id, customer_name,
              workflow_trigger, status, error_msg, processed_at, created_at,
              payload
       FROM comm_events
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM comm_events WHERE ${where.join(" AND ")}`, params
    );
    res.json({ events: r.rows, total: cnt.rows[0]?.cnt || 0, limit, offset });
  } catch {
    res.json({ events: [], total: 0, limit, offset });
  }
});

// ── GET /dlq — Dead letter queue (exhausted retries) ──────────────────────
router.get("/dlq", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  || 50), 200);
  const offset = Number(req.query.offset || 0);
  try {
    const r = await pool.query(`
      SELECT rq.id, rq.event_type, rq.channel, rq.customer_id, rq.booking_id,
             rq.recipient, rq.message, rq.retry_count, rq.last_error,
             rq.created_at, rq.updated_at,
             nl.customer_name, nl.booking_number, nl.provider_name,
             nl.request_payload, nl.provider_response
      FROM notification_retry_queue rq
      LEFT JOIN notification_logs nl ON nl.id = rq.notification_log_id
      WHERE rq.status = 'failed'
      ORDER BY rq.updated_at DESC
      LIMIT $1 OFFSET $2`, [limit, offset]);
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM notification_retry_queue WHERE status='failed'`
    );
    res.json({ items: r.rows, total: cnt.rows[0]?.cnt || 0, limit, offset });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /dlq/:id/retry — Retry a DLQ item ────────────────────────────────
router.post("/dlq/:id/retry", async (req, res) => {
  const { id } = req.params;
  try {
    const item = await pool.query(`SELECT * FROM notification_retry_queue WHERE id=$1`, [id]);
    if (!item.rows[0]) return void res.status(404).json({ error: "Not found" });
    await pool.query(
      `UPDATE notification_retry_queue SET status='pending', retry_count=0, last_error=NULL, next_retry_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id]
    );
    res.json({ ok: true, message: "Item re-queued for retry" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /dlq/:id/force-send — Force-send bypassing retry limits ──────────
router.post("/dlq/:id/force-send", async (req, res) => {
  const { id } = req.params;
  try {
    const item = await pool.query(`SELECT * FROM notification_retry_queue WHERE id=$1`, [id]);
    if (!item.rows[0]) return void res.status(404).json({ error: "Not found" });
    const row = item.rows[0];
    const result = await publishEvent({
      type: (row.event_type || "ADMIN_ALERT").toUpperCase() as any,
      source: "dlq_force_send",
      ctx: row.context || {},
    });
    await pool.query(
      `UPDATE notification_retry_queue SET status='sent', last_error=NULL, updated_at=NOW() WHERE id=$1`, [id]
    );
    res.json({ ok: true, message: "Force sent via event bus", eventId: result.eventId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /dlq/:id — Dismiss DLQ item ────────────────────────────────────
router.delete("/dlq/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE notification_retry_queue SET status='cancelled', updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /analytics — Communication analytics ───────────────────────────────
router.get("/analytics", async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 90);
  try {
    const [byChannel, byDay, byEvent, byProvider, topBookings] = await Promise.all([
      // By channel
      pool.query(`
        SELECT channel,
               COUNT(*)::int                                          AS total,
               COUNT(*) FILTER (WHERE status='sent')::int            AS sent,
               COUNT(*) FILTER (WHERE status='failed')::int          AS failed,
               ROUND(COUNT(*) FILTER (WHERE status='sent')::numeric / NULLIF(COUNT(*),0) * 100)::int AS success_rate
        FROM notification_logs
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY channel ORDER BY total DESC`, [days]),
      // By day (last 30d)
      pool.query(`
        SELECT DATE(created_at) AS day,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='sent')::int AS sent,
               COUNT(*) FILTER (WHERE status='failed')::int AS failed
        FROM notification_logs
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY DATE(created_at) ORDER BY day`, [days]),
      // By event type
      pool.query(`
        SELECT event_type,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='sent')::int AS sent
        FROM notification_logs
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY event_type ORDER BY total DESC LIMIT 15`, [days]),
      // By provider
      pool.query(`
        SELECT provider_name,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='sent')::int AS sent,
               COUNT(*) FILTER (WHERE status='failed')::int AS failed,
               ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(delivered_at, updated_at) - created_at))*1000))::int AS avg_ms
        FROM notification_logs
        WHERE created_at >= NOW() - ($1 || ' days')::interval AND provider_name IS NOT NULL
        GROUP BY provider_name ORDER BY total DESC`, [days]),
      // Top bookings by notification count
      pool.query(`
        SELECT booking_number, customer_name, COUNT(*)::int AS notif_count
        FROM notification_logs
        WHERE created_at >= NOW() - ($1 || ' days')::interval AND booking_number IS NOT NULL
        GROUP BY booking_number, customer_name ORDER BY notif_count DESC LIMIT 10`, [days]),
    ]);

    res.json({
      period_days: days,
      byChannel:   byChannel.rows,
      byDay:       byDay.rows,
      byEvent:     byEvent.rows,
      byProvider:  byProvider.rows,
      topBookings: topBookings.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /health — Real provider health checks ──────────────────────────────
router.get("/health", async (_req, res) => {
  const results: Record<string, any> = {};
  const t0 = Date.now();

  // DB
  try {
    const t = Date.now();
    await pool.query("SELECT 1");
    results.database = { status: "ok", ms: Date.now() - t };
  } catch (e: any) { results.database = { status: "error", error: e.message }; }

  // BotBee WhatsApp
  try {
    const { getCachedConfig } = await import("../lib/apiSettings.js");
    const cfg = getCachedConfig("botbee");
    if (cfg.apiKey && cfg.apiKey.length > 10) {
      const t = Date.now();
      const r = await fetch("https://app.botbee.io/api/whatsapp/templates", {
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      results.whatsapp_botbee = {
        status: r.ok || r.status === 404 ? "ok" : "warn",
        http_status: r.status, ms: Date.now() - t,
        provider: "BotBee",
      };
    } else {
      results.whatsapp_botbee = { status: "unconfigured", provider: "BotBee" };
    }
  } catch (e: any) { results.whatsapp_botbee = { status: "error", error: e.message.slice(0,80), provider: "BotBee" }; }

  // Fast2SMS
  try {
    const { getCachedConfig } = await import("../lib/apiSettings.js");
    const cfg = getCachedConfig("fast2sms");
    if (cfg.apiKey && cfg.apiKey.length > 10) {
      const t = Date.now();
      const r = await fetch("https://www.fast2sms.com/dev/wallet", {
        headers: { authorization: cfg.apiKey },
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json().catch(() => ({}));
      results.sms_fast2sms = {
        status: d.return !== false ? "ok" : "error",
        http_status: r.status, ms: Date.now() - t,
        provider: "Fast2SMS",
        wallet: d.wallet_amount !== undefined ? `₹${d.wallet_amount}` : undefined,
      };
    } else {
      results.sms_fast2sms = { status: "unconfigured", provider: "Fast2SMS" };
    }
  } catch (e: any) { results.sms_fast2sms = { status: "error", error: e.message.slice(0,80), provider: "Fast2SMS" }; }

  // SMTP
  try {
    const emailSvc = await import("../services/emailService.js");
    const smtpOk   = await emailSvc.testSmtpConnection?.().catch(() => false);
    results.email_smtp = {
      status: smtpOk !== false ? "ok" : "error",
      provider: "SMTP",
    };
  } catch (e: any) { results.email_smtp = { status: "error", error: e.message.slice(0,60), provider: "SMTP" }; }

  // Queue health
  try {
    const qr = await pool.query(
      `SELECT status, COUNT(*)::int AS cnt FROM notification_retry_queue GROUP BY status`
    );
    const qm: Record<string,number> = {};
    for (const r of qr.rows) qm[r.status] = r.cnt;
    const pending = qm.pending || 0;
    results.queue = {
      status: pending > 100 ? "warn" : "ok",
      pending, failed: qm.failed || 0, sent: qm.sent || 0,
    };
  } catch (e: any) { results.queue = { status: "error", error: e.message }; }

  // Event Bus
  try {
    const er = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM comm_events WHERE created_at >= NOW() - INTERVAL '1 hour'`
    ).catch(() => ({ rows: [{ cnt: 0 }] }));
    results.event_bus = { status: "ok", events_last_hour: er.rows[0]?.cnt || 0 };
  } catch (e: any) { results.event_bus = { status: "error", error: e.message }; }

  // Push Notifications (Web Push / VAPID)
  try {
    const vapid = await pool.query(
      `SELECT extra FROM api_settings WHERE provider='webpush' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const extra = vapid.rows[0]?.extra || {};
    const hasVapid = !!(extra.vapidPublicKey || extra.publicKey);
    const subCount = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM customer_push_tokens`
    ).catch(() => ({ rows: [{ cnt: 0 }] }));
    results.push_vapid = {
      status: hasVapid ? "ok" : "unconfigured",
      provider: "Web Push (VAPID)",
      detail: hasVapid ? `${subCount.rows[0]?.cnt || 0} subscribers` : "VAPID keys not yet generated",
    };
  } catch (e: any) { results.push_vapid = { status: "error", error: e.message.slice(0,80) }; }

  // Templates
  try {
    const tr = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE channel='whatsapp')::int AS whatsapp,
         COUNT(*) FILTER (WHERE channel='sms')::int AS sms,
         COUNT(*) FILTER (WHERE channel='email')::int AS email
       FROM notification_templates`
    );
    const t = tr.rows[0] || {};
    results.templates = {
      status: t.total > 0 ? "ok" : "warn",
      detail: `${t.total} templates (WA:${t.whatsapp} SMS:${t.sms} Email:${t.email})`,
    };
  } catch (e: any) { results.templates = { status: "error", error: e.message.slice(0,60) }; }

  // API Keys (Razorpay)
  try {
    const { getCachedConfig } = await import("../lib/apiSettings.js");
    const rzp = getCachedConfig("razorpay");
    const hasRzp = !!(rzp.keyId && rzp.keyId.length > 5);
    results.payments_razorpay = {
      status: hasRzp ? "ok" : "unconfigured",
      provider: "Razorpay",
      detail: hasRzp ? "Key configured" : "No key",
    };
  } catch (e: any) { results.payments_razorpay = { status: "unconfigured", provider: "Razorpay" }; }

  const allOk = Object.values(results).every((v: any) => v.status === "ok" || v.status === "unconfigured");
  res.json({
    overall: allOk ? "ok" : "degraded",
    checks: results,
    checked_at: new Date().toISOString(),
    total_ms: Date.now() - t0,
  });
});

// ── GET /workflows — List all workflow rules ───────────────────────────────
router.get("/workflows", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, trigger_type, name, description, enabled, config, created_at, updated_at
       FROM workflow_rules ORDER BY trigger_type`
    );
    // Also get execution counts per trigger
    const counts = await pool.query(
      `SELECT trigger_type, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status='completed')::int AS completed,
              COUNT(*) FILTER (WHERE status='failed')::int AS failed,
              MAX(created_at) AS last_run
       FROM workflow_logs WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY trigger_type`
    );
    const countMap: Record<string, any> = {};
    for (const c of counts.rows) countMap[c.trigger_type] = c;

    const rules = r.rows.map(row => ({
      ...row,
      channels:      row.config?.channels      || null,
      delay_minutes: row.config?.delay_minutes  || 0,
      stats: countMap[row.trigger_type] || { total: 0, completed: 0, failed: 0, last_run: null },
    }));
    res.json({ rules });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── PUT /workflows/:trigger — Enable/disable/configure workflow ────────────
router.put("/workflows/:trigger", async (req, res) => {
  const { trigger } = req.params;
  const { enabled, channels, delay_minutes } = req.body;
  try {
    // Read current config to merge
    const existing = await pool.query(
      `SELECT config FROM workflow_rules WHERE trigger_type=$1`, [trigger]
    );
    const currentConfig = existing.rows[0]?.config || {};
    const newConfig = {
      ...currentConfig,
      ...(channels       !== undefined ? { channels }       : {}),
      ...(delay_minutes  !== undefined ? { delay_minutes }  : {}),
    };
    await pool.query(
      `UPDATE workflow_rules
         SET enabled=$2, config=$3, updated_at=NOW()
       WHERE trigger_type=$1`,
      [trigger, enabled ?? true, JSON.stringify(newConfig)]
    );
    res.json({ ok: true, trigger, enabled });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /workflow-logs — Recent workflow execution log ─────────────────────
router.get("/workflow-logs", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  || 50), 200);
  const offset = Number(req.query.offset || 0);
  const status = req.query.status as string | undefined;
  try {
    const where = status ? `WHERE status = '${status.replace(/'/g,"")}'` : "";
    const r = await pool.query(
      `SELECT id, trigger_type, booking_id, customer_id, customer_name,
              status, error_message, retry_count, execution_time_ms, created_at, completed_at
       FROM workflow_logs ${where}
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ logs: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /timeline/:bookingId — Customer communication timeline ─────────────
router.get("/timeline/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  try {
    const [notifs, workflows, events] = await Promise.all([
      pool.query(
        `SELECT id, event_type, channel, status, provider_name, customer_name,
                message, sent_at, delivered_at, retry_count, error_code, created_at
         FROM notification_logs WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [bookingId]
      ),
      pool.query(
        `SELECT id, trigger_type, status, execution_time_ms, error_message, created_at
         FROM workflow_logs WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 30`,
        [bookingId]
      ),
      pool.query(
        `SELECT id, event_type, source, status, workflow_trigger, error_msg, created_at
         FROM comm_events WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 30`,
        [bookingId]
      ).catch(() => ({ rows: [] })),
    ]);

    // Merge and sort by created_at
    const timeline = [
      ...notifs.rows.map(r => ({ ...r, _type: "notification" })),
      ...workflows.rows.map(r => ({ ...r, _type: "workflow" })),
      ...events.rows.map(r => ({ ...r, _type: "event" })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ bookingId, timeline });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── POST /test-event — Fire a test event through the bus ──────────────────
router.post("/test-event", async (req, res) => {
  const { type = "BOOKING_CREATED", ctx = {}, source = "admin_test" } = req.body;
  try {
    const result = await publishEvent({ type, source, ctx });
    res.json({ ok: true, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── GET /notification-logs — Full delivery log ─────────────────────────────
router.get("/notification-logs", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  || 50), 200);
  const offset = Number(req.query.offset || 0);
  const channel = req.query.channel as string | undefined;
  const status  = req.query.status  as string | undefined;
  const search  = req.query.search  as string | undefined;

  try {
    const where: string[] = ["1=1"];
    const params: any[]   = [];
    let pi = 1;
    if (channel) { where.push(`channel = $${pi++}`); params.push(channel); }
    if (status)  { where.push(`status = $${pi++}`);  params.push(status); }
    if (search)  { where.push(`(customer_name ILIKE $${pi} OR recipient ILIKE $${pi} OR booking_number ILIKE $${pi})`); params.push(`%${search}%`); pi++; }

    const r = await pool.query(
      `SELECT id, event_type, channel, provider_name, customer_name, booking_number,
              recipient, status, http_status, retry_count, error_code,
              sent_at, delivered_at, created_at
       FROM notification_logs
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM notification_logs WHERE ${where.join(" AND ")}`, params
    );
    res.json({ logs: r.rows, total: cnt.rows[0]?.cnt || 0, limit, offset });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
