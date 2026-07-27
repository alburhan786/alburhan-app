// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  Bell, CheckCircle2, XCircle, Clock, RefreshCw, Send, MessageSquare,
  Mail, Smartphone, ChevronDown, ChevronRight, Search, RotateCcw,
  Loader2, AlertTriangle, Activity, Filter, Zap, Users, Target,
  BellRing, TestTube2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface NotifLog {
  id: string; event_type: string; channel: string; recipient: string;
  message?: string; status: string; sent_at: string; retry_count: number;
  error_code?: string; provider_name?: string; http_status?: number;
  provider_response?: any; booking_id?: string; customer_id?: string;
  booking_number?: string; customer_name?: string;
}
interface Stats {
  sent: number; delivered: number; failed: number; pending: number;
  deliveryRate: number; channelStats: Record<string, Record<string, number>>;
  allTime: { total: string; total_sent: string };
  retryQueue?: number;
}
interface Campaign {
  id: string; title: string; body: string; url?: string; filter: string;
  total_tokens: number; sent: number; failed: number; status: string;
  error?: string; sent_at: string;
}
interface FCMStatus {
  configured: boolean;
  project_id: string | null;
  unique_subscribers: number;
  total_tokens: number;
  missing_server_keys?: string[];
  last_test_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const AUDIENCE_FILTERS = [
  { value: "all",              label: "Everyone",             icon: "🌐", group: "all" },
  { value: "customers",        label: "All Customers",        icon: "👥", group: "users" },
  { value: "admin",            label: "Admin Team",           icon: "🛡️", group: "users" },
  { value: "staff",            label: "Staff",                icon: "👔", group: "users" },
  { value: "agent",            label: "Agents",               icon: "🤝", group: "users" },
  { value: "branch_manager",   label: "Branch Managers",      icon: "🏢", group: "users" },
  { value: "finance",          label: "Finance Team",         icon: "💼", group: "users" },
  { value: "individual",       label: "Specific Person",      icon: "👤", group: "users" },
  { value: "hajj",             label: "Hajj Pilgrims",        icon: "🕋", group: "travel" },
  { value: "umrah",            label: "Umrah Pilgrims",       icon: "🌙", group: "travel" },
  { value: "payment_pending",  label: "Payment Pending",      icon: "💰", group: "travel" },
  { value: "visa_ready",       label: "Visa Ready",           icon: "🛂", group: "travel" },
  { value: "ticket_issued",    label: "Ticket Issued",        icon: "✈️", group: "travel" },
  { value: "agreement_signed", label: "Agreement Signed",     icon: "📝", group: "travel" },
];

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare size={13} className="text-emerald-600" />,
  email:    <Mail size={13} className="text-blue-600" />,
  sms:      <Smartphone size={13} className="text-purple-600" />,
  push:     <Bell size={13} className="text-amber-600" />,
};
const STATUS_COLORS: Record<string, string> = {
  sent:               "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered:          "bg-blue-100 text-blue-700 border-blue-200",
  failed:             "bg-red-100 text-red-700 border-red-200",
  pending:            "bg-amber-100 text-amber-700 border-amber-200",
  completed:          "bg-emerald-100 text-emerald-700 border-emerald-200",
  permanently_failed: "bg-gray-100 text-gray-600 border-gray-200",
};
const PAGE_SIZE = 30;

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

// ── Log row component ─────────────────────────────────────────────────────────
function LogRow({ log, onRetry, retrying }: { log: NotifLog; onRetry: (id: string) => void; retrying: boolean }) {
  const [expanded, setExpanded] = useState(false);
  let respStr = "";
  try { respStr = typeof log.provider_response === "string" ? log.provider_response : JSON.stringify(log.provider_response, null, 2); } catch { respStr = String(log.provider_response); }

  return (
    <div className={`rounded-lg border text-sm transition-all ${log.status === "failed" ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <span className="shrink-0">{CHANNEL_ICONS[log.channel] || <Bell size={13} />}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-600"}`}>
          {log.status?.replace("_", " ").toUpperCase()}
        </span>
        <span className="font-medium text-gray-800 truncate max-w-[160px]">{log.event_type?.replace(/_/g, " ")}</span>
        <span className="text-gray-500 truncate flex-1 min-w-0 text-[11px]">{log.recipient}</span>
        {log.customer_name && <span className="text-[10px] text-blue-600 shrink-0 hidden sm:block">{log.customer_name}</span>}
        {log.booking_number && <span className="text-[10px] text-gray-400 shrink-0">{log.booking_number}</span>}
        <span className="text-[10px] text-gray-400 shrink-0">{fmt(log.sent_at)}</span>
        {log.retry_count > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1 shrink-0">↻{log.retry_count}</span>}
        {log.status === "failed" && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] border-red-300 text-red-600 hover:bg-red-50 shrink-0"
            onClick={e => { e.stopPropagation(); onRetry(log.id); }} disabled={retrying}>
            {retrying ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
          </Button>
        )}
        {expanded ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 mt-1 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600">
            {log.booking_id && <span><b>Booking ID:</b> {log.booking_id}</span>}
            {log.provider_name && <span><b>Provider:</b> {log.provider_name}</span>}
            {log.http_status && <span><b>HTTP:</b> {log.http_status}</span>}
            {log.retry_count !== undefined && <span><b>Retries:</b> {log.retry_count} / 5</span>}
            {log.error_code && <span className="col-span-2 text-red-600"><b>Error:</b> {log.error_code}</span>}
          </div>
          {log.message && <div className="text-[11px] text-gray-700 bg-gray-50 rounded p-2 font-mono whitespace-pre-wrap break-all">{log.message}</div>}
          {respStr && (
            <details className="text-[10px]">
              <summary className="cursor-pointer text-indigo-600 font-semibold">Provider Response</summary>
              <pre className="mt-1 bg-gray-800 text-green-300 rounded p-2 overflow-auto max-h-36 text-[10px]">{respStr}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelStat({ icon, label, sent, failed }: { icon: React.ReactNode; label: string; sent: number; failed: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <div className="text-2xl">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-emerald-600 font-bold">✓ {sent}</span>
          {failed > 0 && <span className="text-xs text-red-500 font-bold">✗ {failed}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Campaign row ──────────────────────────────────────────────────────────────
function CampaignRow({ campaign, onRetry, retrying }: { campaign: Campaign; onRetry: (id: string) => void; retrying: boolean }) {
  const aud = AUDIENCE_FILTERS.find(f => f.value === campaign.filter);
  const successRate = campaign.total_tokens > 0
    ? Math.round((campaign.sent / campaign.total_tokens) * 100)
    : 0;
  return (
    <div className="grid grid-cols-12 items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50/50">
      <div className="col-span-4 min-w-0">
        <div className="font-medium text-gray-900 truncate">{campaign.title}</div>
        <div className="text-[11px] text-gray-500 truncate">{campaign.body}</div>
      </div>
      <div className="col-span-2">
        <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-medium">
          {aud ? `${aud.icon} ${aud.label}` : campaign.filter}
        </span>
      </div>
      <div className="col-span-2 text-center">
        <div className="text-xs font-bold text-gray-700">{campaign.total_tokens}</div>
        <div className="text-[10px] text-gray-400">recipients</div>
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <span className="text-xs text-emerald-600 font-bold">✓{campaign.sent}</span>
        {campaign.failed > 0 && <span className="text-xs text-red-500 font-bold">✗{campaign.failed}</span>}
        {campaign.total_tokens > 0 && (
          <span className="text-[10px] text-gray-400">({successRate}%)</span>
        )}
      </div>
      <div className="col-span-1">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_COLORS[campaign.status] || "bg-gray-100"}`}>
          {campaign.status}
        </span>
      </div>
      <div className="col-span-1 flex items-center justify-end gap-1">
        <span className="text-[10px] text-gray-400 hidden lg:block">{fmt(campaign.sent_at)}</span>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] shrink-0"
          onClick={() => onRetry(campaign.id)} disabled={retrying}>
          {retrying ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotificationCenter() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"push" | "logs">("push");

  // ── Push state ──────────────────────────────────────────────────────────────
  const [fcmStatus, setFcmStatus] = useState<FCMStatus | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [retryingCampaign, setRetryingCampaign] = useState<string | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const [pushForm, setPushForm] = useState({
    title: "",
    body: "",
    url: "",
    imageUrl: "",
    filter: "all",
  });

  // ── Individual user search state ─────────────────────────────────────────────
  const [indSearch, setIndSearch]   = useState("");
  const [indResults, setIndResults] = useState<Array<{ id: string; name: string; mobile: string; role: string; token_count: number }>>([]);
  const [indUser, setIndUser]       = useState<{ id: string; name: string; mobile: string; role: string } | null>(null);
  const [indSearching, setIndSearching] = useState(false);

  // ── Logs state ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState({ channel: "", status: "", event: "", search: "", date: "" });

  // ── Fetch FCM status ────────────────────────────────────────────────────────
  const fetchFCMStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/push/fcm-status`, { credentials: "include" });
      if (res.ok) setFcmStatus(await res.json());
    } catch {}
  }, []);

  // ── Fetch campaigns ─────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const res = await fetch(`${API}/api/push/campaigns?limit=20`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setCampaigns(d.campaigns || []); }
    } catch {} finally { setCampaignsLoading(false); }
  }, []);

  // ── Audience preview ────────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAudienceLoading(true);
      try {
        const res = await fetch(`${API}/api/push/audience-count?filter=${encodeURIComponent(pushForm.filter)}`, { credentials: "include" });
        if (res.ok) { const d = await res.json(); setAudienceCount(d.count); }
      } catch {} finally { setAudienceLoading(false); }
    }, 400);
  }, [pushForm.filter]);

  // ── Individual user search ──────────────────────────────────────────────────
  useEffect(() => {
    if (pushForm.filter !== "individual") { setIndResults([]); return; }
    if (!indSearch.trim() || indSearch.trim().length < 2) { setIndResults([]); return; }
    const t = setTimeout(async () => {
      setIndSearching(true);
      try {
        const res = await fetch(`${API}/api/push/search-users?q=${encodeURIComponent(indSearch.trim())}`, { credentials: "include" });
        if (res.ok) { const d = await res.json(); setIndResults(d.users || []); }
      } catch {} finally { setIndSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [indSearch, pushForm.filter]);

  // ── Send push ───────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!pushForm.title.trim() || !pushForm.body.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" }); return;
    }
    if (!fcmStatus?.configured) {
      toast({ title: "Firebase not configured", description: "Add Firebase credentials in Replit Secrets first.", variant: "destructive" }); return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API}/api/push/send-all`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pushForm.title, body: pushForm.body,
          url:   pushForm.url   || undefined,
          filter: pushForm.filter === "individual" && indUser ? `individual:${indUser.id}` : pushForm.filter,
          data:  pushForm.imageUrl ? { imageUrl: pushForm.imageUrl } : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "🚀 Campaign started!", description: `Sending to ${audienceCount ?? "?"} subscribers. Check the table below for results.` });
        setPushForm(f => ({ ...f, title: "", body: "", url: "", imageUrl: "" }));
        setTimeout(fetchCampaigns, 3000);
        setTimeout(fetchCampaigns, 8000);
      } else {
        toast({ title: "Send failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Network error", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  // ── Test notification ────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/push/test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "✅ Test sent!", description: data.message });
      } else {
        toast({ title: "Test failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Test error", description: err.message, variant: "destructive" });
    } finally { setTesting(false); }
  };

  // ── Retry campaign ───────────────────────────────────────────────────────────
  const handleRetryCampaign = async (id: string) => {
    setRetryingCampaign(id);
    try {
      const res = await fetch(`${API}/api/push/retry/${id}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "↻ Retry started", description: "Check campaigns list in a few seconds." });
        setTimeout(fetchCampaigns, 5000);
      } else {
        toast({ title: "Retry failed", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Retry error", description: err.message, variant: "destructive" });
    } finally { setRetryingCampaign(null); }
  };

  // ── Notification logs ────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/notification-center/stats`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const rqRes = await fetch(`${API}/api/notification-center/retry-queue-count`, { credentials: "include" }).catch(() => null);
      const rqData = rqRes?.ok ? await rqRes.json() : null;
      setStats({ ...data, retryQueue: rqData?.count ?? 0 });
    } catch {}
  }, []);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(PAGE_SIZE) });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status)  params.set("status", filters.status);
      if (filters.event)   params.set("event", filters.event);
      if (filters.search)  params.set("search", filters.search);
      if (filters.date)    params.set("date", filters.date);
      const res = await fetch(`${API}/api/notification-center/logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []); setTotal(data.total || 0); setPages(data.pages || 1);
    } catch (err: any) {
      toast({ title: "Failed to load logs", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [filters, toast]);

  const handleRetryLog = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await fetch(`${API}/api/notification-center/retry/${id}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.success || res.ok) {
        toast({ title: "Retried", description: "Notification queued for retry." });
        fetchLogs(page); fetchStats();
      } else {
        toast({ title: "Retry failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Retry error", description: err.message, variant: "destructive" });
    } finally { setRetryingId(null); }
  };

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => { fetchFCMStatus(); fetchCampaigns(); }, []);
  useEffect(() => { if (activeTab === "logs") { setPage(1); fetchLogs(1); fetchStats(); } }, [activeTab, filters]);
  useEffect(() => { if (activeTab === "logs") fetchLogs(page); }, [page]);

  const waStats  = stats?.channelStats?.whatsapp || {};
  const smsStats = stats?.channelStats?.sms || {};
  const emlStats = stats?.channelStats?.email || {};
  const waSent   = (waStats.sent || 0) + (waStats.delivered || 0);
  const smsSent  = (smsStats.sent || 0) + (smsStats.delivered || 0);
  const emlSent  = (emlStats.sent || 0) + (emlStats.delivered || 0);

  const selectedAud = AUDIENCE_FILTERS.find(f => f.value === pushForm.filter);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={22} className="text-primary" /> Notification Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Firebase Cloud Messaging push alerts + full delivery history
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchFCMStatus(); fetchCampaigns(); fetchStats(); }}>
              <RefreshCw size={14} className="mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "push" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("push")}
          >
            <BellRing size={14} /> Push Notifications
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "logs" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("logs")}
          >
            <Activity size={14} /> Notification Logs
          </button>
        </div>

        {/* ══ PUSH NOTIFICATIONS TAB ══════════════════════════════════════════ */}
        {activeTab === "push" && (
          <div className="space-y-4">
            {/* FCM Status Card */}
            <div className={`rounded-xl border-2 p-4 ${fcmStatus?.configured ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold ${fcmStatus?.configured ? "bg-emerald-500" : "bg-amber-400"}`}>
                    {fcmStatus?.configured ? "🔥" : "⚙️"}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      Firebase Cloud Messaging
                      {fcmStatus?.configured
                        ? <span className="text-[11px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">✓ CONFIGURED</span>
                        : <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-bold">NOT CONFIGURED</span>
                      }
                    </div>
                    {fcmStatus?.configured ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-sm text-emerald-700">
                          <b>{fcmStatus.unique_subscribers}</b> subscribers &nbsp;·&nbsp; <b>{fcmStatus.total_tokens}</b> devices
                        </p>
                        <p className="text-xs text-emerald-600 font-mono">
                          Project: {fcmStatus.project_id || "—"}
                        </p>
                        <p className="text-xs text-gray-500">
                          FCM Status: <span className="text-emerald-600 font-semibold">Active</span>
                          {fcmStatus.last_test_at && (
                            <> &nbsp;·&nbsp; Last push: {new Date(fcmStatus.last_test_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-700 mt-0.5">
                        Add <b>FIREBASE_PROJECT_ID</b>, <b>FIREBASE_CLIENT_EMAIL</b>, <b>FIREBASE_PRIVATE_KEY</b>,
                        and <b>VITE_FIREBASE_*</b> keys to Replit Secrets to enable FCM.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm" variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-white shrink-0"
                  onClick={handleTest} disabled={testing || !fcmStatus?.configured}
                >
                  {testing ? <Loader2 size={13} className="animate-spin mr-1" /> : <TestTube2 size={13} className="mr-1" />}
                  Send Test Notification
                </Button>
              </div>

              {!fcmStatus?.configured && (
                <div className="mt-3 bg-white/70 rounded-lg p-3 text-xs text-gray-600 space-y-1 border border-amber-200">
                  <p className="font-semibold text-gray-800">🔧 Setup checklist:</p>
                  {fcmStatus?.missing_server_keys && fcmStatus.missing_server_keys.length > 0 && (
                    <div className="mb-1.5">
                      <p className="text-red-700 font-semibold">Missing secrets:</p>
                      <ul className="list-disc ml-4 font-mono text-[11px] text-red-700">
                        {fcmStatus.missing_server_keys.map(k => <li key={k}>{k}</li>)}
                      </ul>
                    </div>
                  )}
                  <ol className="list-decimal ml-4 space-y-0.5">
                    <li>Create a Firebase project at console.firebase.google.com</li>
                    <li>Go to Project Settings → Service accounts → Generate new private key</li>
                    <li>Add <code className="bg-amber-100 px-1 rounded">FIREBASE_PROJECT_ID</code>, <code className="bg-amber-100 px-1 rounded">FIREBASE_CLIENT_EMAIL</code>, <code className="bg-amber-100 px-1 rounded">FIREBASE_PRIVATE_KEY</code> to Replit Secrets</li>
                    <li>Go to Project Settings → General → Web app → Copy config keys</li>
                    <li>Add <code className="bg-amber-100 px-1 rounded">VITE_FIREBASE_API_KEY</code>, <code className="bg-amber-100 px-1 rounded">VITE_FIREBASE_APP_ID</code>, <code className="bg-amber-100 px-1 rounded">VITE_FIREBASE_MESSAGING_SENDER_ID</code>, <code className="bg-amber-100 px-1 rounded">VITE_FIREBASE_AUTH_DOMAIN</code>, <code className="bg-amber-100 px-1 rounded">VITE_FIREBASE_VAPID_KEY</code></li>
                    <li>Restart both workflows — customers will be prompted to enable push on next login</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Compose & Send */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Radio size={16} className="text-indigo-500" /> Compose & Send Push Notification
              </h2>

              {/* Audience Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <Target size={12} /> Target Audience
                  {audienceLoading
                    ? <span className="ml-2 text-[10px] text-gray-400 animate-pulse">checking…</span>
                    : audienceCount !== null && (
                      <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-bold">
                        ~{audienceCount} {audienceCount === 1 ? "subscriber" : "subscribers"}
                      </span>
                    )
                  }
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AUDIENCE_FILTERS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPushForm(f => ({ ...f, filter: opt.value }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all text-left ${
                        pushForm.filter === opt.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <span>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>

                {/* Individual person search — shown when "Specific Person" is selected */}
                {pushForm.filter === "individual" && (
                  <div className="mt-3 space-y-2">
                    <div className="relative">
                      <input
                        value={indSearch}
                        onChange={e => { setIndSearch(e.target.value); if (!e.target.value) { setIndUser(null); } }}
                        placeholder="Search by name or mobile number…"
                        className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-indigo-50/30"
                      />
                      {indSearching && <span className="absolute right-3 top-2.5 text-[11px] text-gray-400 animate-pulse">Searching…</span>}
                    </div>
                    {indResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-40 overflow-y-auto">
                        {indResults.map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setIndUser(u); setIndResults([]); setIndSearch(u.name); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b last:border-0 flex items-center justify-between gap-2"
                          >
                            <span>
                              <span className="font-medium">{u.name}</span>
                              <span className="text-gray-400 text-xs ml-2">{u.mobile}</span>
                              <span className="text-[10px] text-gray-400 ml-1 capitalize">({u.role})</span>
                            </span>
                            {u.token_count > 0
                              ? <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium flex-shrink-0">✓ {u.token_count} device{u.token_count > 1 ? "s" : ""}</span>
                              : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">No device</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {indUser && (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                        <span>👤</span>
                        <span className="font-medium">{indUser.name}</span>
                        <span className="text-gray-400 text-xs">{indUser.mobile}</span>
                        <button onClick={() => { setIndUser(null); setIndSearch(""); }} className="ml-auto text-gray-400 hover:text-red-400 text-xs">✕ Clear</button>
                      </div>
                    )}
                    {!indUser && !indSearching && indSearch.length >= 2 && indResults.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-1">No results for "{indSearch}"</p>
                    )}
                    {!indSearch && !indUser && (
                      <p className="text-xs text-gray-400 text-center py-1">Type a name or mobile number to search</p>
                    )}
                  </div>
                )}
              </div>

              {/* Title + Body */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notification Title *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                    placeholder="e.g. Your Visa is Ready!"
                    value={pushForm.title}
                    onChange={e => setPushForm(f => ({ ...f, title: e.target.value }))}
                    maxLength={65}
                  />
                  <span className="text-[10px] text-gray-400">{pushForm.title.length}/65</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Click URL (optional)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                    placeholder="/customer/dashboard"
                    value={pushForm.url}
                    onChange={e => setPushForm(f => ({ ...f, url: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Message *</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none"
                  rows={3}
                  placeholder="Type your notification message here…"
                  value={pushForm.body}
                  onChange={e => setPushForm(f => ({ ...f, body: e.target.value }))}
                  maxLength={240}
                />
                <span className="text-[10px] text-gray-400">{pushForm.body.length}/240</span>
              </div>

              {/* Preview + Send */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
                {/* Mini preview */}
                {(pushForm.title || pushForm.body) && (
                  <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-0">
                    <div className="text-lg shrink-0">🔔</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">{pushForm.title || "—"}</div>
                      <div className="text-[11px] text-gray-500 line-clamp-2">{pushForm.body || "—"}</div>
                      {pushForm.url && <div className="text-[10px] text-indigo-500 truncate">{pushForm.url}</div>}
                    </div>
                    <div className="text-[10px] text-gray-400 shrink-0 text-right">
                      <div>Al Burhan</div>
                      <div>Now</div>
                    </div>
                  </div>
                )}
                <Button
                  onClick={handleSend}
                  disabled={sending || !pushForm.title.trim() || !pushForm.body.trim() || !fcmStatus?.configured}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                >
                  {sending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Send size={14} className="mr-2" />}
                  {sending ? "Sending…" : `Send to ${selectedAud?.label || "All"}`}
                </Button>
              </div>
            </div>

            {/* Campaign History */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Activity size={16} className="text-gray-500" /> Recent Campaigns
                </h2>
                <Button variant="ghost" size="sm" onClick={fetchCampaigns} disabled={campaignsLoading}>
                  <RefreshCw size={12} className={campaignsLoading ? "animate-spin" : ""} />
                </Button>
              </div>

              {campaignsLoading ? (
                <div className="py-8 text-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                  <p className="text-sm">Loading campaigns…</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <BellRing size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium text-gray-500">No campaigns yet</p>
                  <p className="text-xs mt-1">Send your first push notification above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3">
                    <div className="col-span-4">Campaign</div>
                    <div className="col-span-2">Audience</div>
                    <div className="col-span-2 text-center">Recipients</div>
                    <div className="col-span-2">Delivered</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-1 text-right">Retry</div>
                  </div>
                  {campaigns.map(c => (
                    <CampaignRow
                      key={c.id} campaign={c}
                      onRetry={handleRetryCampaign}
                      retrying={retryingCampaign === c.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ NOTIFICATION LOGS TAB ═══════════════════════════════════════════ */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            {/* Stats Grid */}
            {stats && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "Total Today",  value: stats.sent,          color: "text-gray-900",    bg: "bg-white",       icon: <Activity size={16} className="text-gray-500" /> },
                    { label: "Delivered",    value: stats.delivered,     color: "text-emerald-700", bg: "bg-emerald-50",  icon: <CheckCircle2 size={16} className="text-emerald-500" /> },
                    { label: "Failed",       value: stats.failed,        color: "text-red-700",     bg: "bg-red-50",      icon: <XCircle size={16} className="text-red-500" /> },
                    { label: "Pending",      value: stats.pending,       color: "text-amber-700",   bg: "bg-amber-50",    icon: <Clock size={16} className="text-amber-500" /> },
                    { label: "Retry Queue",  value: stats.retryQueue ?? 0, color: "text-indigo-700", bg: "bg-indigo-50", icon: <RotateCcw size={16} className="text-indigo-500" /> },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} border border-gray-200 rounded-xl p-3`}>
                      <div className="flex items-center gap-1.5 mb-1">{s.icon}<span className="text-xs text-gray-500">{s.label}</span></div>
                      <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ChannelStat icon="💬" label="WhatsApp"  sent={waSent}  failed={waStats.failed || 0} />
                  <ChannelStat icon="📱" label="SMS"       sent={smsSent} failed={smsStats.failed || 0} />
                  <ChannelStat icon="📧" label="Email"     sent={emlSent} failed={emlStats.failed || 0} />
                  <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
                    <div className="text-2xl">📊</div>
                    <div>
                      <div className="text-xs font-semibold text-gray-700">All-Time Total</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <span className="font-bold text-gray-800">{Number(stats.allTime?.total || 0).toLocaleString()}</span> sent
                        {stats.deliveryRate > 0 && <span className="ml-2 text-emerald-600">· {stats.deliveryRate}%</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                <Search size={13} className="text-gray-400" />
                <input
                  className="text-sm outline-none w-40 placeholder-gray-400"
                  placeholder="Booking / phone / name…"
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                value={filters.channel} onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}>
                <option value="">All Channels</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
              </select>
              <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="permanently_failed">Permanently Failed</option>
              </select>
              <select className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                value={filters.event} onChange={e => setFilters(f => ({ ...f, event: e.target.value }))}>
                <option value="">All Events</option>
                <option value="new_booking">Booking Submitted</option>
                <option value="booking_approved">Booking Approved</option>
                <option value="payment_received">Payment Received</option>
                <option value="partial_payment">Partial Payment</option>
                <option value="invoice_generated">Invoice Generated</option>
                <option value="agreement_ready">Agreement Ready</option>
                <option value="visa_issued">Visa Issued</option>
                <option value="ticket_issued">Flight Ticket</option>
                <option value="departure_reminder">Departure Reminder</option>
                <option value="payment_due">Payment Reminder</option>
              </select>
              <input type="date" className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
              {(filters.search || filters.channel || filters.status || filters.event || filters.date) && (
                <Button variant="ghost" size="sm" className="text-gray-500 text-xs"
                  onClick={() => setFilters({ channel: "", status: "", event: "", search: "", date: "" })}>
                  <Filter size={12} className="mr-1" /> Clear
                </Button>
              )}
            </div>

            {/* Log list */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{total > 0 ? `${((page-1)*PAGE_SIZE)+1}–${Math.min(page*PAGE_SIZE, total)} of ${total}` : "No results"}</span>
              {stats?.failed > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle size={11} /> {stats.failed} failed today — retrying automatically
                </span>
              )}
            </div>

            {loading ? (
              <div className="py-16 text-center text-gray-400">
                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-indigo-400" />
                <p>Loading notification logs…</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Bell size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium text-gray-500">No notifications found</p>
                <p className="text-sm mt-1">Try adjusting filters or refresh after a booking event.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <LogRow key={log.id} log={log} onRetry={handleRetryLog} retrying={retryingId === log.id} />
                ))}
              </div>
            )}

            {pages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
