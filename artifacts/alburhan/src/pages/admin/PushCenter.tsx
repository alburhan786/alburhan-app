import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useFCM } from "@/hooks/useFCM";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BellOff, CheckCircle2, XCircle, Loader2, Send,
  Smartphone, Users, Radio, RefreshCw, Shield, ChevronDown,
  Wifi, WifiOff, Clock, Zap, BarChart2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = import.meta.env.VITE_API_URL || "";

const AUDIENCE_OPTIONS = [
  { value: "all",             label: "Everyone",        icon: "🌐", desc: "All registered devices" },
  { value: "customers",       label: "Customers",       icon: "👤", desc: "Customer portal users" },
  { value: "admin",           label: "Admins",          icon: "🛡️", desc: "Admin & super admin" },
  { value: "staff",           label: "Staff",           icon: "👷", desc: "Staff portal users" },
  { value: "agent",           label: "Agents",          icon: "🤝", desc: "Agent portal users" },
  { value: "branch_manager",  label: "Branch Managers", icon: "🏢", desc: "Branch portal users" },
  { value: "hajj",            label: "Hajj Pilgrims",   icon: "🕋", desc: "Customers with Hajj bookings" },
  { value: "umrah",           label: "Umrah Pilgrims",  icon: "🕌", desc: "Customers with Umrah bookings" },
  { value: "payment_pending", label: "Balance Due",     icon: "💳", desc: "Customers with pending payments" },
];

interface FcmStatus {
  configured: boolean;
  project_id: string | null;
  unique_subscribers: number;
  total_tokens: number;
  by_user_type: { user_type: string; users: number }[];
  missing_server_keys?: string[];
  last_test_at: string | null;
}

interface Campaign {
  id: string;
  title: string;
  body: string;
  filter: string;
  total_tokens: number;
  sent: number;
  failed: number;
  status: string;
  error?: string;
  sent_at: string;
}

export default function PushCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { permission, token, isRegistered, isLoading: fcmLoading, error: fcmError, requestPermission, unregister } = useFCM(user?.role || "admin");

  const [status, setStatus]           = useState<FcmStatus | null>(null);
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult]   = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connResult, setConnResult]   = useState<{ ok: boolean; projectId?: string; clientEmail?: string; message?: string; error?: string; hint?: string } | null>(null);

  const [form, setForm] = useState({
    title: "",
    body: "",
    url: "",
    filter: "all",
  });

  const [sending, setSending] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [s, c] = await Promise.all([
        fetch(`${API}/api/push/fcm-status`, { credentials: "include" }).then(r => r.json()),
        fetch(`${API}/api/push/campaigns?limit=10`, { credentials: "include" }).then(r => r.json()),
      ]);
      setStatus(s);
      setCampaigns(c.campaigns || []);
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const fetchAudienceCount = useCallback(async (filter: string) => {
    setCountLoading(true);
    setAudienceCount(null);
    try {
      const r = await fetch(`${API}/api/push/audience-count?filter=${encodeURIComponent(filter)}`, { credentials: "include" });
      const d = await r.json();
      setAudienceCount(d.count ?? 0);
    } catch { setAudienceCount(0); }
    finally { setCountLoading(false); }
  }, []);

  useEffect(() => { fetchAudienceCount(form.filter); }, [form.filter, fetchAudienceCount]);

  const sendTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/api/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: token || undefined }),
      });
      const d = await r.json();
      setTestResult(d);
      if (d.ok) toast({ title: "✓ Test notification sent!", description: d.message });
      else toast({ title: "Test failed", description: d.error, variant: "destructive" });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTestLoading(false);
    }
  };

  const sendBroadcast = async () => {
    if (!form.title || !form.body) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`${API}/api/push/send-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, url: form.url || "/customer/dashboard" }),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "✓ Broadcast queued", description: "Sending in background — check campaign history" });
        setForm(f => ({ ...f, title: "", body: "", url: "" }));
        setTimeout(loadStatus, 3000);
      } else {
        toast({ title: "Broadcast failed", description: d.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      toast({ title: "Token copied to clipboard" });
    }
  };

  const testConnection = async () => {
    setConnTesting(true);
    setConnResult(null);
    try {
      const r = await fetch(`${API}/api/push/test-connection`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      setConnResult(d);
    } catch (e: any) {
      setConnResult({ ok: false, error: e.message });
    } finally {
      setConnTesting(false);
    }
  };

  const permLabel = permission === "granted" ? "Enabled" :
                    permission === "denied"  ? "Blocked" :
                    permission === "default" ? "Not enabled" :
                    permission === "not_configured" ? "Firebase not configured" :
                    permission === "unsupported" ? "Not supported" : "…";

  const permColor = permission === "granted" ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
                    permission === "denied"  ? "text-red-600 bg-red-50 border-red-200" :
                    "text-amber-600 bg-amber-50 border-amber-200";

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6 text-violet-500" />
              Push Notification Center
            </h1>
            <p className="text-sm text-gray-500 mt-1">Firebase Cloud Messaging — manage push subscriptions, send broadcasts, and test delivery</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={loadingStatus}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loadingStatus ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Row 1: FCM Status + This Browser */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* FCM Backend Status */}
          <div className="bg-white border rounded-xl p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Firebase Configuration</p>
            {loadingStatus ? (
              <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : status ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {status.configured ? (
                    <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <Wifi className="w-4 h-4" /> Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <WifiOff className="w-4 h-4" /> Not configured
                    </span>
                  )}
                </div>

                {!status.configured && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                    {status.missing_server_keys?.length > 0 ? (
                      <>
                        <p className="font-semibold">Missing server-side secrets ({status.missing_server_keys.length}):</p>
                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                          {status.missing_server_keys.map((k: string) => (
                            <li key={k} className="text-red-700 font-bold">{k}</li>
                          ))}
                        </ul>
                        <p className="mt-1 text-[11px]">Add these in Replit Secrets, then rebuild and redeploy to activate FCM.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">Set these environment secrets to activate FCM:</p>
                        <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                          <li>FIREBASE_PROJECT_ID</li>
                          <li>FIREBASE_CLIENT_EMAIL</li>
                          <li>FIREBASE_PRIVATE_KEY</li>
                          <li>VITE_FIREBASE_API_KEY</li>
                          <li>VITE_FIREBASE_AUTH_DOMAIN</li>
                          <li>VITE_FIREBASE_PROJECT_ID</li>
                          <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
                          <li>VITE_FIREBASE_APP_ID</li>
                          <li>VITE_FIREBASE_VAPID_KEY</li>
                        </ul>
                        <p className="mt-1.5 text-[11px]">Get these from Firebase Console → Project Settings → Service accounts + Web app config.</p>
                      </>
                    )}
                  </div>
                )}

                {status.configured && (
                  <>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 space-y-0.5">
                      <p className="text-xs text-emerald-700 font-mono">
                        <span className="font-semibold text-emerald-800">Project:</span> {status.project_id || "—"}
                      </p>
                      <p className="text-xs text-gray-600">
                        FCM Status: <span className="text-emerald-700 font-semibold">Active</span>
                        {status.last_test_at && (
                          <> &nbsp;·&nbsp; Last push: {new Date(status.last_test_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>
                        )}
                      </p>
                    </div>
                  </>
                )}

                {/* Test FCM Connection button — validates OAuth2 token exchange */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={testConnection}
                    disabled={connTesting}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {connTesting
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Wifi className="w-3.5 h-3.5" />}
                    Test FCM Connection
                  </Button>
                  {connResult && (
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${connResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                      {connResult.ok ? "✅" : "❌"}
                      {connResult.ok
                        ? `${connResult.projectId ?? "OK"}`
                        : (connResult.error || "Failed")}
                    </span>
                  )}
                </div>
                {connResult && !connResult.ok && connResult.hint && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    💡 {connResult.hint}
                  </p>
                )}
                {connResult && connResult.ok && connResult.clientEmail && (
                  <p className="text-[11px] text-emerald-700 font-mono">{connResult.clientEmail}</p>
                )}

                {status.configured && (
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div className="bg-violet-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-violet-700">{status.unique_subscribers}</p>
                      <p className="text-xs text-gray-500">Subscribers</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-indigo-700">{status.total_tokens}</p>
                      <p className="text-xs text-gray-500">Devices</p>
                    </div>
                  </div>
                )}

                {status.by_user_type.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {status.by_user_type.map(t => (
                      <div key={t.user_type} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 w-28 capitalize">{t.user_type.replace("_", " ")}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-violet-400 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, (t.users / (status?.unique_subscribers || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-gray-600 text-xs font-medium">{t.users}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Could not load status</p>
            )}
          </div>

          {/* This Browser */}
          <div className="bg-white border rounded-xl p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">This Browser</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Push status</span>
                <span className={`text-xs px-2 py-1 rounded-full border font-medium ${permColor}`}>
                  {permLabel}
                </span>
              </div>

              {permission === "not_configured" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Firebase environment variables are not set. Push notifications cannot be enabled until the server is configured.
                </p>
              )}

              {permission === "denied" && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Push notifications are blocked in your browser. Open browser settings → Site permissions → Notifications and allow this site, then reload.
                </p>
              )}

              {fcmError && permission !== "denied" && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fcmError}</p>
              )}

              {permission === "granted" && token && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Registered — receiving push notifications
                  </p>
                  <p className="text-[10px] font-mono text-gray-400 truncate">{token.slice(0, 40)}…</p>
                  <button onClick={copyToken} className="flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800">
                    <Copy className="w-3 h-3" /> Copy full token
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                {(permission === "default" || permission === "not_configured" === false) && permission !== "granted" && permission !== "denied" && permission !== "unsupported" && (
                  <Button size="sm" onClick={requestPermission} disabled={fcmLoading || permission === "not_configured"} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                    {fcmLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Bell className="w-4 h-4 mr-1" />}
                    Enable Notifications
                  </Button>
                )}
                {permission === "granted" && isRegistered && (
                  <Button size="sm" variant="outline" onClick={unregister} className="flex-1 text-red-500 border-red-200 hover:bg-red-50">
                    <BellOff className="w-4 h-4 mr-1" /> Disable
                  </Button>
                )}
              </div>

              {/* Test notification */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 mb-2">Send a test push to this device</p>
                <Button
                  size="sm"
                  onClick={sendTest}
                  disabled={testLoading || permission !== "granted"}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                >
                  {testLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending…</>
                    : <><Zap className="w-4 h-4 mr-1" /> Send Test Notification</>}
                </Button>
                {testResult && (
                  <div className={`mt-2 flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${testResult.ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200"}`}>
                    {testResult.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                    <span>{testResult.ok ? testResult.message : testResult.error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Broadcast */}
        <div className="bg-white border rounded-xl p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-500" /> Broadcast Push Notification
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Form */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Audience</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {AUDIENCE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm(f => ({ ...f, filter: opt.value }))}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                        form.filter === opt.value
                          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {countLoading
                    ? <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Counting…</span>
                    : <span className="text-xs text-gray-500">
                        Estimated reach: <span className="font-semibold text-violet-700">{audienceCount ?? "…"}</span> device{audienceCount !== 1 ? "s" : ""}
                      </span>}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Title <span className="text-red-400">*</span></label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Visa Ready! Your documents are available"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                  maxLength={100}
                />
                <p className="text-right text-[10px] text-gray-400 mt-0.5">{form.title.length}/100</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Message <span className="text-red-400">*</span></label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="e.g. Assalamu Alaikum! Your visa for Hajj 2026 has been approved. Log in to download your documents."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                  maxLength={300}
                />
                <p className="text-right text-[10px] text-gray-400 mt-0.5">{form.body.length}/300</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Click URL <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="/customer/dashboard"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 font-mono"
                />
              </div>

              <Button
                onClick={sendBroadcast}
                disabled={sending || !form.title || !form.body || !status?.configured}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 py-2.5"
              >
                {sending
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending broadcast…</>
                  : <><Send className="w-4 h-4 mr-2" /> Send to {audienceCount ?? "…"} device{audienceCount !== 1 ? "s" : ""}</>}
              </Button>

              {!status?.configured && (
                <p className="text-xs text-amber-600 text-center">Configure Firebase credentials first to enable broadcasts</p>
              )}
            </div>

            {/* Right: Preview */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notification Preview</label>
              <div className="bg-gray-900 rounded-xl p-4 min-h-40">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-800 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">ABT</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white text-sm font-semibold truncate">
                        {form.title || <span className="text-gray-500 italic font-normal">Notification title…</span>}
                      </p>
                      <span className="text-gray-500 text-[10px] flex-shrink-0">now</span>
                    </div>
                    <p className="text-gray-300 text-xs mt-1 leading-relaxed line-clamp-3">
                      {form.body || <span className="text-gray-600 italic">Your message will appear here…</span>}
                    </p>
                    {form.url && (
                      <p className="text-gray-500 text-[10px] mt-1 font-mono truncate">{form.url}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick templates */}
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500">Quick templates</p>
                {[
                  { title: "🛂 Visa Ready", body: "Assalamu Alaikum! Your visa has been approved. Log in to download your travel documents.", url: "/customer/dashboard" },
                  { title: "✈️ Departure Reminder", body: "Your journey departs soon! Please ensure all documents are ready and arrive at the airport 3 hours early.", url: "/customer/dashboard" },
                  { title: "💰 Balance Payment Due", body: "Gentle reminder: your booking balance payment is due soon. Please complete your payment to secure your seat.", url: "/customer/dashboard" },
                ].map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => setForm(f => ({ ...f, title: tpl.title, body: tpl.body, url: tpl.url }))}
                    className="w-full text-left border rounded-lg px-3 py-2 text-xs hover:border-violet-300 hover:bg-violet-50 transition-colors"
                  >
                    <p className="font-medium text-gray-700">{tpl.title}</p>
                    <p className="text-gray-400 truncate mt-0.5">{tpl.body.slice(0, 60)}…</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Campaign History */}
        <div className="bg-white border rounded-xl">
          <button
            onClick={() => setShowCampaigns(!showCampaigns)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-500" /> Campaign History
              {campaigns.length > 0 && <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{campaigns.length}</span>}
            </p>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCampaigns ? "rotate-180" : ""}`} />
          </button>

          {showCampaigns && (
            <div className="border-t overflow-x-auto">
              {campaigns.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No campaigns yet — send a broadcast above</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Title</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Audience</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Devices</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Sent</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Failed</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 truncate max-w-[200px]">{c.title}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.body}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
                            {c.filter.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{c.total_tokens}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-emerald-600 font-semibold">{c.sent}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={c.failed > 0 ? "text-red-500 font-semibold" : "text-gray-400"}>{c.failed}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            c.status === "failed"    ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(c.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Help */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> How push notifications work</p>
          <ul className="space-y-1 list-disc pl-4 text-blue-700">
            <li>Customers, staff, agents, and branch managers all need to click "Enable Notifications" once after logging in</li>
            <li>Notifications are sent automatically for key events: booking confirmed, payment received, visa ready, flight issued, etc.</li>
            <li>Background delivery works even when the app tab is not open (Chrome and Edge)</li>
            <li>iOS Safari requires iOS 16.4+ with the app added to Home Screen</li>
          </ul>
        </div>

      </div>
    </AdminLayout>
  );
}
