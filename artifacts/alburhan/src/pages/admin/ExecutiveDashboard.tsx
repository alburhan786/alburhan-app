import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, TrendingUp, IndianRupee, Users, Clock, CheckCircle,
  AlertTriangle, Plane, FileText, MessageSquare, Brain, BarChart2,
  Activity, Target, Zap, Award, Send, Phone,
} from "lucide-react";

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

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-0.5">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [opsData, setOpsData] = useState<any>(null);
  const [crmData, setCrmData] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [reportMobile, setReportMobile] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [opsR, crmR] = await Promise.all([
        fetch(`${BASE_API}/api/admin/executive`, { credentials: "include" }),
        fetch(`${BASE_API}/api/leads/executive-summary`, { credentials: "include" }),
      ]);
      if (opsR.ok)  setOpsData(await opsR.json());
      if (crmR.ok)  setCrmData(await crmR.json());
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const sendDailyReport = async () => {
    if (!reportMobile.trim()) return;
    setSendingReport(true);
    try {
      const r = await fetch(`${BASE_API}/api/leads/daily-report/send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobiles: reportMobile.split(",").map(m => m.trim()).filter(Boolean) }),
      });
      const d = await r.json();
      if (d.ok) alert("Daily report sent!");
      else alert("Error: " + (d.error || "Unknown"));
    } catch { alert("Failed to send report"); }
    setSendingReport(false);
  };

  const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
  const d    = opsData  || {};
  const crm  = crmData  || {};
  const pipe = crm.pipeline || {};
  const monthly = crm.monthly || {};
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-7">

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

        {loading && !opsData && !crmData ? (
          <div className="py-20 text-center text-muted-foreground">
            <Activity size={32} className="mx-auto mb-2 animate-pulse text-amber-400" />
            <p>Loading executive report…</p>
          </div>
        ) : (
          <>
            {/* ── Revenue Overview ──────────────────────────────── */}
            <Section title="Revenue Overview">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Today's Collection"  value={fmt(d.todayRevenue)}   sub={`${d.todayPayments || 0} payments`}            icon={IndianRupee} color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
                <KPICard title="This Month"           value={fmt(d.monthRevenue)}   sub={`vs ${fmt(d.lastMonthRevenue)} last month`}     icon={TrendingUp}  color="text-blue-700"   bg="bg-blue-50"    border="border-blue-200" />
                <KPICard title="Outstanding Balance"  value={fmt(d.outstanding)}    sub={`${d.outstandingBookings || 0} bookings`}       icon={Clock}       color="text-amber-700"  bg="bg-amber-50"   border="border-amber-200" />
                <KPICard title="Total Collected"      value={fmt(d.totalCollected)} sub="All time"                                       icon={CheckCircle} color="text-violet-700" bg="bg-violet-50"  border="border-violet-200" />
              </div>
            </Section>

            {/* ── Booking Pipeline ──────────────────────────────── */}
            <Section title="Booking Pipeline">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard title="Pending Review"  value={d.pendingBookings   || 0} sub="Awaiting admin action"  icon={Clock}        color="text-amber-700"  bg="bg-amber-50/50" />
                <KPICard title="Approved"        value={d.approvedBookings  || 0} sub="Payment pending"        icon={CheckCircle}  color="text-blue-700"   bg="bg-blue-50/50" />
                <KPICard title="Confirmed"       value={d.confirmedBookings || 0} sub="Fully paid"             icon={CheckCircle}  color="text-emerald-700" bg="bg-emerald-50/50" />
                <KPICard title="Total Customers" value={d.totalCustomers    || 0} sub="Registered users"       icon={Users}        color="text-primary"    bg="bg-primary/5" />
              </div>
            </Section>

            {/* ── CRM Lead Pipeline ─────────────────────────────── */}
            {crmData && (
              <Section title="CRM Lead Pipeline">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard title="New This Month"    value={monthly.new_this_month      || 0} sub="Leads acquired"       icon={Target}   color="text-violet-700" bg="bg-violet-50/50" />
                  <KPICard title="Converted (Month)" value={monthly.converted_this_month || 0} sub="Leads to bookings"   icon={Zap}      color="text-emerald-700" bg="bg-emerald-50/50" />
                  <KPICard title="CRM Conv. Rate"    value={`${monthly.crmConvRate || 0}%`}   sub="Lead→booking %"      icon={BarChart2} color="text-blue-700"  bg="bg-blue-50/50" />
                  <KPICard title="Avg AI Score"      value={pipe.avgAiScore || 0}              sub="Lead quality score"  icon={Brain}    color="text-amber-700"  bg="bg-amber-50/50" />
                </div>

                {/* Stage funnel mini-bar */}
                <div className="rounded-2xl border overflow-hidden">
                  {[
                    { label: "Total Active",  value: pipe.total_active   || 0, color: "bg-violet-500" },
                    { label: "New Leads",     value: pipe.new_leads      || 0, color: "bg-blue-400" },
                    { label: "Contacted",     value: pipe.contacted      || 0, color: "bg-sky-500" },
                    { label: "Qualified",     value: pipe.qualified      || 0, color: "bg-amber-500" },
                    { label: "Proposal",      value: pipe.proposal       || 0, color: "bg-orange-500" },
                    { label: "Won / Booked",  value: pipe.won            || 0, color: "bg-emerald-500" },
                    { label: "Converted All", value: pipe.converted_all_time || 0, color: "bg-green-600" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 hover:bg-muted/20">
                      <span className="text-sm w-36 flex-shrink-0">{item.label}</span>
                      <div className="flex-1">
                        <ProgressBar value={item.value} max={pipe.total_active || 1} color={item.color} />
                      </div>
                      <span className="font-bold font-mono text-sm w-12 text-right">{item.value}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Lead Source ROI ───────────────────────────────── */}
            {crm.sourceROI?.length > 0 && (
              <Section title="Lead Source ROI">
                <div className="rounded-2xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5">Source</th>
                        <th className="text-right px-4 py-2.5">Leads</th>
                        <th className="text-right px-4 py-2.5">Converted</th>
                        <th className="text-right px-4 py-2.5">Conv %</th>
                        <th className="text-right px-4 py-2.5 hidden sm:table-cell">Rev Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {crm.sourceROI.map((s: any, i: number) => (
                        <tr key={s.source} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3 font-medium capitalize flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {i + 1}
                            </span>
                            {s.source}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{s.total}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">{s.converted}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-semibold ${Number(s.conv_rate) >= 20 ? "text-emerald-700" : Number(s.conv_rate) >= 10 ? "text-amber-700" : "text-muted-foreground"}`}>
                              {s.conv_rate || 0}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                            {fmt(s.revenue_est)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Agent Performance ─────────────────────────────── */}
            {crm.agentPerf?.length > 0 && (
              <Section title="Agent Performance (This Month)">
                <div className="rounded-2xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5">Agent</th>
                        <th className="text-right px-4 py-2.5">Assigned</th>
                        <th className="text-right px-4 py-2.5">Converted</th>
                        <th className="text-right px-4 py-2.5">Conv %</th>
                        <th className="text-right px-4 py-2.5 hidden sm:table-cell">Avg Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {crm.agentPerf.map((a: any, i: number) => (
                        <tr key={a.agent_name} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3 font-medium flex items-center gap-2">
                            {i === 0 && <Award size={14} className="text-amber-500 flex-shrink-0" />}
                            {i === 1 && <Award size={14} className="text-gray-400 flex-shrink-0" />}
                            {i === 2 && <Award size={14} className="text-orange-400 flex-shrink-0" />}
                            {i > 2    && <span className="w-5 text-[11px] text-muted-foreground text-center">{i + 1}</span>}
                            {a.agent_name}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{a.assigned}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">{a.converted}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-semibold ${Number(a.conv_rate) >= 30 ? "text-emerald-700" : Number(a.conv_rate) >= 15 ? "text-amber-700" : "text-muted-foreground"}`}>
                              {a.conv_rate || 0}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs hidden sm:table-cell">
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${a.avg_score >= 70 ? "bg-emerald-100 text-emerald-700" : a.avg_score >= 45 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                              {a.avg_score || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ── Performance Metrics ───────────────────────────── */}
            <Section title="Performance Metrics">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Booking Conversion</p>
                  <p className="text-3xl font-bold font-mono text-primary">{d.conversionRate || 0}%</p>
                  <ProgressBar value={d.conversionRate || 0} max={100} />
                  <p className="text-xs text-muted-foreground mt-1">Lead to confirmed booking</p>
                </div>
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Notification Success</p>
                  <p className="text-3xl font-bold font-mono text-emerald-700">{d.notifSuccessRate || 0}%</p>
                  <ProgressBar value={d.notifSuccessRate || 0} max={100} color="bg-emerald-500" />
                  <p className="text-xs text-muted-foreground mt-1">WhatsApp/SMS delivery rate</p>
                </div>
                <div className="rounded-2xl border p-4 bg-background">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Support Resolution</p>
                  <p className="text-3xl font-bold font-mono text-blue-700">{d.ticketResolutionRate || 0}%</p>
                  <ProgressBar value={d.ticketResolutionRate || 0} max={100} color="bg-blue-500" />
                  <p className="text-xs text-muted-foreground mt-1">{d.resolvedTickets || 0} of {d.totalTickets || 0} resolved</p>
                </div>
              </div>
            </Section>

            {/* ── Critical Items ────────────────────────────────── */}
            <Section title="Action Required">
              <div className="rounded-2xl border overflow-hidden">
                {[
                  { label: "Pending Visa Applications",      value: d.pendingVisas         || 0, color: d.pendingVisas > 0 ? "text-red-700" : "text-muted-foreground",    bg: d.pendingVisas > 0 ? "bg-red-50" : "",         href: "/admin/visa",         icon: "🛂" },
                  { label: "Unsigned Agreements",             value: d.unsignedAgreements   || 0, color: d.unsignedAgreements > 0 ? "text-orange-700" : "text-muted-foreground", bg: d.unsignedAgreements > 0 ? "bg-orange-50/50" : "", href: "/admin/agreements", icon: "📝" },
                  { label: "Pending KYC Reviews",             value: d.pendingKyc           || 0, color: d.pendingKyc > 0 ? "text-amber-700" : "text-muted-foreground",     bg: d.pendingKyc > 0 ? "bg-amber-50/50" : "",     href: "/admin/kyc",          icon: "🪪" },
                  { label: "Open Support Tickets",            value: d.openTickets          || 0, color: d.openTickets > 0 ? "text-blue-700" : "text-muted-foreground",      bg: d.openTickets > 0 ? "bg-blue-50/50" : "",     href: "/admin/support",      icon: "💬" },
                  { label: "Departures in Next 7 Days",       value: d.upcomingDepartures   || 0, color: d.upcomingDepartures > 0 ? "text-teal-700" : "text-muted-foreground", bg: d.upcomingDepartures > 0 ? "bg-teal-50/50" : "", href: "/admin/flights",    icon: "✈️" },
                  { label: "Leads — Follow-up Due Today",     value: d.leadsFollowUpDue     || 0, color: d.leadsFollowUpDue > 0 ? "text-violet-700" : "text-muted-foreground", bg: d.leadsFollowUpDue > 0 ? "bg-violet-50/50" : "", href: "/admin/leads",     icon: "🎯" },
                  { label: "Overdue Payment Installments",    value: crm.overdueInstallments?.count || 0, color: crm.overdueInstallments?.count > 0 ? "text-red-700" : "text-muted-foreground", bg: crm.overdueInstallments?.count > 0 ? "bg-red-50/50" : "", href: "/admin/bookings", icon: "💳" },
                ].map(item => (
                  <a key={item.label} href={item.href}
                    className={`flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors ${item.bg}`}>
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className="text-base">{item.icon}</span>{item.label}
                    </span>
                    <span className={`font-bold text-lg font-mono ${item.color}`}>{item.value}</span>
                  </a>
                ))}
              </div>
            </Section>

            {/* ── Recent Bookings ───────────────────────────────── */}
            {d.recentBookings?.length > 0 && (
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
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${
                            b.status === "confirmed" ? "bg-emerald-100 text-emerald-700"
                            : b.status === "approved" ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"}`}>
                            {b.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* ── Daily Report Sender ───────────────────────────── */}
            <Section title="Daily Report">
              <div className="rounded-2xl border p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Send today's executive summary via WhatsApp to management.
                </p>
                <div className="flex gap-2">
                  <input
                    value={reportMobile}
                    onChange={e => setReportMobile(e.target.value)}
                    placeholder="Mobile numbers (comma-separated)"
                    className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button onClick={sendDailyReport} disabled={sendingReport || !reportMobile.trim()}
                    size="sm" className="h-9 gap-1.5 bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#0A3D2A]/90">
                    {sendingReport ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    Send
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Sends via WhatsApp to each number listed. Format: 919876543210
                </p>
              </div>
            </Section>

            {/* AI ops link */}
            <a href="/admin/ai-ops" className="flex items-center justify-between w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 hover:bg-violet-100 transition-colors">
              <span className="flex items-center gap-2.5 text-sm font-semibold text-violet-700">
                <Brain size={18} /> View Full AI Operations Report
              </span>
              <span className="text-xs text-violet-500 font-medium">Open →</span>
            </a>

            {lastRefresh && (
              <p className="text-center text-xs text-muted-foreground">
                Last refreshed: {lastRefresh.toLocaleTimeString("en-IN")} · Auto-refreshes every 5 min
              </p>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
