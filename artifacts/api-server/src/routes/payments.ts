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

  const order = await razorpay.orders.create({
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
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature, payAmount } = parsed.data;

  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Payment gateway not configured" });
    return;
  }

  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (generated !== razorpaySignature) {
    res.status(400).json({ message: "Invalid payment signature" });
    return;
  }

  const existingBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const existingBooking = existingBookings[0];

  if (!existingBooking) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }

  if (req.user?.role !== "admin" && existingBooking.customerMobile !== req.user?.mobile) {
    res.status(403).json({ message: "You can only pay for your own bookings" });
    return;
  }

  if (existingBooking.status !== "approved" && existingBooking.status !== "partially_paid") {
    res.status(400).json({ message: "Booking is not in a payable state" });
    return;
  }

  if (existingBooking.razorpayOrderId && existingBooking.razorpayOrderId !== razorpayOrderId) {
    res.status(400).json({ message: "Order ID mismatch" });
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

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")?.replace(/\/api$/, "")}`;

  if (isFullyPaid) {
    const invoiceUrl = `${baseUrl}/invoice/${booking.bookingNumber}`;
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
    ...booking,
    totalAmount: booking.totalAmount ? Number(booking.totalAmount) : null,
    gstAmount: booking.gstAmount ? Number(booking.gstAmount) : null,
    finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
    paidAmount: newPaidAmount,
    remainingBalance: Math.max(0, finalAmount - newPaidAmount),
    isFullyPaid,
    createdAt: booking.createdAt?.toISOString?.(),
    updatedAt: booking.updatedAt?.toISOString?.(),
  });
});

export default router;
