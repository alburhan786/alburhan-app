import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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

// scale=6 → ~576 DPI (closest to 600 DPI achievable in browser at 96 CSS DPI)
// PNG used for PDF = lossless, perfect colours, no JPEG artefacts
const CAPTURE_OPTS = {
  scale: 6,
  useCORS: true,
  allowTaint: true,
  backgroundColor: "#ffffff",
  logging: false,
  imageTimeout: 15000,
};

async function capture(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, CAPTURE_OPTS);
}

export async function downloadAsJpg(el: HTMLElement, filename: string) {
  const name = filename.endsWith(".jpg") ? filename : filename + ".jpg";
  for (const scale of [6, 3, 2]) {
    const blob = await new Promise<Blob | null>((resolve) => {
      html2canvas(el, { ...CAPTURE_OPTS, scale })
        .then((c) => c.toBlob((b) => resolve(b), "image/jpeg", 0.97))
        .catch(() => resolve(null));
    });
    if (blob && blob.size > 0 && triggerBlobDownload(blob, name)) return;
  }
  alert("JPG download failed — please try the PDF button instead.");
}

/** Trigger a blob-URL download. Returns true on success. */
function triggerBlobDownload(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = name;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch {
    return false;
  }
}

/** Render element at the given scale and resolve with a Blob (or null). */
function captureToBlob(el: HTMLElement, scale: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    html2canvas(el, { ...CAPTURE_OPTS, scale }).then((canvas) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    }).catch(() => resolve(null));
  });
}

export async function downloadAsPng(el: HTMLElement, filename: string) {
  const name = filename.endsWith(".png") ? filename : filename + ".png";

  // Try high-res first (scale 6 ≈ 576 DPI), fall back to scale 3 (≈ 288 DPI)
  // if the canvas is too large for the browser to encode.
  for (const scale of [6, 3, 2]) {
    const blob = await captureToBlob(el, scale);
    if (blob && blob.size > 0) {
      if (triggerBlobDownload(blob, name)) return;
    }
  }

  // Last resort: small scale data-URL
  try {
    const canvas = await html2canvas(el, { ...CAPTURE_OPTS, scale: 2 });
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl && dataUrl !== "data:,") {
      const a = document.createElement("a");
      a.download = name;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  } catch { /* ignore */ }

  alert("PNG download failed — please try the PDF or JPG button instead.");
}

export async function downloadAsPdf(el: HTMLElement, filename: string) {
  const canvas = await capture(el);
  // Divide by scale so jsPDF page size matches physical mm dimensions
  const w = canvas.width / CAPTURE_OPTS.scale;
  const h = canvas.height / CAPTURE_OPTS.scale;
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "pt",
    format: [w, h],
  });
  // PNG = lossless, perfect colour reproduction
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
  pdf.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

/**
 * Captures each element in `pages` separately and adds it as a new PDF page.
 * Use this when the printable content is split into distinct page blocks
 * (e.g. .id-print-page divs) so html2canvas never hits the ~32 767px height limit.
 */
export async function downloadMultiPagePdf(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], CAPTURE_OPTS);
    const w = canvas.width / CAPTURE_OPTS.scale;
    const h = canvas.height / CAPTURE_OPTS.scale;
    const imgData = canvas.toDataURL("image/png");

    if (i === 0) {
      pdf = new jsPDF({
        orientation: w > h ? "landscape" : "portrait",
        unit: "pt",
        format: [w, h],
      });
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
    } else {
      pdf!.addPage([w, h], w > h ? "landscape" : "portrait");
      pdf!.addImage(imgData, "PNG", 0, 0, w, h);
    }
  }

  pdf!.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

/**
 * Captures each element in `pages` separately and downloads each as a
 * numbered JPG file (filename-1.jpg, filename-2.jpg, …).
 * Avoids the html2canvas height limit for multi-page layouts.
 */
export async function downloadPagesAsJpg(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;
  const base = filename.replace(/\.jpg$/i, "");
  for (let i = 0; i < pages.length; i++) {
    const name = pages.length === 1 ? `${base}.jpg` : `${base}-${i + 1}.jpg`;
    let downloaded = false;
    for (const scale of [6, 3, 2]) {
      const blob = await new Promise<Blob | null>((resolve) => {
        html2canvas(pages[i], { ...CAPTURE_OPTS, scale })
          .then((c) => c.toBlob((b) => resolve(b), "image/jpeg", 0.97))
          .catch(() => resolve(null));
      });
      if (blob && blob.size > 0 && triggerBlobDownload(blob, name)) { downloaded = true; break; }
    }
    if (!downloaded) alert(`JPG download failed for page ${i + 1}.`);
    if (i < pages.length - 1) await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Captures an element with html2canvas and downloads it as an SVG file.
 * The SVG embeds the rendered card as a PNG image at the correct physical mm size.
 * widthMm / heightMm set the real-world dimensions (default: 85×54mm standard ID card).
 */
export async function downloadElementAsSvg(
  el: HTMLElement,
  filename: string,
  widthMm = 85,
  heightMm = 54,
) {
  const canvas = await html2canvas(el, CAPTURE_OPTS);
  const pngData = canvas.toDataURL("image/png");
  const w = canvas.width;
  const h = canvas.height;
  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${widthMm}mm" height="${heightMm}mm"
     viewBox="0 0 ${w} ${h}">
  <image xlink:href="${pngData}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>
</svg>`;
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename.endsWith(".svg") ? filename : filename + ".svg";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
