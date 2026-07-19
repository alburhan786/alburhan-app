import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, ShieldCheck, Info, Plus, Pencil, KeyRound,
  Trash2, UserCheck, UserX, Eye, EyeOff, Copy, Shuffle, X,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  usePermissions,
  ROLE_LABELS, ROLE_COLORS,
  type AdminRole,
} from "@/hooks/use-permissions";

const API = import.meta.env.VITE_API_URL || "";

// ── Role definitions ──────────────────────────────────────────────────────────
const ADMIN_ROLES: AdminRole[] = [
  "super_admin", "admin", "accounts", "manager",
  "sales", "operations", "guide", "staff", "read_only",
];

const PORTAL_ROLE_OPTIONS = [
  { value: "super_admin",    label: "Super Admin",    desc: "Full system access", color: "bg-purple-100 text-purple-800" },
  { value: "admin",          label: "Admin",          desc: "Operational access", color: "bg-blue-100 text-blue-800" },
  { value: "branch_manager", label: "Branch Manager", desc: "Manage branch bookings", color: "bg-emerald-100 text-emerald-800" },
  { value: "agent",          label: "Agent",          desc: "Submit and track bookings", color: "bg-amber-100 text-amber-800" },
  { value: "staff",          label: "Staff",          desc: "Internal staff member", color: "bg-gray-100 text-gray-700" },
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

function roleBadge(role: string, adminRole?: string) {
  if (role === "admin") {
    const ar = adminRole as AdminRole || "admin";
    return <Badge className={`text-[10px] border-0 ${ROLE_COLORS[ar] || "bg-blue-100 text-blue-800"}`}>{ROLE_LABELS[ar] || ar}</Badge>;
  }
  const opt = PORTAL_ROLE_OPTIONS.find(o => o.value === role);
  if (!opt) return <Badge className="text-[10px] border-0 bg-gray-100">{role}</Badge>;
  return <Badge className={`text-[10px] border-0 ${opt.color}`}>{opt.label}</Badge>;
}

function generatePassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────
interface UserFormProps {
  editUser?: any;
  branches: { id: string; name: string; city?: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function UserFormModal({ editUser, branches, onClose, onSaved }: UserFormProps) {
  const { toast } = useToast();
  const isEdit = !!editUser;

  const [name, setName] = useState(editUser?.name || "");
  const [mobile, setMobile] = useState(editUser?.mobile || "");
  const [email, setEmail] = useState(editUser?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [portalRole, setPortalRole] = useState<string>(
    editUser
      ? editUser.role === "admin"
        ? (editUser.admin_role === "super_admin" ? "super_admin" : "admin")
        : editUser.role
      : "admin"
  );
  const [adminRole, setAdminRole] = useState<string>(editUser?.admin_role || "admin");
  const [branchId, setBranchId] = useState(editUser?.branch_id || "");
  const [commissionRate, setCommissionRate] = useState("5");
  const [sendCreds, setSendCreds] = useState(true);
  const [saving, setSaving] = useState(false);

  const needsBranch = portalRole === "branch_manager" || portalRole === "agent";
  const isAdminRole = portalRole === "super_admin" || portalRole === "admin";

  function autoPassword() {
    const pw = generatePassword();
    setPassword(pw);
    setConfirmPassword(pw);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" }); return;
    }
    if (!isEdit && password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return;
    }
    if (needsBranch && !branchId) {
      toast({ title: "Please select a branch", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      const url = isEdit ? `${API}/api/admin-users/${editUser.id}/edit` : `${API}/api/admin-users/create`;
      const method = isEdit ? "PUT" : "POST";
      const body: any = { name, email, send_credentials: sendCreds };
      if (!isEdit) {
        Object.assign(body, {
          mobile, password, portal_role: portalRole,
          admin_role: adminRole, branch_id: branchId || undefined,
          commission_rate: parseFloat(commissionRate) || 0,
        });
      } else {
        body.admin_role = isAdminRole ? adminRole : undefined;
      }

      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed");
      }
      toast({ title: isEdit ? "User updated" : "User created successfully" + (sendCreds ? " — credentials sent" : "") });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold">{isEdit ? "Edit User" : "Create New User"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Full Name */}
          <div>
            <Label className="text-sm font-medium">Full Name</Label>
            <Input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Mohammed Rizwan"
              className="mt-1"
            />
          </div>

          {/* Mobile */}
          {!isEdit && (
            <div>
              <Label className="text-sm font-medium">Mobile Number <span className="text-red-500">*</span></Label>
              <div className="flex mt-1">
                <span className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted text-sm text-muted-foreground">+91</span>
                <Input
                  value={mobile} onChange={e => setMobile(e.target.value)}
                  placeholder="9XXXXXXXXX" maxLength={10} required
                  className="rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Must be a unique 10-digit Indian mobile number</p>
            </div>
          )}

          {/* Email */}
          <div>
            <Label className="text-sm font-medium">Email Address</Label>
            <Input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com" className="mt-1"
            />
          </div>

          {/* Password (create only) */}
          {!isEdit && (
            <>
              <div>
                <Label className="text-sm font-medium">Password <span className="text-red-500">*</span></Label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Input
                      type={showPw ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min 6 characters" required minLength={6}
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={autoPassword} className="gap-1.5 shrink-0">
                    <Shuffle size={13} /> Auto
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Confirm Password <span className="text-red-500">*</span></Label>
                <Input
                  type={showPw ? "text" : "password"} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password" required minLength={6}
                  className="mt-1"
                />
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-0.5">Passwords do not match</p>
                )}
              </div>
            </>
          )}

          {/* Role */}
          {!isEdit && (
            <div>
              <Label className="text-sm font-medium">Role <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {PORTAL_ROLE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      portalRole === opt.value ? "border-[#0d5040] bg-[#0d5040]/5" : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <input
                      type="radio" name="portalRole" value={opt.value}
                      checked={portalRole === opt.value}
                      onChange={() => setPortalRole(opt.value)}
                      className="accent-[#0d5040]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{opt.label}</span>
                        <Badge className={`text-[10px] border-0 ${opt.color}`}>{opt.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Admin Role (for admin users) */}
          {(isAdminRole || (isEdit && editUser?.role === "admin")) && (
            <div>
              <Label className="text-sm font-medium">Admin Permission Level</Label>
              <select
                value={adminRole} onChange={e => setAdminRole(e.target.value)}
                className="w-full mt-1 h-9 px-3 rounded-md border text-sm bg-background"
              >
                {ADMIN_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Branch selection */}
          {!isEdit && needsBranch && (
            <>
              <div>
                <Label className="text-sm font-medium">Branch <span className="text-red-500">*</span></Label>
                <select
                  value={branchId} onChange={e => setBranchId(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-md border text-sm bg-background"
                  required
                >
                  <option value="">— Select Branch —</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.city ? ` (${b.city})` : ""}</option>
                  ))}
                </select>
              </div>
              {portalRole === "agent" && (
                <div>
                  <Label className="text-sm font-medium">Commission Rate (%)</Label>
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    value={commissionRate} onChange={e => setCommissionRate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
            </>
          )}

          {/* Send credentials */}
          {!isEdit && (
            <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-muted/20 cursor-pointer">
              <input
                type="checkbox" checked={sendCreds}
                onChange={e => setSendCreds(e.target.checked)}
                className="accent-[#0d5040] w-4 h-4"
              />
              <div>
                <p className="text-sm font-medium">Send login credentials</p>
                <p className="text-xs text-muted-foreground">Send mobile + password via WhatsApp, SMS & Email</p>
              </div>
            </label>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-[#0d5040] hover:bg-[#0d5040]/90" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [sendCreds, setSendCreds] = useState(true);
  const [saving, setSaving] = useState(false);

  function autoPassword() {
    const pw = generatePassword();
    setPassword(pw);
    setConfirmPassword(pw);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Min 6 characters", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin-users/${user.id}/reset-password`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, send_credentials: sendCreds }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      toast({ title: "Password reset" + (sendCreds ? " — credentials sent via WhatsApp/Email" : "") });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Reset Password</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">Resetting password for <strong>{user.name || user.mobile}</strong></p>
          <div>
            <Label className="text-sm font-medium">New Password</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters" required minLength={6} className="pr-9"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={autoPassword} className="gap-1.5 shrink-0">
                <Shuffle size={13} /> Auto
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Confirm Password</Label>
            <Input
              type={showPw ? "text" : "password"} value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter" required minLength={6} className="mt-1"
            />
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500 mt-0.5">Passwords do not match</p>
            )}
          </div>
          {password && (
            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border">
              <code className="text-sm font-mono flex-1 select-all">{password}</code>
              <button type="button" onClick={() => { navigator.clipboard.writeText(password); }} className="text-muted-foreground hover:text-foreground">
                <Copy size={14} />
              </button>
            </div>
          )}
          <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-muted/20 cursor-pointer">
            <input type="checkbox" checked={sendCreds} onChange={e => setSendCreds(e.target.checked)} className="accent-[#0d5040] w-4 h-4" />
            <p className="text-sm">Send new password via WhatsApp & Email</p>
          </label>
          <div className="flex gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#0d5040] hover:bg-[#0d5040]/90" disabled={saving}>
              {saving ? "Resetting…" : "Reset Password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({ user, onClose, onDeleted }: { user: any; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(`${API}/api/admin-users/${user.id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      toast({ title: "User deleted" });
      onDeleted();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <p className="font-bold">Delete User</p>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm">Are you sure you want to delete <strong>{user.name || user.mobile}</strong>?</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={deleting}>Cancel</Button>
          <Button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UserRolesManager() {
  const { toast } = useToast();
  const { adminRole: myRole, isAdminLevel, isSuper } = usePermissions();

  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [resetUser, setResetUser] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [ur, br] = await Promise.all([
        fetch(`${API}/api/admin-users/all`, { credentials: "include" }),
        fetch(`${API}/api/admin-users/branches`, { credentials: "include" }),
      ]);
      if (ur.ok) setUsers(await ur.json());
      if (br.ok) setBranches(await br.json());
    } catch (e: any) {
      toast({ title: "Failed to load users", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function changeRole(userId: string, newRole: AdminRole) {
    setSaving(userId);
    try {
      const r = await fetch(`${API}/api/admin-users/${userId}/role`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_role: newRole }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      toast({ title: `Role updated to ${ROLE_LABELS[newRole]}` });
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Role update failed", description: e.message, variant: "destructive" });
    }
    setSaving(null);
  }

  async function toggleStatus(u: any) {
    setTogglingId(u.id);
    try {
      const r = await fetch(`${API}/api/admin-users/${u.id}/toggle-status`, {
        method: "PUT", credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      const { is_active } = await r.json();
      toast({ title: is_active ? "User activated" : "User deactivated" });
      await loadUsers();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
    setTogglingId(null);
  }

  // Filtered users
  const filtered = users.filter(u => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      (u.name || "").toLowerCase().includes(term) ||
      u.mobile.includes(term) ||
      (u.email || "").toLowerCase().includes(term);
    const matchRole = filterRole === "all" || u.role === filterRole || u.admin_role === filterRole;
    return matchSearch && matchRole;
  });

  // Role counts for summary
  const counts = users.reduce((acc: Record<string, number>, u) => {
    const key = u.role === "admin" ? (u.admin_role || "admin") : u.role;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="space-y-5">

        {/* ── Page header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">User Roles & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage users, roles, and access permissions.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowMatrix(m => !m)}>
              <Info size={14} className="mr-1.5" />
              {showMatrix ? "Hide" : "Show"} Matrix
            </Button>
            <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            {isSuper && (
              <Button size="sm" className="bg-[#0d5040] hover:bg-[#0d5040]/90 gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Create User
              </Button>
            )}
          </div>
        </div>

        {/* ── My Role Banner ── */}
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <ShieldCheck size={20} className="text-[#0d5040] shrink-0" />
          <div>
            <p className="text-sm font-medium">
              Your role: <Badge className={`ml-1 text-xs border-0 ${ROLE_COLORS[myRole]}`}>{ROLE_LABELS[myRole]}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{ROLE_DESCRIPTIONS[myRole]}</p>
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Users", count: users.length, color: "text-[#0d5040]" },
            { label: "Super Admins", count: counts["super_admin"] || 0, color: "text-purple-700" },
            { label: "Branch Managers", count: counts["branch_manager"] || 0, color: "text-emerald-700" },
            { label: "Agents", count: counts["agent"] || 0, color: "text-amber-700" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Permissions Matrix ── */}
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
                    {ADMIN_ROLES.map(r => (
                      <th key={r} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${ROLE_COLORS[r]}`}>{ROLE_LABELS[r]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(MODULE_MATRIX).map(([mod, perms]) => (
                    <tr key={mod} className="hover:bg-muted/10">
                      <td className="px-3 py-1.5 font-medium">{mod}</td>
                      {ADMIN_ROLES.map(r => (
                        <td key={r} className={`px-2 py-1.5 text-center ${cellColor(perms[r] || "—")}`}>{perms[r] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Users Table ── */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Table header + filters */}
          <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">Users ({filtered.length}{users.length !== filtered.length ? ` of ${users.length}` : ""})</p>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Search by name / mobile / email…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm w-56"
              />
              <select
                value={filterRole} onChange={e => setFilterRole(e.target.value)}
                className="h-8 px-2 rounded-md border text-sm bg-background"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
                <option value="branch_manager">Branch Manager</option>
                <option value="agent">Agent</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>

          {!isAdminLevel && (
            <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-700">
              Only Super Admins can create, edit, or delete users. Contact a Super Admin to update permissions.
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-sm">No users found</p>
              {isSuper && (
                <Button size="sm" className="mt-3 bg-[#0d5040] hover:bg-[#0d5040]/90 gap-1.5" onClick={() => setShowCreate(true)}>
                  <Plus size={13} /> Create First User
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Name / Mobile</th>
                    <th className="px-4 py-2.5 text-left">Email</th>
                    <th className="px-4 py-2.5 text-left">Role</th>
                    <th className="px-4 py-2.5 text-left">Branch</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Joined</th>
                    {isAdminLevel && <th className="px-4 py-2.5 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(u => (
                    <tr key={u.id} className={`hover:bg-muted/10 ${!u.is_active ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.name || "—"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.mobile}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.email || "—"}</td>
                      <td className="px-4 py-3">
                        {roleBadge(u.role, u.admin_role)}
                        {u.role === "admin" && isSuper && (
                          <select
                            value={u.admin_role || "admin"}
                            disabled={saving === u.id}
                            onChange={e => changeRole(u.id, e.target.value as AdminRole)}
                            className="mt-1 block h-7 px-1.5 rounded border text-xs bg-background disabled:opacity-50 cursor-pointer"
                          >
                            {ADMIN_ROLES.map(r => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        )}
                        {saving === u.id && <span className="text-xs text-muted-foreground ml-1">Saving…</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.branch_name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] border-0 ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN") : "—"}
                      </td>
                      {isAdminLevel && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isSuper && (
                              <>
                                <button
                                  title="Edit user"
                                  onClick={() => setEditUser(u)}
                                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  title="Reset password"
                                  onClick={() => setResetUser(u)}
                                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  <KeyRound size={13} />
                                </button>
                                <button
                                  title={u.is_active ? "Deactivate" : "Activate"}
                                  onClick={() => toggleStatus(u)}
                                  disabled={togglingId === u.id}
                                  className={`p-1.5 rounded-md hover:bg-muted transition-colors ${u.is_active ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                                >
                                  {togglingId === u.id
                                    ? <RefreshCw size={13} className="animate-spin" />
                                    : u.is_active ? <UserX size={13} /> : <UserCheck size={13} />
                                  }
                                </button>
                                <button
                                  title="Delete user"
                                  onClick={() => setDeleteUser(u)}
                                  className="p-1.5 rounded-md hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Role Descriptions ── */}
        <div>
          <p className="text-sm font-semibold mb-3">Role Descriptions</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ADMIN_ROLES.map(role => (
              <div key={role} className="bg-white rounded-lg border p-3">
                <Badge className={`text-[10px] border-0 mb-1 ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</Badge>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <UserFormModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadUsers(); }}
        />
      )}
      {editUser && (
        <UserFormModal
          editUser={editUser}
          branches={branches}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); loadUsers(); }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => { setResetUser(null); }}
        />
      )}
      {deleteUser && (
        <DeleteConfirm
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => { setDeleteUser(null); loadUsers(); }}
        />
      )}
    </AdminLayout>
  );
}
