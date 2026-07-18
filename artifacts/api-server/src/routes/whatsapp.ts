import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendText, sendTemplate, sendInteractiveButtons, fetchTemplates, type BotBeeResult } from "../lib/botbee.js";
import { pool } from "@workspace/db";
import { triggerWorkflow } from "../lib/workflowEngine.js";

// Ensure wa_templates has the template_id column
;(async () => {
  try {
    await pool.query(`ALTER TABLE wa_templates ADD COLUMN IF NOT EXISTS template_id TEXT`);
    console.log("[WhatsApp] wa_templates.template_id column ensured");
  } catch (e) { console.error("[WhatsApp] wa_templates migration error:", e); }
})();

const router = Router();

// ── Existing routes ───────────────────────────────────────────────────────────

// POST /api/whatsapp/test
router.post("/test", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, message, templateId, buttons, bodyText } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required" });

  const to = mobile.trim();
  const testMessage = message?.trim() ||
    `🧪 Test from Al Burhan ERP\n${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}\n\nAl Burhan Tours & Travels`;

  let result: BotBeeResult;
  if (templateId?.trim()) {
    result = await sendTemplate(to, templateId.trim());
  } else if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    result = await sendInteractiveButtons(to, bodyText || testMessage, buttons);
  } else {
    result = await sendText(to, testMessage);
  }

  try {
    const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response,
        provider_name, api_endpoint, http_status, request_payload, error_code, sent_at, retry_count)
       VALUES ($1,'test_send','whatsapp',$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),0)`,
      [id, to, templateId ? `[template_id] ${templateId}` : testMessage.substring(0, 300),
       result.ok ? "sent" : "failed", JSON.stringify(result),
       result.provider, result.endpoint, result.httpStatus || null,
       result.requestPayload ? JSON.stringify(result.requestPayload) : null, result.errorCode || null]
    );
  } catch (logErr) { console.error("[WhatsApp test] log failed:", logErr); }

  res.json({ ok: result.ok, provider: result.provider, endpoint: result.endpoint, httpStatus: result.httpStatus, requestPayload: result.requestPayload, responsePayload: result.responsePayload, errorCode: result.errorCode, errorMessage: result.errorMessage, logged: true });
});

// POST /api/whatsapp/test-abt-template
// Send an ABT production template to a mobile number using real booking data.
// Body: { mobile, eventType, bookingId? }
// eventType: "new_booking" | "payment_received" | "payment_due" | "booking_approved" |
//            "departure_reminder" | "visa_ready" | "ticket_issued"
router.post("/test-abt-template", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, eventType, bookingId } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required" });
  if (!eventType?.trim()) return void res.status(400).json({ ok: false, message: "eventType is required" });

  try {
    // Build a NotificationContext from the booking if provided, otherwise use dummy data
    let ctx: Record<string, unknown> = {
      customerName: "Test Customer",
      customerMobile: mobile.trim(),
      bookingNumber: bookingId || "TEST-001",
      packageName: "Hajj Economy 2026",
      amount: 90000,
      finalAmount: 90000,
      flightNumber: "AI-141",
      departureDate: "2026-05-10",
      departureAirport: "BOM - Mumbai",
      hotelName: "Dar Al Eiman Royal",
      reportingTime: "4 hours before departure",
      invoiceUrl: `https://alburhantravels.com/invoice/${bookingId || "TEST-001"}`,
    };

    if (bookingId) {
      const bRow = await pool.query(
        `SELECT b.*, u.name AS customer_name, u.mobile AS customer_mobile,
                p.name AS package_name, p.price AS package_price
         FROM bookings b
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN packages p ON p.id = b.package_id
         WHERE b.id=$1 LIMIT 1`,
        [bookingId]
      );
      if (bRow.rows.length > 0) {
        const b = bRow.rows[0];
        ctx = {
          ...ctx,
          customerName: b.customer_name || ctx.customerName,
          customerMobile: mobile.trim(), // override with test mobile for safety
          bookingNumber: b.booking_number || bookingId,
          packageName: b.package_name || ctx.packageName,
          amount: b.total_amount || b.package_price || ctx.amount,
          finalAmount: b.final_amount || b.total_amount || ctx.finalAmount,
          flightNumber: b.flight_number || ctx.flightNumber,
          departureDate: b.departure_date || ctx.departureDate,
          invoiceUrl: `https://alburhantravels.com/invoice/${b.booking_number || bookingId}`,
        };
      }
    }

    const { sendBotBeeEventTemplate } = await import("../lib/notificationEngine.js") as any;
    const result = await sendBotBeeEventTemplate(eventType, ctx, bookingId, ctx.customerId as string | undefined);

    const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response,
        provider_name, api_endpoint, http_status, request_payload, error_code, sent_at, retry_count)
       VALUES ($1,$2,'whatsapp',$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),0)`,
      [id, `abt_test_${eventType}`, mobile.trim(),
       `[ABT template test] event=${eventType} booking=${bookingId || "DUMMY"}`,
       result.ok ? "sent" : "failed", JSON.stringify(result),
       result.provider, result.endpoint, result.httpStatus || null,
       result.requestPayload ? JSON.stringify(result.requestPayload) : null, result.errorCode || null]
    ).catch((e: Error) => console.error("[ABT test] log failed:", e.message));

    res.json({
      ok: result.ok,
      eventType,
      bookingId: bookingId || null,
      sentTo: mobile.trim(),
      templateVariables: result.requestPayload,
      provider: result.provider,
      httpStatus: result.httpStatus,
      responsePayload: result.responsePayload,
      errorMessage: result.errorMessage,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/whatsapp/status
router.get("/status", requireAdmin as any, async (_req, res) => {
  const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
  const bbCfg = getCachedConfig("botbee");
  const apiToken = bbCfg.apiKey || process.env.BOTBEE_API_KEY;
  const phoneNumberId = bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID;
  const businessId = bbCfg.extra?.business_id || process.env.BOTBEE_BUSINESS_ID;
  res.json({
    configured: !!(apiToken && phoneNumberId), enabled: bbCfg.enabled !== false,
    apiKeyPresent: !!apiToken, phoneNumberIdPresent: !!phoneNumberId, businessIdPresent: !!businessId,
    apiKeyMasked: apiToken ? `${apiToken.slice(0, 6)}...${apiToken.slice(-4)}` : null,
    phoneNumberId: phoneNumberId || null,
    baseUrl: (bbCfg.apiUrl || "https://app.botbee.io/api/v1").replace(/\/whatsapp\/?$/, ""),
  });
});

// GET /api/whatsapp/templates — fetch live templates from BotBee/Meta
router.get("/templates", requireAdmin as any, async (_req, res) => {
  const result = await fetchTemplates();
  if (!result.ok) return void res.status(502).json({ ok: false, errorMessage: result.errorMessage, responsePayload: result.responsePayload });
  res.json({ ok: true, templates: result.templates, count: result.templates?.length ?? 0 });
});

// POST /api/whatsapp/templates/send
router.post("/templates/send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, templateId, eventType, bookingId, customerId } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required" });
  if (!templateId?.trim()) return void res.status(400).json({ ok: false, message: "templateId is required" });

  const result = await sendTemplate(mobile.trim(), templateId.trim(), {
    eventType: eventType || "template_send", bookingId: bookingId || undefined, customerId: customerId || undefined,
  });

  res.json({ ok: result.ok, provider: result.provider, endpoint: result.endpoint, httpStatus: result.httpStatus, requestPayload: result.requestPayload, responsePayload: result.responsePayload, errorCode: result.errorCode, errorMessage: result.errorMessage, logged: true });
});

// ── DB Template CRUD ──────────────────────────────────────────────────────────

// GET /api/whatsapp/db-templates
router.get("/db-templates", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM wa_templates ORDER BY is_builtin DESC, display_name ASC`);
    res.json({ ok: true, templates: r.rows });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/db-templates — create
router.post("/db-templates", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { name, display_name, category, language, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name, template_id } = req.body;
  if (!name?.trim() || !display_name?.trim() || !body_text?.trim()) {
    return void res.status(400).json({ ok: false, message: "name, display_name, and body_text are required" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO wa_templates (name, display_name, category, language, status, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name, template_id, enabled, is_builtin)
       VALUES ($1,$2,$3,$4,'local',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,true,false)
       RETURNING *`,
      [name.trim(), display_name.trim(), category || "UTILITY", language || "en",
       header_type || "none", header_text || null, body_text.trim(), footer_text || null,
       JSON.stringify(buttons || []), JSON.stringify(variables || []),
       event_type || null, meta_template_name || null, template_id?.trim() || null]
    );
    res.json({ ok: true, template: r.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return void res.status(409).json({ ok: false, message: "Template name already exists" });
    res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /api/whatsapp/db-templates/:id — update
router.put("/db-templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { display_name, category, language, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name, template_id, status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE wa_templates SET
         display_name=COALESCE($1,display_name), category=COALESCE($2,category),
         language=COALESCE($3,language), header_type=COALESCE($4,header_type),
         header_text=$5, body_text=COALESCE($6,body_text), footer_text=$7,
         buttons=COALESCE($8::jsonb,buttons), variables=COALESCE($9::jsonb,variables),
         event_type=$10, meta_template_name=$11, template_id=$12, status=COALESCE($13,status),
         updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [display_name || null, category || null, language || null, header_type || null,
       header_text || null, body_text || null, footer_text || null,
       buttons ? JSON.stringify(buttons) : null, variables ? JSON.stringify(variables) : null,
       event_type || null, meta_template_name || null, template_id?.trim() || null, status || null, req.params.id]
    );
    if (!r.rows[0]) return void res.status(404).json({ ok: false, message: "Template not found" });
    res.json({ ok: true, template: r.rows[0] });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// DELETE /api/whatsapp/db-templates/:id
router.delete("/db-templates/:id", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`DELETE FROM wa_templates WHERE id=$1 AND is_builtin=false RETURNING id`, [_req.params.id]);
    if (!r.rows[0]) return void res.status(404).json({ ok: false, message: "Template not found or is a built-in template" });
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/db-templates/:id/toggle — enable/disable
router.post("/db-templates/:id/toggle", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE wa_templates SET enabled=NOT enabled, updated_at=NOW() WHERE id=$1 RETURNING id, enabled`,
      [req.params.id]
    );
    if (!r.rows[0]) return void res.status(404).json({ ok: false, message: "Template not found" });
    res.json({ ok: true, enabled: r.rows[0].enabled });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/db-templates/:id/send-template — send via BotBee using stored template_id
router.post("/db-templates/:id/send-template", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, eventType, bookingId, customerId } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required" });
  try {
    const r = await pool.query(`SELECT * FROM wa_templates WHERE id=$1`, [req.params.id]);
    const tpl = r.rows[0];
    if (!tpl) return void res.status(404).json({ ok: false, message: "Template not found" });
    if (!tpl.template_id?.trim()) return void res.status(400).json({ ok: false, message: "This template has no BotBee Template ID configured. Edit the template to add one." });
    const result = await sendTemplate(mobile.trim(), tpl.template_id, {
      eventType: eventType || tpl.event_type || "template_send",
      bookingId: bookingId || undefined, customerId: customerId || undefined,
    });
    res.json({ ok: result.ok, provider: result.provider, endpoint: result.endpoint, httpStatus: result.httpStatus, requestPayload: result.requestPayload, responsePayload: result.responsePayload, errorMessage: result.errorMessage, logged: true });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/db-templates/send-text — send body_text via sendText (no Meta template required)
router.post("/db-templates/send-text", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, template_id, variables } = req.body;
  if (!mobile?.trim() || !template_id) return void res.status(400).json({ ok: false, message: "mobile and template_id are required" });
  try {
    const r = await pool.query(`SELECT * FROM wa_templates WHERE id=$1`, [template_id]);
    const tpl = r.rows[0];
    if (!tpl) return void res.status(404).json({ ok: false, message: "Template not found" });

    // Replace named variables in body_text
    let body = tpl.body_text as string;
    const vars = variables as Record<string, string> || {};
    for (const [k, v] of Object.entries(vars)) {
      body = body.replaceAll(`{{${k}}}`, v);
    }

    const result = await sendText(mobile.trim(), body, { eventType: tpl.event_type || "template_send" });
    res.json({ ok: result.ok, provider: result.provider, endpoint: result.endpoint, httpStatus: result.httpStatus, requestPayload: result.requestPayload, responsePayload: result.responsePayload, errorMessage: result.errorMessage, logged: true });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// ── Sync with Meta/BotBee ────────────────────────────────────────────────────

// POST /api/whatsapp/sync — pull live templates from BotBee and update status in local DB
router.post("/sync", requireAdmin as any, async (_req, res) => {
  try {
    const liveResult = await fetchTemplates();
    if (!liveResult.ok) return void res.status(502).json({ ok: false, message: liveResult.errorMessage });

    const liveTemplates = liveResult.templates || [];
    let synced = 0;

    for (const lt of liveTemplates) {
      // Update any local template whose meta_template_name matches the live template name
      const r = await pool.query(
        `UPDATE wa_templates SET status=$1, updated_at=NOW() WHERE meta_template_name=$2 OR name=$2 RETURNING id`,
        [lt.status?.toLowerCase() || "unknown", lt.name]
      );
      if (r.rowCount && r.rowCount > 0) synced++;
    }

    res.json({ ok: true, liveCount: liveTemplates.length, synced, templates: liveTemplates });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

// GET /api/whatsapp/analytics
router.get("/analytics", requireAdmin as any, async (_req, res) => {
  try {
    const [totals, byEvent, byDay, recentFailed] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='sent') AS sent,
          COUNT(*) FILTER (WHERE status='failed') AS failed,
          COUNT(*) FILTER (WHERE status='pending') AS pending,
          COUNT(*) AS total
        FROM notification_logs WHERE channel='whatsapp'
      `),
      pool.query(`
        SELECT event_type,
          COUNT(*) FILTER (WHERE status='sent') AS sent,
          COUNT(*) FILTER (WHERE status='failed') AS failed,
          COUNT(*) AS total
        FROM notification_logs WHERE channel='whatsapp'
        GROUP BY event_type ORDER BY total DESC LIMIT 10
      `),
      pool.query(`
        SELECT DATE(sent_at) AS day,
          COUNT(*) FILTER (WHERE status='sent') AS sent,
          COUNT(*) FILTER (WHERE status='failed') AS failed,
          COUNT(*) AS total
        FROM notification_logs WHERE channel='whatsapp' AND sent_at >= NOW()-INTERVAL '14 days'
        GROUP BY day ORDER BY day ASC
      `),
      pool.query(`
        SELECT id, event_type, recipient, message, status, sent_at, error_code, provider_response
        FROM notification_logs WHERE channel='whatsapp' AND status='failed'
        ORDER BY sent_at DESC LIMIT 10
      `),
    ]);

    res.json({
      ok: true,
      totals: totals.rows[0],
      byEvent: byEvent.rows,
      byDay: byDay.rows,
      recentFailed: recentFailed.rows,
    });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// ── Delivery Logs ─────────────────────────────────────────────────────────────

// GET /api/whatsapp/delivery-logs?page=1&limit=50&status=&event=&search=&channel=
// channel param: comma-separated e.g. "whatsapp,email,sms" — default "whatsapp"
router.get("/delivery-logs", requireAdmin as any, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || "50"))));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || "");
  const event = String(req.query.event || "");
  const search = String(req.query.search || "");
  const channelParam = String(req.query.channel || "whatsapp");
  const channels = channelParam.split(",").map(c => c.trim()).filter(Boolean);

  const conditions: string[] = [];
  const params: any[] = [];
  let pi = 1;

  if (channels.length === 1) {
    conditions.push(`channel=$${pi++}`); params.push(channels[0]);
  } else if (channels.length > 1) {
    conditions.push(`channel = ANY($${pi++})`); params.push(channels);
  } else {
    conditions.push(`channel='whatsapp'`);
  }

  if (status) { conditions.push(`status=$${pi++}`); params.push(status); }
  if (event) { conditions.push(`event_type=$${pi++}`); params.push(event); }
  if (search) {
    conditions.push(`(recipient ILIKE $${pi} OR message ILIKE $${pi} OR booking_id ILIKE $${pi} OR booking_number ILIKE $${pi} OR customer_name ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }

  const where = conditions.join(" AND ");

  try {
    const [rows, countRes] = await Promise.all([
      pool.query(
        `SELECT id, event_type, channel, recipient, message, status, sent_at, delivered_at,
                retry_count, error_code, provider_name, http_status, request_payload, provider_response,
                booking_id, booking_number, customer_name
         FROM notification_logs WHERE ${where}
         ORDER BY sent_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE ${where}`, params),
    ]);

    const total = parseInt(countRes.rows[0].count);
    res.json({
      ok: true,
      logs: rows.rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/connection-test — live ping to BotBee API
router.post("/connection-test", requireAdmin as any, async (_req, res) => {
  const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
  const axios = (await import("axios")).default;
  const bbCfg = getCachedConfig("botbee");
  const apiToken = bbCfg.apiKey || process.env.BOTBEE_API_KEY || "";
  const phone_number_id = bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "";
  const baseUrl = (bbCfg.apiUrl || "https://app.botbee.io/api/v1").replace(/\/whatsapp\/?$/, "");

  if (!apiToken || !phone_number_id) {
    return void res.json({ ok: false, connected: false, error: "API Key or Phone Number ID not configured" });
  }

  try {
    // Official BotBee endpoint: POST /api/v1/whatsapp/template/list
    const endpoint = `${baseUrl}/whatsapp/template/list`;
    const start = Date.now();
    const r = await axios.post(endpoint, { apiToken, phone_number_id }, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
    const latencyMs = Date.now() - start;
    const ok = r.status >= 200 && r.status < 300;
    res.json({ ok, connected: ok, httpStatus: r.status, latencyMs, baseUrl, responseSnippet: JSON.stringify(r.data).slice(0, 200) });
  } catch (err: any) {
    const resp = err?.response;
    res.json({
      ok: false, connected: false,
      httpStatus: resp?.status,
      error: resp?.data?.message || err.message,
      responseSnippet: resp?.data ? JSON.stringify(resp.data).slice(0, 200) : null,
    });
  }
});

// GET /api/whatsapp/retry-queue — list failed messages ready for retry
router.get("/retry-queue", requireAdmin as any, async (req, res) => {
  const limit = Math.min(100, parseInt(String(req.query.limit || "50")));
  try {
    const r = await pool.query(
      `SELECT id, event_type, recipient, message, status, sent_at, retry_count, error_code, provider_name, http_status, provider_response
       FROM notification_logs
       WHERE channel='whatsapp' AND status='failed' AND retry_count < 5
       ORDER BY sent_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, queue: r.rows, count: r.rowCount });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/retry-all — retry all failed messages (max 5 retries each)
router.post("/retry-all", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notification_logs WHERE channel='whatsapp' AND status='failed' AND retry_count < 5 ORDER BY sent_at DESC LIMIT 50`
    );
    const jobs = r.rows;
    let retried = 0; let succeeded = 0;
    for (const log of jobs) {
      try {
        const reqPayload = log.request_payload as any;
        const templateId = reqPayload?.template_id || reqPayload?.template?.id;
        const message = log.message;
        let result: BotBeeResult;
        if (templateId) {
          result = await sendTemplate(log.recipient, String(templateId), { eventType: log.event_type });
        } else if (message) {
          result = await sendText(log.recipient, message.replace(/^\[template(?:_id)?[^\]]*\] /, ""), { eventType: log.event_type });
        } else { continue; }
        await pool.query(
          `UPDATE notification_logs SET retry_count=retry_count+1, status=$1, provider_response=$2, updated_at=NOW() WHERE id=$3`,
          [result.ok ? "sent" : "failed", JSON.stringify(result), log.id]
        ).catch(() => {});
        retried++;
        if (result.ok) succeeded++;
        await new Promise(r => setTimeout(r, 500)); // rate limit
      } catch { /* continue */ }
    }
    res.json({ ok: true, retried, succeeded, failed: retried - succeeded });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/automation-test — run a full multi-channel notification test
router.post("/automation-test", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, email } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required for test" });

  const steps: { step: string; status: "pass" | "fail" | "skip"; detail?: string }[] = [];

  // 1. Connection test
  try {
    const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
    const axios = (await import("axios")).default;
    const bbCfg = getCachedConfig("botbee");
    const apiToken = bbCfg.apiKey || process.env.BOTBEE_API_KEY || "";
    const phone_number_id = bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID || "";
    const baseUrl = (bbCfg.apiUrl || "https://app.botbee.io/api/v1").replace(/\/whatsapp\/?$/, "");
    // Official BotBee endpoint: POST /api/v1/whatsapp/template/list
    const r = await axios.post(`${baseUrl}/whatsapp/template/list`, { apiToken, phone_number_id }, { headers: { "Content-Type": "application/json" }, timeout: 8000 });
    steps.push({ step: "BotBee Connection", status: r.status < 300 ? "pass" : "fail", detail: `HTTP ${r.status}` });
  } catch (err: any) { steps.push({ step: "BotBee Connection", status: "fail", detail: err.message }); }

  // 2. Template fetch
  try {
    const result = await fetchTemplates();
    const approved = (result.templates || []).filter(t => t.status === "APPROVED").length;
    steps.push({ step: "Template Fetch", status: result.ok ? "pass" : "fail", detail: result.ok ? `${approved} approved templates` : result.errorMessage });
  } catch (err: any) { steps.push({ step: "Template Fetch", status: "fail", detail: err.message }); }

  // 3. WhatsApp send test
  const waMsg = `🧪 Al Burhan ERP Automation Test\n\nThis is an automated test from Al Burhan Tours & Travels ERP system.\n\nTime: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\nIf you received this, WhatsApp automation is working correctly. ✅`;
  try {
    const result = await sendText(mobile.trim(), waMsg, { eventType: "automation_test" });
    steps.push({ step: "WhatsApp Send", status: result.ok ? "pass" : "fail", detail: result.ok ? `Sent to ${mobile}` : result.errorMessage });
  } catch (err: any) { steps.push({ step: "WhatsApp Send", status: "fail", detail: err.message }); }

  // 4. SMS test
  try {
    const { sendDLTSMS } = await import("../lib/notifications.js");
    const result = await sendDLTSMS(mobile.trim(), mobile.trim(), "test", "notification");
    steps.push({ step: "SMS Send", status: (result as any).ok ? "pass" : "fail", detail: (result as any).ok ? `SMS sent to ${mobile}` : (result as any).errorMessage });
  } catch (err: any) { steps.push({ step: "SMS Send", status: "fail", detail: err.message }); }

  // 5. Email test
  if (email?.trim()) {
    try {
      const { sendEmail } = await import("../lib/notifications.js");
      const result = await sendEmail(email.trim(), "Al Burhan ERP — Automation Test", `<p>This is an automated test email from Al Burhan Tours & Travels ERP.</p><p>Time: ${new Date().toISOString()}</p><p>If you received this, email automation is working correctly. ✅</p>`);
      steps.push({ step: "Email Send", status: result.ok ? "pass" : "fail", detail: result.ok ? `Email sent to ${email}` : result.errorMessage });
    } catch (err: any) { steps.push({ step: "Email Send", status: "fail", detail: err.message }); }
  } else {
    steps.push({ step: "Email Send", status: "skip", detail: "No email provided" });
  }

  // 6. DB log test
  try {
    const id = `test_${Date.now()}`;
    await pool.query(
      `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_name, sent_at, retry_count) VALUES ($1,'automation_test','whatsapp',$2,'Automation test','sent','BotBee',NOW(),0)`,
      [id, mobile.trim()]
    );
    steps.push({ step: "DB Logging", status: "pass", detail: "Log entry created" });
  } catch (err: any) { steps.push({ step: "DB Logging", status: "fail", detail: err.message }); }

  const passed = steps.filter(s => s.status === "pass").length;
  const failed = steps.filter(s => s.status === "fail").length;
  res.json({ ok: failed === 0, steps, summary: { passed, failed, skipped: steps.filter(s => s.status === "skip").length } });
});

// GET /api/whatsapp/template-status — all configured templates + DB delivery stats
router.get("/template-status", requireAdmin as any, async (_req, res) => {
  try {
    const { TEMPLATE_CONFIGS } = await import("../lib/templateConfig.js");

    // Query delivery stats per template (event_type → whatsapp channel)
    const statsQ = await pool.query(`
      SELECT event_type, status, COUNT(*) AS count,
             MAX(sent_at) AS last_used
      FROM notification_logs
      WHERE channel = 'whatsapp'
        AND event_type = ANY($1)
      GROUP BY event_type, status`,
      [TEMPLATE_CONFIGS.flatMap(t => t.eventTypes)]
    );

    type StatRow = { event_type: string; status: string; count: string; last_used: string | null };
    const statsByEvent: Record<string, { sent: number; failed: number; permanently_failed: number; last_used: string | null }> = {};
    for (const row of statsQ.rows as StatRow[]) {
      const key = row.event_type;
      if (!statsByEvent[key]) statsByEvent[key] = { sent: 0, failed: 0, permanently_failed: 0, last_used: null };
      const n = parseInt(row.count, 10);
      if (row.status === "sent") statsByEvent[key].sent += n;
      else if (row.status === "permanently_failed") statsByEvent[key].permanently_failed += n;
      else statsByEvent[key].failed += n;
      if (row.last_used && (!statsByEvent[key].last_used || row.last_used > statsByEvent[key].last_used!)) {
        statsByEvent[key].last_used = row.last_used;
      }
    }

    const templates = TEMPLATE_CONFIGS.map(t => {
      const agg = { sent: 0, failed: 0, permanently_failed: 0, last_used: null as string | null };
      for (const evt of t.eventTypes) {
        const s = statsByEvent[evt];
        if (s) {
          agg.sent += s.sent;
          agg.failed += s.failed;
          agg.permanently_failed += s.permanently_failed;
          if (s.last_used && (!agg.last_used || s.last_used > agg.last_used)) agg.last_used = s.last_used;
        }
      }
      const total = agg.sent + agg.failed + agg.permanently_failed;
      const successRate = total > 0 ? Math.round((agg.sent / total) * 100) : null;
      const health: "healthy" | "warning" | "failing" | "untested" =
        total === 0 ? "untested" :
        successRate === null ? "untested" :
        successRate >= 80 ? "healthy" :
        successRate >= 40 ? "warning" : "failing";
      return {
        key:          t.key,
        displayName:  t.displayName,
        id:           t.id,
        name:         t.name,
        envVar:       t.envVar,
        language:     t.language,
        eventTypes:   t.eventTypes,
        description:  t.description,
        stats:        { sent: agg.sent, failed: agg.failed + agg.permanently_failed, total, successRate, last_used: agg.last_used },
        health,
      };
    });

    res.json({ ok: true, templates, generated_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/whatsapp/template-test/:templateKey — fire a live test for a specific template
router.post("/template-test/:templateKey", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { templateKey } = req.params;
  const { mobile } = req.body;
  if (!mobile?.trim()) return void res.status(400).json({ ok: false, message: "mobile is required" });

  try {
    const { TEMPLATE_CONFIGS } = await import("../lib/templateConfig.js");
    const tpl = TEMPLATE_CONFIGS.find(t => t.key === templateKey);
    if (!tpl) return void res.status(404).json({ ok: false, message: `Unknown template key: ${templateKey}` });

    const { sendTemplate } = await import("../lib/botbee.js");
    const sampleParams = [
      { type: "body", parameters: Array.from({ length: tpl.paramCount }, (_, i) => ({ type: "text", text: `Sample${i + 1}` })) }
    ];

    const result = await sendTemplate(mobile.trim(), tpl.name, sampleParams, { eventType: `test_${tpl.key}` });

    // Log the test
    try {
      const id = `nl_tpl_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_response, provider_name, api_endpoint, http_status, request_payload, error_code, sent_at, retry_count)
         VALUES ($1,$2,'whatsapp',$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),0)`,
        [id, `test_${tpl.key}`, mobile.trim(), `[template-test] ${tpl.name}`,
         result.ok ? "sent" : "failed", JSON.stringify(result),
         result.provider, result.endpoint, result.httpStatus || null,
         result.requestPayload ? JSON.stringify(result.requestPayload) : null, result.errorCode || null]
      );
    } catch {}

    res.json({
      ok:             result.ok,
      templateKey,
      templateName:   tpl.name,
      templateId:     tpl.id,
      mobile:         mobile.trim(),
      httpStatus:     result.httpStatus,
      errorMessage:   result.errorMessage,
      responsePayload: result.responsePayload,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/whatsapp/resend-booking-template
// Admin: manually send/resend any approved template for a booking
router.post("/resend-booking-template", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId, trigger } = req.body;
  if (!bookingId || !trigger) return void res.status(400).json({ ok: false, message: "bookingId and trigger required" });

  try {
    const bRes = await pool.query(
      `SELECT b.*, u.name AS customer_name_user, u.mobile AS mobile_user
       FROM bookings b LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId]
    );
    const b = bRes.rows[0];
    if (!b) return void res.status(404).json({ ok: false, message: "Booking not found" });

    const mobile = b.mobile_india || b.customer_mobile || b.mobile_user;
    const name   = b.customer_name || b.customer_name_user;
    const ctx: Record<string, any> = {
      customerName:   name,
      customerMobile: mobile,
      bookingNumber:  b.booking_number,
      packageName:    b.package_name,
      finalAmount:    Number(b.final_amount) || 0,
      trigger,
    };

    await triggerWorkflow(trigger as any, ctx, b.id, b.customer_id);
    res.json({ ok: true, message: `${trigger} sent to ${mobile}` });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/whatsapp/retry/:logId — retry a failed delivery
router.post("/retry/:logId", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notification_logs WHERE id=$1 AND channel='whatsapp'`,
      [req.params.logId]
    );
    const log = r.rows[0];
    if (!log) return void res.status(404).json({ ok: false, message: "Log not found" });

    // Extract original send details from request_payload or provider_response
    const reqPayload = log.request_payload as any;
    const to = log.recipient;
    const templateId = reqPayload?.template_id || reqPayload?.template?.id;
    const message = log.message;

    let result: BotBeeResult;
    if (templateId) {
      result = await sendTemplate(to, String(templateId), { eventType: log.event_type });
    } else if (message) {
      const cleanMsg = message.replace(/^\[template(?:_id)?[^\]]*\] /, "");
      result = await sendText(to, cleanMsg, { eventType: log.event_type });
    } else {
      return void res.status(400).json({ ok: false, message: "Cannot determine retry payload" });
    }

    // Update original log retry count + status
    await pool.query(
      `UPDATE notification_logs SET retry_count=retry_count+1, status=$1, provider_response=$2, updated_at=NOW() WHERE id=$3`,
      [result.ok ? "sent" : "failed", JSON.stringify(result), req.params.logId]
    ).catch(() => {});

    res.json({ ok: result.ok, provider: result.provider, httpStatus: result.httpStatus, errorMessage: result.errorMessage, responsePayload: result.responsePayload });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

export default router;
