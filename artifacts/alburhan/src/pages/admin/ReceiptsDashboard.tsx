import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, RefreshCw, IndianRupee, CheckCircle2, Clock, TrendingUp, Download, CreditCard } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function ReceiptsDashboard() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const p = await fetch(`${API}/api/payments?limit=100`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setPayments(Array.isArray(p) ? p : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const today = new Date().toDateString();
  const todayPayments = payments.filter(p => new Date(p.created_at || p.payment_date || 0).toDateString() === today);
  const totalCollected = payments.reduce((a, p) => a + (parseFloat(p.amount || p.paid_amount || 0)), 0);
  const todayAmount = todayPayments.reduce((a, p) => a + (parseFloat(p.amount || p.paid_amount || 0)), 0);

  const MODE_COLORS: Record<string, string> = {
    online: "bg-blue-100 text-blue-700",
    cash: "bg-emerald-100 text-emerald-700",
    bank_transfer: "bg-violet-100 text-violet-700",
    upi: "bg-amber-100 text-amber-700",
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt size={18} className="text-primary" /></div>
              Receipts Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Payment receipts — collections, modes, and transaction history</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/payment-analytics"><Button size="sm" className="gap-1.5"><TrendingUp size={13} /> Analytics</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Receipt,     label: "Total Receipts",   val: payments.length,          color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: IndianRupee, label: "Total Collected",  val: fmt(totalCollected), isStr:true, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Clock,       label: "Today Receipts",   val: todayPayments.length,     color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: TrendingUp,  label: "Today Amount",     val: fmt(todayAmount), isStr:true, color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Recent Receipts</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No payment receipts yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left font-medium">Receipt #</th>
                    <th className="pb-2 text-left font-medium">Customer</th>
                    <th className="pb-2 text-left font-medium">Amount</th>
                    <th className="pb-2 text-left font-medium">Mode</th>
                    <th className="pb-2 text-left font-medium">Date</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 10).map((p, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium text-primary">{p.receipt_number || p.payment_id || p.razorpay_payment_id?.slice(-8) || `RCP-${i+1}`}</td>
                      <td className="py-2">{p.customer_name || p.name || "—"}</td>
                      <td className="py-2 font-medium">{fmt(parseFloat(p.amount || p.paid_amount || 0))}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={`text-xs ${MODE_COLORS[p.payment_mode || p.mode || "online"] || "bg-gray-100 text-gray-600"}`}>
                          {p.payment_mode || p.mode || "online"}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                      <td className="py-2"><Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700"><CheckCircle2 size={9} className="mr-1" />Received</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Payment Analytics", href: "/admin/payment-analytics", icon: TrendingUp },
            { label: "Invoices", href: "/admin/invoices", icon: Receipt },
            { label: "Offline Payments", href: "/admin/offline-payments", icon: CreditCard },
            { label: "Finance Hub", href: "/admin/finance", icon: IndianRupee },
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
