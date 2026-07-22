import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, RefreshCw, IndianRupee, Users, TrendingUp, MapPin, Phone, Plus } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function BranchOverview() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/branches`, { credentials: "include" });
      if (r.ok) setBranches(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totalRevenue = branches.reduce((a, b) => a + (b.totalRevenue || b.revenue || 0), 0);
  const totalBookings = branches.reduce((a, b) => a + (b.totalBookings || b.bookings || 0), 0);
  const activeBranches = branches.filter(b => b.status !== "inactive").length;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 size={18} className="text-primary" /></div>
              Branch Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{branches.length} branch{branches.length !== 1 ? "es" : ""} registered</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/branches"><Button size="sm" className="gap-1.5"><Plus size={13} /> Add Branch</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Building2,    label: "Total Branches",  val: branches.length,   color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: TrendingUp,   label: "Active Branches", val: activeBranches,    color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Users,        label: "Total Bookings",  val: totalBookings,     color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: IndianRupee,  label: "Total Revenue",   val: fmt(totalRevenue), color: "bg-amber-50 border-amber-200 text-amber-700", isStr: true },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.isStr ? k.val : k.val.toLocaleString("en-IN")}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Branch Table */}
        <div className="rounded-2xl border bg-card">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">All Branches</h2>
            <Link href="/admin/branches"><Button variant="ghost" size="sm">Manage →</Button></Link>
          </div>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading branches…</div>
          ) : branches.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground mb-3">No branches registered yet.</p>
              <Link href="/admin/branches"><Button size="sm">Add First Branch</Button></Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  {["Branch Name","City","Contact","Bookings","Revenue","Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {branches.map((b, i) => (
                    <tr key={b.id || i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/admin/branch-dashboard/${b.id}`} className="hover:text-primary">{b.name || b.branchName || "—"}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={12} />{b.city || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><Phone size={12} />{b.phone || b.contactPhone || "—"}</span>
                      </td>
                      <td className="px-4 py-3 font-mono">{(b.totalBookings || b.bookings || 0).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 font-mono">{fmt(b.totalRevenue || b.revenue || 0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={b.status === "inactive" ? "destructive" : "default"} className="text-xs">
                          {b.status || "active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/branches"><Button variant="outline" size="sm" className="gap-1.5"><Building2 size={13} /> Manage Branches</Button></Link>
            <Link href="/admin/branch-login"><Button variant="outline" size="sm" className="gap-1.5"><Users size={13} /> Branch Logins</Button></Link>
            <Link href="/admin/reports"><Button variant="outline" size="sm" className="gap-1.5"><TrendingUp size={13} /> Branch Reports</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
