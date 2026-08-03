/**
 * CustomerPortalLayout — Shared shell for Customer Portal 2.0
 *
 * Desktop  (≥768px): sticky top-bar + fixed sidebar
 * Mobile   (<768px):  sticky top-bar + bottom navigation
 */

import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Home, User, FileText, CreditCard, Plane, Hotel, Bed, Bus,
  MessageSquare, Bell, BookOpen, Phone, LogOut, Menu, X,
  ChevronRight, Shield, Map, ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL || "";

// ─── Navigation config ────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  mobileShow?: boolean; // show in bottom nav (max 5)
}

function buildNav(bookingNumber?: string | null): NavItem[] {
  const base = bookingNumber ? `/customer/booking/${bookingNumber}` : null;
  return [
    { href: "/customer/overview",              label: "Overview",       icon: Home,         mobileShow: true },
    { href: "/customer/profile",               label: "My Profile",     icon: User,         mobileShow: false },
    ...(base ? [
      { href: `${base}`,                       label: "Booking",        icon: ClipboardList, mobileShow: false },
      { href: `${base}/timeline`,              label: "Journey",        icon: Map,          mobileShow: true },
      { href: `${base}/payments`,              label: "Payments",       icon: CreditCard,   mobileShow: true },
      { href: `${base}/invoices`,              label: "Invoices",       icon: FileText,     mobileShow: false },
      { href: `${base}/agreement`,             label: "Agreement",      icon: Shield,       mobileShow: false },
      { href: `${base}/documents`,             label: "Documents",      icon: BookOpen,     mobileShow: false },
      { href: `${base}/flights-hotels`,        label: "Flight & Hotel", icon: Plane,        mobileShow: false },
      { href: `${base}/room-bus`,              label: "Room & Bus",     icon: Bed,          mobileShow: false },
      { href: `${base}/communications`,        label: "Messages",       icon: MessageSquare, mobileShow: false },
    ] : [
      { href: "/customer/my-booking",          label: "My Booking",     icon: ClipboardList, mobileShow: false },
    ]),
    { href: "/customer/notifications",         label: "Notifications",  icon: Bell,         mobileShow: true },
    { href: "/customer/resources",             label: "Resources",      icon: BookOpen,     mobileShow: false },
    { href: "/customer/emergency",             label: "Emergency",      icon: Phone,        mobileShow: true },
    { href: "/customer/support",               label: "Support",        icon: MessageSquare, mobileShow: false },
  ];
}

// ─── Unread notification badge hook ──────────────────────────────────────────

function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`${API}/api/customer/overview`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setCount(d.unreadCount ?? 0);
      } catch {}
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return count;
}

// ─── Sidebar (desktop) ───────────────────────────────────────────────────────

function Sidebar({ navItems, unread }: { navItems: NavItem[]; unread: number }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { toast } = useToast();

  const isActive = (href: string) =>
    location === href || (href !== "/customer/overview" && location.startsWith(href));

  async function handleLogout() {
    try { await logout(); } catch {
      toast({ title: "Logged out", description: "See you soon!" });
    }
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 z-30">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}images/logo.png`}
          alt="Al Burhan" className="h-10 w-auto object-contain" />
        <div>
          <p className="text-xs text-slate-500 font-medium">Pilgrim Portal</p>
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">
            {user?.name?.split(" ")[0] ?? "Welcome"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-emerald-50 text-emerald-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}>
              <item.icon size={18} className={isActive(item.href) ? "text-emerald-600" : "text-slate-400"} />
              <span className="flex-1">{item.label}</span>
              {item.label === "Notifications" && unread > 0 && (
                <Badge className="bg-red-500 text-white text-xs h-5 min-w-[20px] flex items-center justify-center px-1">
                  {unread > 99 ? "99+" : unread}
                </Badge>
              )}
            </a>
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Top Bar (mobile + desktop) ───────────────────────────────────────────────

function TopBar({
  title, unread, mobileOpen, setMobileOpen
}: {
  title: string; unread: number; mobileOpen: boolean; setMobileOpen: (v: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 h-14 flex items-center gap-3 md:ml-64">
      {/* Mobile hamburger */}
      <button
        className="md:hidden p-1.5 text-slate-500 hover:text-slate-800"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <h1 className="flex-1 text-base font-semibold text-slate-800 truncate">{title}</h1>

      <Link href="/customer/notifications">
        <a className="relative p-1.5 text-slate-500 hover:text-slateald-800">
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </a>
      </Link>
    </header>
  );
}

// ─── Bottom Nav (mobile) ──────────────────────────────────────────────────────

function BottomNav({ navItems, unread }: { navItems: NavItem[]; unread: number }) {
  const [location] = useLocation();
  const mobileItems = navItems.filter(n => n.mobileShow).slice(0, 5);
  const isActive = (href: string) =>
    location === href || (href !== "/customer/overview" && location.startsWith(href));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200">
      <div className="flex">
        {mobileItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
              isActive(item.href) ? "text-emerald-600" : "text-slate-400"
            )}>
              <div className="relative">
                <item.icon size={22} />
                {item.label === "Notifications" && unread > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </a>
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

function MobileDrawer({
  open, onClose, navItems, unread
}: {
  open: boolean; onClose: () => void; navItems: NavItem[]; unread: number;
}) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const isActive = (href: string) =>
    location === href || (href !== "/customer/overview" && location.startsWith(href));

  // Close on route change
  useEffect(() => { onClose(); }, [location]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-72 bg-white h-full flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="font-semibold text-slate-800">Navigation</p>
          <button onClick={onClose}><X size={20} className="text-slate-500" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <a onClick={onClose} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              )}>
                <item.icon size={18} className={isActive(item.href) ? "text-emerald-600" : "text-slate-400"} />
                <span className="flex-1">{item.label}</span>
                {item.label === "Notifications" && unread > 0 && (
                  <Badge className="bg-red-500 text-white text-xs px-1">
                    {unread > 9 ? "9+" : unread}
                  </Badge>
                )}
              </a>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => { onClose(); logout(); }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-red-500 hover:bg-red-50"
          >
            <LogOut size={18} />Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Layout Export ───────────────────────────────────────────────────────

interface CustomerPortalLayoutProps {
  children: ReactNode;
  title?: string;
  /** If provided, booking-specific nav items will be shown */
  bookingNumber?: string | null;
}

export function CustomerPortalLayout({
  children, title = "My Portal", bookingNumber
}: CustomerPortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = useUnreadCount();
  const navItems = buildNav(bookingNumber);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar navItems={navItems} unread={unread} />
      <TopBar
        title={title}
        unread={unread}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navItems={navItems}
        unread={unread}
      />

      {/* Main content */}
      <main className="md:ml-64 pb-20 md:pb-8 min-h-[calc(100vh-56px)]">
        <div className="max-w-5xl mx-auto px-4 py-5">
          {children}
        </div>
      </main>

      <BottomNav navItems={navItems} unread={unread} />
    </div>
  );
}
