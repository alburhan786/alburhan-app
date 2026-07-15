// @ts-nocheck
import { Router, type RequestHandler } from "express";
import { db, pool, bookingsTable, paymentTransactionsTable, customerProfilesTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, requirePermission, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import { upsertPilgrimFromProfile } from "../lib/pilgrimUtils.js";
import { postPaymentJournal, voidJournalEntry } from "../lib/journalHelper.js";
import { upsertInvoiceForBooking } from "./invoices.js";
import { processPaymentSuccessNotifications } from "./payments.js";

type BookingStatus = "pending" | "approved" | "rejected" | "confirmed" | "cancelled" | "partially_paid";
type PaymentMode = "cash" | "neft" | "upi" | "cheque" | "online" | "bank_transfer" | "imps" | "rtgs" | "dd";
type DbOrTx = typeof db;

const PAYABLE_STATUSES: BookingStatus[] = ["approved", "partially_paid", "confirmed"];
const VALID_MODES: PaymentMode[] = ["cash", "neft", "upi", "cheque", "online", "bank_transfer", "imps", "rtgs", "dd"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const router = Router();
router.use(requireModuleAccess("payments") as any);

function generateInvoiceNumber(): string {
  return `INV${Date.now().toString().slice(-8)}`;
}

async function recalculateBookingPayment(_tx: DbOrTx, bookingId: string) {
  // Use pool.query throughout — avoids VPS drizzle bundling quirks with db.execute()
  const bookingRes = await pool.query(
    `SELECT id, status, final_amount, paid_amount, online_paid_amount, invoice_number FROM bookings WHERE id=$1 LIMIT 1`,
    [bookingId]
  );
  const booking = bookingRes.rows[0];
  if (!booking) return;

  // Sum only non-deleted transactions for this booking
  const sumRes = await pool.query(
    `SELECT COALESCE(SUM(amount::numeric), 0) AS total
     FROM payment_transactions
     WHERE booking_id=$1 AND is_deleted=false`,
    [bookingId]
  );
  const ledgerSum = Number(sumRes.rows[0]?.total ?? 0);
  const onlinePaidAmount = Number(booking.online_paid_amount ?? 0);
  const totalPaid = onlinePaidAmount + ledgerSum;
  const finalAmount = Number(booking.final_amount ?? 0);

  let newStatus: BookingStatus = booking.status as BookingStatus;
  let invoiceNumber: string | null = booking.invoice_number ?? null;

  if (PAYABLE_STATUSES.includes(newStatus)) {
    if (totalPaid === 0) {
      newStatus = "approved";
    } else if (finalAmount > 0 && totalPaid >= finalAmount) {
      newStatus = "confirmed";
      if (!invoiceNumber) invoiceNumber = generateInvoiceNumber();
    } else {
      newStatus = "partially_paid";
    }
  }

  await pool.query(
    `UPDATE bookings SET paid_amount=$1, online_paid_amount=$2, status=$3, invoice_number=$4, updated_at=NOW() WHERE id=$5`,
    [String(totalPaid), String(onlinePaidAmount), newStatus, invoiceNumber, bookingId]
  );

  return { totalPaid, ledgerSum, onlinePaidAmount, newStatus, invoiceNumber };
}

async function ensureOnlineBaselineSeeded(tx: DbOrTx, bookingId: string, booking: { paidAmount: string | null; onlinePaidAmount: string | null }) {
  const priorPaid = Number(booking.paidAmount ?? 0);
  const currentOnline = Number(booking.onlinePaidAmount ?? 0);
  if (currentOnline === 0 && priorPaid > 0) {
    const [row] = await tx
      .select({ n: count() })
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.bookingId, bookingId));
    if (Number(row?.n ?? 0) === 0) {
      await tx
        .update(bookingsTable)
        .set({ onlinePaidAmount: String(priorPaid) })
        .where(eq(bookingsTable.id, bookingId));
    }
  }
}

async function writeAuditLog(opts: {
  transactionId: string;
  bookingId: string;
  action: string;
  oldAmount?: number;
  newAmount?: number;
  oldMode?: string;
  newMode?: string;
  oldDate?: string;
  newDate?: string;
  changedBy?: string | null;
  changedByName?: string | null;
  changeReason?: string | null;
}) {
  try {
    await pool.query(
      `INSERT INTO payment_audit_logs
        (id, transaction_id, booking_id, action, old_amount, new_amount, old_mode, new_mode, old_date, new_date, changed_by, changed_by_name, change_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        crypto.randomUUID(),
        opts.transactionId,
        opts.bookingId,
        opts.action,
        opts.oldAmount ?? null,
        opts.newAmount ?? null,
        opts.oldMode ?? null,
        opts.newMode ?? null,
        opts.oldDate ?? null,
        opts.newDate ?? null,
        opts.changedBy ?? null,
        opts.changedByName ?? null,
        opts.changeReason ?? null,
      ]
    );
  } catch {
    // audit log failure should not break the main operation
  }
}

// GET /:id/payments — list all transactions for a booking
router.get("/:id/payments", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const includeDeleted = req.query["includeDeleted"] === "1";

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return void res.status(404).json({ message: "Booking not found" });

    const rows = await pool.query(
      `SELECT * FROM payment_transactions WHERE booking_id = $1 ORDER BY payment_date ASC, created_at ASC`,
      [bookingId]
    );
    const entries = rows.rows.filter((e: Record<string, unknown>) => includeDeleted || !e["is_deleted"]);

    return void res.json(entries.map((e: Record<string, unknown>) => ({
      id: e["id"],
      bookingId: e["booking_id"],
      amount: Number(e["amount"]),
      paymentDate: e["payment_date"],
      paymentMode: e["payment_mode"],
      referenceNumber: e["reference_number"],
      bankName: e["bank_name"],
      receivedBy: e["received_by"],
      notes: e["notes"],
      recordedBy: e["recorded_by"],
      createdAt: e["created_at"],
      editedAt: e["edited_at"],
      editedBy: e["edited_by"],
      isDeleted: Boolean(e["is_deleted"]),
      deletedAt: e["deleted_at"],
      deletedBy: e["deleted_by"],
      deletionReason: e["deletion_reason"],
    })));
  } catch (err) {
    console.error("[admin-payments] GET error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// GET /:id/payments/:txnId/history — audit log for a transaction
router.get("/:id/payments/:txnId/history", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const txnId = req.params["txnId"];
    const rows = await pool.query(
      `SELECT * FROM payment_audit_logs WHERE transaction_id = $1 ORDER BY changed_at DESC`,
      [txnId]
    );
    return void res.json(rows.rows);
  } catch (err) {
    console.error("[admin-payments] history error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// POST /:id/payments — add new payment
router.post("/:id/payments", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const { amount, paymentDate, paymentMode, referenceNumber, bankName, receivedBy, notes } = req.body as Record<string, unknown>;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return void res.status(400).json({ message: "Valid amount is required" });
    if (!paymentDate || typeof paymentDate !== "string" || !ISO_DATE_RE.test(paymentDate))
      return void res.status(400).json({ message: "Payment date must be in YYYY-MM-DD format" });
    if (!paymentMode || !VALID_MODES.includes(paymentMode as PaymentMode))
      return void res.status(400).json({ message: "Valid payment mode is required" });

    const result = await db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });
      if (!PAYABLE_STATUSES.includes(booking.status as BookingStatus))
        throw Object.assign(new Error(`Cannot record payment for a ${booking.status} booking`), { statusCode: 422 });

      await ensureOnlineBaselineSeeded(tx, bookingId, booking);

      const txnId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO payment_transactions (id, booking_id, amount, payment_date, payment_mode, reference_number, bank_name, received_by, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [txnId, bookingId, String(Number(amount)), paymentDate, paymentMode, referenceNumber ?? null, bankName ?? null, receivedBy ?? null, notes ?? null, req.user?.id ?? null]
      );

      const updated = await recalculateBookingPayment(tx, bookingId);

      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];

      await writeAuditLog({
        transactionId: txnId, bookingId, action: "created",
        newAmount: Number(amount), newMode: String(paymentMode), newDate: String(paymentDate),
        changedBy: req.user?.id, changedByName: req.user?.name,
      });
      auditLog({ req, action: "created", entityTable: "payments", entityId: txnId, newValue: { bookingId, amount, paymentMode, paymentDate } }).catch(() => {});

      return { entry, updated, booking };
    });

    // Auto-post double-entry journal (fire-and-forget, non-fatal)
    postPaymentJournal({
      txnId: result.entry.id,
      amount: Number(result.entry.amount),
      mode: String(paymentMode),
      date: String(paymentDate),
      bookingNumber: bookingId,
    }).catch(() => {});

    // Always fire payment notifications regardless of booking status transition.
    // The previous `if (isPaymentStatus)` gate silently skipped notifications when
    // recalculateBookingPayment returned "approved" (e.g. first-time cash payment where
    // the DB status was already set elsewhere). We now always notify on any recorded payment.
    const isFullyPaid = result.updated?.newStatus === "confirmed";
    const newPaidAmount = result.updated?.totalPaid ?? Number(amount);
    const remainingBalance = Math.max(0, Number(result.booking.finalAmount || 0) - newPaidAmount);

    // Await invoice upsert so we have the real invoice number for notifications
    let finalInvoiceNumber: string | null | undefined = result.updated?.invoiceNumber;
    try {
      const upserted = await upsertInvoiceForBooking(bookingId);
      if (upserted?.invoice_number) {
        finalInvoiceNumber = upserted.invoice_number as string;
        await pool.query(
          `UPDATE bookings SET invoice_number=$1, updated_at=NOW() WHERE id=$2 AND (invoice_number IS NULL OR invoice_number='')`,
          [finalInvoiceNumber, bookingId]
        );
      }
    } catch (err) {
      console.error("[admin-payments] upsertInvoice failed:", err);
    }

    // Advance journey_status to payment_received if still at a pre-payment stage
    pool.query(
      `UPDATE bookings SET journey_status = 'payment_received', updated_at = NOW()
       WHERE id = $1
         AND journey_status IN ('booking_requested','documents_pending','documents_received','admin_verification','payment_pending')`,
      [bookingId]
    ).catch((err: any) => console.error("[admin-payments] journey_status advance failed:", err?.message));

    console.log(`[admin-payments] Firing payment notification: booking=${result.booking.bookingNumber} amount=${amount} newStatus=${result.updated?.newStatus} newPaid=${newPaidAmount} remaining=${remainingBalance} invoice=${finalInvoiceNumber}`);
    processPaymentSuccessNotifications({
      booking: {
        id: bookingId,
        bookingNumber: result.booking.bookingNumber ?? "",
        customerName: result.booking.customerName ?? "",
        customerMobile: result.booking.customerMobile ?? "",
        customerEmail: result.booking.customerEmail,
        packageName: result.booking.packageName,
        numberOfPilgrims: result.booking.numberOfPilgrims,
        finalAmount: result.booking.finalAmount,
      },
      isFullyPaid,
      thisPaymentAmount: Number(amount),
      newPaidAmount,
      remainingBalance,
      invoiceNumber: finalInvoiceNumber,
      paymentRef: typeof referenceNumber === "string" ? referenceNumber : undefined,
    }).catch((err) => console.error("[admin-payments] processPaymentSuccessNotifications failed:", err));

    return void res.status(201).json({
      entry: { ...result.entry, amount: Number(result.entry.amount) },
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus, invoiceNumber: result.updated?.invoiceNumber },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 422)
      return void res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] POST error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /:id/payments/:txnId — edit payment
router.patch("/:id/payments/:txnId", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: bookingId, txnId } = req.params as Record<string, string>;
    const { amount, paymentDate, paymentMode, referenceNumber, bankName, receivedBy, notes } = req.body as Record<string, unknown>;

    const result = await db.transaction(async (tx) => {
      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];
      if (!entry || entry.booking_id !== bookingId) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
      if (entry.is_deleted) throw Object.assign(new Error("Cannot edit a deleted payment"), { statusCode: 422 });

      if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0))
        throw Object.assign(new Error("Valid amount is required"), { statusCode: 400 });
      if (paymentDate !== undefined && (typeof paymentDate !== "string" || !ISO_DATE_RE.test(paymentDate)))
        throw Object.assign(new Error("Payment date must be YYYY-MM-DD"), { statusCode: 400 });
      if (paymentMode !== undefined && !VALID_MODES.includes(paymentMode as PaymentMode))
        throw Object.assign(new Error("Invalid payment mode"), { statusCode: 400 });

      const newAmount = amount !== undefined ? String(Number(amount)) : entry.amount;
      const newDate = paymentDate !== undefined ? paymentDate : entry.payment_date;
      const newMode = paymentMode !== undefined ? paymentMode : entry.payment_mode;
      const newRef = referenceNumber !== undefined ? (referenceNumber as string | null) : entry.reference_number;
      const newBank = bankName !== undefined ? (bankName as string | null) : entry.bank_name;
      const newRcvd = receivedBy !== undefined ? (receivedBy as string | null) : entry.received_by;
      const newNotes = notes !== undefined ? (notes as string | null) : entry.notes;

      await pool.query(
        `UPDATE payment_transactions SET amount=$1, payment_date=$2, payment_mode=$3, reference_number=$4, bank_name=$5, received_by=$6, notes=$7, edited_at=NOW(), edited_by=$8 WHERE id=$9`,
        [newAmount, newDate, newMode, newRef, newBank, newRcvd, newNotes, req.user?.id ?? null, txnId]
      );

      const updated = await recalculateBookingPayment(tx, bookingId);

      await writeAuditLog({
        transactionId: txnId, bookingId, action: "edited",
        oldAmount: Number(entry.amount), newAmount: Number(newAmount),
        oldMode: entry.payment_mode, newMode: String(newMode),
        oldDate: entry.payment_date, newDate: String(newDate),
        changedBy: req.user?.id, changedByName: req.user?.name,
      });

      const updated2 = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      return { entry: updated2.rows[0], updated };
    });

    // Sync journal: void old entry + re-post with new values (fire-and-forget, non-fatal)
    voidJournalEntry("payment", result.entry.id).then(() =>
      postPaymentJournal({
        txnId: result.entry.id,
        amount: Number(result.entry.amount),
        mode: String(result.entry.payment_mode),
        date: String(result.entry.payment_date).slice(0, 10),
      })
    ).catch(() => {});

    const { id: bookingId2, txnId: txnId2 } = req.params as Record<string, string>;
    auditLog({ req, action: "updated", entityTable: "payments", entityId: txnId2, newValue: { bookingId: bookingId2, amount, paymentMode, paymentDate } }).catch(() => {});
    return void res.json({
      entry: { ...result.entry, amount: Number(result.entry.amount) },
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return void res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] PATCH error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /:id/payments/:txnId — soft delete with journal void (super_admin / accounts_admin only)
router.delete("/:id/payments/:txnId", requireAdmin as RequestHandler, requirePermission("payments", "delete") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: bookingId, txnId } = req.params as Record<string, string>;
    const { reason } = req.body as { reason?: string };

    console.log(`[DELETE payment] START — txnId=${txnId} bookingId=${bookingId} user=${req.user?.id ?? "unknown"}`);

    const result = await db.transaction(async (tx) => {
      // 1. Fetch and validate payment
      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];
      console.log(`[DELETE payment] entry found: ${entry ? `amount=${entry.amount} mode=${entry.payment_mode} is_deleted=${entry.is_deleted}` : "NOT FOUND"}`);

      if (!entry || entry.booking_id !== bookingId) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
      if (entry.is_deleted) throw Object.assign(new Error("Payment already deleted"), { statusCode: 422 });

      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);

      // 2. Void linked journal entries FIRST (always — don't block deletion because of accounting)
      const jlRes = await pool.query(
        `DELETE FROM journal_entry_lines WHERE journal_entry_id IN
         (SELECT id FROM journal_entries WHERE source='payment' AND source_id=$1)`,
        [txnId]
      );
      const jeRes = await pool.query(
        `DELETE FROM journal_entries WHERE source='payment' AND source_id=$1`,
        [txnId]
      );
      console.log(`[DELETE payment] journal voided — entries=${jeRes.rowCount} lines=${jlRes.rowCount}`);

      // 3. Soft-delete the payment transaction
      const delRes = await pool.query(
        `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3`,
        [req.user?.id ?? null, reason ?? null, txnId]
      );
      console.log(`[DELETE payment] payment soft-deleted — rows affected=${delRes.rowCount}`);

      // 4. Recalculate booking totals (paid amount, status, balance)
      const updated = await recalculateBookingPayment(tx, bookingId);
      console.log(`[DELETE payment] booking recalculated — totalPaid=${updated?.totalPaid} status=${updated?.newStatus}`);

      // 5. Audit log
      await writeAuditLog({
        transactionId: txnId, bookingId, action: "deleted",
        oldAmount: Number(entry.amount), oldMode: entry.payment_mode, oldDate: entry.payment_date,
        changedBy: req.user?.id, changedByName: req.user?.name, changeReason: reason ?? null,
      });
      auditLog({ req, action: "deleted", entityTable: "payments", entityId: txnId, oldValue: {
        bookingId, customerName: booking?.customerName ?? null,
        amount: entry.amount, paymentMode: entry.payment_mode, paymentDate: entry.payment_date,
        deletedBy: req.user?.name, reason: reason ?? null,
      }}).catch(() => {});

      return { updated, entry };
    });

    console.log(`[DELETE payment] SUCCESS — txnId=${txnId} finalPaid=${result.updated?.totalPaid} status=${result.updated?.newStatus}`);

    return void res.json({
      message: "Payment deleted successfully.",
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; message?: string };
    console.error(`[DELETE payment] ERROR — txnId=${req.params["txnId"]}:`, err);
    if (e.statusCode) return void res.status(e.statusCode).json({ message: e.message, code: e.code });
    return void res.status(500).json({ message: `Delete failed: ${(err as Error).message ?? "Unknown error"}` });
  }
});

// POST /:id/payments/:txnId/reverse — create a negative reversal transaction (preserves audit trail)
router.post("/:id/payments/:txnId/reverse", requireAdmin as RequestHandler, requirePermission("payments", "delete") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: bookingId, txnId } = req.params as Record<string, string>;
    const { reason } = req.body as { reason?: string };

    const result = await db.transaction(async (tx) => {
      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];
      if (!entry || entry.booking_id !== bookingId) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
      if (entry.is_deleted) throw Object.assign(new Error("Cannot reverse a deleted payment"), { statusCode: 422 });

      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });

      const reversalId = crypto.randomUUID();
      const today = new Date().toISOString().split("T")[0];
      const notes = reason ? `Reversal: ${reason}` : `Reversal of payment recorded on ${String(entry.payment_date)}`;
      await pool.query(
        `INSERT INTO payment_transactions (id, booking_id, amount, payment_date, payment_mode, reference_number, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reversalId, bookingId, String(-Number(entry.amount)), today, entry.payment_mode, entry.reference_number ?? null, notes, req.user?.id ?? null]
      );

      const updated = await recalculateBookingPayment(tx, bookingId);

      await writeAuditLog({
        transactionId: txnId, bookingId, action: "reversed",
        oldAmount: Number(entry.amount), oldMode: entry.payment_mode, oldDate: entry.payment_date,
        changedBy: req.user?.id, changedByName: req.user?.name, changeReason: reason ?? null,
      });
      auditLog({ req, action: "reversed", entityTable: "payments", entityId: txnId, oldValue: { bookingId, customerName: booking.customerName, amount: entry.amount, paymentMode: entry.payment_mode, reversalId, reason: reason ?? null } }).catch(() => {});

      return { reversalId, updated };
    });

    voidJournalEntry("payment", txnId).catch(() => {});

    return void res.status(201).json({
      message: "Payment reversed successfully.",
      reversalId: result.reversalId,
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return void res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] REVERSE error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// POST /:id/payments/:txnId/restore — restore soft-deleted payment
router.post("/:id/payments/:txnId/restore", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: bookingId, txnId } = req.params as Record<string, string>;

    const result = await db.transaction(async (tx) => {
      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];
      if (!entry || entry.booking_id !== bookingId) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
      if (!entry.is_deleted) throw Object.assign(new Error("Payment is not deleted"), { statusCode: 422 });

      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });
      if (!PAYABLE_STATUSES.includes(booking.status as BookingStatus))
        throw Object.assign(new Error(`Cannot restore payment for a ${booking.status} booking`), { statusCode: 422 });

      await pool.query(
        `UPDATE payment_transactions SET is_deleted=false, deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL WHERE id=$1`,
        [txnId]
      );

      const updated = await recalculateBookingPayment(tx, bookingId);

      await writeAuditLog({
        transactionId: txnId, bookingId, action: "restored",
        newAmount: Number(entry.amount), newMode: entry.payment_mode, newDate: entry.payment_date,
        changedBy: req.user?.id, changedByName: req.user?.name,
      });

      return { updated };
    });

    // Re-post journal entry for restored payment (fire-and-forget, non-fatal)
    postPaymentJournal({ txnId }).catch(() => {});

    return void res.json({
      message: "Payment restored",
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return void res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] RESTORE error:", err);
    return void res.status(500).json({ message: "Internal server error" });
  }
});

// ──────────────────────────────────────────────────────
// PAYMENT TRASH routes (no booking-id prefix)
// ──────────────────────────────────────────────────────

// GET /payment-trash — list all soft-deleted payments
router.get("/payment-trash", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const { search = "", mode = "", from = "", to = "", page = "1", limit = "50" } = req.query as Record<string, string>;
    const conds: string[] = ["pt.is_deleted = true"];
    const params: unknown[] = [];
    let pi = 1;
    if (search) { params.push(`%${search}%`); conds.push(`(b.booking_number ILIKE $${pi} OR b.customer_name ILIKE $${pi} OR b.customer_mobile ILIKE $${pi} OR pt.id::text ILIKE $${pi})`); pi++; }
    if (mode)   { params.push(mode);           conds.push(`pt.payment_mode = $${pi++}`); }
    if (from)   { params.push(from);           conds.push(`pt.payment_date >= $${pi++}`); }
    if (to)     { params.push(to);             conds.push(`pt.payment_date <= $${pi++}`); }
    const where = conds.join(" AND ");
    const pageNum = Math.max(1, parseInt(page)), lim = Math.min(200, Math.max(1, parseInt(limit)));
    const countRes = await pool.query(`SELECT COUNT(*) FROM payment_transactions pt JOIN bookings b ON b.id=pt.booking_id WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(lim, (pageNum - 1) * lim);
    const rows = await pool.query(
      `SELECT pt.id, pt.booking_id, pt.amount, pt.payment_date, pt.payment_mode, pt.reference_number,
              pt.bank_name, pt.notes, pt.recorded_by, pt.deleted_at, pt.deleted_by, pt.deletion_reason,
              pt.created_at, b.booking_number, b.customer_name, b.customer_mobile,
              del.name AS deleted_by_name
       FROM payment_transactions pt
       JOIN bookings b ON b.id=pt.booking_id
       LEFT JOIN users del ON del.id=pt.deleted_by
       WHERE ${where} ORDER BY pt.deleted_at DESC LIMIT $${pi} OFFSET $${pi+1}`,
      params
    );
    return void res.json({
      entries: rows.rows.map((r: Record<string,unknown>) => ({
        id: r["id"], bookingId: r["booking_id"], bookingNumber: r["booking_number"],
        customerName: r["customer_name"], customerMobile: r["customer_mobile"],
        amount: Number(r["amount"]), paymentDate: r["payment_date"], paymentMode: r["payment_mode"],
        referenceNumber: r["reference_number"], bankName: r["bank_name"], notes: r["notes"],
        deletedAt: r["deleted_at"], deletedByName: r["deleted_by_name"],
        deletionReason: r["deletion_reason"], createdAt: r["created_at"],
      })),
      total, page: pageNum, limit: lim,
    });
  } catch (err) {
    console.error("[payment-trash] GET error:", err);
    return void res.status(500).json({ message: `Failed: ${(err as Error).message}` });
  }
});

// POST /payment-trash/:txnId/restore — restore soft-deleted payment
router.post("/payment-trash/:txnId/restore", requireAdmin as RequestHandler, requirePermission("payments", "delete") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { txnId } = req.params as Record<string, string>;
    const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id=$1`, [txnId]);
    const entry = rowRes.rows[0];
    if (!entry) return void res.status(404).json({ message: "Payment not found" });
    if (!entry.is_deleted) return void res.status(422).json({ message: "Payment is not in trash" });

    await pool.query(
      `UPDATE payment_transactions SET is_deleted=false, deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL WHERE id=$1`,
      [txnId]
    );
    const updated = await recalculateBookingPayment(null as any, entry.booking_id);
    postPaymentJournal({ txnId, amount: Number(entry.amount), mode: entry.payment_mode, date: String(entry.payment_date).slice(0,10) }).catch(() => {});
    await writeAuditLog({ transactionId: txnId, bookingId: entry.booking_id, action: "restored",
      newAmount: Number(entry.amount), newMode: entry.payment_mode, newDate: entry.payment_date,
      changedBy: req.user?.id, changedByName: req.user?.name });
    auditLog({ req, action: "restored", entityTable: "payments", entityId: txnId,
      newValue: { bookingId: entry.booking_id, amount: entry.amount, restoredBy: req.user?.name } }).catch(() => {});
    console.log(`[payment-trash] RESTORE txnId=${txnId} bookingId=${entry.booking_id} totalPaid=${updated?.totalPaid}`);
    return void res.json({ message: "Payment restored successfully.", booking: { paidAmount: updated?.totalPaid, status: updated?.newStatus } });
  } catch (err) {
    console.error("[payment-trash] RESTORE error:", err);
    return void res.status(500).json({ message: `Restore failed: ${(err as Error).message}` });
  }
});

// DELETE /payment-trash/:txnId/permanent — hard-delete (irreversible)
router.delete("/payment-trash/:txnId/permanent", requireAdmin as RequestHandler, requirePermission("payments", "delete") as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { txnId } = req.params as Record<string, string>;
    const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id=$1`, [txnId]);
    const entry = rowRes.rows[0];
    if (!entry) return void res.status(404).json({ message: "Payment not found" });
    if (!entry.is_deleted) return void res.status(422).json({ message: "Payment must be moved to trash before permanent deletion" });

    await pool.query(`DELETE FROM payment_audit_logs WHERE transaction_id=$1`, [txnId]);
    await pool.query(`DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE source='payment' AND source_id=$1)`, [txnId]);
    await pool.query(`DELETE FROM journal_entries WHERE source='payment' AND source_id=$1`, [txnId]);
    await pool.query(`DELETE FROM payment_transactions WHERE id=$1`, [txnId]);
    auditLog({ req, action: "deleted", entityTable: "payments", entityId: txnId,
      oldValue: { bookingId: entry.booking_id, amount: entry.amount, permanentDelete: true, deletedBy: req.user?.name } }).catch(() => {});
    console.log(`[payment-trash] PERMANENT DELETE txnId=${txnId}`);
    return void res.json({ message: "Payment permanently deleted." });
  } catch (err) {
    console.error("[payment-trash] PERMANENT DELETE error:", err);
    return void res.status(500).json({ message: `Permanent delete failed: ${(err as Error).message}` });
  }
});

// POST /:id/auto-fill-pilgrim
router.post("/:id/auto-fill-pilgrim", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const bookingId = req.params.id as string;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
  if (booking.travellerDetailsStatus !== "submitted") { res.status(400).json({ message: "Customer has not submitted their travel details yet" }); return; }
  if (!booking.customerId) { res.status(400).json({ message: "Booking has no linked customer" }); return; }
  if (!booking.groupId) { res.status(400).json({ message: "Booking has no linked group — assign a group first" }); return; }
  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, booking.customerId)).limit(1);
  if (!profile) { res.status(404).json({ message: "Customer profile not found" }); return; }
  const pilgrim = await upsertPilgrimFromProfile(booking.groupId, profile, booking.customerName, booking.customerMobile);
  res.json({ message: "Pilgrim upserted from customer profile", pilgrim });
});

export default router;
