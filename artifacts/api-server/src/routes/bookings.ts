import { Router, type Request } from "express";
import { db, pool, bookingsTable, packagesTable, usersTable, hajjGroupsTable, customerProfilesTable, paymentTransactionsTable } from "@workspace/db";
import { eq, and, desc, count, sql, isNull, or, ilike } from "drizzle-orm";
import multer from "multer";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { upsertPilgrimFromProfile } from "../lib/pilgrimUtils.js";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG and PNG files are allowed"));
  },
}).single("photo");
import {
  CreateBookingBody,
  ListBookingsQueryParams,
  RejectBookingBody,
  CreateOfflineBookingBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, requirePermission, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import { validateDeleteToken } from "./delete-auth.js";
import {
  sendBookingApprovalNotification,
  sendBookingRejectionNotification,
  sendBookingSubmissionNotification,
  sendPaymentConfirmationNotification,
  sendAdminNewBookingEmail,
  sendWhatsApp,
  sendDLTSMS,
} from "../lib/notifications.js";
import {
  notifyNewBooking,
  notifyBookingApproved,
  notifyBookingRejected,
  notifyBookingCancelled,
} from "../lib/adminNotifications.js";

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
  const isCamel = b.bookingNumber !== undefined;
  const get = (camel: string, snake: string) => isCamel ? b[camel] : b[snake];
  return {
    id: get("id", "id"),
    bookingNumber: get("bookingNumber", "booking_number"),
    packageId: get("packageId", "package_id"),
    packageName: get("packageName", "package_name"),
    customerId: get("customerId", "customer_id"),
    customerName: get("customerName", "customer_name"),
    customerMobile: get("customerMobile", "customer_mobile"),
    customerEmail: get("customerEmail", "customer_email"),
    numberOfPilgrims: get("numberOfPilgrims", "number_of_pilgrims"),
    pilgrims: get("pilgrims", "pilgrims"),
    preferredDepartureDate: get("preferredDepartureDate", "preferred_departure_date"),
    status: get("status", "status"),
    roomType: get("roomType", "room_type"),
    groupId: get("groupId", "group_id"),
    invoiceNumber: get("invoiceNumber", "invoice_number"),
    rejectionReason: get("rejectionReason", "rejection_reason"),
    notes: get("notes", "notes"),
    isOffline: get("isOffline", "is_offline"),
    isDeleted: get("isDeleted", "is_deleted"),
    deletedAt: get("deletedAt", "deleted_at"),
    deletedBy: get("deletedBy", "deleted_by"),
    travellerDetailsStatus: get("travellerDetailsStatus", "traveller_details_status"),
    paymentId: get("paymentId", "payment_id"),
    razorpayOrderId: get("razorpayOrderId", "razorpay_order_id"),
    razorpayPaymentId: get("razorpayPaymentId", "razorpay_payment_id"),
    totalAmount: (() => { const v = get("totalAmount","total_amount"); return v ? Number(v) : null; })(),
    gstAmount: (() => { const v = get("gstAmount","gst_amount"); return v ? Number(v) : null; })(),
    finalAmount: (() => { const v = get("finalAmount","final_amount"); return v ? Number(v) : null; })(),
    discountType: get("discountType", "discount_type"),
    discountAmount: (() => { const v = get("discountAmount","discount_amount"); return v != null && v !== "" ? Number(v) : null; })(),
    discountPercentage: (() => { const v = get("discountPercentage","discount_percentage"); return v != null && v !== "" ? Number(v) : null; })(),
    discountReason: get("discountReason", "discount_reason"),
    advanceAmount: (() => { const v = get("advanceAmount","advance_amount"); return v ? Number(v) : null; })(),
    paidAmount: (() => { const v = get("paidAmount","paid_amount"); return v ? Number(v) : null; })(),
    onlinePaidAmount: (() => { const v = get("onlinePaidAmount","online_paid_amount"); return v ? Number(v) : null; })(),
    createdAt: (() => { const v = get("createdAt","created_at"); return v?.toISOString?.() ?? v; })(),
    updatedAt: (() => { const v = get("updatedAt","updated_at"); return v?.toISOString?.() ?? v; })(),
  };
}

router.get("/offline", requireAdmin as any, requirePermission("bookings", "view") as any, (_req, res) => {
  res.json({ message: "Use POST /bookings/offline to create offline bookings" });
});

router.post("/offline", requireAdmin as any, requirePermission("bookings", "create") as any, async (req: AuthenticatedRequest, res) => {
  const parsed = CreateOfflineBookingBody.safeParse(req.body);
  if (!parsed.success) {
    console.error("[bookings] POST /offline Zod error:", parsed.error.message);
    res.status(400).json({ message: "Invalid booking data", error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  try {
    let packageData = null;
    let totalAmount: number | null = null;
    let gstAmount: number | null = null;
    let finalAmount: number | null = null;

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
    } else if (data.totalAmount) {
      totalAmount = data.totalAmount;
      gstAmount = 0;
      finalAmount = data.totalAmount;
    }

    // Resolve discount
    const baseForDiscount = (totalAmount ?? 0) + (gstAmount ?? 0);
    let resolvedDiscountAmount: number = 0;
    let resolvedDiscountPercentage: number = 0;
    if (data.discountPercentage && data.discountPercentage > 0 && baseForDiscount > 0) {
      resolvedDiscountPercentage = data.discountPercentage;
      resolvedDiscountAmount = Math.round((baseForDiscount * data.discountPercentage / 100) * 100) / 100;
    } else if (data.discountAmount && data.discountAmount > 0) {
      resolvedDiscountAmount = data.discountAmount;
      resolvedDiscountPercentage = baseForDiscount > 0 ? Math.round((data.discountAmount / baseForDiscount) * 10000) / 100 : 0;
    }
    if (finalAmount != null && resolvedDiscountAmount > 0) {
      finalAmount = Math.max(0, finalAmount - resolvedDiscountAmount);
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
      totalAmount: totalAmount != null ? String(totalAmount) : null,
      gstAmount: gstAmount != null ? String(gstAmount) : null,
      finalAmount: finalAmount != null ? String(finalAmount) : null,
      discountType: data.discountType ?? null,
      discountAmount: resolvedDiscountAmount > 0 ? String(resolvedDiscountAmount) : null,
      discountPercentage: resolvedDiscountPercentage > 0 ? String(resolvedDiscountPercentage) : null,
      discountReason: data.discountReason ?? null,
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

    notifyNewBooking({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
      customerMobile: booking.customerMobile,
      customerEmail: booking.customerEmail,
      packageName: booking.packageName ?? null,
      finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
      numberOfPilgrims: booking.numberOfPilgrims,
      isOffline: true,
    });

    sendAdminNewBookingEmail({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
      customerMobile: booking.customerMobile,
      customerEmail: booking.customerEmail,
      packageName: booking.packageName ?? null,
      finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
      numberOfPilgrims: booking.numberOfPilgrims,
      isOffline: true,
    }).catch(console.error);

    res.status(201).json(formatBooking(booking));
  } catch (err: any) {
    console.error("[bookings] POST /offline DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to create offline booking" });
  }
});

router.get("/trash", requireAdmin as any, requirePermission("bookings", "view") as any, async (_req, res) => {
  try {
    const rows = await db
      .select({ booking: bookingsTable, package: packagesTable })
      .from(bookingsTable)
      .leftJoin(packagesTable, eq(bookingsTable.packageId, packagesTable.id))
      .where(sql`${bookingsTable.deletedAt} IS NOT NULL`)
      .orderBy(desc(bookingsTable.deletedAt));
    res.json({
      bookings: rows.map(({ booking, package: pkg }) => ({
        ...formatBooking(booking),
        deletedAt: booking.deletedAt?.toISOString?.() ?? null,
        deletedBy: booking.deletedBy,
        packageDetails: pkg ? { duration: pkg.duration, includes: pkg.includes } : null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load trash" });
  }
});

// POST /bulk-trash — soft-delete multiple bookings at once
router.post("/bulk-trash", requireAdmin as any, requirePermission("bookings", "delete") as any, async (req: AuthenticatedRequest, res) => {
  const { ids } = req.body as { ids?: string[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "No booking IDs provided" }); return;
  }
  const deletedBy = req.user?.name || req.user?.mobile || "admin";
  const results: { id: string; bookingNumber: string; success: boolean; error?: string }[] = [];
  let successCount = 0;

  for (const id of ids) {
    try {
      const existingRows = await pool.query(
        `SELECT id, booking_number, deleted_at FROM bookings WHERE id=$1 LIMIT 1`, [id]
      );
      const existing = existingRows.rows[0];
      if (!existing) { results.push({ id, bookingNumber: "?", success: false, error: "Booking not found" }); continue; }
      if (existing.deleted_at) { results.push({ id, bookingNumber: existing.booking_number, success: false, error: "Already in trash" }); continue; }

      await pool.query(
        `UPDATE bookings SET deleted_at=NOW(), deleted_by=$1, updated_at=NOW() WHERE id=$2`,
        [deletedBy, id]
      );
      await pool.query(
        `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deleted_by=$1, deletion_reason='Booking bulk-deleted'
         WHERE booking_id=$2 AND (is_deleted=false OR is_deleted IS NULL)`,
        [req.user?.id ?? deletedBy, id]
      );

      try {
        await writeAuditLog(id, deletedBy, "soft_delete", [
          { fieldName: "deleted_at", oldValue: "", newValue: new Date().toISOString() },
        ]);
      } catch { /* audit non-fatal */ }

      results.push({ id, bookingNumber: existing.booking_number, success: true });
      successCount++;
    } catch (err: any) {
      results.push({ id, bookingNumber: "?", success: false, error: err.message });
    }
  }

  const failCount = ids.length - successCount;
  const failed = results.filter(r => !r.success);
  const message = failCount === 0
    ? `${successCount} booking${successCount !== 1 ? "s" : ""} moved to trash successfully.`
    : `${successCount} succeeded, ${failCount} failed: ${failed.map(f => `${f.bookingNumber} (${f.error})`).join(", ")}`;

  res.json({ message, successCount, failCount, results });
});

router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 200);
  const offset = (page - 1) * limit;

  const conditions: any[] = [isNull(bookingsTable.deletedAt)];
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
    .where(and(...conditions))
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count: totalCount }] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(...conditions));

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

  notifyNewBooking({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    customerEmail: booking.customerEmail,
    packageName: booking.packageName ?? pkg?.name ?? null,
    finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
    numberOfPilgrims: booking.numberOfPilgrims,
    isOffline: false,
  });

  sendAdminNewBookingEmail({
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    customerEmail: booking.customerEmail,
    packageName: booking.packageName ?? pkg?.name ?? "Travel Package",
    finalAmount: booking.finalAmount ? Number(booking.finalAmount) : null,
    numberOfPilgrims: booking.numberOfPilgrims,
    isOffline: false,
  }).catch(console.error);

  auditLog({ req, action: "created", entityTable: "bookings", entityId: booking.id, newValue: { bookingNumber: booking.bookingNumber, customerName: booking.customerName, status: booking.status } }).catch(() => {});

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

router.post("/:id/approve", requireAdmin as any, requirePermission("bookings", "approve") as any, async (req: AuthenticatedRequest, res) => {
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

  notifyBookingApproved({
    bookingId: updated.id,
    bookingNumber: updated.bookingNumber,
    customerName: updated.customerName,
    customerMobile: updated.customerMobile,
  });

  auditLog({ req, action: "approved", entityTable: "bookings", entityId: updated.id, newValue: { bookingNumber: updated.bookingNumber, status: "approved" } }).catch(() => {});
  res.json(formatBooking(updated));
});

router.post("/:id/reject", requireAdmin as any, requirePermission("bookings", "edit") as any, async (req: AuthenticatedRequest, res) => {
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

  notifyBookingRejected({
    bookingId: updated.id,
    bookingNumber: updated.bookingNumber,
    customerName: updated.customerName,
    customerMobile: updated.customerMobile,
    reason,
  });

  auditLog({ req, action: "rejected", entityTable: "bookings", entityId: updated.id, newValue: { bookingNumber: updated.bookingNumber, status: "rejected", reason } }).catch(() => {});
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
  const message = `Assalamu Alaikum ${b.customerName},\n\nYour invoice #${b.invoiceNumber} for booking #${b.bookingNumber} is ready.\n\nView/Download Invoice:\n${invoiceUrl}\n\nTotal Amount: INR ${b.finalAmount ? Number(b.finalAmount).toLocaleString("en-IN") : "N/A"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701 | +91 9893989786`;

  const results = await Promise.allSettled([
    sendWhatsApp(b.customerMobile, message),
    sendDLTSMS(b.customerMobile, b.customerName, b.bookingNumber, b.invoiceNumber || ""),
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

router.get("/by-invoice-number/:invoiceNumber/invoice-public", async (req, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.invoiceNumber, req.params.invoiceNumber)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Invoice not found" });
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

function buildInvoiceResponse(b: typeof bookingsTable.$inferSelect, pkg: { gstPercent: string | number; type?: string | null } | null, maktabNumber: string | null = null) {
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
    packageType: pkg?.type ?? null,
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

router.get(
  "/:id/traveller-details",
  requireAuth as any,
  async (req: AuthenticatedRequest, res) => {
    const bookingId = req.params.id as string;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === "admin";

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
    if (!isAdmin && booking.customerId !== userId) { res.status(403).json({ message: "Forbidden" }); return; }

    const profileUserId = isAdmin ? booking.customerId : userId;
    let profile = null;
    if (profileUserId) {
      const profiles = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, profileUserId)).limit(1);
      profile = profiles[0] || null;
    }

    res.json({ travellerDetailsStatus: booking.travellerDetailsStatus, profile });
  }
);

router.post(
  "/:id/traveller-details",
  requireAuth as any,
  (req, res, next) => photoUpload(req, res, next),
  async (req: AuthenticatedRequest, res) => {
    const bookingId = req.params.id as string;
    const userId = req.user!.id;

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }
    if (booking.customerId !== userId) { res.status(403).json({ message: "Forbidden" }); return; }
    if (!["approved", "confirmed", "partially_paid"].includes(booking.status)) {
      res.status(400).json({ message: "Booking is not in an editable state" }); return;
    }

    const body = req.body as Record<string, string>;
    const profileData: Record<string, string | null | Date> = {
      name: body.name || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address || null,
      passportNumber: body.passportNumber || null,
      passportIssueDate: body.passportIssueDate || null,
      passportExpiryDate: body.passportExpiryDate || null,
      passportPlaceOfIssue: body.passportPlaceOfIssue || null,
      updatedAt: new Date(),
    };

    const photoFile = (req as MulterRequest).file;
    if (photoFile) {
      profileData.photoUrl = await uploadToGCS(photoFile.buffer, photoFile.originalname, photoFile.mimetype, "private_uploads");
    }

    const existing = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId)).limit(1);
    let savedProfile;
    if (existing[0]) {
      const [updated] = await db.update(customerProfilesTable).set(profileData).where(eq(customerProfilesTable.userId, userId)).returning();
      savedProfile = updated;
    } else {
      const [created] = await db.insert(customerProfilesTable).values({ ...profileData, userId, kycStatus: "pending" }).returning();
      savedProfile = created;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ travellerDetailsStatus: "submitted", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    if (booking.groupId) {
      upsertPilgrimFromProfile(booking.groupId, savedProfile, booking.customerName, booking.customerMobile).catch(
        (err) => console.error(`[pilgrimSync] Failed for booking ${bookingId}:`, err)
      );
    }

    res.json({ message: "Travel details saved", booking: formatBooking(updated), travellerDetailsStatus: updated.travellerDetailsStatus, profile: savedProfile });
  }
);

router.patch(
  "/:id/assign-group",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const bookingId = req.params.id as string;
    const { groupId } = req.body as { groupId: string };
    if (!groupId) { res.status(400).json({ message: "groupId is required" }); return; }

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return; }

    const [group] = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!group) { res.status(404).json({ message: "Group not found" }); return; }

    const [updatedBooking] = await db
      .update(bookingsTable)
      .set({ groupId, updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    let pilgrim: Awaited<ReturnType<typeof upsertPilgrimFromProfile>> | null = null;
    if (booking.travellerDetailsStatus === "submitted" && booking.customerId) {
      const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, booking.customerId)).limit(1);
      if (profile) {
        pilgrim = await upsertPilgrimFromProfile(groupId, profile, booking.customerName, booking.customerMobile);
      }
    }

    res.json({ booking: formatBooking(updatedBooking), group, pilgrim, autoFilled: !!pilgrim });
  }
);

router.get("/by-number/:bookingNumber/payment-page", async (req, res) => {
  try {
    const { bookingNumber } = req.params;
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

    const [pkgRows, txRows] = await Promise.all([
      booking.packageId
        ? db.select({ name: packagesTable.name }).from(packagesTable).where(eq(packagesTable.id, booking.packageId)).limit(1)
        : Promise.resolve([]),
      db
        .select({
          id: paymentTransactionsTable.id,
          amount: paymentTransactionsTable.amount,
          paymentDate: paymentTransactionsTable.paymentDate,
          paymentMode: paymentTransactionsTable.paymentMode,
          referenceNumber: paymentTransactionsTable.referenceNumber,
          notes: paymentTransactionsTable.notes,
        })
        .from(paymentTransactionsTable)
        .where(eq(paymentTransactionsTable.bookingId, booking.id))
        .orderBy(desc(paymentTransactionsTable.paymentDate)),
    ]);

    const finalAmount = booking.finalAmount ? Number(booking.finalAmount) : null;
    const paidAmount = Number(booking.paidAmount || 0);
    const remainingAmount = finalAmount != null ? Math.max(0, finalAmount - paidAmount) : null;

    const manualHistory = txRows.map(t => ({
      id: t.id,
      amount: Number(t.amount),
      paymentDate: t.paymentDate,
      paymentMode: t.paymentMode,
      referenceNumber: t.referenceNumber,
      notes: t.notes,
    }));

    const onlinePaidAmount = Number(booking.onlinePaidAmount || 0);
    if (onlinePaidAmount > 0 && booking.razorpayPaymentId) {
      manualHistory.unshift({
        id: `rzp-${booking.razorpayPaymentId}`,
        amount: onlinePaidAmount,
        paymentDate: booking.updatedAt ? booking.updatedAt.toISOString().split("T")[0] : "",
        paymentMode: "online",
        referenceNumber: booking.razorpayPaymentId,
        notes: "Online payment via Razorpay",
      });
    }

    res.json({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      customerName: booking.customerName,
      packageName: pkgRows[0]?.name ?? null,
      status: booking.status,
      totalAmount: finalAmount,
      finalAmount,
      paidAmount,
      remainingAmount,
      invoiceNumber: booking.invoiceNumber,
      createdAt: booking.createdAt?.toISOString(),
      paymentHistory: manualHistory,
    });
  } catch (err: any) {
    console.error("[payment-page]", err?.message);
    res.status(500).json({ message: "Failed to load payment page data" });
  }
});

async function writeAuditLog(bookingId: string, changedBy: string, action: string, logs: Array<{ fieldName: string; oldValue: string; newValue: string }>) {
  for (const log of logs) {
    try {
      await db.execute(sql`
        INSERT INTO booking_audit_logs (id, booking_id, changed_by, action, field_name, old_value, new_value)
        VALUES (${crypto.randomUUID()}, ${bookingId}, ${changedBy}, ${action}, ${log.fieldName}, ${log.oldValue}, ${log.newValue})
      `);
    } catch (err) {
      console.error("[audit] Failed to write audit log:", err);
    }
  }
}

router.patch("/:id", requireAdmin as any, requirePermission("bookings", "edit") as any, async (req: AuthenticatedRequest, res) => {
  const bookingId = req.params.id;
  try {
    const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }
    if (existing.deletedAt) { res.status(400).json({ message: "Cannot edit a deleted booking. Restore it first." }); return; }

    const editableFields = [
      "customerName", "customerMobile", "customerEmail", "packageName",
      "numberOfPilgrims", "preferredDepartureDate", "roomType", "status",
      "totalAmount", "gstAmount", "finalAmount", "advanceAmount", "paidAmount",
      "notes", "groupId", "invoiceNumber", "rejectionReason",
      "discountType", "discountAmount", "discountPercentage", "discountReason",
    ];

    const updates: Record<string, any> = {};
    const auditLogs: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        const oldVal = (existing as any)[field];
        const newVal = req.body[field] === "" ? null : req.body[field];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
          updates[field] = newVal;
          auditLogs.push({ fieldName: field, oldValue: String(oldVal ?? ""), newValue: String(newVal ?? "") });
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      res.json(formatBooking(existing));
      return;
    }

    updates.updatedAt = new Date();
    const [updated] = await db.update(bookingsTable).set(updates).where(eq(bookingsTable.id, bookingId)).returning();
    const changedBy = req.user?.name || req.user?.mobile || "admin";
    await writeAuditLog(bookingId, changedBy, "edit", auditLogs);
    auditLog({ req, action: "updated", entityTable: "bookings", entityId: bookingId, newValue: updates }).catch(() => {});
    res.json(formatBooking(updated));
  } catch (err: any) {
    console.error("[bookings] PATCH /:id error:", err);
    res.status(500).json({ message: err?.message || "Failed to update booking" });
  }
});

router.delete("/:id/permanent", requireAdmin as any, requirePermission("bookings", "delete") as any, async (req: AuthenticatedRequest, res) => {
  const bookingId = req.params.id;
  const token = req.headers["x-delete-token"] as string;
  if (!token) { res.status(403).json({ message: "Delete token required" }); return; }
  const adminName = validateDeleteToken(token);
  if (!adminName) { res.status(403).json({ message: "Invalid or expired delete token" }); return; }

  try {
    const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }

    await db.execute(sql`DELETE FROM booking_audit_logs WHERE booking_id = ${bookingId}`);
    await db.delete(bookingsTable).where(eq(bookingsTable.id, bookingId));
    res.json({ message: "Booking permanently deleted", deletedBy: adminName });
  } catch (err: any) {
    console.error("[bookings] DELETE /:id/permanent error:", err);
    res.status(500).json({ message: err?.message || "Failed to permanently delete booking" });
  }
});

async function softDeleteBooking(bookingId: string, req: AuthenticatedRequest, res: any) {
  console.log(`[soft-delete] START bookingId=${bookingId}`);
  try {
    console.log(`[soft-delete] Checking if booking exists...`);
    const { rows: existingRows } = await pool.query(
      `SELECT id, booking_number, status, deleted_at FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    console.log(`[soft-delete] Query returned ${existingRows.length} row(s)`);

    const existing = existingRows[0];
    if (!existing) {
      console.log(`[soft-delete] Booking ${bookingId} NOT FOUND in database`);
      res.status(404).json({ message: `Booking not found: ${bookingId}` });
      return;
    }
    console.log(`[soft-delete] Found booking ${existing.booking_number}, deleted_at=${existing.deleted_at}`);

    if (existing.deleted_at) {
      res.status(400).json({ message: "Booking is already in trash" });
      return;
    }

    const deletedBy = req.user?.name || req.user?.mobile || "admin";
    console.log(`[soft-delete] Running UPDATE for bookingId=${bookingId} deletedBy=${deletedBy}`);

    const { rows: updatedRows } = await pool.query(
      `UPDATE bookings SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [deletedBy, bookingId]
    );
    console.log(`[soft-delete] UPDATE returned ${updatedRows.length} row(s)`);

    if (!updatedRows[0]) {
      console.error(`[soft-delete] UPDATE returned 0 rows for bookingId=${bookingId}`);
      res.status(500).json({ message: "Update succeeded but returned no data — check database constraints" });
      return;
    }

    const updated = updatedRows[0];
    console.log(`[soft-delete] SUCCESS booking=${updated.booking_number} deleted_at=${updated.deleted_at}`);

    try {
      await writeAuditLog(bookingId, deletedBy, "soft_delete", [
        { fieldName: "status", oldValue: existing.status, newValue: "deleted" },
      ]);
    } catch (auditErr: any) {
      console.warn(`[soft-delete] Audit log failed (non-fatal):`, auditErr?.message);
    }
    auditLog({ req, action: "deleted", entityTable: "bookings", entityId: bookingId, oldValue: { bookingNumber: existing.booking_number, status: existing.status }, newValue: { deletedBy } }).catch(() => {});

    res.json({ message: "Booking moved to trash", booking: formatBooking(updated) });
  } catch (err: any) {
    const pgCode = err?.code || "unknown";
    const pgDetail = err?.detail || "";
    const pgMessage = err?.message || "Unknown error";
    console.error(`[soft-delete] ERROR bookingId=${bookingId} pgCode=${pgCode} pgDetail=${pgDetail}`, err);
    res.status(500).json({
      message: `Database error (${pgCode}): ${pgMessage}${pgDetail ? " — " + pgDetail : ""}`,
    });
  }
}

router.post("/:id/trash", requireAdmin as any, requirePermission("bookings", "delete") as any, (req: AuthenticatedRequest, res) => {
  softDeleteBooking(req.params.id, req, res);
});

router.delete("/:id", requireAdmin as any, requirePermission("bookings", "delete") as any, (req: AuthenticatedRequest, res) => {
  softDeleteBooking(req.params.id, req, res);
});

router.post("/:id/restore", requireAdmin as any, requirePermission("bookings", "edit") as any, async (req: AuthenticatedRequest, res) => {
  const bookingId = req.params.id;
  try {
    const { rows: existingRows } = await pool.query(`SELECT * FROM bookings WHERE id = $1 LIMIT 1`, [bookingId]);
    const existing = existingRows[0];
    if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }
    if (!existing.deleted_at) { res.status(400).json({ message: "Booking is not in trash" }); return; }

    const restoredBy = req.user?.name || req.user?.mobile || "admin";
    const { rows: updatedRows } = await pool.query(
      `UPDATE bookings SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [bookingId]
    );
    const [updated] = updatedRows;

    await writeAuditLog(bookingId, restoredBy, "restore", [
      { fieldName: "status", oldValue: "deleted", newValue: existing.status },
    ]);
    auditLog({ req, action: "restored", entityTable: "bookings", entityId: bookingId, newValue: { bookingNumber: existing.booking_number, restoredBy } }).catch(() => {});
    res.json({ message: "Booking restored", booking: formatBooking(updated) });
  } catch (err: any) {
    console.error("[bookings] POST /:id/restore error:", err);
    res.status(500).json({ message: err?.message || "Failed to restore booking" });
  }
});

router.post("/:id/duplicate", requireAdmin as any, requirePermission("bookings", "create") as any, async (req: AuthenticatedRequest, res) => {
  const bookingId = req.params.id;
  try {
    const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!existing) { res.status(404).json({ message: "Booking not found" }); return; }

    const newBookingNumber = generateBookingNumber();
    const [duplicate] = await db.insert(bookingsTable).values({
      bookingNumber: newBookingNumber,
      packageId: existing.packageId,
      packageName: existing.packageName,
      customerId: existing.customerId,
      customerName: existing.customerName,
      customerMobile: existing.customerMobile,
      customerEmail: existing.customerEmail,
      numberOfPilgrims: existing.numberOfPilgrims,
      pilgrims: existing.pilgrims ?? [],
      preferredDepartureDate: existing.preferredDepartureDate,
      roomType: existing.roomType,
      status: "pending",
      totalAmount: existing.totalAmount,
      gstAmount: existing.gstAmount,
      finalAmount: existing.finalAmount,
      notes: existing.notes ? `[Duplicate of ${existing.bookingNumber}] ${existing.notes}` : `[Duplicate of ${existing.bookingNumber}]`,
      isOffline: true,
    }).returning();

    const duplicatedBy = req.user?.name || req.user?.mobile || "admin";
    await writeAuditLog(duplicate.id, duplicatedBy, "create", [
      { fieldName: "source", oldValue: "", newValue: `Duplicated from ${existing.bookingNumber}` },
    ]);
    res.status(201).json({ message: "Booking duplicated", ...formatBooking(duplicate) });
  } catch (err: any) {
    console.error("[bookings] POST /:id/duplicate error:", err);
    res.status(500).json({ message: err?.message || "Failed to duplicate booking" });
  }
});

router.get("/:id/audit-log", requireAdmin as any, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const rows = await db.execute(sql`
      SELECT id, booking_id, changed_by, changed_at, action, field_name, old_value, new_value
      FROM booking_audit_logs
      WHERE booking_id = ${bookingId}
      ORDER BY changed_at DESC
      LIMIT 200
    `);
    const logs = (rows as any).rows ?? rows;
    res.json(Array.isArray(logs) ? logs : []);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load audit log" });
  }
});

export default router;
