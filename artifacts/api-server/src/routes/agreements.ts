// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { sendOtpSMS, sendEmail } from "../lib/notifications.js";
import { generateAgreementPdfBuffer, HAJJ_AGREEMENT_CLAUSES } from "../lib/agreementPdf.js";
import { sendPDFDocument } from "../lib/botbee.js";
import crypto from "crypto";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req: any): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
}

async function generateAgreementNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const res = await pool.query(
    `SELECT COUNT(*) FROM agreements WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]
  );
  const seq = parseInt(res.rows[0].count || "0") + 1;
  return `ABT-AGR-${year}-${String(seq).padStart(6, "0")}`;
}

async function logAgreementAudit(agreementId: string, action: string, details: any, ip?: string, userAgent?: string) {
  try {
    await pool.query(
      `INSERT INTO agreement_audit_logs (id, agreement_id, action, details, ip_address, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [crypto.randomUUID(), agreementId, action, JSON.stringify(details), ip || null, userAgent || null]
    );
  } catch (e) { console.error("[AgreementAudit] log failed:", e); }
}

// ── auto-generate (called internally after payment confirmed) ─────────────────
export async function autoGenerateAgreement(bookingId: string): Promise<void> {
  try {
    const existing = await pool.query(
      `SELECT id FROM agreements WHERE booking_id=$1 AND status NOT IN ('cancelled')`, [bookingId]
    );
    if (existing.rows.length > 0) {
      console.log(`[Agreement] Already exists for booking ${bookingId}`);
      return;
    }

    const bRes = await pool.query(
      `SELECT b.*, u.email AS customer_email, u.name AS customer_name_user,
              hg.name AS group_name, hg.departure_date
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE b.id = $1`, [bookingId]
    );
    if (!bRes.rows.length) return;
    const booking = bRes.rows[0];

    const agreementNumber = await generateAgreementNumber();
    const verificationToken = crypto.randomUUID();
    const siteBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.SITE_URL || "https://alburhantravels.com");
    const verificationUrl = `${siteBase}/verify-agreement/${verificationToken}`;

    const agId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agreements (id, agreement_number, booking_id, customer_id, status, verification_token, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'draft',$5,NOW(),NOW())`,
      [agId, agreementNumber, bookingId, booking.customer_id, verificationToken]
    );

    await logAgreementAudit(agId, "auto_generated", {
      bookingNumber: booking.booking_number,
      customerName: booking.customer_name || booking.customer_name_user,
      triggeredBy: "payment_confirmed",
    });

    console.log(`[Agreement] Auto-generated ${agreementNumber} for booking ${booking.booking_number}`);
  } catch (err) {
    console.error("[Agreement] autoGenerateAgreement error:", err);
  }
}

// ── PUBLIC: QR Verification ──────────────────────────────────────────────────
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.verification_token = $1`, [token]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Agreement not found" });
    const ag = agRes.rows[0];
    res.json({
      agreementNumber: ag.agreement_number,
      bookingNumber: ag.booking_number,
      customerName: ag.customer_name,
      packageName: ag.package_name,
      status: ag.status,
      signedAt: ag.signed_at,
      otpVerified: ag.otp_verified,
      createdAt: ag.created_at,
      isValid: ag.status === "signed",
    });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── CUSTOMER: List my agreements ─────────────────────────────────────────────
router.get("/my", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT a.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount, b.group_id
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.customer_id = $1 AND a.status != 'cancelled'
       ORDER BY a.created_at DESC`, [userId]
    );
    res.json({ agreements: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load agreements" });
  }
});

// ── CUSTOMER: Get my agreement detail ────────────────────────────────────────
router.get("/my/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount,
              b.customer_name, b.customer_mobile, b.customer_email, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, userId]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const siteBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.SITE_URL || "https://alburhantravels.com");
    ag.verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;
    ag.clauses = HAJJ_AGREEMENT_CLAUSES.map(c => ({ id: c.id, title: c.title, body: c.body }));
    res.json(ag);
  } catch (err) {
    res.status(500).json({ error: "Failed to load agreement" });
  }
});

// ── CUSTOMER: Request OTP for signing ────────────────────────────────────────
router.post("/my/:id/request-otp", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const agRes = await pool.query(
      `SELECT a.*, b.customer_name, b.customer_mobile
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, userId]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Agreement not found" });
    const ag = agRes.rows[0];
    if (ag.status === "signed") return res.status(400).json({ error: "Agreement already signed" });

    const mobile = ag.customer_mobile || req.user.mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number on record" });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `UPDATE agreements SET signing_otp=$1, signing_otp_expires_at=$2, updated_at=NOW() WHERE id=$3`,
      [otp, expiry, id]
    );

    await sendOtpSMS(mobile, otp);
    await logAgreementAudit(id, "otp_requested", { mobile: mobile.slice(-4).padStart(mobile.length, "*") }, getClientIp(req), req.headers["user-agent"]);

    res.json({ ok: true, message: "OTP sent to your registered mobile number" });
  } catch (err) {
    console.error("[Agreement] OTP request error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// ── CUSTOMER: Sign agreement ──────────────────────────────────────────────────
router.post("/my/:id/sign", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { otp, signatureData, termsAccepted } = req.body;

    if (!otp || !signatureData || !termsAccepted) {
      return res.status(400).json({ error: "OTP, signature, and terms acceptance required" });
    }

    const agRes = await pool.query(
      `SELECT a.*, b.customer_name, b.customer_mobile, b.customer_email, b.package_name,
              b.booking_number, b.final_amount, b.paid_amount, b.number_of_pilgrims, b.group_id,
              hg.name AS group_name, hg.departure_date,
              u.name AS user_name, u.email AS user_email
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       LEFT JOIN users u ON u.id = a.customer_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, userId]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    if (ag.status === "signed") return res.status(400).json({ error: "Already signed" });

    // Validate OTP
    if (!ag.signing_otp || ag.signing_otp !== String(otp)) {
      return res.status(400).json({ error: "Invalid OTP" });
    }
    if (!ag.signing_otp_expires_at || new Date() > new Date(ag.signing_otp_expires_at)) {
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    // Validate all terms accepted
    const requiredClauses = HAJJ_AGREEMENT_CLAUSES.map(c => c.id);
    const unaccepted = requiredClauses.filter(cid => !termsAccepted[cid]);
    if (unaccepted.length > 0) {
      return res.status(400).json({ error: `Please accept all terms. Missing: ${unaccepted.join(", ")}` });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const now = new Date();

    const siteBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.SITE_URL || "https://alburhantravels.com");
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;

    // Update agreement
    await pool.query(
      `UPDATE agreements SET
         status = 'signed',
         signature_data = $1,
         terms_accepted = $2,
         signed_at = $3,
         signed_ip = $4,
         signed_user_agent = $5,
         otp_verified = true,
         otp_verified_at = $3,
         signing_otp = NULL,
         signing_otp_expires_at = NULL,
         updated_at = NOW()
       WHERE id = $6`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent, id]
    );

    await logAgreementAudit(id, "agreement_signed", {
      ip, userAgent: userAgent.substring(0, 100), otpVerified: true,
    }, ip, userAgent);

    // Generate PDF
    let pdfBuffer: Buffer | null = null;
    try {
      const totalAmt = Number(ag.final_amount || 0);
      const paidAmt = Number(ag.paid_amount || 0);
      pdfBuffer = await generateAgreementPdfBuffer({
        agreementNumber: ag.agreement_number,
        bookingNumber: ag.booking_number,
        bookingId: ag.booking_id,
        customerName: ag.customer_name || ag.user_name || "",
        customerMobile: ag.customer_mobile || "",
        customerEmail: ag.customer_email || ag.user_email,
        packageName: ag.package_name,
        numberOfPilgrims: ag.number_of_pilgrims,
        totalAmount: totalAmt,
        paidAmount: paidAmt,
        balanceAmount: totalAmt - paidAmt,
        departureDate: ag.departure_date,
        groupName: ag.group_name,
        signatureData,
        signedAt: now,
        signedIp: ip,
        userAgent,
        otpVerified: true,
        otpVerifiedAt: now,
        verificationUrl,
        termsAccepted,
        status: "signed",
        agreementDate: ag.created_at,
      });

      await pool.query(`UPDATE agreements SET pdf_generated=true, updated_at=NOW() WHERE id=$1`, [id]);
      await logAgreementAudit(id, "pdf_generated", { size: pdfBuffer.length }, ip, userAgent);
    } catch (pdfErr) {
      console.error("[Agreement] PDF generation failed:", pdfErr);
    }

    // Send email with PDF
    const emailAddr = ag.customer_email || ag.user_email;
    if (emailAddr && pdfBuffer) {
      try {
        const htmlBody = `<p>As-salamu Alaykum <strong>${ag.customer_name || "Valued Customer"}</strong>,</p><p>Alhumdulillah! Your Hajj Agreement has been signed successfully.</p><p><strong>Agreement ID:</strong> ${ag.agreement_number}<br/><strong>Booking ID:</strong> ${ag.booking_number}</p><p>Please find your signed agreement attached. Verify at: <a href="${verificationUrl}">${verificationUrl}</a></p><p>May Allah accept your Hajj. Ameen.<br/>— Al Burhan Tours & Travels</p>`;
        const plainBody = `Your Hajj Agreement ${ag.agreement_number} has been signed. Booking: ${ag.booking_number}. Verify: ${verificationUrl}`;
        await sendEmail(emailAddr, `Your Hajj Agreement — ${ag.agreement_number}`, plainBody, htmlBody,
          [{ filename: `Agreement-${ag.agreement_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
        );
        await logAgreementAudit(id, "email_sent", { to: emailAddr });
      } catch (emailErr) { console.error("[Agreement] Email send failed:", emailErr); }
    }

    // Send WhatsApp notification
    try {
      const mobile = ag.customer_mobile;
      if (mobile) {
        await sendPDFDocument(mobile, pdfBuffer, `Agreement-${ag.agreement_number}.pdf`,
          `As-salamu Alaykum ${ag.customer_name}! Your Hajj Agreement (${ag.agreement_number}) has been signed successfully. Booking: ${ag.booking_number}. Verification: ${verificationUrl}`);
        await logAgreementAudit(id, "whatsapp_sent", { mobile: mobile.slice(-4).padStart(mobile.length, "*") });
      }
    } catch (waErr) { console.error("[Agreement] WhatsApp send failed:", waErr); }

    // Store PDF in response or GCS (return as base64 for immediate download)
    const responsePayload: any = { ok: true, agreementNumber: ag.agreement_number, message: "Agreement signed successfully. PDF sent via Email and WhatsApp." };
    if (pdfBuffer) responsePayload.pdfBase64 = pdfBuffer.toString("base64");

    res.json(responsePayload);
  } catch (err) {
    console.error("[Agreement] Sign error:", err);
    res.status(500).json({ error: "Failed to sign agreement" });
  }
});

// ── CUSTOMER: Download PDF ────────────────────────────────────────────────────
router.get("/my/:id/pdf", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date,
              u.email AS user_email
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       LEFT JOIN users u ON u.id = a.customer_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, userId]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    const siteBase = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.SITE_URL || "https://alburhantravels.com");

    const totalAmt = Number(ag.final_amount || 0);
    const paidAmt = Number(ag.paid_amount || 0);
    const buf = await generateAgreementPdfBuffer({
      agreementNumber: ag.agreement_number,
      bookingNumber: ag.booking_number,
      bookingId: ag.booking_id,
      customerName: ag.customer_name || "",
      customerMobile: ag.customer_mobile || "",
      customerEmail: ag.customer_email || ag.user_email,
      packageName: ag.package_name,
      numberOfPilgrims: ag.number_of_pilgrims,
      totalAmount: totalAmt,
      paidAmount: paidAmt,
      balanceAmount: totalAmt - paidAmt,
      departureDate: ag.departure_date,
      groupName: ag.group_name,
      signatureData: ag.signature_data,
      signedAt: ag.signed_at ? new Date(ag.signed_at) : null,
      signedIp: ag.signed_ip,
      userAgent: ag.signed_user_agent,
      otpVerified: ag.otp_verified,
      otpVerifiedAt: ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
      verificationUrl: `${siteBase}/verify-agreement/${ag.verification_token}`,
      termsAccepted: ag.terms_accepted,
      status: ag.status,
      agreementDate: ag.created_at ? new Date(ag.created_at) : null,
    });

    await logAgreementAudit(id, "pdf_downloaded_customer", {}, getClientIp(req), req.headers["user-agent"]);
    const safeName = ag.agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Agreement-${safeName}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[Agreement] PDF download error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── ADMIN: List all agreements ────────────────────────────────────────────────
router.get("/", requireAdmin, async (req: any, res) => {
  try {
    const { search, status, page = "1", limit = "30" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.agreement_number ILIKE $${params.length} OR b.booking_number ILIKE $${params.length} OR b.customer_name ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const countRes = await pool.query(`SELECT COUNT(*) FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id ${where}`, params);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      agreements: result.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load agreements" });
  }
});

// ── ADMIN: Get single agreement ───────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE a.id = $1`, [id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    const logsRes = await pool.query(
      `SELECT * FROM agreement_audit_logs WHERE agreement_id=$1 ORDER BY created_at ASC`, [id]
    );
    ag.auditLogs = logsRes.rows;

    const siteBase = process.env.SITE_URL || "https://alburhantravels.com";
    ag.verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;
    ag.clauses = HAJJ_AGREEMENT_CLAUSES.map(c => ({ id: c.id, title: c.title }));

    res.json(ag);
  } catch (err) {
    res.status(500).json({ error: "Failed to load agreement" });
  }
});

// ── ADMIN: Manual generate for booking ───────────────────────────────────────
router.post("/generate/:bookingId", requireAdmin, async (req: any, res) => {
  try {
    const { bookingId } = req.params;
    await autoGenerateAgreement(bookingId);
    const agRes = await pool.query(
      `SELECT * FROM agreements WHERE booking_id=$1 AND status!='cancelled' ORDER BY created_at DESC LIMIT 1`, [bookingId]
    );
    if (!agRes.rows.length) return res.status(400).json({ error: "Could not generate agreement" });
    res.json({ ok: true, agreement: agRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});

// ── ADMIN: Download PDF ───────────────────────────────────────────────────────
router.get("/:id/pdf", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date
       FROM agreements a
       LEFT JOIN bookings b ON b.id = a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE a.id = $1`, [id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    const siteBase = process.env.SITE_URL || "https://alburhantravels.com";
    const totalAmt = Number(ag.final_amount || 0);
    const paidAmt = Number(ag.paid_amount || 0);

    const buf = await generateAgreementPdfBuffer({
      agreementNumber: ag.agreement_number,
      bookingNumber: ag.booking_number,
      bookingId: ag.booking_id,
      customerName: ag.customer_name || "",
      customerMobile: ag.customer_mobile || "",
      customerEmail: ag.customer_email,
      packageName: ag.package_name,
      numberOfPilgrims: ag.number_of_pilgrims,
      totalAmount: totalAmt,
      paidAmount: paidAmt,
      balanceAmount: totalAmt - paidAmt,
      departureDate: ag.departure_date,
      groupName: ag.group_name,
      signatureData: ag.signature_data,
      signedAt: ag.signed_at ? new Date(ag.signed_at) : null,
      signedIp: ag.signed_ip,
      userAgent: ag.signed_user_agent,
      otpVerified: ag.otp_verified,
      otpVerifiedAt: ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
      verificationUrl: `${siteBase}/verify-agreement/${ag.verification_token}`,
      termsAccepted: ag.terms_accepted,
      status: ag.status,
      agreementDate: ag.created_at ? new Date(ag.created_at) : null,
    });

    await logAgreementAudit(id, "pdf_downloaded_admin", { adminId: req.user?.id }, getClientIp(req));
    const safeName = ag.agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Agreement-${safeName}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[Agreement] Admin PDF error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ── ADMIN: Get audit logs ─────────────────────────────────────────────────────
router.get("/:id/audit", requireAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM agreement_audit_logs WHERE agreement_id=$1 ORDER BY created_at ASC`, [req.params.id]
    );
    res.json({ logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

// ── ADMIN: Resend email ───────────────────────────────────────────────────────
router.post("/:id/resend-email", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date
       FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id=b.group_id
       WHERE a.id=$1`, [id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const emailTo = ag.customer_email;
    if (!emailTo) return res.status(400).json({ error: "No email on record" });

    const siteBase = process.env.SITE_URL || "https://alburhantravels.com";
    const totalAmt = Number(ag.final_amount || 0);
    const paidAmt = Number(ag.paid_amount || 0);

    const buf = await generateAgreementPdfBuffer({
      agreementNumber: ag.agreement_number, bookingNumber: ag.booking_number,
      bookingId: ag.booking_id, customerName: ag.customer_name || "",
      customerMobile: ag.customer_mobile || "", customerEmail: ag.customer_email,
      packageName: ag.package_name, numberOfPilgrims: ag.number_of_pilgrims,
      totalAmount: totalAmt, paidAmount: paidAmt, balanceAmount: totalAmt - paidAmt,
      departureDate: ag.departure_date, groupName: ag.group_name,
      signatureData: ag.signature_data, signedAt: ag.signed_at ? new Date(ag.signed_at) : null,
      signedIp: ag.signed_ip, userAgent: ag.signed_user_agent,
      otpVerified: ag.otp_verified, otpVerifiedAt: ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
      verificationUrl: `${siteBase}/verify-agreement/${ag.verification_token}`,
      termsAccepted: ag.terms_accepted, status: ag.status,
      agreementDate: ag.created_at ? new Date(ag.created_at) : null,
    });

    await sendEmail(emailTo, `Your Hajj Agreement — ${ag.agreement_number}`,
      `Your Hajj Agreement ${ag.agreement_number} is attached. Verify at: ${siteBase}/verify-agreement/${ag.verification_token}`,
      `<p>Please find your Hajj Agreement (${ag.agreement_number}) attached.</p><p>Verify at: <a href="${siteBase}/verify-agreement/${ag.verification_token}">${siteBase}/verify-agreement/${ag.verification_token}</a></p>`,
      [{ filename: `Agreement-${ag.agreement_number}.pdf`, content: buf, contentType: "application/pdf" }]
    );

    await logAgreementAudit(id, "email_resent_admin", { to: emailTo, adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Agreement] Resend email error:", err);
    res.status(500).json({ error: "Failed to resend email" });
  }
});

// ── ADMIN: Resend WhatsApp ────────────────────────────────────────────────────
router.post("/:id/resend-whatsapp", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile,
              b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
              hg.name AS group_name, hg.departure_date, b.customer_email
       FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id
       LEFT JOIN hajj_groups hg ON hg.id=b.group_id
       WHERE a.id=$1`, [id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const mobile = ag.customer_mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number" });

    const siteBase = process.env.SITE_URL || "https://alburhantravels.com";
    const totalAmt = Number(ag.final_amount || 0);
    const paidAmt = Number(ag.paid_amount || 0);

    const buf = await generateAgreementPdfBuffer({
      agreementNumber: ag.agreement_number, bookingNumber: ag.booking_number,
      bookingId: ag.booking_id, customerName: ag.customer_name || "",
      customerMobile: ag.customer_mobile || "", customerEmail: ag.customer_email,
      packageName: ag.package_name, numberOfPilgrims: ag.number_of_pilgrims,
      totalAmount: totalAmt, paidAmount: paidAmt, balanceAmount: totalAmt - paidAmt,
      departureDate: ag.departure_date, groupName: ag.group_name,
      signatureData: ag.signature_data, signedAt: ag.signed_at ? new Date(ag.signed_at) : null,
      signedIp: ag.signed_ip, userAgent: ag.signed_user_agent,
      otpVerified: ag.otp_verified, otpVerifiedAt: ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
      verificationUrl: `${siteBase}/verify-agreement/${ag.verification_token}`,
      termsAccepted: ag.terms_accepted, status: ag.status,
      agreementDate: ag.created_at ? new Date(ag.created_at) : null,
    });

    await sendPDFDocument(mobile, buf, `Agreement-${ag.agreement_number}.pdf`,
      `As-salamu Alaykum ${ag.customer_name}! Your Hajj Agreement (${ag.agreement_number}) from Al Burhan Tours & Travels. Booking: ${ag.booking_number}. Verify: ${siteBase}/verify-agreement/${ag.verification_token}`
    );

    await logAgreementAudit(id, "whatsapp_resent_admin", { mobile: mobile.slice(-4).padStart(mobile.length, "*"), adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Agreement] Resend WhatsApp error:", err);
    res.status(500).json({ error: "Failed to resend WhatsApp" });
  }
});

// ── ADMIN: Cancel agreement ───────────────────────────────────────────────────
router.post("/:id/cancel", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await pool.query(
      `UPDATE agreements SET status='cancelled', cancelled_at=NOW(), cancelled_reason=$1, updated_at=NOW() WHERE id=$2`,
      [reason || "Cancelled by admin", id]
    );
    await logAgreementAudit(id, "agreement_cancelled", { reason, adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel" });
  }
});

// ── ADMIN: Regenerate agreement (cancels old, creates new) ───────────────────
router.post("/:id/regenerate", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(`SELECT * FROM agreements WHERE id=$1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    await pool.query(
      `UPDATE agreements SET status='cancelled', cancelled_at=NOW(), cancelled_reason='Regenerated by admin', updated_at=NOW() WHERE id=$1`, [id]
    );
    await logAgreementAudit(id, "agreement_cancelled_for_regen", { adminId: req.user?.id }, getClientIp(req));

    await autoGenerateAgreement(ag.booking_id);
    const newAg = await pool.query(
      `SELECT * FROM agreements WHERE booking_id=$1 AND status='draft' ORDER BY created_at DESC LIMIT 1`, [ag.booking_id]
    );
    res.json({ ok: true, newAgreement: newAg.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to regenerate" });
  }
});

export default router;
