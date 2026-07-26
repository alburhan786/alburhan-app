import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import PdfDropZone, { UploadedFile } from "@/components/PdfDropZone";
import { pdf as pdfApi } from "@/lib/api";
import {
  Layers, Scissors, Minimize2, RotateCcw, Droplets, PenTool,
  QrCode, Type, Tag, Lock, GitCompare, FileSearch, ArrowUpDown,
  Hash, FileText, Download, X, Plus, CheckCircle2, Loader2,
  RefreshCcw, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";

const BASE = import.meta.env.BASE_URL + "api";

const TOOLS = [
  { id: "merge",       icon: Layers,      label: "Merge PDFs",       desc: "Combine multiple PDFs into one",               color: "#3b82f6", multi: true  },
  { id: "split",       icon: Scissors,    label: "Split PDF",        desc: "Split into parts by page ranges",              color: "#10b981", multi: false },
  { id: "compress",    icon: Minimize2,   label: "Compress PDF",     desc: "Reduce file size by optimizing streams",       color: "#8b5cf6", multi: false },
  { id: "rotate",      icon: RotateCcw,   label: "Rotate Pages",     desc: "Rotate specific pages or all pages",           color: "#f59e0b", multi: false },
  { id: "reorder",     icon: ArrowUpDown, label: "Reorder Pages",    desc: "Rearrange pages into a new order",             color: "#ec4899", multi: false },
  { id: "watermark",   icon: Droplets,    label: "Add Watermark",    desc: "Stamp text watermark on every page",           color: "#06b6d4", multi: false },
  { id: "signature",   icon: PenTool,     label: "Digital Signature",desc: "Draw and embed your signature",                color: "#10b981", multi: false },
  { id: "qrcode",      icon: QrCode,      label: "Add QR Code",      desc: "Embed a QR code on a page",                   color: "#6366f1", multi: false },
  { id: "annotate",    icon: Type,        label: "Add Annotation",   desc: "Insert text annotation at any position",       color: "#f59e0b", multi: false },
  { id: "metadata",    icon: Tag,         label: "Edit Metadata",    desc: "Update title, author, subject, keywords",      color: "#3b82f6", multi: false },
  { id: "unlock",      icon: Lock,        label: "Unlock PDF",       desc: "Detect & remove PDF password protection",      color: "#ef4444", multi: false },
  { id: "compare",     icon: GitCompare,  label: "Compare PDFs",     desc: "Compare text content between two PDFs",        color: "#8b5cf6", multi: false },
  { id: "extract",     icon: FileSearch,  label: "Extract Text",     desc: "Extract all readable text from a PDF",         color: "#10b981", multi: false },
  { id: "pagenumbers", icon: Hash,        label: "Page Numbers",     desc: "Add page numbers to the document",             color: "#f59e0b", multi: false },
  { id: "headerfooter",icon: FileText,    label: "Header & Footer",  desc: "Add header and/or footer to every page",       color: "#06b6d4", multi: false },
];

type ToolResult =
  | { type: "file";    id: string; name: string; message?: string }
  | { type: "files";   items: { id: string; name: string }[]; message: string }
  | { type: "text";    text: string; wordCount?: number }
  | { type: "compare"; similarity: number; onlyInA: string[]; onlyInB: string[] };

function dl(fileId: string, name: string) {
  const a = document.createElement("a");
  a.href = `${BASE}/files/${fileId}/download`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1e2433", borderRadius: 10, padding: "1.2rem", marginBottom: 12 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "#8b9ab5", marginBottom: 5 }}>{children}</div>;
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", padding: "7px 10px", background: "#0d1117",
        border: "1px solid #2a3347", borderRadius: 6, color: "#d4d8e1",
        fontSize: 13, boxSizing: "border-box",
        ...(props.style || {}),
      }}
    />
  );
}

function Sel(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%", padding: "7px 10px", background: "#0d1117",
        border: "1px solid #2a3347", borderRadius: 6, color: "#d4d8e1", fontSize: 13,
        ...(props.style || {}),
      }}
    />
  );
}

export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [dzKey, setDzKey] = useState(0);
  const [dzKeyB, setDzKeyB] = useState(0);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [filesB, setFilesB] = useState<UploadedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const sigRef = useRef<any>(null);

  // Tool-specific state
  const [splitRanges, setSplitRanges] = useState([{ start: 1, end: 1, name: "" }]);
  const [rotations, setRotations] = useState([{ page: 1, angle: 90 as 0 | 90 | 180 | 270 }]);
  const [reorderStr, setReorderStr] = useState("");
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmOpacity, setWmOpacity] = useState(0.3);
  const [wmAngle, setWmAngle] = useState(45);
  const [wmFontSize, setWmFontSize] = useState(60);
  const [annText, setAnnText] = useState("");
  const [annPage, setAnnPage] = useState(1);
  const [annX, setAnnX] = useState(50);
  const [annY, setAnnY] = useState(700);
  const [annSize, setAnnSize] = useState(12);
  const [qrContent, setQrContent] = useState("https://alburhantravels.com");
  const [qrPage, setQrPage] = useState(1);
  const [qrX, setQrX] = useState(400);
  const [qrY, setQrY] = useState(50);
  const [qrSize, setQrSize] = useState(100);
  const [sigPage, setSigPage] = useState(1);
  const [sigX, setSigX] = useState(50);
  const [sigY, setSigY] = useState(50);
  const [meta, setMeta] = useState<any>({});
  const [pnStart, setPnStart] = useState(1);
  const [pnPosition, setPnPosition] = useState("bottom-center");
  const [hfHeader, setHfHeader] = useState("");
  const [hfFooter, setHfFooter] = useState("");
  // Unlock fallback — shown only after auto-bypass fails
  const [unlockFailed, setUnlockFailed] = useState(false);
  const [unlockFallbackPw, setUnlockFallbackPw] = useState("");
  const [unlockFallbackVisible, setUnlockFallbackVisible] = useState(false);
  const [unlockFallbackError, setUnlockFallbackError] = useState("");


  const readyIds = files.filter((f) => f.status === "done").map((f) => f.fileId!);
  const readyIdsB = filesB.filter((f) => f.status === "done").map((f) => f.fileId!);
  const uploading = files.some((f) => f.status === "uploading");
  const uploadingB = filesB.some((f) => f.status === "uploading");
  const tool = TOOLS.find((t) => t.id === activeTool);

  function changeTool(id: string) {
    setActiveTool(id);
    setDzKey((k) => k + 1);
    setDzKeyB((k) => k + 1);
    setFiles([]);
    setFilesB([]);
    setResult(null);
    setMeta({});
    setUnlockFailed(false);
    setUnlockFallbackPw("");
    setUnlockFallbackError("");
  }

  // Auto-load metadata when file is uploaded
  useEffect(() => {
    if (activeTool === "metadata" && readyIds.length > 0) {
      pdfApi.getMetadata(readyIds[0]).then(setMeta).catch(() => {});
    }
  }, [activeTool, readyIds[0]]);

  const minFiles = activeTool === "merge" ? 2 : 1;
  const needsB = activeTool === "compare";
  const canRun =
    readyIds.length >= minFiles &&
    !uploading &&
    !processing &&
    (!needsB || (readyIdsB.length >= 1 && !uploadingB));

  async function run() {
    setProcessing(true);
    setResult(null);
    try {
      let r: ToolResult | null = null;
      switch (activeTool) {
        case "merge": {
          const fd = new FormData();
          fd.append("outputName", "merged.pdf");
          readyIds.forEach((id) => fd.append("fileIds", id));
          const res = await pdfApi.merge(fd);
          r = { type: "file", id: res.id, name: res.name, message: `Merged ${readyIds.length} PDFs successfully` };
          toast.success(`Merged ${readyIds.length} PDFs!`);
          break;
        }
        case "split": {
          const res: any[] = await pdfApi.split(readyIds[0], splitRanges);
          r = { type: "files", items: res.map((f: any) => ({ id: f.id, name: f.name })), message: `Split into ${res.length} file${res.length > 1 ? "s" : ""}` };
          toast.success(`Split into ${res.length} parts`);
          break;
        }
        case "compress": {
          const res = await pdfApi.compress(readyIds[0]);
          r = { type: "file", id: res.id, name: res.name, message: `Compressed — saved ~${res.reduction ?? 0}%` };
          toast.success(`Compressed! Saved ~${res.reduction ?? 0}%`);
          break;
        }
        case "rotate": {
          const res = await pdfApi.rotate(readyIds[0], rotations);
          r = { type: "file", id: res.id, name: res.name, message: "Pages rotated" };
          toast.success("Pages rotated");
          break;
        }
        case "reorder": {
          const order = reorderStr.split(",").map((n) => parseInt(n.trim())).filter((n) => !isNaN(n));
          if (!order.length) throw new Error("Enter page order, e.g. 3, 1, 2");
          const res = await pdfApi.reorder(readyIds[0], order);
          r = { type: "file", id: res.id, name: res.name, message: "Pages reordered" };
          toast.success("Pages reordered");
          break;
        }
        case "watermark": {
          if (!wmText.trim()) throw new Error("Enter watermark text");
          const res = await pdfApi.watermark(readyIds[0], { text: wmText, opacity: wmOpacity, angle: wmAngle, fontSize: wmFontSize });
          r = { type: "file", id: res.id, name: res.name, message: "Watermark applied" };
          toast.success("Watermark applied");
          break;
        }
        case "signature": {
          if (sigRef.current?.isEmpty()) throw new Error("Draw a signature first");
          const dataUrl = sigRef.current.toDataURL("image/png");
          const res = await pdfApi.addSignature(readyIds[0], { signatureDataUrl: dataUrl, page: sigPage, x: sigX, y: sigY, timestamp: true });
          r = { type: "file", id: res.id, name: res.name, message: "Signature embedded" };
          toast.success("Signature embedded");
          break;
        }
        case "qrcode": {
          if (!qrContent.trim()) throw new Error("Enter QR code content");
          const res = await pdfApi.addQRCode(readyIds[0], { content: qrContent, page: qrPage, x: qrX, y: qrY, size: qrSize });
          r = { type: "file", id: res.id, name: res.name, message: "QR code embedded" };
          toast.success("QR code added");
          break;
        }
        case "annotate": {
          if (!annText.trim()) throw new Error("Enter annotation text");
          const res = await pdfApi.annotate(readyIds[0], { text: annText, page: annPage, x: annX, y: annY, fontSize: annSize });
          r = { type: "file", id: res.id, name: res.name, message: "Annotation added" };
          toast.success("Annotation added");
          break;
        }
        case "metadata": {
          const res = await pdfApi.updateMetadata(readyIds[0], meta);
          r = { type: "file", id: res.id, name: res.name, message: "Metadata updated" };
          toast.success("Metadata saved");
          break;
        }
        case "unlock": {
          try {
            const res = await pdfApi.unlock(readyIds[0]);
            r = { type: "file", id: res.id, name: res.name, message: "Password removed — PDF is now fully accessible" };
            toast.success("PDF unlocked!");
            setUnlockFailed(false);
          } catch (_) {
            // Auto-bypass failed — show password fallback inline, don't toast
            setUnlockFailed(true);
            setUnlockFallbackPw("");
            setUnlockFallbackError("");
            setProcessing(false);
            return;
          }
          break;
        }
        case "extract": {
          const res = await pdfApi.extractText(readyIds[0]);
          r = { type: "text", text: res.text, wordCount: res.wordCount };
          toast.success(`Extracted ${res.wordCount} words`);
          break;
        }
        case "compare": {
          const res = await pdfApi.compare(readyIds[0], readyIdsB[0]);
          r = { type: "compare", similarity: res.similarity, onlyInA: res.onlyInA ?? [], onlyInB: res.onlyInB ?? [] };
          break;
        }
        case "pagenumbers": {
          const res = await pdfApi.addPageNumbers(readyIds[0], { startFrom: pnStart, position: pnPosition });
          r = { type: "file", id: res.id, name: res.name, message: "Page numbers added" };
          toast.success("Page numbers added");
          break;
        }
        case "headerfooter": {
          const res = await pdfApi.addHeaderFooter(readyIds[0], { header: hfHeader || undefined, footer: hfFooter || undefined });
          r = { type: "file", id: res.id, name: res.name, message: "Header/footer applied" };
          toast.success("Header/footer applied");
          break;
        }
      }
      if (r) {
        setResult(r);
        if (r.type === "file") setTimeout(() => dl(r.id, r.name), 300);
      }
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setProcessing(false);
    }
  }

  async function runUnlockWithPassword() {
    if (!unlockFallbackPw.trim() || !readyIds[0] || processing) return;
    setProcessing(true);
    setUnlockFallbackError("");
    try {
      const res = await pdfApi.unlock(readyIds[0], unlockFallbackPw);
      const r: ToolResult = { type: "file", id: res.id, name: res.name, message: "Password removed — PDF is now fully accessible" };
      setResult(r);
      setUnlockFailed(false);
      setTimeout(() => dl(r.id, r.name), 300);
      toast.success("PDF unlocked!");
    } catch (err: any) {
      if (err.message === "Incorrect password") {
        setUnlockFallbackError("Incorrect password — please check and try again.");
      } else {
        toast.error(err.message || "Failed to unlock");
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Layout>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 240, borderRight: "1px solid #1e2433", overflowY: "auto", padding: "10px 6px", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 8px", marginBottom: 6 }}>
            PDF Tools
          </div>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => changeTool(t.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 9,
                padding: "8px 9px", borderRadius: 7, cursor: "pointer", textAlign: "left",
                background: activeTool === t.id ? "#1a2a4a" : "transparent",
                border: `1px solid ${activeTool === t.id ? "#3b82f6" : "transparent"}`,
                marginBottom: 2,
              }}
            >
              <div style={{ width: 26, height: 26, background: `${t.color}18`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <t.icon size={12} color={t.color} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: activeTool === t.id ? "#d4d8e1" : "#8b9ab5" }}>{t.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Workspace ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {!activeTool ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, opacity: 0.5 }}>
              <div style={{ fontSize: 40 }}>🛠</div>
              <div style={{ color: "#4a5568", fontSize: 14 }}>Select a tool from the left panel</div>
            </div>
          ) : (
            <div style={{ maxWidth: 680 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, background: `${tool?.color}18`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {tool && <tool.icon size={20} color={tool.color} />}
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>{tool?.label}</h2>
                  <p style={{ fontSize: 12, color: "#4a5568", margin: 0 }}>{tool?.desc}</p>
                </div>
              </div>

              {/* Drop Zone */}
              {activeTool === "compare" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <Section title="Document A">
                    <PdfDropZone key={`dzA-${dzKey}`} onFilesChange={setFiles} maxFiles={1} allowReorder={false} label="Drop Document A" />
                  </Section>
                  <Section title="Document B">
                    <PdfDropZone key={`dzB-${dzKeyB}`} onFilesChange={setFilesB} maxFiles={1} allowReorder={false} label="Drop Document B" />
                  </Section>
                </div>
              ) : (
                <Section title={activeTool === "merge" ? "Files to Merge (drag to reorder)" : "Upload PDF"}>
                  <PdfDropZone
                    key={`dz-${dzKey}`}
                    onFilesChange={setFiles}
                    maxFiles={activeTool === "merge" ? undefined : 1}
                    allowReorder={activeTool === "merge"}
                    label={activeTool === "merge" ? "Drop PDF files to merge (drag to reorder)" : undefined}
                  />
                </Section>
              )}

              {/* ── Tool-specific options ── */}
              {activeTool === "split" && (
                <Section title="Page Ranges">
                  {splitRanges.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: "0 0 80px" }}>
                        <Label>From</Label>
                        <Inp type="number" min="1" value={r.start} onChange={(e) => { const n = [...splitRanges]; n[i].start = +e.target.value; setSplitRanges(n); }} />
                      </div>
                      <div style={{ flex: "0 0 80px" }}>
                        <Label>To</Label>
                        <Inp type="number" min="1" value={r.end} onChange={(e) => { const n = [...splitRanges]; n[i].end = +e.target.value; setSplitRanges(n); }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Label>Output name (optional)</Label>
                        <Inp type="text" value={r.name} onChange={(e) => { const n = [...splitRanges]; n[i].name = e.target.value; setSplitRanges(n); }} placeholder="part-1.pdf" />
                      </div>
                      {splitRanges.length > 1 && (
                        <button onClick={() => setSplitRanges(splitRanges.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", marginTop: 20, padding: 4 }}><X size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setSplitRanges([...splitRanges, { start: 1, end: 1, name: "" }])}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#1e2433", border: "1px solid #2a3347", borderRadius: 6, color: "#8b9ab5", cursor: "pointer", fontSize: 12 }}>
                    <Plus size={12} /> Add Range
                  </button>
                </Section>
              )}

              {activeTool === "rotate" && (
                <Section title="Rotations">
                  {rotations.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <Label>Page</Label>
                        <Inp type="number" min="1" value={r.page} onChange={(e) => { const n = [...rotations]; n[i].page = +e.target.value; setRotations(n); }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Label>Rotation</Label>
                        <Sel value={r.angle} onChange={(e) => { const n = [...rotations]; n[i].angle = +e.target.value as any; setRotations(n); }}>
                          <option value={90}>90° Clockwise</option>
                          <option value={180}>180°</option>
                          <option value={270}>270° Clockwise</option>
                          <option value={0}>Reset to 0°</option>
                        </Sel>
                      </div>
                      {rotations.length > 1 && (
                        <button onClick={() => setRotations(rotations.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", marginTop: 20, padding: 4 }}><X size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setRotations([...rotations, { page: 1, angle: 90 }])}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#1e2433", border: "1px solid #2a3347", borderRadius: 6, color: "#8b9ab5", cursor: "pointer", fontSize: 12 }}>
                    <Plus size={12} /> Add Page
                  </button>
                </Section>
              )}

              {activeTool === "reorder" && (
                <Section title="New Page Order">
                  <Label>Enter all page numbers in the new order (comma-separated)</Label>
                  <Inp type="text" value={reorderStr} onChange={(e) => setReorderStr(e.target.value)} placeholder="e.g. 3, 1, 2, 4, 5" />
                  <div style={{ fontSize: 11, color: "#4a5568", marginTop: 6 }}>
                    Enter every page number. Example: for a 5-page PDF reversed, type: 5, 4, 3, 2, 1
                  </div>
                </Section>
              )}

              {activeTool === "watermark" && (
                <Section title="Watermark Options">
                  <div style={{ marginBottom: 10 }}>
                    <Label>Watermark Text</Label>
                    <Inp type="text" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="CONFIDENTIAL" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div><Label>Opacity (0–1)</Label><Inp type="number" min="0.05" max="1" step="0.05" value={wmOpacity} onChange={(e) => setWmOpacity(+e.target.value)} /></div>
                    <div><Label>Angle (°)</Label><Inp type="number" value={wmAngle} onChange={(e) => setWmAngle(+e.target.value)} /></div>
                    <div><Label>Font Size</Label><Inp type="number" min="12" max="200" value={wmFontSize} onChange={(e) => setWmFontSize(+e.target.value)} /></div>
                  </div>
                </Section>
              )}

              {activeTool === "signature" && (
                <Section title="Signature">
                  <Label>Draw your signature below</Label>
                  <div style={{ border: "1px solid #2a3347", borderRadius: 8, overflow: "hidden", background: "#fff", marginBottom: 8 }}>
                    <SignatureCanvas
                      ref={sigRef}
                      penColor="#0f172a"
                      canvasProps={{ width: 600, height: 130, style: { width: "100%", maxWidth: 600, height: 130 } }}
                    />
                  </div>
                  <button onClick={() => sigRef.current?.clear()}
                    style={{ fontSize: 12, padding: "4px 12px", background: "#1e2433", border: "1px solid #2a3347", borderRadius: 5, color: "#8b9ab5", cursor: "pointer", marginBottom: 12 }}>
                    Clear Signature
                  </button>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div><Label>Page</Label><Inp type="number" min="1" value={sigPage} onChange={(e) => setSigPage(+e.target.value)} /></div>
                    <div><Label>X Position</Label><Inp type="number" value={sigX} onChange={(e) => setSigX(+e.target.value)} /></div>
                    <div><Label>Y Position</Label><Inp type="number" value={sigY} onChange={(e) => setSigY(+e.target.value)} /></div>
                  </div>
                </Section>
              )}

              {activeTool === "qrcode" && (
                <Section title="QR Code Options">
                  <div style={{ marginBottom: 10 }}>
                    <Label>Content (URL, text, email, etc.)</Label>
                    <Inp type="text" value={qrContent} onChange={(e) => setQrContent(e.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                    <div><Label>Page</Label><Inp type="number" min="1" value={qrPage} onChange={(e) => setQrPage(+e.target.value)} /></div>
                    <div><Label>X</Label><Inp type="number" value={qrX} onChange={(e) => setQrX(+e.target.value)} /></div>
                    <div><Label>Y</Label><Inp type="number" value={qrY} onChange={(e) => setQrY(+e.target.value)} /></div>
                    <div><Label>Size (px)</Label><Inp type="number" min="50" value={qrSize} onChange={(e) => setQrSize(+e.target.value)} /></div>
                  </div>
                </Section>
              )}

              {activeTool === "annotate" && (
                <Section title="Annotation">
                  <div style={{ marginBottom: 10 }}>
                    <Label>Text</Label>
                    <textarea
                      value={annText}
                      onChange={(e) => setAnnText(e.target.value)}
                      rows={3}
                      placeholder="Enter annotation text…"
                      style={{ width: "100%", padding: "7px 10px", background: "#0d1117", border: "1px solid #2a3347", borderRadius: 6, color: "#d4d8e1", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                    <div><Label>Page</Label><Inp type="number" min="1" value={annPage} onChange={(e) => setAnnPage(+e.target.value)} /></div>
                    <div><Label>X</Label><Inp type="number" value={annX} onChange={(e) => setAnnX(+e.target.value)} /></div>
                    <div><Label>Y</Label><Inp type="number" value={annY} onChange={(e) => setAnnY(+e.target.value)} /></div>
                    <div><Label>Font Size</Label><Inp type="number" min="8" max="72" value={annSize} onChange={(e) => setAnnSize(+e.target.value)} /></div>
                  </div>
                </Section>
              )}

              {activeTool === "metadata" && (
                <Section title="Metadata Fields">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {["title", "author", "subject", "keywords", "producer", "creator"].map((k) => (
                      <div key={k}>
                        <Label>{k.charAt(0).toUpperCase() + k.slice(1)}</Label>
                        <Inp type="text" value={meta[k] || ""} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} placeholder={`PDF ${k}`} />
                      </div>
                    ))}
                  </div>
                  {readyIds.length > 0 && (
                    <button
                      onClick={() => pdfApi.getMetadata(readyIds[0]).then(setMeta).catch((e) => toast.error(e.message))}
                      style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#1e2433", border: "1px solid #2a3347", borderRadius: 6, color: "#8b9ab5", cursor: "pointer", fontSize: 12 }}>
                      <RefreshCcw size={12} /> Reload from file
                    </button>
                  )}
                </Section>
              )}

              {activeTool === "unlock" && !unlockFailed && (
                <Section>
                  <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#4ade80", lineHeight: 1.5 }}>
                    🔓 <strong>Auto-Bypass:</strong> Automatically removes PDF password protection — no password required.
                    Works on owner-restricted PDFs and commonly-protected files. All content (text, fonts, images, annotations, metadata) is preserved.
                  </div>
                </Section>
              )}

              {activeTool === "unlock" && unlockFailed && (
                <Section>
                  <div style={{ background: "#1c0a00", border: "1px solid #92400e", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fbbf24", lineHeight: 1.6, marginBottom: 14 }}>
                    ⚠️ <strong>Auto-bypass didn't work.</strong> This PDF uses a custom user password that couldn't be cracked automatically.
                    Enter the document's password below to unlock it.
                  </div>
                  <Label>Document Password</Label>
                  <div style={{ position: "relative" }}>
                    <Inp
                      type={unlockFallbackVisible ? "text" : "password"}
                      value={unlockFallbackPw}
                      onChange={(e) => { setUnlockFallbackPw(e.target.value); setUnlockFallbackError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") runUnlockWithPassword(); }}
                      placeholder="Enter PDF password"
                      style={{ paddingRight: 42, borderColor: unlockFallbackError ? "#ef4444" : undefined }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setUnlockFallbackVisible((v) => !v)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#4a5568", padding: 2, display: "flex", alignItems: "center" }}
                    >
                      {unlockFallbackVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {unlockFallbackError && (
                    <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginTop: 6 }}>⚠ {unlockFallbackError}</div>
                  )}
                  <button
                    onClick={runUnlockWithPassword}
                    disabled={!unlockFallbackPw.trim() || processing}
                    style={{
                      marginTop: 12, width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
                      background: unlockFallbackPw.trim() && !processing ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "#1e2433",
                      color: unlockFallbackPw.trim() && !processing ? "#fff" : "#374151",
                      fontWeight: 700, fontSize: 13, cursor: unlockFallbackPw.trim() && !processing ? "pointer" : "not-allowed",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    {processing ? <><Loader2 size={14} className="animate-spin" /> Unlocking…</> : <><Lock size={14} /> Unlock with Password</>}
                  </button>
                </Section>
              )}

              {activeTool === "pagenumbers" && (
                <Section title="Page Number Options">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><Label>Start Numbering From</Label><Inp type="number" min="1" value={pnStart} onChange={(e) => setPnStart(+e.target.value)} /></div>
                    <div>
                      <Label>Position</Label>
                      <Sel value={pnPosition} onChange={(e) => setPnPosition(e.target.value)}>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="top-center">Top Center</option>
                        <option value="top-right">Top Right</option>
                        <option value="top-left">Top Left</option>
                      </Sel>
                    </div>
                  </div>
                </Section>
              )}

              {activeTool === "headerfooter" && (
                <Section title="Header & Footer Text">
                  <div style={{ marginBottom: 10 }}>
                    <Label>Header Text (leave blank to skip)</Label>
                    <Inp type="text" value={hfHeader} onChange={(e) => setHfHeader(e.target.value)} placeholder="e.g. Company Confidential" />
                  </div>
                  <div>
                    <Label>Footer Text (leave blank to skip)</Label>
                    <Inp type="text" value={hfFooter} onChange={(e) => setHfFooter(e.target.value)} placeholder="e.g. Page {n} of {total}" />
                  </div>
                </Section>
              )}

              {/* ── Run Button ── */}
              <div style={{ marginBottom: 16 }}>
                {uploading || uploadingB ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#0f172a", borderRadius: 8, fontSize: 13, color: "#60a5fa" }}>
                    <Loader2 size={15} className="animate-spin" /> Uploading files… please wait
                  </div>
                ) : (
                  <button
                    onClick={run}
                    disabled={!canRun || processing}
                    style={{
                      width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
                      background: canRun && !processing
                        ? `linear-gradient(135deg, ${tool?.color || "#3b82f6"}, ${tool?.color || "#3b82f6"}cc)`
                        : "#1e2433",
                      color: canRun && !processing ? "#fff" : "#374151",
                      fontWeight: 700, fontSize: 14, cursor: canRun && !processing ? "pointer" : "not-allowed",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      boxShadow: canRun && !processing ? `0 2px 12px ${tool?.color || "#3b82f6"}44` : "none",
                      transition: "all 0.2s",
                    }}
                  >
                    {processing ? (
                      <><Loader2 size={16} className="animate-spin" /> Processing…</>
                    ) : !canRun && files.length === 0 ? (
                      <>Upload a PDF file to begin</>
                    ) : !canRun && activeTool === "merge" && readyIds.length < 2 ? (
                      <>Upload at least 2 files to merge</>
                    ) : !canRun && needsB && readyIdsB.length < 1 ? (
                      <>Upload both documents to compare</>
                    ) : (
                      <>{tool?.label}</>
                    )}
                  </button>
                )}
              </div>

              {/* ── Result ── */}
              {result && (
                <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 10, padding: "1.2rem", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: result.type === "text" || result.type === "compare" ? 12 : 0 }}>
                    <CheckCircle2 size={18} color="#10b981" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>
                      {result.type === "file" ? result.message || "Done!" :
                       result.type === "files" ? result.message :
                       result.type === "text" ? `Extracted ${result.wordCount?.toLocaleString()} words` :
                       "Comparison complete"}
                    </span>
                  </div>

                  {result.type === "file" && (
                    <button
                      onClick={() => dl(result.id, result.name)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "9px 18px",
                        background: "#10b981", color: "#fff", border: "none", borderRadius: 8,
                        cursor: "pointer", fontWeight: 700, fontSize: 13, marginTop: 10,
                      }}
                    >
                      <Download size={15} /> Download {result.name}
                    </button>
                  )}

                  {result.type === "files" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {result.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => dl(item.id, item.name)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                            background: "#0d1117", border: "1px solid #166534", borderRadius: 7,
                            cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#4ade80",
                          }}
                        >
                          <Download size={14} /> {item.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {result.type === "text" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                        <button
                          onClick={() => { navigator.clipboard.writeText(result.text); toast.success("Copied!"); }}
                          style={{ padding: "4px 10px", background: "#1e2433", border: "1px solid #2a3347", borderRadius: 5, color: "#8b9ab5", cursor: "pointer", fontSize: 12 }}>
                          Copy All
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={result.text}
                        rows={12}
                        style={{ width: "100%", padding: "10px", background: "#0d1117", border: "1px solid #2a3347", borderRadius: 8, color: "#d4d8e1", fontSize: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "monospace" }}
                      />
                    </div>
                  )}

                  {result.type === "compare" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 36, fontWeight: 800, color: "#4ade80" }}>{result.similarity}%</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#d4d8e1" }}>Similarity Score</div>
                          <div style={{ fontSize: 12, color: "#4a5568" }}>Based on unique word overlap</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ background: "#0d1117", borderRadius: 7, padding: "10px 12px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", marginBottom: 6 }}>ONLY IN DOCUMENT A ({result.onlyInA.length} words)</div>
                          <div style={{ fontSize: 12, color: "#d4d8e1", maxHeight: 80, overflowY: "auto" }}>{result.onlyInA.slice(0, 30).join(", ") || "—"}{result.onlyInA.length > 30 ? "…" : ""}</div>
                        </div>
                        <div style={{ background: "#0d1117", borderRadius: 7, padding: "10px 12px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", marginBottom: 6 }}>ONLY IN DOCUMENT B ({result.onlyInB.length} words)</div>
                          <div style={{ fontSize: 12, color: "#d4d8e1", maxHeight: 80, overflowY: "auto" }}>{result.onlyInB.slice(0, 30).join(", ") || "—"}{result.onlyInB.length > 30 ? "…" : ""}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
