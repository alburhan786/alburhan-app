// @ts-nocheck
import { Router } from "express";
import { db, feedbackTable, otpsTable, pilgrimsTable, hajjGroupsTable, bookingsTable } from "@workspace/db";
import { eq, and, gt, desc, count, avg, sql, gte } from "drizzle-orm";
import { requireAuth, requireAdmin, generateOtp, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { sendFeedbackReminders } from "../jobs/feedbackReminder.js";
import * as XLSX from "xlsx";

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

  console.log(`[Feedback OTP] Mobile: ${cleanedMobile}, SMS: ${smsSent}`);

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
  const { mobile,
    ratingOverall, ratingAccommodationMakkah1, ratingAccommodationMakkah2,
    ratingAccommodationMadinah, ratingTransportation, ratingFood, ratingGuide,
    ratingVisaDocumentation, comment, whatDidYouLike, suggestions, wouldRecommend,
    bookingId: clientBookingId,
  } = req.body;

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

  if (clientBookingId && clientBookingId !== bookingId) {
    const matched = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.bookingNumber, clientBookingId))
      .limit(1);

    if (!matched[0] || matched[0].customerMobile !== cleanedMobile) {
      res.status(403).json({ message: "Booking ID does not belong to your mobile number." });
      return;
    }
    bookingId = clientBookingId;
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

  if (!ratingOverall) {
    res.status(400).json({ message: "Overall rating is required." });
    return;
  }

  const allRatingFields = [ratingOverall, ratingAccommodationMakkah1, ratingAccommodationMakkah2,
    ratingAccommodationMadinah, ratingTransportation, ratingFood, ratingGuide, ratingVisaDocumentation];

  for (const r of allRatingFields) {
    if (r != null && (isNaN(Number(r)) || Number(r) < 1 || Number(r) > 5)) {
      res.status(400).json({ message: "Rating values must be between 1 and 5." });
      return;
    }
  }

  const ratings = allRatingFields.filter(r => r != null).map(Number);
  const isComplaint = ratings.some(r => r <= 3);

  try {
    const [inserted] = await db.insert(feedbackTable).values({
      pilgrimMobile: cleanedMobile,
      pilgrimName,
      bookingId,
      companyId,
      groupId,
      groupName,
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
    }).returning();

    // Route through Communication Engine for audit trail + analytics
    triggerWorkflow("feedback_received", {
      customerName: pilgrimName || "Pilgrim",
      customerMobile: cleanedMobile,
      bookingId: bookingId || undefined,
    }).catch(() => {});

    res.status(201).json({ success: true, id: inserted.id, isComplaint });
  } catch (err: any) {
    console.error("[Feedback Submit Error]", err?.message || err);
    res.status(500).json({ message: err?.message || "Failed to save feedback. Please try again." });
  }
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
    const [inProgressRow] = await db.select({ total: count() }).from(feedbackTable).where(and(eq(feedbackTable.isComplaint, true), eq(feedbackTable.status, "in_review")));
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

    const [serviceRow] = await db.select({
      accommodation1: avg(feedbackTable.ratingAccommodationMakkah1),
      accommodation2: avg(feedbackTable.ratingAccommodationMakkah2),
      accommodationMadinah: avg(feedbackTable.ratingAccommodationMadinah),
      transportation: avg(feedbackTable.ratingTransportation),
      food: avg(feedbackTable.ratingFood),
      guide: avg(feedbackTable.ratingGuide),
      visa: avg(feedbackTable.ratingVisaDocumentation),
      overall: avg(feedbackTable.ratingOverall),
    }).from(feedbackTable);

    const byCompanyRaw = await db
      .select({
        companyId: feedbackTable.companyId,
        cnt: count(),
        avgRating: avg(feedbackTable.ratingOverall),
      })
      .from(feedbackTable)
      .groupBy(feedbackTable.companyId);

    res.json({
      total: totalRow.total,
      avgRating: avgRow.avg ? Number(avgRow.avg).toFixed(1) : null,
      complaintsCount: complaintsRow.total,
      openComplaints: openRow.total,
      inProgressComplaints: inProgressRow.total,
      resolved: resolvedRow.total,
      resolvedToday: resolvedTodayRow.total,
      ratingDistribution: ratingDist,
      byServiceType: {
        "Accommodation (Aziziah)": serviceRow.accommodation1 ? Number(serviceRow.accommodation1).toFixed(1) : null,
        "Accommodation (Makkah 2)": serviceRow.accommodation2 ? Number(serviceRow.accommodation2).toFixed(1) : null,
        "Accommodation (Madinah)": serviceRow.accommodationMadinah ? Number(serviceRow.accommodationMadinah).toFixed(1) : null,
        "Transportation": serviceRow.transportation ? Number(serviceRow.transportation).toFixed(1) : null,
        "Food & Meals": serviceRow.food ? Number(serviceRow.food).toFixed(1) : null,
        "Guide / Tour Leader": serviceRow.guide ? Number(serviceRow.guide).toFixed(1) : null,
        "Visa & Documentation": serviceRow.visa ? Number(serviceRow.visa).toFixed(1) : null,
        "Overall Experience": serviceRow.overall ? Number(serviceRow.overall).toFixed(1) : null,
      },
      byCompany: byCompanyRaw.map(r => ({
        companyId: r.companyId || "unknown",
        count: r.cnt,
        avgRating: r.avgRating ? Number(r.avgRating).toFixed(1) : null,
      })),
    });
  }
);

router.get(
  "/admin/list",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { status, companyId, isComplaint, minRating, page = "1", limit = "50" } = req.query as Record<string, string>;

    const conditions = [];
    if (status && ["open", "in_review", "resolved", "closed"].includes(status)) {
      conditions.push(eq(feedbackTable.status, status as any));
    }
    if (companyId) conditions.push(eq(feedbackTable.companyId, companyId));
    if (isComplaint === "true") conditions.push(eq(feedbackTable.isComplaint, true));
    if (isComplaint === "false") conditions.push(eq(feedbackTable.isComplaint, false));
    if (minRating && !isNaN(parseInt(minRating))) {
      conditions.push(gte(feedbackTable.ratingOverall, parseInt(minRating)));
    }

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
  "/admin/group-bookings/:groupId",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { groupId } = req.params;
    const rows = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.groupId, groupId));

    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.customerMobile && r.bookingNumber) {
        map[r.customerMobile] = r.bookingNumber;
      }
    }
    res.json(map);
  }
);

/** Prevent spreadsheet formula injection: prefix cells that start with =, +, -, @, \t, \r */
function sanitizeCell(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) return `'${value}`;
  return value;
}

router.get(
  "/admin/export",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { status, companyId, isComplaint, minRating } = req.query as Record<string, string>;

    // Normalise: frontend sends "in_progress", DB stores "in_review"
    const normaliseStatus = (s: string) => (s === "in_progress" ? "in_review" : s);

    const conditions = [];
    if (status && ["open", "in_progress", "in_review", "resolved", "closed"].includes(status)) {
      conditions.push(eq(feedbackTable.status, normaliseStatus(status) as any));
    }
    if (companyId) conditions.push(eq(feedbackTable.companyId, companyId));
    if (isComplaint === "true") conditions.push(eq(feedbackTable.isComplaint, true));
    if (isComplaint === "false") conditions.push(eq(feedbackTable.isComplaint, false));
    if (minRating && !isNaN(parseInt(minRating))) {
      conditions.push(gte(feedbackTable.ratingOverall, parseInt(minRating)));
    }

    const rows = await db
      .select()
      .from(feedbackTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(feedbackTable.createdAt));

    const sheetData = rows.map(r => ({
      "Name": sanitizeCell(r.pilgrimName),
      "Mobile": sanitizeCell(r.pilgrimMobile),
      "Booking ID": sanitizeCell(r.bookingId),
      "Group": sanitizeCell(r.groupName),
      "Company": sanitizeCell(r.companyId),
      "Overall Rating": r.ratingOverall ?? "",
      "Accommodation (Aziziah)": r.ratingAccommodationMakkah1 ?? "",
      "Accommodation (Makkah 2)": r.ratingAccommodationMakkah2 ?? "",
      "Accommodation (Madinah)": r.ratingAccommodationMadinah ?? "",
      "Transportation": r.ratingTransportation ?? "",
      "Food & Meals": r.ratingFood ?? "",
      "Guide / Tour Leader": r.ratingGuide ?? "",
      "Visa & Documentation": r.ratingVisaDocumentation ?? "",
      "Comment": sanitizeCell(r.comment),
      "What They Liked": sanitizeCell(r.whatDidYouLike),
      "Suggestions": sanitizeCell(r.suggestions),
      "Would Recommend": sanitizeCell(r.wouldRecommend),
      "Is Complaint": r.isComplaint ? "Yes" : "No",
      "Status": r.status,
      "Assigned To": sanitizeCell(r.assignedTo),
      "Date": r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Auto-size columns
    const colWidths = Object.keys(sheetData[0] || {}).map(key => ({
      wch: Math.max(key.length, ...sheetData.map(r => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Feedback");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `feedback-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  }
);

router.get(
  "/admin/groups",
  requireAuth as any,
  requireAdmin as any,
  async (_req, res) => {
    const groups = await db
      .select({
        id: hajjGroupsTable.id,
        groupName: hajjGroupsTable.groupName,
        companyId: hajjGroupsTable.companyId,
        returnDate: hajjGroupsTable.returnDate,
        year: hajjGroupsTable.year,
      })
      .from(hajjGroupsTable)
      .orderBy(desc(hajjGroupsTable.returnDate));
    res.json(groups);
  }
);

router.post(
  "/send-reminders",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { groupId } = req.body;
    if (!groupId) {
      res.status(400).json({ message: "groupId is required" });
      return;
    }
    try {
      const result = await sendFeedbackReminders(groupId);
      res.json(result);
    } catch (err: any) {
      console.error("[FeedbackReminder] Manual trigger error:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to send feedback reminders" });
    }
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

const STATUS_ORDER: Record<string, number> = { open: 0, in_review: 1, resolved: 2, closed: 3 };

router.patch(
  "/admin/:id",
  requireAuth as any,
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const { status, assignedTo, internalNotes } = req.body;

    const current = await db.select().from(feedbackTable).where(eq(feedbackTable.id, req.params.id)).limit(1);
    if (!current[0]) {
      res.status(404).json({ message: "Feedback not found" });
      return;
    }

    const updates: Record<string, any> = { updatedAt: new Date() };

    if (status && ["open", "in_review", "resolved", "closed"].includes(status)) {
      const currentOrder = STATUS_ORDER[current[0].status] ?? 0;
      const newOrder = STATUS_ORDER[status] ?? 0;
      if (newOrder < currentOrder) {
        res.status(400).json({ message: `Cannot move status backward from "${current[0].status}" to "${status}".` });
        return;
      }
      updates.status = status;
    }

    if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;
    if (internalNotes !== undefined) updates.internalNotes = internalNotes || null;

    const [updated] = await db
      .update(feedbackTable)
      .set(updates)
      .where(eq(feedbackTable.id, req.params.id))
      .returning();

    res.json(updated);
  }
);

export default router;
