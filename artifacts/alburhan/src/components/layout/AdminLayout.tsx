/**
 * AdminLayout — shell only.
 *
 * Navigation data lives in src/config/navigation.ts.
 * To add/remove sidebar items, edit ONLY that file.
 * This file must never define its own menu arrays.
 */
import { ReactNode, useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { BookingNotificationPopup } from "@/components/admin/BookingNotificationPopup";
import { buildNavSections } from "@/config/navigation";

const API = import.meta.env.VITE_API_URL || "";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openComplaints, setOpenComplaints] = useState(0);
  const { can, roleLabel, roleColor, isSuper } = usePermissions();

  const {
    notifications,
    unreadCount,
    popupNotif,
    dismissPopup,
    markRead,
    markAllRead,
    deleteNotification,
  } = useAdminNotifications(isAdmin);

  useEffect(() => {
    fetch(`${API}/api/feedback/admin/stats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.openComplaints) setOpenComplaints(Number(data.openComplaints)); })
      .catch(() => {});
  }, []);

  // ── Build filtered menu from central registry ────────────────────────────
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

  // ── Shared sidebar body ──────────────────────────────────────────────────
  const SidebarNav = () => (
    <nav className="flex-1 px-3 py-4 overflow-y-auto">
      {MENU.map((section) => (
        <div key={section.section} className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/35 px-3 mb-1.5">
            {section.section}
          </p>
          {section.items.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <span className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-sm mb-0.5 ${
                isActive(item.href)
                  ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                  : "hover:bg-primary-foreground/10 text-primary-foreground/75 hover:text-white"
              }`}>
                <item.icon size={17} />
                <span className="flex-1">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {item.badge}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const SidebarFooter = () => (
    <div className="p-4 border-t border-primary-foreground/10">
      <div className="flex items-center gap-3 px-3 py-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm shrink-0">
          {user?.name?.[0]?.toUpperCase() || "A"}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-white truncate">{user?.name || "Administrator"}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full self-start mt-0.5 ${roleColor || "bg-slate-100 text-slate-600"}`}>
            {roleLabel}
          </span>
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
  );

  return (
    <div className="min-h-screen bg-muted/30 flex">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-56 bg-primary text-primary-foreground flex-col hidden md:flex sticky top-0 h-screen">
        <div className="flex items-center justify-between pr-3 border-b border-primary-foreground/10">
          <div className="flex-1">
            <div className="p-5 pb-4">
              <Link href="/" className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 brightness-0 invert" />
                <span className="font-serif font-bold text-lg text-white">Al Burhan<span className="text-accent">.</span></span>
              </Link>
              <div className="mt-1 text-[11px] text-primary-foreground/50 font-medium tracking-widest uppercase pl-11">Admin Portal</div>
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
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* ── Mobile Overlay Sidebar ──────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-primary text-primary-foreground flex flex-col h-full shadow-2xl">
            <div className="p-5 border-b border-primary-foreground/10">
              <Link href="/" className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 brightness-0 invert" />
                <span className="font-serif font-bold text-lg text-white">Al Burhan<span className="text-accent">.</span></span>
              </Link>
              <div className="mt-1 text-[11px] text-primary-foreground/50 font-medium tracking-widest uppercase pl-11">Admin Portal</div>
            </div>
            <SidebarNav />
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-border flex items-center px-4 md:hidden sticky top-0 z-40 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </Button>
          <span className="ml-3 font-serif font-bold text-base text-primary">Al Burhan Admin</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-muted-foreground">
              <LogOut size={16} />
            </Button>
          </div>
        </header>
        <div className="p-4 md:p-8 flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Real-time booking notification popup */}
      {popupNotif && (
        <BookingNotificationPopup notif={popupNotif} onDismiss={dismissPopup} />
      )}
    </div>
  );
}
