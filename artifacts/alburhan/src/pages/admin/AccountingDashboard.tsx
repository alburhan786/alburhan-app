import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Download, TrendingUp, TrendingDown, Wallet, AlertCircle,
  RefreshCw, Plus, Pencil, Trash2, CheckCircle2, XCircle, ChevronRight
} from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) { return "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
function fmtDate(s: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

const CAT_LABELS: Record<string, string> = {
  flights: "Flights", hotels: "Hotels", visa: "Visa", transport: "Transport",
  food: "Food", laundry: "Laundry", zamzam: "Zam Zam", salary: "Staff Salary",
  marketing: "Marketing", office: "Office", misc: "Miscellaneous",
};

const ACCT_TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-100 text-blue-800",
  liability: "bg-red-100 text-red-800",
  equity: "bg-purple-100 text-purple-800",
  income: "bg-green-100 text-green-800",
  expense: "bg-orange-100 text-orange-800",
};

const TABS = [
  { id: "overview",    label: "Dashboard" },
  { id: "accounts",   label: "Chart of Accounts" },
  { id: "fy",         label: "FY Manager" },
  { id: "gen-ledger", label: "General Ledger" },
  { id: "ledger",     label: "Customer Ledger" },
  { id: "cashbook",   label: "Cash Book" },
  { id: "bankbook",   label: "Bank Book" },
  { id: "journal",    label: "Journal Entries" },
  { id: "payments",   label: "Payment Entries" },
  { id: "outstanding",label: "Outstanding" },
  { id: "pl",         label: "P&L" },
  { id: "balance",    label: "Balance Sheet" },
  { id: "trial",      label: "Trial Balance" },
  { id: "recon",      label: "Bank Reconciliation" },
  { id: "cashflow",   label: "Cash Flow" },
];

function DR({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <Input type="date" value={from} onChange={e => onFrom(e.target.value)} className="h-8 text-sm w-36" />
      <span className="text-[11px] text-muted-foreground">to</span>
      <Input type="date" value={to} onChange={e => onTo(e.target.value)} className="h-8 text-sm w-36" />
    </div>
  );
}
function Spin() { return <div className="py-16 text-center text-muted-foreground text-sm animate-pulse">Loading…</div>; }
function Err({ msg }: { msg: string }) { return <div className="py-12 text-center text-red-500 text-sm">⚠ {msg}</div>; }

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/expenses/accounting-summary`, { credentials: "include" });
      if (!r.ok) setErr(`API error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const allMonths = data ? [...new Set([...(data.monthly || []).map((m: any) => m.month), ...(data.monthlyExpenses || []).map((m: any) => m.month)])].sort().slice(-12) : [];
  const maxM = data ? Math.max(...(data.monthly || []).map((m: any) => Number(m.collected) || 0), ...(data.monthlyExpenses || []).map((m: any) => Number(m.expenses) || 0), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingUp size={16} className="text-green-600" />} bg="bg-green-100" label="Total Revenue" value={fmt(data.totalCollected)} sub={`This month: ${fmt(data.thisMonthCollected)}`} />
            <KpiCard icon={<TrendingDown size={16} className="text-red-600" />} bg="bg-red-100" label="Total Expenses" value={fmt(data.totalExpenses)} sub={`This month: ${fmt(data.thisMonthExpenses)}`} vc="text-red-600" />
            <KpiCard icon={<Wallet size={16} className={data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"} />} bg={data.netProfit >= 0 ? "bg-emerald-100" : "bg-red-100"} label="Net Profit / Loss" value={(data.netProfit >= 0 ? "" : "-") + fmt(data.netProfit)} vc={data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"} sub={data.netProfit >= 0 ? "Profitable" : "Loss making"} />
            <KpiCard icon={<AlertCircle size={16} className="text-amber-600" />} bg="bg-amber-100" label="Outstanding" value={fmt(data.totalOutstanding)} sub={`${data.totalBookings} bookings`} vc="text-amber-600" />
          </div>
          {allMonths.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm font-semibold mb-4">Monthly Revenue vs Expenses</p>
              <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
                {allMonths.map(m => {
                  const col = Number((data.monthly || []).find((x: any) => x.month === m)?.collected ?? 0);
                  const exp = Number((data.monthlyExpenses || []).find((x: any) => x.month === m)?.expenses ?? 0);
                  return (
                    <div key={m} className="flex flex-col items-center gap-1 min-w-[48px]">
                      <div className="flex items-end gap-0.5 h-28">
                        <div title={`Rev: ${fmt(col)}`} className="w-5 bg-green-400 rounded-t" style={{ height: `${(col / maxM) * 100}%`, minHeight: col > 0 ? "4px" : "0" }} />
                        <div title={`Exp: ${fmt(exp)}`} className="w-5 bg-red-400 rounded-t" style={{ height: `${(exp / maxM) * 100}%`, minHeight: exp > 0 ? "4px" : "0" }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{m.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block" />Revenue</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" />Expenses</span>
              </div>
            </div>
          )}
          {data.byCategory?.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm font-semibold mb-4">Expenses by Category</p>
              <div className="space-y-2.5">
                {data.byCategory.map((c: any) => {
                  const pct = Math.round((Number(c.total) / Math.max(data.totalExpenses, 1)) * 100);
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{CAT_LABELS[c.category] || c.category}</span>
                        <span className="text-muted-foreground">{fmt(Number(c.total))} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-[#0d5040] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, bg, label, value, sub, vc = "text-gray-800" }: any) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>{icon}</div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${vc}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── CHART OF ACCOUNTS ─────────────────────────────────────────────────────
function ChartOfAccounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", type: "expense", sub_type: "", opening_balance: "0", description: "" });
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/accounts`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setAccounts(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditId(null); setForm({ code: "", name: "", type: "expense", sub_type: "", opening_balance: "0", description: "" }); setShowModal(true); }
  function openEdit(a: any) { setEditId(a.id); setForm({ code: a.code, name: a.name, type: a.type, sub_type: a.sub_type || "", opening_balance: a.opening_balance || "0", description: a.description || "" }); setShowModal(true); }

  async function save() {
    if (!form.code || !form.name) { toast({ title: "Code and name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editId ? `${API}/api/accounting/accounts/${editId}` : `${API}/api/accounting/accounts`;
      const r = await fetch(url, { method: editId ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editId ? "Account updated" : "Account created" });
      setShowModal(false); load();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const r = await fetch(`${API}/api/accounting/accounts/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Deleted" }); load(); }
    else { const e = await r.json(); toast({ title: e.error || "Delete failed", variant: "destructive" }); }
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(accounts.map(a => ({ Code: a.code, Name: a.name, Type: a.type, "Sub Type": a.sub_type || "", "Opening Balance": a.opening_balance, System: a.is_system ? "Yes" : "No" })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Chart of Accounts");
    XLSX.writeFile(wb, `chart-of-accounts.xlsx`);
  }

  const grouped = accounts.reduce((acc, a) => { (acc[a.type] = acc[a.type] || []).push(a); return acc; }, {} as Record<string, any[]>);
  const filtered = filterType === "all" ? accounts : accounts.filter(a => a.type === filterType);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
          <option value="all">All Types</option>
          {["asset", "liability", "equity", "income", "expense"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!accounts.length}><Download size={14} className="mr-1" />Excel</Button>
        <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30] ml-auto" onClick={openAdd}><Plus size={14} className="mr-1" />Add Account</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-2">
        {(["asset", "liability", "equity", "income", "expense"] as const).map(t => (
          <button key={t} onClick={() => setFilterType(filterType === t ? "all" : t)}
            className={`rounded-xl border p-3 text-center transition-all ${filterType === t ? "ring-2 ring-[#0d5040]" : ""}`}>
            <p className="text-xs text-muted-foreground capitalize">{t}</p>
            <p className="text-lg font-bold mt-1">{(grouped[t] || []).length}</p>
          </button>
        ))}
      </div>

      {loading ? <Spin /> : err ? <Err msg={err} /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Code</th>
                  <th className="px-4 py-2.5 text-left">Account Name</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Sub Type</th>
                  <th className="px-4 py-2.5 text-right">Opening Balance</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold">{a.code}</td>
                    <td className="px-4 py-2.5 font-medium">{a.name}{a.is_system && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">System</span>}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACCT_TYPE_COLORS[a.type] || ""}`}>{a.type}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.sub_type || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-xs">{fmt(Number(a.opening_balance || 0))}</td>
                    <td className="px-4 py-2.5"><Badge variant={a.is_active ? "default" : "secondary"} className="text-[10px]">{a.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil size={12} /></Button>
                        {!a.is_system && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(a.id, a.name)}><Trash2 size={12} /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Account Code *</label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. 5012" className="mt-1" disabled={!!editId} /></div>
              <div><label className="text-xs font-medium">Type *</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background" disabled={!!editId}>
                  {["asset", "liability", "equity", "income", "expense"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div><label className="text-xs font-medium">Account Name *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Account name" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Sub Type</label><Input value={form.sub_type} onChange={e => setForm(f => ({ ...f, sub_type: e.target.value }))} placeholder="e.g. current_asset" className="mt-1" /></div>
              <div><label className="text-xs font-medium">Opening Balance (₹)</label><Input type="number" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><label className="text-xs font-medium">Description</label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" className="mt-1" /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040]" onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── OPENING BALANCES EDITOR ──────────────────────────────────────────────
function OpeningBalancesEditor({ fyId }: { fyId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!fyId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/accounting/opening-balances?fy_id=${fyId}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setRows(d.rows || []); setEdits({}); }
    } catch { }
    setLoading(false);
  }, [fyId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    const balances = rows.map(r => ({
      account_id: r.account_id,
      opening_balance: Number(edits[r.account_id] ?? r.opening_balance) || 0,
    }));
    try {
      const r = await fetch(`${API}/api/accounting/opening-balances/bulk-save`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy_id: fyId, balances }),
      });
      if (r.ok) { toast({ title: "Opening balances saved" }); load(); }
      else toast({ title: "Save failed", variant: "destructive" });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    setSaving(false);
  }

  if (loading) return <Spin />;
  if (!rows.length) return <div className="py-6 text-center text-muted-foreground text-sm">No accounts found</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Set per-account opening balances for this financial year. Leave at 0 to use the default from Chart of Accounts.</p>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Code</th>
                <th className="px-4 py-2.5 text-left">Account</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-right">Opening Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => (
                <tr key={row.account_id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs font-semibold">{row.code}</td>
                  <td className="px-4 py-2 text-xs">{row.name}</td>
                  <td className="px-4 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ACCT_TYPE_COLORS[row.type] || ""}`}>{row.type}</span></td>
                  <td className="px-4 py-2 text-right">
                    <Input type="number" className="h-7 text-xs text-right w-32 ml-auto"
                      value={edits[row.account_id] ?? String(row.opening_balance)}
                      onChange={e => setEdits(prev => ({ ...prev, [row.account_id]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end">
        <Button className="bg-[#0d5040]" size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Opening Balances"}</Button>
      </div>
    </div>
  );
}

// ── FINANCIAL YEAR MANAGER ────────────────────────────────────────────────
function FYManager({ activeFyId }: { activeFyId?: string }) {
  const { toast } = useToast();
  const [fys, setFys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showOB, setShowOB] = useState(false);
  const [obFyId, setObFyId] = useState<string>("");
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/accounting/financial-years`, { credentials: "include" });
    if (r.ok) setFys(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function activate(id: string) {
    const r = await fetch(`${API}/api/accounting/financial-years/${id}/activate`, { method: "PUT", credentials: "include" });
    if (r.ok) { toast({ title: "Financial year activated" }); load(); }
  }
  async function closeFY(id: string, name: string) {
    if (!confirm(`Close ${name}? This cannot be undone.`)) return;
    const r = await fetch(`${API}/api/accounting/financial-years/${id}/close`, { method: "PUT", credentials: "include" });
    if (r.ok) { toast({ title: "Financial year closed" }); load(); }
  }
  async function create() {
    if (!form.name || !form.start_date || !form.end_date) { toast({ title: "All fields required", variant: "destructive" }); return; }
    const r = await fetch(`${API}/api/accounting/financial-years`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { toast({ title: "Financial year created" }); setShowModal(false); load(); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Manage financial years and set opening balances per account.</p>
        <Button size="sm" className="bg-[#0d5040]" onClick={() => setShowModal(true)}><Plus size={14} className="mr-1" />New Year</Button>
      </div>
      {loading ? <Spin /> : (
        <div className="space-y-2">
          {fys.map(fy => (
            <div key={fy.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between gap-4 ${fy.is_active ? "border-[#0d5040] bg-green-50/30" : ""}`}>
              <div>
                <p className="font-semibold text-sm">{fy.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(fy.start_date)} — {fmtDate(fy.end_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                {fy.is_active && <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>}
                {fy.is_closed && <Badge className="bg-gray-100 text-gray-500 border-0">Closed</Badge>}
                <Button size="sm" variant="outline" className="text-xs" onClick={() => { setObFyId(fy.id); setShowOB(true); }}>Opening Balances</Button>
                {!fy.is_active && !fy.is_closed && <Button size="sm" variant="outline" onClick={() => activate(fy.id)}>Set Active</Button>}
                {fy.is_active && !fy.is_closed && <Button size="sm" variant="outline" className="text-red-600" onClick={() => closeFY(fy.id, fy.name)}>Close Year</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showOB && obFyId && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Opening Balances — {fys.find(f => f.id === obFyId)?.name}</h3>
            <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setShowOB(false)}>✕ Close</Button>
          </div>
          <OpeningBalancesEditor fyId={obFyId} />
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Financial Year</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs font-medium">Name</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. FY 2025-26" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium">Start Date</label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1" /></div>
              <div><label className="text-xs font-medium">End Date</label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#0d5040]" onClick={create}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── GENERAL LEDGER (per account) ──────────────────────────────────────────
function GeneralLedger({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selAccount, setSelAccount] = useState("");
  const [data, setData] = useState<any>(null);
  const today = new Date().toISOString().slice(0, 10);
  const fyStart = (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + "-04-01";
  const [from, setFrom] = useState(defaultFrom || fyStart);
  const [to, setTo] = useState(defaultTo || today);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${API}/api/accounting/accounts`, { credentials: "include" }).then(r => r.json()).then(setAccounts).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!selAccount) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/accounts/${selAccount}/ledger?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [selAccount, from, to]);

  useEffect(() => { if (selAccount) load(); }, [selAccount, load]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await fetch(`${API}/api/accounting/journal-entries/sync`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (r.ok) { toast({ title: `Synced ${d.synced} journal entries` }); load(); }
      else toast({ title: "Sync failed", description: d.error, variant: "destructive" });
    } catch (e: any) { toast({ title: "Sync failed", description: e.message, variant: "destructive" }); }
    setSyncing(false);
  }

  function exportExcel() {
    if (!data?.lines) return;
    const ws = XLSX.utils.json_to_sheet([
      { Date: "Opening Balance", "Entry #": "", Reference: "", Narration: "", Dr: "", Cr: "", Balance: data.openingBalance },
      ...data.lines.map((l: any) => ({ Date: l.date, "Entry #": l.entry_number, Reference: l.reference || "", Narration: l.je_narration, Dr: l.debit, Cr: l.credit, Balance: l.running_balance })),
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `ledger-${data.account?.code}-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={selAccount} onChange={e => setSelAccount(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background min-w-[220px]">
          <option value="">Select Account…</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
        <DR from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading || !selAccount}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing} title="Auto-create journal entries from payments and expenses">
          <RefreshCw size={14} className={`mr-1 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing…" : "Sync Journal"}
        </Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data?.lines?.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>

      {!selAccount ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Select an account to view its ledger. Use "Sync Journal" to auto-create journal entries from existing payments and expenses.</div>
      ) : loading ? <Spin /> : err ? <Err msg={err} /> : !data ? null : (
        <div className="space-y-3">
          <div className="bg-[#0d5040]/5 border border-[#0d5040]/20 rounded-xl p-4 flex gap-6">
            <div><p className="text-xs text-muted-foreground">Account</p><p className="font-semibold">{data.account?.code} — {data.account?.name}</p></div>
            <div><p className="text-xs text-muted-foreground">Opening Balance</p><p className="font-bold">{fmt(data.openingBalance)}</p></div>
            <div><p className="text-xs text-muted-foreground">Closing Balance</p><p className="font-bold text-[#0d5040]">{fmt(data.closingBalance)}</p></div>
            <div><p className="text-xs text-muted-foreground">Transactions</p><p className="font-bold">{data.lines?.length || 0}</p></div>
          </div>
          {data.lines?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No transactions. Click "Sync Journal" to populate entries from existing data.</div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Entry #</th>
                      <th className="px-4 py-2.5 text-left">Reference</th>
                      <th className="px-4 py-2.5 text-left">Narration</th>
                      <th className="px-4 py-2.5 text-right">Debit (Dr)</th>
                      <th className="px-4 py-2.5 text-right">Credit (Cr)</th>
                      <th className="px-4 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="bg-muted/30 font-semibold">
                      <td colSpan={6} className="px-4 py-2 text-xs">Opening Balance</td>
                      <td className="px-4 py-2 text-right">{fmt(data.openingBalance)}</td>
                    </tr>
                    {data.lines.map((l: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(l.date)}</td>
                        <td className="px-4 py-2 text-xs font-mono">{l.entry_number}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{l.reference || "—"}</td>
                        <td className="px-4 py-2 text-xs max-w-[200px] truncate">{l.je_narration}</td>
                        <td className="px-4 py-2 text-right text-xs font-semibold">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : "—"}</td>
                        <td className="px-4 py-2 text-right text-green-600 text-xs font-semibold">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : "—"}</td>
                        <td className={`px-4 py-2 text-right font-bold text-xs ${Number(l.running_balance) >= 0 ? "text-gray-800" : "text-red-600"}`}>{fmt(Number(l.running_balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-bold">
                    <tr>
                      <td colSpan={6} className="px-4 py-2.5 text-xs text-muted-foreground">Closing Balance</td>
                      <td className="px-4 py-2.5 text-right text-[#0d5040]">{fmt(data.closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── BANK RECONCILIATION ───────────────────────────────────────────────────
function BankRecon({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom || d30);
  const [to, setTo] = useState(defaultTo || today);
  const [status, setStatus] = useState("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setErr(""); setSelected(new Set());
    try {
      const r = await fetch(`${API}/api/accounting/bank-reconciliation?from=${from}&to=${to}&status=${status}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to, status]);

  useEffect(() => { load(); }, [load]);

  async function reconcile(id: string) {
    const r = await fetch(`${API}/api/accounting/bank-reconciliation/${id}/reconcile`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (r.ok) { toast({ title: "Reconciled" }); load(); }
  }
  async function unreconcile(id: string) {
    const r = await fetch(`${API}/api/accounting/bank-reconciliation/${id}/unreconcile`, { method: "POST", credentials: "include" });
    if (r.ok) { toast({ title: "Marked unreconciled" }); load(); }
  }
  async function bulkReconcile() {
    if (!selected.size) return;
    const r = await fetch(`${API}/api/accounting/bank-reconciliation/bulk-reconcile`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected] }) });
    if (r.ok) { toast({ title: `${selected.size} entries reconciled` }); load(); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DR from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
          <option value="all">All</option>
          <option value="unreconciled">Unreconciled</option>
          <option value="reconciled">Reconciled</option>
        </select>
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button>
        {selected.size > 0 && <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={bulkReconcile}><CheckCircle2 size={14} className="mr-1" />Reconcile {selected.size} selected</Button>}
      </div>

      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold mt-1">{fmt(data.summary.total)}</p><p className="text-[10px] text-muted-foreground">{data.summary.count} entries</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Reconciled</p><p className="text-xl font-bold text-green-600 mt-1">{fmt(data.summary.reconciled)}</p><p className="text-[10px] text-muted-foreground">{data.summary.reconciledCount} entries</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Unreconciled</p><p className="text-xl font-bold text-amber-600 mt-1">{fmt(data.summary.unreconciled)}</p><p className="text-[10px] text-muted-foreground">{data.summary.count - data.summary.reconciledCount} entries</p></div>
        </div>
      )}

      {loading ? <Spin /> : err ? <Err msg={err} /> : !data?.rows?.length ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No transactions in this period</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2.5 w-8"><input type="checkbox" onChange={e => e.target.checked ? setSelected(new Set(data.rows.filter((r: any) => !r.is_reconciled).map((r: any) => r.id))) : setSelected(new Set())} /></th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Booking #</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-left">Reference</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row: any) => (
                  <tr key={row.id} className={`hover:bg-muted/20 ${row.is_reconciled ? "bg-green-50/30" : ""}`}>
                    <td className="px-3 py-2.5">
                      {!row.is_reconciled && <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.booking_number}</td>
                    <td className="px-4 py-2 text-xs">{row.customer_name}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] uppercase">{row.mode}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.reference_number || "—"}</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600">{fmt(Number(row.amount))}</td>
                    <td className="px-4 py-2">
                      {row.is_reconciled
                        ? <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><CheckCircle2 size={11} />Reconciled</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium"><XCircle size={11} />Pending</span>}
                    </td>
                    <td className="px-4 py-2">
                      {row.is_reconciled
                        ? <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => unreconcile(row.id)}>Undo</Button>
                        : <Button size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300" onClick={() => reconcile(row.id)}>Reconcile</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CASH FLOW ─────────────────────────────────────────────────────────────
function CashFlow({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [from, setFrom] = useState(defaultFrom || `${fyYear}-04-01`);
  const [to, setTo] = useState(defaultTo || new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/cash-flow?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data) return;
    const rows: any[] = [];
    rows.push({ Section: "OPERATING ACTIVITIES", Item: "", Amount: "" });
    data.operating.inflows.forEach((f: any) => rows.push({ Section: "", Item: f.label, Amount: f.amount }));
    data.operating.outflows.forEach((f: any) => rows.push({ Section: "", Item: f.label, Amount: f.amount }));
    rows.push({ Section: "", Item: "Net Cash from Operations", Amount: data.operating.net });
    rows.push({ Section: "", Item: "NET CASH CHANGE", Amount: data.netCashChange });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
    XLSX.writeFile(wb, `cash-flow-${from}-${to}.xlsx`);
  }

  function CashFlowSection({ title, color, items, net }: any) {
    return (
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className={`px-4 py-2.5 font-semibold text-sm text-white ${color}`}>{title}</div>
        <div className="px-4 py-3 divide-y">
          {items.map((item: any, i: number) => (
            <div key={i} className="flex justify-between py-2 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={`font-semibold ${item.amount >= 0 ? "text-green-600" : "text-red-600"}`}>{item.amount >= 0 ? "" : "-"}{fmt(Math.abs(item.amount))}</span>
            </div>
          ))}
          <div className="flex justify-between py-2.5 font-bold">
            <span>Net Cash</span>
            <span className={net >= 0 ? "text-green-600" : "text-red-600"}>{net >= 0 ? "+" : "-"}{fmt(Math.abs(net))}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2 flex-wrap items-center">
        <DR from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data ? null : (
        <div className="space-y-3">
          <CashFlowSection title="A. Operating Activities" color="bg-blue-600"
            items={[...data.operating.inflows, ...data.operating.outflows]} net={data.operating.net} />
          <CashFlowSection title="B. Investing Activities" color="bg-purple-600"
            items={data.investing.inflows.length + data.investing.outflows.length === 0
              ? [{ label: "No investing activities in period", amount: 0 }]
              : [...data.investing.inflows, ...data.investing.outflows]}
            net={data.investing.net} />
          <CashFlowSection title="C. Financing Activities" color="bg-indigo-600"
            items={data.financing.inflows.length + data.financing.outflows.length === 0
              ? [{ label: "No financing activities in period", amount: 0 }]
              : [...data.financing.inflows, ...data.financing.outflows]}
            net={data.financing.net} />
          <div className={`flex justify-between rounded-xl p-4 font-bold text-lg ${data.netCashChange >= 0 ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"} border`}>
            <span>Net Cash Change (A + B + C)</span>
            <span>{data.netCashChange >= 0 ? "+" : "-"}{fmt(Math.abs(data.netCashChange))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SHARED / SIMPLE VIEWS ─────────────────────────────────────────────────
function BookView({ endpoint, title, defaultFrom, defaultTo }: { endpoint: string; title: string; defaultFrom?: string; defaultTo?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom || d90); const [to, setTo] = useState(defaultTo || today);
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { const r = await fetch(`${API}/api/accounting/${endpoint}?from=${from}&to=${to}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false);
  }, [endpoint, from, to]);
  useEffect(() => { load(); }, [load]);
  function exp() {
    if (!data?.rows) return;
    const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({ Date: r.date, Type: r.type, Party: r.party, Narration: r.narration, Reference: r.reference, Mode: r.mode, "In": r.cash_in || r.bank_in || 0, "Out": r.expense || 0, Balance: r.running_balance || 0 })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, title); XLSX.writeFile(wb, `${endpoint}-${from}-${to}.xlsx`);
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><DR from={from} to={to} onFrom={setFrom} onTo={setTo} /><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button></div>
      {data?.summary && <div className="grid grid-cols-3 gap-3">{[["Total In", data.summary.totalIn, "text-green-600"], ["Total Out", data.summary.totalOut, "text-red-600"], ["Net Balance", data.summary.netBalance, data.summary.netBalance >= 0 ? "text-emerald-600" : "text-red-600"]].map(([l, v, c]) => <div key={l as string} className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-xl font-bold mt-1 ${c}`}>{fmt(Number(v))}</p></div>)}</div>}
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data?.rows?.length ? <div className="py-12 text-center text-muted-foreground text-sm">No transactions in this period</div> : (
        <div className="bg-white rounded-xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-left">Party</th><th className="px-4 py-2.5 text-left">Narration</th><th className="px-4 py-2.5 text-left">Ref</th><th className="px-4 py-2.5 text-left">Mode</th><th className="px-4 py-2.5 text-right">In</th><th className="px-4 py-2.5 text-right">Out</th><th className="px-4 py-2.5 text-right">Balance</th></tr></thead><tbody className="divide-y">{(data?.rows || []).map((r: any, i: number) => (<tr key={i} className={`hover:bg-muted/20 ${r.type === "payment" ? "bg-red-50/30" : ""}`}><td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-4 py-2"><Badge variant={r.type === "receipt" ? "default" : "secondary"} className="text-[10px] capitalize">{r.type}</Badge></td><td className="px-4 py-2 text-xs">{r.party}</td><td className="px-4 py-2 text-xs max-w-[180px] truncate">{r.narration}</td><td className="px-4 py-2 text-xs text-muted-foreground">{r.reference || "—"}</td><td className="px-4 py-2 text-xs capitalize">{r.mode}</td><td className="px-4 py-2 text-right text-green-600 font-semibold text-xs">{r.cash_in || r.bank_in ? fmt(Number(r.cash_in || r.bank_in)) : "—"}</td><td className="px-4 py-2 text-right text-red-600 font-semibold text-xs">{r.expense ? fmt(Number(r.expense)) : "—"}</td><td className={`px-4 py-2 text-right font-bold text-xs ${Number(r.running_balance || 0) >= 0 ? "text-gray-700" : "text-red-600"}`}>{fmt(Number(r.running_balance || 0))}</td></tr>))}</tbody></table></div></div>
      )}
    </div>
  );
}

function Ledger() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(""); const [search, setSearch] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/ledger?search=${encodeURIComponent(search)}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setRows(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [search]);
  useEffect(() => { load(); }, []);
  const filtered = search ? rows.filter(r => `${r.customer_name} ${r.mobile} ${r.booking_number}`.toLowerCase().includes(search.toLowerCase())) : rows;
  const totals = { debit: filtered.reduce((s, r) => s + Number(r.debit || 0), 0), credit: filtered.reduce((s, r) => s + Number(r.credit || 0), 0), balance: filtered.reduce((s, r) => s + Number(r.balance || 0), 0) };
  function exp() { const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile, Group: r.group_name || "", "Total (Dr)": r.debit, "Paid (Cr)": r.credit, Balance: r.balance, Status: r.status }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ledger"); XLSX.writeFile(wb, `ledger-${new Date().toISOString().slice(0, 10)}.xlsx`); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap"><Input placeholder="Search customer, mobile, booking…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm flex-1 min-w-[200px]" /><Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!rows.length}><Download size={14} className="mr-1" />Excel</Button></div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : (
        <div className="bg-white rounded-xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Booking #</th><th className="px-4 py-2.5 text-left">Customer</th><th className="px-4 py-2.5 text-left">Mobile</th><th className="px-4 py-2.5 text-left">Group</th><th className="px-4 py-2.5 text-right">Debit</th><th className="px-4 py-2.5 text-right">Credit</th><th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5 text-left">Status</th></tr></thead><tbody className="divide-y">{filtered.map(r => (<tr key={r.booking_id} className="hover:bg-muted/20"><td className="px-4 py-2.5 font-mono text-xs">{r.booking_number}</td><td className="px-4 py-2.5 font-medium">{r.customer_name}</td><td className="px-4 py-2.5 text-xs text-muted-foreground">{r.mobile}</td><td className="px-4 py-2.5 text-xs">{r.group_name || "—"}</td><td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(r.debit))}</td><td className="px-4 py-2.5 text-right text-green-600 font-semibold">{fmt(Number(r.credit))}</td><td className={`px-4 py-2.5 text-right font-bold ${Number(r.balance) > 0 ? "text-amber-600" : "text-green-600"}`}>{fmt(Number(r.balance))}</td><td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></td></tr>))}</tbody><tfoot className="bg-muted/30 border-t font-semibold"><tr><td colSpan={4} className="px-4 py-2.5 text-xs text-muted-foreground">TOTAL ({filtered.length})</td><td className="px-4 py-2.5 text-right">{fmt(totals.debit)}</td><td className="px-4 py-2.5 text-right text-green-600">{fmt(totals.credit)}</td><td className="px-4 py-2.5 text-right text-amber-600">{fmt(totals.balance)}</td><td /></tr></tfoot></table></div></div>
      )}
    </div>
  );
}

function Journal({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const today = new Date().toISOString().slice(0, 10); const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom || d30); const [to, setTo] = useState(defaultTo || today); const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/journal?from=${from}&to=${to}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setRows(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [from, to]);
  useEffect(() => { load(); }, [load]);
  function exp() { const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ Date: r.date, Ref: r.reference, Party: r.party, "Account Dr": r.account_dr, "Account Cr": r.account_cr, Debit: r.debit, Credit: r.credit, Narration: r.narration }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Journal"); XLSX.writeFile(wb, `journal-${from}-${to}.xlsx`); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><DR from={from} to={to} onFrom={setFrom} onTo={setTo} /><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!rows.length}><Download size={14} className="mr-1" />Excel</Button></div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : rows.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">No journal entries</div> : (
        <div className="bg-white rounded-xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Ref</th><th className="px-4 py-2.5 text-left">Party</th><th className="px-4 py-2.5 text-left">Dr Account</th><th className="px-4 py-2.5 text-left">Cr Account</th><th className="px-4 py-2.5 text-right">Debit</th><th className="px-4 py-2.5 text-right">Credit</th><th className="px-4 py-2.5 text-left">Narration</th></tr></thead><tbody className="divide-y">{rows.map((r, i) => (<tr key={i} className="hover:bg-muted/20"><td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-4 py-2 text-xs font-mono">{r.reference}</td><td className="px-4 py-2 text-xs">{r.party}</td><td className="px-4 py-2 text-xs capitalize">{r.account_dr}</td><td className="px-4 py-2 text-xs">{r.account_cr}</td><td className="px-4 py-2 text-right font-semibold text-xs">{fmt(Number(r.debit))}</td><td className="px-4 py-2 text-right text-green-600 font-semibold text-xs">{fmt(Number(r.credit))}</td><td className="px-4 py-2 text-xs max-w-[180px] truncate">{r.narration}</td></tr>))}</tbody><tfoot className="bg-muted/30 border-t font-semibold"><tr><td colSpan={5} className="px-4 py-2.5 text-xs text-muted-foreground">TOTAL ({rows.length})</td><td className="px-4 py-2.5 text-right">{fmt(rows.reduce((s, r) => s + Number(r.debit || 0), 0))}</td><td className="px-4 py-2.5 text-right text-green-600">{fmt(rows.reduce((s, r) => s + Number(r.credit || 0), 0))}</td><td /></tr></tfoot></table></div></div>
      )}
    </div>
  );
}

function PaymentEntries({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const today = new Date().toISOString().slice(0, 10); const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom || d30); const [to, setTo] = useState(defaultTo || today); const [mode, setMode] = useState("all"); const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/payment-entries?from=${from}&to=${to}&mode=${mode}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [from, to, mode]);
  useEffect(() => { load(); }, [load]);
  function exp() { if (!data?.rows) return; const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({ Date: r.date, "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile, Group: r.group_name || "", Mode: r.mode, Reference: r.reference, Bank: r.bank_name, "Received By": r.received_by, "Amount (₹)": r.amount, Reconciled: r.is_reconciled ? "Yes" : "No" }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Payments"); XLSX.writeFile(wb, `payments-${from}-${to}.xlsx`); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><DR from={from} to={to} onFrom={setFrom} onTo={setTo} /><select value={mode} onChange={e => setMode(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">{["all", "cash", "upi", "neft", "cheque", "online", "card"].map(m => <option key={m} value={m}>{m === "all" ? "All Modes" : m.toUpperCase()}</option>)}</select><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button></div>
      {data && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-6"><div><p className="text-xs text-muted-foreground">Total Collected</p><p className="text-xl font-bold text-emerald-600">{fmt(data.total || 0)}</p></div><div><p className="text-xs text-muted-foreground">Entries</p><p className="text-xl font-bold">{data.rows?.length || 0}</p></div></div>}
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data?.rows?.length ? <div className="py-12 text-center text-muted-foreground text-sm">No payments in this period</div> : (
        <div className="bg-white rounded-xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Booking #</th><th className="px-4 py-2.5 text-left">Customer</th><th className="px-4 py-2.5 text-left">Mode</th><th className="px-4 py-2.5 text-left">Reference</th><th className="px-4 py-2.5 text-left">Bank</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-left">Recon</th></tr></thead><tbody className="divide-y">{data.rows.map((r: any) => (<tr key={r.id} className="hover:bg-muted/20"><td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-4 py-2 font-mono text-xs">{r.booking_number}</td><td className="px-4 py-2 text-xs font-medium">{r.customer_name}</td><td className="px-4 py-2"><Badge variant="outline" className="text-[10px] uppercase">{r.mode}</Badge></td><td className="px-4 py-2 text-xs text-muted-foreground">{r.reference || "—"}</td><td className="px-4 py-2 text-xs">{r.bank_name || "—"}</td><td className="px-4 py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td><td className="px-4 py-2">{r.is_reconciled ? <CheckCircle2 size={14} className="text-green-500" /> : <XCircle size={14} className="text-amber-400" />}</td></tr>))}</tbody><tfoot className="bg-muted/30 border-t"><tr><td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">TOTAL ({data.rows.length})</td><td className="px-4 py-2.5 text-right font-bold text-green-600">{fmt(data.total || 0)}</td><td /></tr></tfoot></table></div></div>
      )}
    </div>
  );
}

function Outstanding() {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [err, setErr] = useState(""); const [search, setSearch] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/outstanding`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);
  function exp() { if (!data?.rows) return; const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({ "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile, Group: r.group_name || "", Total: r.total_amount, Paid: r.paid_amount, Outstanding: r.outstanding }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Outstanding"); XLSX.writeFile(wb, `outstanding-${new Date().toISOString().slice(0, 10)}.xlsx`); }
  const filtered = data?.rows ? (search ? data.rows.filter((r: any) => `${r.customer_name} ${r.mobile}`.toLowerCase().includes(search.toLowerCase())) : data.rows) : [];
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer…" className="h-8 text-sm flex-1 min-w-[180px]" /><Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Refresh</Button><Button size="sm" variant="outline" onClick={exp} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button></div>
      {data && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-6"><div><p className="text-xs text-muted-foreground">Total Outstanding</p><p className="text-xl font-bold text-amber-600">{fmt(data.total || 0)}</p></div><div><p className="text-xs text-muted-foreground">Customers</p><p className="text-xl font-bold">{data.count || 0}</p></div></div>}
      {loading ? <Spin /> : err ? <Err msg={err} /> : filtered.length === 0 ? <div className="py-12 text-center text-green-600 text-sm font-medium">🎉 No outstanding balances!</div> : (
        <div className="bg-white rounded-xl border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Booking #</th><th className="px-4 py-2.5 text-left">Customer</th><th className="px-4 py-2.5 text-left">Mobile</th><th className="px-4 py-2.5 text-left">Group</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Paid</th><th className="px-4 py-2.5 text-right">Outstanding</th></tr></thead><tbody className="divide-y">{filtered.map((r: any) => (<tr key={r.booking_id} className="hover:bg-muted/20"><td className="px-4 py-2 font-mono text-xs">{r.booking_number}</td><td className="px-4 py-2 font-medium text-xs">{r.customer_name}</td><td className="px-4 py-2 text-xs text-muted-foreground">{r.mobile}</td><td className="px-4 py-2 text-xs">{r.group_name || "—"}</td><td className="px-4 py-2 text-right text-xs">{fmt(Number(r.total_amount))}</td><td className="px-4 py-2 text-right text-green-600 text-xs">{fmt(Number(r.paid_amount))}</td><td className="px-4 py-2 text-right font-bold text-amber-600">{fmt(Number(r.outstanding))}</td></tr>))}</tbody><tfoot className="bg-muted/30 border-t"><tr><td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">TOTAL ({filtered.length})</td><td className="px-4 py-2.5 text-right font-bold text-amber-600">{fmt(filtered.reduce((s: number, r: any) => s + Number(r.outstanding || 0), 0))}</td></tr></tfoot></table></div></div>
      )}
    </div>
  );
}

function ProfitLoss({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [from, setFrom] = useState(defaultFrom || `${fyYear}-04-01`); const [to, setTo] = useState(defaultTo || new Date().toISOString().slice(0, 10)); const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/pl?from=${from}&to=${to}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [from, to]);
  useEffect(() => { load(); }, [load]);
  function exp() { if (!data) return; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["P&L", `${data.period?.from} to ${data.period?.to}`], [], ["INCOME"], ["Sales Revenue", data.revenue?.total], [], ["EXPENSES"], ...(data.expenses?.byCategory || []).map((c: any) => [CAT_LABELS[c.category] || c.category, c.total]), ["Total Expenses", data.expenses?.total], [], ["NET PROFIT/(LOSS)", data.netProfit]]), "P&L"); XLSX.writeFile(wb, `pl-${from}-${to}.xlsx`); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><DR from={from} to={to} onFrom={setFrom} onTo={setTo} /><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!data}><Download size={14} className="mr-1" />Excel</Button></div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data ? null : (
        <div className="max-w-2xl"><div className="bg-white border rounded-xl overflow-hidden"><div className="bg-[#0d5040] text-white px-5 py-3 font-semibold text-sm">Profit & Loss Statement — {data.period?.from} to {data.period?.to}</div><div className="px-5 py-4 space-y-4"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Income</p><div className="flex justify-between py-1.5 border-b text-sm"><span>Sales Revenue ({data.revenue?.bookingCount} payments)</span><span className="font-semibold text-green-600">{fmt(data.revenue?.total || 0)}</span></div><div className="flex justify-between py-1.5 font-bold"><span>Total Income</span><span className="text-green-600">{fmt(data.revenue?.total || 0)}</span></div></div><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Expenditure</p>{(data.expenses?.byCategory || []).map((c: any) => (<div key={c.category} className="flex justify-between py-1 border-b last:border-0 text-sm"><span className="text-muted-foreground">{CAT_LABELS[c.category] || c.category}</span><span className="text-red-600">{fmt(Number(c.total))}</span></div>))}<div className="flex justify-between py-1.5 font-bold border-t mt-1"><span>Total Expenditure</span><span className="text-red-600">{fmt(data.expenses?.total || 0)}</span></div></div><div className={`flex justify-between py-3 px-4 rounded-lg font-bold text-lg ${data.netProfit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}><span>Net {data.netProfit >= 0 ? "Profit" : "Loss"}</span><span>{data.netProfit >= 0 ? "" : "-"}{fmt(Math.abs(data.netProfit || 0))}</span></div></div></div></div>
      )}
    </div>
  );
}

function BalanceSheet({ defaultTo }: { defaultTo?: string }) {
  const [asOf, setAsOf] = useState(defaultTo || new Date().toISOString().slice(0, 10)); const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/balance-sheet?asOf=${asOf}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [asOf]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><span className="text-sm text-muted-foreground">As of:</span><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-8 text-sm w-40" /><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button></div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data ? null : (
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-green-600 text-white px-4 py-2.5 font-semibold text-sm">Assets</div>
            <div className="px-4 py-3 space-y-2 text-sm">
              {[["Cash in Hand", data.assets?.cash], ["Bank Balance", data.assets?.bank], ["Accounts Receivable", data.assets?.accountsReceivable]].map(([l, v]) =>
                <div key={l as string} className="flex justify-between text-muted-foreground"><span>{l}</span><span>{fmt(Number(v))}</span></div>
              )}
              {(data.assets?.items || []).filter((i: any) => !["1001","1002","1003"].includes(i.code)).map((i: any) =>
                <div key={i.name} className="flex justify-between text-muted-foreground"><span>{i.name}</span><span>{fmt(Number(i.balance))}</span></div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold"><span>Total Assets</span><span>{fmt(data.assets?.total || 0)}</span></div>
            </div>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-red-600 text-white px-4 py-2.5 font-semibold text-sm">Liabilities & Equity</div>
            <div className="px-4 py-3 space-y-2 text-sm">
              {(data.liabilities?.items || []).map((i: any) =>
                <div key={i.name} className="flex justify-between text-muted-foreground"><span>{i.name}</span><span>{fmt(Number(i.balance))}</span></div>
              )}
              {!data.liabilities?.items?.length && <div className="flex justify-between text-muted-foreground"><span>Liabilities</span><span>—</span></div>}
              <div className="border-t pt-2 flex justify-between font-semibold"><span>Total Liabilities</span><span>{fmt(data.liabilities?.total || 0)}</span></div>
              <div className="border-t pt-2 space-y-1">
                {(data.equity?.items || []).map((i: any) =>
                  <div key={i.name} className="flex justify-between text-muted-foreground"><span>{i.name}</span><span>{fmt(Number(i.balance))}</span></div>
                )}
                <div className="flex justify-between text-muted-foreground"><span>Retained Earnings (Net Income)</span><span className={(data.equity?.netIncome || 0) >= 0 ? "text-green-600" : "text-red-600"}>{fmt(data.equity?.netIncome || 0)}</span></div>
                <div className={`flex justify-between font-bold ${(data.equity?.total || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  <span>Total Equity</span><span>{fmt(data.equity?.total || 0)}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total L + E</span>
                <span>{fmt((data.liabilities?.total || 0) + (data.equity?.total || 0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrialBalance({ defaultFrom, defaultTo }: { defaultFrom?: string; defaultTo?: string }) {
  const fyYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [from, setFrom] = useState(defaultFrom || `${fyYear}-04-01`); const [to, setTo] = useState(defaultTo || new Date().toISOString().slice(0, 10)); const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => { setLoading(true); setErr(""); try { const r = await fetch(`${API}/api/accounting/trial-balance?from=${from}&to=${to}`, { credentials: "include" }); if (!r.ok) setErr(`Error ${r.status}`); else setData(await r.json()); } catch (e: any) { setErr(e.message); } setLoading(false); }, [from, to]);
  useEffect(() => { load(); }, [load]);
  function exp() { if (!data) return; const ws = XLSX.utils.json_to_sheet((data.entries || []).map((e: any) => ({ Account: e.account, "Debit (Dr)": e.debit || 0, "Credit (Cr)": e.credit || 0 }))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Trial Balance"); XLSX.writeFile(wb, `trial-balance-${from}-${to}.xlsx`); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center"><DR from={from} to={to} onFrom={setFrom} onTo={setTo} /><Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />Load</Button><Button size="sm" variant="outline" onClick={exp} disabled={!data}><Download size={14} className="mr-1" />Excel</Button></div>
      {loading ? <Spin /> : err ? <Err msg={err} /> : !data ? null : (
        <div className="max-w-2xl space-y-3">
          {data.totals?.balanced ? <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-green-700 text-sm font-medium">✅ Trial Balance is balanced</div> : <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-700 text-sm font-medium">⚠️ Imbalance: Dr {fmt(data.totals?.debit)} ≠ Cr {fmt(data.totals?.credit)}</div>}
          <div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground uppercase"><tr><th className="px-4 py-2.5 text-left">Account</th><th className="px-4 py-2.5 text-right">Debit (Dr)</th><th className="px-4 py-2.5 text-right">Credit (Cr)</th></tr></thead><tbody className="divide-y">{(data.entries || []).map((e: any, i: number) => (<tr key={i} className="hover:bg-muted/20"><td className="px-4 py-2.5 capitalize">{e.account}</td><td className="px-4 py-2.5 text-right font-semibold">{e.debit ? fmt(e.debit) : "—"}</td><td className="px-4 py-2.5 text-right text-green-600 font-semibold">{e.credit ? fmt(e.credit) : "—"}</td></tr>))}</tbody><tfoot className="bg-muted/30 border-t font-bold"><tr><td className="px-4 py-2.5">TOTAL</td><td className="px-4 py-2.5 text-right">{fmt(data.totals?.debit || 0)}</td><td className="px-4 py-2.5 text-right text-green-600">{fmt(data.totals?.credit || 0)}</td></tr></tfoot></table></div>
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────
export default function AccountingDashboard() {
  const [tab, setTab] = useState("overview");
  const [fys, setFys] = useState<any[]>([]);
  const [activeFyId, setActiveFyId] = useState("");
  const [fyFrom, setFyFrom] = useState("");
  const [fyTo, setFyTo] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`${API}/api/accounting/financial-years`, { credentials: "include" })
      .then(r => r.json()).then((years: any[]) => {
        setFys(years);
        const active = years.find((y: any) => y.is_active) || years[0];
        if (active) {
          setActiveFyId(active.id);
          setFyFrom(active.start_date);
          setFyTo(active.end_date > today ? today : active.end_date);
        }
      }).catch(() => {});
  }, []);

  function handleFyChange(fyId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const fy = fys.find((y: any) => y.id === fyId);
    if (!fy) return;
    setActiveFyId(fyId);
    setFyFrom(fy.start_date);
    setFyTo(fy.end_date > today ? today : fy.end_date);
  }

  const fyKey = `${fyFrom}-${fyTo}`;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Accounting</h1>
            <p className="text-sm text-muted-foreground">Chart of Accounts, Double-Entry Journals, Cash Books, P&L, Balance Sheet</p>
          </div>
          {fys.length > 0 && (
            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm">
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Financial Year:</span>
              <select value={activeFyId} onChange={e => handleFyChange(e.target.value)}
                className="h-7 px-2 rounded border text-sm bg-background">
                {fys.map((fy: any) => (
                  <option key={fy.id} value={fy.id}>{fy.name}{fy.is_active ? " ●" : ""}</option>
                ))}
              </select>
              {fyFrom && <span className="text-[11px] text-muted-foreground hidden sm:inline">{fyFrom} → {fyTo}</span>}
            </div>
          )}
        </div>
        {/* Scrollable tabs */}
        <div className="bg-white border rounded-xl p-1 flex gap-0.5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${tab === t.id ? "bg-[#0d5040] text-white" : "text-muted-foreground hover:bg-muted/50"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "accounts" && <ChartOfAccounts />}
        {tab === "fy" && <FYManager activeFyId={activeFyId} />}
        {tab === "gen-ledger" && <GeneralLedger key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "ledger" && <Ledger />}
        {tab === "cashbook" && <BookView key={fyKey} endpoint="cashbook" title="Cash Book" defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "bankbook" && <BookView key={fyKey} endpoint="bankbook" title="Bank Book" defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "journal" && <Journal key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "payments" && <PaymentEntries key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "outstanding" && <Outstanding />}
        {tab === "pl" && <ProfitLoss key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "balance" && <BalanceSheet key={fyKey} defaultTo={fyTo} />}
        {tab === "trial" && <TrialBalance key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "recon" && <BankRecon key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
        {tab === "cashflow" && <CashFlow key={fyKey} defaultFrom={fyFrom} defaultTo={fyTo} />}
      </div>
    </AdminLayout>
  );
}
