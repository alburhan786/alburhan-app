import { useLocation } from "wouter";
import { X, User, Phone, Package, Hash, Clock, IndianRupee, Eye, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AdminNotification } from "@/hooks/useAdminNotifications";

const API = import.meta.env.VITE_API_URL || "";

interface Props {
  notif: AdminNotification;
  onDismiss: () => void;
}

function formatAmount(n: number | null | undefined) {
  if (!n) return "—";
  return "₹" + Number(n).toLocaleString("en-IN");
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "booking_new": return "New Booking";
    case "booking_approved": return "Booking Approved";
    case "booking_rejected": return "Booking Rejected";
    case "booking_cancelled": return "Booking Cancelled";
    case "payment_received": return "Payment Received";
    default: return "Notification";
  }
}

function typeColor(type: string) {
  switch (type) {
    case "booking_new": return "bg-emerald-500";
    case "booking_approved": return "bg-blue-500";
    case "booking_rejected": return "bg-red-500";
    case "booking_cancelled": return "bg-orange-500";
    case "payment_received": return "bg-purple-500";
    default: return "bg-gray-500";
  }
}

export function BookingNotificationPopup({ notif, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const b = notif.body;

  async function handleApprove() {
    if (!b.bookingId) return;
    try {
      await fetch(`${API}/api/bookings/${b.bookingId}/approve`, {
        method: "POST",
        credentials: "include",
      });
    } catch { /* ignore */ }
    onDismiss();
    navigate(`/admin/bookings`);
  }

  async function handleReject() {
    if (!b.bookingId) return;
    try {
      await fetch(`${API}/api/bookings/${b.bookingId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected from notification" }),
      });
    } catch { /* ignore */ }
    onDismiss();
  }

  function handleView() {
    onDismiss();
    navigate(`/admin/bookings`);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[360px] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className={`${typeColor(notif.type)} px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            <span className="text-white font-semibold text-sm">{typeLabel(notif.type)}</span>
          </div>
          <button onClick={onDismiss} className="text-white/80 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2">
          {b.customerName && (
            <div className="flex items-center gap-2 text-sm">
              <User size={14} className="text-gray-400 shrink-0" />
              <span className="font-medium text-gray-900">{b.customerName}</span>
            </div>
          )}
          {b.customerMobile && (
            <div className="flex items-center gap-2 text-sm">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <span className="text-gray-600">{b.customerMobile}</span>
            </div>
          )}
          {b.packageName && (
            <div className="flex items-center gap-2 text-sm">
              <Package size={14} className="text-gray-400 shrink-0" />
              <span className="text-gray-600 truncate">{b.packageName}</span>
            </div>
          )}
          {b.bookingNumber && (
            <div className="flex items-center gap-2 text-sm">
              <Hash size={14} className="text-gray-400 shrink-0" />
              <span className="text-gray-600 font-mono">{b.bookingNumber}</span>
            </div>
          )}
          {(b.finalAmount || b.amount) && (
            <div className="flex items-center gap-2 text-sm">
              <IndianRupee size={14} className="text-gray-400 shrink-0" />
              <span className="text-gray-700 font-semibold">
                {b.amount ? `₹${b.amount}` : formatAmount(b.finalAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12} />
            <span>{formatTime(notif.createdAt)}</span>
          </div>
          {b.reason && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
              Reason: {b.reason}
            </div>
          )}
        </div>

        {/* Actions */}
        {notif.type === "booking_new" && (
          <div className="px-4 pb-3 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleView}>
              <Eye size={13} className="mr-1" /> View
            </Button>
            <Button size="sm" className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove}>
              <CheckCircle size={13} className="mr-1" /> Approve
            </Button>
            <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={handleReject}>
              <XCircle size={13} className="mr-1" /> Reject
            </Button>
          </div>
        )}
        {notif.type !== "booking_new" && (
          <div className="px-4 pb-3">
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleView}>
              <Eye size={13} className="mr-1" /> View Booking
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
