import { MainLayout } from "@/components/layout/MainLayout";
import { motion } from "framer-motion";
import { HeartHandshake, ShieldCheck, Globe2, Clock, Plane, Hotel, FileText, Users } from "lucide-react";

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
              <h2 className="text-4xl font-serif font-bold text-primary mb-6">About Al Burhan Tours & Travels</h2>
              <div className="space-y-5 text-base text-muted-foreground leading-relaxed">
                <p>
                  <strong className="text-foreground">Al Burhan Tours & Travels</strong> is a trusted travel service provider based in Burhanpur, Madhya Pradesh, India. We specialize in organizing Hajj, Umrah, and Ziyarat pilgrimage tours for pilgrims across India. Our goal is to provide comfortable, reliable, and spiritually fulfilling travel experiences for our customers.
                </p>
                <p>
                  With years of experience in pilgrimage travel services, we offer complete assistance including visa processing, air ticketing, hotel accommodation, transportation, and guided religious tours in Saudi Arabia and other Islamic heritage destinations.
                </p>
                <p>
                  We also organize Ziyarat tours to historical and religious destinations including Iraq, Syria, Jordan, and Baitul Muqaddas (Jerusalem) where possible according to travel regulations.
                </p>
                <p>
                  Our dedicated team works closely with pilgrims to ensure smooth travel arrangements, quality services, and continuous support throughout the journey.
                </p>
              </div>

              <div className="mt-10 bg-muted/40 p-8 rounded-2xl border border-border/50">
                <h3 className="font-serif text-2xl text-primary font-bold mb-4">Company Details</h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="text-accent text-base mt-0.5">📍</span>
                    <span><strong>Address:</strong> 5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur, Madhya Pradesh – 450331, India</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-accent">📞</span>
                    <span><strong>Phone:</strong> +91 9893989786 / +91 8989701701 / +91 9893225590</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-accent">✉️</span>
                    <span><strong>Email:</strong> info@alburhantravels.com</span>
                  </li>
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

      {/* Our Services */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-serif font-bold text-primary mb-4">Our Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Comprehensive travel solutions for your sacred journey — from visa to accommodation and beyond.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: <Globe2 className="w-8 h-8 text-accent" />, title: "Hajj Packages" },
              { icon: <HeartHandshake className="w-8 h-8 text-accent" />, title: "Umrah Packages" },
              { icon: <Globe2 className="w-8 h-8 text-accent" />, title: "Ziyarat Tours" },
              { icon: <FileText className="w-8 h-8 text-accent" />, title: "Visa Assistance" },
              { icon: <Plane className="w-8 h-8 text-accent" />, title: "Air Ticket Booking" },
              { icon: <Hotel className="w-8 h-8 text-accent" />, title: "Hotel Accommodation" },
              { icon: <ShieldCheck className="w-8 h-8 text-accent" />, title: "Travel Insurance" },
              { icon: <Users className="w-8 h-8 text-accent" />, title: "Group Travel Management" },
            ].map((service, i) => (
              <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-border/50 text-center hover:shadow-md transition-shadow">
                <div className="bg-primary/5 w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4">
                  {service.icon}
                </div>
                <h3 className="text-sm font-semibold text-primary">{service.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-serif font-bold text-primary mb-4">Why Choose Us</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Clock className="w-10 h-10 text-accent" />, title: "35+ Years Experience", desc: "Decades of trusted pilgrimage travel services across India." },
              { icon: <ShieldCheck className="w-10 h-10 text-accent" />, title: "Complete Assistance", desc: "From visa processing to guided tours — we handle everything." },
              { icon: <HeartHandshake className="w-10 h-10 text-accent" />, title: "Dedicated Support", desc: "Our team is with you throughout the entire journey." },
              { icon: <Users className="w-10 h-10 text-accent" />, title: "Group Travel", desc: "Experienced group management for Hajj and Umrah groups." },
            ].map((feature, i) => (
              <div key={i} className="bg-muted/30 p-8 rounded-2xl border border-border/50 text-center hover:shadow-lg transition-shadow">
                <div className="bg-primary/5 w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-serif font-bold text-primary mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
