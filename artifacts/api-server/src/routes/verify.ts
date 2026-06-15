import { Router } from "express";
import { db, pilgrimsTable, hajjGroupsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id.length < 10) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [pilgrim] = await db
      .select()
      .from(pilgrimsTable)
      .where(eq(pilgrimsTable.id, id))
      .limit(1);

    if (!pilgrim) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [group] = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, pilgrim.groupId))
      .limit(1);

    res.json({
      id: pilgrim.id,
      fullName: pilgrim.fullName,
      salutation: pilgrim.salutation,
      serialNumber: pilgrim.serialNumber,
      passportNumber: pilgrim.passportNumber,
      mobileIndia: pilgrim.mobileIndia,
      mobileSaudi: pilgrim.mobileSaudi,
      photoUrl: pilgrim.photoUrl,
      coverNumber: pilgrim.coverNumber,
      gender: pilgrim.gender,
      bloodGroup: pilgrim.bloodGroup,
      city: pilgrim.city,
      state: pilgrim.state,
      roomNumber: pilgrim.roomNumber,
      roomType: pilgrim.roomType,
      roomHotel: pilgrim.roomHotel,
      group: group
        ? {
            id: group.id,
            groupName: group.groupName,
            year: group.year,
            flightNumber: group.flightNumber,
            departureDate: group.departureDate,
            returnDate: group.returnDate,
            maktabNumber: group.maktabNumber,
            hotels: group.hotels,
          }
        : null,
    });
  } catch (err) {
    console.error("[Verify] Error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// Public family verify page
router.get("/family/:groupId/:familyId", async (req, res) => {
  try {
    const groupId = String(req.params.groupId);
    const familyId = decodeURIComponent(String(req.params.familyId));

    const allPilgrims = await db
      .select()
      .from(pilgrimsTable)
      .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.familyId, familyId)))
      .orderBy(asc(pilgrimsTable.serialNumber));

    if (allPilgrims.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [group] = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, groupId))
      .limit(1);

    const members = allPilgrims.map(p => ({
      id: p.id,
      fullName: p.fullName,
      salutation: p.salutation,
      serialNumber: p.serialNumber,
      passportNumber: p.passportNumber,
      gender: p.gender,
      relation: p.relation,
      familyHead: p.familyHead,
      roomNumber: p.roomNumber,
      roomHotel: p.roomHotel,
      mobileIndia: p.mobileIndia,
      mobileSaudi: p.mobileSaudi,
      photoUrl: p.photoUrl,
    }));

    const head = members.find(m => m.familyHead) || members[0];

    res.json({
      familyId,
      groupId,
      groupName: group?.groupName || "",
      year: group?.year || 0,
      members,
      head: head || null,
    });
  } catch (err) {
    console.error("[Verify] Family error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
