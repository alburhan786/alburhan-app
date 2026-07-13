import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Heart, Plus, Pencil, Trash2, RefreshCw, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const SEVERITIES = [
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-700" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
];
const STATUSES = [
  { value: "open", label: "Open", color: "bg-red-50 text-red-700" },
  { value: "in_treatment", label: "In Treatment", color: "bg-amber-50 text-amber-700" },
  { value: "resolved", label: "Resolved", color: "bg-emerald-50 text-emerald-700" },
];
const CASE_TYPES = ["general", "cardiac", "respiratory", "diabetic", "orthopedic", "allergy", "heat_stroke", "injury", "other"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

interface MedCase {
  id: string; pilgrim_id: string; full_name: string; mobile_india: string; blood_group: string;
  group_id: string; group_name: string; case_type: string; description: string;
  severity: string; status: string; handled_by: string; notes: string; created_at: string; resolved_at: string;
}
interface Group { id: string; groupName?: string; group_name?: string; }
interface Stats { total: number; open_count: number; in_treatment: number; resolved: number; critical: number; high_priority: number; }

const EMPTY = { pilgrimId: "", pilgrimName: "", groupId: "", caseType: "general", description: "", severity: "low", handledBy: "", notes: "" };

export default function MedicalManager() {
  const [cases, setCases] = useState<MedCase[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, open_count: 0, in_treatment: 0, resolved: 0, critical: 0, high_priority: 0 });
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
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
      if (statusFilter) params.set("status", statusFilter);
      if (severityFilter) params.set("severity", severityFilter);
      const [cRes, sRes] = await Promise.all([
        fetch(`${API}/api/medical/cases?${params}`, { credentials: "include" }),
        fetch(`${API}/api/medical/stats`, { credentials: "include" }),
      ]);
      if (cRes.ok) setCases(await cRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { load(); }, [groupFilter, statusFilter, severityFilter]);

  function openAdd() { setEditId(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(c: MedCase) {
    setEditId(c.id);
    setForm({ pilgrimId: c.pilgrim_id, pilgrimName: c.full_name, groupId: c.group_id || "", caseType: c.case_type, description: c.description || "", severity: c.severity, handledBy: c.handled_by || "", notes: c.notes || "" });
    setShowModal(true);
  }

  async function save() {
    if (!form.pilgrimId) { toast({ title: "Pilgrim ID required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { pilgrimId: form.pilgrimId, groupId: form.groupId, caseType: form.caseType, description: form.description, severity: form.severity, handledBy: form.handledBy, notes: form.notes };
      const url = editId ? `${API}/api/medical/cases/${editId}` : `${API}/api/medical/cases`;
      const method = editId ? "PUT" : "POST";
      const extra = editId ? { status: "open" } : {};
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...extra }) });
      if (!r.ok) throw new Error("Failed to save");
      toast({ title: editId ? "Case updated" : "Case added" });
      setShowModal(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function updateStatus(id: string, status: string, c: MedCase) {
    try {
      await fetch(`${API}/api/medical/cases/${id}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseType: c.case_type, description: c.description, severity: c.severity, status, handledBy: c.handled_by, notes: c.notes }),
      });
      toast({ title: "Status updated" });
      load();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this case?")) return;
    await fetch(`${API}/api/medical/cases/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Case deleted" });
    load();
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2"><Heart size={22} /> Medical Module</h1>
            <p className="text-sm text-muted-foreground">Phase 7 — Track pilgrim medical cases</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Case</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Cases", value: stats.total, color: "text-[#0d5040]" },
            { label: "Open", value: stats.open_count, color: "text-red-600" },
            { label: "In Treatment", value: stats.in_treatment, color: "text-amber-600" },
            { label: "Resolved", value: stats.resolved, color: "text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        {(stats.critical > 0 || stats.high_priority > 0) && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <span className="text-red-700 font-medium">{stats.critical} critical · {stats.high_priority} high priority cases need immediate attention</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="h-9 px-3 rounded-lg border text-sm bg-white">
            <option value="">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.groupName || g.group_name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 rounded-lg border text-sm bg-white">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="h-9 px-3 rounded-lg border text-sm bg-white">
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {loading ? <div className="py-16 text-center text-muted-foreground">Loading…</div> : cases.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border">
            <Heart size={36} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No medical cases recorded</p>
            <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}><Plus size={13} className="mr-1" />Add Case</Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_90px_100px_80px] gap-x-4 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              <span>Pilgrim / Case</span><span>Severity</span><span>Status</span><span>Handled By</span><span></span>
            </div>
            {cases.map(c => {
              const sev = SEVERITIES.find(s => s.value === c.severity);
              const st = STATUSES.find(s => s.value === c.status);
              return (
                <div key={c.id} className="grid grid-cols-[1fr_100px_90px_100px_80px] gap-x-4 px-4 py-3 items-center border-b last:border-b-0 hover:bg-muted/20">
                  <div>
                    <p className="font-medium text-sm">{c.full_name || c.pilgrim_id}</p>
                    <p className="text-xs text-muted-foreground">{c.group_name || ""} · {c.case_type}</p>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.description}</p>}
                    {c.blood_group && <p className="text-[10px] text-muted-foreground">Blood: {c.blood_group}</p>}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium w-fit ${sev?.color || "bg-gray-100"}`}>{sev?.label || c.severity}</span>
                  <select
                    value={c.status}
                    onChange={e => updateStatus(c.id, e.target.value, c)}
                    className={`text-[11px] px-2 py-1 rounded-lg border-0 font-medium cursor-pointer ${st?.color || ""}`}
                  >
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground truncate">{c.handled_by || "—"}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil size={12} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => remove(c.id)}><Trash2 size={12} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Medical Case" : "Add Medical Case"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Pilgrim ID *</label>
              <Input value={form.pilgrimId} onChange={e => setForm(f => ({ ...f, pilgrimId: e.target.value }))} placeholder="Enter pilgrim ID" className="mt-1 font-mono" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Get pilgrim ID from the Hajj Groups → Pilgrims page</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Group</label>
                <select value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="">— Select —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.groupName || g.group_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Case Type</label>
                <select value={form.caseType} onChange={e => setForm(f => ({ ...f, caseType: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {CASE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace("_", " ")}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Severity</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium">Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" rows={2} placeholder="Describe the medical situation…" /></div>
            <div><label className="text-xs font-medium">Handled By</label><Input value={form.handledBy} onChange={e => setForm(f => ({ ...f, handledBy: e.target.value }))} placeholder="Doctor / Nurse name" className="mt-1" /></div>
            <div><label className="text-xs font-medium">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" rows={2} /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Add Case"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
