// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, IndianRupee, Users, Package, RefreshCw, BarChart2,
  Download, Printer, FileSpreadsheet, FileText, Globe, Plane, Hotel,
  UserCheck, Star, CreditCard, AlertCircle, ChevronDown, Filter,
  CheckCircle2, Loader2, Building2, UserPlus,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const COLORS = ["#0B3D2E","#1a6b50","#2d9e78","#4ecba0","#7edcbf","#b3edd8","#d4f5eb","#f0fdf9"];
const STATUS_COLORS: Record<string,string> = {
  confirmed:"#10b981", approved:"#3b82f6", pending:"#f59e0b",
  rejected:"#ef4444", cancelled:"#6b7280",
};
const TYPE_COLORS: Record<string,string> = { Hajj:"#0B3D2E", Umrah:"#2d9e78", Other:"#a3a3a3" };

function fmt(n: number) {
  if (isNaN(n) || n === null || n === undefined) return "₹0";
  if (n >= 10_000_000) return `₹${(n/10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n/100_000).toFixed(1)}L`;
  if (n >= 1000)       return `₹${(n/1000).toFixed(1)}K`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
}
function pct(val: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((val/total)*100)}%`;
}

const TOOLTIP_STYLE = { backgroundColor:"#fff", border:"1px solid #e5e7eb", borderRadius:"12px", fontSize:"12px", boxShadow:"0 4px 24px rgba(0,0,0,0.07)" };

function KPICard({ icon: Icon, label, value, sub, bg="bg-slate-100", color="text-slate-700" }: any) {
  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon size={16} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: any) {
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

function EmptyChart({ msg="No data available" }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <BarChart2 size={36} className="mb-2 opacity-30" />
      <p className="text-sm">{msg}</p>
    </div>
  );
}

function ProgressBar({ label, value, total, color="#0B3D2E" }: any) {
  const pctNum = total > 0 ? Math.min(100, Math.round((value/total)*100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}/{total} ({pctNum}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pctNum}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const TABS = [
  { id:"revenue",   label:"Revenue",    icon: IndianRupee },
  { id:"bookings",  label:"Bookings",   icon: BarChart2 },
  { id:"geography", label:"Geography",  icon: Globe },
  { id:"packages",  label:"Packages",   icon: Package },
  { id:"flights",   label:"Flights & Hotels", icon: Plane },
  { id:"finance",   label:"Finance",    icon: CreditCard },
  { id:"customers", label:"Customers",  icon: Users },
];

function exportCSV(rows: any[], filename: string) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

export default function BusinessIntelligence() {
  const [data, setData]       = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  const [tab, setTab]         = useState("revenue");
  const printRef              = useRef<HTMLDivElement>(null);

  // Filters
  const [period,    setPeriod]    = useState("month");
  const [fromDate,  setFromDate]  = useState("");
  const [toDate,    setToDate]    = useState("");
  const [branchId,  setBranchId]  = useState("");
  const [agentId,   setAgentId]   = useState("");
  const [pkgName,   setPkgName]   = useState("");
  const [bkType,    setBkType]    = useState("all");
  const [branches,  setBranches]  = useState<any[]>([]);
  const [agents,    setAgents]    = useState<any[]>([]);
  const [packages,  setPackages]  = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (fromDate && toDate) { params.set("from", fromDate); params.set("to", toDate); }
      if (branchId) params.set("branch", branchId);
      if (agentId)  params.set("agent", agentId);
      if (pkgName)  params.set("package", pkgName);
      if (bkType !== "all") params.set("type", bkType);

      const r = await fetch(`${BASE_API}/api/admin/bi?${params}`, { credentials:"include" });
      if (r.ok) { setData(await r.json()); }
      else { const e = await r.json().catch(() => ({})); setError(e.error || `HTTP ${r.status}`); }
    } catch (e: any) { setError(e.message || "Network error"); }
    setLoading(false);
  }, [period, fromDate, toDate, branchId, agentId, pkgName, bkType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_API}/api/admin/branches`, { credentials:"include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${BASE_API}/api/admin/agents`,   { credentials:"include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${BASE_API}/api/packages`,       { credentials:"include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([br, ag, pk]) => {
      setBranches(Array.isArray(br) ? br : []);
      setAgents(Array.isArray(ag) ? ag : []);
      setPackages(Array.isArray(pk) ? pk.slice(0,30) : []);
    });
  }, []);

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    if (!data) return;
    const map: Record<string,any[]> = {
      revenueByMonth:    data.revenueByMonth   || [],
      bookingsByStatus:  data.bookingsByStatus  || [],
      packagePopularity: data.packagePopularity || [],
      customersByState:  data.customersByState  || [],
      agentCommissions:  data.agentCommissions  || [],
    };
    const rows = [
      ["Section", "Key", "Value"],
      ...Object.entries(data.summary||{}).map(([k,v]) => ["Summary", k, v]),
    ];
    exportCSV(rows, `bi-summary-${period}.csv`);
    exportCSV(data.revenueByMonth || [], `bi-revenue-${period}.csv`);
    exportCSV(data.packagePopularity || [], `bi-packages-${period}.csv`);
  };

  const s = data?.summary || {};
  const hasAnyData = s.totalBookings > 0 || s.totalCustomers > 0;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 print:px-0 print:py-0" ref={printRef}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Business Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Real-time analytics — revenue, bookings, geography, packages & more</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleExportCSV} disabled={!data} className="flex items-center gap-1.5 text-xs border rounded-xl px-3 py-2 hover:bg-muted/50 disabled:opacity-40 transition-colors">
              <FileSpreadsheet size={13} /> CSV
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 text-xs border rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
              <Printer size={13} /> Print
            </button>
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 hover:bg-muted/50 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filters</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Period */}
            <select value={period} onChange={e => { setPeriod(e.target.value); setFromDate(""); setToDate(""); }}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
            {/* Custom Date */}
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background" placeholder="From" />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background" placeholder="To" />
            {/* Branch */}
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background">
              <option value="">All Branches</option>
              {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {/* Agent */}
            <select value={agentId} onChange={e => setAgentId(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background">
              <option value="">All Agents</option>
              {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {/* Type */}
            <select value={bkType} onChange={e => setBkType(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background">
              <option value="all">All Types</option>
              <option value="hajj">Hajj</option>
              <option value="umrah">Umrah</option>
            </select>
            {/* Package */}
            <select value={pkgName} onChange={e => setPkgName(e.target.value)}
              className="text-sm border rounded-xl px-3 py-1.5 bg-background max-w-[200px]">
              <option value="">All Packages</option>
              {packages.map((p: any) => <option key={p.id} value={p.name}>{p.name?.slice(0,30)}</option>)}
            </select>
            {(branchId||agentId||pkgName||bkType!=="all"||fromDate) && (
              <button onClick={() => { setBranchId(""); setAgentId(""); setPkgName(""); setBkType("all"); setFromDate(""); setToDate(""); }}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5">Clear</button>
            )}
          </div>
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load analytics</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <button onClick={load} className="ml-auto text-xs text-red-600 underline">Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl border p-4 bg-background animate-pulse">
                <div className="h-3 bg-muted rounded w-24 mb-3" />
                <div className="h-7 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        )}

        {/* No data state */}
        {!loading && !error && data && !hasAnyData && (
          <div className="rounded-2xl border p-12 text-center">
            <BarChart2 size={40} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">No business data available.</p>
            <p className="text-sm text-muted-foreground mt-1">Add bookings, customers and packages to see analytics here.</p>
          </div>
        )}

        {/* Main content */}
        {data && (
          <>
            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard icon={IndianRupee} label="Total Revenue"   value={fmt(s.totalRevenue)}   sub="All-time collected"    bg="bg-emerald-100" color="text-emerald-700" />
              <KPICard icon={IndianRupee} label="This Month"      value={fmt(s.monthRevenue)}   sub="Last 30 days"          bg="bg-blue-100"    color="text-blue-700" />
              <KPICard icon={BarChart2}   label="Total Bookings"  value={s.totalBookings || 0}  sub={`${s.confirmedCount||0} confirmed`} bg="bg-violet-100" color="text-violet-700" />
              <KPICard icon={Users}       label="Customers"       value={s.totalCustomers || 0} sub={`${s.totalPackages||0} packages`}  bg="bg-amber-100"  color="text-amber-700" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard icon={IndianRupee} label="Today's Revenue"  value={fmt(s.todayRevenue)}   sub="Collected today"       bg="bg-teal-100"   color="text-teal-700" />
              <KPICard icon={IndianRupee} label="Weekly Revenue"   value={fmt(s.weekRevenue)}    sub="Last 7 days"           bg="bg-indigo-100" color="text-indigo-700" />
              <KPICard icon={CreditCard}  label="Pending Payments" value={fmt(s.pendingPayments)} sub="Balance due"          bg="bg-orange-100" color="text-orange-700" />
              <KPICard icon={CheckCircle2}label="Paid Revenue"     value={fmt(s.paidPayments)}   sub="Confirmed payments"    bg="bg-green-100"  color="text-green-700" />
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1.5 flex-wrap border-b pb-0 -mb-px">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    tab === t.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            <div className="space-y-5">

              {/* ═══════════════════════════════ REVENUE TAB ═══════════════════════════════ */}
              {tab === "revenue" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={TrendingUp} title="Monthly Revenue" sub="Last 12 months — collected payments" />
                      {(data.revenueByMonth||[]).length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={data.revenueByMonth} barSize={28}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" tick={{ fontSize:11 }} />
                            <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize:11 }} width={64} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any) => [fmt(Number(v)),"Revenue"]} />
                            <Bar dataKey="revenue" fill="#0B3D2E" radius={[6,6,0,0]} name="Revenue" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={TrendingUp} title="Revenue Trend" sub="Cumulative monthly line" />
                      {(data.revenueByMonth||[]).length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={data.revenueByMonth}>
                            <defs>
                              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0B3D2E" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#0B3D2E" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" tick={{ fontSize:11 }} />
                            <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize:11 }} width={64} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any) => [fmt(Number(v)),"Revenue"]} />
                            <Area type="monotone" dataKey="revenue" stroke="#0B3D2E" strokeWidth={3} fill="url(#revGrad)" dot={{ r:4, fill:"#0B3D2E" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={IndianRupee} title="Weekly Revenue" sub="Day-by-day breakdown (last 7 days)" />
                    {(data.revenueByWeek||[]).length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.revenueByWeek} barSize={32}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="day" tick={{ fontSize:11 }} />
                          <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize:11 }} width={64} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any) => [fmt(Number(v)),"Revenue"]} />
                          <Bar dataKey="revenue" fill="#2d9e78" radius={[6,6,0,0]} name="Revenue" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Revenue KPI detail */}
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      { label:"Pending Payments", value: fmt(s.pendingPayments), desc:"Balance yet to be collected", color:"text-orange-600 bg-orange-50 border-orange-200" },
                      { label:"Paid Revenue",     value: fmt(s.paidPayments),    desc:"Confirmed bookings collected", color:"text-emerald-600 bg-emerald-50 border-emerald-200" },
                      { label:"Today's Revenue",  value: fmt(s.todayRevenue),    desc:"Payments received today",      color:"text-blue-600 bg-blue-50 border-blue-200" },
                    ].map(c => (
                      <div key={c.label} className={`rounded-2xl border p-4 ${c.color}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
                        <p className="text-2xl font-bold font-mono mt-1">{c.value}</p>
                        <p className="text-xs mt-1 opacity-70">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ BOOKINGS TAB ═══════════════════════════════ */}
              {tab === "bookings" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label:"Total",     val: s.totalBookings,  bg:"bg-slate-100",   color:"text-slate-700" },
                      { label:"Pending",   val: s.pendingCount,   bg:"bg-amber-100",   color:"text-amber-700" },
                      { label:"Approved",  val: s.approvedCount,  bg:"bg-blue-100",    color:"text-blue-700" },
                      { label:"Confirmed", val: s.confirmedCount, bg:"bg-emerald-100", color:"text-emerald-700" },
                      { label:"Cancelled", val: s.cancelledCount, bg:"bg-red-100",     color:"text-red-700" },
                    ].map(c => (
                      <div key={c.label} className="rounded-2xl border p-3 text-center bg-background">
                        <div className={`w-3 h-3 rounded-full mx-auto mb-1.5 ${c.bg}`} />
                        <p className="text-2xl font-bold font-mono">{c.val||0}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={BarChart2} title="Bookings by Status" sub="All-time distribution" />
                      {!(data.bookingsByStatus||[]).length ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={data.bookingsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90}
                              label={({ status, percent }: any) => `${status} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                              {(data.bookingsByStatus||[]).map((e:any,i:number) => (
                                <Cell key={e.status} fill={STATUS_COLORS[e.status]||COLORS[i%COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={BarChart2} title="Hajj vs Umrah vs Other" sub="Booking type distribution" />
                      {!(data.bookingsByType||[]).length ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={data.bookingsByType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90}
                              label={({ type, percent }: any) => `${type} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                              {(data.bookingsByType||[]).map((e:any,i:number) => (
                                <Cell key={e.type} fill={TYPE_COLORS[e.type]||COLORS[i%COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={TrendingUp} title="Monthly Booking Trend" sub="Bookings per month (last 12 months)" />
                    {!(data.revenueByMonth||[]).length ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.revenueByMonth} barSize={24}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="month" tick={{ fontSize:11 }} />
                          <YAxis tick={{ fontSize:11 }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="bookings" fill="#3b82f6" radius={[4,4,0,0]} name="Total" />
                          <Bar dataKey="confirmed" fill="#10b981" radius={[4,4,0,0]} name="Confirmed" />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ GEOGRAPHY TAB ═══════════════════════════════ */}
              {tab === "geography" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={Globe} title="Customers by State" sub="Top 10 states" />
                      {!(data.customersByState||[]).length ? (
                        <EmptyChart msg="No state data — customers may not have state filled in" />
                      ) : (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={data.customersByState} layout="vertical" barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize:11 }} />
                            <YAxis dataKey="state" type="category" tick={{ fontSize:11 }} width={110} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="customers" fill="#0B3D2E" radius={[0,6,6,0]} name="Customers" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={Globe} title="Customers by City" sub="Top 10 cities" />
                      {!(data.customersByCity||[]).length ? (
                        <EmptyChart msg="No city data — customers may not have city filled in" />
                      ) : (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={data.customersByCity} layout="vertical" barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize:11 }} />
                            <YAxis dataKey="city" type="category" tick={{ fontSize:11 }} width={110} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="customers" fill="#2d9e78" radius={[0,6,6,0]} name="Customers" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={Building2} title="Branch-wise Performance" sub="Bookings & revenue per branch" />
                    {!(data.customersByBranch||[]).length ? <EmptyChart msg="No branch data available" /> : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 font-semibold text-muted-foreground text-xs">Branch</th>
                              <th className="pb-2 font-semibold text-muted-foreground text-xs">Customers</th>
                              <th className="pb-2 font-semibold text-muted-foreground text-xs">Bookings</th>
                              <th className="pb-2 font-semibold text-muted-foreground text-xs text-right">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.customersByBranch||[]).map((r:any,i:number) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2.5 font-medium">{r.branch}</td>
                                <td className="py-2.5">{r.customers}</td>
                                <td className="py-2.5">{r.bookings}</td>
                                <td className="py-2.5 text-right font-mono text-emerald-700">{fmt(r.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ PACKAGES TAB ═══════════════════════════════ */}
              {tab === "packages" && (
                <>
                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={Package} title="Top Packages by Bookings" sub="Top 10 packages" />
                    {!(data.packagePopularity||[]).length ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={data.packagePopularity} layout="vertical" barSize={22}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" tick={{ fontSize:11 }} />
                          <YAxis dataKey="package" type="category" tick={{ fontSize:10 }} width={180} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="bookings" fill="#0B3D2E" radius={[0,6,6,0]} name="Bookings" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={IndianRupee} title="Revenue by Package" sub="Collected payments per package" />
                    {!(data.packagePopularity||[]).length ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={data.packagePopularity} layout="vertical" barSize={22}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" tickFormatter={v => fmt(Number(v))} tick={{ fontSize:11 }} />
                          <YAxis dataKey="package" type="category" tick={{ fontSize:10 }} width={180} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any) => [fmt(Number(v)),"Revenue"]} />
                          <Bar dataKey="revenue" fill="#1a6b50" radius={[0,6,6,0]} name="Revenue" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={Package} title="Package Performance" sub="Bookings, revenue, confirmed count" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 font-semibold text-muted-foreground text-xs">Package</th>
                            <th className="pb-2 font-semibold text-muted-foreground text-xs">Bookings</th>
                            <th className="pb-2 font-semibold text-muted-foreground text-xs">Confirmed</th>
                            <th className="pb-2 font-semibold text-muted-foreground text-xs text-right">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!(data.packagePopularity||[]).length ? (
                            <tr><td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">No package data available.</td></tr>
                          ) : (data.packagePopularity||[]).map((p:any,i:number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2.5 font-medium max-w-[200px] truncate">{p.package}</td>
                              <td className="py-2.5">{p.bookings}</td>
                              <td className="py-2.5">
                                <span className="inline-flex items-center gap-1">
                                  {p.confirmed}
                                  {p.bookings > 0 && <span className="text-xs text-muted-foreground">({Math.round((p.confirmed/p.bookings)*100)}%)</span>}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-mono text-emerald-700">{fmt(p.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ FLIGHTS & HOTELS TAB ═══════════════════════════════ */}
              {tab === "flights" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={Plane} title="Flight Overview" sub="Group flights status" />
                      {!data.flights?.total ? <EmptyChart msg="No flights configured yet" /> : (
                        <div className="space-y-4 mt-2">
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label:"Total Flights",    value: data.flights.total,      bg:"bg-blue-100",   color:"text-blue-700" },
                              { label:"Total Seats",      value: data.flights.totalSeats,  bg:"bg-slate-100",  color:"text-slate-700" },
                              { label:"Booked Seats",     value: data.flights.bookedSeats, bg:"bg-emerald-100",color:"text-emerald-700" },
                              { label:"Upcoming (7d)",    value: data.flights.upcoming7d,  bg:"bg-amber-100",  color:"text-amber-700" },
                            ].map(c => (
                              <div key={c.label} className={`rounded-xl p-3 ${c.bg}`}>
                                <p className="text-2xl font-bold font-mono ${c.color}">{c.value||0}</p>
                                <p className={`text-xs font-medium ${c.color} mt-0.5`}>{c.label}</p>
                              </div>
                            ))}
                          </div>
                          <ProgressBar label="Seat Occupancy" value={data.flights.bookedSeats} total={data.flights.totalSeats} />
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={Hotel} title="Hotel Overview" sub="Hotel & room availability" />
                      {!data.hotels?.total ? <EmptyChart msg="No hotels configured yet" /> : (
                        <div className="space-y-4 mt-2">
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label:"Total Hotels",  value: data.hotels.total,         bg:"bg-violet-100", color:"text-violet-700" },
                              { label:"Total Rooms",   value: data.hotels.totalRooms,    bg:"bg-slate-100",  color:"text-slate-700" },
                              { label:"Occupied",      value: data.hotels.occupiedRooms, bg:"bg-orange-100", color:"text-orange-700" },
                              { label:"Occupancy",     value: `${data.hotels.occupancy||0}%`, bg:"bg-emerald-100",color:"text-emerald-700" },
                            ].map(c => (
                              <div key={c.label} className={`rounded-xl p-3 ${c.bg}`}>
                                <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value||0}</p>
                                <p className={`text-xs font-medium ${c.color} mt-0.5`}>{c.label}</p>
                              </div>
                            ))}
                          </div>
                          <ProgressBar label="Room Occupancy" value={data.hotels.occupiedRooms} total={data.hotels.totalRooms} color="#7c3aed" />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ FINANCE TAB ═══════════════════════════════ */}
              {tab === "finance" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:"Gross Revenue",  value: fmt(data.finance?.grossRevenue||0),    bg:"bg-emerald-100", color:"text-emerald-700" },
                      { label:"Total Expenses", value: fmt(data.finance?.totalExpenses||0),   bg:"bg-red-100",     color:"text-red-700" },
                      { label:"Net Profit",     value: fmt(data.finance?.profit||0),          bg: (data.finance?.profit||0)>=0 ? "bg-green-100" : "bg-red-100", color:(data.finance?.profit||0)>=0 ? "text-green-700":"text-red-700" },
                      { label:"Outstanding",    value: fmt(data.finance?.outstanding||0),     bg:"bg-orange-100",  color:"text-orange-700" },
                    ].map(c => (
                      <div key={c.label} className={`rounded-2xl border p-4 ${c.bg}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
                        <p className={`text-2xl font-bold font-mono mt-1 ${c.color}`}>{c.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={UserPlus} title="Agent Commissions" sub="Commission earned per agent" />
                      {!(data.agentCommissions||[]).length ? <EmptyChart msg="No agents or agent bookings yet" /> : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="pb-2 text-xs font-semibold text-muted-foreground">Agent</th>
                                <th className="pb-2 text-xs font-semibold text-muted-foreground">Bookings</th>
                                <th className="pb-2 text-xs font-semibold text-muted-foreground text-right">Revenue</th>
                                <th className="pb-2 text-xs font-semibold text-muted-foreground text-right">Commission</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(data.agentCommissions||[]).map((a:any,i:number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2.5 font-medium">{a.agent}</td>
                                  <td className="py-2.5">{a.bookings}</td>
                                  <td className="py-2.5 text-right font-mono text-emerald-700">{fmt(a.revenue)}</td>
                                  <td className="py-2.5 text-right font-mono text-blue-700">{fmt(a.commission)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border p-5 bg-background">
                      <SectionHeader icon={Building2} title="Branch Revenue" sub="Revenue per branch" />
                      {!(data.branchRevenue||[]).length ? <EmptyChart msg="No branch revenue data yet" /> : (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={data.branchRevenue} layout="vertical" barSize={22}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tickFormatter={v => fmt(Number(v))} tick={{ fontSize:11 }} />
                            <YAxis dataKey="branch" type="category" tick={{ fontSize:11 }} width={90} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v:any) => [fmt(Number(v)),"Revenue"]} />
                            <Bar dataKey="revenue" fill="#0B3D2E" radius={[0,6,6,0]} name="Revenue" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ═══════════════════════════════ CUSTOMER ANALYTICS TAB ═══════════════════════════════ */}
              {tab === "customers" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:`New Customers`,    value: data.customerAnalytics?.newCustomers||0,    sub:`In this ${period}`,        icon: UserPlus,   bg:"bg-blue-100",   color:"text-blue-700" },
                      { label:"Repeat Customers", value: data.customerAnalytics?.repeatCustomers||0,  sub:"More than 1 booking",     icon: Users,      bg:"bg-violet-100", color:"text-violet-700" },
                      { label:"Avg. Rating",      value: data.customerAnalytics?.avgRating ? `${data.customerAnalytics.avgRating}/5` : "N/A", sub:`${data.customerAnalytics?.totalReviews||0} reviews`, icon:Star, bg:"bg-amber-100", color:"text-amber-700" },
                      { label:"Journey Completed",value: data.customerAnalytics?.journeyCompleted||0, sub:"Returned from journey",   icon:CheckCircle2,bg:"bg-emerald-100",color:"text-emerald-700" },
                    ].map(c => (
                      <KPICard key={c.label} icon={c.icon} label={c.label} value={c.value} sub={c.sub} bg={c.bg} color={c.color} />
                    ))}
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={UserCheck} title="Completion Metrics" sub="Agreement, visa, ticket & journey tracking" />
                    <div className="space-y-4 max-w-lg">
                      <ProgressBar
                        label="Agreement Completion"
                        value={data.customerAnalytics?.agreementSigned||0}
                        total={data.customerAnalytics?.agreementTotal||0}
                        color="#3b82f6"
                      />
                      <ProgressBar
                        label="Visa Completion"
                        value={data.customerAnalytics?.visaReceived||0}
                        total={data.customerAnalytics?.visaTotal||0}
                        color="#10b981"
                      />
                      <ProgressBar
                        label="Tickets Issued"
                        value={data.customerAnalytics?.ticketsIssued||0}
                        total={s.confirmedCount||1}
                        color="#8b5cf6"
                      />
                      <ProgressBar
                        label="Journey Completed"
                        value={data.customerAnalytics?.journeyCompleted||0}
                        total={s.confirmedCount||1}
                        color="#f59e0b"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border p-5 bg-background">
                    <SectionHeader icon={Star} title="Satisfaction Score" sub="Customer feedback ratings" />
                    {!data.customerAnalytics?.totalReviews ? (
                      <EmptyChart msg="No customer reviews yet" />
                    ) : (
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-5xl font-bold font-mono text-amber-500">{data.customerAnalytics?.avgRating||0}</p>
                          <p className="text-sm text-muted-foreground mt-1">out of 5.0</p>
                          <div className="flex gap-0.5 justify-center mt-2">
                            {[1,2,3,4,5].map(s => (
                              <span key={s} className={`text-lg ${s <= Math.round(data.customerAnalytics?.avgRating||0) ? "text-amber-400":"text-gray-200"}`}>★</span>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{data.customerAnalytics?.totalReviews} reviews</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
