import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Download, RefreshCw, TrendingUp, TrendingDown, Scale } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const TABS = ["summary", "sales", "purchase"] as const;
type Tab = typeof TABS[number];

export default function GSTReports() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("summary");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [salesRows, setSalesRows] = useState<any[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to }).toString();
      const [sumR, salR, purR] = await Promise.all([
        fetch(`${API}/api/gst/summary?${qs}`, { credentials: "include" }),
        fetch(`${API}/api/gst/sales-register?${qs}`, { credentials: "include" }),
        fetch(`${API}/api/gst/purchase-register?${qs}`, { credentials: "include" }),
      ]);
      if (sumR.ok) setSummary(await sumR.json());
      if (salR.ok) setSalesRows(await salR.json());
      if (purR.ok) setPurchaseRows(await purR.json());
    } catch (e: any) {
      toast({ title: "Failed to load GST data", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  function exportSummaryXlsx() {
    if (!summary) return;
    const s = summary;
    const rows = [
      { "Item": "Period From", "Value": s.period?.from || "" },
      { "Item": "Period To", "Value": s.period?.to || "" },
      {},
      { "Item": "=== SALES (GST Collected) ===" },
      { "Item": "Total Revenue", "Value": s.sales?.totalRevenue },
      { "Item": "Taxable Revenue", "Value": s.sales?.taxableRevenue },
      { "Item": "GST Collected (Total)", "Value": s.sales?.totalGstCollected },
      { "Item": "CGST Collected (9%)", "Value": (s.sales?.totalGstCollected || 0) / 2 },
      { "Item": "SGST Collected (9%)", "Value": (s.sales?.totalGstCollected || 0) / 2 },
      { "Item": "Invoice Count", "Value": s.sales?.invoiceCount },
      {},
      { "Item": "=== PURCHASE (GST Paid) ===" },
      { "Item": "Total Expenses", "Value": s.purchase?.totalExpenses },
      { "Item": "CGST Paid", "Value": s.purchase?.totalCgstPaid },
      { "Item": "SGST Paid", "Value": s.purchase?.totalSgstPaid },
      { "Item": "IGST Paid", "Value": s.purchase?.totalIgstPaid },
      { "Item": "Total GST Paid", "Value": s.purchase?.totalGstPaid },
      {},
      { "Item": "NET GST PAYABLE", "Value": s.netGstPayable },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GST Summary");
    XLSX.writeFile(wb, `gst-summary-${from}-to-${to}.xlsx`);
  }

  function exportSalesXlsx() {
    const rows = salesRows.map(r => ({
      "Invoice Date": r.invoice_date,
      "Booking #": r.booking_number,
      "Invoice #": r.invoice_number || "",
      "Customer": r.customer_name,
      "Mobile": r.customer_mobile,
      "Package": r.package_name,
      "Group": r.group_name || "",
      "Taxable Amount": r.taxable_amount,
      "GST Rate (%)": r.gst_rate,
      "CGST (₹)": r.cgst_amount,
      "SGST (₹)": r.sgst_amount,
      "Total GST (₹)": r.gst_amount,
      "Invoice Total (₹)": r.final_amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Register");
    XLSX.writeFile(wb, `gst-sales-register-${from}-to-${to}.xlsx`);
  }

  function exportPurchaseXlsx() {
    const rows = purchaseRows.map(r => ({
      "Date": r.date,
      "Vendor": r.vendor_name || r.vendor || "",
      "Vendor GSTIN": r.vendor_gstin || "",
      "HSN/SAC": r.hsn_sac || "",
      "Description": r.description,
      "Category": r.category,
      "Invoice #": r.invoice_number || "",
      "Amount (₹)": r.amount,
      "GST %": r.gst_percent,
      "CGST (₹)": r.cgst_amount,
      "SGST (₹)": r.sgst_amount,
      "IGST (₹)": r.igst_amount,
      "Total GST (₹)": r.total_gst,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Register");
    XLSX.writeFile(wb, `gst-purchase-register-${from}-to-${to}.xlsx`);
  }

  const tabLabels: Record<Tab, string> = {
    summary: "GST Summary",
    sales: "Sales Register",
    purchase: "Purchase Register",
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">GST Reports</h1>
            <p className="text-sm text-muted-foreground">GST summary, sales & purchase registers</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm w-32" />
            <span className="text-muted-foreground text-xs self-center">to</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm w-32" />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            {tab === "summary" && (
              <Button variant="outline" size="sm" onClick={exportSummaryXlsx} disabled={!summary}>
                <Download size={14} className="mr-1.5" />Export
              </Button>
            )}
            {tab === "sales" && (
              <Button variant="outline" size="sm" onClick={exportSalesXlsx} disabled={!salesRows.length}>
                <Download size={14} className="mr-1.5" />Export Excel
              </Button>
            )}
            {tab === "purchase" && (
              <Button variant="outline" size="sm" onClick={exportPurchaseXlsx} disabled={!purchaseRows.length}>
                <Download size={14} className="mr-1.5" />Export Excel
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-[#0d5040]" : "text-muted-foreground hover:text-foreground"}`}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* SUMMARY TAB */}
        {tab === "summary" && summary && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <TrendingUp size={18} />
                  <span className="text-sm font-semibold">Output GST (Collected)</span>
                </div>
                <p className="text-3xl font-bold text-green-700">{fmt(summary.sales?.totalGstCollected)}</p>
                <p className="text-xs text-muted-foreground mt-1">{summary.sales?.invoiceCount} invoices | Taxable: {fmt(summary.sales?.taxableRevenue)}</p>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST (9%)</span>
                    <span className="font-medium">{fmt((summary.sales?.totalGstCollected || 0) / 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST (9%)</span>
                    <span className="font-medium">{fmt((summary.sales?.totalGstCollected || 0) / 2)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center gap-2 text-red-600 mb-2">
                  <TrendingDown size={18} />
                  <span className="text-sm font-semibold">Input GST (Paid)</span>
                </div>
                <p className="text-3xl font-bold text-red-700">{fmt(summary.purchase?.totalGstPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total expenses: {fmt(summary.purchase?.totalExpenses)}</p>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST Paid</span>
                    <span className="font-medium">{fmt(summary.purchase?.totalCgstPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST Paid</span>
                    <span className="font-medium">{fmt(summary.purchase?.totalSgstPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST Paid</span>
                    <span className="font-medium">{fmt(summary.purchase?.totalIgstPaid)}</span>
                  </div>
                </div>
              </div>

              <div className={`rounded-xl border p-5 ${summary.netGstPayable >= 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                <div className={`flex items-center gap-2 mb-2 ${summary.netGstPayable >= 0 ? "text-orange-700" : "text-green-700"}`}>
                  <Scale size={18} />
                  <span className="text-sm font-semibold">Net GST {summary.netGstPayable >= 0 ? "Payable" : "Credit"}</span>
                </div>
                <p className={`text-3xl font-bold ${summary.netGstPayable >= 0 ? "text-orange-700" : "text-green-700"}`}>
                  {fmt(Math.abs(summary.netGstPayable))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Output GST − Input GST
                </p>
                <div className="mt-3 text-xs p-2 rounded bg-white/60">
                  <p>{fmt(summary.sales?.totalGstCollected)} − {fmt(summary.purchase?.totalGstPaid)} = <strong>{fmt(summary.netGstPayable)}</strong></p>
                </div>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3">Revenue Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="font-bold text-lg">{fmt(summary.sales?.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxable Amount</p>
                  <p className="font-bold text-lg">{fmt(summary.sales?.taxableRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">GST Collected</p>
                  <p className="font-bold text-lg text-green-600">{fmt(summary.sales?.totalGstCollected)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">GST on Expenses</p>
                  <p className="font-bold text-lg text-red-600">{fmt(summary.purchase?.totalGstPaid)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SALES REGISTER TAB */}
        {tab === "sales" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading…</div>
            ) : salesRows.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">No invoices with GST found for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Date</th>
                      <th className="px-3 py-2.5 text-left">Invoice #</th>
                      <th className="px-3 py-2.5 text-left">Customer</th>
                      <th className="px-3 py-2.5 text-left">Package</th>
                      <th className="px-3 py-2.5 text-right">Taxable</th>
                      <th className="px-3 py-2.5 text-right">GST %</th>
                      <th className="px-3 py-2.5 text-right">CGST</th>
                      <th className="px-3 py-2.5 text-right">SGST</th>
                      <th className="px-3 py-2.5 text-right">Total GST</th>
                      <th className="px-3 py-2.5 text-right">Invoice Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {salesRows.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{r.invoice_date}</td>
                        <td className="px-3 py-2.5 text-xs font-mono">{r.invoice_number || r.booking_number}</td>
                        <td className="px-3 py-2.5 text-xs">{r.customer_name}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[140px] truncate">{r.package_name}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.taxable_amount))}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{r.gst_rate || 18}%</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(r.cgst_amount)}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(r.sgst_amount)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-xs text-green-700">{fmt(parseFloat(r.gst_amount))}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-xs">{fmt(parseFloat(r.final_amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold text-xs">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5">TOTAL ({salesRows.length})</td>
                      <td className="px-3 py-2.5 text-right">{fmt(salesRows.reduce((s, r) => s + parseFloat(r.taxable_amount || 0), 0))}</td>
                      <td />
                      <td className="px-3 py-2.5 text-right">{fmt(salesRows.reduce((s, r) => s + r.cgst_amount, 0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(salesRows.reduce((s, r) => s + r.sgst_amount, 0))}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmt(salesRows.reduce((s, r) => s + parseFloat(r.gst_amount || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(salesRows.reduce((s, r) => s + parseFloat(r.final_amount || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PURCHASE REGISTER TAB */}
        {tab === "purchase" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading…</div>
            ) : purchaseRows.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No expenses with GST entries found.
                <p className="mt-1 text-xs">Add GST amounts when entering expenses to see them here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Date</th>
                      <th className="px-3 py-2.5 text-left">Vendor</th>
                      <th className="px-3 py-2.5 text-left">GSTIN</th>
                      <th className="px-3 py-2.5 text-left">HSN/SAC</th>
                      <th className="px-3 py-2.5 text-left">Description</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                      <th className="px-3 py-2.5 text-right">GST %</th>
                      <th className="px-3 py-2.5 text-right">CGST</th>
                      <th className="px-3 py-2.5 text-right">SGST</th>
                      <th className="px-3 py-2.5 text-right">IGST</th>
                      <th className="px-3 py-2.5 text-right">Total GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchaseRows.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2.5 text-xs">{r.vendor_name || r.vendor || "—"}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-[11px]">{r.vendor_gstin || "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{r.hsn_sac || "—"}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{r.description}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.amount))}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{r.gst_percent || 0}%</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.cgst_amount))}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.sgst_amount))}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.igst_amount))}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-xs text-red-700">{fmt(parseFloat(r.total_gst))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold text-xs">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5">TOTAL ({purchaseRows.length})</td>
                      <td className="px-3 py-2.5 text-right">{fmt(purchaseRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0))}</td>
                      <td />
                      <td className="px-3 py-2.5 text-right">{fmt(purchaseRows.reduce((s, r) => s + parseFloat(r.cgst_amount || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(purchaseRows.reduce((s, r) => s + parseFloat(r.sgst_amount || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(purchaseRows.reduce((s, r) => s + parseFloat(r.igst_amount || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-red-700">{fmt(purchaseRows.reduce((s, r) => s + parseFloat(r.total_gst || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
