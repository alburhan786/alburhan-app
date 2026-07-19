import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, ArrowLeft, RefreshCw, IndianRupee, Package, Building2, Phone, Mail, Percent } from "lucide-react";
import { Link } from "wouter";

const BASE_API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function AgentDashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${BASE_API}/api/admin/agents`, { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setAgents(data);
          if (data.length > 0) setSelected(data[0]);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/agents">
            <Button variant="outline" size="sm" className="gap-1.5"><ArrowLeft size={13} /> Agents</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><UserCheck size={18} className="text-primary" /></div>
              Agent Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agent{agents.length !== 1 ? "s" : ""} total</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading agents…</div>
        ) : agents.length === 0 ? (
          <div className="py-16 text-center">
            <UserCheck size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground mb-3">No agents registered yet.</p>
            <Link href="/admin/agents"><Button size="sm" className="gap-1.5">Add First Agent</Button></Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {/* Agent list */}
            <div className="rounded-2xl border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Agent</div>
              {agents.map((a: any) => (
                <button key={a.id} onClick={() => setSelected(a)}
                  className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors ${selected?.id === a.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
                  <p className="font-semibold text-sm">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.city || "—"} · {a.total_bookings || 0} bookings</p>
                </button>
              ))}
            </div>

            {/* Agent stats */}
            {selected && (
              <div className="sm:col-span-2 space-y-4">
                <div className="rounded-2xl border p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold">{selected.name}</h2>
                      {selected.city && <p className="text-sm text-muted-foreground">{selected.city}</p>}
                    </div>
                    <Badge className={selected.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {selected.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {selected.mobile && <p className="text-sm flex items-center gap-2"><Phone size={13} className="text-muted-foreground" />{selected.mobile}</p>}
                    {selected.email && <p className="text-sm flex items-center gap-2"><Mail size={13} className="text-muted-foreground" />{selected.email}</p>}
                    {selected.branch_name && <p className="text-sm flex items-center gap-2"><Building2 size={13} className="text-muted-foreground" />{selected.branch_name}</p>}
                    {Number(selected.commission_rate) > 0 && <p className="text-sm flex items-center gap-2"><Percent size={13} className="text-muted-foreground" />{selected.commission_rate}% commission</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4 text-center bg-emerald-50 border-emerald-200">
                    <IndianRupee size={20} className="text-emerald-700 mx-auto mb-1" />
                    <p className="text-2xl font-bold font-mono text-emerald-700">{fmt(selected.total_collected || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Collected</p>
                  </div>
                  <div className="rounded-2xl border p-4 text-center bg-blue-50 border-blue-200">
                    <Package size={20} className="text-blue-700 mx-auto mb-1" />
                    <p className="text-2xl font-bold font-mono text-blue-700">{selected.total_bookings || 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total Bookings</p>
                  </div>
                  {Number(selected.commission_rate) > 0 && (
                    <div className="rounded-2xl border p-4 text-center bg-violet-50 border-violet-200 col-span-2">
                      <Percent size={20} className="text-violet-700 mx-auto mb-1" />
                      <p className="text-2xl font-bold font-mono text-violet-700">
                        {fmt((selected.total_collected || 0) * (Number(selected.commission_rate) / 100))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Estimated Commission ({selected.commission_rate}%)</p>
                    </div>
                  )}
                </div>

                {selected.notes && (
                  <div className="rounded-2xl border p-4 bg-muted/10">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
