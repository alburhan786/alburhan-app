// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { sendOtpSMS, sendEmail } from "../lib/notifications.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { generateAgreementPdfBuffer, HAJJ_AGREEMENT_CLAUSES, CONSENT_CATEGORIES, AgreementPdfOptions } from "../lib/agreementPdf.js";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { sendPDFDocument } from "../lib/botbee.js";
import crypto from "crypto";

const router = Router();

// ── Startup migration — ensure all columns exist ──────────────────────────────
;(async () => {
  try {
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS hotel_info  JSONB`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS flight_info JSONB`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS signing_metadata JSONB`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS digital_hash TEXT`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS void_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS void_reason TEXT`);
    console.log("[Agreement] agreements columns ensured");
    // Extended customer_profiles columns (safe — no-ops if already exist)
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS father_name TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS nationality TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS state TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India'`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS passport_issue_date DATE`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS passport_expiry DATE`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS nominee TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS nominee_relation TEXT`);
    await pool.query(`ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT`);
    console.log("[Agreement] customer_profiles extended columns ensured");
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
  SELECT a.*, a.hotel_info, a.flight_info, a.signing_metadata, a.digital_hash, a.revision_number,
         b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
         b.package_name, b.final_amount, b.paid_amount, b.number_of_pilgrims,
         b.created_at AS booking_date, b.status AS booking_status,
         hg.group_name, hg.group_number, hg.departure_date, hg.return_date,
         u.name AS user_name, u.email AS user_email,
         u.blood_group, u.emergency_contact_name, u.emergency_contact_mobile,
         cp.passport_number, cp.date_of_birth, cp.gender,
         cp.aadhar_number AS aadhaar, cp.pan_number AS pan,
         cp.nationality, cp.father_name, cp.city, cp.state, cp.country,
         cp.passport_issue_date, cp.passport_expiry,
         cp.nominee, cp.nominee_relation, cp.whatsapp_number,
         cp.photo_url, cp.aadhar_image_url, cp.pan_image_url, cp.passport_image_url
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
  const sm  = (ag.signing_metadata && typeof ag.signing_metadata === "object") ? ag.signing_metadata : {};
  const totalAmt = Number(ag.final_amount || 0);
  const paidAmt  = Number(ag.paid_amount  || 0);
  return {
    agreementNumber:        ag.agreement_number,
    bookingNumber:          ag.booking_number,
    bookingId:              ag.booking_id,
    status:                 ag.status || "pending_signature",
    agreementDate:          ag.created_at ? new Date(ag.created_at) : null,
    // Customer KYC
    customerName:           ag.customer_name || ag.user_name || "",
    customerFatherName:     ag.father_name || null,
    customerMobile:         ag.customer_mobile || "",
    customerWhatsApp:       ag.whatsapp_number || ag.customer_mobile || null,
    customerEmail:          ag.customer_email || ag.user_email || null,
    customerPassport:       ag.passport_number || null,
    passportIssueDate:      ag.passport_issue_date || null,
    passportExpiry:         ag.passport_expiry || null,
    customerAadhaar:        ag.aadhaar || null,
    customerPan:            ag.pan || null,
    customerDob:            ag.date_of_birth || null,
    customerGender:         ag.gender || null,
    customerNationality:    ag.nationality || null,
    customerBloodGroup:     ag.blood_group || null,
    customerAddress:        ag.customer_address || null,
    customerCity:           ag.city || null,
    customerState:          ag.state || null,
    customerCountry:        ag.country || null,
    nominee:                ag.nominee || null,
    nomineeRelation:        ag.nominee_relation || null,
    emergencyContactName:   ag.emergency_contact_name || null,
    emergencyContactMobile: ag.emergency_contact_mobile || null,
    // Package
    packageName:            ag.package_name || null,
    packageType:            hi.packageType || null,
    packageCategory:        hi.packageCategory || null,
    hajjYear:               hi.hajjYear || String(new Date(ag.departure_date || Date.now()).getFullYear()),
    numberOfPilgrims:       ag.number_of_pilgrims || null,
    bookingDate:            ag.booking_date || null,
    departureDate:          ag.departure_date || null,
    returnDate:             ag.return_date || null,
    duration:               hi.duration || null,
    groupName:              ag.group_name || null,
    groupNumber:            ag.group_number || null,
    maktabNumber:           ag.maktab_number || hi.maktabNumber || null,
    bookingStatus:          ag.booking_status || null,
    // Hotels
    makkahHotel:            hi.makkahHotel || null,
    makkahCategory:         hi.makkahCategory || null,
    makkahAddress:          hi.makkahAddress || null,
    makkahDistance:         hi.makkahDistance || null,
    makkahCheckIn:          hi.makkahCheckIn || null,
    makkahCheckOut:         hi.makkahCheckOut || null,
    madinahHotel:           hi.madinahHotel || null,
    madinahCategory:        hi.madinahCategory || null,
    madinahDistance:        hi.madinahDistance || null,
    madinahCheckIn:         hi.madinahCheckIn || null,
    madinahCheckOut:        hi.madinahCheckOut || null,
    aziziyahHotel:          hi.aziziyahHotel || null,
    aziziyahDistance:       hi.aziziyahDistance || null,
    aziziyahCheckIn:        hi.aziziyahCheckIn || null,
    aziziyahCheckOut:       hi.aziziyahCheckOut || null,
    minaCategory:           hi.minaCategory || null,
    minaTentNumber:         hi.minaTentNumber || null,
    minaMaktabNumber:       hi.minaMaktabNumber || null,
    minaZone:               hi.minaZone || null,
    roomSharing:            hi.roomSharing || null,
    // Transport
    airportTransfer:        hi.airportTransfer || null,
    busService:             hi.busService || null,
    guideService:           hi.guideService || null,
    internalTransport:      hi.internalTransport || null,
    // Flights
    airline:                fi.airline || null,
    flightNumber:           fi.flightNumber || null,
    flightPnr:              fi.pnr || null,
    departureAirport:       fi.departureAirport || null,
    flightDeparture:        fi.departure || null,
    flightArrival:          fi.arrival || null,
    flightTransit:          fi.transit || null,
    baggageAllowance:       fi.baggage || null,
    cabinBaggage:           fi.cabinBaggage || null,
    returnFlightNumber:     fi.returnFlightNumber || null,
    // Financial
    totalAmount:            totalAmt,
    paidAmount:             paidAmt,
    balanceAmount:          totalAmt - paidAmt,
    discountAmount:         Number(ag.discount_amount || 0) || undefined,
    gstAmount:              Number(ag.gst_amount || hi.gstAmount || 0) || undefined,
    tcsAmount:              Number(ag.tcs_amount || hi.tcsAmount || 0) || undefined,
    govtCharges:            Number(hi.govtCharges || 0) || undefined,
    visaCharges:            Number(hi.visaCharges || 0) || undefined,
    dueDate:                hi.dueDate || null,
    paymentStatus:          paidAmt >= totalAmt && totalAmt > 0 ? "Fully Paid" : paidAmt > 0 ? "Partially Paid" : "Pending",
    // Signing
    signatureData:          ag.signature_data || null,
    signedAt:               ag.signed_at ? new Date(ag.signed_at) : null,
    signedIp:               ag.signed_ip || null,
    userAgent:              ag.signed_user_agent || null,
    signingBrowser:         sm.browser || null,
    signingDevice:          sm.device || null,
    signingOS:              sm.os || null,
    signingGPS:             sm.gps || null,
    digitalHash:            ag.digital_hash || null,
    otpVerified:            !!ag.otp_verified,
    otpVerifiedAt:          ag.otp_verified_at ? new Date(ag.otp_verified_at) : null,
    verificationUrl:        `${siteBase}/verify-agreement/${ag.verification_token}`,
    termsAccepted:          ag.terms_accepted || undefined,
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

    // Notify customer via WhatsApp — agreement_ready template (fire-and-forget)
    const signingUrl = `https://alburhantravels.com/sign-agreement/${verificationToken}`;
    triggerWorkflow("agreement_generated", {
      customerName: booking.customer_name || booking.customer_name_user,
      customerMobile: booking.mobile_india,
      bookingNumber: booking.booking_number,
      packageName: booking.package_name,
      agreementUrl: signingUrl,
    }, booking.id, booking.customer_id).catch(e => console.error("[Agreement] auto-notify failed:", e));
  } catch (err) {
    console.error("[Agreement] autoGenerateAgreement error:", err);
  }
}

// ── UUID validation helper ────────────────────────────────────────────────────
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ── PUBLIC: QR Verification ───────────────────────────────────────────────────
router.get("/verify/:token", async (req, res) => {
  const { token } = req.params;
  const looksLikeUUID = isUUID(token);
  console.log(`[AgreementVerify] ▶ Request received | token="${token}" | isUUID=${looksLikeUUID}`);

  try {
    let ag: any = null;
    const searched: string[] = [];

    // ── Step 1: verification_token (UUID column — only try if token is valid UUID) ──
    if (looksLikeUUID) {
      searched.push("verification_token");
      console.log(`[AgreementVerify] SQL #1: WHERE verification_token = '${token}'`);
      const r1 = await pool.query(
        `SELECT a.*, b.booking_number, b.customer_name, b.package_name, b.final_amount, b.paid_amount
         FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
         WHERE a.verification_token = $1`, [token]
      );
      console.log(`[AgreementVerify] Rows by verification_token: ${r1.rows.length}`);
      ag = r1.rows[0] || null;
    }

    // ── Step 2: agreement_number (TEXT — always safe, e.g. ABT-AGR-2026-000001) ──
    if (!ag) {
      searched.push("agreement_number");
      console.log(`[AgreementVerify] SQL #2: WHERE agreement_number = '${token}'`);
      const r2 = await pool.query(
        `SELECT a.*, b.booking_number, b.customer_name, b.package_name, b.final_amount, b.paid_amount
         FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
         WHERE a.agreement_number = $1`, [token]
      );
      console.log(`[AgreementVerify] Rows by agreement_number: ${r2.rows.length}`);
      ag = r2.rows[0] || null;
    }

    // ── Step 3: internal UUID id (only if token is UUID and not yet found) ──
    if (!ag && looksLikeUUID) {
      searched.push("id");
      console.log(`[AgreementVerify] SQL #3: WHERE id = '${token}'`);
      const r3 = await pool.query(
        `SELECT a.*, b.booking_number, b.customer_name, b.package_name, b.final_amount, b.paid_amount
         FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
         WHERE a.id = $1`, [token]
      );
      console.log(`[AgreementVerify] Rows by id: ${r3.rows.length}`);
      ag = r3.rows[0] || null;
    }

    if (!ag) {
      const countRes = await pool.query(`SELECT COUNT(*) FROM agreements`);
      const totalAgreements = parseInt(countRes.rows[0].count || "0");
      console.log(`[AgreementVerify] ❌ No match found | total agreements in DB: ${totalAgreements} | searched: ${searched.join(", ")}`);
      const response = {
        error: "Agreement not found",
        debug: { searchedToken: token, totalAgreementsInDB: totalAgreements, searchedFields: searched },
      };
      console.log(`[AgreementVerify] Response:`, JSON.stringify(response));
      return res.status(404).json(response);
    }

    const response = {
      agreementNumber: ag.agreement_number,
      bookingNumber:   ag.booking_number,
      customerName:    ag.customer_name,
      packageName:     ag.package_name,
      status:          ag.status,
      signedAt:        ag.signed_at,
      otpVerified:     ag.otp_verified,
      createdAt:       ag.created_at,
      isValid:         ag.status === "signed",
    };
    console.log(`[AgreementVerify] ✅ Found: ${ag.agreement_number} | status: ${ag.status} | isValid: ${response.isValid}`);
    console.log(`[AgreementVerify] Full response:`, JSON.stringify(response));
    res.json(response);
  } catch (err: any) {
    console.error(`[AgreementVerify] ❌ Exception:`, err);
    res.status(500).json({ error: "Verification failed", detail: err?.message || "Unknown error" });
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
    ag.clauses = CONSENT_CATEGORIES.map(c => ({ id: c.id, title: c.title, body: c.body }));
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

    const requiredConsents = CONSENT_CATEGORIES.map(c => c.id);
    const unaccepted = requiredConsents.filter(cid => !termsAccepted[cid]);
    if (unaccepted.length > 0) {
      return res.status(400).json({ error: `Please accept all consent categories. Missing: ${unaccepted.join(", ")}` });
    }

    const ip        = getClientIp(req);
    const userAgent = req.headers["user-agent"] || "";
    const now       = new Date();
    const siteBase  = getSiteBase();
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token}`;

    // Parse browser/device metadata from request body
    const { signingBrowser, signingDevice, signingOS, signingGPS } = req.body;
    const signingMetadata = {
      browser: signingBrowser || null,
      device:  signingDevice  || null,
      os:      signingOS      || null,
      gps:     signingGPS     || null,
      userAgent: userAgent.substring(0, 200),
      timestamp: now.toISOString(),
    };

    // Generate SHA-256 hash of the signed content
    const hashInput = `${id}:${ag.agreement_number}:${signatureData}:${now.toISOString()}:${ip}`;
    const digitalHash = createHash("sha256").update(hashInput).digest("hex");

    await pool.query(
      `UPDATE agreements SET status='signed', signature_data=$1, terms_accepted=$2,
         signed_at=$3, signed_ip=$4, signed_user_agent=$5,
         otp_verified=true, otp_verified_at=$3,
         signing_otp=NULL, signing_otp_expires_at=NULL,
         signing_metadata=$6, digital_hash=$7,
         updated_at=NOW()
       WHERE id=$8`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent, JSON.stringify(signingMetadata), digitalHash, id]
    );

    await logAgreementAudit(id, "agreement_signed", { ip, userAgent: userAgent.substring(0, 100), otpVerified: true, digitalHash: digitalHash.substring(0, 16) }, ip, userAgent);

    // Notify via agreement_signed template (fire-and-forget)
    if (ag.customer_mobile) {
      triggerWorkflow("agreement_signed", {
        customerName: ag.customer_name || "Valued Customer",
        customerMobile: ag.customer_mobile,
        bookingNumber: ag.booking_number,
        packageName: ag.package_name,
        signedDate: new Date().toLocaleDateString("en-IN"),
      }, ag.booking_id, ag.customer_id).catch(e => console.error("[Agreement] signed-notify failed:", e));
    }

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
    ag.clauses = CONSENT_CATEGORIES.map(c => ({ id: c.id, title: c.title, body: c.body }));
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

// ── ADMIN: Update hotel & flight details (extended) ───────────────────────────
router.put("/:id/details", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const hotel_info = {
      // Makkah
      makkahHotel: b.makkahHotel, makkahCategory: b.makkahCategory,
      makkahAddress: b.makkahAddress, makkahDistance: b.makkahDistance,
      makkahCheckIn: b.makkahCheckIn, makkahCheckOut: b.makkahCheckOut,
      // Madinah
      madinahHotel: b.madinahHotel, madinahCategory: b.madinahCategory,
      madinahDistance: b.madinahDistance, madinahCheckIn: b.madinahCheckIn, madinahCheckOut: b.madinahCheckOut,
      // Aziziyah
      aziziyahHotel: b.aziziyahHotel, aziziyahDistance: b.aziziyahDistance,
      aziziyahCheckIn: b.aziziyahCheckIn, aziziyahCheckOut: b.aziziyahCheckOut,
      // Mina
      minaCategory: b.minaCategory, minaTentNumber: b.minaTentNumber,
      minaMaktabNumber: b.minaMaktabNumber, minaZone: b.minaZone,
      // Room & transport
      roomSharing: b.roomSharing,
      airportTransfer: b.airportTransfer, busService: b.busService,
      guideService: b.guideService, internalTransport: b.internalTransport,
      // Package extras
      packageType: b.packageType, packageCategory: b.packageCategory,
      hajjYear: b.hajjYear, duration: b.duration, maktabNumber: b.maktabNumber,
      gstAmount: b.gstAmount, tcsAmount: b.tcsAmount,
      govtCharges: b.govtCharges, visaCharges: b.visaCharges, dueDate: b.dueDate,
    };
    const flight_info = {
      airline: b.airline, flightNumber: b.flightNumber, pnr: b.flightPnr,
      departureAirport: b.departureAirport, departure: b.flightDeparture,
      arrival: b.flightArrival, transit: b.flightTransit,
      baggage: b.baggageAllowance, cabinBaggage: b.cabinBaggage,
      returnFlightNumber: b.returnFlightNumber,
    };

    // Get existing then merge to avoid overwriting unset fields
    const existing = await pool.query(`SELECT hotel_info, flight_info FROM agreements WHERE id=$1`, [id]);
    const prevHi = (existing.rows[0]?.hotel_info && typeof existing.rows[0].hotel_info === "object") ? existing.rows[0].hotel_info : {};
    const prevFi = (existing.rows[0]?.flight_info && typeof existing.rows[0].flight_info === "object") ? existing.rows[0].flight_info : {};
    const mergedHi = { ...prevHi, ...Object.fromEntries(Object.entries(hotel_info).filter(([,v]) => v != null && v !== "")) };
    const mergedFi = { ...prevFi, ...Object.fromEntries(Object.entries(flight_info).filter(([,v]) => v != null && v !== "")) };

    await pool.query(
      `UPDATE agreements SET hotel_info=$1, flight_info=$2, updated_at=NOW() WHERE id=$3`,
      [JSON.stringify(mergedHi), JSON.stringify(mergedFi), id]
    );
    await logAgreementAudit(id, "details_updated_admin", { adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true, hotel_info: mergedHi, flight_info: mergedFi });
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

// ── ADMIN: PNG/JPEG export ────────────────────────────────────────────────────
router.get("/:id/image", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const format = String(req.query.format || "jpeg").toLowerCase();
    if (!["png", "jpeg", "jpg"].includes(format)) return res.status(400).json({ error: "format must be png or jpeg" });

    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];
    const pdfBuf = await generateAgreementPdfBuffer(buildPdfOpts(ag, getSiteBase()));

    // Attempt GhostScript conversion (gs must be available on VPS)
    const ext = format === "jpg" ? "jpeg" : format;
    const mimeType = `image/${ext}`;
    const gsDevice = format === "png" ? "png16m" : "jpeg";

    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gs = spawn("gs", [
        "-dNOPAUSE", "-dBATCH", "-dSAFER",
        `-sDEVICE=${gsDevice}`,
        "-r300", "-dFirstPage=1", "-dLastPage=1",
        "-sOutputFile=-",
        "-q", "-"
      ]);
      gs.stdin.write(pdfBuf);
      gs.stdin.end();
      gs.stdout.on("data", (c: Buffer) => chunks.push(c));
      gs.on("close", (code) => {
        if (code === 0 && chunks.length > 0) {
          const imgBuf = Buffer.concat(chunks);
          const safeName = ag.agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Disposition", `attachment; filename="Agreement-${safeName}.${ext}"`);
          res.send(imgBuf);
          resolve();
        } else {
          reject(new Error(`gs exit ${code}`));
        }
      });
      gs.on("error", reject);
    });
    await logAgreementAudit(id, "image_downloaded_admin", { format, adminId: req.user?.id }, getClientIp(req));
  } catch (err) {
    console.error("[Agreement] Image export error (gs may not be installed):", err);
    // Fallback: serve the PDF
    try {
      const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [req.params.id]);
      if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
      const buf = await generateAgreementPdfBuffer(buildPdfOpts(agRes.rows[0], getSiteBase()));
      const safeName = agRes.rows[0].agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Agreement-${safeName}.pdf"`);
      res.send(buf);
    } catch (e2) {
      res.status(500).json({ error: "Image export failed (GhostScript not available); PDF fallback also failed." });
    }
  }
});

// ── ADMIN: Void agreement (different from cancel) ─────────────────────────────
router.post("/:id/void", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await pool.query(
      `UPDATE agreements SET status='void', void_at=NOW(), void_reason=$1, cancelled_reason=$1, updated_at=NOW() WHERE id=$2`,
      [reason || "Voided by admin", id]
    );
    await logAgreementAudit(id, "agreement_voided", { reason, adminId: req.user?.id }, getClientIp(req));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed to void" }); }
});

// ── ADMIN: Reissue voided/cancelled agreement ─────────────────────────────────
router.post("/:id/reissue", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(`SELECT * FROM agreements WHERE id=$1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    const rev = (ag.revision_number || 1) + 1;
    // Reset to pending_signature, clear signing data, bump revision
    await pool.query(
      `UPDATE agreements SET status='pending_signature',
         signature_data=NULL, terms_accepted=NULL, signed_at=NULL, signed_ip=NULL,
         signed_user_agent=NULL, otp_verified=false, otp_verified_at=NULL,
         signing_otp=NULL, signing_otp_expires_at=NULL,
         signing_metadata=NULL, digital_hash=NULL,
         revision_number=$1, void_at=NULL, void_reason=NULL,
         cancelled_at=NULL, cancelled_reason=NULL,
         updated_at=NOW()
       WHERE id=$2`,
      [rev, id]
    );
    await logAgreementAudit(id, "agreement_reissued", { revision: rev, adminId: req.user?.id }, getClientIp(req));
    const newAg = await pool.query(RICH_SELECT + `WHERE a.id=$1`, [id]);
    res.json({ ok: true, agreement: newAg.rows[0] });
  } catch (err) {
    console.error("[Agreement] Reissue error:", err);
    res.status(500).json({ error: "Failed to reissue" });
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
