import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const API = import.meta.env.VITE_API_URL || "";

type OAuthConn = {
  provider: string; platform: string; account_name: string | null;
  account_id: string | null; connected: boolean; connected_at: string;
  token_expiry: string | null; scope: string | null;
};

const OAUTH_PLATFORMS = [
  {
    group: "Meta",
    color: "#1877F2",
    platforms: [
      { provider: "meta", platform: "facebook_page",    icon: "📘", label: "Facebook Page",    desc: "Receive messages, comments & leads from your Facebook Business Page" },
      { provider: "meta", platform: "instagram",         icon: "📸", label: "Instagram Business",desc: "Manage Instagram DMs and comments" },
      { provider: "meta", platform: "facebook_messenger",icon: "💬", label: "Facebook Messenger",desc: "Handle customer conversations from Messenger" },
      { provider: "meta", platform: "facebook_leads",    icon: "🎯", label: "Lead Ads",          desc: "Auto-import leads from Facebook Lead Ad forms" },
      { provider: "meta", platform: "whatsapp_meta",     icon: "📱", label: "WhatsApp Cloud API",desc: "Direct Meta Cloud API for WhatsApp Business" },
    ],
  },
  {
    group: "Google",
    color: "#4285F4",
    platforms: [
      { provider: "google", platform: "google",          icon: "🔵", label: "Google Account",   desc: "Connect your Google account for suite access" },
      { provider: "google", platform: "google_business", icon: "🏢", label: "Google Business",  desc: "Google Business Profile for reviews and posts" },
      { provider: "google", platform: "google_calendar", icon: "📅", label: "Google Calendar",  desc: "Sync departure dates and pilgrim schedules" },
      { provider: "google", platform: "google_drive",    icon: "🗂️", label: "Google Drive",     desc: "Store and share documents, agreements, receipts" },
      { provider: "google", platform: "youtube",         icon: "▶️", label: "YouTube",           desc: "Publish Umrah/Hajj journey videos" },
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

function ConnectedBadge({ connected, expiry }: { connected: boolean; expiry?: string | null }) {
  if (!connected) return <Badge className="bg-gray-100 text-gray-500 border-gray-200">Not Connected</Badge>;
  const isExpired = expiry && new Date(expiry) < new Date();
  if (isExpired) return <Badge className="bg-orange-100 text-orange-700 border-orange-200">⚠ Token Expired</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200">✓ Connected</Badge>;
}

export default function OAuthHub() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [connections, setConnections]   = useState<OAuthConn[]>([]);
  const [loading, setLoading]           = useState(true);
  const [connecting, setConnecting]     = useState<string | null>(null);
  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [metaCreds, setMetaCreds]       = useState({ app_id: "", app_secret: "" });
  const [googleCreds, setGoogleCreds]   = useState({ client_id: "", client_secret: "" });
  const [savingCreds, setSavingCreds]   = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const account   = params.get("account");
    const error     = params.get("error");
    if (connected) {
      toast({ title: `✅ Connected ${connected}`, description: account || "Account connected successfully" });
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
      toast({ title: "Disconnected", description: `${provider}/${platform} disconnected` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const saveCreds = async (provider: string) => {
    setSavingCreds(true);
    try {
      const fields = provider === "meta" ? metaCreds : googleCreds;
      const r = await fetch(`${API}/api/social-media/platforms/${provider === "meta" ? "facebook_page" : "google"}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extra_fields: fields }),
      });
      if (r.ok) {
        toast({ title: "Credentials saved", description: "You can now click Connect" });
        setConfigPlatform(null);
      } else {
        const d = await r.json();
        toast({ title: "Save failed", description: d.error || "Unknown error", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSavingCreds(false);
  };

  if (!can("system:health")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  const connMap: Record<string, OAuthConn> = {};
  for (const c of connections) connMap[`${c.provider}:${c.platform}`] = c;

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Media OAuth Hub</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connect platforms via real OAuth authorization — no manual token entry required
          </p>
        </div>

        {/* Setup note */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>First-time setup:</strong> Configure your App credentials once (App ID + App Secret for Meta, Client ID + Client Secret for Google), then click <em>Connect</em> on each platform. OAuth handles the rest automatically.
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
            <p className="text-xs text-gray-500 mb-3">Required for Google Business, Calendar, Drive, YouTube</p>
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
        {OAUTH_PLATFORMS.map(group => (
          <div key={group.group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <span className="font-semibold text-gray-800 text-base">{group.group}</span>
              <div className="text-xs text-gray-400">{connections.filter(c => c.provider === group.group.toLowerCase()).length} connected</div>
            </div>
            <div className="divide-y divide-gray-50">
              {group.platforms.map(plt => {
                const key      = `${plt.provider}:${plt.platform}`;
                const conn     = connMap[key];
                const isConn   = conn?.connected ?? false;
                const isLoading = connecting === key;
                return (
                  <div key={key} className={`px-5 py-4 flex items-center gap-4 ${isConn ? "bg-green-50/40" : ""}`}>
                    <span className="text-2xl">{plt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm">{plt.label}</div>
                      <div className="text-xs text-gray-500">{plt.desc}</div>
                      {conn?.account_name && (
                        <div className="text-xs text-green-700 mt-0.5">
                          👤 {conn.account_name}
                          {conn.token_expiry && <span className="text-gray-400 ml-2">expires {new Date(conn.token_expiry).toLocaleDateString("en-IN")}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ConnectedBadge connected={isConn} expiry={conn?.token_expiry} />
                      {isConn ? (
                        <Button
                          onClick={() => disconnect(plt.provider, plt.platform)}
                          className="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg"
                        >
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          onClick={() => initiateOAuth(plt.provider, plt.platform)}
                          disabled={isLoading}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg"
                        >
                          {isLoading ? "Redirecting..." : "Connect →"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Callback URL info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1">
          <div className="font-semibold text-gray-700 mb-2">OAuth Callback URLs (add to your app settings)</div>
          <div><strong>Meta:</strong> <code className="bg-white border rounded px-1">https://alburhantravels.com/api/social-media/oauth/meta/callback</code></div>
          <div><strong>Google:</strong> <code className="bg-white border rounded px-1">https://alburhantravels.com/api/social-media/oauth/google/callback</code></div>
        </div>
      </div>
    </AdminLayout>
  );
}
