import PDFDocument from "pdfkit";
import { LOGO_BASE64 } from "./logoData.js";

const LOGO_BUFFER = Buffer.from(LOGO_BASE64, "base64");
const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";

interface DocOpts {
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  packageName?: string | null;
  numberOfPilgrims?: number | null;
  totalAmount?: number | null;
  finalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  invoiceNumber?: string | null;
  paymentAmount?: number | null;
  paymentRef?: string | null;
  paymentDate?: Date;
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, title: string) {
  const PAGE_W = doc.page.width;
  const MARGIN = 40;
  doc.rect(0, 0, PAGE_W, 90).fill(DARK_GREEN);
  try {
    doc.image(LOGO_BUFFER, MARGIN, 15, { width: 60 });
  } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(18).text("AL BURHAN TOURS & TRAVELS", MARGIN + 70, 22, { width: PAGE_W - MARGIN * 2 - 70 });
  doc.fill("white").font("Helvetica").fontSize(9).text(
    "5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | GSTIN: 23AAVFA3223C1ZW | +91 9893989786",
    MARGIN + 70, 46, { width: PAGE_W - MARGIN * 2 - 70 }
  );
  doc.fill("white").font("Helvetica-Bold").fontSize(13).text(title, MARGIN, 68, { width: PAGE_W - MARGIN * 2 });
  doc.fill("black");
  return 110;
}

function drawKV(doc: PDFKit.PDFDocument, y: number, rows: [string, string][]) {
  const MARGIN = 40;
  let cy = y;
  for (const [k, v] of rows) {
    doc.font("Helvetica-Bold").fontSize(10).fill("#444").text(k, MARGIN, cy, { width: 160, continued: false });
    doc.font("Helvetica").fontSize(10).fill("#111").text(v, MARGIN + 165, cy, { width: 340 });
    cy += 20;
  }
  return cy;
}

export async function generateInvoicePdfBuffer(opts: DocOpts): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  let y = drawHeader(doc, `INVOICE — ${opts.invoiceNumber || opts.bookingNumber}`);
  y += 10;
  y = drawKV(doc, y, [
    ["Booking No.", opts.bookingNumber],
    ["Invoice No.", opts.invoiceNumber || "—"],
    ["Customer", opts.customerName],
    ["Mobile", opts.customerMobile],
    ["Email", opts.customerEmail || "—"],
    ["Package", opts.packageName || "—"],
    ["Pilgrims", String(opts.numberOfPilgrims ?? "—")],
    ["Date", (opts.paymentDate || new Date()).toLocaleDateString("en-IN")],
  ]);
  y += 15;
  const MARGIN = 40;
  const PAGE_W = doc.page.width;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 26).fill(DARK_GREEN);
  doc.fill("white").font("Helvetica-Bold").fontSize(10).text("Description", MARGIN + 10, y + 8, { width: 300 });
  doc.text("Amount (₹)", MARGIN + 320, y + 8, { width: 150, align: "right" });
  y += 26;
  doc.fill("#111").font("Helvetica").fontSize(10);
  const total = Number(opts.totalAmount ?? opts.finalAmount ?? 0);
  const paid = Number(opts.paidAmount ?? 0);
  const balance = Number(opts.balanceAmount ?? Math.max(0, total - paid));
  const lines: [string, number][] = [
    [`${opts.packageName || "Hajj/Umrah Package"} (${opts.numberOfPilgrims ?? 1} pilgrim(s))`, total],
  ];
  for (const [label, amt] of lines) {
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 24).stroke("#e5e7eb");
    doc.text(label, MARGIN + 10, y + 6, { width: 300 });
    doc.text(amt.toLocaleString("en-IN"), MARGIN + 320, y + 6, { width: 150, align: "right" });
    y += 24;
  }
  y += 10;
  y = drawKV(doc, y, [
    ["Total Amount", `Rs. ${total.toLocaleString("en-IN")}`],
    ["Amount Paid", `Rs. ${paid.toLocaleString("en-IN")}`],
    ["Balance Due", `Rs. ${balance.toLocaleString("en-IN")}`],
  ]);
  doc.fontSize(9).fill("#888").text(
    "This is a system-generated invoice. For queries, contact +91 9893989786 / info@alburhantravels.com",
    MARGIN, doc.page.height - 60, { width: PAGE_W - MARGIN * 2, align: "center" }
  );
  return pdfToBuffer(doc);
}

export async function generateReceiptPdfBuffer(opts: DocOpts): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  let y = drawHeader(doc, "PAYMENT RECEIPT");
  y += 10;
  const amt = Number(opts.paymentAmount ?? 0);
  y = drawKV(doc, y, [
    ["Receipt For", `Booking #${opts.bookingNumber}`],
    ["Customer", opts.customerName],
    ["Mobile", opts.customerMobile],
    ["Amount Received", `Rs. ${amt.toLocaleString("en-IN")}`],
    ["Payment Ref.", opts.paymentRef || "—"],
    ["Date", (opts.paymentDate || new Date()).toLocaleString("en-IN")],
    ["Balance Remaining", `Rs. ${Number(opts.balanceAmount ?? 0).toLocaleString("en-IN")}`],
  ]);
  doc.fontSize(9).fill("#888").text(
    "Thank you for your payment. This is a system-generated receipt.",
    40, doc.page.height - 60, { width: doc.page.width - 80, align: "center" }
  );
  return pdfToBuffer(doc);
}
