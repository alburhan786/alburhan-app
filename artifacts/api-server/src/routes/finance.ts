// @ts-nocheck
/**
 * routes/finance.ts
 * Finance & Accounts Foundation — Phase 1 API routes.
 *
 * Mounted at: /api/finance
 *
 * Routes:
 *   GET  /dashboard                      — Phase 1 KPI cards
 *   GET  /settings                       — Finance settings
 *   PUT  /settings                       — Update finance settings
 *   GET  /bookings/:id/financials        — calculateBookingFinancials
 *   POST /bookings/:id/invoices          — createOrUpdateBookingInvoice
 *   POST /bookings/:id/payments          — recordCustomerPayment
 *   GET  /invoices                       — Invoice list with search/filter
 *   GET  /invoices/:id                   — Single invoice
 *   POST /invoices/:id/void              — Void an invoice
 *   GET  /payments                       — Payment list
 *   GET  /receipts                       — Receipt list
 *   GET  /receipts/:id                   — Single receipt
 *   GET  /outstanding                    — Customer outstanding
 *   GET  /ledger/:bookingId              — Booking ledger (debit/credit entries)
 *   GET  /refunds                        — Refund list
 *   POST /refunds                        — Create refund request
 *   POST /refunds/:id/approve            — Approve refund
 *   GET  /audit-logs                     — Finance audit log
 *   GET  /visa-eligibility/:bookingId    — Check visa payment eligibility
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import {
  calculateBookingFinancials,
  createOrUpdateBookingInvoice,
  recordCustomerPayment,
  getFinanceSettings,
  checkVisaPaymentEligibility,
  generateRefundNumber,
  generateReceiptForPayment,
  type InvoiceSource,
  type PaymentMethod,
} from "../lib/financeService.js";

const router = Router();

// All finance routes require admin
router.use(requireAdmin as any);

async function q(sql: string, params?: any[]): Promise<any[]> {
  return (await pool.query(sql, params)).rows ?? [];
}
async function q1(sql: string, params?: any[]): Promise<any> {
  return (await pool.query(sql, params)).rows?.[0] ?? null;
}

// ─── GET /dashboard ────────────────────────────────────────────────────────────
// Phase 1 finance KPI cards, computed from actual DB records.
// Supports ?range=today|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD

router.get("/dashboard", async (req: AuthenticatedRequest, res) => {
  try {
    const { range, from, to } = req.query as Record<string, string>;
    const today        = new Date().toISOString().split("T")[0];
    const firstOfMonth = today.slice(0, 8) + "01";
    const firstOfWeek  = new Date(Date.now() - 6 * 864e5).toISOString().split("T")[0];

    let dateFrom: string, dateTo: string;
    if (range === "today")  { dateFrom = today;        dateTo = today; }
    else if (range === "week")  { dateFrom = firstOfWeek;   dateTo = today; }
    else if (range === "month") { dateFrom = firstOfMonth;  dateTo = today; }
    else if (from && to)        { dateFrom = from;          dateTo = to; }
    else                        { dateFrom = firstOfMonth;  dateTo = today; }

    const [
      totals,
      todayCollected,
      monthCollected,
      unpaidCount,
      partialCount,
      overdueRows,
      refundsTotal,
    ] = await Promise.all([
      // Total invoiced / collected / outstanding / refunded (all-time)
      q1(`
        SELECT
          COALESCE(SUM(i.grand_total::numeric),0)                           AS total_invoiced,
          COALESCE(SUM(pt.paid::numeric),0)                                 AS total_collected,
          COALESCE(SUM(GREATEST(i.balance::numeric, 0)),0)                  AS total_outstanding
        FROM invoices i
        LEFT JOIN (
          SELECT booking_id, COALESCE(SUM(amount::numeric),0) AS paid
          FROM payment_transactions WHERE is_deleted=false GROUP BY booking_id
        ) pt ON pt.booking_id=i.booking_id
        WHERE i.is_void=false
      `),
      // Today's collection
      q1(`
        SELECT COALESCE(SUM(amount::numeric),0) AS collected
        FROM payment_transactions
        WHERE payment_date::date = CURRENT_DATE AND is_deleted=false
      `),
      // This month's collection (filtered range)
      q1(`
        SELECT COALESCE(SUM(amount::numeric),0) AS collected
        FROM payment_transactions
        WHERE payment_date::date BETWEEN $1 AND $2 AND is_deleted=false
      `, [dateFrom, dateTo]),
      // Unpaid bookings count
      q1(`
        SELECT COUNT(*)::int AS cnt FROM invoices
        WHERE payment_status='unpaid' AND is_void=false
      `),
      // Partially paid bookings count
      q1(`
        SELECT COUNT(*)::int AS cnt FROM invoices
        WHERE payment_status='partially_paid' AND is_void=false
      `),
      // Overdue balances (due_date passed, still has outstanding)
      q(`
        SELECT i.booking_id, i.invoice_number, b.customer_name, b.customer_mobile,
               i.due_date, i.balance::numeric AS balance,
               DATE_PART('day', NOW() - i.due_date)::int AS days_overdue
        FROM invoices i
        JOIN bookings b ON b.id=i.booking_id
        WHERE i.due_date < NOW() AND i.balance > 0.01 AND i.is_void=false
        ORDER BY i.due_date ASC LIMIT 20
      `),
      // Total refunded
      q1(`
        SELECT COALESCE(SUM(amount::numeric),0) AS total_refunded
        FROM refunds WHERE status IN ('approved','processed')
      `),
    ]);

    res.json({
      period:            { from: dateFrom, to: dateTo },
      total_invoiced:    Number(totals?.total_invoiced ?? 0),
      total_collected:   Number(totals?.total_collected ?? 0),
      total_outstanding: Number(totals?.total_outstanding ?? 0),
      total_refunded:    Number(refundsTotal?.total_refunded ?? 0),
      today_collection:  Number(todayCollected?.collected ?? 0),
      period_collection: Number(monthCollected?.collected ?? 0),
      unpaid_count:      Number(unpaidCount?.cnt ?? 0),
      partial_count:     Number(partialCount?.cnt ?? 0),
      overdue_balances:  overdueRows,
    });
  } catch (err: any) {
    console.error("[finance] dashboard:", err);
    res.status(500).json({ error: "Failed to load finance dashboard" });
  }
});

// ─── GET /settings ────────────────────────────────────────────────────────────

router.get("/settings", async (_req: AuthenticatedRequest, res) => {
  try {
    const settings = await getFinanceSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load finance settings" });
  }
});

// ─── PUT /settings ────────────────────────────────────────────────────────────

router.put("/settings", async (req: AuthenticatedRequest, res) => {
  try {
    const {
      gst_rate, tcs_rate, gst_enabled, tcs_enabled,
      standard_advance_pct, balance_due_after_days,
      discount_full_payment_required, block_visa_balance_pending,
      default_currency, sar_reference_rate, spc_charge,
    } = req.body;

    const updates: string[] = [];
    const values: any[]     = [];
    let idx = 1;

    const addCol = (col: string, val: unknown) => {
      if (val !== undefined && val !== null) {
        updates.push(`${col}=$${idx++}`);
        values.push(val);
      }
    };

    addCol("gst_rate",                       gst_rate);
    addCol("tcs_rate",                       tcs_rate);
    addCol("gst_enabled",                    gst_enabled);
    addCol("tcs_enabled",                    tcs_enabled);
    addCol("standard_advance_pct",           standard_advance_pct);
    addCol("balance_due_after_days",         balance_due_after_days);
    addCol("discount_full_payment_required", discount_full_payment_required);
    addCol("block_visa_balance_pending",     block_visa_balance_pending);
    addCol("default_currency",               default_currency);
    addCol("sar_reference_rate",             sar_reference_rate);
    addCol("spc_charge",                     spc_charge);
    updates.push("updated_at=NOW()");

    if (updates.length <= 1) return void res.status(400).json({ error: "No valid fields provided" });

    values.push("default");
    await pool.query(
      `UPDATE booking_settings SET ${updates.join(",")} WHERE id=$${idx}`,
      values
    );

    // Audit log for tax setting changes
    await pool.query(
      `INSERT INTO finance_audit_logs
         (id, action, entity_type, entity_id, actor_id, actor_name, new_values, created_at)
       VALUES (gen_random_uuid()::text,'tax_setting_changed','setting','booking_settings',$1,$2,$3,NOW())`,
      [
        (req as any).user?.id ?? null,
        (req as any).user?.name ?? null,
        JSON.stringify(req.body),
      ]
    );

    res.json({ ok: true, settings: await getFinanceSettings() });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update finance settings" });
  }
});

// ─── GET /bookings/:id/financials ─────────────────────────────────────────────

router.get("/bookings/:id/financials", async (req: AuthenticatedRequest, res) => {
  try {
    const fin = await calculateBookingFinancials(req.params.id);
    if (!fin) return void res.status(404).json({ error: "Booking not found" });
    res.json(fin);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /bookings/:id/invoices ──────────────────────────────────────────────

router.post("/bookings/:id/invoices", async (req: AuthenticatedRequest, res) => {
  try {
    const { source, payment_terms } = req.body;
    if (!source) return void res.status(400).json({ error: "source is required" });

    const result = await createOrUpdateBookingInvoice({
      bookingId:    req.params.id,
      source:       source as InvoiceSource,
      actorId:      (req as any).user?.id,
      actorName:    (req as any).user?.name,
      actorRole:    (req as any).user?.role,
      ipAddress:    req.ip,
      paymentTerms: payment_terms,
    });

    if (!result.ok) {
      return void res.status(result.failures ? 422 : 400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /bookings/:id/payments ──────────────────────────────────────────────

router.post("/bookings/:id/payments", async (req: AuthenticatedRequest, res) => {
  try {
    const {
      amount, payment_method, payment_reference, payment_date,
      bank_account_id, notes, received_by,
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return void res.status(400).json({ error: "amount must be greater than zero" });
    }

    const result = await recordCustomerPayment({
      bookingId:        req.params.id,
      amount:           Number(amount),
      paymentMethod:    (payment_method ?? "cash") as PaymentMethod,
      paymentReference: payment_reference,
      paymentDate:      payment_date,
      bankAccountId:    bank_account_id,
      notes,
      receivedBy:       received_by,
      actorId:          (req as any).user?.id,
      actorName:        (req as any).user?.name,
      actorRole:        (req as any).user?.role,
      ipAddress:        req.ip,
      source:           "admin_manual",
    });

    if (!result.ok) return void res.status(400).json({ error: result.error });
    if (result.alreadyProcessed) return void res.json({ ...result, message: "Payment already recorded" });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /invoices ─────────────────────────────────────────────────────────────

router.get("/invoices", async (req: AuthenticatedRequest, res) => {
  try {
    const { search, status, from, to, page = "1", limit = "50" } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE i.is_void=false`;

    if (status) { params.push(status);   where += ` AND i.payment_status=$${params.length}`; }
    if (from)   { params.push(from);     where += ` AND i.invoice_date::date >= $${params.length}`; }
    if (to)     { params.push(to);       where += ` AND i.invoice_date::date <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (i.invoice_number ILIKE $${params.length} OR i.customer_name ILIKE $${params.length} OR b.booking_number ILIKE $${params.length})`;
    }

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const rows = await q(`
      SELECT i.*, b.booking_number, b.customer_mobile, b.package_name AS b_package,
             b.status AS booking_status
      FROM invoices i
      LEFT JOIN bookings b ON b.id=i.booking_id
      ${where}
      ORDER BY i.invoice_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countRes = await q1(`
      SELECT COUNT(*)::int AS total FROM invoices i
      LEFT JOIN bookings b ON b.id=i.booking_id ${where}
    `, params.slice(0, -2));

    res.json({ invoices: rows, total: countRes?.total ?? rows.length, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// ─── GET /invoices/:id ────────────────────────────────────────────────────────

router.get("/invoices/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const inv = await q1(`
      SELECT i.*, b.booking_number, b.customer_mobile, b.status AS booking_status
      FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id
      WHERE i.id=$1 OR i.invoice_number=$1 LIMIT 1
    `, [req.params.id]);
    if (!inv) return void res.status(404).json({ error: "Invoice not found" });
    res.json(inv);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

// ─── POST /invoices/:id/void ──────────────────────────────────────────────────
// Void an issued invoice. Requires reason. Does NOT delete.

router.post("/invoices/:id/void", async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return void res.status(400).json({ error: "Reason is required to void an invoice" });

    const inv = await q1(`SELECT * FROM invoices WHERE id=$1 LIMIT 1`, [req.params.id]);
    if (!inv) return void res.status(404).json({ error: "Invoice not found" });
    if (inv.is_void) return void res.status(400).json({ error: "Invoice is already voided" });
    if (Number(inv.paid) > 0) return void res.status(400).json({ error: "Cannot void an invoice that has payments — create a refund instead" });

    const actorId   = (req as any).user?.id;
    const actorName = (req as any).user?.name;

    await pool.query(
      `UPDATE invoices SET is_void=true, void_reason=$1, voided_at=NOW(), voided_by=$2,
         invoice_status='void', payment_status='void', updated_at=NOW()
       WHERE id=$3`,
      [reason, actorName ?? actorId ?? "Admin", req.params.id]
    );
    await pool.query(
      `INSERT INTO finance_audit_logs
         (id, action, entity_type, entity_id, booking_id, actor_id, actor_name, reason, created_at)
       VALUES (gen_random_uuid()::text,'invoice_voided','invoice',$1,$2,$3,$4,$5,NOW())`,
      [req.params.id, inv.booking_id, actorId, actorName, reason]
    );
    res.json({ ok: true, message: "Invoice voided" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /payments ─────────────────────────────────────────────────────────────

router.get("/payments", async (req: AuthenticatedRequest, res) => {
  try {
    const { search, from, to, method, page = "1", limit = "50" } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE pt.is_deleted=false`;

    if (from)   { params.push(from);   where += ` AND pt.payment_date >= $${params.length}`; }
    if (to)     { params.push(to);     where += ` AND pt.payment_date <= $${params.length}`; }
    if (method) { params.push(method); where += ` AND pt.payment_mode=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (b.customer_name ILIKE $${params.length} OR b.booking_number ILIKE $${params.length} OR pt.reference_number ILIKE $${params.length})`;
    }

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const rows = await q(`
      SELECT pt.*, b.booking_number, b.customer_name, b.customer_mobile,
             r.receipt_number
      FROM payment_transactions pt
      LEFT JOIN bookings b ON b.id=pt.booking_id
      LEFT JOIN receipts r ON r.payment_id=pt.id
      ${where}
      ORDER BY pt.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ payments: rows, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ─── GET /receipts ─────────────────────────────────────────────────────────────

router.get("/receipts", async (req: AuthenticatedRequest, res) => {
  try {
    const { search, from, to, page = "1", limit = "50" } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE r.is_void=false`;

    if (from)   { params.push(from);   where += ` AND r.payment_date >= $${params.length}`; }
    if (to)     { params.push(to);     where += ` AND r.payment_date <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (r.receipt_number ILIKE $${params.length} OR r.customer_name ILIKE $${params.length} OR r.booking_number ILIKE $${params.length})`;
    }

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const rows = await q(`
      SELECT r.* FROM receipts r ${where}
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ receipts: rows, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch receipts" });
  }
});

// ─── GET /receipts/:id ────────────────────────────────────────────────────────

router.get("/receipts/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const r = await q1(
      `SELECT * FROM receipts WHERE id=$1 OR receipt_number=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!r) return void res.status(404).json({ error: "Receipt not found" });
    res.json(r);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch receipt" });
  }
});

// ─── GET /outstanding ─────────────────────────────────────────────────────────

router.get("/outstanding", async (req: AuthenticatedRequest, res) => {
  try {
    const { search, overdue_only } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE i.is_void=false AND i.balance > 0.01`;

    if (overdue_only === "true") { where += ` AND i.due_date < NOW()`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (i.customer_name ILIKE $${params.length} OR b.booking_number ILIKE $${params.length})`;
    }

    const rows = await q(`
      SELECT
        i.invoice_number, i.booking_id, b.booking_number,
        i.customer_name, b.customer_mobile,
        b.package_name, i.grand_total::numeric AS total,
        i.paid::numeric AS paid, i.balance::numeric AS balance,
        i.due_date, i.payment_status,
        CASE WHEN i.due_date < NOW() THEN DATE_PART('day', NOW()-i.due_date)::int ELSE 0 END AS days_overdue
      FROM invoices i
      JOIN bookings b ON b.id=i.booking_id
      ${where}
      ORDER BY i.due_date ASC NULLS LAST
    `, params);

    const summary = {
      total_outstanding: rows.reduce((s, r) => s + Number(r.balance), 0),
      overdue_count:     rows.filter(r => r.days_overdue > 0).length,
      total_count:       rows.length,
    };

    res.json({ rows, summary });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch outstanding" });
  }
});

// ─── GET /ledger/:bookingId ────────────────────────────────────────────────────

router.get("/ledger/:bookingId", async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const entries = await q(`
      SELECT * FROM customer_ledger_entries
      WHERE booking_id=$1 ORDER BY created_at ASC, id ASC
    `, [bookingId]);

    // Current financials for reconciliation
    const fin = await calculateBookingFinancials(bookingId);
    const closing = entries.length > 0
      ? Number(entries[entries.length - 1].running_balance)
      : 0;

    const reconciles = fin
      ? Math.abs(closing - fin.outstanding_balance) < 0.02
      : null;

    res.json({ entries, closing_balance: closing, financials: fin, reconciles });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

// ─── GET /refunds ─────────────────────────────────────────────────────────────

router.get("/refunds", async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE 1=1`;
    if (status) { params.push(status); where += ` AND rf.status=$${params.length}`; }

    const rows = await q(`
      SELECT rf.*, b.booking_number, b.customer_name, b.customer_mobile
      FROM refunds rf LEFT JOIN bookings b ON b.id=rf.booking_id
      ${where}
      ORDER BY rf.created_at DESC LIMIT 100
    `, params);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch refunds" });
  }
});

// ─── POST /refunds ────────────────────────────────────────────────────────────

router.post("/refunds", async (req: AuthenticatedRequest, res) => {
  try {
    const {
      booking_id, payment_id, amount, refund_method,
      refund_reason, reference_number, notes,
    } = req.body;

    if (!booking_id)    return void res.status(400).json({ error: "booking_id required" });
    if (!amount || Number(amount) <= 0) return void res.status(400).json({ error: "amount must be > 0" });
    if (!refund_reason) return void res.status(400).json({ error: "refund_reason required" });

    // Check refund amount doesn't exceed refundable balance
    const fin = await calculateBookingFinancials(booking_id);
    if (!fin) return void res.status(404).json({ error: "Booking not found" });

    const refundable = fin.total_paid - fin.total_refunded;
    if (Number(amount) > refundable + 0.01) {
      return void res.status(400).json({
        error: `Refund amount ₹${amount} exceeds refundable balance ₹${refundable.toFixed(2)}`,
      });
    }

    const refundNumber = await generateRefundNumber();
    const id = await pool.query(
      `INSERT INTO refunds
         (id, refund_number, booking_id, payment_id, amount, refund_method,
          refund_reason, reference_number, requested_by, status, notes, created_at, updated_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NOW(),NOW())
       RETURNING id, refund_number`,
      [
        refundNumber, booking_id, payment_id ?? null, Number(amount),
        refund_method ?? "bank_transfer", refund_reason,
        reference_number ?? null,
        (req as any).user?.name ?? (req as any).user?.id ?? "Admin",
        notes ?? null,
      ]
    );

    await pool.query(
      `INSERT INTO finance_audit_logs
         (id, action, entity_type, entity_id, booking_id, actor_id, actor_name, new_values, created_at)
       VALUES (gen_random_uuid()::text,'refund_requested','refund',$1,$2,$3,$4,$5,NOW())`,
      [
        id.rows[0].id, booking_id,
        (req as any).user?.id, (req as any).user?.name,
        JSON.stringify({ amount, refund_reason, refund_method }),
      ]
    );

    res.status(201).json({ ok: true, refund_id: id.rows[0].id, refund_number: refundNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /refunds/:id/approve ────────────────────────────────────────────────

router.post("/refunds/:id/approve", async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    const refund = await q1(`SELECT * FROM refunds WHERE id=$1 LIMIT 1`, [req.params.id]);
    if (!refund) return void res.status(404).json({ error: "Refund not found" });
    if (refund.status !== "pending") return void res.status(400).json({ error: `Refund is already ${refund.status}` });

    const actorId   = (req as any).user?.id;
    const actorName = (req as any).user?.name ?? "Admin";

    await pool.query(
      `UPDATE refunds SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [actorName, req.params.id]
    );

    // Ledger: debit entry for refund (refund = customer balance increases)
    await pool.query(`
      INSERT INTO customer_ledger_entries
        (id, booking_id, entry_date, doc_type, doc_number, doc_id, description,
         debit, credit, running_balance, source, created_by, created_at)
      SELECT gen_random_uuid()::text, $1, NOW(), 'refund', $2, $3,
             'Refund approved — ' || $4,
             $5::numeric, 0,
             COALESCE((SELECT running_balance FROM customer_ledger_entries WHERE booking_id=$1
                       ORDER BY created_at DESC, id DESC LIMIT 1), 0) + $5::numeric,
             'refund', $6, NOW()
    `, [refund.booking_id, refund.refund_number, req.params.id, refund.refund_reason, refund.amount, actorId]);

    await pool.query(
      `INSERT INTO finance_audit_logs
         (id, action, entity_type, entity_id, booking_id, actor_id, actor_name, reason, created_at)
       VALUES (gen_random_uuid()::text,'refund_approved','refund',$1,$2,$3,$4,$5,NOW())`,
      [req.params.id, refund.booking_id, actorId, actorName, reason ?? null]
    );

    res.json({ ok: true, message: "Refund approved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /audit-logs ──────────────────────────────────────────────────────────

router.get("/audit-logs", async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id, action, from, to, limit = "100" } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = `WHERE 1=1`;

    if (booking_id) { params.push(booking_id); where += ` AND booking_id=$${params.length}`; }
    if (action)     { params.push(action);     where += ` AND action=$${params.length}`; }
    if (from)       { params.push(from);       where += ` AND created_at::date >= $${params.length}`; }
    if (to)         { params.push(to);         where += ` AND created_at::date <= $${params.length}`; }

    params.push(Number(limit));
    const rows = await q(
      `SELECT * FROM finance_audit_logs ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ─── GET /visa-eligibility/:bookingId ─────────────────────────────────────────

router.get("/visa-eligibility/:bookingId", async (req: AuthenticatedRequest, res) => {
  try {
    const result = await checkVisaPaymentEligibility(req.params.bookingId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
