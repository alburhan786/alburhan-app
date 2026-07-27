import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, Users, CheckCircle, Package } from "lucide-react";
import {
  BarChart, Bar, FunnelChart, Funnel, LabelList, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie, Legend,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "";

const STAGE_ICONS: Record<string, string> = {
  "Leads (90d)": "🎯", "Bookings Created": "📋",
  "Payment Started": "💳", "Confirmed": "✅", "Departed": "✈️",
};

const STAGE_COLORS = ["#8b5cf6","#3b82f6","#f59e0b","#10b981","#0d9488"];

const LEAD_STAGE_COLORS = [
  "#8b5cf6","#6366f1","#3b82f6","#06b6d4","#10b981",
  "#f59e0b","#f97316","#ef4444","#6b7280",
];

function StatCard({ icon, label, value, sub, color = "primary" }: any) {
  return (
    <div className={`rounded-2xl border p-5 space-y-1 bg-${color}/5 border-${color}/20`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function FunnelBar({ stage, count, pct, color }: any) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium flex items-center gap-1.5">
          {STAGE_ICONS[stage] || "📌"} {stage}
        </span>
        <span className="font-bold tabular-nums">{count.toLocaleString("en-IN")}</span>
      </div>
      <div className="h-7 rounded-full bg-muted overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
        >
          <span className="text-white text-[10px] font-bold">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

export default function BookingFunnel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/booking-funnel`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const funnel = data?.funnel || [];
  const trend = data?.monthlyTrend || [];
  const leadStages = data?.leadStages || [];
  const topCount = funnel[0]?.count || 1;

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Booking Funnel</h1>
            <p className="text-sm text-muted-foreground">Lead-to-departed conversion pipeline · last 90 days</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-24 text-center text-muted-foreground">Loading funnel data…</div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users size={14} />} label="Total Leads" value={(funnel[0]?.count || 0).toLocaleString("en-IN")} color="violet" />
              <StatCard icon={<Package size={14} />} label="Bookings" value={(funnel[1]?.count || 0).toLocaleString("en-IN")}
                sub={`${funnel[1]?.pct || 0}% of leads`} color="blue" />
              <StatCard icon={<CheckCircle size={14} />} label="Confirmed" value={(funnel[3]?.count || 0).toLocaleString("en-IN")}
                sub={`${funnel[3]?.pct || 0}% of leads`} color="emerald" />
              <StatCard icon={<TrendingUp size={14} />} label="Departed" value={(funnel[4]?.count || 0).toLocaleString("en-IN")}
                sub={`${funnel[4]?.pct || 0}% of leads`} color="teal" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Funnel bars */}
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">🎯 Conversion Funnel</p>
                <div className="space-y-4">
                  {funnel.map((s: any, i: number) => (
                    <FunnelBar key={s.stage} stage={s.stage} count={s.count} pct={s.pct} color={STAGE_COLORS[i]} />
                  ))}
                </div>
                {funnel.length > 1 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground">
                      Overall lead-to-booking rate: <span className="font-bold text-foreground">{funnel[1]?.pct || 0}%</span>
                      &nbsp;· Lead-to-confirmed rate: <span className="font-bold text-foreground">{funnel[3]?.pct || 0}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Lead stage pie */}
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">🔄 Lead Stage Distribution</p>
                {leadStages.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={leadStages} dataKey="count" nameKey="stage" cx="50%" cy="50%" outerRadius={90} label={({ stage, count }) => `${stage}: ${count}`} labelLine={false}>
                        {leadStages.map((_: any, i: number) => (
                          <Cell key={i} fill={LEAD_STAGE_COLORS[i % LEAD_STAGE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [v.toLocaleString("en-IN"), "Count"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">No lead stage data yet</div>
                )}
              </div>
            </div>

            {/* Monthly booking trend */}
            {trend.length > 0 && (
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">📈 Monthly Booking Trend (6 months)</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trend} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `₹${Math.round(v/1000)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any, name: string) =>
                        name === "revenue"
                          ? [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]
                          : [v, "Bookings"]
                      }
                    />
                    <Bar yAxisId="left" dataKey="bookings" fill="#3b82f6" radius={[4,4,0,0]} name="Bookings" />
                    <Bar yAxisId="right" dataKey="revenue" fill="#10b981" radius={[4,4,0,0]} name="Revenue" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
