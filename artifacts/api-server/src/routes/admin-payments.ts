import { Router, type RequestHandler } from "express";
import { db, bookingsTable, paymentTransactionsTable } from "@workspace/db";
import { eq, sum, asc } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

type BookingStatus = "pending" | "approved" | "rejected" | "confirmed" | "cancelled" | "partially_paid";
type PaymentMode = "cash" | "neft" | "upi" | "cheque" | "online";

const PAYABLE_STATUSES: BookingStatus[] = ["approved", "partially_paid", "confirmed"];
const VALID_MODES: PaymentMode[] = ["cash", "neft", "upi", "cheque", "online"];

const router = Router();

function generateInvoiceNumber(): string {
  return `INV${Date.now().toString().slice(-8)}`;
}

async function recalculateBookingPayment(bookingId: string) {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return;

  const [result] = await db
    .select({ total: sum(paymentTransactionsTable.amount) })
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.bookingId, bookingId));

  const ledgerSum = Number(result?.total ?? 0);

  // onlinePaidAmount tracks Razorpay-sourced payments only.
  // If not yet set (first time a manual entry is recorded for an existing booking
  // that already had a Razorpay payment), capture the current paidAmount as the baseline.
  let onlinePaidAmount = Number(booking.onlinePaidAmount ?? 0);
  if (booking.onlinePaidAmount === null && booking.paidAmount) {
    onlinePaidAmount = Number(booking.paidAmount);
  }

  const totalPaid = onlinePaidAmount + ledgerSum;
  const finalAmount = Number(booking.finalAmount ?? 0);

  // Only allow status transitions from payable states.
  // Do not touch rejected, cancelled, or pending bookings.
  let newStatus: BookingStatus = booking.status as BookingStatus;
  let invoiceNumber = booking.invoiceNumber;

  if (PAYABLE_STATUSES.includes(newStatus)) {
    if (totalPaid === 0) {
      newStatus = "approved";
    } else if (finalAmount > 0 && totalPaid >= finalAmount) {
      newStatus = "confirmed";
      if (!invoiceNumber) {
        invoiceNumber = generateInvoiceNumber();
      }
    } else {
      newStatus = "partially_paid";
    }
  }

  await db
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

router.get("/:id/payments", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const entries = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.bookingId, bookingId))
      .orderBy(asc(paymentTransactionsTable.paymentDate), asc(paymentTransactionsTable.createdAt));

    return res.json(entries.map(e => ({
      ...e,
      amount: Number(e.amount),
      createdAt: e.createdAt?.toISOString(),
    })));
  } catch (err) {
    console.error("[admin-payments] GET error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:id/payments", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const { amount, paymentDate, paymentMode, referenceNumber, notes } = req.body as {
      amount: unknown;
      paymentDate: unknown;
      paymentMode: unknown;
      referenceNumber?: string;
      notes?: string;
    };

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }
    if (!paymentDate || typeof paymentDate !== "string") {
      return res.status(400).json({ message: "Payment date is required" });
    }
    if (!paymentMode || !VALID_MODES.includes(paymentMode as PaymentMode)) {
      return res.status(400).json({ message: "Valid payment mode is required" });
    }

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const [entry] = await db
      .insert(paymentTransactionsTable)
      .values({
        bookingId,
        amount: String(Number(amount)),
        paymentDate,
        paymentMode: paymentMode as PaymentMode,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        recordedBy: req.user?.id || null,
      })
      .returning();

    const updated = await recalculateBookingPayment(bookingId);

    return res.status(201).json({
      entry: { ...entry, amount: Number(entry.amount), createdAt: entry.createdAt?.toISOString() },
      booking: { paidAmount: updated?.totalPaid, status: updated?.newStatus, invoiceNumber: updated?.invoiceNumber },
    });
  } catch (err) {
    console.error("[admin-payments] POST error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id/payments/:txnId", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const txnId = req.params["txnId"];

    const [entry] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.id, txnId))
      .limit(1);

    if (!entry || entry.bookingId !== bookingId) {
      return res.status(404).json({ message: "Payment entry not found" });
    }

    await db.delete(paymentTransactionsTable).where(eq(paymentTransactionsTable.id, txnId));

    const updated = await recalculateBookingPayment(bookingId);

    return res.json({
      message: "Payment entry deleted",
      booking: { paidAmount: updated?.totalPaid, status: updated?.newStatus },
    });
  } catch (err) {
    console.error("[admin-payments] DELETE error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
