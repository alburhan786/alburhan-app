import { QRCodeSVG } from "qrcode.react";
import { getCompanyById } from "@/lib/companies";

const GREEN   = "#0F3D2E";
const GOLD    = "#D4AF37";
const LIGHT   = "#F0FAF4";
const WHITE   = "#FFFFFF";
const COMPANY = getCompanyById("alburhan");
const WEBSITE = "https://alburhantravels.com";
const PHONE_IN = "+91 9893989786";
const PHONE_SA1 = "0547090786";
const PHONE_SA2 = "0568780786";

/* ── Spray Bottle Icon ── */
function SprayIcon({ size = 60 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={size} xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect x="18" y="28" width="22" height="36" rx="4" fill={GREEN} stroke={GOLD} strokeWidth="2"/>
      <rect x="28" y="16" width="12" height="14" rx="2" fill={GREEN} stroke={GOLD} strokeWidth="1.5"/>
      <path d="M40 20h8l4-8" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="52" cy="12" r="2" fill={GOLD}/>
      <path d="M24 40h10M24 46h10M24 52h10" stroke={WHITE} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M48 18c2 0 4-1 4-3" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M51 22c2-1 3-3 2-5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M54 17c1-2 1-4-1-5" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

/* ── Shield Icon ── */
function ShieldIcon({ size = 45 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M32 4L8 14v20c0 16 11 30 24 34C45 64 56 50 56 34V14L32 4z" fill={GREEN} />
      <path d="M32 10L12 18v16c0 13 9 24 20 28 11-4 20-15 20-28V18L32 10z" fill={GOLD} opacity="0.18" />
      <path d="M32 10L12 18v16c0 13 9 24 20 28 11-4 20-15 20-28V18L32 10z" fill="none" stroke={GOLD} strokeWidth="2.5" />
      <path d="M32 24c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z" fill={WHITE} />
      <path d="M32 36v8" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 52c0 2 2 4 4 4s4-2 4-4" stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── Single Label (150mm × 100mm) ── */
function SprayLabel() {
  return (
    <div className="spray-label">
      <div className="label-inner">

        {/* ══ BODY: 3 columns ══ */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* LEFT — Logo + QR */}
          <div style={{
            width: "42mm", flexShrink: 0, padding: "4mm 3mm 2mm 4mm",
            display: "flex", flexDirection: "column", alignItems: "flex-start",
            borderRight: `1pt solid ${GOLD}55`,
            background: `linear-gradient(180deg, #f8fdf9 0%, #ffffff 100%)`,
          }}>
            {/* Logo circle */}
            <div style={{ display: "flex", alignItems: "center", gap: "2.5mm", marginBottom: "3mm" }}>
              {COMPANY.logoUrl ? (
                <div style={{
                  width: "18mm", height: "18mm", borderRadius: "50%",
                  border: `2pt solid ${GOLD}`, overflow: "hidden",
                  background: WHITE, flexShrink: 0,
                  boxShadow: `0 0 0 1pt ${GOLD}44`,
                }}>
                  <img src={COMPANY.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ) : (
                <div style={{
                  width: "18mm", height: "18mm", borderRadius: "50%",
                  background: GOLD, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "11pt", fontWeight: 900, color: GREEN,
                }}>AB</div>
              )}
            </div>

            {/* Company Name */}
            <div style={{
              fontSize: "13pt", fontWeight: 900, color: GREEN,
              lineHeight: 1.05, letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}>
              AL BURHAN
            </div>
            <div style={{
              fontSize: "8pt", fontWeight: 800, color: GREEN,
              lineHeight: 1.2, letterSpacing: "0.8px",
              textTransform: "uppercase", marginBottom: "2.5mm",
            }}>
              TOURS &amp; TRAVELS
            </div>

            {/* Gold rule */}
            <div style={{ width: "36mm", height: "1pt", background: GOLD, marginBottom: "2.5mm" }} />

            {/* Hajj Mubarak slogan */}
            <div style={{
              fontSize: "12pt", fontWeight: 900, color: GREEN,
              letterSpacing: "0.5px", lineHeight: 1.2,
              marginBottom: "3mm",
            }}>
              Hajj Mubarak
            </div>

            {/* QR code — big */}
            <div style={{ marginTop: "auto" }}>
              <QRCodeSVG value={WEBSITE} size={70} level="M" fgColor={GREEN} bgColor={WHITE} />
              <div style={{
                fontSize: "4.5pt", color: "#666", letterSpacing: "1px",
                marginTop: "1mm", fontWeight: 700, textTransform: "uppercase",
              }}>SCAN QR CODE</div>
            </div>
          </div>

          {/* CENTER — Product Name */}
          <div style={{
            flex: 1, padding: "4mm 3mm",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(180deg, ${WHITE} 0%, ${LIGHT} 100%)`,
          }}>
            {/* Top star rule */}
            <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "3mm", width: "100%" }}>
              <div style={{ flex: 1, height: "1pt", background: GOLD }} />
              <div style={{ fontSize: "6pt", color: GOLD, letterSpacing: "2px", fontWeight: 900 }}>★ ★</div>
              <div style={{ flex: 1, height: "1pt", background: GOLD }} />
            </div>

            <div style={{
              fontSize: "8pt", fontWeight: 900, color: GREEN,
              letterSpacing: "4px", textTransform: "uppercase",
              lineHeight: 1, marginBottom: "2mm", textAlign: "center",
            }}>
              MULTI PURPOSE
            </div>

            <div style={{
              fontSize: "34pt", fontWeight: 900, color: GREEN,
              letterSpacing: "2px", textTransform: "uppercase",
              lineHeight: 1.0, textAlign: "center", marginBottom: "3mm",
            }}>
              SPRAY
            </div>

            {/* Gold rule */}
            <div style={{ width: "100%", height: "1.5pt", background: GOLD, marginBottom: "3mm" }} />

            <div style={{
              fontSize: "9pt", fontWeight: 800, color: "#2d6a4f",
              letterSpacing: "1.5px", textAlign: "center", lineHeight: 1.4,
              textTransform: "uppercase", marginBottom: "3mm",
            }}>
              Hygiene &amp; Cleaning
            </div>

            {/* Bottom star rule */}
            <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "3mm", width: "100%" }}>
              <div style={{ flex: 1, height: "1pt", background: GOLD }} />
              <div style={{ fontSize: "6pt", color: GOLD, fontWeight: 900 }}>✦</div>
              <div style={{ flex: 1, height: "1pt", background: GOLD }} />
            </div>

            {/* Hajj 2026 big badge */}
            <div style={{
              background: GREEN, borderRadius: "6pt",
              padding: "2.5mm 6mm", textAlign: "center",
              border: `1.5pt solid ${GOLD}`,
              boxShadow: `0 0 0 1pt ${GOLD}44`,
            }}>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: GOLD, letterSpacing: "3px" }}>HAJJ</div>
              <div style={{ fontSize: "20pt", fontWeight: 900, color: WHITE, letterSpacing: "1px", lineHeight: 1 }}>2026</div>
            </div>
          </div>

          {/* RIGHT — Spray + Shield icons */}
          <div style={{
            width: "38mm", flexShrink: 0, padding: "4mm 3mm",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "space-around",
            borderLeft: `1pt solid ${GOLD}55`,
            background: `${GREEN}06`,
          }}>
            <SprayIcon size={65} />
            <ShieldIcon size={55} />
          </div>
        </div>

        {/* ══ BOTTOM GREEN BAR ══ */}
        <div style={{
          background: GREEN, flexShrink: 0,
          padding: "2mm 5mm",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "2mm",
        }}>
          {/* India Phone */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={GOLD} strokeWidth="2.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16z"/>
            </svg>
            <span style={{ fontSize: "8pt", fontWeight: 900, color: WHITE, letterSpacing: "0.3px" }}>{PHONE_IN}</span>
          </div>

          {/* Divider */}
          <div style={{ width: "0.5pt", height: "6mm", background: `${GOLD}70`, flexShrink: 0 }} />

          {/* Saudi Numbers */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={GOLD} strokeWidth="2.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16z"/>
            </svg>
            <div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: WHITE, letterSpacing: "0.3px", lineHeight: 1.2 }}>{PHONE_SA1}</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: GOLD, letterSpacing: "0.3px", lineHeight: 1.2 }}>{PHONE_SA2}</div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: "0.5pt", height: "6mm", background: `${GOLD}70`, flexShrink: 0 }} />

          {/* Website */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={GOLD} strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span style={{ fontSize: "8pt", fontWeight: 900, color: WHITE, letterSpacing: "0.3px" }}>www.alburhantravels.com</span>
          </div>
        </div>

      </div>{/* end label-inner */}
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function PrintSprayLabel() {
  // 2 labels per A4 page (1 col × 2 rows) at 150mm width
  const labelsPerPage = 2;
  const totalLabels   = 6;
  const pages: number[][] = [];
  for (let i = 0; i < totalLabels; i += labelsPerPage) {
    pages.push(Array.from({ length: Math.min(labelsPerPage, totalLabels - i) }, (_, k) => i + k));
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .label-page { padding: 0 !important; gap: 8mm !important; }
          .label-grid { gap: 8mm !important; }
          .spray-label { box-shadow: none !important; }
        }
        * { box-sizing: border-box; }

        .spray-label {
          width: 150mm;
          height: 100mm;
          position: relative;
          flex-shrink: 0;
          border: 1.5pt dashed #bbb;
          border-radius: 3pt;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .label-inner {
          position: absolute;
          inset: 0;
          border-radius: 3pt;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: Arial, Helvetica, sans-serif;
          background: #fff;
          border: 0.8pt solid #d4af3766;
        }

        .label-grid {
          display: grid;
          grid-template-columns: 150mm;
          gap: 8mm;
          justify-content: center;
        }

        .label-page {
          display: flex;
          flex-direction: column;
          gap: 8mm;
          padding: 6mm;
          break-after: page;
          page-break-after: always;
        }
        .label-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        @media screen {
          .label-grid { zoom: 1.0; }
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
          <div style={{ fontSize: "12px", color: "#666" }}>15cm × 10cm · 2 labels/A4 page · Print-ready</div>
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
        <span>📐 Label size: <strong>15cm × 10cm</strong> (150mm × 100mm)</span>
        <span>🖨 Layout: <strong>1 column × 2 rows = 2 labels/page</strong></span>
        <span>✂ Dashed border = cut line</span>
        <span>🎨 Enable "Print background graphics"</span>
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
