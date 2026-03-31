import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useListPackages } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { MapPin, Clock, ArrowRight, Star, Quote, Plane, Building2, Bot, BookOpen, Globe, Phone, MessageCircle, User, ClipboardList, ShieldCheck, Shield, Award, Users, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface BannerImage {
  id: string;
  title: string | null;
  fileUrl: string;
  sortOrder: number;
}

const DEFAULT_HERO_IMAGE = "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1600&q=80";

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 2000;
        const step = Math.ceil(target / (duration / 16));
        let current = 0;
        const timer = setInterval(() => {
          current = Math.min(current + step, target);
          setCount(current);
          if (current >= target) clearInterval(timer);
        }, 16);
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <div ref={ref}>{count.toLocaleString()}{suffix}</div>;
}

const testimonials = [
  { name: "Mohammed Aslam", city: "Mumbai", text: "Al Burhan Tours & Travels provided excellent service during our Umrah trip. Everything from visa processing to hotel arrangements was handled professionally.", rating: 5, initial: "MA" },
  { name: "Abdul Rahman", city: "Burhanpur", text: "Our Hajj journey was very well organized. The team supported us throughout the trip and made our pilgrimage comfortable.", rating: 5, initial: "AR" },
  { name: "Sajida Begum", city: "Hyderabad", text: "I highly recommend Al Burhan Tours & Travels. Their staff was helpful, and the travel arrangements were smooth and well planned.", rating: 5, initial: "SB" },
  { name: "Mohammed Imran", city: "Indore", text: "Very reliable travel agency for Umrah. The hotels and transportation were well arranged, and the guides were very supportive.", rating: 5, initial: "MI" },
];

const pilgrimVideos = [
  {
    id: "KCrjGKEa5xk",
    title: "Hajj – The Sacred Pilgrimage",
    desc: "Witness the spiritual journey of millions at the holy city of Mecca.",
    thumb: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=640&h=360&fit=crop&q=80",
  },
  {
    id: "gJFnWQUKVjo",
    title: "Umrah – A Journey of the Heart",
    desc: "Experience the serenity of performing Tawaf around the Kaaba.",
    thumb: "https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=640&h=360&fit=crop&q=80",
  },
  {
    id: "3FbcgAVE72E",
    title: "Madinah – City of the Prophet ﷺ",
    desc: "A peaceful visit to Masjid al-Nabawi and the blessed city of Madinah.",
    thumb: "https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=640&h=360&fit=crop&q=80",
  },
];

const faqs = [
  {
    q: "What services does Al Burhan Tours & Travels provide?",
    a: "We provide complete travel services including Hajj packages, Umrah packages, Ziyarat tours, visa processing, air ticket booking, hotel accommodation, and transportation services."
  },
  {
    q: "How can I book a Hajj or Umrah package?",
    a: "You can book your package by contacting our office directly, through WhatsApp, or by submitting a booking request on our website."
  },
  {
    q: "What documents are required for Umrah or Hajj travel?",
    a: "Generally required documents include a valid passport (minimum 6 months validity), passport size photographs, identity proof, vaccination certificate if required, and other documents depending on travel regulations. Our team will guide you through the full process."
  },
  {
    q: "Do you provide visa services?",
    a: "Yes, we assist customers with Umrah visa processing and travel documentation as part of our travel packages."
  },
  {
    q: "Do you arrange group travel for Hajj and Umrah?",
    a: "Yes, we organize group pilgrimages with experienced guides to ensure a comfortable and organized travel experience."
  },
  {
    q: "Can I pay in installments?",
    a: "In many cases, customers can pay in installments according to booking terms. Please contact our office for details."
  },
  {
    q: "Do you organize Ziyarat tours?",
    a: "Yes, we organize religious Ziyarat tours to historical Islamic sites including destinations in Saudi Arabia, Iraq, Jordan, and other locations depending on travel regulations."
  },
];

function PilgrimVideoCard({ video, index }: { video: typeof pilgrimVideos[0]; index: number }) {
  const [playing, setPlaying] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay: index * 0.12 }}
      className="rounded-2xl overflow-hidden shadow-xl border border-border/50 bg-white group"
    >
      <div className="relative aspect-video bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        ) : (
          <>
            <img src={video.thumb} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={`Play ${video.title}`}
            >
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-primary ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
          </>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-serif font-bold text-primary text-lg mb-1">{video.title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{video.desc}</p>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const { data: packages = [] } = useListPackages({ active: true });
  const featuredPackages = (() => {
    const f = packages.filter(p => p.featured);
    return (f.length > 0 ? f : packages).slice(0, 3);
  })();

  const [bannerImages, setBannerImages] = useState<BannerImage[]>([]);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/gallery/active`)
      .then(res => res.ok ? res.json() : [])
      .then(imgs => setBannerImages(imgs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (bannerImages.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentBannerIdx(prev => (prev + 1) % bannerImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [bannerImages.length]);

  const ziyaratTours = [
    { name: "Iraq Ziyarat", desc: "Najaf, Karbala, Kazmain, Samarra", icon: "🕌", color: "from-amber-700/85 to-amber-950/95", image: "https://images.unsplash.com/photo-1586348943529-beaae6c28db9?w=600&q=75" },
    { name: "Baitul Muqaddas", desc: "Spiritual journey to Jerusalem", icon: "✨", color: "from-cyan-700/85 to-cyan-950/95", image: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&q=75" },
    { name: "Syria Ziyarat", desc: "Sacred shrines in Damascus", icon: "🕋", color: "from-rose-700/85 to-rose-950/95", image: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=600&q=75" },
    { name: "Jordan Heritage", desc: "Islamic historical sites", icon: "🏛️", color: "from-emerald-700/85 to-emerald-950/95", image: "https://images.unsplash.com/photo-1553783742-79c41b53f2ea?w=600&q=75" }
  ];

  const quickNav = [
    { icon: Plane, label: "Hajj", href: "/packages", color: "bg-emerald-500" },
    { icon: Star, label: "Umrah", href: "/packages", color: "bg-amber-500" },
    { icon: Building2, label: "Hotels", href: "/hotels", color: "bg-purple-500" },
    { icon: Bot, label: "AI Help", href: "/ai-assistant", color: "bg-rose-500" },
    { icon: MessageCircle, label: "Chat", href: "/live-chat", color: "bg-green-500" },
    { icon: User, label: "Account", href: "/login", color: "bg-indigo-500" },
    { icon: ShieldCheck, label: "Admin", href: "/admin/dashboard", color: "bg-slate-600" },
    { icon: ClipboardList, label: "Book", href: "/packages", color: "bg-orange-500" },
    { icon: Globe, label: "Partner", href: "/login", color: "bg-cyan-500" },
    { icon: BookOpen, label: "My Trips", href: "/customer/dashboard", color: "bg-sky-500" },
  ];

  return (
    <MainLayout>
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-dark-green">
          <AnimatePresence mode="wait">
            <motion.img
              key={bannerImages.length > 0 ? bannerImages[currentBannerIdx]?.id : "default"}
              src={bannerImages.length > 0 ? `${API_BASE}${bannerImages[currentBannerIdx]?.fileUrl}` : DEFAULT_HERO_IMAGE}
              alt={bannerImages.length > 0 ? (bannerImages[currentBannerIdx]?.title || "Banner") : "Kaaba Mecca"}
              className="w-full h-full object-cover opacity-50"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 0.5, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-dark-green via-dark-green/70 to-dark-green/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-dark-green/50 to-transparent" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="inline-flex items-center gap-2 py-2 px-5 rounded-full bg-white/10 border border-white/20 text-sm font-medium tracking-wider uppercase mb-8 backdrop-blur-md text-white/90"
            >
              <Sparkles size={14} className="text-gold" />
              Premium Hajj & Umrah Services
            </motion.div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-white font-bold leading-[1.1] mb-8 text-shadow-hero">
              Your Sacred Journey{" "}
              <br className="hidden md:block" />
              <span className="gold-text">Begins Here</span>
            </h1>

            <p className="text-lg md:text-xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              Experience unparalleled comfort and spiritual fulfillment with our meticulously crafted pilgrimage packages. Trusted for over 35 years.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/packages">
                <Button size="lg" className="gold-gradient text-dark-green hover:opacity-90 text-base px-10 py-7 rounded-xl shadow-2xl shadow-gold/20 hover:scale-[1.03] transition-all font-bold tracking-wide">
                  Explore Packages
                  <ArrowRight size={18} className="ml-2" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 text-base px-10 py-7 rounded-xl backdrop-blur-sm transition-all font-medium">
                  Contact Us
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 hidden md:block"
        >
          <div className="glass-dark rounded-2xl px-10 py-5 border border-white/10 flex items-center gap-10">
            {[
              { value: 35, suffix: "+", label: "Years Experience" },
              { value: 10000, suffix: "+", label: "Happy Pilgrims" },
              { value: 100, suffix: "+", label: "Packages" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-bold text-gold">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-white/50 text-xs tracking-wide mt-1">{stat.label}</div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-2xl font-bold text-gold">5★</div>
              <div className="text-white/50 text-xs tracking-wide mt-1">Rating</div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="py-8 bg-white relative -mt-6 z-20 md:hidden">
        <div className="container mx-auto px-4">
          <div className="glass rounded-2xl shadow-xl border border-border/30 p-4 grid grid-cols-4 gap-6">
            {[
              { value: 35, suffix: "+", label: "Years" },
              { value: 10000, suffix: "+", label: "Pilgrims" },
              { value: 100, suffix: "+", label: "Packages" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-lg font-bold text-primary">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-muted-foreground text-[10px] tracking-wide">{stat.label}</div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-lg font-bold text-primary">5★</div>
              <div className="text-muted-foreground text-[10px] tracking-wide">Rating</div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none justify-center flex-wrap">
            {quickNav.map((item, i) => (
              <Link key={i} href={item.href}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-muted/50 hover:bg-muted border border-border/50 hover:border-primary/20 transition-all cursor-pointer group whitespace-nowrap"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color} text-white shadow-sm`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-primary transition-colors">{item.label}</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-gradient-to-b from-muted/30 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-accent font-semibold text-sm uppercase tracking-widest">Our Collection</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mt-3 mb-4">Featured Packages</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Curated spiritual journeys, organized for your peace of mind.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredPackages.map((pkg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                key={pkg.id}
                className="group relative bg-card rounded-2xl overflow-hidden shadow-lg shadow-black/[0.04] border border-border/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 transition-all duration-500"
              >
                <div className="relative h-60 overflow-hidden">
                  <img
                    src={pkg.imageUrl ? (pkg.imageUrl.startsWith('http') ? pkg.imageUrl : `${API_BASE}${pkg.imageUrl}`) : "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&q=80"}
                    alt={pkg.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute top-4 left-4">
                    <span className="inline-block px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-xs font-bold text-primary uppercase tracking-wider shadow-sm">
                      {pkg.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-2xl font-serif font-bold text-white drop-shadow-lg">{pkg.name}</h3>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
                    <span className="flex items-center gap-1.5"><Clock size={15} className="text-accent" /> {pkg.duration || '14 Days'}</span>
                    <span className="flex items-center gap-1.5"><MapPin size={15} className="text-accent" /> Makkah & Madinah</span>
                  </div>
                  <div className="flex items-end justify-between mb-5">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Starting from</p>
                      <p className="text-3xl font-bold text-primary">{formatCurrency(pkg.pricePerPerson)}</p>
                      <p className="text-xs text-muted-foreground">per person + {pkg.gstPercent}% GST</p>
                    </div>
                  </div>
                  <Link href={`/packages/${pkg.id}`}>
                    <Button className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl py-6 font-semibold group-hover:bg-dark-green transition-colors">
                      View Details <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link href="/packages">
              <Button variant="outline" size="lg" className="border-primary/30 text-primary hover:bg-primary hover:text-white rounded-xl px-10 font-semibold">
                View All Packages <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 relative bg-white overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-accent font-semibold text-sm uppercase tracking-widest">Explore Destinations</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mt-3 mb-4">Ziyarat Tours</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Discover the rich Islamic heritage and sacred sites across the Middle East.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ziyaratTours.map((tour, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                key={tour.name}
              >
                <Link href="/ziyarat">
                  <div className="group relative rounded-2xl overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
                    <img
                      src={tour.image}
                      alt={tour.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-br ${tour.color}`} />
                    <div className="relative z-10 p-8 text-white">
                      <div className="text-5xl mb-5 group-hover:scale-110 transition-transform duration-300">{tour.icon}</div>
                      <h3 className="text-xl font-serif font-bold mb-2">{tour.name}</h3>
                      <p className="text-white/70 text-sm mb-4">{tour.desc}</p>
                      <span className="inline-flex items-center text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                        Explore <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 relative overflow-hidden bg-dark-green text-white">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)`, backgroundSize: '300px' }} />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-gold font-semibold text-sm uppercase tracking-widest">Our Promise</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold mt-3 mb-4">Why Choose Al Burhan?</h2>
              <p className="text-white/50 max-w-xl mx-auto">Decades of trust and commitment to providing the ultimate spiritual journey.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Award, title: "35+ Years", desc: "Trusted legacy in Hajj & Umrah travel", value: 35, suffix: "+" },
              { icon: Users, title: "10,000+ Pilgrims", desc: "Successfully guided on sacred journeys", value: 10000, suffix: "+" },
              { icon: Star, title: "Expert Guides", desc: "Knowledgeable Aalims & scholars", value: 50, suffix: "+" },
              { icon: Shield, title: "24/7 Support", desc: "Always here for you, anywhere", value: 24, suffix: "/7" }
            ].map((point, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                key={i}
                className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-7 text-center border border-white/10 hover:bg-white/[0.1] hover:border-gold/30 transition-all duration-300 group"
              >
                <div className="w-14 h-14 rounded-xl bg-gold/20 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                  <point.icon className="text-gold" size={26} />
                </div>
                <div className="text-3xl font-bold text-gold mb-2">
                  <AnimatedCounter target={point.value} suffix={point.suffix} />
                </div>
                <h4 className="text-base font-bold text-white mb-1">{point.title}</h4>
                <p className="text-white/40 text-sm">{point.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-gradient-to-b from-white to-muted/30 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-accent font-semibold text-sm uppercase tracking-widest">Testimonials</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mt-3 mb-4">What Our Pilgrims Say</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Real experiences from those who traveled with us.</p>
            </motion.div>
          </div>
        </div>

        <div className="relative w-full overflow-hidden">
          <div className="flex gap-6 animate-marquee">
            {[...testimonials, ...testimonials].map((testimonial, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-7 shadow-lg shadow-black/[0.03] border border-border/50 relative min-w-[340px] max-w-[340px] shrink-0"
              >
                <Quote className="absolute top-5 right-5 text-primary/[0.06] w-12 h-12" />
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-5 italic leading-relaxed text-sm">"{testimonial.text}"</p>
                <div className="flex items-center gap-3 border-t border-border/50 pt-4">
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-accent/30 shrink-0 bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {testimonial.initial}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-sm">{testimonial.name}</div>
                    <div className="text-xs text-muted-foreground">{testimonial.city} · Verified Pilgrim</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilgrim Moments – Video Gallery */}
      <section className="py-24 bg-primary/[0.03]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-accent font-semibold text-sm uppercase tracking-widest">Pilgrim Moments</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mt-3 mb-4">Watch & Inspire</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Sacred sights from Mecca, Madinah, and beyond — glimpses of the journey that awaits you.</p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pilgrimVideos.map((video, i) => (
              <PilgrimVideoCard key={i} video={video} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-16">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-accent font-semibold text-sm uppercase tracking-widest">FAQs</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mt-3 mb-4">Frequently Asked Questions</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Everything you need to know before booking your sacred journey.</p>
            </motion.div>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="bg-muted/40 rounded-2xl border border-border/50 overflow-hidden"
              >
                <details className="group">
                  <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none">
                    <span className="font-semibold text-foreground text-sm md:text-base">{faq.q}</span>
                    <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary group-open:rotate-180 transition-transform duration-200 font-bold text-lg">+</span>
                  </summary>
                  <div className="px-6 pb-5 text-muted-foreground text-sm leading-relaxed border-t border-border/40 pt-4">
                    {faq.a}
                  </div>
                </details>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#25D366] to-[#128C7E]" />
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')]" />
        <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-white text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-3">Have Questions About Your Journey?</h2>
            <p className="text-white/80 text-lg max-w-lg">Message us directly on WhatsApp for instant support and booking inquiries.</p>
          </div>
          <a href="https://wa.me/918989701701" target="_blank" rel="noreferrer">
            <Button size="lg" className="bg-white text-[#25D366] hover:bg-white/95 rounded-xl px-10 py-7 text-lg font-bold shadow-2xl hover:scale-[1.03] transition-all">
              Chat on WhatsApp
            </Button>
          </a>
        </div>
      </section>
    </MainLayout>
  );
}
