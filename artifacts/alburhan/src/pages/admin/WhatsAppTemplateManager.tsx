import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Search, RefreshCw, Send, MessageSquare, CheckCircle2, XCircle, Loader2,
  Shield, ChevronDown, ChevronRight, Copy, Eye, Zap, Filter, AlertTriangle,
  Info, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, BarChart2, List,
  RotateCcw, Globe, BookOpen, Star, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WaComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string; text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}
interface WaTemplate {
  name: string; status: string; category: string; language: string; id?: string; components: WaComponent[];
}
interface DbTemplate {
  id: string; name: string; display_name: string; category: string; language: string;
  status: string; header_type: string; header_text?: string; body_text: string;
  footer_text?: string; buttons: any[]; variables: string[]; event_type?: string;
  meta_template_name?: string; enabled: boolean; is_builtin: boolean;
  created_at: string; updated_at: string;
}
interface DeliveryLog {
  id: string; event_type: string; recipient: string; message: string; status: string;
  sent_at: string; retry_count: number; error_code?: string; provider_name?: string;
  http_status?: number; request_payload?: any; provider_response?: any;
}
interface SendResult {
  ok: boolean; provider?: string; endpoint?: string; httpStatus?: number;
  requestPayload?: unknown; responsePayload?: unknown; errorCode?: string;
  errorMessage?: string; logged?: boolean;
}
interface Analytics {
  totals: { sent: string; failed: string; pending: string; total: string };
  byEvent: { event_type: string; sent: string; failed: string; total: string }[];
  byDay: { day: string; sent: string; failed: string; total: string }[];
  recentFailed: DeliveryLog[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MARKETING:      { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  UTILITY:        { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  AUTHENTICATION: { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200" },
  SERVICE:        { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200" },
};
const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  PENDING:  "bg-yellow-100 text-yellow-800",
  REJECTED: "bg-red-100 text-red-800",
  PAUSED:   "bg-gray-100 text-gray-600",
  local:    "bg-gray-100 text-gray-600",
};
const EVENT_LABELS: Record<string, string> = {
  new_booking: "Booking Submitted", booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled", payment_received: "Payment Received",
  partial_payment: "Partial Payment", payment_due: "Payment Reminder",
  invoice_generated: "Invoice Generated", receipt_generated: "Receipt Generated",
  visa_ready: "Visa Issued", visa_approved: "Visa Approved",
  ticket_issued: "Ticket Issued", departure_reminder: "Departure Reminder",
  hotel_assigned: "Hotel Confirmation", otp_sent: "OTP",
  custom_admin: "Manual / Broadcast", template_send: "Template Send",
};
const ALL_EVENTS = Object.entries(EVENT_LABELS).map(([v, l]) => ({ value: v, label: l }));
const NAMED_VARS = [
  "customer_name","booking_id","package_name","amount","invoice_number",
  "visa_number","ticket_number","flight_number","departure_date","departure_time",
  "hotel_name","room_number",
];
const LANGUAGES = [
  { code: "en", label: "English" }, { code: "ar", label: "Arabic (عربي)" },
  { code: "ur", label: "Urdu (اردو)" }, { code: "hi", label: "Hindi (हिंदी)" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractNumericVars(text: string) {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
}
function fillNumericVars(text: string, vals: Record<number, string>) {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => vals[parseInt(n, 10)] || `{{${n}}}`);
}
function fillNamedVars(text: string, vals: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] || `{{${k}}}`);
}
function buildWaComponents(template: WaTemplate, hv: Record<number, string>, bv: Record<number, string>) {
  const comps: object[] = [];
  for (const comp of template.components) {
    if (comp.type === "HEADER" && comp.format === "TEXT" && comp.text) {
      const vars = extractNumericVars(comp.text);
      if (vars.length > 0) comps.push({ type: "header", parameters: vars.map(n => ({ type: "text", text: hv[n] || `var${n}` })) });
    }
    if (comp.type === "BODY" && comp.text) {
      const vars = extractNumericVars(comp.text);
      if (vars.length > 0) comps.push({ type: "body", parameters: vars.map(n => ({ type: "text", text: bv[n] || `var${n}` })) });
    }
  }
  return comps;
}
function catStyle(cat: string) {
  return CATEGORY_COLORS[cat] || { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" };
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Sub-components: Live Templates Tab ───────────────────────────────────────
function TemplateBrowser({ templates, loading, error, search, setSearch, categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, selected, onSelect, onRefresh }: {
  templates: WaTemplate[]; loading: boolean; error: string | null;
  search: string; setSearch: (s: string) => void;
  categoryFilter: string; setCategoryFilter: (s: string) => void;
  statusFilter: string; setStatusFilter: (s: string) => void;
  selected: WaTemplate | null; onSelect: (t: WaTemplate) => void; onRefresh: () => void;
}) {
  const categories = useMemo(() => ["ALL", ...Array.from(new Set(templates.map(t => t.category))).sort()], [templates]);
  const filtered = useMemo(() => templates.filter(t => {
    const q = search.toLowerCase();
    return (!q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      && (categoryFilter === "ALL" || t.category === categoryFilter)
      && (statusFilter === "ALL" || t.status === statusFilter);
  }), [templates, search, categoryFilter, statusFilter]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input type="text" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300" />
        </div>
        <div className="flex gap-2">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
            {categories.map(c => <option key={c} value={c}>{c === "ALL" ? "All Categories" : c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
            <option value="ALL">All Status</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{filtered.length} of {templates.length}</span>
          <button onClick={onRefresh} className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 font-medium">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex flex-col items-center justify-center h-40 gap-2"><Loader2 className="w-6 h-6 animate-spin text-green-500" /><p className="text-xs text-gray-500">Fetching from BotBee…</p></div>}
        {error && !loading && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 text-xs font-semibold mb-1"><XCircle className="w-4 h-4" /> Failed to fetch</div>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <MessageSquare className="w-8 h-8" /><p className="text-sm">No templates found</p>
          </div>
        )}
        {!loading && filtered.map(t => {
          const cs = catStyle(t.category);
          const isSelected = selected?.name === t.name;
          const preview = t.components.find(c => c.type === "BODY")?.text?.slice(0, 80) ?? "";
          return (
            <button key={t.name} onClick={() => onSelect(t)}
              className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-green-50 transition-colors ${isSelected ? "bg-green-50 border-l-4 border-l-green-500" : "border-l-4 border-l-transparent"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="font-semibold text-xs text-gray-900 truncate max-w-[120px]">{t.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>{t.status}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cs.bg} ${cs.text} ${cs.border}`}>{t.category}</span>
                    <span className="text-[10px] text-gray-400">{t.language}</span>
                  </div>
                  {preview && <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{preview}</p>}
                </div>
                {isSelected && <ChevronRight className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhonePreview({ header, body, footer, buttons, headerFormat }: { header?: string | null; body?: string | null; footer?: string | null; buttons?: any[]; headerFormat?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[260px] bg-gray-800 rounded-3xl p-3 shadow-2xl">
        <div className="flex items-center gap-2 mb-2 px-2">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-xs font-semibold">Al Burhan Tours</p>
            <p className="text-gray-400 text-[9px]">Business Account</p>
          </div>
        </div>
        <div className="bg-[#ECE5DD] rounded-2xl min-h-[180px] p-3">
          <div className="bg-white rounded-xl rounded-tl-none shadow-sm overflow-hidden">
            {header && (
              <div className={headerFormat && headerFormat !== "TEXT" ? "bg-gray-200 h-20 flex items-center justify-center" : "px-3 pt-3 pb-1"}>
                {headerFormat && headerFormat !== "TEXT"
                  ? <span className="text-gray-500 text-xs">[{headerFormat}]</span>
                  : <p className="text-xs font-bold text-gray-900">{header}</p>}
              </div>
            )}
            {body && (
              <div className="px-3 py-2">
                <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed">{body}</p>
              </div>
            )}
            {footer && <div className="px-3 pb-1"><p className="text-[9px] text-gray-400">{footer}</p></div>}
            <div className="flex justify-end px-3 pb-1.5">
              <span className="text-[9px] text-gray-400">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ✓✓</span>
            </div>
            {buttons && buttons.length > 0 && (
              <div className="border-t border-gray-100">
                {buttons.map((btn: any, i: number) => (
                  <div key={i} className="w-full py-1.5 text-[11px] font-semibold text-blue-500 text-center border-b border-gray-100 last:border-b-0">{btn.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">Live Preview</p>
    </div>
  );
}

function SendResultBadge({ result, onClose }: { result: SendResult; onClose: () => void }) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <div className={`rounded-xl border-2 overflow-hidden ${result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-inherit">
        {result.ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
        <div className="flex-1">
          <p className={`font-bold text-sm ${result.ok ? "text-green-800" : "text-red-800"}`}>{result.ok ? "✅ Delivered" : "❌ Failed"}</p>
          {result.httpStatus && <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${result.httpStatus < 300 ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>HTTP {result.httpStatus}</span>}
        </div>
        {result.logged && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">📋 Logged</span>}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      {!result.ok && result.errorMessage && (
        <div className="px-4 py-2 border-b border-inherit bg-white/60">
          <p className="text-xs text-red-700"><span className="font-semibold">Error: </span>{result.errorMessage}</p>
        </div>
      )}
      <div className="px-4 py-2">
        <button onClick={() => setShowPayload(p => !p)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
          {showPayload ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Raw Response
        </button>
        {showPayload && (
          <pre className="mt-2 bg-gray-900 text-green-300 text-[10px] font-mono rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {JSON.stringify(result.responsePayload ?? result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Tab 1: Live Templates (BotBee) ────────────────────────────────────────────
function LiveTemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("APPROVED");
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [headerVars, setHeaderVars] = useState<Record<number, string>>({});
  const [bodyVars, setBodyVars] = useState<Record<number, string>>({});
  const [mobile, setMobile] = useState("");
  const [eventType, setEventType] = useState("template_send");
  const [bookingId, setBookingId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchLive = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/templates`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.errorMessage || `HTTP ${res.status}`);
      setTemplates(data.templates || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/whatsapp/sync`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.ok) toast({ title: `Synced ${data.synced} templates`, description: `${data.liveCount} live in Meta` });
      else toast({ title: "Sync failed", description: data.message, variant: "destructive" });
    } catch (e: any) { toast({ title: "Sync error", description: e.message, variant: "destructive" }); }
    finally { setSyncing(false); }
  }

  function selectTemplate(t: WaTemplate) { setSelected(t); setHeaderVars({}); setBodyVars({}); setResult(null); }

  async function handleSend() {
    if (!selected || !mobile.trim()) return;
    const components = buildWaComponents(selected, headerVars, bodyVars);
    setSending(true); setResult(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/templates/send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim(), templateName: selected.name, language: selected.language, components, eventType, bookingId: bookingId || undefined }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) toast({ title: "Template sent!", description: `Delivered to ${mobile}` });
      else toast({ title: "Failed", description: data.errorMessage, variant: "destructive" });
    } catch (e: any) { setResult({ ok: false, errorMessage: e.message }); }
    finally { setSending(false); }
  }

  const headerComp = selected?.components.find(c => c.type === "HEADER");
  const bodyComp = selected?.components.find(c => c.type === "BODY");
  const footerComp = selected?.components.find(c => c.type === "FOOTER");
  const buttonsComp = selected?.components.find(c => c.type === "BUTTONS");
  const headerVarNums = headerComp?.text ? extractNumericVars(headerComp.text) : [];
  const bodyVarNums = bodyComp?.text ? extractNumericVars(bodyComp.text) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-4 h-[calc(100vh-280px)] min-h-[580px]">
      {/* Left: browser */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2"><Filter className="w-3.5 h-3.5 text-gray-500" /><span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Live Templates</span></div>
          <button onClick={handleSync} disabled={syncing} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} /> Sync
          </button>
        </div>
        <TemplateBrowser templates={templates} loading={loading} error={error} search={search} setSearch={setSearch}
          categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          selected={selected} onSelect={selectTemplate} onRefresh={fetchLive} />
      </div>

      {/* Middle: detail + variables */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-8">
            <MessageSquare className="w-12 h-12 text-gray-200" />
            <p className="font-semibold text-gray-400">Select a template</p>
            <p className="text-sm text-center text-gray-300">Pick a WhatsApp template from the left to view, fill variables, and send.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
              <Eye className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Template Detail</span>
              <span className="ml-auto font-mono text-xs text-gray-500 truncate max-w-[180px]">{selected.name}</span>
              <button onClick={() => { navigator.clipboard.writeText(selected.name); toast({ title: "Copied!" }); }}
                className="text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Meta */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`px-2 py-1 rounded border text-xs font-bold ${catStyle(selected.category).bg} ${catStyle(selected.category).text} ${catStyle(selected.category).border}`}>{selected.category}</div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${STATUS_COLORS[selected.status] || "bg-gray-100 text-gray-600"}`}>{selected.status}</span>
                <span className="text-xs text-gray-400">lang: {selected.language}</span>
              </div>

              {/* Components */}
              <div className="space-y-2">
                {headerComp && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Header</span>
                      {headerComp.format && headerComp.format !== "TEXT" && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{headerComp.format}</span>}
                    </div>
                    <div className="px-3 py-2 text-sm font-semibold text-gray-800">
                      {headerComp.text
                        ? <span dangerouslySetInnerHTML={{ __html: headerComp.text.replace(/\{\{(\d+)\}\}/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-mono text-xs">{{$1}}</span>') }} />
                        : <span className="text-gray-400 italic text-xs">[{headerComp.format}]</span>}
                    </div>
                  </div>
                )}
                {bodyComp?.text && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Body</span>
                      {bodyVarNums.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">{bodyVarNums.length} var{bodyVarNums.length > 1 ? "s" : ""}</span>}
                    </div>
                    <div className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      <span dangerouslySetInnerHTML={{ __html: bodyComp.text.replace(/\{\{(\d+)\}\}/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-mono text-xs">{{$1}}</span>').replace(/\n/g, "<br/>") }} />
                    </div>
                  </div>
                )}
                {footerComp?.text && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200"><span className="text-[10px] font-bold text-gray-500 uppercase">Footer</span></div>
                    <div className="px-3 py-2 text-xs text-gray-500 italic">{footerComp.text}</div>
                  </div>
                )}
                {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200"><span className="text-[10px] font-bold text-gray-500 uppercase">Buttons</span></div>
                    <div className="flex flex-wrap gap-2 p-3">
                      {buttonsComp.buttons.map((btn, i) => (
                        <span key={i} className="px-3 py-1 text-xs font-semibold rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                          {btn.type === "URL" ? "🔗 " : btn.type === "PHONE_NUMBER" ? "📞 " : "↩️ "}{btn.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Variable inputs */}
              {(headerVarNums.length + bodyVarNums.length) > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-200 bg-yellow-100">
                    <Zap className="w-3.5 h-3.5 text-yellow-700" />
                    <span className="text-xs font-bold text-yellow-800">Fill Variables</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {headerVarNums.map(n => (
                      <div key={`h${n}`}>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Header &#123;&#123;{n}&#125;&#125;</label>
                        <input type="text" value={headerVars[n] || ""} onChange={e => setHeaderVars(p => ({ ...p, [n]: e.target.value }))}
                          className="w-full border border-yellow-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white" />
                      </div>
                    ))}
                    {bodyVarNums.map(n => (
                      <div key={`b${n}`}>
                        <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Body &#123;&#123;{n}&#125;&#125;</label>
                        <input type="text" value={bodyVars[n] || ""} onChange={e => setBodyVars(p => ({ ...p, [n]: e.target.value }))}
                          className="w-full border border-yellow-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result && <div className="mt-2"><SendResultBadge result={result} onClose={() => setResult(null)} /></div>}
            </div>
          </>
        )}
      </div>

      {/* Right: preview + send */}
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50">
            <Eye className="w-3.5 h-3.5 text-gray-500" /><span className="text-xs font-bold text-gray-700 uppercase">Preview</span>
          </div>
          <div className="p-4 flex items-start justify-center">
            {selected ? (
              <PhonePreview
                header={headerComp?.text ? fillNumericVars(headerComp.text, headerVars) : null}
                body={bodyComp?.text ? fillNumericVars(bodyComp.text, bodyVars) : null}
                footer={footerComp?.text}
                buttons={buttonsComp?.buttons}
                headerFormat={headerComp?.format}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
                <MessageSquare className="w-8 h-8" /><p className="text-xs">Preview here</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-green-50">
            <Send className="w-3.5 h-3.5 text-green-600" /><span className="text-xs font-bold text-green-700 uppercase">Send Template</span>
          </div>
          <div className="p-3 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Recipient Mobile <span className="text-red-500">*</span></label>
              <input type="tel" placeholder="10-digit number" value={mobile} onChange={e => setMobile(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Event Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
                {ALL_EVENTS.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Booking ID <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" placeholder="BK-2025-001" value={bookingId} onChange={e => setBookingId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
            </div>
            {selected && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Template</p>
                <p className="text-xs font-bold text-gray-800 font-mono">{selected.name}</p>
                <p className="text-[10px] text-gray-400">{selected.category} · {selected.language}</p>
                {selected.status !== "APPROVED" && (
                  <div className="flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3 text-yellow-500" /><span className="text-[10px] text-yellow-700">Status: {selected.status}</span></div>
                )}
              </div>
            )}
            <button onClick={handleSend} disabled={sending || !selected || !mobile.trim()}
              className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send via WhatsApp</>}
            </button>
            <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
              <Info className="w-3 h-3" /> Every send is logged
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template Form Modal ───────────────────────────────────────────────────────
const EMPTY_FORM = { name: "", display_name: "", category: "UTILITY", language: "en", header_type: "none", header_text: "", body_text: "", footer_text: "", variables: [] as string[], event_type: "", meta_template_name: "" };
type TemplateForm = typeof EMPTY_FORM;

function TemplateFormModal({ initial, onSave, onClose }: { initial?: DbTemplate | null; onSave: (f: TemplateForm) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<TemplateForm>(() => initial ? {
    name: initial.name, display_name: initial.display_name, category: initial.category,
    language: initial.language, header_type: initial.header_type, header_text: initial.header_text || "",
    body_text: initial.body_text, footer_text: initial.footer_text || "",
    variables: Array.isArray(initial.variables) ? initial.variables : [],
    event_type: initial.event_type || "", meta_template_name: initial.meta_template_name || "",
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  function autoName(dn: string) { return dn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  function toggleVar(v: string) {
    setForm(f => ({ ...f, variables: f.variables.includes(v) ? f.variables.filter(x => x !== v) : [...f.variables, v] }));
  }
  function insertVar(v: string) {
    setForm(f => ({ ...f, body_text: f.body_text + `{{${v}}}` }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
          <h2 className="text-base font-bold text-gray-900">{isEdit ? "Edit Template" : "New Template"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Display Name <span className="text-red-500">*</span></label>
              <input required value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value, name: isEdit ? f.name : autoName(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" placeholder="Booking Approved" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Template Name (snake_case)</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                disabled={isEdit && !!initial?.is_builtin}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-300 disabled:bg-gray-50 disabled:text-gray-500" placeholder="booking_approved" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Language</label>
              <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Header Type</label>
              <select value={form.header_type} onChange={e => setForm(f => ({ ...f, header_type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="none">None</option>
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Auto-send Event</label>
              <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
                <option value="">— None (manual only) —</option>
                {ALL_EVENTS.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
              </select>
            </div>
          </div>

          {form.header_type === "text" && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Header Text</label>
              <input value={form.header_text} onChange={e => setForm(f => ({ ...f, header_text: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" placeholder="Al Burhan Tours & Travels" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">Body Text <span className="text-red-500">*</span></label>
              <span className="text-[10px] text-gray-400">Use &#123;&#123;variable_name&#125;&#125; for dynamic content</span>
            </div>
            <textarea required value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))} rows={6}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 font-mono resize-y"
              placeholder="Assalamu Alaikum {{customer_name}},..." />
            {/* Variable quick-insert */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {NAMED_VARS.map(v => (
                <button type="button" key={v} onClick={() => insertVar(v)}
                  className="text-[10px] px-1.5 py-0.5 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded hover:bg-yellow-100 font-mono">
                  +&#123;&#123;{v}&#125;&#125;
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Footer Text</label>
            <input value={form.footer_text} onChange={e => setForm(f => ({ ...f, footer_text: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" placeholder="Al Burhan Tours & Travels" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Meta Template Name (if approved in Meta)</label>
            <input value={form.meta_template_name} onChange={e => setForm(f => ({ ...f, meta_template_name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-300" placeholder="booking_approved_en" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Variables used in this template</label>
            <div className="flex flex-wrap gap-1.5">
              {NAMED_VARS.map(v => (
                <button type="button" key={v} onClick={() => toggleVar(v)}
                  className={`text-xs px-2 py-1 rounded-full border font-mono transition-colors ${form.variables.includes(v) ? "bg-green-100 border-green-300 text-green-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isEdit ? "Save Changes" : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab 2: My Templates ───────────────────────────────────────────────────────
function MyTemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DbTemplate | null>(null);
  const [preview, setPreview] = useState<DbTemplate | null>(null);
  const [sendModal, setSendModal] = useState<DbTemplate | null>(null);
  const [sendMobile, setSendMobile] = useState("");
  const [sendVars, setSendVars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/whatsapp/db-templates`, { credentials: "include" });
      const data = await res.json();
      if (data.ok) setTemplates(data.templates);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => templates.filter(t => {
    const q = search.toLowerCase();
    return (!q || t.display_name.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      && (catFilter === "ALL" || t.category === catFilter);
  }), [templates, search, catFilter]);

  async function saveTemplate(form: TemplateForm) {
    const url = editing ? `${API}/api/whatsapp/db-templates/${editing.id}` : `${API}/api/whatsapp/db-templates`;
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (data.ok) {
      toast({ title: editing ? "Template updated" : "Template created" });
      setShowModal(false); setEditing(null); load();
    } else {
      toast({ title: "Error", description: data.message, variant: "destructive" });
      throw new Error(data.message);
    }
  }

  async function toggleEnabled(t: DbTemplate) {
    const res = await fetch(`${API}/api/whatsapp/db-templates/${t.id}/toggle`, { method: "POST", credentials: "include" });
    const data = await res.json();
    if (data.ok) setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, enabled: data.enabled } : x));
  }

  async function deleteTemplate(t: DbTemplate) {
    if (!confirm(`Delete "${t.display_name}"? This cannot be undone.`)) return;
    setDeleting(t.id);
    const res = await fetch(`${API}/api/whatsapp/db-templates/${t.id}`, { method: "DELETE", credentials: "include" });
    const data = await res.json();
    if (data.ok) { toast({ title: "Deleted" }); setTemplates(prev => prev.filter(x => x.id !== t.id)); }
    else toast({ title: "Cannot delete", description: data.message, variant: "destructive" });
    setDeleting(null);
  }

  async function handleSendText() {
    if (!sendModal || !sendMobile.trim()) return;
    setSending(true); setSendResult(null);
    const res = await fetch(`${API}/api/whatsapp/db-templates/send-text`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: sendMobile.trim(), template_id: sendModal.id, variables: sendVars }),
    });
    const data = await res.json();
    setSendResult(data);
    if (data.ok) toast({ title: "Sent!", description: `Delivered to ${sendMobile}` });
    else toast({ title: "Failed", description: data.errorMessage, variant: "destructive" });
    setSending(false);
  }

  const previewBody = preview ? fillNamedVars(preview.body_text, {}) : "";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
          <option value="ALL">All Categories</option>
          <option value="UTILITY">Utility</option>
          <option value="MARKETING">Marketing</option>
          <option value="AUTHENTICATION">Authentication</option>
        </select>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(t => {
            const cs = catStyle(t.category);
            return (
              <div key={t.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${t.enabled ? "border-gray-200" : "border-gray-100 opacity-70"}`}>
                {/* Card header */}
                <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {t.is_builtin && <Star className="w-3 h-3 text-yellow-500 shrink-0" />}
                      <span className="font-bold text-sm text-gray-900 truncate">{t.display_name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-gray-400">{t.name}</span>
                  </div>
                  <button onClick={() => toggleEnabled(t)} className="ml-2 shrink-0 mt-0.5">
                    {t.enabled
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>

                {/* Body preview */}
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed whitespace-pre-line">{t.body_text}</p>
                </div>

                {/* Tags */}
                <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cs.bg} ${cs.text} ${cs.border}`}>{t.category}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>{t.status}</span>
                  <span className="text-[10px] text-gray-400">{LANGUAGES.find(l => l.code === t.language)?.label || t.language}</span>
                  {t.event_type && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">⚡ {EVENT_LABELS[t.event_type] || t.event_type}</span>}
                  {t.variables?.length > 0 && <span className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-100">{t.variables.length} var{t.variables.length > 1 ? "s" : ""}</span>}
                </div>

                {/* Actions */}
                <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-1">
                  <button onClick={() => setPreview(t)} className="flex-1 py-1.5 text-xs font-semibold text-gray-600 hover:text-green-700 hover:bg-green-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                  <button onClick={() => { setSendModal(t); setSendMobile(""); setSendVars({}); setSendResult(null); }}
                    className="flex-1 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
                    <Send className="w-3.5 h-3.5" /> Send
                  </button>
                  <button onClick={() => { setEditing(t); setShowModal(true); }}
                    className="flex-1 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!t.is_builtin && (
                    <button onClick={() => deleteTemplate(t)} disabled={deleting === t.id}
                      className="flex-1 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-50">
                      {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-gray-400">
              <BookOpen className="w-12 h-12 text-gray-200" />
              <p className="font-semibold">No templates found</p>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <TemplateFormModal initial={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSave={saveTemplate} />
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{preview.display_name}</h3>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <PhonePreview
              header={preview.header_type === "text" ? preview.header_text : null}
              body={previewBody}
              footer={preview.footer_text}
              buttons={preview.buttons}
              headerFormat={preview.header_type !== "text" && preview.header_type !== "none" ? preview.header_type.toUpperCase() : undefined}
            />
          </div>
        </div>
      )}

      {/* Send modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSendModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Send — {sendModal.display_name}</h3>
              <button onClick={() => setSendModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Mobile <span className="text-red-500">*</span></label>
                <input type="tel" placeholder="10-digit number" value={sendMobile} onChange={e => setSendMobile(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              {sendModal.variables?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Fill Variables</label>
                  <div className="space-y-2">
                    {sendModal.variables.map((v: string) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-yellow-700 w-28 shrink-0">&#123;&#123;{v}&#125;&#125;</span>
                        <input type="text" placeholder={v.replace(/_/g, " ")} value={sendVars[v] || ""} onChange={e => setSendVars(p => ({ ...p, [v]: e.target.value }))}
                          className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sendResult && <SendResultBadge result={sendResult} onClose={() => setSendResult(null)} />}
              <button onClick={handleSendText} disabled={sending || !sendMobile.trim()}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Analytics ──────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/analytics`, { credentials: "include" });
      const d = await res.json();
      if (d.ok) setData(d); else throw new Error(d.message);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>;
  if (error) return <div className="flex flex-col items-center gap-3 py-20 text-red-500"><XCircle className="w-8 h-8" /><p>{error}</p><button onClick={load} className="text-sm text-green-600 hover:underline">Retry</button></div>;
  if (!data) return null;

  const sent = parseInt(data.totals.sent || "0");
  const failed = parseInt(data.totals.failed || "0");
  const total = parseInt(data.totals.total || "0");
  const deliveryRate = total > 0 ? Math.round((sent / total) * 100) : 0;
  const maxDay = Math.max(...data.byDay.map(d => parseInt(d.total || "0")), 1);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sent", value: total, color: "text-gray-900", bg: "bg-white" },
          { label: "Delivered", value: sent, color: "text-green-700", bg: "bg-green-50" },
          { label: "Failed", value: failed, color: "text-red-700", bg: "bg-red-50" },
          { label: "Delivery Rate", value: `${deliveryRate}%`, color: deliveryRate >= 90 ? "text-green-700" : deliveryRate >= 70 ? "text-yellow-700" : "text-red-700", bg: "bg-white" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 shadow-sm px-5 py-4`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily chart (last 14 days) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-bold text-gray-900">Daily Messages (14 days)</h3>
            <button onClick={load} className="ml-auto"><RefreshCw className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" /></button>
          </div>
          {data.byDay.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-300"><BarChart2 className="w-8 h-8" /><p className="text-sm">No data yet</p></div>
          ) : (
            <div className="space-y-2">
              {data.byDay.map(d => {
                const dayTotal = parseInt(d.total || "0");
                const daySent = parseInt(d.sent || "0");
                const dayFailed = parseInt(d.failed || "0");
                const pct = Math.round((dayTotal / maxDay) * 100);
                const sentPct = dayTotal > 0 ? Math.round((daySent / dayTotal) * 100) : 0;
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-500 w-16 shrink-0">{new Date(d.day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden relative">
                      <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${sentPct}%` }} />
                      {dayFailed > 0 && <div className="absolute right-0 top-0 h-full bg-red-300 rounded-full" style={{ width: `${Math.round((dayFailed / dayTotal) * 100)}%` }} />}
                    </div>
                    <span className="text-[11px] text-gray-600 w-8 text-right">{dayTotal}</span>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-3 h-3 bg-green-400 rounded-full inline-block" />Delivered</span>
                <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-3 h-3 bg-red-300 rounded-full inline-block" />Failed</span>
              </div>
            </div>
          )}
        </div>

        {/* By event type */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-bold text-gray-900">By Event Type</h3>
          </div>
          {data.byEvent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-300"><Zap className="w-8 h-8" /><p className="text-sm">No data yet</p></div>
          ) : (
            <div className="space-y-2">
              {data.byEvent.map(e => {
                const evTotal = parseInt(e.total || "0");
                const evSent = parseInt(e.sent || "0");
                const maxEv = Math.max(...data.byEvent.map(x => parseInt(x.total || "0")), 1);
                const pct = Math.round((evTotal / maxEv) * 100);
                const rate = evTotal > 0 ? Math.round((evSent / evTotal) * 100) : 0;
                return (
                  <div key={e.event_type} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-700 w-36 shrink-0 truncate">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-500 w-12 text-right">{evTotal} ({rate}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent failures */}
      {data.recentFailed.length > 0 && (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-red-100 bg-red-50">
            <XCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-red-800">Recent Failures</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {data.recentFailed.slice(0, 5).map(log => (
              <div key={log.id} className="px-5 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{log.recipient}</p>
                  <p className="text-xs text-gray-500 truncate">{log.message?.slice(0, 60)}</p>
                  {log.error_code && <span className="text-[10px] text-red-500 font-mono">{log.error_code}</span>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-gray-400">{fmtDate(log.sent_at)}</p>
                  <p className="text-[10px] text-gray-400">{EVENT_LABELS[log.event_type] || log.event_type}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Delivery Logs ─────────────────────────────────────────────────────
function DeliveryLogsTab() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("");
  const [event, setEvent] = useState("");
  const [search, setSearch] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    if (status) params.set("status", status);
    if (event) params.set("event", event);
    if (search) params.set("search", search);
    try {
      const res = await fetch(`${API}/api/whatsapp/delivery-logs?${params}`, { credentials: "include" });
      const data = await res.json();
      if (data.ok) { setLogs(data.logs); setTotal(data.total); setPage(data.page); setTotalPages(data.totalPages); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [status, event, search]);

  useEffect(() => { load(1); }, [load]);

  async function retry(logId: string) {
    setRetrying(logId);
    try {
      const res = await fetch(`${API}/api/whatsapp/retry/${logId}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.ok) { toast({ title: "Retried successfully" }); load(page); }
      else toast({ title: "Retry failed", description: data.errorMessage, variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRetrying(null); }
  }

  const statusBg: Record<string, string> = { sent: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-800", pending: "bg-yellow-100 text-yellow-800" };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipient or message…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
          <option value="">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <select value={event} onChange={e => setEvent(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
          <option value="">All Events</option>
          {ALL_EVENTS.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
        </select>
        <button onClick={() => load(1)} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <span className="text-xs text-gray-500 ml-auto">{total} total</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent At</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-green-500 mx-auto" /></td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No delivery logs found</td></tr>
              )}
              {!loading && logs.map(log => (
                <>
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{log.recipient}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{EVENT_LABELS[log.event_type] || log.event_type}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{log.message}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusBg[log.status] || "bg-gray-100 text-gray-600"}`}>{log.status}</span>
                      {log.retry_count > 0 && <span className="ml-1 text-[10px] text-gray-400">({log.retry_count}x)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(log.sent_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.status === "failed" && (
                          <button onClick={() => retry(log.id)} disabled={retrying === log.id}
                            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg disabled:opacity-50 transition-colors">
                            {retrying === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Retry
                          </button>
                        )}
                        <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded">
                          {expanded === log.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-exp`}>
                      <td colSpan={6} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-gray-600 mb-1">Provider Response</p>
                            <pre className="bg-gray-900 text-green-300 text-[10px] p-2 rounded-lg overflow-auto max-h-32 whitespace-pre-wrap">
                              {JSON.stringify(log.provider_response, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-600 mb-1">Request Payload</p>
                            <pre className="bg-gray-900 text-green-300 text-[10px] p-2 rounded-lg overflow-auto max-h-32 whitespace-pre-wrap">
                              {JSON.stringify(log.request_payload, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {log.error_code && <p className="text-[11px] text-red-600 mt-2">Error: {log.error_code}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => { setPage(p => p - 1); load(page - 1); }} disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-40 hover:bg-gray-100">← Prev</button>
              <button onClick={() => { setPage(p => p + 1); load(page + 1); }} disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-40 hover:bg-gray-100">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "live" | "my" | "analytics" | "logs";

export default function WhatsAppTemplateManager() {
  const { isAdminLevel, loaded: permLoaded } = usePermissions();
  const [tab, setTab] = useState<Tab>("live");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "live",      label: "Live Templates",   icon: <Globe className="w-4 h-4" /> },
    { id: "my",        label: "My Templates",      icon: <BookOpen className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics",         icon: <BarChart2 className="w-4 h-4" /> },
    { id: "logs",      label: "Delivery Logs",     icon: <List className="w-4 h-4" /> },
  ];

  if (!permLoaded) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
    </AdminLayout>
  );
  if (!isAdminLevel) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Shield className="w-12 h-12 text-gray-300" />
        <p className="text-lg font-semibold text-gray-500">Access Restricted</p>
        <p className="text-sm text-gray-400">Admin or Super Admin role required.</p>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                WhatsApp Template Manager
                <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">BotBee · Meta</span>
              </h1>
              <p className="text-sm text-gray-500">Manage, preview, and send WhatsApp message templates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/communication-center" className="text-xs text-blue-600 hover:underline font-medium">← Communication Center</a>
            <span className="text-gray-300">|</span>
            <a href="/admin/notification-logs" className="text-xs text-gray-500 hover:underline font-medium">All Logs →</a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "live"      && <LiveTemplatesTab />}
        {tab === "my"        && <MyTemplatesTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "logs"      && <DeliveryLogsTab />}
      </div>
    </AdminLayout>
  );
}
