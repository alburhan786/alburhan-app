import { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Download, FileText, Users, CreditCard, CheckCircle, Clock } from "lucide-react";
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
};

const MODE_COLORS: Record<string, string> = {
  cash: "bg-green-50 border-green-200",
  neft: "bg-blue-50 border-blue-200",
  rtgs: "bg-indigo-50 border-indigo-200",
  imps: "bg-purple-50 border-purple-200",
  upi: "bg-violet-50 border-violet-200",
  cheque: "bg-amber-50 border-amber-200",
  bank: "bg-sky-50 border-sky-200",
  online: "bg-cyan-50 border-cyan-200",
  card: "bg-pink-50 border-pink-200",
};

export default function HajjiLedger() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function search(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/accounting/hajji-ledger/search?q=${encodeURIComponent(val)}`, { credentials: "include" });
        const data = await r.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {}
    }, 300);
  }

  async function loadLedger(booking: any) {
    setSuggestions([]);
    setQuery(booking.booking_number || booking.customer_name);
    setLoadingLedger(true);
    try {
      const r = await fetch(`${API}/api/accounting/hajji-ledger/${booking.id}`, { credentials: "include" });
      const data = await r.json();
      setLedger(data);
    } catch {
      toast({ title: "Error", description: "Failed to load ledger", variant: "destructive" });
    } finally {
      setLoadingLedger(false);
    }
  }

  function exportPDF() {
    if (!ledger) return;
    const { booking, statement, pilgrims, summary } = ledger;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    // Company header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY, 14, 16);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(COMPANY_ADDRESS, 14, 21);
    doc.setTextColor(0);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Hajji Payment Statement", 14, 30);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${today}`, 14, 35);

    // Booking details
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(14, 39, 182, 18, 2, 2, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(booking.customer_name, 18, 47);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Mobile: ${booking.customer_mobile}`, 18, 52);
    doc.text(`Booking #: ${booking.booking_number}  |  Package: ${booking.package_name || booking.group_name || "—"}`, 70, 47);
    doc.text(`Status: ${(booking.status || "").replace(/_/g, " ")}`, 70, 52);

    // Pilgrims
    if (pilgrims.length > 0) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Pilgrims:", 14, 62);
      doc.setFont("helvetica", "normal");
      const pilgrimText = pilgrims.map((p: any) => p.name + (p.passport_number ? ` (${p.passport_number})` : "")).join(", ");
      doc.text(doc.splitTextToSize(pilgrimText, 160), 38, 62);
    }

    // Summary row
    autoTable(doc, {
      startY: 68,
      head: [["Total Billed", "Total Paid", "Installments", "Balance"]],
      body: [[
        fmtCurr(summary.totalBilled),
        fmtCurr(summary.totalPaid),
        String(summary.totalInstallments),
        fmtCurr(summary.balance),
      ]],
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 9, fontStyle: "bold" },
      columnStyles: { 3: { textColor: summary.balance > 0 ? [200, 0, 0] : [0, 150, 0] } },
      margin: { left: 14, right: 14 },
    });

    // Payment statement
    const stmtRows = statement.map((p: any, i: number) => [
      String(i + 1), fmtDate(p.payment_date), p.mode || "—",
      p.bank_name || p.notes || "—", p.received_by || "—",
      fmtCurr(p.amount), fmtCurr(p.running_balance), fmtCurr(p.balance_remaining),
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [["#", "Date", "Mode", "Reference", "Received By", "Amount", "Running", "Balance Left"]],
      body: stmtRows,
      headStyles: { fillColor: [80, 100, 130], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
      theme: "striped",
    });

    // Mode breakdown
    const modeRows = Object.entries(summary.modeBreakdown).map(([mode, amt]: [string, any]) => [
      mode.toUpperCase(), fmtCurr(amt),
    ]);
    if (modeRows.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        head: [["Payment Mode", "Total Amount"]],
        body: modeRows,
        headStyles: { fillColor: [60, 80, 110], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 100 },
      });
    }

    doc.save(`hajji-payment-statement-${booking.booking_number}.pdf`);
  }

  function exportExcel() {
    if (!ledger) return;
    const { booking, statement, pilgrims, summary } = ledger;
    const wb = XLSX.utils.book_new();

    // Statement sheet
    const rows: any[][] = [
      [COMPANY],
      ["Hajji Payment Statement"],
      ["Generated:", new Date().toLocaleDateString("en-IN")],
      [],
      ["Customer:", booking.customer_name, "", "Mobile:", booking.customer_mobile],
      ["Booking #:", booking.booking_number, "", "Package:", booking.package_name || booking.group_name || ""],
      ["Status:", (booking.status || "").replace(/_/g, " ")],
      [],
      ["Pilgrims:", pilgrims.map((p: any) => p.name + (p.passport_number ? ` (${p.passport_number})` : "")).join(", ")],
      [],
      ["PAYMENT SUMMARY"],
      ["Total Billed:", summary.totalBilled],
      ["Total Paid:", summary.totalPaid],
      ["Total Installments:", summary.totalInstallments],
      ["Balance Due:", summary.balance],
      [],
      ["#", "Date", "Mode", "Reference / Notes", "Received By", "Amount", "Running Total", "Balance Remaining"],
    ];
    for (const p of statement) {
      rows.push([
        statement.indexOf(p) + 1, p.payment_date, p.mode || "", p.bank_name || p.notes || "",
        p.received_by || "", Number(p.amount), Number(p.running_balance), Number(p.balance_remaining),
      ]);
    }
    rows.push([]);
    rows.push(["", "", "", "", "MODE BREAKDOWN"]);
    for (const [mode, amt] of Object.entries(summary.modeBreakdown)) {
      rows.push(["", "", "", "", mode.toUpperCase(), amt]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Payment Statement");
    XLSX.writeFile(wb, `hajji-statement-${booking.booking_number}.xlsx`);
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6 print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-primary">Hajji Payment Ledger</h1>
            <p className="text-muted-foreground text-sm">Complete payment timeline — search by booking, name, mobile or passport</p>
          </div>
          {ledger && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}><Download size={15} className="mr-1" /> Excel</Button>
              <Button variant="outline" size="sm" onClick={exportPDF}><FileText size={15} className="mr-1" /> PDF</Button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative print:hidden">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by booking #, customer name, mobile or passport number..."
            value={query}
            onChange={e => search(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-xl shadow-lg max-h-72 overflow-y-auto">
              {suggestions.map((s: any) => (
                <button
                  key={s.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-center justify-between gap-3 border-b last:border-b-0"
                  onClick={() => loadLedger(s)}
                >
                  <div>
                    <div className="font-medium text-sm">{s.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{s.booking_number} · {s.customer_mobile}</div>
                  </div>
                  <div className="text-right text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[s.status] || "bg-gray-100"}`}>
                      {s.status?.replace(/_/g, " ")}
                    </span>
                    <div className="text-orange-600 font-medium mt-0.5">
                      Bal: {fmtCurr(Math.max(0, Number(s.final_amount) - Number(s.paid_amount)))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingLedger && <div className="text-center py-12 text-muted-foreground">Loading ledger…</div>}

        {ledger && !loadingLedger && (
          <>
            {/* Booking summary */}
            <Card className="print:shadow-none">
              <CardContent className="py-4">
                <div className="flex flex-wrap gap-6 items-start">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Customer</div>
                    <div className="font-bold text-lg">{ledger.booking.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{ledger.booking.customer_mobile}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Booking</div>
                    <div className="font-semibold">{ledger.booking.booking_number}</div>
                    <div className="text-sm text-muted-foreground">{ledger.booking.package_name || ledger.booking.group_name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Status</div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[ledger.booking.status] || "bg-gray-100"}`}>
                      {ledger.booking.status?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="ml-auto flex gap-6 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Billed</div>
                      <div className="text-xl font-bold text-primary">{fmtCurr(ledger.summary.totalBilled)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</div>
                      <div className="text-xl font-bold text-green-600">{fmtCurr(ledger.summary.totalPaid)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Balance</div>
                      <div className={`text-xl font-bold ${ledger.summary.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmtCurr(ledger.summary.balance)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mode breakdown */}
            {Object.keys(ledger.summary.modeBreakdown).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(ledger.summary.modeBreakdown).map(([mode, amt]: [string, any]) => (
                  <div key={mode} className={`px-3 py-2 rounded-lg border text-sm ${MODE_COLORS[mode] || "bg-gray-50 border-gray-200"}`}>
                    <span className="font-medium capitalize">{mode}</span>
                    <span className="ml-2 font-bold">{fmtCurr(amt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pilgrims */}
            {ledger.pilgrims.length > 0 && (
              <Card className="print:shadow-none">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <Users size={15} className="text-muted-foreground" />
                  <span className="text-sm font-semibold">{ledger.pilgrims.length} Pilgrim{ledger.pilgrims.length !== 1 ? "s" : ""}</span>
                </div>
                <CardContent className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {ledger.pilgrims.map((p: any) => (
                      <div key={p.id} className="text-sm bg-muted/40 rounded-lg px-3 py-1.5">
                        <span className="font-medium">{p.name}</span>
                        {p.passport_number && <span className="text-muted-foreground ml-2 text-xs">{p.passport_number}</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payment statement */}
            <Card className="print:shadow-none">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <CreditCard size={15} className="text-muted-foreground" />
                <span className="text-sm font-semibold">Payment Statement ({ledger.summary.totalInstallments} installment{ledger.summary.totalInstallments !== 1 ? "s" : ""})</span>
              </div>
              <CardContent className="p-0">
                {ledger.statement.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">No payments recorded yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                          <th className="text-left px-4 py-2.5">#</th>
                          <th className="text-left px-4 py-2.5">Date</th>
                          <th className="text-left px-4 py-2.5">Mode</th>
                          <th className="text-left px-4 py-2.5">Reference</th>
                          <th className="text-left px-4 py-2.5">Received By</th>
                          <th className="text-right px-4 py-2.5">Amount</th>
                          <th className="text-right px-4 py-2.5">Running Total</th>
                          <th className="text-right px-4 py-2.5">Balance Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.statement.map((p: any, i: number) => (
                          <tr key={p.id} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}>
                            <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-2.5">{fmtDate(p.payment_date)}</td>
                            <td className="px-4 py-2.5 capitalize font-medium">{p.mode || "—"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.bank_name || p.notes || "—"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.received_by || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmtCurr(p.amount)}</td>
                            <td className="px-4 py-2.5 text-right">{fmtCurr(p.running_balance)}</td>
                            <td className="px-4 py-2.5 text-right">
                              {p.balance_remaining > 0
                                ? <span className="text-orange-600 font-medium">{fmtCurr(p.balance_remaining)}</span>
                                : <span className="text-green-600 font-medium flex items-center justify-end gap-1"><CheckCircle size={12} />Paid</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 font-semibold">
                          <td colSpan={5} className="px-4 py-3 text-right">Total</td>
                          <td className="px-4 py-3 text-right text-green-700">{fmtCurr(ledger.summary.totalPaid)}</td>
                          <td colSpan={2} className="px-4 py-3 text-right">
                            {ledger.summary.balance > 0
                              ? <span className="text-red-600">Due: {fmtCurr(ledger.summary.balance)}</span>
                              : <span className="text-green-600 flex items-center justify-end gap-1"><CheckCircle size={14} />Fully Paid</span>
                            }
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!ledger && !loadingLedger && (
          <div className="text-center py-16 text-muted-foreground">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p>Search by booking number, customer name, mobile or passport number</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
