import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Printer, UserCheck, Upload, Camera } from "lucide-react";
import { Link } from "wouter";
import { COMPANIES } from "@/lib/companies";

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

const ROLE_LABELS: Record<string, string> = {
  airport_staff: "Airport Staff",
  catering_staff: "Catering Staff",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [groups, setGroups] = useState<HajjGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "airport_staff" | "catering_staff">("all");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const { toast } = useToast();

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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/api/staff/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Staff member deleted" });
      fetchData();
    } catch { toast({ title: "Error deleting", variant: "destructive" }); }
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

  return (
    <AdminLayout>
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoChange} className="hidden" />

      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Staff ID Cards</h1>
          <p className="text-muted-foreground mt-1">Manage Airport & Catering Staff identification cards.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/staff/print">
            <Button variant="outline" className="gap-2 rounded-xl border-green-400 text-green-700 hover:bg-green-50">
              <Printer size={16} /> Print All Cards
            </Button>
          </Link>
          <Button onClick={openCreate} className="bg-primary text-white gap-2 rounded-xl">
            <Plus size={18} /> Add Staff
          </Button>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {(["all", "airport_staff", "catering_staff"] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filter === r
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {r === "all" ? `All (${staff.length})` : `${ROLE_LABELS[r]} (${staff.filter(s => s.role === r).length})`}
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
          <Button onClick={openCreate} variant="outline" className="rounded-xl"><Plus className="w-4 h-4 mr-2" /> Add First Staff</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(s => {
            const group = groups.find(g => g.id === s.groupId);
            return (
              <Card key={s.id} className="p-4 rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  {/* Photo */}
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
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(s)}><Edit size={13} /></Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-red-600" onClick={() => handleDelete(s.id, s.fullName)}><Trash2 size={13} /></Button>
                      </div>
                    </div>

                    <div className="mt-1 space-y-0.5">
                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        s.role === "catering_staff" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {ROLE_LABELS[s.role] || s.role}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingId ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">

            {/* Basic Info */}
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

            {/* Contact */}
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

            {/* Employment */}
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
    </AdminLayout>
  );
}
