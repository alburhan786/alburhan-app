import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Wifi, WifiOff, CheckCircle2, XCircle, AlertTriangle, Clock,
  RotateCcw, Send, Zap, BarChart2, List, Globe, TestTube2, Loader2,
  MessageSquare, Bell, Mail, Smartphone, ChevronRight, Eye, Copy,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface ConnStatus { ok: boolean; connected: boolean; latencyMs?: number; httpStatus?: number; error?: string; baseUrl?: string }
interface TemplateStats { approved: number; pending: number; rejected: number; disabled: number; total: number; lastSync?: string }
interface DeliveryLog {
  id: string; event_type: string; recipient: string; message?: string; status: string;
  sent_at: string; retry_count: number; error_code?: string; provider_name?: string;
  http_status?: number; provider_response?: any;
}
interface Analytics { totals: { sent: string; failed: string; pending: string; total: string }; byEvent: any[]; recentFailed: DeliveryLog[] }
interface RetryItem { id: string; event_type: string; recipient: string; message?: string; sent_at: string; retry_count: number; error_code?: string }
interface TestStep { step: string; status: "pass" | "fail" | "skip"; detail?: string }
interface TestResult { ok: boolean; steps: TestStep[]; summary: { passed: number; failed: number; skipped: number } }

type Tab = "overview" | "logs" | "templates" | "retry" | "test";

function StatusDot({ ok, pulse }: { ok: boolean | null; pulse?: boolean }) {
  if (ok === null) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" />;
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"} ${pulse && ok ? "animate-pulse" : ""}`} />
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cfg: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-700",
    delivered: "bg-blue-100 text-blue-700",
    read: "bg-purple-100 text-purple-700",
    failed: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
    received: "bg-gray-100 text-gray-600",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cfg[s] || "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function TemplateBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  const cfg: Record<string, string> = {
    APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-100 text-amber-700 border-amber-200",
    REJECTED: "bg-red-100 text-red-700 border-red-200",
    DISABLED: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cfg[s] || "bg-gray-100 text-gray-600"}`}>{s}</span>;
}

export default function BotBeeDashboard() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [connStatus, setConnStatus] = useState<ConnStatus | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateStats, setTemplateStats] = useState<TemplateStats | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logFilter, setLogFilter] = useState({ status: "", event: "", search: "" });
  const [retryQueue, setRetryQueue] = useState<RetryItem[]>([]);
  const [loadingRetry, setLoadingRetry] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [testMobile, setTestMobile] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [runningTest, setRunningTest] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const testConnection = useCallback(async () => {
    setTestingConn(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/connection-test`, { method: "POST", credentials: "include" });
      const data = await r.json();
      setConnStatus(data);
    } catch { setConnStatus({ ok: false, connected: false, error: "Network error" }); }
    setTestingConn(false);
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/analytics`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setAnalytics(data);
    } catch { }
    setLoadingAnalytics(false);
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/templates`, { credentials: "include" });
      const data = await r.json();
      if (data.ok && data.templates) {
        setTemplates(data.templates);
        const stats = data.templates.reduce((acc: any, t: any) => {
          const s = (t.status || "").toUpperCase();
          acc[s] = (acc[s] || 0) + 1;
          acc.total = (acc.total || 0) + 1;
          return acc;
        }, { approved: 0, pending: 0, rejected: 0, disabled: 0, total: 0 });
        stats.approved = stats.APPROVED || 0;
        stats.pending = stats.PENDING || 0;
        stats.rejected = stats.REJECTED || 0;
        stats.disabled = stats.DISABLED || 0;
        stats.lastSync = new Date().toLocaleTimeString("en-IN");
        setTemplateStats(stats);
      }
    } catch { }
    setLoadingTemplates(false);
  }, []);

  const loadLogs = useCallback(async (page = 1) => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (logFilter.status) params.set("status", logFilter.status);
      if (logFilter.event) params.set("event", logFilter.event);
      if (logFilter.search) params.set("search", logFilter.search);
      const r = await fetch(`${API}/api/whatsapp/delivery-logs?${params}`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) { setLogs(data.logs); setLogTotal(data.total); setLogPage(page); }
    } catch { }
    setLoadingLogs(false);
  }, [logFilter]);

  const loadRetryQueue = useCallback(async () => {
    setLoadingRetry(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry-queue`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setRetryQueue(data.queue);
    } catch { }
    setLoadingRetry(false);
  }, []);

  const syncTemplates = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/sync`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "Templates synced", description: `${data.liveCount} templates from BotBee, ${data.synced} updated locally.` });
        loadTemplates();
      } else {
        toast({ title: "Sync failed", description: data.message, variant: "destructive" });
      }
    } catch (err: any) { toast({ title: "Sync error", description: err.message, variant: "destructive" }); }
    setSyncing(false);
  };

  const retrySingle = async (logId: string) => {
    setRetryingId(logId);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry/${logId}`, { method: "POST", credentials: "include" });
      const data = await r.json();
      toast({ title: data.ok ? "Retried successfully" : "Retry failed", description: data.errorMessage || (data.ok ? "Message sent" : ""), variant: data.ok ? "default" : "destructive" });
      loadRetryQueue();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setRetryingId(null);
  };

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry-all`, { method: "POST", credentials: "include" });
      const data = await r.json();
      toast({ title: "Retry complete", description: `${data.succeeded}/${data.retried} succeeded` });
      loadRetryQueue();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setRetryingAll(false);
  };

  const runAutomationTest = async () => {
    if (!testMobile.trim()) { toast({ title: "Enter a mobile number", variant: "destructive" }); return; }
    setRunningTest(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/whatsapp/automation-test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: testMobile.trim(), email: testEmail.trim() || undefined }),
      });
      const data = await r.json();
      setTestResult(data);
    } catch (err: any) { toast({ title: "Test error", description: err.message, variant: "destructive" }); }
    setRunningTest(false);
  };

  // Load on tab change
  useEffect(() => {
    if (activeTab === "overview") { testConnection(); loadAnalytics(); }
    if (activeTab === "logs") loadLogs(1);
    if (activeTab === "templates") loadTemplates();
    if (activeTab === "retry") loadRetryQueue();
  }, [activeTab]);

  useEffect(() => { if (activeTab === "logs") loadLogs(1); }, [logFilter]);

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "logs", label: "Delivery Logs", icon: List },
    { id: "templates", label: "Templates", icon: Globe },
    { id: "retry", label: "Retry Queue", icon: RotateCcw },
    { id: "test", label: "Test Mode", icon: TestTube2 },
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare size={20} className="text-emerald-700" />
              BotBee WhatsApp Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Live BotBee API monitoring, delivery logs, templates & automation</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${connStatus === null ? "bg-gray-50 border-gray-200 text-gray-500" : connStatus.connected ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              <StatusDot ok={connStatus ? connStatus.connected : null} pulse />
              {connStatus === null ? "Checking..." : connStatus.connected ? `🟢 Connected${connStatus.latencyMs ? ` (${connStatus.latencyMs}ms)` : ""}` : "🔴 Disconnected"}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={testConnection} disabled={testingConn}>
              {testingConn ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
              Test Connection
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-0">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t border-b-2 transition-colors ${activeTab === tab.id ? "border-emerald-700 text-emerald-800 bg-emerald-50" : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                <Icon size={13} />{tab.label}
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Status cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Sent", value: analytics?.totals?.sent || "—", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Failed", value: analytics?.totals?.failed || "—", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
                { label: "Pending", value: analytics?.totals?.pending || "—", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Total", value: analytics?.totals?.total || "—", icon: BarChart2, color: "text-blue-600", bg: "bg-blue-50" },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{card.label}</span>
                    <card.icon size={16} className={card.color} />
                  </div>
                  <p className={`text-2xl font-bold ${card.color}`}>{loadingAnalytics ? "…" : card.value}</p>
                </div>
              ))}
            </div>

            {/* By event + connection info */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Event breakdown */}
              <div className="border rounded-xl p-4">
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><Zap size={12} />Events Breakdown</h3>
                {loadingAnalytics ? <p className="text-xs text-muted-foreground">Loading…</p> : (
                  <div className="space-y-1.5">
                    {(analytics?.byEvent || []).slice(0, 10).map((e: any) => (
                      <div key={e.event_type} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-gray-700">{e.event_type.replace(/_/g, " ")}</span>
                        <span className="text-emerald-600 font-semibold">{e.sent}✓</span>
                        {parseInt(e.failed) > 0 && <span className="text-red-500">{e.failed}✗</span>}
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (parseInt(e.sent) / parseInt(e.total)) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    {!analytics?.byEvent?.length && <p className="text-xs text-muted-foreground italic">No data yet</p>}
                  </div>
                )}
              </div>

              {/* Connection details + webhook info */}
              <div className="border rounded-xl p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><Wifi size={12} />Connection Details</h3>
                  {connStatus ? (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={connStatus.connected ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{connStatus.connected ? "🟢 Connected" : "🔴 Disconnected"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Latency</span><span>{connStatus.latencyMs ? `${connStatus.latencyMs}ms` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">HTTP Status</span><span>{connStatus.httpStatus || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Base URL</span><span className="font-mono text-[10px] truncate max-w-[200px]">{connStatus.baseUrl || "—"}</span></div>
                      {connStatus.error && <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">{connStatus.error}</div>}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Testing connection…</p>}
                </div>
                <div className="border-t pt-3">
                  <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><Globe size={12} />Webhook Endpoints</h3>
                  {[
                    { label: "BotBee Webhook", path: "/api/webhook/botbee" },
                    { label: "WhatsApp DLR", path: "/api/webhook/whatsapp-dlr" },
                    { label: "SMS DLR", path: "/api/webhook/sms-dlr" },
                    { label: "RCS DLR", path: "/api/webhook/rcs" },
                  ].map(w => (
                    <div key={w.path} className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-600">{w.label}</span>
                      <div className="flex items-center gap-1">
                        <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">{w.path}</code>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(`https://alburhantravels.com${w.path}`); toast({ title: "Copied!" }); }}>
                          <Copy size={10} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent failed */}
            {(analytics?.recentFailed || []).length > 0 && (
              <div className="border rounded-xl p-4">
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-500" />Recent Failed Messages</h3>
                <div className="space-y-1.5">
                  {(analytics?.recentFailed || []).slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center gap-3 text-xs border rounded-lg px-3 py-2 bg-red-50">
                      <XCircle size={13} className="text-red-500 shrink-0" />
                      <span className="text-gray-600 shrink-0">{log.recipient}</span>
                      <span className="flex-1 truncate text-gray-700">{log.event_type.replace(/_/g, " ")}</span>
                      <span className="text-gray-400 shrink-0">{new Date(log.sent_at).toLocaleDateString("en-IN")}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 shrink-0" onClick={() => retrySingle(log.id)} disabled={retryingId === log.id}>
                        {retryingId === log.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                      </Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-3 text-xs h-7" onClick={() => setActiveTab("logs")}>
                  View all logs <ChevronRight size={11} />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── DELIVERY LOGS ── */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <input type="text" placeholder="Search recipient or message…" value={logFilter.search}
                onChange={e => setLogFilter(f => ({ ...f, search: e.target.value }))}
                className="h-8 text-xs border rounded-md px-3 flex-1 min-w-[160px]" />
              <select value={logFilter.status} onChange={e => setLogFilter(f => ({ ...f, status: e.target.value }))}
                className="h-8 text-xs border rounded-md px-2">
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="read">Read</option>
                <option value="failed">Failed</option>
              </select>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => loadLogs(1)} disabled={loadingLogs}>
                <RefreshCw size={12} className={loadingLogs ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {["Event", "Recipient", "Status", "Sent At", "Retries", "Actions"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground"><Loader2 size={16} className="animate-spin inline mr-2" />Loading…</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground italic">No delivery logs found</td></tr>
                  ) : logs.map(log => (
                    <>
                      <tr key={log.id} className={`border-b hover:bg-gray-50 ${expandedLog === log.id ? "bg-blue-50" : ""}`}>
                        <td className="px-3 py-2">
                          <span className="text-gray-700 truncate max-w-[140px] block">{log.event_type.replace(/_/g, " ")}</span>
                          {log.error_code && <span className="text-[10px] text-red-500">{log.error_code}</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-600">{log.recipient}</td>
                        <td className="px-3 py-2"><StatusBadge status={log.status} /></td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(log.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{log.retry_count}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                              <Eye size={11} />
                            </Button>
                            {log.status === "failed" && log.retry_count < 5 && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600" onClick={() => retrySingle(log.id)} disabled={retryingId === log.id}>
                                {retryingId === log.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedLog === log.id && (
                        <tr key={`${log.id}-expand`} className="bg-blue-50 border-b">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid md:grid-cols-2 gap-3 text-[11px]">
                              <div>
                                <p className="font-semibold text-gray-600 mb-1">Message</p>
                                <p className="text-gray-700 break-words">{log.message || "—"}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-600 mb-1">Provider Response</p>
                                <pre className="bg-white border rounded p-2 text-[10px] overflow-auto max-h-24 whitespace-pre-wrap">
                                  {log.provider_response ? JSON.stringify(log.provider_response, null, 2).slice(0, 400) : "—"}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logTotal > 20 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{logTotal} total entries</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={logPage <= 1} onClick={() => loadLogs(logPage - 1)}>Prev</Button>
                  <span>Page {logPage} of {Math.ceil(logTotal / 20)}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={logPage >= Math.ceil(logTotal / 20)} onClick={() => loadLogs(logPage + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES ── */}
        {activeTab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-3">
                {[
                  { label: "Approved", count: templateStats?.approved || 0, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                  { label: "Pending", count: templateStats?.pending || 0, color: "text-amber-600 bg-amber-50 border-amber-200" },
                  { label: "Rejected", count: templateStats?.rejected || 0, color: "text-red-600 bg-red-50 border-red-200" },
                  { label: "Total", count: templateStats?.total || 0, color: "text-blue-600 bg-blue-50 border-blue-200" },
                ].map(s => (
                  <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${s.color}`}>
                    {s.label}: {loadingTemplates ? "…" : s.count}
                  </div>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {templateStats?.lastSync && <span className="text-[10px] text-muted-foreground">Last sync: {templateStats.lastSync}</span>}
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={syncTemplates} disabled={syncing}>
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync Now
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={loadTemplates} disabled={loadingTemplates}>
                  <RefreshCw size={12} className={loadingTemplates ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {["Template Name", "Status", "Category", "Language", "Components"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingTemplates ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground"><Loader2 size={16} className="animate-spin inline mr-2" />Loading templates…</td></tr>
                  ) : templates.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground italic">No templates found. Check your BotBee credentials.</td></tr>
                  ) : templates.map((t, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-gray-800 font-medium">{t.name}</td>
                      <td className="px-3 py-2.5"><TemplateBadge status={t.status} /></td>
                      <td className="px-3 py-2.5 text-gray-500">{t.category}</td>
                      <td className="px-3 py-2.5 text-gray-500">{t.language}</td>
                      <td className="px-3 py-2.5 text-gray-400">{t.components?.length || 0} components</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">Auto-syncs from BotBee every 10 minutes. Webhook URL for BotBee: <code className="bg-gray-100 px-1 rounded">https://alburhantravels.com/api/webhook/botbee</code></p>
          </div>
        )}

        {/* ── RETRY QUEUE ── */}
        {activeTab === "retry" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                {retryQueue.length === 0 ? "No messages in retry queue." : `${retryQueue.length} failed messages ready for retry.`}
                <span className="ml-2 text-[10px]">Retry schedule: 1min → 5min → 30min → 2hr → 6hr (max 5 retries)</span>
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={loadRetryQueue} disabled={loadingRetry}>
                <RefreshCw size={12} className={loadingRetry ? "animate-spin" : ""} /> Refresh
              </Button>
              {retryQueue.length > 0 && (
                <Button size="sm" className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={retryAll} disabled={retryingAll}>
                  {retryingAll ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Retry All ({retryQueue.length})
                </Button>
              )}
            </div>

            {retryQueue.length === 0 && !loadingRetry ? (
              <div className="border rounded-xl p-10 text-center">
                <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">Retry queue is empty</p>
                <p className="text-xs text-gray-400 mt-1">All messages delivered successfully or max retries reached.</p>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {["Event", "Recipient", "Retries", "Failed At", "Error", "Action"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {retryQueue.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-700">{item.event_type.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-600">{item.recipient}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">{item.retry_count}/5</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">{new Date(item.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-2.5 text-red-500 truncate max-w-[150px]">{item.error_code || "—"}</td>
                        <td className="px-3 py-2.5">
                          <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-amber-700 border-amber-200" onClick={() => retrySingle(item.id)} disabled={retryingId === item.id}>
                            {retryingId === item.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />} Retry
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TEST MODE ── */}
        {activeTab === "test" && (
          <div className="max-w-xl space-y-6">
            <div className="border rounded-xl p-5 space-y-4 bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2">
                <TestTube2 size={18} className="text-amber-700" />
                <h3 className="text-sm font-bold text-amber-800">Run Complete Automation Test</h3>
              </div>
              <p className="text-xs text-amber-700">Tests BotBee connection, template fetch, WhatsApp send, SMS, email, and DB logging. Shows PASS/FAIL for each step.</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Mobile Number *</label>
                  <input type="tel" placeholder="+91 9XXXXXXXXX" value={testMobile} onChange={e => setTestMobile(e.target.value)}
                    className="w-full h-9 text-sm border rounded-md px-3" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Email (optional)</label>
                  <input type="email" placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                    className="w-full h-9 text-sm border rounded-md px-3" />
                </div>
              </div>
              <Button className="w-full bg-amber-700 hover:bg-amber-800 text-white gap-2" onClick={runAutomationTest} disabled={runningTest}>
                {runningTest ? <><Loader2 size={14} className="animate-spin" /> Running tests…</> : <><Zap size={14} /> Run Complete Automation Test</>}
              </Button>
            </div>

            {testResult && (
              <div className="border rounded-xl overflow-hidden">
                <div className={`flex items-center gap-2 px-4 py-3 border-b ${testResult.ok ? "bg-emerald-50" : "bg-red-50"}`}>
                  {testResult.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
                  <span className={`text-sm font-bold ${testResult.ok ? "text-emerald-800" : "text-red-800"}`}>
                    {testResult.ok ? "All tests passed!" : `${testResult.summary.failed} test(s) failed`}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {testResult.summary.passed} passed · {testResult.summary.failed} failed · {testResult.summary.skipped} skipped
                  </span>
                </div>
                <div className="divide-y">
                  {testResult.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      {step.status === "pass" && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                      {step.status === "fail" && <XCircle size={15} className="text-red-500 shrink-0" />}
                      {step.status === "skip" && <Clock size={15} className="text-gray-400 shrink-0" />}
                      <span className="text-sm font-medium flex-1">{step.step}</span>
                      <span className={`text-xs ${step.status === "pass" ? "text-emerald-600" : step.status === "fail" ? "text-red-500" : "text-gray-400"}`}>
                        {step.status.toUpperCase()}
                      </span>
                      {step.detail && <span className="text-xs text-gray-500 truncate max-w-[200px]">{step.detail}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables reference */}
            <div className="border rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">Available Template Variables</h3>
              <div className="grid grid-cols-2 gap-1">
                {["customer_name","customer_mobile","booking_id","invoice_number","package_name","departure_date","return_date","amount","paid","balance","payment_status","passport_number","visa_number","visa_status","flight_number","airline","pnr","hotel_name","room_number","bus_number","seat_number","driver_name","guide_name","ziyarat_date","company_name","support_number","website"].map(v => (
                  <div key={v} className="flex items-center gap-1.5">
                    <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-700">{`{{${v}}}`}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
