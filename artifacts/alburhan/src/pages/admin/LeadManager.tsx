import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Phone, Mail, Search, RefreshCw, UserPlus, Edit2, Trash2 } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const SOURCES = ["website", "whatsapp", "instagram", "facebook", "phone", "walk-in", "referral", "email", "other"];
const STATUSES = ["new", "contacted", "interested", "follow_up", "proposal_sent", "converted", "lost"];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-sky-100 text-sky-700",
  contacted: "bg-blue-100 text-blue-700",
  interested: "bg-violet-100 text-violet-700",
  follow_up: "bg-amber-100 text-amber-700",
  proposal_sent: "bg-orange-100 text-orange-700",
  converted: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

const SOURCE_ICONS: Record<string, string> = {
  website: "🌐", whatsapp: "💬", instagram: "📸", facebook: "👥", phone: "📞",
  "walk-in": "🚶", referral: "🤝", email: "✉️", other: "📋",
};

const EMPTY_FORM = { name: "", mobile: "", email: "", source: "website", message: "", packageInterest: "", assignedName: "", followUpDate: "", notes: "", budget: "", status: "new" };

function LeadForm({ initial, onSave, onCancel, saving }: { initial?: any; onSave: (d: any) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div className="rounded-2xl border p-5 bg-background space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Full Name *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Customer name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mobile</Label>
          <Input value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="+91 9876543210" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Source</Label>
          <select value={form.source} onChange={e => set("source", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_ICONS[s]} {s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {STATUSES.map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Package Interest</Label>
          <Input value={form.packageInterest} onChange={e => set("packageInterest", e.target.value)} placeholder="Hajj 2026, Umrah..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Budget (₹)</Label>
          <Input value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. 250000" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned To</Label>
          <Input value={form.assignedName} onChange={e => set("assignedName", e.target.value)} placeholder="Staff name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Follow-Up Date</Label>
          <Input type="date" value={form.followUpDate} onChange={e => set("followUpDate", e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Message / Enquiry</Label>
          <textarea value={form.message} onChange={e => set("message", e.target.value)} placeholder="What did the customer enquire about?"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Internal Notes</Label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Internal notes (not visible to customer)"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.name.trim()} className="gap-1.5">
          {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
          {initial ? "Update Lead" : "Add Lead"}
        </Button>
      </div>
    </div>
  );
}

export default function LeadManager() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/leads`, { credentials: "include" });
      if (r.ok) setLeads(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    setSaving(true);
    try {
      const url = editLead ? `${BASE_API}/api/enterprise/leads/${editLead.id}` : `${BASE_API}/api/enterprise/leads`;
      const method = editLead ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { toast({ title: editLead ? "Lead updated" : "Lead added" }); setShowForm(false); setEditLead(null); load(); }
      else toast({ title: "Failed", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const quickStatus = async (id: string, status: string) => {
    await fetch(`${BASE_API}/api/enterprise/leads/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l));
  };

  const deleteLead = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await fetch(`${BASE_API}/api/enterprise/leads/${id}`, { method: "DELETE", credentials: "include" });
    setLeads(ls => ls.filter(l => l.id !== id));
  };

  const filtered = leads.filter(l =>
    (filterStatus === "all" || l.status === filterStatus) &&
    (filterSource === "all" || l.source === filterSource) &&
    (!search || (l.name || "").toLowerCase().includes(search.toLowerCase()) || (l.mobile || "").includes(search))
  );

  const today = new Date().toISOString().slice(0, 10);
  const totalConverted = leads.filter(l => l.status === "converted").length;
  const convRate = leads.length > 0 ? Math.round((totalConverted / leads.length) * 100) : 0;
  const followUpToday = leads.filter(l => l.follow_up_date?.slice(0, 10) === today && l.status !== "converted" && l.status !== "lost").length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lead Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track enquiries, follow-ups & conversions</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditLead(null); }} className="gap-1.5">
            <Plus size={15} /> Add Lead
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Leads", value: leads.length, color: "text-foreground" },
            { label: "Follow-Up Today", value: followUpToday, color: followUpToday > 0 ? "text-amber-700" : "text-foreground" },
            { label: "Converted", value: totalConverted, color: "text-emerald-700" },
            { label: "Conv. Rate", value: `${convRate}%`, color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border p-3 text-center bg-background">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {showForm && <LeadForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}
        {editLead && <LeadForm initial={{ name: editLead.name, mobile: editLead.mobile || "", email: editLead.email || "", source: editLead.source, message: editLead.message || "", packageInterest: editLead.package_interest || "", assignedName: editLead.assigned_name || "", followUpDate: editLead.follow_up_date?.slice(0,10) || "", notes: editLead.notes || "", budget: editLead.budget || "", status: editLead.status }} onSave={handleSave} onCancel={() => setEditLead(null)} saving={saving} />}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or mobile…" className="pl-9 h-9 text-sm" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="all">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <UserPlus size={36} className="mx-auto mb-2 opacity-30" />
            <p>No leads found.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{filtered.length} Leads</p>
            </div>
            <div className="divide-y">
              {filtered.map(l => {
                const isFollowUpToday = l.follow_up_date?.slice(0, 10) === today && l.status !== "converted" && l.status !== "lost";
                const isFollowUpOverdue = l.follow_up_date?.slice(0, 10) < today && l.status !== "converted" && l.status !== "lost";
                return (
                  <div key={l.id} className={`px-4 py-3 hover:bg-muted/20 transition-colors ${isFollowUpOverdue ? "bg-red-50/30" : isFollowUpToday ? "bg-amber-50/20" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                        {SOURCE_ICONS[l.source] || "📋"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{l.name}</p>
                          <Badge variant="outline" className={`text-[10px] py-0 h-4 ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                            {l.status?.replace("_"," ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </Badge>
                          {isFollowUpToday && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">Follow-up Today</Badge>}
                          {isFollowUpOverdue && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-red-100 text-red-700 border-red-200">Overdue</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {l.mobile && <span className="flex items-center gap-1"><Phone size={11} /> {l.mobile}</span>}
                          {l.email && <span className="flex items-center gap-1"><Mail size={11} /> {l.email}</span>}
                          {l.package_interest && <span>📦 {l.package_interest}</span>}
                          {l.budget && <span>💰 ₹{Number(l.budget).toLocaleString("en-IN")}</span>}
                          {l.assigned_name && <span>👤 {l.assigned_name}</span>}
                          {l.follow_up_date && <span>📅 {new Date(l.follow_up_date).toLocaleDateString("en-IN")}</span>}
                        </div>
                        {l.notes && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">{l.notes}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {l.status !== "converted" && l.status !== "lost" && (
                          <button onClick={() => quickStatus(l.id, "converted")} className="w-7 h-7 rounded-lg border border-emerald-200 hover:bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs" title="Mark Converted">✓</button>
                        )}
                        <button onClick={() => { setEditLead(l); setShowForm(false); }} className="w-7 h-7 rounded-lg border hover:bg-muted flex items-center justify-center" title="Edit"><Edit2 size={12} /></button>
                        <button onClick={() => deleteLead(l.id)} className="w-7 h-7 rounded-lg border hover:bg-red-50 text-red-500 flex items-center justify-center" title="Delete"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
