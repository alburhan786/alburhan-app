import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Send, ToggleLeft, ToggleRight,
  Search, MessageSquare, CheckCircle2, XCircle, Loader2,
  FlaskConical, Variable, Clock, AlertTriangle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ALL_EVENTS = [
  "new_booking","booking_approved","booking_rejected","booking_cancelled","booking_completed",
  "payment_received","partial_payment","pending_payment","balance_reminder",
  "invoice_generated","passport_uploaded","passport_expiry",
  "visa_approved","visa_rejected","ticket_issued","flight_assigned",
  "hotel_assigned","room_assigned","bus_assigned",
  "departure_reminder","arrival_reminder","return_reminder","feedback_request","medical_emergency",
];

const VARIABLE_CHIPS = [
  "{{customer_name}}","{{booking_number}}","{{package_name}}","{{departure_date}}",
  "{{amount}}","{{balance}}","{{invoice_number}}","{{total_amount}}","{{outstanding_amount}}",
  "{{flight_number}}","{{from_airport}}","{{to_airport}}","{{departure_time}}",
  "{{hotel_name}}","{{room_number}}","{{bus_number}}","{{days_remaining}}",
  "{{utr_number}}","{{visa_status}}","{{booking_id}}",
];

const VAR_LABELS: Record<string, string> = {
  customer_name: "Customer Name",
  booking_number: "Booking #",
  package_name: "Package Name",
  total_amount: "Total Amount (₹)",
  amount: "Amount (₹)",
  balance: "Balance (₹)",
  outstanding_amount: "Outstanding (₹)",
  invoice_number: "Invoice #",
  flight_number: "Flight Number",
  from_airport: "From Airport",
  to_airport: "To Airport",
  departure_date: "Departure Date",
  departure_time: "Departure Time",
  days_remaining: "Days Remaining",
  hotel_name: "Hotel Name",
  room_number: "Room #",
  bus_number: "Bus #",
  visa_status: "Visa Status",
  utr_number: "UTR Number",
  booking_id: "Booking ID",
};

const VAR_DEFAULTS: Record<string, string> = {
  customer_name: "Mohammed Altaf",
  booking_number: "ABT-001",
  package_name: "Hajj 2026 Economy",
  total_amount: "250000",
  amount: "50000",
  balance: "200000",
  outstanding_amount: "200000",
  invoice_number: "INV-2026-001",
  flight_number: "AI-823",
  from_airport: "BOM",
  to_airport: "JED",
  departure_date: "15-May-2026",
  departure_time: "03:00 AM",
  days_remaining: "7",
  hotel_name: "Makkah Grand Hotel",
  room_number: "301",
  bus_number: "BUS-01",
  visa_status: "Approved",
  utr_number: "UTR123456789",
  booking_id: "bk_001",
};

interface SmsTemplate {
  id: string; name: string; event_type: string; channel: string;
  body: string; variables: string[];
  dlt_template_id: string; dlt_entity_id: string; sender_id: string;
  provider: string; priority: number; enabled: boolean;
  variable_count?: number; variable_mapping?: string[] | string;
  last_success_at?: string; last_failure_at?: string; last_failure_reason?: string;
  created_at: string; updated_at: string;
}

const EMPTY: Partial<SmsTemplate> = {
  name: "", event_type: "", body: "", dlt_template_id: "", dlt_entity_id: "",
  sender_id: "ABURHA", provider: "fast2sms", priority: 0, enabled: true,
  variables: [], variable_count: 1, variable_mapping: [],
};

function fmtTime(iso?: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

function parseMapping(m: string[] | string | undefined): string[] {
  if (!m) return [];
  if (Array.isArray(m)) return m;
  try { return JSON.parse(m as string); } catch { return []; }
}

export default function SMSTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<SmsTemplate>>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Generic test panel (top-level)
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testSelectedTplId, setTestSelectedTplId] = useState<string>("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // Per-template test modal
  const [testTpl, setTestTpl] = useState<SmsTemplate | null>(null);
  const [testVarValues, setTestVarValues] = useState<string[]>([]);
  const [testTplPhone, setTestTplPhone] = useState("");
  const [testTplResult, setTestTplResult] = useState<any>(null);
  const [testingTpl, setTestingTpl] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/notification-center/templates?channel=sms`, { credentials: "include" });
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch {
      toast({ title: "Failed to load SMS templates", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name || !editing.body) {
      toast({ title: "Name and message body are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = { ...editing, channel: "sms" };
      const url = editing.id
        ? `${API}/api/notification-center/templates/${editing.id}`
        : `${API}/api/notification-center/templates`;
      const r = await fetch(url, {
        method: editing.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editing.id ? "Template updated" : "Template created" });
      setShowModal(false);
      load();
    } catch (e: any) {
      toast({ title: e.message || "Save failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`${API}/api/notification-center/templates/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Template deleted" }); load();
  };

  const toggleEnabled = async (t: SmsTemplate) => {
    await fetch(`${API}/api/notification-center/templates/${t.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...t, enabled: !t.enabled }),
    });
    load();
  };

  const sendGenericTest = async () => {
    if (!testPhone) { toast({ title: "Enter phone number", variant: "destructive" }); return; }
    const digits = testPhone.replace(/\D/g, "");
    if (digits.length < 10) { toast({ title: "Phone must be at least 10 digits", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          channel: "sms",
          recipient: digits,
          message: testMsg,
          templateId: testSelectedTplId || undefined,
        }),
      });
      const d = await r.json();
      setTestResult(d);
      toast({ title: d.ok ? "✅ SMS delivered to gateway!" : `❌ SMS failed: ${d.errorMessage || d.message || "See details below"}`, variant: d.ok ? "default" : "destructive" });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
      toast({ title: "Request error", description: e.message, variant: "destructive" });
    } finally { setTesting(false); }
  };

  const openPerTemplateTest = (t: SmsTemplate) => {
    const mapping = parseMapping(t.variable_mapping);
    const count = t.variable_count || mapping.length || 1;
    const defaults = mapping.length
      ? mapping.map((key: string) => VAR_DEFAULTS[key] || "")
      : Array(count).fill("");
    setTestTpl(t);
    setTestVarValues(defaults);
    setTestTplPhone("");
    setTestTplResult(null);
  };

  const sendPerTemplateTest = async () => {
    if (!testTpl) return;
    if (!testTplPhone) { toast({ title: "Enter phone number", variant: "destructive" }); return; }
    setTestingTpl(true); setTestTplResult(null);
    try {
      const r = await fetch(`${API}/api/notification-center/templates/${testTpl.id}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ mobile: testTplPhone, variables: testVarValues }),
      });
      const d = await r.json();
      setTestTplResult(d);
      if (d.ok) {
        toast({ title: "✅ Test SMS sent successfully!" });
        load(); // Refresh to show updated last_success_at
      } else {
        toast({ title: d.message || "Test SMS failed", variant: "destructive" });
        load();
      }
    } catch (e: any) {
      setTestTplResult({ ok: false, error: e.message });
    } finally { setTestingTpl(false); }
  };

  const insertVar = (v: string) => {
    setEditing(p => ({ ...p, body: (p.body || "") + " " + v }));
  };

  const filtered = templates.filter(t =>
    !search ||
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.event_type?.toLowerCase().includes(search.toLowerCase()) ||
    t.dlt_template_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-amber-500" />
              SMS / DLT Template Manager
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage DLT-compliant SMS templates · {templates.filter(t => t.enabled).length} active · {templates.filter(t => t.dlt_template_id).length} with DLT IDs
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTest(!showTest)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium text-sm">
              <Send className="w-4 h-4" /> Quick Test
            </button>
            <button onClick={() => { setEditing({ ...EMPTY }); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm">
              <Plus className="w-4 h-4" /> Add Template
            </button>
          </div>
        </div>

        {/* Quick Test Panel */}
        {showTest && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <Send className="w-4 h-4" /> Test SMS Send
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone Number (10-digit) *</label>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="9876543210" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Template (optional)</label>
                <select
                  value={testSelectedTplId}
                  onChange={e => {
                    setTestSelectedTplId(e.target.value);
                    const tpl = templates.find(t => t.id === e.target.value);
                    if (tpl) setTestMsg(tpl.body || "");
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Quick Route (no DLT) —</option>
                  {templates.filter(t => t.enabled && t.dlt_template_id).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.dlt_template_id})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Variables (pipe-separated for DLT vars)
                </label>
                <input value={testMsg} onChange={e => setTestMsg(e.target.value)}
                  placeholder="Value1|Value2|Value3" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {testSelectedTplId && (() => {
              const tpl = templates.find(t => t.id === testSelectedTplId);
              return tpl ? (
                <div className="text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span><span className="text-gray-500">DLT ID:</span> <span className="font-mono font-bold text-amber-700">{tpl.dlt_template_id}</span></span>
                    <span><span className="text-gray-500">Sender:</span> <span className="font-mono font-bold">{tpl.sender_id || "ABURHA"}</span></span>
                    {tpl.dlt_entity_id && <span><span className="text-gray-500">Entity ID:</span> <span className="font-mono">{tpl.dlt_entity_id}</span></span>}
                    <span><span className="text-gray-500">Vars:</span> <span className="font-mono">{tpl.variable_count ?? "?"}</span></span>
                  </div>
                  <div className="text-gray-500 italic truncate">Template: {tpl.body}</div>
                </div>
              ) : null;
            })()}
            <div className="flex items-center gap-3">
              <button onClick={sendGenericTest} disabled={testing}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-semibold disabled:opacity-50">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {testing ? "Sending…" : "Send Test SMS"}
              </button>
              {!testSelectedTplId && <span className="text-xs text-gray-500">No template selected — will use Quick Route (non-DLT)</span>}
            </div>

            {/* Full response display */}
            {testResult && (
              <div className={`rounded-xl border-2 p-4 space-y-3 ${testResult.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                {/* Status banner */}
                <div className={`flex items-center gap-2 font-bold text-sm ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                  {testResult.ok
                    ? <CheckCircle2 className="w-5 h-5" />
                    : <XCircle className="w-5 h-5" />}
                  {testResult.ok ? "✅ SMS accepted by Fast2SMS gateway" : "❌ Fast2SMS rejected the request"}
                  {testResult.durationMs != null && <span className="ml-auto text-xs font-normal text-gray-500">{testResult.durationMs}ms</span>}
                </div>

                {/* Key fields grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {[
                    { label: "Route", value: testResult.route },
                    { label: "HTTP Status", value: testResult.httpStatus },
                    { label: "Mobile", value: testResult.numbers || testResult.mobile },
                    { label: "Sender ID", value: testResult.senderId },
                    { label: "DLT Template ID", value: testResult.dltTemplateId || "—" },
                    { label: "Entity ID", value: testResult.entityId || "—" },
                    { label: "Authorization", value: testResult.authorization },
                    { label: "Variables sent", value: testResult.variablesSent ? testResult.variablesSent.join(" | ") : "—" },
                    { label: "Error Code", value: testResult.errorCode || "—" },
                    { label: "Error Message", value: testResult.errorMessage || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <div className="text-gray-400 text-[10px] uppercase tracking-wide">{label}</div>
                      <div className="font-mono font-medium text-gray-800 break-all mt-0.5">{String(value ?? "—")}</div>
                    </div>
                  ))}
                </div>

                {/* Request URL */}
                {testResult.requestUrl && (
                  <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                    <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Exact Request URL sent to Fast2SMS</div>
                    <div className="font-mono text-[10px] text-blue-700 break-all">{testResult.requestUrl}</div>
                  </div>
                )}

                {/* Template body */}
                {testResult.templateBody && (
                  <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                    <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">DLT Template Body (registered)</div>
                    <div className="text-xs text-gray-700 italic">{testResult.templateBody}</div>
                  </div>
                )}

                {/* Raw gateway response */}
                <div className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                  <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Raw Fast2SMS Gateway Response</div>
                  <pre className="text-[10px] font-mono text-gray-800 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(testResult.apiResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, event type, or DLT ID…"
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
        </div>

        {/* Templates Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No SMS templates found. Click "Add Template" to create your first DLT template.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Template Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">DLT Template ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Sender</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 w-16">Vars</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Test</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const successTime = fmtTime(t.last_success_at);
                  const failureTime = fmtTime(t.last_failure_at);
                  const varCount = t.variable_count || parseMapping(t.variable_mapping).length;
                  return (
                    <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">{t.event_type || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {t.dlt_template_id
                          ? <span className="font-mono text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">{t.dlt_template_id}</span>
                          : <span className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Not set</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.sender_id || "ABURHA"}</td>
                      <td className="px-4 py-3">
                        {varCount > 0
                          ? <span className="flex items-center gap-1 text-xs text-gray-600"><Variable className="w-3 h-3 text-gray-400" />{varCount}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-0.5">
                          {successTime && (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                              <span>{successTime}</span>
                            </div>
                          )}
                          {failureTime && (
                            <div className="flex items-center gap-1 text-red-500" title={t.last_failure_reason || ""}>
                              <XCircle className="w-3 h-3 flex-shrink-0" />
                              <span>{failureTime}</span>
                            </div>
                          )}
                          {!successTime && !failureTime && (
                            <span className="text-gray-300 flex items-center gap-1"><Clock className="w-3 h-3" />Never tested</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleEnabled(t)}>
                          {t.enabled
                            ? <span className="flex items-center gap-1 text-green-600 text-xs"><ToggleRight className="w-4 h-4" />Active</span>
                            : <span className="flex items-center gap-1 text-gray-400 text-xs"><ToggleLeft className="w-4 h-4" />Off</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditing({ ...t }); setShowModal(true); }}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openPerTemplateTest(t)}
                            className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title="Test DLT send">
                            <FlaskConical className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => del(t.id, t.name)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Edit" : "New"} SMS / DLT Template</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Template Name *</label>
                  <input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Booking Confirmation" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Event Type</label>
                  <select value={editing.event_type || ""} onChange={e => setEditing(p => ({ ...p, event_type: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select event —</option>
                    {ALL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">DLT Template ID *</label>
                  <input value={editing.dlt_template_id || ""} onChange={e => setEditing(p => ({ ...p, dlt_template_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="219801" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Sender ID (6-char)</label>
                  <input value={editing.sender_id || ""} onChange={e => setEditing(p => ({ ...p, sender_id: e.target.value.toUpperCase() }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase" placeholder="ABURHA" maxLength={6} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Variable Count (# of {`{#var#}`})</label>
                  <input type="number" min={0} max={20} value={editing.variable_count ?? 1}
                    onChange={e => setEditing(p => ({ ...p, variable_count: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Variable Mapping (comma-separated keys)</label>
                  <input
                    value={Array.isArray(editing.variable_mapping) ? (editing.variable_mapping as string[]).join(",") : (editing.variable_mapping as string || "")}
                    onChange={e => setEditing(p => ({ ...p, variable_mapping: e.target.value.split(",").map(s => s.trim()) }))}
                    placeholder="customer_name,booking_number,amount"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
                  <p className="text-xs text-gray-400 mt-0.5">Used to label variable fields in the test modal</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Message Body (use {`{#var#}`} for DLT variables) *</label>
                  <span className="text-xs text-gray-400">{(editing.body || "").length} chars</span>
                </div>
                <textarea value={editing.body || ""} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  rows={5} className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none"
                  placeholder="Dear {#var#}, your booking {#var#} is confirmed..." />
                <div className="flex flex-wrap gap-1 mt-2">
                  {VARIABLE_CHIPS.map(v => (
                    <button key={v} onClick={() => insertVar(v)}
                      className="text-xs bg-gray-100 hover:bg-amber-100 text-gray-600 hover:text-amber-700 px-2 py-0.5 rounded cursor-pointer">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {editing.body && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">PREVIEW</p>
                  <div className="bg-white border rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap font-mono">
                    {editing.body}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.enabled !== false}
                  onChange={e => setEditing(p => ({ ...p, enabled: e.target.checked }))}
                  className="w-4 h-4 rounded" />
                <span className="text-sm font-medium">Template Active</span>
              </label>
            </div>
            <div className="p-6 border-t flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {editing.id ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-template DLT Test Modal */}
      {testTpl && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-500" />
                  Test: {testTpl.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  DLT ID: <span className="font-mono text-amber-600">{testTpl.dlt_template_id || "Not set"}</span>
                  {" · "} Sender: <span className="font-mono">{testTpl.sender_id || "ABURHA"}</span>
                  {" · "} {testTpl.variable_count || 0} variable{testTpl.variable_count !== 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={() => { setTestTpl(null); setTestTplResult(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Template body preview */}
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs font-mono text-gray-700 whitespace-pre-wrap">
                {testTpl.body || "No body"}
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Send to (10-digit mobile) *</label>
                <input value={testTplPhone} onChange={e => setTestTplPhone(e.target.value)}
                  placeholder="9876543210" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Variable fields */}
              {(() => {
                const mapping = parseMapping(testTpl.variable_mapping);
                const count = testTpl.variable_count || mapping.length || 0;
                if (count === 0) return null;
                return (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-2">
                      Variable Values ({count} {`{#var#}`} slots in order)
                    </label>
                    <div className="space-y-2">
                      {Array.from({ length: count }).map((_, idx) => {
                        const key = mapping[idx] || `var${idx + 1}`;
                        const label = VAR_LABELS[key] || key.replace(/_/g, " ");
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs text-amber-600 font-mono w-6 text-right">{idx + 1}</span>
                            <div className="flex-1">
                              <label className="text-xs text-gray-500">{label}</label>
                              <input
                                value={testVarValues[idx] || ""}
                                onChange={e => setTestVarValues(prev => {
                                  const next = [...prev];
                                  next[idx] = e.target.value;
                                  return next;
                                })}
                                placeholder={VAR_DEFAULTS[key] || label}
                                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Result */}
              {testTplResult && (
                <div className={`rounded-lg p-3 text-xs ${testTplResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <div className={`flex items-center gap-2 font-semibold mb-2 ${testTplResult.ok ? "text-green-700" : "text-red-700"}`}>
                    {testTplResult.ok
                      ? <><CheckCircle2 className="w-4 h-4" /> SMS Delivered via DLT ✓</>
                      : <><XCircle className="w-4 h-4" /> Delivery Failed</>}
                  </div>
                  {testTplResult.requestUrl && (
                    <p className="text-gray-500 mb-1 break-all">URL: {testTplResult.requestUrl}</p>
                  )}
                  {testTplResult.durationMs && (
                    <p className="text-gray-500 mb-1">Duration: {testTplResult.durationMs}ms</p>
                  )}
                  {testTplResult.apiResponse && (
                    <pre className="font-mono whitespace-pre-wrap text-gray-700 bg-white/60 rounded p-2 mt-1">
                      {JSON.stringify(testTplResult.apiResponse, null, 2)}
                    </pre>
                  )}
                  {testTplResult.message && !testTplResult.ok && (
                    <p className="text-red-600 font-medium">{testTplResult.message}</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-5 border-t flex items-center justify-end gap-3">
              <button onClick={() => { setTestTpl(null); setTestTplResult(null); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Close</button>
              <button onClick={sendPerTemplateTest} disabled={testingTpl || !testTpl.dlt_template_id}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50"
                title={!testTpl.dlt_template_id ? "Set a DLT Template ID first" : ""}>
                {testingTpl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Test SMS
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
