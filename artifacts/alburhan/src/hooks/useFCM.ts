/**
 * useFCM — Firebase Cloud Messaging hook for customer push notifications.
 * Requests permission, gets FCM token, registers with server, listens for foreground messages.
 * Uses existing sw.js (service worker) with the serviceWorkerRegistration option.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { isFirebaseAvailable, getFirebaseApp, getFirebaseMessagingInstance } from "@/lib/firebase";

const API = import.meta.env.VITE_API_URL || "";
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

export type FCMPermission =
  | "loading"
  | "unsupported"
  | "not_configured"
  | "default"
  | "granted"
  | "denied";

export interface UseFCMReturn {
  permission: FCMPermission;
  token: string | null;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
  requestPermission: () => Promise<void>;
  unregister: () => Promise<void>;
}

async function saveTokenToServer(fcmToken: string): Promise<void> {
  const platform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "android_chrome"
    : /Edg\//i.test(navigator.userAgent)
    ? "edge"
    : "web_chrome";
  await fetch(`${API}/api/push/register-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      token: fcmToken,
      platform,
      deviceInfo: navigator.userAgent.slice(0, 250),
    }),
  });
}

export function useFCM(): UseFCMReturn {
  const [permission, setPermission] = useState<FCMPermission>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // On mount: check environment support and auto-register if already granted
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Browser support check
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        if (!cancelled) setPermission("unsupported");
        return;
      }
      // Firebase configured check
      if (!isFirebaseAvailable()) {
        if (!cancelled) setPermission("not_configured");
        return;
      }

      const perm = Notification.permission;
      if (perm === "denied") {
        if (!cancelled) setPermission("denied");
        return;
      }
      if (perm === "granted") {
        if (!cancelled) setPermission("granted");
        await autoRegisterToken(cancelled);
      } else {
        if (!cancelled) setPermission("default");
      }
    }

    init().catch(() => {});
    return () => {
      cancelled = true;
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    };
  }, []);

  async function autoRegisterToken(cancelled: boolean) {
    try {
      const { isSupported, getToken } = await import("firebase/messaging");
      const supported = await isSupported();
      if (!supported || cancelled) return;

      const sw = await navigator.serviceWorker.ready;
      const messaging = getFirebaseMessagingInstance();
      const fcmToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: sw,
      });
      if (!fcmToken || cancelled) return;
      if (!cancelled) { setToken(fcmToken); setIsRegistered(true); }
      await saveTokenToServer(fcmToken);
      subscribeToForeground(messaging, cancelled);
    } catch {
      // Silent — auto register shouldn't surface errors
    }
  }

  function subscribeToForeground(messaging: any, cancelled: boolean) {
    import("firebase/messaging").then(({ onMessage }) => {
      if (cancelled) return;
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = onMessage(messaging, (payload: any) => {
        const n = payload.notification || {};
        const title = n.title || "Al Burhan Tours & Travels";
        const body  = n.body  || "";
        const url   = payload.data?.url || "/customer/dashboard";
        if (title && "Notification" in window && Notification.permission === "granted") {
          try {
            const notif = new Notification(title, { body, icon: n.icon || "/opengraph.jpg" });
            notif.onclick = () => {
              window.focus();
              window.location.href = url;
              notif.close();
            };
          } catch {}
        }
      });
    }).catch(() => {});
  }

  const requestPermission = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!isFirebaseAvailable()) {
        throw new Error("Push notifications are not configured on this server yet.");
      }
      const { isSupported, getToken } = await import("firebase/messaging");
      const supported = await isSupported();
      if (!supported) throw new Error("Push notifications are not supported on this device.");

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPermission("denied");
        setError("Push notifications blocked. Enable them in your browser settings.");
        return;
      }
      setPermission("granted");

      const sw = await navigator.serviceWorker.ready;
      const messaging = getFirebaseMessagingInstance();
      const fcmToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: sw,
      });
      if (!fcmToken) throw new Error("Could not get push token. Check VAPID key configuration.");
      setToken(fcmToken);
      await saveTokenToServer(fcmToken);
      setIsRegistered(true);
      subscribeToForeground(messaging, false);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("denied") || err.message.includes("blocked")) {
        setPermission("denied");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unregister = useCallback(async () => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (token) {
      await fetch(`${API}/api/push/unregister-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      }).catch(() => {});
      setToken(null);
      setIsRegistered(false);
    }
    if ("Notification" in window && Notification.permission !== "denied") {
      setPermission("default");
    }
  }, [token]);

  return { permission, token, isRegistered, isLoading, error, requestPermission, unregister };
}
