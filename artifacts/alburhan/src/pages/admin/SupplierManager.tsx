import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Phone, Mail, Edit2, Trash2, RefreshCw, Search, Building2 } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const TYPES = [
  { id: "hotel", label: "Hotel", icon: "🏨", color: "bg-amber-50 text-amber-700" },
  { id: "airline", label: "Airline", icon: "✈️", color: "bg-blue-50 text-blue-700" },
  { id: "transport", label: "Transport", icon: "🚌", color: "bg-teal-50 text-teal-700" },
  { id: "catering", label: "Catering", icon: "🍽️", color: "bg-orange-50 text-orange-700" },
  { id: "visa", label: "Visa Provider", icon: "🛂", color: "bg-violet-50 text-violet-700" },
  { id: "laundry", label: "Laundry", icon: "👕", color: "bg-sky-50 text-sky-700" },
  { id: "medical", label: "Medical", icon: "🏥", color: "bg-rose-50 text-rose-700" },
  { id: "other", label: "Other", icon: "📋", color: "bg-gray-50 text-gray-700" },
];

const EMPTY_FORM = { name: "", type: "hotel", contactName: "", contactMobile: "", contactEmail: "", address: "", city: "", country: "Saudi Arabia", gstNumber: "", paymentTerms: "", notes: "", contractExpiry: "" };

function SupplierForm({ initial, onSave, onCancel, saving }: { initial?: any; onSave: (d: any) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div className="rounded-2xl border p-5 bg-background space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Supplier Name *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Hilton Makkah" className="h-9" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Type</Label>
          <div className="flex flex-wrap gap-2">
            {TYPES.map(t => (
              <button key={t.id} onClick={() => set("type", t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${form.type === t.id ? t.color + " ring-2 ring-offset-1 ring-current" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contact Name</Label>
          <Input value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Contact person" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contact Mobile</Label>
          <Input value={form.contactMobile} onChange={e => set("contactMobile", e.target.value)} placeholder="+966 5XXXXXXXX" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contact Email</Label>
          <Input type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="email@supplier.com" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">GST / Tax Number</Label>
          <Input value={form.gstNumber} onChange={e => set("gstNumber", e.target.value)} placeholder="GST/VAT number" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Makkah / Madinah / Jeddah" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Country</Label>
          <Input value={form.country} onChange={e => set("country", e.target.value)} placeholder="Saudi Arabia" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Payment Terms</Label>
          <Input value={form.paymentTerms} onChange={e => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30 days, 50% advance" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contract Expiry</Label>
          <Input type="date" value={form.contractExpiry} onChange={e => set("contractExpiry", e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Address</Label>
          <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Full address" className="h-9" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Notes</Label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Contract terms, special agreements, notes…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.name.trim()} className="gap-1.5">
          {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
          {initial ? "Update Supplier" : "Add Supplier"}
        </Button>
      </div>
    </div>
  );
}

export default function SupplierManager() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/suppliers`, { credentials: "include" });
      if (r.ok) setSuppliers(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    setSaving(true);
    try {
      const url = editSupplier ? `${BASE_API}/api/enterprise/suppliers/${editSupplier.id}` : `${BASE_API}/api/enterprise/suppliers`;
      const method = editSupplier ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { toast({ title: editSupplier ? "Supplier updated" : "Supplier added" }); setShowForm(false); setEditSupplier(null); load(); }
      else toast({ title: "Failed", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const deactivate = async (id: string) => {
    if (!confirm("Remove this supplier?")) return;
    await fetch(`${BASE_API}/api/enterprise/suppliers/${id}`, { method: "DELETE", credentials: "include" });
    setSuppliers(ss => ss.filter(s => s.id !== id));
  };

  const filtered = suppliers.filter(s =>
    (filterType === "all" || s.type === filterType) &&
    (!search || (s.name || "").toLowerCase().includes(search.toLowerCase()) || (s.city || "").toLowerCase().includes(search.toLowerCase()))
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Supplier Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage hotels, airlines, transport, catering and visa providers</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditSupplier(null); }} className="gap-1.5">
            <Plus size={15} /> Add Supplier
          </Button>
        </div>

        {/* Type summary */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterType("all")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterType === "all" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
            All ({suppliers.filter(s => s.is_active !== false).length})
          </button>
          {TYPES.map(t => {
            const count = suppliers.filter(s => s.type === t.id && s.is_active !== false).length;
            if (count === 0) return null;
            return (
              <button key={t.id} onClick={() => setFilterType(t.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterType === t.id ? t.color + " ring-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                <span>{t.icon}</span> {t.label} ({count})
              </button>
            );
          })}
        </div>

        {showForm && <SupplierForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}
        {editSupplier && (
          <SupplierForm
            initial={{ name: editSupplier.name, type: editSupplier.type, contactName: editSupplier.contact_name || "", contactMobile: editSupplier.contact_mobile || "", contactEmail: editSupplier.contact_email || "", address: editSupplier.address || "", city: editSupplier.city || "", country: editSupplier.country || "", gstNumber: editSupplier.gst_number || "", paymentTerms: editSupplier.payment_terms || "", notes: editSupplier.notes || "", contractExpiry: editSupplier.contract_expiry?.slice(0,10) || "" }}
            onSave={handleSave} onCancel={() => setEditSupplier(null)} saving={saving}
          />
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or city…" className="pl-9 h-9 text-sm" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading suppliers…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Building2 size={36} className="mx-auto mb-2 opacity-30" />
            <p>No suppliers found.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map(s => {
              const typeInfo = TYPES.find(t => t.id === s.type) || TYPES[TYPES.length - 1];
              const contractExpiring = s.contract_expiry && s.contract_expiry.slice(0, 10) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
              return (
                <div key={s.id} className={`rounded-2xl border p-4 bg-background space-y-3 hover:shadow-sm transition-all ${contractExpiring ? "border-amber-200" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${typeInfo.color} border border-white/20`}>{typeInfo.icon}</div>
                      <div>
                        <p className="font-bold text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.city}{s.city && s.country ? ", " : ""}{s.country}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditSupplier(s); setShowForm(false); }} className="w-7 h-7 rounded-lg border hover:bg-muted flex items-center justify-center"><Edit2 size={12} /></button>
                      <button onClick={() => deactivate(s.id)} className="w-7 h-7 rounded-lg border hover:bg-red-50 text-red-500 flex items-center justify-center"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {s.contact_name && <p>👤 {s.contact_name}</p>}
                    {s.contact_mobile && <p className="flex items-center gap-1"><Phone size={11} /> {s.contact_mobile}</p>}
                    {s.contact_email && <p className="flex items-center gap-1 truncate"><Mail size={11} /> {s.contact_email}</p>}
                    {s.payment_terms && <p>💳 {s.payment_terms}</p>}
                    {s.contract_expiry && (
                      <p className={contractExpiring ? "text-amber-600 font-semibold" : ""}>
                        📄 Contract expires: {new Date(s.contract_expiry).toLocaleDateString("en-IN")}
                        {contractExpiring && " ⚠️"}
                      </p>
                    )}
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-2 py-1 italic">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
