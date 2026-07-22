import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, RefreshCw, MapPin, Calendar, Clock, Users, Bus, UserCheck,
  Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2, Circle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

type Site = { name: string; location: string; city: string };
const SITES: Site[] = [
  { name: "Masjid Al-Haram", location: "Makkah", city: "Makkah" },
  { name: "Jabal Al-Nour (Hira Cave)", location: "Makkah", city: "Makkah" },
  { name: "Jabal Thawr", location: "Makkah", city: "Makkah" },
  { name: "Masjid Al-Jinn", location: "Makkah", city: "Makkah" },
  { name: "Masjid Aisha (Tan'eem)", location: "Makkah", city: "Makkah" },
  { name: "Masjid Al-Khayf (Mina)", location: "Mina", city: "Makkah" },
  { name: "Masjid Nimra (Arafat)", location: "Arafat", city: "Makkah" },
  { name: "Masjid Al-Nabawi", location: "Madinah", city: "Madinah" },
  { name: "Masjid Quba", location: "Madinah", city: "Madinah" },
  { name: "Masjid Al-Qiblatain", location: "Madinah", city: "Madinah" },
  { name: "Jannatul Baqi", location: "Madinah", city: "Madinah" },
  { name: "Uhud Mountain", location: "Madinah", city: "Madinah" },
  { name: "Masjid Badr", location: "Badr", city: "Madinah" },
  { name: "Jannatul Muallah", location: "Makkah", city: "Makkah" },
];

interface ZSchedule {
  id: string;
  name: string;
  location: string;
  city: string;
  schedule_date: string;
  departure_time: string;
  return_time: string;
  bus_id: string;
  bus_number: string;
  group_id: string;
  guide_name: string;
  guide_mobile: string;
  capacity: number;
  checked_in_count: number;
  notes: string;
  status: string;
}

const EMPTY: Partial<ZSchedule> = {
  name: "", location: "", city: "Makkah", schedule_date: "",
  departure_time: "", return_time: "", guide_name: "", guide_mobile: "",
  capacity: 50, notes: "", status: "scheduled"
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  ongoing: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function ZiyaratManager() {
  const [list, setList] = useState<ZSchedule[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ZSchedule | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [filterCity, setFilterCity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [zr, br, gr] = await Promise.all([
        fetch(`${API}/api/ziyarat`, { credentials: "include" }),
        fetch(`${API}/api/buses`, { credentials: "include" }),
        fetch(`${API}/api/groups`, { credentials: "include" }),
      ]);
      if (zr.ok) setList(await zr.json());
      if (br.ok) { const busData = await br.json(); setBuses(busData.buses || busData || []); }
      if (gr.ok) setGroups(await gr.json());
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, schedule_date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  }

  function openEdit(z: ZSchedule) {
    setEditing(z);
    setForm({ ...z });
    setShowForm(true);
  }

  async function save() {
    if (!form.name || !form.location || !form.schedule_date) {
      toast({ title: "Name, location, and date are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/ziyarat/${editing.id}` : `${API}/api/ziyarat`;
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: editing ? "Updated" : "Ziyarat scheduled" });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this ziyarat schedule?")) return;
    try {
      const r = await fetch(`${API}/api/ziyarat/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
      toast({ title: "Deleted successfully" });
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  async function loadAttendance(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    try {
      const r = await fetch(`${API}/api/ziyarat/${id}/attendance`, { credentials: "include" });
      if (r.ok) setAttendance(await r.json());
      else toast({ title: "Could not load attendance", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Attendance load failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleAttendance(scheduleId: string, pilgrimId: string, current: boolean) {
    try {
      const r = await fetch(`${API}/api/ziyarat/${scheduleId}/attendance`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilgrim_id: pilgrimId, checked_in: !current }),
      });
      if (!r.ok) throw new Error("Failed to update attendance");
      const att = await fetch(`${API}/api/ziyarat/${scheduleId}/attendance`, { credentials: "include" });
      if (att.ok) setAttendance(await att.json());
    } catch (e: any) {
      toast({ title: "Attendance update failed", description: e.message, variant: "destructive" });
    }
  }

  const filtered = list.filter(z =>
    (!filterCity || z.city === filterCity) &&
    (!filterStatus || z.status === filterStatus)
  );

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Ziyarat Management</h1>
            <p className="text-sm text-muted-foreground">Schedule and track all ziyarat tours</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Schedule Ziyarat
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select className="text-sm border rounded-lg px-3 py-1.5" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
            <option value="">All Cities</option>
            <option value="Makkah">Makkah</option>
            <option value="Madinah">Madinah</option>
          </select>
          <select className="text-sm border rounded-lg px-3 py-1.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="text-sm text-muted-foreground self-center">{filtered.length} schedules</span>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0d5040]">{editing ? "Edit Ziyarat" : "Schedule Ziyarat"}</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Location / Site</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1"
                    value={form.name}
                    onChange={e => {
                      const site = SITES.find(s => s.name === e.target.value);
                      setForm({ ...form, name: e.target.value, location: site?.location || "", city: site?.city || "Makkah" });
                    }}>
                    <option value="">Select site…</option>
                    {SITES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                    <option value="__custom">Other (custom)</option>
                  </select>
                  {(form.name === "__custom" || !SITES.find(s => s.name === form.name)) && (
                    <Input className="mt-2" placeholder="Custom site name" value={form.name === "__custom" ? "" : form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Location Detail</label>
                  <Input className="mt-1" placeholder="e.g. Makkah" value={form.location || ""}
                    onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.city || "Makkah"}
                    onChange={e => setForm({ ...form, city: e.target.value })}>
                    <option>Makkah</option>
                    <option>Madinah</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <Input type="date" className="mt-1" value={form.schedule_date || ""}
                    onChange={e => setForm({ ...form, schedule_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.status || "scheduled"}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="scheduled">Scheduled</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Departure Time</label>
                  <Input type="time" className="mt-1" value={form.departure_time || ""}
                    onChange={e => setForm({ ...form, departure_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Return Time</label>
                  <Input type="time" className="mt-1" value={form.return_time || ""}
                    onChange={e => setForm({ ...form, return_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Guide Name</label>
                  <Input className="mt-1" placeholder="Guide name" value={form.guide_name || ""}
                    onChange={e => setForm({ ...form, guide_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Guide Mobile</label>
                  <Input className="mt-1" placeholder="+91…" value={form.guide_mobile || ""}
                    onChange={e => setForm({ ...form, guide_mobile: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Bus</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.bus_id || ""}
                    onChange={e => setForm({ ...form, bus_id: e.target.value })}>
                    <option value="">No bus assigned</option>
                    {buses.map((b: any) => <option key={b.id} value={b.id}>{b.bus_number} — {b.driver_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Capacity</label>
                  <Input type="number" className="mt-1" value={form.capacity || 50}
                    onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea className="w-full text-sm border rounded-lg px-3 py-2 mt-1 h-20 resize-none"
                    placeholder="Any additional notes…" value={form.notes || ""}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update" : "Schedule"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <MapPin size={40} className="mx-auto mb-3 opacity-30" />
            <p>No ziyarat scheduled yet</p>
            <Button className="mt-4 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Schedule First Ziyarat
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(z => (
              <div key={z.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{z.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${STATUS_COLORS[z.status] || "bg-gray-100 text-gray-600"}`}>
                        {z.status}
                      </span>
                      <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">{z.city}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin size={11} />{z.location}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} />{z.schedule_date}</span>
                      {z.departure_time && <span className="flex items-center gap-1"><Clock size={11} />{z.departure_time}{z.return_time ? ` → ${z.return_time}` : ""}</span>}
                      {z.bus_number && <span className="flex items-center gap-1"><Bus size={11} />{z.bus_number}</span>}
                      {z.guide_name && <span className="flex items-center gap-1"><UserCheck size={11} />{z.guide_name}</span>}
                      <span className="flex items-center gap-1"><Users size={11} />{z.checked_in_count}/{z.capacity} checked in</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => loadAttendance(z.id)}>
                      {expandedId === z.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span className="ml-1 hidden sm:inline">Attendance</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(z)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700" onClick={() => del(z.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>

                {expandedId === z.id && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Attendance ({attendance.filter(a => a.checked_in).length}/{attendance.length})</h3>
                      {z.group_id && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          await fetch(`${API}/api/ziyarat/${z.id}/bulk-add-group`, {
                            method: "POST", credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ group_id: z.group_id }),
                          });
                          loadAttendance(z.id);
                        }}>Add All from Group</Button>
                      )}
                    </div>
                    {attendance.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No pilgrims added yet. Add pilgrims from a group above.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {attendance.map(a => (
                          <div key={a.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleAttendance(z.id, a.pilgrim_id, a.checked_in)}>
                            {a.checked_in
                              ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                              : <Circle size={18} className="text-gray-300 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{a.full_name}</p>
                              {a.mobile_india && <p className="text-xs text-muted-foreground">{a.mobile_india}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
