import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useListPackages } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { MapPin, Calendar, Clock, ArrowRight } from "lucide-react";

export default function Home() {
  const { data: packages = [] } = useListPackages({ active: true });
  const featuredPackages = packages.slice(0, 3);

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        {/* landing page hero scenic mountain landscape */}
        <div className="absolute inset-0 bg-primary">
          <img 
            src="https://pixabay.com/get/g6735cbfacbb796055e554554eb8a6eb0a048a412ecc8bc49bd05d9226610968952a486d73ddd936ab4fe10a34cb42f700722f3a2f29c2a147d8ebd03f45421d9_1280.jpg" 
            alt="Kaaba Mecca" 
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/50 to-transparent" />
        </div>
        
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto"
          >
            <span className="inline-block py-1 px-3 rounded-full bg-accent/20 text-accent border border-accent/50 text-sm font-semibold tracking-widest uppercase mb-6 backdrop-blur-sm">
              Premium Hajj & Umrah Services
            </span>
            <h1 className="text-5xl md:text-7xl font-serif text-white font-bold leading-tight mb-6 text-shadow-lg">
              Embark on a Journey of <br/>
              <span className="gold-text-gradient">Faith & Devotion</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
              Experience unparalleled comfort and spiritual fulfillment with our meticulously crafted pilgrimage packages. Trusted for over 35 years.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/packages">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-8 py-6 rounded-full shadow-xl shadow-accent/20 hover:scale-105 transition-all">
                  View Packages
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-white/30 text-primary hover:bg-white/10 text-lg px-8 py-6 rounded-full backdrop-blur-sm text-white hover:text-white transition-all">
                  Contact Us
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
        
        {/* Decorative divider at bottom */}
        <div className="absolute bottom-0 left-0 right-0">
          <img src={`${import.meta.env.BASE_URL}images/gold-accent.png`} alt="Divider" className="w-full h-2 object-cover opacity-80" />
        </div>
      </section>

      {/* Featured Packages Section */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-bold text-primary mb-4">Featured Packages</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Select from our most requested spiritual journeys, completely organized for your peace of mind.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredPackages.map((pkg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                key={pkg.id} 
                className="bg-card rounded-2xl overflow-hidden shadow-lg shadow-black/5 border border-border/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="relative h-56 overflow-hidden">
                  <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-primary uppercase tracking-wider shadow-sm">
                    {pkg.type.replace('_', ' ')}
                  </div>
                  {/* stock image generic mosque architecture */}
                  <img 
                    src={pkg.imageUrl || "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&q=80"} 
                    alt={pkg.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 text-white">
                    <h3 className="text-2xl font-serif font-bold">{pkg.name}</h3>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center gap-1"><Clock size={16} className="text-accent" /> {pkg.duration || '14 Days'}</span>
                    <span className="flex items-center gap-1"><MapPin size={16} className="text-accent" /> Makkah & Madinah</span>
                  </div>
                  <div className="mb-6">
                    <p className="text-3xl font-bold text-primary">{formatCurrency(pkg.pricePerPerson)}</p>
                    <p className="text-xs text-muted-foreground mt-1">per person (excl. {pkg.gstPercent}% GST)</p>
                  </div>
                  <Link href={`/packages/${pkg.id}`}>
                    <Button className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl py-6 font-semibold group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                      View Details <ArrowRight size={18} className="ml-2" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Link href="/packages">
              <Button variant="outline" size="lg" className="border-primary text-primary hover:bg-primary hover:text-white rounded-full px-8">
                View All Packages
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section className="py-24 relative overflow-hidden bg-primary text-white">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)`, backgroundSize: '400px' }} />
        <div className="container mx-auto px-4 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Why Choose Al Burhan?</h2>
            <p className="text-white/80 text-lg mb-8 leading-relaxed">With over three decades of organizing spiritual journeys, we ensure every aspect of your pilgrimage is handled with utmost care, respect, and professionalism.</p>
            <ul className="space-y-6">
              {[
                "35+ Years of Trusted Experience",
                "Premium Accommodation near Haram",
                "Dedicated Knowledgeable Guides (Aalims)",
                "Seamless Visa & Flight Processing"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4 text-lg">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent shrink-0">
                    ✓
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
             <div className="absolute -inset-4 bg-accent/20 blur-2xl rounded-full" />
             {/* decorative image showing beautiful islamic architecture */}
             <img src="https://pixabay.com/get/g4f9692cf559978449c5769bc1aa58ff37b61a59dc9b1ad941bbaa2ef3a52647778f02445b71f0c570d2353f63ab5c46b7c70c600399819ba0c78789ae46cb6ff_1280.jpg" alt="Experience" className="relative z-10 rounded-2xl border-4 border-accent/30 shadow-2xl" />
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
