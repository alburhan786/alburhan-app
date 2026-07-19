import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft, RefreshCw, IndianRupee, Package, Users, UserCheck } from "lucide-react";
import { useRoute, Link } from "wouter";

const BASE_API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function BranchDashboard() {
  const [, params] = useRoute("/admin/branch-dashboard/:id");
  const id = params?.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/branches/${id}/stats`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const branch = data?.branch || {};
  const statMap: Record<string, number> = data?.statusMap || {};
  const total = Object.values(statMap).reduce((a, b) => a + b, 0);

  const STATUS_COLORS: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700",
    approved:  "bg-blue-100 text-blue-700",
    pending:   "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/branches">
              <Button variant="outline" size="sm" className="gap-1.5"><ArrowLeft size={13} /> Branches</Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 size={18} className="text-primary" /></div>
                {branch.name || "Branch Dashboard"}
              </h1>
              {branch.city && <p className="text-sm text-muted-foreground mt-0.5">{branch.city}</p>}
            </div>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading branch data…</div>
        ) : !data ? (
          <div className="py-16 text-center text-muted-foreground">Branch not found</div>
        ) : (
          <>
            {/* Branch Info */}
            <div className="rounded-2xl border p-5 bg-muted/5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <IndianRupee size={18} className="text-emerald-700 mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-emerald-700">{fmt(data.totalRevenue || 0)}</p>
                  <p className="text-xs text-muted-foreground">Total Collected</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <Package size={18} className="text-blue-700 mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-blue-700">{total}</p>
                  <p className="text-xs text-muted-foreground">Total Bookings</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <UserCheck size={18} className="text-teal-700 mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono text-teal-700">{data.activeAgents || 0}</p>
                  <p className="text-xs text-muted-foreground">Active Agents</p>
                </div>
                <div className="text-center p-3 rounded-xl border">
                  <Users size={18} className="text-muted-foreground mx-auto mb-1" />
                  <p className="text-xl font-bold font-mono">{statMap.confirmed || 0}</p>
                  <p className="text-xs text-muted-foreground">Confirmed</p>
                </div>
              </div>
            </div>

            {/* Booking Status Breakdown */}
            <div className="rounded-2xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Booking Status Breakdown</div>
              {Object.keys(statMap).length === 0 ? (
                <p className="px-4 py-8 text-center text-muted-foreground text-sm">No bookings for this branch yet</p>
              ) : (
                Object.entries(statMap).map(([status, cnt]) => (
                  <div key={status} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                    <Badge className={`capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>{status}</Badge>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${total > 0 ? Math.round((cnt / total) * 100) : 0}%` }} />
                    </div>
                    <span className="font-bold font-mono text-sm w-8 text-right">{cnt}</span>
                  </div>
                ))
              )}
            </div>

            {/* Branch Details */}
            <div className="rounded-2xl border p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Manager</p>
                <p className="font-semibold">{branch.manager_name || "—"}</p>
                {branch.manager_mobile && <p className="text-sm text-muted-foreground">{branch.manager_mobile}</p>}
                {branch.manager_email && <p className="text-sm text-muted-foreground">{branch.manager_email}</p>}
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                <Badge className={branch.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                  {branch.is_active ? "Active" : "Inactive"}
                </Badge>
                {branch.address && <p className="text-sm text-muted-foreground mt-2">{branch.address}</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
