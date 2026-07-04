import { Router, type RequestHandler } from "express";
import { db, pool, bookingsTable, paymentTransactionsTable, customerProfilesTable } from "@workspace/db";
import { eq, sum, count, asc, and, isNull, or } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { upsertPilgrimFromProfile } from "../lib/pilgrimUtils.js";
import { postPaymentJournal, voidJournalEntry } from "../lib/journalHelper.js";

type BookingStatus = "pending" | "approved" | "rejected" | "confirmed" | "cancelled" | "partially_paid";
type PaymentMode = "cash" | "neft" | "upi" | "cheque" | "online";
type DbOrTx = typeof db;

const PAYABLE_STATUSES: BookingStatus[] = ["approved", "partially_paid", "confirmed"];
const VALID_MODES: PaymentMode[] = ["cash", "neft", "upi", "cheque", "online"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const router = Router();

function generateInvoiceNumber(): string {
  return `INV${Date.now().toString().slice(-8)}`;
}

async function recalculateBookingPayment(tx: DbOrTx, bookingId: string) {
  const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return;

  const [result] = await tx
    .select({ total: sum(paymentTransactionsTable.amount) })
    .from(paymentTransactionsTable)
    .where(
      and(
        eq(paymentTransactionsTable.bookingId, bookingId),
        or(eq(paymentTransactionsTable.isDeleted, false), isNull(paymentTransactionsTable.deletedAt))
      )
    );

  const ledgerSum = Number(result?.total ?? 0);
  const onlinePaidAmount = Number(booking.onlinePaidAmount ?? 0);
  const totalPaid = onlinePaidAmount + ledgerSum;
  const finalAmount = Number(booking.finalAmount ?? 0);

  let newStatus: BookingStatus = booking.status as BookingStatus;
  let invoiceNumber = booking.invoiceNumber;

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

  await tx
    .update(bookingsTable)
    .set({
      paidAmount: String(totalPaid),
      onlinePaidAmount: String(onlinePaidAmount),
      status: newStatus,
      invoiceNumber: invoiceNumber ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(bookingsTable.id, bookingId));

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
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const rows = await pool.query(
      `SELECT * FROM payment_transactions WHERE booking_id = $1 ORDER BY payment_date ASC, created_at ASC`,
      [bookingId]
    );
    const entries = rows.rows.filter((e: Record<string, unknown>) => includeDeleted || !e["is_deleted"]);

    return res.json(entries.map((e: Record<string, unknown>) => ({
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
    return res.status(500).json({ message: "Internal server error" });
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
    return res.json(rows.rows);
  } catch (err) {
    console.error("[admin-payments] history error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /:id/payments — add new payment
router.post("/:id/payments", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const { amount, paymentDate, paymentMode, referenceNumber, bankName, receivedBy, notes } = req.body as Record<string, unknown>;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return res.status(400).json({ message: "Valid amount is required" });
    if (!paymentDate || typeof paymentDate !== "string" || !ISO_DATE_RE.test(paymentDate))
      return res.status(400).json({ message: "Payment date must be in YYYY-MM-DD format" });
    if (!paymentMode || !VALID_MODES.includes(paymentMode as PaymentMode))
      return res.status(400).json({ message: "Valid payment mode is required" });

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

      return { entry, updated };
    });

    // Auto-post double-entry journal (fire-and-forget, non-fatal)
    postPaymentJournal({
      txnId: result.entry.id,
      amount: Number(result.entry.amount),
      mode: String(paymentMode),
      date: String(paymentDate),
      bookingNumber: bookingId,
    }).catch(() => {});

    return res.status(201).json({
      entry: { ...result.entry, amount: Number(result.entry.amount) },
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus, invoiceNumber: result.updated?.invoiceNumber },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 422)
      return res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] POST error:", err);
    return res.status(500).json({ message: "Internal server error" });
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

    return res.json({
      entry: { ...result.entry, amount: Number(result.entry.amount) },
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] PATCH error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /:id/payments/:txnId — soft delete
router.delete("/:id/payments/:txnId", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const { id: bookingId, txnId } = req.params as Record<string, string>;
    const { reason } = req.body as { reason?: string };

    const result = await db.transaction(async (tx) => {
      const rowRes = await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [txnId]);
      const entry = rowRes.rows[0];
      if (!entry || entry.booking_id !== bookingId) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
      if (entry.is_deleted) throw Object.assign(new Error("Payment already deleted"), { statusCode: 422 });

      await pool.query(
        `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3`,
        [req.user?.id ?? null, reason ?? null, txnId]
      );

      const updated = await recalculateBookingPayment(tx, bookingId);

      await writeAuditLog({
        transactionId: txnId, bookingId, action: "deleted",
        oldAmount: Number(entry.amount), oldMode: entry.payment_mode, oldDate: entry.payment_date,
        changedBy: req.user?.id, changedByName: req.user?.name, changeReason: reason ?? null,
      });

      return { updated };
    });

    // Void journal entry for deleted payment (fire-and-forget, non-fatal)
    voidJournalEntry("payment", txnId).catch(() => {});

    return res.json({
      message: "Payment soft-deleted",
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] DELETE error:", err);
    return res.status(500).json({ message: "Internal server error" });
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

    return res.json({
      message: "Payment restored",
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode) return res.status(statusCode).json({ message: (err as Error).message });
    console.error("[admin-payments] RESTORE error:", err);
    return res.status(500).json({ message: "Internal server error" });
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
