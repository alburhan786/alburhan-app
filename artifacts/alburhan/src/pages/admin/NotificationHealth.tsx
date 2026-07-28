// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFCM } from "@/hooks/useFCM";
import { useAuth } from "@/hooks/use-auth";
import {
  RefreshCw, MessageSquare, Mail, Phone, Bell, Radio, CheckCircle, XCircle,
  Clock, TrendingUp, AlertTriangle, Activity, Send, Users, Smartphone, Zap,
  Check, X, ShieldCheck, Power, Play, BellRing, BellOff, Loader2,
  ChevronDown, ChevronUp, ClipboardList
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SuccessBar({ rate }: { rate: number }) {
  const color = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
        <span>Success</span><span className="font-bold">{rate}%</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

const PROV_META: Record<string, { label: string; channel: string; icon: any; color: string; bg: string }> = {
  botbee:   { label: "BotBee WhatsApp",  channel: "whatsapp", icon: MessageSquare, color: "text-green-700",  bg: "bg-green-50"  },
  fast2sms: { label: "Fast2SMS SMS",     channel: "sms",      icon: Phone,         color: "text-blue-700",   bg: "bg-blue-50"   },
  smtp:     { label: "SMTP Email",       channel: "email",    icon: Mail,          color: "text-orange-700", bg: "bg-orange-50" },
  firebase: { label: "Firebase FCM",     channel: "push",     icon: Bell,          color: "text-yellow-700", bg: "bg-yellow-50" },
  lemin:    { label: "Lemin AI RCS",     channel: "rcs",      icon: Radio,         color: "text-purple-700", bg: "bg-purple-50" },
};

const CH_META: Record<string, { icon: any; label: string }> = {
  whatsapp: { icon: MessageSquare, label: "WhatsApp" },
  sms:      { icon: Phone,         label: "SMS"      },
  email:    { icon: Mail,          label: "Email"    },
  push:     { icon: Bell,          label: "Push"     },
  rcs:      { icon: Radio,         label: "RCS"      },
};

// ── Notification type labels for production validation results ──
const NOTIF_LABELS: Record<string, string> = {
  "1_booking_confirmation": "1. Booking Confirmation",
  "2_invoice":              "2. Invoice Ready",
  "3_payment_receipt":      "3. Payment Receipt",
  "4_agreement":            "4. Agreement PDF",
  "5_visa_ready":           "5. Visa Ready",
  "6_flight_ticket":        "6. Flight Ticket",
  "7_hotel_voucher":        "7. Hotel Voucher",
  "8_departure_reminder":   "8. Departure Reminder",
  "push_admin":             "Push (Admin)",
};

// ── Push registration widget ──────────────────────────────────────────────────
function PushRegistrationWidget() {
  const { user } = useAuth();
  const { permission, isRegistered, isLoading, error, requestPermission, token } = useFCM(
    user?.role === "customer" ? "customer" : "admin"
  );

  if (permission === "granted" && isRegistered) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700">
        <BellRing size={14} className="shrink-0" />
        Push registered — this device will receive notifications
        {token && <span className="font-mono text-[9px] text-gray-400 truncate max-w-[120px]" title={token}>{token.slice(0,12)}…</span>}
      </div>
    );
  }
  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
        <BellOff size={14} className="shrink-0" />
        Push blocked — enable notifications in browser settings
      </div>
    );
  }
  if (permission === "unsupported" || permission === "not_configured") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
        <BellOff size={14} className="shrink-0" />
        Push not supported in this browser
      </div>
    );
  }
  // default or loading — show Register button
  return (
    <button
      onClick={requestPermission}
      disabled={isLoading}
      className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-60"
    >
      {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
      {isLoading ? "Registering…" : "Register Push for This Device"}
      {error && <span className="text-red-500 ml-1">{error.slice(0,40)}</span>}
    </button>
  );
}

// ── Production Validation Panel ───────────────────────────────────────────────
function ProductionValidationPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [expanded, setExpanded] = useState(true);

  async function runValidation() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/admin/production-validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      setResult(d);
      if (d.ok) {
        toast({ title: "Production validation complete", description: `Booking ${d.bookingNumber} — all enabled channels tested.` });
      } else {
        toast({ title: "Validation finished with errors", description: d.error || "Check results below.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  function channelPills(notifResult: any) {
    if (!notifResult || notifResult.error) {
      return <span className="text-xs text-red-500">Error: {notifResult?.error || "unknown"}</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {Object.entries(notifResult).map(([ch, r]: [string, any]) => {
          if (typeof r !== "object") return null;
          const ok = r?.ok === true;
          return (
            <span key={ch} className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
              {ok ? <Check size={9}/> : <X size={9}/>}
              {ch.toUpperCase()}
              {!ok && r?.error && <span className="font-normal ml-0.5 opacity-70 max-w-[80px] truncate" title={r.error}>{r.error.slice(0,25)}</span>}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-[#0A3D2A]/20 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0A3D2A]/5 border-b border-[#0A3D2A]/10 hover:bg-[#0A3D2A]/8 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/20 flex items-center justify-center">
            <ClipboardList size={16} className="text-[#C9A84C]" />
          </div>
          <div className="text-left">
            <p className="font-bold text-[#0A3D2A] text-sm">Final Production Validation</p>
            <p className="text-xs text-gray-500">Fire all 8 notification types on a real booking across all channels</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <Badge className={result.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}>
              {result.ok ? "Passed" : "Issues Found"}
            </Badge>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
            <Activity size={14} className="shrink-0 mt-0.5 text-blue-500" />
            <div>
              <span className="font-semibold">What this validates:</span> Finds the latest test/approved booking and fires all 8 notification events —
              Booking Confirmation, Invoice, Payment Receipt, Agreement, Visa Ready, Flight Ticket, Hotel Voucher, Departure Reminder — across SMS, WhatsApp, Email, and Push.
              Real messages are delivered to the registered mobile/email.
            </div>
          </div>

          <Button
            onClick={runValidation}
            disabled={running}
            className="w-full bg-[#0A3D2A] hover:bg-[#083021] text-[#C9A84C] font-bold h-11"
          >
            {running
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running full validation…</>
              : <><Play className="mr-2 h-4 w-4" />Run Full Production Validation</>
            }
          </Button>

          {result && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
              {/* Booking info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-gray-50 rounded-lg border text-xs">
                <div><span className="text-gray-500">Booking</span><div className="font-mono font-bold text-gray-800">{result.bookingNumber}</div></div>
                <div><span className="text-gray-500">Customer</span><div className="font-semibold text-gray-800 truncate">{result.customerName}</div></div>
                <div><span className="text-gray-500">Mobile</span><div className="font-mono text-gray-700">{result.mobile}</div></div>
                <div><span className="text-gray-500">Email</span><div className="font-mono text-gray-600 truncate">{result.email || "—"}</div></div>
              </div>

              {/* Notification results table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-[#0A3D2A] px-3 py-2 flex justify-between items-center">
                  <span className="text-white text-xs font-bold uppercase tracking-wider">Delivery Results</span>
                  <span className="text-[#C9A84C] text-xs font-mono">
                    {Object.values(result.results || {}).filter((r: any) => !r?.error && Object.values(r).some((ch: any) => ch?.ok)).length} / {Object.keys(result.results || {}).length} passed
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {Object.entries(result.results || {}).map(([key, val]: [string, any]) => {
                    const label = NOTIF_LABELS[key] || key;
                    const hasError = !!val?.error;
                    const passCount = hasError ? 0 : Object.values(val).filter((ch: any) => ch?.ok === true).length;
                    const totalCh = hasError ? 0 : Object.keys(val).length;
                    return (
                      <div key={key} className={`flex items-center justify-between px-3 py-2.5 gap-3 ${hasError ? "bg-red-50" : passCount > 0 ? "" : "bg-amber-50/50"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {hasError || passCount === 0
                            ? <XCircle size={14} className="text-red-500 shrink-0" />
                            : <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                          }
                          <span className="text-xs font-semibold text-gray-800 truncate">{label}</span>
                        </div>
                        <div className="shrink-0">{channelPills(val)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[10px] text-gray-400 text-right">
                Validated at {result.validatedAt ? new Date(result.validatedAt).toLocaleString("en-IN") : "—"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NotificationHealth() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [pushStats, setPushStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningChecks, setRunningChecks] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);

  // E2E Test State
  const [e2eOpen, setE2eOpen] = useState(false);
  const [e2eMobile, setE2eMobile] = useState("");
  const [e2eEmail, setE2eEmail] = useState("");
  const [e2eRunning, setE2eRunning] = useState(false);
  const [e2eResults, setE2eResults] = useState<any>(null);

  // Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastUrl, setBroadcastUrl] = useState("/");
  const [broadcasting, setBroadcasting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        fetch(`${API}/api/admin/notification-health`, { credentials: "include" }),
        fetch(`${API}/api/push/admin/stats`, { credentials: "include" }),
      ]);
      if (r.ok) setData(await r.json());
      if (p.ok) setPushStats(await p.json());
    } catch {
      toast({ title: "Error", description: "Failed to load notification health data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function runChecks() {
    setRunningChecks(true);
    try {
      const res = await fetch(`${API}/api/admin/notification-health/run-checks`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        toast({ title: "Live checks completed", description: "All 5 provider statuses updated." });
        load();
      } else {
        toast({ title: "Error", description: json.error || "Failed to run checks.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to run provider checks.", variant: "destructive" });
    } finally {
      setRunningChecks(false);
    }
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    try {
      const r = await fetch(`${API}/api/notification-center/retry-all-failed`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        toast({ title: "Retry queued", description: `${d.queued || 0} failed notifications re-queued for delivery.` });
        setTimeout(load, 2000);
      } else {
        toast({ title: "Error", description: d.error || "Could not retry failed messages.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not retry failed messages.", variant: "destructive" });
    } finally {
      setRetryingAll(false);
    }
  }

  async function runE2E() {
    if (!e2eMobile) {
      toast({ title: "Required", description: "Mobile number is required.", variant: "destructive" });
      return;
    }
    setE2eRunning(true);
    setE2eResults(null);
    try {
      const res = await fetch(`${API}/api/admin/e2e-test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: e2eMobile, email: e2eEmail }),
      });
      const json = await res.json();
      if (res.ok) {
        setE2eResults(json);
        toast({ title: "E2E test completed", description: `${Object.values(json.channels||{}).filter((c: any)=>c.ok).length}/5 channels passed.` });
        load();
      } else {
        toast({ title: "Error", description: json.error || "E2E test failed.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to execute E2E test.", variant: "destructive" });
    } finally {
      setE2eRunning(false);
    }
  }

  async function sendBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast({ title: "Required", description: "Title and body are required.", variant: "destructive" });
      return;
    }
    setBroadcasting(true);
    try {
      const r = await fetch(`${API}/api/push/admin/broadcast`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, url: broadcastUrl || "/" }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: "Push broadcast sent!", description: `Delivered to ${d.sent} devices. ${d.failed} failed.` });
        setBroadcastTitle(""); setBroadcastBody(""); setBroadcastUrl("/");
        load();
      } else {
        toast({ title: "Error", description: d.error || "Broadcast failed.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not send broadcast.", variant: "destructive" });
    } finally {
      setBroadcasting(false);
    }
  }

  const overall = data?.overall || { total: 0, sent: 0, failed: 0, avg_retries: 0 };
  const overallRate = overall.total > 0 ? Math.round((overall.sent / overall.total) * 100) : 0;
  const pStatus = data?.providerStatus || {};

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A] flex items-center gap-2.5">
              <ShieldCheck className="text-[#C9A84C]" size={28} />
              Notification Health Center
            </h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">5-channel delivery monitoring, live diagnostics, and production validation</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runChecks} disabled={runningChecks || loading} variant="outline"
              className="border-[#0A3D2A] text-[#0A3D2A] hover:bg-[#0A3D2A] hover:text-white h-9 text-xs">
              <Power className={`mr-1.5 h-3.5 w-3.5 ${runningChecks ? "animate-spin" : ""}`} /> Run Live Checks
            </Button>
            <Button onClick={() => setE2eOpen(true)} className="bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021] h-9 text-xs">
              <Zap className="mr-1.5 h-3.5 w-3.5" /> E2E Test
            </Button>
            <Button onClick={retryAllFailed} disabled={retryingAll || loading} variant="destructive" className="bg-red-600 hover:bg-red-700 h-9 text-xs">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${retryingAll ? "animate-spin" : ""}`} /> Retry Failed
            </Button>
            <Button onClick={load} disabled={loading} variant="outline" className="h-9 w-9 p-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Push Registration Widget ───────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0A3D2A]">
            <Bell size={16} className="text-[#C9A84C]" />
            Browser Push Registration
          </div>
          <PushRegistrationWidget />
        </div>

        {/* ── Overall KPIs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-[#0A3D2A] text-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Total (30d)</div>
            <div className="text-3xl font-mono font-bold text-[#C9A84C]">{overall.total.toLocaleString()}</div>
          </Card>
          <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Delivered</div>
            <div className="text-3xl font-mono font-bold">{overall.sent.toLocaleString()}</div>
          </Card>
          <Card className={`p-4 shadow-sm ${overall.failed > 0 ? "border-red-200 bg-red-50 text-red-900" : "bg-gray-50 text-gray-700"}`}>
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Failed</div>
            <div className="text-3xl font-mono font-bold">{overall.failed.toLocaleString()}</div>
          </Card>
          <Card className="p-4 bg-gray-50 text-[#0A3D2A] shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Success Rate</div>
            <div className="text-3xl font-mono font-bold">{overallRate}%</div>
          </Card>
        </div>

        {/* ── Provider Status Panel ──────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A3D2A] mb-3 border-b pb-1">Live Provider Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.keys(PROV_META).map(key => {
              const meta = PROV_META[key];
              const info = pStatus[key] || meta;
              const cData = data?.channels?.[meta.channel] || {};
              const st = info.status || "unknown";
              const rate = cData.total > 0 ? Math.round((cData.sent / cData.total) * 100) : null;
              const Icon = meta.icon;

              const statusStyle =
                st === "connected"  ? "bg-emerald-500 text-white border-transparent" :
                st === "failed"     ? "bg-red-500 text-white border-transparent" :
                st === "configured" ? "bg-amber-500 text-white border-transparent" :
                                      "bg-gray-200 text-gray-700 border-transparent";

              return (
                <Card key={key} className={`p-3 shadow-sm flex flex-col gap-2 border ${st === "connected" ? "border-emerald-200" : st === "failed" ? "border-red-200" : "border-gray-200"}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5">
                      <Icon size={13} className={meta.color} />
                      <span className="font-bold text-xs text-[#0A3D2A] leading-tight">{meta.label}</span>
                    </div>
                    <Badge variant="outline" className={`text-[9px] uppercase px-1.5 py-0 min-w-0 flex-shrink-0 font-bold ${statusStyle}`}>{st}</Badge>
                  </div>

                  {/* Success rate bar */}
                  {rate !== null && <SuccessBar rate={rate} />}

                  <div className="text-[10px] space-y-1 text-gray-600 mt-0.5">
                    <div className="flex justify-between">
                      <span className="opacity-80">Last Success:</span>
                      <span className={`font-mono font-medium ${cData.lastSuccess ? "text-emerald-700" : "text-gray-400"}`}>
                        {cData.lastSuccess ? formatTimeAgo(cData.lastSuccess) : "Never"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-80">Last Failure:</span>
                      <span className={`font-mono font-medium ${cData.lastFailure ? "text-red-600" : "text-gray-400"}`}>
                        {cData.lastFailure ? formatTimeAgo(cData.lastFailure) : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-1">
                      <span className="opacity-80">Queue / Retries:</span>
                      {(cData.pendingRetries || 0) > 0 ? (
                        <Badge className="bg-red-500 text-white text-[9px] px-1 py-0 h-4">{cData.pendingRetries}</Badge>
                      ) : (
                        <span className="font-mono font-bold text-gray-400">0</span>
                      )}
                    </div>
                    {info.lastTested && (
                      <div className="flex justify-between pt-0.5 border-t">
                        <span className="opacity-80">Last Tested:</span>
                        <span className="font-mono text-gray-500">{new Date(info.lastTested).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Channel Delivery Cards ─────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A3D2A] mb-3 border-b pb-1">Channel Delivery Performance (30d)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.keys(CH_META).map(ch => {
              const cData = data?.channels?.[ch] || { total: 0, sent: 0, failed: 0, avgRetries: 0 };
              const rate = cData.total > 0 ? Math.round((cData.sent / cData.total) * 100) : 0;
              const healthColor = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500";
              const textColor = rate >= 90 ? "text-emerald-700" : rate >= 70 ? "text-amber-700" : "text-red-700";
              const Icon = CH_META[ch].icon;

              return (
                <Card key={ch} className="p-4 shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 font-bold capitalize text-sm text-[#0A3D2A]">
                      <Icon size={16} /> {CH_META[ch].label}
                    </div>
                    <span className={`text-lg font-bold font-mono ${textColor}`}>{rate}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div className={`h-full ${healthColor} transition-all duration-500`} style={{ width: `${rate}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs mb-3">
                    <div className="bg-gray-50 rounded py-1.5 border border-gray-100">
                      <div className="font-mono font-bold text-gray-800">{cData.total.toLocaleString()}</div>
                      <div className="text-[9px] text-gray-500 uppercase mt-0.5">Total</div>
                    </div>
                    <div className="bg-emerald-50 rounded py-1.5 border border-emerald-100">
                      <div className="font-mono font-bold text-emerald-700">{cData.sent.toLocaleString()}</div>
                      <div className="text-[9px] text-emerald-600 uppercase mt-0.5">Sent</div>
                    </div>
                    <div className="bg-red-50 rounded py-1.5 border border-red-100">
                      <div className="font-mono font-bold text-red-700">{cData.failed.toLocaleString()}</div>
                      <div className="text-[9px] text-red-600 uppercase mt-0.5">Failed</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="flex justify-between">
                      <span>Last Success:</span>
                      <span className={`font-mono ${cData.lastSuccess ? "text-emerald-700" : "text-gray-400"}`}>
                        {cData.lastSuccess ? formatTimeAgo(cData.lastSuccess) : "Never"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Failure:</span>
                      <span className={`font-mono ${cData.lastFailure ? "text-red-500" : "text-gray-400"}`}>
                        {cData.lastFailure ? formatTimeAgo(cData.lastFailure) : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Retries:</span>
                      <span className="font-mono font-medium text-gray-700">{cData.avgRetries?.toFixed(1) || "0"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Queue:</span>
                      <span className={`font-mono font-bold ${cData.pendingRetries > 0 ? "text-red-500" : "text-gray-400"}`}>{cData.pendingRetries || 0}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Production Validation ──────────────────────────────────────── */}
        <ProductionValidationPanel />

        {/* ── Detailed Tabs ─────────────────────────────────────────────── */}
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-gray-100 h-10 p-1 rounded-lg">
            <TabsTrigger value="daily"  className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Last 7 Days</TabsTrigger>
            <TabsTrigger value="events" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Top Events</TabsTrigger>
            <TabsTrigger value="recent" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Recent Log</TabsTrigger>
            <TabsTrigger value="push"   className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Push Analytics</TabsTrigger>
          </TabsList>

          <div className="mt-4 border rounded-xl bg-white shadow-sm overflow-hidden">
            <TabsContent value="daily" className="m-0 border-0 p-0">
              <table className="w-full text-sm">
                <thead className="bg-[#0A3D2A] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Sent</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Failed</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Success %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.daily || []).length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No daily data available.</td></tr>
                  )}
                  {(data?.daily || []).map((row: any) => {
                    const r = row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0;
                    return (
                      <tr key={row.date} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-700">
                          {new Date(row.date).toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">{row.total}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{row.sent}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-red-500">{row.failed || 0}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: r >= 90 ? "#059669" : r >= 70 ? "#d97706" : "#dc2626" }}>{r}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="events" className="m-0 border-0 p-4">
              {(data?.topEvents || []).length === 0 ? (
                <div className="p-8 text-center text-gray-500">No event data available.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(data?.topEvents || []).map((ev: any) => (
                    <div key={ev.event_type} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg bg-gray-50 hover:border-[#0A3D2A]/30">
                      <span className="text-sm font-mono font-bold text-[#0A3D2A] truncate" title={ev.event_type}>{ev.event_type}</span>
                      <Badge className="bg-[#C9A84C] text-[#0A3D2A] hover:bg-[#C9A84C] font-mono">{ev.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent" className="m-0 border-0 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0A3D2A] text-white">
                    <tr>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Timestamp</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Event</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Channel</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Recipient</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data?.recent || []).length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-500">No recent notifications logged.</td></tr>
                    )}
                    {(data?.recent || []).map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                          {r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "N/A"}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{r.event_type}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold text-[#0A3D2A] border-[#0A3D2A]/30 bg-[#0A3D2A]/5">{r.channel}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-600">{r.recipient}</td>
                        <td className="px-4 py-2.5">
                          {r.status === "sent" || r.status === "delivered"
                            ? <Badge className="bg-emerald-500 text-white text-[10px]">Success</Badge>
                            : r.status === "failed"
                              ? <Badge className="bg-red-500 text-white text-[10px]">Failed</Badge>
                              : <Badge className="bg-amber-500 text-white text-[10px] uppercase">{r.status}</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-[10px] text-red-600 font-mono truncate max-w-[200px]" title={r.error_code || ""}>{r.error_code || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="push" className="m-0 border-0 p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscriber Stats */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#0A3D2A] flex items-center gap-2 border-b pb-2">
                    <Users size={16} className="text-[#C9A84C]" /> Subscriber Demographics
                  </h3>
                  {pushStats ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-xl border text-center">
                          <div className="text-3xl font-mono font-bold text-[#0A3D2A]">{pushStats.unique_subscribers || 0}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Subscribers</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border text-center">
                          <div className="text-3xl font-mono font-bold text-[#0A3D2A]">{pushStats.total_tokens || 0}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Active Devices</div>
                        </div>
                      </div>
                      {pushStats.by_platform?.length > 0 && (
                        <div className="bg-white border rounded-xl p-4">
                          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-2 mb-3">Platform Breakdown</div>
                          <div className="space-y-2">
                            {pushStats.by_platform.map((p: any) => (
                              <div key={p.platform} className="flex justify-between items-center text-sm">
                                <span className="capitalize text-gray-600 flex items-center gap-2">
                                  <Smartphone size={14} className="text-gray-400" /> {p.platform}
                                </span>
                                <span className="font-mono font-bold bg-gray-100 px-2 py-0.5 rounded text-[#0A3D2A]">{p.cnt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pushStats.by_user_type?.length > 0 && (
                        <div className="bg-white border rounded-xl p-4">
                          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-2 mb-3">By User Type</div>
                          <div className="space-y-2">
                            {pushStats.by_user_type.map((p: any) => (
                              <div key={p.user_type} className="flex justify-between items-center text-sm">
                                <span className="capitalize text-gray-600">{p.user_type}</span>
                                <span className="font-mono font-bold bg-gray-100 px-2 py-0.5 rounded text-[#0A3D2A]">{p.cnt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs font-medium border rounded-xl p-3 bg-gray-50">
                        <div className="flex items-center gap-1.5"><Activity size={14} className="text-gray-400" /> Last 24 Hours</div>
                        <div className="flex gap-4">
                          <span className="text-gray-600">Sent: <strong className="text-emerald-600 font-mono text-sm ml-1">{pushStats.sent_24h || 0}</strong></span>
                          <span className="text-gray-600">Failed: <strong className="text-red-600 font-mono text-sm ml-1">{pushStats.failed_24h || 0}</strong></span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500 border border-dashed rounded-xl bg-gray-50 text-sm">
                      No push subscriber data available. Register push on this device to get started.
                    </div>
                  )}
                </div>

                {/* Broadcast Form */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#0A3D2A] flex items-center gap-2 border-b pb-2">
                    <Send size={16} className="text-[#C9A84C]" /> Global Broadcast
                  </h3>
                  <div className="bg-white border rounded-xl p-5 space-y-4">
                    <p className="text-xs text-gray-500">Send an immediate push notification to all subscribed devices.</p>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Notification Title *</label>
                        <Input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)}
                          placeholder="e.g. Flight Schedule Update" className="focus-visible:ring-[#0A3D2A] border-gray-300" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Message Body *</label>
                        <Input value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)}
                          placeholder="e.g. Please check your updated itinerary..." className="focus-visible:ring-[#0A3D2A] border-gray-300" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Deep Link URL (Optional)</label>
                        <Input value={broadcastUrl} onChange={e => setBroadcastUrl(e.target.value)}
                          placeholder="e.g. /my-bookings" className="font-mono text-xs focus-visible:ring-[#0A3D2A] border-gray-300" />
                      </div>
                    </div>
                    <Button onClick={sendBroadcast} disabled={broadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
                      className="w-full bg-[#0A3D2A] hover:bg-[#083021] text-[#C9A84C] font-bold h-10">
                      {broadcasting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Broadcast to {pushStats?.unique_subscribers || 0} Devices
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── E2E Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={e2eOpen} onOpenChange={setE2eOpen}>
        <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-[#0A3D2A] p-4 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#C9A84C] text-xl">
                <Zap className="h-5 w-5" /> End-to-End Delivery Test
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-white/70 mt-1">Fire a real test message across all 5 configured channels simultaneously.</p>
          </div>
          <div className="p-5 space-y-5 bg-white">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Mobile Number *</label>
                <Input value={e2eMobile} onChange={e => setE2eMobile(e.target.value)} placeholder="e.g. 9876543210" className="font-mono" />
                <p className="text-[10px] text-gray-500">10-digit Indian number or with country code.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Email Address</label>
                <Input value={e2eEmail} onChange={e => setE2eEmail(e.target.value)} placeholder="e.g. test@example.com" className="font-mono" />
                <p className="text-[10px] text-gray-500">Required for SMTP email test.</p>
              </div>
            </div>
            <Button onClick={runE2E} disabled={e2eRunning || !e2eMobile} className="w-full bg-[#0A3D2A] hover:bg-[#083021] text-[#C9A84C] font-bold">
              {e2eRunning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Execute Full E2E Test
            </Button>
            {e2eResults && (
              <div className="border border-gray-200 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-gray-50 p-3 text-sm font-bold border-b flex justify-between items-center text-[#0A3D2A]">
                  <span>Results</span>
                  <Badge className="bg-[#0A3D2A] text-white">
                    {Object.values(e2eResults.channels || {}).filter((c: any) => c.ok).length} / {Object.keys(e2eResults.channels || {}).length} Passed
                  </Badge>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-2.5 font-semibold text-left">Channel</th>
                      <th className="p-2.5 font-semibold text-left">Provider</th>
                      <th className="p-2.5 font-semibold text-left">Status</th>
                      <th className="p-2.5 font-semibold text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.keys(CH_META).map(ch => {
                      const res = e2eResults.channels?.[ch] || {};
                      const Icon = CH_META[ch].icon;
                      return (
                        <tr key={ch} className="hover:bg-gray-50">
                          <td className="p-2.5 font-bold flex items-center gap-2">
                            <Icon size={13} className="text-gray-500" /> {CH_META[ch].label}
                          </td>
                          <td className="p-2.5 font-mono text-gray-600">{res.provider || "—"}</td>
                          <td className="p-2.5">
                            {res.ok
                              ? <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5"><Check size={10} className="mr-1" />Pass</Badge>
                              : <Badge className="bg-red-100 text-red-800 border border-red-200 px-2 py-0.5"><X size={10} className="mr-1" />Fail</Badge>
                            }
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-gray-500 max-w-[150px] truncate" title={res.messageId || res.errorMessage || ""}>
                            {res.messageId ? `ID: ${res.messageId}` : res.errorMessage ? <span className="text-red-500">{res.errorMessage}</span> : res.tokenCount !== undefined ? `Tokens: ${res.tokenCount}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
