// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

// GET /api/customer/journey/:bookingId
// Returns visa, flight, hotel/room info for the customer's pilgrim(s)
router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    // Verify booking ownership
    const bkRes = await pool.query(
      `SELECT id, customer_id, customer_mobile, booking_number, status, preferred_departure_date
       FROM bookings WHERE id = $1 LIMIT 1`,
      [bookingId]
    );
    const booking = bkRes.rows[0];
    if (!booking) return void res.status(404).json({ error: "Booking not found" });
    if (booking.customer_id !== userId) return void res.status(403).json({ error: "Forbidden" });

    const customerMobile = booking.customer_mobile?.replace(/\D/g, "").replace(/^91/, "");

    // Find pilgrim(s) by mobile number match
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

    // Find flights assigned to any of these pilgrims
    let flights: any[] = [];
    if (pilgrims.length > 0) {
      const pilgrimIds = pilgrims.map(p => p.id);
      const groupIds = [...new Set(pilgrims.map(p => p.group_id).filter(Boolean))];

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

    // Build visa summary from first pilgrim (or per-pilgrim)
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

    // Build hotel/room summary
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

export default router;
