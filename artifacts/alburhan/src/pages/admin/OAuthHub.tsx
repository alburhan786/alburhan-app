import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = import.meta.env.VITE_API_URL || "";

type OAuthConn = {
  provider: string;
  platform: string;
  account_name: string | null;
  account_id: string | null;
  connected: boolean;
  has_refresh_token: boolean;
  connected_at: string;
  token_expiry: string | null;
  scope: string | null;
  connection_status: string | null;   // 'connected' | 'reconnect_required' | 'error' | 'unknown' | null
  last_refresh_at: string | null;
  last_error: string | null;
  last_api_call_at: string | null;
};

const OAUTH_PLATFORMS = [
  {
    group: "Meta",
    color: "#1877F2",
    platforms: [
      { provider: "meta", platform: "facebook_page",     icon: "📘", label: "Facebook Page",     desc: "Receive messages, comments & leads from your Facebook Business Page" },
      { provider: "meta", platform: "instagram",          icon: "📸", label: "Instagram Business", desc: "Manage Instagram DMs and comments" },
      { provider: "meta", platform: "facebook_messenger", icon: "💬", label: "Facebook Messenger", desc: "Handle customer conversations from Messenger" },
      { provider: "meta", platform: "facebook_leads",     icon: "🎯", label: "Lead Ads",            desc: "Auto-import leads from Facebook Lead Ad forms" },
      { provider: "meta", platform: "whatsapp_meta",      icon: "📱", label: "WhatsApp Cloud API",  desc: "Direct Meta Cloud API for WhatsApp Business" },
    ],
  },
  {
    group: "Google",
    color: "#4285F4",
    platforms: [
      { provider: "google", platform: "google",           icon: "🔵", label: "Google Account",    desc: "Connect your Google account for full suite access" },
      { provider: "google", platform: "google_business",  icon: "🏢", label: "Google Business",   desc: "Google Business Profile for reviews and posts" },
      { provider: "google", platform: "google_calendar",  icon: "📅", label: "Google Calendar",   desc: "Sync departure dates and pilgrim schedules" },
      { provider: "google", platform: "google_drive",     icon: "🗂️", label: "Google Drive",      desc: "Store and share documents, agreements, receipts" },
      { provider: "google", platform: "youtube",          icon: "▶️", label: "YouTube",            desc: "Publish Umrah/Hajj journey videos" },
    ],
  },
  {
    group: "Telegram",
    color: "#2CA5E0",
    platforms: [
      { provider: "telegram", platform: "telegram", icon: "✈️", label: "Telegram Bot", desc: "Customer notifications and group broadcasts via Telegram" },
    ],
  },
];

// ── Scope display helper ──────────────────────────────────────────────────────
function formatScopes(scope: string | null): string[] {
  if (!scope) return [];
  const aliases: Record<string, string> = {
    "https://www.googleapis.com/auth/business.manage": "Business Profile",
    "https://www.googleapis.com/auth/calendar": "Calendar (read/write)",
    "https://www.googleapis.com/auth/drive": "Drive (full)",
    "https://www.googleapis.com/auth/youtube": "YouTube",
    "https://www.googleapis.com/auth/userinfo.email": "Email",
    "https://www.googleapis.com/auth/userinfo.profile": "Profile",
    "openid": "OpenID",
    "email": "Email",
    "profile": "Profile",
  };
  return scope.split(/[\s,]+/).filter(Boolean).map(s => aliases[s] || s.split("/").pop() || s);
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  const diff = Date.now() - dt.getTime();
  if (diff < 60000)   return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtExpiry(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  const diff = dt.getTime() - Date.now();
  if (diff < 0) return "expired";
  if (diff < 300000)  return "< 5 min";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ conn, isGoogle }: { conn: OAuthConn | undefined; isGoogle: boolean }) {
  if (!conn?.connected) {
    return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Not Connected</Badge>;
  }

  if (!isGoogle) {
    // Meta etc — simple connected/expired display
    const expired = conn.token_expiry && new Date(conn.token_expiry) < new Date();
    if (expired) return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">⚠ Token Expired</Badge>;
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">✓ Connected</Badge>;
  }

  // Google — use connection_status from DB (auto-refresh aware)
  const status = conn.connection_status;
  if (status === "reconnect_required") {
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">🔴 Reconnect Required</Badge>;
  }
  if (status === "error") {
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">⚠ Error</Badge>;
  }
  if (!conn.has_refresh_token) {
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">⚠ No Refresh Token</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">✓ Connected</Badge>;
}

// ── Google connection detail panel ────────────────────────────────────────────
function GoogleDetailPanel({
  conn, platform, onTest, testing,
}: {
  conn: OAuthConn;
  platform: string;
  onTest: () => void;
  testing: boolean;
}) {
  const scopes = formatScopes(conn.scope);

  return (
    <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <span className="text-gray-400">Last token refresh</span>
          <div className="font-medium text-gray-700">{fmtDate(conn.last_refresh_at)}</div>
        </div>
        <div>
          <span className="text-gray-400">Last API call</span>
          <div className="font-medium text-gray-700">{fmtDate(conn.last_api_call_at)}</div>
        </div>
        <div>
          <span className="text-gray-400">Access token expires</span>
          <div className={`font-medium ${conn.token_expiry && new Date(conn.token_expiry) < new Date() ? "text-orange-600" : "text-gray-700"}`}>
            {fmtExpiry(conn.token_expiry)}
          </div>
        </div>
        <div>
          <span className="text-gray-400">Refresh token</span>
          <div className={`font-medium ${conn.has_refresh_token ? "text-green-700" : "text-red-600"}`}>
            {conn.has_refresh_token ? "✓ Stored" : "✗ Missing"}
          </div>
        </div>
      </div>

      {scopes.length > 0 && (
        <div>
          <span className="text-gray-400">Granted scopes</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {scopes.map(s => (
              <span key={s} className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">{s}</span>
            ))}
          </div>
        </div>
      )}

      {conn.last_error && conn.connection_status !== "connected" && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700">
          <span className="font-semibold">Error: </span>{conn.last_error}
        </div>
      )}

      <Button
        onClick={onTest}
        disabled={testing}
        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 h-7"
      >
        {testing ? "Testing..." : "🔍 Test Connection"}
      </Button>
    </div>
  );
}

export default function OAuthHub() {
  const { can, isSuper } = usePermissions();
  const { toast } = useToast();
  const [connections, setConnections]    = useState<OAuthConn[]>([]);
  const [loading, setLoading]            = useState(true);
  const [connecting, setConnecting]      = useState<string | null>(null);
  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [metaCreds, setMetaCreds]        = useState({ app_id: "", app_secret: "" });
  const [googleCreds, setGoogleCreds]    = useState({ client_id: "", client_secret: "" });
  const [savingCreds, setSavingCreds]    = useState(false);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [expandedGoogle, setExpandedGoogle] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/oauth/status`, { credentials: "include" });
      const d = await r.json();
      setConnections(d.connections || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle redirect back from OAuth provider
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const account   = params.get("account");
    const platform  = params.get("platform");
    const error     = params.get("error");
    if (connected) {
      toast({
        title: `✅ Connected ${connected}${platform ? ` (${platform})` : ""}`,
        description: account || "Account connected successfully. Refresh token stored securely.",
      });
      window.history.replaceState({}, "", window.location.pathname);
      load();
    }
    if (error) {
      toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load, toast]);

  const initiateOAuth = async (provider: string, platform: string) => {
    const key = `${provider}:${platform}`;
    setConnecting(key);
    try {
      const r = await fetch(`${API}/api/social-media/oauth/${provider}/start?platform=${encodeURIComponent(platform)}`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.redirect_url) {
        window.location.href = d.redirect_url;
      } else if (d.manual) {
        toast({ title: "Manual setup required", description: d.instruction });
        setConnecting(null);
      } else if (d.error) {
        toast({ title: "Cannot connect", description: d.instruction || d.error, variant: "destructive" });
        setConnecting(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setConnecting(null);
    }
  };

  const disconnect = async (provider: string, platform: string) => {
    try {
      await fetch(`${API}/api/social-media/oauth/${provider}/disconnect?platform=${encodeURIComponent(platform)}`, {
        method: "DELETE", credentials: "include",
      });
      toast({ title: "Disconnected", description: `${platform} disconnected and tokens removed` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const testGoogleConnection = async (platform: string) => {
    setTestingPlatform(platform);
    try {
      const r = await fetch(`${API}/api/social-media/oauth/google/test/${encodeURIComponent(platform)}`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        toast({
          title: `✅ google/${platform} is working`,
          description: d.email
            ? `Verified as ${d.email}. Token auto-refreshed if needed.`
            : "Connection verified. Token auto-refreshed if needed.",
        });
      } else if (d.status === "reconnect_required") {
        toast({
          title: "Reconnect required",
          description: d.error || "Refresh token revoked — please reconnect this Google account.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection issue",
          description: d.error || "Temporary Google API issue. Try again later.",
          variant: "destructive",
        });
      }
      load(); // Reload to show updated last_api_call_at
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setTestingPlatform(null);
  };

  const saveCreds = async (provider: string) => {
    setSavingCreds(true);
    try {
      const fields = provider === "meta" ? metaCreds : googleCreds;
      const r = await fetch(`${API}/api/social-media/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, fields }),
      });
      if (r.ok) {
        toast({ title: "Credentials saved", description: "You can now click Connect to authorize" });
        setConfigPlatform(null);
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Save failed", description: d.error || d.message || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSavingCreds(false);
  };

  if (!isSuper && !can("settings", "view")) {
    return (
      <AdminLayout>
        <div className="p-8 text-gray-500">
          You do not have permission to access Social Connect. Contact your administrator.
        </div>
      </AdminLayout>
    );
  }

  const connMap: Record<string, OAuthConn> = {};
  for (const c of connections) connMap[`${c.provider}:${c.platform}`] = c;

  // Check if any Google connection has no refresh token (Testing-mode warning trigger)
  const googleConns = connections.filter(c => c.provider === "google" && c.connected);
  const anyMissingRefresh = googleConns.some(c => !c.has_refresh_token);

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Media OAuth Hub</h1>
          <p className="text-gray-500 text-sm mt-1">
            Tokens are automatically refreshed before expiry — you will never need to reconnect unless authorization is explicitly revoked.
          </p>
        </div>

        {/* Google Testing-mode warning */}
        {anyMissingRefresh && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900 flex gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div>
              <p className="font-semibold mb-1">Google OAuth testing authorizations may expire after 7 days</p>
              <p>One or more Google connections are missing a refresh token, which typically happens when the Google OAuth application is in <strong>Testing</strong> mode. Testing-mode tokens expire after 7 days and cannot be refreshed automatically.</p>
              <p className="mt-1">To fix: Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" className="underline font-medium">Google Cloud Console → OAuth consent screen</a> → change Publishing Status from <em>Testing</em> to <strong>Production</strong>, then reconnect each Google service.</p>
            </div>
          </div>
        )}

        {/* First-time setup note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>First-time setup:</strong> Configure App credentials once (App ID + Secret for Meta, Client ID + Secret for Google), then click <em>Connect</em> on each platform. Access tokens refresh automatically — no manual intervention required.
        </div>

        {/* Credential Setup cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Meta App Creds */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📘</span>
              <span className="font-semibold text-gray-800">Meta App Credentials</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">Required for Facebook, Instagram, Messenger, WhatsApp Cloud API</p>
            {configPlatform === "meta" ? (
              <div className="space-y-2">
                <Input placeholder="App ID (e.g. 123456789012345)" value={metaCreds.app_id} onChange={e => setMetaCreds(p => ({ ...p, app_id: e.target.value }))} className="text-sm" />
                <Input type="password" placeholder="App Secret" value={metaCreds.app_secret} onChange={e => setMetaCreds(p => ({ ...p, app_secret: e.target.value }))} className="text-sm" />
                <div className="flex gap-2">
                  <Button onClick={() => saveCreds("meta")} disabled={savingCreds} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5">
                    {savingCreds ? "Saving..." : "Save Credentials"}
                  </Button>
                  <Button onClick={() => setConfigPlatform(null)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5">Cancel</Button>
                </div>
                <p className="text-xs text-gray-400">Get from: <a href="https://developers.facebook.com/apps" target="_blank" className="text-blue-500 underline">developers.facebook.com/apps</a></p>
              </div>
            ) : (
              <Button onClick={() => setConfigPlatform("meta")} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-1.5 w-full">
                ⚙️ Configure Meta App
              </Button>
            )}
          </div>

          {/* Google Creds */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔵</span>
              <span className="font-semibold text-gray-800">Google OAuth Credentials</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">Required for Google Business, Calendar, Drive, YouTube — stored encrypted</p>
            {configPlatform === "google" ? (
              <div className="space-y-2">
                <Input placeholder="Client ID (xxxx.apps.googleusercontent.com)" value={googleCreds.client_id} onChange={e => setGoogleCreds(p => ({ ...p, client_id: e.target.value }))} className="text-sm" />
                <Input type="password" placeholder="Client Secret" value={googleCreds.client_secret} onChange={e => setGoogleCreds(p => ({ ...p, client_secret: e.target.value }))} className="text-sm" />
                <div className="flex gap-2">
                  <Button onClick={() => saveCreds("google")} disabled={savingCreds} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5">
                    {savingCreds ? "Saving..." : "Save Credentials"}
                  </Button>
                  <Button onClick={() => setConfigPlatform(null)} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5">Cancel</Button>
                </div>
                <p className="text-xs text-gray-400">Get from: <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-500 underline">console.cloud.google.com</a></p>
              </div>
            ) : (
              <Button onClick={() => setConfigPlatform("google")} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-1.5 w-full">
                ⚙️ Configure Google OAuth
              </Button>
            )}
          </div>
        </div>

        {/* Platform Groups */}
        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading connections...</div>
        ) : (
          OAUTH_PLATFORMS.map(group => (
            <div key={group.group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                <span className="font-semibold text-gray-800 text-base">{group.group}</span>
                <span className="text-xs text-gray-400">
                  {connections.filter(c => c.provider === group.group.toLowerCase() && c.connected).length} connected
                </span>
              </div>

              <div className="divide-y divide-gray-50">
                {group.platforms.map(plt => {
                  const key      = `${plt.provider}:${plt.platform}`;
                  const conn     = connMap[key];
                  const isConn   = conn?.connected ?? false;
                  const isGoogle = plt.provider === "google";
                  const isLoading = connecting === key;
                  const needsReconnect = isGoogle && conn?.connection_status === "reconnect_required";
                  const expanded = expandedGoogle === key;

                  return (
                    <div key={key} className={`px-5 py-4 ${isConn && !needsReconnect ? "bg-green-50/30" : needsReconnect ? "bg-red-50/30" : ""}`}>
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <span className="text-2xl mt-0.5">{plt.icon}</span>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-800 text-sm">{plt.label}</span>
                            <StatusBadge conn={conn} isGoogle={isGoogle} />
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{plt.desc}</div>

                          {conn?.account_name && (
                            <div className="text-xs text-green-700 mt-1 font-medium">👤 {conn.account_name}</div>
                          )}

                          {/* Google expanded details */}
                          {isGoogle && isConn && expanded && (
                            <GoogleDetailPanel
                              conn={conn}
                              platform={plt.platform}
                              onTest={() => testGoogleConnection(plt.platform)}
                              testing={testingPlatform === plt.platform}
                            />
                          )}

                          {/* Meta token expiry */}
                          {!isGoogle && conn?.token_expiry && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Expires: {new Date(conn.token_expiry).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isConn ? (
                            <>
                              {isGoogle && (
                                <Button
                                  onClick={() => setExpandedGoogle(expanded ? null : key)}
                                  className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs px-3 py-1.5 rounded-lg h-7"
                                >
                                  {expanded ? "▲ Hide" : "▼ Details"}
                                </Button>
                              )}
                              {needsReconnect ? (
                                <Button
                                  onClick={() => initiateOAuth(plt.provider, plt.platform)}
                                  disabled={isLoading}
                                  className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-1.5 rounded-lg h-7"
                                >
                                  {isLoading ? "Redirecting..." : "🔄 Reconnect"}
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => disconnect(plt.provider, plt.platform)}
                                  className="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg h-7"
                                >
                                  Disconnect
                                </Button>
                              )}
                            </>
                          ) : (
                            <Button
                              onClick={() => initiateOAuth(plt.provider, plt.platform)}
                              disabled={isLoading}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg h-7"
                            >
                              {isLoading ? "Redirecting..." : "Connect →"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Callback URLs */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1.5">
          <div className="font-semibold text-gray-700 mb-2">OAuth Callback URLs (add these to your app settings)</div>
          <div><strong>Meta:</strong> <code className="bg-white border rounded px-1 py-0.5 font-mono">https://alburhantravels.com/api/social-media/oauth/meta/callback</code></div>
          <div><strong>Google:</strong> <code className="bg-white border rounded px-1 py-0.5 font-mono">https://alburhantravels.com/api/social-media/oauth/google/callback</code></div>
          <div className="text-gray-400 pt-1">
            💡 Google: also add <code className="bg-white border rounded px-1 font-mono">http://localhost:5000/api/social-media/oauth/google/callback</code> for local testing
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
