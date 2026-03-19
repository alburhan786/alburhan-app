import { Router } from "express";
import { db, documentsTable, bookingsTable, pilgrimsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import { sendCustomerDocumentUploadNotification, sendAdminDocumentReadyNotification } from "../lib/notifications.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const ADMIN_NOTIFIED_DOC_TYPES = ["flight_ticket", "visa", "room_allotment", "bus_allotment"];

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WebP, and PDF files are allowed"));
    }
  },
});

const VALID_DOCUMENT_TYPES = [
  "passport", "pan_card", "aadhaar", "passport_photo",
  "flight_ticket", "visa", "room_allotment", "bus_allotment",
  "medical_certificate", "other"
];

const router = Router();

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

    const fileKey = `uploads/${req.file.filename}`;
    const fileUrl = `/api/documents/files/${req.file.filename}`;

    const [doc] = await db.insert(documentsTable).values({
      bookingId,
      documentType: documentType as any,
      fileName: req.file.originalname,
      fileKey,
      fileUrl,
      uploadedBy: req.user?.role === "admin" ? "admin" : "customer",
    }).returning();

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
              console.log(`[Documents] Synced passport photo to pilgrim ${pilgrim.id} (passport ${passportNumber})`);
            }
          }
        }
      } catch (err) {
        console.error("[Documents] Failed to sync passport photo to pilgrim:", err);
      }
    }

    res.status(201).json({
      ...doc,
      createdAt: doc.createdAt?.toISOString?.(),
    });

    const isAdmin = req.user?.role === "admin";
    const bkNum = booking.bookingNumber;
    const custName = booking.customerName;
    const custMobile = booking.customerMobile;
    const custEmail = booking.customerEmail;

    if (isAdmin && ADMIN_NOTIFIED_DOC_TYPES.includes(documentType)) {
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

router.get("/files/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

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

router.delete("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (docs[0]?.fileKey) {
    const filePath = path.join(UPLOADS_DIR, path.basename(docs[0].fileKey));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await db.delete(documentsTable).where(eq(documentsTable.id, req.params.id));
  res.json({ message: "Document deleted" });
});

export default router;
