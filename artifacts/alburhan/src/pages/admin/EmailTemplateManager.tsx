import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Send, Search, Loader2,
  Mail, CheckCircle2, ToggleLeft, ToggleRight, Eye, Code
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const ALL_EVENTS = [
  "new_booking","booking_approved","booking_cancelled","booking_completed",
  "payment_received","partial_payment","payment_due","balance_reminder",
  "invoice_generated","receipt_generated","passport_uploaded","passport_expiry",
  "visa_approved","visa_rejected","ticket_issued","flight_assigned",
  "hotel_assigned","room_assigned","bus_assigned",
  "departure_reminder","return_reminder","feedback_request",
];

const VARIABLES = [
  "{{customer_name}}","{{booking_id}}","{{package_name}}","{{departure_date}}",
  "{{amount}}","{{balance}}","{{invoice_number}}","{{visa_status}}",
  "{{flight_number}}","{{hotel_name}}","{{room_number}}","{{bus_number}}",
  "{{utr_number}}","{{payment_status}}","{{booking_number}}",
];

interface EmailTemplate {
  id: string; name: string; event_type: string; channel: string;
  subject: string; body: string; html_body: string;
  variables: string[]; enabled: boolean;
  created_at: string; updated_at: string;
}

const EMPTY: Partial<EmailTemplate> = {
  name: "", event_type: "", subject: "", body: "", html_body: "", variables: [], enabled: true,
};

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    .card { background: #fff; border-radius: 12px; max-width: 520px; margin: auto; padding: 32px; }
    .logo { font-size: 22px; font-weight: bold; color: #1e293b; margin-bottom: 24px; }
    h2 { color: #1e293b; margin: 0 0 12px; }
    p { color: #475569; line-height: 1.6; }
    .badge { display: inline-block; background: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 99px; font-size: 13px; font-weight: 600; }
    .footer { margin-top: 32px; color: #94a3b8; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Al Burhan Tours &amp; Travels</div>
    <span class="badge">Booking Confirmed ✓</span>
    <h2 style="margin-top:16px;">Assalamu Alaikum, {{customer_name}}</h2>
    <p>Your booking <strong>{{booking_id}}</strong> for <strong>{{package_name}}</strong> has been confirmed.</p>
    <p>Departure: <strong>{{departure_date}}</strong></p>
    <p>Total Amount: <strong>{{amount}}</strong></p>
    <div class="footer">
      Al Burhan Tours &amp; Travels · alburhantravels.com<br/>
      For support, call +91 XXXXX XXXXX
    </div>
  </div>
</body>
</html>`;

export default function EmailTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<EmailTemplate>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"html" | "preview">("html");
  const [showTest, setShowTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testTplId, setTestTplId] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/notification-center/templates?channel=email`, { credentials: "include" });
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch { toast({ title: "Failed to load email templates", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name || !editing.subject) {
      toast({ title: "Name and subject are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editing,
        channel: "email",
        body: editing.body || editing.html_body?.replace(/<[^>]+>/g, " ").trim() || "",
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

  const toggleEnabled = async (t: EmailTemplate) => {
    await fetch(`${API}/api/notification-center/templates/${t.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...t, enabled: !t.enabled }),
    }); load();
  };

  const sendTest = async () => {
    if (!testEmail) { toast({ title: "Enter email address", variant: "destructive" }); return; }
    const tpl = templates.find(t => t.id === testTplId);
    if (!tpl) { toast({ title: "Select a template", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          channel: "email", recipient: testEmail,
          subject: tpl.subject, message: tpl.body, html_body: tpl.html_body, templateId: tpl.id,
        }),
      });
      const d = await r.json();
      setTestResult(d);
      toast({ title: d.ok ? "Test email sent!" : "Test failed", variant: d.ok ? "default" : "destructive" });
    } catch (e: any) { setTestResult({ ok: false, error: e.message }); }
    finally { setTesting(false); }
  };

  const insertVar = (v: string) => {
    if (previewMode === "html") setEditing(p => ({ ...p, html_body: (p.html_body || "") + v }));
    else setEditing(p => ({ ...p, body: (p.body || "") + " " + v }));
  };

  const previewHtml = (editing.html_body || "")
    .replace(/\{\{customer_name\}\}/g, "Ahmad Khan")
    .replace(/\{\{booking_id\}\}/g, "BK-2026-1234")
    .replace(/\{\{package_name\}\}/g, "Hajj Premium 2026")
    .replace(/\{\{departure_date\}\}/g, "12 Apr 2026")
    .replace(/\{\{amount\}\}/g, "₹1,80,000")
    .replace(/\{\{balance\}\}/g, "₹90,000")
    .replace(/\{\{booking_number\}\}/g, "ALB-001234");

  const filtered = templates.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.event_type?.toLowerCase().includes(search.toLowerCase()) ||
    t.subject?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="w-6 h-6 text-purple-500" />
              Email Template Manager
            </h1>
            <p className="text-sm text-gray-500 mt-1">Design and manage HTML email templates with live preview</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTest(!showTest)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium text-sm">
              <Send className="w-4 h-4" /> Test Email
            </button>
            <button onClick={() => { setEditing({ ...EMPTY, html_body: DEFAULT_HTML }); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm">
              <Plus className="w-4 h-4" /> New Template
            </button>
          </div>
        </div>

        {/* Test Panel */}
        {showTest && (
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-5">
            <h3 className="font-semibold text-purple-800 mb-3">Test Email Send</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email Address</label>
                <input value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  type="email" placeholder="test@example.com" className="w-full border rounded-lg px-3 py-2 text-sm" />
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
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test Email
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
            placeholder="Search by name, event, subject…" className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No email templates. Create your first HTML email template.</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Template Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Event</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Subject</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">HTML</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.event_type || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{t.subject}</td>
                    <td className="px-4 py-3">
                      {t.html_body
                        ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-mono">HTML</span>
                        : <span className="text-xs text-gray-400">Plain</span>}
                    </td>
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
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setTestTplId(t.id); setShowTest(true); }}
                          className="p-1.5 rounded hover:bg-purple-50 text-purple-600"><Send className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del(t.id, t.name)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing.id ? "Edit" : "New"} Email Template</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Template Name *</label>
                  <input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="booking_confirmation_email" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Event Type</label>
                  <select value={editing.event_type || ""} onChange={e => setEditing(p => ({ ...p, event_type: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select —</option>
                    {ALL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Subject Line *</label>
                  <input value={editing.subject || ""} onChange={e => setEditing(p => ({ ...p, subject: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Your {{package_name}} Booking Confirmation" />
                </div>
              </div>

              {/* Variable Picker */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Insert Variable</p>
                <div className="flex flex-wrap gap-1">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => insertVar(v)}
                      className="text-xs bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-purple-700 px-2 py-0.5 rounded">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor + Preview */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setPreviewMode("html")}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium ${previewMode === "html" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    <Code className="w-3 h-3" /> HTML Editor
                  </button>
                  <button onClick={() => setPreviewMode("preview")}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium ${previewMode === "preview" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                </div>

                {previewMode === "html" ? (
                  <textarea
                    value={editing.html_body || ""}
                    onChange={e => setEditing(p => ({ ...p, html_body: e.target.value }))}
                    rows={18}
                    className="w-full border rounded-xl px-3 py-2 text-xs font-mono resize-y"
                    placeholder="Paste or write HTML email template here…"
                    spellCheck={false}
                  />
                ) : (
                  <div className="border rounded-xl overflow-hidden bg-gray-100 h-96">
                    {editing.html_body ? (
                      <iframe
                        srcDoc={previewHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                        title="Email preview"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <Mail className="w-8 h-8 opacity-30 mr-2" />
                        <span>No HTML body — add content in the editor</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Plain Text Fallback</label>
                <textarea value={editing.body || ""} onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Plain text version for clients that don't support HTML…" />
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
                className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
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
