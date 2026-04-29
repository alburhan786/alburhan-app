import { Router } from "express";
import { db, feedbackTable, otpsTable, pilgrimsTable, hajjGroupsTable, bookingsTable } from "@workspace/db";
import { eq, and, gt, lt, desc, count, avg, sql, gte } from "drizzle-orm";
import { requireAuth, requireAdmin, generateOtp, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";

const router = Router();

function cleanMobile(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  return clean.slice(-10);
}

function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(cleanMobile(mobile));
}

router.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile || !isValidMobile(mobile)) {
    res.status(400).json({ message: "Invalid mobile number. Please enter a valid 10-digit Indian mobile number." });
    return;
  }

  const cleanedMobile = cleanMobile(mobile);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const recentOtps = await db
    .select({ id: otpsTable.id })
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.mobile, cleanedMobile),
        gt(otpsTable.createdAt, tenMinutesAgo)
      )
    );

  if (recentOtps.length >= 3) {
    res.status(429).json({ message: "Too many OTP requests. Please wait 10 minutes before trying again." });
    return;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpsTable).values({ mobile: cleanedMobile, otp, expiresAt });

  const smsSent = await sendOtpSMS(cleanedMobile, otp);
  sendWhatsApp(
    cleanedMobile,
    `Assalamu Alaikum! Your Al Burhan feedback verification OTP is: *${otp}*\n\nValid for 5 minutes. JazakAllah Khair.`
  ).catch(console.error);

  console.log(`[Feedback OTP] Mobile: ${cleanedMobile}, OTP: ${otp}, SMS: ${smsSent}`);

  res.json({ success: true, message: smsSent ? "OTP sent via SMS and WhatsApp" : "OTP sent via WhatsApp" });
});

router.post("/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    res.status(400).json({ message: "Mobile and OTP are required." });
    return;
  }

  const cleanedMobile = cleanMobile(mobile);
  const now = new Date();

  const otpRecord = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.mobile, cleanedMobile),
        eq(otpsTable.otp, otp.trim()),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, now)
      )
    )
    .orderBy(desc(otpsTable.createdAt))
    .limit(1);

  if (!otpRecord[0]) {
    res.status(401).json({ verified: false, message: "Invalid or expired OTP. Please try again." });
    return;
  }

  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpRecord[0].id));

  const pilgrims = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.mobileIndia, cleanedMobile))
    .limit(1);

  let pilgrimName: string | null = null;
  let groupId: string | null = null;
  let groupName: string | null = null;
  let companyId: string | null = null;
  let bookingId: string | null = null;

  if (pilgrims[0]) {
    pilgrimName = pilgrims[0].fullName;
    groupId = pilgrims[0].groupId;

    const groups = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, pilgrims[0].groupId))
      .limit(1);

    if (groups[0]) {
      groupName = groups[0].groupName;
      companyId = groups[0].companyId ?? null;
    }
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.customerMobile, cleanedMobile))
    .orderBy(desc(bookingsTable.createdAt))
    .limit(1);

  if (bookings[0]) {
    bookingId = bookings[0].bookingNumber;
  }

  res.json({
    verified: true,
    mobile: cleanedMobile,
    pilgrimName,
    bookingId,
    companyId,
    groupId,
    groupName,
  });
});

router.post("/submit", async (req, res) => {
  const { mobile, verifiedToken, pilgrimName, bookingId, companyId, groupId, groupName,
    ratingOverall, ratingAccommodationMakkah1, ratingAccommodationMakkah2,
    ratingAccommodationMadinah, ratingTransportation, ratingFood, ratingGuide,
    ratingVisaDocumentation, comment, whatDidYouLike, suggestions, wouldRecommend } = req.body;

  if (!mobile) {
    res.status(400).json({ message: "Mobile number is required." });
    return;
  }

  const cleanedMobile = cleanMobile(mobile);

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const recentVerified = await db
    .select({ id: otpsTable.id })
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.mobile, cleanedMobile),
        eq(otpsTable.used, true),
        gt(otpsTable.createdAt, thirtyMinutesAgo)
      )
    )
    .limit(1);

  if (!recentVerified[0]) {
    res.status(401).json({ message: "OTP verification expired. Please verify your mobile again." });
    return;
  }

  if (bookingId) {
    const existing = await db
      .select({ id: feedbackTable.id })
      .from(feedbackTable)
      .where(eq(feedbackTable.bookingId, bookingId))
      .limit(1);

    if (existing[0]) {
      res.status(409).json({ message: "Feedback for this booking has already been submitted. JazakAllah for your time!" });
      return;
    }
  }

  const ratings = [ratingOverall, ratingAccommodationMakkah1, ratingAccommodationMakkah2,
    ratingAccommodationMadinah, ratingTransportation, ratingFood, ratingGuide, ratingVisaDocumentation]
    .filter(r => r != null && !isNaN(Number(r)))
    .map(Number);

  const isComplaint = ratings.some(r => r <= 3);

  const [inserted] = await db.insert(feedbackTable).values({
    pilgrimMobile: cleanedMobile,
    pilgrimName: pilgrimName || null,
    bookingId: bookingId || null,
    companyId: companyId || null,
    groupId: groupId || null,
    groupName: groupName || null,
    ratingOverall: ratingOverall ? Number(ratingOverall) : null,
    ratingAccommodationMakkah1: ratingAccommodationMakkah1 ? Number(ratingAccommodationMakkah1) : null,
    ratingAccommodationMakkah2: ratingAccommodationMakkah2 ? Number(ratingAccommodationMakkah2) : null,
    ratingAccommodationMadinah: ratingAccommodationMadinah ? Number(ratingAccommodationMadinah) : null,
    ratingTransportation: ratingTransportation ? Number(ratingTransportation) : null,
    ratingFood: ratingFood ? Number(ratingFood) : null,
    ratingGuide: ratingGuide ? Number(ratingGuide) : null,
    ratingVisaDocumentation: ratingVisaDocumentation ? Number(ratingVisaDocumentation) : null,
    comment: comment || null,
    whatDidYouLike: whatDidYouLike || null,
    suggestions: suggestions || null,
    wouldRecommend: wouldRecommend || null,
    isComplaint,
    status: "open",
  }).returning();

  res.status(201).json({ success: true, id: inserted.id, isComplaint });
});

router.get(
  "/admin/stats",
  requireAuth as any,
  requireAdmin as any,
  async (_req, res) => {
    const [totalRow] = await db.select({ total: count() }).from(feedbackTable);
    const [avgRow] = await db.select({ avg: avg(feedbackTable.ratingOverall) }).from(feedbackTable);
    const [complaintsRow] = await db.select({ total: count() }).from(feedbackTable).where(eq(feedbackTable.isComplaint, true));
    const [openRow] = await db.select({ total: count() }).from(feedbackTable).where(and(eq(feedbackTable.isComplaint, true), eq(feedbackTable.status, "open")));
    const [inProgressRow] = await db.select({ total: count() }).from(feedbackTable).where(and(eq(feedbackTable.isComplaint, true), eq(feedbackTable.status, "in_progress")));
    const [resolvedRow] = await db.select({ total: count() }).from(feedbackTable).where(eq(feedbackTable.status, "resolved"));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [resolvedTodayRow] = await db.select({ total: count() }).from(feedbackTable).where(and(eq(feedbackTable.status, "resolved"), gte(feedbackTable.updatedAt, todayStart)));

    const ratingDist = await db
      .select({ rating: feedbackTable.ratingOverall, cnt: count() })
      .from(feedbackTable)
      .where(sql`${feedbackTable.ratingOverall} IS NOT NULL`)
      .groupBy(feedbackTable.ratingOverall)
      .orderBy(feedbackTable.ratingOverall);

    res.json({
      total: totalRow.total,
      avgRating: avgRow.avg ? Number(avgRow.avg).toFixed(1) : null,
      complaintsCount: complaintsRow.total,
      openComplaints: openRow.total,
      inProgressComplaints: inProgressRow.total,
      resolved: resolvedRow.total,
      resolvedToday: resolvedTodayRow.total,
      ratingDistribution: ratingDist,
    });
  }
);

router.get(
  "/admin/list",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { status, companyId, isComplaint, page = "1", limit = "50" } = req.query as Record<string, string>;

    const conditions = [];
    if (status && ["open", "in_progress", "resolved"].includes(status)) {
      conditions.push(eq(feedbackTable.status, status as any));
    }
    if (companyId) conditions.push(eq(feedbackTable.companyId, companyId));
    if (isComplaint === "true") conditions.push(eq(feedbackTable.isComplaint, true));
    if (isComplaint === "false") conditions.push(eq(feedbackTable.isComplaint, false));

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    const rows = await db
      .select()
      .from(feedbackTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(feedbackTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [totalRow] = await db
      .select({ total: count() })
      .from(feedbackTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({ data: rows, total: totalRow.total, page: pageNum, limit: limitNum });
  }
);

router.get(
  "/admin/:id",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const rows = await db.select().from(feedbackTable).where(eq(feedbackTable.id, req.params.id)).limit(1);
    if (!rows[0]) {
      res.status(404).json({ message: "Feedback not found" });
      return;
    }
    res.json(rows[0]);
  }
);

router.patch(
  "/admin/:id",
  requireAuth as any,
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const { status, assignedTo, internalNotes } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status && ["open", "in_progress", "resolved"].includes(status)) updates.status = status;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;
    if (internalNotes !== undefined) updates.internalNotes = internalNotes || null;

    const [updated] = await db
      .update(feedbackTable)
      .set(updates)
      .where(eq(feedbackTable.id, req.params.id))
      .returning();

    if (!updated) {
      res.status(404).json({ message: "Feedback not found" });
      return;
    }
    res.json(updated);
  }
);

export default router;
