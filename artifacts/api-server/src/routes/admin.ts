import { Router } from "express";
import { db, pool, bookingsTable, usersTable, packagesTable, inquiriesTable, packageRequestsTable, hajjGroupsTable, customerProfilesTable, pilgrimsTable } from "@workspace/db";
import { eq, count, sum, desc, and, sql, max } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";

const router = Router();
router.use(requireModuleAccess("reports") as any);

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
          THEN NULLIF(TRIM(final_amount::text), '')::numeric ELSE 0 END), 0)::float AS revenue,
        COALESCE(SUM(NULLIF(TRIM(discount_amount::text), '')::numeric), 0)::float AS total_discount,
        COUNT(*) FILTER (WHERE discount_amount IS NOT NULL AND NULLIF(TRIM(discount_amount::text),'')::numeric > 0)::int AS discounted_bookings
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
      totalDiscount: Number(counts?.total_discount ?? 0),
      discountedBookings: Number(counts?.discounted_bookings ?? 0),
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
    "Booking #": b.bookingNumber,
    "Customer Name": b.customerName,
    "Mobile": b.customerMobile,
    "Package": b.packageName ?? "",
    "Status": b.status,
    "Pilgrims": b.numberOfPilgrims,
    "Total Amount": b.totalAmount ? Number(b.totalAmount) : 0,
    "Net Amount": (b as any).netAmount ? Number((b as any).netAmount) : 0,
    "GST Mode": (b as any).gstIncluded ? "Included" : "Extra",
    "GST Rate (%)": (b as any).gstRate ? Number((b as any).gstRate) : 0,
    "GST Amount": b.gstAmount ? Number(b.gstAmount) : 0,
    "TCS Enabled": (b as any).tcsEnabled ? "Yes" : "No",
    "TCS Rate (%)": (b as any).tcsRate ? Number((b as any).tcsRate) : 0,
    "TCS Amount": (b as any).tcsAmount ? Number((b as any).tcsAmount) : 0,
    "Discount Type": b.discountType ?? "No Discount",
    "Discount Amount": b.discountAmount ? Number(b.discountAmount) : 0,
    "Discount %": b.discountPercentage ? Number(b.discountPercentage) : 0,
    "Discount Reason": b.discountReason ?? "",
    "Final Amount": b.finalAmount ? Number(b.finalAmount) : 0,
    "Offline": b.isOffline ? "Yes" : "No",
    "Created At": b.createdAt?.toISOString?.(),
  })));
});

router.get("/reports/discounts", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { from, to, discountType } = req.query;
  try {
    let whereClause = `WHERE discount_amount IS NOT NULL AND NULLIF(TRIM(discount_amount::text),'')::numeric > 0`;
    const params: any[] = [];
    let idx = 1;
    if (from) { whereClause += ` AND created_at >= $${idx++}`; params.push(new Date(from as string)); }
    if (to) { whereClause += ` AND created_at <= $${idx++}`; params.push(new Date(to as string)); }
    if (discountType) { whereClause += ` AND discount_type = $${idx++}`; params.push(discountType); }

    const result = await pool.query(`
      SELECT
        booking_number, customer_name, customer_mobile, package_name,
        status::text AS status, number_of_pilgrims,
        NULLIF(TRIM(total_amount::text),'')::numeric AS total_amount,
        NULLIF(TRIM(gst_amount::text),'')::numeric AS gst_amount,
        NULLIF(TRIM(final_amount::text),'')::numeric AS final_amount,
        discount_type, NULLIF(TRIM(discount_amount::text),'')::numeric AS discount_amount,
        NULLIF(TRIM(discount_percentage::text),'')::numeric AS discount_percentage,
        discount_reason, created_at
      FROM bookings
      ${whereClause}
      ORDER BY created_at DESC
    `, params);

    const rows = result.rows;
    const totalDiscount = rows.reduce((s: number, r: any) => s + Number(r.discount_amount ?? 0), 0);

    res.json({
      rows: rows.map((r: any) => ({
        "Booking #": r.booking_number,
        "Customer": r.customer_name,
        "Mobile": r.customer_mobile,
        "Package": r.package_name ?? "",
        "Status": r.status,
        "Discount Type": r.discount_type,
        "Discount Amount": Number(r.discount_amount ?? 0),
        "Discount %": Number(r.discount_percentage ?? 0),
        "Discount Reason": r.discount_reason ?? "",
        "Original Amount": Number(r.total_amount ?? 0) + Number(r.gst_amount ?? 0),
        "Final Amount": Number(r.final_amount ?? 0),
        "Date": new Date(r.created_at).toLocaleDateString("en-IN"),
      })),
      summary: {
        totalDiscounts: totalDiscount,
        count: rows.length,
        averageDiscount: rows.length > 0 ? Math.round(totalDiscount / rows.length) : 0,
      },
    });
  } catch (err: any) {
    console.error("[reports/discounts] Error:", err);
    res.status(500).json({ message: err?.message || "Failed to load discount report" });
  }
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

// ── Operations Dashboard ──────────────────────────────────────────────────────
router.get("/operations", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const [pilgrims, families, flights, groups, bookings, attendance,
           hotels, rooms, medical, visa, luggageTags, buses] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE family_id IS NOT NULL)::int AS in_family FROM pilgrims`),
      pool.query(`SELECT COUNT(DISTINCT family_id)::int AS total FROM pilgrims WHERE family_id IS NOT NULL`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE departure_date = to_char(NOW(),'YYYY-MM-DD'))::int AS today_dep FROM group_flights`),
      pool.query(`SELECT COUNT(*)::int AS total FROM hajj_groups`),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE status='partially_paid')::int AS partial_count,
          COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed_count,
          COALESCE(SUM(GREATEST(final_amount::numeric - COALESCE(paid_amount::numeric,0),0)) FILTER (WHERE status IN ('approved','partially_paid')), 0)::numeric AS pending_balance
        FROM bookings WHERE is_deleted = false OR is_deleted IS NULL
      `).catch(() => pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
          COUNT(*) FILTER (WHERE status='partially_paid')::int AS partial_count,
          COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed_count,
          COALESCE(SUM(GREATEST(final_amount::numeric - COALESCE(paid_amount::numeric,0),0)) FILTER (WHERE status IN ('approved','partially_paid')), 0)::numeric AS pending_balance
        FROM bookings WHERE final_amount IS NOT NULL
      `)),
      pool.query(`
        SELECT COUNT(*)::int AS total_logs,
          COUNT(*) FILTER (WHERE status='present')::int AS present,
          COUNT(*) FILTER (WHERE status='absent')::int AS absent
        FROM attendance_logs
      `).catch(() => ({ rows: [{ total_logs: 0, present: 0, absent: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS total FROM hotels WHERE is_deleted IS NOT true`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS occupied FROM pilgrim_room_assignments`).catch(() => ({ rows: [{ occupied: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS active FROM medical_cases WHERE status='active'`).catch(() => ({ rows: [{ active: 0 }] })),
      pool.query(`SELECT COUNT(*) FILTER (WHERE visa_status='pending' OR visa_status IS NULL)::int AS pending, COUNT(*) FILTER (WHERE passport_number IS NULL OR passport_number='')::int AS passport_pending FROM pilgrims`).catch(() => ({ rows: [{ pending: 0, passport_pending: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS total FROM luggage_tags`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS total FROM buses`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const p = pilgrims.rows[0] || {};
    const f = families.rows[0] || {};
    const fl = flights.rows[0] || {};
    const g = groups.rows[0] || {};
    const b = bookings.rows[0] || {};
    const a = attendance.rows[0] || {};
    const h = hotels.rows[0] || {};
    const rm = rooms.rows[0] || {};
    const med = medical.rows[0] || {};
    const v = visa.rows[0] || {};
    const lt = luggageTags.rows[0] || {};
    const bus = buses.rows[0] || {};

    res.json({
      totalPilgrims: p.total ?? 0,
      pilgrimsInFamily: p.in_family ?? 0,
      totalFamilies: f.total ?? 0,
      totalGroups: g.total ?? 0,
      totalFlights: fl.total ?? 0,
      todayDepartures: fl.today_dep ?? 0,
      totalBookings: b.total ?? 0,
      pendingBookings: b.pending_count ?? 0,
      partialBookings: b.partial_count ?? 0,
      confirmedBookings: b.confirmed_count ?? 0,
      pendingBalance: parseFloat(b.pending_balance ?? 0),
      attendancePresent: a.present ?? 0,
      attendanceAbsent: a.absent ?? 0,
      totalHotels: h.total ?? 0,
      roomsOccupied: rm.occupied ?? 0,
      activeMedical: med.active ?? 0,
      visaPending: v.pending ?? 0,
      passportPending: v.passport_pending ?? 0,
      totalLuggage: lt.total ?? 0,
      totalBuses: bus.total ?? 0,
    });
  } catch (err: any) {
    console.error("[admin] GET /operations error:", err);
    res.status(500).json({ message: err?.message || "Failed to load operations data" });
  }
});

// ── Family Ledger ─────────────────────────────────────────────────────────────
router.get("/family-ledger", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId, search } = req.query as Record<string, string>;

    const families = await pool.query(`
      SELECT
        p.family_id,
        p.group_id,
        hg.group_name,
        COUNT(*)::int AS member_count,
        MAX(CASE WHEN p.family_head = true THEN p.full_name END) AS head_name,
        array_agg(p.full_name ORDER BY p.family_head DESC NULLS LAST, p.full_name) AS member_names,
        array_agg(COALESCE(p.mobile_india,'') ORDER BY p.family_head DESC NULLS LAST) AS member_mobiles
      FROM pilgrims p
      LEFT JOIN hajj_groups hg ON hg.id = p.group_id
      WHERE p.family_id IS NOT NULL
        ${groupId ? "AND p.group_id = $1" : ""}
      GROUP BY p.family_id, p.group_id, hg.group_name
      ORDER BY hg.group_name, head_name
      ${groupId ? "" : "LIMIT 500"}
    `, groupId ? [groupId] : []);

    if (families.rows.length === 0) return res.json([]);

    // For each family, find associated bookings by mobile number
    const allMobiles = families.rows.flatMap((f: Record<string, string[]>) => f.member_mobiles.filter(Boolean));
    let bookingMap: Record<string, { finalAmount: number; paidAmount: number; status: string }> = {};

    if (allMobiles.length > 0) {
      const placeholders = allMobiles.map((_: string, i: number) => `$${i + 1}`).join(",");
      const bRes = await pool.query(
        `SELECT customer_mobile, SUM(COALESCE(final_amount::numeric,0)) AS total_amount,
          SUM(COALESCE(paid_amount::numeric,0)) AS total_paid
         FROM bookings
         WHERE customer_mobile IN (${placeholders})
           AND (is_deleted = false OR is_deleted IS NULL)
         GROUP BY customer_mobile`,
        allMobiles
      ).catch(() => ({ rows: [] as Record<string, string>[] }));

      for (const row of bRes.rows as Record<string, string>[]) {
        bookingMap[row["customer_mobile"] as string] = {
          finalAmount: parseFloat(row["total_amount"] as string ?? "0"),
          paidAmount: parseFloat(row["total_paid"] as string ?? "0"),
          status: "",
        };
      }
    }

    const result = families.rows.map((f: Record<string, unknown>) => {
      const mobiles = (f["member_mobiles"] as string[]).filter(Boolean);
      let totalAmount = 0, totalPaid = 0;
      for (const m of mobiles) {
        const bk = bookingMap[m];
        if (bk) { totalAmount += bk.finalAmount; totalPaid += bk.paidAmount; }
      }
      const headName = f["head_name"] as string || (f["member_names"] as string[])[0] || "Unknown";
      return {
        familyId: f["family_id"],
        groupId: f["group_id"],
        groupName: f["group_name"] || "—",
        headName,
        memberCount: f["member_count"],
        memberNames: f["member_names"],
        totalAmount,
        totalPaid,
        balance: totalAmount - totalPaid,
      };
    }).filter((f: Record<string, unknown>) => {
      if (!search) return true;
      const s = (search as string).toLowerCase();
      return (
        ((f["headName"] as string) || "").toLowerCase().includes(s) ||
        ((f["familyId"] as string) || "").toLowerCase().includes(s) ||
        ((f["groupName"] as string) || "").toLowerCase().includes(s)
      );
    });

    res.json(result);
  } catch (err: any) {
    console.error("[admin] GET /family-ledger error:", err);
    res.status(500).json({ message: err?.message || "Failed to load family ledger" });
  }
});

// DELETE /bookings/:id — soft-delete a booking and its payments (super_admin only)
router.delete("/bookings/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const adminRole = req.user?.adminRole;
  if (adminRole !== "super_admin" && adminRole !== "accounts") return res.status(403).json({ error: "Only super_admin or accounts role can delete bookings" });
  const bookingId = req.params["id"] as string;
  try {
    const bRes = await pool.query(`SELECT id, booking_number, deleted_at FROM bookings WHERE id=$1 LIMIT 1`, [bookingId]);
    const booking = bRes.rows[0];
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.deleted_at) return res.status(422).json({ error: "Booking already deleted" });

    // Soft-delete all payments first
    await pool.query(
      `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deletion_reason='Booking deleted'
       WHERE booking_id=$1 AND is_deleted=false`,
      [bookingId]
    );
    // Void journal entries for all payments of this booking
    await pool.query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id IN
       (SELECT je.id FROM journal_entries je
        JOIN payment_transactions pt ON pt.id=je.source_id
        WHERE je.source='payment' AND pt.booking_id=$1)`,
      [bookingId]
    );
    await pool.query(
      `DELETE FROM journal_entries WHERE source='payment' AND source_id IN
       (SELECT id FROM payment_transactions WHERE booking_id=$1)`,
      [bookingId]
    );
    // Soft-delete the booking
    await pool.query(`UPDATE bookings SET deleted_at=NOW() WHERE id=$1`, [bookingId]);

    console.log(`[DELETE booking] bookingId=${bookingId} bookingNumber=${booking.booking_number} deletedBy=${req.user?.id}`);
    return res.json({ ok: true, message: "Booking deleted successfully." });
  } catch (e: any) {
    console.error("[DELETE booking] error:", e);
    return res.status(500).json({ error: e.message ?? "Failed to delete booking" });
  }
});

// One-time: delete test bookings + payments (browser-callable, requires admin login)
router.get("/clear-test-bookings", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Super admin only" });
  const nums = [
    'ABT26033710','ABT26034356','ABT26038022','ABT26033123','ABT26031895',
    'ABT26036960','ABT26035537','ABT26046308','ABT26046094','ABT26049541','ABT26047687'
  ];
  try {
    const p = await pool.query(
      `UPDATE payment_transactions SET is_deleted=true, deleted_at=NOW(), deletion_reason='Test data cleared'
       WHERE booking_id IN (SELECT id FROM bookings WHERE booking_number = ANY($1)) AND is_deleted=false`,
      [nums]
    );
    const b = await pool.query(
      `UPDATE bookings SET deleted_at=NOW() WHERE booking_number = ANY($1) AND deleted_at IS NULL`,
      [nums]
    );
    res.json({ ok: true, bookings_deleted: b.rowCount, payments_deleted: p.rowCount, message: "Test bookings cleared. Refresh the Payment Management page." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
