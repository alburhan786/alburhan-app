import { Router } from "express";
import { db, customerProfilesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `kyc_${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const upload = multer({
  storage,
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

function fileUrl(filename: string) {
  return `/api/documents/files/${filename}`;
}

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

    if (files?.photo?.[0]) profileData.photoUrl = fileUrl(files.photo[0].filename);
    if (files?.passportImage?.[0]) profileData.passportImageUrl = fileUrl(files.passportImage[0].filename);
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = fileUrl(files.aadharImage[0].filename);
    if (files?.panImage?.[0]) profileData.panImageUrl = fileUrl(files.panImage[0].filename);
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = fileUrl(files.healthCertificate[0].filename);

    if (existing[0]) {
      const [updated] = await db
        .update(customerProfilesTable)
        .set(profileData)
        .where(eq(customerProfilesTable.userId, req.user!.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db
        .insert(customerProfilesTable)
        .values({ ...profileData, userId: req.user!.id })
        .returning();
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

    if (files?.photo?.[0]) profileData.photoUrl = fileUrl(files.photo[0].filename);
    if (files?.passportImage?.[0]) profileData.passportImageUrl = fileUrl(files.passportImage[0].filename);
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = fileUrl(files.aadharImage[0].filename);
    if (files?.panImage?.[0]) profileData.panImageUrl = fileUrl(files.panImage[0].filename);
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = fileUrl(files.healthCertificate[0].filename);

    const [updated] = await db
      .update(customerProfilesTable)
      .set(profileData)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .returning();
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

    if (files?.photo?.[0]) profileData.photoUrl = fileUrl(files.photo[0].filename);
    if (files?.passportImage?.[0]) profileData.passportImageUrl = fileUrl(files.passportImage[0].filename);
    if (files?.aadharImage?.[0]) profileData.aadharImageUrl = fileUrl(files.aadharImage[0].filename);
    if (files?.panImage?.[0]) profileData.panImageUrl = fileUrl(files.panImage[0].filename);
    if (files?.healthCertificate?.[0]) profileData.healthCertificateUrl = fileUrl(files.healthCertificate[0].filename);

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
