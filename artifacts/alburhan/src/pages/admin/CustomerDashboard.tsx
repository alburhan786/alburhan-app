import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, UserCheck, Star, TrendingUp, Phone, Mail, UserPlus, IndianRupee } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function CustomerDashboard() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        fetch(`${API}/api/customers`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/bookings`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setCustomers(Array.isArray(c) ? c : []);
      setBookings(Array.isArray(b) ? b : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const kycDone = customers.filter(c => c.kyc_status === "approved" || c.kyc_complete).length;
  const revenue = bookings.reduce((a, b) => a + (parseFloat(b.paid_amount || b.amount || 0)), 0);
  const activeBookings = bookings.filter(b => b.status === "confirmed" || b.status === "approved").length;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Users size={18} className="text-primary" /></div>
              Customer Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Customer analytics — registrations, bookings, revenue and KYC status</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/customers"><Button size="sm" className="gap-1.5"><UserPlus size={13} /> Manage Customers</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Users,       label: "Total Customers",   val: customers.length,                        color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: UserCheck,   label: "KYC Approved",      val: kycDone,                                 color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: TrendingUp,  label: "Active Bookings",   val: activeBookings,                          color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: IndianRupee, label: "Total Revenue",     val: fmt(revenue), isStr: true,               color: "bg-amber-50 border-amber-200 text-amber-700" },
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
            <h2 className="font-semibold text-sm mb-3">Recent Customers</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers registered yet</p>
            ) : (
              <div className="space-y-2">
                {customers.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{c.name || c.full_name || "Customer"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        {c.mobile && <span className="flex items-center gap-1"><Phone size={10} />{c.mobile}</span>}
                        {c.email && <span className="flex items-center gap-1"><Mail size={10} />{c.email}</span>}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${c.kyc_status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {c.kyc_status || "pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Recent Bookings</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet</p>
            ) : (
              <div className="space-y-2">
                {bookings.slice(0, 6).map((b, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">#{b.booking_number || b.id?.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{b.package_name || b.type || "Package"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{fmt(parseFloat(b.paid_amount || b.amount || 0))}</p>
                      <Badge variant="outline" className="text-xs">{b.status || "pending"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "All Customers", href: "/admin/customers", icon: Users },
            { label: "KYC Management", href: "/admin/kyc", icon: UserCheck },
            { label: "Bookings", href: "/admin/bookings", icon: TrendingUp },
            { label: "CRM Dashboard", href: "/admin/crm", icon: Star },
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
