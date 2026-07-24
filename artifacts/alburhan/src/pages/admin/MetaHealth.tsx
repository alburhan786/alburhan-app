import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

type TestResult = {
  id: string; name: string; category: string; endpoint: string;
  ok: boolean; skipped: boolean; skip_reason?: string;
  status_code?: number; duration_ms: number;
  raw_response?: any; error?: string; error_code?: number | string;
  error_subcode?: number; error_type?: string; data?: any; fix?: string;
};

type ReportData = {
  checkedAt: string; tests: TestResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
  fb_scopes: string[]; config_present: Record<string, boolean>;
};

type RepairEntry = {
  action: string; result: "fixed" | "failed" | "skipped" | "validated";
  detail: string; data?: any; ts: string;
};

type RepairData = {
  repairedAt: string; repairs: RepairEntry[];
  summary: { total: number; fixed: number; validated: number; failed: number; skipped: number };
};

type PlatformTest = {
  platform: string; ok: boolean; checkedAt: string; duration_ms: number;
  tests: { name: string; endpoint: string; ok: boolean; status: number; ms: number; data: any; error?: string }[];
  summary: { total: number; passed: number; failed: number };
  error?: string;
};

// ── Platform metadata ──────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "facebook",  icon: "📘", name: "Facebook Page",      color: "blue",  configKeys: ["fb_token", "fb_page_id"] },
  { id: "instagram", icon: "📸", name: "Instagram Business", color: "pink",  configKeys: ["fb_token"] },
  { id: "whatsapp",  icon: "💬", name: "WhatsApp Cloud API", color: "green", configKeys: ["wa_token", "wa_phone_id"] },
  { id: "messenger", icon: "💬", name: "Messenger",          color: "blue",  configKeys: ["fb_token"] },
  { id: "leads",     icon: "🎯", name: "Lead Ads",           color: "amber", configKeys: ["fb_token", "fb_page_id"] },
  { id: "webhooks",  icon: "🔗", name: "Webhooks",           color: "gray",  configKeys: ["webhook_verify_token"] },
] as const;

type PlatformId = typeof PLATFORMS[number]["id"];

const CATEGORIES = ["All", "OAuth", "Facebook", "Instagram", "WhatsApp", "Lead Ads", "Webhooks"] as const;

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Spin() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />;
}

function JsonBlock({ data, label }: { data: any; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(o => !o)} className="text-[10px] text-blue-500 hover:underline">
        {open ? "▲ Hide" : "▼ Show"} {label}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] font-mono bg-gray-950 text-green-300 rounded p-2 overflow-x-auto max-h-56 whitespace-pre-wrap break-all leading-4">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StatusDot({ ok, loading }: { ok?: boolean; loading?: boolean }) {
  if (loading) return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />;
  if (ok === undefined) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />;
  return <span className={`w-2 h-2 rounded-full inline-block ${ok ? "bg-green-500" : "bg-red-500"}`} />;
}

// ── Platform Card ─────────────────────────────────────────────────────────────

function PlatformCard({
  platform, testData, loading,
  onTest, configured,
}: {
  platform: typeof PLATFORMS[number];
  testData?: PlatformTest;
  loading: boolean;
  onTest: () => void;
  configured: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { icon, name, id } = platform;

  const ok = testData?.ok;
  const passed = testData?.summary.passed ?? 0;
  const failed = testData?.summary.failed ?? 0;
  const total = testData?.summary.total ?? 0;
  const ms = testData?.duration_ms;

  const borderCls = !configured ? "border-gray-200"
    : loading ? "border-amber-200"
    : ok === undefined ? "border-gray-200"
    : ok ? "border-green-200" : "border-red-200";

  const bgCls = !configured ? "bg-gray-50/50"
    : loading ? "bg-amber-50/30"
    : ok === undefined ? "bg-white"
    : ok ? "bg-green-50/30" : "bg-red-50/30";

  return (
    <div className={`border rounded-xl overflow-hidden ${borderCls} ${bgCls} transition-colors`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <StatusDot ok={testData ? ok : undefined} loading={loading} />
                <p className="text-xs font-semibold text-gray-900 truncate">{name}</p>
              </div>
              {!configured && <p className="text-[10px] text-gray-400 mt-0.5">Not configured</p>}
              {configured && !testData && !loading && <p className="text-[10px] text-gray-400 mt-0.5">Not tested yet</p>}
              {loading && <p className="text-[10px] text-amber-600 mt-0.5">Testing live…</p>}
              {testData && (
                <p className={`text-[10px] mt-0.5 ${ok ? "text-green-600" : "text-red-600"}`}>
                  {ok ? `✅ ${passed}/${total} passed` : `❌ ${failed} failed`}
                  {ms ? ` · ${ms}ms` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={onTest} disabled={loading || !configured}>
              {loading ? <Spin /> : "Test"}
            </Button>
            {testData && (
              <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-gray-400 hover:text-gray-700 px-1">
                {expanded ? "▲" : "▼"}
              </button>
            )}
          </div>
        </div>

        {/* Key data from the first successful test */}
        {testData && !expanded && (
          <div className="mt-2 space-y-0.5">
            {testData.tests.filter(t => t.ok && t.data && Object.keys(t.data || {}).length > 0).slice(0, 1).map((t, i) => (
              <div key={i} className="text-[10px] text-gray-600 truncate">
                {Object.entries(t.data || {}).filter(([, v]) => v !== null && !Array.isArray(v) && typeof v !== "object").slice(0, 3)
                  .map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
              </div>
            ))}
            {!ok && testData.tests.filter(t => !t.ok && t.error).slice(0, 1).map((t, i) => (
              <p key={i} className="text-[10px] text-red-600 line-clamp-2">{t.error}</p>
            ))}
          </div>
        )}
      </div>

      {/* Expanded sub-tests */}
      {expanded && testData && (
        <div className="border-t border-gray-100 bg-white px-3 pb-3 pt-2 space-y-2">
          {testData.tests.map((t, i) => (
            <div key={i} className={`rounded-lg p-2 text-xs border ${t.ok ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              <div className="flex items-start gap-2">
                <span>{t.ok ? "✅" : "❌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-[11px] leading-tight">{t.name}</p>
                  <p className="font-mono text-[9px] text-gray-500 truncate">{t.endpoint}</p>
                  {t.error && <p className="text-[10px] text-red-600 mt-0.5">{t.error}</p>}
                  {t.ok && t.data && (
                    <div className="mt-0.5 text-[10px] text-green-700">
                      {Object.entries(t.data).filter(([, v]) => v !== null && !Array.isArray(v) && typeof v !== "object").slice(0, 4)
                        .map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                    </div>
                  )}
                  {t.data && (Object.values(t.data).some(v => Array.isArray(v) || (typeof v === "object" && v !== null))) && (
                    <JsonBlock data={t.data} label="Details" />
                  )}
                </div>
                <div className="flex-shrink-0 text-[9px] text-gray-400">{t.status > 0 ? `HTTP ${t.status}` : ""} {t.ms}ms</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Auto-Repair Log ────────────────────────────────────────────────────────────

function RepairLog({ data, loading }: { data?: RepairData; loading: boolean }) {
  const [open, setOpen] = useState(true);
  if (!data && !loading) return null;

  const resultIcon = (r: string) => ({ fixed: "🔧", validated: "✅", failed: "❌", skipped: "⏭️" }[r] || "•");
  const resultColor = (r: string) => ({ fixed: "text-green-700 bg-green-50 border-green-200", validated: "text-blue-700 bg-blue-50 border-blue-200", failed: "text-red-700 bg-red-50 border-red-200", skipped: "text-gray-600 bg-gray-50 border-gray-200" }[r] || "text-gray-600");

  return (
    <div className="border rounded-xl overflow-hidden border-purple-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-purple-900">🔧 Auto-Repair Log</span>
          {loading && <Spin />}
          {data && (
            <div className="flex gap-1.5 text-[10px]">
              {data.summary.fixed > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{data.summary.fixed} fixed</span>}
              {data.summary.validated > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{data.summary.validated} validated</span>}
              {data.summary.failed > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{data.summary.failed} failed</span>}
              {data.summary.skipped > 0 && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{data.summary.skipped} skipped</span>}
            </div>
          )}
        </div>
        <span className="text-purple-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && data && (
        <div className="divide-y divide-gray-50">
          {data.repairs.map((r, i) => (
            <div key={i} className="px-4 py-2.5 hover:bg-gray-50">
              <div className="flex items-start gap-2">
                <span className="text-base flex-shrink-0 mt-0.5">{resultIcon(r.result)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-gray-900">{r.action}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${resultColor(r.result)}`}>
                      {r.result.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{r.detail}</p>
                  {r.data && <JsonBlock data={r.data} label="Details" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Full test row (from /health) ───────────────────────────────────────────────

function TestRow({ t }: { t: TestResult }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg overflow-hidden mb-1.5 ${t.skipped ? "border-gray-100" : t.ok ? "border-green-100" : "border-red-200"}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full text-left px-3 py-2 flex items-start gap-2.5 hover:brightness-95 transition-all ${t.skipped ? "bg-gray-50" : t.ok ? "bg-green-50/30" : "bg-red-50/30"}`}
      >
        <span className="text-base leading-tight flex-shrink-0">{t.skipped ? "⏭️" : t.ok ? "✅" : "❌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">{t.name}</span>
            {t.status_code && (
              <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${t.status_code >= 200 && t.status_code < 300 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {t.status_code}
              </span>
            )}
            {t.duration_ms > 0 && <span className="text-[9px] text-gray-400">{t.duration_ms}ms</span>}
          </div>
          <p className="text-[9px] font-mono text-gray-400 mt-0.5 truncate">{t.endpoint}</p>
          {t.skipped && <p className="text-[10px] text-gray-400 mt-0.5">⏭ {t.skip_reason}</p>}
          {!t.ok && !t.skipped && t.error && <p className="text-[10px] text-red-600 mt-0.5 line-clamp-1">{t.error}</p>}
          {t.ok && t.data && (
            <p className="text-[10px] text-green-700 mt-0.5 truncate">
              {Object.entries(t.data).filter(([, v]) => v !== null && !Array.isArray(v) && typeof v !== "object").slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
        </div>
        <span className="text-[9px] text-gray-400 flex-shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 bg-white border-t border-gray-100 space-y-2">
          {!t.ok && !t.skipped && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <p className="text-[11px] font-semibold text-red-800 mb-1">Error Details</p>
              <div className="text-[11px] text-red-700 space-y-0.5">
                {t.error && <div><span className="font-medium">Message:</span> {t.error}</div>}
                {t.error_type && <div><span className="font-medium">Type:</span> {t.error_type}</div>}
                {t.error_code && <div><span className="font-medium">Code:</span> {t.error_code}</div>}
              </div>
              {t.fix && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-2">
                  <p className="text-[10px] font-semibold text-blue-700">💡 Suggested Fix</p>
                  <p className="text-[11px] text-blue-800 mt-0.5">{t.fix}</p>
                </div>
              )}
            </div>
          )}
          {t.data && <JsonBlock data={t.data} label="Extracted Data" />}
          {t.raw_response && <JsonBlock data={t.raw_response} label="Raw API Response" />}
        </div>
      )}
    </div>
  );
}

// ── Final Report ──────────────────────────────────────────────────────────────

function FinalReport({ healthData, repairData }: { healthData?: ReportData; repairData?: RepairData }) {
  if (!healthData && !repairData) return null;
  const passed = healthData?.tests.filter(t => t.ok) ?? [];
  const failed = healthData?.tests.filter(t => !t.ok && !t.skipped) ?? [];
  const manual = failed.filter(t => t.fix);
  const autoFixed = repairData?.repairs.filter(r => r.result === "fixed") ?? [];

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-800 px-4 py-3">
        <p className="text-sm font-bold text-white">📊 Final Report</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {healthData?.checkedAt && `Checked: ${new Date(healthData.checkedAt).toLocaleString("en-IN")}`}
          {repairData?.repairedAt && ` · Repaired: ${new Date(repairData.repairedAt).toLocaleString("en-IN")}`}
        </p>
      </div>
      <div className="divide-y divide-gray-100 bg-white">
        {/* Passed */}
        {passed.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-green-700 mb-2">✅ Passed ({passed.length})</p>
            <div className="space-y-1">
              {passed.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-green-700 bg-green-50 rounded px-2 py-1">
                  <span className="flex-shrink-0">✓</span>
                  <span>{t.name}</span>
                  {t.data && Object.keys(t.data).length > 0 && (
                    <span className="text-green-600 ml-auto flex-shrink-0">
                      {Object.entries(t.data).filter(([, v]) => typeof v !== "object" && v !== null).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(", ")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Auto-fixed */}
        {autoFixed.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-purple-700 mb-2">🔧 Automatic Fix Applied ({autoFixed.length})</p>
            <div className="space-y-1">
              {autoFixed.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-purple-700 bg-purple-50 rounded px-2 py-1">
                  <span className="flex-shrink-0">🔧</span>
                  <div>
                    <span className="font-medium">{r.action}</span>
                    <span className="text-purple-600"> — {r.detail.slice(0, 100)}{r.detail.length > 100 ? "…" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Failed + Manual action */}
        {failed.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-red-700 mb-2">✗ Failed ({failed.length})</p>
            <div className="space-y-1.5">
              {failed.map((t, i) => (
                <div key={i} className="rounded px-2 py-1.5 border bg-red-50 border-red-100">
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-red-500 flex-shrink-0">✗</span>
                    <div>
                      <span className="font-medium text-red-800">{t.name}</span>
                      {t.error && <span className="text-red-600"> — {t.error}</span>}
                    </div>
                  </div>
                  {t.fix && (
                    <div className="ml-4 mt-1 text-[10px] text-amber-800 bg-amber-50 rounded px-1.5 py-1 border border-amber-200">
                      ⚠️ <strong>Manual Action:</strong> {t.fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Manual actions summary */}
        {manual.length > 0 && (
          <div className="px-4 py-3 bg-amber-50">
            <p className="text-xs font-semibold text-amber-800 mb-2">⚠️ Manual Action Required ({manual.length} items)</p>
            <ol className="space-y-1">
              {manual.map((t, i) => (
                <li key={i} className="text-[11px] text-amber-900">
                  <span className="font-medium">{i + 1}. {t.name}:</span> {t.fix}
                </li>
              ))}
            </ol>
          </div>
        )}
        {passed.length > 0 && failed.length === 0 && autoFixed.length === 0 && (
          <div className="px-4 py-3 bg-green-50">
            <p className="text-sm font-semibold text-green-700">🎉 All tests passed — Meta integration is fully operational.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WhatsApp test message panel ───────────────────────────────────────────────

function WATestPanel({ configured }: { configured: boolean }) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const send = async () => {
    if (!to.trim()) return;
    setSending(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/social-media/meta/test-message`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const d = await r.json();
      setResult(d);
      if (d.ok) toast({ title: "✅ Test message sent", description: `WA Message ID: ${d.message_id}` });
      else toast({ title: "Send failed", description: d.error, variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  return (
    <div className={`border rounded-xl p-4 ${configured ? "bg-white border-green-200" : "bg-gray-50 border-gray-200"}`}>
      <p className="text-sm font-semibold text-gray-800 mb-1">📤 WhatsApp — Send Live Test Message</p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Sends a real text message via Meta Cloud API. Verify: <strong>Sent → Delivered → Read → Webhook callback.</strong>
        {!configured && " (Configure WhatsApp Meta platform first.)"}
      </p>
      <div className="flex gap-2">
        <input
          type="text" className="flex-1 border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-400 bg-white disabled:bg-gray-100"
          placeholder="919876543210  (country code, no + or spaces)" value={to}
          onChange={e => setTo(e.target.value)} disabled={!configured || sending}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <Button size="sm" onClick={send} disabled={!configured || sending || !to.trim()} className="bg-green-600 hover:bg-green-700">
          {sending ? <Spin /> : "Send"}
        </Button>
      </div>
      {result && (
        <div className={`mt-2.5 rounded-lg p-2.5 text-xs border ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {result.ok ? (
            <>
              <p className="font-semibold text-green-700">✅ Sent via Meta Cloud API</p>
              <p className="text-green-700 mt-0.5">Message ID: <code className="font-mono text-xs">{result.message_id}</code></p>
              <p className="text-green-600">Status: {result.status} · {result.duration_ms}ms</p>
              <p className="text-[10px] text-gray-500 mt-1">Check your WhatsApp webhook logs to verify the delivery and read receipt callbacks arrive.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-red-700">❌ Send failed</p>
              <p className="text-red-700">{result.error}</p>
              {result.error_code && <p className="text-red-600">Code: {result.error_code} ({result.error_type})</p>}
              <JsonBlock data={result.raw} label="Raw response" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subscribe webhooks panel ───────────────────────────────────────────────────

function SubscribePanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const subscribe = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/subscribe-webhooks`, { method: "POST", credentials: "include" });
      const d = await r.json();
      setResult(d);
      if (d.ok) { toast({ title: "Webhooks subscribed", description: d.message }); onDone(); }
      else toast({ title: "Subscription failed", description: d.message, variant: "destructive" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="border rounded-xl p-4 bg-white border-blue-200">
      <p className="text-sm font-semibold text-gray-800 mb-1">📡 Subscribe All Webhook Fields</p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Subscribes your Facebook Page to 11 fields: messages, messaging_postbacks, message_deliveries, message_reads,
        messaging_optins, messaging_referrals, leadgen, feed, mention, instagram_manage_messages, instagram_manage_comments.
      </p>
      <Button size="sm" variant="outline" onClick={subscribe} disabled={loading}>
        {loading ? <><Spin /> Subscribing…</> : "📡 Subscribe All Webhook Fields"}
      </Button>
      {result && (
        <div className={`mt-2 rounded-lg p-2 text-xs border ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <p className={result.ok ? "text-green-700" : "text-red-700"}>{result.message}</p>
          {result.fields && <p className="text-[10px] text-gray-600 mt-0.5">{result.fields.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

// ── Permissions checklist ─────────────────────────────────────────────────────

const PERM_GROUPS = [
  { label: "📘 Facebook", perms: ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_read_user_content", "pages_messaging"] },
  { label: "🎯 Lead Ads", perms: ["leads_retrieval", "pages_manage_ads"] },
  { label: "📸 Instagram", perms: ["instagram_basic", "instagram_manage_messages", "instagram_manage_comments"] },
  { label: "💬 WhatsApp", perms: ["whatsapp_business_messaging", "whatsapp_business_management"] },
];

function PermissionsChecklist({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) return null;
  return (
    <div className="border rounded-xl p-4 bg-white">
      <p className="text-xs font-semibold text-gray-800 mb-3">📋 Token Permissions — Granted vs Required</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PERM_GROUPS.map(({ label, perms }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold text-gray-700 mb-1">{label}</p>
            {perms.map(p => {
              const granted = scopes.includes(p);
              return (
                <div key={p} className="flex items-center gap-1.5 text-[11px] py-0.5">
                  <span className={granted ? "text-green-600" : "text-red-500"}>{granted ? "✅" : "❌"}</span>
                  <code className={granted ? "text-gray-700" : "text-red-600"}>{p}</code>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MetaHealth() {
  const { can } = usePermissions();
  const { toast } = useToast();

  const [healthData, setHealthData] = useState<ReportData | null>(null);
  const [repairData, setRepairData] = useState<RepairData | null>(null);
  const [platformTests, setPlatformTests] = useState<Partial<Record<PlatformId, PlatformTest>>>({});
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingRepair, setLoadingRepair] = useState(false);
  const [loadingPlatform, setLoadingPlatform] = useState<Partial<Record<PlatformId, boolean>>>({});
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const runningRef = useRef(false);

  // ── Full health check ────────────────────────────────────────────────────────
  const runHealth = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoadingHealth(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/health`, { credentials: "include" });
      const d = await r.json();
      setHealthData(d);
    } catch (e: any) { toast({ title: "Health check failed", description: e.message, variant: "destructive" }); }
    finally { setLoadingHealth(false); runningRef.current = false; }
  }, [toast]);

  // ── Auto-repair ──────────────────────────────────────────────────────────────
  const runRepair = useCallback(async () => {
    setLoadingRepair(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/auto-repair`, { method: "POST", credentials: "include" });
      const d = await r.json();
      setRepairData(d);
      if (d.summary.fixed > 0) {
        toast({ title: `🔧 ${d.summary.fixed} repair${d.summary.fixed !== 1 ? "s" : ""} applied`, description: "Running health check to verify…" });
        setTimeout(() => runHealth(), 500);
      } else {
        toast({ title: "Repair complete", description: d.summary.failed > 0 ? `${d.summary.failed} failed — check log` : "No automatic fixes needed" });
      }
    } catch (e: any) { toast({ title: "Repair failed", description: e.message, variant: "destructive" }); }
    finally { setLoadingRepair(false); }
  }, [toast, runHealth]);

  // ── Per-platform test ────────────────────────────────────────────────────────
  const testPlatform = useCallback(async (platformId: PlatformId) => {
    setLoadingPlatform(p => ({ ...p, [platformId]: true }));
    try {
      const r = await fetch(`${API}/api/social-media/meta/platform/${platformId}`, { credentials: "include" });
      const d = await r.json();
      setPlatformTests(p => ({ ...p, [platformId]: d }));
    } catch (e: any) { toast({ title: `${platformId} test failed`, description: e.message, variant: "destructive" }); }
    finally { setLoadingPlatform(p => ({ ...p, [platformId]: false })); }
  }, [toast]);

  // ── Test all platforms in parallel ───────────────────────────────────────────
  const testAll = useCallback(async () => {
    setLoadingHealth(true);
    // Run health check + all platform tests in parallel
    await Promise.all([
      fetch(`${API}/api/social-media/meta/health`, { credentials: "include" })
        .then(r => r.json()).then(d => setHealthData(d)).catch(() => {}),
      ...PLATFORMS.map(p =>
        fetch(`${API}/api/social-media/meta/platform/${p.id}`, { credentials: "include" })
          .then(r => r.json())
          .then(d => setPlatformTests(prev => ({ ...prev, [p.id]: d })))
          .catch(() => {})
      ),
    ]);
    setLoadingHealth(false);
  }, []);

  useEffect(() => { runHealth(); }, [runHealth]);

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  const cfg = healthData?.config_present ?? {};
  const tests = healthData?.tests ?? [];
  const CATS = ["All", "OAuth", "Facebook", "Instagram", "WhatsApp", "Lead Ads", "Webhooks"];
  const filteredTests = activeCategory === "All" ? tests : tests.filter(t => t.category === activeCategory);

  const catBadge = (cat: string) => {
    const inCat = tests.filter(t => t.category === cat);
    const fail = inCat.filter(t => !t.ok && !t.skipped).length;
    return fail > 0 ? <span className="ml-1 text-red-400">❌{fail}</span> : null;
  };

  const summary = healthData?.summary;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* ── Header + action toolbar ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔷 Meta API Health & Auto-Repair</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Live Graph API tests · automatic repairs · per-platform drill-down · final report
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={testAll} disabled={loadingHealth}>
              {loadingHealth ? <><Spin /> Testing…</> : "▶ Test All"}
            </Button>
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" onClick={runRepair} disabled={loadingRepair}>
              {loadingRepair ? <><Spin /> Repairing…</> : "🔧 Repair All"}
            </Button>
            {healthData?.checkedAt && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-2.5 py-1.5 rounded-lg self-center">
                {new Date(healthData.checkedAt).toLocaleTimeString("en-IN")}
              </span>
            )}
          </div>
        </div>

        {/* ── Summary bar ── */}
        {summary && (
          <div className="grid grid-cols-4 gap-2.5">
            {[
              { label: "Total Tests", val: summary.total, cls: "bg-gray-50 border-gray-200 text-gray-700" },
              { label: "✅ Passed", val: summary.passed, cls: "bg-green-50 border-green-200 text-green-700" },
              { label: "❌ Failed", val: summary.failed, cls: "bg-red-50 border-red-200 text-red-700" },
              { label: "🔧 Auto-Fixed", val: repairData?.summary.fixed ?? 0, cls: "bg-purple-50 border-purple-200 text-purple-700" },
            ].map(({ label, val, cls }) => (
              <div key={label} className={`border rounded-xl p-3 text-center ${cls}`}>
                <p className="text-xl font-bold">{val}</p>
                <p className="text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Config presence strip ── */}
        {Object.keys(cfg).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(cfg).map(([k, v]) => (
              <span key={k} className={`text-[9px] px-2 py-0.5 rounded-full border font-mono ${v ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-400"}`}>
                {v ? "✓" : "○"} {k}
              </span>
            ))}
          </div>
        )}

        {/* ── Platform cards grid ── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-700">Platform Live Tests</p>
            <p className="text-[10px] text-muted-foreground">Click "Test" on any card for a deep per-platform drill-down</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORMS.map(p => {
              const configured = p.configKeys.some(k => cfg[k]);
              return (
                <PlatformCard
                  key={p.id}
                  platform={p}
                  testData={platformTests[p.id]}
                  loading={!!loadingPlatform[p.id]}
                  onTest={() => testPlatform(p.id)}
                  configured={configured}
                />
              );
            })}
          </div>
        </div>

        {/* ── Auto-Repair Log ── */}
        <RepairLog data={repairData ?? undefined} loading={loadingRepair} />

        {/* ── WhatsApp + Subscribe panels ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WATestPanel configured={!!(cfg.wa_token && cfg.wa_phone_id)} />
          <SubscribePanel onDone={() => setTimeout(runHealth, 800)} />
        </div>

        {/* ── Detailed test table (from /health) ── */}
        {tests.length > 0 && (
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-gray-700">Full Test Results ({tests.length})</p>
              <div className="flex gap-1 flex-wrap ml-auto">
                {CATS.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all border ${activeCategory === cat ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                  >
                    {cat}{catBadge(cat)}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 space-y-1">
              {filteredTests.map(t => <TestRow key={t.id} t={t} />)}
            </div>
          </div>
        )}

        {/* ── Permissions checklist ── */}
        {(healthData?.fb_scopes?.length ?? 0) > 0 && (
          <PermissionsChecklist scopes={healthData!.fb_scopes} />
        )}

        {/* ── Final Report ── */}
        <FinalReport healthData={healthData ?? undefined} repairData={repairData ?? undefined} />

        {/* ── Setup guide ── */}
        <details className="border rounded-xl overflow-hidden">
          <summary className="px-4 py-3 bg-blue-50 text-sm font-semibold text-blue-900 cursor-pointer select-none border-blue-200">
            🛠️ Setup Guide — How to fix common issues
          </summary>
          <div className="px-4 py-3 bg-blue-50/50 border-t border-blue-100 space-y-2 text-xs text-blue-900">
            {[
              ["OAuthException code 190 — Invalid or expired token",
                "Meta Business Suite → Settings → Advanced → Page Access Token. Click 'Generate Token' for your Page. Copy and save it in Facebook Page platform settings. Page Access Tokens are permanent unless revoked."],
              ["Permission denied (code 10 / 200 / 230)",
                "Add the required permission in Meta App Dashboard → App Review → Permissions. After adding, click 'Generate New Token' in Graph API Explorer to include the new scope."],
              ["Instagram Account ID wrong (code 100 / 803)",
                "Run the 'Instagram — Discover Account ID' test (or Repair All). The correct numeric ID is shown under 'linked_ig_id'. Copy it and save in Instagram platform settings."],
              ["Webhook challenge returns 403",
                "The verify token in Meta App → Webhooks must exactly match the value in your Facebook Page settings here. Both must be the same short secret string (e.g. 'alburhan_verify_2026')."],
              ["WhatsApp — phone number not found (code 100 / 803)",
                "Open Meta Business Manager → WhatsApp Manager → Phone Numbers. Copy the numeric Phone Number ID (not the phone number). Save it in WhatsApp Meta settings."],
              ["No webhook events in DB",
                "(1) Register webhook URL https://alburhantravels.com/api/social-media/webhook/meta in Meta App → Products → Messenger → Webhooks. (2) Click Subscribe All Webhook Fields. (3) Send a test message to your Page from another account."],
              ["WhatsApp test message fails — 'Not a valid phone number'",
                "Phone number must include the country code with no + or spaces. For India: 919876543210 (91 + 10-digit number). Only numbers that have WhatsApp installed can receive text messages; for others, use a template."],
            ].map(([title, body]) => (
              <div key={title} className="bg-white/80 rounded-lg p-2.5">
                <p className="font-semibold text-blue-800">{title}</p>
                <p className="mt-0.5 text-blue-700">{body}</p>
              </div>
            ))}
          </div>
        </details>

      </div>
    </AdminLayout>
  );
}
