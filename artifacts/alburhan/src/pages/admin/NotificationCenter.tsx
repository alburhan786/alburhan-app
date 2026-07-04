import { AdminLayout } from "@/components/layout/AdminLayout";
import { Bell, Check, Trash2, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminNotifications, type AdminNotification, type AdminNotifType } from "@/hooks/useAdminNotifications";
import { useAuth } from "@/hooks/use-auth";

function typeColor(type: AdminNotifType) {
  switch (type) {
    case "booking_new": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "booking_approved": return "bg-blue-100 text-blue-700 border-blue-200";
    case "booking_rejected": return "bg-red-100 text-red-700 border-red-200";
    case "booking_cancelled": return "bg-orange-100 text-orange-700 border-orange-200";
    case "payment_received": return "bg-purple-100 text-purple-700 border-purple-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function typeLabel(type: AdminNotifType) {
  switch (type) {
    case "booking_new": return "New Booking";
    case "booking_approved": return "Booking Approved";
    case "booking_rejected": return "Booking Rejected";
    case "booking_cancelled": return "Booking Cancelled";
    case "payment_received": return "Payment Received";
    default: return "Info";
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function NotificationRow({ n, onMarkRead, onDelete }: {
  n: AdminNotification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const b = n.body;
  return (
    <div className={`rounded-xl border p-4 transition-all ${!n.isRead ? "bg-blue-50/60 border-blue-100" : "bg-white border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${typeColor(n.type)}`}>
              {typeLabel(n.type)}
            </span>
            {!n.isRead && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Unread
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm mb-1">{n.title}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-500">
            {b.customerName && <span><span className="font-medium text-gray-700">Customer:</span> {b.customerName}</span>}
            {b.customerMobile && <span><span className="font-medium text-gray-700">Mobile:</span> {b.customerMobile}</span>}
            {b.bookingNumber && <span><span className="font-medium text-gray-700">Booking:</span> {b.bookingNumber}</span>}
            {b.packageName && <span><span className="font-medium text-gray-700">Package:</span> {b.packageName}</span>}
            {b.finalAmount && <span><span className="font-medium text-gray-700">Amount:</span> ₹{Number(b.finalAmount).toLocaleString("en-IN")}</span>}
            {b.amount && <span><span className="font-medium text-gray-700">Amount:</span> ₹{b.amount}</span>}
            {b.numberOfPilgrims && <span><span className="font-medium text-gray-700">Pilgrims:</span> {b.numberOfPilgrims}</span>}
            {b.reason && <span className="col-span-2 text-red-600"><span className="font-medium">Reason:</span> {b.reason}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!n.isRead && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => onMarkRead(n.id)}
            >
              <Check size={12} className="mr-1" /> Read
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
            onClick={() => onDelete(n.id)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationCenter() {
  const { isAdmin } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification } = useAdminNotifications(isAdmin);

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={22} className="text-primary" />
              Notification Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time booking and payment alerts
              {unreadCount > 0 && (
                <span className="ml-2 bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <CheckCheck size={14} className="mr-1.5" /> Mark all as read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Bell size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-500">No notifications yet</p>
            <p className="text-sm mt-1">New bookings and payments will appear here in real time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onMarkRead={markRead}
                onDelete={deleteNotification}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
