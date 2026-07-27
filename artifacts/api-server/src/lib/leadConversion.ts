// @ts-nocheck
/**
 * Lead → Booking Full Automation Pipeline
 * Tenant-ready: every table write includes tenant_id DEFAULT 'alburhan'
 * Multi-tenancy can be enforced later by adding WHERE tenant_id = $n
 */

import { pool } from "@workspace/db";
import { randomUUID } from "crypto";
import { upsertInvoiceForBooking } from "../routes/invoices.js";
import { autoGenerateAgreement } from "../routes/agreements.js";
import { triggerWorkflow } from "./workflowEngine.js";

// ── Schema bootstrap ──────────────────────────────────────────────────────────
export async function ensurePaymentSchedulesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_schedules (
      id                      TEXT PRIMARY KEY,
      tenant_id               TEXT NOT NULL DEFAULT 'alburhan',
      booking_id              TEXT NOT NULL,
      customer_id             TEXT NOT NULL,
      installment_number      INTEGER NOT NULL,
      amount                  NUMERIC(12,2) NOT NULL,
      due_date                DATE NOT NULL,
      status                  TEXT NOT NULL DEFAULT 'pending',
      paid_date               DATE,
      paid_amount             NUMERIC(12,2),
      payment_transaction_id  TEXT,
      notes                   TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ps_booking
      ON payment_schedules(booking_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ps_due_status
      ON payment_schedules(due_date, status)
  `);
}
ensurePaymentSchedulesTable().catch(e =>
  console.error("[leadConversion] payment_schedules schema error:", e)
);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AutoConvertParams {
  packageName?: string;
  packageId?: string;
  totalAmount: number;
  advanceAmount?: number;
  gstAmount?: number;
  discountAmount?: number;
  roomType?: string;
  numTravellers?: number;
  departureDate?: string;
  returnDate?: string;
  notes?: string;
  installments?: number;    // 1–12, default 1
  approveBooking?: boolean; // instantly set status='approved' if true
}

export interface PaymentInstallment {
  id: string;
  installment: number;
  amount: number;
  dueDate: string;
  status: string;
}

export interface AutoConvertResult {
  bookingId: string;
  bookingNumber: string | null;
  customerId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  agreementId?: string;
  paymentSchedule: PaymentInstallment[];
  notificationSent: boolean;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function autoConvertLeadToBooking(
  leadId: string,
  adminUserId: string,
  params: AutoConvertParams
): Promise<AutoConvertResult> {
  // 1. Load lead
  const leadRes = await pool.query(
    `SELECT * FROM leads WHERE id = $1`,
    [leadId]
  );
  const lead = leadRes.rows[0];
  if (!lead) throw new Error("Lead not found");
  if (!lead.mobile) throw new Error("Cannot create booking: lead has no mobile number");
  if (lead.status === "converted")
    throw new Error(`Lead already converted (booking: ${lead.converted_booking_id})`);

  // 2. Find or create customer user
  let customerId: string;
  const existingUser = await pool.query(
    `SELECT id FROM users WHERE mobile = $1 LIMIT 1`,
    [lead.mobile]
  );
  if (existingUser.rows[0]) {
    customerId = existingUser.rows[0].id;
    // Enrich with lead data (never overwrite existing non-empty values)
    await pool.query(
      `UPDATE users
         SET name       = CASE WHEN name IS NULL OR name = '' THEN $1 ELSE name END,
             email      = CASE WHEN email IS NULL OR email = '' THEN $2 ELSE email END,
             updated_at = NOW()
       WHERE id = $3`,
      [lead.name || lead.mobile, lead.email || null, customerId]
    );
  } else {
    const newUser = await pool.query(
      `INSERT INTO users (id, name, mobile, email, role, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'customer', NOW(), NOW())
       RETURNING id`,
      [lead.name || lead.mobile, lead.mobile, lead.email || null]
    );
    customerId = newUser.rows[0].id;
  }

  // 3. Compute amounts
  const totalAmount   = Math.max(0, Number(params.totalAmount) || 0);
  const advanceAmount = Math.max(0, Number(params.advanceAmount) || 0);
  const gstAmount     = Math.max(0, Number(params.gstAmount) || 0);
  const discountAmount = Math.max(0, Number(params.discountAmount) || 0);
  const finalAmount   = totalAmount + gstAmount - discountAmount;
  const bookingStatus = params.approveBooking ? "approved" : "pending";
  const packageName   = params.packageName || lead.package_interest || "Hajj / Umrah Package";

  // 4. Create booking
  const bkRes = await pool.query(
    `INSERT INTO bookings (
       id, customer_id, package_id, package_name, status,
       room_type, travellers,
       total_amount, advance_amount, final_amount, gst_amount, discount_amount, paid_amount,
       preferred_departure_date, notes, source,
       created_at, updated_at
     ) VALUES (
       gen_random_uuid()::text, $1, $2, $3, $4,
       $5, $6,
       $7, $8, $9, $10, $11, $8,
       $12, $13, $14,
       NOW(), NOW()
     ) RETURNING id, booking_number`,
    [
      customerId,
      params.packageId || lead.package_interest_id || null,
      packageName,
      bookingStatus,
      params.roomType || lead.room_preference || "quad",
      Number(params.numTravellers) || Number(lead.num_travellers) || 1,
      totalAmount,
      advanceAmount,
      finalAmount,
      gstAmount,
      discountAmount,
      params.departureDate || lead.preferred_departure_date || null,
      `Auto-converted from lead ${lead.lead_number || leadId}${params.notes ? ". " + params.notes : ""}`.trim(),
      `lead_${lead.source || "crm"}`,
    ]
  );

  const { id: bookingId, booking_number: bookingNumber } = bkRes.rows[0];

  // 5. Mark lead as converted (fix: use pipeline_stage not stage)
  await pool.query(
    `UPDATE leads
       SET status                = 'converted',
           pipeline_stage        = 'won',
           converted_booking_id  = $1,
           converted_at          = NOW(),
           updated_at            = NOW()
     WHERE id = $2`,
    [bookingId, leadId]
  );

  // 6. Log lead activity
  await pool.query(
    `INSERT INTO lead_activities
       (id, lead_id, type, content, metadata, performed_by, performed_by_name, created_at)
     VALUES ($1, $2, 'converted', 'Lead auto-converted to booking via one-click automation',
             $3::jsonb, $4, 'System Auto-Convert', NOW())`,
    [
      randomUUID(),
      leadId,
      JSON.stringify({ bookingId, bookingNumber, amount: finalAmount, installments: params.installments || 1 }),
      adminUserId,
    ]
  );

  // 7. Create payment schedule (if requested and more than 1 installment)
  const scheduleRows: PaymentInstallment[] = [];
  const numInstallments = Math.max(1, Math.min(Number(params.installments) || 1, 24));

  if (numInstallments > 1 && finalAmount > 0) {
    const advance  = advanceAmount > 0 ? advanceAmount : 0;
    const remaining = finalAmount - advance;
    const perInstallment = Math.round((remaining / (numInstallments - 1)) * 100) / 100;

    const toInsert = [
      { num: 1, amount: advance > 0 ? advance : Math.round((finalAmount / numInstallments) * 100) / 100, dueDate: new Date().toISOString().slice(0, 10) },
    ];
    for (let i = 2; i <= numInstallments; i++) {
      const due = new Date(Date.now() + (i - 1) * 30 * 86400000).toISOString().slice(0, 10);
      const amt = i === numInstallments
        ? Math.round((finalAmount - toInsert.reduce((s, r) => s + r.amount, 0)) * 100) / 100
        : perInstallment;
      toInsert.push({ num: i, amount: amt, dueDate: due });
    }

    for (const row of toInsert) {
      const sid = `ps_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await pool.query(
        `INSERT INTO payment_schedules
           (id, tenant_id, booking_id, customer_id, installment_number, amount, due_date, status, created_at, updated_at)
         VALUES ($1, 'alburhan', $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
        [sid, bookingId, customerId, row.num, row.amount, row.dueDate]
      );
      scheduleRows.push({ id: sid, installment: row.num, amount: row.amount, dueDate: row.dueDate, status: "pending" });
    }
  }

  // 8. Auto-create invoice (non-blocking)
  let invoiceId: string | undefined;
  let invoiceNumber: string | undefined;
  try {
    const inv = await upsertInvoiceForBooking(bookingId);
    invoiceId     = inv?.id as string;
    invoiceNumber = inv?.invoice_number as string;
  } catch (err) {
    console.error("[leadConversion] invoice creation failed:", err);
  }

  // 9. Auto-create agreement (non-blocking)
  let agreementId: string | undefined;
  try {
    await autoGenerateAgreement(bookingId);
    const agRes = await pool.query(
      `SELECT id FROM agreements WHERE booking_id = $1 LIMIT 1`,
      [bookingId]
    );
    agreementId = agRes.rows[0]?.id;
  } catch (err) {
    console.error("[leadConversion] agreement creation failed:", err);
  }

  // 10. Fire booking notification (non-blocking)
  let notificationSent = false;
  try {
    await triggerWorkflow("new_booking", {
      bookingId,
      bookingNumber,
      customerId,
      customerName:   lead.name || lead.mobile,
      customerMobile: lead.mobile,
      customerEmail:  lead.email || undefined,
      packageName,
      amount:        finalAmount,
      advanceAmount,
    });
    notificationSent = true;
  } catch (err) {
    console.error("[leadConversion] notification workflow failed:", err);
  }

  return {
    bookingId,
    bookingNumber,
    customerId,
    invoiceId,
    invoiceNumber,
    agreementId,
    paymentSchedule: scheduleRows,
    notificationSent,
  };
}

// ── Payment Schedule CRUD helpers (used by admin routes) ──────────────────────
export async function getPaymentSchedule(bookingId: string) {
  const res = await pool.query(
    `SELECT ps.*, u.name as customer_name, u.mobile as customer_mobile
       FROM payment_schedules ps
       LEFT JOIN users u ON u.id = ps.customer_id
      WHERE ps.booking_id = $1
      ORDER BY ps.installment_number ASC`,
    [bookingId]
  );
  return res.rows;
}

export async function markInstallmentPaid(
  scheduleId: string,
  paidAmount: number,
  transactionId?: string
) {
  await pool.query(
    `UPDATE payment_schedules
        SET status = 'paid', paid_date = CURRENT_DATE,
            paid_amount = $1, payment_transaction_id = $2,
            updated_at = NOW()
      WHERE id = $3`,
    [paidAmount, transactionId || null, scheduleId]
  );
}

export async function getOverdueInstallments() {
  const res = await pool.query(
    `SELECT ps.*, b.booking_number, b.package_name,
            u.name as customer_name, u.mobile as customer_mobile
       FROM payment_schedules ps
       JOIN bookings b ON b.id = ps.booking_id
       LEFT JOIN users u ON u.id = ps.customer_id
      WHERE ps.status = 'pending'
        AND ps.due_date < CURRENT_DATE
      ORDER BY ps.due_date ASC`
  );
  return res.rows;
}
