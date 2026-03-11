import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Phone, LogOut, User as UserIcon, Menu, Instagram, Facebook, Youtube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export function MainLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/packages", label: "Packages" },
    { href: "/ziyarat", label: "Ziyarat Tours" },
    { href: "/blog", label: "Blog" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-primary text-primary-foreground py-2 px-4 text-sm hidden md:flex justify-between items-center">
        <div className="container mx-auto flex justify-between items-center">
          <p className="opacity-90">Trusted Hajj, Umrah & Ziyarat Travel Services – 35+ Years Experience</p>
          <div className="flex items-center gap-4">
            <a href="tel:+919893225590" className="flex items-center gap-2 hover:text-accent transition-colors">
              <Phone size={14} /> +91 9893225590
            </a>
            <a href="tel:+919893989786" className="flex items-center gap-2 hover:text-accent transition-colors">
              <Phone size={14} /> +91 9893989786
            </a>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-border/50 shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Al Burhan" className="h-12 w-12 object-contain" />
            <span className="font-serif text-2xl font-bold text-primary">Al Burhan<span className="text-accent">.</span></span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-accent relative py-2 ${location === link.href ? 'text-accent' : 'text-foreground/80'}`}
              >
                {link.label}
                {location === link.href && (
                  <motion.div layoutId="nav-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link href={isAdmin ? "/admin/dashboard" : "/customer/dashboard"}>
                  <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary hover:text-white">
                    <UserIcon size={16} />
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => logout()} title="Logout">
                  <LogOut size={18} className="text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <Button className="bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20">
                  Sign In
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Toggle */}
          <button className="lg:hidden p-2 text-primary" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <Menu size={24} />
          </button>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-white border-b border-border overflow-hidden"
            >
              <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link 
                    key={link.href} 
                    href={link.href}
                    className="text-lg font-medium text-foreground py-2 border-b border-border/50"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                {isAuthenticated ? (
                  <div className="flex flex-col gap-2 pt-2">
                    <Link href={isAdmin ? "/admin/dashboard" : "/customer/dashboard"} onClick={() => setIsMobileMenuOpen(false)}>
                      <Button className="w-full justify-start gap-2 bg-primary text-white">
                        <UserIcon size={16} /> Dashboard
                      </Button>
                    </Link>
                    <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => { logout(); setIsMobileMenuOpen(false); }}>
                      <LogOut size={16} className="mr-2" /> Logout
                    </Button>
                  </div>
                ) : (
                  <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button className="w-full bg-primary text-white">Sign In</Button>
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground pt-16 pb-8 border-t-[4px] border-accent relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)`, backgroundSize: '400px' }} />
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-12">
            <div className="col-span-1 md:col-span-4">
              <Link href="/" className="flex items-center gap-3 mb-6">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Al Burhan" className="h-10 w-10 brightness-0 invert" />
                <span className="font-serif text-3xl font-bold text-white">Al Burhan<span className="text-accent">.</span></span>
              </Link>
              <p className="text-primary-foreground/70 max-w-md leading-relaxed mb-6">
                Guiding you on your sacred journey with 35+ years of trusted experience in providing premium Hajj, Umrah & Ziyarat services.
              </p>
            </div>
            <div className="col-span-1 md:col-span-3">
              <h4 className="font-serif text-xl mb-6 text-accent">Quick Links</h4>
              <ul className="space-y-3 text-primary-foreground/80">
                <li><Link href="/ziyarat" className="hover:text-accent transition-colors">Ziyarat Tours</Link></li>
                <li><Link href="/blog" className="hover:text-accent transition-colors">Blog</Link></li>
                <li><Link href="/about" className="hover:text-accent transition-colors">About Us</Link></li>
                <li><Link href="/contact" className="hover:text-accent transition-colors">Contact</Link></li>
                <li><Link href="/privacy" className="hover:text-accent transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-accent transition-colors">Terms & Conditions</Link></li>
                <li><Link href="/cancellation" className="hover:text-accent transition-colors">Cancellation Policy</Link></li>
                <li><Link href="/refund" className="hover:text-accent transition-colors">Refund Policy</Link></li>
              </ul>
            </div>
            <div className="col-span-1 md:col-span-3">
              <h4 className="font-serif text-xl mb-6 text-accent">Contact Info</h4>
              <ul className="space-y-3 text-primary-foreground/80">
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-1">📍</span> Mumbai, India
                </li>
                <li className="flex flex-col items-start gap-1">
                  <span className="flex items-center gap-3"><span className="text-accent">📞</span> +91 9893225590</span>
                  <span className="flex items-center gap-3 pl-8">+91 9893989786</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-1">✉️</span> info@alburhantravels.com
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-accent mt-1">🌐</span> www.alburhantravels.com
                </li>
              </ul>
            </div>
            <div className="col-span-1 md:col-span-2">
              <h4 className="font-serif text-xl mb-6 text-accent">Follow Us</h4>
              <div className="flex flex-col gap-4">
                <a href="https://wa.me/919893225590" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-primary-foreground/80 hover:text-accent transition-colors">
                  <Phone size={20} /> WhatsApp
                </a>
                <a href="https://instagram.com/alburhantours" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-primary-foreground/80 hover:text-accent transition-colors">
                  <Instagram size={20} /> Instagram
                </a>
                <a href="https://facebook.com/alburhantours" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-primary-foreground/80 hover:text-accent transition-colors">
                  <Facebook size={20} /> Facebook
                </a>
                <a href="https://youtube.com/@alburhantours" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-primary-foreground/80 hover:text-accent transition-colors">
                  <Youtube size={20} /> YouTube
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-center text-sm text-primary-foreground/50">
            <p>&copy; {new Date().getFullYear()} Al Burhan Tours & Travels. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a 
        href="https://wa.me/919893225590" 
        target="_blank" 
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-xl shadow-[#25D366]/30 hover:-translate-y-1 transition-all duration-300"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
      </a>
    </div>
  );
}
