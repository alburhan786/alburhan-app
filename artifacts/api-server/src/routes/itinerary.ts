// @ts-nocheck
/**
 * Travel Itinerary Route
 * POST /api/itinerary/:bookingId — generate & deliver a travel itinerary PDF
 * GET  /api/itinerary/:bookingId — check if one exists / get its URL
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { randomUUID } from "crypto";
import { generateTravelItineraryPdf } from "../lib/travelItineraryPdf.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { sendDocumentToCustomer } from "../lib/documentDelivery.js";

const router = Router();

// ── GET — fetch existing itinerary doc for a booking ─────────────────────────
router.get("/:bookingId", requireAuth as any, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, file_url, file_name, created_at
       FROM documents
       WHERE booking_id=$1 AND document_type='tour_itinerary'
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.bookingId]
    );
    if (!rows[0]) return void res.status(404).json({ error: "No itinerary found" });
    res.json({ docId: rows[0].id, fileUrl: rows[0].file_url, fileName: rows[0].file_name, createdAt: rows[0].created_at });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST — generate (or re-generate) travel itinerary PDF ────────────────────
router.post("/:bookingId", requireAdmin as any, async (req, res) => {
  const { bookingId } = req.params;
  try {
    // ── Fetch booking + customer ────────────────────────────────────────────
    const { rows: [booking] } = await pool.query(
      `SELECT b.id, b.booking_number, b.customer_id, b.package_name, b.package_type,
              b.preferred_departure_date, b.notes,
              u.name AS customer_name, u.mobile, u.email,
              u.emergency_contact_name, u.emergency_contact_mobile,
              hg.group_name
       FROM bookings b
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN hajj_groups hg ON hg.id = b.group_id
       WHERE b.id = $1`,
      [bookingId]
    );
    if (!booking) return void res.status(404).json({ error: "Booking not found" });

    // ── Fetch pilgrims ──────────────────────────────────────────────────────
    const { rows: pilgrims } = await pool.query(
      `SELECT full_name, passport_number FROM pilgrims WHERE booking_id=$1 ORDER BY created_at`,
      [bookingId]
    );

    // ── Fetch flight assignments ────────────────────────────────────────────
    const { rows: flights } = await pool.query(
      `SELECT fa.*, f.flight_number, f.airline, f.departure_airport, f.arrival_airport,
              f.departure_date, f.arrival_date, f.departure_time, f.arrival_time,
              f.terminal, f.flight_type
       FROM flight_assignments fa
       JOIN flights f ON f.id = fa.flight_id
       WHERE fa.booking_id = $1
       ORDER BY f.departure_date`,
      [bookingId]
    ).catch(() => ({ rows: [] }));

    // ── Fetch hotel assignments (via pilgrims) ──────────────────────────────
    const { rows: hotelRows } = await pool.query(
      `SELECT DISTINCT h.name, h.city, h.stars, h.address,
              h.check_in_date, h.check_out_date,
              r.room_number
       FROM pilgrim_room_assignments ra
       JOIN pilgrims p ON p.id = ra.pilgrim_id
       JOIN hotels h ON h.id = ra.hotel_id
       JOIN hotel_rooms r ON r.id = ra.room_id
       WHERE p.booking_id = $1
       ORDER BY h.check_in_date`,
      [bookingId]
    ).catch(() => ({ rows: [] }));

    // ── Build flight info objects ───────────────────────────────────────────
    const outbound = flights.find((f: any) => f.flight_type === "outbound" || f.flight_type === "departure");
    const returnFl = flights.find((f: any) => f.flight_type === "return"   || f.flight_type === "arrival");

    // ── Build day itinerary from hotels + package type ──────────────────────
    const dayItinerary: any[] = [];
    const packageType = (booking.package_type || booking.package_name || "").toLowerCase();
    const isHajj = packageType.includes("hajj");

    if (isHajj) {
      dayItinerary.push(
        { day: 1,  title: "Departure — Home to Airport",           activities: ["Report at airport 3 hours before departure", "Wear Ihram at Meeqat", "Board flight to Saudi Arabia"] },
        { day: 2,  title: "Arrival in Madinah",                    activities: ["Arrive at Madinah airport", "Check-in to hotel", "Visit Masjid-e-Nabawi", "Rest and ziyarat"] },
        { day: 3,  title: "Madinah — Ziyarat",                     activities: ["Fajr prayer at Masjid-e-Nabawi", "Raudah visit", "Historical sites ziyarat", "Masjid Quba"] },
        { day: 7,  title: "Travel to Makkah",                      activities: ["Check-out from Madinah hotel", "Travel to Makkah by bus", "Check-in Makkah hotel", "Perform Tawaf-e-Qudum"] },
        { day: 8,  title: "Makkah — Preparations for Hajj",        activities: ["Umrah completion", "Rest and ibadah", "Tawaf at Masjid-e-Haram", "Preparation for Hajj days"] },
        { day: 14, title: "8th Dhul Hijjah — Mina",                activities: ["Travel to Mina", "5 prayers in Mina", "Night in Mina", "Prepare for Arafat"] },
        { day: 15, title: "9th Dhul Hijjah — Arafat (The Great Day)", activities: ["Travel to Arafat after Fajr", "Wuquf at Arafat — the heart of Hajj", "Du'a and dhikr", "After sunset — travel to Muzdalifah", "Night under open sky at Muzdalifah"] },
        { day: 16, title: "10th Dhul Hijjah — Eid ul Adha",        activities: ["Collect pebbles at Muzdalifah", "Travel to Mina before Fajr", "Rami Jamarat-al-Aqaba", "Qurbani (sacrifice)", "Halq/Qasr (shaving)", "Tawaf-e-Ifada & Sa'ee", "Return to Mina"] },
        { day: 17, title: "11th Dhul Hijjah — Mina",               activities: ["Rami — all 3 Jamarat after Zawwal", "Rest in Mina", "Ibadah and du'a"] },
        { day: 18, title: "12th Dhul Hijjah — Mina / Return",      activities: ["Rami — all 3 Jamarat", "Travel back to Makkah", "Tawaf-e-Wida (farewell tawaf)"] },
        { day: 22, title: "Return Journey",                         activities: ["Check-out from Makkah hotel", "Travel to Jeddah airport", "Board return flight", "Arrive home — Journey Completed! 🕊️"] },
      );
    } else {
      dayItinerary.push(
        { day: 1,  title: "Departure — Home to Airport",  activities: ["Report at airport 3 hours before departure", "Wear Ihram at Meeqat", "Board flight to Saudi Arabia"] },
        { day: 2,  title: "Arrival — Madinah / Makkah",   activities: ["Arrive at airport", "Transfer to hotel", "Rest and settle in"] },
        { day: 3,  title: "Madinah — Ziyarat",             activities: ["Masjid-e-Nabawi", "Raudah visit", "Historical sites tour"] },
        { day: 6,  title: "Makkah",                         activities: ["Travel to Makkah", "Check-in hotel near Haram", "Umrah: Tawaf + Sa'ee + Halq"] },
        { day: 7,  title: "Makkah — Ibadah",               activities: ["Prayers at Masjid-e-Haram", "Ziyarat of Makkah", "Shopping"] },
        { day: 10, title: "Return Journey",                 activities: ["Tawaf-e-Wida", "Transfer to airport", "Return flight home"] },
      );
    }

    // ── Generate PDF ────────────────────────────────────────────────────────
    const itineraryId = randomUUID();
    const pdfBuf = await generateTravelItineraryPdf({
      customerName:   booking.customer_name || "Valued Customer",
      bookingNumber:  booking.booking_number,
      bookingId,
      customerId:     booking.customer_id,
      packageName:    booking.package_name,
      packageType:    booking.package_type,
      groupName:      booking.group_name,
      departureFlight: outbound ? {
        flightNumber:  outbound.flight_number,
        airline:       outbound.airline,
        departureDate: outbound.departure_date,
        from:          outbound.departure_airport,
        to:            outbound.arrival_airport,
        departureTime: outbound.departure_time,
        arrivalTime:   outbound.arrival_time,
        terminal:      outbound.terminal,
      } : null,
      returnFlight: returnFl ? {
        flightNumber:  returnFl.flight_number,
        airline:       returnFl.airline,
        departureDate: returnFl.departure_date,
        from:          returnFl.departure_airport,
        to:            returnFl.arrival_airport,
        departureTime: returnFl.departure_time,
        arrivalTime:   returnFl.arrival_time,
        terminal:      returnFl.terminal,
      } : null,
      hotels: hotelRows.map((h: any) => ({
        name:       h.name,
        city:       h.city,
        stars:      h.stars,
        address:    h.address,
        checkIn:    h.check_in_date,
        checkOut:   h.check_out_date,
        roomNumber: h.room_number,
      })),
      dayItinerary,
      pilgrims: pilgrims.map((p: any) => ({ name: p.full_name, passportNumber: p.passport_number })),
      emergencyContact: booking.emergency_contact_name
        ? `${booking.emergency_contact_name} — ${booking.emergency_contact_mobile || ""}`
        : null,
      guideContact: null,
      itineraryId,
      issuedAt: new Date(),
    });

    // ── Upload & store ──────────────────────────────────────────────────────
    const fileName = `Itinerary-${booking.booking_number}.pdf`;
    const fileUrl  = await uploadToGCS(pdfBuf, fileName, "application/pdf", "itineraries");
    const docId    = randomUUID();

    await pool.query(
      `INSERT INTO documents
         (id, booking_id, customer_id, document_type, file_name, original_filename,
          file_key, file_url, file_size, mime_type, uploaded_by,
          is_visible_to_customer, notification_sent, created_at)
       VALUES ($1,$2,$3,'tour_itinerary',$4,$4,$5,$5,$6,'application/pdf','admin',true,false,NOW())`,
      [docId, bookingId, booking.customer_id, fileName, fileUrl, pdfBuf.length]
    );

    console.log(`[Itinerary] ✅ Generated ${fileName} (${pdfBuf.length} bytes)`);

    // ── Deliver to customer (fire-and-forget) ───────────────────────────────
    if (booking.mobile) {
      sendDocumentToCustomer({
        docId, bookingId, bookingNumber: booking.booking_number,
        customerId: booking.customer_id,
        customerName: booking.customer_name || "Valued Customer",
        customerMobile: booking.mobile,
        customerEmail: booking.email || undefined,
        documentType: "tour_itinerary",
        fileName, fileUrl,
        mimeType: "application/pdf",
        packageName: booking.package_name,
      }).catch((e: any) => console.warn("[Itinerary] Delivery warning:", e?.message));
    }

    res.json({ ok: true, docId, fileUrl, fileName, message: "Travel itinerary generated and sent to customer." });
  } catch (err: any) {
    console.error("[Itinerary] Error:", err?.message, err?.stack?.slice(0, 300));
    res.status(500).json({ error: err.message });
  }
});

export default router;
