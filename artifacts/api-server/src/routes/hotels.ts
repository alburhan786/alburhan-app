import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireModuleAccess, type AuthenticatedRequest } from "../lib/auth.js";
import { randomUUID } from "crypto";
import { fireNotificationEvent } from "../lib/notificationEngine.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";
import { generateHotelVoucherPdf } from "../lib/hotelVoucherPdf.js";
import { generateRoomAllocationPdf } from "../lib/roomAllocationPdf.js";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { sendDocumentToCustomer } from "../lib/documentDelivery.js";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

// ── PUBLIC: QR verification (no auth required — must be before requireModuleAccess) ──
router.get("/verify-assignment/:docId", async (req, res) => {
  try {
    // Join via documents → bookings only; parse pilgrim name from filename
    const { rows } = await pool.query(
      `SELECT d.id, d.file_url, d.file_name, d.created_at, d.document_type,
              b.booking_number, b.customer_name,
              b.package_name, b.id AS booking_id
       FROM documents d
       LEFT JOIN bookings b ON b.id = d.booking_id
       WHERE d.id = $1
         AND d.document_type IN ('hotel_voucher','room_allotment')
         AND d.is_revoked = FALSE
       LIMIT 1`,
      [req.params.docId]
    );
    const row = rows[0];
    if (!row) return void res.status(404).json({ error: "Assignment not found" });

    // Try to extract extra details from the stored filename
    // e.g. "Hotel-Voucher-AB1234-JOHN-DOE.pdf" or "Room-Allocation-AB1234-JOHN-DOE.pdf"
    const nameParts = (row.file_name || "").replace(/\.pdf$/i, "").split("-");
    const pilgrimName = nameParts.length >= 4
      ? nameParts.slice(3).join(" ").replace(/-/g, " ")
      : row.customer_name || "—";

    return res.json({
      pilgrimName,
      bookingNumber: row.booking_number || "—",
      hotelName:     null,
      hotelCity:     null,
      hotelAddress:  null,
      roomNumber:    null,
      floorNumber:   null,
      bedType:       null,
      checkInDate:   null,
      checkOutDate:  null,
      groupName:     null,
      maktabNumber:  null,
      issuedAt:      row.created_at || null,
      documentType:  row.document_type,
      fileUrl:       row.file_url || null,
      verified:      true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireModuleAccess("groups") as any);

const CITIES = ["Makkah", "Madinah", "Aziziah", "Mina", "Arafat", "Other"];

// GET all hotels
router.get("/", requireAdmin as any, async (req, res) => {
  const { groupId, city, includeDeleted } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conds: string[] = [];
  if (!includeDeleted) conds.push("h.is_deleted = false");
  if (groupId) { params.push(groupId); conds.push(`h.group_id = $${params.length}`); }
  if (city) { params.push(city); conds.push(`h.city = $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  try {
    const result = await pool.query(
      `SELECT h.*,
        hg.group_name,
        (SELECT COUNT(*)::int FROM hotel_rooms r WHERE r.hotel_id = h.id AND r.is_deleted = false) AS room_count,
        (SELECT COUNT(*)::int FROM pilgrim_room_assignments ra WHERE ra.hotel_id = h.id) AS assigned_count
       FROM hotels h
       LEFT JOIN hajj_groups hg ON hg.id = h.group_id
       ${where}
       ORDER BY h.city, h.name`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error("[hotels] GET / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET rooms for a hotel
router.get("/:hotelId/rooms", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*)::int FROM pilgrim_room_assignments ra WHERE ra.room_id = r.id) AS assigned_count
       FROM hotel_rooms r
       WHERE r.hotel_id = $1 AND r.is_deleted = false
       ORDER BY r.floor NULLS LAST, r.room_number`,
      [req.params.hotelId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET room assignments for a hotel
router.get("/:hotelId/assignments", requireAdmin as any, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ra.*, p.full_name, p.mobile_india, p.family_id,
        r.room_number, r.floor, r.bed_type
       FROM pilgrim_room_assignments ra
       JOIN pilgrims p ON p.id = ra.pilgrim_id
       JOIN hotel_rooms r ON r.id = ra.room_id
       WHERE ra.hotel_id = $1
       ORDER BY r.floor NULLS LAST, r.room_number, p.full_name`,
      [req.params.hotelId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create hotel
router.post("/", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { name, city, address, stars, groupId, checkInDate, checkOutDate, totalRooms, contactPhone, notes } = req.body;
  if (!name || !city) return void res.status(400).json({ error: "Name and city are required" });
  if (city && !CITIES.includes(city)) return void res.status(400).json({ error: "Invalid city" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO hotels (id, name, city, address, stars, group_id, check_in_date, check_out_date, total_rooms, contact_phone, notes, is_deleted, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,NOW(),NOW()) RETURNING *`,
      [id, name, city, address||null, stars||null, groupId||null, checkInDate||null, checkOutDate||null, totalRooms||null, contactPhone||null, notes||null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("[hotels] POST / error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update hotel
router.put("/:id", requireAdmin as any, async (req, res) => {
  const { name, city, address, stars, groupId, checkInDate, checkOutDate, totalRooms, contactPhone, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE hotels SET name=$1, city=$2, address=$3, stars=$4, group_id=$5, check_in_date=$6, check_out_date=$7,
        total_rooms=$8, contact_phone=$9, notes=$10, updated_at=NOW()
       WHERE id=$11 AND is_deleted=false RETURNING *`,
      [name, city, address||null, stars||null, groupId||null, checkInDate||null, checkOutDate||null, totalRooms||null, contactPhone||null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return void res.status(404).json({ error: "Hotel not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (soft delete)
router.delete("/:id", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `UPDATE hotels SET is_deleted=true, deleted_at=NOW(), deleted_by=$1, updated_at=NOW() WHERE id=$2`,
      [req.user?.name || "admin", req.params.id]
    );
    res.json({ message: "Hotel moved to trash" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST restore
router.post("/:id/restore", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE hotels SET is_deleted=false, deleted_at=NULL, deleted_by=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: "Hotel restored" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST add room
router.post("/:hotelId/rooms", requireAdmin as any, async (req, res) => {
  const { roomNumber, floor, capacity, bedType, notes } = req.body;
  if (!roomNumber) return void res.status(400).json({ error: "Room number required" });
  try {
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO hotel_rooms (id, hotel_id, room_number, floor, capacity, bed_type, notes, is_deleted, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW()) RETURNING *`,
      [id, req.params.hotelId, roomNumber, floor||null, capacity||2, bedType||"Double", notes||null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE room
router.delete("/:hotelId/rooms/:roomId", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(`UPDATE hotel_rooms SET is_deleted=true WHERE id=$1 AND hotel_id=$2`, [req.params.roomId, req.params.hotelId]);
    res.json({ message: "Room deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign pilgrim to room
router.post("/:hotelId/rooms/:roomId/assign", requireAdmin as any, async (req, res) => {
  const { pilgrimId } = req.body;
  if (!pilgrimId) return void res.status(400).json({ error: "pilgrimId required" });
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO pilgrim_room_assignments (id, hotel_id, room_id, pilgrim_id, assigned_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (pilgrim_id, hotel_id) DO UPDATE SET room_id=EXCLUDED.room_id, assigned_at=NOW()`,
      [id, req.params.hotelId, req.params.roomId, pilgrimId]
    );
    res.json({ message: "Assigned" });

    // ── Background: notifications + auto-generate hotel voucher PDF ───────────
    setImmediate(async () => {
      try {
        const [pRes, hRes, rRes] = await Promise.all([
          pool.query(
            `SELECT p.id, p.full_name, p.mobile_india, p.booking_id, p.group_id,
                    b.booking_number, b.customer_id, b.package_name,
                    u.email AS customer_email, u.mobile AS customer_mobile_user,
                    hg.group_name, hg.maktab_number
             FROM pilgrims p
             LEFT JOIN bookings b ON b.id = p.booking_id
             LEFT JOIN users u ON u.id = b.customer_id
             LEFT JOIN hajj_groups hg ON hg.id = p.group_id
             WHERE p.id = $1`,
            [pilgrimId]
          ),
          pool.query(
            `SELECT h.name, h.city, h.address, h.stars, h.contact_phone,
                    h.check_in_date, h.check_out_date
             FROM hotels h WHERE h.id = $1`,
            [req.params.hotelId]
          ),
          pool.query(
            `SELECT r.room_number, r.floor, r.capacity, r.bed_type
             FROM hotel_rooms r WHERE r.id = $1`,
            [req.params.roomId]
          ),
        ]);

        const p = pRes.rows[0];
        const h = hRes.rows[0];
        const r = rRes.rows[0];
        if (!p || !h || !r) return;

        const hotelName   = h.name;
        const roomNumber  = r.room_number;
        const bookingId   = p.booking_id;
        const bookingNum  = p.booking_number || bookingId?.slice(-8).toUpperCase() || "—";
        const customerId  = p.customer_id;
        const mobile      = p.mobile_india || p.customer_mobile_user || "";
        const email       = p.customer_email || "";

        // ── Notifications ──────────────────────────────────────────────────
        fireNotificationEvent("room_assigned", {
          customerName: p.full_name, customerMobile: mobile, hotelName, roomNumber,
          customerId, bookingId,
        }).catch(() => {});
        triggerWorkflow("hotel_assigned", {
          customerName: p.full_name, customerMobile: mobile, pilgramName: p.full_name,
          bookingId, bookingNumber: bookingNum, hotelName, roomNumber, customerId,
          packageName: p.package_name,
        }).catch(() => {});

        // ── Generate Hotel Voucher PDF ─────────────────────────────────────
        const voucherId = randomUUID();
        try {
          const pdfBuf = await generateHotelVoucherPdf({
            pilgrimName:   p.full_name,
            bookingNumber: bookingNum,
            bookingId:     bookingId || voucherId,
            customerId,
            hotelName:     h.name,
            hotelCity:     h.city,
            hotelAddress:  h.address,
            hotelStars:    h.stars,
            hotelPhone:    h.contact_phone,
            roomNumber:    r.room_number,
            floorNumber:   r.floor,
            bedType:       r.bed_type,
            roomCapacity:  r.capacity,
            checkInDate:   h.check_in_date,
            checkOutDate:  h.check_out_date,
            groupName:     p.group_name,
            maktabNumber:  p.maktab_number,
            voucherId,
            issuedAt:      new Date(),
          });

          const fileName = `Hotel-Voucher-${bookingNum}-${p.full_name.replace(/\s+/g, "-")}.pdf`;
          const fileUrl  = await uploadToGCS(pdfBuf, fileName, "application/pdf", "hotel_vouchers");
          const docId    = randomUUID();

          await pool.query(
            `INSERT INTO documents
               (id, booking_id, customer_id, document_type, file_name, original_filename,
                file_key, file_url, file_size, mime_type, uploaded_by,
                is_visible_to_customer, notification_sent, created_at)
             VALUES ($1,$2,$3,'hotel_voucher',$4,$4,$5,$5,$6,'application/pdf','admin',true,false,NOW())
             ON CONFLICT DO NOTHING`,
            [docId, bookingId, customerId, fileName, fileUrl, pdfBuf.length]
          );
          console.log(`[Hotels] ✅ Hotel voucher PDF generated — ${fileName} (${pdfBuf.length} bytes)`);

          // ── Deliver to customer ──────────────────────────────────────────
          if (mobile) {
            await sendDocumentToCustomer({
              docId, bookingId: bookingId || "", bookingNumber: bookingNum,
              customerId, customerName: p.full_name, customerMobile: mobile,
              customerEmail: email || undefined,
              documentType: "hotel_voucher", fileName, fileUrl,
              mimeType: "application/pdf",
              packageName: p.package_name,
            });
          }
        } catch (pdfErr: any) {
          console.error("[Hotels] ❌ Hotel voucher PDF failed:", pdfErr?.message);
        }

        // ── Generate Room Allocation Letter PDF ────────────────────────────
        try {
          const allocBuf = await generateRoomAllocationPdf({
            pilgrimName:   p.full_name,
            bookingNumber: bookingNum,
            bookingId:     bookingId || randomUUID(),
            customerId,
            hotelName:     h.name,
            hotelCity:     h.city,
            hotelAddress:  h.address,
            roomNumber:    r.room_number,
            floorNumber:   r.floor,
            bedType:       r.bed_type,
            roomCapacity:  r.capacity,
            checkInDate:   h.check_in_date,
            checkOutDate:  h.check_out_date,
            groupName:     p.group_name,
            maktabNumber:  p.maktab_number,
            issuedAt:      new Date(),
          });
          const allocName = `Room-Allocation-${bookingNum}-${p.full_name.replace(/\s+/g, "-")}.pdf`;
          const allocUrl  = await uploadToGCS(allocBuf, allocName, "application/pdf", "room_allocations");
          const allocDocId = randomUUID();
          await pool.query(
            `INSERT INTO documents
               (id, booking_id, customer_id, document_type, file_name, original_filename,
                file_key, file_url, file_size, mime_type, uploaded_by,
                is_visible_to_customer, notification_sent, created_at)
             VALUES ($1,$2,$3,'room_allotment',$4,$4,$5,$5,$6,'application/pdf','admin',true,false,NOW())
             ON CONFLICT DO NOTHING`,
            [allocDocId, bookingId, customerId, allocName, allocUrl, allocBuf.length]
          );
          console.log(`[Hotels] ✅ Room allocation letter generated — ${allocName}`);
          if (mobile) {
            await sendDocumentToCustomer({
              docId: allocDocId, bookingId: bookingId || "", bookingNumber: bookingNum,
              customerId, customerName: p.full_name, customerMobile: mobile,
              customerEmail: email || undefined,
              documentType: "room_allotment", fileName: allocName, fileUrl: allocUrl,
              mimeType: "application/pdf", packageName: p.package_name,
            });
          }
        } catch (allocErr: any) {
          console.error("[Hotels] ❌ Room allocation letter failed:", allocErr?.message);
        }
      } catch (bgErr: any) {
        console.error("[Hotels] Background task error:", bgErr?.message);
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE pilgrim assignment
router.delete("/:hotelId/rooms/:roomId/assign/:pilgrimId", requireAdmin as any, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM pilgrim_room_assignments WHERE hotel_id=$1 AND room_id=$2 AND pilgrim_id=$3`,
      [req.params.hotelId, req.params.roomId, req.params.pilgrimId]
    );
    res.json({ message: "Unassigned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
