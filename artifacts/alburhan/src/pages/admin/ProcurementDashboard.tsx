import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, RefreshCw, Clock, CheckCircle, IndianRupee, Truck, Plus, AlertCircle, FileText } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function ProcurementDashboard() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [vendors, setVendors]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [e, v] = await Promise.all([
        fetch(`${API}/api/expenses`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/vendors`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setExpenses(Array.isArray(e) ? e : []);
      setVendors(Array.isArray(v) ? v : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const pending   = expenses.filter(e => e.status === "pending" || e.approvalStatus === "pending").length;
  const approved  = expenses.filter(e => e.status === "approved" || e.approvalStatus === "approved").length;
  const totalSpend = expenses.reduce((a, b) => a + (parseFloat(b.amount || 0)), 0);

  // Monthly spend grouping
  const monthlyMap: Record<string, number> = {};
  for (const e of expenses) {
    const d = e.date || e.createdAt || e.expenseDate;
    if (d) {
      const month = new Date(d).toLocaleString("en-IN", { month: "short", year: "2-digit" });
      monthlyMap[month] = (monthlyMap[month] || 0) + (parseFloat(e.amount) || 0);
    }
  }
  const recentMonths = Object.entries(monthlyMap).slice(-6);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><ShoppingCart size={18} className="text-primary" /></div>
              Procurement Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Purchase orders, vendor spend, and procurement approvals</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/expenses"><Button size="sm" className="gap-1.5"><Plus size={13} /> New Purchase</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: ShoppingCart, label: "Total Orders",   val: expenses.length,   color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Clock,        label: "Pending",        val: pending,           color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: CheckCircle,  label: "Approved",       val: approved,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: IndianRupee,  label: "Total Spend",    val: fmt(totalSpend),   color: "bg-violet-50 border-violet-200 text-violet-700", isStr: true },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Monthly Spend */}
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold mb-4">Monthly Spend</h2>
            {recentMonths.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No purchase data yet.</div>
            ) : (
              <div className="space-y-3">
                {recentMonths.map(([month, amt]) => {
                  const max = Math.max(...recentMonths.map(([,v]) => v));
                  const pct = max > 0 ? Math.round((amt / max) * 100) : 0;
                  return (
                    <div key={month}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{month}</span>
                        <span className="font-mono text-muted-foreground">{fmt(amt)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="rounded-2xl border bg-card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Recent Purchases</h2>
              <Link href="/admin/expenses"><Button variant="ghost" size="sm">View All →</Button></Link>
            </div>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="py-10 text-center">
                <ShoppingCart size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No purchases yet.</p>
                <Link href="/admin/expenses"><Button size="sm" className="mt-3">Add Purchase</Button></Link>
              </div>
            ) : (
              <div className="divide-y">
                {expenses.slice(0, 8).map((e, i) => (
                  <div key={e.id || i} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">{e.description || e.title || e.category || "Purchase"}</p>
                      <p className="text-xs text-muted-foreground">{e.vendor || e.vendorName || "—"} · {e.date ? new Date(e.date).toLocaleDateString("en-IN") : "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium">{fmt(parseFloat(e.amount || 0))}</p>
                      <Badge variant={e.status === "rejected" ? "destructive" : e.status === "approved" ? "default" : "outline"} className="text-xs">
                        {e.status || "pending"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Vendors */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Approved Vendors</h2>
            <Link href="/admin/vendors"><Button variant="ghost" size="sm">Manage →</Button></Link>
          </div>
          {vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No vendors registered.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {vendors.slice(0, 8).map((v, i) => (
                <div key={v.id || i} className="p-3 rounded-xl border bg-muted/20 text-center">
                  <Truck size={18} className="mx-auto mb-1 text-muted-foreground" />
                  <p className="text-sm font-medium">{v.name || v.vendorName || "Vendor"}</p>
                  <p className="text-xs text-muted-foreground">{v.type || v.category || "General"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/expenses"><Button variant="outline" size="sm" className="gap-1.5"><FileText size={13} /> Expenses</Button></Link>
            <Link href="/admin/vendors"><Button variant="outline" size="sm" className="gap-1.5"><Truck size={13} /> Vendors</Button></Link>
            <Link href="/admin/suppliers"><Button variant="outline" size="sm" className="gap-1.5"><ShoppingCart size={13} /> Suppliers</Button></Link>
            <Link href="/admin/srm"><Button variant="outline" size="sm" className="gap-1.5"><AlertCircle size={13} /> SRM Dashboard</Button></Link>
            <Link href="/admin/inventory"><Button variant="outline" size="sm" className="gap-1.5"><Package size={13} /> Inventory</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
