import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { fetchAsDataUrl } from "@/lib/downloadUtils";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";
import JsBarcode from "jsbarcode";

const API        = import.meta.env.VITE_API_URL || "";
const BASE       = import.meta.env.BASE_URL.replace(/\/$/, "") || "";
const DARK       = "#0d5040";
const GOLD       = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";
const PER_PAGE   = 9;

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; barcodeId?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: {
    makkah?:  { name?: string; nameAr?: string; address?: string };
    madinah?: { name?: string; nameAr?: string; address?: string };
  };
}

function makeBarcodeDataUrl(value: string, height = 13): string {
  if (!value) return "";
  try {
    const safe = value.replace(/[^\x00-\x7F]/g, "");
    if (!safe) return "";
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, safe, {
      format: "CODE128", width: 1.2, height, fontSize: 0,
      displayValue: false, margin: 3,
      background: "#ffffff", lineColor: "#000000",
    });
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

function buildVerifyUrl(id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

function CardHeader({ company }: { company: CompanyInfo }) {
  return (
    <div style={{ padding:"3mm 3mm 0", position:"relative", zIndex:1 }}>
      <div style={{ position:"absolute", top:"3mm", right:"3mm", width:"11mm", height:"11mm", borderRadius:"50%", background:"#fff", border:`1.5px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", zIndex:2 }}>
        {company.logoUrl
          ? <img src={company.logoUrl} alt="" style={{ width:"88%", height:"88%", objectFit:"contain" }} />
          : <span style={{ fontWeight:900, fontSize:"4pt", color:DARK }}>{company.nameShort.slice(0,1)}</span>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:"1.5mm", paddingRight:"13mm" }}>
        <div style={{ fontSize:"22pt", lineHeight:1, flexShrink:0 }}>🇮🇳</div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:"9pt", fontWeight:900, color:DARK, letterSpacing:"0.3px", lineHeight:1.1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{company.nameShort}</div>
          <div style={{ fontSize:"3.5pt", fontWeight:700, color:GOLD, letterSpacing:"0.5px", lineHeight:1.3 }}>TOURS &amp; TRAVELS</div>
        </div>
      </div>
    </div>
  );
}

function FrontCard({ p, group, company, photoDataUrl, barcodeDataUrl }: { p:Pilgrim; group:Group; company:CompanyInfo; photoDataUrl:string; barcodeDataUrl:string }) {
  const photoSrc = photoDataUrl || (p.photoUrl ? `${API}${p.photoUrl}` : "");
  const dot = { width:"2.5mm", height:"2.5mm", minWidth:"2.5mm", borderRadius:"50%", background:GOLD, marginTop:"0.5mm" } as React.CSSProperties;
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      <div style={{ position:"absolute", top:0, right:0, width:"20mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"11mm", height:"12mm", background:"rgba(255,255,255,0.09)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"12.5mm", left:0, width:"9mm", height:"10mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"15mm", left:0, width:"5mm", height:"6mm", background:"rgba(255,255,255,0.18)", borderRadius:"0 100% 0 0", zIndex:0 }} />

      <CardHeader company={company} />

      <div style={{ display:"flex", justifyContent:"center", marginTop:"1.5mm", position:"relative", zIndex:1 }}>
        <div style={{ width:"23mm", height:"23mm", borderRadius:"50%", border:`2mm solid ${GOLD}`, overflow:"hidden", flexShrink:0, background:"#f0f0f0" }}>
          {photoSrc
            ? <img src={photoSrc} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top center", display:"block" } as React.CSSProperties} />
            : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"5pt", color:"#aaa", fontWeight:600 }}>PHOTO</div>}
        </div>
      </div>

      <div style={{ textAlign:"center", margin:"1.5mm 3mm 1mm", position:"relative", zIndex:1 }}>
        <div style={{ fontSize:"7.5pt", fontWeight:900, color:DARK, textTransform:"uppercase", lineHeight:1.2, wordBreak:"break-word" }}>{p.fullName || "—"}</div>
        <div style={{ fontSize:"4.5pt", fontWeight:700, color:GOLD, marginTop:"0.5mm", letterSpacing:"0.8px" }}>HAJJ {group.year}</div>
      </div>

      <div style={{ display:"flex", alignItems:"flex-start", padding:"0 3mm", gap:"1mm", position:"relative", zIndex:1, overflow:"hidden" }}>
        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:"1.5mm" }}>
          {[
            { label:"Serial No. ", value:`#${String(p.serialNumber).padStart(3,"0")}`, mono:false },
            { label:"Passport No. ", value:p.passportNumber||"—", mono:true },
            { label:"Mobile (India) ", value:p.mobileIndia||"—", mono:false },
          ].map(({ label, value, mono }) => (
            <div key={label} style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
              <div style={dot} />
              <div style={{ fontSize:"5.5pt", lineHeight:1.3, minWidth:0, overflow:"hidden" }}>
                <span style={{ color:"#555" }}>{label}</span>
                <span style={{ fontWeight:700, color:DARK, fontFamily: mono ? "monospace" : undefined }}>{value}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ width:"14mm", flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
          <QRCodeCanvas value={buildVerifyUrl(p.id)} size={48} level="M" bgColor="#ffffff" fgColor="#000000" style={{ display:"block" }} />
          <div style={{ fontSize:"3pt", color:DARK, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN</div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:2 }}>
        <div style={{ background:"#fff", padding:"0.8mm 3mm" }}>
          {barcodeDataUrl
            ? <img src={barcodeDataUrl} alt="barcode" style={{ display:"block", width:"100%", height:"auto" }} />
            : <div style={{ fontSize:"4pt", color:"#999", textAlign:"center", padding:"1.5mm 0" }}>{group.groupName}</div>}
        </div>
        <div style={{ background:DARK, padding:"1.2mm 3mm", textAlign:"center", lineHeight:1.5, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div style={{ color:"#fff", fontSize:"3.5pt", fontWeight:900, letterSpacing:"0.3px" }}>{company.name}</div>
          <div style={{ color:"#fff", fontSize:"3.5pt", fontWeight:800, marginTop:"0.2mm" }}>🇮🇳 {company.phone} | ☎ {company.phoneSaudi}</div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company }: { p:Pilgrim; group:Group; company:CompanyInfo }) {
  const dot = { width:"2.5mm", height:"2.5mm", minWidth:"2.5mm", borderRadius:"50%", background:GOLD, marginTop:"0.5mm", flexShrink:0 } as React.CSSProperties;
  return (
    <div className="id-card" style={{ width:"54mm", height:"85mm" }}>
      <div style={{ position:"absolute", top:0, right:0, width:"20mm", height:"22mm", background:DARK, borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", top:"6mm", right:0, width:"11mm", height:"12mm", background:"rgba(255,255,255,0.09)", borderRadius:"0 0 0 100%", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"10mm", left:0, width:"14mm", height:"16mm", background:`linear-gradient(135deg,${GOLD},${GOLD_LIGHT})`, borderRadius:"0 100% 0 0", zIndex:0 }} />
      <div style={{ position:"absolute", bottom:"14mm", left:0, width:"8mm", height:"9mm", background:"rgba(255,255,255,0.18)", borderRadius:"0 100% 0 0", zIndex:0 }} />

      <CardHeader company={company} />

      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:"2mm", padding:"2mm 3mm 0", fontSize:"5pt", lineHeight:1.35 }}>
        {[
          { label:"Passport No. ", value:p.passportNumber||"—", mono:true },
          { label:"Maktab: ", value:group.maktabNumber||"—", mono:false },
          ...(group.hotels?.makkah?.name ? [{ label:"Makkah Hotel: ", value:group.hotels.makkah.name!, mono:false }] : []),
          ...(group.hotels?.madinah?.name ? [{ label:"Madinah Hotel: ", value:group.hotels.madinah.name!, mono:false }] : []),
        ].map(({ label, value, mono }) => (
          <div key={label} style={{ display:"flex", alignItems:"flex-start", gap:"1.5mm" }}>
            <div style={dot} />
            <div><span style={{ color:"#555" }}>{label}</span><span style={{ fontWeight:800, color:DARK, fontFamily: mono ? "monospace" : undefined }}>{value}</span></div>
          </div>
        ))}
      </div>

      <div style={{ position:"relative", zIndex:1, display:"flex", justifyContent:"center", marginTop:"2mm" }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5mm" }}>
          <div style={{ background:"#fff", padding:"3px", borderRadius:"3px", border:`1.5px solid ${DARK}` }}>
            <QRCodeSVG value={buildVerifyUrl(p.id)} size={64} level="M" fgColor="#000000" bgColor="#ffffff" />
          </div>
          <div style={{ fontSize:"3pt", color:DARK, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.3px" }}>SCAN</div>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:"3pt", color:"#555", padding:"0.8mm 3mm 0.4mm", background:"#fff" }}>
          <div>Grp: <b style={{ color:DARK }}>{group.groupName}</b></div>
          <div><b style={{ color:DARK, textTransform:"uppercase" }}>{p.fullName}</b></div>
          <div>Yr: <b style={{ color:DARK }}>{group.year}</b></div>
        </div>
        <div style={{ background:DARK, color:"#fff", padding:"1.2mm 3mm", fontSize:"3pt", fontWeight:900, textAlign:"center", lineHeight:1.5, WebkitPrintColorAdjust:"exact", printColorAdjust:"exact" } as React.CSSProperties}>
          <div>{company.address}</div>
          <div style={{ color:GOLD, marginTop:"0.2mm" }}>🇮🇳 {company.phone} | ☎ {company.phoneSaudi}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Main sheet component ─────────────────────────────────────────────────── */
export default function PrintSheetCards() {
  const [, params]  = useRoute("/admin/groups/:groupId/print/id-card-sheet");
  const [, navigate] = useLocation();
  const groupId = params?.groupId || "";

  const [group,      setGroup]      = useState<Group|null>(null);
  const [pilgrims,   setPilgrims]   = useState<Pilgrim[]>([]);
  const [page,       setPage]       = useState(0);
  const [photoMap,   setPhotoMap]   = useState<Record<string,string>>({});
  const [barcodeMap, setBarcodeMap] = useState<Record<string,string>>({});
  const [companyId,  setCompanyId]  = useState("alburhan");
  const [side,       setSide]       = useState<"front"|"back">("front");
  const [error,      setError]      = useState("");

  const company      = getCompanyById(companyId);
  const totalPages   = Math.ceil(pilgrims.length / PER_PAGE);
  const pagePilgrims = pilgrims.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const emptySlots   = PER_PAGE - pagePilgrims.length;

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`,          { credentials:"include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials:"include" }).then(r => r.json()),
    ]).then(([g, all]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(all) ? all : [];
      setPilgrims(list);
      const bm: Record<string,string> = {};
      list.forEach(p => { bm[p.id] = makeBarcodeDataUrl(p.barcodeId || p.passportNumber || ""); });
      setBarcodeMap(bm);
    }).catch(() => setError("Failed to load data"));
  }, [groupId]);

  useEffect(() => {
    pagePilgrims.forEach(p => {
      if (p.photoUrl && !photoMap[p.id]) {
        fetchAsDataUrl(`${API}${p.photoUrl}`).then(url => {
          if (url) setPhotoMap(m => ({ ...m, [p.id]: url }));
        });
      }
    });
  }, [page, pilgrims]);

  const btn = (active?: boolean): React.CSSProperties => ({
    border:"none", borderRadius:"6px", fontWeight:700, cursor:"pointer",
    fontSize:"12px", padding:"7px 14px", color: active ? DARK : "#fff",
    background: active ? GOLD : "rgba(255,255,255,0.15)",
  });

  if (error)  return <div style={{ padding:"60px", textAlign:"center", color:"red" }}>{error}</div>;
  if (!group) return <div style={{ padding:"60px", textAlign:"center", color:"#fff" }}>Loading…</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin:0; padding:0; background:#fff!important;
                 -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
          .no-print  { display:none!important; }
          .sheet-pad { padding-top:0!important; }
        }
        * { box-sizing:border-box; }
        .id-card {
          width:54mm; height:85mm; overflow:hidden; border-radius:3px;
          font-family:'Inter',Arial,sans-serif; background:#fff; position:relative; flex-shrink:0;
        }
        @media screen {
          body { background:#374151; margin:0; padding:0; }
          .id-card { box-shadow:0 1px 6px rgba(0,0,0,0.2); }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        position:"fixed", top:0, left:0, right:0, zIndex:500,
        background:DARK, padding:"7px 14px",
        display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap",
        boxShadow:"0 2px 20px rgba(0,0,0,0.4)",
      }}>
        <button onClick={() => navigate(`${BASE}/admin/groups/${groupId}/print/id-cards`)} style={btn()}>← Back</button>

        <div style={{ color:"#fff", fontWeight:900, fontSize:"13px" }}>
          {group.groupName} {group.year} &nbsp;|&nbsp;
          <span style={{ fontWeight:400, fontSize:"11px", color:"rgba(255,255,255,0.65)" }}>
            Sheet {page+1}/{Math.max(totalPages,1)} &nbsp;({pilgrims.length} pilgrims)
          </span>
        </div>

        {/* Front / Back */}
        <div style={{ display:"flex", gap:"3px", background:"rgba(0,0,0,0.3)", borderRadius:"8px", padding:"3px" }}>
          <button onClick={() => setSide("front")} style={btn(side==="front")}>FRONT</button>
          <button onClick={() => setSide("back")}  style={btn(side==="back")}>BACK</button>
        </div>

        {/* Page navigation */}
        <button onClick={() => setPage(p => Math.max(0, p-1))}           disabled={page === 0}              style={{ ...btn(), opacity: page === 0 ? 0.4 : 1 }}>‹ Prev</button>
        <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}    style={{ ...btn(), opacity: page >= totalPages-1 ? 0.4 : 1 }}>Next ›</button>

        {/* Company */}
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          style={{ padding:"6px 8px", borderRadius:"6px", border:"none", fontSize:"11px", background:"rgba(255,255,255,0.12)", color:"#fff", cursor:"pointer" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id} style={{ background:DARK }}>{c.id==="alburhan"?"Al Burhan":c.name}</option>)}
        </select>

        <button onClick={() => window.print()} style={{ ...btn(), background:"#059669", fontSize:"13px", fontWeight:900, marginLeft:"auto" }}>🖨 Print Sheet</button>
      </div>

      {/* ── A4 Sheet ── */}
      <div className="sheet-pad" style={{ paddingTop:"62px" }}>
        <div style={{
          width:"210mm", height:"297mm", background:"#fff",
          display:"grid",
          /* 3 cols × 54mm + 2 gaps × 12mm + 2 padding × 12mm = 210mm */
          gridTemplateColumns:"repeat(3, 54mm)",
          /* 3 rows × 85mm + 2 gaps × 10.5mm + 2 padding × 10.5mm = 297mm */
          gridTemplateRows:"repeat(3, 85mm)",
          columnGap:"12mm", rowGap:"10.5mm",
          padding:"10.5mm 12mm",
          margin:"20px auto",
          boxShadow:"0 8px 48px rgba(0,0,0,0.5)",
        }}>
          {pagePilgrims.map(p => (
            <div key={p.id} style={{ position:"relative" }}>
              {/* Thin dashed cutting guide around each card */}
              <div style={{ position:"absolute", inset:"-1px", border:"0.5px dashed #ccc", pointerEvents:"none", zIndex:10, borderRadius:"3px" }} />
              {side === "front"
                ? <FrontCard  p={p} group={group} company={company} photoDataUrl={photoMap[p.id]||""} barcodeDataUrl={barcodeMap[p.id]||""} />
                : <BackCard   p={p} group={group} company={company} />}
            </div>
          ))}
          {/* Empty placeholder slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} style={{ width:"54mm", height:"85mm", border:"0.5px dashed #ddd", borderRadius:"3px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ color:"#ccc", fontSize:"8pt", fontFamily:"Arial" }}>empty</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
