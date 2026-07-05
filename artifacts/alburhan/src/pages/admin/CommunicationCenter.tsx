import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, MessageSquare, Mail, Smartphone, Radio, Activity, Send, RefreshCw,
  Clock, CheckCircle, XCircle, AlertTriangle, Settings, FileText, Megaphone,
  Zap, BarChart2, ChevronRight, Plus, Trash2, Edit2, RotateCcw, Calendar,
  Search, Filter, TrendingUp, Users, List, PlayCircle, X
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EVENT_LABELS: Record<string, string> = {
  new_booking: "New Booking",
  booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled",
  payment_received: "Payment Received",
  payment_due: "Payment Due",
  invoice_generated: "Invoice Generated",
  receipt_generated: "Receipt Generated",
  visa_ready: "Visa Ready",
  flight_assigned: "Flight Assigned",
  hotel_assigned: "Hotel Assigned",
  room_assigned: "Room Assigned",
  bus_assigned: "Bus Assigned",
  passport_expiry: "Passport Expiry",
  departure_reminder: "Departure Reminder",
  arrival_reminder: "Arrival Reminder",
  return_reminder: "Return Reminder",
  feedback_request: "Feedback Request",
};

const CHANNEL_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-green-600", bg: "bg-green-50" },
  sms: { label: "SMS", icon: Smartphone, color: "text-blue-600", bg: "bg-blue-50" },
  rcs: { label: "RCS", icon: Radio, color: "text-purple-600", bg: "bg-purple-50" },
  email: { label: "Email", icon: Mail, color: "text-amber-600", bg: "bg-amber-50" },
  push: { label: "Push", icon: Bell, color: "text-rose-600", bg: "bg-rose-50" },
};

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "queue", label: "Notification Queue", icon: List },
  { id: "settings", label: "Automation Rules", icon: Settings },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "failed", label: "Failed Messages", icon: XCircle },
  { id: "scheduled", label: "Scheduled Messages", icon: Calendar },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "rcs", label: "RCS", icon: Radio },
  { id: "email", label: "Email", icon: Mail },
  { id: "push", label: "Push Notifications", icon: Bell },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    sent: { color: "bg-green-100 text-green-700", label: "Sent" },
    delivered: { color: "bg-emerald-100 text-emerald-700", label: "Delivered" },
    failed: { color: "bg-red-100 text-red-700", label: "Failed" },
    pending: { color: "bg-amber-100 text-amber-700", label: "Pending" },
  };
  const s = map[status] || { color: "bg-gray-100 text-gray-600", label: status };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function ChannelBadge({ channel }: { channel: string }) {
  const m = CHANNEL_META[channel];
  if (!m) return <span className="text-xs text-gray-500">{channel}</span>;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

function formatTS(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`${API}/api/notification-center/stats`, { credentials: "include" }),
        fetch(`${API}/api/notification-center/logs?limit=10`, { credentials: "include" }),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (lRes.ok) setRecentLogs((await lRes.json()).logs || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400"><RefreshCw className="w-6 h-6 animate-spin mr-2" />Loading…</div>;

  const cards = [
    { label: "Today Sent", value: stats?.sent ?? 0, icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Delivered", value: stats?.delivered ?? 0, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
    { label: "Failed", value: stats?.failed ?? 0, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Pending", value: stats?.pending ?? 0, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Delivery Rate", value: `${stats?.deliveryRate ?? 0}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Today's Overview</h2>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-xl p-4 ${c.bg} border border-white shadow-sm`}>
              <div className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-2 shadow-sm`}>
                <Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="text-2xl font-bold text-gray-800">{c.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><Activity className="w-4 h-4" />Channel Health</h3>
          {Object.entries(CHANNEL_META).map(([ch, meta]) => {
            const Icon = meta.icon;
            const chStats = stats?.channelStats?.[ch] || {};
            const sent = (chStats.sent || 0) + (chStats.delivered || 0);
            const failed = chStats.failed || 0;
            const total = sent + failed;
            const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
            return (
              <div key={ch} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center`}>
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                </div>
                <span className="text-sm text-gray-600 w-24">{meta.label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${rate}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{total > 0 ? `${rate}%` : "—"}</span>
                <span className="text-xs text-gray-400 w-14 text-right">{total} msgs</span>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Recent Activity</h3>
          {recentLogs.length === 0 ? (
            <div className="text-center text-gray-400 py-6 text-sm">No notifications yet</div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log: any) => (
                <div key={log.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <ChannelBadge channel={log.channel} />
                  <span className="flex-1 text-gray-600 truncate">{EVENT_LABELS[log.event_type] || log.event_type}</span>
                  <span className="text-gray-400 text-xs">{log.recipient?.slice(-4).padStart(10, "*")}</span>
                  <StatusBadge status={log.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Notification Queue Tab ───────────────────────────────────────────────────
function QueueTab({ filterStatus }: { filterStatus?: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(filterStatus || "");
  const [channel, setChannel] = useState("");
  const [eventType, setEventType] = useState("");
  const [offset, setOffset] = useState(0);
  const { toast } = useToast();
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (channel) params.set("channel", channel);
    if (eventType) params.set("event_type", eventType);
    try {
      const r = await fetch(`${API}/api/notification-center/logs?${params}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || []); setTotal(d.total || 0); }
    } finally { setLoading(false); }
  }, [search, status, channel, eventType, offset]);

  useEffect(() => { setOffset(0); }, [search, status, channel, eventType]);
  useEffect(() => { load(); }, [load]);

  const retry = async (id: string) => {
    const r = await fetch(`${API}/api/notification-center/retry/${id}`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Retried successfully" }); load(); }
    else toast({ title: "Retry failed", variant: "destructive" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input className="pl-8 h-9" placeholder="Search recipient, booking…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            {Object.entries(CHANNEL_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Event" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Events</SelectItem>
            {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No notifications found</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Channel</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Recipient</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Retries</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Sent At</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{EVENT_LABELS[log.event_type] || log.event_type}</td>
                  <td className="px-3 py-2"><ChannelBadge channel={log.channel} /></td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{log.recipient}</td>
                  <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                  <td className="px-3 py-2 text-gray-400 text-center">{log.retry_count}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{formatTS(log.sent_at || log.created_at)}</td>
                  <td className="px-3 py-2">
                    {log.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => retry(log.id)} className="h-6 px-2 text-xs">
                        <RotateCcw className="w-3 h-3 mr-1" />Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>{total} total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="h-6 px-2 text-xs">Prev</Button>
              <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="h-6 px-2 text-xs">Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Automation Rules / Channel Settings Tab ──────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${API}/api/notification-center/settings`, { credentials: "include" })
      .then(r => r.json()).then(d => setSettings(d.settings || [])).finally(() => setLoading(false));
  }, []);

  const toggle = (eventType: string, channel: string) => {
    setSettings(prev => prev.map(s =>
      s.event_type === eventType && s.channel === channel ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const getVal = (eventType: string, channel: string) => {
    const s = settings.find(s => s.event_type === eventType && s.channel === channel);
    return s?.enabled ?? false;
  };

  const save = async () => {
    setSaving(true);
    const r = await fetch(`${API}/api/notification-center/settings`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: settings.map(s => ({ event_type: s.event_type, channel: s.channel, enabled: s.enabled })) }),
    });
    setSaving(false);
    if (r.ok) toast({ title: "Settings saved" });
    else toast({ title: "Save failed", variant: "destructive" });
  };

  if (loading) return <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading…</div>;

  const events = Object.entries(EVENT_LABELS);
  const channels = Object.entries(CHANNEL_META);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Automation Rules</h2>
          <p className="text-sm text-gray-500">Enable or disable notification channels per event type</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}Save Changes
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Event</th>
              {channels.map(([ch, meta]) => {
                const Icon = meta.icon;
                return (
                  <th key={ch} className="px-3 py-3 text-center text-xs font-semibold text-gray-600">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded-md ${meta.bg} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      {meta.label}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map(([ev, label]) => (
              <tr key={ev} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                {channels.map(([ch]) => (
                  <td key={ch} className="px-3 py-2.5 text-center">
                    <Switch
                      checked={getVal(ev, ch)}
                      onCheckedChange={() => toggle(ev, ch)}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", event_type: "", channel: "whatsapp", subject: "", body: "" });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/notification-center/templates`, { credentials: "include" });
    if (r.ok) setTemplates((await r.json()).templates || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (t: any) => { setEditing(t); setForm({ name: t.name, event_type: t.event_type || "", channel: t.channel, subject: t.subject || "", body: t.body }); setCreating(true); };
  const openNew = () => { setEditing(null); setForm({ name: "", event_type: "", channel: "whatsapp", subject: "", body: "" }); setCreating(true); };

  const save = async () => {
    const url = editing ? `${API}/api/notification-center/templates/${editing.id}` : `${API}/api/notification-center/templates`;
    const r = await fetch(url, { method: editing ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { toast({ title: editing ? "Template updated" : "Template created" }); setCreating(false); load(); }
    else toast({ title: "Save failed", variant: "destructive" });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`${API}/api/notification-center/templates/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Deleted" }); load();
  };

  if (creating) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)}><X className="w-4 h-4" /></Button>
          <h2 className="font-semibold text-gray-800">{editing ? "Edit Template" : "New Template"}</h2>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Template Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Booking Approval WhatsApp" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={form.event_type} onValueChange={v => setForm(p => ({ ...p, event_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Generic</SelectItem>
                  {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Channel *</Label>
              <Select value={form.channel} onValueChange={v => setForm(p => ({ ...p, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.channel === "email" && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Subject</Label>
                <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject…" />
              </div>
            )}
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Message Body *</Label>
              <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={7} placeholder={"Use {customerName}, {bookingNumber}, {packageName}, {amount} as variables"} className="font-mono text-xs" />
              <p className="text-xs text-gray-400">Variables: {"{customerName}, {bookingNumber}, {packageName}, {amount}, {invoiceNumber}, {departureDate}"}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700 text-white">Save Template</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Message Templates</h2>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-1" />New Template</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : templates.length === 0 ? (
        <div className="text-center bg-white rounded-xl border border-gray-200 py-12">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No templates yet. Create your first message template.</p>
          <Button variant="outline" className="mt-3" onClick={openNew}>Create Template</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-800 text-sm">{t.name}</div>
                  <div className="flex gap-2 mt-1">
                    <ChannelBadge channel={t.channel} />
                    {t.event_type && <span className="text-xs text-gray-400">{EVENT_LABELS[t.event_type] || t.event_type}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(t)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => del(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 line-clamp-3 font-mono">{t.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Failed Messages Tab ──────────────────────────────────────────────────────
function FailedTab() {
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);

  const retryAll = async () => {
    setRetrying(true);
    const r = await fetch(`${API}/api/notification-center/retry-all-failed`, { method: "POST", credentials: "include" });
    setRetrying(false);
    if (r.ok) {
      const d = await r.json();
      toast({ title: `Retried ${d.success} messages successfully` });
    } else toast({ title: "Retry failed", variant: "destructive" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Failed Messages</h2>
          <p className="text-sm text-gray-500">Messages that failed to deliver</p>
        </div>
        <Button onClick={retryAll} disabled={retrying} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
          {retrying ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
          Retry All Failed
        </Button>
      </div>
      <QueueTab filterStatus="failed" />
    </div>
  );
}

// ── Scheduled Messages Tab ───────────────────────────────────────────────────
function ScheduledTab() {
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState({ event_type: "payment_due", channel: "whatsapp", recipient: "", customer_name: "", message: "", scheduled_at: "" });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/notification-center/scheduled`, { credentials: "include" });
    if (r.ok) setScheduled((await r.json()).scheduled || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.recipient || !form.message || !form.scheduled_at) {
      toast({ title: "Fill all required fields", variant: "destructive" }); return;
    }
    const r = await fetch(`${API}/api/notification-center/scheduled`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) { toast({ title: "Scheduled!" }); setCreating(false); load(); }
    else toast({ title: "Failed to schedule", variant: "destructive" });
  };

  const cancel = async (id: string) => {
    if (!confirm("Cancel this scheduled message?")) return;
    await fetch(`${API}/api/notification-center/scheduled/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Cancelled" }); load();
  };

  const processNow = async () => {
    setProcessing(true);
    const r = await fetch(`${API}/api/notification-center/process-scheduled`, { method: "POST", credentials: "include" });
    setProcessing(false);
    if (r.ok) { const d = await r.json(); toast({ title: `Processed ${d.processed} – sent ${d.sent}` }); load(); }
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Scheduled Messages</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={processNow} disabled={processing}>
            {processing ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <PlayCircle className="w-4 h-4 mr-1" />}Send Due Now
          </Button>
          <Button onClick={() => setCreating(!creating)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-1" />Schedule Message
          </Button>
        </div>
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 space-y-4">
          <h3 className="font-medium text-gray-800">New Scheduled Message</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={form.event_type} onValueChange={v => setForm(p => ({ ...p, event_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm(p => ({ ...p, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CHANNEL_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recipient Mobile / Email *</Label>
              <Input value={form.recipient} onChange={e => setForm(p => ({ ...p, recipient: e.target.value }))} placeholder="+91 9XXXXXXXXX" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Customer Name</Label>
              <Input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Send At *</Label>
              <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Message *</Label>
              <Textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={4} placeholder="Your message…" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700 text-white">Schedule</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading…</div>
      ) : scheduled.length === 0 ? (
        <div className="text-center bg-white rounded-xl border border-gray-200 py-12">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No scheduled messages. Set up reminders, follow-ups, and more.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Event</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Channel</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Recipient</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Scheduled At</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scheduled.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{EVENT_LABELS[s.event_type] || s.event_type}</td>
                  <td className="px-3 py-2"><ChannelBadge channel={s.channel} /></td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{s.recipient}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{formatTS(s.scheduled_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || "bg-gray-100 text-gray-600"}`}>{s.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {s.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-500" onClick={() => cancel(s.id)}>
                        <X className="w-3 h-3 mr-1" />Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Channel Info Tab (WhatsApp / SMS / RCS / Email / Push) ───────────────────
function ChannelInfoTab({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta?.icon || Bell;

  const info: Record<string, { provider: string; status: string; statusColor: string; notes: string[] }> = {
    whatsapp: {
      provider: "BotBee WhatsApp API", status: "Active", statusColor: "text-green-600 bg-green-50",
      notes: [
        "Session-based messaging via BotBee",
        "Template messages supported via sendWhatsAppTemplate()",
        "Configured via BOTBEE_API_KEY, BOTBEE_BUSINESS_ID, BOTBEE_PHONE_NUMBER_ID",
        "24-hour window for session messages",
        "Supports text, media, and rich cards",
      ],
    },
    sms: {
      provider: "Fast2SMS DLT Gateway", status: "Active", statusColor: "text-green-600 bg-green-50",
      notes: [
        "DLT-registered templates only for transactional SMS",
        "Sender ID: ALBURH",
        "Configured via FAST2SMS_API_KEY",
        "OTP fallback to quick route if DLT fails",
        "Supports 160-char SMS and long messages",
      ],
    },
    rcs: {
      provider: "Lemin AI RCS API", status: "Configured", statusColor: "text-amber-600 bg-amber-50",
      notes: [
        "Rich Communication Services via Lemin AI",
        "Supports rich cards, carousels, and quick replies",
        "Requires recipient device to support RCS",
        "Falls back to SMS on unsupported devices",
        "Configure LEMIN_API_URL, LEMIN_USER_ID, LEMIN_TEMPLATE_ID",
      ],
    },
    email: {
      provider: "SMTP / Nodemailer", status: "Active", statusColor: "text-green-600 bg-green-50",
      notes: [
        "Sends via configured SMTP server",
        "HTML email support",
        "Configure SMTP_HOST, SMTP_USER, SMTP_PASS",
        "From address: noreply@alburhantravels.com",
        "Supports attachments (invoices, receipts)",
      ],
    },
    push: {
      provider: "Firebase Cloud Messaging", status: "Not Configured", statusColor: "text-gray-500 bg-gray-50",
      notes: [
        "Firebase Push Notifications – not yet configured",
        "Requires Firebase project setup and GOOGLE_APPLICATION_CREDENTIALS",
        "Will send to web and mobile app subscribers",
        "Supports rich notifications with images and action buttons",
        "Coming soon – contact developer to enable",
      ],
    },
  };

  const ch = info[channel] || { provider: channel, status: "Unknown", statusColor: "text-gray-500 bg-gray-50", notes: [] };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-12 h-12 rounded-xl ${meta?.bg || "bg-gray-100"} flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${meta?.color || "text-gray-600"}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{meta?.label || channel} Channel</h2>
            <p className="text-sm text-gray-500">{ch.provider}</p>
          </div>
          <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${ch.statusColor}`}>{ch.status}</span>
        </div>
        <div className="space-y-2">
          {ch.notes.map((note, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              {note}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium text-gray-700 mb-3">Recent {meta?.label} Logs</h3>
        <QueueTab filterStatus="" />
      </div>
    </div>
  );
}

// ── Campaigns Tab ────────────────────────────────────────────────────────────
function CampaignsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Campaigns</h2>
          <p className="text-sm text-gray-500">Send bulk messages to groups of customers</p>
        </div>
        <a href="/admin/broadcast" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Megaphone className="w-4 h-4" />Open Broadcast Manager
        </a>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <Megaphone className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
        <h3 className="font-medium text-gray-700 mb-1">Broadcast Campaigns</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
          Use the Broadcast Manager to send bulk WhatsApp, SMS, RCS, and dashboard messages to customers — filter by package, status, or all customers.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto text-xs text-left">
          {["All Customers", "By Package", "Confirmed Bookings", "Pending Payments"].map(g => (
            <div key={g} className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-600">{g}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function CommunicationCenter() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard": return <DashboardTab />;
      case "queue": return <QueueTab />;
      case "settings": return <SettingsTab />;
      case "templates": return <TemplatesTab />;
      case "failed": return <FailedTab />;
      case "scheduled": return <ScheduledTab />;
      case "whatsapp":
      case "sms":
      case "rcs":
      case "email":
      case "push": return <ChannelInfoTab channel={activeTab} />;
      case "campaigns": return <CampaignsTab />;
      default: return <DashboardTab />;
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-emerald-600" />
            Communication Center
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all notifications, channels, templates, and delivery logs</p>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200 scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "bg-white border border-gray-200 border-b-white text-emerald-700 font-medium -mb-px"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div>{renderTab()}</div>
      </div>
    </AdminLayout>
  );
}
