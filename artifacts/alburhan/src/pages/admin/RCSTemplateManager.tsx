import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Send, ToggleLeft, ToggleRight,
  Search, Loader2, Layers, Image, ExternalLink, CheckCircle2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ALL_EVENTS = [
  "new_booking","booking_approved","payment_received","balance_reminder",
  "invoice_generated","visa_approved","visa_rejected","ticket_issued",
  "flight_assigned","hotel_assigned","room_assigned","bus_assigned",
  "departure_reminder","return_reminder","feedback_request","medical_emergency",
];

const VARIABLES = [
  "{{customer_name}}","{{booking_id}}","{{package_name}}","{{departure_date}}",
  "{{amount}}","{{balance}}","{{flight_number}}","{{hotel_name}}","{{room_number}}",
  "{{bus_number}}","{{booking_number}}","{{visa_status}}","{{payment_status}}",
];

interface RcsTemplate {
  id: string; name: string; event_type: string; channel: string;
  body: string; variables: string[];
  rcs_agent_id: string; rcs_campaign_id: string;
  rich_card: { title?: string; description?: string; media_url?: string; media_type?: string };
  buttons: Array<{ type: string; text: string; url?: string; phone?: string }>;
  enabled: boolean; created_at: string; updated_at: string;
}

const EMPTY_RC: RcsTemplate["rich_card"] = { title: "", description: "", media_url: "", media_type: "IMAGE" };
const EMPTY: Partial<RcsTemplate> = {
  name: "", event_type: "", body: "", rcs_agent_id: "", rcs_campaign_id: "",
  rich_card: { ...EMPTY_RC }, buttons: [], enabled: true, variables: [],
};

export default function RCSTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<RcsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<RcsTemplate>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testTplId, setTestTplId] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/notification-center/templates?channel=rcs`, { credentials: "include" });
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch { toast({ title: "Failed to load RCS templates", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name || !editing.body) {
      toast({ title: "Name and body required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editing,
        channel: "rcs",
        rich_card: editing.rich_card,
        buttons: editing.buttons || [],
      };
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
      setShowModal(false); load();
    } catch (e: any) {
      toast({ title: e.message || "Save failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`${API}/api/notification-center/templates/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Deleted" }); load();
  };

  const toggleEnabled = async (t: RcsTemplate) => {
    await fetch(`${API}/api/notification-center/templates/${t.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...t, enabled: !t.enabled }),
    }); load();
  };

  const sendTest = async () => {
    if (!testPhone) { toast({ title: "Enter phone number", variant: "destructive" }); return; }
    const tpl = templates.find(t => t.id === testTplId);
    if (!tpl) { toast({ title: "Select a template", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ channel: "rcs", recipient: testPhone, message: tpl.body, templateId: tpl.id }),
      });
      const d = await r.json();
      setTestResult(d);
      toast({ title: d.ok ? "RCS sent!" : "RCS failed", variant: d.ok ? "default" : "destructive" });
    } catch (e: any) { setTestResult({ ok: false, error: e.message }); }
    finally { setTesting(false); }
  };

  const insertVar = (v: string) => setEditing(p => ({ ...p, body: (p.body || "") + " " + v }));

  const addButton = () => setEditing(p => ({
    ...p, buttons: [...(p.buttons || []), { type: "url", text: "Learn More", url: "" }]
  }));
  const removeButton = (i: number) => setEditing(p => ({
    ...p, buttons: (p.buttons || []).filter((_, idx) => idx !== i)
  }));
  const updateButton = (i: number, field: string, val: string) => setEditing(p => {
    const btns = [...(p.buttons || [])];
    btns[i] = { ...btns[i], [field]: val };
    return { ...p, buttons: btns };
  });

  const filtered = templates.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.event_type?.toLowerCase().includes(search.toLowerCase())
  );

  const rc = editing.rich_card || {};

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-500" />
              RCS Template Manager
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage RCS rich messaging templates via Lemin AI</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTest(!showTest)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium text-sm">
              <Send className="w-4 h-4" /> Test RCS
            </button>
            <button onClick={() => { setEditing({ ...EMPTY, rich_card: { ...EMPTY_RC }, buttons: [] }); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
              <Plus className="w-4 h-4" /> Add Template
            </button>
          </div>
        </div>

        {/* Test Panel */}
        {showTest && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-800 mb-3">Test RCS Send</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone Number</label>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="9876543210" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Template</label>
                <select value={testTplId} onChange={e => setTestTplId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Select template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <button onClick={sendTest} disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test RCS
            </button>
            {testResult && (
              <div className={`mt-3 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap ${testResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {JSON.stringify(testResult, null, 2)}
              </div>
            )}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…" className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No RCS templates found. Create your first rich card template.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(t => {
              const rc = typeof t.rich_card === "string" ? JSON.parse(t.rich_card || "{}") : (t.rich_card || {});
              return (
                <div key={t.id} className="border rounded-xl p-4 hover:shadow-md transition-shadow bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800">{t.name}</h3>
                      <p className="text-xs text-gray-500">{t.event_type || "No event"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleEnabled(t)} title={t.enabled ? "Disable" : "Enable"}>
                        {t.enabled
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </button>
                      <button onClick={() => { setEditing({ ...t, rich_card: typeof t.rich_card === "string" ? JSON.parse(t.rich_card || "{}") : t.rich_card, buttons: t.buttons || [] }); setShowModal(true); }}
                        className="p-1 rounded hover:bg-blue-50 text-blue-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => del(t.id, t.name)} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {/* RCS Phone Preview */}
                  <div className="bg-gray-100 rounded-xl p-3 max-w-xs mx-auto">
                    {rc.media_url && (
                      <div className="bg-gray-300 rounded-lg h-28 flex items-center justify-center mb-2 overflow-hidden">
                        <img src={rc.media_url} alt="rich card" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                        {!rc.media_url && <Image className="w-8 h-8 text-gray-500" />}
                      </div>
                    )}
                    {rc.title && <p className="font-bold text-xs mb-0.5">{rc.title}</p>}
                    {rc.description && <p className="text-xs text-gray-600 mb-1">{rc.description}</p>}
                    <p className="text-xs text-gray-700 mb-2">{t.body}</p>
                    {(t.buttons || []).map((b, i) => (
                      <div key={i} className="text-center text-xs text-blue-600 font-semibold border border-blue-200 rounded-full py-1 mb-1 flex items-center justify-center gap-1">
                        {b.type === "url" && <ExternalLink className="w-3 h-3" />}
                        {b.text}
                      </div>
                    ))}
                  </div>
                  {t.rcs_agent_id && <p className="text-xs text-gray-400 mt-2">Agent: {t.rcs_agent_id}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Edit" : "New"} RCS Template</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Template Name *</label>
                  <input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Event Type</label>
                  <select value={editing.event_type || ""} onChange={e => setEditing(p => ({ ...p, event_type: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select —</option>
                    {ALL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">RCS Agent ID</label>
                  <input value={editing.rcs_agent_id || ""} onChange={e => setEditing(p => ({ ...p, rcs_agent_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="alburhan-agent" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Campaign ID</label>
                  <input value={editing.rcs_campaign_id || ""} onChange={e => setEditing(p => ({ ...p, rcs_campaign_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="hajj_2026" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Message Body *</label>
                <textarea value={editing.body || ""} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Dear {{customer_name}}, your {{package_name}} booking is confirmed!" />
                <div className="flex flex-wrap gap-1 mt-1">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => insertVar(v)}
                      className="text-xs bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-2 py-0.5 rounded">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Image className="w-4 h-4 text-blue-500" />Rich Card (optional)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Card Title</label>
                    <input value={rc.title || ""} onChange={e => setEditing(p => ({ ...p, rich_card: { ...(p.rich_card || {}), title: e.target.value } }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Your Hajj Package" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Media URL</label>
                    <input value={rc.media_url || ""} onChange={e => setEditing(p => ({ ...p, rich_card: { ...(p.rich_card || {}), media_url: e.target.value } }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="https://..." />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Card Description</label>
                  <textarea value={rc.description || ""} onChange={e => setEditing(p => ({ ...p, rich_card: { ...(p.rich_card || {}), description: e.target.value } }))}
                    rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" placeholder="Premium Hajj package..." />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Action Buttons</h3>
                  <button onClick={addButton} className="text-xs text-blue-600 flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />Add Button</button>
                </div>
                {(editing.buttons || []).map((b, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select value={b.type} onChange={e => updateButton(i, "type", e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-24">
                      <option value="url">URL</option>
                      <option value="call">Call</option>
                      <option value="reply">Reply</option>
                    </select>
                    <input value={b.text} onChange={e => updateButton(i, "text", e.target.value)}
                      placeholder="Button label" className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
                    <input value={b.url || b.phone || ""} onChange={e => updateButton(i, b.type === "call" ? "phone" : "url", e.target.value)}
                      placeholder={b.type === "call" ? "Phone" : "URL"} className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
                    <button onClick={() => removeButton(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.enabled !== false}
                  onChange={e => setEditing(p => ({ ...p, enabled: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm font-medium">Template Active</span>
              </label>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
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
