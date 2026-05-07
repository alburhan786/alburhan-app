import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { QRCodeCanvas } from "qrcode.react";
import { Barcode } from "@/components/print/Barcode";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";

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

/* ─── Wave decorations ─────────────────────────────────────────────────────── */
function WaveShapes() {
  return (
    <>
      <div style={{ position:"absolute", top:0, right:0, width:"16mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"10mm", height:"10mm", background:"rgba(255,255,255,0.08)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:"14mm", height:"16mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"4mm", left:0, width:"8mm", height:"9mm", background:"rgba(255,255,255,0.15)", borderRadius:"0 100% 0 0", zIndex:0 }} />
    </>
  );
}
function WaveShapesBack() {
  return (
    <>
      <div style={{ position:"absolute", top:0, right:0, width:"16mm", height:"20mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"5mm", right:0, width:"10mm", height:"10mm", background:"rgba(255,255,255,0.08)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:"12mm", height:"14mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
    </>
  );
}

/* ─── Logo header ──────────────────────────────────────────────────────────── */
function LogoHeader({ company }: { company: CompanyInfo }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1mm" }}>
      <div style={{ fontSize:"18pt", lineHeight:1, flexShrink:0 }}>🇮🇳</div>
      <div style={{ flex:1, textAlign:"center", padding:"0 1.5mm" }}>
        <div style={{ fontSize:"9.5pt", fontWeight:900, color:DARK, letterSpacing:"0.5px", lineHeight:1.1 }}>{company.nameShort}</div>
        <div style={{ fontSize:"4.5pt", fontWeight:700, color:GOLD, letterSpacing:"0.5px", lineHeight:1.2 }}>TOURS & TRAVELS</div>
      </div>
      <div style={{ flexShrink:0 }}>
        {company.logoUrl
          ? <div style={{ width:"9mm", height:"9mm", borderRadius:"50%", background:"#fff", border:`1.5px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
              <img src={company.logoUrl} alt="" style={{ width:"90%", height:"90%", objectFit:"contain" }} />
            </div>
          : <div style={{ width:"9mm", height:"9mm", borderRadius:"50%", background:DARK, display:"flex", alignItems:"center", justifyContent:"center", color:GOLD, fontWeight:900, fontSize:"4pt" }}>{company.nameShort.slice(0,1)}</div>
        }
      </div>
    </div>
  );
}

/* ─── Front card — 54 mm × 85 mm portrait ─────────────────────────────────── */
function FrontCard({ p, group, company, photoDataUrl }: { p:Pilgrim; group:Group; company:CompanyInfo; photoDataUrl:string }) {
  const photoSrc = photoDataUrl || (p.photoUrl ? `${API}${p.photoUrl}` : "");
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      <WaveShapes />
      {/* Main content — stops before footer */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", padding:"2mm 3mm 0", height:"52mm" }}>
        <LogoHeader company={company} />

        {/* Photo — passport style, larger */}
        <div style={{ display:"flex", justifyContent:"center", marginTop:"1.5mm", marginBottom:"1.5mm" }}>
          {photoSrc
            ? <img src={photoSrc} alt="" style={{ width:"28mm", height:"32mm", objectFit:"cover", objectPosition:"top center", borderRadius:"4px", border:`3px solid ${GOLD}`, boxShadow:`0 0 0 1.5px ${DARK}`, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties} />
            : <div style={{ width:"28mm", height:"32mm", background:"#f0f0f0", borderRadius:"4px", border:`3px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"5pt", color:"#aaa", fontWeight:600 }}>PHOTO</div>
          }
        </div>

        {/* Name + year */}
        <div style={{ textAlign:"center", marginBottom:"1.5mm" }}>
          <div style={{ fontSize:"7.5pt", fontWeight:900, color:DARK, textTransform:"uppercase", lineHeight:1.2, wordBreak:"break-word" }}>{p.fullName || "—"}</div>
          <div style={{ fontSize:"5pt", color:GOLD, fontWeight:700, marginTop:"0.5mm" }}>HAJJ {group.year}</div>
        </div>

        {/* Info rows */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1mm", fontSize:"5pt", paddingLeft:"1mm" }}>
          <div><span style={{ color:"#888", fontSize:"4pt" }}>Serial: </span><span style={{ fontWeight:700, color:DARK }}>#{String(p.serialNumber).padStart(3,"0")}</span></div>
          <div><span style={{ color:"#888", fontSize:"4pt" }}>Passport: </span><span style={{ fontWeight:600, fontFamily:"monospace" }}>{p.passportNumber||"—"}</span></div>
          <div><span style={{ color:"#888", fontSize:"4pt" }}>Mobile: </span><span style={{ fontWeight:600 }}>{p.mobileIndia||"—"}</span></div>
        </div>
      </div>

      {/* Footer — QR + barcode + contact bar, all stacked cleanly */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:2 }}>
        {/* QR — separate from barcode with its own white zone */}
        <div style={{ display:"flex", justifyContent:"center", padding:"1.5mm 2mm 1mm", background:"#fff" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
            <div style={{ background:"#fff", padding:"3px", border:"1.5px solid #333", borderRadius:"3px" }}>
              <QRCodeCanvas value={buildVerifyUrl(p.id)} size={64} level="M" fgColor="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ fontSize:"3pt", color:DARK, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN TO VERIFY</div>
          </div>
        </div>
        {/* Barcode — clear white zone */}
        <div style={{ background:"#fff", padding:"0.5mm 2mm 1mm", borderTop:"0.5px solid #eee" }}>
          {(p.barcodeId||p.passportNumber)
            ? <Barcode value={p.barcodeId||p.passportNumber!} format="CODE128" height={18} width={1.3} fontSize={5} />
            : <div style={{ fontSize:"4pt", color:"#999", textAlign:"center" }}>{group.groupName}</div>
          }
        </div>
        {/* Contact bar */}
        <div style={{ background:DARK, color:GOLD, padding:"1mm 2mm", fontSize:"3.5pt", textAlign:"center", fontWeight:800, letterSpacing:"0.2px", WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          {company.name} | 🇮🇳 {company.phone} | 🇸🇦 {company.phoneSaudi}
        </div>
      </div>
    </div>
  );
}

/* ─── Back card — 54 mm × 85 mm portrait ──────────────────────────────────── */
function BackCard({ p, group, company }: { p:Pilgrim; group:Group; company:CompanyInfo }) {
  const dot: React.CSSProperties = { width:"2.5mm", height:"2.5mm", borderRadius:"50%", background:GOLD, flexShrink:0, marginTop:"0.6mm" };
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      <WaveShapesBack />
      <div style={{ position:"relative", zIndex:1, height:"100%", display:"flex", flexDirection:"column", padding:"2.5mm 3mm 0" }}>
        <LogoHeader company={company} />

        {/* Info */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1.8mm", marginTop:"2.5mm", fontSize:"5.5pt", lineHeight:1.4 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div><span style={{ color:"#888", fontSize:"4.5pt" }}>Passport No. </span><span style={{ fontFamily:"monospace", fontWeight:600 }}>{p.passportNumber||"—"}</span></div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div><span style={{ color:"#888", fontSize:"4.5pt" }}>Maktab: </span><span style={{ fontWeight:600 }}>{group.maktabNumber||"—"}</span></div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div>
              <span style={{ color:"#888", fontSize:"4.5pt" }}>Makkah Hotel: </span>
              <span style={{ fontWeight:600 }}>{group.hotels?.makkah?.name||"—"}</span>
              {group.hotels?.makkah?.nameAr && <div style={{ fontSize:"4.5pt", direction:"rtl", textAlign:"right" }}>{group.hotels.makkah.nameAr}</div>}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div>
              <span style={{ color:"#888", fontSize:"4.5pt" }}>Madinah Hotel: </span>
              <span style={{ fontWeight:600 }}>{group.hotels?.madinah?.name||"—"}</span>
              {group.hotels?.madinah?.nameAr && <div style={{ fontSize:"4.5pt", direction:"rtl", textAlign:"right" }}>{group.hotels.madinah.nameAr}</div>}
            </div>
          </div>
        </div>

        {/* QR */}
        <div style={{ display:"flex", justifyContent:"center", marginTop:"2.5mm" }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
            <div style={{ background:"#fff", padding:"4px", borderRadius:"3px", border:`1.5px solid #333` }}>
              <QRCodeCanvas value={buildVerifyUrl(p.id)} size={72} level="M" fgColor="#000000" bgColor="#ffffff" />
            </div>
            <div style={{ fontSize:"3pt", color:DARK, fontWeight:700, textTransform:"uppercase" }}>SCAN</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:"3.5pt", color:"#666", padding:"0 3mm", marginBottom:"0.5mm" }}>
          <div>Group: <b style={{ color:DARK }}>{group.groupName}</b></div>
          <div><b style={{ color:DARK }}>{p.fullName}</b></div>
          <div>Year: <b style={{ color:DARK }}>{group.year}</b></div>
        </div>
        <div style={{ background:DARK, color:"#fff", padding:"1mm 2mm", fontSize:"3.5pt", fontWeight:900, textAlign:"center", lineHeight:1.5, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div>{company.address}</div>
          <div style={{ color:GOLD, marginTop:"0.3mm" }}>🇮🇳 {company.phone} | 🇸🇦 {company.phoneSaudi}</div>
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

  const [group,        setGroup]        = useState<Group   |null>(null);
  const [pilgrim,      setPilgrim]      = useState<Pilgrim |null>(null);
  const [allPilgrims,  setAllPilgrims]  = useState<Pilgrim[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [companyId,    setCompanyId]    = useState("alburhan");
  const [error,        setError]        = useState("");
  const [dlState,      setDlState]      = useState<string|null>(null);
  const [printTarget,  setPrintTarget]  = useState<"front"|"back"|null>(null);

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
          <FrontCard p={pilgrim} group={group} company={company} photoDataUrl={photoDataUrl} />
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
