import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";
import { mashariqLogoBase64 as mashariqLogoUrl } from "@/assets/mashariq-logo-data";
import { almasiahLogoBase64 as almasiahLogoUrl } from "@/assets/almasiah-logo-data";

const API  = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  passportNumber?: string; busNumber?: string;
  mobileIndia?: string; mobileSaudi?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const DARK  = "#0d5040";
const GREEN = "#1a7a5e";
const GOLD  = "#C9A84C";
const RED   = "#CC0000";

const GROUP_COLORS: Record<string, string> = {
  A: "#1a7a5e", B: "#2563EB", C: "#D97706", D: "#DC2626",
};
function getGroupColor(groupName: string): string {
  const last = groupName.trim().slice(-1).toUpperCase();
  return GROUP_COLORS[last] || "#6B7280";
}

function buildQrData(p: Pilgrim, group: Group, phone: string): string {
  const lines = [
    `Name: ${p.fullName}`,
    `PP: ${p.passportNumber || "N/A"}`,
    `Bus: ${p.busNumber || "N/A"} | Svc: ${group.maktabNumber || "N/A"}`,
  ];
  if (p.mobileIndia)  lines.push(`IN: ${p.mobileIndia}`);
  if (p.mobileSaudi)  lines.push(`SA: ${p.mobileSaudi}`);
  lines.push(`Emer: ${phone}`);
  return lines.join("\n");
}

/* ── SVG SNOWFLAKE / GEOMETRIC PATTERN (like the Almasiah reference) ── */
function SnowflakeSVG({ size = 120, color = "#1a7a5e", opacity = 0.12 }: { size?: number; color?: string; opacity?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.46;
  const arm = (angleDeg: number, len: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return `M${cx},${cy} L${cx + Math.cos(a) * len},${cy + Math.sin(a) * len}`;
  };
  const branch = (angleDeg: number, dist: number, bLen: number, bAngle: number) => {
    const a = (angleDeg * Math.PI) / 180;
    const bx = cx + Math.cos(a) * dist, by = cy + Math.sin(a) * dist;
    const b1 = ((angleDeg + bAngle) * Math.PI) / 180;
    const b2 = ((angleDeg - bAngle) * Math.PI) / 180;
    return [
      `M${bx},${by} L${bx + Math.cos(b1) * bLen},${by + Math.sin(b1) * bLen}`,
      `M${bx},${by} L${bx + Math.cos(b2) * bLen},${by + Math.sin(b2) * bLen}`,
    ].join(" ");
  };
  const arms = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <g stroke={color} strokeWidth={size * 0.028} strokeLinecap="round" opacity={opacity} fill="none">
        {arms.map(a => (
          <g key={a}>
            <path d={arm(a, r)} />
            <path d={branch(a, r * 0.35, r * 0.22, a + 90)} />
            <path d={branch(a, r * 0.6, r * 0.16, a + 90)} />
            <path d={branch(a, r * 0.82, r * 0.11, a + 90)} />
          </g>
        ))}
        <circle cx={cx} cy={cy} r={size * 0.04} fill={color} opacity={opacity} />
        {arms.map(a => {
          const rad = (a * Math.PI) / 180;
          const tx = cx + Math.cos(rad) * r, ty = cy + Math.sin(rad) * r;
          return <circle key={`tip-${a}`} cx={tx} cy={ty} r={size * 0.025} fill={color} opacity={opacity} />;
        })}
      </g>
    </svg>
  );
}

/* ── BACK STICKER (100×100mm) — exact Almasiah layout ── */
function LuggageStickerBack({
  p, group, company,
}: {
  p: Pilgrim; group: Group; company: ReturnType<typeof getCompanyById>;
}) {
  return (
    <div className="sq-sticker">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>

        {/* ══ TOP: logo + branding (no snowflake) ══ */}
        <div style={{
          display: "flex", alignItems: "stretch",
          borderBottom: `2px solid ${GREEN}`,
          flexShrink: 0,
          minHeight: "28mm",
        }}>
          {/* Branding — full width */}
          <div style={{
            flex: 1, padding: "2mm 3mm 2mm 3mm",
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            {/* Both logos side by side */}
            <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "1.5mm" }}>
              <img src={mashariqLogoUrl} alt="mashariq" style={{ height: "10mm", objectFit: "contain", flex: 1 }} />
              <div style={{ width: "0.5mm", background: "#ddd", alignSelf: "stretch" }} />
              <img src={almasiahLogoUrl} alt="almasiah" style={{ height: "10mm", objectFit: "contain", flex: 1 }} />
            </div>
            {/* Arabic company name — BIG & BOLD */}
            <div style={{
              fontFamily: "Arial, sans-serif", direction: "rtl", textAlign: "right",
              fontSize: "13pt", color: GREEN, fontWeight: 900, lineHeight: 1.25,
            }}>
              شركة مشارق الماسية لخدمات الحجاج
            </div>
            {/* English company name — bold */}
            <div style={{ fontSize: "6.5pt", color: "#111", fontWeight: 900, lineHeight: 1.4 }}>
              Mashariq Almasiah Company for Pilgrim Services
            </div>
          </div>
        </div>

        {/* ══ MIDDLE: service center label + number box + flag ══ */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Faint snowflake background pattern */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 0,
          }}>
            <SnowflakeSVG size={160} color={GREEN} opacity={0.07} />
          </div>

          <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Service center label — right aligned like reference */}
            <div style={{
              padding: "1.5mm 3mm 0.5mm",
              textAlign: "right",
            }}>
              <div style={{
                fontFamily: "Arial, sans-serif", direction: "rtl",
                fontSize: "11pt", fontWeight: 900, color: "#111", lineHeight: 1.2,
              }}>
                مركز تقديم الخدمة
              </div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: "#222" }}>
                Service Center No &nbsp;<span style={{ fontFamily: "Arial", direction: "rtl" }}>رقم</span>
              </div>
            </div>

            {/* Number box (left) + Flag box (right) */}
            <div style={{ display: "flex", gap: "3mm", padding: "1mm 3mm 1.5mm", alignItems: "center" }}>
              {/* Service Center No — big green-bordered box */}
              <div style={{
                flex: 1,
                border: `3px solid ${GREEN}`,
                borderRadius: "4px",
                padding: "2mm 2mm",
                textAlign: "center",
                background: "#fff",
              }}>
                <div style={{
                  fontSize: "38pt", fontWeight: 900, color: "#000",
                  lineHeight: 1, fontFamily: "'Courier New', monospace",
                  letterSpacing: "-1px",
                }}>
                  {group.maktabNumber || "—"}
                </div>
              </div>

              {/* Indian flag — bordered box like reference */}
              <div style={{
                width: "28mm",
                border: `2.5px solid ${GREEN}`,
                borderRadius: "4px",
                padding: "1.5mm",
                textAlign: "center",
                background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <div style={{ fontSize: "28pt", lineHeight: 1 }}>🇮🇳</div>
              </div>
            </div>

            {/* Bilingual rows — India / الهند and Hajj / حج */}
            <div style={{ margin: "0 3mm", border: `1.5px solid #ccc`, borderRadius: "3px", overflow: "hidden" }}>
              <div style={{
                display: "flex", borderBottom: "1.5px solid #ccc",
                background: "#fafafa",
              }}>
                <div style={{ flex: 1, padding: "1.5mm 2.5mm", fontSize: "9pt", fontWeight: 900, color: "#111" }}>India</div>
                <div style={{ width: "1px", background: "#ccc" }} />
                <div style={{
                  flex: 1, padding: "1.5mm 2.5mm", fontSize: "9.5pt", fontWeight: 900,
                  color: "#111", direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif",
                }}>الهند</div>
              </div>
              <div style={{ display: "flex", background: "#fff" }}>
                <div style={{ flex: 1, padding: "1.5mm 2.5mm" }}>
                  <div style={{ fontSize: "9pt", fontWeight: 900, color: GREEN }}>Hajj {group.year}</div>
                  <div style={{ fontSize: "6pt", fontWeight: 800, color: GREEN }}>1447 Hijri</div>
                </div>
                <div style={{ width: "1px", background: "#ccc" }} />
                <div style={{ flex: 1, padding: "1.5mm 2.5mm", textAlign: "right" }}>
                  <div style={{ fontSize: "9.5pt", fontWeight: 900, color: GREEN, fontFamily: "Arial, sans-serif" }}>حج 1447</div>
                  <div style={{ fontSize: "6pt", fontWeight: 800, color: GREEN, fontFamily: "Arial, sans-serif" }}>هجري</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ BOTTOM GREEN: Call Center strip (like reference) ══ */}
        <div style={{ background: GREEN, padding: "2mm 3mm 1.5mm", flexShrink: 0 }}>
          {/* Label row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "1mm",
          }}>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: "#fff", letterSpacing: "0.3px" }}>
              Call Center
            </div>
            <div style={{ fontSize: "6.5pt", fontWeight: 900, color: "#fff", fontFamily: "Arial, sans-serif" }}>
              مركزالتواصل
            </div>
          </div>
          {/* Two white phone boxes: toll-free + saudi */}
          <div style={{ display: "flex", gap: "2mm" }}>
            {/* Toll-free box (like "8006120033" in reference) */}
            <div style={{
              flex: 1, background: "#fff", borderRadius: "3px",
              padding: "1.2mm 2mm", display: "flex", alignItems: "center", gap: "1.5mm",
            }}>
              <div style={{ fontSize: "10pt", color: GREEN, flexShrink: 0 }}>🎧</div>
              <div>
                <div style={{ fontSize: "4pt", color: "#888", fontWeight: 700, textTransform: "uppercase" }}>Toll Free 🇸🇦</div>
                <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, letterSpacing: "0.5px", lineHeight: 1.1, fontFamily: "monospace" }}>8006120033</div>
              </div>
            </div>
            {/* Saudi number box */}
            <div style={{
              flex: 1, background: "#fff", borderRadius: "3px",
              padding: "1.2mm 2mm", display: "flex", alignItems: "center", gap: "1.5mm",
            }}>
              <div style={{ fontSize: "10pt", color: GREEN, flexShrink: 0 }}>🎧</div>
              <div>
                <div style={{ fontSize: "4pt", color: "#888", fontWeight: 700, textTransform: "uppercase" }}>Saudi 🇸🇦</div>
                <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.3px", lineHeight: 1.2 }}>{company.phoneSaudi}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ FOOTER WHITE: website + address + email (like almasiah bottom) ══ */}
        <div style={{
          background: "#f7faf8",
          borderTop: `1.5px solid ${GREEN}`,
          padding: "1.2mm 3mm",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill={GREEN} />
              <circle cx="12" cy="16.2" r="1.9" fill="#fff" />
              <rect x="11" y="17.7" width="2" height="2.3" rx="1" fill="#fff" />
            </svg>
            <div style={{ fontSize: "8.5pt", fontWeight: 900, color: GREEN, letterSpacing: "0.3px", lineHeight: 1 }}>{company.website}</div>
          </div>
          {/* WhatsApp — right corner, big & bold */}
          <div style={{
            display: "flex", alignItems: "center", gap: "1.5mm",
            background: "#25D366", borderRadius: "4px", padding: "1.5mm 2.5mm",
          }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="#fff">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.126 1.528 5.862L.057 23.885l6.194-1.624A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.893a9.866 9.866 0 01-5.031-1.378l-.361-.214-3.735.979 1-3.635-.235-.374A9.861 9.861 0 012.107 12C2.107 6.531 6.531 2.107 12 2.107S21.893 6.531 21.893 12 17.469 21.893 12 21.893z"/>
            </svg>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff", letterSpacing: "0.3px", lineHeight: 1 }}>+91 98939 89786</div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── MAIN EXPORT ── */
export default function PrintLuggageSquare() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage-square");
  const groupId = params?.groupId || "";
  const [group, setGroup]     = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const [view, setView]       = useState<"front" | "back" | "both">("both");
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

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 4) pages.push(pilgrims.slice(i, i + 4));

  const showFront = view === "front" || view === "both";
  const showBack  = view === "back"  || view === "both";

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .sq-sticker {
          width: 96mm; height: 135mm;
          border: 1.5px solid ${DARK}; border-radius: 5px; overflow: hidden;
          page-break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          flex-shrink: 0;
        }
        .sq-row {
          display: flex; flex-wrap: wrap; gap: 3mm;
          width: 200mm;
          page-break-after: always;
        }
        .sq-row:last-child { page-break-after: auto; }
        .sq-section-label {
          font-family: Arial, sans-serif;
          font-size: 11px; font-weight: 700;
          color: #555; letter-spacing: 1px;
          text-transform: uppercase;
          padding: 6px 12px;
          background: #f3f4f6;
          border-left: 4px solid ${DARK};
          margin: 8px 0 4px;
        }
      `}</style>

      {/* ── TOOLBAR ── */}
      <div className="no-print" style={{
        padding: "12px 16px", background: "#fef3c7",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "8px", flexWrap: "wrap",
      }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* View toggle */}
        {(["front", "back", "both"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", border: "1.5px solid",
            background: view === v ? DARK : "#fff",
            color: view === v ? "#fff" : DARK,
            borderColor: DARK,
          }}>
            {v === "front" ? "🪪 Fronts" : v === "back" ? "🔄 Backs" : "📄 Both"}
          </button>
        ))}

        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          🖨 Print
        </button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 20px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div>

        {/* ══ FRONT STICKERS ══ */}
        {showFront && (
          <>
            <div className="no-print sq-section-label">FRONT SIDE — Print first</div>
            {pages.map((page, pageIdx) => (
              <div key={`front-${pageIdx}`} className="sq-row">
                {page.map(p => {
                  const serialNo = String(p.serialNumber).padStart(3, "0");
                  return (
                    <div key={p.id} className="sq-sticker">
                      <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                        {/* Decorative corner */}
                        <div style={{
                          position: "absolute", top: "-8mm", right: "-6mm",
                          width: "38mm", height: "38mm",
                          background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
                        }} />

                        {/* Header */}
                        <div style={{ position: "relative", zIndex: 1, padding: "2mm 3.5mm 1mm", display: "flex", alignItems: "center", gap: "2mm" }}>
                          <div style={{ fontSize: "32pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
                          {company.logoUrl
                            ? <img src={company.logoUrl} alt="" style={{ height: "10mm", objectFit: "contain", flexShrink: 0 }} />
                            : <div style={{ height: "10mm", width: "10mm", flexShrink: 0, background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "6pt" }}>{company.nameShort[0]}</div>
                          }
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 900, fontSize: "8pt", color: "#1a7a5e", letterSpacing: "0.8px", textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
                            <div style={{ fontWeight: 700, fontSize: "5.5pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase" }}>TOURS &amp; TRAVELS</div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: "20pt", fontWeight: 900, color: "#fff", lineHeight: 1 }}>#{serialNo}</div>
                            <div style={{ fontSize: "5pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
                          </div>
                        </div>

                        {/* Group bar */}
                        <div style={{ background: groupColor, padding: "1mm 3.5mm", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
                          <span style={{ color: "#fff", fontWeight: 800, fontSize: "7.5pt", letterSpacing: "0.8px" }}>GROUP: {groupLabel}</span>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: "7pt" }}>BUS: {p.busNumber || "—"}</span>
                        </div>

                        {/* Body */}
                        <div style={{ position: "relative", zIndex: 1, padding: "1.5mm 3.5mm 1mm", flex: 1, display: "flex", flexDirection: "column" }}>
                          <div style={{ display: "flex", gap: "2.5mm", alignItems: "flex-start", marginBottom: "1mm" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK, lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word" }}>{p.fullName}</div>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {p.photoUrl
                                ? <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "15mm", height: "15mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
                                : <div style={{ width: "15mm", height: "15mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
                              }
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "2mm", marginBottom: "1mm" }}>
                            <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.8mm 2mm", textAlign: "center" }}>
                              <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
                              <div style={{ fontSize: "12pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.5px", color: DARK }}>{p.passportNumber || "—"}</div>
                            </div>
                            <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.8mm 2mm", textAlign: "center" }}>
                              <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>SERVICE CENTER NO</div>
                              <div style={{ fontSize: "10pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.8mm 2mm", marginBottom: "1mm", fontSize: "6.5pt" }}>
                            {[
                              { label: "HOTEL MAKKAH 1", data: group.hotels?.aziziah },
                              { label: "HOTEL MAKKAH 2", data: group.hotels?.makkah },
                              { label: "HOTEL MADINAH",  data: group.hotels?.madinah },
                            ].map(({ label, data }) => (
                              <div key={label}>
                                <div style={{ fontSize: "4.5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
                                <div style={{ fontWeight: 700, color: "#222", fontSize: "6pt" }}>{data?.name || "—"}</div>
                                {data?.nameAr && <div style={{ fontWeight: 700, color: "#222", fontSize: "5.5pt", direction: "rtl", textAlign: "right" }}>{data.nameAr}</div>}
                                {data?.address && <div style={{ fontSize: "4.5pt", color: "#666", lineHeight: 1.2 }}>{data.address}</div>}
                                {data?.addressAr && <div style={{ fontSize: "4pt", color: "#666", lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{data.addressAr}</div>}
                              </div>
                            ))}
                          </div>

                          <div style={{ background: RED, borderRadius: "3px", padding: "1.2mm 3mm", textAlign: "center", marginBottom: "1.5mm" }}>
                            <div style={{ color: "#fff", fontWeight: 900, fontSize: "8pt", textTransform: "uppercase" }}>IN CASE OF LOST / FOUND</div>
                            <div style={{ color: "#fff", fontWeight: 900, fontSize: "7.5pt", textTransform: "uppercase" }}>KINDLY CONTACT</div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "center", gap: "4mm", marginBottom: "1.5mm" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.3mm" }}>🇸🇦 Saudi</div>
                              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK }}>{company.phoneSaudi}</div>
                            </div>
                            <div style={{ width: "0.3mm", background: "#ddd", flexShrink: 0 }} />
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.3mm" }}>🇮🇳 India</div>
                              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK }}>{company.phone}</div>
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "3mm", marginTop: "auto" }}>
                            {/* QR — big + styled */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8mm" }}>
                              <div style={{ background: "#fff", padding: "2.5px", borderRadius: "4px", border: `2.5px solid ${DARK}`, boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
                                <QRCodeSVG value={buildQrData(p, group, company.phone)} size={80} level="L" fgColor={DARK} />
                              </div>
                              <div style={{ background: DARK, color: "#fff", fontSize: "4pt", fontWeight: 900, letterSpacing: "1px", padding: "0.4mm 2.5mm", borderRadius: "8px", textTransform: "uppercase" }}>📱 Scan</div>
                            </div>
                            {/* Barcode — taller */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                              <Barcode value={p.passportNumber || `H${serialNo}`} height={28} width={1.4} fontSize={7} />
                            </div>
                          </div>
                        </div>

                        {/* ── Website + Lock band ── */}
                        <div style={{ position: "relative", zIndex: 2, background: DARK, padding: "2mm 3mm", display: "flex", alignItems: "center", justifyContent: "center", gap: "2.5mm" }}>
                          {/* Padlock icon */}
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill={GOLD} />
                            <circle cx="12" cy="16.2" r="1.9" fill={DARK} />
                            <rect x="11" y="17.7" width="2" height="2.3" rx="1" fill={DARK} />
                          </svg>
                          <div style={{ fontSize: "10.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.6px", lineHeight: 1, textTransform: "lowercase" }}>
                            www.alburhantravels.com
                          </div>
                        </div>

                        <div style={{ position: "relative", zIndex: 2, background: "#FFC107", color: RED, padding: "1.5mm 3mm", fontSize: "8pt", textAlign: "center", fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase" }}>
                          BAGGAGE TAG
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {/* ══ BACK STICKERS ══ */}
        {showBack && (
          <>
            <div className="no-print sq-section-label">BACK SIDE — Flip paper &amp; print</div>
            {pages.map((page, pageIdx) => (
              <div key={`back-${pageIdx}`} className="sq-row">
                {page.map(p => (
                  <LuggageStickerBack key={p.id} p={p} group={group} company={company} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
