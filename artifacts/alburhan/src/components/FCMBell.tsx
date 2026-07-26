/**
 * FCMBell — shared push-notification status indicator for all dashboards.
 * Shows green dot when registered, amber pulse when permission not yet granted.
 * Clicking it triggers permission request.
 */
import { useState } from "react";
import { Bell, BellRing, BellOff } from "lucide-react";
import { useFCM } from "@/hooks/useFCM";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  className?: string;
  iconSize?: number;
}

export function FCMBell({ className = "", iconSize = 16 }: Props) {
  const { user } = useAuth();
  const userType = user?.role || "customer";
  const { permission, isRegistered, isLoading, requestPermission, error } = useFCM(userType);
  const [showTooltip, setShowTooltip] = useState(false);

  // Don't render if FCM not supported/configured on this deployment
  if (permission === "unsupported" || permission === "not_configured" || permission === "loading") {
    return null;
  }

  const isGranted  = permission === "granted" && isRegistered;
  const isDenied   = permission === "denied";
  const isPending  = permission === "default";

  const Icon  = isGranted ? BellRing : isDenied ? BellOff : Bell;
  const color = isGranted ? "text-emerald-400" : isDenied ? "text-gray-400" : "text-amber-400";
  const label = isGranted
    ? "Push notifications active"
    : isDenied
    ? "Push blocked — enable in browser settings"
    : isLoading
    ? "Enabling…"
    : "Enable push notifications";

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={() => { if (isPending && !isLoading) requestPermission(); }}
        disabled={isLoading || isGranted || isDenied}
        className={`relative p-1.5 rounded-lg transition-colors hover:bg-white/10 ${className}`}
        title={label}
        aria-label={label}
      >
        <Icon size={iconSize} className={color} />

        {/* Status dot */}
        {isGranted && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-current" />
        )}
        {isPending && !isLoading && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-current animate-pulse" />
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute right-0 top-9 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-xl pointer-events-none">
          {label}
          {error && <div className="text-red-300 mt-0.5 text-[10px]">{error}</div>}
        </div>
      )}
    </div>
  );
}
