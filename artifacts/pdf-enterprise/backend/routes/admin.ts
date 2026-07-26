import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { pool } from "../db.js";
import { requirePdfAuth, requireRole } from "../middleware.js";
import { logAudit } from "../audit.js";
import { decryptBuffer, getStoragePath, getBackupPath } from "../crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
router.use(requirePdfAuth);

// GET /pdf/api/admin/stats
router.get("/stats", async (req, res) => {
  try {
    const user = (req as any).pdfUser;
    const isAdmin = user.role === "admin";

    const [files, users, audit, storage] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, SUM(size_bytes) as total_size, SUM(page_count) as total_pages FROM pdf_files WHERE is_deleted = false${!isAdmin ? " AND owner_id = $1" : ""}`, !isAdmin ? [user.id] : []),
      isAdmin ? pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM pdf_users`) : Promise.resolve({ rows: [{ total: 1, active: 1 }] }),
      pool.query(`SELECT COUNT(*) as today FROM pdf_audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours'${!isAdmin ? " AND user_id = $1" : ""}`, !isAdmin ? [user.id] : []),
      pool.query(`SELECT COUNT(*) as recent FROM pdf_files WHERE is_deleted = false AND created_at >= NOW() - INTERVAL '7 days'${!isAdmin ? " AND owner_id = $1" : ""}`, !isAdmin ? [user.id] : []),
    ]);

    res.json({
      totalFiles: parseInt(files.rows[0].total),
      totalSize: parseInt(files.rows[0].total_size || "0"),
      totalPages: parseInt(files.rows[0].total_pages || "0"),
      totalUsers: parseInt(users.rows[0].total),
      activeUsers: parseInt(users.rows[0].active),
      auditEventsToday: parseInt(audit.rows[0].today),
      recentFiles: parseInt(storage.rows[0].recent),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ── User Management (admin only) ──────────────────────────────────────────────

// GET /pdf/api/admin/users
router.get("/users", requireRole(["admin"]), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, role, totp_enabled, is_active, created_at, last_login, session_timeout_minutes FROM pdf_users ORDER BY created_at DESC`
  );
  res.json(rows);
});

// POST /pdf/api/admin/users
router.post("/users", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).pdfUser;
  const { username, email, password, role, sessionTimeoutMinutes } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "Username, email, and password required" });
  if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO pdf_users (id, username, email, password_hash, role, session_timeout_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, email, role, is_active, created_at`,
      [uuidv4(), username, email, hash, role || "viewer", sessionTimeoutMinutes || 240]
    );
    await logAudit({ userId: user.id, username: user.username, action: "user_create", resourceType: "user", resourceId: rows[0].id, resourceName: username, req });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "Username or email already exists" });
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /pdf/api/admin/users/:id
router.put("/users/:id", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).pdfUser;
  const { email, role, isActive, sessionTimeoutMinutes, password } = req.body;
  try {
    let hash: string | undefined;
    if (password) hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `UPDATE pdf_users SET
        email = COALESCE($1, email),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active),
        session_timeout_minutes = COALESCE($4, session_timeout_minutes),
        password_hash = COALESCE($5, password_hash)
       WHERE id = $6 RETURNING id, username, email, role, is_active, session_timeout_minutes`,
      [email || null, role || null, isActive ?? null, sessionTimeoutMinutes || null, hash || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    await logAudit({ userId: user.id, username: user.username, action: "user_update", resourceType: "user", resourceId: req.params.id, req });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /pdf/api/admin/users/:id
router.delete("/users/:id", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).pdfUser;
  if (req.params.id === user.id) return res.status(400).json({ error: "Cannot delete yourself" });
  try {
    const { rows } = await pool.query(`SELECT username FROM pdf_users WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    await pool.query(`UPDATE pdf_users SET is_active = false WHERE id = $1`, [req.params.id]);
    await logAudit({ userId: user.id, username: user.username, action: "user_deactivate", resourceType: "user", resourceId: req.params.id, resourceName: rows[0].username, severity: "warning", req });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────

router.get("/audit", requireRole(["admin"]), async (req, res) => {
  const { page = "1", limit = "100", action, severity, userId, from, to } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let q = `SELECT * FROM pdf_audit_logs WHERE 1=1`;
  const params: any[] = [];
  let pidx = 1;
  if (action) { q += ` AND action ILIKE $${pidx++}`; params.push(`%${action}%`); }
  if (severity) { q += ` AND severity = $${pidx++}`; params.push(severity); }
  if (userId) { q += ` AND user_id = $${pidx++}`; params.push(userId); }
  if (from) { q += ` AND created_at >= $${pidx++}`; params.push(from); }
  if (to) { q += ` AND created_at <= $${pidx++}`; params.push(to); }
  q += ` ORDER BY created_at DESC LIMIT $${pidx++} OFFSET $${pidx++}`;
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await pool.query(q, params);
    const countQ = q.replace(/SELECT \*/, "SELECT COUNT(*)").split("ORDER BY")[0];
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(countQ, countParams);
    res.json({ logs: rows, total: parseInt(countRows[0].count || "0") });
  } catch (err) {
    res.status(500).json({ error: "Failed to get audit logs" });
  }
});

// ── Backups ───────────────────────────────────────────────────────────────────

router.post("/backup", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const archiver = (await import("archiver")).default;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `backup_${timestamp}.zip`;
    const backupPath = getBackupPath(backupName);

    const output = fs.createWriteStream(backupPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);

      const storageDir = path.join(__dirname, "../../storage/files");
      if (fs.existsSync(storageDir)) {
        archive.directory(storageDir, "files");
      }
      archive.finalize();
    });

    const stat = fs.statSync(backupPath);
    const { rows: fileRows } = await pool.query(`SELECT COUNT(*) as cnt FROM pdf_files WHERE is_deleted = false`);

    const { rows } = await pool.query(
      `INSERT INTO pdf_backups (id, filename, storage_path, size_bytes, file_count, status, triggered_by)
       VALUES ($1,$2,$3,$4,$5,'completed',$6) RETURNING *`,
      [uuidv4(), backupName, backupPath, stat.size, parseInt(fileRows[0].cnt), user.username]
    );

    await logAudit({ userId: user.id, username: user.username, action: "backup_created", resourceName: backupName, details: { size: stat.size }, req });
    res.json(rows[0]);
  } catch (err: any) {
    console.error("[Backup]", err);
    res.status(500).json({ error: err.message || "Backup failed" });
  }
});

router.get("/backups", requireRole(["admin"]), async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM pdf_backups ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
});

router.get("/backups/:id/download", requireRole(["admin"]), async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM pdf_backups WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Backup not found" });
  if (!fs.existsSync(rows[0].storage_path)) return res.status(404).json({ error: "Backup file missing" });
  res.download(rows[0].storage_path, rows[0].filename);
});

// My audit log (for non-admins)
router.get("/my-audit", async (req, res) => {
  const user = (req as any).pdfUser;
  const { rows } = await pool.query(
    `SELECT * FROM pdf_audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [user.id]
  );
  res.json(rows);
});

export default router;
