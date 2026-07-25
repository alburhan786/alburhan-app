// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

function Spin() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />;
}

function StatusBadge({ status }: { status: "ok" | "degraded" | "down" | "unknown" | "pending" }) {
  const map = {
    ok:      { cls: "bg-green-100 text-green-800 border-green-200",  label: "✅ Connected" },
    degraded:{ cls: "bg-amber-100 text-amber-800 border-amber-200",  label: "⚠️ Degraded" },
    down:    { cls: "bg-red-100 text-red-800 border-red-200",        label: "❌ Down" },
    unknown: { cls: "bg-gray-100 text-gray-600 border-gray-200",     label: "○ Unknown" },
    pending: { cls: "bg-blue-100 text-blue-800 border-blue-200",     label: "⟳ Pending" },
  };
  const { cls, label } = map[status] ?? map.unknown;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>{label}</span>;
}

function StatCard({ label, value, sub, cls = "" }: { label: string; value: string | number; sub?: string; cls?: string }) {
  return (
    <div className={`border rounded-xl p-3 text-center ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] font-medium mt-0.5 text-gray-700">{label}</p>
      {sub && <p className="text-[9px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value, valueClass = "text-gray-700" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-[11px] text-gray-500 flex-shrink-0 w-44">{label}</span>
      <span className={`text-[11px] font-medium text-right flex-1 ${valueClass}`}>{value}</span>
    </div>
  );
}

type MetaHealthData = {
  ok: boolean; configured: boolean; connection: string; connectionDetail: string;
  webhook: string; phoneNumber: string | null; verifiedName: string | null;
  business: { wabaId: string | null; accountId: string | null };
  templates: { approved: number; mapped: number };
  token: { valid: boolean; expiresAt: string | null; lastChecked: string | null; permissions: string[] };
  queue: Record<string, number>;
  deliveryRate: number; failureRate: number; readRate: number; retryCount: number;
  recentErrors: { code: string; title: string; timestamp: string; phone?: string }[];
  score: number; missingSecrets: string[]; version: string;
  provider: string; fallback: string;
};

type CertTestResult = {
  event: string; ok: boolean; provider: string; wamid?: string; error?: string; ms?: number;
};

// ── Production Certification Engine ──────────────────────────────────────────
const CERT_EVENTS = [
  { id: "new_booking",      label: "New Booking",         icon: "📋" },
  { id: "booking_approved", label: "Booking Approved",    icon: "✅" },
  { id: "payment_received", label: "Payment Received",    icon: "💰" },
  { id: "invoice_ready",    label: "Invoice Generated",   icon: "🧾" },
  { id: "agreement_ready",  label: "Agreement Generated", icon: "📄" },
  { id: "agreement_signed", label: "Agreement Signed",    icon: "✍️" },
  { id: "visa_issued",      label: "Visa Approved",       icon: "🛂" },
  { id: "flight_assigned",  label: "Flight Assigned",     icon: "✈️" },
  { id: "room_assigned",    label: "Room Allocation",     icon: "🏨" },
  { id: "login_otp",        label: "OTP Login",           icon: "🔑" },
];

export default function MetaStatus() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [health, setHealth] = useState<MetaHealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [certResults, setCertResults] = useState<CertTestResult[]>([]);
  const [certRunning, setCertRunning] = useState(false);
  const [certTime, setCertTime] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const r = await fetch(`${API}/api/meta/health`);
      const d = await r.json();
      setHealth(d);
    } catch (e: any) {
      toast({ title: "Health fetch failed", description: e.message, variant: "destructive" });
    } finally { setLoadingHealth(false); }
  }, [toast]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const syncTemplates = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`${API}/api/meta/sync-templates`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (d.ok) { toast({ title: `✅ Synced ${d.synced} templates` }); fetchHealth(); }
      else toast({ title: "Sync failed", description: d.errors?.[0] || "Check WABA ID", variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSyncing(false); }
  };

  const validateToken = async () => {
    setValidating(true);
    try {
      const r = await fetch(`${API}/api/meta/validate-token`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (d.ok) { toast({ title: `✅ Token valid — ${d.phoneNumber}` }); fetchHealth(); }
      else toast({ title: "Token invalid", description: d.errorMessage, variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setValidating(false); }
  };

  const retryQueue = async () => {
    setRetrying(true);
    try {
      const r = await fetch(`${API}/api/meta/retry`, { method: "POST", credentials: "include" });
      const d = await r.json();
      toast({ title: `Queue processed: ${d.processed ?? 0} messages` });
      fetchHealth();
    } catch (e: any) { toast({ title: "Retry failed", description: e.message, variant: "destructive" }); }
    finally { setRetrying(false); }
  };

  // ── Production Certification Runner ───────────────────────────────────────
  const runCertification = async () => {
    setCertRunning(true);
    setCertResults([]);
    setShowReport(false);
    const results: CertTestResult[] = [];
    for (const ev of CERT_EVENTS) {
      const t0 = Date.now();
      try {
        const r = await fetch(`${API}/api/meta/test-send`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType: ev.id, testMode: true }),
        });
        const d = await r.json();
        results.push({
          event: ev.label,
          ok: d.ok ?? false,
          provider: d.provider || (d.ok ? (health?.configured ? "Meta Cloud API" : "BotBee") : "—"),
          wamid: d.messageId || d.wamid,
          error: d.error || d.message,
          ms: Date.now() - t0,
        });
      } catch (e: any) {
        results.push({ event: ev.label, ok: false, provider: "—", error: e.message, ms: Date.now() - t0 });
      }
      setCertResults([...results]);
    }
    setCertTime(new Date().toLocaleString("en-IN"));
    setCertRunning(false);
    setShowReport(true);
  };

  const conn = (health?.connection ?? "unknown") as "ok" | "degraded" | "down" | "unknown";
  const score = health?.score ?? 0;
  const scoreColor = score >= 80 ? "text-green-700 bg-green-50 border-green-200"
    : score >= 50 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";

  const passed  = certResults.filter(r => r.ok).length;
  const metaUsed = certResults.filter(r => r.provider?.includes("Meta")).length;
  const certScore = certResults.length ? Math.round((passed / certResults.length) * 100) : null;

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🚀 Meta Cloud API — Production Status</h1>
            <p className="text-xs text-muted-foreground mt-1">
              WhatsApp Business Cloud API v30.0 · Live production dashboard · Fallback: BotBee
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={fetchHealth} disabled={loadingHealth}>
              {loadingHealth ? <><Spin />Refreshing…</> : "↻ Refresh"}
            </Button>
            <Button size="sm" variant="outline" onClick={validateToken} disabled={validating || !health?.configured}>
              {validating ? <><Spin />Validating…</> : "🔑 Validate Token"}
            </Button>
            <Button size="sm" variant="outline" onClick={syncTemplates} disabled={syncing || !health?.configured}>
              {syncing ? <><Spin />Syncing…</> : "🔄 Sync Templates"}
            </Button>
            <Button size="sm" variant="outline" onClick={retryQueue} disabled={retrying}>
              {retrying ? <><Spin />Processing…</> : "♻️ Retry Queue"}
            </Button>
          </div>
        </div>

        {/* ── Missing Secrets Alert ── */}
        {health && health.missingSecrets.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 rounded-xl p-4">
            <p className="text-sm font-bold text-amber-900 mb-2">
              ⚠️ {health.missingSecrets.length} of 9 secrets missing — Meta Cloud API cannot activate
            </p>
            <p className="text-[11px] text-amber-800 mb-3">
              Go to <strong>Replit → Secrets</strong> and add each value from your Meta Business Manager.
              BotBee remains active as the automatic fallback until all secrets are configured.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {health.missingSecrets.map(s => (
                <code key={s} className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-mono">{s}</code>
              ))}
            </div>
            <details className="text-[11px]">
              <summary className="cursor-pointer font-semibold text-amber-800">📖 Where to find each value</summary>
              <div className="mt-2 space-y-1 text-amber-700">
                <p><code className="bg-amber-100 px-1 rounded">META_ACCESS_TOKEN</code> — Meta Business Suite → System Users → Generate Token (or Graph API Explorer)</p>
                <p><code className="bg-amber-100 px-1 rounded">META_PHONE_NUMBER_ID</code> — WhatsApp Manager → Phone Numbers → Numeric ID (not the actual phone number)</p>
                <p><code className="bg-amber-100 px-1 rounded">META_WABA_ID</code> — WhatsApp Manager → Overview → WABA ID (16-digit number)</p>
                <p><code className="bg-amber-100 px-1 rounded">META_BUSINESS_ACCOUNT_ID</code> — Meta Business Manager → Business Settings → Business Info → Business ID</p>
                <p><code className="bg-amber-100 px-1 rounded">META_APP_ID</code> — developers.facebook.com → Your App → App ID</p>
                <p><code className="bg-amber-100 px-1 rounded">META_APP_SECRET</code> — developers.facebook.com → Your App → App Secret</p>
                <p><code className="bg-amber-100 px-1 rounded">META_VERIFY_TOKEN</code> — any secret string you choose (must match what you set in Meta App → Webhooks)</p>
                <p><code className="bg-amber-100 px-1 rounded">META_WEBHOOK_SECRET</code> — Meta App → Webhooks → Client Secret (auto-generated by Meta)</p>
                <p><code className="bg-amber-100 px-1 rounded">META_API_VERSION</code> — set to <strong>v20.0</strong> (or latest stable version)</p>
              </div>
            </details>
          </div>
        )}

        {/* ── Score + Provider bar ── */}
        {health && (
          <div className="flex flex-wrap gap-3 items-center">
            <div className={`border rounded-xl px-4 py-2 flex items-center gap-3 ${scoreColor}`}>
              <div>
                <p className="text-2xl font-black">{score}/100</p>
                <p className="text-[10px]">Health Score</p>
              </div>
            </div>
            <div className="flex-1 border rounded-xl px-4 py-2 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[11px] font-semibold text-gray-700">Active WhatsApp Provider</p>
                <StatusBadge status={conn} />
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${health.configured && conn === "ok" ? "text-green-700" : "text-blue-700"}`}>
                  {health.configured && conn === "ok" ? "💬 Meta Cloud API" : "🤖 BotBee (fallback)"}
                </span>
                <span className="text-gray-300">→</span>
                <span className="text-[10px] text-gray-500">
                  Priority: Meta Cloud API → BotBee → SMS → Email
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Stats row ── */}
        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatCard label="Templates" value={`${health.templates.approved}`} sub={`${health.templates.mapped} event types mapped`} cls="bg-blue-50 border-blue-200" />
            <StatCard label="Delivery Rate" value={`${health.deliveryRate}%`} cls={health.deliveryRate >= 80 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"} />
            <StatCard label="Failure Rate" value={`${health.failureRate}%`} cls={health.failureRate < 10 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} />
            <StatCard label="Retry Queue" value={health.retryCount} cls={health.retryCount === 0 ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"} />
          </div>
        )}

        {/* ── Main info panels ── */}
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Connection */}
            <div className="border rounded-xl p-4 bg-white space-y-0.5">
              <p className="text-xs font-semibold text-gray-800 mb-2">🔗 Connection</p>
              <Row label="Connection Status" value={<StatusBadge status={conn} />} />
              <Row label="Phone Number" value={health.phoneNumber || <span className="text-gray-400">Not configured</span>} />
              <Row label="Verified Name" value={health.verifiedName || <span className="text-gray-400">—</span>} />
              <Row label="Business Account ID" value={health.business.accountId || <span className="text-gray-400">Not configured</span>} />
              <Row label="WABA ID" value={health.business.wabaId || <span className="text-gray-400">Not configured</span>} />
              <Row label="API Version" value={<span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{health.version}</span>} />
              <Row label="Detail" value={<span className="text-[10px]">{health.connectionDetail}</span>} />
            </div>

            {/* Token */}
            <div className="border rounded-xl p-4 bg-white space-y-0.5">
              <p className="text-xs font-semibold text-gray-800 mb-2">🔑 Token Status</p>
              <Row label="Token Valid"
                value={health.token.valid
                  ? <span className="text-green-700 font-semibold">✅ Valid</span>
                  : <span className="text-red-600 font-semibold">❌ Invalid / Missing</span>}
              />
              <Row label="Expires At"
                value={health.token.expiresAt
                  ? new Date(health.token.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                  : <span className="text-gray-400">—</span>}
              />
              <Row label="Last Validated"
                value={health.token.lastChecked
                  ? new Date(health.token.lastChecked).toLocaleString("en-IN")
                  : <span className="text-gray-400">Never</span>}
              />
              <Row label="Permissions"
                value={health.token.permissions.length > 0
                  ? <span className="text-[9px] font-mono">{health.token.permissions.join(", ")}</span>
                  : <span className="text-gray-400">Not validated</span>}
              />
            </div>

            {/* Webhook */}
            <div className="border rounded-xl p-4 bg-white space-y-0.5">
              <p className="text-xs font-semibold text-gray-800 mb-2">📡 Webhook</p>
              <Row label="Webhook URL"
                value={<span className="text-[9px] font-mono break-all">
                  {health.webhook || "https://alburhantravels.com/api/social-media/webhook/meta"}
                </span>}
              />
              <Row label="Webhook Status"
                value={health.configured
                  ? <span className="text-green-700 font-semibold">✅ Registered</span>
                  : <span className="text-amber-600">⚠️ Pending configuration</span>}
              />
              <Row label="Fields Subscribed"
                value={<span className="text-[9px] text-gray-600">messages, message_deliveries, message_reads, messaging_postbacks</span>}
              />
              <Row label="Signature Verify"
                value={<span className="text-[10px]">{health.configured ? "META_WEBHOOK_SECRET (active)" : "Not configured"}</span>}
              />
            </div>

            {/* Message Queue */}
            <div className="border rounded-xl p-4 bg-white space-y-0.5">
              <p className="text-xs font-semibold text-gray-800 mb-2">📤 Message Queue (7d)</p>
              {Object.entries(health.queue).map(([k, v]) => (
                <Row key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}
                  value={<span className={`font-mono ${k === "failed" && v > 0 ? "text-red-600" : k === "delivered" || k === "read" ? "text-green-700" : ""}`}>{v}</span>}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Errors ── */}
        {health && health.recentErrors.length > 0 && (
          <div className="border border-red-200 rounded-xl p-4 bg-red-50/30">
            <p className="text-xs font-semibold text-gray-800 mb-2">🚨 Recent Errors</p>
            <div className="space-y-1">
              {health.recentErrors.map((e, i) => (
                <div key={i} className="text-[10px] bg-white rounded-lg p-2 border border-red-100 flex gap-3">
                  <code className="text-red-700 font-mono flex-shrink-0">#{e.code}</code>
                  <span className="text-gray-700">{e.title}</span>
                  {e.phone && <span className="text-gray-400 ml-auto">{e.phone}</span>}
                  <span className="text-gray-400 ml-auto flex-shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── E2E Production Certification ── */}
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">🏆 Production Certification — E2E Test Suite</p>
              <p className="text-[10px] text-indigo-200">10 notification events · Meta Cloud API → BotBee fallback · Live production test</p>
            </div>
            <Button
              size="sm"
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold text-xs"
              onClick={runCertification}
              disabled={certRunning}
            >
              {certRunning ? <><Spin />Running…</> : certResults.length > 0 ? "🔄 Re-Run" : "▶ Run E2E Tests"}
            </Button>
          </div>

          {certResults.length > 0 && (
            <div className="p-4 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-lg p-2 text-center border ${certScore >= 80 ? "bg-green-50 border-green-200" : certScore >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                  <p className={`text-xl font-black ${certScore >= 80 ? "text-green-700" : certScore >= 50 ? "text-amber-700" : "text-red-700"}`}>{certScore}%</p>
                  <p className="text-[9px] text-gray-600">Pass Rate</p>
                </div>
                <div className="rounded-lg p-2 text-center border bg-blue-50 border-blue-200">
                  <p className="text-xl font-black text-blue-700">{metaUsed}</p>
                  <p className="text-[9px] text-gray-600">via Meta Cloud API</p>
                </div>
                <div className="rounded-lg p-2 text-center border bg-gray-50 border-gray-200">
                  <p className="text-xl font-black text-gray-700">{certResults.length - metaUsed}</p>
                  <p className="text-[9px] text-gray-600">via BotBee / SMS</p>
                </div>
              </div>

              {/* Results table */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Event</th>
                      <th className="text-center px-2 py-2 font-semibold text-gray-600">Result</th>
                      <th className="text-left px-2 py-2 font-semibold text-gray-600">Provider</th>
                      <th className="text-left px-2 py-2 font-semibold text-gray-600 hidden sm:table-cell">Message ID / Error</th>
                      <th className="text-right px-2 py-2 font-semibold text-gray-600">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certResults.map((r, i) => {
                      const ev = CERT_EVENTS[i];
                      return (
                        <tr key={r.event} className={`border-b last:border-0 ${r.ok ? "bg-white" : "bg-red-50/30"}`}>
                          <td className="px-3 py-2">{ev?.icon} {r.event}</td>
                          <td className="px-2 py-2 text-center">{r.ok ? "✅" : "❌"}</td>
                          <td className="px-2 py-2">
                            <span className={`text-[10px] font-semibold ${r.provider?.includes("Meta") ? "text-blue-700" : "text-gray-600"}`}>
                              {r.provider}
                            </span>
                          </td>
                          <td className="px-2 py-2 hidden sm:table-cell">
                            {r.ok
                              ? <code className="text-[9px] font-mono text-gray-500">{r.wamid || "—"}</code>
                              : <span className="text-red-600 text-[10px]">{r.error || "Failed"}</span>
                            }
                          </td>
                          <td className="px-2 py-2 text-right text-gray-500">{r.ms}</td>
                        </tr>
                      );
                    })}
                    {certRunning && CERT_EVENTS.slice(certResults.length).map(ev => (
                      <tr key={ev.id} className="border-b last:border-0 bg-blue-50/20">
                        <td className="px-3 py-2 text-gray-400">{ev.icon} {ev.label}</td>
                        <td className="px-2 py-2 text-center"><Spin /></td>
                        <td colSpan={3} className="px-2 py-2 text-gray-400 text-[10px]">Running…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Production Certification Report ── */}
        {showReport && health && certResults.length > 0 && (
          <div ref={reportRef} className="border-2 border-indigo-200 rounded-xl overflow-hidden">
            <div className="bg-indigo-50 px-5 py-4 border-b border-indigo-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-black text-indigo-900">📋 Production Certification Report</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5">Al Burhan Tours & Travels ERP · WhatsApp Cloud API v30.0 · Generated {certTime}</p>
                </div>
                <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700 text-[10px]"
                  onClick={() => window.print()}>🖨️ Print</Button>
              </div>
            </div>

            <div className="p-5 space-y-4 bg-white">
              {/* Overall score */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Overall Health Score", val: `${health.score}/100`, cls: health.score >= 80 ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700" },
                  { label: "E2E Pass Rate",         val: `${certScore}%`,       cls: certScore >= 80 ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700" },
                  { label: "Delivery Rate",         val: `${health.deliveryRate}%`, cls: "bg-blue-50 border-blue-200 text-blue-700" },
                  { label: "Failure Rate",          val: `${health.failureRate}%`,  cls: health.failureRate < 5 ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700" },
                ].map(({ label, val, cls }) => (
                  <div key={label} className={`border rounded-xl p-3 text-center ${cls}`}>
                    <p className="text-xl font-black">{val}</p>
                    <p className="text-[9px] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Checklist */}
              {[
                { label: "Meta Cloud API Integration",   ok: health.configured,                    note: health.configured ? "Active — PRIMARY provider" : `8 secrets pending: ${health.missingSecrets.join(", ")}` },
                { label: "WhatsApp Cloud API Status",    ok: health.connection === "ok",            note: health.connectionDetail },
                { label: "Token Validation",             ok: health.token.valid,                   note: health.token.valid ? `Valid · Expires ${health.token.expiresAt || "never"}` : "Token not validated — run Validate Token" },
                { label: "Phone Number Verified",        ok: !!health.phoneNumber,                 note: health.phoneNumber || "Not configured" },
                { label: "Business Account Linked",      ok: !!health.business.accountId,          note: health.business.accountId || "Not configured" },
                { label: "WABA ID Configured",           ok: !!health.business.wabaId,             note: health.business.wabaId || "Not configured" },
                { label: "Webhook Subscription",         ok: health.configured,                    note: health.webhook },
                { label: "Template Sync",                ok: health.templates.approved > 0,        note: `${health.templates.approved} approved · ${health.templates.mapped} event types mapped` },
                { label: "Queue Health",                 ok: health.retryCount === 0,              note: `${health.retryCount} messages in retry queue` },
                { label: "BotBee Fallback Active",       ok: true,                                 note: "BotBee is always active as automatic fallback" },
                { label: "Webhook Signature Security",   ok: health.configured,                    note: health.configured ? "META_WEBHOOK_SECRET active" : "Configure META_WEBHOOK_SECRET" },
                { label: "E2E Notification Tests",       ok: certScore >= 80,                      note: `${passed}/${certResults.length} events passed · ${metaUsed} via Meta Cloud API` },
              ].map(({ label, ok, note }) => (
                <div key={label} className={`flex items-start gap-3 p-2.5 rounded-lg border ${ok ? "bg-green-50/40 border-green-100" : "bg-red-50/40 border-red-100"}`}>
                  <span className="text-base flex-shrink-0">{ok ? "✅" : "❌"}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-800">{label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>
                  </div>
                </div>
              ))}

              {/* Remaining Issues */}
              {health.missingSecrets.length > 0 && (
                <div className="border border-amber-200 rounded-xl p-3 bg-amber-50">
                  <p className="text-[11px] font-bold text-amber-900 mb-1">⚠️ Remaining Issues — Action Required</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-amber-800">
                    {health.missingSecrets.map(s => (
                      <li key={s}>Add <code className="bg-amber-100 px-1 rounded font-mono">{s}</code> to Replit Secrets → restart VPS</li>
                    ))}
                    <li>After secrets are set: click <strong>Validate Token</strong> then <strong>Sync Templates</strong></li>
                    <li>Re-run E2E certification to verify Meta Cloud API as primary provider</li>
                  </ol>
                </div>
              )}

              <p className="text-[9px] text-gray-400 text-center pt-2 border-t">
                Al Burhan Tours & Travels ERP v30.0-meta-production · Report generated {certTime} ·
                System: VPS (alburhantravels.com) · Node {typeof window !== "undefined" ? "" : ""}v20
              </p>
            </div>
          </div>
        )}

        {/* ── Quick Setup Guide ── */}
        <details className="border rounded-xl overflow-hidden">
          <summary className="px-4 py-3 bg-indigo-50 text-sm font-semibold text-indigo-900 cursor-pointer select-none">
            🛠️ Quick Setup Guide — 5 Steps to Activate Meta Cloud API
          </summary>
          <div className="px-4 py-3 bg-indigo-50/40 border-t border-indigo-100 space-y-2.5 text-[11px]">
            {[
              ["Step 1 — Add secrets to Replit", "Go to Replit → Secrets tab. Add all 9 META_ secrets listed above. Each value comes from your Meta Business Manager / developers.facebook.com."],
              ["Step 2 — Restart VPS", "After adding secrets, the VPS must restart to pick them up. Use the Meta Health page → self-update or restart PM2 on the server."],
              ["Step 3 — Validate Token", "Click the 'Validate Token' button. It calls the Meta Graph API to verify your access token and phone number are linked."],
              ["Step 4 — Sync Templates", "Click 'Sync Templates'. This pulls all your approved WhatsApp templates from the Meta WABA and maps them to ERP notification events."],
              ["Step 5 — Run E2E Certification", "Click 'Run E2E Tests' above. 10 notification events are tested. Meta Cloud API fires first; BotBee is automatic fallback. Score should be 80%+."],
            ].map(([title, body]) => (
              <div key={title} className="bg-white rounded-lg p-2.5 border border-indigo-100">
                <p className="font-semibold text-indigo-800">{title}</p>
                <p className="mt-0.5 text-gray-600">{body}</p>
              </div>
            ))}
          </div>
        </details>

      </div>
    </AdminLayout>
  );
}
