import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, MessageSquare, Mail, Phone, Bell, CheckCircle, XCircle,
  Clock, TrendingUp, AlertTriangle, Activity, Send, Users, Smartphone,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const CHANNEL_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  whatsapp: { icon: <MessageSquare size={16} />, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  sms:      { icon: <Phone size={16} />,         color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  email:    { icon: <Mail size={16} />,           color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200" },
  push:     { icon: <Bell size={16} />,           color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200" },
};

function ChannelCard({ channel, stats }: { channel: string; stats: any }) {
  const m = CHANNEL_META[channel] || { icon: <Activity size={16} />, color: "text-foreground", bg: "bg-muted/30", border: "" };
  const rate = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;
  const healthColor = rate >= 90 ? "text-emerald-700" : rate >= 70 ? "text-amber-700" : "text-red-700";
  const healthBg    = rate >= 90 ? "bg-emerald-500"   : rate >= 70 ? "bg-amber-500"   : "bg-red-500";
  return (
    <div className={`rounded-2xl border p-5 ${m.bg} ${m.border}`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`flex items-center gap-2 font-bold capitalize ${m.color}`}>
          {m.icon} {channel}
        </div>
        <span className={`text-2xl font-bold font-mono ${healthColor}`}>{rate}%</span>
      </div>
      <div className="h-2 bg-black/10 rounded-full overflow-hidden mb-4">
        <div className={`h-full rounded-full ${healthBg} transition-all duration-700`} style={{ width: `${rate}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Total",  value: stats.total,  icon: <Activity size={11} /> },
          { label: "Sent",   value: stats.sent,   icon: <CheckCircle size={11} className="text-emerald-600" /> },
          { label: "Failed", value: stats.failed, icon: <XCircle size={11} className="text-red-500" /> },
        ].map(s => (
          <div key={s.label} className="bg-white/60 rounded-xl p-2">
            <p className="text-lg font-bold font-mono">{s.value || 0}</p>
            <p className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground font-semibold">{s.icon}{s.label}</p>
          </div>
        ))}
      </div>
      {stats.avgRetries > 0 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">Avg retries: {stats.avgRetries.toFixed(1)}</p>
      )}
    </div>
  );
}

export default function NotificationHealth() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [pushStats, setPushStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody,  setBroadcastBody]  = useState("");
  const [broadcastUrl,   setBroadcastUrl]   = useState("/");
  const [broadcasting, setBroadcasting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        fetch(`${BASE_API}/api/admin/notification-health`, { credentials: "include" }),
        fetch(`${BASE_API}/api/push/admin/stats`, { credentials: "include" }),
      ]);
      if (r.ok) setData(await r.json());
      if (p.ok) setPushStats(await p.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retryAllFailed() {
    setRetryingAll(true);
    try {
      const r = await fetch(`${BASE_API}/api/notification-center/retry-all-failed`, { method: "POST", credentials: "include" });
      const d = await r.json();
      toast({ title: "Retry queued", description: `${d.queued || 0} failed notifications re-queued.` });
      setTimeout(load, 2000);
    } catch { toast({ title: "Error", description: "Could not retry failed messages.", variant: "destructive" }); }
    setRetryingAll(false);
  }

  async function sendBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast({ title: "Required", description: "Title and body are required.", variant: "destructive" }); return;
    }
    setBroadcasting(true);
    try {
      const r = await fetch(`${BASE_API}/api/push/admin/broadcast`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, url: broadcastUrl || "/" }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: "Push sent!", description: `Delivered to ${d.sent} devices, ${d.failed} failed.` });
        setBroadcastTitle(""); setBroadcastBody(""); setBroadcastUrl("/");
        load();
      } else {
        toast({ title: "Error", description: d.error || "Broadcast failed.", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Could not send broadcast.", variant: "destructive" }); }
    setBroadcasting(false);
  }

  const d = data || {};
  const channels = d.channels || {};
  const daily = d.daily || [];
  const topEvents = d.topEvents || [];
  const recent = d.recent || [];
  const overall = d.overall || {};
  const overallRate = overall.total > 0 ? Math.round((overall.sent / overall.total) * 100) : 0;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <Activity size={18} className="text-blue-700" />
              </div>
              Notification Health Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">WhatsApp, SMS, Email & Push delivery analytics</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={retryAllFailed} disabled={retryingAll} variant="outline" size="sm" className="gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50">
              <RefreshCw size={13} className={retryingAll ? "animate-spin" : ""} /> Retry All Failed
            </Button>
            <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <div className="py-20 text-center text-muted-foreground">
            <Activity size={32} className="mx-auto mb-2 animate-pulse text-blue-400" />
            <p>Analysing notification logs…</p>
          </div>
        ) : (
          <>
            {/* Overall KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total (30d)",   value: overall.total || 0,    color: "text-foreground",   bg: "bg-muted/30" },
                { label: "Delivered",     value: overall.sent  || 0,    color: "text-emerald-700",  bg: "bg-emerald-50",  border: "border-emerald-200" },
                { label: "Failed",        value: overall.failed || 0,   color: overall.failed > 0 ? "text-red-700" : "text-muted-foreground", bg: overall.failed > 0 ? "bg-red-50" : "bg-muted/20", border: overall.failed > 0 ? "border-red-200" : "" },
                { label: "Success Rate",  value: `${overallRate}%`,     color: overallRate >= 90 ? "text-emerald-700" : overallRate >= 70 ? "text-amber-700" : "text-red-700", bg: "bg-primary/5" },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border p-3 text-center ${s.bg} ${(s as any).border || ""}`}>
                  <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Channel cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {["whatsapp", "sms", "email", "push"].map(ch => (
                <ChannelCard key={ch} channel={ch} stats={channels[ch] || { total: 0, sent: 0, failed: 0, avgRetries: 0 }} />
              ))}
            </div>

            {/* Push Notification Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Push Subscriber Stats */}
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <Bell size={16} /> Push Notification Subscribers
                </h3>
                {pushStats ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-white/70 rounded-xl p-3">
                        <div className="text-2xl font-bold text-orange-700">{pushStats.unique_subscribers}</div>
                        <div className="text-xs text-orange-600 mt-0.5 flex items-center justify-center gap-1"><Users size={10} /> Subscribers</div>
                      </div>
                      <div className="bg-white/70 rounded-xl p-3">
                        <div className="text-2xl font-bold text-orange-700">{pushStats.total_tokens}</div>
                        <div className="text-xs text-orange-600 mt-0.5 flex items-center justify-center gap-1"><Smartphone size={10} /> Devices</div>
                      </div>
                    </div>
                    {pushStats.by_platform?.length > 0 && (
                      <div className="space-y-1.5 text-sm">
                        {pushStats.by_platform.map((p: any) => (
                          <div key={p.platform} className="flex justify-between text-orange-700">
                            <span className="capitalize">{p.platform}</span>
                            <span className="font-semibold">{p.cnt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-orange-600 pt-1 border-t border-orange-200">
                      Sent last 24h: <strong>{pushStats.sent_24h}</strong>
                      {pushStats.failed_24h > 0 && <span className="ml-2 text-red-600">· {pushStats.failed_24h} failed</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-orange-600">No subscriber data available. Customers need to enable notifications.</p>
                )}
              </div>

              {/* Broadcast Push */}
              <div className="rounded-2xl border p-5 space-y-3">
                <h3 className="font-semibold mb-1 flex items-center gap-2">
                  <Send size={16} className="text-primary" /> Broadcast Push Notification
                </h3>
                <p className="text-xs text-muted-foreground">Send a push notification to ALL subscribed devices.</p>
                <div className="space-y-2">
                  <Input
                    value={broadcastTitle}
                    onChange={e => setBroadcastTitle(e.target.value)}
                    placeholder="Notification title *"
                    className="text-sm"
                  />
                  <Input
                    value={broadcastBody}
                    onChange={e => setBroadcastBody(e.target.value)}
                    placeholder="Message body *"
                    className="text-sm"
                  />
                  <Input
                    value={broadcastUrl}
                    onChange={e => setBroadcastUrl(e.target.value)}
                    placeholder="Deep link URL (optional)"
                    className="text-sm"
                  />
                  <Button
                    onClick={sendBroadcast}
                    disabled={broadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
                    className="w-full gap-2"
                  >
                    {broadcasting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    {broadcasting ? "Sending…" : `Send to All (${pushStats?.unique_subscribers || 0}) Subscribers`}
                  </Button>
                </div>
              </div>
            </div>

            {/* Daily stats */}
            {daily.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Last 7 Days</h2>
                <div className="rounded-2xl border overflow-hidden">
                  <div className="grid grid-cols-4 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Date</span><span className="text-center">Total</span><span className="text-center">Sent</span><span className="text-center">Success</span>
                  </div>
                  <div className="divide-y">
                    {daily.map((row: any, i: number) => {
                      const r = row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0;
                      return (
                        <div key={i} className="grid grid-cols-4 px-4 py-2.5 text-sm hover:bg-muted/10 transition-colors">
                          <span className="font-medium">{new Date(row.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                          <span className="text-center font-mono">{row.total}</span>
                          <span className="text-center font-mono text-emerald-700">{row.sent}</span>
                          <span className={`text-center font-bold ${r >= 90 ? "text-emerald-700" : r >= 70 ? "text-amber-700" : "text-red-700"}`}>{r}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Top events */}
            {topEvents.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Top Notification Events (30d)</h2>
                <div className="rounded-2xl border overflow-hidden">
                  <div className="divide-y">
                    {topEvents.slice(0, 8).map((ev: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <TrendingUp size={13} className="text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 text-sm font-mono text-xs">{ev.event_type}</span>
                        <Badge variant="outline" className="font-mono text-[11px]">{ev.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent failures */}
            {recent.filter((r: any) => r.status === "failed").length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-red-600" /> Recent Failures
                  <Button onClick={retryAllFailed} disabled={retryingAll} variant="outline" size="sm" className="ml-auto text-xs gap-1 h-7">
                    <RefreshCw size={11} className={retryingAll ? "animate-spin" : ""} /> Retry All
                  </Button>
                </h2>
                <div className="rounded-2xl border border-red-200 overflow-hidden">
                  <div className="divide-y divide-red-100">
                    {recent.filter((r: any) => r.status === "failed").slice(0, 5).map((r: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3 bg-red-50/40">
                        <XCircle size={14} className="text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono truncate">{r.event_type} → {r.channel} → {r.recipient}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
