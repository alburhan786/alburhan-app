import { Router } from "express";
import { db, bookingsTable, packagesTable, usersTable, hajjGroupsTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  CreateBookingBody,
  ListBookingsQueryParams,
  RejectBookingBody,
  CreateOfflineBookingBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import {
  sendBookingApprovalNotification,
  sendBookingRejectionNotification,
  sendBookingSubmissionNotification,
  sendPaymentConfirmationNotification,
  sendWhatsApp,
  sendSMS,
} from "../lib/notifications.js";

const router = Router();

function generateBookingNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ABT${yy}${mm}${rand}`;
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV${yy}${mm}${rand}`;
}

function formatBooking(b: any) {
  return {
    ...b,
    totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
    gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
    finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
    createdAt: b.createdAt?.toISOString?.() ?? b.createdAt,
    updatedAt: b.updatedAt?.toISOString?.() ?? b.updatedAt,
  };
}

router.get("/offline", requireAdmin as any, (_req, res) => {
  res.json({ message: "Use POST /bookings/offline to create offline bookings" });
});

router.post("/offline", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const parsed = CreateOfflineBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid booking data", error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  let packageData = null;
  let totalAmount = null;
  let gstAmount = null;
  let finalAmount = null;

  if (data.packageId) {
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, data.packageId)).limit(1);
    if (pkgs[0]) {
      packageData = pkgs[0];
      const price = Number(packageData.pricePerPerson) * data.numberOfPilgrims;
      const gst = price * (Number(packageData.gstPercent) / 100);
      totalAmount = price;
      gstAmount = gst;
      finalAmount = price + gst;
    }
  }

  const bookingNumber = generateBookingNumber();
  const isPaid = data.paymentStatus === "paid";

  const [booking] = await db.insert(bookingsTable).values({
    bookingNumber,
    packageId: data.packageId ?? null,
    packageName: packageData?.name ?? null,
    customerName: data.customerName,
    customerMobile: data.customerMobile,
    customerEmail: data.customerEmail ?? null,
    numberOfPilgrims: data.numberOfPilgrims,
    pilgrims: (data.pilgrims ?? []) as Array<{ name: string; passportNumber?: string; passportExpiry?: string; dateOfBirth?: string }>,
    preferredDepartureDate: data.preferredDepartureDate ?? null,
    roomType: data.roomType ?? null,
    advanceAmount: data.advanceAmount ? String(data.advanceAmount) : null,
    status: isPaid ? "confirmed" : "approved",
    totalAmount: totalAmount ? String(totalAmount) : null,
    gstAmount: gstAmount ? String(gstAmount) : null,
    finalAmount: finalAmount ? String(finalAmount) : null,
    notes: data.notes ?? null,
    isOffline: true,
    invoiceNumber: isPaid ? generateInvoiceNumber() : null,
  }).returning();
  if (isPaid) {
    sendPaymentConfirmationNotification({
      mobile: booking.customerMobile,
      email: booking.customerEmail,
      customerName: booking.customerName,
      bookingNumber: booking.bookingNumber,
      amount: booking.finalAmount ? String(Number(booking.finalAmount).toLocaleString("en-IN")) : "N/A",
      invoiceNumber: booking.invoiceNumber ?? "",
    }).catch(console.error);
  } else {
    sendBookingApprovalNotification({
      mobile: booking.customerMobile,
      email: booking.customerEmail,
      customerName: booking.customerName,
      bookingNumber: booking.bookingNumber,
    }).catch(console.error);
  }

  res.status(201).json(formatBooking(booking));
});

router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (query.status) conditions.push(eq(bookingsTable.status, query.status));
  if (req.user?.role !== "admin") {
    conditions.push(eq(bookingsTable.customerMobile, req.user!.mobile));
  }

  const rows = await db
    .select({
      booking: bookingsTable,
      package: packagesTable,
    })
    .from(bookingsTable)
    .leftJoin(packagesTable, eq(bookingsTable.packageId, packagesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count: totalCount }] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({
    bookings: rows.map(({ booking, package: pkg }) => ({
      ...formatBooking(booking),
      packageDetails: pkg ? {
        duration: pkg.duration,
        includes: pkg.includes,
        highlights: pkg.highlights,
        departureDates: pkg.departureDates,
        imageUrl: pkg.imageUrl,
      } : null,
    })),
    total: Number(totalCount),
    page,
    limit,
  });
});

router.post("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid booking data", error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, data.packageId)).limit(1);
  const pkg = pkgs[0];

  let totalAmount: number | null = null;
  let gstAmount: number | null = null;
  let finalAmount: number | null = null;

  if (pkg) {
    const base = Number(pkg.pricePerPerson) * data.numberOfPilgrims;
    const gst = base * (Number(pkg.gstPercent) / 100);
    totalAmount = base;
    gstAmount = gst;
    finalAmount = base + gst;
  }

  const [booking] = await db.insert(bookingsTable).values({
    bookingNumber: generateBookingNumber(),
    packageId: data.packageId,
    packageName: pkg?.name ?? null,
    customerId: req.user?.id ?? null,
    customerName: data.customerName,
    customerMobile: data.customerMobile,
    customerEmail: data.customerEmail ?? null,
    numberOfPilgrims: data.numberOfPilgrims,
    pilgrims: (data.pilgrims ?? []) as Array<{ name: string; passportNumber?: string; passportExpiry?: string; dateOfBirth?: string }>,
    preferredDepartureDate: data.preferredDepartureDate,
    status: "pending",
    totalAmount: totalAmount ? String(totalAmount) : null,
    gstAmount: gstAmount ? String(gstAmount) : null,
    finalAmount: finalAmount ? String(finalAmount) : null,
    notes: data.notes ?? null,
    isOffline: false,
  }).returning();

  sendBookingSubmissionNotification({
    mobile: booking.customerMobile,
    email: booking.customerEmail,
    customerName: booking.customerName,
    bookingNumber: booking.bookingNumber,
    packageName: booking.packageName ?? pkg?.name ?? "Travel Package",
    numberOfPilgrims: booking.numberOfPilgrims,
  }).catch(console.error);

  res.status(201).json(formatBooking(booking));
});

router.get("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  if (req.user?.role !== "admin" && bookings[0].customerMobile !== req.user?.mobile) {
    res.status(403).json({ message: "Access denied" });
    return;
  }
  res.json(formatBooking(bookings[0]));
});

router.post("/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(bookingsTable.id, req.params.id))
    .returning();

  sendBookingApprovalNotification({
    mobile: updated.customerMobile,
    email: updated.customerEmail,
    customerName: updated.customerName,
    bookingNumber: updated.bookingNumber,
  }).catch(console.error);

  res.json(formatBooking(updated));
});

router.post("/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const parsed = RejectBookingBody.safeParse(req.body);
  const reason = parsed.success ? parsed.data.reason : undefined;

  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "rejected", rejectionReason: reason ?? null, updatedAt: new Date() })
    .where(eq(bookingsTable.id, req.params.id))
    .returning();

  sendBookingRejectionNotification({
    mobile: updated.customerMobile,
    email: updated.customerEmail,
    customerName: updated.customerName,
    bookingNumber: updated.bookingNumber,
    reason,
  }).catch(console.error);

  res.json(formatBooking(updated));
});

router.post("/:id/send-invoice", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const b = bookings[0];
  if (b.status !== "confirmed" || !b.invoiceNumber) {
    res.status(400).json({ message: "Invoice only available for confirmed bookings with invoice number" });
    return;
  }

  const baseUrl = `https://${req.get("host") || process.env.REPLIT_DEV_DOMAIN || "alburhantravels.com"}`;
  const invoiceUrl = `${baseUrl}/invoice/${b.bookingNumber}`;
  const message = `Assalamu Alaikum ${b.customerName},\n\nYour invoice #${b.invoiceNumber} for booking #${b.bookingNumber} is ready.\n\nView/Download Invoice:\n${invoiceUrl}\n\nTotal Amount: INR ${b.finalAmount ? Number(b.finalAmount).toLocaleString("en-IN") : "N/A"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590 | +91 9893989786`;

  const results = await Promise.allSettled([
    sendWhatsApp(b.customerMobile, message),
    sendSMS(b.customerMobile, message),
  ]);

  const whatsappOk = results[0].status === "fulfilled" && (results[0] as PromiseFulfilledResult<boolean>).value;
  const smsOk = results[1].status === "fulfilled" && (results[1] as PromiseFulfilledResult<boolean>).value;

  res.json({ message: "Invoice notification sent", whatsapp: whatsappOk, sms: smsOk });
});

async function resolveInvoiceData(b: typeof bookingsTable.$inferSelect) {
  let pkg = null;
  if (b.packageId) {
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, b.packageId)).limit(1);
    pkg = pkgs[0] ?? null;
  }
  let maktabNumber: string | null = null;
  if (b.groupId) {
    const groups = await db.select({ maktabNumber: hajjGroupsTable.maktabNumber }).from(hajjGroupsTable).where(eq(hajjGroupsTable.id, b.groupId)).limit(1);
    maktabNumber = groups[0]?.maktabNumber ?? null;
  }
  return { pkg, maktabNumber };
}

router.get("/by-number/:bookingNumber/invoice-public", async (req, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.bookingNumber, req.params.bookingNumber)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const b = bookings[0];
  if (b.status !== "confirmed") {
    res.status(400).json({ message: "Invoice only available for confirmed bookings" });
    return;
  }
  const { pkg, maktabNumber } = await resolveInvoiceData(b);
  res.json(buildInvoiceResponse(b, pkg, maktabNumber));
});

router.get("/:id/invoice", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  const b = bookings[0];
  if (b.status !== "confirmed") {
    res.status(400).json({ message: "Invoice only available for confirmed bookings" });
    return;
  }
  const { pkg, maktabNumber } = await resolveInvoiceData(b);
  res.json(buildInvoiceResponse(b, pkg, maktabNumber));
});

function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function deriveHajYear(b: { preferredDepartureDate?: string | null; packageName?: string | null }): string {
  if (b.preferredDepartureDate) {
    const yr = new Date(b.preferredDepartureDate).getFullYear();
    if (!isNaN(yr)) return String(yr);
  }
  const match = b.packageName?.match(/\b(20\d{2})\b/);
  if (match) return match[1];
  return String(new Date().getFullYear());
}

function derivePaymentStatus(b: typeof bookingsTable.$inferSelect): "Paid" | "Partial" | "Pending" {
  const final = b.finalAmount ? Number(b.finalAmount) : 0;
  const advance = b.advanceAmount ? Number(b.advanceAmount) : 0;
  if (b.status === "confirmed" && b.razorpayPaymentId) return "Paid";
  if (advance > 0 && advance >= final) return "Paid";
  if (advance > 0) return "Partial";
  return "Pending";
}

function buildInvoiceResponse(b: typeof bookingsTable.$inferSelect, pkg: { gstPercent: string | number } | null, maktabNumber: string | null = null) {
  const paymentDate = b.updatedAt?.toISOString?.();
  const dueDate = paymentDate
    ? new Date(new Date(paymentDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    invoiceNumber: b.invoiceNumber,
    bookingNumber: b.bookingNumber,
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    customerEmail: b.customerEmail,
    customerAddress: "",
    customerGstin: "",
    customerPan: "",
    customerState: "Madhya Pradesh",
    packageName: b.packageName,
    numberOfPilgrims: b.numberOfPilgrims,
    pricePerPerson: b.totalAmount && b.numberOfPilgrims ? Number(b.totalAmount) / b.numberOfPilgrims : null,
    totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
    gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
    finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
    advanceAmount: b.advanceAmount ? Number(b.advanceAmount) : null,
    previousBalance: 0,
    paymentDate,
    dueDate,
    departureDate: b.preferredDepartureDate,
    hajYear: deriveHajYear(b),
    chequeInfo: b.razorpayPaymentId
      ? `Razorpay ${b.razorpayPaymentId}`
      : (b.advanceAmount && Number(b.advanceAmount) > 0 ? `Advance ${fmtDateShort(b.updatedAt)}` : ""),
    roomType: b.roomType,
    status: b.status,
    travelDate: b.preferredDepartureDate || null,
    maktabNumber: maktabNumber || null,
    paymentMethod: b.razorpayPaymentId ? "Razorpay" : (b.isOffline ? "Cash" : "Bank Transfer"),
    paymentStatus: derivePaymentStatus(b),
    pilgrims: b.pilgrims ?? [],
    sacCode: "998555",
    gstPercent: pkg ? Number(pkg.gstPercent) : 5,
    companyName: "ALBURHAN TOURS & TRAVELS",
    companyAddress: "Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P.",
    companyPhone: "9893989786",
    companyEmail: "alburhantravels@gmail.com",
    gstin: "23AAVFA3223C1ZW",
    pan: "AAVFA3223C",
    bankName: "HDFC BANK LTD",
    bankBranch: "BURHANPUR",
    bankAccount: "50200011391336",
    bankIfsc: "HDFC0001769",
  };
}

export default router;
