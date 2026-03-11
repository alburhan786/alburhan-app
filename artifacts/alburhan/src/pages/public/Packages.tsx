import { MainLayout } from "@/components/layout/MainLayout";
import { useListPackages } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { Calendar, Clock, MapPin, Search } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Packages() {
  const { data: packages = [], isLoading } = useListPackages({ active: true });
  const [filter, setFilter] = useState<string>('all');

  const filterTabs = [
    { id: 'all', label: 'All Packages' },
    { id: 'umrah', label: 'Umrah' },
    { id: 'ramadan_umrah', label: 'Ramadan Umrah' },
    { id: 'hajj', label: 'Hajj 2027' },
    { id: 'iraq_ziyarat', label: 'Iraq Ziyarat' },
    { id: 'baitul_muqaddas', label: 'Baitul Muqaddas' },
    { id: 'syria_ziyarat', label: 'Syria Ziyarat' },
    { id: 'jordan_heritage', label: 'Jordan Heritage' }
  ];

  const filteredPackages = filter === 'all' 
    ? packages 
    : packages.filter(p => p.type.toLowerCase() === filter.replace('_', ' ').toLowerCase() || p.type === filter || (filter === 'hajj' && p.type.includes('hajj')));

  return (
    <MainLayout>
      <div className="bg-primary pt-20 pb-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4 relative z-10">Our Sacred Packages</h1>
        <p className="text-white/80 max-w-2xl mx-auto relative z-10">Carefully curated journeys tailored to provide spiritual peace and physical comfort.</p>
      </div>

      <div className="container mx-auto px-4 -mt-16 relative z-20 pb-24">
        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6 mb-12 flex flex-wrap gap-3 justify-center">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${filter === tab.id ? 'bg-primary text-white shadow-md' : 'bg-muted text-foreground hover:bg-primary/10 hover:text-primary'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredPackages.map((pkg, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  key={pkg.id}
                  layout
                >
                  <Card className="overflow-hidden h-full flex flex-col hover:shadow-2xl transition-shadow duration-300 border-border/50 group">
                    <div className="relative h-56 overflow-hidden">
                      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm uppercase">
                        {pkg.type.replace('_', ' ')}
                      </div>
                      {/* stock package visual */}
                      <img 
                        src={pkg.imageUrl || "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&q=80"} 
                        alt={pkg.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    </div>
                    <div className="p-6 flex flex-col flex-grow">
                      <h3 className="text-2xl font-serif font-bold text-primary mb-3">{pkg.name}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                        <span className="flex items-center gap-1.5"><Clock size={16} className="text-accent" /> {pkg.duration || 'TBD'}</span>
                        {pkg.departureDates && pkg.departureDates.length > 0 && (
                          <span className="flex items-center gap-1.5"><Calendar size={16} className="text-accent" /> {pkg.departureDates[0]}</span>
                        )}
                      </div>
                      <div className="mt-auto pt-6 border-t border-border/50">
                        <div className="flex items-end justify-between mb-6">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Starting from</p>
                            <p className="text-2xl font-bold text-foreground">{formatCurrency(pkg.pricePerPerson)}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            + {pkg.gstPercent}% GST
                          </div>
                        </div>
                        <Link href={`/packages/${pkg.id}`} className="block">
                          <Button className="w-full bg-primary-foreground text-primary border border-primary hover:bg-primary hover:text-white transition-colors">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredPackages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="col-span-full text-center py-24 bg-white rounded-2xl border border-border/50 text-muted-foreground shadow-sm"
              >
                <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-2xl font-serif font-bold text-primary mb-2">No Packages Found</p>
                <p>We couldn't find any packages matching this category currently.</p>
                <Button variant="outline" className="mt-6" onClick={() => setFilter('all')}>View All Packages</Button>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
