import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadMultiPagePdf, downloadPagesAsJpg, downloadPagesAsPng, downloadAsPdf, downloadAsJpg, downloadAsPng, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

const MASHARIQ_EN = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR = "شركة مشارق الماسية";
const INDIA_PHONES = ["9893989786", "9893225590"];
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";
const DARK = "#0d5040";
const GOLD = "#C9A23F";

const COLS = 3;
const ROWS = 3;
const CARDS_PER_BATCH = COLS * ROWS;

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
    makkah?:  { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

interface CardProps {
  p: Pilgrim; group: Group;
  company: ReturnType<typeof getCompanyById>;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
  photoDataUrls: Record<string, string>;
}

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

function FrontCard({ p, group, company, photoDataUrls }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = p.barcodeId || p.passportNumber || `HAJ${serial}`;
  const barcodeFormat = p.barcodeId ? "CODE128" : "CODE39";

  return (
    <div className="pro-card">
      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2mm 1mm", display: "flex", alignItems: "center", gap: "2mm" }}>
        <div style={{ fontSize: "26pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        {company.logoUrl ? (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: "#fff", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "6pt", flexShrink: 0 }}>AB</div>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: "19mm", flexShrink: 0, background: "#f0f7f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0.8mm", borderRight: `1.5px solid ${GOLD}` }}>
          {p.photoUrl ? (
            <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt=""
              style={{ width: "16mm", height: "19mm", objectFit: "cover", objectPosition: "top center", border: `2px solid ${GOLD}`, borderRadius: "2px" }} />
          ) : (
            <div style={{ width: "16mm", height: "19mm", background: "#e0e8e4", border: `2px solid ${GOLD}`, borderRadius: "2px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "3pt", color: "#888", fontWeight: 700 }}>
              <div style={{ fontSize: "9pt", color: GOLD }}>👤</div>
              <div>PHOTO</div>
            </div>
          )}
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, marginTop: "0.5mm" }}>#{serial}</div>
        </div>

        <div style={{ flex: 1, padding: "1.2mm 1mm 0.5mm 2mm", display: "flex", flexDirection: "column", overflow: "hidden", gap: "0.9mm" }}>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word", borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.6mm" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
            </div>
          )}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
            </div>
          )}
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber}</div>
            </div>
          )}
          <div style={{ marginTop: "auto", borderTop: `1px solid ${GOLD}40`, paddingTop: "0.5mm" }}>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{INDIA_PHONES[0]} &nbsp;|&nbsp; {INDIA_PHONES[1]}</div>
          </div>
        </div>

        <div style={{ width: "22mm", flexShrink: 0, padding: "1.5mm 1.5mm 0.5mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: `1px solid ${GOLD}50` }}>
          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2.5px solid ${DARK}` }}>
            <QRCodeCanvas value={buildVerifyUrl(p.id)} size={56} level="M" fgColor={DARK} />
          </div>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", letterSpacing: "0.2px", textAlign: "center" }}>SCAN TO VERIFY</div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "0 1.5mm 0.3mm", background: "#fff" }}>
        <Barcode value={barcodeVal} format={barcodeFormat} height={22} displayValue fontSize={5} />
      </div>

      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8mm" }}>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{p.salutation ? `${p.salutation} ` : ""}{p.fullName}</div>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Mobile No.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>🆘 Emergency (Saudi)</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "8.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{p.mobileIndia || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: CardProps) {
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);
  return (
    <div className="pro-card">
      <div style={{ background: DARK, padding: "1mm 2.5mm", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, textAlign: "right", flexShrink: 0 }}>{company.phone}</div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: "43mm", flexShrink: 0, padding: "1.2mm 2mm 1mm", borderRight: `1px solid ${GOLD}40`, display: "flex", flexDirection: "column", gap: "1mm" }}>
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
              <div style={{ fontSize: "13pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber}</div>
            </div>
          )}
          <div style={{ background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm", borderLeft: `2.5px solid ${GOLD}` }}>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif" }}>{MASHARIQ_AR}</div>
            <div style={{ fontSize: "2.8pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>🆘 Emergency (Saudi)</div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        </div>

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
                {addr && <div style={{ fontSize: "4pt", fontWeight: 700, color: "#555", lineHeight: 1.2 }}>{addr}</div>}
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
              <div style={{ fontSize: "2.8pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
            </div>
          )}
        </div>
      </div>

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

/**
 * For "flip on short edge" duplex: when the paper is flipped along the bottom edge,
 * the top row of the front becomes the bottom row of the back.
 * So back page row order = front page rows reversed: [row2, row1, row0].
 * Columns are NOT mirrored.
 */
function reverseRowsForShortEdge(batch: Pilgrim[]): Pilgrim[] {
  const out: Pilgrim[] = [];
  for (let row = ROWS - 1; row >= 0; row--) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      if (batch[idx]) out.push(batch[idx]);
    }
  }
  return out;
}

export default function PrintIdCardsDuplex() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-duplex");
  const groupId = params?.groupId || "";
  const [group, setGroup]       = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap]         = useState<Record<string, string>>({});
  const [dlState, setDlState]               = useState<string | null>(null);
  const [photoDataUrls, setPhotoDataUrls]   = useState<Record<string, string>>({});
  const contentRef  = useRef<HTMLDivElement>(null);
  const pageElsRef  = useRef<HTMLElement[]>([]);

  const dlCards = async (fmt: "pdf" | "jpg" | "png") => {
    const pageEls = pageElsRef.current.filter(Boolean);
    setDlState(fmt);
    try {
      const name = `id-cards-duplex-${group?.groupName || "group"}`;
      const els = pageEls.length > 0 ? pageEls : (contentRef.current ? [contentRef.current] : []);
      if (els.length === 0) return;
      if (fmt === "pdf") await downloadMultiPagePdf(els, name);
      else if (fmt === "png") await downloadPagesAsPng(els, name);
      else await downloadPagesAsJpg(els, name);
    } finally { setDlState(null); }
  };

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`,          { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(async ([g, p, bm]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(p) ? p : [];
      setPilgrims(list);
      setBookingMap(bm || {});
      const entries = await Promise.all(
        list.filter(x => x.photoUrl).map(async x => {
          const d = await fetchAsDataUrl(`${API}${x.photoUrl}`);
          return [x.id, d] as [string, string];
        })
      );
      setPhotoDataUrls(Object.fromEntries(entries.filter(([, v]) => v)));
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading…</div>;

  // Split into batches of 9
  const batches: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += CARDS_PER_BATCH)
    batches.push(pilgrims.slice(i, i + CARDS_PER_BATCH));

  // Reset page refs on every render
  pageElsRef.current = [];

  const cardProps = (p: Pilgrim): CardProps => ({
    p, group, company, showFeedbackQr, bookingMap, photoDataUrls,
  });

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .duplex-a4 { box-shadow: none !important; }
          .duplex-wrapper { padding: 0 !important; gap: 0 !important; background: white !important; }
        }
        * { box-sizing: border-box; }

        .pro-card {
          width: 90mm;
          height: 55mm;
          border: 1px solid #ccc;
          border-radius: 3px;
          overflow: hidden;
          font-family: Arial, sans-serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* A4 landscape page container */
        .duplex-a4 {
          width: 297mm;
          height: 210mm;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          page-break-after: always;
          break-after: page;
          flex-shrink: 0;
        }
        .duplex-a4:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        /* 3×3 grid */
        .duplex-grid {
          display: grid;
          grid-template-columns: repeat(3, 90mm);
          grid-template-rows: repeat(3, 55mm);
          gap: 3mm;
        }

        @media screen {
          .duplex-a4 {
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            border-radius: 4px;
            margin-bottom: 4mm;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#fff", borderBottom: "2px solid #e5e7eb",
        padding: "10px 20px", display: "flex", flexWrap: "wrap",
        alignItems: "center", gap: "10px",
      }}>
        <div style={{ fontWeight: 800, fontSize: "15px", color: DARK }}>
          🖨 Duplex ID Cards — {group.groupName} · {pilgrims.length} pilgrims · {batches.length} pair{batches.length !== 1 ? "s" : ""} of pages
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} />
            Feedback QR
          </label>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            🖨 Print
          </button>
          <button onClick={() => dlCards("pdf")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "pdf" ? "⏳ Generating…" : "⬇ PDF"}
          </button>
          <button onClick={() => dlCards("png")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "png" ? "#6b7280" : "#059669", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "png" ? "⏳ Generating…" : "⬇ PNG"}
          </button>
          <button onClick={() => dlCards("jpg")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "jpg" ? "#6b7280" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "jpg" ? "⏳ Generating…" : "⬇ JPG"}
          </button>
        </div>
      </div>

      {/* ── Print instruction bar ── */}
      <div className="no-print" style={{
        padding: "8px 20px", fontSize: "12px", fontWeight: 600,
        background: "#f0fdf4", borderBottom: "2px solid #86efac", color: "#15803d",
        display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center",
      }}>
        <span>📄 Paper: A4 Landscape</span>
        <span>🔄 Duplex: ON — Flip on <strong>Short Edge</strong></span>
        <span>📏 Scale: 100%</span>
        <span>📦 {CARDS_PER_BATCH} cards per page · Page 1 = FRONT · Page 2 = BACK (same {CARDS_PER_BATCH} pilgrims, rows reversed for alignment)</span>
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} className="duplex-wrapper" style={{ background: "#f5f5f0", padding: "8mm", display: "flex", flexDirection: "column", gap: "8mm" }}>
        {batches.map((batch, bi) => {
          const backBatch = reverseRowsForShortEdge(batch);
          const frontIdx = bi * 2;
          const backIdx  = bi * 2 + 1;
          return (
            <div key={bi}>
              {/* ── Front page label ── */}
              <div className="no-print" style={{ fontSize: "11px", color: "#555", marginBottom: "3mm", fontStyle: "italic", fontWeight: 600 }}>
                Batch {bi + 1} — Page {frontIdx + 1} · <span style={{ color: "#15803d" }}>FRONT</span> · {batch.length} cards
              </div>

              {/* ── Front A4 page ── */}
              <div className="duplex-a4" ref={el => { if (el) pageElsRef.current[frontIdx] = el as HTMLElement; }}>
                <div className="duplex-grid">
                  {batch.map(p => (
                    <FrontCard key={p.id} {...cardProps(p)} />
                  ))}
                </div>
              </div>

              {/* ── Back page label ── */}
              <div className="no-print" style={{ fontSize: "11px", color: "#555", margin: "3mm 0", fontStyle: "italic", fontWeight: 600 }}>
                Batch {bi + 1} — Page {backIdx + 1} · <span style={{ color: "#1d4ed8" }}>BACK</span> · rows reversed for short-edge flip alignment
              </div>

              {/* ── Back A4 page ── */}
              <div className="duplex-a4" ref={el => { if (el) pageElsRef.current[backIdx] = el as HTMLElement; }}>
                <div className="duplex-grid">
                  {backBatch.map(p => (
                    <BackCard key={p.id} {...cardProps(p)} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
