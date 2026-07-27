// @ts-nocheck
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { LOGO_BASE64 } from "./logoData.js";

const LOGO_BUF  = Buffer.from(LOGO_BASE64, "base64");
const DG        = "#0B3D2E";
const GOLD      = "#C9A23F";
const LG        = "#EBF5EB";
const M         = 36;
const W         = 595;
const H         = 842;
const CW        = W - M * 2;
const HDR_H     = 92;

function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
function fmt(v: any, fallback = "—"): string {
  return (v == null || v === "") ? fallback : String(v);
}
function fmtDate(v: any, fallback = "—"): string {
  if (!v) return fallback;
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return fallback; }
}
function stars(n: number | null | undefined): string {
  const s = Number(n || 0);
  return s > 0 ? "★".repeat(Math.min(s, 5)) : "—";
}

function drawHeader(doc: any, voucherNum: string) {
  doc.rect(0, 0, W, HDR_H).fill(DG);
  doc.rect(0, HDR_H - 4, W, 4).fill(GOLD);
  try { doc.image(LOGO_BUF, M, 10, { width: 66 }); } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(15).text("AL BURHAN TOURS & TRAVELS", M + 74, 12, { width: CW - 74 });
  doc.fill("#FFFFFF").font("Helvetica").fontSize(9)
    .text("Hajj & Umrah Travel Services", M + 74, 30, { width: CW - 74 })
    .text("www.alburhantravels.com  |  admin@alburhantravels.com", M + 74, 41, { width: CW - 74 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(18)
    .text("HOTEL ACCOMMODATION VOUCHER", 0, 58, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(8)
    .text(`Voucher No: ${voucherNum}`, M, 78, { width: CW });
}

function drawFooter(doc: any) {
  const y = H - 36;
  doc.rect(0, y, W, 36).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(8)
    .text("AL BURHAN TOURS & TRAVELS  |  Hajj & Umrah Specialists  |  www.alburhantravels.com", 0, y + 8, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(7)
    .text("This voucher is computer generated. Present this at hotel reception for check-in.", 0, y + 20, { width: W, align: "center" });
}

function sectionLabel(doc: any, y: number, label: string) {
  doc.rect(M, y, CW, 20).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(9).text(label, M + 8, y + 5, { width: CW - 16 });
  return y + 20;
}

function row(doc: any, x: number, y: number, label: string, value: string, w: number = 240) {
  doc.fill("#555555").font("Helvetica").fontSize(8.5).text(label, x, y, { width: 110 });
  doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(8.5).text(value, x + 115, y, { width: w });
}

export interface HotelVoucherData {
  pilgrimName: string;
  bookingNumber: string;
  bookingId: string;
  customerId?: string | null;
  hotelName: string;
  hotelCity: string;
  hotelAddress?: string | null;
  hotelStars?: number | null;
  hotelPhone?: string | null;
  roomNumber: string;
  floorNumber?: string | null;
  bedType?: string | null;
  roomCapacity?: number | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  groupName?: string | null;
  maktabNumber?: string | null;
  voucherId: string;
  issuedAt?: Date;
}

export async function generateHotelVoucherPdf(data: HotelVoucherData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });

  const qrUrl = `https://alburhantravels.com/verify/hotel/${data.voucherId}`;
  const qrData = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: "#0B3D2E", light: "#ffffff" } });
  const qrBuf  = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ""), "base64");

  drawHeader(doc, `HV-${data.bookingNumber}-${data.voucherId.slice(-6).toUpperCase()}`);
  drawFooter(doc);

  let y = HDR_H + 16;

  // ── QR + Voucher Status banner ───────────────────────────────────────────
  doc.rect(M, y, CW, 90).fillAndStroke(LG, "#AACFAA");
  try { doc.image(qrBuf, W - M - 100, y + 6, { width: 80 }); } catch {}
  doc.fill(DG).font("Helvetica-Bold").fontSize(22).text("ACCOMMODATION CONFIRMED", M + 10, y + 8, { width: CW - 120 });
  doc.fill("#2E7D5A").font("Helvetica-Bold").fontSize(10).text("✓ Hotel booking verified and confirmed for the below guest", M + 10, y + 36, { width: CW - 120 });
  doc.fill("#555555").font("Helvetica").fontSize(8).text(`Issued: ${(data.issuedAt || new Date()).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}`, M + 10, y + 54, { width: CW - 120 });
  doc.fill("#555555").font("Helvetica").fontSize(8).text(`Booking Ref: ${data.bookingNumber}`, M + 10, y + 66, { width: CW - 120 });
  y += 100;

  // ── Guest Details ─────────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "GUEST INFORMATION");
  y += 10;
  const col1x = M + 10, col2x = M + CW / 2 + 10;
  row(doc, col1x, y,      "Guest Name:",    fmt(data.pilgrimName));
  row(doc, col2x, y,      "Booking Ref:",   fmt(data.bookingNumber));
  y += 16;
  row(doc, col1x, y,      "Group:",         fmt(data.groupName));
  row(doc, col2x, y,      "Maktab:",        fmt(data.maktabNumber));
  y += 24;

  // ── Hotel Details ─────────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "HOTEL DETAILS");
  y += 10;
  doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(14)
    .text(fmt(data.hotelName), M + 10, y, { width: CW - 20 });
  y += 18;
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(10).text(stars(data.hotelStars), M + 10, y);
  y += 14;
  row(doc, col1x, y, "City:",        fmt(data.hotelCity));
  row(doc, col2x, y, "Phone:",       fmt(data.hotelPhone));
  y += 14;
  if (data.hotelAddress) {
    doc.fill("#555555").font("Helvetica").fontSize(8).text("Address:", M + 10, y, { width: 110 });
    doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(8).text(data.hotelAddress, M + 125, y, { width: CW - 135 });
    y += 14;
  }
  y += 10;

  // ── Room Details ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "ROOM ALLOCATION");
  y += 10;
  // Big room number box
  doc.rect(M + 10, y, 90, 50).fillAndStroke(DG, DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(9).text("ROOM", M + 10, y + 6, { width: 90, align: "center" });
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(24).text(fmt(data.roomNumber), M + 10, y + 18, { width: 90, align: "center" });

  const rx = M + 115;
  row(doc, rx, y,      "Floor:",       fmt(data.floorNumber));
  y += 14;
  row(doc, rx, y,      "Bed Type:",    fmt(data.bedType));
  y += 14;
  row(doc, rx, y,      "Capacity:",    data.roomCapacity ? `${data.roomCapacity} persons` : "—");
  y += 40;

  // ── Stay Dates ────────────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "STAY PERIOD");
  y += 10;

  const boxW = (CW - 30) / 2;
  // Check-In box
  doc.rect(M + 10, y, boxW, 44).fillAndStroke(LG, "#AACFAA");
  doc.fill(DG).font("Helvetica-Bold").fontSize(8).text("CHECK-IN DATE", M + 10, y + 6, { width: boxW, align: "center" });
  doc.fill(DG).font("Helvetica-Bold").fontSize(13).text(fmtDate(data.checkInDate), M + 10, y + 20, { width: boxW, align: "center" });

  // Check-Out box
  doc.rect(M + 20 + boxW, y, boxW, 44).fillAndStroke("#FFF8E7", "#D4A843");
  doc.fill("#7A5C00").font("Helvetica-Bold").fontSize(8).text("CHECK-OUT DATE", M + 20 + boxW, y + 6, { width: boxW, align: "center" });
  doc.fill("#7A5C00").font("Helvetica-Bold").fontSize(13).text(fmtDate(data.checkOutDate), M + 20 + boxW, y + 20, { width: boxW, align: "center" });
  y += 58;

  // ── Instructions ──────────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "IMPORTANT INSTRUCTIONS");
  y += 10;
  const instructions = [
    "Present this voucher and your passport at hotel reception during check-in.",
    "Check-in time is typically after 12:00 PM. Check-out is by 12:00 PM.",
    "Keep your room key safe. Lost keys may incur replacement charges.",
    "Meals (if included) will be served as per your package schedule.",
    "Contact Al Burhan Tours & Travels guide for any hotel-related assistance.",
  ];
  instructions.forEach((line, i) => {
    doc.fill("#1A1A1A").font("Helvetica").fontSize(8)
      .text(`${i + 1}. ${line}`, M + 10, y, { width: CW - 20 });
    y += 13;
  });
  y += 10;

  // ── QR Verification ───────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "DIGITAL VERIFICATION");
  y += 10;
  try { doc.image(qrBuf, M + 10, y, { width: 80 }); } catch {}
  doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(9).text("Scan to verify this voucher", M + 100, y + 10, { width: CW - 110 });
  doc.fill("#555555").font("Helvetica").fontSize(8).text(qrUrl, M + 100, y + 24, { width: CW - 110 });
  doc.fill("#555555").font("Helvetica").fontSize(7.5).text(`Voucher ID: ${data.voucherId}`, M + 100, y + 36, { width: CW - 110 });

  // ── Stamp Area ────────────────────────────────────────────────────────────
  y += 98;
  if (y + 70 < H - 50) {
    doc.rect(M, y, CW, 60).stroke("#CCCCCC");
    doc.fill("#CCCCCC").font("Helvetica").fontSize(8).text("AUTHORISED SIGNATORY & COMPANY STAMP", M + 10, y + 8, { width: CW / 2 });
    doc.fill("#CCCCCC").font("Helvetica").fontSize(8).text("HOTEL RECEPTION ACKNOWLEDGEMENT", M + CW / 2 + 10, y + 8, { width: CW / 2 - 10 });
    // Divider
    doc.moveTo(M + CW / 2, y).lineTo(M + CW / 2, y + 60).stroke("#CCCCCC");
  }

  return pdfToBuffer(doc);
}
