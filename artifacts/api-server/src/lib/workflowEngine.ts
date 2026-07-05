import { pool } from "@workspace/db";
import { fireNotificationEvent, type NotificationContext } from "./notificationEngine.js";

export type WorkflowTrigger =
  | "new_booking" | "booking_approved" | "booking_rejected"
  | "payment_received"
  | "payment_reminder_30" | "payment_reminder_15" | "payment_reminder_7"
  | "payment_reminder_3" | "payment_reminder_1"
  | "passport_uploaded"
  | "visa_approved" | "visa_rejected"
  | "flight_assigned" | "hotel_assigned" | "bus_assigned"
  | "departure_reminder_7d" | "departure_reminder_3d" | "departure_reminder_1d"
  | "departure_reminder_12h" | "departure_reminder_6h"
  | "return_reminder" | "feedback_request"
  | "document_expiry_90" | "document_expiry_60"
  | "document_expiry_30" | "document_expiry_7"
  | "medical_emergency";

export interface WorkflowContext extends NotificationContext {
  bookingId?: string;
  bookingNumber?: string;
  customerId?: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  packageName?: string;
  amount?: number;
  balance?: number;
  groupName?: string;
  pilgramName?: string;
  roomNumber?: string;
  hotelName?: string;
  busNumber?: string;
  flightNumber?: string;
  departureDate?: string;
  visaStatus?: string;
  documentType?: string;
  expiryDate?: string;
  severity?: string;
  [key: string]: unknown;
}

const TRIGGER_TO_EVENT: Record<string, string> = {
  new_booking: "new_booking",
  booking_approved: "booking_approved",
  booking_rejected: "booking_cancelled",
  payment_received: "payment_received",
  payment_reminder_30: "payment_reminder",
  payment_reminder_15: "payment_reminder",
  payment_reminder_7: "payment_reminder",
  payment_reminder_3: "payment_reminder",
  payment_reminder_1: "payment_reminder",
  passport_uploaded: "document_uploaded",
  visa_approved: "visa_approved",
  visa_rejected: "visa_rejected",
  flight_assigned: "flight_assigned",
  hotel_assigned: "room_assigned",
  bus_assigned: "bus_assigned",
  departure_reminder_7d: "departure_reminder",
  departure_reminder_3d: "departure_reminder",
  departure_reminder_1d: "departure_reminder",
  departure_reminder_12h: "departure_reminder",
  departure_reminder_6h: "departure_reminder",
  return_reminder: "return_flight",
  feedback_request: "feedback_request",
  document_expiry_90: "document_expiry",
  document_expiry_60: "document_expiry",
  document_expiry_30: "document_expiry",
  document_expiry_7: "document_expiry",
  medical_emergency: "medical_emergency",
};

const ADMIN_EVENT_TRIGGERS = new Set([
  "new_booking", "payment_received", "medical_emergency",
  "visa_approved", "visa_rejected", "booking_approved", "booking_rejected",
]);

const TIMELINE_LABELS: Record<string, { icon: string; title: string }> = {
  new_booking: { icon: "📋", title: "Booking Submitted" },
  booking_approved: { icon: "✅", title: "Booking Approved" },
  booking_rejected: { icon: "❌", title: "Booking Rejected" },
  payment_received: { icon: "💰", title: "Payment Received" },
  payment_reminder_30: { icon: "🔔", title: "Payment Reminder (30 Days)" },
  payment_reminder_15: { icon: "🔔", title: "Payment Reminder (15 Days)" },
  payment_reminder_7: { icon: "⚠️", title: "Payment Reminder (7 Days)" },
  payment_reminder_3: { icon: "⚠️", title: "Payment Reminder (3 Days)" },
  payment_reminder_1: { icon: "🚨", title: "Payment Reminder (1 Day)" },
  passport_uploaded: { icon: "📄", title: "Passport Uploaded" },
  visa_approved: { icon: "🛂", title: "Visa Approved" },
  visa_rejected: { icon: "🚫", title: "Visa Rejected" },
  flight_assigned: { icon: "✈️", title: "Flight Assigned" },
  hotel_assigned: { icon: "🏨", title: "Room Assigned" },
  bus_assigned: { icon: "🚌", title: "Bus Assigned" },
  departure_reminder_7d: { icon: "⏰", title: "Departure in 7 Days" },
  departure_reminder_3d: { icon: "⏰", title: "Departure in 3 Days" },
  departure_reminder_1d: { icon: "⏰", title: "Departure Tomorrow" },
  departure_reminder_12h: { icon: "🔔", title: "Departure in 12 Hours" },
  departure_reminder_6h: { icon: "🔔", title: "Departure in 6 Hours" },
  return_reminder: { icon: "🏠", title: "Return Journey Details" },
  feedback_request: { icon: "⭐", title: "Feedback Requested" },
  document_expiry_90: { icon: "📅", title: "Document Expiry (90 Days)" },
  document_expiry_60: { icon: "📅", title: "Document Expiry (60 Days)" },
  document_expiry_30: { icon: "📅", title: "Document Expiry (30 Days)" },
  document_expiry_7: { icon: "🚨", title: "Document Expiry (7 Days)" },
  medical_emergency: { icon: "🚑", title: "Medical Emergency" },
};

async function getRuleEnabled(triggerType: string): Promise<boolean> {
  try {
    const result = await pool.query(
      "SELECT enabled FROM workflow_rules WHERE trigger_type = $1 LIMIT 1",
      [triggerType]
    );
    if (!result.rows[0]) return true;
    return result.rows[0].enabled === true;
  } catch {
    return true;
  }
}

async function logWorkflow(data: {
  triggerType: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  status: "running" | "completed" | "failed" | "skipped";
  errorMessage?: string;
  executionTimeMs?: number;
  context?: Record<string, unknown>;
}): Promise<number | null> {
  try {
    const result = await pool.query(
      `INSERT INTO workflow_logs
        (trigger_type, booking_id, customer_id, customer_name, status, error_message, execution_time_ms, context, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [
        data.triggerType,
        data.bookingId ?? null,
        data.customerId ?? null,
        data.customerName ?? null,
        data.status,
        data.errorMessage ?? null,
        data.executionTimeMs ?? null,
        data.context ? JSON.stringify(data.context) : null,
      ]
    );
    return result.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function updateLog(id: number, status: "completed" | "failed", errorMessage?: string, executionTimeMs?: number) {
  try {
    await pool.query(
      `UPDATE workflow_logs SET status=$1, error_message=$2, execution_time_ms=$3, completed_at=NOW() WHERE id=$4`,
      [status, errorMessage ?? null, executionTimeMs ?? null, id]
    );
  } catch {}
}

export async function addTimeline(data: {
  customerId?: string;
  bookingId?: string;
  eventType: string;
  title?: string;
  description?: string;
  icon?: string;
}) {
  try {
    const label = TIMELINE_LABELS[data.eventType];
    await pool.query(
      `INSERT INTO customer_timeline (customer_id, booking_id, event_type, title, description, icon, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        data.customerId ?? null,
        data.bookingId ?? null,
        data.eventType,
        data.title ?? label?.title ?? data.eventType,
        data.description ?? null,
        data.icon ?? label?.icon ?? "📌",
      ]
    );
  } catch {}
}

async function createAdminEvent(data: {
  eventType: string;
  title: string;
  description?: string;
  bookingId?: string;
  customerName?: string;
  severity?: "info" | "warning" | "error" | "success";
}) {
  try {
    await pool.query(
      `INSERT INTO admin_events (event_type, title, description, booking_id, customer_name, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        data.eventType,
        data.title,
        data.description ?? null,
        data.bookingId ?? null,
        data.customerName ?? null,
        data.severity ?? "info",
      ]
    );
  } catch {}
}

export async function triggerWorkflow(
  triggerType: WorkflowTrigger,
  ctx: WorkflowContext
): Promise<void> {
  const start = Date.now();

  const enabled = await getRuleEnabled(triggerType);
  if (!enabled) {
    await logWorkflow({ triggerType, bookingId: ctx.bookingId, customerId: ctx.customerId, customerName: ctx.customerName, status: "skipped" });
    return;
  }

  const logId = await logWorkflow({
    triggerType,
    bookingId: ctx.bookingId,
    customerId: ctx.customerId,
    customerName: ctx.customerName,
    status: "running",
    context: ctx as Record<string, unknown>,
  });

  try {
    const eventType = TRIGGER_TO_EVENT[triggerType];
    if (eventType && ctx.customerMobile) {
      await fireNotificationEvent(eventType as any, ctx.customerMobile, ctx);
    }

    const ms = Date.now() - start;
    if (logId) await updateLog(logId, "completed", undefined, ms);

    await addTimeline({
      customerId: ctx.customerId,
      bookingId: ctx.bookingId,
      eventType: triggerType,
      description: ctx.customerName ? `Notification sent to ${ctx.customerName}` : undefined,
    });

    if (ADMIN_EVENT_TRIGGERS.has(triggerType)) {
      const label = TIMELINE_LABELS[triggerType];
      await createAdminEvent({
        eventType: triggerType,
        title: label?.title ?? triggerType,
        description: ctx.customerName
          ? `${ctx.customerName}${ctx.bookingNumber ? ` — Booking #${ctx.bookingNumber}` : ""}${ctx.amount ? ` — ₹${ctx.amount.toLocaleString("en-IN")}` : ""}`
          : undefined,
        bookingId: ctx.bookingId,
        customerName: ctx.customerName,
        severity:
          triggerType === "medical_emergency" ? "error"
          : triggerType === "payment_received" ? "success"
          : triggerType === "new_booking" ? "info"
          : "info",
      });
    }
  } catch (err: any) {
    const ms = Date.now() - start;
    if (logId) await updateLog(logId, "failed", String(err?.message ?? err), ms);
  }
}

export async function retryWorkflowLog(logId: number): Promise<{ success: boolean; message: string }> {
  try {
    const result = await pool.query(
      `SELECT * FROM workflow_logs WHERE id = $1`,
      [logId]
    );
    const log = result.rows[0];
    if (!log) return { success: false, message: "Log not found" };
    if (log.retry_count >= 3) return { success: false, message: "Max retries (3) reached" };

    await pool.query(
      `UPDATE workflow_logs SET retry_count = retry_count + 1, status = 'running', error_message = NULL, completed_at = NULL WHERE id = $1`,
      [logId]
    );

    const ctx: WorkflowContext = log.context ?? {};
    const eventType = TRIGGER_TO_EVENT[log.trigger_type as string];
    const start = Date.now();
    try {
      if (eventType && ctx.customerMobile) {
        await fireNotificationEvent(eventType as any, ctx.customerMobile as string, ctx);
      }
      const ms = Date.now() - start;
      await pool.query(
        `UPDATE workflow_logs SET status='completed', execution_time_ms=$1, completed_at=NOW() WHERE id=$2`,
        [ms, logId]
      );
      return { success: true, message: "Workflow retried successfully" };
    } catch (err: any) {
      const ms = Date.now() - start;
      await pool.query(
        `UPDATE workflow_logs SET status='failed', error_message=$1, execution_time_ms=$2, completed_at=NOW() WHERE id=$3`,
        [String(err?.message ?? err), ms, logId]
      );
      return { success: false, message: String(err?.message ?? err) };
    }
  } catch (err: any) {
    return { success: false, message: String(err?.message ?? err) };
  }
}

export function startDepartureReminderCron() {
  const TRIGGERS: Array<{ trigger: WorkflowTrigger; hoursAhead: number }> = [
    { trigger: "departure_reminder_7d", hoursAhead: 7 * 24 },
    { trigger: "departure_reminder_3d", hoursAhead: 3 * 24 },
    { trigger: "departure_reminder_1d", hoursAhead: 24 },
    { trigger: "departure_reminder_12h", hoursAhead: 12 },
    { trigger: "departure_reminder_6h", hoursAhead: 6 },
  ];

  const run = async () => {
    for (const { trigger, hoursAhead } of TRIGGERS) {
      const enabled = await getRuleEnabled(trigger);
      if (!enabled) continue;
      try {
        const res = await pool.query(`
          SELECT p.name, p.mobile, p.booking_id, b.booking_number, b.customer_name, b.customer_mobile,
                 gf.flight_number, gf.departure_date
          FROM pilgrims p
          JOIN bookings b ON b.id = p.booking_id
          JOIN hajj_groups hg ON hg.id = p.group_id
          JOIN group_flights gf ON gf.group_id = hg.id
          WHERE gf.departure_date IS NOT NULL
            AND gf.departure_date::timestamptz BETWEEN NOW() + interval '${hoursAhead - 1} hours'
            AND NOW() + interval '${hoursAhead + 1} hours'
            AND b.status = 'approved'
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow(trigger, {
            bookingId: row.booking_id,
            bookingNumber: row.booking_number,
            customerName: row.customer_name,
            customerMobile: row.customer_mobile,
            flightNumber: row.flight_number,
            departureDate: row.departure_date,
            pilgramName: row.name,
          });
        }
      } catch {}
    }
  };

  const schedule = () => {
    const next = 60 * 60 * 1000;
    setTimeout(() => { run().catch(() => {}); schedule(); }, next);
  };
  run().catch(() => {});
  schedule();
  console.log("[DepartureReminder] Cron scheduled: hourly checks");
}

export function startDocumentExpiryCron() {
  const TRIGGERS: Array<{ trigger: WorkflowTrigger; daysAhead: number }> = [
    { trigger: "document_expiry_90", daysAhead: 90 },
    { trigger: "document_expiry_60", daysAhead: 60 },
    { trigger: "document_expiry_30", daysAhead: 30 },
    { trigger: "document_expiry_7", daysAhead: 7 },
  ];

  const run = async () => {
    for (const { trigger, daysAhead } of TRIGGERS) {
      const enabled = await getRuleEnabled(trigger);
      if (!enabled) continue;
      try {
        const res = await pool.query(`
          SELECT p.name, p.mobile, p.booking_id, p.passport_expiry, p.visa_expiry,
                 b.booking_number, b.customer_name, b.customer_mobile
          FROM pilgrims p
          JOIN bookings b ON b.id = p.booking_id
          WHERE (
            p.passport_expiry::date = (CURRENT_DATE + interval '${daysAhead} days')::date
            OR p.visa_expiry::date = (CURRENT_DATE + interval '${daysAhead} days')::date
          )
          LIMIT 100
        `);
        for (const row of res.rows) {
          const docType = row.passport_expiry ? "Passport" : "Visa";
          const expiryDate = row.passport_expiry ?? row.visa_expiry;
          await triggerWorkflow(trigger, {
            bookingId: row.booking_id,
            bookingNumber: row.booking_number,
            customerName: row.customer_name,
            customerMobile: row.customer_mobile,
            pilgramName: row.name,
            documentType: docType,
            expiryDate,
          });
        }
      } catch {}
    }
  };

  const scheduleMidnight = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(() => { run().catch(() => {}); scheduleMidnight(); }, next.getTime() - now.getTime());
  };
  scheduleMidnight();
  console.log("[DocumentExpiry] Cron scheduled: daily at 07:30 IST");
}

export function startReturnAndFeedbackCron() {
  const run = async () => {
    const returnEnabled = await getRuleEnabled("return_reminder");
    const feedbackEnabled = await getRuleEnabled("feedback_request");

    if (returnEnabled) {
      try {
        const res = await pool.query(`
          SELECT p.name, p.mobile, p.booking_id, b.booking_number, b.customer_name, b.customer_mobile,
                 gf.return_date, gf.flight_number
          FROM pilgrims p
          JOIN bookings b ON b.id = p.booking_id
          JOIN hajj_groups hg ON hg.id = p.group_id
          JOIN group_flights gf ON gf.group_id = hg.id
          WHERE gf.return_date::date = CURRENT_DATE
            AND b.status = 'approved'
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow("return_reminder", {
            bookingId: row.booking_id,
            bookingNumber: row.booking_number,
            customerName: row.customer_name,
            customerMobile: row.customer_mobile,
            flightNumber: row.flight_number,
            departureDate: row.return_date,
            pilgramName: row.name,
          });
        }
      } catch {}
    }

    if (feedbackEnabled) {
      try {
        const res = await pool.query(`
          SELECT p.name, p.mobile, p.booking_id, b.booking_number, b.customer_name, b.customer_mobile
          FROM pilgrims p
          JOIN bookings b ON b.id = p.booking_id
          JOIN hajj_groups hg ON hg.id = p.group_id
          JOIN group_flights gf ON gf.group_id = hg.id
          WHERE gf.return_date::date = (CURRENT_DATE - interval '3 days')::date
            AND b.status = 'approved'
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow("feedback_request", {
            bookingId: row.booking_id,
            bookingNumber: row.booking_number,
            customerName: row.customer_name,
            customerMobile: row.customer_mobile,
            pilgramName: row.name,
          });
        }
      } catch {}
    }
  };

  const scheduleMorning = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(4, 30, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(() => { run().catch(() => {}); scheduleMorning(); }, next.getTime() - now.getTime());
  };
  scheduleMorning();
  console.log("[ReturnFeedback] Cron scheduled: daily at 10:00 IST");
}
