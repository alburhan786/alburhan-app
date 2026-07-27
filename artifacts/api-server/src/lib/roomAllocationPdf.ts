// @ts-nocheck
import PDFDocument from "pdfkit";
import { LOGO_BASE64 } from "./logoData.js";

const LOGO_BUF = Buffer.from(LOGO_BASE64, "base64");
const DG   = "#0B3D2E";
const GOLD = "#C9A23F";
const M    = 50;
const W    = 595;
const H    = 842;
const CW   = W - M * 2;

export interface RoomAllocationData {
  pilgrimName:   string;
  bookingNumber: string;
  bookingId:     string;
  customerId:    string;
  hotelName:     string;
  hotelCity:     string;
  hotelAddress?: string;
  roomNumber:    string | number;
  floorNumber?:  string | number;
  bedType?:      string;
  roomCapacity?: number;
  checkInDate?:  string | Date;
  checkOutDate?: string | Date;
  groupName?:    string;
  maktabNumber?: string;
  issuedAt?:     Date;
}

function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
function fmt(v: any, fallback = "—"): string { return (v == null || v === "") ? fallback : String(v); }
function fmtDate(v: any, fallback = "—"): string {
  if (!v) return fallback;
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return fallback; }
}

export async function generateRoomAllocationPdf(data: RoomAllocationData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: "Room Allocation Letter" } });

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 100).fill(DG);
  doc.rect(0, 96, W, 4).fill(GOLD);
  try { doc.image(LOGO_BUF, M, 12, { width: 64 }); } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(14)
    .text("AL BURHAN TOURS & TRAVELS", M + 72, 14, { width: CW - 72 });
  doc.fill("#FFFFFF").font("Helvetica").fontSize(8.5)
    .text("Hajj & Umrah Travel Specialists", M + 72, 32, { width: CW - 72 })
    .text("www.alburhantravels.com  |  admin@alburhantravels.com", M + 72, 43, { width: CW - 72 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(17)
    .text("ROOM ALLOCATION LETTER", 0, 64, { width: W, align: "center" });

  // ── Reference line ─────────────────────────────────────────────────────────
  const issuedDate = fmtDate(data.issuedAt || new Date());
  doc.moveDown(0);
  let y = 118;
  doc.fill("#666666").font("Helvetica").fontSize(8.5)
    .text(`Ref: ${data.bookingNumber}  |  Issued: ${issuedDate}`, M, y, { width: CW, align: "right" });

  // ── Salutation ─────────────────────────────────────────────────────────────
  y += 30;
  doc.fill(DG).font("Helvetica-Bold").fontSize(11).text("To,", M, y);
  y += 16;
  doc.fill("#222222").font("Helvetica-Bold").fontSize(12).text(fmt(data.pilgrimName), M, y);
  y += 16;
  doc.fill("#555555").font("Helvetica").fontSize(9.5)
    .text(`Booking Ref: ${data.bookingNumber}`, M, y);

  y += 30;
  doc.fill("#333333").font("Helvetica").fontSize(10).text(
    `We are pleased to confirm your room allocation at our partner hotel for your upcoming pilgrimage. `
    + `Please present this letter along with a valid photo ID at the hotel reception upon check-in.`,
    M, y, { width: CW, lineGap: 3 }
  );

  // ── Room Details Box ────────────────────────────────────────────────────────
  y += 60;
  doc.rect(M, y, CW, 24).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(11)
    .text("ROOM ALLOCATION DETAILS", M, y + 6, { width: CW, align: "center" });
  y += 28;

  const rows: [string, string][] = [
    ["Hotel Name",     fmt(data.hotelName)],
    ["City",           fmt(data.hotelCity)],
    ["Address",        fmt(data.hotelAddress)],
    ["Room Number",    fmt(data.roomNumber)],
    ["Floor",          fmt(data.floorNumber)],
    ["Bed Type",       fmt(data.bedType)],
    ["Room Capacity",  data.roomCapacity ? `${data.roomCapacity} persons` : "—"],
    ["Check-In Date",  fmtDate(data.checkInDate)],
    ["Check-Out Date", fmtDate(data.checkOutDate)],
  ];

  rows.forEach(([label, val], i) => {
    const bg = i % 2 === 0 ? "#F5FAF5" : "#FFFFFF";
    doc.rect(M, y, CW, 22).fill(bg).stroke("#E0E0E0");
    doc.fill(DG).font("Helvetica-Bold").fontSize(9.5)
      .text(label, M + 10, y + 6, { width: CW * 0.38 });
    doc.fill("#222222").font("Helvetica").fontSize(9.5)
      .text(val, M + CW * 0.42, y + 6, { width: CW * 0.55 });
    y += 22;
  });

  // ── Group Details ───────────────────────────────────────────────────────────
  if (data.groupName || data.maktabNumber) {
    y += 20;
    doc.rect(M, y, CW, 24).fill(GOLD);
    doc.fill(DG).font("Helvetica-Bold").fontSize(11)
      .text("GROUP INFORMATION", M, y + 6, { width: CW, align: "center" });
    y += 28;
    const grpRows: [string, string][] = [
      ["Group Name",    fmt(data.groupName)],
      ["Maktab Number", fmt(data.maktabNumber)],
    ];
    grpRows.forEach(([label, val], i) => {
      const bg = i % 2 === 0 ? "#FFF9EC" : "#FFFFFF";
      doc.rect(M, y, CW, 22).fill(bg).stroke("#E0E0E0");
      doc.fill(DG).font("Helvetica-Bold").fontSize(9.5)
        .text(label, M + 10, y + 6, { width: CW * 0.38 });
      doc.fill("#222222").font("Helvetica").fontSize(9.5)
        .text(val, M + CW * 0.42, y + 6, { width: CW * 0.55 });
      y += 22;
    });
  }

  // ── Important Instructions ─────────────────────────────────────────────────
  y += 28;
  doc.rect(M, y, CW, 20).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(10)
    .text("IMPORTANT INSTRUCTIONS", M, y + 5, { width: CW, align: "center" });
  y += 24;
  const instructions = [
    "1. Present this letter and a valid photo ID (Passport/Aadhaar) at hotel reception for check-in.",
    "2. Check-in time is 14:00 (2:00 PM). Early check-in is subject to availability.",
    "3. Check-out time is 12:00 (noon). Late check-out requests must be made in advance.",
    "4. Room changes are not permitted without prior approval from Al Burhan management.",
    "5. All guests must comply with hotel rules and local regulations.",
    "6. For any issues, contact your group leader or Al Burhan helpdesk immediately.",
  ];
  instructions.forEach(line => {
    doc.fill("#444444").font("Helvetica").fontSize(9)
      .text(line, M + 8, y, { width: CW - 16, lineGap: 1 });
    y += 16;
  });

  // ── Signature area ─────────────────────────────────────────────────────────
  y += 28;
  const sigY = y;
  doc.rect(M, sigY, CW * 0.45, 64).stroke("#CCCCCC");
  doc.fill(DG).font("Helvetica-Bold").fontSize(8.5)
    .text("Authorised Signatory", M + 8, sigY + 50, { width: CW * 0.42 });
  doc.fill("#888888").font("Helvetica").fontSize(7.5)
    .text("Al Burhan Tours & Travels", M + 8, sigY + 60);

  doc.rect(M + CW * 0.55, sigY, CW * 0.45, 64).stroke("#CCCCCC");
  doc.fill(DG).font("Helvetica-Bold").fontSize(8.5)
    .text("Official Stamp", M + CW * 0.55 + 8, sigY + 50, { width: CW * 0.42 });

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.rect(0, H - 34, W, 34).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(8)
    .text("AL BURHAN TOURS & TRAVELS  |  Hajj & Umrah Specialists  |  www.alburhantravels.com", 0, H - 24, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(7)
    .text("This is a computer-generated document. No physical signature required.", 0, H - 14, { width: W, align: "center" });

  return pdfToBuffer(doc);
}
