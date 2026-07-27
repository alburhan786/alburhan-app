import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Bell, Check, Trash2, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AdminNotification, type AdminNotifType } from "@/hooks/useAdminNotifications";

interface Props {
  notifications: AdminNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onOpen?: () => void;
}

function typeColor(type: AdminNotifType) {
  switch (type) {
    case "booking_new": return "bg-emerald-100 text-emerald-700";
    case "booking_approved": return "bg-blue-100 text-blue-700";
    case "booking_rejected": return "bg-red-100 text-red-700";
    case "booking_cancelled": return "bg-orange-100 text-orange-700";
    case "payment_received": return "bg-purple-100 text-purple-700";
    case "notification_failure": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function typeLabel(type: AdminNotifType) {
  switch (type) {
    case "booking_new": return "New Booking";
    case "booking_approved": return "Approved";
    case "booking_rejected": return "Rejected";
    case "booking_cancelled": return "Cancelled";
    case "payment_received": return "Payment";
    case "notification_failure": return "Alert";
    default: return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

function notifNavPath(n: AdminNotification): string | null {
  if (n.bookingId) return `/admin/bookings/${n.bookingId}`;
  if (n.type === "notification_failure") return "/admin/notification-logs";
  return null;
}

function timeAgo(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

export function AdminNotificationCenter({ notifications, unreadCount, onMarkRead, onMarkAllRead, onDelete, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const shown = notifications.slice(0, 20);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          const opening = !open;
          setOpen(opening);
          if (opening) onOpen?.();
        }}
        className="relative p-2 rounded-lg hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[9990] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-gray-500" />
              <span className="font-semibold text-sm text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {shown.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              shown.map((n) => {
                const navPath = notifNavPath(n);
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) onMarkRead(n.id);
                      if (navPath) { setOpen(false); navigate(navPath); }
                    }}
                    className={`px-4 py-3 border-b border-gray-50 transition-colors ${navPath ? "cursor-pointer hover:bg-blue-50/60" : "hover:bg-gray-50"} ${!n.isRead ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeColor(n.type)}`}>
                            {typeLabel(n.type)}
                          </span>
                          {!n.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                          )}
                        </div>
                        <p className="text-xs font-medium text-gray-900 truncate">{n.title}</p>
                        {n.body.packageName && (
                          <p className="text-[11px] text-gray-500 truncate">{n.body.packageName}</p>
                        )}
                        {n.body.amount && (
                          <p className="text-[11px] text-gray-500">₹{n.body.amount}</p>
                        )}
                        {n.body.finalAmount && !n.body.amount && (
                          <p className="text-[11px] text-gray-500">₹{Number(n.body.finalAmount).toLocaleString("en-IN")}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!n.isRead && (
                          <button
                            onClick={() => onMarkRead(n.id)}
                            className="p-1 text-blue-400 hover:text-blue-600 rounded"
                            title="Mark read"
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(n.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 text-center">
            <button
              onClick={() => { setOpen(false); navigate("/admin/notifications"); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
