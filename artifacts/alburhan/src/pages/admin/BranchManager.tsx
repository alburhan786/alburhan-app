import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, Building2, MapPin, Phone, Mail, CheckCircle, XCircle, BarChart2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_API = import.meta.env.VITE_API_URL || "";

const EMPTY = { name: "", city: "", address: "", manager_name: "", manager_mobile: "", manager_email: "", is_active: true };

export default function BranchManager() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/branches`, { credentials: "include" });
      if (r.ok) setBranches(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Branch name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editId ? `${BASE_API}/api/admin/branches/${editId}` : `${BASE_API}/api/admin/branches`;
      const r = await fetch(url, { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(form) });
      if (r.ok) {
        toast({ title: editId ? "Branch updated" : "Branch created" });
        setShowForm(false); setEditId(null); setForm(EMPTY); load();
      } else {
        const d = await r.json(); toast({ title: d.error || "Save failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    setSaving(false);
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete branch "${name}"?`)) return;
    await fetch(`${BASE_API}/api/admin/branches/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const edit = (b: any) => { setForm({ name: b.name, city: b.city||"", address: b.address||"", manager_name: b.manager_name||"", manager_mobile: b.manager_mobile||"", manager_email: b.manager_email||"", is_active: b.is_active }); setEditId(b.id); setShowForm(true); };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 size={18} className="text-primary" /></div>
              Branch Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{branches.length} branch{branches.length !== 1 ? "es" : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} size="sm" className="gap-1.5"><Plus size={13} /> Add Branch</Button>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="rounded-2xl border bg-muted/10 p-5 space-y-4">
            <h2 className="font-semibold">{editId ? "Edit Branch" : "New Branch"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "name", label: "Branch Name *", placeholder: "e.g. Mumbai Branch" },
                { key: "city", label: "City", placeholder: "Mumbai" },
                { key: "address", label: "Address", placeholder: "Full address" },
                { key: "manager_name", label: "Manager Name", placeholder: "Manager's name" },
                { key: "manager_mobile", label: "Manager Mobile", placeholder: "9876543210" },
                { key: "manager_email", label: "Manager Email", placeholder: "manager@email.com" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="mt-1 w-full h-9 px-3 rounded-xl border text-sm bg-background focus:outline-none focus:border-primary" />
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm((p: any) => ({ ...p, is_active: e.target.checked }))} className="rounded" />
              Active branch
            </label>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} size="sm">{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
              <Button onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }} variant="outline" size="sm">Cancel</Button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading branches…</div>
        ) : branches.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground">No branches yet. Add your first branch.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="hidden sm:grid grid-cols-5 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span className="col-span-2">Branch</span><span>Manager</span><span>Bookings</span><span className="text-right">Actions</span>
            </div>
            {branches.map((b: any) => (
              <div key={b.id} className="grid grid-cols-1 sm:grid-cols-5 px-4 py-3 border-t gap-2 hover:bg-muted/10">
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{b.name}</span>
                    <Badge variant="outline" className={b.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                      {b.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {b.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin size={11} />{b.city}</p>}
                </div>
                <div className="text-sm">
                  {b.manager_name && <p className="font-medium">{b.manager_name}</p>}
                  {b.manager_mobile && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} />{b.manager_mobile}</p>}
                  {b.manager_email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={10} />{b.manager_email}</p>}
                </div>
                <div className="text-sm self-center">
                  <p className="font-mono font-bold">{b.total_bookings || 0}</p>
                  <p className="text-xs text-muted-foreground">₹{(b.total_collected || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex gap-1.5 justify-end items-center flex-wrap">
                  <a href={`/admin/branch-dashboard/${b.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold transition-colors">
                    <BarChart2 size={12} /> Dashboard
                  </a>
                  <Button onClick={() => edit(b)} variant="outline" size="sm" className="h-7 px-2"><Pencil size={12} /></Button>
                  <Button onClick={() => del(b.id, b.name)} variant="outline" size="sm" className="h-7 px-2 text-red-600 hover:text-red-700"><Trash2 size={12} /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
