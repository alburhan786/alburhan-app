import { ReactNode, useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, PackageSearch, Users, BookOpen, MessageSquare, LogOut,
  ImageIcon, UsersRound, Receipt, ClipboardPlus, ScanLine, BarChart2,
  Printer, Menu, Megaphone, ShieldCheck, Inbox, PieChart, Star, BadgeCheck, Droplets,
  TrendingDown, Calculator, Plane, Activity, Home, CreditCard, Trash2,
  Building2, Bus, Heart, FileCheck, Sparkles, UserCheck, BookMarked, Truck,
  Scale, Users2, Package, ClipboardList, KeyRound, HeartPulse, Settings2, BellRing, Zap,
  MapPin, Tent, Tag, Bot, Award, Smartphone, Layers, Mail, Globe, FileText, TestTube2, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions, type Module, type Action } from "@/hooks/use-permissions";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { AdminNotificationCenter } from "@/components/admin/AdminNotificationCenter";
import { BookingNotificationPopup } from "@/components/admin/BookingNotificationPopup";

const API = import.meta.env.VITE_API_URL || "";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: number;
  require?: [Module, Action];
}

interface MenuSection {
  section: string;
  items: MenuItem[];
}

function buildMenu(openComplaints: number): MenuSection[] {
  return [
    {
      section: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
        { icon: Activity, label: "Operations", href: "/admin/operations", require: ["bookings", "view"] },
      ],
    },
    {
      section: "Bookings & Finance",
      items: [
        { icon: BookOpen, label: "Bookings", href: "/admin/bookings", require: ["bookings", "view"] },
        { icon: ClipboardPlus, label: "Offline Booking", href: "/admin/offline-bookings", require: ["bookings", "create"] },
        { icon: Receipt, label: "Invoices", href: "/admin/invoices", require: ["bookings", "view"] },
        { icon: CreditCard, label: "Payment Management", href: "/admin/payments", require: ["payments", "view"] },
        { icon: Building2, label: "Offline Payments", href: "/admin/offline-payments", require: ["payments", "view"] },
        { icon: Trash2, label: "Payment Trash", href: "/admin/payment-trash", require: ["payments", "delete"] },
        { icon: TrendingDown, label: "Expenses", href: "/admin/expenses", require: ["expenses", "view"] },
        { icon: Calculator, label: "Accounting", href: "/admin/accounting", require: ["accounting", "view"] },
        { icon: Home, label: "Family Ledger", href: "/admin/family-ledger", require: ["accounting", "view"] },
        { icon: UserCheck, label: "Customer Ledger", href: "/admin/customer-ledger", require: ["customers", "view"] },
        { icon: BookMarked, label: "Hajji Ledger", href: "/admin/hajji-ledger", require: ["groups", "view"] },
        { icon: Truck, label: "Vendors", href: "/admin/vendors", require: ["accounting", "view"] },
        { icon: Scale, label: "GST Reports", href: "/admin/gst-reports", require: ["gst", "view"] },
        { icon: Users2, label: "Payroll", href: "/admin/payroll", require: ["payroll", "view"] },
        { icon: Package, label: "Assets", href: "/admin/assets", require: ["assets", "view"] },
        { icon: Trash2, label: "Trash", href: "/admin/bookings?tab=trash", require: ["bookings", "delete"] },
      ],
    },
    {
      section: "Pilgrims & Groups",
      items: [
        { icon: UsersRound, label: "Hajj Groups", href: "/admin/groups", require: ["groups", "view"] },
        { icon: Plane, label: "Flights", href: "/admin/flights", require: ["groups", "view"] },
        { icon: Building2, label: "Hotels", href: "/admin/hotels", require: ["groups", "view"] },
        { icon: Bus, label: "Buses", href: "/admin/buses", require: ["groups", "view"] },
        { icon: Heart, label: "Medical", href: "/admin/medical", require: ["pilgrims", "view"] },
        { icon: FileCheck, label: "Visa Tracker", href: "/admin/visa", require: ["pilgrims", "view"] },
        { icon: BadgeCheck, label: "Staff ID Cards", href: "/admin/staff", require: ["staff", "view"] },
        { icon: ScanLine, label: "QR Tracker", href: "/admin/qr-tracker", require: ["groups", "view"] },
        { icon: Printer, label: "Print Center", href: "/admin/print-center", require: ["groups", "export"] },
        { icon: Droplets, label: "Spray Label", href: "/admin/print/spray-label", require: ["groups", "view"] },
      ],
    },
    {
      section: "Packages & Content",
      items: [
        { icon: PackageSearch, label: "Packages", href: "/admin/packages", require: ["bookings", "view"] },
        { icon: ImageIcon, label: "Gallery", href: "/admin/gallery", require: ["settings", "view"] },
      ],
    },
    {
      section: "Customers & Reports",
      items: [
        { icon: Users, label: "Customers", href: "/admin/customers", require: ["customers", "view"] },
        { icon: ShieldCheck, label: "KYC Management", href: "/admin/kyc", require: ["customers", "view"] },
        { icon: UserCheck, label: "Agent Management", href: "/admin/agents", require: ["customers", "view"] },
        { icon: Building2, label: "Branch Management", href: "/admin/branches", require: ["customers", "view"] },
        { icon: Star, label: "Feedback", href: "/admin/feedback", badge: openComplaints, require: ["customers", "view"] },
        { icon: Inbox, label: "Package Requests", href: "/admin/requests", require: ["customers", "view"] },
        { icon: MessageSquare, label: "Inquiries", href: "/admin/inquiries", require: ["customers", "view"] },
        { icon: Megaphone, label: "Broadcast Messages", href: "/admin/broadcast", require: ["customers", "edit"] },
        { icon: BarChart2, label: "Reports", href: "/admin/reports", require: ["reports", "view"] },
      ],
    },
    {
      section: "Hajj Operations",
      items: [
        { icon: MapPin, label: "Ziyarat", href: "/admin/ziyarat", require: ["groups", "view"] },
        { icon: Tent, label: "Mina / Arafat / Muzdalifah", href: "/admin/allocations", require: ["groups", "view"] },
        { icon: Tag, label: "Luggage", href: "/admin/luggage", require: ["groups", "view"] },
      ],
    },
    {
      section: "Automation",
      items: [
        { icon: Bot, label: "Automation Center", href: "/admin/automation-center", require: ["bookings", "edit"] },
        { icon: Award, label: "Loyalty & Rewards", href: "/admin/loyalty", require: ["bookings", "view"] },
      ],
    },
    {
      section: "Communication Center",
      items: [
        { icon: BellRing,       label: "Communication Center",   href: "/admin/communication-center",  require: ["customers", "edit"] as [any,any] },
        { icon: Zap,            label: "Workflow Center",         href: "/admin/workflow-center",        require: ["bookings", "edit"]  as [any,any] },
        { icon: Bot,            label: "BotBee Dashboard",        href: "/admin/botbee-dashboard",       require: ["settings", "view"]  as [any,any] },
        { icon: History,        label: "WhatsApp History",         href: "/admin/whatsapp-history",       require: ["settings", "view"]  as [any,any] },
        { icon: MessageSquare,  label: "WhatsApp Templates",      href: "/admin/whatsapp-templates",     require: ["settings", "view"]  as [any,any] },
        { icon: Smartphone,     label: "SMS Templates",           href: "/admin/sms-templates",          require: ["settings", "view"]  as [any,any] },
        { icon: Layers,         label: "RCS Templates",           href: "/admin/rcs-templates",          require: ["settings", "view"]  as [any,any] },
        { icon: Mail,           label: "Email Templates",         href: "/admin/email-templates",        require: ["settings", "view"]  as [any,any] },
        { icon: FileText,       label: "DLT Template Manager",    href: "/admin/dlt-templates",          require: ["settings", "view"]  as [any,any] },
        { icon: Globe,          label: "Meta WhatsApp Manager",   href: "/admin/whatsapp-templates",     require: ["settings", "view"]  as [any,any] },
        { icon: Bot,            label: "BotBee Settings",         href: "/admin/api-settings",           require: ["settings", "view"]  as [any,any] },
        { icon: Smartphone,     label: "Fast2SMS Settings",       href: "/admin/api-settings",           require: ["settings", "view"]  as [any,any] },
        { icon: Layers,         label: "Lemin AI RCS Settings",   href: "/admin/api-settings",           require: ["settings", "view"]  as [any,any] },
        { icon: Mail,           label: "SMTP Settings",           href: "/admin/api-settings",           require: ["settings", "view"]  as [any,any] },
        { icon: TestTube2,      label: "Test Notifications",      href: "/admin/test-notifications",     require: ["settings", "view"]  as [any,any] },
      ],
    },
    {
      section: "AI Tools",
      items: [
        { icon: Sparkles, label: "AI Assistant", href: "/admin/ai" },
      ],
    },
    {
      section: "System",
      items: [
        { icon: Settings2, label: "Billing Settings", href: "/admin/billing-settings", require: ["settings", "view"] },
        { icon: KeyRound, label: "API Settings", href: "/admin/api-settings", require: ["settings", "view"] },
        { icon: KeyRound, label: "User Roles", href: "/admin/user-roles", require: ["users", "view"] },
        { icon: Scale, label: "Agreement Center", href: "/admin/agreements", require: ["audit_logs", "view"] },
        { icon: ClipboardList, label: "Audit Logs", href: "/admin/audit-logs", require: ["audit_logs", "view"] },
        { icon: MessageSquare, label: "SMS Audit Log", href: "/admin/sms-audit", require: ["audit_logs", "view"] },
        { icon: HeartPulse, label: "System Health", href: "/admin/system-health", require: ["users", "view"] },
        { icon: Activity, label: "OTP Debug", href: "/admin/otp-debug", require: ["users", "view"] },
      ],
    },
  ];
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openComplaints, setOpenComplaints] = useState(0);
  const { can, roleLabel, roleColor } = usePermissions();

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

  const MENU = useMemo(() => {
    const raw = buildMenu(openComplaints);
    return raw
      .map(section => ({
        ...section,
        items: section.items.filter(item => !item.require || can(item.require[0], item.require[1])),
      }))
      .filter(section => section.items.length > 0);
  }, [openComplaints, can]);

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
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Desktop Sidebar */}
      <aside className="w-56 bg-primary text-primary-foreground flex-col hidden md:flex sticky top-0 h-screen">
        {/* Notification bell in sidebar header */}
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

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {MENU.map((section) => (
            <div key={section.section} className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/35 px-3 mb-1.5">{section.section}</p>
              {section.items.map(item => (
                <Link key={item.href} href={item.href}>
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
