import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Database, Server, Activity, FileText, Shield, Zap } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const STATUS_STYLE = {
  healthy: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle size={14} className="text-emerald-600" /> },
  warning: { badge: "bg-amber-100 text-amber-700 border-amber-200", icon: <AlertTriangle size={14} className="text-amber-600" /> },
  error: { badge: "bg-red-100 text-red-700 border-red-200", icon: <XCircle size={14} className="text-red-600" /> },
};

function ModuleRow({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const s = STATUS_STYLE[status as keyof typeof STATUS_STYLE] || STATUS_STYLE.healthy;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-muted/10 transition-colors">
      {s.icon}
      <span className="flex-1 text-sm font-medium">{name}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      <Badge variant="outline" className={`text-[10px] capitalize ${s.badge}`}>{status}</Badge>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? "#22c55e" : score >= 75 ? "#f59e0b" : "#ef4444";
  const r = 52, stroke = 8, circ = 2 * Math.PI * r;
  const dash = circ * (1 - score / 100);
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="130" height="130" className="-rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold font-mono" style={{ color }}>{score}</p>
        <p className="text-xs text-muted-foreground">/ 100</p>
      </div>
    </div>
  );
}

export default function ProductionReport() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/production-report`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const d = data || {};
  const score = d.score || 0;
  const generatedAt = d.generatedAt ? new Date(d.generatedAt) : new Date();

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Shield size={18} className="text-emerald-700" />
              </div>
              Production Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Generated: {generatedAt.toLocaleString("en-IN")}
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Re-run
          </Button>
        </div>

        {loading && !data ? (
          <div className="py-20 text-center">
            <Activity size={32} className="mx-auto mb-2 animate-pulse text-emerald-400" />
            <p className="text-muted-foreground">Running full system scan…</p>
          </div>
        ) : (
          <>
            {/* Score + Summary */}
            <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-6 flex flex-col sm:flex-row items-center gap-6">
              <ScoreRing score={score} />
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-xl font-bold">
                    {score >= 95 ? "🟢 Production Ready" : score >= 80 ? "🟡 Mostly Ready" : "🔴 Needs Attention"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Al Burhan Tours & Travels ERP Platform</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: "Total Modules", value: d.totalModules || 0 },
                    { label: "API Endpoints", value: d.totalApis || 0 },
                    { label: "DB Tables", value: d.totalTables || 0 },
                    { label: "Total Customers", value: d.totalCustomers || 0 },
                    { label: "Total Bookings", value: d.totalBookings || 0 },
                    { label: "Notifications (30d)", value: d.totalNotifications || 0 },
                  ].map(s => (
                    <div key={s.label} className="bg-white/70 rounded-xl p-2 text-center border">
                      <p className="text-lg font-bold font-mono text-primary">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Database Tables */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Database size={14} /> Database Tables
              </h2>
              <div className="rounded-2xl border overflow-hidden">
                {(d.tables || []).map((t: any) => (
                  <ModuleRow key={t.name} name={t.name} status={t.status} detail={t.count !== undefined ? `${t.count} rows` : undefined} />
                ))}
              </div>
            </div>

            {/* Module Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Server size={14} /> Admin Modules
                </h2>
                <div className="rounded-2xl border overflow-hidden">
                  {(d.adminModules || []).map((m: any) => (
                    <ModuleRow key={m.name} name={m.name} status={m.status} detail={m.detail} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} /> API Status
                </h2>
                <div className="rounded-2xl border overflow-hidden">
                  {(d.apiChecks || []).map((a: any) => (
                    <ModuleRow key={a.name} name={a.name} status={a.status} detail={a.detail} />
                  ))}
                </div>
              </div>
            </div>

            {/* Notification health */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} /> Notification Health (30 Days)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(d.notifHealth || []).map((n: any) => {
                  const rate = n.total > 0 ? Math.round((n.sent / n.total) * 100) : 0;
                  return (
                    <div key={n.channel} className={`rounded-2xl border p-4 text-center ${rate >= 90 ? "bg-emerald-50 border-emerald-200" : rate >= 70 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{n.channel}</p>
                      <p className={`text-3xl font-bold font-mono ${rate >= 90 ? "text-emerald-700" : rate >= 70 ? "text-amber-700" : "text-red-700"}`}>{rate}%</p>
                      <p className="text-xs text-muted-foreground mt-1">{n.sent} of {n.total} delivered</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Performance */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={14} /> Performance Metrics
              </h2>
              <div className="rounded-2xl border overflow-hidden">
                {(d.performance || []).map((p: any) => (
                  <ModuleRow key={p.name} name={p.name} status={p.status} detail={p.detail} />
                ))}
              </div>
            </div>

            {/* Issues */}
            {(d.issues || []).length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
                <h2 className="text-sm font-bold text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={15} /> Items Requiring Attention
                </h2>
                <ul className="space-y-1">
                  {d.issues.map((issue: string, i: number) => (
                    <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                      <span className="mt-0.5">•</span>{issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Certification */}
            {score >= 90 && (
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
                <CheckCircle size={40} className="text-emerald-600 mx-auto mb-3" />
                <p className="text-xl font-bold text-emerald-800">✅ Enterprise Production Certified</p>
                <p className="text-emerald-700 text-sm mt-1">
                  Al Burhan Tours & Travels ERP is production-ready for live Hajj & Umrah operations.
                </p>
                <p className="text-xs text-emerald-600 mt-2">
                  Certified {generatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · Score: {score}/100
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
