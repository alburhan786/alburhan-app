import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, MessageSquare, Mail, Bell, Smartphone, Users, TrendingUp,
  CheckCircle2, XCircle, Clock, Send, Activity, Zap, Inbox, Share2,
  ArrowRight, AlertTriangle, BarChart2, Bot,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

type Summary = {
  notifications: { total: number; sent: number; failed: number; last_hour: number; today: number; avg_ms: number; success_rate: number };
  queue: { pending: number; sending: number; sent: number; failed: number };
  workflows: { total: number; completed: number; failed: number; today: number };
  events: { total: number; processed: number; failed: number; today: number };
  dlq: { total: number };
  channels: {
    whatsapp: { total: number; sent: number; failed: number; delivered: number };
    sms:      { total: number; sent: number; failed: number; delivered: number };
    email:    { total: number; sent: number; failed: number; delivered: number };
    push:     { total: number; sent: number; failed: number; delivered: number };
    rcs:      { total: number; sent: number; failed: number; delivered: number };
  };
  social: { facebook_leads: number; instagram_leads: number };
  leads: { total: number; today: number; converted: number; from_facebook: number; from_instagram: number; from_whatsapp: number; from_website: number };
  bookings: number;
  conversion_rate: number;
  generatedAt?: string;
};

function StatCard({
  icon: Icon, label, value, sub, color, href,
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string; href?: string;
}) {
  const colorMap: Record<string, string> = {
    green:  "border-emerald-200 bg-emerald-50 text-emerald-700",
    red:    "border-red-200 bg-red-50 text-red-700",
    blue:   "border-blue-200 bg-blue-50 text-blue-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    amber:  "border-amber-200 bg-amber-50 text-amber-700",
    cyan:   "border-cyan-200 bg-cyan-50 text-cyan-700",
    pink:   "border-pink-200 bg-pink-50 text-pink-700",
    sky:    "border-sky-200 bg-sky-50 text-sky-700",
    gray:   "border-gray-200 bg-white text-gray-700",
  };
  const cls = colorMap[color || "gray"];
  const inner = (
    <div className={`rounded-2xl border p-4 ${cls} h-full hover:shadow-sm transition-shadow`}>
      <Icon size={18} className="mb-2 opacity-70" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
      {sub && <div className="text-xs mt-0.5 opacity-60">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function ChannelRow({
  icon, label, color, data, href,
}: {
  icon: string; label: string; color: string; data: { total: number; sent: number; failed: number; delivered: number }; href: string;
}) {
  const rate = data.total > 0 ? Math.round(data.sent / data.total * 100) : 0;
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary/30 hover:bg-muted/30 transition-colors cursor-pointer">
        <span className="text-xl w-8 text-center">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">{label}</span>
            <span className="text-xs text-muted-foreground">{data.total} total</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
            </div>
            <span className="text-xs font-semibold text-emerald-700 w-10 text-right">{rate}%</span>
          </div>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span className="text-emerald-600">✓ {data.sent} sent</span>
            {data.failed > 0 && <span className="text-red-600">✗ {data.failed} failed</span>}
          </div>
        </div>
        <ArrowRight size={14} className="text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

const QUICK_LINKS = [
  { label: "Omnichannel Inbox",   href: "/admin/inbox",                  icon: Inbox,        color: "text-blue-600" },
  { label: "Broadcast Message",   href: "/admin/broadcast",              icon: Send,         color: "text-emerald-600" },
  { label: "Lead Manager",        href: "/admin/leads",                  icon: Users,        color: "text-purple-600" },
  { label: "Automation Center",   href: "/admin/automation-center",      icon: Zap,          color: "text-amber-600" },
  { label: "Comms Engine",        href: "/admin/comms-engine",           icon: Activity,     color: "text-red-600" },
  { label: "Marketing Center",    href: "/admin/marketing",              icon: BarChart2,    color: "text-cyan-600" },
  { label: "Notification Logs",   href: "/admin/notification-logs",      icon: Bell,         color: "text-pink-600" },
  { label: "Social Media",        href: "/admin/social-media",           icon: Share2,       color: "text-sky-600" },
  { label: "WhatsApp Dashboard",  href: "/admin/botbee-dashboard",       icon: Bot,          color: "text-green-600" },
  { label: "SMS Dashboard",       href: "/admin/sms-dashboard",          icon: Smartphone,   color: "text-blue-600" },
  { label: "Email Dashboard",     href: "/admin/email-dashboard",        icon: Mail,         color: "text-purple-600" },
  { label: "Test Notifications",  href: "/admin/test-notifications",     icon: Bell,         color: "text-orange-600" },
];

export default function CommsDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/comms/summary`, { credentials: "include" });
      if (r.ok) {
        setSummary(await r.json());
        setLastRefresh(new Date());
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = summary;
  const ch = s?.channels || { whatsapp: {}, sms: {}, email: {}, push: {}, rcs: {} };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <MessageSquare size={18} className="text-white" />
              </div>
              Communication & Marketing Hub
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live overview of all channels · WhatsApp · SMS · Email · Push · Social Leads
              {lastRefresh && <span className="ml-2 opacity-60">· Updated {lastRefresh.toLocaleTimeString()}</span>}
            </p>
          </div>
          <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading && !s && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-muted/30 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {s && (
          <>
            {/* ── Row 1: Notification KPIs ── */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">📨 Notifications (7 days)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Send}         label="Total Sent"     value={s.notifications.total}     color="blue"   href="/admin/notification-logs" />
                <StatCard icon={CheckCircle2} label="Delivered"      value={s.notifications.sent}      color="green"  href="/admin/notification-logs" />
                <StatCard icon={XCircle}      label="Failed"         value={s.notifications.failed}    color={s.notifications.failed > 0 ? "red" : "gray"} href="/admin/comms-engine" />
                <StatCard icon={Clock}        label="Last Hour"      value={s.notifications.last_hour} color="amber"  href="/admin/comms-engine" />
                <StatCard icon={Activity}     label="Success Rate"   value={`${s.notifications.success_rate}%`} sub="delivery rate" color={s.notifications.success_rate >= 90 ? "green" : "red"} />
                <StatCard icon={AlertTriangle} label="Dead Letter"   value={s.dlq.total} color={s.dlq.total > 0 ? "red" : "gray"} href="/admin/comms-engine" />
              </div>
            </div>

            {/* ── Row 2: Lead & Conversion Stats ── */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">🎯 Leads & Conversions (30 days)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                <StatCard icon={Users}       label="Facebook Leads"   value={s.social.facebook_leads}  color="sky"    href="/admin/leads" />
                <StatCard icon={Users}       label="Instagram Leads"  value={s.social.instagram_leads} color="pink"   href="/admin/leads" />
                <StatCard icon={Users}       label="Total Leads"      value={s.leads.total}            sub={`+${s.leads.today} today`}    color="purple" href="/admin/leads" />
                <StatCard icon={TrendingUp}  label="Conversion Rate"  value={`${s.conversion_rate}%`} sub={`${s.leads.converted} converted`} color={s.conversion_rate >= 20 ? "green" : "amber"} href="/admin/leads" />
                <StatCard icon={BarChart2}   label="New Bookings"     value={s.bookings}               sub="from leads (30d)"             color="blue"   href="/admin/bookings" />
              </div>
            </div>

            {/* ── Row 3: Channels + Lead Sources ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Channel Delivery Rates */}
              <div className="rounded-2xl border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Activity size={16} className="text-primary" /> Channel Delivery (30 days)
                </h3>
                <ChannelRow icon="💬" label="WhatsApp" color="emerald" data={ch.whatsapp as any} href="/admin/botbee-dashboard" />
                <ChannelRow icon="📱" label="SMS"       color="blue"    data={ch.sms as any}      href="/admin/sms-dashboard" />
                <ChannelRow icon="✉️" label="Email"     color="purple"  data={ch.email as any}    href="/admin/email-dashboard" />
                <ChannelRow icon="🔔" label="Push"      color="orange"  data={ch.push as any}     href="/admin/notification-health" />
                {ch.rcs && (ch.rcs as any).total > 0 && (
                  <ChannelRow icon="🔵" label="RCS" color="pink" data={ch.rcs as any} href="/admin/rcs-templates" />
                )}
              </div>

              {/* Lead Sources */}
              <div className="rounded-2xl border bg-card p-5">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
                  <Users size={16} className="text-primary" /> Lead Sources (30 days)
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Facebook", value: s.leads.from_facebook,  icon: "📘", color: "bg-sky-500"   },
                    { label: "Instagram", value: s.leads.from_instagram, icon: "📸", color: "bg-pink-500"  },
                    { label: "WhatsApp",  value: s.leads.from_whatsapp,  icon: "💬", color: "bg-emerald-500" },
                    { label: "Website",   value: s.leads.from_website,   icon: "🌐", color: "bg-blue-500"  },
                    { label: "Other",     value: Math.max(0, s.leads.total - s.leads.from_facebook - s.leads.from_instagram - s.leads.from_whatsapp - s.leads.from_website), icon: "📋", color: "bg-gray-400" },
                  ].map(src => {
                    const pct = s.leads.total > 0 ? Math.round(src.value / s.leads.total * 100) : 0;
                    return (
                      <Link key={src.label} href="/admin/leads">
                        <div className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors">
                          <span className="text-base w-6 text-center">{src.icon}</span>
                          <span className="text-sm font-medium w-24">{src.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${src.color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-bold w-8 text-right">{src.value}</span>
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted/40 py-2">
                    <div className="font-bold text-base">{s.leads.total}</div>
                    <div className="text-muted-foreground">Total Leads</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2">
                    <div className="font-bold text-base text-emerald-700">{s.leads.converted}</div>
                    <div className="text-emerald-600">Converted</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row 4: Queue + Workflow Health ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-amber-500" /> Retry Queue
                </h3>
                <div className="space-y-1.5 text-sm">
                  {[
                    ["Pending",  s.queue.pending, "text-amber-600"],
                    ["Sending",  s.queue.sending, "text-blue-600"],
                    ["Done",     s.queue.sent,    "text-emerald-600"],
                    ["Failed",   s.queue.failed,  s.queue.failed > 0 ? "text-red-600" : "text-emerald-600"],
                  ].map(([l, v, c]) => (
                    <div key={String(l)} className="flex justify-between">
                      <span className="text-muted-foreground">{l}</span>
                      <span className={`font-semibold ${c}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/comms-engine">
                  <Button variant="outline" size="sm" className="w-full mt-3 text-xs">View Queue →</Button>
                </Link>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Zap size={15} className="text-blue-500" /> Workflow Engine (7d)
                </h3>
                <div className="space-y-1.5 text-sm">
                  {[
                    ["Executions",    s.workflows.total,     ""],
                    ["Completed",     s.workflows.completed, "text-emerald-600"],
                    ["Failed",        s.workflows.failed,    s.workflows.failed > 0 ? "text-red-600" : "text-emerald-600"],
                    ["Today",         s.workflows.today,     ""],
                  ].map(([l, v, c]) => (
                    <div key={String(l)} className="flex justify-between">
                      <span className="text-muted-foreground">{l}</span>
                      <span className={`font-semibold ${c}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/comms-engine">
                  <Button variant="outline" size="sm" className="w-full mt-3 text-xs">View Workflows →</Button>
                </Link>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Activity size={15} className="text-purple-500" /> Event Bus (7d)
                </h3>
                <div className="space-y-1.5 text-sm">
                  {[
                    ["Events Published", s.events.total,     ""],
                    ["Processed",        s.events.processed, "text-emerald-600"],
                    ["Failed",           s.events.failed,    s.events.failed > 0 ? "text-red-600" : "text-emerald-600"],
                    ["Today",            s.events.today,     ""],
                  ].map(([l, v, c]) => (
                    <div key={String(l)} className="flex justify-between">
                      <span className="text-muted-foreground">{l}</span>
                      <span className={`font-semibold ${c}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <Link href="/admin/comms-engine">
                  <Button variant="outline" size="sm" className="w-full mt-3 text-xs">View Events →</Button>
                </Link>
              </div>
            </div>

            {/* ── Row 5: Alerts ── */}
            {(s.notifications.failed > 0 || s.dlq.total > 0 || s.queue.failed > 0) && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <h3 className="font-semibold text-red-800 text-sm mb-2 flex items-center gap-2">
                  <AlertTriangle size={15} /> Action Required
                </h3>
                <div className="flex flex-wrap gap-3 text-sm text-red-700">
                  {s.notifications.failed > 0 && (
                    <Link href="/admin/notification-logs?status=failed">
                      <Badge variant="outline" className="border-red-300 text-red-700 cursor-pointer hover:bg-red-100">
                        {s.notifications.failed} failed notifications
                      </Badge>
                    </Link>
                  )}
                  {s.dlq.total > 0 && (
                    <Link href="/admin/comms-engine">
                      <Badge variant="outline" className="border-red-300 text-red-700 cursor-pointer hover:bg-red-100">
                        {s.dlq.total} in dead letter queue
                      </Badge>
                    </Link>
                  )}
                  {s.queue.failed > 0 && (
                    <Link href="/admin/comms-engine">
                      <Badge variant="outline" className="border-red-300 text-red-700 cursor-pointer hover:bg-red-100">
                        {s.queue.failed} retry queue failures
                      </Badge>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Quick Links ── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">⚡ Quick Access</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {QUICK_LINKS.map(ql => (
              <Link key={ql.href} href={ql.href}>
                <div className="rounded-xl border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-2.5">
                  <ql.icon size={15} className={ql.color} />
                  <span className="text-xs font-medium leading-tight">{ql.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
