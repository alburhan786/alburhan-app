import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

export { pdfjsLib };

export type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;
export type TextItem = { str: string; transform: number[]; width: number; height: number; dir: string };

export async function loadPdfFromArrayBuffer(data: ArrayBuffer): Promise<PdfDocument> {
  return pdfjsLib.getDocument({ data }).promise;
}

export async function renderPage(
  doc: PdfDocument,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number; scale: number }> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  canvas.width  = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height, scale };
}

export async function renderThumb(
  doc: PdfDocument,
  pageNum: number,
  canvas: HTMLCanvasElement
): Promise<void> {
  const page = await doc.getPage(pageNum);
  const nativeVp = page.getViewport({ scale: 1 });
  const scale = 120 / Math.max(nativeVp.width, nativeVp.height);
  const vp = page.getViewport({ scale });
  canvas.width  = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}

export async function getPageDimensions(doc: PdfDocument, pageNum: number): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}

export async function searchText(
  doc: PdfDocument,
  query: string,
  scale: number
): Promise<Array<{ page: number; x: number; y: number; w: number; h: number; text: string }>> {
  if (!query.trim()) return [];
  const results: Array<{ page: number; x: number; y: number; w: number; h: number; text: string }> = [];
  const lower = query.toLowerCase();
  const total = doc.numPages;

  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p);
    const vp   = page.getViewport({ scale });
    const tc   = await page.getTextContent();
    const H    = vp.height;

    for (const item of tc.items as TextItem[]) {
      if (!item.str) continue;
      const idx = item.str.toLowerCase().indexOf(lower);
      if (idx < 0) continue;
      const [scaleX,,, scaleY, tx, ty] = item.transform;
      const charW = item.width / item.str.length;
      const x = tx * scale + idx * charW * scale;
      const y = H - ty * scale - Math.abs(scaleY) * scale;
      const w = lower.length * charW * scale;
      const h = Math.abs(scaleY) * scale * 1.4;
      results.push({ page: p, x: x / vp.width, y: y / H, w: w / vp.width, h: h / H, text: item.str });
    }
  }
  return results;
}
