import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, PackageSearch, Users, BookOpen, MessageSquare, LogOut,
  ImageIcon, UsersRound, Receipt, ClipboardPlus, ScanLine, BarChart2,
  Printer, Menu, Megaphone, ShieldCheck, Inbox, PieChart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

interface MenuSection {
  section: string;
  items: MenuItem[];
}

const MENU: MenuSection[] = [
  {
    section: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
    ],
  },
  {
    section: "Bookings & Finance",
    items: [
      { icon: BookOpen, label: "Bookings", href: "/admin/bookings" },
      { icon: ClipboardPlus, label: "Offline Booking", href: "/admin/offline-bookings" },
      { icon: Receipt, label: "Invoices", href: "/admin/invoices" },
      { icon: PieChart, label: "Payment Analytics", href: "/admin/payment-analytics" },
    ],
  },
  {
    section: "Pilgrims & Groups",
    items: [
      { icon: UsersRound, label: "Hajj Groups", href: "/admin/groups" },
      { icon: ScanLine, label: "QR Tracker", href: "/admin/qr-tracker" },
      { icon: Printer, label: "Print Center", href: "/admin/print-center" },
    ],
  },
  {
    section: "Packages & Content",
    items: [
      { icon: PackageSearch, label: "Packages", href: "/admin/packages" },
      { icon: ImageIcon, label: "Gallery", href: "/admin/gallery" },
    ],
  },
  {
    section: "Customers & Reports",
    items: [
      { icon: Users, label: "Customers", href: "/admin/customers" },
      { icon: ShieldCheck, label: "KYC Management", href: "/admin/kyc" },
      { icon: Inbox, label: "Package Requests", href: "/admin/requests" },
      { icon: MessageSquare, label: "Inquiries", href: "/admin/inquiries" },
      { icon: Megaphone, label: "Broadcast Messages", href: "/admin/broadcast" },
      { icon: BarChart2, label: "Reports", href: "/admin/reports" },
    ],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-primary-foreground/10">
        <Link href="/" className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 brightness-0 invert" />
          <span className="font-serif font-bold text-lg text-white">Al Burhan<span className="text-accent">.</span></span>
        </Link>
        <div className="mt-1 text-[11px] text-primary-foreground/50 font-medium tracking-widest uppercase pl-11">Admin Portal</div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {MENU.map((section) => (
          <div key={section.section} className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/35 px-3 mb-1.5">{section.section}</p>
            {section.items.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                <span className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-sm mb-0.5 ${
                  isActive(item.href)
                    ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                    : "hover:bg-primary-foreground/10 text-primary-foreground/75 hover:text-white"
                }`}>
                  <item.icon size={17} />
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-primary-foreground/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm shrink-0">
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white truncate">{user?.name || "Administrator"}</span>
            <span className="text-[11px] text-primary-foreground/50 truncate">{user?.mobile}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-primary-foreground/60 hover:text-white hover:bg-primary-foreground/10 text-sm"
          onClick={() => logout()}
        >
          <LogOut size={16} className="mr-3" /> Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Desktop Sidebar */}
      <aside className="w-56 bg-primary text-primary-foreground flex-col hidden md:flex sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Overlay Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-primary text-primary-foreground flex flex-col h-full shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-border flex items-center px-4 md:hidden sticky top-0 z-40 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </Button>
          <span className="ml-3 font-serif font-bold text-base text-primary">Al Burhan Admin</span>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-muted-foreground">
              <LogOut size={16} />
            </Button>
          </div>
        </header>
        <div className="p-4 md:p-8 flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
