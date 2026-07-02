import { Router } from "express";
import { db, hajjGroupsTable, pilgrimsTable, hajjRoomsTable, attendanceLogsTable, attendanceEventsTable } from "@workspace/db";
import { eq, and, ne, desc, asc, count, max, inArray } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendWhatsApp } from "../lib/notifications.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { LOGO_BASE64 } from "../lib/logoData.js";
const LOGO_BUFFER = Buffer.from(LOGO_BASE64, "base64");

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

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

async function getImageBuffer(photoUrl: string): Promise<Buffer | null> {
  try {
    if (photoUrl.startsWith("/api/storage/objects/")) {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) return null;
      const tail = photoUrl.replace("/api/storage/objects/", "");
      const gcsKey = `objects/${tail}`;
      const [fileContents] = await objectStorageClient.bucket(bucketId).file(gcsKey).download();
      return fileContents as Buffer;
    }
    if (photoUrl.startsWith("/api/documents/files/")) {
      const filename = path.basename(photoUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
      return null;
    }
  } catch {}
  return null;
}

function deriveTitle(gender?: string | null): string {
  if (!gender) return "";
  const g = gender.toLowerCase();
  if (g === "female") return "Mrs.";
  if (g === "male") return "Mr.";
  return "";
}

function fmtGroup(g: any) {
  return { ...g, createdAt: g.createdAt?.toISOString?.(), updatedAt: g.updatedAt?.toISOString?.() };
}
function fmtPilgrim(p: any) {
  return { ...p, createdAt: p.createdAt?.toISOString?.(), updatedAt: p.updatedAt?.toISOString?.() };
}

router.get("/", requireAdmin as any, async (_req, res) => {
  const groups = await db.select().from(hajjGroupsTable).orderBy(desc(hajjGroupsTable.createdAt));
  const pilgrimCounts = await db
    .select({ groupId: pilgrimsTable.groupId, count: count() })
    .from(pilgrimsTable)
    .groupBy(pilgrimsTable.groupId);

  const countMap = Object.fromEntries(pilgrimCounts.map(pc => [pc.groupId, Number(pc.count)]));
  res.json(groups.map(g => ({ ...fmtGroup(g), pilgrimCount: countMap[g.id] || 0 })));
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { groupName, year, departureDate, returnDate, flightNumber, maktabNumber, hotels, notes, startingSerialNumber } = req.body;
  if (!groupName || !year) {
    res.status(400).json({ message: "groupName and year are required" });
    return;
  }
  try {
    const [group] = await db.insert(hajjGroupsTable).values({
      groupName,
      year: Number(year),
      departureDate: departureDate || null,
      returnDate: returnDate || null,
      flightNumber: flightNumber || null,
      maktabNumber: maktabNumber || null,
      startingSerialNumber: startingSerialNumber ? Number(startingSerialNumber) : 1,
      hotels: hotels || {},
      notes: notes || null,
    }).returning();
    res.status(201).json(fmtGroup(group));
  } catch (err: any) {
    console.error("[groups] POST / DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to create group" });
  }
});

router.get("/:id", requireAdmin as any, async (req, res) => {
  const id = String(req.params.id);
  const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, id)).limit(1);
  if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
  res.json(fmtGroup(groups[0]));
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const { groupName, year, departureDate, returnDate, flightNumber, maktabNumber, hotels, notes, startingSerialNumber } = req.body;
  try {
    const [updated] = await db.update(hajjGroupsTable).set({
      groupName, year: Number(year), departureDate, returnDate, flightNumber, maktabNumber,
      startingSerialNumber: startingSerialNumber ? Number(startingSerialNumber) : 1,
      hotels: hotels || {}, notes, updatedAt: new Date(),
    }).where(eq(hajjGroupsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ message: "Group not found" }); return; }
    res.json(fmtGroup(updated));
  } catch (err: any) {
    console.error("[groups] PUT /:id DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to update group" });
  }
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  const id = String(req.params.id);
  try {
    await db.delete(pilgrimsTable).where(eq(pilgrimsTable.groupId, id));
    await db.delete(hajjGroupsTable).where(eq(hajjGroupsTable.id, id));
    res.json({ message: "Group and all pilgrims deleted" });
  } catch (err: any) {
    console.error("[groups] DELETE /:id DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to delete group" });
  }
});

router.get("/:groupId/pilgrims", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const pilgrims = await db.select().from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId))
    .orderBy(asc(pilgrimsTable.serialNumber));
  res.json(pilgrims.map(fmtPilgrim));
});

router.post("/:groupId/pilgrims", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const { fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType, roomHotel, roomId,
    busNumber, seatNumber, relation, coverNumber, medicalCondition,
    salutation, passportIssueDate, passportExpiryDate, passportPlaceOfIssue,
    familyId, familyRelation, familyHead } = req.body;

  if (!fullName) { res.status(400).json({ message: "fullName is required" }); return; }

  const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
  if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }

  const [{ maxSerial }] = await db.select({ maxSerial: max(pilgrimsTable.serialNumber) })
    .from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));
  const nextSerial = (maxSerial || 0) + 1;

  const [pilgrim] = await db.insert(pilgrimsTable).values({
    groupId,
    serialNumber: nextSerial,
    fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state,
    roomNumber, roomType, roomHotel: roomHotel || null, roomId: roomId || null,
    busNumber, seatNumber, relation, coverNumber, medicalCondition,
    salutation: salutation || null,
    passportIssueDate: passportIssueDate || null,
    passportExpiryDate: passportExpiryDate || null,
    passportPlaceOfIssue: passportPlaceOfIssue || null,
    familyId: familyId || null,
    familyRelation: familyRelation || null,
    familyHead: familyHead === true || familyHead === "true" ? true : false,
  }).returning();
  res.status(201).json(fmtPilgrim(pilgrim));
});

router.put("/:groupId/pilgrims/:pilgrimId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const pilgrimId = String(req.params.pilgrimId);
  const { fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType, roomHotel, roomId,
    busNumber, seatNumber, relation, coverNumber, medicalCondition, serialNumber,
    salutation, passportIssueDate, passportExpiryDate, passportPlaceOfIssue,
    familyId, familyRelation, familyHead } = req.body;

  const scope = and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId));

  // Enforce single family_head: if setting head=true, clear it from others in same family
  const isSettingHead = familyHead === true || familyHead === "true";
  if (isSettingHead) {
    const resolvedFamilyId = familyId !== undefined ? (familyId || null) : null;
    // Fetch current pilgrim to get existing familyId if not provided
    const [existingRow] = await db.select({ familyId: pilgrimsTable.familyId })
      .from(pilgrimsTable).where(scope).limit(1);
    const activeFamilyId = familyId !== undefined ? (familyId || null) : existingRow?.familyId || null;
    if (activeFamilyId) {
      await db.update(pilgrimsTable)
        .set({ familyHead: false, updatedAt: new Date() })
        .where(and(
          eq(pilgrimsTable.groupId, groupId),
          eq(pilgrimsTable.familyId, activeFamilyId),
          ne(pilgrimsTable.id, pilgrimId)
        ));
    }
    void resolvedFamilyId;
  }

  const [updated] = await db.update(pilgrimsTable).set({
    fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state,
    roomNumber, roomType, roomHotel: roomHotel ?? null, roomId: roomId ?? null,
    busNumber, seatNumber, relation, coverNumber, medicalCondition,
    serialNumber: serialNumber ? Number(serialNumber) : undefined,
    salutation: salutation || null,
    passportIssueDate: passportIssueDate || null,
    passportExpiryDate: passportExpiryDate || null,
    passportPlaceOfIssue: passportPlaceOfIssue || null,
    familyId: familyId !== undefined ? (familyId || null) : undefined,
    familyRelation: familyRelation !== undefined ? (familyRelation || null) : undefined,
    familyHead: familyHead !== undefined ? (familyHead === true || familyHead === "true") : undefined,
    updatedAt: new Date(),
  }).where(scope).returning();

  if (!updated) { res.status(404).json({ message: "Pilgrim not found in this group" }); return; }
  res.json(fmtPilgrim(updated));
});

router.post("/:groupId/pilgrims/generate-barcodes", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const [group] = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!group) { res.status(404).json({ message: "Group not found" }); return; }

    const yy = String(group.year).slice(-2);
    const prefix = `ABT-HJ${yy}`;

    const allPilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    let generated = 0;
    let skipped = 0;

    for (const p of allPilgrims) {
      if (p.barcodeId) { skipped++; continue; }
      const barcodeId = `${prefix}-${String(p.serialNumber).padStart(4, "0")}`;
      await db.update(pilgrimsTable)
        .set({ barcodeId, updatedAt: new Date() })
        .where(eq(pilgrimsTable.id, p.id));
      generated++;
    }

    res.json({ message: `Barcodes generated`, generated, skipped, total: allPilgrims.length });
  } catch (err: any) {
    console.error("[generate-barcodes] Error:", err);
    res.status(500).json({ message: err?.message || "Failed to generate barcodes" });
  }
});

router.delete("/:groupId/pilgrims/:pilgrimId", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const pilgrimId = String(req.params.pilgrimId);
  const scope = and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId));
  const pilgrims = await db.select().from(pilgrimsTable).where(scope);
  if (!pilgrims[0]) { res.status(404).json({ message: "Pilgrim not found in this group" }); return; }
  if (pilgrims[0].photoUrl) {
    await deleteFromGCS(pilgrims[0].photoUrl);
  }
  await db.delete(pilgrimsTable).where(scope);
  res.json({ message: "Pilgrim deleted" });
});

router.post(
  "/:groupId/pilgrims/:pilgrimId/photo",
  requireAdmin as any,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res) => {
    const groupId = String(req.params.groupId);
    const pilgrimId = String(req.params.pilgrimId);
    if (!req.file) { res.status(400).json({ message: "No photo provided" }); return; }
    const photoUrl = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype, "private_uploads");
    const scope = and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId));
    const [updated] = await db.update(pilgrimsTable)
      .set({ photoUrl, updatedAt: new Date() })
      .where(scope)
      .returning();
    if (!updated) { res.status(404).json({ message: "Pilgrim not found in this group" }); return; }
    res.json(fmtPilgrim(updated));
  }
);

const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post("/:groupId/pilgrims/bulk", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const rawBody = req.body;
  const rows: any[] = Array.isArray(rawBody) ? rawBody : Array.isArray(rawBody?.pilgrims) ? rawBody.pilgrims : [];

  const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
  if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }

  const [{ maxSerial }] = await db.select({ maxSerial: max(pilgrimsTable.serialNumber) })
    .from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));
  let nextSerial = (maxSerial || 0) + 1;

  const existingPilgrims = await db
    .select({ passportNumber: pilgrimsTable.passportNumber })
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));
  const existingPassports = new Set<string>(
    existingPilgrims.filter(p => p.passportNumber).map(p => p.passportNumber!.toUpperCase().trim())
  );

  const valid: any[] = [];
  const skippedRows: any[] = [];
  const batchPassports = new Set<string>();

  for (const row of rows) {
    if (!row.fullName?.toString().trim()) {
      skippedRows.push({ ...row, reason: "Missing name" });
      continue;
    }
    const passportKey = row.passportNumber ? row.passportNumber.toString().toUpperCase().trim() : null;
    if (passportKey && existingPassports.has(passportKey)) {
      skippedRows.push({ ...row, reason: "Passport already exists in group" });
      continue;
    }
    if (passportKey && batchPassports.has(passportKey)) {
      skippedRows.push({ ...row, reason: "Duplicate passport in import" });
      continue;
    }
    if (passportKey) {
      existingPassports.add(passportKey);
      batchPassports.add(passportKey);
    }
    valid.push(row);
  }

  if (valid.length === 0) {
    res.json({ created: 0, skipped: skippedRows.length, skippedRows });
    return;
  }

  const inserts = valid.map(r => ({
    groupId,
    serialNumber: nextSerial++,
    fullName: String(r.fullName).trim(),
    salutation: r.salutation || null,
    passportNumber: r.passportNumber ? String(r.passportNumber).trim() : null,
    visaNumber: r.visaNumber ? String(r.visaNumber).trim() : null,
    dateOfBirth: r.dateOfBirth ? String(r.dateOfBirth).trim() : null,
    gender: r.gender ? String(r.gender).trim() : null,
    bloodGroup: r.bloodGroup ? String(r.bloodGroup).trim() : null,
    mobileIndia: r.mobileIndia ? String(r.mobileIndia).trim() : null,
    mobileSaudi: r.mobileSaudi ? String(r.mobileSaudi).trim() : null,
    address: r.address ? String(r.address).trim() : null,
    city: r.city ? String(r.city).trim() : null,
    state: r.state ? String(r.state).trim() : null,
    busNumber: r.busNumber ? String(r.busNumber).trim() : null,
    seatNumber: r.seatNumber ? String(r.seatNumber).trim() : null,
    coverNumber: r.coverNumber ? String(r.coverNumber).trim() : null,
    relation: r.relation ? String(r.relation).trim() : null,
    medicalCondition: r.medicalCondition ? String(r.medicalCondition).trim() : null,
    passportIssueDate: r.passportIssueDate ? String(r.passportIssueDate).trim() : null,
    passportExpiryDate: r.passportExpiryDate ? String(r.passportExpiryDate).trim() : null,
    passportPlaceOfIssue: r.passportPlaceOfIssue ? String(r.passportPlaceOfIssue).trim() : null,
    familyId: r.familyId ? String(r.familyId).trim() : null,
    familyHead: r.familyHead ? String(r.familyHead).trim().toLowerCase() === "yes" : false,
    familyRelation: r.familyRelation ? String(r.familyRelation).trim() : null,
  }));

  try {
    await db.insert(pilgrimsTable).values(inserts);
    res.json({ created: valid.length, skipped: skippedRows.length, skippedRows });
  } catch (err: any) {
    console.error("[groups] bulk pilgrim insert error:", err);
    res.status(500).json({ message: err?.message || "Failed to insert pilgrims" });
  }
});

router.post(
  "/:groupId/pilgrims/bulk-photos",
  requireAdmin as any,
  uploadZip.single("photos"),
  async (req: AuthenticatedRequest, res) => {
    const groupId = String(req.params.groupId);
    if (!req.file) { res.status(400).json({ message: "No ZIP file provided" }); return; }

    const buf = req.file.buffer;
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B || buf[2] !== 0x03 || buf[3] !== 0x04) {
      res.status(400).json({ message: "Uploaded file is not a valid ZIP archive" });
      return;
    }

    const groupExists = await db.select({ id: hajjGroupsTable.id }).from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groupExists[0]) { res.status(404).json({ message: "Group not found" }); return; }

    let AdmZip: any;
    try {
      const mod = await import("adm-zip");
      AdmZip = mod.default ?? mod;
    } catch {
      res.status(500).json({ message: "ZIP processing unavailable" });
      return;
    }

    let zip: any;
    try {
      zip = new AdmZip(buf);
    } catch {
      res.status(400).json({ message: "Could not open ZIP archive — file may be corrupt" });
      return;
    }

    const MAX_ENTRIES = 500;
    const MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;
    const allEntries = zip.getEntries();
    if (allEntries.length > MAX_ENTRIES) {
      res.status(400).json({ message: `ZIP contains too many files (max ${MAX_ENTRIES})` });
      return;
    }
    const totalUncompressed: number = allEntries.reduce((sum: number, e: any) => sum + (e.header?.size ?? 0), 0);
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      res.status(400).json({ message: "ZIP uncompressed content exceeds 300 MB limit" });
      return;
    }

    const groupPilgrims = await db.select({ id: pilgrimsTable.id, passportNumber: pilgrimsTable.passportNumber })
      .from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));
    const passportMap = new Map(
      groupPilgrims
        .filter(p => p.passportNumber)
        .map(p => [p.passportNumber!.trim().toUpperCase(), p.id])
    );

    const entries = zip.getEntries();
    const results: { filename: string; status: "matched" | "unmatched" | "skipped"; passportNumber?: string }[] = [];

    const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const filename = path.basename(entry.entryName);
      const ext = path.extname(filename).toLowerCase();
      if (!imageExts.has(ext)) {
        results.push({ filename, status: "skipped" });
        continue;
      }

      const passportKey = path.basename(filename, ext).toUpperCase();
      const pilgrimId = passportMap.get(passportKey);

      if (!pilgrimId) {
        results.push({ filename, status: "unmatched" });
        continue;
      }

      try {
        const buffer = entry.getData();
        const mimetype = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        const photoUrl = await uploadToGCS(buffer, filename, mimetype, "private_uploads");
        await db.update(pilgrimsTable)
          .set({ photoUrl, updatedAt: new Date() })
          .where(and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId)));
        results.push({ filename, status: "matched", passportNumber: passportKey });
      } catch (err) {
        console.error("[groups] bulk-photos upload error for", filename, err);
        results.push({ filename, status: "unmatched" });
      }
    }

    res.json({
      total: results.length,
      matched: results.filter(r => r.status === "matched").length,
      unmatched: results.filter(r => r.status === "unmatched").length,
      results,
    });
  }
);

router.get("/:groupId/haji-list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const serialOffset = (group.startingSerialNumber ?? 1) - 1;

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="haji-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const MARGIN = 20;
    const USABLE_W = PAGE_W - MARGIN * 2;

    const colWidths = [32, 52, 45, 140, 72, 92, 68, 92, 68];
    const totalTableW = colWidths.reduce((a, b) => a + b, 0);
    const tableX = MARGIN + (USABLE_W - totalTableW) / 2;

    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const LIGHT_ROW = "#f5f7f5";
    const HEADER_H = 22;
    const ROW_H = 52;
    const COL_LABELS = ["S.No.", "Photo", "Title", "Full Name", "Date of Birth", "Passport No.", "Issue Date", "Place of Issue", "Expiry Date"];

    function drawHeader(yStart: number) {
      doc.rect(MARGIN, yStart, PAGE_W - MARGIN * 2, 48).fill(DARK_GREEN);
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(16)
        .text("AL BURHAN TOURS & TRAVELS", MARGIN, yStart + 5, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      doc.fill("white").font("Helvetica").fontSize(8)
        .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | GSTIN: 23AAVFA3223C1ZW | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
          MARGIN, yStart + 24, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      return yStart + 50;
    }

    function drawSubheader(yStart: number) {
      doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(12)
        .text(`HAJI LIST — ${group.groupName.toUpperCase()} (${group.year})`, MARGIN, yStart + 4,
          { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      const infoStr = [
        group.departureDate ? `Departure: ${group.departureDate}` : null,
        group.returnDate ? `Return: ${group.returnDate}` : null,
        group.flightNumber ? `Flight: ${group.flightNumber}` : null,
        group.maktabNumber ? `Maktab: ${group.maktabNumber}` : null,
        `Total Pilgrims: ${pilgrims.length}`,
      ].filter(Boolean).join("   |   ");
      doc.fill("#555").font("Helvetica").fontSize(7.5)
        .text(infoStr, MARGIN, yStart + 18, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      return yStart + 32;
    }

    function drawTableHeader(yStart: number) {
      doc.rect(tableX, yStart, totalTableW, HEADER_H).fill(DARK_GREEN);
      let cx = tableX;
      COL_LABELS.forEach((label, i) => {
        doc.fill("white").font("Helvetica-Bold").fontSize(7)
          .text(label, cx + 2, yStart + 7, { width: colWidths[i] - 4, align: "center", lineBreak: false });
        cx += colWidths[i];
      });
      return yStart + HEADER_H;
    }

    function drawRowBorders(yStart: number) {
      doc.save();
      doc.rect(tableX, yStart, totalTableW, ROW_H).stroke("#c8d8c8");
      let cx = tableX;
      for (let i = 0; i < colWidths.length - 1; i++) {
        cx += colWidths[i];
        doc.moveTo(cx, yStart).lineTo(cx, yStart + ROW_H).stroke("#c8d8c8");
      }
      doc.restore();
    }

    let y = drawHeader(MARGIN);
    y = drawSubheader(y + 4);
    y += 6;
    y = drawTableHeader(y);

    for (let i = 0; i < pilgrims.length; i++) {
      const p = pilgrims[i];

      if (y + ROW_H > doc.page.height - MARGIN - 10) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
        y = drawHeader(MARGIN);
        y = drawSubheader(y + 4);
        y += 6;
        y = drawTableHeader(y);
      }

      if (i % 2 === 0) {
        doc.rect(tableX, y, totalTableW, ROW_H).fill(LIGHT_ROW);
      } else {
        doc.rect(tableX, y, totalTableW, ROW_H).fill("white");
      }

      const imgBuf = p.photoUrl ? await getImageBuffer(p.photoUrl) : null;

      doc.fill("black");
      let cx = tableX;

      doc.font("Helvetica-Bold").fontSize(9)
        .text(String(p.serialNumber + serialOffset), cx + 1, y + ROW_H / 2 - 6, { width: colWidths[0] - 2, align: "center", lineBreak: false });
      cx += colWidths[0];

      if (imgBuf) {
        try {
          doc.image(imgBuf, cx + 3, y + 3, { width: colWidths[1] - 6, height: ROW_H - 6, fit: [colWidths[1] - 6, ROW_H - 6], align: "center", valign: "center" });
        } catch {}
      } else {
        doc.rect(cx + 6, y + 6, colWidths[1] - 12, ROW_H - 12).stroke("#ccc");
        doc.fill("#aaa").font("Helvetica").fontSize(6)
          .text("No Photo", cx + 2, y + ROW_H / 2 - 5, { width: colWidths[1] - 4, align: "center", lineBreak: false });
        doc.fill("black");
      }
      cx += colWidths[1];

      const title = p.salutation || deriveTitle(p.gender);
      doc.font("Helvetica").fontSize(8)
        .text(title, cx + 2, y + ROW_H / 2 - 6, { width: colWidths[2] - 4, align: "center", lineBreak: false });
      cx += colWidths[2];

      doc.font("Helvetica-Bold").fontSize(8.5)
        .text(p.fullName || "", cx + 3, y + 6, { width: colWidths[3] - 6, lineBreak: true });
      cx += colWidths[3];

      doc.font("Helvetica").fontSize(7.5)
        .text(p.dateOfBirth || "—", cx + 2, y + ROW_H / 2 - 6, { width: colWidths[4] - 4, align: "center", lineBreak: false });
      cx += colWidths[4];

      doc.font("Helvetica").fontSize(7.5)
        .text(p.passportNumber || "—", cx + 2, y + ROW_H / 2 - 6, { width: colWidths[5] - 4, align: "center", lineBreak: false });
      cx += colWidths[5];

      doc.font("Helvetica").fontSize(7.5)
        .text(p.passportIssueDate || "—", cx + 2, y + ROW_H / 2 - 6, { width: colWidths[6] - 4, align: "center", lineBreak: false });
      cx += colWidths[6];

      doc.font("Helvetica").fontSize(7.5)
        .text(p.passportPlaceOfIssue || "—", cx + 2, y + ROW_H / 2 - 6, { width: colWidths[7] - 4, align: "center", lineBreak: false });
      cx += colWidths[7];

      doc.font("Helvetica").fontSize(7.5)
        .text(p.passportExpiryDate || "—", cx + 2, y + ROW_H / 2 - 6, { width: colWidths[8] - 4, align: "center", lineBreak: false });

      drawRowBorders(y);
      y += ROW_H;
    }

    if (pilgrims.length === 0) {
      doc.fill("#888").font("Helvetica").fontSize(10)
        .text("No pilgrims registered in this group.", tableX, y + 10, { width: totalTableW, align: "center", lineBreak: false });
    }

    const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    doc.fill("#999").font("Helvetica").fontSize(7)
      .text(`Generated on ${genDate} — Al Burhan Tours & Travels`, MARGIN, doc.page.height - 14,
        { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });

    doc.end();
  } catch (err: any) {
    console.error("[groups] GET /:groupId/haji-list/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate PDF" });
  }
});

function fmtRoom(r: any) {
  return { ...r, createdAt: r.createdAt?.toISOString?.(), updatedAt: r.updatedAt?.toISOString?.() };
}

router.get("/:groupId/rooms", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const rooms = await db.select().from(hajjRoomsTable)
    .where(eq(hajjRoomsTable.groupId, groupId))
    .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

  const pilgrims = await db.select({
    id: pilgrimsTable.id,
    roomNumber: pilgrimsTable.roomNumber,
    roomHotel: pilgrimsTable.roomHotel,
  }).from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));

  const countMap = new Map<string, number>();
  for (const p of pilgrims) {
    if (p.roomNumber && p.roomHotel) {
      const key = `${p.roomNumber}::${p.roomHotel}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }
  }

  const result = rooms.map(r => ({
    ...fmtRoom(r),
    occupiedBeds: countMap.get(`${r.roomNumber}::${r.hotel}`) || 0,
  }));
  res.json(result);
});

const VALID_HOTELS = ["makkah", "madinah", "aziziah"] as const;
const VALID_ROOM_TYPES = ["family", "ladies", "gents"] as const;

router.post("/:groupId/rooms", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const { roomNumber, hotel, totalBeds, roomType, floor, notes } = req.body;
  if (!roomNumber || !hotel || !totalBeds || !roomType) {
    res.status(400).json({ message: "roomNumber, hotel, totalBeds, roomType are required" });
    return;
  }
  if (!VALID_HOTELS.includes(hotel)) {
    res.status(400).json({ message: `hotel must be one of: ${VALID_HOTELS.join(", ")}` });
    return;
  }
  if (!VALID_ROOM_TYPES.includes(roomType)) {
    res.status(400).json({ message: `roomType must be one of: ${VALID_ROOM_TYPES.join(", ")}` });
    return;
  }
  const beds = Number(totalBeds);
  if (!Number.isInteger(beds) || beds < 1 || beds > 20) {
    res.status(400).json({ message: "totalBeds must be a positive integer (max 20)" });
    return;
  }
  try {
    const [room] = await db.insert(hajjRoomsTable).values({
      groupId, roomNumber, hotel, totalBeds: beds, roomType,
      floor: floor || null, notes: notes || null,
    }).returning();
    res.status(201).json({ ...fmtRoom(room), occupiedBeds: 0 });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create room" });
  }
});

router.post("/:groupId/rooms/bulk", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const { rooms } = req.body;
  if (!Array.isArray(rooms) || rooms.length === 0 || rooms.length > 200) {
    res.status(400).json({ message: "rooms must be a non-empty array (max 200 items)" });
    return;
  }
  for (const r of rooms) {
    if (!r.roomNumber || !r.hotel || !r.totalBeds || !r.roomType) {
      res.status(400).json({ message: "Each room requires roomNumber, hotel, totalBeds, roomType" });
      return;
    }
    if (!VALID_HOTELS.includes(r.hotel)) {
      res.status(400).json({ message: `hotel must be one of: ${VALID_HOTELS.join(", ")}` });
      return;
    }
    if (!VALID_ROOM_TYPES.includes(r.roomType)) {
      res.status(400).json({ message: `roomType must be one of: ${VALID_ROOM_TYPES.join(", ")}` });
      return;
    }
    const beds = Number(r.totalBeds);
    if (!Number.isInteger(beds) || beds < 1 || beds > 20) {
      res.status(400).json({ message: "totalBeds must be a positive integer (max 20)" });
      return;
    }
  }
  try {
    const rows = rooms.map((r: { roomNumber: string; hotel: string; totalBeds: number; roomType: string; floor?: string; notes?: string }) => ({
      groupId,
      roomNumber: String(r.roomNumber),
      hotel: r.hotel,
      totalBeds: Number(r.totalBeds),
      roomType: r.roomType,
      floor: r.floor || null,
      notes: r.notes || null,
    }));
    const created = await db.insert(hajjRoomsTable).values(rows).returning();
    res.status(201).json({ created: created.length, rooms: created });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create rooms" });
  }
});

router.post("/:groupId/rooms/auto-allocate", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const rooms = await db.select().from(hajjRoomsTable)
      .where(eq(hajjRoomsTable.groupId, groupId))
      .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const families = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      const key = p.coverNumber ? `cover_${p.coverNumber}` : `solo_${p.id}`;
      if (!families.has(key)) families.set(key, []);
      families.get(key)!.push(p);
    }

    const sortedFamilies = Array.from(families.values()).sort((a, b) => b.length - a.length);
    const roomBeds = new Map<string, number>();
    for (const room of rooms) roomBeds.set(room.id, 0);

    type Assignment = { pilgrimId: string; roomNumber: string; roomHotel: string; roomId: string };
    const assignments: Assignment[] = [];
    let assignedCount = 0;
    let unassignedCount = 0;

    for (const family of sortedFamilies) {
      const females = family.filter(p => p.gender?.toLowerCase() === "female");
      const males = family.filter(p => p.gender?.toLowerCase() === "male");
      const isMixed = females.length > 0 && males.length > 0;
      const allFemale = females.length === family.length;
      const neededBeds = family.length;

      let preferredTypes: string[];
      if (isMixed) preferredTypes = ["family"];
      else if (allFemale) preferredTypes = ["ladies", "family"];
      else preferredTypes = ["gents", "family"];

      let bestRoom: typeof rooms[0] | null = null;
      let bestAvail = Infinity;

      for (const room of rooms) {
        const occupied = roomBeds.get(room.id) || 0;
        const avail = room.totalBeds - occupied;
        if (avail >= neededBeds && preferredTypes.includes(room.roomType || "")) {
          if (avail < bestAvail) { bestAvail = avail; bestRoom = room; }
        }
      }

      if (bestRoom) {
        roomBeds.set(bestRoom.id, (roomBeds.get(bestRoom.id) || 0) + neededBeds);
        for (const p of family) {
          assignments.push({ pilgrimId: p.id, roomNumber: bestRoom!.roomNumber, roomHotel: bestRoom!.hotel, roomId: bestRoom!.id });
        }
        assignedCount += neededBeds;
      } else {
        unassignedCount += neededBeds;
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(pilgrimsTable)
        .set({ roomNumber: null, roomHotel: null, roomId: null, updatedAt: new Date() })
        .where(eq(pilgrimsTable.groupId, groupId));
      for (const a of assignments) {
        await tx.update(pilgrimsTable)
          .set({ roomNumber: a.roomNumber, roomHotel: a.roomHotel, roomId: a.roomId, updatedAt: new Date() })
          .where(eq(pilgrimsTable.id, a.pilgrimId));
      }
    });

    const updatedRooms = await db.select().from(hajjRoomsTable)
      .where(eq(hajjRoomsTable.groupId, groupId))
      .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

    const updatedPilgrims = await db.select({
      id: pilgrimsTable.id,
      roomNumber: pilgrimsTable.roomNumber,
      roomHotel: pilgrimsTable.roomHotel,
    }).from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));

    const countMap2 = new Map<string, number>();
    for (const p of updatedPilgrims) {
      if (p.roomNumber && p.roomHotel) {
        const key = `${p.roomNumber}::${p.roomHotel}`;
        countMap2.set(key, (countMap2.get(key) || 0) + 1);
      }
    }

    res.json({
      assigned: assignedCount,
      unassigned: unassignedCount,
      rooms: updatedRooms.map(r => ({ ...fmtRoom(r), occupiedBeds: countMap2.get(`${r.roomNumber}::${r.hotel}`) || 0 })),
    });
  } catch (err: any) {
    console.error("[groups] auto-allocate error:", err);
    res.status(500).json({ message: err?.message || "Failed to auto-allocate rooms" });
  }
});

router.get("/:groupId/rooms/list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const rooms = await db.select().from(hajjRoomsTable)
      .where(eq(hajjRoomsTable.groupId, groupId))
      .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const serialOffset = (group.startingSerialNumber ?? 1) - 1;

    const pilgrimsByRoom = new Map<string, typeof pilgrims>();
    const unassigned: typeof pilgrims = [];
    for (const p of pilgrims) {
      if (p.roomNumber && p.roomHotel) {
        const key = `${p.roomNumber}::${p.roomHotel}`;
        if (!pilgrimsByRoom.has(key)) pilgrimsByRoom.set(key, []);
        pilgrimsByRoom.get(key)!.push(p);
      } else {
        unassigned.push(p);
      }
    }

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="room-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const MARGIN = 28;
    const USABLE_W = PAGE_W - MARGIN * 2;

    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const LIGHT_ROW = "#f5f7f5";

    const colWidths = [30, 42, 170, 100, 100, 94];
    const totalTableW = colWidths.reduce((a, b) => a + b, 0);
    const tableX = MARGIN + (USABLE_W - totalTableW) / 2;
    const COL_LABELS = ["Sr", "Photo", "Name", "Passport No.", "Relation", "Gender"];
    const ROW_H = 40;
    const HEADER_H = 20;

    let pageNum = 1;

    function drawPageHeader(yStart: number) {
      doc.rect(MARGIN, yStart, PAGE_W - MARGIN * 2, 44).fill(DARK_GREEN);
      doc.image(LOGO_BUFFER, MARGIN + 4, yStart + 2, { width: 40, height: 40 });
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(14)
        .text("AL BURHAN TOURS & TRAVELS", MARGIN + 46, yStart + 5, { width: PAGE_W - MARGIN * 2 - 46, align: "center", lineBreak: false });
      doc.fill("white").font("Helvetica").fontSize(7.5)
        .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
          MARGIN + 46, yStart + 22, { width: PAGE_W - MARGIN * 2 - 46, align: "center", lineBreak: false });
      return yStart + 46;
    }

    function drawSubheader(yStart: number) {
      doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(11)
        .text(`ROOM ALLOCATION LIST — ${group.groupName.toUpperCase()} (${group.year})`, MARGIN, yStart + 4,
          { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      const parts = [
        group.departureDate ? `Departure: ${group.departureDate}` : null,
        group.flightNumber ? `Flight: ${group.flightNumber}` : null,
        group.maktabNumber ? `Maktab: ${group.maktabNumber}` : null,
        `Total Pilgrims: ${pilgrims.length}`,
        `Total Rooms: ${rooms.length}`,
      ].filter(Boolean).join("   |   ");
      doc.fill("#555").font("Helvetica").fontSize(7)
        .text(parts, MARGIN, yStart + 18, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      return yStart + 30;
    }

    function drawTableHeader(yStart: number) {
      doc.rect(tableX, yStart, totalTableW, HEADER_H).fill("#1a5c44");
      let cx = tableX;
      COL_LABELS.forEach((label, i) => {
        doc.fill("white").font("Helvetica-Bold").fontSize(7)
          .text(label, cx + 2, yStart + 6, { width: colWidths[i] - 4, align: "center", lineBreak: false });
        cx += colWidths[i];
      });
      return yStart + HEADER_H;
    }

    function drawPageFooter() {
      const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
      doc.fill("#999").font("Helvetica").fontSize(6.5)
        .text(`Page ${pageNum} — Generated on ${genDate} — Al Burhan Tours & Travels`, MARGIN, PAGE_H - 14,
          { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
    }

    let y = drawPageHeader(MARGIN);
    y = drawSubheader(y + 4);
    y += 8;

    const hotelOrder = ["makkah", "madinah", "aziziah"];
    const hotelLabels: Record<string, string> = { makkah: "MAKKAH", madinah: "MADINAH", aziziah: "AZIZIAH" };
    let roomRowIndex = 0;

    for (const hotel of hotelOrder) {
      const hotelRooms = rooms.filter(r => r.hotel === hotel);
      if (hotelRooms.length === 0) continue;

      if (y + 24 > PAGE_H - MARGIN - 14) {
        drawPageFooter();
        doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
        pageNum++;
        y = drawPageHeader(MARGIN);
        y = drawSubheader(y + 4);
        y += 8;
      }

      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 20).fill("#e8f2ee");
      doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(9)
        .text(`🕌  ${hotelLabels[hotel]} HOTEL ROOMS`, MARGIN + 8, y + 6,
          { width: PAGE_W - MARGIN * 2 - 16, lineBreak: false });
      y += 22;

      for (const room of hotelRooms) {
        const key = `${room.roomNumber}::${room.hotel}`;
        const roomPilgrims = pilgrimsByRoom.get(key) || [];
        const pilgramRows = roomPilgrims.length;
        const roomBlockH = 22 + HEADER_H + Math.max(pilgramRows, 1) * ROW_H + 4;

        if (y + roomBlockH > PAGE_H - MARGIN - 14) {
          drawPageFooter();
          doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
          pageNum++;
          y = drawPageHeader(MARGIN);
          y = drawSubheader(y + 4);
          y += 8;
        }

        const roomTypeLabel = room.roomType === "family" ? "Family Room" : room.roomType === "ladies" ? "Ladies Room" : "Gents Room";
        const floorLabel = room.floor ? ` | Floor ${room.floor}` : "";
        const roomHeaderText = `Room ${room.roomNumber}${floorLabel}  —  ${roomTypeLabel}  |  ${room.totalBeds} Beds Total  |  ${roomPilgrims.length}/${room.totalBeds} Occupied`;

        doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 20).fill(DARK_GREEN);
        doc.fill("white").font("Helvetica-Bold").fontSize(8.5)
          .text(roomHeaderText, MARGIN + 8, y + 6, { width: PAGE_W - MARGIN * 2 - 16, lineBreak: false });
        y += 22;

        y = drawTableHeader(y);

        if (roomPilgrims.length === 0) {
          doc.rect(tableX, y, totalTableW, ROW_H).fill("#fafafa");
          doc.fill("#bbb").font("Helvetica").fontSize(8)
            .text("— No pilgrims assigned to this room —", tableX, y + ROW_H / 2 - 5, { width: totalTableW, align: "center", lineBreak: false });
          y += ROW_H;
        } else {
          for (let i = 0; i < roomPilgrims.length; i++) {
            const p = roomPilgrims[i];
            if (i % 2 === 0) doc.rect(tableX, y, totalTableW, ROW_H).fill(LIGHT_ROW);
            else doc.rect(tableX, y, totalTableW, ROW_H).fill("white");

            const imgBuf = p.photoUrl ? await getImageBuffer(p.photoUrl) : null;

            let cx = tableX;
            doc.fill("black");

            doc.font("Helvetica-Bold").fontSize(8)
              .text(String(p.serialNumber + serialOffset), cx + 1, y + ROW_H / 2 - 5, { width: colWidths[0] - 2, align: "center", lineBreak: false });
            cx += colWidths[0];

            if (imgBuf) {
              try {
                doc.image(imgBuf, cx + 2, y + 2, { width: colWidths[1] - 4, height: ROW_H - 4, fit: [colWidths[1] - 4, ROW_H - 4], align: "center", valign: "center" });
              } catch {}
            } else {
              doc.rect(cx + 4, y + 4, colWidths[1] - 8, ROW_H - 8).stroke("#ddd");
              doc.fill("#bbb").font("Helvetica").fontSize(6)
                .text("No Photo", cx + 2, y + ROW_H / 2 - 4, { width: colWidths[1] - 4, align: "center", lineBreak: false });
              doc.fill("black");
            }
            cx += colWidths[1];

            const displayName = [p.salutation, p.fullName].filter(Boolean).join(" ");
            doc.font("Helvetica-Bold").fontSize(8)
              .text(displayName, cx + 3, y + 4, { width: colWidths[2] - 6, lineBreak: true });
            cx += colWidths[2];

            doc.font("Helvetica").fontSize(7.5)
              .text(p.passportNumber || "—", cx + 2, y + ROW_H / 2 - 5, { width: colWidths[3] - 4, align: "center", lineBreak: false });
            cx += colWidths[3];

            doc.font("Helvetica").fontSize(7.5)
              .text(p.relation || "—", cx + 2, y + ROW_H / 2 - 5, { width: colWidths[4] - 4, align: "center", lineBreak: false });
            cx += colWidths[4];

            doc.font("Helvetica").fontSize(7.5)
              .text(p.gender ? (p.gender.charAt(0).toUpperCase() + p.gender.slice(1)) : "—",
                cx + 2, y + ROW_H / 2 - 5, { width: colWidths[5] - 4, align: "center", lineBreak: false });

            doc.save();
            doc.rect(tableX, y, totalTableW, ROW_H).stroke("#dde5dd");
            let bx = tableX;
            for (let j = 0; j < colWidths.length - 1; j++) {
              bx += colWidths[j];
              doc.moveTo(bx, y).lineTo(bx, y + ROW_H).stroke("#dde5dd");
            }
            doc.restore();

            y += ROW_H;
            roomRowIndex++;
          }
        }
        y += 6;
      }
    }

    if (unassigned.length > 0) {
      if (y + 26 + HEADER_H + unassigned.length * ROW_H > PAGE_H - MARGIN - 14) {
        drawPageFooter();
        doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
        pageNum++;
        y = drawPageHeader(MARGIN);
        y = drawSubheader(y + 4);
        y += 8;
      }
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 20).fill("#c0392b");
      doc.fill("white").font("Helvetica-Bold").fontSize(8.5)
        .text(`UNASSIGNED PILGRIMS (${unassigned.length})`, MARGIN + 8, y + 6, { width: PAGE_W - MARGIN * 2 - 16, lineBreak: false });
      y += 22;
      y = drawTableHeader(y);
      for (let i = 0; i < unassigned.length; i++) {
        const p = unassigned[i];
        if (i % 2 === 0) doc.rect(tableX, y, totalTableW, ROW_H).fill("#fff5f5");
        else doc.rect(tableX, y, totalTableW, ROW_H).fill("white");
        let cx = tableX;
        doc.fill("black").font("Helvetica-Bold").fontSize(8)
          .text(String(p.serialNumber + serialOffset), cx + 1, y + ROW_H / 2 - 5, { width: colWidths[0] - 2, align: "center", lineBreak: false });
        cx += colWidths[0] + colWidths[1];
        doc.font("Helvetica-Bold").fontSize(8)
          .text([p.salutation, p.fullName].filter(Boolean).join(" "), cx + 3, y + 4, { width: colWidths[2] - 6, lineBreak: true });
        cx += colWidths[2];
        doc.font("Helvetica").fontSize(7.5)
          .text(p.passportNumber || "—", cx + 2, y + ROW_H / 2 - 5, { width: colWidths[3] - 4, align: "center", lineBreak: false });
        cx += colWidths[3];
        doc.font("Helvetica").fontSize(7.5)
          .text(p.relation || "—", cx + 2, y + ROW_H / 2 - 5, { width: colWidths[4] - 4, align: "center", lineBreak: false });
        y += ROW_H;
      }
    }

    drawPageFooter();
    doc.end();
  } catch (err: any) {
    console.error("[groups] rooms/list/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate PDF" });
  }
});

async function generateRoomStickerPage(
  doc: InstanceType<typeof PDFDocument>,
  room: { id: string; roomNumber: string; hotel: string; floor?: string | null; roomType: string; notes?: string | null },
  roomPilgrims: { fullName: string; relation?: string | null; gender?: string | null; passportNumber?: string | null; salutation?: string | null }[],
  groupName: string,
  isFirstPage: boolean
) {
  const DARK_GREEN = "#0B3D2E";
  const GOLD = "#C9A23F";
  const HOTEL_LABELS: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };
  const ROOM_TYPE_LABELS: Record<string, string> = { family: "Family Room", ladies: "Ladies Room", gents: "Gents Room" };

  if (!isFirstPage) doc.addPage({ size: [340, 432], margin: 0 });

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 16;
  let y = M;

  const hotelLabel = HOTEL_LABELS[room.hotel] || room.hotel;
  const roomTypeLabel = ROOM_TYPE_LABELS[room.roomType] || room.roomType;
  const floorLabel = room.floor ? ` · Floor ${room.floor}` : "";

  const HDR_H = 54;
  doc.rect(M, y, W - M * 2, HDR_H).fill(DARK_GREEN);

  doc.image(LOGO_BUFFER, M + 2, y + 4, { width: 40, height: 40 });

  const LOGO_OFF = 44;
  const LEFT_W = W - M * 2 - 82 - LOGO_OFF;
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(8)
    .text("AL BURHAN TOURS & TRAVELS", M + 6 + LOGO_OFF, y + 7, { width: LEFT_W, lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(5)
    .text("5/8 Khanka Masjid Complex, Shanwara Road", M + 6 + LOGO_OFF, y + 17, { width: LEFT_W, lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(5)
    .text("Tel: 0547090786 | +91 9893989786", M + 6 + LOGO_OFF, y + 24, { width: LEFT_W, lineBreak: false });
  doc.fill("#a8d5c2").font("Helvetica").fontSize(5)
    .text(`${hotelLabel}${floorLabel} · ${roomTypeLabel}`, M + 6 + LOGO_OFF, y + 44, { width: LEFT_W, lineBreak: false });

  const RN_X = W - M - 80;
  doc.fill("#ffffff").font("Helvetica").fontSize(6)
    .text("ROOM NO.", RN_X, y + 7, { width: 76, align: "center", lineBreak: false });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(26)
    .text(room.roomNumber, RN_X, y + 15, { width: 76, align: "center", lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(6)
    .text(`${roomPilgrims.length} Person${roomPilgrims.length !== 1 ? "s" : ""}`, RN_X, y + 52, { width: 76, align: "center", lineBreak: false });

  y += HDR_H + 5;

  const TABLE_X = M;
  const TABLE_W = W - M * 2;
  const COL_W = [TABLE_W * 0.38, TABLE_W * 0.26, TABLE_W * 0.14, TABLE_W * 0.22];
  const COL_LABELS = ["Name", "Passport No.", "Gender", "Relation"];
  const ROW_H = 16;
  const TBL_HDR_H = 12;

  doc.rect(TABLE_X, y, TABLE_W, TBL_HDR_H).fill("#1a5c44");
  let cx = TABLE_X;
  COL_LABELS.forEach((lbl, i) => {
    doc.fill("white").font("Helvetica-Bold").fontSize(6)
      .text(lbl, cx + 2, y + 3, { width: COL_W[i] - 4, align: "center", lineBreak: false });
    cx += COL_W[i];
  });
  y += TBL_HDR_H;

  for (let i = 0; i < roomPilgrims.length; i++) {
    const p = roomPilgrims[i];
    doc.rect(TABLE_X, y, TABLE_W, ROW_H).fill(i % 2 === 0 ? "#f5faf7" : "white");
    cx = TABLE_X;
    const displayName = [p.salutation, p.fullName].filter(Boolean).join(" ");
    doc.fill("#111").font("Helvetica-Bold").fontSize(7.5)
      .text(displayName, cx + 3, y + 5, { width: COL_W[0] - 6, lineBreak: false });
    cx += COL_W[0];
    doc.fill("#333").font("Helvetica").fontSize(7)
      .text(p.passportNumber || "—", cx + 2, y + 5, { width: COL_W[1] - 4, align: "center", lineBreak: false });
    cx += COL_W[1];
    const genderShort = p.gender ? p.gender.charAt(0).toUpperCase() : "—";
    doc.fill("#444").font("Helvetica").fontSize(7.5)
      .text(genderShort, cx + 2, y + 5, { width: COL_W[2] - 4, align: "center", lineBreak: false });
    cx += COL_W[2];
    doc.fill(DARK_GREEN).font("Helvetica").fontSize(7)
      .text(p.relation || "—", cx + 2, y + 5, { width: COL_W[3] - 4, align: "center", lineBreak: false });
    doc.save();
    doc.rect(TABLE_X, y, TABLE_W, ROW_H).stroke("#c8d8c8");
    doc.restore();
    y += ROW_H;
  }

  if (roomPilgrims.length === 0) {
    doc.rect(TABLE_X, y, TABLE_W, ROW_H).fill("#fafafa");
    doc.fill("#bbb").font("Helvetica").fontSize(8)
      .text("No pilgrims assigned", TABLE_X, y + 5, { width: TABLE_W, align: "center", lineBreak: false });
    y += ROW_H;
  }

  y += 8;
  const qrData = JSON.stringify({ room: room.roomNumber, hotel: hotelLabel, floor: room.floor || "", group: groupName });
  const qrBuf = await QRCode.toBuffer(qrData, { type: "png", width: 64, margin: 1 });
  const qrSize = 44;
  doc.image(qrBuf, W - M - qrSize, y, { width: qrSize, height: qrSize });
  doc.fill("#aaa").font("Helvetica").fontSize(5.5)
    .text("Scan for room info", W - M - qrSize, y + qrSize + 1, { width: qrSize, align: "center", lineBreak: false });

  const footerY = H - 14;
  doc.rect(M, footerY - 3, W - M * 2, 13).fill("#f0f7f4");
  const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  doc.fill("#555").font("Helvetica").fontSize(6)
    .text(`Al Burhan Tours & Travels · ${groupName} · Support: 0547090786 · ${genDate}`, M, footerY, { width: W - M * 2, align: "center", lineBreak: false });
}

router.get("/:groupId/rooms/stickers/bulk-pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const rooms = await db.select().from(hajjRoomsTable)
      .where(eq(hajjRoomsTable.groupId, groupId))
      .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

    const allPilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const pilgrimsByRoomId = new Map<string, typeof allPilgrims>();
    for (const p of allPilgrims) {
      if (p.roomId) {
        if (!pilgrimsByRoomId.has(p.roomId)) pilgrimsByRoomId.set(p.roomId, []);
        pilgrimsByRoomId.get(p.roomId)!.push(p);
      }
    }

    const doc = new PDFDocument({ size: [340, 432], margin: 0, autoFirstPage: true });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="room-stickers-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const hotelOrder = ["makkah", "madinah", "aziziah"];
    const sortedRooms = [...rooms].sort((a, b) => {
      const hi = hotelOrder.indexOf(a.hotel) - hotelOrder.indexOf(b.hotel);
      if (hi !== 0) return hi;
      const na = parseInt(a.roomNumber, 10), nb = parseInt(b.roomNumber, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.roomNumber.localeCompare(b.roomNumber);
    });

    let isFirst = true;
    for (const room of sortedRooms) {
      const roomPilgrims = pilgrimsByRoomId.get(room.id) || [];
      await generateRoomStickerPage(doc, room, roomPilgrims, group.groupName, isFirst);
      isFirst = false;
    }

    if (sortedRooms.length === 0) {
      doc.fill("#888").font("Helvetica").fontSize(12)
        .text("No rooms found for this group.", 40, 40);
    }

    doc.end();
  } catch (err: any) {
    console.error("[groups] bulk stickers PDF error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate bulk stickers PDF" });
  }
});

router.get("/:groupId/rooms/:roomId/sticker", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const roomId = String(req.params.roomId);

    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const roomScope = and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId));
    const roomRows = await db.select().from(hajjRoomsTable).where(roomScope).limit(1);
    if (!roomRows[0]) { res.status(404).json({ message: "Room not found" }); return; }
    const room = roomRows[0];

    const roomPilgrims = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.roomId, roomId)))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const doc = new PDFDocument({ size: [340, 432], margin: 0, autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="room-sticker-${room.roomNumber}-${room.hotel}.pdf"`);
    doc.pipe(res);

    await generateRoomStickerPage(doc, room, roomPilgrims, group.groupName, true);
    doc.end();
  } catch (err: any) {
    console.error("[groups] room sticker PDF error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate sticker PDF" });
  }
});

router.put("/:groupId/rooms/:roomId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const roomId = String(req.params.roomId);
  const { roomNumber, hotel, totalBeds, roomType, floor, notes } = req.body;
  if (hotel && !VALID_HOTELS.includes(hotel)) {
    res.status(400).json({ message: `hotel must be one of: ${VALID_HOTELS.join(", ")}` });
    return;
  }
  if (roomType && !VALID_ROOM_TYPES.includes(roomType)) {
    res.status(400).json({ message: `roomType must be one of: ${VALID_ROOM_TYPES.join(", ")}` });
    return;
  }
  const beds = totalBeds !== undefined ? Number(totalBeds) : undefined;
  if (beds !== undefined && (!Number.isInteger(beds) || beds < 1 || beds > 20)) {
    res.status(400).json({ message: "totalBeds must be a positive integer (max 20)" });
    return;
  }
  try {
    const scope = and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId));
    const [updated] = await db.update(hajjRoomsTable).set({
      roomNumber, hotel, totalBeds: beds, roomType,
      floor: floor || null, notes: notes || null, updatedAt: new Date(),
    }).where(scope).returning();
    if (!updated) { res.status(404).json({ message: "Room not found" }); return; }

    const pilgrims = await db.select({
      id: pilgrimsTable.id, roomNumber: pilgrimsTable.roomNumber, roomHotel: pilgrimsTable.roomHotel,
    }).from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));

    const occupied = pilgrims.filter(p => p.roomNumber === updated.roomNumber && p.roomHotel === updated.hotel).length;
    res.json({ ...fmtRoom(updated), occupiedBeds: occupied });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update room" });
  }
});

router.delete("/:groupId/rooms/:roomId", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const roomId = String(req.params.roomId);
  try {
    const scope = and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId));
    const rooms = await db.select().from(hajjRoomsTable).where(scope).limit(1);
    if (!rooms[0]) { res.status(404).json({ message: "Room not found" }); return; }
    await db.delete(hajjRoomsTable).where(scope);
    res.json({ message: "Room deleted" });
  } catch (err: any) {
    console.error("[groups] DELETE /:groupId/rooms/:roomId DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to delete room" });
  }
});

// ======================== FAMILY ENDPOINTS ========================

// GET /:groupId/families/pdf — family list PDF download
router.get("/:groupId/families/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }
    const families = Array.from(familyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([familyId, members]) => ({
        familyId,
        members,
        head: members.find(m => m.familyHead) || members[0] || null,
      }));

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const MARGIN = 28;
    const USABLE_W = PAGE_W - MARGIN * 2;
    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const LIGHT_ROW = "#f0f7f0";

    // Header
    doc.rect(MARGIN, MARGIN, USABLE_W, 44).fill(DARK_GREEN);
    doc.image(LOGO_BUFFER, MARGIN + 4, MARGIN + 2, { width: 40, height: 40 });
    doc.fill(GOLD).font("Helvetica-Bold").fontSize(14)
      .text("AL BURHAN TOURS & TRAVELS", MARGIN + 46, MARGIN + 5, { width: USABLE_W - 46, align: "center", lineBreak: false });
    doc.fill("white").font("Helvetica").fontSize(7.5)
      .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
        MARGIN + 46, MARGIN + 22, { width: USABLE_W - 46, align: "center", lineBreak: false });

    let y = MARGIN + 48;
    doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(11)
      .text(`FAMILY LIST — ${group.groupName.toUpperCase()} (${group.year})`, MARGIN, y + 4,
        { width: USABLE_W, align: "center", lineBreak: false });
    const meta = [`Total Families: ${families.length}`, `Total Pilgrims: ${pilgrims.length}`].join("   |   ");
    doc.fill("#555").font("Helvetica").fontSize(7)
      .text(meta, MARGIN, y + 18, { width: USABLE_W, align: "center", lineBreak: false });
    y += 32;

    // Table
    const colW = [44, 120, 180, 36, 56, 80, 82];
    const colLabels = ["Fam ID", "Head Name", "Members", "Cnt", "Room", "Hotel", "Mobile"];
    const totalW = colW.reduce((a, b) => a + b, 0);
    const tableX = MARGIN + (USABLE_W - totalW) / 2;

    doc.rect(tableX, y, totalW, 17).fill(DARK_GREEN);
    let cx = tableX;
    colLabels.forEach((lbl, i) => {
      doc.fill("white").font("Helvetica-Bold").fontSize(7.5)
        .text(lbl, cx + 2, y + 5, { width: colW[i] - 4, lineBreak: false });
      cx += colW[i];
    });
    y += 17;

    for (let idx = 0; idx < families.length; idx++) {
      const fam = families[idx];
      const headName = [fam.head?.salutation, fam.head?.fullName].filter(Boolean).join(" ") || fam.familyId;
      const memberNames = fam.members.map(m => m.fullName).join(", ");
      const roomNos = [...new Set(fam.members.filter(m => m.roomNumber).map(m => m.roomNumber!))].join(", ") || "—";
      const hotels = [...new Set(fam.members.filter(m => m.roomHotel).map(m => m.roomHotel!))].join(", ") || "—";
      const mobile = fam.head?.mobileIndia || fam.head?.mobileSaudi || "—";
      const rowData = [fam.familyId, headName, memberNames, String(fam.members.length), roomNos, hotels, mobile];

      const ROW_H = 20;
      if (y + ROW_H > doc.page.height - 28) {
        doc.addPage();
        y = MARGIN;
      }
      if (idx % 2 === 0) doc.rect(tableX, y, totalW, ROW_H).fill(LIGHT_ROW);
      doc.moveTo(tableX, y + ROW_H).lineTo(tableX + totalW, y + ROW_H).strokeColor("#ddd").lineWidth(0.5).stroke();

      cx = tableX;
      rowData.forEach((val, i) => {
        doc.fill("#111").font("Helvetica").fontSize(7)
          .text(val, cx + 2, y + 6, { width: colW[i] - 4, lineBreak: false });
        cx += colW[i];
      });
      y += ROW_H;
    }

    doc.end();
  } catch (err: any) {
    console.error("[groups] families/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate family list PDF" });
  }
});

// GET /:groupId/families/statistics — aggregate stats for the families dashboard
router.get("/:groupId/families/statistics", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const pilgrims = await db.select().from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));
    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }
    const families = Array.from(familyMap.values());
    const totalFamilies = families.length;
    const totalInFamilies = families.reduce((s, f) => s + f.length, 0);
    const avgSize = totalFamilies > 0 ? parseFloat((totalInFamilies / totalFamilies).toFixed(1)) : 0;
    const largestFamily = families.reduce((max, f) => Math.max(max, f.length), 0);
    const withoutRoom = families.filter(f => !f.some(m => m.roomNumber)).length;
    const withoutBus = families.filter(f => !f.some(m => m.busNumber)).length;
    res.json({ totalFamilies, totalPilgrims: totalInFamilies, avgSize, largestFamily, withoutRoom, withoutBus });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch family statistics" });
  }
});

// GET /:groupId/families — list all families (admin)
router.get("/:groupId/families", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    // Get all attendance events for this group
    const events = await db.select().from(attendanceEventsTable)
      .where(eq(attendanceEventsTable.groupId, groupId));
    const totalEvents = events.length;

    // Get attendance counts per pilgrim (how many events each attended)
    const attendanceCounts: Record<string, number> = {};
    if (totalEvents > 0) {
      const logs = await db.select().from(attendanceLogsTable)
        .where(eq(attendanceLogsTable.groupId, groupId));
      for (const log of logs) {
        if (log.status === "present") {
          attendanceCounts[log.pilgrimId] = (attendanceCounts[log.pilgrimId] || 0) + 1;
        }
      }
    }

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }

    const families = Array.from(familyMap.entries()).map(([familyId, members]) => {
      const head = members.find(m => m.familyHead) || members[0];
      const memberAttendance: Record<string, { attended: number; total: number }> = {};
      for (const m of members) {
        memberAttendance[m.id] = { attended: attendanceCounts[m.id] || 0, total: totalEvents };
      }
      return {
        familyId,
        members: members.map(fmtPilgrim),
        head: head ? fmtPilgrim(head) : null,
        roomNumber: head?.roomNumber || null,
        roomHotel: head?.roomHotel || null,
        roomId: head?.roomId || null,
        busNumber: head?.busNumber || null,
        memberAttendance,
      };
    });

    families.sort((a, b) => a.familyId.localeCompare(b.familyId));
    res.json(families);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch families" });
  }
});

// POST /:groupId/families/:familyId/sync-logistics — copy head's room/bus/hotel to all non-head members
router.post("/:groupId/families/:familyId/sync-logistics", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const familyId = String(req.params.familyId);
  try {
    const members = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)));
    if (members.length === 0) { res.status(404).json({ message: "Family not found" }); return; }

    // Always derive logistics from the family head in the DB — never trust client body alone
    const head = members.find(m => m.familyHead);
    if (!head) {
      res.status(400).json({ message: "No family head set — mark a member as head first" });
      return;
    }

    const nonHeads = members.filter(m => !m.familyHead);
    if (nonHeads.length === 0) { res.json({ updated: 0 }); return; }

    // Sync all logistics fields from head to every non-head member
    await db.update(pilgrimsTable)
      .set({
        roomNumber: head.roomNumber ?? null,
        roomId: head.roomId ?? null,
        roomHotel: head.roomHotel ?? null,
        roomType: head.roomType ?? null,
        busNumber: head.busNumber ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(pilgrimsTable.groupId, groupId),
        eq(pilgrimsTable.familyId, familyId),
        eq(pilgrimsTable.familyHead, false),
      ));

    res.json({
      updated: nonHeads.length,
      synced: {
        roomNumber: head.roomNumber,
        busNumber: head.busNumber,
        roomHotel: head.roomHotel,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to sync logistics" });
  }
});

// POST /:groupId/families/merge — move all members of sourceFamily into targetFamily
router.post("/:groupId/families/merge", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const { sourceFamily, targetFamily } = req.body;
  if (!sourceFamily || !targetFamily) {
    res.status(400).json({ message: "sourceFamily and targetFamily required" }); return;
  }
  if (sourceFamily === targetFamily) {
    res.status(400).json({ message: "Source and target cannot be the same family" }); return;
  }
  try {
    const sourceMembers = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, sourceFamily)));
    if (sourceMembers.length === 0) {
      res.status(404).json({ message: "Source family not found or has no members" }); return;
    }
    const targetMembers = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, targetFamily)));
    if (targetMembers.length === 0) {
      res.status(404).json({ message: "Target family not found or has no members" }); return;
    }

    // Move source members into target family; clear their head status
    await db.update(pilgrimsTable)
      .set({ familyId: targetFamily, familyHead: false, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, sourceFamily)));

    // Ensure target family still has a head
    const targetHasHead = targetMembers.some(m => m.familyHead);
    if (!targetHasHead) {
      const firstTarget = [...targetMembers].sort((a, b) => a.serialNumber - b.serialNumber)[0];
      if (firstTarget) {
        await db.update(pilgrimsTable)
          .set({ familyHead: true, updatedAt: new Date() })
          .where(eq(pilgrimsTable.id, firstTarget.id));
      }
    }

    res.json({ success: true, moved: sourceMembers.length, newTotal: targetMembers.length + sourceMembers.length, sourceFamily, targetFamily });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Merge failed" });
  }
});

// POST /:groupId/families/:familyId/split — split selected members into a new auto-generated family
router.post("/:groupId/families/:familyId/split", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const familyId = String(req.params.familyId);
  const { pilgrimIds } = req.body;
  if (!Array.isArray(pilgrimIds) || pilgrimIds.length === 0) {
    res.status(400).json({ message: "pilgrimIds array required" }); return;
  }
  try {
    const familyMembers = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)));
    if (familyMembers.length === 0) {
      res.status(404).json({ message: "Family not found or has no members" }); return;
    }
    if (pilgrimIds.length >= familyMembers.length) {
      res.status(400).json({ message: "Cannot split all members — at least one must remain" }); return;
    }
    const memberIdSet = new Set(familyMembers.map(m => m.id));
    for (const pid of pilgrimIds) {
      if (!memberIdSet.has(pid)) {
        res.status(400).json({ message: `Pilgrim ${pid} does not belong to family ${familyId}` }); return;
      }
    }

    // Generate next available F-number family ID
    const allIds = await db.select({ familyId: pilgrimsTable.familyId })
      .from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId));
    const existingIds = new Set(allIds.map(p => p.familyId).filter(Boolean));
    let num = 1;
    while (existingIds.has(`F${String(num).padStart(3, "0")}`)) num++;
    const newFamilyId = `F${String(num).padStart(3, "0")}`;

    // Move split members to new family (clear head first)
    await db.update(pilgrimsTable)
      .set({ familyId: newFamilyId, familyHead: false, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), inArray(pilgrimsTable.id, pilgrimIds)));

    // First pilgrim in the split list becomes head of new family
    await db.update(pilgrimsTable)
      .set({ familyHead: true, updatedAt: new Date() })
      .where(eq(pilgrimsTable.id, pilgrimIds[0]));

    // If original family head was split out, promote first remaining member
    const originalHead = familyMembers.find(m => m.familyHead);
    if (originalHead && pilgrimIds.includes(originalHead.id)) {
      const remaining = familyMembers.filter(m => !pilgrimIds.includes(m.id))
        .sort((a, b) => a.serialNumber - b.serialNumber);
      if (remaining.length > 0) {
        await db.update(pilgrimsTable)
          .set({ familyHead: true, updatedAt: new Date() })
          .where(eq(pilgrimsTable.id, remaining[0].id));
      }
    }

    res.json({ success: true, newFamilyId, splitCount: pilgrimIds.length });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Split failed" });
  }
});

// POST /:groupId/families/auto-allocate-rooms — sequential room-number assignment based on family size rules
router.post("/:groupId/families/auto-allocate-rooms", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const startRoom = parseInt(String(req.body.startRoom ?? ""), 10);
  if (!startRoom || isNaN(startRoom) || startRoom <= 0) {
    res.status(400).json({ message: "startRoom must be a valid positive number" }); return;
  }
  const prefix = String(req.body.prefix || "");
  const hotel = String(req.body.hotel || ""); // e.g. "makkah", "madinah", "aziziah"
  const force = req.body.force === true || req.body.force === "true";

  const ROOM_TYPE_LABEL: Record<number, string> = { 1: "Single", 2: "Double", 3: "Triple", 4: "Quad", 5: "Quint" };

  try {
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }

    const sortedFamilies = Array.from(familyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    let currentRoom = startRoom;
    const results: { familyId: string; head: string; size: number; rooms: string[]; roomType: string; roomRange: string | null }[] = [];
    let assignedCount = 0;
    let skippedCount = 0;

    for (const [familyId, members] of sortedFamilies) {
      const head = members.find(m => m.familyHead) || members[0];
      // Non-destructive: skip if ANY member already has a room assigned
      if (!force && members.some(m => m.roomNumber)) {
        results.push({ familyId, head: head?.fullName || familyId, size: members.length, rooms: [head?.roomNumber || ""], roomType: "existing", roomRange: null });
        skippedCount += members.length;
        continue;
      }

      const size = members.length;
      const roomsNeeded = size <= 5 ? 1 : Math.ceil(size / 5);
      const roomType = ROOM_TYPE_LABEL[size] || (size >= 6 ? "Multi" : "Single");

      const assignedRooms: string[] = [];
      for (let i = 0; i < roomsNeeded; i++) {
        assignedRooms.push(prefix ? `${prefix}-${currentRoom}` : String(currentRoom));
        currentRoom++;
      }

      // Store first room in roomNumber; for 6+ (multi-room) persist range in roomNotes field
      const primaryRoom = assignedRooms[0];
      const roomRange = assignedRooms.length > 1 ? assignedRooms.join("–") : null;

      const updates: Record<string, any> = {
        roomNumber: primaryRoom,
        roomType,
        ...(roomRange ? { roomNotes: roomRange } : { roomNotes: null }),
        updatedAt: new Date(),
      };
      if (hotel) updates.roomHotel = hotel;

      for (const m of members) {
        await db.update(pilgrimsTable).set(updates).where(eq(pilgrimsTable.id, m.id));
      }

      results.push({ familyId, head: head?.fullName || familyId, size, rooms: assignedRooms, roomType, roomRange });
      assignedCount += size;
    }

    res.json({ assigned: assignedCount, skipped: skippedCount, families: results, nextRoom: currentRoom });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Auto-allocation failed" });
  }
});

// GET /:groupId/families/room-summary — room allocation summary table
router.get("/:groupId/families/room-summary", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const ROOM_TYPE_LABEL: Record<number, string> = { 1: "Single", 2: "Double", 3: "Triple", 4: "Quad", 5: "Quint" };

  try {
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }

    const roomMap = new Map<string, { familyId: string; headName: string; memberCount: number; roomNotes: string | null }[]>();
    for (const [familyId, members] of familyMap.entries()) {
      const head = members.find(m => m.familyHead) || members[0];
      const roomNumber = head?.roomNumber || members.find(m => m.roomNumber)?.roomNumber;
      if (!roomNumber) continue;
      const roomNotes = (head as any)?.roomNotes || members.find(m => (m as any).roomNotes)?.roomNotes || null;
      if (!roomMap.has(roomNumber)) roomMap.set(roomNumber, []);
      roomMap.get(roomNumber)!.push({ familyId, headName: head?.fullName || familyId, memberCount: members.length, roomNotes });
    }

    const rows = Array.from(roomMap.entries())
      .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b))
      .map(([roomNumber, families]) => {
        const total = families.reduce((s, f) => s + f.memberCount, 0);
        const roomNotes = families.find(f => f.roomNotes)?.roomNotes || null;
        return { roomNumber, families, totalMembers: total, roomType: ROOM_TYPE_LABEL[total] || (total >= 6 ? "Multi" : "Single"), roomNotes };
      });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to fetch room summary" });
  }
});

// GET /:groupId/families/room-summary/pdf — printable room allocation sheet for hotel staff
router.get("/:groupId/families/room-summary/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    // Build room-family map (same logic as room-summary GET)
    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }

    const ROOM_TYPE_LABEL: Record<number, string> = { 1: "Single", 2: "Double", 3: "Triple", 4: "Quad", 5: "Quint" };
    const roomMap = new Map<string, { familyId: string; headName: string; memberCount: number; roomHotel: string | null; roomNotes: string | null }[]>();

    for (const [familyId, members] of familyMap.entries()) {
      const head = members.find(m => m.familyHead) || members[0];
      const roomNumber = head?.roomNumber || members.find(m => m.roomNumber)?.roomNumber;
      if (!roomNumber) continue;
      const roomHotel = head?.roomHotel || members.find(m => m.roomHotel)?.roomHotel || null;
      const roomNotes = head?.roomNotes || members.find(m => m.roomNotes)?.roomNotes || null;
      if (!roomMap.has(roomNumber)) roomMap.set(roomNumber, []);
      roomMap.get(roomNumber)!.push({ familyId, headName: head?.fullName || familyId, memberCount: members.length, roomHotel, roomNotes });
    }

    const rows = Array.from(roomMap.entries())
      .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b))
      .map(([roomNumber, families]) => {
        const total = families.reduce((s, f) => s + f.memberCount, 0);
        const roomNotes = families.find(f => f.roomNotes)?.roomNotes || null;
        const roomHotel = families.find(f => f.roomHotel)?.roomHotel || "";
        return { roomNumber, families, totalMembers: total, roomType: ROOM_TYPE_LABEL[total] || (total >= 6 ? "Multi" : "Single"), roomNotes, roomHotel };
      });

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="room-allocation-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const MARGIN = 28;
    const USABLE_W = PAGE_W - MARGIN * 2;
    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const LIGHT_ROW = "#f5f7f5";
    const generatedOn = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Column layout: Sr | Room No. | Room Block | Hotel | Family Head | Members | Type
    const colWidths = [24, 58, 72, 60, 200, 52, 50];
    const COL_LABELS = ["Sr.", "Room No.", "Block/Range", "Hotel", "Family Head", "Members", "Type"];
    const totalTableW = colWidths.reduce((a, b) => a + b, 0);
    const tableX = MARGIN + (USABLE_W - totalTableW) / 2;
    const ROW_H = 18;
    const HEADER_H = 18;

    let pageNum = 1;
    let rowSerial = 0;

    function drawPageHeader(yStart: number) {
      doc.rect(MARGIN, yStart, PAGE_W - MARGIN * 2, 44).fill(DARK_GREEN);
      doc.image(LOGO_BUFFER, MARGIN + 4, yStart + 2, { width: 40, height: 40 });
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(13)
        .text("AL BURHAN TOURS & TRAVELS", MARGIN + 46, yStart + 6, { width: PAGE_W - MARGIN * 2 - 46, align: "center", lineBreak: false });
      doc.fill("white").font("Helvetica").fontSize(7)
        .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
          MARGIN + 46, yStart + 22, { width: PAGE_W - MARGIN * 2 - 46, align: "center", lineBreak: false });
      return yStart + 46;
    }

    function drawSubheader(yStart: number) {
      doc.rect(MARGIN, yStart, PAGE_W - MARGIN * 2, 28).fill("#e8f0ec");
      doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(10)
        .text(`ROOM ALLOCATION SHEET — ${group.groupName.toUpperCase()} (${group.year})`,
          MARGIN, yStart + 5, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      const parts = [
        `Total Rooms: ${rows.length}`,
        `Total Pilgrims: ${pilgrims.length}`,
        `Generated: ${generatedOn}`,
      ].join("   |   ");
      doc.fill("#555").font("Helvetica").fontSize(7)
        .text(parts, MARGIN, yStart + 18, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      return yStart + 30;
    }

    function drawTableHeader(yStart: number) {
      doc.rect(tableX, yStart, totalTableW, HEADER_H).fill("#1a5c44");
      let cx = tableX;
      COL_LABELS.forEach((label, i) => {
        doc.fill("white").font("Helvetica-Bold").fontSize(6.5)
          .text(label, cx + 2, yStart + 5, { width: colWidths[i] - 4, align: i >= 4 ? "left" : "center", lineBreak: false });
        cx += colWidths[i];
      });
      return yStart + HEADER_H;
    }

    function drawPageFooter() {
      doc.fill("#888").font("Helvetica").fontSize(6.5)
        .text(`Page ${pageNum}  |  Al Burhan Tours & Travels — Confidential`,
          MARGIN, PAGE_H - 18, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
    }

    // Start first page
    let y = drawPageHeader(MARGIN);
    y = drawSubheader(y + 4);
    y += 6;
    y = drawTableHeader(y);

    let familySerial = 0;

    for (const row of rows) {
      for (let fi = 0; fi < row.families.length; fi++) {
        const fam = row.families[fi];
        familySerial++;

        // Check page break
        if (y + ROW_H > PAGE_H - 24) {
          drawPageFooter();
          doc.addPage();
          pageNum++;
          y = drawPageHeader(MARGIN);
          y += 4;
          y = drawTableHeader(y);
        }

        const fillColor = familySerial % 2 === 0 ? LIGHT_ROW : "white";
        doc.rect(tableX, y, totalTableW, ROW_H).fill(fillColor);

        // Left border accent for first family in room
        if (fi === 0) {
          doc.rect(tableX, y, 3, ROW_H * row.families.length > PAGE_H - 24 - y ? ROW_H : ROW_H * row.families.length).fill(DARK_GREEN);
        }

        const textY = y + 5;
        let cx = tableX;

        // Sr.
        doc.fill("#555").font("Helvetica").fontSize(6.5)
          .text(String(familySerial), cx + 2, textY, { width: colWidths[0] - 4, align: "center", lineBreak: false });
        cx += colWidths[0];

        // Room No. (only on first family of room)
        if (fi === 0) {
          doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(8)
            .text(row.roomNumber, cx + 2, textY, { width: colWidths[1] - 4, align: "center", lineBreak: false });
        }
        cx += colWidths[1];

        // Block/Range (roomNotes for multi-room, dash otherwise)
        if (fi === 0) {
          doc.fill(row.roomNotes ? "#8B3A00" : "#aaa").font("Helvetica").fontSize(6.5)
            .text(row.roomNotes || "—", cx + 2, textY, { width: colWidths[2] - 4, align: "center", lineBreak: false });
        }
        cx += colWidths[2];

        // Hotel
        if (fi === 0) {
          const hotelLabel = row.roomHotel === "makkah" ? "Makkah" : row.roomHotel === "madinah" ? "Madinah" : row.roomHotel === "aziziah" ? "Aziziah" : row.roomHotel || "—";
          doc.fill("#333").font("Helvetica").fontSize(6.5)
            .text(hotelLabel, cx + 2, textY, { width: colWidths[3] - 4, align: "center", lineBreak: false });
        }
        cx += colWidths[3];

        // Family Head
        doc.fill("#1a1a1a").font("Helvetica").fontSize(7)
          .text(fam.headName, cx + 3, textY, { width: colWidths[4] - 6, align: "left", lineBreak: false });
        cx += colWidths[4];

        // Members count
        doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(7.5)
          .text(String(fam.memberCount), cx + 2, textY, { width: colWidths[5] - 4, align: "center", lineBreak: false });
        cx += colWidths[5];

        // Room Type (only on first family)
        if (fi === 0) {
          doc.fill("#555").font("Helvetica").fontSize(6.5)
            .text(row.roomType, cx + 2, textY, { width: colWidths[6] - 4, align: "center", lineBreak: false });
        }

        // Row bottom border
        doc.moveTo(tableX, y + ROW_H).lineTo(tableX + totalTableW, y + ROW_H)
          .strokeColor("#ddd").lineWidth(0.3).stroke();

        y += ROW_H;
      }

      // Gap between rooms (light separator)
      doc.moveTo(tableX, y).lineTo(tableX + totalTableW, y)
        .strokeColor(DARK_GREEN).lineWidth(0.5).stroke();
    }

    // Summary footer row
    if (y + 20 > PAGE_H - 24) {
      drawPageFooter();
      doc.addPage();
      pageNum++;
      y = drawPageHeader(MARGIN);
      y += 8;
    }
    doc.rect(tableX, y + 4, totalTableW, 16).fill("#e8f0ec");
    doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(7.5)
      .text(`Total: ${rows.length} rooms · ${pilgrims.filter(p => p.roomNumber).length} pilgrims assigned`,
        tableX + 4, y + 8, { width: totalTableW - 8, align: "right", lineBreak: false });

    drawPageFooter();
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/room-summary/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed to generate PDF" });
  }
});

// POST /:groupId/families/:familyId/change-room-number — reassign one family to a new room
router.post("/:groupId/families/:familyId/change-room-number", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const familyId = String(req.params.familyId);
  const newRoomNumber = String(req.body.newRoomNumber || "").trim();
  if (!newRoomNumber) { res.status(400).json({ message: "newRoomNumber is required" }); return; }
  try {
    const members = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)));
    if (!members.length) { res.status(404).json({ message: "Family not found" }); return; }
    await db.update(pilgrimsTable)
      .set({ roomNumber: newRoomNumber, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)));
    res.json({ updated: members.length, familyId, newRoomNumber });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update room number" });
  }
});

// POST /:groupId/families/swap-rooms — swap room numbers between two families
router.post("/:groupId/families/swap-rooms", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const familyAId = String(req.body.familyAId || "").trim();
  const familyBId = String(req.body.familyBId || "").trim();
  if (!familyAId || !familyBId || familyAId === familyBId) {
    res.status(400).json({ message: "Two distinct familyAId and familyBId are required" }); return;
  }
  try {
    const allMembers = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId),
        sql`${pilgrimsTable.familyId} IN (${familyAId}, ${familyBId})`));
    const membersA = allMembers.filter(m => m.familyId === familyAId);
    const membersB = allMembers.filter(m => m.familyId === familyBId);
    if (!membersA.length || !membersB.length) { res.status(404).json({ message: "One or both families not found" }); return; }
    const roomA = membersA.find(m => m.roomNumber)?.roomNumber || null;
    const roomB = membersB.find(m => m.roomNumber)?.roomNumber || null;
    // Swap: A gets B's room, B gets A's room
    await db.update(pilgrimsTable)
      .set({ roomNumber: roomB, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyAId)));
    await db.update(pilgrimsTable)
      .set({ roomNumber: roomA, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyBId)));
    res.json({ swapped: true, familyAId, roomAFrom: roomA, roomATo: roomB, familyBId, roomBFrom: roomB, roomBTo: roomA });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to swap rooms" });
  }
});

// POST /:groupId/families/auto-allocate — family-aware room auto-allocation
router.post("/:groupId/families/auto-allocate", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const rooms = await db.select().from(hajjRoomsTable)
      .where(eq(hajjRoomsTable.groupId, groupId))
      .orderBy(asc(hajjRoomsTable.hotel), asc(hajjRoomsTable.roomNumber));

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    // Group by familyId; pilgrims without one get their own solo group
    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      const key = p.familyId ? `fam_${p.familyId}` : `solo_${p.id}`;
      if (!familyMap.has(key)) familyMap.set(key, []);
      familyMap.get(key)!.push(p);
    }

    const sortedFamilies = Array.from(familyMap.values()).sort((a, b) => b.length - a.length);
    const roomBeds = new Map<string, number>();
    for (const room of rooms) roomBeds.set(room.id, 0);

    type Assignment = { pilgrimId: string; roomNumber: string; roomHotel: string; roomId: string };
    const assignments: Assignment[] = [];
    let assignedCount = 0;
    let unassignedCount = 0;

    for (const family of sortedFamilies) {
      const females = family.filter(p => p.gender?.toLowerCase() === "female");
      const males = family.filter(p => p.gender?.toLowerCase() === "male");
      const isMixed = females.length > 0 && males.length > 0;
      const allFemale = females.length === family.length;
      const neededBeds = family.length;

      let preferredTypes: string[];
      if (isMixed) preferredTypes = ["family"];
      else if (allFemale) preferredTypes = ["ladies", "family"];
      else preferredTypes = ["gents", "family"];

      let bestRoom: typeof rooms[0] | null = null;
      let bestAvail = Infinity;
      for (const room of rooms) {
        const occupied = roomBeds.get(room.id) || 0;
        const avail = room.totalBeds - occupied;
        if (avail >= neededBeds && preferredTypes.includes(room.roomType || "")) {
          if (avail < bestAvail) { bestAvail = avail; bestRoom = room; }
        }
      }

      if (bestRoom) {
        roomBeds.set(bestRoom.id, (roomBeds.get(bestRoom.id) || 0) + neededBeds);
        for (const p of family) {
          assignments.push({ pilgrimId: p.id, roomNumber: bestRoom!.roomNumber, roomHotel: bestRoom!.hotel, roomId: bestRoom!.id });
        }
        assignedCount += neededBeds;
      } else {
        // Large family — overflow into adjacent rooms of same type (room-number proximity ordering)
        let remaining = [...family];
        let lastRoomNum: string | null = null;
        while (remaining.length > 0) {
          const candidates = rooms.filter(r => {
            const avail = r.totalBeds - (roomBeds.get(r.id) || 0);
            return avail > 0 && preferredTypes.includes(r.roomType || "");
          });
          if (candidates.length === 0) { unassignedCount += remaining.length; break; }
          // First overflow: pick largest available; subsequent: pick nearest by room number
          if (lastRoomNum !== null) {
            const lastN = parseInt(lastRoomNum, 10) || 0;
            candidates.sort((a, b) => {
              const dA = Math.abs((parseInt(a.roomNumber, 10) || 0) - lastN);
              const dB = Math.abs((parseInt(b.roomNumber, 10) || 0) - lastN);
              if (dA !== dB) return dA - dB;
              return (b.totalBeds - (roomBeds.get(b.id) || 0)) - (a.totalBeds - (roomBeds.get(a.id) || 0));
            });
          } else {
            candidates.sort((a, b) =>
              (b.totalBeds - (roomBeds.get(b.id) || 0)) - (a.totalBeds - (roomBeds.get(a.id) || 0))
            );
          }
          const bestSplit = candidates[0];
          const avail = bestSplit.totalBeds - (roomBeds.get(bestSplit.id) || 0);
          const toPlace = remaining.splice(0, avail);
          roomBeds.set(bestSplit.id, (roomBeds.get(bestSplit.id) || 0) + toPlace.length);
          lastRoomNum = bestSplit.roomNumber;
          for (const p of toPlace) {
            assignments.push({ pilgrimId: p.id, roomNumber: bestSplit.roomNumber, roomHotel: bestSplit.hotel, roomId: bestSplit.id });
          }
          assignedCount += toPlace.length;
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(pilgrimsTable)
        .set({ roomNumber: null, roomHotel: null, roomId: null, updatedAt: new Date() })
        .where(eq(pilgrimsTable.groupId, groupId));
      for (const a of assignments) {
        await tx.update(pilgrimsTable)
          .set({ roomNumber: a.roomNumber, roomHotel: a.roomHotel, roomId: a.roomId, updatedAt: new Date() })
          .where(eq(pilgrimsTable.id, a.pilgrimId));
      }
    });

    res.json({ assigned: assignedCount, unassigned: unassignedCount });
  } catch (err: any) {
    console.error("[groups] family auto-allocate error:", err);
    res.status(500).json({ message: err?.message || "Failed to auto-allocate rooms by family" });
  }
});

// POST /:groupId/families/:familyId/assign-room — assign all family members to a room
router.post("/:groupId/families/:familyId/assign-room", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const familyId = decodeURIComponent(String(req.params.familyId));
  const { roomId } = req.body;
  try {
    let roomNumber: string | null = null;
    let roomHotel: string | null = null;
    if (roomId) {
      const roomRows = await db.select().from(hajjRoomsTable)
        .where(and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId))).limit(1);
      if (!roomRows[0]) { res.status(404).json({ message: "Room not found" }); return; }
      roomNumber = roomRows[0].roomNumber;
      roomHotel = roomRows[0].hotel;
    }
    await db.update(pilgrimsTable)
      .set({ roomNumber, roomHotel, roomId: roomId || null, updatedAt: new Date() })
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)));
    res.json({ message: "Family assigned to room" });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to assign family to room" });
  }
});

// POST /:groupId/families/auto-detect — analyze pilgrims and suggest family groups
router.post("/:groupId/families/auto-detect", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const suggestions: { id: number; pilgrimIds: string[]; memberNames: string[]; reason: string; suggestedFamilyId: string; existingFamilyId?: string }[] = [];
    const assignedIds = new Set<string>();
    let nextSuggId = 1;

    // 1. Strong match: same mobileIndia (non-empty)
    const mobileMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.mobileIndia?.trim()) continue;
      const key = p.mobileIndia.trim();
      if (!mobileMap.has(key)) mobileMap.set(key, []);
      mobileMap.get(key)!.push(p);
    }
    for (const [, group] of mobileMap) {
      if (group.length < 2) continue;
      const ids = group.map(p => p.id);
      if (ids.every(id => assignedIds.has(id))) continue;
      const existingFamilyIds = [...new Set(group.filter(p => p.familyId).map(p => p.familyId!))];
      suggestions.push({
        id: nextSuggId++,
        pilgrimIds: ids,
        memberNames: group.map(p => p.fullName),
        reason: `Same mobile number (${group[0].mobileIndia})`,
        suggestedFamilyId: existingFamilyIds[0] || `F${String(nextSuggId).padStart(3, "0")}`,
        existingFamilyId: existingFamilyIds[0],
      });
      ids.forEach(id => assignedIds.add(id));
    }

    // 2. Medium match: same non-empty address (exact)
    const addressMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (assignedIds.has(p.id)) continue;
      const addr = (p.address || "").trim().toLowerCase();
      if (!addr || addr.length < 6) continue;
      if (!addressMap.has(addr)) addressMap.set(addr, []);
      addressMap.get(addr)!.push(p);
    }
    for (const [, group] of addressMap) {
      if (group.length < 2) continue;
      const ids = group.map(p => p.id);
      const existingFamilyIds = [...new Set(group.filter(p => p.familyId).map(p => p.familyId!))];
      suggestions.push({
        id: nextSuggId++,
        pilgrimIds: ids,
        memberNames: group.map(p => p.fullName),
        reason: `Same address/city (medium match)`,
        suggestedFamilyId: existingFamilyIds[0] || `F${String(nextSuggId).padStart(3, "0")}`,
        existingFamilyId: existingFamilyIds[0],
      });
      ids.forEach(id => assignedIds.add(id));
    }

    // 3. Suggestion: same surname (last word of fullName)
    const surnameMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (assignedIds.has(p.id)) continue;
      const parts = p.fullName.trim().split(/\s+/);
      const surname = parts[parts.length - 1].toLowerCase();
      if (!surname || surname.length < 3) continue;
      if (!surnameMap.has(surname)) surnameMap.set(surname, []);
      surnameMap.get(surname)!.push(p);
    }
    for (const [, group] of surnameMap) {
      if (group.length < 2) continue;
      const ids = group.map(p => p.id);
      const existingFamilyIds = [...new Set(group.filter(p => p.familyId).map(p => p.familyId!))];
      const parts = group[0].fullName.trim().split(/\s+/);
      const surname = parts[parts.length - 1];
      suggestions.push({
        id: nextSuggId++,
        pilgrimIds: ids,
        memberNames: group.map(p => p.fullName),
        reason: `Same surname "${surname}" (suggestion — review carefully)`,
        suggestedFamilyId: existingFamilyIds[0] || `F${String(nextSuggId).padStart(3, "0")}`,
        existingFamilyId: existingFamilyIds[0],
      });
      ids.forEach(id => assignedIds.add(id));
    }

    res.json({ suggestions, total: pilgrims.length, matched: assignedIds.size });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Auto-detect failed" });
  }
});

// POST /:groupId/families/auto-generate-ids — re-sequence family IDs to F001, F002...
// Uses two-phase rename (oldId -> TEMP_N -> Fxxx) to avoid collision-merging when an oldId
// matches a newId of another family still pending in the same pass.
router.post("/:groupId/families/auto-generate-ids", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  try {
    const pilgrims = await db.select({ id: pilgrimsTable.id, familyId: pilgrimsTable.familyId })
      .from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

    const existingIds = [...new Set(pilgrims.filter(p => p.familyId).map(p => p.familyId!))].sort();
    if (existingIds.length === 0) { res.json({ updated: 0, families: [] }); return; }

    const mapping: { oldId: string; newId: string }[] = [];
    existingIds.forEach((oldId, idx) => {
      const newId = `F${String(idx + 1).padStart(3, "0")}`;
      if (oldId !== newId) mapping.push({ oldId, newId });
    });
    if (mapping.length === 0) {
      res.json({ updated: 0, families: [], totalFamilies: existingIds.length });
      return;
    }

    // Phase 1: rename oldId -> temporary TEMP_<idx> (guarantees no collision with F001…)
    for (let i = 0; i < mapping.length; i++) {
      await db.update(pilgrimsTable)
        .set({ familyId: `TEMP_${i}`, updatedAt: new Date() })
        .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, mapping[i].oldId)));
    }

    // Phase 2: rename TEMP_<idx> -> final newId
    for (let i = 0; i < mapping.length; i++) {
      await db.update(pilgrimsTable)
        .set({ familyId: mapping[i].newId, updatedAt: new Date() })
        .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, `TEMP_${i}`)));
    }

    res.json({ updated: mapping.length, families: mapping, totalFamilies: existingIds.length });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to re-sequence family IDs" });
  }
});

// POST /:groupId/families/apply-suggestions — save accepted suggestions
router.post("/:groupId/families/apply-suggestions", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const { suggestions } = req.body as { suggestions: { pilgrimIds: string[]; familyId: string; familyHeadId?: string }[] };
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    res.status(400).json({ message: "No suggestions provided" }); return;
  }
  try {
    let applied = 0;
    for (const sugg of suggestions) {
      const { pilgrimIds, familyId, familyHeadId } = sugg;
      if (!pilgrimIds?.length || !familyId) continue;
      for (const pid of pilgrimIds) {
        const isHead = pid === familyHeadId;
        await db.update(pilgrimsTable)
          .set({ familyId, familyHead: isHead, updatedAt: new Date() })
          .where(and(eq(pilgrimsTable.id, pid), eq(pilgrimsTable.groupId, groupId)));
      }
      applied++;
    }
    res.json({ applied });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to apply suggestions" });
  }
});

// Helper: shared PDF header for family reports
function drawFamilyPdfHeader(doc: PDFKit.PDFDocument, group: any, title: string, subtitle: string) {
  const PAGE_W = doc.page.width;
  const MARGIN = 28;
  const USABLE_W = PAGE_W - MARGIN * 2;
  const DARK_GREEN = "#0B3D2E";
  const GOLD = "#C9A23F";

  doc.rect(MARGIN, MARGIN, USABLE_W, 44).fill(DARK_GREEN);
  doc.image(LOGO_BUFFER, MARGIN + 4, MARGIN + 2, { width: 40, height: 40 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(14)
    .text("AL BURHAN TOURS & TRAVELS", MARGIN + 46, MARGIN + 5, { width: USABLE_W - 46, align: "center", lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(7.5)
    .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
      MARGIN + 46, MARGIN + 22, { width: USABLE_W - 46, align: "center", lineBreak: false });

  let y = MARGIN + 48;
  doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(11)
    .text(`${title} — ${group.groupName.toUpperCase()} (${group.year})`, MARGIN, y + 4, { width: USABLE_W, align: "center", lineBreak: false });
  doc.fill("#555").font("Helvetica").fontSize(7)
    .text(subtitle, MARGIN, y + 18, { width: USABLE_W, align: "center", lineBreak: false });
  return y + 32;
}

// Helper: draw family block in a sectioned PDF
function drawFamilyBlock(doc: PDFKit.PDFDocument, fam: any, y: number, MARGIN: number, USABLE_W: number) {
  const DARK_GREEN = "#0B3D2E";
  const GOLD = "#C9A23F";
  const PAGE_H = doc.page.height;
  const headName = [fam.head?.salutation, fam.head?.fullName].filter(Boolean).join(" ") || fam.familyId;
  const memberList = fam.members.map((m: any) => `${m.fullName}${m.familyRelation ? ` (${m.familyRelation})` : ""}`).join("  •  ");
  const blockH = 36;
  if (y + blockH > PAGE_H - 28) { doc.addPage(); y = MARGIN; }
  doc.rect(MARGIN, y, USABLE_W, 16).fill(GOLD + "22");
  doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(7.5)
    .text(`${fam.familyId}  —  ${headName}  (${fam.members.length} members)`, MARGIN + 4, y + 4, { width: USABLE_W - 8, lineBreak: false });
  y += 16;
  doc.fill("#333").font("Helvetica").fontSize(7)
    .text(memberList || "—", MARGIN + 4, y + 3, { width: USABLE_W - 8, lineBreak: false });
  const mobile = fam.head?.mobileIndia || fam.head?.mobileSaudi || "";
  if (mobile) doc.fill("#666").font("Helvetica").fontSize(6.5)
    .text(`📞 ${mobile}`, MARGIN + 4, y + 12, { lineBreak: false });
  const room = fam.head?.roomNumber ? `Room ${fam.head.roomNumber}${fam.head.roomHotel ? ` · ${fam.head.roomHotel}` : ""}` : "";
  if (room) doc.fill("#666").font("Helvetica").fontSize(6.5)
    .text(room, MARGIN + USABLE_W - 80, y + 12, { width: 76, align: "right", lineBreak: false });
  y += 22;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + USABLE_W, y).strokeColor("#ddd").lineWidth(0.4).stroke();
  y += 2;
  return y;
}

// GET /:groupId/families/flight-list/pdf — families grouped by flight info
router.get("/:groupId/families/flight-list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const pilgrims = await db.select().from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId)).orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }
    const families = Array.from(familyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([familyId, members]) => ({
      familyId, members, head: members.find(m => m.familyHead) || members[0] || null,
    }));

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-flight-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const MARGIN = 28;
    const USABLE_W = doc.page.width - MARGIN * 2;
    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const flightLabel = group.flightNumber ? `Flight: ${group.flightNumber}` : "Flight details not set";
    const subtitle = `${flightLabel}  |  Departure: ${group.departureDate || "—"}  |  Total Families: ${families.length}  |  Total Pilgrims: ${pilgrims.length}`;

    let y = drawFamilyPdfHeader(doc, group, "FAMILY WISE FLIGHT LIST", subtitle);

    // Section header
    doc.rect(MARGIN, y, USABLE_W, 18).fill(DARK_GREEN);
    doc.fill(GOLD).font("Helvetica-Bold").fontSize(9)
      .text(`✈  ${flightLabel}`, MARGIN + 6, y + 5, { width: USABLE_W - 8, lineBreak: false });
    y += 18;

    for (const fam of families) {
      y = drawFamilyBlock(doc, fam, y, MARGIN, USABLE_W);
    }
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/flight-list/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// GET /:groupId/families/bus-list/pdf — families grouped by bus number
router.get("/:groupId/families/bus-list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const pilgrims = await db.select().from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId)).orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }
    const families = Array.from(familyMap.entries()).map(([familyId, members]) => {
      const head = members.find(m => m.familyHead) || members[0];
      const busNums = members.filter(m => m.busNumber).map(m => m.busNumber!);
      const busNumber = head?.busNumber || (busNums.length > 0 ? busNums[0] : null) || null;
      return { familyId, members, head: head || null, busNumber };
    });

    const busGroups = new Map<string, typeof families>();
    for (const fam of families) {
      const key = fam.busNumber || "Unassigned";
      if (!busGroups.has(key)) busGroups.set(key, []);
      busGroups.get(key)!.push(fam);
    }
    const sortedBusKeys = [...busGroups.keys()].sort((a, b) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-bus-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const MARGIN = 28;
    const USABLE_W = doc.page.width - MARGIN * 2;
    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const subtitle = `Total Families: ${families.length}  |  Total Pilgrims: ${pilgrims.length}  |  Buses: ${sortedBusKeys.filter(k => k !== "Unassigned").length}`;
    let y = drawFamilyPdfHeader(doc, group, "FAMILY WISE BUS LIST", subtitle);

    for (const busKey of sortedBusKeys) {
      const busGroup = busGroups.get(busKey)!;
      if (y + 22 > doc.page.height - 28) { doc.addPage(); y = MARGIN; }
      doc.rect(MARGIN, y, USABLE_W, 18).fill(DARK_GREEN);
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(9)
        .text(`🚌  Bus ${busKey}  (${busGroup.length} famil${busGroup.length === 1 ? "y" : "ies"})`, MARGIN + 6, y + 5, { width: USABLE_W - 8, lineBreak: false });
      y += 18;
      for (const fam of busGroup) {
        y = drawFamilyBlock(doc, fam, y, MARGIN, USABLE_W);
      }
      y += 4;
    }
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/bus-list/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// GET /:groupId/families/hotel-list/pdf — families grouped by hotel
router.get("/:groupId/families/hotel-list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const pilgrims = await db.select().from(pilgrimsTable).where(eq(pilgrimsTable.groupId, groupId)).orderBy(asc(pilgrimsTable.serialNumber));

    const familyMap = new Map<string, typeof pilgrims>();
    for (const p of pilgrims) {
      if (!p.familyId) continue;
      if (!familyMap.has(p.familyId)) familyMap.set(p.familyId, []);
      familyMap.get(p.familyId)!.push(p);
    }
    const HOTEL_LABELS_PDF: Record<string, string> = { makkah: "Makkah Hotel", madinah: "Madinah Hotel", aziziah: "Aziziah Hotel" };
    const HOTEL_ORDER_PDF = ["makkah", "madinah", "aziziah"];

    const families = Array.from(familyMap.entries()).map(([familyId, members]) => {
      const head = members.find(m => m.familyHead) || members[0];
      const hotels = members.filter(m => m.roomHotel).map(m => m.roomHotel!);
      const hotelKey = head?.roomHotel || (hotels.length > 0 ? hotels[0] : null) || "unassigned";
      return { familyId, members, head: head || null, hotelKey };
    });

    const hotelGroups = new Map<string, typeof families>();
    for (const fam of families) {
      if (!hotelGroups.has(fam.hotelKey)) hotelGroups.set(fam.hotelKey, []);
      hotelGroups.get(fam.hotelKey)!.push(fam);
    }
    const sortedHotelKeys = [...hotelGroups.keys()].sort((a, b) => {
      const ia = HOTEL_ORDER_PDF.indexOf(a), ib = HOTEL_ORDER_PDF.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-hotel-list-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);

    const MARGIN = 28;
    const USABLE_W = doc.page.width - MARGIN * 2;
    const DARK_GREEN = "#0B3D2E";
    const GOLD = "#C9A23F";
    const subtitle = `Total Families: ${families.length}  |  Total Pilgrims: ${pilgrims.length}  |  Hotels: ${sortedHotelKeys.filter(k => k !== "unassigned").length}`;
    let y = drawFamilyPdfHeader(doc, group, "HOTEL WISE FAMILY LIST", subtitle);

    for (const hotelKey of sortedHotelKeys) {
      const hotelGroup = hotelGroups.get(hotelKey)!;
      const hotelLabel = HOTEL_LABELS_PDF[hotelKey] || hotelKey.charAt(0).toUpperCase() + hotelKey.slice(1);
      if (y + 22 > doc.page.height - 28) { doc.addPage(); y = MARGIN; }
      doc.rect(MARGIN, y, USABLE_W, 18).fill(DARK_GREEN);
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(9)
        .text(`🏨  ${hotelLabel}  (${hotelGroup.length} famil${hotelGroup.length === 1 ? "y" : "ies"})`, MARGIN + 6, y + 5, { width: USABLE_W - 8, lineBreak: false });
      y += 18;
      for (const fam of hotelGroup) {
        y = drawFamilyBlock(doc, fam, y, MARGIN, USABLE_W);
      }
      y += 4;
    }
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/hotel-list/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// Helper: draw a single family luggage-tag badge at (bx, by, bw, bh)
function drawFamilyBadge(doc: any, p: any, group: any, bx: number, by: number, bw: number, bh: number) {
  const DARK = "#0B3D2E";
  const GOLD = "#C9A23F";
  const HOTEL_L: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };

  // Background + border
  doc.rect(bx + 1, by + 1, bw - 2, bh - 2).fill("#FFFEF8");
  doc.rect(bx, by, bw, bh).strokeColor(GOLD).lineWidth(1).stroke();

  // Header bar
  const HDR_H = 26;
  doc.rect(bx, by, bw, HDR_H).fill(DARK);
  try { doc.image(LOGO_BUFFER, bx + 4, by + 7, { width: 12, height: 12 }); } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(12)
    .text(p.familyId || "—", bx + 18, by + 7, { width: 56, lineBreak: false });
  const role = p.familyHead ? "HEAD" : (p.familyRelation || p.relation || "Member").toUpperCase().slice(0, 12);
  doc.fill("#C9A23F").font("Helvetica").fontSize(7)
    .text(role, bx + 78, by + 10, { lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(6.5)
    .text(`${group.groupName}  ${group.year}`, bx + bw - 130, by + 9, { width: 126, align: "right", lineBreak: false });

  // Photo box
  const PHOTO_SZ = 54;
  const PX = bx + 7;
  const PY = by + HDR_H + 8;
  doc.rect(PX, PY, PHOTO_SZ, PHOTO_SZ).fill("#E8E8E8").strokeColor(GOLD).lineWidth(0.8).stroke();
  const glyph = p.gender?.toLowerCase() === "female" ? "F" : "M";
  doc.fill("#AAA").font("Helvetica-Bold").fontSize(18)
    .text(glyph, PX, PY + 14, { width: PHOTO_SZ, align: "center", lineBreak: false });
  // Serial under photo
  doc.fill(DARK).font("Helvetica-Bold").fontSize(8)
    .text(`#${String(p.serialNumber).padStart(3, "0")}`, PX, PY + PHOTO_SZ + 4, { width: PHOTO_SZ, align: "center", lineBreak: false });

  // Content area
  const CX = PX + PHOTO_SZ + 8;
  const CW = bx + bw - CX - 7;
  let cy = PY;

  // Name
  const name = [p.salutation, p.fullName].filter(Boolean).join(" ");
  doc.fill(DARK).font("Helvetica-Bold").fontSize(9)
    .text(name, CX, cy, { width: CW, lineBreak: false });
  cy += 13;

  // Role pill
  const pillW = Math.min(CW, 70);
  const pillBg = p.familyHead ? GOLD : "#D4EDDA";
  const pillFg = p.familyHead ? DARK : "#155724";
  doc.rect(CX, cy, pillW, 11).fill(pillBg);
  doc.fill(pillFg).font("Helvetica-Bold").fontSize(6.5)
    .text((p.familyHead ? "★ HEAD" : (p.familyRelation || p.relation || "MEMBER")).toUpperCase(), CX + 2, cy + 2, { width: pillW - 4, align: "center", lineBreak: false });
  cy += 14;

  // Passport
  if (p.passportNumber) {
    doc.fill("#555").font("Helvetica").fontSize(7.5)
      .text("Passport  ", CX, cy, { continued: true, lineBreak: false });
    doc.fill(DARK).font("Helvetica-Bold").text(p.passportNumber, { lineBreak: false });
    cy += 11;
  }

  // Room + Hotel
  if (p.roomNumber) {
    const hotel = p.roomHotel ? (HOTEL_L[p.roomHotel] || p.roomHotel) : "";
    doc.fill("#555").font("Helvetica").fontSize(7.5)
      .text("Room  ", CX, cy, { continued: true, lineBreak: false });
    doc.fill(DARK).font("Helvetica-Bold").text(`${p.roomNumber}${hotel ? `  (${hotel})` : ""}`, { lineBreak: false });
    cy += 11;
  }

  // Bus
  if (p.busNumber) {
    doc.fill("#555").font("Helvetica").fontSize(7.5)
      .text("Bus  ", CX, cy, { continued: true, lineBreak: false });
    doc.fill(DARK).font("Helvetica-Bold").text(p.busNumber, { lineBreak: false });
    cy += 11;
  }

  // Flight
  if (group.flightNumber) {
    doc.fill("#555").font("Helvetica").fontSize(7.5)
      .text("Flight  ", CX, cy, { continued: true, lineBreak: false });
    doc.fill(DARK).font("Helvetica-Bold").text(group.flightNumber, { lineBreak: false });
    cy += 11;
  }

  // Mobile
  if (p.mobileIndia) {
    doc.fill("#666").font("Helvetica").fontSize(7)
      .text(`Mob: ${p.mobileIndia}`, CX, cy, { width: CW, lineBreak: false });
  }

  // Footer bar
  const FY = by + bh - 15;
  doc.rect(bx, FY, bw, 15).fill(GOLD + "44");
  doc.moveTo(bx, FY).lineTo(bx + bw, FY).strokeColor(GOLD).lineWidth(0.5).stroke();
  doc.fill(DARK).font("Helvetica-Bold").fontSize(6.5)
    .text("AL BURHAN TOURS & TRAVELS  |  HAJJ " + group.year, bx + 4, FY + 4, { width: bw - 8, align: "center", lineBreak: false });
}

// Helper: layout a list of pilgrims as 2-col x 3-row badges on A4 pages
function layoutBadgeGrid(doc: any, pilgrims: any[], group: any) {
  const COLS = 2, ROWS = 3, MARGIN = 18, GAP = 8;
  const BW = (doc.page.width - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
  const BH = (doc.page.height - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS;
  pilgrims.forEach((p, idx) => {
    if (idx > 0 && idx % (COLS * ROWS) === 0) doc.addPage();
    const pos = idx % (COLS * ROWS);
    const col = pos % COLS;
    const row = Math.floor(pos / COLS);
    const bx = MARGIN + col * (BW + GAP);
    const by = MARGIN + row * (BH + GAP);
    drawFamilyBadge(doc, p, group, bx, by, BW, BH);
  });
}

// GET /:groupId/families/badges/pdf — family ID badges for all grouped pilgrims
router.get("/:groupId/families/badges/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const allPilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.familyId), asc(pilgrimsTable.serialNumber));
    const pilgrims = allPilgrims.filter(p => p.familyId);
    if (!pilgrims.length) { res.status(404).json({ message: "No grouped pilgrims found" }); return; }
    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-badges-all-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);
    layoutBadgeGrid(doc, pilgrims, group);
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/badges/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// GET /:groupId/families/:familyId/badges/pdf — badges for a single family
router.get("/:groupId/families/:familyId/badges/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const familyId = decodeURIComponent(String(req.params.familyId));
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)))
      .orderBy(desc(pilgrimsTable.familyHead), asc(pilgrimsTable.serialNumber));
    if (!pilgrims.length) { res.status(404).json({ message: "Family not found" }); return; }
    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
    const safeName = `${familyId}-${group.groupName.replace(/[^a-zA-Z0-9]/g, "-")}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="family-badges-${safeName}-${group.year}.pdf"`);
    doc.pipe(res);
    layoutBadgeGrid(doc, pilgrims, group);
    doc.end();
  } catch (err: any) {
    console.error("[groups] families/:familyId/badges/pdf error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// POST /:groupId/families/:familyId/whatsapp — send WhatsApp to family head
router.post("/:groupId/families/:familyId/whatsapp", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const familyId = decodeURIComponent(String(req.params.familyId));
  const { message: customMessage } = req.body || {};
  try {
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const members = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)))
      .orderBy(desc(pilgrimsTable.familyHead), asc(pilgrimsTable.serialNumber));
    if (!members.length) { res.status(404).json({ message: "Family not found" }); return; }

    const head = members.find(m => m.familyHead) || members[0];
    const mobile = head.mobileIndia || "";
    if (!mobile) { res.status(400).json({ message: "Family head has no mobile number" }); return; }

    // Build message if not provided
    const HOTEL_LABELS: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };
    const memberLines = members.map(m =>
      `  • ${m.fullName}${m.familyRelation ? ` (${m.familyRelation})` : ""}${m.roomNumber ? ` — Rm ${m.roomNumber}` : ""}`
    ).join("\n");
    const message = customMessage || [
      "🕌 *Al Burhan Tours & Travels*",
      "",
      `Assalamu Alaikum, *${head.fullName}*! 🌙`,
      "",
      "Here are your family travel details:",
      "",
      `📋 *Family ID:* ${familyId}`,
      `👨‍👩‍👧‍👦 *Members (${members.length}):*`,
      memberLines,
      "",
      head.roomNumber ? `🏨 *Room:* ${head.roomNumber}${head.roomHotel ? ` — ${HOTEL_LABELS[head.roomHotel] || head.roomHotel}` : ""}` : null,
      group.flightNumber ? `✈️ *Flight:* ${group.flightNumber}` : null,
      head.busNumber ? `🚌 *Bus:* ${head.busNumber}` : null,
      "",
      "May Allah accept your Hajj and grant you a blessed journey. 🤲",
      "",
      "— Al Burhan Tours & Travels",
    ].filter(Boolean).join("\n");

    const cleanPhone = mobile.replace(/\D/g, "");
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    const sent = await sendWhatsApp(mobile, message);
    res.json({ sent, waLink, mobile });
  } catch (err: any) {
    console.error("[groups] family whatsapp error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// GET /:groupId/families/export.xlsx — Excel export with one row per pilgrim grouped by family
router.get("/:groupId/families/export.xlsx", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];
    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.familyId), asc(pilgrimsTable.serialNumber));

    const HOTEL_LABELS: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };
    const flightNo = group.flightNumber || "";

    const headers = ["Family ID", "Family Head", "Full Name", "Relation", "Gender", "Passport No", "Mobile India", "Room No", "Flight No", "Bus No", "Hotel"];
    const rows: (string | number)[][] = pilgrims.map(p => [
      p.familyId || "",
      p.familyHead ? "Yes" : "No",
      p.fullName || "",
      p.familyRelation || p.relation || "",
      p.gender || "",
      p.passportNumber || "",
      p.mobileIndia || "",
      p.roomNumber || "",
      flightNo,
      p.busNumber || "",
      p.roomHotel ? (HOTEL_LABELS[p.roomHotel] || p.roomHotel) : "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((_, i) => ({ wch: i === 2 ? 30 : i === 0 ? 10 : 16 }));

    // Style header row
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[cellRef]) continue;
      ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "0B3D2E" } }, fontColor: { rgb: "FFFFFF" } };
    }

    const wb = XLSX.utils.book_new();
    const safeName = group.groupName.replace(/[^a-zA-Z0-9]/g, "-");
    XLSX.utils.book_append_sheet(wb, ws, "Families");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="family-list-${safeName}-${group.year}.xlsx"`);
    res.send(buf);
  } catch (err: any) {
    console.error("[groups] families/export.xlsx error:", err);
    if (!res.headersSent) res.status(500).json({ message: err?.message || "Failed" });
  }
});

// POST-based workaround for environments where Nginx blocks DELETE method
router.post("/:groupId/rooms/:roomId/delete", requireAdmin as any, async (req, res) => {
  const groupId = String(req.params.groupId);
  const roomId = String(req.params.roomId);
  try {
    const scope = and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId));
    const rooms = await db.select().from(hajjRoomsTable).where(scope).limit(1);
    if (!rooms[0]) { res.status(404).json({ message: "Room not found" }); return; }
    await db.delete(hajjRoomsTable).where(scope);
    res.json({ message: "Room deleted" });
  } catch (err: any) {
    console.error("[groups] POST /:groupId/rooms/:roomId/delete DB error:", err);
    res.status(500).json({ message: err?.message || "Failed to delete room" });
  }
});

export default router;
