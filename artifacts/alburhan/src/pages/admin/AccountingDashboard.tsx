import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Wallet, AlertCircle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

const CAT_COLORS: Record<string, string> = {
  flights: "#3b82f6", hotels: "#8b5cf6", visa: "#f59e0b",
  transport: "#f97316", food: "#22c55e", laundry: "#0ea5e9",
  zamzam: "#14b8a6", salary: "#6366f1", marketing: "#ec4899",
  office: "#6b7280", misc: "#ef4444",
};

const CAT_LABELS: Record<string, string> = {
  flights: "Flights", hotels: "Hotels", visa: "Visa", transport: "Transport",
  food: "Food", laundry: "Laundry", zamzam: "Zam Zam", salary: "Staff Salary",
  marketing: "Marketing", office: "Office", misc: "Miscellaneous",
};

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

interface Summary {
  totalCollected: number;
  thisMonthCollected: number;
  totalOutstanding: number;
  totalBookings: number;
  totalExpenses: number;
  thisMonthExpenses: number;
  netProfit: number;
  byCategory: Array<{ category: string; total: number }>;
  monthly: Array<{ month: string; collected: number }>;
  monthlyExpenses: Array<{ month: string; expenses: number }>;
}

export default function AccountingDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/expenses/accounting-summary`, { credentials: "include" });
      if (r.ok) {
        const json = await r.json();
        setData({
          totalCollected: Number(json.totalCollected ?? 0),
          thisMonthCollected: Number(json.thisMonthCollected ?? 0),
          totalOutstanding: Number(json.totalOutstanding ?? 0),
          totalBookings: Number(json.totalBookings ?? 0),
          totalExpenses: Number(json.totalExpenses ?? 0),
          thisMonthExpenses: Number(json.thisMonthExpenses ?? 0),
          netProfit: Number(json.netProfit ?? 0),
          byCategory: Array.isArray(json.byCategory) ? json.byCategory : [],
          monthly: Array.isArray(json.monthly) ? json.monthly : [],
          monthlyExpenses: Array.isArray(json.monthlyExpenses) ? json.monthlyExpenses : [],
        });
      } else {
        // Non-200 response: show ₹0 dashboard instead of blank error
        console.error("[AccountingDashboard] API error:", r.status, await r.text().catch(() => ""));
        setData({ totalCollected: 0, thisMonthCollected: 0, totalOutstanding: 0, totalBookings: 0, totalExpenses: 0, thisMonthExpenses: 0, netProfit: 0, byCategory: [], monthly: [], monthlyExpenses: [] });
      }
    } catch (err) {
      console.error("[AccountingDashboard] Fetch failed:", err);
      setData({ totalCollected: 0, thisMonthCollected: 0, totalOutstanding: 0, totalBookings: 0, totalExpenses: 0, thisMonthExpenses: 0, netProfit: 0, byCategory: [], monthly: [], monthlyExpenses: [] });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function exportExcel() {
    if (!data) return;
    const summary = [
      ["Metric", "Value"],
      ["Total Revenue Collected", data.totalCollected],
      ["This Month Collected", data.thisMonthCollected],
      ["Total Outstanding", data.totalOutstanding],
      ["Total Expenses", data.totalExpenses],
      ["This Month Expenses", data.thisMonthExpenses],
      ["Net Profit / Loss", data.netProfit],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    const byCat = [["Category", "Total (₹)"], ...(data.byCategory || []).map(c => [CAT_LABELS[c.category] || c.category, c.total])];
    const ws2 = XLSX.utils.aoa_to_sheet(byCat);
    const monthly = [["Month", "Collected (₹)", "Expenses (₹)"]];
    const allMonths = [...new Set([...data.monthly.map(m => m.month), ...data.monthlyExpenses.map(m => m.month)])].sort();
    for (const m of allMonths) {
      const col = data.monthly.find(x => x.month === m)?.collected ?? 0;
      const exp = data.monthlyExpenses.find(x => x.month === m)?.expenses ?? 0;
      monthly.push([m, col as any, exp as any]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(monthly);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "By Category");
    XLSX.utils.book_append_sheet(wb, ws3, "Monthly");
    XLSX.writeFile(wb, `accounting-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const maxMonthly = data ? Math.max(...data.monthly.map(m => Number(m.collected) || 0), ...data.monthlyExpenses.map(m => Number(m.expenses) || 0), 1) : 1;
  const allMonths = data ? [...new Set([...data.monthly.map(m => m.month), ...data.monthlyExpenses.map(m => m.month)])].sort().slice(-12) : [];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Accounting Dashboard</h1>
            <p className="text-sm text-muted-foreground">P&L, collections, expenses overview</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={!data}><Download size={14} className="mr-1.5" />Export Excel</Button>
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center text-muted-foreground">Loading accounting data…</div>
        ) : !data ? (
          <div className="py-24 text-center text-muted-foreground">Failed to load data</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={16} className="text-green-600" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Total Revenue</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{fmt(data.totalCollected)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">This month: {fmt(data.thisMonthCollected)}</p>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingDown size={16} className="text-red-600" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Total Expenses</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{fmt(data.totalExpenses)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">This month: {fmt(data.thisMonthExpenses)}</p>
              </div>

              <div className={`bg-white rounded-xl border p-5 ${data.netProfit >= 0 ? "border-green-200" : "border-red-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${data.netProfit >= 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                    <Wallet size={16} className={data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Net Profit / Loss</span>
                </div>
                <p className={`text-2xl font-bold ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {data.netProfit >= 0 ? "" : "-"}{fmt(data.netProfit)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">{data.netProfit >= 0 ? "Profitable" : "Loss making"}</p>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <AlertCircle size={16} className="text-amber-600" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Outstanding</span>
                </div>
                <p className="text-2xl font-bold text-amber-600">{fmt(data.totalOutstanding)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{data.totalBookings} bookings tracked</p>
              </div>
            </div>

            {/* Monthly bar chart */}
            {allMonths.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <p className="text-sm font-semibold text-gray-700 mb-4">Monthly Revenue vs Expenses (last 12 months)</p>
                <div className="flex items-end gap-2 h-40 overflow-x-auto">
                  {allMonths.map(m => {
                    const col = Number(data.monthly.find(x => x.month === m)?.collected ?? 0);
                    const exp = Number(data.monthlyExpenses.find(x => x.month === m)?.expenses ?? 0);
                    return (
                      <div key={m} className="flex flex-col items-center gap-1 min-w-[48px]">
                        <div className="flex items-end gap-0.5 h-28">
                          <div
                            title={`Revenue: ₹${col.toLocaleString("en-IN")}`}
                            className="w-5 bg-green-400 rounded-t hover:bg-green-500 transition-all cursor-pointer"
                            style={{ height: `${(col / maxMonthly) * 100}%`, minHeight: col > 0 ? "4px" : "0" }}
                          />
                          <div
                            title={`Expenses: ₹${exp.toLocaleString("en-IN")}`}
                            className="w-5 bg-red-400 rounded-t hover:bg-red-500 transition-all cursor-pointer"
                            style={{ height: `${(exp / maxMonthly) * 100}%`, minHeight: exp > 0 ? "4px" : "0" }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground text-center leading-tight">{m.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block" /> Revenue</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" /> Expenses</span>
                </div>
              </div>
            )}

            {/* Expense by category */}
            {data.byCategory && data.byCategory.length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <p className="text-sm font-semibold text-gray-700 mb-4">Expenses by Category</p>
                <div className="space-y-2.5">
                  {data.byCategory.map(c => {
                    const total = data.totalExpenses || 1;
                    const pct = Math.round((Number(c.total) / total) * 100);
                    return (
                      <div key={c.category}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{CAT_LABELS[c.category] || c.category}</span>
                          <span className="text-muted-foreground">{fmt(Number(c.total))} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: CAT_COLORS[c.category] || "#6b7280" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
