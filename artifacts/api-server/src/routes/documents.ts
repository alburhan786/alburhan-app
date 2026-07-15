// @ts-nocheck
import { Router } from "express";
import { db, bookingsTable, pilgrimsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendCustomerDocumentUploadNotification } from "../lib/notifications.js";
import { sendDocumentToCustomer, TRAVEL_DOC_TYPES } from "../lib/documentDelivery.js";
import { sendTicketEmail, sendVisaEmail } from "../services/emailService.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import { pool } from "@workspace/db";
import { randomUUID } from "crypto";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

const ALLOWED_DOC_MIME_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WebP, GIF, HEIC, PDF, DOC or DOCX files are allowed."));
  },
});

const VALID_DOCUMENT_TYPES = [
  "passport", "pan_card", "aadhaar", "passport_photo", "medical_certificate",
  "passport_copy", "vaccination_certificate", "other",
  "flight_ticket", "visa", "room_allotment", "bus_allotment", "model_contract",
  "tour_itinerary", "hotel_voucher", "payment_receipt", "ziyarat_schedule",
  "insurance", "hajj_id", "luggage_tag", "emergency_contact_card",
];

const router = Router();

// ── Upload document ─────────────────────────────────────────────────────────
router.post(
  "/upload",
  requireAuth as any,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ message: "No file provided" });
      return;
    }

    const { bookingId, documentType } = req.body;

    if (!bookingId || !documentType) {
      res.status(400).json({ message: "bookingId and documentType are required" });
      return;
    }

    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      res.status(400).json({ message: "Invalid document type" });
      return;
    }

    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    if (req.user?.role !== "admin" && booking.customerId !== req.user?.id) {
      res.status(403).json({ message: "Not authorized to upload documents for this booking" });
      return;
    }

    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "private_uploads");

    // Use pool.query to support all enum values and new columns (avoids Drizzle type constraints)
    const docId = randomUUID();
    const { rows: [doc] } = await pool.query(
      `INSERT INTO documents
         (id, booking_id, customer_id, document_type, file_name, original_filename,
          file_key, file_url, file_size, mime_type, uploaded_by, is_visible_to_customer, notification_sent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,FALSE)
       RETURNING *`,
      [
        docId,
        bookingId,
        booking.customerId || null,
        documentType,
        req.file.originalname,
        req.file.originalname,
        fileUrl,
        fileUrl,
        req.file.size,
        req.file.mimetype,
        req.user?.role === "admin" ? "admin" : "customer",
      ]
    );

    // Sync passport photo to pilgrim record
    if (documentType === "passport_photo") {
      try {
        const pilgrims = booking.pilgrims as Array<{ name: string; passportNumber?: string }> | null;
        if (Array.isArray(pilgrims) && pilgrims.length > 0) {
          const passportNumber = pilgrims[0].passportNumber;
          if (passportNumber) {
            const [pilgrim] = await db.select({ id: pilgrimsTable.id })
              .from(pilgrimsTable)
              .where(eq(pilgrimsTable.passportNumber, passportNumber))
              .limit(1);
            if (pilgrim) {
              await db.update(pilgrimsTable)
                .set({ photoUrl: fileUrl })
                .where(eq(pilgrimsTable.id, pilgrim.id));
            }
          }
        }
      } catch (err) {
        console.error("[Documents] Failed to sync passport photo to pilgrim:", err);
      }
    }

    res.status(201).json(normalizeDoc(doc));

    // Fire notifications (fire-and-forget)
    const isAdmin = req.user?.role === "admin";
    const bkNum = booking.bookingNumber;
    const custName = booking.customerName;
    const custMobile = booking.customerMobile;
    const custEmail = booking.customerEmail;

    if (isAdmin && TRAVEL_DOC_TYPES.has(documentType)) {
      // ── WhatsApp / SMS notification (existing channel) ──────────────────────
      sendDocumentToCustomer({
        docId,
        bookingId,
        bookingNumber: bkNum,
        customerId: booking.customerId || null,
        customerName: custName,
        customerMobile: custMobile,
        customerEmail: custEmail,
        documentType,
        fileName: req.file.originalname,
        fileUrl: doc.file_url,
        mimeType: req.file.mimetype,
        packageName: (booking as any).packageName || (booking as any).package_name || null,
      }).catch(err => console.error("[Documents] sendDocumentToCustomer error:", err));

      // ── Email notification (new channel) — fire-and-forget ──────────────────
      // Only fires if customer has an email on the booking record.
      // Attaches the document as PDF when the upload is a PDF file.
      if (custEmail) {
        (async () => {
          try {
            // Build optional PDF attachment if the uploaded file is a PDF
            const pdfBuffer = req.file.mimetype === "application/pdf"
              ? req.file.buffer
              : undefined;

            const pkgName = (booking as any).packageName || (booking as any).package_name || undefined;

            if (documentType === "flight_ticket" || documentType === "return_ticket" || documentType === "ticket") {
              // Flight ticket email with optional PDF attachment
              const result = await sendTicketEmail(
                custEmail,
                {
                  customerName:  custName,
                  bookingNumber: bkNum,
                  packageName:   pkgName,
                  fileName:      req.file.originalname,
                },
                pdfBuffer
              );
              console.log(`[Documents][Email] Ticket email to ${custEmail}: ok=${result.ok}${result.error ? ` err=${result.error}` : ""}`);

            } else if (documentType === "visa" || documentType === "visa_copy") {
              // Visa document email with optional PDF attachment
              const result = await sendVisaEmail(
                custEmail,
                {
                  customerName:  custName,
                  bookingNumber: bkNum,
                  packageName:   pkgName,
                  fileName:      req.file.originalname,
                },
                pdfBuffer
              );
              console.log(`[Documents][Email] Visa email to ${custEmail}: ok=${result.ok}${result.error ? ` err=${result.error}` : ""}`);
            }
          } catch (err: any) {
            console.error("[Documents][Email] Email send failed (non-fatal):", err?.message || err);
          }
        })();
      }
    } else if (!isAdmin) {
      sendCustomerDocumentUploadNotification({
        customerName: custName,
        customerMobile: custMobile,
        bookingNumber: bkNum,
        documentType,
      }).catch(err => console.error("[Documents] Customer doc notification error:", err));
    }
  }
);

// ── Mark document as viewed ──────────────────────────────────────────────────
router.patch("/:id/viewed", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docId = req.params.id;
  try {
    const { rows } = await pool.query(`SELECT * FROM documents WHERE id = $1`, [docId]);
    if (!rows[0]) { res.status(404).json({ message: "Document not found" }); return; }
    if (req.user?.role !== "admin" && rows[0].customer_id !== req.user?.id) {
      res.status(403).json({ message: "Forbidden" }); return;
    }
    await pool.query(
      `UPDATE documents SET viewed_at = NOW() WHERE id = $1 AND viewed_at IS NULL`,
      [docId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

// ── Admin: toggle document visibility ────────────────────────────────────────
router.patch("/:id/visibility", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  const { visible } = req.body;
  await pool.query(
    `UPDATE documents SET is_visible_to_customer = $1 WHERE id = $2`,
    [visible !== false, req.params.id]
  );
  res.json({ ok: true });
});

// ── Serve local fallback files (disk storage) ─────────────────────────────────
router.get("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

// ── Log download ─────────────────────────────────────────────────────────────
router.post("/:id/log-download", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docId = req.params.id;
  try {
    const { rows } = await pool.query(`SELECT * FROM documents WHERE id = $1`, [docId]);
    if (!rows[0]) { res.status(404).json({ message: "Document not found" }); return; }
    if (req.user?.role !== "admin" && rows[0].customer_id !== req.user?.id) {
      res.status(403).json({ message: "Forbidden" }); return;
    }
    await pool.query(
      `UPDATE documents SET download_count = COALESCE(download_count, 0) + 1, last_downloaded_at = NOW() WHERE id = $1`,
      [docId]
    );
    await pool.query(
      `INSERT INTO document_download_logs (id, document_id, booking_id, customer_id, ip_address)
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), docId, rows[0].booking_id, req.user?.id || null, req.ip || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[Documents] log-download error:", err);
    res.json({ ok: false });
  }
});

// ── Admin: delivery stats per booking ────────────────────────────────────────
router.get("/stats/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.document_type, d.file_name, d.uploaded_by, d.created_at,
              d.download_count, d.last_downloaded_at, d.is_revoked,
              d.notification_sent, d.viewed_at, d.is_visible_to_customer,
              d.file_size, d.mime_type,
              (SELECT COUNT(*) FROM document_download_logs dl WHERE dl.document_id = d.id) AS total_downloads
       FROM documents d
       WHERE d.booking_id = $1
       ORDER BY d.created_at DESC`,
      [req.params.bookingId]
    );
    res.json(rows);
  } catch (err) {
    console.error("[Documents] stats error:", err);
    res.json([]);
  }
});

// ── Admin: revoke a document ─────────────────────────────────────────────────
router.patch("/:id/revoke", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  await pool.query(
    `UPDATE documents SET is_revoked = TRUE, is_visible_to_customer = FALSE WHERE id = $1`,
    [req.params.id]
  );
  res.json({ ok: true });
});

// ── List documents for a booking ─────────────────────────────────────────────
router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const isAdmin = req.user?.role === "admin";
    const { rows } = isAdmin
      ? await pool.query(
          `SELECT * FROM documents WHERE booking_id = $1 AND is_revoked = FALSE ORDER BY created_at ASC`,
          [req.params.bookingId]
        )
      : await pool.query(
          `SELECT * FROM documents WHERE booking_id = $1 AND is_revoked = FALSE AND is_visible_to_customer = TRUE ORDER BY created_at ASC`,
          [req.params.bookingId]
        );

    res.json(rows.map(normalizeDoc));
  } catch (err) {
    console.error("[Documents] list error:", err);
    res.json([]);
  }
});

// ── Admin: resend document to customer ───────────────────────────────────────
router.post("/:id/resend", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  const docId = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT d.*, b.booking_number, b.customer_name, b.customer_mobile, b.customer_email,
              b.customer_id AS b_customer_id, b.package_name
       FROM documents d
       JOIN bookings b ON b.id = d.booking_id
       WHERE d.id = $1`,
      [docId]
    );
    const doc = rows[0];
    if (!doc) { res.status(404).json({ message: "Document not found" }); return; }

    // Fire delivery asynchronously — respond immediately
    res.json({ ok: true, message: "Resending document to customer…" });

    sendDocumentToCustomer({
      docId,
      bookingId: doc.booking_id,
      bookingNumber: doc.booking_number,
      customerId: doc.b_customer_id || doc.customer_id || null,
      customerName: doc.customer_name,
      customerMobile: doc.customer_mobile,
      customerEmail: doc.customer_email,
      documentType: doc.document_type,
      fileName: doc.file_name,
      fileUrl: doc.file_url,
      mimeType: doc.mime_type,
      packageName: doc.package_name || null,
    }).catch(err => console.error("[Documents] resend error:", err));
  } catch (err: any) {
    console.error("[Documents] resend endpoint error:", err);
    res.status(500).json({ message: err?.message || "Resend failed" });
  }
});

// ── Delete a document ─────────────────────────────────────────────────────────
router.delete("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { rows } = await pool.query(`SELECT * FROM documents WHERE id = $1`, [req.params.id]);
  if (rows[0]?.file_url) {
    await deleteFromGCS(rows[0].file_url);
  }
  await pool.query(`DELETE FROM documents WHERE id = $1`, [req.params.id]);
  res.json({ message: "Document deleted" });
});

// ── Helper: normalize snake_case DB row → camelCase for frontend ──────────────
function normalizeDoc(d: any) {
  return {
    id: d.id,
    bookingId: d.booking_id,
    customerId: d.customer_id,
    documentType: d.document_type,
    fileName: d.file_name,
    originalFilename: d.original_filename,
    fileKey: d.file_key,
    fileUrl: d.file_url,
    fileSize: d.file_size,
    mimeType: d.mime_type,
    uploadedBy: d.uploaded_by,
    isVisibleToCustomer: d.is_visible_to_customer,
    notificationSent: d.notification_sent,
    viewedAt: d.viewed_at,
    downloadCount: d.download_count ?? 0,
    lastDownloadedAt: d.last_downloaded_at,
    isRevoked: d.is_revoked,
    createdAt: d.created_at,
  };
}

export default router;
