import { Router } from "express";
import { db, pool, bookingsTable, usersTable, packagesTable, inquiriesTable, packageRequestsTable, hajjGroupsTable, customerProfilesTable, pilgrimsTable } from "@workspace/db";
import { eq, count, sum, desc, and, sql, max } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";

const router = Router();

router.get("/stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    // Use pool.query() directly — bypasses drizzle wrapper to avoid bundling quirks
    const countsRes = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status::text = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status::text = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status::text = 'confirmed')::int AS confirmed,
        COUNT(*) FILTER (WHERE status::text = 'rejected')::int AS rejected,
        COALESCE(SUM(CASE WHEN status::text = 'confirmed'
          THEN NULLIF(TRIM(final_amount::text), '')::numeric ELSE 0 END), 0)::float AS revenue
      FROM bookings
    `);
    const counts = countsRes.rows[0] ?? {};

    const [custRes, pkgRes, recentRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'customer'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM packages`),
      pool.query(`
        SELECT id,
               COALESCE(booking_number, '') AS booking_number,
               COALESCE(customer_name, '') AS customer_name,
               COALESCE(customer_mobile, '') AS customer_mobile,
               status::text AS status,
               NULLIF(TRIM(total_amount::text), '') AS total_amount,
               NULLIF(TRIM(gst_amount::text), '') AS gst_amount,
               NULLIF(TRIM(final_amount::text), '') AS final_amount,
               created_at, updated_at
        FROM bookings ORDER BY created_at DESC LIMIT 5
      `),
    ]);
    const custRow = custRes.rows[0] ?? {};
    const pkgRow = pkgRes.rows[0] ?? {};
    const recentRows: any[] = recentRes.rows;

    res.json({
      totalBookings: Number(counts?.total ?? 0),
      pendingBookings: Number(counts?.pending ?? 0),
      approvedBookings: Number(counts?.approved ?? 0),
      confirmedBookings: Number(counts?.confirmed ?? 0),
      rejectedBookings: Number(counts?.rejected ?? 0),
      totalRevenue: Number(counts?.revenue ?? 0),
      totalCustomers: Number(custRow?.total ?? 0),
      totalPackages: Number(pkgRow?.total ?? 0),
      recentBookings: (Array.isArray(recentRows) ? recentRows : []).map((b: any) => ({
        id: b.id,
        bookingNumber: b.booking_number,
        customerName: b.customer_name,
        customerMobile: b.customer_mobile,
        status: b.status,
        totalAmount: b.total_amount ? Number(b.total_amount) : null,
        gstAmount: b.gst_amount ? Number(b.gst_amount) : null,
        finalAmount: b.final_amount ? Number(b.final_amount) : null,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    });
  } catch (err: any) {
    console.error("[Stats] Failed:", err?.message);
    res.status(500).json({ message: err?.message || "Failed to load stats" });
  }
});

router.get("/customers", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const customers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "customer"))
    .orderBy(desc(usersTable.createdAt));

  res.json(customers.map(u => ({
    ...u,
    createdAt: u.createdAt?.toISOString?.(),
    updatedAt: u.updatedAt?.toISOString?.(),
  })));
});

router.get("/inquiries", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const inquiries = await db.select().from(inquiriesTable).orderBy(desc(inquiriesTable.createdAt));
  res.json(inquiries.map(i => ({
    ...i,
    createdAt: i.createdAt?.toISOString?.(),
  })));
});

router.patch("/inquiries/:id/read", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  await db.update(inquiriesTable).set({ isRead: true }).where(eq(inquiriesTable.id, id));
  res.json({ success: true });
});

router.post("/broadcast", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { message, audience } = req.body;
  if (!message || !audience) {
    res.status(400).json({ message: "Message and audience are required" });
    return;
  }

  let mobiles: string[] = [];

  if (audience === "all") {
    const customers = await db.select({ mobile: usersTable.mobile }).from(usersTable).where(eq(usersTable.role, "customer"));
    mobiles = customers.map(c => c.mobile);
  } else if (audience === "pending_payment") {
    const bookings = await db.select({ mobile: bookingsTable.customerMobile }).from(bookingsTable).where(eq(bookingsTable.status, "approved"));
    mobiles = [...new Set(bookings.map(b => b.mobile))];
  } else if (audience === "confirmed") {
    const bookings = await db.select({ mobile: bookingsTable.customerMobile }).from(bookingsTable).where(eq(bookingsTable.status, "confirmed"));
    mobiles = [...new Set(bookings.map(b => b.mobile))];
  } else {
    res.status(400).json({ message: "Invalid audience. Use: all, pending_payment, confirmed" });
    return;
  }

  const results = await Promise.allSettled(
    mobiles.map(m => sendWhatsApp(m, message))
  );
  const sent = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<boolean>).value).length;

  res.json({ message: `Broadcast sent to ${mobiles.length} recipients (${sent} deliveries)`, recipientCount: mobiles.length });
});

router.get("/reports/bookings", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { from, to } = req.query;
  let conditions: any[] = [];
  if (from) conditions.push(sql`${bookingsTable.createdAt} >= ${new Date(from as string)}`);
  if (to) conditions.push(sql`${bookingsTable.createdAt} <= ${new Date(to as string)}`);

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.createdAt));

  res.json(bookings.map(b => ({
    ...b,
    totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
    gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
    finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
    createdAt: b.createdAt?.toISOString?.(),
    updatedAt: b.updatedAt?.toISOString?.(),
  })));
});

router.get("/reports/customers", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const customers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "customer"))
    .orderBy(desc(usersTable.createdAt));

  res.json(customers.map(c => ({
    name: c.name,
    mobile: c.mobile,
    email: c.email,
    role: c.role,
    createdAt: c.createdAt?.toISOString?.(),
  })));
});

router.get("/reports/payments", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "confirmed"))
    .orderBy(desc(bookingsTable.updatedAt));

  res.json(bookings.map(b => ({
    bookingNumber: b.bookingNumber,
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    packageName: b.packageName,
    invoiceNumber: b.invoiceNumber,
    totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
    gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
    finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
    paymentDate: b.updatedAt?.toISOString?.(),
    razorpayPaymentId: b.razorpayPaymentId,
  })));
});

function generateBookingNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ABT${yy}${mm}${rand}`;
}

router.get("/requests", requireAdmin as any, async (_req, res) => {
  try {
    const requests = await db
      .select()
      .from(packageRequestsTable)
      .orderBy(desc(packageRequestsTable.createdAt));
    res.json(requests);
  } catch (err: any) {
    console.error("[admin] GET /requests error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch requests" });
  }
});

router.patch("/requests/:id/approve", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const requests = await db.select().from(packageRequestsTable).where(eq(packageRequestsTable.id, req.params.id)).limit(1);
    const request = requests[0];
    if (!request) { res.status(404).json({ message: "Request not found" }); return; }
    if (request.status !== "pending") { res.status(400).json({ message: "Request is not pending" }); return; }

    let pkg = null;
    if (request.packageId) {
      const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, request.packageId)).limit(1);
      pkg = pkgs[0] ?? null;
    }

    const price = pkg ? Number(pkg.pricePerPerson) : null;
    const gst = price && pkg ? price * (Number(pkg.gstPercent) / 100) : null;
    const finalAmount = price && gst ? price + gst : null;

    const [booking] = await db.insert(bookingsTable).values({
      bookingNumber: generateBookingNumber(),
      packageId: request.packageId ?? null,
      packageName: request.packageName ?? null,
      customerId: request.customerId ?? null,
      customerName: request.customerName,
      customerMobile: request.customerMobile,
      numberOfPilgrims: 1,
      status: "approved",
      totalAmount: price ? String(price) : null,
      gstAmount: gst ? String(gst) : null,
      finalAmount: finalAmount ? String(finalAmount) : null,
      notes: request.message ?? null,
      isOffline: false,
    }).returning();

    const [updated] = await db
      .update(packageRequestsTable)
      .set({ status: "approved", bookingId: booking.id, updatedAt: new Date() })
      .where(eq(packageRequestsTable.id, req.params.id))
      .returning();

    const approvedMsg = `Assalamu Alaikum ${request.customerName},\n\nYour request for "${request.packageName}" has been APPROVED!\n\nPlease login to your dashboard and fill in your travel details to proceed.\n\nHelp: +91 8989701701 / +91 9893989786\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    Promise.allSettled([
      sendWhatsApp(request.customerMobile, approvedMsg),
      sendDLTSMS(request.customerMobile, request.customerName, request.packageName ?? "Package", "APPROVED"),
    ]).catch(console.error);

    res.json({ request: updated, booking });
  } catch (err: any) {
    console.error("[admin] PATCH /requests/:id/approve error:", err);
    res.status(500).json({ message: err?.message || "Failed to approve request" });
  }
});

router.patch("/requests/:id/reject", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { reason } = req.body;
    const requests = await db.select().from(packageRequestsTable).where(eq(packageRequestsTable.id, req.params.id)).limit(1);
    const request = requests[0];
    if (!request) { res.status(404).json({ message: "Request not found" }); return; }

    const [updated] = await db
      .update(packageRequestsTable)
      .set({ status: "rejected", rejectionReason: reason ?? null, updatedAt: new Date() })
      .where(eq(packageRequestsTable.id, req.params.id))
      .returning();

    const reasonText = reason ? `\n\nReason: ${reason}` : "";
    const rejectedMsg = `Assalamu Alaikum ${request.customerName},\n\nWe regret that your request for "${request.packageName}" could not be accommodated at this time.${reasonText}\n\nPlease contact us for alternatives:\n+91 8989701701 / +91 9893989786\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    Promise.allSettled([
      sendWhatsApp(request.customerMobile, rejectedMsg),
      sendDLTSMS(request.customerMobile, request.customerName, request.packageName ?? "Package", "REJECTED"),
    ]).catch(console.error);

    res.json(updated);
  } catch (err: any) {
    console.error("[admin] PATCH /requests/:id/reject error:", err);
    res.status(500).json({ message: err?.message || "Failed to reject request" });
  }
});

router.patch("/requests/:id/assign-group", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const { groupId } = req.body;

    if (!groupId) {
      res.status(400).json({ message: "groupId is required" });
      return;
    }

    const requests = await db
      .select()
      .from(packageRequestsTable)
      .where(eq(packageRequestsTable.id, id))
      .limit(1);
    const request = requests[0];
    if (!request) { res.status(404).json({ message: "Request not found" }); return; }
    if (request.status !== "approved") {
      res.status(400).json({ message: "Only approved requests can be assigned to a group" });
      return;
    }
    if (request.pilgrimId) {
      res.status(400).json({ message: "This request is already assigned to a group" });
      return;
    }

    const groups = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, groupId))
      .limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }

    let profile = null;
    if (request.customerId) {
      const profiles = await db
        .select()
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.userId, request.customerId))
        .limit(1);
      profile = profiles[0] ?? null;
    }

    const [{ maxSerial }] = await db
      .select({ maxSerial: max(pilgrimsTable.serialNumber) })
      .from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId));
    const nextSerial = (maxSerial || 0) + 1;

    const gender = profile?.gender ?? null;
    let salutation: string | null = null;
    if (gender === "male") salutation = "Mr.";
    else if (gender === "female") salutation = "Mrs.";

    const { pilgrim, updated } = await db.transaction(async (tx) => {
      const [newPilgrim] = await tx.insert(pilgrimsTable).values({
        groupId,
        serialNumber: nextSerial,
        fullName: profile?.name || request.customerName,
        passportNumber: profile?.passportNumber ?? null,
        dateOfBirth: profile?.dateOfBirth ?? null,
        gender,
        address: profile?.address ?? null,
        photoUrl: profile?.photoUrl ?? null,
        mobileIndia: request.customerMobile,
        passportIssueDate: profile?.passportIssueDate ?? null,
        passportExpiryDate: profile?.passportExpiryDate ?? null,
        passportPlaceOfIssue: profile?.passportPlaceOfIssue ?? null,
        salutation,
      }).returning();

      const [updatedReq] = await tx
        .update(packageRequestsTable)
        .set({ groupId, pilgrimId: newPilgrim.id, updatedAt: new Date() })
        .where(eq(packageRequestsTable.id, id))
        .returning();

      return { pilgrim: newPilgrim, updated: updatedReq };
    });

    res.json({ request: updated, pilgrim, group: groups[0] });
  } catch (err: any) {
    console.error("[admin] PATCH /requests/:id/assign-group error:", err);
    res.status(500).json({ message: err?.message || "Failed to assign group" });
  }
});

export default router;
