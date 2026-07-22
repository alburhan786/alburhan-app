import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, RefreshCw, Clock, CheckCircle, IndianRupee, Truck, Plus, AlertCircle, FileText, Box } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function ProcurementHub() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/expenses`, { credentials: "include" });
      const data = res.ok ? await res.json() : [];
      setExpenses(Array.isArray(data) ? data : []);
    } catch {
      setExpenses([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pending  = expenses.filter(e => e.status === "pending").length;
  const approved = expenses.filter(e => e.status === "approved").length;
  const totalSpend = expenses.reduce((a, b) => a + parseFloat(b.amount || 0), 0);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart size={18} className="text-primary" />
              </div>
              Procurement Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Purchase orders, vendor spend, and procurement approvals
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/expenses">
              <Button size="sm" className="gap-1.5"><Plus size={13} /> New Purchase</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: ShoppingCart, label: "Total Orders",  val: expenses.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Clock,        label: "Pending",       val: pending,          color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: CheckCircle,  label: "Approved",      val: approved,         color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: IndianRupee,  label: "Total Spend",   val: fmt(totalSpend),  color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Purchases</h2>
            <Link href="/admin/expenses">
              <Button variant="ghost" size="sm">View All →</Button>
            </Link>
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : expenses.length === 0 ? (
            <div className="py-8 text-center">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">No purchases recorded yet.</p>
              <Link href="/admin/expenses">
                <Button size="sm" className="mt-3">Add First Purchase</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {expenses.slice(0, 6).map((e, i) => (
                <div key={e.id ?? i} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{e.description || e.title || e.category || "Purchase"}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.vendor || "—"} · {e.date ? new Date(e.date).toLocaleDateString("en-IN") : "—"}
                    </p>
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

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/expenses">
              <Button variant="outline" size="sm" className="gap-1.5"><FileText size={13} /> Expenses</Button>
            </Link>
            <Link href="/admin/vendors">
              <Button variant="outline" size="sm" className="gap-1.5"><Truck size={13} /> Vendors</Button>
            </Link>
            <Link href="/admin/srm">
              <Button variant="outline" size="sm" className="gap-1.5"><AlertCircle size={13} /> SRM</Button>
            </Link>
            <Link href="/admin/inventory">
              <Button variant="outline" size="sm" className="gap-1.5"><Box size={13} /> Inventory</Button>
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
