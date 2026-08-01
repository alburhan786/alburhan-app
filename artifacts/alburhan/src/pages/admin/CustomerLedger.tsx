import { useState, useRef, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, Download, FileText, ChevronDown, ChevronRight,
  User, Phone, Mail, ArrowLeft, RefreshCw, AlertCircle, Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";
const COMPANY = "Al Burhan Tours & Travels";
const COMPANY_ADDRESS = "Contact: +91 98939 89786 | alburhantravels.com";

function fmtCurr(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  partially_paid: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function CustomerLedger() {
  const { toast } = useToast();

  // List view state
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [displayList, setDisplayList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  // Search state
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Detail view state
  const [ledger, setLedger] = useState<any>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load recent customers on mount
  const loadRecent = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const r = await fetch(`${API}/api/accounting/customer-ledger/recent`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setListError(body.error || "Failed to load customer records");
        setListLoading(false);
        return;
      }
      const data = await r.json();
      setRecentCustomers(Array.isArray(data) ? data : []);
      setDisplayList(Array.isArray(data) ? data : []);
    } catch {
      setListError("Network error — could not load customer records");
    }
    setListLoading(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  // Search handler
  function handleSearch(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);

    if (val.trim().length === 0) {
      setDisplayList(recentCustomers);
      return;
    }

    if (val.trim().length < 2) {
      // client-side filter on recent list
      const term = val.trim().toLowerCase();
      setDisplayList(recentCustomers.filter(c =>
        (c.name || "").toLowerCase().includes(term) ||
        (c.mobile || "").includes(term)
      ));
      return;
    }

    // Debounced server search
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/accounting/customer-ledger/search?q=${encodeURIComponent(val)}`, { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setDisplayList(Array.isArray(data) ? data : []);
        }
      } catch {}
    }, 300);
  }

  async function loadLedger(customer: any) {
    setLedger(null);
    setLoadingLedger(true);
    setExpanded(new Set());
    try {
      const r = await fetch(`${API}/api/accounting/customer-ledger/user/${customer.id}`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast({ title: "Error", description: body.error || "Failed to load ledger", variant: "destructive" });
        setLoadingLedger(false);
        return;
      }
      const data = await r.json();
      setLedger(data);
    } catch {
      toast({ title: "Error", description: "Failed to load ledger", variant: "destructive" });
    }
    setLoadingLedger(false);
  }

  function goBack() {
    setLedger(null);
    setQuery("");
    setDisplayList(recentCustomers);
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exportPDF() {
    if (!ledger) return;
    const { customer, bookings, summary } = ledger;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(COMPANY, 14, 16);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(COMPANY_ADDRESS, 14, 21); doc.setTextColor(0);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("Customer Ledger Statement", 14, 30);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${today}`, 14, 35);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, 39, 182, 14, 2, 2, "F");
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(customer.name || customer.mobile, 18, 46);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(`Mobile: ${customer.mobile}`, 18, 50);
    if (customer.email) doc.text(`Email: ${customer.email}`, 80, 50);
    autoTable(doc, {
      startY: 57,
      head: [["Total Billed", "Total Paid", "Discount", "Refunds", "Outstanding"]],
      body: [[fmtCurr(summary.totalBilled), fmtCurr(summary.totalPaid), fmtCurr(summary.totalDiscount || 0), fmtCurr(summary.totalRefund || 0), fmtCurr(summary.totalBalance)]],
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 9, fontStyle: "bold" },
      columnStyles: { 4: { textColor: summary.totalBalance > 0 ? [200, 0, 0] : [0, 150, 0] } },
      margin: { left: 14, right: 14 },
    });
    let y = (doc as any).lastAutoTable.finalY + 6;
    for (const b of bookings) {
      if (y > 240) { doc.addPage(); y = 14; }
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`${b.booking_number || "—"} — ${b.package_name || b.group_name || "—"}  [${(b.status || "").replace(/_/g, " ")}]`, 14, y + 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(`Date: ${fmtDate(b.created_at)}  |  Pilgrims: ${b.number_of_pilgrims || 1}`, 14, y + 8);
      y += 10;
      const rows: any[] = b.payments.map((p: any, i: number) => [String(i + 1), fmtDate(p.payment_date), p.mode || "—", p.received_by || "—", p.bank_name || "—", fmtCurr(Number(p.amount))]);
      rows.push(["", "", "", "", "Sub-total Paid", fmtCurr(b.paid_amount)]);
      if (b.discount_amount > 0) rows.push(["", "", "", "", "Discount", `(${fmtCurr(b.discount_amount)})`]);
      if (b.balance > 0) rows.push(["", "", "", "", "Balance Due", fmtCurr(b.balance)]);
      autoTable(doc, {
        startY: y,
        head: [["#", "Date", "Mode", "Received By", "Bank/Notes", "Amount"]],
        body: rows,
        headStyles: { fillColor: [80, 100, 130], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 5: { halign: "right" } },
        margin: { left: 14, right: 14 },
        theme: "striped",
      });
      y = (doc as any).lastAutoTable.finalY + 4;
    }
    autoTable(doc, {
      startY: y + 2,
      head: [["GRAND TOTALS", "Billed", "Paid", "Discount", "Outstanding"]],
      body: [["", fmtCurr(summary.totalBilled), fmtCurr(summary.totalPaid), fmtCurr(summary.totalDiscount || 0), fmtCurr(summary.totalBalance)]],
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 9, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
    doc.save(`customer-ledger-${customer.mobile}-${Date.now()}.pdf`);
  }

  function exportExcel() {
    if (!ledger) return;
    const { customer, bookings, summary } = ledger;
    const wb = XLSX.utils.book_new();
    const sumRows = [
      [COMPANY], ["Customer Ledger Statement"], ["Generated:", new Date().toLocaleDateString("en-IN")], [],
      ["Customer Name:", customer.name || ""], ["Mobile:", customer.mobile], ["Email:", customer.email || ""], [],
      ["SUMMARY"], ["Total Billed", summary.totalBilled], ["Total Paid", summary.totalPaid],
      ["Total Discount", summary.totalDiscount || 0], ["Total Refund", summary.totalRefund || 0], ["Outstanding Balance", summary.totalBalance],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), "Summary");
    const rows: any[][] = [["Booking #", "Package / Group", "Date", "Status", "Pilgrims", "Total Amount", "Advance", "Paid", "Discount", "Refund", "Balance", "— Pmt Date", "Mode", "Received By", "Pmt Amount"]];
    for (const b of bookings) {
      if (b.payments.length === 0) {
        rows.push([b.booking_number, b.package_name || b.group_name || "", fmtDate(b.created_at), b.status, b.number_of_pilgrims || 1, b.final_amount, b.advance_amount || 0, b.paid_amount, b.discount_amount || 0, b.refund_amount || 0, b.balance, "", "", "", ""]);
      } else {
        rows.push([b.booking_number, b.package_name || b.group_name || "", fmtDate(b.created_at), b.status, b.number_of_pilgrims || 1, b.final_amount, b.advance_amount || 0, b.paid_amount, b.discount_amount || 0, b.refund_amount || 0, b.balance, fmtDate(b.payments[0].payment_date), b.payments[0].mode || "", b.payments[0].received_by || "", Number(b.payments[0].amount)]);
        for (let i = 1; i < b.payments.length; i++) {
          const p = b.payments[i];
          rows.push(["", "", "", "", "", "", "", "", "", "", "", fmtDate(p.payment_date), p.mode || "", p.received_by || "", Number(p.amount)]);
        }
      }
    }
    rows.push([], ["TOTALS", "", "", "", "", summary.totalBilled, "", summary.totalPaid, summary.totalDiscount || 0, summary.totalRefund || 0, summary.totalBalance]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Ledger");
    XLSX.writeFile(wb, `customer-ledger-${customer.mobile}.xlsx`);
  }

  const showDetail = ledger && !loadingLedger;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-5 print:p-0">

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            {showDetail && (
              <button onClick={goBack} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-primary">Customer Ledger</h1>
              <p className="text-muted-foreground text-sm">
                {showDetail ? `Ledger for ${ledger.customer.name || ledger.customer.mobile}` : "Complete payment history per customer"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {showDetail && (
              <>
                <Button variant="outline" size="sm" onClick={exportExcel}><Download size={15} className="mr-1" /> Excel</Button>
                <Button variant="outline" size="sm" onClick={exportPDF}><FileText size={15} className="mr-1" /> PDF</Button>
              </>
            )}
            {!showDetail && (
              <Button variant="outline" size="sm" onClick={loadRecent} disabled={listLoading} className="gap-1.5">
                <RefreshCw size={13} className={listLoading ? "animate-spin" : ""} /> Refresh
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        {!showDetail && (
          <div className="relative print:hidden">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by customer name or mobile number…"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {/* Loading state for ledger detail */}
        {loadingLedger && (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw size={28} className="animate-spin mx-auto mb-3 opacity-40" />
            <p>Loading ledger…</p>
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {!ledger && !loadingLedger && (
          <>
            {listLoading && (
              <div className="text-center py-16 text-muted-foreground">
                <RefreshCw size={28} className="animate-spin mx-auto mb-3 opacity-40" />
                <p>Loading customer records…</p>
              </div>
            )}

            {listError && !listLoading && (
              <Card>
                <CardContent className="py-10 text-center">
                  <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
                  <p className="text-red-500 font-medium">{listError}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={loadRecent}>Try Again</Button>
                </CardContent>
              </Card>
            )}

            {!listLoading && !listError && displayList.length === 0 && (
              <Card>
                <CardContent className="py-14 text-center">
                  <Users size={36} className="text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-muted-foreground">
                    {query.trim().length > 0 ? `No customers found matching "${query}"` : "No customer records found."}
                  </p>
                  {query.trim().length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">Try a different name or mobile number.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {!listLoading && !listError && displayList.length > 0 && (
              <Card>
                <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {query.trim().length > 0 ? `${displayList.length} result${displayList.length !== 1 ? "s" : ""}` : `Recent ${displayList.length} customers`}
                  </span>
                  <span className="text-xs text-muted-foreground">Click a row to view full ledger</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/10">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mobile</th>
                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Bookings</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Billed</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Paid</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayList.map((c: any) => {
                        const outstanding = Math.max(0, Number(c.total_billed) - Number(c.total_paid));
                        return (
                          <tr
                            key={c.id}
                            className="border-b last:border-0 hover:bg-primary/5 cursor-pointer transition-colors"
                            onClick={() => loadLedger(c)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <User size={13} className="text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{c.name || <span className="text-muted-foreground italic">No name</span>}</p>
                                  {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{c.mobile}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
                                {c.booking_count}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono">{fmtCurr(Number(c.total_billed))}</td>
                            <td className="px-4 py-3 text-right font-mono text-green-600">{fmtCurr(Number(c.total_paid))}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">
                              <span className={outstanding > 0 ? "text-red-600" : "text-green-600"}>
                                {fmtCurr(outstanding)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {showDetail && (
          <>
            {/* Customer summary card */}
            <Card className="print:shadow-none">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-start gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={20} className="text-primary" />
                    </div>
                    <div>
                      <div className="font-bold text-lg">{ledger.customer.name || "—"}</div>
                      <div className="flex gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone size={12} />{ledger.customer.mobile}</span>
                        {ledger.customer.email && <span className="flex items-center gap-1"><Mail size={12} />{ledger.customer.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-6 text-center">
                    {[
                      { label: "Total Billed", val: ledger.summary.totalBilled, cls: "text-primary" },
                      { label: "Total Paid", val: ledger.summary.totalPaid, cls: "text-green-600" },
                      ...(ledger.summary.totalDiscount > 0 ? [{ label: "Discount", val: ledger.summary.totalDiscount, cls: "text-blue-600" }] : []),
                      ...(ledger.summary.totalRefund > 0 ? [{ label: "Refund", val: ledger.summary.totalRefund, cls: "text-purple-600" }] : []),
                      { label: "Outstanding", val: ledger.summary.totalBalance, cls: ledger.summary.totalBalance > 0 ? "text-red-600" : "text-green-600" },
                    ].map((item: any) => (
                      <div key={item.label}>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">{item.label}</div>
                        <div className={`text-lg font-bold ${item.cls}`}>{fmtCurr(item.val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bookings */}
            {ledger.bookings.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">No bookings found for this customer.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {ledger.bookings.map((b: any) => (
                  <Card key={b.id} className="print:shadow-none print:break-inside-avoid">
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30" onClick={() => toggleExpanded(b.id)}>
                      <span className="text-muted-foreground">{expanded.has(b.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Booking #</div>
                          <div className="font-semibold">{b.booking_number || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Package</div>
                          <div className="font-medium truncate">{b.package_name || b.group_name || "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Date</div>
                          <div>{fmtDate(b.created_at)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Status</div>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] || "bg-gray-100"}`}>
                            {b.status?.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Bill / Paid / Bal</div>
                          <div className="font-semibold text-sm">
                            <span>{fmtCurr(b.final_amount)}</span>
                            <span className="text-green-600 mx-1">/ {fmtCurr(b.paid_amount)}</span>
                            <span className={b.balance > 0 ? "text-red-600" : "text-green-600"}>/ {fmtCurr(b.balance)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {expanded.has(b.id) && (
                      <div className="border-t px-4 pb-4">
                        {(b.discount_amount > 0 || b.refund_amount > 0) && (
                          <div className="flex gap-4 mt-3 text-sm">
                            {b.discount_amount > 0 && <span className="text-blue-700">Discount: {fmtCurr(b.discount_amount)}</span>}
                            {b.refund_amount > 0 && <span className="text-purple-700">Refund: {fmtCurr(b.refund_amount)}</span>}
                          </div>
                        )}
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Payment History</div>
                        {b.payments.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No payments recorded.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-xs text-muted-foreground">
                                <th className="text-left py-1.5 pr-4">Date</th>
                                <th className="text-left py-1.5 pr-4">Mode</th>
                                <th className="text-left py-1.5 pr-4">Reference / Bank</th>
                                <th className="text-left py-1.5 pr-4">Received By</th>
                                <th className="text-right py-1.5">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.payments.map((p: any, idx: number) => (
                                <tr key={p.id} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                                  <td className="py-1.5 pr-4">{fmtDate(p.payment_date)}</td>
                                  <td className="py-1.5 pr-4 capitalize">{p.mode || "—"}</td>
                                  <td className="py-1.5 pr-4 text-muted-foreground text-xs">{p.bank_name || p.notes || "—"}</td>
                                  <td className="py-1.5 pr-4 text-muted-foreground">{p.received_by || "—"}</td>
                                  <td className={`py-1.5 text-right font-medium ${Number(p.amount) < 0 ? "text-red-600" : "text-green-700"}`}>
                                    {fmtCurr(Math.abs(Number(p.amount)))}{Number(p.amount) < 0 ? " (refund)" : ""}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t font-semibold bg-muted/30">
                                <td colSpan={4} className="py-2 text-right pr-4">Total Paid</td>
                                <td className="py-2 text-right text-green-700">{fmtCurr(b.paid_amount)}</td>
                              </tr>
                              {b.balance > 0 && (
                                <tr className="font-semibold">
                                  <td colSpan={4} className="py-1 text-right pr-4 text-red-600">Balance Due</td>
                                  <td className="py-1 text-right text-red-600">{fmtCurr(b.balance)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
