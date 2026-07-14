// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  Bell, CheckCircle2, XCircle, Clock, RefreshCw, Send, MessageSquare,
  Mail, Smartphone, ChevronDown, ChevronRight, Search, Filter, RotateCcw,
  Loader2, Eye, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

// ── ABT Template map (mirrors botbee.ts ABT_TEMPLATES) ────────────────────────
const ABT_TEMPLATES: Record<string, { id: string; label: string }> = {
  bookingsubmitted:        { id: "407645", label: "Booking Submitted" },
  paymentreceived:         { id: "407646", label: "Payment Received" },
  pending_payment_reminder:{ id: "407648", label: "Pending Payment Reminder" },
  approve:                 { id: "407642", label: "Booking Approved" },
  departure_reminder:      { id: "407664", label: "Departure Reminder" },
  visa_issued:             { id: "407667", label: "Visa Issued" },
  flight:                  { id: "361654", label: "Flight Ticket" },
};

interface NotifLog {
  id: string;
  event_type: string;
  channel: string;
  recipient: string;
  message?: string;
  status: string;
  sent_at: string;
  retry_count: number;
  error_code?: string;
  error_message?: string;
  provider_name?: string;
  http_status?: number;
  provider_response?: any;
  request_payload?: any;
  booking_id?: string;
  customer_id?: string;
  booking_number?: string;
  customer_name?: string;
}

interface LogsResponse {
  logs: NotifLog[];
  total: number;
  page: number;
  pages: number;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp:  <MessageSquare size={13} className="text-emerald-600" />,
  email:     <Mail size={13} className="text-blue-600" />,
  sms:       <Smartphone size={13} className="text-purple-600" />,
};

const STATUS_COLORS: Record<string, string> = {
  sent:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered: "bg-blue-100 text-blue-700 border-blue-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
};

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function TemplatePill({ message }: { message?: string }) {
  if (!message) return null;
  const m = message.match(/Template:\s*(\S+)/i);
  const name = m?.[1];
  if (!name) return null;
  const info = ABT_TEMPLATES[name];
  if (!info) return <span className="text-[10px] font-mono text-gray-500">{name}</span>;
  return (
    <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-semibold">
      {info.label} <span className="opacity-60">#{info.id}</span>
    </span>
  );
}

function LogRow({ log, onRetry, retrying }: {
  log: NotifLog;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const resp = log.provider_response;
  let respStr = "";
  try { respStr = typeof resp === "string" ? resp : JSON.stringify(resp, null, 2); } catch { respStr = String(resp); }

  return (
    <div className={`rounded-lg border text-sm transition-all ${log.status === "failed" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"}`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Channel icon */}
        <span className="shrink-0">{CHANNEL_ICONS[log.channel] || <Bell size={13} />}</span>
        {/* Status badge */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-600"}`}>
          {log.status.toUpperCase()}
        </span>
        {/* Event */}
        <span className="font-medium text-gray-800 truncate max-w-[160px]">
          {log.event_type?.replace(/_/g, " ")}
        </span>
        {/* Template pill */}
        <TemplatePill message={log.message} />
        {/* Recipient */}
        <span className="text-gray-500 truncate flex-1 min-w-0 text-[11px]">{log.recipient}</span>
        {log.booking_number && (
          <span className="text-[10px] text-gray-400 shrink-0">{log.booking_number}</span>
        )}
        {/* Time */}
        <span className="text-[10px] text-gray-400 shrink-0">{fmt(log.sent_at)}</span>
        {/* Retry */}
        {log.status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] border-red-300 text-red-600 hover:bg-red-50 shrink-0"
            onClick={e => { e.stopPropagation(); onRetry(log.id); }}
            disabled={retrying}
          >
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
            {log.retry_count !== undefined && <span><b>Retries:</b> {log.retry_count}</span>}
            {log.error_code && <span className="col-span-2 text-red-600"><b>Error Code:</b> {log.error_code}</span>}
          </div>
          {log.message && (
            <div className="text-[11px] text-gray-700 bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap break-all">
              {log.message}
            </div>
          )}
          {respStr && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-indigo-600 font-semibold">BotBee Response</summary>
              <pre className="mt-1 bg-gray-800 text-green-300 rounded p-2 overflow-auto max-h-36 text-[10px]">{respStr}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 30;

export default function NotificationCenter() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    channel: "", status: "", event: "", search: "",
  });

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), limit: String(PAGE_SIZE), channel: "whatsapp,email,sms",
      });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status)  params.set("status", filters.status);
      if (filters.event)   params.set("event", filters.event);
      if (filters.search)  params.set("search", filters.search);

      const res = await fetch(`${API}/api/whatsapp/delivery-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LogsResponse = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ title: "Failed to load logs", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { setPage(1); fetchLogs(1); }, [filters]);
  useEffect(() => { fetchLogs(page); }, [page]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch(`${API}/api/whatsapp/retry/${id}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.ok || res.ok) {
        toast({ title: "Retried", description: "Notification retried successfully." });
        fetchLogs(page);
      } else {
        toast({ title: "Retry failed", description: data.message || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Retry error", description: err.message, variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const failedCount = logs.filter(l => l.status === "failed").length;
  const sentCount   = logs.filter(l => l.status === "sent" || l.status === "delivered").length;

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
              Full delivery history — WhatsApp, Email, SMS across all 7 ABT templates
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* ABT Template Quick Reference */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs font-bold text-indigo-700 mb-2 uppercase tracking-wide">Active BotBee Templates (July 2026)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ABT_TEMPLATES).map(([name, info]) => (
              <span key={name} className="text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-1 rounded-lg font-medium">
                {info.label} <span className="text-indigo-400">#{info.id}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total (this page: {logs.length})</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{sentCount}</div>
            <div className="text-xs text-emerald-600 mt-0.5">Sent / Delivered</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{failedCount}</div>
            <div className="text-xs text-red-600 mt-0.5">Failed (retryable)</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              className="text-sm outline-none w-36 placeholder-gray-400"
              placeholder="Search booking / phone…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.channel}
            onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}
          >
            <option value="">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            value={filters.event}
            onChange={e => setFilters(f => ({ ...f, event: e.target.value }))}
          >
            <option value="">All Events</option>
            <option value="new_booking">Booking Submitted</option>
            <option value="payment_received">Payment Received</option>
            <option value="booking_approved">Booking Approved</option>
            <option value="departure_reminder">Departure Reminder</option>
            <option value="visa_ready">Visa Issued</option>
            <option value="ticket_issued">Flight Ticket</option>
            <option value="payment_due">Payment Reminder</option>
          </select>
        </div>

        {/* Log list */}
        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-indigo-400" />
            <p>Loading notification logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Bell size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-500">No notifications found</p>
            <p className="text-sm mt-1">Try adjusting filters or check again after a booking is made.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <LogRow
                key={log.id}
                log={log}
                onRetry={handleRetry}
                retrying={retryingId === log.id}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
