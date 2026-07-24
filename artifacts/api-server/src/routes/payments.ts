// @ts-nocheck
import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db, pool, bookingsTable, paymentTransactionsTable, reminderLogsTable } from "@workspace/db";
import { eq, sql, inArray, and, lt, desc } from "drizzle-orm";
// Note: onlinePaidAmount tracks Razorpay-only payments; manual ledger entries are in payment_transactions
import { CreatePaymentOrderBody, VerifyPaymentBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendAdminPaymentAlert, sendWhatsApp, type EmailAttachment } from "../lib/notifications.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { sendPaymentReceipt } from "../services/emailService.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { generateInvoicePdfBuffer, generateReceiptPdfBuffer } from "../lib/paymentDocs.js";
import { sendReminderForBookingId, getReminderHistory, runDailyReminders, isRemindersEnabled, setRemindersEnabled } from "../jobs/paymentReminder.js";
import { upsertInvoiceForBooking } from "./invoices.js";
import { autoGenerateAgreement } from "./agreements.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { broadcastCustomerJourneyUpdate } from "./customer-journey.js";
import { postPaymentJournal } from "../lib/journalHelper.js";

const router = Router();

interface RazorpayPaymentLinkPayload {
  amount: number;
  currency: string;
  description?: string;
  reference_id?: string;
  customer?: { name?: string; contact?: string };
  expire_by?: number;
  reminder_enable?: boolean;
  notify?: { sms?: boolean; email?: boolean };
}

interface RazorpayPaymentLinkResponse {
  id: string;
  short_url: string;
}

interface RazorpayWithPaymentLink extends Razorpay {
  paymentLink: {
    create(payload: RazorpayPaymentLinkPayload): Promise<RazorpayPaymentLinkResponse>;
  };
}

/**
 * Map a snake_case pool.query booking row to the camelCase shape used by
 * processPaymentSuccessNotifications and the rest of this file.
 * All 4 Razorpay payment routes use pool.query (not db.update().returning())
 * to avoid the VPS bundled-CJS Drizzle issue where db.execute/update returns
 * a non-iterable QueryResult without writing to the DB.
 */
function mapBookingRow(r: any) {
  return {
    id:                r.id,
    bookingNumber:     r.booking_number,
    customerName:      r.customer_name,
    customerMobile:    r.customer_mobile,
    customerEmail:     r.customer_email     ?? null,
    customerId:        r.customer_id        ?? null,
    packageName:       r.package_name       ?? null,
    numberOfPilgrims:  r.number_of_pilgrims ?? null,
    totalAmount:       r.total_amount       ?? null,
    gstAmount:         r.gst_amount         ?? null,
    finalAmount:       r.final_amount       ?? null,
    discountAmount:    r.discount_amount    ?? null,
    advanceAmount:     r.advance_amount     ?? null,
    paidAmount:        r.paid_amount        ?? null,
    onlinePaidAmount:  r.online_paid_amount ?? null,
    status:            r.status,
    razorpayOrderId:   r.razorpay_order_id  ?? null,
    razorpayPaymentId: r.razorpay_payment_id ?? null,
    invoiceNumber:     r.invoice_number     ?? null,
    journeyStatus:     r.journey_status     ?? null,
    createdAt:         r.created_at         ?? null,
    updatedAt:         r.updated_at         ?? null,
  };
}

/**
 * Insert an online Razorpay payment into payment_transactions for the audit
 * trail (deduped by reference_number + booking_id). Returns the txnId on
 * insert so callers can create the matching journal entry.
 */
async function recordOnlinePaymentTransaction(
  bookingId: string,
  amount: number,
  razorpayPaymentId: string,
  note = "Online payment via Razorpay",
  bookingNumber?: string,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const txnId = crypto.randomUUID();
  try {
    const r = await pool.query(
      `INSERT INTO payment_transactions (id, booking_id, amount, payment_date, payment_mode, reference_number, notes)
       SELECT $1,$2,$3,$4,'online',$5,$6
       WHERE NOT EXISTS (
         SELECT 1 FROM payment_transactions WHERE reference_number=$5 AND booking_id=$2
       )
       RETURNING id`,
      [txnId, bookingId, String(amount), today, razorpayPaymentId, note]
    );
    if (!r.rows[0]) {
      console.log(`[payments] payment_transactions: duplicate skipped (${razorpayPaymentId})`);
      return null;
    }
    const insertedId = r.rows[0].id as string;
    // Auto-create accounting journal entry (Dr: Cash/Bank  Cr: Customer Advance)
    postPaymentJournal({
      txnId: insertedId,
      amount,
      mode: "online",
      date: today,
      bookingNumber,
    }).catch((e: any) => console.error("[payments] postPaymentJournal failed (non-fatal):", e?.message));
    return insertedId;
  } catch (e: any) {
    console.error("[payments] payment_transactions insert failed:", e?.message);
    return null;
  }
}

/**
 * Single, awaited path that fires after ANY successful payment (full or
 * partial), via /verify, /sync-payment, or the Razorpay webhook. Replaces
 * the old ad-hoc fire-and-forget notification calls that silently swallowed
 * failures. Generates invoice/receipt PDFs, runs the customer notification
 * workflow (WhatsApp/SMS/Email with retry + logging via
 * notification_logs/customer_timeline), and alerts admins
 * (WhatsApp/Email/Dashboard). Every step is logged; failures never abort the
 * payment response since the DB write already succeeded.
 */
export async function processPaymentSuccessNotifications(opts: {
  booking: {
    id: string;
    bookingNumber: string;
    customerName: string;
    customerMobile: string;
    customerEmail?: string | null;
    customerId?: string | null;
    packageName?: string | null;
    numberOfPilgrims?: number | null;
    finalAmount?: string | number | null;
  };
  isFullyPaid: boolean;
  thisPaymentAmount: number;
  newPaidAmount: number;
  remainingBalance: number;
  invoiceNumber?: string | null;
  paymentRef?: string;
  paymentMode?: string;
  paymentDate?: Date;
}) {
  const { booking, isFullyPaid, thisPaymentAmount, newPaidAmount, remainingBalance, invoiceNumber, paymentRef, paymentMode, paymentDate } = opts;
  const finalAmountNum = Number(booking.finalAmount || 0);
  const siteBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.SITE_URL || "https://alburhantravels.com");
  const invoiceUrl = invoiceNumber ? `${siteBase}/invoice/${booking.bookingNumber}` : undefined;

  const docOpts = {
    bookingNumber: booking.bookingNumber,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    customerEmail: booking.customerEmail,
    packageName: booking.packageName,
    numberOfPilgrims: booking.numberOfPilgrims,
    totalAmount: finalAmountNum,
    finalAmount: finalAmountNum,
    paidAmount: newPaidAmount,
    balanceAmount: remainingBalance,
    invoiceNumber,
    paymentAmount: thisPaymentAmount,
    paymentRef,
  };

  // ── Generate Tax Invoice PDF + Payment Receipt PDF ─────────────────────────
  const attachments: EmailAttachment[] = [];
  let receiptBuf: Buffer | undefined;
  const safeBookingNum = booking.bookingNumber.replace(/\//g, "-");

  if (invoiceNumber) {
    try {
      const safeInvNum = invoiceNumber.replace(/\//g, "-");
      const invBuf = await generateInvoicePdfBuffer(docOpts);
      attachments.push({ filename: `TaxInvoice-${safeInvNum}.pdf`, content: invBuf, contentType: "application/pdf" });
      // Save to object storage so /invoice/:bookingNumber/pdf serves instantly
      uploadToGCS(invBuf, `Invoice-${safeInvNum}.pdf`, "application/pdf", "invoices")
        .then((pdfUrl) =>
          pool.query(
            `UPDATE invoices SET pdf_path=$1, updated_at=NOW() WHERE booking_id=$2`,
            [pdfUrl, booking.id]
          )
        )
        .catch((err) => console.error("[payments] Failed to save invoice PDF to storage:", err));
    } catch (err) {
      console.error("[payments] Tax Invoice PDF generation failed (notifications will still send):", err);
    }
  }

  // Payment Receipt PDF — always attach alongside Tax Invoice
  try {
    receiptBuf = await generateReceiptPdfBuffer(docOpts);
    attachments.push({ filename: `Receipt-${safeBookingNum}.pdf`, content: receiptBuf, contentType: "application/pdf" });
    console.log(`[payments] Payment Receipt PDF generated for ${booking.bookingNumber}`);
  } catch (err) {
    console.error("[payments] Payment Receipt PDF generation failed (notifications will still send):", err);
  }

  // ── Auto-send Tax Invoice PDF + Receipt PDF via WhatsApp (fire-and-forget) ─
  if (attachments.length > 0) {
    const _attachments   = [...attachments];
    const _bookingMobile = booking.customerMobile;
    const _bookingNumber = booking.bookingNumber;
    const _bookingId     = booking.id;
    const _customerId    = booking.customerId ?? undefined;
    (async () => {
      try {
        const { sendPDFDocument } = await import("../lib/botbee.js");
        const waOpts = { eventType: "payment_received", bookingId: _bookingId, customerId: _customerId };
        for (const att of _attachments) {
          const label = att.filename.startsWith("TaxInvoice") ? "Tax Invoice" : "Payment Receipt";
          const r = await sendPDFDocument(
            _bookingMobile,
            att.content as Buffer,
            att.filename,
            `Your ${label} – Al Burhan Tours & Travels (Booking: ${_bookingNumber})`,
            waOpts,
          );
          console.log(`[payments] WhatsApp ${label} PDF for ${_bookingNumber}: ${r.ok ? "✅ sent" : "❌ " + r.errorMessage}`);
        }
      } catch (pdfWaErr: any) {
        console.error("[payments] WhatsApp PDF delivery failed (non-fatal):", pdfWaErr?.message);
      }
    })();
  }

  const trigger = isFullyPaid ? "payment_received" : "partial_payment_received";
  const displayAmount = (isFullyPaid ? finalAmountNum : thisPaymentAmount).toLocaleString("en-IN");
  const paymentDateStr = (paymentDate || new Date()).toLocaleDateString("en-IN", { dateStyle: "medium" });
  const paymentModeLabel = paymentMode
    ? paymentMode.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Online";

  const results = await Promise.allSettled([
    triggerWorkflow(trigger as any, {
      bookingId:      booking.id,
      bookingNumber:  booking.bookingNumber,
      customerId:     booking.customerId    ?? undefined,
      customerName:   booking.customerName,
      customerMobile: booking.customerMobile,
      customerEmail:  booking.customerEmail ?? undefined,
      packageName:    booking.packageName   ?? undefined,
      amount:         isFullyPaid ? finalAmountNum : thisPaymentAmount,
      paidAmount:     thisPaymentAmount,
      totalPaid:      newPaidAmount,
      balanceAmount:  remainingBalance,
      invoiceNumber:  invoiceNumber         ?? undefined,
      invoiceUrl,
      paymentRef:     paymentRef            ?? undefined,
      paymentMode:    paymentModeLabel,
      paymentDate:    paymentDateStr,
      attachments,
    } as any),
    sendAdminPaymentAlert({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
      mobile: booking.customerMobile,
      amount: displayAmount,
      isFullyPaid,
      invoiceNumber,
      balance: remainingBalance > 0 ? remainingBalance.toLocaleString("en-IN") : undefined,
    }),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[payments] Notification step ${i === 0 ? "triggerWorkflow" : "sendAdminPaymentAlert"} failed for booking ${booking.bookingNumber}:`, r.reason);
    }
  });

  // ── Customer payment receipt email (fire-and-forget) ──────────────────────
  if (booking.customerEmail) {
    sendPaymentReceipt(booking.customerEmail, {
      customerName:  booking.customerName,
      bookingNumber: booking.bookingNumber,
      packageName:   booking.packageName ?? undefined,
      paymentAmount: thisPaymentAmount,
      paymentDate:   new Date(),
      totalAmount:   finalAmountNum || undefined,
      paidSoFar:     newPaidAmount,
      balanceDue:    remainingBalance > 0 ? remainingBalance : undefined,
    }).then(r => {
      if (!r.ok) console.error(`[payments] Payment receipt email failed for ${booking.bookingNumber}:`, r.error);
      else console.log(`[payments] Payment receipt email sent to ${booking.customerEmail} for ${booking.bookingNumber}`);
    }).catch(err => console.error(`[payments] Payment receipt email error for ${booking.bookingNumber}:`, err?.message));
  }

  // Auto-generate Hajj Agreement when fully paid
  if (isFullyPaid && booking.id) {
    autoGenerateAgreement(booking.id).catch(err =>
      console.error("[payments] autoGenerateAgreement failed:", err)
    );
  }
}

function getRazorpay(): RazorpayWithPaymentLink {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_SECRET;
  if (!keyId || !secret) {
    throw new Error("Razorpay keys not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: secret }) as RazorpayWithPaymentLink;
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

  if (booking.status !== "approved" && booking.status !== "partially_paid" && booking.status !== "confirmed") {
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

  if (existingBooking.status !== "approved" && existingBooking.status !== "partially_paid" && existingBooking.status !== "confirmed") {
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
  const newOnlinePaidAmount = Number(existingBooking.onlinePaidAmount || 0) + thisPayment;
  const isFullyPaid = newPaidAmount >= finalAmount;

  const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
  const invoiceNumber = isFullyPaid
    ? (existingBooking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
    : existingBooking.invoiceNumber;

  // Use pool.query (not db.update().returning()) — avoids VPS bundled-CJS Drizzle bug
  await pool.query(
    `UPDATE bookings SET
       status=$1, razorpay_order_id=$2, razorpay_payment_id=$3,
       paid_amount=$4, online_paid_amount=$5,
       invoice_number=COALESCE(NULLIF($6,''), invoice_number),
       last_payment_date=NOW(),
       updated_at=NOW()
     WHERE id=$7`,
    [
      newStatus, razorpayOrderId,
      isFullyPaid ? razorpayPaymentId : (existingBooking.razorpayPaymentId || null),
      String(newPaidAmount), String(newOnlinePaidAmount),
      invoiceNumber || null, bookingId,
    ]
  );
  const _verifyBkRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
  const booking = mapBookingRow(_verifyBkRes.rows[0]);

  // Record in payment_transactions + auto-create journal entry (Dr: Cash  Cr: Customer Advance)
  recordOnlinePaymentTransaction(bookingId, thisPayment, razorpayPaymentId, "Online payment via Razorpay", booking.bookingNumber);

  console.log("[verify] Payment verified:", razorpayPaymentId, "→ Booking", booking.bookingNumber, newStatus);

  // Await invoice upsert so we have the real invoice number for notifications
  let finalInvoiceNumber = invoiceNumber;
  try {
    const upserted = await upsertInvoiceForBooking(bookingId);
    if (upserted?.invoice_number) {
      finalInvoiceNumber = upserted.invoice_number as string;
      // Persist invoice_number on the booking row if not already set
      await pool.query(
        `UPDATE bookings SET invoice_number=$1, updated_at=NOW() WHERE id=$2 AND (invoice_number IS NULL OR invoice_number='')`,
        [finalInvoiceNumber, bookingId]
      );
    }
  } catch (err) {
    console.error("[verify] upsertInvoice failed:", err);
  }

  // Advance journey_status based on partial vs full payment
  const newJourneyStatus = isFullyPaid ? "payment_received" : "partial_payment_received";
  const journeyAllowedFrom = isFullyPaid
    ? "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved','partial_payment_received')"
    : "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved')";
  pool.query(
    `UPDATE bookings SET journey_status = $1, updated_at = NOW()
     WHERE id = $2 AND journey_status IN ${journeyAllowedFrom}`,
    [newJourneyStatus, bookingId]
  ).then(() => {
    console.log(`[verify] journey_status → ${newJourneyStatus} for`, booking.bookingNumber);
    broadcastCustomerJourneyUpdate(bookingId, newJourneyStatus);
  }).catch((err: any) => console.error("[verify] journey_status advance failed:", err?.message));

  const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
  try {
    await processPaymentSuccessNotifications({
      booking,
      isFullyPaid,
      thisPaymentAmount: thisPayment,
      newPaidAmount,
      remainingBalance,
      invoiceNumber: finalInvoiceNumber,
      paymentRef: razorpayPaymentId,
      paymentMode: "online",
      paymentDate: new Date(),
    });
  } catch (err) {
    console.error("[verify] processPaymentSuccessNotifications failed:", err);
  }

  const siteBase = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.SITE_URL || "https://alburhantravels.com");
  const invoiceUrl = finalInvoiceNumber ? `${siteBase}/invoice/${booking.bookingNumber}` : null;

  res.json({
    success: true,
    invoice: invoiceUrl || null,
    status: newStatus,
    isFullyPaid,
    invoiceNumber: finalInvoiceNumber || null,
    booking: {
      ...booking,
      totalAmount: booking.totalAmount ? Number(booking.totalAmount) : null,
      gstAmount: booking.gstAmount ? Number(booking.gstAmount) : null,
      finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
      paidAmount: newPaidAmount,
      remainingBalance: Math.max(0, finalAmount - newPaidAmount),
      invoiceNumber: finalInvoiceNumber || booking.invoiceNumber || null,
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
  const newOnlinePaidAmount = Number(booking.onlinePaidAmount || 0) + thisPayment;
  const isFullyPaid = newPaidAmount >= finalAmount;
  const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
  const invoiceNumber = isFullyPaid
    ? (booking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
    : booking.invoiceNumber;

  // Use pool.query (not db.update().returning()) — avoids VPS bundled-CJS Drizzle bug
  await pool.query(
    `UPDATE bookings SET
       status=$1, razorpay_payment_id=$2,
       paid_amount=$3, online_paid_amount=$4,
       invoice_number=COALESCE(NULLIF($5,''), invoice_number),
       last_payment_date=NOW(),
       updated_at=NOW()
     WHERE id=$6`,
    [
      newStatus, capturedPayment?.id || (booking.razorpayPaymentId || null),
      String(newPaidAmount), String(newOnlinePaidAmount),
      invoiceNumber || null, booking.id,
    ]
  );
  const _syncBkRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [booking.id]);
  const updated = mapBookingRow(_syncBkRes.rows[0]);

  // Record in payment_transactions for complete audit trail
  if (capturedPayment?.id) {
    recordOnlinePaymentTransaction(booking.id, thisPayment, capturedPayment.id, "Online payment via Razorpay (synced)");
  }

  console.log("[sync-payment] Synced booking:", updated.bookingNumber, "→", newStatus);

  // Upsert invoice and capture real invoice number (covers partial payments too)
  let finalInvoiceNumber = invoiceNumber;
  try {
    const upserted = await upsertInvoiceForBooking(booking.id);
    if (upserted?.invoice_number) {
      finalInvoiceNumber = upserted.invoice_number as string;
      await pool.query(
        `UPDATE bookings SET invoice_number=$1, updated_at=NOW() WHERE id=$2 AND (invoice_number IS NULL OR invoice_number='')`,
        [finalInvoiceNumber, booking.id]
      );
    }
  } catch (err) {
    console.error("[sync-payment] upsertInvoice failed:", err);
  }

  const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
  try {
    await processPaymentSuccessNotifications({
      booking: updated,
      isFullyPaid,
      thisPaymentAmount: thisPayment,
      newPaidAmount,
      remainingBalance,
      invoiceNumber: finalInvoiceNumber,
      paymentRef: capturedPayment?.id,
      paymentMode: "online",
      paymentDate: new Date(),
    });
  } catch (err) {
    console.error("[sync-payment] processPaymentSuccessNotifications failed:", err);
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

  const PROCESSED_EVENTS = ["payment.captured", "order.paid", "payment_link.paid"];
  if (!PROCESSED_EVENTS.includes(eventType)) {
    res.json({ message: "Event received, not processed" });
    return;
  }

  try {
    const paymentId: string | undefined =
      event?.payload?.payment?.entity?.id;
    const amountPaise: number | undefined =
      event?.payload?.payment?.entity?.amount;

    let booking: typeof bookingsTable.$inferSelect | undefined;

    if (eventType === "payment_link.paid") {
      // Payment link flow: reference_id is either:
      //   NEW format: "<bookingNumber>|<base36-timestamp>" e.g. "ABT26078035|lk3q2p8"
      //   OLD format: "<uuid>" (booking.id) — kept for backward compat
      const referenceId: string | undefined =
        event?.payload?.payment_link?.entity?.reference_id;
      if (!referenceId) {
        console.error("[Webhook] payment_link.paid: no reference_id in payload");
        res.json({ message: "No reference_id in payment_link payload" });
        return;
      }

      let rows: typeof bookingsTable.$inferSelect[] = [];

      if (referenceId.includes("|")) {
        // New format: extract bookingNumber before the pipe
        const bookingNumber = referenceId.split("|")[0];
        rows = await db
          .select()
          .from(bookingsTable)
          .where(eq(bookingsTable.bookingNumber, bookingNumber))
          .limit(1);
      } else {
        // Old format: referenceId IS the booking UUID
        rows = await db
          .select()
          .from(bookingsTable)
          .where(eq(bookingsTable.id, referenceId))
          .limit(1);
      }

      booking = rows[0];
      if (!booking) {
        console.warn("[Webhook] payment_link.paid: no booking found for reference_id:", referenceId);
        res.json({ message: "Booking not found for payment link" });
        return;
      }
    } else {
      // Standard order flow: match on razorpayOrderId
      const orderId: string | undefined =
        event?.payload?.payment?.entity?.order_id ||
        event?.payload?.order?.entity?.id;
      if (!orderId) {
        console.error("[Webhook] No order_id in payload");
        res.json({ message: "No order_id in payload" });
        return;
      }
      const rows = await db
        .select()
        .from(bookingsTable)
        .where(eq(bookingsTable.razorpayOrderId, orderId))
        .limit(1);
      booking = rows[0];
      if (!booking) {
        console.warn("[Webhook] No booking found for orderId:", orderId);
        res.json({ message: "Booking not found" });
        return;
      }
    }

    if (booking.status === "confirmed") {
      console.log("[Webhook] Booking already confirmed:", booking.bookingNumber);
      res.json({ message: "Already confirmed" });
      return;
    }

    // Idempotency guard: skip if this paymentId was already recorded in payment_transactions
    if (paymentId) {
      const dupCheck = await pool.query(
        `SELECT 1 FROM payment_transactions WHERE reference_number=$1 AND booking_id=$2 LIMIT 1`,
        [paymentId, booking.id]
      );
      if (dupCheck.rows.length > 0) {
        console.log(`[Webhook] Duplicate paymentId ${paymentId} for booking ${booking.bookingNumber} — skipping`);
        res.json({ message: "Already processed" });
        return;
      }
    }

    const finalAmount = Number(booking.finalAmount || 0);
    const previouslyPaid = Number(booking.paidAmount || 0);
    const thisPayment = amountPaise ? amountPaise / 100 : (finalAmount - previouslyPaid);
    const newPaidAmount = previouslyPaid + thisPayment;
    const newOnlinePaidAmount = Number(booking.onlinePaidAmount || 0) + thisPayment;
    const isFullyPaid = newPaidAmount >= finalAmount;
    const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
    const invoiceNumber = isFullyPaid
      ? (booking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
      : booking.invoiceNumber;

    // Use pool.query (not db.update().returning()) — avoids VPS bundled-CJS Drizzle bug
    await pool.query(
      `UPDATE bookings SET
         status=$1, razorpay_payment_id=$2,
         paid_amount=$3, online_paid_amount=$4,
         invoice_number=COALESCE(NULLIF($5,''), invoice_number),
         last_payment_date=NOW(),
         updated_at=NOW()
       WHERE id=$6`,
      [
        newStatus, paymentId || (booking.razorpayPaymentId || null),
        String(newPaidAmount), String(newOnlinePaidAmount),
        invoiceNumber || null, booking.id,
      ]
    );
    const _wbBkRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [booking.id]);
    const updated = mapBookingRow(_wbBkRes.rows[0]);

    // Record in payment_transactions + auto-create journal entry (Dr: Cash  Cr: Customer Advance)
    if (paymentId) {
      recordOnlinePaymentTransaction(booking.id, thisPayment, paymentId, "Online payment via Razorpay (webhook)", updated.bookingNumber);
    }

    // Advance journey_status (webhook didn't previously do this — customers got stuck)
    const webhookJourneyStatus = isFullyPaid ? "payment_received" : "partial_payment_received";
    const webhookAllowedFrom = isFullyPaid
      ? "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved','partial_payment_received')"
      : "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved')";
    pool.query(
      `UPDATE bookings SET journey_status = $1, updated_at = NOW()
       WHERE id = $2 AND journey_status IN ${webhookAllowedFrom}`,
      [webhookJourneyStatus, booking.id]
    ).then(() => {
      console.log(`[Webhook] journey_status → ${webhookJourneyStatus} for ${updated.bookingNumber}`);
      broadcastCustomerJourneyUpdate(booking.id, webhookJourneyStatus);
    }).catch((err: any) => console.error("[Webhook] journey_status advance failed:", err?.message));

    // Upsert invoice and capture real invoice number (covers partial payments too)
    let finalInvoiceNumber = invoiceNumber;
    try {
      const upserted = await upsertInvoiceForBooking(booking.id);
      if (upserted?.invoice_number) {
        finalInvoiceNumber = upserted.invoice_number as string;
        await pool.query(
          `UPDATE bookings SET invoice_number=$1, updated_at=NOW() WHERE id=$2 AND (invoice_number IS NULL OR invoice_number='')`,
          [finalInvoiceNumber, booking.id]
        );
      }
    } catch (invErr: any) {
      console.error("[Webhook] upsertInvoice failed:", invErr?.message);
    }

    console.log("[Webhook] Booking updated:", updated.bookingNumber, "→", newStatus);

    const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
    try {
      await processPaymentSuccessNotifications({
        booking: updated,
        isFullyPaid,
        thisPaymentAmount: thisPayment,
        newPaidAmount,
        remainingBalance,
        invoiceNumber: finalInvoiceNumber,
        paymentRef: paymentId,
        paymentMode: "online",
        paymentDate: new Date(),
      });
    } catch (err) {
      console.error("[Webhook] processPaymentSuccessNotifications failed:", err);
    }

    res.json({ message: "Webhook processed", status: newStatus });
  } catch (err: any) {
    console.error("[Webhook] Processing error:", err?.message);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

router.get("/analytics", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const monthPrefix = today.slice(0, 7); // YYYY-MM
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      todayRes,
      monthlyRes,
      pendingRes,
      overdueRes,
      statusRes,
      recentBookings,
    ] = await Promise.all([
      // Today's collection from payment_transactions
      db
        .select({ total: sql<string>`COALESCE(SUM(${paymentTransactionsTable.amount}), 0)` })
        .from(paymentTransactionsTable)
        .where(eq(paymentTransactionsTable.paymentDate, today)),

      // Monthly revenue from payment_transactions
      db
        .select({ total: sql<string>`COALESCE(SUM(${paymentTransactionsTable.amount}), 0)` })
        .from(paymentTransactionsTable)
        .where(sql`${paymentTransactionsTable.paymentDate} LIKE ${monthPrefix + "%"}`),

      // Total pending: outstanding balance for pending + approved bookings
      db
        .select({
          total: sql<string>`COALESCE(SUM(GREATEST(COALESCE(${bookingsTable.finalAmount}, 0) - COALESCE(${bookingsTable.paidAmount}, 0), 0)), 0)`,
        })
        .from(bookingsTable)
        .where(inArray(bookingsTable.status, ["pending", "approved"])),

      // Overdue: partially_paid + pending bookings older than 30 days with positive balance
      db
        .select({
          total: sql<string>`COALESCE(SUM(GREATEST(COALESCE(${bookingsTable.finalAmount}, 0) - COALESCE(${bookingsTable.paidAmount}, 0), 0)), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(bookingsTable)
        .where(
          and(
            inArray(bookingsTable.status, ["pending", "partially_paid"]),
            lt(bookingsTable.createdAt, thirtyDaysAgo),
            sql`COALESCE(${bookingsTable.finalAmount}, 0) - COALESCE(${bookingsTable.paidAmount}, 0) > 0`,
          ),
        ),

      // Status breakdown
      db
        .select({
          status: bookingsTable.status,
          count: sql<string>`COUNT(*)`,
        })
        .from(bookingsTable)
        .groupBy(bookingsTable.status),

      // Recent bookings with payment info (last 100)
      db
        .select({
          id: bookingsTable.id,
          bookingNumber: bookingsTable.bookingNumber,
          customerName: bookingsTable.customerName,
          customerMobile: bookingsTable.customerMobile,
          status: bookingsTable.status,
          finalAmount: bookingsTable.finalAmount,
          paidAmount: bookingsTable.paidAmount,
          invoiceNumber: bookingsTable.invoiceNumber,
          createdAt: bookingsTable.createdAt,
          updatedAt: bookingsTable.updatedAt,
          isOffline: bookingsTable.isOffline,
        })
        .from(bookingsTable)
        .orderBy(sql`${bookingsTable.updatedAt} DESC`)
        .limit(100),
    ]);

    const todayCollection = Number(todayRes[0]?.total || 0);
    const monthlyRevenue = Number(monthlyRes[0]?.total || 0);
    const totalPending = Number(pendingRes[0]?.total || 0);
    const totalOverdue = Number(overdueRes[0]?.total || 0);
    const overdueCount = Number(overdueRes[0]?.count || 0);

    const paymentStatusBreakdown = statusRes.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, {});

    const bookingsWithRemaining = recentBookings.map(b => ({
      ...b,
      finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
      paidAmount: b.paidAmount ? Number(b.paidAmount) : 0,
      remainingAmount: b.finalAmount
        ? Math.max(0, Number(b.finalAmount) - Number(b.paidAmount || 0))
        : null,
      createdAt: b.createdAt?.toISOString?.(),
      updatedAt: b.updatedAt?.toISOString?.(),
    }));

    res.json({
      todayCollection,
      monthlyRevenue,
      totalPending,
      totalOverdue,
      overdueCount,
      paymentStatusBreakdown,
      bookings: bookingsWithRemaining,
    });
  } catch (err: any) {
    console.error("[analytics]", err?.message);
    res.status(500).json({ message: "Failed to load analytics" });
  }
});

// Razorpay maximum payment link amount: ₹5,00,000 per link
const RAZORPAY_MAX_LINK_AMOUNT = 500000;

router.post("/:bookingId/payment-link", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);
    const booking = bookings[0];

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    if (!booking.finalAmount) {
      res.status(400).json({ message: "Booking amount not set" });
      return;
    }

    const finalAmount = Number(booking.finalAmount);
    const paidAmount  = Number(booking.paidAmount || 0);
    const remaining   = finalAmount - paidAmount;

    if (remaining <= 0) {
      res.status(400).json({ message: "This booking is already fully paid" });
      return;
    }

    // Cap at Razorpay maximum per link — customer can pay remaining in multiple links
    const linkAmount  = Math.min(remaining, RAZORPAY_MAX_LINK_AMOUNT);
    const isCapped    = linkAmount < remaining;

    const rz = getRazorpay();
    const expireBy = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const clean   = booking.customerMobile.replace(/\D/g, "");
    const contact = clean.length === 10 ? `91${clean}` : clean;

    // reference_id: "<bookingNumber>|<base36-ts>" — unique per link, ≤40 chars (Razorpay limit)
    const referenceId = `${booking.bookingNumber}|${Date.now().toString(36)}`;

    const linkDesc = isCapped
      ? `Partial payment for ${booking.bookingNumber} (₹${linkAmount.toLocaleString("en-IN")} of ₹${remaining.toLocaleString("en-IN")} balance)`
      : `Balance payment for booking ${booking.bookingNumber}`;

    const linkPayload: RazorpayPaymentLinkPayload = {
      amount:       Math.round(linkAmount * 100),
      currency:     "INR",
      description:  linkDesc,
      reference_id: referenceId,
      customer:     { name: booking.customerName, contact },
      expire_by:    expireBy,
      reminder_enable: false,
      notify: { sms: false, email: false },
    };

    const link = await rz.paymentLink.create(linkPayload);
    if (!link.short_url) {
      console.error("[payment-link] Razorpay returned no short_url:", link);
      res.status(502).json({ message: "Razorpay did not return a usable payment URL" });
      return;
    }
    const paymentUrl: string = link.short_url;

    // Send via all channels: SMS, WhatsApp (template), Email, Dashboard
    // fireNotificationEvent("payment_due") handles all channels and logs each in notification_logs
    // Pass paymentUrl as `description` — notificationEngine uses it as paymentUrl for the WA template
    const notifCtx = {
      customerName:   booking.customerName,
      customerMobile: booking.customerMobile,
      customerEmail:  booking.customerEmail ?? undefined,
      customerId:     booking.customerId    ?? undefined,
      bookingId:      booking.id,
      bookingNumber:  booking.bookingNumber ?? undefined,
      packageName:    booking.packageName   ?? undefined,
      invoiceNumber:  booking.invoiceNumber ?? undefined,
      amount:         finalAmount,
      balanceAmount:  remaining,
      paidAmount:     paidAmount,
      description:    paymentUrl,
    };

    // Fire notifications — non-fatal, so errors are logged but don't fail the response
    fireNotificationEvent("payment_due", notifCtx).catch((err: any) => {
      console.error("[payment-link] notification error:", err?.message);
    });

    console.log(`[payment-link] Created for ${booking.bookingNumber}: ₹${linkAmount} (of ₹${remaining} remaining), capped=${isCapped}, url=${paymentUrl}`);

    res.json({
      paymentUrl,
      linkAmount,
      remaining,
      isCapped,
      customerName:  booking.customerName,
      bookingNumber: booking.bookingNumber,
    });
  } catch (err: any) {
    console.error("[payment-link]", err?.message, err?.error);
    const msg = err?.error?.description || err?.message || "Failed to create payment link";
    res.status(500).json({ message: msg });
  }
});

router.post("/by-number/:bookingNumber/create-order", async (req, res) => {
  const { bookingNumber } = req.params;
  try {
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingNumber, bookingNumber))
      .limit(1);
    const booking = bookings[0];

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    if (booking.status !== "approved" && booking.status !== "partially_paid") {
      res.status(400).json({ message: "This booking is not currently eligible for online payment. Please contact Al Burhan for assistance." });
      return;
    }
    if (!booking.finalAmount) {
      res.status(400).json({ message: "Booking amount not set — contact Al Burhan to confirm your package amount." });
      return;
    }

    const finalAmount = Number(booking.finalAmount);
    const paidAmount = Number(booking.paidAmount || 0);
    const remaining = finalAmount - paidAmount;

    if (remaining <= 0) {
      res.status(400).json({ message: "This booking is already fully paid" });
      return;
    }

    // Cap at Razorpay max per-order amount to avoid "Amount exceeds maximum" errors
    const RAZORPAY_ORDER_MAX = 500000; // ₹5,00,000
    if (remaining > RAZORPAY_ORDER_MAX) {
      res.status(400).json({
        message: `This booking has a large outstanding balance (₹${remaining.toLocaleString("en-IN")}). Please ask the admin to generate a payment link instead, or pay in instalments.`,
        remaining,
        maxPerOrder: RAZORPAY_ORDER_MAX,
      });
      return;
    }

    const rz = getRazorpay();
    const order = await rz.orders.create({
      amount: Math.round(remaining * 100),
      currency: "INR",
      receipt: `pay-${bookingNumber}`,
    });

    await db
      .update(bookingsTable)
      .set({ razorpayOrderId: order.id, updatedAt: new Date() })
      .where(eq(bookingsTable.id, booking.id));

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
      bookingId: booking.id,
      customerName: booking.customerName,
      customerMobile: booking.customerMobile,
      remainingAmount: remaining,
    });
  } catch (err: any) {
    console.error("[create-order-public]", err?.message, err?.error);
    const msg = err?.error?.description || err?.message || "Failed to create payment order";
    res.status(500).json({ message: msg });
  }
});

router.get("/razorpay-key", (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  res.json({ keyId });
});

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escJs(str: string): string {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

router.get("/checkout-page", async (req, res) => {
  const raw = req.query as Record<string, string | undefined>;
  const orderId = String(raw.orderId ?? "");
  const bookingId = String(raw.bookingId ?? "");
  const amount = String(raw.amount ?? "0");
  const name = String(raw.name ?? "");
  const mobile = String(raw.mobile ?? "");
  const bookingNumber = String(raw.bookingNumber ?? "");

  if (!orderId || !bookingId) {
    res.status(400).send("Missing required parameters");
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const amountNum = Number(amount);
  const amountInRupees = (amountNum / 100).toLocaleString("en-IN");

  const safeOrderId = escJs(orderId);
  const safeBookingId = escJs(bookingId);
  const safeName = escJs(name);
  const safeMobile = escJs(mobile);
  const safeKeyId = escJs(keyId);
  const safeBookingNum = escJs(bookingNumber);

  const displayBookingNum = escHtml(bookingNumber || "—");
  const displayName = escHtml(name);
  const displayAmount = escHtml(amountInRupees);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<title>Payment &mdash; Al Burhan Tours</title>
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
    <div style="font-size:24px;color:#C9A23F;font-weight:800;">&#x627;&#x644;&#x628;&#x631;&#x6C1;&#x627;&#x646;</div>
    <div class="logo-main">AL BURHAN</div>
    <div class="logo-sub">TOURS &amp; TRAVELS</div>
  </div>

  <div id="payment-form">
    <div class="booking-info">
      <div class="booking-label">Booking Reference</div>
      <div class="booking-num">#${displayBookingNum}</div>
      <div style="font-size:12px;color:#5A5A5A;margin-top:4px;">${displayName}</div>
    </div>
    <div class="amount-box">
      <div class="amount-label">Amount to Pay</div>
      <div class="amount">&#x20B9;${displayAmount}</div>
      <div class="amount-note">Including all taxes and fees</div>
    </div>
    <button class="pay-btn" id="payBtn" onclick="openRazorpay()">Pay &#x20B9;${displayAmount} Securely</button>
    <div class="loading" id="loading">Processing payment&hellip;</div>
    <div class="secure-note">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M6 1L1 3v4c0 2.76 2.24 5 5 5s5-2.24 5-5V3L6 1z" fill="#9A9A9A"/></svg>
      Secured by Razorpay &bull; 256-bit SSL
    </div>
  </div>

  <div class="status" id="success">
    <div class="status-icon">&#x2705;</div>
    <div class="status-title">Payment Successful!</div>
    <div class="status-msg">Your payment has been received.<br/>Your booking is being confirmed.<br/><br/>Jazak Allah Khair!</div>
    <button class="close-btn" onclick="notifyApp('success')">Return to App</button>
  </div>

  <div class="status" id="failure">
    <div class="status-icon">&#x274C;</div>
    <div class="status-title">Payment Failed</div>
    <div class="status-msg" id="failureMsg">The payment could not be processed. Please try again.</div>
    <button class="close-btn" onclick="notifyApp('failure')">Go Back</button>
  </div>
</div>

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
var RZP_DATA = {
  key: '${safeKeyId}',
  amount: ${amountNum},
  orderId: '${safeOrderId}',
  bookingId: '${safeBookingId}',
  name: '${safeName}',
  mobile: '${safeMobile}',
  bookingNum: '${safeBookingNum}'
};

function notifyApp(type) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'payment_' + type }));
  } else {
    window.close();
  }
}

function openRazorpay() {
  document.getElementById('payBtn').disabled = true;
  document.getElementById('loading').style.display = 'block';

  var options = {
    key: RZP_DATA.key,
    amount: RZP_DATA.amount,
    currency: 'INR',
    name: 'Al Burhan Tours & Travels',
    description: 'Booking #' + RZP_DATA.bookingNum,
    order_id: RZP_DATA.orderId,
    prefill: { name: RZP_DATA.name, contact: '+91' + RZP_DATA.mobile },
    theme: { color: '#0B3D2E' },
    modal: {
      ondismiss: function() {
        document.getElementById('payBtn').disabled = false;
        document.getElementById('loading').style.display = 'none';
        notifyApp('dismissed');
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
          bookingId: RZP_DATA.bookingId
        })
      })
      .then(function(r) {
        if (!r.ok) { return r.json().then(function(e) { throw new Error(e.message || 'Verification failed'); }); }
        return r.json();
      })
      .then(function() {
        document.getElementById('success').style.display = 'block';
        setTimeout(function() { notifyApp('success'); }, 3000);
      })
      .catch(function(err) {
        var msg = err && err.message ? err.message : 'Payment could not be verified. Please contact support.';
        document.getElementById('failure').style.display = 'block';
        document.getElementById('failureMsg').textContent = msg;
        setTimeout(function() { notifyApp('failure'); }, 5000);
      });
    }
  };

  var rzp = new Razorpay(options);
  rzp.on('payment.failed', function(response) {
    document.getElementById('payment-form').style.display = 'none';
    document.getElementById('failure').style.display = 'block';
    var msg = response && response.error && response.error.description;
    document.getElementById('failureMsg').textContent = msg || 'Payment failed. Please try again.';
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
  const logPfx = "[verify-public]";

  console.log(`${logPfx} ▶ bookingId=${bookingId} orderId=${razorpay_order_id?.slice(-8)} paymentId=${razorpay_payment_id?.slice(-8)}`);

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
    console.error(`${logPfx} ❌ Missing fields — orderId:${!!razorpay_order_id} paymentId:${!!razorpay_payment_id} sig:${!!razorpay_signature} bookingId:${!!bookingId}`);
    res.status(400).json({ success: false, message: "Missing required fields" });
    return;
  }

  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    console.error(`${logPfx} ❌ RAZORPAY_SECRET not configured`);
    res.status(500).json({ success: false, message: "Payment gateway not configured" });
    return;
  }

  const existingBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const booking = existingBookings[0];

  if (!booking) {
    console.error(`${logPfx} ❌ Booking not found: ${bookingId}`);
    res.status(404).json({ success: false, message: "Booking not found" });
    return;
  }

  console.log(`${logPfx} Booking: ${booking.bookingNumber} | status=${booking.status} | paid=${booking.paidAmount}/${booking.finalAmount}`);

  // Idempotency: already confirmed with same payment
  if (
    booking.status === "confirmed" &&
    booking.razorpayOrderId === razorpay_order_id &&
    booking.razorpayPaymentId === razorpay_payment_id
  ) {
    console.log(`${logPfx} ✅ Already confirmed (idempotent): ${booking.bookingNumber}`);
    res.json({ success: true, status: "confirmed", idempotent: true });
    return;
  }

  if (booking.status !== "approved" && booking.status !== "partially_paid") {
    console.error(`${logPfx} ❌ Not payable status: ${booking.status} for ${booking.bookingNumber}`);
    res.status(400).json({ success: false, message: "This booking is not in a payable state" });
    return;
  }

  if (booking.razorpayOrderId !== razorpay_order_id) {
    console.error(`${logPfx} ❌ Order ID mismatch — booking: ${booking.razorpayOrderId} | request: ${razorpay_order_id}`);
    res.status(400).json({ success: false, message: "Order ID does not match this booking" });
    return;
  }

  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generated !== razorpay_signature) {
    console.error(`${logPfx} ❌ Signature mismatch for payment: ${razorpay_payment_id}`);
    res.status(400).json({ success: false, message: "Invalid payment signature" });
    return;
  }

  console.log(`${logPfx} ✅ Signature verified for ${booking.bookingNumber}`);

  const finalAmount = Number(booking.finalAmount ?? 0);
  const existingPaid = Number(booking.paidAmount ?? 0);
  let chargeAmount = finalAmount - existingPaid;

  try {
    const rzp = getRazorpay();
    const payment = await rzp.payments.fetch(razorpay_payment_id) as any;
    if (payment.amount && payment.order_id === razorpay_order_id) {
      chargeAmount = Number(payment.amount) / 100;
      console.log(`${logPfx} Razorpay confirmed charge: ₹${chargeAmount}`);
    }
  } catch (fetchErr: any) {
    console.warn(`${logPfx} Could not fetch Razorpay payment (using calculated ₹${chargeAmount}): ${fetchErr?.message}`);
  }

  const newPaidAmount = existingPaid + chargeAmount;
  const newOnlinePaidAmount = Number(booking.onlinePaidAmount ?? 0) + chargeAmount;
  const remainingBalance = Math.max(0, finalAmount - newPaidAmount);
  const isFullyPaid = remainingBalance <= 0;
  const newStatus = isFullyPaid ? "confirmed" : "partially_paid";
  const invoiceNumber = isFullyPaid
    ? (booking.invoiceNumber || `INV${Date.now().toString().slice(-8)}`)
    : booking.invoiceNumber;

  console.log(`${logPfx} ₹${chargeAmount} paid | total ₹${newPaidAmount}/${finalAmount} | isFullyPaid=${isFullyPaid} | newStatus=${newStatus}`);

  // Use pool.query (not db.update().returning()) — avoids VPS bundled-CJS Drizzle bug
  await pool.query(
    `UPDATE bookings SET
       status=$1, razorpay_payment_id=$2,
       paid_amount=$3, online_paid_amount=$4,
       invoice_number=COALESCE(NULLIF($5,''), invoice_number),
       last_payment_date=NOW(),
       updated_at=NOW()
     WHERE id=$6`,
    [
      newStatus, razorpay_payment_id,
      String(newPaidAmount), String(newOnlinePaidAmount),
      invoiceNumber || null, bookingId,
    ]
  );
  const _vpBkRes = await pool.query(`SELECT * FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
  const updated = mapBookingRow(_vpBkRes.rows[0]);

  // Record in payment_transactions + auto-create journal entry (Dr: Cash  Cr: Customer Advance)
  recordOnlinePaymentTransaction(bookingId, chargeAmount, razorpay_payment_id, "Online payment via Razorpay (public)", updated.bookingNumber);

  console.log(`${logPfx} ✅ DB updated: ${updated.bookingNumber} → ${newStatus}`);

  const siteBase = process.env.SITE_URL || "https://alburhantravels.com";
  const invoiceUrl = invoiceNumber ? `${siteBase}/invoice/${booking.bookingNumber}` : null;

  // Respond immediately — customer sees success without waiting for pipeline
  res.json({
    success: true,
    status: newStatus,
    isFullyPaid,
    invoiceUrl,
    invoiceNumber: invoiceNumber || null,
    booking: {
      id: updated.id,
      bookingNumber: updated.bookingNumber,
      status: newStatus,
      paidAmount: newPaidAmount,
      remainingBalance,
    },
  });

  // ── Full post-payment pipeline (fire-and-forget after response) ─────────────
  // Runs the same pipeline as /verify: invoice upsert, journey_status advance,
  // PDF generation, WhatsApp/SMS/Email, agreement auto-generation, audit logs.
  (async () => {
    try {
      console.log(`${logPfx} ▶ [PIPELINE] Starting post-payment pipeline for ${updated.bookingNumber}`);

      // Step 1: Upsert invoice record in DB
      let finalInvoiceNumber = invoiceNumber;
      try {
        const upserted = await upsertInvoiceForBooking(bookingId);
        if (upserted?.invoice_number) {
          finalInvoiceNumber = upserted.invoice_number as string;
          await pool.query(
            `UPDATE bookings SET invoice_number=$1, updated_at=NOW() WHERE id=$2 AND (invoice_number IS NULL OR invoice_number='')`,
            [finalInvoiceNumber, bookingId]
          );
          console.log(`${logPfx} ✅ [PIPELINE] Invoice upserted: ${finalInvoiceNumber}`);
        }
      } catch (invErr: any) {
        console.error(`${logPfx} ❌ [PIPELINE] upsertInvoice failed:`, invErr?.message);
      }

      // Step 2: Advance journey_status based on partial vs full payment
      const pipelineJourneyStatus = isFullyPaid ? "payment_received" : "partial_payment_received";
      const pipelineAllowedFrom = isFullyPaid
        ? "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved','partial_payment_received')"
        : "('booking_requested','documents_pending','documents_received','admin_verification','payment_pending','booking_approved')";
      pool.query(
        `UPDATE bookings SET journey_status = $1, updated_at = NOW()
         WHERE id = $2 AND journey_status IN ${pipelineAllowedFrom}`,
        [pipelineJourneyStatus, bookingId]
      ).then(() => {
        console.log(`${logPfx} ✅ [PIPELINE] journey_status → ${pipelineJourneyStatus}`);
        broadcastCustomerJourneyUpdate(bookingId, pipelineJourneyStatus);
      }).catch((err: any) => console.error(`${logPfx} ❌ [PIPELINE] journey_status advance failed:`, err?.message));

      // Step 3: Full notification pipeline — PDFs, WhatsApp, SMS, Email, notification_logs
      console.log(`${logPfx} ▶ [PIPELINE] Calling processPaymentSuccessNotifications (isFullyPaid=${isFullyPaid})`);
      await processPaymentSuccessNotifications({
        booking: updated,
        isFullyPaid,
        thisPaymentAmount: chargeAmount,
        newPaidAmount,
        remainingBalance,
        invoiceNumber: finalInvoiceNumber,
        paymentRef: razorpay_payment_id,
        paymentMode: "online",
        paymentDate: new Date(),
      });

      console.log(`${logPfx} ✅ [PIPELINE] Complete for ${updated.bookingNumber} — invoice=${finalInvoiceNumber} status=${newStatus}`);
    } catch (pipelineErr: any) {
      console.error(`${logPfx} ❌ [PIPELINE] Failed for ${booking.bookingNumber}:`, pipelineErr?.message, pipelineErr?.stack);
    }
  })();
});

router.post("/:bookingId/send-reminder", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const result = await sendReminderForBookingId(bookingId, "admin");
    if (!result.success) {
      res.status(400).json({ message: result.message });
      return;
    }
    res.json({ success: true, message: result.message });
  } catch (err: any) {
    console.error("[send-reminder]", err?.message, err?.stack);
    res.status(500).json({ message: err?.message || "Failed to send reminder" });
  }
});

router.get("/:bookingId/reminder-history", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const logs = await getReminderHistory(bookingId);
    res.json(logs);
  } catch (err: any) {
    console.error("[reminder-history]", err?.message);
    res.status(500).json({ message: "Failed to load reminder history" });
  }
});

router.post("/reminders/run-now", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    void runDailyReminders();
    res.json({ success: true, message: "Reminder run started — check server logs for results" });
  } catch (err: any) {
    console.error("[reminders/run-now]", err?.message);
    res.status(500).json({ message: "Failed to start reminder run" });
  }
});

router.get("/reminders/status", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  res.json({ enabled: isRemindersEnabled() });
});

router.get("/reminders/stats", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const ELIGIBLE = ["pending","approved","partially_paid"];
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    const [totalRes, failedRes, lastRes, lastSuccessRes, eligRes, logsRes, upcomingRes, todayRes, overdueRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS count FROM reminder_logs WHERE status = 'sent'`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*) AS count FROM reminder_logs WHERE status = 'failed'`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT MAX(sent_at) AS last_sent FROM reminder_logs`).catch(() => ({ rows: [{ last_sent: null }] })),
      pool.query(`SELECT MAX(sent_at) AS last_sent FROM reminder_logs WHERE status = 'sent'`).catch(() => ({ rows: [{ last_sent: null }] })),
      pool.query(
        `SELECT COUNT(*) AS count FROM bookings
         WHERE status = ANY($1)
           AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0`,
        [ELIGIBLE]
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`
        SELECT rl.id, rl.booking_id, rl.channel, rl.status, rl.triggered_by, rl.notes,
               rl.sent_at, b.customer_name, b.booking_number, b.customer_mobile,
               CAST(COALESCE(b.final_amount,'0') AS numeric) - CAST(COALESCE(b.paid_amount,'0') AS numeric) AS balance
        FROM reminder_logs rl
        LEFT JOIN bookings b ON rl.booking_id = b.id
        ORDER BY rl.sent_at DESC LIMIT 50
      `).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, booking_number, customer_name, customer_mobile,
                preferred_departure_date AS due_date,
                CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) AS balance
         FROM bookings
         WHERE status = ANY($1)
           AND preferred_departure_date IS NOT NULL
           AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0
         ORDER BY preferred_departure_date ASC LIMIT 15`,
        [ELIGIBLE]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COUNT(*) AS count FROM reminder_logs WHERE sent_at >= $1`,
        [todayStart]
      ).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric)),0) AS total
         FROM bookings
         WHERE status = ANY($1)
           AND preferred_departure_date IS NOT NULL
           AND preferred_departure_date < NOW()
           AND CAST(COALESCE(final_amount,'0') AS numeric) - CAST(COALESCE(paid_amount,'0') AS numeric) > 0`,
        [ELIGIBLE]
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const totalSent   = parseInt(String(totalRes.rows[0].count), 10) || 0;
    const totalFailed = parseInt(String(failedRes.rows[0].count), 10) || 0;
    const totalAll    = totalSent + totalFailed;
    const successRate = totalAll > 0 ? Math.round((totalSent / totalAll) * 100) : 100;

    res.json({
      enabled: isRemindersEnabled(),
      total: totalSent,
      totalFailed,
      successRate,
      lastSent: lastSuccessRes.rows[0].last_sent,
      lastActivity: lastRes.rows[0].last_sent,
      eligibleCount: parseInt(String(eligRes.rows[0].count), 10) || 0,
      todayCount: parseInt(String(todayRes.rows[0].count), 10) || 0,
      overdueAmount: Number(overdueRes.rows[0].total) || 0,
      recentLogs: logsRes.rows,
      upcomingDueDates: upcomingRes.rows,
      schedule: [
        { label: "7 days before due date",  key: "7d"  },
        { label: "3 days before due date",  key: "3d"  },
        { label: "1 day before due date",   key: "1d"  },
        { label: "On due date",             key: "due" },
        { label: "Every 3 days after due",  key: "post"  },
      ],
    });
  } catch (err: any) {
    console.error("[reminders/stats]", err?.message);
    res.status(500).json({ message: "Failed to load reminder stats" });
  }
});

router.post("/reminders/enable", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  setRemindersEnabled(true);
  res.json({ success: true, enabled: true, message: "Daily payment reminders enabled" });
});

router.post("/reminders/disable", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  setRemindersEnabled(false);
  res.json({ success: true, enabled: false, message: "Daily payment reminders disabled" });
});

/**
 * POST /api/payments/resend-notification/:bookingId
 * Admin-only: fire (or re-fire) the full payment notification pipeline for a
 * booking. Useful when a customer did not receive WhatsApp/SMS/Email after
 * their payment. Since payment_received dedup window is now 0, this always
 * fires a fresh notification regardless of prior logs.
 */
router.post("/resend-notification/:bookingId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const result = await pool.query(
      `SELECT b.*, u.email AS customer_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ success: false, message: "Booking not found" });
      return;
    }

    const paidAmount   = Number(row.paid_amount || 0);
    const finalAmount  = Number(row.final_amount || 0);
    const isFullyPaid  = paidAmount >= finalAmount && finalAmount > 0;
    const remaining    = Math.max(0, finalAmount - paidAmount);

    if (paidAmount <= 0) {
      res.status(400).json({ success: false, message: "No payment recorded for this booking — nothing to resend" });
      return;
    }

    const booking = {
      id:                row.id,
      bookingNumber:     row.booking_number,
      customerName:      row.customer_name,
      customerMobile:    row.customer_mobile,
      customerEmail:     row.customer_email || row.customer_email_field || null,
      customerId:        row.customer_id,
      packageName:       row.package_name,
      numberOfPilgrims:  row.number_of_pilgrims,
      finalAmount:       row.final_amount,
    };

    console.log(`[resend-notification] Admin ${req.user?.email || req.user?.mobile} firing payment notification for booking ${booking.bookingNumber}`);

    await processPaymentSuccessNotifications({
      booking,
      isFullyPaid,
      thisPaymentAmount: paidAmount,
      newPaidAmount: paidAmount,
      remainingBalance: remaining,
      invoiceNumber: row.invoice_number || null,
      paymentRef: row.razorpay_payment_id || "manual-resend",
    });

    res.json({
      success: true,
      message: `Payment notification re-fired for booking ${booking.bookingNumber}`,
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        customerName: booking.customerName,
        customerMobile: booking.customerMobile,
        isFullyPaid,
        paidAmount,
        remainingBalance: remaining,
      },
    });
  } catch (err: any) {
    console.error("[resend-notification] failed:", err?.message);
    res.status(500).json({ success: false, message: err?.message || "Failed to resend notification" });
  }
});

// ── Customer: payment history for own booking ────────────────────────────────
// Returns all payment_transactions rows for the booking.
// Accessible by the booking owner OR admin.
router.get("/my-payments/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const bRes = await pool.query(
      `SELECT id, customer_mobile, status FROM bookings WHERE id=$1 LIMIT 1`,
      [bookingId]
    );
    const bk = bRes.rows[0];
    if (!bk) { res.status(404).json({ message: "Booking not found" }); return; }
    if (req.user?.role !== "admin" && bk.customer_mobile !== req.user?.mobile) {
      res.status(403).json({ message: "Access denied" }); return;
    }
    const txRes = await pool.query(
      `SELECT id, amount, payment_date, payment_mode, reference_number, notes, created_at
       FROM payment_transactions
       WHERE booking_id=$1 AND (is_deleted IS NULL OR is_deleted=false)
       ORDER BY payment_date ASC, created_at ASC`,
      [bookingId]
    );
    res.json({ payments: txRes.rows.map((r: any) => ({
      id:              r.id,
      amount:          Number(r.amount),
      paymentDate:     r.payment_date,
      paymentMode:     r.payment_mode,
      referenceNumber: r.reference_number,
      notes:           r.notes,
      createdAt:       r.created_at,
    })) });
  } catch (err: any) {
    console.error("[my-payments] error:", err?.message);
    res.status(500).json({ message: "Failed to load payment history" });
  }
});

// ── Customer: on-demand receipt PDF ─────────────────────────────────────────
// Generates a receipt PDF for the booking on demand.
// Accessible by the booking owner OR admin.
router.get("/receipt-pdf/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  try {
    const bRes = await pool.query(
      `SELECT b.*, i.invoice_number AS inv_num, i.invoice_status
       FROM bookings b LEFT JOIN invoices i ON i.booking_id=b.id
       WHERE b.id=$1 LIMIT 1`,
      [bookingId]
    );
    const row = bRes.rows[0];
    if (!row) { res.status(404).json({ message: "Booking not found" }); return; }
    if (req.user?.role !== "admin" && row.customer_mobile !== req.user?.mobile) {
      res.status(403).json({ message: "Access denied" }); return;
    }
    const paidAmount = Number(row.paid_amount || 0);
    if (paidAmount <= 0) {
      res.status(402).json({ message: "No payment recorded — receipt not available yet" });
      return;
    }
    const finalAmount   = Number(row.final_amount || 0);
    const remainingBal  = Math.max(0, finalAmount - paidAmount);
    const invoiceNumber = row.inv_num || row.invoice_number || null;

    const buf = await generateReceiptPdfBuffer({
      bookingNumber:   row.booking_number,
      customerName:    row.customer_name,
      customerMobile:  row.customer_mobile,
      customerEmail:   row.customer_email,
      packageName:     row.package_name,
      numberOfPilgrims: row.number_of_pilgrims,
      totalAmount:     finalAmount,
      finalAmount,
      paidAmount,
      balanceAmount:   remainingBal,
      invoiceNumber,
      paymentAmount:   paidAmount,
      paymentRef:      row.razorpay_payment_id || undefined,
    });
    res.set({
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="Receipt-${row.booking_number}.pdf"`,
      "Content-Length":      String(buf.length),
    });
    res.send(buf);
  } catch (err: any) {
    console.error("[receipt-pdf] error:", err?.message);
    res.status(500).json({ message: "Failed to generate receipt" });
  }
});

export default router;

