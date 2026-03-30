import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ArrowLeft, Upload, Printer, CreditCard, Luggage, Heart, Building2, Bus, DoorOpen } from "lucide-react";
import { Link, useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string;
  serialNumber: number;
  fullName: string;
  passportNumber?: string;
  visaNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  photoUrl?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  address?: string;
  city?: string;
  state?: string;
  roomNumber?: string;
  roomType?: string;
  busNumber?: string;
  seatNumber?: string;
  relation?: string;
  coverNumber?: string;
  medicalCondition?: string;
}

interface Group {
  id: string;
  groupName: string;
  year: number;
  departureDate?: string;
  returnDate?: string;
  flightNumber?: string;
  maktabNumber?: string;
  hotels?: any;
}

const emptyPilgrim = {
  fullName: "", passportNumber: "", visaNumber: "", dateOfBirth: "", gender: "",
  bloodGroup: "", mobileIndia: "", mobileSaudi: "", address: "", city: "",
  state: "", roomNumber: "", roomType: "", busNumber: "", seatNumber: "", relation: "", coverNumber: "", medicalCondition: "",
};

export default function PilgrimManager() {
  const [, params] = useRoute("/admin/groups/:groupId/pilgrims");
  const groupId = params?.groupId || "";

  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPilgrim);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }),
        fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }),
      ]);
      if (gRes.ok) setGroup(await gRes.json());
      if (pRes.ok) setPilgrims(await pRes.json());
    } catch {} finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { if (groupId) fetchData(); }, [groupId, fetchData]);

  const openCreate = () => { setEditingId(null); setForm(emptyPilgrim); setDialogOpen(true); };
  const openEdit = (p: Pilgrim) => {
    setEditingId(p.id);
    setForm({
      fullName: p.fullName || "", passportNumber: p.passportNumber || "", visaNumber: p.visaNumber || "",
      dateOfBirth: p.dateOfBirth || "", gender: p.gender || "", bloodGroup: p.bloodGroup || "",
      mobileIndia: p.mobileIndia || "", mobileSaudi: p.mobileSaudi || "", address: p.address || "",
      city: p.city || "", state: p.state || "", roomNumber: p.roomNumber || "",
      roomType: p.roomType || "", busNumber: p.busNumber || "", seatNumber: p.seatNumber || "",
      relation: p.relation || "", coverNumber: p.coverNumber || "",
      medicalCondition: p.medicalCondition || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.fullName) { toast({ title: "Name is required", variant: "destructive" }); return; }
    try {
      const url = editingId
        ? `${API}/api/groups/${groupId}/pilgrims/${editingId}`
        : `${API}/api/groups/${groupId}/pilgrims`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: editingId ? "Pilgrim updated" : "Pilgrim added" });
      setDialogOpen(false);
      fetchData();
    } catch { toast({ title: "Error saving pilgrim", variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this pilgrim?")) return;
    try {
      await fetch(`${API}/api/groups/${groupId}/pilgrims/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Pilgrim deleted" });
      fetchData();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const handlePhotoUpload = async (pilgrimId: string, file: File) => {
    setUploadingId(pilgrimId);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/${pilgrimId}/photo`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Photo uploaded" });
      fetchData();
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploadingId(null); }
  };

  const f = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  if (loading) return <AdminLayout><div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/groups">
          <Button variant="ghost" size="sm" className="gap-1 mb-2"><ArrowLeft size={16} /> Back to Groups</Button>
        </Link>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">{group?.groupName || "Group"} — Pilgrims</h1>
            <p className="text-muted-foreground mt-1">{pilgrims.length} pilgrims registered</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative group">
              <Button variant="outline" size="sm" className="gap-1 rounded-lg"><Printer size={14} /> Print</Button>
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg py-2 w-48 hidden group-hover:block z-50">
                <Link href={`/admin/groups/${groupId}/print/id-cards`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><CreditCard size={14} /> ID Cards</span>
                </Link>
                <Link href={`/admin/groups/${groupId}/print/luggage`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><Luggage size={14} /> Luggage Stickers</span>
                </Link>
                <Link href={`/admin/groups/${groupId}/print/medical`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><Heart size={14} /> Medical Stickers</span>
                </Link>
                <Link href={`/admin/groups/${groupId}/print/hotel-list`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><Building2 size={14} /> Hotel Room List</span>
                </Link>
                <Link href={`/admin/groups/${groupId}/print/bus-list`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><Bus size={14} /> Bus List</span>
                </Link>
                <Link href={`/admin/groups/${groupId}/print/room-stickers`}>
                  <span className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted cursor-pointer"><DoorOpen size={14} /> Room Stickers</span>
                </Link>
              </div>
            </div>
            <Button onClick={openCreate} className="bg-primary text-white gap-1 rounded-xl"><Plus size={16} /> Add Pilgrim</Button>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0] && uploadingId) handlePhotoUpload(uploadingId, e.target.files[0]); e.target.value = ""; }} />

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Passport</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Bus</th>
                <th className="px-4 py-3">Relation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pilgrims.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No pilgrims yet. Click "Add Pilgrim" to start.</td></tr>
              ) : pilgrims.map(p => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono font-bold text-primary">{p.serialNumber}</td>
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden cursor-pointer"
                      onClick={() => { setUploadingId(p.id); fileRef.current?.click(); }}>
                      {p.photoUrl ? (
                        <img src={`${API}${p.photoUrl}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Upload size={14} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{p.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.passportNumber || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.mobileIndia || "—"}</td>
                  <td className="px-4 py-3">{p.roomNumber || "—"}</td>
                  <td className="px-4 py-3">{p.busNumber || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.relation || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit size={14} /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p.id)}><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingId ? "Edit Pilgrim" : "Add Pilgrim"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-sm font-medium">Full Name *</label><Input value={form.fullName} onChange={e => f("fullName", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Passport Number</label><Input value={form.passportNumber} onChange={e => f("passportNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Visa Number</label><Input value={form.visaNumber} onChange={e => f("visaNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Date of Birth</label><Input value={form.dateOfBirth} onChange={e => f("dateOfBirth", e.target.value)} placeholder="DD/MM/YYYY" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Gender</label>
                <select value={form.gender} onChange={e => f("gender", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">Blood Group</label>
                <select value={form.bloodGroup} onChange={e => f("bloodGroup", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">India Mobile</label><Input value={form.mobileIndia} onChange={e => f("mobileIndia", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Saudi Mobile</label><Input value={form.mobileSaudi} onChange={e => f("mobileSaudi", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Address</label><Input value={form.address} onChange={e => f("address", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">City</label><Input value={form.city} onChange={e => f("city", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">State</label><Input value={form.state} onChange={e => f("state", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Room Number</label><Input value={form.roomNumber} onChange={e => f("roomNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Room Type</label>
                <select value={form.roomType} onChange={e => f("roomType", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option>
                  {["Single","Double","Triple","Quad","Quint"].map(rt => <option key={rt} value={rt}>{rt}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">Bus Number</label><Input value={form.busNumber} onChange={e => f("busNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Seat Number</label><Input value={form.seatNumber} onChange={e => f("seatNumber", e.target.value)} placeholder="e.g. 14A" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Relation</label>
                <select value={form.relation} onChange={e => f("relation", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option>
                  {["Self","Wife","Husband","Mother","Father","Son","Daughter","Brother","Sister","Other"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">Cover Number (HGO ID)</label><Input value={form.coverNumber} onChange={e => f("coverNumber", e.target.value)} /></div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Medical Condition</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {["Diabetic","BP Patient","Heart Patient","Allergy"].map(cond => (
                    <button key={cond} type="button" onClick={() => {
                      const existing = form.medicalCondition ? form.medicalCondition.split(", ").filter(Boolean) : [];
                      if (existing.includes(cond)) {
                        f("medicalCondition", existing.filter(c => c !== cond).join(", "));
                      } else {
                        f("medicalCondition", [...existing, cond].join(", "));
                      }
                    }} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${form.medicalCondition?.includes(cond) ? "bg-red-600 text-white border-red-600" : "bg-white text-red-600 border-red-300 hover:bg-red-50"}`}>
                      {cond}
                    </button>
                  ))}
                </div>
                <Input value={form.medicalCondition} onChange={e => f("medicalCondition", e.target.value)} placeholder="e.g. Diabetic, BP Patient (or type custom condition)" />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Add Pilgrim"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
