import { Router } from "express";
import { db, groupFlightsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

router.get("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId } = req.query as Record<string, string>;
    const rows = groupId
      ? await db.select().from(groupFlightsTable).where(eq(groupFlightsTable.groupId, groupId)).orderBy(groupFlightsTable.departureDate, groupFlightsTable.departureTime)
      : await db.select().from(groupFlightsTable).orderBy(desc(groupFlightsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("[flights] GET /", err);
    res.status(500).json({ error: "Failed to fetch flights" });
  }
});

router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { groupId, flightType, airline, flightNumber, pnr, departureAirport, arrivalAirport, departureDate, departureTime, arrivalDate, arrivalTime, baggageAllowance, mealType, status, notes, pilgrimsAssigned, ticketNumbers } = req.body;
    if (!groupId) return res.status(400).json({ error: "groupId required" });
    const [row] = await db.insert(groupFlightsTable).values({
      groupId,
      flightType: flightType || "outbound",
      airline, flightNumber, pnr,
      departureAirport, arrivalAirport,
      departureDate, departureTime, arrivalDate, arrivalTime,
      baggageAllowance, mealType,
      status: status || "scheduled",
      notes,
      pilgrimsAssigned: pilgrimsAssigned ?? [],
      ticketNumbers: ticketNumbers ?? {},
    }).returning();
    res.json(row);
  } catch (err) {
    console.error("[flights] POST /", err);
    res.status(500).json({ error: "Failed to create flight" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { flightType, airline, flightNumber, pnr, departureAirport, arrivalAirport, departureDate, departureTime, arrivalDate, arrivalTime, baggageAllowance, mealType, status, notes, pilgrimsAssigned, ticketNumbers } = req.body;
    const [row] = await db.update(groupFlightsTable)
      .set({ flightType, airline, flightNumber, pnr, departureAirport, arrivalAirport, departureDate, departureTime, arrivalDate, arrivalTime, baggageAllowance, mealType, status, notes, pilgrimsAssigned: pilgrimsAssigned ?? [], ticketNumbers: ticketNumbers ?? {}, updatedAt: new Date() })
      .where(eq(groupFlightsTable.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("[flights] PUT", err);
    res.status(500).json({ error: "Failed to update flight" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await db.delete(groupFlightsTable).where(eq(groupFlightsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[flights] DELETE", err);
    res.status(500).json({ error: "Failed to delete flight" });
  }
});

export default router;
