import { Router } from "express";
import { db, bookingsTable, usersTable, packagesTable, inquiriesTable } from "@workspace/db";
import { eq, count, sum, desc } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

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

export default router;
