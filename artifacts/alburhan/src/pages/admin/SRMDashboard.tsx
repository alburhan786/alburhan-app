import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Handshake, RefreshCw, Truck, Package, IndianRupee, ShieldCheck, Phone, Plus, Star } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function SRMDashboard() {
  const [vendors, setVendors]       = useState<any[]>([]);
  const [suppliers, setSuppliers]   = useState<any[]>([]);
  const [expenses, setExpenses]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [v, s, e] = await Promise.all([
        fetch(`${API}/api/vendors`,               { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/enterprise/suppliers`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/expenses`,              { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setVendors(Array.isArray(v) ? v : []);
      setSuppliers(Array.isArray(s) ? s : []);
      setExpenses(Array.isArray(e) ? e : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const allSuppliers = [...vendors, ...suppliers];
  const activeSuppliers = allSuppliers.filter(s => s.status !== "inactive").length;
  const totalSpend = expenses.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Handshake size={18} className="text-primary" /></div>
              SRM Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Supplier Relationship Management — vendors, contracts, and spend analysis</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/vendors"><Button size="sm" className="gap-1.5"><Plus size={13} /> Add Vendor</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Truck,       label: "Total Vendors",    val: vendors.length,         color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Package,     label: "Suppliers",        val: suppliers.length,       color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: ShieldCheck, label: "Active Partners",  val: activeSuppliers,        color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: IndianRupee, label: "Total Spend",      val: fmt(totalSpend),        color: "bg-amber-50 border-amber-200 text-amber-700", isStr: true },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Vendor Table */}
        <div className="rounded-2xl border bg-card">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Vendors & Suppliers</h2>
            <Link href="/admin/vendors"><Button variant="ghost" size="sm">Manage →</Button></Link>
          </div>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading…</div>
          ) : allSuppliers.length === 0 ? (
            <div className="py-16 text-center">
              <Truck size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground mb-3">No vendors or suppliers yet.</p>
              <Link href="/admin/vendors"><Button size="sm">Add First Vendor</Button></Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  {["Name","Type","Contact","Service","Rating","Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {allSuppliers.slice(0, 20).map((s, i) => (
                    <tr key={s.id || i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.name || s.vendorName || s.supplierName || "—"}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{s.type || s.category || "General"}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground flex items-center gap-1.5"><Phone size={12} />{s.phone || s.contact || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.service || s.serviceType || "—"}</td>
                      <td className="px-4 py-3">
                        {s.rating ? (
                          <span className="flex items-center gap-1 text-amber-600"><Star size={12} fill="currentColor" />{s.rating}/5</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.status === "inactive" ? "destructive" : "default"} className="text-xs">
                          {s.status || "active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Spend Breakdown */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Expense Summary</h2>
            <Link href="/admin/expenses"><Button variant="ghost" size="sm">View Expenses →</Button></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {(() => {
              const cats: Record<string, number> = {};
              for (const e of expenses) {
                const cat = e.category || e.type || "Uncategorised";
                cats[cat] = (cats[cat] || 0) + (parseFloat(e.amount) || 0);
              }
              return Object.entries(cats).slice(0, 6).map(([cat, amt]) => (
                <div key={cat} className="p-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-lg font-bold font-mono">{fmt(amt)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cat}</p>
                </div>
              ));
            })()}
            {expenses.length === 0 && (
              <div className="col-span-3 py-6 text-center text-muted-foreground">No expense data yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/vendors"><Button variant="outline" size="sm" className="gap-1.5"><Truck size={13} /> Vendors</Button></Link>
            <Link href="/admin/suppliers"><Button variant="outline" size="sm" className="gap-1.5"><Package size={13} /> Suppliers</Button></Link>
            <Link href="/admin/expenses"><Button variant="outline" size="sm" className="gap-1.5"><IndianRupee size={13} /> Expenses</Button></Link>
            <Link href="/admin/procurement"><Button variant="outline" size="sm" className="gap-1.5"><Handshake size={13} /> Procurement</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
