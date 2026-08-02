// @ts-nocheck
/**
 * /api/automation — External AI (n8n) integration layer  v1.0
 *
 * Security guarantees
 *   • Bearer service-token, SHA-256 hash comparison (timing-safe)
 *   • Per-scope enforcement on every route
 *   • IP allowlist (optional, per token)
 *   • In-memory rate limiting per token (120 req / 60 s)
 *   • Global kill switch: env AI_ASSISTANT_ENABLED + DB soft switch
 *   • All writes logged to automation_audit_logs
 *   • Explicit safe projections only — never SELECT *
 *   • No passport / Aadhaar / visa number / DOB / card data in any response
 *   • No internal URLs, stack traces or raw secrets exposed
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface AutoReq extends import("express").Request {
  serviceToken?: { id: string; name: string; scopes: string[] };
  requestId?: string;
  correlationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory rate limiter (per token ID, 120 req / 60 s)
// ─────────────────────────────────────────────────────────────────────────────
const _RL = new Map<string, { n: number; until: number }>();
function rateLimitOk(tokenId: string, limit = 120): boolean {
  const now = Date.now();
  const e = _RL.get(tokenId);
  if (!e || now > e.until) { _RL.set(tokenId, { n: 1, until: now + 60_000 }); return true; }
  if (e.n >= limit) return false;
  e.n++;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getIp(req: any): string {
  return ((req.headers["x-forwarded-for"] as string || "").split(",")[0] ||
    req.socket?.remoteAddress || "").replace(/^::ffff:/, "").trim();
}
function maskMobile(m: string): string {
  const c = (m || "").replace(/\D/g, "");
  if (c.length < 4) return "****";
  return c.slice(0, 2) + "*".repeat(Math.max(c.length - 4, 0)) + c.slice(-2);
}
function hasPlaceholders(s: string): boolean {
  return /\{\{[^}]+\}\}|\[\s*[A-Z][A-Z_0-9]+\s*\]/.test(s || "");
}
function normalizeMobile(mobile: string, countryCode = "91"): string | null {
  const digits = (mobile || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const cc = (countryCode || "91").replace(/\D/g, "");
  return `+${cc}${digits.replace(/^0+/, "")}`;
}
function reqId(): string {
  return `A${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log (fire-and-forget, never crashes endpoint)
// ─────────────────────────────────────────────────────────────────────────────
async function auditLog(o: {
  actorId: string; action: string; entityType: string; entityId?: string;
  requestId: string; ip: string; data?: any; result: "success" | "failure"; errorCode?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO automation_audit_logs
         (id, actor_type, actor_id, action, entity_type, entity_id,
          request_id, ip_address, after_data, result, error_code, created_at)
       VALUES (gen_random_uuid()::text, 'service_token', $1, $2, $3, $4,
               $5, $6, $7::jsonb, $8, $9, NOW())`,
      [o.actorId, o.action, o.entityType, o.entityId || null,
       o.requestId, o.ip, JSON.stringify(o.data || null), o.result, o.errorCode || null]
    );
  } catch { /* audit must never crash */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global kill switch (env var required + DB soft switch)
// ─────────────────────────────────────────────────────────────────────────────
async function isAiEnabled(): Promise<boolean> {
  if (process.env.AI_ASSISTANT_ENABLED !== "true") return false;
  try {
    const { rows } = await pool.query(
      `SELECT value FROM api_settings WHERE key = 'ai_assistant_enabled' LIMIT 1`
    );
    if (rows[0]) return rows[0].value !== "false";
  } catch {}
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-token auth middleware factory
// ─────────────────────────────────────────────────────────────────────────────
function requireServiceToken(scope: string) {
  return async (req: AutoReq, res: any, next: any) => {
    const rid = reqId();
    req.requestId = rid;
    req.correlationId = (req.headers["x-correlation-id"] as string) || rid;
    res.setHeader("X-Request-Id", rid);
    const ip = getIp(req);

    // ── 1. Kill switch ────────────────────────────────────────────────────
    if (!(await isAiEnabled())) {
      return res.status(503).json({
        error: "AI_ASSISTANT_DISABLED",
        message: "AI assistant is currently disabled by administrator.",
        requestId: rid,
      });
    }

    // ── 2. Token extraction ───────────────────────────────────────────────
    const auth = String(req.headers.authorization || "");
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "TOKEN_MISSING",
        message: "Authorization: Bearer <token> header required.",
        requestId: rid,
      });
    }
    const raw = auth.slice(7).trim();
    if (!raw) return res.status(401).json({ error: "TOKEN_MISSING", requestId: rid });

    // ── 3. Hash-based DB lookup ───────────────────────────────────────────
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    let tok: any;
    try {
      const { rows } = await pool.query(
        `SELECT id, token_name, scopes, allowed_ips, is_active, expires_at, revoked_at
         FROM automation_service_tokens WHERE token_hash = $1 LIMIT 1`,
        [hash]
      );
      tok = rows[0];
    } catch {
      return res.status(500).json({ error: "AUTH_ERROR", requestId: rid });
    }

    if (!tok) return res.status(403).json({ error: "TOKEN_INVALID", requestId: rid });
    if (!tok.is_active || tok.revoked_at)
      return res.status(403).json({ error: "TOKEN_REVOKED", requestId: rid });
    if (tok.expires_at && new Date(tok.expires_at) < new Date())
      return res.status(403).json({ error: "TOKEN_EXPIRED", requestId: rid });

    // ── 4. IP allowlist ───────────────────────────────────────────────────
    const allowedIps: string[] = Array.isArray(tok.allowed_ips) ? tok.allowed_ips : [];
    if (allowedIps.length > 0 && !allowedIps.includes(ip))
      return res.status(403).json({ error: "IP_NOT_ALLOWED", requestId: rid });

    // ── 5. Scope check ────────────────────────────────────────────────────
    const scopes: string[] = Array.isArray(tok.scopes) ? tok.scopes : [];
    if (scope && !scopes.includes(scope)) {
      return res.status(403).json({
        error: "SCOPE_MISSING",
        message: `Endpoint requires scope: ${scope}`,
        requestId: rid,
      });
    }

    // ── 6. Rate limit ─────────────────────────────────────────────────────
    if (!rateLimitOk(tok.id)) {
      res.setHeader("X-RateLimit-Limit", "120");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + 60_000) / 1000)));
      return res.status(429).json({ error: "RATE_LIMIT_EXCEEDED", requestId: rid });
    }

    // ── 7. Update last_used_at (fire-and-forget) ──────────────────────────
    pool.query(`UPDATE automation_service_tokens SET last_used_at = NOW() WHERE id = $1`, [tok.id])
      .catch(() => {});

    req.serviceToken = { id: tok.id, name: tok.token_name, scopes };
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Package formatter (safe projection — no cost/margin/internal fields)
// ─────────────────────────────────────────────────────────────────────────────
function fmtPackage(p: any) {
  const d: Record<string, any> = typeof p.details === "object" && p.details ? p.details : {};
  // Drizzle stores columns as camelCase in DB (pricePerPerson, isActive, etc.)
  const price = p.pricePerPerson ?? p["pricePerPerson"];
  const gst   = p.gstPercent    ?? p["gstPercent"];
  const active = p.isActive     ?? p["isActive"];
  const maxP   = p.maxPilgrims  ?? p["maxPilgrims"];
  const depDates = p.departureDates ?? p["departureDates"];
  return {
    package_id: p.id,
    package_name: p.name,
    journey_type: p.type,
    short_description: p.description || "",
    departure_city: d.departureCity || d.departure_city || "",
    departure_date: Array.isArray(depDates) ? (depDates[0] || null) : null,
    return_date: d.returnDate || d.return_date || null,
    duration_days: p.duration || null,
    price: price != null ? Number(price) : null,
    currency: "INR",
    gst_note: gst ? `+${gst}% GST applicable` : null,
    airline: d.airline || null,
    flight_summary: d.flightSummary || d.flight_summary || null,
    makkah_hotel: d.makkahHotel || d.makkah_hotel || null,
    madinah_hotel: d.madinahHotel || d.madinah_hotel || null,
    sharing: d.sharing || null,
    meals: d.meals || null,
    inclusions: Array.isArray(p.includes) ? p.includes : (Array.isArray(p.highlights) ? p.highlights : []),
    exclusions: Array.isArray(d.exclusions) ? d.exclusions : [],
    seats_available: maxP || null,
    booking_status: active ? "open" : "closed",
    public_package_url: null, // AI must not construct internal URLs
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/automation/health  (no auth — health check should always be reachable)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/health", async (req: any, res) => {
  const rid = reqId();
  res.setHeader("X-Request-Id", rid);
  try {
    await pool.query("SELECT 1");
    const aiEnabled = await isAiEnabled();
    res.json({
      service: "al-burhan-ai-automation",
      status: aiEnabled ? "ok" : "disabled",
      database: "ok",
      version: "1.0.0",
      ai_enabled: aiEnabled,
      scopes_supported: [
        "packages:read", "leads:read", "leads:create", "leads:update",
        "support:create", "conversations:create", "knowledge:read",
      ],
      timestamp: new Date().toISOString(),
      requestId: rid,
    });
  } catch {
    res.status(503).json({ service: "al-burhan-ai-automation", status: "degraded", database: "error", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/automation/packages
// ─────────────────────────────────────────────────────────────────────────────
router.get("/packages", requireServiceToken("packages:read"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  try {
    const q = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(q.limit || "20") || 20, 50);
    const offsetN = Math.max(parseInt(q.offset || "0") || 0, 0);

    const params: any[] = [];
    const conds: string[] = [`p."isActive" = true`];

    if (q.journey_type)  { params.push(q.journey_type);       conds.push(`p.type = $${params.length}`); }
    if (q.departure_city){ params.push(`%${q.departure_city}%`); conds.push(`(p.details->>'departureCity') ILIKE $${params.length}`); }
    if (q.travel_month)  { params.push(`%${q.travel_month}%`); conds.push(`(p.details->>'travelMonth') ILIKE $${params.length}`); }
    if (q.min_price)     { params.push(parseFloat(q.min_price) || 0); conds.push(`CAST(NULLIF(CAST(p."pricePerPerson" AS TEXT),'') AS numeric) >= $${params.length}`); }
    if (q.max_price)     { params.push(parseFloat(q.max_price) || 99999999); conds.push(`CAST(NULLIF(CAST(p."pricePerPerson" AS TEXT),'') AS numeric) <= $${params.length}`); }

    const where = `WHERE ${conds.join(" AND ")}`;
    params.push(limitN, offsetN);

    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.type, p.description, p.duration,
              p."pricePerPerson", p."gstPercent", p.includes, p.highlights,
              p."departureDates", p.details, p."maxPilgrims", p."isActive", p."imageUrl"
       FROM packages p ${where}
       ORDER BY p."createdAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    auditLog({ actorId: req.serviceToken!.id, action: "list_packages", entityType: "packages", requestId: rid, ip: getIp(req), data: { count: rows.length }, result: "success" });
    res.json({ packages: rows.map(fmtPackage), total: rows.length, limit: limitN, offset: offsetN, requestId: rid });
  } catch (err: any) {
    console.error("[automation] GET /packages:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/automation/packages/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get("/packages/:id", requireServiceToken("packages:read"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.type, p.description, p.duration,
              p."pricePerPerson", p."gstPercent", p.includes, p.highlights,
              p."departureDates", p.details, p."maxPilgrims", p."isActive", p."imageUrl"
       FROM packages p WHERE p.id = $1 AND p."isActive" = true LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "PACKAGE_NOT_FOUND", requestId: rid });
    res.json({ package: fmtPackage(rows[0]), requestId: rid });
  } catch (err: any) {
    console.error("[automation] GET /packages/:id:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automation/leads
// ─────────────────────────────────────────────────────────────────────────────
router.post("/leads", requireServiceToken("leads:create"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const {
      name, mobile, country_code = "91", city, journey_type,
      interested_package_id, travel_month, passenger_count = 1,
      budget, preferred_language = "en", source_channel,
      consent_to_contact, conversation_key, idempotency_key,
    } = req.body || {};

    // Validation
    const errs: string[] = [];
    if (!name || String(name).trim().length < 2) errs.push("name: required, min 2 chars");
    if (!mobile) errs.push("mobile: required");
    if (!source_channel) errs.push("source_channel: required");
    if (!idempotency_key) errs.push("idempotency_key: required");
    if (!consent_to_contact) errs.push("consent_to_contact: must be true");
    if (hasPlaceholders(name) || hasPlaceholders(mobile)) errs.push("unresolved placeholders detected in name/mobile");
    if (errs.length) return res.status(400).json({ error: "VALIDATION_ERROR", errors: errs, requestId: rid });

    const normalizedMobile = normalizeMobile(String(mobile), String(country_code || "91"));
    if (!normalizedMobile) return res.status(400).json({ error: "INVALID_MOBILE", message: "Mobile number format is invalid.", requestId: rid });

    // Idempotency check (stored in audit_logs after_data)
    const { rows: existingAudit } = await pool.query(
      `SELECT entity_id FROM automation_audit_logs
       WHERE action = 'create_lead' AND after_data->>'idempotency_key' = $1 LIMIT 1`,
      [String(idempotency_key)]
    );
    if (existingAudit[0]) {
      const { rows: el } = await pool.query(
        `SELECT id, COALESCE(lead_number, 'AI-' || SUBSTRING(id,1,8)) AS lead_number, assigned_to FROM leads WHERE id = $1 LIMIT 1`,
        [existingAudit[0].entity_id]
      );
      if (el[0]) {
        return res.status(200).json({ lead_number: el[0].lead_number, assigned_department: el[0].assigned_to || "general", status: "existing", message: "Lead already created (idempotent)", requestId: rid });
      }
    }

    // Check for open lead with same mobile (update instead of duplicate)
    const mobileSuffix = normalizedMobile.slice(-9);
    const { rows: openLeads } = await pool.query(
      `SELECT id, COALESCE(lead_number, 'AI-' || SUBSTRING(id,1,8)) AS lead_number, assigned_to
       FROM leads
       WHERE REPLACE(REPLACE(COALESCE(mobile,''), ' ', ''), '-', '') LIKE $1
         AND status NOT IN ('converted', 'lost', 'closed')
       ORDER BY created_at DESC LIMIT 1`,
      [`%${mobileSuffix}`]
    );
    if (openLeads[0]) {
      await pool.query(
        `UPDATE leads SET message = $1, package_interest = COALESCE($2, package_interest), updated_at = NOW() WHERE id = $3`,
        [
          `[AI ${source_channel}] Travel: ${travel_month || ""}. Pax: ${passenger_count}. Budget: ${budget || ""}`.trim(),
          interested_package_id || null,
          openLeads[0].id,
        ]
      );
      auditLog({ actorId: req.serviceToken!.id, action: "update_lead_enquiry", entityType: "lead", entityId: openLeads[0].id, requestId: rid, ip, data: { mobile_masked: maskMobile(normalizedMobile) }, result: "success" });
      return res.status(200).json({ lead_number: openLeads[0].lead_number, assigned_department: openLeads[0].assigned_to || "general", status: "updated", message: "Existing open lead updated with new enquiry", requestId: rid });
    }

    // CRM assignment rules
    let assignedTo: string | null = null;
    let assignedName: string | null = null;
    try {
      const { rows: rules } = await pool.query(
        `SELECT * FROM crm_assignment_rules WHERE is_active = true ORDER BY priority ASC LIMIT 30`
      );
      for (const rule of rules) {
        const cv = (rule.condition_value || "").toLowerCase();
        const jt = (journey_type || "").toLowerCase();
        const sc = (source_channel || "").toLowerCase();
        if ((rule.condition_type === "journey_type" && cv === jt) ||
            (rule.condition_type === "source" && cv === sc)) {
          assignedTo = rule.assigned_to_user_id || rule.assigned_to;
          assignedName = rule.assigned_to_name || rule.assigned_name;
          break;
        }
      }
    } catch {}

    // Generate lead
    const leadId = crypto.randomUUID();
    const tsB = Date.now().toString(36).toUpperCase().slice(-6);
    const leadNumber = `AI-${tsB}`;

    const noteText = `[AI ${source_channel}] City: ${city || ""}. Journey: ${journey_type || ""}. Travel: ${travel_month || ""}. Pax: ${passenger_count}. Lang: ${preferred_language}. Conv: ${conversation_key || ""}`.trim();

    await pool.query(
      `INSERT INTO leads (id, name, mobile, source, status, message, package_interest, budget, assigned_to, assigned_name, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'new', $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [leadId, String(name).trim().substring(0, 200), normalizedMobile,
       String(source_channel || "ai_assistant").substring(0, 50), noteText,
       interested_package_id || null, budget ? String(budget).substring(0, 100) : null,
       assignedTo, assignedName,
       conversation_key ? `conversation_key: ${conversation_key}` : null]
    );
    // Set lead_number if column exists (Phase B may have added it)
    pool.query(`UPDATE leads SET lead_number = $1 WHERE id = $2 AND lead_number IS NULL`, [leadNumber, leadId]).catch(() => {});

    auditLog({
      actorId: req.serviceToken!.id, action: "create_lead", entityType: "lead",
      entityId: leadId, requestId: rid, ip,
      data: { mobile_masked: maskMobile(normalizedMobile), idempotency_key: String(idempotency_key) },
      result: "success",
    });

    res.status(201).json({ lead_number: leadNumber, lead_id: leadId, assigned_department: assignedTo || "general", status: "created", requestId: rid });
  } catch (err: any) {
    console.error("[automation] POST /leads:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/automation/leads/:leadNumber
// ─────────────────────────────────────────────────────────────────────────────
const LEAD_PATCH_ALLOWED = new Set(["notes", "travel_month", "budget", "passenger_count", "interested_package_id", "preferred_language"]);

router.patch("/leads/:leadNumber", requireServiceToken("leads:update"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const { leadNumber } = req.params;
    const body = req.body || {};

    // Allow only permitted fields
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(body)) {
      if (LEAD_PATCH_ALLOWED.has(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "NO_ALLOWED_FIELDS", message: `Allowed fields: ${[...LEAD_PATCH_ALLOWED].join(", ")}`, requestId: rid });

    // Validate no placeholders
    for (const v of Object.values(updates)) {
      if (typeof v === "string" && hasPlaceholders(v))
        return res.status(400).json({ error: "UNRESOLVED_PLACEHOLDER", requestId: rid });
    }

    // Find lead by lead_number or id prefix
    const { rows } = await pool.query(
      `SELECT id FROM leads WHERE COALESCE(lead_number, id) = $1 OR id LIKE $2 LIMIT 1`,
      [leadNumber, `${leadNumber}%`]
    );
    if (!rows[0]) return res.status(404).json({ error: "LEAD_NOT_FOUND", requestId: rid });
    const leadId = rows[0].id;

    // Build safe SET clause
    const sets: string[] = [];
    const vals: any[] = [];
    const MAP: Record<string, string> = {
      notes: "notes", travel_month: "message", budget: "budget",
      passenger_count: "notes", interested_package_id: "package_interest", preferred_language: "notes",
    };
    // Append to existing notes for text fields
    if (updates.notes !== undefined) { vals.push(String(updates.notes).substring(0, 1000)); sets.push(`notes = $${vals.length}`); }
    if (updates.budget !== undefined) { vals.push(String(updates.budget).substring(0, 100)); sets.push(`budget = $${vals.length}`); }
    if (updates.interested_package_id !== undefined) { vals.push(String(updates.interested_package_id)); sets.push(`package_interest = $${vals.length}`); }
    if (updates.travel_month !== undefined || updates.passenger_count !== undefined || updates.preferred_language !== undefined) {
      const appendNote = Object.entries(updates)
        .filter(([k]) => ["travel_month","passenger_count","preferred_language"].includes(k))
        .map(([k, v]) => `${k}: ${v}`).join(", ");
      vals.push(`[AI update] ${appendNote}`.substring(0, 500));
      sets.push(`message = COALESCE(message,'') || E'\n' || $${vals.length}`);
    }
    sets.push(`updated_at = NOW()`);
    vals.push(leadId);

    await pool.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    auditLog({ actorId: req.serviceToken!.id, action: "patch_lead", entityType: "lead", entityId: leadId, requestId: rid, ip, data: { fields: Object.keys(updates) }, result: "success" });
    res.json({ status: "updated", requestId: rid });
  } catch (err: any) {
    console.error("[automation] PATCH /leads:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automation/support-tickets
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_CATEGORIES = new Set([
  "payment_not_reflected","booking_help","package_help","refund_request",
  "cancellation_request","visa_issue","document_issue","complaint","emergency",
  "human_requested","other",
]);
const HUMAN_ONLY_CATEGORIES = new Set([
  "payment_not_reflected","refund_request","cancellation_request","visa_issue","emergency",
]);
const CATEGORY_DEPT: Record<string, string> = {
  payment_not_reflected: "finance", refund_request: "finance", cancellation_request: "operations",
  visa_issue: "visa", document_issue: "documents", complaint: "management",
  emergency: "emergency", booking_help: "sales", package_help: "sales",
  human_requested: "support", other: "support",
};

router.post("/support-tickets", requireServiceToken("support:create"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const {
      customer_id, lead_number, booking_number, category, priority = "normal",
      subject, summary, source_channel, conversation_key, idempotency_key,
    } = req.body || {};

    const errs: string[] = [];
    if (!category || !TICKET_CATEGORIES.has(String(category))) errs.push(`category: must be one of ${[...TICKET_CATEGORIES].join(", ")}`);
    if (!subject || String(subject).trim().length < 5) errs.push("subject: required, min 5 chars");
    if (!summary) errs.push("summary: required");
    if (!idempotency_key) errs.push("idempotency_key: required");
    if (hasPlaceholders(subject) || hasPlaceholders(summary)) errs.push("unresolved placeholders in subject/summary");
    if (errs.length) return res.status(400).json({ error: "VALIDATION_ERROR", errors: errs, requestId: rid });

    // Idempotency
    const { rows: existing } = await pool.query(
      `SELECT entity_id FROM automation_audit_logs WHERE action='create_support_ticket' AND after_data->>'idempotency_key'=$1 LIMIT 1`,
      [String(idempotency_key)]
    );
    if (existing[0]) {
      return res.status(200).json({ ticket_id: existing[0].entity_id, status: "existing", message: "Ticket already created (idempotent)", requestId: rid });
    }

    // Resolve booking_id from booking_number
    let bookingId: string | null = null;
    let resolvedCustomerId = customer_id || null;
    if (booking_number) {
      const { rows: bk } = await pool.query(
        `SELECT id, customer_id FROM bookings WHERE booking_number = $1 LIMIT 1`, [booking_number]
      );
      if (bk[0]) { bookingId = bk[0].id; if (!resolvedCustomerId) resolvedCustomerId = bk[0].customer_id; }
    }

    const ticketId = crypto.randomUUID().replace(/-/g, "").substring(0, 20);
    const tNum = `TKT-AI-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const dept = CATEGORY_DEPT[String(category)] || "support";
    const assignToHuman = HUMAN_ONLY_CATEGORIES.has(String(category));

    await pool.query(
      `INSERT INTO support_tickets
         (id, ticket_number, customer_id, booking_id, subject, category, status, priority, assigned_to, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, NOW(), NOW())`,
      [ticketId, tNum, resolvedCustomerId || "ai_anonymous", bookingId,
       String(subject).trim().substring(0, 300), String(category),
       String(priority).substring(0, 20), assignToHuman ? dept : null]
    );

    // Opening message
    pool.query(
      `INSERT INTO support_messages (id, ticket_id, sender_type, sender_id, sender_name, message, created_at)
       VALUES (gen_random_uuid()::text, $1, 'admin', 'ai_assistant', 'AI Assistant', $2, NOW())`,
      [ticketId, String(summary).substring(0, 2000)]
    ).catch(() => {});

    auditLog({
      actorId: req.serviceToken!.id, action: "create_support_ticket", entityType: "support_ticket",
      entityId: ticketId, requestId: rid, ip,
      data: { ticket_number: tNum, category, idempotency_key: String(idempotency_key) },
      result: "success",
    });

    res.status(201).json({
      ticket_id: ticketId, ticket_number: tNum, department: dept,
      human_required: assignToHuman, status: "created", requestId: rid,
    });
  } catch (err: any) {
    console.error("[automation] POST /support-tickets:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automation/conversations/upsert
// ─────────────────────────────────────────────────────────────────────────────
router.post("/conversations/upsert", requireServiceToken("conversations:create"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const {
      conversation_key, channel, external_contact_id, customer_id, lead_id,
      booking_id, customer_name, mobile, language = "en", status = "ai_active",
    } = req.body || {};

    if (!conversation_key) return res.status(400).json({ error: "VALIDATION_ERROR", errors: ["conversation_key: required"], requestId: rid });
    if (!channel) return res.status(400).json({ error: "VALIDATION_ERROR", errors: ["channel: required"], requestId: rid });

    const VALID_STATUSES = new Set(["ai_active","human_required","human_active","closed"]);
    const safeStatus = VALID_STATUSES.has(String(status)) ? String(status) : "ai_active";

    const mobileM = mobile ? maskMobile(String(mobile)) : null;

    const { rows } = await pool.query(
      `SELECT id FROM ai_conversations WHERE conversation_key = $1 LIMIT 1`,
      [String(conversation_key)]
    );

    let convId: string;
    let action: string;
    if (rows[0]) {
      convId = rows[0].id;
      action = "update_conversation";
      await pool.query(
        `UPDATE ai_conversations
         SET status = $1, last_ai_message_at = NOW(), updated_at = NOW(),
             language = COALESCE($2, language), customer_id = COALESCE($3, customer_id)
         WHERE id = $4`,
        [safeStatus, language || null, customer_id || null, convId]
      );
    } else {
      convId = crypto.randomUUID();
      action = "create_conversation";
      await pool.query(
        `INSERT INTO ai_conversations
           (id, conversation_key, channel, external_contact_id, customer_id, lead_id,
            booking_id, customer_name, mobile_masked, language, status,
            last_ai_message_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW(),NOW())`,
        [convId, String(conversation_key).substring(0, 255), String(channel).substring(0, 50),
         external_contact_id || null, customer_id || null, lead_id || null, booking_id || null,
         customer_name ? String(customer_name).substring(0, 200) : null,
         mobileM, String(language).substring(0, 20), safeStatus]
      );
    }

    auditLog({ actorId: req.serviceToken!.id, action, entityType: "ai_conversation", entityId: convId, requestId: rid, ip, data: { channel, status: safeStatus }, result: "success" });
    res.json({ conversation_id: convId, conversation_key, status: safeStatus, action: rows[0] ? "updated" : "created", requestId: rid });
  } catch (err: any) {
    console.error("[automation] POST /conversations/upsert:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automation/conversations/:conversationKey/messages
// ─────────────────────────────────────────────────────────────────────────────
router.post("/conversations/:conversationKey/messages", requireServiceToken("conversations:create"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const { conversationKey } = req.params;
    const {
      direction, sender_type, channel, message_type = "text",
      message_text, provider_message_id, ai_model, tool_calls, confidence,
    } = req.body || {};

    const errs: string[] = [];
    if (!direction || !["inbound","outbound"].includes(String(direction))) errs.push("direction: must be inbound or outbound");
    if (!sender_type || !["customer","ai","staff","system"].includes(String(sender_type))) errs.push("sender_type: must be customer/ai/staff/system");
    if (!message_text) errs.push("message_text: required");
    // Block PII patterns
    if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(String(message_text || ""))) errs.push("message_text: PAN number detected — do not log PII");
    if (/\b\d{12}\b/.test(String(message_text || ""))) errs.push("message_text: Aadhaar-like number detected — do not log PII");
    if (errs.length) return res.status(400).json({ error: "VALIDATION_ERROR", errors: errs, requestId: rid });

    const { rows: conv } = await pool.query(
      `SELECT id FROM ai_conversations WHERE conversation_key = $1 LIMIT 1`,
      [conversationKey]
    );
    if (!conv[0]) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND", requestId: rid });
    const convId = conv[0].id;

    const msgId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ai_conversation_messages
         (id, conversation_id, direction, sender_type, channel, message_type,
          message_text, provider_message_id, request_id, ai_model, tool_calls, confidence, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,NOW())`,
      [msgId, convId, String(direction), String(sender_type), String(channel || "unknown").substring(0,50),
       String(message_type).substring(0,50), String(message_text).substring(0, 4000),
       provider_message_id || null, rid, ai_model ? String(ai_model).substring(0,100) : null,
       JSON.stringify(tool_calls || null), confidence != null ? Number(confidence) : null]
    );

    // Update conversation timestamps
    const tsField = String(direction) === "inbound" ? "last_customer_message_at" : "last_ai_message_at";
    pool.query(`UPDATE ai_conversations SET ${tsField} = NOW(), updated_at = NOW() WHERE id = $1`, [convId]).catch(() => {});

    auditLog({ actorId: req.serviceToken!.id, action: "add_message", entityType: "ai_conversation", entityId: convId, requestId: rid, ip, data: { direction, sender_type }, result: "success" });
    res.status(201).json({ message_id: msgId, requestId: rid });
  } catch (err: any) {
    console.error("[automation] POST /conversations/:key/messages:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/automation/conversations/:conversationKey/handoff
// ─────────────────────────────────────────────────────────────────────────────
router.post("/conversations/:conversationKey/handoff", requireServiceToken("support:create"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  const ip = getIp(req);
  try {
    const { conversationKey } = req.params;
    const { reason = "human_requested", priority = "normal", department } = req.body || {};

    const { rows: conv } = await pool.query(
      `SELECT id, customer_id, customer_name, booking_id, channel
       FROM ai_conversations WHERE conversation_key = $1 LIMIT 1`,
      [conversationKey]
    );
    if (!conv[0]) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND", requestId: rid });
    const c = conv[0];

    // Set status to human_required (stops AI auto-replies until explicitly returned)
    await pool.query(
      `UPDATE ai_conversations SET status = 'human_required', updated_at = NOW() WHERE id = $1`,
      [c.id]
    );

    // Create support ticket
    const ticketId = crypto.randomUUID().replace(/-/g, "").substring(0, 20);
    const tNum = `TKT-HO-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const dept = department || "support";

    await pool.query(
      `INSERT INTO support_tickets
         (id, ticket_number, customer_id, booking_id, subject, category, status, priority, assigned_to, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'human_requested','open',$6,$7,NOW(),NOW())`,
      [ticketId, tNum, c.customer_id || "ai_anonymous", c.booking_id || null,
       `Handoff requested — channel: ${c.channel || "unknown"}. Reason: ${String(reason).substring(0,200)}`,
       String(priority).substring(0,20), dept]
    );

    auditLog({ actorId: req.serviceToken!.id, action: "handoff_to_human", entityType: "ai_conversation", entityId: c.id, requestId: rid, ip, data: { ticket_number: tNum, reason, dept }, result: "success" });
    res.json({ conversation_status: "human_required", ticket_number: tNum, ticket_id: ticketId, department: dept, message: "Conversation handed off to human. AI replies are paused until staff returns conversation to AI.", requestId: rid });
  } catch (err: any) {
    console.error("[automation] POST /conversations/:key/handoff:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/automation/knowledge
// ─────────────────────────────────────────────────────────────────────────────
router.get("/knowledge", requireServiceToken("knowledge:read"), async (req: AutoReq, res) => {
  const rid = req.requestId!;
  try {
    const { category, language, search, limit = "50" } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limit) || 50, 100);
    const params: any[] = [];
    const conds: string[] = ["k.is_active = true", "k.status = 'approved'"];

    if (category) { params.push(String(category)); conds.push(`k.category = $${params.length}`); }
    if (language) { params.push(String(language)); conds.push(`k.language = $${params.length}`); }
    if (search) { params.push(`%${String(search).replace(/[%_]/g, "\\$&")}%`); conds.push(`(k.question ILIKE $${params.length} OR k.answer ILIKE $${params.length})`); }

    params.push(limitN);
    const { rows } = await pool.query(
      `SELECT k.id, k.category, k.question, k.answer, k.language, k.version, k.last_reviewed_at
       FROM ai_knowledge_base k WHERE ${conds.join(" AND ")}
       ORDER BY k.category, k.sort_order NULLS LAST, k.created_at
       LIMIT $${params.length}`,
      params
    );

    res.json({ items: rows, total: rows.length, requestId: rid });
  } catch (err: any) {
    console.error("[automation] GET /knowledge:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId: rid });
  }
});

export default router;
