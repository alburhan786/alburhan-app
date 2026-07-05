import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, Tent, Pencil, Trash2, Users, UserCheck } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

type Site = "mina" | "arafat" | "muzdalifah";

interface Allocation {
  id: string;
  site: Site;
  pilgrim_id: string;
  pilgrim_name: string;
  family_id: string;
  group_id: string;
  group_name: string;
  group_year: string;
  tent_number: string;
  camp_number: string;
  area: string;
  capacity: number;
  guide_name: string;
  notes: string;
}

const EMPTY = {
  site: "mina" as Site, pilgrim_id: "", family_id: "", group_id: "",
  tent_number: "", camp_number: "", area: "", capacity: "", guide_name: "", notes: ""
};

const SITE_CONFIG: Record<Site, { label: string; color: string; bg: string; desc: string }> = {
  mina: { label: "Mina", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", desc: "Hajj tent allocations in Mina" },
  arafat: { label: "Arafat", color: "text-green-700", bg: "bg-green-50 border-green-200", desc: "Wuquf allocations in Arafat" },
  muzdalifah: { label: "Muzdalifah", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", desc: "Night stay allocations in Muzdalifah" },
};

export default function AllocationsManager() {
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [pilgrims, setPilgrims] = useState<any[]>([]);
  const [activeSite, setActiveSite] = useState<Site>("mina");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Allocation | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterGroup, setFilterGroup] = useState("");
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ site: activeSite });
      if (filterGroup) params.set("group_id", filterGroup);
      const [ar, sr, gr] = await Promise.all([
        fetch(`${API}/api/allocations?${params}`, { credentials: "include" }),
        fetch(`${API}/api/allocations/stats`, { credentials: "include" }),
        fetch(`${API}/api/groups`, { credentials: "include" }),
      ]);
      if (ar.ok) setAllocs(await ar.json());
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

  useEffect(() => { load(); }, [activeSite, filterGroup]);
  useEffect(() => { loadPilgrims(form.group_id); }, [form.group_id]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, site: activeSite });
    setShowForm(true);
  }

  function openEdit(a: Allocation) {
    setEditing(a);
    setForm({ ...a, capacity: a.capacity || "" });
    setShowForm(true);
  }

  async function save() {
    if (!form.site) { toast({ title: "Site required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/allocations/${editing.id}` : `${API}/api/allocations`;
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, capacity: form.capacity ? parseInt(form.capacity) : null }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      toast({ title: editing ? "Updated" : "Allocation saved" });
      setShowForm(false);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function del(id: string) {
    if (!confirm("Delete this allocation?")) return;
    await fetch(`${API}/api/allocations/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Deleted" });
    load();
  }

  const cfg = SITE_CONFIG[activeSite];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Holy Site Allocations</h1>
            <p className="text-sm text-muted-foreground">Manage Mina, Arafat & Muzdalifah tent and camp allocations</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Add Allocation
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.keys(SITE_CONFIG) as Site[]).map(site => {
            const s = stats[site] || {};
            const c = SITE_CONFIG[site];
            return (
              <div key={site}
                className={`rounded-2xl border p-4 cursor-pointer transition-all ${activeSite === site ? `${c.bg} ring-2 ring-offset-1 ring-current shadow-md` : "bg-white hover:bg-gray-50"}`}
                onClick={() => setActiveSite(site)}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-bold ${c.color}`}>{c.label}</span>
                  <Tent size={18} className={c.color} />
                </div>
                <p className={`text-2xl font-bold ${c.color}`}>{s.total || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                {(s.tents_used > 0 || s.groups > 0) && (
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    {s.tents_used > 0 && <span>{s.tents_used} tents</span>}
                    {s.groups > 0 && <span>{s.groups} groups</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex gap-1 p-1 rounded-xl border ${cfg.bg}`}>
            {(Object.keys(SITE_CONFIG) as Site[]).map(site => (
              <button key={site}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeSite === site ? `${SITE_CONFIG[site].color} bg-white shadow-sm` : "text-muted-foreground hover:text-gray-700"}`}
                onClick={() => setActiveSite(site)}>
                {SITE_CONFIG[site].label}
              </button>
            ))}
          </div>
          <select className="text-sm border rounded-lg px-3 py-1.5" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
            <option value="">All Groups</option>
            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name || g.year}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">{allocs.length} allocations</span>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0d5040]">{editing ? "Edit Allocation" : "Add Allocation"}</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Site *</label>
                  <div className="flex gap-2 mt-1">
                    {(Object.keys(SITE_CONFIG) as Site[]).map(site => (
                      <button key={site} type="button"
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${form.site === site ? `${SITE_CONFIG[site].bg} ${SITE_CONFIG[site].color} border-current` : "bg-white text-muted-foreground"}`}
                        onClick={() => setForm({ ...form, site })}>
                        {SITE_CONFIG[site].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tent Number</label>
                  <Input className="mt-1" placeholder="e.g. T-042" value={form.tent_number}
                    onChange={e => setForm({ ...form, tent_number: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Camp Number</label>
                  <Input className="mt-1" placeholder="e.g. C-12" value={form.camp_number}
                    onChange={e => setForm({ ...form, camp_number: e.target.value })} />
                </div>
                {form.site === "muzdalifah" && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Area</label>
                    <Input className="mt-1" placeholder="e.g. Area B" value={form.area}
                      onChange={e => setForm({ ...form, area: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Capacity</label>
                  <Input type="number" className="mt-1" placeholder="Persons" value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Guide Name</label>
                  <Input className="mt-1" placeholder="Guide name" value={form.guide_name}
                    onChange={e => setForm({ ...form, guide_name: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Group</label>
                  <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.group_id || ""}
                    onChange={e => setForm({ ...form, group_id: e.target.value, pilgrim_id: "" })}>
                    <option value="">Group-level allocation</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name || g.year}</option>)}
                  </select>
                </div>
                {form.group_id && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Specific Pilgrim (optional)</label>
                    <select className="w-full text-sm border rounded-lg px-3 py-2 mt-1" value={form.pilgrim_id || ""}
                      onChange={e => setForm({ ...form, pilgrim_id: e.target.value })}>
                      <option value="">All pilgrims in group</option>
                      {pilgrims.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea className="w-full text-sm border rounded-lg px-3 py-2 mt-1 h-16 resize-none"
                    placeholder="Any notes…" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update" : "Save Allocation"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : allocs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Tent size={40} className="mx-auto mb-3 opacity-30" />
            <p>No allocations for {cfg.label} yet</p>
            <Button className="mt-4 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openNew}>
              <Plus size={14} className="mr-1.5" />Add First Allocation
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Tent / Camp</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Group / Pilgrim</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Capacity</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Guide</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs">Notes</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allocs.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          {a.tent_number && <span className="flex items-center gap-1 font-semibold"><Tent size={13} className={cfg.color} />Tent: {a.tent_number}</span>}
                          {a.camp_number && <span className="text-xs text-muted-foreground">Camp: {a.camp_number}</span>}
                          {a.area && <span className="text-xs text-muted-foreground">Area: {a.area}</span>}
                          {!a.tent_number && !a.camp_number && !a.area && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{a.group_name || a.group_year || "—"}</p>
                        {a.pilgrim_name && <p className="text-xs text-muted-foreground flex items-center gap-1"><Users size={11} />{a.pilgrim_name}</p>}
                      </td>
                      <td className="px-4 py-3">{a.capacity || "—"}</td>
                      <td className="px-4 py-3">
                        {a.guide_name ? (
                          <span className="flex items-center gap-1 text-xs"><UserCheck size={11} />{a.guide_name}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="text-xs text-muted-foreground truncate">{a.notes || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(a)}><Pencil size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => del(a.id)}><Trash2 size={13} /></Button>
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
