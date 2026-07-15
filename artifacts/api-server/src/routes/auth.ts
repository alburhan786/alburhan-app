// @ts-nocheck
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
import { sendOTPEmail } from "../services/emailService.js";

export const ADMIN_MOBILES = ["9893989786", "9893225590", "8989701701"];

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

  // ── PRIMARY channel: Fast2SMS (DLT → Quick fallback) ───────────────────────
  // WhatsApp is a best-effort secondary notification only — it must NEVER
  // block or fail the OTP request. The 24h-window / template-only restriction
  // on WhatsApp Business API means it will legitimately fail for many users;
  // that is expected and must not be treated as a delivery failure.
  console.log(`[OTP-SEND][SMS] Calling sendOtpSMS with cleanMobile="${cleanMobile}", otp="${otp}"`);
  const smsResult = await sendOtpSMS(cleanMobile, otp);
  console.log(`[OTP-SEND][SMS] Result: sent=${smsResult.sent} route=${smsResult.route || "n/a"} error=${smsResult.error || "none"}`);

  const isAdmin = ADMIN_MOBILES.includes(cleanMobile);

  // Sanitize SMS error before sending to client — strip any API keys
  const sanitizedError = smsResult.error
    ? smsResult.error.replace(/authorization=[^&\s]+/gi, "authorization=***").slice(0, 400)
    : undefined;

  console.log(
    `[OTP-SEND] Summary: mobile=${cleanMobile} e164=+91${cleanMobile} newUser=${isNewUser} ` +
    `smsSent=${smsResult.sent} route=${smsResult.route || "n/a"} isAdmin=${isAdmin}` +
    (smsResult.error ? ` smsError=${smsResult.error}` : "")
  );

  // ── Respond immediately based on SMS result only — do not wait on WhatsApp ─
  res.json({
    success: smsResult.sent,
    message: smsResult.sent
      ? "OTP sent successfully"
      : "OTP delivery failed — please contact support at +91 8989701701",
    requestId: `otp_${Date.now()}`,
    isNewUser,
    smsSent: smsResult.sent,
    smsRoute: smsResult.route,
    smsFailReason: !smsResult.sent ? sanitizedError : undefined,
    // Admin phones: full debug including OTP and raw provider response (dev only)
    ...(isAdmin && process.env.NODE_ENV !== "production" ? {
      debugOtp: otp,
      smsStatus: smsResult.sent ? "delivered" : "failed",
      smsError: smsResult.error,
      smsProviderResponse: smsResult.providerResponse,
      smsUrlUsed: smsResult.urlUsed,
      smsLogId: smsResult.logId,
    } : {}),
  });

  // ── SECONDARY channel: WhatsApp — fire-and-forget, template-first ───────────
  // Template messages work even outside the 24h session window.
  // sendText() is only tried as a last resort for users who have an open session.
  // Any failure here is logged but never surfaces to the client.
  (async () => {
    try {
      const { sendTemplate, sendText } = await import("../lib/botbee.js");
      // Try approved OTP template first (works outside 24h window)
      const templateResult = await sendTemplate(
        cleanMobile,
        "otp_alburhan",   // approved template name in BotBee/Meta
        [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
        ],
        { eventType: "mobile_otp" }
      );
      if (templateResult.ok) {
        console.log(`[OTP-SEND][WhatsApp] Template sent ✓ (outside-window safe)`);
        return;
      }
      // If template fails (e.g. not approved yet), fall back to session text
      const waResult = await sendText(
        cleanMobile,
        `Your Al Burhan Tours & Travels OTP is: *${otp}*\n\nValid for 5 minutes. Do not share with anyone.\n\nAl Burhan Tours & Travels\n+91 8989701701`,
        { eventType: "mobile_otp" }
      );
      console.log(`[OTP-SEND][WhatsApp] Fallback text: ok=${waResult?.ok} err=${waResult?.errorMessage || "none"}`);
    } catch (err: any) {
      console.log(`[OTP-SEND][WhatsApp] Failed (secondary channel, ignored): ${err?.message || err}`);
    }
  })();

  // ── TERTIARY channel: Email OTP — fire-and-forget ─────────────────────────
  // Only fires if the customer already has an email address on their profile.
  // Never blocks the response or affects success/failure status.
  (async () => {
    try {
      const userEmail = existing[0]?.email;
      if (!userEmail) return;
      const userName = existing[0]?.name || "Pilgrim";
      const result = await sendOTPEmail(userEmail, userName, otp);
      console.log(`[OTP-SEND][Email] Sent to ${userEmail}: ok=${result.ok}${result.error ? ` err=${result.error}` : ""}`);
    } catch (err: any) {
      console.log(`[OTP-SEND][Email] Failed (tertiary channel, ignored): ${err?.message || err}`);
    }
  })();
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

// Fields that live on customer_profiles (extended KYC-style fields), keyed by request-body field name.
const EXTENDED_PROFILE_FIELDS = [
  "dateOfBirth", "gender", "address",
  "passportNumber", "passportIssueDate", "passportExpiryDate", "passportPlaceOfIssue",
  "aadharNumber", "panNumber",
] as const;

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.patch("/profile", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const body = req.body || {};
  const { name, email, blood_group, emergency_contact_name, emergency_contact_mobile } = body;

  const hasBasicField = [name, email, blood_group, emergency_contact_name, emergency_contact_mobile].some(v => v !== undefined && v !== null && v !== "");
  const hasExtendedField = EXTENDED_PROFILE_FIELDS.some(f => body[f] !== undefined && body[f] !== null && body[f] !== "");

  if (!hasBasicField && !hasExtendedField) {
    res.status(400).json({ message: "Please fill in at least one field before saving." });
    return;
  }

  if (email && !EMAIL_RX.test(email)) {
    res.status(400).json({ message: "Please enter a valid email address." });
    return;
  }
  if (emergency_contact_mobile && !/^[6-9]\d{9}$/.test(emergency_contact_mobile)) {
    res.status(400).json({ message: "Emergency contact mobile must be a valid 10-digit Indian number." });
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
    if (!r.rows[0]) {
      res.status(404).json({ message: "Your account could not be found. Please log in again." });
      return;
    }
    const u = r.rows[0];

    // Upsert extended (KYC-style) fields onto customer_profiles so the same "Save Details" form
    // can capture DOB, gender, address, passport, Aadhaar and PAN without a separate KYC submission.
    let extended: Record<string, any> = {};
    if (hasExtendedField) {
      const cols = EXTENDED_PROFILE_FIELDS.map(f => f.replace(/[A-Z]/g, c => "_" + c.toLowerCase()));
      const values = EXTENDED_PROFILE_FIELDS.map(f => body[f] ?? null);
      const setClauses = cols.map((c, i) => `${c} = COALESCE($${i + 3}, customer_profiles.${c})`).join(", ");
      const insertCols = cols.join(", ");
      const insertPlaceholders = cols.map((_, i) => `$${i + 3}`).join(", ");
      const extRes = await pool.query(
        `INSERT INTO customer_profiles (id, user_id, name, ${insertCols})
         VALUES (gen_random_uuid()::text, $1, $2, ${insertPlaceholders})
         ON CONFLICT (user_id) DO UPDATE SET ${setClauses}, updated_at = NOW()
         RETURNING ${cols.join(", ")}`,
        [req.user!.id, name || u.name || "", ...values]
      );
      extended = extRes.rows[0] || {};
    }

    res.json({
      id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role,
      blood_group: u.blood_group, emergency_contact_name: u.emergency_contact_name, emergency_contact_mobile: u.emergency_contact_mobile,
      ...extended,
    });
  } catch (err: any) {
    console.error(`[Profile] Save failed for user ${req.user?.id}:`, err.message);
    res.status(500).json({ message: "We couldn't save your details right now. Please try again in a moment." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out successfully" });
});

// ── Admin: reset OTP rate limit for a specific mobile (or all) ───────────────
// POST /api/auth/reset-otp-limit  { mobile?: "9876543210" }
// No mobile = clears ALL recent OTP rows (full reset)
router.post("/reset-otp-limit", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ message: "Admin only" });
    return;
  }
  const mobile = req.body?.mobile ? normaliseIndianMobile(String(req.body.mobile)) : null;
  try {
    let result;
    if (mobile) {
      result = await pool.query(
        `DELETE FROM otps WHERE mobile = $1 AND created_at > NOW() - INTERVAL '30 minutes'`,
        [mobile]
      );
      console.log(`[OTP-RESET] Cleared rate limit for ${mobile}: ${result.rowCount} rows deleted`);
      res.json({ ok: true, mobile, rowsDeleted: result.rowCount });
    } else {
      result = await pool.query(
        `DELETE FROM otps WHERE created_at > NOW() - INTERVAL '30 minutes'`
      );
      console.log(`[OTP-RESET] Cleared ALL recent OTP rows: ${result.rowCount} rows deleted`);
      res.json({ ok: true, mobile: "ALL", rowsDeleted: result.rowCount });
    }
  } catch (err: any) {
    console.error("[OTP-RESET] Failed:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/me", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, mobile, email, role, blood_group, emergency_contact_name, emergency_contact_mobile FROM users WHERE id = $1`,
      [req.user!.id]
    );
    const u = r.rows[0];
    if (!u) { res.status(404).json({ message: "User not found" }); return; }

    let extended: Record<string, any> = {};
    try {
      const extRes = await pool.query(
        `SELECT date_of_birth, gender, address, passport_number, passport_issue_date,
                passport_expiry_date, passport_place_of_issue, aadhar_number, pan_number
         FROM customer_profiles WHERE user_id = $1`,
        [req.user!.id]
      );
      extended = extRes.rows[0] || {};
    } catch (e) {
      console.error("[Profile] Failed to load extended profile:", (e as any).message);
    }

    res.json({
      id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role,
      blood_group: u.blood_group, emergency_contact_name: u.emergency_contact_name, emergency_contact_mobile: u.emergency_contact_mobile,
      dateOfBirth: extended.date_of_birth, gender: extended.gender, address: extended.address,
      passportNumber: extended.passport_number, passportIssueDate: extended.passport_issue_date,
      passportExpiryDate: extended.passport_expiry_date, passportPlaceOfIssue: extended.passport_place_of_issue,
      aadharNumber: extended.aadhar_number, panNumber: extended.pan_number,
    });
  } catch (err: any) {
    console.error(`[Profile] /me failed for user ${req.user?.id}:`, err.message);
    res.status(500).json({ message: "Could not load your profile. Please refresh and try again." });
  }
});

export default router;
