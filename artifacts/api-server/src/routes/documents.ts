// @ts-nocheck
import { Router } from "express";
import { db, bookingsTable, pilgrimsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendCustomerDocumentUploadNotification } from "../lib/notifications.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
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

// ── GET /api/documents — admin list all documents ────────────────────────────
router.get("/", requireAdmin as any, async (_req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.booking_id, d.document_type, d.file_name, d.file_url,
              d.uploaded_by, d.created_at,
              b.booking_number, b.package_name,
              u.name AS customer_name
       FROM documents d
       LEFT JOIN bookings b ON d.booking_id = b.id
       LEFT JOIN users u ON b.customer_id = u.id
       ORDER BY d.created_at DESC
       LIMIT 500`
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const docAccessToken = randomUUID(); // secure token for public share URL (no expiry, revoke via is_revoked)
    const { rows: [doc] } = await pool.query(
      `INSERT INTO documents
         (id, booking_id, customer_id, document_type, file_name, original_filename,
          file_key, file_url, file_size, mime_type, uploaded_by, is_visible_to_customer,
          notification_sent, access_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,FALSE,$12)
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
        docAccessToken,
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

            } else if (documentType === "hotel_voucher") {
              // Hotel voucher email with optional PDF attachment
              const { sendGenericEmail } = await import("../services/emailService.js");
              const result = await sendGenericEmail(
                custEmail,
                `Your Hotel Voucher is Ready – Al Burhan Tours & Travels`,
                `Assalamu Alaikum ${custName},\n\nYour Hotel Voucher for booking #${bkNum} is ready.\n\nPlease login to your dashboard to view and download it.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`,
                {
                  title: "Hotel Voucher Ready",
                  attachments: pdfBuffer ? [{ filename: req.file.originalname, content: pdfBuffer, contentType: "application/pdf" }] : undefined,
                }
              );
              console.log(`[Documents][Email] Hotel Voucher email to ${custEmail}: ok=${result.ok}${result.error ? ` err=${result.error}` : ""}`);
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
  const isVisible = visible !== false;
  await pool.query(
    `UPDATE documents SET is_visible_to_customer = $1 WHERE id = $2`,
    [isVisible, req.params.id]
  );
  res.json({ ok: true });

  // ── When making document visible → notify customer that docs are approved ──
  if (isVisible) {
    setImmediate(async () => {
      try {
        const { rows } = await pool.query(
          `SELECT d.document_type, d.file_name,
                  b.id AS booking_id, b.booking_number, b.customer_id,
                  b.customer_name, b.customer_mobile, b.customer_email, b.package_name
           FROM documents d
           JOIN bookings b ON b.id = d.booking_id
           WHERE d.id = $1`,
          [req.params.id]
        );
        const doc = rows[0];
        if (!doc || !doc.customer_mobile) return;
        fireNotificationEvent("documents_approved" as any, {
          customerName:   doc.customer_name,
          customerMobile: doc.customer_mobile,
          customerEmail:  doc.customer_email,
          customerId:     doc.customer_id,
          bookingId:      doc.booking_id,
          bookingNumber:  doc.booking_number,
          packageName:    doc.package_name,
          documentType:   doc.document_type,
        }).catch(() => {});
        triggerWorkflow("document_reminder" as any, {
          customerName:   doc.customer_name,
          customerMobile: doc.customer_mobile,
          bookingId:      doc.booking_id,
          bookingNumber:  doc.booking_number,
          customerId:     doc.customer_id,
          packageName:    doc.package_name,
        }).catch(() => {});
      } catch {}
    });
  }
});

// ── Public: secure shareable document link (no auth, token-gated) ────────────
// GET /api/documents/public/:bookingNumber/:docType?token=ACCESS_TOKEN
// Resolves and streams/redirects a document identified by an access_token.
//
// URL resolution by stored file_url format:
//   • http(s)://…                     → 302 redirect (external CDN / legacy GCS signed URL)
//   • /api/storage/objects/{prefix}/… → proxy: download from object storage, stream as attachment
//   • /api/documents/files/{name}     → proxy: read from disk uploads directory, stream as attachment
//
// Never exposes raw storage paths externally — only this token-gated endpoint.
router.get("/public/:bookingNumber/:docType", async (req, res) => {
  const { bookingNumber, docType } = req.params;
  const { token } = req.query as { token?: string };
  if (!token) { res.status(401).json({ message: "Token required" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.file_url, d.file_name, d.mime_type
       FROM documents d
       JOIN bookings b ON b.id = d.booking_id
       WHERE b.booking_number = $1
         AND d.document_type  = $2
         AND d.access_token   = $3
         AND d.is_visible_to_customer = TRUE
         AND d.uploaded_by    = 'admin'
         AND (d.is_revoked IS NULL OR d.is_revoked = FALSE)
       ORDER BY d.created_at DESC
       LIMIT 1`,
      [bookingNumber, docType, token]
    );
    if (!rows[0]) {
      res.status(404).json({ message: "Document not found or invalid token" });
      return;
    }
    const fileUrl: string = rows[0].file_url || "";
    const mimeType: string = rows[0].mime_type || "application/octet-stream";
    const fileName: string = path.basename(rows[0].file_name || `document.bin`);

    // ── Case 1: external/legacy HTTPS URL → redirect ──────────────────────────
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      res.redirect(302, fileUrl);
      return;
    }

    // ── Case 2: Replit object storage → proxy (download + stream) ─────────────
    if (fileUrl.startsWith("/api/storage/objects/")) {
      const { objectStorageClient } = await import("../lib/objectStorage.js");
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        console.error("[Documents/public] DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
        res.status(503).json({ message: "Storage not configured" });
        return;
      }
      const tail   = fileUrl.replace("/api/storage/objects/", "");
      const gcsKey = `objects/${tail}`;
      const [buffer] = await objectStorageClient.bucket(bucketId).file(gcsKey).download();
      res.setHeader("Content-Type",        mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("Cache-Control",       "private, max-age=3600");
      res.status(200).send(buffer);
      return;
    }

    // ── Case 3: disk fallback (/api/documents/files/… or bare filename) ────────
    {
      // path.basename strips any directory traversal components
      const baseName = path.basename(fileUrl.replace("/api/documents/files/", "") || fileName);
      const filePath = path.join(UPLOADS_DIR, baseName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: "File not found on disk" });
        return;
      }
      res.setHeader("Content-Type",        mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(baseName)}"`);
      res.setHeader("Cache-Control",       "private, max-age=3600");
      res.sendFile(filePath);
    }
  } catch (err: any) {
    console.error("[Documents/public] error:", err?.message);
    res.status(500).json({ message: "Failed to retrieve document" });
  }
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
// Ownership enforced: non-admin users may only list documents for bookings that
// belong to them (customer_mobile match). access_token is included only when
// the caller owns the booking or is an admin.
router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const isAdmin = req.user?.role === "admin";

    if (!isAdmin) {
      // Verify the booking belongs to the requesting user
      const bkRes = await pool.query(
        `SELECT id, customer_mobile FROM bookings WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [req.params.bookingId]
      );
      const bk = bkRes.rows[0];
      if (!bk) { res.status(404).json({ message: "Booking not found" }); return; }
      if (bk.customer_mobile !== req.user?.mobile) {
        res.status(403).json({ message: "Access denied" }); return;
      }
    }

    const { rows } = isAdmin
      ? await pool.query(
          `SELECT * FROM documents WHERE booking_id = $1 AND is_revoked = FALSE ORDER BY created_at ASC`,
          [req.params.bookingId]
        )
      : await pool.query(
          `SELECT * FROM documents WHERE booking_id = $1 AND is_revoked = FALSE AND is_visible_to_customer = TRUE ORDER BY created_at ASC`,
          [req.params.bookingId]
        );

    // Strip access_token from admin responses (they use direct GCS URLs anyway)
    res.json(rows.map(d => {
      const norm = normalizeDoc(d);
      if (isAdmin) { norm.accessToken = null; }
      return norm;
    }));
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

// ── ZIP download: all travel documents for a booking ──────────────────────────
// GET /api/documents/zip/:bookingId — customer downloads all their admin-uploaded docs as ZIP
router.get("/zip/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;

    // Verify ownership
    const bRes = await pool.query(
      `SELECT id, customer_id, booking_number FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    const booking = bRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });
    if (booking.customer_id !== req.user?.id && req.user?.role !== "admin") {
      return void res.status(403).json({ error: "Forbidden" });
    }

    // Get all visible docs for this booking
    const docRes = await pool.query(
      `SELECT id, file_name, file_url, file_key, mime_type, document_type, uploaded_by
       FROM documents
       WHERE booking_id = $1 AND is_visible_to_customer = true AND is_revoked = false
       ORDER BY document_type, created_at`,
      [bookingId]
    );
    const docs = docRes.rows;
    if (docs.length === 0) return void res.status(404).json({ error: "No documents available for download" });

    const archiver = await import("archiver");
    const https = await import("https");
    const http = await import("http");
    const stream = await import("stream");

    const archive = archiver.default("zip", { zlib: { level: 6 } });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="documents-${booking.booking_number || bookingId}.zip"`
    );
    archive.pipe(res);

    archive.on("error", (err: Error) => {
      console.error("[Documents/ZIP] archiver error:", err);
    });

    const fetchBuffer = (url: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        const mod = url.startsWith("https") ? https.default : http.default;
        mod.get(url, (resp) => {
          const chunks: Buffer[] = [];
          resp.on("data", (c: Buffer) => chunks.push(c));
          resp.on("end", () => resolve(Buffer.concat(chunks)));
          resp.on("error", reject);
        }).on("error", reject);
      });
    };

    for (const doc of docs) {
      try {
        const fileUrl = doc.file_url?.startsWith("http")
          ? doc.file_url
          : `${req.protocol}://${req.get("host")}${doc.file_url}`;

        const buf = await fetchBuffer(fileUrl);
        const entryName = `${doc.document_type}/${doc.file_name || doc.id}`;
        archive.append(buf, { name: entryName });
      } catch (err) {
        console.error(`[Documents/ZIP] Failed to fetch doc ${doc.id}:`, err);
      }
    }

    // Log downloads
    for (const doc of docs) {
      pool.query(
        `UPDATE documents SET download_count = COALESCE(download_count, 0) + 1, last_downloaded_at = NOW() WHERE id = $1`,
        [doc.id]
      ).catch(() => {});
    }

    await archive.finalize();
  } catch (err: any) {
    console.error("[Documents/ZIP] error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
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
    accessToken: d.access_token ?? null,
  };
}

export default router;
