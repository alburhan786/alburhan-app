import { Router } from "express";
import { db, staffTable } from "@workspace/db";
import { eq, desc, like } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
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
// Public endpoint GET /verify (staff ID card lookup) is exempt from RBAC
router.use((req: any, res: any, next: any) => {
  if (req.method === "GET" && req.path === "/verify") return next();
  return (requireModuleAccess("staff") as any)(req, res, next);
});

async function generateStaffId(companyId: string): Promise<string> {
  const prefix = companyId === "horizon" ? "HZN" : "ABT";
  const pattern = `${prefix}-STAFF-%`;
  const existing = await db
    .select({ staffId: staffTable.staffId })
    .from(staffTable)
    .where(like(staffTable.staffId, pattern))
    .orderBy(desc(staffTable.createdAt));

  let maxNum = 0;
  for (const row of existing) {
    if (row.staffId) {
      const parts = row.staffId.split("-");
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-STAFF-${String(maxNum + 1).padStart(3, "0")}`;
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

router.get("/verify", async (req, res) => {
  try {
    const staffId = (req.query.id as string) || "";
    if (!staffId) {
      res.status(400).json({ error: "Staff ID is required (?id=ABT-STAFF-001)" });
      return;
    }
    const results = await db
      .select()
      .from(staffTable)
      .where(eq(staffTable.staffId, staffId))
      .limit(1);
    if (!results.length) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    const s = results[0];
    res.json({
      staffId: s.staffId,
      fullName: s.fullName,
      role: s.role,
      designation: s.designation,
      validUpto: s.validUpto,
      status: s.status,
      photoUrl: s.photoUrl,
    });
  } catch (err) {
    console.error("[staff] GET /verify", err);
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
    const { fullName, fatherName, designation, department, role, companyId, employeeCode,
      mobileIndia, bloodGroup, dateOfBirth, address, aadhaarLast4, emergencyContact,
      emergencyMobile, joiningDate, validUpto, notes, status, groupId } = req.body;

    if (!fullName) { res.status(400).json({ error: "Full name is required" }); return; }

    const staffId = await generateStaffId(companyId || "alburhan");

    const inserted = await db.insert(staffTable).values({
      staffId,
      fullName,
      fatherName: fatherName || null,
      designation: designation || null,
      department: department || null,
      role: role || "airport_staff",
      companyId: companyId || "alburhan",
      groupId: groupId || null,
      employeeCode: employeeCode || null,
      mobileIndia: mobileIndia || null,
      bloodGroup: bloodGroup || null,
      dateOfBirth: dateOfBirth || null,
      address: address || null,
      aadhaarLast4: aadhaarLast4 || null,
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
    const { fullName, fatherName, designation, department, role, companyId, employeeCode,
      mobileIndia, bloodGroup, dateOfBirth, address, aadhaarLast4, emergencyContact,
      emergencyMobile, joiningDate, validUpto, notes, status, staffId, groupId } = req.body;

    const updated = await db.update(staffTable).set({
      staffId: staffId || undefined,
      fullName,
      fatherName: fatherName || null,
      designation: designation || null,
      department: department || null,
      role: role || "airport_staff",
      companyId: companyId || "alburhan",
      groupId: groupId || null,
      employeeCode: employeeCode || null,
      mobileIndia: mobileIndia || null,
      bloodGroup: bloodGroup || null,
      dateOfBirth: dateOfBirth || null,
      address: address || null,
      aadhaarLast4: aadhaarLast4 || null,
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
      const photoUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "uploads");
      await db.update(staffTable).set({ photoUrl, updatedAt: new Date() }).where(eq(staffTable.id, req.params.id));
      res.json({ photoUrl });
    } catch (err) {
      console.error("[staff] POST /:id/photo", err);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  }
);

export default router;
