import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useGetAdminStats, getBookingsReport, getPaymentsReport, getCustomersReport } from "@workspace/api-client-react";
import { FileText, Download, Printer, TrendingUp, Users, IndianRupee, Package, CheckCircle, Clock, XCircle, BarChart2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

type ReportType = "bookings" | "payments" | "customers";

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function openPrint(data: Record<string, unknown>[], title: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const safeTitle = escapeHtml(title);
  const rows = data.map(row =>
    `<tr>${headers.map(h => `<td>${escapeHtml(String(row[h] ?? ""))}</td>`).join("")}</tr>`
  ).join("");
  const html = `<!DOCTYPE html><html><head><title>${safeTitle}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:20px;color:#222}
    .header{background:#0B3D2E;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:16px}
    h1{font-size:18px;font-family:Georgia,serif;margin-bottom:4px}
    .meta{font-size:11px;opacity:.7}
    table{border-collapse:collapse;width:100%;margin-top:8px}
    th{background:#0B3D2E;color:#fff;padding:8px 10px;font-size:10px;text-transform:uppercase;text-align:left}
    td{border:1px solid #ddd;padding:7px 10px;font-size:11px}
    tr:nth-child(even) td{background:#f5f5f5}
    @media print{body{padding:8px}.header{border-radius:0}}
  </style></head><body>
    <div class="header">
      <h1>Al Burhan Tours &amp; Travels — ${safeTitle}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString("en-IN")} &nbsp;·&nbsp; ${data.length} records</div>
    </div>
    <table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <script>window.print()</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

const REPORT_TYPES: { key: ReportType; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "bookings", label: "Bookings Report", desc: "All bookings with status, package, and amount", icon: <Package size={18} /> },
  { key: "payments", label: "Payments Report", desc: "Revenue and payment transaction details", icon: <IndianRupee size={18} /> },
  { key: "customers", label: "Customer List", desc: "All registered customers with contact info", icon: <Users size={18} /> },
];

export default function ReportsManager() {
  const { data: stats, isLoading } = useGetAdminStats();
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>("bookings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const fetchData = async () => {
    if (reportType === "payments") return (await getPaymentsReport()) as unknown as Record<string, unknown>[];
    if (reportType === "customers") return (await getCustomersReport()) as unknown as Record<string, unknown>[];
    const params: Record<string, string> = {};
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    return (await getBookingsReport(params)) as unknown as Record<string, unknown>[];
  };

  const handleGenerate = async (format: "csv" | "print" | "preview") => {
    setGenerating(true);
    try {
      const data = await fetchData();
      const label = REPORT_TYPES.find(r => r.key === reportType)?.label || "Report";
      if (!data.length) {
        toast({ title: "No Data", description: "No records found for the selected criteria." });
        return;
      }
      if (format === "csv") {
        downloadCSV(data, `${reportType}-${new Date().toISOString().split("T")[0]}.csv`);
        toast({ title: "CSV Downloaded", description: `${data.length} records exported.` });
      } else if (format === "print") {
        openPrint(data, label);
      } else {
        setPreviewData(data);
        setPreviewTitle(label);
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const statCards = stats ? [
    { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, bg: "bg-emerald-50", icon_color: "text-emerald-600", bar_color: "bg-emerald-500", pct: 100 },
    { label: "Total Bookings", value: String(stats.totalBookings), icon: Package, bg: "bg-blue-50", icon_color: "text-blue-600", bar_color: "bg-blue-500", pct: 100 },
    { label: "Confirmed", value: String(stats.confirmedBookings ?? 0), icon: CheckCircle, bg: "bg-teal-50", icon_color: "text-teal-600", bar_color: "bg-teal-500", pct: stats.totalBookings > 0 ? Math.round(((stats.confirmedBookings ?? 0) / stats.totalBookings) * 100) : 0 },
    { label: "Pending", value: String(stats.pendingBookings), icon: Clock, bg: "bg-amber-50", icon_color: "text-amber-600", bar_color: "bg-amber-500", pct: stats.totalBookings > 0 ? Math.round((stats.pendingBookings / stats.totalBookings) * 100) : 0 },
    { label: "Total Customers", value: String(stats.totalCustomers), icon: Users, bg: "bg-purple-50", icon_color: "text-purple-600", bar_color: "bg-purple-500", pct: 100 },
    { label: "Rejected", value: String(stats.rejectedBookings ?? 0), icon: XCircle, bg: "bg-red-50", icon_color: "text-red-500", bar_color: "bg-red-400", pct: stats.totalBookings > 0 ? Math.round(((stats.rejectedBookings ?? 0) / stats.totalBookings) * 100) : 0 },
  ] : [];

  const inputCls = "px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/40 focus:border-[#0B3D2E] bg-white";

  return (
    <AdminLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="w-7 h-7 text-[#0B3D2E]" />
          <h1 className="text-3xl font-serif font-bold text-foreground">Reports & Analytics</h1>
        </div>
        <p className="text-muted-foreground">Business insights, booking summaries, and data exports.</p>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          {statCards.map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-5 border border-white shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{s.label}</p>
                <s.icon className={`w-5 h-5 ${s.icon_color}`} />
              </div>
              <p className={`text-2xl font-bold font-mono ${s.icon_color} mb-2`}>{s.value}</p>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div className={`h-full ${s.bar_color} rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
              </div>
              {s.pct < 100 && <p className="text-[10px] text-gray-400 mt-1">{s.pct}% of total</p>}
            </div>
          ))}
        </div>
      )}

      {/* Report Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-6">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp size={16} className="text-[#0B3D2E]" />
              <h2 className="font-bold text-foreground">Generate Report</h2>
            </div>

            {/* Report Type */}
            <div className="space-y-2 mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Report Type</p>
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.key}
                  type="button"
                  onClick={() => { setReportType(rt.key); setPreviewData(null); }}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition ${reportType === rt.key ? "border-[#0B3D2E] bg-[#0B3D2E]/5" : "border-gray-100 hover:border-gray-200"}`}
                >
                  <span className={`mt-0.5 ${reportType === rt.key ? "text-[#0B3D2E]" : "text-gray-400"}`}>{rt.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${reportType === rt.key ? "text-[#0B3D2E]" : "text-gray-700"}`}>{rt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{rt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Date Range (for bookings only) */}
            {reportType === "bookings" && (
              <div className="mb-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Date Range (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">From</label>
                    <input type="date" className={`${inputCls} w-full`} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">To</label>
                    <input type="date" className={`${inputCls} w-full`} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => handleGenerate("preview")}
                disabled={generating}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#0d5038] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <FileText size={15} /> Preview Report
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleGenerate("csv")}
                  disabled={generating}
                  className="py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  onClick={() => handleGenerate("print")}
                  disabled={generating}
                  className="py-2.5 px-4 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="lg:col-span-3">
          {previewData ? (
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{previewTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{previewData.length} records</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleGenerate("csv")} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 font-semibold">
                    <Download size={12} /> CSV
                  </button>
                  <button onClick={() => handleGenerate("print")} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 font-semibold">
                    <Printer size={12} /> Print
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      {Object.keys(previewData[0]).map(h => (
                        <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={String(v ?? "")}>
                            {String(v ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 50 && (
                  <div className="text-center py-3 text-xs text-muted-foreground border-t">
                    Showing 50 of {previewData.length} records. Download CSV for full data.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 h-64 flex flex-col items-center justify-center text-center p-8">
              <BarChart2 className="w-12 h-12 text-gray-200 mb-3" />
              <p className="font-semibold text-gray-400 mb-1">No Preview Yet</p>
              <p className="text-xs text-gray-300">Select a report type and click "Preview Report"</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
