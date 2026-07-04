import { Router, type Request, type Response, type NextFunction } from "express";
import { db, attendanceEventsTable, attendanceLogsTable, pilgrimsTable } from "@workspace/db";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import * as XLSX from "xlsx";

const router = Router();
// Exempt token-based scan endpoints (requireAdminOrToken) from admin-session-only RBAC
router.use((req: any, res: any, next: any) => {
  if (/\/attendance\/events\/[^/]+\/(info|scan)$/.test(req.path)) return next();
  return (requireModuleAccess("groups") as any)(req, res, next);
});

function parsePilgrimId(qrText: string): string | null {
  try {
    const url = new URL(qrText);
    const parts = url.pathname.split("/");
    const verifyIdx = parts.findIndex((p) => p === "verify");
    if (verifyIdx >= 0 && parts[verifyIdx + 1]) return parts[verifyIdx + 1];
  } catch {
    if (qrText && !qrText.includes(" ") && qrText.length > 8) return qrText;
  }
  return null;
}

async function getEventForGroup(eventId: string, groupId: string) {
  const [event] = await db
    .select()
    .from(attendanceEventsTable)
    .where(and(eq(attendanceEventsTable.id, eventId), eq(attendanceEventsTable.groupId, groupId)));
  return event || null;
}

function isAdminSession(req: Request): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      const sessionUserId = (req as any).session?.userId;
      if (!sessionUserId) { resolve(false); return; }
      const { db: _db, usersTable } = await import("@workspace/db");
      const { eq: _eq } = await import("drizzle-orm");
      const [user] = await _db.select().from(usersTable).where(_eq(usersTable.id, sessionUserId));
      resolve(user?.role === "admin");
    } catch { resolve(false); }
  });
}

async function requireAdminOrToken(req: Request, res: Response, next: NextFunction) {
  if (await isAdminSession(req)) { next(); return; }

  const { eventId, groupId } = req.params;
  const token = String(req.query.token || "");

  if (!token || !eventId || !groupId) {
    res.status(401).json({ error: "Unauthorized. Provide admin session or valid scanner token." });
    return;
  }

  const event = await getEventForGroup(eventId, groupId);
  if (!event || !event.scanToken || event.scanToken !== token) {
    res.status(401).json({ error: "Invalid scanner token." });
    return;
  }

  if (event.scanTokenExpiresAt && event.scanTokenExpiresAt < new Date()) {
    res.status(401).json({ error: "Scanner link has expired. Ask admin to regenerate the link." });
    return;
  }

  next();
}

router.get("/:groupId/attendance/events", requireAdmin, async (req, res) => {
  const { groupId } = req.params;
  const events = await db
    .select()
    .from(attendanceEventsTable)
    .where(eq(attendanceEventsTable.groupId, groupId))
    .orderBy(desc(attendanceEventsTable.createdAt));

  const pilgrimCount = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));
  const total = pilgrimCount.length;

  const withStats = await Promise.all(
    events.map(async (ev) => {
      const logs = await db
        .select()
        .from(attendanceLogsTable)
        .where(eq(attendanceLogsTable.eventId, ev.id));
      const present = logs.filter((l) => l.status === "present").length;
      const absent = logs.filter((l) => l.status === "absent").length;
      return { ...ev, present, absent, total, missing: total - present };
    })
  );

  res.json(withStats);
});

router.post("/:groupId/attendance/events", requireAdmin, async (req, res) => {
  const { groupId } = req.params;
  const { name, type } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [event] = await db
    .insert(attendanceEventsTable)
    .values({ groupId, name, type: type || "other" })
    .returning();
  res.json(event);
});

router.delete("/:groupId/attendance/events/:eventId", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }
  await db.delete(attendanceLogsTable).where(eq(attendanceLogsTable.eventId, eventId));
  await db.delete(attendanceEventsTable).where(eq(attendanceEventsTable.id, eventId));
  res.json({ success: true });
});

router.post("/:groupId/attendance/events/:eventId/delete", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }
  await db.delete(attendanceLogsTable).where(eq(attendanceLogsTable.eventId, eventId));
  await db.delete(attendanceEventsTable).where(eq(attendanceEventsTable.id, eventId));
  res.json({ success: true });
});

router.post("/:groupId/attendance/events/:eventId/refresh-token", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }
  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [updated] = await db
    .update(attendanceEventsTable)
    .set({ scanToken: newToken, scanTokenExpiresAt: expiresAt })
    .where(eq(attendanceEventsTable.id, eventId))
    .returning();
  res.json({ scanToken: updated.scanToken, scanTokenExpiresAt: updated.scanTokenExpiresAt });
});

router.get("/:groupId/attendance/events/:eventId/info", requireAdminOrToken, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  const pilgrimCount = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));
  const logs = await db
    .select()
    .from(attendanceLogsTable)
    .where(eq(attendanceLogsTable.eventId, eventId));
  const presentCount = logs.filter((l) => l.status === "present").length;

  res.json({ id: event.id, name: event.name, type: event.type, groupId: event.groupId, presentCount, totalCount: pilgrimCount.length });
});

router.post("/:groupId/attendance/events/:eventId/scan", requireAdminOrToken, async (req, res) => {
  const { groupId, eventId } = req.params;
  const { pilgrimId: rawId, qrText, status = "present" } = req.body;

  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }

  let scannedValue = rawId;
  if (!scannedValue && qrText) scannedValue = parsePilgrimId(qrText);
  if (!scannedValue) { res.status(400).json({ error: "pilgrimId or qrText required" }); return; }

  // Look up by UUID first, then fall back to barcodeId (e.g. ABT-HJ26-0001)
  const [pilgrim] = await db
    .select()
    .from(pilgrimsTable)
    .where(and(
      eq(pilgrimsTable.groupId, groupId),
      or(
        eq(pilgrimsTable.id, scannedValue),
        eq(pilgrimsTable.barcodeId, scannedValue.toUpperCase())
      )
    ))
    .limit(1);

  if (!pilgrim) { res.status(404).json({ error: "Pilgrim not found in this group" }); return; }

  // Always use the real UUID for attendance logs
  const pilgrimId = pilgrim.id;

  const existing = await db
    .select()
    .from(attendanceLogsTable)
    .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, pilgrimId)));

  const alreadyPresent = existing.length > 0 && existing[0].status === "present" && status === "present";

  if (existing.length > 0) {
    await db
      .update(attendanceLogsTable)
      .set({ status, scannedAt: new Date() })
      .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, pilgrimId)));
  } else {
    await db.insert(attendanceLogsTable).values({ eventId, pilgrimId, groupId, status });
  }

  const logs = await db
    .select()
    .from(attendanceLogsTable)
    .where(eq(attendanceLogsTable.eventId, eventId));
  const presentCount = logs.filter((l) => l.status === "present").length;

  const totalPilgrims = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));

  // Fetch family members with their attendance status if pilgrim has a family
  let familyMembers: {
    id: string; fullName: string; serialNumber: number;
    familyRelation: string | null; familyHead: boolean | null;
    attendanceStatus: string | null;
  }[] = [];

  const familyId = (pilgrim as any).familyId as string | null;
  if (familyId) {
    const siblings = await db.select().from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId as any, familyId)));

    if (siblings.length > 0) {
      const siblingIds = siblings.map(s => s.id);
      const siblingLogs = await db.select().from(attendanceLogsTable)
        .where(and(eq(attendanceLogsTable.eventId, eventId), inArray(attendanceLogsTable.pilgrimId, siblingIds)));
      const logMap = new Map(siblingLogs.map(l => [l.pilgrimId, l.status]));

      familyMembers = siblings
        .sort((a, b) => (a.serialNumber ?? 0) - (b.serialNumber ?? 0))
        .map(s => ({
          id: s.id,
          fullName: s.fullName,
          serialNumber: s.serialNumber ?? 0,
          familyRelation: (s as any).familyRelation ?? null,
          familyHead: (s as any).familyHead ?? false,
          attendanceStatus: logMap.get(s.id) ?? null,
        }));
    }
  }

  res.json({
    success: true,
    alreadyPresent,
    pilgrim: {
      id: pilgrim.id,
      fullName: pilgrim.fullName,
      familyId: familyId ?? null,
      serialNumber: pilgrim.serialNumber,
      photoUrl: pilgrim.photoUrl ?? null,
      passportNumber: pilgrim.passportNumber ?? null,
      roomNumber: pilgrim.roomNumber ?? null,
      roomHotel: pilgrim.roomHotel ?? null,
      busNumber: pilgrim.busNumber ?? null,
    },
    status,
    presentCount,
    totalCount: totalPilgrims.length,
    familyMembers,
  });
});

router.post("/:groupId/attendance/events/:eventId/mark-all-present", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }

  const pilgrims = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));

  for (const p of pilgrims) {
    const existing = await db
      .select()
      .from(attendanceLogsTable)
      .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, p.id)));
    if (existing.length > 0) {
      await db
        .update(attendanceLogsTable)
        .set({ status: "present", scannedAt: new Date() })
        .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, p.id)));
    } else {
      await db.insert(attendanceLogsTable).values({ eventId, pilgrimId: p.id, groupId, status: "present" });
    }
  }
  res.json({ success: true, count: pilgrims.length });
});

router.post("/:groupId/attendance/events/:eventId/mark-pilgrim", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const { pilgrimId, status } = req.body;
  if (!pilgrimId || !["present", "absent"].includes(status)) {
    res.status(400).json({ error: "pilgrimId and status (present|absent) required" }); return;
  }
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }

  const [pilgrim] = await db
    .select()
    .from(pilgrimsTable)
    .where(and(eq(pilgrimsTable.id, pilgrimId), eq(pilgrimsTable.groupId, groupId)));
  if (!pilgrim) { res.status(404).json({ error: "Pilgrim not found in this group" }); return; }

  const existing = await db
    .select()
    .from(attendanceLogsTable)
    .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, pilgrimId)));

  if (existing.length > 0) {
    await db
      .update(attendanceLogsTable)
      .set({ status, scannedAt: new Date() })
      .where(and(eq(attendanceLogsTable.eventId, eventId), eq(attendanceLogsTable.pilgrimId, pilgrimId)));
  } else {
    await db.insert(attendanceLogsTable).values({ eventId, pilgrimId, groupId, status });
  }
  res.json({ success: true, status });
});

router.get("/:groupId/attendance/events/:eventId/summary", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }

  const pilgrims = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));
  const logs = await db
    .select()
    .from(attendanceLogsTable)
    .where(eq(attendanceLogsTable.eventId, eventId));

  const logMap = new Map(logs.map((l) => [l.pilgrimId, l.status]));

  const families = new Map<string, { familyId: string; members: any[] }>();
  for (const p of pilgrims) {
    const fid = (p as any).familyId || `solo_${p.id}`;
    if (!families.has(fid)) families.set(fid, { familyId: fid, members: [] });
    families.get(fid)!.members.push({ ...p, attendanceStatus: logMap.get(p.id) || "missing" });
  }

  const rows = Array.from(families.values()).map(({ familyId, members }) => {
    const head = members.find((m) => m.familyHead) || members[0];
    const present = members.filter((m) => m.attendanceStatus === "present").length;
    const total = members.length;
    const status = present === total ? "complete" : present === 0 ? "missing" : "partial";
    return { familyId, headName: head?.fullName || "", present, total, missing: total - present, status, members };
  });

  rows.sort((a, b) => {
    if (a.status === "missing" && b.status !== "missing") return -1;
    if (b.status === "missing" && a.status !== "missing") return 1;
    if (a.status === "partial" && b.status === "complete") return -1;
    if (b.status === "partial" && a.status === "complete") return 1;
    return 0;
  });

  const presentCount = pilgrims.filter((p) => logMap.get(p.id) === "present").length;
  res.json({ rows, presentCount, totalCount: pilgrims.length, missingCount: pilgrims.length - presentCount });
});

router.get("/:groupId/attendance/events/:eventId/export", requireAdmin, async (req, res) => {
  const { groupId, eventId } = req.params;
  const event = await getEventForGroup(eventId, groupId);
  if (!event) { res.status(404).json({ error: "Event not found in this group" }); return; }

  const pilgrims = await db
    .select()
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));
  const logs = await db
    .select()
    .from(attendanceLogsTable)
    .where(eq(attendanceLogsTable.eventId, eventId));

  const logMap = new Map(logs.map((l) => [l.pilgrimId, l]));
  const families = new Map<string, any[]>();
  for (const p of pilgrims) {
    const fid = (p as any).familyId || `solo_${p.id}`;
    if (!families.has(fid)) families.set(fid, []);
    families.get(fid)!.push(p);
  }

  const familyRows: any[] = [];
  for (const [fid, members] of families.entries()) {
    const head = members.find((m) => m.familyHead) || members[0];
    const present = members.filter((m) => logMap.get(m.id)?.status === "present").length;
    familyRows.push({
      "Family ID": fid.startsWith("solo_") ? "Solo" : fid,
      "Head / Member": head?.fullName || "",
      "Total Members": members.length,
      "Present": present,
      "Missing": members.length - present,
      "Status": present === members.length ? "Complete" : present === 0 ? "Missing" : "Partial",
    });
    for (const m of members) {
      const log = logMap.get(m.id);
      familyRows.push({
        "Family ID": "",
        "Head / Member": `  ↳ ${m.fullName}`,
        "Total Members": "",
        "Present": "",
        "Missing": "",
        "Status": log?.status === "present" ? "Present ✓" : log?.status === "absent" ? "Absent ✗" : "Missing ✗",
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(familyRows);
  ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeEvent = event.name.replace(/[^a-z0-9]/gi, "_");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeEvent}.xlsx"`);
  res.send(buf);
});

export default router;
