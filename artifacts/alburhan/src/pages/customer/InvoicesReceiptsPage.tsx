import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileText, Download, Receipt, AlertCircle, CheckCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

export default function InvoicesReceiptsPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/invoices");
  const bookingNumber = params?.bookingNumber;
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingNumber) return;
    Promise.all([
      fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" }),
      fetch(`${API}/api/customer/bookings/${bookingNumber}/finance`, { credentials: "include" }),
    ]).then(async ([bkRes, finRes]) => {
      if (bkRes.ok) { const d = await bkRes.json(); setBookingId(d.booking?.id); }
      if (finRes.ok) { const d = await finRes.json(); if (d.ok) setData(d); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [bookingNumber]);

  async function downloadInvoice() {
    if (!bookingId) return;
    setDownloading("invoice");
    try {
      const r = await fetch(`${API}/api/bookings/${bookingId}/invoice`, { credentials: "include" });
      if (!r.ok) throw new Error("Not available");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `invoice-${bookingNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Invoice not available", description: "Please contact us for your invoice.", variant: "destructive" });
    } finally { setDownloading(null); }
  }

  async function downloadReceipt() {
    if (!bookingId) return;
    setDownloading("receipt");
    try {
      const r = await fetch(`${API}/api/payments/receipt-pdf/${bookingId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not available");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `receipt-${bookingNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Receipt not available", description: "No payments on file yet.", variant: "destructive" });
    } finally { setDownloading(null); }
  }

  const inv = data?.invoice;
  const receipts = data?.receipts || [];

  function invStatusColor(s: string) {
    if (s === "paid") return "bg-green-100 text-green-700";
    if (s === "overdue") return "bg-red-100 text-red-700";
    if (s === "partially_paid") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-600";
  }

  return (
    <CustomerPortalLayout title="Invoices & Receipts" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-4">
          {[1,2].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Invoice */}
          <Card className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Invoice</p>
                  {inv?.invoice_number && (
                    <p className="text-xs text-slate-400">#{inv.invoice_number}</p>
                  )}
                </div>
              </div>
              {inv && (
                <Badge className={invStatusColor(inv.status) + " capitalize text-xs"}>
                  {inv.status?.replace(/_/g, " ")}
                </Badge>
              )}
            </div>

            {inv ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Total Amount</p>
                    <p className="text-lg font-bold text-slate-800">{formatCurrency(inv.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Amount Paid</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(inv.paid_amount)}</p>
                  </div>
                  {inv.due_date && (
                    <div>
                      <p className="text-xs text-slate-400">Due Date</p>
                      <p className="text-sm font-medium text-slate-700">{formatDate(inv.due_date)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Balance</p>
                    <p className={`text-sm font-medium ${inv.total_amount - inv.paid_amount > 0 ? "text-red-600" : "text-green-600"}`}>
                      {inv.total_amount - inv.paid_amount > 0
                        ? formatCurrency(inv.total_amount - inv.paid_amount)
                        : "Fully paid ✓"}
                    </p>
                  </div>
                </div>
                {inv.notes && (
                  <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded">{inv.notes}</p>
                )}
                <Button size="sm" variant="outline" onClick={downloadInvoice}
                  disabled={downloading === "invoice"} className="h-8 text-xs mt-1">
                  <Download size={13} className="mr-1" />
                  {downloading === "invoice" ? "Downloading…" : "Download Invoice PDF"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">No invoice generated yet.</p>
            )}
          </Card>

          {/* Receipts */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <Receipt size={18} className="text-emerald-600" />
                </div>
                <p className="font-semibold text-slate-800">Receipts</p>
              </div>
              {bookingId && (
                <Button size="sm" variant="outline" onClick={downloadReceipt}
                  disabled={downloading === "receipt"} className="h-8 text-xs">
                  <Download size={13} className="mr-1" />
                  {downloading === "receipt" ? "…" : "Download"}
                </Button>
              )}
            </div>

            {receipts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No receipts yet.</p>
            ) : (
              <div className="space-y-2">
                {receipts.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        Receipt {r.receipt_number ? `#${r.receipt_number}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(r.created_at)}</p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-700 shrink-0">
                      {formatCurrency(r.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </CustomerPortalLayout>
  );
}
