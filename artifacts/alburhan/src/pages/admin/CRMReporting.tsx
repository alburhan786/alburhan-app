// @ts-nocheck
import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Search, TrendingUp, Users, Target, DollarSign, Filter, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

export default function CRMReporting() {
  const { toast } = useToast();
  const [tab, setTab] = useState("pipeline");
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({});
  
  // FB Sync state
  const [fbSyncOpen, setFbSyncOpen] = useState(false);
  const [fbToken, setFbToken] = useState("");
  const [fbAdAccount, setFbAdAccount] = useState("");
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const endpoints = {
        pipeline: `/api/leads/reports/pipeline?from=${dateFrom}&to=${dateTo}`,
        source: `/api/leads/reports/source-roi?from=${dateFrom}&to=${dateTo}`,
        agent: `/api/leads/reports/agent-performance?from=${dateFrom}&to=${dateTo}`,
        funnel: `/api/leads/reports/conversion-funnel?from=${dateFrom}&to=${dateTo}`,
        fb: `/api/leads/fb-ads/data?from=${dateFrom}&to=${dateTo}`
      };
      
      const res = await fetch(`${API}${endpoints[tab]}`, { credentials: "include" });
      if (res.ok) {
        setData(await res.json());
      } else {
        setData({});
      }
    } catch (e) {
      toast({ title: "Error loading data", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [tab, dateFrom, dateTo]);

  const handleFbSync = async () => {
    if (!fbToken || !fbAdAccount) return toast({ title: "Fill both fields", variant: "destructive" });
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/leads/fb-ads/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: fbToken, ad_account_id: fbAdAccount })
      });
      if (res.ok) {
        toast({ title: "Sync successful" });
        setFbSyncOpen(false);
        loadData();
      } else {
        toast({ title: "Sync failed", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Sync failed", variant: "destructive" });
    }
    setSyncing(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A] flex items-center gap-2">
              <TrendingUp className="text-[#C9A84C]" /> CRM Analytics & Reporting
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Advanced insights into lead pipeline, agent performance, and marketing ROI.</p>
          </div>
          
          <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-muted-foreground" />
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs border-0 bg-transparent w-[110px]" />
              <span className="text-muted-foreground">-</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs border-0 bg-transparent w-[110px]" />
            </div>
            <Button size="sm" onClick={loadData} disabled={loading} className="bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 h-8 px-4 rounded-lg">
              Refresh
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto rounded-xl p-1 bg-white border mb-6 shadow-sm">
            <TabsTrigger value="pipeline" className="rounded-lg">Pipeline Velocity</TabsTrigger>
            <TabsTrigger value="source" className="rounded-lg">Source ROI</TabsTrigger>
            <TabsTrigger value="agent" className="rounded-lg">Agent Performance</TabsTrigger>
            <TabsTrigger value="funnel" className="rounded-lg">Conversion Funnel</TabsTrigger>
            <TabsTrigger value="fb" className="rounded-lg">Facebook Ads</TabsTrigger>
          </TabsList>

          <div className="min-h-[400px]">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Loading report data...</div>
            ) : (
              <>
                {/* PIPELINE TAB */}
                {tab === "pipeline" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="col-span-2">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Leads by Stage</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={data.stages || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                <XAxis dataKey="stage" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 12}} />
                                <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                                <Legend />
                                <Bar dataKey="count" name="Total Leads" fill="#0A3D2A" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="converted" name="Converted" fill="#C9A84C" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-[#0A3D2A] text-white">
                        <CardContent className="p-6 flex flex-col justify-center h-full text-center">
                          <Clock size={32} className="text-[#C9A84C] mx-auto mb-4" />
                          <div className="text-sm font-medium text-white/70 uppercase tracking-widest mb-2">Avg Days to Convert</div>
                          <div className="text-5xl font-bold">{data.avgDaysToConvert || 0}</div>
                          <div className="text-sm mt-4 text-white/80">From lead creation to won booking.</div>
                        </CardContent>
                      </Card>
                    </div>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Weekly Inflow vs Conversions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.weekly || []}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                              <XAxis dataKey="week" tick={{fontSize: 12}} />
                              <YAxis tick={{fontSize: 12}} />
                              <RechartsTooltip />
                              <Legend />
                              <Line type="monotone" dataKey="new_leads" name="New Leads" stroke="#0A3D2A" strokeWidth={3} dot={{r: 4}} />
                              <Line type="monotone" dataKey="converted" name="Conversions" stroke="#C9A84C" strokeWidth={3} dot={{r: 4}} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* SOURCE ROI TAB */}
                {tab === "source" && (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex justify-between">
                          <span>Performance by Source</span>
                          <Button variant="outline" size="sm"><Download size={14} className="mr-2"/> Export</Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Source</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Leads</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Converted</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Conv. Rate</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Avg Score</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Revenue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(data.sources || []).map((s:any, i:number) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                                  <td className="py-3 px-4 font-medium capitalize">{s.source?.replace(/_/g, ' ')}</td>
                                  <td className="text-right py-3 px-4">{s.total_leads}</td>
                                  <td className="text-right py-3 px-4 text-[#0A3D2A] font-semibold">{s.converted}</td>
                                  <td className="text-right py-3 px-4">
                                    <Badge variant="outline" className={s.conv_rate > 10 ? 'border-green-200 text-green-700 bg-green-50' : ''}>
                                      {s.conv_rate}%
                                    </Badge>
                                  </td>
                                  <td className="text-right py-3 px-4">{s.avg_score || '-'}</td>
                                  <td className="text-right py-3 px-4 font-mono font-medium">₹{s.revenue?.toLocaleString('en-IN') || 0}</td>
                                </tr>
                              ))}
                              {(!data.sources || data.sources.length === 0) && (
                                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No data available for this period</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* AGENT PERFORMANCE TAB */}
                {tab === "agent" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.isArray(data) && data.length > 0 ? data.map((agent:any, i:number) => (
                      <Card key={i} className="overflow-hidden">
                        <div className={`h-2 w-full ${i === 0 ? 'bg-[#C9A84C]' : 'bg-[#0A3D2A]'}`} />
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <h3 className="font-bold text-lg">{agent.agent_name || 'Unassigned'}</h3>
                              <p className="text-sm text-muted-foreground">Sales Agent</p>
                            </div>
                            {i === 0 && <Badge className="bg-[#C9A84C] hover:bg-[#C9A84C]">Top Performer</Badge>}
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-muted-foreground">Conversion Rate</span>
                                <span className="font-bold">{agent.conv_rate}%</span>
                              </div>
                              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-[#0A3D2A] rounded-full" style={{ width: `${Math.min(agent.conv_rate || 0, 100)}%` }} />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 pt-2">
                              <div className="bg-muted/20 p-3 rounded-xl">
                                <div className="text-xs text-muted-foreground mb-1">Total Leads</div>
                                <div className="font-bold text-xl">{agent.total_leads}</div>
                              </div>
                              <div className="bg-muted/20 p-3 rounded-xl">
                                <div className="text-xs text-muted-foreground mb-1">Converted</div>
                                <div className="font-bold text-xl text-green-600">{agent.converted}</div>
                              </div>
                            </div>

                            {(agent.overdue_tasks > 0 || agent.pending_tasks > 0) && (
                              <div className="flex items-center gap-3 pt-2">
                                {agent.overdue_tasks > 0 && <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">{agent.overdue_tasks} Overdue Tasks</Badge>}
                                {agent.pending_tasks > 0 && <Badge variant="outline">{agent.pending_tasks} Pending</Badge>}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )) : (
                      <div className="col-span-full py-12 text-center text-muted-foreground">No agent performance data found.</div>
                    )}
                  </div>
                )}

                {/* FUNNEL TAB */}
                {tab === "funnel" && data.funnel && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-4">
                        <Card>
                          <CardHeader className="pb-4 border-b">
                            <CardTitle className="text-base">Lead Conversion Funnel</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            <div className="space-y-6 max-w-lg mx-auto">
                              {[
                                { label: "Total Leads", value: data.funnel.total_leads, color: "bg-blue-50 text-blue-700 border-blue-200" },
                                { label: "Contacted", value: data.funnel.contacted, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                                { label: "Qualified", value: data.funnel.qualified, color: "bg-violet-50 text-violet-700 border-violet-200" },
                                { label: "Proposal Sent", value: data.funnel.proposal_sent, color: "bg-amber-50 text-amber-700 border-amber-200" },
                                { label: "Converted", value: data.funnel.converted, color: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                              ].map((step, i, arr) => {
                                const max = arr[0].value || 1;
                                const width = Math.max(20, (step.value / max) * 100);
                                const dropoff = i > 0 && arr[i-1].value > 0 ? Math.round((1 - step.value / arr[i-1].value) * 100) : 0;
                                
                                return (
                                  <div key={step.label} className="relative">
                                    <div className="flex items-center gap-4">
                                      <div className="w-[120px] text-right font-medium text-sm text-muted-foreground">{step.label}</div>
                                      <div className="flex-1">
                                        <div 
                                          className={`py-3 px-4 rounded-r-xl border-y border-r border-l-4 ${step.color} shadow-sm font-bold flex justify-between items-center transition-all duration-500 ease-in-out`}
                                          style={{ width: `${width}%` }}
                                        >
                                          <span>{step.value}</span>
                                          {i === arr.length - 1 && <Target size={16} className="opacity-50" />}
                                        </div>
                                      </div>
                                    </div>
                                    {i > 0 && dropoff > 0 && (
                                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-4 text-xs font-medium text-red-500">
                                        -{dropoff}% drop
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      
                      <div className="space-y-6">
                        <Card className="bg-gradient-to-br from-[#0A3D2A] to-[#115e41] text-white">
                          <CardContent className="p-8 text-center">
                            <DollarSign size={40} className="text-[#C9A84C] mx-auto mb-4" />
                            <div className="text-sm font-medium text-white/70 uppercase tracking-widest mb-2">Total Funnel Revenue</div>
                            <div className="text-4xl font-bold">₹{(data.funnel.total_revenue || 0).toLocaleString('en-IN')}</div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">Overall Conversion Rate</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-5xl font-bold text-[#0A3D2A] text-center py-6">
                              {data.funnel.total_leads > 0 ? Math.round((data.funnel.converted / data.funnel.total_leads) * 100) : 0}%
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                )}

                {/* FB ADS TAB */}
                {tab === "fb" && (
                  <div className="space-y-6">
                    <div className="flex justify-end">
                      <Button onClick={() => setFbSyncOpen(true)} className="bg-[#1877F2] hover:bg-[#1877F2]/90">
                        Sync Facebook Ads
                      </Button>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Campaign Performance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Campaign Name</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Spend</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Leads</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Clicks</th>
                                <th className="text-right py-3 px-4 font-medium text-muted-foreground">CPL (Cost per Lead)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.isArray(data) && data.length > 0 ? data.map((c:any, i:number) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                                  <td className="py-3 px-4 font-medium text-[#1877F2]">{c.campaign_name}</td>
                                  <td className="text-right py-3 px-4">₹{c.spend?.toLocaleString('en-IN') || 0}</td>
                                  <td className="text-right py-3 px-4 font-bold">{c.leads || 0}</td>
                                  <td className="text-right py-3 px-4">{c.clicks || 0}</td>
                                  <td className="text-right py-3 px-4 font-mono">₹{c.cpl?.toFixed(2) || 0}</td>
                                </tr>
                              )) : (
                                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No Facebook ads data found. Sync your account to view campaigns.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* FB Sync Dialog */}
                    {fbSyncOpen && (
                      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <Card className="w-full max-w-md shadow-2xl">
                          <CardHeader>
                            <CardTitle>Connect Facebook Ads</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Access Token</label>
                              <Input type="password" value={fbToken} onChange={e => setFbToken(e.target.value)} placeholder="EAAB..." />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Ad Account ID</label>
                              <Input value={fbAdAccount} onChange={e => setFbAdAccount(e.target.value)} placeholder="act_..." />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                              <Button variant="outline" onClick={() => setFbSyncOpen(false)}>Cancel</Button>
                              <Button onClick={handleFbSync} disabled={syncing} className="bg-[#1877F2] hover:bg-[#1877F2]/90">
                                {syncing ? "Syncing..." : "Sync Now"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
