import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, TrendingUp, IndianRupee, BarChart2, Calendar,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "";

const PACKAGE_COLORS = ["#8b5cf6","#3b82f6","#06b6d4","#10b981","#f59e0b","#f97316","#ef4444","#6b7280","#0ea5e9","#84cc16"];
const SOURCE_COLORS  = ["#6366f1","#3b82f6","#0ea5e9","#10b981","#84cc16","#f59e0b","#f97316","#ef4444"];

const MONTHS_OPTIONS = [
  { label: "3 months", value: 3 },
  { label: "6 months", value: 6 },
  { label: "12 months", value: 12 },
];

function KpiCard({ icon, label, value, sub, color = "blue" }: any) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50",
    green: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    violet: "border-violet-200 bg-violet-50",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colorMap[color] || colorMap.blue}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function RevenueAnalytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/revenue?months=${months}`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  }, [months]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary || {};
  const monthly = data?.monthly || [];
  const byPackage = data?.byPackage || [];
  const bySource  = data?.bySource  || [];

  const fmtAmt = (v: any) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Revenue Analytics</h1>
            <p className="text-sm text-muted-foreground">Collection, outstanding, and package breakdown</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden text-xs">
              {MONTHS_OPTIONS.map(o => (
                <button key={o.value}
                  onClick={() => setMonths(o.value)}
                  className={`px-3 py-1.5 transition-colors ${months === o.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center text-muted-foreground">Loading revenue data…</div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon={<IndianRupee size={14} />} label="Total Invoiced" color="violet"
                value={fmtAmt(s.total_revenue)} sub={`${s.total_bookings || 0} bookings`} />
              <KpiCard icon={<TrendingUp size={14} />} label="Collected" color="green"
                value={fmtAmt(s.total_collected)} sub={`${s.total_revenue > 0 ? Math.round(s.total_collected/s.total_revenue*100) : 0}% of invoiced`} />
              <KpiCard icon={<BarChart2 size={14} />} label="Outstanding" color="amber"
                value={fmtAmt(s.total_outstanding)} sub={`Balance pending`} />
              <KpiCard icon={<Calendar size={14} />} label="Confirmed" color="blue"
                value={(s.confirmed_bookings || 0).toLocaleString("en-IN")} sub="Confirmed bookings" />
            </div>

            {/* Monthly trend */}
            {monthly.length > 0 && (
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">📈 Monthly Collection Trend</p>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={monthly}>
                    <defs>
                      <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `₹${Math.round(v/1000)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [fmtAmt(v), "Collected"]} />
                    <Area type="monotone" dataKey="collected" stroke="#3b82f6" fill="url(#colGrad)" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By package */}
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">📦 Revenue by Package</p>
                {byPackage.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byPackage} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
                      <XAxis type="number" tickFormatter={v => `₹${Math.round(v/1000)}k`} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="package_name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any, name: string) => [fmtAmt(v), name === "revenue" ? "Invoiced" : "Collected"]} />
                      <Bar dataKey="revenue" name="revenue" radius={[0,4,4,0]}>
                        {byPackage.map((_: any, i: number) => <Cell key={i} fill={PACKAGE_COLORS[i % PACKAGE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">No package data yet</div>
                )}
              </div>

              {/* By source */}
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">📌 Revenue by Source</p>
                {bySource.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={bySource} dataKey="revenue" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={false}>
                          {bySource.map((_: any, i: number) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [fmtAmt(v), "Revenue"]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b">
                          <th className="text-left py-1.5 font-semibold">Source</th>
                          <th className="text-right font-semibold">Bookings</th>
                          <th className="text-right font-semibold">Revenue</th>
                        </tr></thead>
                        <tbody>
                          {bySource.map((s: any, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1.5 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full inline-block" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                                {s.source || "direct"}
                              </td>
                              <td className="py-1.5 text-right">{s.bookings}</td>
                              <td className="py-1.5 text-right font-medium">{fmtAmt(s.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">No source attribution data yet</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
