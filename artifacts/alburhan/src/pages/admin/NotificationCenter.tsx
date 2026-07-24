// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  Bell, CheckCircle2, XCircle, Clock, RefreshCw, Send, MessageSquare,
  Mail, Smartphone, ChevronDown, ChevronRight, Search, RotateCcw,
  Loader2, AlertTriangle, Activity, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

interface NotifLog {
  id: string; event_type: string; channel: string; recipient: string;
  message?: string; status: string; sent_at: string; retry_count: number;
  error_code?: string; provider_name?: string; http_status?: number;
  provider_response?: any; booking_id?: string; customer_id?: string;
  booking_number?: string; customer_name?: string;
}

interface Stats {
  sent: number; delivered: number; failed: number; pending: number;
  deliveryRate: number; channelStats: Record<string, Record<string, number>>;
  allTime: { total: string; total_sent: string };
  retryQueue?: number;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare size={13} className="text-emerald-600" />,
  email:    <Mail size={13} className="text-blue-600" />,
  sms:      <Smartphone size={13} className="text-purple-600" />,
  push:     <Bell size={13} className="text-amber-600" />,
};

const STATUS_COLORS: Record<string, string> = {
  sent:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered: "bg-blue-100 text-blue-700 border-blue-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  permanently_failed: "bg-gray-100 text-gray-600 border-gray-200",
};

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function LogRow({ log, onRetry, retrying }: { log: NotifLog; onRetry: (id: string) => void; retrying: boolean }) {
  const [expanded, setExpanded] = useState(false);
  let respStr = "";
  try { respStr = typeof log.provider_response === "string" ? log.provider_response : JSON.stringify(log.provider_response, null, 2); } catch { respStr = String(log.provider_response); }

  return (
    <div className={`rounded-lg border text-sm transition-all ${log.status === "failed" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <span className="shrink-0">{CHANNEL_ICONS[log.channel] || <Bell size={13} />}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-600"}`}>
          {log.status?.replace("_", " ").toUpperCase()}
        </span>
        <span className="font-medium text-gray-800 truncate max-w-[160px]">{log.event_type?.replace(/_/g, " ")}</span>
        <span className="text-gray-500 truncate flex-1 min-w-0 text-[11px]">{log.recipient}</span>
        {log.customer_name && <span className="text-[10px] text-blue-600 shrink-0 hidden sm:block">{log.customer_name}</span>}
        {log.booking_number && <span className="text-[10px] text-gray-400 shrink-0">{log.booking_number}</span>}
        <span className="text-[10px] text-gray-400 shrink-0">{fmt(log.sent_at)}</span>
        {log.retry_count > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1 shrink-0">↻{log.retry_count}</span>}
        {(log.status === "failed") && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-red-300 text-red-600 hover:bg-red-50 shrink-0"
            onClick={e => { e.stopPropagation(); onRetry(log.id); }} disabled={retrying}>
            {retrying ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
          </Button>
        )}
        {expanded ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 mt-1 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600">
            {log.booking_id && <span><b>Booking ID:</b> {log.booking_id}</span>}
            {log.provider_name && <span><b>Provider:</b> {log.provider_name}</span>}
            {log.http_status && <span><b>HTTP:</b> {log.http_status}</span>}
            {log.retry_count !== undefined && <span><b>Retries:</b> {log.retry_count} / 5</span>}
            {log.error_code && <span className="col-span-2 text-red-600"><b>Error:</b> {log.error_code}</span>}
          </div>
          {log.message && (
            <div className="text-[11px] text-gray-700 bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap break-all">{log.message}</div>
          )}
          {respStr && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-indigo-600 font-semibold">Provider Response</summary>
              <pre className="mt-1 bg-gray-800 text-green-300 rounded p-2 overflow-auto max-h-36 text-[10px]">{respStr}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 30;

function ChannelStat({ icon, label, sent, failed }: { icon: React.ReactNode; label: string; sent: number; failed: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <div className="text-2xl">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-emerald-600 font-bold">✓ {sent}</span>
          {failed > 0 && <span className="text-xs text-red-500 font-bold">✗ {failed}</span>}
        </div>
      </div>
    </div>
  );
}

export default function NotificationCenter() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [filters, setFilters] = useState({
    channel: "", status: "", event: "", search: "", date: "",
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/notification-center/stats`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      // Also get retry queue count
      const rqRes = await fetch(`${API}/api/notification-center/retry-queue-count`, { credentials: "include" }).catch(() => null);
      const rqData = rqRes?.ok ? await rqRes.json() : null;
      setStats({ ...data, retryQueue: rqData?.count ?? 0 });
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(PAGE_SIZE) });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status)  params.set("status", filters.status);
      if (filters.event)   params.set("event", filters.event);
      if (filters.search)  params.set("search", filters.search);
      if (filters.date)    params.set("date", filters.date);

      const res = await fetch(`${API}/api/notification-center/logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err: any) {
      toast({ title: "Failed to load logs", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { setPage(1); fetchLogs(1); fetchStats(); }, [filters]);
  useEffect(() => { fetchLogs(page); }, [page]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch(`${API}/api/notification-center/retry/${id}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.success || res.ok) {
        toast({ title: "Retried", description: "Notification queued for retry." });
        fetchLogs(page); fetchStats();
      } else {
        toast({ title: "Retry failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Retry error", description: err.message, variant: "destructive" });
    } finally { setRetryingId(null); }
  };

  const waStats  = stats?.channelStats?.whatsapp || {};
  const smsStats = stats?.channelStats?.sms || {};
  const emlStats = stats?.channelStats?.email || {};

  const waSent  = (waStats.sent || 0) + (waStats.delivered || 0);
  const smsSent = (smsStats.sent || 0) + (smsStats.delivered || 0);
  const emlSent = (emlStats.sent || 0) + (emlStats.delivered || 0);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={22} className="text-primary" /> Notification Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Delivery history — WhatsApp, Email, SMS · Automatic retry up to 5 times
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchLogs(page); fetchStats(); }} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="space-y-3">
            {/* Today's totals */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Today",  value: stats.sent,         color: "text-gray-900",    bg: "bg-white",       icon: <Activity size={16} className="text-gray-500" /> },
                { label: "Delivered",    value: stats.delivered,    color: "text-emerald-700", bg: "bg-emerald-50",  icon: <CheckCircle2 size={16} className="text-emerald-500" /> },
                { label: "Failed",       value: stats.failed,       color: "text-red-700",     bg: "bg-red-50",      icon: <XCircle size={16} className="text-red-500" /> },
                { label: "Pending",      value: stats.pending,      color: "text-amber-700",   bg: "bg-amber-50",    icon: <Clock size={16} className="text-amber-500" /> },
                { label: "Retry Queue",  value: stats.retryQueue ?? 0, color: "text-indigo-700", bg: "bg-indigo-50", icon: <RotateCcw size={16} className="text-indigo-500" /> },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border border-gray-200 rounded-xl p-3`}>
                  <div className="flex items-center gap-1.5 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Channel breakdown + All time */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ChannelStat icon="💬" label="WhatsApp"  sent={waSent}  failed={waStats.failed || 0} />
              <ChannelStat icon="📱" label="SMS"       sent={smsSent} failed={smsStats.failed || 0} />
              <ChannelStat icon="📧" label="Email"     sent={emlSent} failed={emlStats.failed || 0} />
              <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                <div className="text-2xl">📊</div>
                <div>
                  <div className="text-xs font-semibold text-gray-700">All-Time Total</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-bold text-gray-800">{Number(stats.allTime?.total || 0).toLocaleString()}</span> sent
                    {stats.deliveryRate > 0 && <span className="ml-2 text-emerald-600">· {stats.deliveryRate}%</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              className="text-sm outline-none w-40 placeholder-gray-400"
              placeholder="Booking / phone / name…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.channel} onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}>
            <option value="">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="permanently_failed">Permanently Failed</option>
          </select>
          <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.event} onChange={e => setFilters(f => ({ ...f, event: e.target.value }))}>
            <option value="">All Events</option>
            <option value="new_booking">Booking Submitted</option>
            <option value="booking_approved">Booking Approved</option>
            <option value="payment_received">Payment Received</option>
            <option value="partial_payment">Partial Payment</option>
            <option value="invoice_generated">Invoice Generated</option>
            <option value="agreement_ready">Agreement Ready</option>
            <option value="visa_issued">Visa Issued</option>
            <option value="ticket_issued">Flight Ticket</option>
            <option value="departure_reminder">Departure Reminder</option>
            <option value="payment_due">Payment Reminder</option>
            <option value="daily_admin_report">Daily Report</option>
          </select>
          <input type="date" className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
          {(filters.search || filters.channel || filters.status || filters.event || filters.date) && (
            <Button variant="ghost" size="sm" className="text-gray-500 text-xs"
              onClick={() => setFilters({ channel: "", status: "", event: "", search: "", date: "" })}>
              <Filter size={12} className="mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Log list */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total > 0 ? `${((page-1)*PAGE_SIZE)+1}–${Math.min(page*PAGE_SIZE, total)} of ${total} notifications` : "No results"}</span>
          {stats?.failed > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle size={11} /> {stats.failed} failed today — retrying automatically every 1–120 min
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-indigo-400" />
            <p>Loading notification logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Bell size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-500">No notifications found</p>
            <p className="text-sm mt-1">Try adjusting filters or refresh after a booking event.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <LogRow key={log.id} log={log} onRetry={handleRetry} retrying={retryingId === log.id} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
