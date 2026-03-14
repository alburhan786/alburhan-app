import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db, bookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePaymentOrderBody, VerifyPaymentBody } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendPaymentConfirmationNotification } from "../lib/notifications.js";

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
  const { bookingId } = parsed.data;

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

  if (booking.status !== "approved") {
    res.status(400).json({ message: "Booking must be approved before payment" });
    return;
  }
  if (!booking.finalAmount) {
    res.status(400).json({ message: "Booking amount not set" });
    return;
  }

  let razorpay;
  try {
    razorpay = getRazorpay();
  } catch {
    res.status(500).json({ message: "Payment gateway not configured" });
    return;
  }

  const amountPaise = Math.round(Number(booking.finalAmount) * 100);

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: booking.bookingNumber,
    notes: {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
    },
  });

  await db.update(bookingsTable).set({ razorpayOrderId: order.id }).where(eq(bookingsTable.id, bookingId));

  res.json({
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    bookingId: booking.id,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
  });
});

router.post("/verify", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

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

  if (existingBooking.status !== "approved") {
    res.status(400).json({ message: "Booking must be approved before payment verification" });
    return;
  }

  if (existingBooking.razorpayOrderId && existingBooking.razorpayOrderId !== razorpayOrderId) {
    res.status(400).json({ message: "Order ID mismatch" });
    return;
  }

  const invoiceNumber = `INV${Date.now().toString().slice(-8)}`;

  const [booking] = await db
    .update(bookingsTable)
    .set({
      status: "confirmed",
      razorpayOrderId,
      razorpayPaymentId,
      invoiceNumber,
      updatedAt: new Date(),
    })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")?.replace(/\/api$/, "")}`;
  const invoiceUrl = `${baseUrl}/invoice/${booking.bookingNumber}`;

  sendPaymentConfirmationNotification({
    mobile: booking.customerMobile,
    email: booking.customerEmail,
    customerName: booking.customerName,
    bookingNumber: booking.bookingNumber,
    amount: booking.finalAmount ? String(Number(booking.finalAmount).toLocaleString("en-IN")) : "N/A",
    invoiceNumber,
    invoiceUrl,
  }).catch(console.error);

  res.json({
    ...booking,
    totalAmount: booking.totalAmount ? Number(booking.totalAmount) : null,
    gstAmount: booking.gstAmount ? Number(booking.gstAmount) : null,
    finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
    createdAt: booking.createdAt?.toISOString?.(),
    updatedAt: booking.updatedAt?.toISOString?.(),
  });
});

export default router;
