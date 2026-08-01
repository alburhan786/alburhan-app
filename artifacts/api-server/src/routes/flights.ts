// @ts-nocheck
import { Router } from "express";
import { db, groupFlightsTable, pool } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { sendEmail } from "../lib/notifications.js";

const router = Router();
router.use(requireModuleAccess("groups") as any);

// Placeholder sentinel values — when these are the current values, the flight is NOT yet confirmed
const PLACEHOLDER_AIRLINE = "Any Airline";
const PLACEHOLDER_FLIGHT  = "To Be Confirmed";
const PLACEHOLDER_PNR     = "To Be Confirmed";

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
    if (!groupId) return void res.status(400).json({ error: "groupId required" });
    const [row] = await db.insert(groupFlightsTable).values({
      groupId,
      flightType: flightType || "outbound",
      airline:       airline       || PLACEHOLDER_AIRLINE,
      flightNumber:  flightNumber  || PLACEHOLDER_FLIGHT,
      pnr:           pnr           || PLACEHOLDER_PNR,
      departureAirport, arrivalAirport,
      departureDate, departureTime, arrivalDate, arrivalTime,
      baggageAllowance, mealType,
      status: status || "scheduled",
      notes,
      pilgrimsAssigned: pilgrimsAssigned ?? [],
      ticketNumbers: ticketNumbers ?? {},
    }).returning();
    auditLog({ req, action: "created", entityTable: "flights", entityId: row.id, newValue: { groupId: row.groupId, flightNumber: row.flightNumber, flightType: row.flightType } }).catch(() => {});
    res.json(row);
    if (Array.isArray(pilgrimsAssigned) && pilgrimsAssigned.length > 0) {
      pool.query(`SELECT id, full_name, mobile_india, booking_id FROM pilgrims WHERE id=ANY($1) AND mobile_india IS NOT NULL`, [pilgrimsAssigned])
        .then(r => {
          for (const p of r.rows) {
            fireNotificationEvent("flight_assigned", { customerName: p.full_name, customerMobile: p.mobile_india, flightNumber: flightNumber || undefined, airline: airline || undefined, departureDate: departureDate || undefined }).catch(() => {});
            triggerWorkflow("flight_assigned", { customerName: p.full_name, customerMobile: p.mobile_india, pilgramName: p.full_name, bookingId: p.booking_id, flightNumber: flightNumber || undefined, departureDate: departureDate || undefined }).catch(() => {});
          }
        }).catch(() => {});
    }
  } catch (err) {
    console.error("[flights] POST /", err);
    res.status(500).json({ error: "Failed to create flight" });
  }
});

router.put("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const [existing] = await db.select().from(groupFlightsTable).where(eq(groupFlightsTable.id, req.params.id)).limit(1);
    const { flightType, airline, flightNumber, pnr, departureAirport, arrivalAirport, departureDate, departureTime, arrivalDate, arrivalTime, baggageAllowance, mealType, status, notes, pilgrimsAssigned, ticketNumbers } = req.body;
    const [row] = await db.update(groupFlightsTable)
      .set({ flightType, airline, flightNumber, pnr, departureAirport, arrivalAirport, departureDate, departureTime, arrivalDate, arrivalTime, baggageAllowance, mealType, status, notes, pilgrimsAssigned: pilgrimsAssigned ?? [], ticketNumbers: ticketNumbers ?? {}, updatedAt: new Date() })
      .where(eq(groupFlightsTable.id, req.params.id))
      .returning();
    if (!row) return void res.status(404).json({ error: "Not found" });
    auditLog({ req, action: "updated", entityTable: "flights", entityId: req.params.id, oldValue: existing ? { flightNumber: existing.flightNumber, status: existing.status, airline: existing.airline } : null, newValue: { flightNumber: row.flightNumber, status: row.status, airline: row.airline } }).catch(() => {});
    res.json(row);
  } catch (err) {
    console.error("[flights] PUT", err);
    res.status(500).json({ error: "Failed to update flight" });
  }
});

// ── Confirm flight: push flight_info to all group agreements + notify pilgrims ─
router.post("/:id/confirm", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const [flight] = await db.select().from(groupFlightsTable).where(eq(groupFlightsTable.id, req.params.id)).limit(1);
    if (!flight) return void res.status(404).json({ error: "Flight not found" });
    if (!flight.groupId) return void res.status(400).json({ error: "Flight has no group assigned" });

    // Build the confirmed flight_info JSON that will be written to every agreement in this group
    const flight_info = JSON.stringify({
      airline:          flight.airline       || PLACEHOLDER_AIRLINE,
      flightNumber:     flight.flightNumber  || PLACEHOLDER_FLIGHT,
      pnr:              flight.pnr           || PLACEHOLDER_PNR,
      departureAirport: flight.departureAirport || null,
      arrivalAirport:   flight.arrivalAirport   || null,
      departure: [flight.departureDate, flight.departureTime].filter(Boolean).join(" ") || null,
      arrival:   [flight.arrivalDate,   flight.arrivalTime].filter(Boolean).join(" ")   || null,
      baggage:   flight.baggageAllowance || "25 KG",
      flightType: flight.flightType,
      confirmedAt: new Date().toISOString(),
    });

    // Update flight_info on every active agreement for bookings in this group
    const agUpdate = await pool.query(
      `UPDATE agreements ag
       SET flight_info = (
         CASE WHEN ag.flight_info IS NULL
              THEN $1::jsonb
              ELSE ag.flight_info || $1::jsonb
         END
       ), updated_at = NOW()
       FROM bookings b
       WHERE b.id = ag.booking_id
         AND b.group_id = $2
         AND ag.status NOT IN ('cancelled','void')
       RETURNING ag.id, ag.status, ag.agreement_number, b.customer_name, b.customer_mobile, b.customer_email, b.booking_number`,
      [flight_info, flight.groupId]
    );
    const agreementsUpdated = agUpdate.rowCount || 0;
    console.log(`[flights/confirm] Updated flight_info on ${agreementsUpdated} agreements for group ${flight.groupId}`);

    // Mark flight as "confirmed"
    await db.update(groupFlightsTable)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(groupFlightsTable.id, req.params.id));

    // Send notifications to all pilgrims in the group who have a mobile number
    const pilgrimsRes = await pool.query(
      `SELECT p.id, p.full_name, p.mobile_india, p.booking_id, b.booking_number, b.package_name, b.customer_email
       FROM pilgrims p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.group_id = $1 AND p.mobile_india IS NOT NULL AND b.status = 'approved'`,
      [flight.groupId]
    );

    let notificationsSent = 0;
    for (const p of pilgrimsRes.rows) {
      // WhatsApp + SMS via workflowEngine (flight_assigned event has templates configured)
      triggerWorkflow("flight_assigned", {
        customerName:  p.full_name,
        customerMobile: p.mobile_india,
        pilgramName:   p.full_name,
        bookingId:     p.booking_id,
        bookingNumber: p.booking_number,
        packageName:   p.package_name,
        flightNumber:  flight.flightNumber  || "To Be Confirmed",
        airline:       flight.airline       || "Any Airline",
        departureDate: flight.departureDate || undefined,
        departureTime: flight.departureTime || undefined,
      }).catch(e => console.error("[flights/confirm] notify failed:", e));

      // Email — send directly with flight summary
      if (p.customer_email) {
        const depStr = [flight.departureDate, flight.departureTime].filter(Boolean).join(" at ") || "To Be Confirmed";
        const arrStr = [flight.arrivalDate,   flight.arrivalTime  ].filter(Boolean).join(" at ") || "To Be Confirmed";
        sendEmail(
          p.customer_email,
          `✈️ Flight Confirmed — Booking #${p.booking_number}`,
          `As-salamu Alaykum ${p.full_name},\n\nYour flight details have been confirmed for Booking #${p.booking_number}.\n\nAirline: ${flight.airline || "Any Airline"}\nFlight No: ${flight.flightNumber || "To Be Confirmed"}\nPNR: ${flight.pnr || "To Be Confirmed"}\nDeparture: ${depStr}\nArrival: ${arrStr}\nBaggage: ${flight.baggageAllowance || "25 KG"}\n\nPlease log in to alburhantravels.com to download your updated agreement.\n\nJazakAllah Khair,\nAl Burhan Tours & Travels`,
          `<p>As-salamu Alaykum <strong>${p.full_name}</strong>,</p>
           <p>Your flight details have been <strong>confirmed</strong> for Booking <strong>#${p.booking_number}</strong>.</p>
           <table style="border-collapse:collapse;margin:16px 0">
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">Airline</td><td style="padding:6px 12px">${flight.airline || "Any Airline"}</td></tr>
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">Flight No.</td><td style="padding:6px 12px">${flight.flightNumber || "To Be Confirmed"}</td></tr>
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">PNR</td><td style="padding:6px 12px">${flight.pnr || "To Be Confirmed"}</td></tr>
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">Departure</td><td style="padding:6px 12px">${depStr}</td></tr>
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">Arrival</td><td style="padding:6px 12px">${arrStr}</td></tr>
             <tr><td style="padding:6px 12px;background:#f0fdf4;font-weight:bold">Baggage</td><td style="padding:6px 12px">${flight.baggageAllowance || "25 KG"}</td></tr>
           </table>
           <p>Please <a href="https://alburhantravels.com">log in</a> to download your updated Agreement PDF with confirmed flight details.</p>
           <p>Jazakallah Khair,<br>Al Burhan Tours & Travels</p>`
        ).catch(e => console.error("[flights/confirm] email failed:", e));
      }
      notificationsSent++;
    }

    auditLog({
      req, action: "confirmed", entityTable: "flights", entityId: req.params.id,
      newValue: { airline: flight.airline, flightNumber: flight.flightNumber, pnr: flight.pnr, agreementsUpdated, notificationsSent }
    }).catch(() => {});

    res.json({ ok: true, agreementsUpdated, notificationsSent, pilgrimsCount: pilgrimsRes.rows.length });
  } catch (err) {
    console.error("[flights] POST /:id/confirm", err);
    res.status(500).json({ error: "Failed to confirm flight" });
  }
});

router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await db.delete(groupFlightsTable).where(eq(groupFlightsTable.id, req.params.id));
    auditLog({ req, action: "deleted", entityTable: "flights", entityId: req.params.id }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error("[flights] DELETE", err);
    res.status(500).json({ error: "Failed to delete flight" });
  }
});

export default router;
