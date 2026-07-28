// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, MessageSquare, Mail, Phone, Bell, Radio, CheckCircle, XCircle,
  Clock, TrendingUp, AlertTriangle, Activity, Send, Users, Smartphone, Zap, 
  Check, X, ShieldCheck, Power, Play
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const PROV_META: Record<string, { label: string, channel: string }> = {
  botbee: { label: "BotBee WhatsApp", channel: "whatsapp" },
  fast2sms: { label: "Fast2SMS SMS", channel: "sms" },
  smtp: { label: "SMTP Email", channel: "email" },
  firebase: { label: "Firebase FCM Push", channel: "push" },
  lemin: { label: "Lemin AI RCS", channel: "rcs" }
};

const CH_META: Record<string, { icon: React.ElementType, color: string }> = {
  whatsapp: { icon: MessageSquare, color: "text-[#0A3D2A]" },
  sms: { icon: Phone, color: "text-[#0A3D2A]" },
  email: { icon: Mail, color: "text-[#0A3D2A]" },
  push: { icon: Bell, color: "text-[#0A3D2A]" },
  rcs: { icon: Radio, color: "text-[#0A3D2A]" },
};

export default function NotificationHealth() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [pushStats, setPushStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningChecks, setRunningChecks] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);

  // E2E Test State
  const [e2eOpen, setE2eOpen] = useState(false);
  const [e2eMobile, setE2eMobile] = useState("");
  const [e2eEmail, setE2eEmail] = useState("");
  const [e2eRunning, setE2eRunning] = useState(false);
  const [e2eResults, setE2eResults] = useState<any>(null);

  // Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastUrl, setBroadcastUrl] = useState("/");
  const [broadcasting, setBroadcasting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        fetch(`${API}/api/admin/notification-health`, { credentials: "include" }),
        fetch(`${API}/api/push/admin/stats`, { credentials: "include" }),
      ]);
      if (r.ok) setData(await r.json());
      if (p.ok) setPushStats(await p.json());
    } catch {
      toast({ title: "Error", description: "Failed to load notification health data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function runChecks() {
    setRunningChecks(true);
    try {
      const res = await fetch(`${API}/api/admin/notification-health/run-checks`, { method: "POST", credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        toast({ title: "Checks completed", description: "Live provider statuses have been updated." });
        load();
      } else {
        toast({ title: "Error", description: json.error || "Failed to run checks.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to run provider checks.", variant: "destructive" });
    } finally {
      setRunningChecks(false);
    }
  }

  async function retryAllFailed() {
    setRetryingAll(true);
    try {
      const r = await fetch(`${API}/api/notification-center/retry-all-failed`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        toast({ title: "Retry queued", description: `${d.queued || 0} failed notifications re-queued for delivery.` });
        setTimeout(load, 2000);
      } else {
        toast({ title: "Error", description: d.error || "Could not retry failed messages.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not retry failed messages.", variant: "destructive" });
    } finally {
      setRetryingAll(false);
    }
  }

  async function runE2E() {
    if (!e2eMobile) {
      toast({ title: "Required", description: "Mobile number is required for E2E testing.", variant: "destructive" });
      return;
    }
    setE2eRunning(true);
    setE2eResults(null);
    try {
      const res = await fetch(`${API}/api/admin/e2e-test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: e2eMobile, email: e2eEmail })
      });
      const json = await res.json();
      if (res.ok) {
        setE2eResults(json);
        toast({ title: "Test Completed", description: "E2E delivery checks finished." });
        load();
      } else {
        toast({ title: "Error", description: json.error || "E2E test failed.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to execute E2E test.", variant: "destructive" });
    } finally {
      setE2eRunning(false);
    }
  }

  async function sendBroadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast({ title: "Required", description: "Title and body are required.", variant: "destructive" });
      return;
    }
    setBroadcasting(true);
    try {
      const r = await fetch(`${API}/api/push/admin/broadcast`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, url: broadcastUrl || "/" }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: "Push broadcast sent!", description: `Delivered to ${d.sent} devices. ${d.failed} failed.` });
        setBroadcastTitle("");
        setBroadcastBody("");
        setBroadcastUrl("/");
        load();
      } else {
        toast({ title: "Error", description: d.error || "Broadcast failed.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not send broadcast.", variant: "destructive" });
    } finally {
      setBroadcasting(false);
    }
  }

  const overall = data?.overall || { total: 0, sent: 0, failed: 0, avg_retries: 0 };
  const overallRate = overall.total > 0 ? Math.round((overall.sent / overall.total) * 100) : 0;
  const pStatus = data?.providerStatus || {};

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A] flex items-center gap-2.5">
              <ShieldCheck className="text-[#C9A84C]" size={28} />
              Notification Health Center
            </h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">5-channel delivery monitoring and live diagnostics</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runChecks} disabled={runningChecks || loading} variant="outline" className="border-[#0A3D2A] text-[#0A3D2A] hover:bg-[#0A3D2A] hover:text-white transition-colors h-9 text-xs">
              <Power className={`mr-1.5 h-3.5 w-3.5 ${runningChecks ? 'animate-spin' : ''}`} /> Run Live Checks
            </Button>
            <Button onClick={() => setE2eOpen(true)} className="bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021] h-9 text-xs">
              <Zap className="mr-1.5 h-3.5 w-3.5" /> E2E Test
            </Button>
            <Button onClick={retryAllFailed} disabled={retryingAll || loading} variant="destructive" className="bg-red-600 hover:bg-red-700 h-9 text-xs">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${retryingAll ? 'animate-spin' : ''}`} /> Retry Failed
            </Button>
            <Button onClick={load} disabled={loading} variant="outline" className="h-9 w-9 p-0">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Overall KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-[#0A3D2A] text-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Total (30d)</div>
            <div className="text-3xl font-mono font-bold text-[#C9A84C]">{overall.total}</div>
          </Card>
          <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Delivered</div>
            <div className="text-3xl font-mono font-bold">{overall.sent}</div>
          </Card>
          <Card className={`p-4 shadow-sm ${overall.failed > 0 ? 'border-red-200 bg-red-50 text-red-900' : 'bg-gray-50 text-gray-700'}`}>
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Failed</div>
            <div className="text-3xl font-mono font-bold">{overall.failed}</div>
          </Card>
          <Card className="p-4 bg-gray-50 text-[#0A3D2A] shadow-sm">
            <div className="text-xs uppercase tracking-wider font-bold opacity-80 mb-1">Success Rate</div>
            <div className="text-3xl font-mono font-bold">{overallRate}%</div>
          </Card>
        </div>

        {/* Provider Status Panel */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A3D2A] mb-3 border-b pb-1">Live Provider Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.keys(PROV_META).map(key => {
              const info = pStatus[key] || PROV_META[key];
              const cData = data?.channels?.[PROV_META[key].channel] || {};
              const st = info.status || 'unknown';
              const statusColor = st === 'connected' ? 'bg-emerald-500 text-white border-transparent' :
                                  st === 'failed' ? 'bg-red-500 text-white border-transparent' :
                                  st === 'configured' ? 'bg-amber-500 text-white border-transparent' : 'bg-gray-200 text-gray-700 border-transparent';
              
              return (
                <Card key={key} className="p-3 shadow-sm flex flex-col gap-2 border-gray-200">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-xs text-[#0A3D2A] leading-tight pr-2">{info.label}</span>
                    <Badge variant="outline" className={`text-[9px] uppercase px-1.5 py-0 min-w-0 flex-shrink-0 ${statusColor}`}>{st}</Badge>
                  </div>
                  <div className="text-[10px] space-y-1.5 text-gray-600 mt-1">
                    <div className="flex justify-between items-center">
                      <span className="opacity-80">Last Tested:</span>
                      <span className="font-mono font-medium text-gray-800">{info.lastTested ? new Date(info.lastTested).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="opacity-80">Last Success:</span>
                      <span className="font-mono font-medium text-emerald-700">{cData.lastSuccess ? formatTimeAgo(cData.lastSuccess) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="opacity-80">Last Failure:</span>
                      <span className="font-mono font-medium text-red-600">{cData.lastFailure ? formatTimeAgo(cData.lastFailure) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t">
                      <span className="opacity-80">Pending Retries:</span>
                      {cData.pendingRetries > 0 ? (
                        <Badge className="bg-red-500 text-white text-[9px] px-1 py-0 h-4">{cData.pendingRetries}</Badge>
                      ) : (
                        <span className="font-mono font-bold text-gray-400">0</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Channel Delivery Cards */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A3D2A] mb-3 border-b pb-1">Delivery Performance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.keys(CH_META).map(ch => {
              const cData = data?.channels?.[ch] || { total: 0, sent: 0, failed: 0, avgRetries: 0 };
              const rate = cData.total > 0 ? Math.round((cData.sent / cData.total) * 100) : 0;
              const healthColor = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500";
              const textColor = rate >= 90 ? "text-emerald-700" : rate >= 70 ? "text-amber-700" : "text-red-700";
              const Icon = CH_META[ch].icon;

              return (
                <Card key={ch} className="p-4 shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <div className={`flex items-center gap-2 font-bold capitalize text-sm ${CH_META[ch].color}`}>
                      <Icon size={16} /> {ch}
                    </div>
                    <span className={`text-lg font-bold font-mono ${textColor}`}>{rate}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div className={`h-full ${healthColor} transition-all duration-500`} style={{ width: `${rate}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs mb-3">
                    <div className="bg-gray-50 rounded py-1.5 border border-gray-100">
                      <div className="font-mono font-bold text-gray-800">{cData.total}</div>
                      <div className="text-[9px] text-gray-500 uppercase mt-0.5">Total</div>
                    </div>
                    <div className="bg-emerald-50 rounded py-1.5 border border-emerald-100">
                      <div className="font-mono font-bold text-emerald-700">{cData.sent}</div>
                      <div className="text-[9px] text-emerald-600 uppercase mt-0.5">Sent</div>
                    </div>
                    <div className="bg-red-50 rounded py-1.5 border border-red-100">
                      <div className="font-mono font-bold text-red-700">{cData.failed}</div>
                      <div className="text-[9px] text-red-600 uppercase mt-0.5">Failed</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span>Avg Retries:</span> 
                      <span className="font-mono font-medium text-gray-700">{cData.avgRetries?.toFixed(1) || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Pending:</span> 
                      <span className={`font-mono font-bold ${cData.pendingRetries > 0 ? 'text-red-500' : 'text-gray-400'}`}>{cData.pendingRetries || 0}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-gray-100 h-10 p-1 rounded-lg">
            <TabsTrigger value="daily" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Last 7 Days</TabsTrigger>
            <TabsTrigger value="events" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Top Events</TabsTrigger>
            <TabsTrigger value="recent" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Recent Log</TabsTrigger>
            <TabsTrigger value="push" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Push Analytics</TabsTrigger>
          </TabsList>

          <div className="mt-4 border rounded-xl bg-white shadow-sm overflow-hidden">
            <TabsContent value="daily" className="m-0 border-0 p-0">
              <table className="w-full text-sm">
                <thead className="bg-[#0A3D2A] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Sent</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider">Success %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {((data?.daily || []) as any[]).length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">No daily data available.</td></tr>
                  )}
                  {(data?.daily || []).map((row: any) => {
                    const r = row.total > 0 ? Math.round((row.sent / row.total) * 100) : 0;
                    return (
                      <tr key={row.date} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-700">
                          {new Date(row.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric'})}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">{row.total}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{row.sent}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: r >= 90 ? '#059669' : r >= 70 ? '#d97706' : '#dc2626' }}>{r}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="events" className="m-0 border-0 p-4">
              {((data?.topEvents || []) as any[]).length === 0 ? (
                <div className="p-8 text-center text-gray-500">No event data available.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(data?.topEvents || []).map((ev: any) => (
                    <div key={ev.event_type} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg bg-gray-50 hover:border-[#0A3D2A]/30 transition-colors">
                      <span className="text-sm font-mono font-bold text-[#0A3D2A] truncate" title={ev.event_type}>{ev.event_type}</span>
                      <Badge className="bg-[#C9A84C] text-[#0A3D2A] hover:bg-[#C9A84C] font-mono shadow-sm">{ev.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent" className="m-0 border-0 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0A3D2A] text-white">
                    <tr>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Timestamp</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Event Type</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Channel</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Recipient</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {((data?.recent || []) as any[]).length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-500 text-sm">No recent notifications logged.</td></tr>
                    )}
                    {(data?.recent || []).slice(0, 30).map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                          {r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{r.event_type}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold text-[#0A3D2A] border-[#0A3D2A]/30 bg-[#0A3D2A]/5">{r.channel}</Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-600">{r.recipient}</td>
                        <td className="px-4 py-2.5">
                          {r.status === 'sent' || r.status === 'delivered' ? <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[10px]">Success</Badge> : 
                           r.status === 'failed' ? <Badge className="bg-red-500 text-white hover:bg-red-600 text-[10px]">Failed</Badge> : 
                           <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-[10px] uppercase">{r.status}</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-[10px] text-red-600 font-mono truncate max-w-[200px]" title={r.error_code || ''}>{r.error_code || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="push" className="m-0 border-0 p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Subscriber Stats */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#0A3D2A] flex items-center gap-2 border-b pb-2">
                    <Users size={16} className="text-[#C9A84C]" /> Subscriber Demographics
                  </h3>
                  {pushStats ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-center shadow-sm">
                          <div className="text-3xl font-mono font-bold text-[#0A3D2A]">{pushStats.unique_subscribers || 0}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Subscribers</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-center shadow-sm">
                          <div className="text-3xl font-mono font-bold text-[#0A3D2A]">{pushStats.total_tokens || 0}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Active Devices</div>
                        </div>
                      </div>
                      
                      {pushStats.by_platform?.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b pb-2 mb-3">Platform Breakdown</div>
                          <div className="space-y-2">
                            {pushStats.by_platform.map((p: any) => (
                              <div key={p.platform} className="flex justify-between items-center text-sm">
                                <span className="capitalize text-gray-600 flex items-center gap-2">
                                  <Smartphone size={14} className="text-gray-400" /> {p.platform}
                                </span>
                                <span className="font-mono font-bold bg-gray-100 px-2 py-0.5 rounded text-[#0A3D2A]">{p.cnt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center text-xs font-medium border border-gray-200 rounded-xl p-3 bg-gray-50">
                        <div className="flex items-center gap-1.5"><Activity size={14} className="text-gray-400" /> Last 24 Hours</div>
                        <div className="flex gap-4">
                          <span className="text-gray-600">Sent: <strong className="text-emerald-600 font-mono text-sm ml-1">{pushStats.sent_24h || 0}</strong></span>
                          <span className="text-gray-600">Failed: <strong className="text-red-600 font-mono text-sm ml-1">{pushStats.failed_24h || 0}</strong></span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500 border border-dashed rounded-xl bg-gray-50 text-sm">
                      No push subscriber data available. Wait for users to opt-in.
                    </div>
                  )}
                </div>

                {/* Broadcast Form */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#0A3D2A] flex items-center gap-2 border-b pb-2">
                    <Send size={16} className="text-[#C9A84C]" /> Global Broadcast
                  </h3>
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                    <p className="text-xs text-gray-500">Send an immediate push notification to all subscribed devices.</p>
                    
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Notification Title *</label>
                        <Input 
                          value={broadcastTitle} 
                          onChange={e => setBroadcastTitle(e.target.value)} 
                          placeholder="e.g. Flight Schedule Update" 
                          className="focus-visible:ring-[#0A3D2A] border-gray-300"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Message Body *</label>
                        <Input 
                          value={broadcastBody} 
                          onChange={e => setBroadcastBody(e.target.value)} 
                          placeholder="e.g. Please check your updated itinerary..." 
                          className="focus-visible:ring-[#0A3D2A] border-gray-300"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Deep Link URL (Optional)</label>
                        <Input 
                          value={broadcastUrl} 
                          onChange={e => setBroadcastUrl(e.target.value)} 
                          placeholder="e.g. /my-bookings" 
                          className="font-mono text-xs focus-visible:ring-[#0A3D2A] border-gray-300"
                        />
                      </div>
                    </div>

                    <Button 
                      onClick={sendBroadcast} 
                      disabled={broadcasting || !broadcastTitle.trim() || !broadcastBody.trim()}
                      className="w-full bg-[#0A3D2A] hover:bg-[#083021] text-[#C9A84C] font-bold h-10 shadow-md"
                    >
                      {broadcasting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Broadcast to {pushStats?.unique_subscribers || 0} Devices
                    </Button>
                  </div>
                </div>

              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* E2E Modal */}
      <Dialog open={e2eOpen} onOpenChange={setE2eOpen}>
        <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-[#0A3D2A] p-4 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#C9A84C] text-xl">
                <Zap className="h-5 w-5" /> End-to-End Delivery Test
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-white/70 mt-1">Send a real test message across all 5 configured channels.</p>
          </div>
          
          <div className="p-5 space-y-5 bg-white">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Mobile Number *</label>
                <Input 
                  value={e2eMobile} 
                  onChange={e => setE2eMobile(e.target.value)} 
                  placeholder="e.g. 9876543210" 
                  className="font-mono"
                />
                <p className="text-[10px] text-gray-500">Include country code if outside default region.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Email Address</label>
                <Input 
                  value={e2eEmail} 
                  onChange={e => setE2eEmail(e.target.value)} 
                  placeholder="e.g. test@example.com" 
                  className="font-mono"
                />
                <p className="text-[10px] text-gray-500">Required for SMTP email testing.</p>
              </div>
            </div>

            <Button 
              onClick={runE2E} 
              disabled={e2eRunning || !e2eMobile} 
              className="w-full bg-[#0A3D2A] hover:bg-[#083021] text-[#C9A84C] font-bold"
            >
              {e2eRunning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Execute Full E2E Test
            </Button>

            {e2eResults && (
              <div className="border border-gray-200 rounded-lg overflow-hidden mt-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-gray-50 p-3 text-sm font-bold border-b border-gray-200 flex justify-between items-center text-[#0A3D2A]">
                  <span>Test Results Summary</span>
                  <Badge className="bg-[#0A3D2A] text-white">
                    {Object.values(e2eResults.channels || {}).filter((c: any) => c.ok).length} / 5 Successful
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="p-2.5 font-semibold">Channel</th>
                        <th className="p-2.5 font-semibold">Provider</th>
                        <th className="p-2.5 font-semibold">Status</th>
                        <th className="p-2.5 font-semibold">Technical Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.keys(CH_META).map(ch => {
                        const res = e2eResults.channels?.[ch] || {};
                        return (
                          <tr key={ch} className="hover:bg-gray-50">
                            <td className="p-2.5 font-bold capitalize flex items-center gap-2">
                              {React.createElement(CH_META[ch].icon, { size: 14, className: "text-gray-500" })} {ch}
                            </td>
                            <td className="p-2.5 font-mono text-gray-600">{res.provider || '-'}</td>
                            <td className="p-2.5">
                              {res.ok ? (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5"><Check size={10} className="mr-1"/> Pass</Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border border-red-200 px-2 py-0.5"><X size={10} className="mr-1"/> Fail</Badge>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[10px] text-gray-500 max-w-[150px] truncate" title={res.messageId || res.errorMessage || ''}>
                              {res.messageId ? `ID: ${res.messageId}` : res.errorMessage ? <span className="text-red-500">{res.errorMessage}</span> : res.tokenCount !== undefined ? `Tokens: ${res.tokenCount}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}