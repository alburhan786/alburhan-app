import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Send, ToggleLeft, ToggleRight,
  Search, RefreshCw, MessageSquare, Copy, CheckCircle2, XCircle, Loader2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ALL_EVENTS = [
  "new_booking","booking_approved","booking_cancelled","booking_completed",
  "payment_received","partial_payment","payment_due","balance_reminder",
  "invoice_generated","passport_uploaded","passport_expiry",
  "visa_approved","visa_rejected","ticket_issued","flight_assigned",
  "hotel_assigned","room_assigned","bus_assigned",
  "departure_reminder","return_reminder","feedback_request","medical_emergency",
];

const VARIABLES = [
  "{{customer_name}}","{{booking_id}}","{{package_name}}","{{departure_date}}",
  "{{amount}}","{{balance}}","{{invoice_number}}","{{visa_status}}",
  "{{flight_number}}","{{hotel_name}}","{{room_number}}","{{bus_number}}",
  "{{utr_number}}","{{payment_status}}","{{booking_number}}",
];

interface SmsTemplate {
  id: string; name: string; event_type: string; channel: string;
  body: string; variables: string[];
  dlt_template_id: string; dlt_entity_id: string; sender_id: string;
  provider: string; priority: number; enabled: boolean;
  created_at: string; updated_at: string;
}

const EMPTY: Partial<SmsTemplate> = {
  name: "", event_type: "", body: "", dlt_template_id: "", dlt_entity_id: "",
  sender_id: "", provider: "fast2sms", priority: 0, enabled: true, variables: [],
};

export default function SMSTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<SmsTemplate>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testTplId, setTestTplId] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [showTest, setShowTest] = useState(false);

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

  const sendTest = async () => {
    if (!testPhone || !testMsg) { toast({ title: "Enter phone and message", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ channel: "sms", recipient: testPhone, message: testMsg, templateId: testTplId || undefined }),
      });
      const d = await r.json();
      setTestResult(d);
      toast({ title: d.ok ? "Test SMS sent!" : "Test SMS failed", variant: d.ok ? "default" : "destructive" });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally { setTesting(false); }
  };

  const insertVar = (v: string) => {
    setEditing(p => ({ ...p, body: (p.body || "") + " " + v }));
  };

  const filtered = templates.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.event_type?.toLowerCase().includes(search.toLowerCase()) ||
    t.dlt_template_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-amber-500" />
              SMS / DLT Template Manager
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage DLT-compliant SMS templates for Fast2SMS</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTest(!showTest)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium text-sm">
              <Send className="w-4 h-4" /> Test SMS
            </button>
            <button onClick={() => { setEditing({ ...EMPTY }); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm">
              <Plus className="w-4 h-4" /> Add Template
            </button>
          </div>
        </div>

        {/* Test Panel */}
        {showTest && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2"><Send className="w-4 h-4" />Test SMS Send</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone Number (10-digit)</label>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="9876543210" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Template (optional)</label>
                <select value={testTplId} onChange={e => {
                  const t = templates.find(x => x.id === e.target.value);
                  setTestTplId(e.target.value);
                  if (t) setTestMsg(t.body);
                }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Custom message —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
                <input value={testMsg} onChange={e => setTestMsg(e.target.value)}
                  placeholder="Enter message…" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <button onClick={sendTest} disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test SMS
            </button>
            {testResult && (
              <div className={`mt-3 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap ${testResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {JSON.stringify(testResult, null, 2)}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, event, DLT ID…"
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
        </div>

        {/* Templates Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No SMS templates found. Create your first DLT template.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Template Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">DLT Template ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Sender ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.event_type || "—"}</td>
                    <td className="px-4 py-3">
                      {t.dlt_template_id
                        ? <span className="font-mono text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">{t.dlt_template_id}</span>
                        : <span className="text-gray-400 text-xs">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{t.sender_id || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleEnabled(t)}>
                        {t.enabled
                          ? <span className="flex items-center gap-1 text-green-600 text-xs"><ToggleRight className="w-4 h-4" />Active</span>
                          : <span className="flex items-center gap-1 text-gray-400 text-xs"><ToggleLeft className="w-4 h-4" />Disabled</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditing({ ...t }); setShowModal(true); }}
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setTestMsg(t.body); setTestTplId(t.id); setShowTest(true); }}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-600" title="Test">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => del(t.id, t.name)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="booking_confirmation_dlt" />
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
                  <label className="text-xs font-semibold text-gray-600 block mb-1">DLT Template ID</label>
                  <input value={editing.dlt_template_id || ""} onChange={e => setEditing(p => ({ ...p, dlt_template_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="1007235624789012345" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">DLT Entity ID</label>
                  <input value={editing.dlt_entity_id || ""} onChange={e => setEditing(p => ({ ...p, dlt_entity_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="1001234567891234567" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Sender ID (6-char)</label>
                  <input value={editing.sender_id || ""} onChange={e => setEditing(p => ({ ...p, sender_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase" placeholder="ALBTRV" maxLength={6} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Priority</label>
                  <select value={editing.priority ?? 0} onChange={e => setEditing(p => ({ ...p, priority: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value={0}>Normal</option>
                    <option value={1}>High</option>
                    <option value={2}>Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600">Message Body *</label>
                  <span className="text-xs text-gray-400">{(editing.body || "").length} / 160 chars (multi-part above 160)</span>
                </div>
                <textarea value={editing.body || ""} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  rows={5} className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none"
                  placeholder="Dear {{customer_name}}, your booking {{booking_id}} is confirmed..." />
                <div className="flex flex-wrap gap-1 mt-2">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => insertVar(v)}
                      className="text-xs bg-gray-100 hover:bg-amber-100 text-gray-600 hover:text-amber-700 px-2 py-0.5 rounded cursor-pointer">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
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
    </AdminLayout>
  );
}
