import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle, ShieldCheck, ShieldAlert,
  Smartphone, MessageSquare, Mail, Clock, User, Globe, Monitor,
  Activity, Zap, FileText, Download
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface ChannelStat {
  lastSent: string | null;
  lastFailed: string | null;
  totalSent: number;
  totalFailed: number;
}
interface SmsEvent {
  event: string;
  label: string;
  templateConfigured: boolean;
  templateId: string | null;
  senderId: string;
  route: string;
  sms: ChannelStat | null;
  whatsapp: ChannelStat | null;
  email: ChannelStat | null;
}
interface Check { id: string; label: string; pass: boolean; detail?: string; }
interface ReportData {
  ok: boolean;
  productionReady: boolean;
  generatedAt: string;
  summary: { total: number; passed: number; failed: number; score: number };
  policy: { primaryRoute: string; emergencyFallbackDefault: string; quickRouteAutomatic: boolean; quickRouteRequires: string };
  emergencyStatus: { enabled: boolean; reason: string | null; enabledBy: string | null; enabledAt: string | null; enabledIp: string | null; enabledDevice: string | null };
  smsConfig: { apiKeyConfigured: boolean; globalSenderId: string; approvedSenderIds: string[]; templatesCoverage: { configured: number; total: number }; events: SmsEvent[] };
  channels: { sms: any; whatsapp: any; email: any };
  checks: Check[];
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

function CheckRow({ check }: { check: Check }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${check.pass ? "hover:bg-green-50/40" : "bg-red-50/40 hover:bg-red-50/60"}`}>
      {check.pass
        ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
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
  const dash = circ * (1 - score / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width="110" height="110" className="-rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
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

function StatPill({ val, color }: { val: number; color: string }) {
  if (!val) return <span className="text-gray-300 text-xs">0</span>;
  return <span className={`text-xs font-semibold ${color}`}>{val}</span>;
}

export default function SmsProductionReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/sms-settings/production-report`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    if (!data) return;
    const hr = "=".repeat(56);
    const lines: string[] = [
      hr,
      "  AL BURHAN TOURS & TRAVELS",
      "  PRODUCTION NOTIFICATION VERIFICATION REPORT",
      hr,
      `  Generated     : ${new Date(data.generatedAt).toLocaleString("en-IN")}`,
      `  Overall Status: ${data.productionReady ? "PASS" : "FAIL"}`,
      `  Production Ready: ${data.productionReady ? "YES" : "NO"}`,
      `  Score         : ${data.summary.score}/100 (${data.summary.passed}/${data.summary.total} checks passed)`,
      "",
      "SMS PROVIDER STATUS",
      `  Provider   : Fast2SMS`,
      `  Route      : DLT Primary Only`,
      `  API Key    : ${data.smsConfig.apiKeyConfigured ? "Configured" : "NOT CONFIGURED"}`,
      `  Global Sender ID: ${data.smsConfig.globalSenderId}`,
      `  Approved Sender IDs: ${data.smsConfig.approvedSenderIds.join(", ") || "None"}`,
      `  24h Sent   : ${data.channels.sms.last24h.sent}`,
      `  24h Failed : ${data.channels.sms.last24h.failed}`,
      `  Emergency  : ${data.channels.sms.last24h.emergency > 0 ? `${data.channels.sms.last24h.emergency} (ACTIVE — review immediately)` : "0 (OFF — correct)"}`,
      "",
      "WHATSAPP PROVIDER STATUS",
      `  Provider   : BotBee`,
      `  Status     : ${data.channels.whatsapp.enabled ? "Active" : "Inactive"}`,
      `  24h Sent   : ${data.channels.whatsapp.last24h.sent}`,
      `  24h Failed : ${data.channels.whatsapp.last24h.failed || 0}`,
      "",
      "EMAIL PROVIDER STATUS",
      `  Provider   : SMTP`,
      `  Status     : ${data.channels.email.enabled ? "Active" : "Inactive"}`,
      `  24h Sent   : ${data.channels.email.last24h.sent}`,
      `  24h Failed : ${data.channels.email.last24h.failed || 0}`,
      "",
      "SENDER IDs CONFIGURED",
      `  Default   : ${data.smsConfig.globalSenderId}`,
      `  Approved  : ${data.smsConfig.approvedSenderIds.join(", ") || "None in DB"}`,
      "",
      "DLT TEMPLATES CONFIGURED",
      `  ${data.smsConfig.templatesCoverage.configured} of ${data.smsConfig.templatesCoverage.total} events configured`,
      "",
      ...data.smsConfig.events.map(e =>
        `  [${e.templateConfigured ? "✓" : "✗"}] ${e.label.padEnd(34)} Sender: ${e.senderId.padEnd(8)} Template: ${e.templateId || "(not configured)"}`
      ),
      "",
      "NOTIFICATION DELIVERY STATS (ALL TIME)",
      `  ${"Event".padEnd(30)} ${"SMS Sent".padStart(8)} ${"SMS Fail".padStart(9)} ${"WA Sent".padStart(8)} ${"Email Sent".padStart(10)}`,
      "  " + "-".repeat(68),
      ...data.smsConfig.events.map(e =>
        `  ${e.label.slice(0, 29).padEnd(30)} ${String(e.sms?.totalSent ?? 0).padStart(8)} ${String(e.sms?.totalFailed ?? 0).padStart(9)} ${String(e.whatsapp?.totalSent ?? 0).padStart(8)} ${String(e.email?.totalSent ?? 0).padStart(10)}`
      ),
      "",
      "PRODUCTION POLICY CHECKS",
      `  Auto Quick-Route Fallback : ${data.policy.quickRouteAutomatic ? "YES (VIOLATION)" : "NO (correct — DLT rejection does not trigger fallback)"}`,
      `  Emergency Default         : ${data.policy.emergencyFallbackDefault}`,
      `  Emergency Status          : ${data.emergencyStatus.enabled ? "ACTIVE ⚠ — disable immediately after DLT recovery" : "OFF ✓"}`,
      ...(data.emergencyStatus.enabled ? [
        `  Emergency Reason          : ${data.emergencyStatus.reason}`,
        `  Enabled By                : ${data.emergencyStatus.enabledBy}`,
        `  Enabled At                : ${data.emergencyStatus.enabledAt}`,
        `  IP Address                : ${data.emergencyStatus.enabledIp}`,
      ] : []),
      "",
      "SYSTEM CHECKS",
      ...data.checks.map(c => `  [${c.pass ? "PASS" : "FAIL"}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`),
      "",
      hr,
      `  Overall Status    : ${data.productionReady ? "PASS" : "FAIL"}`,
      `  SMS Provider      : ${data.smsConfig.apiKeyConfigured ? "PASS" : "FAIL"}`,
      `  WhatsApp Provider : ${data.channels.whatsapp.enabled ? "PASS" : "FAIL"}`,
      `  Email Provider    : ${data.channels.email.enabled ? "PASS" : "FAIL"}`,
      `  Sender IDs        : ${data.smsConfig.approvedSenderIds.length} configured (default: ${data.smsConfig.globalSenderId})`,
      `  DLT Templates     : ${data.smsConfig.templatesCoverage.configured}/${data.smsConfig.templatesCoverage.total} events configured`,
      `  Production Ready  : ${data.productionReady ? "YES" : "NO"}`,
      hr,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-verification-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Production Notification Verification Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live check of SMS · WhatsApp · Email routing, DLT compliance, and delivery stats per event.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={!data} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors">
              <Download className="w-4 h-4" /> Export .txt
            </button>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Failed to load report: {error}</span>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {data && (
          <>
            {/* Score + status banner */}
            <div className={`rounded-xl border-2 p-5 flex flex-col sm:flex-row items-center gap-6 ${data.productionReady ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
              <ScoreRing score={data.summary.score} />
              <div className="flex-1 text-center sm:text-left">
                <h2 className={`text-lg font-bold ${data.productionReady ? "text-green-800" : "text-red-800"}`}>
                  {data.productionReady ? "✓ System is Production Ready" : "⚠ Issues Require Attention"}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {data.summary.passed} of {data.summary.total} checks passed
                  {data.summary.failed > 0 && ` — ${data.summary.failed} check${data.summary.failed > 1 ? "s" : ""} failed`}
                </p>
                <p className="text-xs text-gray-400 mt-2 flex items-center justify-center sm:justify-start gap-1">
                  <Clock className="w-3 h-3" />
                  Generated {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
                <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                  <Zap className="w-3 h-3" /> Route: DLT Only
                </span>
                <span className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                  <ShieldCheck className="w-3 h-3" /> No Auto Fallback
                </span>
                <span className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full ${data.emergencyStatus.enabled ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}>
                  <ShieldAlert className="w-3 h-3" />
                  Emergency: {data.emergencyStatus.enabled ? "ACTIVE ⚠" : "OFF"}
                </span>
              </div>
            </div>

            {/* Production Verification Summary — exact spec format */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Production Verification Summary</h3>
              </div>
              <div className="divide-y text-sm">
                {[
                  { label: "Overall Status", value: data.productionReady ? "PASS" : "FAIL", ok: data.productionReady },
                  { label: "SMS Provider Status", value: data.smsConfig.apiKeyConfigured ? `Active — Fast2SMS DLT (${data.smsConfig.globalSenderId})` : "NOT CONFIGURED", ok: data.smsConfig.apiKeyConfigured },
                  { label: "WhatsApp Provider Status", value: data.channels.whatsapp.enabled ? "Active — BotBee" : "Inactive", ok: data.channels.whatsapp.enabled },
                  { label: "Email Provider Status", value: data.channels.email.enabled ? "Active — SMTP" : "Inactive", ok: data.channels.email.enabled },
                  { label: "Sender IDs Configured", value: `${data.smsConfig.approvedSenderIds.length} approved  (ALBURH · ALBUR · ABURHA · ABTUMR · ABTTHJ)  Default: ${data.smsConfig.globalSenderId}`, ok: data.smsConfig.approvedSenderIds.length > 0 },
                  { label: "DLT Templates Configured", value: `${data.smsConfig.templatesCoverage.configured} / ${data.smsConfig.templatesCoverage.total} events`, ok: data.smsConfig.templatesCoverage.configured === data.smsConfig.templatesCoverage.total },
                  { label: "Emergency Fallback", value: data.emergencyStatus.enabled ? "ACTIVE — disable after DLT recovery" : "OFF (correct)", ok: !data.emergencyStatus.enabled },
                  { label: "Production Ready", value: data.productionReady ? "YES" : "NO", ok: data.productionReady },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3 px-4 py-3">
                    {row.ok
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                    <span className="w-52 text-gray-600 font-medium shrink-0">{row.label}</span>
                    <span className={row.ok ? "text-gray-800" : "text-red-700 font-semibold"}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Emergency Active Warning */}
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
                <p className="text-xs text-red-700">
                  Disable emergency mode in <strong>Admin → DLT Template Manager</strong> once DLT templates are approved.
                </p>
              </div>
            )}

            {/* System checks */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">System Policy Checks</h3>
              </div>
              {data.checks.map(c => <CheckRow key={c.id} check={c} />)}
            </div>

            {/* Notification channels */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Notification Channels
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ChannelCard
                  icon={Smartphone}
                  label="SMS — Fast2SMS DLT"
                  enabled={data.channels.sms.enabled}
                  detail={`Route: DLT only | Sender: ${data.smsConfig.globalSenderId}`}
                  stat={`24h: ${data.channels.sms.last24h.sent} sent, ${data.channels.sms.last24h.failed} failed${data.channels.sms.last24h.emergency > 0 ? `, ${data.channels.sms.last24h.emergency} emergency ⚠` : ""}`}
                />
                <ChannelCard
                  icon={MessageSquare}
                  label="WhatsApp — BotBee"
                  enabled={data.channels.whatsapp.enabled}
                  detail="Provider: BotBee API"
                  stat={`24h: ${data.channels.whatsapp.last24h.sent} sent`}
                />
                <ChannelCard
                  icon={Mail}
                  label="Email — SMTP"
                  enabled={data.channels.email.enabled}
                  detail="Provider: SMTP"
                  stat={`24h: ${data.channels.email.last24h.sent} sent`}
                />
              </div>
            </div>

            {/* DLT Template Coverage with per-event delivery stats */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700">DLT Template Coverage &amp; Delivery Stats</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.smsConfig.templatesCoverage.configured === data.smsConfig.templatesCoverage.total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {data.smsConfig.templatesCoverage.configured} / {data.smsConfig.templatesCoverage.total} configured
                  </span>
                  <button
                    onClick={() => setShowEventDetail(v => !v)}
                    className="text-xs text-blue-600 underline"
                  >
                    {showEventDetail ? "Compact" : "Show delivery stats"}
                  </button>
                </div>
              </div>

              {/* Compact view */}
              {!showEventDetail && (
                <div className="divide-y">
                  {data.smsConfig.events.map(ev => (
                    <div key={ev.event} className={`flex items-center gap-3 px-4 py-2.5 ${ev.templateConfigured ? "" : "bg-amber-50/40"}`}>
                      {ev.templateConfigured
                        ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                      <span className="flex-1 text-sm text-gray-700">{ev.label}</span>
                      <span className="text-[10px] font-mono text-gray-400 mr-1">sender: {ev.senderId}</span>
                      {ev.templateId
                        ? <code className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{ev.templateId}</code>
                        : <span className="text-xs text-amber-600 font-medium">Not Configured</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Detailed view with delivery stats */}
              {showEventDetail && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-2 text-left font-semibold">Event</th>
                        <th className="px-3 py-2 text-left font-semibold">Sender / Template</th>
                        <th className="px-2 py-2 text-center font-semibold">SMS<br/><span className="font-normal normal-case">Sent / Failed</span></th>
                        <th className="px-2 py-2 text-left font-semibold">SMS Last Sent</th>
                        <th className="px-2 py-2 text-left font-semibold">SMS Last Failed</th>
                        <th className="px-2 py-2 text-center font-semibold">WA<br/><span className="font-normal normal-case">Sent / Failed</span></th>
                        <th className="px-2 py-2 text-center font-semibold">Email<br/><span className="font-normal normal-case">Sent / Failed</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.smsConfig.events.map(ev => (
                        <tr key={ev.event} className={`${ev.templateConfigured ? "hover:bg-gray-50/50" : "bg-amber-50/30 hover:bg-amber-50/50"}`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {ev.templateConfigured
                                ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <span className="text-gray-800 font-medium">{ev.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-mono">
                              <span className="text-gray-500 mr-1">{ev.senderId}</span>
                              {ev.templateId
                                ? <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{ev.templateId}</span>
                                : <span className="text-amber-600">—</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <StatPill val={ev.sms?.totalSent ?? 0} color="text-green-600" />
                            {" / "}
                            <StatPill val={ev.sms?.totalFailed ?? 0} color="text-red-500" />
                          </td>
                          <td className="px-2 py-2.5 text-gray-500 whitespace-nowrap">{fmtTime(ev.sms?.lastSent)}</td>
                          <td className={`px-2 py-2.5 whitespace-nowrap ${ev.sms?.lastFailed ? "text-red-500" : "text-gray-300"}`}>{fmtTime(ev.sms?.lastFailed)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <StatPill val={ev.whatsapp?.totalSent ?? 0} color="text-green-600" />
                            {" / "}
                            <StatPill val={ev.whatsapp?.totalFailed ?? 0} color="text-red-500" />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <StatPill val={ev.email?.totalSent ?? 0} color="text-green-600" />
                            {" / "}
                            <StatPill val={ev.email?.totalFailed ?? 0} color="text-red-500" />
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
                <a key={l.href} href={l.href} className="text-xs text-blue-600 underline hover:text-blue-800 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100 transition-colors">
                  {l.label}
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
