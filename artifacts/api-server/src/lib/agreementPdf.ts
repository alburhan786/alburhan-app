// @ts-nocheck
import PDFDocument from "pdfkit";
import { LOGO_BASE64 } from "./logoData.js";
import QRCode from "qrcode";

// ── Colour & layout constants ────────────────────────────────────────────────
const LOGO_BUF   = Buffer.from(LOGO_BASE64, "base64");
const DG         = "#0B3D2E";   // dark green
const GOLD       = "#C9A23F";
const LG         = "#EBF5EB";   // light green
const GOLD_LITE  = "#FFF8E7";
const GREY_DARK  = "#2C2C2C";
const GREY_MID   = "#555555";
const GREY_LITE  = "#F7F7F7";
const M          = 36;          // page margin (pts)
const W          = 595;         // A4 width
const H          = 842;         // A4 height
const CW         = W - M * 2;  // content width = 523
const HDR_H      = 92;
const FTR_H      = 28;
const CONTENT_Y  = HDR_H + 6;
const COL_HALF   = (CW - 8) / 2;   // ~257.5

// ── Utility ──────────────────────────────────────────────────────────────────
function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function fmt(v: any, fallback = "—"): string {
  if (v == null || v === "") return fallback;
  return String(v);
}

function fmtDate(v: any, fallback = "—"): string {
  if (!v) return fallback;
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return fallback; }
}

function fmtMoney(v: any): string {
  const n = Number(v || 0);
  return "₹\u00A0" + n.toLocaleString("en-IN");
}

// ── Header / Footer ──────────────────────────────────────────────────────────
function drawHeader(doc: any, subtitle?: string) {
  doc.rect(0, 0, W, HDR_H).fill(DG);
  // Decorative gold stripe
  doc.rect(0, HDR_H - 4, W, 4).fill(GOLD);
  // Logo
  try { doc.image(LOGO_BUF, M, 12, { width: 62 }); } catch {}
  // Company name
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(16)
    .text("AL BURHAN TOURS & TRAVELS", M + 70, 14, { width: CW - 70 });
  doc.fill("white").font("Helvetica").fontSize(7.5)
    .text("Regd. Hajj & Umrah Travel Agency  |  Est. 2008  |  GSTIN: 23AAVFA3223C1ZW", M + 70, 34, { width: CW - 70 });
  doc.fill("rgba(255,255,255,0.8)").font("Helvetica").fontSize(7)
    .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331, M.P.  |  +91 9893989786  |  alburhantravels.com", M + 70, 46, { width: CW - 70 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(11)
    .text(subtitle || "HAJJ PACKAGE AGREEMENT & DECLARATION", M + 70, 62, { width: CW - 70 });
  doc.fill("black");
}

function drawFooter(doc: any, pageNum: number, total = 4) {
  doc.rect(0, H - FTR_H, W, FTR_H).fill(DG);
  doc.rect(0, H - FTR_H, W, 2).fill(GOLD);
  doc.fill("white").font("Helvetica").fontSize(7)
    .text("Al Burhan Tours & Travels  |  Legally binding agreement under IT Act 2000  |  Confidential", M, H - FTR_H + 9, { width: CW / 2 });
  doc.fill(GOLD).font("Helvetica").fontSize(7)
    .text(`Page ${pageNum} of ${total}`, M + CW / 2, H - FTR_H + 9, { width: CW / 2, align: "right" });
  doc.fill("black");
}

// ── Section header bar ───────────────────────────────────────────────────────
function secBar(doc: any, y: number, text: string, bg = DG): number {
  doc.rect(M, y, CW, 20).fill(bg);
  doc.fill(bg === DG ? "white" : DG).font("Helvetica-Bold").fontSize(8.5)
    .text(text, M + 8, y + 5, { width: CW - 16 });
  doc.fill("black");
  return y + 24;
}

// ── Gold separator line ───────────────────────────────────────────────────────
function goldLine(doc: any, y: number): number {
  doc.rect(M, y, CW, 1.5).fill(GOLD);
  return y + 5;
}

// ── Info cell (label + value in a box) ──────────────────────────────────────
function infoCell(doc: any, x: number, y: number, w: number, h: number, label: string, value: string, bold = false) {
  doc.rect(x, y, w, h).fill(GREY_LITE).stroke("#E0E0E0");
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text(label, x + 5, y + 4, { width: w - 10 });
  doc.fill(GREY_DARK).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8)
    .text(fmt(value), x + 5, y + 13, { width: w - 10, ellipsis: true });
  doc.fill("black");
}

// ── Simple KV row ─────────────────────────────────────────────────────────────
function kv(doc: any, y: number, label: string, value: string, highlight = false, x = M, w = CW): number {
  const lw = 155;
  doc.fill("#777").font("Helvetica").fontSize(8).text(label + ":", x, y, { width: lw });
  doc.fill(highlight ? DG : GREY_DARK).font(highlight ? "Helvetica-Bold" : "Helvetica").fontSize(8)
    .text(fmt(value), x + lw, y, { width: w - lw });
  doc.fill("black");
  return y + 14;
}

// ── Table row helper ─────────────────────────────────────────────────────────
function tableRow(doc: any, y: number, cols: string[], colWidths: number[], isHeader = false, evenRow = false) {
  let x = M;
  const rowH = isHeader ? 18 : 15;
  const bg = isHeader ? DG : (evenRow ? LG : "white");
  doc.rect(M, y, CW, rowH).fill(bg).stroke("#D0D0D0");
  cols.forEach((text, i) => {
    const cw = colWidths[i];
    doc.fill(isHeader ? "white" : GREY_DARK)
      .font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(isHeader ? 7.5 : 8)
      .text(fmt(text), x + 5, y + (isHeader ? 5 : 4), { width: cw - 10, ellipsis: true });
    x += cw;
  });
  doc.fill("black");
  return y + rowH;
}

// ── Check-box list item ───────────────────────────────────────────────────────
function checkItem(doc: any, x: number, y: number, w: number, text: string, included = true) {
  const icon = included ? "✓" : "✗";
  const col  = included ? DG : "#CC0000";
  doc.fill(col).font("Helvetica-Bold").fontSize(8).text(icon, x, y, { width: 12 });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5).text(text, x + 14, y, { width: w - 16 });
  doc.fill("black");
  return y + 12;
}

// ── Condensed clause list for Page 3 ─────────────────────────────────────────
export const HAJJ_AGREEMENT_CLAUSES = [
  { id: "booking_confirmation", title: "1. BOOKING CONFIRMATION",
    body: "This Agreement confirms the Pilgrim's Hajj package booking with Al Burhan Tours & Travels. A unique Agreement Number is assigned as the official reference. The Agreement becomes legally binding upon digital execution under the IT Act, 2000." },
  { id: "payment_terms", title: "2. PAYMENT TERMS",
    body: "Full payment due 60 days before departure. Minimum 20% booking amount confirms registration. Official receipts issued for all payments. Payments via Razorpay, NEFT/IMPS or cash with receipt only. Payments to unauthorized persons not recognized." },
  { id: "cancellation_policy", title: "3. CANCELLATION & REFUND",
    body: ">90 days: 10% charge. 60–89 days: 25% deduction. 30–59 days: 50% deduction. 15–29 days: 75% deduction. <15 days / post-departure: No refund. Visa, airline & hotel pre-payment charges are non-refundable in all cases. Refunds processed within 30 working days." },
  { id: "package_inclusions", title: "4. INCLUSIONS & EXCLUSIONS",
    body: "Includes: Return airfare, accommodation (Makkah & Madinah), group transport, certified guide, Mina tent, 5L Zamzam, and ID badge. Excludes: Personal expenses, meals, laundry, travel insurance, visa fees, medications and services not explicitly listed." },
  { id: "visa_documents", title: "5. VISA, PASSPORT & DOCUMENTS",
    body: "Passport must have 6+ months validity from return date. Agency files Hajj visa via Hajj Committee; approval subject to Saudi authorities — Agency not liable for rejection. Pilgrims must submit all required documents by the communicated deadline." },
  { id: "health_requirements", title: "6. HEALTH & MEDICAL",
    body: "Pilgrim warrants physical fitness for all Hajj rites. Mandatory vaccinations (ACWY Meningococcal, COVID-19 as required) must be completed before departure. Medical certificate required for pilgrims above 65 years or those with chronic conditions." },
  { id: "conduct_discipline", title: "7. CONDUCT & DISCIPLINE",
    body: "Pilgrim must comply with Saudi law, Agency guide instructions, and group schedule. Independent movement requires prior notification to guide. Serious misconduct may result in arranged return travel at the Pilgrim's expense. Agency not liable for loss of personal property." },
  { id: "liability_insurance", title: "8. LIABILITY & INSURANCE",
    body: "Agency's maximum liability is limited to the total amount paid. Agency not liable for delays or failures by third-party providers (airlines, hotels, transport). Comprehensive travel insurance is strongly recommended and available through the Agency." },
  { id: "force_majeure", title: "9. FORCE MAJEURE",
    body: "Neither party liable for failure due to acts of God, pandemic, war, terrorism, government decisions, or actions by Saudi/Indian authorities. Refunds in such events are limited to amounts recoverable from service providers, net of administrative costs." },
  { id: "privacy_data", title: "10. PRIVACY & DATA PROTECTION",
    body: "Pilgrim consents to collection and processing of personal data (passport, biometric, medical, payment) for Hajj facilitation and regulatory compliance. Data shared with Hajj authorities, airlines, and hotels as required. Not sold to commercial third parties." },
  { id: "amendments", title: "11. AMENDMENTS",
    body: "This Agreement constitutes the entire understanding between parties. Amendments must be in writing and signed by authorized representatives of both parties. Invalid or unenforceable provisions do not affect the remaining terms of this Agreement." },
  { id: "governing_law", title: "12. DISPUTE RESOLUTION",
    body: "Good-faith negotiation first (30 days). Unresolved disputes referred to arbitration under Arbitration & Conciliation Act 1996, venue Burhanpur, M.P. Arbitral award is final. Governed by Indian law. Courts at Burhanpur have exclusive jurisdiction." },
  { id: "digital_signature_declaration", title: "13. DIGITAL SIGNATURE",
    body: "Pilgrim confirms: all information provided is true and accurate; physically and medically fit for Hajj; digital signature is legally equivalent to wet-ink signature under IT Act 2000 §5 and Schedule I; mobile number verified via OTP authentication." },
];

// ── Standard package inclusions / exclusions ─────────────────────────────────
const HAJJ_INCLUDES = [
  "Return economy airfare (India ↔ KSA)",
  "Accommodation in Makkah (near Haram)",
  "Accommodation in Madinah",
  "Airport & inter-city transfers",
  "Mina tent accommodation",
  "Arafat & Muzdalifah transport",
  "Certified bilingual Hajj guide",
  "Zamzam water (5 litres per pilgrim)",
  "Al Burhan ID badge & documentation",
  "Saudi Hajj visa processing assistance",
  "Group meals (where specified in plan)",
  "24/7 Agency emergency support",
];

const HAJJ_EXCLUDES = [
  "Personal / shopping expenses",
  "Meals beyond specified plan",
  "Laundry & personal services",
  "International calls & data",
  "Comprehensive travel insurance",
  "Hajj visa government fees (per GOI rates)",
  "Umrah kit, ihram & personal clothing",
  "Medications & personal health costs",
  "Services not listed in this Agreement",
  "Upgrades not confirmed in writing",
  "Excess baggage charges",
  "Upgrades during transit/hotel stay",
];

// ── Main options interface ────────────────────────────────────────────────────
export interface AgreementPdfOptions {
  agreementNumber: string;
  bookingNumber: string;
  bookingId: string;
  status?: string;
  agreementDate?: Date | null;
  // Customer KYC
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  customerPassport?: string | null;
  customerAadhaar?: string | null;
  customerPan?: string | null;
  customerDob?: string | null;
  customerBloodGroup?: string | null;
  customerGender?: string | null;
  customerNationality?: string | null;
  customerAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactMobile?: string | null;
  // Package
  packageName?: string | null;
  numberOfPilgrims?: number | null;
  departureDate?: string | null;
  returnDate?: string | null;
  groupName?: string | null;
  maktabNumber?: string | null;
  saudiServiceProvider?: string | null;
  // Hotel
  makkahHotel?: string | null;
  madinahHotel?: string | null;
  hotelCheckIn?: string | null;
  hotelCheckOut?: string | null;
  roomSharing?: string | null;
  hotelDistance?: string | null;
  // Flight
  airline?: string | null;
  flightNumber?: string | null;
  flightDeparture?: string | null;
  flightArrival?: string | null;
  flightTransit?: string | null;
  baggageAllowance?: string | null;
  // Payment
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  discountAmount?: number | null;
  // Signing
  signatureData?: string | null;
  signedAt?: Date | null;
  signedIp?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  otpVerified?: boolean;
  otpVerifiedAt?: Date | null;
  verificationUrl?: string;
  termsAccepted?: Record<string, boolean>;
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — BOOKING SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
function drawPage1(doc: any, o: AgreementPdfOptions, qrBuf: Buffer | null) {
  let y = CONTENT_Y + 2;

  // ── Agreement reference banner ────────────────────────────────────────────
  doc.rect(M, y, CW, 52).fill(LG).stroke(DG);
  // QR code
  if (qrBuf) {
    try { doc.image(qrBuf, M + CW - 52, y + 2, { width: 48, height: 48 }); } catch {}
  }
  const bannerW = qrBuf ? CW - 62 : CW - 16;
  doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("AGREEMENT REFERENCE", M + 10, y + 6);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(14).text(o.agreementNumber, M + 10, y + 16);
  doc.fill(GREY_MID).font("Helvetica").fontSize(7.5)
    .text(
      `Booking: ${o.bookingNumber}  |  Status: ${(o.status || "PENDING SIGNATURE").toUpperCase().replace(/_/g," ")}  |  Date: ${fmtDate(o.agreementDate || new Date())}`,
      M + 10, y + 36, { width: bannerW }
    );
  doc.fill("black");
  y += 58;

  // ── Customer information ──────────────────────────────────────────────────
  y = secBar(doc, y, "PILGRIM / CUSTOMER INFORMATION");

  // Photo placeholder box (left)
  const photoW = 60;
  const photoH = 76;
  doc.rect(M, y, photoW, photoH).fill("#E8E8E8").stroke("#C0C0C0");
  doc.fill("#AAA").font("Helvetica").fontSize(6.5)
    .text("PILGRIM\nPHOTO", M, y + 28, { width: photoW, align: "center" });
  doc.fill("black");

  // Customer info grid (right of photo)
  const infoX = M + photoW + 6;
  const infoW = CW - photoW - 6;
  const cellH = 25;
  const cellGap = 2;
  const cHalf = (infoW - cellGap) / 2;

  // Row 1
  infoCell(doc, infoX,           y,             cHalf, cellH, "FULL NAME", o.customerName || "—", true);
  infoCell(doc, infoX + cHalf + cellGap, y,     cHalf, cellH, "MOBILE", o.customerMobile || "—");
  y += cellH + cellGap;
  // Row 2
  infoCell(doc, infoX,           y,             cHalf, cellH, "PASSPORT NO.", o.customerPassport || "—");
  infoCell(doc, infoX + cHalf + cellGap, y,     cHalf, cellH, "EMAIL", o.customerEmail || "—");
  y += cellH + cellGap;
  // Row 3
  infoCell(doc, infoX,           y,             cHalf, cellH, "AADHAAR NO.", o.customerAadhaar ? `XXXX-XXXX-${String(o.customerAadhaar).slice(-4)}` : "—");
  infoCell(doc, infoX + cHalf + cellGap, y,     cHalf, cellH, "DATE OF BIRTH", fmtDate(o.customerDob));
  y += cellH + cellGap;
  // Row 4 (align with photo bottom)
  infoCell(doc, infoX,           y,             cHalf, cellH, "PAN NO.", o.customerPan || "—");
  infoCell(doc, infoX + cHalf + cellGap, y,     cHalf, cellH, "BLOOD GROUP", o.customerBloodGroup || "—");

  // Advance y to max of photo bottom or grid bottom
  y = Math.max(y + cellH, CONTENT_Y + 2 + 58 + 24 + photoH) + 8;

  // Emergency contact bar
  doc.rect(M, y, CW, 20).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("EMERGENCY CONTACT:", M + 8, y + 6, { continued: true });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7)
    .text(`  ${fmt(o.emergencyContactName)}  |  ${fmt(o.emergencyContactMobile)}`, { continued: false });
  doc.fill("black");
  y += 24;

  // ── Package details ───────────────────────────────────────────────────────
  y = secBar(doc, y, "PACKAGE DETAILS");

  const pkg = [
    ["Package", o.packageName || "Hajj Package"],
    ["Pilgrims", String(o.numberOfPilgrims || 1)],
    ["Departure", fmtDate(o.departureDate)],
    ["Return", fmtDate(o.returnDate)],
    ["Group", o.groupName || "To be notified"],
    ["Maktab No.", o.maktabNumber || "—"],
  ];
  const pkgCols = Math.ceil(pkg.length / 2);
  const pkgCellW = (CW - (pkgCols - 1) * 4) / pkgCols;
  let pkgX = M;
  let pkgYbase = y;
  pkg.forEach(([lbl, val], i) => {
    const col = i % pkgCols;
    const row = Math.floor(i / pkgCols);
    infoCell(doc, M + col * (pkgCellW + 4), pkgYbase + row * 27, pkgCellW, 23, lbl, val);
  });
  y = pkgYbase + Math.ceil(pkg.length / pkgCols) * 27 + 6;

  // ── Hotel & Flight (2 columns) ────────────────────────────────────────────
  y = secBar(doc, y, "ACCOMMODATION & FLIGHTS");

  const colX2 = M + COL_HALF + 8;

  // Hotel column
  doc.rect(M, y, COL_HALF, 72).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("MAKKAH ACCOMMODATION", M + 6, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(8).text(fmt(o.makkahHotel, "To be confirmed"), M + 6, y + 16, { width: COL_HALF - 12 });
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("MADINAH ACCOMMODATION", M + 6, y + 32);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(8).text(fmt(o.madinahHotel, "To be confirmed"), M + 6, y + 43, { width: COL_HALF - 12 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(7)
    .text(`Room Sharing: ${fmt(o.roomSharing, "As allocated")}  |  Dist. from Haram: ${fmt(o.hotelDistance, "—")}`, M + 6, y + 59, { width: COL_HALF - 12 });
  doc.fill("black");

  // Flight column
  doc.rect(colX2, y, COL_HALF, 72).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7.5).text("FLIGHT DETAILS", colX2 + 6, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(9).text(fmt(o.airline, "To be confirmed"), colX2 + 6, y + 16, { width: COL_HALF - 12 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(7.5).text(`Flight No: ${fmt(o.flightNumber)}`, colX2 + 6, y + 31);
  doc.fill(GREY_MID).font("Helvetica").fontSize(7.5).text(`Departure: ${fmt(o.flightDeparture)}`, colX2 + 6, y + 43);
  doc.fill(GREY_MID).font("Helvetica").fontSize(7.5).text(`Arrival: ${fmt(o.flightArrival)}`, colX2 + 6, y + 55);
  doc.fill(GREY_MID).font("Helvetica").fontSize(7).text(`Baggage: ${fmt(o.baggageAllowance, "23 kg")}  |  Transit: ${fmt(o.flightTransit, "—")}`, colX2 + 6, y + 65, { width: COL_HALF - 12 });
  doc.fill("black");
  y += 78;

  // ── Financial summary ─────────────────────────────────────────────────────
  y = secBar(doc, y, "FINANCIAL SUMMARY");

  const total = Number(o.totalAmount || 0);
  const paid  = Number(o.paidAmount || 0);
  const bal   = Number(o.balanceAmount ?? (total - paid));
  const disc  = Number(o.discountAmount || 0);

  const finRows: [string, string, boolean][] = [
    ["Gross Package Amount",      fmtMoney(total + disc),  false],
    ["Less: Discount / Waiver",   disc > 0 ? `-  ${fmtMoney(disc)}` : "—",  false],
    ["NET PACKAGE AMOUNT",        fmtMoney(total),         true],
    ["Amount Paid to Date",       fmtMoney(paid),          false],
    ["OUTSTANDING BALANCE",       fmtMoney(bal),           bal > 0],
  ];
  finRows.forEach(([label, value, hl], i) => {
    const rowY = y + i * 15;
    if (hl) doc.rect(M, rowY, CW, 14).fill(i === 2 ? LG : "#FFF3CD");
    doc.fill("#666").font(hl ? "Helvetica-Bold" : "Helvetica").fontSize(8).text(label, M + 8, rowY + 3, { width: 280 });
    doc.fill(hl ? DG : GREY_DARK).font(hl ? "Helvetica-Bold" : "Helvetica").fontSize(8)
      .text(value, M + CW - 140, rowY + 3, { width: 132, align: "right" });
  });
  y += finRows.length * 15 + 8;

  // ── Validity statement ───────────────────────────────────────────────────
  doc.rect(M, y, CW, 26).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Oblique").fontSize(7.5)
    .text("This Agreement becomes legally binding upon OTP-verified digital signature. It is enforceable under the Information Technology Act, 2000 and the Indian Contract Act, 1872.", M + 10, y + 8, { width: CW - 20 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — SERVICES & CANCELLATION POLICY
// ══════════════════════════════════════════════════════════════════════════════
function drawPage2(doc: any, o: AgreementPdfOptions) {
  let y = CONTENT_Y + 2;

  // ── Package Inclusions ────────────────────────────────────────────────────
  y = secBar(doc, y, "WHAT IS INCLUDED IN YOUR HAJJ PACKAGE  ✓");

  const incHalf = (CW - 6) / 2;
  let incY = y;
  HAJJ_INCLUDES.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = M + col * (incHalf + 6);
    if (col === 0) incY = y + row * 13;
    checkItem(doc, cx, incY, incHalf, item, true);
  });
  y = y + Math.ceil(HAJJ_INCLUDES.length / 2) * 13 + 8;

  // ── Package Exclusions ────────────────────────────────────────────────────
  y = secBar(doc, y, "WHAT IS NOT INCLUDED (EXCLUSIONS)  ✗");

  let excY = y;
  HAJJ_EXCLUDES.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    if (col === 0) excY = y + row * 13;
    checkItem(doc, M + col * (incHalf + 6), excY, incHalf, item, false);
  });
  y = y + Math.ceil(HAJJ_EXCLUDES.length / 2) * 13 + 10;
  y = goldLine(doc, y);

  // ── Payment Policy ────────────────────────────────────────────────────────
  y = secBar(doc, y, "PAYMENT SCHEDULE & POLICY");

  const payColW = [CW * 0.45, CW * 0.30, CW * 0.25];
  y = tableRow(doc, y, ["Payment Stage", "Amount / %", "Due Date"], payColW, true);
  [
    ["Booking Confirmation (Registration)",    "20% of package", "At time of booking"],
    ["Second Instalment",                      "30% of package", "60 days prior departure"],
    ["Final Payment",                          "Balance 50%",    "30 days prior departure"],
    ["Visa Fee (GOI rates, non-refundable)",   "Actuals",        "As communicated"],
  ].forEach(([a, b, c], i) => {
    y = tableRow(doc, y, [a, b, c], payColW, false, i % 2 === 0);
  });
  y += 10;

  // ── Cancellation Table ────────────────────────────────────────────────────
  y = secBar(doc, y, "CANCELLATION & REFUND SCHEDULE");

  const canColW = [CW * 0.42, CW * 0.28, CW * 0.30];
  y = tableRow(doc, y, ["Cancellation Period Before Departure", "Deduction", "Refund Estimate"], canColW, true);
  [
    ["More than 90 days",          "10% admin charge",      "90% refundable"],
    ["60 to 89 days",              "25% of total paid",     "75% refundable"],
    ["30 to 59 days",              "50% of total paid",     "50% refundable"],
    ["15 to 29 days",              "75% of total paid",     "25% refundable"],
    ["Less than 15 days / After departure", "No refund",   "Non-refundable"],
  ].forEach(([a, b, c], i) => {
    y = tableRow(doc, y, [a, b, c], canColW, false, i % 2 === 0);
  });
  y += 8;

  // ── Important notes ───────────────────────────────────────────────────────
  doc.rect(M, y, CW, 46).fill("#FFF3CD").stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7.5).text("IMPORTANT NOTES REGARDING CANCELLATION & REFUNDS", M + 8, y + 5);
  doc.fill("#7B4700").font("Helvetica").fontSize(7)
    .text(
      "• Visa processing fees, government levies, and airline cancellation charges are non-refundable in all circumstances.\n" +
      "• Refunds are processed within 30 working days via the original payment method. No cash refunds exceeding ₹10,000.\n" +
      "• All cancellations must be communicated in writing (email to bookings@alburhantravels.com or registered letter). Verbal cancellations are not accepted.\n" +
      "• In force majeure events, refunds are limited to amounts recoverable from airlines, hotels, and other service providers.",
      M + 8, y + 18, { width: CW - 16, lineGap: 1 }
    );
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — TERMS & CONDITIONS + DECLARATION
// ══════════════════════════════════════════════════════════════════════════════
function drawPage3(doc: any, o: AgreementPdfOptions) {
  let y = CONTENT_Y + 2;

  y = secBar(doc, y, "TERMS & CONDITIONS — SUMMARY (All 13 Clauses)");

  const clauseW = (CW - 6) / 2;
  let leftY = y;
  let rightY = y;
  HAJJ_AGREEMENT_CLAUSES.forEach((clause, i) => {
    const isLeft = i % 2 === 0;
    const cx = isLeft ? M : M + clauseW + 6;
    const cy = isLeft ? leftY : rightY;

    // Clause title bar
    doc.rect(cx, cy, clauseW, 14).fill(isLeft ? DG : "#1A4D35");
    const accepted = o.termsAccepted ? (o.termsAccepted[clause.id] !== false) : false;
    const checkTxt = o.signedAt ? (accepted ? " ✓" : " ✗") : "";
    doc.fill("white").font("Helvetica-Bold").fontSize(7).text(clause.title + checkTxt, cx + 5, cy + 4, { width: clauseW - 10 });
    doc.fill("black");

    // Body
    doc.fill(GREY_DARK).font("Helvetica").fontSize(6.8)
      .text(clause.body, cx + 4, cy + 16, { width: clauseW - 8, lineGap: 0.8 });

    const endY = doc.y + 6;
    const clauseEnd = endY;

    if (isLeft) {
      leftY = clauseEnd;
    } else {
      rightY = clauseEnd;
      // After each pair, y advances to max of both columns
      leftY  = Math.max(leftY, rightY);
      rightY = leftY;
    }
  });

  // If odd number of clauses, left may be ahead
  y = Math.max(leftY, rightY) + 6;

  // Horizontal divider
  y = goldLine(doc, y);

  // ── Customer Declaration ──────────────────────────────────────────────────
  y = secBar(doc, y, "CUSTOMER DECLARATION — MANDATORY ACCEPTANCE");

  const declarations = [
    "I have read, fully understood, and voluntarily accept all 13 clauses of this Agreement as summarised above.",
    "All personal, medical, and travel information provided to the Agency is true, accurate, complete, and not misleading.",
    "I am physically, medically, and legally competent to undertake the Hajj journey and to enter into this legally binding contract.",
    "I understand and accept the cancellation and refund policy as detailed in this Agreement.",
    "I accept full responsibility for my conduct during the journey and for compliance with all Saudi Arabian and Indian laws.",
    "I accept that my digital signature is legally equivalent to a wet-ink signature under Section 5 of the IT Act, 2000.",
    "I confirm that my mobile number was verified via OTP immediately prior to signing — constituting valid electronic authentication.",
  ];

  declarations.forEach((decl, i) => {
    const isAccepted = !!o.signedAt;
    const bx = M + 3;
    const by = y + 2;
    // Checkbox box
    doc.rect(bx, y, 10, 10).fill(isAccepted ? DG : "#E0E0E0").stroke("#999");
    if (isAccepted) {
      doc.fill("white").font("Helvetica-Bold").fontSize(7).text("✓", bx + 1, y + 1);
    }
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5)
      .text(`(${i + 1}) ${decl}`, M + 16, y + 1, { width: CW - 16, lineGap: 0.5 });
    y = doc.y + 7;
    doc.fill("black");
  });

  y += 4;

  // ── Declaration signature line ────────────────────────────────────────────
  doc.rect(M, y, CW, 30).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5)
    .text("By executing this Agreement digitally (OTP + signature), the Customer/Pilgrim confirms acceptance of all 13 clauses above. This digital execution is valid and enforceable under the Information Technology Act, 2000 (India) and is as binding as a handwritten agreement.", M + 8, y + 5, { width: CW - 16, lineGap: 1 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — DIGITAL EXECUTION
// ══════════════════════════════════════════════════════════════════════════════
function drawPage4(doc: any, o: AgreementPdfOptions, qrBuf: Buffer | null) {
  let y = CONTENT_Y + 2;

  y = secBar(doc, y, "DIGITAL EXECUTION & SIGNATURES");

  if (o.signedAt && o.signatureData) {
    // ── Signature panels ────────────────────────────────────────────────────
    const panH = 110;

    // Customer signature
    doc.rect(M, y, COL_HALF, panH).fill("#FAFFFE").stroke(DG);
    doc.fill(DG).font("Helvetica-Bold").fontSize(8).text("CUSTOMER / PILGRIM DIGITAL SIGNATURE", M + 8, y + 7);
    try {
      const sigBuf = Buffer.from(o.signatureData.replace(/^data:image\/\w+;base64,/, ""), "base64");
      doc.image(sigBuf, M + 8, y + 22, { width: COL_HALF - 18, height: 58, fit: [COL_HALF - 18, 58] });
    } catch {}
    doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text(fmt(o.customerName), M + 8, y + 86);
    doc.fill(GREY_MID).font("Helvetica").fontSize(7)
      .text(o.signedAt.toLocaleString("en-IN"), M + 8, y + 98);
    doc.fill("black");

    // Agency authorisation
    const col2X = M + COL_HALF + 8;
    doc.rect(col2X, y, COL_HALF, panH).fill(GOLD_LITE).stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(8).text("AGENCY AUTHORISATION", col2X + 8, y + 7);
    // Agency seal placeholder
    doc.circle(col2X + COL_HALF / 2, y + 55, 30).fill("#E8D8A0").stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(6.5).text("AL BURHAN\nTOURS & TRAVELS\nOFFICIAL SEAL", col2X + COL_HALF / 2 - 28, y + 43, { width: 56, align: "center" });
    doc.fill("#7B4700").font("Helvetica").fontSize(7).text("Authorised Signatory", col2X + 8, y + 92);
    doc.fill(GREY_MID).font("Helvetica").fontSize(7).text("Al Burhan Tours & Travels", col2X + 8, y + 102);
    doc.fill("black");

    y += panH + 10;

    // OTP verification strip
    const otpOk = o.otpVerified;
    doc.rect(M, y, CW, 22).fill(otpOk ? "#E8F5E9" : "#FFF0F0").stroke(otpOk ? DG : "#CC0000");
    doc.fill(otpOk ? DG : "#CC0000").font("Helvetica-Bold").fontSize(9)
      .text(otpOk ? "✓  OTP MOBILE VERIFICATION CONFIRMED" : "✗  OTP MOBILE VERIFICATION PENDING", M + 10, y + 6, { continued: true });
    doc.fill(GREY_MID).font("Helvetica").fontSize(7.5)
      .text(`  |  Mobile: ${o.customerMobile}  |  Verified at: ${o.otpVerifiedAt ? o.otpVerifiedAt.toLocaleString("en-IN") : "—"}`, { continued: false });
    doc.fill("black");
    y += 28;

  } else {
    // Unsigned state
    doc.rect(M, y, CW, 50).fill(GOLD_LITE).stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(10).text("⏳  AWAITING DIGITAL SIGNATURE", M + 10, y + 10, { width: CW - 20 });
    doc.fill("#7B4700").font("Helvetica-Oblique").fontSize(8.5)
      .text("This agreement has been sent to the customer for digital signing. Signature, OTP verification, and audit details will appear here once executed.", M + 10, y + 26, { width: CW - 20 });
    doc.fill("black");
    y += 58;
  }

  // ── QR Verification ───────────────────────────────────────────────────────
  y = secBar(doc, y, "QR VERIFICATION CODE");

  if (qrBuf) {
    const qrSize = 80;
    try { doc.image(qrBuf, M, y, { width: qrSize, height: qrSize }); } catch {}
    const qrTx = M + qrSize + 12;
    doc.fill(DG).font("Helvetica-Bold").fontSize(10).text("Scan to Verify This Agreement", qrTx, y + 6, { width: CW - qrSize - 12 });
    doc.fill(GREY_MID).font("Helvetica").fontSize(8)
      .text(`Agreement: ${o.agreementNumber}\nBooking: ${o.bookingNumber}\nCustomer: ${o.customerName}\nStatus: ${(o.status || "PENDING").toUpperCase().replace(/_/g," ")}`, qrTx, y + 24, { lineGap: 2 });
    doc.fill("#888").font("Helvetica").fontSize(7)
      .text(`URL: ${o.verificationUrl || "—"}`, qrTx, y + 68, { width: CW - qrSize - 12, ellipsis: true });
    y += qrSize + 10;
  } else {
    y += 10;
  }

  // ── Audit Trail ───────────────────────────────────────────────────────────
  y = secBar(doc, y, "LEGAL AUDIT TRAIL");

  if (o.signedAt) {
    const auditRows = [
      ["Event",                     "Details",                                              "Timestamp"],
      ["Agreement Generated",       o.agreementNumber,                                      fmtDate(o.agreementDate)],
      ["OTP Requested",             `Mobile: ${o.customerMobile}`,                          o.otpVerifiedAt ? fmtDate(o.otpVerifiedAt) : "—"],
      ["OTP Verified",              o.otpVerified ? "✓ Mobile ownership confirmed via SMS" : "Not verified", o.otpVerifiedAt ? o.otpVerifiedAt.toLocaleString("en-IN") : "—"],
      ["Agreement Signed",          `IP: ${o.signedIp || "Recorded"}`,                      o.signedAt.toLocaleString("en-IN")],
      ["Device / Platform",         (o.deviceInfo || (o.userAgent || "").substring(0, 60)).substring(0, 70), "—"],
    ];
    const auditColW = [CW * 0.28, CW * 0.45, CW * 0.27];
    auditRows.forEach((row, i) => {
      y = tableRow(doc, y, row, auditColW, i === 0, i % 2 === 0);
    });
    y += 8;
  } else {
    doc.fill("#AAA").font("Helvetica-Oblique").fontSize(8)
      .text("Audit trail will be recorded upon signature completion.", M, y + 4);
    y += 18;
  }

  // ── Legal footer statement ────────────────────────────────────────────────
  doc.rect(M, y, CW, 2).fill(GOLD); y += 6;
  doc.fill(GREY_MID).font("Helvetica-Oblique").fontSize(6.8)
    .text(
      "This document constitutes a legally binding agreement executed by way of digital/electronic signature under Section 5 read with Schedule I of the Information Technology Act, 2000 (India), and the Indian Contract Act, 1872. " +
      "The digital signature affixed herein is as valid and enforceable as a wet-ink signature. Any unauthorised alteration of this document is an offence under applicable law. " +
      "This agreement was generated by the Al Burhan Tours & Travels automated agreement system and carries the full legal authority of the Agency.",
      M, y, { width: CW, lineGap: 1.5 }
    );
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export async function generateAgreementPdfBuffer(opts: AgreementPdfOptions): Promise<Buffer> {
  let qrBuf: Buffer | null = null;
  if (opts.verificationUrl) {
    try { qrBuf = await QRCode.toBuffer(opts.verificationUrl, { width: 130, margin: 1 }); } catch {}
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });

  // Page 1
  drawHeader(doc, "DIGITAL HAJJ AGREEMENT");
  drawPage1(doc, opts, qrBuf);
  drawFooter(doc, 1, 4);

  // Page 2
  doc.addPage();
  drawHeader(doc, "PACKAGE SERVICES & CANCELLATION POLICY");
  drawPage2(doc, opts);
  drawFooter(doc, 2, 4);

  // Page 3
  doc.addPage();
  drawHeader(doc, "TERMS & CONDITIONS — CUSTOMER DECLARATION");
  drawPage3(doc, opts);
  drawFooter(doc, 3, 4);

  // Page 4
  doc.addPage();
  drawHeader(doc, "DIGITAL EXECUTION & AUDIT TRAIL");
  drawPage4(doc, opts, qrBuf);
  drawFooter(doc, 4, 4);

  return pdfToBuffer(doc);
}
