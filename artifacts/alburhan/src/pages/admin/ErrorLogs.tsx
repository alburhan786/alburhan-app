import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = import.meta.env.VITE_API_URL || "";

type ErrorLog = {
  id: string; method: string; path: string; status_code: number;
  duration_ms: number; user_id: string | null; user_role: string | null;
  ip: string | null; error_msg: string | null; stack_trace: string | null;
  response_body: string | null; created_at: string;
};

type Summary = {
  total: number; server_errors: number; client_errors: number;
  last_hour: number; last_24h: number; last_error_at: string | null;
};

function StatusCodeBadge({ code }: { code: number }) {
  if (code >= 500) return <Badge className="bg-red-100 text-red-800 border-red-200 font-mono">{code}</Badge>;
  if (code >= 400) return <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-mono">{code}</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 font-mono">{code}</Badge>;
}

export default function ErrorLogs() {
  const { can, isSuper } = usePermissions();
  const { toast } = useToast();
  const [logs,    setLogs]    = useState<ErrorLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topEndpoints, setTopEndpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pathFilter, setPathFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [total, setTotal]   = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (pathFilter.trim())   params.set("path",   pathFilter.trim());
      if (statusFilter.trim()) params.set("status", statusFilter.trim());

      const [logsR, sumR] = await Promise.all([
        fetch(`${API}/api/admin/error-logs?${params}`, { credentials: "include" }),
        fetch(`${API}/api/admin/error-logs/summary`,   { credentials: "include" }),
      ]);
      const logsData = await logsR.json();
      const sumData  = await sumR.json();

      setLogs(logsData.logs || []);
      setTotal(logsData.total || 0);
      setSummary(sumData.summary || null);
      setTopEndpoints(sumData.topEndpoints || []);
      setOffset(off);
    } catch {}
    setLoading(false);
  }, [pathFilter, statusFilter]);

  useEffect(() => { load(0); }, [load]);

  const clearLogs = async (days: number) => {
    if (!confirm(`Delete error logs older than ${days} days?`)) return;
    try {
      const r = await fetch(`${API}/api/admin/error-logs?older_than_days=${days}`, { method: "DELETE", credentials: "include" });
      const d = await r.json();
      toast({ title: "Logs cleared", description: d.message });
      load(0);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (!isSuper && !can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  const methodColor = (m: string) =>
    m === "GET" ? "text-blue-600" : m === "POST" ? "text-green-600" :
    m === "PUT" || m === "PATCH" ? "text-yellow-600" : m === "DELETE" ? "text-red-600" : "text-gray-600";

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production Error Logs</h1>
            <p className="text-gray-500 text-sm mt-1">All 4xx/5xx API errors — endpoint, status, reason, timestamp</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => load(0)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2">
              🔄 Refresh
            </Button>
            <Button onClick={() => clearLogs(7)} className="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-2">
              🗑 Clear &gt;7 Days
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Last Hour",    value: summary.last_hour,    color: summary.last_hour   > 10 ? "red" : "gray" },
              { label: "Last 24h",     value: summary.last_24h,     color: summary.last_24h    > 50 ? "red" : "orange" },
              { label: "Server Errors",value: summary.server_errors,color: summary.server_errors> 0 ? "red" : "green" },
              { label: "Client Errors",value: summary.client_errors,color: "orange" },
              { label: "Total (7d)",   value: summary.total,        color: "gray" },
            ].map(card => (
              <div key={card.label} className={`rounded-xl border p-4 text-center ${
                card.color === "red" ? "border-red-200 bg-red-50" :
                card.color === "orange" ? "border-orange-200 bg-orange-50" :
                card.color === "green" ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
              }`}>
                <div className={`text-2xl font-bold ${
                  card.color === "red" ? "text-red-700" :
                  card.color === "orange" ? "text-orange-700" :
                  card.color === "green" ? "text-green-700" : "text-gray-700"
                }`}>{card.value}</div>
                <div className="text-xs text-gray-500 mt-1">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top failing endpoints */}
        {topEndpoints.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="font-semibold text-gray-700 mb-3 text-sm">Top Failing Endpoints (Last 24h)</div>
            <div className="space-y-1.5">
              {topEndpoints.slice(0, 5).map((ep, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <StatusCodeBadge code={ep.max_status} />
                  <span className="font-mono text-xs text-gray-700 flex-1 truncate">{ep.path}</span>
                  <span className="text-gray-400 text-xs">{ep.cnt}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <Input value={pathFilter} onChange={e => setPathFilter(e.target.value)} placeholder="Filter by path..." className="w-56 text-sm" />
          <Input value={statusFilter} onChange={e => setStatusFilter(e.target.value)} placeholder="Status code (e.g. 500)" className="w-40 text-sm" />
          <Button onClick={() => load(0)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2">Filter</Button>
          <span className="text-sm text-gray-400">{total} total errors</span>
        </div>

        {/* Log Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-gray-500">No errors found — system is clean!</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Endpoint</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => (
                    <>
                      <tr
                        key={log.id}
                        className={`hover:bg-gray-50 cursor-pointer ${log.status_code >= 500 ? "bg-red-50/50" : ""}`}
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("en-IN", { hour12: false })}
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs font-bold ${methodColor(log.method)}`}>{log.method}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">{log.path}</td>
                        <td className="px-4 py-3"><StatusCodeBadge code={log.status_code} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{log.duration_ms}ms</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{log.user_role || "anon"}</td>
                        <td className="px-4 py-3 text-xs text-blue-500">{expanded === log.id ? "▲ Hide" : "▼ Show"}</td>
                      </tr>
                      {expanded === log.id && (
                        <tr key={`${log.id}-detail`} className="bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-2 text-xs font-mono">
                              {log.error_msg && (
                                <div>
                                  <span className="text-red-600 font-bold">Error: </span>
                                  <span className="text-gray-700">{log.error_msg}</span>
                                </div>
                              )}
                              {log.response_body && (
                                <div>
                                  <span className="text-gray-500 font-bold">Response: </span>
                                  <span className="text-gray-600 break-all">{log.response_body}</span>
                                </div>
                              )}
                              {log.ip && (
                                <div><span className="text-gray-400">IP: </span><span className="text-gray-600">{log.ip}</span></div>
                              )}
                              {log.stack_trace && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Stack trace</summary>
                                  <pre className="mt-1 text-red-700 bg-red-50 rounded p-2 overflow-x-auto text-xs whitespace-pre-wrap">{log.stack_trace}</pre>
                                </details>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-center gap-3">
            <Button disabled={offset === 0} onClick={() => load(offset - LIMIT)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2">← Prev</Button>
            <span className="text-sm text-gray-500">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
            <Button disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2">Next →</Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
