import { Router } from "express";
import { db, bookingsTable, packagesTable, usersTable } from "@workspace/db";
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

  const [booking] = await db.insert(bookingsTable).values({
    bookingNumber: generateBookingNumber(),
    packageId: data.packageId ?? null,
    packageName: packageData?.name ?? null,
    customerName: data.customerName,
    customerMobile: data.customerMobile,
    customerEmail: data.customerEmail ?? null,
    numberOfPilgrims: data.numberOfPilgrims,
    pilgrims: (data.pilgrims as any) ?? [],
    preferredDepartureDate: data.preferredDepartureDate ?? null,
    status: data.paymentStatus === "paid" ? "confirmed" : "approved",
    totalAmount: totalAmount ? String(totalAmount) : null,
    gstAmount: gstAmount ? String(gstAmount) : null,
    finalAmount: finalAmount ? String(finalAmount) : null,
    notes: data.notes ?? null,
    isOffline: true,
    invoiceNumber: data.paymentStatus === "paid" ? generateInvoiceNumber() : null,
  }).returning();

  res.status(201).json(formatBooking(booking));
});

router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const offset = (page - 1) * limit;

  let conditions: any[] = [];
  if (query.status) conditions.push(eq(bookingsTable.status, query.status as any));
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
    pilgrims: (data.pilgrims as any) ?? [],
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

  let pkg = null;
  if (b.packageId) {
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, b.packageId)).limit(1);
    pkg = pkgs[0] ?? null;
  }

  res.json(buildInvoiceResponse(b, pkg));
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

  let pkg = null;
  if (b.packageId) {
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, b.packageId)).limit(1);
    pkg = pkgs[0] ?? null;
  }

  res.json(buildInvoiceResponse(b, pkg));
});

function buildInvoiceResponse(b: any, pkg: any) {
  return {
    invoiceNumber: b.invoiceNumber,
    bookingNumber: b.bookingNumber,
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    customerEmail: b.customerEmail,
    packageName: b.packageName,
    numberOfPilgrims: b.numberOfPilgrims,
    pricePerPerson: b.totalAmount && b.numberOfPilgrims ? Number(b.totalAmount) / b.numberOfPilgrims : null,
    totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
    gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
    finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
    paymentDate: b.updatedAt?.toISOString?.(),
    departureDate: b.preferredDepartureDate,
    status: b.status,
    pilgrims: b.pilgrims ?? [],
    sacCode: "998555",
    gstPercent: pkg ? Number(pkg.gstPercent) : 5,
    companyName: "AL BURHAN TOURS & TRAVELS",
    companyAddress: "Office No. 3, 1st Floor, Haj House, 7-A Maulana Azad Road, Near Crawford Market, Mumbai - 400001, Maharashtra, India",
    companyPhone: "+91 9893225590 / +91 9893989786",
    companyEmail: "info@alburhantravels.com",
    gstin: "27AXXPXXXXXX1ZX",
    pan: "AXXPXXXXXX",
    bankName: "HDFC BANK LTD",
    bankBranch: "Mumbai Main Branch",
    bankAccount: "50200113931336",
    bankIfsc: "HDFC0001769",
  };
}

export default router;
