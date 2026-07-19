import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, IndianRupee, Users, Package, RefreshCw, BarChart2 } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const COLORS = ["#0B3D2E", "#1a6b50", "#2d9e78", "#4ecba0", "#7edcbf", "#b3edd8", "#d4f5eb", "#f0fdf9"];
const STATUS_COLORS: Record<string, string> = {
  confirmed: "#10b981",
  approved: "#3b82f6",
  pending: "#f59e0b",
  rejected: "#ef4444",
  cancelled: "#6b7280",
};

function fmt(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const CUSTOM_TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  fontSize: "12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
};

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon size={18} className="text-primary" />
      </div>
      <div>
        <p className="font-bold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

export default function BusinessIntelligence() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"revenue" | "bookings" | "geography" | "packages">("revenue");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/bi`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "revenue", label: "Revenue" },
    { id: "bookings", label: "Bookings" },
    { id: "geography", label: "Geography" },
    { id: "packages", label: "Packages" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Business Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Revenue trends, booking analytics & customer insights</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border rounded-xl px-3 py-2 hover:bg-muted/50 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {/* KPI Summary */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue", value: fmt(data.summary?.totalRevenue || 0), icon: IndianRupee, bg: "bg-emerald-100", color: "text-emerald-700" },
              { label: "Total Bookings", value: data.summary?.totalBookings || 0, icon: BarChart2, bg: "bg-blue-100", color: "text-blue-700" },
              { label: "Customers", value: data.summary?.totalCustomers || 0, icon: Users, bg: "bg-violet-100", color: "text-violet-700" },
              { label: "Packages", value: data.summary?.totalPackages || 0, icon: Package, bg: "bg-amber-100", color: "text-amber-700" },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border p-4 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${k.bg}`}>
                    <k.icon size={16} className={k.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold font-mono">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <div className="py-24 text-center text-muted-foreground">Loading analytics…</div>
        ) : !data ? null : (
          <div className="space-y-6">

            {/* REVENUE TAB */}
            {tab === "revenue" && (
              <>
                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={TrendingUp} title="Monthly Revenue" sub="Last 12 months — confirmed bookings" />
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.revenueByMonth || []} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} width={64} />
                      <Tooltip
                        contentStyle={CUSTOM_TOOLTIP_STYLE}
                        formatter={(v: any) => [fmt(Number(v)), "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill="#0B3D2E" radius={[6, 6, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={IndianRupee} title="Revenue Trend" sub="Monthly cumulative revenue line" />
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={data.revenueByMonth || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} width={64} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v: any) => [fmt(Number(v)), "Revenue"]} />
                      <Line type="monotone" dataKey="revenue" stroke="#0B3D2E" strokeWidth={3} dot={{ r: 4, fill: "#0B3D2E" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* BOOKINGS TAB */}
            {tab === "bookings" && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={BarChart2} title="Bookings by Status" sub="All-time distribution" />
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={data.bookingsByStatus || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={85} label={({ status, percent }: any) => `${status} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {(data.bookingsByStatus || []).map((entry: any, i: number) => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={BarChart2} title="Monthly Bookings" sub="Last 12 months count" />
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.revenueByMonth || []} barSize={22}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                        <Bar dataKey="bookings" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Bookings" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={BarChart2} title="Status Breakdown" sub="Count per booking status" />
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2">
                    {(data.bookingsByStatus || []).map((s: any) => (
                      <div key={s.status} className="rounded-xl border p-3 text-center">
                        <div className="w-3 h-3 rounded-full mx-auto mb-1.5" style={{ backgroundColor: STATUS_COLORS[s.status] || "#888" }} />
                        <p className="text-2xl font-bold font-mono">{s.count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{s.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* GEOGRAPHY TAB */}
            {tab === "geography" && (
              <>
                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={Users} title="Customers by State" sub="Top 10 states" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.customersByState || []} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="state" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                      <Bar dataKey="customers" fill="#0B3D2E" radius={[0, 6, 6, 0]} name="Customers" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={Users} title="Customers by City" sub="Top 10 cities" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.customersByCity || []} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="city" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                      <Bar dataKey="customers" fill="#2d9e78" radius={[0, 6, 6, 0]} name="Customers" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* PACKAGES TAB */}
            {tab === "packages" && (
              <>
                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={Package} title="Package Popularity" sub="Bookings per package (top 10)" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.packagePopularity || []} layout="vertical" barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="package" type="category" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                      <Bar dataKey="bookings" fill="#0B3D2E" radius={[0, 6, 6, 0]} name="Bookings" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border p-5 bg-background">
                  <SectionHeader icon={IndianRupee} title="Package Revenue" sub="Total confirmed revenue per package" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.packagePopularity || []} layout="vertical" barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="package" type="category" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v: any) => [fmt(Number(v)), "Revenue"]} />
                      <Bar dataKey="revenue" fill="#1a6b50" radius={[0, 6, 6, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
