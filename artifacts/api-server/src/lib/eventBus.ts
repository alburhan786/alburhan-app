// @ts-nocheck
/**
 * CENTRAL EVENT BUS — Al Burhan Communication & Automation Engine
 *
 * Single entry point for ALL communication across the ERP.
 * No module may send WhatsApp/SMS/Email/Push directly.
 * All modules call eventBus.publishEvent() — this engine handles everything.
 *
 * Architecture:
 *   ERP Module → publishEvent() → [dedup] → [audit log] → triggerWorkflow()
 *                                                       → fireNotificationEvent()
 *                                                       → notificationService.sendWaterfall()
 *                                                       → Provider (WA / SMS / Email / Push)
 */

import crypto from "crypto";
import { pool } from "@workspace/db";

// ── Re-export existing engines for convenience ─────────────────────────────
export { triggerWorkflow } from "./workflowEngine.js";
export { fireNotificationEvent } from "./notificationEngine.js";

// ── Event types supported by the bus ──────────────────────────────────────
export type BusEventType =
  // Bookings
  | "BOOKING_CREATED" | "BOOKING_UPDATED" | "BOOKING_APPROVED" | "BOOKING_CANCELLED" | "BOOKING_COMPLETED"
  // Payments
  | "PAYMENT_RECEIVED" | "PAYMENT_FAILED" | "PAYMENT_PARTIAL" | "REFUND_COMPLETED"
  | "BALANCE_DUE" | "OFFLINE_PAYMENT_SUBMITTED"
  // Invoices & Receipts
  | "INVOICE_GENERATED" | "RECEIPT_GENERATED" | "INVOICE_PAID"
  // Agreements
  | "AGREEMENT_CREATED" | "AGREEMENT_SIGNED"
  // Documents
  | "DOCUMENT_UPLOADED" | "PASSPORT_APPROVED" | "PASSPORT_RECEIVED"
  // Visa
  | "VISA_APPROVED" | "VISA_REJECTED" | "VISA_READY"
  // Flights
  | "FLIGHT_ASSIGNED" | "FLIGHT_UPDATED" | "TICKET_ISSUED"
  // Hotels & Rooms
  | "HOTEL_ASSIGNED" | "ROOM_ALLOCATED"
  // Journey
  | "DEPARTURE_REMINDER" | "JOURNEY_STATUS_CHANGED" | "RETURN_REMINDER"
  | "WELCOME_SAUDI" | "ARRIVAL_INDIA" | "HAJJ_MUBARAK"
  // Customer
  | "CUSTOMER_REGISTERED" | "OTP_SENT" | "PASSWORD_RESET"
  // Admin
  | "ADMIN_ALERT" | "MEDICAL_EMERGENCY" | "FEEDBACK_REQUEST"
  // Leads & CRM
  | "LEAD_CREATED" | "LEAD_CONVERTED"
  // Future
  | string;

// Trigger map: BusEventType → WorkflowTrigger
const BUS_TO_WORKFLOW: Record<string, string> = {
  BOOKING_CREATED:             "new_booking",
  BOOKING_APPROVED:            "booking_approved",
  BOOKING_CANCELLED:           "booking_rejected",
  BOOKING_COMPLETED:           "booking_completed",
  PAYMENT_RECEIVED:            "payment_received",
  PAYMENT_PARTIAL:             "partial_payment_received",
  INVOICE_GENERATED:           "invoice_generated",
  AGREEMENT_CREATED:           "agreement_generated",
  AGREEMENT_SIGNED:            "agreement_signed",
  DOCUMENT_UPLOADED:           "passport_uploaded",
  PASSPORT_APPROVED:           "passport_uploaded",
  VISA_APPROVED:               "visa_approved",
  VISA_REJECTED:               "visa_rejected",
  FLIGHT_ASSIGNED:             "flight_assigned",
  TICKET_ISSUED:               "ticket_issued",
  HOTEL_ASSIGNED:              "hotel_assigned",
  ROOM_ALLOCATED:              "room_allocation",
  JOURNEY_STATUS_CHANGED:      "booking_submitted",
  DEPARTURE_REMINDER:          "departure_reminder_1d",
  RETURN_REMINDER:             "return_reminder",
  WELCOME_SAUDI:               "welcome_saudi",
  ARRIVAL_INDIA:               "arrival_india",
  HAJJ_MUBARAK:               "hajj_mubarak",
  FEEDBACK_REQUEST:            "feedback_request",
  MEDICAL_EMERGENCY:           "medical_emergency",
};

// ── Event payload ──────────────────────────────────────────────────────────
export interface BusEvent {
  type: BusEventType;
  source: string;           // which module published (e.g. "bookings", "payments")
  idempotencyKey?: string;  // optional caller-supplied dedup key
  ctx: {
    customerName?: string;
    customerMobile?: string;
    customerEmail?: string;
    customerId?: string;
    bookingId?: string;
    bookingNumber?: string;
    packageName?: string;
    amount?: number;
    paidAmount?: number;
    balanceAmount?: number;
    invoiceNumber?: string;
    agreementNumber?: string;
    flightNumber?: string;
    hotelName?: string;
    roomNumber?: string;
    departureDate?: string;
    visaStatus?: string;
    documentType?: string;
    journeyStatus?: string;
    severity?: string;
    [key: string]: unknown;
  };
}

export interface BusResult {
  eventId: string;
  deduplicated: boolean;
  queued: boolean;
  workflowTrigger?: string;
  error?: string;
}

// ── Ensure comm_events table ───────────────────────────────────────────────
export async function ensureCommEventsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comm_events (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type    TEXT NOT NULL,
        source        TEXT NOT NULL DEFAULT 'unknown',
        idempotency_key TEXT,
        dedup_hash    TEXT,
        customer_id   TEXT,
        booking_id    TEXT,
        customer_name TEXT,
        payload       JSONB NOT NULL DEFAULT '{}',
        workflow_trigger TEXT,
        status        TEXT NOT NULL DEFAULT 'queued',
        error_msg     TEXT,
        processed_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ce_type_idx      ON comm_events(event_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ce_booking_idx   ON comm_events(booking_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ce_customer_idx  ON comm_events(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ce_created_idx   ON comm_events(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ce_dedup_idx     ON comm_events(dedup_hash) WHERE dedup_hash IS NOT NULL`);
  } catch (e: any) {
    console.warn("[eventBus] Table init:", e.message);
  }
}

// ── Deduplication ──────────────────────────────────────────────────────────
function buildDedupHash(event: BusEvent): string {
  const key = [
    event.type,
    event.ctx.customerId || event.ctx.customerMobile || "",
    event.ctx.bookingId || "",
    event.idempotencyKey || "",
  ].join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

const DEDUP_WINDOW_MS = 30_000; // 30 seconds dedup window

async function isDeuplicate(hash: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM comm_events WHERE dedup_hash=$1 AND created_at > NOW() - INTERVAL '30 seconds' LIMIT 1`,
      [hash]
    );
    return r.rows.length > 0;
  } catch { return false; }
}

// ── Core publish function ──────────────────────────────────────────────────
export async function publishEvent(event: BusEvent): Promise<BusResult> {
  const dedupHash = buildDedupHash(event);
  const eventId   = crypto.randomUUID();

  // 1. Deduplication check
  const isDup = await isDeuplicate(dedupHash);
  if (isDup) {
    console.log(`[eventBus] ⚡ Deduplicated: ${event.type} | hash=${dedupHash.slice(0,8)}`);
    return { eventId, deduplicated: true, queued: false };
  }

  // 2. Determine workflow trigger
  const workflowTrigger = BUS_TO_WORKFLOW[event.type] || null;

  // 3. Log to comm_events immediately (audit trail)
  let logId = eventId;
  try {
    const r = await pool.query(
      `INSERT INTO comm_events
         (id, event_type, source, idempotency_key, dedup_hash, customer_id, booking_id, customer_name, payload, workflow_trigger, status, created_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued', NOW())
       RETURNING id`,
      [
        eventId, event.type, event.source || "unknown",
        event.idempotencyKey || null, dedupHash,
        event.ctx.customerId || null, event.ctx.bookingId || null,
        event.ctx.customerName || null, JSON.stringify(event.ctx),
        workflowTrigger,
      ]
    );
    logId = r.rows[0]?.id || eventId;
  } catch (e: any) {
    console.warn("[eventBus] Log insert failed:", e.message);
  }

  // 4. Fire workflow (async — non-blocking)
  setImmediate(async () => {
    try {
      if (workflowTrigger) {
        const { triggerWorkflow } = await import("./workflowEngine.js");
        await triggerWorkflow(workflowTrigger as any, event.ctx as any);
      } else {
        // Fallback: fire notification event directly
        const { fireNotificationEvent } = await import("./notificationEngine.js");
        const evType = event.type.toLowerCase().replace(/_/g, "_") as any;
        await fireNotificationEvent(evType, event.ctx as any);
      }
      // Mark as processed
      await pool.query(
        `UPDATE comm_events SET status='processed', processed_at=NOW() WHERE id=$1`,
        [logId]
      ).catch(() => {});
    } catch (err: any) {
      console.error(`[eventBus] ❌ Event processing failed: ${event.type}`, err.message);
      await pool.query(
        `UPDATE comm_events SET status='failed', error_msg=$1, processed_at=NOW() WHERE id=$2`,
        [err.message, logId]
      ).catch(() => {});
    }
  });

  console.log(`[eventBus] ▶ Published: ${event.type} | src=${event.source} | trigger=${workflowTrigger || "direct"} | id=${logId.slice(0,8)}`);
  return { eventId: logId, deduplicated: false, queued: true, workflowTrigger: workflowTrigger || undefined };
}

// ── Convenience helpers for ERP modules ───────────────────────────────────

export const eventBus = {
  publish: publishEvent,

  // Booking events
  bookingCreated: (ctx: BusEvent["ctx"], source = "bookings") =>
    publishEvent({ type: "BOOKING_CREATED", source, ctx }),
  bookingApproved: (ctx: BusEvent["ctx"], source = "bookings") =>
    publishEvent({ type: "BOOKING_APPROVED", source, ctx }),
  bookingCancelled: (ctx: BusEvent["ctx"], source = "bookings") =>
    publishEvent({ type: "BOOKING_CANCELLED", source, ctx }),

  // Payment events
  paymentReceived: (ctx: BusEvent["ctx"], source = "payments") =>
    publishEvent({ type: "PAYMENT_RECEIVED", source, ctx }),
  paymentPartial: (ctx: BusEvent["ctx"], source = "payments") =>
    publishEvent({ type: "PAYMENT_PARTIAL", source, ctx }),

  // Invoice & Agreement
  invoiceGenerated: (ctx: BusEvent["ctx"], source = "invoices") =>
    publishEvent({ type: "INVOICE_GENERATED", source, ctx }),
  agreementCreated: (ctx: BusEvent["ctx"], source = "agreements") =>
    publishEvent({ type: "AGREEMENT_CREATED", source, ctx }),
  agreementSigned: (ctx: BusEvent["ctx"], source = "agreements") =>
    publishEvent({ type: "AGREEMENT_SIGNED", source, ctx }),

  // Travel documents
  visaApproved: (ctx: BusEvent["ctx"], source = "visa") =>
    publishEvent({ type: "VISA_APPROVED", source, ctx }),
  flightAssigned: (ctx: BusEvent["ctx"], source = "flights") =>
    publishEvent({ type: "FLIGHT_ASSIGNED", source, ctx }),
  documentUploaded: (ctx: BusEvent["ctx"], source = "documents") =>
    publishEvent({ type: "DOCUMENT_UPLOADED", source, ctx }),

  // Admin
  adminAlert: (ctx: BusEvent["ctx"], source = "system") =>
    publishEvent({ type: "ADMIN_ALERT", source, ctx }),
};

export default eventBus;
