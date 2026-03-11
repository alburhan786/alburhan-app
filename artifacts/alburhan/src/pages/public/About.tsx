import { MainLayout } from "@/components/layout/MainLayout";
import { motion } from "framer-motion";
import { HeartHandshake, ShieldCheck, Globe2, Clock } from "lucide-react";

export default function About() {
  return (
    <MainLayout>
      {/* Hero */}
      <div className="relative h-[60vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-primary">
          <img 
            src="https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1600&q=80" 
            alt="About Al Burhan" 
            className="w-full h-full object-cover opacity-30 mix-blend-luminosity"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 to-primary/95" />
        
        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-serif font-bold text-white mb-6"
          >
            About <span className="text-accent">Al Burhan</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-xl text-white/90 leading-relaxed"
          >
            35+ Years of Guiding Sacred Journeys with Excellence and Devotion.
          </motion.p>
        </div>
      </div>

      {/* Main Content */}
      <section className="py-24 bg-white relative">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-serif font-bold text-primary mb-6">Our Legacy</h2>
              <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
                <p>
                  Established over three decades ago, <strong>Al Burhan Tours & Travels</strong> has been a trusted companion for thousands of pilgrims embarking on the most important journeys of their lives. 
                </p>
                <p>
                  Our mission is simple: to provide a spiritually enriching, comfortable, and seamless experience for those performing Hajj, Umrah, and Ziyarat. We understand the profound significance of these sacred travels, and we consider it a great honor to serve the guests of Allah.
                </p>
                <p>
                  With specialized packages, premium accommodations near the Haram, and expert religious guides (Aalims) accompanying our groups, we ensure that you can focus entirely on your worship and prayers while we handle the logistics.
                </p>
              </div>

              <div className="mt-10 bg-muted/40 p-8 rounded-2xl border border-border/50">
                <h3 className="font-serif text-2xl text-primary font-bold mb-4">Contact Information</h3>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3"><span className="text-accent">📞</span> <strong>Phone:</strong> +91 9893225590, +91 9893989786</li>
                  <li className="flex items-center gap-3"><span className="text-accent">✉️</span> <strong>Email:</strong> info@alburhantravels.com</li>
                  <li className="flex items-center gap-3"><span className="text-accent">🌐</span> <strong>Website:</strong> www.alburhantravels.com</li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <img src="https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=600&q=80" alt="Pilgrims" className="rounded-2xl shadow-xl w-full h-64 object-cover" />
              <img src="https://images.unsplash.com/photo-1598425237654-4c0536ee07af?w=600&q=80" alt="Mosque" className="rounded-2xl shadow-xl w-full h-64 object-cover mt-12" />
            </div>
          </div>
        </div>
      </section>

      {/* Services & Values */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-bold text-primary mb-4">Our Services & Values</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">We provide comprehensive travel solutions built on a foundation of trust and quality.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Globe2 className="w-10 h-10 text-accent" />, title: "Hajj & Umrah", desc: "Meticulously planned packages for the holy pilgrimage." },
              { icon: <HeartHandshake className="w-10 h-10 text-accent" />, title: "Ziyarat Tours", desc: "Spiritual journeys to Iraq, Syria, Jordan, and Jerusalem." },
              { icon: <ShieldCheck className="w-10 h-10 text-accent" />, title: "Trusted Service", desc: "Over 35 years of recognized excellence in the industry." },
              { icon: <Clock className="w-10 h-10 text-accent" />, title: "24/7 Support", desc: "Dedicated ground staff available around the clock." }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-border/50 text-center hover:shadow-lg transition-shadow">
                <div className="bg-primary/5 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-serif font-bold text-primary mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
