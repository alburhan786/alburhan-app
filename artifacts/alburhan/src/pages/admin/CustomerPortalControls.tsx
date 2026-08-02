/**
 * Admin → Customer Portal Controls
 * View a customer's portal health, activity log, send targeted notifications,
 * manage orientation resources.
 */
import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  Search, Bell, User, Activity, BookOpen, Edit3,
  Plus, Trash2, Save, CheckCircle, XCircle, Clock, Eye, ToggleLeft, ToggleRight
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// ─── Customer Search ──────────────────────────────────────────────────────────

function CustomerSearch({ onSelect }: { onSelect: (c: any) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`${API}/api/admin/customers?q=${encodeURIComponent(q)}&limit=10`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setResults(Array.isArray(d) ? d : d.customers || d.rows || []); }
    } finally { setSearching(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Search size={15} className="text-slate-400" />Find Customer
      </h3>
      <div className="flex gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Name, email, or mobile…" className="h-9 text-sm" />
        <Button onClick={search} disabled={searching}
          className="h-9 bg-emerald-600 hover:bg-emerald-700 text-sm">
          {searching ? "…" : "Search"}
        </Button>
      </div>
      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map(c => (
            <button key={c.id} onClick={() => { onSelect(c); setResults([]); }}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-slate-50 border border-slate-100">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-sm shrink-0">
                {(c.full_name || c.name || "?")[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{c.full_name || c.name}</p>
                <p className="text-xs text-slate-400">{c.email} · {c.mobile}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Portal Health Panel ──────────────────────────────────────────────────────

function PortalHealth({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifForm, setNotifForm] = useState({
    title: "", message: "", type: "info", category: "admin", priority: "normal", action_url: ""
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/customer/admin/portal/${customerId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  async function sendNotif() {
    if (!notifForm.title || !notifForm.message) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/customer/admin/portal/${customerId}/notify`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifForm),
      });
      if (r.ok) {
        toast({ title: "Notification sent" });
        setNotifOpen(false);
        setNotifForm({ title: "", message: "", type: "info", category: "admin", priority: "normal", action_url: "" });
      }
    } finally { setSending(false); }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!data) return <Card className="p-6 text-center text-slate-400">Customer data unavailable</Card>;

  return (
    <div className="space-y-5">
      {/* Profile + stats */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">{data.profile?.full_name}</h3>
            <p className="text-sm text-slate-400">{data.profile?.email} · {data.profile?.mobile}</p>
          </div>
          <Button size="sm" onClick={() => setNotifOpen(true)}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
            <Bell size={13} className="mr-1" />Send Notification
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-slate-50 text-center">
            <p className="text-lg font-bold text-slate-800">{data.bookings?.length || 0}</p>
            <p className="text-xs text-slate-400">Bookings</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 text-center">
            <p className="text-lg font-bold text-slate-800">{data.notificationStats?.unread || 0}</p>
            <p className="text-xs text-slate-400">Unread Notifs</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 text-center">
            <p className="text-lg font-bold text-slate-800">{data.notificationStats?.total || 0}</p>
            <p className="text-xs text-slate-400">Total Notifs</p>
          </div>
        </div>
      </Card>

      {/* Bookings */}
      {data.bookings?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Bookings</h3>
          <div className="space-y-2">
            {data.bookings.map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">#{b.booking_number}</p>
                  <p className="text-xs text-slate-400">
                    {b.status} · {b.invoice_status || "no invoice"}
                    {b.paid_amount != null && b.total_amount != null
                      ? ` · ₹${b.paid_amount?.toLocaleString()} / ₹${b.total_amount?.toLocaleString()}` : ""}
                  </p>
                </div>
                <Badge className="text-[10px] capitalize bg-slate-100 text-slate-600">{b.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Activity log */}
      {data.recentActivity?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Activity size={15} />Recent Activity
          </h3>
          <div className="space-y-1.5">
            {data.recentActivity.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-400 w-24 shrink-0 text-xs">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
                <span className="text-slate-600 capitalize flex-1">
                  {a.action?.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Profile edits */}
      {data.profileEdits?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Profile Edit Requests</h3>
          <div className="space-y-2">
            {data.profileEdits.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                {e.status === "approved" ? <CheckCircle size={14} className="text-green-500" />
                  : e.status === "rejected" ? <XCircle size={14} className="text-red-500" />
                  : <Clock size={14} className="text-amber-500" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 capitalize">
                    {e.field_name?.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-slate-400">
                    <span className="line-through">{e.old_value}</span> → <span>{e.new_value}</span>
                  </p>
                </div>
                <Badge className={`text-[10px] ${
                  e.status === "approved" ? "bg-green-100 text-green-700" :
                  e.status === "rejected" ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-amber-700"
                }`}>{e.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Send notification dialog */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Notification</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Title</Label>
              <Input value={notifForm.title} onChange={e => setNotifForm(f => ({ ...f, title: e.target.value }))}
                className="h-9 text-sm" placeholder="Notification title" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Message</Label>
              <Textarea value={notifForm.message} onChange={e => setNotifForm(f => ({ ...f, message: e.target.value }))}
                rows={3} className="text-sm" placeholder="Message body" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Type</Label>
                <Select value={notifForm.type} onValueChange={v => setNotifForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["info", "success", "warning", "error"].map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Priority</Label>
                <Select value={notifForm.priority} onValueChange={v => setNotifForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["normal", "high"].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Action URL (optional)</Label>
              <Input value={notifForm.action_url} onChange={e => setNotifForm(f => ({ ...f, action_url: e.target.value }))}
                className="h-9 text-sm" placeholder="https://…" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={sendNotif} disabled={sending}
                className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-sm">
                <Bell size={13} className="mr-1" />{sending ? "Sending…" : "Send"}
              </Button>
              <Button variant="outline" onClick={() => setNotifOpen(false)} className="h-9 text-sm">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Resources Manager ────────────────────────────────────────────────────────

function ResourcesManager() {
  const { toast } = useToast();
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    title: "", description: "", category: "general", resource_type: "article",
    content: "", external_url: "", file_url: "", language: "en",
    is_published: true, sort_order: 0
  };
  const [form, setForm] = useState<any>(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/customer/admin/resources`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setResources(d.resources || []); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(emptyForm); setEditOpen(true); }
  function openEdit(r: any) {
    setEditing(r);
    setForm({ title: r.title, description: r.description || "", category: r.category,
      resource_type: r.resource_type, content: r.content || "", external_url: r.external_url || "",
      file_url: r.file_url || "", language: r.language, is_published: r.is_published, sort_order: r.sort_order });
    setEditOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const url = editing
        ? `${API}/api/customer/admin/resources/${editing.id}`
        : `${API}/api/customer/admin/resources`;
      const r = await fetch(url, {
        method: editing ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (r.ok) {
        toast({ title: editing ? "Updated" : "Created" });
        setEditOpen(false); load();
      }
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this resource?")) return;
    await fetch(`${API}/api/customer/admin/resources/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  async function togglePublish(r: any) {
    await fetch(`${API}/api/customer/admin/resources/${r.id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, is_published: !r.is_published }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{resources.length} resource{resources.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openNew} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
          <Plus size={13} className="mr-1" />Add Resource
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">{r.title}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{r.category}</Badge>
                  {!r.is_published && <Badge className="bg-slate-100 text-slate-500 text-[10px]">Draft</Badge>}
                </div>
                <p className="text-xs text-slate-400">{r.resource_type} · {r.view_count} views</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => togglePublish(r)}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 rounded">
                  {r.is_published ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} />}
                </button>
                <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => del(r.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Resource" : "New Resource"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs mb-1 block">Title *</Label>
              <Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))}
                className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
                className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Category</Label>
                <Select value={form.category} onValueChange={v => setForm((f: any) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["hajj_guide","umrah_guide","visa_info","packing","health","emergency","general"].map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Type</Label>
                <Select value={form.resource_type} onValueChange={v => setForm((f: any) => ({ ...f, resource_type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["article","video","pdf","link","faq"].map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Content / Body</Label>
              <Textarea value={form.content} onChange={e => setForm((f: any) => ({ ...f, content: e.target.value }))}
                rows={4} className="text-sm" placeholder="Article text or FAQ content…" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">External URL</Label>
              <Input value={form.external_url} onChange={e => setForm((f: any) => ({ ...f, external_url: e.target.value }))}
                className="h-9 text-sm" placeholder="https://…" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">File URL (PDF/video)</Label>
              <Input value={form.file_url} onChange={e => setForm((f: any) => ({ ...f, file_url: e.target.value }))}
                className="h-9 text-sm" placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Sort Order</Label>
                <Input type="number" value={form.sort_order}
                  onChange={e => setForm((f: any) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="h-9 text-sm" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.is_published}
                    onChange={e => setForm((f: any) => ({ ...f, is_published: e.target.checked }))} />
                  Published
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={save} disabled={saving || !form.title}
                className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-sm">
                <Save size={13} className="mr-1" />{saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)} className="h-9 text-sm">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Profile Edit Approvals ───────────────────────────────────────────────────

function ProfileEditApprovals() {
  const { toast } = useToast();
  const [edits, setEdits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/customer/admin/profile-edits?status=pending`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setEdits(d.edits || []); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, action: "approve" | "reject", notes?: string) {
    setActing(id);
    try {
      const r = await fetch(`${API}/api/customer/admin/profile-edits/${id}/${action}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (r.ok) {
        toast({ title: action === "approve" ? "Change approved" : "Change rejected" });
        load();
      }
    } finally { setActing(null); }
  }

  return (
    <div className="space-y-3">
      {loading ? <Skeleton className="h-32 rounded-xl" />
      : edits.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle size={32} className="mx-auto text-slate-200 mb-2" />
          <p className="text-slate-400">No pending profile edit requests.</p>
        </Card>
      ) : edits.map(e => (
        <Card key={e.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {e.customer_name} — {e.field_name?.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-slate-400">{e.customer_email} · {formatDate(e.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 mb-3">
            <span className="text-sm text-slate-400 line-through">{e.old_value || "—"}</span>
            <span className="text-slate-400">→</span>
            <span className="text-sm font-medium text-slate-800">{e.new_value}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act(e.id, "approve")}
              disabled={acting === e.id}
              className="h-7 text-xs bg-green-600 hover:bg-green-700">
              <CheckCircle size={12} className="mr-1" />Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(e.id, "reject")}
              disabled={acting === e.id}
              className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50">
              <XCircle size={12} className="mr-1" />Reject
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerPortalControls() {
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Customer Portal Controls</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage portal content, view customer activity, and send targeted notifications.
          </p>
        </div>

        <Tabs defaultValue="lookup">
          <TabsList className="mb-5">
            <TabsTrigger value="lookup">Customer Lookup</TabsTrigger>
            <TabsTrigger value="resources">Orientation Resources</TabsTrigger>
            <TabsTrigger value="profile-edits">Profile Edit Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="lookup" className="space-y-5">
            <CustomerSearch onSelect={setSelectedCustomer} />
            {selectedCustomer && (
              <PortalHealth customerId={selectedCustomer.id} />
            )}
          </TabsContent>

          <TabsContent value="resources">
            <ResourcesManager />
          </TabsContent>

          <TabsContent value="profile-edits">
            <ProfileEditApprovals />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
