import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  MessageSquare, Smartphone, Radio, Mail, Bell,
  CheckCircle2, XCircle, Clock, RefreshCw, Search,
  ChevronLeft, ChevronRight, RotateCcw, Eye, Filter,
  TrendingUp, Send, AlertTriangle, Activity, Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

const CHANNEL_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  whatsapp: { icon: MessageSquare, label: "WhatsApp",  color: "text-green-700",  bg: "bg-green-100" },
  sms:      { icon: Smartphone,    label: "SMS",       color: "text-blue-700",   bg: "bg-blue-100" },
  rcs:      { icon: Radio,         label: "RCS",       color: "text-purple-700", bg: "bg-purple-100" },
  email:    { icon: Mail,          label: "Email",     color: "text-orange-700", bg: "bg-orange-100" },
  push:     { icon: Bell,          label: "Push",      color: "text-indigo-700", bg: "bg-indigo-100" },
};

const STATUS_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  sent:               { icon: CheckCircle2, label: "Delivered",       color: "text-green-700",  bg: "bg-green-100" },
  failed:             { icon: XCircle,     label: "Failed",           color: "text-red-700",    bg: "bg-red-100" },
  pending:            { icon: Clock,       label: "Pending",          color: "text-yellow-700", bg: "bg-yellow-100" },
  permanently_failed: { icon: XCircle,     label: "Perm. Failed",     color: "text-red-700",    bg: "bg-red-100" },
  retrying:           { icon: Clock,       label: "Retrying",         color: "text-orange-700", bg: "bg-orange-100" },
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function truncate(s: string | null, n = 60) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface LogRow {
  id: string;
  event_type: string;
  channel: string;
  recipient: string;
  message: string | null;
  status: string;
  provider_name: string | null;
  api_endpoint: string | null;
  http_status: number | null;
  provider_response: string | null;
  error_code: string | null;
  sent_at: string | null;
  retry_count: number;
  booking_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  booking_number?: string | null;
  wamid?: string | null;
  template?: string | null;
}

interface Stats {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  channelStats: Record<string, Record<string, number>>;
  allTime: { total: string; total_sent: string };
}

export default function NotificationLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterBooking, setFilterBooking] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
        ...(filterChannel && { channel: filterChannel }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterEvent && { event_type: filterEvent }),
        ...(filterBooking && { booking_number: filterBooking }),
        ...(search && { search }),
      });
      const r = await fetch(`${API}/api/notification-center/logs?${params}`, { credentials: "include" });
      const data = await r.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }, [page, filterChannel, filterStatus, filterEvent, search]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/notification-center/stats`, { credentials: "include" });
      const data = await r.json();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => { fetchLogs(); fetchStats(); }, [fetchLogs, fetchStats, filterBooking]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => { fetchLogs(); fetchStats(); }, 30000);
    return () => clearInterval(id);
  }, [fetchLogs, fetchStats]);

  async function handleRetry(logId: string) {
    setRetrying(p => ({ ...p, [logId]: true }));
    try {
      const r = await fetch(`${API}/api/notification-center/retry/${logId}`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (data.success) {
        toast({ title: "Retried", description: "Notification re-sent successfully." });
        fetchLogs();
      } else {
        toast({ title: "Retry failed", description: data.error || "Could not retry.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Retry request failed.", variant: "destructive" });
    } finally {
      setRetrying(p => ({ ...p, [logId]: false }));
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              Notification Delivery Logs
            </h1>
            <p className="text-sm text-gray-500 mt-1">Real-time log of all customer notifications across WhatsApp, SMS, RCS, and Email</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats(); }} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Today's Sent", value: stats.sent, icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Delivered", value: stats.delivered, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
              { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
              { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Delivery Rate", value: `${stats.deliveryRate}%`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-3 ${s.bg} flex items-center gap-3`}>
                <s.icon className={`w-7 h-7 ${s.color} shrink-0`} />
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Channel breakdown */}
        {stats?.channelStats && Object.keys(stats.channelStats).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.channelStats).map(([ch, counts]) => {
              const m = CHANNEL_META[ch] || CHANNEL_META.sms;
              const Icon = m.icon;
              const chSent = counts.sent || 0;
              const chFailed = counts.failed || 0;
              return (
                <div key={ch} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${m.bg} ${m.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                  <span className="text-green-700 font-bold">{chSent}✓</span>
                  {chFailed > 0 && <span className="text-red-600 font-bold">{chFailed}✗</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="Search recipient, booking, message…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9 text-sm" />
          </div>
          <Input
            placeholder="Booking # (e.g. ABT26…)"
            value={filterBooking}
            onChange={e => { setFilterBooking(e.target.value); setPage(0); }}
            className="h-9 text-sm w-44"
          />
          <select value={filterChannel} onChange={e => { setFilterChannel(e.target.value); setPage(0); }} className="h-9 border rounded-lg px-2 text-sm bg-white">
            <option value="">All Channels</option>
            {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} className="h-9 border rounded-lg px-2 text-sm bg-white">
            <option value="">All Status</option>
            <option value="sent">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="permanently_failed">Perm. Failed</option>
            <option value="retrying">Retrying</option>
          </select>
          <select value={filterEvent} onChange={e => { setFilterEvent(e.target.value); setPage(0); }} className="h-9 border rounded-lg px-2 text-sm bg-white min-w-40">
            <option value="">All Events</option>
            {["new_booking","booking_approved","booking_approved_pdf","booking_rejected","payment_received","payment_received_pdf","partial_payment","invoice_generated","ticket_issued","visa_ready","departure_reminder","arrival_reminder","eid_greeting","hajj_updates","umrah_promotions","custom_admin","test_send","test_all"].map(e => (
              <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
            ))}
          </select>
          {(filterChannel || filterStatus || filterEvent || filterBooking || search) && (
            <Button variant="ghost" size="sm" className="text-gray-500 gap-1" onClick={() => { setFilterChannel(""); setFilterStatus(""); setFilterEvent(""); setFilterBooking(""); setSearch(""); setPage(0); }}>
              <Filter className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Sent At</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">No notification logs yet</p>
                      <p className="text-gray-300 text-xs mt-1">Logs appear here when notifications are sent</p>
                    </td>
                  </tr>
                ) : logs.map(log => {
                  const ch = CHANNEL_META[log.channel] || { icon: Bell, label: log.channel, color: "text-gray-600", bg: "bg-gray-100" };
                  const st = STATUS_META[log.status] || STATUS_META.pending;
                  const ChIcon = ch.icon;
                  const StIcon = st.icon;
                  const isExpanded = expanded === log.id;
                  const provResp = log.provider_response ? (() => { try { return JSON.parse(log.provider_response); } catch { return log.provider_response; } })() : null;
                  return [
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${ch.bg} ${ch.color}`}>
                          <ChIcon className="w-3 h-3" /> {ch.label}
                        </span>
                        {log.channel === "sms" && (
                          (() => {
                            const tid = provResp?.templateId;
                            if (tid === "quick_route_emergency") return (
                              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 border border-red-300 text-red-700 text-[10px] font-bold rounded">
                                <AlertTriangle className="w-2.5 h-2.5" /> Emergency Route
                              </div>
                            );
                            if (tid === "not_configured") return (
                              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-200 text-amber-700 text-[10px] rounded">
                                No DLT Template
                              </div>
                            );
                            return null;
                          })()
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{log.recipient}</div>
                        {log.booking_number && <div className="text-xs text-gray-400">#{log.booking_number}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                            {(log.event_type || "").replace(/_pdf$/, "").replace(/_/g, " ")}
                          </span>
                          {(log.event_type || "").endsWith("_pdf") && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold">
                              <Paperclip className="w-2.5 h-2.5" /> PDF
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-48">
                        <span className="text-gray-600 text-xs">{truncate(log.message)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${st.bg} ${st.color}`}>
                          <StIcon className="w-3 h-3" /> {st.label}
                        </span>
                        {log.retry_count > 0 && <span className="ml-1 text-[10px] text-gray-400">↻{log.retry_count}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{log.provider_name || "—"}</span>
                        {log.http_status && (
                          <span className={`ml-1 text-[10px] font-bold px-1 rounded ${log.http_status < 300 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {log.http_status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(log.sent_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setExpanded(isExpanded ? null : log.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="View details">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {log.status === "failed" && (
                            <button onClick={() => handleRetry(log.id)} disabled={retrying[log.id]} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-50" title="Retry">
                              {retrying[log.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={`${log.id}-expanded`} className="bg-blue-50/40 border-b">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="space-y-2">
                            {log.message && (
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase">Message</span>
                                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg border p-3">{log.message}</p>
                              </div>
                            )}
                            {provResp && (
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase">Provider Response</span>
                                <pre className="mt-1 bg-gray-900 text-green-300 text-[10px] font-mono rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                                  {typeof provResp === "string" ? provResp : JSON.stringify(provResp, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              {log.wamid && (
                                <span className="flex items-center gap-1">
                                  <span className="font-semibold text-green-700">wamid:</span>
                                  <code className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded select-all">{log.wamid}</code>
                                </span>
                              )}
                              {log.template && <span>Template ID: <code className="text-gray-700">{log.template}</code></span>}
                              {log.api_endpoint && <span>Endpoint: <code className="text-gray-700">{log.api_endpoint}</code></span>}
                              {log.error_code && <span className="text-red-600">Error Code: {log.error_code}</span>}
                              {log.booking_id && <span>Booking ID: <code className="text-gray-700">{log.booking_id}</code></span>}
                              {log.customer_name && <span>Customer: <code className="text-gray-700">{log.customer_name}</code></span>}
                              <span>Log ID: <code className="text-gray-700">{log.id}</code></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-500">
                Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total} logs
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-gray-600">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* All-time stats footnote */}
        {stats?.allTime && (
          <p className="text-xs text-gray-400 text-center">
            All-time: {Number(stats.allTime.total).toLocaleString()} total notifications, {Number(stats.allTime.total_sent).toLocaleString()} delivered
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
