import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Download, Search, RotateCcw, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  deleted: "bg-red-100 text-red-800",
  restored: "bg-purple-100 text-purple-800",
};

const ENTITY_LABELS: Record<string, string> = {
  expenses: "Expense",
  bookings: "Booking",
  payments: "Payment",
  groups: "Group",
  pilgrims: "Pilgrim",
  users: "User",
  assets: "Asset",
};

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [viewLog, setViewLog] = useState<any | null>(null);

  const [filters, setFilters] = useState({
    entity_table: "", action: "", actor: "",
    from_date: "", to_date: "",
  });
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (filters.entity_table) p.set("entity_table", filters.entity_table);
      if (filters.action) p.set("action", filters.action);
      if (filters.actor) p.set("actor", filters.actor);
      if (filters.from_date) p.set("from_date", filters.from_date);
      if (filters.to_date) p.set("to_date", filters.to_date);

      const r = await fetch(`${API}/api/audit-logs?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setOffset(off);
    } catch (e: any) {
      toast({ title: "Failed to load audit logs", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [filters, toast]);

  useEffect(() => { load(0); }, []);

  function applyFilters() { load(0); }
  function clearFilters() {
    setFilters({ entity_table: "", action: "", actor: "", from_date: "", to_date: "" });
    setTimeout(() => load(0), 50);
  }

  async function restore(log: any) {
    if (!confirm(`Restore this deleted ${ENTITY_LABELS[log.entity_table] || log.entity_table}? It will be recreated from the snapshot.`)) return;
    setRestoring(log.id);
    try {
      const r = await fetch(`${API}/api/audit-logs/${log.id}/restore`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Restore failed");
      }
      toast({ title: `${ENTITY_LABELS[log.entity_table] || log.entity_table} restored successfully` });
      load(offset);
    } catch (e: any) {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    }
    setRestoring(null);
  }

  function exportExcel() {
    const rows = logs.map(l => ({
      "Timestamp": fmtDate(l.created_at),
      "Actor": l.actor_name || "—",
      "Action": l.action,
      "Entity": ENTITY_LABELS[l.entity_table] || l.entity_table,
      "Entity ID": l.entity_id,
      "IP Address": l.ip || "—",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    XLSX.writeFile(wb, `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track every create, update, and delete action across the system.
              {total > 0 && ` Showing ${logs.length} of ${total} entries.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(offset)} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={!logs.length}>
              <Download size={14} className="mr-1.5" />Export Excel
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium">Entity Type</label>
              <select value={filters.entity_table}
                onChange={e => setFilters(f => ({ ...f, entity_table: e.target.value }))}
                className="mt-1 w-full h-8 px-2 rounded border text-sm bg-background">
                <option value="">All</option>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Action</label>
              <select value={filters.action}
                onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                className="mt-1 w-full h-8 px-2 rounded border text-sm bg-background">
                <option value="">All</option>
                <option value="created">Created</option>
                <option value="updated">Updated</option>
                <option value="deleted">Deleted</option>
                <option value="restored">Restored</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Actor (name)</label>
              <div className="relative mt-1">
                <Search size={12} className="absolute left-2 top-2 text-muted-foreground" />
                <Input value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))}
                  placeholder="Search by name" className="h-8 pl-6 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">From Date</label>
              <Input type="date" value={filters.from_date}
                onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))}
                className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium">To Date</label>
              <Input type="date" value={filters.to_date}
                onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))}
                className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-[#0d5040]" onClick={applyFilters}>Apply Filters</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No audit log entries found for the selected filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Timestamp</th>
                      <th className="px-4 py-2.5 text-left">Actor</th>
                      <th className="px-4 py-2.5 text-left">Action</th>
                      <th className="px-4 py-2.5 text-left">Entity</th>
                      <th className="px-4 py-2.5 text-left">Entity ID</th>
                      <th className="px-4 py-2.5 text-left">IP</th>
                      <th className="px-4 py-2.5 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                          {fmtDate(log.created_at)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-sm">{log.actor_name || "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={`text-[10px] border-0 ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {ENTITY_LABELS[log.entity_table] || log.entity_table}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                          {log.entity_id}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.ip || "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            {(log.old_value || log.new_value) && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => setViewLog(log)}>
                                <Eye size={11} className="mr-1" />View
                              </Button>
                            )}
                            {log.action === "deleted" && log.old_value && (
                              <Button size="sm" variant="ghost"
                                className="h-7 text-xs text-purple-700 hover:bg-purple-50"
                                disabled={restoring === log.id}
                                onClick={() => restore(log)}>
                                <RotateCcw size={11} className="mr-1" />
                                {restoring === log.id ? "…" : "Restore"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > LIMIT && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={offset === 0}
                      onClick={() => load(Math.max(0, offset - LIMIT))}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={offset + LIMIT >= total}
                      onClick={() => load(offset + LIMIT)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* View Log Detail Modal */}
      <Dialog open={!!viewLog} onOpenChange={() => setViewLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Detail — {viewLog?.action} on {ENTITY_LABELS[viewLog?.entity_table] || viewLog?.entity_table}</DialogTitle>
          </DialogHeader>
          {viewLog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Actor:</span> <strong>{viewLog.actor_name}</strong></div>
                <div><span className="text-muted-foreground">Timestamp:</span> <strong>{fmtDate(viewLog.created_at)}</strong></div>
                <div><span className="text-muted-foreground">Entity:</span> <strong>{viewLog.entity_table}</strong></div>
                <div><span className="text-muted-foreground">IP:</span> <strong>{viewLog.ip || "—"}</strong></div>
              </div>
              {viewLog.old_value && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Before</p>
                  <pre className="bg-red-50 border border-red-100 rounded p-3 text-xs overflow-auto max-h-48">
                    {JSON.stringify(typeof viewLog.old_value === "string" ? JSON.parse(viewLog.old_value) : viewLog.old_value, null, 2)}
                  </pre>
                </div>
              )}
              {viewLog.new_value && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">After</p>
                  <pre className="bg-green-50 border border-green-100 rounded p-3 text-xs overflow-auto max-h-48">
                    {JSON.stringify(typeof viewLog.new_value === "string" ? JSON.parse(viewLog.new_value) : viewLog.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
