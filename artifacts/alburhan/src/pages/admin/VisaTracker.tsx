import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileCheck, RefreshCw, Search, CheckCircle, Clock, AlertTriangle, XCircle } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const STATUSES = [
  { value: "not_applied", label: "Not Applied", color: "bg-gray-100 text-gray-600" },
  { value: "applied", label: "Applied", color: "bg-blue-100 text-blue-700" },
  { value: "in_process", label: "In Process", color: "bg-amber-100 text-amber-700" },
  { value: "received", label: "Received", color: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
];
const VISA_TYPES = ["Regular Hajj", "Group Hajj", "Umrah", "VIP", "Staff"];

interface Pilgrim {
  id: string; full_name: string; mobile_india: string; passport_number: string; passport_expiry_date: string;
  visa_number: string; visa_status: string; visa_type: string; visa_applied_date: string; visa_received_date: string;
  group_id: string; group_name: string; serial_number: number;
}
interface Stats { total: number; not_applied: number; applied: number; in_process: number; received: number; rejected: number; }
interface Group { id: string; groupName?: string; group_name?: string; }

export default function VisaTracker() {
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, not_applied: 0, applied: 0, in_process: 0, received: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("received");
  const [bulkDate, setBulkDate] = useState("");
  const [editPilgrim, setEditPilgrim] = useState<Pilgrim | null>(null);
  const [editForm, setEditForm] = useState({ visaStatus: "", visaNumber: "", visaType: "", visaAppliedDate: "", visaReceivedDate: "" });
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
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/api/visa?${params}`, { credentials: "include" }),
        fetch(`${API}/api/visa/stats${groupFilter ? `?groupId=${groupFilter}` : ""}`, { credentials: "include" }),
      ]);
      if (pRes.ok) setPilgrims(await pRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { load(); }, [groupFilter, statusFilter]);

  const filtered = pilgrims.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.full_name?.toLowerCase().includes(s) || p.passport_number?.toLowerCase().includes(s) || p.visa_number?.toLowerCase().includes(s);
  });

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(filtered.map(p => p.id))); }
  function clearSelect() { setSelected(new Set()); }

  function openEdit(p: Pilgrim) {
    setEditPilgrim(p);
    setEditForm({ visaStatus: p.visa_status || "not_applied", visaNumber: p.visa_number || "", visaType: p.visa_type || "", visaAppliedDate: p.visa_applied_date || "", visaReceivedDate: p.visa_received_date || "" });
  }

  async function saveEdit() {
    if (!editPilgrim) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/visa/${editPilgrim.id}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      if (!r.ok) throw new Error("Failed to update");
      toast({ title: "Visa updated" });
      setEditPilgrim(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function bulkUpdate() {
    if (!selected.size) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/visa/bulk-update`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilgrimIds: [...selected], visaStatus: bulkStatus, visaReceivedDate: bulkDate || null }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `Updated ${selected.size} pilgrims` });
      setShowBulk(false);
      clearSelect();
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  const statItems = [
    { label: "Total", value: stats.total, color: "text-[#0d5040]", icon: FileCheck },
    { label: "Not Applied", value: stats.not_applied, color: "text-gray-600", icon: Clock },
    { label: "In Process", value: (stats.applied || 0) + (stats.in_process || 0), color: "text-amber-600", icon: AlertTriangle },
    { label: "Received", value: stats.received, color: "text-emerald-600", icon: CheckCircle },
    { label: "Rejected", value: stats.rejected, color: "text-red-600", icon: XCircle },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2"><FileCheck size={22} /> Visa Tracker</h1>
            <p className="text-sm text-muted-foreground">Phase 8 — Track pilgrim visa status</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></Button>
            {selected.size > 0 && (
              <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={() => setShowBulk(true)}>
                Bulk Update ({selected.size})
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {statItems.map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-3 text-center">
              <s.icon size={16} className={`mx-auto mb-1 ${s.color}`} />
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Visa Progress</span>
              <span className="font-medium">{Math.round((stats.received / stats.total) * 100)}% received</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(stats.received / stats.total) * 100}%` }} title="Received" />
              <div className="bg-amber-400 h-full transition-all" style={{ width: `${(((stats.applied || 0) + (stats.in_process || 0)) / stats.total) * 100}%` }} title="In Process" />
              <div className="bg-red-400 h-full transition-all" style={{ width: `${(stats.rejected / stats.total) * 100}%` }} title="Rejected" />
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Received</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />In Process</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Rejected</span>
            </div>
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
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, passport, visa no…" className="pl-8 h-9" />
          </div>
          {selected.size > 0 ? (
            <button onClick={clearSelect} className="text-xs text-muted-foreground underline">Clear selection</button>
          ) : (
            <button onClick={selectAll} className="text-xs text-[#0d5040] underline">Select all</button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border">
            <FileCheck size={36} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No pilgrims found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_120px_110px_120px_120px_70px] gap-x-3 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              <span></span><span>Pilgrim</span><span>Passport</span><span>Visa No.</span><span>Applied</span><span>Status</span><span></span>
            </div>
            {filtered.map(p => {
              const st = STATUSES.find(s => s.value === (p.visa_status || "not_applied"));
              const isSel = selected.has(p.id);
              return (
                <div key={p.id} className={`grid grid-cols-[36px_1fr_120px_110px_120px_120px_70px] gap-x-3 px-4 py-3 items-center border-b last:border-b-0 hover:bg-muted/20 ${isSel ? "bg-[#0d5040]/5" : ""}`}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(p.id)} className="w-4 h-4 accent-[#0d5040]" />
                  <div>
                    <p className="font-medium text-sm">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.group_name} · #{p.serial_number}</p>
                  </div>
                  <div className="text-xs font-mono">
                    <p>{p.passport_number || "—"}</p>
                    {p.passport_expiry_date && <p className="text-muted-foreground">Exp: {p.passport_expiry_date}</p>}
                  </div>
                  <p className="text-xs font-mono">{p.visa_number || "—"}</p>
                  <p className="text-xs">{p.visa_applied_date || "—"}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium w-fit ${st?.color || "bg-gray-100"}`}>{st?.label || "Not Applied"}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => openEdit(p)}>Edit</Button>
                </div>
              );
            })}
          </div>
        )}
        {!loading && filtered.length > 0 && <p className="text-xs text-muted-foreground text-center">{filtered.length} pilgrims</p>}
      </div>

      {/* Edit Visa Modal */}
      <Dialog open={!!editPilgrim} onOpenChange={() => setEditPilgrim(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Visa — {editPilgrim?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Visa Status</label>
              <select value={editForm.visaStatus} onChange={e => setEditForm(f => ({ ...f, visaStatus: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium">Visa Number</label><Input value={editForm.visaNumber} onChange={e => setEditForm(f => ({ ...f, visaNumber: e.target.value }))} placeholder="Visa number…" className="mt-1 font-mono" /></div>
            <div>
              <label className="text-xs font-medium">Visa Type</label>
              <select value={editForm.visaType} onChange={e => setEditForm(f => ({ ...f, visaType: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                <option value="">— Select —</option>
                {VISA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Applied Date</label><Input type="date" value={editForm.visaAppliedDate} onChange={e => setEditForm(f => ({ ...f, visaAppliedDate: e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">Received Date</label><Input type="date" value={editForm.visaReceivedDate} onChange={e => setEditForm(f => ({ ...f, visaReceivedDate: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setEditPilgrim(null)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Modal */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Bulk Update Visa ({selected.size} pilgrims)</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Set Visa Status</label>
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                {STATUSES.filter(s => s.value !== "not_applied").map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium">Received / Applied Date</label><Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} className="mt-1" /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowBulk(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={bulkUpdate} disabled={saving}>{saving ? "Updating…" : `Update ${selected.size} Pilgrims`}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
