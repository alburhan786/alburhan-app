import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Star, ArrowRight, Loader2, Clock, Zap, BookOpen, User, FileText, Receipt, X } from "lucide-react";
import { ALL_MODULES, SECTION_COLOR_MAP, type ModuleItem } from "@/config/modules";

const BASE_API = import.meta.env.VITE_API_URL || "";

const LS_RECENT   = "cp-recent-searches";
const LS_FAVS     = "cp-favourites";
const LS_COUNTS   = "cp-click-counts";
const MAX_RECENT  = 10;
const MAX_FREQ    = 5;

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; }
  catch { return fallback; }
}

function saveJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

interface DbResult {
  category: string;
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  raw: Record<string, unknown>;
}

const DB_CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; href: (r: DbResult) => string }> = {
  booking:   { label: "Booking",   icon: <BookOpen size={12} />,  href: (r) => `/admin/bookings?q=${r.raw.booking_number ?? ""}` },
  customer:  { label: "Customer",  icon: <User size={12} />,      href: () => `/admin/customers` },
  invoice:   { label: "Invoice",   icon: <Receipt size={12} />,   href: (r) => `/admin/invoices?q=${(r.raw.invoice_number as string) ?? r.id}` },
  agreement: { label: "Agreement", icon: <FileText size={12} />,  href: () => `/admin/agreements` },
  ticket:    { label: "Support",   icon: <FileText size={12} />,  href: () => `/admin/support` },
  pilgrim:   { label: "Pilgrim",   icon: <User size={12} />,      href: () => `/admin/pilgrim-reports` },
  flight:    { label: "Flight",    icon: <ArrowRight size={12} />,href: () => `/admin/flights` },
};

const PRIMARY_DB_ORDER = ["customer", "booking", "invoice"];
const SECONDARY_DB_ORDER = ["pilgrim", "agreement", "ticket", "flight"];

interface SelectableItem {
  type: "module" | "db";
  module?: ModuleItem;
  db?: DbResult;
  href: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const [query, setQuery]             = useState("");
  const [selectedIndex, setSelected]  = useState(0);
  const [dbResults, setDbResults]     = useState<DbResult[]>([]);
  const [dbLoading, setDbLoading]     = useState(false);
  const [recentSearches, setRecent]   = useState<string[]>(() => loadJSON(LS_RECENT, []));
  const [favourites, setFavourites]   = useState<Set<string>>(() => new Set(loadJSON<string[]>(LS_FAVS, [])));
  const [clickCounts, setCounts]      = useState<Record<string, number>>(() => loadJSON(LS_COUNTS, {}));

  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDbResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doDbSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setDbResults([]); return; }
    setDbLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/global-search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setDbResults(d.results || []); }
    } catch {}
    setDbLoading(false);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doDbSearch(q), 350);
  };

  const filteredModules: ModuleItem[] = query.trim().length === 0 ? [] : ALL_MODULES.filter(m => {
    const q = query.toLowerCase();
    return m.label.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.section.toLowerCase().includes(q);
  });

  const topFrequent: ModuleItem[] = query.trim().length === 0
    ? ALL_MODULES
        .filter(m => (clickCounts[m.href] ?? 0) > 0)
        .sort((a, b) => (clickCounts[b.href] ?? 0) - (clickCounts[a.href] ?? 0))
        .slice(0, MAX_FREQ)
    : [];

  const favModules: ModuleItem[] = query.trim().length === 0
    ? ALL_MODULES.filter(m => favourites.has(m.href))
    : [];

  const dbGrouped: Record<string, DbResult[]> = dbResults.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {} as Record<string, DbResult[]>);

  const knownOrder = [...PRIMARY_DB_ORDER, ...SECONDARY_DB_ORDER];
  const dbCategories = [
    ...PRIMARY_DB_ORDER.filter(c => dbGrouped[c]),
    ...SECONDARY_DB_ORDER.filter(c => dbGrouped[c]),
    ...Object.keys(dbGrouped).filter(c => !knownOrder.includes(c)),
  ];

  const allSelectable: SelectableItem[] = [
    ...topFrequent.map(m  => ({ type: "module" as const, module: m, href: m.href })),
    ...favModules.map(m   => ({ type: "module" as const, module: m, href: m.href })),
    ...filteredModules.map(m => ({ type: "module" as const, module: m, href: m.href })),
    ...dbCategories.flatMap(cat => (dbGrouped[cat] || []).map(r => ({ type: "db" as const, db: r, href: DB_CATEGORY_META[cat]?.href(r) ?? "#" }))),
  ];

  const navigateTo = useCallback((href: string, query?: string) => {
    if (query && query.trim()) {
      const next = [query, ...recentSearches.filter(s => s !== query)].slice(0, MAX_RECENT);
      setRecent(next);
      saveJSON(LS_RECENT, next);
    }
    const item = allSelectable.find(i => i.href === href);
    if (item?.module) {
      const newCounts = { ...clickCounts, [href]: (clickCounts[href] ?? 0) + 1 };
      setCounts(newCounts);
      saveJSON(LS_COUNTS, newCounts);
    }
    navigate(href);
    onClose();
  }, [recentSearches, clickCounts, allSelectable, navigate, onClose]);

  const toggleFav = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = new Set(favourites);
    if (next.has(href)) next.delete(href); else next.add(href);
    setFavourites(next);
    saveJSON(LS_FAVS, [...next]);
  }, [favourites]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(i => Math.min(i + 1, allSelectable.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = allSelectable[selectedIndex];
        if (item) navigateTo(item.href, query);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, allSelectable, selectedIndex, query, navigateTo, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let globalIdx = 0;
  const renderModuleRow = (m: ModuleItem, isFav: boolean) => {
    const idx = globalIdx++;
    const isSelected = idx === selectedIndex;
    const colorClass = SECTION_COLOR_MAP[m.sectionColor] ?? "bg-gray-100 text-gray-700";
    return (
      <button
        key={`${m.href}-${idx}`}
        data-idx={idx}
        onClick={() => navigateTo(m.href, query)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group ${isSelected ? "bg-primary/8 outline-none ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${colorClass}`}>
          {m.label[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{highlight(m.label, query)}</p>
          <p className="text-[11px] text-muted-foreground truncate">{highlight(m.desc, query)} · {m.section}</p>
        </div>
        <button
          onClick={(e) => toggleFav(e, m.href)}
          className={`p-1 rounded-md transition-colors flex-shrink-0 ${isFav || favourites.has(m.href) ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground/30 hover:text-yellow-400 opacity-0 group-hover:opacity-100"}`}
          title={favourites.has(m.href) ? "Remove from favourites" : "Add to favourites"}
        >
          <Star size={13} fill={favourites.has(m.href) ? "currentColor" : "none"} />
        </button>
        <ArrowRight size={13} className={`text-muted-foreground/40 flex-shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
      </button>
    );
  };

  const renderDbRow = (r: DbResult) => {
    const cat = r.category;
    const meta = DB_CATEGORY_META[cat] ?? { label: cat, icon: <Search size={12} />, href: () => "#" };
    const href = meta.href(r);
    const idx = globalIdx++;
    const isSelected = idx === selectedIndex;
    return (
      <button
        key={`db-${r.category}-${r.id}`}
        data-idx={idx}
        onClick={() => navigateTo(href, query)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group ${isSelected ? "bg-primary/8 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
      >
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{highlight(r.title, query)}</p>
          <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
        </div>
        {r.meta && <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded flex-shrink-0">{r.meta}</span>}
        <ArrowRight size={13} className={`text-muted-foreground/40 flex-shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
      </button>
    );
  };

  const SectionHeader = ({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) => (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-y border-border/50">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {count != null && <span className="ml-auto text-[10px] text-muted-foreground/50">{count}</span>}
    </div>
  );

  const isEmpty = query.trim().length === 0;
  const hasNoResults = !isEmpty && filteredModules.length === 0 && dbResults.length === 0 && !dbLoading;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-start sm:justify-center sm:pt-[8vh] sm:px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Palette — full-screen on mobile, centered modal on sm+ */}
      <div className="relative w-full sm:max-w-2xl bg-background sm:rounded-2xl shadow-2xl sm:border border-t border-border overflow-hidden flex flex-col h-[92vh] sm:h-auto sm:max-h-[75vh]">

        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border flex-shrink-0">
          <Search size={18} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Search modules, customers, bookings..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {dbLoading && <Loader2 size={16} className="animate-spin text-muted-foreground flex-shrink-0" />}
          {query && !dbLoading && (
            <button onClick={() => { setQuery(""); setDbResults([]); setSelected(0); inputRef.current?.focus(); }}
              className="text-muted-foreground/50 hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-muted rounded text-[10px] text-muted-foreground font-mono flex-shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">

          {/* Empty state — show frequents, favourites, recents */}
          {isEmpty && (
            <>
              {topFrequent.length > 0 && (
                <div>
                  <SectionHeader icon={<Zap size={11} />} label="Jump to" count={topFrequent.length} />
                  {topFrequent.map(m => renderModuleRow(m, false))}
                </div>
              )}

              {favModules.length > 0 && (
                <div>
                  <SectionHeader icon={<Star size={11} />} label="Favourites" count={favModules.length} />
                  {favModules.map(m => renderModuleRow(m, true))}
                </div>
              )}

              {recentSearches.length > 0 && (
                <div>
                  <SectionHeader icon={<Clock size={11} />} label="Recent Searches" />
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    {recentSearches.map(s => (
                      <button key={s} onClick={() => { setQuery(s); doDbSearch(s); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                        <Clock size={10} className="opacity-50" /> {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {topFrequent.length === 0 && favModules.length === 0 && recentSearches.length === 0 && (
                <div className="py-12 text-center">
                  <Search size={28} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Type to search modules, customers, bookings…</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Use ↑↓ to navigate · Enter to open · Esc to close</p>
                </div>
              )}
            </>
          )}

          {/* Query results */}
          {!isEmpty && filteredModules.length > 0 && (
            <div>
              <SectionHeader icon={<Search size={11} />} label="Modules" count={filteredModules.length} />
              {filteredModules.map(m => renderModuleRow(m, false))}
            </div>
          )}

          {!isEmpty && dbCategories.map(cat => {
            const catMeta = DB_CATEGORY_META[cat] ?? { label: cat, icon: <Search size={11} />, href: () => "#" };
            const catResults = dbGrouped[cat] || [];
            return (
              <div key={cat}>
                <SectionHeader icon={catMeta.icon} label={`${catMeta.label}s`} count={catResults.length} />
                {catResults.map(r => renderDbRow(r))}
              </div>
            );
          })}

          {hasNoResults && (
            <div className="py-12 text-center">
              <Search size={28} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No results for <span className="font-semibold">"{query}"</span></p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try a name, module, booking number, or mobile</p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 bg-muted/20 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1"><kbd className="bg-muted px-1 rounded text-[9px]">↑↓</kbd> navigate</span>
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1"><kbd className="bg-muted px-1 rounded text-[9px]">↵</kbd> open</span>
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1"><Star size={9} /> star to favourite</span>
          {!isEmpty && allSelectable.length > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground/50">{allSelectable.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}
