import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Users, Eye, Printer, ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const API = import.meta.env.VITE_API_URL || "";

interface HajjGroup {
  id: string;
  groupName: string;
  year: number;
  departureDate?: string;
  returnDate?: string;
  flightNumber?: string;
  maktabNumber?: string;
  hotels?: any;
  notes?: string;
  pilgrimCount: number;
}

const emptyForm = {
  groupName: "", year: new Date().getFullYear(), departureDate: "", returnDate: "",
  flightNumber: "", maktabNumber: "", notes: "", groupLeader: "",
  hotelMakkahName: "", hotelMakkahAddress: "", hotelMakkahCheckIn: "", hotelMakkahCheckOut: "", hotelMakkahGoogleMaps: "",
  hotelMadinahName: "", hotelMadinahAddress: "", hotelMadinahCheckIn: "", hotelMadinahCheckOut: "", hotelMadinahGoogleMaps: "",
};

function PrintDropdown({ groupId }: { groupId: string }) {
  const [, navigate] = useLocation();
  const items = [
    { label: "Photo ID Cards", path: "id-cards" },
    { label: "Pro ID Cards (85×54)", path: "id-cards-pro" },
    { label: "Luggage Stickers", path: "luggage" },
    { label: "Square Luggage Sticker", path: "luggage-square" },
    { label: "Medical Stickers", path: "medical" },
    { label: "Zamzam Stickers", path: "zamzam" },
    { sep: true },
    { label: "Hotel Room List", path: "hotel-list" },
    { label: "Bus Seating List", path: "bus-list" },
    { label: "Airline Passenger List", path: "airline-list" },
    { sep: true },
    { label: "Feedback Form", path: "feedback" },
    { label: "Booking Contract", path: "contract" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-lg gap-1">
          <Printer size={14} /> Print <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item, i) =>
          "sep" in item ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DropdownMenuItem key={item.path} className="cursor-pointer" onSelect={() => navigate(`/admin/groups/${groupId}/print/${item.path}`)}>
              {item.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function GroupsManager() {
  const [groups, setGroups] = useState<HajjGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/groups`, { credentials: "include" });
      if (res.ok) setGroups(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (g: HajjGroup) => {
    setEditingId(g.id);
    setForm({
      groupName: g.groupName, year: g.year, departureDate: g.departureDate || "",
      returnDate: g.returnDate || "", flightNumber: g.flightNumber || "",
      maktabNumber: g.maktabNumber || "", notes: g.notes || "",
      groupLeader: g.hotels?.groupLeader || "",
      hotelMakkahName: g.hotels?.makkah?.name || "",
      hotelMakkahAddress: g.hotels?.makkah?.address || "",
      hotelMakkahCheckIn: g.hotels?.makkah?.checkIn || "",
      hotelMakkahCheckOut: g.hotels?.makkah?.checkOut || "",
      hotelMakkahGoogleMaps: g.hotels?.makkah?.googleMapsLink || "",
      hotelMadinahName: g.hotels?.madinah?.name || "",
      hotelMadinahAddress: g.hotels?.madinah?.address || "",
      hotelMadinahCheckIn: g.hotels?.madinah?.checkIn || "",
      hotelMadinahCheckOut: g.hotels?.madinah?.checkOut || "",
      hotelMadinahGoogleMaps: g.hotels?.madinah?.googleMapsLink || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.groupName || !form.year) { toast({ title: "Name and year required", variant: "destructive" }); return; }
    const body = {
      groupName: form.groupName, year: form.year, departureDate: form.departureDate || null,
      returnDate: form.returnDate || null, flightNumber: form.flightNumber || null,
      maktabNumber: form.maktabNumber || null, notes: form.notes || null,
      hotels: {
        groupLeader: form.groupLeader || null,
        makkah: { name: form.hotelMakkahName, address: form.hotelMakkahAddress, checkIn: form.hotelMakkahCheckIn, checkOut: form.hotelMakkahCheckOut, googleMapsLink: form.hotelMakkahGoogleMaps || null },
        madinah: { name: form.hotelMadinahName, address: form.hotelMadinahAddress, checkIn: form.hotelMadinahCheckIn, checkOut: form.hotelMadinahCheckOut, googleMapsLink: form.hotelMadinahGoogleMaps || null },
      },
    };
    try {
      const url = editingId ? `${API}/api/groups/${editingId}` : `${API}/api/groups`;
      const res = await fetch(url, { method: editingId ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        let errMsg = "Failed to save group";
        try { const body = await res.json(); errMsg = body.message || body.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      toast({ title: editingId ? "Group updated" : "Group created" });
      setDialogOpen(false);
      fetchGroups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving group";
      toast({ title: "Error saving group", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this group and all its pilgrims?")) return;
    try {
      await fetch(`${API}/api/groups/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Group deleted" });
      fetchGroups();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const f = (key: keyof typeof form, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Hajj Groups</h1>
          <p className="text-muted-foreground mt-1">Manage pilgrim groups for Hajj & Umrah.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-white gap-2 rounded-xl">
          <Plus size={18} /> Create Group
        </Button>
      </div>

      {loading ? <div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div> : groups.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Create a Hajj group to start adding pilgrims.</p>
          <Button onClick={openCreate} variant="outline" className="rounded-xl"><Plus className="w-4 h-4 mr-2" /> Create First Group</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(g => (
            <Card key={g.id} className="p-6 rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">{g.groupName}</h3>
                  <p className="text-sm text-muted-foreground">Year: {g.year}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Edit size={16} /></Button>
                  <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(g.id)}><Trash2 size={16} /></Button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground mb-4">
                {g.flightNumber && <p>Flight: {g.flightNumber}</p>}
                {g.departureDate && <p>Departure: {g.departureDate}</p>}
                {g.hotels?.makkah?.name && <p>Makkah: {g.hotels.makkah.name}</p>}
                {g.hotels?.madinah?.name && <p>Madinah: {g.hotels.madinah.name}</p>}
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <Users size={18} />
                  <span>{g.pilgrimCount} Pilgrims</span>
                </div>
                <div className="flex gap-2">
                  <PrintDropdown groupId={g.id} />
                  <Link href={`/admin/groups/${g.id}/pilgrims`}>
                    <Button size="sm" variant="outline" className="rounded-lg gap-1">
                      <Eye size={14} /> Manage
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingId ? "Edit Group" : "Create New Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Basic Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Group Name</label><Input value={form.groupName} onChange={e => f("groupName", e.target.value)} placeholder="e.g. ALBURHAN 27" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Year</label><Input type="number" value={form.year} onChange={e => f("year", Number(e.target.value))} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Departure Date</label><Input value={form.departureDate} onChange={e => f("departureDate", e.target.value)} placeholder="e.g. 15 Jun 2027" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Return Date</label><Input value={form.returnDate} onChange={e => f("returnDate", e.target.value)} placeholder="e.g. 15 Jul 2027" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Flight Number</label><Input value={form.flightNumber} onChange={e => f("flightNumber", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Maktab Number</label><Input value={form.maktabNumber} onChange={e => f("maktabNumber", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Group Leader</label><Input value={form.groupLeader} onChange={e => f("groupLeader", e.target.value)} placeholder="e.g. Mohammed Altaf" /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Hotel Makkah</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={form.hotelMakkahName} onChange={e => f("hotelMakkahName", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address</label><Input value={form.hotelMakkahAddress} onChange={e => f("hotelMakkahAddress", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-in</label><Input value={form.hotelMakkahCheckIn} onChange={e => f("hotelMakkahCheckIn", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-out</label><Input value={form.hotelMakkahCheckOut} onChange={e => f("hotelMakkahCheckOut", e.target.value)} /></div>
                <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Google Maps Link</label><Input value={form.hotelMakkahGoogleMaps} onChange={e => f("hotelMakkahGoogleMaps", e.target.value)} placeholder="https://maps.google.com/?q=..." /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Hotel Madinah</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={form.hotelMadinahName} onChange={e => f("hotelMadinahName", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address</label><Input value={form.hotelMadinahAddress} onChange={e => f("hotelMadinahAddress", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-in</label><Input value={form.hotelMadinahCheckIn} onChange={e => f("hotelMadinahCheckIn", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-out</label><Input value={form.hotelMadinahCheckOut} onChange={e => f("hotelMadinahCheckOut", e.target.value)} /></div>
                <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Google Maps Link</label><Input value={form.hotelMadinahGoogleMaps} onChange={e => f("hotelMadinahGoogleMaps", e.target.value)} placeholder="https://maps.google.com/?q=..." /></div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <textarea value={form.notes} onChange={e => f("notes", e.target.value)} className="w-full p-3 rounded-md border min-h-[60px] text-sm" />
            </div>
            <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Create Group"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
