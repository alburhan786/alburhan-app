import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Building2, Plus, Pencil, Trash2, RotateCcw, ChevronDown, ChevronRight,
  Star, Phone, Calendar, BedDouble, RefreshCw, Users
} from "lucide-react";
import { useToast as useToastHook } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

const CITIES = ["Makkah", "Madinah", "Aziziah", "Mina", "Arafat", "Other"];
const CITY_COLORS: Record<string, string> = {
  Makkah: "bg-emerald-100 text-emerald-800",
  Madinah: "bg-blue-100 text-blue-800",
  Aziziah: "bg-purple-100 text-purple-800",
  Mina: "bg-amber-100 text-amber-800",
  Arafat: "bg-orange-100 text-orange-800",
  Other: "bg-gray-100 text-gray-700",
};
const BED_TYPES = ["Single", "Double", "Triple", "Quad", "Dorm"];

interface Hotel {
  id: string; name: string; city: string; address: string; stars: number;
  group_id: string; group_name: string; check_in_date: string; check_out_date: string;
  total_rooms: number; contact_phone: string; notes: string;
  is_deleted: boolean; room_count: number; assigned_count: number;
}
interface Room { id: string; hotel_id: string; room_number: string; floor: string; capacity: number; bed_type: string; notes: string; assigned_count: number; }
interface Group { id: string; groupName?: string; group_name?: string; }

const EMPTY_HOTEL = { name: "", city: "Makkah", address: "", stars: 3, group_id: "", check_in_date: "", check_out_date: "", total_rooms: 0, contact_phone: "", notes: "" };
const EMPTY_ROOM = { room_number: "", floor: "", capacity: 4, bed_type: "Double", notes: "" };

export default function HotelManager() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Record<string, Room[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [activeHotelId, setActiveHotelId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_HOTEL);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  async function loadGroups() {
    try {
      const r = await fetch(`${API}/api/groups`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setGroups(Array.isArray(d) ? d : d.groups || []); }
    } catch {}
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cityFilter) params.set("city", cityFilter);
      const r = await fetch(`${API}/api/hotels?${params}`, { credentials: "include" });
      if (r.ok) setHotels(await r.json());
    } catch {}
    setLoading(false);
  }

  async function loadRooms(hotelId: string) {
    try {
      const r = await fetch(`${API}/api/hotels/${hotelId}/rooms`, { credentials: "include" });
      if (r.ok) { const data = await r.json(); setRooms(prev => ({ ...prev, [hotelId]: data })); }
    } catch {}
  }

  useEffect(() => { loadGroups(); load(); }, [cityFilter]);

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      if (!n.has(id) === false) loadRooms(id);
      return n;
    });
    if (!expanded.has(id)) loadRooms(id);
  }

  function openAdd() { setEditId(null); setForm(EMPTY_HOTEL); setShowModal(true); }
  function openEdit(h: Hotel) {
    setEditId(h.id);
    setForm({ name: h.name, city: h.city, address: h.address || "", stars: h.stars || 3, group_id: h.group_id || "", check_in_date: h.check_in_date || "", check_out_date: h.check_out_date || "", total_rooms: h.total_rooms || 0, contact_phone: h.contact_phone || "", notes: h.notes || "" });
    setShowModal(true);
  }

  async function save() {
    if (!form.name || !form.city) return toast({ title: "Name and city required", variant: "destructive" });
    setSaving(true);
    try {
      const url = editId ? `${API}/api/hotels/${editId}` : `${API}/api/hotels`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast({ title: editId ? "Hotel updated" : "Hotel added" });
      setShowModal(false);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function softDelete(id: string) {
    if (!confirm("Move hotel to trash?")) return;
    await fetch(`${API}/api/hotels/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Hotel deleted" });
    load();
  }

  function openAddRoom(hotelId: string) {
    setActiveHotelId(hotelId);
    setRoomForm(EMPTY_ROOM);
    setShowRoomModal(true);
  }

  async function saveRoom() {
    if (!roomForm.room_number) return toast({ title: "Room number required", variant: "destructive" });
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/hotels/${activeHotelId}/rooms`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(roomForm) });
      if (!r.ok) throw new Error("Failed to add room");
      toast({ title: "Room added" });
      setShowRoomModal(false);
      if (activeHotelId) loadRooms(activeHotelId);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function deleteRoom(hotelId: string, roomId: string) {
    if (!confirm("Delete this room?")) return;
    await fetch(`${API}/api/hotels/${hotelId}/rooms/${roomId}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Room deleted" });
    loadRooms(hotelId);
    load();
  }

  const cityGroups = CITIES.filter(c => !cityFilter || c === cityFilter);
  const stats = { total: hotels.length, rooms: hotels.reduce((s, h) => s + (h.room_count || 0), 0), assigned: hotels.reduce((s, h) => s + (h.assigned_count || 0), 0) };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2"><Building2 size={22} /> Hotel Management</h1>
            <p className="text-sm text-muted-foreground">Phase 5 — Hotel, floors & room allocation</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Hotel</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[{ label: "Hotels", value: stats.total }, { label: "Total Rooms", value: stats.rooms }, { label: "Assigned Pilgrims", value: stats.assigned }].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
              <p className="text-xl font-bold text-[#0d5040]">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* City filter */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCityFilter("")} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${!cityFilter ? "bg-[#0d5040] text-white border-[#0d5040]" : "bg-white"}`}>All Cities</button>
          {CITIES.map(c => <button key={c} onClick={() => setCityFilter(c === cityFilter ? "" : c)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${cityFilter === c ? "bg-[#0d5040] text-white border-[#0d5040]" : "bg-white"}`}>{c}</button>)}
        </div>

        {loading ? <div className="py-16 text-center text-muted-foreground">Loading…</div> : hotels.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border">
            <Building2 size={36} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No hotels added yet</p>
            <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Hotel</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {hotels.map(h => {
              const isExp = expanded.has(h.id);
              const hotelRooms = rooms[h.id] || [];
              return (
                <div key={h.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 bg-[#0d5040]/10 rounded-xl flex items-center justify-center">
                      <Building2 size={22} className="text-[#0d5040]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">{h.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CITY_COLORS[h.city] || "bg-gray-100 text-gray-700"}`}>{h.city}</span>
                        {h.stars && <span className="flex items-center gap-0.5 text-amber-400 text-xs"><Star size={11} fill="currentColor" />{h.stars}</span>}
                        {h.group_name && <Badge variant="outline" className="text-[10px]">{h.group_name}</Badge>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        {h.address && <span>{h.address}</span>}
                        {h.contact_phone && <span className="flex items-center gap-1"><Phone size={10} />{h.contact_phone}</span>}
                        {h.check_in_date && <span className="flex items-center gap-1"><Calendar size={10} />Check-in: {h.check_in_date}</span>}
                        {h.check_out_date && <span>Check-out: {h.check_out_date}</span>}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground"><BedDouble size={11} />{h.room_count || 0} rooms</span>
                        <span className="flex items-center gap-1 text-muted-foreground"><Users size={11} />{h.assigned_count || 0} pilgrims</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(h.id)}>{isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(h)}><Pencil size={13} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => softDelete(h.id)}><Trash2 size={13} /></Button>
                    </div>
                  </div>

                  {isExp && (
                    <div className="border-t bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rooms ({hotelRooms.length})</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddRoom(h.id)}><Plus size={11} className="mr-1" />Add Room</Button>
                      </div>
                      {hotelRooms.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No rooms added yet. Click "Add Room" to start.</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {hotelRooms.map(r => (
                            <div key={r.id} className="bg-white rounded-lg border p-2.5 flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">Room {r.room_number}</p>
                                <p className="text-[10px] text-muted-foreground">{r.floor ? `Floor ${r.floor} · ` : ""}{r.capacity} beds · {r.bed_type}</p>
                                {r.assigned_count > 0 && <p className="text-[10px] text-emerald-600">{r.assigned_count} assigned</p>}
                              </div>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 shrink-0" onClick={() => deleteRoom(h.id, r.id)}><Trash2 size={10} /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Hotel Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Hotel" : "Add Hotel"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs font-medium">Hotel Name *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Grand Makkah Hotel" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">City *</label>
                <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-medium">Star Rating</label><select value={form.stars} onChange={e => setForm(f => ({ ...f, stars: +e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">{[1,2,3,4,5].map(s => <option key={s} value={s}>{s} Star</option>)}</select></div>
            </div>
            <div><label className="text-xs font-medium">Address</label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Hotel address…" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Check-in Date</label><Input type="date" value={form.check_in_date} onChange={e => setForm(f => ({ ...f, check_in_date: e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">Check-out Date</label><Input type="date" value={form.check_out_date} onChange={e => setForm(f => ({ ...f, check_out_date: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Total Rooms</label><Input type="number" value={form.total_rooms} onChange={e => setForm(f => ({ ...f, total_rooms: +e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">Contact Phone</label><Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} className="mt-1" /></div>
            </div>
            <div>
              <label className="text-xs font-medium">Hajj Group (optional)</label>
              <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                <option value="">— No Group —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.groupName || g.group_name}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" rows={2} /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Add Hotel"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Room Modal */}
      <Dialog open={showRoomModal} onOpenChange={setShowRoomModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Room</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Room Number *</label><Input value={roomForm.room_number} onChange={e => setRoomForm(f => ({ ...f, room_number: e.target.value }))} placeholder="101" className="mt-1" /></div>
              <div><label className="text-xs font-medium">Floor</label><Input value={roomForm.floor} onChange={e => setRoomForm(f => ({ ...f, floor: e.target.value }))} placeholder="1st" className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Capacity (beds)</label><Input type="number" value={roomForm.capacity} onChange={e => setRoomForm(f => ({ ...f, capacity: +e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">Bed Type</label><select value={roomForm.bed_type} onChange={e => setRoomForm(f => ({ ...f, bed_type: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">{BED_TYPES.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
            </div>
            <div><label className="text-xs font-medium">Notes</label><Input value={roomForm.notes} onChange={e => setRoomForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowRoomModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={saveRoom} disabled={saving}>{saving ? "Saving…" : "Add Room"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
