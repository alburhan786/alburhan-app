import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ──────────────────────────────────────────────────────────────────

type Summary = {
  notifications: { total: number; sent: number; failed: number; last_hour: number; today: number; avg_ms: number; success_rate: number };
  queue: { pending: number; sending: number; sent: number; failed: number };
  workflows: { total: number; completed: number; failed: number; today: number };
  events: { total: number; processed: number; failed: number; today: number };
  dlq: { total: number };
};

type QueueItem = {
  id: string; event_type: string; channel: string; customer_name?: string;
  booking_number?: string; booking_id?: string; recipient: string; status: string;
  retry_count: number; last_error?: string; next_retry_at?: string; created_at: string;
};

type HealthCheck = {
  overall: string;
  checks: Record<string, { status: string; ms?: number; provider?: string; wallet?: string; error?: string; pending?: number; events_last_hour?: number; detail?: string }>;
  checked_at: string; total_ms: number;
};

type NotifLog = {
  id: string; event_type: string; channel: string; provider_name?: string;
  customer_name?: string; booking_number?: string; recipient: string;
  status: string; http_status?: number; retry_count: number; error_code?: string;
  sent_at?: string; delivered_at?: string; created_at: string;
};

type CommEvent = {
  id: string; event_type: string; source: string; customer_id?: string;
  booking_id?: string; customer_name?: string; workflow_trigger?: string;
  status: string; error_msg?: string; processed_at?: string; created_at: string;
};

type AnalyticsData = {
  byChannel: any[]; byDay: any[]; byEvent: any[]; byProvider: any[];
};

// ── Helper components ──────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"           ? "bg-green-500" :
    status === "unconfigured" ? "bg-gray-400"  :
    status === "warn"         ? "bg-yellow-500": "bg-red-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

function StatCard({ label, value, sub, color = "blue" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string,string> = {
    blue:   "border-blue-200 bg-blue-50",
    green:  "border-green-200 bg-green-50",
    red:    "border-red-200 bg-red-50",
    yellow: "border-yellow-200 bg-yellow-50",
    purple: "border-purple-200 bg-purple-50",
    gray:   "border-gray-200 bg-white",
  };
  const textColors: Record<string,string> = {
    blue: "text-blue-700", green: "text-green-700", red: "text-red-700",
    yellow: "text-yellow-700", purple: "text-purple-700", gray: "text-gray-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.gray}`}>
      <div className={`text-2xl font-bold ${textColors[color] || textColors.gray}`}>{value}</div>
      <div className="text-xs font-medium text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    whatsapp:  "bg-green-100 text-green-800",
    sms:       "bg-blue-100 text-blue-800",
    email:     "bg-purple-100 text-purple-800",
    push:      "bg-orange-100 text-orange-800",
    rcs:       "bg-pink-100 text-pink-800",
    dashboard: "bg-gray-100 text-gray-700",
  };
  return <Badge className={`text-xs font-mono ${map[channel] || "bg-gray-100 text-gray-600"}`}>{channel}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (["sent","delivered","completed","processed"].includes(status))
    return <Badge className="bg-green-100 text-green-800 border-green-200">✓ {status}</Badge>;
  if (status === "failed" || status === "permanently_failed")
    return <Badge className="bg-red-100 text-red-800 border-red-200">✗ failed</Badge>;
  if (status === "pending")
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">⏳ pending</Badge>;
  if (status === "sending")
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200">📤 sending</Badge>;
  return <Badge className="bg-gray-100 text-gray-600">{status}</Badge>;
}

const TABS = [
  { id: "overview",  label: "📊 Overview"          },
  { id: "queue",     label: "⏳ Live Queue"         },
  { id: "logs",      label: "📋 Delivery Log"       },
  { id: "events",    label: "⚡ Event Log"          },
  { id: "dlq",       label: "💀 Dead Letter Queue"  },
  { id: "health",    label: "🏥 Provider Health"    },
  { id: "analytics", label: "📈 Analytics"          },
  { id: "report",    label: "🔍 Audit Report"       },
];

const KNOWN_EVENTS = [
  "BOOKING_CREATED","BOOKING_APPROVED","BOOKING_REJECTED","PAYMENT_RECEIVED",
  "PAYMENT_REMINDER","DOCUMENT_UPLOADED","JOURNEY_STATUS_UPDATED",
  "AGREEMENT_READY","DEPARTURE_REMINDER","ADMIN_ALERT","SUPPORT_TICKET_CREATED",
];

// ── Main page ──────────────────────────────────────────────────────────────

export default function CommsCenterNew() {
  const { can, isSuper } = usePermissions();
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState<Summary | null>(null);

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueFilter, setQueueFilter] = useState("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [queueEventType, setQueueEventType] = useState("");
  const [queueChannel, setQueueChannel] = useState("");

  // Logs state
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logSearch, setLogSearch] = useState("");
  const [logChannel, setLogChannel] = useState("");
  const [logStatus, setLogStatus] = useState("");

  // Events (event bus log)
  const [events, setEvents] = useState<CommEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsSearch, setEventsSearch] = useState("");
  const [eventsStatus, setEventsStatus] = useState("");

  // DLQ / Health / Analytics / Report
  const [dlq, setDlq] = useState<QueueItem[]>([]);
  const [dlqTotal, setDlqTotal] = useState(0);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [report, setReport] = useState<any>(null);

  // Fire-test state
  const [testEventType, setTestEventType] = useState("BOOKING_CREATED");
  const [testBookingId, setTestBookingId] = useState("");
  const [testFiring, setTestFiring] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<any>(null);

  const setLoad = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));

  const loadSummary = useCallback(async () => {
    const r = await fetch(`${API}/api/comms/summary`, { credentials: "include" });
    if (r.ok) setSummary(await r.json());
  }, []);

  const loadQueue = useCallback(async (
    status = queueFilter,
    search = queueSearch,
    eventType = queueEventType,
    channel = queueChannel,
  ) => {
    setLoad("queue", true);
    const params = new URLSearchParams({ limit: "50" });
    if (status !== "all") params.set("status", status);
    if (search)     params.set("search",     search);
    if (eventType)  params.set("event_type", eventType);
    if (channel)    params.set("channel",    channel);
    const r = await fetch(`${API}/api/comms/queue?${params}`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); setQueue(d.items || []); setQueueTotal(d.total || 0); }
    setLoad("queue", false);
  }, [queueFilter, queueSearch, queueEventType, queueChannel]);

  const loadLogs = useCallback(async () => {
    setLoad("logs", true);
    const params = new URLSearchParams({ limit: "50" });
    if (logSearch)  params.set("search",  logSearch);
    if (logChannel) params.set("channel", logChannel);
    if (logStatus)  params.set("status",  logStatus);
    const r = await fetch(`${API}/api/comms/notification-logs?${params}`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); setLogs(d.logs || []); setLogsTotal(d.total || 0); }
    setLoad("logs", false);
  }, [logSearch, logChannel, logStatus]);

  const loadEvents = useCallback(async () => {
    setLoad("events", true);
    const params = new URLSearchParams({ limit: "50" });
    if (eventsSearch) params.set("type",   eventsSearch);
    if (eventsStatus) params.set("status", eventsStatus);
    const r = await fetch(`${API}/api/comms/events?${params}`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); setEvents(d.events || []); setEventsTotal(d.total || 0); }
    setLoad("events", false);
  }, [eventsSearch, eventsStatus]);

  const loadDlq = useCallback(async () => {
    setLoad("dlq", true);
    const r = await fetch(`${API}/api/comms/dlq?limit=50`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); setDlq(d.items || []); setDlqTotal(d.total || 0); }
    setLoad("dlq", false);
  }, []);

  const loadHealth = useCallback(async () => {
    setLoad("health", true);
    const r = await fetch(`${API}/api/comms/health`, { credentials: "include" });
    if (r.ok) setHealth(await r.json());
    setLoad("health", false);
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoad("analytics", true);
    const r = await fetch(`${API}/api/comms/analytics?days=30`, { credentials: "include" });
    if (r.ok) setAnalytics(await r.json());
    setLoad("analytics", false);
  }, []);

  const loadReport = useCallback(async () => {
    setLoad("report", true);
    const r = await fetch(`${API}/api/comms/production-report`, { credentials: "include" });
    if (r.ok) setReport(await r.json());
    setLoad("report", false);
  }, []);

  const exportLogs = () => {
    const params = new URLSearchParams();
    if (logSearch)  params.set("search",  logSearch);
    if (logChannel) params.set("channel", logChannel);
    if (logStatus)  params.set("status",  logStatus);
    window.open(`${API}/api/comms/notification-logs/export?${params}`, "_blank");
  };

  const fireTestEvent = async () => {
    setTestFiring(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/api/comms/test-event`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: testEventType,
          source: "admin_test_panel",
          ctx: testBookingId ? { bookingId: testBookingId } : {},
        }),
      });
      const d = await r.json();
      setTestResult(d);
      if (d.ok) {
        toast({ title: "✅ Test event fired", description: `Event ID: ${d.eventId || "—"}` });
        loadSummary();
      } else {
        toast({ title: "❌ Test event failed", description: d.error, variant: "destructive" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
      toast({ title: "❌ Error", description: e.message, variant: "destructive" });
    }
    setTestFiring(false);
  };

  // Load data when tab changes
  useEffect(() => {
    loadSummary();
    if (tab === "queue")     loadQueue();
    if (tab === "logs")      loadLogs();
    if (tab === "events")    loadEvents();
    if (tab === "dlq")       loadDlq();
    if (tab === "health")    loadHealth();
    if (tab === "analytics") loadAnalytics();
    if (tab === "report")    loadReport();
  }, [tab]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        loadSummary();
        if (tab === "queue")  loadQueue();
        if (tab === "events") loadEvents();
      }, 8000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, tab, loadSummary, loadQueue, loadEvents]);

  const retryDlq = async (id: string) => {
    const r = await fetch(`${API}/api/comms/dlq/${id}/retry`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Re-queued for retry" }); loadDlq(); loadSummary(); }
    else toast({ title: "Retry failed", variant: "destructive" });
  };

  const forceSendDlq = async (id: string) => {
    const r = await fetch(`${API}/api/comms/dlq/${id}/force-send`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Force sent" }); loadDlq(); }
    else toast({ title: "Force send failed", variant: "destructive" });
  };

  const dismissDlq = async (id: string) => {
    await fetch(`${API}/api/comms/dlq/${id}`, { method: "DELETE", credentials: "include" });
    loadDlq(); loadSummary();
  };

  if (!isSuper && !can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  const s = summary;

  return (
    <AdminLayout>
      <div className="p-5 max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Communication & Automation Center</h1>
            <p className="text-gray-500 text-sm mt-0.5">Central hub — every WhatsApp, SMS, Email, Push and notification flows through here</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
              Live (8s)
            </label>
            <Button onClick={() => { loadSummary(); if (tab === "queue") loadQueue(); if (tab === "logs") loadLogs(); if (tab === "events") loadEvents(); }}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-2">🔄</Button>
          </div>
        </div>

        {/* Summary stats */}
        {s && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Today's Messages"  value={s.notifications.today}        color="blue" />
            <StatCard label="Delivered"         value={`${s.notifications.success_rate}%`} sub="success rate" color="green" />
            <StatCard label="Failed"            value={s.notifications.failed}       color={s.notifications.failed > 0 ? "red" : "gray"} />
            <StatCard label="Queue Pending"     value={s.queue.pending}              color={s.queue.pending > 50 ? "red" : s.queue.pending > 10 ? "yellow" : "gray"} />
            <StatCard label="Dead Letter"       value={s.dlq.total}                  color={s.dlq.total > 0 ? "red" : "gray"} />
            <StatCard label="Avg Delivery"      value={s.notifications.avg_ms > 0 ? `${s.notifications.avg_ms}ms` : "—"} color="purple" />
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}>
                {t.label}
                {t.id === "dlq" && s && s.dlq.total > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{s.dlq.total}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab: Overview ── */}
        {tab === "overview" && s && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Notification stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><span>🔔</span> Notifications (7d)</h3>
              {[
                ["Total sent",   s.notifications.total,         ""],
                ["Delivered",    s.notifications.sent,          "text-green-700"],
                ["Failed",       s.notifications.failed,        "text-red-600"],
                ["Last hour",    s.notifications.last_hour,     ""],
                ["Avg delivery", `${s.notifications.avg_ms}ms`, ""],
                ["Success rate", `${s.notifications.success_rate}%`, s.notifications.success_rate >= 90 ? "text-green-700" : "text-red-600"],
              ].map(([l, v, c]) => (
                <div key={String(l)} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{l}</span>
                  <span className={`font-semibold text-gray-800 ${c}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Queue stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><span>📬</span> Queue Status</h3>
              {[
                ["Pending",      s.queue.pending, s.queue.pending > 100 ? "text-red-600" : s.queue.pending > 20 ? "text-yellow-600" : "text-green-700"],
                ["Sending",      s.queue.sending, ""],
                ["Delivered",    s.queue.sent,    "text-green-700"],
                ["Failed (DLQ)", s.queue.failed,  s.queue.failed > 0 ? "text-red-600" : "text-green-700"],
              ].map(([l, v, c]) => (
                <div key={String(l)} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{l}</span>
                  <span className={`font-semibold ${c}`}>{v}</span>
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">Retry schedule: 1m → 5m → 15m → 1h → 24h</p>
              </div>
            </div>

            {/* Workflow stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><span>⚙️</span> Workflow Engine (7d)</h3>
              {[
                ["Total executions", s.workflows.total,     ""],
                ["Completed",        s.workflows.completed, "text-green-700"],
                ["Failed",           s.workflows.failed,    s.workflows.failed > 0 ? "text-red-600" : "text-green-700"],
                ["Today",            s.workflows.today,     ""],
                ["Events published", s.events.total,        ""],
                ["Events failed",    s.events.failed,       s.events.failed > 0 ? "text-orange-600" : "text-green-700"],
              ].map(([l, v, c]) => (
                <div key={String(l)} className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{l}</span>
                  <span className={`font-semibold ${c}`}>{v}</span>
                </div>
              ))}
            </div>

            {/* Fire Test Event panel */}
            <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2"><span>🔬</span> Fire Test Event</h3>
              <p className="text-xs text-gray-400 mb-3">Send a test event through the full pipeline to verify the communication engine end-to-end.</p>
              <div className="space-y-2">
                <select
                  value={testEventType}
                  onChange={e => setTestEventType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {KNOWN_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <Input
                  value={testBookingId}
                  onChange={e => setTestBookingId(e.target.value)}
                  placeholder="Booking ID (optional)"
                  className="text-sm"
                />
                <Button
                  onClick={fireTestEvent}
                  disabled={testFiring}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >
                  {testFiring ? "Firing..." : "⚡ Fire Test Event"}
                </Button>
              </div>
              {testResult && (
                <div className={`mt-3 rounded-lg p-3 text-xs font-mono ${testResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
                  {testResult.ok
                    ? `✅ Published — eventId: ${testResult.eventId || "—"}`
                    : `❌ Error: ${testResult.error || "Unknown"}`}
                </div>
              )}
            </div>

            {/* Architecture diagram */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-gray-700 p-5 text-white col-span-full lg:col-span-2">
              <h3 className="font-semibold mb-3 text-sm opacity-80 uppercase tracking-wider">Communication Flow</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {["ERP Modules", "→", "Event Bus", "→", "Workflow Engine", "→", "Notification Engine", "→", "Provider Manager", "→", "Queue", "→", "Retry (1m/5m/15m/1h/24h)"].map((item, i) => (
                  <span key={i} className={item === "→" ? "text-blue-400 font-bold text-base" : "bg-gray-700 px-2.5 py-1 rounded-lg font-medium"}>{item}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs">
                {["WhatsApp (BotBee)", "SMS (Fast2SMS)", "Email (SMTP)", "Push (Web)", "Dashboard", "DLQ"].map(p => (
                  <span key={p} className="bg-blue-900/50 border border-blue-700 px-2 py-0.5 rounded-md">{p}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Live Queue ── */}
        {tab === "queue" && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex flex-wrap gap-2 items-center">
              <div className="flex gap-1">
                {["all","pending","sending","sent","failed"].map(f => (
                  <button key={f} onClick={() => { setQueueFilter(f); loadQueue(f, queueSearch, queueEventType, queueChannel); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      queueFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
              <div className="h-5 w-px bg-gray-200" />
              <Input
                value={queueSearch}
                onChange={e => setQueueSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadQueue(queueFilter, queueSearch, queueEventType, queueChannel)}
                placeholder="Booking ID / customer / mobile..."
                className="w-52 text-sm h-8"
              />
              <select
                value={queueEventType}
                onChange={e => setQueueEventType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-8"
              >
                <option value="">All Events</option>
                {KNOWN_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <select
                value={queueChannel}
                onChange={e => setQueueChannel(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-8"
              >
                <option value="">All Channels</option>
                {["whatsapp","sms","email","push","rcs"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button
                onClick={() => loadQueue(queueFilter, queueSearch, queueEventType, queueChannel)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 h-8"
              >Search</Button>
              <span className="ml-auto text-sm text-gray-400 self-center">{queueTotal} items</span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {loading.queue ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : queue.length === 0 ? (
                <div className="p-10 text-center"><div className="text-3xl mb-2">✅</div><div className="text-gray-500">Queue is empty</div></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Event</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Channel</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Recipient</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Booking</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Retries</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Next Retry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {queue.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(item.created_at).toLocaleTimeString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-gray-700">{item.event_type}</div>
                          {item.customer_name && <div className="text-xs text-gray-400">{item.customer_name}</div>}
                        </td>
                        <td className="px-4 py-3"><ChannelBadge channel={item.channel} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-mono">{item.recipient}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{item.booking_number || item.booking_id?.slice(0,8) || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                        <td className="px-4 py-3 text-xs text-center text-gray-500">{item.retry_count}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {item.next_retry_at ? new Date(item.next_retry_at).toLocaleTimeString("en-IN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Delivery Log ── */}
        {tab === "logs" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              <Input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Search customer, mobile, booking..." className="w-56 text-sm" />
              <select value={logChannel} onChange={e => setLogChannel(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">All Channels</option>
                {["whatsapp","sms","email","push","rcs","dashboard"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={logStatus} onChange={e => setLogStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">All Statuses</option>
                {["sent","failed","pending"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button onClick={loadLogs} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5">Search</Button>
              <Button onClick={exportLogs} className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5">⬇️ Export CSV</Button>
              <span className="text-sm text-gray-400 ml-auto">{logsTotal} total</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {loading.logs ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="p-10 text-center text-gray-500">No logs found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Event</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Channel</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Provider</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">HTTP</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Retries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {logs.map(log => (
                      <tr key={log.id} className={`hover:bg-gray-50 ${log.status === "failed" ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString("en-IN", { hour12: false })}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.event_type}</td>
                        <td className="px-4 py-3"><ChannelBadge channel={log.channel} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{log.provider_name || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-gray-700">{log.customer_name || log.recipient}</div>
                          {log.booking_number && <div className="text-xs text-gray-400">{log.booking_number}</div>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{log.http_status || "—"}</td>
                        <td className="px-4 py-3 text-xs text-center text-gray-500">{log.retry_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Event Log ── */}
        {tab === "events" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={eventsSearch}
                onChange={e => setEventsSearch(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">All Event Types</option>
                {KNOWN_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <select
                value={eventsStatus}
                onChange={e => setEventsStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">All Statuses</option>
                {["pending","processing","processed","failed"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button onClick={loadEvents} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5">Search</Button>
              <span className="text-sm text-gray-400 ml-auto">{eventsTotal} events</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {loading.events ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : events.length === 0 ? (
                <div className="p-10 text-center text-gray-500">No events yet — fire a test event to see data here</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Event Type</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Source</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Workflow Triggered</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {events.map(ev => (
                      <tr key={ev.id} className={`hover:bg-gray-50 ${ev.status === "failed" ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(ev.created_at).toLocaleString("en-IN", { hour12: false })}</td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{ev.event_type}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{ev.source}</td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-700">{ev.customer_name || "—"}</div>
                          {ev.booking_id && <div className="text-xs text-gray-400 font-mono">{ev.booking_id.slice(0,8)}…</div>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{ev.workflow_trigger || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                        <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">{ev.error_msg || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Dead Letter Queue ── */}
        {tab === "dlq" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Dead Letter Queue</h2>
                <p className="text-xs text-gray-500 mt-0.5">Messages that exhausted all 5 retries (1m→5m→15m→1h→24h). Retry to re-queue, Force to bypass limits, or Dismiss.</p>
              </div>
              <span className="text-sm text-gray-400">{dlqTotal} items</span>
            </div>
            {loading.dlq ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : dlq.length === 0 ? (
              <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-gray-600 font-medium">Dead letter queue is empty</div>
                <div className="text-gray-400 text-sm mt-1">All messages delivered successfully</div>
              </div>
            ) : (
              <div className="space-y-2">
                {dlq.map(item => (
                  <div key={item.id} className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ChannelBadge channel={item.channel} />
                          <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{item.event_type}</span>
                          {item.customer_name && <span className="text-sm font-medium text-gray-800">{item.customer_name}</span>}
                          {item.booking_number && <span className="text-xs text-gray-500">{item.booking_number}</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          📱 {item.recipient} · {item.retry_count} retries · {new Date(item.created_at).toLocaleString("en-IN")}
                        </div>
                        {item.last_error && (
                          <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mt-1.5 font-mono">{item.last_error.slice(0, 200)}</div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button onClick={() => retryDlq(item.id)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">🔄 Retry</Button>
                        <Button onClick={() => forceSendDlq(item.id)} className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1.5 rounded-lg">⚡ Force</Button>
                        <Button onClick={() => dismissDlq(item.id)} className="bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 text-xs px-3 py-1.5 rounded-lg">✕</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Provider Health ── */}
        {tab === "health" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Provider Health Monitor</h2>
                <p className="text-xs text-gray-500 mt-0.5">Real API health checks — actual pings to BotBee, Fast2SMS, SMTP, DB, Queue</p>
              </div>
              <Button onClick={loadHealth} disabled={loading.health} className="bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2">
                {loading.health ? "Checking..." : "🔄 Re-check All"}
              </Button>
            </div>
            {health && (
              <>
                <div className={`rounded-xl border-2 p-4 font-semibold text-center ${
                  health.overall === "ok" ? "border-green-300 bg-green-50 text-green-800" : "border-yellow-300 bg-yellow-50 text-yellow-800"
                }`}>
                  {health.overall === "ok" ? "✅ All Systems Operational" : "⚠️ Some Providers Degraded"} · Checked in {health.total_ms}ms
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(health.checks).map(([key, check]) => (
                    <div key={key} className={`bg-white rounded-xl border p-4 shadow-sm ${
                      check.status === "ok"           ? "border-green-200"  :
                      check.status === "unconfigured" ? "border-gray-200"   :
                      check.status === "warn"         ? "border-yellow-200" : "border-red-200"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800 text-sm capitalize">{key.replace(/_/g, " ")}</span>
                        <StatusDot status={check.status} />
                      </div>
                      {check.provider            && <div className="text-xs text-gray-500">Provider: {check.provider}</div>}
                      {check.ms !== undefined    && <div className="text-xs text-gray-400">Response: {check.ms}ms</div>}
                      {check.wallet              && <div className="text-xs text-green-700 font-medium">Wallet: {check.wallet}</div>}
                      {check.pending !== undefined && <div className="text-xs text-gray-500">Pending: {check.pending}</div>}
                      {check.events_last_hour !== undefined && <div className="text-xs text-gray-500">Events/hr: {check.events_last_hour}</div>}
                      {check.detail              && <div className="text-xs text-gray-500">{check.detail}</div>}
                      {check.error               && <div className="text-xs text-red-600 mt-1 font-mono">{check.error}</div>}
                      <div className={`text-xs font-semibold mt-2 ${
                        check.status === "ok"           ? "text-green-700"  :
                        check.status === "unconfigured" ? "text-gray-400"   :
                        check.status === "warn"         ? "text-yellow-700" : "text-red-700"
                      }`}>
                        {check.status === "ok"           ? "✓ Healthy"         :
                         check.status === "unconfigured" ? "— Not configured"  :
                         check.status === "warn"         ? "⚠ Warning"         : "✗ Error"}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400 text-right">Last checked: {new Date(health.checked_at).toLocaleString("en-IN")}</div>
              </>
            )}
            {!health && !loading.health && (
              <div className="p-8 text-center text-gray-400">Click "Re-check All" to run health checks</div>
            )}
          </div>
        )}

        {/* ── Tab: Analytics ── */}
        {tab === "analytics" && (
          <div className="space-y-4">
            {loading.analytics ? (
              <div className="p-8 text-center text-gray-400">Loading analytics...</div>
            ) : analytics ? (
              <>
                {/* By Channel */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">By Channel (30 days)</h3>
                  <div className="space-y-3">
                    {analytics.byChannel.map(ch => (
                      <div key={ch.channel}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <ChannelBadge channel={ch.channel} />
                            <span className="text-sm text-gray-600">{ch.total} total</span>
                          </div>
                          <span className={`text-sm font-semibold ${ch.success_rate >= 90 ? "text-green-700" : ch.success_rate >= 70 ? "text-yellow-700" : "text-red-600"}`}>
                            {ch.success_rate}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className={`h-2 rounded-full ${ch.success_rate >= 90 ? "bg-green-500" : ch.success_rate >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${ch.success_rate}%` }} />
                        </div>
                        <div className="flex text-xs text-gray-400 mt-0.5 gap-3">
                          <span className="text-green-600">✓ {ch.sent} sent</span>
                          <span className="text-red-600">✗ {ch.failed} failed</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Provider */}
                {analytics.byProvider.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-4">Provider Performance (30 days)</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-gray-100">
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Provider</th>
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Total</th>
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Sent</th>
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Failed</th>
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Avg ms</th>
                          <th className="pb-2 text-xs text-gray-500 font-semibold uppercase">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {analytics.byProvider.map(p => {
                          const rate = p.total > 0 ? Math.round(p.sent / p.total * 100) : 0;
                          return (
                            <tr key={p.provider_name} className="hover:bg-gray-50">
                              <td className="py-2.5 font-medium text-gray-800">{p.provider_name || "Unknown"}</td>
                              <td className="py-2.5 text-gray-600">{p.total}</td>
                              <td className="py-2.5 text-green-700">{p.sent}</td>
                              <td className="py-2.5 text-red-600">{p.failed}</td>
                              <td className="py-2.5 text-gray-500">{p.avg_ms || "—"}</td>
                              <td className="py-2.5">
                                <span className={`font-semibold ${rate >= 90 ? "text-green-700" : rate >= 70 ? "text-yellow-700" : "text-red-600"}`}>{rate}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* By Event Type */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">Top Event Types (30 days)</h3>
                  <div className="space-y-2">
                    {analytics.byEvent.slice(0, 10).map(e => {
                      const pct = analytics.byEvent[0]?.total > 0 ? Math.round(e.total / analytics.byEvent[0].total * 100) : 0;
                      return (
                        <div key={e.event_type} className="flex items-center gap-3">
                          <span className="font-mono text-xs text-gray-600 w-44 truncate">{e.event_type}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{e.total}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Daily trend */}
                {analytics.byDay.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-4">Daily Volume (30 days)</h3>
                    <div className="flex items-end gap-1 h-24">
                      {analytics.byDay.slice(-30).map((day, i) => {
                        const max = Math.max(...analytics.byDay.map(d => d.total), 1);
                        const pct = Math.max(4, Math.round(day.total / max * 100));
                        const rate = day.total > 0 ? Math.round(day.sent / day.total * 100) : 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.day}: ${day.total} (${rate}% ok)`}>
                            <div className="w-full rounded-t transition-all"
                              style={{ height: `${pct}%`, background: rate >= 90 ? "#22c55e" : rate >= 70 ? "#f59e0b" : "#ef4444" }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{analytics.byDay[0]?.day}</span>
                      <span>{analytics.byDay[analytics.byDay.length-1]?.day}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-gray-400">No analytics data yet</div>
            )}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
