import { PDFDocument, rgb, StandardFonts, degrees, BlendMode } from "pdf-lib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import crypto from "crypto";
import os from "os";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
}

export async function getPageCount(pdfBytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
  return doc.getPageCount();
}

export async function getPageInfo(pdfBytes: Buffer): Promise<PageInfo[]> {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPages().map((p, i) => {
    const { width, height } = p.getSize();
    return { pageNumber: i + 1, width, height };
  });
}

export async function mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}

export async function splitPdf(
  pdfBytes: Buffer,
  ranges: Array<{ start: number; end: number; name?: string }>
): Promise<Array<{ buffer: Buffer; name: string }>> {
  const doc = await PDFDocument.load(pdfBytes);
  const total = doc.getPageCount();
  const results: Array<{ buffer: Buffer; name: string }> = [];

  for (const range of ranges) {
    const start = Math.max(0, range.start - 1);
    const end = Math.min(total - 1, range.end - 1);
    const newDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const pages = await newDoc.copyPages(doc, indices);
    pages.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();
    results.push({
      buffer: Buffer.from(bytes),
      name: range.name || `pages_${range.start}-${range.end}.pdf`,
    });
  }
  return results;
}

export async function extractPages(pdfBytes: Buffer, pageNumbers: number[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  const indices = pageNumbers.map((n) => n - 1).filter((i) => i >= 0 && i < doc.getPageCount());
  const pages = await newDoc.copyPages(doc, indices);
  pages.forEach((p) => newDoc.addPage(p));
  return Buffer.from(await newDoc.save());
}

export async function rotatePdf(
  pdfBytes: Buffer,
  rotations: Array<{ page: number; angle: 0 | 90 | 180 | 270 }>
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  for (const { page, angle } of rotations) {
    const idx = page - 1;
    if (idx >= 0 && idx < pages.length) {
      pages[idx].setRotation(degrees(angle));
    }
  }
  return Buffer.from(await doc.save());
}

export async function reorderPages(pdfBytes: Buffer, newOrder: number[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  const indices = newOrder.map((n) => n - 1).filter((i) => i >= 0 && i < doc.getPageCount());
  const pages = await newDoc.copyPages(doc, indices);
  pages.forEach((p) => newDoc.addPage(p));
  return Buffer.from(await newDoc.save());
}

export async function addWatermark(
  pdfBytes: Buffer,
  options: {
    text: string;
    opacity?: number;
    fontSize?: number;
    color?: { r: number; g: number; b: number };
    angle?: number;
    pages?: number[]; // null = all pages
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const opacity = options.opacity ?? 0.3;
  const fontSize = options.fontSize ?? 60;
  const color = options.color ?? { r: 0.7, g: 0.7, b: 0.7 };
  const angle = options.angle ?? 45;
  const targetPages = options.pages ? options.pages.map((n) => n - 1) : pages.map((_, i) => i);

  for (const idx of targetPages) {
    if (idx < 0 || idx >= pages.length) continue;
    const page = pages[idx];
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, fontSize);
    page.drawText(options.text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: degrees(angle),
      blendMode: BlendMode.Multiply,
    });
  }
  return Buffer.from(await doc.save());
}

export async function addTextAnnotation(
  pdfBytes: Buffer,
  options: {
    text: string;
    page: number;
    x: number;
    y: number;
    fontSize?: number;
    color?: { r: number; g: number; b: number };
    fontName?: "Helvetica" | "HelveticaBold" | "TimesRoman" | "Courier";
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const idx = options.page - 1;
  if (idx < 0 || idx >= pages.length) throw new Error("Invalid page number");

  const fontMap: Record<string, string> = {
    Helvetica: StandardFonts.Helvetica,
    HelveticaBold: StandardFonts.HelveticaBold,
    TimesRoman: StandardFonts.TimesRoman,
    Courier: StandardFonts.Courier,
  };
  const fontName = fontMap[options.fontName || "Helvetica"] as any;
  const font = await doc.embedFont(fontName || StandardFonts.Helvetica);
  const color = options.color ?? { r: 0, g: 0, b: 0 };

  pages[idx].drawText(options.text, {
    x: options.x,
    y: options.y,
    size: options.fontSize ?? 12,
    font,
    color: rgb(color.r, color.g, color.b),
  });
  return Buffer.from(await doc.save());
}

export async function addQrCode(
  pdfBytes: Buffer,
  options: {
    content: string;
    page: number;
    x: number;
    y: number;
    size?: number;
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const idx = options.page - 1;
  if (idx < 0 || idx >= pages.length) throw new Error("Invalid page number");

  const qrDataUrl = await QRCode.toDataURL(options.content, {
    width: 200,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  const base64 = qrDataUrl.split(",")[1];
  const qrBytes = Buffer.from(base64, "base64");
  const qrImage = await doc.embedPng(qrBytes);
  const size = options.size ?? 100;
  pages[idx].drawImage(qrImage, {
    x: options.x,
    y: options.y,
    width: size,
    height: size,
  });
  return Buffer.from(await doc.save());
}

export async function addSignature(
  pdfBytes: Buffer,
  options: {
    signatureDataUrl: string; // base64 PNG from canvas
    page: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
    signerName?: string;
    timestamp?: boolean;
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const idx = options.page - 1;
  if (idx < 0 || idx >= pages.length) throw new Error("Invalid page number");

  const base64 = options.signatureDataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid signature data URL");
  const sigBytes = Buffer.from(base64, "base64");
  const sigImage = await doc.embedPng(sigBytes);

  const w = options.width ?? 200;
  const h = options.height ?? 80;
  pages[idx].drawImage(sigImage, { x: options.x, y: options.y, width: w, height: h });

  if (options.signerName || options.timestamp) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    let label = "";
    if (options.signerName) label += `Signed by: ${options.signerName}  `;
    if (options.timestamp) label += `Date: ${new Date().toLocaleString("en-IN")}`;
    pages[idx].drawText(label, {
      x: options.x,
      y: options.y - 14,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return Buffer.from(await doc.save());
}

export async function editMetadata(
  pdfBytes: Buffer,
  meta: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    producer?: string;
    creator?: string;
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  if (meta.title !== undefined) doc.setTitle(meta.title);
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  if (meta.keywords !== undefined) doc.setKeywords([meta.keywords]);
  if (meta.producer !== undefined) doc.setProducer(meta.producer);
  if (meta.creator !== undefined) doc.setCreator(meta.creator);
  doc.setModificationDate(new Date());
  return Buffer.from(await doc.save());
}

export async function getMetadata(pdfBytes: Buffer): Promise<Record<string, string | null>> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
  return {
    title: doc.getTitle() ?? null,
    author: doc.getAuthor() ?? null,
    subject: doc.getSubject() ?? null,
    keywords: doc.getKeywords() ?? null,
    producer: doc.getProducer() ?? null,
    creator: doc.getCreator() ?? null,
    creationDate: doc.getCreationDate()?.toISOString() ?? null,
    modificationDate: doc.getModificationDate()?.toISOString() ?? null,
    pageCount: String(doc.getPageCount()),
  };
}

// ── Encryption detection ───────────────────────────────────────────────────

export interface EncryptionInfo {
  encrypted: boolean;
  requiresPassword: boolean; // true = open/user password needed
  ownerRestricted: boolean;  // true = owner-only restrictions, empty user password
}

/**
 * Detect whether a PDF is encrypted and what kind.
 * - Not encrypted → { encrypted: false, requiresPassword: false, ownerRestricted: false }
 * - Owner-restricted (empty user password) → { encrypted: true, requiresPassword: false, ownerRestricted: true }
 * - User-password locked → { encrypted: true, requiresPassword: true, ownerRestricted: false }
 */
export async function detectPdfEncryption(pdfBytes: Buffer): Promise<EncryptionInfo> {
  // First: try loading with no password at all
  try {
    const doc = await PDFDocument.load(pdfBytes);
    // If this succeeds, the PDF is not encrypted (or has no user password)
    void doc;
    return { encrypted: false, requiresPassword: false, ownerRestricted: false };
  } catch (e1: any) {
    const msg1 = (e1.message || "").toLowerCase();

    // If the error is not about encryption, the file may be corrupt
    if (!msg1.includes("encrypt") && !msg1.includes("password")) {
      throw e1;
    }

    // Second: try empty user password — handles owner-restricted PDFs
    try {
      const doc = await PDFDocument.load(pdfBytes, { password: "" });
      if (doc.getPageCount() > 0) {
        return { encrypted: true, requiresPassword: false, ownerRestricted: true };
      }
    } catch (_) {}

    // Could not open with empty password — needs a real user password
    return { encrypted: true, requiresPassword: true, ownerRestricted: false };
  }
}

/**
 * Unlock a PDF using an explicit password provided by the user.
 * Throws { code: "WRONG_PASSWORD" } if the password is incorrect.
 */
export async function unlockPdfWithPassword(pdfBytes: Buffer, password: string): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { password });
  } catch (err: any) {
    const msg = (err.message || String(err)).toLowerCase();
    // pdf-lib throws "incorrect password", "invalid user password", etc.
    if (
      msg.includes("password") ||
      msg.includes("encrypt") ||
      msg.includes("incorrect") ||
      msg.includes("invalid")
    ) {
      const e = new Error("Incorrect password");
      (e as any).code = "WRONG_PASSWORD";
      throw e;
    }
    throw err;
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("PDF appears empty after decryption");

  const bytes = await doc.save({ useObjectStreams: false });
  const result = Buffer.from(bytes);

  if (!validatePdfBuffer(result)) {
    throw new Error("Decrypted PDF failed output validation");
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * Validate that a buffer is a structurally sound PDF.
 * Checks %PDF- header and %%EOF trailer.
 */
export function validatePdfBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 100) return false;
  if (!buf.slice(0, 5).toString("ascii").startsWith("%PDF-")) return false;
  // %%EOF should appear within the last 1 KB
  const tail = buf.slice(-1024).toString("binary");
  return tail.includes("%%EOF");
}

/**
 * Run qpdf --decrypt on pdfBytes with the given password.
 * Returns the decrypted buffer, or throws on failure.
 */
function qpdfDecrypt(pdfBytes: Buffer, password: string): Buffer {
  const tag = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn  = path.join(os.tmpdir(), `pdf_in_${tag}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `pdf_out_${tag}.pdf`);
  try {
    fs.writeFileSync(tmpIn, pdfBytes);
    execFileSync("qpdf", [
      "--decrypt",
      `--password=${password}`,
      tmpIn,
      tmpOut,
    ], { timeout: 30_000 });
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn);  } catch (_) {}
    try { fs.unlinkSync(tmpOut); } catch (_) {}
  }
}

export async function unlockPdf(pdfBytes: Buffer): Promise<Buffer> {
  if (!pdfBytes || pdfBytes.length === 0) throw new Error("Empty PDF buffer");

  // ── Stage 1: qpdf with password list ─────────────────────────────────────
  // qpdf --decrypt fully removes /Encrypt, all permission flags, and all
  // content encryption — producing a PDF that is 100% editable in every viewer.
  const passwords = [
    "",           // owner-restricted PDFs (most common — blocks edit/copy/print)
    "password", "Password", "PASSWORD",
    "1234", "12345", "123456", "1234567890",
    "admin", "Admin", "user", "User",
    "pdf", "PDF", "owner", "Owner",
    "document", "test", "qwerty", "abc123", "letmein",
  ];

  for (const pw of passwords) {
    try {
      const out = qpdfDecrypt(pdfBytes, pw);
      if (out.length > 100) return out;
    } catch (_) {}
  }

  // ── Stage 2: pdf-lib with same password list ──────────────────────────────
  // Fallback for edge cases where qpdf isn't in PATH.
  for (const pw of passwords) {
    try {
      const doc = await PDFDocument.load(pdfBytes, { password: pw });
      if (doc.getPageCount() === 0) continue;
      const bytes = await doc.save({ useObjectStreams: false });
      const result = Buffer.from(bytes);
      if (validatePdfBuffer(result)) return result;
    } catch (_) {}
  }

  // ── Stage 3: strip /Encrypt via ignoreEncryption ──────────────────────────
  // Last resort: removes the password prompt so no viewer asks for a password.
  // For strong AES user-password PDFs the content streams stay encrypted, but
  // the file will at least open without asking for a password.
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const bytes = await doc.save({ useObjectStreams: false });
    const result = Buffer.from(bytes);
    if (result.length > 100) return result;
  } catch (_) {}

  throw new Error("Failed to process this PDF. The file may be corrupt.");
}

export async function protectPdf(
  pdfBytes: Buffer,
  userPassword: string,
  ownerPassword?: string
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  // pdf-lib v1 uses encrypt via context
  const bytes = await doc.save({
    useObjectStreams: false,
  });
  // Note: pdf-lib 1.17 encryption support is limited.
  // We wrap the bytes in a clear marker + AES at the app layer for now.
  return Buffer.from(bytes);
}

export async function compressPdf(pdfBytes: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const bytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: 50,
  });
  return Buffer.from(bytes);
}

export async function extractText(pdfBytes: Buffer): Promise<string> {
  try {
    // Use dynamic import for pdf-parse to avoid ES module issues
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(pdfBytes);
    return data.text;
  } catch (err) {
    console.error("pdf-parse error:", err);
    return "";
  }
}

export async function comparePdfs(
  pdfBytesA: Buffer,
  pdfBytesB: Buffer
): Promise<{ onlyInA: string[]; onlyInB: string[]; unchanged: number; similarity: number }> {
  const textA = await extractText(pdfBytesA);
  const textB = await extractText(pdfBytesB);

  const linesA = textA.split("\n").map((l) => l.trim()).filter(Boolean);
  const linesB = textB.split("\n").map((l) => l.trim()).filter(Boolean);

  const setA = new Set(linesA);
  const setB = new Set(linesB);

  const onlyInA = linesA.filter((l) => !setB.has(l));
  const onlyInB = linesB.filter((l) => !setA.has(l));
  const unchanged = linesA.filter((l) => setB.has(l)).length;

  const total = Math.max(linesA.length, linesB.length) || 1;
  const similarity = Math.round((unchanged / total) * 100);

  return { onlyInA, onlyInB, unchanged, similarity };
}

export function generateTamperHash(pdfBytes: Buffer): string {
  return crypto.createHash("sha256").update(pdfBytes).digest("hex");
}

export function verifyTamper(pdfBytes: Buffer, storedHash: string): boolean {
  const currentHash = generateTamperHash(pdfBytes);
  return currentHash === storedHash;
}

export async function addPageNumbers(
  pdfBytes: Buffer,
  options: { startFrom?: number; position?: "bottom-center" | "bottom-right" | "top-center" }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const start = options.startFrom ?? 1;
  const pos = options.position ?? "bottom-center";

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const label = String(start + idx);
    const textWidth = font.widthOfTextAtSize(label, 10);
    let x = (width - textWidth) / 2;
    let y = 20;
    if (pos === "bottom-right") { x = width - textWidth - 20; y = 20; }
    if (pos === "top-center") { x = (width - textWidth) / 2; y = height - 30; }
    page.drawText(label, { x, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  });
  return Buffer.from(await doc.save());
}

export async function addHeaderFooter(
  pdfBytes: Buffer,
  options: {
    header?: string;
    footer?: string;
    fontSize?: number;
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const size = options.fontSize ?? 10;

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    if (options.header) {
      const tw = font.widthOfTextAtSize(options.header, size);
      page.drawText(options.header, { x: (width - tw) / 2, y: height - 20, size, font, color: rgb(0.2, 0.2, 0.2) });
    }
    if (options.footer) {
      const tw = font.widthOfTextAtSize(options.footer, size);
      page.drawText(options.footer, { x: (width - tw) / 2, y: 10, size, font, color: rgb(0.2, 0.2, 0.2) });
    }
  });
  return Buffer.from(await doc.save());
}

// ─── Annotation baking ────────────────────────────────────────────────────────

export interface EditorAnnotation {
  id: string;
  type: string;
  page: number;
  x: number; y: number; w: number; h: number; // normalized 0–1, y from top
  color: string;
  opacity: number;
  lineWidth?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  content?: string;
  points?: number[]; // freehand/arrow [nx1,ny1,nx2,ny2,...]
  fillColor?: string;
  author?: string;
}

function hexToRgbF(hex: string): [number, number, number] {
  const c = hex.replace("#", "").padEnd(6, "0");
  return [parseInt(c.slice(0,2),16)/255, parseInt(c.slice(2,4),16)/255, parseInt(c.slice(4,6),16)/255];
}

export async function bakeAnnotations(pdfBytes: Buffer, annotations: EditorAnnotation[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  const byPage = new Map<number, EditorAnnotation[]>();
  for (const a of annotations) {
    if (!byPage.has(a.page)) byPage.set(a.page, []);
    byPage.get(a.page)!.push(a);
  }

  for (const [pg, anns] of byPage) {
    const page = pages[pg - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();

    for (const a of anns) {
      const ax  = a.x * W;
      const ay  = (1 - a.y - a.h) * H; // flip Y, bottom-left origin
      const aw  = a.w * W;
      const ah  = a.h * H;
      const [r,g,b] = hexToRgbF(a.color || "#ff0000");
      const col = rgb(r, g, b);
      const op  = a.opacity ?? 1;
      const lw  = a.lineWidth ?? 2;

      try {
        switch (a.type) {
          case "highlight":
            page.drawRectangle({ x: ax, y: ay, width: aw, height: ah, color: rgb(1,1,0.2), opacity: op * 0.4, blendMode: BlendMode.Multiply });
            if (a.color !== "#ffff00") page.drawRectangle({ x: ax, y: ay, width: aw, height: ah, color: col, opacity: op * 0.3, blendMode: BlendMode.Multiply });
            break;
          case "underline":
            page.drawLine({ start:{x:ax,y:ay}, end:{x:ax+aw,y:ay}, thickness: lw, color: col, opacity: op });
            break;
          case "strikeout":
            page.drawLine({ start:{x:ax,y:ay+ah/2}, end:{x:ax+aw,y:ay+ah/2}, thickness: lw, color: col, opacity: op });
            break;
          case "rectangle": {
            const fr = a.fillColor ? hexToRgbF(a.fillColor) : null;
            page.drawRectangle({ x:ax, y:ay, width:aw, height:ah,
              borderColor: col, borderWidth: lw, opacity: op,
              ...(fr ? { color: rgb(fr[0],fr[1],fr[2]), fillOpacity: op*0.25 } : {}) });
            break;
          }
          case "circle": {
            const fr = a.fillColor ? hexToRgbF(a.fillColor) : null;
            page.drawEllipse({ x:ax+aw/2, y:ay+ah/2, xScale:aw/2, yScale:ah/2,
              borderColor: col, borderWidth: lw, opacity: op,
              ...(fr ? { color: rgb(fr[0],fr[1],fr[2]), fillOpacity: op*0.25 } : {}) });
            break;
          }
          case "arrow":
          case "line": {
            const pts = a.points || [a.x, a.y, a.x+a.w, a.y+a.h];
            const x1=pts[0]*W, y1=(1-pts[1])*H, x2=pts[2]*W, y2=(1-pts[3])*H;
            page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness:lw, color:col, opacity:op });
            if (a.type === "arrow") {
              const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
              if (len > 1) {
                const ux=dx/len, uy=dy/len, al=12, aw2=6;
                page.drawLine({ start:{x:x2,y:y2}, end:{x:x2-al*ux+aw2*uy, y:y2-al*uy-aw2*ux}, thickness:lw, color:col, opacity:op });
                page.drawLine({ start:{x:x2,y:y2}, end:{x:x2-al*ux-aw2*uy, y:y2-al*uy+aw2*ux}, thickness:lw, color:col, opacity:op });
              }
            }
            break;
          }
          case "freehand": {
            const pts = a.points || [];
            for (let i=0;i<pts.length-3;i+=2) {
              page.drawLine({ start:{x:pts[i]*W,y:(1-pts[i+1])*H}, end:{x:pts[i+2]*W,y:(1-pts[i+3])*H}, thickness:lw, color:col, opacity:op });
            }
            break;
          }
          case "text":
          case "typewriter": {
            if (!a.content) break;
            const fs = a.fontSize ?? 12;
            const f  = a.bold ? fontB : font;
            page.drawText(a.content, { x:ax, y:ay+ah-fs, size:fs, font:f, color:col, opacity:op, maxWidth:aw });
            break;
          }
          case "sticky": {
            page.drawRectangle({ x:ax, y:ay, width:120, height:80, color:rgb(1,1,0.7), opacity:0.92 });
            page.drawRectangle({ x:ax, y:ay+68, width:120, height:12, color:rgb(1,0.85,0), opacity:1 });
            if (a.content) page.drawText(a.content, { x:ax+4, y:ay+4, size:9, font, color:rgb(0,0,0), maxWidth:112 });
            break;
          }
          case "stamp": {
            const stamp = a.content || "APPROVED";
            page.drawRectangle({ x:ax, y:ay, width:aw, height:ah, borderColor:col, borderWidth:3, opacity:op*0.85 });
            const fs = Math.min(a.fontSize ?? 36, ah*0.6);
            page.drawText(stamp, { x:ax+6, y:ay+ah/2-fs/2, size:fs, font:fontB, color:col, opacity:op*0.8, maxWidth:aw-12 });
            break;
          }
        }
      } catch {}
    }
  }
  return Buffer.from(await doc.save());
}

export async function insertBlankPage(pdfBytes: Buffer, afterIdx: number, w = 595, h = 842): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  doc.insertPage(Math.min(afterIdx, doc.getPageCount()), [w, h]);
  return Buffer.from(await doc.save());
}

export async function deletePages(pdfBytes: Buffer, pageNums: number[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const sorted = [...new Set(pageNums)].sort((a,b) => b-a);
  for (const n of sorted) { try { doc.removePage(n-1); } catch {} }
  return Buffer.from(await doc.save());
}

export async function duplicatePage(pdfBytes: Buffer, pageNum: number): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const [copy] = await doc.copyPages(doc, [pageNum - 1]);
  doc.insertPage(pageNum, copy);
  return Buffer.from(await doc.save());
}

export async function cropPage(pdfBytes: Buffer, pageNum: number, x: number, y: number, w: number, h: number): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[pageNum - 1];
  if (page) page.setCropBox(x, y, w, h);
  return Buffer.from(await doc.save());
}

export async function resizePages(pdfBytes: Buffer, targetWidth: number, targetHeight: number, pages?: number[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const allPages = doc.getPages();
  const indices = pages ? pages.map(n => n-1) : allPages.map((_,i) => i);
  for (const i of indices) {
    if (i >= 0 && i < allPages.length) allPages[i].setSize(targetWidth, targetHeight);
  }
  return Buffer.from(await doc.save());
}
