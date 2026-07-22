import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw, User, Clock, Filter, Search, Shield, FileText } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function ActivityLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const l = await fetch(`${API}/api/audit-logs?limit=200`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setLogs(Array.isArray(l) ? l : (l?.logs || []));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = new Date().toDateString();
  const todayLogs = logs.filter(l => new Date(l.created_at || l.timestamp || 0).toDateString() === today);

  const ACTION_COLORS: Record<string, string> = {
    create: "bg-emerald-100 text-emerald-700",
    update: "bg-blue-100 text-blue-700",
    delete: "bg-red-100 text-red-700",
    login: "bg-violet-100 text-violet-700",
    logout: "bg-gray-100 text-gray-600",
    view: "bg-amber-100 text-amber-700",
    approve: "bg-emerald-100 text-emerald-700",
    reject: "bg-red-100 text-red-700",
  };

  const actionMap: Record<string, number> = {};
  for (const l of logs) {
    const a = l.action || l.event_type || "view";
    actionMap[a] = (actionMap[a] || 0) + 1;
  }

  const filtered = filter === "all" ? logs : logs.filter(l => (l.action || l.event_type || "").toLowerCase().includes(filter));

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Activity size={18} className="text-primary" /></div>
              Activity Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">User activity stream — all admin and customer actions with timestamps</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/audit-logs"><Button size="sm" variant="outline" className="gap-1.5"><FileText size={13} /> Audit Logs</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Activity, label: "Total Events",    val: logs.length,       color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Clock,    label: "Today",           val: todayLogs.length,  color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: User,     label: "Action Types",    val: Object.keys(actionMap).length, color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: Shield,   label: "Top Action",      val: Object.entries(actionMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—", isStr:true, color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-sm">Activity Stream</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "create", "update", "delete", "login", "approve"].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:border-primary/40"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity logs found</p>
              <p className="text-xs mt-1">Activity is recorded as users interact with the system</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y">
              {filtered.slice(0, 20).map((l, i) => (
                <div key={i} className="py-2.5 flex items-start gap-3 hover:bg-muted/20 px-1 rounded">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{l.user_name || l.admin_name || l.performed_by || "System"}</span>
                      <Badge variant="outline" className={`text-xs ${ACTION_COLORS[l.action || l.event_type || "view"] || "bg-gray-100 text-gray-600"}`}>
                        {l.action || l.event_type || "action"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.description || l.details || l.resource || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                    <Clock size={10} />{l.created_at ? new Date(l.created_at).toLocaleTimeString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
