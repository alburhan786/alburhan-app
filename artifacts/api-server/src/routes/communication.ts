import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { getCachedConfig } from "../lib/apiSettingsProvider.js";

const router = Router();
router.use(requireAdmin as any);

// ── Export logs as CSV ───────────────────────────────────────────────────────
router.get("/logs/export", async (req, res) => {
  try {
    const { bookingId, customer, channel, status } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (bookingId) { conditions.push(`booking_id = $${idx++}`); params.push(bookingId); }
    if (customer) { conditions.push(`recipient ILIKE $${idx++}`); params.push(`%${customer}%`); }
    if (channel) { conditions.push(`channel = $${idx++}`); params.push(channel); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await pool.query(
      `SELECT nl.event_type, b.booking_number, nl.recipient, nl.channel,
              nl.status, nl.provider_response, nl.sent_at, nl.retry_count, nl.created_at
       FROM notification_logs nl
       LEFT JOIN bookings b ON b.id = nl.booking_id
       ${where}
       ORDER BY nl.created_at DESC LIMIT 5000`,
      params
    );

    const header = "Event,Booking Number,Recipient,Channel,Status,Error,Timestamp,Retry Count";
    const lines = rows.rows.map(r =>
      [r.event_type, r.booking_number || "", r.recipient, r.channel, r.status,
       (r.status === "failed" ? (r.provider_response?.errorMessage || "") : ""),
       (r.sent_at || r.created_at)?.toISOString?.() || "", r.retry_count]
        .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="notification-logs-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Retry queue view ──────────────────────────────────────────────────────────
router.get("/retry-queue", async (_req, res) => {
  try {
    const rows = await pool.query(
      `SELECT rq.*, b.booking_number, b.customer_name
       FROM notification_retry_queue rq
       LEFT JOIN bookings b ON b.id = rq.booking_id
       WHERE rq.status = 'pending'
       ORDER BY rq.next_retry_at ASC LIMIT 200`
    );
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── System health — live status of every provider/component ────────────────
router.get("/health", async (_req, res) => {
  const checks: Array<{ name: string; status: "online" | "offline"; detail?: string }> = [];

  // BotBee (WhatsApp)
  try {
    const cfg = getCachedConfig("botbee");
    const ok = cfg.enabled !== false && !!(cfg.apiKey || process.env.BOTBEE_API_KEY);
    checks.push({ name: "BotBee (WhatsApp)", status: ok ? "online" : "offline", detail: ok ? "Configured" : "API key missing or disabled" });
  } catch { checks.push({ name: "BotBee (WhatsApp)", status: "offline" }); }

  // Fast2SMS
  try {
    const ok = !!process.env.FAST2SMS_API_KEY;
    checks.push({ name: "Fast2SMS", status: ok ? "online" : "offline", detail: ok ? "Configured" : "API key missing" });
  } catch { checks.push({ name: "Fast2SMS", status: "offline" }); }

  // SMTP
  try {
    const ok = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
    checks.push({ name: "SMTP (Email)", status: ok ? "online" : "offline", detail: ok ? "Configured" : "SMTP credentials missing" });
  } catch { checks.push({ name: "SMTP (Email)", status: "offline" }); }

  // Lemin AI RCS
  try {
    const cfg = getCachedConfig("lemin");
    const ok = cfg.enabled !== false && !!(cfg.apiKey || cfg.extra?.user_id || process.env.LEMIN_USER_ID);
    checks.push({ name: "Lemin AI (RCS)", status: ok ? "online" : "offline", detail: ok ? "Configured" : "Developer API key missing" });
  } catch { checks.push({ name: "Lemin AI (RCS)", status: "offline" }); }

  // Firebase Push
  checks.push({
    name: "Firebase (Push)",
    status: process.env.FIREBASE_SERVICE_ACCOUNT ? "online" : "offline",
    detail: process.env.FIREBASE_SERVICE_ACCOUNT ? "Configured" : "Firebase credentials not configured",
  });

  // Database
  try {
    await pool.query("SELECT 1");
    checks.push({ name: "Database", status: "online" });
  } catch (err: any) {
    checks.push({ name: "Database", status: "offline", detail: err.message });
  }

  // Cron Jobs (process has been up and jobs scheduled at startup)
  checks.push({ name: "Cron Jobs", status: "online", detail: "Scheduled at server startup" });

  // Storage (object storage bucket configured)
  checks.push({
    name: "Storage",
    status: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? "online" : "offline",
    detail: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? "Bucket configured" : "No bucket configured",
  });

  // API (self)
  checks.push({ name: "API", status: "online", detail: "Responding" });

  res.json({ checks, checkedAt: new Date().toISOString() });
});

export default router;
