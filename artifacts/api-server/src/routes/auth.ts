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
import { sendOTPEmail, sendGenericEmail } from "../services/emailService.js";

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

  if (isNewUser) {
    // Detect if this mobile belongs to a branch manager, agent, or staff member
    let portalRole: "admin" | "customer" | "branch_manager" | "agent" | "staff" =
      ADMIN_MOBILES.includes(cleanMobile) ? "admin" : "customer";

    if (portalRole === "customer") {
      const [branchRow, agentRow, staffRow] = await Promise.all([
        pool.query(`SELECT id FROM branches WHERE manager_mobile=$1 AND is_active=true LIMIT 1`, [cleanMobile]),
        pool.query(`SELECT id FROM agents WHERE mobile=$1 AND is_active=true LIMIT 1`, [cleanMobile]),
        pool.query(`SELECT id FROM staff WHERE mobile_india=$1 AND status='active' LIMIT 1`, [cleanMobile]),
      ]);
      if (branchRow.rows[0]) portalRole = "branch_manager";
      else if (agentRow.rows[0]) portalRole = "agent";
      else if (staffRow.rows[0]) portalRole = "staff";
    }

    await db.insert(usersTable).values({ mobile: cleanMobile, role: portalRole as any });
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
    // Admin phones: full debug including OTP and raw provider response (all envs)
    ...(isAdmin ? {
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
      // Look up OTP template_id from DB (template_id-based, works outside 24h window)
      const tplRow = await pool.query(
        `SELECT template_id FROM wa_templates WHERE event_type='mobile_otp' AND enabled=true AND template_id IS NOT NULL LIMIT 1`
      );
      const otpTemplateId = tplRow.rows[0]?.template_id as string | undefined;
      // Pass the OTP code as a named variable so BotBee substitutes it in the template.
      // forceTemplateApi:true bypasses 24h session window — required for login OTP delivery.
      const templateResult = otpTemplateId
        ? await sendTemplate(cleanMobile, otpTemplateId, {
            eventType: "mobile_otp",
            variables: { OTP: otp, Code: otp, Otp: otp },
            forceTemplateApi: true,
          })
        : { ok: false as const, errorMessage: "No OTP template_id configured in DB" };
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
            <a href="https://alburhantravels.online/dashboard"
               style="background:#0B5D3B;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">
              Go to Your Dashboard
            </a>
          </p>
          <p style="margin-top:24px;font-size:13px;color:#6b7280;">
            Need help? Call us on <strong>+91 9893225590</strong> or email
            <a href="mailto:info@alburhantravels.online" style="color:#0B5D3B;">info@alburhantravels.online</a>
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
