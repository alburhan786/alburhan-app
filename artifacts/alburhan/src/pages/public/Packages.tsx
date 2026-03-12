import { MainLayout } from "@/components/layout/MainLayout";
import { useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { Star, Search } from "lucide-react";
import { useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  umrah: "UMRAH 2026",
  ramadan_umrah: "RAMADAN UMRAH 2027",
  hajj: "HAJJ 2027",
  special_hajj: "SPECIAL HAJJ",
  iraq_ziyarat: "IRAQ ZIYARAT",
  baitul_muqaddas: "BAITUL MUQADDAS",
  syria_ziyarat: "SYRIA ZIYARAT",
  jordan_heritage: "JORDAN HERITAGE",
};

const CATEGORY_COLORS: Record<string, string> = {
  umrah: "#2563EB",
  ramadan_umrah: "#7C3AED",
  hajj: "#16A34A",
  special_hajj: "#059669",
  iraq_ziyarat: "#B45309",
  baitul_muqaddas: "#0E7490",
  syria_ziyarat: "#9D174D",
  jordan_heritage: "#B45309",
};

const CATEGORY_SUBTITLES: Record<string, string> = {
  umrah: "Umrah Packages",
  ramadan_umrah: "Ramadan Umrah Packages",
  hajj: "Al Burhan Hajj Premium Collection",
  special_hajj: "Special Hajj Packages",
  iraq_ziyarat: "Iraq Ziyarat Packages",
  baitul_muqaddas: "Baitul Muqaddas Packages",
  syria_ziyarat: "Syria Ziyarat Packages",
  jordan_heritage: "Jordan Heritage Packages",
};

const CATEGORY_NOTES: Record<string, string> = {
  hajj: "Departure: May 2027",
  ramadan_umrah: "Departure: Jan–Feb 2027",
};

const TYPE_DISPLAY: Record<string, string> = {
  umrah: "Premium Umrah",
  ramadan_umrah: "Ramadan Umrah",
  hajj: "Hajj Package",
  special_hajj: "Special Hajj Package",
  iraq_ziyarat: "Iraq Ziyarat",
  baitul_muqaddas: "Baitul Muqaddas",
  syria_ziyarat: "Syria Ziyarat",
  jordan_heritage: "Jordan Heritage",
};

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'umrah', label: 'Umrah' },
  { id: 'ramadan_umrah', label: 'Ramadan Umrah' },
  { id: 'hajj', label: 'Hajj 2027' },
  { id: 'iraq_ziyarat', label: 'Iraq Ziyarat' },
  { id: 'baitul_muqaddas', label: 'Baitul Muqaddas' },
  { id: 'syria_ziyarat', label: 'Syria Ziyarat' },
  { id: 'jordan_heritage', label: 'Jordan Heritage' },
];

export default function Packages() {
  const { data: packages = [], isLoading } = useListPackages({ active: true });
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = packages.filter(p => {
    const matchType = filter === 'all' || p.type === filter || (filter === 'hajj' && p.type.includes('hajj'));
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, pkg) => {
    const key = pkg.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(pkg);
    return acc;
  }, {});

  const categoryOrder = ['umrah', 'ramadan_umrah', 'hajj', 'special_hajj', 'iraq_ziyarat', 'baitul_muqaddas', 'syria_ziyarat', 'jordan_heritage'];
  const sortedKeys = Object.keys(grouped).sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

  return (
    <MainLayout>
      {/* App-style green header */}
      <div className="bg-primary px-4 pt-8 pb-6 text-center">
        <h1 className="text-2xl font-bold text-white tracking-wide">AL BURHAN</h1>
        <p className="text-accent text-sm font-medium">Tours & Travels</p>
        <p className="text-white/70 text-xs mt-1 italic">Your Journey to the Holy Lands</p>
      </div>

      <div className="px-4 py-4 bg-background min-h-screen">
        {/* Search bar — matches app */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wide shadow-sm"
            placeholder="Search packages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Type filter — horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                filter === tab.id
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-foreground border-border hover:border-primary/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-border shadow-sm">
            <Search className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-xl font-bold text-primary mb-2">No Packages Found</p>
            <p className="text-muted-foreground text-sm mb-6">Try a different search or filter.</p>
            <Button variant="outline" onClick={() => { setFilter('all'); setSearch(''); }}>View All</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedKeys.map(type => {
              const pkgs = grouped[type];
              const color = CATEGORY_COLORS[type] || '#2563EB';
              const label = CATEGORY_LABELS[type] || type.toUpperCase().replace('_', ' ');
              const subtitle = CATEGORY_SUBTITLES[type] || '';
              const note = CATEGORY_NOTES[type] || '';
              return (
                <div key={type}>
                  {/* Section header — matches app exactly */}
                  <div className="bg-white rounded-2xl px-4 py-3 mb-3 border border-border/50 shadow-sm flex items-start gap-3">
                    <div className="w-1 rounded-full self-stretch" style={{ backgroundColor: color, minHeight: 40 }} />
                    <div>
                      <span
                        className="inline-block px-3 py-1 rounded-full text-white text-xs font-bold mb-1"
                        style={{ backgroundColor: color }}
                      >
                        {label}
                      </span>
                      <p className="font-bold text-foreground text-sm">{subtitle}</p>
                      <p className="text-muted-foreground text-xs">{pkgs.length} package{pkgs.length !== 1 ? 's' : ''}{note ? ` · ${note}` : ''}</p>
                    </div>
                  </div>

                  {/* Package cards */}
                  <div className="space-y-3">
                    {pkgs.map(pkg => (
                      <div key={pkg.id} className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
                        <div className="p-4">
                          {/* Featured badge */}
                          {pkg.featured && (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-xs font-semibold mb-2" style={{ backgroundColor: 'hsl(33, 90%, 48%)' }}>
                              <Star size={10} fill="white" /> Featured
                            </div>
                          )}

                          {/* Title */}
                          <h3 className="font-bold text-foreground text-base leading-snug mb-0.5">{pkg.name}</h3>

                          {/* Category label — blue like app */}
                          <p className="text-xs font-semibold mb-2" style={{ color }}>
                            {TYPE_DISPLAY[pkg.type] || pkg.type.replace('_', ' ')}
                          </p>

                          {/* Description — 2 lines truncated */}
                          {pkg.description && (
                            <p className="text-muted-foreground text-xs leading-relaxed mb-3 line-clamp-2">{pkg.description}</p>
                          )}

                          {/* Duration + Departure — two columns */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <p className="text-muted-foreground text-xs mb-0.5">Duration</p>
                              <p className="font-semibold text-sm text-foreground">{pkg.duration || 'TBD'}</p>
                            </div>
                            {pkg.departureDates && pkg.departureDates.length > 0 && (
                              <div>
                                <p className="text-muted-foreground text-xs mb-0.5">Departure</p>
                                <p className="font-semibold text-sm text-foreground">{pkg.departureDates[0]}</p>
                              </div>
                            )}
                          </div>

                          {/* Divider */}
                          <div className="border-t border-border/50 pt-3 flex items-end justify-between">
                            <div>
                              <p className="text-muted-foreground text-xs mb-0.5">Starting from</p>
                              <p className="text-xl font-bold text-foreground">{formatCurrency(pkg.pricePerPerson)}</p>
                            </div>
                            <Link href={`/packages/${pkg.id}`}>
                              <button className="px-4 py-2 rounded-xl text-white text-sm font-semibold bg-primary hover:bg-primary/90 transition-colors">
                                View Details →
                              </button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
