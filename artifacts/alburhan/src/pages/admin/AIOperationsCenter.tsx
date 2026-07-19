import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, CheckCircle, Clock, FileText, CreditCard, Users, Plane, Shield, TrendingUp, Brain, ArrowRight } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const SEVERITY_STYLES = {
  critical: { badge: "bg-red-100 text-red-700 border-red-200", card: "border-red-200 bg-red-50/40", icon: "text-red-600 bg-red-100" },
  high: { badge: "bg-orange-100 text-orange-700 border-orange-200", card: "border-orange-200 bg-orange-50/30", icon: "text-orange-600 bg-orange-100" },
  medium: { badge: "bg-amber-100 text-amber-700 border-amber-200", card: "border-amber-200 bg-amber-50/20", icon: "text-amber-600 bg-amber-100" },
  low: { badge: "bg-blue-100 text-blue-700 border-blue-200", card: "border-blue-200 bg-blue-50/20", icon: "text-blue-600 bg-blue-100" },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  visa: <Shield size={15} />,
  payment: <CreditCard size={15} />,
  document: <FileText size={15} />,
  agreement: <FileText size={15} />,
  passport: <Users size={15} />,
  flight: <Plane size={15} />,
  booking: <Clock size={15} />,
};

interface Alert {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  count: number;
  action: string;
  actionHref?: string;
  items?: { label: string; value: string }[];
}

export default function AIOperationsCenter() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/ai-ops`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setAlerts(d.alerts || []);
        setSummary(d.summary || {});
        setLastRefresh(new Date());
      }
    } catch { toast({ title: "Failed to load AI alerts", variant: "destructive" }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = alerts.filter(a =>
    (filterSeverity === "all" || a.severity === filterSeverity) &&
    (filterCategory === "all" || a.category === filterCategory)
  );

  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const highCount = alerts.filter(a => a.severity === "high").length;
  const categories = [...new Set(alerts.map(a => a.category))];

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <Brain size={18} className="text-violet-700" />
              </div>
              AI Operations Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Automated alerts & recommended actions across all modules</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Summary KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Alerts", value: alerts.length, color: "text-foreground", bg: "bg-muted/30" },
            { label: "Critical", value: criticalCount, color: criticalCount > 0 ? "text-red-700" : "text-muted-foreground", bg: criticalCount > 0 ? "bg-red-50" : "bg-muted/30", border: criticalCount > 0 ? "border-red-200" : "" },
            { label: "High Priority", value: highCount, color: highCount > 0 ? "text-orange-700" : "text-muted-foreground", bg: highCount > 0 ? "bg-orange-50" : "bg-muted/30", border: highCount > 0 ? "border-orange-200" : "" },
            { label: "Total Affected", value: summary.totalAffected || 0, color: "text-primary", bg: "bg-primary/5" },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border p-3 text-center ${s.bg} ${s.border || ""}`}>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Health overview */}
        {!loading && alerts.length === 0 && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-8 text-center">
            <CheckCircle size={40} className="text-emerald-600 mx-auto mb-3" />
            <p className="font-bold text-emerald-800 text-lg">All Systems Healthy</p>
            <p className="text-emerald-600 text-sm mt-1">No critical issues detected. Al Burhan operations are running smoothly.</p>
          </div>
        )}

        {/* Filters */}
        {alerts.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {["all", "critical", "high", "medium", "low"].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors capitalize ${filterSeverity === s ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {s === "all" ? `All (${alerts.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${alerts.filter(a => a.severity === s).length})`}
              </button>
            ))}
            <div className="border-l mx-1" />
            {["all", ...categories].map(c => (
              <button key={c} onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors capitalize ${filterCategory === c ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {c === "all" ? "All Categories" : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Alert cards */}
        {loading ? (
          <div className="py-16 text-center space-y-2">
            <Brain size={32} className="mx-auto text-violet-400 animate-pulse" />
            <p className="text-muted-foreground text-sm">AI scanning all modules…</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(alert => {
              const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium;
              return (
                <div key={alert.id} className={`rounded-2xl border p-4 ${s.card}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.icon}`}>
                      {CATEGORY_ICONS[alert.category] || <AlertTriangle size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{alert.title}</p>
                        <Badge variant="outline" className={`text-[10px] py-0 h-4 border capitalize ${s.badge}`}>{alert.severity}</Badge>
                        {alert.count > 0 && (
                          <span className="text-xs font-bold bg-background/80 px-2 py-0.5 rounded-lg border">
                            {alert.count} {alert.count === 1 ? "item" : "items"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{alert.detail}</p>
                      {alert.items && alert.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {alert.items.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-background/60 rounded-lg px-2.5 py-1.5">
                              <span className="text-muted-foreground truncate flex-1">{item.label}</span>
                              <span className="font-semibold flex-shrink-0">{item.value}</span>
                            </div>
                          ))}
                          {alert.items.length > 5 && (
                            <p className="text-xs text-muted-foreground pl-2">+{alert.items.length - 5} more…</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {alert.actionHref ? (
                        <a href={alert.actionHref}
                          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                          {alert.action} <ArrowRight size={12} />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{alert.action}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lastRefresh && (
          <p className="text-center text-xs text-muted-foreground">
            Last scanned: {lastRefresh.toLocaleTimeString("en-IN")} · AI monitors 15 operational dimensions
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
