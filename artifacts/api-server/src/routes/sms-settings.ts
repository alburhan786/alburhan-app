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
    { event: "otp",               label: "OTP (Login)",              tidKey: "otp_template_id",         senderKey: "otp_sender" },
    { event: "booking_created",   label: "Booking Received",         tidKey: "booking_created_tid",     senderKey: "booking_created_sender" },
    { event: "booking_approved",  label: "Booking Approved",         tidKey: "booking_confirmed_tid",   senderKey: "booking_confirmed_sender" },
    { event: "booking_rejected",  label: "Booking Rejected",         tidKey: "booking_rejected_tid",    senderKey: "booking_rejected_sender" },
    { event: "payment_received",  label: "Payment Received",         tidKey: "payment_received_tid",    senderKey: "payment_received_sender" },
    { event: "partial_payment",   label: "Partial Payment",          tidKey: "partial_payment_tid",     senderKey: "partial_payment_sender" },
    { event: "invoice_generated", label: "Invoice Ready",            tidKey: "invoice_created_tid",     senderKey: "invoice_created_sender" },
    { event: "payment_due",       label: "Payment Reminder",         tidKey: "pending_payment_tid",     senderKey: "pending_payment_sender" },
    { event: "ticket_issued",     label: "Flight Ticket Issued",     tidKey: "ticket_issued_tid",       senderKey: "ticket_issued_sender" },
    { event: "visa_ready",        label: "Visa Issued",              tidKey: "visa_issued_tid",         senderKey: "visa_issued_sender" },
    { event: "hotel_voucher",     label: "Hotel Voucher Ready",      tidKey: "hotel_voucher_issued_tid",senderKey: "hotel_voucher_sender" },
    { event: "departure_reminder",label: "Departure Reminder",       tidKey: "departure_reminder_tid",  senderKey: "departure_reminder_sender" },
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

export default router;
