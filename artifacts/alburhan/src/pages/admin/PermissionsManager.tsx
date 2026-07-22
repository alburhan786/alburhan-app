import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, RefreshCw, Users, Lock, CheckCircle2, UserCog, Key, Settings } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

const ROLE_PERMISSIONS: Record<string, { label: string; perms: string[]; color: string }> = {
  admin: {
    label: "Super Admin",
    color: "bg-red-100 text-red-700",
    perms: ["Full system access", "All dashboards", "User management", "Financial data", "System settings", "Delete records", "Export data", "API access"],
  },
  branch_manager: {
    label: "Branch Manager",
    color: "bg-blue-100 text-blue-700",
    perms: ["Branch bookings", "Agent management", "Branch reports", "Customer view", "Partial financial"],
  },
  agent: {
    label: "Agent",
    color: "bg-violet-100 text-violet-700",
    perms: ["Create bookings", "Customer management", "Own bookings view", "Package catalog"],
  },
  staff: {
    label: "Staff",
    color: "bg-emerald-100 text-emerald-700",
    perms: ["Pilgrim operations", "Group tracking", "Print center", "Medical records"],
  },
  customer: {
    label: "Customer",
    color: "bg-amber-100 text-amber-700",
    perms: ["Own booking view", "Document download", "Payment access", "Agreement signing"],
  },
};

export default function PermissionsManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const u = await fetch(`${API}/api/admin/users`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setUsers(Array.isArray(u) ? u : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const roleCounts: Record<string, number> = {};
  for (const u of users) {
    const r = u.role || "customer";
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Shield size={18} className="text-primary" /></div>
              Permission Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Role-based access control — permissions matrix and user role assignment</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/user-roles"><Button size="sm" className="gap-1.5"><UserCog size={13} /> Manage Roles</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(ROLE_PERMISSIONS).map(([role, info]) => (
            <div key={role} className={`rounded-2xl border p-3 ${info.color.replace("text-", "border-").replace("-700", "-200")} ${info.color.replace("text-", "bg-").replace("-700", "-50")}`}>
              <Shield size={16} className="mb-1 opacity-70" />
              <p className="text-lg font-bold">{roleCounts[role] || 0}</p>
              <p className="text-xs mt-0.5 opacity-70">{info.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-4">Permissions Matrix</h2>
          <div className="space-y-4">
            {Object.entries(ROLE_PERMISSIONS).map(([role, info]) => (
              <div key={role} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${info.color}`} variant="outline">{info.label}</Badge>
                    <span className="text-xs text-muted-foreground">{roleCounts[role] || 0} users</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{info.perms.length} permissions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {info.perms.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                      <CheckCircle2 size={9} className="text-emerald-500" /> {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Recent Users by Role</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left font-medium">Name</th>
                    <th className="pb-2 text-left font-medium">Mobile</th>
                    <th className="pb-2 text-left font-medium">Role</th>
                    <th className="pb-2 text-left font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 10).map((u, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{u.name || u.full_name || "—"}</td>
                      <td className="py-2 text-muted-foreground">{u.mobile || "—"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={`text-xs ${ROLE_PERMISSIONS[u.role]?.color || "bg-gray-100 text-gray-600"}`}>
                          {ROLE_PERMISSIONS[u.role]?.label || u.role || "customer"}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "User & Roles", href: "/admin/user-roles", icon: UserCog },
            { label: "Audit Logs", href: "/admin/audit-logs", icon: Key },
            { label: "Security", href: "/admin/security", icon: Lock },
            { label: "Settings", href: "/admin/settings", icon: Settings },
          ].map(a => (
            <Link key={a.href} href={a.href}>
              <div className="rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-3">
                <a.icon size={16} className="text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
