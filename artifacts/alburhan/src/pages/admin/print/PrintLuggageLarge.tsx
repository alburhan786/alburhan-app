import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";
import { mashariqLogoBase64 as mashariqLogoUrl } from "@/assets/mashariq-logo-data";
import { almasiahLogoBase64 as almasiahLogoUrl } from "@/assets/almasiah-logo-data";

const API = import.meta.env.VITE_API_URL || "";

const SVC_CENTER = "612";
const SVC_PHONE_1 = "0547090786";
const SVC_PHONE_2 = "0568780786";
const SVC_NAME_EN = "Mashariq Al Masiah Company for Pilgrim Services";
const SVC_NAME_AR = "مشارق الماسية لخدمات الحجاج والمعتمرين";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  passportNumber?: string; busNumber?: string;
  mobileIndia?: string; mobileSaudi?: string; city?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    groupLeader?: string;
    makkah?: { name?: string; address?: string; nameAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string };
  };
}

const DARK  = "#0d5040";
const GOLD  = "#C9A84C";
const RED   = "#CC0000";

const GROUP_COLORS: Record<string, string> = {
  A: "#1a7a5e", B: "#2563EB", C: "#D97706", D: "#DC2626",
};
function getGroupColor(n: string) {
  return GROUP_COLORS[n.trim().slice(-1).toUpperCase()] || "#6B7280";
}

function buildQrData(p: Pilgrim, group: Group, phone: string): string {
  const lines = [
    `Name: ${p.fullName}`,
    `PP: ${p.passportNumber || "N/A"}`,
    `Bus: ${p.busNumber || "N/A"} | Svc: ${group.maktabNumber || "N/A"}`,
  ];
  if (p.mobileIndia) lines.push(`IN: ${p.mobileIndia}`);
  if (p.mobileSaudi) lines.push(`SA: ${p.mobileSaudi}`);
  lines.push(`Emer: ${phone}`);
  return lines.join("\n");
}

export default function PrintLuggageLarge() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage-large");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const groupColor = getGroupColor(group.groupName);
  const groupLabel = group.groupName.toUpperCase();

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .ll-sticker {
          width: 180mm; height: 220mm;
          border: 2px solid ${DARK}; border-radius: 8px; overflow: hidden;
          page-break-after: always; page-break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          margin: 0 auto 5mm;
          display: flex; flex-direction: column;
        }
        .ll-sticker:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div>
      {pilgrims.map(p => {
        const serial = String(p.serialNumber).padStart(3, "0");
        const barcodeVal = p.passportNumber || `H${serial}`;
        return (
        <div key={p.id} className="ll-sticker">

          {/* ── TOP HEADER: logos + service centre info ── */}
          <div style={{
            background: DARK, flexShrink: 0,
            display: "flex", alignItems: "stretch",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          } as React.CSSProperties}>

            {/* Left logo — Mashariq */}
            <div style={{ width: "48mm", flexShrink: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "3mm 4mm", borderRight: `2px solid ${DARK}` }}>
              <img src={mashariqLogoUrl} alt="Mashariq" style={{ maxHeight: "28mm", maxWidth: "100%", objectFit: "contain" }} />
            </div>

            {/* Centre — service info */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2mm 3mm", textAlign: "center" }}>
              <div style={{ fontSize: "7pt", color: GOLD, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 800, lineHeight: 1 }}>
                SERVICE CENTER NO.
              </div>
              <div style={{
                fontSize: "48pt", fontWeight: 900, color: "#fff", lineHeight: 0.95, letterSpacing: "3px",
                fontFamily: "'Arial Black', Arial, sans-serif",
                WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
              } as React.CSSProperties}>
                {SVC_CENTER}
              </div>
              <div style={{ fontSize: "6pt", fontWeight: 700, color: GOLD, lineHeight: 1.2, marginTop: "1mm" }}>
                {SVC_NAME_EN}
              </div>
              <div style={{ fontSize: "11pt", fontWeight: 900, color: "#fff", lineHeight: 1.3, direction: "rtl", fontFamily: "Arial, sans-serif", marginTop: "1mm" }}>
                {SVC_NAME_AR}
              </div>
              <div style={{ display: "flex", gap: "3mm", marginTop: "2mm" }}>
                <div style={{ background: GOLD, borderRadius: "12px", padding: "1.5mm 4mm" }}>
                  <span style={{ fontSize: "11pt", fontWeight: 900, color: DARK, letterSpacing: "0.5px", fontFamily: "monospace" }}>{SVC_PHONE_1}</span>
                </div>
                <div style={{ background: GOLD, borderRadius: "12px", padding: "1.5mm 4mm" }}>
                  <span style={{ fontSize: "11pt", fontWeight: 900, color: DARK, letterSpacing: "0.5px", fontFamily: "monospace" }}>{SVC_PHONE_2}</span>
                </div>
              </div>
            </div>

            {/* Right logo — Almasiah */}
            <div style={{ width: "48mm", flexShrink: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "3mm 4mm", borderLeft: `2px solid ${DARK}` }}>
              <img src={almasiahLogoUrl} alt="Almasiah" style={{ maxHeight: "28mm", maxWidth: "100%", objectFit: "contain" }} />
            </div>
          </div>

          {/* ── Group / Bus bar ── */}
          <div style={{
            background: groupColor, flexShrink: 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "1.5mm 6mm",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          } as React.CSSProperties}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: "10pt", letterSpacing: "1px" }}>
              GROUP: {groupLabel} — HAJJ {group.year}
            </span>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: "12pt" }}>
              #{serial}
            </span>
          </div>

          {/* ── Body ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "3mm 6mm", gap: "2.5mm" }}>

            {/* Photo + Name + Flag row */}
            <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
              <div style={{ flexShrink: 0 }}>
                {p.photoUrl ? (
                  <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "55mm", height: "55mm", objectFit: "cover", borderRadius: "50%", border: `4px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }} />
                ) : (
                  <div style={{ width: "55mm", height: "55mm", background: "#f0fdf4", borderRadius: "50%", border: `4px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9pt", color: "#aaa" }}>PHOTO</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5mm" }}>PILGRIM NAME</div>
                <div style={{ fontSize: "22pt", fontWeight: 900, color: DARK, lineHeight: 1.1, wordBreak: "break-word", textTransform: "uppercase" }}>
                  {p.fullName}
                </div>
                <div style={{ display: "flex", gap: "3mm", flexWrap: "wrap", marginTop: "2mm" }}>
                  <div style={{ background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "1mm 3mm", textAlign: "center" }}>
                    <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
                    <div style={{ fontSize: "11pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "1px", color: DARK }}>{p.passportNumber || "—"}</div>
                  </div>
                  <div style={{ background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "1mm 3mm", textAlign: "center" }}>
                    <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>SERVICE CTR</div>
                    <div style={{ fontSize: "11pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                  </div>
                </div>
              </div>
              {/* Al Burhan logo + Indian flag */}
              <div style={{ flexShrink: 0, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "2mm" }}>
                {company.logoUrl
                  ? <img src={company.logoUrl} alt="" style={{ height: "80pt", objectFit: "contain" }} />
                  : <div style={{ width: "80pt", height: "80pt", background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "14pt" }}>{company.nameShort.slice(0, 1)}</div>
                }
                <div style={{ fontSize: "80pt", lineHeight: 1 }}>🇮🇳</div>
              </div>
            </div>

            {/* Mobile numbers */}
            <div style={{ display: "flex", gap: "3mm" }}>
              <div style={{ flex: 1, background: "#fef9c3", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1.5mm 3mm" }}>
                <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>🇮🇳 India Mobile</div>
                <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK }}>{p.mobileIndia || "—"}</div>
              </div>
              <div style={{ flex: 1, background: "#fef9c3", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1.5mm 3mm" }}>
                <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>🇸🇦 Saudi Mobile</div>
                <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK }}>{p.mobileSaudi || "—"}</div>
              </div>
              {p.city && (
                <div style={{ flex: 1, background: "#fef9c3", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1.5mm 3mm" }}>
                  <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>City</div>
                  <div style={{ fontSize: "10pt", fontWeight: 900, color: DARK }}>{p.city}</div>
                </div>
              )}
            </div>

            {/* Hotels — bigger names */}
            <div style={{ display: "flex", gap: "2mm" }}>
              {([
                ["HOTEL MAKKAH 1", group.hotels?.aziziah],
                ["HOTEL MAKKAH 2", group.hotels?.makkah],
                ["HOTEL MADINAH",  group.hotels?.madinah],
              ] as [string, { name?: string; address?: string; nameAr?: string } | undefined][]).map(([lbl, h]) => (
                <div key={lbl} style={{ flex: 1, background: "#fefce8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "2mm 3mm" }}>
                  <div style={{ fontSize: "5.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{lbl}</div>
                  <div style={{ fontWeight: 900, fontSize: "10pt", color: DARK, lineHeight: 1.2 }}>{h?.name || "—"}</div>
                  {h?.nameAr && <div style={{ fontWeight: 900, fontSize: "10pt", color: DARK, lineHeight: 1.2, direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif" }}>{h.nameAr}</div>}
                  {h?.address && <div style={{ fontSize: "5pt", color: "#666", lineHeight: 1.2, marginTop: "0.5mm" }}>{h.address}</div>}
                </div>
              ))}
            </div>

            {/* QR + Barcode + Lost/Found */}
            <div style={{ display: "flex", alignItems: "center", gap: "4mm", marginTop: "auto", paddingTop: "2mm", borderTop: `1px dashed ${DARK}40` }}>
              <div style={{ background: "#fff", padding: "3px", borderRadius: "4px", border: `2px solid ${DARK}` }}>
                <QRCodeSVG value={buildQrData(p, group, company.phone)} size={110} level="L" fgColor={DARK} />
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <Barcode value={barcodeVal} height={55} width={2.2} displayValue fontSize={9} />
              </div>

              {/* IN CASE OF LOST/FOUND — red box with Al Burhan + phones */}
              <div style={{
                background: RED, borderRadius: "6px", padding: "3mm 5mm", textAlign: "center",
                WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                minWidth: "52mm", flexShrink: 0,
              } as React.CSSProperties}>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: "9pt", textTransform: "uppercase", lineHeight: 1.3, letterSpacing: "0.5px" }}>IN CASE OF LOST / FOUND</div>
                <div style={{ color: "#FFD700", fontWeight: 900, fontSize: "9pt", textTransform: "uppercase", lineHeight: 1.3, letterSpacing: "0.5px" }}>KINDLY CONTACT</div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: "12pt", textTransform: "uppercase", lineHeight: 1.3, letterSpacing: "1px", marginTop: "1mm" }}>AL BURHAN</div>
                <div style={{ color: "#FFD700", fontWeight: 900, fontSize: "16pt", lineHeight: 1.4, fontFamily: "monospace", letterSpacing: "0.5px" }}>{SVC_PHONE_1}</div>
                <div style={{ color: "#FFD700", fontWeight: 900, fontSize: "16pt", lineHeight: 1.4, fontFamily: "monospace", letterSpacing: "0.5px" }}>{SVC_PHONE_2}</div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            background: DARK, flexShrink: 0,
            textAlign: "center", padding: "1.5mm 4mm",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          } as React.CSSProperties}>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", lineHeight: 1.2, letterSpacing: "0.3px" }}>
              {p.fullName}
            </div>
            <div style={{ fontSize: "7pt", fontWeight: 700, color: GOLD, lineHeight: 1.2 }}>
              {company.name} | {company.phone}
            </div>
          </div>

        </div>
        );
      })}
      </div>
    </>
  );
}
