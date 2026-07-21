// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import {
  addCustomerSseClient,
  removeCustomerSseClient,
  broadcastCustomerJourneyUpdate,
} from "../lib/customerJourney.js";

export { broadcastCustomerJourneyUpdate };

const router = Router();

// ── GET /api/customer/journey/:bookingId ────────────────────────────────────
// Returns visa, flight, hotel/room info for the customer's pilgrim(s)
router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    const bkRes = await pool.query(
      `SELECT id, customer_id, customer_mobile, booking_number, status, preferred_departure_date
       FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });
    if (booking.customer_id !== userId) return void res.status(403).json({ error: "Forbidden" });

    const customerMobile = booking.customer_mobile?.replace(/\D/g, "").replace(/^91/, "");

    const pilgrimRes = await pool.query(
      `SELECT p.*, h.id AS h_id, h.name AS hotel_name, h.city AS hotel_city,
              h.address AS hotel_address, h.stars AS hotel_stars,
              h.check_in_date, h.check_out_date, h.contact_phone AS hotel_phone,
              r.room_number, r.floor, r.capacity, r.bed_type AS room_type
       FROM pilgrims p
       LEFT JOIN pilgrim_room_assignments pra ON pra.pilgrim_id = p.id
       LEFT JOIN hotels h ON h.id = pra.hotel_id AND h.is_deleted = false
       LEFT JOIN hotel_rooms r ON r.id = pra.room_id
       WHERE REPLACE(REPLACE(p.mobile_india, ' ', ''), '-', '') LIKE $1
       ORDER BY p.serial_number
       LIMIT 10`,
      [`%${customerMobile?.slice(-9) || "__NOMATCH__"}`]
    );
    const pilgrims = pilgrimRes.rows;

    let flights: any[] = [];
    if (pilgrims.length > 0) {
      const groupIds = [...new Set(pilgrims.map(p => p.group_id).filter(Boolean))];
      const pilgrimIds = pilgrims.map(p => p.id);
      if (groupIds.length > 0) {
        const flightRes = await pool.query(
          `SELECT gf.id, gf.group_id, gf.flight_type, gf.airline, gf.flight_number,
                  gf.pnr, gf.departure_airport, gf.arrival_airport,
                  gf.departure_date, gf.departure_time, gf.arrival_date, gf.arrival_time,
                  gf.baggage_allowance, gf.meal_type, gf.status, gf.pilgrims_assigned,
                  gf.ticket_numbers
           FROM group_flights gf
           WHERE gf.group_id = ANY($1)
             AND (gf.pilgrims_assigned IS NULL
                  OR gf.pilgrims_assigned = '[]'::jsonb
                  OR gf.pilgrims_assigned @> to_jsonb(ARRAY(SELECT unnest($2::text[]))))
           ORDER BY gf.departure_date, gf.flight_type`,
          [groupIds, pilgrimIds]
        );
        flights = flightRes.rows;
      }
    }

    const visaList = pilgrims.map(p => ({
      pilgrimName: p.full_name,
      pilgrimId: p.id,
      serialNumber: p.serial_number,
      visaStatus: p.visa_status || "not_applied",
      visaNumber: p.visa_number,
      visaType: p.visa_type,
      visaAppliedDate: p.visa_applied_date,
      visaReceivedDate: p.visa_received_date,
      passportNumber: p.passport_number,
      passportExpiry: p.passport_expiry_date,
    }));

    const hotelList = pilgrims
      .filter(p => p.h_id)
      .map(p => ({
        pilgrimName: p.full_name,
        pilgrimId: p.id,
        hotelName: p.hotel_name,
        hotelCity: p.hotel_city,
        hotelAddress: p.hotel_address,
        hotelStars: p.hotel_stars,
        checkInDate: p.check_in_date,
        checkOutDate: p.check_out_date,
        roomNumber: p.room_number,
        floor: p.floor,
        capacity: p.capacity,
        roomType: p.room_type,
      }));

    res.json({
      booking: {
        id: booking.id,
        bookingNumber: booking.booking_number,
        status: booking.status,
        departureDate: booking.preferred_departure_date,
      },
      pilgrims: visaList,
      flights,
      hotels: hotelList,
      hasPilgrimData: pilgrims.length > 0,
    });
  } catch (err: any) {
    console.error("[customer-journey] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/customer/journey/:bookingId/steps ──────────────────────────────
// Returns all 17 journey steps with their state, timestamps, and notes
router.get("/:bookingId/steps", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    const bkRes = await pool.query(
      `SELECT id, customer_id, journey_status, created_at FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Not found" });
    if (booking.customer_id !== userId) return void res.status(403).json({ error: "Forbidden" });

    // Agreement status
    const agRes = await pool.query(
      `SELECT status, created_at, updated_at FROM agreements WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [bookingId]
    );
    const agreement = agRes.rows[0] || null;

    // Notification log timestamps per event_type
    const nlRes = await pool.query(
      `SELECT event_type, MIN(created_at) AS completed_at
       FROM notification_logs WHERE booking_id = $1 GROUP BY event_type`,
      [bookingId]
    );
    const nlMap: Record<string, string> = {};
    for (const row of nlRes.rows) {
      if (row.event_type) nlMap[row.event_type] = row.completed_at;
    }

    // Customer timeline notes
    const ctRes = await pool.query(
      `SELECT event_type, description, created_at FROM customer_timeline
       WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId]
    );
    const ctMap: Record<string, { description: string; created_at: string }> = {};
    for (const row of ctRes.rows) {
      if (row.event_type && !ctMap[row.event_type]) ctMap[row.event_type] = row;
    }

    // Audit log timestamps + who updated
    let auditMap: Record<string, { changed_at: string; changed_by: string }> = {};
    try {
      const auRes = await pool.query(
        `SELECT new_value->>'journey_status' AS status,
                MIN(changed_at) AS changed_at, MAX(changed_by) AS changed_by
         FROM booking_audit_logs
         WHERE booking_id = $1 AND action = 'journey_status_changed'
         GROUP BY new_value->>'journey_status'`,
        [bookingId]
      );
      for (const row of auRes.rows) {
        if (row.status) auditMap[row.status] = row;
      }
    } catch { /* audit table may not exist */ }

    // Build stepData per status key
    const stepData: Record<string, any> = {};

    // booking_requested: use booking.created_at
    stepData["booking_requested"] = {
      completedAt: booking.created_at,
      updatedBy: "System",
      notes: "Booking submitted and confirmed",
    };

    // agreement_signed: from agreements table
    if (agreement?.status === "signed") {
      stepData["agreement_signed"] = {
        completedAt: agreement.updated_at || agreement.created_at,
        updatedBy: "Customer",
        notes: "Travel agreement signed digitally",
      };
    } else {
      stepData["agreement_signed"] = { completedAt: null, updatedBy: null, notes: null };
    }

    // All other step keys (19-step journey)
    const otherKeys = [
      "documents_received", "admin_verification", "booking_approved",
      "partial_payment_received", "payment_received", "invoice_generated",
      "visa_processing", "visa_approved", "flight_confirmed", "hotel_confirmed",
      "room_allocated", "departure_ready", "journey_started",
      "reached_makkah", "reached_madinah", "return_flight", "journey_completed",
    ];

    for (const key of otherKeys) {
      const ts = nlMap[key] || auditMap[key]?.changed_at || ctMap[key]?.created_at || null;
      const updatedBy = auditMap[key]?.changed_by ? "Admin" : (nlMap[key] ? "System" : null);
      const notes = ctMap[key]?.description || null;
      stepData[key] = { completedAt: ts, updatedBy, notes };
    }

    res.json({
      journeyStatus: booking.journey_status || "booking_requested",
      agreementStatus: agreement?.status || null,
      stepData,
    });
  } catch (err: any) {
    console.error("[customer-journey/steps] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/customer/journey/:bookingId/stream ─────────────────────────────
// SSE stream for real-time journey status updates
router.get("/:bookingId/stream", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const { bookingId } = req.params;
  const userId = req.user?.id;

  try {
    const bkRes = await pool.query(
      `SELECT customer_id FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    const booking = bkRes.rows[0];
    if (!booking || booking.customer_id !== userId) {
      return void res.status(403).json({ error: "Forbidden" });
    }
  } catch {
    return void res.status(500).end();
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ bookingId, ts: new Date().toISOString() })}\n\n`);

  addCustomerSseClient(bookingId, res);

  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeCustomerSseClient(bookingId, res);
  });
});

export default router;
