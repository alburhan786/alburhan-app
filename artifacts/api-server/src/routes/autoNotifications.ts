import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendDocumentToCustomer } from "../lib/documentDelivery.js";
import { runDepartureReminderCheck } from "../lib/workflowEngine.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";

const router = Router();

// ── GET automation settings ───────────────────────────────────────────────────
router.get("/auto-settings", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const { rows } = await pool.query(`SELECT key, value FROM notification_auto_settings ORDER BY key`);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch {
    res.json({});
  }
});

// ── UPDATE automation settings ────────────────────────────────────────────────
router.post("/auto-settings", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  const { key, value } = req.body;
  if (!key || value === undefined) { res.status(400).json({ message: "key and value required" }); return; }
  try {
    await pool.query(
      `INSERT INTO notification_auto_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to save setting" });
  }
});

// ── GET flight reminder stats ─────────────────────────────────────────────────
router.get("/flight-reminder/stats", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const [
      { rows: totalRows },
      { rows: lastRows },
      { rows: upcomingRows },
      { rows: recentLogs },
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS cnt FROM notification_logs WHERE event_type = 'departure_reminder'`),
      pool.query(`SELECT MAX(created_at) AS last_sent FROM notification_logs WHERE event_type = 'departure_reminder'`),
      pool.query(`
        SELECT DISTINCT gf.departure_date, gf.departure_time, gf.flight_number,
               gf.departure_airport, gf.arrival_airport, gf.terminal,
               COUNT(DISTINCT p.booking_id) AS pilgrim_count
        FROM group_flights gf
        JOIN hajj_groups hg ON hg.id = gf.group_id
        JOIN pilgrims p ON p.group_id = hg.id
        JOIN bookings b ON b.id = p.booking_id
        WHERE gf.departure_date IS NOT NULL
          AND gf.departure_date::timestamptz > NOW()
          AND gf.departure_date::timestamptz < NOW() + interval '14 days'
          AND b.status = 'approved'
          AND gf.flight_type = 'outbound'
        GROUP BY gf.departure_date, gf.departure_time, gf.flight_number,
                 gf.departure_airport, gf.arrival_airport, gf.terminal
        ORDER BY gf.departure_date ASC
        LIMIT 10
      `),
      pool.query(`
        SELECT nl.id, nl.channel, nl.status, nl.recipient, nl.created_at, nl.event_type,
               nl.customer_name, nl.booking_number
        FROM notification_logs nl
        WHERE nl.event_type = 'departure_reminder'
        ORDER BY nl.created_at DESC
        LIMIT 30
      `),
    ]);

    res.json({
      total: Number(totalRows[0]?.cnt ?? 0),
      lastSent: lastRows[0]?.last_sent ?? null,
      upcomingFlights: upcomingRows,
      recentLogs,
      schedule: [
        { slot: "7 Days Before",  trigger: "departure_reminder_7d",  hoursAhead: 168 },
        { slot: "3 Days Before",  trigger: "departure_reminder_3d",  hoursAhead: 72  },
        { slot: "2 Days Before",  trigger: "departure_reminder_2d",  hoursAhead: 48  },
        { slot: "1 Day Before",   trigger: "departure_reminder_1d",  hoursAhead: 24  },
        { slot: "12 Hours Before",trigger: "departure_reminder_12h", hoursAhead: 12  },
        { slot: "6 Hours Before", trigger: "departure_reminder_6h",  hoursAhead: 6   },
        { slot: "3 Hours Before", trigger: "departure_reminder_3h",  hoursAhead: 3   },
      ],
    });
  } catch (err: any) {
    console.error("[AutoNotif] flight-reminder/stats error:", err);
    res.status(500).json({ message: err?.message || "Stats error" });
  }
});

// ── POST run flight reminders now ─────────────────────────────────────────────
router.post("/flight-reminder/run-now", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  console.log(`[AutoNotif] Admin ${req.user.id} triggered manual flight-reminder run`);
  try {
    const { processed, skipped } = await runDepartureReminderCheck();
    res.json({
      ok: true,
      processed,
      skipped,
      message: processed > 0
        ? `Sent reminders to ${processed} pilgrim(s). Check notification logs for details.`
        : "No departures found in the reminder windows right now (7d/3d/2d/1d/12h/6h/3h).",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Run failed" });
  }
});

// ── POST send test notification ───────────────────────────────────────────────
router.post("/test-notification", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  const { mobile, channel = "whatsapp" } = req.body;
  if (!mobile) { res.status(400).json({ message: "mobile is required" }); return; }

  try {
    const testCtx = {
      customerName: "Admin Test",
      customerMobile: mobile,
      customerEmail: undefined,
      bookingNumber: "TEST-001",
      packageName: "Hajj/Umrah Package",
    };

    if (channel === "whatsapp") {
      await fireNotificationEvent("custom_admin" as any, {
        ...testCtx,
        description: "This is a test notification from Al Burhan Tours & Travels admin panel. If you received this, WhatsApp notifications are working correctly. Jazak Allah Khair!",
      });
      res.json({ ok: true, message: `Test WhatsApp sent to ${mobile}` });
    } else if (channel === "sms") {
      await fireNotificationEvent("custom_admin" as any, testCtx);
      res.json({ ok: true, message: `Test SMS triggered for ${mobile}` });
    } else {
      await fireNotificationEvent("custom_admin" as any, testCtx);
      res.json({ ok: true, message: `Test notification triggered for ${mobile}` });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message || "Test failed" });
  }
});

// ── GET document notification stats ──────────────────────────────────────────
router.get("/document-notify/stats", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const [
      { rows: totalRows },
      { rows: failedRows },
      { rows: recentLogs },
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS cnt FROM documents WHERE notification_sent = TRUE AND uploaded_by = 'admin'`),
      pool.query(`SELECT COUNT(*) AS cnt FROM documents WHERE notification_sent = FALSE AND uploaded_by = 'admin' AND created_at < NOW() - interval '5 minutes'`),
      pool.query(`
        SELECT nl.id, nl.channel, nl.status, nl.recipient, nl.created_at, nl.event_type,
               nl.customer_name, nl.booking_number
        FROM notification_logs nl
        WHERE nl.event_type = 'document_delivered'
        ORDER BY nl.created_at DESC
        LIMIT 30
      `),
    ]);

    res.json({
      totalSent: Number(totalRows[0]?.cnt ?? 0),
      failedCount: Number(failedRows[0]?.cnt ?? 0),
      recentLogs,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Stats error" });
  }
});

// ── POST retry failed document notifications ──────────────────────────────────
router.post("/document-notify/retry-failed", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const { rows } = await pool.query(`
      SELECT d.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email, b.customer_id AS b_customer_id
      FROM documents d
      JOIN bookings b ON b.id = d.booking_id
      WHERE d.notification_sent = FALSE
        AND d.uploaded_by = 'admin'
        AND d.is_revoked = FALSE
        AND d.created_at < NOW() - interval '5 minutes'
      LIMIT 20
    `);

    res.json({ ok: true, retrying: rows.length, message: `Retrying notifications for ${rows.length} document(s)…` });

    for (const doc of rows) {
      sendDocumentToCustomer({
        docId: doc.id,
        bookingId: doc.booking_id,
        bookingNumber: doc.booking_number,
        customerId: doc.b_customer_id || doc.customer_id || null,
        customerName: doc.customer_name,
        customerMobile: doc.customer_mobile,
        customerEmail: doc.customer_email,
        documentType: doc.document_type,
        fileName: doc.file_name,
        fileUrl: doc.file_url,
        mimeType: doc.mime_type,
      }).catch(err => console.error("[AutoNotif] retry doc error:", err));
    }
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Retry error" });
  }
});

export default router;
