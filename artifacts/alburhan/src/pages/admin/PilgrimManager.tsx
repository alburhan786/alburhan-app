import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ArrowLeft, Upload, Printer, CreditCard, Luggage, Heart,
  Building2, Bus, DoorOpen, FileDown, Hotel, BedDouble, Users, Wand2, X, AlertTriangle, Sticker, Layers } from "lucide-react";
import { Link, useRoute } from "wouter";
import { BulkImportModal } from "./BulkImportModal";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

const EXPORT_COLUMNS: { label: string; key: string }[] = [
  { label: "Serial No", key: "serialNumber" },
  { label: "Full Name", key: "fullName" },
  { label: "Salutation", key: "salutation" },
  { label: "Gender", key: "gender" },
  { label: "Date of Birth", key: "dateOfBirth" },
  { label: "Passport Number", key: "passportNumber" },
  { label: "Passport Issue Date", key: "passportIssueDate" },
  { label: "Passport Expiry Date", key: "passportExpiryDate" },
  { label: "Passport Place of Issue", key: "passportPlaceOfIssue" },
  { label: "Visa Number", key: "visaNumber" },
  { label: "Blood Group", key: "bloodGroup" },
  { label: "Mobile India", key: "mobileIndia" },
  { label: "Mobile Saudi", key: "mobileSaudi" },
  { label: "City", key: "city" },
  { label: "State", key: "state" },
  { label: "Address", key: "address" },
  { label: "Bus Number", key: "busNumber" },
  { label: "Seat Number", key: "seatNumber" },
  { label: "Cover Number", key: "coverNumber" },
  { label: "Relation", key: "relation" },
  { label: "Medical Condition", key: "medicalCondition" },
];

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
  roomHotel?: string;
  roomId?: string;
  busNumber?: string;
  seatNumber?: string;
  relation?: string;
  coverNumber?: string;
  medicalCondition?: string;
  salutation?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportPlaceOfIssue?: string;
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

interface HajjRoom {
  id: string;
  groupId: string;
  roomNumber: string;
  hotel: string;
  totalBeds: number;
  occupiedBeds: number;
  roomType: string;
  floor?: string;
  notes?: string;
}

const emptyPilgrim = {
  fullName: "", passportNumber: "", visaNumber: "", dateOfBirth: "", gender: "",
  bloodGroup: "", mobileIndia: "", mobileSaudi: "", address: "", city: "",
  state: "", roomNumber: "", roomType: "", busNumber: "", seatNumber: "",
  relation: "", coverNumber: "", medicalCondition: "",
  salutation: "", passportIssueDate: "", passportExpiryDate: "", passportPlaceOfIssue: "",
};

const emptyRoomForm = {
  roomNumber: "", hotel: "makkah", totalBeds: "4", roomType: "gents", floor: "", notes: "",
};

const HOTEL_LABELS: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };
const HOTEL_COLORS: Record<string, string> = {
  makkah: "bg-emerald-100 text-emerald-800",
  madinah: "bg-sky-100 text-sky-800",
  aziziah: "bg-violet-100 text-violet-800",
};
const ROOM_TYPE_LABELS: Record<string, string> = { family: "Family", ladies: "Ladies", gents: "Gents" };
const ROOM_TYPE_COLORS: Record<string, string> = {
  family: "bg-amber-100 text-amber-800",
  ladies: "bg-pink-100 text-pink-800",
  gents: "bg-blue-100 text-blue-800",
};
const HOTEL_ORDER = ["makkah", "madinah", "aziziah"];

export default function PilgrimManager() {
  const [, params] = useRoute("/admin/groups/:groupId/pilgrims");
  const groupId = params?.groupId || "";

  const [activeTab, setActiveTab] = useState<"pilgrims" | "rooms">("pilgrims");
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [rooms, setRooms] = useState<HajjRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPilgrim);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { toast } = useToast();

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [autoAllocating, setAutoAllocating] = useState(false);
  const [downloadingRoomPdf, setDownloadingRoomPdf] = useState(false);
  const [downloadingBulkStickers, setDownloadingBulkStickers] = useState(false);
  const [deleteConfirmRoomId, setDeleteConfirmRoomId] = useState<string | null>(null);
  const [bulkRoomDialogOpen, setBulkRoomDialogOpen] = useState(false);
  const [bulkRoomForm, setBulkRoomForm] = useState({ hotel: "makkah", roomType: "gents", totalBeds: "4", floor: "", fromRoom: "", toRoom: "" });
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [gRes, pRes, rRes] = await Promise.all([
        fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }),
        fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }),
        fetch(`${API}/api/groups/${groupId}/rooms`, { credentials: "include" }),
      ]);
      if (gRes.ok) setGroup(await gRes.json());
      if (pRes.ok) setPilgrims(await pRes.json());
      if (rRes.ok) setRooms(await rRes.json());
    } catch {} finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { if (groupId) fetchData(); }, [groupId, fetchData]);

  const exportToExcel = () => {
    const headers = EXPORT_COLUMNS.map(c => c.label);
    const rows = pilgrims
      .slice()
      .sort((a, b) => (a.serialNumber ?? 0) - (b.serialNumber ?? 0))
      .map(p => EXPORT_COLUMNS.map(c => (p as any)[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = EXPORT_COLUMNS.map((_, i) => ({ wch: i === 0 ? 10 : 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pilgrims");
    const safeName = (group?.groupName ?? groupId).replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-");
    XLSX.writeFile(wb, `pilgrims-${safeName}.xlsx`);
  };

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
      salutation: p.salutation || "",
      passportIssueDate: p.passportIssueDate || "",
      passportExpiryDate: p.passportExpiryDate || "",
      passportPlaceOfIssue: p.passportPlaceOfIssue || "",
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
        method: editingId ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
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

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/haji-list/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `haji-list-${group?.groupName || groupId}-${group?.year || ""}.pdf`;
      a.click(); window.URL.revokeObjectURL(url);
      toast({ title: "Haji List PDF downloaded!" });
    } catch { toast({ title: "Failed to download PDF", variant: "destructive" }); }
    finally { setDownloadingPdf(false); }
  };

  const openCreateRoom = () => { setEditingRoomId(null); setRoomForm(emptyRoomForm); setRoomDialogOpen(true); };
  const openEditRoom = (r: HajjRoom) => {
    setEditingRoomId(r.id);
    setRoomForm({
      roomNumber: r.roomNumber, hotel: r.hotel, totalBeds: String(r.totalBeds),
      roomType: r.roomType, floor: r.floor || "", notes: r.notes || "",
    });
    setRoomDialogOpen(true);
  };

  const handleRoomSave = async () => {
    if (!roomForm.roomNumber || !roomForm.hotel || !roomForm.roomType) {
      toast({ title: "Room number, hotel and type are required", variant: "destructive" }); return;
    }
    try {
      const url = editingRoomId
        ? `${API}/api/groups/${groupId}/rooms/${editingRoomId}`
        : `${API}/api/groups/${groupId}/rooms`;
      const res = await fetch(url, {
        method: editingRoomId ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...roomForm, totalBeds: Number(roomForm.totalBeds) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "Failed");
      }
      toast({ title: editingRoomId ? "Room updated" : "Room created" });
      setRoomDialogOpen(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving room";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleRoomDelete = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/rooms/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Room deleted" });
      setDeleteConfirmRoomId(null);
      fetchData();
    } catch { toast({ title: "Error deleting room", variant: "destructive" }); }
  };

  const handleAutoAllocate = async () => {
    setAutoAllocating(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/rooms/auto-allocate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast({
        title: "Rooms auto-allocated!",
        description: `${data.assigned} pilgrims assigned · ${data.unassigned} unassigned`,
      });
      fetchData();
    } catch { toast({ title: "Auto-allocation failed", variant: "destructive" }); }
    finally { setAutoAllocating(false); }
  };

  const handleDownloadRoomPdf = async () => {
    setDownloadingRoomPdf(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/rooms/list/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `room-list-${group?.groupName || groupId}-${group?.year || ""}.pdf`;
      a.click(); window.URL.revokeObjectURL(url);
      toast({ title: "Room List PDF downloaded!" });
    } catch { toast({ title: "Failed to download PDF", variant: "destructive" }); }
    finally { setDownloadingRoomPdf(false); }
  };

  const handleRemovePilgrimFromRoom = async (pilgrimId: string) => {
    const pilgrim = pilgrims.find(p => p.id === pilgrimId);
    if (!pilgrim) return;
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/${pilgrimId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pilgrim, roomNumber: null, roomHotel: null, roomId: null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Pilgrim removed from room" });
      fetchData();
    } catch { toast({ title: "Error removing pilgrim from room", variant: "destructive" }); }
  };

  const handleAssignPilgrimToRoom = async (pilgrimId: string, selectedRoomId: string | null) => {
    const pilgrim = pilgrims.find(p => p.id === pilgrimId);
    if (!pilgrim) return;
    const targetRoom = selectedRoomId ? rooms.find(r => r.id === selectedRoomId) : null;
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/${pilgrimId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pilgrim,
          roomNumber: targetRoom?.roomNumber || null,
          roomHotel: targetRoom?.hotel || null,
          roomId: selectedRoomId || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: targetRoom ? `Assigned to Room ${targetRoom.roomNumber} (${HOTEL_LABELS[targetRoom.hotel] || targetRoom.hotel})` : "Room assignment cleared" });
      fetchData();
    } catch { toast({ title: "Error assigning pilgrim to room", variant: "destructive" }); }
  };

  const handleDownloadBulkStickers = async () => {
    setDownloadingBulkStickers(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/rooms/stickers/bulk-pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `room-stickers-${group?.groupName || groupId}-${group?.year || ""}.pdf`;
      a.click(); window.URL.revokeObjectURL(url);
      toast({ title: "Bulk Stickers PDF downloaded!" });
    } catch { toast({ title: "Failed to download stickers PDF", variant: "destructive" }); }
    finally { setDownloadingBulkStickers(false); }
  };

  const f = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const rf = (key: string, val: string) => setRoomForm(prev => ({ ...prev, [key]: val }));
  const brf = (key: string, val: string) => setBulkRoomForm(prev => ({ ...prev, [key]: val }));

  const handleBulkRoomAdd = async () => {
    const from = parseInt(bulkRoomForm.fromRoom, 10);
    const to = parseInt(bulkRoomForm.toRoom, 10);
    if (isNaN(from) || isNaN(to)) { toast({ title: "Enter valid room numbers", variant: "destructive" }); return; }
    if (from > to) { toast({ title: '"From" must be ≤ "To"', variant: "destructive" }); return; }
    if (to - from + 1 > 200) { toast({ title: "Range cannot exceed 200 rooms", variant: "destructive" }); return; }
    setBulkAdding(true);
    try {
      const rooms = [];
      for (let n = from; n <= to; n++) {
        rooms.push({ roomNumber: String(n), hotel: bulkRoomForm.hotel, totalBeds: Number(bulkRoomForm.totalBeds), roomType: bulkRoomForm.roomType, floor: bulkRoomForm.floor || undefined });
      }
      const res = await fetch(`${API}/api/groups/${groupId}/rooms/bulk`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rooms }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed"); }
      const data = await res.json();
      toast({ title: `${data.created} rooms added successfully!` });
      setBulkRoomDialogOpen(false);
      setBulkRoomForm({ hotel: "makkah", roomType: "gents", totalBeds: "4", floor: "", fromRoom: "", toRoom: "" });
      fetchData();
    } catch (err: any) { toast({ title: err.message || "Failed to add rooms", variant: "destructive" }); }
    finally { setBulkAdding(false); }
  };

  const unassignedPilgrims = pilgrims.filter(p => !p.roomNumber);
  const pilgrimsInRoom = (room: HajjRoom) =>
    pilgrims.filter(p => p.roomNumber === room.roomNumber && p.roomHotel === room.hotel);
  const numericRoom = (rn: string) => { const n = parseInt(rn, 10); return isNaN(n) ? Infinity : n; };
  const compareRoomNumbers = (a: string, b: string) => {
    const na = numericRoom(a), nb = numericRoom(b);
    if (na !== Infinity || nb !== Infinity) return na - nb;
    return a.localeCompare(b);
  };
  const sortedRooms = [...rooms].sort((a, b) => {
    const hi = HOTEL_ORDER.indexOf(a.hotel) - HOTEL_ORDER.indexOf(b.hotel);
    return hi !== 0 ? hi : compareRoomNumbers(a.roomNumber, b.roomNumber);
  });
  const pilgrimsForTable = [...pilgrims].sort((a, b) => {
    const ra = a.roomNumber, rb = b.roomNumber;
    if (ra !== rb) {
      if (!ra) return 1;
      if (!rb) return -1;
      return compareRoomNumbers(ra, rb);
    }
    return (a.serialNumber || 0) - (b.serialNumber || 0);
  });
  const roomCardClass = (r: HajjRoom) => {
    if (r.occupiedBeds >= r.totalBeds) return "border-red-300 bg-red-50";
    if (r.occupiedBeds > 0) return "border-amber-300 bg-amber-50";
    return "border-emerald-300 bg-emerald-50";
  };

  if (loading) return <AdminLayout><div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/groups">
          <Button variant="ghost" size="sm" className="gap-1 mb-2"><ArrowLeft size={16} /> Back to Groups</Button>
        </Link>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">{group?.groupName || "Group"}</h1>
            <p className="text-muted-foreground mt-1">{pilgrims.length} pilgrims · {rooms.length} rooms</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant="outline" size="sm"
              className="gap-1.5 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={handleDownloadPdf} disabled={downloadingPdf}
            >
              <FileDown size={14} />
              {downloadingPdf ? "Generating..." : "Haji List PDF"}
            </Button>
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
            {activeTab === "pilgrims" && (
              <>
                <Button variant="outline" onClick={exportToExcel} disabled={pilgrims.length === 0} className="gap-1.5 rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                  <FileDown size={15} /> Export Excel
                </Button>
                <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="gap-1.5 rounded-xl border-blue-300 text-blue-700 hover:bg-blue-50">
                  <Upload size={15} /> Bulk Import
                </Button>
                <Button onClick={openCreate} className="bg-primary text-white gap-1 rounded-xl">
                  <Plus size={16} /> Add Pilgrim
                </Button>
              </>
            )}
            {activeTab === "rooms" && (
              <Button onClick={openCreateRoom} className="bg-primary text-white gap-1 rounded-xl">
                <Plus size={16} /> Add Room
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setActiveTab("pilgrims")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "pilgrims" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Users size={15} /> Pilgrims ({pilgrims.length})
        </button>
        <button
          onClick={() => setActiveTab("rooms")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "rooms" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Hotel size={15} /> Room Management ({rooms.length})
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0] && uploadingId) handlePhotoUpload(uploadingId, e.target.files[0]); e.target.value = ""; }} />

      {/* ============ PILGRIMS TAB ============ */}
      {activeTab === "pilgrims" && (
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Photo</th>
                  <th className="px-4 py-3">Title</th>
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
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No pilgrims yet. Click "Add Pilgrim" to start.</td></tr>
                ) : pilgrims.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-bold text-primary">{p.serialNumber}</td>
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden cursor-pointer"
                        onClick={() => { setUploadingId(p.id); fileRef.current?.click(); }}>
                        {p.photoUrl
                          ? <img src={`${API}${p.photoUrl}`} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><Upload size={14} /></div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.salutation || "—"}</td>
                    <td className="px-4 py-3 font-medium">{p.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.passportNumber || "—"}</td>
                    <td className="px-4 py-3 text-xs">{p.mobileIndia || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.roomNumber
                        ? <span className="font-semibold">{p.roomNumber}{p.roomHotel ? ` · ${HOTEL_LABELS[p.roomHotel] || p.roomHotel}` : ""}</span>
                        : "—"}
                    </td>
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
      )}

      {/* ============ ROOMS TAB ============ */}
      {activeTab === "rooms" && (
        <div className="space-y-6">

          {/* Action bar */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={openCreateRoom} className="gap-1.5 rounded-xl bg-primary text-white">
              <Plus size={16} /> Add Room
            </Button>
            <Button onClick={() => setBulkRoomDialogOpen(true)} variant="outline" className="gap-1.5 rounded-xl border-primary text-primary hover:bg-primary/10">
              <Layers size={16} /> Bulk Add Rooms
            </Button>
            <Button
              onClick={handleAutoAllocate}
              disabled={autoAllocating || rooms.length === 0}
              className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
            >
              <Wand2 size={16} /> {autoAllocating ? "Allocating..." : "Auto Allocate Rooms"}
            </Button>
            <Button
              onClick={handleDownloadRoomPdf}
              disabled={downloadingRoomPdf || rooms.length === 0}
              variant="outline"
              className="gap-1.5 rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              <FileDown size={16} /> {downloadingRoomPdf ? "Generating..." : "Room List PDF"}
            </Button>
            <Button
              onClick={handleDownloadBulkStickers}
              disabled={downloadingBulkStickers || rooms.length === 0}
              variant="outline"
              className="gap-1.5 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <Sticker size={16} /> {downloadingBulkStickers ? "Generating..." : "Bulk Stickers PDF"}
            </Button>
          </div>

          {/* Unassigned pilgrims banner */}
          {unassignedPilgrims.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">
                  {unassignedPilgrims.length} pilgrim{unassignedPilgrims.length > 1 ? "s" : ""} not assigned to any room
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unassignedPilgrims.map(p => (
                  <span key={p.id} className="text-xs bg-amber-100 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                    {p.serialNumber}. {p.fullName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {rooms.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2">
              <Hotel className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No rooms yet</h3>
              <p className="text-muted-foreground text-sm mb-4">Add rooms then use Auto Allocate to assign pilgrims by family and gender.</p>
              <Button onClick={openCreateRoom} variant="outline" className="rounded-xl"><Plus className="w-4 h-4 mr-2" /> Add First Room</Button>
            </Card>
          ) : (
            <>
              {/* Room cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedRooms.map(room => {
                  const roomPilgrims = pilgrimsInRoom(room);
                  const pct = room.totalBeds > 0 ? Math.round((room.occupiedBeds / room.totalBeds) * 100) : 0;
                  const isFull = room.occupiedBeds >= room.totalBeds;
                  const isEmpty = room.occupiedBeds === 0;
                  return (
                    <Card key={room.id} className={`rounded-xl border-2 ${roomCardClass(room)} overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-bold">Room {room.roomNumber}</span>
                              {room.floor && <span className="text-xs text-muted-foreground">Floor {room.floor}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HOTEL_COLORS[room.hotel] || "bg-gray-100 text-gray-700"}`}>
                                {HOTEL_LABELS[room.hotel] || room.hotel}
                              </span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROOM_TYPE_COLORS[room.roomType] || "bg-gray-100 text-gray-700"}`}>
                                {ROOM_TYPE_LABELS[room.roomType] || room.roomType}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                              title="Download Room Sticker PDF"
                              onClick={() => window.open(`${API}/api/groups/${groupId}/rooms/${room.id}/sticker`, "_blank")}
                            >
                              <Sticker size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRoom(room)}>
                              <Edit size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteConfirmRoomId(room.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>

                        {/* Bed occupancy bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <BedDouble size={12} /> {room.occupiedBeds}/{room.totalBeds} beds
                            </span>
                            <span className={`font-semibold ${isFull ? "text-red-600" : isEmpty ? "text-emerald-600" : "text-amber-600"}`}>
                              {isFull ? "FULL" : isEmpty ? "EMPTY" : `${room.totalBeds - room.occupiedBeds} free`}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-black/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : isEmpty ? "bg-emerald-400" : "bg-amber-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Pilgrim chips */}
                        {roomPilgrims.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No pilgrims assigned</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {roomPilgrims.map(p => (
                              <div key={p.id} className="flex items-center gap-1 bg-white/70 border border-black/10 rounded-full pl-0.5 pr-1.5 py-0.5 max-w-[140px]">
                                <div className="w-5 h-5 rounded-full bg-muted overflow-hidden shrink-0">
                                  {p.photoUrl
                                    ? <img src={`${API}${p.photoUrl}`} alt="" className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 text-[8px]">👤</div>}
                                </div>
                                <span className="text-xs font-medium truncate">{p.fullName.split(" ")[0]}</span>
                                <button
                                  onClick={() => handleRemovePilgrimFromRoom(p.id)}
                                  title="Remove from room"
                                  className="text-muted-foreground/50 hover:text-red-500 transition-colors shrink-0 ml-0.5"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Room-wise table */}
              <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm">Room-wise Pilgrim List</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">All pilgrims sorted by room number</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
                      <tr>
                        <th className="px-4 py-3">Sr</th>
                        <th className="px-4 py-3">Photo</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Passport No.</th>
                        <th className="px-4 py-3">Relation</th>
                        <th className="px-4 py-3">Room No.</th>
                        <th className="px-4 py-3">Hotel</th>
                        <th className="px-4 py-3">Gender</th>
                        <th className="px-4 py-3">Assign Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pilgrimsForTable.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No pilgrims yet.</td></tr>
                      ) : pilgrimsForTable.map(p => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-mono font-bold text-primary text-xs">{p.serialNumber}</td>
                          <td className="px-4 py-2.5">
                            <div className="w-8 h-8 rounded-md bg-muted overflow-hidden">
                              {p.photoUrl
                                ? <img src={`${API}${p.photoUrl}`} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-muted-foreground/30"><Users size={12} /></div>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-medium">{[p.salutation, p.fullName].filter(Boolean).join(" ")}</td>
                          <td className="px-4 py-2.5 font-mono text-xs">{p.passportNumber || "—"}</td>
                          <td className="px-4 py-2.5 text-xs">{p.relation || "—"}</td>
                          <td className="px-4 py-2.5">
                            {p.roomNumber
                              ? <span className="font-semibold text-primary">{p.roomNumber}</span>
                              : <span className="text-amber-600 text-xs font-medium">Unassigned</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {p.roomHotel
                              ? <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${HOTEL_COLORS[p.roomHotel] || "bg-gray-100"}`}>{HOTEL_LABELS[p.roomHotel] || p.roomHotel}</span>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs">{p.gender || "—"}</td>
                          <td className="px-4 py-2.5">
                            <select
                              value={p.roomId || ""}
                              onChange={e => handleAssignPilgrimToRoom(p.id, e.target.value || null)}
                              className="h-8 px-2 rounded border bg-background text-xs min-w-[160px]"
                            >
                              <option value="">— Unassigned —</option>
                              {sortedRooms.map(r => (
                                <option key={r.id} value={r.id}>
                                  Rm {r.roomNumber} · {HOTEL_LABELS[r.hotel] || r.hotel} ({ROOM_TYPE_LABELS[r.roomType] || r.roomType})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ===== Pilgrim Dialog ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingId ? "Edit Pilgrim" : "Add Pilgrim"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Title / Salutation</label>
                <select value={form.salutation} onChange={e => f("salutation", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="">Select</option>
                  <option value="Haji">Haji (Male)</option>
                  <option value="Hajjah">Hajjah (Female)</option>
                  <option value="Mr.">Mr.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="Miss">Miss</option>
                  <option value="Master">Master</option>
                  <option value="Infant">Infant</option>
                </select>
              </div>
              <div className="space-y-1"><label className="text-sm font-medium">Full Name *</label><Input value={form.fullName} onChange={e => f("fullName", e.target.value)} placeholder="As per passport" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Passport Number</label><Input value={form.passportNumber} onChange={e => f("passportNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Visa Number</label><Input value={form.visaNumber} onChange={e => f("visaNumber", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Passport Issue Date</label><Input value={form.passportIssueDate} onChange={e => f("passportIssueDate", e.target.value)} placeholder="DD/MM/YYYY" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Passport Expiry Date</label><Input value={form.passportExpiryDate} onChange={e => f("passportExpiryDate", e.target.value)} placeholder="DD/MM/YYYY" /></div>
              <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Place of Issue</label><Input value={form.passportPlaceOfIssue} onChange={e => f("passportPlaceOfIssue", e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Date of Birth</label><Input value={form.dateOfBirth} onChange={e => f("dateOfBirth", e.target.value)} placeholder="DD/MM/YYYY" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Gender</label>
                <select value={form.gender} onChange={e => {
                  const g = e.target.value;
                  setForm(prev => ({ ...prev, gender: g, salutation: prev.salutation ? prev.salutation : g === "Male" ? "Mr." : g === "Female" ? "Mrs." : prev.salutation }));
                }} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
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
                      if (existing.includes(cond)) f("medicalCondition", existing.filter(c => c !== cond).join(", "));
                      else f("medicalCondition", [...existing, cond].join(", "));
                    }} className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${form.medicalCondition?.includes(cond) ? "bg-red-600 text-white border-red-600" : "bg-white text-red-600 border-red-300 hover:bg-red-50"}`}>
                      {cond}
                    </button>
                  ))}
                </div>
                <Input value={form.medicalCondition} onChange={e => f("medicalCondition", e.target.value)} placeholder="e.g. Diabetic, BP Patient" />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Add Pilgrim"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Room Create/Edit Dialog ===== */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editingRoomId ? "Edit Room" : "Add Room"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Room Number *</label>
                <Input value={roomForm.roomNumber} onChange={e => rf("roomNumber", e.target.value)} placeholder="e.g. 201, 501" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Hotel *</label>
                <select value={roomForm.hotel} onChange={e => rf("hotel", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="aziziah">Makkah 1 (Aziziah)</option>
                  <option value="makkah">Makkah 2</option>
                  <option value="madinah">Madinah</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Room Type *</label>
                <select value={roomForm.roomType} onChange={e => rf("roomType", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="gents">Gents</option>
                  <option value="ladies">Ladies</option>
                  <option value="family">Family</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Total Beds *</label>
                <select value={roomForm.totalBeds} onChange={e => rf("totalBeds", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} Beds</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Floor (optional)</label>
                <Input value={roomForm.floor} onChange={e => rf("floor", e.target.value)} placeholder="e.g. 3" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Input value={roomForm.notes} onChange={e => rf("notes", e.target.value)} placeholder="Any notes..." />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setRoomDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleRoomSave} className="flex-1">{editingRoomId ? "Save Changes" : "Create Room"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Room Delete Confirm ===== */}
      <Dialog open={!!deleteConfirmRoomId} onOpenChange={() => setDeleteConfirmRoomId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Room?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            This removes the room record. Existing pilgrim room assignments will not be cleared automatically.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmRoomId(null)} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmRoomId && handleRoomDelete(deleteConfirmRoomId)} className="flex-1">Delete Room</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Bulk Add Rooms Dialog ===== */}
      <Dialog open={bulkRoomDialogOpen} onOpenChange={setBulkRoomDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2"><Layers size={18} /> Bulk Add Rooms</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">Enter a range of room numbers to create multiple rooms at once.</p>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Hotel *</label>
                <select value={bulkRoomForm.hotel} onChange={e => brf("hotel", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="aziziah">Makkah 1 (Aziziah)</option>
                  <option value="makkah">Makkah 2</option>
                  <option value="madinah">Madinah</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Room Type *</label>
                <select value={bulkRoomForm.roomType} onChange={e => brf("roomType", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  <option value="gents">Gents</option>
                  <option value="ladies">Ladies</option>
                  <option value="family">Family</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Total Beds *</label>
                <select value={bulkRoomForm.totalBeds} onChange={e => brf("totalBeds", e.target.value)} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                  {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} Beds</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Floor (optional)</label>
                <Input value={bulkRoomForm.floor} onChange={e => brf("floor", e.target.value)} placeholder="e.g. 3" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">From Room # *</label>
                <Input value={bulkRoomForm.fromRoom} onChange={e => brf("fromRoom", e.target.value)} placeholder="e.g. 501" type="number" min="1" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">To Room # *</label>
                <Input value={bulkRoomForm.toRoom} onChange={e => brf("toRoom", e.target.value)} placeholder="e.g. 520" type="number" min="1" />
              </div>
            </div>
            {bulkRoomForm.fromRoom && bulkRoomForm.toRoom && !isNaN(parseInt(bulkRoomForm.fromRoom)) && !isNaN(parseInt(bulkRoomForm.toRoom)) && parseInt(bulkRoomForm.fromRoom) <= parseInt(bulkRoomForm.toRoom) && (
              <p className="text-sm text-emerald-700 font-medium bg-emerald-50 rounded-lg px-3 py-2">
                Will create {parseInt(bulkRoomForm.toRoom) - parseInt(bulkRoomForm.fromRoom) + 1} rooms (#{bulkRoomForm.fromRoom} to #{bulkRoomForm.toRoom})
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setBulkRoomDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleBulkRoomAdd} disabled={bulkAdding} className="flex-1">
                {bulkAdding ? "Adding..." : "Create Rooms"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <BulkImportModal
        groupId={groupId}
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImported={fetchData}
        existingPassports={pilgrims.map(p => p.passportNumber).filter(Boolean) as string[]}
      />
    </AdminLayout>
  );
}
