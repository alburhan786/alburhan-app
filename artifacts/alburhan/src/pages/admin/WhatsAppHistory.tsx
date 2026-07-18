import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Download, Search, Filter,
  CheckCircle2, XCircle, Clock, MessageSquare, Send,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EVENT_LABELS: Record<string, string> = {
  new_booking: "Booking Received",
  booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled",
  payment_received: "Payment Received",
  partial_payment: "Partial Payment",
  payment_due: "Payment Due",
  balance_reminder: "Balance Reminder",
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
  bus_assigned: "Bus Assigned",
  medical_emergency: "Medical Emergency",
  custom_admin: "Manual Send",
};

interface LogRow {
  id: string;
  event_type: string;
  recipient: string;
  message?: string;
  status: string;
  sent_at: string;
  created_at: string;
  retry_count: number;
  error_code?: string;
  provider_name?: string;
  http_status?: number;
  booking_id?: string;
  customer_id?: string;
  customer_name?: string;
  booking_number?: string;
  wamid?: string;
  template?: string;
  request_payload?: string;
  provider_response?: string;
  api_endpoint?: string;
}

const STATUS_META: Record<string, { cls: string; icon: typeof CheckCircle2; label: string }> = {
  sent:               { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Sent" },
  delivered:          { cls: "bg-blue-100 text-blue-700 border-blue-200",         icon: CheckCircle2, label: "Delivered" },
  failed:             { cls: "bg-red-100 text-red-700 border-red-200",            icon: XCircle,      label: "Failed" },
  permanently_failed: { cls: "bg-red-200 text-red-800 border-red-300",            icon: XCircle,      label: "Perm. Failed" },
  retrying:           { cls: "bg-orange-100 text-orange-700 border-orange-200",   icon: Clock,        label: "Retrying" },
  pending:            { cls: "bg-amber-100 text-amber-700 border-amber-200",      icon: Clock,        label: "Pending" },
};

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cfg = STATUS_META[s] || { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: MessageSquare, label: status };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cfg.cls}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function parseJson(s: string | undefined | null): Record<string, unknown> | null {
  if (!s) return null;
  if (typeof s === "object") return s as Record<string, unknown>;
  try { return JSON.parse(s); } catch { return null; }
}

function VariableChips({ requestPayload }: { requestPayload?: string }) {
  const rp = parseJson(requestPayload);
  const vars: unknown[] = Array.isArray(rp?.variables) ? (rp!.variables as unknown[]) : [];
  if (!vars.length) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {vars.map((v, i) => (
        <span key={i} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-mono">
          {String(v).substring(0, 30)}
        </span>
      ))}
    </div>
  );
}

function BotBeeResponseSummary({ providerResponse }: { providerResponse?: string }) {
  const pr = parseJson(providerResponse);
  if (!pr) return <span className="text-gray-300 text-xs">—</span>;
  const inner = parseJson(pr.responsePayload as string) || (pr.responsePayload as Record<string, unknown> | null);
  const msg = (inner as any)?.message || (pr as any)?.errorMessage || (inner as any)?.error || "";
  const status = (inner as any)?.status;
  const ok = pr.ok === true;
  return (
    <div className={`text-[11px] max-w-[180px] ${ok ? "text-emerald-700" : "text-red-600"}`}>
      {status !== undefined && <span className="font-mono mr-1">status={status}</span>}
      <span className="break-words">{String(msg).substring(0, 80)}</span>
    </div>
  );
}

function WamidCell({ wamid }: { wamid?: string }) {
  if (!wamid) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <code className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded select-all break-all max-w-[140px] block">
      {wamid.substring(0, 40)}…
    </code>
  );
}

function ExpandedRow({ log }: { log: LogRow }) {
  const pr = parseJson(log.provider_response);
  const rp = parseJson(log.request_payload);
  const inner = parseJson((pr?.responsePayload as string) || "") || (pr?.responsePayload as Record<string, unknown> | null);
  const vars: unknown[] = Array.isArray(rp?.variables) ? (rp!.variables as unknown[]) : [];

  return (
    <tr>
      <td colSpan={10} className="bg-slate-50 border-b px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">WhatsApp Message ID (wamid)</div>
              {log.wamid
                ? <code className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded text-xs select-all break-all block">{log.wamid}</code>
                : <span className="text-gray-400 text-xs">Not captured — send may have failed before BotBee responded</span>
              }
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Variables Sent to BotBee</div>
              {vars.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {vars.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-800 border border-indigo-100 px-2 py-0.5 rounded font-mono">
                      <span className="text-indigo-400">{`{{${i + 1}}}`}</span>
                      {String(v)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-400 text-xs">No variables (or session text message)</span>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Template ID</div>
              <span className="font-mono text-xs text-gray-700">{log.template || (rp?.template_id as string) || (rp?.template_name as string) || "—"}</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Endpoint</div>
              <span className="font-mono text-xs text-gray-500">{log.api_endpoint || (pr?.endpoint as string) || "—"}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">BotBee Response</div>
              <pre className="text-[11px] bg-white border rounded p-2 overflow-auto max-h-32 text-gray-700 whitespace-pre-wrap break-all">
                {inner ? JSON.stringify(inner, null, 2) : (pr ? JSON.stringify(pr, null, 2) : "—")}
              </pre>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {log.booking_number && (
                <span>Booking: <a href={`/admin/bookings/${log.booking_id}`} className="text-indigo-600 hover:underline font-mono">{log.booking_number}</a></span>
              )}
              {log.customer_name && <span>Customer: <span className="text-gray-700">{log.customer_name}</span></span>}
              {log.http_status && <span>HTTP: <span className="font-mono text-gray-700">{log.http_status}</span></span>}
              {log.error_code && <span className="text-red-600">Error: {log.error_code}</span>}
              <span>Log ID: <code className="text-gray-600">{log.id}</code></span>
            </div>
          </div>
        </div>
        {log.message && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message Preview</div>
            <pre className="text-[11px] bg-white border rounded p-2 text-gray-600 whitespace-pre-wrap max-h-24 overflow-auto">{log.message}</pre>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function WhatsAppHistory() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const [filterStatus, setFilterStatus] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const offset = (p - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        channel: "whatsapp",
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (filterStatus) params.set("status", filterStatus);
      if (filterEvent)  params.set("event_type", filterEvent);
      if (filterSearch) params.set("search", filterSearch);
      if (filterDate)   params.set("date", filterDate);

      const r = await fetch(`${API}/api/notification-center/logs?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      toast({ title: "Failed to load logs", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [filterStatus, filterEvent, filterSearch, filterDate, toast]);

  useEffect(() => { fetchLogs(1); setPage(1); }, []);

  function applyFilters() { setPage(1); fetchLogs(1); }
  function clearFilters() {
    setFilterStatus(""); setFilterEvent(""); setFilterSearch(""); setFilterDate("");
    setPage(1);
    setTimeout(() => fetchLogs(1), 50);
  }

  function exportCSV() {
    const headers = ["ID","Event","Customer","Phone","Template","Variables","HTTP","wamid","Status","Timestamp"];
    const rows = logs.map(l => {
      const rp = parseJson(l.request_payload);
      const vars = Array.isArray(rp?.variables) ? (rp!.variables as unknown[]).join(" | ") : "";
      return [
        l.id, EVENT_LABELS[l.event_type] || l.event_type,
        l.customer_name || "", l.recipient,
        l.template || "", vars,
        l.http_status || "", l.wamid || "",
        l.status, new Date(l.sent_at || l.created_at).toLocaleString("en-IN"),
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, "''")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `whatsapp-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const sentCount = logs.filter(l => l.status === "sent" || l.status === "delivered").length;
  const failedCount = logs.filter(l => l.status === "failed" || l.status === "permanently_failed").length;
  const wamidCount = logs.filter(l => !!l.wamid).length;

  return (
    <AdminLayout>
      <div className="p-6 max-w-full mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp Notification Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">Every WhatsApp send — event, customer, phone, template, variables, BotBee response, wamid</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download size={14} className="mr-2" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading}>
              <RefreshCw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total (this page)", value: logs.length, icon: Send, color: "bg-indigo-500" },
            { label: "Sent", value: sentCount, icon: CheckCircle2, color: "bg-emerald-500" },
            { label: "Failed", value: failedCount, icon: XCircle, color: "bg-red-500" },
            { label: "With wamid", value: wamidCount, icon: MessageSquare, color: "bg-violet-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Search phone, booking…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
              />
            </div>
            <select className="px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="permanently_failed">Perm. Failed</option>
              <option value="retrying">Retrying</option>
              <option value="pending">Pending</option>
            </select>
            <select className="px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 max-w-[200px]" value={filterEvent} onChange={e => setFilterEvent(e.target.value)}>
              <option value="">All Events</option>
              {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            <Button size="sm" onClick={applyFilters} disabled={loading}><Filter size={13} className="mr-1.5" /> Apply</Button>
            {(filterStatus || filterEvent || filterSearch || filterDate) && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">Clear</Button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" />
              <span className="text-sm text-gray-500">Loading…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <MessageSquare size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No WhatsApp logs found</p>
              <p className="text-xs mt-1">Approve a booking to trigger the first notification</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-5"></th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Template</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Variables</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">HTTP</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">BotBee Response</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">wamid</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => {
                    const isExpanded = expandedId === log.id;
                    const ts = log.sent_at || log.created_at;
                    const rp = parseJson(log.request_payload);
                    const templateId = log.template || (rp?.template_id as string) || (rp?.template_name as string) || "—";
                    return (
                      <>
                        <tr
                          key={log.id}
                          className={`hover:bg-gray-50/60 transition-colors cursor-pointer ${isExpanded ? "bg-indigo-50/30" : ""}`}
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <td className="px-3 py-3 text-gray-300">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-gray-900 text-xs">{EVENT_LABELS[log.event_type] || log.event_type}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{log.event_type}</div>
                            {log.booking_number && (
                              <div className="text-[10px] text-indigo-500 font-mono">{log.booking_number}</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-700 max-w-[120px] truncate">
                            {log.customer_name || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                            {log.recipient}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-gray-600">
                            {templateId !== "—"
                              ? <span className="bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded text-[10px]">{templateId}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-3 max-w-[160px]">
                            <VariableChips requestPayload={log.request_payload} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {log.http_status
                              ? <span className={`text-xs font-mono font-bold ${log.http_status === 200 ? "text-emerald-600" : "text-red-500"}`}>{log.http_status}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-3 max-w-[180px]">
                            <BotBeeResponseSummary providerResponse={log.provider_response} />
                          </td>
                          <td className="px-3 py-3 max-w-[150px]">
                            <WamidCell wamid={log.wamid} />
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={log.status} />
                            {log.error_code && (
                              <div className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1">
                                <AlertTriangle size={9} /> {log.error_code}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {ts ? new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                          </td>
                        </tr>
                        {isExpanded && <ExpandedRow key={`exp-${log.id}`} log={log} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} · {total.toLocaleString()} total WhatsApp logs
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchLogs(p); }}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-xs font-medium text-gray-600">{page}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchLogs(p); }}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <div className="font-semibold text-amber-800 mb-2">📋 How to verify a notification was sent</div>
          <ol className="list-decimal ml-4 space-y-1 text-amber-700 text-xs">
            <li>Approve a booking from the ERP admin panel</li>
            <li>Refresh this page — a new row should appear within seconds</li>
            <li>Status should show <strong>Sent</strong> (green)</li>
            <li>The <strong>wamid</strong> column should contain a valid <code>wamid.HBg…</code> string (confirms Meta accepted the message)</li>
            <li>If wamid is missing, expand the row to see the full BotBee error</li>
            <li>If the row is missing entirely, check the VPS server logs for <code>[workflow]</code> and <code>[notifEngine]</code> lines</li>
          </ol>
        </div>
      </div>
    </AdminLayout>
  );
}
