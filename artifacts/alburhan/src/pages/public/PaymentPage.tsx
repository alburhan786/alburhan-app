import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

declare global {
  interface Window { Razorpay: new (opts: object) => { open(): void; on(event: string, cb: (r: any) => void): void }; }
}

type PaymentEntry = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  referenceNumber?: string | null;
  notes?: string | null;
};

type PageData = {
  id: string;
  bookingNumber: string;
  customerName: string;
  packageName: string | null;
  status: string;
  totalAmount: number | null;
  finalAmount: number | null;
  paidAmount: number;
  remainingAmount: number | null;
  invoiceNumber: string | null;
  createdAt: string;
  paymentHistory: PaymentEntry[];
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash", neft: "NEFT", upi: "UPI", cheque: "Cheque", online: "Online",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  confirmed:      { label: "Confirmed & Paid", bg: "bg-emerald-100", text: "text-emerald-800" },
  partially_paid: { label: "Partial Payment",  bg: "bg-amber-100",   text: "text-amber-800" },
  approved:       { label: "Approved",          bg: "bg-blue-100",    text: "text-blue-800" },
  pending:        { label: "Pending Review",    bg: "bg-gray-100",    text: "text-gray-700" },
  rejected:       { label: "Rejected",          bg: "bg-red-100",     text: "text-red-800" },
};

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function PaymentPage() {
  const params = useParams<{ bookingNumber: string }>();
  const bookingNumber = params.bookingNumber;

  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const sdkLoadedRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery<PageData>({
    queryKey: ["payment-page", bookingNumber],
    queryFn: () =>
      fetch(`${API}/api/bookings/by-number/${bookingNumber}/payment-page`)
        .then(r => { if (!r.ok) return r.json().then((e: { message?: string }) => { throw new Error(e.message || "Not found"); }); return r.json(); }),
    enabled: !!bookingNumber,
    retry: 1,
  });

  useEffect(() => {
    loadRazorpayScript().then(ok => { sdkLoadedRef.current = ok; });
  }, []);

  async function handlePayNow() {
    if (!data) return;
    if (!sdkLoadedRef.current) {
      const ok = await loadRazorpayScript();
      if (!ok) { setPayError("Payment gateway failed to load. Please try again."); return; }
      sdkLoadedRef.current = true;
    }

    setPaying(true);
    setPayError(null);

    try {
      const res = await fetch(`${API}/api/payments/by-number/${bookingNumber}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const order = (await res.json()) as {
        orderId?: string; amount?: number; currency?: string;
        razorpayKeyId?: string; bookingId?: string;
        customerName?: string; customerMobile?: string; message?: string;
      };
      if (!res.ok) throw new Error(order.message || "Failed to initialize payment");
      if (!order.orderId || !order.razorpayKeyId) throw new Error("Invalid payment order response");

      const opts = {
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Al Burhan Tours & Travels",
        description: `Booking #${bookingNumber}`,
        image: `${BASE}images/logo.png`,
        order_id: order.orderId,
        prefill: {
          name: order.customerName ?? data.customerName,
          contact: order.customerMobile,
        },
        theme: { color: "#0B3D2E" },
        modal: {
          ondismiss: () => setPaying(false),
        },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const vRes = await fetch(`${API}/api/payments/verify-public`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                bookingId: order.bookingId,
              }),
            });
            if (!vRes.ok) {
              const vData = (await vRes.json()) as { message?: string };
              throw new Error(vData.message || "Payment verification failed");
            }
            setPaySuccess(true);
            setPaying(false);
            setTimeout(() => refetch(), 2000);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Verification failed";
            setPayError(msg);
            setPaying(false);
          }
        },
      };

      const rzp = new window.Razorpay(opts);
      rzp.on("payment.failed", (response: any) => {
        const desc = response?.error?.description || "Payment failed. Please try again.";
        setPayError(desc);
        setPaying(false);
      });
      rzp.open();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment initialization failed";
      setPayError(msg);
      setPaying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#0B3D2E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading payment details…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h2 className="text-lg font-bold text-gray-900">Booking Not Found</h2>
          <p className="text-sm text-gray-500">
            {error instanceof Error ? error.message : "Please check your booking reference and try again."}
          </p>
          <p className="text-xs text-gray-400">
            Need help? Call +91 9893989786 or +91 8989701701
          </p>
        </div>
      </div>
    );
  }

  const { finalAmount, paidAmount, remainingAmount, status, invoiceNumber, paymentHistory } = data;
  const pct = finalAmount && finalAmount > 0 ? Math.min(100, Math.round((paidAmount / finalAmount) * 100)) : 0;
  const statusCfg = STATUS_CONFIG[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
  const canPay = remainingAmount != null && remainingAmount > 0 && (status === "approved" || status === "partially_paid");

  return (
    <div className="min-h-screen bg-[#F7F5F0] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header / Branding */}
        <div className="text-center mb-2">
          <img src={`${BASE}images/logo.png`} alt="Al Burhan" className="h-10 mx-auto mb-2" />
          <div className="text-lg font-bold tracking-widest text-[#0B3D2E] uppercase font-serif">Al Burhan Tours & Travels</div>
          <div className="text-xs text-[#C9A23F] tracking-[0.2em] font-semibold uppercase">Burhanpur · M.P.</div>
        </div>

        {paySuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <div className="text-lg font-bold text-emerald-800">Payment Successful!</div>
            <p className="text-sm text-emerald-700">Your payment has been received. Your booking is being confirmed.</p>
            <p className="text-xs text-emerald-600">Jazak Allah Khair! — Al Burhan Tours & Travels</p>
          </div>
        )}

        {/* Booking Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Booking</p>
              <p className="font-mono font-bold text-[#0B3D2E] text-lg">{data.bookingNumber}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{data.customerName}</p>
              {data.packageName && <p className="text-xs text-gray-500 mt-0.5">{data.packageName}</p>}
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Progress bar */}
          {finalAmount != null && finalAmount > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500 font-medium">
                <span>Payment Progress</span>
                <span>{pct}% paid</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-[#0B3D2E]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Total</p>
                  <p className="font-mono font-bold text-sm text-gray-900">{fmt(finalAmount)}</p>
                </div>
                <div className="text-center border-x border-gray-100">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Paid</p>
                  <p className="font-mono font-bold text-sm text-emerald-700">{fmt(paidAmount)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">
                    {remainingAmount === 0 ? "Done" : "Balance"}
                  </p>
                  <p className={`font-mono font-bold text-sm ${remainingAmount === 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {remainingAmount != null ? (remainingAmount === 0 ? "Paid ✓" : fmt(remainingAmount)) : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pay Now button */}
        {canPay && !paySuccess && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Pay Remaining Balance</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Click below to pay <span className="font-semibold text-[#0B3D2E]">{fmt(remainingAmount!)}</span> securely via Razorpay
              </p>
            </div>

            {payError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                {payError}
              </div>
            )}

            <button
              onClick={handlePayNow}
              disabled={paying}
              className="w-full bg-[#0B3D2E] hover:bg-[#0d5038] disabled:bg-[#B0C8C0] text-white font-bold py-4 px-6 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
            >
              {paying ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Processing…
                </>
              ) : (
                <>💳 Pay {fmt(remainingAmount!)} Securely</>
              )}
            </button>
            <p className="text-center text-[10px] text-gray-400">
              🔒 Secured by Razorpay · 256-bit SSL encryption
            </p>
          </div>
        )}

        {/* Invoice download */}
        {status === "confirmed" && invoiceNumber && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Tax Invoice</p>
              <p className="text-xs text-emerald-700 font-mono mt-0.5">#{invoiceNumber}</p>
            </div>
            <a
              href={`${BASE}invoice/${data.bookingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              View Invoice
            </a>
          </div>
        )}

        {/* Payment History */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">Payment History</p>
          </div>
          {paymentHistory.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-gray-400">
              No payments recorded yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide">Mode</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paymentHistory.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-600">{entry.paymentDate}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                        {MODE_LABELS[entry.paymentMode] ?? entry.paymentMode}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700 text-xs">
                      {fmt(entry.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 hidden sm:table-cell truncate max-w-[100px]">
                      {entry.referenceNumber || entry.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-400 space-y-0.5 pb-4">
          <p>Al Burhan Tours & Travels · Burhanpur, Madhya Pradesh</p>
          <p>+91 9893989786 · +91 8989701701</p>
          <p className="text-[9px] text-gray-300 mt-1">Booking #{data.bookingNumber}</p>
        </div>

      </div>
    </div>
  );
}
