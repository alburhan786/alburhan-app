import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const PROD_DOMAIN = "https://alburhantravels.com";

const MASHARIQ_EN = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR = "شركة مشارق الماسية";

// Company India phones (shown big on front)
const INDIA_PHONES = ["9893989786", "9893225590"];
// Emergency Saudi phones (shown in front footer white)
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; busNumber?: string; roomNumber?: string; seatNumber?: string;
  barcodeId?: string; salutation?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    groupLeader?: string;
    makkah?:  { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

interface CardProps {
  p: Pilgrim; group: Group;
  company: ReturnType<typeof getCompanyById>;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
}

function FrontCard({ p, group, company }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = p.barcodeId || p.passportNumber || `HAJ${serial}`;
  const barcodeFormat = p.barcodeId ? "CODE128" : "CODE39";

  return (
    <div className="pro-card">

      {/* ── Header ── */}
      <div style={{
        background: DARK, flexShrink: 0,
        padding: "1.2mm 2mm 1mm", display: "flex", alignItems: "center", gap: "2mm",
      }}>
        {/* Big Indian flag */}
        <div style={{ fontSize: "26pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>

        {/* Company + year */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>

        {/* Logo circle */}
        {company.logoUrl ? (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%",
            background: "#fff", border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: 0,
          }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%",
            background: GOLD, display: "flex", alignItems: "center",
            justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "6pt", flexShrink: 0,
          }}>AB</div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Photo sidebar */}
        <div style={{
          width: "19mm", flexShrink: 0, background: "#f0f7f2",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "0.8mm",
          borderRight: `1.5px solid ${GOLD}`,
        }}>
          {p.photoUrl ? (
            <img src={`${API}${p.photoUrl}`} alt="" crossOrigin="anonymous"
              style={{ width: "16mm", height: "19mm", objectFit: "cover", objectPosition: "top center", border: `2px solid ${GOLD}`, borderRadius: "2px" }} />
          ) : (
            <div style={{
              width: "16mm", height: "19mm", background: "#e0e8e4",
              border: `2px solid ${GOLD}`, borderRadius: "2px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              fontSize: "3pt", color: "#888", fontWeight: 700,
            }}>
              <div style={{ fontSize: "9pt", color: GOLD }}>👤</div>
              <div>PHOTO</div>
            </div>
          )}
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, marginTop: "0.5mm" }}>#{serial}</div>
        </div>

        {/* Info column */}
        <div style={{ flex: 1, padding: "1.2mm 1mm 0.5mm 2mm", display: "flex", flexDirection: "column", overflow: "hidden", gap: "0.9mm" }}>

          {/* Pilgrim name */}
          <div style={{
            fontSize: "6.5pt", fontWeight: 900, color: DARK,
            textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word",
            borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.6mm",
          }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>

          {/* Passport No — BIG BOLD */}
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
            </div>
          )}

          {/* Mobile India — BIG BOLD */}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
            </div>
          )}

          {/* Service Center — BIG BOLD */}
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber}</div>
            </div>
          )}

          {/* Company India phones — big bold */}
          <div style={{ marginTop: "auto", borderTop: `1px solid ${GOLD}40`, paddingTop: "0.5mm" }}>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>
              {INDIA_PHONES[0]} &nbsp;|&nbsp; {INDIA_PHONES[1]}
            </div>
          </div>
        </div>

        {/* QR column — TOP RIGHT, BIG */}
        <div style={{
          width: "22mm", flexShrink: 0, padding: "1.5mm 1.5mm 0.5mm",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
          borderLeft: `1px solid ${GOLD}50`,
        }}>
          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2.5px solid ${DARK}` }}>
            <QRCodeSVG value={buildVerifyUrl(p.id)} size={56} level="M" fgColor={DARK} />
          </div>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", letterSpacing: "0.2px", textAlign: "center" }}>SCAN TO VERIFY</div>
        </div>
      </div>

      {/* ── Barcode — BIG ── */}
      <div style={{ flexShrink: 0, padding: "0 1.5mm 0.3mm", background: "#fff" }}>
        <Barcode value={barcodeVal} format={barcodeFormat} height={22} displayValue fontSize={5} />
      </div>

      {/* ── Footer — Mobile + Emergency numbers BIG BOLD WHITE SQUARE ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        {/* Row 1: label + mobile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8mm" }}>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Mobile No.</div>
        </div>
        {/* Row 2: emergency | mobile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>🆘 Emergency (Saudi)</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "8.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>
              {p.mobileIndia || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: CardProps) {
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="pro-card">

      {/* ── Header ── */}
      <div style={{
        background: DARK, padding: "1mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm",
      }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, textAlign: "right", flexShrink: 0 }}>
          {company.phone}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: service info */}
        <div style={{
          width: "43mm", flexShrink: 0, padding: "1.2mm 2mm 1mm",
          borderRight: `1px solid ${GOLD}40`,
          display: "flex", flexDirection: "column", gap: "1mm",
        }}>
          {/* Maktab big */}
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
              <div style={{ fontSize: "13pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber}</div>
            </div>
          )}

          {/* Mashariq — EN + AR */}
          <div style={{
            background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm",
            borderLeft: `2.5px solid ${GOLD}`,
          }}>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif" }}>{MASHARIQ_AR}</div>
            <div style={{ fontSize: "2.8pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>

          {/* Saudi emergency — BIG */}
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>
              🆘 Emergency (Saudi)
            </div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        </div>

        {/* Right: hotels + feedback QR */}
        <div style={{ flex: 1, padding: "1.2mm 1.5mm", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2mm", flex: 1 }}>
            {([
              ["Hotel Makkah 1", group.hotels?.aziziah?.name, group.hotels?.aziziah?.nameAr, group.hotels?.aziziah?.address],
              ["Hotel Makkah 2", group.hotels?.makkah?.name,  group.hotels?.makkah?.nameAr,  group.hotels?.makkah?.address],
              ["Hotel Madinah",  group.hotels?.madinah?.name,  group.hotels?.madinah?.nameAr,  group.hotels?.madinah?.address],
            ] as [string, string|undefined, string|undefined, string|undefined][]).map(([lbl, val, valAr, addr]) => val ? (
              <div key={lbl}>
                <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>{lbl}</div>
                <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{val}</div>
                {valAr && <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{valAr}</div>}
                {addr && <div style={{ fontSize: "4pt", fontWeight: 700, color: "#555", lineHeight: 1.2 }}>{addr}</div>}
              </div>
            ) : null)}
          </div>

          {showFeedbackQr && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "auto" }}>
              <div style={{ background: "#fff", padding: "1px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
                <QRCodeSVG
                  value={p.mobileIndia && bookingMap[p.mobileIndia]
                    ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                    : `${PROD_DOMAIN}/feedback`}
                  size={26} level="L" fgColor={DARK}
                />
              </div>
              <div style={{ fontSize: "2.8pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer — Address + Emergency BIG BOLD WHITE SQUARE ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2mm" }}>
          {/* Left: address */}
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.5mm" }}>
              {p.fullName}
            </div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>
              {SHORT_ADDRESS}
            </div>
          </div>
          {/* Right: emergency Saudi */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.3mm" }}>🆘 Emergency</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

type DuplexMode = "none" | "short-edge" | "long-edge" | "single";

export default function PrintIdCardsPro() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-pro");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});
  const [duplexMode, setDuplexMode] = useState<DuplexMode>("single");

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(([g, p, bm]) => { setGroup(g); setPilgrims(Array.isArray(p) ? p : []); setBookingMap(bm || {}); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const COLS = 3;
  const BATCH = duplexMode === "single" ? 1 : 9;

  const batches: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += BATCH) batches.push(pilgrims.slice(i, i + BATCH));

  /** Compute back-page order based on duplex mode */
  function getBackOrder(padded: (Pilgrim | null)[], totalRows: number): (Pilgrim | null)[] {
    if (duplexMode === "short-edge") {
      // Landscape short-edge flip = mirror columns per row
      const out: (Pilgrim | null)[] = [];
      for (let r = 0; r < totalRows; r++)
        for (let c = COLS - 1; c >= 0; c--)
          out.push(padded[r * COLS + c] ?? null);
      return out;
    }
    if (duplexMode === "long-edge") {
      // Landscape long-edge flip = reverse row order, columns stay
      const out: (Pilgrim | null)[] = [];
      for (let r = totalRows - 1; r >= 0; r--)
        for (let c = 0; c < COLS; c++)
          out.push(padded[r * COLS + c] ?? null);
      return out;
    }
    // "none" or "single" → same order, printer handles flip
    return padded;
  }

  const duplexTip: Record<DuplexMode, string> = {
    single:       "✅ Guaranteed alignment — 1 card front+back per page pair. Select Two-sided in print dialog.",
    none:         "💡 Printer handles alignment. Select Two-sided → Flip on long edge.",
    "short-edge": "💡 Columns mirrored. Select Two-sided → Flip on short edge.",
    "long-edge":  "💡 Rows reversed. Select Two-sided → Flip on long edge.",
  };

  const isSingle = duplexMode === "single";

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 ${isSingle ? "portrait" : "landscape"}; margin: ${isSingle ? "15mm 20mm" : "6mm 8mm"}; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .pro-print-page { margin-bottom: 0 !important; box-shadow: none !important; padding: 0 !important; }
        }
        * { box-sizing: border-box; }

        .pro-card {
          width: 90mm;
          height: 60mm;
          border: 1px solid #aaa;
          border-radius: 3px;
          overflow: hidden;
          page-break-inside: avoid;
          break-inside: avoid;
          font-family: Arial, sans-serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }

        /* Landscape 3×3 grid */
        .pro-print-page {
          width: ${isSingle ? "90mm" : "277mm"};
          margin: 0 auto;
          display: grid;
          grid-template-columns: ${isSingle ? "90mm" : "90mm 90mm 90mm"};
          gap: ${isSingle ? "0" : "3.5mm"};
          justify-content: center;
          align-content: ${isSingle ? "center" : "start"};
          ${isSingle ? "min-height: 60mm;" : ""}
          page-break-after: always;
          break-after: page;
        }
        .pro-print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .card-placeholder {
          width: 90mm;
          height: 60mm;
          visibility: hidden;
          flex-shrink: 0;
        }

        @media screen {
          .pro-print-page {
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.12);
            padding: 8mm;
            border-radius: 4px;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        padding: "14px 20px", background: "#fef3c7",
        display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        borderBottom: "2px solid #d1d5db",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "15px", color: DARK }}>ID Card Print — Duplex</div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {isSingle ? "1 card per page pair — guaranteed alignment" : "9 cards/side · 3×3 landscape grid"}
          </div>
        </div>

        {/* Company selector */}
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>

        {/* Feedback QR */}
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px" }} />
          Feedback QR
        </label>

        {/* ── Duplex mode selector ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" }}>Duplex Mode</div>
          <select value={duplexMode} onChange={e => setDuplexMode(e.target.value as DuplexMode)}
            style={{ padding: "8px 12px", border: `2px solid ${DARK}`, borderRadius: "6px", fontSize: "13px", fontWeight: 600, background: "#fff", color: DARK }}>
            <option value="single">✅ Single card / page pair (Recommended)</option>
            <option value="none">9-card grid · Printer handles flip</option>
            <option value="short-edge">9-card grid · Short-edge flip (columns mirror)</option>
            <option value="long-edge">9-card grid · Long-edge flip (rows reverse)</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            🖨 Print
          </button>
          <button onClick={() => window.history.back()} style={{ padding: "10px 20px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff", fontSize: "13px" }}>
            ← Back
          </button>
        </div>
      </div>

      {/* ── Tip bar ── */}
      <div className="no-print" style={{
        padding: "8px 20px", background: isSingle ? "#f0fdf4" : "#f0f9ff",
        borderBottom: `1px solid ${isSingle ? "#86efac" : "#bae6fd"}`,
        fontSize: "12px", color: isSingle ? "#166534" : "#0369a1",
        display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center",
      }}>
        <span>{duplexTip[duplexMode]}</span>
        {isSingle && <span>📄 Each person gets <strong>Page N = Front</strong> + <strong>Page N+1 = Back</strong> — perfect for any duplex printer</span>}
        {!isSingle && <span>📐 Card: <strong>9×6cm</strong> · 9 per side · {pilgrims.length} cards = {batches.length} batch{batches.length !== 1 ? "es" : ""}</span>}
      </div>

      {/* ── Pages ── */}
      <div style={{ background: "#f5f5f0", padding: "8mm", display: "flex", flexDirection: "column", gap: "10mm" }}>
        {batches.map((batch, bi) => {
          const totalRows = isSingle ? 1 : Math.ceil(batch.length / COLS);
          const padded = [...batch];
          if (!isSingle) while (padded.length % COLS !== 0) padded.push(null as unknown as Pilgrim);
          const backOrder = getBackOrder(padded, totalRows);
          const p0 = batch[0];

          return [
            /* FRONT PAGE */
            <div key={`front-${bi}`}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic" }}>
                {isSingle
                  ? `Card ${bi + 1} · ${p0?.fullName || ""} — FRONT (Page ${bi * 2 + 1})`
                  : `Batch ${bi + 1} · FRONT (Page ${bi * 2 + 1}) — ${batch.length} cards`}
              </div>
              <div className="pro-print-page">
                {padded.map((p, idx) => p
                  ? <FrontCard key={p.id} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                  : <div key={`fph-${idx}`} className="card-placeholder" />
                )}
              </div>
            </div>,

            /* BACK PAGE */
            <div key={`back-${bi}`}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic" }}>
                {isSingle
                  ? `Card ${bi + 1} · ${p0?.fullName || ""} — BACK (Page ${bi * 2 + 2})`
                  : `Batch ${bi + 1} · BACK (Page ${bi * 2 + 2}) · mode: ${duplexMode}`}
              </div>
              <div className="pro-print-page">
                {backOrder.map((p, idx) => p
                  ? <BackCard key={`${p.id}-back-${idx}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                  : <div key={`bph-${idx}`} className="card-placeholder" />
                )}
              </div>
            </div>,
          ];
        })}
      </div>
    </>
  );
}
