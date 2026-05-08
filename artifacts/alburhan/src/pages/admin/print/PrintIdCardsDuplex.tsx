import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { getCompanyById, type CompanyInfo } from "@/lib/companies";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const API         = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

const DARK            = "#0d5040";
const GOLD            = "#C9A23F";
const GOLD_LIGHT      = "#E8D48B";
const MASHARIQ_EN     = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR     = "شركة مشارق الماسية";
const INDIA_PHONES    = ["9893989786", "9893225590"];
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];
const SHORT_ADDRESS   = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

/*
  Card: 90 mm × 60 mm  LANDSCAPE (9 cm wide × 6 cm tall)
  A4 landscape page: 297 mm × 210 mm
  Grid: 3 cols × 3 rows = 9 cards per sheet
    H margin: (297 − 3×90) / 2 = 13.5 mm each side
    V margin: (210 − 3×60) / 2 = 15 mm each side
  Duplex long-edge: back page columns reversed per row
    Front: [A B C]   Back: [C B A]
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

/* ─────────────────────────────────────────────────────────────────────────────
   FRONT card  —  85 mm × 55 mm LANDSCAPE
   Matches screenshot exactly:
     Header (dark green) : flag · company name · HAJJ year · round logo
     Body row            : photo sidebar | info center | QR right
     Barcode strip       : full-width CODE128
     Footer (dark green) : name / emergency / pilgrim mobile
───────────────────────────────────────────────────────────────────────────── */
function FrontCard({ p, group, company, photoDataUrls, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo;
  photoDataUrls: Record<string, string>;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  const serial     = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = (p.barcodeId || p.passportNumber || `HAJ${serial}`)
    .replace(/[^\x00-\x7F]/g, "").replace(/[^A-Za-z0-9\-. ]/g, "").trim();

  return (
    <div className="lcard">

      {/* ── Header ── */}
      <div style={{
        background: DARK, flexShrink: 0,
        padding: "1mm 2mm 0.8mm",
        display: "flex", alignItems: "center", gap: "1.5mm",
      }}>
        <div style={{ fontSize: "18pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>
        {company.logoUrl ? (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: "#fff", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "5.5pt", flexShrink: 0 }}>AB</div>
        )}
      </div>

      {/* ── Body: Photo | Info | QR ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Photo sidebar */}
        <div style={{
          width: "22mm", flexShrink: 0,
          background: `${DARK}10`,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "flex-start", padding: "2mm 1mm 1mm",
          borderRight: `2px solid ${GOLD}`,
        }}>
          <div style={{
            padding: "2px",
            background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 50%, ${GOLD} 100%)`,
            borderRadius: "3px", boxShadow: `0 0 5px ${GOLD}90`,
          }}>
            {p.photoUrl ? (
              <img
                src={photoDataUrls[p.id] || `${API}${p.photoUrl}`}
                alt=""
                style={{
                  width: "16mm", height: "20mm",
                  objectFit: "cover", objectPosition: "top center",
                  display: "block", borderRadius: "2px",
                  WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                } as React.CSSProperties}
              />
            ) : (
              <div style={{ width: "16mm", height: "20mm", background: "#e0e8e4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "2.5pt", color: "#888", fontWeight: 700, borderRadius: "2px" }}>
                <div style={{ fontSize: "9pt", color: GOLD }}>👤</div>
                <div>PHOTO</div>
              </div>
            )}
          </div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, marginTop: "1mm" }}>#{serial}</div>
        </div>

        {/* Info center */}
        <div style={{ flex: 1, padding: "1mm 1mm 0.5mm 1.5mm", display: "flex", flexDirection: "column", gap: "0.7mm", overflow: "hidden" }}>
          {/* Name */}
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.5mm", wordBreak: "break-word" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>

          {/* Passport */}
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
            </div>
          )}

          {/* Mobile India */}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
            </div>
          )}

          {/* Service Center — gold box, always shown */}
          <div style={{ background: `${GOLD}22`, borderRadius: "2px", padding: "0.5mm 1mm", border: `1px solid ${GOLD}60` }}>
            <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber || "—"}</div>
          </div>
        </div>

        {/* QR right */}
        <div style={{
          width: "22mm", flexShrink: 0,
          padding: "1mm 1mm 0.5mm",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          borderLeft: `1px solid ${GOLD}50`,
        }}>
          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: "1.5px solid #000" }}>
            <QRCodeCanvas
              value={showFeedbackQr && p.mobileIndia && bookingMap[p.mobileIndia]
                ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                : buildVerifyUrl(p.id)}
              size={56} level="M" fgColor="#000" bgColor="#fff"
            />
          </div>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", textAlign: "center" }}>
            {showFeedbackQr ? "RATE TRIP" : "SCAN TO VERIFY"}
          </div>
        </div>

      </div>

      {/* ── Barcode ── */}
      <div style={{ flexShrink: 0, padding: "0.8mm 1.5mm 0.3mm", background: "#fff", borderTop: `2px solid ${GOLD}` }}>
        <Barcode value={barcodeVal || "ALBURHAN"} format="CODE128" width={1.6} height={14} displayValue fontSize={5} />
      </div>

      {/* ── Footer ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3mm" }}>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Mobile No.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3.5pt", fontWeight: 900, color: "#ff2020", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1, marginBottom: "0.4mm" }}>
              🆘 EMERGENCY (SAUDI)
            </div>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", lineHeight: 1.2, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", lineHeight: 1.2, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{p.mobileIndia || "—"}</div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   BACK card  —  85 mm × 55 mm LANDSCAPE
───────────────────────────────────────────────────────────────────────────── */
function BackCard({ p, group, company, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="lcard">

      {/* ── Header ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1mm 2mm 0.8mm", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, textAlign: "right", flexShrink: 0 }}>
          {company.phone}
        </div>
      </div>

      {/* ── Body: service info | hotels ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: maktab + mashariq + emergency */}
        <div style={{
          width: "42mm", flexShrink: 0,
          padding: "1.2mm 2mm 1mm",
          borderRight: `1px solid ${GOLD}40`,
          display: "flex", flexDirection: "column", gap: "1mm",
        }}>
          {/* Service Center big */}
          <div>
            <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
            <div style={{ fontSize: "13pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber || "—"}</div>
          </div>

          {/* Mashariq */}
          <div style={{ background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm", borderLeft: `2.5px solid ${GOLD}` }}>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right", fontFamily: "Arial,sans-serif" }}>{MASHARIQ_AR}</div>
            <div style={{ fontSize: "2.8pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>

          {/* Saudi emergency */}
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>🆘 Emergency (Saudi)</div>
            {(saudiPhones.length > 0 ? saudiPhones : SAUDI_EMERGENCY).map((num, i) => (
              <div key={i} style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        </div>

        {/* Right: hotels + optional QR */}
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
                {addr  && <div style={{ fontSize: "4pt", fontWeight: 700, color: "#555", lineHeight: 1.2 }}>{addr}</div>}
              </div>
            ) : null)}
          </div>

          {showFeedbackQr && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "auto" }}>
              <div style={{ background: "#fff", padding: "1px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
                <QRCodeCanvas
                  value={p.mobileIndia && bookingMap[p.mobileIndia]
                    ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                    : `${PROD_DOMAIN}/feedback`}
                  size={26} level="L" fgColor={DARK}
                />
              </div>
              <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.5mm" }}>{p.fullName}</div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>{SHORT_ADDRESS}</div>
          </div>
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

/* ─── SVG Crop-mark overlay ──────────────────────────────────────────────────
   Page:  297 mm × 210 mm  (A4 landscape)
   Grid:  3 cols × 90 mm  +  3 rows × 60 mm
   H margin (each side): (297 − 270) / 2 = 13.5 mm
   V margin (each side): (210 − 180) / 2 = 15 mm

   Cut X positions: 13.5, 103.5, 193.5, 283.5 mm
   Cut Y positions: 15, 75, 135, 195 mm

   For every cut-X → vertical line in TOP margin (0 → 13mm)
                      and BOTTOM margin (197mm → 210mm)
   For every cut-Y → horizontal line in LEFT margin (0 → 11.5mm)
                      and RIGHT margin (285.5mm → 297mm)
   2 mm gap between line end and card edge.
──────────────────────────────────────────────────────────────────────────── */
function CropOverlay() {
  const cutX  = [13.5, 103.5, 193.5, 283.5]; // mm from left
  const cutY  = [15, 75, 135, 195];           // mm from top
  const gap   = 2;    // mm gap between mark and card edge
  const vTop  = 15 - gap;    // 13 mm
  const vBot  = 195 + gap;   // 197 mm
  const hLeft = 13.5 - gap;  // 11.5 mm
  const hRight= 283.5 + gap; // 285.5 mm

  const lp = (v: number) => `${v}mm`;

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, width: "297mm", height: "210mm", pointerEvents: "none", zIndex: 5, overflow: "visible" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Vertical cut lines — drawn only in top & bottom margins */}
      {cutX.map(x => (
        <g key={`vx-${x}`}>
          <line x1={lp(x)} y1="0"       x2={lp(x)} y2={lp(vTop)} stroke="#444" strokeWidth="0.4" />
          <line x1={lp(x)} y1={lp(vBot)} x2={lp(x)} y2="210mm"   stroke="#444" strokeWidth="0.4" />
        </g>
      ))}

      {/* Horizontal cut lines — drawn only in left & right margins */}
      {cutY.map(y => (
        <g key={`hy-${y}`}>
          <line x1="0"        y1={lp(y)} x2={lp(hLeft)}  y2={lp(y)} stroke="#444" strokeWidth="0.4" />
          <line x1={lp(hRight)} y1={lp(y)} x2="297mm"    y2={lp(y)} stroke="#444" strokeWidth="0.4" />
        </g>
      ))}

      {/* Small crosshair dots at every cut intersection on the outer edges */}
      {cutX.flatMap(x => cutY.map(y => (
        <circle key={`dot-${x}-${y}`} cx={lp(x)} cy={lp(y)} r="0.6mm" fill="none" stroke="#888" strokeWidth="0.3" />
      )))}
    </svg>
  );
}

function CardCell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "90mm", height: "60mm", flexShrink: 0, overflow: "hidden" }}>
      {children}
    </div>
  );
}

/* ─── A4 landscape page (297 mm × 210 mm) ──────────────────────────────────── */
function A4Page({ children, label, pageRef }: {
  children: React.ReactNode; label?: string;
  pageRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="a4l" ref={pageRef}>
      {/* Precise SVG crop-mark overlay */}
      <CropOverlay />

      {label && (
        <div className="no-print" style={{
          position: "absolute", top: "6mm", left: "50%", transform: "translateX(-50%)",
          background: DARK, color: GOLD, fontSize: "9px", fontWeight: 700,
          padding: "3px 14px", borderRadius: "20px", letterSpacing: "0.5px",
          fontFamily: "Arial,sans-serif", whiteSpace: "nowrap", zIndex: 10,
        }}>{label}</div>
      )}

      {/* Card grid — exactly centred by the flex parent (.a4l) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 90mm)`,
        gridTemplateRows:    `repeat(${ROWS}, 60mm)`,
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
  const [frontOnly,      setFrontOnly]      = useState(true);
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

  /* Split into groups of 9 */
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += PER_PAGE)
    pages.push(pilgrims.slice(i, i + PER_PAGE));

  function pad(pg: Pilgrim[]): (Pilgrim | null)[] {
    const a: (Pilgrim | null)[] = [...pg];
    while (a.length < PER_PAGE) a.push(null);
    return a;
  }

  /* Long-edge duplex: reverse columns per row */
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

  if (error) return <div style={{ padding: "60px", textAlign: "center", color: "red", fontFamily: "Arial", fontSize: "16px" }}>{error}</div>;
  if (!group) return <div style={{ padding: "60px", textAlign: "center", fontFamily: "Arial", fontSize: "16px" }}>Loading…</div>;

  const cardProps = (p: Pilgrim) => ({ p, group, company, photoDataUrls, showFeedbackQr, bookingMap });
  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer",
    fontSize: "12px", padding: "9px 18px", color: "#fff",
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body {
            -webkit-print-color-adjust:exact!important;
            print-color-adjust:exact!important;
            margin:0; padding:0; background:#fff!important;
          }
          .no-print { display:none!important; }
          .a4l {
            box-shadow:none!important; margin:0!important;
            page-break-after:always; break-after:page;
          }
          .a4l:last-of-type { page-break-after:auto; break-after:auto; }
        }
        * { box-sizing:border-box; }

        /* Landscape card: 90mm × 60mm  (9 cm × 6 cm) */
        .lcard {
          width:90mm; height:60mm;
          overflow:hidden; border-radius:3px;
          font-family:'Inter',Arial,sans-serif;
          background:#fff; position:relative; flex-shrink:0;
          display:flex; flex-direction:column;
        }

        /* A4 landscape page: 297mm × 210mm */
        .a4l {
          width:297mm; height:210mm;
          background:#fff;
          display:flex; align-items:center; justify-content:center;
          position:relative;
        }

        @media screen {
          body { background:#374151; margin:0; padding:0; font-family:Arial,sans-serif; overflow-x:hidden; }
          /* zoom scales the rendered page to fit the viewport while keeping print at 100% */
          .a4l {
            zoom:0.65;
            box-shadow:0 8px 48px rgba(0,0,0,0.4);
            margin:24px auto;
          }
          .lcard { box-shadow:0 2px 10px rgba(0,0,0,0.16); }
        }
      `}</style>

      {/* ── Control bar ── */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: "#1f2937", borderBottom: "2px solid #374151",
        padding: "10px 20px", display: "flex", alignItems: "center",
        gap: "10px", flexWrap: "wrap",
      }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: "13px", fontFamily: "Arial,sans-serif" }}>
          🖨️ {frontOnly ? "Front ID Cards" : "Duplex ID Cards"} (90×60mm) &nbsp;—&nbsp;
          <span style={{ color: GOLD }}>{group.groupName}</span>
          <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "8px" }}>
            {pilgrims.length} pilgrims · {pages.length} sheet{pages.length !== 1 ? "s" : ""}
            {frontOnly ? " · Front only" : " ×2 pages"} · 9 per sheet
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid #4b5563" }}>
            <button
              onClick={() => setFrontOnly(true)}
              style={{ ...btnBase, borderRadius: 0, padding: "7px 14px", fontSize: "11px",
                background: frontOnly ? GOLD : "#374151", color: frontOnly ? DARK : "#d1d5db", fontWeight: frontOnly ? 900 : 600 }}>
              Front Only
            </button>
            <button
              onClick={() => setFrontOnly(false)}
              style={{ ...btnBase, borderRadius: 0, padding: "7px 14px", fontSize: "11px",
                background: !frontOnly ? GOLD : "#374151", color: !frontOnly ? DARK : "#d1d5db", fontWeight: !frontOnly ? 900 : 600 }}>
              Front + Back
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#d1d5db", fontSize: "12px", cursor: "pointer", fontFamily: "Arial,sans-serif" }}>
            <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} />
            Feedback QR
          </label>
          {!photosReady && <span style={{ color: GOLD, fontSize: "11px", fontFamily: "Arial,sans-serif" }}>⏳ Loading photos…</span>}
          <button onClick={() => window.print()} style={{ ...btnBase, background: "#16a34a", fontSize: "13px", padding: "10px 26px" }}>
            🖨️ {frontOnly ? "Print Fronts" : "Print Duplex"}
          </button>
          <button onClick={() => history.back()} style={{ ...btnBase, background: "#4b5563" }}>← Back</button>
        </div>

        <div style={{ width: "100%", background: "#374151", borderRadius: "6px", padding: "8px 12px", color: "#d1d5db", fontSize: "11px", fontFamily: "Arial,sans-serif", lineHeight: 1.7 }}>
          {frontOnly ? (
            <><b style={{ color: GOLD }}>✅ Front Only print:</b>&nbsp;
              Printer → Paper: <b>A4 Landscape</b> · One-sided · Scale: 100% · Margins: None.
              9 ID cards per sheet — cut along the crop lines.</>
          ) : (
            <><b style={{ color: GOLD }}>✅ Duplex print:</b>&nbsp;
              Printer → Paper: <b>A4 Landscape</b> · Two-sided: <b>Long-edge binding</b> · Scale: 100% · Margins: None.
              Page 1 = FRONT · Page 2 = BACK (columns auto-mirrored for alignment).</>
          )}
        </div>
      </div>
      <div className="no-print" style={{ height: "116px" }} />

      {/* ── Sheet pairs ── */}
      {pages.map((pg, pi) => {
        const frontCells = pad(pg);
        const backCells  = mirrorCols(pg);
        return (
          <div key={pi}>
            {/* FRONT page — always shown */}
            <A4Page
              label={frontOnly ? `Sheet ${pi + 1} of ${pages.length}` : `FRONT — Sheet ${pi + 1} of ${pages.length}`}
              pageRef={el => { if (el) pageElsRef.current[pi * 2] = el!; }}
            >
              {frontCells.map((p, i) => (
                <CardCell key={i}>
                  {p ? <FrontCard {...cardProps(p)} /> : <div className="lcard" style={{ background: "#f9fafb", border: "0.5px dashed #ccc" }} />}
                </CardCell>
              ))}
            </A4Page>

            {/* BACK page — only in duplex mode */}
            {!frontOnly && (
              <A4Page
                label={`BACK — Sheet ${pi + 1} · mirrored for long-edge duplex`}
                pageRef={el => { if (el) pageElsRef.current[pi * 2 + 1] = el!; }}
              >
                {backCells.map((p, i) => (
                  <CardCell key={i}>
                    {p ? <BackCard {...cardProps(p)} /> : <div className="lcard" style={{ background: "#f9fafb", border: "0.5px dashed #ccc" }} />}
                  </CardCell>
                ))}
              </A4Page>
            )}
          </div>
        );
      })}
    </>
  );
}
