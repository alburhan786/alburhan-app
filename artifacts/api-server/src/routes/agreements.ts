// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { sendOtpSMS, sendEmail } from "../lib/notifications.js";
import { generateAgreementPdfBuffer, HAJJ_AGREEMENT_CLAUSES, AgreementPdfOptions } from "../lib/agreementPdf.js";
import { sendPDFDocument } from "../lib/botbee.js";
import crypto from "crypto";

const router = Router();

// ── Startup migration — add hotel_info / flight_info if not present ───────────
;(async () => {
  try {
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS hotel_info  JSONB`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS flight_info JSONB`);
    console.log("[Agreement] hotel_info / flight_info columns ensured");
  } catch (e) { console.error("[Agreement] Migration error:", e); }
})();

// ── Helpers ──────────────────────────────────────────────────────────────────
function getClientIp(req: any): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress || "unknown";
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

// ── Enriched SQL query fragment ───────────────────────────────────────────────
const RICH_SELECT = `
  SELECT a.*, a.hotel_info, a.flight_info,
         b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
         b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
         hg.group_name, hg.departure_date,
         u.name AS user_name, u.email AS user_email,
         u.blood_group, u.emergency_contact_name, u.emergency_contact_mobile,
         cp.passport_number, cp.date_of_birth, cp.gender, cp.aadhaar, cp.pan
  FROM agreements a
  LEFT JOIN bookings b  ON b.id  = a.booking_id
  LEFT JOIN hajj_groups hg ON hg.id = b.group_id
  LEFT JOIN users u     ON u.id  = a.customer_id
  LEFT JOIN customer_profiles cp ON cp.user_id = a.customer_id
`;

// ── Build PDF options from enriched DB row ────────────────────────────────────
function buildPdfOpts(ag: any, siteBase: string, override: Partial<AgreementPdfOptions> = {}): AgreementPdfOptions {
  const hi  = (ag.hotel_info  && typeof ag.hotel_info  === "object") ? ag.hotel_info  : {};
  const fi  = (ag.flight_info && typeof ag.flight_info === "object") ? ag.flight_info : {};
  const totalAmt = Number(ag.final_amount || 0);
  const paidAmt  = Number(ag.paid_amount  || 0);
  return {
    agreementNumber:       ag.agreement_number,
    bookingNumber:         ag.booking_number,
    bookingId:             ag.booking_id,
    customerName:          ag.customer_name || ag.user_name || "",
    customerMobile:        ag.customer_mobile || "",
    customerEmail:         ag.customer_email || ag.user_email || null,
    customerPassport:      ag.passport_number  || null,
    customerAadhaar:       ag.aadhaar          || null,
    customerPan:           ag.pan              || null,
    customerDob:           ag.date_of_birth    || null,
    customerBloodGroup:    ag.blood_group       || null,
    customerGender:        ag.gender            || null,
    emergencyContactName:  ag.emergency_contact_name   || null,
    emergencyContactMobile:ag.emergency_contact_mobile || null,
    packageName:           ag.package_name || null,
    numberOfPilgrims:      ag.number_of_pilgrims || null,
    departureDate:         ag.departure_date || null,
    groupName:             ag.group_name || null,
    makkahHotel:           hi.makkahHotel  || null,
    madinahHotel:          hi.madinahHotel || null,
    hotelCheckIn:          hi.checkIn      || null,
    hotelCheckOut:         hi.checkOut     || null,
    roomSharing:           hi.roomSharing  || null,
    hotelDistance:         hi.distance     || null,
    airline:               fi.airline      || null,
    flightNumber:          fi.flightNumber || null,
    flightDeparture:       fi.departure    || null,
    flightArrival:         fi.arrival      || null,
    flightTransit:         fi.transit      || null,
    baggageAllowance:      fi.baggage      || null,
    totalAmount:           totalAmt,
    paidAmount:            paidAmt,
    balanceAmount:         totalAmt - paidAmt,
    discountAmount:        Number(ag.discount_amount || 0) || undefined,
    signatureData:         ag.signature_data || null,
    signedAt:              ag.signed_at ? new Date(ag.signed_at) : null,
    signedIp:              ag.signed_ip || null,
    userAgent:             ag.signed_user_agent || null,
    otpVerified:           !!ag.otp_verified,
    otpVerifiedAt:         ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
    verificationUrl:       `${siteBase}/verify-agreement/${ag.verification_token}`,
    termsAccepted:         ag.terms_accepted || undefined,
    status:                ag.status || "pending_signature",
    agreementDate:         ag.created_at ? new Date(ag.created_at) : null,
    ...override,
  };
}

function getSiteBase(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.SITE_URL || "https://alburhantravels.com");
}

// ── Auto-generate (called after payment confirmed) ────────────────────────────
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
              hg.group_name, hg.departure_date
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE b.id = $1`, [bookingId]
    );
    if (!bRes.rows.length) return;
    const booking = bRes.rows[0];

    const agreementNumber = await generateAgreementNumber();
    const verificationToken = crypto.randomUUID();
    const agId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agreements (id, agreement_number, booking_id, customer_id, status, verification_token, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'pending_signature',$5,NOW(),NOW())`,
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

// ── PUBLIC: QR Verification ───────────────────────────────────────────────────
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.verification_token = $1`, [token]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Agreement not found" });
    const ag = agRes.rows[0];
    res.json({
      agreementNumber: ag.agreement_number,
      bookingNumber:   ag.booking_number,
      customerName:    ag.customer_name,
      packageName:     ag.package_name,
      status:          ag.status,
      signedAt:        ag.signed_at,
      otpVerified:     ag.otp_verified,
      createdAt:       ag.created_at,
      isValid:         ag.status === "signed",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── CUSTOMER: List my agreements ──────────────────────────────────────────────
router.get("/my", requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.customer_id = $1 AND a.status != 'cancelled'
       ORDER BY a.created_at DESC`, [req.user.id]
    );
    res.json({ agreements: result.rows });
  } catch { res.status(500).json({ error: "Failed to load agreements" }); }
});

// ── CUSTOMER: Get agreement detail ────────────────────────────────────────────
router.get("/my/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.customer_id = $2`, [id, req.user.id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    ag.verificationUrl = `${getSiteBase()}/verify-agreement/${ag.verification_token}`;
    ag.clauses = HAJJ_AGREEMENT_CLAUSES.map(c => ({ id: c.id, title: c.title, body: c.body }));
    res.json(ag);
  } catch (err) {
    console.error("[Agreement] My detail error:", err);
    res.status(500).json({ error: "Failed to load agreement" });
  }
});

// ── CUSTOMER: Request OTP ─────────────────────────────────────────────────────
router.post("/my/:id/request-otp", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      `SELECT a.*, b.customer_name, b.customer_mobile
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, req.user.id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Agreement not found" });
    const ag = agRes.rows[0];
    if (ag.status === "signed") return res.status(400).json({ error: "Agreement already signed" });

    const mobile = ag.customer_mobile || req.user.mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number on record" });

    const otp    = String(Math.floor(100000 + Math.random() * 900000));
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
    const { otp, signatureData, termsAccepted } = req.body;

    if (!otp || !signatureData || !termsAccepted) {
      return res.status(400).json({ error: "OTP, signature, and terms acceptance required" });
    }

    const agRes = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.customer_id = $2`, [id, req.user.id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    if (ag.status === "signed") return res.status(400).json({ error: "Already signed" });
    if (!ag.signing_otp || ag.signing_otp !== String(otp)) return res.status(400).json({ error: "Invalid OTP" });
    if (!ag.signing_otp_expires_at || new Date() > new Date(ag.signing_otp_expires_at)) {
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    const requiredClauses = HAJJ_AGREEMENT_CLAUSES.map(c => c.id);
    const unaccepted = requiredClauses.filter(cid => !termsAccepted[cid]);
    if (unaccepted.length > 0) {
      return res.status(400).json({ error: `Please accept all terms. Missing: ${unaccepted.join(", ")}` });
    }

    const ip        = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const now       = new Date();
    const siteBase  = getSiteBase();
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;

    await pool.query(
      `UPDATE agreements SET status='signed', signature_data=$1, terms_accepted=$2,
         signed_at=$3, signed_ip=$4, signed_user_agent=$5,
         otp_verified=true, otp_verified_at=$3,
         signing_otp=NULL, signing_otp_expires_at=NULL, updated_at=NOW()
       WHERE id=$6`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent, id]
    );

    await logAgreementAudit(id, "agreement_signed", { ip, userAgent: userAgent.substring(0, 100), otpVerified: true }, ip, userAgent);

    // Generate PDF
    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase, {
        signatureData,
        signedAt:       now,
        signedIp:       ip,
        userAgent,
        otpVerified:    true,
        otpVerifiedAt:  now,
        verificationUrl,
        termsAccepted,
        status: "signed",
      }));
      await pool.query(`UPDATE agreements SET pdf_generated=true, updated_at=NOW() WHERE id=$1`, [id]);
      await logAgreementAudit(id, "pdf_generated", { size: pdfBuffer.length }, ip, userAgent);
    } catch (pdfErr) { console.error("[Agreement] PDF generation failed:", pdfErr); }

    // Email
    const emailAddr = ag.customer_email || ag.user_email;
    if (emailAddr && pdfBuffer) {
      try {
        const htmlBody = `<p>As-salamu Alaykum <strong>${ag.customer_name || "Valued Customer"}</strong>,</p><p>Alhumdulillah! Your Hajj Agreement has been signed successfully.</p><p><strong>Agreement ID:</strong> ${ag.agreement_number}<br/><strong>Booking ID:</strong> ${ag.booking_number}</p><p>Please find your signed agreement attached. Verify at: <a href="${verificationUrl}">${verificationUrl}</a></p><p>May Allah accept your Hajj. Ameen.<br/>— Al Burhan Tours & Travels</p>`;
        await sendEmail(emailAddr, `Your Hajj Agreement — ${ag.agreement_number}`,
          `Your Hajj Agreement ${ag.agreement_number} has been signed. Verify: ${verificationUrl}`, htmlBody,
          [{ filename: `Agreement-${ag.agreement_number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
        );
        await logAgreementAudit(id, "email_sent", { to: emailAddr });
      } catch (e) { console.error("[Agreement] Email send failed:", e); }
    }

    // WhatsApp
    try {
      if (ag.customer_mobile) {
        await sendPDFDocument(ag.customer_mobile, pdfBuffer, `Agreement-${ag.agreement_number}.pdf`,
          `As-salamu Alaykum ${ag.customer_name}! Your Hajj Agreement (${ag.agreement_number}) has been signed. Booking: ${ag.booking_number}. Verify: ${verificationUrl}`
        );
        await logAgreementAudit(id, "whatsapp_sent", { mobile: ag.customer_mobile.slice(-4).padStart(ag.customer_mobile.length, "*") });
      }
    } catch (e) { console.error("[Agreement] WhatsApp send failed:", e); }

    const payload: any = { ok: true, agreementNumber: ag.agreement_number, message: "Agreement signed successfully." };
    if (pdfBuffer) payload.pdfBase64 = pdfBuffer.toString("base64");
    res.json(payload);
  } catch (err) {
    console.error("[Agreement] Sign error:", err);
    res.status(500).json({ error: "Failed to sign agreement" });
  }
});

// ── CUSTOMER: Download PDF ────────────────────────────────────────────────────
router.get("/my/:id/pdf", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.customer_id = $2`, [id, req.user.id]
    );
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    const buf = await generateAgreementPdfBuffer(buildPdfOpts(ag, getSiteBase()));
    await logAgreementAudit(id, "pdf_downloaded_customer", {}, getClientIp(req), req.headers["user-agent"]);
    const safeName = ag.agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Agreement-${safeName}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error("[Agreement] Customer PDF error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── ADMIN: List agreements ────────────────────────────────────────────────────
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
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id ${where}`, params
    );
    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       ${where} ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );
    res.json({ agreements: result.rows, total: parseInt(countRes.rows[0].count), page: parseInt(page), pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) });
  } catch { res.status(500).json({ error: "Failed to load agreements" }); }
});

// ── ADMIN: Get single agreement ───────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const logsRes = await pool.query(`SELECT * FROM agreement_audit_logs WHERE agreement_id=$1 ORDER BY created_at ASC`, [id]);
    ag.auditLogs = logsRes.rows;
    ag.verificationUrl = `${getSiteBase()}/verify-agreement/${ag.verification_token}`;
    ag.clauses = HAJJ_AGREEMENT_CLAUSES.map(c => ({ id: c.id, title: c.title }));
    res.json(ag);
  } catch { res.status(500).json({ error: "Failed to load agreement" }); }
});

// ── ADMIN: Manual generate for booking ───────────────────────────────────────
router.post("/generate/:bookingId", requireAdmin, async (req: any, res) => {
  try {
    const { bookingId } = req.params;
    await autoGenerateAgreement(bookingId);
    const agRes = await pool.query(`SELECT * FROM agreements WHERE booking_id=$1 AND status!='cancelled' ORDER BY created_at DESC LIMIT 1`, [bookingId]);
    if (!agRes.rows.length) return res.status(400).json({ error: "Could not generate agreement" });
    res.json({ ok: true, agreement: agRes.rows[0] });
  } catch { res.status(500).json({ error: "Generation failed" }); }
});

// ── ADMIN: Update hotel & flight details ──────────────────────────────────────
router.put("/:id/details", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const {
      makkahHotel, madinahHotel, checkIn, checkOut, roomSharing, distance,
      airline, flightNumber, departure, arrival, transit, baggage,
    } = req.body;

    const hotel_info  = { makkahHotel, madinahHotel, checkIn, checkOut, roomSharing, distance };
    const flight_info = { airline, flightNumber, departure, arrival, transit, baggage };

    await pool.query(
      `UPDATE agreements SET hotel_info=$1, flight_info=$2, updated_at=NOW() WHERE id=$3`,
      [JSON.stringify(hotel_info), JSON.stringify(flight_info), id]
    );
    await logAgreementAudit(id, "details_updated_admin", { adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true });
  } catch (err) {
    console.error("[Agreement] Details update error:", err);
    res.status(500).json({ error: "Failed to update details" });
  }
});

// ── ADMIN: Download PDF ───────────────────────────────────────────────────────
router.get("/:id/pdf", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const buf = await generateAgreementPdfBuffer(buildPdfOpts(ag, getSiteBase()));
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

// ── ADMIN: Audit logs ─────────────────────────────────────────────────────────
router.get("/:id/audit", requireAdmin, async (req: any, res) => {
  try {
    const result = await pool.query(`SELECT * FROM agreement_audit_logs WHERE agreement_id=$1 ORDER BY created_at ASC`, [req.params.id]);
    res.json({ logs: result.rows });
  } catch { res.status(500).json({ error: "Failed to load audit logs" }); }
});

// ── ADMIN: Resend email ───────────────────────────────────────────────────────
router.post("/:id/resend-email", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const emailTo = ag.customer_email || ag.user_email;
    if (!emailTo) return res.status(400).json({ error: "No email on record" });

    const siteBase = getSiteBase();
    const buf = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase));
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;
    await sendEmail(emailTo, `Your Hajj Agreement — ${ag.agreement_number}`,
      `Your Hajj Agreement ${ag.agreement_number} is attached. Verify at: ${verificationUrl}`,
      `<p>Please find your Hajj Agreement (${ag.agreement_number}) attached.</p><p>Verify at: <a href="${verificationUrl}">${verificationUrl}</a></p>`,
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
    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const mobile = ag.customer_mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number" });

    const siteBase = getSiteBase();
    const buf = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase));
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;
    await sendPDFDocument(mobile, buf, `Agreement-${ag.agreement_number}.pdf`,
      `As-salamu Alaykum ${ag.customer_name || ""}! Your Hajj Agreement (${ag.agreement_number}) from Al Burhan Tours & Travels. Booking: ${ag.booking_number}. Verify: ${verificationUrl}`
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
  } catch { res.status(500).json({ error: "Failed to cancel" }); }
});

// ── ADMIN: Regenerate agreement ───────────────────────────────────────────────
router.post("/:id/regenerate", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(`SELECT * FROM agreements WHERE id=$1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    await pool.query(`UPDATE agreements SET status='cancelled', cancelled_at=NOW(), cancelled_reason='Regenerated by admin', updated_at=NOW() WHERE id=$1`, [id]);
    await logAgreementAudit(id, "agreement_cancelled_for_regen", { adminId: req.user?.id }, getClientIp(req));

    await autoGenerateAgreement(ag.booking_id);
    const newAg = await pool.query(`SELECT * FROM agreements WHERE booking_id=$1 AND status!='cancelled' ORDER BY created_at DESC LIMIT 1`, [ag.booking_id]);
    res.json({ ok: true, newAgreement: newAg.rows[0] || null });
  } catch { res.status(500).json({ error: "Failed to regenerate" }); }
});

// ── ADMIN: Update status ──────────────────────────────────────────────────────
router.patch("/:id/status", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ["pending_signature", "signed", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });

    let q = `UPDATE agreements SET status=$1, updated_at=NOW()`;
    const params: any[] = [status, id];
    if (status === "cancelled")  q += `, cancelled_at=NOW(), cancelled_reason='Updated by admin'`;
    else if (status === "signed") q += `, signed_at=COALESCE(signed_at, NOW())`;
    q += ` WHERE id=$2`;
    await pool.query(q, params);
    await logAgreementAudit(id, "status_updated_admin", { newStatus: status, adminId: req.user?.id }, getClientIp(req));
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id WHERE a.id=$1`, [id]
    );
    res.json({ ok: true, agreement: agRes.rows[0] });
  } catch (err) {
    console.error("[Agreement] Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// ── ADMIN: Backfill missing agreements ────────────────────────────────────────
router.post("/backfill-approved", requireAdmin, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.booking_number FROM bookings b
       WHERE b.status IN ('approved','confirmed','partially_paid')
         AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.booking_id=b.id AND a.status != 'cancelled')
       ORDER BY b.created_at DESC`
    );
    let created = 0;
    const skipped: string[] = [];
    for (const row of rows) {
      try { await autoGenerateAgreement(row.id); created++; }
      catch (e: any) { skipped.push(row.booking_number); console.error(`[Agreement] Backfill failed for ${row.booking_number}:`, e?.message); }
    }
    res.json({ ok: true, found: rows.length, created, skipped });
  } catch (err) {
    console.error("[Agreement] Backfill error:", err);
    res.status(500).json({ error: "Backfill failed" });
  }
});

// ── ADMIN: Ensure agreement for booking ──────────────────────────────────────
router.post("/ensure/:bookingId", requireAdmin, async (req: any, res) => {
  try {
    const { bookingId } = req.params;
    await autoGenerateAgreement(bookingId);
    const agRes = await pool.query(
      `SELECT a.*, b.booking_number, b.customer_name, b.customer_mobile, b.package_name, b.final_amount, b.paid_amount
       FROM agreements a LEFT JOIN bookings b ON b.id=a.booking_id
       WHERE a.booking_id=$1 AND a.status!='cancelled' ORDER BY a.created_at DESC LIMIT 1`, [bookingId]
    );
    if (!agRes.rows.length) return res.status(400).json({ error: "Could not create agreement" });
    res.json({ ok: true, agreement: agRes.rows[0] });
  } catch { res.status(500).json({ error: "Failed to ensure agreement" }); }
});

export default router;
