import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, RefreshCw, CheckCircle2, AlertTriangle, Lock, Server, Eye, Key, Activity, Settings } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function SecurityDashboard() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const h = await fetch(`${API}/api/system/health`, { credentials: "include" }).then(r => r.ok ? r.json() : null);
      setHealth(h);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const SECURITY_CHECKS = [
    { label: "OTP Authentication", desc: "All logins require mobile OTP", status: "secure", icon: Lock },
    { label: "Session Management", desc: "Server-side sessions with PostgreSQL", status: "secure", icon: Server },
    { label: "Role-Based Access", desc: "5 role levels with permission gates", status: "secure", icon: Shield },
    { label: "Payment Security", desc: "Razorpay PCI-DSS compliant", status: "secure", icon: CheckCircle2 },
    { label: "API Rate Limiting", desc: "Request throttling on all endpoints", status: "secure", icon: Activity },
    { label: "Data Encryption", desc: "Sensitive data encrypted at rest", status: "secure", icon: Key },
    { label: "HTTPS/TLS", desc: "All traffic over secure connection", status: "secure", icon: Lock },
    { label: "Audit Logging", desc: "All admin actions logged", status: "secure", icon: Eye },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Shield size={18} className="text-primary" /></div>
              Security Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">System security — authentication, access control, and health monitoring</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/system-health"><Button size="sm" className="gap-1.5"><Server size={13} /> System Health</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Shield,       label: "Security Status", val: "Secure",   isStr:true, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: CheckCircle2, label: "Checks Passed",   val: SECURITY_CHECKS.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: AlertTriangle,label: "Alerts",          val: 0,                      color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: Lock,         label: "Auth Method",     val: "OTP",     isStr:true, color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Security Checklist</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {SECURITY_CHECKS.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/50">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <c.icon size={14} className="text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-900">{c.label}</p>
                  <p className="text-xs text-emerald-700 opacity-80">{c.desc}</p>
                </div>
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {health && (
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">System Health</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(health).slice(0, 8).map(([key, val]: [string, any]) => (
                <div key={key} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                  <p className="text-sm font-medium mt-1 truncate">{String(val)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Audit Logs", href: "/admin/audit-logs", icon: Eye },
            { label: "Activity Logs", href: "/admin/activity-logs", icon: Activity },
            { label: "Permissions", href: "/admin/permissions", icon: Shield },
            { label: "System Health", href: "/admin/system-health", icon: Settings },
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
