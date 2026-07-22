import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Puzzle, RefreshCw, CheckCircle2, XCircle, Settings, Zap, MessageSquare, CreditCard, Mail, Send, Server } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function IntegrationsDashboard() {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetch(`${API}/api/settings/public`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setSettings(Array.isArray(s) ? s : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const INTEGRATIONS = [
    {
      name: "Razorpay",
      category: "Payments",
      desc: "Payment gateway — orders, links, and reconciliation",
      icon: CreditCard,
      color: "bg-blue-50 border-blue-200",
      iconColor: "text-blue-600",
      status: "active",
      href: "/admin/api-settings",
    },
    {
      name: "BotBee WhatsApp",
      category: "Messaging",
      desc: "WhatsApp Business API — templates & automated messages",
      icon: MessageSquare,
      color: "bg-emerald-50 border-emerald-200",
      iconColor: "text-emerald-600",
      status: "active",
      href: "/admin/botbee-dashboard",
    },
    {
      name: "Fast2SMS",
      category: "SMS",
      desc: "DLT-compliant SMS gateway for OTP and notifications",
      icon: Send,
      color: "bg-violet-50 border-violet-200",
      iconColor: "text-violet-600",
      status: "active",
      href: "/admin/sms-settings",
    },
    {
      name: "SMTP Email",
      category: "Email",
      desc: "Transactional email delivery via SMTP relay",
      icon: Mail,
      color: "bg-amber-50 border-amber-200",
      iconColor: "text-amber-600",
      status: "active",
      href: "/admin/api-settings",
    },
    {
      name: "Google Cloud Storage",
      category: "Storage",
      desc: "Object storage for documents, images, and media",
      icon: Server,
      color: "bg-red-50 border-red-200",
      iconColor: "text-red-600",
      status: "active",
      href: "/admin/api-settings",
    },
    {
      name: "PostgreSQL",
      category: "Database",
      desc: "Primary relational database for all ERP data",
      icon: Puzzle,
      color: "bg-indigo-50 border-indigo-200",
      iconColor: "text-indigo-600",
      status: "active",
      href: "/admin/system-health",
    },
  ];

  const activeCount = INTEGRATIONS.filter(i => i.status === "active").length;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Puzzle size={18} className="text-primary" /></div>
              Integration Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Third-party integrations — payments, messaging, storage, and APIs</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/api-settings"><Button size="sm" className="gap-1.5"><Settings size={13} /> API Settings</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Puzzle,       label: "Total Integrations", val: INTEGRATIONS.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle2, label: "Active",             val: activeCount,         color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: XCircle,      label: "Inactive",           val: INTEGRATIONS.length - activeCount, color: "bg-gray-50 border-gray-200 text-gray-600" },
            { icon: Zap,          label: "Uptime",             val: "99.9%", isStr:true,  color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-4">Connected Integrations</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {INTEGRATIONS.map((intg, i) => (
              <Link key={i} href={intg.href}>
                <div className={`flex items-center gap-4 p-4 rounded-xl border ${intg.color} hover:opacity-80 transition-opacity cursor-pointer`}>
                  <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <intg.icon size={18} className={intg.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{intg.name}</p>
                      <Badge variant="outline" className="text-xs bg-white text-gray-600">{intg.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{intg.desc}</p>
                  </div>
                  <Badge variant="outline" className="text-xs bg-white text-emerald-700 border-emerald-200 flex-shrink-0">
                    <CheckCircle2 size={9} className="mr-1" />{intg.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "API Settings", href: "/admin/api-settings", icon: Settings },
            { label: "System Health", href: "/admin/system-health", icon: Server },
            { label: "Notification Test", href: "/admin/test-notifications", icon: Zap },
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
