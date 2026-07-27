import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  Share2, RefreshCw, CheckCircle2, AlertCircle, Circle,
  ExternalLink, Zap, MessageSquare, Settings, Globe,
  Activity, ChevronRight, X, Loader2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const STATUS_STYLES: Record<string, string> = {
  healthy:            "bg-emerald-100 text-emerald-800 border border-emerald-200",
  configured:         "bg-blue-100 text-blue-800 border border-blue-200",
  not_connected:      "bg-gray-100 text-gray-500 border border-gray-200",
  token_expired:      "bg-red-100 text-red-700 border border-red-200",
  webhook_failed:     "bg-amber-100 text-amber-700 border border-amber-200",
  permission_pending: "bg-purple-100 text-purple-700 border border-purple-200",
  disabled:           "bg-gray-50 text-gray-400 border border-gray-100",
  unsupported:        "bg-gray-50 text-gray-300 border border-gray-100",
};
const STATUS_LABELS: Record<string, string> = {
  healthy:            "✅ Healthy",
  configured:         "⚙️ Configured",
  not_connected:      "Not Connected",
  token_expired:      "⚠️ Token Expired",
  webhook_failed:     "⚠️ Webhook Failed",
  permission_pending: "⏳ Perm. Pending",
  disabled:           "Disabled",
  unsupported:        "Unsupported",
};

const PLATFORM_ROUTES: Record<string, string> = {
  facebook_page:      "/admin/social-media#facebook",
  facebook_messenger: "/admin/social-media#facebook",
  instagram:          "/admin/social-media#instagram",
  instagram_dm:       "/admin/social-media#instagram",
  facebook_leads:     "/admin/social-media#facebook",
  instagram_leads:    "/admin/social-media#instagram",
  fb_comments:        "/admin/comment-automation",
  ig_comments:        "/admin/comment-automation",
  whatsapp:           "/admin/botbee-dashboard",
  google_business:    "/admin/social-media#google",
  youtube:            "/admin/social-oauth",
  linkedin:           "/admin/social-media",
  twitter_x:          "/admin/social-media",
  website_form:       "/admin/social-media#website",
  website_livechat:   "/admin/social-media#website",
  email_enquiry:      "/admin/email-dashboard",
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: "🔵", messenger: "💬", instagram: "📸",
  whatsapp: "💚", google: "🔴", youtube: "▶️",
  linkedin: "🔷", x: "✖", web: "🌐",
  chat: "💬", email: "📧",
};

const META_PLATFORMS = new Set(["facebook_page","facebook_messenger","instagram","instagram_dm","facebook_leads","instagram_leads","fb_comments","ig_comments"]);

interface Channel {
  id: string; label: string; icon: string; status: string;
  connected: boolean; webhook_verified: boolean;
  last_sync: string | null; messages_30d: number;
  errors_7d: number; token_expiry: string | null; account_id: string | null;
}

export default function SocialIntegrationHub() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [syncing, setSyncing] = useState(false);

  // Page modal state
  const [showPageModal, setShowPageModal] = useState(false);
  const [pages, setPages] = useState<any[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState("");
  const [savingPage, setSavingPage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/api/social-media/integration-status`, { credentials: "include" });
      const d = await r.json();
      if (d.ok) setChannels(d.channels || []);
      else setError(d.error || "Failed to load channel status");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function testChannel(ch: Channel) {
    const platformMap: Record<string, string> = {
      facebook_page: "facebook_page", facebook_messenger: "facebook_messenger",
      instagram: "instagram", instagram_dm: "instagram_dm",
      facebook_leads: "facebook_leads", fb_comments: "facebook_page", ig_comments: "instagram",
    };
    const platform = platformMap[ch.id] || ch.id;
    setTestingId(ch.id);
    try {
      const r = await fetch(`${API}/api/social-media/platforms/${platform}/test`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      setTestResults(prev => ({ ...prev, [ch.id]: d }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [ch.id]: { ok: false, message: e.message } }));
    } finally { setTestingId(null); }
  }

  async function subscribeWebhooks() {
    setSyncing(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/subscribe-webhooks`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      alert(d.ok ? `✅ ${d.message}` : `❌ ${d.message}`);
      if (d.ok) await load();
    } catch (e: any) { alert("Error: " + e.message); }
    finally { setSyncing(false); }
  }

  async function openPageModal() {
    setShowPageModal(true); setPages([]); setPagesError(""); setPagesLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/oauth/meta/pages`, { credentials: "include" });
      const d = await r.json();
      if (d.ok) setPages(d.pages || []);
      else setPagesError(d.error || "Failed to load pages");
    } catch (e: any) { setPagesError(e.message); }
    finally { setPagesLoading(false); }
  }

  async function savePage(page: any) {
    setSavingPage(page.id);
    try {
      const r = await fetch(`${API}/api/social-media/oauth/meta/save-page`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: page.id, page_name: page.name,
          instagram_account_id: page.instagram_account_id || null,
          instagram_username: page.instagram_username || null,
        }),
      });
      const d = await r.json();
      if (d.ok) { setShowPageModal(false); alert(d.message); load(); }
      else alert("❌ " + (d.error || "Save failed"));
    } catch (e: any) { alert("Error: " + e.message); }
    finally { setSavingPage(null); }
  }

  const nav = (href: string) => { window.location.href = href; };

  const connected = channels.filter(c => c.connected).length;
  const healthy   = channels.filter(c => c.status === "healthy").length;
  const totalMsgs = channels.reduce((s, c) => s + (c.messages_30d || 0), 0);
  const totalErrs = channels.reduce((s, c) => s + (c.errors_7d || 0), 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Share2 className="w-6 h-6 text-blue-600" />
              Social Integration Hub
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              16-channel status · Lead Ads capture · Comment automation · Omnichannel inbox
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => nav("/admin/social-oauth")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-300 rounded-lg hover:bg-blue-50 text-blue-700">
              <ExternalLink className="w-3.5 h-3.5" /> OAuth Hub
            </button>
            <button onClick={openPageModal}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              📄 Select Facebook Page
            </button>
            <button onClick={subscribeWebhooks} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {syncing ? "Subscribing…" : "Subscribe Webhooks"}
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Connected", value: connected, sub: `of ${channels.length} channels`, color: "text-emerald-600" },
              { label: "Healthy",   value: healthy,   sub: "webhook verified + active",      color: "text-green-600" },
              { label: "Msgs / 30d",value: totalMsgs.toLocaleString(), sub: "inbound across all channels", color: "text-blue-600" },
              { label: "Errors / 7d",value: totalErrs, sub: "across all channels", color: totalErrs > 0 ? "text-red-600" : "text-gray-400" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-sm font-medium text-gray-700 mt-0.5">{s.label}</div>
                <div className="text-xs text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array(16).fill(0).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-xl h-52 animate-pulse" />
            ))}
          </div>
        )}

        {/* 16 Channel Cards */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {channels.map(ch => {
              const style  = STATUS_STYLES[ch.status] || STATUS_STYLES.not_connected;
              const slabel = STATUS_LABELS[ch.status] || "Unknown";
              const icon   = PLATFORM_ICONS[ch.icon] || "🌐";
              const tr     = testResults[ch.id];
              const isTesting = testingId === ch.id;
              const tokenExpiringSoon = ch.token_expiry &&
                new Date(ch.token_expiry).getTime() < Date.now() + 7 * 86400000;

              return (
                <div key={ch.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2.5 transition-all
                    ${ch.errors_7d > 0 ? "border-red-200" : "border-gray-200"}
                    ${ch.status === "healthy" ? "ring-1 ring-emerald-100" : ""}`}>

                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm leading-tight truncate">{ch.label}</div>
                        {ch.account_id && (
                          <div className="text-xs text-gray-400 font-mono truncate">ID: {ch.account_id}</div>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap ${style}`}>
                      {slabel}
                    </span>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div className="bg-gray-50 rounded-lg py-1.5 px-1">
                      <div className="text-sm font-bold text-gray-800">{ch.messages_30d || 0}</div>
                      <div className="text-xs text-gray-400">msgs/30d</div>
                    </div>
                    <div className={`rounded-lg py-1.5 px-1 ${ch.errors_7d > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                      <div className={`text-sm font-bold ${ch.errors_7d > 0 ? "text-red-600" : "text-gray-800"}`}>
                        {ch.errors_7d || 0}
                      </div>
                      <div className="text-xs text-gray-400">err/7d</div>
                    </div>
                    <div className={`rounded-lg py-1.5 px-1 ${ch.webhook_verified ? "bg-emerald-50" : "bg-gray-50"}`}>
                      <div className={`text-sm font-bold ${ch.webhook_verified ? "text-emerald-600" : "text-gray-300"}`}>
                        {ch.webhook_verified ? "✓" : "—"}
                      </div>
                      <div className="text-xs text-gray-400">hook</div>
                    </div>
                  </div>

                  {/* Last sync */}
                  {ch.last_sync && (
                    <div className="text-xs text-gray-400 truncate">
                      Last: {new Date(ch.last_sync).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  )}

                  {/* Token warning */}
                  {tokenExpiringSoon && (
                    <div className="text-xs text-amber-600 font-medium bg-amber-50 rounded px-2 py-1">
                      ⚠️ Token expires {new Date(ch.token_expiry!).toLocaleDateString()}
                    </div>
                  )}

                  {/* Test result */}
                  {tr && (
                    <div className={`text-xs rounded px-2 py-1 ${tr.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {tr.ok ? "✅" : "❌"} {(tr.message || (tr.ok ? "Test passed" : "Test failed")).slice(0, 60)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 mt-auto pt-1">
                    {!ch.connected ? (
                      <button
                        onClick={() => META_PLATFORMS.has(ch.id) ? nav("/admin/social-oauth") : nav(PLATFORM_ROUTES[ch.id] || "/admin/social-media")}
                        className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center font-medium">
                        Connect
                      </button>
                    ) : (
                      <>
                        <button onClick={() => testChannel(ch)} disabled={isTesting}
                          className="flex-1 text-xs py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-60 flex items-center justify-center gap-1">
                          {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                          {isTesting ? "…" : "Test"}
                        </button>
                        <button onClick={() => nav(PLATFORM_ROUTES[ch.id] || "/admin/social-media")}
                          className="flex-1 text-xs py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 flex items-center justify-center gap-1">
                          <Settings className="w-3 h-3" /> Config
                        </button>
                      </>
                    )}
                    {(ch.id === "fb_comments" || ch.id === "ig_comments") && (
                      <button onClick={() => nav("/admin/comment-automation")}
                        className="text-xs py-1.5 px-2 border border-purple-200 rounded-lg hover:bg-purple-50 text-purple-700">
                        <Zap className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-blue-500" /> Quick Actions & Tools
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "🔗 OAuth Hub",           desc: "Connect Meta & Google",        href: "/admin/social-oauth" },
              { label: "⚙️ Platform Settings",   desc: "API keys & token config",      href: "/admin/social-media" },
              { label: "💬 Omnichannel Inbox",    desc: "All inbound messages",         href: "/admin/inbox" },
              { label: "⚡ Comment Automation",   desc: "Keyword reply rules",          href: "/admin/comment-automation" },
              { label: "🎯 Lead Pipeline",        desc: "26-stage CRM pipeline",        href: "/admin/lead-pipeline" },
              { label: "📊 Comms Dashboard",      desc: "Channel analytics overview",   href: "/admin/comms-dashboard" },
              { label: "🔵 Meta Health",          desc: "Live API diagnostics",         href: "/admin/meta-health" },
              { label: "☁️ Meta Cloud Status",    desc: "WhatsApp delivery tracking",   href: "/admin/meta-status" },
            ].map(l => (
              <button key={l.href} onClick={() => nav(l.href)}
                className="text-left p-3 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-200 transition-all group">
                <div className="font-medium text-gray-900 text-sm group-hover:text-blue-600">{l.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{l.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Lead Ads Setup Guide */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
          <h2 className="font-semibold text-blue-900 mb-3">📋 Facebook & Instagram Lead Ads — Setup Guide</h2>
          <ol className="space-y-1.5 text-sm text-blue-800 list-decimal list-inside">
            <li>Go to <strong>OAuth Hub</strong> → click <strong>Connect Meta</strong> → sign in with Facebook</li>
            <li>After OAuth completes, click <strong>Select Facebook Page</strong> above — choose your business page</li>
            <li>System auto-configures: Facebook Page, Messenger, Lead Ads, Instagram Business, Instagram DM</li>
            <li>Click <strong>Subscribe Webhooks</strong> to register for leadgen + feed (comment) events</li>
            <li>Submit a test Lead Ad form — the lead appears in <strong>Lead Pipeline</strong> with full name, phone, email, and campaign attribution</li>
          </ol>
          <div className="mt-3 p-2 bg-blue-100 rounded-lg">
            <span className="text-xs text-blue-700 font-medium">Webhook endpoint: </span>
            <code className="text-xs text-blue-900 font-mono">https://alburhantravels.online/api/social-media/webhook/meta</code>
          </div>
        </div>

        {/* Comment Automation Guide */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-5">
          <h2 className="font-semibold text-purple-900 mb-3">⚡ Comment Automation — How It Works</h2>
          <div className="grid md:grid-cols-2 gap-5 text-sm text-purple-800">
            <div>
              <div className="font-medium mb-2">Trigger Flow (live in production):</div>
              <div className="space-y-1 text-xs bg-white/60 rounded-lg p-3">
                {[
                  "Comment posted on Facebook/Instagram post",
                  "Meta webhook delivers feed event to server",
                  "Keywords matched vs Comment Automation rules",
                  "Public reply posted via Graph API",
                  "CRM lead auto-created (if rule enabled)",
                  "Cooldown enforced — no duplicate replies",
                ].map((step, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-purple-400 font-bold">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium mb-2">Example trigger keywords:</div>
              <div className="flex flex-wrap gap-1.5">
                {["hajj", "umrah", "price", "package", "details", "interested", "visa", "call me", "send details", "Ramadan", "ziyarat", "group"].map(kw => (
                  <span key={kw} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{kw}</span>
                ))}
              </div>
              <button onClick={() => nav("/admin/comment-automation")}
                className="mt-3 text-sm text-purple-600 underline font-medium hover:text-purple-800 flex items-center gap-1">
                Configure automation rules <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Page Selection Modal */}
      {showPageModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Select Facebook Page</h2>
                <p className="text-sm text-gray-500 mt-0.5">Choose the page for Messenger, Lead Ads & Instagram</p>
              </div>
              <button onClick={() => setShowPageModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {pagesLoading && (
                <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading your pages…
                </div>
              )}
              {pagesError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {pagesError}
                  <button onClick={() => nav("/admin/social-oauth")}
                    className="block mt-2 text-red-600 underline text-xs">
                    → Go to OAuth Hub to connect Meta first
                  </button>
                </div>
              )}
              {!pagesLoading && !pagesError && pages.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No pages found</div>
                  <button onClick={() => nav("/admin/social-oauth")}
                    className="mt-2 text-sm text-blue-600 underline">
                    Connect Meta via OAuth Hub first
                  </button>
                </div>
              )}
              {pages.map(page => (
                <div key={page.id} className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">🔵 {page.name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">ID: {page.id}</div>
                      {page.category && <div className="text-xs text-gray-400">{page.category}</div>}
                      {page.instagram_account_id && (
                        <div className="text-xs text-pink-600 mt-1">
                          📸 Instagram linked: @{page.instagram_username || page.instagram_account_id}
                        </div>
                      )}
                    </div>
                    <button onClick={() => savePage(page)} disabled={savingPage === page.id}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
                      {savingPage === page.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {savingPage === page.id ? "Saving…" : "Use Page"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowPageModal(false)}
                className="w-full text-sm text-gray-500 hover:text-gray-800 py-1">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
