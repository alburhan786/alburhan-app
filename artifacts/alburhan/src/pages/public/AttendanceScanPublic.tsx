import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import { Camera, X, CheckCircle2, XCircle, AlertCircle, Users, WifiOff } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface PilgrimResult {
  id: string; fullName: string; familyId: string | null;
  serialNumber: number; photoUrl: string | null;
  passportNumber: string | null; roomNumber: string | null;
  roomHotel: string | null; busNumber: string | null;
}
interface ScanResult {
  pilgrim: PilgrimResult; status: string;
  alreadyPresent: boolean; presentCount: number; totalCount: number;
}

function parsePilgrimId(text: string): string | null {
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/");
    const vi = parts.findIndex((p) => p === "verify");
    if (vi >= 0 && parts[vi + 1]) return parts[vi + 1];
  } catch {
    if (text && !text.includes(" ") && text.length > 6) return text;
  }
  return null;
}

function getTokenFromSearch(): string {
  return new URLSearchParams(window.location.search).get("token") || "";
}

function playBeep(type: "success" | "duplicate" | "error") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "success") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(); osc.stop(ctx.currentTime + 0.28);
    } else if (type === "duplicate") {
      osc.frequency.value = 523;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.type = "sawtooth"; osc.frequency.value = 200;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(); osc.stop(ctx.currentTime + 0.35);
    }
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {}
}

function vibrate(type: "success" | "duplicate" | "error") {
  if (!navigator.vibrate) return;
  if (type === "success") navigator.vibrate([60, 40, 60]);
  else if (type === "duplicate") navigator.vibrate(80);
  else navigator.vibrate([100, 50, 100, 50, 100]);
}

export default function AttendanceScanPublic() {
  const [, params] = useRoute("/attendance-scan/:groupId/:eventId");
  const groupId = params?.groupId || "";
  const eventId = params?.eventId || "";
  const token = getTokenFromSearch();

  const [eventName, setEventName] = useState("");
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [mode, setMode] = useState<"ready" | "camera" | "result">("ready");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const lastTextRef = useRef("");
  const lastTimeRef = useRef(0);
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!groupId || !eventId || !token) { setAuthError(true); return; }
    fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/info?token=${encodeURIComponent(token)}`)
      .then(r => { if (r.status === 401) { setAuthError(true); return null; } return r.json(); })
      .then(d => { if (!d) return; setEventName(d.name || ""); setPresentCount(d.presentCount || 0); setTotalCount(d.totalCount || 0); })
      .catch(() => setAuthError(true));
  }, [groupId, eventId, token]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
  }, []);

  const processScan = useCallback(async (pilgrimId: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    await stopCamera();
    setMode("result");

    try {
      const res = await fetch(
        `${API}/api/groups/${groupId}/attendance/events/${eventId}/scan?token=${encodeURIComponent(token)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pilgrimId, status: "present" }) }
      );
      const data = await res.json();
      if (res.ok) {
        setResult(data as ScanResult);
        setPresentCount(data.presentCount);
        setTotalCount(data.totalCount);
        if (data.alreadyPresent) { playBeep("duplicate"); vibrate("duplicate"); }
        else { playBeep("success"); vibrate("success"); }
        autoReturnTimer.current = setTimeout(() => openCamera(), 4500);
      } else {
        playBeep("error"); vibrate("error");
        setResult(null);
        autoReturnTimer.current = setTimeout(() => openCamera(), 3000);
      }
    } catch {
      playBeep("error"); vibrate("error");
      setResult(null);
      autoReturnTimer.current = setTimeout(() => openCamera(), 3000);
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }, [groupId, eventId, token, stopCamera]);

  const handleScanText = useCallback((text: string) => {
    const now = Date.now();
    if (text === lastTextRef.current && now - lastTimeRef.current < 4000) return;
    const pid = parsePilgrimId(text);
    if (!pid) return;
    lastTextRef.current = text; lastTimeRef.current = now;
    processScan(pid);
  }, [processScan]);

  const openCamera = useCallback(async () => {
    if (autoReturnTimer.current) { clearTimeout(autoReturnTimer.current); autoReturnTimer.current = null; }
    setCameraError(null); setMode("camera"); setResult(null);
    processingRef.current = false; lastTextRef.current = "";
    setTimeout(async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("pub-scanner-viewport", {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 260, height: 160 }, aspectRatio: 1.333 },
          (text: string) => handleScanText(text),
          undefined
        );
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes("ermission") || msg.includes("denied")) setCameraError("Camera permission denied. Please allow camera access.");
        else if (msg.includes("NotFound")) setCameraError("No back camera found.");
        else setCameraError("Could not start camera.");
        setMode("ready");
      }
    }, 100);
  }, [handleScanText]);

  const closeCamera = useCallback(async () => {
    if (autoReturnTimer.current) { clearTimeout(autoReturnTimer.current); autoReturnTimer.current = null; }
    await stopCamera(); setMode("ready");
  }, [stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); if (autoReturnTimer.current) clearTimeout(autoReturnTimer.current); };
  }, [stopCamera]);

  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle size={52} className="text-red-400 mx-auto mb-4" />
          <h2 className="font-bold text-xl mb-2">Invalid or Expired Link</h2>
          <p className="text-sm text-gray-500">This scanner link is invalid or has expired. Please ask the admin for a valid scanner link.</p>
        </div>
      </div>
    );
  }

  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
  const pilgrim = result?.pilgrim;
  const alreadyPresent = result?.alreadyPresent;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Camera Full-Screen Overlay */}
      {mode === "camera" && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: "none" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(0,0,0,0.75)" }}>
            <div>
              <p className="text-white font-bold text-base">{eventName || "Scanner"}</p>
              <p className="text-emerald-400 text-xs font-medium">{presentCount} / {totalCount} present</p>
            </div>
            <button onClick={closeCamera} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/20 text-white active:bg-white/40">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <div id="pub-scanner-viewport" className="w-full h-full" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative" style={{ width: 260, height: 160 }}>
                <div className="absolute top-0 left-0 w-8 h-8 border-emerald-400" style={{ borderTopWidth: 3, borderLeftWidth: 3, borderTopStyle: "solid", borderLeftStyle: "solid" }} />
                <div className="absolute top-0 right-0 w-8 h-8 border-emerald-400" style={{ borderTopWidth: 3, borderRightWidth: 3, borderTopStyle: "solid", borderRightStyle: "solid" }} />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-emerald-400" style={{ borderBottomWidth: 3, borderLeftWidth: 3, borderBottomStyle: "solid", borderLeftStyle: "solid" }} />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-emerald-400" style={{ borderBottomWidth: 3, borderRightWidth: 3, borderBottomStyle: "solid", borderRightStyle: "solid" }} />
                <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 opacity-80 animate-bounce" style={{ top: "50%", animationDuration: "1.5s" }} />
              </div>
            </div>
            {processing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="bg-white/10 rounded-2xl px-8 py-6 text-center">
                  <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white text-sm font-medium">Processing…</p>
                </div>
              </div>
            )}
          </div>

          <div className="py-4 text-center" style={{ background: "rgba(0,0,0,0.75)" }}>
            {cameraError
              ? <p className="text-red-400 text-sm px-6">{cameraError}</p>
              : <p className="text-white/70 text-sm">Point camera at pilgrim's QR code or barcode</p>}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#0d5040" }} className="px-4 pt-safe-top py-3 text-white">
        <p className="text-xs opacity-70">Al Burhan Tours &amp; Travels</p>
        <p className="font-bold text-base">{eventName || "Attendance Scanner"}</p>
      </div>

      <div className="max-w-sm mx-auto px-4 py-4 space-y-4">

        {/* Tally */}
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Users size={14} style={{ color: "#0d5040" }} /> Live Tally
            </div>
            <span className="text-sm font-bold" style={{ color: "#0d5040" }}>{pct}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
            <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "#10b981" }} />
          </div>
          <div className="flex justify-between text-xs font-semibold">
            <span style={{ color: "#059669" }}>{presentCount} present</span>
            <span style={{ color: "#ef4444" }}>{totalCount - presentCount} missing</span>
            <span className="text-gray-400">{totalCount} total</span>
          </div>
        </div>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
            <WifiOff size={18} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">You're offline</p>
              <p className="text-xs text-amber-700">Connect to internet to record attendance</p>
            </div>
          </div>
        )}

        {/* Result Card */}
        {mode === "result" && (
          <div className={`rounded-2xl border shadow-md overflow-hidden ${alreadyPresent ? "border-amber-300" : result ? "border-emerald-300" : "border-red-300"}`}>
            <div className={`px-4 py-3 flex items-center gap-3 ${alreadyPresent ? "bg-amber-500" : result ? "bg-emerald-500" : "bg-red-500"}`}>
              {alreadyPresent
                ? <AlertCircle size={22} className="text-white shrink-0" />
                : result ? <CheckCircle2 size={22} className="text-white shrink-0" />
                : <XCircle size={22} className="text-white shrink-0" />}
              <p className="text-white font-bold text-base">
                {alreadyPresent ? "Already Present" : result ? "Marked Present ✓" : "Not Found"}
              </p>
            </div>

            {pilgrim && (
              <div className="bg-white p-4 space-y-3">
                <div className="flex items-center gap-4">
                  {pilgrim.photoUrl ? (
                    <img src={`${API}${pilgrim.photoUrl}`} alt={pilgrim.fullName}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0"
                      style={{ background: "#0d5040" }}>
                      {pilgrim.fullName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-lg leading-tight">{pilgrim.fullName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Serial #{pilgrim.serialNumber}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {pilgrim.passportNumber && (
                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Passport</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{pilgrim.passportNumber}</p>
                    </div>
                  )}
                  {pilgrim.familyId && (
                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Family ID</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{pilgrim.familyId}</p>
                    </div>
                  )}
                  {pilgrim.roomNumber && (
                    <div className="rounded-lg bg-blue-50 px-3 py-2">
                      <p className="text-[10px] text-blue-400 uppercase tracking-wide font-semibold">Room</p>
                      <p className="text-sm font-bold text-blue-800 mt-0.5">
                        {pilgrim.roomNumber}
                        {pilgrim.roomHotel && <span className="font-normal text-blue-600"> · {pilgrim.roomHotel}</span>}
                      </p>
                    </div>
                  )}
                  {pilgrim.busNumber && (
                    <div className="rounded-lg bg-purple-50 px-3 py-2">
                      <p className="text-[10px] text-purple-400 uppercase tracking-wide font-semibold">Bus</p>
                      <p className="text-sm font-bold text-purple-800 mt-0.5">{pilgrim.busNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!pilgrim && mode === "result" && (
              <div className="bg-white p-6 text-center">
                <p className="text-gray-500 text-sm">Pilgrim not found in this group.</p>
              </div>
            )}
          </div>
        )}

        {/* SCAN Button */}
        <button
          onClick={openCamera}
          disabled={processing || !isOnline}
          className="w-full rounded-2xl flex items-center justify-center gap-3 font-bold text-xl text-white active:scale-95 transition-transform shadow-lg disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #0d5040 0%, #1a7a60 100%)", minHeight: 72 }}
        >
          <Camera size={28} />
          {mode === "result" ? "Scan Next" : "Scan QR / Barcode"}
        </button>

        {cameraError && mode !== "camera" && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <XCircle size={16} className="shrink-0 mt-0.5" /> {cameraError}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">Supports QR codes and CODE128 barcodes</p>
      </div>
    </div>
  );
}
