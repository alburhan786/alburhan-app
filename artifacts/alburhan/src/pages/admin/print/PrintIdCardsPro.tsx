import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const PROD_DOMAIN = "https://alburhantravels.com";

// Mashariq Al Masiah — pilgrim service company
const MASHARIQ_EN = "Mashariq Al Masiah";
const MASHARIQ_AR = "مشارق المسياح";

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
    makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const DARK = "#0d5040";
const GOLD = "#C9A23F";

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

interface CardProps {
  p: Pilgrim;
  group: Group;
  company: ReturnType<typeof getCompanyById>;
  showFeedbackQr: boolean;
  bookingMap: Record<string, string>;
}

function FrontCard({ p, group, company }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = p.barcodeId || p.passportNumber || `HAJ${serial}`;
  const barcodeFormat = p.barcodeId ? "CODE128" : "CODE39";

  return (
    <div className="pro-card">

      {/* ── Header: Flag | Company | Logo ── */}
      <div style={{
        background: DARK, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "1.2mm 2.5mm",
        flexShrink: 0, gap: "1.5mm",
      }}>
        {/* Indian Flag */}
        <div style={{ fontSize: "30pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>

        {/* Company name centre */}
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.15 }}>
            {company.nameShort}
          </div>
          <div style={{ fontSize: "4pt", fontWeight: 700, color: GOLD, letterSpacing: "0.3px", lineHeight: 1.2 }}>
            TOURS & TRAVELS
          </div>
          <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.3px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>

        {/* Logo circle */}
        {company.logoUrl ? (
          <div style={{
            width: "12mm", height: "12mm", borderRadius: "50%",
            background: "#fff", border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: 0,
          }}>
            <img src={company.logoUrl} alt="" style={{ width: "90%", height: "90%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{
            width: "12mm", height: "12mm", borderRadius: "50%",
            background: GOLD, display: "flex", alignItems: "center",
            justifyContent: "center", color: DARK, fontWeight: 900,
            fontSize: "8pt", flexShrink: 0,
          }}>
            {company.nameShort.slice(0, 2)}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Photo sidebar */}
        <div style={{
          width: "22mm", flexShrink: 0, background: "#f0f7f2",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "1mm",
          borderRight: `1.5px solid ${GOLD}`,
        }}>
          {p.photoUrl ? (
            <img
              src={`${API}${p.photoUrl}`}
              alt="" crossOrigin="anonymous"
              style={{
                width: "18mm", height: "22mm",
                objectFit: "cover", objectPosition: "top center",
                border: `2px solid ${GOLD}`, borderRadius: "2px",
              }}
            />
          ) : (
            <div style={{
              width: "18mm", height: "22mm", background: "#e0e8e4",
              border: `2px solid ${GOLD}`, borderRadius: "2px",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", fontSize: "3.5pt", color: "#888", fontWeight: 700,
            }}>
              <div style={{ fontSize: "11pt", color: GOLD }}>👤</div>
              <div>PHOTO</div>
            </div>
          )}
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, textAlign: "center", marginTop: "0.5mm", lineHeight: 1 }}>
            #{serial}
          </div>
        </div>

        {/* Info + QR */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Info column */}
          <div style={{ flex: 1, padding: "1.2mm 1mm 0.5mm 2mm", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word", marginBottom: "1mm" }}>
              {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6mm" }}>
              {[
                ["Passport", p.passportNumber],
                ["Service Ctr.", group.maktabNumber],
                ["India Mobile", p.mobileIndia],
              ].map(([lbl, val]) => val ? (
                <div key={lbl as string} style={{ display: "flex", alignItems: "center", gap: "1mm" }}>
                  <span style={{ width: "2.5mm", height: "2.5mm", borderRadius: "50%", background: GOLD, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: "3.5pt", color: "#888", textTransform: "uppercase", minWidth: "10mm", flexShrink: 0 }}>{lbl}</span>
                  <span style={{ fontSize: "4.5pt", fontWeight: 800, color: DARK }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>

          {/* QR column */}
          <div style={{
            width: "20mm", flexShrink: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "1mm 1.5mm",
            borderLeft: `1px solid ${GOLD}50`,
          }}>
            <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2px solid ${DARK}` }}>
              <QRCodeSVG value={buildVerifyUrl(p.id)} size={44} level="M" fgColor={DARK} />
            </div>
            <div style={{ fontSize: "3pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", letterSpacing: "0.2px" }}>SCAN TO VERIFY</div>
          </div>

        </div>
      </div>

      {/* Barcode */}
      <div style={{ flexShrink: 0, padding: "0 2mm 0.5mm", background: "#fff" }}>
        <Barcode value={barcodeVal} format={barcodeFormat} height={15} displayValue fontSize={4} />
      </div>

      {/* Footer */}
      <div style={{ background: DARK, textAlign: "center", padding: "0.7mm 2mm", flexShrink: 0 } as React.CSSProperties}>
        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", lineHeight: 1.2 }}>
          {p.fullName}
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: GOLD, lineHeight: 1.2 }}>
          {company.address}
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: CardProps) {
  // Split Saudi phones by | to show each number individually
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="pro-card">

      {/* ── Header ── */}
      <div style={{
        background: DARK, padding: "1mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        minHeight: "6.5mm",
      }}>
        <div style={{ fontSize: "6.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.2 }}>
          {company.nameShort}
        </div>
        <div style={{ fontSize: "4pt", fontWeight: 700, color: GOLD, lineHeight: 1.2, textAlign: "right" }}>
          {company.phone}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left column: service info + emergency */}
        <div style={{
          width: "42mm", flexShrink: 0, padding: "1.2mm 2mm 1mm",
          borderRight: `1px solid ${GOLD}40`,
          display: "flex", flexDirection: "column", gap: "0.5mm",
        }}>
          {/* Maktab */}
          <div>
            <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
            <div style={{ fontSize: "14pt", fontWeight: 900, color: DARK, lineHeight: 1, marginBottom: "0.3mm" }}>{group.maktabNumber || "—"}</div>
          </div>

          {/* Mashariq Al Masiah — pilgrim service company */}
          <div style={{
            background: `${GOLD}18`, borderRadius: "2px", padding: "0.8mm 1.5mm",
            borderLeft: `2px solid ${GOLD}`,
          }}>
            <div style={{ fontSize: "4.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>
              {MASHARIQ_EN}
            </div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif" }}>
              {MASHARIQ_AR}
            </div>
            <div style={{ fontSize: "3pt", color: "#888", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>

          {/* Emergency — Saudi numbers LARGE */}
          <div>
            <div style={{ fontSize: "3.5pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>
              🆘 Emergency (Saudi)
            </div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.25, letterSpacing: "0.5px" }}>
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Right column: hotels + feedback QR */}
        <div style={{ flex: 1, padding: "1.2mm 1.5mm", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1mm", flex: 1 }}>
            {([
              ["Hotel Makkah 1", group.hotels?.aziziah?.name, group.hotels?.aziziah?.nameAr, group.hotels?.aziziah?.address],
              ["Hotel Makkah 2", group.hotels?.makkah?.name, group.hotels?.makkah?.nameAr, group.hotels?.makkah?.address],
              ["Hotel Madinah",  group.hotels?.madinah?.name, group.hotels?.madinah?.nameAr, group.hotels?.madinah?.address],
            ] as [string, string|undefined, string|undefined, string|undefined][]).map(([lbl, val, valAr, addr]) => val ? (
              <div key={lbl}>
                <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>{lbl}</div>
                <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{val}</div>
                {valAr && <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{valAr}</div>}
                {addr && <div style={{ fontSize: "4pt", color: "#666", lineHeight: 1.2 }}>{addr}</div>}
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
              <div style={{ fontSize: "3pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ background: DARK, textAlign: "center", padding: "0.7mm 2mm", flexShrink: 0 } as React.CSSProperties}>
        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", lineHeight: 1.2 }}>{p.fullName}</div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: GOLD, lineHeight: 1.2 }}>{company.address}</div>
      </div>
    </div>
  );
}

export default function PrintIdCardsPro() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-pro");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(([g, p, bm]) => { setGroup(g); setPilgrims(Array.isArray(p) ? p : []); setBookingMap(bm || {}); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  // 4 cards per page — front + back on same row
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 4) pages.push(pilgrims.slice(i, i + 4));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .pro-card {
          width: 90mm;
          height: 60mm;
          border: 1.5px solid #aaa;
          border-radius: 3px;
          overflow: hidden;
          page-break-inside: avoid;
          font-family: Arial, sans-serif;
          background: #fff;
          position: relative;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        .pair-row {
          display: flex;
          gap: 5mm;
          align-items: flex-start;
          page-break-inside: avoid;
        }
        .pro-print-page {
          display: flex;
          flex-direction: column;
          gap: 5mm;
          page-break-after: always;
        }
        .pro-print-page:last-child {
          page-break-after: auto;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
          Show Feedback QR
        </label>
        <span style={{ fontSize: "12px", color: "#666", background: "#fff", padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}>
          A4 Portrait · 4 cards/page · 9×6cm · Front+Back
        </span>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div style={{ background: "#f5f5f5", padding: "8mm" }}>
        {pages.map((page, pi) => (
          <div key={`page-${pi}`} className="pro-print-page" style={{ marginBottom: pi < pages.length - 1 ? "10mm" : 0 }}>
            {page.map(p => (
              <div key={p.id} className="pair-row">
                <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                <BackCard  p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
