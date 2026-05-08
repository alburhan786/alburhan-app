import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { getCompanyById, type CompanyInfo } from "@/lib/companies";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const API         = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

const DARK          = "#0d5040";
const GOLD          = "#C9A23F";
const GOLD_LIGHT    = "#E8D48B";
const MASHARIQ_EN   = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR   = "شركة مشارق الماسية";
const INDIA_PHONES  = ["9893989786", "9893225590"];
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

/*
  Card: 55 mm × 85 mm  (portrait)
  A4 portrait: 210 mm × 297 mm
  Grid: 3 cols × 3 rows = 9 cards
    H margin: (210 − 3×55) / 2 = 22.5 mm each side
    V margin: (297 − 3×85) / 2 = 21 mm each side
  Duplex (long-edge): back page columns reversed per row
*/
const COLS     = 3;
const ROWS     = 3;
const PER_PAGE = COLS * ROWS;

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  barcodeId?: string; salutation?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: {
    makkah?:  { name?: string; nameAr?: string; address?: string };
    madinah?: { name?: string; nameAr?: string; address?: string };
    aziziah?: { name?: string; nameAr?: string; address?: string };
  };
}

function buildVerifyUrl(id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

/* ─── FRONT card — 55 mm × 85 mm portrait ────────────────────────────────────
   Layout (top→bottom):
     Header 10mm  : flag · company name · logo
     Photo  27mm  : centered photo with gold frame + serial
     Info   19mm  : name · passport · mobile · service ctr (gold box)
     QR+BC  17mm  : QR right-aligned + barcode full-width
     Footer 12mm  : emergency (saudi) + pilgrim mobile
   Total: 85 mm
─────────────────────────────────────────────────────────────────────────────── */
function FrontCard({ p, group, company, photoDataUrls, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo;
  photoDataUrls: Record<string, string>;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  const serial    = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = (p.barcodeId || p.passportNumber || `HAJ${serial}`)
    .replace(/[^\x00-\x7F]/g, "").replace(/[^A-Za-z0-9\-. ]/g, "").trim();

  return (
    <div className="id-card">

      {/* ── HEADER ── */}
      <div style={{
        background: DARK, flexShrink: 0,
        padding: "1mm 1.5mm 0.8mm",
        display: "flex", alignItems: "center", gap: "1mm",
      }}>
        <div style={{ fontSize: "14pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.15 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.8px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>
        {company.logoUrl ? (
          <div style={{ width: "8mm", height: "8mm", borderRadius: "50%", background: "#fff", border: `1.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ width: "8mm", height: "8mm", borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "4.5pt", flexShrink: 0 }}>AB</div>
        )}
      </div>

      {/* ── PHOTO ── */}
      <div style={{
        flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: `linear-gradient(180deg, ${DARK}18 0%, #fff 100%)`,
        padding: "2mm 2mm 1mm",
        borderBottom: `1px solid ${GOLD}50`,
      }}>
        <div style={{
          padding: "2px",
          background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 50%, ${GOLD} 100%)`,
          borderRadius: "4px",
          boxShadow: `0 0 6px ${GOLD}80`,
        }}>
          {p.photoUrl ? (
            <img
              src={photoDataUrls[p.id] || `${API}${p.photoUrl}`}
              alt=""
              style={{ width: "28mm", height: "34mm", objectFit: "cover", objectPosition: "top center", display: "block", borderRadius: "3px",
                WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}
            />
          ) : (
            <div style={{ width: "28mm", height: "34mm", background: "#e0e8e4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "3pt", color: "#888", fontWeight: 700, borderRadius: "3px" }}>
              <div style={{ fontSize: "14pt", color: GOLD }}>👤</div>
              <div>PHOTO</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, marginTop: "1mm" }}>#{serial}</div>
      </div>

      {/* ── INFO ── */}
      <div style={{ flexShrink: 0, padding: "1mm 2mm 0.5mm", display: "flex", flexDirection: "column", gap: "0.8mm" }}>
        {/* Name */}
        <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.5mm", wordBreak: "break-word" }}>
          {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
        </div>
        {/* Passport */}
        {p.passportNumber && (
          <div>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
            <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
          </div>
        )}
        {/* Mobile */}
        {p.mobileIndia && (
          <div>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
            <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
          </div>
        )}
        {/* Service Center — always shown */}
        <div style={{ background: `${GOLD}22`, borderRadius: "2px", padding: "0.5mm 1mm", border: `1px solid ${GOLD}60` }}>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber || "—"}</div>
        </div>
      </div>

      {/* ── QR + BARCODE ── */}
      <div style={{ flexShrink: 0, padding: "0.5mm 1.5mm 0.3mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1mm", marginBottom: "0.5mm" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "2.2pt", color: "#bbb", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "4pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>
              {INDIA_PHONES[0]}&nbsp;|&nbsp;{INDIA_PHONES[1]}
            </div>
          </div>
          <div style={{ background: "#fff", padding: "1.5px", borderRadius: "2px", border: `1.5px solid #000`, flexShrink: 0 }}>
            <QRCodeCanvas
              value={showFeedbackQr && p.mobileIndia && bookingMap[p.mobileIndia]
                ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                : buildVerifyUrl(p.id)}
              size={36} level="M" fgColor="#000000" bgColor="#ffffff"
            />
          </div>
        </div>
        <div style={{ borderTop: `2px solid ${GOLD}`, paddingTop: "0.3mm" }}>
          <Barcode value={barcodeVal || "ALBURHAN"} format="CODE128" width={1.4} height={13} displayValue fontSize={4.5} />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2mm", marginTop: "auto" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#ff2020", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1, marginBottom: "0.4mm" }}>
              🆘 Emergency (Saudi)
            </div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.4px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.4px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "2.8pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.4px" }}>{p.mobileIndia || "—"}</div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ─── BACK card — 55 mm × 85 mm portrait ──────────────────────────────────── */
function BackCard({ p, group, company, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="id-card">

      {/* ── HEADER ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1mm 1.5mm 0.8mm", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1mm" }}>
        <div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.15 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.8px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, textAlign: "right", flexShrink: 0 }}>
          {company.phone}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "1.5mm 2mm", gap: "1.2mm", overflow: "hidden" }}>

        {/* Service Center — BIG */}
        <div style={{ borderBottom: `1px solid ${GOLD}40`, paddingBottom: "1mm" }}>
          <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
          <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber || "—"}</div>
        </div>

        {/* Mashariq */}
        <div style={{ background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm", borderLeft: `2.5px solid ${GOLD}`, flexShrink: 0 }}>
          <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
          <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right", fontFamily: "Arial,sans-serif" }}>{MASHARIQ_AR}</div>
          <div style={{ fontSize: "2.5pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
        </div>

        {/* Saudi emergency (from company record) */}
        {saudiPhones.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>🆘 Emergency (Saudi)</div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        )}

        {/* Hotels */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1mm", flex: 1, overflow: "hidden" }}>
          {([
            ["Hotel Makkah 1", group.hotels?.aziziah?.name, group.hotels?.aziziah?.nameAr, group.hotels?.aziziah?.address],
            ["Hotel Makkah 2", group.hotels?.makkah?.name,  group.hotels?.makkah?.nameAr,  group.hotels?.makkah?.address],
            ["Hotel Madinah",  group.hotels?.madinah?.name,  group.hotels?.madinah?.nameAr,  group.hotels?.madinah?.address],
          ] as [string, string|undefined, string|undefined, string|undefined][]).map(([lbl, val, valAr, addr]) => val ? (
            <div key={lbl}>
              <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>{lbl}</div>
              <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{val}</div>
              {valAr && <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{valAr}</div>}
              {addr  && <div style={{ fontSize: "4pt", fontWeight: 700, color: "#555", lineHeight: 1.2 }}>{addr}</div>}
            </div>
          ) : null)}
        </div>

        {/* Feedback QR */}
        {showFeedbackQr && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ background: "#fff", padding: "1px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
              <QRCodeCanvas
                value={p.mobileIndia && bookingMap[p.mobileIndia]
                  ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                  : `${PROD_DOMAIN}/feedback`}
                size={30} level="L" fgColor={DARK}
              />
            </div>
            <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2mm" } as React.CSSProperties}>
        <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.5mm" }}>{p.fullName}</div>
        <div style={{ fontSize: "5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>{SHORT_ADDRESS}</div>
      </div>

    </div>
  );
}

/* ─── Crop marks ─────────────────────────────────────────────────────────────── */
function CropMarks() {
  const G = "2mm"; const L = "4mm"; const W = "0.4px"; const C = "#555";
  const mk = (t: string, l2: string, wd: string, h: string): React.CSSProperties =>
    ({ position: "absolute", background: C, top: t, left: l2, width: wd, height: h });
  return (
    <>
      {/* TL */}
      <div style={mk(`calc(-1*${G})`, "0", W, L)} />
      <div style={mk(`calc(-1*${L}-${G})`, `calc(-1*${G})`, L, W)} />
      {/* TR */}
      <div style={mk(`calc(-1*${G})`, "100%", W, L)} />
      <div style={mk(`calc(-1*${L}-${G})`, `calc(100% - ${G} + 0.5px)`, L, W)} />
      {/* BL */}
      <div style={mk("100%", "0", W, L)} />
      <div style={mk(`calc(100%+${G})`, `calc(-1*${G})`, L, W)} />
      {/* BR */}
      <div style={mk("100%", "100%", W, L)} />
      <div style={mk(`calc(100%+${G})`, `calc(100% - ${G} + 0.5px)`, L, W)} />
    </>
  );
}

function CardCell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: "55mm", height: "85mm" }}>
      <CropMarks />
      {children}
    </div>
  );
}

/* ─── A4 portrait page ───────────────────────────────────────────────────────── */
function A4Page({ children, label, pageRef }: {
  children: React.ReactNode;
  label?: string;
  pageRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="a4p" ref={pageRef}>
      {label && (
        <div className="no-print" style={{
          position: "absolute", top: "6mm", left: "50%", transform: "translateX(-50%)",
          background: DARK, color: GOLD, fontSize: "9px", fontWeight: 700,
          padding: "3px 14px", borderRadius: "20px", letterSpacing: "0.5px",
          fontFamily: "Arial,sans-serif", whiteSpace: "nowrap", zIndex: 10,
        }}>{label}</div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 55mm)`,
        gridTemplateRows:    `repeat(${ROWS}, 85mm)`,
        gap: "0",
      }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function PrintIdCardsDuplex() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-duplex");
  const groupId = params?.groupId || "";

  const [group,          setGroup]          = useState<Group | null>(null);
  const [pilgrims,       setPilgrims]       = useState<Pilgrim[]>([]);
  const [photoDataUrls,  setPhotoDataUrls]  = useState<Record<string, string>>({});
  const [companyId,      setCompanyId]      = useState("alburhan");
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap,     setBookingMap]     = useState<Record<string, string>>({});
  const [photosReady,    setPhotosReady]    = useState(false);
  const [error,          setError]          = useState("");

  const pageElsRef = useRef<HTMLDivElement[]>([]);
  const company    = getCompanyById(companyId);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`,          { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(async ([g, all, bm]) => {
      setGroup(g);
      if (g.companyId) setCompanyId(g.companyId);
      setBookingMap(bm || {});
      const list: Pilgrim[] = Array.isArray(all) ? all : [];
      setPilgrims(list.sort((a, b) => a.serialNumber - b.serialNumber));

      const entries = await Promise.all(
        list.map(async p => {
          if (!p.photoUrl) return [p.id, ""] as [string, string];
          const d = await fetchAsDataUrl(`${API}${p.photoUrl}`).catch(() => "");
          return [p.id, d || ""] as [string, string];
        })
      );
      setPhotoDataUrls(Object.fromEntries(entries));
      setPhotosReady(true);
    }).catch(() => setError("Failed to load data"));
  }, [groupId]);

  /* Split into pages of 9 */
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += PER_PAGE)
    pages.push(pilgrims.slice(i, i + PER_PAGE));

  function pad(pg: Pilgrim[]): (Pilgrim | null)[] {
    const a: (Pilgrim | null)[] = [...pg];
    while (a.length < PER_PAGE) a.push(null);
    return a;
  }

  /* Long-edge duplex: reverse columns per row
     Front row [A B C] → back [C B A]
     After paper flips on long (right) edge, card C aligns with A's back. */
  function mirrorCols(pg: Pilgrim[]): (Pilgrim | null)[] {
    const padded = pad(pg);
    const out: (Pilgrim | null)[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = padded.slice(r * COLS, r * COLS + COLS);
      out.push(...[...row].reverse());
    }
    return out;
  }

  pageElsRef.current = [];

  if (error) return (
    <div style={{ padding: "60px", textAlign: "center", color: "red", fontFamily: "Arial", fontSize: "16px" }}>{error}</div>
  );
  if (!group) return (
    <div style={{ padding: "60px", textAlign: "center", fontFamily: "Arial", fontSize: "16px" }}>Loading…</div>
  );

  const cardProps = (p: Pilgrim) => ({ p, group, company, photoDataUrls, showFeedbackQr, bookingMap });
  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer",
    fontSize: "12px", padding: "9px 18px", color: "#fff",
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body {
            -webkit-print-color-adjust:exact!important;
            print-color-adjust:exact!important;
            margin:0; padding:0; background:#fff!important;
          }
          .no-print { display:none!important; }
          .a4p {
            box-shadow:none!important; margin:0!important;
            page-break-after:always; break-after:page;
          }
          .a4p:last-of-type { page-break-after:auto; break-after:auto; }
        }
        * { box-sizing:border-box; }

        /* Portrait ID card: 55 mm × 85 mm */
        .id-card {
          width:55mm; height:85mm;
          overflow:hidden; border-radius:3px;
          font-family:'Inter',Arial,sans-serif;
          background:#fff; position:relative; flex-shrink:0;
          display:flex; flex-direction:column;
        }

        /* A4 portrait page: 210 × 297 mm */
        .a4p {
          width:210mm; height:297mm;
          background:#fff;
          display:flex; align-items:center; justify-content:center;
          position:relative;
        }

        @media screen {
          body { background:#374151; margin:0; padding:0; font-family:Arial,sans-serif; }
          .a4p {
            box-shadow:0 8px 48px rgba(0,0,0,0.4);
            margin:90px auto 0;
          }
          .a4p:last-of-type { margin-bottom:80px; }
          .id-card { box-shadow:0 2px 10px rgba(0,0,0,0.16); }
        }
      `}</style>

      {/* ── Fixed control bar ── */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: "#1f2937", borderBottom: "2px solid #374151",
        padding: "10px 20px", display: "flex", alignItems: "center",
        gap: "10px", flexWrap: "wrap",
      }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: "13px", fontFamily: "Arial,sans-serif" }}>
          🖨️ Duplex ID Cards (55×85mm) &nbsp;—&nbsp;
          <span style={{ color: GOLD }}>{group.groupName}</span>
          <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "8px" }}>
            {pilgrims.length} pilgrims · {pages.length} sheet{pages.length !== 1 ? "s" : ""} ×2 pages
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#d1d5db", fontSize: "12px", cursor: "pointer", fontFamily: "Arial,sans-serif" }}>
            <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} />
            Feedback QR
          </label>
          {!photosReady && (
            <span style={{ color: GOLD, fontSize: "11px", fontFamily: "Arial,sans-serif" }}>⏳ Loading photos…</span>
          )}
          <button onClick={() => window.print()} style={{ ...btnBase, background: "#16a34a", fontSize: "13px", padding: "10px 26px" }}>
            🖨️ Print Duplex
          </button>
          <button onClick={() => history.back()} style={{ ...btnBase, background: "#4b5563" }}>
            ← Back
          </button>
        </div>

        {/* Instructions */}
        <div style={{
          width: "100%", background: "#374151", borderRadius: "6px",
          padding: "8px 12px", color: "#d1d5db", fontSize: "11px",
          fontFamily: "Arial,sans-serif", lineHeight: 1.7,
        }}>
          <b style={{ color: GOLD }}>✅ How to print duplex:</b>&nbsp;
          In your printer dialog → <b>Two-sided printing: Long-edge binding (Flip on Long Edge)</b>&nbsp;
          · Paper: <b>A4</b> · Scale: 100% · No margins.
          · Page 1 = FRONT &nbsp;|&nbsp; Page 2 = BACK (columns automatically mirrored for perfect alignment).
          · Repeat for each sheet pair.
        </div>
      </div>

      {/* Spacer for fixed bar */}
      <div className="no-print" style={{ height: "110px" }} />

      {/* ── Sheet pairs ── */}
      {pages.map((pg, pi) => {
        const frontCells = pad(pg);
        const backCells  = mirrorCols(pg);

        return (
          <div key={pi}>
            {/* FRONT page */}
            <A4Page
              label={`FRONT — Sheet ${pi + 1} of ${pages.length}`}
              pageRef={el => { if (el) pageElsRef.current[pi * 2] = el!; }}
            >
              {frontCells.map((p, i) => (
                <CardCell key={i}>
                  {p
                    ? <FrontCard {...cardProps(p)} />
                    : <div className="id-card" style={{ background: "#f9fafb", border: "0.5px dashed #ddd" }} />
                  }
                </CardCell>
              ))}
            </A4Page>

            {/* BACK page */}
            <A4Page
              label={`BACK — Sheet ${pi + 1} · mirrored for long-edge duplex`}
              pageRef={el => { if (el) pageElsRef.current[pi * 2 + 1] = el!; }}
            >
              {backCells.map((p, i) => (
                <CardCell key={i}>
                  {p
                    ? <BackCard {...cardProps(p)} />
                    : <div className="id-card" style={{ background: "#f9fafb", border: "0.5px dashed #ddd" }} />
                  }
                </CardCell>
              ))}
            </A4Page>
          </div>
        );
      })}
    </>
  );
}
