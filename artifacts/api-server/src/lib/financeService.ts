// @ts-nocheck
/**
 * lib/financeService.ts
 * Central financial calculation and transaction service for Al Burhan ERP.
 *
 * ALL invoice creation, payment recording, receipt generation, and ledger
 * entries MUST flow through this module.
 *
 * Never call payment_transactions directly from route files without going
 * through recordCustomerPayment() — the advisory lock, idempotency guard,
 * ledger entry, and receipt generation are only here.
 */

import { pool } from "@workspace/db";
import { randomUUID } from "crypto";

// ─── Allowed invoice sources ──────────────────────────────────────────────────
export type InvoiceSource =
  | "admin_approval"
  | "authorized_admin_manual_action"
  | "verified_payment"
  | "approved_finance_adjustment";

const ALLOWED_INVOICE_SOURCES: InvoiceSource[] = [
  "admin_approval",
  "authorized_admin_manual_action",
  "verified_payment",
  "approved_finance_adjustment",
];

// Status values that BLOCK invoice creation
const BLOCKED_INVOICE_STATUSES = ["pending", "submitted", "rejected", "cancelled"];

export type PaymentMethod =
  | "cash" | "bank_transfer" | "upi" | "card" | "razorpay"
  | "cheque" | "neft" | "imps" | "rtgs" | "other";

// ─── Return types ─────────────────────────────────────────────────────────────

export interface BookingFinancials {
  booking_id: string;
  booking_number: string;
  customer_name: string;
  package_name: string;
  package_base_amount: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  tcs_rate: number;
  tcs_amount: number;
  visa_charges: number;
  additional_charges: number;
  grand_total: number;
  total_paid: number;
  total_refunded: number;
  net_paid: number;
  outstanding_balance: number;
  payment_status: "unpaid" | "partially_paid" | "paid" | "overpaid" | "refunded";
}

export interface CreateInvoiceResult {
  ok: boolean;
  invoice?: Record<string, unknown>;
  failures?: { field: string; reason: string }[];
  error?: string;
}

export interface RecordPaymentResult {
  ok: boolean;
  paymentId?: string;
  receiptId?: string;
  receiptNumber?: string;
  alreadyProcessed?: boolean;
  error?: string;
}

export interface VisaEligibilityResult {
  eligible: boolean;
  reason?: string;
  outstanding?: number;
  required_advance?: number;
  current_paid?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function r2(n: number | string | null | undefined): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function getFinanceSetting(key: string, fallback: string): Promise<string> {
  try {
    const r = await pool.query(
      `SELECT ${key} AS v FROM booking_settings WHERE id='default' LIMIT 1`
    );
    const v = r.rows[0]?.v;
    return v !== null && v !== undefined ? String(v) : fallback;
  } catch {
    return fallback;
  }
}

async function writeFinanceAuditLog(opts: {
  action: string;
  entityType: string;
  entityId?: string;
  bookingId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO finance_audit_logs
         (id, action, entity_type, entity_id, booking_id, actor_id, actor_name,
          actor_role, ip_address, user_agent, old_values, new_values, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())`,
      [
        randomUUID(), opts.action, opts.entityType, opts.entityId ?? null,
        opts.bookingId ?? null, opts.actorId ?? null, opts.actorName ?? null,
        opts.actorRole ?? null, opts.ipAddress ?? null, opts.userAgent ?? null,
        opts.oldValues ? JSON.stringify(opts.oldValues) : null,
        opts.newValues ? JSON.stringify(opts.newValues) : null,
        opts.reason ?? null,
      ]
    );
  } catch (e: any) {
    console.warn("[financeService] audit log failed (non-fatal):", e.message);
  }
}

async function appendLedgerEntry(opts: {
  bookingId: string;
  docType: string;
  docNumber?: string;
  docId?: string;
  description: string;
  debit: number;
  credit: number;
  source?: string;
  createdBy?: string;
}): Promise<void> {
  try {
    const prev = await pool.query(
      `SELECT running_balance FROM customer_ledger_entries
       WHERE booking_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [opts.bookingId]
    );
    const prevBal = r2(prev.rows[0]?.running_balance ?? 0);
    const running = r2(prevBal + r2(opts.debit) - r2(opts.credit));
    await pool.query(
      `INSERT INTO customer_ledger_entries
         (id, booking_id, entry_date, doc_type, doc_number, doc_id, description,
          debit, credit, running_balance, source, created_by, created_at)
       VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        randomUUID(), opts.bookingId, opts.docType,
        opts.docNumber ?? null, opts.docId ?? null, opts.description,
        r2(opts.debit), r2(opts.credit), running,
        opts.source ?? null, opts.createdBy ?? null,
      ]
    );
  } catch (e: any) {
    console.warn("[financeService] ledger entry failed (non-fatal):", e.message);
  }
}

// ─── Sequence helpers ─────────────────────────────────────────────────────────

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT nextval('invoice_number_seq') AS seq`);
  return `ABT/${year}/${String(Number(r.rows[0].seq)).padStart(6, "0")}`;
}

export async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT nextval('receipt_number_seq') AS seq`);
  return `REC/${year}/${String(Number(r.rows[0].seq)).padStart(6, "0")}`;
}

export async function generateRefundNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT nextval('refund_number_seq') AS seq`);
  return `REF/${year}/${String(Number(r.rows[0].seq)).padStart(6, "0")}`;
}

// ─── calculateBookingFinancials ───────────────────────────────────────────────
// ALWAYS reads payment_transactions for payment totals.
// Never trusts bookings.paid_amount alone as the source of truth.

export async function calculateBookingFinancials(
  bookingId: string
): Promise<BookingFinancials | null> {
  const bRes = await pool.query(
    `SELECT * FROM bookings WHERE id=$1 LIMIT 1`,
    [bookingId]
  );
  const b = bRes.rows[0];
  if (!b) return null;

  // Sum actual non-deleted payments
  const ptRes = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric),0) AS total_paid
     FROM payment_transactions WHERE booking_id=$1 AND is_deleted=false`,
    [bookingId]
  );
  const totalPaid = r2(ptRes.rows[0]?.total_paid);

  // Sum approved/processed refunds
  const refRes = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric),0) AS total_refunded
     FROM refunds WHERE booking_id=$1 AND status IN ('approved','processed')`,
    [bookingId]
  );
  const totalRefunded = r2(refRes.rows[0]?.total_refunded ?? 0);

  const netPaid            = r2(totalPaid - totalRefunded);
  const packageBaseAmount  = r2(b.total_amount);
  const discountAmount     = r2(b.discount_amount);
  const taxableAmount      = r2(
    b.taxable_amount != null
      ? b.taxable_amount
      : packageBaseAmount - discountAmount
  );
  const gstRate            = r2(b.gst_rate ?? 0);
  const gstAmount          = r2(b.gst_amount ?? 0);
  const tcsRate            = r2(b.tcs_rate ?? 0);
  const tcsAmount          = r2(b.tcs_amount ?? 0);
  const visaCharges        = r2(b.visa_charges ?? 0);
  const additionalCharges  = r2(b.additional_charges ?? 0);
  const grandTotal         = r2(
    b.final_amount
      ? b.final_amount
      : taxableAmount + gstAmount + tcsAmount + visaCharges + additionalCharges
  );
  const outstandingBalance = r2(grandTotal - netPaid);

  let paymentStatus: BookingFinancials["payment_status"];
  if (totalRefunded > 0 && totalRefunded >= totalPaid - 0.01) {
    paymentStatus = "refunded";
  } else if (netPaid <= 0) {
    paymentStatus = "unpaid";
  } else if (netPaid > grandTotal + 0.01) {
    paymentStatus = "overpaid";
  } else if (netPaid >= grandTotal - 0.01) {
    paymentStatus = "paid";
  } else {
    paymentStatus = "partially_paid";
  }

  return {
    booking_id: b.id,
    booking_number: b.booking_number,
    customer_name: b.customer_name,
    package_name: b.package_name ?? "",
    package_base_amount: packageBaseAmount,
    discount_amount: discountAmount,
    taxable_amount: taxableAmount,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    tcs_rate: tcsRate,
    tcs_amount: tcsAmount,
    visa_charges: visaCharges,
    additional_charges: additionalCharges,
    grand_total: grandTotal,
    total_paid: totalPaid,
    total_refunded: totalRefunded,
    net_paid: netPaid,
    outstanding_balance: outstandingBalance,
    payment_status: paymentStatus,
  };
}

// ─── createOrUpdateBookingInvoice ─────────────────────────────────────────────

export async function createOrUpdateBookingInvoice(opts: {
  bookingId: string;
  source: InvoiceSource;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  ipAddress?: string;
  paymentTerms?: string;
}): Promise<CreateInvoiceResult> {
  const { bookingId, source, actorId, actorName, actorRole } = opts;

  // Source guard — disallow notification helpers and pending submissions
  if (!ALLOWED_INVOICE_SOURCES.includes(source)) {
    return {
      ok: false,
      error: `Invoice source '${source}' is not permitted. Use one of: ${ALLOWED_INVOICE_SOURCES.join(", ")}`,
    };
  }

  const bRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
  const b = bRes.rows[0];

  // ── 8-condition validator ──────────────────────────────────────────────────
  const failures: { field: string; reason: string }[] = [];

  if (!b) {
    failures.push({ field: "booking", reason: "Booking does not exist" });
  } else {
    if (BLOCKED_INVOICE_STATUSES.includes(b.status)) {
      failures.push({
        field: "booking_status",
        reason: `Booking is in status '${b.status}' — invoice requires approved/confirmed/paid status`,
      });
    }
    if (!b.total_amount || Number(b.total_amount) <= 0) {
      failures.push({ field: "package_amount", reason: "Package amount is missing or zero" });
    }
    const grandTotalCheck = Number(b.final_amount) || Number(b.total_amount) || 0;
    if (grandTotalCheck <= 0) {
      failures.push({ field: "total_amount", reason: "Invoice total would be zero — requires authorized reason" });
    }
    if (!b.customer_name?.trim()) {
      failures.push({ field: "customer_name", reason: "Customer name is missing" });
    }
    if (!b.package_name?.trim()) {
      failures.push({ field: "package_name", reason: "Package name is missing" });
    }
  }

  if (failures.length > 0) {
    // Write validation failure to notification_logs for admin visibility
    await pool.query(
      `INSERT INTO notification_logs
         (id, event_type, channel, recipient, status, error_code, booking_id, created_at, updated_at)
       VALUES ($1,'invoice_generated','admin',$2,'failed','INVOICE_VALIDATION_FAILED',$3,NOW(),NOW())`,
      [
        `inv_val_${Date.now()}`,
        b?.customer_mobile ?? "unknown",
        bookingId,
      ]
    ).catch(() => {});
    return { ok: false, failures };
  }

  // ── Compute invoice amounts ────────────────────────────────────────────────
  const subtotal     = r2(b.total_amount);
  const discount     = r2(b.discount_amount);
  const taxable      = r2(b.taxable_amount != null ? b.taxable_amount : subtotal - discount);
  const gstRate      = r2(b.gst_rate ?? 0);
  const gstAmount    = r2(b.gst_amount ?? 0);
  const tcsRate      = r2(b.tcs_rate ?? 0);
  const tcsAmount    = r2(b.tcs_amount ?? 0);
  const visaCharges  = r2(b.visa_charges ?? 0);
  const addlCharges  = r2(b.additional_charges ?? 0);
  const grandTotal   = r2(b.final_amount ?? (taxable + gstAmount + tcsAmount + visaCharges + addlCharges));
  const dueDate      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const paymentTerms = opts.paymentTerms ?? "50% advance; balance due within 50 days";

  // Paid from actual payment_transactions (source of truth)
  const ptRes = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric),0) AS paid
     FROM payment_transactions WHERE booking_id=$1 AND is_deleted=false`,
    [bookingId]
  );
  const paid    = r2(ptRes.rows[0]?.paid ?? 0);
  const balance = r2(grandTotal - paid);
  const invStatus = paid >= grandTotal - 0.01 ? "paid" : paid > 0 ? "partial" : "pending";
  const payStatus = paid <= 0 ? "unpaid" : paid >= grandTotal - 0.01 ? "paid" : "partially_paid";

  // ── Check for existing invoice ─────────────────────────────────────────────
  const existing = await pool.query(
    `SELECT * FROM invoices WHERE booking_id=$1 LIMIT 1`,
    [bookingId]
  );

  let invoice: Record<string, unknown>;

  if (existing.rows[0]) {
    const inv = existing.rows[0];
    if (inv.is_void) {
      return { ok: false, error: "Invoice is voided and cannot be updated. Create a revision." };
    }
    await pool.query(
      `UPDATE invoices SET
         subtotal=$1, discount=$2, gst_rate=$3, gst_amount=$4, tcs_rate=$5, tcs_amount=$6,
         taxable_amount=$7, visa_charges=$8, additional_charges=$9, grand_total=$10, total=$10,
         paid=$11, balance=$12, invoice_status=$13, payment_status=$14,
         customer_name=$15, package_name=$16, source=$17, actor_id=$18,
         due_date=COALESCE(due_date,$19), payment_terms=COALESCE(payment_terms,$20),
         updated_at=NOW()
       WHERE id=$21`,
      [
        subtotal, discount, gstRate, gstAmount, tcsRate, tcsAmount, taxable,
        visaCharges, addlCharges, grandTotal, paid, balance,
        invStatus, payStatus, b.customer_name, b.package_name,
        source, actorId ?? null, dueDate, paymentTerms, inv.id,
      ]
    );
    invoice = {
      ...inv, subtotal, discount, gst_rate: gstRate, gst_amount: gstAmount,
      tcs_rate: tcsRate, tcs_amount: tcsAmount, taxable_amount: taxable,
      visa_charges: visaCharges, additional_charges: addlCharges,
      grand_total: grandTotal, total: grandTotal, paid, balance,
      invoice_status: invStatus, payment_status: payStatus,
      customer_name: b.customer_name, package_name: b.package_name,
    };
    await writeFinanceAuditLog({
      action: "invoice_revised", entityType: "invoice", entityId: inv.id as string,
      bookingId, actorId, actorName, actorRole, ipAddress: opts.ipAddress,
      oldValues: { total: Number(inv.total), paid: Number(inv.paid) },
      newValues: { grand_total: grandTotal, paid, balance, source },
    });
  } else {
    // ── Create new invoice ──────────────────────────────────────────────────
    const invoiceNumber = await generateInvoiceNumber();
    const id = randomUUID();
    const r = await pool.query(
      `INSERT INTO invoices
         (id, invoice_number, booking_id, customer_id, invoice_date, issue_date,
          subtotal, discount, gst_rate, gst_amount, tcs_rate, tcs_amount,
          taxable_amount, visa_charges, additional_charges, grand_total, total,
          paid, balance, invoice_status, payment_status,
          customer_name, package_name, source, actor_id,
          due_date, payment_terms, is_void, created_at, updated_at)
       VALUES
         ($1,$2,$3,$4,NOW(),NOW(),
          $5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$14,
          $15,$16,$17,$18,
          $19,$20,$21,$22,
          $23,$24,false,NOW(),NOW())
       RETURNING *`,
      [
        id, invoiceNumber, bookingId, b.customer_id ?? null,
        subtotal, discount, gstRate, gstAmount, tcsRate, tcsAmount,
        taxable, visaCharges, addlCharges, grandTotal,
        paid, balance, invStatus, payStatus,
        b.customer_name, b.package_name, source, actorId ?? null,
        dueDate, paymentTerms,
      ]
    );
    invoice = r.rows[0];

    // Sync invoice_number back to bookings row
    await pool.query(
      `UPDATE bookings SET invoice_number=$1 WHERE id=$2`,
      [invoiceNumber, bookingId]
    );

    // Ledger: debit entry (invoice issued = customer owes the amount)
    await appendLedgerEntry({
      bookingId, docType: "invoice", docNumber: invoiceNumber, docId: id,
      description: `Invoice issued — ${b.package_name ?? "Package"}`,
      debit: grandTotal, credit: 0, source, createdBy: actorId,
    });

    await writeFinanceAuditLog({
      action: "invoice_created", entityType: "invoice", entityId: id,
      bookingId, actorId, actorName, actorRole, ipAddress: opts.ipAddress,
      newValues: { invoice_number: invoiceNumber, grand_total: grandTotal, source },
    });
  }

  return { ok: true, invoice };
}

// ─── recordCustomerPayment ────────────────────────────────────────────────────

export async function recordCustomerPayment(opts: {
  bookingId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  paymentDate?: string;
  bankAccountId?: string;
  notes?: string;
  receivedBy?: string;
  providerPayload?: Record<string, unknown>;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  ipAddress?: string;
  source?: string;
}): Promise<RecordPaymentResult> {
  const {
    bookingId, amount, paymentMethod, paymentReference,
    paymentDate, notes, receivedBy, actorId, actorName, actorRole, source,
  } = opts;

  if (!amount || amount <= 0) return { ok: false, error: "Payment amount must be greater than zero" };
  if (!bookingId)            return { ok: false, error: "Booking ID is required" };

  const bRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
  const b = bRes.rows[0];
  if (!b) return { ok: false, error: "Booking not found" };

  // Idempotency: if this reference was already recorded, return it
  if (paymentReference) {
    const existing = await pool.query(
      `SELECT id FROM payment_transactions WHERE reference_number=$1 AND is_deleted=false LIMIT 1`,
      [paymentReference]
    );
    if (existing.rows[0]) {
      return { ok: true, paymentId: existing.rows[0].id, alreadyProcessed: true };
    }
  }

  // Advisory lock on reference to prevent concurrent races
  if (paymentReference) {
    try {
      const lockKey = parseInt(
        Buffer.from(paymentReference).toString("hex").slice(0, 14),
        16
      ) % 2147483647;
      await pool.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);
    } catch {}
  }

  const paymentId = randomUUID();
  const pDate     = paymentDate ?? new Date().toISOString().split("T")[0];

  await pool.query(
    `INSERT INTO payment_transactions
       (id, booking_id, amount, payment_mode, payment_date, reference_number,
        notes, recorded_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
    [
      paymentId, bookingId, r2(amount), paymentMethod, pDate,
      paymentReference ?? null, notes ?? null,
      receivedBy ?? actorId ?? null,
    ]
  );

  // Update booking paid_amount
  await pool.query(
    `UPDATE bookings
     SET paid_amount = COALESCE(paid_amount,0) + $1,
         online_paid_amount = CASE
           WHEN $3 IN ('razorpay','upi','card') THEN COALESCE(online_paid_amount,0) + $1
           ELSE online_paid_amount
         END,
         updated_at=NOW()
     WHERE id=$2`,
    [r2(amount), bookingId, paymentMethod]
  );

  // Recalculate financials and sync payment_status + invoice
  const fin = await calculateBookingFinancials(bookingId);
  if (fin) {
    await pool.query(
      `UPDATE bookings SET payment_status=$1 WHERE id=$2`,
      [fin.payment_status, bookingId]
    );
    await pool.query(
      `UPDATE invoices
       SET paid=$1, balance=$2,
           invoice_status = CASE WHEN $1 >= total-0.01 THEN 'paid' WHEN $1>0 THEN 'partial' ELSE 'pending' END,
           payment_status = $3,
           updated_at=NOW()
       WHERE booking_id=$4`,
      [fin.total_paid, fin.outstanding_balance, fin.payment_status, bookingId]
    );
  }

  // Ledger: credit entry (payment received = customer's balance decreases)
  await appendLedgerEntry({
    bookingId, docType: "payment", docId: paymentId,
    description: `Payment received — ${paymentMethod}${paymentReference ? ` [${paymentReference}]` : ""}`,
    debit: 0, credit: r2(amount), source: source ?? paymentMethod, createdBy: actorId,
  });

  // Generate receipt (one per payment, idempotent)
  const receipt = await generateReceiptForPayment({
    paymentId, bookingId, b, amount: r2(amount),
    paymentMethod, paymentReference, paymentDate: pDate,
    receivedBy: receivedBy ?? actorName ?? "Admin",
    totalPaid: fin?.total_paid ?? r2(amount),
    outstandingBalance: fin?.outstanding_balance ?? 0,
  });

  await writeFinanceAuditLog({
    action: "payment_recorded", entityType: "payment", entityId: paymentId,
    bookingId, actorId, actorName, actorRole, ipAddress: opts.ipAddress,
    newValues: { amount: r2(amount), method: paymentMethod, reference: paymentReference ?? null },
  });

  return { ok: true, paymentId, receiptId: receipt?.id, receiptNumber: receipt?.receipt_number };
}

// ─── generateReceiptForPayment ────────────────────────────────────────────────

interface ReceiptOpts {
  paymentId: string;
  bookingId: string;
  b: Record<string, unknown>;
  amount: number;
  paymentMethod: string;
  paymentReference?: string;
  paymentDate: string;
  receivedBy: string;
  totalPaid: number;
  outstandingBalance: number;
}

export async function generateReceiptForPayment(
  opts: ReceiptOpts
): Promise<{ id: string; receipt_number: string } | null> {
  if (opts.amount <= 0) return null; // Never generate ₹0 receipt

  // Idempotency: one receipt per payment_id
  const existing = await pool.query(
    `SELECT id, receipt_number FROM receipts WHERE payment_id=$1 LIMIT 1`,
    [opts.paymentId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const receiptNumber = await generateReceiptNumber();
  const receiptId     = randomUUID();

  await pool.query(
    `INSERT INTO receipts
       (id, receipt_number, payment_id, booking_id, customer_id, customer_name,
        booking_number, package_name, payment_date, payment_method, reference_number,
        amount, total_paid, outstanding_balance, received_by, company_name,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             'Al Burhan Tours & Travels',NOW(),NOW())`,
    [
      receiptId, receiptNumber, opts.paymentId, opts.bookingId,
      (opts.b as any).customer_id ?? null,
      (opts.b as any).customer_name ?? "",
      (opts.b as any).booking_number ?? "",
      (opts.b as any).package_name ?? "",
      opts.paymentDate, opts.paymentMethod,
      opts.paymentReference ?? null,
      opts.amount, opts.totalPaid, opts.outstandingBalance, opts.receivedBy,
    ]
  );

  await writeFinanceAuditLog({
    action: "receipt_generated", entityType: "receipt", entityId: receiptId,
    bookingId: opts.bookingId,
    newValues: {
      receipt_number: receiptNumber,
      amount: opts.amount,
      payment_id: opts.paymentId,
    },
  });

  return { id: receiptId, receipt_number: receiptNumber };
}

// ─── getFinanceSettings ───────────────────────────────────────────────────────

export async function getFinanceSettings(): Promise<Record<string, string | number | boolean>> {
  try {
    const r = await pool.query(`
      SELECT
        gst_rate, tcs_rate, gst_enabled, tcs_enabled,
        standard_advance_pct, balance_due_after_days,
        discount_full_payment_required, block_visa_balance_pending,
        default_currency, sar_reference_rate, spc_charge
      FROM booking_settings WHERE id='default' LIMIT 1
    `);
    const row = r.rows[0] ?? {};
    return {
      gst_rate:                       Number(row.gst_rate ?? 5),
      tcs_rate:                       Number(row.tcs_rate ?? 2),
      gst_enabled:                    row.gst_enabled ?? true,
      tcs_enabled:                    row.tcs_enabled ?? false,
      standard_advance_pct:           Number(row.standard_advance_pct ?? 50),
      balance_due_after_days:         Number(row.balance_due_after_days ?? 50),
      discount_full_payment_required: row.discount_full_payment_required ?? true,
      block_visa_balance_pending:     row.block_visa_balance_pending ?? true,
      default_currency:               row.default_currency ?? "INR",
      sar_reference_rate:             Number(row.sar_reference_rate ?? 25.70),
      spc_charge:                     Number(row.spc_charge ?? 5500),
    };
  } catch {
    return {
      gst_rate: 5, tcs_rate: 2, gst_enabled: true, tcs_enabled: false,
      standard_advance_pct: 50, balance_due_after_days: 50,
      discount_full_payment_required: true, block_visa_balance_pending: true,
      default_currency: "INR", sar_reference_rate: 25.70, spc_charge: 5500,
    };
  }
}

// ─── checkVisaPaymentEligibility ─────────────────────────────────────────────
// Server-side guard. Call before marking any pilgrim visa as issued/received.

export async function checkVisaPaymentEligibility(
  bookingId: string
): Promise<VisaEligibilityResult> {
  const settings = await getFinanceSettings();
  if (!settings.block_visa_balance_pending) return { eligible: true };

  const fin = await calculateBookingFinancials(bookingId);
  if (!fin) return { eligible: false, reason: "Booking not found" };

  const advancePct      = Number(settings.standard_advance_pct) / 100;
  const requiredAdvance = r2(fin.grand_total * advancePct);

  if (fin.grand_total <= 0) return { eligible: true }; // No amount — don't block

  if (fin.net_paid < requiredAdvance - 0.01) {
    return {
      eligible: false,
      reason: `Required advance of ₹${requiredAdvance.toLocaleString("en-IN")} not received. Current paid: ₹${fin.net_paid.toLocaleString("en-IN")}`,
      outstanding: fin.outstanding_balance,
      required_advance: requiredAdvance,
      current_paid: fin.net_paid,
    };
  }

  return {
    eligible: true,
    current_paid: fin.net_paid,
    outstanding: fin.outstanding_balance,
  };
}
