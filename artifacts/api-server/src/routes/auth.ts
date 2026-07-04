import { Router } from "express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, and, gt, lt, count, sql } from "drizzle-orm";
import {
  SendOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import { generateOtp, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";

export const ADMIN_MOBILES = ["9893989786", "9893225590", "8989701701", "9999999999"];

const router = Router();

// Rate limit: max 5 OTP requests per phone per 30 minutes
async function checkOtpRateLimit(mobile: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM otps WHERE mobile=$1 AND created_at > $2`,
    [mobile, cutoff]
  );
  const cnt = parseInt(result.rows[0]?.cnt || "0", 10);
  return cnt < 5;
}

router.post("/send-otp", async (req, res) => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid mobile number" });
    return;
  }
  const { mobile } = parsed.data;

  // Validate mobile: must be 10 digits
  const cleanMobile = mobile.replace(/\D/g, "");
  if (cleanMobile.length !== 10) {
    res.status(400).json({ message: "Please enter a valid 10-digit mobile number" });
    return;
  }

  // Rate limiting
  const withinLimit = await checkOtpRateLimit(cleanMobile);
  if (!withinLimit) {
    res.status(429).json({ message: "Too many OTP requests. Please wait 30 minutes before trying again." });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  const isNewUser = !existing[0];

  if (isNewUser) {
    await db.insert(usersTable).values({ mobile: cleanMobile, role: ADMIN_MOBILES.includes(cleanMobile) ? "admin" : "customer" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.insert(otpsTable).values({ mobile: cleanMobile, otp, expiresAt });

  const smsResult = await sendOtpSMS(cleanMobile, otp);

  // Send WhatsApp as backup (don't await)
  sendWhatsApp(
    cleanMobile,
    `Your Al Burhan Tours & Travels OTP is: *${otp}*\n\nValid for 5 minutes. Do not share with anyone.\n\nAl Burhan Tours & Travels\n+91 8989701701`
  ).catch(() => {});

  const isAdmin = ADMIN_MOBILES.includes(cleanMobile);

  const waSent = !!(process.env.BOTBEE_API_KEY && process.env.BOTBEE_PHONE_NUMBER_ID);
  console.log(`[OTP] Mobile: ${cleanMobile}, OTP: ${otp}, NewUser: ${isNewUser}, SMSSent: ${smsResult.sent}, Route: ${smsResult.route || "n/a"}, WhatsApp: ${waSent}, IsAdmin: ${isAdmin}${smsResult.error ? `, Error: ${smsResult.error}` : ""}`);

  // Sanitize error — strip any key-like tokens before sending to client
  const sanitizedError = smsResult.error
    ? smsResult.error.replace(/authorization=[^&]+/gi, "authorization=***").slice(0, 300)
    : undefined;

  res.json({
    message: smsResult.sent
      ? `OTP sent to your mobile number (via ${smsResult.route || "SMS"})`
      : waSent
        ? "OTP sent via WhatsApp. Please check your WhatsApp messages."
        : "OTP generated. SMS delivery failed — please contact support at +91 8989701701",
    requestId: `otp_${Date.now()}`,
    isNewUser,
    smsSent: smsResult.sent,
    smsRoute: smsResult.route,
    whatsappSent: waSent,
    // All users get a safe reason (no secrets)
    smsFailReason: smsResult.sent ? undefined : sanitizedError,
    // Admin phones get full debug info including the OTP
    ...(isAdmin ? {
      debugOtp: otp,
      smsStatus: smsResult.sent ? "delivered" : "failed",
      smsError: smsResult.error,
      smsProviderResponse: smsResult.providerResponse,
      smsUrlUsed: smsResult.urlUsed,
    } : {}),
  });
});

router.post("/verify-otp", async (req, res) => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { mobile, otp } = parsed.data;
  const cleanMobile = mobile.replace(/\D/g, "");
  const now = new Date();

  // Check for too many recent failed attempts (last 5 OTPs for this mobile)
  const recentAttempts = await pool.query(
    `SELECT attempts FROM otps WHERE mobile=$1 AND used=false AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, now]
  );
  const currentAttempts = parseInt(recentAttempts.rows[0]?.attempts || "0", 10);
  if (currentAttempts >= 5) {
    res.status(429).json({ message: "Too many failed attempts. Please request a new OTP." });
    return;
  }

  // Check if OTP is expired (but exists and unused)
  const expiredCheck = await pool.query(
    `SELECT id FROM otps WHERE mobile=$1 AND otp=$2 AND used=false AND expires_at <= $3 ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, otp, now]
  );
  if (expiredCheck.rows[0]) {
    res.status(401).json({ message: "OTP has expired. Please request a new OTP." });
    return;
  }

  // Check if OTP was already used
  const usedCheck = await pool.query(
    `SELECT id FROM otps WHERE mobile=$1 AND otp=$2 AND used=true ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, otp]
  );
  if (usedCheck.rows[0]) {
    res.status(401).json({ message: "This OTP has already been used. Please request a new OTP." });
    return;
  }

  // Find valid OTP
  const otpRecords = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.mobile, cleanMobile),
        eq(otpsTable.otp, otp),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!otpRecords[0]) {
    // Increment attempt counter on the most recent OTP
    await pool.query(
      `UPDATE otps SET attempts = COALESCE(attempts, 0) + 1 WHERE mobile=$1 AND used=false AND expires_at > $2`,
      [cleanMobile, now]
    );
    res.status(401).json({ message: "Invalid OTP. Please check and try again." });
    return;
  }

  // Mark OTP as used
  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpRecords[0].id));

  const users = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ message: "User not found. Please contact support." });
    return;
  }

  const isNewUser = !user.name;
  (req.session as any).userId = user.id;

  // Send welcome WhatsApp (don't await)
  if (isNewUser) {
    sendWhatsApp(
      cleanMobile,
      `Assalamu Alaikum! Welcome to Al Burhan Tours & Travels.\n\nWe are delighted to have you with us. With 35+ years of experience, we are here to guide you on your sacred journey.\n\nFor assistance, call us:\n+91 8989701701\n+91 9893989786\n\nJazak Allah Khair!`
    ).catch(() => {});
  } else {
    sendWhatsApp(
      cleanMobile,
      `Assalamu Alaikum ${user.name || ""},\n\nWelcome back to Al Burhan Tours & Travels! You have logged in successfully.\n\nFor assistance: +91 8989701701\n\nJazak Allah Khair!`
    ).catch(() => {});
  }

  console.log(`[OTP-VERIFY] Mobile: ${cleanMobile}, Success, NewUser: ${isNewUser}`);

  res.json({
    message: isNewUser ? "Registration successful" : "Login successful",
    isNewUser,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

router.patch("/profile", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { name, email } = req.body;

  if (!name && !email) {
    res.status(400).json({ message: "At least name or email is required" });
    return;
  }

  const updates: Partial<{ name: string; email: string; updatedAt: Date }> = { updatedAt: new Date() };
  if (name) updates.name = String(name).trim();
  if (email) updates.email = String(email).trim();

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    mobile: updated.mobile,
    email: updated.email,
    role: updated.role,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
  });
});

export default router;
