import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, RefreshCw, Send, CheckCircle2, XCircle, BarChart2, FileText, Settings, TrendingUp } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function SmsDashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const l = await fetch(`${API}/api/notification-logs?channel=sms&limit=100`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setLogs(Array.isArray(l) ? l : (l?.logs ? l.logs : []));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const sent = logs.filter(l => l.status === "sent" || l.status === "delivered").length;
  const failed = logs.filter(l => l.status === "failed").length;
  const pending = logs.filter(l => l.status === "pending").length;
  const deliveryRate = logs.length > 0 ? Math.round((sent / logs.length) * 100) : 0;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><MessageSquare size={18} className="text-primary" /></div>
              SMS Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">SMS center — DLT templates, delivery rates, and campaign analytics</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/sms-templates"><Button size="sm" className="gap-1.5"><FileText size={13} /> Templates</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Send,         label: "Total Sent",      val: logs.length,    color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle2, label: "Delivered",       val: sent,           color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: XCircle,      label: "Failed",          val: failed,         color: "bg-red-50 border-red-200 text-red-700" },
            { icon: BarChart2,    label: "Delivery Rate",   val: `${deliveryRate}%`, isStr:true, color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Recent SMS Log</h2>
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
                    <th className="pb-2 text-left font-medium">Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 10).map((l, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{l.recipient || l.mobile || l.phone || "—"}</td>
                      <td className="py-2 text-muted-foreground text-xs">{l.event_type || l.template || "—"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={`text-xs ${l.status === "sent" || l.status === "delivered" ? "bg-emerald-50 text-emerald-700" : l.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                          {l.status || "sent"}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "DLT Templates", href: "/admin/dlt-templates", icon: FileText },
            { label: "SMS Templates", href: "/admin/sms-templates", icon: MessageSquare },
            { label: "SMS Audit Log", href: "/admin/sms-audit", icon: BarChart2 },
            { label: "SMS Settings", href: "/admin/sms-settings", icon: Settings },
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
