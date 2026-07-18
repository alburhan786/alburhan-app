import { pool } from "@workspace/db";
import { fireNotificationEvent, type NotificationContext } from "./notificationEngine.js";

export type WorkflowTrigger =
  | "new_booking" | "booking_approved" | "booking_rejected" | "booking_completed"
  | "payment_received" | "partial_payment_received"
  | "payment_reminder_30" | "payment_reminder_15" | "payment_reminder_7"
  | "payment_reminder_3" | "payment_reminder_1"
  | "balance_reminder_30" | "balance_reminder_15" | "balance_reminder_7"
  | "balance_reminder_3" | "balance_reminder_1" | "balance_overdue"
  | "passport_uploaded" | "document_reminder"
  | "visa_approved" | "visa_rejected"
  | "invoice_generated" | "agreement_generated" | "agreement_signed"
  | "ticket_issued" | "flight_assigned" | "hotel_assigned" | "bus_assigned"
  | "room_allocation" | "group_orientation"
  | "ziyarat_reminder"
  | "departure_reminder_7d" | "departure_reminder_3d" | "departure_reminder_2d"
  | "departure_reminder_1d" | "departure_reminder_12h" | "departure_reminder_6h"
  | "departure_reminder_3h"
  | "flight_reminder" | "return_flight_reminder"
  | "welcome_saudi" | "arrival_india" | "hajj_mubarak" | "hajj_package_launch"
  | "return_reminder" | "feedback_request"
  | "document_expiry_90" | "document_expiry_60"
  | "document_expiry_30" | "document_expiry_7"
  | "medical_emergency";

export interface WorkflowContext extends Omit<NotificationContext, "customerName"> {
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
  departureTime?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  terminal?: string;
  reportingTime?: string;
  visaStatus?: string;
  documentType?: string;
  expiryDate?: string;
  severity?: string;
  [key: string]: unknown;
}

const TRIGGER_TO_EVENT: Record<string, string> = {
  // Booking
  new_booking:              "new_booking",
  booking_approved:         "booking_approved",
  booking_rejected:         "booking_cancelled",
  booking_completed:        "booking_completed",
  // Payments
  payment_received:         "payment_received",
  partial_payment_received: "partial_payment",
  payment_reminder_30:      "balance_reminder",
  payment_reminder_15:      "balance_reminder",
  payment_reminder_7:       "balance_reminder",
  payment_reminder_3:       "balance_reminder",
  payment_reminder_1:       "balance_reminder",
  balance_reminder_30:      "balance_reminder",
  balance_reminder_15:      "balance_reminder",
  balance_reminder_7:       "balance_reminder",
  balance_reminder_3:       "balance_reminder",
  balance_reminder_1:       "balance_reminder",
  balance_overdue:          "payment_due",
  // Documents
  passport_uploaded:        "passport_uploaded",
  document_reminder:        "passport_uploaded",
  invoice_generated:        "invoice_ready",
  agreement_generated:      "agreement_ready",
  agreement_signed:         "agreement_signed",
  // Visa & Travel
  visa_approved:            "visa_issued",
  visa_rejected:            "visa_rejected",
  ticket_issued:            "ticket_issued",
  flight_assigned:          "flight_reminder",
  // Accommodation
  hotel_assigned:           "room_allocation",
  room_allocation:          "room_allocation",
  // Groups
  group_orientation:        "group_orientation",
  // Transport
  bus_assigned:             "bus_assigned",
  // Departure timeline
  ziyarat_reminder:         "departure_reminder",
  departure_reminder_7d:    "departure_reminder",
  departure_reminder_3d:    "departure_reminder",
  departure_reminder_2d:    "departure_reminder",
  departure_reminder_1d:    "departure_reminder",
  departure_reminder_12h:   "departure_reminder",
  departure_reminder_6h:    "departure_reminder",
  departure_reminder_3h:    "departure_reminder",
  // Return & post-journey
  flight_reminder:          "flight_reminder",
  return_flight_reminder:   "return_flight_reminder",
  return_reminder:          "return_flight_reminder",
  // On-ground Saudi/India
  welcome_saudi:            "welcome_saudi",
  arrival_india:            "arrival_india",
  hajj_mubarak:             "hajj_mubarak",
  hajj_package_launch:      "hajj_package_launch",
  // General
  feedback_request:         "feedback_request",
  document_expiry_90:       "passport_expiry",
  document_expiry_60:       "passport_expiry",
  document_expiry_30:       "passport_expiry",
  document_expiry_7:        "passport_expiry",
  medical_emergency:        "medical_emergency",
};

const ADMIN_EVENT_TRIGGERS = new Set([
  "new_booking", "payment_received", "partial_payment_received", "medical_emergency",
  "visa_approved", "visa_rejected", "booking_approved", "booking_rejected",
  "booking_completed", "balance_overdue",
]);

const TIMELINE_LABELS: Record<string, { icon: string; title: string }> = {
  new_booking: { icon: "📋", title: "Booking Submitted" },
  booking_approved: { icon: "✅", title: "Booking Approved" },
  booking_rejected: { icon: "❌", title: "Booking Rejected" },
  payment_received: { icon: "💰", title: "Payment Received" },
  partial_payment_received: { icon: "💵", title: "Partial Payment Received" },
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
  departure_reminder_2d: { icon: "⏰", title: "Departure in 2 Days" },
  departure_reminder_1d: { icon: "⏰", title: "Departure Tomorrow" },
  departure_reminder_12h: { icon: "🔔", title: "Departure in 12 Hours" },
  departure_reminder_6h: { icon: "🔔", title: "Departure in 6 Hours" },
  departure_reminder_3h: { icon: "🔔", title: "Departure in 3 Hours" },
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
      await fireNotificationEvent(eventType as any, ctx as any);
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
          : (triggerType === "payment_received" || triggerType === "partial_payment_received") ? "success"
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
        await fireNotificationEvent(eventType as any, ctx as any);
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

const DEPARTURE_TRIGGERS: Array<{ trigger: WorkflowTrigger; hoursAhead: number }> = [
  { trigger: "departure_reminder_7d",  hoursAhead: 7 * 24 },
  { trigger: "departure_reminder_3d",  hoursAhead: 3 * 24 },
  { trigger: "departure_reminder_2d",  hoursAhead: 2 * 24 },
  { trigger: "departure_reminder_1d",  hoursAhead: 24 },
  { trigger: "departure_reminder_12h", hoursAhead: 12 },
  { trigger: "departure_reminder_6h",  hoursAhead: 6 },
  { trigger: "departure_reminder_3h",  hoursAhead: 3 },
];

export async function runDepartureReminderCheck(): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;
  for (const { trigger, hoursAhead } of DEPARTURE_TRIGGERS) {
    const enabled = await getRuleEnabled(trigger);
    if (!enabled) { skipped++; continue; }
    try {
      // pilgrims has group_id only — no direct booking_id column.
      // Notify the pilgrim directly using their own name/mobile.
      const res = await pool.query(`
        SELECT p.id        AS pilgrim_id,
               p.full_name AS customer_name,
               p.mobile_india AS customer_mobile,
               p.group_id,
               gf.flight_number,  gf.departure_date, gf.departure_time,
               gf.departure_airport, gf.arrival_airport, gf.terminal
        FROM pilgrims p
        JOIN hajj_groups hg ON hg.id = p.group_id
        JOIN group_flights gf ON gf.group_id = hg.id
          AND gf.flight_type = 'outbound'
        WHERE gf.departure_date IS NOT NULL
          AND gf.departure_date::timestamptz
              BETWEEN NOW() + interval '${hoursAhead - 1} hours'
                  AND NOW() + interval '${hoursAhead + 1} hours'
        LIMIT 100
      `);
      for (const row of res.rows) {
        await triggerWorkflow(trigger, {
          customerName:    row.customer_name,
          customerMobile:  row.customer_mobile,
          flightNumber:    row.flight_number,
          departureDate:   row.departure_date,
          departureTime:   row.departure_time,
          pilgramName:     row.customer_name,
        });
        processed++;
      }
    } catch (err: any) {
      console.error(`[DepartureReminder] Error for ${trigger}:`, err?.message || err);
    }
  }
  return { processed, skipped };
}

export function startDepartureReminderCron() {
  const schedule = () => {
    const next = 60 * 60 * 1000;
    setTimeout(() => { runDepartureReminderCheck().catch(() => {}); schedule(); }, next);
  };
  runDepartureReminderCheck().catch(() => {});
  schedule();
  console.log("[DepartureReminder] Cron scheduled: hourly checks (7d/3d/2d/1d/12h/6h/3h)");
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
        // pilgrims.passport_expiry_date is the actual column (no booking_id column).
        const res = await pool.query(`
          SELECT p.id           AS pilgrim_id,
                 p.full_name    AS customer_name,
                 p.mobile_india AS customer_mobile,
                 p.passport_expiry_date AS passport_expiry
          FROM pilgrims p
          WHERE p.passport_expiry_date IS NOT NULL
            AND p.passport_expiry_date::date
                = (CURRENT_DATE + interval '${daysAhead} days')::date
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow(trigger, {
            customerName:    row.customer_name,
            customerMobile:  row.customer_mobile,
            pilgramName:     row.customer_name,
            documentType:    "Passport",
            expiryDate:      row.passport_expiry,
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
        // pilgrims has no booking_id — notify pilgrim directly.
        const res = await pool.query(`
          SELECT p.full_name    AS customer_name,
                 p.mobile_india AS customer_mobile,
                 gf.return_date, gf.flight_number
          FROM pilgrims p
          JOIN hajj_groups hg ON hg.id = p.group_id
          JOIN group_flights gf ON gf.group_id = hg.id
          WHERE gf.return_date::date = CURRENT_DATE
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow("return_reminder", {
            customerName:   row.customer_name,
            customerMobile: row.customer_mobile,
            flightNumber:   row.flight_number,
            departureDate:  row.return_date,
            pilgramName:    row.customer_name,
          });
        }
      } catch {}
    }

    if (feedbackEnabled) {
      try {
        // pilgrims has no booking_id — notify pilgrim directly.
        const res = await pool.query(`
          SELECT p.full_name    AS customer_name,
                 p.mobile_india AS customer_mobile
          FROM pilgrims p
          JOIN hajj_groups hg ON hg.id = p.group_id
          JOIN group_flights gf ON gf.group_id = hg.id
          WHERE gf.return_date::date
                = (CURRENT_DATE - interval '3 days')::date
          LIMIT 100
        `);
        for (const row of res.rows) {
          await triggerWorkflow("feedback_request", {
            customerName:   row.customer_name,
            customerMobile: row.customer_mobile,
            pilgramName:    row.customer_name,
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

// ── Balance Reminder Cron ──────────────────────────────────────────────────
export function startBalanceReminderCron() {
  const TRIGGERS: Array<{ trigger: WorkflowTrigger; daysAhead: number; overdue?: boolean }> = [
    { trigger: "balance_reminder_30", daysAhead: 30 },
    { trigger: "balance_reminder_15", daysAhead: 15 },
    { trigger: "balance_reminder_7", daysAhead: 7 },
    { trigger: "balance_reminder_3", daysAhead: 3 },
    { trigger: "balance_reminder_1", daysAhead: 1 },
    { trigger: "balance_overdue", daysAhead: -7, overdue: true },
  ];

  const run = async () => {
    for (const { trigger, daysAhead, overdue } of TRIGGERS) {
      const enabled = await getRuleEnabled(trigger).catch(() => false);
      if (!enabled) continue;
      try {
        let query: string;
        if (overdue) {
          // Fire every 7 days for overdue bookings
          query = `
            SELECT b.id as booking_id, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
                   b.final_amount::numeric as amount,
                   GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) as balance,
                   b.package_name
            FROM bookings b
            WHERE b.status IN ('approved','partially_paid')
              AND b.due_date IS NOT NULL
              AND b.due_date::date < CURRENT_DATE
              AND GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) > 0
              AND EXTRACT(epoch FROM (CURRENT_DATE - b.due_date::date)) / 86400 > 0
              AND MOD(EXTRACT(epoch FROM (CURRENT_DATE - b.due_date::date))::int / 86400, 7) = 0
            LIMIT 50
          `;
        } else {
          query = `
            SELECT b.id as booking_id, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
                   b.final_amount::numeric as amount,
                   GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) as balance,
                   b.package_name
            FROM bookings b
            WHERE b.status IN ('approved','partially_paid')
              AND b.due_date IS NOT NULL
              AND b.due_date::date = (CURRENT_DATE + interval '${daysAhead} days')::date
              AND GREATEST(b.final_amount::numeric - COALESCE(b.paid_amount::numeric,0),0) > 0
            LIMIT 50
          `;
        }
        const res = await pool.query(query);
        for (const row of res.rows) {
          await triggerWorkflow(trigger, {
            bookingId: row.booking_id,
            bookingNumber: row.booking_number,
            customerName: row.customer_name,
            customerMobile: row.customer_mobile,
            customerEmail: row.customer_email,
            packageName: row.package_name,
            amount: parseFloat(row.amount ?? 0),
            balance: parseFloat(row.balance ?? 0),
          });
        }
      } catch {}
    }
  };

  const scheduleDaily = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(3, 0, 0, 0); // 08:30 IST
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(() => { run().catch(() => {}); scheduleDaily(); }, next.getTime() - now.getTime());
  };
  scheduleDaily();
  console.log("[BalanceReminder] Cron scheduled: daily at 08:30 IST");
}

// ── Document Reminder Cron ──────────────────────────────────────────────────
export function startDocumentReminderCron() {
  const run = async () => {
    const enabled = await getRuleEnabled("document_reminder").catch(() => false);
    if (!enabled) return;
    try {
      const res = await pool.query(`
        SELECT p.id as pilgrim_id, p.full_name, p.mobile_india,
               b.id as booking_id, b.booking_number, b.customer_name, b.customer_mobile,
               p.passport_number, p.photo_url, p.visa_number
        FROM pilgrims p
        JOIN bookings b ON b.id = (
          SELECT bk.id FROM bookings bk WHERE bk.id = p.booking_id LIMIT 1
        )
        WHERE b.status IN ('approved','partially_paid')
          AND (p.passport_number IS NULL OR p.passport_number = ''
               OR p.photo_url IS NULL OR p.photo_url = '')
        LIMIT 100
      `);
      for (const row of res.rows) {
        const missing: string[] = [];
        if (!row.passport_number) missing.push("Passport");
        if (!row.photo_url) missing.push("Photo");
        await triggerWorkflow("document_reminder", {
          bookingId: row.booking_id,
          bookingNumber: row.booking_number,
          customerName: row.customer_name || row.full_name,
          customerMobile: row.customer_mobile || row.mobile_india,
          pilgramName: row.full_name,
          documentType: missing.join(", "),
        });
      }
    } catch {}
  };

  // Run every 3 days: check if it should run based on day number
  const schedule = () => {
    const MS_3_DAYS = 3 * 24 * 60 * 60 * 1000;
    setTimeout(() => { run().catch(() => {}); schedule(); }, MS_3_DAYS);
  };
  run().catch(() => {});
  schedule();
  console.log("[DocumentReminder] Cron scheduled: every 3 days");
}

// ── Ziyarat Reminder Cron ────────────────────────────────────────────────────
export function startZiyaratReminderCron() {
  const run = async () => {
    const enabled = await getRuleEnabled("ziyarat_reminder").catch(() => false);
    if (!enabled) return;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const res = await pool.query(`
        SELECT z.name, z.location, z.departure_time, z.guide_name, z.bus_id,
               b.bus_number,
               za.pilgrim_id, p.full_name, p.mobile_india,
               bk.id as booking_id, bk.booking_number, bk.customer_name
        FROM ziyarat_schedules z
        LEFT JOIN buses b ON z.bus_id = b.id
        LEFT JOIN ziyarat_attendance za ON za.schedule_id = z.id
        LEFT JOIN pilgrims p ON za.pilgrim_id = p.id
        LEFT JOIN bookings bk ON bk.id = (
          SELECT bk2.id FROM bookings bk2 WHERE bk2.id = p.booking_id LIMIT 1
        )
        WHERE z.schedule_date = $1
          AND z.status = 'scheduled'
          AND p.mobile_india IS NOT NULL
        LIMIT 100
      `, [tomorrowStr]);

      for (const row of res.rows) {
        await triggerWorkflow("ziyarat_reminder", {
          bookingId: row.booking_id,
          bookingNumber: row.booking_number,
          customerName: row.customer_name || row.full_name,
          customerMobile: row.mobile_india,
          pilgramName: row.full_name,
          packageName: row.name,
          hotelName: row.location,
          busNumber: row.bus_number || undefined,
          departureDate: tomorrowStr,
          flightNumber: row.departure_time ? `at ${row.departure_time}` : undefined,
        });
      }
    } catch {}
  };

  const scheduleEvening = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(15, 0, 0, 0); // 20:30 IST
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(() => { run().catch(() => {}); scheduleEvening(); }, next.getTime() - now.getTime());
  };
  scheduleEvening();
  console.log("[ZiyaratReminder] Cron scheduled: daily at 20:30 IST");
}
