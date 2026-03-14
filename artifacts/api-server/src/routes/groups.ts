import { Router } from "express";
import { db, hajjGroupsTable, pilgrimsTable } from "@workspace/db";
import { eq, desc, asc, count, max } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../../../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    cb(null, `pilgrim_${unique}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WebP files are allowed"));
  },
});

const router = Router();

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
});

router.get("/:id", requireAdmin as any, async (req, res) => {
  const groups = await db.select().from(hajjGroupsTable).where(eq(hajjGroupsTable.id, req.params.id)).limit(1);
  if (!groups[0]) { res.status(404).json({ message: "Group not found" }); return; }
  res.json(fmtGroup(groups[0]));
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { groupName, year, departureDate, returnDate, flightNumber, maktabNumber, hotels, notes } = req.body;
  const [updated] = await db.update(hajjGroupsTable).set({
    groupName, year: Number(year), departureDate, returnDate, flightNumber, maktabNumber,
    hotels: hotels || {}, notes, updatedAt: new Date(),
  }).where(eq(hajjGroupsTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ message: "Group not found" }); return; }
  res.json(fmtGroup(updated));
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  await db.delete(pilgrimsTable).where(eq(pilgrimsTable.groupId, req.params.id));
  await db.delete(hajjGroupsTable).where(eq(hajjGroupsTable.id, req.params.id));
  res.json({ message: "Group and all pilgrims deleted" });
});

router.get("/:groupId/pilgrims", requireAdmin as any, async (req, res) => {
  const pilgrims = await db.select().from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, req.params.groupId))
    .orderBy(asc(pilgrimsTable.serialNumber));
  res.json(pilgrims.map(fmtPilgrim));
});

router.post("/:groupId/pilgrims", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber,
    busNumber, relation, coverNumber } = req.body;

  if (!fullName) { res.status(400).json({ message: "fullName is required" }); return; }

  const [{ maxSerial }] = await db.select({ maxSerial: max(pilgrimsTable.serialNumber) })
    .from(pilgrimsTable).where(eq(pilgrimsTable.groupId, req.params.groupId));
  const nextSerial = (maxSerial || 0) + 1;

  const [pilgrim] = await db.insert(pilgrimsTable).values({
    groupId: req.params.groupId,
    serialNumber: nextSerial,
    fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state,
    roomNumber, busNumber, relation, coverNumber,
  }).returning();
  res.status(201).json(fmtPilgrim(pilgrim));
});

router.put("/:groupId/pilgrims/:pilgrimId", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state, roomNumber,
    busNumber, relation, coverNumber, serialNumber } = req.body;

  const [updated] = await db.update(pilgrimsTable).set({
    fullName, passportNumber, visaNumber, dateOfBirth, gender, bloodGroup,
    photoUrl, mobileIndia, mobileSaudi, address, city, state,
    roomNumber, busNumber, relation, coverNumber,
    serialNumber: serialNumber ? Number(serialNumber) : undefined,
    updatedAt: new Date(),
  }).where(eq(pilgrimsTable.id, req.params.pilgrimId)).returning();

  if (!updated) { res.status(404).json({ message: "Pilgrim not found" }); return; }
  res.json(fmtPilgrim(updated));
});

router.delete("/:groupId/pilgrims/:pilgrimId", requireAdmin as any, async (req, res) => {
  const pilgrims = await db.select().from(pilgrimsTable).where(eq(pilgrimsTable.id, req.params.pilgrimId));
  if (pilgrims[0]?.photoUrl) {
    const filename = path.basename(pilgrims[0].photoUrl);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await db.delete(pilgrimsTable).where(eq(pilgrimsTable.id, req.params.pilgrimId));
  res.json({ message: "Pilgrim deleted" });
});

router.post(
  "/:groupId/pilgrims/:pilgrimId/photo",
  requireAdmin as any,
  upload.single("photo"),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) { res.status(400).json({ message: "No photo provided" }); return; }
    const photoUrl = `/api/documents/files/${req.file.filename}`;
    const [updated] = await db.update(pilgrimsTable)
      .set({ photoUrl, updatedAt: new Date() })
      .where(eq(pilgrimsTable.id, req.params.pilgrimId))
      .returning();
    if (!updated) { res.status(404).json({ message: "Pilgrim not found" }); return; }
    res.json(fmtPilgrim(updated));
  }
);

export default router;
