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
  request_payload: string | null;
  error_code: string | null;
  sent_at: string | null;
  retry_count: number;
  booking_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  booking_number?: string | null;
  wamid?: string | null;
  sender_id?: string | null;
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
                  const reqPayload = log.request_payload ? (() => { try { return JSON.parse(log.request_payload); } catch { return log.request_payload; } })() : null;

                  // Extract the human-readable failure reason from whatever the provider returned
                  const failureReason: string | null = (() => {
                    if (log.status !== "failed") return null;
                    if (log.channel === "sms") {
                      return provResp?.providerError
                        || provResp?.errorMessage
                        || (typeof provResp?.rawResponse?.message === "string" ? provResp.rawResponse.message : null)
                        || (Array.isArray(provResp?.rawResponse?.message) ? (provResp.rawResponse.message as string[]).join("; ") : null)
                        || null;
                    }
                    // whatsapp / email
                    return provResp?.errorMessage
                      || (typeof provResp?.responsePayload?.message === "string" ? provResp.responsePayload.message : null)
                      || (typeof provResp?.message === "string" ? provResp.message : null)
                      || null;
                  })();

                  // For SMS: the raw Fast2SMS response body
                  const smsRawResponse = provResp?.rawResponse ?? null;
                  // For WhatsApp: the raw BotBee response body
                  const waRawResponse = provResp?.responsePayload ?? null;

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
                        {log.status === "failed" && log.channel === "whatsapp" && failureReason && (
                          <div className="mt-1 text-[10px] text-red-600 leading-tight max-w-[120px]" title={failureReason}>
                            {failureReason.length > 40 ? failureReason.slice(0, 40) + "…" : failureReason}
                          </div>
                        )}
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
                        <div className="flex items-center gap-1 flex-wrap">
                          {log.status === "failed" ? (
                            <button
                              onClick={() => setExpanded(isExpanded ? null : log.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${isExpanded ? "bg-red-100 border-red-300 text-red-700" : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700"}`}
                            >
                              <Eye className="w-3 h-3" />
                              View Details
                            </button>
                          ) : (
                            <button onClick={() => setExpanded(isExpanded ? null : log.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="View details">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {log.status === "failed" && (
                            <button onClick={() => handleRetry(log.id)} disabled={retrying[log.id]} className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-50" title="Retry">
                              {retrying[log.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={`${log.id}-expanded`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="space-y-3">

                            {/* ── FAILURE REASON ─────────────────────────────── */}
                            {failureReason && (
                              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Provider Rejection Reason</p>
                                  <p className="text-sm text-red-800 font-medium">{failureReason}</p>
                                </div>
                              </div>
                            )}

                            {/* ── WHATSAPP FAILURE DIAGNOSTICS ───────────────── */}
                            {log.status === "failed" && log.channel === "whatsapp" && (
                              <div className="rounded-lg border border-red-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-900 text-white">
                                  <MessageSquare className="w-3.5 h-3.5 text-red-300" />
                                  <span className="text-[11px] font-bold uppercase tracking-widest">WhatsApp Failure Diagnostics</span>
                                </div>
                                <div className="bg-white divide-y divide-red-50">

                                  {/* Row 1: IDs grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-red-50">
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">phone_number_id</p>
                                      <code className="text-[11px] text-gray-800 font-mono select-all break-all">
                                        {reqPayload?.phone_number_id ?? provResp?.requestPayload?.phone_number_id ?? "—"}
                                      </code>
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">Phone Number Sent</p>
                                      <code className="text-[11px] text-gray-800 font-mono select-all">
                                        {reqPayload?.phone_number ?? provResp?.requestPayload?.phone_number ?? log.recipient ?? "—"}
                                      </code>
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">WABA ID (business_id)</p>
                                      <code className="text-[11px] text-gray-800 font-mono select-all break-all">
                                        {reqPayload?.business_id ?? provResp?.requestPayload?.business_id ?? "—"}
                                      </code>
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">Template ID</p>
                                      <code className="text-[11px] text-gray-800 font-mono select-all">
                                        {log.template ?? reqPayload?.template_id ?? reqPayload?.template_name ?? provResp?.requestPayload?.template_id ?? "—"}
                                      </code>
                                    </div>
                                  </div>

                                  {/* Row 2: BotBee status + error code + HTTP */}
                                  <div className="grid grid-cols-3 divide-x divide-red-50">
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">BotBee Status Field</p>
                                      {waRawResponse?.status != null ? (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono ${String(waRawResponse.status) === "0" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                          {String(waRawResponse.status)} {String(waRawResponse.status) === "0" ? "→ ERROR" : "→ OK"}
                                        </span>
                                      ) : <span className="text-[11px] text-gray-400">—</span>}
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">Meta / API Error Code</p>
                                      <code className={`text-[11px] font-mono font-bold ${(log.error_code || waRawResponse?.code || waRawResponse?.error?.code) ? "text-red-700" : "text-gray-400"}`}>
                                        {log.error_code || waRawResponse?.code || waRawResponse?.error?.code || waRawResponse?.error_data?.code || "none"}
                                      </code>
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">HTTP Status</p>
                                      <code className={`text-[11px] font-mono font-bold ${log.http_status && log.http_status >= 400 ? "text-red-700" : "text-gray-700"}`}>
                                        {log.http_status ?? "—"}
                                        {log.http_status === 200 ? " (BotBee may still return errors at HTTP 200)" : ""}
                                      </code>
                                    </div>
                                  </div>

                                  {/* Row 3: Error message from BotBee */}
                                  <div className="px-3 py-2.5 bg-red-50">
                                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-1">Error Message from BotBee / Meta</p>
                                    <p className="text-sm text-red-800 font-semibold leading-snug">
                                      {provResp?.errorMessage
                                        || (typeof waRawResponse?.message === "string" ? waRawResponse.message : null)
                                        || waRawResponse?.error?.message
                                        || waRawResponse?.error_data?.details
                                        || "No error message returned"}
                                    </p>
                                    {waRawResponse?.error?.type && (
                                      <p className="text-[10px] text-red-600 mt-0.5 font-mono">Type: {waRawResponse.error.type}</p>
                                    )}
                                  </div>

                                  {/* Row 4: Template variables sent */}
                                  {(reqPayload?.variables || provResp?.requestPayload?.variables) && (
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-1">Template Variables Sent</p>
                                      <code className="text-[11px] text-gray-700 font-mono bg-gray-50 rounded px-2 py-1 block break-all">
                                        {JSON.stringify(reqPayload?.variables ?? provResp?.requestPayload?.variables)}
                                      </code>
                                    </div>
                                  )}

                                  {/* Row 5: API endpoint */}
                                  <div className="px-3 py-2">
                                    <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">API Endpoint Called</p>
                                    <code className="text-[11px] text-gray-600 font-mono break-all">
                                      {log.api_endpoint || provResp?.endpoint || "—"}
                                    </code>
                                  </div>

                                </div>
                              </div>
                            )}

                            {/* ── HTTP STATUS + SUCCESS IDs ───────────────────── */}
                            <div className="flex flex-wrap gap-3 items-center">
                              {log.http_status != null && (
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                  log.http_status >= 200 && log.http_status < 300
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : log.http_status >= 400
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-yellow-50 border-yellow-200 text-yellow-700"
                                }`}>
                                  HTTP {log.http_status}
                                  <span className="font-normal opacity-70">
                                    {log.http_status === 200 ? "OK" : log.http_status === 400 ? "Bad Request" : log.http_status === 401 ? "Unauthorized" : log.http_status === 403 ? "Forbidden" : log.http_status === 404 ? "Not Found" : log.http_status === 429 ? "Rate Limited" : log.http_status === 500 ? "Server Error" : ""}
                                  </span>
                                </div>
                              )}
                              {/* WhatsApp WAMID */}
                              {log.channel === "whatsapp" && log.wamid && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 border border-green-200 text-green-700">
                                  WAMID: <code className="select-all font-mono">{log.wamid}</code>
                                </div>
                              )}
                              {/* SMS: Sender ID + Fast2SMS Request ID */}
                              {log.channel === "sms" && log.sender_id && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700">
                                  Sender ID: <code className="select-all font-mono">{log.sender_id}</code>
                                </div>
                              )}
                              {log.channel === "sms" && log.wamid && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700">
                                  Fast2SMS ID: <code className="select-all font-mono">{log.wamid}</code>
                                </div>
                              )}
                              {log.error_code && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 border border-red-200 text-red-700">
                                  Error Code: {log.error_code}
                                </div>
                              )}
                            </div>

                            {/* ── TWO-COLUMN TRACE: REQUEST | RESPONSE ────────── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                              {/* REQUEST */}
                              {(reqPayload || log.api_endpoint) && (
                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-200">
                                    <Send className="w-3 h-3 text-slate-400" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">
                                      {log.channel === "sms" ? "GET" : "POST"} Request → {log.provider_name || "Provider"}
                                    </span>
                                  </div>
                                  {/* URL bar for SMS */}
                                  {log.channel === "sms" && reqPayload?.url && (
                                    <div className="px-3 py-2 bg-slate-700 border-b border-slate-600">
                                      <p className="text-[10px] text-slate-400 mb-0.5 uppercase">URL</p>
                                      <code className="text-[10px] text-amber-300 break-all select-all">{reqPayload.url}</code>
                                    </div>
                                  )}
                                  {/* Endpoint for WhatsApp */}
                                  {log.channel !== "sms" && log.api_endpoint && (
                                    <div className="px-3 py-2 bg-slate-700 border-b border-slate-600">
                                      <p className="text-[10px] text-slate-400 mb-0.5 uppercase">Endpoint</p>
                                      <code className="text-[10px] text-amber-300 break-all select-all">{log.api_endpoint}</code>
                                    </div>
                                  )}
                                  {/* Request body / params */}
                                  <pre className="bg-slate-900 text-slate-300 text-[10px] font-mono p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                                    {reqPayload
                                      ? JSON.stringify(
                                          log.channel === "sms" ? (reqPayload.params ?? reqPayload) : reqPayload,
                                          null, 2
                                        )
                                      : log.api_endpoint}
                                  </pre>
                                </div>
                              )}

                              {/* RESPONSE */}
                              {(smsRawResponse || waRawResponse || provResp) && (
                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                  <div className={`flex items-center gap-2 px-3 py-2 ${log.status === "failed" ? "bg-red-900" : "bg-green-900"} text-white`}>
                                    {log.status === "failed"
                                      ? <XCircle className="w-3 h-3 text-red-300" />
                                      : <CheckCircle2 className="w-3 h-3 text-green-300" />
                                    }
                                    <span className="text-[11px] font-bold uppercase tracking-wider">
                                      Response ← {log.provider_name || "Provider"}
                                      {log.http_status != null && <span className="ml-2 opacity-70">HTTP {log.http_status}</span>}
                                    </span>
                                  </div>
                                  <pre className={`text-[10px] font-mono p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all ${log.status === "failed" ? "bg-red-950 text-red-200" : "bg-green-950 text-green-200"}`}>
                                    {JSON.stringify(
                                      log.channel === "sms" ? (smsRawResponse ?? provResp) : (waRawResponse ?? provResp),
                                      null, 2
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>

                            {/* ── MESSAGE TEXT ────────────────────────────────── */}
                            {log.message && (
                              <div>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Message Text Sent</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg border border-slate-200 p-3">{log.message}</p>
                              </div>
                            )}

                            {/* ── METADATA ROW ────────────────────────────────── */}
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500 border-t border-slate-100 pt-2">
                              {log.template && <span>Template: <code className="text-gray-700 select-all">{log.template}</code></span>}
                              {log.customer_name && <span>Customer: <code className="text-gray-700">{log.customer_name}</code></span>}
                              {log.booking_id && <span>Booking: <code className="text-gray-700 select-all">{log.booking_id}</code></span>}
                              {log.booking_number && <span>Booking #: <code className="text-gray-700">{log.booking_number}</code></span>}
                              <span>Log ID: <code className="text-gray-500 select-all">{log.id}</code></span>
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
