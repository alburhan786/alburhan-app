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

const CAPTURE_OPTS = {
  scale: 2,
  useCORS: true,
  allowTaint: true,
  backgroundColor: "#ffffff",
  logging: false,
};

async function capture(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, CAPTURE_OPTS);
}

export async function downloadAsJpg(el: HTMLElement, filename: string) {
  const canvas = await capture(el);
  const a = document.createElement("a");
  a.download = filename.endsWith(".jpg") ? filename : filename + ".jpg";
  a.href = canvas.toDataURL("image/jpeg", 0.93);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadAsPdf(el: HTMLElement, filename: string) {
  const canvas = await capture(el);
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "pt",
    format: [w, h],
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, w, h);
  pdf.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

/**
 * Captures each element in `pages` separately and adds it as a new PDF page.
 * Use this when the printable content is split into distinct page blocks
 * (e.g. .pair-block divs) so html2canvas never has to render a giant tall element.
 */
export async function downloadMultiPagePdf(pages: HTMLElement[], filename: string) {
  if (pages.length === 0) return;

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], CAPTURE_OPTS);
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const imgData = canvas.toDataURL("image/jpeg", 0.93);

    if (i === 0) {
      pdf = new jsPDF({
        orientation: w > h ? "landscape" : "portrait",
        unit: "pt",
        format: [w, h],
      });
      pdf.addImage(imgData, "JPEG", 0, 0, w, h);
    } else {
      pdf!.addPage([w, h], w > h ? "landscape" : "portrait");
      pdf!.addImage(imgData, "JPEG", 0, 0, w, h);
    }
  }

  pdf!.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}
