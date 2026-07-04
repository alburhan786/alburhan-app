import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, BookOpen, Search, Download, X,
  Building2, Phone, Mail, CreditCard, FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

function fmtCurr(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const CATEGORIES = [
  { value: "airline", label: "Airline" },
  { value: "hotel", label: "Hotel" },
  { value: "transport", label: "Transport" },
  { value: "visa", label: "Visa Agent" },
  { value: "catering", label: "Catering" },
  { value: "insurance", label: "Insurance" },
  { value: "telecom", label: "Telecom" },
  { value: "bank", label: "Bank/Finance" },
  { value: "govt", label: "Government" },
  { value: "other", label: "Other" },
];

const BLANK_FORM = {
  name: "", category: "other", gst_number: "", pan: "",
  bank_account: "", ifsc: "", contact: "", email: "", address: "", notes: "",
};

export default function VendorManager() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ledgerVendor, setLedgerVendor] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");

  useEffect(() => { fetchVendors(); }, []);

  async function fetchVendors() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/vendors`, { credentials: "include" });
      setVendors(await r.json());
    } catch {
      toast({ title: "Error", description: "Failed to load vendors", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ ...BLANK_FORM });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(v: any) {
    setForm({
      name: v.name || "", category: v.category || "other", gst_number: v.gst_number || "",
      pan: v.pan || "", bank_account: v.bank_account || "", ifsc: v.ifsc || "",
      contact: v.contact || "", email: v.email || "", address: v.address || "", notes: v.notes || "",
    });
    setEditId(v.id);
    setShowForm(true);
  }

  async function saveVendor() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editId ? `${API}/api/vendors/${editId}` : `${API}/api/vendors`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: editId ? "Vendor updated" : "Vendor created" });
      setShowForm(false);
      fetchVendors();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteVendor(v: any) {
    if (!confirm(`Delete vendor "${v.name}"?`)) return;
    try {
      await fetch(`${API}/api/vendors/${v.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Vendor deleted" });
      fetchVendors();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  async function openLedger(v: any) {
    setLedgerVendor(v);
    setLedger(null);
    setLoadingLedger(true);
    try {
      const params = new URLSearchParams();
      if (ledgerFrom) params.set("from", ledgerFrom);
      if (ledgerTo) params.set("to", ledgerTo);
      const r = await fetch(`${API}/api/vendors/${v.id}/ledger?${params}`, { credentials: "include" });
      setLedger(await r.json());
    } catch {
      toast({ title: "Failed to load ledger", variant: "destructive" });
    } finally {
      setLoadingLedger(false);
    }
  }

  function exportLedgerCSV() {
    if (!ledger) return;
    const rows: string[][] = [
      [`Vendor Ledger — ${ledger.vendor.name}`],
      [],
      ["Date", "Group", "Category", "Description", "Invoice #", "Payment Method", "Amount"],
    ];
    for (const e of ledger.expenses) {
      rows.push([e.date, e.group_name || "", e.category, e.description, e.invoice_number || "", e.payment_method || "", fmtCurr(e.amount)]);
    }
    rows.push([]);
    rows.push(["", "", "", "", "", "TOTAL", fmtCurr(ledger.totalAmount)]);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `vendor-ledger-${ledger.vendor.name}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.contact || "").includes(search) ||
    (v.category || "").includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">Vendor Management</h1>
            <p className="text-muted-foreground text-sm">Manage suppliers, service providers and view expense ledgers</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Add Vendor</Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Vendors grid */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>{search ? "No vendors match your search." : "No vendors yet. Add your first vendor."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => (
              <Card key={v.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-base">{v.name}</div>
                      <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium capitalize">
                        {CATEGORIES.find(c => c.value === v.category)?.label || v.category}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}>
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteVendor(v)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {v.contact && <div className="flex items-center gap-1.5"><Phone size={12} />{v.contact}</div>}
                    {v.email && <div className="flex items-center gap-1.5"><Mail size={12} />{v.email}</div>}
                    {v.gst_number && <div className="flex items-center gap-1.5"><FileText size={12} />GST: {v.gst_number}</div>}
                    {v.bank_account && <div className="flex items-center gap-1.5"><CreditCard size={12} />{v.bank_account} {v.ifsc ? `(${v.ifsc})` : ""}</div>}
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" onClick={() => openLedger(v)}>
                    <BookOpen size={13} /> View Ledger
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Vendor Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Al Rawda Airlines" />
              </div>
              <div className="col-span-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>GST Number</Label>
                <Input value={form.gst_number} onChange={e => setForm(f => ({ ...f, gst_number: e.target.value }))} placeholder="GSTIN" />
              </div>
              <div>
                <Label>PAN</Label>
                <Input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value }))} placeholder="ABCDE1234F" />
              </div>
              <div>
                <Label>Contact / Phone</Label>
                <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="+91 ..." />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@example.com" />
              </div>
              <div>
                <Label>Bank Account</Label>
                <Input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} placeholder="Account number" />
              </div>
              <div>
                <Label>IFSC Code</Label>
                <Input value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))} placeholder="SBIN0001234" />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Vendor address" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={saveVendor} disabled={saving}>{saving ? "Saving…" : editId ? "Update Vendor" : "Create Vendor"}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Ledger dialog */}
      <Dialog open={!!ledgerVendor} onOpenChange={open => { if (!open) { setLedgerVendor(null); setLedger(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Vendor Ledger — {ledgerVendor?.name}</span>
              {ledger && (
                <Button variant="outline" size="sm" onClick={exportLedgerCSV}><Download size={13} className="mr-1" /> CSV</Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)} className="w-36" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={ledgerTo} onChange={e => setLedgerTo(e.target.value)} className="w-36" />
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" onClick={() => ledgerVendor && openLedger(ledgerVendor)}>Apply</Button>
            </div>
          </div>

          {loadingLedger ? (
            <div className="text-center py-10 text-muted-foreground">Loading…</div>
          ) : ledger ? (
            <>
              <div className="flex gap-6 text-center mb-4 p-3 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Total Expenses</div>
                  <div className="text-xl font-bold text-primary">{fmtCurr(ledger.totalAmount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Transactions</div>
                  <div className="text-xl font-bold">{ledger.expenses.length}</div>
                </div>
              </div>

              {ledger.expenses.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No expenses linked to this vendor yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2">Group</th>
                      <th className="text-left px-3 py-2">Method</th>
                      <th className="text-right px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.expenses.map((e: any, i: number) => (
                      <tr key={e.id} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}>
                        <td className="px-3 py-2">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 capitalize">{e.category}</td>
                        <td className="px-3 py-2">{e.description}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{e.group_name || "—"}</td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{e.payment_method || "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtCurr(e.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-muted/30 font-bold">
                      <td colSpan={5} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right text-primary">{fmtCurr(ledger.totalAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
