import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Search, RefreshCw, Send, MessageSquare, CheckCircle2,
  XCircle, Loader2, Shield, ChevronDown, ChevronRight,
  Copy, Eye, Zap, Filter, AlertTriangle, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ──────────────────────────────────────────────────────────────────────
interface WaComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

interface WaTemplate {
  name: string;
  status: string;
  category: string;
  language: string;
  id?: string;
  components: WaComponent[];
}

interface SendResult {
  ok: boolean;
  provider?: string;
  endpoint?: string;
  httpStatus?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorCode?: string;
  errorMessage?: string;
  logged?: boolean;
}

const EVENT_TYPES = [
  { value: "template_send", label: "Generic Template Send" },
  { value: "new_booking", label: "New Booking" },
  { value: "booking_approved", label: "Booking Approved" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "payment_received", label: "Payment Received" },
  { value: "partial_payment", label: "Partial Payment" },
  { value: "payment_due", label: "Payment Due" },
  { value: "invoice_generated", label: "Invoice Generated" },
  { value: "receipt_generated", label: "Receipt Generated" },
  { value: "visa_approved", label: "Visa Approved" },
  { value: "visa_ready", label: "Visa Issued" },
  { value: "ticket_issued", label: "Flight Ticket Issued" },
  { value: "departure_reminder", label: "Departure Reminder" },
  { value: "hotel_assigned", label: "Hotel Confirmation" },
  { value: "otp_sent", label: "OTP" },
  { value: "custom_admin", label: "Custom / Admin" },
];

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
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractVars(text: string): number[] {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const nums = matches.map(m => parseInt(m[1], 10));
  return [...new Set(nums)].sort((a, b) => a - b);
}

function fillVars(text: string, vals: Record<number, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => vals[parseInt(n, 10)] || `{{${n}}}`);
}

function buildWaComponents(template: WaTemplate, headerVars: Record<number, string>, bodyVars: Record<number, string>): object[] {
  const comps: object[] = [];
  for (const comp of template.components) {
    if (comp.type === "HEADER" && comp.format === "TEXT" && comp.text) {
      const vars = extractVars(comp.text);
      if (vars.length > 0) {
        comps.push({ type: "header", parameters: vars.map(n => ({ type: "text", text: headerVars[n] || `var${n}` })) });
      }
    }
    if (comp.type === "BODY" && comp.text) {
      const vars = extractVars(comp.text);
      if (vars.length > 0) {
        comps.push({ type: "body", parameters: vars.map(n => ({ type: "text", text: bodyVars[n] || `var${n}` })) });
      }
    }
  }
  return comps;
}

// ── Component: TemplateBrowser ─────────────────────────────────────────────────
function TemplateBrowser({
  templates, loading, error, search, setSearch,
  categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
  selected, onSelect, onRefresh,
}: {
  templates: WaTemplate[]; loading: boolean; error: string | null;
  search: string; setSearch: (s: string) => void;
  categoryFilter: string; setCategoryFilter: (s: string) => void;
  statusFilter: string; setStatusFilter: (s: string) => void;
  selected: WaTemplate | null; onSelect: (t: WaTemplate) => void;
  onRefresh: () => void;
}) {
  const categories = useMemo(() => {
    const cats = new Set(templates.map(t => t.category));
    return ["ALL", ...Array.from(cats).sort()];
  }, [templates]);

  const filtered = useMemo(() => templates.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    const matchCat = categoryFilter === "ALL" || t.category === categoryFilter;
    const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchQ && matchCat && matchStatus;
  }), [templates, search, categoryFilter, statusFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Search + Filters */}
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="flex-1 text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
          >
            {categories.map(c => <option key={c} value={c}>{c === "ALL" ? "All Categories" : c}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
          >
            <option value="ALL">All Status</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{filtered.length} of {templates.length} templates</span>
          <button onClick={onRefresh} className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 font-medium">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Template List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            <p className="text-xs text-gray-500">Fetching from BotBee…</p>
          </div>
        )}
        {error && !loading && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700 text-xs font-semibold mb-1">
              <XCircle className="w-4 h-4" /> Failed to fetch templates
            </div>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <MessageSquare className="w-8 h-8" />
            <p className="text-sm">No templates found</p>
          </div>
        )}
        {!loading && filtered.map(t => {
          const catStyle = CATEGORY_COLORS[t.category] || { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" };
          const isSelected = selected?.name === t.name;
          const bodyComp = t.components.find(c => c.type === "BODY");
          const preview = bodyComp?.text?.slice(0, 80) ?? "";
          return (
            <button
              key={t.name}
              onClick={() => onSelect(t)}
              className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-green-50 transition-colors ${isSelected ? "bg-green-50 border-l-4 border-l-green-500" : "border-l-4 border-l-transparent"}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="font-semibold text-xs text-gray-900 truncate max-w-[120px]">{t.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>{t.status}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>{t.category}</span>
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

// ── Component: TemplateDetail ─────────────────────────────────────────────────
function TemplateDetail({ template, headerVars, bodyVars, setHeaderVar, setBodyVar }: {
  template: WaTemplate;
  headerVars: Record<number, string>;
  bodyVars: Record<number, string>;
  setHeaderVar: (n: number, v: string) => void;
  setBodyVar: (n: number, v: string) => void;
}) {
  const headerComp = template.components.find(c => c.type === "HEADER");
  const bodyComp   = template.components.find(c => c.type === "BODY");
  const footerComp = template.components.find(c => c.type === "FOOTER");
  const buttonsComp = template.components.find(c => c.type === "BUTTONS");

  const headerVarNums = headerComp?.text ? extractVars(headerComp.text) : [];
  const bodyVarNums   = bodyComp?.text   ? extractVars(bodyComp.text)   : [];
  const totalVars = headerVarNums.length + bodyVarNums.length;

  return (
    <div className="space-y-4">
      {/* Template meta */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`px-2 py-1 rounded border text-xs font-bold ${(CATEGORY_COLORS[template.category] || { bg:"bg-gray-50", text:"text-gray-700", border:"border-gray-200" }).bg} ${(CATEGORY_COLORS[template.category] || { bg:"bg-gray-50", text:"text-gray-700", border:"border-gray-200" }).text} ${(CATEGORY_COLORS[template.category] || { bg:"bg-gray-50", text:"text-gray-700", border:"border-gray-200" }).border}`}>
          {template.category}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded ${STATUS_COLORS[template.status] || "bg-gray-100 text-gray-600"}`}>{template.status}</span>
        <span className="text-xs text-gray-400 font-mono">lang: {template.language}</span>
        {template.id && <span className="text-xs text-gray-300 font-mono">id: {template.id}</span>}
      </div>

      {/* Components */}
      <div className="space-y-2">
        {headerComp && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Header</span>
              {headerComp.format && headerComp.format !== "TEXT" && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{headerComp.format}</span>
              )}
            </div>
            <div className="px-3 py-2 text-sm font-semibold text-gray-800">
              {headerComp.text ? (
                <span dangerouslySetInnerHTML={{ __html: headerComp.text.replace(/\{\{(\d+)\}\}/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-mono text-xs">{{$1}}</span>') }} />
              ) : (
                <span className="text-gray-400 italic text-xs">[{headerComp.format} — no text preview]</span>
              )}
            </div>
          </div>
        )}

        {bodyComp && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Body</span>
              {bodyVarNums.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">{bodyVarNums.length} variable{bodyVarNums.length > 1 ? "s" : ""}</span>
              )}
            </div>
            <div className="px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              <span dangerouslySetInnerHTML={{ __html: (bodyComp.text || "").replace(/\{\{(\d+)\}\}/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded font-mono text-xs">{{$1}}</span>').replace(/\n/g, "<br/>") }} />
            </div>
          </div>
        )}

        {footerComp?.text && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Footer</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-500 italic">{footerComp.text}</div>
          </div>
        )}

        {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Buttons</span>
            </div>
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
      {totalVars > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-200 bg-yellow-100">
            <Zap className="w-3.5 h-3.5 text-yellow-700" />
            <span className="text-xs font-bold text-yellow-800">Fill Template Variables</span>
            <span className="ml-auto text-[10px] text-yellow-600">{totalVars} placeholder{totalVars > 1 ? "s" : ""} to fill</span>
          </div>
          <div className="p-3 space-y-3">
            {headerVarNums.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Header variables</p>
                <div className="grid grid-cols-2 gap-2">
                  {headerVarNums.map(n => (
                    <div key={`h${n}`}>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Header &#123;&#123;{n}&#125;&#125;</label>
                      <input
                        type="text"
                        placeholder={`Variable ${n}`}
                        value={headerVars[n] || ""}
                        onChange={e => setHeaderVar(n, e.target.value)}
                        className="w-full border border-yellow-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bodyVarNums.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Body variables</p>
                <div className="grid grid-cols-2 gap-2">
                  {bodyVarNums.map(n => (
                    <div key={`b${n}`}>
                      <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Body &#123;&#123;{n}&#125;&#125;</label>
                      <input
                        type="text"
                        placeholder={`Variable ${n}`}
                        value={bodyVars[n] || ""}
                        onChange={e => setBodyVar(n, e.target.value)}
                        className="w-full border border-yellow-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component: PreviewPanel ───────────────────────────────────────────────────
function PreviewPanel({ template, headerVars, bodyVars }: {
  template: WaTemplate;
  headerVars: Record<number, string>;
  bodyVars: Record<number, string>;
}) {
  const headerComp = template.components.find(c => c.type === "HEADER");
  const bodyComp   = template.components.find(c => c.type === "BODY");
  const footerComp = template.components.find(c => c.type === "FOOTER");
  const buttonsComp = template.components.find(c => c.type === "BUTTONS");

  const headerText = headerComp?.text ? fillVars(headerComp.text, headerVars) : null;
  const bodyText   = bodyComp?.text   ? fillVars(bodyComp.text,   bodyVars)   : null;

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div className="w-full max-w-[280px] bg-gray-800 rounded-3xl p-3 shadow-2xl">
        {/* Phone top bar */}
        <div className="flex items-center gap-2 mb-2 px-2">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-xs font-semibold">Al Burhan Tours</p>
            <p className="text-gray-400 text-[9px]">Business Account</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-[#ECE5DD] rounded-2xl min-h-[200px] p-3 space-y-1">
          <div className="bg-white rounded-xl rounded-tl-none shadow-sm overflow-hidden max-w-[95%]">
            {/* Header image/text */}
            {headerComp && (
              <div className={`${headerComp.format !== "TEXT" ? "bg-gray-200 h-24 flex items-center justify-center" : "px-3 pt-3 pb-1"}`}>
                {headerComp.format !== "TEXT" && headerComp.format ? (
                  <span className="text-gray-500 text-xs">[{headerComp.format}]</span>
                ) : (
                  headerText && <p className="text-xs font-bold text-gray-900">{headerText}</p>
                )}
              </div>
            )}

            {/* Body */}
            {bodyText && (
              <div className="px-3 py-2">
                <p className="text-[11px] text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyText}</p>
              </div>
            )}

            {/* Footer */}
            {footerComp?.text && (
              <div className="px-3 pb-1">
                <p className="text-[9px] text-gray-400">{footerComp.text}</p>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex justify-end px-3 pb-1.5">
              <span className="text-[9px] text-gray-400">
                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ✓✓
              </span>
            </div>

            {/* Buttons */}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
              <div className="border-t border-gray-100">
                {buttonsComp.buttons.map((btn, i) => (
                  <button key={i} className="w-full py-2 text-[11px] font-semibold text-blue-500 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                    {btn.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">Live WhatsApp Preview</p>
    </div>
  );
}

// ── Component: SendResultPanel ────────────────────────────────────────────────
function SendResultPanel({ result, onClose }: { result: SendResult; onClose: () => void }) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <div className={`rounded-xl border-2 overflow-hidden ${result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      {/* Status row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-inherit">
        {result.ok
          ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          : <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
        <div className="flex-1">
          <p className={`font-bold text-sm ${result.ok ? "text-green-800" : "text-red-800"}`}>
            {result.ok ? "✅ Message Delivered" : "❌ Delivery Failed"}
          </p>
          {result.httpStatus && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${result.httpStatus < 300 ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
              HTTP {result.httpStatus}
            </span>
          )}
        </div>
        {result.logged && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">📋 Logged</span>}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>

      {/* Error message */}
      {!result.ok && result.errorMessage && (
        <div className="px-4 py-2 border-b border-inherit bg-white/60">
          <p className="text-xs text-red-700"><span className="font-semibold">Error: </span>{result.errorMessage}</p>
          {result.errorCode && <p className="text-[10px] text-red-500 mt-0.5">Code: {result.errorCode}</p>}
        </div>
      )}

      {/* Provider + Endpoint */}
      <div className="px-4 py-2 border-b border-inherit bg-white/40 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Provider</p>
          <p className="text-xs text-gray-800 font-medium">{result.provider || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">API Endpoint</p>
          <p className="text-[10px] text-gray-600 font-mono break-all">{result.endpoint || "—"}</p>
        </div>
      </div>

      {/* Raw response toggle */}
      <div className="px-4 py-2">
        <button
          onClick={() => setShowPayload(p => !p)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800"
        >
          {showPayload ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Raw API Response
        </button>
        {showPayload && (
          <pre className="mt-2 bg-gray-900 text-green-300 text-[10px] font-mono rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(result.responsePayload ?? result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WhatsAppTemplateManager() {
  const { isAdminLevel, loaded: permLoaded } = usePermissions();
  const { toast } = useToast();

  // Template list state
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("APPROVED");

  // Selected template + variable state
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [headerVars, setHeaderVars] = useState<Record<number, string>>({});
  const [bodyVars, setBodyVars] = useState<Record<number, string>>({});

  // Send form state
  const [mobile, setMobile] = useState("");
  const [eventType, setEventType] = useState("template_send");
  const [bookingId, setBookingId] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [mode, setMode] = useState<"send" | "test">("send");

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplateError(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/templates`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.errorMessage || `HTTP ${res.status}`);
      setTemplates(data.templates || []);
    } catch (err: any) {
      setTemplateError(err.message);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (permLoaded && isAdminLevel) fetchTemplates();
  }, [permLoaded, isAdminLevel, fetchTemplates]);

  function handleSelectTemplate(t: WaTemplate) {
    setSelected(t);
    setHeaderVars({});
    setBodyVars({});
    setResult(null);
  }

  async function handleSend() {
    if (!selected) return;
    if (!mobile.trim()) {
      toast({ title: "Mobile required", description: "Enter a recipient mobile number.", variant: "destructive" });
      return;
    }

    const components = buildWaComponents(selected, headerVars, bodyVars);

    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/templates/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mobile: mobile.trim(),
          templateName: selected.name,
          language: selected.language,
          components,
          eventType,
          bookingId: bookingId || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        toast({ title: "Template sent!", description: `Delivered to ${mobile}` });
      } else {
        toast({ title: "Delivery failed", description: data.errorMessage || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      setResult({ ok: false, errorMessage: err.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // Permission guards
  if (!permLoaded) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }
  if (!isAdminLevel) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Shield className="w-12 h-12 text-gray-300" />
          <p className="text-lg font-semibold text-gray-500">Access Restricted</p>
          <p className="text-sm text-gray-400">Admin or Super Admin role required.</p>
        </div>
      </AdminLayout>
    );
  }

  const approvedCount = templates.filter(t => t.status === "APPROVED").length;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                WhatsApp Template Manager
                <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">BotBee</span>
              </h1>
              <p className="text-sm text-gray-500">
                {loadingTemplates ? "Loading templates…" : `${templates.length} templates · ${approvedCount} approved`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/communication-center" className="text-xs text-blue-600 hover:underline font-medium">← Communication Center</a>
            <a href="/admin/notification-logs" className="text-xs text-gray-500 hover:underline font-medium">Delivery Logs →</a>
          </div>
        </div>

        {/* ── Main 3-column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-4 h-[calc(100vh-220px)] min-h-[600px]">

          {/* Left: Template Browser */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50">
              <Filter className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Templates</span>
            </div>
            <TemplateBrowser
              templates={templates}
              loading={loadingTemplates}
              error={templateError}
              search={search}
              setSearch={setSearch}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              selected={selected}
              onSelect={handleSelectTemplate}
              onRefresh={fetchTemplates}
            />
          </div>

          {/* Middle: Template Detail + Variables */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 p-8">
                <MessageSquare className="w-12 h-12 text-gray-200" />
                <p className="font-semibold text-gray-400">Select a template</p>
                <p className="text-sm text-center text-gray-300">Pick any WhatsApp template from the list on the left to view details, fill variables, and send.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                  <Eye className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Template Detail</span>
                  <span className="ml-auto font-mono text-xs text-gray-500 truncate max-w-[180px]">{selected.name}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selected.name); toast({ title: "Copied template name" }); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <TemplateDetail
                    template={selected}
                    headerVars={headerVars}
                    bodyVars={bodyVars}
                    setHeaderVar={(n, v) => setHeaderVars(p => ({ ...p, [n]: v }))}
                    setBodyVar={(n, v) => setBodyVars(p => ({ ...p, [n]: v }))}
                  />

                  {/* Delivery result */}
                  {result && (
                    <div className="mt-4">
                      <SendResultPanel result={result} onClose={() => setResult(null)} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Preview + Send Controls */}
          <div className="flex flex-col gap-4">
            {/* Live Preview */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50">
                <Eye className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Preview</span>
              </div>
              <div className="p-4 flex items-start justify-center">
                {selected ? (
                  <PreviewPanel template={selected} headerVars={headerVars} bodyVars={bodyVars} />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
                    <MessageSquare className="w-8 h-8" />
                    <p className="text-xs">Preview appears here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Send Panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-green-50">
                <Send className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Send Template</span>
              </div>
              <div className="p-3 space-y-3">
                {/* Recipient */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    Recipient Mobile <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {/* Event type for logging */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Event Type (for logs)</label>
                  <select
                    value={eventType}
                    onChange={e => setEventType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
                  >
                    {EVENT_TYPES.map(et => (
                      <option key={et.value} value={et.value}>{et.label}</option>
                    ))}
                  </select>
                </div>

                {/* Optional booking ID */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    Booking ID <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BK-2025-001"
                    value={bookingId}
                    onChange={e => setBookingId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>

                {/* Template summary */}
                {selected && (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Template</p>
                    <p className="text-xs font-bold text-gray-800 font-mono">{selected.name}</p>
                    <p className="text-[10px] text-gray-400">{selected.category} · {selected.language}</p>
                    {selected.status !== "APPROVED" && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                        <span className="text-[10px] text-yellow-700 font-medium">Status: {selected.status} — may not deliver</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={sending || !selected || !mobile.trim()}
                  className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {sending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send via WhatsApp</>}
                </button>

                <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
                  <Info className="w-3 h-3" /> Every send is logged to Delivery Logs
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
