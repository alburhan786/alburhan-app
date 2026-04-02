import { Router, type RequestHandler } from "express";
import { db, bookingsTable, paymentTransactionsTable, customerProfilesTable } from "@workspace/db";
import { eq, sum, count, asc } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { upsertPilgrimFromProfile } from "../lib/pilgrimUtils.js";

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

/**
 * Recalculates paidAmount and booking status within an existing transaction.
 * Assumes onlinePaidAmount is correctly seeded before calling.
 * Only transitions status from payable states (approved/partially_paid/confirmed).
 */
async function recalculateBookingPayment(tx: DbOrTx, bookingId: string) {
  const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return;

  const [result] = await tx
    .select({ total: sum(paymentTransactionsTable.amount) })
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.bookingId, bookingId));

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
      if (!invoiceNumber) {
        invoiceNumber = generateInvoiceNumber();
      }
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

/**
 * If this is the first manual ledger entry for a booking that already had Razorpay
 * payments (paidAmount > 0, onlinePaidAmount still at schema default "0"), seeds
 * onlinePaidAmount = paidAmount so recalculation retains the Razorpay baseline.
 */
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
    if (!paymentDate || typeof paymentDate !== "string" || !ISO_DATE_RE.test(paymentDate)) {
      return res.status(400).json({ message: "Payment date must be in YYYY-MM-DD format" });
    }
    if (!paymentMode || !VALID_MODES.includes(paymentMode as PaymentMode)) {
      return res.status(400).json({ message: "Valid payment mode is required" });
    }

    const result = await db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) {
        throw Object.assign(new Error("Booking not found"), { statusCode: 404 });
      }
      if (!PAYABLE_STATUSES.includes(booking.status as BookingStatus)) {
        throw Object.assign(
          new Error(`Cannot record payment for a ${booking.status} booking`),
          { statusCode: 422 }
        );
      }

      await ensureOnlineBaselineSeeded(tx, bookingId, booking);

      const [entry] = await tx
        .insert(paymentTransactionsTable)
        .values({
          bookingId,
          amount: String(Number(amount)),
          paymentDate,
          paymentMode: paymentMode as PaymentMode,
          referenceNumber: referenceNumber ?? null,
          notes: notes ?? null,
          recordedBy: req.user?.id ?? null,
        })
        .returning();

      const updated = await recalculateBookingPayment(tx, bookingId);
      return { entry, updated };
    });

    return res.status(201).json({
      entry: { ...result.entry, amount: Number(result.entry.amount), createdAt: result.entry.createdAt?.toISOString() },
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus, invoiceNumber: result.updated?.invoiceNumber },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 422) {
      return res.status(statusCode).json({ message: (err as Error).message });
    }
    console.error("[admin-payments] POST error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id/payments/:txnId", requireAdmin as RequestHandler, async (req: AuthenticatedRequest, res) => {
  try {
    const bookingId = req.params["id"];
    const txnId = req.params["txnId"];

    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(paymentTransactionsTable)
        .where(eq(paymentTransactionsTable.id, txnId))
        .limit(1);

      if (!entry || entry.bookingId !== bookingId) {
        throw Object.assign(new Error("Payment entry not found"), { statusCode: 404 });
      }

      await tx.delete(paymentTransactionsTable).where(eq(paymentTransactionsTable.id, txnId));
      const updated = await recalculateBookingPayment(tx, bookingId);
      return { updated };
    });

    return res.json({
      message: "Payment entry deleted",
      booking: { paidAmount: result.updated?.totalPaid, status: result.updated?.newStatus },
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      return res.status(404).json({ message: (err as Error).message });
    }
    console.error("[admin-payments] DELETE error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post(
  "/:id/auto-fill-pilgrim",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const bookingId = req.params.id as string;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
    if (booking.travellerDetailsStatus !== "submitted") {
      res.status(400).json({ message: "Customer has not submitted their travel details yet" }); return;
    }
    if (!booking.customerId) { res.status(400).json({ message: "Booking has no linked customer" }); return; }
    if (!booking.groupId) { res.status(400).json({ message: "Booking has no linked group — assign a group first" }); return; }

    const [profile] = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, booking.customerId))
      .limit(1);

    if (!profile) { res.status(404).json({ message: "Customer profile not found — ask customer to re-submit their details" }); return; }

    const pilgrim = await upsertPilgrimFromProfile(booking.groupId, profile, booking.customerName, booking.customerMobile);
    res.json({ message: "Pilgrim upserted from customer profile", pilgrim });
  }
);

export default router;
