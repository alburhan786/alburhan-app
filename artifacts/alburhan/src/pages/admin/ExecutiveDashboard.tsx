import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, IndianRupee, Users, Clock, CheckCircle, AlertTriangle, Plane, FileText, MessageSquare, Brain, BarChart2, Activity } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

function KPICard({ title, value, sub, icon: Icon, color, bg, border }: any) {
  return (
    <div className={`rounded-2xl border p-4 ${bg} ${border || ""}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color} bg-white/60`}>
          <Icon size={16} />
        </div>
      </div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-0.5">{title}</h2>
      {children}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/executive`, { credentials: "include" });
      if (r.ok) { setData(await r.json()); setLastRefresh(new Date()); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const iv = setInterval(load, 5 * 60 * 1000); return () => clearInterval(iv); }, []);

  const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
  const d = data || {};
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <TrendingUp size={18} className="text-amber-700" />
              </div>
              Executive Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading && !data ? (
          <div className="py-20 text-center text-muted-foreground">
            <Activity size={32} className="mx-auto mb-2 animate-pulse text-amber-400" />
            <p>Loading executive report…</p>
          </div>
        ) : (
          <>
            {/* Revenue section */}
            <Section title="Revenue Overview">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Today's Collection" value={fmt(d.todayRevenue)} sub={`${d.todayPayments || 0} payments`} icon={IndianRupee} color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
                <KPICard title="This Month" value={fmt(d.monthRevenue)} sub={`vs ${fmt(d.lastMonthRevenue)} last month`} icon={TrendingUp} color="text-blue-700" bg="bg-blue-50" border="border-blue-200" />
                <KPICard title="Total Outstanding" value={fmt(d.outstanding)} sub={`${d.outstandingBookings || 0} bookings pending`} icon={Clock} color="text-amber-700" bg="bg-amber-50" border="border-amber-200" />
                <KPICard title="Total Collected" value={fmt(d.totalCollected)} sub="All time" icon={CheckCircle} color="text-violet-700" bg="bg-violet-50" border="border-violet-200" />
              </div>
            </Section>

            {/* Booking pipeline */}
            <Section title="Booking Pipeline">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Pending Review" value={d.pendingBookings || 0} sub="Awaiting admin action" icon={Clock} color="text-amber-700" bg="bg-amber-50/50" />
                <KPICard title="Approved" value={d.approvedBookings || 0} sub="Payment pending" icon={CheckCircle} color="text-blue-700" bg="bg-blue-50/50" />
                <KPICard title="Confirmed" value={d.confirmedBookings || 0} sub="Fully paid" icon={CheckCircle} color="text-emerald-700" bg="bg-emerald-50/50" />
                <KPICard title="Total Customers" value={d.totalCustomers || 0} sub="Registered users" icon={Users} color="text-primary" bg="bg-primary/5" />
              </div>
            </Section>

            {/* Critical items */}
            <Section title="Critical Items Requiring Attention">
              <div className="rounded-2xl border overflow-hidden">
                {[
                  { label: "Pending Visa Applications", value: d.pendingVisas || 0, color: d.pendingVisas > 0 ? "text-red-700" : "text-muted-foreground", bg: d.pendingVisas > 0 ? "bg-red-50" : "", href: "/admin/visa", icon: "🛂" },
                  { label: "Unsigned Agreements", value: d.unsignedAgreements || 0, color: d.unsignedAgreements > 0 ? "text-orange-700" : "text-muted-foreground", bg: d.unsignedAgreements > 0 ? "bg-orange-50/50" : "", href: "/admin/agreements", icon: "📝" },
                  { label: "Pending KYC Reviews", value: d.pendingKyc || 0, color: d.pendingKyc > 0 ? "text-amber-700" : "text-muted-foreground", bg: d.pendingKyc > 0 ? "bg-amber-50/50" : "", href: "/admin/kyc", icon: "🪪" },
                  { label: "Open Support Tickets", value: d.openTickets || 0, color: d.openTickets > 0 ? "text-blue-700" : "text-muted-foreground", bg: d.openTickets > 0 ? "bg-blue-50/50" : "", href: "/admin/support", icon: "💬" },
                  { label: "Departures in Next 7 Days", value: d.upcomingDepartures || 0, color: d.upcomingDepartures > 0 ? "text-teal-700" : "text-muted-foreground", bg: d.upcomingDepartures > 0 ? "bg-teal-50/50" : "", href: "/admin/flights", icon: "✈️" },
                  { label: "Active Leads (Follow-up Due)", value: d.leadsFollowUpDue || 0, color: d.leadsFollowUpDue > 0 ? "text-violet-700" : "text-muted-foreground", bg: d.leadsFollowUpDue > 0 ? "bg-violet-50/50" : "", href: "/admin/leads", icon: "🎯" },
                ].map(item => (
                  <a key={item.label} href={item.href} className={`flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors ${item.bg}`}>
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </span>
                    <span className={`font-bold text-lg font-mono ${item.color}`}>{item.value}</span>
                  </a>
                ))}
              </div>
            </Section>

            {/* Performance metrics */}
            <Section title="Performance Metrics">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Booking Conversion</p>
                  <p className="text-3xl font-bold font-mono text-primary">{d.conversionRate || 0}%</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(d.conversionRate || 0, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Lead to confirmed booking</p>
                </div>
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Notification Success</p>
                  <p className="text-3xl font-bold font-mono text-emerald-700">{d.notifSuccessRate || 0}%</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(d.notifSuccessRate || 0, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">WhatsApp/SMS delivery rate</p>
                </div>
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Support Resolution</p>
                  <p className="text-3xl font-bold font-mono text-blue-700">{d.ticketResolutionRate || 0}%</p>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(d.ticketResolutionRate || 0, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.resolvedTickets || 0} resolved of {d.totalTickets || 0} total</p>
                </div>
              </div>
            </Section>

            {/* Recent activity */}
            {d.recentBookings && d.recentBookings.length > 0 && (
              <Section title="Latest Bookings (Today)">
                <div className="rounded-2xl border overflow-hidden">
                  <div className="divide-y">
                    {d.recentBookings.slice(0, 5).map((b: any, i: number) => (
                      <div key={i} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(b.customer_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{b.customer_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{b.package_name || "—"} · {b.customer_mobile}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm">{fmt(b.final_amount)}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${b.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : b.status === "approved" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{b.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* AI link */}
            <a href="/admin/ai-ops" className="flex items-center justify-between w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 hover:bg-violet-100 transition-colors group">
              <span className="flex items-center gap-2.5 text-sm font-semibold text-violet-700">
                <Brain size={18} /> View Full AI Operations Report
              </span>
              <span className="text-xs text-violet-500 font-medium">Open →</span>
            </a>

            {lastRefresh && <p className="text-center text-xs text-muted-foreground">Last refreshed: {lastRefresh.toLocaleTimeString("en-IN")} · Auto-refreshes every 5 min</p>}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
