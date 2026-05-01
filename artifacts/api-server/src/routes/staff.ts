import { Router } from "express";
import { db, staffTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WebP files are allowed"));
  },
});

const router = Router();

function generateStaffId(companyId: string, role: string, index: number): string {
  const prefix = companyId === "horizon" ? "HZN" : "ABT";
  const roleTag = role === "catering_staff" ? "CAT" : "AIR";
  const year = new Date().getFullYear();
  return `${prefix}-${roleTag}-${year}-${String(index).padStart(3, "0")}`;
}

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const staff = await db.select().from(staffTable).orderBy(desc(staffTable.createdAt));
    res.json(staff);
  } catch (err) {
    console.error("[staff] GET /", err);
    res.status(500).json({ error: "Failed to fetch staff" });
  }
});

router.get("/verify/:qrToken", async (req, res) => {
  try {
    const { qrToken } = req.params;
    const results = await db.select().from(staffTable).where(eq(staffTable.qrToken, qrToken)).limit(1);
    if (!results.length) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    const s = results[0];
    res.json({
      id: s.id,
      staffId: s.staffId,
      fullName: s.fullName,
      designation: s.designation,
      department: s.department,
      role: s.role,
      companyId: s.companyId,
      bloodGroup: s.bloodGroup,
      validUpto: s.validUpto,
      status: s.status,
      mobileIndia: s.mobileIndia,
      photoUrl: s.photoUrl,
    });
  } catch (err) {
    console.error("[staff] GET /verify/:qrToken", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const results = await db.select().from(staffTable).where(eq(staffTable.id, req.params.id)).limit(1);
    if (!results.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch staff member" });
  }
});

router.post("/", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { fullName, designation, department, role, companyId, employeeCode,
      mobileIndia, bloodGroup, dateOfBirth, address, emergencyContact,
      emergencyMobile, joiningDate, validUpto, notes, status } = req.body;

    if (!fullName) { res.status(400).json({ error: "Full name is required" }); return; }

    const count = await db.select().from(staffTable);
    const nextIndex = count.length + 1;
    const staffId = generateStaffId(companyId || "alburhan", role || "airport_staff", nextIndex);

    const inserted = await db.insert(staffTable).values({
      staffId,
      fullName,
      designation: designation || null,
      department: department || null,
      role: role || "airport_staff",
      companyId: companyId || "alburhan",
      employeeCode: employeeCode || null,
      mobileIndia: mobileIndia || null,
      bloodGroup: bloodGroup || null,
      dateOfBirth: dateOfBirth || null,
      address: address || null,
      emergencyContact: emergencyContact || null,
      emergencyMobile: emergencyMobile || null,
      joiningDate: joiningDate || null,
      validUpto: validUpto || null,
      notes: notes || null,
      status: status || "active",
    }).returning();

    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error("[staff] POST /", err);
    res.status(500).json({ error: "Failed to create staff member" });
  }
});

router.put("/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { fullName, designation, department, role, companyId, employeeCode,
      mobileIndia, bloodGroup, dateOfBirth, address, emergencyContact,
      emergencyMobile, joiningDate, validUpto, notes, status, staffId } = req.body;

    const updated = await db.update(staffTable).set({
      staffId: staffId || undefined,
      fullName,
      designation: designation || null,
      department: department || null,
      role: role || "airport_staff",
      companyId: companyId || "alburhan",
      employeeCode: employeeCode || null,
      mobileIndia: mobileIndia || null,
      bloodGroup: bloodGroup || null,
      dateOfBirth: dateOfBirth || null,
      address: address || null,
      emergencyContact: emergencyContact || null,
      emergencyMobile: emergencyMobile || null,
      joiningDate: joiningDate || null,
      validUpto: validUpto || null,
      notes: notes || null,
      status: status || "active",
      updatedAt: new Date(),
    }).where(eq(staffTable.id, req.params.id)).returning();

    if (!updated.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated[0]);
  } catch (err) {
    console.error("[staff] PUT /:id", err);
    res.status(500).json({ error: "Failed to update staff member" });
  }
});

router.delete("/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const results = await db.select().from(staffTable).where(eq(staffTable.id, req.params.id)).limit(1);
    if (results.length && results[0].photoUrl) {
      await deleteFromGCS(results[0].photoUrl).catch(() => {});
    }
    await db.delete(staffTable).where(eq(staffTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete staff member" });
  }
});

router.post(
  "/:id/photo",
  requireAdmin,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) { res.status(400).json({ message: "No photo provided" }); return; }
      const existing = await db.select().from(staffTable).where(eq(staffTable.id, req.params.id)).limit(1);
      if (!existing.length) { res.status(404).json({ error: "Not found" }); return; }
      if (existing[0].photoUrl) {
        await deleteFromGCS(existing[0].photoUrl).catch(() => {});
      }
      const photoUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "private_uploads");
      await db.update(staffTable).set({ photoUrl, updatedAt: new Date() }).where(eq(staffTable.id, req.params.id));
      res.json({ photoUrl });
    } catch (err) {
      console.error("[staff] POST /:id/photo", err);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  }
);

export default router;
