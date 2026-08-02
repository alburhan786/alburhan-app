import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, IndianRupee, TrendingUp, TrendingDown, CreditCard,
  FileText, Receipt, BarChart2, Users, Wallet, ArrowRight,
  Activity, AlertTriangle, Clock, CheckCircle2, Download,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

// ─── Sub-module cards ──────────────────────────────────────────────────────────
const SUB_MODULES = [
  { label: "Accounting & Ledger",   desc: "General ledger, cash book, balance sheet, P&L", href: "/admin/accounting",        icon: <BarChart2 size={18} />,    color: "bg-blue-50 text-blue-700 border-blue-200" },
  { label: "Expense Manager",       desc: "Record and track business expenses",              href: "/admin/expenses",           icon: <TrendingDown size={18} />, color: "bg-red-50 text-red-700 border-red-200" },
  { label: "Invoice Manager",       desc: "Generate, send and track invoices",               href: "/admin/invoices",           icon: <FileText size={18} />,     color: "bg-violet-50 text-violet-700 border-violet-200" },
  { label: "GST Reports",           desc: "GSTR-1, GSTR-3B and GST summary",                 href: "/admin/gst",                icon: <Receipt size={18} />,      color: "bg-amber-50 text-amber-700 border-amber-200" },
  { label: "Payroll & Salary",      desc: "Staff salary, advances and payslips",             href: "/admin/payroll",            icon: <Users size={18} />,        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { label: "Payment Analytics",     desc: "Payment trends and collection reports",           href: "/admin/payment-analytics",  icon: <Activity size={18} />,     color: "bg-teal-50 text-teal-700 border-teal-200" },
  { label: "Offline Payments",      desc: "Bank transfer and cash payment records",          href: "/admin/offline-payments",   icon: <CreditCard size={18} />,   color: "bg-orange-50 text-orange-700 border-orange-200" },
  { label: "Vendor Payments",       desc: "Hotel, airline and supplier payments",            href: "/admin/vendors",            icon: <Wallet size={18} />,       color: "bg-slate-50 text-slate-700 border-slate-200" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtSm(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`;
  return fmt(n);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, color, bg, border, trend }: {
  label: string; value: string; sub?: string;
  icon: any; color: string; bg: string; border?: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className={`rounded-2xl border p-4 ${bg} ${border ?? ""}`}>
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

// ─── Date range options ────────────────────────────────────────────────────────
const RANGES = [
  { key: "today", label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
] as const;
type Range = typeof RANGES[number]["key"];

// ─── Main component ────────────────────────────────────────────────────────────
export default function FinanceHub() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState<Range>("month");
  const [fromDate, setFrom]   = useState("");
  const [toDate, setTo]       = useState("");
  const [err, setErr]         = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      let url = `${BASE_API}/api/finance/dashboard?range=${range}`;
      if (range === "custom" && fromDate && toDate) url += `&from=${fromDate}&to=${toDate}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }, [range, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const d = data ?? {};
  const periodLabel = range === "today" ? "Today" : range === "week" ? "This Week" : range === "month" ? "This Month" : `${fromDate} – ${toDate}`;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <IndianRupee size={18} className="text-emerald-700" />
              </div>
              Finance & Accounts Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Phase 1 — Financial source of truth</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Range selector */}
            <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors
                    ${range === r.key ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="flex items-center gap-1">
                <input type="date" value={fromDate} onChange={e => setFrom(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 bg-white" />
                <span className="text-xs text-muted-foreground">–</span>
                <input type="date" value={toDate} onChange={e => setTo(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 bg-white" />
              </div>
            )}
            <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertTriangle size={15} /> {err}
          </div>
        )}

        {/* Phase 1 KPI Cards — 9 cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <KPI label="Total Invoiced"         value={fmtSm(d.total_invoiced ?? 0)}    sub="All active invoices"          icon={FileText}      color="text-blue-700"    bg="bg-blue-50"    border="border-blue-200" />
          <KPI label="Total Collected"        value={fmtSm(d.total_collected ?? 0)}   sub="From payment records"         icon={IndianRupee}   color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
          <KPI label="Total Outstanding"      value={fmtSm(d.total_outstanding ?? 0)} sub="Across all bookings"          icon={TrendingDown}  color="text-orange-700"  bg="bg-orange-50"  border="border-orange-200" />
          <KPI label="Total Refunded"         value={fmtSm(d.total_refunded ?? 0)}    sub="Approved refunds"             icon={Receipt}       color="text-rose-700"    bg="bg-rose-50"    border="border-rose-200" />
          <KPI label="Today's Collection"     value={fmt(d.today_collection ?? 0)}    sub="Payments today"               icon={CheckCircle2}  color="text-teal-700"    bg="bg-teal-50"    border="border-teal-200" />
          <KPI label={`${periodLabel} Collected`} value={fmt(d.period_collection ?? 0)} sub={periodLabel}               icon={TrendingUp}    color="text-green-700"   bg="bg-green-50"   border="border-green-200" />
          <KPI label="Unpaid Bookings"        value={String(d.unpaid_count ?? 0)}     sub="No payment received"          icon={Clock}         color="text-slate-700"   bg="bg-slate-50"   border="border-slate-200" />
          <KPI label="Partially Paid"         value={String(d.partial_count ?? 0)}    sub="Balance outstanding"          icon={CreditCard}    color="text-amber-700"   bg="bg-amber-50"   border="border-amber-200" />
          <KPI label="Overdue Balances"       value={String(d.overdue_balances?.length ?? 0)} sub="Past due date"        icon={AlertTriangle} color="text-red-700"     bg="bg-red-50"     border="border-red-200" />
        </div>

        {/* Overdue list */}
        {(d.overdue_balances?.length ?? 0) > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <AlertTriangle size={14} /> Overdue Balances ({d.overdue_balances.length})
              </h3>
            </div>
            <div className="divide-y divide-red-100">
              {d.overdue_balances.slice(0, 8).map((r: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-red-900">{r.customer_name}</span>
                    <span className="ml-2 text-xs text-red-600">{r.invoice_number}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-red-700 font-semibold">{fmt(Number(r.balance))}</span>
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{r.days_overdue}d overdue</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-modules */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Finance Modules</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {SUB_MODULES.map(m => (
              <a key={m.href} href={m.href}
                className={`rounded-2xl border p-4 flex flex-col gap-2 hover:shadow-md transition-all group ${m.color}`}>
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center">
                    {m.icon}
                  </div>
                  <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{m.label}</p>
                  <p className="text-xs opacity-70 mt-0.5 leading-snug">{m.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Quick links to finance tables */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Invoice List",       href: "/admin/invoices",          icon: <FileText size={14} /> },
            { label: "Payment Register",   href: "/admin/offline-payments",  icon: <CreditCard size={14} /> },
            { label: "Customer Outstanding", href: "/admin/customer-ledger", icon: <TrendingDown size={14} /> },
            { label: "Receipts",           href: "/admin/receipts",          icon: <Receipt size={14} /> },
          ].map(q => (
            <a key={q.href} href={q.href}
              className="rounded-xl border bg-white hover:bg-muted/40 px-4 py-3 flex items-center gap-2.5 text-sm font-medium transition-colors group">
              <span className="text-muted-foreground group-hover:text-foreground">{q.icon}</span>
              {q.label}
              <ArrowRight size={12} className="ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
