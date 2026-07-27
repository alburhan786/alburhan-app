import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "";
const POLL_INTERVAL_MS = 60_000;

export type AdminNotifType =
  | "booking_new"
  | "booking_approved"
  | "booking_rejected"
  | "booking_cancelled"
  | "payment_received"
  | "notification_failure"
  | string;

export interface AdminNotifBody {
  bookingId?: string;
  bookingNumber?: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string | null;
  packageName?: string | null;
  finalAmount?: number | null;
  numberOfPilgrims?: number;
  isOffline?: boolean;
  amount?: string;
  reason?: string;
}

export interface AdminNotification {
  id: string;
  type: AdminNotifType;
  title: string;
  body: AdminNotifBody;
  bookingId: string | null;
  isRead: boolean;
  createdAt: string;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    osc2.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.55);
    osc2.stop(ctx.currentTime + 0.55);
    setTimeout(() => ctx.close(), 800);
  } catch {
    // AudioContext not supported — silent fallback
  }
}

export function useAdminNotifications(isAdmin: boolean) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [popupNotif, setPopupNotif] = useState<AdminNotification | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchExisting = useCallback(async () => {
    if (!isAdminRef.current) return;
    try {
      const r = await fetch(`${API}/api/admin-notifications`, { credentials: "include" });
      if (r.ok) {
        const data: AdminNotification[] = await r.json();
        setNotifications(data);
      }
    } catch { /* network error — keep previous state */ }
  }, []);

  const connectSse = useCallback(() => {
    if (!isAdminRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`${API}/api/admin-notifications/stream`, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("notification", (e) => {
      try {
        const notif: AdminNotification = JSON.parse(e.data);
        setNotifications((prev) => [notif, ...prev].slice(0, 100));
        if (notif.type === "booking_new" || notif.type === "payment_received") {
          setPopupNotif(notif);
          playNotificationSound();
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("read", (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
      } catch { /* ignore */ }
    });

    es.addEventListener("all_read", () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    });

    es.addEventListener("deleted", (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectTimer.current = setTimeout(() => {
        connectSse();
        fetchExisting();
      }, 5000);
    };
  }, [fetchExisting]);

  useEffect(() => {
    if (!isAdmin) return;

    fetchExisting();
    connectSse();

    pollTimer.current = setInterval(fetchExisting, POLL_INTERVAL_MS);

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isAdmin, fetchExisting, connectSse]);

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`${API}/api/admin-notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${API}/api/admin-notifications/mark-all-read`, {
        method: "POST",
        credentials: "include",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch { /* ignore */ }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await fetch(`${API}/api/admin-notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch { /* ignore */ }
  }, []);

  const dismissPopup = useCallback(() => setPopupNotif(null), []);

  return {
    notifications,
    unreadCount,
    popupNotif,
    dismissPopup,
    markRead,
    markAllRead,
    deleteNotification,
    refresh: fetchExisting,
  };
}
