import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { decryptBuffer, encryptBuffer, computeChecksum, getStoragePath, getTempPath } from "../crypto.js";
import { requirePdfAuth, requireRole } from "../middleware.js";
import { logAudit } from "../audit.js";
import * as PDF from "../pdfProcessor.js";
import { validatePdfBuffer } from "../pdfProcessor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
router.use(requirePdfAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// Helper: read decrypted PDF bytes by file ID
async function readPdfBytes(fileId: string, userId: string, role: string): Promise<{ bytes: Buffer; file: any }> {
  const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1 AND is_deleted = false`, [fileId]);
  if (!rows[0]) throw Object.assign(new Error("File not found"), { status: 404 });
  if (role !== "admin" && rows[0].owner_id !== userId) throw Object.assign(new Error("Access denied"), { status: 403 });
  const encrypted = fs.readFileSync(getStoragePath(rows[0].storage_path));
  return { bytes: decryptBuffer(encrypted), file: rows[0] };
}

// Helper: save processed PDF as new version of an existing file OR create new file
async function saveProcessedPdf(
  pdfBytes: Buffer,
  originalFile: any,
  operation: string,
  userId: string,
  saveAs?: string
): Promise<any> {
  // ── Output validation ─────────────────────────────────────────────────────
  if (!pdfBytes || pdfBytes.length < 100) {
    throw Object.assign(
      new Error(`${operation}: processing produced empty output (${pdfBytes?.length ?? 0} bytes)`),
      { status: 500 }
    );
  }
  const header = pdfBytes.slice(0, 8).toString("ascii");
  if (!header.startsWith("%PDF-")) {
    throw Object.assign(
      new Error(`${operation}: output is not a valid PDF (header: "${header.slice(0, 8)}")`),
      { status: 500 }
    );
  }
  if (!validatePdfBuffer(pdfBytes)) {
    throw Object.assign(
      new Error(`${operation}: output PDF is missing %%EOF trailer — file would be corrupt`),
      { status: 500 }
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  const checksum = computeChecksum(pdfBytes);
  const encrypted = encryptBuffer(pdfBytes);
  let pageCount = 0;
  try { pageCount = await PDF.getPageCount(pdfBytes); } catch {}

  const storageName = `${uuidv4()}.enc`;
  fs.writeFileSync(getStoragePath(storageName), encrypted);

  const newVersion = (originalFile.current_version || 1) + 1;
  const newName = saveAs || originalFile.name;

  // Update existing file record
  await pool.query(
    `UPDATE pdf_files SET storage_path=$1, checksum=$2, size_bytes=$3, page_count=$4, current_version=$5, name=$6, updated_at=NOW() WHERE id=$7`,
    [storageName, checksum, pdfBytes.length, pageCount, newVersion, newName, originalFile.id]
  );

  // Create version record
  await pool.query(
    `INSERT INTO pdf_file_versions (id, file_id, version, storage_path, size_bytes, checksum, operation, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uuidv4(), originalFile.id, newVersion, storageName, pdfBytes.length, checksum, operation, userId]
  );

  const { rows } = await pool.query(`SELECT * FROM pdf_files WHERE id = $1`, [originalFile.id]);
  return rows[0];
}

// POST /pdf/api/pdf/merge
router.post("/merge", upload.array("files"), async (req, res) => {
  const user = (req as any).pdfUser;
  const files = req.files as Express.Multer.File[];
  const { fileIds } = req.body;

  try {
    let buffers: Buffer[] = [];

    // From uploaded files
    if (files?.length) buffers = files.map((f) => f.buffer);

    // From stored file IDs
    if (fileIds) {
      const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
      for (const id of ids) {
        const { bytes } = await readPdfBytes(id, user.id, user.role);
        buffers.push(bytes);
      }
    }

    if (buffers.length < 2) return res.status(400).json({ error: "Need at least 2 PDFs to merge" });

    const merged = await PDF.mergePdfs(buffers);
    const checksum = computeChecksum(merged);
    const encrypted = encryptBuffer(merged);
    const pageCount = await PDF.getPageCount(merged);
    const storageName = `${uuidv4()}.enc`;
    fs.writeFileSync(getStoragePath(storageName), encrypted);

    const fileId = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO pdf_files (id, name, original_name, storage_path, size_bytes, page_count, owner_id, checksum, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [fileId, req.body.outputName || "merged.pdf", "merged.pdf", storageName, merged.length, pageCount, user.id, checksum, "Merged PDF"]
    );
    await pool.query(
      `INSERT INTO pdf_file_versions (id, file_id, version, storage_path, size_bytes, checksum, operation, created_by) VALUES ($1,$2,1,$3,$4,$5,'merge',$6)`,
      [uuidv4(), fileId, storageName, merged.length, checksum, user.id]
    );
    await logAudit({ userId: user.id, username: user.username, action: "pdf_merge", resourceType: "file", resourceId: fileId, details: { sourceCount: buffers.length }, req });
    res.json(rows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Merge failed" });
  }
});

// POST /pdf/api/pdf/split
router.post("/split/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  const { ranges } = req.body; // [{ start, end, name }]
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const results = await PDF.splitPdf(bytes, ranges);
    const created = [];
    for (const result of results) {
      const checksum = computeChecksum(result.buffer);
      const encrypted = encryptBuffer(result.buffer);
      const pageCount = await PDF.getPageCount(result.buffer);
      const storageName = `${uuidv4()}.enc`;
      fs.writeFileSync(getStoragePath(storageName), encrypted);
      const fileId = uuidv4();
      const { rows } = await pool.query(
        `INSERT INTO pdf_files (id, name, original_name, storage_path, size_bytes, page_count, owner_id, checksum, folder_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [fileId, result.name, result.name, storageName, result.buffer.length, pageCount, user.id, checksum, file.folder_id || null]
      );
      await pool.query(`INSERT INTO pdf_file_versions (id, file_id, version, storage_path, size_bytes, checksum, operation, created_by) VALUES ($1,$2,1,$3,$4,$5,'split',$6)`,
        [uuidv4(), fileId, storageName, result.buffer.length, checksum, user.id]);
      created.push(rows[0]);
    }
    await logAudit({ userId: user.id, username: user.username, action: "pdf_split", resourceType: "file", resourceId: req.params.fileId, details: { parts: results.length }, req });
    res.json(created);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Split failed" });
  }
});

// POST /pdf/api/pdf/compress/:fileId
router.post("/compress/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const compressed = await PDF.compressPdf(bytes);
    const saved = await saveProcessedPdf(compressed, file, "compress", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_compress", resourceType: "file", resourceId: req.params.fileId, details: { originalSize: bytes.length, newSize: compressed.length }, req });
    res.json({ ...saved, originalSize: bytes.length, newSize: compressed.length, reduction: Math.round((1 - compressed.length / bytes.length) * 100) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Compress failed" });
  }
});

// POST /pdf/api/pdf/rotate/:fileId
router.post("/rotate/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  const { rotations } = req.body; // [{ page, angle }]
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const rotated = await PDF.rotatePdf(bytes, rotations);
    const saved = await saveProcessedPdf(rotated, file, "rotate", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_rotate", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Rotate failed" });
  }
});

// POST /pdf/api/pdf/reorder/:fileId
router.post("/reorder/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  const { pageOrder } = req.body; // [3, 1, 2] — new order as 1-based page numbers
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const reordered = await PDF.reorderPages(bytes, pageOrder);
    const saved = await saveProcessedPdf(reordered, file, "reorder", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_reorder", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Reorder failed" });
  }
});

// POST /pdf/api/pdf/watermark/:fileId
router.post("/watermark/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot edit PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const watermarked = await PDF.addWatermark(bytes, req.body);
    const saved = await saveProcessedPdf(watermarked, file, "watermark", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_watermark", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Watermark failed" });
  }
});

// POST /pdf/api/pdf/annotate/:fileId
router.post("/annotate/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot annotate PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const annotated = await PDF.addTextAnnotation(bytes, req.body);
    const saved = await saveProcessedPdf(annotated, file, "annotate", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_annotate", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Annotate failed" });
  }
});

// POST /pdf/api/pdf/signature/:fileId
router.post("/signature/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot sign PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const signed = await PDF.addSignature(bytes, { ...req.body, signerName: req.body.signerName || user.username });
    const saved = await saveProcessedPdf(signed, file, "signature", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_sign", resourceType: "file", resourceId: req.params.fileId, severity: "info", req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Signature failed" });
  }
});

// POST /pdf/api/pdf/qrcode/:fileId
router.post("/qrcode/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot edit PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const result = await PDF.addQrCode(bytes, req.body);
    const saved = await saveProcessedPdf(result, file, "qrcode", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_qrcode", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "QR code failed" });
  }
});

// POST /pdf/api/pdf/metadata/:fileId — read metadata
router.get("/metadata/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { bytes } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const meta = await PDF.getMetadata(bytes);
    res.json(meta);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Metadata read failed" });
  }
});

// PUT /pdf/api/pdf/metadata/:fileId — write metadata
router.put("/metadata/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot edit PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const updated = await PDF.editMetadata(bytes, req.body);
    const saved = await saveProcessedPdf(updated, file, "metadata_edit", user.id);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_metadata_edit", resourceType: "file", resourceId: req.params.fileId, req });
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Metadata update failed" });
  }
});

// POST /pdf/api/pdf/unlock/:fileId — bypass PDF password protection automatically
router.post("/unlock/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const unlocked = await PDF.unlockPdf(bytes);

    // Name the output  example_unlocked.pdf  (not  example.pdf)
    const baseName = file.name.replace(/\.pdf$/i, "");
    const unlockName = `${baseName}_unlocked.pdf`;

    const saved = await saveProcessedPdf(unlocked, file, "unlock", user.id, unlockName);
    await pool.query(`UPDATE pdf_files SET has_password = false WHERE id = $1`, [file.id]);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_unlock", resourceType: "file", resourceId: req.params.fileId, severity: "warning", req });
    res.json(saved);
  } catch (err: any) {
    console.error("unlock error:", err);
    res.status(400).json({ error: err.message || "Could not bypass PDF password protection" });
  }
});

// POST /pdf/api/pdf/page-numbers/:fileId
router.post("/page-numbers/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot edit PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const result = await PDF.addPageNumbers(bytes, req.body);
    const saved = await saveProcessedPdf(result, file, "page_numbers", user.id);
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed" });
  }
});

// POST /pdf/api/pdf/header-footer/:fileId
router.post("/header-footer/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role === "viewer") return res.status(403).json({ error: "Viewers cannot edit PDFs" });
  try {
    const { bytes, file } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const result = await PDF.addHeaderFooter(bytes, req.body);
    const saved = await saveProcessedPdf(result, file, "header_footer", user.id);
    res.json(saved);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed" });
  }
});

// POST /pdf/api/pdf/extract-text/:fileId
router.post("/extract-text/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { bytes } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const text = await PDF.extractText(bytes);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_extract_text", resourceType: "file", resourceId: req.params.fileId, req });
    res.json({ text, wordCount: text.split(/\s+/).filter(Boolean).length });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Text extraction failed" });
  }
});

// POST /pdf/api/pdf/compare
router.post("/compare", async (req, res) => {
  const user = (req as any).pdfUser;
  const { fileIdA, fileIdB } = req.body;
  if (!fileIdA || !fileIdB) return res.status(400).json({ error: "Both file IDs required" });
  try {
    const { bytes: bytesA } = await readPdfBytes(fileIdA, user.id, user.role);
    const { bytes: bytesB } = await readPdfBytes(fileIdB, user.id, user.role);
    const result = await PDF.comparePdfs(bytesA, bytesB);
    await logAudit({ userId: user.id, username: user.username, action: "pdf_compare", details: { fileIdA, fileIdB, similarity: result.similarity }, req });
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Comparison failed" });
  }
});

// GET /pdf/api/pdf/page-info/:fileId
router.get("/page-info/:fileId", async (req, res) => {
  const user = (req as any).pdfUser;
  try {
    const { bytes } = await readPdfBytes(req.params.fileId, user.id, user.role);
    const info = await PDF.getPageInfo(bytes);
    res.json(info);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || "Failed" });
  }
});

export default router;
