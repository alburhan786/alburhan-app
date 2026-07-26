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
  receiptNumber?: string | null;
  paymentAmount?: number | null;
  paymentRef?: string | null;
  paymentDate?: Date;
  paymentMethod?: string | null;
  currentStatus?: string | null;
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

function drawSectionHeader(doc: PDFKit.PDFDocument, y: number, label: string): number {
  const MARGIN = 40;
  const PAGE_W = doc.page.width;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 22).fill(DARK_GREEN);
  doc.fill("white").font("Helvetica-Bold").fontSize(9).text(label, MARGIN + 8, y + 6, { width: PAGE_W - MARGIN * 2 - 16 });
  doc.fill("black");
  return y + 22;
}

function deriveStatusFromAmounts(paid: number, total: number, overdue = false): { label: string; color: string; bg: string } {
  const balance = Math.max(0, total - paid);
  if (paid <= 0)               return { label: "PENDING PAYMENT", color: "#E65100", bg: "#FFF3E0" };
  if (balance <= 0.01)         return { label: "PAID IN FULL",    color: "#1B5E20", bg: "#E8F5E9" };
  if (overdue && balance > 0)  return { label: "OVERDUE",         color: "#B71C1C", bg: "#FFEBEE" };
  return                              { label: "PARTIALLY PAID",  color: "#1565C0", bg: "#E3F2FD" };
}

export async function generateInvoicePdfBuffer(opts: DocOpts): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  let y = drawHeader(doc, `TAX INVOICE — ${opts.invoiceNumber || opts.bookingNumber}`);
  y += 10;

  const MARGIN = 40;
  const PAGE_W = doc.page.width;

  const total   = Number(opts.totalAmount ?? opts.finalAmount ?? 0);
  const paid    = Number(opts.paidAmount ?? 0);
  const balance = Number(opts.balanceAmount ?? Math.max(0, total - paid));

  // ── Payment status badge — colors per spec: Pending=Orange, Partial=Blue, Paid=Green ──
  const { label: statusLabel, color: statusColor, bg: statusBg } = deriveStatusFromAmounts(paid, total);
  const badgeW = 140;
  const badgeH = 24;
  const badgeX = PAGE_W - MARGIN - badgeW;
  doc.rect(badgeX, y, badgeW, badgeH).fill(statusBg);
  doc.fill(statusColor).font("Helvetica-Bold").fontSize(10)
     .text(statusLabel, badgeX, y + 6, { width: badgeW, align: "center" });
  doc.fill("black");
  y += badgeH + 8;

  y = drawKV(doc, y, [
    ["Booking No.", opts.bookingNumber],
    ["Invoice No.", opts.invoiceNumber || "—"],
    ["Customer",    opts.customerName],
    ["Mobile",      opts.customerMobile],
    ["Email",       opts.customerEmail || "—"],
    ["Package",     opts.packageName || "—"],
    ["Pilgrims",    String(opts.numberOfPilgrims ?? "—")],
    ["Date",        (opts.paymentDate || new Date()).toLocaleDateString("en-IN")],
  ]);
  y += 15;

  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 26).fill(DARK_GREEN);
  doc.fill("white").font("Helvetica-Bold").fontSize(10).text("Description", MARGIN + 10, y + 8, { width: 300 });
  doc.text("Amount (₹)", MARGIN + 320, y + 8, { width: 150, align: "right" });
  y += 26;
  doc.fill("#111").font("Helvetica").fontSize(10);
  const lineItems: [string, number][] = [
    [`${opts.packageName || "Hajj/Umrah Package"} (${opts.numberOfPilgrims ?? 1} pilgrim(s))`, total],
  ];
  for (const [label, amt] of lineItems) {
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 24).stroke("#e5e7eb");
    doc.text(label, MARGIN + 10, y + 6, { width: 300 });
    doc.text(amt.toLocaleString("en-IN"), MARGIN + 320, y + 6, { width: 150, align: "right" });
    y += 24;
  }
  y += 10;
  y = drawKV(doc, y, [
    ["Total Amount", `Rs. ${total.toLocaleString("en-IN")}`],
    ["Amount Paid",  `Rs. ${paid.toLocaleString("en-IN")}`],
    ["Balance Due",  `Rs. ${balance.toLocaleString("en-IN")}`],
    ["Status",       statusLabel],
  ]);
  doc.fontSize(9).fill("#888").text(
    "This is a system-generated Tax Invoice. For queries, contact +91 9893989786 / info@alburhantravels.online",
    MARGIN, doc.page.height - 60, { width: PAGE_W - MARGIN * 2, align: "center" }
  );
  return pdfToBuffer(doc);
}

export async function generateReceiptPdfBuffer(opts: DocOpts): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  let y = drawHeader(doc, "PAYMENT RECEIPT");
  y += 10;

  const MARGIN = 40;
  const PAGE_W = doc.page.width;
  const totalAmt   = Number(opts.totalAmount ?? opts.finalAmount ?? 0);
  const paidAmt    = Number(opts.paidAmount ?? opts.paymentAmount ?? 0);
  const balanceAmt = Number(opts.balanceAmount ?? Math.max(0, totalAmt - paidAmt));
  const thisPayAmt = Number(opts.paymentAmount ?? paidAmt);

  // Auto-generate receipt number if not supplied
  const receiptNum = opts.receiptNumber
    || `RCP-${opts.bookingNumber}-${Date.now().toString().slice(-6)}`;

  // ── Status badge ────────────────────────────────────────────────────────────
  const { label: statusLabel, color: statusColor, bg: statusBg } = deriveStatusFromAmounts(paidAmt, totalAmt);
  const badgeW = 160;
  const badgeH = 26;
  const badgeX = PAGE_W - MARGIN - badgeW;
  doc.rect(badgeX, y, badgeW, badgeH).fill(statusBg);
  doc.fill(statusColor).font("Helvetica-Bold").fontSize(10)
     .text(statusLabel, badgeX, y + 7, { width: badgeW, align: "center" });
  doc.fill("black");
  y += badgeH + 10;

  // ── Booking Details ─────────────────────────────────────────────────────────
  y = drawSectionHeader(doc, y, "BOOKING DETAILS");
  y += 4;
  y = drawKV(doc, y, [
    ["Receipt No.",     receiptNum],
    ["Invoice No.",     opts.invoiceNumber || "—"],
    ["Booking No.",     opts.bookingNumber],
    ["Customer Name",   opts.customerName],
    ["Mobile",          opts.customerMobile],
    ["Email",           opts.customerEmail || "—"],
    ["Package",         opts.packageName || "—"],
    ["No. of Pilgrims", String(opts.numberOfPilgrims ?? "—")],
  ]);
  y += 12;

  // ── Transaction Details ─────────────────────────────────────────────────────
  y = drawSectionHeader(doc, y, "TRANSACTION DETAILS");
  y += 4;
  const payDateStr = (opts.paymentDate || new Date()).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
  y = drawKV(doc, y, [
    ["Amount Paid",      `Rs. ${thisPayAmt.toLocaleString("en-IN")}`],
    ["Total Paid",       `Rs. ${paidAmt.toLocaleString("en-IN")}`],
    ["Grand Total",      `Rs. ${totalAmt.toLocaleString("en-IN")}`],
    ["Balance Due",      `Rs. ${balanceAmt.toLocaleString("en-IN")}`],
    ["Transaction ID",   opts.paymentRef || "—"],
    ["Payment Method",   opts.paymentMethod || "—"],
    ["Payment Date",     payDateStr],
    ["Status",           statusLabel],
  ]);
  y += 20;

  // ── Amount in words ─────────────────────────────────────────────────────────
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 28).fill("#F9FAFB").stroke("#E5E7EB");
  doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(9)
     .text(`Amount Paid: Rs. ${thisPayAmt.toLocaleString("en-IN")} | Balance: Rs. ${balanceAmt.toLocaleString("en-IN")}`,
       MARGIN + 8, y + 8, { width: PAGE_W - MARGIN * 2 - 16 });
  y += 36;

  doc.fontSize(8).fill("#666").text(
    "This is a computer-generated payment receipt and does not require a signature.\n" +
    "For queries: +91 9893989786 | info@alburhantravels.online | alburhantravels.online",
    MARGIN, doc.page.height - 65, { width: PAGE_W - MARGIN * 2, align: "center" }
  );
  doc.fill("#999").fontSize(7).text(
    `Generated: ${new Date().toLocaleString("en-IN")} | Receipt: ${receiptNum}`,
    MARGIN, doc.page.height - 45, { width: PAGE_W - MARGIN * 2, align: "center" }
  );
  return pdfToBuffer(doc);
}
