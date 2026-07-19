import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  IndianRupee, Users, BookOpen, FileCheck, Stamp, Plane,
  Hotel, MessageSquare, Star, Send, PhoneCall, Mail, Wifi,
  TrendingUp, AlertCircle, CheckCircle, Clock, RefreshCw, BarChart2
} from "lucide-react";
import { Link } from "wouter";

const BASE_API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

function fmt(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function RateBar({ label, rate, color }: { label: string; rate: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${color}`}>{rate}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            rate >= 80 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-red-500"
          }`}
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, bg, color, sub, href, alert
}: {
  label: string; value: string | number; icon: React.ElementType;
  bg: string; color: string; sub?: string; href?: string; alert?: boolean;
}) {
  const inner = (
    <div className={`rounded-2xl border p-5 bg-background transition-all ${alert ? "border-red-200" : "border-border"} ${href ? "hover:shadow-md hover:border-primary/30 cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <p className="text-3xl font-bold font-mono text-foreground">{value}</p>
        {alert && <AlertCircle size={18} className="text-red-500 mb-1" />}
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function SuperDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/super-stats`, { credentials: "include" });
      if (r.ok) { setStats(await r.json()); setLastRefresh(new Date()); }
      else toast({ title: "Failed to load stats", variant: "destructive" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, []);

  const notif = stats?.notifications || {};
  const wa = notif.whatsapp || { rate: 0, total: 0 };
  const sms = notif.sms || { rate: 0, total: 0 };
  const email = notif.email || { rate: 0, total: 0 };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live overview — last updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border rounded-xl px-3 py-2 transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {loading && !stats ? (
          <div className="py-20 text-center text-muted-foreground">Loading live stats…</div>
        ) : !stats ? null : (
          <>
            {/* Today's KPIs */}
            <section>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Today's Activity</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard
                  label="Today's Revenue"
                  value={fmt(stats.today?.revenue || 0)}
                  icon={IndianRupee}
                  bg="bg-emerald-100" color="text-emerald-700"
                  sub={`${stats.today?.payments || 0} payment(s)`}
                  href={`${BASE}admin/payment-analytics`}
                />
                <KpiCard
                  label="Today's Bookings"
                  value={stats.today?.bookings || 0}
                  icon={BookOpen}
                  bg="bg-blue-100" color="text-blue-700"
                  sub="new bookings today"
                  href={`${BASE}admin/bookings`}
                />
                <KpiCard
                  label="Support Tickets"
                  value={stats.support?.open + stats.support?.pending || 0}
                  icon={MessageSquare}
                  bg="bg-rose-100" color="text-rose-700"
                  sub={`${stats.support?.open || 0} open · ${stats.support?.pending || 0} pending`}
                  href={`${BASE}admin/support`}
                  alert={(stats.support?.open || 0) > 0}
                />
              </div>
            </section>

            {/* Pending Action Items */}
            <section>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Pending Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard
                  label="Pending Approvals"
                  value={stats.pending?.approvals || 0}
                  icon={Clock}
                  bg="bg-amber-100" color="text-amber-700"
                  href={`${BASE}admin/bookings`}
                  alert={(stats.pending?.approvals || 0) > 0}
                />
                <KpiCard
                  label="Pending Payments"
                  value={stats.pending?.payments || 0}
                  icon={IndianRupee}
                  bg="bg-orange-100" color="text-orange-700"
                  href={`${BASE}admin/invoices`}
                  alert={(stats.pending?.payments || 0) > 0}
                />
                <KpiCard
                  label="Pending Agreements"
                  value={stats.pending?.agreements || 0}
                  icon={FileCheck}
                  bg="bg-violet-100" color="text-violet-700"
                  href={`${BASE}admin/agreements`}
                />
                <KpiCard
                  label="Pending Visas"
                  value={stats.pending?.visas || 0}
                  icon={Stamp}
                  bg="bg-pink-100" color="text-pink-700"
                  href={`${BASE}admin/visa`}
                  alert={(stats.pending?.visas || 0) > 0}
                />
                <KpiCard
                  label="Processing Visas"
                  value={stats.pending?.processingVisas || 0}
                  icon={Stamp}
                  bg="bg-sky-100" color="text-sky-700"
                  href={`${BASE}admin/visa`}
                />
              </div>
            </section>

            {/* Pilgrims + Flights + Hotels */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Pilgrims */}
              <div className="rounded-2xl border p-5 bg-background space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center">
                    <Users size={16} className="text-teal-700" />
                  </div>
                  <h3 className="font-semibold text-sm">Pilgrims</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Pilgrims</span>
                    <span className="font-bold">{stats.pilgrims?.total || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-emerald-700">Visa Received</span>
                    <span className="font-bold text-emerald-700">{stats.pilgrims?.receivedVisas || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-600">Processing Visa</span>
                    <span className="font-bold text-amber-600">{stats.pilgrims?.processingVisas || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600">Visa Not Applied</span>
                    <span className="font-bold text-red-600">{stats.pilgrims?.pendingVisas || 0}</span>
                  </div>
                </div>
                <Link href={`${BASE}admin/groups`}>
                  <div className="text-xs text-primary hover:underline cursor-pointer">Manage Pilgrims →</div>
                </Link>
              </div>

              {/* Flights */}
              <div className="rounded-2xl border p-5 bg-background space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Plane size={16} className="text-blue-700" />
                  </div>
                  <h3 className="font-semibold text-sm">Flights</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Flights</span>
                    <span className="font-bold">{stats.flights?.total || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-600">Departing in 7 days</span>
                    <span className={`font-bold ${(stats.flights?.next7Days || 0) > 0 ? "text-amber-600" : "text-foreground"}`}>
                      {stats.flights?.next7Days || 0}
                    </span>
                  </div>
                </div>
                <Link href={`${BASE}admin/flights`}>
                  <div className="text-xs text-primary hover:underline cursor-pointer">Manage Flights →</div>
                </Link>
              </div>

              {/* Hotels */}
              <div className="rounded-2xl border p-5 bg-background space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Hotel size={16} className="text-amber-700" />
                  </div>
                  <h3 className="font-semibold text-sm">Hotels</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active Hotels</span>
                    <span className="font-bold">{stats.hotels?.active || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Hotels</span>
                    <span className="font-bold">{stats.hotels?.total || 0}</span>
                  </div>
                </div>
                <Link href={`${BASE}admin/hotels`}>
                  <div className="text-xs text-primary hover:underline cursor-pointer">Manage Hotels →</div>
                </Link>
              </div>
            </div>

            {/* Notification Delivery Rates */}
            <section>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Notification Delivery Rates (Last 7 Days)
              </h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {/* WhatsApp */}
                <div className="rounded-2xl border p-5 bg-background space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Send size={15} className="text-emerald-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">WhatsApp</p>
                      <p className="text-xs text-muted-foreground">{wa.total || 0} messages</p>
                    </div>
                  </div>
                  <RateBar label="Delivery Rate" rate={wa.rate || 0} color="text-emerald-700" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Delivered: {wa.delivered || 0}</span>
                    <span className="text-red-500">Failed: {wa.failed || 0}</span>
                  </div>
                </div>

                {/* SMS */}
                <div className="rounded-2xl border p-5 bg-background space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                      <PhoneCall size={15} className="text-blue-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">SMS</p>
                      <p className="text-xs text-muted-foreground">{sms.total || 0} messages</p>
                    </div>
                  </div>
                  <RateBar label="Delivery Rate" rate={sms.rate || 0} color="text-blue-700" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Delivered: {sms.delivered || 0}</span>
                    <span className="text-red-500">Failed: {sms.failed || 0}</span>
                  </div>
                </div>

                {/* Email */}
                <div className="rounded-2xl border p-5 bg-background space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                      <Mail size={15} className="text-violet-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Email</p>
                      <p className="text-xs text-muted-foreground">{email.total || 0} messages</p>
                    </div>
                  </div>
                  <RateBar label="Delivery Rate" rate={email.rate || 0} color="text-violet-700" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Delivered: {email.delivered || 0}</span>
                    <span className="text-red-500">Failed: {email.failed || 0}</span>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-right">
                <Link href={`${BASE}admin/notification-center`}>
                  <span className="text-xs text-primary hover:underline cursor-pointer">View full notification log →</span>
                </Link>
              </div>
            </section>

            {/* Customer Satisfaction */}
            {stats.satisfaction?.totalReviews > 0 && (
              <section>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Customer Satisfaction</h2>
                <div className="rounded-2xl border p-5 bg-background flex items-center gap-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Star size={28} className="text-amber-500 fill-amber-400" />
                      <span className="text-4xl font-bold font-mono">
                        {stats.satisfaction.avgRating?.toFixed(1) || "—"}
                      </span>
                      <span className="text-muted-foreground text-sm">/ 5</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on {stats.satisfaction.totalReviews} review(s)
                    </p>
                  </div>
                  <div className="flex-1">
                    {[5, 4, 3, 2, 1].map(star => (
                      <div key={star} className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs w-3">{star}</span>
                        <Star size={10} className="text-amber-400 fill-amber-400" />
                        <div className="flex-1 h-1.5 bg-muted rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Quick Links */}
            <section>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Generate Reports", href: `${BASE}admin/reports`, icon: BarChart2, bg: "bg-emerald-50", color: "text-emerald-700" },
                  { label: "Notification Center", href: `${BASE}admin/notification-center`, icon: Wifi, bg: "bg-blue-50", color: "text-blue-700" },
                  { label: "Support Tickets", href: `${BASE}admin/support`, icon: MessageSquare, bg: "bg-rose-50", color: "text-rose-700" },
                  { label: "Audit Logs", href: `${BASE}admin/audit-logs`, icon: CheckCircle, bg: "bg-gray-50", color: "text-gray-700" },
                ].map(card => (
                  <Link key={card.href} href={card.href}>
                    <div className="rounded-2xl border p-4 hover:shadow-md transition-all cursor-pointer hover:border-primary/30 flex flex-col items-center gap-2 text-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>
                        <card.icon size={18} className={card.color} />
                      </div>
                      <span className="text-xs font-semibold">{card.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
