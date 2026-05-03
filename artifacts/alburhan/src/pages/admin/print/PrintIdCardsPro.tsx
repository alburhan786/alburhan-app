import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const PROD_DOMAIN = "https://alburhantravels.com";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; busNumber?: string; roomNumber?: string; seatNumber?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    groupLeader?: string;
    makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string; googleMapsLink?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string; googleMapsLink?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string; googleMapsLink?: string };
  };
}

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const W = "95mm";
const H = "60mm";

function buildQrData(p: Pilgrim, group: Group, phone: string, phoneSaudi: string): string {
  const lines = [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName} (${group.year})`,
  ];
  if (p.mobileIndia) lines.push(`Mobile (India): ${p.mobileIndia}`);
  if (p.mobileSaudi) lines.push(`Mobile (Saudi): ${p.mobileSaudi}`);
  if (group.hotels?.aziziah?.name) lines.push(`Hotel Makkah 1: ${group.hotels.aziziah.name}`);
  if (group.hotels?.makkah?.name) lines.push(`Hotel Makkah 2: ${group.hotels.makkah.name}`);
  if (group.hotels?.madinah?.name) lines.push(`Hotel Madinah: ${group.hotels.madinah.name}`);
  if (p.roomNumber) lines.push(`Room: ${p.roomNumber}`);
  if (p.busNumber) lines.push(`Bus: ${p.busNumber}`);
  if (p.seatNumber) lines.push(`Seat: ${p.seatNumber}`);
  if (group.hotels?.groupLeader) lines.push(`Group Leader: ${group.hotels.groupLeader}`);
  lines.push(`Emergency (Saudi): ${phoneSaudi}`);
  lines.push(`Emergency (India): ${phone}`);
  return lines.join("\n");
}

function BulletRow({ label, value, badge }: { label: string; value?: string; badge?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", minHeight: "4.5mm" }}>
      <span style={{
        width: "3mm", height: "3mm", borderRadius: "50%",
        background: GOLD, flexShrink: 0, display: "inline-block",
      }} />
      <span style={{ fontSize: "4.5pt", color: "#777", textTransform: "uppercase", letterSpacing: "0.3px", minWidth: "13mm", flexShrink: 0 }}>
        {label}
      </span>
      {badge ? (
        <span style={{
          background: DARK, color: GOLD, fontSize: "5pt", fontWeight: 900,
          padding: "0.3mm 1.5mm", borderRadius: "3px", lineHeight: 1.4,
        }}>
          {value || "—"}
        </span>
      ) : (
        <span style={{ fontSize: "5pt", fontWeight: 800, color: DARK, lineHeight: 1.3 }}>
          {value || ""}
        </span>
      )}
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

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .pro-card {
          width: ${W}; height: ${H};
          border: 1.5px solid #aaa; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: Arial, sans-serif;
          background: #fff; position: relative; display: flex; flex-direction: column;
        }
        .pro-cards-row { display: flex; gap: 5mm; justify-content: center; margin-bottom: 3mm; }
        .pro-customer-block { page-break-inside: avoid; }
        .pro-page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
          Show Feedback QR
        </label>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div style={{ background: "#fff", padding: "4mm" }}>
        {pages.map((page, pi) => (
          <div key={pi} className={`pro-customer-block${pi < pages.length - 1 ? " pro-page-break" : ""}`} style={{ marginBottom: "4mm" }}>

            {/* ══ FRONT FACES ══ */}
            <div className="pro-cards-row">
              {page.map(p => {
                const serial = String(p.serialNumber).padStart(3, "0");
                const barcodeVal = p.passportNumber || `HAJ${serial}`;
                return (
                  <div key={`f-${p.id}`} className="pro-card">

                    {/* ── Header bar ── */}
                    <div style={{
                      background: DARK, display: "flex", alignItems: "center",
                      justifyContent: "space-between", padding: "1.5mm 3mm",
                      flexShrink: 0, minHeight: "9mm",
                    }}>
                      <div>
                        <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.2 }}>
                          {company.name}
                        </div>
                        <div style={{ fontSize: "6pt", fontWeight: 900, color: GOLD, letterSpacing: "0.3px", lineHeight: 1.2 }}>
                          📞 9893989786 &nbsp;|&nbsp; 9893225590
                        </div>
                      </div>
                      <span style={{ fontSize: "4pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", textTransform: "uppercase", background: "rgba(255,255,255,0.1)", padding: "0.5mm 1.5mm", borderRadius: "2px", flexShrink: 0 }}>
                        Hajj Pilgrim
                      </span>
                    </div>
                    {/* ── Pilgrim name at top ── */}
                    <div style={{
                      background: "#f0f7f2", borderBottom: `1.5px solid ${GOLD}`,
                      padding: "0.8mm 3mm", flexShrink: 0, textAlign: "center",
                    }}>
                      <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, letterSpacing: "0.3px" }}>
                        {p.fullName}
                      </div>
                    </div>

                    {/* ── Body row ── */}
                    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

                      {/* Left sidebar — photo prominent */}
                      <div style={{
                        width: "28mm", flexShrink: 0, background: "#f0f7f2",
                        display: "flex", flexDirection: "column", alignItems: "center",
                        padding: "1.5mm 1.5mm 1mm", gap: "1mm",
                        borderRight: `1.5px solid ${GOLD}`,
                      }}>
                        {/* Logo */}
                        {company.logoUrl
                          ? <img src={company.logoUrl} alt="" style={{ width: "8mm", height: "8mm", objectFit: "contain" }} />
                          : <div style={{ width: "8mm", height: "8mm", background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "5pt" }}>{company.nameShort.slice(0, 1)}</div>
                        }
                        {/* Photo — passport portrait, face centred */}
                        {p.photoUrl ? (
                          <img
                            src={`${API}${p.photoUrl}`}
                            alt=""
                            crossOrigin="anonymous"
                            style={{
                              width: "24mm", height: "28mm",
                              objectFit: "cover", objectPosition: "top center",
                              border: `2px solid ${GOLD}`, borderRadius: "2px", display: "block",
                            }}
                          />
                        ) : (
                          <div style={{
                            width: "24mm", height: "28mm", background: "#e0e8e4",
                            border: `2px solid ${GOLD}`, borderRadius: "2px",
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            fontSize: "4pt", color: "#888", fontWeight: 700, gap: "1mm",
                          }}>
                            <div style={{ fontSize: "15pt", color: GOLD }}>👤</div>
                            <div>PHOTO</div>
                          </div>
                        )}
                        {/* Serial under photo */}
                        <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, textAlign: "center" }}>#{serial}</div>
                      </div>

                      {/* Right content */}
                      <div style={{ flex: 1, padding: "1.5mm 2.5mm 1mm 2.5mm", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
                        {/* Serial + Flag */}
                        <div style={{ display: "flex", alignItems: "center", gap: "3mm", marginBottom: "1mm" }}>
                          <div style={{
                            fontSize: "17pt", fontWeight: 900, color: GOLD,
                            lineHeight: 1, letterSpacing: "0.5px",
                            fontFamily: "'Arial Black', Arial, sans-serif",
                          }}>
                            NO: {serial}
                          </div>
                          <span style={{ fontSize: "26pt", lineHeight: 1 }}>🇮🇳</span>
                        </div>
                        {/* Name */}
                        <div style={{
                          fontSize: "7pt", fontWeight: 900, color: DARK,
                          textTransform: "uppercase", lineHeight: 1.2,
                          wordBreak: "break-word", marginBottom: "1mm",
                        }}>
                          {p.fullName}
                        </div>

                        {/* Bullet list */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3mm" }}>
                          <BulletRow label="Passport No." value={p.passportNumber} />
                          <BulletRow label="Bus No." value={p.busNumber} />
                          <BulletRow label="Maktab" value={group.maktabNumber} badge />
                          <BulletRow label="India Mobile" value={p.mobileIndia} />
                          <BulletRow label="Saudi Mobile" value={p.mobileSaudi} />
                        </div>
                      </div>
                    </div>

                    {/* ── Footer strip ── */}
                    <div style={{ flexShrink: 0 }}>
                      {/* Name — dark band */}
                      <div style={{
                        background: DARK, textAlign: "center", padding: "0.8mm 2mm",
                        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                      } as React.CSSProperties}>
                        <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", lineHeight: 1.2, letterSpacing: "0.3px" }}>
                          {p.fullName}
                        </div>
                      </div>
                      {/* Address + big phone — dark band */}
                      <div style={{
                        background: DARK, textAlign: "center", padding: "0.7mm 2mm",
                        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                      } as React.CSSProperties}>
                        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.3, letterSpacing: "0.1px" }}>
                          {company.address}
                        </div>
                        <div style={{ fontSize: "8pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.3 }}>
                          📞 {company.phone}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
              {Array.from({ length: 2 - page.length }).map((_, i) => (
                <div key={`ph-f-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
              ))}
            </div>

            {/* ══ BACK FACES ══ */}
            <div className="pro-cards-row">
              {page.map(p => {
                const serial = String(p.serialNumber).padStart(3, "0");
                return (
                  <div key={`b-${p.id}`} className="pro-card">

                    {/* ── Header bar ── */}
                    <div style={{
                      background: DARK, padding: "1.5mm 3mm", flexShrink: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      minHeight: "9mm",
                    }}>
                      <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.2 }}>
                        {company.name}
                      </div>
                      <div style={{ fontSize: "6pt", fontWeight: 900, color: GOLD, letterSpacing: "0.3px", lineHeight: 1.2 }}>
                        📞 9893989786 &nbsp;|&nbsp; 9893225590
                      </div>
                    </div>
                    {/* ── Pilgrim name at top (back) ── */}
                    <div style={{
                      background: "#f0f7f2", borderBottom: `1.5px solid ${GOLD}`,
                      padding: "0.8mm 3mm", flexShrink: 0, textAlign: "center",
                    }}>
                      <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, letterSpacing: "0.3px" }}>
                        {p.fullName}
                      </div>
                    </div>

                    {/* ── Body ── */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "2mm 3mm 1mm", position: "relative", overflow: "hidden" }}>

                      {/* Two-column: maktab/bus | emergency */}
                      <div style={{ display: "flex", gap: "3mm", marginBottom: "1.5mm" }}>
                        {/* Left col */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Maktab No.</div>
                          <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>
                            {group.maktabNumber || "—"}
                          </div>
                          <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginTop: "1mm" }}>Bus No.</div>
                          <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK }}>{p.busNumber || "—"}</div>
                        </div>
                        {/* Right col */}
                        <div style={{ flex: 1.2 }}>
                          <div style={{ fontSize: "4pt", fontWeight: 800, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency</div>
                          <div style={{ fontSize: "4pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.2 }}>Saudi</div>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{company.phoneSaudi}</div>
                          <div style={{ fontSize: "4pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.2, marginTop: "0.5mm" }}>India</div>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{company.phone}</div>
                        </div>
                      </div>

                      {/* Hotels */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6mm" }}>
                        <div>
                          <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Makkah 1</div>
                          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{group.hotels?.aziziah?.name || "—"}</div>
                          {group.hotels?.aziziah?.nameAr && <div style={{ fontSize: "5pt", fontWeight: 700, color: DARK, lineHeight: 1.1, direction: "rtl", textAlign: "right" }}>{group.hotels.aziziah.nameAr}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Makkah 2</div>
                          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{group.hotels?.makkah?.name || "—"}</div>
                          {group.hotels?.makkah?.nameAr && <div style={{ fontSize: "5pt", fontWeight: 700, color: DARK, lineHeight: 1.1, direction: "rtl", textAlign: "right" }}>{group.hotels.makkah.nameAr}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Madinah</div>
                          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{group.hotels?.madinah?.name || "—"}</div>
                          {group.hotels?.madinah?.nameAr && <div style={{ fontSize: "5pt", fontWeight: 700, color: DARK, lineHeight: 1.1, direction: "rtl", textAlign: "right" }}>{group.hotels.madinah.nameAr}</div>}
                        </div>
                      </div>

                      {/* Bottom-right: feedback QR */}
                      {showFeedbackQr ? (
                        <div style={{ position: "absolute", bottom: "1mm", right: "2mm", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8mm" }}>
                          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2px solid ${DARK}` }}>
                            <QRCodeSVG
                              value={p.mobileIndia && bookingMap[p.mobileIndia]
                                ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                                : `${PROD_DOMAIN}/feedback`}
                              size={38} level="M" fgColor={DARK}
                            />
                          </div>
                          <div style={{ background: DARK, color: "#fff", fontSize: "3pt", fontWeight: 900, letterSpacing: "0.8px", padding: "0.4mm 2mm", borderRadius: "8px", textTransform: "uppercase" }}>Rate Trip</div>
                        </div>
                      ) : null}

                      {/* Pilgrim name */}
                      <div style={{ marginTop: "auto", paddingTop: "1mm" }}>
                        <div style={{ fontSize: "3.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim</div>
                        <div style={{
                          fontSize: "11pt", fontWeight: 900, color: DARK,
                          textTransform: "uppercase", lineHeight: 1.15,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: "calc(100% - 14mm)",
                        }}>
                          {p.fullName}
                        </div>
                      </div>
                    </div>

                    {/* ── Footer ── */}
                    <div style={{ flexShrink: 0 }}>
                      {/* Name — dark band */}
                      <div style={{
                        background: DARK, textAlign: "center", padding: "0.8mm 3mm",
                        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                      } as React.CSSProperties}>
                        <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", lineHeight: 1.2, letterSpacing: "0.3px" }}>
                          {p.fullName}
                        </div>
                      </div>
                      {/* Address + big phone — dark band */}
                      <div style={{
                        background: DARK, textAlign: "center", padding: "0.7mm 3mm",
                        WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                      } as React.CSSProperties}>
                        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.3, letterSpacing: "0.1px" }}>
                          {company.address}
                        </div>
                        <div style={{ fontSize: "8pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.3 }}>
                          📞 {company.phone}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
              {Array.from({ length: 2 - page.length }).map((_, i) => (
                <div key={`ph-b-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
              ))}
            </div>

          </div>
        ))}
      </div>
    </>
  );
}
