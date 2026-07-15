import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import {
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Send,
  Loader2, Activity, MessageCircle, Database, Shield,
  Clock, Mail, Radio, Bell, ListChecks, Cpu, HardDrive,
  MemoryStick, Wifi, RotateCcw, Server,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface HealthCheck {
  status: "ok" | "error" | "warn";
  message: string;
  detail?: any;
}

interface HealthData {
  status: "healthy" | "degraded";
  checks: Record<string, HealthCheck>;
  generatedAt: string;
  serverStartedAt?: string;
}

function StatusBadge({ status }: { status: "ok" | "error" | "warn" }) {
  if (status === "ok")    return <Badge className="bg-green-100 text-green-800 border-0 text-xs font-semibold gap-1 shrink-0"><CheckCircle size={11} /> OK</Badge>;
  if (status === "error") return <Badge className="bg-red-100 text-red-800 border-0 text-xs font-semibold gap-1 shrink-0"><XCircle size={11} /> ERROR</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-0 text-xs font-semibold gap-1 shrink-0"><AlertTriangle size={11} /> WARN</Badge>;
}

function CheckCard({ label, icon: Icon, check }: { label: string; icon: any; check?: HealthCheck }) {
  if (!check) return null;
  return (
    <Card className={`p-4 border-l-4 ${check.status === "ok" ? "border-l-green-500" : check.status === "error" ? "border-l-red-500" : "border-l-amber-500"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon size={18} className={`shrink-0 mt-0.5 ${check.status === "ok" ? "text-green-600" : check.status === "error" ? "text-red-600" : "text-amber-600"}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5 break-words">{check.message}</div>
            {check.detail && (
              <details className="mt-2">
                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Show details</summary>
                <pre className="text-[10px] bg-muted rounded p-2 mt-1 overflow-x-auto max-h-32 text-left whitespace-pre-wrap break-all">
                  {JSON.stringify(check.detail, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
        <StatusBadge status={check.status} />
      </div>
    </Card>
  );
}

export default function SystemHealth() {
  const { toast }                   = useToast();
  const { isSuper, loaded: permLoaded } = usePermissions();
  const [health,      setHealth]    = useState<HealthData | null>(null);
  const [loading,     setLoading]   = useState(false);
  const [testPhone,   setTestPhone] = useState("");
  const [testing,     setTesting]   = useState(false);
  const [testResult,  setTestResult]= useState<any>(null);
  const [resyncing,   setResyncing] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/system-health`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth(await res.json());
    } catch (err: any) {
      toast({ title: "Failed to load health data", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const runTestSms = async () => {
    const clean = testPhone.replace(/\D/g, "");
    if (clean.length !== 10) { toast({ title: "Enter a valid 10-digit mobile", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const res  = await fetch(`${API}/api/admin/test-sms`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      });
      const data = await res.json();
      setTestResult(data);
      const ok = data?.diagnostics?.dlt?.body?.return === true || data?.diagnostics?.quick?.body?.return === true;
      toast({
        title:       ok ? "Test SMS Sent!" : "Test SMS Failed",
        description: ok ? `OTP ${data.testOtp} sent to ${clean}` : "Check diagnostics below",
        variant:     ok ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(false); }
  };

  const resyncFast2SMS = async () => {
    setResyncing(true);
    try {
      const res  = await fetch(`${API}/api/admin/resync-fast2sms`, { method: "POST", credentials: "include" });
      const data = await res.json();
      toast({
        title:       data.ok ? "Fast2SMS Key Synced" : "Resync Failed",
        description: data.reason,
        variant:     data.ok ? "default" : "destructive",
      });
      if (data.ok) setTimeout(fetchHealth, 500);
    } catch (err: any) {
      toast({ title: "Resync error", description: err.message, variant: "destructive" });
    } finally { setResyncing(false); }
  };

  useEffect(() => { fetchHealth(); }, []);

  const c         = health?.checks;
  const recentOtps: any[] = c?.recent_otps?.detail || [];
  const smsWarn   = c?.sms_provider?.status === "warn";
  const smsError  = c?.sms_provider?.status === "error";

  if (!permLoaded) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
    </AdminLayout>
  );

  if (!isSuper) return (
    <AdminLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Shield className="w-12 h-12 text-gray-300" />
        <p className="text-lg font-semibold text-gray-500">Super Admin Access Required</p>
        <p className="text-sm text-gray-400">This page is restricted to Super Administrators only.</p>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            <Activity size={22} className="text-[#0A3D2A]" /> System Health
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Live diagnostics — SMS, WhatsApp, Email, Database, Server Resources
          </p>
          {health?.serverStartedAt && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Server started: {new Date(health.serverStartedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {health && (
            <Badge className={health.status === "healthy"
              ? "bg-green-100 text-green-800 border-0 text-sm px-3 py-1"
              : "bg-red-100 text-red-800 border-0 text-sm px-3 py-1"}>
              {health.status === "healthy" ? "✅ All Systems OK" : "⚠️ Degraded"}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Checking…" : "Refresh"}
          </Button>
        </div>
      </div>

      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {health && (
        <div className="space-y-6">

          {/* ── SMS sync warning banner ── */}
          {(smsError || smsWarn) && (
            <div className={`rounded-xl border p-4 flex items-start gap-4 ${smsError ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <AlertTriangle size={18} className={smsError ? "text-red-600 mt-0.5 shrink-0" : "text-amber-600 mt-0.5 shrink-0"} />
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${smsError ? "text-red-800" : "text-amber-800"}`}>
                  {smsError ? "⛔ Fast2SMS key missing — OTP will not work" : "⚠️ Fast2SMS key may be stale"}
                </div>
                <div className={`text-xs mt-1 ${smsError ? "text-red-700" : "text-amber-700"}`}>
                  {c?.sms_provider?.message}
                </div>
              </div>
              <Button size="sm" onClick={resyncFast2SMS} disabled={resyncing}
                className="bg-[#0B3D2E] hover:bg-[#0a3427] text-white gap-2 shrink-0">
                {resyncing ? <><Loader2 size={13} className="animate-spin" /> Syncing…</> : <><RotateCcw size={13} /> Resync Key</>}
              </Button>
            </div>
          )}

          {/* ── Main status grid ── */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Notification Channels</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CheckCard label="SMS Gateway (Fast2SMS / OTP)" icon={MessageCircle} check={c?.sms_provider} />
              <CheckCard label="WhatsApp (BotBee)"            icon={Wifi}          check={c?.whatsapp_provider} />
              <CheckCard label="Email (SMTP)"                 icon={Mail}          check={c?.email_provider} />
              <CheckCard label="RCS (Lemin AI)"               icon={Radio}         check={c?.rcs_provider} />
              <CheckCard label="Push (Firebase)"              icon={Bell}          check={c?.push_provider} />
              <CheckCard label="Retry Queue"                  icon={ListChecks}    check={c?.retry_queue} />
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Infrastructure</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CheckCard label="Database (PostgreSQL)"    icon={Database}   check={c?.database} />
              <CheckCard label="OTP Table"                icon={Shield}     check={c?.otp_table} />
              <CheckCard label="Session Store"           icon={Shield}     check={c?.sessions} />
              <CheckCard label="Environment Variables"   icon={Activity}   check={c?.env_vars} />
              <CheckCard label="Cron Jobs"               icon={Clock}      check={c?.cron_jobs} />
              <CheckCard label="Server"                  icon={Server}     check={c?.server} />
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Server Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <CheckCard label="Memory"    icon={MemoryStick} check={c?.memory} />
              <CheckCard label="CPU Load"  icon={Cpu}         check={c?.cpu} />
              <CheckCard label="Disk (/)"  icon={HardDrive}   check={c?.disk} />
            </div>
          </div>

          {/* ── Manual resync card ── */}
          <Card className="p-5 border-2 border-dashed border-[#0B3D2E]/20 bg-[#f0f7f3]">
            <div className="flex items-start gap-3">
              <RotateCcw size={18} className="text-[#0B3D2E] mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-[#0B3D2E]">Force Resync Fast2SMS Key</div>
                <div className="text-xs text-muted-foreground mt-1">
                  If OTP SMS delivery is failing, use this to force-write the bundle's built-in API key into the database.
                  This permanently fixes stale/mismatched key issues without needing to redeploy.
                </div>
              </div>
              <Button onClick={resyncFast2SMS} disabled={resyncing} size="sm"
                className="bg-[#0B3D2E] hover:bg-[#0a3427] text-white gap-2 shrink-0">
                {resyncing ? <><Loader2 size={13} className="animate-spin" />Syncing…</> : <><RotateCcw size={13} />Resync Now</>}
              </Button>
            </div>
          </Card>

          {/* ── Test SMS ── */}
          <Card className="p-5 border-2 border-dashed border-blue-200 bg-blue-50/30">
            <div className="flex items-center gap-2 mb-3">
              <Send size={16} className="text-blue-600" />
              <h2 className="font-semibold text-sm text-blue-900">Send Test OTP SMS</h2>
              <span className="text-xs text-blue-600">Fire a real OTP to verify end-to-end SMS delivery</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-xs font-medium">+91</span>
                <input
                  type="tel"
                  className="flex-1 h-9 px-3 rounded-r-lg border border-input text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-400 w-36"
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
              <Button onClick={runTestSms} disabled={testing || testPhone.replace(/\D/g, "").length !== 10}
                size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                {testing ? <><Loader2 size={13} className="animate-spin" />Sending…</> : <><Send size={13} />Send Test OTP</>}
              </Button>
            </div>

            {testResult && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Test OTP:</span>
                  <span className="font-mono font-bold text-lg text-blue-800 tracking-widest">{testResult.testOtp}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {["dlt", "quick", "otp"].map(route => {
                    const d  = testResult?.diagnostics?.[route];
                    if (!d) return null;
                    const ok = d?.body?.return === true;
                    return (
                      <div key={route} className={`rounded-lg p-3 text-xs ${ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                        <div className="font-semibold mb-1 uppercase text-[10px] tracking-wide">{route} route</div>
                        {ok ? (
                          <span className="text-green-700 font-semibold">✅ Delivered</span>
                        ) : (
                          <span className="text-red-700 break-words">
                            {Array.isArray(d?.body?.message) ? d.body.message.join("; ") : d?.body?.message || d?.error || "Failed"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <details>
                  <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">Full diagnostics</summary>
                  <pre className="text-[10px] bg-muted rounded p-2 mt-1 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </Card>

          {/* ── Recent OTPs ── */}
          {recentOtps.length > 0 && (
            <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b flex items-center justify-between">
                <h2 className="font-semibold text-sm">Recent OTPs (last 10)</h2>
                <span className="text-[10px] text-muted-foreground">Admin view only — not shown to customers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase font-semibold">
                    <tr>
                      {["Mobile", "OTP", "Status", "Attempts", "Expires", "Created"].map(h => (
                        <th key={h} className="px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentOtps.map((row: any, i: number) => {
                      const isUsed    = row.used;
                      const isExpired = new Date(row.expires_at) < new Date();
                      return (
                        <tr key={i} className={`hover:bg-muted/20 ${isUsed ? "opacity-50" : ""}`}>
                          <td className="px-4 py-2 font-mono text-xs">{row.mobile}</td>
                          <td className="px-4 py-2 font-mono font-bold tracking-widest text-[#0A3D2A]">{row.otp}</td>
                          <td className="px-4 py-2">
                            {isUsed ? (
                              <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">Used</Badge>
                            ) : isExpired ? (
                              <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Expired</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 border-0 text-[10px] animate-pulse">Active</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{row.attempts || 0}</td>
                          <td className="px-4 py-2 text-[10px] text-muted-foreground">
                            {new Date(row.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-2 text-[10px] text-muted-foreground">
                            {new Date(row.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <p className="text-[10px] text-muted-foreground text-right">
            Last checked: {new Date(health.generatedAt).toLocaleString("en-IN")}
          </p>
        </div>
      )}
    </AdminLayout>
  );
}
