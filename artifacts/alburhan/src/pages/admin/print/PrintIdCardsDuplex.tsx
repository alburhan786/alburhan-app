import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { QRCodeCanvas } from "qrcode.react";
import { Barcode } from "@/components/print/Barcode";
import { getCompanyById, type CompanyInfo } from "@/lib/companies";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const API  = import.meta.env.VITE_API_URL || "";
const DARK = "#0d5040";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

/* Card: 55 mm wide × 85 mm tall (portrait)
   A4:   210 mm × 297 mm (portrait)
   Grid: 3 cols × 3 rows = 9 cards per A4 page
   H margins: (210 − 3×55) / 2 = 22.5 mm each side (cards touch, no gap)
   V margins: (297 − 3×85) / 2 = 21 mm top & bottom */
const COLS      = 3;
const ROWS      = 3;
const PER_PAGE  = COLS * ROWS;

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; barcodeId?: string; salutation?: string;
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

/* ─── Wave decorations ───────────────────────────────────────────────────────── */
function WaveFront() {
  return (
    <>
      <div style={{ position:"absolute", top:0, right:0, width:"18mm", height:"24mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"7mm", right:0, width:"11mm", height:"11mm", background:"rgba(255,255,255,0.08)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:"15mm", height:"17mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"5mm", left:0, width:"9mm", height:"10mm", background:"rgba(255,255,255,0.12)", borderRadius:"0 100% 0 0", zIndex:0 }} />
    </>
  );
}
function WaveBack() {
  return (
    <>
      <div style={{ position:"absolute", top:0, right:0, width:"18mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"11mm", height:"11mm", background:"rgba(255,255,255,0.08)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:"14mm", height:"16mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
    </>
  );
}

/* ─── Logo header ────────────────────────────────────────────────────────────── */
function LogoHeader({ company }: { company: CompanyInfo }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1mm" }}>
      <div style={{ fontSize:"18pt", lineHeight:1, flexShrink:0 }}>🇮🇳</div>
      <div style={{ flex:1, textAlign:"center", padding:"0.2mm 1.5mm", background:"rgba(255,255,255,0.92)", borderRadius:"2px" }}>
        <div style={{ fontSize:"9.5pt", fontWeight:900, color:DARK, letterSpacing:"0.5px", lineHeight:1.1 }}>{company.nameShort}</div>
        <div style={{ fontSize:"4.5pt", fontWeight:700, color:GOLD, letterSpacing:"0.5px" }}>TOURS & TRAVELS</div>
      </div>
      <div style={{ flexShrink:0 }}>
        {company.logoUrl
          ? <div style={{ width:"9mm", height:"9mm", borderRadius:"50%", background:"#fff", border:`1.5px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
              <img src={company.logoUrl} alt="" style={{ width:"90%", height:"90%", objectFit:"contain" }} />
            </div>
          : <div style={{ width:"9mm", height:"9mm", borderRadius:"50%", background:DARK, display:"flex", alignItems:"center", justifyContent:"center", color:GOLD, fontWeight:900, fontSize:"4pt" }}>{company.nameShort[0]}</div>
        }
      </div>
    </div>
  );
}

/* ─── Crop marks (L-shaped corners) ─────────────────────────────────────────── */
function CropMarks() {
  const g = "3mm"; const l = "5mm"; const w = "0.3px"; const c = "#777";
  const mk = (t:string, l2:string, wd:string, h:string): React.CSSProperties =>
    ({ position:"absolute", background:c, top:t, left:l2, width:wd, height:h });
  return (
    <>
      <div style={mk(`calc(-1*${g})`,"0",w,l)} />
      <div style={mk(`calc(-1*${l} - ${g})`,`calc(-1*${g})`,l,w)} />
      <div style={mk(`calc(-1*${g})`,"100%",w,l)} />
      <div style={mk(`calc(-1*${l} - ${g})`,`calc(100% - ${g} + 0.5px)`,l,w)} />
      <div style={mk("100%","0",w,l)} />
      <div style={mk(`calc(100% + ${g})`,`calc(-1*${g})`,l,w)} />
      <div style={mk("100%","100%",w,l)} />
      <div style={mk(`calc(100% + ${g})`,`calc(100% - ${g} + 0.5px)`,l,w)} />
    </>
  );
}

/* ─── FRONT card — 55 mm × 85 mm portrait ───────────────────────────────────── */
function FrontCard({ p, group, company, photoDataUrl }: {
  p: Pilgrim; group: Group; company: CompanyInfo; photoDataUrl: string;
}) {
  const photoSrc = photoDataUrl || (p.photoUrl ? `${API}${p.photoUrl}` : "");
  const barcodeVal = (p.barcodeId || p.passportNumber || p.id)
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9\-. ]/g, "")
    .trim();
  const serial = String(p.serialNumber).padStart(3, "0");

  return (
    <div className="id55">
      <WaveFront />

      {/* Body content — height stops before absolute footer */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", padding:"2mm 3mm 0", height:"48mm" }}>
        <LogoHeader company={company} />

        {/* Passport photo */}
        <div style={{ display:"flex", justifyContent:"center", marginTop:"1.5mm", marginBottom:"1.2mm" }}>
          {photoSrc
            ? <img src={photoSrc} alt=""
                style={{ width:"30mm", height:"33mm", objectFit:"cover", objectPosition:"top center",
                  borderRadius:"4px", border:`3px solid ${GOLD}`, boxShadow:`0 0 0 1.5px ${DARK}`,
                  WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties} />
            : <div style={{ width:"30mm", height:"33mm", background:"#f0f0f0", borderRadius:"4px",
                border:`3px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"5pt", color:"#aaa", fontWeight:600 }}>PHOTO</div>
          }
        </div>

        {/* Name & year */}
        <div style={{ textAlign:"center", marginBottom:"1mm" }}>
          <div style={{ fontSize:"7.5pt", fontWeight:900, color:DARK, textTransform:"uppercase",
            lineHeight:1.2, wordBreak:"break-word" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName || "—"}
          </div>
          <div style={{ fontSize:"5pt", color:GOLD, fontWeight:700, marginTop:"0.4mm" }}>HAJJ {group.year}</div>
        </div>

        {/* Info rows */}
        <div style={{ display:"flex", flexDirection:"column", gap:"0.7mm", fontSize:"5pt", paddingLeft:"1mm" }}>
          <div>
            <span style={{ color:"#888", fontSize:"4pt" }}>Serial: </span>
            <span style={{ fontWeight:700, color:DARK }}>#{serial}</span>
          </div>
          <div>
            <span style={{ color:"#888", fontSize:"4pt" }}>Passport: </span>
            <span style={{ fontWeight:600, fontFamily:"monospace" }}>{p.passportNumber || "—"}</span>
          </div>
          {p.mobileIndia && (
            <div>
              <span style={{ color:"#888", fontSize:"4pt" }}>Mobile: </span>
              <span style={{ fontWeight:600 }}>{p.mobileIndia}</span>
            </div>
          )}
          {/* Service center — always shown with gold highlight */}
          <div style={{ background:`${GOLD}28`, border:`1px solid ${GOLD}60`, borderRadius:"2px",
            padding:"0.5mm 1mm", marginTop:"0.3mm" }}>
            <span style={{ color:"#888", fontSize:"4pt" }}>Service Ctr: </span>
            <span style={{ fontWeight:900, color:DARK, fontSize:"7pt" }}>{group.maktabNumber || "—"}</span>
          </div>
        </div>
      </div>

      {/* Footer — absolute, always sticks to bottom */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:2 }}>
        {/* QR code */}
        <div style={{ display:"flex", justifyContent:"center", padding:"1mm 2mm 0.6mm", background:"#fff" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.3mm" }}>
            <div style={{ background:"#fff", padding:"3px", border:"1.5px solid #333", borderRadius:"3px" }}>
              <QRCodeCanvas value={buildVerifyUrl(p.id)} size={60} level="M" fgColor="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ fontSize:"2.8pt", color:DARK, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN TO VERIFY</div>
          </div>
        </div>
        {/* Barcode */}
        <div style={{ background:"#fff", padding:"0mm 2mm 0.5mm", borderTop:"0.5px solid #eee" }}>
          <Barcode value={barcodeVal || "ALBURHAN"} format="CODE128" height={14} width={1.4} fontSize={5} displayValue />
        </div>
        {/* Contact bar */}
        <div style={{ background:DARK, color:GOLD, padding:"0.7mm 2mm", fontSize:"3pt", textAlign:"center",
          fontWeight:800, letterSpacing:"0.2px",
          WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          {company.name} &nbsp;|&nbsp; 🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}
        </div>
      </div>
    </div>
  );
}

/* ─── BACK card — 55 mm × 85 mm portrait ────────────────────────────────────── */
function BackCard({ p, group, company }: { p: Pilgrim; group: Group; company: CompanyInfo }) {
  const dot: React.CSSProperties = {
    width:"2.5mm", height:"2.5mm", borderRadius:"50%",
    background:GOLD, flexShrink:0, marginTop:"0.6mm",
  };
  return (
    <div className="id55">
      <WaveBack />
      <div style={{ position:"relative", zIndex:1, height:"100%", display:"flex", flexDirection:"column", padding:"2.5mm 3mm 0" }}>
        <LogoHeader company={company} />

        {/* Pilgrim name */}
        <div style={{ fontSize:"7pt", fontWeight:900, color:DARK, textTransform:"uppercase",
          lineHeight:1.2, wordBreak:"break-word", marginBottom:"1.5mm",
          borderBottom:`1px solid ${GOLD}50`, paddingBottom:"1mm" }}>
          {p.salutation ? `${p.salutation} ` : ""}{p.fullName || "—"}
        </div>

        {/* Dot-list info */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1.6mm", fontSize:"5.5pt", lineHeight:1.4 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div>
              <span style={{ color:"#888", fontSize:"4.5pt" }}>Passport No. </span>
              <span style={{ fontFamily:"monospace", fontWeight:600 }}>{p.passportNumber || "—"}</span>
            </div>
          </div>
          {/* Service center big & highlighted */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div style={{ background:`${GOLD}25`, border:`1px solid ${GOLD}55`, borderRadius:"2px", padding:"0.5mm 1.5mm", flex:1 }}>
              <div style={{ color:"#888", fontSize:"4pt", textTransform:"uppercase" }}>Service Centre No.</div>
              <div style={{ fontWeight:900, fontSize:"11pt", color:DARK, lineHeight:1.1 }}>{group.maktabNumber || "—"}</div>
            </div>
          </div>
          {group.hotels?.makkah?.name && (
            <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
              <div style={dot} />
              <div>
                <span style={{ color:"#888", fontSize:"4.5pt" }}>Makkah Hotel: </span>
                <span style={{ fontWeight:600 }}>{group.hotels.makkah.name}</span>
                {group.hotels.makkah.nameAr && (
                  <div style={{ fontSize:"5pt", direction:"rtl", textAlign:"right", fontWeight:600 }}>{group.hotels.makkah.nameAr}</div>
                )}
              </div>
            </div>
          )}
          {group.hotels?.madinah?.name && (
            <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
              <div style={dot} />
              <div>
                <span style={{ color:"#888", fontSize:"4.5pt" }}>Madinah Hotel: </span>
                <span style={{ fontWeight:600 }}>{group.hotels.madinah.name}</span>
                {group.hotels.madinah.nameAr && (
                  <div style={{ fontSize:"5pt", direction:"rtl", textAlign:"right", fontWeight:600 }}>{group.hotels.madinah.nameAr}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* QR code — pushed toward center */}
        <div style={{ display:"flex", justifyContent:"center", marginTop:"auto", paddingBottom:"18mm" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
            <div style={{ background:"#fff", padding:"4px", borderRadius:"3px", border:`1.5px solid #333` }}>
              <QRCodeCanvas value={buildVerifyUrl(p.id)} size={72} level="M" fgColor="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ fontSize:"2.8pt", color:DARK, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN TO VERIFY</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:"3pt", color:"#666", padding:"0 3mm", marginBottom:"0.4mm" }}>
          <div>Group: <b style={{ color:DARK }}>{group.groupName}</b></div>
          <div>Year: <b style={{ color:DARK }}>{group.year}</b></div>
        </div>
        <div style={{ background:DARK, color:"#fff", padding:"1mm 2mm", fontSize:"3pt", fontWeight:900,
          textAlign:"center", lineHeight:1.5,
          WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div>{company.address}</div>
          <div style={{ color:GOLD, marginTop:"0.3mm" }}>🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Card cell wrapper (provides crop marks) ────────────────────────────────── */
function CardCell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position:"relative", display:"inline-flex", flexShrink:0, width:"55mm", height:"85mm" }}>
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
          position:"absolute", top:"8mm", left:"50%", transform:"translateX(-50%)",
          background:DARK, color:GOLD, fontSize:"9px", fontWeight:700,
          padding:"3px 14px", borderRadius:"20px", letterSpacing:"0.5px",
          fontFamily:"Arial,sans-serif", whiteSpace:"nowrap", zIndex:10,
        }}>{label}</div>
      )}
      <div style={{
        display:"grid",
        gridTemplateColumns:`repeat(${COLS}, 55mm)`,
        gridTemplateRows:`repeat(${ROWS}, 85mm)`,
        gap:"0",
      }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */
export default function PrintIdCardsDuplex() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-duplex");
  const groupId = params?.groupId || "";

  const [group,         setGroup]         = useState<Group | null>(null);
  const [pilgrims,      setPilgrims]      = useState<Pilgrim[]>([]);
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const [companyId,     setCompanyId]     = useState("alburhan");
  const [photosReady,   setPhotosReady]   = useState(false);
  const [error,         setError]         = useState("");

  const pageElsRef = useRef<HTMLDivElement[]>([]);
  const company    = getCompanyById(companyId);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`,          { credentials:"include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials:"include" }).then(r => r.json()),
    ]).then(async ([g, all]) => {
      setGroup(g);
      if (g.companyId) setCompanyId(g.companyId);
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

  /* Pad page to full grid with nulls */
  function pad(pg: Pilgrim[]): (Pilgrim | null)[] {
    const a: (Pilgrim | null)[] = [...pg];
    while (a.length < PER_PAGE) a.push(null);
    return a;
  }

  /* Long-edge duplex: reverse columns per row so back aligns with front
     Front row: [A B C]  → Back page row: [C B A]
     When paper is flipped on long (right) edge, C lands on A's position. */
  function mirrorCols(pg: Pilgrim[]): (Pilgrim | null)[] {
    const padded = pad(pg);
    const out: (Pilgrim | null)[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = padded.slice(r * COLS, r * COLS + COLS);
      out.push(...[...row].reverse());
    }
    return out;
  }

  /* Reset page refs on each render */
  pageElsRef.current = [];

  if (error) return (
    <div style={{ padding:"60px", textAlign:"center", color:"red", fontFamily:"Arial", fontSize:"16px" }}>{error}</div>
  );
  if (!group) return (
    <div style={{ padding:"60px", textAlign:"center", fontFamily:"Arial", fontSize:"16px" }}>Loading…</div>
  );

  const btnBase: React.CSSProperties = {
    border:"none", borderRadius:"6px", fontWeight:700, cursor:"pointer",
    fontSize:"12px", padding:"9px 18px", color:"#fff",
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

        /* ID card: 55 mm wide × 85 mm tall */
        .id55 {
          width:55mm; height:85mm;
          overflow:hidden; border-radius:4px;
          font-family:'Inter',Arial,sans-serif;
          background:#fff; position:relative; flex-shrink:0;
        }

        /* A4 portrait page */
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
            margin:80px auto 0;
          }
          .a4p:last-of-type { margin-bottom:80px; }
          .id55 { box-shadow:0 2px 12px rgba(0,0,0,0.18); }
        }
      `}</style>

      {/* ── Fixed control bar ── */}
      <div className="no-print" style={{
        position:"fixed", top:0, left:0, right:0, zIndex:999,
        background:"#1f2937", borderBottom:"2px solid #374151",
        padding:"10px 20px", display:"flex", alignItems:"center",
        gap:"10px", flexWrap:"wrap",
      }}>
        <div style={{ color:"#fff", fontWeight:800, fontSize:"13px", fontFamily:"Arial,sans-serif" }}>
          🖨️ Duplex ID Cards (55×85mm) &nbsp;—&nbsp;
          <span style={{ color:GOLD }}>{group.groupName}</span>
          <span style={{ color:"#9ca3af", fontWeight:400, marginLeft:"8px" }}>
            {pilgrims.length} pilgrims · {pages.length} sheet{pages.length !== 1 ? "s" : ""} ×2 pages
          </span>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:"8px", flexWrap:"wrap" }}>
          {!photosReady && (
            <span style={{ color:GOLD, fontSize:"11px", fontFamily:"Arial,sans-serif", alignSelf:"center" }}>
              ⏳ Loading photos…
            </span>
          )}
          <button onClick={() => window.print()} style={{ ...btnBase, background:"#16a34a", fontSize:"13px", padding:"10px 24px" }}>
            🖨️ Print Duplex
          </button>
          <button onClick={() => history.back()} style={{ ...btnBase, background:"#4b5563" }}>
            ← Back
          </button>
        </div>

        {/* Instructions */}
        <div style={{ width:"100%", background:"#374151", borderRadius:"6px", padding:"8px 12px",
          color:"#d1d5db", fontSize:"11px", fontFamily:"Arial,sans-serif", lineHeight:1.7 }}>
          <b style={{ color:GOLD }}>✅ How to print duplex:</b>&nbsp;
          In your printer dialog → <b>Two-sided printing: Long-edge binding (Flip on Long Edge)</b> · Paper: A4 · Scale: 100% · No margins.
          &nbsp;Page 1 = FRONT &nbsp;|&nbsp; Page 2 = BACK (columns automatically mirrored for perfect alignment).
          &nbsp;Repeat for each sheet pair.
        </div>
      </div>

      {/* Spacer for fixed bar */}
      <div className="no-print" style={{ height:"118px" }} />

      {/* ── Sheets ── */}
      {pages.map((pg, pi) => {
        const frontCells = pad(pg);
        const backCells  = mirrorCols(pg);
        const frontPageIdx = pi * 2;
        const backPageIdx  = pi * 2 + 1;

        return (
          <div key={pi}>
            {/* FRONT page */}
            <A4Page
              label={`FRONT — Sheet ${pi + 1} of ${pages.length}`}
              pageRef={el => { if (el) pageElsRef.current[frontPageIdx] = el; }}
            >
              {frontCells.map((p, i) => (
                <CardCell key={i}>
                  {p
                    ? <FrontCard p={p} group={group} company={company} photoDataUrl={photoDataUrls[p.id] || ""} />
                    : <div className="id55" style={{ background:"#f9fafb", border:"0.5px dashed #ddd" }} />
                  }
                </CardCell>
              ))}
            </A4Page>

            {/* BACK page — columns mirrored */}
            <A4Page
              label={`BACK — Sheet ${pi + 1} · columns mirrored for long-edge duplex`}
              pageRef={el => { if (el) pageElsRef.current[backPageIdx] = el; }}
            >
              {backCells.map((p, i) => (
                <CardCell key={i}>
                  {p
                    ? <BackCard p={p} group={group} company={company} />
                    : <div className="id55" style={{ background:"#f9fafb", border:"0.5px dashed #ddd" }} />
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
