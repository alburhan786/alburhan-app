import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import JsBarcode from "jsbarcode";

/* Generate barcode as PNG data URL synchronously — avoids useEffect timing gaps */
function makeBarcodeDataUrl(value: string, height = 40): string {
  if (!value) return "";
  try {
    const safe = value.replace(/[^\x00-\x7F]/g, "");
    if (!safe) return "";
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, safe, {
      format: "CODE128", width: 1.5, height, fontSize: 0,
      displayValue: false, margin: 4,
      background: "#ffffff", lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

const API         = import.meta.env.VITE_API_URL || "";
const BASE        = import.meta.env.BASE_URL.replace(/\/$/, "") || "";
const DARK        = "#0d5040";
const GOLD        = "#C9A84C";
const GOLD_LIGHT  = "#E8D48B";
/* 54 mm × 85 mm at 300 DPI = 638 × 1004 px → scale = 300/96 ≈ 3.125 */
const PRINT_SCALE = 300 / 96;

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; barcodeId?: string;
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

/* ─── Shared header ─────────────────────────────────────────────────────────── */
function CardHeader({ company }: { company: CompanyInfo }) {
  return (
    <div style={{ padding:"2.5mm 2.5mm 0", position:"relative", zIndex:1 }}>
      {/* Logo absolutely placed on the dark corner decoration */}
      <div style={{ position:"absolute", top:"1.5mm", right:"1.5mm", width:"11mm", height:"11mm", borderRadius:"50%", background:"#fff", border:`1.5px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", zIndex:2 }}>
        {company.logoUrl
          ? <img src={company.logoUrl} alt="" style={{ width:"88%", height:"88%", objectFit:"contain" }} />
          : <span style={{ fontWeight:900, fontSize:"4pt", color:DARK }}>{company.nameShort.slice(0,1)}</span>
        }
      </div>
      {/* Flag + name — padded right so text never enters the dark decoration zone */}
      <div style={{ display:"flex", alignItems:"center", gap:"1.5mm", paddingRight:"13mm" }}>
        <div style={{ fontSize:"24pt", lineHeight:1, flexShrink:0 }}>🇮🇳</div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:"9.5pt", fontWeight:900, color:DARK, letterSpacing:"0.3px", lineHeight:1.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{company.nameShort}</div>
          <div style={{ fontSize:"4pt", fontWeight:700, color:GOLD, letterSpacing:"0.5px", lineHeight:1.3 }}>TOURS & TRAVELS</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Front card — 54 mm × 85 mm — matches reference design ────────────────── */
function FrontCard({ p, group, company, photoDataUrl, barcodeDataUrl }: { p:Pilgrim; group:Group; company:CompanyInfo; photoDataUrl:string; barcodeDataUrl:string }) {
  const photoSrc = photoDataUrl || (p.photoUrl ? `${API}${p.photoUrl}` : "");
  const dot: React.CSSProperties = { width:"2.5mm", height:"2.5mm", minWidth:"2.5mm", borderRadius:"50%", background:GOLD, marginTop:"0.5mm" };
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      {/* Decorations */}
      <div style={{ position:"absolute", top:0, right:0, width:"20mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"11mm", height:"12mm", background:"rgba(255,255,255,0.09)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"12.5mm", left:0, width:"9mm", height:"10mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"15mm", left:0, width:"5mm", height:"6mm", background:"rgba(255,255,255,0.18)", borderRadius:"0 100% 0 0", zIndex:0 }} />

      {/* Header */}
      <CardHeader company={company} />

      {/* Circular photo */}
      <div style={{ display:"flex", justifyContent:"center", marginTop:"2mm", position:"relative", zIndex:1 }}>
        <div style={{ width:"28mm", height:"28mm", borderRadius:"50%", border:`2.5mm solid ${GOLD}`, overflow:"hidden", flexShrink:0, background:"#f0f0f0" }}>
          {photoSrc
            ? <img src={photoSrc} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top center", WebkitPrintColorAdjust:"exact", printColorAdjust:"exact", display:"block" } as React.CSSProperties} />
            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"5pt", color:"#aaa", fontWeight:600 }}>PHOTO</div>
          }
        </div>
      </div>

      {/* Name + HAJJ year */}
      <div style={{ textAlign:"center", margin:"2mm 3mm 1.5mm", position:"relative", zIndex:1 }}>
        <div style={{ fontSize:"8pt", fontWeight:900, color:DARK, textTransform:"uppercase", lineHeight:1.2, wordBreak:"break-word" }}>{p.fullName || "—"}</div>
        <div style={{ fontSize:"5pt", fontWeight:700, color:GOLD, marginTop:"0.8mm", letterSpacing:"0.8px" }}>HAJJ {group.year}</div>
      </div>

      {/* Info rows (left) + QR (right) */}
      <div style={{ display:"flex", alignItems:"flex-start", padding:"0 2mm 0 3mm", gap:"1mm", position:"relative", zIndex:1, overflow:"hidden" }}>
        {/* Info rows */}
        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:"1.8mm" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div style={{ fontSize:"4.5pt", lineHeight:1.3, minWidth:0, overflow:"hidden" }}>
              <span style={{ color:"#888" }}>Serial No. </span>
              <span style={{ fontWeight:800, color:DARK }}>#{String(p.serialNumber).padStart(3,"0")}</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div style={{ fontSize:"4.5pt", lineHeight:1.3, minWidth:0, overflow:"hidden" }}>
              <span style={{ color:"#888" }}>Passport No. </span>
              <span style={{ fontWeight:700, fontFamily:"monospace" }}>{p.passportNumber||"—"}</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div style={{ fontSize:"4.5pt", lineHeight:1.3, minWidth:0, overflow:"hidden" }}>
              <span style={{ color:"#888" }}>Mobile (India) </span>
              <span style={{ fontWeight:700 }}>{p.mobileIndia||"—"}</span>
            </div>
          </div>
        </div>
        {/* QR code — right, fixed width so it never spills out */}
        <div style={{ width:"14mm", flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
          <QRCodeSVG value={buildVerifyUrl(p.id)} size={48} level="M" fgColor="#000000" bgColor="#ffffff" style={{ display:"block", maxWidth:"100%" }} />
          <div style={{ fontSize:"3pt", color:DARK, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN</div>
        </div>
      </div>

      {/* Barcode + footer — absolute bottom */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:2 }}>
        <div style={{ background:"#fff", padding:"1mm 2mm" }}>
          {barcodeDataUrl
            ? <img src={barcodeDataUrl} alt="barcode" style={{ display:"block", width:"100%", height:"auto" }} />
            : <div style={{ fontSize:"4pt", color:"#999", textAlign:"center", padding:"2mm 0" }}>{group.groupName}</div>
          }
        </div>
        <div style={{ background:DARK, padding:"1.5mm 2mm", textAlign:"center", lineHeight:1.6, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div style={{ color:"#fff", fontSize:"4pt", fontWeight:900, letterSpacing:"0.3px" }}>{company.name}</div>
          <div style={{ color:"#fff", fontSize:"4pt", fontWeight:800, marginTop:"0.3mm" }}>🇮🇳 {company.phone} | ☎ {company.phoneSaudi}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Back card — 54 mm × 85 mm — matches reference design ─────────────────── */
function BackCard({ p, group, company }: { p:Pilgrim; group:Group; company:CompanyInfo }) {
  const dot: React.CSSProperties = { width:"2.5mm", height:"2.5mm", minWidth:"2.5mm", borderRadius:"50%", background:GOLD, marginTop:"0.5mm", flexShrink:0 };
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      {/* Decorations */}
      <div style={{ position:"absolute", top:0, right:0, width:"20mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"11mm", height:"12mm", background:"rgba(255,255,255,0.09)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"10mm", left:0, width:"14mm", height:"16mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"14mm", left:0, width:"8mm", height:"9mm", background:"rgba(255,255,255,0.18)", borderRadius:"0 100% 0 0", zIndex:0 }} />

      {/* Header */}
      <CardHeader company={company} />

      {/* Info rows */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:"2mm", padding:"2mm 3mm 0", fontSize:"5pt", lineHeight:1.35 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
          <div style={dot} />
          <div><span style={{ color:"#888" }}>Passport No. </span><span style={{ fontFamily:"monospace", fontWeight:700 }}>{p.passportNumber||"—"}</span></div>
        </div>
        <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
          <div style={dot} />
          <div><span style={{ color:"#888" }}>Maktab: </span><span style={{ fontWeight:700 }}>{group.maktabNumber||"—"}</span></div>
        </div>
        {group.hotels?.makkah?.name && (
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div>
              <span style={{ color:"#888" }}>Makkah Hotel: </span>
              <span style={{ fontWeight:800, color:DARK }}>{group.hotels.makkah.name}</span>
              {group.hotels.makkah.nameAr && <div style={{ fontSize:"4.5pt", direction:"rtl", textAlign:"right", color:"#555" }}>{group.hotels.makkah.nameAr}</div>}
              {group.hotels.makkah.address && <div style={{ fontSize:"4pt", color:"#777", marginTop:"0.3mm" }}>{group.hotels.makkah.address}</div>}
            </div>
          </div>
        )}
        {group.hotels?.madinah?.name && (
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div>
              <span style={{ color:"#888" }}>Madinah Hotel: </span>
              <span style={{ fontWeight:800, color:DARK }}>{group.hotels.madinah.name}</span>
              {group.hotels.madinah.nameAr && <div style={{ fontSize:"4.5pt", direction:"rtl", textAlign:"right", color:"#555" }}>{group.hotels.madinah.nameAr}</div>}
              {group.hotels.madinah.address && <div style={{ fontSize:"4pt", color:"#777", marginTop:"0.3mm" }}>{group.hotels.madinah.address}</div>}
            </div>
          </div>
        )}
      </div>

      {/* QR — centered */}
      <div style={{ position:"relative", zIndex:1, display:"flex", justifyContent:"center", marginTop:"2.5mm" }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
          <div style={{ background:"#fff", padding:"4px", borderRadius:"3px", border:`1.5px solid ${DARK}` }}>
            <QRCodeSVG value={buildVerifyUrl(p.id)} size={72} level="M" fgColor="#000000" bgColor="#ffffff" />
          </div>
          <div style={{ fontSize:"3pt", color:DARK, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:"3.2pt", color:"#555", padding:"1mm 3mm 0.5mm", background:"#fff" }}>
          <div style={{ flex:1 }}>Group: <b style={{ color:DARK }}>{group.groupName}</b></div>
          <div style={{ flex:1, textAlign:"center" }}><b style={{ color:DARK, textTransform:"uppercase" }}>{p.fullName}</b></div>
          <div style={{ flex:1, textAlign:"right" }}>Year: <b style={{ color:DARK }}>{group.year}</b></div>
        </div>
        <div style={{ background:DARK, color:"#fff", padding:"1.5mm 2mm", fontSize:"3.2pt", fontWeight:900, textAlign:"center", lineHeight:1.6, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div>{company.address}</div>
          <div style={{ color:GOLD, marginTop:"0.3mm" }}>🇮🇳 {company.phone} | ☎ {company.phoneSaudi}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Crop marks ───────────────────────────────────────────────────────────── */
function CropMarks() {
  const g = "4mm"; const l = "6mm"; const w = "0.35px"; const c = "#555";
  const m = (t:string,l2:string,w2:string,h:string): React.CSSProperties => ({ position:"absolute", background:c, top:t, left:l2, width:w2, height:h });
  return (
    <>
      <div style={m(`calc(-1*${g})`,"0",w,l)} /><div style={m(`calc(-1*${l} - ${g})`,`calc(-1*${g})`,l,w)} />
      <div style={m(`calc(-1*${g})`,`100%`,w,l)} /><div style={m(`calc(-1*${l} - ${g})`,`calc(100% - ${g} + 1px)`,l,w)} />
      <div style={m(`100%`,"0",w,l)} /><div style={m(`calc(100% + ${g})`,`calc(-1*${g})`,l,w)} />
      <div style={m(`100%`,`100%`,w,l)} /><div style={m(`calc(100% + ${g})`,`calc(100% - ${g} + 1px)`,l,w)} />
    </>
  );
}

/* ─── Canvas capture helper ────────────────────────────────────────────────── */
async function captureEl(el: HTMLElement, scale: number): Promise<HTMLCanvasElement|null> {
  try {
    const c = await html2canvas(el, { useCORS:true, allowTaint:true, backgroundColor:"#ffffff", logging:false, imageTimeout:15000, scale });
    return c.width > 0 && c.height > 0 ? c : null;
  } catch { return null; }
}

/* ─── Main component ───────────────────────────────────────────────────────── */
export default function PrintSingleCard() {
  /* Route matching — three entry points all handled here */
  const [, pFront] = useRoute("/admin/groups/:groupId/print/id-card-front/:pilgrimId");
  const [, pBack]  = useRoute("/admin/groups/:groupId/print/id-card-back/:pilgrimId");
  const [, pOld]   = useRoute("/admin/groups/:groupId/print/single-card/:pilgrimId");
  const params    = pFront || pBack || pOld;
  const groupId   = params?.groupId   || "";
  const pilgrimId = params?.pilgrimId || "";
  const side: "front"|"back" = pBack ? "back" : "front";

  const [, navigate] = useLocation();

  const [group,          setGroup]          = useState<Group   |null>(null);
  const [pilgrim,        setPilgrim]        = useState<Pilgrim |null>(null);
  const [allPilgrims,    setAllPilgrims]    = useState<Pilgrim[]>([]);
  const [photoDataUrl,   setPhotoDataUrl]   = useState("");
  const [barcodeDataUrl, setBarcodeDataUrl] = useState("");
  const [companyId,      setCompanyId]      = useState("alburhan");
  const [error,          setError]          = useState("");
  const [dlState,        setDlState]        = useState<string|null>(null);
  const [printTarget,    setPrintTarget]    = useState<"front"|"back"|null>(null);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef  = useRef<HTMLDivElement>(null);
  const company  = getCompanyById(companyId);

  // Auto-scroll to the correct card when side changes
  useEffect(() => {
    const ref = side === "back" ? backRef : frontRef;
    if (ref.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [side, pilgrimId]);

  const frontUrl = (pid: string) => `${BASE}/admin/groups/${groupId}/print/id-card-front/${pid}`;
  const backUrl  = (pid: string) => `${BASE}/admin/groups/${groupId}/print/id-card-back/${pid}`;

  useEffect(() => {
    if (!groupId || !pilgrimId) return;
    setPhotoDataUrl("");
    setBarcodeDataUrl("");
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`,          { credentials:"include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials:"include" }).then(r => r.json()),
    ]).then(async ([g, all]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(all) ? all : [];
      setAllPilgrims(list);
      const found = list.find(p => p.id === pilgrimId);
      if (found) {
        setPilgrim(found);
        /* Compute barcode immediately — synchronous, no timing gap */
        const barcodeVal = found.barcodeId || found.passportNumber || "";
        setBarcodeDataUrl(makeBarcodeDataUrl(barcodeVal));
        if (found.photoUrl) {
          const d = await fetchAsDataUrl(`${API}${found.photoUrl}`);
          setPhotoDataUrl(d || "");
        }
      } else {
        setError("Pilgrim not found");
      }
    }).catch(() => setError("Failed to load data"));
  }, [groupId, pilgrimId]);

  const currentIdx  = allPilgrims.findIndex(p => p.id === pilgrimId);
  const prevPilgrim = currentIdx > 0                        ? allPilgrims[currentIdx - 1] : null;
  const nextPilgrim = currentIdx < allPilgrims.length - 1   ? allPilgrims[currentIdx + 1] : null;
  const goTo = (pid: string) => navigate(side === "back" ? backUrl(pid) : frontUrl(pid));

  /* Download one side as PDF or PNG */
  const dl = async (dlSide:"front"|"back", fmt:"pdf"|"png") => {
    const el = dlSide === "front" ? frontRef.current : backRef.current;
    if (!el || !pilgrim) return;
    const key = `${dlSide}-${fmt}`;
    setDlState(key);
    const slug = pilgrim.fullName.replace(/[^a-z0-9]/gi,"-").toLowerCase();
    try {
      /* Wait for any async renders (photos, etc.) to settle */
      await new Promise(r => setTimeout(r, 400));
      const canvas =
        await captureEl(el, PRINT_SCALE) ??
        await captureEl(el, 3)          ??
        await captureEl(el, 2);
      if (!canvas) { alert(`Failed to render ${dlSide} card.`); return; }

      if (fmt === "png") {
        const blob = await new Promise<Blob|null>(res => canvas.toBlob(res,"image/png",1));
        if (blob) saveAs(blob, `id-card-${dlSide}-${slug}.png`);
      } else {
        /* Centre the 54×85 mm card on A4 */
        const dataUrl = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
        const cardW = 54; const cardH = 85;
        pdf.addImage(dataUrl,"PNG",(210-cardW)/2,(297-cardH)/2,cardW,cardH);
        /* Thin dashed crop guide */
        pdf.setDrawColor(180); pdf.setLineWidth(0.15);
        pdf.setLineDashPattern([1,1],0);
        pdf.rect((210-cardW)/2-3,(297-cardH)/2-3,cardW+6,cardH+6);
        pdf.save(`id-card-${dlSide}-${slug}.pdf`);
      }
    } finally { setDlState(null); }
  };

  /* Print — hide one side via CSS class, then restore */
  const doPrint = (target:"front"|"back") => {
    setPrintTarget(target);
    setTimeout(() => { window.print(); setTimeout(() => setPrintTarget(null), 800); }, 120);
  };

  if (error) return <div style={{ padding:"60px", textAlign:"center", color:"red", fontFamily:"Arial", fontSize:"16px" }}>{error}</div>;
  if (!group||!pilgrim) return <div style={{ padding:"60px", textAlign:"center", fontFamily:"Arial", fontSize:"16px" }}>Loading…</div>;

  const btnBase: React.CSSProperties = { border:"none", borderRadius:"6px", fontWeight:700, cursor:"pointer", fontSize:"11px", padding:"8px 12px", color:"#fff" };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; margin:0; padding:0; background:#fff!important; }
          .no-print  { display:none!important; }
          .a4-page   { box-shadow:none!important; margin:0!important; page-break-after:always; break-after:page; }
          .a4-page:last-of-type { page-break-after:auto; break-after:auto; }
          .hide-print { display:none!important; }
        }
        * { box-sizing:border-box; }
        .id-card {
          width:54mm; height:85mm;
          overflow:hidden; border-radius:4px;
          font-family:'Inter',Arial,sans-serif;
          background:#fff; position:relative; flex-shrink:0;
        }
        .a4-page {
          width:210mm; height:297mm; background:#fff;
          display:flex; align-items:center; justify-content:center;
          position:relative;
        }
        .card-wrap { position:relative; display:inline-flex; }
        .crop-mark { position:absolute; background:#555; }
        .cut-guide {
          position:absolute; inset:-4mm;
          border:0.8px dashed #bbb; pointer-events:none;
        }
        .side-badge {
          position:absolute; top:9mm; left:50%; transform:translateX(-50%);
          font-size:9px; font-weight:700; padding:3px 12px; border-radius:20px;
          font-family:Arial,sans-serif; white-space:nowrap; letter-spacing:0.3px;
        }
        @media screen {
          body { background:#374151; margin:0; padding:0; font-family:Arial,sans-serif; }
          .a4-page { box-shadow:0 8px 48px rgba(0,0,0,0.4); margin:72px auto 40px; }
          .id-card  { box-shadow:0 2px 12px rgba(0,0,0,0.18); }
        }
      `}</style>

      {/* ── Fixed Toolbar ── */}
      <div className="no-print" style={{
        position:"fixed", top:0, left:0, right:0, zIndex:500,
        background:DARK, padding:"7px 12px",
        display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap",
        boxShadow:"0 2px 20px rgba(0,0,0,0.5)",
      }}>
        {/* Back */}
        <button onClick={() => navigate(`${BASE}/admin/groups/${groupId}/print/id-cards`)}
          style={{ padding:"7px 11px", background:"rgba(255,255,255,0.12)", color:"#fff", border:"none", borderRadius:"6px", fontWeight:700, cursor:"pointer", fontSize:"12px" }}>
          ← Back
        </button>

        {/* Pilgrim nav */}
        <button onClick={() => prevPilgrim&&goTo(prevPilgrim.id)} disabled={!prevPilgrim}
          style={{ padding:"6px 10px", background:prevPilgrim?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)", color:prevPilgrim?"#fff":"rgba(255,255,255,0.25)", border:"none", borderRadius:"6px", fontWeight:900, cursor:prevPilgrim?"pointer":"default", fontSize:"15px" }}>
          ‹
        </button>
        <div>
          <div style={{ fontWeight:900, fontSize:"13px", color:"#fff" }}>{pilgrim.fullName}</div>
          <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.5)" }}>
            #{String(pilgrim.serialNumber).padStart(3,"0")} · {currentIdx+1}/{allPilgrims.length} · {group.groupName} {group.year}
          </div>
        </div>
        <button onClick={() => nextPilgrim&&goTo(nextPilgrim.id)} disabled={!nextPilgrim}
          style={{ padding:"6px 10px", background:nextPilgrim?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)", color:nextPilgrim?"#fff":"rgba(255,255,255,0.25)", border:"none", borderRadius:"6px", fontWeight:900, cursor:nextPilgrim?"pointer":"default", fontSize:"15px" }}>
          ›
        </button>

        {/* Pilgrim dropdown */}
        <select value={pilgrimId} onChange={e=>goTo(e.target.value)}
          style={{ padding:"6px 8px", borderRadius:"6px", border:"none", fontSize:"11px", background:"rgba(255,255,255,0.12)", color:"#fff", cursor:"pointer", maxWidth:"170px" }}>
          {allPilgrims.map(p=>(
            <option key={p.id} value={p.id} style={{ background:DARK }}>
              #{String(p.serialNumber).padStart(3,"0")} {p.fullName}
            </option>
          ))}
        </select>

        {/* Front / Back toggle */}
        <div style={{ display:"flex", gap:"3px", background:"rgba(0,0,0,0.3)", borderRadius:"8px", padding:"3px" }}>
          <a href={frontUrl(pilgrimId)} style={{ padding:"6px 14px", borderRadius:"6px", fontWeight:700, fontSize:"12px", textDecoration:"none", cursor:"pointer", background:side==="front"?GOLD:"transparent", color:side==="front"?DARK:"rgba(255,255,255,0.7)" }}>FRONT</a>
          <a href={backUrl(pilgrimId)}  style={{ padding:"6px 14px", borderRadius:"6px", fontWeight:700, fontSize:"12px", textDecoration:"none", cursor:"pointer", background:side==="back"?GOLD:"transparent", color:side==="back"?DARK:"rgba(255,255,255,0.7)" }}>BACK</a>
        </div>

        {/* Company */}
        <select value={companyId} onChange={e=>setCompanyId(e.target.value)}
          style={{ padding:"6px 8px", borderRadius:"6px", border:"none", fontSize:"11px", background:"rgba(255,255,255,0.12)", color:"#fff", cursor:"pointer", maxWidth:"155px" }}>
          {COMPANIES.map(c=><option key={c.id} value={c.id} style={{ background:DARK }}>{c.id==="alburhan"?"Al Burhan":c.name}</option>)}
        </select>

        {/* ── 6 action buttons ── */}
        <div style={{ marginLeft:"auto", display:"flex", gap:"5px", flexWrap:"wrap", alignItems:"center" }}>
          <button onClick={()=>doPrint("front")} style={{ ...btnBase, background:"#fff", color:DARK, fontSize:"12px", fontWeight:900 }}>🖨 Print Front</button>
          <button onClick={()=>doPrint("back")}  style={{ ...btnBase, background:GOLD, color:DARK, fontSize:"12px", fontWeight:900 }}>🖨 Print Back</button>
          <button onClick={()=>dl("front","pdf")} disabled={!!dlState} style={{ ...btnBase, background:dlState==="front-pdf"?"#6b7280":"#1d4ed8" }}>{dlState==="front-pdf"?"⏳…":"⬇ Front PDF"}</button>
          <button onClick={()=>dl("front","png")} disabled={!!dlState} style={{ ...btnBase, background:dlState==="front-png"?"#6b7280":"#059669" }}>{dlState==="front-png"?"⏳…":"⬇ Front PNG"}</button>
          <button onClick={()=>dl("back","pdf")}  disabled={!!dlState} style={{ ...btnBase, background:dlState==="back-pdf"?"#6b7280":"#7c3aed" }}>{dlState==="back-pdf"?"⏳…":"⬇ Back PDF"}</button>
          <button onClick={()=>dl("back","png")}  disabled={!!dlState} style={{ ...btnBase, background:dlState==="back-png"?"#6b7280":"#b45309" }}>{dlState==="back-png"?"⏳…":"⬇ Back PNG"}</button>
        </div>
      </div>

      {/* ── FRONT — A4 page ── */}
      <div ref={frontRef} className={`a4-page${printTarget==="back"?" hide-print":""}`}>
        <div className="card-wrap">
          <CropMarks />
          <div className="cut-guide" />
          <FrontCard p={pilgrim} group={group} company={company} photoDataUrl={photoDataUrl} barcodeDataUrl={barcodeDataUrl} />
        </div>
        <div className="side-badge no-print" style={{ background:"#dbeafe", color:"#1e40af" }}>
          ▲ FRONT — {pilgrim.fullName} &nbsp;·&nbsp; 54 mm × 85 mm &nbsp;·&nbsp; 300 DPI ready
        </div>
      </div>

      {/* ── BACK — A4 page ── */}
      <div ref={backRef} className={`a4-page${printTarget==="front"?" hide-print":""}`}>
        <div className="card-wrap">
          <CropMarks />
          <div className="cut-guide" />
          <BackCard p={pilgrim} group={group} company={company} />
        </div>
        <div className="side-badge no-print" style={{ background:"#fee2e2", color:"#991b1b" }}>
          ▼ BACK — {pilgrim.fullName} &nbsp;·&nbsp; 54 mm × 85 mm &nbsp;·&nbsp; 300 DPI ready
        </div>
      </div>
    </>
  );
}
