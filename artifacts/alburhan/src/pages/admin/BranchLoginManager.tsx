import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, RefreshCw, ShieldCheck, UserX, UserCheck, KeyRound, Plus, Mail } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

export default function BranchLoginManager() {
  const [branches, setBranches] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [br, ad] = await Promise.all([
        fetch(`${API}/api/admin/branches`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin-users`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setBranches(Array.isArray(br) ? br : []);
      const branchManagers = (Array.isArray(ad) ? ad : []).filter((u: any) => u.role === "branch_manager");
      setAdmins(branchManagers);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const active   = admins.filter(a => a.isActive !== false).length;
  const inactive = admins.filter(a => a.isActive === false).length;

  const toggleStatus = async (id: number, current: boolean) => {
    try {
      await fetch(`${API}/api/admin-users/${id}`, { method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }) });
      toast({ title: "Status updated" });
      load();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><KeyRound size={18} className="text-primary" /></div>
              Branch Login Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage branch manager accounts and access</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/user-roles"><Button size="sm" className="gap-1.5"><Plus size={13} /> Add Branch Login</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Building2,  label: "Total Branches",  val: branches.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: UserCheck,  label: "Active Logins",   val: active,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: UserX,      label: "Disabled Logins", val: inactive,        color: "bg-red-50 border-red-200 text-red-700" },
            { icon: ShieldCheck,label: "Total Managers",  val: admins.length,   color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Managers Table */}
        <div className="rounded-2xl border bg-card">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">Branch Manager Accounts</h2>
            <Link href="/admin/branches"><Button variant="ghost" size="sm">Manage Branches →</Button></Link>
          </div>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading accounts…</div>
          ) : admins.length === 0 ? (
            <div className="py-16 text-center">
              <KeyRound size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground mb-3">No branch manager accounts found.</p>
              <Link href="/admin/user-roles"><Button size="sm">Create Branch Login</Button></Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  {["Name","Email","Branch","Role","Status","Action"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {admins.map((a, i) => (
                    <tr key={a.id || i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{a.name || a.username || "—"}</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Mail size={12} />{a.email || "—"}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{a.branch || a.branchName || "—"}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{a.role || "branch_manager"}</Badge></td>
                      <td className="px-4 py-3">
                        <Badge variant={a.isActive === false ? "destructive" : "default"} className="text-xs">
                          {a.isActive === false ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(a.id, a.isActive !== false)}>
                          {a.isActive === false ? "Enable" : "Disable"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/user-roles"><Button variant="outline" size="sm" className="gap-1.5"><KeyRound size={13} /> User Roles</Button></Link>
            <Link href="/admin/branches"><Button variant="outline" size="sm" className="gap-1.5"><Building2 size={13} /> Branch Management</Button></Link>
            <Link href="/admin/branch-dashboard"><Button variant="outline" size="sm" className="gap-1.5"><Building2 size={13} /> Branch Dashboard</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
