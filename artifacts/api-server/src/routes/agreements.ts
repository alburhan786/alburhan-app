// @ts-nocheck
import { Router } from "express";
import fs from "fs";
import path from "path";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { sendOtpSMS, sendEmail } from "../lib/notifications.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { generateAgreementPdfBuffer, HAJJ_AGREEMENT_CLAUSES, CONSENT_CATEGORIES, AgreementPdfOptions } from "../lib/agreementPdf.js";
import { sendDocumentToCustomer } from "../lib/documentDelivery.js";
import { objectStorageClient } from "../lib/objectStorage.js";
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

    // ── Safe revision unique index ──────────────────────────────────────────
    // Step 1: backfill NULLs (rows created before the column existed)
    await pool.query(`UPDATE agreements SET revision_number = 1 WHERE revision_number IS NULL`);

    // Step 2: fix any (booking_id, revision_number) duplicates among pending_signature rows.
    // Old "regenerate" behaviour could leave two pending_signature rows both with revision_number=1.
    // Assign sequential revision numbers within each booking family so the unique index can be
    // created without conflict.
    await pool.query(`
      UPDATE agreements a
         SET revision_number = sub.rn
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY booking_id ORDER BY created_at) AS rn
            FROM agreements
           WHERE status = 'pending_signature'
        ) sub
       WHERE a.id = sub.id
         AND a.revision_number IS DISTINCT FROM sub.rn
    `);

    // Step 3: drop stale index if predicate is wrong (old runs used status!='superseded').
    // We compare the stored predicate text; if the index doesn't exist this is a no-op.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = 'agreements'
            AND indexname  = 'agreements_booking_revision_uniq'
            AND indexdef NOT LIKE '%pending_signature%'
        ) THEN
          DROP INDEX agreements_booking_revision_uniq;
        END IF;
      END
      $$
    `);

    // Step 4: create with the correct predicate — pending_signature only.
    // This excludes cancelled/voided/superseded rows so legacy regenerate history
    // (where two rows share revision_number=1 but one is cancelled) never conflicts.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS agreements_booking_revision_uniq
      ON agreements(booking_id, revision_number)
      WHERE status = 'pending_signature'
    `);
    console.log("[Agreement] revision unique index ensured (predicate: pending_signature)");
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS void_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS void_reason TEXT`);
    console.log("[Agreement] agreements columns ensured");
    // ── PERMANENT FIX: ensure verification_token is never NULL ─────────────
    // 1. Backfill any existing NULL tokens
    const backfill = await pool.query(
      `UPDATE agreements SET verification_token = gen_random_uuid(), updated_at = NOW()
       WHERE verification_token IS NULL RETURNING agreement_number`
    );
    if (backfill.rowCount && backfill.rowCount > 0) {
      console.log(`[Agreement] ✅ Backfilled ${backfill.rowCount} NULL verification_token(s):`);
      backfill.rows.forEach((r: any) => console.log(`  → ${r.agreement_number}`));
    }
    // 2. Set column DEFAULT so all future INSERTs that omit the field get a UUID automatically
    await pool.query(`ALTER TABLE agreements ALTER COLUMN verification_token SET DEFAULT gen_random_uuid()`);
    console.log("[Agreement] verification_token DEFAULT gen_random_uuid() enforced");
    // 3. Secure access token for public signing links (separate from verification_token)
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS access_token TEXT`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ`);
    await pool.query(`CREATE INDEX IF NOT EXISTS agreements_access_token_idx ON agreements (access_token) WHERE access_token IS NOT NULL`);
    // Backfill access_token for any unsigned agreements (so admin resend can use them).
    // Uses gen_random_uuid() concatenation — available without pgcrypto, 128-bit entropy per half.
    const backfillAt = await pool.query(
      `UPDATE agreements
         SET access_token            = REPLACE(gen_random_uuid()::text,'-','') || REPLACE(gen_random_uuid()::text,'-',''),
             access_token_expires_at = NOW() + INTERVAL '30 days',
             updated_at              = NOW()
       WHERE status = 'pending_signature'
         AND access_token IS NULL
       RETURNING agreement_number`
    );
    if (backfillAt.rowCount && backfillAt.rowCount > 0) {
      console.log(`[Agreement] ✅ Backfilled access_token for ${backfillAt.rowCount} unsigned agreement(s) (30-day compat window)`);
    }
    console.log("[Agreement] access_token columns ensured");
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
    // Superseded tracking — allows reissue history to be stored
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS superseded_reason TEXT`);
    // Revision snapshot columns — store who corrected, why, and what changed
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS superseded_by_admin_id TEXT`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS correction_reason TEXT`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS old_data_snapshot JSONB`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS new_data_snapshot JSONB`);
    console.log("[Agreement] superseded + revision snapshot columns ensured");
    // Financial override columns — stored on the agreement row so reissues carry values forward
    // and PDF generation never fabricates amounts.
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS tcs_amount      NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS gst_amount      NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE agreements ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2)`);
    console.log("[Agreement] financial columns ensured (tcs/gst/discount)");
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

export async function logAgreementAudit(agreementId: string, action: string, details: any, ip?: string, userAgent?: string) {
  try {
    await pool.query(
      `INSERT INTO agreement_audit_logs (id, agreement_id, action, details, ip_address, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [crypto.randomUUID(), agreementId, action, JSON.stringify(details), ip || null, userAgent || null]
    );
  } catch (e) { console.error("[AgreementAudit] log failed:", e); }
}

// ── Enriched SQL query fragment ───────────────────────────────────────────────
// Joins payment_transactions for real paid amounts (bookings.paid_amount can lag).
// LATERAL subquery gets latest invoice total; falls back to bookings.final_amount.
const RICH_SELECT = `
  SELECT a.*, a.hotel_info, a.flight_info, a.signing_metadata, a.digital_hash, a.revision_number,
         a.superseded_at, a.superseded_reason,
         a.superseded_by_admin_id, a.correction_reason,
         b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
         b.package_name,
         COALESCE(NULLIF(inv_lat.invoice_total::text,''), NULLIF(b.final_amount::text,''), '0')::numeric AS final_amount,
         COALESCE(pt_agg.verified_paid, b.paid_amount::numeric, 0) AS paid_amount,
         b.number_of_pilgrims,
         b.created_at AS booking_date, b.status AS booking_status,
         hg.group_name, hg.departure_date, hg.return_date,
         u.name AS user_name, u.email AS user_email,
         u.blood_group, u.emergency_contact_name, u.emergency_contact_mobile,
         cp.passport_number, cp.date_of_birth, cp.gender,
         cp.aadhar_number AS aadhaar, cp.pan_number AS pan,
         cp.nationality, cp.father_name, cp.city, cp.state, cp.country,
         cp.passport_issue_date, cp.passport_expiry,
         cp.nominee, cp.nominee_relation, cp.whatsapp_number,
         cp.address, cp.photo_url, cp.aadhar_image_url, cp.pan_image_url, cp.passport_image_url,
         pkg.type AS pkg_type, pkg.name AS pkg_db_name,
         inv_lat.invoice_number, inv_lat.invoice_status
  FROM agreements a
  LEFT JOIN bookings b  ON b.id  = a.booking_id
  LEFT JOIN hajj_groups hg ON hg.id = b.group_id
  LEFT JOIN users u     ON u.id  = a.customer_id
  LEFT JOIN customer_profiles cp ON cp.user_id = a.customer_id
  LEFT JOIN packages pkg ON pkg.id = b.package_id
  LEFT JOIN LATERAL (
    SELECT i.total          AS invoice_total,
           i.paid           AS invoice_paid,
           i.invoice_number,
           i.invoice_status
    FROM   invoices i
    WHERE  i.booking_id = b.id
    ORDER  BY i.created_at DESC
    LIMIT  1
  ) inv_lat ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pt.amount) AS verified_paid
    FROM   payment_transactions pt
    WHERE  pt.booking_id  = b.id
      AND  (pt.is_deleted IS NULL OR pt.is_deleted = false)
  ) pt_agg ON true
`;

// ── Build PDF options from enriched DB row ────────────────────────────────────
export function buildPdfOpts(ag: any, siteBase: string, override: Partial<AgreementPdfOptions> = {}): AgreementPdfOptions {
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
    customerAddress:        ag.address || null,
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
    // Package type — from packages table (db) overrides hotel_info display label
    packageTypeDb:          ag.pkg_type  || null,
    revisionNumber:         ag.revision_number || null,
    // Financial
    totalAmount:            totalAmt,
    paidAmount:             paidAmt,
    balanceAmount:          totalAmt - paidAmt,
    // Financial overrides: nullish checks so explicit 0 is preserved, not treated as falsy.
    // ag.discount_amount / gst_amount / tcs_amount are set by /revise corrections; fall back
    // to hotel_info legacy values only when no DB row override exists (null/undefined).
    discountAmount:         ag.discount_amount != null ? Number(ag.discount_amount) : (hi.discountAmount != null ? Number(hi.discountAmount) : undefined),
    gstAmount:              ag.gst_amount      != null ? Number(ag.gst_amount)      : (hi.gstAmount      != null ? Number(hi.gstAmount)      : undefined),
    // TCS: only use explicitly stored values — never fabricate a charge that was not recorded
    tcsAmount:              ag.tcs_amount      != null ? Number(ag.tcs_amount)      : Number(hi.tcsAmount ?? 0),
    tcsPercentage:          hi.tcsPercentage != null ? Number(hi.tcsPercentage) : null,
    tcsApplicable:          !!hi.tcsApplicable,
    govtCharges:            Number(hi.govtCharges || 0) || undefined,
    visaCharges:            Number(hi.visaCharges || 0) || undefined,
    dueDate:                hi.dueDate || null,
    paymentStatus:          paidAmt >= totalAmt && totalAmt > 0 ? "Fully Paid" : paidAmt > 0 ? "Partially Paid" : "Pending",
    // Visa
    visaIncluded:           hi.visaIncluded != null ? !!hi.visaIncluded : null,
    visaType:               hi.visaType || null,
    visaStatus:             hi.visaStatus || null,
    visaNotes:              hi.visaNotes || null,
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

export function getSiteBase(): string {
  // IMPORTANT: Never use REPLIT_DEV_DOMAIN for notification URLs.
  // If REPLIT_DEV_DOMAIN is set on the VPS (e.g. a leftover env var from a previous Replit
  // deploy), it produces malformed URLs like "https://<uuid>.replit.dev/sign-agreement/..."
  // which break on the customer's device. Always use SITE_URL (the canonical production domain).
  return (process.env.SITE_URL || "https://alburhantravels.com").trim();
}

/**
 * Build a clean, validated agreement signing URL using the booking number.
 * Format: https://alburhantravels.com/sign-agreement/{bookingNumber}
 *
 * Rules:
 * - Never uses REPLIT_DEV_DOMAIN.
 * - URL-encodes the booking number.
 * - Validates with new URL() — throws INVALID_AGREEMENT_URL if malformed.
 * - Blocks URLs containing spaces, missing domain, or shorter than expected.
 */
export function buildAgreementUrl(bookingNumber: string): string {
  const trimmed = (bookingNumber || "").trim();
  if (!trimmed) throw new Error("INVALID_AGREEMENT_URL: bookingNumber is empty");
  const base = (process.env.SITE_URL || "https://alburhantravels.com").trim();
  const url = `${base}/sign-agreement/${encodeURIComponent(trimmed)}`;
  // Structural validation
  if (url.includes(" "))       throw new Error(`INVALID_AGREEMENT_URL: URL contains spaces — "${url}"`);
  if (!url.startsWith("https://")) throw new Error(`INVALID_AGREEMENT_URL: URL is not HTTPS — "${url}"`);
  if (url.length < 30)         throw new Error(`INVALID_AGREEMENT_URL: URL too short — "${url}"`);
  try { new URL(url); } catch { throw new Error(`INVALID_AGREEMENT_URL: unparseable — "${url}"`); }
  return url;
}

// ── Secure access-token helpers ───────────────────────────────────────────────

/** Generate a cryptographically secure 256-bit signing link token (64-char hex). */
function genAccessToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Build the public signing URL with the secure access token in the query string.
 * Format: /sign-agreement/<bookingNumber>?token=<64-hex>
 * Validates siteBase to guard against leftover REPLIT_DEV_DOMAIN values on VPS.
 */
function buildSigningUrl(bookingNumber: string, accessToken: string, siteBase: string): string {
  const base = siteBase.trim();
  if (!base.startsWith("https://") || base.includes(" ") || base.length < 10) {
    console.error(`[Agreement] buildSigningUrl: invalid siteBase "${base}" — falling back to production URL`);
    return `https://alburhantravels.com/sign-agreement/${encodeURIComponent(bookingNumber)}?token=${accessToken}`;
  }
  return `${base}/sign-agreement/${encodeURIComponent(bookingNumber)}?token=${accessToken}`;
}

/**
 * Agreements created BEFORE this cutoff were already dispatched to customers without a token.
 * Those links stay functional for backward compatibility. All agreements created on or after
 * this date require the access_token query parameter.
 */
const ACCESS_TOKEN_ENFORCE_AFTER = new Date("2026-08-02T00:00:00Z");

/**
 * Validate public access for the signing page.
 *
 * Rules:
 *  1. Already-signed  → always permitted (customer downloads their copy).
 *  2. Cancelled/void  → always refused (no token fixes a cancelled agreement).
 *  3. Legacy unsigned (created before ACCESS_TOKEN_ENFORCE_AFTER, access_token IS NULL)
 *                     → allow without token (backward-compat window).
 *  4. Token provided  → must match stored value AND not be expired.
 *  5. New unsigned + no token → TOKEN_MISSING.
 *
 * NEVER log the full access_token — callers must log only a safe prefix.
 */
function validatePublicAccess(
  ag: any,
  providedToken: string | null | undefined,
): { ok: boolean; code?: string; message?: string } {
  // 1. Signed — always OK
  if (ag.status === "signed") return { ok: true };

  // 2. Cancelled / voided / superseded — customer cannot act on any of these
  if (ag.status === "cancelled" || ag.status === "void" || ag.status === "superseded") {
    return {
      ok: false,
      code: "AGREEMENT_CANCELLED",
      message: ag.status === "superseded"
        ? "This agreement link is no longer valid — a newer version has been issued. Please use the new signing link sent to your mobile."
        : "This agreement has been cancelled. Please contact Al Burhan Tours & Travels for assistance.",
    };
  }

  const createdAt = ag.created_at ? new Date(ag.created_at) : new Date(0);
  const isLegacy  = createdAt < ACCESS_TOKEN_ENFORCE_AFTER;
  const hasStoredToken = !!ag.access_token;

  // 3. Legacy agreement with no stored token — backward compat, no token required
  if (isLegacy && !hasStoredToken) return { ok: true };

  // 4. Token provided — validate strictly
  if (providedToken) {
    if (!ag.access_token || ag.access_token !== providedToken) {
      return { ok: false, code: "TOKEN_INVALID", message: "This signing link is invalid or has already been used. Please request a new link from Al Burhan Tours & Travels." };
    }
    if (ag.access_token_expires_at && new Date() > new Date(ag.access_token_expires_at)) {
      return { ok: false, code: "TOKEN_EXPIRED", message: "This signing link has expired (links are valid for 72 hours). Please contact Al Burhan Tours & Travels to receive a new link." };
    }
    return { ok: true };
  }

  // 5. No token provided
  if (isLegacy) return { ok: true }; // legacy link without token still OK

  return {
    ok: false,
    code: "TOKEN_MISSING",
    message: "This signing link is incomplete. Please use the full link sent to your WhatsApp or SMS.",
  };
}

/** Return only the safe log prefix of an access token (first 8 chars + …). Never log full token. */
function tokenLogPrefix(t: string | null | undefined): string {
  if (!t) return "(none)";
  return t.slice(0, 8) + "…";
}

// ── Fetch an image from storage/disk/URL into a Buffer (for PDF embedding) ───
async function fetchImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("/api/storage/objects/")) {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) return null;
      const tail = url.replace("/api/storage/objects/", "");
      const [file] = await (objectStorageClient as any).bucket(bucketId).file(`objects/${tail}`).download();
      return file as Buffer;
    }
    if (url.startsWith("/api/documents/files/")) {
      const filename = path.basename(url);
      const uploadsDir = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "../../uploads");
      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      return Buffer.from(await resp.arrayBuffer());
    }
    return null;
  } catch (e: any) {
    console.warn("[fetchImageBuffer] Could not fetch", url?.substring(0, 60), e?.message);
    return null;
  }
}

// ── Mandatory-field validation before PDF generation ─────────────────────────
// Returns { ok, missingFields } — callers check ok before rendering the PDF.
// Signed agreements skip this check (the PDF must always be downloadable after signing).
function validateMandatoryFields(ag: any): { ok: boolean; missingFields: string[] } {
  if (ag.status === "signed") return { ok: true, missingFields: [] };
  const missing: string[] = [];
  const name = (ag.customer_name || ag.user_name || "").trim();
  if (!name)                                    missing.push("Customer full name");
  if (!(ag.customer_mobile || "").trim())       missing.push("Mobile number");
  if (!(ag.package_name || "").trim())          missing.push("Package name");
  const total = Number(ag.final_amount || 0);
  if (total <= 0)                               missing.push("Package amount (must be > ₹0)");
  return { ok: missing.length === 0, missingFields: missing };
}

// ── Build PDF opts enriched with fetched photo buffers (async) ───────────────
async function buildEnrichedPdfOpts(ag: any, siteBase: string, override: Partial<AgreementPdfOptions> = {}): Promise<AgreementPdfOptions> {
  const [customerPhotoBuffer, passportPhotoBuffer] = await Promise.all([
    fetchImageBuffer(ag.photo_url).catch(() => null),
    fetchImageBuffer(ag.passport_image_url).catch(() => null),
  ]);
  return buildPdfOpts(ag, siteBase, { customerPhotoBuffer: customerPhotoBuffer || null, passportPhotoBuffer: passportPhotoBuffer || null, ...override });
}

// ── Auto-generate (called after payment confirmed) ────────────────────────────
export async function autoGenerateAgreement(bookingId: string): Promise<void> {
  try {
    const existing = await pool.query(
      `SELECT id FROM agreements WHERE booking_id=$1 AND status NOT IN ('cancelled','superseded')`, [bookingId]
    );
    if (existing.rows.length > 0) {
      console.log(`[Agreement] Already exists for booking ${bookingId}`);
      return;
    }

    const bRes = await pool.query(
      `SELECT b.*, u.email AS customer_email, u.name AS customer_name_user,
              hg.group_name, hg.departure_date,
              pkg.type AS pkg_type, pkg.name AS pkg_db_name,
              cp.passport_number, cp.date_of_birth, cp.nationality
       FROM bookings b
       LEFT JOIN users u   ON u.id  = b.customer_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       LEFT JOIN packages pkg ON pkg.id = b.package_id
       LEFT JOIN customer_profiles cp ON cp.user_id = b.customer_id
       WHERE b.id = $1`, [bookingId]
    );
    if (!bRes.rows.length) return;
    const booking = bRes.rows[0];

    // KYC gate — skip auto-generation for incomplete profiles; admin must resolve via generate endpoint
    const missingKyc: string[] = [];
    if (!booking.customer_mobile) missingKyc.push("mobile");
    if (!booking.passport_number) missingKyc.push("passport_number");
    if (!booking.date_of_birth)   missingKyc.push("date_of_birth");
    if (!booking.nationality)     missingKyc.push("nationality");
    if (missingKyc.length > 0) {
      console.warn(`[Agreement] autoGenerateAgreement skipped for booking ${bookingId} — missing KYC fields: ${missingKyc.join(", ")}`);
      return;
    }

    // Snapshot the package type into hotel_info so PDF knows the layout (Hajj/Umrah/etc.)
    // TCS is NOT pre-populated here — it must be explicitly set by admin via the Details modal.
    const hotelInfoSnapshot = {
      packageType: booking.pkg_type || null,
    };

    const agreementNumber = await generateAgreementNumber();
    const verificationToken = crypto.randomUUID();
    const accessToken = genAccessToken();
    const agId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agreements
         (id, agreement_number, booking_id, customer_id, status,
          hotel_info, verification_token, access_token, access_token_expires_at,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,'pending_signature',$5,$6,$7,NOW() + INTERVAL '72 hours',NOW(),NOW())`,
      [agId, agreementNumber, bookingId, booking.customer_id, JSON.stringify(hotelInfoSnapshot), verificationToken, accessToken]
    );

    await logAgreementAudit(agId, "auto_generated", {
      bookingNumber: booking.booking_number,
      customerName: booking.customer_name || booking.customer_name_user,
      triggeredBy: "payment_confirmed",
    });
    console.log(`[Agreement] Auto-generated ${agreementNumber} for booking ${booking.booking_number} | access_token=${tokenLogPrefix(accessToken)}`);

    // Notify customer — signing URL includes the secure access token.
    const siteBase = getSiteBase();
    const signingUrl = buildSigningUrl(booking.booking_number, accessToken, siteBase);
    const notifyMobile = booking.customer_mobile || booking.whatsapp_number || booking.mobile_india;
    console.log(`[Agreement] Triggering agreement_generated workflow for ${booking.booking_number} | mobile=${notifyMobile ? notifyMobile.slice(-4).padStart(notifyMobile.length, "*") : "MISSING"}`);
    triggerWorkflow("agreement_generated", {
      customerName: booking.customer_name || booking.customer_name_user,
      customerMobile: notifyMobile,
      bookingNumber: booking.booking_number,
      packageName: booking.package_name,
      agreementUrl: signingUrl,
    }).catch(e => console.error("[Agreement] auto-notify failed:", e));
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
         WHERE a.verification_token = $1 AND a.status != 'superseded'`, [token]
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
         WHERE a.agreement_number = $1 AND a.status != 'superseded'`, [token]
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
         WHERE a.id = $1 AND a.status != 'superseded'`, [token]
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

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SIGNING ROUTES — no auth required, secured by token / booking number
// ══════════════════════════════════════════════════════════════════════════════

/** Lookup an agreement from any of: booking_number (ABT...), verification_token (UUID),
 *  internal agreement id (UUID), or agreement_number (ABT-AGR-...).
 *  Uses RICH_SELECT so all downstream PDF/sign helpers work with the returned row. */
async function lookupByPublicToken(token: string): Promise<any | null> {
  // ① Booking number — most common case (link format: /sign-agreement/ABT26373792)
  if (/^ABT\d+$/i.test(token)) {
    const r = await pool.query(
      RICH_SELECT +
      `WHERE b.booking_number = $1 AND a.status NOT IN ('cancelled','superseded')
       ORDER BY a.created_at DESC LIMIT 1`,
      [token]
    );
    if (r.rows[0]) return r.rows[0];
  }

  // ② UUID — could be verification_token or internal id; exclude superseded (obsolete documents)
  if (isUUID(token)) {
    const r1 = await pool.query(
      RICH_SELECT + `WHERE a.verification_token = $1 AND a.status != 'superseded' LIMIT 1`, [token]
    );
    if (r1.rows[0]) return r1.rows[0];
    const r2 = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.status != 'superseded' LIMIT 1`, [token]
    );
    if (r2.rows[0]) return r2.rows[0];
  }

  // ③ Agreement number (e.g. ABT-AGR-2026-000001); exclude superseded for public access
  const r3 = await pool.query(
    RICH_SELECT + `WHERE a.agreement_number = $1 AND a.status != 'superseded' LIMIT 1`, [token]
  );
  return r3.rows[0] || null;
}

// ── PUBLIC: Get agreement data for the signing page ───────────────────────────
// GET /api/agreements/sign/:token?token=<access_token>
router.get("/sign/:token", async (req, res) => {
  const { token } = req.params;
  const providedToken = (req.query.token as string) || null;
  console.log(`[Agreement/Public] ▶ sign GET booking="${token}" access_token=${tokenLogPrefix(providedToken)}`);
  try {
    const ag = await lookupByPublicToken(token);
    if (!ag) {
      return res.status(404).json({
        code: "AGREEMENT_NOT_FOUND",
        error: "Agreement not found. Please check your link or contact support.",
      });
    }

    const validation = validatePublicAccess(ag, providedToken);
    if (!validation.ok) {
      const status = validation.code === "AGREEMENT_CANCELLED" ? 410 : 401;
      console.log(`[Agreement/Public] ⛔ Access denied booking="${token}" code=${validation.code}`);
      return res.status(status).json({ code: validation.code, error: validation.message });
    }

    const siteBase = getSiteBase();
    const verificationUrl = `${siteBase}/verify-agreement/${ag.verification_token || ag.agreement_number}`;
    const clauses = CONSENT_CATEGORIES.map(c => ({ id: c.id, title: c.title, body: c.body }));
    const finalAmt   = Number(ag.final_amount  || 0);
    const paidAmt    = Number(ag.paid_amount    || 0);

    res.json({
      id:             ag.id,
      agreementNumber:ag.agreement_number,
      bookingNumber:  ag.booking_number,
      packageName:    ag.package_name      || "",
      customerName:   ag.customer_name     || ag.user_name   || "Valued Customer",
      customerMobile: ag.customer_mobile   ? `***${ag.customer_mobile.slice(-4)}` : "",
      finalAmount:    finalAmt,
      paidAmount:     paidAmt,
      balanceAmount:  Math.max(0, finalAmt - paidAmt),
      status:         ag.status,
      signedAt:       ag.signed_at || null,
      verificationUrl,
      clauses,
    });
  } catch (err: any) {
    console.error("[Agreement/Public] GET error:", err?.message);
    res.status(500).json({ error: "Failed to load agreement" });
  }
});

// ── PUBLIC: Request OTP ───────────────────────────────────────────────────────
// POST /api/agreements/sign/:token/request-otp?token=<access_token>
router.post("/sign/:token/request-otp", async (req, res) => {
  const { token } = req.params;
  const providedToken = (req.query.token as string) || null;
  console.log(`[Agreement/Public] ▶ request-otp booking="${token}" access_token=${tokenLogPrefix(providedToken)}`);
  try {
    const ag = await lookupByPublicToken(token);
    if (!ag) return res.status(404).json({ code: "AGREEMENT_NOT_FOUND", error: "Agreement not found" });

    const validation = validatePublicAccess(ag, providedToken);
    if (!validation.ok) {
      const status = validation.code === "AGREEMENT_CANCELLED" ? 410 : 401;
      return res.status(status).json({ code: validation.code, error: validation.message });
    }

    if (ag.status === "signed") return res.status(400).json({ error: "Agreement already signed" });

    const mobile = ag.customer_mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number on record for this booking. Please contact support." });

    // Generate OTP — never log the value itself
    const otp    = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // Status-qualified UPDATE prevents a superseded/cancelled row from receiving an OTP
    const otpUpdate = await pool.query(
      `UPDATE agreements SET signing_otp=$1, signing_otp_expires_at=$2, updated_at=NOW()
       WHERE id=$3 AND status='pending_signature' RETURNING id`,
      [otp, expiry, ag.id]
    );
    if (!otpUpdate.rowCount) {
      return res.status(409).json({ error: "Agreement is no longer in a signable state. Please use the latest signing link." });
    }

    const smsOk = await sendOtpSMS(mobile, otp);
    // Log only last-4 digits of mobile — never log OTP value
    console.log(`[Agreement/Public] OTP dispatch ${smsOk ? "✅ ok" : "⚠ failed"} → ***${mobile.slice(-4)} agreement=${ag.agreement_number}`);

    await logAgreementAudit(ag.id, "otp_requested_public", {
      mobile: mobile.slice(-4).padStart(mobile.length, "*"),
      sms_sent: smsOk,
      booking_number: ag.booking_number,
    }, getClientIp(req), req.headers["user-agent"] as string);

    res.json({ ok: true, message: "OTP sent to your registered mobile number" });
  } catch (err: any) {
    console.error("[Agreement/Public] OTP error:", err?.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// ── PUBLIC: Sign agreement ────────────────────────────────────────────────────
// POST /api/agreements/sign/:token/sign?token=<access_token>
router.post("/sign/:token/sign", async (req, res) => {
  const { token } = req.params;
  const providedToken = (req.query.token as string) || null;
  console.log(`[Agreement/Public] ▶ sign POST booking="${token}" access_token=${tokenLogPrefix(providedToken)}`);
  try {
    const { otp, signatureData, termsAccepted, signingBrowser, signingDevice, signingOS, signingGPS } = req.body;
    if (!otp || !signatureData || !termsAccepted) {
      return res.status(400).json({ error: "OTP, signature, and terms acceptance are required" });
    }
    // NEVER log otp, signatureData, or termsAccepted values

    const ag = await lookupByPublicToken(token);
    if (!ag) return res.status(404).json({ code: "AGREEMENT_NOT_FOUND", error: "Agreement not found" });

    const validation = validatePublicAccess(ag, providedToken);
    if (!validation.ok) {
      const status = validation.code === "AGREEMENT_CANCELLED" ? 410 : 401;
      return res.status(status).json({ code: validation.code, error: validation.message });
    }

    if (ag.status === "signed") {
      return res.json({
        ok: true, alreadySigned: true,
        agreementNumber: ag.agreement_number,
        message: "Agreement already signed. You can download your signed copy.",
      });
    }

    if (!ag.signing_otp || ag.signing_otp !== String(otp)) {
      return res.status(400).json({ error: "Invalid OTP. Please request a new one." });
    }
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

    const signingMetadata = {
      browser: signingBrowser || null, device: signingDevice || null,
      os: signingOS || null, gps: signingGPS || null,
      userAgent: userAgent.substring(0, 200), timestamp: now.toISOString(),
    };
    // Digital hash: never includes raw signature data in log — only used internally
    const hashInput = `${ag.id}:${ag.agreement_number}:${signatureData}:${now.toISOString()}:${ip}`;
    const digitalHash = createHash("sha256").update(hashInput).digest("hex");

    // Status-qualified UPDATE: only transitions pending_signature → signed; prevents
    // a superseded/cancelled row from being signed even if a race slips through.
    const signResult = await pool.query(
      `UPDATE agreements SET status='signed', signature_data=$1, terms_accepted=$2,
         signed_at=$3, signed_ip=$4, signed_user_agent=$5,
         otp_verified=true, otp_verified_at=$3,
         signing_otp=NULL, signing_otp_expires_at=NULL,
         signing_metadata=$6, digital_hash=$7,
         access_token=NULL, access_token_expires_at=NULL,
         updated_at=NOW()
       WHERE id=$8 AND status='pending_signature' RETURNING id`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent, JSON.stringify(signingMetadata), digitalHash, ag.id]
    );
    if (!signResult.rowCount) {
      return res.status(409).json({ error: "Agreement is no longer in a signable state. It may have been superseded or cancelled." });
    }
    // Log only hash prefix — never the raw OTP, signature, or token
    await logAgreementAudit(ag.id, "agreement_signed_public", { ip, userAgent: userAgent.substring(0, 100), digitalHash: digitalHash.substring(0, 16) }, ip, userAgent);

    // Notify
    if (ag.customer_mobile) {
      triggerWorkflow("agreement_signed", {
        customerName: ag.customer_name || "Valued Customer",
        customerMobile: ag.customer_mobile,
        bookingNumber: ag.booking_number,
        packageName: ag.package_name,
        signedDate: now.toLocaleDateString("en-IN"),
        bookingId: ag.booking_id,
        customerId: ag.customer_id,
      }).catch(e => console.error("[Agreement/Public] signed-notify failed:", e));
    }

    // Generate and deliver PDF (fire-and-forget after responding)
    const agId = ag.id;
    const customerId = ag.customer_id;
    ;(async () => {
      try {
        const [customerPhotoBuffer, passportPhotoBuffer] = await Promise.all([
          fetchImageBuffer(ag.photo_url).catch(() => null),
          fetchImageBuffer(ag.passport_image_url).catch(() => null),
        ]);
        const pdfBuffer = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase, {
          signatureData, signedAt: now, signedIp: ip, userAgent,
          otpVerified: true, otpVerifiedAt: now, verificationUrl,
          termsAccepted, status: "signed",
          customerPhotoBuffer: customerPhotoBuffer || null,
          passportPhotoBuffer: passportPhotoBuffer || null,
        }));
        await pool.query(`UPDATE agreements SET pdf_generated=true, updated_at=NOW() WHERE id=$1`, [agId]);

        const pdfFilename = `Agreement-${ag.agreement_number}.pdf`;
        let savedFileUrl: string | null = null;
        let savedDocId: string | null = null;
        try {
          savedFileUrl = await uploadToGCS(pdfBuffer, pdfFilename, "application/pdf", "agreements");
          savedDocId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO documents
               (id, booking_id, document_type, file_name, file_key, file_url, uploaded_by,
                customer_id, is_visible_to_customer, notification_sent,
                file_size, mime_type, original_filename, created_at)
             VALUES ($1,$2,'model_contract',$3,$4,$5,'admin',$6,true,false,$7,'application/pdf',$3,NOW())
             ON CONFLICT DO NOTHING`,
            [savedDocId, ag.booking_id, pdfFilename, savedFileUrl, savedFileUrl, customerId, pdfBuffer.length]
          );
        } catch (e: any) { console.warn("[Agreement/Public] doc save skipped:", e?.message); }

        if (savedFileUrl && savedDocId) {
          await sendDocumentToCustomer({
            docId: savedDocId, bookingId: ag.booking_id, bookingNumber: ag.booking_number,
            customerId, customerName: ag.customer_name || "Valued Customer",
            customerMobile: ag.customer_mobile || "", customerEmail: ag.customer_email || ag.user_email || "",
            documentType: "model_contract", fileName: pdfFilename, fileUrl: savedFileUrl, mimeType: "application/pdf",
            packageName: ag.package_name || "Hajj Package",
          }).catch(e => console.error("[Agreement/Public] PDF delivery failed:", e?.message));
        }
      } catch (e: any) {
        console.error("[Agreement/Public] PDF generation failed:", e?.message);
      }
    })();

    res.json({ ok: true, agreementNumber: ag.agreement_number, message: "Agreement signed successfully." });
  } catch (err: any) {
    console.error("[Agreement/Public] sign error:", err?.message);
    res.status(500).json({ error: "Failed to sign agreement" });
  }
});

// ── PUBLIC: Download PDF ──────────────────────────────────────────────────────
// GET /api/agreements/sign/:token/pdf?token=<access_token>
// Already-signed agreements: access_token NOT required (customer bookmarks signed copy).
// Unsigned agreements: access_token IS required (same rules as the signing page).
router.get("/sign/:token/pdf", async (req, res) => {
  const { token } = req.params;
  const providedToken = (req.query.token as string) || null;
  console.log(`[Agreement/Public] ▶ PDF booking="${token}" access_token=${tokenLogPrefix(providedToken)}`);
  try {
    const ag = await lookupByPublicToken(token);
    if (!ag) {
      return res.status(404).setHeader("Content-Type", "application/json")
        .json({ code: "AGREEMENT_NOT_FOUND", error: "Agreement not found" });
    }

    // Superseded agreements: public PDF is blocked — the customer should use the new link.
    // Signed PDFs in other states are always accessible (download of signed copy).
    if (ag.status === "superseded") {
      return res.status(410).setHeader("Content-Type", "application/json")
        .json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Please use the new signing link sent to your mobile." });
    }
    // Non-signed, non-superseded: validate the access token
    if (ag.status !== "signed") {
      const validation = validatePublicAccess(ag, providedToken);
      if (!validation.ok) {
        const status = validation.code === "AGREEMENT_CANCELLED" ? 410 : 401;
        console.log(`[Agreement/Public] ⛔ PDF access denied booking="${token}" code=${validation.code}`);
        return res.status(status).setHeader("Content-Type", "application/json")
          .json({ code: validation.code, error: validation.message });
      }
    }

    const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, getSiteBase()));
    const safeName = ag.agreement_number.replace(/[^A-Za-z0-9-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Agreement-${safeName}.pdf"`);
    res.send(buf);
  } catch (err: any) {
    console.error("[Agreement/Public] PDF error:", err?.message);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ── CUSTOMER: List my agreements ──────────────────────────────────────────────
router.get("/my", requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, b.booking_number, b.package_name, b.final_amount, b.paid_amount,
              b.customer_id AS booking_customer_id
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE (a.customer_id = $1 OR b.customer_id = $1)
         AND a.status NOT IN ('cancelled','superseded')
       ORDER BY a.created_at DESC`, [req.user.id]
    );
    // Backfill any agreements that are missing a verification_token (legacy records)
    const needsToken = result.rows.filter((r: any) => !r.verification_token);
    for (const row of needsToken) {
      const newToken = crypto.randomUUID();
      await pool.query(`UPDATE agreements SET verification_token=$1, updated_at=NOW() WHERE id=$2`, [newToken, row.id]);
      row.verification_token = newToken;
    }
    // Strip bearer credentials — access_token must never be sent to customers
    // The portal uses session-authenticated signing endpoints (/api/customer/agreements/:id/*)
    const safe = result.rows.map((r: any) => {
      const { access_token, access_token_expires_at, ...rest } = r;
      return rest;
    });
    res.json({ agreements: safe });
  } catch { res.status(500).json({ error: "Failed to load agreements" }); }
});

// ── CUSTOMER: Get agreement detail ────────────────────────────────────────────
router.get("/my/:id", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const customerId = req.user?.id;
  console.log(`[Agreement/my/:id] ▶ id=${id} customer_id=${customerId}`);
  try {
    let agRes = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.customer_id = $2`, [id, customerId]
    );

    // ── Auto-regenerate: if not found, try to find / create for this customer's booking ──
    if (!agRes.rows.length) {
      console.warn(`[Agreement/my/:id] ⚠ Not found by id=${id} customer=${customerId} — checking for confirmed booking…`);

      // Try: maybe id is actually a booking_id (defensive)
      const byBooking = await pool.query(
        RICH_SELECT + `WHERE (a.booking_id = $1 OR b.booking_number = $1) AND a.customer_id = $2
                       AND a.status NOT IN ('cancelled','superseded') ORDER BY a.created_at DESC LIMIT 1`,
        [id, customerId]
      );
      if (byBooking.rows.length) {
        agRes = byBooking;
        console.log(`[Agreement/my/:id] ✅ Found via booking_id fallback — agreement=${agRes.rows[0].agreement_number}`);
      } else {
        // Auto-regenerate: find a confirmed booking for this customer that has no active agreement
        const bRes = await pool.query(
          `SELECT b.id AS booking_id FROM bookings b
           WHERE b.customer_id = $1 AND b.status = 'confirmed'
             AND NOT EXISTS (
               SELECT 1 FROM agreements a2
               WHERE a2.booking_id = b.id AND a2.status NOT IN ('cancelled','superseded')
             )
           ORDER BY b.created_at DESC LIMIT 1`,
          [customerId]
        );
        if (bRes.rows.length) {
          const missingBookingId = bRes.rows[0].booking_id;
          console.log(`[Agreement/my/:id] 🔄 Auto-generating missing agreement for booking=${missingBookingId}`);
          await autoGenerateAgreement(missingBookingId);
          // Re-query (use customer's latest agreement after generation)
          agRes = await pool.query(
            RICH_SELECT + `WHERE a.customer_id = $1 AND a.status NOT IN ('cancelled','superseded')
                           ORDER BY a.created_at DESC LIMIT 1`,
            [customerId]
          );
        }
        if (!agRes.rows.length) {
          console.warn(`[Agreement/my/:id] ❌ No agreement found or generated for customer=${customerId}`);
          return res.status(404).json({
            error: "Agreement not found",
            detail: "No active agreement exists for your booking. Please contact support if this persists.",
          });
        }
      }
    }

    const ag = agRes.rows[0];

    // Superseded agreements: customer detail must not expose obsolete document metadata
    if (ag.status === "superseded") {
      console.warn(`[Agreement/my/:id] ❌ Customer accessed superseded agreement=${ag.agreement_number}`);
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Your new agreement will be sent to your mobile." });
    }

    console.log(`[Agreement/my/:id] ✅ Returning agreement=${ag.agreement_number} status=${ag.status} booking=${ag.booking_number} token=${ag.verification_token?.slice(0, 8)}… mobile=${ag.customer_mobile}`);
    const verificationUrl = `${getSiteBase()}/verify-agreement/${ag.verification_token || ag.agreement_number}`;
    const clauses = CONSENT_CATEGORIES.map(c => ({ id: c.id, title: c.title, body: c.body }));

    const finalAmt   = Number(ag.final_amount  || 0);
    const paidAmt    = Number(ag.paid_amount    || 0);
    const balanceAmt = Math.max(0, finalAmt - paidAmt);

    // Return both snake_case (raw DB) and camelCase aliases so the frontend
    // AgreementSigning.tsx component can read the fields it expects.
    res.json({
      ...ag,
      // camelCase aliases for the frontend
      agreementNumber:  ag.agreement_number,
      bookingNumber:    ag.booking_number,
      packageName:      ag.package_name      || "",
      customerName:     ag.customer_name     || ag.user_name   || "",
      customerMobile:   ag.customer_mobile   || "",
      customerEmail:    ag.customer_email    || ag.user_email  || "",
      finalAmount:      finalAmt,
      paidAmount:       paidAmt,
      balanceAmount:    balanceAmt,
      signedAt:         ag.signed_at         || null,
      verificationUrl,
      clauses,
    });
  } catch (err: any) {
    console.error("[Agreement/my/:id] ❌ Error:", err?.message, "\n", err?.stack?.slice(0, 600));
    res.status(500).json({ error: "Failed to load agreement", detail: err?.message });
  }
});

// ── CUSTOMER: Request OTP ─────────────────────────────────────────────────────
router.post("/my/:id/request-otp", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const customerId = req.user?.id;
  console.log(`[Agreement/OTP] ▶ request-otp agreement_id=${id} customer_id=${customerId}`);
  try {
    const agRes = await pool.query(
      `SELECT a.id, a.agreement_number, a.booking_id, a.status, a.verification_token,
              b.customer_name, b.customer_mobile, b.booking_number
       FROM agreements a LEFT JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1 AND a.customer_id = $2`, [id, customerId]
    );
    if (!agRes.rows.length) {
      console.warn(`[Agreement/OTP] ❌ Not found — agreement_id=${id} customer_id=${customerId}`);
      return res.status(404).json({ error: "Agreement not found" });
    }
    const ag = agRes.rows[0];
    console.log(`[Agreement/OTP] agreement=${ag.agreement_number} booking=${ag.booking_number} status=${ag.status} booking_id=${ag.booking_id} token=${ag.verification_token?.slice(0, 8)}…`);

    if (ag.status === "signed") {
      console.log(`[Agreement/OTP] Already signed — no OTP needed`);
      return res.status(400).json({ error: "Agreement already signed" });
    }
    if (ag.status === "superseded") {
      console.warn(`[Agreement/OTP] ❌ Attempted OTP on superseded agreement — agreement_id=${id}`);
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Please use the new signing link." });
    }

    const mobile = ag.customer_mobile || req.user.mobile;
    if (!mobile) {
      console.warn(`[Agreement/OTP] ❌ No mobile number — customer_name=${ag.customer_name}`);
      return res.status(400).json({ error: "No mobile number on record" });
    }

    const otp    = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // Status-qualified UPDATE — prevents race where agreement is superseded between the fetch and the write
    const otpWrite = await pool.query(
      `UPDATE agreements SET signing_otp=$1, signing_otp_expires_at=$2, updated_at=NOW()
       WHERE id=$3 AND status='pending_signature' RETURNING id`,
      [otp, expiry, id]
    );
    if (!otpWrite.rowCount) {
      return res.status(409).json({ error: "Agreement is no longer in a signable state." });
    }
    console.log(`[Agreement/OTP] OTP stored in DB — sending SMS to mobile=***${mobile.slice(-4)} expiry=${expiry.toISOString()}`);

    const smsOk = await sendOtpSMS(mobile, otp);
    console.log(`[Agreement/OTP] SMS result: ${smsOk ? "✅ sent" : "⚠ failed"} | agreement=${ag.agreement_number} booking=${ag.booking_number}`);

    await logAgreementAudit(id, "otp_requested", {
      mobile: mobile.slice(-4).padStart(mobile.length, "*"),
      sms_sent: smsOk,
      agreement_id: id,
      booking_id: ag.booking_id,
      verification_token: ag.verification_token,
    }, getClientIp(req), req.headers["user-agent"] as string);

    // Log OTP SMS to notification_logs for audit trail (step 3/14)
    try {
      await pool.query(
        `INSERT INTO notification_logs
           (id, event_type, customer_id, booking_id, channel, recipient, status,
            http_status, provider_name, sent_at, created_at, updated_at, customer_name, booking_number)
         VALUES (gen_random_uuid(),'otp_sent',$1,$2,'sms',$3,$4,$5,'fast2sms',NOW(),NOW(),NOW(),$6,$7)`,
        [customerId, ag.booking_id, mobile, smsOk ? "sent" : "failed", smsOk ? 200 : null, ag.customer_name, ag.booking_number]
      );
    } catch (logErr: any) {
      console.warn(`[Agreement/OTP] notification_logs insert skipped: ${logErr?.message}`);
    }

    res.json({ ok: true, message: "OTP sent to your registered mobile number" });
  } catch (err: any) {
    console.error("[Agreement/OTP] ❌ Error:", err?.message, err?.stack?.slice(0, 400));
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// ── CUSTOMER: Sign agreement ──────────────────────────────────────────────────
router.post("/my/:id/sign", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const customerId = req.user?.id;
  console.log(`[Agreement/Sign] ▶ sign agreement_id=${id} customer_id=${customerId}`);
  try {
    const { otp, signatureData, termsAccepted } = req.body;

    if (!otp || !signatureData || !termsAccepted) {
      console.warn(`[Agreement/Sign] ❌ Missing fields — otp=${!!otp} sig=${!!signatureData} terms=${!!termsAccepted}`);
      return res.status(400).json({ error: "OTP, signature, and terms acceptance required" });
    }

    const agRes = await pool.query(
      RICH_SELECT + `WHERE a.id = $1 AND a.customer_id = $2`, [id, customerId]
    );
    if (!agRes.rows.length) {
      console.warn(`[Agreement/Sign] ❌ Not found — agreement_id=${id} customer_id=${customerId}`);
      return res.status(404).json({ error: "Not found" });
    }
    const ag = agRes.rows[0];
    console.log(`[Agreement/Sign] agreement=${ag.agreement_number} booking=${ag.booking_number} booking_id=${ag.booking_id} status=${ag.status} mobile=${ag.customer_mobile} token=${ag.verification_token?.slice(0, 8)}…`);

    if (ag.status === "signed") {
      const pdfUrl = `${getSiteBase()}/api/agreements/my/${id}/pdf`;
      return res.status(200).json({ ok: true, alreadySigned: true, pdfUrl, agreementNumber: ag.agreement_number, message: "Agreement already signed. You can download your signed copy." });
    }
    if (ag.status === "superseded") {
      console.warn(`[Agreement/Sign] ❌ Attempted sign on superseded agreement — agreement_id=${id}`);
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Please use the new signing link." });
    }
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

    // Status-qualified UPDATE: only transitions pending_signature → signed.
    // Guards against a reissue/cancel/void racing between OTP verification and this write.
    const authSignResult = await pool.query(
      `UPDATE agreements SET status='signed', signature_data=$1, terms_accepted=$2,
         signed_at=$3, signed_ip=$4, signed_user_agent=$5,
         otp_verified=true, otp_verified_at=$3,
         signing_otp=NULL, signing_otp_expires_at=NULL,
         signing_metadata=$6, digital_hash=$7,
         updated_at=NOW()
       WHERE id=$8 AND status='pending_signature' RETURNING id`,
      [signatureData, JSON.stringify(termsAccepted), now, ip, userAgent, JSON.stringify(signingMetadata), digitalHash, id]
    );
    if (!authSignResult.rowCount) {
      return res.status(409).json({ error: "Agreement is no longer in a signable state — it may have been superseded, cancelled, or already signed." });
    }

    await logAgreementAudit(id, "agreement_signed", { ip, userAgent: userAgent.substring(0, 100), otpVerified: true, digitalHash: digitalHash.substring(0, 16) }, ip, userAgent);

    // Notify via agreement_signed template (fire-and-forget)
    if (ag.customer_mobile) {
      triggerWorkflow("agreement_signed", {
        customerName:   ag.customer_name   || "Valued Customer",
        customerMobile: ag.customer_mobile,
        bookingNumber:  ag.booking_number,
        packageName:    ag.package_name,
        signedDate:     new Date().toLocaleDateString("en-IN"),
        bookingId:      ag.booking_id,
        customerId:     ag.customer_id,
      }).catch(e => console.error("[Agreement] signed-notify failed:", e));
    }

    // ── Fetch customer/passport photo buffers for PDF (parallel, best-effort) ──
    console.log(`[Agreement/Sign] 🖼 Fetching photos — profile=${!!ag.photo_url} passport=${!!ag.passport_image_url}`);
    const [customerPhotoBuffer, passportPhotoBuffer] = await Promise.all([
      fetchImageBuffer(ag.photo_url).catch(() => null),
      fetchImageBuffer(ag.passport_image_url).catch(() => null),
    ]);
    console.log(`[Agreement/Sign] 🖼 Photos — profile=${!!customerPhotoBuffer} passport=${!!passportPhotoBuffer}`);

    // Generate PDF
    console.log(`[Agreement/Sign] 📄 Generating PDF — agreement=${ag.agreement_number} booking=${ag.booking_number}`);
    let pdfBuffer: Buffer | null = null;
    let savedDocId: string | null = null;
    let savedFileUrl: string | null = null;
    try {
      pdfBuffer = await generateAgreementPdfBuffer(buildPdfOpts(ag, siteBase, {
        signatureData,
        signedAt:             now,
        signedIp:             ip,
        userAgent,
        otpVerified:          true,
        otpVerifiedAt:        now,
        verificationUrl,
        termsAccepted,
        status:               "signed",
        customerPhotoBuffer:  customerPhotoBuffer || null,
        passportPhotoBuffer:  passportPhotoBuffer || null,
      }));
      await pool.query(`UPDATE agreements SET pdf_generated=true, updated_at=NOW() WHERE id=$1`, [id]);
      await logAgreementAudit(id, "pdf_generated", { size: pdfBuffer.length }, ip, userAgent);
      console.log(`[Agreement/Sign] ✅ PDF generated — ${Math.round(pdfBuffer.length / 1024)} KB`);

      // ── Save signed PDF to documents table ──
      try {
        const pdfFilename = `Agreement-${ag.agreement_number}.pdf`;
        savedFileUrl = await uploadToGCS(pdfBuffer, pdfFilename, "application/pdf", "agreements");
        savedDocId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO documents
             (id, booking_id, document_type, file_name, file_key, file_url, uploaded_by,
              customer_id, is_visible_to_customer, notification_sent,
              file_size, mime_type, original_filename, created_at)
           VALUES ($1,$2,'model_contract',$3,$4,$5,'admin',$6,true,false,$7,'application/pdf',$3,NOW())
           ON CONFLICT DO NOTHING`,
          [savedDocId, ag.booking_id, pdfFilename, savedFileUrl, savedFileUrl, customerId, pdfBuffer.length]
        );
        console.log(`[Agreement/Sign] ✅ PDF saved to documents — id=${savedDocId} url=${savedFileUrl}`);
        await logAgreementAudit(id, "pdf_stored", { doc_id: savedDocId, url: savedFileUrl, size: pdfBuffer.length }, ip, userAgent);
      } catch (docErr: any) {
        console.warn(`[Agreement/Sign] ⚠ documents insert skipped: ${docErr?.message}`);
      }
    } catch (pdfErr: any) {
      console.error("[Agreement/Sign] ❌ PDF generation failed:", pdfErr?.message, pdfErr?.stack?.slice(0, 300));
    }

    // ── Deliver signed PDF via WhatsApp + Email (sendDocumentToCustomer for proper logging) ──
    if (pdfBuffer && savedDocId && savedFileUrl) {
      try {
        await sendDocumentToCustomer({
          docId:           savedDocId,
          bookingId:       ag.booking_id,
          bookingNumber:   ag.booking_number,
          customerId:      ag.customer_id,
          customerName:    ag.customer_name || ag.user_name || "Valued Customer",
          customerMobile:  ag.customer_mobile || "",
          customerEmail:   ag.customer_email  || ag.user_email || "",
          documentType:    "model_contract",
          fileName:        `Agreement-${ag.agreement_number}.pdf`,
          fileUrl:         savedFileUrl,
          mimeType:        "application/pdf",
          packageName:     ag.package_name || "Hajj Package",
        });
        await logAgreementAudit(id, "pdf_delivered", { doc_id: savedDocId }, ip, userAgent);
        console.log(`[Agreement/Sign] ✅ PDF delivered via document delivery`);
      } catch (deliveryErr: any) {
        console.error("[Agreement/Sign] ❌ PDF delivery failed:", deliveryErr?.message);
        // Fallback: direct WhatsApp send
        try {
          if (ag.customer_mobile && pdfBuffer) {
            await sendPDFDocument(ag.customer_mobile, pdfBuffer, `Agreement-${ag.agreement_number}.pdf`,
              `As-salamu Alaykum ${ag.customer_name}! Your Hajj Agreement (${ag.agreement_number}) has been signed. Booking: ${ag.booking_number}. Verify: ${verificationUrl}`
            );
            console.log(`[Agreement/Sign] ✅ WhatsApp fallback sent to ***${ag.customer_mobile.slice(-4)}`);
          }
        } catch (fbErr: any) {
          console.error("[Agreement/Sign] ❌ WhatsApp fallback also failed:", fbErr?.message);
        }
      }
    } else if (pdfBuffer && ag.customer_mobile) {
      // No saved doc (GCS upload failed) — still attempt direct WhatsApp
      try {
        await sendPDFDocument(ag.customer_mobile, pdfBuffer, `Agreement-${ag.agreement_number}.pdf`,
          `As-salamu Alaykum ${ag.customer_name}! Your Hajj Agreement (${ag.agreement_number}) has been signed. Booking: ${ag.booking_number}. Verify: ${verificationUrl}`
        );
        console.log(`[Agreement/Sign] ✅ WhatsApp direct sent (no saved doc) to ***${ag.customer_mobile.slice(-4)}`);
      } catch (e: any) {
        console.error("[Agreement/Sign] ❌ WhatsApp direct send failed:", e?.message);
      }
    }

    const pdfUrl = `${siteBase}/api/agreements/my/${id}/pdf`;
    console.log(`[Agreement/Sign] ✅ COMPLETE — agreement=${ag.agreement_number} booking=${ag.booking_number} pdf=${!!pdfBuffer}`);
    res.json({ ok: true, agreementNumber: ag.agreement_number, pdfUrl, message: "Agreement signed successfully." });
  } catch (err: any) {
    console.error("[Agreement/Sign] ❌ Fatal error:", err?.message, err?.stack?.slice(0, 400));
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

    // Superseded agreements: customer should not receive the obsolete document
    if (ag.status === "superseded") {
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Please use the new signing link sent to your mobile." });
    }

    const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, getSiteBase()));
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
    ag.verificationUrl = `${getSiteBase()}/verify-agreement/${ag.verification_token || ag.agreement_number}`;
    ag.clauses = CONSENT_CATEGORIES.map(c => ({ id: c.id, title: c.title, body: c.body }));
    res.json(ag);
  } catch { res.status(500).json({ error: "Failed to load agreement" }); }
});

// ── ADMIN: Manual generate for booking ───────────────────────────────────────
// Returns 422 with { error, missingFields } if required KYC is absent.
router.post("/generate/:bookingId", requireAdmin, async (req: any, res) => {
  try {
    const { bookingId } = req.params;

    // ── Pre-flight KYC validation ─────────────────────────────────────────
    const check = await pool.query(
      `SELECT b.customer_mobile, b.customer_name,
              cp.passport_number, cp.date_of_birth, cp.nationality
       FROM bookings b
       LEFT JOIN customer_profiles cp ON cp.user_id = b.customer_id
       WHERE b.id = $1`, [bookingId]
    );
    if (check.rows.length) {
      const c = check.rows[0];
      const missing: string[] = [];
      if (!c.customer_mobile)  missing.push("Mobile number");
      if (!c.passport_number)  missing.push("Passport number");
      if (!c.date_of_birth)    missing.push("Date of birth");
      if (!c.nationality)      missing.push("Nationality");
      if (missing.length > 0) {
        return res.status(422).json({
          error: `Agreement cannot be generated — ${missing.length} required customer field(s) are missing.`,
          missingFields: missing,
        });
      }
    }

    await autoGenerateAgreement(bookingId);
    const agRes = await pool.query(`SELECT * FROM agreements WHERE booking_id=$1 AND status NOT IN ('cancelled','superseded') ORDER BY created_at DESC LIMIT 1`, [bookingId]);
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
      // TCS / Visa flags — admin can set these explicitly via this endpoint
      tcsPercentage: b.tcsPercentage != null ? Number(b.tcsPercentage) : undefined,
      tcsApplicable: b.tcsApplicable != null ? !!b.tcsApplicable : undefined,
      visaIncluded:  b.visaIncluded  != null ? !!b.visaIncluded  : undefined,
      visaType:      b.visaType      || undefined,
      visaStatus:    b.visaStatus    || undefined,
      visaNotes:     b.visaNotes     || undefined,
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
    // Apply Hajj defaults for Mina fields — these go in first so explicit values override them
    const hajjDefaults: Record<string,string> = {
      minaZone:     "Zone 5 (New Mina)",
      minaCategory: "Category D",
      maktabNumber: "To Be Assigned",
    };
    const mergedHi = {
      ...hajjDefaults,
      ...prevHi,
      ...Object.fromEntries(Object.entries(hotel_info).filter(([,v]) => v != null && v !== "")),
    };
    const flightDefaults: Record<string,string> = {
      airline:      "Any Airline",
      flightNumber: "To Be Confirmed",
    };
    const mergedFi = {
      ...flightDefaults,
      ...prevFi,
      ...Object.fromEntries(Object.entries(flight_info).filter(([,v]) => v != null && v !== "")),
    };

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

    // Mandatory-field gate — block PDF when critical data is missing
    const validation = validateMandatoryFields(ag);
    if (!validation.ok) {
      return res.status(422).json({
        error: `Agreement cannot be generated. Missing fields: ${validation.missingFields.join(", ")}`,
        code: "AGREEMENT_DATA_INCOMPLETE",
        missingFields: validation.missingFields,
      });
    }

    const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, getSiteBase()));
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
    const pdfBuf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, getSiteBase()));

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
      const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(agRes.rows[0], getSiteBase()));
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

// ── Shared helper: immutable reissue (used by both /reissue and /regenerate) ──
// Wraps both writes in a transaction so the old row is never left as 'superseded'
// without a successful new revision row. Generates a distinct agreement number.
async function performImmutableReissue(
  oldId: string,
  reasonArg: string | undefined,
  adminId: string | undefined,
  ip: string,
  opts?: { supersedeSigned?: boolean },
): Promise<{ newId: string; newAccessToken: string; agreementNumber: string }> {
  const newId = crypto.randomUUID();
  const newAccessToken = genAccessToken();
  const newVerificationToken = crypto.randomUUID();
  const reason = reasonArg || "Superseded by reissue";

  let old: any;
  let newAgreementNumber: string;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step A: Non-locking read to obtain booking_id for the advisory lock.
    // MUST acquire the advisory lock BEFORE any FOR UPDATE row lock to prevent deadlock:
    // two concurrent revisions on different rows of the same booking could each hold
    // a FOR UPDATE lock and then block waiting for the other's advisory lock.
    const bkIdRes = await client.query(
      `SELECT booking_id FROM agreements WHERE id=$1`, [oldId]
    );
    if (!bkIdRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Not found"), { statusCode: 404 });
    }

    // Step B: Acquire advisory lock first. hashtext() accepts any text ID format.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [bkIdRes.rows[0].booking_id]);

    // Step C: Now safe to row-lock — advisory lock serialises concurrent reissues for this booking.
    const agRes = await client.query(
      `SELECT * FROM agreements WHERE id=$1 FOR UPDATE`, [oldId]
    );
    if (!agRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Not found"), { statusCode: 404 });
    }
    old = agRes.rows[0];

    // Guard: prevent double-supersede (e.g. two concurrent admin clicks)
    if (old.status === "superseded") {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("This agreement has already been superseded — reissue the current revision instead"), { statusCode: 409 });
    }

    // Family-wide revision allocation: derive next rev from MAX across the entire booking family.
    // This prevents a reissue from a cancelled/voided original creating BASE-R2 when an R2 already exists.
    const maxRevRes = await client.query(
      `SELECT COALESCE(MAX(revision_number), 1) AS max_rev FROM agreements WHERE booking_id = $1`,
      [old.booking_id]
    );
    const rev = (Number(maxRevRes.rows[0]?.max_rev) || 1) + 1;

    // Strip any existing -R<n> suffix so sequential reissues stay in the same family:
    // ABT-AGR-2026-000001    → ABT-AGR-2026-000001-R2
    // ABT-AGR-2026-000001-R2 → ABT-AGR-2026-000001-R3 (NOT -R2-R3)
    const baseNum = String(old.agreement_number).replace(/-R\d+$/, "");
    newAgreementNumber = `${baseNum}-R${rev}`;

    // Step 1: Freeze ALL currently-active revisions for this booking.
    // When supersedeSigned=true (correction flow), also freeze signed rows so the prior
    // signed agreement is no longer publicly accessible once a correction is issued.
    // For normal reissue, only pending_signature rows are frozen.
    const supersededStatuses = opts?.supersedeSigned
      ? `'pending_signature','signed'`
      : `'pending_signature'`;
    await client.query(
      `UPDATE agreements SET status='superseded', superseded_at=NOW(), superseded_reason=$1, updated_at=NOW()
       WHERE booking_id=$2 AND status IN (${supersededStatuses})`,
      [reason, old.booking_id]
    );

    // Step 2: Insert a fresh revision row using the locked values from old row
    await client.query(
      `INSERT INTO agreements
         (id, agreement_number, booking_id, customer_id, status,
          hotel_info, flight_info, tcs_amount, gst_amount, discount_amount,
          verification_token, access_token, access_token_expires_at,
          revision_number, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'pending_signature',$5,$6,$7,$8,$9,$10,$11,
               NOW() + INTERVAL '72 hours',$12,NOW(),NOW())`,
      [
        newId, newAgreementNumber, old.booking_id, old.customer_id,
        old.hotel_info   ? JSON.stringify(old.hotel_info)   : null,
        old.flight_info  ? JSON.stringify(old.flight_info)  : null,
        old.tcs_amount      ?? null,
        old.gst_amount      ?? null,
        old.discount_amount ?? null,
        newVerificationToken, newAccessToken,
        rev,
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  await logAgreementAudit(oldId,  "agreement_superseded", { reason, newRevision: (old.revision_number || 1) + 1, adminId }, ip);
  await logAgreementAudit(newId,  "agreement_reissued",   { previousId: oldId, revision: (old.revision_number || 1) + 1, agreementNumber: newAgreementNumber!, adminId }, ip);

  return { newId, newAccessToken, agreementNumber: newAgreementNumber! };
}

// ── ADMIN: Reissue voided/cancelled/superseded agreement ──────────────────────
router.post("/:id/reissue", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { newId, newAccessToken } = await performImmutableReissue(
      id, req.body.reason, req.user?.id, getClientIp(req)
    );
    const newAg = await pool.query(RICH_SELECT + `WHERE a.id=$1`, [newId]);
    const ag = newAg.rows[0];
    const bkNum = ag?.booking_number || "";
    const sigUrl = bkNum ? buildSigningUrl(bkNum, newAccessToken, getSiteBase()) : null;

    // Notify the customer on all channels so they receive the new signing link immediately
    if (ag?.customer_mobile && sigUrl) {
      triggerWorkflow("agreement_generated", {
        customerName:   ag.customer_name  || "Valued Customer",
        customerMobile: ag.customer_mobile,
        bookingNumber:  ag.booking_number,
        packageName:    ag.package_name,
        agreementUrl:   sigUrl,
        bookingId:      ag.booking_id,
        customerId:     ag.customer_id,
      }).catch((e: any) => console.error("[Agreement] Reissue notify failed:", e));
    }

    res.json({ ok: true, agreement: ag, signingUrl: sigUrl });
  } catch (err: any) {
    console.error("[Agreement] Reissue error:", err);
    res.status(err?.statusCode || 500).json({ error: err?.statusCode === 404 ? "Not found" : "Failed to reissue" });
  }
});

// ── ADMIN: Revise agreement (correction with snapshot history) ─────────────────
// Issues a new revision superseding ALL active rows for this booking (pending and signed).
// Supported corrections (persisted on agreement row): hotel_info, flight_info,
// tcs_amount, gst_amount, discount_amount. Customer name/package/total amount corrections
// must be made at the booking/customer-profile level; those fields derive from source tables.
//
// Everything — supersession, revision creation, snapshots, audit record — is written in
// ONE transaction so there is never a live revision without its correction history.
router.post("/:id/revise", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { correctionReason, corrections } = req.body;
    // corrections: { hotel_info?, flight_info?, tcs_amount?, gst_amount?, discount_amount? }
    if (!correctionReason?.trim()) {
      return res.status(400).json({ error: "correctionReason is required" });
    }

    const adminId: string | null = req.user?.id || null;
    const ip = getClientIp(req);
    const newId = crypto.randomUUID();
    const newAccessToken = genAccessToken();
    const newVerificationToken = crypto.randomUUID();

    let newAgreementNumber = "";
    let oldAgreementNumber = "";
    let oldBookingId       = "";
    let oldCustomerId      = "";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1A. Non-locking read to get booking_id for advisory lock.
      //     Advisory lock MUST be acquired BEFORE any FOR UPDATE row lock to prevent deadlock:
      //     two concurrent /revise calls on different rows of the same booking could each hold
      //     a row lock and then block waiting for the other's advisory lock.
      const bkIdRes = await client.query(
        `SELECT booking_id FROM agreements WHERE id = $1`, [id]
      );
      if (!bkIdRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Agreement not found" });
      }

      // 1B. Acquire booking-level advisory lock first. hashtext() accepts any text ID format.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [bkIdRes.rows[0].booking_id]);

      // 1C. Now safe to row-lock the source agreement.
      const lockRes = await client.query(
        `SELECT * FROM agreements WHERE id = $1 FOR UPDATE`, [id]
      );
      if (!lockRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Agreement not found" });
      }
      const old = lockRes.rows[0];
      oldAgreementNumber = old.agreement_number;
      oldBookingId       = old.booking_id;
      oldCustomerId      = old.customer_id;

      if (old.status === "superseded") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "This agreement is already superseded — revise the current active revision instead." });
      }
      if (old.status === "cancelled" || old.status === "void") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Cannot revise a cancelled or voided agreement." });
      }

      // 3. Derive next revision number from the family-wide MAX.
      const maxRevRes = await client.query(
        `SELECT COALESCE(MAX(revision_number), 1) AS max_rev FROM agreements WHERE booking_id = $1`,
        [old.booking_id]
      );
      const rev = (Number(maxRevRes.rows[0]?.max_rev) || 1) + 1;
      const baseNum = String(old.agreement_number).replace(/-R\d+$/, "");
      newAgreementNumber = `${baseNum}-R${rev}`;

      // 4. Build old snapshot from actual locked source values (not request payload).
      const oldSnapshot = {
        agreement_number: old.agreement_number,
        revision_number:  old.revision_number,
        status:           old.status,
        hotel_info:       old.hotel_info  || null,
        flight_info:      old.flight_info || null,
        tcs_amount:       old.tcs_amount       ?? null,
        gst_amount:       old.gst_amount       ?? null,
        discount_amount:  old.discount_amount  ?? null,
        signed_at:        old.signed_at   || null,
      };

      // 5. Resolve corrected values (merge corrections onto old agreement-row values).
      //    Customer name, package, total amount are NOT stored on the agreement row — they
      //    are derived at PDF generation from bookings/customer_profiles.
      const newHotelInfo  = corrections?.hotel_info
        ? { ...(old.hotel_info  || {}), ...(corrections.hotel_info)  }
        : (old.hotel_info  || null);
      const newFlightInfo = corrections?.flight_info
        ? { ...(old.flight_info || {}), ...(corrections.flight_info) }
        : (old.flight_info || null);
      const newTcs        = corrections?.tcs_amount        !== undefined ? corrections.tcs_amount        : old.tcs_amount;
      const newGst        = corrections?.gst_amount         !== undefined ? corrections.gst_amount         : old.gst_amount;
      const newDiscount   = corrections?.discount_amount    !== undefined ? corrections.discount_amount    : old.discount_amount;

      // 6. Build new snapshot from the values actually being persisted.
      const newSnapshot = {
        agreement_number: newAgreementNumber,
        revision_number:  rev,
        status:           "pending_signature",
        hotel_info:       newHotelInfo,
        flight_info:      newFlightInfo,
        tcs_amount:       newTcs       ?? null,
        gst_amount:       newGst       ?? null,
        discount_amount:  newDiscount  ?? null,
      };

      // 7. Supersede ALL currently-active rows for this booking (pending + signed).
      //    This ensures the prior signed agreement is no longer publicly accessible.
      await client.query(
        `UPDATE agreements
            SET status                 = 'superseded',
                superseded_at          = NOW(),
                superseded_reason      = $1,
                superseded_by_admin_id = $2,
                correction_reason      = $3,
                updated_at             = NOW()
          WHERE booking_id = $4
            AND status IN ('pending_signature', 'signed')`,
        [correctionReason, adminId, correctionReason, old.booking_id]
      );

      // 8. Insert the new revision with corrections + snapshots in ONE statement.
      await client.query(
        `INSERT INTO agreements
           (id, agreement_number, booking_id, customer_id, status,
            hotel_info, flight_info, tcs_amount, gst_amount, discount_amount,
            verification_token, access_token, access_token_expires_at,
            revision_number, correction_reason, old_data_snapshot, new_data_snapshot,
            superseded_by_admin_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'pending_signature',
                 $5,$6,$7,$8,$9,
                 $10,$11, NOW() + INTERVAL '72 hours',
                 $12,$13,$14,$15,
                 $16, NOW(), NOW())`,
        [
          newId, newAgreementNumber, old.booking_id, old.customer_id,
          newHotelInfo  ? JSON.stringify(newHotelInfo)  : null,
          newFlightInfo ? JSON.stringify(newFlightInfo) : null,
          newTcs ?? null, newGst ?? null, newDiscount ?? null,
          newVerificationToken, newAccessToken,
          rev,
          correctionReason,
          JSON.stringify(oldSnapshot),
          JSON.stringify(newSnapshot),
          adminId,
        ]
      );

      // 9. Audit record inside the same transaction — cannot be orphaned.
      await client.query(
        `INSERT INTO agreement_audit_logs
           (id, agreement_id, action, details, ip_address, user_agent, created_at)
         VALUES (gen_random_uuid(), $1, 'agreement_revised', $2, $3, $4, NOW())`,
        [
          newId,
          JSON.stringify({
            correctionReason,
            previousAgreementId:     id,
            previousAgreementNumber: old.agreement_number,
            adminId,
          }),
          ip,
          req.headers?.["user-agent"] || null,
        ]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Post-transaction: fetch enriched new row, notify customer
    const newAgRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [newId]);
    const newAg = newAgRes.rows[0];
    const bkNum  = newAg?.booking_number || "";
    const sigUrl = bkNum ? buildSigningUrl(bkNum, newAccessToken, getSiteBase()) : null;

    if (newAg?.customer_mobile && sigUrl) {
      triggerWorkflow("agreement_generated", {
        customerName:   newAg.customer_name || "Valued Customer",
        customerMobile: newAg.customer_mobile,
        bookingNumber:  newAg.booking_number,
        packageName:    newAg.package_name,
        agreementUrl:   sigUrl,
        bookingId:      newAg.booking_id,
        customerId:     newAg.customer_id,
      }).catch((e: any) => console.error("[Agreement] Revise notify failed:", e));
    }

    console.log(`[Agreement] ✅ Revised: ${oldAgreementNumber} → ${newAgreementNumber} | reason="${correctionReason}"`);
    res.json({ ok: true, newAgreement: newAg, signingUrl: sigUrl, correctionReason });
  } catch (err: any) {
    console.error("[Agreement] Revise error:", err);
    res.status(err?.statusCode || 500).json({ error: err?.message || "Failed to revise agreement" });
  }
});

// ── ADMIN: Refresh signing link ───────────────────────────────────────────────
// Generates a new 72-hour access_token and re-sends the signing notification on all channels.
// Use when an existing link has expired or was lost.
router.post("/:id/refresh-token", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(RICH_SELECT + `WHERE a.id = $1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const ag = agRes.rows[0];

    if (ag.status === "signed") {
      return res.status(400).json({ error: "Agreement is already signed — no new signing link needed." });
    }
    if (ag.status === "superseded") {
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "This agreement has been superseded. Use the reissue endpoint to generate a new revision, or refresh the current active revision." });
    }
    if (ag.status === "cancelled" || ag.status === "void") {
      return res.status(400).json({ error: "Cannot refresh a cancelled or voided agreement." });
    }

    const newToken = genAccessToken();
    await pool.query(
      `UPDATE agreements SET access_token=$1, access_token_expires_at=NOW() + INTERVAL '72 hours', updated_at=NOW() WHERE id=$2`,
      [newToken, id]
    );
    await logAgreementAudit(id, "access_token_refreshed", { adminId: req.user?.id }, getClientIp(req));

    const siteBase  = getSiteBase();
    const signingUrl = buildSigningUrl(ag.booking_number, newToken, siteBase);

    // Re-dispatch notification on all channels (WhatsApp, SMS, RCS, Email)
    const mobile = ag.customer_mobile;
    if (mobile) {
      triggerWorkflow("agreement_generated", {
        customerName:   ag.customer_name  || "Valued Customer",
        customerMobile: mobile,
        bookingNumber:  ag.booking_number,
        packageName:    ag.package_name,
        agreementUrl:   signingUrl,
        bookingId:      ag.booking_id,
        customerId:     ag.customer_id,
      }).catch(e => console.error("[Agreement] refresh-token notify failed:", e));
    }

    console.log(`[Agreement] ✅ access_token refreshed for ${ag.agreement_number} | booking=${ag.booking_number}`);
    res.json({ ok: true, signingUrl, message: "New 72-hour signing link generated and notification sent to all channels." });
  } catch (err: any) {
    console.error("[Agreement] refresh-token error:", err?.message);
    res.status(500).json({ error: "Failed to refresh token" });
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
    if (ag.status === "superseded") {
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "Cannot resend a superseded agreement. Resend from the current active revision." });
    }
    const emailTo = ag.customer_email || ag.user_email;
    if (!emailTo) return res.status(400).json({ error: "No email on record" });

    const siteBase = getSiteBase();
    const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, siteBase));
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
    if (ag.status === "superseded") {
      return res.status(410).json({ code: "AGREEMENT_SUPERSEDED", error: "Cannot resend a superseded agreement. Resend from the current active revision." });
    }
    const mobile = ag.customer_mobile;
    if (!mobile) return res.status(400).json({ error: "No mobile number" });

    const siteBase = getSiteBase();
    const buf = await generateAgreementPdfBuffer(await buildEnrichedPdfOpts(ag, siteBase));
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

// ── ADMIN: Regenerate agreement (immutable — preserves old revision) ──────────
router.post("/:id/regenerate", requireAdmin, async (req: any, res) => {
  try {
    const { id } = req.params;
    const agRes = await pool.query(`SELECT booking_id FROM agreements WHERE id=$1`, [id]);
    if (!agRes.rows.length) return res.status(404).json({ error: "Not found" });
    const { booking_id } = agRes.rows[0];

    // Pre-flight KYC validation (mirrors generate/:bookingId)
    const check = await pool.query(
      `SELECT b.customer_mobile, cp.passport_number, cp.date_of_birth, cp.nationality
       FROM bookings b
       LEFT JOIN customer_profiles cp ON cp.user_id = b.customer_id
       WHERE b.id = $1`, [booking_id]
    );
    if (check.rows.length) {
      const c = check.rows[0];
      const missing: string[] = [];
      if (!c.customer_mobile) missing.push("Mobile number");
      if (!c.passport_number) missing.push("Passport number");
      if (!c.date_of_birth)   missing.push("Date of birth");
      if (!c.nationality)     missing.push("Nationality");
      if (missing.length > 0) {
        return res.status(422).json({
          error: `Agreement cannot be regenerated — ${missing.length} required customer field(s) are missing.`,
          missingFields: missing,
        });
      }
    }

    // Immutable reissue — old row is preserved as 'superseded', not destroyed
    const { newId, newAccessToken } = await performImmutableReissue(
      id, "Regenerated by admin", req.user?.id, getClientIp(req)
    );
    const newAg = await pool.query(RICH_SELECT + `WHERE a.id=$1`, [newId]);
    const ag = newAg.rows[0];
    const bkNum = ag?.booking_number || "";
    const sigUrl = bkNum ? buildSigningUrl(bkNum, newAccessToken, getSiteBase()) : null;

    // Notify the customer on all channels so they receive the new signing link immediately
    if (ag?.customer_mobile && sigUrl) {
      triggerWorkflow("agreement_generated", {
        customerName:   ag.customer_name  || "Valued Customer",
        customerMobile: ag.customer_mobile,
        bookingNumber:  ag.booking_number,
        packageName:    ag.package_name,
        agreementUrl:   sigUrl,
        bookingId:      ag.booking_id,
        customerId:     ag.customer_id,
      }).catch((e: any) => console.error("[Agreement] Regenerate notify failed:", e));
    }

    res.json({ ok: true, newAgreement: ag, signingUrl: sigUrl });
  } catch (err: any) {
    console.error("[Agreement] Regenerate error:", err);
    res.status(err?.statusCode || 500).json({ error: "Failed to regenerate" });
  }
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
         AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.booking_id=b.id AND a.status NOT IN ('cancelled','superseded'))
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
       WHERE a.booking_id=$1 AND a.status NOT IN ('cancelled','superseded') ORDER BY a.created_at DESC LIMIT 1`, [bookingId]
    );
    if (!agRes.rows.length) return res.status(400).json({ error: "Could not create agreement" });
    res.json({ ok: true, agreement: agRes.rows[0] });
  } catch { res.status(500).json({ error: "Failed to ensure agreement" }); }
});

export default router;

// ── Agreement Integrity Check (called by nightly cron) ────────────────────────
export async function runAgreementIntegrityCheck(): Promise<{ checked: number; fixed: number; issues: string[] }> {
  const issues: string[] = [];
  let fixed = 0;
  try {
    // Fix 1: backfill any NULL verification_tokens
    const nullRes = await pool.query(
      `UPDATE agreements
         SET verification_token = gen_random_uuid(), updated_at = NOW()
       WHERE verification_token IS NULL
       RETURNING id, agreement_number`
    );
    if (nullRes.rowCount && nullRes.rowCount > 0) {
      for (const r of nullRes.rows) {
        issues.push(`Fixed NULL verification_token: ${r.agreement_number}`);
        fixed++;
      }
    }

    // Fix 1b: backfill any NULL access_tokens for unsigned agreements
    // (all pending_signature agreements must have a valid access_token so admin can resend)
    const nullAt = await pool.query(
      `UPDATE agreements
         SET access_token            = REPLACE(gen_random_uuid()::text,'-','') || REPLACE(gen_random_uuid()::text,'-',''),
             access_token_expires_at = NOW() + INTERVAL '30 days',
             updated_at              = NOW()
       WHERE status = 'pending_signature'
         AND access_token IS NULL
       RETURNING id, agreement_number`
    );
    if (nullAt.rowCount && nullAt.rowCount > 0) {
      for (const r of nullAt.rows) {
        issues.push(`Backfilled NULL access_token: ${r.agreement_number}`);
        fixed++;
      }
    }

    // Check 2: agreements with no linked booking (orphaned)
    const orphaned = await pool.query(
      `SELECT a.agreement_number
         FROM agreements a
         LEFT JOIN bookings b ON b.id = a.booking_id
        WHERE b.id IS NULL AND a.status NOT IN ('cancelled','superseded')`
    );
    for (const r of orphaned.rows) {
      issues.push(`Orphaned agreement (no booking): ${r.agreement_number}`);
    }

    // Check 3: active bookings that approved/confirmed but have no agreement
    const missing = await pool.query(
      `SELECT b.booking_number
         FROM bookings b
        WHERE b.status IN ('approved','confirmed','partially_paid')
          AND NOT EXISTS (
            SELECT 1 FROM agreements a
             WHERE a.booking_id = b.id AND a.status NOT IN ('cancelled','superseded')
          )`
    );
    for (const r of missing.rows) {
      issues.push(`No agreement for booking: ${r.booking_number}`);
    }

    const totalRes = await pool.query(`SELECT COUNT(*) FROM agreements WHERE status NOT IN ('cancelled','superseded')`);
    const checked = parseInt(totalRes.rows[0].count || "0");

    if (issues.length > 0) {
      console.log(`[AgreementIntegrity] ⚠️ ${checked} agreements checked | fixed: ${fixed} | issues: ${issues.length}`);
      issues.forEach(i => console.log(`  • ${i}`));
    } else {
      console.log(`[AgreementIntegrity] ✅ All ${checked} active agreements OK`);
    }
    return { checked, fixed, issues };
  } catch (err: any) {
    const msg = `Integrity check error: ${err?.message}`;
    console.error("[AgreementIntegrity]", msg);
    return { checked: 0, fixed: 0, issues: [msg] };
  }
}
