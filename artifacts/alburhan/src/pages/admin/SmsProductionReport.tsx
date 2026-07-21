import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle, ShieldCheck, ShieldAlert,
  Smartphone, MessageSquare, Mail, Clock, User, Globe, Monitor,
  Activity, Zap, FileText, Download, Play, PlayCircle, ChevronDown, ChevronUp,
  MessageCircle, Hash, Loader2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChannelStat {
  lastSent: string | null;
  lastFailed: string | null;
  totalSent: number;
  totalFailed: number;
}
interface SmsEvent {
  event: string; label: string; templateConfigured: boolean;
  templateId: string | null; senderId: string; route: string;
  sms: ChannelStat | null; whatsapp: ChannelStat | null; email: ChannelStat | null;
}
interface Check { id: string; label: string; pass: boolean; detail?: string; }
interface ReportData {
  ok: boolean; productionReady: boolean; generatedAt: string;
  summary: { total: number; passed: number; failed: number; score: number };
  policy: { primaryRoute: string; emergencyFallbackDefault: string; quickRouteAutomatic: boolean; quickRouteRequires: string };
  emergencyStatus: { enabled: boolean; reason: string | null; enabledBy: string | null; enabledAt: string | null; enabledIp: string | null; enabledDevice: string | null };
  smsConfig: { apiKeyConfigured: boolean; globalSenderId: string; approvedSenderIds: string[]; templatesCoverage: { configured: number; total: number }; events: SmsEvent[] };
  channels: { sms: any; whatsapp: any; email: any };
  checks: Check[];
}

interface TestResult {
  ok: boolean; event: string; label: string;
  templateId: string | null; senderId: string; route: string; mobile: string;
  status: "DELIVERED" | "FAILED" | "SKIPPED";
  messageId: string | null; sentAt: string | null; durationMs: number;
  httpStatus: number; providerResponse: any; providerMessage: string;
  requestUrl: string; logId: string; reason?: string;
  validations?: { templateConfigured: boolean; senderIdSet: boolean; routeDlt: boolean; noFallback: boolean; apiKeyPresent: boolean };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function StatusBadge({ status }: { status: "DELIVERED" | "FAILED" | "SKIPPED" | string }) {
  const cfg = {
    DELIVERED: "bg-green-100 text-green-700",
    FAILED:    "bg-red-100 text-red-700",
    SKIPPED:   "bg-amber-100 text-amber-700",
  }[status] || "bg-gray-100 text-gray-600";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cfg}`}>{status}</span>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: Check }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${check.pass ? "hover:bg-green-50/40" : "bg-red-50/40 hover:bg-red-50/60"}`}>
      {check.pass ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{check.label}</p>
        {check.detail && <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>}
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${check.pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {check.pass ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score === 100 ? "#16a34a" : score >= 75 ? "#d97706" : "#dc2626";
  const r = 44, stroke = 8, circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width="110" height="110" className="-rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s ease" }} />
        </svg>
        <div className="absolute text-center">
          <p className="text-2xl font-bold font-mono" style={{ color }}>{score}</p>
          <p className="text-[10px] text-gray-400">/ 100</p>
        </div>
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {score === 100 ? "Production Ready" : score >= 75 ? "Needs Attention" : "Not Ready"}
      </p>
    </div>
  );
}

function ChannelCard({ icon: Icon, label, enabled, detail, stat }: { icon: any; label: string; enabled: boolean; detail: string; stat?: string }) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border-2 ${enabled ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <Icon className={`w-5 h-5 ${enabled ? "text-green-600" : "text-red-500"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{detail}</p>
        {stat && <p className="text-xs text-gray-400 mt-0.5">{stat}</p>}
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {enabled ? "Active" : "Inactive"}
      </span>
    </div>
  );
}

// ── Production Test Row ───────────────────────────────────────────────────────

function TestRow({ ev, testMobile, result, running, onTest }: {
  ev: SmsEvent; testMobile: string; result: TestResult | null;
  running: boolean; onTest: (event: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-b last:border-0 ${result ? (result.ok ? "bg-green-50/20" : result.status === "SKIPPED" ? "bg-amber-50/20" : "bg-red-50/20") : ""}`}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        {/* Status icon */}
        <div className="w-5 shrink-0">
          {running ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" /> :
           result ? (result.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                    result.status === "SKIPPED" ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                    <XCircle className="w-4 h-4 text-red-600" />) :
           (ev.templateConfigured ? <div className="w-4 h-4 rounded-full border-2 border-gray-300" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />)}
        </div>

        {/* Label */}
        <span className="flex-1 text-sm text-gray-700 font-medium min-w-0 truncate">{ev.label}</span>

        {/* Template + Sender */}
        <span className="hidden sm:block text-[10px] font-mono text-gray-400 shrink-0">
          {ev.templateId ? `${ev.senderId} / ${ev.templateId}` : "—"}
        </span>

        {/* Result badge */}
        {result && <StatusBadge status={result.status} />}
        {result && result.messageId && (
          <span className="hidden md:block text-[10px] font-mono text-blue-600 shrink-0">ID: {result.messageId}</span>
        )}

        {/* Expand + Test buttons */}
        {result && (
          <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={() => onTest(ev.event)}
          disabled={running || !testMobile}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold shrink-0 transition-colors
            ${ev.templateConfigured
              ? "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
            }`}
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {ev.templateConfigured ? "Test" : "Test (no TID)"}
        </button>
      </div>

      {/* Expanded detail panel */}
      {expanded && result && (
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Sender ID", value: result.senderId },
              { label: "Template ID", value: result.templateId || "Not configured" },
              { label: "Route", value: result.route.toUpperCase() },
              { label: "HTTP Status", value: String(result.httpStatus || "—") },
              { label: "Message ID", value: result.messageId || "—" },
              { label: "Sent At", value: fmtTime(result.sentAt) },
              { label: "Duration", value: result.durationMs ? `${result.durationMs}ms` : "—" },
              { label: "Log ID", value: result.logId || "—" },
            ].map(f => (
              <div key={f.label} className="bg-gray-50 rounded px-2 py-1.5">
                <p className="text-gray-400 text-[10px] uppercase">{f.label}</p>
                <p className="text-gray-800 font-mono truncate">{f.value}</p>
              </div>
            ))}
          </div>
          {result.reason && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">{result.reason}</div>
          )}
          {result.providerMessage && (
            <div className={`text-xs rounded px-3 py-2 ${result.ok ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
              Provider: {result.providerMessage}
            </div>
          )}
          {result.validations && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.validations).map(([k, v]) => (
                <span key={k} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {k.replace(/([A-Z])/g, " $1").trim()}: {v ? "✓" : "✗"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmsProductionReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"report" | "test">("report");
  const [showEventDetail, setShowEventDetail] = useState(false);

  // Test panel state
  const [testMobile, setTestMobile] = useState("");
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const [runAllLoading, setRunAllLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/sms-settings/production-report`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runTest = useCallback(async (event: string) => {
    if (!testMobile || testMobile.replace(/\D/g, "").length < 10) return;
    setRunningTests(s => new Set(s).add(event));
    try {
      const r = await fetch(`${API}/api/sms-settings/production-test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, mobile: testMobile }),
      });
      const d = await r.json();
      setTestResults(prev => ({ ...prev, [event]: d }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [event]: { ok: false, event, label: event, status: "FAILED", providerMessage: e.message, templateId: null, senderId: "", route: "dlt", mobile: testMobile, messageId: null, sentAt: null, durationMs: 0, httpStatus: 0, providerResponse: null, requestUrl: "", logId: "" } }));
    } finally {
      setRunningTests(s => { const n = new Set(s); n.delete(event); return n; });
    }
  }, [testMobile]);

  const runAllTests = useCallback(async () => {
    if (!data || !testMobile || testMobile.replace(/\D/g, "").length < 10) return;
    setRunAllLoading(true);
    for (const ev of data.smsConfig.events) {
      if (runningTests.has(ev.event)) continue;
      await runTest(ev.event);
      await new Promise(r => setTimeout(r, 600)); // rate-limit between tests
    }
    setRunAllLoading(false);
  }, [data, testMobile, runningTests, runTest]);

  // Export
  const handleExport = useCallback(() => {
    if (!data) return;
    const hr = "=".repeat(58);
    const tested = Object.values(testResults);
    const passed = tested.filter(r => r.ok).length;
    const failed = tested.filter(r => !r.ok && r.status !== "SKIPPED").length;
    const skipped = tested.filter(r => r.status === "SKIPPED").length;

    const lines = [
      hr, "  AL BURHAN TOURS & TRAVELS", "  PRODUCTION NOTIFICATION VERIFICATION REPORT", hr,
      `  Generated     : ${new Date().toLocaleString("en-IN")}`,
      `  Overall Status: ${data.productionReady ? "PASS" : "FAIL"}`,
      `  Score         : ${data.summary.score}/100 (${data.summary.passed}/${data.summary.total} system checks)`,
      `  Production Ready: ${data.productionReady ? "YES" : "NO"}`,
      "",
      "SMS PROVIDER STATUS",
      `  Provider     : Fast2SMS`,
      `  Route        : DLT Primary Only`,
      `  API Key      : ${data.smsConfig.apiKeyConfigured ? "Configured" : "NOT CONFIGURED"}`,
      `  Global Sender: ${data.smsConfig.globalSenderId}`,
      `  Approved IDs : ${data.smsConfig.approvedSenderIds.join(", ") || "None"}`,
      `  24h Sent     : ${data.channels.sms.last24h.sent}`,
      `  24h Failed   : ${data.channels.sms.last24h.failed}`,
      `  Emergency    : ${data.channels.sms.last24h.emergency > 0 ? `${data.channels.sms.last24h.emergency} ⚠ ACTIVE` : "0 (OFF — correct)"}`,
      "",
      "WHATSAPP PROVIDER STATUS",
      `  Provider: BotBee | Status: ${data.channels.whatsapp.enabled ? "Active" : "Inactive"} | 24h Sent: ${data.channels.whatsapp.last24h.sent}`,
      "",
      "EMAIL PROVIDER STATUS",
      `  Provider: SMTP | Status: ${data.channels.email.enabled ? "Active" : "Inactive"} | 24h Sent: ${data.channels.email.last24h.sent}`,
      "",
      "SENDER IDs CONFIGURED",
      `  Default  : ${data.smsConfig.globalSenderId}`,
      `  Approved : ALBURH · ALBUR · ABURHA · ABTUMR · ABTTHJ`,
      "",
      "DLT TEMPLATES CONFIGURED",
      `  ${data.smsConfig.templatesCoverage.configured} of ${data.smsConfig.templatesCoverage.total} events configured`,
      ...data.smsConfig.events.map(e =>
        `  [${e.templateConfigured ? "✓" : "✗"}] ${e.label.padEnd(36)} ${e.senderId.padEnd(8)} ${e.templateId || "(not set)"}`
      ),
      "",
      ...(tested.length > 0 ? [
        "PRODUCTION TEST RESULTS",
        `  Events Tested  : ${tested.length}`,
        `  Events Passed  : ${passed}`,
        `  Events Failed  : ${failed}`,
        `  Events Skipped : ${skipped}`,
        `  Test Mobile    : ${testMobile}`,
        "",
        ...tested.map(r =>
          `  [${r.status.padEnd(8)}] ${r.label.padEnd(36)} Sender: ${r.senderId.padEnd(8)} TID: ${r.templateId || "—".padEnd(10)} MsgID: ${r.messageId || "—"} ${r.providerMessage ? `| ${r.providerMessage}` : ""}`
        ),
        "",
      ] : []),
      "SYSTEM CHECKS",
      ...data.checks.map(c => `  [${c.pass ? "PASS" : "FAIL"}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`),
      "",
      hr,
      `  Overall Status    : ${data.productionReady ? "PASS" : "FAIL"}`,
      `  SMS Provider      : ${data.smsConfig.apiKeyConfigured ? "PASS" : "FAIL"}`,
      `  WhatsApp Provider : ${data.channels.whatsapp.enabled ? "PASS" : "FAIL"}`,
      `  Email Provider    : ${data.channels.email.enabled ? "PASS" : "FAIL"}`,
      `  Sender IDs        : ${data.smsConfig.approvedSenderIds.length} configured`,
      `  DLT Templates     : ${data.smsConfig.templatesCoverage.configured}/${data.smsConfig.templatesCoverage.total} events`,
      ...(tested.length > 0 ? [
        `  Events Tested     : ${tested.length}`,
        `  Events Passed     : ${passed}`,
        `  Events Failed     : ${failed}`,
      ] : []),
      `  Production Ready  : ${data.productionReady ? "YES" : "NO"}`,
      hr,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `production-verification-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data, testResults, testMobile]);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Production Notification Verification Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live system checks · DLT compliance · Real SMS tests per event
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={!data} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" /> Failed to load: {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center h-52">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {data && (
          <>
            {/* Score Banner */}
            <div className={`rounded-xl border-2 p-5 flex flex-col sm:flex-row items-center gap-6 ${data.productionReady ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
              <ScoreRing score={data.summary.score} />
              <div className="flex-1 text-center sm:text-left">
                <h2 className={`text-lg font-bold ${data.productionReady ? "text-green-800" : "text-red-800"}`}>
                  {data.productionReady ? "✓ System is Production Ready" : "⚠ Issues Require Attention"}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {data.summary.passed}/{data.summary.total} checks passed
                  {data.summary.failed > 0 && ` — ${data.summary.failed} failed`}
                </p>
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                <span className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                  <Zap className="w-3 h-3" /> DLT Only
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                  <ShieldCheck className="w-3 h-3" /> No Auto Fallback
                </span>
                <span className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-full ${data.emergencyStatus.enabled ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}>
                  <ShieldAlert className="w-3 h-3" /> Emergency: {data.emergencyStatus.enabled ? "ACTIVE ⚠" : "OFF"}
                </span>
              </div>
            </div>

            {/* Emergency Warning */}
            {data.emergencyStatus.enabled && (
              <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 space-y-3">
                <h3 className="text-sm font-bold text-red-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Emergency SMS Fallback is ACTIVE
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { icon: AlertTriangle, label: "Reason", value: data.emergencyStatus.reason },
                    { icon: User, label: "Enabled By", value: data.emergencyStatus.enabledBy },
                    { icon: Clock, label: "Enabled At", value: data.emergencyStatus.enabledAt ? new Date(data.emergencyStatus.enabledAt).toLocaleString("en-IN") : null },
                    { icon: Globe, label: "IP Address", value: data.emergencyStatus.enabledIp },
                    { icon: Monitor, label: "Device", value: data.emergencyStatus.enabledDevice?.slice(0, 80) },
                  ].filter(i => i.value).map(({ icon: I, label, value }) => (
                    <div key={label} className="flex items-start gap-2 bg-red-100 rounded-lg px-3 py-2">
                      <I className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                      <span><strong className="text-red-800">{label}:</strong> <span className="text-red-700">{value}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b">
              {([
                { id: "report", label: "System Report", icon: ShieldCheck },
                { id: "test",   label: "Production Tests", icon: PlayCircle },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>

            {/* ── REPORT TAB ─────────────────────────────────────────────────── */}
            {tab === "report" && (
              <div className="space-y-5">
                {/* Production Verification Summary */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Production Verification Summary</h3>
                  </div>
                  <div className="divide-y text-sm">
                    {[
                      { label: "Overall Status",        value: data.productionReady ? "PASS" : "FAIL",                                              ok: data.productionReady },
                      { label: "SMS Provider",          value: data.smsConfig.apiKeyConfigured ? `Active — Fast2SMS DLT (${data.smsConfig.globalSenderId})` : "NOT CONFIGURED", ok: data.smsConfig.apiKeyConfigured },
                      { label: "WhatsApp Provider",     value: data.channels.whatsapp.enabled ? "Active — BotBee" : "Inactive",                     ok: data.channels.whatsapp.enabled },
                      { label: "Email Provider",        value: data.channels.email.enabled ? "Active — SMTP" : "Inactive",                          ok: data.channels.email.enabled },
                      { label: "Sender IDs Configured", value: `${data.smsConfig.approvedSenderIds.length} approved  (ALBURH · ALBUR · ABURHA · ABTUMR · ABTTHJ)  Default: ${data.smsConfig.globalSenderId}`, ok: data.smsConfig.approvedSenderIds.length > 0 },
                      { label: "DLT Templates",         value: `${data.smsConfig.templatesCoverage.configured} / ${data.smsConfig.templatesCoverage.total} events configured`,  ok: data.smsConfig.templatesCoverage.configured === data.smsConfig.templatesCoverage.total },
                      { label: "Emergency Fallback",    value: data.emergencyStatus.enabled ? "ACTIVE — disable after DLT recovery" : "OFF (correct)", ok: !data.emergencyStatus.enabled },
                      { label: "Production Ready",      value: data.productionReady ? "YES" : "NO",                                                  ok: data.productionReady },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-3 px-4 py-2.5">
                        {row.ok ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span className="w-48 text-gray-500 font-medium shrink-0">{row.label}</span>
                        <span className={row.ok ? "text-gray-800" : "text-red-700 font-semibold"}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System checks */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">System Policy Checks</h3>
                  </div>
                  {data.checks.map(c => <CheckRow key={c.id} check={c} />)}
                </div>

                {/* Channels */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Notification Channels
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ChannelCard icon={Smartphone} label="SMS — Fast2SMS DLT" enabled={data.channels.sms.enabled}
                      detail={`Route: DLT only | Sender: ${data.smsConfig.globalSenderId}`}
                      stat={`24h: ${data.channels.sms.last24h.sent} sent, ${data.channels.sms.last24h.failed} failed${data.channels.sms.last24h.emergency > 0 ? ` | ${data.channels.sms.last24h.emergency} emergency ⚠` : ""}`} />
                    <ChannelCard icon={MessageSquare} label="WhatsApp — BotBee" enabled={data.channels.whatsapp.enabled}
                      detail="Provider: BotBee API" stat={`24h: ${data.channels.whatsapp.last24h.sent} sent`} />
                    <ChannelCard icon={Mail} label="Email — SMTP" enabled={data.channels.email.enabled}
                      detail="Provider: SMTP" stat={`24h: ${data.channels.email.last24h.sent} sent`} />
                  </div>
                </div>

                {/* DLT Coverage Table */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-semibold text-gray-700">DLT Template Coverage &amp; Delivery Stats</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.smsConfig.templatesCoverage.configured === data.smsConfig.templatesCoverage.total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {data.smsConfig.templatesCoverage.configured}/{data.smsConfig.templatesCoverage.total} configured
                      </span>
                      <button onClick={() => setShowEventDetail(v => !v)} className="text-xs text-blue-600 underline">
                        {showEventDetail ? "Compact" : "Delivery stats"}
                      </button>
                    </div>
                  </div>

                  {!showEventDetail && (
                    <div className="divide-y">
                      {data.smsConfig.events.map(ev => (
                        <div key={ev.event} className={`flex items-center gap-3 px-4 py-2.5 ${ev.templateConfigured ? "" : "bg-amber-50/40"}`}>
                          {ev.templateConfigured ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                          <span className="flex-1 text-sm text-gray-700">{ev.label}</span>
                          <span className="text-[10px] font-mono text-gray-400 mr-1">{ev.senderId}</span>
                          {ev.templateId
                            ? <code className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{ev.templateId}</code>
                            : <span className="text-xs text-amber-600 font-medium">Not Configured</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {showEventDetail && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider text-[10px]">
                            <th className="px-3 py-2 text-left">Event</th>
                            <th className="px-3 py-2 text-left">Sender / TID</th>
                            <th className="px-2 py-2 text-center">SMS Sent/Fail</th>
                            <th className="px-2 py-2 text-left">Last SMS Sent</th>
                            <th className="px-2 py-2 text-left">Last Failed</th>
                            <th className="px-2 py-2 text-center">WA S/F</th>
                            <th className="px-2 py-2 text-center">Email S/F</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {data.smsConfig.events.map(ev => (
                            <tr key={ev.event} className={ev.templateConfigured ? "hover:bg-gray-50/50" : "bg-amber-50/30"}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {ev.templateConfigured ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                  <span className="text-gray-800">{ev.label}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono">
                                <span className="text-gray-500 mr-1">{ev.senderId}</span>
                                {ev.templateId ? <span className="text-blue-700 bg-blue-50 px-1 rounded">{ev.templateId}</span> : <span className="text-amber-600">—</span>}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <span className="text-green-600">{ev.sms?.totalSent ?? 0}</span> / <span className="text-red-500">{ev.sms?.totalFailed ?? 0}</span>
                              </td>
                              <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap">{fmtTime(ev.sms?.lastSent)}</td>
                              <td className={`px-2 py-2.5 whitespace-nowrap ${ev.sms?.lastFailed ? "text-red-500" : "text-gray-300"}`}>{fmtTime(ev.sms?.lastFailed)}</td>
                              <td className="px-2 py-2.5 text-center">
                                <span className="text-green-600">{ev.whatsapp?.totalSent ?? 0}</span> / <span className="text-red-500">{ev.whatsapp?.totalFailed ?? 0}</span>
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <span className="text-green-600">{ev.email?.totalSent ?? 0}</span> / <span className="text-red-500">{ev.email?.totalFailed ?? 0}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Quick links */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "DLT Template Manager", href: "/admin/dlt-templates" },
                    { label: "Sender ID Manager", href: "/admin/sender-ids" },
                    { label: "Notification Logs", href: "/admin/notification-logs" },
                    { label: "SMS Audit Log", href: "/admin/sms-audit" },
                    { label: "SMS Test Page", href: "/admin/sms-test" },
                  ].map(l => (
                    <a key={l.href} href={l.href} className="text-xs text-blue-600 underline hover:text-blue-800 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── TEST TAB ───────────────────────────────────────────────────── */}
            {tab === "test" && (
              <div className="space-y-4">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
                  <p className="font-semibold flex items-center gap-2"><Smartphone className="w-4 h-4" /> Real DLT Production Test</p>
                  <p>Each test fires a real Fast2SMS DLT SMS using the configured template + sender ID for that event.</p>
                  <p>Results are permanently logged to Notification Logs. Use your own mobile number to verify delivery.</p>
                  <p className="text-xs text-blue-600 mt-1">Route: DLT only · No Quick SMS · No Emergency SMS · No Fallback</p>
                </div>

                {/* Test mobile + Run All */}
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-48">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Test Mobile Number</label>
                    <input
                      type="tel" placeholder="10-digit mobile number"
                      value={testMobile}
                      onChange={e => setTestMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <button
                    onClick={runAllTests}
                    disabled={runAllLoading || !testMobile || testMobile.length < 10}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {runAllLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    {runAllLoading ? "Testing all events…" : "Run All Tests"}
                  </button>
                </div>

                {/* Test results summary */}
                {Object.keys(testResults).length > 0 && (() => {
                  const vals = Object.values(testResults);
                  const passed = vals.filter(r => r.ok).length;
                  const failed = vals.filter(r => !r.ok && r.status !== "SKIPPED").length;
                  const skipped = vals.filter(r => r.status === "SKIPPED").length;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Delivered", count: passed, color: "bg-green-50 border-green-200 text-green-700" },
                        { label: "Failed", count: failed, color: "bg-red-50 border-red-200 text-red-700" },
                        { label: "Skipped (no TID)", count: skipped, color: "bg-amber-50 border-amber-200 text-amber-700" },
                      ].map(s => (
                        <div key={s.label} className={`rounded-xl border-2 p-3 text-center ${s.color}`}>
                          <p className="text-2xl font-bold">{s.count}</p>
                          <p className="text-xs font-semibold">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Per-event test rows */}
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-semibold text-gray-700">Test Each Event ({data.smsConfig.events.length} events)</h3>
                    </div>
                    {Object.keys(testResults).length > 0 && (
                      <span className="text-xs text-gray-500">{Object.keys(testResults).length} tested</span>
                    )}
                  </div>
                  {data.smsConfig.events.map(ev => (
                    <TestRow
                      key={ev.event}
                      ev={ev}
                      testMobile={testMobile}
                      result={testResults[ev.event] ?? null}
                      running={runningTests.has(ev.event)}
                      onTest={runTest}
                    />
                  ))}
                </div>

                {/* Policy reminder */}
                <div className="bg-gray-50 border rounded-xl p-3 text-xs text-gray-600 space-y-0.5">
                  <p className="font-semibold text-gray-700">Production Policy Reminder</p>
                  <p>✓ DLT Route only — no Quick SMS, no Emergency SMS, no automatic fallback</p>
                  <p>✓ If DLT template rejects: log error, continue WhatsApp + Email</p>
                  <p>✓ Emergency mode (manual admin-only): for when DLT templates are not yet approved</p>
                  <p>✓ All test results permanently stored in Notification Logs with Sender ID + Message ID</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
