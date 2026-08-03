// @ts-nocheck
/**
 * /api/admin/ai-automation — Admin management routes for AI Automation API
 *
 * All routes require session-based admin authentication (requireAdmin).
 * These endpoints manage service tokens, conversations, knowledge base,
 * and the global AI kill switch from the admin dashboard.
 *
 * Only super_admin may create/revoke tokens or toggle the kill switch.
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import crypto from "crypto";
import { getTenantId } from "../lib/tenantContext.js";

const router = Router();

// All routes require admin session auth
router.use(requireAdmin as any);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isSuperAdmin(req: any): boolean {
  return req.user?.role === "super_admin" || req.user?.adminRole === "super_admin";
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/ai-automation/status
// Returns current AI kill switch status and env var presence
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", async (req: any, res) => {
  try {
    const envSet = process.env.AI_ASSISTANT_ENABLED === "true";

    // Read DB soft-switch
    let dbEnabled: boolean | null = null;
    try {
      const { rows } = await pool.query(
        `SELECT value FROM api_settings WHERE key = 'ai_assistant_enabled' LIMIT 1`
      );
      if (rows[0]) dbEnabled = rows[0].value !== "false";
    } catch {}

    // Token count (tenant-scoped)
    const tenantId = getTenantId(req);
    const { rows: tc } = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active=true AND revoked_at IS NULL)::int AS active
       FROM automation_service_tokens WHERE tenant_id=$1::uuid`,
      [tenantId]
    );

    res.json({
      enabled: envSet && (dbEnabled ?? true),
      env_set: envSet,
      db_enabled: dbEnabled,
      tokens: tc[0] || { total: 0, active: 0 },
    });
  } catch (err: any) {
    console.error("[ai-automation-admin] status:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ai-automation/toggle
// Toggle the DB soft kill switch (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/toggle", async (req: any, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED", message: "Only super_admin may change the AI kill switch." });
  }
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "enabled must be a boolean" });
    }
    const value = enabled ? "true" : "false";
    await pool.query(
      `UPDATE api_settings SET value = $1, updated_at = NOW() WHERE key = 'ai_assistant_enabled'`,
      [value]
    );
    // Insert if not exists
    const { rowCount } = await pool.query(
      `SELECT 1 FROM api_settings WHERE key = 'ai_assistant_enabled' LIMIT 1`
    );
    if (!rowCount) {
      await pool.query(
        `INSERT INTO api_settings (key, value, provider, enabled, updated_at) VALUES ('ai_assistant_enabled', $1, 'ai_automation', $2, NOW()) ON CONFLICT DO NOTHING`,
        [value, enabled]
      );
    }
    // Audit
    pool.query(
      `INSERT INTO automation_audit_logs (id, actor_type, actor_id, action, entity_type, request_id, ip_address, after_data, result, created_at)
       VALUES (gen_random_uuid()::text, 'admin', $1, 'toggle_kill_switch', 'system', $2, $3, $4::jsonb, 'success', NOW())`,
      [req.user!.id, crypto.randomBytes(4).toString("hex"), req.socket?.remoteAddress || "", JSON.stringify({ enabled })]
    ).catch(() => {});

    res.json({ enabled, message: enabled ? "AI assistant enabled" : "AI assistant disabled" });
  } catch (err: any) {
    console.error("[ai-automation-admin] toggle:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/ai-automation/tokens
// List all service tokens (without hashes)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/tokens", async (req: any, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rows } = await pool.query(
      `SELECT id, token_name, scopes, allowed_ips, is_active, last_used_at, expires_at, revoked_at, notes, created_at
       FROM automation_service_tokens WHERE tenant_id=$1::uuid
       ORDER BY created_at DESC`,
      [tenantId]
    );
    res.json({ tokens: rows });
  } catch (err: any) {
    console.error("[ai-automation-admin] tokens:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ai-automation/tokens
// Create a new service token (super_admin only)
// Returns the raw token ONCE — never stored, only the hash is kept
// ─────────────────────────────────────────────────────────────────────────────
router.post("/tokens", async (req: any, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED", message: "Only super_admin may create service tokens." });
  }
  try {
    const { name, scopes = [], allowed_ips = [], expires_in_days, notes } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "name: required, min 2 chars" });
    }

    const VALID_SCOPES = new Set([
      "packages:read", "leads:read", "leads:create", "leads:update",
      "support:create", "conversations:create", "knowledge:read",
    ]);
    const safeScopes = (Array.isArray(scopes) ? scopes : [])
      .filter((s: any) => VALID_SCOPES.has(String(s)));
    if (safeScopes.length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "At least one valid scope required." });
    }

    // Generate cryptographically secure token
    const rawToken = crypto.randomBytes(40).toString("base64url");
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = expires_in_days
      ? new Date(Date.now() + Number(expires_in_days) * 86_400_000)
      : null;

    const tokenId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO automation_service_tokens
         (id, token_name, token_hash, scopes, allowed_ips, is_active, expires_at, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true, $6, $7, $8, NOW(), NOW())`,
      [tokenId, name.trim(), hash,
       JSON.stringify(safeScopes), JSON.stringify(Array.isArray(allowed_ips) ? allowed_ips : []),
       expiresAt, notes || null, req.user!.id]
    );

    // Audit
    pool.query(
      `INSERT INTO automation_audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, request_id, ip_address, after_data, result, created_at)
       VALUES (gen_random_uuid()::text, 'admin', $1, 'create_service_token', 'service_token', $2, $3, $4, $5::jsonb, 'success', NOW())`,
      [req.user!.id, tokenId, crypto.randomBytes(4).toString("hex"), req.socket?.remoteAddress || "",
       JSON.stringify({ token_name: name, scopes: safeScopes })]
    ).catch(() => {});

    res.status(201).json({ token_id: tokenId, raw_token: rawToken, scopes: safeScopes, message: "Token created. Copy now — it will not be shown again." });
  } catch (err: any) {
    console.error("[ai-automation-admin] create token:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ai-automation/tokens/:tokenId/revoke
// Revoke a service token (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/tokens/:tokenId/revoke", async (req: any, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED", message: "Only super_admin may revoke service tokens." });
  }
  try {
    const { tokenId } = req.params;
    const { rows } = await pool.query(
      `UPDATE automation_service_tokens
       SET is_active = false, revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id, token_name`,
      [tokenId]
    );
    if (!rows[0]) return res.status(404).json({ error: "TOKEN_NOT_FOUND_OR_ALREADY_REVOKED" });

    pool.query(
      `INSERT INTO automation_audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, request_id, ip_address, after_data, result, created_at)
       VALUES (gen_random_uuid()::text, 'admin', $1, 'revoke_service_token', 'service_token', $2, $3, $4, $5::jsonb, 'success', NOW())`,
      [req.user!.id, tokenId, crypto.randomBytes(4).toString("hex"), req.socket?.remoteAddress || "",
       JSON.stringify({ token_name: rows[0].token_name })]
    ).catch(() => {});

    res.json({ revoked: true, token_name: rows[0].token_name });
  } catch (err: any) {
    console.error("[ai-automation-admin] revoke token:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/ai-automation/conversations
// List conversations with stats
// ─────────────────────────────────────────────────────────────────────────────
router.get("/conversations", async (req: any, res) => {
  try {
    const { status, channel, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limit) || 50, 200);
    const offsetN = Math.max(parseInt(offset) || 0, 0);

    const tenantId = getTenantId(req);
    const filterParams: any[] = [tenantId]; // $1 = tenantId always
    const conds: string[] = [`c.tenant_id=$1::uuid`];
    if (status) { filterParams.push(status); conds.push(`c.status = $${filterParams.length}`); }
    if (channel) { filterParams.push(channel); conds.push(`c.channel = $${filterParams.length}`); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const [statsR, convsR] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='ai_active')::int AS ai_active,
          COUNT(*) FILTER (WHERE status='human_required')::int AS human_required,
          COUNT(*) FILTER (WHERE status='human_active')::int AS human_active,
          COUNT(*) FILTER (WHERE status='closed')::int AS closed,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int AS today
        FROM ai_conversations WHERE tenant_id=$1::uuid`, [tenantId]),
      pool.query(
        `SELECT c.id, c.conversation_key, c.channel, c.customer_name, c.mobile_masked,
                c.language, c.status, c.last_ai_message_at, c.last_customer_message_at, c.created_at
         FROM ai_conversations c ${where}
         ORDER BY c.updated_at DESC
         LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
        [...filterParams, limitN, offsetN]
      ),
    ]);

    res.json({ stats: statsR.rows[0], conversations: convsR.rows });
  } catch (err: any) {
    console.error("[ai-automation-admin] conversations:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ai-automation/conversations/:conversationKey/return-to-ai
// Staff marks a human conversation ready to return to AI handling
// ─────────────────────────────────────────────────────────────────────────────
router.post("/conversations/:conversationKey/return-to-ai", async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ai_conversations SET status = 'ai_active', updated_at = NOW()
       WHERE conversation_key = $1 AND status IN ('human_required','human_active')
       RETURNING id, conversation_key`,
      [req.params.conversationKey]
    );
    if (!rows[0]) return res.status(404).json({ error: "CONVERSATION_NOT_FOUND_OR_ALREADY_AI" });

    pool.query(
      `INSERT INTO automation_audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, request_id, ip_address, result, created_at)
       VALUES (gen_random_uuid()::text, 'admin', $1, 'return_to_ai', 'ai_conversation', $2, $3, $4, 'success', NOW())`,
      [req.user!.id, rows[0].id, crypto.randomBytes(4).toString("hex"), req.socket?.remoteAddress || ""]
    ).catch(() => {});

    res.json({ status: "ai_active", conversation_key: rows[0].conversation_key });
  } catch (err: any) {
    console.error("[ai-automation-admin] return-to-ai:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/ai-automation/audit
// Paginated audit log
// ─────────────────────────────────────────────────────────────────────────────
router.get("/audit", async (req: any, res) => {
  try {
    const { action, result, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limit) || 50, 200);
    const offsetN = Math.max(parseInt(offset) || 0, 0);

    const tenantId = getTenantId(req);
    const params: any[] = [tenantId]; // $1 = tenantId
    const conds: string[] = [`a.tenant_id=$1::uuid`];
    if (action) { params.push(action); conds.push(`a.action = $${params.length}`); }
    if (result) { params.push(result); conds.push(`a.result = $${params.length}`); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const { rows } = await pool.query(
      `SELECT a.id, a.actor_type, a.actor_id, a.action, a.entity_type, a.entity_id,
              a.request_id, a.ip_address, a.result, a.error_code, a.created_at
       FROM automation_audit_logs a ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitN, offsetN]
    );
    res.json({ logs: rows, offset: offsetN, limit: limitN });
  } catch (err: any) {
    console.error("[ai-automation-admin] audit:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/ai-automation/knowledge
// List knowledge base items (all statuses for admin)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/knowledge", async (req: any, res) => {
  try {
    const { category, status, language, limit = "100" } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limit) || 100, 500);
    const tenantId = getTenantId(req);
    const params: any[] = [tenantId]; // $1 = tenantId
    const conds: string[] = [`k.tenant_id=$1::uuid`];
    if (category) { params.push(category); conds.push(`k.category = $${params.length}`); }
    if (status)   { params.push(status);   conds.push(`k.status = $${params.length}`); }
    if (language) { params.push(language); conds.push(`k.language = $${params.length}`); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const { rows } = await pool.query(
      `SELECT k.id, k.category, k.question, k.answer, k.language, k.status, k.approval_status,
              k.is_active, k.sort_order, k.version, k.created_at, k.updated_at
       FROM ai_knowledge_base k ${where}
       ORDER BY k.category, k.sort_order NULLS LAST, k.created_at
       LIMIT $${params.length + 1}`,
      [...params, limitN]
    );
    res.json({ items: rows, total: rows.length });
  } catch (err: any) {
    console.error("[ai-automation-admin] knowledge:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ai-automation/knowledge
// Create or update a knowledge base item (super_admin only — prevents unreviewed content)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/knowledge", async (req: any, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED", message: "Only super_admin may publish knowledge base items." });
  }
  try {
    const { category, question, answer, language = "en", sort_order } = req.body || {};
    const errs: string[] = [];
    if (!category) errs.push("category: required");
    if (!question || String(question).trim().length < 5) errs.push("question: required, min 5 chars");
    if (!answer || String(answer).trim().length < 5) errs.push("answer: required, min 5 chars");
    if (errs.length) return res.status(400).json({ error: "VALIDATION_ERROR", errors: errs });

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ai_knowledge_base
         (id, category, question, answer, language, status, approval_status, is_active, sort_order, created_by, approved_by, last_reviewed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'approved','approved',true,$6,$7,$7,NOW(),NOW(),NOW())`,
      [id, String(category), String(question).trim(), String(answer).trim(),
       String(language), sort_order ? Number(sort_order) : null, req.user!.id]
    );
    res.status(201).json({ id });
  } catch (err: any) {
    console.error("[ai-automation-admin] create knowledge:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/ai-automation/knowledge/:id
// Archive (soft delete) a knowledge base item (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/knowledge/:id", async (req: any, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: "SUPER_ADMIN_REQUIRED" });
  }
  try {
    await pool.query(
      `UPDATE ai_knowledge_base SET status = 'archived', is_active = false, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ archived: true });
  } catch (err: any) {
    console.error("[ai-automation-admin] archive knowledge:", err?.message);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
