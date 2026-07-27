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

function drawHeader(doc: any, bookingNum: string) {
  doc.rect(0, 0, W, HDR_H).fill(DG);
  doc.rect(0, HDR_H - 4, W, 4).fill(GOLD);
  try { doc.image(LOGO_BUF, M, 10, { width: 66 }); } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(15).text("AL BURHAN TOURS & TRAVELS", M + 74, 12, { width: CW - 74 });
  doc.fill("#FFFFFF").font("Helvetica").fontSize(9)
    .text("Hajj & Umrah Travel Services", M + 74, 30, { width: CW - 74 })
    .text("www.alburhantravels.com  |  admin@alburhantravels.com", M + 74, 41, { width: CW - 74 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(18)
    .text("TRAVEL ITINERARY", 0, 58, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(8)
    .text(`Booking Ref: ${bookingNum}`, M, 78, { width: CW });
}

function drawFooter(doc: any, pageNum: number = 1) {
  const y = H - 36;
  doc.rect(0, y, W, 36).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(8)
    .text("AL BURHAN TOURS & TRAVELS  |  Hajj & Umrah Specialists  |  www.alburhantravels.com", 0, y + 8, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(7)
    .text(`Page ${pageNum}  |  This itinerary is subject to change. Contact your travel manager for updates.`, 0, y + 20, { width: W, align: "center" });
}

function sectionLabel(doc: any, y: number, label: string) {
  doc.rect(M, y, CW, 20).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(9).text(label, M + 8, y + 5, { width: CW - 16 });
  return y + 20;
}

function infoRow(doc: any, x: number, y: number, label: string, value: string, w: number = 180) {
  doc.fill("#666666").font("Helvetica").fontSize(8).text(label, x, y, { width: 100 });
  doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(8).text(value, x + 105, y, { width: w });
}

export interface FlightInfo {
  flightNumber?: string | null;
  airline?: string | null;
  departureDate?: string | null;
  from?: string | null;
  to?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  terminal?: string | null;
}

export interface HotelInfo {
  name: string;
  city: string;
  stars?: number | null;
  address?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  roomNumber?: string | null;
}

export interface ItineraryDay {
  day: number;
  date?: string | null;
  location?: string | null;
  title?: string | null;
  activities?: string[];
}

export interface TravelItineraryData {
  customerName: string;
  bookingNumber: string;
  bookingId: string;
  customerId?: string | null;
  packageName?: string | null;
  packageType?: string | null;
  groupName?: string | null;
  departureFlight?: FlightInfo | null;
  returnFlight?: FlightInfo | null;
  hotels?: HotelInfo[];
  dayItinerary?: ItineraryDay[];
  pilgrims?: Array<{ name: string; passportNumber?: string | null }>;
  emergencyContact?: string | null;
  guideContact?: string | null;
  itineraryId: string;
  issuedAt?: Date;
}

export async function generateTravelItineraryPdf(data: TravelItineraryData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });

  const qrUrl = `https://alburhantravels.com/verify/itinerary/${data.itineraryId}`;
  const qrData = await QRCode.toDataURL(qrUrl, { width: 100, margin: 1, color: { dark: "#0B3D2E", light: "#ffffff" } });
  const qrBuf  = Buffer.from(qrData.replace(/^data:image\/png;base64,/, ""), "base64");

  drawHeader(doc, data.bookingNumber);
  drawFooter(doc, 1);

  let y = HDR_H + 16;

  // ── Trip Summary Banner ───────────────────────────────────────────────────
  doc.rect(M, y, CW, 70).fillAndStroke(LG, "#AACFAA");
  try { doc.image(qrBuf, W - M - 80, y + 8, { width: 60 }); } catch {}
  doc.fill(DG).font("Helvetica-Bold").fontSize(14).text(fmt(data.packageName, "Hajj / Umrah Package"), M + 10, y + 8, { width: CW - 100 });
  doc.fill("#2E7D5A").font("Helvetica-Bold").fontSize(9).text(fmt(data.packageType), M + 10, y + 28, { width: CW - 100 });
  doc.fill("#555555").font("Helvetica").fontSize(8)
    .text(`Group: ${fmt(data.groupName)}   |   Ref: ${data.bookingNumber}`, M + 10, y + 42, { width: CW - 100 })
    .text(`Issued: ${(data.issuedAt || new Date()).toLocaleDateString("en-IN", { dateStyle: "full" })}`, M + 10, y + 54, { width: CW - 100 });
  y += 82;

  // ── Traveller Details ─────────────────────────────────────────────────────
  y = sectionLabel(doc, y, "TRAVELLER DETAILS");
  y += 10;
  infoRow(doc, M + 10, y, "Lead Traveller:", fmt(data.customerName));
  infoRow(doc, M + CW / 2, y, "Emergency Contact:", fmt(data.emergencyContact));
  y += 14;
  infoRow(doc, M + 10, y, "Guide Contact:", fmt(data.guideContact));
  y += 14;

  if (data.pilgrims && data.pilgrims.length > 0) {
    doc.fill("#1A1A1A").font("Helvetica-Bold").fontSize(8).text("All Travellers:", M + 10, y, { width: CW - 20 });
    y += 12;
    data.pilgrims.forEach((p, i) => {
      const col = i % 2 === 0 ? M + 10 : M + CW / 2;
      if (i % 2 === 0 && i > 0) y += 13;
      doc.fill("#333333").font("Helvetica").fontSize(8)
        .text(`${i + 1}. ${p.name}  ${p.passportNumber ? `(PP: ${p.passportNumber})` : ""}`, col, y, { width: CW / 2 - 10 });
    });
    y += 18;
  }
  y += 6;

  // ── Departure Flight ──────────────────────────────────────────────────────
  if (data.departureFlight) {
    y = sectionLabel(doc, y, "✈  OUTBOUND FLIGHT");
    y += 10;
    const f = data.departureFlight;
    doc.rect(M + 10, y, CW - 20, 60).fillAndStroke("#F0F8FF", "#90C0E0");
    doc.fill("#1A3A5C").font("Helvetica-Bold").fontSize(12)
      .text(`${fmt(f.flightNumber)} — ${fmt(f.airline)}`, M + 18, y + 8, { width: CW - 36 });
    doc.fill("#1A3A5C").font("Helvetica-Bold").fontSize(9)
      .text(`${fmt(f.from)} → ${fmt(f.to)}`, M + 18, y + 26, { width: CW / 2 });
    infoRow(doc, M + 18,        y + 40, "Date:",      fmtDate(f.departureDate));
    infoRow(doc, M + CW / 2,   y + 40, "Departure:", fmt(f.departureTime));
    y += 74;
  }

  // ── Return Flight ─────────────────────────────────────────────────────────
  if (data.returnFlight) {
    y = sectionLabel(doc, y, "✈  RETURN FLIGHT");
    y += 10;
    const f = data.returnFlight;
    doc.rect(M + 10, y, CW - 20, 60).fillAndStroke("#FFF8F0", "#E0C090");
    doc.fill("#5C3A1A").font("Helvetica-Bold").fontSize(12)
      .text(`${fmt(f.flightNumber)} — ${fmt(f.airline)}`, M + 18, y + 8, { width: CW - 36 });
    doc.fill("#5C3A1A").font("Helvetica-Bold").fontSize(9)
      .text(`${fmt(f.from)} → ${fmt(f.to)}`, M + 18, y + 26, { width: CW / 2 });
    infoRow(doc, M + 18,       y + 40, "Date:",     fmtDate(f.departureDate));
    infoRow(doc, M + CW / 2,  y + 40, "Departure:", fmt(f.departureTime));
    y += 74;
  }

  // ── Accommodation ─────────────────────────────────────────────────────────
  if (data.hotels && data.hotels.length > 0) {
    y = sectionLabel(doc, y, "🏨  ACCOMMODATION");
    y += 10;
    data.hotels.forEach((h, i) => {
      if (y > H - 160) {
        doc.addPage();
        drawHeader(doc, data.bookingNumber);
        drawFooter(doc, 2);
        y = HDR_H + 16;
      }
      doc.rect(M + 10, y, CW - 20, 54).fillAndStroke(i % 2 === 0 ? LG : "#FFFDF0", "#AACFAA");
      doc.fill(DG).font("Helvetica-Bold").fontSize(10).text(h.name, M + 18, y + 6, { width: CW - 36 });
      doc.fill("#555555").font("Helvetica").fontSize(8).text(h.city + (h.stars ? ` — ${"★".repeat(Math.min(Number(h.stars),5))}` : ""), M + 18, y + 22, { width: CW / 2 });
      infoRow(doc, M + 18,      y + 36, "Check-in:",  fmtDate(h.checkIn));
      infoRow(doc, M + CW / 2,  y + 36, "Check-out:", fmtDate(h.checkOut));
      if (h.roomNumber) {
        doc.fill("#0B3D2E").font("Helvetica-Bold").fontSize(8).text(`Room: ${h.roomNumber}`, W - M - 80, y + 6, { width: 70 });
      }
      y += 62;
    });
    y += 4;
  }

  // ── Day-wise Itinerary ────────────────────────────────────────────────────
  if (data.dayItinerary && data.dayItinerary.length > 0) {
    if (y > H - 180) {
      doc.addPage();
      drawHeader(doc, data.bookingNumber);
      drawFooter(doc, 3);
      y = HDR_H + 16;
    }
    y = sectionLabel(doc, y, "📅  DAY-WISE SCHEDULE");
    y += 8;
    data.dayItinerary.forEach((day) => {
      if (y > H - 100) {
        doc.addPage();
        drawHeader(doc, data.bookingNumber);
        drawFooter(doc, 3);
        y = HDR_H + 16;
      }
      const lineH = 16 + (day.activities?.length || 0) * 12 + 8;
      doc.rect(M + 10, y, 48, lineH).fill(DG);
      doc.fill(GOLD).font("Helvetica-Bold").fontSize(8).text("DAY", M + 10, y + 4, { width: 48, align: "center" });
      doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(14).text(String(day.day), M + 10, y + 16, { width: 48, align: "center" });
      doc.rect(M + 60, y, CW - 70, lineH).fillAndStroke("#FAFAFA", "#E0E0E0");
      let dy = y + 6;
      const title = day.title || (day.location ? `${day.location}` : `Day ${day.day}`);
      doc.fill(DG).font("Helvetica-Bold").fontSize(9).text(title, M + 68, dy, { width: CW - 80 });
      if (day.date) {
        doc.fill("#888888").font("Helvetica").fontSize(7.5).text(fmtDate(day.date), M + 68, dy + 12, { width: CW - 80 });
        dy += 12;
      }
      dy += 14;
      (day.activities || []).forEach((act) => {
        doc.fill("#333333").font("Helvetica").fontSize(8).text(`• ${act}`, M + 68, dy, { width: CW - 80 });
        dy += 12;
      });
      y += lineH + 6;
    });
  }

  // ── Important Notes ───────────────────────────────────────────────────────
  if (y > H - 140) {
    doc.addPage();
    drawHeader(doc, data.bookingNumber);
    drawFooter(doc, 4);
    y = HDR_H + 16;
  }
  y = sectionLabel(doc, y, "IMPORTANT NOTES");
  y += 10;
  const notes = [
    "Carry your passport, this itinerary, and hotel voucher at all times.",
    "Report to the designated assembly point 3 hours before each flight.",
    "Ihram should be worn before boarding at the designated Meeqat.",
    "All schedules are subject to change due to operational requirements.",
    "Contact your group guide for any emergency or changes.",
    "Keep your luggage tags attached to all bags throughout the journey.",
  ];
  notes.forEach((note, i) => {
    doc.fill("#1A1A1A").font("Helvetica").fontSize(8).text(`${i + 1}. ${note}`, M + 10, y, { width: CW - 20 });
    y += 13;
  });

  return pdfToBuffer(doc);
}
