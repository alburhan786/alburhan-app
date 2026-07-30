import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadMultiPagePdf, downloadPagesAsPng, downloadPagesAsJpg, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";
import { mashariqLogoBase64 as mashariqLogoUrl } from "@/assets/mashariq-logo-data";
import { almasiahLogoBase64 as almasiahLogoUrl } from "@/assets/almasiah-logo-data";

const API   = import.meta.env.VITE_API_URL || "";
const DARK  = "#0d5040";
const GREEN = "#1a7a5e";
const GOLD  = "#C9A84C";
const RED   = "#CC0000";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  passportNumber?: string; busNumber?: string;
  mobileIndia?: string; mobileSaudi?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number; companyId?: string;
  hotels?: {
    makkah?:  { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const GROUP_COLORS: Record<string, string> = {
  A: "#1a7a5e", B: "#2563EB", C: "#D97706", D: "#DC2626",
};
function getGroupColor(n: string) { return GROUP_COLORS[n.trim().slice(-1).toUpperCase()] || "#6B7280"; }
function buildHotelMapUrl(name?: string, addr?: string) {
  return `https://maps.google.com/?q=${encodeURIComponent([name, addr].filter(Boolean).join(" "))}`;
}
function buildVerifyUrl(id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

/* ── Snowflake SVG (back sticker bg) ── */
function SnowflakeSVG({ size = 120, color = GREEN, opacity = 0.07 }: { size?: number; color?: string; opacity?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.46;
  const arm = (a: number, l: number) => { const rad = (a * Math.PI) / 180; return `M${cx},${cy} L${cx + Math.cos(rad) * l},${cy + Math.sin(rad) * l}`; };
  const branch = (a: number, d: number, bl: number, ba: number) => {
    const rad = (a * Math.PI) / 180, bx = cx + Math.cos(rad) * d, by = cy + Math.sin(rad) * d;
    const b1 = ((a + ba) * Math.PI) / 180, b2 = ((a - ba) * Math.PI) / 180;
    return [`M${bx},${by} L${bx + Math.cos(b1) * bl},${by + Math.sin(b1) * bl}`, `M${bx},${by} L${bx + Math.cos(b2) * bl},${by + Math.sin(b2) * bl}`].join(" ");
  };
  const arms = [0, 60, 120, 180, 240, 300];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <g stroke={color} strokeWidth={size * 0.028} strokeLinecap="round" opacity={opacity} fill="none">
        {arms.map(a => <g key={a}><path d={arm(a, r)} /><path d={branch(a, r * 0.35, r * 0.22, a + 90)} /><path d={branch(a, r * 0.6, r * 0.16, a + 90)} /><path d={branch(a, r * 0.82, r * 0.11, a + 90)} /></g>)}
        <circle cx={cx} cy={cy} r={size * 0.04} fill={color} opacity={opacity} />
        {arms.map(a => { const rad = (a * Math.PI) / 180; return <circle key={a} cx={cx + Math.cos(rad) * r} cy={cy + Math.sin(rad) * r} r={size * 0.025} fill={color} opacity={opacity} />; })}
      </g>
    </svg>
  );
}

/* ════════════════════════════════════════════════════
   FRONT STICKER — two sizes
   compact = true  → 96 × 68 mm  (for "both" mode, 4 per page)
   compact = false → 96 × 128 mm (for front-only mode)
   ════════════════════════════════════════════════════ */
function FrontSticker({ p, group, company, groupColor, groupLabel, photoDataUrls, compact, logoDataUrl }: {
  p: Pilgrim; group: Group; company: ReturnType<typeof getCompanyById>;
  groupColor: string; groupLabel: string; photoDataUrls: Record<string, string>; compact: boolean; logoDataUrl?: string;
}) {
  const sn = String(p.serialNumber).padStart(3, "0");

  if (compact) {
    /* ── COMPACT (96 × 68 mm) ── */
    return (
      <div className="sq-sticker-sm">
        <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Corner decoration */}
          <div style={{ position: "absolute", top: "-6mm", right: "-5mm", width: "28mm", height: "28mm", background: DARK, borderRadius: "0 0 0 60%", zIndex: 0 }} />

          {/* Header */}
          <div style={{ position: "relative", zIndex: 1, padding: "1.5mm 3mm 0.5mm", display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <div style={{ fontSize: "20pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
            {company.logoUrl
              ? <img src={logoDataUrl || company.logoUrl} alt="" style={{ height: "7mm", objectFit: "contain", flexShrink: 0 }} />
              : <div style={{ height: "7mm", width: "7mm", flexShrink: 0, background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "5pt" }}>{company.nameShort[0]}</div>
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: "6.5pt", color: GREEN, textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
              <div style={{ fontWeight: 700, fontSize: "4pt", color: GOLD, textTransform: "uppercase" }}>TOURS &amp; TRAVELS</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "14pt", fontWeight: 900, color: "#fff", lineHeight: 1 }}>#{sn}</div>
              <div style={{ fontSize: "4pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
            </div>
          </div>

          {/* Group bar */}
          <div style={{ background: groupColor, padding: "0.6mm 3mm", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", zIndex: 1 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: "6pt", letterSpacing: "0.5px" }}>GROUP: {groupLabel}</span>
          </div>

          {/* Body */}
          <div style={{ position: "relative", zIndex: 1, padding: "1mm 3mm 0.5mm", flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Name + photo */}
            <div style={{ display: "flex", gap: "1.5mm", alignItems: "flex-start", marginBottom: "0.8mm" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.1, textTransform: "uppercase", wordBreak: "break-word" }}>{p.fullName}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {p.photoUrl
                  ? <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt="" style={{ width: "11mm", height: "11mm", objectFit: "cover", borderRadius: "50%", border: `1.5px solid ${GOLD}` }} />
                  : <div style={{ width: "11mm", height: "11mm", background: "#f0f0f0", borderRadius: "50%", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4pt", color: "#aaa" }}>PHOTO</div>
                }
              </div>
            </div>

            {/* Passport + SC No */}
            <div style={{ display: "flex", gap: "1.5mm", marginBottom: "0.8mm" }}>
              <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.5mm 1.5mm", textAlign: "center" }}>
                <div style={{ fontSize: "3.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
                <div style={{ fontSize: "9pt", fontWeight: 900, fontFamily: "monospace", color: DARK }}>{p.passportNumber || "—"}</div>
              </div>
              <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.5mm 1.5mm", textAlign: "center" }}>
                <div style={{ fontSize: "3.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>SERVICE CENTER</div>
                <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
              </div>
            </div>

            {/* Hotels — 3 columns compact */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5mm 1.5mm", marginBottom: "0.8mm" }}>
              {[
                { label: "MAKKAH 1", data: group.hotels?.aziziah },
                { label: "MAKKAH 2", data: group.hotels?.makkah },
                { label: "MADINAH",  data: group.hotels?.madinah },
              ].map(({ label, data }) => (
                <div key={label}>
                  <div style={{ fontSize: "3.5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontWeight: 700, color: "#222", fontSize: "5pt", lineHeight: 1.2 }}>{data?.name || "—"}</div>
                  {data?.nameAr && <div style={{ fontWeight: 700, color: "#444", fontSize: "4.5pt", direction: "rtl", textAlign: "right" }}>{data.nameAr}</div>}
                </div>
              ))}
            </div>

            {/* Lost/found bar */}
            <div style={{ background: RED, borderRadius: "2px", padding: "0.6mm 2mm", textAlign: "center", marginBottom: "0.8mm" }}>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: "6pt", textTransform: "uppercase" }}>IN CASE OF LOST / FOUND — CONTACT</div>
            </div>

            {/* Phones + QR + Barcode */}
            <div style={{ display: "flex", gap: "2mm", alignItems: "center", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: "4pt", color: "#999", fontWeight: 600 }}>🇸🇦 {company.phoneSaudi}</div>
                <div style={{ fontSize: "4pt", color: "#999", fontWeight: 600 }}>🇮🇳 {company.phone}</div>
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: "2mm", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                  <div style={{ border: `1.5px solid ${DARK}`, padding: "1px" }}>
                    <QRCodeCanvas value={buildVerifyUrl(p.id)} size={40} level="M" fgColor={DARK} />
                  </div>
                  <div style={{ fontSize: "3pt", color: "#666" }}>SCAN</div>
                </div>
                <div>
                  <Barcode value={p.passportNumber || `H${sn}`} height={18} width={1.1} fontSize={5} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer band */}
          <div style={{ position: "relative", zIndex: 2, background: DARK, padding: "1mm 2mm", display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5mm" }}>
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none"><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /><rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill={GOLD} /><circle cx="12" cy="16.2" r="1.9" fill={DARK} /></svg>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff" }}>www.alburhantravels.online</div>
          </div>
          <div style={{ position: "relative", zIndex: 2, background: "#FFC107", color: RED, padding: "0.6mm 2mm", fontSize: "6pt", textAlign: "center", fontWeight: 900, textTransform: "uppercase" }}>BAGGAGE TAG</div>
        </div>
      </div>
    );
  }

  /* ── FULL SIZE (96 × 128 mm) ── */
  return (
    <div className="sq-sticker">
      <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", top: "-8mm", right: "-6mm", width: "38mm", height: "38mm", background: DARK, borderRadius: "0 0 0 60%", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, padding: "2mm 3.5mm 1mm", display: "flex", alignItems: "center", gap: "2mm" }}>
          <div style={{ fontSize: "28pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
          {company.logoUrl ? <img src={logoDataUrl || company.logoUrl} alt="" style={{ height: "9mm", objectFit: "contain", flexShrink: 0 }} /> : <div style={{ height: "9mm", width: "9mm", flexShrink: 0, background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "6pt" }}>{company.nameShort[0]}</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: "7.5pt", color: GREEN, textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
            <div style={{ fontWeight: 700, fontSize: "5pt", color: GOLD, textTransform: "uppercase" }}>TOURS &amp; TRAVELS</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "18pt", fontWeight: 900, color: "#fff", lineHeight: 1 }}>#{sn}</div>
            <div style={{ fontSize: "5pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
          </div>
        </div>
        <div style={{ background: groupColor, padding: "0.8mm 3.5mm", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", zIndex: 1 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "7pt" }}>GROUP: {groupLabel}</span>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "1.2mm 3.5mm 1mm", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: "2.5mm", alignItems: "flex-start", marginBottom: "1mm" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "11pt", fontWeight: 900, color: DARK, lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word" }}>{p.fullName}</div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {p.photoUrl ? <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt="" style={{ width: "14mm", height: "14mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} /> : <div style={{ width: "14mm", height: "14mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "2mm", marginBottom: "1mm" }}>
            <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.6mm 2mm", textAlign: "center" }}>
              <div style={{ fontSize: "4.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
              <div style={{ fontSize: "11pt", fontWeight: 900, fontFamily: "monospace", color: DARK }}>{p.passportNumber || "—"}</div>
            </div>
            <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.6mm 2mm", textAlign: "center" }}>
              <div style={{ fontSize: "4.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>SERVICE CENTER NO</div>
              <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5mm 2mm", marginBottom: "1mm" }}>
            {[{ label: "HOTEL MAKKAH 1", data: group.hotels?.aziziah }, { label: "HOTEL MAKKAH 2", data: group.hotels?.makkah }, { label: "HOTEL MADINAH", data: group.hotels?.madinah }].map(({ label, data }) => (
              <div key={label} style={{ display: "flex", gap: "1mm", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontWeight: 700, color: "#222", fontSize: "5.5pt" }}>{data?.name || "—"}</div>
                  {data?.nameAr && <div style={{ fontWeight: 700, color: "#444", fontSize: "5pt", direction: "rtl", textAlign: "right" }}>{data.nameAr}</div>}
                  {data?.address && <div style={{ fontSize: "4pt", color: "#666", lineHeight: 1.2 }}>{data.address}</div>}
                </div>
                {data?.name && <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}><QRCodeCanvas value={buildHotelMapUrl(data.name, data.address)} size={24} level="M" fgColor={DARK} /><div style={{ fontSize: "3pt", color: "#999" }}>MAP</div></div>}
              </div>
            ))}
          </div>
          <div style={{ background: RED, borderRadius: "3px", padding: "1mm 3mm", textAlign: "center", marginBottom: "1mm" }}>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: "7.5pt", textTransform: "uppercase" }}>IN CASE OF LOST / FOUND</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: "7pt", textTransform: "uppercase" }}>KINDLY CONTACT</div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "4mm", marginBottom: "1mm" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: "4.5pt", color: "#999", fontWeight: 600 }}>🇸🇦 Saudi</div><div style={{ fontSize: "7.5pt", fontWeight: 900, color: DARK }}>{company.phoneSaudi}</div></div>
            <div style={{ width: "0.3mm", background: "#ddd" }} />
            <div style={{ textAlign: "center" }}><div style={{ fontSize: "4.5pt", color: "#999", fontWeight: 600 }}>🇮🇳 India</div><div style={{ fontSize: "7.5pt", fontWeight: 900, color: DARK }}>{company.phone}</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "3mm", marginTop: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8mm" }}>
              <div style={{ background: "#fff", padding: "2px", borderRadius: "4px", border: `2px solid ${DARK}` }}><QRCodeCanvas value={buildVerifyUrl(p.id)} size={68} level="M" fgColor={DARK} /></div>
              <div style={{ background: DARK, color: "#fff", fontSize: "4pt", fontWeight: 900, padding: "0.4mm 2.5mm", borderRadius: "8px" }}>📱 Scan</div>
            </div>
            <div><Barcode value={p.passportNumber || `H${sn}`} height={24} width={1.3} fontSize={7} /></div>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 2, background: DARK, padding: "1.5mm 3mm", display: "flex", alignItems: "center", justifyContent: "center", gap: "2.5mm" }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /><rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill={GOLD} /><circle cx="12" cy="16.2" r="1.9" fill={DARK} /></svg>
          <div style={{ fontSize: "9.5pt", fontWeight: 900, color: "#fff" }}>www.alburhantravels.online</div>
        </div>
        <div style={{ position: "relative", zIndex: 2, background: "#FFC107", color: RED, padding: "1mm 3mm", fontSize: "7.5pt", textAlign: "center", fontWeight: 900, textTransform: "uppercase" }}>BAGGAGE TAG</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   BACK STICKER — two sizes, both exactly matching front
   ════════════════════════════════════════════════════ */
function BackSticker({ p, group, company, compact, serviceLabel }: {
  p: Pilgrim; group: Group; company: ReturnType<typeof getCompanyById>; compact: boolean; serviceLabel: string;
}) {
  if (compact) {
    /* ── COMPACT BACK (96 × 68 mm) ── */
    return (
      <div className="sq-sticker-sm">
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
          {/* Header — logos */}
          <div style={{ borderBottom: `2px solid ${GREEN}`, padding: "1.5mm 2.5mm", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "0.8mm" }}>
              <img src={mashariqLogoUrl} alt="mashariq" style={{ height: "7mm", objectFit: "contain", flex: 1 }} />
              <div style={{ width: "0.5mm", background: "#ddd", alignSelf: "stretch" }} />
              <img src={almasiahLogoUrl} alt="almasiah" style={{ height: "7mm", objectFit: "contain", flex: 1 }} />
            </div>
            <div style={{ fontFamily: "Arial", direction: "rtl", textAlign: "right", fontSize: "9pt", color: GREEN, fontWeight: 900, lineHeight: 1.1 }}>شركة مشارق الماسية لخدمات الحجاج</div>
            <div style={{ fontSize: "5pt", color: "#111", fontWeight: 900 }}>Mashariq Almasiah Company for Pilgrim Services</div>
          </div>

          {/* Middle — service center + flag */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
              <SnowflakeSVG size={100} />
            </div>
            <div style={{ position: "relative", zIndex: 1, padding: "1mm 2.5mm" }}>
              <div style={{ textAlign: "right", marginBottom: "0.5mm" }}>
                <div style={{ fontFamily: "Arial", direction: "rtl", fontSize: "8.5pt", fontWeight: 900, color: "#111" }}>مركز تقديم الخدمة</div>
                <div style={{ fontSize: "6pt", fontWeight: 900, color: "#222" }}>Service Center No رقم</div>
              </div>
              <div style={{ display: "flex", gap: "2mm", alignItems: "center", marginBottom: "0.8mm" }}>
                <div style={{ flex: 1, border: `2.5px solid ${GREEN}`, borderRadius: "4px", padding: "0.5mm", textAlign: "center" }}>
                  <div style={{ fontSize: "26pt", fontWeight: 900, color: "#000", lineHeight: 1, fontFamily: "'Courier New', monospace" }}>{group.maktabNumber || "—"}</div>
                </div>
                <div style={{ width: "20mm", border: `2px solid ${GREEN}`, borderRadius: "4px", padding: "1mm", textAlign: "center", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: "20pt", lineHeight: 1 }}>🇮🇳</div>
                </div>
              </div>
              <div style={{ border: "1px solid #ccc", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ display: "flex", borderBottom: "1px solid #ccc", background: "#fafafa" }}>
                  <div style={{ flex: 1, padding: "0.8mm 2mm", fontSize: "7pt", fontWeight: 900 }}>India</div>
                  <div style={{ width: "1px", background: "#ccc" }} />
                  <div style={{ flex: 1, padding: "0.8mm 2mm", fontSize: "7.5pt", fontWeight: 900, direction: "rtl", textAlign: "right", fontFamily: "Arial" }}>الهند</div>
                </div>
                <div style={{ display: "flex" }}>
                  <div style={{ flex: 1, padding: "0.8mm 2mm" }}>
                    <div style={{ fontSize: "7.5pt", fontWeight: 900, color: GREEN }}>Hajj {group.year}</div>
                    <div style={{ fontSize: "5pt", fontWeight: 800, color: GREEN }}>1447 Hijri</div>
                  </div>
                  <div style={{ width: "1px", background: "#ccc" }} />
                  <div style={{ flex: 1, padding: "0.8mm 2mm", textAlign: "right" }}>
                    <div style={{ fontSize: "7.5pt", fontWeight: 900, color: GREEN, fontFamily: "Arial" }}>حج 1447</div>
                    <div style={{ fontSize: "5pt", fontWeight: 800, color: GREEN, fontFamily: "Arial" }}>هجري</div>
                  </div>
                </div>
              </div>
              {serviceLabel ? (
                <div style={{ marginTop: "1mm", background: GOLD, borderRadius: "3px", padding: "0.8mm 2mm", textAlign: "center" }}>
                  <div style={{ fontSize: "6.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.3px" }}>{serviceLabel}</div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Call center */}
          <div style={{ background: GREEN, padding: "1mm 2.5mm", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5mm" }}>
              <div style={{ fontSize: "5pt", fontWeight: 900, color: "#fff" }}>Call Center</div>
              <div style={{ fontSize: "5pt", fontWeight: 900, color: "#fff", fontFamily: "Arial" }}>مركزالتواصل</div>
            </div>
            <div style={{ display: "flex", gap: "1.5mm" }}>
              <div style={{ flex: 1, background: "#fff", borderRadius: "3px", padding: "0.8mm 1.5mm", display: "flex", alignItems: "center", gap: "1mm" }}>
                <div style={{ fontSize: "8pt", color: GREEN }}>🎧</div>
                <div><div style={{ fontSize: "3.5pt", color: "#888", fontWeight: 700 }}>Toll Free 🇸🇦</div><div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, fontFamily: "monospace" }}>8006120033</div></div>
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: "3px", padding: "0.8mm 1.5mm", display: "flex", alignItems: "center", gap: "1mm" }}>
                <div style={{ fontSize: "8pt", color: GREEN }}>🎧</div>
                <div><div style={{ fontSize: "3.5pt", color: "#888", fontWeight: 700 }}>Saudi 🇸🇦</div><div style={{ fontSize: "6pt", fontWeight: 900, color: DARK }}>{company.phoneSaudi}</div></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ background: "#f7faf8", borderTop: `1px solid ${GREEN}`, padding: "0.8mm 2.5mm", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: GREEN }}>{company.website}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "1mm", background: "#25D366", borderRadius: "3px", padding: "0.8mm 1.5mm" }}>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff" }}>+91 98939 89786</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── FULL SIZE BACK (96 × 128 mm) ── */
  return (
    <div className="sq-sticker">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
        <div style={{ borderBottom: `2px solid ${GREEN}`, padding: "2mm 3mm", flexShrink: 0, height: "26mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "1.5mm" }}>
            <img src={mashariqLogoUrl} alt="mashariq" style={{ height: "10mm", objectFit: "contain", flex: 1 }} />
            <div style={{ width: "0.5mm", background: "#ddd", alignSelf: "stretch" }} />
            <img src={almasiahLogoUrl} alt="almasiah" style={{ height: "10mm", objectFit: "contain", flex: 1 }} />
          </div>
          <div style={{ fontFamily: "Arial", direction: "rtl", textAlign: "right", fontSize: "13pt", color: GREEN, fontWeight: 900, lineHeight: 1.25 }}>شركة مشارق الماسية لخدمات الحجاج</div>
          <div style={{ fontSize: "6.5pt", color: "#111", fontWeight: 900, lineHeight: 1.4 }}>Mashariq Almasiah Company for Pilgrim Services</div>
        </div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}><SnowflakeSVG size={160} /></div>
          <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "1.5mm 3mm 0.5mm", textAlign: "right" }}>
              <div style={{ fontFamily: "Arial", direction: "rtl", fontSize: "11pt", fontWeight: 900, color: "#111" }}>مركز تقديم الخدمة</div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: "#222" }}>Service Center No &nbsp;<span style={{ fontFamily: "Arial" }}>رقم</span></div>
            </div>
            <div style={{ display: "flex", gap: "3mm", padding: "1mm 3mm 1.5mm", alignItems: "center" }}>
              <div style={{ flex: 1, border: `3px solid ${GREEN}`, borderRadius: "4px", padding: "2mm", textAlign: "center" }}>
                <div style={{ fontSize: "38pt", fontWeight: 900, color: "#000", lineHeight: 1, fontFamily: "'Courier New', monospace" }}>{group.maktabNumber || "—"}</div>
              </div>
              <div style={{ width: "28mm", border: `2.5px solid ${GREEN}`, borderRadius: "4px", padding: "1.5mm", textAlign: "center", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "28pt", lineHeight: 1 }}>🇮🇳</div>
              </div>
            </div>
            <div style={{ margin: "0 3mm", border: "1.5px solid #ccc", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1.5px solid #ccc", background: "#fafafa" }}>
                <div style={{ flex: 1, padding: "1.5mm 2.5mm", fontSize: "9pt", fontWeight: 900 }}>India</div>
                <div style={{ width: "1px", background: "#ccc" }} />
                <div style={{ flex: 1, padding: "1.5mm 2.5mm", fontSize: "9.5pt", fontWeight: 900, direction: "rtl", textAlign: "right", fontFamily: "Arial" }}>الهند</div>
              </div>
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, padding: "1.5mm 2.5mm" }}>
                  <div style={{ fontSize: "9pt", fontWeight: 900, color: GREEN }}>Hajj {group.year}</div>
                  <div style={{ fontSize: "6pt", fontWeight: 800, color: GREEN }}>1447 Hijri</div>
                </div>
                <div style={{ width: "1px", background: "#ccc" }} />
                <div style={{ flex: 1, padding: "1.5mm 2.5mm", textAlign: "right" }}>
                  <div style={{ fontSize: "9.5pt", fontWeight: 900, color: GREEN, fontFamily: "Arial" }}>حج 1447</div>
                  <div style={{ fontSize: "6pt", fontWeight: 800, color: GREEN, fontFamily: "Arial" }}>هجري</div>
                </div>
              </div>
            </div>
            {serviceLabel ? (
              <div style={{ margin: "1.5mm 3mm 0", background: GOLD, borderRadius: "3px", padding: "1.2mm 3mm", textAlign: "center" }}>
                <div style={{ fontSize: "8.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>{serviceLabel}</div>
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ background: GREEN, padding: "2mm 3mm 1.5mm", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1mm" }}>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: "#fff" }}>Call Center</div>
            <div style={{ fontSize: "6.5pt", fontWeight: 900, color: "#fff", fontFamily: "Arial" }}>مركزالتواصل</div>
          </div>
          <div style={{ display: "flex", gap: "2mm" }}>
            <div style={{ flex: 1, background: "#fff", borderRadius: "3px", padding: "1.2mm 2mm", display: "flex", alignItems: "center", gap: "1.5mm" }}>
              <div style={{ fontSize: "10pt", color: GREEN }}>🎧</div>
              <div><div style={{ fontSize: "4pt", color: "#888", fontWeight: 700 }}>Toll Free 🇸🇦</div><div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, fontFamily: "monospace" }}>8006120033</div></div>
            </div>
            <div style={{ flex: 1, background: "#fff", borderRadius: "3px", padding: "1.2mm 2mm", display: "flex", alignItems: "center", gap: "1.5mm" }}>
              <div style={{ fontSize: "10pt", color: GREEN }}>🎧</div>
              <div><div style={{ fontSize: "4pt", color: "#888", fontWeight: 700 }}>Saudi 🇸🇦</div><div style={{ fontSize: "7pt", fontWeight: 900, color: DARK }}>{company.phoneSaudi}</div></div>
            </div>
          </div>
        </div>
        <div style={{ background: "#f7faf8", borderTop: `1.5px solid ${GREEN}`, padding: "1.2mm 3mm", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: "8.5pt", fontWeight: 900, color: GREEN }}>{company.website}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", background: "#25D366", borderRadius: "4px", padding: "1.5mm 2.5mm" }}>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff" }}>+91 98939 89786</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */
export default function PrintLuggageSquare() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage-square");
  const groupId = params?.groupId || "";
  const [group, setGroup]       = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const [view, setView]         = useState<"front" | "back" | "both">("both");
  const company = getCompanyById(companyId);
  const [serviceLabel, setServiceLabel] = useState<string>(company.serviceLabel ?? "");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const dl = async (fmt: "pdf" | "jpg" | "png") => {
    const pages = Array.from(containerRef.current?.querySelectorAll(".sq-page-single") ?? []) as HTMLElement[];
    if (pages.length === 0) { alert("No sticker pages found — please wait for the page to load and try again."); return; }
    setDownloading(fmt);
    try {
      const name = `luggage-square-${group?.groupName || "group"}`;
      if (fmt === "pdf") await downloadMultiPagePdf(pages, name);
      else if (fmt === "png") await downloadPagesAsPng(pages, name);
      else await downloadPagesAsJpg(pages, name);
    } catch (e) {
      alert(`Download failed: ${e}`);
    } finally { setDownloading(null); }
  };

  useEffect(() => {
    if (!company.logoUrl) { setLogoDataUrl(""); return; }
    if (company.logoUrl.startsWith("data:")) { setLogoDataUrl(company.logoUrl); return; }
    fetchAsDataUrl(company.logoUrl).then(d => setLogoDataUrl(d || company.logoUrl!));
    // Reset service label to the newly selected company's default
    setServiceLabel(company.serviceLabel ?? "");
  }, [companyId]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(async ([g, p]) => {
      setGroup(g);
      if (g.companyId) setCompanyId(g.companyId);
      const list: Pilgrim[] = Array.isArray(p) ? p : [];
      setPilgrims(list);
      const entries = await Promise.all(
        list.filter(x => x.photoUrl).map(async x => {
          const d = await fetchAsDataUrl(`${API}${x.photoUrl}`);
          return [x.id, d] as [string, string];
        })
      );
      setPhotoDataUrls(Object.fromEntries(entries.filter(([, v]) => v)));
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const groupColor = getGroupColor(group.groupName);
  const groupLabel = group.groupName.toUpperCase();
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 4) pages.push(pilgrims.slice(i, i + 4));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .sq-wrap { background: white !important; padding: 0 !important; gap: 0 !important; display: block !important; }
          .sq-page-single, .sq-page-both { display: grid !important; page-break-after: always !important; break-after: page !important; margin-bottom: 0 !important; }
          .sq-page-single:last-child, .sq-page-both:last-child { page-break-after: auto !important; break-after: auto !important; }
        }
        * { box-sizing: border-box; }

        /* ── Full sticker: 90×125mm → 2×2 per A4 page (2×90+2=182mm fits A4 comfortably) ── */
        .sq-sticker {
          width: 90mm; height: 125mm;
          border: 1px dashed #bbb; border-radius: 5px; overflow: hidden;
          break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative; flex-shrink: 0;
        }

        /* ── Compact sticker: 90×64mm → 4 pairs per A4 page ── */
        .sq-sticker-sm {
          width: 90mm; height: 64mm;
          border: 1px dashed #bbb; border-radius: 4px; overflow: hidden;
          break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative; flex-shrink: 0;
        }

        /* ── "Both" page: 4 rows × [FRONT | BACK] (unused in current both-mode but kept) ── */
        /* width: 2×90 + 2mm gap = 182mm; height: 4×64 + 3×2mm = 262mm → fits A4 */
        .sq-page-both {
          width: 182mm;
          display: grid;
          grid-template-columns: 90mm 90mm;
          grid-template-rows: repeat(4, 64mm);
          gap: 2mm;
          page-break-after: always; break-after: page;
          overflow: hidden;
        }
        .sq-page-both:last-child { page-break-after: auto; break-after: auto; }

        /* ── Single-side page: 2×2 full stickers ── */
        /* width: 182mm; height: 2×125 + 2mm = 252mm → fits A4 (200×287mm usable) */
        .sq-page-single {
          width: 182mm;
          display: grid;
          grid-template-columns: 90mm 90mm;
          grid-template-rows: 125mm 125mm;
          gap: 2mm;
          page-break-after: always; break-after: page;
          overflow: hidden;
        }
        .sq-page-single:last-child { page-break-after: auto; break-after: auto; }

        /* Screen: shadow wrapper, NO extra padding (grid fills exact width) */
        @media screen {
          .sq-page-both, .sq-page-single {
            background: white;
            box-shadow: 0 2px 16px rgba(0,0,0,0.12);
            border-radius: 4px;
          }
        }

        .sq-page-label {
          font-family: Arial, sans-serif; font-size: 11px; font-weight: 700;
          color: #555; letter-spacing: 1px; text-transform: uppercase;
          padding: 6px 12px; background: #f3f4f6;
          border-left: 4px solid ${DARK}; margin-bottom: 4px;
        }
      `}</style>

      {/* ── TOOLBAR ── */}
      <div className="no-print" style={{ padding: "10px 16px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="text"
          value={serviceLabel}
          onChange={e => setServiceLabel(e.target.value)}
          placeholder="Service label on back (e.g. Rehmat E Haram CHGo)"
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff", minWidth: "260px" }}
        />
        {(["both", "front", "back"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "1.5px solid", background: view === v ? DARK : "#fff", color: view === v ? "#fff" : DARK, borderColor: DARK }}>
            {v === "front" ? "🪪 Fronts only" : v === "back" ? "🔄 Backs only" : "📄 Both sides"}
          </button>
        ))}
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => dl("pdf")} disabled={!!downloading} style={{ padding: "10px 20px", background: downloading === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>{downloading === "pdf" ? "⏳..." : "⬇ PDF"}</button>
        <button onClick={() => dl("png")} disabled={!!downloading} style={{ padding: "10px 20px", background: downloading === "png" ? "#6b7280" : "#059669", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>{downloading === "png" ? "⏳..." : "⬇ PNG"}</button>
        <button onClick={() => dl("jpg")} disabled={!!downloading} style={{ padding: "10px 20px", background: downloading === "jpg" ? "#6b7280" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>{downloading === "jpg" ? "⏳..." : "⬇ JPG"}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 20px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {/* ── Info bar ── */}
      {view === "both" && (
        <div className="no-print" style={{ padding: "10px 16px", background: "#eff6ff", borderBottom: "2px solid #93c5fd", fontSize: "12px", fontWeight: 600, color: "#1e40af", textAlign: "center", lineHeight: 1.6 }}>
          🖨️ <strong>HOW TO PRINT BOTH SIDES:</strong> &nbsp;
          1. Click Print → enable <strong>"Print on Both Sides"</strong> (flip on Long Edge) &nbsp;|&nbsp;
          2. Printer puts fronts on side 1, backs on side 2 automatically &nbsp;|&nbsp;
          3. Cut the sheet into 4 pieces → each piece is double-sided ✂️ &nbsp;|&nbsp;
          <strong>No stacking needed!</strong>
        </div>
      )}

      <div ref={containerRef} className="sq-wrap" style={{ background: "#f5f5f0", padding: "8mm", display: "block" }}>

        {/* ══ BOTH MODE: Page 1 = 4 fronts, Page 2 = 4 backs (mirrored columns for duplex alignment) ══ */}
        {view === "both" && pages.map((page, pi) => (
          <>
            {/* FRONT PAGE */}
            <div key={`lbl-f-${pi}`} className="no-print sq-page-label" style={{ borderLeftColor: GREEN }}>
              📄 SIDE 1 — FRONTS (Pilgrims {pi * 4 + 1}–{Math.min(pi * 4 + page.length, pilgrims.length)})
            </div>
            <div key={`fp-${pi}`} className="sq-page-single">
              {page.map(p => (
                <FrontSticker key={`f-${p.id}`} p={p} group={group} company={company} groupColor={groupColor} groupLabel={groupLabel} photoDataUrls={photoDataUrls} compact={false} logoDataUrl={logoDataUrl} />
              ))}
            </div>

            {/* BACK PAGE — columns mirrored (P2,P1 / P4,P3) for long-edge flip duplex alignment */}
            <div key={`lbl-b-${pi}`} className="no-print sq-page-label" style={{ borderLeftColor: "#2563EB" }}>
              🔄 SIDE 2 — BACKS · columns mirrored for duplex (Pilgrims {pi * 4 + 1}–{Math.min(pi * 4 + page.length, pilgrims.length)})
            </div>
            <div key={`bp-${pi}`} className="sq-page-single">
              {[page[1], page[0], page[3], page[2]].map((p, idx) =>
                p ? <BackSticker key={`b-${p.id}-${idx}`} p={p} group={group} company={company} compact={false} serviceLabel={serviceLabel} /> : <div key={`empty-${idx}`} />
              )}
            </div>
          </>
        ))}

        {/* ══ FRONT ONLY: 2×2 grid full size ══ */}
        {view === "front" && pages.map((page, pi) => (
          <div key={`fp-${pi}`} className="sq-page-single">
            {page.map(p => (
              <FrontSticker key={p.id} p={p} group={group} company={company} groupColor={groupColor} groupLabel={groupLabel} photoDataUrls={photoDataUrls} compact={false} logoDataUrl={logoDataUrl} />
            ))}
          </div>
        ))}

        {/* ══ BACK ONLY: 2×2 grid full size ══ */}
        {view === "back" && pages.map((page, pi) => (
          <div key={`bp-${pi}`} className="sq-page-single">
            {page.map(p => (
              <BackSticker key={p.id} p={p} group={group} company={company} compact={false} serviceLabel={serviceLabel} />
            ))}
          </div>
        ))}

      </div>
    </>
  );
}
