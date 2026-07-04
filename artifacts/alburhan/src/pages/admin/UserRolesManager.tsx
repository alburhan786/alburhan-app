import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ShieldCheck, Info } from "lucide-react";
import {
  usePermissions,
  ROLE_LABELS, ROLE_COLORS,
  type AdminRole,
} from "@/hooks/use-permissions";

const API = import.meta.env.VITE_API_URL || "";

const ALL_ROLES: AdminRole[] = [
  "super_admin", "admin", "accounts", "manager",
  "sales", "operations", "guide", "staff", "read_only",
];

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full access including user management and audit logs",
  admin: "Full operational access; cannot manage user roles",
  accounts: "Full access to Finance, Expenses, GST, Payroll, Assets",
  manager: "Manage groups, pilgrims, customers; view financial data",
  sales: "Create/manage bookings and payments; manage customers",
  operations: "Manage groups, flights, hotels, buses, pilgrims",
  guide: "Read-only access to group pilgrim list",
  staff: "View groups and pilgrims only",
  read_only: "View and export any data; no create/edit/delete",
};

const MODULE_MATRIX: Record<string, Partial<Record<AdminRole, string>>> = {
  "Bookings":    { super_admin: "All", admin: "All", accounts: "View", manager: "Edit", sales: "Edit", operations: "View", guide: "—", staff: "—", read_only: "View" },
  "Payments":    { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "Create", operations: "View", guide: "—", staff: "—", read_only: "View" },
  "Expenses":    { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "View", guide: "—", staff: "—", read_only: "View" },
  "Accounting":  { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "View" },
  "Payroll":     { super_admin: "All", admin: "All", accounts: "All", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" },
  "GST Reports": { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "View" },
  "Assets":      { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "View", guide: "—", staff: "—", read_only: "View" },
  "Groups":      { super_admin: "All", admin: "All", accounts: "View", manager: "All", sales: "View", operations: "All", guide: "View", staff: "View", read_only: "View" },
  "Pilgrims":    { super_admin: "All", admin: "All", accounts: "View", manager: "All", sales: "View", operations: "All", guide: "View", staff: "View", read_only: "View" },
  "Customers":   { super_admin: "All", admin: "All", accounts: "View", manager: "Edit", sales: "All", operations: "View", guide: "—", staff: "—", read_only: "View" },
  "Audit Logs":  { super_admin: "All", admin: "All", accounts: "View", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" },
  "User Roles":  { super_admin: "All", admin: "View", accounts: "—", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" },
};

function cellColor(val: string) {
  if (val === "All") return "text-green-700 font-bold";
  if (val === "—") return "text-red-400";
  return "text-blue-600";
}

export default function UserRolesManager() {
  const { toast } = useToast();
  const { adminRole: myRole, isAdminLevel } = usePermissions();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin-users`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      setUsers(await r.json());
    } catch (e: any) {
      toast({ title: "Failed to load users", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function changeRole(userId: string, newRole: AdminRole) {
    setSaving(userId);
    try {
      const r = await fetch(`${API}/api/admin-users/${userId}/role`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_role: newRole }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to update role");
      }
      toast({ title: `Role updated to ${ROLE_LABELS[newRole]}` });
      await load();
    } catch (e: any) {
      toast({ title: "Role update failed", description: e.message, variant: "destructive" });
    }
    setSaving(null);
  }

  const canEdit = myRole === "super_admin";

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">User Roles & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage what each admin user can access and do.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowMatrix(m => !m)}>
              <Info size={14} className="mr-1.5" />{showMatrix ? "Hide" : "Show"} Permissions Matrix
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        </div>

        {/* My Role Banner */}
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <ShieldCheck size={20} className="text-[#0d5040] shrink-0" />
          <div>
            <p className="text-sm font-medium">
              Your role: <Badge className={`ml-1 text-xs border-0 ${ROLE_COLORS[myRole]}`}>{ROLE_LABELS[myRole]}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{ROLE_DESCRIPTIONS[myRole]}</p>
          </div>
        </div>

        {/* Permissions Matrix */}
        {showMatrix && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <p className="text-sm font-semibold">Permissions Matrix</p>
              <p className="text-xs text-muted-foreground">What each role can do per module</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Module</th>
                    {ALL_ROLES.map(r => (
                      <th key={r} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${ROLE_COLORS[r]}`}>
                          {ROLE_LABELS[r]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(MODULE_MATRIX).map(([mod, perms]) => (
                    <tr key={mod} className="hover:bg-muted/10">
                      <td className="px-3 py-1.5 font-medium">{mod}</td>
                      {ALL_ROLES.map(r => (
                        <td key={r} className={`px-2 py-1.5 text-center ${cellColor(perms[r] || "—")}`}>
                          {perms[r] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Role Descriptions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ALL_ROLES.map(role => (
            <div key={role} className="bg-white rounded-lg border p-3">
              <Badge className={`text-[10px] border-0 mb-1 ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</Badge>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>

        {/* Admin Users List */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-sm font-semibold">Admin Users ({users.length})</p>
            {!canEdit && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Only Super Admins can change roles. Contact a Super Admin to update permissions.
              </p>
            )}
          </div>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No admin users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Name / Mobile</th>
                    <th className="px-4 py-2.5 text-left">Email</th>
                    <th className="px-4 py-2.5 text-left">Current Role</th>
                    {canEdit && <th className="px-4 py-2.5 text-left">Change Role</th>}
                    <th className="px-4 py-2.5 text-left">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(u => {
                    const role = (u.admin_role || "super_admin") as AdminRole;
                    return (
                      <tr key={u.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{u.name || "—"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{u.mobile}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{u.email || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[11px] border-0 ${ROLE_COLORS[role]}`}>
                            {ROLE_LABELS[role] || role}
                          </Badge>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <select
                              value={role}
                              disabled={saving === u.id}
                              onChange={e => changeRole(u.id, e.target.value as AdminRole)}
                              className="h-8 px-2 rounded border text-sm bg-background disabled:opacity-50 cursor-pointer"
                            >
                              {ALL_ROLES.map(r => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                            {saving === u.id && (
                              <span className="ml-2 text-xs text-muted-foreground">Saving…</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
