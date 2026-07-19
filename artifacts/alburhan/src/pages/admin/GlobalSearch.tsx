import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Search, BookOpen, FileText, Users, MessageSquare, Plane, Hotel, User, ArrowRight, Loader2 } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string; href: (r: any) => string }> = {
  booking: { label: "Booking", icon: <BookOpen size={13} />, color: "bg-blue-100 text-blue-700", href: (r) => `/admin/bookings?q=${r.booking_number}` },
  pilgrim: { label: "Pilgrim", icon: <Users size={13} />, color: "bg-violet-100 text-violet-700", href: (r) => `/admin/pilgrim-reports` },
  agreement: { label: "Agreement", icon: <FileText size={13} />, color: "bg-emerald-100 text-emerald-700", href: (r) => `/admin/agreements` },
  ticket: { label: "Support", icon: <MessageSquare size={13} />, color: "bg-amber-100 text-amber-700", href: (r) => `/admin/support` },
  customer: { label: "Customer", icon: <User size={13} />, color: "bg-rose-100 text-rose-700", href: (r) => `/admin/customers` },
  flight: { label: "Flight", icon: <Plane size={13} />, color: "bg-sky-100 text-sky-700", href: (r) => `/admin/flights` },
};

interface SearchResult {
  category: string;
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  raw: any;
}

function ResultGroup({ category, results }: { category: string; results: SearchResult[] }) {
  const meta = CATEGORY_META[category] || { label: category, icon: <Search size={13} />, color: "bg-muted text-muted-foreground", href: () => "#" };
  return (
    <div className="space-y-1">
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider ${meta.color}`}>
        {meta.icon} {meta.label} ({results.length})
      </div>
      <div className="rounded-2xl border overflow-hidden">
        {results.map((r, i) => (
          <a key={i} href={meta.href(r.raw)}
            className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors group">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
              {meta.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{r.title}</p>
              <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
            </div>
            {r.meta && <span className="text-xs font-mono bg-muted/50 px-2 py-1 rounded-lg flex-shrink-0">{r.meta}</span>}
            <ArrowRight size={14} className="text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/global-search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setResults(d.results || []);
        setTotal(d.total || 0);
        setSearched(true);
      }
    } catch {}
    setLoading(false);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") doSearch(query); };

  // Group by category
  const grouped = results.reduce((acc: Record<string, SearchResult[]>, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const categoryOrder = ["booking", "pilgrim", "customer", "agreement", "ticket", "flight"];
  const sortedCategories = [
    ...categoryOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)),
  ];

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Search size={18} className="text-primary" />
            </div>
            Global Search
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Search across bookings, pilgrims, agreements, tickets, flights and customers</p>
        </div>

        {/* Search box */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input ref={inputRef} type="text" value={query} onChange={handleInput} onKeyDown={handleKey}
            placeholder="Search by name, mobile, booking ID, passport, visa, PNR, ticket…"
            className="w-full h-12 pl-11 pr-12 rounded-2xl border-2 border-primary/20 bg-background text-sm focus:outline-none focus:border-primary transition-colors"
          />
          {loading && <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
        </div>

        {/* Hint chips */}
        {!searched && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Search examples</p>
            <div className="flex flex-wrap gap-2">
              {["ABT-2024-001", "Mohammed Ali", "9876543210", "T-2025-101", "A-2024-001", "6E-123"].map(ex => (
                <button key={ex} onClick={() => { setQuery(ex); doSearch(ex); }}
                  className="px-3 py-1.5 rounded-xl border text-xs font-mono hover:bg-muted/50 transition-colors text-muted-foreground">
                  {ex}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {Object.entries(CATEGORY_META).map(([key, m]) => (
                <div key={key} className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-xs font-semibold ${m.color}`}>
                  {m.icon} {m.label}s
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {searched && !loading && results.length === 0 && (
          <div className="rounded-2xl border p-10 text-center">
            <Search size={32} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">No results for "{query}"</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term — name, phone, booking number, passport</p>
          </div>
        )}

        {searched && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Found <span className="font-bold text-foreground">{total}</span> results for "{query}"</p>
            {sortedCategories.map(cat => (
              <ResultGroup key={cat} category={cat} results={grouped[cat]} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
