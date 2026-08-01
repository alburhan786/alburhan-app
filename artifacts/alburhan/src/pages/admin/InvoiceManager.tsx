import { useState, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useSendInvoiceNotification } from "@workspace/api-client-react";
import type { Booking as _Booking } from "@workspace/api-client-react";

type Booking = _Booking & {
  paidAmount?: number;
  discountAmount?: number;
  discountPercentage?: number;
  netAmount?: number;
  gstAmount?: number;
  tcsAmount?: number;
  gstIncluded?: boolean;
  gstRate?: number;
  tcsEnabled?: boolean;
  tcsRate?: number;
};
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  Eye, Download, Printer, Mail, MessageCircle,
  RefreshCw, MoreHorizontal, Search, FileText,
  CheckCircle, Clock, AlertCircle, Zap, Activity, XCircle
} from "lucide-react";
import { downloadPdf } from "@/lib/pdf-download";

const API = import.meta.env.VITE_API_URL || "";

type PaymentFilter = "all" | "paid" | "partial" | "pending";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  try { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); }
  catch { return s; }
}

function paymentStatus(b: Booking): "paid" | "partial" | "pending" {
  const paid = b.paidAmount || b.advanceAmount || 0;
  const total = b.finalAmount || b.totalAmount || 0;
  if (b.paymentStatus === "paid" || b.status === "confirmed") return "paid";
  if (paid > 0 && total > 0 && paid < total) return "partial";
  if (paid > 0) return "partial";
  return "pending";
}

function numberToWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function c99(x: number) {
    if (x < 20) return ones[x];
    return tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
  }
  if (n <= 0) return "Zero Rupees";
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const lk = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  const hd = Math.floor(n / 100);
  const rm = n % 100;
  let r = "";
  if (cr) r += c99(cr) + " Crore ";
  if (lk) r += c99(lk) + " Lakh ";
  if (th) r += c99(th) + " Thousand ";
  if (hd) r += ones[hd] + " Hundred ";
  if (rm) r += (r ? "and " : "") + c99(rm);
  return r.trim() + " Rupees Only";
}

function InvoiceDoc({ booking, invoiceNumber }: { booking: Booking; invoiceNumber: string }) {
  const DARK_GREEN = "#0B3D2E";
  const GOLD = "#C9A23F";

  const packagePrice = booking.totalAmount || 0;
  const discountAmount = booking.discountAmount || 0;
  const netAmount = booking.netAmount || (packagePrice - discountAmount);
  const gstAmount = booking.gstAmount || 0;
  const tcsAmount = booking.tcsAmount || 0;
  const finalAmount = booking.finalAmount || packagePrice;
  const paidAmount = booking.paidAmount || booking.advanceAmount || 0;
  const balance = Math.max(0, finalAmount - paidAmount);
  const gstIncluded = booking.gstIncluded || false;
  const gstRate = booking.gstRate || 5;
  const tcsEnabled = booking.tcsEnabled || false;
  const tcsRate = booking.tcsRate || 2;

  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  const invoiceUrl = `https://alburhantravels.com/invoice/${booking.bookingNumber}`;

  return (
    <div className="bg-white text-black" style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "12px" }}>
      <div style={{ border: `2px solid ${DARK_GREEN}` }}>

        {/* HEADER */}
        <div style={{ padding: "8px 16px", borderBottom: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" style={{ height: 48 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: DARK_GREEN }}>ALBURHAN TOURS &amp; TRAVELS</div>
              <div style={{ fontSize: 9, color: GOLD }}>Hajj • Umrah • Ziyarat Tours • 35+ Years Experience</div>
              <div style={{ fontSize: 9, color: "#555" }}>Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P.</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: DARK_GREEN }}>TAX INVOICE</div>
            <div style={{ fontSize: 9, color: GOLD, marginTop: 2 }}>ORIGINAL FOR RECIPIENT</div>
          </div>
        </div>

        {/* META SECTION */}
        <div style={{ display: "flex", borderBottom: `1px solid ${DARK_GREEN}` }}>
          <div style={{ width: "45%", padding: "10px 12px", borderRight: `1px solid ${DARK_GREEN}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DARK_GREEN, marginBottom: 4 }}>BILL TO</div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{booking.customerName}</div>
            <div style={{ fontSize: 11 }}>Mobile: {booking.customerMobile}</div>
            {booking.customerEmail && <div style={{ fontSize: 11 }}>Email: {booking.customerEmail}</div>}
            <div style={{ fontSize: 11, marginTop: 4 }}>No. of Pilgrims: {booking.numberOfPilgrims}</div>
          </div>
          <div style={{ width: "30%", padding: "10px 12px", borderRight: `1px solid ${DARK_GREEN}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DARK_GREEN, marginBottom: 4 }}>COMPANY</div>
            <div style={{ fontSize: 10 }}>Tel: +91 9893225590 | +91 9893989786</div>
            <div style={{ fontSize: 10 }}>Email: alburhantravels@gmail.com</div>
            <div style={{ fontSize: 10 }}>GSTIN: 23AAGCA3205D1ZP</div>
          </div>
          <div style={{ width: "25%", padding: "10px 12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 4px", color: "#555" }}>Invoice No</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{invoiceNumber}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px", color: "#555" }}>Booking</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{booking.bookingNumber}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px", color: "#555" }}>Date</td>
                  <td style={{ padding: "2px 4px" }}>{fmtDate(booking.createdAt)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 4px", color: "#555" }}>Status</td>
                  <td style={{ padding: "2px 4px" }}>
                    <span style={{
                      background: paidAmount >= finalAmount ? "#D4EDDA" : (paidAmount > 0 ? "#FFF3CD" : "#F8D7DA"),
                      color: paidAmount >= finalAmount ? "#155724" : (paidAmount > 0 ? "#856404" : "#721C24"),
                      padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700
                    }}>
                      {paidAmount >= finalAmount ? "PAID" : (paidAmount > 0 ? "PARTIAL" : "PENDING")}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* PACKAGE TABLE */}
        <div style={{ borderBottom: `1px solid ${DARK_GREEN}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: DARK_GREEN, color: "white" }}>
                <th style={{ padding: "6px 12px", textAlign: "left" }}>Description</th>
                <th style={{ padding: "6px 12px", textAlign: "center" }}>Qty (Pilgrims)</th>
                <th style={{ padding: "6px 12px", textAlign: "right" }}>Rate/Person</th>
                <th style={{ padding: "6px 12px", textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid #e5e7eb` }}>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ fontWeight: 600 }}>{booking.packageName || "Travel Package"}</div>
                  {booking.roomType && <div style={{ fontSize: 10, color: "#555" }}>Room: {booking.roomType}</div>}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>{booking.numberOfPilgrims}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace" }}>
                  ₹{fmt(booking.numberOfPilgrims > 0 ? packagePrice / booking.numberOfPilgrims : packagePrice)}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(packagePrice)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* CALCULATION SUMMARY */}
        <div style={{ display: "flex", borderBottom: `1px solid ${DARK_GREEN}` }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRight: `1px solid ${DARK_GREEN}`, fontSize: 10, color: "#555" }}>
            <div style={{ fontWeight: 700, color: DARK_GREEN, marginBottom: 4 }}>PAYMENT LEDGER</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Grand Total:</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>₹{fmt(finalAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Amount Paid:</span><span style={{ fontFamily: "monospace", color: "#155724" }}>₹{fmt(paidAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", marginTop: 4, paddingTop: 4 }}>
              <span>Balance Due:</span><span style={{ fontFamily: "monospace", color: balance > 0 ? "#721C24" : "#155724" }}>₹{fmt(balance)}</span>
            </div>
          </div>
          <div style={{ width: "40%", padding: "10px 12px" }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 0", color: "#555" }}>Package Price</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(packagePrice)}</td>
                </tr>
                {discountAmount > 0 && (
                  <tr>
                    <td style={{ padding: "2px 0", color: "#555" }}>
                      Discount{booking.discountPercentage ? ` (${booking.discountPercentage}%)` : ""}
                    </td>
                    <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace", color: "#155724" }}>−₹{fmt(discountAmount)}</td>
                  </tr>
                )}
                {discountAmount > 0 && (
                  <tr>
                    <td style={{ padding: "2px 0", color: "#555" }}>Net Package</td>
                    <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(netAmount)}</td>
                  </tr>
                )}
                {gstAmount > 0 && (
                  <>
                    <tr>
                      <td style={{ padding: "2px 0", color: "#555" }}>CGST @{gstRate / 2}%{gstIncluded ? " (Incl.)" : ""}</td>
                      <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(cgst)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "2px 0", color: "#555" }}>SGST @{gstRate / 2}%{gstIncluded ? " (Incl.)" : ""}</td>
                      <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(sgst)}</td>
                    </tr>
                  </>
                )}
                {tcsEnabled && tcsAmount > 0 && (
                  <tr>
                    <td style={{ padding: "2px 0", color: "#555" }}>TCS @{tcsRate}%</td>
                    <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>₹{fmt(tcsAmount)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: `2px solid ${DARK_GREEN}`, fontWeight: 700, fontSize: 14 }}>
                  <td style={{ padding: "4px 0", color: DARK_GREEN }}>GRAND TOTAL</td>
                  <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", color: DARK_GREEN }}>₹{fmt(finalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* AMOUNT IN WORDS */}
        <div style={{ padding: "6px 12px", background: "#f9fafb", borderBottom: `1px solid ${DARK_GREEN}`, fontSize: 11 }}>
          <span style={{ fontWeight: 600 }}>Amount in Words: </span>
          <span>{numberToWords(Math.round(finalAmount))}</span>
        </div>

        {/* BANK DETAILS + QR */}
        <div style={{ display: "flex", borderBottom: `1px solid ${DARK_GREEN}` }}>
          <div style={{ flex: 1, padding: "8px 12px", borderRight: `1px solid ${DARK_GREEN}`, fontSize: 10 }}>
            <div style={{ fontWeight: 700, color: DARK_GREEN, marginBottom: 4 }}>BANK DETAILS</div>
            <div>Account Name: AL BURHAN TOURS &amp; TRAVELS</div>
            <div>Bank: Bank of India</div>
            <div>A/C No: 678010100014014</div>
            <div>IFSC: BKID0006780</div>
            <div>Branch: Burhanpur, M.P.</div>
          </div>
          <div style={{ padding: "8px 12px", textAlign: "center", fontSize: 10 }}>
            <div style={{ fontWeight: 700, color: DARK_GREEN, marginBottom: 4 }}>VERIFY INVOICE</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(invoiceUrl)}`} alt="QR" style={{ width: 80, height: 80 }} />
            <div style={{ fontSize: 8, marginTop: 2 }}>Scan to verify</div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ padding: "6px 12px", textAlign: "center", fontSize: 9, color: "#666" }}>
          This is a computer-generated invoice. For queries contact: +91 9893225590 | alburhantravels@gmail.com
        </div>
      </div>
    </div>
  );
}

function InvoiceViewDialog({
  booking,
  invoiceNumber,
  onClose,
}: {
  booking: Booking;
  invoiceNumber: string;
  onClose: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleDownload = async () => {
    toast({ title: "Generating PDF...", description: "Please wait" });
    await new Promise(r => setTimeout(r, 200));
    await downloadPdf(previewRef.current, {
      filename: `Invoice-${invoiceNumber || booking.bookingNumber}.pdf`,
      orientation: "portrait",
      margin: 5,
    });
  };

  const handlePrint = () => {
    const win = window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        setTimeout(() => win.print(), 500);
      });
    }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between pr-6">
          <span className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0B3D2E]" />
            Invoice — {invoiceNumber || "Generating..."}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1" />PDF
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, "_blank")}>
              <Eye className="w-4 h-4 mr-1" />Full Page
            </Button>
          </div>
        </DialogTitle>
      </DialogHeader>
      <div ref={previewRef}>
        <InvoiceDoc booking={booking} invoiceNumber={invoiceNumber} />
      </div>
    </DialogContent>
  );
}

function PaymentBadge({ booking }: { booking: Booking }) {
  const s = paymentStatus(booking);
  if (s === "paid") return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-bold uppercase">Paid</Badge>;
  if (s === "partial") return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-bold uppercase">Partial</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-bold uppercase">Pending</Badge>;
}

type NotifLog = {
  id: string; channel: string; event_type: string; status: string;
  recipient: string; sent_at: string; retry_count: number; provider_name?: string;
  provider_response?: Record<string, unknown>;
};

function channelIcon(ch: string) {
  if (ch === "whatsapp") return <MessageCircle className="w-3.5 h-3.5 text-green-600" />;
  if (ch === "email")    return <Mail className="w-3.5 h-3.5 text-blue-500" />;
  if (ch === "sms")      return <Activity className="w-3.5 h-3.5 text-orange-500" />;
  return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
}

function DeliveryLogDialog({ booking, onClose, onResend }: { booking: Booking; onClose: () => void; onResend: () => void }) {
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const { toast } = useToast();
  const sendMutation = useSendInvoiceNotification();

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/bookings/${booking.id}/notification-logs`, { credentials: "include" });
      const d = await r.json();
      setLogs(d.logs || []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useState(() => { refresh(); });

  const handleResend = async () => {
    setResending(true);
    try {
      const result = await sendMutation.mutateAsync({ id: booking.id });
      toast({ title: "Sent", description: `WhatsApp: ${result.whatsapp ? "✓" : "✗"} | SMS: ${result.sms ? "✓" : "✗"}` });
      onResend();
      await refresh();
    } catch {
      toast({ title: "Error", description: "Failed to resend", variant: "destructive" });
    } finally { setResending(false); }
  };

  const sentChannels = new Set(logs.filter(l => l.status === "sent").map(l => l.channel));
  const failedChannels = new Set(logs.filter(l => l.status === "failed").map(l => l.channel));

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#0B3D2E]" />
          Notification Delivery — {booking.bookingNumber}
        </DialogTitle>
      </DialogHeader>

      {/* Channel summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {["whatsapp", "email", "sms"].map(ch => {
          const ok = sentChannels.has(ch);
          const fail = failedChannels.has(ch);
          return (
            <div key={ch} className={`rounded-xl border p-3 flex items-center gap-2 ${ok ? "border-emerald-200 bg-emerald-50" : fail ? "border-red-200 bg-red-50" : "border-border bg-muted/20"}`}>
              {channelIcon(ch)}
              <div>
                <div className="text-xs font-semibold capitalize">{ch}</div>
                <div className={`text-[10px] font-bold ${ok ? "text-emerald-700" : fail ? "text-red-600" : "text-muted-foreground"}`}>
                  {ok ? "Delivered" : fail ? "Failed" : "No record"}
                </div>
              </div>
              {ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 ml-auto" /> : fail ? <XCircle className="w-3.5 h-3.5 text-red-500 ml-auto" /> : null}
            </div>
          );
        })}
      </div>

      {/* Log table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted text-muted-foreground uppercase font-semibold">
            <tr>
              <th className="px-3 py-2">Channel</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Loading logs…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No notification logs found for this booking.</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium capitalize flex items-center gap-1.5">{channelIcon(log.channel)}{log.channel}</td>
                <td className="px-3 py-2 text-muted-foreground">{log.event_type?.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${log.status === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                    {log.status === "sent" ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                    {log.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">{log.recipient}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {log.sent_at ? new Date(log.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 gap-3">
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button
            size="sm"
            onClick={handleResend}
            disabled={resending || sendMutation.isPending}
            className="bg-[#0B3D2E] hover:bg-[#0B3D2E]/90 text-white gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {resending ? "Sending…" : "Resend WhatsApp + SMS"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function ActionMenu({
  booking,
  invoiceNumber,
  onView,
  onRegenerate,
  onDeliveryStatus,
}: {
  booking: Booking;
  invoiceNumber: string;
  onView: () => void;
  onRegenerate: (newInvNum: string) => void;
  onDeliveryStatus: () => void;
}) {
  const { toast } = useToast();
  const sendMutation = useSendInvoiceNotification();
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const r = await fetch(`${API}/api/invoices/${booking.id}/regenerate`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      const newNum = data.invoice?.invoice_number || invoiceNumber;
      onRegenerate(newNum);
      toast({ title: "Invoice regenerated", description: newNum });
    } catch {
      toast({ title: "Error", description: "Failed to regenerate invoice", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const handleSendWhatsApp = async () => {
    try {
      const result = await sendMutation.mutateAsync({ id: booking.id });
      toast({
        title: "Sent via WhatsApp/SMS",
        description: `WhatsApp: ${result.whatsapp ? "✓" : "✗"} | SMS: ${result.sms ? "✓" : "✗"}`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to send notification", variant: "destructive" });
    }
  };

  const handleSendEmail = () => {
    const url = `https://alburhantravels.com/invoice/${booking.bookingNumber}`;
    const subject = encodeURIComponent(`Invoice ${invoiceNumber} – Al Burhan Tours & Travels`);
    const body = encodeURIComponent(`Dear ${booking.customerName},\n\nPlease find your invoice at:\n${url}\n\nJazak Allah Khair,\nAl Burhan Tours & Travels`);
    const mail = booking.customerEmail
      ? `mailto:${booking.customerEmail}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
    window.open(mail);
  };

  const handlePrint = () => {
    const win = window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, "_blank");
    if (win) {
      win.addEventListener("load", () => setTimeout(() => win.print(), 600));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onView} className="cursor-pointer">
          <Eye className="w-4 h-4 mr-2 text-blue-600" />View Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint} className="cursor-pointer">
          <Printer className="w-4 h-4 mr-2 text-gray-600" />Print Invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSendWhatsApp} disabled={sendMutation.isPending} className="cursor-pointer">
          <MessageCircle className="w-4 h-4 mr-2 text-green-600" />Send WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSendEmail} className="cursor-pointer">
          <Mail className="w-4 h-4 mr-2 text-blue-500" />Send Email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleRegenerate} disabled={regenerating} className="cursor-pointer">
          <RefreshCw className={`w-4 h-4 mr-2 text-orange-500 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Regenerating..." : "Regenerate Invoice"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDeliveryStatus} className="cursor-pointer">
          <Activity className="w-4 h-4 mr-2 text-[#0B3D2E]" />Delivery Status
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function InvoiceManager() {
  const { data, isLoading, refetch } = useListBookings();
  const allBookings: Booking[] = data?.bookings || [];
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [search, setSearch] = useState("");
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const [deliveryBooking, setDeliveryBooking] = useState<Booking | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});
  const [generatingAll, setGeneratingAll] = useState(false);

  const getInvoiceNumber = useCallback((booking: Booking) => {
    return invoiceNumbers[booking.id] || booking.invoiceNumber || "";
  }, [invoiceNumbers]);

  const handleRegenerate = useCallback((bookingId: string, newNum: string) => {
    setInvoiceNumbers(prev => ({ ...prev, [bookingId]: newNum }));
    queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
  }, [queryClient]);

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    try {
      const r = await fetch(`${API}/api/invoices/generate-all`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      toast({ title: "Invoices Generated", description: data.message });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch {
      toast({ title: "Error", description: "Failed to generate invoices", variant: "destructive" });
    } finally {
      setGeneratingAll(false);
    }
  };

  const filteredBookings = allBookings.filter(b => {
    if (filter !== "all" && paymentStatus(b) !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const inv = getInvoiceNumber(b).toLowerCase();
      return (
        b.customerName.toLowerCase().includes(q) ||
        b.bookingNumber.toLowerCase().includes(q) ||
        b.customerMobile.includes(q) ||
        inv.includes(q) ||
        (b.packageName || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const paidCount = allBookings.filter(b => paymentStatus(b) === "paid").length;
  const partialCount = allBookings.filter(b => paymentStatus(b) === "partial").length;
  const pendingCount = allBookings.filter(b => paymentStatus(b) === "pending").length;
  const totalRevenue = allBookings.reduce((s, b) => s + (b.finalAmount || b.totalAmount || 0), 0);
  const withoutInvoice = allBookings.filter(b => !getInvoiceNumber(b)).length;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Invoice & Billing</h1>
          <p className="text-muted-foreground mt-1">View, print, download, and send invoices for all bookings.</p>
        </div>
        {withoutInvoice > 0 && (
          <Button
            onClick={handleGenerateAll}
            disabled={generatingAll}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            <Zap className={`w-4 h-4 mr-2 ${generatingAll ? "animate-spin" : ""}`} />
            {generatingAll ? "Generating..." : `Generate ${withoutInvoice} Missing Invoice${withoutInvoice > 1 ? "s" : ""}`}
          </Button>
        )}
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />Paid
          </div>
          <div className="text-2xl font-bold text-emerald-700">{paidCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />Partial
          </div>
          <div className="text-2xl font-bold text-amber-700">{partialCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-semibold mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />Pending
          </div>
          <div className="text-2xl font-bold text-red-700">{pendingCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-[#0B3D2E]">{formatCurrency(totalRevenue)}</div>
        </Card>
      </div>

      {/* TABLE */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 flex flex-col md:flex-row gap-3 items-center border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, booking #, invoice #, mobile..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(["all", "paid", "partial", "pending"] as PaymentFilter[]).map(f => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "bg-[#0B3D2E] hover:bg-[#0B3D2E]/90 capitalize" : "capitalize"}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-5 py-4">Booking / Invoice</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Package</th>
                <th className="px-5 py-4 text-right">Amount</th>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading bookings...</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No bookings found</td></tr>
              ) : filteredBookings.map(booking => {
                const invNum = getInvoiceNumber(booking);
                return (
                  <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-mono font-bold text-primary text-xs">{booking.bookingNumber}</div>
                      {invNum ? (
                        <div className="font-mono text-xs text-emerald-700 mt-0.5">{invNum}</div>
                      ) : (
                        <div className="text-[10px] text-amber-600 mt-0.5 italic">No invoice</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">{formatDate(booking.createdAt)}</div>
                      {booking.isOffline && <Badge variant="outline" className="text-[9px] mt-1 px-1.5">Offline</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-bold text-sm">{booking.customerName}</div>
                      <div className="text-xs text-muted-foreground">{booking.customerMobile}</div>
                      {booking.customerEmail && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{booking.customerEmail}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-sm">{booking.packageName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{booking.numberOfPilgrims} Pilgrim(s)</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="font-mono font-bold text-sm">
                        {booking.finalAmount ? formatCurrency(booking.finalAmount) : "—"}
                      </div>
                      {(booking.paidAmount || booking.advanceAmount) ? (
                        <div className="text-xs text-emerald-700">
                          Paid: {formatCurrency(booking.paidAmount || booking.advanceAmount || 0)}
                        </div>
                      ) : null}
                      {booking.gstAmount ? (
                        <div className="text-xs text-muted-foreground">GST: {formatCurrency(booking.gstAmount)}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <PaymentBadge booking={booking} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 border-[#0B3D2E] text-[#0B3D2E] hover:bg-[#0B3D2E] hover:text-white"
                          onClick={() => setViewBooking(booking)}
                        >
                          <Eye className="w-3.5 h-3.5" />View
                        </Button>
                        <ActionMenu
                          booking={booking}
                          invoiceNumber={invNum}
                          onView={() => setViewBooking(booking)}
                          onRegenerate={(newNum) => handleRegenerate(booking.id, newNum)}
                          onDeliveryStatus={() => setDeliveryBooking(booking)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {viewBooking && (
        <Dialog open={!!viewBooking} onOpenChange={v => { if (!v) setViewBooking(null); }}>
          <InvoiceViewDialog
            booking={viewBooking}
            invoiceNumber={getInvoiceNumber(viewBooking)}
            onClose={() => setViewBooking(null)}
          />
        </Dialog>
      )}

      {deliveryBooking && (
        <Dialog open={!!deliveryBooking} onOpenChange={v => { if (!v) setDeliveryBooking(null); }}>
          <DeliveryLogDialog
            booking={deliveryBooking}
            onClose={() => setDeliveryBooking(null)}
            onResend={() => queryClient.invalidateQueries({ queryKey: ["/api/bookings"] })}
          />
        </Dialog>
      )}
    </AdminLayout>
  );
}
