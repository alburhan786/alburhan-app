import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Shield,
  MessageSquare, Mail, Phone, Send, Activity, Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

interface ProviderStatus {
  label: string;
  ready?: boolean;
  enabled?: boolean;
  note?: string | null;
  sources?: { db?: boolean; env?: boolean; phoneIdDb?: boolean; phoneIdEnv?: boolean };
}
interface DiagData {
  providers: Record<string, ProviderStatus>;
  recentLogs: {
    id: string; recipient_masked: string; channel: string;
    status: string; provider_name: string; message: string; created_at: string;
  }[];
  stats: { active_otps: string; failed_attempts_1h: string; requests_30m: string };
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  sms: Phone, whatsapp: MessageSquare, email: Mail, all: AlertTriangle,
};
const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS", whatsapp: "WhatsApp", email: "Email", all: "All Channels",
};
const STATUS_COLOR: Record<string, string> = {
  sent: "text-emerald-600 bg-emerald-50 border-emerald-200",
  delivered: "text-emerald-600 bg-emerald-50 border-emerald-200",
  failed: "text-red-600 bg-red-50 border-red-200",
};

export default function OtpDiagnostics() {
  const { toast } = useToast();
  const [data, setData] = useState<DiagData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testMobile, setTestMobile] = useState("");
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/otp-diagnostics`, { credentials: "include" });
      if (r.ok) setData(await r.json());
      else toast({ title: "Failed to load diagnostics", variant: "destructive" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testChannel = async (channel: string) => {
    const mobile = testMobile.replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) {
      toast({ title: "Enter a 10-digit mobile number first", variant: "destructive" });
      return;
    }
    setTesting(p => ({ ...p, [channel]: true }));
    try {
      const r = await fetch(`${API}/api/auth/otp-test-channel`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, mobile }),
      });
      const d = await r.json();
      if (d.ok) toast({ title: `✅ ${CHANNEL_LABELS[channel]} test sent`, description: `Delivered to ${mobile}` });
      else toast({ title: `❌ ${CHANNEL_LABELS[channel]} test failed`, description: d.error || d.message || "Provider error", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(p => ({ ...p, [channel]: false }));
      load();
    }
  };

  const providerList = data ? Object.entries(data.providers) : [];

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield size={18} className="text-primary" />
              </div>
              OTP Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Provider configuration, delivery logs and test-send for all OTP channels
            </p>
          </div>
          <Button onClick={load} variant="outline" size="sm" className="gap-1.5" disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Stats bar */}
        {data?.stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active OTPs", val: data.stats.active_otps, icon: Lock, color: "bg-blue-50 border-blue-200 text-blue-700" },
              { label: "Failed attempts (1h)", val: data.stats.failed_attempts_1h, icon: AlertTriangle, color: "bg-amber-50 border-amber-200 text-amber-700" },
              { label: "OTP requests (30m)", val: data.stats.requests_30m, icon: Activity, color: "bg-violet-50 border-violet-200 text-violet-700" },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
                <s.icon size={18} className="mb-2 opacity-70" />
                <p className="text-2xl font-bold">{s.val ?? "—"}</p>
                <p className="text-xs mt-0.5 opacity-70">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Provider status + test-send */}
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Provider Configuration & Test Send</h2>

          {/* Test mobile input */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground shrink-0">Test mobile (+91)</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="9XXXXXXXXX"
              value={testMobile}
              onChange={e => setTestMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="border rounded-lg px-3 py-1.5 text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground">Enter before clicking test buttons. Uses OTP 000000 — not valid for auth.</span>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            {providerList.map(([key, prov]) => {
              const Icon = key === "fast2sms" ? Phone : key === "botbee" ? MessageSquare : Mail;
              const channel = key === "fast2sms" ? "sms" : key === "botbee" ? "whatsapp" : "email";
              const ready = prov.ready ?? false;
              const src = prov.sources ?? {};
              return (
                <div key={key} className={`rounded-xl border p-4 space-y-3 ${ready ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={15} className={ready ? "text-emerald-600" : "text-red-500"} />
                      <span className="text-sm font-medium">{prov.label}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${ready ? "border-emerald-300 text-emerald-700 bg-emerald-100" : "border-red-300 text-red-700 bg-red-100"}`}>
                      {ready ? "✓ Ready" : "✗ Not ready"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <div>DB key: {src.db ? <span className="text-emerald-600">●●●●●●●●</span> : <span className="text-muted-foreground">—</span>}</div>
                    <div>Env var: {src.env ? <span className="text-emerald-600">●●●●●●●●</span> : <span className="text-muted-foreground">—</span>}</div>
                    {key === "botbee" && (
                      <div>Phone ID: {(src.phoneIdDb || src.phoneIdEnv) ? <span className="text-emerald-600">set</span> : <span className="text-red-500">missing</span>}</div>
                    )}
                    {prov.note && <div className="text-amber-600 mt-1">{prov.note}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5"
                    disabled={testing[channel]}
                    onClick={() => testChannel(channel)}
                  >
                    {testing[channel]
                      ? <><RefreshCw size={11} className="animate-spin" /> Sending…</>
                      : <><Send size={11} /> Test Send</>}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">Provider readiness checks both DB-stored credentials and env vars — the same sources the send functions use at runtime.</p>
        </div>

        {/* Recent OTP delivery logs */}
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm">Recent OTP Delivery Logs</h2>
          <p className="text-[11px] text-muted-foreground">Last 50 OTP attempts across all portals. Recipient numbers are masked. No OTP values stored.</p>

          {loading && !data && (
            <div className="flex justify-center py-10">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {data?.recentLogs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Activity size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No OTP delivery logs found yet.</p>
              <p className="text-xs mt-1">Logs appear here once someone attempts to log in.</p>
            </div>
          )}

          {(data?.recentLogs ?? []).length > 0 && (
            <div className="space-y-1.5">
              {/* Column headers */}
              <div className="grid grid-cols-[80px_90px_80px_80px_1fr_110px] gap-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Recipient</span>
                <span>Channel</span>
                <span>Status</span>
                <span>Provider</span>
                <span>Detail</span>
                <span>Time</span>
              </div>
              {data!.recentLogs.map(row => {
                const ChanIcon = CHANNEL_ICONS[row.channel] ?? Activity;
                const statusCls = STATUS_COLOR[row.status] ?? "text-gray-600 bg-gray-50 border-gray-200";
                return (
                  <div key={row.id} className="grid grid-cols-[80px_90px_80px_80px_1fr_110px] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-muted/40 text-xs">
                    <span className="font-mono text-[11px] truncate">{row.recipient_masked}</span>
                    <span className="flex items-center gap-1 text-[11px]">
                      <ChanIcon size={11} className="shrink-0 text-muted-foreground" />
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </span>
                    <span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${statusCls}`}>
                        {row.status === "sent" || row.status === "delivered"
                          ? <CheckCircle2 size={9} />
                          : <XCircle size={9} />}
                        {row.status}
                      </span>
                    </span>
                    <span className="text-muted-foreground truncate">{row.provider_name}</span>
                    <span className="text-muted-foreground truncate text-[11px]">{row.message}</span>
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {new Date(row.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info note */}
        <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 border">
          <strong>Security note:</strong> No OTP values, API keys or access tokens are displayed on this page.
          All recipient numbers are masked. Logs are from <code className="font-mono">notification_logs</code> where event_type ends in <code className="font-mono">_login_otp</code>.
        </div>
      </div>
    </AdminLayout>
  );
}
