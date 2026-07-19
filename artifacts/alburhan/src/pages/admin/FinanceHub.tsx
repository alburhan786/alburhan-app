import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { RefreshCw, IndianRupee, TrendingUp, TrendingDown, CreditCard, FileText, Receipt, BarChart2, Users, Wallet, ArrowRight, Activity } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const SUB_MODULES = [
  { label: "Accounting & Ledger", desc: "General ledger, cash book, balance sheet, P&L", href: "/admin/accounting", icon: <BarChart2 size={18} />, color: "bg-blue-50 text-blue-700 border-blue-200" },
  { label: "Expense Manager", desc: "Record and track business expenses", href: "/admin/expenses", icon: <TrendingDown size={18} />, color: "bg-red-50 text-red-700 border-red-200" },
  { label: "Invoice Manager", desc: "Generate, send and track invoices", href: "/admin/invoices", icon: <FileText size={18} />, color: "bg-violet-50 text-violet-700 border-violet-200" },
  { label: "GST Reports", desc: "GSTR-1, GSTR-3B and GST summary", href: "/admin/gst", icon: <Receipt size={18} />, color: "bg-amber-50 text-amber-700 border-amber-200" },
  { label: "Payroll & Salary", desc: "Staff salary, advances and payslips", href: "/admin/payroll", icon: <Users size={18} />, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { label: "Payment Analytics", desc: "Payment trends and collection reports", href: "/admin/payment-analytics", icon: <Activity size={18} />, color: "bg-teal-50 text-teal-700 border-teal-200" },
  { label: "Offline Payments", desc: "Bank transfer and cash payment records", href: "/admin/offline-payments", icon: <CreditCard size={18} />, color: "bg-orange-50 text-orange-700 border-orange-200" },
  { label: "Vendor Payments", desc: "Hotel, airline and supplier payments", href: "/admin/vendors", icon: <Wallet size={18} />, color: "bg-slate-50 text-slate-700 border-slate-200" },
];

function KPI({ label, value, sub, icon: Icon, color, bg, border }: any) {
  return (
    <div className={`rounded-2xl border p-4 ${bg} ${border || ""}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-white/60 ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function FinanceHub() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/finance-hub`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
  const d = data || {};

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <IndianRupee size={18} className="text-emerald-700" />
              </div>
              Finance & Accounting Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Unified view of all financial modules and KPIs</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* KPI Strip */}
        {loading && !data ? (
          <div className="py-16 text-center text-muted-foreground">
            <IndianRupee size={32} className="mx-auto mb-2 animate-pulse text-emerald-400" />
            <p>Loading financial overview…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPI label="Total Collected" value={fmt(d.totalCollected)} sub="All time payments" icon={IndianRupee} color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
              <KPI label="This Month" value={fmt(d.monthRevenue)} sub={`${d.monthPayments || 0} transactions`} icon={TrendingUp} color="text-blue-700" bg="bg-blue-50" border="border-blue-200" />
              <KPI label="Outstanding" value={fmt(d.outstanding)} sub={`${d.outstandingCount || 0} bookings`} icon={CreditCard} color="text-amber-700" bg="bg-amber-50" border="border-amber-200" />
              <KPI label="Total Expenses" value={fmt(d.totalExpenses)} sub="All recorded expenses" icon={TrendingDown} color="text-red-700" bg="bg-red-50" border="border-red-200" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPI label="Net Profit (Est.)" value={fmt(d.netProfit)} sub="Revenue − Expenses" icon={TrendingUp} color="text-violet-700" bg="bg-violet-50" border="border-violet-200" />
              <KPI label="Today's Collection" value={fmt(d.todayRevenue)} sub={`${d.todayPayments || 0} payments`} icon={Activity} color="text-teal-700" bg="bg-teal-50" border="border-teal-200" />
              <KPI label="Pending Invoices" value={d.pendingInvoices || 0} sub="Awaiting payment" icon={FileText} color="text-orange-700" bg="bg-orange-50" border="border-orange-200" />
              <KPI label="Payroll (Month)" value={fmt(d.monthPayroll)} sub={`${d.staffCount || 0} staff`} icon={Users} color="text-slate-700" bg="bg-slate-50" border="border-slate-200" />
            </div>

            {/* Monthly trend */}
            {d.monthly && d.monthly.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Last 6 Months — Revenue vs Expenses</h2>
                <div className="rounded-2xl border overflow-hidden">
                  <div className="grid grid-cols-4 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Month</span><span className="text-right">Revenue</span><span className="text-right">Expenses</span><span className="text-right">Net</span>
                  </div>
                  <div className="divide-y">
                    {d.monthly.map((row: any, i: number) => {
                      const net = (row.revenue || 0) - (row.expenses || 0);
                      return (
                        <div key={i} className="grid grid-cols-4 px-4 py-2.5 text-sm hover:bg-muted/10 transition-colors">
                          <span className="font-medium">{row.month}</span>
                          <span className="text-right font-mono text-emerald-700">{fmt(row.revenue)}</span>
                          <span className="text-right font-mono text-red-600">{fmt(row.expenses)}</span>
                          <span className={`text-right font-bold font-mono ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{net >= 0 ? "+" : ""}{fmt(net)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Outstanding breakdown */}
            {d.outstandingByPackage && d.outstandingByPackage.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Outstanding by Package</h2>
                <div className="rounded-2xl border overflow-hidden">
                  <div className="divide-y">
                    {d.outstandingByPackage.slice(0, 6).map((row: any, i: number) => (
                      <div key={i} className="flex items-center px-4 py-2.5 gap-3">
                        <span className="flex-1 text-sm font-medium truncate">{row.package || "Unknown Package"}</span>
                        <span className="text-xs text-muted-foreground">{row.count} bookings</span>
                        <span className="font-bold text-sm text-amber-700 font-mono">{fmt(row.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sub-module grid */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Finance Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUB_MODULES.map(m => (
              <a key={m.href} href={m.href}
                className={`flex items-center gap-3 rounded-2xl border p-4 hover:opacity-90 transition-all group ${m.color}`}>
                <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center flex-shrink-0">
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{m.label}</p>
                  <p className="text-xs opacity-70 mt-0.5 truncate">{m.desc}</p>
                </div>
                <ArrowRight size={16} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
