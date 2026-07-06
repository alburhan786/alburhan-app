import { Router } from "express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  SendOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import { generateOtp, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";

export const ADMIN_MOBILES = ["9893989786", "9893225590", "8989701701", "9999999999"];

const router = Router();

/**
 * Normalise any Indian mobile input → exactly 10 digits.
 * Accepts:  9876543210  |  +919876543210  |  919876543210  |  09876543210
 * Returns:  "9876543210" or "" if cannot be normalised.
 */
function normaliseIndianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) return digits.slice(2);
  if (digits.startsWith("0") && digits.length > 10) return digits.slice(1);
  return digits;
}

/**
 * Returns a human-readable rejection reason or null if valid.
 */
function rejectMobile(mobile: string): string | null {
  if (mobile.length !== 10) return `Mobile must be exactly 10 digits (got ${mobile.length})`;
  if (!/^[6-9]\d{9}$/.test(mobile)) return "Indian mobile numbers must start with 6, 7, 8, or 9";
  return null;
}

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
  // ── Log raw incoming payload for debugging ──────────────────────────────────
  const rawBody = req.body;
  console.log(`[OTP-SEND] Raw request body: ${JSON.stringify(rawBody)}`);

  const parsed = SendOtpBody.safeParse(rawBody);
  if (!parsed.success) {
    console.warn("[OTP-SEND] Zod parse failed:", parsed.error.issues);
    res.status(400).json({ message: "Invalid request — mobile field is required" });
    return;
  }

  // ── Normalise: accept +91/91/0 prefix or plain 10-digit ──────────────────
  const rawMobile: string = parsed.data.mobile ?? "";
  const cleanMobile = normaliseIndianMobile(rawMobile);

  console.log(`[OTP-SEND] Received: "${rawMobile}" → normalised: "${cleanMobile}" (E.164: +91${cleanMobile})`);

  // ── Validate ───────────────────────────────────────────────────────────────
  const rejection = rejectMobile(cleanMobile);
  if (rejection) {
    console.warn(`[OTP-SEND] Rejected "${rawMobile}": ${rejection}`);
    res.status(400).json({ message: `Invalid mobile number: ${rejection}` });
    return;
  }

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
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpsTable).values({ mobile: cleanMobile, otp, expiresAt });

  // ── Send SMS (DLT → Quick fallback) ────────────────────────────────────────
  console.log(`[OTP-SEND] Calling sendOtpSMS with cleanMobile="${cleanMobile}", otp="${otp}"`);
  const smsResult = await sendOtpSMS(cleanMobile, otp);
  console.log(`[OTP-SEND] SMS result: sent=${smsResult.sent} route=${smsResult.route || "n/a"} error=${smsResult.error || "none"}`);

  // ── Send WhatsApp as backup ────────────────────────────────────────────────
  let waSent = false;
  let waResult: Awaited<ReturnType<typeof sendWhatsApp>> | null = null;
  try {
    const waPromise = sendWhatsApp(
      cleanMobile,
      `Your Al Burhan Tours & Travels OTP is: *${otp}*\n\nValid for 5 minutes. Do not share with anyone.\n\nAl Burhan Tours & Travels\n+91 8989701701`
    );
    // sendWhatsApp returns SendResult (not boolean) — extract .ok
    const timedOut = new Promise<null>(r => setTimeout(() => r(null), 8000));
    waResult = await Promise.race([waPromise, timedOut]);
    waSent = waResult?.ok === true;
  } catch {
    waSent = false;
  }
  console.log(`[OTP-SEND] WhatsApp result: waSent=${waSent} ok=${waResult?.ok} err=${waResult?.errorMessage || "none"}`);

  const isAdmin = ADMIN_MOBILES.includes(cleanMobile);

  // Sanitize SMS error before sending to client — strip any API keys
  const sanitizedError = smsResult.error
    ? smsResult.error.replace(/authorization=[^&\s]+/gi, "authorization=***").slice(0, 400)
    : undefined;

  console.log(
    `[OTP-SEND] Summary: mobile=${cleanMobile} e164=+91${cleanMobile} newUser=${isNewUser} ` +
    `smsSent=${smsResult.sent} route=${smsResult.route || "n/a"} waSent=${waSent} isAdmin=${isAdmin}` +
    (smsResult.error ? ` smsError=${smsResult.error}` : "")
  );

  const delivered = smsResult.sent || waSent;
  res.json({
    success: delivered,
    message: smsResult.sent
      ? "OTP sent successfully"
      : waSent
        ? "OTP sent via WhatsApp. Please check your WhatsApp messages."
        : "OTP delivery failed — please contact support at +91 8989701701",
    requestId: `otp_${Date.now()}`,
    isNewUser,
    smsSent: smsResult.sent,
    smsRoute: smsResult.route,
    whatsappSent: waSent,
    smsFailReason: !smsResult.sent ? sanitizedError : undefined,
    // Admin phones: full debug including OTP and raw provider response
    ...(isAdmin ? {
      debugOtp: otp,
      smsStatus: smsResult.sent ? "delivered" : "failed",
      smsError: smsResult.error,
      smsProviderResponse: smsResult.providerResponse,
      smsUrlUsed: smsResult.urlUsed,
      smsLogId: smsResult.logId,
    } : {}),
  });
});

router.post("/verify-otp", async (req, res) => {
  const rawBody = req.body;
  console.log(`[OTP-VERIFY] Raw request body: mobile="${rawBody?.mobile}" otp="${rawBody?.otp}"`);

  const parsed = VerifyOtpBody.safeParse(rawBody);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const { otp } = parsed.data;

  // ── Normalise mobile (same logic as send-otp) ──────────────────────────────
  const rawMobile: string = parsed.data.mobile ?? "";
  const cleanMobile = normaliseIndianMobile(rawMobile);

  console.log(`[OTP-VERIFY] Received: "${rawMobile}" → normalised: "${cleanMobile}"`);

  const rejection = rejectMobile(cleanMobile);
  if (rejection) {
    console.warn(`[OTP-VERIFY] Rejected "${rawMobile}": ${rejection}`);
    res.status(400).json({ message: `Invalid mobile number: ${rejection}` });
    return;
  }

  const now = new Date();

  // Check for too many recent failed attempts
  const recentAttempts = await pool.query(
    `SELECT attempts FROM otps WHERE mobile=$1 AND used=false AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, now]
  );
  const currentAttempts = parseInt(recentAttempts.rows[0]?.attempts || "0", 10);
  if (currentAttempts >= 5) {
    res.status(429).json({ message: "Too many failed attempts. Please request a new OTP." });
    return;
  }

  // Check if OTP is expired
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
    await pool.query(
      `UPDATE otps SET attempts = COALESCE(attempts, 0) + 1 WHERE mobile=$1 AND used=false AND expires_at > $2`,
      [cleanMobile, now]
    );
    console.warn(`[OTP-VERIFY] Invalid OTP for mobile=${cleanMobile}`);
    res.status(401).json({ message: "Invalid OTP. Please check and try again." });
    return;
  }

  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otpRecords[0].id));

  const users = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ message: "User not found. Please contact support." });
    return;
  }

  const isNewUser = !user.name;
  (req.session as any).userId = user.id;

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

  console.log(`[OTP-VERIFY] Success: mobile=${cleanMobile} e164=+91${cleanMobile} newUser=${isNewUser} userId=${user.id}`);

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
  const { name, email, blood_group, emergency_contact_name, emergency_contact_mobile } = req.body;

  if (!name && !email && !blood_group && !emergency_contact_name && !emergency_contact_mobile) {
    res.status(400).json({ message: "At least one field is required" });
    return;
  }

  try {
    const r = await pool.query(
      `UPDATE users SET
        name = COALESCE(NULLIF($1,''), name),
        email = COALESCE(NULLIF($2,''), email),
        blood_group = COALESCE(NULLIF($3,''), blood_group),
        emergency_contact_name = COALESCE(NULLIF($4,''), emergency_contact_name),
        emergency_contact_mobile = COALESCE(NULLIF($5,''), emergency_contact_mobile),
        updated_at = NOW()
      WHERE id = $6 RETURNING id, name, mobile, email, role, blood_group, emergency_contact_name, emergency_contact_mobile`,
      [name ?? "", email ?? "", blood_group ?? "", emergency_contact_name ?? "", emergency_contact_mobile ?? "", req.user!.id]
    );
    const u = r.rows[0];
    res.json({ id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role, blood_group: u.blood_group, emergency_contact_name: u.emergency_contact_name, emergency_contact_mobile: u.emergency_contact_mobile });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update profile" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, mobile, email, role, blood_group, emergency_contact_name, emergency_contact_mobile FROM users WHERE id = $1`,
      [req.user!.id]
    );
    const u = r.rows[0];
    if (!u) { res.status(404).json({ message: "User not found" }); return; }
    res.json({ id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role, blood_group: u.blood_group, emergency_contact_name: u.emergency_contact_name, emergency_contact_mobile: u.emergency_contact_mobile });
  } catch {
    const user = req.user!;
    res.json({ id: user.id, name: user.name, mobile: user.mobile, email: user.email, role: user.role });
  }
});

export default router;
