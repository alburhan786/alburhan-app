import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";

/**
 * Fetches a URL (with credentials) and returns a base64 data URL string.
 * Use this to pre-load cross-origin images before html2canvas capture.
 */
export async function fetchAsDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

const BASE_OPTS = {
  useCORS: true,
  allowTaint: true,
  backgroundColor: "#ffffff",
  logging: false,
  imageTimeout: 15000,
};

// ─── Low-level helpers ───────────────────────────────────────────────────────

/** Render element at given scale; returns null if canvas has zero dimensions. */
async function renderCanvas(el: HTMLElement, scale: number): Promise<HTMLCanvasElement | null> {
  try {
    const canvas = await html2canvas(el, { ...BASE_OPTS, scale });
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Render element → Blob at given scale.
 * Tries scales in order; returns first non-empty valid blob.
 */
async function renderToBlob(
  el: HTMLElement,
  mime: "image/png" | "image/jpeg",
  quality: number,
  scales = [6, 3, 2],
): Promise<{ blob: Blob; cssW: number; cssH: number } | null> {
  for (const scale of scales) {
    const canvas = await renderCanvas(el, scale);
    if (!canvas) continue;
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), mime, quality),
    );
    // Require at least 1 KB — a 0×0 or all-white degenerate PNG is ~68 bytes
    if (blob && blob.size > 1024) {
      return { blob, cssW: canvas.width / scale, cssH: canvas.height / scale };
    }
  }
  return null;
}

/**
 * Render element → PNG data URL via toBlob→FileReader (avoids toDataURL size limits).
 */
async function renderToPngDataUrl(
  el: HTMLElement,
  scales = [6, 3, 2],
): Promise<{ dataUrl: string; cssW: number; cssH: number } | null> {
  const result = await renderToBlob(el, "image/png", 1, scales);
  if (!result) return null;
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(result.blob);
  });
  if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) return null;
  return { dataUrl, cssW: result.cssW, cssH: result.cssH };
}

// ─── Public download functions ───────────────────────────────────────────────

export async function downloadAsJpg(el: HTMLElement, filename: string) {
  const name = filename.endsWith(".jpg") ? filename : filename + ".jpg";
  const result = await renderToBlob(el, "image/jpeg", 0.95);
  if (result) { saveAs(result.blob, name); return; }
  alert("JPG download failed — please try the PDF button instead.");
}

export async function downloadAsPng(el: HTMLElement, filename: string) {
  const name = filename.endsWith(".png") ? filename : filename + ".png";
  const result = await renderToBlob(el, "image/png", 1);
  if (result) { saveAs(result.blob, name); return; }
  alert("PNG download failed — please try the PDF or JPG button instead.");
}

export async function downloadAsPdf(el: HTMLElement, filename: string) {
  const fname = filename.endsWith(".pdf") ? filename : filename + ".pdf";
  const result = await renderToPngDataUrl(el);
  if (!result) { alert("PDF download failed — the page may be too large to capture."); return; }
  const { dataUrl, cssW, cssH } = result;
  const pdf = new jsPDF({
    orientation: cssW > cssH ? "landscape" : "portrait",
    unit: "pt",
    format: [cssW, cssH],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, cssW, cssH);
  pdf.save(fname);
}

/**
 * Captures each element in `pages` separately and adds it as a new PDF page.
 * Use this when the printable content is split into distinct page blocks so
 * html2canvas never hits the canvas height limit.
 */
export async function downloadMultiPagePdf(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;
  const fname = filename.endsWith(".pdf") ? filename : filename + ".pdf";
  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const result = await renderToPngDataUrl(pages[i]);
    if (!result) { alert(`PDF: page ${i + 1} failed to render — skipped.`); continue; }
    const { dataUrl, cssW, cssH } = result;
    if (!pdf) {
      pdf = new jsPDF({
        orientation: cssW > cssH ? "landscape" : "portrait",
        unit: "pt",
        format: [cssW, cssH],
      });
    } else {
      pdf.addPage([cssW, cssH], cssW > cssH ? "landscape" : "portrait");
    }
    pdf.addImage(dataUrl, "PNG", 0, 0, cssW, cssH);
  }

  if (pdf) pdf.save(fname);
  else alert("PDF download failed — no pages were rendered.");
}

/**
 * Captures each element in `pages` separately and downloads each as a
 * numbered PNG file (filename-1.png, filename-2.png, …).
 * Use this for large multi-card layouts — avoids the canvas height limit.
 */
export async function downloadPagesAsPng(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;
  const base = filename.replace(/\.png$/i, "");
  for (let i = 0; i < pages.length; i++) {
    const name = pages.length === 1 ? `${base}.png` : `${base}-${i + 1}.png`;
    const result = await renderToBlob(pages[i], "image/png", 1);
    if (result) { saveAs(result.blob, name); }
    else { alert(`PNG download failed for page ${i + 1}.`); }
    if (i < pages.length - 1) await new Promise(r => setTimeout(r, 400));
  }
}

/**
 * Captures each element in `pages` separately and downloads each as a
 * numbered JPG file (filename-1.jpg, filename-2.jpg, …).
 */
export async function downloadPagesAsJpg(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;
  const base = filename.replace(/\.jpg$/i, "");
  for (let i = 0; i < pages.length; i++) {
    const name = pages.length === 1 ? `${base}.jpg` : `${base}-${i + 1}.jpg`;
    const result = await renderToBlob(pages[i], "image/jpeg", 0.95);
    if (result) { saveAs(result.blob, name); }
    else { alert(`JPG download failed for page ${i + 1}.`); }
    if (i < pages.length - 1) await new Promise(r => setTimeout(r, 400));
  }
}

/**
 * Renders each element at `scale` (≈ 560/96 ≈ 5.83 for 560 DPI) and stitches
 * them into a single PNG sheet laid out in `cardsPerRow` columns.
 * White gap between cards = `gapPx` canvas pixels.
 */
export async function downloadCardsAsSheet(
  elements: HTMLElement[],
  filename: string,
  cardsPerRow = 2,
  scale = 560 / 96,
  gapPx = 12,
) {
  if (elements.length === 0) return;

  const canvases: HTMLCanvasElement[] = [];
  for (const el of elements) {
    let c = await renderCanvas(el, scale);
    if (!c) c = await renderCanvas(el, 4);
    if (!c) c = await renderCanvas(el, 2);
    if (c) canvases.push(c);
  }
  if (canvases.length === 0) { alert("Sheet PNG download failed — no cards rendered."); return; }

  const cardW = canvases[0].width;
  const cardH = canvases[0].height;
  const cols  = Math.min(cardsPerRow, canvases.length);
  const rows  = Math.ceil(canvases.length / cols);

  const master = document.createElement("canvas");
  master.width  = cols * cardW + (cols - 1) * gapPx;
  master.height = rows * cardH + (rows - 1) * gapPx;

  const ctx = master.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, master.width, master.height);

  for (let i = 0; i < canvases.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(canvases[i], col * (cardW + gapPx), row * (cardH + gapPx));
  }

  const blob = await new Promise<Blob | null>(res => master.toBlob(res, "image/png", 1));
  if (blob) saveAs(blob, filename.endsWith(".png") ? filename : filename + ".png");
  else alert("Sheet PNG download failed.");
}

/**
 * Captures an element and downloads it as an SVG file embedding the rendered
 * image at the given physical mm dimensions.
 */
export async function downloadElementAsSvg(
  el: HTMLElement,
  filename: string,
  widthMm = 85,
  heightMm = 54,
) {
  const pngResult = await renderToPngDataUrl(el);
  if (!pngResult) { alert("SVG download failed."); return; }
  const canvas = await renderCanvas(el, 3) ?? await renderCanvas(el, 2);
  if (!canvas) { alert("SVG download failed."); return; }
  const w = canvas.width;
  const h = canvas.height;
  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${widthMm}mm" height="${heightMm}mm"
     viewBox="0 0 ${w} ${h}">
  <image xlink:href="${pngResult.dataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>
</svg>`;
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  saveAs(blob, filename.endsWith(".svg") ? filename : filename + ".svg");
}
