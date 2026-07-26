import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { pool } from "../db.js";
import { encryptBuffer, computeChecksum, getStoragePath } from "../crypto.js";
import { requirePdfAuth } from "../middleware.js";
import { logAudit } from "../audit.js";
import { getPageCount } from "../pdfProcessor.js";

const router = Router();
router.use(requirePdfAuth);

const ERP_BASE = process.env.ERP_INTERNAL_URL || "http://localhost:8080";

async function erpFetch(path: string): Promise<Response> {
  const url = `${ERP_BASE}${path}`;
  return fetch(url, {
    headers: { "Content-Type": "application/json" },
  });
}

// GET /pdf/api/erp/documents — list importable documents from ERP
router.get("/documents", async (req, res) => {
  const user = (req as any).pdfUser;
  const { type = "all", search = "" } = req.query as Record<string, string>;

  try {
    const categories = [
      { key: "agreements", label: "Agreements", path: "/api/agreements" },
      { key: "invoices", label: "Invoices", path: "/api/invoices" },
      { key: "documents", label: "Visa & Travel Docs", path: "/api/documents" },
    ];

    const results: any[] = [];

    for (const cat of categories) {
      if (type !== "all" && type !== cat.key) continue;
      try {
        const resp = await erpFetch(cat.path);
        if (!resp.ok) continue;
        const data: any = await resp.json();
        const items = Array.isArray(data) ? data : data.data || data.agreements || data.invoices || data.documents || [];
        for (const item of items.slice(0, 100)) {
          const label = item.invoice_number || item.booking_number || item.document_type || item.id;
          const name = `${cat.label}: ${label}`;
          if (search && !name.toLowerCase().includes(search.toLowerCase())) continue;
          results.push({
            id: item.id,
            type: cat.key,
            name,
            label,
            createdAt: item.created_at,
            status: item.status,
            customerName: item.customer_name || item.customer_email,
            hasPdf: !!(item.document_url || item.pdf_url || item.agreement_pdf_url),
          });
        }
      } catch (fetchErr) {
        // ERP not reachable — continue gracefully
      }
    }

    res.json({ documents: results, erpReachable: results.length > 0 || true });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch ERP documents" });
  }
});

// POST /pdf/api/erp/import/:type/:id — import a document from ERP
router.post("/import/:type/:id", async (req, res) => {
  const user = (req as any).pdfUser;
  const { type, id } = req.params;

  const pathMap: Record<string, string> = {
    agreements: `/api/agreements/${id}/pdf`,
    invoices: `/api/invoices/${id}/pdf`,
    documents: `/api/documents/${id}/download`,
  };

  const erpPath = pathMap[type];
  if (!erpPath) return res.status(400).json({ error: "Unknown document type" });

  try {
    const resp = await erpFetch(erpPath);
    if (!resp.ok) {
      return res.status(502).json({ error: `ERP returned ${resp.status}: unable to fetch document` });
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) {
      return res.status(502).json({ error: "ERP did not return a PDF" });
    }

    const arrayBuf = await resp.arrayBuffer();
    const pdfBytes = Buffer.from(arrayBuf);
    const checksum = computeChecksum(pdfBytes);
    const encrypted = encryptBuffer(pdfBytes);

    let pageCount = 0;
    try { pageCount = await getPageCount(pdfBytes); } catch {}

    const storageName = `${uuidv4()}.enc`;
    fs.writeFileSync(getStoragePath(storageName), encrypted);

    const fileName = `${type}_${id}.pdf`;
    const fileId = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO pdf_files (id, name, original_name, storage_path, size_bytes, page_count, owner_id, checksum, erp_source, erp_id, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [fileId, fileName, fileName, storageName, pdfBytes.length, pageCount, user.id, checksum, type, id, `Imported from ERP: ${type} ${id}`]
    );
    await pool.query(
      `INSERT INTO pdf_file_versions (id, file_id, version, storage_path, size_bytes, checksum, operation, created_by) VALUES ($1,$2,1,$3,$4,$5,'erp_import',$6)`,
      [uuidv4(), fileId, storageName, pdfBytes.length, checksum, user.id]
    );

    await logAudit({ userId: user.id, username: user.username, action: "erp_import", resourceType: "file", resourceId: fileId, resourceName: fileName, details: { erpType: type, erpId: id }, req });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error("[ERP Import]", err);
    res.status(500).json({ error: err.message || "Import failed" });
  }
});

// GET /pdf/api/erp/status — check ERP connectivity
router.get("/status", async (req, res) => {
  try {
    const resp = await erpFetch("/api/healthz");
    res.json({ connected: resp.ok, status: resp.status, url: ERP_BASE });
  } catch {
    res.json({ connected: false, url: ERP_BASE });
  }
});

export default router;
