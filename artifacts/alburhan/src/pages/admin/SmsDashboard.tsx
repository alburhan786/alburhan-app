import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, RefreshCw, Send, CheckCircle2, XCircle,
  BarChart2, FileText, Settings, RotateCcw, Clock, Phone,
} from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function SmsDashboard() {
  const { toast } = useToast();
  const [logs, setLogs]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  // Test SMS state
  const [testPhone,   setTestPhone]   = useState("");
  const [testMessage, setTestMessage] = useState("Test SMS from Al Burhan Tours & Travels.");
  const [testSending, setTestSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const l = await fetch(`${API}/api/notification-logs?channel=sms&limit=50`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setLogs(Array.isArray(l) ? l : (l?.logs ? l.logs : []));
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
      toast({ title: "Retry queued", description: `${d.queued || 0} failed SMS re-queued.` });
      setTimeout(load, 1500);
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setRetryingAll(false);
  }

  async function sendTestSms() {
    if (!testPhone.trim()) { toast({ title: "Enter phone number", variant: "destructive" }); return; }
    setTestSending(true);
    try {
      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "sms", recipient: testPhone, message: testMessage }),
      });
      const d = await r.json();
      if (r.ok) { toast({ title: "SMS sent!", description: `Sent to ${testPhone}` }); load(); }
      else toast({ title: "Failed", description: d.error || "Could not send test SMS.", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setTestSending(false);
  }

  const sent        = logs.filter(l => l.status === "sent" || l.status === "delivered").length;
  const failed      = logs.filter(l => l.status === "failed").length;
  const pending     = logs.filter(l => l.status === "pending").length;
  const deliveryRate = logs.length > 0 ? Math.round((sent / logs.length) * 100) : 0;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <MessageSquare size={18} className="text-blue-700" />
              </div>
              SMS Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">SMS center — DLT templates, delivery rates, and campaign analytics</p>
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
            <Link href="/admin/sms-templates">
              <Button size="sm" className="gap-1.5"><FileText size={13} /> Templates</Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Send,         label: "Total Sent",    val: logs.length,        color: "bg-blue-50   border-blue-200   text-blue-700" },
            { icon: CheckCircle2, label: "Delivered",     val: sent,               color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: XCircle,      label: "Failed",        val: failed,             color: failed > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500" },
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

          {/* SMS Log with retry */}
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <MessageSquare size={15} className="text-muted-foreground" /> Recent SMS Log
            </h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No SMS logs available</p>
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
                        <td className="py-2 font-medium text-xs">{l.recipient || l.mobile || l.phone || "—"}</td>
                        <td className="py-2 text-muted-foreground text-xs max-w-[100px] truncate">{l.event_type || l.template || "—"}</td>
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

          {/* Test SMS + queue status */}
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Send size={15} className="text-primary" /> Send Test SMS
              </h2>
              <p className="text-xs text-muted-foreground">Send a quick SMS via Fast2SMS to verify the connection.</p>
              <div className="space-y-2">
                <Input
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="Phone number (10-digit) *"
                  className="text-sm"
                />
                <Input
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  placeholder="Message text"
                  className="text-sm"
                />
                <Button
                  onClick={sendTestSms}
                  disabled={testSending || !testPhone.trim()}
                  className="w-full gap-2"
                >
                  {testSending ? <RefreshCw size={14} className="animate-spin" /> : <Phone size={14} />}
                  {testSending ? "Sending…" : "Send Test SMS"}
                </Button>
              </div>
            </div>

            {pending > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
                <Clock size={18} className="text-amber-600 shrink-0" />
                <div className="text-sm text-amber-800">
                  <strong>{pending}</strong> SMS in pending/retry queue
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "DLT Templates",   href: "/admin/dlt-templates", icon: FileText      },
            { label: "SMS Templates",   href: "/admin/sms-templates", icon: MessageSquare },
            { label: "SMS Audit Log",   href: "/admin/sms-audit",     icon: BarChart2     },
            { label: "SMS Settings",    href: "/admin/sms-settings",  icon: Settings      },
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
