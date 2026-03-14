import { Router } from "express";
import { db, bookingsTable, usersTable, packagesTable, inquiriesTable } from "@workspace/db";
import { eq, count, sum, desc, and, sql } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendSMS, sendWhatsApp } from "../lib/notifications.js";

const router = Router();

router.get("/stats", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  const [totalBookings] = await db.select({ count: count() }).from(bookingsTable);
  const [pendingBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending"));
  const [approvedBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "approved"));
  const [confirmedBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "confirmed"));
  const [rejectedBookings] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "rejected"));
  const [revenue] = await db.select({ total: sum(bookingsTable.finalAmount) }).from(bookingsTable).where(eq(bookingsTable.status, "confirmed"));
  const [totalCustomers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "customer"));
  const [totalPackages] = await db.select({ count: count() }).from(packagesTable);

  const recentBookings = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(5);

  res.json({
    totalBookings: Number(totalBookings.count),
    pendingBookings: Number(pendingBookings.count),
    approvedBookings: Number(approvedBookings.count),
    confirmedBookings: Number(confirmedBookings.count),
    rejectedBookings: Number(rejectedBookings.count),
    totalRevenue: Number(revenue.total ?? 0),
    totalCustomers: Number(totalCustomers.count),
    totalPackages: Number(totalPackages.count),
    recentBookings: recentBookings.map(b => ({
      ...b,
      totalAmount: b.totalAmount ? Number(b.totalAmount) : null,
      gstAmount: b.gstAmount ? Number(b.gstAmount) : null,
      finalAmount: b.finalAmount ? Number(b.finalAmount) : null,
      createdAt: b.createdAt?.toISOString?.(),
      updatedAt: b.updatedAt?.toISOString?.(),
    })),
  });
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
    mobiles.flatMap(m => [sendWhatsApp(m, message), sendSMS(m, message)])
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

export default router;
