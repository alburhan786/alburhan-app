import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ArrowLeft, Camera, X, CheckCircle2, XCircle, AlertCircle, Users, WifiOff, RefreshCw } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const OFFLINE_KEY = "alburhan_atnd_offline";

interface PilgrimResult {
  id: string; fullName: string; familyId: string | null;
  serialNumber: number; photoUrl: string | null;
  passportNumber: string | null; roomNumber: string | null;
  roomHotel: string | null; busNumber: string | null;
}
interface ScanResult {
  pilgrim: PilgrimResult; status: string;
  alreadyPresent: boolean; presentCount: number;
  totalCount: number;
  familyMembers?: { id: string; fullName: string; serialNumber: number; familyRelation: string | null; familyHead: boolean | null; attendanceStatus: string | null }[];
}
interface OfflineItem { id: string; pilgrimId: string; groupId: string; eventId: string; ts: number; }

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

function playBeep(type: "success" | "duplicate" | "error") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
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
      osc.type = "sawtooth";
      osc.frequency.value = 200;
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

function getQueue(): OfflineItem[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q: OfflineItem[]) { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); }

export default function AttendanceScanner() {
  const [, params] = useRoute("/admin/groups/:groupId/attendance/:eventId/scan");
  const groupId = params?.groupId || "";
  const eventId = params?.eventId || "";

  const [eventName, setEventName] = useState("");
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [mode, setMode] = useState<"ready" | "camera" | "result">("ready");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(() => getQueue().length);

  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const lastTextRef = useRef("");
  const lastTimeRef = useRef(0);
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!groupId || !eventId) return;
    fetch(`${API}/api/groups/${groupId}/attendance/events`, { credentials: "include" })
      .then(r => r.json())
      .then((data: any[]) => {
        const ev = data.find((e: any) => e.id === eventId);
        if (ev) { setEventName(ev.name); setPresentCount(ev.present); setTotalCount(ev.total); }
      }).catch(() => {});
  }, [groupId, eventId]);

  useEffect(() => {
    const on = () => { setIsOnline(true); drainQueue(); };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [groupId, eventId]);

  async function drainQueue() {
    const queue = getQueue();
    if (!queue.length) return;
    const remaining: OfflineItem[] = [];
    for (const item of queue) {
      try {
        const res = await fetch(`${API}/api/groups/${item.groupId}/attendance/events/${item.eventId}/scan`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pilgrimId: item.pilgrimId, status: "present" }),
        });
        if (!res.ok) remaining.push(item);
      } catch { remaining.push(item); }
    }
    saveQueue(remaining);
    setQueueCount(remaining.length);
  }

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

    if (!navigator.onLine) {
      const queue = getQueue();
      queue.push({ id: crypto.randomUUID(), pilgrimId, groupId, eventId, ts: Date.now() });
      saveQueue(queue);
      setQueueCount(queue.length);
      vibrate("duplicate");
      setResult(null);
      setProcessing(false);
      processingRef.current = false;
      return;
    }

    try {
      const res = await fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/scan`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilgrimId, status: "present" }),
      });
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
  }, [groupId, eventId, stopCamera]);

  const handleScanText = useCallback((text: string) => {
    const now = Date.now();
    if (text === lastTextRef.current && now - lastTimeRef.current < 4000) return;
    const pid = parsePilgrimId(text);
    if (!pid) return;
    lastTextRef.current = text;
    lastTimeRef.current = now;
    processScan(pid);
  }, [processScan]);

  const openCamera = useCallback(async () => {
    if (autoReturnTimer.current) { clearTimeout(autoReturnTimer.current); autoReturnTimer.current = null; }
    setCameraError(null);
    setMode("camera");
    setResult(null);
    processingRef.current = false;
    lastTextRef.current = "";

    setTimeout(async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("scanner-viewport", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
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
        if (msg.includes("ermission") || msg.includes("denied")) setCameraError("Camera permission denied. Please allow camera access in your browser settings.");
        else if (msg.includes("NotFound") || msg.includes("Requested device not found")) setCameraError("No back camera found on this device.");
        else setCameraError("Could not start camera. " + msg);
        setMode("ready");
      }
    }, 100);
  }, [handleScanText]);

  const closeCamera = useCallback(async () => {
    if (autoReturnTimer.current) { clearTimeout(autoReturnTimer.current); autoReturnTimer.current = null; }
    await stopCamera();
    setMode("ready");
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (autoReturnTimer.current) clearTimeout(autoReturnTimer.current);
    };
  }, [stopCamera]);

  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
  const pilgrim = result?.pilgrim;
  const alreadyPresent = result?.alreadyPresent;

  return (
    <AdminLayout>
      {/* Camera Full-Screen Overlay */}
      {mode === "camera" && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: "none" }}>
          {/* Camera Top Bar */}
          <div className="flex items-center justify-between px-4 pt-safe-top py-3" style={{ background: "rgba(0,0,0,0.7)" }}>
            <div>
              <p className="text-white font-bold text-base leading-tight">{eventName || "Attendance Scanner"}</p>
              <p className="text-emerald-400 text-xs font-medium">{presentCount} / {totalCount} present</p>
            </div>
            <button onClick={closeCamera} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/20 text-white active:bg-white/40">
              <X size={20} />
            </button>
          </div>

          {/* Viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <div id="scanner-viewport" className="w-full h-full" />

            {/* Corner brackets overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative" style={{ width: 260, height: 160 }}>
                <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-emerald-400" style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-emerald-400" style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-emerald-400" style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-emerald-400" style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
                {/* Scan line animation */}
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

          {/* Camera Bottom Hint */}
          <div className="py-4 text-center" style={{ background: "rgba(0,0,0,0.7)" }}>
            {cameraError ? (
              <p className="text-red-400 text-sm px-6">{cameraError}</p>
            ) : (
              <p className="text-white/70 text-sm">Point camera at pilgrim's QR code or barcode</p>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-sm mx-auto space-y-4 pb-8">

        {/* Header Row */}
        <div className="flex items-center justify-between">
          <Link href={`/admin/groups/${groupId}/attendance`}>
            <button className="flex items-center gap-1 text-sm text-gray-500 active:text-gray-800">
              <ArrowLeft size={16} /> Back
            </button>
          </Link>
          <div className="text-right">
            <p className="font-semibold text-sm">{eventName || "Scanner"}</p>
            <p className="text-xs text-muted-foreground">Attendance</p>
          </div>
        </div>

        {/* Live Tally */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Users size={14} className="text-[#0d5040]" /> Live Tally
            </div>
            <span className="text-sm font-bold text-[#0d5040]">{pct}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
            <div className="h-3 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-emerald-600">{presentCount} present</span>
            <span className="text-red-500">{totalCount - presentCount} missing</span>
            <span className="text-gray-400">{totalCount} total</span>
          </div>
        </div>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
            <WifiOff size={18} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">You're offline</p>
              <p className="text-xs text-amber-700">Scans will be queued and synced when online</p>
            </div>
          </div>
        )}
        {isOnline && queueCount > 0 && (
          <button onClick={drainQueue} className="w-full rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3 active:bg-blue-100">
            <RefreshCw size={18} className="text-blue-600 shrink-0" />
            <p className="text-sm font-semibold text-blue-800 flex-1 text-left">Sync {queueCount} offline scan{queueCount > 1 ? "s" : ""}</p>
          </button>
        )}

        {/* Last Result Card */}
        {mode === "result" && (
          <div className={`rounded-2xl border shadow-md overflow-hidden ${alreadyPresent ? "border-amber-300" : result ? "border-emerald-300" : "border-red-300"}`}>
            {/* Status Banner */}
            <div className={`px-4 py-3 flex items-center gap-3 ${alreadyPresent ? "bg-amber-500" : result ? "bg-emerald-500" : "bg-red-500"}`}>
              {alreadyPresent
                ? <AlertCircle size={22} className="text-white shrink-0" />
                : result
                  ? <CheckCircle2 size={22} className="text-white shrink-0" />
                  : <XCircle size={22} className="text-white shrink-0" />}
              <p className="text-white font-bold text-base">
                {alreadyPresent ? "Already Present" : result ? "Marked Present ✓" : "Not Found"}
              </p>
            </div>

            {pilgrim && (
              <div className="bg-white p-4 space-y-3">
                {/* Photo + Name Row */}
                <div className="flex items-center gap-4">
                  {pilgrim.photoUrl ? (
                    <img src={`${API}${pilgrim.photoUrl}`} alt={pilgrim.fullName}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#0d5040]/10 flex items-center justify-center text-[#0d5040] font-bold text-2xl shrink-0">
                      {pilgrim.fullName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-lg leading-tight truncate">{pilgrim.fullName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Serial #{pilgrim.serialNumber}</p>
                  </div>
                </div>

                {/* Detail Grid */}
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

                {/* Family Members */}
                {result?.familyMembers && result.familyMembers.length > 1 && (
                  <div className="rounded-lg bg-[#0d5040]/5 px-3 py-2">
                    <p className="text-[10px] font-bold text-[#0d5040] uppercase tracking-wide mb-1.5">
                      👨‍👩‍👧‍👦 Family — {result.familyMembers.length} members
                    </p>
                    <div className="space-y-1">
                      {result.familyMembers.map(m => (
                        <div key={m.id} className="flex items-center justify-between text-xs">
                          <span className="truncate flex-1 text-gray-700">
                            {m.familyHead && <span className="text-[#C9A23F] mr-1">★</span>}
                            {m.fullName}
                            {m.familyRelation && <span className="text-gray-400 ml-1">· {m.familyRelation}</span>}
                          </span>
                          <span className={`ml-2 font-bold shrink-0 ${m.attendanceStatus === "present" ? "text-emerald-600" : m.attendanceStatus === "absent" ? "text-red-500" : "text-gray-300"}`}>
                            {m.attendanceStatus === "present" ? "✓" : m.attendanceStatus === "absent" ? "✗" : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!pilgrim && mode === "result" && (
              <div className="bg-white p-6 text-center">
                <p className="text-gray-500 text-sm">Pilgrim not found in this group. Try scanning again.</p>
              </div>
            )}
          </div>
        )}

        {/* SCAN Button */}
        <button
          onClick={openCamera}
          disabled={processing}
          className="w-full rounded-2xl flex items-center justify-center gap-3 font-bold text-xl text-white active:scale-95 transition-transform shadow-lg disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #0d5040 0%, #1a7a60 100%)", minHeight: 72, padding: "18px 24px" }}
        >
          <Camera size={28} />
          {mode === "result" ? "Scan Next" : "Scan QR / Barcode"}
        </button>

        {cameraError && mode !== "camera" && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <XCircle size={16} className="shrink-0 mt-0.5" />
            {cameraError}
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Supports QR codes and CODE128 barcodes
        </p>
      </div>
    </AdminLayout>
  );
}
