// @ts-nocheck
import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();

// ── Search customers + leads ───────────────────────────────────────────────
router.get("/search", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ users: [], leads: [] });
    const like = `%${q}%`;
    const [usersR, leadsR] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.mobile, u.email, u.created_at,
               cp.photo_url, cp.passport_number, cp.kyc_status
        FROM users u
        LEFT JOIN customer_profiles cp ON cp.user_id = u.id
        WHERE u.role = 'customer'
          AND (u.name ILIKE $1 OR u.mobile ILIKE $1 OR u.email ILIKE $1
               OR cp.passport_number ILIKE $1 OR cp.aadhar_number ILIKE $1)
        ORDER BY u.created_at DESC LIMIT 20
      `, [like]),
      pool.query(`
        SELECT id, name, mobile, email, source, status, platform, created_at, lead_score
        FROM leads WHERE mobile ILIKE $1 OR name ILIKE $1 OR email ILIKE $1
        ORDER BY created_at DESC LIMIT 20
      `, [like]),
    ]);
    res.json({ users: usersR.rows, leads: leadsR.rows });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Helper: build mobile LIKE pattern ─────────────────────────────────────
function mobileLike(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(-10);
  return `%${digits}`;
}

// ── Full profile by user mobile ────────────────────────────────────────────
router.get("/user/:mobile", requireAdmin, async (req, res) => {
  try {
    const pattern = mobileLike(req.params.mobile);

    const [userR, bookingsR, paymentsR, docsR, msgsInR, msgsOutR,
           leadsR, agreementsR, invoicesR, loyaltyR, timelineR] = await Promise.all([

      // User + customer_profile join (profile table may not exist — handle gracefully)
      pool.query(`
        SELECT u.id, u.name, u.mobile, u.email, u.role,
               u.blood_group, u.emergency_contact_name, u.emergency_contact_mobile,
               u.created_at,
               cp.whatsapp_number, cp.date_of_birth, cp.gender, cp.address, cp.city,
               cp.state, cp.country, cp.nationality, cp.father_name,
               cp.passport_number, cp.passport_expiry, cp.passport_place_of_issue,
               cp.photo_url, cp.aadhar_number, cp.pan_number, cp.kyc_status, cp.admin_notes,
               COALESCE(cp.blood_group, u.blood_group) AS blood_group_full
        FROM users u
        LEFT JOIN customer_profiles cp ON cp.user_id = u.id
        WHERE u.mobile LIKE $1 AND u.role = 'customer'
        LIMIT 1
      `, [pattern]),

      // Bookings
      pool.query(`
        SELECT id, booking_number, package_name, status, total_amount, final_amount,
               paid_amount, advance_amount, discount_amount, number_of_pilgrims, room_type,
               preferred_departure_date, journey_status, group_id, invoice_number,
               notes, created_at, updated_at
        FROM bookings WHERE customer_mobile LIKE $1 AND (is_deleted IS NOT TRUE)
        ORDER BY created_at DESC LIMIT 30
      `, [pattern]),

      // Payment transactions
      pool.query(`
        SELECT pt.id, pt.booking_id, pt.amount, pt.payment_date, pt.payment_mode,
               pt.reference_number, pt.bank_name, pt.received_by, pt.notes, pt.created_at,
               b.booking_number, b.package_name
        FROM payment_transactions pt
        JOIN bookings b ON b.id = pt.booking_id
        WHERE b.customer_mobile LIKE $1 AND (pt.is_deleted IS NOT TRUE)
        ORDER BY pt.created_at DESC LIMIT 50
      `, [pattern]),

      // Documents
      pool.query(`
        SELECT d.id, d.document_type, d.file_name, d.file_url, d.uploaded_by, d.created_at,
               b.booking_number
        FROM documents d
        JOIN bookings b ON b.id = d.booking_id
        WHERE b.customer_mobile LIKE $1
        ORDER BY d.created_at DESC LIMIT 50
      `, [pattern]),

      // Incoming messages
      pool.query(`
        SELECT id, platform, message_text, message_type, direction, is_internal_note,
               sender_name, created_at, raw_data
        FROM social_messages WHERE sender_phone LIKE $1
        ORDER BY created_at DESC LIMIT 100
      `, [pattern]),

      // Outgoing notifications
      pool.query(`
        SELECT id, channel, event_type, message, status, created_at
        FROM notification_logs WHERE recipient LIKE $1
        ORDER BY created_at DESC LIMIT 100
      `, [pattern]),

      // Leads
      pool.query(`
        SELECT id, name, mobile, email, source, status, message, package_interest,
               budget, assigned_to, assigned_name, follow_up_date, notes,
               conversion_booking_id, converted_at, created_at, updated_at,
               lead_score, priority, platform, conversation_count, tags, inbox_status
        FROM leads WHERE mobile LIKE $1
        ORDER BY created_at DESC LIMIT 10
      `, [pattern]),

      // Agreements
      pool.query(`
        SELECT a.id, a.agreement_number, a.status, a.signed_at, a.created_at,
               a.booking_id, COALESCE(b.booking_number, '') AS booking_number
        FROM agreements a
        LEFT JOIN bookings b ON b.id = a.booking_id
        WHERE b.customer_mobile LIKE $1
           OR a.customer_id IN (SELECT id FROM users WHERE mobile LIKE $1)
        ORDER BY a.created_at DESC LIMIT 10
      `, [pattern]),

      // Invoices
      pool.query(`
        SELECT i.id, i.invoice_number, i.total, i.paid, i.balance,
               i.invoice_status, i.invoice_date, i.due_date,
               COALESCE(b.booking_number, '') AS booking_number
        FROM invoices i
        LEFT JOIN bookings b ON b.id = i.booking_id
        WHERE b.customer_mobile LIKE $1
           OR i.customer_id IN (SELECT id FROM users WHERE mobile LIKE $1)
        ORDER BY i.created_at DESC LIMIT 20
      `, [pattern]),

      // Loyalty
      pool.query(`
        SELECT total_points, redeemed_points, tier, bookings_count, total_spent, last_activity
        FROM loyalty_points WHERE customer_mobile LIKE $1 LIMIT 1
      `, [pattern]),

      // Timeline
      pool.query(`
        SELECT id, event_type, title, description, metadata, created_at
        FROM customer_timeline
        WHERE customer_id IN (SELECT id FROM users WHERE mobile LIKE $1)
        ORDER BY created_at DESC LIMIT 150
      `, [pattern]),
    ]);

    const user      = userR.rows[0] || null;
    const bookings  = bookingsR.rows;
    const payments  = paymentsR.rows;

    // Travel: pilgrims + flights from booking groups
    let travelData: { pilgrims: any[]; flights: any[] } = { pilgrims: [], flights: [] };
    const groupIds = bookings.filter(b => b.group_id).map(b => b.group_id);
    if (groupIds.length > 0) {
      const [pilgR, flightR] = await Promise.all([
        pool.query(`
          SELECT full_name, passport_number, visa_number, visa_status, visa_type,
                 visa_applied_date, visa_received_date,
                 room_number, room_type, room_hotel, bus_number, seat_number, group_id
          FROM pilgrims WHERE group_id = ANY($1) LIMIT 30
        `, [groupIds]),
        pool.query(`
          SELECT flight_type, airline, flight_number, pnr, departure_airport, arrival_airport,
                 departure_date, departure_time, arrival_date, arrival_time, baggage_allowance, group_id
          FROM group_flights WHERE group_id = ANY($1)
          ORDER BY departure_date LIMIT 20
        `, [groupIds]),
      ]);
      travelData = { pilgrims: pilgR.rows, flights: flightR.rows };
    }

    // Health score
    const health = healthScore({ user, bookings, payments, docs: docsR.rows, leads: leadsR.rows, comms: msgsInR.rows });

    // Merge and sort all communications chronologically
    const allComms = [
      ...msgsInR.rows.map(m => ({ ...m, dir: m.direction || "in", kind: "message" })),
      ...msgsOutR.rows.map(m => ({ ...m, dir: "out", kind: "notification", platform: m.channel })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      user,
      bookings,
      payments,
      documents: docsR.rows,
      communications: allComms,
      leads: leadsR.rows,
      agreements: agreementsR.rows,
      invoices: invoicesR.rows,
      loyalty: loyaltyR.rows[0] || null,
      timeline: timelineR.rows,
      travel: travelData,
      health,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Profile by lead ID (resolves to user profile if mobile matches) ────────
router.get("/lead/:leadId", requireAdmin, async (req, res) => {
  try {
    const leadR = await pool.query(`SELECT * FROM leads WHERE id = $1`, [req.params.leadId]);
    if (!leadR.rows[0]) return res.status(404).json({ message: "Lead not found" });
    const lead = leadR.rows[0];

    if (lead.mobile) {
      const pattern = mobileLike(lead.mobile);
      const userR = await pool.query(`SELECT id FROM users WHERE mobile LIKE $1 AND role='customer' LIMIT 1`, [pattern]);
      if (userR.rows[0]) {
        // Forward to full user profile
        const r = await fetch(`http://localhost:${process.env.PORT || 3000}/api/customer360/user/${lead.mobile}`, {
          headers: { cookie: (req as any).headers.cookie || "" }
        });
        const data = await r.json();
        return res.json(data);
      }
    }

    // Lead-only profile (no matching user)
    const health = healthScore({ user: null, bookings: [], payments: [], docs: [], leads: [lead], comms: [] });
    res.json({
      user: null, bookings: [], payments: [], documents: [],
      communications: [], leads: [lead], agreements: [], invoices: [],
      loyalty: null, timeline: [], travel: { pilgrims: [], flights: [] }, health,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Add note/timeline entry ────────────────────────────────────────────────
router.post("/user/:mobile/note", requireAdmin, async (req, res) => {
  try {
    const { note, category = "general" } = req.body;
    if (!note) return res.status(400).json({ message: "note required" });
    const pattern = mobileLike(req.params.mobile);
    const userR = await pool.query(`SELECT id FROM users WHERE mobile LIKE $1 LIMIT 1`, [pattern]);
    if (!userR.rows[0]) return res.status(404).json({ message: "User not found" });
    const id = `ct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO customer_timeline (id, customer_id, event_type, title, description, created_at)
       VALUES ($1, $2, 'note', $3, $4, NOW())`,
      [id, userR.rows[0].id, `Note (${category})`, note]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Normalise channel string to canonical type ─────────────────────────────
function normalizeChannel(raw: string): string {
  if (!raw) return "system";
  const r = raw.toLowerCase();
  if (r === "whatsapp" || r === "wa") return "whatsapp";
  if (r === "sms" || r === "dlt") return "sms";
  if (r === "email") return "email";
  if (r === "facebook" || r === "fb" || r === "messenger") return "facebook";
  if (r === "instagram" || r === "ig") return "instagram";
  if (r === "telegram" || r === "tg") return "telegram";
  if (r === "rcs") return "rcs";
  if (r === "website_contact" || r === "website_livechat" || r === "web") return "web";
  return "system";
}

// ── Unified paginated communication timeline ───────────────────────────────
router.get("/user/:mobile/timeline-full", requireAdmin, async (req, res) => {
  try {
    const pattern = mobileLike(req.params.mobile);
    const page    = Math.max(1, parseInt(String(req.query.page  || "1")));
    const limit   = Math.min(Math.max(1, parseInt(String(req.query.limit || "50"))), 200);
    const channel = String(req.query.channel || "all");
    const offset  = (page - 1) * limit;

    const userR = await pool.query(
      `SELECT id FROM users WHERE mobile LIKE $1 LIMIT 1`, [pattern]
    );
    const userId = userR.rows[0]?.id ?? null;

    const [notifR, socialR, timelineR] = await Promise.all([
      pool.query(`
        SELECT id, channel AS channel_type, event_type, message AS content, status,
               'out'::text AS direction, created_at, 'notification'::text AS source
        FROM notification_logs WHERE recipient LIKE $1
        ORDER BY created_at DESC LIMIT 300
      `, [pattern]),

      pool.query(`
        SELECT sm.id, sm.platform AS channel_type, sm.message_text AS content,
               COALESCE(sm.direction, 'in') AS direction,
               sm.message_type, sm.sender_name, sm.created_at,
               'social'::text AS source, sm.is_internal_note
        FROM social_messages sm
        WHERE sm.sender_phone LIKE $1
           OR sm.lead_id IN (SELECT id FROM leads WHERE mobile LIKE $1)
        ORDER BY sm.created_at DESC LIMIT 300
      `, [pattern]),

      userId
        ? pool.query(`
            SELECT id, event_type AS channel_type, title,
                   COALESCE(description,'') AS content,
                   'out'::text AS direction, created_at, 'timeline'::text AS source
            FROM customer_timeline WHERE customer_id = $1
            ORDER BY created_at DESC LIMIT 150
          `, [userId])
        : Promise.resolve({ rows: [] }),
    ]);

    const notifs = (notifR.rows as any[]).map(r => ({
      id: `notif-${r.id}`,
      type: normalizeChannel(r.channel_type),
      direction: "out" as const,
      content: String(r.content || r.event_type || ""),
      status: r.status,
      event_type: r.event_type,
      is_internal_note: false,
      sender_name: null,
      created_at: r.created_at,
      source: "notification",
    }));

    const socials = (socialR.rows as any[]).map(r => ({
      id: `social-${r.id}`,
      type: normalizeChannel(r.channel_type),
      direction: (r.direction === "incoming" || r.direction === "in") ? "in" as const : "out" as const,
      content: String(r.content || ""),
      status: null,
      event_type: r.message_type ?? null,
      is_internal_note: Boolean(r.is_internal_note),
      sender_name: r.sender_name ?? null,
      created_at: r.created_at,
      source: "social",
    }));

    const sysEvents = (timelineR.rows as any[]).map(r => ({
      id: `tl-${r.id}`,
      type: "system" as const,
      direction: "out" as const,
      content: r.title ? `${r.title}${r.content ? `: ${r.content}` : ""}` : String(r.content || ""),
      status: null,
      event_type: r.channel_type,
      is_internal_note: false,
      sender_name: null,
      created_at: r.created_at,
      source: "timeline",
    }));

    const seen = new Set<string>();
    const all = [...notifs, ...socials, ...sysEvents]
      .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
      .filter(e => channel === "all" || e.type === channel)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    res.json({ items: all.slice(offset, offset + limit), total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── By-ID unified timeline (spec: GET /api/customers/:id/timeline-full) ────
router.get("/by-id/:id/timeline-full", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const page    = Math.max(1, parseInt(String(req.query.page  || "1")));
    const limit   = Math.min(Math.max(1, parseInt(String(req.query.limit || "50"))), 200);
    const channel = String(req.query.channel || "all");
    const offset  = (page - 1) * limit;

    // Look up mobile + email by user ID
    const userR = await pool.query(
      `SELECT mobile, email FROM users WHERE id = $1 LIMIT 1`, [id]
    );
    if (!userR.rows[0]) return res.status(404).json({ message: "Customer not found" });

    const { mobile, email } = userR.rows[0];
    const pattern = mobileLike(mobile || "");

    const [notifR, socialR, timelineR] = await Promise.all([
      pool.query(`
        SELECT id, channel AS channel_type, event_type, message AS content, status,
               'out'::text AS direction, created_at, 'notification'::text AS source
        FROM notification_logs
        WHERE recipient LIKE $1
           OR ($2 IS NOT NULL AND recipient = $2)
        ORDER BY created_at DESC LIMIT 300
      `, [pattern, email || null]),

      pool.query(`
        SELECT sm.id, sm.platform AS channel_type, sm.message_text AS content,
               COALESCE(sm.direction, 'in') AS direction,
               sm.message_type, sm.sender_name, sm.created_at,
               'social'::text AS source, sm.is_internal_note
        FROM social_messages sm
        WHERE sm.sender_phone LIKE $1
           OR sm.lead_id IN (SELECT id FROM leads WHERE mobile LIKE $1)
        ORDER BY sm.created_at DESC LIMIT 300
      `, [pattern]),

      pool.query(`
        SELECT id, event_type AS channel_type, title,
               COALESCE(description,'') AS content,
               'out'::text AS direction, created_at, 'timeline'::text AS source
        FROM customer_timeline WHERE customer_id = $1
        ORDER BY created_at DESC LIMIT 150
      `, [id]),
    ]);

    const notifs = (notifR.rows as any[]).map(r => ({
      id: `notif-${r.id}`,
      type: normalizeChannel(r.channel_type),
      direction: "out" as const,
      content: String(r.content || r.event_type || ""),
      status: r.status,
      event_type: r.event_type,
      is_internal_note: false,
      sender_name: null,
      created_at: r.created_at,
      source: "notification",
    }));

    const socials = (socialR.rows as any[]).map(r => ({
      id: `social-${r.id}`,
      type: normalizeChannel(r.channel_type),
      direction: (r.direction === "incoming" || r.direction === "in") ? "in" as const : "out" as const,
      content: String(r.content || ""),
      status: null,
      event_type: r.message_type ?? null,
      is_internal_note: Boolean(r.is_internal_note),
      sender_name: r.sender_name ?? null,
      created_at: r.created_at,
      source: "social",
    }));

    const sysEvents = (timelineR.rows as any[]).map(r => ({
      id: `tl-${r.id}`,
      type: "system" as const,
      direction: "out" as const,
      content: r.title ? `${r.title}${r.content ? `: ${r.content}` : ""}` : String(r.content || ""),
      status: null,
      event_type: r.channel_type,
      is_internal_note: false,
      sender_name: null,
      created_at: r.created_at,
      source: "timeline",
    }));

    const seen = new Set<string>();
    const all = [...notifs, ...socials, ...sysEvents]
      .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
      .filter(e => channel === "all" || e.type === channel)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    res.json({ items: all.slice(offset, offset + limit), total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ── Health score calculator ────────────────────────────────────────────────
function healthScore({ user, bookings, payments, docs, leads, comms }: any) {
  const leadScore = leads.length > 0 ? 100 : 0;
  const bookingScore = Math.min(100, bookings.length * 30);
  const paymentScore = (() => {
    const active = bookings.filter((b: any) => ["confirmed", "approved", "partially_paid"].includes(b.status));
    if (!active.length) return bookings.length ? 50 : 0;
    const totalFinal = active.reduce((s: number, b: any) => s + parseFloat(b.final_amount || 0), 0);
    const totalPaid  = active.reduce((s: number, b: any) => s + parseFloat(b.paid_amount  || 0), 0);
    return totalFinal > 0 ? Math.round((totalPaid / totalFinal) * 100) : 100;
  })();
  const commScore = Math.min(100, comms.length * 5);
  const docScore  = Math.min(100, docs.length * 15);
  const profileScore = user ? (user.passport_number ? 80 : user.email ? 60 : 40) : 0;
  const overall = Math.round((leadScore + bookingScore + paymentScore + commScore + docScore + profileScore) / 6);
  return { leadScore, bookingScore, paymentScore, commScore, docScore, profileScore, overall };
}

export default router;
