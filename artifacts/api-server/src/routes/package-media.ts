import { Router } from "express";
import { db, packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `pkg_img_${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `pkg_vid_${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WebP images are allowed"));
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only MP4, WebM, OGG, MOV, AVI videos are allowed"));
  },
});

const router = Router();

router.post(
  "/:id/upload-image",
  requireAdmin as any,
  uploadImage.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "No image file provided" });
      return;
    }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) {
      res.status(404).json({ message: "Package not found" });
      return;
    }
    const fileUrl = `/api/documents/files/${req.file.filename}`;
    const currentUrls: string[] = (pkgs[0].imageUrls as string[]) || [];
    const updated = [...currentUrls, fileUrl];
    await db.update(packagesTable)
      .set({ imageUrls: updated, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ url: fileUrl, imageUrls: updated });
  }
);

router.delete(
  "/:id/remove-image",
  requireAdmin as any,
  async (req, res) => {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ message: "url is required" });
      return;
    }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) {
      res.status(404).json({ message: "Package not found" });
      return;
    }
    const currentUrls: string[] = (pkgs[0].imageUrls as string[]) || [];
    const updated = currentUrls.filter((u) => u !== url);
    const filename = path.basename(url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.update(packagesTable)
      .set({ imageUrls: updated, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ imageUrls: updated });
  }
);

router.post(
  "/:id/upload-video",
  requireAdmin as any,
  uploadVideo.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "No video file provided" });
      return;
    }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) {
      res.status(404).json({ message: "Package not found" });
      return;
    }
    const fileUrl = `/api/documents/files/${req.file.filename}`;
    const currentUrls: string[] = (pkgs[0].videoUrls as string[]) || [];
    const updated = [...currentUrls, fileUrl];
    await db.update(packagesTable)
      .set({ videoUrls: updated, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ url: fileUrl, videoUrls: updated });
  }
);

router.delete(
  "/:id/remove-video",
  requireAdmin as any,
  async (req, res) => {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ message: "url is required" });
      return;
    }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) {
      res.status(404).json({ message: "Package not found" });
      return;
    }
    const currentUrls: string[] = (pkgs[0].videoUrls as string[]) || [];
    const updated = currentUrls.filter((u) => u !== url);
    const filename = path.basename(url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.update(packagesTable)
      .set({ videoUrls: updated, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ videoUrls: updated });
  }
);

export default router;
