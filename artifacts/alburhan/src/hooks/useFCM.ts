/**
 * useFCM — Firebase Cloud Messaging hook for all user types.
 * Auto-registers if permission already granted.
 * Detects browser/OS/device for rich token metadata.
 * Sends heartbeat every 30 min to keep last_seen fresh.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { isFirebaseAvailable, getFirebaseMessagingInstance } from "@/lib/firebase";

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

// ── Device/Browser/OS detection ───────────────────────────────────────────────
function detectEnvironment() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";

  const browser =
    /Edg\//i.test(ua)    ? "Edge" :
    /OPR\//i.test(ua)    ? "Opera" :
    /Chrome\//i.test(ua) ? "Chrome" :
    /Firefox\//i.test(ua)? "Firefox" :
    /Safari\//i.test(ua) ? "Safari" : "Browser";

  const operatingSystem =
    /Android/i.test(ua)             ? "Android" :
    /iPhone|iPad|iPod/i.test(ua)    ? "iOS" :
    /Win/.test(platform)            ? "Windows" :
    /Mac/.test(platform)            ? "macOS" :
    /Linux/.test(platform)          ? "Linux" : "Unknown";

  const devicePlatform =
    /Android/i.test(ua)          ? "android_chrome" :
    /iPhone|iPad|iPod/i.test(ua) ? "ios" :
    /Edg\//i.test(ua)            ? "edge" : "web_chrome";

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  return {
    browser,
    operatingSystem,
    platform: devicePlatform,
    deviceInfo: ua.slice(0, 250),
    isMobile,
  };
}

async function saveTokenToServer(fcmToken: string, userType = "customer"): Promise<void> {
  const env = detectEnvironment();
  await fetch(`${API}/api/push/register-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      token: fcmToken,
      userType,
      platform: env.platform,
      browser: env.browser,
      operatingSystem: env.operatingSystem,
      deviceInfo: env.deviceInfo,
    }),
  });
}

async function sendHeartbeat(token: string): Promise<void> {
  await fetch(`${API}/api/push/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

export function useFCM(userType = "customer"): UseFCMReturn {
  const [permission, setPermission] = useState<FCMPermission>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubRef  = useRef<(() => void) | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        if (!cancelled) setPermission("unsupported");
        return;
      }
      if (!isFirebaseAvailable()) {
        if (!cancelled) setPermission("not_configured");
        return;
      }
      const perm = Notification.permission;
      if (perm === "denied") { if (!cancelled) setPermission("denied"); return; }
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
      if (heartbeat.current) { clearInterval(heartbeat.current); heartbeat.current = null; }
    };
  }, [userType]);

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
      await saveTokenToServer(fcmToken, userType);
      startHeartbeat(fcmToken);
      subscribeToForeground(messaging, cancelled);
    } catch {
      // silent
    }
  }

  function startHeartbeat(fcmToken: string) {
    if (heartbeat.current) clearInterval(heartbeat.current);
    // Heartbeat every 30 minutes
    heartbeat.current = setInterval(() => sendHeartbeat(fcmToken), 30 * 60 * 1000);
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
            notif.onclick = () => { window.focus(); window.location.href = url; notif.close(); };
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
      if (!fcmToken) throw new Error("Could not get FCM token. Check VAPID key.");
      setToken(fcmToken);
      await saveTokenToServer(fcmToken, userType);
      setIsRegistered(true);
      startHeartbeat(fcmToken);
      subscribeToForeground(messaging, false);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("denied") || err.message.includes("blocked")) {
        setPermission("denied");
      }
    } finally {
      setIsLoading(false);
    }
  }, [userType]);

  const unregister = useCallback(async () => {
    if (unsubRef.current)  { unsubRef.current(); unsubRef.current = null; }
    if (heartbeat.current) { clearInterval(heartbeat.current); heartbeat.current = null; }
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
    if ("Notification" in window && Notification.permission !== "denied") setPermission("default");
  }, [token]);

  return { permission, token, isRegistered, isLoading, error, requestPermission, unregister };
}
