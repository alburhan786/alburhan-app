import { MainLayout } from "@/components/layout/MainLayout";
import { useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { Star, Search, Clock, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  umrah: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=800&q=80",
  ramadan_umrah: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=800&q=80",
  hajj: "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&q=80",
  special_hajj: "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&q=80",
  iraq_ziyarat: "https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=800&q=80",
  baitul_muqaddas: "https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80",
  syria_ziyarat: "https://images.unsplash.com/photo-1573608248547-9b94aa0d9fe1?w=800&q=80",
  jordan_heritage: "https://images.unsplash.com/photo-1579033461380-adb5e6e32b78?w=800&q=80",
};

function getPkgImgSrc(imageUrl: string | null | undefined, type: string): string {
  if (imageUrl) return imageUrl.startsWith('http') ? imageUrl : `${API_BASE}${imageUrl}`;
  return CATEGORY_FALLBACK_IMAGES[type] || "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=800&q=80";
}

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
  { id: 'all', label: 'All Packages' },
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
      <section className="relative bg-dark-green py-16 md:py-20 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)`, backgroundSize: '300px' }} />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="text-gold text-sm font-semibold uppercase tracking-widest">Al Burhan Tours & Travels</span>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mt-3 mb-4">Our Packages</h1>
            <p className="text-white/50 max-w-lg mx-auto">Browse our curated collection of Hajj, Umrah & Ziyarat packages designed for your spiritual journey.</p>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 min-h-screen">
        <div className="flex flex-col md:flex-row gap-4 mb-8 -mt-8 relative z-10">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-border bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-lg shadow-black/5 font-sans"
              placeholder="Search packages by name or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-none">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap border transition-all duration-200 ${
                filter === tab.id
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                  : 'bg-white text-foreground/70 border-border hover:border-primary/30 hover:text-primary'
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
            <p className="text-xl font-bold text-foreground mb-2">No Packages Found</p>
            <p className="text-muted-foreground text-sm mb-6">Try a different search or filter.</p>
            <Button variant="outline" onClick={() => { setFilter('all'); setSearch(''); }}>View All</Button>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedKeys.map(type => {
              const pkgs = grouped[type];
              const color = CATEGORY_COLORS[type] || '#2563EB';
              const label = CATEGORY_LABELS[type] || type.toUpperCase().replace('_', ' ');
              const subtitle = CATEGORY_SUBTITLES[type] || '';
              const note = CATEGORY_NOTES[type] || '';
              return (
                <motion.div
                  key={type}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-1.5 h-12 rounded-full" style={{ backgroundColor: color }} />
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-block px-3.5 py-1 rounded-lg text-white text-xs font-bold tracking-wide"
                          style={{ backgroundColor: color }}
                        >
                          {label}
                        </span>
                        <span className="text-muted-foreground text-xs">{pkgs.length} package{pkgs.length !== 1 ? 's' : ''}{note ? ` · ${note}` : ''}</span>
                      </div>
                      <p className="font-semibold text-foreground text-sm mt-1">{subtitle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {pkgs.map((pkg, idx) => (
                      <motion.div
                        key={pkg.id}
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <Link href={`/packages/${pkg.id}`}>
                          <div className="bg-white rounded-2xl border border-border/60 overflow-hidden hover:shadow-xl hover:shadow-black/[0.06] hover:-translate-y-1 transition-all duration-300 group cursor-pointer h-full flex flex-col">
                            <div className="relative h-44 overflow-hidden">
                              <img
                                src={getPkgImgSrc(pkg.imageUrl, pkg.type)}
                                alt={pkg.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                              {pkg.featured && (
                                <div className="absolute top-3 left-3">
                                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-xs font-semibold backdrop-blur-sm bg-amber-500/90 shadow">
                                    <Star size={9} fill="white" /> Featured
                                  </div>
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                                <span className="inline-block px-2.5 py-0.5 rounded text-white text-[10px] font-bold tracking-wide backdrop-blur-sm" style={{ backgroundColor: `${color}cc` }}>
                                  {TYPE_DISPLAY[pkg.type] || pkg.type.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                            <div className="p-5 flex-1 flex flex-col">
                              <h3 className="font-bold text-foreground text-base leading-snug mb-1 group-hover:text-primary transition-colors">{pkg.name}</h3>

                              <p className="text-xs font-semibold mb-3" style={{ color }}>
                                {TYPE_DISPLAY[pkg.type] || pkg.type.replace('_', ' ')}
                              </p>

                              {pkg.description && (
                                <p className="text-muted-foreground text-xs leading-relaxed mb-4 line-clamp-2 flex-1">{pkg.description}</p>
                              )}

                              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                                {pkg.duration && (
                                  <span className="flex items-center gap-1"><Clock size={13} className="text-accent" /> {pkg.duration}</span>
                                )}
                                {pkg.departureDates && pkg.departureDates.length > 0 && (
                                  <span className="flex items-center gap-1"><MapPin size={13} className="text-accent" /> {pkg.departureDates[0]}</span>
                                )}
                              </div>

                              <div className="border-t border-border/50 pt-4 flex items-end justify-between mt-auto">
                                <div>
                                  <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Starting from</p>
                                  <p className="text-xl font-bold text-foreground">{formatCurrency(pkg.pricePerPerson)}</p>
                                </div>
                                <span className="text-primary text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                                  Details <ArrowRight size={14} />
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
