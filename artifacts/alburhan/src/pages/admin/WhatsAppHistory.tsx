import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, RotateCcw, Download, Search, Filter,
  CheckCircle2, XCircle, Clock, MessageSquare, Send,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EVENT_LABELS: Record<string, string> = {
  new_booking: "Booking Received",
  booking_approved: "Booking Approved",
  payment_received: "Payment Received",
  partial_payment: "Partial Payment",
  invoice_generated: "Invoice Ready",
  invoice_ready: "Invoice Ready",
  agreement_ready: "Agreement Ready",
  agreement_signed: "Agreement Signed",
  visa_approved: "Visa Issued",
  visa_ready: "Visa Issued",
  visa_issued: "Visa Issued",
  ticket_issued: "Ticket Issued",
  flight_assigned: "Flight Reminder",
  flight_reminder: "Flight Reminder",
  return_reminder: "Return Flight Reminder",
  return_flight_reminder: "Return Flight",
  room_assigned: "Room Allocation",
  room_allocation: "Room Allocation",
  group_orientation: "Group Orientation",
  departure_reminder: "Departure Reminder",
  welcome_saudi: "Welcome Saudi",
  arrival_india: "Arrival India",
  hajj_mubarak: "Hajj Mubarak",
  hajj_package_launch: "Package Launch",
  balance_reminder: "Balance Reminder",
  payment_due: "Payment Due",
  bus_assigned: "Bus Assigned",
  medical_emergency: "Medical Emergency",
  custom_admin: "Manual Send",
};

const TEMPLATE_EVENTS = [
  "new_booking","booking_approved","payment_received","partial_payment",
  "invoice_generated","invoice_ready","agreement_ready","agreement_signed",
  "visa_approved","visa_ready","visa_issued","ticket_issued",
  "flight_assigned","flight_reminder","return_reminder","return_flight_reminder",
  "room_assigned","room_allocation","group_orientation","departure_reminder",
  "welcome_saudi","arrival_india","hajj_mubarak","hajj_package_launch",
  "balance_reminder","payment_due","bus_assigned","medical_emergency","custom_admin",
];

interface DeliveryLog {
  id: string;
  event_type: string;
  recipient: string;
  message?: string;
  status: string;
  sent_at: string;
  retry_count: number;
  error_code?: string;
  provider_name?: string;
  http_status?: number;
  booking_id?: string;
  customer_id?: string;
}

interface Stats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cfg: Record<string, { cls: string; icon: typeof CheckCircle2 }> = {
    sent:      { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    delivered: { cls: "bg-blue-100 text-blue-700 border-blue-200",         icon: CheckCircle2 },
    read:      { cls: "bg-purple-100 text-purple-700 border-purple-200",   icon: CheckCircle2 },
    failed:    { cls: "bg-red-100 text-red-700 border-red-200",            icon: XCircle },
    pending:   { cls: "bg-amber-100 text-amber-700 border-amber-200",      icon: Clock },
  };
  const c = cfg[s] || { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: MessageSquare };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${c.cls}`}>
      <Icon size={10} />
      {status?.toUpperCase()}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
      </div>
    </div>
  );
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

export default function WhatsAppHistory() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, sent: 0, delivered: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  const [filterStatus, setFilterStatus] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), limit: String(PAGE_SIZE), channel: "whatsapp",
      });
      if (filterStatus) params.set("status", filterStatus);
      if (filterEvent)  params.set("event", filterEvent);
      if (filterSearch) params.set("search", filterSearch);
      if (filterDate)   params.set("date", filterDate);

      const r = await fetch(`${API}/api/whatsapp/delivery-logs?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setLogs(data.logs || []);
      setTotalCount(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (e: any) {
      toast({ title: "Failed to load logs", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [filterStatus, filterEvent, filterSearch, filterDate, toast]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/whatsapp/analytics`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.totals) {
        setStats({
          total:     parseInt(data.totals.total) || 0,
          sent:      parseInt(data.totals.sent)  || 0,
          delivered: 0,
          failed:    parseInt(data.totals.failed)   || 0,
          pending:   parseInt(data.totals.pending)  || 0,
        });
      }
    } catch { }
  }, []);

  useEffect(() => { fetchLogs(1); fetchStats(); }, []);
  useEffect(() => { fetchLogs(page); }, [page]);

  function applyFilters() { setPage(1); fetchLogs(1); }

  function clearFilters() {
    setFilterStatus(""); setFilterEvent(""); setFilterSearch(""); setFilterDate("");
    setPage(1);
    setTimeout(() => fetchLogs(1), 50);
  }

  async function retryLog(logId: string) {
    setRetryingId(logId);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry/${logId}`, { method: "POST" });
      const data = await r.json();
      toast({ title: data.ok ? "Retried" : "Retry failed", description: data.ok ? "Message resent" : data.errorMessage, variant: data.ok ? "default" : "destructive" });
      if (data.ok) fetchLogs(page);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setRetryingId(null); }
  }

  async function retryAll() {
    setRetryingAll(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/retry-all`, { method: "POST" });
      const data = await r.json();
      toast({ title: "Retry All Done", description: `Retried: ${data.retried || 0}, succeeded: ${data.succeeded || 0}` });
      fetchLogs(page);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setRetryingAll(false); }
  }

  function exportCSV() {
    const headers = ["ID","Event","Recipient","Status","Sent At","Retry Count","Error"];
    const rows = logs.map(l => [
      l.id, l.event_type, maskPhone(l.recipient), l.status,
      new Date(l.sent_at).toLocaleString("en-IN"),
      l.retry_count, l.error_code || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,"''")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `whatsapp-history-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const failedCount = logs.filter(l => l.status === "failed").length;

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp Message History</h1>
            <p className="text-sm text-gray-500 mt-0.5">All WhatsApp template sends, delivery status, and retry log</p>
          </div>
          <div className="flex items-center gap-2">
            {failedCount > 0 && can("settings", "edit") && (
              <Button variant="outline" size="sm" onClick={retryAll} disabled={retryingAll} className="text-red-600 border-red-200 hover:bg-red-50">
                {retryingAll ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RotateCcw size={14} className="mr-2" />}
                Retry All Failed
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download size={14} className="mr-2" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchLogs(page); fetchStats(); }} disabled={loading}>
              <RefreshCw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Sent" value={stats.total} icon={Send} color="bg-indigo-500" />
          <StatCard label="Delivered" value={stats.sent} icon={CheckCircle2} color="bg-emerald-500" />
          <StatCard label="Failed" value={stats.failed} icon={XCircle} color="bg-red-500" />
          <StatCard label="Pending" value={stats.pending} icon={Clock} color="bg-amber-500" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Search phone number..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
              />
            </div>
            <select
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <select
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white max-w-[200px]"
              value={filterEvent}
              onChange={e => setFilterEvent(e.target.value)}
            >
              <option value="">All Templates</option>
              {TEMPLATE_EVENTS.map(ev => (
                <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>
              ))}
            </select>
            <input
              type="date"
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
            />
            <Button size="sm" onClick={applyFilters} disabled={loading}>
              <Filter size={13} className="mr-1.5" /> Apply
            </Button>
            {(filterStatus || filterEvent || filterSearch || filterDate) && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" />
              <span className="text-sm text-gray-500">Loading messages…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <MessageSquare size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No messages found</p>
              <p className="text-xs mt-1">Adjust filters or send a WhatsApp template</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Template</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent At</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Retries</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-xs">
                          {EVENT_LABELS[log.event_type] || log.event_type}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{log.event_type}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-600">{maskPhone(log.recipient)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                        {log.error_code && (
                          <div className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                            <AlertTriangle size={9} /> {log.error_code}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {log.retry_count > 0 ? (
                          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-semibold">
                            {log.retry_count}×
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {log.status === "failed" && can("settings", "edit") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-indigo-600 hover:bg-indigo-50"
                            onClick={() => retryLog(log.id)}
                            disabled={retryingId === log.id}
                          >
                            {retryingId === log.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <><RotateCcw size={12} className="mr-1" />Retry</>
                            }
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} · {totalCount.toLocaleString()} total messages
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-xs font-medium text-gray-600">{page}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Template Reference */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">17 Approved BotBee Templates</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {[
              "booking_receive","booking_approved","payment_received","invoice_ready",
              "agreement_ready","agreement_signed","visa_issued","ticket_issued",
              "flight_reminder","return_flight_reminder","room_allocation","group_orientation",
              "departure_reminder","welcome_saudi","arrival_india","hajj_mubarak","hajj_package_launch",
            ].map(slug => (
              <div key={slug} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] font-mono text-emerald-800 truncate">{slug}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
