// @ts-nocheck
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
import { autoGenerateAgreement } from "./agreements.js";
import { validateDeleteToken } from "./delete-auth.js";
import {
  sendBookingApprovalNotification,
  sendBookingConfirmationNotification,
  sendBookingRejectionNotification,
  sendBookingSubmissionNotification,
  sendPaymentConfirmationNotification,
  sendAdminNewBookingEmail,
  sendJourneyStatusNotification,
  sendWhatsApp,
  sendDLTSMS,
} from "../lib/notifications.js";
import {
  notifyNewBooking,
  notifyBookingApproved,
  notifyBookingRejected,
  notifyBookingCancelled,
} from "../lib/adminNotifications.js";
import { trackNotification, fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { sendInvoiceEmail } from "../services/emailService.js";
import { broadcastCustomerJourneyUpdate } from "./customer-journey.js";

const router = Router();

function round2(n: number) { return Math.round(n * 100) / 100; }

function calcAmounts(opts: {
  packagePrice: number;
  discountAmount?: number;
  discountPercentage?: number;
  gstEnabled?: boolean;
  gstIncluded: boolean;
  gstRate: number;
  tcsEnabled: boolean;
  tcsIncluded: boolean;
  tcsRate: number;
}) {
  const { packagePrice, gstIncluded, gstRate, tcsEnabled, tcsIncluded, tcsRate } = opts;
  const gstEnabled = opts.gstEnabled !== false;

  let discAmt = 0, discPct = 0;
  if (opts.discountPercentage && opts.discountPercentage > 0) {
    discPct = opts.discountPercentage;
    discAmt = round2(packagePrice * discPct / 100);
  } else if (opts.discountAmount && opts.discountAmount > 0) {
    discAmt = opts.discountAmount;
    discPct = packagePrice > 0 ? round2(discAmt / packagePrice * 100) : 0;
  }

  const netAmount = round2(Math.max(0, packagePrice - discAmt));

  let gstAmount = 0;
  if (gstEnabled && gstRate > 0 && netAmount > 0) {
    if (gstIncluded) {
      const taxable = round2(netAmount / (1 + gstRate / 100));
      gstAmount = round2(netAmount - taxable);
    } else {
      gstAmount = round2(netAmount * gstRate / 100);
    }
  }

  const afterGstBase = gstEnabled && !gstIncluded ? round2(netAmount + gstAmount) : netAmount;

  let tcsAmount = 0;
  if (tcsEnabled && tcsRate > 0 && afterGstBase > 0) {
    if (tcsIncluded) {
      tcsAmount = round2(afterGstBase - afterGstBase / (1 + tcsRate / 100));
    } else {
      tcsAmount = round2(afterGstBase * tcsRate / 100);
    }
  }

  const finalAmount = tcsEnabled && !tcsIncluded ? round2(afterGstBase + tcsAmount) : afterGstBase;

  return { discountAmount: discAmt, discountPercentage: discPct, netAmount, gstAmount, tcsAmount, finalAmount };
}

function generateBookingNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const rand = String(Math.floor(100000 + Math.random() * 900000));
  return `ABT${yy}${rand}`;
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
    netAmount: (() => { const v = get("netAmount","net_amount"); return v != null && v !== "" ? Number(v) : null; })(),
    gstIncluded: get("gstIncluded", "gst_included") ?? false,
    gstRate: (() => { const v = get("gstRate","gst_rate"); return v != null && v !== "" ? Number(v) : 5; })(),
    tcsEnabled: get("tcsEnabled", "tcs_enabled") ?? false,
    tcsRate: (() => { const v = get("tcsRate","tcs_rate"); return v != null && v !== "" ? Number(v) : 2; })(),
    tcsAmount: (() => { const v = get("tcsAmount","tcs_amount"); return v != null && v !== "" ? Number(v) : null; })(),
    advanceAmount: (() => { const v = get("advanceAmount","advance_amount"); return v ? Number(v) : null; })(),
    paidAmount: (() => { const v = get("paidAmount","paid_amount"); return v ? Number(v) : null; })(),
    onlinePaidAmount: (() => { const v = get("onlinePaidAmount","online_paid_amount"); return v ? Number(v) : null; })(),
    lastPaymentDate: (() => { const v = get("lastPaymentDate","last_payment_date"); return v?.toISOString?.() ?? v ?? null; })(),
    journeyStatus: get("journeyStatus", "journey_status") ?? "booking_requested",
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
    let packagePrice: number = 0;

    if (data.packageId) {
      const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, data.packageId)).limit(1);
      if (pkgs[0]) {
        packageData = pkgs[0];
        packagePrice = Number(packageData.pricePerPerson) * data.numberOfPilgrims;
      }
    } else if (data.totalAmount) {
      packagePrice = data.totalAmount;
    }

    const gstIncluded = (data as any).gstIncluded === true;
    const gstRate = (data as any).gstRate != null ? Number((data as any).gstRate) : 5;
    const tcsEnabled = (data as any).tcsEnabled === true;
    const tcsRate = (data as any).tcsRate != null ? Number((data as any).tcsRate) : 2;
    const tcsIncluded = (data as any).tcsIncluded === true;

    const calc = calcAmounts({
      packagePrice,
      discountAmount: data.discountAmount,
      discountPercentage: data.discountPercentage,
      gstEnabled: true,
      gstIncluded,
      gstRate,
      tcsEnabled,
      tcsIncluded,
      tcsRate,
    });

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
      totalAmount: packagePrice > 0 ? String(packagePrice) : null,
      gstAmount: calc.gstAmount > 0 ? String(calc.gstAmount) : null,
      netAmount: packagePrice > 0 ? String(calc.netAmount) : null,
      gstIncluded,
      gstRate: String(gstRate),
      tcsEnabled,
      tcsRate: String(tcsRate),
      tcsAmount: calc.tcsAmount > 0 ? String(calc.tcsAmount) : null,
      finalAmount: packagePrice > 0 ? String(calc.finalAmount) : null,
      discountType: data.discountType ?? null,
      discountAmount: calc.discountAmount > 0 ? String(calc.discountAmount) : null,
      discountPercentage: calc.discountPercentage > 0 ? String(calc.discountPercentage) : null,
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

    // Auto-generate agreement on booking creation (fire-and-forget)
    autoGenerateAgreement(booking.id).catch(err =>
      console.error("[create] autoGenerateAgreement failed:", err)
    );

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

  // Supplement lastPaymentDate from pool.query (not in Drizzle schema — added via ALTER TABLE migration)
  const bookingIds = rows.map(r => r.booking.id);
  let lastPaymentDates: Record<string, string | null> = {};
  if (bookingIds.length > 0) {
    try {
      const lpdRes = await pool.query(
        `SELECT id, last_payment_date FROM bookings WHERE id = ANY($1)`,
        [bookingIds]
      );
      lpdRes.rows.forEach((r: any) => {
        lastPaymentDates[r.id] = r.last_payment_date ? new Date(r.last_payment_date).toISOString() : null;
      });
    } catch (_) { /* column may not exist yet on first deploy */ }
  }

  res.json({
    bookings: rows.map(({ booking, package: pkg }) => ({
      ...formatBooking(booking),
      lastPaymentDate: lastPaymentDates[booking.id] ?? null,
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

  // ── Customer notifications: WhatsApp → SMS → Email via notification engine ─
  // triggerWorkflow → fireNotificationEvent logs to notification_logs (admin-visible)
  triggerWorkflow("new_booking", {
    bookingId: booking.id, bookingNumber: booking.bookingNumber,
    customerId: booking.customerId ?? undefined, customerName: booking.customerName,
    customerMobile: booking.customerMobile, customerEmail: booking.customerEmail ?? undefined,
    packageName: booking.packageName ?? pkg?.name ?? "Travel Package",
    amount: booking.finalAmount ? Number(booking.finalAmount) : undefined,
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

  // Booking approved notification — invoice is NOT generated here.
  // Invoice is generated only after payment (online or offline).
  (async () => {
    try {
      const ctx = {
        bookingId:      updated.id,
        bookingNumber:  updated.bookingNumber,
        customerName:   (updated.customerName || "").trim(),
        customerMobile: updated.customerMobile,
        customerEmail:  updated.customerEmail ?? undefined,
        packageName:    (updated as any).packageName ?? undefined,
        finalAmount:    (updated as any).finalAmount ? Number((updated as any).finalAmount) : undefined,
        invoiceUrl:     `https://alburhantravels.com/invoice/${updated.bookingNumber}`,
      };
      console.log(`[PIPELINE:approve-route] ▶ booking_approved triggered | bookingId=${ctx.bookingId} | bookingNumber=${ctx.bookingNumber} | mobile=${ctx.customerMobile} | name="${ctx.customerName}" | package="${ctx.packageName}" | finalAmount=${ctx.finalAmount} | invoiceUrl=${ctx.invoiceUrl}`);
      await triggerWorkflow("booking_approved", ctx);
      console.log(`[PIPELINE:approve-route] ✅ triggerWorkflow completed | bookingId=${ctx.bookingId}`);
    } catch (err) {
      console.error("[PIPELINE:approve-route] ❌ booking_approved notification error:", err);
    }
  })();

  notifyBookingApproved({
    bookingId: updated.id,
    bookingNumber: updated.bookingNumber,
    customerName: updated.customerName,
    customerMobile: updated.customerMobile,
  });

  auditLog({ req, action: "approved", entityTable: "bookings", entityId: updated.id, newValue: { bookingNumber: updated.bookingNumber, status: "approved" } }).catch(() => {});

  // Auto-generate agreement for this booking immediately on approval
  autoGenerateAgreement(updated.id).catch(err =>
    console.error("[approve] autoGenerateAgreement failed:", err)
  );

  // Advance journey_status to booking_approved (only if still at a pre-approval stage)
  pool.query(
    `UPDATE bookings SET journey_status = 'booking_approved', updated_at = NOW()
     WHERE id = $1
       AND journey_status IN ('booking_requested','documents_pending','documents_received','admin_verification','payment_pending')`,
    [updated.id]
  ).then(() => {
    console.log(`[approve] journey_status → booking_approved for ${updated.bookingNumber}`);
    broadcastCustomerJourneyUpdate(updated.id, "booking_approved");
  }).catch(err => console.error("[approve] journey_status advance failed:", err?.message));

  res.json(formatBooking(updated));
});

// GET /:id/confirmation-status — delivery status per channel
router.get("/:id/confirmation-status", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT channel, status, error_message, sent_at, retry_count
       FROM booking_confirmation_notifications
       WHERE booking_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    // Deduplicate: keep latest per channel
    const latest: Record<string, any> = {};
    for (const row of rows) {
      if (!latest[row.channel]) latest[row.channel] = row;
    }
    res.json({ channels: Object.values(latest) });
  } catch (err) {
    res.json({ channels: [] });
  }
});

// POST /:id/resend-confirmation — admin resend all channels
router.post("/:id/resend-confirmation", requireAdmin as any, requirePermission("bookings", "approve") as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = bookings[0];
  res.json({ message: "Resending notifications...", bookingStatus: b.status });

  (async () => {
    try {
      const { randomUUID } = await import("crypto");

      if (b.status === "pending" || b.status === "submitted") {
        // Booking not yet approved — resend submission notification
        await sendBookingSubmissionNotification({
          mobile: b.customerMobile,
          email: b.customerEmail,
          customerName: b.customerName,
          bookingNumber: b.bookingNumber,
          packageName: b.packageName ?? "Travel Package",
          numberOfPilgrims: b.numberOfPilgrims,
          bookingId: b.id,
          pool,
        });
        // Submission function handles its own DB logging
        return;
      }

      // Booking is approved/confirmed — resend the rich confirmation
      const paidAmt = Number(b.paidAmount || 0);
      const totalAmt = Number(b.finalAmount || b.totalAmount || 0);
      const balanceAmt = Math.max(0, totalAmt - paidAmt);

      const result = await sendBookingConfirmationNotification({
        mobile: b.customerMobile,
        email: b.customerEmail,
        customerName: b.customerName,
        bookingNumber: b.bookingNumber,
        packageName: b.packageName,
        numberOfPilgrims: b.numberOfPilgrims,
        departureDate: b.preferredDepartureDate,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balanceAmt,
        customerId: b.customerId,
        bookingId: b.id,
        pool,
      });

      const channels: Array<{ channel: string; r: { ok: boolean; errorMessage?: string } }> = [
        { channel: "whatsapp", r: result.whatsapp },
        { channel: "sms",      r: result.sms },
        { channel: "email",    r: result.email },
        { channel: "rcs",      r: result.rcs },
        { channel: "dashboard",r: result.dashboard },
      ];
      for (const { channel, r } of channels) {
        await pool.query(
          `INSERT INTO booking_confirmation_notifications (id, booking_id, channel, status, error_message, sent_at, retry_count)
           VALUES ($1, $2, $3, $4, $5, NOW(), 1)`,
          [randomUUID(), b.id, channel, r.ok ? "sent" : "failed", r.ok ? null : ((r as any).errorMessage || "failed")]
        ).catch(() => {});
      }
    } catch (err) {
      console.error("[resend-confirmation] error:", err);
    }
  })();
});

// POST /:id/resend-whatsapp — resend template 333473 to customer
router.post("/:id/resend-whatsapp", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = rows[0];
  res.json({ message: "Resending WhatsApp...", bookingNumber: b.bookingNumber });
  (async () => {
    try {
      const { sendConfirmationTemplate } = await import("../lib/botbee.js");
      const { sendWhatsApp } = await import("../lib/botbee.js");
      const siteBase = "https://alburhantravels.com";
      const invoiceLink = b.bookingNumber ? `${siteBase}/invoice/${b.bookingNumber}` : siteBase;
      const bookingRef = b.bookingNumber || "-";
      const pkg = (b as any).packageName || "Hajj / Umrah Package";
      const tplResult = await sendConfirmationTemplate(
        b.customerMobile,
        { customerName: b.customerName, packageName: pkg, bookingRef, attachmentLink: invoiceLink },
        { eventType: "payment_received", bookingId: b.id, customerId: b.customerId ?? undefined },
      );
      if (!tplResult.ok) {
        const msg = `Assalamu Alaikum Dear ${b.customerName},\n\nYour booking with Al Burhan Tours & Travels has been confirmed.\n\nBooking ID: ${bookingRef}\n\nPackage: ${pkg}\n\nThank you for choosing Al Burhan Tours & Travels.\n\nTrusted Excellence in Holy Journeys.`;
        await sendWhatsApp(b.customerMobile, msg);
      }
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, customer_name, booking_id, booking_number, message, status, sent_at, retry_count)
         VALUES ($1,'payment_received','whatsapp',$2,$3,$4,$5,$6,$7,NOW(),0)`,
        [(await import("crypto")).randomUUID(), b.customerMobile, b.customerName, b.id, b.bookingNumber,
         `Template 333473 resend | ref=${bookingRef}`, tplResult.ok ? "sent" : "failed"]
      ).catch(() => {});
    } catch (err) {
      console.error("[resend-whatsapp] error:", err);
    }
  })();
});

// POST /:id/resend-email — resend booking confirmation email
router.post("/:id/resend-email", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = rows[0];
  if (!b.customerEmail) { res.status(400).json({ message: "No email address on file for this customer" }); return; }
  res.json({ message: "Resending email...", to: b.customerEmail });
  (async () => {
    try {
      const { sendEmail } = await import("../lib/notifications.js");
      const pkg = (b as any).packageName || "Hajj / Umrah Package";
      const body = `Dear ${b.customerName},<br><br>Thank you for choosing Al Burhan Tours &amp; Travels.<br><br>Your booking has been confirmed successfully.<br><br><strong>Booking ID:</strong> ${b.bookingNumber}<br><br><strong>Package:</strong> ${pkg}<br><br><strong>Payment Status:</strong> Paid<br><br>Please find attached your Booking Confirmation PDF and Invoice PDF.<br><br>For assistance contact us anytime.<br><br>Regards,<br>Al Burhan Tours &amp; Travels`;
      const result = await sendEmail(b.customerEmail, `Booking Confirmed – Al Burhan Tours & Travels`, body);
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, customer_name, booking_id, booking_number, message, status, sent_at, retry_count)
         VALUES ($1,'payment_received','email',$2,$3,$4,$5,$6,$7,NOW(),0)`,
        [(await import("crypto")).randomUUID(), b.customerEmail, b.customerName, b.id, b.bookingNumber,
         `Email resend to ${b.customerEmail}`, result.ok ? "sent" : "failed"]
      ).catch(() => {});
    } catch (err) {
      console.error("[resend-email] error:", err);
    }
  })();
});

// POST /:id/resend-sms — resend payment SMS to customer
router.post("/:id/resend-sms", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rows = await pool.query(`SELECT * FROM bookings WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = rows.rows[0];
  res.json({ message: "Sending SMS...", bookingNumber: b.booking_number });
  (async () => {
    try {
      const { sendPaymentReceived } = await import("../lib/sms.js");
      const { randomUUID } = await import("crypto");
      const paidAmt = Number(b.paid_amount || 0);
      const siteBase = "https://alburhantravels.com";
      const invoiceLink = b.booking_number ? `${siteBase}/invoice/${b.booking_number}` : siteBase;
      const result = await sendPaymentReceived({
        mobile: b.customer_mobile,
        customerName: b.customer_name,
        bookingNumber: b.booking_number,
        amount: String(Math.round(paidAmt)),
        invoiceUrl: invoiceLink,
        bookingId: b.id,
        customerId: b.customer_id ?? undefined,
      });
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, customer_name, booking_id, booking_number, message, status, sent_at, retry_count)
         VALUES ($1,'payment_received','sms',$2,$3,$4,$5,$6,$7,NOW(),0)`,
        [randomUUID(), b.customer_mobile, b.customer_name, b.id, b.booking_number,
         `SMS resend | mobile=${b.customer_mobile}`, result.ok ? "sent" : "failed"]
      ).catch(() => {});
    } catch (err) {
      console.error("[resend-sms] error:", err);
    }
  })();
});

// POST /:id/resend-invoice — generate Tax Invoice PDF and send via WhatsApp document
router.post("/:id/resend-invoice", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rows = await pool.query(`SELECT * FROM bookings WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = rows.rows[0];
  const paidAmt = Number(b.paid_amount || 0);
  if (paidAmt <= 0) { res.status(400).json({ message: "No payment recorded — invoice cannot be generated" }); return; }
  res.json({ message: "Generating & sending Invoice PDF...", bookingNumber: b.booking_number });
  (async () => {
    try {
      const { generateInvoicePdfBuffer } = await import("../lib/paymentDocs.js");
      const { sendPDFDocument } = await import("../lib/botbee.js");
      const { randomUUID } = await import("crypto");
      const totalAmt = Number(b.final_amount || b.total_amount || 0);
      const balanceAmt = Math.max(0, totalAmt - paidAmt);
      const docOpts = {
        customerName: b.customer_name,
        customerMobile: b.customer_mobile,
        customerEmail: b.customer_email ?? undefined,
        bookingNumber: b.booking_number,
        invoiceNumber: b.invoice_number ?? undefined,
        packageName: b.package_name ?? "Hajj / Umrah Package",
        numberOfPilgrims: b.number_of_pilgrims,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balanceAmt,
        gstAmount: Number(b.gst_amount || 0),
        paymentDate: b.updated_at || new Date(),
        razorpayPaymentId: b.razorpay_payment_id ?? undefined,
      };
      const pdfBuf = await generateInvoicePdfBuffer(docOpts);
      const waResult = await sendPDFDocument(
        b.customer_mobile, pdfBuf,
        `Invoice-${b.booking_number}.pdf`,
        `Your Tax Invoice – Al Burhan Tours & Travels (Booking: ${b.booking_number})`,
        { eventType: "payment_received", bookingId: b.id, customerId: b.customer_id ?? undefined }
      );
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, customer_name, booking_id, booking_number, message, status, sent_at, retry_count)
         VALUES ($1,'payment_received','whatsapp',$2,$3,$4,$5,$6,$7,NOW(),0)`,
        [randomUUID(), b.customer_mobile, b.customer_name, b.id, b.booking_number,
         `Invoice PDF resend via WhatsApp | booking=${b.booking_number}`, waResult.ok ? "sent" : "failed"]
      ).catch(() => {});
    } catch (err) {
      console.error("[resend-invoice] error:", err);
    }
  })();
});

// POST /:id/resend-receipt — generate Receipt PDF and send via WhatsApp document
router.post("/:id/resend-receipt", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rows = await pool.query(`SELECT * FROM bookings WHERE id = $1 LIMIT 1`, [req.params.id]);
  if (!rows.rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
  const b = rows.rows[0];
  const paidAmt = Number(b.paid_amount || 0);
  if (paidAmt <= 0) { res.status(400).json({ message: "No payment recorded — receipt cannot be generated" }); return; }
  res.json({ message: "Generating & sending Receipt PDF...", bookingNumber: b.booking_number });
  (async () => {
    try {
      const { generateReceiptPdfBuffer } = await import("../lib/paymentDocs.js");
      const { sendPDFDocument } = await import("../lib/botbee.js");
      const { randomUUID } = await import("crypto");
      const totalAmt = Number(b.final_amount || b.total_amount || 0);
      const balanceAmt = Math.max(0, totalAmt - paidAmt);
      const docOpts = {
        customerName: b.customer_name,
        customerMobile: b.customer_mobile,
        customerEmail: b.customer_email ?? undefined,
        bookingNumber: b.booking_number,
        invoiceNumber: b.invoice_number ?? undefined,
        packageName: b.package_name ?? "Hajj / Umrah Package",
        numberOfPilgrims: b.number_of_pilgrims,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: balanceAmt,
        gstAmount: Number(b.gst_amount || 0),
        paymentDate: b.updated_at || new Date(),
        razorpayPaymentId: b.razorpay_payment_id ?? undefined,
      };
      const pdfBuf = await generateReceiptPdfBuffer(docOpts);
      const waResult = await sendPDFDocument(
        b.customer_mobile, pdfBuf,
        `Receipt-${b.booking_number}.pdf`,
        `Your Payment Receipt – Al Burhan Tours & Travels (Booking: ${b.booking_number})`,
        { eventType: "payment_received", bookingId: b.id, customerId: b.customer_id ?? undefined }
      );
      await pool.query(
        `INSERT INTO notification_logs (id, event_type, channel, recipient, customer_name, booking_id, booking_number, message, status, sent_at, retry_count)
         VALUES ($1,'payment_received','whatsapp',$2,$3,$4,$5,$6,$7,NOW(),0)`,
        [randomUUID(), b.customer_mobile, b.customer_name, b.id, b.booking_number,
         `Receipt PDF resend via WhatsApp | booking=${b.booking_number}`, waResult.ok ? "sent" : "failed"]
      ).catch(() => {});
    } catch (err) {
      console.error("[resend-receipt] error:", err);
    }
  })();
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
  }).then(() => {
    trackNotification({ eventType: "booking_cancelled", channel: "whatsapp", recipient: updated.customerMobile, bookingId: updated.id, status: "sent" }).catch(() => {});
  }).catch(console.error);

  triggerWorkflow("booking_rejected", {
    bookingId: updated.id, bookingNumber: updated.bookingNumber,
    customerName: updated.customerName, customerMobile: updated.customerMobile,
    customerEmail: updated.customerEmail ?? undefined,
  }).catch(() => {});

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

router.post("/:id/journey-status", requireAdmin as any, requirePermission("bookings", "edit") as any, async (req: AuthenticatedRequest, res) => {
  const { journey_status } = req.body;
  if (!journey_status || typeof journey_status !== "string") {
    res.status(400).json({ message: "journey_status is required" }); return;
  }
  const VALID_JOURNEY_STATUSES = [
    "booking_requested","documents_pending","documents_received","admin_verification",
    "booking_approved","payment_pending","partial_payment_received",
    "payment_received","invoice_generated","visa_processing",
    "visa_approved","flight_confirmed","hotel_confirmed","bus_allocated",
    "room_allocated","departure_ready","journey_started","reached_makkah",
    "reached_madinah","return_flight","journey_completed",
  ];
  if (!VALID_JOURNEY_STATUSES.includes(journey_status)) {
    res.status(400).json({ message: "Invalid journey_status value" }); return;
  }
  try {
    const r = await pool.query(
      `UPDATE bookings SET journey_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [journey_status, req.params.id]
    );
    if (!r.rows[0]) { res.status(404).json({ message: "Booking not found" }); return; }
    const booking = r.rows[0];

    sendJourneyStatusNotification({
      mobile: booking.customer_mobile,
      email: booking.customer_email,
      customerName: booking.customer_name,
      bookingNumber: booking.booking_number,
      journeyStatus: journey_status,
    }).catch(console.error);

    trackNotification({ eventType: journey_status, channel: "whatsapp", recipient: booking.customer_mobile, bookingId: booking.id, status: "sent" }).catch(() => {});

    triggerWorkflow(journey_status, {
      bookingId: booking.id, bookingNumber: booking.booking_number,
      customerName: booking.customer_name, customerMobile: booking.customer_mobile,
      customerEmail: booking.customer_email ?? undefined,
      customerId: booking.customer_id ?? undefined,
      packageName: booking.package_name ?? undefined,
      journeyStatus: journey_status,
    }).catch(() => {});

    auditLog({ req, action: "journey_status_changed", entityTable: "bookings", entityId: booking.id, newValue: { journey_status } }).catch(() => {});
    broadcastCustomerJourneyUpdate(booking.id, journey_status);
    res.json({ ok: true, journey_status, booking: formatBooking(booking) });
  } catch (err: any) {
    console.error("[bookings] POST /:id/journey-status error:", err);
    res.status(500).json({ message: err?.message || "Failed to update journey status" });
  }
});

router.post("/:id/send-invoice", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.id, req.params.id)).limit(1);
  if (!bookings[0]) {
    res.status(404).json({ message: "Booking not found" });
    return;
  }
  let b = bookings[0];

  if (!b.invoiceNumber) {
    const { pool: pgPool } = await import("@workspace/db");
    const year = new Date().getFullYear();
    const prefix = `ABT/${year}/`;
    const seqRes = await pgPool.query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number,'/',3) AS BIGINT)),0)+1 AS next_seq FROM invoices WHERE invoice_number LIKE $1`,
      [`${prefix}%`]
    );
    const seq = Number(seqRes.rows[0]?.next_seq ?? 1);
    const invNum = `${prefix}${String(seq).padStart(6, "0")}`;
    await db.update(bookingsTable).set({ invoiceNumber: invNum } as any).where(eq(bookingsTable.id, b.id));
    b = { ...b, invoiceNumber: invNum };
  }

  const baseUrl = `https://alburhantravels.com`;
  const invoiceUrl = `${baseUrl}/invoice/${b.bookingNumber}`;
  const message = `Assalamu Alaikum ${b.customerName},\n\nYour invoice #${b.invoiceNumber} for booking #${b.bookingNumber} is ready.\n\nView/Download:\n${invoiceUrl}\n\nTotal: INR ${b.finalAmount ? Number(b.finalAmount).toLocaleString("en-IN") : "N/A"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;

  const results = await Promise.allSettled([
    sendWhatsApp(b.customerMobile, message),
    sendDLTSMS(b.customerMobile, b.customerName, b.bookingNumber, b.invoiceNumber || ""),
    b.customerEmail
      ? sendInvoiceEmail(b.customerEmail, {
          customerName:  b.customerName,
          bookingNumber: b.bookingNumber,
          invoiceNumber: b.invoiceNumber || "",
          packageName:   b.packageName ?? undefined,
          totalAmount:   b.finalAmount ? Number(b.finalAmount) : 0,
          paidAmount:    b.paidAmount  ? Number(b.paidAmount)  : undefined,
          balanceDue:    b.finalAmount && b.paidAmount
                           ? Math.max(0, Number(b.finalAmount) - Number(b.paidAmount))
                           : undefined,
        })
      : Promise.resolve({ ok: false, error: "No customer email" }),
  ]);

  const whatsappResult = results[0].status === "fulfilled" ? (results[0] as any).value : null;
  const whatsappOk = whatsappResult?.ok === true;
  const smsOk = results[1].status === "fulfilled";
  const emailResult = results[2].status === "fulfilled" ? (results[2] as any).value : null;
  const emailOk = emailResult?.ok === true;
  if (!emailOk && b.customerEmail) {
    console.error(`[bookings] Invoice email failed for ${b.bookingNumber}:`, emailResult?.error);
  }

  fireNotificationEvent("invoice_generated", {
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    customerEmail: b.customerEmail ?? undefined,
    customerId: b.customerId ?? undefined,
    bookingId: b.id,
    bookingNumber: b.bookingNumber,
    packageName: b.packageName ?? undefined,
    invoiceNumber: b.invoiceNumber ?? undefined,
    amount: b.finalAmount ? Number(b.finalAmount) : undefined,
  }).catch(() => {});

  res.json({ message: "Invoice notification sent", whatsapp: whatsappOk, sms: smsOk });
});

router.get("/:id/notification-logs", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { pool: pgPool } = await import("@workspace/db");
    const result = await pgPool.query(
      `SELECT id, channel, event_type, status, recipient, message, provider_name,
              provider_response, sent_at, retry_count, error_code
       FROM notification_logs
       WHERE booking_id = $1
       ORDER BY sent_at DESC
       LIMIT 60`,
      [req.params.id]
    );
    res.json({ logs: result.rows });
  } catch (err) {
    console.error("[bookings] notification-logs error:", err);
    res.status(500).json({ message: "Failed to fetch notification logs" });
  }
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

// ── Customer: timeline for a specific booking ─────────────────────────────────
router.get("/:id/timeline", requireAuth as any, async (req, res) => {
  const bookingId = req.params.id;
  const user = (req as any).user;
  const userId = user?.id;
  try {
    // Admins can see any booking's timeline; customers only their own
    if (user?.role !== "admin" && user?.role !== "super_admin") {
      const check = await pool.query(
        `SELECT id FROM bookings WHERE id = $1 AND customer_id = $2 LIMIT 1`,
        [bookingId, userId]
      );
      if (check.rows.length === 0) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    // Return timeline events
    const rows = await pool.query(
      `SELECT id, event_type, title, description, icon, created_at
       FROM customer_timeline
       WHERE booking_id = $1
       ORDER BY created_at ASC`,
      [bookingId]
    );
    res.json({ events: rows.rows });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to load timeline" });
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
