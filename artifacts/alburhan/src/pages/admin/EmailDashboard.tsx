import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, RefreshCw, Send, CheckCircle2, XCircle, BarChart2,
  FileText, Settings, Inbox, RotateCcw, Clock, TrendingUp, Megaphone,
} from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function EmailDashboard() {
  const { toast } = useToast();
  const [logs, setLogs]     = useState<any[]>([]);
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  // Test email state
  const [testEmail,   setTestEmail]   = useState("");
  const [testSubject, setTestSubject] = useState("Test Email from Al Burhan");
  const [testBody,    setTestBody]    = useState("This is a test email from Al Burhan Tours & Travels.");
  const [testSending, setTestSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        fetch(`${API}/api/notification-logs?channel=email&limit=50`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/notification-center/stats`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);
      setLogs(Array.isArray(l) ? l : (l?.logs ? l.logs : []));
      setStats(s);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retryOne(logId: string) {
    setRetrying(p => ({ ...p, [logId]: true }));
    try {
      const r = await fetch(`${API}/api/notification-center/retry/${logId}`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) { toast({ title: "Retry queued" }); load(); }
      else toast({ title: "Retry failed", description: d.error, variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setRetrying(p => ({ ...p, [logId]: false }));
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    try {
      const r = await fetch(`${API}/api/notification-center/retry-all-failed`, { method: "POST", credentials: "include" });
      const d = await r.json();
      toast({ title: "Retry queued", description: `${d.queued || 0} failed emails re-queued.` });
      setTimeout(load, 1500);
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setRetryingAll(false);
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) { toast({ title: "Enter recipient email", variant: "destructive" }); return; }
    setTestSending(true);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email", recipient: testEmail, message: testBody }),
      });
      const d = await r.json();
      if (r.ok) { toast({ title: "Email sent!", description: `Delivered to ${testEmail}` }); load(); }
      else toast({ title: "Failed", description: d.error || "Could not send test email.", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setTestSending(false);
  }

  const sent        = logs.filter(l => l.status === "sent" || l.status === "delivered").length;
  const failed      = logs.filter(l => l.status === "failed").length;
  const pending     = logs.filter(l => l.status === "pending").length;
  const deliveryRate = logs.length > 0 ? Math.round((sent / logs.length) * 100) : 0;

  const emailStats = stats?.channelStats?.email || {};

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <Mail size={18} className="text-violet-700" />
              </div>
              Email Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Email delivery tracking, templates, and campaign analytics</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {failed > 0 && (
              <Button onClick={retryAllFailed} disabled={retryingAll} variant="outline" size="sm" className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
                <RotateCcw size={13} className={retryingAll ? "animate-spin" : ""} /> Retry {failed} Failed
              </Button>
            )}
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/email-templates">
              <Button size="sm" className="gap-1.5"><FileText size={13} /> Templates</Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Send,         label: "Emails Sent",   val: logs.length,    color: "bg-blue-50   border-blue-200   text-blue-700" },
            { icon: CheckCircle2, label: "Delivered",     val: sent,           color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: XCircle,      label: "Failed",        val: failed,         color: failed > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500" },
            { icon: BarChart2,    label: "Delivery Rate", val: `${deliveryRate}%`, color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Email Log */}
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Mail size={15} className="text-muted-foreground" /> Recent Email Log
            </h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No email logs available</p>
                <p className="text-xs mt-1 opacity-60">Emails are logged when notifications are sent to customers</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="pb-2 text-left font-medium">Recipient</th>
                      <th className="pb-2 text-left font-medium">Event</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 20).map((l, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 font-medium text-xs max-w-[120px] truncate">{l.recipient || l.email || "—"}</td>
                        <td className="py-2 text-muted-foreground text-xs max-w-[100px] truncate">{l.event_type || l.subject || "—"}</td>
                        <td className="py-2">
                          <Badge variant="outline" className={`text-xs ${
                            l.status === "sent" || l.status === "delivered" ? "bg-emerald-50 text-emerald-700"
                            : l.status === "failed" ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                          }`}>
                            {l.status || "sent"}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {l.status === "failed" && (
                            <button
                              onClick={() => retryOne(l.id)}
                              disabled={retrying[l.id]}
                              className="p-1.5 rounded hover:bg-orange-50 text-orange-500 disabled:opacity-40"
                              title="Retry"
                            >
                              {retrying[l.id]
                                ? <RefreshCw size={13} className="animate-spin" />
                                : <RotateCcw size={13} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Test Email + Quick Stats */}
          <div className="space-y-4">

            {/* Send Test Email */}
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Send size={15} className="text-primary" /> Send Test Email
              </h2>
              <div className="space-y-2">
                <Input value={testEmail}   onChange={e => setTestEmail(e.target.value)}   placeholder="Recipient email *" type="email" className="text-sm" />
                <Input value={testSubject} onChange={e => setTestSubject(e.target.value)} placeholder="Subject"            className="text-sm" />
                <Input value={testBody}    onChange={e => setTestBody(e.target.value)}    placeholder="Body text"         className="text-sm" />
                <Button onClick={sendTestEmail} disabled={testSending || !testEmail.trim()} className="w-full gap-2">
                  {testSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  {testSending ? "Sending…" : "Send Test Email"}
                </Button>
              </div>
            </div>

            {/* Delivery stats from notification-center */}
            {emailStats && Object.keys(emailStats).length > 0 && (
              <div className="rounded-2xl border bg-card p-5">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <TrendingUp size={15} className="text-primary" /> All-Time Email Stats
                </h2>
                <div className="space-y-2 text-sm">
                  {Object.entries(emailStats).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queue status */}
            {pending > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
                <Clock size={18} className="text-amber-600 shrink-0" />
                <div className="text-sm text-amber-800">
                  <strong>{pending}</strong> emails in pending/retry queue
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Email Templates",       href: "/admin/email-templates",       icon: FileText  },
            { label: "Notification Logs",     href: "/admin/notification-logs",     icon: BarChart2 },
            { label: "Marketing Center",      href: "/admin/marketing",             icon: Megaphone },
            { label: "API Settings (SMTP)",   href: "/admin/api-settings",          icon: Settings  },
          ].map(a => (
            <Link key={a.href} href={a.href}>
              <div className="rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-3">
                <a.icon size={16} className="text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
