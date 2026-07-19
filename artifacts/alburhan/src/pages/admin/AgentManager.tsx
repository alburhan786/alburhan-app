import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, UserCheck, Phone, Mail, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_API = import.meta.env.VITE_API_URL || "";

const EMPTY = { name: "", mobile: "", email: "", city: "", branch_id: "", commission_rate: "0", is_active: true, notes: "" };

export default function AgentManager() {
  const { toast } = useToast();
  const [agents, setAgents] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ar, br] = await Promise.all([
        fetch(`${BASE_API}/api/admin/agents`, { credentials: "include" }),
        fetch(`${BASE_API}/api/admin/branches`, { credentials: "include" }),
      ]);
      if (ar.ok) setAgents(await ar.json());
      if (br.ok) setBranches(await br.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Agent name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editId ? `${BASE_API}/api/admin/agents/${editId}` : `${BASE_API}/api/admin/agents`;
      const r = await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ...form, commission_rate: parseFloat(form.commission_rate) || 0 }) });
      if (r.ok) {
        toast({ title: editId ? "Agent updated" : "Agent added" });
        setShowForm(false); setEditId(null); setForm(EMPTY); load();
      } else {
        const d = await r.json(); toast({ title: d.error || "Save failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    setSaving(false);
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Remove agent "${name}"?`)) return;
    await fetch(`${BASE_API}/api/admin/agents/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const edit = (a: any) => {
    setForm({ name: a.name, mobile: a.mobile||"", email: a.email||"", city: a.city||"", branch_id: a.branch_id||"", commission_rate: String(a.commission_rate||0), is_active: a.is_active, notes: a.notes||"" });
    setEditId(a.id); setShowForm(true);
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><UserCheck size={18} className="text-primary" /></div>
              Agent Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agent{agents.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} size="sm" className="gap-1.5"><Plus size={13} /> Add Agent</Button>
          </div>
        </div>

        {showForm && (
          <div className="rounded-2xl border bg-muted/10 p-5 space-y-4">
            <h2 className="font-semibold">{editId ? "Edit Agent" : "New Agent"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "name", label: "Agent Name *", placeholder: "Full name" },
                { key: "mobile", label: "Mobile", placeholder: "9876543210" },
                { key: "email", label: "Email", placeholder: "agent@email.com" },
                { key: "city", label: "City", placeholder: "City" },
                { key: "commission_rate", label: "Commission %", placeholder: "5" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} type={f.key === "commission_rate" ? "number" : "text"}
                    className="mt-1 w-full h-9 px-3 rounded-xl border text-sm bg-background focus:outline-none focus:border-primary" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Branch</label>
                <select value={form.branch_id} onChange={e => setForm((p: any) => ({ ...p, branch_id: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-xl border text-sm bg-background focus:outline-none focus:border-primary">
                  <option value="">No branch</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                className="mt-1 w-full px-3 py-2 rounded-xl border text-sm bg-background focus:outline-none focus:border-primary h-16 resize-none" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm((p: any) => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              Active agent
            </label>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} size="sm">{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
              <Button onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }} variant="outline" size="sm">Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading agents…</div>
        ) : agents.length === 0 ? (
          <div className="py-16 text-center">
            <UserCheck size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground">No agents yet. Add your first agent.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="hidden sm:grid grid-cols-5 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span className="col-span-2">Agent</span><span>Branch</span><span>Bookings</span><span className="text-right">Actions</span>
            </div>
            {agents.map((a: any) => (
              <div key={a.id} className="grid grid-cols-1 sm:grid-cols-5 px-4 py-3 border-t gap-2 hover:bg-muted/10">
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.name}</span>
                    <Badge variant="outline" className={a.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]" : "bg-red-50 text-red-700 border-red-200 text-[10px]"}>
                      {a.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {a.mobile && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone size={10} />{a.mobile}</p>}
                  {a.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={10} />{a.email}</p>}
                </div>
                <div className="text-sm self-center">
                  {a.branch_name ? <p className="flex items-center gap-1 text-xs"><Building2 size={11} />{a.branch_name}</p> : <span className="text-xs text-muted-foreground">—</span>}
                  {Number(a.commission_rate) > 0 && <p className="text-xs text-muted-foreground mt-0.5">{a.commission_rate}% commission</p>}
                </div>
                <div className="text-sm self-center">
                  <p className="font-mono font-bold">{a.total_bookings || 0}</p>
                  <p className="text-xs text-muted-foreground">₹{(a.total_collected || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex gap-1.5 justify-end items-center">
                  <Button onClick={() => edit(a)} variant="outline" size="sm" className="h-7 px-2"><Pencil size={12} /></Button>
                  <Button onClick={() => del(a.id, a.name)} variant="outline" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700"><Trash2 size={12} /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
