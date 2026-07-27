import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, TrendingUp, Users, IndianRupee, Brain } from "lucide-react";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "";

const fmtAmt = (v: any) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

function ForecastBar({ month, low, mid, high }: any) {
  const maxH = Math.max(high, 10000);
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="text-[10px] font-medium text-muted-foreground">{fmtAmt(mid)}</div>
      <div className="relative w-full flex items-end justify-center" style={{ height: 140 }}>
        {/* Range bar */}
        <div className="absolute inset-x-2 rounded-t-lg flex flex-col justify-end overflow-hidden"
          style={{ bottom: 0, height: `${(low/maxH)*100}%`, background: "rgb(16,185,129,0.15)", borderRadius: "6px 6px 0 0" }}>
        </div>
        <div className="absolute inset-x-2 rounded-t-lg overflow-hidden bg-emerald-500/30"
          style={{ bottom: 0, height: `${(mid/maxH)*100}%` }}>
        </div>
        <div className="absolute inset-x-4 rounded-t-full overflow-hidden bg-emerald-500/60"
          style={{ bottom: 0, height: `${(high/maxH)*100}%` }}>
        </div>
      </div>
      <div className="text-xs font-semibold">{month}</div>
      <div className="text-[10px] text-muted-foreground">
        {fmtAmt(low)} – {fmtAmt(high)}
      </div>
    </div>
  );
}

export default function AiForecast() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/forecast`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const history  = data?.history  || [];
  const forecast = data?.forecast  || [];
  const pipeline = data?.pipeline  || {};
  const narrative = data?.narrative || "";
  const isAI = data?.source === "ai";

  // Merge history + forecast for chart
  const chartData = [
    ...history.map((m: any) => ({ label: m.month, actual: Number(m.revenue), forecast: null, low: null, high: null })),
    ...forecast.map((f: any) => ({ label: f.month, actual: null, forecast: f.mid, low: f.low, high: f.high })),
  ];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain size={22} className="text-violet-600" /> AI Revenue Forecast
            </h1>
            <p className="text-sm text-muted-foreground">
              3-month forward projection · {isAI ? "Claude AI" : "Rule-based model"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Recalculate
          </Button>
        </div>

        {loading ? (
          <div className="py-24 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Brain size={36} className="animate-pulse text-violet-400" />
            <p>Analyzing revenue patterns…</p>
          </div>
        ) : (
          <>
            {/* AI narrative */}
            {narrative && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 space-y-2">
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Sparkles size={15} />
                  {isAI ? "AI Analysis" : "Forecast Insight"}
                </div>
                <p className="text-sm text-violet-900 leading-relaxed">{narrative}</p>
              </div>
            )}

            {/* Pipeline snapshot */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border p-5 bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 text-blue-700 text-xs mb-1"><Users size={13} /> Active Leads</div>
                <div className="text-2xl font-bold">{(pipeline.active_leads || 0).toLocaleString("en-IN")}</div>
              </div>
              <div className="rounded-2xl border p-5 bg-emerald-50 border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-700 text-xs mb-1"><TrendingUp size={13} /> Hot Leads</div>
                <div className="text-2xl font-bold">{(pipeline.hot_leads || 0).toLocaleString("en-IN")}</div>
                <div className="text-[11px] text-muted-foreground">Qualified / proposal / negotiation</div>
              </div>
              <div className="rounded-2xl border p-5 bg-amber-50 border-amber-200">
                <div className="flex items-center gap-2 text-amber-700 text-xs mb-1"><IndianRupee size={13} /> Avg Lead Budget</div>
                <div className="text-2xl font-bold">{fmtAmt(pipeline.avg_budget)}</div>
              </div>
            </div>

            {/* Main chart: history + forecast */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">📊 Revenue History & Forecast</p>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `₹${Math.round(v/1000)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any, name: string) => {
                        if (v == null) return null;
                        const labels: Record<string, string> = { actual: "Actual", forecast: "Forecast (mid)", low: "Low", high: "High" };
                        return [fmtAmt(v), labels[name] || name];
                      }}
                    />
                    <Legend />
                    {/* Actual history */}
                    <Bar dataKey="actual" fill="#3b82f6" radius={[4,4,0,0]} name="actual" />
                    {/* Forecast range */}
                    <Area dataKey="high" fill="#10b98140" stroke="none" name="high" />
                    <Area dataKey="low" fill="#ffffff" stroke="none" name="low" />
                    {/* Forecast mid line */}
                    <Line dataKey="forecast" stroke="#10b981" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 5, fill: "#10b981" }} name="forecast" />
                    {/* Divider between history and forecast */}
                    {history.length > 0 && (
                      <ReferenceLine x={history[history.length-1]?.month} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "Today", fontSize: 10 }} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 3-month forecast cards */}
            {forecast.length > 0 && (
              <div className="rounded-2xl border p-6 space-y-4">
                <p className="font-semibold text-sm flex items-center gap-2">🔮 3-Month Forecast Range</p>
                <div className="flex gap-4">
                  {forecast.map((f: any) => (
                    <ForecastBar key={f.month} {...f} />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Bars show low → mid → high projection. Actual results depend on pipeline conversion and seasonal demand.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
