import { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Eye, CheckCircle, XCircle, Clock, Plus, User, FileText, RefreshCw, Search } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

function DocLink({ label, url }: { label: string; url?: string | null }) {
  if (!url) return <span className="text-muted-foreground text-xs">Not uploaded</span>;
  const full = `${BASE_API}${url}`;
  const isImage = url.match(/\.(jpg|jpeg|png|webp)$/i);
  return (
    <a href={full} target="_blank" rel="noopener noreferrer"
      className="text-primary underline text-xs font-medium">
      {isImage ? (
        <img src={full} alt={label} className="h-16 rounded-lg border object-cover hover:opacity-80 transition" />
      ) : `View ${label}`}
    </a>
  );
}

function FileUploadField({ label, name, accept = "image/jpeg,image/png,image/webp,application/pdf" }: {
  label: string; name: string; accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="border border-dashed border-border rounded-lg p-2 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => inputRef.current?.click()}>
        <p className="text-xs text-muted-foreground">{file ? file.name : "Click to upload"}</p>
        <input ref={inputRef} type="file" name={name} accept={accept} className="hidden"
          onChange={e => setFile(e.target.files?.[0] || null)} />
      </div>
    </div>
  );
}

interface KYCEntry {
  id: string;
  userId: string;
  name?: string;
  phone?: string;
  photoUrl?: string;
  kycStatus: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  createdAt?: string;
  userMobile?: string;
  userName?: string;
}

interface KYCDetail extends KYCEntry {
  whatsappNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  passportIssueDate?: string;
  passportPlaceOfIssue?: string;
  passportImageUrl?: string;
  bloodGroup?: string;
  aadharNumber?: string;
  aadharImageUrl?: string;
  panNumber?: string;
  panImageUrl?: string;
  healthCertificateUrl?: string;
  adminNotes?: string;
  user?: { name?: string; mobile?: string };
}

export default function KYCManager() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<KYCEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewProfile, setViewProfile] = useState<KYCDetail | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);
  const [customers, setCustomers] = useState<{ id: string; name?: string; mobile: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_API}/api/kyc/admin/all`, { credentials: "include" });
      if (res.ok) setProfiles(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadCustomers = async () => {
    const res = await fetch(`${BASE_API}/api/admin/customers`, { credentials: "include" });
    if (res.ok) setCustomers(await res.json());
  };

  const openView = async (id: string) => {
    const res = await fetch(`${BASE_API}/api/kyc/admin/${id}`, { credentials: "include" });
    if (res.ok) {
      setViewProfile(await res.json());
      setViewOpen(true);
    }
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    const res = await fetch(`${BASE_API}/api/kyc/admin/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status, adminNotes: notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: "Error", description: data.message, variant: "destructive" });
      return;
    }
    toast({ title: `KYC ${status}`, description: `Status updated to ${status}` });
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, kycStatus: status } : p));
    if (viewProfile?.id === id) setViewProfile(prev => prev ? { ...prev, kycStatus: status, adminNotes: notes } : prev);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFormRef.current) return;
    setAddLoading(true);
    try {
      const fd = new FormData(addFormRef.current);
      const res = await fetch(`${BASE_API}/api/kyc/admin/create`, {
        method: "POST", body: fd, credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "KYC record created successfully" });
      setAddOpen(false);
      addFormRef.current?.reset();
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddLoading(false);
    }
  };

  const filtered = profiles.filter(p => {
    const matchSearch = !search ||
      [p.name, p.phone, p.userMobile, p.passportNumber, p.userName].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "all" || p.kycStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <ShieldCheck size={28} className="text-primary" /> KYC Management
          </h1>
          <p className="text-muted-foreground mt-1">Review and manage customer identity verification.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </Button>
          <Button className="bg-primary text-white gap-2 rounded-xl" onClick={() => { loadCustomers(); setAddOpen(true); }}>
            <Plus size={18} /> Add KYC
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, phone, passport..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-md border bg-background text-sm">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-4">Customer</th>
                <th className="px-4 py-4">Phone</th>
                <th className="px-4 py-4">Passport No.</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Submitted</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No KYC records found.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.photoUrl ? (
                        <img src={`${BASE_API}${p.photoUrl}`} alt={p.name || ""} className="w-9 h-9 rounded-full object-cover border" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                          <User size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{p.name || p.userName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.userMobile}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.phone || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.passportNumber || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[p.kycStatus] || "bg-muted"}`}>
                      {p.kycStatus.charAt(0).toUpperCase() + p.kycStatus.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="View" onClick={() => openView(p.id)}>
                        <Eye size={15} />
                      </Button>
                      {p.kycStatus !== "approved" && (
                        <Button variant="ghost" size="icon" title="Approve" className="text-emerald-600 hover:text-emerald-700"
                          onClick={() => updateStatus(p.id, "approved")}>
                          <CheckCircle size={15} />
                        </Button>
                      )}
                      {p.kycStatus !== "rejected" && (
                        <Button variant="ghost" size="icon" title="Reject" className="text-red-500 hover:text-red-600"
                          onClick={() => updateStatus(p.id, "rejected")}>
                          <XCircle size={15} />
                        </Button>
                      )}
                      {p.kycStatus !== "pending" && (
                        <Button variant="ghost" size="icon" title="Set Pending" className="text-amber-500 hover:text-amber-600"
                          onClick={() => updateStatus(p.id, "pending")}>
                          <Clock size={15} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <User size={18} /> KYC Details
            </DialogTitle>
          </DialogHeader>
          {viewProfile && (
            <div className="space-y-5 mt-2">
              <div className="flex items-center gap-4">
                {viewProfile.photoUrl ? (
                  <img src={`${BASE_API}${viewProfile.photoUrl}`} alt="Photo" className="w-16 h-16 rounded-full object-cover border-2 border-primary" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <User size={24} className="text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-lg">{viewProfile.name || "—"}</p>
                  <p className="text-muted-foreground text-sm">{viewProfile.user?.mobile || viewProfile.userMobile}</p>
                  <span className={`mt-1 inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[viewProfile.kycStatus]}`}>
                    {viewProfile.kycStatus}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Personal Info</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Phone:</span> {viewProfile.phone || "—"}</div>
                  <div><span className="font-medium">WhatsApp:</span> {viewProfile.whatsappNumber || "—"}</div>
                  <div><span className="font-medium">DOB:</span> {viewProfile.dateOfBirth || "—"}</div>
                  <div><span className="font-medium">Gender:</span> {viewProfile.gender || "—"}</div>
                  <div><span className="font-medium">Blood Group:</span> {viewProfile.bloodGroup || "—"}</div>
                  <div className="col-span-2"><span className="font-medium">Address:</span> {viewProfile.address || "—"}</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Passport</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Number:</span> {viewProfile.passportNumber || "—"}</div>
                  <div><span className="font-medium">Place of Issue:</span> {viewProfile.passportPlaceOfIssue || "—"}</div>
                  <div><span className="font-medium">Issue Date:</span> {viewProfile.passportIssueDate || "—"}</div>
                  <div><span className="font-medium">Expiry:</span> {viewProfile.passportExpiryDate || "—"}</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">Documents</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs font-medium mb-1">Passport Copy</p><DocLink label="Passport" url={viewProfile.passportImageUrl} /></div>
                  <div><p className="text-xs font-medium mb-1">Aadhaar</p><DocLink label="Aadhaar" url={viewProfile.aadharImageUrl} /></div>
                  <div><p className="text-xs font-medium mb-1">PAN Card</p><DocLink label="PAN" url={viewProfile.panImageUrl} /></div>
                  <div><p className="text-xs font-medium mb-1">Health Certificate</p><DocLink label="Health Cert" url={viewProfile.healthCertificateUrl} /></div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground mb-2">ID Numbers</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Aadhaar:</span> {viewProfile.aadharNumber || "—"}</div>
                  <div><span className="font-medium">PAN:</span> {viewProfile.panNumber || "—"}</div>
                </div>
              </div>

              {viewProfile.adminNotes && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-bold text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm">{viewProfile.adminNotes}</p>
                </div>
              )}

              <div className="pt-2 border-t flex gap-2 flex-wrap">
                {viewProfile.kycStatus !== "approved" && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1" size="sm"
                    onClick={() => updateStatus(viewProfile.id!, "approved")}>
                    <CheckCircle size={14} /> Approve KYC
                  </Button>
                )}
                {viewProfile.kycStatus !== "rejected" && (
                  <Button variant="destructive" size="sm" className="gap-1"
                    onClick={() => {
                      const notes = prompt("Reason for rejection (optional):");
                      updateStatus(viewProfile.id!, "rejected", notes || undefined);
                    }}>
                    <XCircle size={14} /> Reject KYC
                  </Button>
                )}
                {viewProfile.kycStatus !== "pending" && (
                  <Button variant="outline" size="sm" className="gap-1"
                    onClick={() => updateStatus(viewProfile.id!, "pending")}>
                    <Clock size={14} /> Mark Pending
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Plus size={18} /> Add KYC Entry
            </DialogTitle>
          </DialogHeader>
          <form ref={addFormRef} onSubmit={handleAddSubmit} encType="multipart/form-data" className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Customer <span className="text-red-500">*</span></label>
              <select name="userId" required className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="">Select customer...</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name || "—"} — {c.mobile}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Full Name</label><Input name="name" placeholder="As on passport" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Phone</label><Input name="phone" placeholder="Mobile number" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">WhatsApp</label><Input name="whatsappNumber" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Date of Birth</label><Input type="date" name="dateOfBirth" /></div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Gender</label>
                <select name="gender" className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Blood Group</label>
                <select name="bloodGroup" className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g === "unknown" ? "Not Known" : g}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Address</label><Input name="address" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Passport Number</label><Input name="passportNumber" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Place of Issue</label><Input name="passportPlaceOfIssue" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Issue Date</label><Input type="date" name="passportIssueDate" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Expiry Date</label><Input type="date" name="passportExpiryDate" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Aadhaar Number</label><Input name="aadharNumber" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">PAN Number</label><Input name="panNumber" /></div>
              <div className="space-y-1">
                <label className="text-xs font-medium">KYC Status</label>
                <select name="kycStatus" className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FileUploadField label="Profile Photo" name="photo" accept="image/jpeg,image/png,image/webp" />
              <FileUploadField label="Passport Copy" name="passportImage" />
              <FileUploadField label="Aadhaar Card" name="aadharImage" />
              <FileUploadField label="PAN Card" name="panImage" />
              <FileUploadField label="Health Certificate" name="healthCertificate" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Admin Notes</label>
              <textarea name="adminNotes" rows={2} className="w-full p-3 rounded-md border text-sm" />
            </div>

            <Button type="submit" disabled={addLoading} className="w-full">
              {addLoading ? "Saving..." : "Save KYC Record"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
