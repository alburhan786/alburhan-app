import html2canvas from "html2canvas";
import jsPDF from "jspdf";

async function capture(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
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
  const w = canvas.width / 2;   // divide by scale
  const h = canvas.height / 2;
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "pt",
    format: [w, h],
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, w, h);
  pdf.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}
