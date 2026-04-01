import { Router } from "express";
import { db, packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WebP images are allowed"));
  },
});

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only MP4, WebM, OGG, MOV, AVI videos are allowed"));
  },
});

const router = Router();

router.post(
  "/:id/upload-cover",
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
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
    await db.update(packagesTable)
      .set({ imageUrl: fileUrl, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ imageUrl: fileUrl });
  }
);

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
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
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
    await deleteFromGCS(url);
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
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
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
    await deleteFromGCS(url);
    await db.update(packagesTable)
      .set({ videoUrls: updated, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ videoUrls: updated });
  }
);

router.post(
  "/:id/upload-meena-image",
  requireAdmin as any,
  uploadImage.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ message: "No image file provided" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
    const details: any = pkgs[0].details || {};
    const current: string[] = details.meenaTentImageUrls || [];
    const updated = [...current, fileUrl];
    await db.update(packagesTable)
      .set({ details: { ...details, meenaTentImageUrls: updated }, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ url: fileUrl, meenaTentImageUrls: updated });
  }
);

router.delete(
  "/:id/remove-meena-image",
  requireAdmin as any,
  async (req, res) => {
    const { url } = req.body;
    if (!url) { res.status(400).json({ message: "url is required" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const details: any = pkgs[0].details || {};
    const current: string[] = details.meenaTentImageUrls || [];
    const updated = current.filter((u) => u !== url);
    await deleteFromGCS(url);
    await db.update(packagesTable)
      .set({ details: { ...details, meenaTentImageUrls: updated }, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ meenaTentImageUrls: updated });
  }
);

router.post(
  "/:id/upload-meena-video",
  requireAdmin as any,
  uploadVideo.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ message: "No video file provided" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
    const details: any = pkgs[0].details || {};
    const current: string[] = details.meenaTentVideoUrls || [];
    const updated = [...current, fileUrl];
    await db.update(packagesTable)
      .set({ details: { ...details, meenaTentVideoUrls: updated }, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ url: fileUrl, meenaTentVideoUrls: updated });
  }
);

router.delete(
  "/:id/remove-meena-video",
  requireAdmin as any,
  async (req, res) => {
    const { url } = req.body;
    if (!url) { res.status(400).json({ message: "url is required" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const details: any = pkgs[0].details || {};
    const current: string[] = details.meenaTentVideoUrls || [];
    const updated = current.filter((u) => u !== url);
    await deleteFromGCS(url);
    await db.update(packagesTable)
      .set({ details: { ...details, meenaTentVideoUrls: updated }, updatedAt: new Date() })
      .where(eq(packagesTable.id, req.params.id));
    res.json({ meenaTentVideoUrls: updated });
  }
);

export default router;
