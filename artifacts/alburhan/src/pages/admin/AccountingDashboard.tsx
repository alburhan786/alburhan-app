import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, TrendingUp, TrendingDown, Wallet, AlertCircle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
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

const TABS = [
  { id: "overview", label: "Dashboard" },
  { id: "ledger", label: "Ledger" },
  { id: "cashbook", label: "Cash Book" },
  { id: "bankbook", label: "Bank Book" },
  { id: "journal", label: "Journal Entries" },
  { id: "payments", label: "Payment Entries" },
  { id: "outstanding", label: "Outstanding" },
  { id: "pl", label: "P&L" },
  { id: "balance", label: "Balance Sheet" },
  { id: "trial", label: "Trial Balance" },
];

// Reusable date range filter
function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <Input type="date" value={from} onChange={e => onFrom(e.target.value)} className="h-8 text-sm w-36" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" value={to} onChange={e => onTo(e.target.value)} className="h-8 text-sm w-36" />
    </div>
  );
}

// Loading / error states
function Loading() { return <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>; }
function ErrMsg({ msg }: { msg: string }) { return <div className="py-12 text-center text-red-500 text-sm">{msg}</div>; }

// ── OVERVIEW ────────────────────────────────────────────────────────────────
function Overview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/expenses/accounting-summary`, { credentials: "include" });
      if (!r.ok) { setErr(`API error ${r.status}`); setData(null); }
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Total Revenue", data.totalCollected],
      ["This Month Revenue", data.thisMonthCollected],
      ["Total Expenses", data.totalExpenses],
      ["This Month Expenses", data.thisMonthExpenses],
      ["Net Profit", data.netProfit],
      ["Outstanding", data.totalOutstanding],
    ]), "Summary");
    XLSX.writeFile(wb, `accounting-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const allMonths = data ? [...new Set([...(data.monthly||[]).map((m:any) => m.month), ...(data.monthlyExpenses||[]).map((m:any) => m.month)])].sort().slice(-12) : [];
  const maxMonthly = data ? Math.max(...(data.monthly||[]).map((m:any) => Number(m.collected)||0), ...(data.monthlyExpenses||[]).map((m:any) => Number(m.expenses)||0), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1.5 ${loading?"animate-spin":""}`} />Refresh</Button>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!data}><Download size={14} className="mr-1.5" />Excel</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingUp size={16} className="text-green-600" />} bg="bg-green-100" label="Total Revenue" value={fmt(data.totalCollected)} sub={`This month: ${fmt(data.thisMonthCollected)}`} />
            <KpiCard icon={<TrendingDown size={16} className="text-red-600" />} bg="bg-red-100" label="Total Expenses" value={fmt(data.totalExpenses)} sub={`This month: ${fmt(data.thisMonthExpenses)}`} valueClass="text-red-600" />
            <KpiCard icon={<Wallet size={16} className={data.netProfit>=0?"text-emerald-600":"text-red-600"} />} bg={data.netProfit>=0?"bg-emerald-100":"bg-red-100"} label="Net Profit / Loss" value={(data.netProfit>=0?"":"-")+fmt(data.netProfit)} valueClass={data.netProfit>=0?"text-emerald-600":"text-red-600"} sub={data.netProfit>=0?"Profitable":"Loss making"} />
            <KpiCard icon={<AlertCircle size={16} className="text-amber-600" />} bg="bg-amber-100" label="Outstanding" value={fmt(data.totalOutstanding)} sub={`${data.totalBookings} bookings`} valueClass="text-amber-600" />
          </div>
          {allMonths.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm font-semibold mb-4">Monthly Revenue vs Expenses</p>
              <div className="flex items-end gap-2 h-40 overflow-x-auto">
                {allMonths.map(m => {
                  const col = Number((data.monthly||[]).find((x:any)=>x.month===m)?.collected??0);
                  const exp = Number((data.monthlyExpenses||[]).find((x:any)=>x.month===m)?.expenses??0);
                  return (
                    <div key={m} className="flex flex-col items-center gap-1 min-w-[48px]">
                      <div className="flex items-end gap-0.5 h-28">
                        <div title={`Revenue: ${fmt(col)}`} className="w-5 bg-green-400 rounded-t" style={{ height: `${(col/maxMonthly)*100}%`, minHeight: col>0?"4px":"0" }} />
                        <div title={`Expenses: ${fmt(exp)}`} className="w-5 bg-red-400 rounded-t" style={{ height: `${(exp/maxMonthly)*100}%`, minHeight: exp>0?"4px":"0" }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{m.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block" /> Revenue</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" /> Expenses</span>
              </div>
            </div>
          )}
          {data.byCategory?.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm font-semibold mb-4">Expenses by Category</p>
              <div className="space-y-2.5">
                {data.byCategory.map((c: any) => {
                  const pct = Math.round((Number(c.total)/Math.max(data.totalExpenses,1))*100);
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{CAT_LABELS[c.category]||c.category}</span>
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

function KpiCard({ icon, bg, label, value, sub, valueClass = "text-gray-800" }: any) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>{icon}</div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ── LEDGER ──────────────────────────────────────────────────────────────────
function Ledger() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/ledger?search=${encodeURIComponent(search)}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}: ${await r.text()}`);
      else setRows(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, []);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile,
      Group: r.group_name||"", "Total (Dr)": r.debit, "Paid (Cr)": r.credit, "Balance": r.balance, Status: r.status,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `ledger-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const filtered = search ? rows.filter(r => `${r.customer_name} ${r.mobile} ${r.booking_number}`.toLowerCase().includes(search.toLowerCase())) : rows;
  const totals = { debit: filtered.reduce((s,r)=>s+Number(r.debit||0),0), credit: filtered.reduce((s,r)=>s+Number(r.credit||0),0), balance: filtered.reduce((s,r)=>s+Number(r.balance||0),0) };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search customer, mobile, booking…" value={search} onChange={e=>setSearch(e.target.value)} className="h-8 text-sm flex-1 min-w-[200px]" />
        <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!rows.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Booking #</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Mobile</th>
                  <th className="px-4 py-2.5 text-left">Group</th>
                  <th className="px-4 py-2.5 text-right">Debit (Dr)</th>
                  <th className="px-4 py-2.5 text-right">Credit (Cr)</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(r => (
                  <tr key={r.booking_id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.booking_number}</td>
                    <td className="px-4 py-2.5 font-medium">{r.customer_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.mobile}</td>
                    <td className="px-4 py-2.5 text-xs">{r.group_name||"—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(r.debit))}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{fmt(Number(r.credit))}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${Number(r.balance)>0?"text-amber-600":"text-green-600"}`}>{fmt(Number(r.balance))}</td>
                    <td className="px-4 py-2.5"><Badge variant={r.status==="confirmed"?"default":"secondary"} className="text-[10px]">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-muted-foreground">TOTAL ({filtered.length} accounts)</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.debit)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{fmt(totals.credit)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-600">{fmt(totals.balance)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CASH / BANK BOOK (shared component) ─────────────────────────────────────
function BookView({ endpoint, title }: { endpoint: string; title: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const d90 = new Date(Date.now() - 90*86400000).toISOString().slice(0,10);
  const [from, setFrom] = useState(d90);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/${endpoint}?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [endpoint, from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data?.rows) return;
    const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({
      Date: r.date, Type: r.type, Party: r.party, Narration: r.narration,
      Reference: r.reference, Mode: r.mode, "Amount In": r.cash_in||r.bank_in||0,
      "Amount Out": r.expense||0, Balance: r.running_balance||0,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, title);
    XLSX.writeFile(wb, `${endpoint}-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total In</p><p className="text-xl font-bold text-green-600 mt-1">{fmt(data.summary.totalIn)}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total Out</p><p className="text-xl font-bold text-red-600 mt-1">{fmt(data.summary.totalOut)}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-muted-foreground">Net Balance</p><p className={`text-xl font-bold mt-1 ${data.summary.netBalance>=0?"text-emerald-600":"text-red-600"}`}>{fmt(data.summary.netBalance)}</p></div>
        </div>
      )}
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : data?.rows?.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No transactions in this period</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Party</th>
                  <th className="px-4 py-2.5 text-left">Narration</th>
                  <th className="px-4 py-2.5 text-left">Ref</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-right">In (Dr)</th>
                  <th className="px-4 py-2.5 text-right">Out (Cr)</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.rows||[]).map((r: any, i: number) => (
                  <tr key={i} className={`hover:bg-muted/20 ${r.type==="payment"?"bg-red-50/30":""}`}>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2"><Badge variant={r.type==="receipt"?"default":"secondary"} className="text-[10px] capitalize">{r.type}</Badge></td>
                    <td className="px-4 py-2 text-xs">{r.party}</td>
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate">{r.narration}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.reference||"—"}</td>
                    <td className="px-4 py-2 text-xs capitalize">{r.mode}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-semibold text-xs">{r.cash_in||r.bank_in ? fmt(Number(r.cash_in||r.bank_in)) : "—"}</td>
                    <td className="px-4 py-2 text-right text-red-600 font-semibold text-xs">{r.expense ? fmt(Number(r.expense)) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-bold text-xs ${Number(r.running_balance||0)>=0?"text-gray-700":"text-red-600"}`}>{fmt(Number(r.running_balance||0))}</td>
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

// ── JOURNAL ENTRIES ──────────────────────────────────────────────────────────
function Journal() {
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const [from, setFrom] = useState(d30);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/journal?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setRows(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Date: r.date, Ref: r.reference, Party: r.party, "Account Dr": r.account_dr, "Account Cr": r.account_cr, Debit: r.debit, Credit: r.credit, Narration: r.narration,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Journal");
    XLSX.writeFile(wb, `journal-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!rows.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : rows.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No journal entries in this period</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Ref</th>
                  <th className="px-4 py-2.5 text-left">Party</th>
                  <th className="px-4 py-2.5 text-left">Dr Account</th>
                  <th className="px-4 py-2.5 text-left">Cr Account</th>
                  <th className="px-4 py-2.5 text-right">Debit</th>
                  <th className="px-4 py-2.5 text-right">Credit</th>
                  <th className="px-4 py-2.5 text-left">Narration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2 text-xs font-mono">{r.reference}</td>
                    <td className="px-4 py-2 text-xs">{r.party}</td>
                    <td className="px-4 py-2 text-xs capitalize">{r.account_dr}</td>
                    <td className="px-4 py-2 text-xs">{r.account_cr}</td>
                    <td className="px-4 py-2 text-right font-semibold text-xs">{fmt(Number(r.debit))}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-semibold text-xs">{fmt(Number(r.credit))}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[180px] truncate capitalize">{r.narration}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t font-semibold">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-xs text-muted-foreground">TOTAL ({rows.length})</td>
                  <td className="px-4 py-2.5 text-right">{fmt(rows.reduce((s,r)=>s+Number(r.debit||0),0))}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{fmt(rows.reduce((s,r)=>s+Number(r.credit||0),0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PAYMENT ENTRIES ──────────────────────────────────────────────────────────
function PaymentEntries() {
  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const [from, setFrom] = useState(d30);
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/payment-entries?from=${from}&to=${to}&mode=${mode}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to, mode]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data?.rows) return;
    const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({
      Date: r.date, "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile,
      Group: r.group_name||"", Mode: r.mode, Reference: r.reference, Bank: r.bank_name, "Received By": r.received_by, "Amount (₹)": r.amount,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, `payments-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <select value={mode} onChange={e=>setMode(e.target.value)} className="h-8 px-2 rounded border text-sm bg-background">
          <option value="all">All Modes</option>
          {["cash","upi","neft","cheque","online","card"].map(m=><option key={m} value={m} className="capitalize">{m.toUpperCase()}</option>)}
        </select>
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {data && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-6">
        <div><p className="text-xs text-muted-foreground">Total Collected</p><p className="text-xl font-bold text-emerald-600">{fmt(data.total||0)}</p></div>
        <div><p className="text-xs text-muted-foreground">Entries</p><p className="text-xl font-bold">{data.rows?.length||0}</p></div>
      </div>}
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : !data?.rows?.length ? (
        <div className="py-12 text-center text-muted-foreground text-sm">No payments in this period</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Booking #</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Group</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-left">Reference</th>
                  <th className="px-4 py-2.5 text-left">Bank</th>
                  <th className="px-4 py-2.5 text-left">Received By</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.booking_number}</td>
                    <td className="px-4 py-2 text-xs font-medium">{r.customer_name}</td>
                    <td className="px-4 py-2 text-xs">{r.group_name||"—"}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] uppercase">{r.mode}</Badge></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.reference||"—"}</td>
                    <td className="px-4 py-2 text-xs">{r.bank_name||"—"}</td>
                    <td className="px-4 py-2 text-xs">{r.received_by||"—"}</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t">
                <tr>
                  <td colSpan={8} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">TOTAL ({data.rows.length})</td>
                  <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmt(data.total||0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── OUTSTANDING ──────────────────────────────────────────────────────────────
function Outstanding() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/outstanding`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data?.rows) return;
    const ws = XLSX.utils.json_to_sheet(data.rows.map((r: any) => ({
      "Booking #": r.booking_number, Customer: r.customer_name, Mobile: r.mobile, Group: r.group_name||"",
      "Total Amount": r.total_amount, "Paid": r.paid_amount, "Outstanding": r.outstanding, Status: r.status,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Outstanding");
    XLSX.writeFile(wb, `outstanding-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const filtered = data?.rows ? (search ? data.rows.filter((r: any) => `${r.customer_name} ${r.mobile}`.toLowerCase().includes(search.toLowerCase())) : data.rows) : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer…" className="h-8 px-3 rounded border text-sm flex-1 min-w-[180px]" />
        <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Refresh</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data?.rows?.length}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {data && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-6">
          <div><p className="text-xs text-muted-foreground">Total Outstanding</p><p className="text-xl font-bold text-amber-600">{fmt(data.total||0)}</p></div>
          <div><p className="text-xs text-muted-foreground">Customers</p><p className="text-xl font-bold">{data.count||0}</p></div>
        </div>
      )}
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : filtered.length===0 ? (
        <div className="py-12 text-center text-green-600 text-sm font-medium">🎉 No outstanding balances!</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Booking #</th>
                  <th className="px-4 py-2.5 text-left">Customer</th>
                  <th className="px-4 py-2.5 text-left">Mobile</th>
                  <th className="px-4 py-2.5 text-left">Group</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r: any) => (
                  <tr key={r.booking_id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono text-xs">{r.booking_number}</td>
                    <td className="px-4 py-2 font-medium text-xs">{r.customer_name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.mobile}</td>
                    <td className="px-4 py-2 text-xs">{r.group_name||"—"}</td>
                    <td className="px-4 py-2 text-right text-xs">{fmt(Number(r.total_amount))}</td>
                    <td className="px-4 py-2 text-right text-green-600 text-xs">{fmt(Number(r.paid_amount))}</td>
                    <td className="px-4 py-2 text-right font-bold text-amber-600">{fmt(Number(r.outstanding))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t">
                <tr>
                  <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">TOTAL ({filtered.length})</td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-600">{fmt(filtered.reduce((s:number,r:any)=>s+Number(r.outstanding||0),0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── P&L ─────────────────────────────────────────────────────────────────────
function ProfitLoss() {
  const fy = new Date().getFullYear() + "-04-01";
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/pl?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Profit & Loss Statement", `Period: ${data.period?.from} to ${data.period?.to}`],
      [],
      ["INCOME"],
      ["Sales Revenue", data.revenue?.total],
      [],
      ["EXPENSES"],
      ...(data.expenses?.byCategory||[]).map((c: any) => [CAT_LABELS[c.category]||c.category, c.total]),
      ["Total Expenses", data.expenses?.total],
      [],
      ["NET PROFIT / (LOSS)", data.netProfit],
    ]), "P&L");
    XLSX.writeFile(wb, `pl-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : !data ? null : (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-[#0d5040] text-white px-5 py-3 font-semibold text-sm">Profit & Loss Statement</div>
            <div className="px-5 py-4 space-y-4">
              {/* Revenue */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Income</p>
                <div className="flex justify-between py-1.5 border-b"><span className="text-sm">Sales Revenue ({data.revenue?.bookingCount} bookings)</span><span className="font-semibold text-green-600">{fmt(data.revenue?.total||0)}</span></div>
                <div className="flex justify-between py-1.5 font-bold"><span>Total Income</span><span className="text-green-600">{fmt(data.revenue?.total||0)}</span></div>
              </div>
              {/* Expenses */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Expenditure</p>
                {(data.expenses?.byCategory||[]).map((c: any) => (
                  <div key={c.category} className="flex justify-between py-1 border-b last:border-0 text-sm">
                    <span className="text-muted-foreground">{CAT_LABELS[c.category]||c.category}</span>
                    <span className="text-red-600">{fmt(Number(c.total))}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1.5 font-bold border-t mt-1"><span>Total Expenditure</span><span className="text-red-600">{fmt(data.expenses?.total||0)}</span></div>
              </div>
              {/* Net */}
              <div className={`flex justify-between py-3 px-4 rounded-lg font-bold text-lg ${data.netProfit>=0?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>
                <span>Net {data.netProfit>=0?"Profit":"Loss"}</span>
                <span>{data.netProfit>=0?"":"-"}{fmt(Math.abs(data.netProfit||0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BALANCE SHEET ────────────────────────────────────────────────────────────
function BalanceSheet() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0,10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/balance-sheet?asOf=${asOf}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-sm text-muted-foreground">As of:</span>
        <Input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="h-8 text-sm w-40" />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : !data ? null : (
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-green-600 text-white px-4 py-2.5 font-semibold text-sm">Assets</div>
            <div className="px-4 py-3 space-y-2">
              <LineItem label="Cash in Hand" value={fmt(data.assets?.cash||0)} />
              <LineItem label="Bank Balance" value={fmt(data.assets?.bank||0)} />
              <LineItem label="Accounts Receivable (Outstanding)" value={fmt(data.assets?.accountsReceivable||0)} />
              <div className="border-t pt-2 mt-2 flex justify-between font-bold"><span>Total Assets</span><span>{fmt(data.assets?.total||0)}</span></div>
            </div>
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-red-600 text-white px-4 py-2.5 font-semibold text-sm">Liabilities & Equity</div>
            <div className="px-4 py-3 space-y-2">
              <LineItem label="Expenses Paid" value={fmt(data.liabilities?.expensesPaid||0)} />
              <div className="border-t pt-2 mt-2"><LineItem label="Total Liabilities" value={fmt(data.liabilities?.total||0)} /></div>
              <div className="border-t pt-2 mt-2"><LineItem label="Equity (Net Worth)" value={fmt(data.equity||0)} bold valueClass={data.equity>=0?"text-green-600":"text-red-600"} /></div>
              <div className="border-t pt-2 mt-2 flex justify-between font-bold"><span>Total L + E</span><span>{fmt((data.liabilities?.total||0)+(data.equity||0))}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineItem({ label, value, bold = false, valueClass = "" }: any) {
  return (
    <div className={`flex justify-between text-sm ${bold?"font-bold":"text-muted-foreground"}`}>
      <span>{label}</span><span className={valueClass}>{value}</span>
    </div>
  );
}

// ── TRIAL BALANCE ────────────────────────────────────────────────────────────
function TrialBalance() {
  const fy = new Date().getFullYear() + "-04-01";
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/accounting/trial-balance?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) setErr(`Error ${r.status}`);
      else setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function exportExcel() {
    if (!data) return;
    const ws = XLSX.utils.json_to_sheet((data.entries||[]).map((e: any) => ({
      Account: e.account, "Debit (Dr)": e.debit||0, "Credit (Cr)": e.credit||0,
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `trial-balance-${from}-${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={`mr-1 ${loading?"animate-spin":""}`} />Load</Button>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data}><Download size={14} className="mr-1" />Excel</Button>
      </div>
      {loading ? <Loading /> : err ? <ErrMsg msg={err} /> : !data ? null : (
        <div className="max-w-2xl space-y-3">
          {data.totals?.balanced ? (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-green-700 text-sm font-medium">✅ Trial Balance is balanced</div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm font-medium">⚠️ Imbalance detected</div>
          )}
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Account</th>
                  <th className="px-4 py-2.5 text-right">Debit (Dr)</th>
                  <th className="px-4 py-2.5 text-right">Credit (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.entries||[]).map((e: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 capitalize">{e.account}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{e.debit ? fmt(e.debit) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-semibold">{e.credit ? fmt(e.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 border-t font-bold">
                <tr>
                  <td className="px-4 py-2.5">TOTAL</td>
                  <td className="px-4 py-2.5 text-right">{fmt(data.totals?.debit||0)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{fmt(data.totals?.credit||0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AccountingDashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0d5040]">Accounting</h1>
          <p className="text-sm text-muted-foreground">Ledger, Cash Book, P&L, Balance Sheet and more</p>
        </div>

        {/* Tab navigation */}
        <div className="bg-white border rounded-xl p-1 flex gap-0.5 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tab===t.id ? "bg-[#0d5040] text-white" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview" && <Overview />}
        {tab === "ledger" && <Ledger />}
        {tab === "cashbook" && <BookView endpoint="cashbook" title="Cash Book" />}
        {tab === "bankbook" && <BookView endpoint="bankbook" title="Bank Book" />}
        {tab === "journal" && <Journal />}
        {tab === "payments" && <PaymentEntries />}
        {tab === "outstanding" && <Outstanding />}
        {tab === "pl" && <ProfitLoss />}
        {tab === "balance" && <BalanceSheet />}
        {tab === "trial" && <TrialBalance />}
      </div>
    </AdminLayout>
  );
}
