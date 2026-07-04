import { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Download, FileText, ChevronDown, ChevronRight, User, Phone, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

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
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  async function search(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/accounting/customer-ledger/search?q=${encodeURIComponent(val)}`, { credentials: "include" });
        const data = await r.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {}
    }, 300);
  }

  async function loadLedger(customer: any) {
    setSelected(customer);
    setSuggestions([]);
    setQuery(customer.name || customer.mobile);
    setLoadingLedger(true);
    setExpanded(new Set());
    try {
      const r = await fetch(`${API}/api/accounting/customer-ledger/${customer.mobile}`, { credentials: "include" });
      const data = await r.json();
      setLedger(data);
    } catch {
      toast({ title: "Error", description: "Failed to load ledger", variant: "destructive" });
    } finally {
      setLoadingLedger(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exportCSV() {
    if (!ledger) return;
    const rows: string[][] = [
      ["Customer Ledger — " + (ledger.customer.name || ledger.customer.mobile)],
      [],
      ["Booking #", "Package", "Group", "Status", "Pilgrims", "Date", "Total Amount", "Paid", "Balance"],
    ];
    for (const b of ledger.bookings) {
      rows.push([b.booking_number || "", b.package_name || "", b.group_name || "", b.status, b.number_of_pilgrims,
        fmtDate(b.created_at), b.final_amount, b.paid_amount, b.balance]);
      for (const p of b.payments) {
        rows.push(["", "", `  Payment: ${p.mode} — ${fmtDate(p.payment_date)}`, "", "", "", "", fmtCurr(p.amount), ""]);
      }
    }
    rows.push([]);
    rows.push(["", "", "", "", "", "TOTALS", fmtCurr(ledger.summary.totalBilled), fmtCurr(ledger.summary.totalPaid), fmtCurr(ledger.summary.totalBalance)]);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customer-ledger-${ledger.customer.mobile}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function printLedger() {
    window.print();
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-primary">Customer Ledger</h1>
            <p className="text-muted-foreground text-sm">View complete payment history per customer</p>
          </div>
          {ledger && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}><Download size={15} className="mr-1" /> CSV</Button>
              <Button variant="outline" size="sm" onClick={printLedger}><FileText size={15} className="mr-1" /> Print</Button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative print:hidden">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search customer by name or mobile..."
            value={query}
            onChange={e => search(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-xl shadow-lg max-h-72 overflow-y-auto">
              {suggestions.map((s: any) => (
                <button
                  key={s.mobile}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-center justify-between gap-3 border-b last:border-b-0"
                  onClick={() => loadLedger(s)}
                >
                  <div>
                    <div className="font-medium text-sm">{s.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.mobile}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{s.booking_count} booking{s.booking_count !== 1 ? "s" : ""}</div>
                    <div className="text-orange-600 font-medium">Bal: {fmtCurr(Number(s.total_billed) - Number(s.total_paid))}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingLedger && (
          <div className="text-center py-12 text-muted-foreground">Loading ledger…</div>
        )}

        {ledger && !loadingLedger && (
          <>
            {/* Customer card */}
            <Card className="print:shadow-none print:border">
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
                  <div className="ml-auto flex gap-6 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Billed</div>
                      <div className="text-lg font-bold text-primary">{fmtCurr(ledger.summary.totalBilled)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</div>
                      <div className="text-lg font-bold text-green-600">{fmtCurr(ledger.summary.totalPaid)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding</div>
                      <div className={`text-lg font-bold ${ledger.summary.totalBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmtCurr(ledger.summary.totalBalance)}
                      </div>
                    </div>
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
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 print:cursor-default"
                      onClick={() => toggleExpanded(b.id)}
                    >
                      <span className="print:hidden text-muted-foreground">
                        {expanded.has(b.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
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
                          <div className="text-xs text-muted-foreground">Bill / Paid / Balance</div>
                          <div className="font-semibold">
                            <span>{fmtCurr(b.final_amount)}</span>
                            <span className="text-green-600 mx-1">/ {fmtCurr(b.paid_amount)}</span>
                            <span className={b.balance > 0 ? "text-red-600" : "text-green-600"}>/ {fmtCurr(b.balance)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {(expanded.has(b.id)) && (
                      <div className="border-t px-4 pb-4 print:block">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Payment History</div>
                        {b.payments.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No payments recorded.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-xs text-muted-foreground">
                                <th className="text-left py-1.5 pr-4">Date</th>
                                <th className="text-left py-1.5 pr-4">Mode</th>
                                <th className="text-left py-1.5 pr-4">Received By</th>
                                <th className="text-right py-1.5">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.payments.map((p: any, idx: number) => (
                                <tr key={p.id} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                                  <td className="py-1.5 pr-4">{fmtDate(p.payment_date)}</td>
                                  <td className="py-1.5 pr-4 capitalize">{p.mode || "—"}</td>
                                  <td className="py-1.5 pr-4 text-muted-foreground">{p.received_by || "—"}</td>
                                  <td className="py-1.5 text-right font-medium text-green-700">{fmtCurr(p.amount)}</td>
                                </tr>
                              ))}
                              <tr className="border-t font-semibold bg-muted/30">
                                <td colSpan={3} className="py-2 text-right pr-4">Total Paid</td>
                                <td className="py-2 text-right text-green-700">{fmtCurr(b.paid_amount)}</td>
                              </tr>
                              {b.balance > 0 && (
                                <tr className="font-semibold">
                                  <td colSpan={3} className="py-1 text-right pr-4 text-red-600">Balance Due</td>
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

        {!ledger && !loadingLedger && (
          <div className="text-center py-16 text-muted-foreground">
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p>Search for a customer above to view their ledger</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
