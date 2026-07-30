import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle, XCircle, Send, ChevronDown, ChevronRight, AlertTriangle, Wifi, WifiOff, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const API = import.meta.env.VITE_API_URL || "";

interface RouteAttempt {
  route: string;
  requestUrl: string;
  httpStatus?: number;
  responseBody?: any;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

interface SmsLog {
  id: string;
  ts: string;
  mobileMasked: string;
  otp: string;
  finalSuccess: boolean;
  finalRoute?: string;
  attempts: RouteAttempt[];
  totalDurationMs: number;
  apiKeyPresent: boolean;
  apiKeyMasked: string;
}

function RouteTag({ route, success }: { route: string; success: boolean }) {
  const colors: Record<string, string> = {
    otp: "bg-blue-100 text-blue-800",
    dlt: "bg-purple-100 text-purple-800",
    quick: "bg-orange-100 text-orange-800",
  };
  const cls = colors[route] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${cls}`}>
      {success ? <CheckCircle size={9} /> : <XCircle size={9} />}
      {route}
    </span>
  );
}

function AttemptRow({ a }: { a: RouteAttempt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border text-xs ${a.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <RouteTag route={a.route} success={a.success} />
          <span className={`text-xs font-semibold ${a.success ? "text-green-700" : "text-red-700"}`}>
            {a.success ? "✅ Delivered" : `❌ ${a.errorMessage || "Failed"}`}
          </span>
          {a.httpStatus && <span className="text-[10px] text-muted-foreground">HTTP {a.httpStatus}</span>}
          {a.errorCode && <span className="text-[10px] font-mono text-red-600">code={a.errorCode}</span>}
          <span className="text-[10px] text-muted-foreground">{a.durationMs}ms</span>
        </div>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-inherit">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mt-2 mb-0.5">REQUEST URL</p>
            <p className="font-mono text-[10px] break-all bg-white/60 rounded p-1.5">{a.requestUrl}</p>
          </div>
          {a.responseBody !== undefined && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">PROVIDER RESPONSE</p>
              <pre className="font-mono text-[10px] break-all bg-white/60 rounded p-1.5 overflow-x-auto max-h-32 whitespace-pre-wrap">
                {JSON.stringify(a.responseBody, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LogCard({ entry }: { entry: SmsLog }) {
  const [open, setOpen] = useState(false);
  const ts = new Date(entry.ts);
  const timeStr = ts.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <Card className={`overflow-hidden border-l-4 ${entry.finalSuccess ? "border-l-green-500" : "border-l-red-500"}`}>
      <button
        type="button"
        className="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-start gap-3">
          {entry.finalSuccess
            ? <CheckCircle size={16} className="text-green-600 mt-0.5 shrink-0" />
            : <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          }
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-sm">{entry.mobileMasked}</span>
              <span className="font-mono text-sm tracking-widest text-[#0A3D2A] font-bold">{entry.otp}</span>
              {entry.finalSuccess
                ? <Badge className="bg-green-100 text-green-800 border-0 text-[10px] px-1.5">Sent via {entry.finalRoute}</Badge>
                : <Badge className="bg-red-100 text-red-800 border-0 text-[10px] px-1.5">All routes failed</Badge>
              }
              {!entry.apiKeyPresent && (
                <Badge className="bg-red-600 text-white border-0 text-[10px] px-1.5 gap-0.5 flex items-center"><WifiOff size={8} /> No API Key</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">{timeStr}</span>
              <span className="text-[10px] text-muted-foreground">· {entry.totalDurationMs}ms total</span>
              <span className="text-[10px] text-muted-foreground">· {entry.attempts.length} route{entry.attempts.length !== 1 ? "s" : ""} tried</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1">
            {entry.attempts.map((a, i) => <RouteTag key={i} route={a.route} success={a.success} />)}
          </div>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t space-y-3">
          <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground">
            <span>API Key: <span className="font-mono text-foreground">{entry.apiKeyMasked}</span></span>
            <span>ID: <span className="font-mono text-foreground">{entry.id}</span></span>
          </div>
          <div className="space-y-2">
            {entry.attempts.map((a, i) => <AttemptRow key={i} a={a} />)}
          </div>
          {entry.attempts.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
              <WifiOff size={14} className="text-red-600" />
              <span className="text-xs text-red-700 font-medium">No routes attempted — API key was missing when OTP was sent.</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function OTPDebug() {
  const { toast } = useToast();
  const { isSuper, loaded: permLoaded } = usePermissions();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [keyStatus, setKeyStatus] = useState<"ok" | "missing" | "unknown">("unknown");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/otp-debug`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.entries || []);
      // Infer key status from most recent entry
      if (data.entries?.length) {
        setKeyStatus(data.entries[0].apiKeyPresent ? "ok" : "missing");
      }
    } catch (err: any) {
      toast({ title: "Failed to load OTP logs", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const runTest = async () => {
    const clean = testPhone.replace(/\D/g, "");
    if (clean.length !== 10) {
      toast({ title: "Enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/admin/test-sms`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      });
      const data = await res.json();
      setTestResult(data);
      const anyOk = data?.diagnostics?.otp_route?.body?.return === true
        || data?.diagnostics?.dlt?.body?.return === true
        || data?.diagnostics?.quick?.body?.return === true;
      toast({
        title: anyOk ? "Test OTP sent successfully" : "All routes failed",
        description: anyOk ? `Delivered to +91 ${clean}` : "See route details below",
        variant: anyOk ? "default" : "destructive",
      });
      // Refresh logs after test
      await fetchLogs();
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const successCount = logs.filter(l => l.finalSuccess).length;
  const failCount = logs.filter(l => !l.finalSuccess).length;

  if (!permLoaded) return <AdminLayout><div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div></AdminLayout>;
  if (!isSuper) return <AdminLayout><div className="flex flex-col items-center justify-center h-64 gap-3"><Shield className="w-12 h-12 text-gray-300" /><p className="text-lg font-semibold text-gray-500">Super Admin Access Required</p><p className="text-sm text-gray-400">This page is restricted to Super Administrators only.</p></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Send size={24} className="text-[#0A3D2A]" /> OTP Debug
          </h1>
          <p className="text-muted-foreground mt-1">Real-time SMS delivery log — every route attempt, request URL, and provider response.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {keyStatus === "ok" && (
            <Badge className="bg-green-100 text-green-800 border-0 gap-1"><Wifi size={11} /> API Key OK</Badge>
          )}
          {keyStatus === "missing" && (
            <Badge className="bg-red-100 text-red-800 border-0 gap-1"><WifiOff size={11} /> API Key MISSING</Badge>
          )}
          {logs.length > 0 && (
            <>
              <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">{successCount} sent</Badge>
              <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">{failCount} failed</Badge>
            </>
          )}
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-2">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Key missing alert */}
      {keyStatus === "missing" && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">FAST2SMS_API_KEY is not set on this server</p>
            <p className="text-xs text-red-700 mt-1">
              This is why all OTPs fail. Set <code className="bg-red-100 px-1 rounded font-mono">FAST2SMS_API_KEY</code> in your <code className="bg-red-100 px-1 rounded font-mono">.env</code> file on the VPS, then restart the server with <code className="bg-red-100 px-1 rounded font-mono">pm2 restart api-server</code>.
            </p>
          </div>
        </div>
      )}

      {/* Test SMS panel */}
      <Card className="mb-6 p-4 bg-blue-50/40 border-2 border-dashed border-blue-200">
        <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2"><Send size={14} /> Send Test OTP — fires all 3 routes, shows exact responses</p>
        <div className="flex gap-2 flex-wrap">
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-xs font-medium">+91</span>
            <input
              type="tel"
              className="h-9 px-3 rounded-r-lg border border-input text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-400 w-36"
              placeholder="9XXXXXXXXX"
              maxLength={10}
              value={testPhone}
              onChange={e => setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <Button
            size="sm"
            onClick={runTest}
            disabled={testing || testPhone.replace(/\D/g, "").length !== 10}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {testing ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send Test OTP</>}
          </Button>
        </div>

        {testResult && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-semibold">Test OTP sent to device</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["otp_route", "dlt", "quick"] as const).map(k => {
                const d = testResult?.diagnostics?.[k];
                if (!d) return null;
                const ok = d?.body?.return === true;
                const errMsgs = Array.isArray(d?.body?.message) ? d.body.message.join("; ") : (d?.body?.message || d?.error || "");
                return (
                  <div key={k} className={`rounded-lg border p-3 text-xs ${ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <div className="font-bold text-[10px] uppercase tracking-wide mb-1.5">{k === "otp_route" ? "OTP Route" : k.toUpperCase()} {d.durationMs && <span className="text-muted-foreground font-normal">({d.durationMs}ms)</span>}</div>
                    {ok
                      ? <span className="text-green-700 font-semibold">✅ Delivered</span>
                      : <span className="text-red-700 break-all">{errMsgs || "Failed"}</span>
                    }
                    <details className="mt-2">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer">Raw response</summary>
                      <pre className="text-[10px] mt-1 whitespace-pre-wrap break-all overflow-x-auto max-h-24">
                        {JSON.stringify(d?.body || d?.error, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Log entries */}
      {loading && logs.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Send size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No OTP attempts recorded yet</p>
          <p className="text-sm mt-1">OTP debug logs appear here in real-time once someone tries to log in or you send a test.</p>
          <p className="text-xs mt-2 text-amber-600">Note: logs are in-memory — they reset when the server restarts.</p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Showing {logs.length} most recent attempts (newest first). Logs reset on server restart.</p>
          {logs.map(entry => <LogCard key={entry.id} entry={entry} />)}
        </div>
      )}
    </AdminLayout>
  );
}
