import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

const WEBHOOK_URL = "https://alburhantravels.com/api/social-media/webhook/meta";

const CATEGORIES = ["All", "OAuth", "Facebook", "Instagram", "WhatsApp", "Lead Ads", "Webhooks"] as const;
type Category = (typeof CATEGORIES)[number];

type TestResult = {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  ok: boolean;
  skipped: boolean;
  skip_reason?: string;
  status_code?: number;
  duration_ms: number;
  raw_response?: any;
  error?: string;
  error_code?: number | string;
  error_subcode?: number;
  error_type?: string;
  data?: any;
  fix?: string;
};

type ReportData = {
  checkedAt: string;
  tests: TestResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
  fb_scopes: string[];
  config_present: Record<string, boolean>;
};

// ── Utility components ────────────────────────────────────────────────────────

function StatusIcon({ t }: { t: TestResult }) {
  if (t.skipped) return <span className="text-lg leading-none">⏭️</span>;
  if (t.ok) return <span className="text-lg leading-none">✅</span>;
  return <span className="text-lg leading-none">❌</span>;
}

function StatusCodeBadge({ code }: { code?: number }) {
  if (!code) return null;
  const color = code >= 200 && code < 300 ? "bg-green-100 text-green-700" : code >= 400 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600";
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${color}`}>{code}</span>;
}

function DurationBadge({ ms }: { ms: number }) {
  if (!ms) return null;
  const color = ms > 3000 ? "text-amber-600" : "text-gray-400";
  return <span className={`text-[10px] ${color}`}>{ms}ms</span>;
}

function JsonBlock({ data, label }: { data: any; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(o => !o)} className="text-[10px] text-blue-600 hover:underline">
        {open ? "▲ Hide" : "▼ Show"} {label}
      </button>
      {open && (
        <pre className="mt-1 text-[10px] font-mono bg-gray-950 text-green-300 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TestRow({ t }: { t: TestResult }) {
  const [expanded, setExpanded] = useState(false);
  const rowBg = t.skipped ? "bg-gray-50" : t.ok ? "bg-green-50/30" : "bg-red-50/30";
  const borderColor = t.skipped ? "border-gray-100" : t.ok ? "border-green-100" : "border-red-200";

  return (
    <div className={`border rounded-lg overflow-hidden ${borderColor} mb-2`}>
      <button
        className={`w-full text-left px-3 py-2.5 ${rowBg} flex items-start gap-3 hover:brightness-95 transition-all`}
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon t={t} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${t.skipped ? "text-gray-500" : t.ok ? "text-gray-800" : "text-gray-900"}`}>
              {t.name}
            </span>
            <StatusCodeBadge code={t.status_code} />
            <DurationBadge ms={t.duration_ms} />
          </div>
          <p className="text-[10px] font-mono text-gray-500 mt-0.5 truncate">{t.endpoint}</p>
          {t.skipped && <p className="text-[10px] text-gray-400 mt-0.5">⏭ Skipped: {t.skip_reason}</p>}
          {!t.ok && !t.skipped && t.error && (
            <p className="text-[10px] text-red-600 mt-0.5 font-medium line-clamp-2">{t.error}</p>
          )}
          {t.ok && t.data && Object.keys(t.data).length > 0 && (
            <p className="text-[10px] text-green-700 mt-0.5">
              {Object.entries(t.data).filter(([, v]) => v !== null && v !== undefined && !Array.isArray(v) && typeof v !== "object").slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100 space-y-3">
          {/* Error details */}
          {!t.ok && !t.skipped && (
            <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-800">Error Details</p>
              <div className="text-xs text-red-700 space-y-1">
                <div><span className="text-red-500 font-medium">Message:</span> {t.error || "Unknown"}</div>
                {t.error_type && <div><span className="text-red-500 font-medium">Type:</span> {t.error_type}</div>}
                {t.error_code && <div><span className="text-red-500 font-medium">Code:</span> {t.error_code}</div>}
                {t.error_subcode && <div><span className="text-red-500 font-medium">Subcode:</span> {t.error_subcode}</div>}
              </div>
              {t.fix && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-2">
                  <p className="text-[10px] font-semibold text-blue-700 mb-0.5">💡 Suggested Fix</p>
                  <p className="text-xs text-blue-800">{t.fix}</p>
                </div>
              )}
            </div>
          )}

          {/* Extracted data */}
          {t.data && Object.keys(t.data).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-600 mb-1">Extracted Data</p>
              <div className="bg-gray-50 rounded p-2 space-y-0.5">
                {Object.entries(t.data).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 text-xs py-0.5">
                    <span className="text-gray-500 min-w-[140px] flex-shrink-0 font-mono text-[10px]">{k}</span>
                    <span className="text-gray-800 break-all">
                      {Array.isArray(v) ? (
                        <pre className="text-[10px] font-mono whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                      ) : typeof v === "object" && v !== null ? (
                        <pre className="text-[10px] font-mono whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                      ) : String(v ?? "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw API Response */}
          <JsonBlock data={t.raw_response} label="Raw API Response" />

          {/* Fix for passed tests (edge cases) */}
          {t.ok && t.fix && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <p className="text-[10px] font-semibold text-amber-700 mb-0.5">⚠️ Note</p>
              <p className="text-xs text-amber-800">{t.fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Permissions checklist ─────────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  { platform: "📘 Facebook Page", perms: ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_read_user_content", "pages_messaging"] },
  { platform: "🎯 Lead Ads", perms: ["leads_retrieval", "pages_manage_ads"] },
  { platform: "📸 Instagram", perms: ["instagram_basic", "instagram_manage_messages", "instagram_manage_comments"] },
  { platform: "💬 WhatsApp Cloud", perms: ["whatsapp_business_messaging", "whatsapp_business_management"] },
];

function PermissionsChecklist({ scopes }: { scopes: string[] }) {
  return (
    <div className="border rounded-xl p-4 bg-white">
      <p className="text-sm font-semibold text-gray-800 mb-3">📋 Token Permissions Checklist</p>
      {scopes.length === 0 && (
        <p className="text-xs text-muted-foreground">Run the health check with App ID + Secret configured to see which permissions are granted.</p>
      )}
      {scopes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PERMISSION_GROUPS.map(({ platform: plt, perms }) => (
            <div key={plt}>
              <p className="text-xs font-semibold text-gray-700 mb-1">{plt}</p>
              <div className="space-y-0.5">
                {perms.map(p => {
                  const granted = scopes.includes(p);
                  return (
                    <div key={p} className="flex items-center gap-1.5 text-xs">
                      <span className={granted ? "text-green-600" : "text-red-400"}>{granted ? "✅" : "❌"}</span>
                      <code className={`${granted ? "text-gray-700" : "text-red-600"}`}>{p}</code>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Send Test Message panel ───────────────────────────────────────────────────
function TestMessagePanel({ waConfigured }: { waConfigured: boolean }) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const send = async () => {
    if (!to.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/api/social-media/meta/test-message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const d = await r.json();
      setResult(d);
      if (d.ok) toast({ title: "Test message sent!", description: `Message ID: ${d.message_id}` });
      else toast({ title: "Send failed", description: d.error, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`border rounded-xl p-4 ${waConfigured ? "bg-white" : "bg-gray-50"}`}>
      <p className="text-sm font-semibold text-gray-800 mb-1">📤 Send WhatsApp Test Message</p>
      <p className="text-xs text-muted-foreground mb-3">
        Sends a real message via Meta Cloud API to verify the WhatsApp send pipeline end-to-end.
        {!waConfigured && " (WhatsApp not configured — set up the WhatsApp Meta platform first.)"}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          placeholder="919876543210  (country code + number, no +)"
          value={to}
          onChange={e => setTo(e.target.value)}
          disabled={!waConfigured || sending}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <Button size="sm" onClick={send} disabled={!waConfigured || sending || !to.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      {result && (
        <div className={`mt-3 rounded-lg p-3 text-xs border ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {result.ok ? (
            <>
              <p className="font-semibold text-green-700">✅ Sent successfully</p>
              <p className="text-green-700">Message ID: <code className="font-mono">{result.message_id}</code></p>
              <p className="text-green-600">Status: {result.status} · {result.duration_ms}ms</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-red-700">❌ Send failed</p>
              <p className="text-red-700">{result.error}</p>
              {result.error_code && <p className="text-red-600">Code: {result.error_code} ({result.error_type})</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subscribe webhooks button ─────────────────────────────────────────────────
function SubscribeWebhooksPanel({ onDone }: { onDone: () => void }) {
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
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-xl p-4 bg-white">
      <p className="text-sm font-semibold text-gray-800 mb-1">📡 Subscribe Webhook Fields</p>
      <p className="text-xs text-muted-foreground mb-3">
        Subscribes your Facebook Page to all 11 required webhook fields (messages, messaging_postbacks, message_deliveries,
        message_reads, messaging_optins, messaging_referrals, leadgen, feed, mention, instagram_manage_messages,
        instagram_manage_comments). Required for real-time event delivery.
      </p>
      <p className="text-[10px] font-mono text-gray-500 mb-3">
        Webhook URL: {WEBHOOK_URL}
      </p>
      <Button size="sm" variant="outline" onClick={subscribe} disabled={loading}>
        {loading ? "Subscribing…" : "📡 Subscribe All Webhook Fields"}
      </Button>
      {result && (
        <div className={`mt-3 rounded-lg p-3 text-xs border ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <p className={`font-semibold ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.message}</p>
          {result.fields && <p className="text-gray-600 mt-1">Fields: {result.fields.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MetaHealth() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category>("All");
  const runningRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/health`, { credentials: "include" });
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      toast({ title: "Health check failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [toast]);

  useEffect(() => { runCheck(); }, [runCheck]);

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  const tests = data?.tests ?? [];
  const filtered = category === "All" ? tests : tests.filter(t => t.category === category);
  const { summary, fb_scopes = [], config_present = {} } = data ?? {};

  const categoryCount = (cat: string) => {
    const inCat = tests.filter(t => t.category === cat);
    const fail = inCat.filter(t => !t.ok && !t.skipped).length;
    const pass = inCat.filter(t => t.ok).length;
    return { fail, pass, total: inCat.length };
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔷 Meta API Live Test Suite</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every test makes a real Graph API call and reports exact status, raw response, error code and fix.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data?.checkedAt && (
              <span className="text-xs text-muted-foreground bg-gray-100 px-3 py-1.5 rounded-lg">
                {new Date(data.checkedAt).toLocaleTimeString("en-IN")}
              </span>
            )}
            <Button onClick={runCheck} disabled={loading} size="sm">
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  Running {tests.length} tests…
                </span>
              ) : "▶ Run All Tests"}
            </Button>
          </div>
        </div>

        {/* ── Summary bar ── */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total", val: summary.total, cls: "bg-gray-50 border-gray-200 text-gray-700" },
              { label: "✅ Passed", val: summary.passed, cls: "bg-green-50 border-green-200 text-green-700" },
              { label: "❌ Failed", val: summary.failed, cls: "bg-red-50 border-red-200 text-red-700" },
              { label: "⏭️ Skipped", val: summary.skipped, cls: "bg-gray-50 border-gray-200 text-gray-500" },
            ].map(({ label, val, cls }) => (
              <div key={label} className={`border rounded-xl p-3 text-center ${cls}`}>
                <p className="text-xl font-bold">{val}</p>
                <p className="text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Config present strip ── */}
        {config_present && Object.keys(config_present).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(config_present).map(([k, v]) => (
              <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${v ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
                {v ? "✓" : "○"} {k}
              </span>
            ))}
          </div>
        )}

        {/* ── Category tabs ── */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(cat => {
            const { fail, pass, total } = cat === "All"
              ? { fail: summary?.failed ?? 0, pass: summary?.passed ?? 0, total: summary?.total ?? 0 }
              : categoryCount(cat);
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              >
                {cat}
                {total > 0 && (
                  <span className="ml-1.5">
                    {fail > 0 ? <span className="text-red-400">❌{fail}</span> : pass > 0 ? <span className={active ? "text-green-400" : "text-green-600"}>✅{pass}</span> : null}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Loading skeleton ── */}
        {loading && tests.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-3 bg-gray-50 animate-pulse flex items-center gap-3">
                <div className="w-5 h-5 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Test results table ── */}
        {filtered.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">
                {filtered.length} test{filtered.length !== 1 ? "s" : ""} · click any row to expand raw response + fix
              </p>
              {loading && <span className="text-[10px] text-muted-foreground animate-pulse">● Checking…</span>}
            </div>
            {filtered.map(t => <TestRow key={t.id} t={t} />)}
          </div>
        )}

        {/* ── Permissions checklist ── */}
        <PermissionsChecklist scopes={fb_scopes} />

        {/* ── Actions: Test message + Subscribe webhooks ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TestMessagePanel waConfigured={!!config_present.wa_token && !!config_present.wa_phone_id} />
          <SubscribeWebhooksPanel onDone={() => setTimeout(runCheck, 800)} />
        </div>

        {/* ── Setup guide ── */}
        <div className="border rounded-xl p-4 bg-blue-50 border-blue-200">
          <p className="text-sm font-semibold text-blue-900 mb-2">🛠️ How to fix the most common errors</p>
          <div className="space-y-2 text-xs text-blue-800">
            {[
              ["OAuthException / code 190 — Invalid OAuth access token",
                "Your Page Access Token has expired or been revoked. Open Meta Business Suite → Settings → Advanced → Page Access Token Generator. Click 'Generate Token' next to your Page. Copy the full token and save it in the Facebook Page platform settings here."],
              ["code 10 / 200 — Permission denied",
                "The token lacks a required permission. In your Meta App → App Review → Permissions, add the missing permission (e.g. pages_messaging, instagram_manage_messages, leads_retrieval). Then click 'Generate New Token' to re-generate a token that includes the permission."],
              ["Instagram Account ID wrong (code 100)",
                "The Instagram Account ID must be the numeric ID of your linked Instagram Business Account, not a username. Look at the 'Discover Account ID from Facebook Page' test above — it shows the correct ID. Copy it and save it in your Instagram platform settings."],
              ["Webhook challenge returns 403",
                "The verify token in your Meta App → Webhooks does not match the one saved in the Facebook Page settings here. They must be identical strings. Update the Meta App webhook verify token to match."],
              ["WhatsApp — no phone number or 803 error",
                "Your Phone Number ID is wrong. Go to Meta Business Manager → WhatsApp Manager → Phone Numbers. Copy the numeric Phone Number ID (not the phone number itself) and save it in the WhatsApp Meta settings here."],
              ["No webhook events received",
                "Three steps: (1) Register the webhook URL (https://alburhantravels.com/api/social-media/webhook/meta) in your Meta App → Products → Messenger → Webhooks. (2) Click 'Subscribe All Webhook Fields' above. (3) Send a test message to your Facebook Page from another Facebook account."],
            ].map(([title, body]) => (
              <div key={title} className="bg-white/70 rounded p-2">
                <strong>{title}</strong>
                <p className="mt-0.5">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {data?.checkedAt && (
          <p className="text-[10px] text-muted-foreground text-right">
            Checked at {new Date(data.checkedAt).toLocaleString("en-IN")} · {summary?.total} tests run
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
