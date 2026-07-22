import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Users, Bell, Shield, Settings, RefreshCw, Download, Star, Activity } from "lucide-react";
import { Link } from "wouter";

export default function MobileAppDashboard() {
  const APP_FEATURES = [
    { label: "Customer Login", desc: "OTP-based secure authentication", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Booking Tracking", desc: "Real-time booking status updates", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Document Center", desc: "View & download travel documents", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Payment Gateway", desc: "Razorpay integrated checkout", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Agreement Signing", desc: "Digital signature with OTP", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "WhatsApp Alerts", desc: "Automated booking notifications", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Live Support", desc: "In-app customer support chat", status: "live", color: "bg-emerald-50 text-emerald-700" },
    { label: "Pilgrim QR Code", desc: "Personal pilgrim ID & tracking", status: "live", color: "bg-emerald-50 text-emerald-700" },
  ];

  const PORTALS = [
    { label: "Branch Portal", href: "/branch/dashboard", desc: "Branch manager mobile view", icon: Users },
    { label: "Agent Portal", href: "/agent/dashboard", desc: "Agent dashboard & bookings", icon: Users },
    { label: "Staff Portal", href: "/staff/dashboard", desc: "Staff operations view", icon: Users },
    { label: "Customer Portal", href: "/customer/dashboard", desc: "Customer booking & docs", icon: Users },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Smartphone size={18} className="text-primary" /></div>
              Mobile App Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Progressive web app — customer portals, push notifications, and mobile features</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/settings">
              <Button size="sm" className="gap-1.5"><Settings size={13} /> App Settings</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Smartphone, label: "App Type",       val: "PWA",         isStr:true, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Star,       label: "Features Live",  val: APP_FEATURES.length, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Users,      label: "Portals",        val: PORTALS.length,      color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: Shield,     label: "Auth Method",    val: "OTP",         isStr:true, color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">App Features</h2>
            <div className="space-y-2">
              {APP_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${f.color}`}>{f.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">User Portals</h2>
            <div className="space-y-2">
              {PORTALS.map((p, i) => (
                <Link key={i} href={p.href}>
                  <div className="flex items-center justify-between py-1.5 border-b last:border-0 hover:bg-muted/30 rounded cursor-pointer px-1">
                    <div className="flex items-center gap-2">
                      <p.icon size={14} className="text-primary" />
                      <div>
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">Active</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-2">App Configuration</h2>
          <p className="text-xs text-muted-foreground mb-4">Al Burhan Tours & Travels runs as a Progressive Web App (PWA) — no app store required. Customers access it directly from their browser on any device.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Notification Settings", href: "/admin/auto-notifications", icon: Bell },
              { label: "WhatsApp Center", href: "/admin/botbee-dashboard", icon: Activity },
              { label: "User Roles", href: "/admin/user-roles", icon: Shield },
              { label: "Business Settings", href: "/admin/settings", icon: Settings },
            ].map(a => (
              <Link key={a.href} href={a.href}>
                <div className="rounded-xl border bg-muted/30 p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-2">
                  <a.icon size={14} className="text-primary" />
                  <span className="text-xs font-medium">{a.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
