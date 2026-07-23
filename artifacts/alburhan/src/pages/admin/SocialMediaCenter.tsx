import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

const API = import.meta.env.VITE_API_URL || "";

// ── Platform definitions ──────────────────────────────────────────────────────
const PLATFORM_GROUPS = [
  {
    group: "WhatsApp",
    color: "#25D366",
    bgColor: "#dcfce7",
    emoji: "📱",
    platforms: [
      {
        id: "whatsapp_botbee", name: "WhatsApp BotBee",
        description: "Active production channel. BotBee-powered WhatsApp messaging.",
        managed: true, managedLink: "/admin/botbee-dashboard",
        fields: [],
      },
      {
        id: "whatsapp_meta", name: "WhatsApp Cloud API",
        description: "Direct Meta Cloud API integration for WhatsApp Business.",
        fields: [
          { key: "access_token", label: "Permanent Access Token", sensitive: true, placeholder: "EAAb...your token" },
          { key: "phone_number_id", label: "Phone Number ID", placeholder: "1234567890123" },
          { key: "waba_id", label: "WABA ID", placeholder: "WhatsApp Business Account ID" },
          { key: "webhook_verify_token", label: "Webhook Verify Token", placeholder: "my_secret_token_123" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
    ],
  },
  {
    group: "Facebook",
    color: "#1877F2",
    bgColor: "#dbeafe",
    emoji: "📘",
    platforms: [
      {
        id: "facebook_page", name: "Facebook Page",
        description: "Receive and manage messages from your Facebook Business Page.",
        fields: [
          { key: "app_id", label: "App ID", placeholder: "123456789012345" },
          { key: "app_secret", label: "App Secret", sensitive: true, placeholder: "abc123..." },
          { key: "page_access_token", label: "Page Access Token", sensitive: true, placeholder: "EAAb..." },
          { key: "page_id", label: "Page ID", placeholder: "Your Facebook Page ID" },
          { key: "webhook_verify_token", label: "Webhook Verify Token", placeholder: "my_secret_verify_token" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
      {
        id: "facebook_messenger", name: "Facebook Messenger",
        description: "Handle customer conversations from Facebook Messenger.",
        fields: [
          { key: "page_access_token", label: "Page Access Token", sensitive: true, placeholder: "EAAb..." },
          { key: "page_id", label: "Page ID", placeholder: "Your Facebook Page ID" },
          { key: "app_secret", label: "App Secret", sensitive: true, placeholder: "abc123..." },
          { key: "webhook_verify_token", label: "Webhook Verify Token", placeholder: "verify_token" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
      {
        id: "facebook_leads", name: "Facebook Lead Ads",
        description: "Auto-import leads submitted via Facebook Lead Ad forms.",
        fields: [
          { key: "page_access_token", label: "Page Access Token", sensitive: true, placeholder: "EAAb..." },
          { key: "page_id", label: "Page ID", placeholder: "Your Facebook Page ID" },
          { key: "form_id", label: "Lead Form ID (optional)", placeholder: "Leave blank for all forms" },
          { key: "app_secret", label: "App Secret", sensitive: true, placeholder: "abc123..." },
          { key: "webhook_verify_token", label: "Webhook Verify Token", placeholder: "verify_token" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
    ],
  },
  {
    group: "Instagram",
    color: "#E1306C",
    bgColor: "#fce7f3",
    emoji: "📸",
    platforms: [
      {
        id: "instagram", name: "Instagram Business",
        description: "Connect your Instagram Business account for message management.",
        fields: [
          { key: "page_access_token", label: "Page Access Token", sensitive: true, placeholder: "EAAb..." },
          { key: "instagram_account_id", label: "Instagram Account ID", placeholder: "Your IG account ID" },
          { key: "app_id", label: "App ID", placeholder: "Meta App ID" },
          { key: "app_secret", label: "App Secret", sensitive: true, placeholder: "abc123..." },
          { key: "webhook_verify_token", label: "Webhook Verify Token", placeholder: "verify_token" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
      {
        id: "instagram_dm", name: "Instagram Direct Messages",
        description: "Receive and reply to Instagram DMs from customers.",
        fields: [
          { key: "page_access_token", label: "Page Access Token", sensitive: true, placeholder: "EAAb..." },
          { key: "instagram_account_id", label: "Instagram Account ID", placeholder: "Your IG account ID" },
          { key: "app_secret", label: "App Secret", sensitive: true, placeholder: "abc123..." },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/meta",
      },
    ],
  },
  {
    group: "Telegram",
    color: "#229ED9",
    bgColor: "#e0f2fe",
    emoji: "✈️",
    platforms: [
      {
        id: "telegram_bot", name: "Telegram Bot",
        description: "Accept messages and inquiries via a Telegram Bot.",
        fields: [
          { key: "bot_token", label: "Bot Token", sensitive: true, placeholder: "123456:ABC-DEF... (from @BotFather)" },
          { key: "bot_username", label: "Bot Username", placeholder: "@AlBurhanBot" },
          { key: "webhook_secret", label: "Webhook Secret (optional)", sensitive: true, placeholder: "random_secret_string" },
        ],
        webhookUrl: "https://alburhantravels.com/api/social-media/webhook/telegram",
        extraAction: { label: "Set Webhook", endpoint: "/api/social-media/telegram/set-webhook" },
      },
      {
        id: "telegram_channel", name: "Telegram Channel",
        description: "Broadcast messages to a Telegram Channel.",
        fields: [
          { key: "bot_token", label: "Bot Token (admin of channel)", sensitive: true, placeholder: "123456:ABC-DEF..." },
          { key: "channel_id", label: "Channel ID", placeholder: "@AlBurhanChannel or -1001234567890" },
          { key: "channel_username", label: "Channel Username", placeholder: "@AlBurhanTravels" },
        ],
      },
    ],
  },
  {
    group: "RCS",
    color: "#6366F1",
    bgColor: "#ede9fe",
    emoji: "📡",
    platforms: [
      {
        id: "google_rcs", name: "Google RCS Business",
        description: "Rich Communication Services via Google Business Messaging.",
        fields: [
          { key: "api_key", label: "API Key", sensitive: true, placeholder: "From Google Cloud Console" },
          { key: "project_id", label: "Project ID", placeholder: "your-gcp-project-id" },
          { key: "agent_id", label: "Agent ID", placeholder: "RCS Agent ID" },
          { key: "service_account_json", label: "Service Account JSON", sensitive: true, placeholder: '{"type":"service_account",...}' },
        ],
        note: "Requires Google Business Messaging console approval.",
      },
      {
        id: "jio_rcs", name: "Jio RCS",
        description: "Jio RCS Business Messaging for Indian customers.",
        fields: [
          { key: "username", label: "Username", placeholder: "Jio RCS username" },
          { key: "password", label: "Password", sensitive: true, placeholder: "Jio RCS password" },
          { key: "sender_id", label: "Sender ID", placeholder: "ALBURHAN" },
          { key: "api_url", label: "API URL", placeholder: "https://api.jio-rcs.com/..." },
        ],
        note: "Contact Jio for API access and webhook activation.",
      },
    ],
  },
  {
    group: "SMS",
    color: "#D97706",
    bgColor: "#fef3c7",
    emoji: "📟",
    platforms: [
      {
        id: "fast2sms", name: "Fast2SMS",
        description: "Active SMS channel. DLT-compliant bulk SMS.",
        managed: true, managedLink: "/admin/sms-dashboard",
        fields: [],
      },
    ],
  },
  {
    group: "Email",
    color: "#7C3AED",
    bgColor: "#f3e8ff",
    emoji: "📧",
    platforms: [
      {
        id: "smtp_email", name: "SMTP Email",
        description: "Active email channel. Configured SMTP server.",
        managed: true, managedLink: "/admin/email-dashboard",
        fields: [],
      },
    ],
  },
  {
    group: "Push",
    color: "#EF4444",
    bgColor: "#fee2e2",
    emoji: "🔔",
    platforms: [
      {
        id: "firebase_push", name: "Firebase Push",
        description: "Active push notifications (Android, iOS, Web).",
        managed: true, managedLink: "/admin/api-settings",
        fields: [],
      },
      {
        id: "firebase", name: "Firebase FCM (Direct)",
        description: "Configure Firebase Cloud Messaging directly.",
        fields: [
          { key: "server_key", label: "FCM Server Key", sensitive: true, placeholder: "AAAAabc123..." },
          { key: "project_id", label: "Firebase Project ID", placeholder: "my-firebase-project" },
          { key: "vapid_key", label: "VAPID Key (Web Push)", sensitive: true, placeholder: "BNx..." },
        ],
      },
    ],
  },
  {
    group: "Website",
    color: "#0F766E",
    bgColor: "#ccfbf1",
    emoji: "🌐",
    platforms: [
      { id: "website_contact", name: "Contact Form", builtin: true, description: "Website contact form submissions.", fields: [] },
      { id: "website_booking", name: "Booking Form", builtin: true, description: "Online booking form from the website.", fields: [] },
      { id: "website_support", name: "Support Tickets", builtin: true, description: "Customer support ticket system.", fields: [] },
      { id: "website_inquiry", name: "Package Inquiry", builtin: true, description: "Package inquiry form submissions.", fields: [] },
      { id: "website_livechat", name: "Live Chat", builtin: true, description: "Real-time live chat with website visitors.", fields: [] },
      { id: "website_ai_chat", name: "AI Chatbot", builtin: true, description: "AI assistant for automated customer support.", fields: [] },
    ],
  },
];

const ALL_PLATFORMS = PLATFORM_GROUPS.flatMap(g => g.platforms.map(p => ({ ...p, group: g.group, color: g.color, bgColor: g.bgColor, emoji: g.emoji })));

function getStatus(platformId: string, data: any): { status: string; label: string; color: string } {
  if (!data) return { status: "disconnected", label: "Not Configured", color: "#6b7280" };
  const s = data.status || "disconnected";
  const map: Record<string, { label: string; color: string }> = {
    connected: { label: "Connected", color: "#16a34a" },
    configured: { label: "Configured", color: "#2563eb" },
    error: { label: "Error", color: "#dc2626" },
    disconnected: { label: "Disconnected", color: "#6b7280" },
  };
  return { status: s, label: map[s]?.label ?? s, color: map[s]?.color ?? "#6b7280" };
}

// ── Configure Modal ───────────────────────────────────────────────────────────
function ConfigModal({ platform, onClose, onSaved }: {
  platform: typeof ALL_PLATFORMS[0] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [existing, setExisting] = useState<any>(null);

  useEffect(() => {
    if (!platform || platform.managed || platform.builtin) return;
    fetch(`${API}/api/social-media/platforms/${platform.id}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setExisting(d);
        if (d.extra_fields) setForm(d.extra_fields);
      })
      .catch(() => {});
  }, [platform?.id]);

  const save = async () => {
    if (!platform) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/social-media/platforms/${platform.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: true, extra_fields: form }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Save failed");
      toast({ title: "Saved", description: d.message });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!platform) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/api/social-media/platforms/${platform.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const d = await r.json();
      setTestResult(d);
      if (d.ok) {
        toast({ title: "Test Passed", description: d.message });
        onSaved();
      } else {
        toast({ title: "Test Failed", description: d.message, variant: "destructive" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const setWebhook = async () => {
    if (!platform?.extraAction) return;
    setSettingWebhook(true);
    try {
      const r = await fetch(`${API}${platform.extraAction.endpoint}`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      setTestResult(d);
      if (d.ok) {
        toast({ title: "Webhook Set", description: d.message });
        onSaved();
      } else {
        toast({ title: "Webhook Failed", description: d.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettingWebhook(false);
    }
  };

  if (!platform) return null;
  if (platform.managed) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{platform.name}</DialogTitle></DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            <p>{platform.description}</p>
            <p className="mt-3 font-medium text-green-600">✅ This channel is managed by the existing system.</p>
            <p className="mt-1">Configure it from the dedicated dashboard.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            {platform.managedLink && (
              <Button onClick={() => { window.location.href = platform.managedLink!; }}>
                Open Dashboard →
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (platform.builtin) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{platform.name}</DialogTitle></DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            <p>{platform.description}</p>
            <p className="mt-3 font-medium text-green-600">✅ Built-in to the ERP. No configuration needed.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure {platform.name}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{platform.description}</p>
        </DialogHeader>

        {platform.note && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            ⚠️ {platform.note}
          </div>
        )}

        {platform.fields.length > 0 ? (
          <div className="space-y-3 py-2">
            {platform.fields.map(f => (
              <div key={f.key}>
                <Label className="text-xs font-medium">{f.label}</Label>
                <Input
                  className="mt-1 text-sm font-mono"
                  type={f.sensitive ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={form[f.key] || ""}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No configuration fields required.</p>
        )}

        {platform.webhookUrl && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
            <p className="font-medium text-gray-700 mb-1">🔗 Webhook URL</p>
            <code className="text-blue-700 break-all select-all">{platform.webhookUrl}</code>
            <p className="text-gray-500 mt-1">Add this to your {platform.name} developer console.</p>
          </div>
        )}

        {testResult && (
          <div className={`rounded-lg border p-3 text-xs ${testResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            <p className="font-medium">{testResult.ok ? "✅ Test Passed" : "❌ Test Failed"}</p>
            <p className="mt-1">{testResult.message}</p>
            {testResult.detail && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs opacity-70">Raw response</summary>
                <pre className="text-[10px] mt-1 overflow-auto max-h-24">{JSON.stringify(testResult.detail, null, 2)}</pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {existing?.configured && (
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              {testing ? "Testing…" : "🧪 Test Connection"}
            </Button>
          )}
          {platform.extraAction && existing?.configured && (
            <Button variant="outline" size="sm" onClick={setWebhook} disabled={settingWebhook}>
              {settingWebhook ? "Setting…" : `🔗 ${platform.extraAction.label}`}
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "💾 Save & Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inbox tab ─────────────────────────────────────────────────────────────────
function UnifiedInbox() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ platform: "all", status: "all" });

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filter.platform !== "all") q.set("platform", filter.platform);
    if (filter.status !== "all") q.set("status", filter.status);
    q.set("limit", "50");
    fetch(`${API}/api/social-media/messages?${q}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const platformEmoji: Record<string, string> = {
    telegram_bot: "✈️", telegram_channel: "📢",
    facebook_page: "📘", facebook_messenger: "💬", facebook_leads: "🎯",
    instagram: "📸", instagram_dm: "✉️",
    whatsapp_meta: "📱", website_contact: "🌐",
    website_booking: "📋", website_support: "🎫",
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select className="border rounded px-2 py-1 text-sm" value={filter.platform} onChange={e => setFilter(f => ({ ...f, platform: e.target.value }))}>
          <option value="all">All Platforms</option>
          {["telegram_bot","facebook_messenger","facebook_leads","instagram_dm","whatsapp_meta","website_contact","website_support"].map(p => (
            <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select className="border rounded px-2 py-1 text-sm" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="all">All Status</option>
          <option value="unread">Unread</option>
          <option value="in_progress">In Progress</option>
          <option value="replied">Replied</option>
          <option value="archived">Archived</option>
        </select>
        <Button size="sm" variant="outline" onClick={load}>↻ Refresh</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading messages…</div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">No messages yet. Connect a platform to start receiving messages.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg: any) => (
            <div key={msg.id} className={`border rounded-lg p-3 ${msg.status === "unread" ? "bg-blue-50 border-blue-200" : "bg-white"}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{platformEmoji[msg.platform] || "💬"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{msg.sender_name || msg.sender_id || "Unknown"}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{msg.platform.replace(/_/g, " ")}</Badge>
                    <Badge variant={msg.status === "unread" ? "default" : "secondary"} className="text-[10px] px-1 py-0">{msg.status}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(msg.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1 truncate">{msg.message_text}</p>
                  {msg.sender_phone && <p className="text-xs text-gray-400 mt-0.5">{msg.sender_phone}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/social-media/analytics`, { credentials: "include" })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading analytics…</div>;
  if (!stats) return <div className="text-center py-8 text-muted-foreground text-sm">Failed to load analytics.</div>;

  const channelColors: Record<string, string> = {
    whatsapp: "#25D366", sms: "#D97706", email: "#7C3AED",
    rcs: "#6366F1", push: "#EF4444", wa: "#25D366",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Connected Platforms", value: stats.platforms?.connected ?? 0, color: "#16a34a", icon: "🔗" },
          { label: "Total Messages", value: stats.messages?.total ?? 0, color: "#2563eb", icon: "💬" },
          { label: "Unread Messages", value: stats.messages?.unread ?? 0, color: "#d97706", icon: "📬" },
          { label: "Messages Today", value: stats.messages?.today ?? 0, color: "#7c3aed", icon: "📅" },
        ].map(s => (
          <div key={s.label} className="border rounded-lg p-4 bg-white">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {stats.notifications?.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3">Notification Channel Stats (Last 7 Days)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.notifications.map((n: any) => (
              <div key={n.channel} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm capitalize">{n.channel}</span>
                  <span className="text-xs text-muted-foreground">7d</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>Total</span><span className="font-medium">{n.total}</span></div>
                  <div className="flex justify-between text-green-600"><span>Sent</span><span>{n.sent || 0}</span></div>
                  <div className="flex justify-between text-red-500"><span>Failed</span><span>{n.failed || 0}</span></div>
                </div>
                {parseInt(n.total) > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${Math.round((parseInt(n.sent || 0) / parseInt(n.total)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.byPlatform?.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3">Messages by Platform</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Platform</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Messages</th>
              </tr></thead>
              <tbody>
                {stats.byPlatform.map((p: any) => (
                  <tr key={p.platform} className="border-t">
                    <td className="px-4 py-2 capitalize">{p.platform.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 text-right font-medium">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Social Overview Component ─────────────────────────────────────────────────
const PLATFORM_CONFIGS = [
  {
    key: "facebook",   icon: "📘", label: "Facebook",
    color: "#1877f2", bg: "bg-blue-50",   border: "border-blue-200",
    // Facebook: Followers, Messages, Comments, Leads, Ads performance
    metricsKeys: ["messages30d", "comments30d", "leads", "adsPerformance"],
    metricsLabels: ["Messages (30d)", "Comments (30d)", "Leads", "Ads Sent"],
    showFollowers: true,
  },
  {
    key: "instagram",  icon: "📸", label: "Instagram",
    color: "#e1306c", bg: "bg-pink-50",   border: "border-pink-200",
    // Instagram: Followers, DM count, Comments, Story Replies, Leads
    metricsKeys: ["dmCount30d", "comments30d", "storyReplies30d", "leads"],
    metricsLabels: ["DMs (30d)", "Comments (30d)", "Story Replies (30d)", "Leads"],
    showFollowers: true,
  },
  {
    key: "telegram",   icon: "✈️", label: "Telegram",
    color: "#0088cc", bg: "bg-cyan-50",   border: "border-cyan-200",
    // Telegram: Chats, Subscribers (live API), Bot Messages
    metricsKeys: ["chats", "botMessages", "campaigns"],
    metricsLabels: ["Chats (30d)", "Bot Messages (30d)", "Campaigns"],
    showFollowers: true,
    followersLabel: "Subscribers",
  },
  {
    key: "whatsapp",   icon: "💬", label: "WhatsApp",
    color: "#25d366", bg: "bg-emerald-50", border: "border-emerald-200",
    // WhatsApp: Conversations, Templates sent, Broadcasts, Campaigns
    metricsKeys: ["messages30d", "templatesSent30d", "broadcasts", "campaigns"],
    metricsLabels: ["Conversations (30d)", "Templates Sent (30d)", "Broadcasts", "Campaigns"],
    showFollowers: false,
  },
  {
    key: "sms",        icon: "📱", label: "SMS",
    color: "#2563eb", bg: "bg-blue-50",   border: "border-blue-100",
    // SMS: Sent, Delivered, Failed (from notification_logs)
    metricsKeys: ["sent30d", "delivered30d", "failed30d"],
    metricsLabels: ["Sent (30d)", "Delivered (30d)", "Failed (30d)"],
    showFollowers: false,
  },
  {
    key: "email",      icon: "✉️", label: "Email",
    color: "#7c3aed", bg: "bg-violet-50", border: "border-violet-200",
    // Email: Sent, Opened, Clicked, Bounced (from notification_logs)
    metricsKeys: ["sent30d", "opened30d", "clicked30d", "bounced30d"],
    metricsLabels: ["Sent (30d)", "Opened (30d)", "Clicked (30d)", "Bounced (30d)"],
    showFollowers: false,
  },
];

function SocialOverview() {
  const [omni, setOmni] = useState<any>(null);
  const [social, setSocial] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        fetch(`${API}/api/admin/omni-stats`, { credentials: "include" }).then(r => r.json()),
        fetch(`${API}/api/admin/social-stats`, { credentials: "include" }).then(r => r.json()),
      ]);
      setOmni(o); setSocial(s);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-4 bg-white animate-pulse"><div className="h-8 w-1/2 bg-gray-100 rounded mb-2"/><div className="h-6 w-1/3 bg-gray-100 rounded"/></div>
        ))}
      </div>
    </div>
  );

  const platforms = social?.platforms || {};

  const topCards = omni ? [
    { icon: "📬", label: "Unread Messages",  value: omni.unread,        color: "#2563eb" },
    { icon: "⏳", label: "Pending Reply",     value: omni.pendingReply,  color: "#d97706" },
    { icon: "⚠️", label: "Missed (2h+)",     value: omni.missed,        color: "#dc2626" },
    { icon: "📵", label: "Missed Calls",      value: omni.missedCalls,   color: "#ea580c" },
    { icon: "🎯", label: "Today's Leads",     value: omni.todayLeads,    color: "#7c3aed" },
    { icon: "📊", label: "Total Campaigns",   value: social?.totals?.campaigns ?? 0, color: "#16a34a" },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Summary stat strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {topCards.map(s => (
          <div key={s.label} className="border rounded-xl p-3 bg-white shadow-sm text-center">
            <div className="text-xl mb-0.5">{s.icon}</div>
            <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 6 Per-Platform Stat Widgets */}
      <div>
        <h3 className="font-semibold text-sm mb-3">📡 Per-Platform Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORM_CONFIGS.map(cfg => {
            const p = platforms[cfg.key] || {};
            const deliveryRate = p.deliveryRate;
            return (
              <div key={cfg.key} className={`border ${cfg.border} rounded-xl p-4 ${cfg.bg} bg-opacity-60`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{cfg.icon}</span>
                    <span className="font-bold text-sm">{cfg.label}</span>
                  </div>
                  {cfg.showFollowers && (
                    <span className="text-xs text-muted-foreground bg-white/80 px-2 py-0.5 rounded-full border">
                      👥 {(cfg as any).followersLabel ?? "Followers"}: {p.followers ?? "--"}
                    </span>
                  )}
                  {!cfg.showFollowers && deliveryRate !== null && deliveryRate !== undefined && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${deliveryRate >= 80 ? "bg-green-100 text-green-700" : deliveryRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                      {deliveryRate}% delivery
                    </span>
                  )}
                </div>
                {/* Metrics — 2-col for 4 metrics, 3-col otherwise */}
                <div className={`grid gap-2 ${cfg.metricsKeys.length >= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {cfg.metricsKeys.map((mk, idx) => (
                    <div key={mk} className="text-center">
                      <p className="text-lg font-bold font-mono" style={{ color: cfg.color }}>{p[mk] ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{cfg.metricsLabels[idx]}</p>
                    </div>
                  ))}
                </div>
                {/* Footer: today activity + Configure link */}
                <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between">
                  {cfg.showFollowers && (p.messagesToday ?? 0) > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      <span className="text-green-700 font-semibold">+{p.messagesToday}</span> today
                    </span>
                  ) : <span />}
                  <a
                    href="/admin/social-media"
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                    title={`Configure ${cfg.label}`}
                  >
                    ⚙️ Configure
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by source (30d) */}
        {social?.leadsBySource?.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-3">🎯 Leads by Source — Last 30 Days</h3>
            <div className="border rounded-xl overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Source</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Leads</th>
                </tr></thead>
                <tbody className="divide-y">
                  {social.leadsBySource.slice(0, 10).map((r: any) => (
                    <tr key={r.source} className="hover:bg-gray-50">
                      <td className="px-4 py-2 capitalize">{(r.source || "unknown").replace(/_/g, " ")}</td>
                      <td className="px-4 py-2 text-right font-semibold">{r.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Campaign performance */}
        {social?.campaignsByChannel?.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-3">📣 Campaigns by Channel</h3>
            <div className="border rounded-xl overflow-hidden bg-white divide-y">
              {social.campaignsByChannel.map((r: any) => {
                const delPct = r.total > 0 ? Math.round((r.sent / r.total) * 100) : 0;
                return (
                  <div key={r.channel} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium capitalize">{r.channel}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.cnt} campaigns</span>
                        <span className="text-emerald-700 font-bold">{delPct}% delivered</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${delPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground text-right">Auto-refreshes every 60 seconds · {new Date().toLocaleTimeString("en-IN")}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SocialMediaCenter() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [platformData, setPlatformData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<typeof ALL_PLATFORMS[0] | null>(null);
  const HASH_TO_GROUP: Record<string, string> = {
    instagram: "Instagram", facebook: "Facebook", telegram: "Telegram",
    whatsapp: "WhatsApp", sms: "SMS", email: "Email", rcs: "RCS",
    push: "Push", website: "Website",
  };
  const initialGroup = HASH_TO_GROUP[window.location.hash.replace("#", "").toLowerCase()] ?? null;
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      const g = HASH_TO_GROUP[window.location.hash.replace("#", "").toLowerCase()];
      setActiveGroup(g ?? null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const loadPlatforms = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/social-media/platforms`, { credentials: "include" });
      const d = await r.json();
      const map: Record<string, any> = {};
      [...(d.managed || []), ...(d.website || []), ...(d.custom || [])].forEach((p: any) => {
        map[p.platform] = p;
      });
      setPlatformData(map);
    } catch (e: any) {
      console.error("Failed to load platforms:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  const disconnect = async (platformId: string, platformName: string) => {
    if (!confirm(`Disconnect ${platformName}?`)) return;
    setDisconnecting(platformId);
    try {
      const r = await fetch(`${API}/api/social-media/platforms/${platformId}/disconnect`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Disconnected", description: `${platformName} disconnected.` });
        loadPlatforms();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  const filteredGroups = activeGroup
    ? PLATFORM_GROUPS.filter(g => g.group === activeGroup)
    : PLATFORM_GROUPS;

  const connectedCount = Object.values(platformData).filter(p => p.status === "connected" || p.status === "configured").length;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔗 Social Media Integration Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect and manage all communication channels from one dashboard.
              Every button performs a real action.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-center bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-xl font-bold text-green-700">{connectedCount}</div>
              <div className="text-[10px] text-green-600">Connected</div>
            </div>
            <div className="text-center bg-gray-50 border rounded-lg px-4 py-2">
              <div className="text-xl font-bold text-gray-700">{ALL_PLATFORMS.length}</div>
              <div className="text-[10px] text-gray-500">Total</div>
            </div>
            <Button variant="outline" size="sm" onClick={loadPlatforms} disabled={loading}>
              ↻ Refresh
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">📊 Overview</TabsTrigger>
            <TabsTrigger value="platforms">📡 Platforms</TabsTrigger>
            <TabsTrigger value="inbox">📬 Unified Inbox</TabsTrigger>
            <TabsTrigger value="analytics">📈 Analytics</TabsTrigger>
          </TabsList>

          {/* ── Overview tab ──────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4">
            <SocialOverview />
          </TabsContent>

          {/* ── Platforms tab ─────────────────────────────────────────────── */}
          <TabsContent value="platforms" className="space-y-4 mt-4">

            {/* Group filter */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveGroup(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!activeGroup ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              >
                All
              </button>
              {PLATFORM_GROUPS.map(g => (
                <button
                  key={g.group}
                  onClick={() => setActiveGroup(activeGroup === g.group ? null : g.group)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${activeGroup === g.group ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                  style={activeGroup === g.group ? { backgroundColor: g.color } : {}}
                >
                  {g.emoji} {g.group}
                </button>
              ))}
            </div>

            {/* Platform groups */}
            {filteredGroups.map(group => (
              <div key={group.group}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{group.emoji}</span>
                  <h2 className="font-semibold text-sm text-gray-800">{group.group}</h2>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.platforms.map(p => {
                    const data = platformData[p.id];
                    const { status, label, color } = getStatus(p.id, data);
                    const pFull = { ...p, group: group.group, color: group.color, bgColor: group.bgColor, emoji: group.emoji };
                    const isManaged = (p as any).managed || (p as any).builtin;
                    const isConnected = status === "connected" || status === "configured";

                    return (
                      <div
                        key={p.id}
                        className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                      >
                        {/* Card header */}
                        <div className="p-3 flex items-start gap-3" style={{ backgroundColor: group.bgColor }}>
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                            style={{ backgroundColor: group.color }}
                          >
                            {group.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate">{p.name}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-xs" style={{ color }}>{label}</span>
                            </div>
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="p-3 space-y-2">
                          <p className="text-xs text-gray-500 leading-relaxed">{p.description}</p>

                          {(p as any).note && (
                            <p className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">⚠️ {(p as any).note}</p>
                          )}

                          {isManaged && (
                            <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
                              <span>✅</span>
                              <span>{(p as any).builtin ? "Built-in — Always Active" : "Managed by ERP — Active"}</span>
                            </div>
                          )}

                          {data?.last_tested && (
                            <p className="text-[10px] text-gray-400">
                              Last tested: {new Date(data.last_tested).toLocaleString()}
                            </p>
                          )}

                          {(p as any).webhookUrl && data?.webhook_verified && (
                            <p className="text-[10px] text-green-600">✔ Webhook verified</p>
                          )}

                          {/* Buttons */}
                          <div className="flex gap-1.5 flex-wrap pt-1">
                            <Button
                              size="sm"
                              variant={isConnected ? "outline" : "default"}
                              className="text-xs h-7 px-2 flex-1"
                              style={!isConnected ? { backgroundColor: group.color } : {}}
                              onClick={() => setConfiguring(pFull as any)}
                            >
                              {isConnected ? "⚙ Settings" : "Connect"}
                            </Button>

                            {isConnected && !isManaged && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 px-2"
                                  disabled={disconnecting === p.id}
                                  onClick={() => disconnect(p.id, p.name)}
                                >
                                  Disconnect
                                </Button>
                              </>
                            )}

                            {(p as any).managed && (p as any).managedLink && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => window.location.href = (p as any).managedLink}
                              >
                                Dashboard →
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ── Unified Inbox ─────────────────────────────────────────────── */}
          <TabsContent value="inbox" className="mt-4">
            <UnifiedInbox />
          </TabsContent>

          {/* ── Analytics ────────────────────────────────────────────────── */}
          <TabsContent value="analytics" className="mt-4">
            <AnalyticsTab />
          </TabsContent>
        </Tabs>

        {/* Configure Modal */}
        {configuring && (
          <ConfigModal
            platform={configuring}
            onClose={() => setConfiguring(null)}
            onSaved={() => { loadPlatforms(); setConfiguring(null); }}
          />
        )}
      </div>
    </AdminLayout>
  );
}
