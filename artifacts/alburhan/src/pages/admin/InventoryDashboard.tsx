import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, RefreshCw, AlertTriangle, CheckCircle, IndianRupee, Tag, Plus, Archive } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function InventoryDashboard() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/assets`, { credentials: "include" });
      if (r.ok) setAssets(await r.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const inStock     = assets.filter(a => a.status !== "out_of_stock" && a.status !== "disposed").length;
  const lowStock    = assets.filter(a => a.status === "low_stock" || (a.quantity !== undefined && a.quantity < 5)).length;
  const totalValue  = assets.reduce((a, b) => a + (parseFloat(b.value || b.purchasePrice || b.cost || 0)), 0);

  const categoryMap: Record<string, number> = {};
  for (const a of assets) {
    const cat = a.category || a.type || "General";
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Package size={18} className="text-primary" /></div>
              Inventory Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Hajj equipment, supplies, and asset inventory tracking</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/assets"><Button size="sm" className="gap-1.5"><Plus size={13} /> Add Item</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Package,     label: "Total Items",   val: assets.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle, label: "In Stock",      val: inStock,       color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: AlertTriangle,label:"Low / Alert",   val: lowStock,      color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: IndianRupee, label: "Total Value",   val: fmt(totalValue),color: "bg-violet-50 border-violet-200 text-violet-700", isStr: true },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Category Breakdown */}
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold mb-4">By Category</h2>
            {Object.keys(categoryMap).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No inventory items yet.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(categoryMap).map(([cat, count]) => {
                  const pct = assets.length > 0 ? Math.round((count / assets.length) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{cat}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
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

          {/* Asset Table */}
          <div className="rounded-2xl border bg-card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Recent Items</h2>
              <Link href="/admin/assets"><Button variant="ghost" size="sm">Manage →</Button></Link>
            </div>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : assets.length === 0 ? (
              <div className="py-10 text-center">
                <Package size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No inventory items.</p>
                <Link href="/admin/assets"><Button size="sm" className="mt-3">Add First Item</Button></Link>
              </div>
            ) : (
              <div className="divide-y">
                {assets.slice(0, 8).map((a, i) => (
                  <div key={a.id || i} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">{a.name || a.assetName || a.itemName || "—"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Tag size={10} />{a.category || a.type || "—"}
                        {a.quantity !== undefined && ` · Qty: ${a.quantity}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-medium">{fmt(parseFloat(a.value || a.purchasePrice || a.cost || 0))}</p>
                      <Badge variant={a.status === "out_of_stock" || a.status === "disposed" ? "destructive" : a.status === "low_stock" ? "outline" : "default"} className="text-xs">
                        {a.status || "in stock"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/assets"><Button variant="outline" size="sm" className="gap-1.5"><Package size={13} /> Asset Manager</Button></Link>
            <Link href="/admin/procurement"><Button variant="outline" size="sm" className="gap-1.5"><Archive size={13} /> Procurement</Button></Link>
            <Link href="/admin/vendors"><Button variant="outline" size="sm" className="gap-1.5"><Package size={13} /> Vendors</Button></Link>
            <Link href="/admin/expenses"><Button variant="outline" size="sm" className="gap-1.5"><IndianRupee size={13} /> Expenses</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
