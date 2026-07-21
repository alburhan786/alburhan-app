// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getCachedConfig } from "../lib/apiSettingsProvider.js";
import axios from "axios";

const router = Router();
router.use(requireAdmin as any);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  if (clean.length > 10) return clean.slice(-10);
  return clean;
}

function generateId(): string {
  return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Seed approved sender IDs ──────────────────────────────────────────────────

const APPROVED_SENDERS = [
  {
    sender_id: "ABURHA",
    header_type: "Transactional",
    creator: "Al Burhan Tours & Travels",
    header_classification: "Transaction",
    operator_status: "Registered",
    global_status: "Approved",
    default_sender: true,
  },
  {
    sender_id: "ALBURH",
    header_type: "Transactional",
    creator: "Al Burhan Tours & Travels",
    header_classification: "Transaction",
    operator_status: "Registered",
    global_status: "Approved",
    default_sender: false,
  },
  {
    sender_id: "ALBUR",
    header_type: "Transactional",
    creator: "Al Burhan Tours & Travels",
    header_classification: "Transaction",
    operator_status: "Registered",
    global_status: "Approved",
    default_sender: false,
  },
  {
    sender_id: "ABTUMR",
    header_type: "Transactional",
    creator: "Al Burhan Tours & Travels",
    header_classification: "Transaction",
    operator_status: "Registered",
    global_status: "Approved",
    default_sender: false,
  },
  {
    sender_id: "ABTTHJ",
    header_type: "Transactional",
    creator: "Al Burhan Tours & Travels",
    header_classification: "Transaction",
    operator_status: "Registered",
    global_status: "Approved",
    default_sender: false,
  },
];

async function ensureSenderIds() {
  for (const s of APPROVED_SENDERS) {
    const exists = await pool.query(`SELECT id FROM sender_ids WHERE sender_id = $1`, [s.sender_id]);
    if (!exists.rows.length) {
      await pool.query(
        `INSERT INTO sender_ids
         (id, sender_id, status, default_sender, header_type, creator, header_classification,
          operator_status, global_status, created_at, updated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
        [
          generateId(), s.sender_id, s.default_sender, s.header_type,
          s.creator, s.header_classification, s.operator_status, s.global_status,
        ]
      );
    }
  }
}

// ── GET /api/sms-settings/sender-ids ─────────────────────────────────────────
router.get("/sender-ids", async (_req: AuthenticatedRequest, res) => {
  try {
    await ensureSenderIds();
    const r = await pool.query(
      `SELECT id, sender_id, status, default_sender, header_type, creator,
              header_classification, valid_till, registration_date,
              operator_status, global_status, created_at, updated_at
       FROM sender_ids
       ORDER BY default_sender DESC, sender_id`
    );
    res.json({ ok: true, senderIds: r.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /api/sms-settings/sender-ids/:id/set-default ─────────────────────────
router.put("/sender-ids/:id/set-default", async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE sender_ids SET default_sender = false, updated_at = NOW()`);
    await pool.query(`UPDATE sender_ids SET default_sender = true, updated_at = NOW() WHERE id = $1`, [id]);

    const r = await pool.query(`SELECT sender_id FROM sender_ids WHERE id = $1`, [id]);
    const senderId = r.rows[0]?.sender_id;
    if (!senderId) return void res.status(404).json({ ok: false, error: "Sender ID not found" });

    // Also update the fast2sms api_settings extra to use this sender_id
    const current = getCachedConfig("fast2sms");
    const merged = { ...(current.extra || {}), sender_id: senderId };
    await pool.query(
      `UPDATE api_settings SET extra = $1, updated_at = NOW() WHERE provider = 'fast2sms'`,
      [JSON.stringify(merged)]
    );

    res.json({ ok: true, defaultSenderId: senderId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/sms-settings/sender-ids/:id ───────────────────────────────────
router.patch("/sender-ids/:id", async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status, valid_till, registration_date, operator_status, global_status } = req.body;
  try {
    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [id];
    let i = 2;
    if (status !== undefined) { updates.push(`status = $${i++}`); values.push(status); }
    if (valid_till !== undefined) { updates.push(`valid_till = $${i++}`); values.push(valid_till || null); }
    if (registration_date !== undefined) { updates.push(`registration_date = $${i++}`); values.push(registration_date || null); }
    if (operator_status !== undefined) { updates.push(`operator_status = $${i++}`); values.push(operator_status); }
    if (global_status !== undefined) { updates.push(`global_status = $${i++}`); values.push(global_status); }
    if (updates.length === 1) return void res.json({ ok: true, message: "Nothing to update" });
    await pool.query(`UPDATE sender_ids SET ${updates.join(", ")} WHERE id = $1`, values);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/sms-settings/test-send ─────────────────────────────────────────
router.post("/test-send", async (req: AuthenticatedRequest, res) => {
  const { senderId, templateId, mobile, variables } = req.body;

  if (!senderId || !templateId || !mobile) {
    return void res.status(400).json({ ok: false, error: "senderId, templateId, and mobile are required" });
  }

  const phone = toPhone(String(mobile));
  if (phone.length !== 10) {
    return void res.status(400).json({ ok: false, error: "Invalid mobile number — must be 10 digits" });
  }

  // Validate sender ID against DB
  const senderRow = await pool.query(
    `SELECT sender_id, status, global_status, operator_status FROM sender_ids WHERE sender_id = $1`,
    [senderId]
  ).catch(() => ({ rows: [] }));

  if (!senderRow.rows.length) {
    return void res.status(400).json({ ok: false, error: `Sender ID "${senderId}" is not registered in the system` });
  }
  const sender = senderRow.rows[0];
  if (sender.status !== "active") {
    return void res.status(400).json({ ok: false, error: `Sender ID "${senderId}" is inactive` });
  }

  const f2s = getCachedConfig("fast2sms");
  const apiKey = f2s.apiKey || process.env.FAST2SMS_API_KEY || "";
  if (!apiKey) return void res.status(400).json({ ok: false, error: "Fast2SMS API key not configured" });

  const varsEncoded = variables?.length
    ? encodeURIComponent(variables.join("|") + "|")
    : encodeURIComponent("Al Burhan|Test|Success|");

  const endpoint = "https://www.fast2sms.com/dev/bulkV2";
  const url = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${senderId}&message=${templateId}&variables_values=${varsEncoded}&numbers=${phone}&flash=0`;
  const maskedUrl = url.replace(apiKey, `${apiKey.slice(0, 6)}***`);

  const startMs = Date.now();
  try {
    const resp = await axios.get(url, { timeout: 15000 });
    const ok = resp.data?.return === true;
    const durationMs = Date.now() - startMs;

    res.json({
      ok,
      test: {
        senderIdUsed: senderId,
        templateId,
        route: "dlt",
        mobile: phone,
        requestUrl: maskedUrl,
        httpStatus: resp.status,
        apiResponse: resp.data,
        deliveryStatus: ok ? "Delivered" : "Failed",
        durationMs,
        errorMessage: ok ? null : (Array.isArray(resp.data?.message) ? resp.data.message.join("; ") : resp.data?.message || "Delivery failed"),
      },
      validations: {
        senderIdRegistered: true,
        senderIdActive: sender.status === "active",
        senderIdDltApproved: sender.global_status === "Approved",
        templateIdProvided: !!templateId,
        routeDlt: true,
        noFallback: true,
      },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startMs;
    const resp = err?.response;
    res.json({
      ok: false,
      test: {
        senderIdUsed: senderId,
        templateId,
        route: "dlt",
        mobile: phone,
        requestUrl: maskedUrl,
        httpStatus: resp?.status || 0,
        apiResponse: resp?.data || { error: err.message },
        deliveryStatus: "Failed",
        durationMs,
        errorMessage: resp?.data?.message || err.message,
      },
      validations: {
        senderIdRegistered: true,
        senderIdActive: sender.status === "active",
        senderIdDltApproved: sender.global_status === "Approved",
        templateIdProvided: !!templateId,
        routeDlt: true,
        noFallback: true,
      },
    });
  }
});

// ── GET /api/sms-settings/emergency-fallback ─────────────────────────────────
router.get("/emergency-fallback", async (_req: AuthenticatedRequest, res) => {
  try {
    const f2s = getCachedConfig("fast2sms");
    const extra = f2s.extra || {};
    const enabled = extra.emergency_sms_fallback_enabled === "1";
    res.json({
      ok: true,
      enabled,
      reason: extra.emergency_reason || null,
      enabledAt: extra.emergency_enabled_at || null,
      enabledBy: extra.emergency_enabled_by || null,
      enabledIp: extra.emergency_enabled_ip || null,
      enabledDevice: extra.emergency_enabled_ua || null,
      disabledAt: extra.emergency_disabled_at || null,
      disabledBy: extra.emergency_disabled_by || null,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/sms-settings/emergency-fallback ─────────────────────────────────
// Enable or disable emergency quick-route fallback
router.post("/emergency-fallback", async (req: AuthenticatedRequest, res) => {
  const { enabled, reason } = req.body || {};
  if (typeof enabled !== "boolean") {
    return void res.status(400).json({ ok: false, error: "enabled (boolean) is required" });
  }
  if (enabled && !reason?.trim()) {
    return void res.status(400).json({ ok: false, error: "reason is required when enabling emergency fallback" });
  }
  try {
    const { decrypt, encrypt } = await import("../lib/encryption.js");
    const row = await pool.query(`SELECT extra_fields_encrypted FROM api_settings WHERE provider='fast2sms' LIMIT 1`);
    let extra: Record<string, any> = {};
    try { if (row.rows[0]?.extra_fields_encrypted) extra = JSON.parse(decrypt(row.rows[0].extra_fields_encrypted)); } catch {}
    const adminName = (req as any).user?.name || (req as any).user?.email || "admin";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.socket?.remoteAddress || req.ip || "unknown";
    const ua = (req.headers["user-agent"] as string) || "unknown";
    const ts = new Date().toISOString();
    if (enabled) {
      extra.emergency_sms_fallback_enabled = "1";
      extra.emergency_reason = reason.trim();
      extra.emergency_enabled_at = ts;
      extra.emergency_enabled_by = adminName;
      extra.emergency_enabled_ip = ip;
      extra.emergency_enabled_ua = ua;
    } else {
      extra.emergency_sms_fallback_enabled = "0";
      extra.emergency_disabled_at = ts;
      extra.emergency_disabled_by = adminName;
      extra.emergency_disabled_ip = ip;
    }
    const enc = encrypt(JSON.stringify(extra));
    await pool.query(`UPDATE api_settings SET extra_fields_encrypted=$1, updated_at=NOW() WHERE provider='fast2sms'`, [enc]);
    const { invalidateCache } = await import("../lib/apiSettingsProvider.js");
    invalidateCache();
    // Also log to audit_logs if table exists
    await pool.query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, admin_id, admin_name, changes, created_at)
       VALUES ($1, $2, 'sms_settings', 'emergency_fallback', $3, $4, $5, NOW())`,
      [
        `ems_${Date.now()}`,
        enabled ? "EMERGENCY_SMS_ENABLED" : "EMERGENCY_SMS_DISABLED",
        (req as any).user?.id || null,
        adminName,
        JSON.stringify({ enabled, reason: reason || null }),
      ]
    ).catch(() => {}); // Non-fatal if audit_logs has different schema
    res.json({
      ok: true,
      enabled,
      message: enabled
        ? `Emergency SMS fallback ENABLED. Reason: ${reason}. WhatsApp and Email will continue normally. This is a temporary measure — configure DLT templates to disable it.`
        : "Emergency SMS fallback DISABLED. DLT templates are now required for all SMS.",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/sms-settings/verification ───────────────────────────────────────
// Live check: all 11 events — sender ID loaded, template ID configured, route=DLT
router.get("/verification", async (_req: AuthenticatedRequest, res) => {
  const f2s = getCachedConfig("fast2sms");
  const extra = f2s.extra || {};
  const globalSender = extra.sender_id || "ABURHA";

  // Load approved sender IDs
  const senderRows = await pool.query(
    `SELECT sender_id, status, global_status FROM sender_ids WHERE status = 'active'`
  ).catch(() => ({ rows: [] }));
  const approvedIds = senderRows.rows.map((r: any) => r.sender_id);

  const EVENTS = [
    { event: "otp",                  label: "OTP — Login / Registration",    tidKey: "otp_template_id",          senderKey: "otp_sender" },
    { event: "forgot_password_otp",  label: "OTP — Forgot Password",         tidKey: "forgot_password_otp_tid",  senderKey: "forgot_password_otp_sender" },
    { event: "booking_created",      label: "Booking Received",              tidKey: "booking_created_tid",      senderKey: "booking_created_sender" },
    { event: "booking_approved",     label: "Booking Approved / Confirmed",  tidKey: "booking_confirmed_tid",    senderKey: "booking_confirmed_sender" },
    { event: "booking_rejected",     label: "Booking Rejected",              tidKey: "booking_rejected_tid",     senderKey: "booking_rejected_sender" },
    { event: "payment_received",     label: "Full Payment Received",         tidKey: "payment_received_tid",     senderKey: "payment_received_sender" },
    { event: "partial_payment",      label: "Partial Payment",               tidKey: "partial_payment_tid",      senderKey: "partial_payment_sender" },
    { event: "invoice_generated",    label: "Invoice Generated",             tidKey: "invoice_created_tid",      senderKey: "invoice_created_sender" },
    { event: "agreement_signed",     label: "Agreement Signed",              tidKey: "agreement_signed_tid",     senderKey: "agreement_signed_sender" },
    { event: "payment_due",          label: "Payment Reminder",              tidKey: "pending_payment_tid",      senderKey: "pending_payment_sender" },
    { event: "ticket_issued",        label: "Flight Ticket Issued",          tidKey: "ticket_issued_tid",        senderKey: "ticket_issued_sender" },
    { event: "visa_ready",           label: "Visa Issued",                   tidKey: "visa_issued_tid",          senderKey: "visa_issued_sender" },
    { event: "hotel_voucher",        label: "Hotel Voucher Issued",          tidKey: "hotel_voucher_issued_tid", senderKey: "hotel_voucher_sender" },
    { event: "departure_reminder",   label: "Departure Reminder",            tidKey: "departure_reminder_tid",   senderKey: "departure_reminder_sender" },
    { event: "arrival_reminder",     label: "Arrival Reminder",              tidKey: "arrival_reminder_tid",     senderKey: "arrival_reminder_sender" },
    { event: "welcome_saudi_arabia", label: "Welcome to Saudi Arabia",       tidKey: "welcome_saudi_arabia_tid", senderKey: "welcome_saudi_arabia_sender" },
    { event: "return_reminder",      label: "Return Reminder",               tidKey: "return_reminder_tid",      senderKey: "return_reminder_sender" },
  ];

  const results = EVENTS.map(ev => {
    const templateId = extra[ev.tidKey] || "";
    const senderId = extra[ev.senderKey] || globalSender;
    const senderApproved = approvedIds.includes(senderId);
    const allPass = !!templateId && senderApproved;
    const failures: string[] = [];
    if (!templateId) failures.push(`Template ID not configured (set ${ev.tidKey})`);
    if (!senderApproved) failures.push(`Sender ID "${senderId}" not in approved/active list`);
    return {
      event: ev.event,
      label: ev.label,
      senderId,
      templateId: templateId || null,
      route: "dlt",
      senderApproved,
      templateConfigured: !!templateId,
      pass: allPass,
      failures,
    };
  });

  const passCount = results.filter(r => r.pass).length;
  res.json({
    ok: passCount === EVENTS.length,
    summary: { total: EVENTS.length, pass: passCount, fail: EVENTS.length - passCount },
    policy: { route: "dlt", fallbackAllowed: false, quickRouteAllowed: false },
    approvedSenderIds: approvedIds,
    globalSender,
    events: results,
    generatedAt: new Date().toISOString(),
  });
});

// ── GET /api/sms-settings/production-report ───────────────────────────────────
// Full production readiness check: SMS policy, emergency status, notification channels
router.get("/production-report", async (_req: AuthenticatedRequest, res) => {
  const f2s = getCachedConfig("fast2sms");
  const extra = f2s.extra || {};
  const globalSender = extra.sender_id || "ABURHA";
  const apiKey = f2s.apiKey || process.env.FAST2SMS_API_KEY || "";
  const emergencyEnabled = extra.emergency_sms_fallback_enabled === "1";

  // Approved sender IDs
  const senderRows = await pool.query(
    `SELECT sender_id, status, global_status FROM sender_ids WHERE status = 'active'`
  ).catch(() => ({ rows: [] }));
  const approvedIds = senderRows.rows.map((r: any) => r.sender_id);

  const SMS_EVENTS = [
    { event: "otp",                  label: "OTP — Login / Registration",   tidKey: "otp_template_id",          senderKey: "otp_sender" },
    { event: "forgot_password_otp",  label: "OTP — Forgot Password",        tidKey: "forgot_password_otp_tid",  senderKey: "forgot_password_otp_sender" },
    { event: "booking_created",      label: "Booking Received",             tidKey: "booking_created_tid",      senderKey: "booking_created_sender" },
    { event: "booking_approved",     label: "Booking Approved / Confirmed", tidKey: "booking_confirmed_tid",    senderKey: "booking_confirmed_sender" },
    { event: "booking_rejected",     label: "Booking Rejected",             tidKey: "booking_rejected_tid",     senderKey: "booking_rejected_sender" },
    { event: "payment_received",     label: "Full Payment Received",        tidKey: "payment_received_tid",     senderKey: "payment_received_sender" },
    { event: "partial_payment",      label: "Partial Payment",              tidKey: "partial_payment_tid",      senderKey: "partial_payment_sender" },
    { event: "invoice_generated",    label: "Invoice Generated",            tidKey: "invoice_created_tid",      senderKey: "invoice_created_sender" },
    { event: "agreement_signed",     label: "Agreement Signed",             tidKey: "agreement_signed_tid",     senderKey: "agreement_signed_sender" },
    { event: "payment_due",          label: "Payment Reminder",             tidKey: "pending_payment_tid",      senderKey: "pending_payment_sender" },
    { event: "ticket_issued",        label: "Flight Ticket Issued",         tidKey: "ticket_issued_tid",        senderKey: "ticket_issued_sender" },
    { event: "visa_ready",           label: "Visa Issued",                  tidKey: "visa_issued_tid",          senderKey: "visa_issued_sender" },
    { event: "hotel_voucher",        label: "Hotel Voucher Issued",         tidKey: "hotel_voucher_issued_tid", senderKey: "hotel_voucher_sender" },
    { event: "departure_reminder",   label: "Departure Reminder",           tidKey: "departure_reminder_tid",   senderKey: "departure_reminder_sender" },
    { event: "arrival_reminder",     label: "Arrival Reminder",             tidKey: "arrival_reminder_tid",     senderKey: "arrival_reminder_sender" },
    { event: "welcome_saudi_arabia", label: "Welcome to Saudi Arabia",      tidKey: "welcome_saudi_arabia_tid", senderKey: "welcome_saudi_arabia_sender" },
    { event: "return_reminder",      label: "Return Reminder",              tidKey: "return_reminder_tid",      senderKey: "return_reminder_sender" },
  ];

  // Per-event delivery stats from notification_logs (all time)
  const eventStatsRows = await pool.query(`
    SELECT
      event_type,
      channel,
      MAX(CASE WHEN status='sent' THEN sent_at END) AS last_sent,
      MAX(CASE WHEN status='failed' THEN sent_at END) AS last_failed,
      COUNT(*) FILTER (WHERE status='sent') AS total_sent,
      COUNT(*) FILTER (WHERE status='failed') AS total_failed
    FROM notification_logs
    WHERE event_type = ANY($1)
    GROUP BY event_type, channel
  `, [SMS_EVENTS.map(e => e.event)]).catch(() => ({ rows: [] }));

  // Index stats by event_type and channel
  const eventStats: Record<string, Record<string, any>> = {};
  for (const r of eventStatsRows.rows) {
    if (!eventStats[r.event_type]) eventStats[r.event_type] = {};
    eventStats[r.event_type][r.channel] = r;
  }

  const smsEvents = SMS_EVENTS.map(ev => {
    const tid = extra[ev.tidKey] || "";
    const senderId = extra[ev.senderKey] || globalSender;
    const smsStat = eventStats[ev.event]?.sms;
    const waStat = eventStats[ev.event]?.whatsapp;
    const emailStat = eventStats[ev.event]?.email;
    return {
      event: ev.event,
      label: ev.label,
      templateConfigured: !!tid,
      templateId: tid || null,
      senderId,
      route: "dlt",
      sms: smsStat ? { lastSent: smsStat.last_sent, lastFailed: smsStat.last_failed, totalSent: Number(smsStat.total_sent), totalFailed: Number(smsStat.total_failed) } : null,
      whatsapp: waStat ? { lastSent: waStat.last_sent, lastFailed: waStat.last_failed, totalSent: Number(waStat.total_sent), totalFailed: Number(waStat.total_failed) } : null,
      email: emailStat ? { lastSent: emailStat.last_sent, lastFailed: emailStat.last_failed, totalSent: Number(emailStat.total_sent), totalFailed: Number(emailStat.total_failed) } : null,
    };
  });
  const smsConfigured = smsEvents.filter(e => e.templateConfigured).length;

  // Check WhatsApp config (BotBee)
  const bb = getCachedConfig("botbee");
  const waEnabled = !!(bb?.apiKey || process.env.BOTBEE_API_KEY);

  // Check Email config (SMTP)
  const smtpConf = getCachedConfig("smtp");
  const emailEnabled = !!(smtpConf?.enabled && (smtpConf?.host || process.env.SMTP_HOST));

  // Recent notification stats (last 24h)
  const statsRow = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE channel='sms' AND status='sent' AND sent_at > NOW()-INTERVAL '24h') AS sms_sent,
      COUNT(*) FILTER (WHERE channel='sms' AND status='failed' AND sent_at > NOW()-INTERVAL '24h') AS sms_failed,
      COUNT(*) FILTER (WHERE channel='whatsapp' AND status='sent' AND sent_at > NOW()-INTERVAL '24h') AS wa_sent,
      COUNT(*) FILTER (WHERE channel='email' AND status='sent' AND sent_at > NOW()-INTERVAL '24h') AS email_sent,
      COUNT(*) FILTER (WHERE provider_response::text ILIKE '%quick_route_emergency%' AND sent_at > NOW()-INTERVAL '24h') AS emergency_sms_count
    FROM notification_logs
  `).catch(() => ({ rows: [{}] }));
  const stats = statsRow.rows[0] || {};

  const checks = [
    { id: "dlt_primary",       label: "DLT Route is Primary SMS Route",       pass: true,            detail: "route=dlt is hardcoded; quick route never fires automatically" },
    { id: "emergency_off",     label: "Emergency Fallback OFF by Default",     pass: !emergencyEnabled, detail: emergencyEnabled ? `⚠ ENABLED — Reason: ${extra.emergency_reason || "unknown"} by ${extra.emergency_enabled_by || "?"} at ${extra.emergency_enabled_at || "?"}` : "OFF — DLT required for all SMS" },
    { id: "api_key",           label: "Fast2SMS API Key Configured",           pass: !!apiKey,        detail: apiKey ? `Key length: ${apiKey.length}` : "Missing — SMS will not send" },
    { id: "global_sender",     label: "Global Sender ID Set",                  pass: !!globalSender && approvedIds.includes(globalSender), detail: `${globalSender} — ${approvedIds.includes(globalSender) ? "Active & Approved" : "Not in approved list"}` },
    { id: "sms_templates",     label: `DLT Templates Configured (${smsConfigured}/${SMS_EVENTS.length})`, pass: smsConfigured === SMS_EVENTS.length, detail: smsConfigured === SMS_EVENTS.length ? "All events have template IDs" : `${SMS_EVENTS.length - smsConfigured} events missing template IDs` },
    { id: "whatsapp",          label: "WhatsApp Channel (BotBee)",             pass: waEnabled,       detail: waEnabled ? "API key configured" : "BotBee API key not set" },
    { id: "email",             label: "Email Channel (SMTP)",                  pass: emailEnabled,    detail: emailEnabled ? `Host: ${smtpConf?.host || process.env.SMTP_HOST}` : "SMTP not configured" },
    { id: "no_emergency_usage",label: "No Emergency SMS in Last 24h",          pass: Number(stats.emergency_sms_count || 0) === 0, detail: Number(stats.emergency_sms_count || 0) === 0 ? "All SMS sent via DLT route" : `⚠ ${stats.emergency_sms_count} emergency SMS sent` },
  ];

  const passed = checks.filter(c => c.pass).length;
  const productionReady = passed === checks.length;

  res.json({
    ok: productionReady,
    productionReady,
    generatedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed,
      failed: checks.length - passed,
      score: Math.round((passed / checks.length) * 100),
    },
    policy: {
      primaryRoute: "dlt",
      emergencyFallbackDefault: "OFF",
      quickRouteAutomatic: false,
      quickRouteRequires: "Super Admin explicit enable with reason, IP, device logged",
    },
    emergencyStatus: {
      enabled: emergencyEnabled,
      reason: extra.emergency_reason || null,
      enabledBy: extra.emergency_enabled_by || null,
      enabledAt: extra.emergency_enabled_at || null,
      enabledIp: extra.emergency_enabled_ip || null,
      enabledDevice: extra.emergency_enabled_ua || null,
    },
    smsConfig: {
      apiKeyConfigured: !!apiKey,
      globalSenderId: globalSender,
      approvedSenderIds: approvedIds,
      templatesCoverage: { configured: smsConfigured, total: SMS_EVENTS.length },
      events: smsEvents,
    },
    channels: {
      sms: { enabled: !!apiKey && f2s.enabled !== false, route: "dlt", last24h: { sent: Number(stats.sms_sent || 0), failed: Number(stats.sms_failed || 0), emergency: Number(stats.emergency_sms_count || 0) } },
      whatsapp: { enabled: waEnabled, provider: "BotBee", last24h: { sent: Number(stats.wa_sent || 0) } },
      email: { enabled: emailEnabled, provider: "SMTP", last24h: { sent: Number(stats.email_sent || 0) } },
    },
    checks,
  });
});

// ── POST /api/sms-settings/production-test ───────────────────────────────────
// Fire a real DLT SMS test for a specific event using its configured template + sender.
// Logs to notification_logs. Returns full provider response for verification.
router.post("/production-test", async (req: AuthenticatedRequest, res) => {
  const { event, mobile, variables } = req.body || {};
  if (!event || !mobile) {
    return void res.status(400).json({ ok: false, error: "event and mobile are required" });
  }

  const phone = toPhone(String(mobile));
  if (phone.length !== 10) {
    return void res.status(400).json({ ok: false, error: "Invalid mobile — must be 10 digits" });
  }

  const f2s = getCachedConfig("fast2sms");
  const extra = f2s.extra || {};
  const apiKey = f2s.apiKey || process.env.FAST2SMS_API_KEY || "";
  if (!apiKey) return void res.status(400).json({ ok: false, error: "Fast2SMS API key not configured" });

  const globalSender = extra.sender_id || "ALBURH";

  // Event → tidKey + senderKey map
  const EVENT_MAP: Record<string, { tidKey: string; senderKey: string; label: string }> = {
    otp:                  { tidKey: "otp_template_id",          senderKey: "otp_sender",                label: "OTP — Login / Registration" },
    forgot_password_otp:  { tidKey: "forgot_password_otp_tid",  senderKey: "forgot_password_otp_sender", label: "OTP — Forgot Password" },
    booking_created:      { tidKey: "booking_created_tid",      senderKey: "booking_created_sender",     label: "Booking Received" },
    booking_approved:     { tidKey: "booking_confirmed_tid",    senderKey: "booking_confirmed_sender",   label: "Booking Approved" },
    booking_rejected:     { tidKey: "booking_rejected_tid",     senderKey: "booking_rejected_sender",   label: "Booking Rejected" },
    payment_received:     { tidKey: "payment_received_tid",     senderKey: "payment_received_sender",   label: "Full Payment Received" },
    partial_payment:      { tidKey: "partial_payment_tid",      senderKey: "partial_payment_sender",    label: "Partial Payment" },
    invoice_generated:    { tidKey: "invoice_created_tid",      senderKey: "invoice_created_sender",    label: "Invoice Generated" },
    agreement_signed:     { tidKey: "agreement_signed_tid",     senderKey: "agreement_signed_sender",   label: "Agreement Signed" },
    payment_due:          { tidKey: "pending_payment_tid",      senderKey: "pending_payment_sender",    label: "Payment Reminder" },
    ticket_issued:        { tidKey: "ticket_issued_tid",        senderKey: "ticket_issued_sender",      label: "Flight Ticket Issued" },
    visa_ready:           { tidKey: "visa_issued_tid",          senderKey: "visa_issued_sender",        label: "Visa Issued" },
    hotel_voucher:        { tidKey: "hotel_voucher_issued_tid", senderKey: "hotel_voucher_sender",      label: "Hotel Voucher Issued" },
    departure_reminder:   { tidKey: "departure_reminder_tid",  senderKey: "departure_reminder_sender", label: "Departure Reminder" },
    arrival_reminder:     { tidKey: "arrival_reminder_tid",    senderKey: "arrival_reminder_sender",   label: "Arrival Reminder" },
    welcome_saudi_arabia: { tidKey: "welcome_saudi_arabia_tid",senderKey: "welcome_saudi_arabia_sender",label: "Welcome to Saudi Arabia" },
    return_reminder:      { tidKey: "return_reminder_tid",     senderKey: "return_reminder_sender",    label: "Return Reminder" },
  };

  const ev = EVENT_MAP[event];
  if (!ev) return void res.status(400).json({ ok: false, error: `Unknown event type: "${event}"` });

  const templateId = extra[ev.tidKey] || "";
  const senderId = extra[ev.senderKey] || globalSender;

  if (!templateId) {
    return void res.json({
      ok: false,
      event,
      label: ev.label,
      templateId: null,
      senderId,
      route: "dlt",
      mobile: phone,
      status: "SKIPPED",
      reason: `DLT Template not configured for "${event}". Set ${ev.tidKey} in DLT Template Manager.`,
      sentAt: null,
    });
  }

  const varsEncoded = Array.isArray(variables) && variables.length
    ? encodeURIComponent(variables.join("|") + "|")
    : encodeURIComponent("Al Burhan|TEST|Production Test|");

  const endpoint = "https://www.fast2sms.com/dev/bulkV2";
  const url = `${endpoint}?authorization=${apiKey}&route=dlt&sender_id=${senderId}&message=${templateId}&variables_values=${varsEncoded}&numbers=${phone}&flash=0`;
  const maskedUrl = url.replace(apiKey, `${apiKey.slice(0, 6)}***`);
  const startMs = Date.now();
  const sentAt = new Date().toISOString();
  const adminName = (req as any).user?.name || (req as any).user?.email || "admin";

  try {
    const resp = await axios.get(url, { timeout: 15000 });
    const ok = resp.data?.return === true;
    const durationMs = Date.now() - startMs;
    const messageId: string | null = resp.data?.request_id || null;
    const providerMsg: string = Array.isArray(resp.data?.message) ? resp.data.message.join("; ") : (resp.data?.message || "");

    // Log to notification_logs permanently
    const logId = `ptest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response,
        provider_name, api_endpoint, http_status, request_payload,
        sent_at, retry_count, sender_id, wamid, customer_name)
       VALUES ($1,$2,'sms',$3,$4,$5,$6,'Fast2SMS',$7,$8,$9,NOW(),0,$10,$11,$12)`,
      [
        logId, event, phone,
        `[PRODUCTION TEST] ${ev.label}`,
        ok ? "sent" : "failed",
        JSON.stringify({ ok, templateId, senderId, response: resp.data, route: "dlt", test: true, testedBy: adminName }),
        endpoint,
        resp.status,
        JSON.stringify({ mobile: phone, template_id: templateId, sender_id: senderId, route: "dlt", test: true }),
        senderId,
        messageId,
        `[TEST] by ${adminName}`,
      ]
    ).catch(() => {});

    res.json({
      ok,
      event,
      label: ev.label,
      templateId,
      senderId,
      route: "dlt",
      mobile: phone,
      status: ok ? "DELIVERED" : "FAILED",
      messageId,
      sentAt,
      durationMs,
      httpStatus: resp.status,
      providerResponse: resp.data,
      providerMessage: providerMsg,
      requestUrl: maskedUrl,
      logId,
      testedBy: adminName,
      validations: {
        templateConfigured: true,
        senderIdSet: true,
        routeDlt: true,
        noFallback: true,
        apiKeyPresent: true,
      },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startMs;
    const resp = err?.response;
    const logId = `ptest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const errMsg = resp?.data?.message || err.message;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response,
        provider_name, api_endpoint, http_status, request_payload,
        sent_at, retry_count, sender_id, customer_name)
       VALUES ($1,$2,'sms',$3,$4,'failed',$5,'Fast2SMS',$6,$7,$8,NOW(),0,$9,$10)`,
      [
        logId, event, phone,
        `[PRODUCTION TEST] ${ev.label}`,
        JSON.stringify({ ok: false, templateId, senderId, error: errMsg, route: "dlt", test: true, testedBy: adminName }),
        endpoint,
        resp?.status || 0,
        JSON.stringify({ mobile: phone, template_id: templateId, sender_id: senderId, route: "dlt", test: true }),
        senderId,
        `[TEST] by ${adminName}`,
      ]
    ).catch(() => {});

    res.json({
      ok: false,
      event,
      label: ev.label,
      templateId,
      senderId,
      route: "dlt",
      mobile: phone,
      status: "FAILED",
      messageId: null,
      sentAt,
      durationMs,
      httpStatus: resp?.status || 0,
      providerResponse: resp?.data || { error: err.message },
      providerMessage: errMsg,
      requestUrl: maskedUrl,
      logId,
      testedBy: adminName,
    });
  }
});

export default router;
