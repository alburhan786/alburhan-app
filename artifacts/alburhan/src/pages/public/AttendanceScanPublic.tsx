import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, XCircle, Users, Loader2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function parsePilgrimId(qrText: string): string | null {
  try {
    const url = new URL(qrText);
    const parts = url.pathname.split("/");
    const verifyIdx = parts.findIndex((p) => p === "verify");
    if (verifyIdx >= 0 && parts[verifyIdx + 1]) return parts[verifyIdx + 1];
  } catch {
    if (qrText && !qrText.includes(" ") && qrText.length > 8) return qrText;
  }
  return null;
}

function getTokenFromSearch(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

export default function AttendanceScanPublic() {
  const [, params] = useRoute("/attendance-scan/:groupId/:eventId");
  const groupId = params?.groupId;
  const eventId = params?.eventId;
  const token = getTokenFromSearch();

  const [eventName, setEventName] = useState("");
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastScan, setLastScan] = useState<{ name: string; serialNumber: number; status: string; photoUrl: string | null } | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error">("idle");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  const scannerRef = useRef<any>(null);
  const lastScannedRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!groupId || !eventId || !token) { setAuthError(true); return; }
    fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/info?token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.status === 401) { setAuthError(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setEventName(d.name || "");
        setPresentCount(d.presentCount || 0);
        setTotalCount(d.totalCount || 0);
      })
      .catch(() => setAuthError(true));
  }, [groupId, eventId, token]);

  const handleScan = useCallback(async (qrText: string) => {
    const now = Date.now();
    if (processingRef.current) return;
    if (qrText === lastScannedRef.current && now - lastTimeRef.current < 3000) return;

    const pilgrimId = parsePilgrimId(qrText);
    if (!pilgrimId) return;

    processingRef.current = true;
    lastScannedRef.current = qrText;
    lastTimeRef.current = now;

    try {
      if (navigator.vibrate) navigator.vibrate(100);
      setScanning(true);

      const res = await fetch(
        `${API}/api/groups/${groupId}/attendance/events/${eventId}/scan?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pilgrimId, status: "present" }),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setScanStatus("error");
        setLastScan(null);
      } else {
        setScanStatus("success");
        setLastScan({ name: data.pilgrim.fullName, serialNumber: data.pilgrim.serialNumber, status: data.status, photoUrl: data.pilgrim.photoUrl });
        setPresentCount(data.presentCount);
        setTotalCount(data.totalCount);
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      }
    } catch {
      setScanStatus("error");
    } finally {
      setScanning(false);
      processingRef.current = false;
      setTimeout(() => setScanStatus("idle"), 2500);
    }
  }, [groupId, eventId, token]);

  useEffect(() => {
    if (!token || authError) return;
    let html5QrCode: any = null;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        html5QrCode = new Html5Qrcode("pub-qr-reader");
        scannerRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          (text: string) => handleScan(text),
          undefined
        );
        setCameraError(null);
      } catch (err: any) {
        if (err?.toString().includes("Permission")) setCameraError("Camera permission denied. Please allow camera access.");
        else if (err?.toString().includes("NotFound")) setCameraError("No camera found.");
        else setCameraError("Could not start camera.");
      }
    }
    start();
    return () => { if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; } };
  }, [handleScan, token, authError]);

  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle size={48} className="text-red-400 mx-auto mb-3" />
          <h2 className="font-bold text-lg mb-2">Invalid or Expired Link</h2>
          <p className="text-sm text-gray-500">This scanner link is invalid or has expired. Please ask the admin for a valid scanner link.</p>
        </div>
      </div>
    );
  }

  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#0d5040" }} className="px-4 py-3 text-white">
        <p className="text-xs opacity-75">Al Burhan Tours &amp; Travels</p>
        <p className="font-bold text-sm">{eventName || "Attendance Scanner"}</p>
      </div>

      <div className="max-w-sm mx-auto px-4 py-4 space-y-3">
        <div className="bg-white border rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-1.5">
            <Users size={13} /> Live Tally · {pct}%
          </div>
          <div className="bg-gray-100 rounded-full h-2 mb-1.5">
            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: "#10b981" }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span style={{ color: "#059669", fontWeight: 600 }}>{presentCount} present</span>
            <span style={{ color: "#ef4444", fontWeight: 600 }}>{totalCount - presentCount} missing</span>
            <span>{totalCount} total</span>
          </div>
        </div>

        <div className="relative border rounded-xl overflow-hidden bg-black shadow-md">
          <div id="pub-qr-reader" className="w-full" />
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={30} className="text-white animate-spin" />
            </div>
          )}
          {scanStatus === "success" && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(16,185,129,0.8)" }}>
              <CheckCircle2 size={64} className="text-white" />
            </div>
          )}
          {scanStatus === "error" && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(239,68,68,0.8)" }}>
              <XCircle size={64} className="text-white" />
            </div>
          )}
        </div>

        {cameraError && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-3 text-center text-sm text-red-700">
            <XCircle size={18} className="mx-auto mb-1" />{cameraError}
          </div>
        )}

        {lastScan && (
          <div className={`border rounded-xl p-3 bg-white shadow-sm ${scanStatus === "success" ? "border-emerald-300" : ""}`}>
            <div className="flex items-center gap-3">
              {lastScan.photoUrl ? (
                <img src={`${API}${lastScan.photoUrl}`} alt="" className="w-10 h-10 rounded-full object-cover border" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "#0d5040" }}>
                  {lastScan.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{lastScan.name}</p>
                <p className="text-xs text-gray-500">#{lastScan.serialNumber}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${lastScan.status === "present" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {lastScan.status === "present" ? "✓ Present" : "✗ Absent"}
              </span>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">Point camera at a pilgrim's QR code</p>
      </div>
    </div>
  );
}
