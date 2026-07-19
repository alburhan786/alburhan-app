import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, CreditCard, FileText, Shield, Plane, Hotel, Bus, Clock, AlertTriangle, CheckCircle, MapPin, Activity } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const KPI_DEFS = [
  { key: "totalBookings",       label: "Total Bookings",         icon: Users,       color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   href: "/admin/bookings" },
  { key: "confirmedPilgrims",   label: "Confirmed Pilgrims",     icon: CheckCircle, color: "text-emerald-700",bg: "bg-emerald-50",border: "border-emerald-200",href: "/admin/pilgrim-reports" },
  { key: "pendingPayments",     label: "Pending Payments",       icon: CreditCard,  color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  href: "/admin/payment-analytics" },
  { key: "pendingAgreements",   label: "Pending Agreements",     icon: FileText,    color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", href: "/admin/agreements" },
  { key: "visaPending",         label: "Visa Pending",           icon: Shield,      color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",    href: "/admin/visa" },
  { key: "ticketPending",       label: "Ticket Pending",         icon: Plane,       color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", href: "/admin/flights" },
  { key: "passportExpiring",    label: "Passport Expiring (30d)",icon: AlertTriangle,color: "text-rose-700",  bg: "bg-rose-50",   border: "border-rose-200",   href: "/admin/document-expiry" },
  { key: "hotelAlloc",          label: "Hotel Alloc Pending",    icon: Hotel,       color: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-200",   href: "/admin/hotels" },
  { key: "roomAlloc",           label: "Room Alloc Pending",     icon: Hotel,       color: "text-cyan-700",   bg: "bg-cyan-50",   border: "border-cyan-200",   href: "/admin/allocations" },
  { key: "transportAlloc",      label: "Transport Alloc Pending",icon: Bus,         color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", href: "/admin/buses" },
  { key: "departureToday",      label: "Departing Today",        icon: Plane,       color: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200",    href: "/admin/groups" },
  { key: "returnToday",         label: "Returning Today",        icon: Activity,    color: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-200",   href: "/admin/groups" },
];

function KPITile({ def, value, loading }: { def: typeof KPI_DEFS[0]; value: number; loading: boolean }) {
  const Icon = def.icon;
  const isAlert = def.key === "visaPending" || def.key === "passportExpiring";
  const isEmpty = value === 0;
  return (
    <a href={def.href}
      className={`rounded-2xl border p-4 flex flex-col gap-2 hover:shadow-md transition-all group cursor-pointer
        ${!isEmpty && isAlert ? "bg-red-50 border-red-300 ring-1 ring-red-200" : `${def.bg} ${def.border}`}`}>
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-white/60 ${def.color}`}>
          <Icon size={16} />
        </div>
        {!isEmpty && isAlert && <Badge className="bg-red-600 text-white text-[10px]">Action needed</Badge>}
      </div>
      <div>
        <p className={`text-2xl font-bold font-mono ${loading ? "animate-pulse text-muted-foreground" : def.color}`}>
          {loading ? "—" : value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{def.label}</p>
      </div>
    </a>
  );
}

export default function PilgrimOpsCenter() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [packageFilter, setPackageFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [packages, setPackages] = useState<string[]>([]);
  const [pilgrimList, setPilgrimList] = useState<any[]>([]);
  const [tab, setTab] = useState<"kpi"|"pilgrims"|"departures">("kpi");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (packageFilter) params.set("package", packageFilter);
      if (dateFilter) params.set("date", dateFilter);
      const r = await fetch(`${BASE_API}/api/admin/pilgrim-ops?${params}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setData(d.kpis || {});
        setPackages(d.packages || []);
        setPilgrimList(d.pilgrims || []);
        setLastRefresh(new Date());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [packageFilter, dateFilter]);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin size={18} className="text-primary" />
              </div>
              Pilgrim Operations Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{today} — Live operational snapshot</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <select value={packageFilter} onChange={e => setPackageFilter(e.target.value)}
            className="h-8 px-3 rounded-xl border text-xs bg-background focus:outline-none focus:border-primary">
            <option value="">All Packages</option>
            {packages.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="h-8 px-3 rounded-xl border text-xs bg-background focus:outline-none focus:border-primary"
            placeholder="Departure date" />
          {(packageFilter || dateFilter) && (
            <button onClick={() => { setPackageFilter(""); setDateFilter(""); }}
              className="h-8 px-3 rounded-xl border text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
              Clear filters
            </button>
          )}
          {lastRefresh && <span className="text-xs text-muted-foreground ml-auto">Updated {lastRefresh.toLocaleTimeString("en-IN")}</span>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 rounded-xl p-1 w-fit">
          {[
            { key: "kpi", label: "Operations KPIs" },
            { key: "pilgrims", label: `Active Pilgrims (${data.confirmedPilgrims || 0})` },
            { key: "departures", label: "Departures" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* KPI Grid */}
        {tab === "kpi" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {KPI_DEFS.map(def => (
              <KPITile key={def.key} def={def} value={data[def.key] || 0} loading={loading} />
            ))}
          </div>
        )}

        {/* Pilgrim List */}
        {tab === "pilgrims" && (
          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-5 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Pilgrim</span><span>Booking</span><span>Package</span><span>Departure</span><span>Status</span>
            </div>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading pilgrims…</div>
            ) : pilgrimList.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No pilgrims found for selected filters</div>
            ) : pilgrimList.slice(0, 50).map((p: any, i: number) => (
              <div key={i} className="grid grid-cols-5 px-4 py-2.5 border-t hover:bg-muted/10 text-sm gap-2">
                <div>
                  <p className="font-medium truncate">{p.pilgrim_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{p.customer_mobile || ""}</p>
                </div>
                <span className="font-mono text-xs self-center">{p.booking_number || "—"}</span>
                <span className="text-xs text-muted-foreground self-center truncate">{p.package_name || "—"}</span>
                <span className="text-xs self-center">{p.departure_date ? new Date(p.departure_date).toLocaleDateString("en-IN") : "—"}</span>
                <div className="self-center flex flex-wrap gap-1">
                  {!p.has_passport && <Badge className="bg-red-100 text-red-700 text-[9px] py-0">No PP</Badge>}
                  {!p.has_visa && <Badge className="bg-orange-100 text-orange-700 text-[9px] py-0">No Visa</Badge>}
                  {p.has_passport && p.has_visa && <Badge className="bg-emerald-100 text-emerald-700 text-[9px] py-0">Ready</Badge>}
                </div>
              </div>
            ))}
            {pilgrimList.length > 50 && <p className="px-4 py-2 text-xs text-muted-foreground border-t">Showing 50 of {pilgrimList.length} pilgrims</p>}
          </div>
        )}

        {/* Departures */}
        {tab === "departures" && (
          <div className="space-y-3">
            {[
              { label: "Departing Today", key: "todayDepartures" },
              { label: "Departing This Week", key: "weekDepartures" },
            ].map(section => (
              <div key={section.key} className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{section.label}</h2>
                <div className="rounded-2xl border overflow-hidden">
                  {loading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
                  ) : !(data[section.key] || []).length ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">No bookings for {section.label.toLowerCase()}</div>
                  ) : (data[section.key] || []).map((b: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/10">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {(b.customer_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{b.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{b.package_name} · {b.booking_number}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold">{b.preferred_departure_date ? new Date(b.preferred_departure_date).toLocaleDateString("en-IN") : "—"}</p>
                        <p className="text-xs text-muted-foreground">{b.customer_mobile}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
