import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Phone, LogOut, User as UserIcon, Menu, X, Instagram, Facebook, Youtube, MapPin, Mail, Globe, Shield, Award, Clock, Home, Package, Compass, BookOpen, Info, MessageSquare, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MainLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/packages", label: "Packages", icon: Package },
    { href: "/ziyarat", label: "Ziyarat Tours", icon: Compass },
    { href: "/blog", label: "Blog", icon: BookOpen },
    { href: "/about", label: "About Us", icon: Info },
    { href: "/contact", label: "Contact", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="hidden md:block bg-deep-green text-white/80 py-2 px-4 text-xs">
        <div className="container mx-auto flex justify-between items-center">
          <p className="tracking-wide">Trusted Hajj, Umrah & Ziyarat Travel Services — 35+ Years Experience</p>
          <div className="flex items-center gap-5">
            <a href="tel:+918989701701" className="flex items-center gap-1.5 hover:text-gold transition-colors">
              <Phone size={12} /> +91 8989701701
            </a>
            <a href="tel:+919893989786" className="flex items-center gap-1.5 hover:text-gold transition-colors">
              <Phone size={12} /> +91 9893989786
            </a>
            <a href="mailto:info@alburhantravels.com" className="flex items-center gap-1.5 hover:text-gold transition-colors">
              <Mail size={12} /> info@alburhantravels.com
            </a>
          </div>
        </div>
      </div>

      <header className={`sticky top-0 z-50 transition-all duration-500 print:hidden ${isScrolled ? 'glass shadow-lg shadow-black/5 border-b border-white/20' : 'bg-white/95 backdrop-blur-sm'}`}>
        <div className="container mx-auto px-4 h-24 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Al Burhan Tours & Travels" className="h-16 w-auto object-contain group-hover:scale-105 transition-transform" />
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-lg ${location === link.href ? 'text-primary' : 'text-foreground/70 hover:text-primary hover:bg-primary/5'}`}
              >
                {link.label}
                {location === link.href && (
                  <motion.div layoutId="nav-underline" className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link href={isAdmin ? "/admin/dashboard" : "/customer/dashboard"}>
                  <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary hover:text-white rounded-lg">
                    <UserIcon size={15} />
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout" className="text-muted-foreground hover:text-destructive">
                  <LogOut size={16} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" className="text-foreground/70 hover:text-primary rounded-lg font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link href="/packages">
                  <Button className="gold-gradient text-dark-green hover:opacity-90 rounded-lg px-5 font-bold shadow-md shadow-gold/15">
                    Book Now
                  </Button>
                </Link>
              </div>
            )}
          </div>

          <button className="lg:hidden p-2 text-primary rounded-lg hover:bg-primary/5 transition-colors" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-white border-t border-border/50 overflow-hidden"
            >
              <div className="container mx-auto px-4 py-5 flex flex-col gap-1">
                {navLinks.map((link) => {
                  const IconComp = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors ${location === link.href ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'}`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <IconComp size={18} className="shrink-0" />
                      {link.label}
                    </Link>
                  );
                })}
                <div className="border-t border-border/50 mt-3 pt-3 space-y-2">
                  {isAuthenticated ? (
                    <>
                      <Link href={isAdmin ? "/admin/dashboard" : "/customer/dashboard"} onClick={() => setIsMobileMenuOpen(false)}>
                        <Button className="w-full justify-start gap-2 bg-primary text-white rounded-xl">
                          <UserIcon size={16} /> Dashboard
                        </Button>
                      </Link>
                      <Button variant="outline" className="w-full justify-start text-destructive rounded-xl" onClick={() => { logout(); setIsMobileMenuOpen(false); }}>
                        <LogOut size={16} className="mr-2" /> Logout
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant="outline" className="w-full rounded-xl">Sign In</Button>
                      </Link>
                      <Link href="/packages" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button className="w-full gold-gradient text-dark-green font-bold rounded-xl">Book Now</Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="relative overflow-hidden">
        <div className="bg-dark-green text-white relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)`, backgroundSize: '300px' }} />

          <div className="container mx-auto px-4 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 py-16">
              <div className="col-span-1 md:col-span-4">
                <Link href="/" className="inline-block mb-5">
                  <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Al Burhan Tours & Travels" className="h-14 w-auto object-contain brightness-0 invert" />
                </Link>
                <p className="text-white/50 max-w-sm leading-relaxed text-sm mb-6">
                  Guiding you on your sacred journey with 35+ years of trusted experience in providing premium Hajj, Umrah & Ziyarat services from Burhanpur, M.P., India.
                </p>
                <div className="flex gap-3">
                  {[
                    { icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>, href: "https://wa.me/918989701701", bg: "bg-[#25D366]" },
                    { icon: <Instagram size={16} />, href: "https://instagram.com/alburhantravels", bg: "bg-gradient-to-br from-purple-600 to-pink-500" },
                    { icon: <Facebook size={16} />, href: "https://facebook.com/alburhantravels", bg: "bg-[#1877F2]" },
                    { icon: <Youtube size={16} />, href: "https://youtube.com/@alburhantravels", bg: "bg-[#FF0000]" },
                  ].map((social, i) => (
                    <a key={i} href={social.href} target="_blank" rel="noreferrer" className={`w-9 h-9 rounded-lg ${social.bg} flex items-center justify-center text-white hover:scale-110 transition-transform shadow-lg`}>
                      {social.icon}
                    </a>
                  ))}
                </div>
              </div>

              <div className="col-span-1 md:col-span-2">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-gold mb-5">Quick Links</h4>
                <ul className="space-y-2.5">
                  {[
                    { href: "/packages", label: "All Packages" },
                    { href: "/ziyarat", label: "Ziyarat Tours" },
                    { href: "/blog", label: "Blog" },
                    { href: "/about", label: "About Us" },
                    { href: "/contact", label: "Contact" },
                  ].map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-white/50 hover:text-gold text-sm transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-1 md:col-span-2">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-gold mb-5">Legal</h4>
                <ul className="space-y-2.5">
                  {[
                    { href: "/privacy", label: "Privacy Policy" },
                    { href: "/terms", label: "Terms & Conditions" },
                    { href: "/cancellation", label: "Cancellation Policy" },
                    { href: "/refund", label: "Refund Policy" },
                  ].map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-white/50 hover:text-gold text-sm transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-1 md:col-span-4">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-gold mb-5">Get In Touch</h4>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-3 text-white/50 text-sm">
                    <MapPin size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>Burhanpur · Mumbai · Nanded · Parbhani · Jalgaon · Indore</span>
                  </li>
                  <li className="flex items-start gap-3 text-white/50 text-sm">
                    <Phone size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>+91 9893989786 / +91 8989701701</span>
                  </li>
                  <li className="flex items-start gap-3 text-white/50 text-sm">
                    <Mail size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>info@alburhantravels.com</span>
                  </li>
                  <li className="flex items-start gap-3 text-white/50 text-sm">
                    <Globe size={16} className="text-gold shrink-0 mt-0.5" />
                    <span>www.alburhantravels.com</span>
                  </li>
                </ul>
                <div>
                  <p className="text-white/60 text-xs mb-2 font-medium">Stay Updated</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      className="flex-1 px-4 py-2.5 rounded-lg bg-white/10 border border-white/15 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-gold/50"
                    />
                    <button className="px-4 py-2.5 rounded-lg gold-gradient text-dark-green text-sm font-bold hover:opacity-90 transition-opacity">
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#051A12] text-white">
          <div className="container mx-auto px-4 py-5">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
                {[
                  { icon: Shield, label: "Govt. Licensed" },
                  { icon: Award, label: "35+ Years Trusted" },
                  { icon: Clock, label: "24/7 Support" },
                ].map((badge, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/40 text-xs">
                    <badge.icon size={14} className="text-gold/60" />
                    <span>{badge.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-white/30 text-xs">&copy; {new Date().getFullYear()} Al Burhan Tours & Travels. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>

      <a
        href="https://wa.me/918989701701"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-3.5 rounded-2xl shadow-xl shadow-[#25D366]/30 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 group"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      </a>
    </div>
  );
}
