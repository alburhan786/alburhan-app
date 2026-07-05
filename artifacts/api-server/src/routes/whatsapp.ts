import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendText, sendTemplate, sendInteractiveButtons, fetchTemplates, type BotBeeResult } from "../lib/botbee.js";
import { pool } from "@workspace/db";

const router = Router();

// ── Existing routes ───────────────────────────────────────────────────────────

// POST /api/whatsapp/test
router.post("/test", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, message, templateName, components, buttons, bodyText } = req.body;
  if (!mobile?.trim()) return res.status(400).json({ ok: false, message: "mobile is required" });

  const to = mobile.trim();
  const testMessage = message?.trim() ||
    `🧪 Test from Al Burhan ERP\n${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}\n\nAl Burhan Tours & Travels`;

  let result: BotBeeResult;
  if (templateName) {
    result = await sendTemplate(to, templateName, components || []);
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
      [id, to, templateName ? `[template] ${templateName}` : testMessage.substring(0, 300),
       result.ok ? "sent" : "failed", JSON.stringify(result),
       result.provider, result.endpoint, result.httpStatus || null,
       result.requestPayload ? JSON.stringify(result.requestPayload) : null, result.errorCode || null]
    );
  } catch (logErr) { console.error("[WhatsApp test] log failed:", logErr); }

  res.json({ ok: result.ok, provider: result.provider, endpoint: result.endpoint, httpStatus: result.httpStatus, requestPayload: result.requestPayload, responsePayload: result.responsePayload, errorCode: result.errorCode, errorMessage: result.errorMessage, logged: true });
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
  if (!result.ok) return res.status(502).json({ ok: false, errorMessage: result.errorMessage, responsePayload: result.responsePayload });
  res.json({ ok: true, templates: result.templates, count: result.templates?.length ?? 0 });
});

// POST /api/whatsapp/templates/send
router.post("/templates/send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, templateName, language, components, eventType, bookingId, customerId } = req.body;
  if (!mobile?.trim()) return res.status(400).json({ ok: false, message: "mobile is required" });
  if (!templateName?.trim()) return res.status(400).json({ ok: false, message: "templateName is required" });

  const result = await sendTemplate(mobile.trim(), templateName, components || [], {
    eventType: eventType || "template_send", bookingId: bookingId || undefined, customerId: customerId || undefined,
  });

  if (!eventType) {
    try {
      const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_response, provider_name, api_endpoint, http_status, request_payload, error_code, customer_id, booking_id, sent_at, retry_count)
         VALUES ($1,'template_send','whatsapp',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),0)`,
        [id, mobile.trim(), `[template] ${templateName}`, result.ok ? "sent" : "failed",
         JSON.stringify(result), result.provider, result.endpoint, result.httpStatus || null,
         result.requestPayload ? JSON.stringify(result.requestPayload) : null,
         result.errorCode || null, customerId || null, bookingId || null]
      );
    } catch (e) { console.error("[templates/send] log failed:", e); }
  }

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
  const { name, display_name, category, language, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name } = req.body;
  if (!name?.trim() || !display_name?.trim() || !body_text?.trim()) {
    return res.status(400).json({ ok: false, message: "name, display_name, and body_text are required" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO wa_templates (name, display_name, category, language, status, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name, enabled, is_builtin)
       VALUES ($1,$2,$3,$4,'local',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,true,false)
       RETURNING *`,
      [name.trim(), display_name.trim(), category || "UTILITY", language || "en",
       header_type || "none", header_text || null, body_text.trim(), footer_text || null,
       JSON.stringify(buttons || []), JSON.stringify(variables || []),
       event_type || null, meta_template_name || null]
    );
    res.json({ ok: true, template: r.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ ok: false, message: "Template name already exists" });
    res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /api/whatsapp/db-templates/:id — update
router.put("/db-templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { display_name, category, language, header_type, header_text, body_text, footer_text, buttons, variables, event_type, meta_template_name, status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE wa_templates SET
         display_name=COALESCE($1,display_name), category=COALESCE($2,category),
         language=COALESCE($3,language), header_type=COALESCE($4,header_type),
         header_text=$5, body_text=COALESCE($6,body_text), footer_text=$7,
         buttons=COALESCE($8::jsonb,buttons), variables=COALESCE($9::jsonb,variables),
         event_type=$10, meta_template_name=$11, status=COALESCE($12,status),
         updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [display_name || null, category || null, language || null, header_type || null,
       header_text || null, body_text || null, footer_text || null,
       buttons ? JSON.stringify(buttons) : null, variables ? JSON.stringify(variables) : null,
       event_type || null, meta_template_name || null, status || null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, message: "Template not found" });
    res.json({ ok: true, template: r.rows[0] });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// DELETE /api/whatsapp/db-templates/:id
router.delete("/db-templates/:id", requireAdmin as any, async (_req, res) => {
  try {
    const r = await pool.query(`DELETE FROM wa_templates WHERE id=$1 AND is_builtin=false RETURNING id`, [_req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, message: "Template not found or is a built-in template" });
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
    if (!r.rows[0]) return res.status(404).json({ ok: false, message: "Template not found" });
    res.json({ ok: true, enabled: r.rows[0].enabled });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/db-templates/send-text — send body_text via sendText (no Meta template required)
router.post("/db-templates/send-text", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, template_id, variables } = req.body;
  if (!mobile?.trim() || !template_id) return res.status(400).json({ ok: false, message: "mobile and template_id are required" });
  try {
    const r = await pool.query(`SELECT * FROM wa_templates WHERE id=$1`, [template_id]);
    const tpl = r.rows[0];
    if (!tpl) return res.status(404).json({ ok: false, message: "Template not found" });

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
    if (!liveResult.ok) return res.status(502).json({ ok: false, message: liveResult.errorMessage });

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

// GET /api/whatsapp/delivery-logs?page=1&limit=50&status=&event=&search=
router.get("/delivery-logs", requireAdmin as any, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || "50"))));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || "");
  const event = String(req.query.event || "");
  const search = String(req.query.search || "");

  const conditions: string[] = ["channel='whatsapp'"];
  const params: any[] = [];
  let pi = 1;

  if (status) { conditions.push(`status=$${pi++}`); params.push(status); }
  if (event) { conditions.push(`event_type=$${pi++}`); params.push(event); }
  if (search) { conditions.push(`(recipient ILIKE $${pi} OR message ILIKE $${pi})`); params.push(`%${search}%`); pi++; }

  const where = conditions.join(" AND ");

  try {
    const [rows, countRes] = await Promise.all([
      pool.query(
        `SELECT id, event_type, recipient, message, status, sent_at, delivered_at,
                retry_count, error_code, provider_name, http_status, request_payload, provider_response
         FROM notification_logs WHERE ${where}
         ORDER BY sent_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE ${where}`, params),
    ]);

    res.json({
      ok: true,
      logs: rows.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
    });
  } catch (err: any) { res.status(500).json({ ok: false, message: err.message }); }
});

// POST /api/whatsapp/retry/:logId — retry a failed delivery
router.post("/retry/:logId", requireAdmin as any, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notification_logs WHERE id=$1 AND channel='whatsapp'`,
      [req.params.logId]
    );
    const log = r.rows[0];
    if (!log) return res.status(404).json({ ok: false, message: "Log not found" });

    // Extract original send details from request_payload or provider_response
    const reqPayload = log.request_payload as any;
    const to = log.recipient;
    const templateName = reqPayload?.template?.name;
    const message = log.message;

    let result: BotBeeResult;
    if (templateName) {
      const comps = reqPayload?.template?.components || [];
      result = await sendTemplate(to, templateName, comps, { eventType: log.event_type });
    } else if (message) {
      const cleanMsg = message.replace(/^\[template\] /, "");
      result = await sendText(to, cleanMsg, { eventType: log.event_type });
    } else {
      return res.status(400).json({ ok: false, message: "Cannot determine retry payload" });
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
