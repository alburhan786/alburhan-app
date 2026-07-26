/**
 * PushNotificationSetting — self-contained FCM toggle row.
 * Drop into any settings section across all portal types.
 */
import { BellRing, Bell, BellOff } from "lucide-react";
import { useFCM } from "@/hooks/useFCM";
import { useAuth } from "@/hooks/use-auth";

export function PushNotificationSetting() {
  const { user } = useAuth();
  const { permission, isRegistered, isLoading, requestPermission, unregister } = useFCM(user?.role || "customer");

  if (permission === "unsupported" || permission === "not_configured") return null;

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-start gap-2 min-w-0">
        {isRegistered
          ? <BellRing size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
          : permission === "denied"
          ? <BellOff size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
          : <Bell size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />}
        <div>
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            {isRegistered
              ? "Real-time alerts enabled on this device"
              : permission === "denied"
              ? "Blocked — open browser settings to re-enable"
              : permission === "loading"
              ? "Checking status…"
              : "Get instant alerts even when app is in background"}
          </p>
        </div>
      </div>
      {permission === "denied" ? (
        <span className="text-xs text-red-400 bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1 flex-shrink-0">
          <BellOff size={11} /> Blocked
        </span>
      ) : (
        <button
          onClick={() => (isRegistered ? unregister() : requestPermission())}
          disabled={isLoading || permission === "loading"}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
            isRegistered
              ? "bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600"
              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }`}
        >
          {isLoading ? "Working…" : isRegistered ? "Active ✓" : "Enable"}
        </button>
      )}
    </div>
  );
}
