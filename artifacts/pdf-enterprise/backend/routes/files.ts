import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { encryptBuffer, decryptBuffer, computeChecksum, secureDelete, getStoragePath } from "../crypto.js";
import { logAudit } from "../audit.js";
import { requirePdfAuth, requireRole } from "../middleware.js";
import { getPageCount } from "../pdfProcessor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// All file routes require auth
router.use(requirePdfAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// GET /pdf/api/files — list files
router.get("/", async (req, res) => {
  try {
    const user = (req as any).pdfUser;
    const { folder, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT f.id, f.name, f.original_name, f.size_bytes, f.page_count,
             f.folder_id, f.owner_id, f.checksum, f.erp_source, f.erp_id,
             f.has_password, f.tags, f.description, f.current_version,
             f.created_at, f.updated_at, f.is_deleted,
             u.username as owner_name,
             fo.name as folder_name
      FROM pdf_files f
      LEFT JOIN pdf_users u ON u.id = f.owner_id
      LEFT JOIN pdf_folders fo ON fo.id = f.folder_id
      WHERE f.is_deleted = false
    `;
    const params: any[] = [];
    let pidx = 1;
    
    // Non-admins can only see their own files
    if (user.role !== "admin") {
      query += ` AND f.owner_id = $${pidx++}`;
      params.push(user.id);
    }
    if (folder && folder !== "root") {
      query += ` AND f.folder_id = $${pidx++}`;
      params.push(folder);
    } else if (folder === "root") {
      query += ` AND f.folder_id IS NULL`;
    }
    if (search) {
      query += ` AND (f.name ILIKE $${pidx++} OR f.description ILIKE $${pidx - 1})`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY f.updated_at DESC LIMIT $${pidx++} OFFSET $${pidx++}`;
    params.push(parseInt(limit), offset);
    
    const { rows } = await pool.query(query, params);
    const countRes = await pool.query(`SELECT COUNT(*) as cnt FROM pdf_files WHERE is_deleted = false${user.role !== "admin" ? " AND owner_id = $1" : ""}`, user.role !== "admin" ? [user.id] : []);
    
    res.json({ files: rows, total: parseInt(countRes.rows[0].cnt), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// POST /pdf/api/files/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const user = (req as any).pdfUser;

  try {
    const { folder, description, tags } = req.body;
    const pdfBytes = req.file.buffer;
    const checksum = computeChecksum(pdfBytes);
    const encrypted = encryptBuffer(pdfBytes);
    
    let pageCount = 0;
    try { pageCount = await getPageCount(pdfBytes); } catch {}

    const fileId = uuidv4();
    const storageName = `${fileId}.enc`;
    const storagePath = getStoragePath(storageName);
    fs.writeFileSync(storagePath, encrypted);

    const tagArray = tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t: string) => t.trim())) : [];

    const { rows } = await pool.query(
      `INSERT INTO pdf_files (id, name, original_name, storage_path, size_bytes, page_count, folder_id, owner_id, checksum, tags, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [fileId, req.file.originalname, req.file.originalname, storageName, pdfBytes.length, pageCount, folder || null, user.id, checksum, tagArray, description || null]
    );

    // Create version 1 record
    await pool.query(
      `INSERT INTO pdf_file_versions (id, file_id, version, storage_path, size_bytes, checksum, operation, created_by)
       VALUES ($1,$2,1,$3,$4,$5,'upload',$6)`,
      [uuidv4(), fileId, storageName, pdfBytes.length, checksum, user.id]
    );

    await logAudit({ userId: user.id, username: user.username, action: "file_upload", resourceType: "file", resourceId: fileId, resourceName: req.file.originalname, details: { size: pdfBytes.length, pageCount }, req });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// GET /pdf/api/files/:id — file metadata
router.get("/:id", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.username as owner_name, fo.name as folder_name
       FROM pdf_files f
       LEFT JOIN pdf_users u ON u.id = f.owner_id
       LEFT JOIN pdf_folders fo ON fo.id = f.folder_id
       WHERE f.id = $1 AND f.is_deleted = false`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    if (user.role !== "admin" && rows[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to get file" });
  }
});

// GET /pdf/api/files/:id/view — serve decrypted PDF for viewing
router.get("/:id/view", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    if (user.role !== "admin" && rows[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    const storagePath = getStoragePath(rows[0].storage_path);
    const encrypted = fs.readFileSync(storagePath);
    const pdfBytes = decryptBuffer(encrypted);

    await logAudit({ userId: user.id, username: user.username, action: "file_view", resourceType: "file", resourceId: req.params.id, resourceName: rows[0].name, req });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rows[0].name}"`,
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store",
    });
    res.send(pdfBytes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

// GET /pdf/api/files/:id/download — download decrypted PDF
router.get("/:id/download", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "File not found" });
    if (user.role !== "admin" && rows[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    const storagePath = getStoragePath(rows[0].storage_path);
    const encrypted = fs.readFileSync(storagePath);
    const pdfBytes = decryptBuffer(encrypted);

    await logAudit({ userId: user.id, username: user.username, action: "file_download", resourceType: "file", resourceId: req.params.id, resourceName: rows[0].name, req });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${rows[0].original_name}"`,
      "Content-Length": String(pdfBytes.length),
    });
    res.send(pdfBytes);
  } catch (err) {
    res.status(500).json({ error: "Failed to download file" });
  }
});

// PUT /pdf/api/files/:id — update metadata
router.put("/:id", async (req, res) => {
  const user = (req as any).pdfUser;
  const { name, description, tags, folderId } = req.body;
  try {
    const { rows: check } = await pool.query(`SELECT owner_id FROM pdf_files WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (!check[0]) return res.status(404).json({ error: "Not found" });
    if (user.role !== "admin" && check[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    const tagArray = tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t: string) => t.trim())) : undefined;
    const { rows } = await pool.query(
      `UPDATE pdf_files SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        tags = COALESCE($3, tags),
        folder_id = $4,
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name || null, description || null, tagArray ? tagArray : null, folderId || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE /pdf/api/files/:id — soft delete
router.delete("/:id", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (user.role !== "admin" && rows[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    await pool.query(
      `UPDATE pdf_files SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [user.id, req.params.id]
    );
    await logAudit({ userId: user.id, username: user.username, action: "file_delete", resourceType: "file", resourceId: req.params.id, resourceName: rows[0].name, severity: "warning", req });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// DELETE /pdf/api/files/:id/permanent — secure delete (admin only)
router.delete("/:id/permanent", requireRole(["admin"]), async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    // Secure-delete all version files
    const { rows: versions } = await pool.query(`SELECT storage_path FROM pdf_file_versions WHERE file_id = $1`, [req.params.id]);
    for (const v of versions) {
      try { secureDelete(getStoragePath(v.storage_path)); } catch {}
    }
    try { secureDelete(getStoragePath(rows[0].storage_path)); } catch {}

    await pool.query(`DELETE FROM pdf_file_versions WHERE file_id = $1`, [req.params.id]);
    await pool.query(`DELETE FROM pdf_files WHERE id = $1`, [req.params.id]);
    await logAudit({ userId: user.id, username: user.username, action: "file_permanent_delete", resourceType: "file", resourceId: req.params.id, resourceName: rows[0].name, severity: "critical", req });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Permanent delete failed" });
  }
});

// GET /pdf/api/files/:id/versions
router.get("/:id/versions", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows: check } = await pool.query(`SELECT owner_id FROM pdf_files WHERE id = $1`, [req.params.id]);
    if (!check[0]) return res.status(404).json({ error: "Not found" });
    if (user.role !== "admin" && check[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    const { rows } = await pool.query(
      `SELECT v.*, u.username as created_by_name FROM pdf_file_versions v
       LEFT JOIN pdf_users u ON u.id = v.created_by
       WHERE v.file_id = $1 ORDER BY v.version DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get versions" });
  }
});

// GET /pdf/api/files/:id/tamper-check
router.get("/:id/tamper-check", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (user.role !== "admin" && rows[0].owner_id !== user.id) return res.status(403).json({ error: "Access denied" });

    const storagePath = getStoragePath(rows[0].storage_path);
    const encrypted = fs.readFileSync(storagePath);
    const pdfBytes = decryptBuffer(encrypted);
    const currentHash = computeChecksum(pdfBytes);
    const tampered = currentHash !== rows[0].checksum;

    await logAudit({ userId: user.id, username: user.username, action: "tamper_check", resourceType: "file", resourceId: req.params.id, details: { tampered }, severity: tampered ? "critical" : "info", req });
    res.json({ tampered, currentHash, storedHash: rows[0].checksum, status: tampered ? "TAMPERED" : "INTACT" });
  } catch (err) {
    res.status(500).json({ error: "Tamper check failed" });
  }
});

// GET /pdf/api/files/folders/list
router.get("/folders/list", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM pdf_folders WHERE owner_id = $1 OR $2 = 'admin' ORDER BY name`,
      [user.id, user.role]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list folders" });
  }
});

// POST /pdf/api/files/folders
router.post("/folders", async (req, res) => {
  const user = (req as any).pdfUser;
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO pdf_folders (id, name, parent_id, owner_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uuidv4(), name, parentId || null, user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create folder" });
  }
});

export default router;
