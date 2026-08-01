// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { retryNotification, EVENT_TYPES, CHANNELS, sendBulkNotification, type Channel } from "../lib/notificationEngine.js";
import { randomUUID } from "crypto";

const router = Router();

// ── Startup: migrate new columns + seed DLT templates ────────────────────────
const SMS_SEED = [
  { id: "tpl_seed_new_booking",     name: "Booking Created",       event_type: "new_booking",       body: "Assalamu Alaikum {#var#}, Your Hajj booking {#var#} for {#var#} has been received. We will review and confirm shortly. Al Burhan Tours & Travels +91 9893225590",                        dlt_template_id: "219801", variable_count: 3, variable_mapping: '["customer_name","booking_number","package_name"]' },
  { id: "tpl_seed_booking_approved",name: "Booking Approved",      event_type: "booking_approved",  body: "Assalamu Alaikum {#var#}, Your booking {#var#} for {#var#} is APPROVED. Total: Rs {#var#}. Jazak Allah Khair. Al Burhan Tours & Travels +91 9893225590",                              dlt_template_id: "219802", variable_count: 4, variable_mapping: '["customer_name","booking_number","package_name","total_amount"]' },
  { id: "tpl_seed_payment_received",name: "Payment Received",      event_type: "payment_received",  body: "Assalamu Alaikum {#var#} Payment Received. Booking ID: {#var#} Invoice No: {#var#} Amount: Rs {#var#} Jazak Allah Khair. Al Burhan Tours & Travels +91 9893225590",                   dlt_template_id: "219803", variable_count: 4, variable_mapping: '["customer_name","booking_number","invoice_number","amount"]' },
  { id: "tpl_seed_balance_reminder",name: "Balance Reminder",      event_type: "balance_reminder",  body: "Assalamu Alaikum {#var#}, Your booking {#var#} for {#var#} has outstanding balance of Rs {#var#}. Please make payment at the earliest. Al Burhan Tours & Travels",                  dlt_template_id: "219804", variable_count: 4, variable_mapping: '["customer_name","booking_number","package_name","outstanding_amount"]' },
  { id: "tpl_seed_invoice_generated",name:"Invoice Generated",     event_type: "invoice_generated", body: "Dear {#var#}, Invoice {#var#} for Rs {#var#} has been generated. Please make payment. Al Burhan Tours & Travels +91 9893225590",                                                       dlt_template_id: "219805", variable_count: 3, variable_mapping: '["customer_name","invoice_number","total_amount"]' },
  { id: "tpl_seed_pending_payment", name: "Payment Pending",       event_type: "pending_payment",   body: "Dear {#var#}, Payment of Rs {#var#} is pending for your booking {#var#}. Please pay now to confirm your Hajj seat. Al Burhan Tours & Travels",                                        dlt_template_id: "214148", variable_count: 3, variable_mapping: '["customer_name","amount","booking_number"]' },
  { id: "tpl_seed_departure_remind",name: "Departure Reminder",    event_type: "departure_reminder",body: "Assalamu Alaikum {#var#}, Your Hajj departure is in {#var#} days. Please ensure all documents are ready. May Allah accept your Hajj. Al Burhan Tours & Travels",                      dlt_template_id: "214143", variable_count: 2, variable_mapping: '["customer_name","days_remaining"]' },
  { id: "tpl_seed_flight_assigned", name: "Flight Confirmed",      event_type: "flight_assigned",   body: "Assalamu Alaikum {#var#}, Flight {#var#} from {#var#} to {#var#} on {#var#} at {#var#} is confirmed. Please report 3 hrs early. Al Burhan Tours & Travels",                         dlt_template_id: "214144", variable_count: 6, variable_mapping: '["customer_name","flight_number","from_airport","to_airport","departure_date","departure_time"]' },
  { id: "tpl_seed_ticket_issued",   name: "Ticket Issued",         event_type: "ticket_issued",     body: "Dear {#var#}, Your Hajj air ticket has been issued. Please check all documents. Wishing you a blessed journey. Al Burhan Tours & Travels +91 9893225590",                             dlt_template_id: "214142", variable_count: 1, variable_mapping: '["customer_name"]' },
];

async function seedSMSTemplates() {
  const ex = await pool.query(`SELECT COUNT(*) FROM notification_templates WHERE channel='sms'`);
  if (Number(ex.rows[0]?.count) > 0) return;
  for (const t of SMS_SEED) {
    await pool.query(
      `INSERT INTO notification_templates
         (id, name, event_type, channel, body, dlt_template_id, sender_id, provider,
          variable_count, variable_mapping, priority, enabled, created_at, updated_at)
       VALUES ($1,$2,$3,'sms',$4,$5,'ABURHA','fast2sms',$6,$7::jsonb,0,true,NOW(),NOW())
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.event_type, t.body, t.dlt_template_id, t.variable_count, t.variable_mapping]
    ).catch((e: any) => console.error("[sms-seed]", t.id, e.message));
  }
  console.log("[notification-center] seeded", SMS_SEED.length, "DLT templates");
}

const EMAIL_SEED = [
  { id: "tpl_email_booking_confirm", name: "Booking Confirmation Email", event_type: "booking_approved", subject: "Your Hajj Booking is Confirmed — Al Burhan Tours & Travels", body: "Dear {customer_name},\n\nAssalamu Alaikum!\n\nYour Hajj booking #{booking_number} for {package_name} has been confirmed.\n\nTotal Amount: ₹{total_amount}\nPaid: ₹{paid_amount}\nBalance: ₹{outstanding_amount}\n\nFor any queries, call us at +91 9893225590.\n\nJazak Allah Khair,\nAl Burhan Tours & Travels" },
  { id: "tpl_email_payment_receipt", name: "Payment Receipt Email",      event_type: "payment_received", subject: "Payment Received — Invoice #{invoice_number}", body: "Dear {customer_name},\n\nWe have received your payment of ₹{amount} against booking #{booking_number}.\n\nInvoice No: {invoice_number}\nPayment Mode: {payment_mode}\nDate: {payment_date}\n\nRemaining Balance: ₹{outstanding_amount}\n\nJazak Allah Khair,\nAl Burhan Tours & Travels" },
  { id: "tpl_email_invoice",         name: "Invoice Email",              event_type: "invoice_generated", subject: "Invoice #{invoice_number} from Al Burhan Tours & Travels", body: "Dear {customer_name},\n\nPlease find your invoice #{invoice_number} attached.\n\nAmount Due: ₹{total_amount}\nDue Date: {due_date}\n\nPayment link: {payment_link}\n\nJazak Allah Khair,\nAl Burhan Tours & Travels" },
  { id: "tpl_email_departure_remind",name: "Departure Reminder Email",   event_type: "departure_reminder", subject: "Your Hajj Departure in {days_remaining} Days — Action Required", body: "Dear {customer_name},\n\nAssalamu Alaikum!\n\nThis is a reminder that your Hajj departure is in {days_remaining} days.\n\nPlease ensure:\n• All travel documents are ready\n• Passport is valid\n• Visa is in order\n• You have completed all medical requirements\n\nDeparture Date: {departure_date}\nFlight: {flight_number}\nGroup: {group_name}\n\nMay Allah accept your Hajj. Ameen.\n\nAl Burhan Tours & Travels" },
  { id: "tpl_email_agreement_ready", name: "Agreement Ready Email",       event_type: "agreement_ready", subject: "Your Hajj Agreement is Ready for Signing — Al Burhan", body: "Dear {customer_name},\n\nYour Hajj agreement for booking #{booking_number} is ready for your digital signature.\n\nPlease login to your portal to review and sign the agreement at your earliest convenience.\n\nPortal: {portal_link}\n\nFor assistance, contact us at +91 9893225590.\n\nJazak Allah Khair,\nAl Burhan Tours & Travels" },
  { id: "tpl_email_otp",             name: "OTP / Verification Email",   event_type: "otp", subject: "Your OTP for Al Burhan Tours & Travels", body: "Dear Customer,\n\nYour One-Time Password (OTP) is: {otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.\n\nAl Burhan Tours & Travels" },
];

async function seedEmailTemplates() {
  const ex = await pool.query(`SELECT COUNT(*) FROM notification_templates WHERE channel='email'`);
  if (Number(ex.rows[0]?.count) > 0) return;
  for (const t of EMAIL_SEED) {
    await pool.query(
      `INSERT INTO notification_templates
         (id, name, event_type, channel, body, provider, variable_count, priority, enabled, created_at, updated_at)
       VALUES ($1,$2,$3,'email',$4,'smtp',0,0,true,NOW(),NOW())
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.event_type, t.body]
    ).catch((e: any) => console.error("[email-seed]", t.id, e.message));
  }
  console.log("[notification-center] seeded", EMAIL_SEED.length, "email templates");
}

(async () => {
  try {
    await pool.query(`
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variable_count INT DEFAULT 0;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variable_mapping JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
      ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS last_failure_reason TEXT;
    `);
    await seedSMSTemplates();
    await seedEmailTemplates();
  } catch (e) { console.error("[notification-center] init:", e); }
})();

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [todayRes, deliveredRes, failedRes, pendingRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='sent' AND created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='failed' AND created_at >= $1`, [`${today}T00:00:00Z`]),
      pool.query(`SELECT COUNT(*) FROM notification_logs WHERE status='pending'`),
    ]);
    const sent = Number(todayRes.rows[0]?.count ?? 0);
    const delivered = Number(deliveredRes.rows[0]?.count ?? 0);
    const failed = Number(failedRes.rows[0]?.count ?? 0);
    const pending = Number(pendingRes.rows[0]?.count ?? 0);
    const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

    const byChannel = await pool.query(
      `SELECT channel, status, COUNT(*) as cnt FROM notification_logs WHERE created_at >= $1 GROUP BY channel, status`,
      [`${today}T00:00:00Z`]
    );
    const channelStats: Record<string, Record<string, number>> = {};
    for (const row of byChannel.rows) {
      if (!channelStats[row.channel]) channelStats[row.channel] = {};
      channelStats[row.channel][row.status] = Number(row.cnt);
    }

    const allTime = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='sent') as total_sent FROM notification_logs`);
    const campaignCount = await pool.query(`SELECT COUNT(*) FROM notification_campaigns`).catch(() => ({ rows: [{ count: 0 }] }));

    res.json({ sent, delivered, failed, pending, deliveryRate, channelStats, allTime: allTime.rows[0], campaignCount: Number(campaignCount.rows[0]?.count ?? 0) });
  } catch (err) {
    console.error("[notification-center] GET /stats:", err);
    res.status(500).json({ message: "Failed to get stats" });
  }
});

// ── Delivery Logs ─────────────────────────────────────────────────────────────
router.get("/logs/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`, [req.params.id]);
    if (!result.rows[0]) return void res.status(404).json({ message: "Log not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[notification-center] GET /logs/:id:", err);
    res.status(500).json({ message: "Failed to get log" });
  }
});

router.get("/retry-queue-count", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const r = await pool.query(`SELECT COUNT(*) FROM notification_retry_queue WHERE status='pending'`);
    res.json({ count: Number(r.rows[0]?.count ?? 0) });
  } catch (err) {
    res.json({ count: 0 });
  }
});

router.get("/logs", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, channel, event_type, search, booking_number, date, error_code } = req.query as any;
    const pageParam  = Number(req.query.page  || 1);
    const limitParam = Number(req.query.limit || req.query.limit || 30);
    const offsetParam = Number(req.query.offset || (pageParam - 1) * limitParam);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status)   { conditions.push(`nl.status=$${idx++}`); params.push(status); }
    if (channel)  { conditions.push(`nl.channel=$${idx++}`); params.push(channel); }
    if (event_type) { conditions.push(`nl.event_type=$${idx++}`); params.push(event_type); }
    if (date) {
      conditions.push(`DATE(nl.created_at AT TIME ZONE 'Asia/Kolkata') = $${idx++}`);
      params.push(date);
    }
    if (search) {
      conditions.push(`(nl.recipient ILIKE $${idx} OR nl.message ILIKE $${idx} OR nl.booking_id ILIKE $${idx} OR b.booking_number ILIKE $${idx} OR b.customer_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (booking_number) {
      conditions.push(`nl.booking_id IN (SELECT id FROM bookings WHERE booking_number ILIKE $${idx++})`);
      params.push(`%${booking_number}%`);
    }
    if (error_code) {
      conditions.push(`nl.error_code = $${idx++}`);
      params.push(error_code);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [result, countRes] = await Promise.all([
      pool.query(
        `SELECT nl.*, b.booking_number, b.customer_name
         FROM notification_logs nl
         LEFT JOIN bookings b ON b.id = nl.booking_id
         ${where} ORDER BY nl.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limitParam, offsetParam]
      ),
      pool.query(
        `SELECT COUNT(*) FROM notification_logs nl LEFT JOIN bookings b ON b.id = nl.booking_id ${where}`,
        params
      ),
    ]);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const pages = Math.ceil(total / limitParam) || 1;
    res.json({ logs: result.rows, total, page: pageParam, pages });
  } catch (err) {
    console.error("[notification-center] GET /logs:", err);
    res.status(500).json({ message: "Failed to get logs" });
  }
});

// ── Automation Settings ───────────────────────────────────────────────────────
router.get("/settings", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM notification_settings ORDER BY event_type, channel`);
    res.json({ settings: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get settings" });
  }
});

router.put("/settings", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { settings } = req.body as { settings: Array<{ event_type: string; channel: string; enabled: boolean; template_id?: string }> };
    if (!Array.isArray(settings)) return void res.status(400).json({ message: "settings must be an array" });
    for (const s of settings) {
      await pool.query(
        `INSERT INTO notification_settings (id, event_type, channel, enabled, template_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (event_type, channel) DO UPDATE SET enabled=$4, template_id=$5, updated_at=NOW()`,
        [`ns_${s.event_type}_${s.channel}`, s.event_type, s.channel, s.enabled, s.template_id || null]
      );
    }
    res.json({ message: "Settings updated" });
  } catch (err) {
    console.error("[notification-center] PUT /settings:", err);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

// ── Templates ─────────────────────────────────────────────────────────────────
router.get("/templates", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { channel } = req.query as any;
    const result = channel
      ? await pool.query(`SELECT * FROM notification_templates WHERE channel=$1 ORDER BY event_type, name`, [channel])
      : await pool.query(`SELECT * FROM notification_templates ORDER BY event_type, channel, name`);
    res.json({ templates: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get templates" });
  }
});

router.post("/templates", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, event_type, channel, subject, body, variables,
      meta_template_id, botbee_template_id, dlt_template_id, dlt_entity_id,
      sender_id, provider, language, category, header_text, footer_text,
      buttons, html_body, rcs_agent_id, rcs_campaign_id, rich_card,
      priority, enabled,
    } = req.body;
    if (!name || !channel || !body) return void res.status(400).json({ message: "name, channel, body required" });
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await pool.query(
      `INSERT INTO notification_templates (
         id, name, event_type, channel, subject, body, variables,
         meta_template_id, botbee_template_id, dlt_template_id, dlt_entity_id,
         sender_id, provider, language, category, header_text, footer_text,
         buttons, html_body, rcs_agent_id, rcs_campaign_id, rich_card,
         priority, enabled
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        id, name, event_type || null, channel, subject || null, body, JSON.stringify(variables || []),
        meta_template_id || null, botbee_template_id || null, dlt_template_id || null, dlt_entity_id || null,
        sender_id || null, provider || "generic", language || "en", category || "UTILITY",
        header_text || null, footer_text || null,
        JSON.stringify(buttons || []), html_body || null,
        rcs_agent_id || null, rcs_campaign_id || null, JSON.stringify(rich_card || {}),
        priority ?? 0, enabled !== false,
      ]
    );
    res.json({ template: result.rows[0] });
  } catch (err: any) {
    console.error("[notification-center] POST /templates:", err);
    res.status(500).json({ message: "Failed to create template" });
  }
});

router.put("/templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, event_type, channel, subject, body, variables,
      meta_template_id, botbee_template_id, dlt_template_id, dlt_entity_id,
      sender_id, provider, language, category, header_text, footer_text,
      buttons, html_body, rcs_agent_id, rcs_campaign_id, rich_card,
      priority, enabled,
    } = req.body;
    const result = await pool.query(
      `UPDATE notification_templates SET
         name=$1, event_type=$2, channel=$3, subject=$4, body=$5, variables=$6,
         meta_template_id=$7, botbee_template_id=$8, dlt_template_id=$9, dlt_entity_id=$10,
         sender_id=$11, provider=$12, language=$13, category=$14, header_text=$15, footer_text=$16,
         buttons=$17, html_body=$18, rcs_agent_id=$19, rcs_campaign_id=$20, rich_card=$21,
         priority=$22, enabled=$23, updated_at=NOW()
       WHERE id=$24 RETURNING *`,
      [
        name, event_type || null, channel, subject || null, body, JSON.stringify(variables || []),
        meta_template_id || null, botbee_template_id || null, dlt_template_id || null, dlt_entity_id || null,
        sender_id || null, provider || "generic", language || "en", category || "UTILITY",
        header_text || null, footer_text || null,
        JSON.stringify(buttons || []), html_body || null,
        rcs_agent_id || null, rcs_campaign_id || null, JSON.stringify(rich_card || {}),
        priority ?? 0, enabled !== false,
        req.params.id,
      ]
    );
    if (!result.rows[0]) return void res.status(404).json({ message: "Template not found" });
    res.json({ template: result.rows[0] });
  } catch (err: any) {
    console.error("[notification-center] PUT /templates/:id:", err);
    res.status(500).json({ message: "Failed to update template" });
  }
});

router.delete("/templates/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`DELETE FROM notification_templates WHERE id=$1`, [req.params.id]);
    res.json({ message: "Template deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// ── Per-template DLT test ─────────────────────────────────────────────────────
router.post("/templates/:id/test", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const tplRow = await pool.query(`SELECT * FROM notification_templates WHERE id=$1`, [req.params.id]);
    if (!tplRow.rows[0]) return void res.status(404).json({ ok: false, message: "Template not found" });
    const tpl = tplRow.rows[0];

    if (tpl.channel !== "sms") return void res.status(400).json({ ok: false, message: "Only SMS/DLT templates can be tested here" });
    if (!tpl.dlt_template_id) return void res.status(400).json({ ok: false, message: "No DLT Template ID set — edit template and add one first" });

    const { mobile, variables } = req.body;
    if (!mobile) return void res.status(400).json({ ok: false, message: "mobile is required" });
    const phone = String(mobile).replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) return void res.status(400).json({ ok: false, message: "Invalid mobile number — must be 10 digits" });

    const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
    const f2s = getCachedConfig("fast2sms");
    const apiKey = (f2s.apiKey as string) || process.env.FAST2SMS_API_KEY || "";
    if (!apiKey) return void res.status(400).json({ ok: false, message: "Fast2SMS API key not configured in API Settings" });

    const senderId = tpl.sender_id || "ABURHA";
    const varsArr: string[] = Array.isArray(variables) && variables.length ? variables.map(String) : ["Al Burhan", "Test", "123"];
    const varsEncoded = encodeURIComponent(varsArr.join("|") + "|");
    const endpoint = "https://www.fast2sms.com/dev/bulkV2";
    const url = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${senderId}&message=${tpl.dlt_template_id}&variables_values=${varsEncoded}&numbers=${phone}&flash=0`;
    const maskedUrl = url.replace(apiKey, `${apiKey.slice(0, 6)}***`);

    const { default: axios } = await import("axios");
    const startMs = Date.now();
    let ok = false;
    let apiResponse: any;
    try {
      const resp = await axios.get(url, { timeout: 15000 });
      ok = resp.data?.return === true;
      apiResponse = resp.data;
    } catch (e: any) {
      apiResponse = e?.response?.data || { error: e.message };
    }
    const durationMs = Date.now() - startMs;

    if (ok) {
      await pool.query(`UPDATE notification_templates SET last_success_at=NOW() WHERE id=$1`, [req.params.id]).catch(() => {});
    } else {
      const errMsg = Array.isArray(apiResponse?.message) ? apiResponse.message.join("; ") : (apiResponse?.message || "DLT send failed");
      await pool.query(`UPDATE notification_templates SET last_failure_at=NOW(), last_failure_reason=$1 WHERE id=$2`, [errMsg, req.params.id]).catch(() => {});
    }

    // Bust the sms.ts template cache so any tid changes take effect immediately
    import("../lib/sms.js").then(m => m.bustDBTemplateCache?.()).catch(() => {});

    res.json({ ok, dltTemplateId: tpl.dlt_template_id, senderId, mobile: phone, requestUrl: maskedUrl, durationMs, apiResponse, variablesSent: varsArr });
  } catch (err: any) {
    console.error("[notification-center] POST /templates/:id/test:", err);
    res.status(500).json({ ok: false, message: err.message || "Test failed" });
  }
});

// ── Test Send (all channels) ──────────────────────────────────────────────────
router.post("/test-send", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { channel, recipient, message, subject, html_body, templateId } = req.body;
    if (!channel || !recipient) return void res.status(400).json({ message: "channel and recipient required" });

    const { sendWhatsApp, sendDLTSMS, sendEmail, sendRCS } = await import("../lib/notifications.js");

    let result: { ok: boolean; httpStatus?: number; errorMessage?: string; requestPayload?: any; responsePayload?: any; endpoint?: string; provider?: string };

    if (channel === "whatsapp") {
      const r = await sendWhatsApp(recipient, message || "Test message from Al Burhan Tours & Travels");
      result = r as any;
    } else if (channel === "sms") {
      // ── Full DLT diagnostic test ───────────────────────────────────────────
      const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
      const f2s = getCachedConfig("fast2sms");
      const apiKey = (f2s.apiKey as string) || process.env.FAST2SMS_API_KEY || "";
      if (!apiKey) return void res.status(400).json({ ok: false, message: "Fast2SMS API key not configured in API Settings" });

      // Normalize mobile to 10-digit (Fast2SMS expects 10 digits, auto-prepends 91)
      const rawMobile = String(recipient).replace(/\D/g, "");
      const mobile10 = rawMobile.length > 10 ? rawMobile.slice(-10) : rawMobile;
      if (mobile10.length !== 10) return void res.status(400).json({ ok: false, message: `Invalid mobile: got "${rawMobile}" — must be exactly 10 digits` });

      let dltTemplateId: string | null = null;
      let senderId = "ABURHA";
      let entityId: string | null = null;
      let variablesSent: string[] = [];
      let routeUsed = "q"; // quick route fallback when no template
      let tplBody: string | null = null;

      if (templateId) {
        const tplRow = await pool.query(`SELECT * FROM notification_templates WHERE id=$1 AND channel='sms'`, [templateId]);
        const tpl = tplRow.rows[0];
        if (!tpl) return void res.status(400).json({ ok: false, message: `Template ID ${templateId} not found or not an SMS template` });
        if (!tpl.dlt_template_id) return void res.status(400).json({ ok: false, message: `Template "${tpl.name}" has no DLT Template ID — set one first` });
        dltTemplateId = tpl.dlt_template_id;
        senderId = tpl.sender_id || "ABURHA";
        entityId = tpl.dlt_entity_id || null;
        tplBody = tpl.body || null;
        routeUsed = "dlt";
        // Build variables array from provided message as single var, or use defaults
        variablesSent = message
          ? String(message).split("|").map((s: string) => s.trim()).filter(Boolean)
          : ["Al Burhan", "ABT-001", "Hajj 2026"];
      } else {
        // No template selected — Quick Route test for connectivity only
        variablesSent = [];
      }

      // Build the exact request URL
      const endpoint = "https://www.fast2sms.com/dev/bulkV2";
      let requestUrl: string;
      if (routeUsed === "dlt") {
        const varsEncoded = encodeURIComponent(variablesSent.join("|") + "|");
        requestUrl = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${senderId}&message=${dltTemplateId}&variables_values=${varsEncoded}&numbers=${mobile10}&flash=0`;
        if (entityId) requestUrl += `&entity_id=${entityId}`;
      } else {
        const msgEncoded = encodeURIComponent(message || "Test SMS from Al Burhan Tours & Travels. Ignore.");
        requestUrl = `${endpoint}?authorization=${apiKey}&route=q&message=${msgEncoded}&numbers=${mobile10}&flash=0`;
      }
      const maskedUrl = requestUrl.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`);

      const { default: axios } = await import("axios");
      const startMs = Date.now();
      let httpStatus = 0;
      let apiResponse: any;
      let smsOk = false;
      // Do NOT catch — let it propagate so admin sees the raw error
      try {
        const resp = await axios.get(requestUrl, { timeout: 15000 });
        httpStatus = resp.status;
        apiResponse = resp.data;
        smsOk = resp.data?.return === true;
      } catch (axiosErr: any) {
        httpStatus = axiosErr?.response?.status || 0;
        apiResponse = axiosErr?.response?.data || { error: axiosErr.message, code: axiosErr.code };
        smsOk = false;
      }
      const durationMs = Date.now() - startMs;

      const errorCode: string | null = apiResponse?.code || apiResponse?.status_code || apiResponse?.error_code || null;
      const errorMsg: string | null = Array.isArray(apiResponse?.message)
        ? apiResponse.message.join("; ")
        : (typeof apiResponse?.message === "string" ? apiResponse.message : null);

      result = {
        ok: smsOk,
        provider: "Fast2SMS",
        endpoint,
        httpStatus,
        requestUrl: maskedUrl,
        durationMs,
        route: routeUsed,
        dltTemplateId: dltTemplateId || null,
        senderId,
        entityId: entityId || null,
        mobile: mobile10,
        numbers: `91${mobile10}`,
        variablesSent: variablesSent.length ? variablesSent : null,
        templateBody: tplBody,
        apiResponse,
        errorCode,
        errorMessage: errorMsg,
        authorization: `${apiKey.slice(0, 6)}***${apiKey.slice(-4)} (len=${apiKey.length})`,
      } as any;
    } else if (channel === "rcs") {
      const r = await sendRCS(recipient, "Test Recipient", message || "Test RCS from Al Burhan Tours & Travels");
      result = r as any;
    } else if (channel === "email") {
      if (!recipient.includes("@")) return void res.status(400).json({ message: "Email recipient must be a valid email address" });
      const r = await sendEmail(recipient, subject || "Test Email from Al Burhan", message || "This is a test email.", html_body || undefined);
      result = r as any;
    } else {
      return void res.status(400).json({ message: `Unsupported channel: ${channel}` });
    }

    await pool.query(
      `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_response, provider_name, api_endpoint, http_status, request_payload, sent_at, created_at)
       VALUES ($1,'test_send',$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,NOW(),NOW())`,
      [
        `test_${Date.now()}`, channel, recipient, message || "",
        (result as any).ok ? "sent" : "failed",
        JSON.stringify(result),
        (result as any).provider || channel,
        (result as any).endpoint || "",
        (result as any).httpStatus || null,
        JSON.stringify({ channel, recipient, message, subject, templateId }),
      ]
    ).catch(() => {});

    res.json({ ok: (result as any).ok, channel, recipient, ...result });
  } catch (err: any) {
    console.error("[notification-center] POST /test-send:", err);
    res.status(500).json({ ok: false, message: err.message || "Test send failed" });
  }
});

// ── Retry ──────────────────────────────────────────────────────────────────────
router.post("/retry/:logId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await retryNotification(req.params.logId);
    if (!result.success) return void res.status(400).json({ message: result.error || "Retry failed" });
    res.json({ message: "Retried successfully" });
  } catch (err) {
    res.status(500).json({ message: "Retry failed" });
  }
});

router.post("/retry-all-failed", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const failed = await pool.query(
      `SELECT id FROM notification_logs WHERE status='failed' AND retry_count < 3 ORDER BY created_at DESC LIMIT 50`
    );
    let success = 0; let failed_count = 0;
    for (const row of failed.rows) {
      const r = await retryNotification(row.id);
      if (r.success) success++; else failed_count++;
    }
    res.json({ message: `Retried ${failed.rows.length} messages`, success, failed: failed_count });
  } catch (err) {
    res.status(500).json({ message: "Bulk retry failed" });
  }
});

// ── Scheduled ─────────────────────────────────────────────────────────────────
router.get("/scheduled", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(`SELECT * FROM scheduled_notifications ORDER BY scheduled_at ASC`);
    res.json({ scheduled: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get scheduled" });
  }
});

router.post("/scheduled", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { event_type, channel, recipient, customer_id, booking_id, customer_name, message, subject, scheduled_at } = req.body;
    if (!event_type || !channel || !recipient || !message || !scheduled_at) {
      return void res.status(400).json({ message: "event_type, channel, recipient, message, scheduled_at required" });
    }
    const id = `sn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await pool.query(
      `INSERT INTO scheduled_notifications (id, event_type, channel, recipient, customer_id, booking_id, customer_name, message, subject, scheduled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
      [id, event_type, channel, recipient, customer_id || null, booking_id || null, customer_name || null, message, subject || null, scheduled_at]
    );
    res.json({ scheduled: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Failed to create scheduled notification" });
  }
});

router.delete("/scheduled/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(`DELETE FROM scheduled_notifications WHERE id=$1`, [req.params.id]);
    res.json({ message: "Scheduled notification cancelled" });
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel" });
  }
});

router.post("/process-scheduled", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const due = await pool.query(
      `SELECT * FROM scheduled_notifications WHERE status='pending' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 20`
    );
    let sent = 0;
    const { sendWhatsApp, sendDLTSMS, sendEmail, sendRCS } = await import("../lib/notifications.js");
    for (const sn of due.rows) {
      let ok = false;
      try {
        if (sn.channel === "whatsapp") ok = Boolean(await sendWhatsApp(sn.recipient, sn.message));
        else if (sn.channel === "sms") { await sendDLTSMS(sn.recipient, sn.recipient, "", ""); ok = true; }
        else if (sn.channel === "email") { await sendEmail(sn.recipient, sn.subject || "Notification", sn.message); ok = true; }
        else if (sn.channel === "rcs") ok = Boolean(await sendRCS(sn.recipient, sn.customer_name || "", sn.message));
      } catch { ok = false; }
      await pool.query(`UPDATE scheduled_notifications SET status=$1, sent_at=$2 WHERE id=$3`,
        [ok ? "sent" : "failed", ok ? new Date().toISOString() : null, sn.id]);
      if (ok) sent++;
    }
    res.json({ processed: due.rows.length, sent });
  } catch (err) {
    res.status(500).json({ message: "Failed to process scheduled" });
  }
});

// ── Campaign Manager ──────────────────────────────────────────────────────────

// GET available audience groups for campaigns
router.get("/campaigns/audiences", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const [groups, buses, allCount, outstandingCount, visaPendingCount, flightPendingCount] = await Promise.all([
      pool.query(`SELECT id, name FROM hajj_groups WHERE is_deleted=false ORDER BY name LIMIT 50`),
      pool.query(`SELECT id, bus_number FROM buses WHERE is_deleted=false ORDER BY bus_number LIMIT 100`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`),
      pool.query(`SELECT COUNT(DISTINCT customer_mobile) FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL`),
      pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`),
    ]);
    res.json({
      groups: groups.rows,
      buses: buses.rows,
      counts: {
        all_pilgrims: Number(allCount.rows[0]?.count ?? 0),
        outstanding_payments: Number(outstandingCount.rows[0]?.count ?? 0),
        visa_pending: Number(visaPendingCount.rows[0]?.count ?? 0),
        all_customers: Number(flightPendingCount.rows[0]?.count ?? 0),
      },
    });
  } catch (err) {
    console.error("[campaigns] GET /audiences:", err);
    res.status(500).json({ message: "Failed to get audiences" });
  }
});

// GET audience preview count
router.post("/campaigns/preview", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { audience_type, audience_id } = req.body;
    let count = 0;
    if (audience_type === "all_pilgrims") {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE mobile_india IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "group" && audience_id) {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE group_id=$1 AND mobile_india IS NOT NULL`, [audience_id]);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "bus" && audience_id) {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrim_bus_assignments pba JOIN pilgrims p ON p.id=pba.pilgrim_id WHERE pba.bus_id=$1 AND p.mobile_india IS NOT NULL`, [audience_id]);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "outstanding_payments") {
      const r = await pool.query(`SELECT COUNT(DISTINCT customer_mobile) FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    } else if (audience_type === "visa_pending") {
      const r = await pool.query(`SELECT COUNT(*) FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL`);
      count = Number(r.rows[0]?.count ?? 0);
    }
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: "Preview failed" });
  }
});

// GET list campaigns
router.get("/campaigns", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notification_campaigns ORDER BY created_at DESC LIMIT 100`
    ).catch(() => ({ rows: [] }));
    res.json({ campaigns: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Failed to get campaigns" });
  }
});

// POST create & send campaign
router.post("/campaigns", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, audience_type, audience_id, channel, message } = req.body;
    if (!audience_type || !channel || !message?.trim()) {
      return void res.status(400).json({ message: "audience_type, channel, message required" });
    }

    // Fetch recipients
    let recipients: Array<{ mobile: string; name: string; customerId?: string }> = [];

    if (audience_type === "all_pilgrims") {
      const r = await pool.query(`SELECT full_name, mobile_india FROM pilgrims WHERE mobile_india IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name }));
    } else if (audience_type === "group" && audience_id) {
      const r = await pool.query(`SELECT full_name, mobile_india, id FROM pilgrims WHERE group_id=$1 AND mobile_india IS NOT NULL`, [audience_id]);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    } else if (audience_type === "bus" && audience_id) {
      const r = await pool.query(`SELECT p.full_name, p.mobile_india, p.id FROM pilgrim_bus_assignments pba JOIN pilgrims p ON p.id=pba.pilgrim_id WHERE pba.bus_id=$1 AND p.mobile_india IS NOT NULL`, [audience_id]);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    } else if (audience_type === "outstanding_payments") {
      const r = await pool.query(`SELECT DISTINCT customer_name, customer_mobile FROM bookings WHERE remaining_balance > 0 AND status='approved' AND customer_mobile IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.customer_mobile, name: p.customer_name }));
    } else if (audience_type === "visa_pending") {
      const r = await pool.query(`SELECT full_name, mobile_india, id FROM pilgrims WHERE COALESCE(visa_status,'not_applied') != 'received' AND mobile_india IS NOT NULL LIMIT 1000`);
      recipients = r.rows.map((p: any) => ({ mobile: p.mobile_india, name: p.full_name, customerId: p.id }));
    }

    if (recipients.length === 0) {
      return void res.status(400).json({ message: "No recipients found for the selected audience" });
    }

    // Create campaign record
    const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO notification_campaigns (id, name, audience_type, audience_id, channel, message, status, total_count, sent_count, failed_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'sending',$7,0,0,NOW())`,
      [campaignId, name || `Campaign ${new Date().toLocaleDateString("en-IN")}`, audience_type, audience_id || null, channel, message, recipients.length]
    ).catch(() => {});

    // Send (respond immediately, process in background)
    res.json({ message: `Campaign started — sending to ${recipients.length} recipients`, campaignId, total: recipients.length });

    // Background send
    sendBulkNotification({
      campaignId,
      channel: channel as Channel,
      message,
      recipients,
    }).catch(err => console.error("[campaigns] bulk send error:", err));

  } catch (err: any) {
    console.error("[campaigns] POST /campaigns:", err);
    res.status(500).json({ message: err.message || "Failed to send campaign" });
  }
});

// ── Customer Preferences ──────────────────────────────────────────────────────
router.get("/preferences/:customerId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer_notification_preferences WHERE customer_id=$1`,
      [req.params.customerId]
    ).catch(() => ({ rows: [] }));
    if (!result.rows[0]) {
      res.json({ preferences: { customer_id: req.params.customerId, whatsapp: true, sms: true, email: false, rcs: false, push: false } });
    } else {
      res.json({ preferences: result.rows[0] });
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to get preferences" });
  }
});

router.put("/preferences/:customerId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { whatsapp, sms, email, rcs, push } = req.body;
    await pool.query(
      `INSERT INTO customer_notification_preferences (customer_id, whatsapp, sms, email, rcs, push, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (customer_id) DO UPDATE SET whatsapp=$2,sms=$3,email=$4,rcs=$5,push=$6,updated_at=NOW()`,
      [req.params.customerId, whatsapp ?? true, sms ?? true, email ?? false, rcs ?? false, push ?? false]
    ).catch(() => {});
    res.json({ message: "Preferences updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

// ── Meta ──────────────────────────────────────────────────────────────────────
router.get("/event-types", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const { EVENT_LABELS, EVENT_GROUPS } = await import("../lib/notificationEngine.js");
  res.json({ eventTypes: EVENT_TYPES, channels: CHANNELS, labels: EVENT_LABELS, groups: EVENT_GROUPS });
});

// ── Template Preview ──────────────────────────────────────────────────────────
// Returns all ABT WhatsApp templates with their variable schema.
// Optional ?bookingId=ABT123 resolves live values from the booking for preview.
const TEMPLATE_VARIABLE_SCHEMA: Record<string, Array<{ key: string; description: string; erpField: string }>> = {
  booking_submitted:      [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"PackageContent",description:"Package",erpField:"package_name" },{ key:"Amount",description:"Total Amount",erpField:"total_amount" }],
  booking_approved:       [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"PackageContent",description:"Package",erpField:"package_name" },{ key:"Amount",description:"Total Amount",erpField:"total_amount" },{ key:"Paymenturllink",description:"Invoice / Payment Link",erpField:"invoice_url" }],
  payment_received:       [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Invoice",description:"Invoice Number",erpField:"invoice_number" },{ key:"Amount",description:"Amount Received",erpField:"paid_amount" }],
  pending_payment:        [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"PackageContent",description:"Package",erpField:"package_name" },{ key:"Amount",description:"Balance Amount",erpField:"outstanding_amount" },{ key:"Paymenturllink",description:"Payment Link",erpField:"payment_url" }],
  invoice_ready:          [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Invoice",description:"Invoice Number",erpField:"invoice_number" },{ key:"Amount",description:"Total Amount",erpField:"total_amount" },{ key:"Paymenturllink",description:"Invoice Link",erpField:"invoice_url" }],
  agreement_ready:        [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Agreement",description:"Agreement Number",erpField:"agreement_number" },{ key:"Download",description:"Agreement Sign Link",erpField:"agreement_url" }],
  agreement_signed:       [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"Agreement",description:"Agreement ID",erpField:"agreement_number" }],
  visa_issued:            [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Visano",description:"Visa Number",erpField:"visa_number" },{ key:"Download",description:"Visa Download Link",erpField:"visa_url" }],
  ticket_issued:          [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Flightnumber",description:"PNR / Flight Number",erpField:"pnr" },{ key:"Download",description:"Ticket Download Link",erpField:"ticket_url" }],
  departure_reminder:     [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Departuredate",description:"Departure Date",erpField:"departure_date" },{ key:"Reportingtime",description:"Reporting Time",erpField:"reporting_time" },{ key:"T2",description:"Airport",erpField:"departure_airport" }],
  flight_reminder:        [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"PackageContent",description:"Package",erpField:"package_name" },{ key:"Flightnumber",description:"Flight Number",erpField:"flight_number" },{ key:"Departuredate",description:"Departure Date",erpField:"departure_date" },{ key:"Reportingtime",description:"Reporting Time",erpField:"reporting_time" },{ key:"Airport",description:"Airport",erpField:"departure_airport" }],
  return_flight_reminder: [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Flightnumber",description:"Flight Number",erpField:"flight_number" },{ key:"Departuredate",description:"Return Date",erpField:"return_date" },{ key:"Reportingtime",description:"Reporting Time",erpField:"reporting_time" },{ key:"Airport",description:"Airport",erpField:"return_airport" }],
  room_allocation:        [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"BookingID",description:"Booking ID",erpField:"booking_number" },{ key:"Hotel",description:"Hotel Name",erpField:"hotel_name" },{ key:"Roomnumber",description:"Room Number",erpField:"room_number" }],
  group_orientation:      [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"date",description:"Date",erpField:"orientation_date" },{ key:"Time",description:"Time",erpField:"orientation_time" },{ key:"Hussainhall",description:"Venue",erpField:"venue" }],
  welcome_saudi:          [{ key:"Name",description:"Customer Name",erpField:"customer_name" }],
  arrival_india:          [{ key:"Name",description:"Customer Name",erpField:"customer_name" }],
  hajj_mubarak:           [{ key:"Name",description:"Customer Name",erpField:"customer_name" }],
  hajj_launch:            [{ key:"Name",description:"Customer Name",erpField:"customer_name" },{ key:"2027",description:"Year",erpField:"year" }],
};

router.get("/template-preview", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId: qBookingId } = req.query as { bookingId?: string };
    const { ABT_TEMPLATES, TEMPLATE_BODIES } = await import("../lib/botbee.js");
    const SITE = "https://alburhantravels.com";

    // Optionally resolve live booking values
    let liveData: Record<string, string> | null = null;
    if (qBookingId?.trim()) {
      try {
        const bRes = await pool.query(
          `SELECT b.booking_number, b.total_amount, b.paid_amount,
                  u.full_name AS customer_name, p.package_name,
                  COALESCE(i.invoice_number, b.booking_number) AS invoice_number
           FROM bookings b
           LEFT JOIN users u ON u.id = b.customer_id
           LEFT JOIN packages p ON p.id = b.package_id
           LEFT JOIN invoices i ON i.booking_id = b.id
           WHERE b.booking_number = $1 OR b.id::text = $1
           ORDER BY i.created_at DESC
           LIMIT 1`,
          [qBookingId.trim()]
        );
        if (bRes.rows[0]) {
          const r = bRes.rows[0];
          const outstanding = Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0));
          const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
          liveData = {
            customer_name:       r.customer_name || "Customer",
            booking_number:      r.booking_number || qBookingId.trim(),
            package_name:        r.package_name || "Hajj/Umrah Package",
            total_amount:        fmt(Number(r.total_amount || 0)),
            paid_amount:         fmt(Number(r.paid_amount || 0)),
            outstanding_amount:  fmt(outstanding),
            invoice_number:      r.invoice_number || r.booking_number || qBookingId.trim(),
            invoice_url:         `${SITE}/invoice/${r.booking_number || qBookingId.trim()}`,
            payment_url:         `${SITE}/pay/${r.booking_number || qBookingId.trim()}`,
            agreement_url:       `${SITE}/agreement/${r.booking_number || qBookingId.trim()}`,
            agreement_number:    r.booking_number || qBookingId.trim(),
          };
        }
      } catch (e: any) {
        console.warn("[template-preview] booking lookup:", e.message);
      }
    }

    const templates = Object.entries(ABT_TEMPLATES as Record<string, { id: string; name: string }>).map(([slug, tpl]) => {
      const varDefs = TEMPLATE_VARIABLE_SCHEMA[slug] || [];
      const templateId = tpl.id || "";
      const bodyTemplate = templateId ? (TEMPLATE_BODIES as Record<string, string>)[templateId] || null : null;

      const variables = varDefs.map((v, idx) => {
        const liveValue = liveData ? (liveData[v.erpField] ?? null) : null;
        const status = liveData
          ? (liveValue ? "ok" : "missing")
          : "no_booking";
        return { slot: idx + 1, key: v.key, placeholder: `#!${v.key}!#`, description: v.description, erpField: v.erpField, value: liveValue, status };
      });

      // Render preview body with substituted values
      let preview: string | null = null;
      if (bodyTemplate) {
        preview = bodyTemplate;
        if (liveData) {
          // Replace {{N}} positionally
          const vals = variables.map(v => v.value ?? `[${v.key}]`);
          preview = preview.replace(/\{\{(\d+)\}\}/g, (_, n) => {
            const idx = parseInt(n, 10) - 1;
            return idx >= 0 && idx < vals.length ? vals[idx] : `{{${n}}}`;
          });
          // Replace #!Key!#
          for (const v of variables) {
            preview = preview!.split(`#!${v.key}!#`).join(v.value ?? `[${v.key}]`);
          }
        }
      }

      // Validate: any missing required variables?
      const missingVars = variables.filter(v => v.status === "missing").map(v => v.key);

      return {
        event: slug,
        templateId,
        templateName: tpl.name || slug,
        hasTemplate: !!templateId,
        hasBody: !!bodyTemplate,
        variableCount: varDefs.length,
        variables,
        bodyTemplate,
        preview,
        missingVars,
        sendBlocked: missingVars.length > 0,
      };
    });

    res.json({ templates, bookingId: qBookingId?.trim() || null, bookingFound: !!liveData });
  } catch (err: any) {
    console.error("[template-preview]", err);
    res.status(500).json({ message: err.message || "Failed to load template preview" });
  }
});

export default router;
