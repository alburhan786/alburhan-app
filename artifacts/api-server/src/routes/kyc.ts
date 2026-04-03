import { Router } from "express";
import { db, customerProfilesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { syncPilgrimsForUser } from "../lib/pilgrimUtils.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WebP and PDF files are allowed"));
  },
});

const kycFields = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "passportImage", maxCount: 1 },
  { name: "aadharImage", maxCount: 1 },
  { name: "panImage", maxCount: 1 },
  { name: "healthCertificate", maxCount: 1 },
]);

const router = Router();

router.get(
  "/profile",
  requireAuth as any,
  async (req: AuthenticatedRequest, res) => {
    const profiles = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .limit(1);
    if (!profiles[0]) {
      res.status(404).json({ message: "KYC not found" });
      return;
    }
    res.json(profiles[0]);
  }
);

router.post(
  "/submit",
  requireAuth as any,
  kycFields as any,
  async (req: AuthenticatedRequest, res) => {
    const files = (req as any).files as Record<string, Express.Multer.File[]>;
    const body = req.body;

    const existing = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .limit(1);

    const profileData: any = {
      name: body.name || null,
      phone: body.phone || null,
      whatsappNumber: body.whatsappNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address || null,
      passportNumber: body.passportNumber || null,
      passportIssueDate: body.passportIssueDate || null,
      passportExpiryDate: body.passportExpiryDate || null,
      passportPlaceOfIssue: body.passportPlaceOfIssue || null,
      bloodGroup: body.bloodGroup || null,
      aadharNumber: body.aadharNumber || null,
      panNumber: body.panNumber || null,
      kycStatus: existing[0]?.kycStatus === "approved" ? "approved" : "pending",
      updatedAt: new Date(),
    };

    if (files?.photo?.[0]) profileData.photoUrl = await uploadToGCS(files.photo[0].buffer, files.photo[0].originalname, files.photo[0].mimetype, "private_uploads");
    if (files?.passportImage?.[0]) profileData.passportImageUrl = await uploadToGCS(files.passportImage[0].buffer, files.passportImage[0].originalname, files.passportImage[0].mimetype, "private_uploads");
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = await uploadToGCS(files.aadharImage[0].buffer, files.aadharImage[0].originalname, files.aadharImage[0].mimetype, "private_uploads");
    if (files?.panImage?.[0]) profileData.panImageUrl = await uploadToGCS(files.panImage[0].buffer, files.panImage[0].originalname, files.panImage[0].mimetype, "private_uploads");
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = await uploadToGCS(files.healthCertificate[0].buffer, files.healthCertificate[0].originalname, files.healthCertificate[0].mimetype, "private_uploads");

    if (existing[0]) {
      const [updated] = await db
        .update(customerProfilesTable)
        .set(profileData)
        .where(eq(customerProfilesTable.userId, req.user!.id))
        .returning();
      syncPilgrimsForUser(req.user!.id, updated);
      res.json(updated);
    } else {
      const [created] = await db
        .insert(customerProfilesTable)
        .values({ ...profileData, userId: req.user!.id })
        .returning();
      syncPilgrimsForUser(req.user!.id, created);
      res.status(201).json(created);
    }
  }
);

router.put(
  "/update",
  requireAuth as any,
  kycFields as any,
  async (req: AuthenticatedRequest, res) => {
    const files = (req as any).files as Record<string, Express.Multer.File[]>;
    const body = req.body;

    const existing = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .limit(1);

    if (!existing[0]) {
      res.status(404).json({ message: "KYC profile not found. Please submit first." });
      return;
    }

    const profileData: any = {
      updatedAt: new Date(),
      kycStatus: existing[0].kycStatus === "approved" ? "approved" : "pending",
    };

    const fields = ["name","phone","whatsappNumber","dateOfBirth","gender","address",
      "passportNumber","passportIssueDate","passportExpiryDate","passportPlaceOfIssue",
      "bloodGroup","aadharNumber","panNumber"];
    for (const f of fields) {
      if (body[f] !== undefined) (profileData as any)[f] = body[f] || null;
    }

    if (files?.photo?.[0]) profileData.photoUrl = await uploadToGCS(files.photo[0].buffer, files.photo[0].originalname, files.photo[0].mimetype, "private_uploads");
    if (files?.passportImage?.[0]) profileData.passportImageUrl = await uploadToGCS(files.passportImage[0].buffer, files.passportImage[0].originalname, files.passportImage[0].mimetype, "private_uploads");
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = await uploadToGCS(files.aadharImage[0].buffer, files.aadharImage[0].originalname, files.aadharImage[0].mimetype, "private_uploads");
    if (files?.panImage?.[0]) profileData.panImageUrl = await uploadToGCS(files.panImage[0].buffer, files.panImage[0].originalname, files.panImage[0].mimetype, "private_uploads");
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = await uploadToGCS(files.healthCertificate[0].buffer, files.healthCertificate[0].originalname, files.healthCertificate[0].mimetype, "private_uploads");

    const [updated] = await db
      .update(customerProfilesTable)
      .set(profileData)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .returning();
    syncPilgrimsForUser(req.user!.id, updated);
    res.json(updated);
  }
);

router.get(
  "/admin/all",
  requireAuth as any,
  requireAdmin as any,
  async (_req, res) => {
    const profiles = await db
      .select({
        id: customerProfilesTable.id,
        userId: customerProfilesTable.userId,
        name: customerProfilesTable.name,
        phone: customerProfilesTable.phone,
        photoUrl: customerProfilesTable.photoUrl,
        kycStatus: customerProfilesTable.kycStatus,
        passportNumber: customerProfilesTable.passportNumber,
        passportExpiryDate: customerProfilesTable.passportExpiryDate,
        createdAt: customerProfilesTable.createdAt,
        updatedAt: customerProfilesTable.updatedAt,
        userMobile: usersTable.mobile,
        userName: usersTable.name,
      })
      .from(customerProfilesTable)
      .leftJoin(usersTable, eq(customerProfilesTable.userId, usersTable.id))
      .orderBy(desc(customerProfilesTable.createdAt));
    res.json(profiles);
  }
);

router.get(
  "/admin/:id",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const profiles = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.id, req.params.id))
      .limit(1);
    if (!profiles[0]) {
      res.status(404).json({ message: "KYC not found" });
      return;
    }
    const user = await db.select().from(usersTable).where(eq(usersTable.id, profiles[0].userId)).limit(1);
    res.json({ ...profiles[0], user: user[0] || null });
  }
);

router.patch(
  "/admin/:id/status",
  requireAuth as any,
  requireAdmin as any,
  async (req, res) => {
    const { status, adminNotes } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }
    const [updated] = await db
      .update(customerProfilesTable)
      .set({ kycStatus: status, adminNotes: adminNotes || null, updatedAt: new Date() })
      .where(eq(customerProfilesTable.id, req.params.id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "KYC not found" });
      return;
    }
    res.json(updated);
  }
);

router.post(
  "/admin/create",
  requireAuth as any,
  requireAdmin as any,
  kycFields as any,
  async (req: AuthenticatedRequest, res) => {
    const files = (req as any).files as Record<string, Express.Multer.File[]>;
    const body = req.body;

    if (!body.userId) {
      res.status(400).json({ message: "userId is required" });
      return;
    }

    const existing = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, body.userId))
      .limit(1);

    const profileData: any = {
      userId: body.userId,
      name: body.name || null,
      phone: body.phone || null,
      whatsappNumber: body.whatsappNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address || null,
      passportNumber: body.passportNumber || null,
      passportIssueDate: body.passportIssueDate || null,
      passportExpiryDate: body.passportExpiryDate || null,
      passportPlaceOfIssue: body.passportPlaceOfIssue || null,
      bloodGroup: body.bloodGroup || null,
      aadharNumber: body.aadharNumber || null,
      panNumber: body.panNumber || null,
      kycStatus: (body.kycStatus as any) || "pending",
      updatedAt: new Date(),
    };

    if (files?.photo?.[0]) profileData.photoUrl = await uploadToGCS(files.photo[0].buffer, files.photo[0].originalname, files.photo[0].mimetype, "private_uploads");
    if (files?.passportImage?.[0]) profileData.passportImageUrl = await uploadToGCS(files.passportImage[0].buffer, files.passportImage[0].originalname, files.passportImage[0].mimetype, "private_uploads");
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = await uploadToGCS(files.aadharImage[0].buffer, files.aadharImage[0].originalname, files.aadharImage[0].mimetype, "private_uploads");
    if (files?.panImage?.[0]) profileData.panImageUrl = await uploadToGCS(files.panImage[0].buffer, files.panImage[0].originalname, files.panImage[0].mimetype, "private_uploads");
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = await uploadToGCS(files.healthCertificate[0].buffer, files.healthCertificate[0].originalname, files.healthCertificate[0].mimetype, "private_uploads");

    if (existing[0]) {
      const [updated] = await db
        .update(customerProfilesTable)
        .set(profileData)
        .where(eq(customerProfilesTable.userId, body.userId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db
        .insert(customerProfilesTable)
        .values(profileData)
        .returning();
      res.status(201).json(created);
    }
  }
);

export default router;
