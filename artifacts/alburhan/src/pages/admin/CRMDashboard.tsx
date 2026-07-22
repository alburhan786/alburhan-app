import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, RefreshCw, Users, TrendingUp, MessageSquare, CheckCircle, Phone, Mail, Plus } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

const STAGE_COLORS: Record<string, string> = {
  new:        "bg-blue-100 text-blue-700",
  contacted:  "bg-yellow-100 text-yellow-700",
  qualified:  "bg-violet-100 text-violet-700",
  proposal:   "bg-orange-100 text-orange-700",
  won:        "bg-emerald-100 text-emerald-700",
  lost:       "bg-red-100 text-red-700",
};

export default function CRMDashboard() {
  const [leads, setLeads]         = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tasks, setTasks]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [l, c, t] = await Promise.all([
        fetch(`${API}/api/enterprise/leads`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin/customers`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/enterprise/tasks`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setLeads(Array.isArray(l) ? l : []);
      setCustomers(Array.isArray(c) ? c : []);
      setTasks(Array.isArray(t) ? t : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const wonLeads    = leads.filter(l => l.stage === "won" || l.status === "won").length;
  const openTasks   = tasks.filter(t => t.status !== "done" && t.status !== "completed").length;
  const convRate    = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

  // Stage breakdown
  const stageMap: Record<string, number> = {};
  for (const l of leads) {
    const s = l.stage || l.status || "new";
    stageMap[s] = (stageMap[s] || 0) + 1;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Target size={18} className="text-primary" /></div>
              CRM Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Customer Relationship Management — leads, pipeline, and customer insights</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/leads"><Button size="sm" className="gap-1.5"><Plus size={13} /> New Lead</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Target,     label: "Total Leads",      val: leads.length,      color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle,label: "Won",               val: wonLeads,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: TrendingUp, label: "Conversion Rate",  val: `${convRate}%`,    color: "bg-violet-50 border-violet-200 text-violet-700", isStr: true },
            { icon: MessageSquare,label:"Open Tasks",       val: openTasks,         color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : Number(k.val).toLocaleString("en-IN")}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Pipeline Stages */}
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold mb-4">Lead Pipeline</h2>
            {Object.keys(stageMap).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No leads yet. <Link href="/admin/leads" className="text-primary">Add leads</Link></div>
            ) : (
              <div className="space-y-3">
                {Object.entries(stageMap).map(([stage, count]) => {
                  const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                  return (
                    <div key={stage}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium">{stage}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Leads */}
          <div className="rounded-2xl border bg-card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Recent Leads</h2>
              <Link href="/admin/leads"><Button variant="ghost" size="sm">View All →</Button></Link>
            </div>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : leads.length === 0 ? (
              <div className="py-10 text-center">
                <Target size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No leads yet.</p>
                <Link href="/admin/leads"><Button size="sm" className="mt-3">Add First Lead</Button></Link>
              </div>
            ) : (
              <div className="divide-y">
                {leads.slice(0, 8).map((l, i) => (
                  <div key={l.id || i} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">{l.name || l.customerName || "Lead"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        {l.phone && <span className="flex items-center gap-1"><Phone size={10} />{l.phone}</span>}
                        {l.email && <span className="flex items-center gap-1"><Mail size={10} />{l.email}</span>}
                      </p>
                    </div>
                    <Badge className={`text-xs ${STAGE_COLORS[l.stage || l.status || "new"] || "bg-gray-100 text-gray-700"}`}>
                      {l.stage || l.status || "new"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Customers Summary */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Customer Overview</h2>
            <Link href="/admin/customers"><Button variant="ghost" size="sm">Manage Customers →</Button></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold">{customers.length}</p>
              <p className="text-xs text-muted-foreground">Total Customers</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold">{customers.filter(c => c.kycStatus === "approved" || c.kycVerified).length}</p>
              <p className="text-xs text-muted-foreground">KYC Verified</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold">{leads.length}</p>
              <p className="text-xs text-muted-foreground">Active Leads</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <p className="text-2xl font-bold">{tasks.length}</p>
              <p className="text-xs text-muted-foreground">Total Tasks</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/leads"><Button variant="outline" size="sm" className="gap-1.5"><Target size={13} /> Leads</Button></Link>
            <Link href="/admin/customers"><Button variant="outline" size="sm" className="gap-1.5"><Users size={13} /> Customers</Button></Link>
            <Link href="/admin/tasks"><Button variant="outline" size="sm" className="gap-1.5"><CheckCircle size={13} /> Tasks</Button></Link>
            <Link href="/admin/inquiries"><Button variant="outline" size="sm" className="gap-1.5"><MessageSquare size={13} /> Inquiries</Button></Link>
            <Link href="/admin/feedback"><Button variant="outline" size="sm" className="gap-1.5"><MessageSquare size={13} /> Feedback</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
