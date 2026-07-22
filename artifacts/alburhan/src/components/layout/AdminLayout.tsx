/**
 * AdminLayout — shell only.
 *
 * Navigation data lives in src/config/navigation.ts.
 * To add/remove sidebar items, edit ONLY that file.
 * This file must never define its own menu arrays.
 */
import { ReactNode, useEffect, useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Menu, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { BookingNotificationPopup } from "@/components/admin/BookingNotificationPopup";
import { buildNavSections } from "@/config/navigation";

const API = import.meta.env.VITE_API_URL || "";
const STORAGE_KEY = "ab-sidebar-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openComplaints, setOpenComplaints] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const { can, roleLabel, roleColor, isSuper } = usePermissions();

  const {
    notifications, unreadCount, popupNotif, dismissPopup,
    markRead, markAllRead, deleteNotification,
  } = useAdminNotifications(isAdmin);

  useEffect(() => {
    fetch(`${API}/api/feedback/admin/stats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.openComplaints) setOpenComplaints(Number(data.openComplaints)); })
      .catch(() => {});
  }, []);

  // ── Build filtered menu ─────────────────────────────────────────────────
  const MENU = useMemo(() => {
    return buildNavSections(openComplaints)
      .map(section => ({
        ...section,
        items: section.items.filter(item => {
          if (item.requireSuper && !isSuper) return false;
          if (item.require && !can(item.require[0], item.require[1])) return false;
          return true;
        }),
      }))
      .filter(section => section.items.length > 0);
  }, [openComplaints, can, isSuper]);

  const isActive = (href: string) => {
    const base = href.split("?")[0];
    return location === base || location.startsWith(base + "/");
  };

  // ── Auto-expand the section containing the current page ────────────────
  useEffect(() => {
    const active = MENU.find(s => s.items.some(i => isActive(i.href)));
    if (!active) return;
    setCollapsed(prev => {
      if (!prev[active.section]) return prev; // already open
      const next = { ...prev, [active.section]: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [location]);

  const toggleSection = useCallback((section: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Sidebar body ────────────────────────────────────────────────────────
  const SidebarNav = () => (
    <nav className="flex-1 px-2 py-3 overflow-y-auto">
      {MENU.map((section) => {
        const isOpen = !collapsed[section.section];
        const hasActive = section.items.some(i => isActive(i.href));
        return (
          <div key={section.section} className="mb-1">
            {/* Section header — clickable to toggle */}
            <button
              onClick={() => toggleSection(section.section)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors mb-0.5 ${
                hasActive
                  ? "bg-primary-foreground/15 text-white"
                  : "hover:bg-primary-foreground/10 text-primary-foreground/50 hover:text-primary-foreground/70"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest flex-1 leading-none pt-0.5">
                {section.section}
              </span>
              {isOpen
                ? <ChevronDown size={12} className="shrink-0 opacity-60" />
                : <ChevronRight size={12} className="shrink-0 opacity-60" />
              }
            </button>

            {/* Items — shown when open */}
            {isOpen && (
              <div className="ml-1">
                {section.items.map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                    <span className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-100 cursor-pointer text-[13px] mb-px ${
                      isActive(item.href)
                        ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                        : "hover:bg-primary-foreground/10 text-primary-foreground/70 hover:text-white"
                    }`}>
                      <item.icon size={15} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const SidebarHeader = ({ subtitle }: { subtitle?: string }) => (
    <div className="flex items-center justify-between pr-2 border-b border-primary-foreground/10 shrink-0">
      <div className="flex-1 p-4 pb-3">
        <Link href="/" className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-7 h-7 brightness-0 invert" />
          <span className="font-serif font-bold text-base text-white">Al Burhan<span className="text-accent">.</span></span>
        </Link>
        <div className="mt-0.5 text-[10px] text-primary-foreground/40 font-medium tracking-widest uppercase pl-9">
          {subtitle || "Admin Portal"}
        </div>
      </div>
      <AdminNotificationCenter
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDelete={deleteNotification}
      />
    </div>
  );

  const SidebarFooter = () => (
    <div className="p-3 border-t border-primary-foreground/10 shrink-0">
      <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
        <div className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-xs shrink-0">
          {user?.name?.[0]?.toUpperCase() || "A"}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-white truncate">{user?.name || "Administrator"}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full self-start mt-0.5 ${roleColor || "bg-slate-100 text-slate-600"}`}>
            {roleLabel}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-primary-foreground/60 hover:text-white hover:bg-primary-foreground/10 text-xs h-8"
        onClick={() => logout()}
      >
        <LogOut size={14} className="mr-2" /> Logout
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex">

      {/* ── Desktop Sidebar (w-60) ──────────────────────────────────── */}
      <aside className="w-60 bg-primary text-primary-foreground flex-col hidden md:flex sticky top-0 h-screen">
        <SidebarHeader />
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* ── Mobile Overlay ───────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-primary text-primary-foreground flex flex-col h-full shadow-2xl">
            <SidebarHeader />
            <SidebarNav />
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-13 bg-white border-b border-border flex items-center px-4 md:hidden sticky top-0 z-40 shadow-sm">
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

      {popupNotif && (
        <BookingNotificationPopup notif={popupNotif} onDismiss={dismissPopup} />
      )}
    </div>
  );
}
