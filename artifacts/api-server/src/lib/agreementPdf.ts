// @ts-nocheck
import PDFDocument from "pdfkit";
import { LOGO_BASE64 } from "./logoData.js";
import QRCode from "qrcode";

// ── Colour & layout constants ─────────────────────────────────────────────────
const LOGO_BUF  = Buffer.from(LOGO_BASE64, "base64");
const DG        = "#0B3D2E";   // dark emerald green
const GOLD      = "#C9A23F";
const LG        = "#EBF5EB";   // light green
const GOLD_LITE = "#FFF8E7";
const GREY_DARK = "#2C2C2C";
const GREY_MID  = "#555555";
const GREY_LITE = "#F7F7F7";
const RED_SOFT  = "#FFF0F0";
const M         = 36;          // page margin (pts)
const W         = 595;         // A4 width
const H         = 842;         // A4 height
const CW        = W - M * 2;   // content width = 523
const HDR_H     = 92;
const FTR_H     = 28;
const CONTENT_Y = HDR_H + 6;
const COL_HALF  = (CW - 8) / 2;   // ~257.5

// ── Utility ───────────────────────────────────────────────────────────────────
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
function maskAadhaar(v: any): string {
  if (!v) return "—";
  const s = String(v).replace(/\s/g, "");
  return s.length >= 4 ? "XXXX-XXXX-" + s.slice(-4) : "—";
}

// ── Header ────────────────────────────────────────────────────────────────────
function drawHeader(doc: any, subtitle: string, agreementNum?: string, bookingNum?: string) {
  doc.rect(0, 0, W, HDR_H).fill(DG);
  doc.rect(0, HDR_H - 4, W, 4).fill(GOLD);
  // Logo
  try { doc.image(LOGO_BUF, M, 10, { width: 66 }); } catch {}
  // Company name & info
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(15).text("AL BURHAN TOURS & TRAVELS", M + 74, 12, { width: CW - 74 });
  doc.fill("white").font("Helvetica").fontSize(7).text("Regd. Hajj & Umrah Travel Agency  |  Est. 2008  |  GSTIN: 23AAVFA3223C1ZW", M + 74, 31, { width: CW - 74 });
  doc.fill("rgba(255,255,255,0.75)").font("Helvetica").fontSize(6.5)
    .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331, M.P.  |  +91 9893989786  |  alburhantravels.com", M + 74, 42, { width: CW - 74 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(9.5).text(subtitle, M + 74, 56, { width: CW - 74 });
  if (agreementNum) {
    doc.fill("rgba(201,162,63,0.7)").font("Helvetica").fontSize(7)
      .text(`Ref: ${agreementNum}${bookingNum ? "  |  Booking: " + bookingNum : ""}`, M + 74, 70, { width: CW - 74 });
  }
  doc.fill("black");
}

// ── Footer ────────────────────────────────────────────────────────────────────
function drawFooter(doc: any, pageNum: number, total = 6) {
  doc.rect(0, H - FTR_H, W, FTR_H).fill(DG);
  doc.rect(0, H - FTR_H, W, 2).fill(GOLD);
  doc.fill("white").font("Helvetica").fontSize(6.5)
    .text("Al Burhan Tours & Travels  |  Legally binding under IT Act 2000  |  Confidential", M, H - FTR_H + 9, { width: CW / 2 });
  doc.fill(GOLD).font("Helvetica").fontSize(6.5)
    .text(`Page ${pageNum} of ${total}`, M + CW / 2, H - FTR_H + 9, { width: CW / 2, align: "right" });
  doc.fill("black");
}

// ── Section header bar ────────────────────────────────────────────────────────
function secBar(doc: any, y: number, text: string, bg = DG): number {
  doc.rect(M, y, CW, 20).fill(bg);
  doc.fill(bg === DG ? "white" : (bg === GOLD ? DG : DG)).font("Helvetica-Bold").fontSize(8.5)
    .text(text, M + 8, y + 5, { width: CW - 16 });
  doc.fill("black");
  return y + 24;
}

// ── Gold separator ────────────────────────────────────────────────────────────
function goldLine(doc: any, y: number): number {
  doc.rect(M, y, CW, 1.5).fill(GOLD);
  return y + 5;
}

// ── Info cell ─────────────────────────────────────────────────────────────────
function infoCell(doc: any, x: number, y: number, w: number, h: number, label: string, value: string, bold = false) {
  doc.rect(x, y, w, h).fill(GREY_LITE).stroke("#E0E0E0");
  doc.fill(GREY_MID).font("Helvetica").fontSize(6).text(label, x + 4, y + 3, { width: w - 8 });
  doc.fill(GREY_DARK).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
    .text(fmt(value), x + 4, y + 12, { width: w - 8, ellipsis: true });
  doc.fill("black");
}

// ── Table row ─────────────────────────────────────────────────────────────────
function tableRow(doc: any, y: number, cols: string[], colWidths: number[], isHeader = false, evenRow = false): number {
  let x = M;
  const rowH = isHeader ? 18 : 15;
  const bg = isHeader ? DG : (evenRow ? LG : "white");
  doc.rect(M, y, CW, rowH).fill(bg).stroke("#D0D0D0");
  cols.forEach((text, i) => {
    const cw = colWidths[i];
    doc.fill(isHeader ? "white" : GREY_DARK)
      .font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(isHeader ? 7 : 7.5)
      .text(fmt(text), x + 4, y + (isHeader ? 5 : 4), { width: cw - 8, ellipsis: true });
    x += cw;
  });
  doc.fill("black");
  return y + rowH;
}

// ── Check item ────────────────────────────────────────────────────────────────
function checkItem(doc: any, x: number, y: number, w: number, text: string, included = true): number {
  const icon = included ? "✓" : "✗";
  const col  = included ? DG : "#CC0000";
  doc.fill(col).font("Helvetica-Bold").fontSize(8).text(icon, x, y, { width: 12 });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(text, x + 14, y, { width: w - 16 });
  doc.fill("black");
  return y + 12;
}

// ── Bullet point ──────────────────────────────────────────────────────────────
function bullet(doc: any, x: number, y: number, w: number, text: string, color = GREY_DARK): number {
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(7).text("•", x, y, { width: 10 });
  doc.fill(color).font("Helvetica").fontSize(7).text(text, x + 12, y, { width: w - 14 });
  doc.fill("black");
  return y + 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSENT CATEGORIES (9 categories — used in signing wizard + Page 5)
// ─────────────────────────────────────────────────────────────────────────────
export const CONSENT_CATEGORIES = [
  { id: "terms_conditions", title: "1. Terms & Conditions",
    body: "I have read, fully understood, and voluntarily accept all Terms & Conditions of this Agreement including booking, cancellation, agency responsibilities, and customer obligations as detailed in this document." },
  { id: "payment_policy", title: "2. Payment Policy",
    body: "I accept the payment schedule: 50% advance at booking, balance 50% due 50 days before departure. I understand that Hajj visa processing and ticket issuance begin only after full payment with official receipt." },
  { id: "refund_policy", title: "3. Refund & Cancellation Policy",
    body: "I understand the refund schedule: >90 days: 10% deduction; 60–89 days: 25%; 30–59 days: 50%; 15–29 days: 75%; <15 days or after departure: No refund. Visa, airline and hotel charges are non-refundable in all circumstances." },
  { id: "privacy_policy", title: "4. Privacy & Data Protection",
    body: "I consent to collection and processing of my personal data including passport, biometric, medical and payment details for Hajj facilitation and regulatory compliance as required by Saudi Arabian and Indian government authorities." },
  { id: "medical_declaration", title: "5. Medical Declaration",
    body: "I declare that I am physically and medically fit to perform all Hajj rites including extensive walking. I have disclosed all existing medical conditions, carry required medications, and have completed all mandatory vaccinations." },
  { id: "visa_declaration", title: "6. Visa & Passport Declaration",
    body: "I declare that my passport has 6+ months validity from the return date, all submitted documents are genuine and correct. I understand Saudi visa issuance is solely at the discretion of Saudi authorities and not guaranteed." },
  { id: "force_majeure", title: "7. Force Majeure",
    body: "I understand Al Burhan Tours & Travels is not liable for loss or delays arising from war, pandemic, natural disaster, government restrictions, Saudi Ministry decisions, airline cancellations, or any circumstances beyond the company's control." },
  { id: "airline_disclaimer", title: "8. Airline Disclaimer",
    body: "I understand that flights are operated by respective airlines and Al Burhan Tours & Travels acts as travel organizer only. The company is not responsible for flight delays, cancellations, diversions, seat changes, or any airline operational decisions." },
  { id: "baggage_policy", title: "9. Baggage Policy",
    body: "I accept the baggage allowance per airline rules (up to 25 KG checked + cabin baggage). I understand Al Burhan Tours & Travels is not responsible for lost, delayed, damaged, confiscated or stolen baggage." },
];

// ─────────────────────────────────────────────────────────────────────────────
// HAJJ LEGAL CLAUSES (13 clauses for Page 3 legal text)
// ─────────────────────────────────────────────────────────────────────────────
export const HAJJ_AGREEMENT_CLAUSES = [
  { id: "booking_confirmation", title: "1. BOOKING CONFIRMATION",
    body: "This Agreement confirms the Pilgrim's Hajj package booking with Al Burhan Tours & Travels. A unique Agreement Number is assigned as the official reference. The Agreement becomes legally binding upon digital execution under the IT Act, 2000." },
  { id: "payment_terms", title: "2. PAYMENT TERMS",
    body: "50% advance payment at booking confirms registration. Remaining 50% due 50 days before departure. Visa processing begins only after full payment. Official receipts issued for all payments. Payments via Razorpay, NEFT/IMPS or cash only. Unauthorized receipts not accepted." },
  { id: "cancellation_policy", title: "3. CANCELLATION & REFUND",
    body: ">90 days: 10% charge. 60–89 days: 25% deduction. 30–59 days: 50% deduction. 15–29 days: 75% deduction. <15 days/post-departure: No refund. Visa, airline & hotel charges non-refundable. Refunds within 30 working days." },
  { id: "passport_visa", title: "4. PASSPORT & VISA",
    body: "Passport must have 6+ months validity from return date. Agency files Hajj visa via Hajj Committee. Saudi visa approval is at the sole discretion of Saudi authorities — Agency not liable for rejection. All documents must be submitted by deadline." },
  { id: "health_requirements", title: "5. HEALTH & MEDICAL",
    body: "Pilgrim warrants physical fitness for all Hajj rites. Mandatory vaccinations (ACWY Meningococcal, COVID-19) must be completed before departure. Medical certificate required for pilgrims above 65 years or with chronic conditions." },
  { id: "accommodation", title: "6. ACCOMMODATION",
    body: "Aziziyah ~5 km from Haram. Mina in New Mina Zone Category D. Makkah/Madinah on 5-bed sharing unless additional charge paid. Room upgrades subject to availability. Hotels may be changed to equivalent/higher category due to Saudi allocation." },
  { id: "conduct_discipline", title: "7. CONDUCT & DISCIPLINE",
    body: "Pilgrim must comply with Saudi law, Agency guide instructions, and group schedule. Independent movement requires prior notification to guide. Serious misconduct may result in arranged return travel at Pilgrim's expense." },
  { id: "liability", title: "8. LIABILITY & INSURANCE",
    body: "Agency's maximum liability is limited to the total amount paid. Not liable for delays or failures by third-party providers (airlines, hotels, transport). Comprehensive travel insurance strongly recommended." },
  { id: "force_majeure", title: "9. FORCE MAJEURE",
    body: "Neither party liable for failure due to acts of God, pandemic, war, terrorism, government decisions, or actions by Saudi/Indian authorities. Refunds in such events limited to amounts recoverable from service providers." },
  { id: "flight_baggage", title: "10. FLIGHTS & BAGGAGE",
    body: "Flights operated by respective airlines. Agency acts as travel organizer only. Not responsible for delays, cancellations, seat changes or airline decisions. Baggage subject to airline policy. Not responsible for lost or damaged baggage." },
  { id: "privacy_data", title: "11. PRIVACY & DATA",
    body: "Pilgrim consents to processing of personal data (passport, biometric, medical, payment) for Hajj facilitation and regulatory compliance. Data shared with Hajj authorities, airlines, and hotels as required." },
  { id: "dispute_resolution", title: "12. DISPUTE RESOLUTION",
    body: "Good-faith negotiation first (30 days). Unresolved disputes referred to arbitration under Arbitration & Conciliation Act 1996, venue Burhanpur, M.P. Courts at Burhanpur have exclusive jurisdiction. Governed by Indian law." },
  { id: "digital_signature_declaration", title: "13. DIGITAL SIGNATURE",
    body: "Pilgrim confirms all information provided is true; is physically and medically fit for Hajj; digital signature is legally equivalent to wet-ink signature under IT Act 2000 §5 and Schedule I; mobile verified via OTP authentication." },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN OPTIONS INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
export interface AgreementPdfOptions {
  agreementNumber: string;
  bookingNumber: string;
  bookingId: string;
  status?: string;
  agreementDate?: Date | null;
  // Customer KYC
  customerName: string;
  customerFatherName?: string | null;
  customerMobile: string;
  customerWhatsApp?: string | null;
  customerEmail?: string | null;
  customerPassport?: string | null;
  passportIssueDate?: string | null;
  passportExpiry?: string | null;
  customerAadhaar?: string | null;
  customerPan?: string | null;
  customerDob?: string | null;
  customerGender?: string | null;
  customerNationality?: string | null;
  customerBloodGroup?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerCountry?: string | null;
  nominee?: string | null;
  nomineeRelation?: string | null;
  emergencyContactName?: string | null;
  emergencyContactMobile?: string | null;
  // Package
  packageName?: string | null;
  packageType?: string | null;
  packageCategory?: string | null;
  hajjYear?: string | null;
  numberOfPilgrims?: number | null;
  bookingDate?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  duration?: string | null;
  groupName?: string | null;
  groupNumber?: string | null;
  maktabNumber?: string | null;
  bookingStatus?: string | null;
  // Hotels
  makkahHotel?: string | null;
  makkahCategory?: string | null;
  makkahAddress?: string | null;
  makkahDistance?: string | null;
  makkahCheckIn?: string | null;
  makkahCheckOut?: string | null;
  madinahHotel?: string | null;
  madinahCategory?: string | null;
  madinahDistance?: string | null;
  madinahCheckIn?: string | null;
  madinahCheckOut?: string | null;
  aziziyahHotel?: string | null;
  aziziyahDistance?: string | null;
  aziziyahCheckIn?: string | null;
  aziziyahCheckOut?: string | null;
  minaCategory?: string | null;
  minaTentNumber?: string | null;
  minaMaktabNumber?: string | null;
  minaZone?: string | null;
  roomSharing?: string | null;
  // Transport
  airportTransfer?: string | null;
  busService?: string | null;
  guideService?: string | null;
  internalTransport?: string | null;
  // Flights
  airline?: string | null;
  flightNumber?: string | null;
  flightPnr?: string | null;
  departureAirport?: string | null;
  flightDeparture?: string | null;
  flightArrival?: string | null;
  flightTransit?: string | null;
  baggageAllowance?: string | null;
  cabinBaggage?: string | null;
  returnFlightNumber?: string | null;
  // Financial
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  discountAmount?: number | null;
  gstAmount?: number | null;
  tcsAmount?: number | null;
  govtCharges?: number | null;
  visaCharges?: number | null;
  dueDate?: string | null;
  paymentStatus?: string | null;
  // Signing & verification
  signatureData?: string | null;
  signedAt?: Date | null;
  signedIp?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  signingBrowser?: string | null;
  signingDevice?: string | null;
  signingOS?: string | null;
  signingGPS?: string | null;
  digitalHash?: string | null;
  otpVerified?: boolean;
  otpVerifiedAt?: Date | null;
  verificationUrl?: string;
  termsAccepted?: Record<string, boolean>;
  auditActions?: Array<{ action: string; details: any; created_at: string }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 1 — CUSTOMER INFORMATION + PACKAGE + FINANCIAL
// ══════════════════════════════════════════════════════════════════════════════
function drawPage1(doc: any, o: AgreementPdfOptions, qrBuf: Buffer | null) {
  let y = CONTENT_Y + 2;

  // ── Agreement reference banner ────────────────────────────────────────────
  doc.rect(M, y, CW, 50).fill(LG).stroke(DG);
  if (qrBuf) {
    try { doc.image(qrBuf, M + CW - 50, y + 1, { width: 48, height: 48 }); } catch {}
  }
  const bannerW = qrBuf ? CW - 62 : CW - 16;
  doc.fill(DG).font("Helvetica-Bold").fontSize(6.5).text("AGREEMENT REFERENCE", M + 10, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(13).text(o.agreementNumber, M + 10, y + 14);
  doc.fill(GREY_MID).font("Helvetica").fontSize(7)
    .text(`Booking: ${o.bookingNumber}  |  Status: ${(o.status || "PENDING SIGNATURE").toUpperCase().replace(/_/g, " ")}  |  Date: ${fmtDate(o.agreementDate || new Date())}`, M + 10, y + 32, { width: bannerW });
  doc.fill("black");
  y += 56;

  // ── Customer Information ──────────────────────────────────────────────────
  y = secBar(doc, y, "PILGRIM / CUSTOMER INFORMATION");

  const photoW = 62;
  const photoH = 82;
  // Photo placeholder
  doc.rect(M, y, photoW, photoH).fill("#E8E8E8").stroke("#C0C0C0");
  doc.fill("#BBB").font("Helvetica").fontSize(6).text("PASSPORT\nPHOTO", M, y + 32, { width: photoW, align: "center" });
  doc.fill("black");

  const infoX = M + photoW + 5;
  const infoW = CW - photoW - 5;
  const cellH = 23;
  const g = 2;
  const c3 = (infoW - 2 * g) / 3;
  const c2 = (infoW - g) / 2;

  // Row 1: Full Name (2/3) | Father/Husband Name (1/3)
  infoCell(doc, infoX,          y,       c2, cellH, "FULL NAME", fmt(o.customerName), true);
  infoCell(doc, infoX+c2+g,     y,       c2, cellH, "FATHER / HUSBAND NAME", fmt(o.customerFatherName));
  y += cellH + g;
  // Row 2: DOB | Gender | Nationality
  infoCell(doc, infoX,          y,       c3, cellH, "DATE OF BIRTH", fmtDate(o.customerDob));
  infoCell(doc, infoX+c3+g,     y,       c3, cellH, "GENDER", fmt(o.customerGender));
  infoCell(doc, infoX+2*(c3+g), y,       c3, cellH, "NATIONALITY", fmt(o.customerNationality));
  y += cellH + g;
  // Row 3: Passport | Issue Date | Expiry
  infoCell(doc, infoX,          y,       c3, cellH, "PASSPORT NO.", fmt(o.customerPassport));
  infoCell(doc, infoX+c3+g,     y,       c3, cellH, "ISSUE DATE", fmtDate(o.passportIssueDate));
  infoCell(doc, infoX+2*(c3+g), y,       c3, cellH, "EXPIRY DATE", fmtDate(o.passportExpiry));
  y += cellH + g;
  // Row 4: Aadhaar | PAN | Blood Group
  infoCell(doc, infoX,          y,       c3, cellH, "AADHAAR NO.", maskAadhaar(o.customerAadhaar));
  infoCell(doc, infoX+c3+g,     y,       c3, cellH, "PAN NO.", fmt(o.customerPan));
  infoCell(doc, infoX+2*(c3+g), y,       c3, cellH, "BLOOD GROUP", fmt(o.customerBloodGroup));

  // Ensure y advances past photo bottom
  const photoBottom = (CONTENT_Y + 2) + 56 + 24 + photoH;
  y = Math.max(y + cellH, photoBottom) + g;

  // Row 5: Mobile | WhatsApp | Email
  infoCell(doc, M,              y,       c3, cellH, "MOBILE", fmt(o.customerMobile));
  infoCell(doc, M+c3+g,         y,       c3, cellH, "WHATSAPP", fmt(o.customerWhatsApp || o.customerMobile));
  infoCell(doc, M+2*(c3+g),     y,       c3, cellH, "EMAIL", fmt(o.customerEmail));
  y += cellH + g;
  // Row 6: Address | City | State
  const addrW = (CW - 2 * g) * 0.45;
  const cityW = (CW - 2 * g) * 0.28;
  const stateW = CW - addrW - cityW - 2 * g;
  infoCell(doc, M,              y,       addrW, cellH, "ADDRESS", fmt(o.customerAddress));
  infoCell(doc, M+addrW+g,      y,       cityW, cellH, "CITY", fmt(o.customerCity));
  infoCell(doc, M+addrW+cityW+2*g, y,    stateW, cellH, "STATE / COUNTRY", fmt(o.customerState) + (o.customerCountry ? ", " + o.customerCountry : ""));
  y += cellH + 4;

  // Emergency + Nominee bars
  doc.rect(M, y, CW, 20).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("EMERGENCY CONTACT:", M + 8, y + 6, { continued: true });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7)
    .text(`  ${fmt(o.emergencyContactName)}  |  ${fmt(o.emergencyContactMobile)}`, { continued: false });
  doc.fill("black");
  y += 22;

  doc.rect(M, y, CW, 20).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("NOMINEE:", M + 8, y + 6, { continued: true });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7)
    .text(`  ${fmt(o.nominee, "Not specified")}  |  Relationship: ${fmt(o.nomineeRelation)}`, { continued: false });
  doc.fill("black");
  y += 26;

  // ── Package Details ───────────────────────────────────────────────────────
  y = secBar(doc, y, "PACKAGE INFORMATION");

  const pkgCells = [
    ["PACKAGE NAME", o.packageName || "Hajj Package"],
    ["PACKAGE TYPE", o.packageType || "Hajj"],
    ["HAJJ YEAR", o.hajjYear || new Date().getFullYear().toString()],
    ["GROUP NO.", o.groupName || o.groupNumber || "To be notified"],
    ["BOOKING DATE", fmtDate(o.bookingDate)],
    ["DEPARTURE DATE", fmtDate(o.departureDate)],
    ["RETURN DATE", fmtDate(o.returnDate)],
    ["DURATION", fmt(o.duration, "As per schedule")],
    ["ROOM SHARING", fmt(o.roomSharing, "Standard sharing")],
    ["PACKAGE CATEGORY", fmt(o.packageCategory, "Standard")],
    ["MAKTAB NO.", fmt(o.maktabNumber)],
    ["BOOKING STATUS", fmt(o.bookingStatus || o.status, "Active")],
  ];
  const pkgCols = 3;
  const pkgCellW = (CW - (pkgCols - 1) * g) / pkgCols;
  pkgCells.forEach(([lbl, val], i) => {
    const col = i % pkgCols;
    const row = Math.floor(i / pkgCols);
    infoCell(doc, M + col * (pkgCellW + g), y + row * (cellH + g), pkgCellW, cellH, lbl, val);
  });
  y += Math.ceil(pkgCells.length / pkgCols) * (cellH + g) + 4;

  // ── Financial Summary ─────────────────────────────────────────────────────
  y = secBar(doc, y, "FINANCIAL SUMMARY");

  const total = Number(o.totalAmount || 0);
  const paid  = Number(o.paidAmount || 0);
  const bal   = Number(o.balanceAmount ?? (total - paid));
  const disc  = Number(o.discountAmount || 0);
  const gst   = Number(o.gstAmount || 0);
  const tcs   = Number(o.tcsAmount || 0);
  const govt  = Number(o.govtCharges || 0);
  const visa  = Number(o.visaCharges || 0);

  const finCW1 = CW * 0.50;
  const finCW2 = CW * 0.25;
  const finCW3 = CW - finCW1 - finCW2;

  const finRows: [string, string, boolean][] = [
    ["Package Base Amount",       fmtMoney(total + disc - gst - tcs - govt - visa), false],
    ["GST Applicable",            gst > 0 ? fmtMoney(gst) : "Included",            false],
    ["TCS Applicable",            tcs > 0 ? fmtMoney(tcs) : "Included",            false],
    ["Govt. Charges",             govt > 0 ? fmtMoney(govt) : "—",                 false],
    ["Visa Charges",              visa > 0 ? fmtMoney(visa) : "—",                 false],
    ["Discount / Waiver",         disc > 0 ? `- ${fmtMoney(disc)}` : "—",          false],
    ["NET PACKAGE AMOUNT",        fmtMoney(total),                                  true],
    ["Advance Paid to Date",      fmtMoney(paid),                                   false],
    ["OUTSTANDING BALANCE",       fmtMoney(bal),                                    bal > 0],
    ["Due Date",                  fmtDate(o.dueDate),                               false],
    ["Payment Status",            fmt(o.paymentStatus, paid >= total ? "Paid" : "Partially Paid"), false],
  ];

  finRows.forEach(([label, value, hl], i) => {
    const rowY = y + i * 14;
    const bgFill = hl && i === 6 ? LG : (hl ? "#FFF3CD" : (i % 2 === 0 ? "white" : "#FAFAFA"));
    doc.rect(M, rowY, CW, 13).fill(bgFill);
    doc.fill("#666").font(hl ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).text(label, M + 6, rowY + 3, { width: finCW1 - 6 });
    doc.fill(hl ? DG : GREY_DARK).font(hl ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
      .text(value, M + finCW1, rowY + 3, { width: finCW2 + finCW3 - 6, align: "right" });
  });
  y += finRows.length * 14 + 4;

  // Legal note
  doc.rect(M, y, CW, 22).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Oblique").fontSize(7)
    .text("This Agreement is legally binding upon OTP-verified digital execution under the Information Technology Act, 2000 and the Indian Contract Act, 1872. Scan the QR code on Page 6 to verify.", M + 8, y + 7, { width: CW - 16 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 2 — FLIGHTS + HOTELS + TRANSPORT + INCLUDES / EXCLUDES
// ══════════════════════════════════════════════════════════════════════════════
function drawPage2(doc: any, o: AgreementPdfOptions) {
  let y = CONTENT_Y + 2;
  const cellH = 23;
  const g = 2;

  // ── Flight Details ────────────────────────────────────────────────────────
  y = secBar(doc, y, "FLIGHT DETAILS");

  const fH = 70;
  doc.rect(M, y, CW, fH).fill(GOLD_LITE).stroke(GOLD);
  // Flight grid
  const fCells = [
    ["AIRLINE", fmt(o.airline)], ["FLIGHT NO.", fmt(o.flightNumber)], ["PNR", fmt(o.flightPnr)],
    ["DEPARTURE AIRPORT", fmt(o.departureAirport)], ["TRANSIT", fmt(o.flightTransit)], ["DEPARTURE", fmt(o.flightDeparture)],
    ["ARRIVAL", fmt(o.flightArrival)], ["CHECKED BAGGAGE", fmt(o.baggageAllowance, "25 KG")], ["CABIN BAGGAGE", fmt(o.cabinBaggage, "As per airline")],
  ];
  const fc3 = (CW - 2 * 2) / 3;
  const fcH = 20;
  fCells.forEach(([lbl, val], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = M + col * (fc3 + 2);
    const cy = y + row * (fcH + 1);
    doc.fill("#7B4700").font("Helvetica").fontSize(6).text(lbl, cx + 5, cy + 4, { width: fc3 - 10 });
    doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(7.5).text(val, cx + 5, cy + 12, { width: fc3 - 10, ellipsis: true });
  });
  doc.fill("black");
  y += fH + 8;

  // ── Hotels ────────────────────────────────────────────────────────────────
  y = secBar(doc, y, "ACCOMMODATION DETAILS");

  const hColW = (CW - 3 * 2) / 4;
  const hH = 84;

  // Makkah
  doc.rect(M, y, hColW, hH).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("MAKKAH", M + 5, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(7.5).text(fmt(o.makkahHotel, "To be confirmed"), M + 5, y + 16, { width: hColW - 10 });
  if (o.makkahCategory) { doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Category: " + o.makkahCategory, M + 5, y + 32, { width: hColW - 10 }); }
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Dist. from Haram: " + fmt(o.makkahDistance, "~500m"), M + 5, y + 42, { width: hColW - 10 });
  if (o.makkahAddress) { doc.fill(GREY_MID).font("Helvetica").fontSize(6).text(o.makkahAddress, M + 5, y + 52, { width: hColW - 10 }); }
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-in: " + fmtDate(o.makkahCheckIn), M + 5, y + 63, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-out: " + fmtDate(o.makkahCheckOut), M + 5, y + 73, { width: hColW - 10 });
  doc.fill("black");

  // Madinah
  const hX2 = M + hColW + 2;
  doc.rect(hX2, y, hColW, hH).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("MADINAH", hX2 + 5, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(7.5).text(fmt(o.madinahHotel, "To be confirmed"), hX2 + 5, y + 16, { width: hColW - 10 });
  if (o.madinahCategory) { doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Category: " + o.madinahCategory, hX2 + 5, y + 32, { width: hColW - 10 }); }
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Dist. from Haram: " + fmt(o.madinahDistance, "—"), hX2 + 5, y + 42, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-in: " + fmtDate(o.madinahCheckIn), hX2 + 5, y + 63, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-out: " + fmtDate(o.madinahCheckOut), hX2 + 5, y + 73, { width: hColW - 10 });
  doc.fill("black");

  // Aziziyah
  const hX3 = hX2 + hColW + 2;
  doc.rect(hX3, y, hColW, hH).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("AZIZIYAH", hX3 + 5, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(7.5).text(fmt(o.aziziyahHotel, "To be confirmed"), hX3 + 5, y + 16, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Dist. from Haram: " + fmt(o.aziziyahDistance, "~5 km"), hX3 + 5, y + 42, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-in: " + fmtDate(o.aziziyahCheckIn), hX3 + 5, y + 63, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Check-out: " + fmtDate(o.aziziyahCheckOut), hX3 + 5, y + 73, { width: hColW - 10 });
  doc.fill("black");

  // Mina
  const hX4 = hX3 + hColW + 2;
  doc.rect(hX4, y, hColW, hH).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("MINA", hX4 + 5, y + 5);
  doc.fill(GREY_DARK).font("Helvetica-Bold").fontSize(7.5).text("Zone 5 (New Mina)", hX4 + 5, y + 16, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Tent Category: " + fmt(o.minaCategory, "Category D"), hX4 + 5, y + 32, { width: hColW - 10 });
  if (o.minaTentNumber) { doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Tent No.: " + o.minaTentNumber, hX4 + 5, y + 42, { width: hColW - 10 }); }
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Maktab No.: " + fmt(o.minaMaktabNumber || o.maktabNumber, "To Be Assigned"), hX4 + 5, y + 52, { width: hColW - 10 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Zone: " + fmt(o.minaZone, "Zone 5 (New Mina)"), hX4 + 5, y + 63, { width: hColW - 10 });
  doc.fill("black");

  y += hH + 4;

  // Room sharing note
  doc.rect(M, y, CW, 18).fill(GREY_LITE).stroke("#DDD");
  doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("ROOM SHARING:", M + 8, y + 5, { continued: true });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(`  ${fmt(o.roomSharing, "5-bed sharing standard")}  |  Upgrades available at extra charge  |  Subject to availability`, { continued: false });
  doc.fill("black");
  y += 22;

  // ── Transportation ────────────────────────────────────────────────────────
  y = secBar(doc, y, "TRANSPORTATION");

  const transCells = [
    ["Airport Transfer", fmt(o.airportTransfer, "Included — India & Saudi Arabia")],
    ["Bus Service", fmt(o.busService, "Group transport included")],
    ["Hajj Guide", fmt(o.guideService, "Certified bilingual guide")],
    ["Internal Hajj Transport", fmt(o.internalTransport, "Officially arranged by Hajj authorities")],
  ];
  const tW = (CW - 2) / 2;
  transCells.forEach(([lbl, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tx = M + col * (tW + 2);
    const ty = y + row * (cellH + 2);
    infoCell(doc, tx, ty, tW, cellH, lbl, val);
  });
  y += Math.ceil(transCells.length / 2) * (cellH + 2) + 6;

  // ── Package Includes ──────────────────────────────────────────────────────
  y = secBar(doc, y, "PACKAGE INCLUSIONS  ✓");

  const includes = [
    "Return Economy Air Ticket (India ↔ KSA)",
    "Hajj Visa Processing Assistance",
    "Airport Assistance (India & Saudi Arabia)",
    "Complete Accommodation (Makkah, Madinah, Aziziyah)",
    "10 Days Accommodation in Aziziyah (~5 km from Haram)",
    "5 Days Accommodation in Mina, Arafat & Muzdalifah",
    "Breakfast, Lunch, Dinner & Tea (where provided)",
    "Complete Hajj Guidance & Orientation Programme",
    "Experienced Tour Manager & Religious Guide",
    "Hajj Travel Kit, ID Card & Luggage Tag",
    "Emergency Assistance (24/7)",
    "Internal Hajj Transportation (officially arranged)",
  ];
  const incHalf = (CW - 6) / 2;
  let leftY = y;
  includes.forEach((item, i) => {
    const col = i % 2;
    if (col === 0) leftY = y + Math.floor(i / 2) * 12;
    checkItem(doc, M + col * (incHalf + 6), leftY, incHalf, item, true);
  });
  y += Math.ceil(includes.length / 2) * 12 + 6;

  // ── Package Excludes ──────────────────────────────────────────────────────
  y = secBar(doc, y, "PACKAGE EXCLUSIONS  ✗");

  const excludes = [
    "Transportation between Aziziyah and Masjid Al Haram",
    "Transportation for Tawaf-e-Ziyarat",
    "Laundry & Personal Services",
    "Medical Expenses & Personal Shopping",
    "International Calls & Data",
    "Travel Insurance (unless specified)",
    "Extra Meals beyond plan",
    "Extra Baggage Charges",
    "Room Upgrades (unless paid)",
    "Any service not specifically mentioned",
  ];
  let excY = y;
  excludes.forEach((item, i) => {
    const col = i % 2;
    if (col === 0) excY = y + Math.floor(i / 2) * 12;
    checkItem(doc, M + col * (incHalf + 6), excY, incHalf, item, false);
  });
  y += Math.ceil(excludes.length / 2) * 12 + 6;

  // Accommodation policy note
  doc.rect(M, y, CW, 42).fill(GREY_LITE).stroke("#DDD");
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("ACCOMMODATION POLICY", M + 8, y + 5);
  doc.fill(GREY_DARK).font("Helvetica").fontSize(6.8)
    .text("• Aziziyah accommodation approximately 5 km from Haram. Mina accommodation in New Mina Zone, Maktab as allocated.\n" +
      "• Standard accommodation on 5-bed sharing. 3-sharing, 2-sharing or single room requires additional charges.\n" +
      "• Hotels may be changed to equivalent/higher category due to Saudi Government allocation. No room changes after allocation.",
      M + 8, y + 17, { width: CW - 16, lineGap: 1 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 3 — LEGAL TERMS & CONDITIONS
// ══════════════════════════════════════════════════════════════════════════════
function drawPage3(doc: any, o: AgreementPdfOptions) {
  let y = CONTENT_Y + 2;

  y = secBar(doc, y, "LEGAL TERMS & CONDITIONS — ALL CLAUSES");

  const clauseW = (CW - 6) / 2;
  let leftY = y;
  let rightY = y;

  HAJJ_AGREEMENT_CLAUSES.forEach((clause, i) => {
    const isLeft = i % 2 === 0;
    const cx = isLeft ? M : M + clauseW + 6;
    const cy = isLeft ? leftY : rightY;

    doc.rect(cx, cy, clauseW, 14).fill(isLeft ? DG : "#1A4D35");
    doc.fill("white").font("Helvetica-Bold").fontSize(7).text(clause.title, cx + 5, cy + 4, { width: clauseW - 10 });
    doc.fill("black");

    doc.fill(GREY_DARK).font("Helvetica").fontSize(6.5)
      .text(clause.body, cx + 4, cy + 16, { width: clauseW - 8, lineGap: 0.8 });

    const endY = doc.y + 5;
    if (isLeft) {
      leftY = endY;
    } else {
      rightY = endY;
      leftY = Math.max(leftY, rightY);
      rightY = leftY;
    }
  });

  y = Math.max(leftY, rightY) + 6;
  y = goldLine(doc, y);

  // ── Customer Declaration ──────────────────────────────────────────────────
  y = secBar(doc, y, "CUSTOMER DECLARATION — MANDATORY");

  const declarations = [
    "I have read, fully understood, and voluntarily accept all 13 clauses of this Agreement as set out above.",
    "All personal, medical, and travel information provided to Al Burhan Tours & Travels is true, accurate, complete, and not misleading.",
    "I am physically, medically, and legally competent to undertake the Hajj journey and to enter into this legally binding contract.",
    "I understand and accept the cancellation and refund policy as detailed in this Agreement and in the Payment Policy section.",
    "I accept full responsibility for my conduct during the journey and for compliance with all Saudi Arabian and Indian laws and regulations.",
    "I accept that my digital signature constitutes a legally valid signature under Section 5 of the Information Technology Act, 2000.",
    "I confirm that my mobile number was verified via OTP immediately prior to signing — constituting valid electronic authentication.",
  ];

  declarations.forEach((decl, i) => {
    const isAccepted = !!o.signedAt;
    doc.rect(M + 3, y, 10, 10).fill(isAccepted ? DG : "#E0E0E0").stroke("#999");
    if (isAccepted) { doc.fill("white").font("Helvetica-Bold").fontSize(7).text("✓", M + 4, y + 1); }
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(`(${i + 1}) ${decl}`, M + 16, y + 1, { width: CW - 16, lineGap: 0.5 });
    y = doc.y + 6;
    doc.fill("black");
  });
  y += 4;

  doc.rect(M, y, CW, 28).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5)
    .text("By executing this Agreement digitally (OTP + digital signature), the Customer/Pilgrim confirms acceptance of all 13 clauses above. This digital execution is valid and enforceable under the Information Technology Act, 2000 and the Indian Contract Act, 1872.", M + 8, y + 8, { width: CW - 16, lineGap: 1 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 4 — PAYMENT POLICY + REFUND TABLE + MEDICAL + VISA DECLARATION
// ══════════════════════════════════════════════════════════════════════════════
function drawPage4(doc: any, o: AgreementPdfOptions) {
  let y = CONTENT_Y + 2;

  // ── Payment Policy ────────────────────────────────────────────────────────
  y = secBar(doc, y, "PAYMENT POLICY & SCHEDULE");

  const payColW = [CW * 0.44, CW * 0.28, CW * 0.28];
  y = tableRow(doc, y, ["Payment Stage", "Amount / %", "Due Date"], payColW, true);
  [
    ["Booking Confirmation (Registration)", "50% of package amount", "At time of booking"],
    ["Final Payment", "Balance 50%", "50 days before departure"],
    ["Visa Fee (GOI rates, non-refundable)", "Actuals as communicated", "On demand"],
  ].forEach(([a, b, c], i) => {
    y = tableRow(doc, y, [a, b, c], payColW, false, i % 2 === 0);
  });
  y += 6;

  doc.rect(M, y, CW, 40).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7.5).text("IMPORTANT PAYMENT CONDITIONS", M + 8, y + 5);
  doc.fill("#7B4700").font("Helvetica").fontSize(7)
    .text(
      "• Hajj visa processing will NOT begin until full package payment is received.\n" +
      "• Air tickets will NOT be issued until full payment is received.\n" +
      "• Official receipt mandatory for every payment. Payments to unauthorized persons will not be recognized.\n" +
      "• Accepted modes: Razorpay (online), NEFT/IMPS (bank transfer), Cash (with official receipt only).",
      M + 8, y + 17, { width: CW - 16, lineGap: 1 });
  doc.fill("black");
  y += 46;

  // ── Refund Policy ─────────────────────────────────────────────────────────
  y = secBar(doc, y, "CANCELLATION & REFUND POLICY");

  const canColW = [CW * 0.34, CW * 0.20, CW * 0.20, CW * 0.26];
  y = tableRow(doc, y, ["Cancellation Period", "Deduction", "Refund", "Notes"], canColW, true);
  [
    ["More than 90 days before departure", "10%",  "90%", "Admin charges apply"],
    ["60 to 89 days before departure",     "25%",  "75%", "Non-refundable fees extra"],
    ["30 to 59 days before departure",     "50%",  "50%", "Airline charges extra"],
    ["15 to 29 days before departure",     "75%",  "25%", "Hotel charges extra"],
    ["Less than 15 days / After departure","100%", "NIL", "No refund applicable"],
    ["No Show",                            "100%", "NIL", "No refund applicable"],
    ["Visa Rejection (Saudi Authority)",   "Visa cost", "Balance less charges", "Processing fees retained"],
    ["Govt. Cancellation / Force Majeure", "Recoverable only", "Subject to recovery", "Best effort basis"],
    ["Airline Cancellation",               "Airline policy", "Per airline T&C", "Agency assists recovery"],
    ["Customer Health Emergency",          "Case by case", "Partial at discretion", "Documentation required"],
  ].forEach(([a, b, c, d], i) => {
    y = tableRow(doc, y, [a, b, c, d], canColW, false, i % 2 === 0);
  });
  y += 5;

  doc.rect(M, y, CW, 30).fill("#FFF3CD").stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7).text("DEDUCTIONS MAY INCLUDE:", M + 8, y + 5);
  doc.fill("#7B4700").font("Helvetica").fontSize(7)
    .text("GST & TCS (non-recoverable)  •  Visa processing fees  •  Airline cancellation charges  •  Hotel retention fees  •  Government levies  •  Administrative charges. " +
      "All refunds processed within 30 working days via original payment method. Written cancellation mandatory (email/letter).", M + 8, y + 15, { width: CW - 16 });
  doc.fill("black");
  y += 36;

  // ── Medical Declaration ────────────────────────────────────────────────────
  y = secBar(doc, y, "MEDICAL DECLARATION");

  const medDecls = [
    "I declare that I am physically fit and able to undertake all Hajj rites, including extensive walking (average 15–20 km per day during Hajj days).",
    "I have disclosed all existing medical conditions, chronic illnesses, and disabilities to Al Burhan Tours & Travels at the time of booking.",
    "I carry all required personal medications and understand that medical expenses during the journey are my personal responsibility.",
    "I have completed all mandatory vaccinations as required by Saudi Arabian authorities (ACWY Meningococcal, COVID-19 booster, and any other notified vaccines).",
    "I have obtained and carry my International Vaccination Certificate (Yellow Booklet) and will present it to Saudi authorities on demand.",
    "I understand that pilgrims above 65 years of age or with serious health conditions may require a medical fitness certificate from a registered physician.",
  ];
  medDecls.forEach((decl, i) => {
    const isAccepted = !!o.signedAt;
    doc.rect(M + 3, y, 9, 9).fill(isAccepted ? DG : "#E0E0E0").stroke("#999");
    if (isAccepted) { doc.fill("white").font("Helvetica-Bold").fontSize(6).text("✓", M + 4, y + 1); }
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(decl, M + 16, y + 1, { width: CW - 16, lineGap: 0.5 });
    y = doc.y + 5;
    doc.fill("black");
  });
  y += 4;

  // ── Visa Declaration ───────────────────────────────────────────────────────
  y = secBar(doc, y, "VISA & PASSPORT DECLARATION");

  const visaDecls = [
    "My passport is valid for at least 6 months beyond the return date of this Hajj package and is in good condition (no tears or damage).",
    "All documents submitted for Hajj visa and registration are genuine, accurate, and complete. I accept full legal responsibility for any false documents.",
    "I understand that Saudi Hajj visa issuance is solely at the discretion of Saudi authorities. Al Burhan Tours & Travels cannot guarantee visa approval.",
    "I will cooperate fully with visa processing requirements including biometrics, interviews, and any additional documentation as requested.",
  ];
  visaDecls.forEach((decl, i) => {
    const isAccepted = !!o.signedAt;
    doc.rect(M + 3, y, 9, 9).fill(isAccepted ? DG : "#E0E0E0").stroke("#999");
    if (isAccepted) { doc.fill("white").font("Helvetica-Bold").fontSize(6).text("✓", M + 4, y + 1); }
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(decl, M + 16, y + 1, { width: CW - 16, lineGap: 0.5 });
    y = doc.y + 5;
    doc.fill("black");
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 5 — DIGITAL CONSENT + OTP + SIGNATURE + AUDIT TRAIL
// ══════════════════════════════════════════════════════════════════════════════
function drawPage5(doc: any, o: AgreementPdfOptions, qrBuf: Buffer | null) {
  let y = CONTENT_Y + 2;

  // ── Digital Consent ───────────────────────────────────────────────────────
  y = secBar(doc, y, "DIGITAL CONSENT — INDIVIDUAL ACCEPTANCE REQUIRED");

  CONSENT_CATEGORIES.forEach((cat) => {
    const isAccepted = o.termsAccepted ? !!o.termsAccepted[cat.id] : (!!o.signedAt);
    doc.rect(M, y, CW, 26).fill(isAccepted ? LG : (o.signedAt ? RED_SOFT : GREY_LITE)).stroke(isAccepted ? DG : "#CCC");
    doc.rect(M, y, 9, 9).fill(isAccepted ? DG : "#DDD").stroke("#999");
    if (isAccepted) { doc.fill("white").font("Helvetica-Bold").fontSize(6).text("✓", M + 1, y + 1); }
    doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text(cat.title, M + 13, y + 1, { width: CW - 13 });
    doc.fill(GREY_DARK).font("Helvetica").fontSize(6.5).text(cat.body, M + 13, y + 12, { width: CW - 13, lineGap: 0.3 });
    doc.fill("black");
    y += 30;
  });
  y += 4;

  // ── Consent Metadata ─────────────────────────────────────────────────────
  if (o.signedAt) {
    doc.rect(M, y, CW, 22).fill(GREY_LITE).stroke("#DDD");
    doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("CONSENT RECORDED AT:", M + 8, y + 5);
    const meta = [
      `Date & Time: ${o.signedAt.toLocaleString("en-IN")}`,
      `IP Address: ${fmt(o.signedIp)}`,
      `Browser: ${fmt(o.signingBrowser || (o.userAgent || "").substring(0, 40))}`,
      `Device: ${fmt(o.signingDevice)}`,
      `OS: ${fmt(o.signingOS)}`,
      `GPS: ${fmt(o.signingGPS, "Not captured")}`,
    ].join("  |  ");
    doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text(meta, M + 8, y + 14, { width: CW - 16, ellipsis: true });
    doc.fill("black");
    y += 26;
  }

  // ── OTP Verification ─────────────────────────────────────────────────────
  y = secBar(doc, y, "OTP MOBILE VERIFICATION");

  const otpOk = o.otpVerified;
  doc.rect(M, y, CW, 30).fill(otpOk ? LG : RED_SOFT).stroke(otpOk ? DG : "#CC0000");
  doc.fill(otpOk ? DG : "#CC0000").font("Helvetica-Bold").fontSize(11)
    .text(otpOk ? "✓  OTP MOBILE VERIFICATION CONFIRMED" : "✗  OTP MOBILE VERIFICATION PENDING", M + 10, y + 5, { width: CW - 20 });
  doc.fill(GREY_MID).font("Helvetica").fontSize(7.5)
    .text(`Mobile: ${o.customerMobile}  |  Verified at: ${o.otpVerifiedAt ? o.otpVerifiedAt.toLocaleString("en-IN") : "—"}  |  Method: SMS OTP (6-digit)`, M + 10, y + 19, { width: CW - 20 });
  doc.fill("black");
  y += 36;

  // ── Digital Signatures ────────────────────────────────────────────────────
  y = secBar(doc, y, "DIGITAL SIGNATURES & EXECUTION");

  if (o.signedAt && o.signatureData) {
    const panH = 100;
    // Customer signature
    doc.rect(M, y, COL_HALF, panH).fill("#FAFFFE").stroke(DG);
    doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("CUSTOMER / PILGRIM SIGNATURE", M + 8, y + 6);
    try {
      const sigBuf = Buffer.from(o.signatureData.replace(/^data:image\/\w+;base64,/, ""), "base64");
      doc.image(sigBuf, M + 8, y + 20, { width: COL_HALF - 18, height: 50, fit: [COL_HALF - 18, 50] });
    } catch {}
    doc.fill(DG).font("Helvetica-Bold").fontSize(7).text(fmt(o.customerName), M + 8, y + 76);
    doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text(o.signedAt.toLocaleString("en-IN"), M + 8, y + 88);
    doc.fill("black");

    // Agency seal
    const col2X = M + COL_HALF + 8;
    doc.rect(col2X, y, COL_HALF, panH).fill(GOLD_LITE).stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7.5).text("AGENCY AUTHORISATION & SEAL", col2X + 8, y + 6);
    doc.circle(col2X + COL_HALF / 2, y + 54, 28).fill("#E8D8A0").stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(6)
      .text("AL BURHAN\nTOURS & TRAVELS\nOFFICIAL SEAL", col2X + COL_HALF / 2 - 26, y + 43, { width: 52, align: "center" });
    doc.fill("#7B4700").font("Helvetica").fontSize(6.5).text("Authorised Signatory", col2X + 8, y + 86);
    doc.fill(GREY_MID).font("Helvetica").fontSize(6.5).text("Al Burhan Tours & Travels, Burhanpur M.P.", col2X + 8, y + 95);
    doc.fill("black");
    y += panH + 8;
  } else {
    doc.rect(M, y, CW, 50).fill(GOLD_LITE).stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Bold").fontSize(10).text("⏳  AWAITING DIGITAL SIGNATURE", M + 10, y + 10, { width: CW - 20 });
    doc.fill("#7B4700").font("Helvetica-Oblique").fontSize(8)
      .text("This agreement has been sent to the customer for digital signing. Signature and audit details will appear here once executed.", M + 10, y + 28, { width: CW - 20 });
    doc.fill("black");
    y += 58;
  }

  // ── Legal Audit Trail ─────────────────────────────────────────────────────
  y = secBar(doc, y, "LEGAL AUDIT TRAIL");

  const auditColW = [CW * 0.27, CW * 0.43, CW * 0.30];
  y = tableRow(doc, y, ["Event", "Details", "Timestamp"], auditColW, true);

  const auditRows: [string, string, string][] = [
    ["Agreement Generated", o.agreementNumber, fmtDate(o.agreementDate)],
    ["OTP Requested", `Mobile: ${o.customerMobile}`, o.otpVerifiedAt ? fmtDate(o.otpVerifiedAt) : "—"],
    ["OTP Verified", o.otpVerified ? "✓ Mobile ownership confirmed via SMS OTP" : "Pending verification", o.otpVerifiedAt ? o.otpVerifiedAt.toLocaleString("en-IN") : "—"],
  ];

  if (o.signedAt) {
    auditRows.push(
      ["Agreement Signed", `IP: ${fmt(o.signedIp)} | 9 consent categories accepted`, o.signedAt.toLocaleString("en-IN")],
      ["PDF Generated", `Agreement-${o.agreementNumber}.pdf`, o.signedAt.toLocaleString("en-IN")],
    );
    if (o.digitalHash) {
      auditRows.push(["SHA-256 Hash", o.digitalHash.substring(0, 50) + "…", "—"]);
    }
  }

  // Add any additional audit entries passed in
  if (o.auditActions) {
    o.auditActions.slice(0, 3).forEach(a => {
      auditRows.push([a.action.replace(/_/g, " ").toUpperCase(), JSON.stringify(a.details).substring(0, 50), fmtDate(a.created_at)]);
    });
  }

  auditRows.forEach(([ev, det, ts], i) => {
    y = tableRow(doc, y, [ev, det, ts], auditColW, false, i % 2 === 0);
  });
  y += 8;

  // Force Majeure note
  doc.rect(M, y, CW, 44).fill(GREY_LITE).stroke("#DDD");
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("FORCE MAJEURE NOTICE", M + 8, y + 5);
  doc.fill(GREY_DARK).font("Helvetica").fontSize(6.8)
    .text("Al Burhan Tours & Travels shall not be liable for delays or losses arising from: War • Pandemic or Epidemic • Natural Disaster • Flood • Earthquake • Political Disturbance • Civil Unrest • Government Restrictions • Saudi Ministry Decisions • Visa Suspension • Airport Closure • Airline Bankruptcy or Cancellation • Flight Delay • Missed Connection • Air Traffic Restrictions • Technical Problems • Weather • Lockdowns • Immigration or Customs Delays. " +
      "The company will provide reasonable assistance wherever possible but accepts no liability for circumstances beyond its control.",
      M + 8, y + 16, { width: CW - 16, lineGap: 0.8 });
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 6 — BAGGAGE + AIRLINE DISCLAIMER + COMPANY ASSISTANCE + DIGITAL EXECUTION
// ══════════════════════════════════════════════════════════════════════════════
function drawPage6(doc: any, o: AgreementPdfOptions, qrBuf: Buffer | null) {
  let y = CONTENT_Y + 2;

  // ── Baggage Policy ────────────────────────────────────────────────────────
  y = secBar(doc, y, "BAGGAGE POLICY");

  const bagLeft = COL_HALF;
  const bagRight = CW - COL_HALF - 8;

  doc.rect(M, y, bagLeft, 82).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5).text("STANDARD ALLOWANCE", M + 8, y + 6);
  y = bullet(doc, M + 8, y + 18, bagLeft - 16, "Checked Baggage: Up to 25 KG per airline policy", DG);
  y = bullet(doc, M + 8, y, bagLeft - 16, "Zamzam Water: 5 Litres (if permitted by airline & Saudi regulations)", DG);
  y = bullet(doc, M + 8, y, bagLeft - 16, "Cabin Baggage: As per airline policy (typically 7 KG)", DG);
  y = bullet(doc, M + 8, y, bagLeft - 16, "Airlines: Air India • Akasa Air • IndiGo • Saudi Airlines • Flynas • Flyadeal • Oman Air • Gulf Air • Air Arabia", DG);
  const bagRightX = M + bagLeft + 8;
  let bagRY = CONTENT_Y + 2 + 24;
  doc.rect(bagRightX, bagRY, bagRight, 82).fill(GOLD_LITE).stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(7.5).text("BAGGAGE DISCLAIMER", bagRightX + 8, bagRY + 6);
  bagRY += 18;
  const bagDisc = ["Lost, delayed, damaged or missing baggage", "Excess baggage charges", "Customs or security confiscation", "Theft or airline mishandling", "Any baggage handling issues"];
  bagDisc.forEach(item => {
    doc.fill("#CC0000").font("Helvetica-Bold").fontSize(7).text("✗", bagRightX + 8, bagRY, { width: 10 });
    doc.fill("#7B4700").font("Helvetica").fontSize(7).text(item, bagRightX + 20, bagRY, { width: bagRight - 28 });
    bagRY += 12;
  });
  doc.fill("black");
  y = Math.max(y, bagRY) + 6;

  // Carry-in note
  doc.rect(M, y, CW, 18).fill(GREY_LITE).stroke("#DDD");
  doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("IMPORTANT:", M + 8, y + 5, { continued: true });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7)
    .text("  Carry passport, cash, jewellery, medicines, mobile, electronics, and important documents in CABIN BAGGAGE.", { continued: false });
  doc.fill("black");
  y += 22;

  // ── Airline Disclaimer ─────────────────────────────────────────────────────
  y = secBar(doc, y, "AIRLINE DISCLAIMER");

  doc.rect(M, y, CW, 76).fill(GREY_LITE).stroke("#DDD");
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5)
    .text("Flights are operated by the respective airlines. Al Burhan Tours & Travels acts solely as a travel organizer and is NOT responsible for:", M + 10, y + 8, { width: CW - 20 });
  const airDisc = [
    ["Flight Delay or Cancellation", "Flight Diversion or Re-routing"],
    ["Missed Connections", "Seat Changes or Downgrades"],
    ["Schedule Changes", "Boarding Denial"],
    ["Airport Congestion", "Immigration or Customs Delays"],
    ["Airline Operational Decisions", "Technical or Weather-Related Issues"],
  ];
  let ady = y + 22;
  airDisc.forEach(([a, b]) => {
    doc.fill("#CC0000").font("Helvetica-Bold").fontSize(7).text("✗", M + 10, ady, { width: 10 });
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(a, M + 22, ady, { width: COL_HALF - 22 });
    doc.fill("#CC0000").font("Helvetica-Bold").fontSize(7).text("✗", M + COL_HALF + 20, ady, { width: 10 });
    doc.fill(GREY_DARK).font("Helvetica").fontSize(7).text(b, M + COL_HALF + 32, ady, { width: COL_HALF - 22 });
    ady += 11;
  });
  doc.fill("black");
  y += 82;

  // ── Company Assistance ────────────────────────────────────────────────────
  y = secBar(doc, y, "COMPANY ASSISTANCE COMMITMENT");

  doc.rect(M, y, CW, 58).fill(LG).stroke(DG);
  doc.fill(DG).font("Helvetica-Bold").fontSize(7.5)
    .text("Al Burhan Tours & Travels will make every reasonable effort to assist pilgrims with:", M + 10, y + 6, { width: CW - 20 });
  const assist = [
    ["Airline Coordination & Communication", "Lost Baggage Reporting Assistance"],
    ["Flight Rescheduling Assistance", "Hotel Coordination During Disruptions"],
    ["Medical Referral to Local Facilities", "Emergency Assistance (24/7 during journey)"],
    ["Communication with Airlines & Authorities", "Guidance During Unexpected Situations"],
  ];
  let asY = y + 18;
  assist.forEach(([a, b]) => {
    doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("✓", M + 10, asY, { width: 10 });
    doc.fill(DG).font("Helvetica").fontSize(7).text(a, M + 22, asY, { width: COL_HALF - 22 });
    doc.fill(DG).font("Helvetica-Bold").fontSize(7).text("✓", M + COL_HALF + 20, asY, { width: 10 });
    doc.fill(DG).font("Helvetica").fontSize(7).text(b, M + COL_HALF + 32, asY, { width: COL_HALF - 22 });
    asY += 11;
  });
  doc.fill(GREY_MID).font("Helvetica-Oblique").fontSize(6.5)
    .text("This assistance does not create liability for matters beyond the company's control.", M + 10, asY, { width: CW - 20 });
  doc.fill("black");
  y += 64;

  // ── Digital Execution ─────────────────────────────────────────────────────
  y = secBar(doc, y, "DIGITAL EXECUTION & VERIFICATION");

  const execH = 80;
  doc.rect(M, y, CW, execH).fill(GOLD_LITE).stroke(GOLD);

  // QR code
  if (qrBuf) {
    const qrSize = 70;
    try { doc.image(qrBuf, M + CW - qrSize - 4, y + 4, { width: qrSize, height: qrSize }); } catch {}
  }

  const execW = CW - 82;
  doc.fill(DG).font("Helvetica-Bold").fontSize(10).text("SCAN TO VERIFY THIS AGREEMENT", M + 10, y + 6, { width: execW });
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5)
    .text(`Agreement: ${o.agreementNumber}`, M + 10, y + 22);
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5)
    .text(`Booking: ${o.bookingNumber}  |  Status: ${(o.status || "PENDING").toUpperCase().replace(/_/g, " ")}`, M + 10, y + 34);
  doc.fill(GREY_DARK).font("Helvetica").fontSize(7.5)
    .text(`Customer: ${o.customerName}`, M + 10, y + 46);
  if (o.digitalHash) {
    doc.fill(GREY_MID).font("Helvetica").fontSize(6).text(`SHA-256: ${o.digitalHash.substring(0, 48)}…`, M + 10, y + 58, { width: execW });
  }
  doc.fill(GREY_MID).font("Helvetica").fontSize(6.5)
    .text(`URL: ${o.verificationUrl || "—"}`, M + 10, y + 70, { width: execW, ellipsis: true });
  doc.fill("black");
  y += execH + 8;

  // ── Legal footer statement ────────────────────────────────────────────────
  doc.rect(M, y, CW, 2).fill(GOLD); y += 5;
  doc.fill(GREY_MID).font("Helvetica-Oblique").fontSize(6.5)
    .text(
      "This document constitutes a legally binding agreement executed by digital/electronic signature under Section 5 read with Schedule I of the Information Technology Act, 2000 (India), and the Indian Contract Act, 1872. " +
      "The digital signature is as valid and enforceable as a wet-ink signature. Any unauthorised alteration of this document is an offence under applicable law. " +
      "Generated by Al Burhan Tours & Travels automated agreement system — Revision " + (o.digitalHash ? `${o.digitalHash.substring(0, 8)}` : "1"),
      M, y, { width: CW, lineGap: 1.5 }
    );
  doc.fill("black");
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — 6-PAGE PREMIUM AGREEMENT
// ══════════════════════════════════════════════════════════════════════════════
export async function generateAgreementPdfBuffer(opts: AgreementPdfOptions): Promise<Buffer> {
  let qrBuf: Buffer | null = null;
  if (opts.verificationUrl) {
    try { qrBuf = await QRCode.toBuffer(opts.verificationUrl, { width: 130, margin: 1 }); } catch {}
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });

  // Page 1
  drawHeader(doc, "PREMIUM DIGITAL HAJJ AGREEMENT", opts.agreementNumber, opts.bookingNumber);
  drawPage1(doc, opts, qrBuf);
  drawFooter(doc, 1, 6);

  // Page 2
  doc.addPage();
  drawHeader(doc, "FLIGHTS, HOTELS, TRANSPORT & PACKAGE SERVICES", opts.agreementNumber, opts.bookingNumber);
  drawPage2(doc, opts);
  drawFooter(doc, 2, 6);

  // Page 3
  doc.addPage();
  drawHeader(doc, "LEGAL TERMS & CONDITIONS", opts.agreementNumber, opts.bookingNumber);
  drawPage3(doc, opts);
  drawFooter(doc, 3, 6);

  // Page 4
  doc.addPage();
  drawHeader(doc, "PAYMENT POLICY, REFUND SCHEDULE & DECLARATIONS", opts.agreementNumber, opts.bookingNumber);
  drawPage4(doc, opts);
  drawFooter(doc, 4, 6);

  // Page 5
  doc.addPage();
  drawHeader(doc, "DIGITAL CONSENT, OTP VERIFICATION & SIGNATURES", opts.agreementNumber, opts.bookingNumber);
  drawPage5(doc, opts, qrBuf);
  drawFooter(doc, 5, 6);

  // Page 6
  doc.addPage();
  drawHeader(doc, "BAGGAGE POLICY, AIRLINE DISCLAIMER & DIGITAL EXECUTION", opts.agreementNumber, opts.bookingNumber);
  drawPage6(doc, opts, qrBuf);
  drawFooter(doc, 6, 6);

  return pdfToBuffer(doc);
}
