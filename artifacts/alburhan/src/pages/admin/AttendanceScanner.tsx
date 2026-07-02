import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle, Users, QrCode, Loader2 } from "lucide-react";

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

export default function AttendanceScanner() {
  const [, params] = useRoute("/admin/groups/:groupId/attendance/:eventId/scan");
  const groupId = params?.groupId;
  const eventId = params?.eventId;
  const { toast } = useToast();

  const [eventName, setEventName] = useState("");
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastScan, setLastScan] = useState<{
    name: string; familyId: string | null; serialNumber: number; status: string; photoUrl: string | null;
    familyMembers?: { id: string; fullName: string; serialNumber: number; familyRelation: string | null; familyHead: boolean | null; attendanceStatus: string | null }[];
  } | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error" | "duplicate">("idle");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const lastScannedIdRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!groupId || !eventId) return;
    fetch(`${API}/api/groups/${groupId}/attendance/events`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: any[]) => {
        const ev = data.find((e: any) => e.id === eventId);
        if (ev) {
          setEventName(ev.name);
          setPresentCount(ev.present);
          setTotalCount(ev.total);
        }
      })
      .catch(() => {});
  }, [groupId, eventId]);

  const handleScan = useCallback(async (qrText: string) => {
    const now = Date.now();
    if (processingRef.current) return;
    if (qrText === lastScannedIdRef.current && now - lastScannedTimeRef.current < 3000) return;

    const pilgrimId = parsePilgrimId(qrText);
    if (!pilgrimId) return;

    processingRef.current = true;
    lastScannedIdRef.current = qrText;
    lastScannedTimeRef.current = now;

    try {
      if (navigator.vibrate) navigator.vibrate(100);
      setScanning(true);

      const res = await fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilgrimId, status: "present" }),
      });

      const data = await res.json();
      if (!res.ok) {
        setScanStatus("error");
        setLastScan(null);
        toast({ title: data.error || "Scan failed", variant: "destructive" });
      } else {
        setScanStatus("success");
        setLastScan({
          name: data.pilgrim.fullName,
          familyId: data.pilgrim.familyId,
          serialNumber: data.pilgrim.serialNumber,
          status: data.status,
          photoUrl: data.pilgrim.photoUrl,
          familyMembers: data.familyMembers || [],
        });
        setPresentCount(data.presentCount);
        setTotalCount(data.totalCount);
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      }
    } catch {
      setScanStatus("error");
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setScanning(false);
      processingRef.current = false;
      setTimeout(() => setScanStatus("idle"), 2500);
    }
  }, [groupId, eventId, toast]);

  useEffect(() => {
    let html5QrCode: any = null;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          (text: string) => { handleScan(text); },
          undefined
        );
        setCameraError(null);
      } catch (err: any) {
        console.error("QR scanner error:", err);
        if (err?.toString().includes("Permission")) {
          setCameraError("Camera permission denied. Please allow camera access.");
        } else if (err?.toString().includes("NotFound")) {
          setCameraError("No camera found on this device.");
        } else {
          setCameraError("Could not start camera: " + (err?.message || err));
        }
      }
    }

    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [handleScan]);

  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/admin/groups/${groupId}/attendance`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft size={16} /> Back
          </Button>
        </Link>
        <div className="text-right">
          <p className="font-semibold text-sm">{eventName || "Loading…"}</p>
          <p className="text-xs text-muted-foreground">QR Scanner</p>
        </div>
      </div>

      <div className="max-w-sm mx-auto space-y-4">
        {/* Live Tally */}
        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users size={15} className="text-[#0d5040]" /> Live Tally
            </div>
            <span className="text-sm font-bold text-[#0d5040]">{pct}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 mb-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="text-emerald-600 font-semibold">{presentCount} present</span>
            <span className="text-red-500 font-semibold">{totalCount - presentCount} missing</span>
            <span>{totalCount} total</span>
          </div>
        </div>

        {/* Scanner Viewfinder */}
        <div className="relative border rounded-xl overflow-hidden bg-black shadow-md">
          <div id="qr-reader" className="w-full" />
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={30} className="text-white animate-spin" />
            </div>
          )}
          {scanStatus === "success" && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/80 animate-pulse">
              <CheckCircle2 size={64} className="text-white" />
            </div>
          )}
          {scanStatus === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/80">
              <XCircle size={64} className="text-white" />
            </div>
          )}
        </div>

        {cameraError && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-center text-sm text-red-700">
            <XCircle size={20} className="mx-auto mb-1" />
            {cameraError}
          </div>
        )}

        {/* Last Scan Result */}
        {lastScan && (
          <div className={`border rounded-xl bg-white shadow-sm transition-all overflow-hidden ${scanStatus === "success" ? "border-emerald-300" : "border-gray-200"}`}>
            <div className="flex items-center gap-3 p-4">
              {lastScan.photoUrl ? (
                <img src={`${API}${lastScan.photoUrl}`} alt={lastScan.name} className="w-12 h-12 rounded-full object-cover border-2 border-emerald-200 shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#0d5040]/10 flex items-center justify-center text-[#0d5040] font-bold text-lg shrink-0">
                  {lastScan.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{lastScan.name}</p>
                <p className="text-xs text-muted-foreground">
                  #{lastScan.serialNumber}{lastScan.familyId ? ` · Family ${lastScan.familyId}` : ""}
                </p>
              </div>
              <Badge className={lastScan.status === "present" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}>
                {lastScan.status === "present" ? "✓ Present" : "✗ Absent"}
              </Badge>
            </div>

            {/* Family Members Rollup */}
            {lastScan.familyId && lastScan.familyMembers && lastScan.familyMembers.length > 1 && (
              <div className="border-t bg-[#0d5040]/5 px-3 py-2">
                <p className="text-[10px] font-bold text-[#0d5040] uppercase tracking-wide mb-1.5">
                  👨‍👩‍👧‍👦 Family {lastScan.familyId} — {lastScan.familyMembers.length} members
                </p>
                <div className="space-y-1">
                  {lastScan.familyMembers.map(m => {
                    const isScanned = m.id === lastScan.familyMembers?.find(fm => fm.fullName === lastScan.name && fm.serialNumber === lastScan.serialNumber)?.id;
                    const status = m.attendanceStatus;
                    return (
                      <div key={m.id} className={`flex items-center justify-between text-xs py-0.5 px-1.5 rounded ${isScanned ? "bg-emerald-100 font-semibold" : ""}`}>
                        <span className="truncate flex-1">
                          {m.familyHead && <span className="text-[#C9A23F] mr-1">★</span>}
                          {m.fullName}
                          {m.familyRelation && <span className="text-muted-foreground ml-1 font-normal">· {m.familyRelation}</span>}
                        </span>
                        <span className={`shrink-0 ml-2 font-semibold ${status === "present" ? "text-emerald-600" : status === "absent" ? "text-red-500" : "text-gray-400"}`}>
                          {status === "present" ? "✓" : status === "absent" ? "✗" : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Link href={`/admin/groups/${groupId}/attendance/${eventId}/report`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <QrCode size={13} /> View Report
            </Button>
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Point camera at a pilgrim's QR code to mark attendance
        </p>
      </div>
    </AdminLayout>
  );
}
