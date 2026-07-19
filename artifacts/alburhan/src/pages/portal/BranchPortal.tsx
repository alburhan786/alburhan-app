import React, { useState, useEffect } from "react";
import { Building2, RefreshCw, IndianRupee, Package, UserCheck, Users, LogOut, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  approved:  "bg-blue-100 text-blue-700",
  pending:   "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function BranchPortal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/portal/branch`, { credentials: "include" });
      if (!r.ok) { setError("Failed to load branch data"); setLoading(false); return; }
      setData(await r.json());
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const branch = data?.branch || {};
  const statusMap: Record<string, number> = data?.statusMap || {};
  const total = Object.values(statusMap).reduce((a: number, b: any) => a + Number(b), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Al Burhan Tours & Travels</p>
              <p className="text-xs text-muted-foreground mt-0.5">Branch Manager Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.mobile}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logout()}>
              <LogOut size={13} /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Page title + refresh */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{branch.name || "Your Branch"}</h1>
            {branch.city && <p className="text-sm text-muted-foreground">{branch.city}</p>}
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading your branch data…</div>
        ) : error ? (
          <div className="py-20 text-center text-red-500">{error}</div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border p-4 bg-white text-center">
                <IndianRupee size={18} className="text-emerald-600 mx-auto mb-1" />
                <p className="text-xl font-bold font-mono text-emerald-600">{fmt(data.totalRevenue || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Collected</p>
              </div>
              <div className="rounded-2xl border p-4 bg-white text-center">
                <Package size={18} className="text-blue-600 mx-auto mb-1" />
                <p className="text-xl font-bold font-mono text-blue-600">{total}</p>
                <p className="text-xs text-muted-foreground">Total Bookings</p>
              </div>
              <div className="rounded-2xl border p-4 bg-white text-center">
                <UserCheck size={18} className="text-teal-600 mx-auto mb-1" />
                <p className="text-xl font-bold font-mono text-teal-600">{data.activeAgents || 0}</p>
                <p className="text-xs text-muted-foreground">Active Agents</p>
              </div>
              <div className="rounded-2xl border p-4 bg-white text-center">
                <TrendingUp size={18} className="text-violet-600 mx-auto mb-1" />
                <p className="text-xl font-bold font-mono text-violet-600">{statusMap.confirmed || 0}</p>
                <p className="text-xs text-muted-foreground">Confirmed</p>
              </div>
            </div>

            {/* Booking status breakdown */}
            <div className="rounded-2xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Booking Status Breakdown</div>
              {Object.keys(statusMap).length === 0 ? (
                <p className="px-4 py-8 text-center text-muted-foreground text-sm">No bookings through this branch yet</p>
              ) : (
                Object.entries(statusMap).map(([status, cnt]) => (
                  <div key={status} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                    <Badge className={`capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>{status}</Badge>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${total > 0 ? Math.round((Number(cnt) / total) * 100) : 0}%` }} />
                    </div>
                    <span className="font-bold font-mono text-sm w-8 text-right">{cnt}</span>
                  </div>
                ))
              )}
            </div>

            {/* Recent bookings */}
            {data.recentBookings?.length > 0 && (
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Recent Bookings</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/10">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Booking #</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Package</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentBookings.map((b: any) => (
                        <tr key={b.id} className="border-b last:border-0 hover:bg-muted/10">
                          <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{b.customer_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{b.customer_mobile}</p>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{b.package_name || "—"}</td>
                          <td className="px-4 py-2.5">
                            <Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmt(Number(b.total_amount || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Branch details */}
            <div className="rounded-2xl border bg-white p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Branch Info</p>
                <p className="font-semibold">{branch.name}</p>
                {branch.city && <p className="text-sm text-muted-foreground">{branch.city}</p>}
                {branch.address && <p className="text-sm text-muted-foreground mt-1">{branch.address}</p>}
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Manager</p>
                <p className="font-semibold">{branch.manager_name || "—"}</p>
                {branch.manager_mobile && <p className="text-sm text-muted-foreground">{branch.manager_mobile}</p>}
                {branch.manager_email && <p className="text-sm text-muted-foreground">{branch.manager_email}</p>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
