import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";
import { loadPdfFromArrayBuffer, searchText, getPageDimensions, renderThumb, type PdfDocument } from "@/lib/pdfjs";
import { type Annotation } from "@/components/editor/drawAnnotation";
import PageView from "@/components/editor/PageView";

const BASE = import.meta.env.BASE_URL + "api";

// ── Constants ─────────────────────────────────────────────────────────────────
const TOOLS = [
  { id:"select",    icon:"⬆", label:"Select",       group:"nav"    },
  { id:"pan",       icon:"✋", label:"Pan",          group:"nav"    },
  { id:"highlight", icon:"🖍", label:"Highlight",    group:"mark"   },
  { id:"underline", icon:"U̲",  label:"Underline",    group:"mark"   },
  { id:"strikeout", icon:"S̶",  label:"Strikeout",   group:"mark"   },
  { id:"rectangle", icon:"□",  label:"Rectangle",   group:"shapes" },
  { id:"circle",    icon:"○",  label:"Ellipse",     group:"shapes" },
  { id:"arrow",     icon:"→",  label:"Arrow",       group:"shapes" },
  { id:"line",      icon:"╱",  label:"Line",        group:"shapes" },
  { id:"freehand",  icon:"✏", label:"Freehand",    group:"shapes" },
  { id:"text",      icon:"T",  label:"Typewriter",  group:"text"   },
  { id:"sticky",    icon:"📌", label:"Sticky Note", group:"text"   },
  { id:"stamp",     icon:"🔖", label:"Stamp",       group:"text"   },
  { id:"callout",   icon:"💬", label:"Callout",     group:"text"   },
  { id:"measure",   icon:"📏", label:"Measure",     group:"adv"    },
  { id:"eraser",    icon:"⌫",  label:"Eraser",      group:"adv"    },
];
const HIGHLIGHT_COLORS = ["#ffff00","#00ff7f","#ff69b4","#00bfff","#ffa500","#da70d6"];
const ANN_COLORS = ["#e53e3e","#2563eb","#16a34a","#7c3aed","#000000","#f59e0b"];
const STAMPS = ["APPROVED","DRAFT","CONFIDENTIAL","REJECTED","VOID","REVIEWED","FOR SIGNATURE","FINAL","COPY","DO NOT COPY","TOP SECRET","RECEIVED"];
const ZOOM_PRESETS = [0.25,0.5,0.67,0.75,1,1.25,1.5,1.75,2,2.5,3,4,6,8];
const PAGE_SIZES = [
  { label:"A4 Portrait", w:595,  h:842  },
  { label:"A4 Landscape",w:842,  h:595  },
  { label:"Letter",      w:612,  h:792  },
  { label:"Legal",       w:612,  h:1008 },
  { label:"A3",          w:842,  h:1191 },
];

type ViewMode  = "continuous"|"single"|"twopage";
type Theme     = "light"|"dark"|"night";
type LeftPanel = "thumbnails"|"bookmarks"|"comments"|"attachments"|"layers"|null;

interface Comment { id:string; annId?:string; text:string; author:string; createdAt:string; }
interface Bookmark { id:string; label:string; page:number; }
interface HistoryEntry { annotations: Annotation[]; }

// ── Draw-annotation helper (re-exported from drawAnnotation.ts) ───────────────
function makeId() { return uuid(); }

// ── Thumbnail Item ─────────────────────────────────────────────────────────────
function ThumbItem({ doc, pageNum, currentPage, onClick }: {
  doc: PdfDocument; pageNum: number; currentPage: number; onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    renderThumb(doc, pageNum, ref.current).catch(()=>{});
  }, [doc, pageNum]);
  return (
    <div onClick={onClick} style={{
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"6px 4px", cursor:"pointer", borderRadius:4,
      background: currentPage===pageNum ? "#2563eb22" : "transparent",
      border: currentPage===pageNum ? "1px solid #2563eb" : "1px solid transparent",
      marginBottom:4,
    }}>
      <canvas ref={ref} style={{ maxWidth:100, border:"1px solid #333", borderRadius:2 }} />
      <span style={{ fontSize:10, color:"#8b9ab5", marginTop:3 }}>{pageNum}</span>
    </div>
  );
}

// ── Modal dialog ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width=420 }: {
  title:string; onClose:()=>void; children:React.ReactNode; width?:number;
}) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:9999,
      display:"flex", alignItems:"center", justifyContent:"center",
    }} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{
        background:"#1a202c", border:"1px solid #374151",
        borderRadius:8, width, maxHeight:"85vh", overflow:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #374151" }}>
          <span style={{ fontWeight:700, color:"#e2e8f0", fontSize:14 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#8b9ab5", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:16 }}>{children}</div>
      </div>
    </div>
  );
}

function InputRow({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:11, color:"#8b9ab5", marginBottom:4, fontWeight:600 }}>{label}</div>
      {children}
    </div>
  );
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{
      width:"100%", boxSizing:"border-box",
      background:"#111827", border:"1px solid #374151", borderRadius:5,
      color:"#e2e8f0", padding:"7px 10px", fontSize:13,
      outline:"none", ...props.style,
    }} />
  );
}

function StyledSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{
      width:"100%", boxSizing:"border-box",
      background:"#111827", border:"1px solid #374151", borderRadius:5,
      color:"#e2e8f0", padding:"7px 10px", fontSize:13,
      outline:"none", ...props.style,
    }} />
  );
}

function Btn({ onClick, children, disabled=false, variant="secondary", style={} }: {
  onClick?:()=>void; children:React.ReactNode; disabled?:boolean;
  variant?:"primary"|"secondary"|"danger"; style?:React.CSSProperties;
}) {
  const bg = variant==="primary" ? "#2563eb" : variant==="danger" ? "#dc2626" : "#374151";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"7px 16px", borderRadius:5, border:"none", cursor:disabled?"not-allowed":"pointer",
      background:disabled?"#374151":bg, color:disabled?"#6b7280":"#fff", fontSize:13,
      fontWeight:600, opacity:disabled?0.6:1, ...style,
    }}>{children}</button>
  );
}

// ── Main EditorPage ───────────────────────────────────────────────────────────
export default function EditorPage() {
  const { fileId } = useParams<{ fileId:string }>();
  const [, navigate] = useLocation();

  // Core state
  const [pdfDoc,    setPdfDoc]    = useState<PdfDocument|null>(null);
  const [fileName,  setFileName]  = useState("Document");
  const [totalPages,setTotalPages]= useState(0);
  const [currentPage,setCurrentPage]= useState(1);
  const [zoom,      setZoom]      = useState(1);
  const [viewMode,  setViewMode]  = useState<ViewMode>("continuous");
  const [theme,     setTheme]     = useState<Theme>("dark");
  const [nightMode, setNightMode] = useState(false);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("thumbnails");
  const [showRightPanel, setShowRightPanel] = useState(false);

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId,  setSelectedId]  = useState<string|null>(null);
  const [history,     setHistory]     = useState<HistoryEntry[]>([{ annotations:[] }]);
  const [histIdx,     setHistIdx]     = useState(0);
  const [isDirty,     setIsDirty]     = useState(false);

  // Tool state
  const [activeTool,    setActiveTool]    = useState("select");
  const [activeColor,   setActiveColor]   = useState("#ffff00");
  const [activeOpacity, setActiveOpacity] = useState(0.8);
  const [activeLineWidth,setActiveLineWidth]=useState(2);
  const [activeFontSize,setActiveFontSize]= useState(14);
  const [activeStamp,   setActiveStamp]   = useState("APPROVED");
  const [activeRibbonTab,setActiveRibbonTab]=useState("home");

  // Search
  const [showSearch,    setShowSearch]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [replaceQuery,  setReplaceQuery]  = useState("");
  const [searchResults, setSearchResults] = useState<Array<{page:number;x:number;y:number;w:number;h:number}>>([]);
  const [searchIdx,     setSearchIdx]     = useState(0);

  // Dialogs
  const [dialog, setDialog] = useState<string|null>(null);
  const [dialogData, setDialogData] = useState<any>({});

  // Text input popup
  const [textInput, setTextInput] = useState<{
    visible:boolean; x:number; y:number; page:number;
    onDone:(text:string)=>void;
  }>({ visible:false, x:0, y:0, page:0, onDone:()=>{} });
  const [textInputValue, setTextInputValue] = useState("");

  // Comments & bookmarks
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [newComment,setNewComment]= useState("");
  const [versions,  setVersions]  = useState<any[]>([]);

  // Menu
  const [openMenu, setOpenMenu] = useState<string|null>(null);

  // Refs
  const viewportRef  = useRef<HTMLDivElement>(null);
  const pdfDocRef    = useRef<PdfDocument|null>(null);
  const fileIdRef    = useRef(fileId);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string|null>(null);

  // ── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fileId) return;
    fileIdRef.current = fileId;
    setLoading(true); setError(null);
    const ctrl = new AbortController();

    async function load() {
      try {
        // Load file metadata
        const metaRes = await fetch(`${BASE}/files`, { credentials:"include", signal:ctrl.signal });
        if (!metaRes.ok) throw new Error("Not authenticated");
        const meta = await metaRes.json();
        const file = (meta.files||[]).find((f:any) => f.id===fileId);
        if (file) setFileName(file.name || file.original_name || "Document");

        // Fetch PDF binary
        const res = await fetch(`${BASE}/files/${fileId}/download`, { credentials:"include", signal:ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const doc = await loadPdfFromArrayBuffer(buf);
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setAnnotations([]);
        setHistory([{ annotations:[] }]);
        setHistIdx(0);
        setIsDirty(false);
        setLoading(false);
      } catch(e:any) {
        if (e.name==="AbortError") return;
        setError(e.message); setLoading(false);
      }
    }
    load();
    return () => ctrl.abort();
  }, [fileId]);

  // ── History / undo-redo ─────────────────────────────────────────────────────
  const pushHistory = useCallback((anns: Annotation[]) => {
    setHistory(h => {
      const trimmed = h.slice(0, histIdx + 1);
      return [...trimmed, { annotations: anns }].slice(-200);
    });
    setHistIdx(i => i + 1);
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    setHistIdx(i => i - 1);
    setAnnotations(history[histIdx - 1]?.annotations || []);
    setIsDirty(true);
  }, [histIdx, history]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    setHistIdx(i => i + 1);
    setAnnotations(history[histIdx + 1]?.annotations || []);
    setIsDirty(true);
  }, [histIdx, history]);

  // ── Annotation operations ───────────────────────────────────────────────────
  const addAnnotation = useCallback((ann: Annotation) => {
    setAnnotations(prev => {
      const next = [...prev, ann];
      pushHistory(next);
      return next;
    });
    setIsDirty(true);
    setSelectedId(ann.id);
  }, [pushHistory]);

  const moveAnnotation = useCallback((id: string, dx: number, dy: number) => {
    setAnnotations(prev => prev.map(a =>
      a.id===id ? { ...a, x: Math.max(0,Math.min(0.98,a.x+dx)), y: Math.max(0,Math.min(0.98,a.y+dy)) } : a
    ));
    setIsDirty(true);
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const next = prev.filter(a => a.id!==id);
      pushHistory(next);
      return next;
    });
    setSelectedId(null);
    setIsDirty(true);
  }, [pushHistory]);

  const updateAnnotation = useCallback((id: string, changes: Partial<Annotation>) => {
    setAnnotations(prev => {
      const next = prev.map(a => a.id===id ? {...a,...changes} : a);
      pushHistory(next);
      return next;
    });
    setIsDirty(true);
  }, [pushHistory]);

  const selectedAnn = useMemo(() => annotations.find(a=>a.id===selectedId)||null, [annotations,selectedId]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveFile = useCallback(async (saveAs?: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/pdf/save-annotations/${fileId}`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ annotations, name:saveAs||fileName }),
      });
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||"Save failed"); }
      setIsDirty(false);
      toast.success("Saved successfully");
    } catch(e:any) { toast.error(e.message); }
    finally { setSaving(false); }
  }, [fileId, annotations, fileName]);

  // ── Download ────────────────────────────────────────────────────────────────
  const downloadFile = useCallback(async () => {
    if (isDirty) await saveFile();
    const a = document.createElement("a");
    a.href = `${BASE}/files/${fileId}/download`;
    a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(()=>document.body.removeChild(a),200);
  }, [fileId, fileName, isDirty, saveFile]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    if (!pdfDoc || !searchQuery.trim()) { setSearchResults([]); return; }
    const results = await searchText(pdfDoc, searchQuery, zoom);
    setSearchResults(results);
    setSearchIdx(0);
    if (results.length===0) { toast.info("No results found"); return; }
    toast.success(`${results.length} result${results.length>1?"s":""} found`);
    const first = results[0];
    if (first) setCurrentPage(first.page);
  }, [pdfDoc, searchQuery, zoom]);

  const searchNext = () => {
    if (!searchResults.length) return;
    const ni = (searchIdx+1)%searchResults.length;
    setSearchIdx(ni);
    setCurrentPage(searchResults[ni].page);
  };
  const searchPrev = () => {
    if (!searchResults.length) return;
    const ni = (searchIdx-1+searchResults.length)%searchResults.length;
    setSearchIdx(ni);
    setCurrentPage(searchResults[ni].page);
  };

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function kh(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key==="s") { e.preventDefault(); saveFile(); }
      if (ctrl && e.key==="z") { e.preventDefault(); undo(); }
      if (ctrl && e.key==="y") { e.preventDefault(); redo(); }
      if (ctrl && e.shiftKey && e.key==="Z") { e.preventDefault(); redo(); }
      if (ctrl && e.key==="f") { e.preventDefault(); setShowSearch(true); }
      if (ctrl && e.key==="=") { e.preventDefault(); setZoom(z=>Math.min(8,+(z*1.2).toFixed(2))); }
      if (ctrl && e.key==="-") { e.preventDefault(); setZoom(z=>Math.max(0.1,+(z/1.2).toFixed(2))); }
      if (ctrl && e.key==="0") { e.preventDefault(); setZoom(1); }
      if (e.key==="Delete"||e.key==="Backspace") {
        if (selectedId && document.activeElement?.tagName!=="INPUT" && document.activeElement?.tagName!=="TEXTAREA")
          deleteAnnotation(selectedId);
      }
      if (e.key==="Escape") { setSelectedId(null); setOpenMenu(null); }
      // Tool shortcuts
      const ts: Record<string,string> = { v:"select",h:"highlight",u:"underline",r:"rectangle",c:"circle",a:"arrow",f:"freehand",t:"text",s:"sticky",p:"pan",e:"eraser" };
      if (!ctrl && !e.shiftKey && !e.altKey && e.key in ts && document.activeElement?.tagName!=="INPUT") {
        setActiveTool(ts[e.key]);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", kh);
    return () => window.removeEventListener("keydown", kh);
  }, [saveFile, undo, redo, selectedId, deleteAnnotation]);

  // ── Page operations ─────────────────────────────────────────────────────────
  async function pageOp(endpoint: string, body: any) {
    if (isDirty) { await saveFile(); }
    const res = await fetch(`${BASE}/pdf/${endpoint}/${fileId}`, {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body),
    });
    if (!res.ok) { const e=await res.json(); throw new Error(e.error||"Operation failed"); }
    // Reload PDF
    const dlRes = await fetch(`${BASE}/files/${fileId}/download`, {credentials:"include"});
    if (!dlRes.ok) throw new Error("Reload failed");
    const buf = await dlRes.arrayBuffer();
    const doc = await loadPdfFromArrayBuffer(buf);
    pdfDocRef.current=doc; setPdfDoc(doc); setTotalPages(doc.numPages);
    setAnnotations([]); setHistory([{annotations:[]}]); setHistIdx(0); setIsDirty(false);
    return true;
  }

  async function handleInsertPage(afterPage: number, sizeName: string) {
    const sz = PAGE_SIZES.find(p=>p.label===sizeName)||PAGE_SIZES[0];
    try { await pageOp("insert-page", { afterIndex:afterPage, width:sz.w, height:sz.h }); toast.success("Page inserted"); }
    catch(e:any) { toast.error(e.message); }
  }
  async function handleDeletePages(pages: number[]) {
    try { await pageOp("delete-pages", { pageNumbers:pages }); toast.success("Pages deleted"); }
    catch(e:any) { toast.error(e.message); }
  }
  async function handleRotatePage(page: number, angle: number) {
    try { await pageOp("rotate", { rotations:[{ page, angle }] }); toast.success("Rotated"); }
    catch(e:any) { toast.error(e.message); }
  }
  async function handleDuplicatePage(page: number) {
    try { await pageOp("duplicate-page", { pageNum:page }); toast.success("Page duplicated"); }
    catch(e:any) { toast.error(e.message); }
  }

  // ── PDF tools (existing endpoints) ─────────────────────────────────────────
  async function pdfTool(endpoint: string, body: any, label: string) {
    setSaving(true);
    try {
      if (isDirty) await saveFile();
      const res = await fetch(`${BASE}/pdf/${endpoint}/${fileId}`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||"Failed"); }
      // Reload
      const dlRes = await fetch(`${BASE}/files/${fileId}/download`, {credentials:"include"});
      const buf = await dlRes.arrayBuffer();
      const doc = await loadPdfFromArrayBuffer(buf);
      setPdfDoc(doc); setTotalPages(doc.numPages);
      setAnnotations([]); setHistory([{annotations:[]}]); setHistIdx(0);
      toast.success(`${label} applied`);
    } catch(e:any) { toast.error(e.message); }
    setSaving(false);
  }

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  const onPageVisible = useCallback((p: number) => {
    setCurrentPage(p);
  }, []);

  // ── Export functions ────────────────────────────────────────────────────────
  async function exportImages() {
    if (!pdfDoc) return;
    toast.info("Exporting pages as images...");
    for (let p=1;p<=pdfDoc.numPages;p++) {
      const canvas = document.createElement("canvas");
      const page = await pdfDoc.getPage(p);
      const vp = page.getViewport({scale:2});
      canvas.width=vp.width; canvas.height=vp.height;
      await page.render({canvasContext:canvas.getContext("2d")!,viewport:vp}).promise;
      canvas.toBlob(blob=>{
        if(!blob) return;
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url; a.download=`page_${p}.png`;
        document.body.appendChild(a); a.click();
        setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},300);
      },"image/png");
      await new Promise(r=>setTimeout(r,300));
    }
  }

  async function extractAndExport() {
    if (!pdfDoc) return;
    let text="";
    for(let p=1;p<=pdfDoc.numPages;p++){
      const page=await pdfDoc.getPage(p);
      const tc=await page.getTextContent();
      text+=`\n--- Page ${p} ---\n`;
      text+=(tc.items as any[]).map((i:any)=>i.str).join(" ");
    }
    const blob=new Blob([text],{type:"text/plain"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=fileName.replace(".pdf","")+".txt";
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},300);
  }

  // ── Pages to render ─────────────────────────────────────────────────────────
  const pagesToRender = useMemo(() => {
    if (!totalPages) return [];
    if (viewMode==="single") return [currentPage];
    if (viewMode==="twopage") {
      const pages=[currentPage];
      if (currentPage+1<=totalPages) pages.push(currentPage+1);
      return pages;
    }
    // continuous: all pages
    return Array.from({length:totalPages},(_,i)=>i+1);
  }, [totalPages, currentPage, viewMode]);

  // ── Tool color based on type ────────────────────────────────────────────────
  useEffect(() => {
    if (["highlight"].includes(activeTool)) setActiveColor("#ffff00");
    else if (["underline","strikeout"].includes(activeTool)) setActiveColor("#2563eb");
    else if (["stamp"].includes(activeTool)) setActiveColor("#e53e3e");
    else if (!["highlight","underline","strikeout","stamp"].includes(activeTool)) {
      // keep current color
    }
  }, [activeTool]);

  // ── Search highlights to pass to PageView ───────────────────────────────────
  const activeSearchHighlight = searchResults.length > 0 ? [searchResults[searchIdx]] : [];
  const allSearchHighlights   = searchResults;

  // ── Render ──────────────────────────────────────────────────────────────────
  const isDark = theme!=="light";

  const bgColor    = isDark ? "#0f1117" : "#e5e7eb";
  const panelBg    = isDark ? "#141923" : "#f8fafc";
  const headerBg   = isDark ? "#1a202c" : "#1e293b";
  const ribbonBg   = isDark ? "#111827" : "#1e3a5f";
  const borderCol  = isDark ? "#232d3d" : "#cbd5e1";
  const textCol    = isDark ? "#e2e8f0" : "#f1f5f9";
  const mutedCol   = isDark ? "#8b9ab5" : "#94a3b8";

  const btnStyle = (active=false): React.CSSProperties => ({
    background: active ? "#2563eb" : "transparent",
    border: active ? "1px solid #2563eb" : "1px solid transparent",
    borderRadius:4, color: active ? "#fff" : textCol,
    padding:"3px 7px", cursor:"pointer", fontSize:12,
    display:"flex", flexDirection:"column" as const, alignItems:"center", gap:1,
    minWidth:42, whiteSpace:"nowrap" as const,
  });

  const menuBtnStyle = (active=false): React.CSSProperties => ({
    background: active ? "#374151" : "none",
    border:"none", color:textCol, padding:"4px 10px",
    cursor:"pointer", borderRadius:3, fontSize:12, fontWeight:500,
  });

  // ── Dropdown menus ──────────────────────────────────────────────────────────
  function DropMenu({ id, items }: { id:string; items:Array<{label:string;action?:()=>void;divider?:boolean;disabled?:boolean}> }) {
    if (openMenu!==id) return null;
    return (
      <div style={{
        position:"absolute", top:"100%", left:0, zIndex:8888, minWidth:200,
        background:"#1a202c", border:"1px solid #374151", borderRadius:6,
        boxShadow:"0 8px 32px rgba(0,0,0,0.6)", padding:"4px 0",
      }}>
        {items.map((item,i)=> item.divider
          ? <div key={i} style={{height:1,background:"#374151",margin:"4px 0"}}/>
          : <button key={i} disabled={item.disabled} onClick={()=>{ item.action?.(); setOpenMenu(null); }} style={{
              display:"block", width:"100%", textAlign:"left", padding:"7px 14px",
              background:"none", border:"none", color:item.disabled?"#4b5563":"#e2e8f0",
              cursor:item.disabled?"default":"pointer", fontSize:13,
            }}
            onMouseEnter={e=>{if(!item.disabled)(e.target as HTMLElement).style.background="#374151"}}
            onMouseLeave={e=>{(e.target as HTMLElement).style.background="none"}}
          >{item.label}</button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden",
      background:bgColor, fontFamily:"'Inter',system-ui,sans-serif",
      color:textCol, userSelect:"none",
    }} onClick={()=>setOpenMenu(null)}>

      {/* ── Title / tab bar ── */}
      <div style={{
        background:headerBg, borderBottom:`1px solid ${borderCol}`,
        display:"flex", alignItems:"center", height:36, flexShrink:0, padding:"0 8px",
      }}>
        {/* Logo */}
        <span style={{ fontWeight:800, fontSize:13, color:"#3b82f6", marginRight:12, whiteSpace:"nowrap" }}>📄 PDF Enterprise</span>
        {/* File tab */}
        <div style={{
          display:"flex", alignItems:"center", gap:6,
          background:"#374151", borderRadius:"4px 4px 0 0",
          padding:"0 10px", height:"100%", fontSize:12, color:textCol,
        }}>
          <span style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fileName}</span>
          {isDirty && <span style={{color:"#f59e0b",fontSize:10}}>●</span>}
        </div>
        <div style={{ flex:1 }}/>
        {/* Window controls */}
        <div style={{display:"flex",gap:6}}>
          {["✕"].map(c=>(
            <button key={c} onClick={()=>navigate("/workspace")} style={{
              width:26, height:26, borderRadius:13, border:"none",
              background:"#ef4444", color:"#fff", cursor:"pointer", fontSize:11,
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* ── Menu bar ── */}
      <div style={{
        background:headerBg, borderBottom:`1px solid ${borderCol}`,
        display:"flex", alignItems:"center", height:30, flexShrink:0,
        padding:"0 4px", gap:2, position:"relative",
      }} onClick={e=>e.stopPropagation()}>
        {/* File */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="file")} onClick={()=>setOpenMenu(o=>o==="file"?null:"file")}>File</button>
          <DropMenu id="file" items={[
            {label:"📂 Open…",       action:()=>navigate("/workspace")},
            {label:"💾 Save   Ctrl+S", action:()=>saveFile()},
            {label:"Save As…",        action:()=>{ const n=prompt("Save as:",fileName); if(n) saveFile(n); }},
            {divider:true},
            {label:"⬇ Download PDF", action:downloadFile},
            {divider:true},
            {label:"Close",           action:()=>navigate("/workspace")},
          ]}/>
        </div>
        {/* Edit */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="edit")} onClick={()=>setOpenMenu(o=>o==="edit"?null:"edit")}>Edit</button>
          <DropMenu id="edit" items={[
            {label:"↩ Undo  Ctrl+Z",  action:undo, disabled:histIdx<=0},
            {label:"↪ Redo  Ctrl+Y",  action:redo, disabled:histIdx>=history.length-1},
            {divider:true},
            {label:"Select All",      action:()=>{}},
            {label:"Delete Selected", action:()=>selectedId&&deleteAnnotation(selectedId), disabled:!selectedId},
            {divider:true},
            {label:"🔍 Find  Ctrl+F", action:()=>setShowSearch(true)},
          ]}/>
        </div>
        {/* View */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="view")} onClick={()=>setOpenMenu(o=>o==="view"?null:"view")}>View</button>
          <DropMenu id="view" items={[
            {label:`${viewMode==="single"?"✓ ":""}Single Page`,     action:()=>setViewMode("single")},
            {label:`${viewMode==="continuous"?"✓ ":""}Continuous Scroll`,action:()=>setViewMode("continuous")},
            {label:`${viewMode==="twopage"?"✓ ":""}Two Page`,       action:()=>setViewMode("twopage")},
            {divider:true},
            {label:"Zoom In  Ctrl++",   action:()=>setZoom(z=>Math.min(8,+(z*1.25).toFixed(2)))},
            {label:"Zoom Out  Ctrl+-",  action:()=>setZoom(z=>Math.max(0.1,+(z/1.25).toFixed(2)))},
            {label:"Fit Page  Ctrl+0",  action:()=>setZoom(1)},
            {divider:true},
            {label:`${nightMode?"✓ ":""}Night Mode`,    action:()=>setNightMode(n=>!n)},
            {label:`${theme==="dark"?"✓ ":""}Dark Theme`, action:()=>setTheme(t=>t==="dark"?"light":"dark")},
            {divider:true},
            {label:`${leftPanel==="thumbnails"?"✓ ":""}Thumbnails`,  action:()=>setLeftPanel(p=>p==="thumbnails"?null:"thumbnails")},
            {label:`${leftPanel==="bookmarks"?"✓ ":""}Bookmarks`,    action:()=>setLeftPanel(p=>p==="bookmarks"?null:"bookmarks")},
            {label:`${leftPanel==="comments"?"✓ ":""}Comments`,      action:()=>setLeftPanel(p=>p==="comments"?null:"comments")},
          ]}/>
        </div>
        {/* Annotations */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="ann")} onClick={()=>setOpenMenu(o=>o==="ann"?null:"ann")}>Annotations</button>
          <DropMenu id="ann" items={[
            {label:"Highlight",        action:()=>{setActiveTool("highlight");setActiveColor("#ffff00")}},
            {label:"Underline",        action:()=>{setActiveTool("underline");setActiveColor("#2563eb")}},
            {label:"Strikeout",        action:()=>setActiveTool("strikeout")},
            {divider:true},
            {label:"Rectangle",        action:()=>setActiveTool("rectangle")},
            {label:"Ellipse",          action:()=>setActiveTool("circle")},
            {label:"Arrow",            action:()=>setActiveTool("arrow")},
            {label:"Line",             action:()=>setActiveTool("line")},
            {label:"Freehand Drawing", action:()=>setActiveTool("freehand")},
            {divider:true},
            {label:"Typewriter",       action:()=>setActiveTool("text")},
            {label:"Sticky Note",      action:()=>setActiveTool("sticky")},
            {label:"Stamp",            action:()=>setActiveTool("stamp")},
            {label:"Measure",          action:()=>setActiveTool("measure")},
            {divider:true},
            {label:"Delete All Annotations", action:()=>{if(confirm("Delete all annotations?"))setAnnotations([])}},
          ]}/>
        </div>
        {/* Pages */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="pages")} onClick={()=>setOpenMenu(o=>o==="pages"?null:"pages")}>Pages</button>
          <DropMenu id="pages" items={[
            {label:"Insert Page Before", action:()=>setDialog("insert-page")},
            {label:"Delete Current Page",action:()=>{ if(confirm(`Delete page ${currentPage}?`)) handleDeletePages([currentPage]); }},
            {label:"Duplicate Page",      action:()=>handleDuplicatePage(currentPage)},
            {divider:true},
            {label:"Rotate CW 90°",      action:()=>handleRotatePage(currentPage,90)},
            {label:"Rotate CCW 90°",     action:()=>handleRotatePage(currentPage,270)},
            {label:"Rotate 180°",        action:()=>handleRotatePage(currentPage,180)},
            {divider:true},
            {label:"Extract Pages…",     action:()=>setDialog("extract")},
            {label:"Split PDF…",         action:()=>setDialog("split")},
            {label:"Merge PDFs",         action:()=>navigate("/tools")},
            {label:"Crop Page…",         action:()=>setDialog("crop")},
          ]}/>
        </div>
        {/* Tools */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="tools")} onClick={()=>setOpenMenu(o=>o==="tools"?null:"tools")}>Tools</button>
          <DropMenu id="tools" items={[
            {label:"Add Watermark…",    action:()=>setDialog("watermark")},
            {label:"Header & Footer…",  action:()=>setDialog("headerfooter")},
            {label:"Page Numbers…",     action:()=>setDialog("pagenumbers")},
            {label:"Edit Metadata…",    action:()=>setDialog("metadata")},
            {label:"Add QR Code…",      action:()=>setDialog("qrcode")},
            {divider:true},
            {label:"Compress PDF",      action:()=>pdfTool("compress",{},"Compress")},
            {label:"Extract Text",      action:extractAndExport},
            {label:"Compare PDFs",      action:()=>navigate("/tools")},
            {divider:true},
            {label:"Export as Images…", action:exportImages},
            {label:"Export as TXT",     action:extractAndExport},
          ]}/>
        </div>
        {/* Security */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="sec")} onClick={()=>setOpenMenu(o=>o==="sec"?null:"sec")}>Security</button>
          <DropMenu id="sec" items={[
            {label:"🔒 Password Protect…", action:()=>setDialog("protect")},
            {label:"Unlock PDF…",           action:()=>setDialog("unlock")},
            {label:"Detect Encryption",     action:async()=>{
              const r=await fetch(`${BASE}/pdf/detect/${fileId}`,{credentials:"include"});
              const d=await r.json();
              toast.info(d.isEncrypted?"🔒 Encrypted":"🔓 Not encrypted");
            }},
          ]}/>
        </div>
        {/* Help */}
        <div style={{position:"relative"}}>
          <button style={menuBtnStyle(openMenu==="help")} onClick={()=>setOpenMenu(o=>o==="help"?null:"help")}>Help</button>
          <DropMenu id="help" items={[
            {label:"Keyboard Shortcuts", action:()=>setDialog("shortcuts")},
            {label:"About",              action:()=>toast.info("Al Burhan PDF Enterprise v3.0")},
          ]}/>
        </div>
      </div>

      {/* ── Tool Ribbon ── */}
      <div style={{
        background:ribbonBg, borderBottom:`1px solid ${borderCol}`,
        flexShrink:0, display:"flex", flexDirection:"column",
      }}>
        {/* Ribbon tabs */}
        <div style={{ display:"flex", borderBottom:`1px solid ${borderCol}60`, padding:"0 8px" }}>
          {["home","annotate","edit","pages","tools","view","security"].map(tab=>(
            <button key={tab} onClick={()=>setActiveRibbonTab(tab)} style={{
              padding:"4px 12px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer",
              background: activeRibbonTab===tab ? "#ffffff15" : "none",
              color: activeRibbonTab===tab ? "#60a5fa" : mutedCol,
              borderBottom: activeRibbonTab===tab ? "2px solid #60a5fa" : "2px solid transparent",
              textTransform:"capitalize",
            }}>{tab.toUpperCase()}</button>
          ))}
        </div>
        {/* Ribbon content */}
        <div style={{ display:"flex", alignItems:"flex-start", padding:"4px 8px", gap:0, overflowX:"auto", minHeight:60 }}>
          {activeRibbonTab==="home" && <>
            <RibbonGroup label="Navigate">
              <button style={btnStyle(activeTool==="select")} onClick={()=>setActiveTool("select")}>⬆<span style={{fontSize:9}}>Select</span></button>
              <button style={btnStyle(activeTool==="pan")} onClick={()=>setActiveTool("pan")}>✋<span style={{fontSize:9}}>Pan</span></button>
            </RibbonGroup>
            <RibbonGroup label="Page">
              <button style={btnStyle()} onClick={()=>setCurrentPage(p=>Math.max(1,p-1))} disabled={currentPage<=1}>⬆<span style={{fontSize:9}}>Prev</span></button>
              <button style={btnStyle()} onClick={()=>setCurrentPage(p=>Math.min(totalPages,p+1))} disabled={currentPage>=totalPages}>⬇<span style={{fontSize:9}}>Next</span></button>
              <span style={{color:textCol,fontSize:11,alignSelf:"center",padding:"0 6px"}}>{currentPage}/{totalPages}</span>
            </RibbonGroup>
            <RibbonGroup label="Zoom">
              <button style={btnStyle()} onClick={()=>setZoom(z=>Math.min(8,+(z*1.25).toFixed(2)))}>🔍+</button>
              <button style={btnStyle()} onClick={()=>setZoom(z=>Math.max(0.1,+(z/1.25).toFixed(2)))}>🔍-</button>
              <select value={zoom} onChange={e=>setZoom(+e.target.value)} style={{
                background:"#111827",border:"1px solid #374151",color:textCol,
                borderRadius:4, fontSize:11, padding:"2px 4px",
              }}>
                {ZOOM_PRESETS.map(z=>(
                  <option key={z} value={z}>{Math.round(z*100)}%</option>
                ))}
              </select>
            </RibbonGroup>
            <RibbonGroup label="Markup">
              {["highlight","underline","strikeout"].map(t=>(
                <button key={t} style={btnStyle(activeTool===t)} onClick={()=>setActiveTool(t)}>
                  {t==="highlight"?"🖍":t==="underline"?"U̲":"S̶"}
                  <span style={{fontSize:9}}>{t[0].toUpperCase()+t.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Clipboard">
              <button style={btnStyle()} onClick={undo} disabled={histIdx<=0}>↩<span style={{fontSize:9}}>Undo</span></button>
              <button style={btnStyle()} onClick={redo} disabled={histIdx>=history.length-1}>↪<span style={{fontSize:9}}>Redo</span></button>
            </RibbonGroup>
            <RibbonGroup label="File">
              <button style={btnStyle()} onClick={()=>saveFile()} disabled={saving || !isDirty}>
                💾<span style={{fontSize:9}}>{saving?"Saving…":"Save"}</span>
              </button>
              <button style={btnStyle()} onClick={downloadFile}>⬇<span style={{fontSize:9}}>Download</span></button>
              <button style={btnStyle()} onClick={()=>setShowSearch(s=>!s)}>🔍<span style={{fontSize:9}}>Search</span></button>
            </RibbonGroup>
          </>}

          {activeRibbonTab==="annotate" && <>
            <RibbonGroup label="Mark Up">
              {["highlight","underline","strikeout"].map(t=>(
                <button key={t} style={btnStyle(activeTool===t)} onClick={()=>setActiveTool(t)}>
                  {t==="highlight"?"🖍":t==="underline"?"U̲":"S̶"}
                  <span style={{fontSize:9}}>{t[0].toUpperCase()+t.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Drawing Tools">
              {["rectangle","circle","arrow","line","freehand"].map(t=>(
                <button key={t} style={btnStyle(activeTool===t)} onClick={()=>setActiveTool(t)}>
                  {t==="rectangle"?"□":t==="circle"?"○":t==="arrow"?"→":t==="line"?"╱":"✏"}
                  <span style={{fontSize:9}}>{t==="rectangle"?"Rect":t==="circle"?"Ellipse":t[0].toUpperCase()+t.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Insert">
              {["text","sticky","stamp","callout","measure"].map(t=>(
                <button key={t} style={btnStyle(activeTool===t)} onClick={()=>setActiveTool(t)}>
                  {t==="text"?"T":t==="sticky"?"📌":t==="stamp"?"🔖":t==="callout"?"💬":"📏"}
                  <span style={{fontSize:9}}>{t==="text"?"Typewriter":t[0].toUpperCase()+t.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Color">
              <div style={{display:"flex",flexWrap:"wrap",gap:3,width:96}}>
                {HIGHLIGHT_COLORS.map(c=>(
                  <button key={c} onClick={()=>setActiveColor(c)} style={{
                    width:20,height:20,borderRadius:3,background:c,border:activeColor===c?"2px solid #fff":"1px solid #555",cursor:"pointer",
                  }}/>
                ))}
                {ANN_COLORS.map(c=>(
                  <button key={c} onClick={()=>setActiveColor(c)} style={{
                    width:20,height:20,borderRadius:3,background:c,border:activeColor===c?"2px solid #fff":"1px solid #555",cursor:"pointer",
                  }}/>
                ))}
              </div>
              <input type="color" value={activeColor} onChange={e=>setActiveColor(e.target.value)} style={{width:30,height:26,padding:0,border:"none",cursor:"pointer"}}/>
            </RibbonGroup>
            <RibbonGroup label="Properties">
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,color:mutedCol,width:48}}>Opacity</span>
                  <input type="range" min={0.1} max={1} step={0.05} value={activeOpacity}
                    onChange={e=>setActiveOpacity(+e.target.value)} style={{width:70}}/>
                  <span style={{fontSize:10,color:mutedCol}}>{Math.round(activeOpacity*100)}%</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,color:mutedCol,width:48}}>Width</span>
                  <input type="range" min={1} max={12} step={0.5} value={activeLineWidth}
                    onChange={e=>setActiveLineWidth(+e.target.value)} style={{width:70}}/>
                  <span style={{fontSize:10,color:mutedCol}}>{activeLineWidth}pt</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:10,color:mutedCol,width:48}}>Font</span>
                  <input type="number" min={8} max={72} value={activeFontSize}
                    onChange={e=>setActiveFontSize(+e.target.value)}
                    style={{width:50,background:"#111827",border:"1px solid #374151",color:textCol,borderRadius:3,padding:"1px 4px",fontSize:11}}/>
                </div>
              </div>
            </RibbonGroup>
            <RibbonGroup label="Stamp Type">
              <select value={activeStamp} onChange={e=>setActiveStamp(e.target.value)} style={{
                background:"#111827",border:"1px solid #374151",color:textCol,
                borderRadius:4,fontSize:11,padding:"3px 4px",minWidth:100,
              }}>
                {STAMPS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <button style={btnStyle()} onClick={()=>setActiveTool("eraser")}>⌫<span style={{fontSize:9}}>Eraser</span></button>
            </RibbonGroup>
          </>}

          {activeRibbonTab==="pages" && <>
            <RibbonGroup label="Add / Remove">
              <button style={btnStyle()} onClick={()=>setDialog("insert-page")}>+📄<span style={{fontSize:9}}>Insert</span></button>
              <button style={btnStyle()} onClick={()=>{ if(confirm(`Delete page ${currentPage}?`)) handleDeletePages([currentPage]); }}>🗑<span style={{fontSize:9}}>Delete</span></button>
              <button style={btnStyle()} onClick={()=>handleDuplicatePage(currentPage)}>📋<span style={{fontSize:9}}>Duplicate</span></button>
            </RibbonGroup>
            <RibbonGroup label="Rotate">
              <button style={btnStyle()} onClick={()=>handleRotatePage(currentPage,90)}>↻<span style={{fontSize:9}}>CW 90°</span></button>
              <button style={btnStyle()} onClick={()=>handleRotatePage(currentPage,270)}>↺<span style={{fontSize:9}}>CCW 90°</span></button>
              <button style={btnStyle()} onClick={()=>handleRotatePage(currentPage,180)}>↕<span style={{fontSize:9}}>180°</span></button>
            </RibbonGroup>
            <RibbonGroup label="Extract / Split">
              <button style={btnStyle()} onClick={()=>setDialog("extract")}>✂📄<span style={{fontSize:9}}>Extract</span></button>
              <button style={btnStyle()} onClick={()=>setDialog("split")}>✂<span style={{fontSize:9}}>Split</span></button>
            </RibbonGroup>
            <RibbonGroup label="Page Numbers">
              <button style={btnStyle()} onClick={()=>setDialog("pagenumbers")}>🔢<span style={{fontSize:9}}>Numbers</span></button>
              <button style={btnStyle()} onClick={()=>setDialog("headerfooter")}>📄<span style={{fontSize:9}}>Hdr/Ftr</span></button>
            </RibbonGroup>
          </>}

          {activeRibbonTab==="tools" && <>
            <RibbonGroup label="Document">
              <button style={btnStyle()} onClick={()=>setDialog("watermark")}>💧<span style={{fontSize:9}}>Watermark</span></button>
              <button style={btnStyle()} onClick={()=>setDialog("metadata")}>🏷<span style={{fontSize:9}}>Metadata</span></button>
              <button style={btnStyle()} onClick={()=>pdfTool("compress",{},"Compress")}>📦<span style={{fontSize:9}}>Compress</span></button>
            </RibbonGroup>
            <RibbonGroup label="Add Elements">
              <button style={btnStyle()} onClick={()=>setDialog("qrcode")}>📱<span style={{fontSize:9}}>QR Code</span></button>
            </RibbonGroup>
            <RibbonGroup label="Export">
              <button style={btnStyle()} onClick={exportImages}>🖼<span style={{fontSize:9}}>Images</span></button>
              <button style={btnStyle()} onClick={extractAndExport}>📝<span style={{fontSize:9}}>TXT</span></button>
              <button style={btnStyle()} onClick={downloadFile}>⬇<span style={{fontSize:9}}>PDF</span></button>
            </RibbonGroup>
            <RibbonGroup label="Analysis">
              <button style={btnStyle()} onClick={()=>pdfTool("extract-text",{},"Extract")}>📖<span style={{fontSize:9}}>Extract</span></button>
            </RibbonGroup>
          </>}

          {activeRibbonTab==="view" && <>
            <RibbonGroup label="View Mode">
              {(["single","continuous","twopage"] as ViewMode[]).map(m=>(
                <button key={m} style={btnStyle(viewMode===m)} onClick={()=>setViewMode(m)}>
                  {m==="single"?"📄":m==="continuous"?"📜":"📋"}
                  <span style={{fontSize:9}}>{m==="twopage"?"Two Page":m[0].toUpperCase()+m.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Zoom">
              {[0.5,0.75,1,1.25,1.5,2].map(z=>(
                <button key={z} style={btnStyle(Math.abs(zoom-z)<0.01)} onClick={()=>setZoom(z)}>
                  <span style={{fontSize:10}}>{Math.round(z*100)}%</span>
                </button>
              ))}
            </RibbonGroup>
            <RibbonGroup label="Theme">
              <button style={btnStyle(theme==="dark")} onClick={()=>setTheme("dark")}>🌙<span style={{fontSize:9}}>Dark</span></button>
              <button style={btnStyle(theme==="light")} onClick={()=>setTheme("light")}>☀<span style={{fontSize:9}}>Light</span></button>
              <button style={btnStyle(nightMode)} onClick={()=>setNightMode(n=>!n)}>🌑<span style={{fontSize:9}}>Night</span></button>
            </RibbonGroup>
            <RibbonGroup label="Panels">
              {(["thumbnails","bookmarks","comments"] as LeftPanel[]).map(p=>(
                <button key={p!} style={btnStyle(leftPanel===p)} onClick={()=>setLeftPanel(lp=>lp===p?null:p)}>
                  {p==="thumbnails"?"📑":p==="bookmarks"?"🔖":"💬"}
                  <span style={{fontSize:9}}>{p![0].toUpperCase()+p!.slice(1)}</span>
                </button>
              ))}
            </RibbonGroup>
          </>}

          {activeRibbonTab==="security" && <>
            <RibbonGroup label="Password">
              <button style={btnStyle()} onClick={()=>setDialog("protect")}>🔒<span style={{fontSize:9}}>Protect</span></button>
              <button style={btnStyle()} onClick={()=>setDialog("unlock")}>🔓<span style={{fontSize:9}}>Unlock</span></button>
            </RibbonGroup>
            <RibbonGroup label="Info">
              <button style={btnStyle()} onClick={async()=>{
                const r=await fetch(`${BASE}/pdf/detect/${fileId}`,{credentials:"include"});
                const d=await r.json();
                toast.info(d.isEncrypted ? `🔒 Encrypted — method: ${d.encryptionMethod||"unknown"}` : "🔓 Not encrypted");
              }}>🔍<span style={{fontSize:9}}>Detect</span></button>
            </RibbonGroup>
          </>}

          {activeRibbonTab==="edit" && <>
            <RibbonGroup label="Text Add">
              <button style={btnStyle(activeTool==="text")} onClick={()=>setActiveTool("text")}>T<span style={{fontSize:9}}>Add Text</span></button>
              <button style={btnStyle(activeTool==="typewriter")} onClick={()=>setActiveTool("typewriter")}>✏<span style={{fontSize:9}}>Typewriter</span></button>
            </RibbonGroup>
            <RibbonGroup label="Font">
              <select value={activeFontSize} onChange={e=>setActiveFontSize(+e.target.value)} style={{
                background:"#111827",border:"1px solid #374151",color:textCol,borderRadius:4,fontSize:11,padding:"2px",
              }}>
                {[8,9,10,11,12,14,16,18,20,24,28,32,36,48,72].map(s=>(
                  <option key={s} value={s}>{s}pt</option>
                ))}
              </select>
            </RibbonGroup>
            <RibbonGroup label="Erase">
              <button style={btnStyle(activeTool==="eraser")} onClick={()=>setActiveTool("eraser")}>⌫<span style={{fontSize:9}}>Eraser</span></button>
            </RibbonGroup>
          </>}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Left panel ── */}
        {leftPanel && (
          <div style={{
            width:160, flexShrink:0, background:panelBg,
            borderRight:`1px solid ${borderCol}`, display:"flex", flexDirection:"column",
          }}>
            {/* Panel tabs */}
            <div style={{ display:"flex", borderBottom:`1px solid ${borderCol}` }}>
              {(["thumbnails","bookmarks","comments"] as LeftPanel[]).map(p=>(
                <button key={p!} onClick={()=>setLeftPanel(p)} style={{
                  flex:1, padding:"5px 2px", border:"none", cursor:"pointer", fontSize:9,
                  background: leftPanel===p ? "#2563eb20" : "transparent",
                  color: leftPanel===p ? "#60a5fa" : mutedCol,
                  borderBottom: leftPanel===p ? "2px solid #2563eb" : "2px solid transparent",
                }}>
                  {p==="thumbnails"?"📑 Thumbs":p==="bookmarks"?"🔖 Marks":"💬 Notes"}
                </button>
              ))}
              <button onClick={()=>setLeftPanel(null)} style={{
                padding:"0 6px", border:"none", background:"none", color:mutedCol, cursor:"pointer",
              }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:6 }}>
              {leftPanel==="thumbnails" && pdfDoc && (
                Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                  <ThumbItem key={p} doc={pdfDoc} pageNum={p} currentPage={currentPage}
                    onClick={()=>{
                      setCurrentPage(p);
                      if(viewMode!=="continuous") return;
                      const el = document.getElementById(`pdf-page-${p}`);
                      el?.scrollIntoView({behavior:"smooth",block:"start"});
                    }}
                  />
                ))
              )}
              {leftPanel==="bookmarks" && (
                <div>
                  <button onClick={()=>{
                    const label=prompt("Bookmark label:",`Page ${currentPage}`);
                    if(label) setBookmarks(b=>[...b,{id:makeId(),label,page:currentPage}]);
                  }} style={{ width:"100%", marginBottom:8, padding:"4px 8px", fontSize:11, background:"#2563eb", border:"none", color:"#fff", borderRadius:4, cursor:"pointer" }}>
                    + Add Bookmark
                  </button>
                  {bookmarks.length===0 && <p style={{fontSize:11,color:mutedCol,textAlign:"center"}}>No bookmarks</p>}
                  {bookmarks.map(bk=>(
                    <div key={bk.id} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
                      <button onClick={()=>{ setCurrentPage(bk.page); const el=document.getElementById(`pdf-page-${bk.page}`); el?.scrollIntoView({behavior:"smooth"}); }}
                        style={{ flex:1, textAlign:"left", background:"none", border:"none", color:textCol, cursor:"pointer", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        🔖 {bk.label} (p.{bk.page})
                      </button>
                      <button onClick={()=>setBookmarks(b=>b.filter(x=>x.id!==bk.id))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:12}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {leftPanel==="comments" && (
                <div>
                  <textarea value={newComment} onChange={e=>setNewComment(e.target.value)}
                    placeholder={`Comment on page ${currentPage}…`}
                    style={{ width:"100%", boxSizing:"border-box", background:"#111827", border:"1px solid #374151", borderRadius:4, color:textCol, fontSize:11, padding:6, resize:"vertical", minHeight:50 }}
                  />
                  <button onClick={()=>{
                    if(!newComment.trim()) return;
                    setComments(c=>[...c,{id:makeId(),text:newComment,author:"Me",createdAt:new Date().toLocaleString()}]);
                    setNewComment("");
                  }} style={{ width:"100%", marginTop:4, marginBottom:8, padding:"4px", fontSize:11, background:"#2563eb", border:"none", color:"#fff", borderRadius:4, cursor:"pointer" }}>
                    Add Comment
                  </button>
                  {comments.length===0 && <p style={{fontSize:11,color:mutedCol,textAlign:"center"}}>No comments</p>}
                  {comments.map(c=>(
                    <div key={c.id} style={{ background:"#111827", borderRadius:4, padding:6, marginBottom:6, fontSize:11 }}>
                      <div style={{color:mutedCol,fontSize:9,marginBottom:2}}>{c.createdAt}</div>
                      <div style={{color:textCol}}>{c.text}</div>
                      <button onClick={()=>setComments(cs=>cs.filter(x=>x.id!==c.id))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:10}}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Main viewport ── */}
        <div ref={viewportRef} style={{
          flex:1, overflow:"auto", background:bgColor,
          display:"flex", flexDirection: viewMode==="twopage" ? "row" : "column",
          alignItems: viewMode==="twopage" ? "flex-start" : "center",
          padding:"20px 24px",
          gap: viewMode==="twopage" ? 12 : 0,
          justifyContent: viewMode==="twopage" ? "center" : "flex-start",
        }}>
          {loading && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,marginTop:80}}>
              <div style={{width:48,height:48,border:"4px solid #2563eb",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
              <p style={{color:mutedCol,fontSize:14}}>Loading PDF…</p>
            </div>
          )}
          {error && (
            <div style={{color:"#ef4444",textAlign:"center",marginTop:80,fontSize:14}}>
              <p>Failed to load PDF: {error}</p>
              <button onClick={()=>navigate("/workspace")} style={{marginTop:12,padding:"8px 16px",background:"#374151",border:"none",color:"#fff",borderRadius:4,cursor:"pointer"}}>← Back</button>
            </div>
          )}
          {!loading && !error && pdfDoc && pagesToRender.map(p=>(
            <div key={p} id={`pdf-page-${p}`}>
              <PageView
                pageNum={p}
                pdfDoc={pdfDoc}
                zoom={zoom}
                annotations={annotations}
                selectedId={selectedId}
                activeTool={activeTool}
                activeColor={activeColor}
                activeOpacity={activeOpacity}
                activeLineWidth={activeLineWidth}
                activeFontSize={activeFontSize}
                activeStamp={activeStamp}
                nightMode={nightMode}
                searchHighlights={allSearchHighlights}
                onAnnotationAdd={addAnnotation}
                onAnnotationSelect={setSelectedId}
                onAnnotationMove={moveAnnotation}
                onAnnotationDelete={deleteAnnotation}
                onPageVisible={onPageVisible}
                onTextInput={opts=>{ setTextInput({visible:true,...opts}); setTextInputValue(""); }}
              />
            </div>
          ))}
        </div>

        {/* ── Right panel (properties) ── */}
        {showRightPanel && selectedAnn && (
          <div style={{
            width:200, flexShrink:0, background:panelBg,
            borderLeft:`1px solid ${borderCol}`, padding:12, overflowY:"auto",
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:700,color:textCol}}>Properties</span>
              <button onClick={()=>setShowRightPanel(false)} style={{background:"none",border:"none",color:mutedCol,cursor:"pointer"}}>×</button>
            </div>
            <div style={{fontSize:11,color:mutedCol,marginBottom:8}}>
              Type: <span style={{color:textCol}}>{selectedAnn.type}</span><br/>
              Page: <span style={{color:textCol}}>{selectedAnn.page}</span>
            </div>
            <InputRow label="Color">
              <input type="color" value={selectedAnn.color} onChange={e=>updateAnnotation(selectedAnn.id,{color:e.target.value})} style={{width:"100%",height:28,padding:0,border:"none",cursor:"pointer"}}/>
            </InputRow>
            <InputRow label="Opacity">
              <input type="range" min={0.1} max={1} step={0.05} value={selectedAnn.opacity}
                onChange={e=>updateAnnotation(selectedAnn.id,{opacity:+e.target.value})} style={{width:"100%"}}/>
              <span style={{fontSize:10,color:mutedCol}}>{Math.round(selectedAnn.opacity*100)}%</span>
            </InputRow>
            {selectedAnn.lineWidth!==undefined && (
              <InputRow label="Line Width">
                <input type="range" min={1} max={12} step={0.5} value={selectedAnn.lineWidth}
                  onChange={e=>updateAnnotation(selectedAnn.id,{lineWidth:+e.target.value})} style={{width:"100%"}}/>
                <span style={{fontSize:10,color:mutedCol}}>{selectedAnn.lineWidth}pt</span>
              </InputRow>
            )}
            {selectedAnn.content!==undefined && (
              <InputRow label="Content">
                <textarea value={selectedAnn.content} onChange={e=>updateAnnotation(selectedAnn.id,{content:e.target.value})}
                  style={{width:"100%",boxSizing:"border-box",background:"#111827",border:"1px solid #374151",borderRadius:4,color:textCol,fontSize:11,padding:4,resize:"vertical",minHeight:50}}/>
              </InputRow>
            )}
            <button onClick={()=>{ deleteAnnotation(selectedAnn.id); setShowRightPanel(false); }} style={{
              width:"100%",padding:"6px",background:"#dc2626",border:"none",color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12,marginTop:8,
            }}>Delete Annotation</button>
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{
        background:headerBg, borderTop:`1px solid ${borderCol}`,
        display:"flex", alignItems:"center", gap:16, padding:"0 14px",
        height:26, flexShrink:0, fontSize:11, color:mutedCol,
      }}>
        <span>Page {currentPage} of {totalPages}</span>
        <span>Zoom: {Math.round(zoom*100)}%</span>
        <span>Tool: {TOOLS.find(t=>t.id===activeTool)?.label||activeTool}</span>
        {isDirty && <span style={{color:"#f59e0b"}}>● Unsaved changes</span>}
        {!isDirty && totalPages>0 && <span style={{color:"#10b981"}}>✓ Saved</span>}
        {saving && <span style={{color:"#60a5fa"}}>Saving…</span>}
        {annotations.length>0 && <span>{annotations.length} annotation{annotations.length!==1?"s":""}</span>}
        <div style={{flex:1}}/>
        <button onClick={()=>setShowRightPanel(r=>!r)} style={{
          background:showRightPanel?"#2563eb":"transparent",
          border:showRightPanel?"1px solid #2563eb":"1px solid transparent",
          color:textCol,borderRadius:3,padding:"1px 8px",cursor:"pointer",fontSize:10,
        }}>⚙ Props</button>
        <span style={{color:"#2563eb",fontWeight:700}}>🛡 Secure</span>
      </div>

      {/* ── Search panel (floating) ── */}
      {showSearch && (
        <div style={{
          position:"fixed", top:130, right:20, zIndex:9000,
          background:"#1a202c", border:"1px solid #374151", borderRadius:8,
          padding:14, width:320, boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontWeight:700,fontSize:13,color:textCol}}>Find & Replace</span>
            <button onClick={()=>setShowSearch(false)} style={{background:"none",border:"none",color:mutedCol,cursor:"pointer",fontSize:16}}>×</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doSearch()}
              placeholder="Search text…" autoFocus
              style={{flex:1,background:"#111827",border:"1px solid #374151",borderRadius:4,color:textCol,padding:"5px 8px",fontSize:12,outline:"none"}}/>
            <button onClick={doSearch} style={{padding:"5px 10px",background:"#2563eb",border:"none",color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12}}>Find</button>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input value={replaceQuery} onChange={e=>setReplaceQuery(e.target.value)}
              placeholder="Replace with… (add text annotation)"
              style={{flex:1,background:"#111827",border:"1px solid #374151",borderRadius:4,color:textCol,padding:"5px 8px",fontSize:12,outline:"none"}}/>
            <button onClick={()=>{
              if(!searchResults.length||!replaceQuery.trim()) return;
              const sr=searchResults[searchIdx];
              addAnnotation({
                id:makeId(),type:"text",page:sr.page,
                x:sr.x,y:sr.y,w:sr.w*3,h:sr.h*1.5,
                color:"#000000",opacity:1,fontSize:12,
                content:replaceQuery,createdAt:new Date().toISOString(),
              });
              toast.success("Replacement annotation added");
            }} style={{padding:"5px 10px",background:"#374151",border:"none",color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12}}>Replace</button>
          </div>
          {searchResults.length>0 && (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={searchPrev} style={{padding:"3px 10px",background:"#374151",border:"none",color:"#fff",borderRadius:3,cursor:"pointer"}}>←</button>
              <span style={{fontSize:11,color:mutedCol,flex:1,textAlign:"center"}}>
                {searchIdx+1} / {searchResults.length} on page {searchResults[searchIdx]?.page}
              </span>
              <button onClick={searchNext} style={{padding:"3px 10px",background:"#374151",border:"none",color:"#fff",borderRadius:3,cursor:"pointer"}}>→</button>
            </div>
          )}
        </div>
      )}

      {/* ── Text input popup ── */}
      {textInput.visible && (
        <div style={{
          position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,0.4)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <div style={{background:"#1a202c",border:"1px solid #374151",borderRadius:8,padding:16,width:340,boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}>
            <div style={{fontWeight:700,fontSize:13,color:textCol,marginBottom:10}}>
              {activeTool==="sticky" ? "Sticky Note" : "Add Text"}
            </div>
            <textarea value={textInputValue} onChange={e=>setTextInputValue(e.target.value)} autoFocus
              placeholder={activeTool==="sticky" ? "Note text…" : "Enter text…"}
              style={{width:"100%",boxSizing:"border-box",background:"#111827",border:"1px solid #374151",borderRadius:4,color:textCol,fontSize:13,padding:8,resize:"vertical",minHeight:80,outline:"none"}}
              onKeyDown={e=>{
                if(e.key==="Enter"&&!e.shiftKey){
                  e.preventDefault();
                  textInput.onDone(textInputValue);
                  setTextInput(t=>({...t,visible:false}));
                }
              }}
            />
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <Btn variant="primary" onClick={()=>{ textInput.onDone(textInputValue); setTextInput(t=>({...t,visible:false})); }}>Insert</Btn>
              <Btn onClick={()=>setTextInput(t=>({...t,visible:false}))}>Cancel</Btn>
            </div>
            <p style={{fontSize:10,color:mutedCol,marginTop:6}}>Tip: Enter to insert, Shift+Enter for new line</p>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      {dialog==="protect" && (
        <ProtectDialog fileId={fileId!} BASE={BASE} onClose={()=>setDialog(null)} />
      )}
      {dialog==="unlock" && (
        <UnlockDialog fileId={fileId!} BASE={BASE} onClose={()=>setDialog(null)} onDone={()=>{ setDialog(null); window.location.reload(); }} />
      )}
      {dialog==="watermark" && (
        <WatermarkDialog fileId={fileId!} BASE={BASE} onClose={()=>setDialog(null)}
          onDone={(text,opacity,angle)=>{ setDialog(null); pdfTool("watermark",{watermarkText:text,opacity,angle},"Watermark"); }}/>
      )}
      {dialog==="headerfooter" && (
        <HeaderFooterDialog onClose={()=>setDialog(null)}
          onDone={(h,f)=>{ setDialog(null); pdfTool("header-footer",{header:h,footer:f},"Header/Footer"); }}/>
      )}
      {dialog==="pagenumbers" && (
        <PageNumbersDialog onClose={()=>setDialog(null)}
          onDone={(pos)=>{ setDialog(null); pdfTool("page-numbers",{position:pos},"Page Numbers"); }}/>
      )}
      {dialog==="metadata" && (
        <MetadataDialog fileId={fileId!} BASE={BASE} onClose={()=>setDialog(null)} onDone={()=>setDialog(null)}/>
      )}
      {dialog==="qrcode" && (
        <QrCodeDialog onClose={()=>setDialog(null)}
          onDone={(data,page,x,y)=>{ setDialog(null); pdfTool("qrcode",{data,page,x,y},"QR Code"); }}/>
      )}
      {dialog==="insert-page" && (
        <InsertPageDialog currentPage={currentPage} totalPages={totalPages}
          onClose={()=>setDialog(null)}
          onDone={(after,size)=>{ setDialog(null); handleInsertPage(after,size); }}/>
      )}
      {dialog==="extract" && (
        <ExtractDialog totalPages={totalPages} BASE={BASE} fileId={fileId!} onClose={()=>setDialog(null)}/>
      )}
      {dialog==="split" && (
        <SplitDialog totalPages={totalPages} BASE={BASE} fileId={fileId!} onClose={()=>setDialog(null)}/>
      )}
      {dialog==="shortcuts" && (
        <ShortcutsDialog onClose={()=>setDialog(null)}/>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:#0f1117}
        ::-webkit-scrollbar-thumb{background:#374151;border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#4b5563}
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

// ── Ribbon Group helper ────────────────────────────────────────────────────────
function RibbonGroup({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:4, padding:"0 10px",
      borderRight:"1px solid #ffffff15", flexShrink:0,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start" }}>
        <div style={{ display:"flex", gap:4, alignItems:"center", flexWrap:"wrap" }}>{children}</div>
        <div style={{ fontSize:9, color:"#64748b", marginTop:3, textAlign:"center", width:"100%" }}>{label}</div>
      </div>
    </div>
  );
}

// ── Dialog components ─────────────────────────────────────────────────────────

function ProtectDialog({ fileId, BASE, onClose }: { fileId:string; BASE:string; onClose:()=>void }) {
  const [userPw, setUserPw] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [loading, setLoading] = useState(false);
  async function apply() {
    if (!userPw) { toast.error("User password required"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/pdf/protect/${fileId}`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userPassword:userPw, ownerPassword:ownerPw||userPw+"_owner" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("PDF password-protected (AES-256)");
      onClose();
    } catch(e:any) { toast.error(e.message); }
    setLoading(false);
  }
  return (
    <Modal title="🔒 Password Protect PDF (AES-256)" onClose={onClose}>
      <InputRow label="User Password (required to open)">
        <StyledInput type="password" value={userPw} onChange={e=>setUserPw(e.target.value)} placeholder="Enter user password…"/>
      </InputRow>
      <InputRow label="Owner Password (optional — controls permissions)">
        <StyledInput type="password" value={ownerPw} onChange={e=>setOwnerPw(e.target.value)} placeholder="Leave blank to auto-generate"/>
      </InputRow>
      <p style={{fontSize:11,color:"#8b9ab5",marginBottom:12}}>
        ⚠️ AES-256 encryption will be applied. Keep your password safe — it cannot be recovered.
      </p>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={apply} disabled={loading}>{loading?"Encrypting…":"Apply Protection"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function UnlockDialog({ fileId, BASE, onClose, onDone }: { fileId:string; BASE:string; onClose:()=>void; onDone:()=>void }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  async function apply() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/pdf/unlock/${fileId}`, {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ password:pw }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("PDF unlocked successfully");
      onDone();
    } catch(e:any) { toast.error(e.message); }
    setLoading(false);
  }
  return (
    <Modal title="🔓 Unlock PDF" onClose={onClose}>
      <InputRow label="Password">
        <StyledInput type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Enter PDF password…" autoFocus/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={apply} disabled={loading}>{loading?"Unlocking…":"Unlock"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function WatermarkDialog({ fileId, BASE, onClose, onDone }: {
  fileId:string; BASE:string; onClose:()=>void;
  onDone:(text:string,opacity:number,angle:number)=>void;
}) {
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.3);
  const [angle, setAngle] = useState(45);
  return (
    <Modal title="💧 Add Watermark" onClose={onClose}>
      <InputRow label="Watermark Text">
        <StyledInput value={text} onChange={e=>setText(e.target.value)}/>
      </InputRow>
      <InputRow label={`Opacity: ${Math.round(opacity*100)}%`}>
        <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={e=>setOpacity(+e.target.value)} style={{width:"100%"}}/>
      </InputRow>
      <InputRow label={`Rotation: ${angle}°`}>
        <input type="range" min={0} max={360} step={5} value={angle} onChange={e=>setAngle(+e.target.value)} style={{width:"100%"}}/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={()=>onDone(text,opacity,angle)}>Apply Watermark</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function HeaderFooterDialog({ onClose, onDone }: { onClose:()=>void; onDone:(h:string,f:string)=>void }) {
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("Page {{pageNum}}");
  return (
    <Modal title="📄 Header & Footer" onClose={onClose}>
      <InputRow label="Header Text (blank = none)">
        <StyledInput value={header} onChange={e=>setHeader(e.target.value)} placeholder="e.g. Company Confidential"/>
      </InputRow>
      <InputRow label="Footer Text ({{pageNum}} for page numbers)">
        <StyledInput value={footer} onChange={e=>setFooter(e.target.value)} placeholder="e.g. Page {{pageNum}}"/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={()=>onDone(header,footer)}>Apply</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function PageNumbersDialog({ onClose, onDone }: { onClose:()=>void; onDone:(pos:string)=>void }) {
  const [pos, setPos] = useState("bottom-center");
  return (
    <Modal title="🔢 Add Page Numbers" onClose={onClose}>
      <InputRow label="Position">
        <StyledSelect value={pos} onChange={e=>setPos(e.target.value)}>
          <option value="bottom-center">Bottom Center</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="top-center">Top Center</option>
          <option value="top-right">Top Right</option>
          <option value="top-left">Top Left</option>
        </StyledSelect>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={()=>onDone(pos)}>Apply</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function MetadataDialog({ fileId, BASE, onClose, onDone }: { fileId:string; BASE:string; onClose:()=>void; onDone:()=>void }) {
  const [meta, setMeta] = useState({ title:"", author:"", subject:"", keywords:"" });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    fetch(`${BASE}/pdf/metadata/${fileId}`,{credentials:"include"})
      .then(r=>r.json()).then(d=>setMeta({title:d.title||"",author:d.author||"",subject:d.subject||"",keywords:(d.keywords||[]).join(", ")}))
      .catch(()=>{});
  }, [fileId, BASE]);
  async function save() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/pdf/metadata/${fileId}`,{
        method:"PUT",credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...meta,keywords:meta.keywords.split(",").map(s=>s.trim()).filter(Boolean)}),
      });
      if(!r.ok) throw new Error("Failed");
      toast.success("Metadata updated");
      onDone();
    } catch(e:any) { toast.error(e.message); }
    setLoading(false);
  }
  return (
    <Modal title="🏷 Edit Document Metadata" onClose={onClose}>
      {(["title","author","subject","keywords"] as const).map(k=>(
        <InputRow key={k} label={k[0].toUpperCase()+k.slice(1)}>
          <StyledInput value={meta[k]} onChange={e=>setMeta(m=>({...m,[k]:e.target.value}))} placeholder={k==="keywords"?"comma-separated":""}/>
        </InputRow>
      ))}
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={save} disabled={loading}>{loading?"Saving…":"Save Metadata"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function QrCodeDialog({ onClose, onDone }: { onClose:()=>void; onDone:(data:string,page:number,x:number,y:number)=>void }) {
  const [data, setData] = useState("https://");
  const [page, setPage] = useState(1);
  const [x, setX] = useState(50); const [y, setY] = useState(50);
  return (
    <Modal title="📱 Add QR Code" onClose={onClose}>
      <InputRow label="QR Code Data / URL">
        <StyledInput value={data} onChange={e=>setData(e.target.value)} placeholder="https://…"/>
      </InputRow>
      <InputRow label="Page Number">
        <StyledInput type="number" min={1} value={page} onChange={e=>setPage(+e.target.value)}/>
      </InputRow>
      <InputRow label="Position X (pts from left)">
        <StyledInput type="number" value={x} onChange={e=>setX(+e.target.value)}/>
      </InputRow>
      <InputRow label="Position Y (pts from bottom)">
        <StyledInput type="number" value={y} onChange={e=>setY(+e.target.value)}/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={()=>onDone(data,page,x,y)}>Insert QR Code</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function InsertPageDialog({ currentPage, totalPages, onClose, onDone }: {
  currentPage:number; totalPages:number; onClose:()=>void; onDone:(after:number,size:string)=>void;
}) {
  const [after, setAfter] = useState(currentPage);
  const [size, setSize] = useState("A4 Portrait");
  return (
    <Modal title="+ Insert Blank Page" onClose={onClose}>
      <InputRow label="Insert after page">
        <StyledInput type="number" min={0} max={totalPages} value={after} onChange={e=>setAfter(+e.target.value)}/>
        <span style={{fontSize:10,color:"#8b9ab5",marginTop:3}}>0 = insert before first page</span>
      </InputRow>
      <InputRow label="Page Size">
        <StyledSelect value={size} onChange={e=>setSize(e.target.value)}>
          {PAGE_SIZES.map(p=><option key={p.label} value={p.label}>{p.label} ({p.w}×{p.h}pt)</option>)}
        </StyledSelect>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={()=>onDone(after,size)}>Insert Page</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function ExtractDialog({ totalPages, BASE, fileId, onClose }: { totalPages:number; BASE:string; fileId:string; onClose:()=>void }) {
  const [pages, setPages] = useState("");
  const [loading, setLoading] = useState(false);
  async function apply() {
    const nums = pages.split(/[,\s]+/).map(Number).filter(n=>n>=1&&n<=totalPages);
    if (!nums.length) { toast.error("Enter valid page numbers"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/pdf/extract-pages`,{
        method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({fileId,pageNumbers:nums}),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const d = await r.json();
      toast.success(`Extracted ${nums.length} pages — new file created`);
      onClose();
    } catch(e:any) { toast.error(e.message||"Failed"); }
    setLoading(false);
  }
  return (
    <Modal title="✂ Extract Pages" onClose={onClose}>
      <p style={{fontSize:12,color:"#8b9ab5",marginBottom:10}}>Total pages: {totalPages}</p>
      <InputRow label="Pages to extract (e.g. 1,3,5-7)">
        <StyledInput value={pages} onChange={e=>setPages(e.target.value)} placeholder="1,2,5"/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={apply} disabled={loading}>{loading?"Extracting…":"Extract"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function SplitDialog({ totalPages, BASE, fileId, onClose }: { totalPages:number; BASE:string; fileId:string; onClose:()=>void }) {
  const [splitAt, setSplitAt] = useState(`${Math.ceil(totalPages/2)}`);
  const [loading, setLoading] = useState(false);
  async function apply() {
    const page = parseInt(splitAt);
    if (isNaN(page)||page<1||page>=totalPages) { toast.error("Invalid split page"); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/pdf/split/${fileId}`,{
        method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ranges:[{start:1,end:page},{start:page+1,end:totalPages}]}),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("PDF split into 2 files");
      onClose();
    } catch(e:any) { toast.error(e.message||"Failed"); }
    setLoading(false);
  }
  return (
    <Modal title="✂ Split PDF" onClose={onClose}>
      <p style={{fontSize:12,color:"#8b9ab5",marginBottom:10}}>Total pages: {totalPages}</p>
      <InputRow label="Split after page">
        <StyledInput type="number" min={1} max={totalPages-1} value={splitAt} onChange={e=>setSplitAt(e.target.value)}/>
      </InputRow>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="primary" onClick={apply} disabled={loading}>{loading?"Splitting…":"Split"}</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

function ShortcutsDialog({ onClose }: { onClose:()=>void }) {
  const shortcuts = [
    ["Ctrl+S","Save"],["Ctrl+Z","Undo"],["Ctrl+Y / Ctrl+Shift+Z","Redo"],
    ["Ctrl+F","Find"],["Ctrl++","Zoom In"],["Ctrl+-","Zoom Out"],["Ctrl+0","Reset Zoom"],
    ["V","Select tool"],["H","Highlight"],["U","Underline"],["R","Rectangle"],
    ["C","Circle"],["A","Arrow"],["F","Freehand"],["T","Add Text"],
    ["S","Sticky Note"],["P","Pan"],["E","Eraser"],
    ["Delete / Backspace","Delete selected annotation"],["Escape","Deselect"],
  ];
  return (
    <Modal title="⌨ Keyboard Shortcuts" onClose={onClose} width={460}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {shortcuts.map(([key,desc])=>(
          <div key={key} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"4px 0",borderBottom:"1px solid #232d3d"}}>
            <code style={{background:"#111827",borderRadius:3,padding:"1px 6px",fontSize:11,color:"#60a5fa"}}>{key}</code>
            <span style={{fontSize:11,color:"#e2e8f0"}}>{desc}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:12,textAlign:"right"}}>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}
