import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadMultiPagePdf, downloadAsJpg, downloadAsPng, downloadPagesAsPng, downloadPagesAsJpg, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  visaNumber?: string; photoUrl?: string; mobileIndia?: string; gender?: string;
  barcodeId?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: { makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string }; madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string }; aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string } };
}

const DARK = "#0d5040";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

function WaveShapes() {
  return (
    <>
      <div style={{ position: "absolute", top: 0, right: 0, width: "16mm", height: "22mm", background: DARK, borderRadius: "0 0 0 100%", zIndex: 0 }} />
      <div style={{ position: "absolute", top: "6mm", right: 0, width: "10mm", height: "10mm", background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "14mm", height: "16mm", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0 }} />
      <div style={{ position: "absolute", bottom: "4mm", left: 0, width: "8mm", height: "9mm", background: "rgba(255,255,255,0.15)", borderRadius: "0 100% 0 0", zIndex: 0 }} />
    </>
  );
}

function WaveShapesBack() {
  return (
    <>
      <div style={{ position: "absolute", top: 0, right: 0, width: "16mm", height: "20mm", background: DARK, borderRadius: "0 0 0 100%", zIndex: 0 }} />
      <div style={{ position: "absolute", top: "5mm", right: 0, width: "10mm", height: "10mm", background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "12mm", height: "14mm", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0 }} />
    </>
  );
}

function LogoHeader({ size, company }: { size?: "small"; company: CompanyInfo }) {
  const isSmall = size === "small";
  const flagImgSize = isSmall ? "5mm" : "8mm";
  const nameSize = isSmall ? "6.5pt" : "9.5pt";
  const tagSize = isSmall ? "3pt" : "4.5pt";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isSmall ? "0.5mm" : "1mm" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: isSmall ? "18pt" : "22pt", lineHeight: 1 }}>🇮🇳</div>
      </div>
      <div style={{ flex: 1, textAlign: "center", minWidth: 0, background: "rgba(255,255,255,0.92)", borderRadius: "2px", padding: "0.3mm 1mm" }}>
        <div style={{ fontSize: nameSize, fontWeight: 900, color: DARK, letterSpacing: "0.5px", lineHeight: 1.1 }}>{company.nameShort}</div>
        <div style={{ fontSize: tagSize, fontWeight: 700, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>TOURS & TRAVELS</div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3mm" }}>
        {company.logoUrl
          ? <div style={{ width: flagImgSize, height: flagImgSize, borderRadius: "50%", background: "#fff", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              <img src={company.logoUrl} alt="" style={{ width: "90%", height: "90%", objectFit: "contain" }} />
            </div>
          : <div style={{ width: flagImgSize, height: flagImgSize, borderRadius: "50%", background: DARK, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "3pt" }}>{company.nameShort.slice(0, 1)}</div>
        }
      </div>
    </div>
  );
}

function FrontCard({ p, group, company, showFeedbackQr, bookingMap, photoDataUrls }: {
  p: Pilgrim; group: Group; company: CompanyInfo; showFeedbackQr: boolean; bookingMap: Record<string, string>; photoDataUrls: Record<string, string>;
}) {
  const dot: React.CSSProperties = { width: "2.5mm", height: "2.5mm", borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: "0.5mm" };
  const photoSrc = photoDataUrls[p.id] || (p.photoUrl ? `${API}${p.photoUrl}` : "");
  return (
    <div className="id-card">
      <WaveShapes />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "2mm 2.5mm 0" }}>
        <LogoHeader company={company} size="small" />
        {/* Body: photo | info | QR */}
        <div style={{ display: "flex", flex: 1, gap: "2mm", alignItems: "flex-start", marginTop: "1mm" }}>
          {/* Photo */}
          <div style={{ flexShrink: 0 }}>
            {photoSrc
              ? <img src={photoSrc} alt="" style={{ width: "19mm", height: "19mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
              : <div style={{ width: "19mm", height: "19mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5pt", color: "#aaa" }}>PHOTO</div>
            }
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word" }}>{p.fullName || "—"}</div>
            <div style={{ fontSize: "4.5pt", color: GOLD, fontWeight: 700, marginBottom: "1.2mm" }}>HAJJ {group.year}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7mm" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                <div style={dot} /><div style={{ fontSize: "4.5pt" }}><span style={{ color: "#888", fontSize: "3.5pt" }}>Serial </span><span style={{ fontWeight: 700, color: DARK }}>#{String(p.serialNumber).padStart(3, "0")}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                <div style={dot} /><div style={{ fontSize: "4.5pt" }}><span style={{ color: "#888", fontSize: "3.5pt" }}>Passport </span><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{p.passportNumber || "—"}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                <div style={dot} /><div style={{ fontSize: "4.5pt" }}><span style={{ color: "#888", fontSize: "3.5pt" }}>Mobile </span><span style={{ fontWeight: 600 }}>{p.mobileIndia || "—"}</span></div>
              </div>
            </div>
          </div>
          {/* QR */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm", paddingTop: "0.5mm" }}>
            <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1.5px solid ${DARK}` }}>
              <QRCodeCanvas value={buildVerifyUrl(p.id)} size={36} level="M" fgColor={DARK} />
            </div>
            <div style={{ fontSize: "3pt", color: DARK, fontWeight: 900, textTransform: "uppercase" }}>SCAN</div>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 }}>
        <div style={{ overflow: "hidden", paddingLeft: "2mm", marginBottom: "0.5mm" }}>
          {(p.barcodeId || p.passportNumber)
            ? <Barcode value={p.barcodeId || p.passportNumber!} format={p.barcodeId ? "CODE128" : "CODE39"} height={10} width={0.9} fontSize={0} />
            : <div style={{ fontSize: "4pt", color: "#999" }}>{group.groupName}</div>
          }
        </div>
        <div style={{ background: DARK, color: GOLD, padding: "0.8mm 2mm", fontSize: "3.5pt", textAlign: "center", fontWeight: 800, letterSpacing: "0.2px" }}>
          {company.name} | 🇮🇳 {company.phone} | 🇸🇦 {company.phoneSaudi}
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo; showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  const bulletDot: React.CSSProperties = { width: "3mm", height: "3mm", borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: "0.8mm" };
  return (
    <div className="id-card">
      <WaveShapesBack />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "2.5mm 3mm 0" }}>
        <LogoHeader company={company} />
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2mm", fontSize: "5.5pt", lineHeight: 1.4 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
            <div style={bulletDot} />
            <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Passport No. </span><span style={{ fontFamily: "monospace", letterSpacing: "0.3px", fontWeight: 600 }}>{p.passportNumber || "—"}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
            <div style={bulletDot} />
            <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Maktab: </span><span style={{ fontWeight: 600 }}>{group.maktabNumber || "—"}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
            <div style={bulletDot} />
            <div>
              <span style={{ color: "#888", fontSize: "4.5pt" }}>Makkah 2 Hotel: </span>
              <span style={{ fontWeight: 600 }}>{group.hotels?.makkah?.name || "—"}</span>
              {group.hotels?.makkah?.nameAr && <div style={{ fontWeight: 600, fontSize: "4.5pt", direction: "rtl", textAlign: "right" }}>{group.hotels.makkah.nameAr}</div>}
              {group.hotels?.makkah?.address && <div style={{ fontSize: "4pt", color: "#888", marginTop: "0.3mm" }}>{group.hotels.makkah.address}</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
            <div style={bulletDot} />
            <div>
              <span style={{ color: "#888", fontSize: "4.5pt" }}>Madinah Hotel: </span>
              <span style={{ fontWeight: 600 }}>{group.hotels?.madinah?.name || "—"}</span>
              {group.hotels?.madinah?.nameAr && <div style={{ fontWeight: 600, fontSize: "4.5pt", direction: "rtl", textAlign: "right" }}>{group.hotels.madinah.nameAr}</div>}
              {group.hotels?.madinah?.address && <div style={{ fontSize: "4pt", color: "#888", marginTop: "0.3mm" }}>{group.hotels.madinah.address}</div>}
            </div>
          </div>
        </div>

        {showFeedbackQr ? (
          <div style={{ display: "flex", justifyContent: "center", gap: "3mm", marginTop: "1.5mm", marginBottom: "1mm" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
              <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1px solid ${GOLD}` }}>
                <QRCodeCanvas value={buildVerifyUrl(p.id)} size={26} level="M" />
              </div>
              <div style={{ fontSize: "3pt", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency Info</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
              <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1.5px solid ${DARK}` }}>
                <QRCodeSVG
                  value={p.mobileIndia && bookingMap[p.mobileIndia]
                    ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                    : `${PROD_DOMAIN}/feedback`}
                  size={36} level="L" fgColor={DARK}
                />
              </div>
              <div style={{ fontSize: "3pt", color: DARK, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Rate Your Trip</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5mm", marginBottom: "1mm" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm" }}>
              <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2px solid ${DARK}` }}>
                <QRCodeCanvas value={buildVerifyUrl(p.id)} size={38} level="M" fgColor={DARK} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "4.5pt", color: "#666", padding: "0 3mm", marginBottom: "1mm" }}>
          <div>Group: <b style={{ color: DARK }}>{group.groupName}</b></div>
          <div><b style={{ color: DARK }}>{p.fullName}</b></div>
          <div>Year: <b style={{ color: DARK }}>{group.year}</b></div>
        </div>
        <div style={{
          background: DARK, color: "#fff", padding: "1.5mm 2mm",
          fontSize: "5pt", fontWeight: 900, textAlign: "center", lineHeight: 1.5,
          WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
        } as React.CSSProperties}>
          <div style={{ color: "#fff", fontWeight: 900 }}>{company.address}</div>
          <div style={{ color: GOLD, fontWeight: 900, fontSize: "5pt", letterSpacing: "0.2px" }}>
            🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}
          </div>
        </div>
      </div>
    </div>
  );
}

type PrintMode = "strip" | "sheets" | "direct";

export default function PrintIdCards() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const [dlState, setDlState] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("strip");

  const dlCards = async (fmt: "pdf" | "jpg" | "png") => {
    if (!contentRef.current) return;
    setDlState(fmt);
    try {
      const name = `id-cards-${group?.groupName || "group"}`;
      const pageEls = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>(".pair-block")
      );
      const els = pageEls.length > 0 ? pageEls : [contentRef.current];
      if (fmt === "pdf") await downloadMultiPagePdf(els, name);
      else if (fmt === "png") await downloadPagesAsPng(els, name);
      else await downloadPagesAsJpg(els, name);
    } finally { setDlState(null); }
  };

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(async ([g, p, bm]) => {
      setGroup(g);
      setPilgrims(p);
      setBookingMap(bm || {});
      const entries = await Promise.all(
        (p as Pilgrim[])
          .filter((pilgrim) => pilgrim.photoUrl)
          .map(async (pilgrim) => {
            const dataUrl = await fetchAsDataUrl(`${API}${pilgrim.photoUrl}`);
            return [pilgrim.id, dataUrl] as [string, string];
          })
      );
      setPhotoDataUrls(Object.fromEntries(entries.filter(([, v]) => v)));
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const CARDS_PER_ROW = 3;
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += CARDS_PER_ROW) {
    pages.push(pilgrims.slice(i, i + CARDS_PER_ROW));
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .cut-line { display: flex !important; }
        }
        * { box-sizing: border-box; }
        .id-card {
          width: 54mm; height: 86mm;
          border: 1px solid #ddd; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative; flex-shrink: 0;
        }
        .id-row {
          display: flex;
          gap: 5mm;
          justify-content: center;
          align-items: flex-start;
        }
        .cut-line {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 5mm 0;
          color: #bbb;
          font-size: 7pt;
          font-family: Arial, sans-serif;
        }
        .cut-line::before, .cut-line::after {
          content: "";
          flex: 1;
          border-top: 1.5px dashed #ccc;
        }
        .pair-block {
          page-break-after: always;
          page-break-inside: avoid;
        }
        .pair-block:last-child { page-break-after: auto; }
        .row-label {
          font-size: 7.5pt;
          font-weight: 700;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-align: center;
          margin-bottom: 2.5mm;
          font-family: Arial, sans-serif;
        }
        @media print {
          .row-label { display: none; }
        }

        /* ── Direct mode: one card per full A4 page, scaled to fill ── */
        /* Card 54×86mm, scale 3.27 → 177×281mm, centered on A4 usable 194×281mm */
        .direct-page {
          width: 194mm;
          height: 281mm;
          display: flex;
          align-items: center;
          justify-content: center;
          page-break-after: always;
          break-after: page;
        }
        .direct-page:last-child { page-break-after: auto; break-after: auto; }
        .direct-card-wrap {
          zoom: 3.27;
          transform-origin: center center;
        }
        .direct-page-label {
          font-size: 9pt; font-weight: 700; padding: 4px 10px;
          border-radius: 4px; margin-bottom: 4mm;
          font-family: Arial, sans-serif; text-align: center;
        }
        @media print {
          .direct-page-label { display: none !important; }
          .direct-page { width: 100%; height: 100%; }
        }

        /* ── Sheets mode: all fronts page 1, all backs page 2 ── */
        .sheets-block {
          page-break-after: always;
          page-break-inside: avoid;
        }
        .sheets-block:last-child { page-break-after: auto; }
        .sheets-grid {
          display: flex;
          flex-direction: column;
          gap: 5mm;
        }
        .sheets-page-label {
          font-size: 8pt;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          margin-bottom: 3mm;
          font-family: Arial, sans-serif;
        }
        @media print {
          .sheets-page-label { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: "4px", background: "#e5e7eb", borderRadius: "8px", padding: "3px" }}>
          {(["direct", "strip", "sheets"] as PrintMode[]).map(m => (
            <button key={m} onClick={() => setPrintMode(m)} style={{
              padding: "7px 14px", border: "none", borderRadius: "6px", cursor: "pointer",
              fontSize: "12px", fontWeight: 700,
              background: printMode === m ? DARK : "transparent",
              color: printMode === m ? "#fff" : "#374151",
            }}>
              {m === "direct" ? "Direct Print" : m === "strip" ? "Strip 3" : "Sheets"}
            </button>
          ))}
        </div>

        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
          Show Feedback QR
        </label>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => dlCards("pdf")} disabled={!!dlState} style={{ padding: "10px 20px", background: dlState === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {dlState === "pdf" ? "⏳..." : "⬇ PDF"}
        </button>
        <button onClick={() => dlCards("png")} disabled={!!dlState} style={{ padding: "10px 20px", background: dlState === "png" ? "#6b7280" : "#059669", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {dlState === "png" ? "⏳..." : "⬇ PNG"}
        </button>
        <button onClick={() => dlCards("jpg")} disabled={!!dlState} style={{ padding: "10px 20px", background: dlState === "jpg" ? "#6b7280" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {dlState === "jpg" ? "⏳..." : "⬇ JPG"}
        </button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div className="no-print" style={{
        padding: "10px 16px", fontSize: "12px", textAlign: "center", lineHeight: 1.8,
        background: printMode === "direct" ? "#fff7ed" : printMode === "sheets" ? "#f0f9ff" : "#f0fdf4",
        borderBottom: `1px solid ${printMode === "direct" ? "#fed7aa" : printMode === "sheets" ? "#bae6fd" : "#d1fae5"}`,
        color: printMode === "direct" ? "#9a3412" : printMode === "sheets" ? "#0c4a6e" : "#065f46",
      }}>
        {printMode === "direct" ? (
          <><strong>Direct Print:</strong> Each card fills one full A4 page. Front on page 1, Back on page 2 — per pilgrim. No cutting needed. Just print &amp; laminate.</>
        ) : printMode === "sheets" ? (
          <><strong>Sheets mode:</strong> Page 1 = ALL front cards · Page 2 = ALL back cards (same order).
          &nbsp;① Print both pages &nbsp;② Cut each page into individual cards &nbsp;③ Pair front + back &nbsp;④ Laminate</>
        ) : (
          <><strong>How to use:</strong> Each A4 page = {CARDS_PER_ROW} pilgrims (front cards on top, back cards on bottom).
          &nbsp;① Print &nbsp;② Cut along the dashed line &nbsp;③ Stack back strip below front strip &nbsp;④ Cut vertically for individual paired cards &nbsp;⑤ Laminate</>
        )}
      </div>

      <div ref={contentRef} style={{ padding: printMode === "direct" ? "0" : "6mm", fontFamily: "'Inter', Arial, sans-serif" }}>
        {printMode === "direct" ? (
          /* ── DIRECT PRINT: one card per full A4 page, scaled to fill ── */
          pilgrims.flatMap(p => [
            /* Front page */
            <div key={`df-${p.id}`} className="direct-page">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="direct-page-label no-print" style={{ background: "#dbeafe", color: "#1e40af" }}>
                  FRONT — {p.fullName} #{String(p.serialNumber).padStart(3, "0")}
                </div>
                <div className="direct-card-wrap">
                  <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                </div>
              </div>
            </div>,
            /* Back page */
            <div key={`db-${p.id}`} className="direct-page">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="direct-page-label no-print" style={{ background: "#fee2e2", color: "#991b1b" }}>
                  BACK — {p.fullName} #{String(p.serialNumber).padStart(3, "0")}
                </div>
                <div className="direct-card-wrap">
                  <BackCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                </div>
              </div>
            </div>,
          ])
        ) : printMode === "sheets" ? (
          <>
            {/* Page 1: All fronts */}
            <div className="sheets-block">
              <div className="sheets-page-label" style={{ background: "#dbeafe", color: "#1e40af" }}>
                📄 PAGE 1 — FRONT SIDE ({pilgrims.length} cards)
              </div>
              <div className="sheets-grid">
                {pages.map((page, pi) => (
                  <div key={pi} className="id-row">
                    {page.map(p => (
                      <FrontCard key={`sf-${p.id}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Page 2: All backs */}
            <div className="sheets-block">
              <div className="sheets-page-label" style={{ background: "#fee2e2", color: "#991b1b" }}>
                📄 PAGE 2 — BACK SIDE ({pilgrims.length} cards, same order)
              </div>
              <div className="sheets-grid">
                {pages.map((page, pi) => (
                  <div key={pi} className="id-row">
                    {page.map(p => (
                      <BackCard key={`sb-${p.id}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          pages.map((page, pi) => (
            <div key={pi} className="pair-block">

              <div className="row-label" style={{ color: DARK }}>▼ FRONT SIDE — {page.map(p => p.fullName.split(" ")[0]).join(", ")}</div>

              <div className="id-row">
                {page.map(p => (
                  <FrontCard key={`f-${p.id}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                ))}
              </div>

              <div className="cut-line">✂ Cut here — then stack back strip below front strip and cut vertically for individual cards</div>

              <div className="row-label" style={{ color: "#7c3aed" }}>▲ BACK SIDE — same {page.length} pilgrim{page.length > 1 ? "s" : ""} (same left-to-right order)</div>

              <div className="id-row">
                {page.map(p => (
                  <BackCard key={`b-${p.id}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                ))}
              </div>

            </div>
          ))
        )}
      </div>
    </>
  );
}
