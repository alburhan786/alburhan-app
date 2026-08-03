// @ts-nocheck
import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db, usersTable, otpsTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  SendOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import { generateOtp, requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendOtpSMS, sendWhatsApp } from "../lib/notifications.js";
import { sendOTPEmail, sendGenericEmail } from "../services/emailService.js";

/** SHA-256 hash of otp:mobile — used to store OTPs without plaintext in DB */
function hashOtp(otp: string, mobile: string): string {
  return createHash("sha256").update(`${otp}:${mobile}`).digest("hex");
}

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

// Rate limit: max 5 OTP requests per phone per 30 minutes (skipped in dev)
async function checkOtpRateLimit(mobile: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
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

  // ── Portal isolation ──────────────────────────────────────────────────────
  // Each login portal must ONLY authenticate the account type it owns.
  // A staff/agent/branch/admin mobile must never produce a session on the
  // customer portal, and vice-versa.
  const requestedPortal: string = ((req.body?.portal as string) || "customer").trim().toLowerCase();
  const VALID_PORTALS = ["customer", "agent", "branch", "staff", "admin"];
  if (!VALID_PORTALS.includes(requestedPortal)) {
    res.status(400).json({ message: "Invalid portal type." });
    return;
  }
  const PORTAL_ALLOWED_ROLES: Record<string, string[]> = {
    customer: ["customer"],
    agent: ["agent"],
    branch: ["branch_manager"],
    staff: ["staff"],
    admin: ["admin", "super_admin"],
  };
  const PORTAL_ERROR: Record<string, string> = {
    customer: "No customer account found for this mobile number.",
    agent: "This mobile number is not registered as an agent.",
    branch: "This mobile number is not registered as a branch manager.",
    staff: "This mobile number is not registered as a staff member.",
    admin: "This mobile number does not have admin access.",
  };

  // Determine actual role: for new users probe entity tables; for existing users read from DB.
  let actualRole: string;
  if (isNewUser) {
    let detectedRole: "admin" | "customer" | "branch_manager" | "agent" | "staff" =
      ADMIN_MOBILES.includes(cleanMobile) ? "admin" : "customer";
    if (detectedRole === "customer") {
      const [branchRow, agentRow, staffRow] = await Promise.all([
        pool.query(`SELECT id FROM branches WHERE manager_mobile=$1 AND is_active=true LIMIT 1`, [cleanMobile]),
        pool.query(`SELECT id FROM agents WHERE mobile=$1 AND is_active=true LIMIT 1`, [cleanMobile]),
        pool.query(`SELECT id FROM staff WHERE mobile_india=$1 AND status='active' LIMIT 1`, [cleanMobile]),
      ]);
      if (branchRow.rows[0]) detectedRole = "branch_manager";
      else if (agentRow.rows[0]) detectedRole = "agent";
      else if (staffRow.rows[0]) detectedRole = "staff";
    }
    actualRole = detectedRole;
  } else {
    actualRole = existing[0].role as string;
  }

  // Enforce portal isolation — reject if the mobile does not belong to this portal.
  const allowedRoles = PORTAL_ALLOWED_ROLES[requestedPortal] || ["customer"];
  if (!allowedRoles.includes(actualRole)) {
    const _ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    pool.query(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_table, entity_id, old_value, new_value, ip, created_at)
       VALUES (gen_random_uuid()::text, 'system', $1, 'created', 'login_attempts', gen_random_uuid()::text, NULL, $2::jsonb, $3, NOW())`,
      [cleanMobile, JSON.stringify({ event: "otp_portal_mismatch", portal: requestedPortal, mobile: cleanMobile, actual_role: actualRole }), _ip]
    ).catch(() => {});
    console.warn(`[OTP-SEND] SECURITY: mobile=${cleanMobile} requested_portal=${requestedPortal} actual_role=${actualRole} → REJECTED`);
    res.status(403).json({ message: PORTAL_ERROR[requestedPortal] || "Access denied." });
    return;
  }

  if (isNewUser) {
    await db.insert(usersTable).values({ mobile: cleanMobile, role: actualRole as any });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // ── Store hashed OTP — never persist plaintext OTP in the database ───────────
  const otpHash = hashOtp(otp, cleanMobile);
  const otpId   = randomBytes(8).toString("hex");
  await pool.query(
    `INSERT INTO otps (id, mobile, otp, otp_hash, expires_at, purpose) VALUES ($1,$2,$3,$4,$5,$6)`,
    [otpId, cleanMobile, "[hashed]", otpHash, expiresAt, requestedPortal]
  );

  const isAdmin = ADMIN_MOBILES.includes(cleanMobile);

  // ── OTP delivery chain: SMS (DLT) → WhatsApp → Email ─────────────────────
  // Order rationale:
  //   SMS  — DLT-registered, works on ALL Indian networks, synchronous confirmation.
  //   WA   — fire-and-forget session message; only works within 24h session window.
  //   Email— last resort; only if account has a registered email address.
  //   RCS  — intentionally excluded from OTP chain. LeminAI returns ok:true for
  //          every accepted HTTP request regardless of network delivery (Jio-only),
  //          which would silently absorb the request and skip SMS entirely.
  //
  // Try each channel in order. Stop and respond after the first success.
  // Never send on multiple channels simultaneously — OTP must not be
  // delivered more than once per request.

  // Helper: log each attempt to notification_logs for a full audit trail
  const logOtpAttempt = (channel: string, provider: string, status: string, detail: string) =>
    pool.query(
      `INSERT INTO notification_logs
         (id, event_type, channel, recipient, message, status, provider_name, sent_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [`otp_${channel}_${Date.now()}`, `${requestedPortal}_login_otp`, channel, cleanMobile, detail, status, provider]
    ).catch(() => {});

  // 1. SMS — DLT Fast2SMS (primary, most reliable for all Indian numbers)
  const smsResult = await sendOtpSMS(cleanMobile, otp);
  if (smsResult.sent) {
    console.log(`[OTP-SEND] ✓ SMS delivered provider=Fast2SMS route=${smsResult.route || "dlt"} mobile=${cleanMobile}`);
    await logOtpAttempt("sms", "Fast2SMS", "sent", `route=${smsResult.route || "dlt"}`);
    res.json({ success: true, message: "OTP sent via SMS", requestId: `otp_${Date.now()}`, isNewUser, channel: "sms", smsRoute: smsResult.route });
    return;
  }
  const sanitizedSmsError = smsResult.error
    ? smsResult.error.replace(/authorization=[^&\s]+/gi, "authorization=***").slice(0, 400)
    : "SMS provider rejected the request";
  console.log(`[OTP-SEND] SMS failed: ${sanitizedSmsError} → trying WhatsApp`);
  await logOtpAttempt("sms", "Fast2SMS", "failed", sanitizedSmsError);

  // 2. WhatsApp — BotBee session message (works only if user has active 24h session)
  // Using sendText (not template) — AUTHENTICATION template positional vars {{1}} are
  // mis-mapped by BotBee as #!1!#, causing pre-validation failure. Session text bypasses this.
  try {
    const { sendText } = await import("../lib/botbee.js");
    const waMessage = `Your Al Burhan Tours & Travels OTP is *${otp}*. Valid for 5 minutes. Do not share with anyone.`;
    const waResult = await sendText(cleanMobile, waMessage);
    if (waResult?.ok) {
      console.log(`[OTP-SEND] ✓ WhatsApp session OTP delivered mobile=${cleanMobile}`);
      await logOtpAttempt("whatsapp", "BotBee", "sent", "session message");
      res.json({ success: true, message: "SMS unavailable. OTP sent to your WhatsApp", requestId: `otp_${Date.now()}`, isNewUser, channel: "whatsapp" });
      return;
    }
    const waError = waResult?.error || "no active 24h session";
    console.log(`[OTP-SEND] WhatsApp failed: ${waError} → trying Email`);
    await logOtpAttempt("whatsapp", "BotBee", "failed", waError);
  } catch (waErr: any) {
    console.log(`[OTP-SEND] WhatsApp error: ${waErr?.message} → trying Email`);
    await logOtpAttempt("whatsapp", "BotBee", "failed", waErr?.message || "exception");
  }

  // 3. Email — last resort; only if account has a registered email address
  const userEmail = existing[0]?.email;
  if (userEmail) {
    try {
      const userName = existing[0]?.name || "Pilgrim";
      const emailResult = await sendOTPEmail(userEmail, userName, otp);
      if (emailResult.ok) {
        console.log(`[OTP-SEND] ✓ Email OTP delivered to ${userEmail}`);
        await logOtpAttempt("email", "SMTP", "sent", `to=${userEmail}`);
        res.json({ success: true, message: "OTP sent to your registered email", requestId: `otp_${Date.now()}`, isNewUser, channel: "email" });
        return;
      }
      await logOtpAttempt("email", "SMTP", "failed", emailResult.error || "SMTP error");
    } catch (emailErr: any) {
      console.log(`[OTP-SEND] Email failed: ${emailErr?.message}`);
      await logOtpAttempt("email", "SMTP", "failed", emailErr?.message || "exception");
    }
  }

  // All channels failed — log with reference ID, return structured error
  const referenceId = `otp_fail_${Date.now()}`;
  console.error(`[OTP-SEND] ALL CHANNELS FAILED mobile=${cleanMobile} ref=${referenceId} smsErr=${sanitizedSmsError}`);
  await logOtpAttempt("all", "none", "failed", `ref=${referenceId} smsErr=${sanitizedSmsError}`);
  res.json({
    success: false,
    allChannelsFailed: true,
    message: "OTP delivery failed — please contact support at +91 9893225590",
    referenceId,
    requestId: referenceId,
    isNewUser,
    ...(isAdmin ? { smsFailReason: sanitizedSmsError } : {}),
  });
});

router.post("/verify-otp", async (req, res) => {
  const rawBody = req.body;
  // Never log the OTP value — only log mobile (masked)
  const maskedMobile = String(rawBody?.mobile || "").slice(-4).padStart(10, "*");
  console.log(`[OTP-VERIFY] Request for mobile=****${maskedMobile}`);

  const parsed = VerifyOtpBody.safeParse(rawBody);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const { otp } = parsed.data;

  // ── Normalise mobile (same logic as send-otp) ──────────────────────────────
  const rawMobile: string = parsed.data.mobile ?? "";
  const cleanMobile = normaliseIndianMobile(rawMobile);

  const rejection = rejectMobile(cleanMobile);
  if (rejection) {
    res.status(400).json({ message: `Invalid mobile number: ${rejection}` });
    return;
  }

  // Portal the client claims to be logging into (must match send-otp portal)
  const requestedPortalVerify: string = ((req.body?.portal as string) || "customer").trim().toLowerCase();

  const now     = new Date();
  const otpHash = hashOtp(otp, cleanMobile);

  // ── Staging OTP bypass ────────────────────────────────────────────────────
  // ONLY active when ALL three conditions hold simultaneously:
  //   1. NODE_ENV is NOT "production"
  //   2. STAGING_OTP_BYPASS env var is exactly "true"
  //   3. The submitted OTP is exactly "000000"
  // This allows automated test suites to authenticate without receiving a
  // real SMS. The NODE_ENV guard makes it structurally impossible to
  // activate in production regardless of env var configuration.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.STAGING_OTP_BYPASS === "true" &&
    otp === "000000"
  ) {
    console.warn(
      `[OTP-VERIFY] ⚠️  STAGING BYPASS ACTIVE — test OTP 000000 accepted for ` +
      `mobile=****${maskedMobile}. This code path is unreachable in production ` +
      `(NODE_ENV=${process.env.NODE_ENV}).`
    );
    const bypassUsers = await db.select().from(usersTable)
      .where(eq(usersTable.mobile, cleanMobile)).limit(1);
    const bypassUser = bypassUsers[0];
    if (!bypassUser) {
      res.status(401).json({ message: "User not found. Please contact support." });
      return;
    }
    const BYPASS_PORTAL_ROLES: Record<string, string[]> = {
      customer: ["customer"],
      agent: ["agent"],
      branch: ["branch_manager"],
      staff: ["staff"],
      admin: ["admin", "super_admin"],
    };
    const bypassAllowed = BYPASS_PORTAL_ROLES[requestedPortalVerify] || ["customer"];
    if (!bypassAllowed.includes(bypassUser.role as string)) {
      console.warn(`[OTP-VERIFY] BYPASS: portal role mismatch portal=${requestedPortalVerify} role=${bypassUser.role}`);
      res.status(403).json({ message: "Access denied — portal role mismatch." });
      return;
    }
    (req.session as any).userId = bypassUser.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err: Error | null) => (err ? reject(err) : resolve()))
    );
    console.log(`[OTP-VERIFY] BYPASS success: userId=${bypassUser.id} role=${bypassUser.role}`);
    res.json({
      message: "Login successful",
      isNewUser: false,
      _stagingBypass: true,
      user: {
        id: bypassUser.id,
        name: bypassUser.name,
        mobile: bypassUser.mobile,
        email: bypassUser.email,
        role: bypassUser.role,
        createdAt: bypassUser.createdAt,
      },
      entityId: null,
    });
    return;
  }
  // ── End staging bypass ────────────────────────────────────────────────────

  // All OTP lookups match either hashed (new rows) OR plaintext (legacy rows).
  // Parameter order: $1=mobile, $2=otpHash, $3=otp, $4=timestamp_where_needed.

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
    `SELECT id FROM otps
     WHERE mobile=$1 AND (otp_hash=$2 OR (otp_hash IS NULL AND otp=$3))
       AND used=false AND expires_at <= $4
     ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, otpHash, otp, now]
  );
  if (expiredCheck.rows[0]) {
    res.status(401).json({ message: "OTP has expired. Please request a new OTP." });
    return;
  }

  // Check if OTP was already used
  const usedCheck = await pool.query(
    `SELECT id FROM otps
     WHERE mobile=$1 AND (otp_hash=$2 OR (otp_hash IS NULL AND otp=$3))
       AND used=true
     ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, otpHash, otp]
  );
  if (usedCheck.rows[0]) {
    res.status(401).json({ message: "This OTP has already been used. Please request a new OTP." });
    return;
  }

  // Find valid OTP (hash-first, plaintext fallback for legacy rows)
  // Require matching purpose (IS NULL fallback accepts pre-isolation legacy rows)
  const otpRecord = await pool.query(
    `SELECT id FROM otps
     WHERE mobile=$1 AND (otp_hash=$2 OR (otp_hash IS NULL AND otp=$3))
       AND used=false AND expires_at > $4
       AND (purpose IS NULL OR purpose=$5)
     ORDER BY created_at DESC LIMIT 1`,
    [cleanMobile, otpHash, otp, now, requestedPortalVerify]
  );

  if (!otpRecord.rows[0]) {
    await pool.query(
      `UPDATE otps SET attempts = COALESCE(attempts, 0) + 1 WHERE mobile=$1 AND used=false AND expires_at > $2`,
      [cleanMobile, now]
    );
    console.warn(`[OTP-VERIFY] Invalid OTP attempt for mobile=${cleanMobile}`);
    res.status(401).json({ message: "Invalid OTP. Please check and try again." });
    return;
  }

  await pool.query(`UPDATE otps SET used=true WHERE id=$1`, [otpRecord.rows[0].id]);

  const users = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ message: "User not found. Please contact support." });
    return;
  }

  // ── Portal isolation (second gate) ───────────────────────────────────────
  // Even if the OTP matched, reject if the user's stored role does not belong
  // to the portal they are logging into (prevents role escalation via stale sessions).
  const VERIFY_PORTAL_ROLES: Record<string, string[]> = {
    customer: ["customer"],
    agent: ["agent"],
    branch: ["branch_manager"],
    staff: ["staff"],
    admin: ["admin", "super_admin"],
  };
  const verifyAllowedRoles = VERIFY_PORTAL_ROLES[requestedPortalVerify] || ["customer"];
  if (!verifyAllowedRoles.includes(user.role as string)) {
    const _secIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    pool.query(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_table, entity_id, old_value, new_value, ip, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'created', 'login_attempts', gen_random_uuid()::text, NULL, $3::jsonb, $4, NOW())`,
      [user.id, user.mobile, JSON.stringify({ event: "verify_portal_mismatch", portal: requestedPortalVerify, mobile: cleanMobile, user_role: user.role }), _secIp]
    ).catch(() => {});
    console.warn(`[OTP-VERIFY] SECURITY: mobile=${cleanMobile} requested_portal=${requestedPortalVerify} user_role=${user.role} → REJECTED (403)`);
    res.status(403).json({ message: "Access denied — this account does not have permission to access this portal." });
    return;
  }

  // Audit: record successful login
  const _loginIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  pool.query(
    `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_table, entity_id, old_value, new_value, ip, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, 'created', 'login_attempts', gen_random_uuid()::text, NULL, $3::jsonb, $4, NOW())`,
    [user.id, user.mobile, JSON.stringify({ event: "login_success", portal: requestedPortalVerify, mobile: cleanMobile, user_role: user.role }), _loginIp]
  ).catch(() => {});

  // Admin and super_admin users are never treated as "new users" regardless of
  // whether their name field is set — they always go straight to the admin portal.
  const isAdminRole = user.role === "admin" || user.role === "super_admin";
  const isNewUser = !user.name && !isAdminRole;
  (req.session as any).userId = user.id;

  // Resolve entityId for portal roles (branch_manager / agent / staff)
  let entityId: string | null = null;
  if (user.role === "branch_manager") {
    const r = await pool.query(`SELECT id FROM branches WHERE manager_mobile=$1 LIMIT 1`, [cleanMobile]);
    entityId = r.rows[0]?.id ?? null;
  } else if (user.role === "agent") {
    const r = await pool.query(`SELECT id FROM agents WHERE mobile=$1 LIMIT 1`, [cleanMobile]);
    entityId = r.rows[0]?.id ?? null;
  } else if (user.role === "staff") {
    const r = await pool.query(`SELECT id FROM staff WHERE mobile_india=$1 LIMIT 1`, [cleanMobile]);
    entityId = r.rows[0]?.id ?? null;
  }
  if (entityId) (req.session as any).entityId = entityId;

  if (isNewUser) {
    sendWhatsApp(
      cleanMobile,
      `Assalamu Alaikum! Welcome to Al Burhan Tours & Travels.\n\nWe are delighted to have you with us. With 35+ years of experience, we are here to guide you on your sacred journey.\n\nFor assistance, call us:\n+91 8989701701\n+91 9893989786\n\nJazak Allah Khair!`
    ).catch(() => {});

    // Send welcome email if customer already has an email on profile
    if (user.email) {
      sendGenericEmail(
        user.email,
        "Welcome to Al Burhan Tours & Travels",
        `
          <p>Assalamu Alaikum! 🌙</p>
          <p>Welcome to <strong>Al Burhan Tours &amp; Travels</strong> — your trusted partner for Hajj &amp; Umrah for over 35 years.</p>
          <p>Your account has been created successfully. You can now:</p>
          <ul style="line-height:1.9;color:#374151;font-size:14px;">
            <li>Browse and book Hajj &amp; Umrah packages</li>
            <li>Complete your travel profile</li>
            <li>Upload your passport and documents</li>
            <li>Track your booking and journey status</li>
          </ul>
          <p style="margin-top:24px;">
            <a href="https://alburhantravels.com/dashboard"
               style="background:#0B5D3B;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">
              Go to Your Dashboard
            </a>
          </p>
          <p style="margin-top:24px;font-size:13px;color:#6b7280;">
            Need help? Call us on <strong>+91 9893225590</strong> or email
            <a href="mailto:info@alburhantravels.com" style="color:#0B5D3B;">info@alburhantravels.com</a>
          </p>
          <p style="font-size:13px;color:#6b7280;">Jazak Allah Khair! — Al Burhan Tours &amp; Travels</p>
        `,
        { title: "Welcome to Al Burhan Tours & Travels", preheader: "Your Hajj & Umrah journey begins here" }
      ).catch(() => {});
    }
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
    entityId,
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

// ── Admin: email-based account recovery (for admin lockout) ──────────────────
// POST /api/auth/admin-recovery  { mobile }
// Security design:
//   - All public non-400 responses are identical (same message, min 1500ms) regardless of
//     whether mobile is in ADMIN_MOBILES, whether user/role/email exist, or whether SMTP worked.
//     This prevents both message-based and timing-based account enumeration.
//   - DB role check (admin/super_admin) is the authoritative gate before issuing any token.
//   - Per-mobile rate limit: max 3 per hour (DB-backed).
//   - Per-IP rate limit: max 10 per hour (in-memory, resets on restart).
//   - Prior unused recovery tokens for the mobile are invalidated before issuing a new one.
//   - SMTP failure: token invalidated immediately, same generic response returned.

const RECOVERY_GENERIC_MSG = "If this number is registered with admin access and has an email on file, a recovery link has been sent.";

/** In-memory per-IP rate limit: max 10 requests per RECOVERY_IP_WINDOW_MS */
const RECOVERY_IP_LIMIT    = 10;
const RECOVERY_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const recoveryIpBucket = new Map<string, { count: number; resetAt: number }>();
function recoveryIpAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = recoveryIpBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    recoveryIpBucket.set(ip, { count: 1, resetAt: now + RECOVERY_IP_WINDOW_MS });
    return true;
  }
  if (entry.count >= RECOVERY_IP_LIMIT) return false;
  entry.count++;
  return true;
}

router.post("/admin-recovery", async (req, res) => {
  const rawMobile = String(req.body?.mobile || "");
  const mobile = normaliseIndianMobile(rawMobile);
  const rejection = rejectMobile(mobile);
  if (rejection) {
    res.status(400).json({ message: `Invalid mobile: ${rejection}` });
    return;
  }

  // ── Uniform-timing design ─────────────────────────────────────────────────
  // To prevent timing-based account enumeration, ALL non-400 response paths must do
  // the SAME work on the request thread. Only two reads happen here for every request:
  //   1. Per-mobile rate limit count
  //   2. User eligibility lookup (role + email)
  // IP throttle is in-memory (constant time). Token creation, invalidation, and SMTP
  // are all moved off the request thread into setImmediate (fire-and-forget).
  // Response fires after MIN_RECOVERY_MS from the start of the request.
  const MIN_RECOVERY_MS = 2000;
  const tStart = Date.now();
  const genericReply = async () => {
    const elapsed = Date.now() - tStart;
    if (elapsed < MIN_RECOVERY_MS) {
      await new Promise(r => setTimeout(r, MIN_RECOVERY_MS - elapsed + Math.floor(Math.random() * 300)));
    }
    res.json({ ok: true, message: RECOVERY_GENERIC_MSG });
  };

  try {
    // ── IN-MEMORY IP throttle (constant time, no DB) ──────────────────────────
    const clientIp = req.ip || "unknown";
    if (!recoveryIpAllowed(clientIp)) {
      console.warn(`[ADMIN-RECOVERY] IP rate limit hit`);
      return genericReply();
    }

    // ── READ 1: per-mobile rate limit (same for all mobiles) ──────────────────
    const [rateRow, userRow] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cnt FROM otps WHERE mobile=$1 AND purpose='admin_recovery' AND created_at > NOW() - INTERVAL '1 hour'`,
        [mobile]
      ),
      // ── READ 2: user eligibility (same query for all mobiles) ──────────────
      pool.query(
        `SELECT id, email, name, role FROM users WHERE mobile=$1 LIMIT 1`,
        [mobile]
      ),
    ]);

    const recentCount = parseInt(rateRow.rows[0]?.cnt || "0", 10);
    const user = userRow.rows[0];
    const isEligible = user
      && (user.role === "admin" || user.role === "super_admin")
      && !!user.email
      && recentCount < 3;

    // ── FIRE-AND-FORGET: all state-changing work happens off the request thread ──
    // This ensures no request-thread DB writes distinguish valid from invalid paths.
    // Token creation, invalidation, and SMTP run in setImmediate — never awaited here.
    if (isEligible) {
      const eligibleUser = user;  // captured for closure
      const eligibleMobile = mobile;
      setImmediate(async () => {
        const maskedMob = `${eligibleMobile.slice(0,2)}*****${eligibleMobile.slice(-3)}`;
        try {
          // Invalidate prior unused tokens
          await pool.query(
            `UPDATE otps SET used=true WHERE mobile=$1 AND purpose='admin_recovery' AND used=false`,
            [eligibleMobile]
          );
          // Generate and store new hashed recovery token
          const tokenRaw  = randomBytes(32).toString("hex");
          const tokenHash = createHash("sha256").update(`recovery:${tokenRaw}`).digest("hex");
          const tokenId   = randomBytes(8).toString("hex");
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          await pool.query(
            `INSERT INTO otps (id, mobile, otp, otp_hash, expires_at, purpose) VALUES ($1,$2,$3,$4,$5,$6)`,
            [tokenId, eligibleMobile, "[recovery]", tokenHash, expiresAt, "admin_recovery"]
          );
          const recoveryUrl = `https://alburhantravels.com/admin/login?rt=${encodeURIComponent(tokenRaw)}&rm=${encodeURIComponent(eligibleMobile)}`;
          const emailResult = await sendGenericEmail(
            eligibleUser.email,
            "Admin Account Recovery — Al Burhan Tours & Travels",
            `
              <p>Assalamu Alaikum,</p>
              <p>A recovery link was requested for your Al Burhan admin account.</p>
              <p style="margin:24px 0;">
                <a href="${recoveryUrl}"
                   style="background:#0B5D3B;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                  ✓ Click to Log In (valid 15 minutes)
                </a>
              </p>
              <p style="font-size:13px;color:#6b7280;">If you did not request this, ignore this email — your account remains secure. This link can only be used once.</p>
            `,
            { title: "Admin Account Recovery", preheader: "Secure one-time login link" }
          );
          if (!emailResult?.ok) {
            await pool.query(`UPDATE otps SET used=true WHERE id=$1`, [tokenId]);
            pool.query(
              `INSERT INTO notification_logs (id,event_type,channel,recipient,message,status,provider_name,sent_at,created_at)
               VALUES ($1,'admin_recovery','email',$2,'recovery link failed to send','failed','SMTP',NOW(),NOW())`,
              [`recovery_${Date.now()}`, `${eligibleMobile.slice(0,2)}XXXXX${eligibleMobile.slice(-3)}`]
            ).catch(() => {});
            console.error(`[ADMIN-RECOVERY] SMTP delivery failed for mobile=${maskedMob}: ${emailResult?.error}`);
          } else {
            pool.query(
              `INSERT INTO notification_logs (id,event_type,channel,recipient,message,status,provider_name,sent_at,created_at)
               VALUES ($1,'admin_recovery','email',$2,'recovery link issued','sent','SMTP',NOW(),NOW())`,
              [`recovery_${Date.now()}`, `${eligibleMobile.slice(0,2)}XXXXX${eligibleMobile.slice(-3)}`]
            ).catch(() => {});
            console.log(`[ADMIN-RECOVERY] Recovery email sent for mobile=${maskedMob}`);
          }
        } catch (bgErr: any) {
          console.error(`[ADMIN-RECOVERY] Background error for mobile=${maskedMob}: ${bgErr.message}`);
        }
      });
    } else if (recentCount >= 3) {
      console.warn(`[ADMIN-RECOVERY] Per-mobile rate limit hit mobile=${mobile.slice(0,2)}*****${mobile.slice(-3)}`);
    }

    // Every non-400 path exits here after MIN_RECOVERY_MS — identical on-thread work for all.
    return genericReply();
  } catch (err: any) {
    console.error("[ADMIN-RECOVERY] Failed:", err.message);
    return genericReply();
  }
});

// POST /api/auth/admin-recovery/verify  { token, mobile }
// Verifies recovery token from email link, creates admin session.
// Any invalid/expired/missing condition returns the same 401 — no distinguishable messages.
router.post("/admin-recovery/verify", async (req, res) => {
  const tokenRaw = String(req.body?.token || "");
  const rawMobile = String(req.body?.mobile || "");
  const mobile = normaliseIndianMobile(rawMobile);

  const INVALID = { message: "Recovery link is invalid or has expired. Please request a new one." };

  if (!tokenRaw || mobile.length !== 10) {
    res.status(401).json(INVALID);
    return;
  }
  try {
    const tokenHash = createHash("sha256").update(`recovery:${tokenRaw}`).digest("hex");
    const now = new Date();

    // ── Atomic token consumption: conditional UPDATE ... RETURNING ────────────
    // Updates exactly one row only when: hash matches, mobile matches, not yet used, not expired.
    // Concurrent requests using the same link will find used=true on the second attempt.
    const consumeResult = await pool.query(
      `UPDATE otps SET used=true
       WHERE otp_hash=$1 AND purpose='admin_recovery' AND mobile=$2
         AND used=false AND expires_at > $3
       RETURNING id, mobile`,
      [tokenHash, mobile, now]
    );
    if (consumeResult.rowCount !== 1) {
      // Zero rows: token invalid, already consumed, wrong mobile, or expired
      res.status(401).json(INVALID);
      return;
    }

    // ── Now fetch the user — token is already consumed so no concurrency window ──
    const userRow = await pool.query(
      `SELECT id AS user_id, mobile, role, name, email FROM users
       WHERE mobile=$1 AND role IN ('admin','super_admin') LIMIT 1`,
      [mobile]
    );
    const user = userRow.rows[0];
    if (!user) {
      // Token was valid but user no longer exists or lost admin role — treat as invalid
      res.status(401).json(INVALID);
      return;
    }
    const { user_id, role, name, email } = user;

    (req.session as any).userId = user_id;

    // ── Await session persistence before responding ───────────────────────────
    // The PostgreSQL session store writes asynchronously; if we respond before save()
    // completes the browser redirect can land before the session row exists.
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    const _ip = req.ip || "unknown";
    pool.query(
      `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_table, entity_id, old_value, new_value, ip, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, 'created', 'login_attempts', gen_random_uuid()::text, NULL, $3::jsonb, $4, NOW())`,
      [user_id, mobile, JSON.stringify({ event: "admin_recovery_login", mobile, user_role: role }), _ip]
    ).catch(() => {});

    console.log(`[ADMIN-RECOVERY] Verified recovery login mobile=${mobile.slice(0,2)}*****${mobile.slice(-3)} userId=${user_id}`);
    res.json({ ok: true, user: { id: user_id, name, mobile, email, role } });
  } catch (err: any) {
    console.error("[ADMIN-RECOVERY-VERIFY] Failed:", err.message);
    res.status(401).json(INVALID);
  }
});

// ── Admin: OTP Diagnostics (provider status, recent logs, stats) ──────────────
// GET /api/auth/otp-diagnostics  (requires admin session)
// Provider readiness derives from the same sources the send functions use:
//   fast2sms — DB key OR FAST2SMS_API_KEY env var
//   botbee    — DB key OR BOTBEE_API_KEY env var, PLUS phone_number_id must be set
//   smtp      — DB key OR SMTP_HOST env var present
router.get("/otp-diagnostics", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    res.status(403).json({ message: "Admin only" });
    return;
  }
  try {
    const [provRows, logRows, statsRows] = await Promise.all([
      // Provider rows from DB (no key values exposed)
      pool.query(`
        SELECT provider,
               (api_key_encrypted IS NOT NULL AND LENGTH(api_key_encrypted) > 10) AS has_db_key,
               enabled AS is_enabled,
               (extra_fields_encrypted IS NOT NULL AND LENGTH(extra_fields_encrypted) > 10) AS has_extra
        FROM api_settings
        WHERE provider IN ('fast2sms','botbee','smtp')
      `),
      // Recent OTP delivery logs — includes login OTP, recovery, and test-channel events
      pool.query(`
        SELECT id,
               CONCAT(LEFT(recipient,2), 'XXXXX', RIGHT(recipient,3)) AS recipient_masked,
               channel, status, provider_name, message,
               created_at
        FROM notification_logs
        WHERE event_type LIKE '%_login_otp'
           OR event_type = 'admin_recovery'
           OR event_type = 'otp_test_channel'
        ORDER BY created_at DESC
        LIMIT 50
      `),
      // Security stats
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM otps WHERE used=false AND expires_at > NOW() AND purpose != 'admin_recovery') AS active_otps,
          (SELECT COUNT(*) FROM otps WHERE attempts > 0 AND created_at > NOW() - INTERVAL '1 hour') AS failed_attempts_1h,
          (SELECT COUNT(*) FROM otps WHERE created_at > NOW() - INTERVAL '30 minutes' AND purpose != 'admin_recovery') AS requests_30m
      `),
    ]);

    const dbByProvider: Record<string, any> = {};
    for (const row of provRows.rows) {
      dbByProvider[row.provider] = row;
    }

    // Derive effective readiness from BOTH DB and env vars (same sources the send functions use)
    const fast2smsReady = !!(dbByProvider["fast2sms"]?.has_db_key || process.env.FAST2SMS_API_KEY);
    const botbeeKeyReady = !!(dbByProvider["botbee"]?.has_db_key || process.env.BOTBEE_API_KEY);
    // BotBee also requires phone_number_id (extra_fields) — extra_fields_encrypted presence is a proxy
    const botbeePhoneIdReady = !!(dbByProvider["botbee"]?.has_extra || process.env.BOTBEE_PHONE_NUMBER_ID);
    const botbeeReady = botbeeKeyReady && botbeePhoneIdReady;
    // SMTP requires all three: host + user + password (DB key covers the full config when set;
    // env fallback requires all of SMTP_HOST, SMTP_USER, and SMTP_PASS to be present)
    const smtpDbReady = !!dbByProvider["smtp"]?.has_db_key;
    const smtpEnvReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const smtpReady = smtpDbReady || smtpEnvReady;
    const smtpEnvNote = !smtpDbReady && !smtpEnvReady
      ? `Env vars incomplete: ${!process.env.SMTP_HOST ? "SMTP_HOST " : ""}${!process.env.SMTP_USER ? "SMTP_USER " : ""}${!process.env.SMTP_PASS ? "SMTP_PASS" : ""}`.trim()
      : null;

    res.json({
      providers: {
        fast2sms: {
          label:   "Fast2SMS (SMS/DLT)",
          ready:   fast2smsReady,
          enabled: dbByProvider["fast2sms"]?.is_enabled !== false,
          sources: { db: !!dbByProvider["fast2sms"]?.has_db_key, env: !!process.env.FAST2SMS_API_KEY },
          note:    fast2smsReady ? null : "API key missing in both DB and FAST2SMS_API_KEY env var",
        },
        botbee: {
          label:   "BotBee (WhatsApp)",
          ready:   botbeeReady,
          enabled: dbByProvider["botbee"]?.is_enabled !== false,
          sources: { db: !!dbByProvider["botbee"]?.has_db_key, env: !!process.env.BOTBEE_API_KEY, phoneIdDb: !!dbByProvider["botbee"]?.has_extra, phoneIdEnv: !!process.env.BOTBEE_PHONE_NUMBER_ID },
          note:    !botbeeKeyReady ? "API key missing" : !botbeePhoneIdReady ? "Phone Number ID missing in extra_fields" : null,
        },
        smtp: {
          label:   "SMTP (Email)",
          ready:   smtpReady,
          enabled: dbByProvider["smtp"]?.is_enabled !== false,
          sources: { db: smtpDbReady, envHost: !!process.env.SMTP_HOST, envUser: !!process.env.SMTP_USER, envPass: !!process.env.SMTP_PASS },
          note:    smtpReady ? null : smtpEnvNote || "SMTP credentials missing in both DB and env vars (requires SMTP_HOST + SMTP_USER + SMTP_PASS)",
        },
      },
      recentLogs: logRows.rows,
      stats: statsRows.rows[0] || {},
    });
  } catch (err: any) {
    console.error("[OTP-DIAG] Failed:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Admin: test a single OTP delivery channel ──────────────────────────────────
// POST /api/auth/otp-test-channel  { channel: "sms"|"whatsapp"|"email", mobile }
// Uses fixed test OTP "000000" — never stored in otps table, never valid for auth.
// All test attempts logged to notification_logs with event_type="otp_test_channel".
router.post("/otp-test-channel", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    res.status(403).json({ message: "Admin only" });
    return;
  }
  const { channel } = req.body;
  const rawMobile = String(req.body?.mobile || "");
  const mobile = normaliseIndianMobile(rawMobile);
  const rejection = rejectMobile(mobile);
  if (rejection) { res.status(400).json({ message: `Invalid mobile: ${rejection}` }); return; }
  if (!["sms", "whatsapp", "email"].includes(channel)) {
    res.status(400).json({ message: "channel must be sms, whatsapp or email" });
    return;
  }

  const testOtp   = "000000"; // Fixed — never stored in otps table, never valid for auth
  const maskedMob = `${mobile.slice(0,2)}XXXXX${mobile.slice(-3)}`;

  const logTest = (ok: boolean, detail: string) =>
    pool.query(
      `INSERT INTO notification_logs (id, event_type, channel, recipient, message, status, provider_name, sent_at, created_at)
       VALUES ($1,'otp_test_channel',$2,$3,$4,$5,$6,NOW(),NOW())`,
      [`test_${channel}_${Date.now()}`, channel, maskedMob, detail, ok ? "sent" : "failed",
       channel === "sms" ? "Fast2SMS" : channel === "whatsapp" ? "BotBee" : "SMTP"]
    ).catch(() => {});

  try {
    if (channel === "sms") {
      const r = await sendOtpSMS(mobile, testOtp);
      await logTest(r.sent, `route=${r.route || "dlt"}${r.error ? ` err=${r.error.slice(0,200)}` : ""}`);
      res.json({ ok: r.sent, channel, route: r.route, error: r.error });
      return;
    }
    if (channel === "whatsapp") {
      const { sendText } = await import("../lib/botbee.js");
      const r = await sendText(mobile, `[Test] Al Burhan OTP diagnostic — this is a test message only.`);
      const ok = !!r?.ok;
      await logTest(ok, ok ? "session message" : (r?.error || "no 24h session"));
      res.json({ ok, channel, error: r?.error });
      return;
    }
    if (channel === "email") {
      const userRow = await pool.query(`SELECT email, name FROM users WHERE mobile=$1 LIMIT 1`, [mobile]);
      const email = userRow.rows[0]?.email;
      if (!email) {
        await logTest(false, "no email registered for this mobile");
        res.status(400).json({ ok: false, message: "No email registered for this mobile" });
        return;
      }
      const r = await sendOTPEmail(email, userRow.rows[0]?.name || "Admin", testOtp);
      await logTest(r.ok, r.ok ? `to=${email.replace(/(.{2})[^@]*(@.*)/, "$1***$2")}` : (r.error || "SMTP error"));
      res.json({ ok: r.ok, channel, error: r.error });
      return;
    }
  } catch (err: any) {
    await logTest(false, err.message || "exception");
    res.status(500).json({ ok: false, channel, error: err.message });
  }
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

// ── DEV ONLY: destroy session (for clean login page screenshots) ─────────────
router.get("/dev/logout", (req, res) => {
  if (process.env.NODE_ENV === "production") { res.status(404).end(); return; }
  req.session.destroy(() => {
    res.redirect(302, "/agent/dashboard");
  });
});

// ── DEV ONLY: auto-login as admin for screenshot/e2e testing ────────────────
router.get("/dev/admin-login", async (req, res) => {
  if (process.env.NODE_ENV === "production") { res.status(404).end(); return; }
  try {
    const mobile = (req.query.mobile as string) || "9999999999";
    const users = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile)).limit(1);
    const user = users[0];
    if (!user) { res.status(404).json({ error: "User not found for mobile: " + mobile }); return; }
    (req.session as any).userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    const redirect = (req.query.redirect as string) || "/admin/super";
    res.redirect(302, redirect);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DEV ONLY: auto-login as a specific mobile for screenshot/e2e testing ────
router.get("/dev/agent-login", async (req, res) => {
  if (process.env.NODE_ENV === "production") { res.status(404).end(); return; }
  try {
    const mobile = (req.query.mobile as string) || "9700000001";
    const users = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile)).limit(1);
    const user = users[0];
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    let entityId: string | null = null;
    if (user.role === "agent") {
      const r = await pool.query(`SELECT id FROM agents WHERE mobile=$1 LIMIT 1`, [mobile]);
      entityId = r.rows[0]?.id ?? null;
    }
    (req.session as any).userId = user.id;
    if (entityId) (req.session as any).entityId = entityId;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    const section = (req.query.section as string) || "";
    const redirectUrl = section ? `/agent/dashboard?section=${encodeURIComponent(section)}` : "/agent/dashboard";
    res.redirect(302, redirectUrl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
