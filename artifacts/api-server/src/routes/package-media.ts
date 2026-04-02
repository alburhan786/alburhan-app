import { Router } from "express";
import { db, packagesTable, packageMediaTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
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

router.get("/:id/gallery", async (req, res) => {
  const media = await db
    .select()
    .from(packageMediaTable)
    .where(eq(packageMediaTable.packageId, req.params.id))
    .orderBy(asc(packageMediaTable.displayOrder), asc(packageMediaTable.createdAt));
  res.json(media);
});

router.post(
  "/:id/gallery/upload-image",
  requireAdmin as any,
  uploadImage.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ message: "No image file provided" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "package_gallery");
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const displayOrder = req.body.displayOrder ? parseInt(req.body.displayOrder) : 0;
    const [media] = await db.insert(packageMediaTable).values({
      packageId: req.params.id,
      type: "image",
      url: fileUrl,
      caption,
      displayOrder,
    }).returning();
    res.json(media);
  }
);

router.post(
  "/:id/gallery/upload-video",
  requireAdmin as any,
  uploadVideo.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ message: "No video file provided" }); return; }
    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
    if (!pkgs[0]) { res.status(404).json({ message: "Package not found" }); return; }
    const fileUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "package_gallery");
    const caption = typeof req.body.caption === "string" ? req.body.caption : null;
    const displayOrder = req.body.displayOrder ? parseInt(req.body.displayOrder) : 0;
    const [media] = await db.insert(packageMediaTable).values({
      packageId: req.params.id,
      type: "video",
      url: fileUrl,
      caption,
      displayOrder,
    }).returning();
    res.json(media);
  }
);

router.patch(
  "/:id/gallery/:mediaId",
  requireAdmin as any,
  async (req, res) => {
    const { caption, displayOrder } = req.body;
    const updates: any = {};
    if (caption !== undefined) updates.caption = caption;
    if (displayOrder !== undefined) updates.displayOrder = parseInt(displayOrder);
    if (Object.keys(updates).length === 0) { res.status(400).json({ message: "Nothing to update" }); return; }
    const [updated] = await db.update(packageMediaTable)
      .set(updates)
      .where(eq(packageMediaTable.id, req.params.mediaId))
      .returning();
    res.json(updated);
  }
);

router.delete(
  "/:id/gallery/:mediaId",
  requireAdmin as any,
  async (req, res) => {
    const media = await db.select().from(packageMediaTable).where(eq(packageMediaTable.id, req.params.mediaId)).limit(1);
    if (!media[0]) { res.status(404).json({ message: "Media not found" }); return; }
    try { await deleteFromGCS(media[0].url); } catch {}
    await db.delete(packageMediaTable).where(eq(packageMediaTable.id, req.params.mediaId));
    res.json({ message: "Deleted" });
  }
);

export default router;
