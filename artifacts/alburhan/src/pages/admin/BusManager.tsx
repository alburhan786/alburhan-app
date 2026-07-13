import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bus, Plus, Pencil, Trash2, Users, Phone, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const VEHICLE_TYPES = ["Coach", "Mini-bus", "Van", "SUV", "Other"];

interface BusRow {
  id: string; bus_number: string; group_id: string; group_name: string;
  capacity: number; vehicle_type: string; driver_name: string; driver_mobile: string;
  route_description: string; notes: string; assigned_count: number;
}
interface Group { id: string; groupName?: string; group_name?: string; }
interface Pilgrim { id: string; full_name: string; mobile_india: string; seat_number: string; }

const EMPTY = { bus_number: "", group_id: "", capacity: 45, vehicle_type: "Coach", driver_name: "", driver_mobile: "", route_description: "", notes: "" };

export default function BusManager() {
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pilgrims, setPilgrims] = useState<Record<string, Pilgrim[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
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
      if (groupFilter) params.set("groupId", groupFilter);
      const r = await fetch(`${API}/api/buses?${params}`, { credentials: "include" });
      if (r.ok) setBuses(await r.json());
    } catch {}
    setLoading(false);
  }

  async function loadPilgrims(busId: string) {
    try {
      const r = await fetch(`${API}/api/buses/${busId}/pilgrims`, { credentials: "include" });
      if (r.ok) { const data = await r.json(); setPilgrims(prev => ({ ...prev, [busId]: data })); }
    } catch {}
  }

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { load(); }, [groupFilter]);

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    if (!expanded.has(id)) loadPilgrims(id);
  }

  function openAdd() { setEditId(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(b: BusRow) {
    setEditId(b.id);
    setForm({ bus_number: b.bus_number, group_id: b.group_id, capacity: b.capacity, vehicle_type: b.vehicle_type, driver_name: b.driver_name || "", driver_mobile: b.driver_mobile || "", route_description: b.route_description || "", notes: b.notes || "" });
    setShowModal(true);
  }

  async function save() {
    if (!form.bus_number || !form.group_id) { toast({ title: "Bus number and group required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editId ? `${API}/api/buses/${editId}` : `${API}/api/buses`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
      toast({ title: editId ? "Bus updated" : "Bus added" });
      setShowModal(false);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this bus?")) return;
    await fetch(`${API}/api/buses/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Bus deleted" });
    load();
  }

  const totalCapacity = buses.reduce((s, b) => s + b.capacity, 0);
  const totalAssigned = buses.reduce((s, b) => s + (b.assigned_count || 0), 0);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2"><Bus size={22} /> Bus Management</h1>
            <p className="text-sm text-muted-foreground">Phase 6 — Transport & pilgrim bus allocation</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Bus</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[{ label: "Total Buses", value: buses.length }, { label: "Total Capacity", value: totalCapacity }, { label: "Pilgrims Assigned", value: totalAssigned }].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
              <p className="text-xl font-bold text-[#0d5040]">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="h-9 px-3 rounded-lg border text-sm bg-white">
            <option value="">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.groupName || g.group_name}</option>)}
          </select>
        </div>

        {loading ? <div className="py-16 text-center text-muted-foreground">Loading…</div> : buses.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border">
            <Bus size={36} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No buses added yet</p>
            <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Bus</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {buses.map(b => {
              const isExp = expanded.has(b.id);
              const busPilgrims = pilgrims[b.id] || [];
              const fillPct = b.capacity > 0 ? Math.round(((b.assigned_count || 0) / b.capacity) * 100) : 0;
              return (
                <div key={b.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                      <Bus size={22} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">Bus {b.bus_number}</span>
                        <Badge variant="outline" className="text-[10px]">{b.vehicle_type}</Badge>
                        {b.group_name && <Badge variant="outline" className="text-[10px]">{b.group_name}</Badge>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        {b.driver_name && <span className="flex items-center gap-1"><Users size={10} />Driver: {b.driver_name}</span>}
                        {b.driver_mobile && <span className="flex items-center gap-1"><Phone size={10} />{b.driver_mobile}</span>}
                        {b.route_description && <span>Route: {b.route_description}</span>}
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{b.assigned_count || 0}/{b.capacity} seats</span>
                          <span className="font-medium">{fillPct}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden w-48">
                          <div className={`h-full rounded-full ${fillPct >= 90 ? "bg-red-400" : fillPct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(fillPct, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(b.id)}>{isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil size={13} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => remove(b.id)}><Trash2 size={13} /></Button>
                    </div>
                  </div>
                  {isExp && (
                    <div className="border-t bg-muted/20 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pilgrims on this Bus ({busPilgrims.length})</p>
                      {busPilgrims.length === 0 ? <p className="text-xs text-muted-foreground italic">No pilgrims assigned yet</p> : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {busPilgrims.map(p => (
                            <div key={p.id} className="bg-white rounded-lg border px-3 py-2 text-xs">
                              <p className="font-medium">{p.full_name}</p>
                              <p className="text-muted-foreground">{p.mobile_india}{p.seat_number ? ` · Seat ${p.seat_number}` : ""}</p>
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

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Bus" : "Add Bus"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Bus Number *</label><Input value={form.bus_number} onChange={e => setForm(f => ({ ...f, bus_number: e.target.value }))} placeholder="BUS-01" className="mt-1" /></div>
              <div><label className="text-xs font-medium">Vehicle Type</label><select value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">{VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Hajj Group *</label>
                <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))} className={`mt-1 w-full h-9 px-2 rounded border text-sm bg-background ${!form.group_id ? "border-red-300" : ""}`}>
                  <option value="">— Select Group —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.groupName || g.group_name}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-medium">Capacity (seats)</label><Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Driver Name</label><Input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">Driver Mobile</label><Input value={form.driver_mobile} onChange={e => setForm(f => ({ ...f, driver_mobile: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><label className="text-xs font-medium">Route Description</label><Input value={form.route_description} onChange={e => setForm(f => ({ ...f, route_description: e.target.value }))} placeholder="Makkah ↔ Madinah" className="mt-1" /></div>
            <div><label className="text-xs font-medium">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" rows={2} /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Add Bus"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
