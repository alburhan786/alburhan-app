import { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MessageSquare, BarChart2, ScanLine, Copy, RefreshCw, Upload, CheckCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

type Tab = "whatsapp" | "report" | "ocr";

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "urdu", label: "Urdu" },
  { value: "arabic", label: "Arabic" },
  { value: "hindi", label: "Hindi" },
];
const TONES = ["professional and warm", "formal", "friendly", "urgent", "reassuring"];
const RECIPIENT_TYPES = ["pilgrims", "family members", "group leaders", "hotel staff", "customers"];
const REPORT_TYPES = [
  { value: "group", label: "Group Summary", icon: "👥" },
  { value: "financial", label: "Financial Overview", icon: "💰" },
  { value: "medical", label: "Medical Report", icon: "🏥" },
  { value: "visa", label: "Visa Status", icon: "📋" },
];

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function AIAssistant() {
  const [tab, setTab] = useState<Tab>("whatsapp");
  const { toast } = useToast();

  // WhatsApp Writer state
  const [waContext, setWaContext] = useState("");
  const [waTone, setWaTone] = useState("professional and warm");
  const [waRecipient, setWaRecipient] = useState("pilgrims");
  const [waLanguage, setWaLanguage] = useState("english");
  const [waExtra, setWaExtra] = useState("");
  const [waResult, setWaResult] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waCopied, setWaCopied] = useState(false);

  // Report Summary state
  const [reportType, setReportType] = useState("group");
  const [reportGroupId, setReportGroupId] = useState("");
  const [reportResult, setReportResult] = useState("");
  const [reportData, setReportData] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  // OCR state
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrMime, setOcrMime] = useState("image/jpeg");
  const [ocrDocType, setOcrDocType] = useState("passport");
  const [ocrResult, setOcrResult] = useState<Record<string, string | null> | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function generateWhatsApp() {
    if (!waContext.trim()) { toast({ title: "Please describe the message purpose", variant: "destructive" }); return; }
    setWaLoading(true);
    setWaResult("");
    try {
      const r = await fetch(`${API}/api/ai/whatsapp-writer`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: waContext, tone: waTone, recipientType: waRecipient, language: waLanguage, extraInstructions: waExtra }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "AI service failed"); }
      const data = await r.json();
      setWaResult(data.message || "");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setWaLoading(false);
  }

  async function generateReport() {
    setReportLoading(true);
    setReportResult("");
    setReportData("");
    try {
      const r = await fetch(`${API}/api/ai/report-summary`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, groupId: reportType === "group" ? reportGroupId : undefined }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "AI service failed"); }
      const data = await r.json();
      setReportResult(data.summary || "");
      setReportData(data.data || "");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setReportLoading(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1];
      setOcrImage(base64);
      setOcrPreview(result);
      setOcrResult(null);
    };
    reader.readAsDataURL(file);
  }

  async function runOCR() {
    if (!ocrImage) { toast({ title: "Please upload an image first", variant: "destructive" }); return; }
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const r = await fetch(`${API}/api/ai/ocr-passport`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: ocrImage, mediaType: ocrMime, documentType: ocrDocType }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "AI OCR failed"); }
      const data = await r.json();
      setOcrResult(data.data || {});
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setOcrLoading(false);
  }

  const TABS = [
    { id: "whatsapp" as Tab, label: "WhatsApp Writer", icon: MessageSquare, desc: "AI-generated messages" },
    { id: "report" as Tab, label: "Report Summary", icon: BarChart2, desc: "AI analytics digest" },
    { id: "ocr" as Tab, label: "OCR Scanner", icon: ScanLine, desc: "Extract passport/visa data" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2">
            <Sparkles size={22} className="text-amber-500" /> AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground">Phase 15 — AI-powered tools: WhatsApp Writer, Report Summary & OCR Scanner</p>
          <p className="text-xs text-muted-foreground mt-0.5">Powered by Claude (via Replit AI Integration)</p>
        </div>

        {/* Tab selector */}
        <div className="grid grid-cols-3 gap-3">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${tab === t.id ? "bg-[#0d5040] text-white border-[#0d5040] shadow-md" : "bg-white hover:bg-muted/30"}`}>
              <t.icon size={20} className={tab === t.id ? "text-white" : "text-[#0d5040]"} />
              <div>
                <p className="font-semibold text-sm">{t.label}</p>
                <p className={`text-[11px] ${tab === t.id ? "text-white/70" : "text-muted-foreground"}`}>{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* WhatsApp Writer */}
        {tab === "whatsapp" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={18} className="text-emerald-600" />
              <h2 className="font-bold text-base">WhatsApp Message Writer</h2>
            </div>
            <div>
              <label className="text-xs font-medium">What is this message about? *</label>
              <textarea
                value={waContext}
                onChange={e => setWaContext(e.target.value)}
                placeholder="e.g., Inform pilgrims that visa processing is delayed by 3 days. Makkah hotel check-in is now June 15. Please advise patience and provide emergency contact."
                className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0d5040]/30"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium">Recipient</label>
                <select value={waRecipient} onChange={e => setWaRecipient(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border text-sm bg-background">
                  {RECIPIENT_TYPES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Tone</label>
                <select value={waTone} onChange={e => setWaTone(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border text-sm bg-background">
                  {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Language</label>
                <select value={waLanguage} onChange={e => setWaLanguage(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border text-sm bg-background">
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Extra instructions (optional)</label>
              <Input value={waExtra} onChange={e => setWaExtra(e.target.value)} placeholder="e.g., Include contact number +91 9893989786" className="mt-1" />
            </div>
            <Button className="w-full bg-[#0d5040] hover:bg-[#0a3d30]" onClick={generateWhatsApp} disabled={waLoading}>
              {waLoading ? <><RefreshCw size={14} className="mr-2 animate-spin" />Generating…</> : <><Sparkles size={14} className="mr-2" />Generate Message</>}
            </Button>
            {waResult && (
              <div className="mt-2 rounded-xl border bg-emerald-50 p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-emerald-600 text-white text-[10px]">✓ Generated</Badge>
                  <button onClick={() => { copyToClipboard(waResult); setWaCopied(true); setTimeout(() => setWaCopied(false), 2000); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#0d5040]">
                    {waCopied ? <CheckCircle size={13} className="text-emerald-600" /> : <Copy size={13} />}{waCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{waResult}</pre>
              </div>
            )}
          </div>
        )}

        {/* Report Summary */}
        {tab === "report" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={18} className="text-blue-600" />
              <h2 className="font-bold text-base">AI Report Summary</h2>
            </div>
            <div>
              <label className="text-xs font-medium">Report Type</label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {REPORT_TYPES.map(rt => (
                  <button key={rt.value} onClick={() => setReportType(rt.value)} className={`flex flex-col items-center p-3 rounded-xl border text-xs font-medium transition-all ${reportType === rt.value ? "bg-[#0d5040] text-white border-[#0d5040]" : "bg-muted/30 hover:bg-muted/50"}`}>
                    <span className="text-lg mb-1">{rt.icon}</span>
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
            {reportType === "group" && (
              <div>
                <label className="text-xs font-medium">Group ID (optional)</label>
                <Input value={reportGroupId} onChange={e => setReportGroupId(e.target.value)} placeholder="Paste group UUID for specific group summary" className="mt-1 font-mono text-xs" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank for overall summary</p>
              </div>
            )}
            <Button className="w-full bg-[#0d5040] hover:bg-[#0a3d30]" onClick={generateReport} disabled={reportLoading}>
              {reportLoading ? <><RefreshCw size={14} className="mr-2 animate-spin" />Analysing…</> : <><Sparkles size={14} className="mr-2" />Generate Summary</>}
            </Button>
            {reportResult && (
              <div className="space-y-3">
                {reportData && (
                  <div className="bg-muted/30 rounded-xl p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">{reportData}</div>
                )}
                <div className="rounded-xl border bg-blue-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-blue-600 text-white text-[10px]">✓ AI Summary</Badge>
                    <button onClick={() => { copyToClipboard(reportResult); setReportCopied(true); setTimeout(() => setReportCopied(false), 2000); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#0d5040]">
                      {reportCopied ? <CheckCircle size={13} className="text-emerald-600" /> : <Copy size={13} />}{reportCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{reportResult}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* OCR Scanner */}
        {tab === "ocr" && (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <ScanLine size={18} className="text-purple-600" />
              <h2 className="font-bold text-base">Passport / Visa OCR Scanner</h2>
            </div>
            <p className="text-xs text-muted-foreground">Upload a photo or scan of a passport/visa page. AI will extract all text fields automatically.</p>

            <div>
              <label className="text-xs font-medium">Document Type</label>
              <div className="flex gap-2 mt-1">
                {["passport", "visa"].map(d => (
                  <button key={d} onClick={() => setOcrDocType(d)} className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${ocrDocType === d ? "bg-[#0d5040] text-white border-[#0d5040]" : "bg-muted/30"}`}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[#0d5040]/30 rounded-xl p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors"
            >
              {ocrPreview ? (
                <img src={ocrPreview} alt="Passport" className="max-h-56 mx-auto rounded-lg object-contain" />
              ) : (
                <div className="space-y-2">
                  <Upload size={32} className="mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Click to upload passport / visa image</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WEBP — clear scan recommended</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
            {ocrPreview && (
              <button onClick={() => fileRef.current?.click()} className="text-xs text-[#0d5040] underline">Change image</button>
            )}

            <Button className="w-full bg-[#0d5040] hover:bg-[#0a3d30]" onClick={runOCR} disabled={ocrLoading || !ocrImage}>
              {ocrLoading ? <><RefreshCw size={14} className="mr-2 animate-spin" />Scanning…</> : <><ScanLine size={14} className="mr-2" />Extract Data</>}
            </Button>

            {ocrResult && (
              <div className="rounded-xl border bg-purple-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-purple-600 text-white text-[10px]">✓ Data Extracted</Badge>
                  <button onClick={() => copyToClipboard(JSON.stringify(ocrResult, null, 2))} className="text-xs text-muted-foreground hover:text-[#0d5040] flex items-center gap-1"><Copy size={12} />Copy JSON</button>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {Object.entries(ocrResult).map(([key, val]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className="text-sm font-medium">{val || <span className="text-muted-foreground italic">—</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
