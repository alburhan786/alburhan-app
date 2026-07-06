import { Router } from "express";
import { db, documentsTable, bookingsTable, pilgrimsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendCustomerDocumentUploadNotification, sendAdminDocumentReadyNotification } from "../lib/notifications.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import { pool } from "@workspace/db";
import { randomUUID } from "crypto";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/jpg", "image/png", "image/webp",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/msword", // doc
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WebP, PDF, DOC, DOCX files are allowed"));
    }
  },
});

const VALID_DOCUMENT_TYPES = [
  // Customer uploads (KYC)
  "passport", "pan_card", "aadhaar", "passport_photo", "medical_certificate", "other",
  // Admin-delivered travel documents
  "flight_ticket", "visa", "room_allotment", "bus_allotment", "model_contract",
  "tour_itinerary", "hotel_voucher", "payment_receipt", "ziyarat_schedule",
  "insurance", "hajj_id", "luggage_tag", "emergency_contact_card",
];

// All types that trigger customer notifications when admin uploads
const ADMIN_NOTIFIED_DOC_TYPES = new Set([
  "flight_ticket", "visa", "room_allotment", "bus_allotment", "model_contract",
  "tour_itinerary", "hotel_voucher", "payment_receipt", "ziyarat_schedule",
  "insurance", "hajj_id", "luggage_tag", "emergency_contact_card",
]);

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
    const fileKey = fileUrl;

    const [doc] = await db.insert(documentsTable).values({
      bookingId,
      documentType: documentType as any,
      fileName: req.file.originalname,
      fileKey,
      fileUrl,
      uploadedBy: req.user?.role === "admin" ? "admin" : "customer",
    }).returning();

    // Sync passport photo to pilgrim
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

    res.status(201).json({ ...doc, createdAt: doc.createdAt?.toISOString?.() });

    // Notifications (fire-and-forget)
    const isAdmin = req.user?.role === "admin";
    const bkNum = booking.bookingNumber;
    const custName = booking.customerName;
    const custMobile = booking.customerMobile;
    const custEmail = booking.customerEmail;

    if (isAdmin && ADMIN_NOTIFIED_DOC_TYPES.has(documentType)) {
      sendAdminDocumentReadyNotification({
        mobile: custMobile,
        email: custEmail,
        customerName: custName,
        bookingNumber: bkNum,
        documentType,
      }).catch(err => console.error("[Documents] Admin doc notification error:", err));
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

// ── Serve local files ────────────────────────────────────────────────────────
router.get("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

// ── Log download (customer calls this when downloading) ──────────────────────
router.post("/:id/log-download", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docId = req.params.id;
  try {
    const docs = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
    if (!docs[0]) { res.status(404).json({ message: "Document not found" }); return; }

    const doc = docs[0];
    // Security: only booking owner or admin
    if (req.user?.role !== "admin") {
      const [booking] = await db.select({ customerId: bookingsTable.customerId })
        .from(bookingsTable).where(eq(bookingsTable.id, doc.bookingId));
      if (!booking || booking.customerId !== req.user?.id) {
        res.status(403).json({ message: "Forbidden" }); return;
      }
    }

    // Increment counter + set last downloaded
    await pool.query(
      `UPDATE documents SET download_count = COALESCE(download_count, 0) + 1, last_downloaded_at = NOW() WHERE id = $1`,
      [docId]
    );
    // Insert log
    await pool.query(
      `INSERT INTO document_download_logs (id, document_id, booking_id, customer_id, ip_address) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), docId, doc.bookingId, req.user?.id || null, req.ip || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[Documents] log-download error:", err);
    res.json({ ok: false });
  }
});

// ── Admin: get download stats per document for a booking ─────────────────────
router.get("/stats/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "admin") { res.status(403).json({ message: "Admin only" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.document_type, d.file_name, d.uploaded_by, d.created_at,
              d.download_count, d.last_downloaded_at, d.is_revoked,
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
  await pool.query(`UPDATE documents SET is_revoked = TRUE WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// ── List documents for a booking ─────────────────────────────────────────────
router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.bookingId, req.params.bookingId))
    .orderBy(documentsTable.createdAt);

  res.json(docs.map(d => ({
    ...d,
    createdAt: d.createdAt?.toISOString?.(),
  })));
});

// ── Delete a document ─────────────────────────────────────────────────────────
router.delete("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (docs[0]?.fileUrl) {
    await deleteFromGCS(docs[0].fileUrl);
  }
  await db.delete(documentsTable).where(eq(documentsTable.id, req.params.id));
  res.json({ message: "Document deleted" });
});

export default router;
