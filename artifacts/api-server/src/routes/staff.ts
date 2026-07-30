// @ts-nocheck
import { Router } from "express";
import { db, pool, staffTable } from "@workspace/db";
import { eq, desc, like } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import * as XLSX from "xlsx";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WebP files are allowed"));
  },
});

const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ];
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ext === "csv" || ext === "xlsx" || ext === "xls") {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and Excel (.xlsx/.xls) files are allowed"));
    }
  },
});

const router = Router();
// Public endpoint GET /verify (staff ID card lookup) is exempt from RBAC
router.use((req: any, res: any, next: any) => {
  if (req.method === "GET" && req.path === "/verify") return next();
  return (requireModuleAccess("staff") as any)(req, res, next);
});

async function generateStaffId(companyId: string): Promise<string> {
  const isHorizon = companyId === "horizon";
  const prefix = isHorizon ? "HZN" : "ABT";
  const seqName = isHorizon ? "staff_id_seq_hzn" : "staff_id_seq_abt";
  // nextval() is atomic — safe under concurrent creates and bulk imports.
  const result = await pool.query(`SELECT nextval('${seqName}') AS n`);
  const n = Number(result.rows[0].n);
  return `${prefix}-STAFF-${String(n).padStart(3, "0")}`;
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

    auditLog({ req, action: "created", entityTable: "staff", entityId: inserted[0].id, newValue: { staffId: inserted[0].staffId, fullName: inserted[0].fullName, role: inserted[0].role } }).catch(() => {});
    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error("[staff] POST /", err);
    res.status(500).json({ error: "Failed to create staff member" });
  }
});

router.put("/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const [existing] = await db.select().from(staffTable).where(eq(staffTable.id, req.params.id)).limit(1);
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
    auditLog({ req, action: "updated", entityTable: "staff", entityId: req.params.id, oldValue: existing ? { fullName: existing.fullName, role: existing.role, status: existing.status } : null, newValue: { fullName: updated[0].fullName, role: updated[0].role, status: updated[0].status } }).catch(() => {});
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
    auditLog({ req, action: "deleted", entityTable: "staff", entityId: req.params.id, oldValue: results[0] ? { staffId: results[0].staffId, fullName: results[0].fullName } : null }).catch(() => {});
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

// ── Bulk import endpoint ──────────────────────────────────────────────────────
// Accepts CSV or Excel (.xlsx/.xls). Returns { imported, failed, errors[] }.
router.post(
  "/bulk-import",
  requireAdmin,
  uploadSpreadsheet.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Parse the workbook with xlsx
      const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        res.status(400).json({ error: "Spreadsheet has no sheets" });
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      // header: true → array of objects keyed by header row
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) {
        res.status(400).json({ error: "Spreadsheet is empty (no data rows)" });
        return;
      }
      if (rows.length > 500) {
        res.status(400).json({ error: "Too many rows — maximum 500 per import" });
        return;
      }

      // Normalize a header key: lowercase, strip spaces/underscores
      const norm = (s: string) => String(s).toLowerCase().replace(/[\s_-]+/g, "");

      // Build a lookup from normalised column header → actual key in row object
      const headerMap: Record<string, string> = {};
      for (const key of Object.keys(rows[0] || {})) {
        headerMap[norm(key)] = key;
      }
      const col = (row: Record<string, string>, ...aliases: string[]): string => {
        for (const a of aliases) {
          const k = headerMap[norm(a)];
          if (k !== undefined && row[k] !== undefined && row[k] !== "") return String(row[k]).trim();
        }
        return "";
      };

      const VALID_ROLES = ["airport_staff", "catering_staff", "office_staff", "group_guide", "driver", "medical_staff", "group_leader", "tour_leader", "cook"];
      const VALID_BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
      const VALID_STATUSES = ["active", "inactive"];

      const imported: any[] = [];
      const errors: { row: number; name: string; reason: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // 1-based + header row

        const fullName = col(row, "fullName", "full_name", "name", "Full Name", "Name");
        if (!fullName) {
          errors.push({ row: rowNum, name: "(blank)", reason: "Full name is required" });
          continue;
        }

        const rawRole = col(row, "role", "type", "staffType", "staff_type", "Role", "Staff Type");
        // Normalise human-friendly role labels → DB values
        const roleMap: Record<string, string> = {
          airport: "airport_staff",
          airportstaff: "airport_staff",
          catering: "catering_staff",
          cateringstaff: "catering_staff",
          office: "office_staff",
          officestaff: "office_staff",
          groupguide: "group_guide",
          guide: "group_guide",
          driver: "driver",
          medical: "medical_staff",
          medicalstaff: "medical_staff",
          groupleader: "group_leader",
          leader: "group_leader",
          tourleader: "tour_leader",
          tour: "tour_leader",
          cook: "cook",
          chef: "cook",
        };
        const role = rawRole
          ? (VALID_ROLES.includes(rawRole)
              ? rawRole
              : roleMap[norm(rawRole)] || "airport_staff")
          : "airport_staff";

        const aadhaarRaw = col(row, "aadhaarLast4", "aadhaar_last_4", "aadhaar", "Aadhaar Last 4", "Aadhaar");
        const aadhaarLast4 = aadhaarRaw ? aadhaarRaw.replace(/\D/g, "").slice(-4) : null;
        if (aadhaarLast4 && aadhaarLast4.length !== 4) {
          errors.push({ row: rowNum, name: fullName, reason: "Aadhaar last 4 digits must be exactly 4 digits" });
          continue;
        }

        const rawBlood = col(row, "bloodGroup", "blood_group", "blood", "Blood Group", "Blood");
        const bloodGroup = rawBlood ? (VALID_BLOOD.includes(rawBlood.toUpperCase()) ? rawBlood.toUpperCase() : null) : null;

        const rawStatus = col(row, "status", "Status");
        const status = rawStatus
          ? (VALID_STATUSES.includes(rawStatus.toLowerCase()) ? rawStatus.toLowerCase() : "active")
          : "active";

        const companyId = col(row, "companyId", "company_id", "company", "Company") || "alburhan";

        const staffId = await generateStaffId(companyId);

        try {
          const [inserted] = await db.insert(staffTable).values({
            staffId,
            fullName,
            fatherName: col(row, "fatherName", "father_name", "Father Name", "Father") || null,
            designation: col(row, "designation", "Designation") || null,
            department: col(row, "department", "Department") || null,
            role,
            companyId,
            groupId: col(row, "groupId", "group_id", "Group ID") || null,
            employeeCode: col(row, "employeeCode", "employee_code", "Employee Code") || null,
            mobileIndia: col(row, "mobileIndia", "mobile_india", "mobile", "Mobile", "Phone") || null,
            bloodGroup: bloodGroup || null,
            dateOfBirth: col(row, "dateOfBirth", "date_of_birth", "dob", "DOB", "Date of Birth") || null,
            address: col(row, "address", "Address") || null,
            aadhaarLast4: aadhaarLast4 || null,
            emergencyContact: col(row, "emergencyContact", "emergency_contact", "Emergency Contact") || null,
            emergencyMobile: col(row, "emergencyMobile", "emergency_mobile", "Emergency Mobile") || null,
            joiningDate: col(row, "joiningDate", "joining_date", "Joining Date") || null,
            validUpto: col(row, "validUpto", "valid_upto", "Valid Upto", "Expiry") || null,
            notes: col(row, "notes", "Notes") || null,
            status,
          }).returning();
          imported.push({ staffId: inserted.staffId, fullName: inserted.fullName, row: rowNum });
        } catch (insertErr: any) {
          errors.push({ row: rowNum, name: fullName, reason: insertErr?.message || "Database insert failed" });
        }
      }

      auditLog({
        req,
        action: "bulk_imported",
        entityTable: "staff",
        entityId: "bulk",
        newValue: { imported: imported.length, failed: errors.length },
      }).catch(() => {});

      res.json({
        imported: imported.length,
        failed: errors.length,
        rows: imported,
        errors,
      });
    } catch (err: any) {
      console.error("[staff] POST /bulk-import", err);
      res.status(500).json({ error: err?.message || "Bulk import failed" });
    }
  }
);

export default router;
