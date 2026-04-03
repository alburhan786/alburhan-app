import { Router } from "express";
import { db, hajjGroupsTable, pilgrimsTable, hajjRoomsTable } from "@workspace/db";
import { eq, and, desc, asc, count, max } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS, deleteFromGCS } from "../lib/gcsUpload.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";

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
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType, roomHotel, roomId,
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
    roomNumber, roomType, roomHotel: roomHotel || null, roomId: roomId || null,
    busNumber, seatNumber, relation, coverNumber, medicalCondition,
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
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber, roomType, roomHotel, roomId,
    busNumber, seatNumber, relation, coverNumber, medicalCondition, serialNumber,
    salutation, passportIssueDate, passportExpiryDate, passportPlaceOfIssue } = req.body;

  const scope = and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId));

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
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(14)
        .text("AL BURHAN TOURS & TRAVELS", MARGIN, yStart + 5, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
      doc.fill("white").font("Helvetica").fontSize(7.5)
        .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | Tel: +91 9893989786 | WhatsApp: +91 8989701701",
          MARGIN, yStart + 22, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false });
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
              .text(String(p.serialNumber), cx + 1, y + ROW_H / 2 - 5, { width: colWidths[0] - 2, align: "center", lineBreak: false });
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
          .text(String(p.serialNumber), cx + 1, y + ROW_H / 2 - 5, { width: colWidths[0] - 2, align: "center", lineBreak: false });
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

  if (!isFirstPage) doc.addPage({ size: "A5", layout: "portrait", margin: 0 });

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 20;
  let y = M;

  const hotelLabel = HOTEL_LABELS[room.hotel] || room.hotel;
  const roomTypeLabel = ROOM_TYPE_LABELS[room.roomType] || room.roomType;
  const floorLabel = room.floor ? ` · Floor ${room.floor}` : "";

  const HDR_H = 60;
  doc.rect(M, y, W - M * 2, HDR_H).fill(DARK_GREEN);

  const LEFT_W = W - M * 2 - 85;
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(12)
    .text("AL BURHAN TOURS & TRAVELS", M + 6, y + 7, { width: LEFT_W, lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(6.5)
    .text("5/8 Khanka Masjid Complex, Shanwara Road", M + 6, y + 21, { width: LEFT_W, lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(6.5)
    .text("Burhanpur 450331 M.P. | Tel: +91 9893989786", M + 6, y + 31, { width: LEFT_W, lineBreak: false });
  doc.fill("#a8d5c2").font("Helvetica").fontSize(6.5)
    .text(`${hotelLabel}${floorLabel} · ${roomTypeLabel}`, M + 6, y + 44, { width: LEFT_W, lineBreak: false });

  const RN_X = W - M - 82;
  doc.fill("#ffffff").font("Helvetica").fontSize(7)
    .text("ROOM NO.", RN_X, y + 8, { width: 78, align: "center", lineBreak: false });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(32)
    .text(room.roomNumber, RN_X, y + 17, { width: 78, align: "center", lineBreak: false });
  doc.fill("white").font("Helvetica").fontSize(6.5)
    .text(`${roomPilgrims.length} Person${roomPilgrims.length !== 1 ? "s" : ""}`, RN_X, y + 47, { width: 78, align: "center", lineBreak: false });

  y += HDR_H + 6;

  const TABLE_X = M;
  const TABLE_W = W - M * 2;
  const COL_W = [TABLE_W * 0.38, TABLE_W * 0.26, TABLE_W * 0.14, TABLE_W * 0.22];
  const COL_LABELS = ["Name", "Passport No.", "Gender", "Relation"];
  const ROW_H = 18;
  const TBL_HDR_H = 14;

  doc.rect(TABLE_X, y, TABLE_W, TBL_HDR_H).fill("#1a5c44");
  let cx = TABLE_X;
  COL_LABELS.forEach((lbl, i) => {
    doc.fill("white").font("Helvetica-Bold").fontSize(6.5)
      .text(lbl, cx + 2, y + 4, { width: COL_W[i] - 4, align: "center", lineBreak: false });
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
  try {
    const qrData = JSON.stringify({ room: room.roomNumber, hotel: hotelLabel, floor: room.floor || "", group: groupName });
    const qrBuf = await QRCode.toBuffer(qrData, { type: "png", width: 80, margin: 1 });
    const qrSize = 52;
    doc.image(qrBuf, W - M - qrSize, y, { width: qrSize, height: qrSize });
    doc.fill("#aaa").font("Helvetica").fontSize(5.5)
      .text("Scan for room info", W - M - qrSize, y + qrSize + 1, { width: qrSize, align: "center", lineBreak: false });
  } catch {}

  const footerY = H - 14;
  doc.rect(M, footerY - 3, W - M * 2, 13).fill("#f0f7f4");
  const genDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  doc.fill("#555").font("Helvetica").fontSize(6)
    .text(`Al Burhan Tours & Travels · ${groupName} · ${genDate}`, M, footerY, { width: W - M * 2, align: "center", lineBreak: false });
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

    const doc = new PDFDocument({ size: "A5", layout: "portrait", margin: 0, autoFirstPage: true });
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

    const doc = new PDFDocument({ size: "A5", layout: "portrait", margin: 0, autoFirstPage: true });
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
  const scope = and(eq(hajjRoomsTable.id, roomId), eq(hajjRoomsTable.groupId, groupId));
  const rooms = await db.select().from(hajjRoomsTable).where(scope).limit(1);
  if (!rooms[0]) { res.status(404).json({ message: "Room not found" }); return; }
  await db.delete(hajjRoomsTable).where(scope);
  res.json({ message: "Room deleted" });
});

export default router;
