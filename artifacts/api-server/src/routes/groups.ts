import { Router } from "express";
import { db, hajjGroupsTable, pilgrimsTable } from "@workspace/db";
import { eq, and, desc, asc, count, max } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

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
    if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) {
      const { default: axios } = await import("axios");
      const resp = await axios.get(photoUrl, { responseType: "arraybuffer", timeout: 5000 });
      return Buffer.from(resp.data);
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
  const { groupName, year, departureDate, returnDate, flightNumber, maktabNumber, hotels, notes } = req.body;
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
  const { groupName, year, departureDate, returnDate, flightNumber, maktabNumber, hotels, notes } = req.body;
  try {
    const [updated] = await db.update(hajjGroupsTable).set({
      groupName, year: Number(year), departureDate, returnDate, flightNumber, maktabNumber,
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
  await db.delete(pilgrimsTable).where(eq(pilgrimsTable.groupId, id));
  await db.delete(hajjGroupsTable).where(eq(hajjGroupsTable.id, id));
  res.json({ message: "Group and all pilgrims deleted" });
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
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType,
    busNumber, seatNumber, relation, coverNumber, medicalCondition,
    salutation, passportIssueDate, passportExpiryDate, passportPlaceOfIssue } = req.body;

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
    roomNumber, roomType, busNumber, seatNumber, relation, coverNumber, medicalCondition,
    salutation: salutation || null,
    passportIssueDate: passportIssueDate || null,
    passportExpiryDate: passportExpiryDate || null,
    passportPlaceOfIssue: passportPlaceOfIssue || null,
  }).returning();
  res.status(201).json(fmtPilgrim(pilgrim));
});

router.put("/:groupId/pilgrims/:pilgrimId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const groupId = String(req.params.groupId);
  const pilgrimId = String(req.params.pilgrimId);
  const { fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType,
    busNumber, seatNumber, relation, coverNumber, medicalCondition, serialNumber,
    salutation, passportIssueDate, passportExpiryDate, passportPlaceOfIssue } = req.body;

  const scope = and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId));

  const [updated] = await db.update(pilgrimsTable).set({
    fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state,
    roomNumber, roomType, busNumber, seatNumber, relation, coverNumber, medicalCondition,
    serialNumber: serialNumber ? Number(serialNumber) : undefined,
    salutation: salutation || null,
    passportIssueDate: passportIssueDate || null,
    passportExpiryDate: passportExpiryDate || null,
    passportPlaceOfIssue: passportPlaceOfIssue || null,
    updatedAt: new Date(),
  }).where(scope).returning();

  if (!updated) { res.status(404).json({ message: "Pilgrim not found in this group" }); return; }
  res.json(fmtPilgrim(updated));
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

router.get("/:groupId/haji-list/pdf", requireAdmin as any, async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, groupId)).limit(1);
    if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
    const group = groups[0];

    const pilgrims = await db.select().from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, groupId))
      .orderBy(asc(pilgrimsTable.serialNumber));

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
        .text(String(p.serialNumber), cx + 1, y + ROW_H / 2 - 6, { width: colWidths[0] - 2, align: "center", lineBreak: false });
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

export default router;
