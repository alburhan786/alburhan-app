import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { files as filesApi, pdf as pdfApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Layers, Scissors, Minimize2, RotateCcw, Droplets, PenTool,
  QrCode, Type, Tag, Lock, GitCompare, FileSearch, ArrowUpDown,
  Hash, FileText, ChevronRight, X, Check, Download, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";

type Tool = {
  id: string; icon: any; label: string; desc: string; color: string; minRole?: string;
};

const TOOLS: Tool[] = [
  { id: "merge", icon: Layers, label: "Merge PDFs", desc: "Combine multiple PDFs into one document", color: "#3b82f6" },
  { id: "split", icon: Scissors, label: "Split PDF", desc: "Split a PDF into multiple parts by page range", color: "#10b981" },
  { id: "compress", icon: Minimize2, label: "Compress PDF", desc: "Reduce file size by optimizing object streams", color: "#8b5cf6" },
  { id: "rotate", icon: RotateCcw, label: "Rotate Pages", desc: "Rotate specific pages or the entire document", color: "#f59e0b" },
  { id: "reorder", icon: ArrowUpDown, label: "Reorder Pages", desc: "Drag pages into a new order", color: "#ec4899" },
  { id: "watermark", icon: Droplets, label: "Add Watermark", desc: "Add text watermark to all or selected pages", color: "#06b6d4" },
  { id: "signature", icon: PenTool, label: "Digital Signature", desc: "Draw and embed a signature on a PDF page", color: "#10b981" },
  { id: "qrcode", icon: QrCode, label: "Add QR Code", desc: "Generate and embed a QR code into a page", color: "#6366f1" },
  { id: "annotate", icon: Type, label: "Add Annotation", desc: "Add a text annotation at any position on a page", color: "#f59e0b" },
  { id: "metadata", icon: Tag, label: "Edit Metadata", desc: "View and update PDF title, author, subject, keywords", color: "#3b82f6" },
  { id: "unlock", icon: Lock, label: "Unlock PDF", desc: "Open a password-protected PDF with the correct password", color: "#ef4444" },
  { id: "compare", icon: GitCompare, label: "Compare PDFs", desc: "Compare text content between two PDFs", color: "#8b5cf6" },
  { id: "extract", icon: FileSearch, label: "Extract Text", desc: "Extract all readable text from a PDF", color: "#10b981" },
  { id: "pagenumbers", icon: Hash, label: "Page Numbers", desc: "Add page numbers to a PDF document", color: "#f59e0b" },
  { id: "headerfooter", icon: FileText, label: "Header & Footer", desc: "Add header and/or footer text to every page", color: "#06b6d4" },
];

function FileSelect({ label, value, onChange, fileList }: { label: string; value: string; onChange: (v: string) => void; fileList: any[] }) {
  return (
    <div>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select a file —</option>
        {fileList.map((f) => (
          <option key={f.id} value={f.id}>{f.name} ({f.page_count}p)</option>
        ))}
      </select>
    </div>
  );
}

export default function ToolsPage() {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const sigRef = useRef<any>(null);

  // Tool states
  const [selFileId, setSelFileId] = useState("");
  const [selFileIdB, setSelFileIdB] = useState("");
  const [mergeFileIds, setMergeFileIds] = useState<string[]>(["", ""]);
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
  const [unlockPw, setUnlockPw] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [compareResult, setCompareResult] = useState<any>(null);
  const [pnStart, setPnStart] = useState(1);
  const [hfHeader, setHfHeader] = useState("");
  const [hfFooter, setHfFooter] = useState("");

  useEffect(() => {
    filesApi.list({ limit: "200" }).then((r) => setFileList(r.files || [])).catch(() => {});
  }, []);

  async function handleLoadMeta() {
    if (!selFileId) return;
    try {
      const m = await pdfApi.getMetadata(selFileId);
      setMeta(m);
    } catch (err: any) { toast.error(err.message); }
  }

  async function run() {
    setLoading(true);
    setResult(null);
    setExtractedText("");
    setCompareResult(null);
    try {
      let r: any;
      switch (activeTool) {
        case "merge": {
          if (mergeFileIds.filter(Boolean).length < 2) throw new Error("Select at least 2 files");
          const fd = new FormData();
          fd.append("outputName", "merged.pdf");
          mergeFileIds.filter(Boolean).forEach((id) => fd.append("fileIds", id));
          r = await pdfApi.merge(fd);
          toast.success("PDFs merged successfully!");
          break;
        }
        case "split": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.split(selFileId, splitRanges);
          toast.success(`Split into ${r.length} parts`);
          break;
        }
        case "compress": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.compress(selFileId);
          toast.success(`Compressed! Saved ~${r.reduction}%`);
          break;
        }
        case "rotate": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.rotate(selFileId, rotations);
          toast.success("Pages rotated");
          break;
        }
        case "reorder": {
          if (!selFileId) throw new Error("Select a file");
          const order = reorderStr.split(",").map((n) => parseInt(n.trim())).filter((n) => !isNaN(n));
          if (order.length === 0) throw new Error("Enter page order like: 3,1,2");
          r = await pdfApi.reorder(selFileId, order);
          toast.success("Pages reordered");
          break;
        }
        case "watermark": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.watermark(selFileId, { text: wmText, opacity: wmOpacity, angle: wmAngle, fontSize: wmFontSize });
          toast.success("Watermark added");
          break;
        }
        case "signature": {
          if (!selFileId) throw new Error("Select a file");
          if (sigRef.current?.isEmpty()) throw new Error("Draw a signature first");
          const dataUrl = sigRef.current.toDataURL("image/png");
          r = await pdfApi.addSignature(selFileId, { signatureDataUrl: dataUrl, page: sigPage, x: sigX, y: sigY, timestamp: true });
          toast.success("Signature embedded");
          break;
        }
        case "qrcode": {
          if (!selFileId) throw new Error("Select a file");
          if (!qrContent) throw new Error("Enter QR code content");
          r = await pdfApi.addQRCode(selFileId, { content: qrContent, page: qrPage, x: qrX, y: qrY, size: qrSize });
          toast.success("QR code embedded");
          break;
        }
        case "annotate": {
          if (!selFileId) throw new Error("Select a file");
          if (!annText) throw new Error("Enter annotation text");
          r = await pdfApi.annotate(selFileId, { text: annText, page: annPage, x: annX, y: annY, fontSize: annSize });
          toast.success("Annotation added");
          break;
        }
        case "metadata": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.updateMetadata(selFileId, meta);
          toast.success("Metadata updated");
          break;
        }
        case "unlock": {
          if (!selFileId) throw new Error("Select a file");
          if (!unlockPw) throw new Error("Enter the PDF password");
          r = await pdfApi.unlock(selFileId, unlockPw);
          toast.success("PDF unlocked and saved");
          break;
        }
        case "extract": {
          if (!selFileId) throw new Error("Select a file");
          const res = await pdfApi.extractText(selFileId);
          setExtractedText(res.text);
          toast.success(`Extracted ${res.wordCount} words`);
          return;
        }
        case "compare": {
          if (!selFileId || !selFileIdB) throw new Error("Select both files");
          const res = await pdfApi.compare(selFileId, selFileIdB);
          setCompareResult(res);
          return;
        }
        case "pagenumbers": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.addPageNumbers(selFileId, { startFrom: pnStart, position: "bottom-center" });
          toast.success("Page numbers added");
          break;
        }
        case "headerfooter": {
          if (!selFileId) throw new Error("Select a file");
          r = await pdfApi.addHeaderFooter(selFileId, { header: hfHeader || undefined, footer: hfFooter || undefined });
          toast.success("Header/footer added");
          break;
        }
      }
      setResult(r);
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally { setLoading(false); }
  }

  const tool = TOOLS.find((t) => t.id === activeTool);

  return (
    <Layout>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Tool list */}
        <div style={{ width: 260, borderRight: "1px solid #1e2433", overflowY: "auto", padding: "12px 8px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 8px", marginBottom: 8 }}>
            PDF Tools
          </div>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTool(t.id); setResult(null); setExtractedText(""); setCompareResult(null); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                borderRadius: 8, background: activeTool === t.id ? "#1a2a4a" : "transparent",
                border: `1px solid ${activeTool === t.id ? "#3b82f6" : "transparent"}`,
                marginBottom: 2, cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ width: 28, height: 28, background: `${t.color}20`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <t.icon size={13} color={t.color} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#d4d8e1" }}>{t.label}</div>
                <div style={{ fontSize: 10, color: "#4a5568", lineHeight: "1.3" }}>{t.desc.slice(0, 40)}…</div>
              </div>
            </button>
          ))}
        </div>

        {/* Tool workspace */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {!activeTool ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 36 }}>🛠️</div>
              <p style={{ color: "#4a5568", fontSize: 15 }}>Select a tool from the left panel</p>
            </div>
          ) : (
            <div style={{ maxWidth: 620 }}>
              <div className="flex items-center gap-3 mb-6">
                <div style={{ width: 40, height: 40, background: `${tool?.color}20`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {tool && <tool.icon size={18} color={tool.color} />}
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>{tool?.label}</h2>
                  <p style={{ fontSize: 12, color: "#4a5568", margin: 0 }}>{tool?.desc}</p>
                </div>
              </div>

              {/* Tool-specific UI */}
              <div className="card" style={{ marginBottom: "1rem" }}>
                {/* MERGE */}
                {activeTool === "merge" && (
                  <div className="flex flex-col gap-4">
                    <p style={{ fontSize: 13, color: "#8b9ab5", margin: 0 }}>Select 2 or more files to merge in order:</p>
                    {mergeFileIds.map((id, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div style={{ flex: 1 }}>
                          <label>File {i + 1}</label>
                          <select value={id} onChange={(e) => { const n = [...mergeFileIds]; n[i] = e.target.value; setMergeFileIds(n); }}>
                            <option value="">— Select —</option>
                            {fileList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                        {mergeFileIds.length > 2 && (
                          <button className="btn-danger" style={{ marginTop: 20, padding: "6px 8px" }} onClick={() => setMergeFileIds(mergeFileIds.filter((_, j) => j !== i))}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button className="btn-secondary" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 12 }} onClick={() => setMergeFileIds([...mergeFileIds, ""])}>
                      + Add File
                    </button>
                  </div>
                )}

                {/* SPLIT */}
                {activeTool === "split" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Source File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div>
                      <label>Page Ranges</label>
                      {splitRanges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 mb-2">
                          <input type="number" min="1" value={r.start} onChange={(e) => { const n = [...splitRanges]; n[i].start = +e.target.value; setSplitRanges(n); }} placeholder="From" style={{ width: 70 }} />
                          <span style={{ color: "#4a5568" }}>to</span>
                          <input type="number" min="1" value={r.end} onChange={(e) => { const n = [...splitRanges]; n[i].end = +e.target.value; setSplitRanges(n); }} placeholder="To" style={{ width: 70 }} />
                          <input type="text" value={r.name} onChange={(e) => { const n = [...splitRanges]; n[i].name = e.target.value; setSplitRanges(n); }} placeholder="Output name (optional)" style={{ flex: 1 }} />
                          {splitRanges.length > 1 && <button className="btn-danger" style={{ padding: "5px 8px" }} onClick={() => setSplitRanges(splitRanges.filter((_, j) => j !== i))}><X size={11} /></button>}
                        </div>
                      ))}
                      <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setSplitRanges([...splitRanges, { start: 1, end: 1, name: "" }])}>+ Add Range</button>
                    </div>
                  </div>
                )}

                {/* COMPRESS */}
                {activeTool === "compress" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="File to Compress" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <p style={{ fontSize: 12, color: "#4a5568", margin: 0 }}>ℹ️ Compression optimizes object streams and removes redundant data.</p>
                  </div>
                )}

                {/* ROTATE */}
                {activeTool === "rotate" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="File to Rotate" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    {rotations.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div style={{ flex: 1 }}><label>Page</label><input type="number" min="1" value={r.page} onChange={(e) => { const n = [...rotations]; n[i].page = +e.target.value; setRotations(n); }} /></div>
                        <div style={{ flex: 1 }}><label>Angle</label>
                          <select value={r.angle} onChange={(e) => { const n = [...rotations]; n[i].angle = +e.target.value as any; setRotations(n); }}>
                            <option value={90}>90° CW</option><option value={180}>180°</option><option value={270}>270° CW</option><option value={0}>0° (reset)</option>
                          </select>
                        </div>
                        {rotations.length > 1 && <button className="btn-danger" style={{ marginTop: 20, padding: "5px 8px" }} onClick={() => setRotations(rotations.filter((_, j) => j !== i))}><X size={11} /></button>}
                      </div>
                    ))}
                    <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px", alignSelf: "flex-start" }} onClick={() => setRotations([...rotations, { page: 1, angle: 90 }])}>+ Add Page</button>
                  </div>
                )}

                {/* REORDER */}
                {activeTool === "reorder" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="File to Reorder" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div>
                      <label>New Page Order (comma-separated page numbers)</label>
                      <input type="text" value={reorderStr} onChange={(e) => setReorderStr(e.target.value)} placeholder="e.g. 3, 1, 2, 4, 5" />
                      <p style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>Enter all page numbers in the desired order.</p>
                    </div>
                  </div>
                )}

                {/* WATERMARK */}
                {activeTool === "watermark" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="File to Watermark" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>Watermark Text</label><input type="text" value={wmText} onChange={(e) => setWmText(e.target.value)} placeholder="CONFIDENTIAL" /></div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div><label>Opacity (0-1)</label><input type="number" min="0" max="1" step="0.05" value={wmOpacity} onChange={(e) => setWmOpacity(+e.target.value)} /></div>
                      <div><label>Angle (°)</label><input type="number" value={wmAngle} onChange={(e) => setWmAngle(+e.target.value)} /></div>
                      <div><label>Font Size</label><input type="number" min="12" max="200" value={wmFontSize} onChange={(e) => setWmFontSize(+e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* SIGNATURE */}
                {activeTool === "signature" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="File to Sign" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div>
                      <label>Draw your signature below</label>
                      <SignatureCanvas
                        ref={sigRef}
                        penColor="#1e3a5f"
                        canvasProps={{ width: 500, height: 120, className: "signature-canvas", style: { width: "100%", maxWidth: 500 } }}
                      />
                      <button className="btn-secondary" style={{ marginTop: 6, padding: "5px 10px", fontSize: 12 }} onClick={() => sigRef.current?.clear()}>Clear</button>
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div><label>Page</label><input type="number" min="1" value={sigPage} onChange={(e) => setSigPage(+e.target.value)} /></div>
                      <div><label>X Position</label><input type="number" value={sigX} onChange={(e) => setSigX(+e.target.value)} /></div>
                      <div><label>Y Position</label><input type="number" value={sigY} onChange={(e) => setSigY(+e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* QR CODE */}
                {activeTool === "qrcode" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Target File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>QR Code Content (URL, text, etc.)</label><input type="text" value={qrContent} onChange={(e) => setQrContent(e.target.value)} /></div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                      <div><label>Page</label><input type="number" min="1" value={qrPage} onChange={(e) => setQrPage(+e.target.value)} /></div>
                      <div><label>X</label><input type="number" value={qrX} onChange={(e) => setQrX(+e.target.value)} /></div>
                      <div><label>Y</label><input type="number" value={qrY} onChange={(e) => setQrY(+e.target.value)} /></div>
                      <div><label>Size (px)</label><input type="number" min="50" value={qrSize} onChange={(e) => setQrSize(+e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* ANNOTATE */}
                {activeTool === "annotate" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Target File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>Annotation Text</label><textarea value={annText} onChange={(e) => setAnnText(e.target.value)} rows={3} placeholder="Enter text to annotate…" /></div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                      <div><label>Page</label><input type="number" min="1" value={annPage} onChange={(e) => setAnnPage(+e.target.value)} /></div>
                      <div><label>X</label><input type="number" value={annX} onChange={(e) => setAnnX(+e.target.value)} /></div>
                      <div><label>Y</label><input type="number" value={annY} onChange={(e) => setAnnY(+e.target.value)} /></div>
                      <div><label>Font Size</label><input type="number" min="8" max="72" value={annSize} onChange={(e) => setAnnSize(+e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* METADATA */}
                {activeTool === "metadata" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Target File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <button className="btn-secondary" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 12 }} onClick={handleLoadMeta}>Load Current Metadata</button>
                    {["title", "author", "subject", "keywords", "producer", "creator"].map((k) => (
                      <div key={k}><label style={{ textTransform: "capitalize" }}>{k}</label>
                        <input type="text" value={meta[k] || ""} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} placeholder={`PDF ${k}`} />
                      </div>
                    ))}
                  </div>
                )}

                {/* UNLOCK */}
                {activeTool === "unlock" && (
                  <div className="flex flex-col gap-4">
                    <div style={{ background: "#451a03", border: "1px solid #78350f", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fbbf24" }}>
                      <strong>⚠ Security Note:</strong> This tool opens password-protected PDFs using the <em>correct password you provide</em>. PDF cracking/bypassing without a password is not supported.
                    </div>
                    <FileSelect label="Password-Protected File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>PDF Password</label><input type="password" value={unlockPw} onChange={(e) => setUnlockPw(e.target.value)} placeholder="Enter the correct PDF password" /></div>
                  </div>
                )}

                {/* COMPARE */}
                {activeTool === "compare" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Document A" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <FileSelect label="Document B" value={selFileIdB} onChange={setSelFileIdB} fileList={fileList} />
                  </div>
                )}

                {/* EXTRACT TEXT */}
                {activeTool === "extract" && (
                  <FileSelect label="Source File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                )}

                {/* PAGE NUMBERS */}
                {activeTool === "pagenumbers" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Target File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>Start Number</label><input type="number" min="1" value={pnStart} onChange={(e) => setPnStart(+e.target.value)} /></div>
                  </div>
                )}

                {/* HEADER FOOTER */}
                {activeTool === "headerfooter" && (
                  <div className="flex flex-col gap-4">
                    <FileSelect label="Target File" value={selFileId} onChange={setSelFileId} fileList={fileList} />
                    <div><label>Header Text (blank = none)</label><input type="text" value={hfHeader} onChange={(e) => setHfHeader(e.target.value)} placeholder="Al Burhan Tours & Travels" /></div>
                    <div><label>Footer Text (blank = none)</label><input type="text" value={hfFooter} onChange={(e) => setHfFooter(e.target.value)} placeholder="Confidential" /></div>
                  </div>
                )}
              </div>

              <button
                className="btn-primary flex items-center gap-2"
                style={{ padding: "10px 24px", width: "100%" }}
                onClick={run}
                disabled={loading}
              >
                {loading ? (
                  <><div style={{ width: 16, height: 16, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Processing…</>
                ) : (
                  <><Check size={16} /> Apply {tool?.label}</>
                )}
              </button>

              {/* Results */}
              {result && (
                <div className="card" style={{ marginTop: "1rem", borderColor: "#14532d" }}>
                  <div className="flex items-center gap-2 mb-3" style={{ color: "#4ade80" }}>
                    <Check size={16} /> <span style={{ fontWeight: 700 }}>Operation Complete</span>
                  </div>
                  {result.reduction !== undefined && (
                    <p style={{ color: "#8b9ab5", fontSize: 13 }}>Size reduced by {result.reduction}%</p>
                  )}
                  {Array.isArray(result) ? (
                    <div>
                      <p style={{ color: "#8b9ab5", fontSize: 13 }}>{result.length} files created. Go to Workspace to view them.</p>
                    </div>
                  ) : (
                    <p style={{ color: "#8b9ab5", fontSize: 13 }}>File updated: <strong style={{ color: "#d4d8e1" }}>{result.name}</strong> (v{result.current_version})</p>
                  )}
                </div>
              )}

              {extractedText && (
                <div className="card" style={{ marginTop: "1rem" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontWeight: 700, color: "#d4d8e1" }}>Extracted Text</span>
                  </div>
                  <textarea
                    readOnly
                    value={extractedText}
                    rows={12}
                    style={{ width: "100%", fontSize: 12, fontFamily: "monospace", background: "#0d1117", resize: "vertical" }}
                  />
                </div>
              )}

              {compareResult && (
                <div className="card" style={{ marginTop: "1rem" }}>
                  <div className="flex items-center justify-between mb-4">
                    <span style={{ fontWeight: 700, color: "#d4d8e1" }}>Comparison Results</span>
                    <span className="badge badge-blue">{compareResult.similarity}% similar</span>
                  </div>
                  <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <label style={{ color: "#f87171" }}>Removed Lines ({compareResult.removed?.length})</label>
                      <div style={{ background: "#450a0a", borderRadius: 6, padding: "8px 10px", fontSize: 12, maxHeight: 200, overflowY: "auto" }}>
                        {compareResult.removed?.slice(0, 30).map((l: string, i: number) => <div key={i} style={{ color: "#fca5a5" }}>- {l}</div>)}
                        {compareResult.removed?.length > 30 && <div style={{ color: "#4a5568" }}>…{compareResult.removed.length - 30} more</div>}
                      </div>
                    </div>
                    <div>
                      <label style={{ color: "#4ade80" }}>Added Lines ({compareResult.added?.length})</label>
                      <div style={{ background: "#14532d", borderRadius: 6, padding: "8px 10px", fontSize: 12, maxHeight: 200, overflowY: "auto" }}>
                        {compareResult.added?.slice(0, 30).map((l: string, i: number) => <div key={i} style={{ color: "#86efac" }}>+ {l}</div>)}
                        {compareResult.added?.length > 30 && <div style={{ color: "#4a5568" }}>…{compareResult.added.length - 30} more</div>}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#4a5568", marginTop: 10 }}>{compareResult.unchanged} lines unchanged</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
