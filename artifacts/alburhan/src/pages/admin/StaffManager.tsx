import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteGuard } from "@/components/DeleteGuard";
import { Plus, Edit, Trash2, Printer, UserCheck, Upload, Camera, RefreshCw, ShieldCheck, Info, Users, FileSpreadsheet, CheckCircle2, XCircle, Download } from "lucide-react";
import { Link } from "wouter";
import { COMPANIES } from "@/lib/companies";
import { PermissionGuard } from "@/components/PermissionGuard";
import {
  usePermissions,
  ROLE_LABELS as ADMIN_ROLE_LABELS,
  ROLE_COLORS,
  type AdminRole,
} from "@/hooks/use-permissions";

const API = import.meta.env.VITE_API_URL || "";

interface StaffMember {
  id: string;
  staffId?: string;
  companyId: string;
  groupId?: string;
  fullName: string;
  fatherName?: string;
  designation?: string;
  department?: string;
  role: string;
  employeeCode?: string;
  mobileIndia?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  address?: string;
  aadhaarLast4?: string;
  emergencyContact?: string;
  emergencyMobile?: string;
  joiningDate?: string;
  validUpto?: string;
  photoUrl?: string;
  qrToken?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface HajjGroup {
  id: string;
  groupName: string;
  year: number;
}

const emptyForm = {
  companyId: "alburhan",
  groupId: "",
  fullName: "",
  fatherName: "",
  designation: "",
  department: "",
  role: "airport_staff",
  employeeCode: "",
  mobileIndia: "",
  bloodGroup: "",
  dateOfBirth: "",
  address: "",
  aadhaarLast4: "",
  emergencyContact: "",
  emergencyMobile: "",
  joiningDate: "",
  validUpto: "",
  status: "active",
  notes: "",
};

const STAFF_ROLE_LABELS: Record<string, string> = {
  airport_staff:  "Airport Staff",
  catering_staff: "Catering Staff",
  office_staff:   "Office Staff",
  group_guide:    "Group Guide",
  driver:         "Driver",
  medical_staff:  "Medical Staff",
  group_leader:   "Group Leader",
};

const ALL_ADMIN_ROLES: AdminRole[] = [
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

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function StaffManager() {
  const [activeTab, setActiveTab] = useState<"staff" | "roles">("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [groups, setGroups] = useState<HajjGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "airport_staff" | "catering_staff" | "office_staff" | "group_guide" | "driver" | "medical_staff" | "group_leader">("all");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  // Bulk import state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    imported: number;
    failed: number;
    rows: { staffId: string; fullName: string; row: number }[];
    errors: { row: number; name: string; reason: string }[];
  } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Admin roles tab state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const { toast } = useToast();
  const { requestDelete } = useDeleteGuard();
  const { adminRole: myRole, isAdminLevel } = usePermissions();

  const fetchData = useCallback(async () => {
    try {
      const [staffRes, groupsRes] = await Promise.all([
        fetch(`${API}/api/staff`, { credentials: "include" }),
        fetch(`${API}/api/groups`, { credentials: "include" }),
      ]);
      if (staffRes.ok) setStaff(await staffRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchAdminUsers = useCallback(async () => {
    setRolesLoading(true);
    try {
      const r = await fetch(`${API}/api/admin-users`, { credentials: "include" });
      if (r.ok) setAdminUsers(await r.json());
    } catch (e: any) {
      toast({ title: "Failed to load admin users", description: e.message, variant: "destructive" });
    }
    setRolesLoading(false);
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeTab === "roles") fetchAdminUsers(); }, [activeTab, fetchAdminUsers]);

  const f = (key: keyof typeof emptyForm, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (s: StaffMember) => {
    setEditingId(s.id);
    setForm({
      companyId: s.companyId,
      groupId: s.groupId || "",
      fullName: s.fullName,
      fatherName: s.fatherName || "",
      designation: s.designation || "",
      department: s.department || "",
      role: s.role,
      employeeCode: s.employeeCode || "",
      mobileIndia: s.mobileIndia || "",
      bloodGroup: s.bloodGroup || "",
      dateOfBirth: s.dateOfBirth || "",
      address: s.address || "",
      aadhaarLast4: s.aadhaarLast4 || "",
      emergencyContact: s.emergencyContact || "",
      emergencyMobile: s.emergencyMobile || "",
      joiningDate: s.joiningDate || "",
      validUpto: s.validUpto || "",
      status: s.status || "active",
      notes: s.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    if (form.aadhaarLast4 && !/^\d{4}$/.test(form.aadhaarLast4)) {
      toast({ title: "Aadhaar last 4 digits must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      const url = editingId ? `${API}/api/staff/${editingId}` : `${API}/api/staff`;
      const body = { ...form, groupId: form.groupId || null };
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      toast({ title: editingId ? "Staff member updated" : "Staff member created" });
      setDialogOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleDelete = (id: string, name: string) => {
    requestDelete(`Staff: ${name}`, async (token) => {
      await fetch(`${API}/api/staff/${id}`, {
        method: "DELETE", credentials: "include",
        headers: { "X-Delete-Token": token },
      });
      toast({ title: "Staff member deleted" });
      fetchData();
    });
  };

  const triggerPhotoUpload = (staffId: string) => {
    setUploadTargetId(staffId);
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;
    setPhotoUploading(uploadTargetId);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${API}/api/staff/${uploadTargetId}/photo`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Photo uploaded" });
      fetchData();
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setPhotoUploading(null);
      setUploadTargetId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "fullName", "fatherName", "designation", "department", "role",
      "companyId", "mobileIndia", "bloodGroup", "dateOfBirth", "address",
      "aadhaarLast4", "emergencyContact", "emergencyMobile",
      "joiningDate", "validUpto", "employeeCode", "status", "notes",
    ];
    const sample = [
      "Mohammed Altaf", "Abdul Rahman", "Ground Handler", "Operations", "airport_staff",
      "alburhan", "9876543210", "O+", "15 Jan 1990", "123 Main Street Hyderabad",
      "7890", "Father Name", "9876500000",
      "01 Jan 2025", "31 Dec 2026", "EMP-001", "active", "",
    ];
    const rows = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkImport = async () => {
    if (!bulkFile) return;
    setBulkImporting(true);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFile);
      const res = await fetch(`${API}/api/staff/bulk-import`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setBulkResult(data);
      if (data.imported > 0) fetchData();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setBulkImporting(false);
    }
  };

  const changeAdminRole = async (userId: string, newRole: AdminRole) => {
    setSavingRole(userId);
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
      toast({ title: `Role updated to ${ADMIN_ROLE_LABELS[newRole]}` });
      await fetchAdminUsers();
    } catch (e: any) {
      toast({ title: "Role update failed", description: e.message, variant: "destructive" });
    }
    setSavingRole(null);
  };

  const filtered = staff.filter(s => {
    if (filter !== "all" && s.role !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.staffId || "").toLowerCase().includes(q) ||
        (s.mobileIndia || "").includes(q) ||
        (s.designation || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const canEditRoles = myRole === "super_admin";

  return (
    <AdminLayout>
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" />

      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Staff & Access</h1>
          <p className="text-muted-foreground mt-1">Manage staff ID cards and admin user roles.</p>
        </div>
        {activeTab === "staff" && (
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin/staff/print">
              <Button variant="outline" className="gap-2 rounded-xl border-green-400 text-green-700 hover:bg-green-50">
                <Printer size={16} /> Print All Cards
              </Button>
            </Link>
            <PermissionGuard module="staff" action="create">
              <Button
                variant="outline"
                className="gap-2 rounded-xl border-blue-400 text-blue-700 hover:bg-blue-50"
                onClick={() => { setBulkFile(null); setBulkResult(null); setBulkDialogOpen(true); }}
              >
                <FileSpreadsheet size={16} /> Bulk Import
              </Button>
            </PermissionGuard>
            <PermissionGuard module="staff" action="create">
              <Button onClick={openCreate} className="bg-primary text-white gap-2 rounded-xl">
                <Plus size={18} /> Add Staff
              </Button>
            </PermissionGuard>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "staff"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserCheck size={15} /> Staff ID Cards ({staff.length})
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "roles"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck size={15} /> Admin User Roles ({adminUsers.length})
        </button>
      </div>

      {/* ── Staff Tab ── */}
      {activeTab === "staff" && (
        <>
          <div className="flex flex-wrap gap-2 mb-6 items-center">
            {(["all", "airport_staff", "catering_staff", "office_staff", "group_guide", "driver", "medical_staff", "group_leader"] as const).map(r => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  filter === r
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {r === "all" ? `All (${staff.length})` : `${STAFF_ROLE_LABELS[r]} (${staff.filter(s => s.role === r).length})`}
              </button>
            ))}
            <div className="ml-auto">
              <Input
                placeholder="Search by name, ID, mobile..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 w-56 rounded-full text-sm"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2">
              <UserCheck className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No staff members yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Add your first staff member to generate ID cards.</p>
              <PermissionGuard module="staff" action="create">
                <Button onClick={openCreate} variant="outline" className="rounded-xl"><Plus className="w-4 h-4 mr-2" /> Add First Staff</Button>
              </PermissionGuard>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(s => {
                const group = groups.find(g => g.id === s.groupId);
                return (
                  <Card key={s.id} className="p-4 rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        {s.photoUrl ? (
                          <img
                            src={`${API}${s.photoUrl}`}
                            alt={s.fullName}
                            className="w-14 h-14 rounded-lg object-cover border-2 border-primary/20"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50">
                            <Camera size={20} />
                          </div>
                        )}
                        <button
                          onClick={() => triggerPhotoUpload(s.id)}
                          disabled={photoUploading === s.id}
                          className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary/80 transition-colors"
                          title="Upload photo"
                        >
                          {photoUploading === s.id ? <span className="text-[6px]">...</span> : <Upload size={10} />}
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm truncate">{s.fullName}</h3>
                            {s.fatherName && <p className="text-xs text-muted-foreground truncate">S/o {s.fatherName}</p>}
                            <p className="text-xs text-muted-foreground truncate">{s.designation || "—"}</p>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <PermissionGuard module="staff" action="edit" asDisabled>
                              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(s)}><Edit size={13} /></Button>
                            </PermissionGuard>
                            <PermissionGuard module="staff" action="delete" asDisabled>
                              <Button variant="ghost" size="icon" className="w-7 h-7 text-red-600" onClick={() => handleDelete(s.id, s.fullName)}><Trash2 size={13} /></Button>
                            </PermissionGuard>
                          </div>
                        </div>

                        <div className="mt-1 space-y-0.5">
                          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            s.role === "catering_staff" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {STAFF_ROLE_LABELS[s.role] || s.role}
                          </span>
                          {s.staffId && <p className="text-[10px] font-mono text-muted-foreground">{s.staffId}</p>}
                          {group && <p className="text-[10px] text-muted-foreground">{group.groupName}</p>}
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            s.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {s.status === "active" ? "Active" : "Inactive"}
                          </span>
                          {s.validUpto && <span className="text-[10px] text-muted-foreground">Valid: {s.validUpto}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t text-[10px] text-muted-foreground">
                      {COMPANIES.find(c => c.id === s.companyId)?.nameShort || s.companyId}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Admin Roles Tab ── */}
      {activeTab === "roles" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Assign roles to admin users who log into this panel.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowMatrix(m => !m)}>
                <Info size={14} className="mr-1.5" />{showMatrix ? "Hide" : "Show"} Permissions Matrix
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAdminUsers} disabled={rolesLoading}>
                <RefreshCw size={14} className={`mr-1.5 ${rolesLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </div>

          {/* My Role Banner */}
          <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
            <ShieldCheck size={20} className="text-[#0d5040] shrink-0" />
            <div>
              <p className="text-sm font-medium">
                Your role: <Badge className={`ml-1 text-xs border-0 ${ROLE_COLORS[myRole]}`}>{ADMIN_ROLE_LABELS[myRole]}</Badge>
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
                      {ALL_ADMIN_ROLES.map(r => (
                        <th key={r} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${ROLE_COLORS[r]}`}>
                            {ADMIN_ROLE_LABELS[r]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      ["Bookings",    { super_admin: "All", admin: "All", accounts: "View", manager: "Edit", sales: "Edit", operations: "View", guide: "—", staff: "—", read_only: "View" }],
                      ["Payments",    { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "Create", operations: "View", guide: "—", staff: "—", read_only: "View" }],
                      ["Expenses",    { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "View", guide: "—", staff: "—", read_only: "View" }],
                      ["Accounting",  { super_admin: "All", admin: "All", accounts: "All", manager: "View", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "View" }],
                      ["Payroll",     { super_admin: "All", admin: "All", accounts: "All", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" }],
                      ["Groups",      { super_admin: "All", admin: "All", accounts: "View", manager: "All", sales: "View", operations: "All", guide: "View", staff: "View", read_only: "View" }],
                      ["Pilgrims",    { super_admin: "All", admin: "All", accounts: "View", manager: "All", sales: "View", operations: "All", guide: "View", staff: "View", read_only: "View" }],
                      ["Audit Logs",  { super_admin: "All", admin: "All", accounts: "View", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" }],
                      ["User Roles",  { super_admin: "All", admin: "View", accounts: "—", manager: "—", sales: "—", operations: "—", guide: "—", staff: "—", read_only: "—" }],
                    ].map(([mod, perms]) => (
                      <tr key={mod as string} className="hover:bg-muted/10">
                        <td className="px-3 py-1.5 font-medium">{mod as string}</td>
                        {ALL_ADMIN_ROLES.map(r => {
                          const val = (perms as any)[r] || "—";
                          return (
                            <td key={r} className={`px-2 py-1.5 text-center ${val === "All" ? "text-green-700 font-bold" : val === "—" ? "text-red-400" : "text-blue-600"}`}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Role Reference Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ALL_ADMIN_ROLES.map(role => (
              <div key={role} className="bg-white rounded-lg border p-3">
                <Badge className={`text-[10px] border-0 mb-1 ${ROLE_COLORS[role]}`}>{ADMIN_ROLE_LABELS[role]}</Badge>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>

          {/* Admin Users Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <Users size={15} className="text-muted-foreground" />
              <p className="text-sm font-semibold">Admin Users ({adminUsers.length})</p>
              {!canEditRoles && (
                <p className="text-xs text-muted-foreground ml-2">
                  Only Super Admins can change roles.
                </p>
              )}
            </div>
            {rolesLoading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
            ) : adminUsers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No admin users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Name / Mobile</th>
                      <th className="px-4 py-2.5 text-left">Email</th>
                      <th className="px-4 py-2.5 text-left">Current Role</th>
                      {canEditRoles && <th className="px-4 py-2.5 text-left">Change Role</th>}
                      <th className="px-4 py-2.5 text-left">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {adminUsers.map(u => {
                      const role = (u.admin_role || "read_only") as AdminRole;
                      return (
                        <tr key={u.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <p className="font-medium">{u.name || "—"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{u.mobile}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{u.email || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[11px] border-0 ${ROLE_COLORS[role]}`}>
                              {ADMIN_ROLE_LABELS[role] || role}
                            </Badge>
                          </td>
                          {canEditRoles && (
                            <td className="px-4 py-3">
                              <select
                                value={role}
                                disabled={savingRole === u.id}
                                onChange={e => changeAdminRole(u.id, e.target.value as AdminRole)}
                                className="h-8 px-2 rounded border text-sm bg-background disabled:opacity-50 cursor-pointer"
                              >
                                {ALL_ADMIN_ROLES.map(r => (
                                  <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                              {savingRole === u.id && (
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
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingId ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
            {editingId && (() => {
              const s = staff.find(x => x.id === editingId);
              return s?.staffId ? (
                <p className="text-sm text-muted-foreground font-mono mt-0.5">
                  ID: <span className="font-bold text-primary">{s.staffId}</span>
                </p>
              ) : null;
            })()}
          </DialogHeader>
          <div className="space-y-6 mt-4">

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-muted-foreground">Basic Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium">Full Name *</label>
                  <Input value={form.fullName} onChange={e => f("fullName", e.target.value)} placeholder="e.g. Mohammed Altaf" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium">Father's Name</label>
                  <Input value={form.fatherName} onChange={e => f("fatherName", e.target.value)} placeholder="e.g. Abdul Rahman" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Company</label>
                  <select value={form.companyId} onChange={e => f("companyId", e.target.value)} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                    {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.nameShort}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Role / Type</label>
                  <select value={form.role} onChange={e => f("role", e.target.value)} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                    <option value="airport_staff">Airport Staff</option>
                    <option value="catering_staff">Catering Staff</option>
                    <option value="office_staff">Office Staff</option>
                    <option value="group_guide">Group Guide</option>
                    <option value="driver">Driver</option>
                    <option value="medical_staff">Medical Staff</option>
                    <option value="group_leader">Group Leader</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Designation</label>
                  <Input value={form.designation} onChange={e => f("designation", e.target.value)} placeholder="e.g. Ground Handler" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Department</label>
                  <Input value={form.department} onChange={e => f("department", e.target.value)} placeholder="e.g. Operations" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Hajj Group (optional)</label>
                  <select value={form.groupId} onChange={e => f("groupId", e.target.value)} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                    <option value="">No group</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.groupName} ({g.year})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Employee Code</label>
                  <Input value={form.employeeCode} onChange={e => f("employeeCode", e.target.value)} placeholder="e.g. EMP-001" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Blood Group</label>
                  <select value={form.bloodGroup} onChange={e => f("bloodGroup", e.target.value)} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-muted-foreground">Contact & Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Mobile (India)</label>
                  <Input value={form.mobileIndia} onChange={e => f("mobileIndia", e.target.value)} placeholder="+91 98XXXXXXXX" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date of Birth</label>
                  <Input value={form.dateOfBirth} onChange={e => f("dateOfBirth", e.target.value)} placeholder="e.g. 15 Jan 1990" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Aadhaar Last 4 Digits</label>
                  <Input
                    value={form.aadhaarLast4}
                    onChange={e => f("aadhaarLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="e.g. 7890"
                    maxLength={4}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium">Address</label>
                  <Input value={form.address} onChange={e => f("address", e.target.value)} placeholder="Home address" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Emergency Contact Name</label>
                  <Input value={form.emergencyContact} onChange={e => f("emergencyContact", e.target.value)} placeholder="e.g. Father's name" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Emergency Mobile</label>
                  <Input value={form.emergencyMobile} onChange={e => f("emergencyMobile", e.target.value)} placeholder="+91 98XXXXXXXX" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3 text-muted-foreground">Employment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Joining Date</label>
                  <Input value={form.joiningDate} onChange={e => f("joiningDate", e.target.value)} placeholder="e.g. 01 Jan 2025" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Valid Upto</label>
                  <Input value={form.validUpto} onChange={e => f("validUpto", e.target.value)} placeholder="e.g. 31 Dec 2026" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={e => f("status", e.target.value)} className="w-full h-9 px-3 border border-input rounded-md text-sm bg-background">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium">Notes</label>
                  <Input value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Any additional notes" />
                </div>
              </div>
            </div>

          </div>
          <div className="flex gap-3 mt-6">
            <Button onClick={handleSave} className="flex-1 bg-primary text-white">
              {editingId ? "Save Changes" : "Add Staff Member"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Bulk Import Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={open => { setBulkDialogOpen(open); if (!open) { setBulkFile(null); setBulkResult(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              <FileSpreadsheet size={22} /> Bulk Import Staff
            </DialogTitle>
          </DialogHeader>

          {!bulkResult ? (
            <div className="space-y-5 mt-4">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">How to use bulk import:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Download the CSV template below and fill in your staff data.</li>
                  <li>Required column: <span className="font-mono font-bold">fullName</span></li>
                  <li>Role values: <span className="font-mono">airport_staff</span>, <span className="font-mono">catering_staff</span>, <span className="font-mono">office_staff</span></li>
                  <li>Maximum 500 rows per import.</li>
                  <li>Upload the completed file (CSV or Excel) and click Import.</li>
                </ol>
              </div>

              {/* Template download */}
              <div>
                <Button variant="outline" className="gap-2 rounded-xl border-blue-300 text-blue-700 hover:bg-blue-50" onClick={downloadTemplate}>
                  <Download size={15} /> Download CSV Template
                </Button>
              </div>

              {/* File picker */}
              <div>
                <label className="text-sm font-medium block mb-1.5">Upload your file (CSV or Excel)</label>
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => setBulkFile(e.target.files?.[0] || null)}
                />
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    bulkFile ? "border-primary/50 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30"
                  }`}
                  onClick={() => bulkFileInputRef.current?.click()}
                >
                  {bulkFile ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <FileSpreadsheet size={20} />
                      <span className="font-medium text-sm">{bulkFile.name}</span>
                      <span className="text-xs text-muted-foreground">({(bulkFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <FileSpreadsheet size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Click to browse or drag a file here</p>
                      <p className="text-xs mt-1">Supports CSV, .xlsx, .xls</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleBulkImport}
                  disabled={!bulkFile || bulkImporting}
                  className="flex-1 bg-primary text-white gap-2"
                >
                  {bulkImporting ? (
                    <><RefreshCw size={15} className="animate-spin" /> Importing…</>
                  ) : (
                    <><Upload size={15} /> Import Staff</>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setBulkDialogOpen(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 mt-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 size={22} className="text-green-600 shrink-0" />
                  <div>
                    <p className="text-2xl font-bold text-green-700">{bulkResult.imported}</p>
                    <p className="text-sm text-green-600">Successfully imported</p>
                  </div>
                </div>
                <div className={`border rounded-xl p-4 flex items-center gap-3 ${bulkResult.failed > 0 ? "bg-red-50 border-red-200" : "bg-muted border-muted"}`}>
                  <XCircle size={22} className={bulkResult.failed > 0 ? "text-red-500 shrink-0" : "text-muted-foreground shrink-0"} />
                  <div>
                    <p className={`text-2xl font-bold ${bulkResult.failed > 0 ? "text-red-600" : "text-muted-foreground"}`}>{bulkResult.failed}</p>
                    <p className={`text-sm ${bulkResult.failed > 0 ? "text-red-500" : "text-muted-foreground"}`}>Failed rows</p>
                  </div>
                </div>
              </div>

              {/* Imported rows */}
              {bulkResult.rows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 text-green-700">Imported Staff</p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                    {bulkResult.rows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30">
                        <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                        <span className="font-mono text-xs text-muted-foreground">{r.staffId}</span>
                        <span className="flex-1 truncate">{r.fullName}</span>
                        <span className="text-xs text-muted-foreground">Row {r.row}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error rows */}
              {bulkResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2 text-red-600">Failed Rows</p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border divide-y text-sm">
                    {bulkResult.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-red-50/40">
                        <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">(Row {e.row})</span>
                          <p className="text-xs text-red-500 mt-0.5">{e.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setBulkFile(null); setBulkResult(null); }}
                  className="flex-1 gap-2"
                >
                  <Upload size={14} /> Import Another File
                </Button>
                <Button onClick={() => setBulkDialogOpen(false)} className="flex-1 bg-primary text-white">Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
