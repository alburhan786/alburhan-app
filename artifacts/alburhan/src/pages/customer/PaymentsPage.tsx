import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CreditCard, Download, IndianRupee, CheckCircle,
  Clock, AlertCircle, ArrowUpRight, Banknote
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function txModeIcon(mode: string) {
  if (mode === "cash") return <Banknote size={14} className="text-green-500" />;
  if (mode?.includes("online") || mode?.includes("razorpay")) return <CreditCard size={14} className="text-blue-500" />;
  return <IndianRupee size={14} className="text-slate-400" />;
}

export default function PaymentsPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/payments");
  const bookingNumber = params?.bookingNumber;
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

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

  async function downloadReceipt() {
    if (!bookingId) return;
    setDownloading(true);
    try {
      const r = await fetch(`${API}/api/payments/receipt-pdf/${bookingId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `receipt-${bookingNumber}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Receipt not available", description: "No payments on file yet.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  const inv = data?.invoice;
  const txs = data?.transactions || [];
  const pct = inv?.total_amount > 0
    ? Math.min(100, Math.round((inv.paid_amount / inv.total_amount) * 100)) : 0;

  return (
    <CustomerPortalLayout title="Payments" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary card */}
          {inv && (
            <Card className="p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Payment Status</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {formatCurrency(inv.paid_amount)}
                  </p>
                  <p className="text-sm text-slate-500">of {formatCurrency(inv.total_amount)} total</p>
                </div>
                <Badge className={
                  pct === 100 ? "bg-green-100 text-green-700" :
                  pct > 0     ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }>
                  {pct === 100 ? "Fully Paid" : pct > 0 ? `${pct}% Paid` : "Unpaid"}
                </Badge>
              </div>

              <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-amber-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {inv.total_amount - inv.paid_amount > 0 && (
                <p className="text-xs text-slate-500">
                  Balance due: <span className="font-semibold text-red-600">
                    {formatCurrency(inv.total_amount - inv.paid_amount)}
                  </span>
                </p>
              )}

              {bookingId && (
                <Button size="sm" variant="outline" onClick={downloadReceipt}
                  disabled={downloading} className="mt-4 h-8 text-xs">
                  <Download size={13} className="mr-1" />
                  {downloading ? "Downloading…" : "Download Receipt"}
                </Button>
              )}
            </Card>
          )}

          {/* Transaction history */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Payment History</h3>
            {txs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {txs.map((tx: any) => (
                  <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="p-2 rounded-full bg-white border border-slate-200">
                      {txModeIcon(tx.payment_mode)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 capitalize">
                        {(tx.payment_mode || "Payment").replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-slate-400">
                        {tx.payment_date || formatDate(tx.created_at)}
                        {tx.notes ? ` · ${tx.notes}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-emerald-700">
                        +{formatCurrency(tx.amount)}
                      </p>
                      <Badge className="text-[10px] capitalize bg-green-100 text-green-700">
                        {tx.status || "recorded"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Refunds */}
          {data?.refunds?.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Refunds</h3>
              <div className="space-y-3">
                {data.refunds.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <ArrowUpRight size={18} className="text-red-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{r.reason || "Refund"}</p>
                      <p className="text-xs text-slate-400">{formatDate(r.created_at)}</p>
                    </div>
                    <p className="text-sm font-semibold text-red-600">−{formatCurrency(r.amount)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </CustomerPortalLayout>
  );
}
