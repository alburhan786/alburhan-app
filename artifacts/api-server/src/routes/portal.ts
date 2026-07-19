// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function branchGuard(req: any, res: any): boolean {
  if (req.user?.role !== "branch_manager") {
    res.status(403).json({ message: "Branch manager access required" });
    return false;
  }
  return true;
}

function agentGuard(req: any, res: any): boolean {
  if (req.user?.role !== "agent") {
    res.status(403).json({ message: "Agent access required" });
    return false;
  }
  return true;
}

async function getBranchForManager(mobile: string) {
  const r = await pool.query(`SELECT * FROM branches WHERE manager_mobile=$1 LIMIT 1`, [mobile]);
  return r.rows[0] || null;
}

async function getAgentForUser(mobile: string) {
  const r = await pool.query(
    `SELECT a.*, b.name AS branch_name, b.city AS branch_city
     FROM agents a LEFT JOIN branches b ON b.id = a.branch_id
     WHERE a.mobile=$1 LIMIT 1`,
    [mobile]
  );
  return r.rows[0] || null;
}

// ── Branch Manager Portal — Dashboard ────────────────────────────────────────
router.get("/branch", requireAuth as any, async (req: any, res) => {
  if (!branchGuard(req, res)) return;
  try {
    const mobile = req.user.mobile;
    const [branchRes, statsRes, revenueRes, agentsRes, recentBookings] = await Promise.all([
      pool.query(`SELECT * FROM branches WHERE manager_mobile=$1 LIMIT 1`, [mobile]).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT b.status, COUNT(*)::int AS cnt
         FROM bookings b JOIN agents a ON a.id = b.agent_id
         JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1 AND b.deleted_at IS NULL GROUP BY b.status`,
        [mobile]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COALESCE(SUM(pt.amount),0)::numeric AS total
         FROM payment_transactions pt JOIN bookings b ON b.id = pt.booking_id
         JOIN agents a ON a.id = b.agent_id JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1`,
        [mobile]
      ).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM agents a
         JOIN branches br ON br.id = a.branch_id
         WHERE br.manager_mobile=$1 AND a.is_active=true`,
        [mobile]
      ).catch(() => ({ rows: [{ cnt: 0 }] })),
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.total_amount,
                u.name AS customer_name, u.mobile AS customer_mobile,
                pk.name AS package_name, b.created_at
         FROM bookings b JOIN agents a ON a.id = b.agent_id
         JOIN branches br ON br.id = a.branch_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN packages pk ON pk.id = b.package_id
         WHERE br.manager_mobile=$1 AND b.deleted_at IS NULL
         ORDER BY b.created_at DESC LIMIT 20`,
        [mobile]
      ).catch(() => ({ rows: [] })),
    ]);

    const branch = branchRes.rows[0];
    if (!branch) {
      res.status(404).json({ message: "No branch found linked to your mobile. Please contact admin." });
      return;
    }
    const statusMap: Record<string, number> = {};
    statsRes.rows.forEach((r: any) => { statusMap[r.status] = r.cnt; });
    res.json({
      branch, statusMap,
      totalRevenue: Number(revenueRes.rows[0]?.total || 0),
      activeAgents: agentsRes.rows[0]?.cnt || 0,
      recentBookings: recentBookings.rows,
    });
  } catch (err: any) {
    console.error("[portal/branch]", err.message);
    res.status(500).json({ message: "Failed to load branch portal data" });
  }
});

// ── Branch Manager Portal — Agent Management ─────────────────────────────────

router.get("/branch/agents", requireAuth as any, async (req: any, res) => {
  if (!branchGuard(req, res)) return;
  try {
    const branch = await getBranchForManager(req.user.mobile);
    if (!branch) return void res.status(404).json({ message: "Branch not found" });
    const r = await pool.query(
      `SELECT a.*, 
              COALESCE(SUM(b.total_amount) FILTER (WHERE b.deleted_at IS NULL), 0)::numeric AS total_bookings_amount,
              COUNT(b.id) FILTER (WHERE b.deleted_at IS NULL)::int AS total_bookings
       FROM agents a
       LEFT JOIN bookings b ON b.agent_id = a.id
       WHERE a.branch_id = $1
       GROUP BY a.id
       ORDER BY a.is_active DESC, a.name`,
      [branch.id]
    );
    res.json({ agents: r.rows, branch });
  } catch (err: any) {
    console.error("[portal/branch/agents]", err.message);
    res.status(500).json({ message: "Failed to load agents" });
  }
});

router.post("/branch/agents", requireAuth as any, async (req: any, res) => {
  if (!branchGuard(req, res)) return;
  try {
    const branch = await getBranchForManager(req.user.mobile);
    if (!branch) return void res.status(404).json({ message: "Branch not found" });
    const { name, mobile, email, commission_rate = 0, notes } = req.body;
    if (!name?.trim()) return void res.status(400).json({ error: "Agent name is required" });
    if (!mobile?.trim()) return void res.status(400).json({ error: "Mobile is required" });
    const cleanMobile = mobile.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10);
    if (cleanMobile.length !== 10) return void res.status(400).json({ error: "Invalid mobile number" });

    // Check if agent mobile already exists in agents table for this branch
    const dup = await pool.query(`SELECT id FROM agents WHERE mobile=$1 AND branch_id=$2`, [cleanMobile, branch.id]);
    if (dup.rows.length > 0) return void res.status(409).json({ error: "Agent with this mobile already exists in this branch" });

    // Create user account with role=agent (if not exists)
    const existingUser = await pool.query(`SELECT id FROM users WHERE mobile=$1 LIMIT 1`, [cleanMobile]);
    if (existingUser.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (id, mobile, name, email, role, admin_role, is_active)
         VALUES (gen_random_uuid()::text, $1, $2, $3, 'agent', 'read_only', true)`,
        [cleanMobile, name.trim(), email || null]
      ).catch(() => {});
    } else {
      await pool.query(
        `UPDATE users SET role='agent', name=COALESCE($2, name), email=COALESCE($3, email) WHERE mobile=$1`,
        [cleanMobile, name.trim(), email || null]
      ).catch(() => {});
    }

    // Create agent record
    const agentResult = await pool.query(
      `INSERT INTO agents (name, mobile, email, branch_id, commission_rate, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [name.trim(), cleanMobile, email || null, branch.id, Number(commission_rate) || 0, notes || null]
    );
    res.json({ success: true, id: agentResult.rows[0].id });
  } catch (err: any) {
    console.error("[portal/branch/agents POST]", err.message);
    res.status(500).json({ message: "Failed to create agent" });
  }
});

router.put("/branch/agents/:id", requireAuth as any, async (req: any, res) => {
  if (!branchGuard(req, res)) return;
  try {
    const branch = await getBranchForManager(req.user.mobile);
    if (!branch) return void res.status(404).json({ message: "Branch not found" });
    const { name, email, commission_rate, notes } = req.body;
    // Ensure the agent belongs to this branch
    const agent = await pool.query(`SELECT id FROM agents WHERE id=$1 AND branch_id=$2`, [req.params.id, branch.id]);
    if (!agent.rows[0]) return void res.status(404).json({ error: "Agent not found in this branch" });
    await pool.query(
      `UPDATE agents SET name=COALESCE($1,name), email=COALESCE($2,email),
       commission_rate=COALESCE($3,commission_rate), notes=COALESCE($4,notes),
       updated_at=NOW() WHERE id=$5`,
      [name || null, email || null, commission_rate !== undefined ? Number(commission_rate) : null, notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error("[portal/branch/agents PUT]", err.message);
    res.status(500).json({ message: "Failed to update agent" });
  }
});

router.put("/branch/agents/:id/toggle", requireAuth as any, async (req: any, res) => {
  if (!branchGuard(req, res)) return;
  try {
    const branch = await getBranchForManager(req.user.mobile);
    if (!branch) return void res.status(404).json({ message: "Branch not found" });
    const agent = await pool.query(`SELECT id, is_active FROM agents WHERE id=$1 AND branch_id=$2`, [req.params.id, branch.id]);
    if (!agent.rows[0]) return void res.status(404).json({ error: "Agent not found" });
    const newActive = !agent.rows[0].is_active;
    await pool.query(`UPDATE agents SET is_active=$1, updated_at=NOW() WHERE id=$2`, [newActive, req.params.id]);
    res.json({ success: true, is_active: newActive });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to toggle agent status" });
  }
});

// ── Agent Portal — Dashboard ──────────────────────────────────────────────────
router.get("/agent", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const mobile = req.user.mobile;
    const [agentRes, statsRes, revenueRes, recentBookings] = await Promise.all([
      pool.query(
        `SELECT a.*, b.name AS branch_name, b.city AS branch_city
         FROM agents a LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.mobile=$1 LIMIT 1`,
        [mobile]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT b.status, COUNT(*)::int AS cnt FROM bookings b JOIN agents a ON a.id = b.agent_id
         WHERE a.mobile=$1 AND b.deleted_at IS NULL GROUP BY b.status`,
        [mobile]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT COALESCE(SUM(pt.amount),0)::numeric AS total
         FROM payment_transactions pt JOIN bookings b ON b.id = pt.booking_id
         JOIN agents a ON a.id = b.agent_id WHERE a.mobile=$1`,
        [mobile]
      ).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(
        `SELECT b.id, b.booking_number, b.status, b.total_amount,
                b.customer_name, b.customer_mobile, pk.name AS package_name, b.created_at
         FROM bookings b JOIN agents a ON a.id = b.agent_id
         LEFT JOIN packages pk ON pk.id = b.package_id
         WHERE a.mobile=$1 AND b.deleted_at IS NULL
         ORDER BY b.created_at DESC LIMIT 20`,
        [mobile]
      ).catch(() => ({ rows: [] })),
    ]);
    const agent = agentRes.rows[0];
    if (!agent) return void res.status(404).json({ message: "Agent profile not found. Please contact your branch manager." });
    const statusMap: Record<string, number> = {};
    statsRes.rows.forEach((r: any) => { statusMap[r.status] = r.cnt; });
    const totalRevenue = Number(revenueRes.rows[0]?.total || 0);
    const commissionEarned = (totalRevenue * Number(agent.commission_rate || 0)) / 100;
    res.json({ agent, statusMap, totalRevenue, commissionEarned, recentBookings: recentBookings.rows });
  } catch (err: any) {
    console.error("[portal/agent]", err.message);
    res.status(500).json({ message: "Failed to load agent portal data" });
  }
});

// ── Agent Portal — Packages (for booking creation) ────────────────────────────
router.get("/agent/packages", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const r = await pool.query(
      `SELECT id, name, type, price_per_person, duration, max_pilgrims
       FROM packages WHERE is_active=true ORDER BY type, name`
    );
    res.json({ packages: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load packages" });
  }
});

// ── Agent Portal — Create Booking ─────────────────────────────────────────────
router.post("/agent/bookings", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });

    const {
      customer_name, customer_mobile, customer_email,
      package_id, number_of_pilgrims = 1,
      preferred_departure_date, notes, room_type
    } = req.body;

    if (!customer_name?.trim()) return void res.status(400).json({ error: "Customer name is required" });
    if (!customer_mobile?.trim()) return void res.status(400).json({ error: "Customer mobile is required" });
    const cleanMobile = customer_mobile.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10);
    if (cleanMobile.length !== 10) return void res.status(400).json({ error: "Invalid customer mobile" });

    // Fetch package details
    let packageName = null;
    let totalAmount = 0;
    if (package_id) {
      const pkg = await pool.query(`SELECT name, price_per_person FROM packages WHERE id=$1`, [package_id]);
      if (pkg.rows[0]) {
        packageName = pkg.rows[0].name;
        totalAmount = Number(pkg.rows[0].price_per_person) * Number(number_of_pilgrims);
      }
    }

    // Find or create customer user
    let userId: string | null = null;
    const existingUser = await pool.query(`SELECT id FROM users WHERE mobile=$1 LIMIT 1`, [cleanMobile]);
    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id;
    } else {
      const newUser = await pool.query(
        `INSERT INTO users (id, mobile, name, email, role) VALUES (gen_random_uuid()::text, $1, $2, $3, 'customer') RETURNING id`,
        [cleanMobile, customer_name.trim(), customer_email || null]
      );
      userId = newUser.rows[0].id;
    }

    // Generate booking number: ABT-PRTL-{base36 timestamp}
    const bookingNumber = `ABT-${Date.now().toString(36).toUpperCase()}`;
    const bookingId = randomUUID();

    await pool.query(
      `INSERT INTO bookings
         (id, booking_number, customer_id, customer_name, customer_mobile, customer_email,
          package_id, package_name, number_of_pilgrims, preferred_departure_date,
          status, total_amount, agent_id, branch_id, notes, room_type, is_offline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,$14,$15,true)`,
      [
        bookingId, bookingNumber, userId,
        customer_name.trim(), cleanMobile, customer_email || null,
        package_id || null, packageName,
        Number(number_of_pilgrims) || 1,
        preferred_departure_date || null,
        totalAmount || null,
        agent.id, agent.branch_id || null,
        notes || null, room_type || null
      ]
    );

    res.json({ success: true, bookingId, bookingNumber });
  } catch (err: any) {
    console.error("[portal/agent/bookings POST]", err.message);
    res.status(500).json({ message: "Failed to create booking: " + err.message });
  }
});

// ── Agent Portal — Commissions Breakdown ───────────────────────────────────────
router.get("/agent/commissions", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });

    const r = await pool.query(
      `SELECT b.id, b.booking_number, b.status, b.total_amount,
              b.customer_name, b.customer_mobile, pk.name AS package_name, b.created_at,
              COALESCE(SUM(pt.amount),0)::numeric AS paid_amount,
              ($1::numeric * COALESCE(SUM(pt.amount),0) / 100)::numeric AS commission_amount
       FROM bookings b
       LEFT JOIN packages pk ON pk.id = b.package_id
       LEFT JOIN payment_transactions pt ON pt.booking_id = b.id
       WHERE b.agent_id = $2 AND b.deleted_at IS NULL
       GROUP BY b.id, pk.name
       ORDER BY b.created_at DESC`,
      [agent.commission_rate || 0, agent.id]
    );

    const totalCommission = r.rows.reduce((sum: number, row: any) => sum + Number(row.commission_amount), 0);
    res.json({
      commissionRate: Number(agent.commission_rate || 0),
      totalCommission,
      bookings: r.rows,
    });
  } catch (err: any) {
    console.error("[portal/agent/commissions]", err.message);
    res.status(500).json({ message: "Failed to load commissions" });
  }
});

// ── Agent Portal — Documents (list) ──────────────────────────────────────────
router.get("/agent/documents/:bookingId", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    // Verify booking belongs to this agent
    const booking = await pool.query(
      `SELECT id, booking_number, customer_name FROM bookings WHERE id=$1 AND agent_id=$2 AND deleted_at IS NULL`,
      [req.params.bookingId, agent.id]
    );
    if (!booking.rows[0]) return void res.status(403).json({ error: "Booking not found or not yours" });
    const docs = await pool.query(
      `SELECT id, document_type, file_name, file_url, uploaded_by, created_at, is_revoked
       FROM documents WHERE booking_id=$1 AND is_revoked=false ORDER BY created_at DESC`,
      [req.params.bookingId]
    );
    res.json({ booking: booking.rows[0], documents: docs.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load documents" });
  }
});

// ── Agent Portal — Upload Document ────────────────────────────────────────────
router.post("/agent/documents/:bookingId", requireAuth as any, upload.single("file"), async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const booking = await pool.query(
      `SELECT id, booking_number, customer_name FROM bookings WHERE id=$1 AND agent_id=$2 AND deleted_at IS NULL`,
      [req.params.bookingId, agent.id]
    );
    if (!booking.rows[0]) return void res.status(403).json({ error: "Booking not found or not yours" });
    if (!req.file) return void res.status(400).json({ error: "No file uploaded" });

    const { document_type = "other" } = req.body;
    const fileId = randomUUID();
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "bin";
    const fileKey = `portal-agent-docs/${fileId}.${ext}`;

    // Upload to object storage
    let fileUrl = "";
    try {
      const { objectStorage } = await import("../lib/objectStorage.js");
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (privateDir) {
        const fullPath = `${privateDir}/${fileKey}`;
        await objectStorage.uploadFileFromBuffer(req.file.buffer, fullPath, req.file.mimetype);
        fileUrl = `/api/documents/download/${fileId}`;
      }
    } catch (uploadErr: any) {
      console.error("[portal/agent/documents] upload error:", uploadErr.message);
      // Continue — store record even if object storage fails (file_url will be empty)
    }

    await pool.query(
      `INSERT INTO documents (id, booking_id, document_type, file_name, file_key, file_url,
        uploaded_by, original_filename, mime_type, file_size, is_visible_to_customer, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,'admin',$7,$8,$9,true,$10)`,
      [
        fileId, req.params.bookingId, document_type, req.file.originalname,
        fileKey, fileUrl, req.file.originalname,
        req.file.mimetype, req.file.size,
        booking.rows[0].customer_id || null
      ]
    );

    res.json({ success: true, id: fileId, fileName: req.file.originalname });
  } catch (err: any) {
    console.error("[portal/agent/documents POST]", err.message);
    res.status(500).json({ message: "Failed to upload document: " + err.message });
  }
});

// ── Agent Portal — All Bookings ───────────────────────────────────────────────
router.get("/agent/bookings", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT b.id, b.booking_number, b.status, b.total_amount, b.paid_amount,
              b.customer_name, b.customer_mobile, b.customer_email,
              pk.name AS package_name, b.preferred_departure_date, b.created_at,
              b.number_of_pilgrims, b.journey_status, b.ticket_status
       FROM bookings b
       LEFT JOIN packages pk ON pk.id = b.package_id
       WHERE b.agent_id=$1 AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [agent.id]
    );
    res.json({ bookings: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load bookings" });
  }
});

// ── Agent Portal — My Customers ────────────────────────────────────────────────
router.get("/agent/customers", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT customer_id AS id, customer_name AS name, customer_mobile AS mobile,
              customer_email AS email, COUNT(*)::int AS booking_count,
              MAX(created_at) AS last_booking_at
       FROM bookings
       WHERE agent_id=$1 AND deleted_at IS NULL AND customer_id IS NOT NULL
       GROUP BY customer_id, customer_name, customer_mobile, customer_email
       ORDER BY MAX(created_at) DESC`,
      [agent.id]
    );
    res.json({ customers: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load customers" });
  }
});

// ── Agent Portal — Payment Status ─────────────────────────────────────────────
router.get("/agent/payment-status", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT b.id, b.booking_number, b.status, b.customer_name, b.customer_mobile,
              b.total_amount, COALESCE(b.paid_amount,0)::numeric AS paid_amount,
              (COALESCE(b.total_amount,0) - COALESCE(b.paid_amount,0))::numeric AS balance_due,
              b.preferred_departure_date, b.created_at
       FROM bookings b
       WHERE b.agent_id=$1 AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [agent.id]
    );
    res.json({ bookings: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load payment status" });
  }
});

// ── Agent Portal — Invoices ────────────────────────────────────────────────────
router.get("/agent/invoices", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT i.id, i.invoice_number, i.booking_id, i.invoice_date,
              i.total, i.paid, i.balance, i.invoice_status,
              b.booking_number, b.customer_name, b.customer_mobile
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       WHERE b.agent_id=$1 AND b.deleted_at IS NULL
       ORDER BY i.created_at DESC`,
      [agent.id]
    );
    res.json({ invoices: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load invoices" });
  }
});

// ── Agent Portal — Visa Status ─────────────────────────────────────────────────
router.get("/agent/visa", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT b.id AS booking_id, b.booking_number, b.customer_name, b.customer_mobile,
              b.status, b.preferred_departure_date,
              d.id AS doc_id, d.file_name, d.file_url, d.created_at AS visa_uploaded_at
       FROM bookings b
       LEFT JOIN documents d ON d.booking_id = b.id
         AND d.document_type = 'visa' AND d.is_revoked = false
       WHERE b.agent_id=$1 AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [agent.id]
    );
    res.json({ bookings: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load visa status" });
  }
});

// ── Agent Portal — Ticket Status ───────────────────────────────────────────────
router.get("/agent/tickets", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT b.id, b.booking_number, b.customer_name, b.customer_mobile,
              b.status, b.ticket_status, b.preferred_departure_date,
              d.id AS doc_id, d.file_name, d.file_url, d.created_at AS ticket_uploaded_at
       FROM bookings b
       LEFT JOIN documents d ON d.booking_id = b.id
         AND d.document_type = 'flight_ticket' AND d.is_revoked = false
       WHERE b.agent_id=$1 AND b.deleted_at IS NULL
       ORDER BY b.created_at DESC`,
      [agent.id]
    );
    res.json({ bookings: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load ticket status" });
  }
});

// ── Agent Portal — Notifications ──────────────────────────────────────────────
router.get("/agent/notifications", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const r = await pool.query(
      `SELECT nl.id, nl.event_type, nl.channel, nl.status, nl.sent_at, nl.created_at,
              nl.booking_id, b.booking_number, b.customer_name
       FROM notification_logs nl
       JOIN bookings b ON b.id = nl.booking_id
       WHERE b.agent_id=$1
       ORDER BY nl.created_at DESC LIMIT 50`,
      [agent.id]
    );
    res.json({ notifications: r.rows });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load notifications" });
  }
});

// ── Agent Portal — Profile Update ─────────────────────────────────────────────
router.put("/agent/profile", requireAuth as any, async (req: any, res) => {
  if (!agentGuard(req, res)) return;
  try {
    const agent = await getAgentForUser(req.user.mobile);
    if (!agent) return void res.status(404).json({ message: "Agent profile not found" });
    const { email, city } = req.body;
    await pool.query(
      `UPDATE agents SET email=$1, city=$2, updated_at=now() WHERE id=$3`,
      [email || null, city || null, agent.id]
    );
    await pool.query(
      `UPDATE users SET email=$1 WHERE mobile=$2`,
      [email || null, req.user.mobile]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ── Staff Portal ──────────────────────────────────────────────────────────────
router.get("/staff", requireAuth as any, async (req: any, res) => {
  if (req.user?.role !== "staff") {
    res.status(403).json({ message: "Staff access required" });
    return;
  }
  try {
    const mobile = req.user.mobile;
    const r = await pool.query(
      `SELECT * FROM staff WHERE mobile_india=$1 AND status='active' LIMIT 1`,
      [mobile]
    );
    const member = r.rows[0];
    if (!member) {
      res.status(404).json({ message: "Staff record not found for this mobile number" });
      return;
    }
    res.json({ member });
  } catch (err: any) {
    console.error("[portal/staff]", err.message);
    res.status(500).json({ message: "Failed to load staff portal data" });
  }
});

export default router;
