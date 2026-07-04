import { useState, useEffect, useMemo, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Download, TrendingDown, Check, X, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

const CATEGORIES = [
  { value: "flights",   label: "Flights",         color: "bg-blue-100 text-blue-800",    icon: "✈️" },
  { value: "hotels",    label: "Hotels",           color: "bg-purple-100 text-purple-800", icon: "🏨" },
  { value: "visa",      label: "Visa",             color: "bg-yellow-100 text-yellow-800", icon: "📋" },
  { value: "transport", label: "Saudi Transport",  color: "bg-orange-100 text-orange-800", icon: "🚌" },
  { value: "food",      label: "Food",             color: "bg-green-100 text-green-800",   icon: "🍽️" },
  { value: "laundry",   label: "Laundry",          color: "bg-sky-100 text-sky-800",       icon: "👕" },
  { value: "zamzam",    label: "Zam Zam",          color: "bg-teal-100 text-teal-800",     icon: "💧" },
  { value: "salary",    label: "Staff Salary",     color: "bg-indigo-100 text-indigo-800", icon: "💼" },
  { value: "marketing", label: "Marketing",        color: "bg-pink-100 text-pink-800",     icon: "📢" },
  { value: "office",    label: "Office",           color: "bg-gray-100 text-gray-800",     icon: "🏢" },
  { value: "misc",      label: "Miscellaneous",    color: "bg-red-100 text-red-800",       icon: "📦" },
];

const PAYMENT_METHODS = ["cash", "upi", "bank", "cheque", "card", "neft"];

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

interface Expense {
  id: string;
  groupId?: string | null;
  packageId?: string | null;
  category: string;
  vendor?: string | null;
  description: string;
  amount: string;
  date: string;
  paidBy?: string | null;
  paymentMethod?: string | null;
  invoiceNumber?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
  status?: string;
  approvedBy?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
}

interface Group { id: string; name: string; }

const EMPTY_FORM = {
  groupId: "", packageId: "", category: "misc", vendor: "", description: "",
  amount: "", date: new Date().toISOString().slice(0, 10),
  paidBy: "", paymentMethod: "cash", invoiceNumber: "", notes: "", status: "approved",
};

function fmt(n: number) { return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

function StatusBadge({ status }: { status?: string }) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 text-[10px] border-0">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 text-[10px] border-0">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 text-[10px] border-0">Pending</Badge>;
}

export default function ExpenseManager() {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [expR, grpR] = await Promise.all([
        fetch(`${API}/api/expenses`, { credentials: "include" }),
        fetch(`${API}/api/groups`, { credentials: "include" }),
      ]);
      if (expR.ok) setExpenses(await expR.json());
      else setError(`API error ${expR.status}: ${await expR.text().catch(() => "")}`);
      if (grpR.ok) {
        const grps = await grpR.json();
        setGroups(Array.isArray(grps) ? grps : grps.groups || []);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = expenses;
    if (catFilter !== "all") rows = rows.filter(e => e.category === catFilter);
    if (groupFilter !== "all") rows = rows.filter(e => e.groupId === groupFilter);
    if (statusFilter !== "all") rows = rows.filter(e => (e.status || "approved") === statusFilter);
    if (fromDate) rows = rows.filter(e => e.date >= fromDate);
    if (toDate) rows = rows.filter(e => e.date <= toDate);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.vendor || "").toLowerCase().includes(q) ||
        (e.paidBy || "").toLowerCase().includes(q) ||
        (e.invoiceNumber || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [expenses, catFilter, groupFilter, statusFilter, fromDate, toDate, search]);

  const totalFiltered = filtered.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.category] = (map[e.category] || 0) + parseFloat(e.amount || "0"); });
    return map;
  }, [expenses]);
  const grandTotal = expenses.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);

  function openAdd() { setEditId(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(e: Expense) {
    setEditId(e.id);
    setForm({
      groupId: e.groupId || "", packageId: e.packageId || "", category: e.category,
      vendor: e.vendor || "", description: e.description, amount: e.amount, date: e.date,
      paidBy: e.paidBy || "", paymentMethod: e.paymentMethod || "cash",
      invoiceNumber: e.invoiceNumber || "", notes: e.notes || "", status: e.status || "approved",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.description || !form.amount || !form.date) {
      toast({ title: "Description, amount and date are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const url = editId ? `${API}/api/expenses/${editId}` : `${API}/api/expenses`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editId ? "Expense updated" : "Expense added" });
      setShowModal(false);
      await load();
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function remove(id: string, desc: string) {
    if (!confirm(`Delete "${desc}"?`)) return;
    const r = await fetch(`${API}/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Deleted" }); await load(); }
    else toast({ title: "Delete failed", variant: "destructive" });
  }

  async function updateStatus(id: string, status: "approved" | "rejected", reason?: string) {
    const r = await fetch(`${API}/api/expenses/${id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectedReason: reason || null }),
    });
    if (r.ok) { toast({ title: `Expense ${status}` }); await load(); }
    else toast({ title: "Update failed", variant: "destructive" });
  }

  function exportExcel() {
    const rows = filtered.map(e => ({
      Date: e.date,
      Category: catMap[e.category]?.label || e.category,
      Vendor: e.vendor || "",
      Description: e.description,
      "Amount (₹)": parseFloat(e.amount),
      "Paid By": e.paidBy || "",
      "Payment Method": e.paymentMethod || "",
      "Invoice #": e.invoiceNumber || "",
      Status: e.status || "approved",
      Group: e.groupId ? (groups.find(g => g.id === e.groupId)?.name || e.groupId) : "",
      Notes: e.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    // Category summary sheet
    const catRows = CATEGORIES.filter(c => catTotals[c.value]).map(c => ({
      Category: c.label, "Total (₹)": catTotals[c.value] || 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), "By Category");
    XLSX.writeFile(wb, `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const pendingCount = expenses.filter(e => (e.status || "approved") === "pending").length;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Expense Manager</h1>
            <p className="text-sm text-muted-foreground">Track and approve company expenses</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}><Download size={14} className="mr-1.5" />Export Excel</Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}><Plus size={14} className="mr-1.5" />Add Expense</Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Pending approval alert */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>⏳ {pendingCount} expense{pendingCount > 1 ? "s" : ""} pending approval</span>
            <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 h-7" onClick={() => setStatusFilter("pending")}>View Pending</Button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(grandTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{expenses.length} entries</p>
          </div>
          {CATEGORIES.slice(0, 3).map(c => (
            <div key={c.value} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{c.icon} {c.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{fmt(catTotals[c.value] || 0)}</p>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">By Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter(c => catTotals[c.value]).sort((a, b) => (catTotals[b.value] || 0) - (catTotals[a.value] || 0)).map(c => (
              <button key={c.value} onClick={() => setCatFilter(catFilter === c.value ? "all" : c.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${catFilter === c.value ? "ring-2 ring-[#0d5040] ring-offset-1" : ""} ${c.color}`}>
                {c.icon} {c.label}
                <span className="font-bold">{fmt(catTotals[c.value] || 0)}</span>
              </button>
            ))}
            {catFilter !== "all" && (
              <button onClick={() => setCatFilter("all")} className="text-xs text-muted-foreground underline px-2">Clear</button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-sm" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </select>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
            <option value="all">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm w-32" />
          <span className="text-muted-foreground text-xs">to</span>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm w-32" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <TrendingDown size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No expenses found</p>
              <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}><Plus size={13} className="mr-1" />Add First Expense</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Category</th>
                    <th className="px-4 py-2.5 text-left">Vendor</th>
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-left">Group</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-left">Paid By</th>
                    <th className="px-4 py-2.5 text-left">Method</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(e => {
                    const cat = catMap[e.category];
                    const grpName = groups.find(g => g.id === e.groupId)?.name;
                    const isPending = (e.status || "approved") === "pending";
                    return (
                      <tr key={e.id} className={`hover:bg-muted/20 ${isPending ? "bg-amber-50/40" : ""}`}>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{e.date}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cat?.color || "bg-gray-100 text-gray-800"}`}>
                            {cat?.icon} {cat?.label || e.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{e.vendor || "—"}</td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate text-xs">
                          {e.description}
                          {e.attachmentUrl && <a href={e.attachmentUrl} target="_blank" rel="noreferrer" className="ml-1 text-blue-500 hover:underline">📎</a>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{grpName || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(parseFloat(e.amount))}</td>
                        <td className="px-4 py-2.5 text-xs">{e.paidBy || "—"}</td>
                        <td className="px-4 py-2.5 text-xs uppercase">{e.paymentMethod || "—"}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            {isPending && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-800" title="Approve" onClick={() => updateStatus(e.id, "approved")}><Check size={13} /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" title="Reject" onClick={() => { const r = prompt("Reason for rejection?"); if (r !== null) updateStatus(e.id, "rejected", r); }}><X size={13} /></Button>
                              </>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil size={12} /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => remove(e.id, e.description)}><Trash2 size={12} /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 border-t">
                  <tr>
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">TOTAL ({filtered.length} entries)</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmt(totalFiltered)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Date *</label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Category *</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Description *</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Makkah hotel booking" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Amount (₹) *</label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Payment Method</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Vendor</label>
                <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Paid By</label>
                <Input value={form.paidBy} onChange={e => setForm(f => ({ ...f, paidBy: e.target.value }))} placeholder="Staff name" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Group</label>
                <select value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="">No Group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Approval Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Invoice Number</label>
              <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-001" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" rows={2} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]" onClick={save} disabled={saving}>
                {saving ? "Saving…" : editId ? "Update" : "Add Expense"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
