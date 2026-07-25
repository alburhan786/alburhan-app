import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) { return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 }); }

const REPORTS = [
  { id: "daily-sales",      label: "Daily Sales",      icon: "📅", desc: "Day-by-day revenue breakdown" },
  { id: "monthly-trend",    label: "Monthly Trend",    icon: "📈", desc: "Revenue vs expenses over months" },
  { id: "branch-summary",   label: "Branch Reports",   icon: "🏢", desc: "Revenue & bookings by branch" },
  { id: "agent-summary",    label: "Agent Reports",    icon: "👤", desc: "Agent performance & commissions" },
  { id: "package-sales",    label: "Package Sales",    icon: "✈️",  desc: "Revenue by travel package" },
  { id: "outstanding",      label: "Outstanding",      icon: "💰", desc: "Receivables & payables" },
  { id: "profit-loss",      label: "Profit & Loss",    icon: "📊", desc: "P&L for any date range" },
  { id: "expense-analysis", label: "Expense Analysis", icon: "💸", desc: "Expenses by category" },
  { id: "cancellation",     label: "Cancellations",    icon: "❌", desc: "Cancelled bookings & impact" },
];

export default function AdvancedReportsCenter() {
  const [activeReport, setActiveReport] = useState("daily-sales");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]);
  const [to, setTo]     = useState(new Date().toISOString().split("T")[0]);
  const [outType, setOutType] = useState("receivable");
  const [months, setMonths]   = useState(12);

  async function loadReport() {
    setLoading(true);
    setData(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (activeReport === "monthly-trend") params.set("months", String(months));
      if (activeReport === "outstanding")   params.set("type", outType);
      const r = await fetch(`${API}/api/finance-reports/${activeReport}?${params}`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { loadReport(); }, [activeReport]);

  function exportCSV() {
    if (!data) return;
    const rows: any[] = data.rows || data.items || (Array.isArray(data) ? data : []);
    if (!rows.length) return;
    const headers = Object.keys(rows[0]).join(",");
    const body = rows.map((r: any) => Object.values(r).map((v: any) => `"${v ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeReport}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const current = REPORTS.find(r => r.id === activeReport);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r flex-shrink-0 h-screen overflow-y-auto sticky top-0">
        <div className="p-4 border-b">
          <h2 className="font-bold text-gray-900 text-lg">Reports Center</h2>
          <p className="text-xs text-gray-500 mt-1">Advanced financial reports</p>
        </div>
        <nav className="p-2 space-y-1">
          {REPORTS.map(r => (
            <button key={r.id} onClick={() => setActiveReport(r.id)}
              className={`w-full text-left px-3 py-3 rounded-lg transition-all ${activeReport === r.id ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "hover:bg-gray-50 text-gray-700"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.icon}</span>
                <div>
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="bg-white border-b px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{current?.icon} {current?.label}</h1>
              <p className="text-sm text-gray-500">{current?.desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {activeReport !== "monthly-trend" && <>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              </>}
              {activeReport === "monthly-trend" && (
                <select value={months} onChange={e => setMonths(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
                  {[3, 6, 12, 24].map(m => <option key={m} value={m}>Last {m} months</option>)}
                </select>
              )}
              {activeReport === "outstanding" && (
                <select value={outType} onChange={e => setOutType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
                  <option value="receivable">Receivable</option>
                  <option value="payable">Payable</option>
                </select>
              )}
              <button onClick={loadReport} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">🔄 Refresh</button>
              <button onClick={exportCSV} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">📥 CSV</button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400 animate-pulse text-lg">Loading report...</div>
            </div>
          )}

          {/* Daily Sales */}
          {!loading && activeReport === "daily-sales" && data && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border p-4 shadow-sm"><div className="text-xs text-gray-500 uppercase mb-1">Total Collected</div><div className="text-2xl font-bold text-green-600">{fmt(data.summary?.total_collected)}</div></div>
                <div className="bg-white rounded-xl border p-4 shadow-sm"><div className="text-xs text-gray-500 uppercase mb-1">Total Bookings</div><div className="text-2xl font-bold text-blue-600">{data.summary?.total_bookings}</div></div>
                <div className="bg-white rounded-xl border p-4 shadow-sm"><div className="text-xs text-gray-500 uppercase mb-1">Avg Daily Revenue</div><div className="text-2xl font-bold text-purple-600">{fmt(data.summary?.avg_daily)}</div></div>
              </div>
              <ReportTable headers={["Date", "Bookings", "Customers", "Transactions", "Revenue"]} rows={(data.rows || []).map((r: any) => [r.date, r.bookings, r.customers, r.transactions, <span className="text-green-600 font-semibold">{fmt(r.collected)}</span>])} />
            </>
          )}

          {/* Monthly Trend */}
          {!loading && activeReport === "monthly-trend" && data && (
            <ReportTable
              headers={["Month", "Revenue", "Expenses", "Net Profit", "Bookings"]}
              rows={([...data].reverse()).map((r: any) => [
                r.month,
                <span className="text-green-600 font-semibold">{fmt(r.revenue)}</span>,
                <span className="text-red-600">{fmt(r.expenses)}</span>,
                <span className={`font-bold ${Number(r.profit) >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(r.profit)}</span>,
                r.bookings,
              ])}
            />
          )}

          {/* Branch Summary */}
          {!loading && activeReport === "branch-summary" && data && (
            <ReportTable
              headers={["Branch", "City", "Agents", "Bookings", "Customers", "Billed", "Collected", "Outstanding"]}
              rows={(data.rows || []).map((r: any) => [
                <span className="font-semibold">{r.branch_name}</span>,
                r.city || "—", r.agents_count, r.total_bookings, r.customers,
                fmt(r.total_billed),
                <span className="text-green-600 font-semibold">{fmt(r.total_collected)}</span>,
                <span className="text-red-600">{fmt(r.outstanding)}</span>,
              ])}
            />
          )}

          {/* Agent Summary */}
          {!loading && activeReport === "agent-summary" && data && (
            <ReportTable
              headers={["Agent", "Branch", "Rate", "Bookings", "Billed", "Collected", "Comm. Paid", "Comm. Pending"]}
              rows={(data.rows || []).map((r: any) => [
                <span className="font-semibold">{r.name}</span>,
                r.branch_name || "—", `${r.commission_rate}%`, r.total_bookings,
                fmt(r.total_billed),
                <span className="text-green-600 font-semibold">{fmt(r.total_collected)}</span>,
                <span className="text-green-700">{fmt(r.commissions_paid)}</span>,
                <span className="text-yellow-700">{fmt(r.commissions_pending)}</span>,
              ])}
            />
          )}

          {/* Package Sales */}
          {!loading && activeReport === "package-sales" && data && (
            <ReportTable
              headers={["Package", "Bookings", "Pilgrims", "Billed", "Collected", "Outstanding", "Avg Value"]}
              rows={(data.rows || []).map((r: any) => [
                <span className="font-semibold">{r.package_name || "—"}</span>,
                r.bookings, r.pilgrims, fmt(r.total_billed),
                <span className="text-green-600 font-semibold">{fmt(r.total_collected)}</span>,
                <span className="text-red-600">{fmt(r.outstanding)}</span>,
                fmt(r.avg_booking_value),
              ])}
            />
          )}

          {/* Outstanding */}
          {!loading && activeReport === "outstanding" && data && (
            <>
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                Total {data.type === "receivable" ? "Receivable" : "Payable"} Outstanding: <strong className="text-lg">{fmt(data.total)}</strong>
              </div>
              {data.type === "receivable" ? (
                <ReportTable
                  headers={["Booking #", "Customer", "Mobile", "Package", "Total", "Paid", "Outstanding", "Agent", "Branch"]}
                  rows={(data.rows || []).map((r: any) => [
                    <span className="font-mono text-indigo-600">{r.booking_number}</span>,
                    <span className="font-medium">{r.customer_name}</span>,
                    r.customer_mobile, r.package_name || "—", fmt(r.total),
                    <span className="text-green-600">{fmt(r.paid)}</span>,
                    <span className="font-bold text-red-600">{fmt(r.outstanding)}</span>,
                    r.agent_name || "—", r.branch_name || "—",
                  ])}
                />
              ) : (
                <ReportTable
                  headers={["Bill #", "Vendor", "Total", "Paid", "Outstanding", "Due Date", "Status"]}
                  rows={(data.rows || []).map((r: any) => [
                    <span className="font-mono text-indigo-600">{r.bill_number}</span>,
                    <span className="font-medium">{r.vendor_name}</span>,
                    fmt(r.total_amount),
                    <span className="text-green-600">{fmt(r.paid_amount)}</span>,
                    <span className="font-bold text-red-600">{fmt(r.outstanding)}</span>,
                    r.due_date || "—", r.status,
                  ])}
                />
              )}
            </>
          )}

          {/* Profit & Loss */}
          {!loading && activeReport === "profit-loss" && data && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5"><div className="text-sm text-green-700 font-medium mb-1">Total Income</div><div className="text-3xl font-bold text-green-700">{fmt(data.income?.total)}</div></div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-5"><div className="text-sm text-red-700 font-medium mb-1">Total Expenses</div><div className="text-3xl font-bold text-red-700">{fmt(data.expenses?.total)}</div></div>
                <div className={`border rounded-xl p-5 ${Number(data.net_profit) >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
                  <div className={`text-sm font-medium mb-1 ${Number(data.net_profit) >= 0 ? "text-blue-700" : "text-orange-700"}`}>Net Profit</div>
                  <div className={`text-3xl font-bold ${Number(data.net_profit) >= 0 ? "text-blue-700" : "text-orange-700"}`}>{fmt(data.net_profit)}</div>
                  <div className="text-sm mt-1 text-gray-500">Margin: {data.profit_margin}%</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <h3 className="font-semibold text-green-700 mb-3">💰 Income</h3>
                  {(data.income?.items || []).length === 0
                    ? <p className="text-sm text-gray-400">Revenue from cash collections: {fmt(data.income?.total)}</p>
                    : (data.income?.items || []).map((item: any) => (
                      <div key={item.code} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="text-gray-600">{item.name}</span>
                        <span className="font-medium text-green-600">{fmt(item.amount)}</span>
                      </div>
                    ))}
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4">
                  <h3 className="font-semibold text-red-700 mb-3">💸 Expenses</h3>
                  {(data.expenses?.items || []).length === 0
                    ? <p className="text-sm text-gray-400">No expense journal entries for this period</p>
                    : (data.expenses?.items || []).map((item: any) => (
                      <div key={item.code} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="text-gray-600">{item.name}</span>
                        <span className="font-medium text-red-600">{fmt(item.amount)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}

          {/* Expense Analysis */}
          {!loading && activeReport === "expense-analysis" && data && (
            <>
              <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Total Expenses</div>
                <div className="text-3xl font-bold text-red-600">{fmt(data.total)}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="p-4 border-b font-semibold text-gray-800 text-sm">By Category</div>
                  <ReportTable
                    headers={["Category", "Count", "Amount"]}
                    rows={(data.by_category || []).map((r: any) => [<span className="capitalize">{r.category}</span>, r.count, <span className="text-red-600 font-medium">{fmt(r.total)}</span>])}
                  />
                </div>
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="p-4 border-b font-semibold text-gray-800 text-sm">By Day</div>
                  <div className="max-h-80 overflow-y-auto">
                    <ReportTable
                      headers={["Date", "Count", "Total"]}
                      rows={(data.by_day || []).map((r: any) => [r.date, r.count, <span className="text-red-600 font-medium">{fmt(r.total)}</span>])}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cancellations */}
          {!loading && activeReport === "cancellation" && data && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white border rounded-xl p-4 shadow-sm"><div className="text-xs text-gray-500 mb-1">Total Cancelled</div><div className="text-2xl font-bold">{data.summary?.total}</div></div>
                <div className="bg-white border rounded-xl p-4 shadow-sm"><div className="text-xs text-gray-500 mb-1">Revenue Lost</div><div className="text-2xl font-bold text-red-600">{fmt(data.summary?.total_billed)}</div></div>
                <div className="bg-white border rounded-xl p-4 shadow-sm"><div className="text-xs text-gray-500 mb-1">Amount Paid</div><div className="text-2xl font-bold text-orange-600">{fmt(data.summary?.total_paid)}</div></div>
              </div>
              <ReportTable
                headers={["Booking #", "Customer", "Mobile", "Package", "Billed", "Paid", "Agent", "Branch", "Cancelled On"]}
                rows={(data.rows || []).map((r: any) => [
                  <span className="font-mono text-indigo-600">{r.booking_number}</span>,
                  r.customer_name, r.customer_mobile, r.package_name || "—",
                  fmt(r.total), <span className="text-green-600">{fmt(r.paid)}</span>,
                  r.agent_name || "—", r.branch_name || "—", r.cancelled_date,
                ])}
              />
            </>
          )}

          {!loading && !data && (
            <div className="flex items-center justify-center h-64 text-gray-400">Select a report and click Refresh</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {row.map((cell, j) => <td key={j} className="px-4 py-3 whitespace-nowrap">{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-gray-400">No data for selected period</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
