import { Router } from "express";
import { db, galleryImagesTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `gallery_${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WebP image files are allowed"));
    }
  },
});

const router = Router();

router.get(
  "/",
  requireAuth as any,
  requireAdmin as any,
  async (_req, res) => {
    const images = await db
      .select()
      .from(galleryImagesTable)
      .orderBy(asc(galleryImagesTable.sortOrder), desc(galleryImagesTable.createdAt));

    res.json(images.map(img => ({
      ...img,
      createdAt: img.createdAt?.toISOString?.(),
    })));
  }
);

router.get("/active", async (_req, res) => {
  const images = await db
    .select({
      id: galleryImagesTable.id,
      title: galleryImagesTable.title,
      fileUrl: galleryImagesTable.fileUrl,
      sortOrder: galleryImagesTable.sortOrder,
    })
    .from(galleryImagesTable)
    .where(eq(galleryImagesTable.isActive, true))
    .orderBy(asc(galleryImagesTable.sortOrder), desc(galleryImagesTable.createdAt));

  res.json(images);
});

router.post(
  "/upload",
  requireAuth as any,
  requireAdmin as any,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ message: "No file provided" });
      return;
    }

    const title = req.body.title || req.file.originalname;
    const fileUrl = `/api/documents/files/${req.file.filename}`;

    const [image] = await db.insert(galleryImagesTable).values({
      title,
      fileName: req.file.originalname,
      fileUrl,
      isActive: true,
      sortOrder: 0,
      uploadedBy: req.user?.mobile || "admin",
    }).returning();

    res.status(201).json({
      ...image,
      createdAt: image.createdAt?.toISOString?.(),
    });
  }
);

router.patch(
  "/:id/toggle",
  requireAuth as any,
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const existing = await db.select().from(galleryImagesTable).where(eq(galleryImagesTable.id, req.params.id)).limit(1);
    if (!existing[0]) {
      res.status(404).json({ message: "Image not found" });
      return;
    }

    const [updated] = await db
      .update(galleryImagesTable)
      .set({ isActive: !existing[0].isActive })
      .where(eq(galleryImagesTable.id, req.params.id))
      .returning();

    res.json({
      ...updated,
      createdAt: updated.createdAt?.toISOString?.(),
    });
  }
);

router.delete(
  "/:id",
  requireAuth as any,
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    const images = await db.select().from(galleryImagesTable).where(eq(galleryImagesTable.id, req.params.id));
    if (images[0]?.fileUrl) {
      const filename = path.basename(images[0].fileUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.delete(galleryImagesTable).where(eq(galleryImagesTable.id, req.params.id));
    res.json({ message: "Image deleted" });
  }
);

export default router;
