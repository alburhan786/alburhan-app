import { QRCodeSVG } from "qrcode.react";
import { getCompanyById } from "@/lib/companies";

const GREEN  = "#0F3D2E";
const GOLD   = "#D4AF37";
const LIGHT  = "#F0FAF4";
const WHITE  = "#FFFFFF";
const COMPANY = getCompanyById("alburhan");
const WEBSITE = "https://alburhantravels.com";
const PHONE   = "+91 9893989786";

/* ── Inline Shield SVG Icon ── */
function ShieldIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4L8 14v20c0 16 11 30 24 34C45 64 56 50 56 34V14L32 4z" fill={GREEN} />
      <path d="M32 10L12 18v16c0 13 9 24 20 28 11-4 20-15 20-28V18L32 10z" fill={GOLD} opacity="0.18" />
      <path d="M32 10L12 18v16c0 13 9 24 20 28 11-4 20-15 20-28V18L32 10z" fill="none" stroke={GOLD} strokeWidth="2.5" />
      {/* Spray drop icon inside shield */}
      <path d="M32 24c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z" fill={WHITE} />
      <path d="M32 36v8" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 52c0 2 2 4 4 4s4-2 4-4" stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── Spray Bottle Icon ── */
function SprayIcon({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={size} xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect x="18" y="28" width="22" height="36" rx="4" fill={GREEN} stroke={GOLD} strokeWidth="2"/>
      <rect x="28" y="16" width="12" height="14" rx="2" fill={GREEN} stroke={GOLD} strokeWidth="1.5"/>
      <path d="M40 20h8l4-8" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="52" cy="12" r="2" fill={GOLD}/>
      <path d="M24 40h10M24 46h10M24 52h10" stroke={WHITE} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      {/* mist lines */}
      <path d="M48 18c2 0 4-1 4-3" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M51 22c2-1 3-3 2-5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M54 17c1-2 1-4-1-5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

/* ── Single Label (76.2mm × 50.8mm) ── */
function SprayLabel() {
  return (
    <div className="spray-label">
      {/* Bleed zone indicator (shows on screen, clips in print) */}
      <div className="label-inner">

        {/* ══ BODY: 3 columns ══ */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* LEFT — Logo + Company Name */}
          <div style={{
            width: "29mm", flexShrink: 0, padding: "2.5mm 2mm 1.5mm 2.5mm",
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            borderRight: `0.8pt solid ${GOLD}55`,
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", marginBottom: "2mm" }}>
              {COMPANY.logoUrl ? (
                <div style={{
                  width: "9mm", height: "9mm", borderRadius: "50%",
                  border: `1.5pt solid ${GOLD}`, overflow: "hidden",
                  background: WHITE, flexShrink: 0,
                }}>
                  <img src={COMPANY.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ) : (
                <div style={{
                  width: "9mm", height: "9mm", borderRadius: "50%",
                  background: GOLD, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "6pt", fontWeight: 900, color: GREEN,
                }}>AB</div>
              )}
              <div style={{ width: "0.5pt", height: "7mm", background: `${GOLD}55` }} />
            </div>

            {/* Company Name */}
            <div style={{
              fontSize: "7.5pt", fontWeight: 900, color: GREEN,
              lineHeight: 1.1, letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}>
              AL BURHAN
            </div>
            <div style={{
              fontSize: "5pt", fontWeight: 800, color: GREEN,
              lineHeight: 1.2, letterSpacing: "0.5px",
              textTransform: "uppercase", marginBottom: "1.5mm",
            }}>
              TOURS & TRAVELS
            </div>

            {/* Gold rule */}
            <div style={{ width: "22mm", height: "0.5pt", background: GOLD, marginBottom: "1.5mm" }} />

            {/* Tagline */}
            <div style={{
              fontSize: "3.5pt", color: "#4a7c5f", lineHeight: 1.45,
              fontStyle: "italic", letterSpacing: "0.2px",
            }}>
              Serving Pilgrims<br />with Care
            </div>

            {/* QR code tiny */}
            <div style={{ marginTop: "auto", paddingTop: "1mm" }}>
              <QRCodeSVG value={WEBSITE} size={22} level="L" fgColor={GREEN} bgColor={WHITE} />
              <div style={{ fontSize: "2.2pt", color: "#888", letterSpacing: "0.2px", marginTop: "0.3mm" }}>SCAN</div>
            </div>
          </div>

          {/* CENTER — Product Name */}
          <div style={{
            flex: 1, padding: "2.5mm 2mm",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(180deg, ${WHITE} 0%, ${LIGHT} 100%)`,
          }}>
            {/* Top accent line */}
            <div style={{ display: "flex", alignItems: "center", gap: "1mm", marginBottom: "2mm", width: "100%" }}>
              <div style={{ flex: 1, height: "0.5pt", background: GOLD }} />
              <div style={{ fontSize: "3pt", color: GOLD, letterSpacing: "1px", fontWeight: 900 }}>★</div>
              <div style={{ flex: 1, height: "0.5pt", background: GOLD }} />
            </div>

            <div style={{
              fontSize: "4pt", fontWeight: 900, color: GREEN,
              letterSpacing: "2.5px", textTransform: "uppercase",
              lineHeight: 1, marginBottom: "1mm", textAlign: "center",
            }}>
              MULTI PURPOSE
            </div>

            <div style={{
              fontSize: "14pt", fontWeight: 900, color: GREEN,
              letterSpacing: "1px", textTransform: "uppercase",
              lineHeight: 1.0, textAlign: "center", marginBottom: "2mm",
            }}>
              SPRAY
            </div>

            {/* Gold rule */}
            <div style={{ width: "100%", height: "1pt", background: GOLD, marginBottom: "2mm" }} />

            <div style={{
              fontSize: "4.5pt", fontWeight: 700, color: "#4a7c5f",
              letterSpacing: "0.8px", textAlign: "center", lineHeight: 1.3,
              textTransform: "uppercase",
            }}>
              Hygiene &amp; Cleaning
            </div>

            {/* Bottom accent line */}
            <div style={{ display: "flex", alignItems: "center", gap: "1mm", marginTop: "2mm", width: "100%" }}>
              <div style={{ flex: 1, height: "0.5pt", background: GOLD }} />
              <div style={{ fontSize: "3pt", color: GOLD, fontWeight: 900 }}>✦</div>
              <div style={{ flex: 1, height: "0.5pt", background: GOLD }} />
            </div>

            {/* For Staff Use Only */}
            <div style={{
              marginTop: "1.5mm",
              background: `${GREEN}12`, border: `0.5pt solid ${GREEN}40`,
              borderRadius: "20pt", padding: "0.5mm 2mm",
              fontSize: "2.8pt", fontWeight: 800, color: GREEN,
              letterSpacing: "0.5px", textTransform: "uppercase",
            }}>
              For Staff Use Only
            </div>
          </div>

          {/* RIGHT — Icon + Badge */}
          <div style={{
            width: "19mm", flexShrink: 0, padding: "2mm 1.5mm",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "space-between",
            borderLeft: `0.8pt solid ${GOLD}55`,
            background: `${GREEN}06`,
          }}>
            {/* Spray icon */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm" }}>
              <SprayIcon size={30} />
              <ShieldIcon size={22} />
            </div>

            {/* HAJJ badge */}
            <div style={{
              background: GREEN, borderRadius: "4pt",
              padding: "1.2mm 2mm", textAlign: "center",
              border: `1pt solid ${GOLD}`,
              boxShadow: `0 0 0 0.5pt ${GOLD}44`,
            }}>
              <div style={{ fontSize: "3pt", fontWeight: 900, color: GOLD, letterSpacing: "1.5px" }}>HAJJ</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: WHITE, letterSpacing: "0.5px", lineHeight: 1 }}>2026</div>
            </div>
          </div>
        </div>

        {/* ══ BOTTOM GREEN BAR ══ */}
        <div style={{
          background: GREEN, flexShrink: 0,
          padding: "1.2mm 3mm",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Phone */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.2mm" }}>
            <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GOLD} strokeWidth="2.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16z"/>
            </svg>
            <span style={{ fontSize: "4.5pt", fontWeight: 800, color: WHITE, letterSpacing: "0.3px" }}>{PHONE}</span>
          </div>

          {/* Divider */}
          <div style={{ width: "0.5pt", height: "5mm", background: `${GOLD}60` }} />

          {/* Website */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.2mm" }}>
            <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GOLD} strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span style={{ fontSize: "4pt", fontWeight: 700, color: WHITE, letterSpacing: "0.2px" }}>www.alburhantravels.com</span>
          </div>
        </div>

      </div>{/* end label-inner */}
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function PrintSprayLabel() {
  // 10 labels per page: 2 cols × 5 rows on A4 portrait
  const labelsPerPage = 10;
  const totalLabels   = 20; // default 2 pages
  const pages: number[][] = [];
  for (let i = 0; i < totalLabels; i += labelsPerPage) {
    pages.push(Array.from({ length: Math.min(labelsPerPage, totalLabels - i) }, (_, k) => i + k));
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .label-page { padding: 0 !important; gap: 3mm !important; }
          .label-grid { gap: 3mm !important; }
          .spray-label { box-shadow: none !important; }
        }
        * { box-sizing: border-box; }

        .spray-label {
          width: 76.2mm;
          height: 50.8mm;
          position: relative;
          flex-shrink: 0;
          /* Bleed zone — outer border */
          border: 1pt dashed #ccc;
          border-radius: 2pt;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,0.12);
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .label-inner {
          position: absolute;
          /* 3mm bleed inset = the actual label content area */
          inset: 0;
          border-radius: 2pt;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: Arial, Helvetica, sans-serif;
          background: #fff;
          border: 0.5pt solid #d4af3766;
        }

        .label-grid {
          display: grid;
          grid-template-columns: 76.2mm 76.2mm;
          gap: 4mm;
          justify-content: center;
        }

        .label-page {
          display: flex;
          flex-direction: column;
          gap: 4mm;
          padding: 4mm;
          break-after: page;
          page-break-after: always;
        }
        .label-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        @media screen {
          .label-grid { zoom: 1.6; }
          .label-page { zoom: 1; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        padding: "14px 20px", background: `${GREEN}0a`,
        borderBottom: `2px solid ${GREEN}22`,
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "16px", color: GREEN }}>Spray Bottle Label</div>
          <div style={{ fontSize: "12px", color: "#666" }}>3×2 inch · Landscape · 10 labels/A4 page · Print-ready</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()} style={{
            padding: "10px 24px", background: GREEN, color: WHITE,
            border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px",
          }}>🖨 Print Labels</button>
          <button onClick={() => window.history.back()} style={{
            padding: "10px 20px", border: "1px solid #ccc", borderRadius: "8px",
            cursor: "pointer", background: WHITE, fontSize: "13px",
          }}>← Back</button>
        </div>
      </div>

      {/* Info bar */}
      <div className="no-print" style={{
        padding: "8px 20px", background: `${GOLD}18`,
        borderBottom: `1px solid ${GOLD}44`,
        display: "flex", gap: "16px", flexWrap: "wrap",
        fontSize: "12px", color: "#555",
      }}>
        <span>📐 Label size: <strong>3" × 2"</strong> (76.2mm × 50.8mm)</span>
        <span>🖨 Layout: <strong>2 columns × 5 rows = 10 labels/page</strong></span>
        <span>✂ Dashed border = cut line</span>
        <span>🎨 Print with background graphics enabled</span>
      </div>

      {/* Labels */}
      <div style={{ background: "#f5f5f0", padding: "8mm" }}>
        {pages.map((page, pi) => (
          <div key={pi} className="label-page">
            <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "2mm", fontStyle: "italic" }}>
              Page {pi + 1} — {page.length} labels
            </div>
            <div className="label-grid">
              {page.map(idx => <SprayLabel key={idx} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
