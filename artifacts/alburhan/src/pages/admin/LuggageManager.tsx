import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, Package, Search, Pencil, Trash2, Tag, Weight, MapPin, CheckCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface LuggageTag {
  id: string;
  tag_number: string;
  pilgrim_id: string;
  pilgrim_name: string;
  pilgrim_name_resolved: string;
  group_id: string;
  group_year: string;
  weight: number;
  status: string;
  location: string;
  delivery_status: string;
  notes: string;
}

interface Stats {
  total: number;
  assigned: number;
  in_transit: number;
  delivered: number;
  lost: number;
  total_weight: number;
}

const EMPTY = {
  tag_number: "", pilgrim_id: "", pilgrim_name: "", group_id: "",
  weight: "", status: "assigned", location: "", delivery_status: "pending", notes: ""
};

const STATUS_COLORS: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-700",
  in_transit: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

const DELIVERY_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  out_for_delivery: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export default function LuggageManager() {
  const [list, setList] = useState<LuggageTag[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, assigned: 0, in_transit: 0, delivered: 0, lost: 0, total_weight: 0 });
  const [groups, setGroups] = useState<any[]>([]);
  const [pilgrims, setPilgrims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LuggageTag | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [q, setQ] = useState("");
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterGroup) params.set("group_id", filterGroup);
      if (filterStatus) params.set("status", filterStatus);
      if (q) params.set("q", q);
      const [lr, sr, gr] = await Promise.all([
        fetch(`${API}/api/luggage?${params}`, { credentials: "include" }),
        fetch(`${API}/api/luggage/stats`, { credentials: "include" }),
        fetch(`${API}/api/groups`, { credentials: "include" }),
      ]);
      if (lr.ok) setList(await lr.json());
      if (sr.ok) setStats(await sr.json());
      if (gr.ok) setGroups(await gr.json());
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  async function loadPilgrims(groupId: string) {
    if (!groupId) { setPilgrims([]); return; }
    const r = await fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" });
    if (r.ok) { const d = await r.json(); setPilgrims(d.pilgrims || d); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { loadPilgrims(form.group_id); }, [form.group_id]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, tag_number: `LT-${Date.now().toString().slice(-6)}` });
    setShowForm(true);
  }

  function openEdit(t: LuggageTag) {
    setEditing(t);
    setForm({ ...t, weight: t.weight || "" });
    setShowForm(true);
  }

  async function save() {
    if (!form.tag_number) { toast({ title: "Tag number required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/luggage/${editing.id}` : `${API}/api/luggage`;
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weight: form.weight ? parseFloat(form.weight) : null }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: editing ? "Updated" : "Tag created" });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this luggage tag?")) return;
    await fetch(`${API}/api/luggage/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Deleted" });
    load();
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Luggage Management</h1>
            <p className="text-sm text-muted-foreground">Track and manage luggage tags for all pilgrims</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Add Tag
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Total Tags", value: stats.total, color: "text-gray-700", bg: "bg-gray-50" },
            { label: "Assigned", value: stats.assigned, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "In Transit", value: stats.in_transit, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Delivered", value: stats.delivered, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Lost", value: stats.lost, color: "text-red-600", bg: "bg-red-50" },
            { label: "Total Weight", value: `${Number(stats.total_weight || 0).toFixed(1)} kg`, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border p-3 text-center ${s.bg}`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 w-52" placeholder="Search tag, name…" value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load()} />
          </div>
          <select className="text-sm border rounded-lg px-3 py-1.5" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
            <option value="">All Groups</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name || g.year}</option>)}
          </select>
          <select className="text-sm border rounded-lg px-3 py-1.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="lost">Lost</option>
          </select>
          <Button size="sm" variant="outline" onClick={load}>Search</Button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0d5040]">{editing ? "Edit Tag" : "New Luggage Tag"}</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Tag Number *</label>
                  <Input className="mt-1" placeholder="LT-000001" value={form.tag_number}
                    onChange={e => setForm({ ...form, tag_number: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Group</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.group_id || ""}
                    onChange={e => setForm({ ...form, group_id: e.target.value, pilgrim_id: "", pilgrim_name: "" })}>
                    <option value="">Select group…</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name || g.year}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Weight (kg)</label>
                  <Input type="number" step="0.1" className="mt-1" placeholder="23.5" value={form.weight}
                    onChange={e => setForm({ ...form, weight: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Pilgrim</label>
                  {form.group_id ? (
                    <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.pilgrim_id || ""}
                      onChange={e => {
                        const p = pilgrims.find((p: any) => p.id === e.target.value);
                        setForm({ ...form, pilgrim_id: e.target.value, pilgrim_name: p?.full_name || "" });
                      }}>
                      <option value="">Select pilgrim…</option>
                      {pilgrims.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : (
                    <Input className="mt-1" placeholder="Pilgrim name (select group first)" value={form.pilgrim_name}
                      onChange={e => setForm({ ...form, pilgrim_name: e.target.value })} />
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="assigned">Assigned</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Delivery Status</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.delivery_status}
                    onChange={e => setForm({ ...form, delivery_status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Current Location</label>
                  <Input className="mt-1" placeholder="e.g. Airport, Hotel, Mina Camp" value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea className="w-full text-sm border rounded-lg px-3 py-2 mt-1 h-16 resize-none"
                    placeholder="Any notes…" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update" : "Create Tag"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No luggage tags found</p>
            <Button className="mt-4 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Add First Tag
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Tag #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Pilgrim</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Weight</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Location</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Delivery</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 font-mono font-semibold">
                          <Tag size={13} className="text-[#0d5040]" />
                          {t.tag_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.pilgrim_name_resolved || t.pilgrim_name || "—"}</p>
                        {t.group_year && <p className="text-xs text-muted-foreground">{t.group_year}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {t.weight ? (
                          <span className="flex items-center gap-1"><Weight size={12} />{Number(t.weight).toFixed(1)} kg</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                          {t.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.location ? (
                          <span className="flex items-center gap-1 text-xs"><MapPin size={11} />{t.location}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${DELIVERY_COLORS[t.delivery_status] || "bg-gray-100 text-gray-600"}`}>
                          {t.delivery_status?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(t)}><Pencil size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => del(t.id)}><Trash2 size={13} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
