import html2pdf from "html2pdf.js";

interface PdfDownloadOptions {
  filename: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  margin?: number | [number, number] | [number, number, number, number];
  scale?: number;
}

let downloading = false;

export async function downloadPdf(
  element: HTMLElement | null,
  options: PdfDownloadOptions,
): Promise<void> {
  if (!element || downloading) return;
  downloading = true;

  const {
    filename,
    orientation = "portrait",
    format = "a4",
    margin = 0,
    scale = 2,
  } = options;

  try {
    await html2pdf()
      .set({
        margin,
        filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale,
          useCORS: true,
          allowTaint: true,
          logging: false,
        },
        jsPDF: {
          unit: "mm",
          format,
          orientation,
        },
        pagebreak: { mode: ["css", "legacy"], avoid: ".no-break" },
      })
      .from(element)
      .save();
  } finally {
    downloading = false;
  }
}
