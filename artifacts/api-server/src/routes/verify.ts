import { Router } from "express";
import { db, pilgrimsTable, hajjGroupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export default router;
