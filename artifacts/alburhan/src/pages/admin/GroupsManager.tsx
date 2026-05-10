import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteGuard } from "@/components/DeleteGuard";
import { Plus, Edit, Trash2, Users, Eye, Printer, ChevronDown, Hash, Wand2, Save, ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const API = import.meta.env.VITE_API_URL || "";

interface HajjGroup {
  id: string;
  groupName: string;
  year: number;
  startingSerialNumber?: number;
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
  startingSerialNumber: 1,
  hotelMakkahName: "", hotelMakkahAddress: "", hotelMakkahNameAr: "", hotelMakkahAddressAr: "", hotelMakkahCheckIn: "", hotelMakkahCheckOut: "", hotelMakkahGoogleMaps: "",
  hotelMadinahName: "", hotelMadinahAddress: "", hotelMadinahNameAr: "", hotelMadinahAddressAr: "", hotelMadinahCheckIn: "", hotelMadinahCheckOut: "", hotelMadinahGoogleMaps: "",
  hotelAziziahName: "", hotelAziziahAddress: "", hotelAziziahNameAr: "", hotelAziziahAddressAr: "", hotelAziziahCheckIn: "", hotelAziziahCheckOut: "", hotelAziziahGoogleMaps: "",
};

function PrintDropdown({ groupId }: { groupId: string }) {
  const [, navigate] = useLocation();
  const items = [
    { label: "Photo ID Cards", path: "id-cards" },
    { label: "Pro ID Cards (85×54)", path: "id-cards-pro" },
    { label: "Duplex ID Cards (3×3 Grid)", path: "id-cards-duplex" },
    { label: "Luggage Stickers", path: "luggage" },
    { label: "Square Luggage Sticker", path: "luggage-square" },
    { label: "Large Luggage Sticker (18×22cm)", path: "luggage-large" },
    { label: "Medical Stickers", path: "medical" },
    { label: "Zamzam Stickers", path: "zamzam" },
    { sep: true },
    { label: "Hotel Room List", path: "hotel-list" },
    { label: "Bus Seating List", path: "bus-list" },
    { label: "Airline Passenger List", path: "airline-list" },
    { label: "Haji List", path: "haji-list" },
    { sep: true },
    { label: "Feedback Form", path: "feedback" },
    { label: "Booking Contract", path: "contract" },
    { sep: true },
    { label: "Room Stickers", path: "room-stickers" },
    { sep: true },
    { label: "Staff ID Cards", path: "staff-id", globalPath: "/admin/staff/print" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-lg gap-1">
          <Printer size={14} /> Print <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" avoidCollisions={false} className="w-52">
        {items.map((item, i) =>
          "sep" in item ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : "globalPath" in item ? (
            <DropdownMenuItem key={item.path} className="cursor-pointer" onSelect={() => navigate(item.globalPath)}>
              {item.label}
            </DropdownMenuItem>
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
  const { requestDelete } = useDeleteGuard();

  // Serial number management state
  const [serialEdits, setSerialEdits] = useState<Record<string, number>>({});
  const [serialOrder, setSerialOrder] = useState<string[]>([]); // group ids in desired serial order
  const [serialSaving, setSerialSaving] = useState(false);
  const [showSerialManager, setShowSerialManager] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/groups`, { credentials: "include" });
      if (res.ok) {
        const data: HajjGroup[] = await res.json();
        setGroups(data);
        const edits: Record<string, number> = {};
        data.forEach(g => { edits[g.id] = g.startingSerialNumber || 1; });
        setSerialEdits(edits);
        setSerialOrder(data.map(g => g.id));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  // Move a group up/down in the serial order
  const moveGroup = (idx: number, dir: -1 | 1) => {
    const newOrder = [...serialOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]];
    setSerialOrder(newOrder);
  };

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (g: HajjGroup) => {
    setEditingId(g.id);
    setForm({
      groupName: g.groupName, year: g.year, departureDate: g.departureDate || "",
      returnDate: g.returnDate || "", flightNumber: g.flightNumber || "",
      maktabNumber: g.maktabNumber || "", notes: g.notes || "",
      startingSerialNumber: g.startingSerialNumber || 1,
      groupLeader: g.hotels?.groupLeader || "",
      hotelMakkahName: g.hotels?.makkah?.name || "",
      hotelMakkahAddress: g.hotels?.makkah?.address || "",
      hotelMakkahNameAr: g.hotels?.makkah?.nameAr || "",
      hotelMakkahAddressAr: g.hotels?.makkah?.addressAr || "",
      hotelMakkahCheckIn: g.hotels?.makkah?.checkIn || "",
      hotelMakkahCheckOut: g.hotels?.makkah?.checkOut || "",
      hotelMakkahGoogleMaps: g.hotels?.makkah?.googleMapsLink || "",
      hotelMadinahName: g.hotels?.madinah?.name || "",
      hotelMadinahAddress: g.hotels?.madinah?.address || "",
      hotelMadinahNameAr: g.hotels?.madinah?.nameAr || "",
      hotelMadinahAddressAr: g.hotels?.madinah?.addressAr || "",
      hotelMadinahCheckIn: g.hotels?.madinah?.checkIn || "",
      hotelMadinahCheckOut: g.hotels?.madinah?.checkOut || "",
      hotelMadinahGoogleMaps: g.hotels?.madinah?.googleMapsLink || "",
      hotelAziziahName: g.hotels?.aziziah?.name || "",
      hotelAziziahAddress: g.hotels?.aziziah?.address || "",
      hotelAziziahNameAr: g.hotels?.aziziah?.nameAr || "",
      hotelAziziahAddressAr: g.hotels?.aziziah?.addressAr || "",
      hotelAziziahCheckIn: g.hotels?.aziziah?.checkIn || "",
      hotelAziziahCheckOut: g.hotels?.aziziah?.checkOut || "",
      hotelAziziahGoogleMaps: g.hotels?.aziziah?.googleMapsLink || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.groupName || !form.year) { toast({ title: "Name and year required", variant: "destructive" }); return; }
    const body = {
      groupName: form.groupName, year: form.year, departureDate: form.departureDate || null,
      returnDate: form.returnDate || null, flightNumber: form.flightNumber || null,
      maktabNumber: form.maktabNumber || null, notes: form.notes || null,
      startingSerialNumber: Number(form.startingSerialNumber) || 1,
      hotels: {
        groupLeader: form.groupLeader || null,
        makkah: { name: form.hotelMakkahName, address: form.hotelMakkahAddress, nameAr: form.hotelMakkahNameAr || null, addressAr: form.hotelMakkahAddressAr || null, checkIn: form.hotelMakkahCheckIn, checkOut: form.hotelMakkahCheckOut, googleMapsLink: form.hotelMakkahGoogleMaps || null },
        madinah: { name: form.hotelMadinahName, address: form.hotelMadinahAddress, nameAr: form.hotelMadinahNameAr || null, addressAr: form.hotelMadinahAddressAr || null, checkIn: form.hotelMadinahCheckIn, checkOut: form.hotelMadinahCheckOut, googleMapsLink: form.hotelMadinahGoogleMaps || null },
        aziziah: { name: form.hotelAziziahName, address: form.hotelAziziahAddress, nameAr: form.hotelAziziahNameAr || null, addressAr: form.hotelAziziahAddressAr || null, checkIn: form.hotelAziziahCheckIn, checkOut: form.hotelAziziahCheckOut, googleMapsLink: form.hotelAziziahGoogleMaps || null },
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

  const handleDelete = (id: string, name: string) => {
    requestDelete(`Group: ${name}`, async (token) => {
      await fetch(`${API}/api/groups/${id}`, {
        method: "DELETE", credentials: "include",
        headers: { "X-Delete-Token": token },
      });
      toast({ title: "Group deleted" });
      fetchGroups();
    });
  };

  // Auto-number: assign serial numbers sequentially based on serialOrder
  const handleAutoNumber = () => {
    const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));
    const newEdits: Record<string, number> = {};
    let next = 1;
    serialOrder.forEach(id => {
      const g = groupMap[id];
      if (!g) return;
      newEdits[id] = next;
      next += g.pilgrimCount || 0;
    });
    setSerialEdits(newEdits);
    toast({ title: "Auto-numbered!", description: "Review the ranges below then click Save." });
  };

  // Save all serial number changes — must send full group body to avoid wiping fields
  const handleSaveSerials = async () => {
    setSerialSaving(true);
    try {
      const promises = groups.map(g =>
        fetch(`${API}/api/groups/${g.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupName: g.groupName,
            year: g.year,
            departureDate: g.departureDate || null,
            returnDate: g.returnDate || null,
            flightNumber: g.flightNumber || null,
            maktabNumber: g.maktabNumber || null,
            notes: g.notes || null,
            hotels: g.hotels || {},
            startingSerialNumber: serialEdits[g.id] || 1,
          }),
        })
      );
      const results = await Promise.all(promises);
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) throw new Error(`${failed.length} group(s) failed to save`);
      toast({ title: "Serial numbers saved!", description: "All groups updated successfully." });
      fetchGroups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving";
      toast({ title: "Error saving serial numbers", description: msg, variant: "destructive" });
    } finally { setSerialSaving(false); }
  };

  const f = (key: keyof typeof form, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Hajj Groups</h1>
          <p className="text-muted-foreground mt-1">Manage pilgrim groups for Hajj & Umrah.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowSerialManager(v => !v)} className="rounded-xl gap-2 border-amber-400 text-amber-700 hover:bg-amber-50">
            <Hash size={16} /> Serial Numbers
          </Button>
          <Button onClick={openCreate} className="bg-primary text-white gap-2 rounded-xl">
            <Plus size={18} /> Create Group
          </Button>
        </div>
      </div>

      {/* ── Serial Number Manager Panel ── */}
      {showSerialManager && groups.length > 0 && (
        <Card className="mb-8 p-6 rounded-2xl border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><Hash size={18} className="text-amber-600" /> Serial Number Manager</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Set continuous serial numbers across all groups. Use "Auto-Number" to calculate automatically.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleAutoNumber} className="gap-2 rounded-lg border-amber-400 text-amber-700 hover:bg-amber-100">
                <Wand2 size={15} /> Auto-Number
              </Button>
              <Button onClick={handleSaveSerials} disabled={serialSaving} className="gap-2 rounded-lg bg-green-700 hover:bg-green-800 text-white">
                <Save size={15} /> {serialSaving ? "Saving..." : "Save All"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-amber-700 mb-3 bg-amber-100 rounded-lg px-3 py-2">
            <strong>Step 1:</strong> Use ▲ ▼ to arrange groups in the order you want serials assigned. &nbsp;
            <strong>Step 2:</strong> Click <strong>Auto-Number</strong>. &nbsp;
            <strong>Step 3:</strong> Click <strong>Save All</strong>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-amber-200">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Order</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Group Name</th>
                  <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Pilgrims</th>
                  <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Starting Serial</th>
                  <th className="text-center py-2 px-3 font-semibold text-muted-foreground">Range</th>
                </tr>
              </thead>
              <tbody>
                {serialOrder.map((id, idx) => {
                  const g = groups.find(x => x.id === id);
                  if (!g) return null;
                  const start = serialEdits[g.id] || 1;
                  const end = start + g.pilgrimCount - 1;
                  return (
                    <tr key={g.id} className={idx % 2 === 0 ? "bg-white/60" : ""}>
                      <td className="py-2 px-2">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveGroup(idx, -1)} disabled={idx === 0}
                            className="p-0.5 rounded hover:bg-amber-100 disabled:opacity-20 disabled:cursor-not-allowed">
                            <ChevronUp size={14} />
                          </button>
                          <span className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</span>
                          <button onClick={() => moveGroup(idx, 1)} disabled={idx === serialOrder.length - 1}
                            className="p-0.5 rounded hover:bg-amber-100 disabled:opacity-20 disabled:cursor-not-allowed">
                            <ChevronDownIcon size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-semibold">{g.groupName}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-bold">
                          <Users size={11} /> {g.pilgrimCount}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Input
                          type="number"
                          min="1"
                          value={serialEdits[g.id] || 1}
                          onChange={e => setSerialEdits(prev => ({ ...prev, [g.id]: Number(e.target.value) || 1 }))}
                          className="w-24 mx-auto text-center font-mono font-bold h-8"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="font-mono font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs">
                          {String(start).padStart(3, "0")} → {g.pilgrimCount > 0 ? String(end).padStart(3, "0") : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-amber-200">
                  <td colSpan={3} className="py-2 px-3 font-bold">Total Pilgrims</td>
                  <td className="py-2 px-3 text-center font-bold text-primary">{groups.reduce((s, g) => s + g.pilgrimCount, 0)}</td>
                  <td className="py-2 px-3 text-center text-xs font-mono font-bold text-green-700">
                    001 → {String(groups.reduce((s, g) => s + g.pilgrimCount, 0)).padStart(3, "0")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {loading ? <div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div> : groups.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Create a Hajj group to start adding pilgrims.</p>
          <Button onClick={openCreate} variant="outline" className="rounded-xl"><Plus className="w-4 h-4 mr-2" /> Create First Group</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(g => {
            const start = g.startingSerialNumber || 1;
            const end = start + g.pilgrimCount - 1;
            return (
              <Card key={g.id} className="p-6 rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{g.groupName}</h3>
                    <p className="text-sm text-muted-foreground">Year: {g.year}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Edit size={16} /></Button>
                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(g.id, g.name)}><Trash2 size={16} /></Button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground mb-3">
                  {g.flightNumber && <p>Flight: {g.flightNumber}</p>}
                  {g.departureDate && <p>Departure: {g.departureDate}</p>}
                  {g.hotels?.aziziah?.name && <p>Makkah 1: {g.hotels.aziziah.name}</p>}
                  {g.hotels?.makkah?.name && <p>Makkah 2: {g.hotels.makkah.name}</p>}
                  {g.hotels?.madinah?.name && <p>Madinah: {g.hotels.madinah.name}</p>}
                </div>
                {/* Serial range badge */}
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5">
                    <Hash size={10} /> Serial: {String(start).padStart(3, "0")} – {g.pilgrimCount > 0 ? String(end).padStart(3, "0") : "—"}
                  </span>
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
            );
          })}
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
                <div className="space-y-1"><label className="text-sm font-medium">Starting Serial No. <span className="text-xs text-muted-foreground">(e.g. 79 if prev group ended at 78)</span></label><Input type="number" min="1" value={form.startingSerialNumber} onChange={e => f("startingSerialNumber", Number(e.target.value))} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Group Leader</label><Input value={form.groupLeader} onChange={e => f("groupLeader", e.target.value)} placeholder="e.g. Mohammed Altaf" /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Hotel Makkah 1 (Aziziah)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Name (English)</label><Input value={form.hotelAziziahName} onChange={e => f("hotelAziziahName", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (English)</label><Input value={form.hotelAziziahAddress} onChange={e => f("hotelAziziahAddress", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Name (Arabic) — اسم الفندق</label><Input dir="rtl" className="text-right" value={form.hotelAziziahNameAr} onChange={e => f("hotelAziziahNameAr", e.target.value)} placeholder="اسم الفندق بالعربية" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (Arabic) — العنوان</label><Input dir="rtl" className="text-right" value={form.hotelAziziahAddressAr} onChange={e => f("hotelAziziahAddressAr", e.target.value)} placeholder="العنوان بالعربية" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-in</label><Input value={form.hotelAziziahCheckIn} onChange={e => f("hotelAziziahCheckIn", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-out</label><Input value={form.hotelAziziahCheckOut} onChange={e => f("hotelAziziahCheckOut", e.target.value)} /></div>
                <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Google Maps Link</label><Input value={form.hotelAziziahGoogleMaps} onChange={e => f("hotelAziziahGoogleMaps", e.target.value)} placeholder="https://maps.google.com/?q=..." /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Hotel Makkah 2</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Name (English)</label><Input value={form.hotelMakkahName} onChange={e => f("hotelMakkahName", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (English)</label><Input value={form.hotelMakkahAddress} onChange={e => f("hotelMakkahAddress", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Name (Arabic) — اسم الفندق</label><Input dir="rtl" className="text-right" value={form.hotelMakkahNameAr} onChange={e => f("hotelMakkahNameAr", e.target.value)} placeholder="اسم الفندق بالعربية" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (Arabic) — العنوان</label><Input dir="rtl" className="text-right" value={form.hotelMakkahAddressAr} onChange={e => f("hotelMakkahAddressAr", e.target.value)} placeholder="العنوان بالعربية" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-in</label><Input value={form.hotelMakkahCheckIn} onChange={e => f("hotelMakkahCheckIn", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Check-out</label><Input value={form.hotelMakkahCheckOut} onChange={e => f("hotelMakkahCheckOut", e.target.value)} /></div>
                <div className="col-span-2 space-y-1"><label className="text-sm font-medium">Google Maps Link</label><Input value={form.hotelMakkahGoogleMaps} onChange={e => f("hotelMakkahGoogleMaps", e.target.value)} placeholder="https://maps.google.com/?q=..." /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Hotel Madinah</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-sm font-medium">Name (English)</label><Input value={form.hotelMadinahName} onChange={e => f("hotelMadinahName", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (English)</label><Input value={form.hotelMadinahAddress} onChange={e => f("hotelMadinahAddress", e.target.value)} /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Name (Arabic) — اسم الفندق</label><Input dir="rtl" className="text-right" value={form.hotelMadinahNameAr} onChange={e => f("hotelMadinahNameAr", e.target.value)} placeholder="اسم الفندق بالعربية" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">Address (Arabic) — العنوان</label><Input dir="rtl" className="text-right" value={form.hotelMadinahAddressAr} onChange={e => f("hotelMadinahAddressAr", e.target.value)} placeholder="العنوان بالعربية" /></div>
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
