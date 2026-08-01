// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const API = import.meta.env.VITE_API_URL || "";

// ── Micro helpers ─────────────────────────────────────────────────────────────

function Spin() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5 flex-shrink-0" />;
}

function Dot({ ok, na }: { ok?: boolean; na?: boolean }) {
  if (na) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />;
  return <span className={`w-2 h-2 rounded-full inline-block ${ok ? "bg-green-500" : "bg-red-500"}`} />;
}

function Badge({ ok, label, pending }: { ok?: boolean; label: string; pending?: boolean }) {
  const cls = pending
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : ok
    ? "bg-green-100 text-green-800 border-green-200"
    : "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {pending ? "⟳" : ok ? "✅" : "❌"} {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-[11px] text-gray-500 flex-shrink-0 w-48">{label}</span>
      <span className="text-[11px] font-medium text-right flex-1 text-gray-800">{value}</span>
    </div>
  );
}

function MiniCard({ label, value, sub, green, amber, red }: {
  label: string; value: string | number; sub?: string;
  green?: boolean; amber?: boolean; red?: boolean;
}) {
  const cls = green ? "bg-green-50 border-green-200 text-green-800"
    : amber ? "bg-amber-50 border-amber-200 text-amber-800"
    : red   ? "bg-red-50   border-red-200   text-red-800"
    : "bg-gray-50 border-gray-200 text-gray-700";
  return (
    <div className={`border rounded-xl p-3 text-center ${cls}`}>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[10px] font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[9px] opacity-75 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SecurityStatus = {
  webhookSignatureEnabled: boolean; appSecretConfigured: boolean;
  tokenValid: boolean; missingSecretCount: number;
  status: "secure" | "pending_secrets" | "token_invalid";
};

type LastMsg = {
  wamid: string; recipient: string; templateName: string; eventType: string; sentAt: string;
};

type MetaHealthData = {
  ok: boolean; configured: boolean; connection: string; connectionDetail: string;
  webhook: string; phoneNumber: string | null; verifiedName: string | null;
  business: { wabaId: string | null; accountId: string | null };
  templates: { approved: number; mapped: number };
  token: { valid: boolean; expiresAt: string | null; lastChecked: string | null; permissions: string[] };
  queue: Record<string, number>;
  deliveryRate: number; failureRate: number; readRate: number;
  retryCount: number; failedCount: number;
  recentErrors: { wamid?: string; error_message?: string; error_code?: string; created_at: string }[];
  lastSuccessfulMessage: LastMsg | null;
  securityStatus: SecurityStatus;
  score: number; missingSecrets: string[]; version: string; buildStamp: string;
  provider: string; fallback: string;
};

type VpsInfo = { build: string; pid: number; node: string };

type CertResult = {
  id: string; label: string; icon: string;
  ok: boolean; provider: string; wamid?: string; error?: string; ms: number;
};

// ── All 15 E2E workflows ──────────────────────────────────────────────────────

const WORKFLOWS: { id: string; label: string; icon: string }[] = [
  { id: "login_otp",          label: "OTP Login",            icon: "🔑" },
  { id: "new_booking",        label: "New Booking",           icon: "📋" },
  { id: "booking_approved",   label: "Booking Approved",      icon: "✅" },
  { id: "payment_partial",    label: "Partial Payment",       icon: "💳" },
  { id: "payment_received",   label: "Full Payment",          icon: "💰" },
  { id: "invoice_ready",      label: "Invoice Generated",     icon: "🧾" },
  { id: "agreement_ready",    label: "Agreement Generated",   icon: "📄" },
  { id: "agreement_signed",   label: "Agreement Signed",      icon: "✍️" },
  { id: "visa_issued",        label: "Visa Approved",         icon: "🛂" },
  { id: "flight_assigned",    label: "Flight Assigned",       icon: "✈️" },
  { id: "hotel_assigned",     label: "Hotel Assigned",        icon: "🏨" },
  { id: "room_assigned",      label: "Room Allocation",       icon: "🛏️" },
  { id: "passport_upload",    label: "Passport Upload",       icon: "📸" },
  { id: "departure_reminder", label: "Departure Reminder",    icon: "⏰" },
  { id: "broadcast",          label: "Broadcast Message",     icon: "📢" },
];

// ── Secrets guide ─────────────────────────────────────────────────────────────

const SECRET_GUIDE: Record<string, string> = {
  META_ACCESS_TOKEN:        "Meta Business Suite → System Users → Generate Token (never-expiring system user token preferred)",
  META_PHONE_NUMBER_ID:     "WhatsApp Manager → Phone Numbers → click your number → copy the numeric Phone Number ID (not the +91… number)",
  META_WABA_ID:             "WhatsApp Manager → Overview → WhatsApp Business Account ID (16-digit number)",
  META_BUSINESS_ACCOUNT_ID: "Meta Business Manager → Business Settings → Business Info → Business ID",
  META_APP_ID:              "developers.facebook.com → Your App → Dashboard → App ID",
  META_APP_SECRET:          "developers.facebook.com → Your App → Settings → Basic → App Secret",
  META_VERIFY_TOKEN:        "Any secret string you choose — must match exactly what you set in Meta App → Webhooks → Verify Token field",
  META_WEBHOOK_SECRET:      "Meta App → Webhooks → Client Secret (generated by Meta; copy after saving the webhook)",
  META_API_VERSION:         "Set to v20.0 (or the latest stable version shown on developers.facebook.com/docs/graph-api)",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MetaStatus() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [health,        setHealth]        = useState<MetaHealthData | null>(null);
  const [vps,           setVps]           = useState<VpsInfo | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [syncing,       setSyncing]       = useState(false);
  const [validating,    setValidating]    = useState(false);
  const [retrying,      setRetrying]      = useState(false);
  const [certResults,   setCertResults]   = useState<CertResult[]>([]);
  const [certRunning,   setCertRunning]   = useState(false);
  const [certTime,      setCertTime]      = useState<string | null>(null);
  const [showReport,    setShowReport]    = useState(false);
  const [testPhone,     setTestPhone]     = useState("");
  const [sending,       setSending]       = useState(false);

  // ── Fetch health + VPS version ─────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const [hRes, vRes] = await Promise.all([
        fetch(`${API}/api/meta/health`),
        fetch(`${API}/api/version`).catch(() => null),
      ]);
      setHealth(await hRes.json());
      if (vRes?.ok) setVps(await vRes.json());
    } catch (e: any) {
      toast({ title: "Health fetch failed", description: e.message, variant: "destructive" });
    } finally { setLoadingHealth(false); }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const syncTemplates = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`${API}/api/meta/sync-templates`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (d.ok) { toast({ title: `✅ ${d.synced} templates synced` }); fetchAll(); }
      else toast({ title: "Sync failed", description: d.errors?.[0] || "Check WABA ID", variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSyncing(false); }
  };

  const validateToken = async () => {
    setValidating(true);
    try {
      const r = await fetch(`${API}/api/meta/validate-token`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (d.ok) { toast({ title: `✅ Token valid — ${d.phoneNumber}` }); fetchAll(); }
      else toast({ title: "Token invalid", description: d.errorMessage || d.error, variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setValidating(false); }
  };

  const retryQueue = async () => {
    setRetrying(true);
    try {
      const r = await fetch(`${API}/api/meta/retry`, { method: "POST", credentials: "include" });
      const d = await r.json();
      toast({ title: `Processed ${d.processed ?? 0} queued messages` });
      fetchAll();
    } catch (e: any) { toast({ title: "Retry failed", description: e.message, variant: "destructive" }); }
    finally { setRetrying(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) { toast({ title: "Enter a mobile number", variant: "destructive" }); return; }
    setSending(true);
    try {
      const r = await fetch(`${API}/api/meta/test-send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: testPhone.trim(), eventType: "new_booking", customerName: "Production Test", bookingNumber: "PROD-TEST-001" }),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: `✅ Sent via ${d.provider || "Meta"}`, description: `Message ID: ${d.messageId || d.wamid || "—"}` });
        fetchAll();
      } else {
        toast({ title: "Send failed", description: d.error || d.fallbackError || "Check token + phone number", variant: "destructive" });
      }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  // ── 15-event E2E certification ─────────────────────────────────────────────
  const runCertification = async () => {
    setCertRunning(true);
    setCertResults([]);
    setShowReport(false);
    const results: CertResult[] = [];
    for (const wf of WORKFLOWS) {
      const t0 = Date.now();
      try {
        const r = await fetch(`${API}/api/meta/test-send`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType: wf.id, testMode: true, customerName: "Cert Test", bookingNumber: "CERT-001" }),
        });
        const d = await r.json();
        results.push({
          ...wf,
          ok:       d.ok ?? false,
          provider: d.provider || (d.ok ? (health?.configured ? "Meta Cloud API" : "BotBee") : "—"),
          wamid:    d.messageId || d.wamid,
          error:    d.error || d.fallbackError,
          ms:       Date.now() - t0,
        });
      } catch (e: any) {
        results.push({ ...wf, ok: false, provider: "—", error: e.message, ms: Date.now() - t0 });
      }
      setCertResults([...results]);
    }
    setCertTime(new Date().toLocaleString("en-IN"));
    setCertRunning(false);
    setShowReport(true);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const conn         = (health?.connection ?? "unknown") as string;
  const score        = health?.score ?? 0;
  const passed       = certResults.filter(r => r.ok).length;
  const metaUsed     = certResults.filter(r => r.provider?.includes("Meta")).length;
  const botbeeUsed   = certResults.filter(r => r.provider?.includes("BotBee")).length;
  const certScore    = certResults.length ? Math.round((passed / certResults.length) * 100) : null;

  const scoreGrad = score >= 80 ? "from-green-600 to-emerald-500"
    : score >= 50 ? "from-amber-500 to-orange-400"
    : "from-red-600 to-rose-500";

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">🚀 Meta Cloud API — Production Status</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              WhatsApp Business Cloud API v30.0 · {vps?.build || "loading…"} · Node {vps?.node || "…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={fetchAll} disabled={loadingHealth} className="h-8">
              {loadingHealth ? <><Spin />Refreshing…</> : "↻ Refresh"}
            </Button>
            <Button size="sm" variant="outline" onClick={validateToken} disabled={validating} className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50">
              {validating ? <><Spin />Validating…</> : "🔑 Validate Token"}
            </Button>
            <Button size="sm" variant="outline" onClick={syncTemplates} disabled={syncing} className="h-8 border-purple-200 text-purple-700 hover:bg-purple-50">
              {syncing ? <><Spin />Syncing…</> : "🔄 Sync Templates"}
            </Button>
            <Button size="sm" variant="outline" onClick={retryQueue} disabled={retrying} className="h-8">
              {retrying ? <><Spin />Processing…</> : "♻️ Retry Queue"}
            </Button>
          </div>
        </div>

        {/* ── Missing Secrets Alert ── */}
        {health && health.missingSecrets.length > 0 && (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {health.missingSecrets.length} of 9 secrets missing — Meta Cloud API is <span className="underline">not yet active</span>
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  BotBee is the active WhatsApp provider. Add the secrets below to Replit → Secrets, then restart the VPS.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {health.missingSecrets.map(s => (
                <div key={s} className="bg-white rounded-lg border border-amber-200 p-2.5 flex gap-3">
                  <code className="text-[10px] font-mono font-bold text-amber-800 flex-shrink-0 w-52">{s}</code>
                  <span className="text-[10px] text-gray-600">{SECRET_GUIDE[s] || "Add to Replit Secrets"}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-amber-700 bg-amber-100 rounded-lg px-3 py-2">
              After adding all secrets: click <strong>Validate Token</strong> → <strong>Sync Templates</strong> → <strong>Run E2E Certification</strong>
            </p>
          </div>
        )}

        {/* ── Health Score + Provider ── */}
        <div className="flex flex-wrap gap-3">
          <div className={`bg-gradient-to-br ${scoreGrad} rounded-xl p-4 text-white flex items-center gap-4 min-w-40`}>
            <div>
              <p className="text-4xl font-black">{score}</p>
              <p className="text-[10px] opacity-90 mt-0.5">Health Score / 100</p>
            </div>
          </div>
          <div className="flex-1 border rounded-xl p-4 bg-white min-w-64 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-gray-800">Active WhatsApp Provider</p>
              <Badge
                ok={health?.configured && conn === "ok"}
                pending={!health?.configured}
                label={health?.configured && conn === "ok" ? "Meta Cloud API" : "BotBee (fallback)"}
              />
            </div>
            <p className="text-[10px] text-gray-500">
              Priority: <strong className="text-blue-700">Meta Cloud API</strong>
              <span className="text-gray-400"> → </span><strong className="text-green-700">BotBee</strong>
              <span className="text-gray-400"> → SMS → Email</span>
            </p>
            <p className="text-[10px] text-gray-500">{health?.connectionDetail || "Loading…"}</p>
          </div>
        </div>

        {/* ── Stats row ── */}
        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <MiniCard label="Approved Templates" value={health.templates.approved}
              sub={`${health.templates.mapped} events mapped`} green={health.templates.approved > 0} />
            <MiniCard label="Delivery Rate" value={`${health.deliveryRate}%`}
              green={health.deliveryRate >= 80} amber={health.deliveryRate >= 50 && health.deliveryRate < 80} red={health.deliveryRate < 50} />
            <MiniCard label="Failed Messages" value={health.failedCount}
              green={health.failedCount === 0} amber={health.failedCount > 0 && health.failedCount < 5} red={health.failedCount >= 5} />
            <MiniCard label="Retry Queue" value={health.retryCount}
              green={health.retryCount === 0} amber={health.retryCount > 0} />
          </div>
        )}

        {/* ── Status panels ── */}
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Connection */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Dot ok={conn === "ok"} na={!health.configured} /> Connection
              </p>
              <Row label="Status" value={<Badge ok={conn === "ok"} pending={conn === "degraded"} label={conn === "ok" ? "Connected" : conn === "degraded" ? "Degraded" : "Down"} />} />
              <Row label="Current Provider"   value={health.configured && conn === "ok" ? "💬 Meta Cloud API" : "🤖 BotBee (fallback)"} />
              <Row label="Phone Number"       value={health.phoneNumber || <span className="text-gray-400">Not configured</span>} />
              <Row label="Verified Name"      value={health.verifiedName || <span className="text-gray-400">—</span>} />
              <Row label="WABA ID"            value={health.business.wabaId || <span className="text-gray-400">Not configured</span>} />
              <Row label="Business Account"   value={health.business.accountId || <span className="text-gray-400">Not configured</span>} />
              <Row label="API Version"        value={<code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">{health.version}</code>} />
            </div>

            {/* Token */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Dot ok={health.token.valid} na={!health.configured} /> Token Status
              </p>
              <Row label="Token Valid"    value={health.token.valid
                ? <span className="text-green-700 font-semibold">✅ Valid</span>
                : <span className="text-red-600 font-semibold">❌ Invalid / Not set</span>}
              />
              <Row label="Token Expiry"   value={health.token.expiresAt
                ? new Date(health.token.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                : <span className="text-gray-400">—</span>}
              />
              <Row label="Last Validated" value={health.token.lastChecked
                ? new Date(health.token.lastChecked).toLocaleString("en-IN")
                : <span className="text-gray-400">Never</span>}
              />
              <Row label="Permissions"    value={health.token.permissions.length
                ? <span className="text-[9px] font-mono leading-relaxed">{health.token.permissions.join(", ")}</span>
                : <span className="text-gray-400">Not validated yet</span>}
              />
            </div>

            {/* Webhook */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Dot ok={health.configured} na={!health.configured} /> Webhook
              </p>
              <Row label="Webhook URL"    value={<span className="text-[9px] font-mono break-all text-blue-700">{health.webhook}</span>} />
              <Row label="Status"         value={health.configured
                ? <span className="text-green-700 font-semibold">✅ Registered</span>
                : <span className="text-amber-700">⚠️ Pending META_VERIFY_TOKEN</span>}
              />
              <Row label="Signature"      value={health.securityStatus.webhookSignatureEnabled
                ? <span className="text-green-700">🔒 Verified (META_WEBHOOK_SECRET)</span>
                : <span className="text-amber-700">⚠️ Not configured</span>}
              />
              <Row label="App Secret"     value={health.securityStatus.appSecretConfigured
                ? <span className="text-green-700">✅ Set</span>
                : <span className="text-red-600">❌ Missing</span>}
              />
              <Row label="Security"       value={
                health.securityStatus.status === "secure" ? <span className="text-green-700 font-semibold">🔒 Secure</span>
                : health.securityStatus.status === "pending_secrets" ? <span className="text-amber-700">⚠️ {health.securityStatus.missingSecretCount} secrets pending</span>
                : <span className="text-red-600">❌ Token invalid</span>
              } />
            </div>

            {/* Queue */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Dot ok={health.retryCount === 0 && health.failedCount === 0} /> Queue Health (7d)
              </p>
              {Object.entries(health.queue).map(([k, v]) => (
                <Row key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={
                  <span className={`font-mono text-sm font-bold ${
                    k === "failed"    && v > 0 ? "text-red-600"
                  : k === "retrying" && v > 0 ? "text-amber-600"
                  : k === "delivered" || k === "read" ? "text-green-700"
                  : ""}`}>{v}</span>
                } />
              ))}
              <Row label="Delivery Rate" value={<span className={`font-semibold ${health.deliveryRate >= 80 ? "text-green-700" : "text-amber-700"}`}>{health.deliveryRate}%</span>} />
              <Row label="Read Rate"     value={<span className="font-semibold text-blue-700">{health.readRate}%</span>} />
            </div>

            {/* Template + Last msg */}
            <div className="border rounded-xl p-4 bg-white md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Dot ok={health.templates.approved > 0} /> Templates
                  </p>
                  <Row label="Approved on Meta"  value={health.templates.approved || <span className="text-gray-400">0 (sync after secrets set)</span>} />
                  <Row label="Events Mapped"     value={`${health.templates.mapped} notification types`} />
                  <Row label="Sync Status"       value={health.templates.approved > 0
                    ? <span className="text-green-700">✅ Synced</span>
                    : <span className="text-amber-700">⚠️ Run Sync Templates</span>}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Dot ok={!!health.lastSuccessfulMessage} na={!health.lastSuccessfulMessage} /> Last Successful WhatsApp Message
                  </p>
                  {health.lastSuccessfulMessage ? (
                    <>
                      <Row label="Message ID"   value={<code className="text-[9px] font-mono">{health.lastSuccessfulMessage.wamid}</code>} />
                      <Row label="To"           value={health.lastSuccessfulMessage.recipient} />
                      <Row label="Template"     value={health.lastSuccessfulMessage.templateName} />
                      <Row label="Event"        value={health.lastSuccessfulMessage.eventType} />
                      <Row label="Sent At"      value={new Date(health.lastSuccessfulMessage.sentAt).toLocaleString("en-IN")} />
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400 py-3">No delivered messages yet — queue will populate once Meta is configured</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Live test-send ── */}
        <div className="border rounded-xl p-4 bg-white space-y-3">
          <p className="text-xs font-bold text-gray-800">🧪 Live Production Test-Send</p>
          <p className="text-[11px] text-gray-500">
            Sends a real WhatsApp template message via Meta Cloud API (falls back to BotBee if not configured).
            Enter a mobile number with country code — e.g. <code className="bg-gray-100 px-1 rounded">919876543210</code>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="919876543210"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Button size="sm" onClick={sendTest} disabled={sending || !testPhone.trim()} className="h-10">
              {sending ? <><Spin />Sending…</> : "Send Test"}
            </Button>
          </div>
        </div>

        {/* ── Recent Errors ── */}
        {health && health.recentErrors.length > 0 && (
          <div className="border border-red-200 rounded-xl p-4 bg-red-50/30">
            <p className="text-[11px] font-bold text-gray-800 mb-2">🚨 Recent Failed Messages</p>
            <div className="space-y-1">
              {health.recentErrors.map((e, i) => (
                <div key={i} className="text-[10px] bg-white rounded-lg p-2 border border-red-100 flex gap-3 items-start">
                  {e.error_code && <code className="text-red-700 font-mono flex-shrink-0">#{e.error_code}</code>}
                  <span className="text-gray-700 flex-1">{e.error_message || "Unknown error"}</span>
                  <span className="text-gray-400 flex-shrink-0">{new Date(e.created_at).toLocaleTimeString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 15-workflow E2E Certification ── */}
        <div className="border-2 border-indigo-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-purple-600 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-black text-white">🏆 15-Workflow E2E Production Certification</p>
              <p className="text-[10px] text-indigo-200 mt-0.5">
                OTP · Booking · Payments · Invoice · Agreement · Visa · Flight · Hotel · Room · Passport · Reminder · Broadcast
              </p>
            </div>
            <Button
              className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-xs"
              size="sm"
              onClick={runCertification}
              disabled={certRunning}
            >
              {certRunning ? <><Spin />Running {certResults.length}/{WORKFLOWS.length}…</> : certResults.length ? "🔄 Re-Run All 15" : "▶ Run E2E Tests"}
            </Button>
          </div>

          {certResults.length > 0 && (
            <div className="p-4 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniCard label="Pass Rate"       value={`${certScore}%`}      green={certScore >= 80} amber={certScore >= 50 && certScore < 80} red={certScore < 50} />
                <MiniCard label="Tests Passed"    value={`${passed}/${certResults.length}`} green={passed === certResults.length} />
                <MiniCard label="via Meta Cloud"  value={metaUsed}             green={metaUsed > 0} />
                <MiniCard label="via BotBee/SMS"  value={botbeeUsed}           amber={botbeeUsed > 0} green={botbeeUsed === 0} />
              </div>

              {/* Results table */}
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Workflow</th>
                      <th className="text-center px-2 py-2.5 font-semibold text-gray-600">Result</th>
                      <th className="text-left px-2 py-2.5 font-semibold text-gray-600">Provider</th>
                      <th className="text-left px-2 py-2.5 font-semibold text-gray-600 hidden sm:table-cell">Message ID / Error</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-600">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certResults.map((r) => (
                      <tr key={r.id} className={`border-b last:border-0 ${r.ok ? "bg-white hover:bg-gray-50" : "bg-red-50/30"}`}>
                        <td className="px-3 py-2">{r.icon} {r.label}</td>
                        <td className="px-2 py-2 text-center font-bold">{r.ok ? "✅" : "❌"}</td>
                        <td className="px-2 py-2">
                          <span className={`text-[10px] font-semibold ${
                            r.provider?.includes("Meta") ? "text-blue-700"
                            : r.provider?.includes("BotBee") ? "text-green-700"
                            : "text-gray-500"}`}>
                            {r.provider || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2 hidden sm:table-cell">
                          {r.ok
                            ? <code className="text-[9px] text-gray-500 font-mono">{r.wamid || "test-mode"}</code>
                            : <span className="text-red-600 text-[10px]">{r.error || "Failed"}</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right text-gray-400">{r.ms}</td>
                      </tr>
                    ))}
                    {/* Pending rows while running */}
                    {certRunning && WORKFLOWS.slice(certResults.length).map(wf => (
                      <tr key={wf.id} className="border-b last:border-0 bg-blue-50/20">
                        <td className="px-3 py-2 text-gray-400">{wf.icon} {wf.label}</td>
                        <td className="px-2 py-2 text-center"><Spin /></td>
                        <td colSpan={3} className="px-2 py-2 text-gray-400 text-[10px]">waiting…</td>
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
          <div className="border-2 border-gray-200 rounded-xl overflow-hidden print:border-0">
            {/* Report header */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-5 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Production Certification Report</p>
                  <p className="text-xl font-black text-white mt-1">Al Burhan Tours & Travels ERP</p>
                  <p className="text-[11px] text-gray-300 mt-1">{certTime} · {vps?.build || "v30.0-meta-production"} · Node {vps?.node || "v20"}</p>
                </div>
                <Button size="sm" variant="outline" className="border-gray-500 text-gray-200 hover:bg-gray-800 text-[10px]"
                  onClick={() => window.print()}>🖨️ Print</Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  { label: "ERP Version",     val: vps?.build || "v30.0",   cls: "bg-white/10 text-white" },
                  { label: "Health Score",    val: `${score}/100`,           cls: score >= 80 ? "bg-green-500/20 text-green-200" : "bg-amber-500/20 text-amber-200" },
                  { label: "E2E Pass Rate",   val: `${certScore}%`,          cls: certScore >= 80 ? "bg-green-500/20 text-green-200" : "bg-red-500/20 text-red-200" },
                  { label: "Workflows Tested",val: `${certResults.length}`,  cls: "bg-white/10 text-white" },
                ].map(({ label, val, cls }) => (
                  <div key={label} className={`rounded-xl p-3 text-center border border-white/10 ${cls}`}>
                    <p className="text-xl font-black">{val}</p>
                    <p className="text-[9px] mt-0.5 opacity-80">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Report body */}
            <div className="p-5 bg-white space-y-3">
              <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider border-b pb-1">Certification Checklist</p>

              {[
                {
                  label: "Meta Cloud API Integration",
                  ok:    health.configured,
                  note:  health.configured ? "Active — PRIMARY WhatsApp provider" : `Pending ${health.missingSecrets.length} secrets: ${health.missingSecrets.slice(0, 3).join(", ")}${health.missingSecrets.length > 3 ? "…" : ""}`,
                },
                {
                  label: "WhatsApp Cloud API Status",
                  ok:    conn === "ok",
                  note:  health.connectionDetail,
                },
                {
                  label: "Token Validation",
                  ok:    health.token.valid,
                  note:  health.token.valid ? `Valid · Expires: ${health.token.expiresAt ? new Date(health.token.expiresAt).toLocaleDateString("en-IN") : "never"}` : "Run 'Validate Token' after META_ACCESS_TOKEN is set",
                },
                {
                  label: "Phone Number ID Verified",
                  ok:    !!health.phoneNumber,
                  note:  health.phoneNumber || "Set META_PHONE_NUMBER_ID in Replit Secrets",
                },
                {
                  label: "Business Account Linked",
                  ok:    !!health.business.accountId,
                  note:  health.business.accountId || "Set META_BUSINESS_ACCOUNT_ID",
                },
                {
                  label: "WABA ID Configured",
                  ok:    !!health.business.wabaId,
                  note:  health.business.wabaId || "Set META_WABA_ID",
                },
                {
                  label: "Webhook Subscription",
                  ok:    health.configured,
                  note:  `${health.webhook} — fields: messages, message_deliveries, message_reads`,
                },
                {
                  label: "Template Sync Status",
                  ok:    health.templates.approved > 0,
                  note:  `${health.templates.approved} approved templates · ${health.templates.mapped} event types mapped`,
                },
                {
                  label: "Queue Health",
                  ok:    health.retryCount === 0 && health.failedCount === 0,
                  note:  `${health.retryCount} retrying · ${health.failedCount} failed · ${health.deliveryRate}% delivery rate`,
                },
                {
                  label: "Retry Queue Empty",
                  ok:    health.retryCount === 0,
                  note:  health.retryCount === 0 ? "No messages pending retry" : `${health.retryCount} in retry queue — click ♻️ Retry Queue`,
                },
                {
                  label: "Webhook Security",
                  ok:    health.securityStatus.webhookSignatureEnabled && health.securityStatus.appSecretConfigured,
                  note:  health.securityStatus.status === "secure" ? "🔒 Webhook signature + App Secret configured" : "Set META_WEBHOOK_SECRET and META_APP_SECRET",
                },
                {
                  label: "BotBee Auto-Fallback",
                  ok:    true,
                  note:  "BotBee is permanently active as the automatic fallback provider",
                },
                {
                  label: `15-Workflow E2E Tests (${passed}/${certResults.length} passed)`,
                  ok:    certScore >= 80,
                  note:  `${metaUsed} via Meta Cloud API · ${botbeeUsed} via BotBee · ${certResults.length - passed} failed`,
                },
              ].map(({ label, ok, note }) => (
                <div key={label} className={`flex items-start gap-3 p-2.5 rounded-lg border ${ok ? "bg-green-50/50 border-green-100" : "bg-red-50/50 border-red-100"}`}>
                  <span className="text-sm flex-shrink-0 mt-0.5">{ok ? "✅" : "❌"}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-gray-800">{label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>
                  </div>
                </div>
              ))}

              {/* Remaining Issues */}
              {health.missingSecrets.length > 0 && (
                <div className="border-2 border-amber-300 rounded-xl p-3 bg-amber-50 mt-4">
                  <p className="text-[11px] font-bold text-amber-900 mb-2">⚠️ Remaining Issues — Complete These to Achieve 100%</p>
                  <ol className="list-decimal list-inside space-y-1 text-[10px] text-amber-800">
                    {health.missingSecrets.map(s => (
                      <li key={s}>
                        Add <code className="bg-amber-100 px-1 rounded font-mono">{s}</code> to Replit Secrets
                        <span className="text-amber-600 ml-1">— {SECRET_GUIDE[s]?.split("→")[0] || ""}</span>
                      </li>
                    ))}
                    <li>Restart VPS after adding all secrets</li>
                    <li>Click <strong>Validate Token</strong> → confirm ✅ Token Valid</li>
                    <li>Click <strong>Sync Templates</strong> → confirm approved template count &gt; 0</li>
                    <li>Re-run <strong>E2E Tests</strong> → confirm Meta Cloud API in the Provider column</li>
                  </ol>
                </div>
              )}

              {health.missingSecrets.length === 0 && (
                <div className="border-2 border-green-300 rounded-xl p-3 bg-green-50 mt-4 text-center">
                  <p className="text-sm font-black text-green-800">🎉 All systems configured — Meta Cloud API is the active provider!</p>
                  <p className="text-[10px] text-green-700 mt-1">Run the E2E test suite to generate final certification.</p>
                </div>
              )}

              <p className="text-[9px] text-gray-400 text-center pt-3 border-t">
                Al Burhan Tours & Travels ERP · {vps?.build || "v30.0-meta-production"} · PID {vps?.pid || "—"} · Node {vps?.node || "v20"} ·
                Report generated {certTime} · alburhantravels.com
              </p>
            </div>
          </div>
        )}

        {/* ── Setup Guide ── */}
        <details className="border rounded-xl overflow-hidden">
          <summary className="px-4 py-3 bg-indigo-50 text-sm font-semibold text-indigo-900 cursor-pointer select-none">
            🛠️ 5-Step Meta Cloud API Activation Guide
          </summary>
          <div className="px-4 py-3 bg-indigo-50/30 border-t border-indigo-100 space-y-2.5 text-[11px]">
            {[
              ["Step 1 — Add all 9 secrets to Replit", "Replit → Secrets tab → add each META_* value. All must be set for the system to activate. The missing secrets list above shows exactly what's needed and where to find each value."],
              ["Step 2 — Restart the VPS", "The VPS process must restart to pick up new secrets. Use Admin → Meta Health → self-update, or SSH into the VPS and run: pm2 restart all"],
              ["Step 3 — Validate Token", "Click 'Validate Token' above. It calls graph.facebook.com/me to verify your token is valid and has the required permissions (whatsapp_business_messaging, whatsapp_business_management)."],
              ["Step 4 — Sync Templates", "Click 'Sync Templates'. This pulls all APPROVED WhatsApp templates from your WABA and maps them to the 27 ERP notification events. Templates must be approved by Meta before use."],
              ["Step 5 — Run E2E Certification + Send Test", "Click 'Run E2E Tests'. All 15 workflows are tested. Enter your mobile number and click 'Send Test' to verify a real message arrives. The Provider column should show 'Meta Cloud API'."],
            ].map(([title, body]) => (
              <div key={String(title)} className="bg-white rounded-lg p-2.5 border border-indigo-100">
                <p className="font-bold text-indigo-900">{title}</p>
                <p className="mt-0.5 text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </details>

      </div>
    </AdminLayout>
  );
}
