import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, RefreshCw, Search, Package, Printer } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY = "Al Burhan Tours & Travels";
const COMPANY_ADDRESS = "Contact: +91 98939 89786 | alburhantravels.com";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtFull(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const CATEGORIES = [
  { value: "laptop", label: "Laptop", icon: "💻", rate: 0.40 },
  { value: "printer", label: "Printer", icon: "🖨️", rate: 0.30 },
  { value: "scanner", label: "Scanner", icon: "🔍", rate: 0.30 },
  { value: "furniture", label: "Furniture", icon: "🪑", rate: 0.10 },
  { value: "vehicle", label: "Vehicle", icon: "🚗", rate: 0.25 },
  { value: "mobile", label: "Mobile/Phone", icon: "📱", rate: 0.50 },
  { value: "ac", label: "AC/Appliance", icon: "❄️", rate: 0.15 },
  { value: "generator", label: "Generator/UPS", icon: "⚡", rate: 0.15 },
  { value: "camera", label: "Camera", icon: "📷", rate: 0.25 },
  { value: "other", label: "Other", icon: "📦", rate: 0.15 },
];

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const EMPTY_FORM = {
  name: "", category: "other", purchase_date: new Date().toISOString().slice(0, 10),
  purchase_price: "", vendor: "", serial_number: "", warranty_date: "",
  depreciation_rate: "", location: "", notes: "",
};

type SortField = "name" | "purchase_date" | "purchase_price" | "book_value" | "age_years";

export default function AssetManager() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("purchase_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/assets`, { credentials: "include" });
      if (r.ok) setAssets(await r.json());
      else toast({ title: "Failed to load assets", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }
  function openEdit(a: any) {
    setEditId(a.id);
    setForm({
      name: a.name, category: a.category,
      purchase_date: a.purchase_date, purchase_price: String(a.purchase_price),
      vendor: a.vendor || "", serial_number: a.serial_number || "",
      warranty_date: a.warranty_date || "", depreciation_rate: String((a.depreciation_rate * 100).toFixed(0)),
      location: a.location || "", notes: a.notes || "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.name || !form.purchase_date || !form.purchase_price) {
      toast({ title: "Name, date and price are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        purchase_price: parseFloat(form.purchase_price),
        depreciation_rate: form.depreciation_rate ? parseFloat(form.depreciation_rate) / 100 : undefined,
      };
      const url = editId ? `${API}/api/assets/${editId}` : `${API}/api/assets`;
      const r = await fetch(url, {
        method: editId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editId ? "Asset updated" : "Asset added" });
      setShowModal(false);
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  function printAssetRegister() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 12;
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(COMPANY, W / 2, y, { align: "center" }); y += 6;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(COMPANY_ADDRESS, W / 2, y, { align: "center" }); y += 5;
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("ASSET REGISTER", W / 2, y, { align: "center" }); y += 4;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")} | Total Assets: ${filtered.length}`, W / 2, y, { align: "center" });
    y += 4;

    (autoTable as any)(doc, {
      startY: y,
      head: [[
        "Asset Name", "Category", "Purchased", "Vendor", "Location",
        "Age (yrs)", "Cost (₹)", "Depr. Rate", "Book Value (₹)", "Warranty"
      ]],
      body: filtered.map(a => {
        const cat = catMap[a.category];
        return [
          a.name + (a.serial_number ? `\n${a.serial_number}` : ""),
          (cat?.icon || "") + " " + (cat?.label || a.category),
          a.purchase_date,
          a.vendor || "—",
          a.location || "—",
          String(a.age_years) + "y",
          "₹" + a.purchase_price.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
          Math.round(a.depreciation_rate * 100) + "%",
          "₹" + a.book_value.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
          a.warranty_date ? (a.warranty_expired ? "Expired" : "Valid till " + a.warranty_date) : "—",
        ];
      }),
      foot: [[
        `TOTAL (${filtered.length})`, "", "", "", "", "",
        "₹" + totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
        "",
        "₹" + totalBook.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
        "",
      ]],
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [13, 80, 64] },
      footStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
      columnStyles: {
        6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
      },
      margin: { left: 8, right: 8 },
    });

    // Summary by category at the end
    const finalY = (doc as any).lastAutoTable.finalY + 6;
    if (finalY < doc.internal.pageSize.getHeight() - 30) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text("Summary by Category", 8, finalY);
      (autoTable as any)(doc, {
        startY: finalY + 3,
        head: [["Category", "Count", "Total Cost (₹)", "Total Book Value (₹)", "Depreciation (₹)"]],
        body: CATEGORIES.filter(c => catTotals[c.value]).map(c => [
          (c.icon || "") + " " + c.label,
          String(catTotals[c.value].count),
          "₹" + catTotals[c.value].cost.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
          "₹" + catTotals[c.value].book.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
          "₹" + (catTotals[c.value].cost - catTotals[c.value].book).toLocaleString("en-IN", { maximumFractionDigits: 0 }),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [13, 80, 64] },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        margin: { left: 8, right: 8 },
        tableWidth: 120,
      });
    }

    doc.save(`asset-register-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete asset "${name}"?`)) return;
    const r = await fetch(`${API}/api/assets/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Asset deleted" }); await load(); }
    else toast({ title: "Delete failed", variant: "destructive" });
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  const filtered = assets
    .filter(a => {
      if (catFilter !== "all" && a.category !== catFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.vendor || "").toLowerCase().includes(q) ||
          (a.serial_number || "").toLowerCase().includes(q) || (a.location || "").toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });

  const totalCost = filtered.reduce((s, a) => s + a.purchase_price, 0);
  const totalBook = filtered.reduce((s, a) => s + a.book_value, 0);
  const totalDeprec = filtered.reduce((s, a) => s + a.depreciation_total, 0);

  // Category totals
  const catTotals = assets.reduce((map: Record<string, { count: number; cost: number; book: number }>, a) => {
    if (!map[a.category]) map[a.category] = { count: 0, cost: 0, book: 0 };
    map[a.category].count++;
    map[a.category].cost += a.purchase_price;
    map[a.category].book += a.book_value;
    return map;
  }, {});

  const SortTh = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th className="px-3 py-2.5 text-right cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}>
      {children} {sortBy === field ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  // Auto-fill depreciation rate when category changes
  function handleCategoryChange(cat: string) {
    const defaultRate = catMap[cat]?.rate || 0.15;
    setForm(f => ({
      ...f, category: cat,
      depreciation_rate: f.depreciation_rate || String(Math.round(defaultRate * 100)),
    }));
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Asset Management</h1>
            <p className="text-sm text-muted-foreground">Track assets with depreciation & book value</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={printAssetRegister} disabled={!filtered.length}>
              <Printer size={14} className="mr-1.5" />Print Register
            </Button>
            <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}>
              <Plus size={14} className="mr-1.5" />Add Asset
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-2xl font-bold text-[#0d5040] mt-1">{assets.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{new Set(assets.map(a => a.category)).size} categories</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Total Cost (OV)</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{fmt(totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Current Book Value (WDV)</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{fmt(totalBook)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Accumulated Depreciation</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalDeprec)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{totalCost > 0 ? ((totalDeprec / totalCost) * 100).toFixed(1) : 0}% written off</p>
          </div>
        </div>

        {/* Category Breakdown */}
        {Object.keys(catTotals).length > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">By Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter(c => catTotals[c.value]).map(c => (
                <button key={c.value} onClick={() => setCatFilter(catFilter === c.value ? "all" : c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all bg-gray-100 text-gray-800 ${catFilter === c.value ? "ring-2 ring-[#0d5040] ring-offset-1" : ""}`}>
                  {c.icon} {c.label}
                  <span className="text-muted-foreground">({catTotals[c.value].count})</span>
                  <span className="font-bold">{fmt(catTotals[c.value].book)}</span>
                </button>
              ))}
              {catFilter !== "all" && (
                <button onClick={() => setCatFilter("all")} className="text-xs text-muted-foreground underline px-2">Clear</button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…" className="pl-8 h-8 text-sm" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Package size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-muted-foreground text-sm">No assets found</p>
              <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}><Plus size={13} className="mr-1" />Add First Asset</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
                      Asset {sortBy === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-2.5 text-left">Category</th>
                    <th className="px-3 py-2.5 text-left cursor-pointer hover:text-foreground" onClick={() => toggleSort("purchase_date")}>
                      Purchased {sortBy === "purchase_date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th className="px-3 py-2.5 text-left">Vendor</th>
                    <th className="px-3 py-2.5 text-left">Location</th>
                    <th className="px-3 py-2.5 text-right">Age (yrs)</th>
                    <SortTh field="purchase_price">Cost</SortTh>
                    <th className="px-3 py-2.5 text-right">Depr. Rate</th>
                    <SortTh field="book_value">Book Value</SortTh>
                    <th className="px-3 py-2.5 text-left">Warranty</th>
                    <th className="px-3 py-2.5 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(a => {
                    const cat = catMap[a.category];
                    const deprPct = ((a.depreciation_total / a.purchase_price) * 100).toFixed(0);
                    return (
                      <tr key={a.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-sm">{a.name}</div>
                          {a.serial_number && <div className="text-[10px] text-muted-foreground font-mono">{a.serial_number}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs">{cat?.icon} {cat?.label || a.category}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{a.purchase_date}</td>
                        <td className="px-3 py-2.5 text-xs">{a.vendor || "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{a.location || "—"}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{a.age_years}y</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(a.purchase_price)}</td>
                        <td className="px-3 py-2.5 text-right text-xs">
                          {Math.round(a.depreciation_rate * 100)}%
                          <span className="block text-[10px] text-muted-foreground">{deprPct}% written</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-bold text-blue-700">{fmtFull(a.book_value)}</span>
                          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${Math.min(100, (a.book_value / a.purchase_price) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {a.warranty_date ? (
                            a.warranty_expired
                              ? <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Expired</Badge>
                              : <Badge className="text-[10px] bg-green-100 text-green-700 border-0">Valid till {a.warranty_date}</Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil size={12} /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => remove(a.id, a.name)}><Trash2 size={12} /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 border-t font-semibold text-xs">
                  <tr>
                    <td colSpan={6} className="px-3 py-2.5">TOTAL ({filtered.length})</td>
                    <td className="px-3 py-2.5 text-right">{fmt(totalCost)}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-blue-700">{fmtFull(totalBook)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Asset Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Asset Name *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dell Laptop i7" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Category *</label>
                <select value={form.category} onChange={e => handleCategoryChange(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Purchase Date *</label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Purchase Price (₹) *</label>
                <Input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Depreciation Rate (%/yr)</label>
                <Input type="number" value={form.depreciation_rate} onChange={e => setForm(f => ({ ...f, depreciation_rate: e.target.value }))}
                  placeholder={`Default: ${Math.round((catMap[form.category]?.rate || 0.15) * 100)}%`} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Vendor / Supplier</label>
                <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Who sold this?" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Serial Number</label>
                <Input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Warranty Expiry</label>
                <Input type="date" value={form.warranty_date} onChange={e => setForm(f => ({ ...f, warranty_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Location</label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Office, Warehouse…" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>

            {/* Book value preview */}
            {form.purchase_price && form.purchase_date && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                {(() => {
                  const price = parseFloat(form.purchase_price || "0");
                  const rate = form.depreciation_rate ? parseFloat(form.depreciation_rate) / 100 : (catMap[form.category]?.rate || 0.15);
                  const years = (Date.now() - new Date(form.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                  const bookVal = Math.max(0, price * Math.pow(1 - rate, years));
                  return (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Current Book Value (WDV at {Math.round(rate * 100)}%/yr):</span>
                      <span className="font-bold text-blue-700 text-sm">{fmtFull(bookVal)}</span>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-[#0d5040]" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Asset"}</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
