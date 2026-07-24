import { useState, useEffect, useCallback } from "react";

const BASE_API = import.meta.env.VITE_API_URL || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushPermission = "loading" | "unsupported" | "default" | "granted" | "denied";

export interface UsePushNotificationsReturn {
  permission: PushPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<PushPermission>("loading");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    const perm = Notification.permission as PushPermission;
    setPermission(perm);

    // Check server-side subscription status
    if (perm === "granted") {
      fetch(`${BASE_API}/api/push/status`, { credentials: "include" })
        .then(r => r.json())
        .then(d => setIsSubscribed(!!d.subscribed))
        .catch(() => {});
    }
  }, []);

  const subscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const swReg = await navigator.serviceWorker.ready;

      // Get VAPID public key from server
      const vapidRes = await fetch(`${BASE_API}/api/push/vapid-key`);
      if (!vapidRes.ok) throw new Error("Could not get push configuration");
      const { publicKey } = await vapidRes.json();

      // Subscribe via PushManager
      const subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Register with server
      const saveRes = await fetch(`${BASE_API}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subscription: subscription.toJSON(), platform: "web" }),
      });
      if (!saveRes.ok) throw new Error("Failed to save push subscription");

      setPermission("granted");
      setIsSubscribed(true);
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setPermission("denied");
        setError("Push notifications blocked. Enable them in your browser settings.");
      } else {
        setError(err?.message || "Failed to enable push notifications");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const swReg = await navigator.serviceWorker.ready;
      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch(`${BASE_API}/api/push/unsubscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
      setPermission("default");
    } catch (err: any) {
      setError(err?.message || "Failed to disable push notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { permission, isSubscribed, isLoading, error, subscribe, unsubscribe };
}
