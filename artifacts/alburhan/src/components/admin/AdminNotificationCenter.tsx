import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
  Bell, Check, Trash2, CheckCheck, X,
  CreditCard, FileText, Calendar, AlertTriangle,
  Plane, CheckCircle2, XCircle, Package,
} from "lucide-react";
import { type AdminNotification, type AdminNotifType } from "@/hooks/useAdminNotifications";

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: AdminNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
}

function TypeIcon({ type }: { type: AdminNotifType }) {
  const cls = "w-9 h-9 rounded-full flex items-center justify-center shrink-0";
  switch (type) {
    case "booking_new":
      return <div className={`${cls} bg-emerald-100`}><Calendar size={15} className="text-emerald-600" /></div>;
    case "booking_approved":
      return <div className={`${cls} bg-blue-100`}><CheckCircle2 size={15} className="text-blue-600" /></div>;
    case "booking_rejected":
      return <div className={`${cls} bg-red-100`}><XCircle size={15} className="text-red-600" /></div>;
    case "booking_cancelled":
      return <div className={`${cls} bg-orange-100`}><XCircle size={15} className="text-orange-600" /></div>;
    case "payment_received":
      return <div className={`${cls} bg-purple-100`}><CreditCard size={15} className="text-purple-600" /></div>;
    case "notification_failure":
      return <div className={`${cls} bg-amber-100`}><AlertTriangle size={15} className="text-amber-600" /></div>;
    case "invoice_generated":
      return <div className={`${cls} bg-indigo-100`}><FileText size={15} className="text-indigo-600" /></div>;
    case "visa_issued":
      return <div className={`${cls} bg-teal-100`}><Plane size={15} className="text-teal-600" /></div>;
    case "agreement_signed":
    case "agreement_ready":
      return <div className={`${cls} bg-green-100`}><FileText size={15} className="text-green-600" /></div>;
    default:
      return <div className={`${cls} bg-gray-100`}><Package size={15} className="text-gray-500" /></div>;
  }
}

function typeLabel(type: AdminNotifType): string {
  switch (type) {
    case "booking_new": return "New Booking";
    case "booking_approved": return "Approved";
    case "booking_rejected": return "Rejected";
    case "booking_cancelled": return "Cancelled";
    case "payment_received": return "Payment";
    case "notification_failure": return "Alert";
    case "invoice_generated": return "Invoice";
    case "visa_issued": return "Visa";
    case "agreement_signed": return "Agreement";
    case "agreement_ready": return "Agreement";
    default: return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

function typeColor(type: AdminNotifType): string {
  switch (type) {
    case "booking_new": return "text-emerald-700 bg-emerald-50 border border-emerald-200";
    case "booking_approved": return "text-blue-700 bg-blue-50 border border-blue-200";
    case "booking_rejected": return "text-red-700 bg-red-50 border border-red-200";
    case "booking_cancelled": return "text-orange-700 bg-orange-50 border border-orange-200";
    case "payment_received": return "text-purple-700 bg-purple-50 border border-purple-200";
    case "notification_failure": return "text-amber-700 bg-amber-50 border border-amber-200";
    case "invoice_generated": return "text-indigo-700 bg-indigo-50 border border-indigo-200";
    case "visa_issued": return "text-teal-700 bg-teal-50 border border-teal-200";
    case "agreement_signed":
    case "agreement_ready": return "text-green-700 bg-green-50 border border-green-200";
    default: return "text-gray-700 bg-gray-50 border border-gray-200";
  }
}

function notifNavPath(n: AdminNotification): string | null {
  if (n.bookingId) return `/admin/bookings/${n.bookingId}`;
  if (n.type === "notification_failure") return "/admin/notification-logs";
  return null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      return `${hrs}h ago · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return (
      d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

function notifSubtext(n: AdminNotification): string {
  const b = n.body;
  const parts: string[] = [];
  if (b.customerName) parts.push(b.customerName);
  if (b.bookingNumber) parts.push(`#${b.bookingNumber}`);
  if (b.packageName) parts.push(b.packageName);
  if (b.amount) parts.push(`₹${b.amount}`);
  else if (b.finalAmount) parts.push(`₹${Number(b.finalAmount).toLocaleString("en-IN")}`);
  return parts.join(" · ");
}

export function AdminNotificationCenter({
  open, onClose, notifications, unreadCount, onMarkRead, onMarkAllRead, onDelete,
}: Props) {
  const [, navigate] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shown = notifications.slice(0, 50);

  return createPortal(
    <div
      className="fixed inset-0 flex justify-end"
      style={{ zIndex: 99990 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer — slides in from right */}
      <div
        ref={drawerRef}
        className="relative flex flex-col bg-white shadow-2xl"
        style={{
          width: "min(400px, 100vw)",
          height: "100dvh",
          animation: "adminNotifSlideIn 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Bell size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-[15px] text-gray-900 leading-tight">Notifications</h2>
              <p className="text-[11px] text-gray-500 leading-tight">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── List ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20 gap-2">
              <Bell size={40} className="opacity-15" />
              <p className="text-sm font-medium text-gray-500">No notifications yet</p>
              <p className="text-xs text-gray-400">Activity will appear here</p>
            </div>
          ) : (
            shown.map((n) => {
              const navPath = notifNavPath(n);
              const sub = notifSubtext(n);
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) onMarkRead(n.id);
                    if (navPath) { onClose(); navigate(navPath); }
                  }}
                  className={[
                    "flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 transition-colors group",
                    navPath ? "cursor-pointer" : "",
                    !n.isRead
                      ? "bg-blue-50/60 hover:bg-blue-50/80"
                      : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <TypeIcon type={n.type} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${typeColor(n.type)}`}>
                            {typeLabel(n.type)}
                          </span>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>

                        <p className={`text-[13px] leading-snug truncate ${!n.isRead ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                          {n.title}
                        </p>

                        {sub && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</p>
                        )}

                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                      </div>

                      {/* Action buttons — visible on hover */}
                      <div
                        className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!n.isRead && (
                          <button
                            onClick={() => onMarkRead(n.id)}
                            className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Mark as read"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(n.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/80">
          <button
            onClick={() => { onClose(); navigate("/admin/notifications"); }}
            className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2 hover:bg-blue-50 rounded-xl transition-colors"
          >
            View all notification logs →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes adminNotifSlideIn {
          from { transform: translateX(100%); opacity: 0.5; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
