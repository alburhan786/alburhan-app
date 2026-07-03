import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Home, Search, ChevronDown, ChevronRight, Users, Wallet, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

interface Family {
  familyId: string;
  groupId: string;
  groupName: string;
  headName: string;
  memberCount: number;
  memberNames: string[];
  totalAmount: number;
  totalPaid: number;
  balance: number;
}

interface Group {
  id: string;
  groupName: string;
}

export default function FamilyLedger() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  async function loadGroups() {
    try {
      const r = await fetch(`${API}/api/groups`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setGroups(Array.isArray(d) ? d : d.groups || []);
      }
    } catch {}
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (groupFilter) params.set("groupId", groupFilter);
      if (search) params.set("search", search);
      const r = await fetch(`${API}/api/admin/family-ledger?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load family ledger");
      setFamilies(await r.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { load(); }, [groupFilter]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  function toggle(id: string) {
    setExpanded(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const totalCollected = families.reduce((s, f) => s + f.totalPaid, 0);
  const totalPending = families.reduce((s, f) => s + f.balance, 0);
  const totalAmount = families.reduce((s, f) => s + f.totalAmount, 0);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040] flex items-center gap-2">
              <Home size={22} /> Family Ledger
            </h1>
            <p className="text-sm text-muted-foreground">Family-wise payment summary across all groups</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Families", value: families.length, icon: Users, color: "text-[#0d5040]", bg: "bg-[#0d5040]/10" },
            { label: "Total Collected", value: fmt(totalCollected), icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Pending Balance", value: fmt(totalPending), icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border text-sm bg-white min-w-[180px]"
          >
            <option value="">All Groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.groupName}</option>)}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by family head name…"
              className="pl-8 h-9"
            />
          </div>
          <Button type="submit" size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30] h-9">Search</Button>
        </form>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : families.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-2xl border">
            <Home size={36} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No families found</p>
            <p className="text-xs text-muted-foreground mt-1">Families are created when pilgrims share a Family ID in their group</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-hidden">
            {/* Table head */}
            <div className="grid grid-cols-[1fr_1fr_80px_100px_100px_100px] gap-x-4 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              <span>Family Head</span>
              <span>Group</span>
              <span className="text-center">Members</span>
              <span className="text-right">Total Amt</span>
              <span className="text-right">Paid</span>
              <span className="text-right">Balance</span>
            </div>

            {families.map(f => {
              const isExp = expanded.has(f.familyId);
              const pct = f.totalAmount > 0 ? Math.round((f.totalPaid / f.totalAmount) * 100) : 0;
              const cleared = f.balance <= 0;

              return (
                <div key={f.familyId} className="border-b last:border-b-0">
                  {/* Row */}
                  <div
                    className="grid grid-cols-[1fr_1fr_80px_100px_100px_100px] gap-x-4 px-4 py-3 items-center cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggle(f.familyId)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button className="shrink-0 text-muted-foreground">
                        {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{f.headName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">ID: {f.familyId}</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground truncate">{f.groupName}</span>
                    <div className="flex justify-center">
                      <Badge variant="outline" className="text-xs">
                        <Users size={10} className="mr-1" />{f.memberCount}
                      </Badge>
                    </div>
                    <span className="text-right text-sm font-mono">{fmt(f.totalAmount)}</span>
                    <span className="text-right text-sm font-mono text-emerald-700">{fmt(f.totalPaid)}</span>
                    <div className="text-right">
                      <span className={`text-sm font-bold font-mono ${cleared ? "text-emerald-600" : "text-red-600"}`}>
                        {cleared ? "✓ Cleared" : fmt(f.balance)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="px-4 pb-4 pt-2 bg-muted/20 border-t">
                      {/* Payment bar */}
                      {f.totalAmount > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Payment Progress</span>
                            <span className="font-semibold">{pct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Members list */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Family Members ({f.memberCount})</p>
                        <div className="flex flex-wrap gap-2">
                          {f.memberNames.map((name, i) => (
                            <span key={i} className="text-xs px-2.5 py-1 bg-white rounded-full border text-gray-700">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Finance summary */}
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-xs text-muted-foreground">Total Amount</p>
                          <p className="font-bold text-sm mt-0.5">{fmt(f.totalAmount)}</p>
                        </div>
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-xs text-muted-foreground">Amount Paid</p>
                          <p className="font-bold text-sm mt-0.5 text-emerald-700">{fmt(f.totalPaid)}</p>
                        </div>
                        <div className="bg-white rounded-xl border p-3 text-center">
                          <p className="text-xs text-muted-foreground">Balance Due</p>
                          <p className={`font-bold text-sm mt-0.5 ${cleared ? "text-emerald-600" : "text-red-600"}`}>
                            {cleared ? "Cleared" : fmt(f.balance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && families.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {families.length} families · Total: {fmt(totalAmount)} · Collected: {fmt(totalCollected)} · Pending: {fmt(totalPending)}
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
