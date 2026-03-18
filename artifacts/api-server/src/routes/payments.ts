import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePaymentOrderBody, VerifyPaymentBody } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendPaymentConfirmationNotification, sendPartialPaymentNotification } from "../lib/notifications.js";

const router = Router();

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_SECRET;
  if (!keyId || !secret) {
    throw new Error("Razorpay keys not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: secret });
}

router.post("/create-order", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = CreatePaymentOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { bookingId, payAmount } = parsed.data;

  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const booking = bookings[0];

  if (!booking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }

  if (req.user?.role !== "admin" && booking.customerMobile !== req.user?.mobile) {
    res.status(403).json({ message: "You can only pay for your own bookings" });
    return;
  }

  if (booking.status !== "approved" && booking.status !== "partially_paid") {
    res.status(400).json({ message: "Booking must be approved before payment" });
    return;
  }
  if (!booking.finalAmount) {
    res.status(400).json({ message: "Booking amount not set" });
    return;
  }

  const finalAmount = Number(booking.finalAmount);
  const alreadyPaid = Number(booking.paidAmount || 0);
  const remainingBalance = finalAmount - alreadyPaid;

  if (remainingBalance <= 0) {
    res.status(400).json({ message: "This booking is already fully paid" });
    return;
  }

  let chargeAmount: number;
  if (payAmount) {
    if (payAmount <= 0) {
      res.status(400).json({ message: "Payment amount must be greater than zero" });
      return;
    }
    if (payAmount > remainingBalance) {
      res.status(400).json({ message: `Payment amount cannot exceed remaining balance of ₹${remainingBalance.toLocaleString("en-IN")}` });
      return;
    }
    chargeAmount = payAmount;
  } else {
    chargeAmount = remainingBalance;
  }

  let razorpay;
  try {
    razorpay = getRazorpay();
  } catch {
    res.status(500).json({ message: "Payment gateway not configured" });
    return;
  }

  const amountPaise = Math.round(chargeAmount * 100);

  let order: Awaited<ReturnType<typeof razorpay.orders.create>>;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: booking.bookingNumber,
      notes: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        customerName: booking.customerName,
        isPartial: chargeAmount < remainingBalance ? "true" : "false",
      },
    });
  } catch (err: any) {
    console.error("[payments] Razorpay orders.create error:", err?.error || err);
    const msg = err?.error?.description || err?.message || "Failed to create payment order";
    res.status(502).json({ message: msg });
    return;
  }

  await db.update(bookingsTable).set({ razorpayOrderId: order.id }).where(eq(bookingsTable.id, bookingId));

  res.json({
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    bookingId: booking.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
    chargeAmount,
    finalAmount,
    alreadyPaid,
    remainingBalance,
    isPartial: chargeAmount < finalAmount,
  });
});

router.post("/verify", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const body = req.body || {};

  console.log("[verify] Called by user:", req.user?.mobile, "| body keys:", Object.keys(body));

  // Accept both snake_case (Razorpay standard) and camelCase
  const razorpayOrderId: string = body.razorpay_order_id || body.razorpayOrderId;
  const razorpayPaymentId: string = body.razorpay_payment_id || body.razorpayPaymentId;
  const razorpaySignature: string = body.razorpay_signature || body.razorpaySignature;
  const bookingId: string = body.bookingId;
  const payAmount: number | undefined = body.payAmount;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId) {
    console.error("[verify] Missing fields — orderId:", !!razorpayOrderId, "paymentId:", !!razorpayPaymentId, "sig:", !!razorpaySignature, "bookingId:", !!bookingId);
    res.status(400).json({ success: false, message: "Missing required fields: bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature" });
    return;
  }

  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    res.status(500).json({ success: false, message: "Payment gateway not configured" });
    return;
  }

  // Verify HMAC signature (critical security check)
  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (generated !== razorpaySignature) {
    console.error("[verify] Signature mismatch for payment:", razorpayPaymentId);
    res.status(400).json({ success: false, message: "Invalid payment signature" });
    return;
  }

  const existingBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const existingBooking = existingBookings[0];

  if (!existingBooking) {
    res.status(404).json({ success: false, message: "Booking not found" });
    return;
  }

  if (req.user?.role !== "admin" && existingBooking.customerMobile !== req.user?.mobile) {
    res.status(403).json({ success: false, message: "You can only pay for your own bookings" });
    return;
  }

  if (existingBooking.status !== "approved" && existingBooking.status !== "partially_paid") {
    res.status(400).json({ success: false, message: "Booking is not in a payable state" });
    return;
  }

  if (existingBooking.razorpayOrderId && existingBooking.razorpayOrderId !== razorpayOrderId) {
    res.status(400).json({ success: false, message: "Order ID mismatch" });
    return;
  }

  const finalAmount = Number(existingBooking.finalAmount || 0);
  const previouslyPaid = Number(existingBooking.paidAmount || 0);
  const thisPayment = payAmount ?? (finalAmount - previouslyPaid);
  const newPaidAmount = previouslyPaid + thisPayment;
  const isFullyPaid = newPaidAmount >= finalAmount;

  const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
  const invoiceNumber = isFullyPaid
    ? (existingBooking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
    : existingBooking.invoiceNumber;

  const [booking] = await db
    .update(bookingsTable)
    .set({
      status: newStatus as any,
      razorpayOrderId,
      razorpayPaymentId: isFullyPaid ? razorpayPaymentId : existingBooking.razorpayPaymentId,
      paidAmount: String(newPaidAmount),
      invoiceNumber: invoiceNumber ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  console.log("[verify] Payment verified:", razorpayPaymentId, "→ Booking", booking.bookingNumber, newStatus);

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")?.replace(/\/api$/, "")}`;

  const invoiceUrl = isFullyPaid ? `${baseUrl}/invoice/${booking.bookingNumber}` : undefined;

  if (isFullyPaid) {
    sendPaymentConfirmationNotification({
      mobile: booking.customerMobile,
      email: booking.customerEmail,
      customerName: booking.customerName,
      bookingNumber: booking.bookingNumber,
      amount: Number(booking.finalAmount || 0).toLocaleString("en-IN"),
      invoiceNumber: invoiceNumber!,
      invoiceUrl,
    }).catch(console.error);
  } else {
    const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
    sendPartialPaymentNotification({
      mobile: booking.customerMobile,
      email: booking.customerEmail,
      customerName: booking.customerName,
      bookingNumber: booking.bookingNumber,
      paidAmount: thisPayment.toLocaleString("en-IN"),
      remainingAmount: remainingBalance.toLocaleString("en-IN"),
    }).catch(console.error);
  }

  res.json({
    success: true,
    invoice: invoiceUrl || null,
    status: newStatus,
    isFullyPaid,
    booking: {
      ...booking,
      totalAmount: booking.totalAmount ? Number(booking.totalAmount) : null,
      gstAmount: booking.gstAmount ? Number(booking.gstAmount) : null,
      finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
      paidAmount: newPaidAmount,
      remainingBalance: Math.max(0, finalAmount - newPaidAmount),
      createdAt: booking.createdAt?.toISOString?.(),
      updatedAt: booking.updatedAt?.toISOString?.(),
    },
  });
});

router.post("/sync-payment", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.body;
  if (!bookingId) { res.status(400).json({ message: "bookingId required" }); return; }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }

  if (req.user?.role !== "admin" && booking.customerMobile !== req.user?.mobile) {
    res.status(403).json({ message: "Not authorized" }); return;
  }

  if (booking.status === "confirmed") {
    res.json({ status: "confirmed", message: "Already confirmed", booking });
    return;
  }

  if (!booking.razorpayOrderId) {
    res.json({ status: booking.status, message: "No payment order yet" }); return;
  }

  let razorpay;
  try { razorpay = getRazorpay(); }
  catch { res.status(500).json({ message: "Payment gateway not configured" }); return; }

  let order: any;
  try {
    order = await razorpay.orders.fetch(booking.razorpayOrderId);
  } catch (err: any) {
    console.error("[sync-payment] orders.fetch error:", err?.error || err?.message);
    res.status(502).json({ message: "Could not reach Razorpay" }); return;
  }

  if (order.status !== "paid") {
    res.json({ status: order.status, message: "Payment not yet captured" }); return;
  }

  let payments: any;
  try {
    payments = await razorpay.orders.fetchPayments(booking.razorpayOrderId);
  } catch (err: any) {
    console.error("[sync-payment] fetchPayments error:", err?.error || err?.message);
    res.status(502).json({ message: "Could not fetch payments from Razorpay" }); return;
  }

  const capturedPayment = (payments?.items || []).find((p: any) => p.status === "captured");

  const finalAmount = Number(booking.finalAmount || 0);
  const previouslyPaid = Number(booking.paidAmount || 0);
  const thisPayment = capturedPayment ? capturedPayment.amount / 100 : (finalAmount - previouslyPaid);
  const newPaidAmount = previouslyPaid + thisPayment;
  const isFullyPaid = newPaidAmount >= finalAmount;
  const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
  const invoiceNumber = isFullyPaid
    ? (booking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
    : booking.invoiceNumber;

  const [updated] = await db
    .update(bookingsTable)
    .set({
      status: newStatus as any,
      razorpayPaymentId: capturedPayment?.id || booking.razorpayPaymentId,
      paidAmount: String(newPaidAmount),
      invoiceNumber: invoiceNumber ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(bookingsTable.id, booking.id))
    .returning();

  console.log("[sync-payment] Synced booking:", updated.bookingNumber, "→", newStatus);

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;

  if (isFullyPaid) {
    const invoiceUrl = `${baseUrl}/invoice/${updated.bookingNumber}`;
    sendPaymentConfirmationNotification({
      mobile: updated.customerMobile,
      email: updated.customerEmail,
      customerName: updated.customerName,
      bookingNumber: updated.bookingNumber,
      amount: Number(updated.finalAmount || 0).toLocaleString("en-IN"),
      invoiceNumber: invoiceNumber!,
      invoiceUrl,
    }).catch(console.error);
  } else {
    const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
    sendPartialPaymentNotification({
      mobile: updated.customerMobile,
      email: updated.customerEmail,
      customerName: updated.customerName,
      bookingNumber: updated.bookingNumber,
      paidAmount: thisPayment.toLocaleString("en-IN"),
      remainingAmount: remainingBalance.toLocaleString("en-IN"),
    }).catch(console.error);
  }

  res.json({
    status: newStatus,
    message: "Payment synced successfully",
    booking: {
      ...updated,
      isFullyPaid,
      paidAmount: newPaidAmount,
      remainingBalance: Math.max(0, finalAmount - newPaidAmount),
    },
  });
});

router.post("/webhook", async (req: any, res) => {
  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    console.error("[Webhook] RAZORPAY_SECRET not set");
    res.status(500).json({ message: "Webhook not configured" });
    return;
  }

  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  if (!signature) {
    res.status(400).json({ message: "Missing signature" });
    return;
  }

  const rawBody: Buffer | undefined = req.rawBody;
  if (!rawBody) {
    res.status(400).json({ message: "Raw body not available" });
    return;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expected !== signature) {
    console.error("[Webhook] Invalid signature");
    res.status(400).json({ message: "Invalid webhook signature" });
    return;
  }

  const event = req.body;
  const eventType: string = event?.event || "";
  console.log("[Webhook] Received event:", eventType);

  if (eventType !== "payment.captured" && eventType !== "order.paid") {
    res.json({ message: "Event received, not processed" });
    return;
  }

  try {
    const orderId: string | undefined =
      event?.payload?.payment?.entity?.order_id ||
      event?.payload?.order?.entity?.id;
    const paymentId: string | undefined =
      event?.payload?.payment?.entity?.id;
    const amountPaise: number | undefined =
      event?.payload?.payment?.entity?.amount;

    if (!orderId) {
      console.error("[Webhook] No order_id in payload");
      res.json({ message: "No order_id in payload" });
      return;
    }

    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.razorpayOrderId, orderId))
      .limit(1);
    const booking = bookings[0];

    if (!booking) {
      console.warn("[Webhook] No booking found for orderId:", orderId);
      res.json({ message: "Booking not found" });
      return;
    }

    if (booking.status === "confirmed") {
      console.log("[Webhook] Booking already confirmed:", booking.bookingNumber);
      res.json({ message: "Already confirmed" });
      return;
    }

    const finalAmount = Number(booking.finalAmount || 0);
    const previouslyPaid = Number(booking.paidAmount || 0);
    const thisPayment = amountPaise ? amountPaise / 100 : (finalAmount - previouslyPaid);
    const newPaidAmount = previouslyPaid + thisPayment;
    const isFullyPaid = newPaidAmount >= finalAmount;
    const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
    const invoiceNumber = isFullyPaid
      ? (booking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
      : booking.invoiceNumber;

    const [updated] = await db
      .update(bookingsTable)
      .set({
        status: newStatus as any,
        razorpayPaymentId: paymentId || booking.razorpayPaymentId,
        paidAmount: String(newPaidAmount),
        invoiceNumber: invoiceNumber ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(bookingsTable.id, booking.id))
      .returning();

    console.log("[Webhook] Booking updated:", updated.bookingNumber, "→", newStatus);

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://alburhantravels.com";

    if (isFullyPaid) {
      const invoiceUrl = `${baseUrl}/invoice/${updated.bookingNumber}`;
      sendPaymentConfirmationNotification({
        mobile: updated.customerMobile,
        email: updated.customerEmail,
        customerName: updated.customerName,
        bookingNumber: updated.bookingNumber,
        amount: Number(updated.finalAmount || 0).toLocaleString("en-IN"),
        invoiceNumber: invoiceNumber!,
        invoiceUrl,
      }).catch(console.error);
    } else {
      const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
      sendPartialPaymentNotification({
        mobile: updated.customerMobile,
        email: updated.customerEmail,
        customerName: updated.customerName,
        bookingNumber: updated.bookingNumber,
        paidAmount: thisPayment.toLocaleString("en-IN"),
        remainingAmount: remainingBalance.toLocaleString("en-IN"),
      }).catch(console.error);
    }

    res.json({ message: "Webhook processed", status: newStatus });
  } catch (err: any) {
    console.error("[Webhook] Processing error:", err?.message);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

export default router;
