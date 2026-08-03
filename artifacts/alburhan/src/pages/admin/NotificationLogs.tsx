import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  MessageSquare, Smartphone, Radio, Mail, Bell,
  CheckCircle2, XCircle, Clock, RefreshCw, Search,
  ChevronLeft, ChevronRight, RotateCcw, Eye, Filter,
  TrendingUp, Send, AlertTriangle, Activity, Paperclip,
  BookOpen, Download, X, SkipForward, CheckCheck,
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
  sent:               { icon: CheckCircle2, label: "Sent",           color: "text-green-700",  bg: "bg-green-100" },
  delivered:          { icon: CheckCheck,   label: "Delivered",      color: "text-emerald-700",bg: "bg-emerald-100" },
  read:               { icon: CheckCheck,   label: "Read",           color: "text-teal-700",   bg: "bg-teal-100" },
  failed:             { icon: XCircle,      label: "Failed",         color: "text-red-700",    bg: "bg-red-100" },
  permanently_failed: { icon: XCircle,      label: "Perm. Failed",   color: "text-red-900",    bg: "bg-red-200" },
  pending:            { icon: Clock,        label: "Pending",        color: "text-yellow-700", bg: "bg-yellow-100" },
  queued:             { icon: Clock,        label: "Queued",         color: "text-yellow-700", bg: "bg-yellow-100" },
  accepted:           { icon: Clock,        label: "Accepted",       color: "text-blue-700",   bg: "bg-blue-100" },
  retrying:           { icon: RotateCcw,    label: "Retrying",       color: "text-orange-700", bg: "bg-orange-100" },
  skipped:            { icon: SkipForward,  label: "Skipped",        color: "text-gray-600",   bg: "bg-gray-100" },
};

const SECRET_KEY_PATTERN = /key|password|pass|token|secret|otp|private|auth|bearer|credential/i;

function scrubPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(scrubPayload);
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : scrubPayload(v),
    ])
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function fmtShort(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
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
  api_endpoint?: string | null;
  http_status: number | null;
  provider_response?: string | null;
  request_payload: unknown | null;
  error_code: string | null;
  error_message?: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  retry_count: number;
  booking_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  booking_number?: string | null;
  wamid?: string | null;
  template?: string | null;
  provider_message_id?: string | null;
  message_id?: string | null;
  delivery_status?: string | null;
  idempotency_key?: string | null;
  template_id?: string | null;
  template_name?: string | null;
  sender_id?: string | null;
  created_at: string | null;
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

// ── Payload Viewer Modal ──────────────────────────────────────────────────────
function PayloadModal({ log, onClose }: { log: LogRow; onClose: () => void }) {
  const scrubbed = log.request_payload ? scrubPayload(log.request_payload) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" />
            Request Payload — {log.event_type} / {log.channel}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {scrubbed ? (
            <pre className="bg-slate-900 text-slate-200 text-xs font-mono p-3 rounded-lg overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(scrubbed, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-400 italic">No request payload logged</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {log.wamid && <span className="px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded font-mono select-all">WAMID: {log.wamid}</span>}
            {log.provider_message_id && <span className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded font-mono select-all">Provider Msg: {log.provider_message_id}</span>}
            {log.error_code && <span className="px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded font-bold">{log.error_code}</span>}
            {log.error_message && <span className="px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded">{log.error_message}</span>}
          </div>
        </div>
        <div className="px-4 py-3 border-t flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function NotificationLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<Record<string, boolean>>({});
  const [bulkResending, setBulkResending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payloadLog, setPayloadLog] = useState<LogRow | null>(null);

  const [filterChannel, setFilterChannel]   = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterEvent, setFilterEvent]       = useState("");
  const [filterBooking, setFilterBooking]   = useState("");
  const [filterMobile, setFilterMobile]     = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]     = useState("");
  const [search, setSearch]                 = useState("");
  const [page, setPage]                     = useState(1);
  const pageSize = 50;

  const abortRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        page: String(page),
        ...(filterChannel  && { channel: filterChannel }),
        ...(filterStatus   && { status: filterStatus }),
        ...(filterEvent    && { event: filterEvent }),
        ...(filterBooking  && { bookingNumber: filterBooking }),
        ...(filterMobile   && { mobile: filterMobile }),
        ...(filterDateFrom && { dateFrom: filterDateFrom }),
        ...(filterDateTo   && { dateTo: filterDateTo }),
        ...(search         && { search }),
      });
      const r = await fetch(`${API}/api/comms-engine/notification-logs?${params}`, {
        credentials: "include",
        signal: abortRef.current.signal,
      });
      const data = await r.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      if (e.name !== "AbortError") setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterChannel, filterStatus, filterEvent, filterBooking, filterMobile, filterDateFrom, filterDateTo, search]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/notification-center/stats`, { credentials: "include" });
      const data = await r.json();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => { fetchLogs(); fetchStats(); }, [fetchLogs, fetchStats]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => { fetchLogs(); fetchStats(); }, 30000);
    return () => clearInterval(id);
  }, [fetchLogs, fetchStats]);

  // ── Single row resend ────────────────────────────────────────────────────
  async function handleResend(logId: string) {
    setResending(p => ({ ...p, [logId]: true }));
    try {
      const r = await fetch(`${API}/api/comms-engine/notification-logs/${logId}/resend`, {
        method: "POST", credentials: "include",
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "Re-queued", description: data.message || "Notification re-queued for delivery." });
        fetchLogs();
      } else {
        toast({ title: "Resend failed", description: data.error || "Could not resend.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Resend request failed.", variant: "destructive" });
    } finally {
      setResending(p => ({ ...p, [logId]: false }));
    }
  }

  // ── Bulk resend all failed for a booking ────────────────────────────────
  async function handleBulkResend() {
    if (!filterBooking) {
      toast({ title: "Filter required", description: "Set a Booking # filter to bulk-resend failed notifications for a booking.", variant: "destructive" });
      return;
    }
    setBulkResending(true);
    try {
      const r = await fetch(`${API}/api/comms-engine/notification-logs/resend-failed`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingNumber: filterBooking }),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "Bulk Re-queued", description: data.message || `Re-queued ${data.queued} notification(s).` });
        fetchLogs();
      } else {
        toast({ title: "Bulk resend failed", description: data.error || "Could not resend.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Bulk resend request failed.", variant: "destructive" });
    } finally {
      setBulkResending(false);
    }
  }

  // ── CSV export ───────────────────────────────────────────────────────────
  function handleExport() {
    const params = new URLSearchParams({
      ...(filterChannel  && { channel: filterChannel }),
      ...(filterStatus   && { status: filterStatus }),
      ...(filterEvent    && { event: filterEvent }),
      ...(filterBooking  && { bookingNumber: filterBooking }),
      ...(filterMobile   && { mobile: filterMobile }),
      ...(filterDateFrom && { dateFrom: filterDateFrom }),
      ...(filterDateTo   && { dateTo: filterDateTo }),
      ...(search         && { search }),
    });
    window.open(`${API}/api/comms-engine/notification-logs/export?${params}`, "_blank");
  }

  // ── Reset filters ────────────────────────────────────────────────────────
  function clearFilters() {
    setFilterChannel(""); setFilterStatus(""); setFilterEvent("");
    setFilterBooking(""); setFilterMobile(""); setFilterDateFrom("");
    setFilterDateTo(""); setSearch(""); setPage(1);
  }

  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = !!(filterChannel || filterStatus || filterEvent || filterBooking || filterMobile || filterDateFrom || filterDateTo || search);
  const failedCount = logs.filter(l => l.status === "failed" || l.status === "permanently_failed").length;

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
            <p className="text-sm text-gray-500 mt-1">Real-time log of all customer notifications across WhatsApp, SMS, RCS, Email and Push</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {filterBooking && failedCount > 0 && (
              <Button
                variant="outline" size="sm"
                onClick={handleBulkResend}
                disabled={bulkResending}
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                {bulkResending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Resend All Failed ({failedCount})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats(); }} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Today's Sent", value: stats.sent,         icon: Send,         color: "text-blue-600",   bg: "bg-blue-50" },
              { label: "Delivered",    value: stats.delivered,    icon: CheckCircle2, color: "text-green-600",  bg: "bg-green-50" },
              { label: "Failed",       value: stats.failed,       icon: XCircle,      color: "text-red-600",    bg: "bg-red-50" },
              { label: "Pending",      value: stats.pending,      icon: Clock,        color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Delivery Rate",value: `${stats.deliveryRate}%`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
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

        {/* Channel breakdown pills */}
        {stats?.channelStats && Object.keys(stats.channelStats).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.channelStats).map(([ch, counts]) => {
              const m = CHANNEL_META[ch] || CHANNEL_META.sms;
              const Icon = m.icon;
              const chSent   = (counts as any).sent   || 0;
              const chFailed = (counts as any).failed || 0;
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

        {/* Filters — Row 1: search + channel + status */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="Search recipient, booking, event…" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm" />
            </div>
            <Input
              placeholder="Booking # (e.g. ABT26…)"
              value={filterBooking}
              onChange={e => { setFilterBooking(e.target.value); setPage(1); }}
              className="h-9 text-sm w-44"
            />
            <Input
              placeholder="Mobile number"
              value={filterMobile}
              onChange={e => { setFilterMobile(e.target.value); setPage(1); }}
              className="h-9 text-sm w-36"
            />
            <select value={filterChannel} onChange={e => { setFilterChannel(e.target.value); setPage(1); }}
              className="h-9 border rounded-lg px-2 text-sm bg-white">
              <option value="">All Channels</option>
              {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="h-9 border rounded-lg px-2 text-sm bg-white">
              <option value="">All Status</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterEvent} onChange={e => { setFilterEvent(e.target.value); setPage(1); }}
              className="h-9 border rounded-lg px-2 text-sm bg-white min-w-40">
              <option value="">All Events</option>
              {["new_booking","booking_approved","booking_rejected","payment_received","partial_payment",
                "invoice_generated","ticket_issued","visa_ready","visa_approved","agreement_ready","agreement_signed",
                "departure_reminder","flight_reminder","return_reminder","balance_reminder","room_assigned",
                "hajj_mubarak","welcome_saudi","arrival_india","custom_admin","test_send"].map(e => (
                <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
              ))}
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-gray-500 gap-1" onClick={clearFilters}>
                <Filter className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
          {/* Date range row */}
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-gray-500 font-medium">Date range:</label>
            <Input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="h-9 text-sm w-40" />
            <span className="text-gray-400 text-xs">to</span>
            <Input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
              className="h-9 text-sm w-40" />
            {(filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} className="text-xs text-gray-400 hover:text-gray-600">✕ clear dates</button>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {total.toLocaleString()} total matching {hasFilters ? "(filtered)" : ""}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Channel</th>
                  <th className="px-3 py-3 text-left">Customer / Recipient</th>
                  <th className="px-3 py-3 text-left">Event</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Provider / Msg ID</th>
                  <th className="px-3 py-3 text-left">Times</th>
                  <th className="px-3 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">No notification logs found</p>
                      <p className="text-gray-300 text-xs mt-1">
                        {hasFilters ? "Try clearing some filters" : "Logs appear here when notifications are sent"}
                      </p>
                    </td>
                  </tr>
                ) : (logs.map(log => {
                  const ch  = CHANNEL_META[log.channel] || { icon: Bell, label: log.channel, color: "text-gray-600", bg: "bg-gray-100" };
                  const st  = STATUS_META[log.status]   || STATUS_META.pending;
                  const ChIcon = ch.icon;
                  const StIcon = st.icon;
                  const isExpanded = expanded === log.id;
                  const isFailed = log.status === "failed" || log.status === "permanently_failed";

                  const provResp    = (log as any).provider_response ? (() => { try { return JSON.parse((log as any).provider_response); } catch { return (log as any).provider_response; } })() : null;
                  const reqPayload  = log.request_payload ? (typeof log.request_payload === "string" ? (() => { try { return JSON.parse(log.request_payload as string); } catch { return log.request_payload; } })() : log.request_payload) : null;
                  const scrubbedReq = reqPayload ? scrubPayload(reqPayload) : null;

                  const failureReason: string | null = (() => {
                    if (!isFailed) return null;
                    return (
                      log.error_message ||
                      provResp?.errorMessage ||
                      provResp?.responsePayload?.message ||
                      provResp?.rawResponse?.message ||
                      null
                    );
                  })();

                  const waRawResponse  = provResp?.responsePayload ?? null;
                  const smsRawResponse = provResp?.rawResponse ?? null;

                  const displayMsgId = log.provider_message_id || log.wamid || log.message_id;

                  return [
                    <tr key={log.id} className={`hover:bg-gray-50 transition-colors ${isFailed ? "bg-red-50/30" : ""}`}>

                      {/* Channel */}
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${ch.bg} ${ch.color}`}>
                          <ChIcon className="w-3 h-3" /> {ch.label}
                        </span>
                        {log.channel === "sms" && (() => {
                          const tid = (reqPayload as any)?.templateId;
                          if (tid === "quick_route_emergency") return (
                            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 border border-red-300 text-red-700 text-[10px] font-bold rounded">
                              <AlertTriangle className="w-2.5 h-2.5" /> Emergency Route
                            </div>
                          );
                          return null;
                        })()}
                      </td>

                      {/* Customer / Recipient */}
                      <td className="px-3 py-3">
                        {log.customer_name && <div className="font-medium text-gray-800 text-sm">{log.customer_name}</div>}
                        <div className={`text-xs ${log.customer_name ? "text-gray-400" : "font-medium text-gray-700"}`}>{log.recipient}</div>
                        {log.booking_number && <div className="text-[11px] text-gray-400 mt-0.5">#{log.booking_number}</div>}
                      </td>

                      {/* Event */}
                      <td className="px-3 py-3">
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
                        {log.template && (
                          <div className="text-[10px] text-indigo-500 mt-0.5 font-mono">{log.template}</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${st.bg} ${st.color}`}>
                          <StIcon className="w-3 h-3" /> {st.label}
                        </span>
                        {log.retry_count > 0 && <span className="ml-1 text-[10px] text-gray-400">↻{log.retry_count}</span>}
                        {isFailed && log.error_code && (
                          <div className="text-[10px] text-red-600 mt-0.5 font-mono">{log.error_code}</div>
                        )}
                        {isFailed && failureReason && (
                          <div className="mt-0.5 text-[10px] text-red-600 leading-tight max-w-[130px]" title={failureReason}>
                            {failureReason.length > 45 ? failureReason.slice(0, 45) + "…" : failureReason}
                          </div>
                        )}
                      </td>

                      {/* Provider / Msg ID */}
                      <td className="px-3 py-3">
                        <div className="text-xs text-gray-500">{log.provider_name || "—"}</div>
                        {log.http_status != null && (
                          <span className={`inline text-[10px] font-bold px-1 rounded ${log.http_status < 300 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            HTTP {log.http_status}
                          </span>
                        )}
                        {displayMsgId && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5 select-all max-w-[120px] truncate" title={displayMsgId}>
                            {displayMsgId}
                          </div>
                        )}
                      </td>

                      {/* Times */}
                      <td className="px-3 py-3 text-[11px] text-gray-400 space-y-0.5">
                        {log.sent_at      && <div className="flex gap-1"><span className="text-gray-300">✉</span>{fmtShort(log.sent_at)}</div>}
                        {log.delivered_at && <div className="flex gap-1"><span className="text-green-400">✓</span>{fmtShort(log.delivered_at)}</div>}
                        {log.read_at      && <div className="flex gap-1"><span className="text-teal-400">👁</span>{fmtShort(log.read_at)}</div>}
                        {log.failed_at    && <div className="flex gap-1"><span className="text-red-400">✗</span>{fmtShort(log.failed_at)}</div>}
                        {!log.sent_at && !log.delivered_at && log.created_at && (
                          <div>{fmtShort(log.created_at)}</div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : log.id)}
                            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] border transition-colors ${isExpanded ? "bg-blue-100 border-blue-300 text-blue-700" : "hover:bg-gray-100 border-gray-200 text-gray-400 hover:text-gray-700"}`}
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPayloadLog(log)}
                            className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] border border-gray-200 hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title="View request payload"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </button>
                          {(isFailed || log.status === "pending") && (
                            <button
                              onClick={() => handleResend(log.id)}
                              disabled={resending[log.id]}
                              className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 disabled:opacity-50 transition-colors"
                              title="Resend"
                            >
                              {resending[log.id]
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <RotateCcw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,

                    /* ── Expanded row ── */
                    isExpanded && (
                      <tr key={`${log.id}-exp`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-3">

                            {/* Failure reason banner */}
                            {failureReason && (
                              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Provider Rejection Reason</p>
                                  <p className="text-sm text-red-800 font-medium">{failureReason}</p>
                                </div>
                              </div>
                            )}

                            {/* WhatsApp failure diagnostics */}
                            {isFailed && log.channel === "whatsapp" && (
                              <div className="rounded-lg border border-red-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-900 text-white">
                                  <MessageSquare className="w-3.5 h-3.5 text-red-300" />
                                  <span className="text-[11px] font-bold uppercase tracking-widest">WhatsApp Failure Diagnostics</span>
                                </div>
                                <div className="bg-white divide-y divide-red-50">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-red-50">
                                    {[
                                      { label: "phone_number_id", val: (scrubbedReq as any)?.phone_number_id ?? (provResp?.requestPayload as any)?.phone_number_id },
                                      { label: "Phone Number",    val: (scrubbedReq as any)?.phone_number   ?? log.recipient },
                                      { label: "WABA ID",         val: (scrubbedReq as any)?.business_id    ?? (provResp?.requestPayload as any)?.business_id },
                                      { label: "Template ID",     val: log.template ?? (scrubbedReq as any)?.template_id ?? (scrubbedReq as any)?.template_name },
                                    ].map(field => (
                                      <div key={field.label} className="px-3 py-2">
                                        <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5">{field.label}</p>
                                        <code className="text-[11px] text-gray-800 font-mono select-all break-all">{field.val ?? "—"}</code>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="grid grid-cols-3 divide-x divide-red-50">
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase mb-0.5">BotBee Status</p>
                                      {waRawResponse?.status != null ? (
                                        <span className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded ${String(waRawResponse.status) === "0" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                          {String(waRawResponse.status)} {String(waRawResponse.status) === "0" ? "→ ERROR" : "→ OK"}
                                        </span>
                                      ) : <span className="text-[11px] text-gray-400">—</span>}
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase mb-0.5">Error Code</p>
                                      <code className={`text-[11px] font-mono font-bold ${log.error_code ? "text-red-700" : "text-gray-400"}`}>
                                        {log.error_code || waRawResponse?.code || waRawResponse?.error?.code || "none"}
                                      </code>
                                    </div>
                                    <div className="px-3 py-2">
                                      <p className="text-[9px] font-bold text-red-500 uppercase mb-0.5">HTTP Status</p>
                                      <code className={`text-[11px] font-mono font-bold ${log.http_status && log.http_status >= 400 ? "text-red-700" : "text-gray-700"}`}>
                                        {log.http_status ?? "—"}
                                      </code>
                                    </div>
                                  </div>
                                  <div className="px-3 py-2.5 bg-red-50">
                                    <p className="text-[9px] font-bold text-red-500 uppercase mb-1">Error Message</p>
                                    <p className="text-sm text-red-800 font-semibold leading-snug">
                                      {log.error_message || provResp?.errorMessage || waRawResponse?.message || waRawResponse?.error?.message || "No error message returned"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* IDs row */}
                            <div className="flex flex-wrap gap-2 items-center">
                              {log.http_status != null && (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${log.http_status < 300 ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                                  HTTP {log.http_status}
                                </span>
                              )}
                              {log.wamid && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-green-50 border border-green-200 text-green-700">
                                  WAMID: <code className="select-all font-mono">{log.wamid}</code>
                                </span>
                              )}
                              {log.provider_message_id && log.provider_message_id !== log.wamid && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700">
                                  Provider Msg: <code className="select-all font-mono text-[10px]">{log.provider_message_id}</code>
                                </span>
                              )}
                              {log.error_code && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 border border-red-200 text-red-700">
                                  {log.error_code}
                                </span>
                              )}
                              {log.template && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                                  Tpl: <code className="select-all font-mono">{log.template}</code>
                                </span>
                              )}
                            </div>

                            {/* Request | Response */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {scrubbedReq && (
                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-200">
                                    <Send className="w-3 h-3 text-slate-400" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">Request → {log.provider_name || "Provider"}</span>
                                  </div>
                                  <pre className="bg-slate-900 text-slate-300 text-[10px] font-mono p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                                    {JSON.stringify(scrubbedReq, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {(smsRawResponse || waRawResponse || provResp) && (
                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                  <div className={`flex items-center gap-2 px-3 py-2 ${isFailed ? "bg-red-900" : "bg-green-900"} text-white`}>
                                    {isFailed ? <XCircle className="w-3 h-3 text-red-300" /> : <CheckCircle2 className="w-3 h-3 text-green-300" />}
                                    <span className="text-[11px] font-bold uppercase tracking-wider">
                                      Response ← {log.provider_name || "Provider"}
                                    </span>
                                  </div>
                                  <pre className={`text-[10px] font-mono p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all ${isFailed ? "bg-red-950 text-red-200" : "bg-green-950 text-green-200"}`}>
                                    {JSON.stringify(
                                      log.channel === "sms" ? (smsRawResponse ?? provResp) : (waRawResponse ?? provResp),
                                      null, 2
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>

                            {/* Message text */}
                            {log.message && (
                              <div>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Message Text Sent</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg border border-slate-200 p-3">{log.message}</p>
                              </div>
                            )}

                            {/* Timestamps & metadata */}
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500 border-t border-slate-100 pt-2">
                              {log.sent_at      && <span>Sent: <code className="text-gray-700">{fmt(log.sent_at)}</code></span>}
                              {log.delivered_at && <span>Delivered: <code className="text-gray-700">{fmt(log.delivered_at)}</code></span>}
                              {log.read_at      && <span>Read: <code className="text-gray-700">{fmt(log.read_at)}</code></span>}
                              {log.failed_at    && <span>Failed: <code className="text-red-600">{fmt(log.failed_at)}</code></span>}
                              {log.customer_name  && <span>Customer: <code className="text-gray-700">{log.customer_name}</code></span>}
                              {log.booking_number && <span>Booking #: <code className="text-gray-700">{log.booking_number}</code></span>}
                              <span>Log ID: <code className="text-gray-500 select-all">{log.id}</code></span>
                            </div>

                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                }))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages} · {total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-gray-600">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* All-time footnote */}
        {stats?.allTime && (
          <p className="text-xs text-gray-400 text-center">
            All-time: {Number(stats.allTime.total).toLocaleString()} total · {Number(stats.allTime.total_sent).toLocaleString()} delivered
          </p>
        )}
      </div>

      {/* Payload modal */}
      {payloadLog && <PayloadModal log={payloadLog} onClose={() => setPayloadLog(null)} />}
    </AdminLayout>
  );
}
