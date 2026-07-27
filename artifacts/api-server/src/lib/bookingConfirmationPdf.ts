// @ts-nocheck
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { LOGO_BASE64 } from "./logoData.js";

const LOGO_BUF = Buffer.from(LOGO_BASE64, "base64");
const DG   = "#0B3D2E";
const GOLD = "#C9A23F";
const M    = 50;
const W    = 595;
const H    = 842;
const CW   = W - M * 2;

export interface BookingConfirmationData {
  bookingId:       string;
  bookingNumber:   string;
  customerName:    string;
  customerMobile?: string;
  customerEmail?:  string;
  packageName?:    string;
  packageType?:    string;
  departureDate?:  string | Date;
  returnDate?:     string | Date;
  totalAmount?:    number | string;
  status:          "pending" | "approved" | "rejected";
  submittedAt?:    Date;
  dashboardUrl?:   string;
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
function fmtCurrency(v: any, fallback = "—"): string {
  const n = Number(v);
  if (isNaN(n) || n <= 0) return fallback;
  return `₹ ${n.toLocaleString("en-IN")}`;
}

export async function generateBookingConfirmationPdf(data: BookingConfirmationData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: "Booking Confirmation" } });

  const statusColors: Record<string, string> = {
    pending:  "#E67E22",
    approved: "#27AE60",
    rejected: "#E74C3C",
  };
  const statusLabels: Record<string, string> = {
    pending:  "RECEIVED — UNDER REVIEW",
    approved: "CONFIRMED",
    rejected: "REJECTED",
  };
  const statusColor = statusColors[data.status] || "#555555";
  const statusLabel = statusLabels[data.status] || data.status.toUpperCase();

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
    .text("BOOKING CONFIRMATION", 0, 62, { width: W, align: "center" });

  // ── Status badge ───────────────────────────────────────────────────────────
  let y = 116;
  const badgeW = 220;
  const badgeX = (W - badgeW) / 2;
  doc.rect(badgeX, y, badgeW, 28).fill(statusColor).radius = 4;
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(11)
    .text(statusLabel, badgeX, y + 8, { width: badgeW, align: "center" });
  y += 44;

  // ── Ref + Date ─────────────────────────────────────────────────────────────
  doc.fill("#666666").font("Helvetica").fontSize(8.5)
    .text(`Booking Ref: ${data.bookingNumber}   |   Date: ${fmtDate(data.submittedAt || new Date())}`, M, y, { width: CW, align: "right" });
  y += 28;

  // ── Addressed to ──────────────────────────────────────────────────────────
  doc.fill(DG).font("Helvetica-Bold").fontSize(11).text("Dear,", M, y);
  y += 16;
  doc.fill("#111111").font("Helvetica-Bold").fontSize(13).text(fmt(data.customerName), M, y);
  y += 30;
  doc.fill("#444444").font("Helvetica").fontSize(10).text(
    data.status === "pending"
      ? `Thank you for choosing Al Burhan Tours & Travels. We have successfully received your booking request and it is currently being reviewed by our team. You will be notified once it is approved.`
      : data.status === "approved"
        ? `Congratulations! Your booking with Al Burhan Tours & Travels has been confirmed. Please check your customer dashboard for full details, documents, and next steps.`
        : `We regret to inform you that your booking could not be processed at this time. Please contact our support team for assistance.`,
    M, y, { width: CW, lineGap: 3 }
  );

  // ── Booking Details ────────────────────────────────────────────────────────
  y += 70;
  doc.rect(M, y, CW, 24).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(11)
    .text("BOOKING DETAILS", M, y + 6, { width: CW, align: "center" });
  y += 28;

  const rows: [string, string][] = [
    ["Booking Reference",    fmt(data.bookingNumber)],
    ["Customer Name",        fmt(data.customerName)],
    ["Mobile",               fmt(data.customerMobile)],
    ["Email",                fmt(data.customerEmail)],
    ["Package",              fmt(data.packageName)],
    ["Package Type",         fmt(data.packageType)],
    ["Departure Date",       fmtDate(data.departureDate)],
    ["Return Date",          fmtDate(data.returnDate)],
    ["Package Amount",       fmtCurrency(data.totalAmount)],
    ["Status",               statusLabel],
    ["Submitted On",         fmtDate(data.submittedAt || new Date())],
  ];

  rows.forEach(([label, val], i) => {
    const bg = i % 2 === 0 ? "#F5FAF5" : "#FFFFFF";
    doc.rect(M, y, CW, 22).fill(bg).stroke("#E0E0E0");
    doc.fill(DG).font("Helvetica-Bold").fontSize(9.5)
      .text(label, M + 10, y + 6, { width: CW * 0.40 });
    doc.fill(label === "Status" ? statusColor : "#222222").font("Helvetica").fontSize(9.5)
      .text(val, M + CW * 0.44, y + 6, { width: CW * 0.54 });
    y += 22;
  });

  // ── Next Steps ─────────────────────────────────────────────────────────────
  y += 24;
  doc.rect(M, y, CW, 20).fill(GOLD);
  doc.fill(DG).font("Helvetica-Bold").fontSize(10)
    .text("NEXT STEPS", M, y + 5, { width: CW, align: "center" });
  y += 24;
  const steps = data.status === "pending"
    ? [
        "1. Our team will review your booking within 24-48 hours.",
        "2. You will receive a WhatsApp & SMS notification once approved.",
        "3. After approval, you will need to upload KYC documents (Passport, Photos, etc.).",
        "4. Invoice and Payment instructions will be shared after approval.",
        "5. Log in to your dashboard to track your booking status in real time.",
      ]
    : data.status === "approved"
      ? [
          "1. Log in to your customer dashboard to complete KYC document upload.",
          "2. Complete payment as per the invoice shared with you.",
          "3. Sign the digital agreement (OTP verification required).",
          "4. Track all journey updates through your dashboard.",
          "5. Contact us anytime at admin@alburhantravels.com or WhatsApp.",
        ]
      : [
          "1. Contact our support team for more information about your rejection.",
          "2. Email: admin@alburhantravels.com",
          "3. WhatsApp: Available on our website.",
        ];
  steps.forEach(step => {
    doc.fill("#444444").font("Helvetica").fontSize(9)
      .text(step, M + 8, y, { width: CW - 16, lineGap: 1 });
    y += 17;
  });

  // ── QR + Dashboard link ───────────────────────────────────────────────────
  if (data.dashboardUrl) {
    y += 20;
    try {
      const qr = await QRCode.toBuffer(data.dashboardUrl, { type: "png", width: 100, margin: 1 });
      doc.image(qr, W - M - 80, y, { width: 80 });
      doc.fill(DG).font("Helvetica-Bold").fontSize(8.5)
        .text("Scan to access\nyour dashboard", W - M - 85, y + 82, { width: 85, align: "center" });
    } catch {}
    doc.fill(DG).font("Helvetica-Bold").fontSize(9)
      .text("Dashboard: " + data.dashboardUrl, M, y + 20, { width: CW - 100 });
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.rect(0, H - 34, W, 34).fill(DG);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(8)
    .text("AL BURHAN TOURS & TRAVELS  |  Hajj & Umrah Specialists  |  www.alburhantravels.com", 0, H - 24, { width: W, align: "center" });
  doc.fill("#B8D4C8").font("Helvetica").fontSize(7)
    .text(`Booking Ref: ${data.bookingNumber}  |  This is a computer-generated document.`, 0, H - 14, { width: W, align: "center" });

  return pdfToBuffer(doc);
}
