import { Router } from "express";
import { db, pilgrimsTable, hajjGroupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

router.get("/:barcodeId", async (req, res) => {
  try {
    const { barcodeId } = req.params;
    if (!barcodeId || barcodeId.length < 3) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [pilgrim] = await db
      .select()
      .from(pilgrimsTable)
      .where(eq(pilgrimsTable.barcodeId, barcodeId.toUpperCase()))
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
      barcodeId: pilgrim.barcodeId,
      fullName: pilgrim.fullName,
      salutation: pilgrim.salutation,
      serialNumber: pilgrim.serialNumber,
      passportNumber: pilgrim.passportNumber,
      mobileIndia: pilgrim.mobileIndia,
      mobileSaudi: pilgrim.mobileSaudi,
      photoUrl: pilgrim.photoUrl,
      gender: pilgrim.gender,
      bloodGroup: pilgrim.bloodGroup,
      city: pilgrim.city,
      state: pilgrim.state,
      roomNumber: pilgrim.roomNumber,
      roomType: pilgrim.roomType,
      roomHotel: pilgrim.roomHotel,
      busNumber: pilgrim.busNumber,
      coverNumber: pilgrim.coverNumber,
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
    console.error("[Scan] Error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
