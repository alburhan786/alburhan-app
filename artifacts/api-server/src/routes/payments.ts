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

router.get("/checkout-page", async (req, res) => {
  const { orderId, bookingId, amount, name, mobile, bookingNumber } = req.query as Record<string, string>;
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const amountNum = Number(amount ?? 0);
  const amountInRupees = (amountNum / 100).toLocaleString("en-IN");

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<title>Payment — Al Burhan Tours</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F7F5F0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
  .card { background: #fff; border-radius: 20px; padding: 28px 24px; max-width: 420px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
  .logo { text-align: center; margin-bottom: 20px; }
  .logo-main { font-size: 22px; font-weight: 800; color: #0B3D2E; letter-spacing: 2px; }
  .logo-sub { font-size: 11px; color: #C9A23F; letter-spacing: 3px; font-weight: 600; margin-top: 2px; }
  .booking-info { background: #F0EDE6; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; }
  .booking-label { font-size: 11px; color: #9A9A9A; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .booking-num { font-size: 14px; font-weight: 700; color: #0B3D2E; }
  .amount-box { text-align: center; margin-bottom: 24px; }
  .amount-label { font-size: 13px; color: #5A5A5A; margin-bottom: 6px; }
  .amount { font-size: 36px; font-weight: 800; color: #0B3D2E; }
  .amount-note { font-size: 11px; color: #9A9A9A; margin-top: 4px; }
  .pay-btn { background: #0B3D2E; color: #fff; border: none; border-radius: 14px; width: 100%; padding: 17px; font-size: 17px; font-weight: 700; cursor: pointer; letter-spacing: 0.3px; transition: opacity 0.2s; }
  .pay-btn:hover { opacity: 0.9; }
  .pay-btn:disabled { background: #B0C8C0; cursor: not-allowed; }
  .status { display: none; text-align: center; padding: 20px; }
  .status.success { display: block; }
  .status.failure { display: block; }
  .status-icon { font-size: 48px; margin-bottom: 12px; }
  .status-title { font-size: 20px; font-weight: 700; color: #0B3D2E; margin-bottom: 8px; }
  .status-msg { font-size: 14px; color: #5A5A5A; line-height: 1.5; }
  .close-btn { background: #0B3D2E; color: #fff; border: none; border-radius: 12px; padding: 14px 32px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 20px; }
  .secure-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 14px; font-size: 11px; color: #9A9A9A; }
  .loading { display: none; text-align: center; padding: 12px; color: #5A5A5A; font-size: 14px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div style="font-size:24px;color:#C9A23F;font-weight:800;">البرہان</div>
    <div class="logo-main">AL BURHAN</div>
    <div class="logo-sub">TOURS & TRAVELS</div>
  </div>

  <div id="payment-form">
    <div class="booking-info">
      <div class="booking-label">Booking Reference</div>
      <div class="booking-num">#${bookingNumber || "—"}</div>
      <div style="font-size:12px;color:#5A5A5A;margin-top:4px;">${name || ""}</div>
    </div>
    <div class="amount-box">
      <div class="amount-label">Amount to Pay</div>
      <div class="amount">₹${amountInRupees}</div>
      <div class="amount-note">Including all taxes and fees</div>
    </div>
    <button class="pay-btn" id="payBtn" onclick="openRazorpay()">Pay ₹${amountInRupees} Securely</button>
    <div class="loading" id="loading">Processing payment…</div>
    <div class="secure-note">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M6 1L1 3v4c0 2.76 2.24 5 5 5s5-2.24 5-5V3L6 1z" fill="#9A9A9A"/></svg>
      Secured by Razorpay • 256-bit SSL
    </div>
  </div>

  <div class="status success" id="success">
    <div class="status-icon">✅</div>
    <div class="status-title">Payment Successful!</div>
    <div class="status-msg">Your payment has been received.<br/>Your booking is being confirmed.<br/><br/>Jazak Allah Khair!</div>
    <button class="close-btn" onclick="window.close()">Return to App</button>
  </div>

  <div class="status failure" id="failure">
    <div class="status-icon">❌</div>
    <div class="status-title">Payment Failed</div>
    <div class="status-msg" id="failureMsg">The payment could not be processed. Please try again.</div>
    <button class="close-btn" onclick="window.close()">Go Back</button>
  </div>
</div>

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
function openRazorpay() {
  document.getElementById('payBtn').disabled = true;
  document.getElementById('loading').style.display = 'block';

  var options = {
    key: '${keyId}',
    amount: '${amountNum}',
    currency: 'INR',
    name: 'Al Burhan Tours & Travels',
    description: 'Booking #${bookingNumber}',
    order_id: '${orderId}',
    prefill: { name: '${name}', contact: '+91${mobile}' },
    theme: { color: '#0B3D2E' },
    modal: {
      ondismiss: function() {
        document.getElementById('payBtn').disabled = false;
        document.getElementById('loading').style.display = 'none';
      }
    },
    handler: function(response) {
      document.getElementById('payment-form').style.display = 'none';
      document.getElementById('loading').style.display = 'none';

      fetch('/api/payments/verify-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          bookingId: '${bookingId}'
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        document.getElementById('success').style.display = 'block';
        setTimeout(function() { window.close(); }, 4000);
      })
      .catch(function() {
        document.getElementById('success').style.display = 'block';
        setTimeout(function() { window.close(); }, 4000);
      });
    }
  };

  var rzp = new Razorpay(options);
  rzp.on('payment.failed', function(response) {
    document.getElementById('payment-form').style.display = 'none';
    document.getElementById('failure').style.display = 'block';
    document.getElementById('failureMsg').textContent = response.error.description || 'Payment failed. Please try again.';
  });
  rzp.open();
}

window.onload = function() {
  setTimeout(openRazorpay, 300);
};
</script>
</body>
</html>`);
});

router.post("/verify-public", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
    res.status(400).json({ success: false, message: "Missing required fields" });
    return;
  }

  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    res.status(500).json({ success: false, message: "Payment gateway not configured" });
    return;
  }

  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generated !== razorpay_signature) {
    res.status(400).json({ success: false, message: "Invalid payment signature" });
    return;
  }

  const existingBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const booking = existingBookings[0];

  if (!booking) {
    res.status(404).json({ success: false, message: "Booking not found" });
    return;
  }

  const finalAmount = Number(booking.finalAmount ?? 0);
  const existingPaid = Number(booking.paidAmount ?? 0);
  let chargeAmount = finalAmount - existingPaid;

  try {
    const rzp = getRazorpay();
    const payment = await rzp.payments.fetch(razorpay_payment_id) as any;
    chargeAmount = payment.amount ? Number(payment.amount) / 100 : chargeAmount;
  } catch {}

  const newPaidAmount = existingPaid + chargeAmount;
  const remainingBalance = finalAmount - newPaidAmount;
  const newStatus = remainingBalance <= 0 ? "confirmed" : "partially_paid";

  await db.update(bookingsTable).set({
    status: newStatus,
    razorpayPaymentId: razorpay_payment_id,
    paidAmount: String(newPaidAmount),
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, bookingId));

  res.json({ success: true, status: newStatus });
});

export default router;

