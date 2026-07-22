import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetAdminStats,
  useSendBroadcast,
  getBookingsReport,
  getPaymentsReport,
  getCustomersReport,
  type BroadcastResponse,
  type BroadcastRequestAudience,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  IndianRupee, Users, Package as PackageIcon, Clock, Send, FileText,
  CheckCircle, XCircle, ScanLine, Printer, ClipboardPlus, BarChart2,
  BookOpen, UsersRound, MessageSquare, ImageIcon, Wallet, TrendingUp,
  ShieldCheck, Megaphone, PieChart, Bell, Plane, ListTodo, UserPlus,
  Building2, MapPin, Brain, Search, Activity, Settings, Sparkles,
  Zap, Target, Handshake, Star, UserCheck, Inbox, Share2, Users2,
  Hotel, Bus, Tent, Heart, Tag, TrendingDown, Calculator, Briefcase,
  Receipt, KeyRound, Archive, Code2, Plug, Settings2, Lock, Scale,
  ClipboardList, FileCheck, Truck, ShoppingCart, Smartphone, Globe,
  Mail, CreditCard, UserCircle, Award,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";

interface ModItem {
  icon: React.ElementType;
  label: string;
  desc: string;
  href: string;
  bg: string;
  tc: string;
}

const SECTIONS: { title: string; color: string; items: ModItem[] }[] = [
  /* ── 1. PORTALS ──────────────────────────────────────────────── */
  {
    title: "Portals",
    color: "from-violet-600 to-violet-800",
    items: [
      { icon: Sparkles,    label: "Super Admin Dashboard",   desc: "Command center",              href: "/admin/super",             bg: "bg-violet-100",  tc: "text-violet-700"  },
      { icon: Building2,   label: "Branch Dashboard",        desc: "Branch performance",          href: "/admin/branch-dashboard",  bg: "bg-blue-100",    tc: "text-blue-700"    },
      { icon: KeyRound,    label: "Branch Login Management", desc: "Branch login & access",       href: "/admin/branch-login",      bg: "bg-indigo-100",  tc: "text-indigo-700"  },
      { icon: UserCheck,   label: "Agent Dashboard",         desc: "Agent analytics",             href: "/admin/agent-dashboard",   bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: ShieldCheck, label: "Agent Login Management",  desc: "Agent login & access",        href: "/admin/agent-login",       bg: "bg-sky-100",     tc: "text-sky-700"     },
      { icon: Users,       label: "Staff Dashboard",         desc: "Staff management",            href: "/admin/staff-dashboard",   bg: "bg-teal-100",    tc: "text-teal-700"    },
      { icon: UserCircle,  label: "Customer Dashboard",      desc: "Customer overview",           href: "/admin/customer-dashboard",bg: "bg-orange-100",  tc: "text-orange-700"  },
    ],
  },

  /* ── 2. OVERVIEW & INTELLIGENCE ─────────────────────────────── */
  {
    title: "Overview & Intelligence",
    color: "from-indigo-600 to-indigo-800",
    items: [
      { icon: Briefcase,   label: "Executive Dashboard",     desc: "C-suite KPIs & overview",     href: "/admin/executive",         bg: "bg-indigo-100",  tc: "text-indigo-700"  },
      { icon: Settings,    label: "Operations Dashboard",    desc: "Ops status & tracking",       href: "/admin/operations",        bg: "bg-blue-100",    tc: "text-blue-700"    },
      { icon: UsersRound,  label: "Manager Dashboard",       desc: "Team & pipeline view",        href: "/admin/manager",           bg: "bg-violet-100",  tc: "text-violet-700"  },
      { icon: PieChart,    label: "Business Intelligence",   desc: "Trends & insights",           href: "/admin/bi",                bg: "bg-purple-100",  tc: "text-purple-700"  },
      { icon: Brain,       label: "AI Analytics Dashboard",  desc: "ML-powered insights",         href: "/admin/ai-ops",            bg: "bg-fuchsia-100", tc: "text-fuchsia-700" },
    ],
  },

  /* ── 3. FINANCE & ACCOUNTING ─────────────────────────────────── */
  {
    title: "Finance & Accounting",
    color: "from-emerald-600 to-emerald-800",
    items: [
      { icon: IndianRupee, label: "Finance Dashboard",       desc: "P&L, cash flow, ledger",      href: "/admin/finance",           bg: "bg-emerald-100", tc: "text-emerald-700" },
      { icon: Calculator,  label: "Accounting Dashboard",    desc: "Books & journal entries",     href: "/admin/accounting",        bg: "bg-green-100",   tc: "text-green-700"   },
      { icon: CreditCard,  label: "Payment Dashboard",       desc: "Transactions & receipts",     href: "/admin/payments",          bg: "bg-lime-100",    tc: "text-lime-700"    },
      { icon: Wallet,      label: "Offline Payments",        desc: "Bank transfers & cash",       href: "/admin/offline-payments",  bg: "bg-teal-100",    tc: "text-teal-700"    },
      { icon: BookOpen,    label: "Invoice Dashboard",       desc: "Invoice management",          href: "/admin/invoices",          bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: TrendingDown,label: "Expense Dashboard",       desc: "Expenses & cost tracking",    href: "/admin/expenses",          bg: "bg-orange-100",  tc: "text-orange-700"  },
      { icon: Receipt,     label: "Receipt Dashboard",       desc: "Payment receipts",            href: "/admin/receipts",          bg: "bg-sky-100",     tc: "text-sky-700"     },
    ],
  },

  /* ── 4. CRM, SALES & CUSTOMER ────────────────────────────────── */
  {
    title: "CRM, Sales & Customer",
    color: "from-blue-600 to-blue-800",
    items: [
      { icon: Target,      label: "CRM Dashboard",           desc: "Leads & pipeline",            href: "/admin/crm",               bg: "bg-blue-100",    tc: "text-blue-700"    },
      { icon: UserPlus,    label: "Lead Manager",            desc: "Lead capture & follow-up",    href: "/admin/leads",             bg: "bg-sky-100",     tc: "text-sky-700"     },
      { icon: Users2,      label: "Customer 360° Profile",   desc: "Full customer history",       href: "/admin/customer360",       bg: "bg-indigo-100",  tc: "text-indigo-700"  },
      { icon: BarChart2,   label: "Customer Analytics",      desc: "Customer data & behaviour",   href: "/admin/customers",         bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: Star,        label: "Loyalty & Rewards",       desc: "Points & redemptions",        href: "/admin/loyalty",           bg: "bg-yellow-100",  tc: "text-yellow-700"  },
    ],
  },

  /* ── 5. SUPPLIER, PROCUREMENT & INVENTORY ────────────────────── */
  {
    title: "Supplier, Procurement & Inventory",
    color: "from-purple-600 to-purple-800",
    items: [
      { icon: Handshake,   label: "SRM Dashboard",           desc: "Supplier relationships",      href: "/admin/srm",               bg: "bg-purple-100",  tc: "text-purple-700"  },
      { icon: Truck,       label: "Supplier Dashboard",      desc: "Supplier directory",          href: "/admin/suppliers",         bg: "bg-fuchsia-100", tc: "text-fuchsia-700" },
      { icon: ShoppingCart,label: "Procurement Dashboard",   desc: "Purchase orders",             href: "/admin/procurement",       bg: "bg-pink-100",    tc: "text-pink-700"    },
      { icon: PackageIcon, label: "Inventory Dashboard",     desc: "Stock & equipment",           href: "/admin/inventory",         bg: "bg-rose-100",    tc: "text-rose-700"    },
      { icon: Tag,         label: "Vendor Dashboard",        desc: "Vendor management",           href: "/admin/vendors",           bg: "bg-orange-100",  tc: "text-orange-700"  },
    ],
  },

  /* ── 6. HR & WORKFORCE ───────────────────────────────────────── */
  {
    title: "HR & Workforce",
    color: "from-amber-600 to-amber-800",
    items: [
      { icon: Briefcase,   label: "HR Dashboard",            desc: "Staff & HR management",       href: "/admin/hr",                bg: "bg-amber-100",   tc: "text-amber-700"   },
      { icon: IndianRupee, label: "Payroll Dashboard",       desc: "Salary & payslips",           href: "/admin/payroll",           bg: "bg-yellow-100",  tc: "text-yellow-700"  },
      { icon: UsersRound,  label: "Staff Manager",           desc: "Manage all staff members",    href: "/admin/staff",             bg: "bg-orange-100",  tc: "text-orange-700"  },
      { icon: ListTodo,    label: "Task Dashboard",          desc: "Tasks & assignments",         href: "/admin/tasks",             bg: "bg-lime-100",    tc: "text-lime-700"    },
      { icon: Archive,     label: "Asset Manager",           desc: "Company assets & equipment",  href: "/admin/assets",            bg: "bg-green-100",   tc: "text-green-700"   },
      { icon: ScanLine,    label: "Attendance",              desc: "Group attendance tracking",   href: "/admin/groups",            bg: "bg-teal-100",    tc: "text-teal-700"    },
    ],
  },

  /* ── 7. BOOKING & PILGRIM OPERATIONS ─────────────────────────── */
  {
    title: "Booking & Pilgrim Operations",
    color: "from-rose-600 to-rose-800",
    items: [
      { icon: BookOpen,    label: "Bookings",                desc: "All bookings & reservations", href: "/admin/bookings",          bg: "bg-rose-100",    tc: "text-rose-700"    },
      { icon: ClipboardPlus,label:"Offline Booking",         desc: "Walk-in & manual bookings",   href: "/admin/offline-bookings",  bg: "bg-red-100",     tc: "text-red-700"     },
      { icon: UsersRound,  label: "Hajj Groups",            desc: "Hajj group management",        href: "/admin/groups",            bg: "bg-amber-100",   tc: "text-amber-700"   },
      { icon: Users2,      label: "Umrah Groups",           desc: "Umrah group management",       href: "/admin/groups",            bg: "bg-yellow-100",  tc: "text-yellow-700"  },
      { icon: FileCheck,   label: "Visa Dashboard",          desc: "Visa status & processing",    href: "/admin/visa",              bg: "bg-purple-100",  tc: "text-purple-700"  },
      { icon: Plane,       label: "Flight Dashboard",        desc: "Flight management",           href: "/admin/flights",           bg: "bg-violet-100",  tc: "text-violet-700"  },
      { icon: Hotel,       label: "Hotel Dashboard",         desc: "Hotel management",            href: "/admin/hotels",            bg: "bg-blue-100",    tc: "text-blue-700"    },
      { icon: Bus,         label: "Transport Dashboard",     desc: "Buses & vehicles",            href: "/admin/buses",             bg: "bg-sky-100",     tc: "text-sky-700"     },
      { icon: Tent,        label: "Room Allocation",         desc: "Mina / Arafat / Muzdalifa",   href: "/admin/allocations",       bg: "bg-indigo-100",  tc: "text-indigo-700"  },
      { icon: MapPin,      label: "Guide Panel",             desc: "Tour guide management",       href: "/admin/guide-panel",       bg: "bg-teal-100",    tc: "text-teal-700"    },
      { icon: Heart,       label: "Ziyarat Dashboard",       desc: "Ziyarat schedule & sites",    href: "/admin/ziyarat",           bg: "bg-pink-100",    tc: "text-pink-700"    },
      { icon: FileText,    label: "Pilgrim Reports",         desc: "Pilgrim data & reports",      href: "/admin/pilgrim-reports",   bg: "bg-orange-100",  tc: "text-orange-700"  },
      { icon: ScanLine,    label: "QR Tracker",              desc: "Pilgrim QR tracking",         href: "/admin/qr-tracker",        bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: Printer,     label: "Print Center",            desc: "ID cards, luggage & docs",    href: "/admin/print-center",      bg: "bg-slate-100",   tc: "text-slate-700"   },
      { icon: Scale,       label: "Agreement Dashboard",     desc: "Contracts & digital sign",    href: "/admin/agreements",        bg: "bg-emerald-100", tc: "text-emerald-700" },
      { icon: Award,       label: "Certificate Center",      desc: "Haj & Umrah certificates",    href: "/admin/certificates",      bg: "bg-yellow-100",  tc: "text-yellow-700"  },
      { icon: ClipboardList,label:"Document Management",     desc: "Passport, Aadhaar & docs",    href: "/admin/document-expiry",   bg: "bg-fuchsia-100", tc: "text-fuchsia-700" },
      { icon: FileCheck,   label: "KYC Dashboard",           desc: "Know Your Customer docs",     href: "/admin/kyc",               bg: "bg-lime-100",    tc: "text-lime-700"    },
    ],
  },

  /* ── 8. COMMUNICATION & MARKETING ───────────────────────────── */
  {
    title: "Communication & Marketing",
    color: "from-teal-600 to-teal-800",
    items: [
      { icon: MessageSquare,label:"WhatsApp Dashboard",      desc: "Messages & templates",        href: "/admin/botbee-dashboard",  bg: "bg-emerald-100", tc: "text-emerald-700" },
      { icon: Smartphone,  label: "SMS Dashboard",           desc: "DLT & SMS campaigns",         href: "/admin/sms-dashboard",     bg: "bg-blue-100",    tc: "text-blue-700"    },
      { icon: Mail,        label: "Email Dashboard",         desc: "Email templates & delivery",  href: "/admin/email-dashboard",   bg: "bg-violet-100",  tc: "text-violet-700"  },
      { icon: Megaphone,   label: "Marketing Dashboard",     desc: "Campaigns & broadcasts",      href: "/admin/marketing",         bg: "bg-rose-100",    tc: "text-rose-700"    },
      { icon: Send,        label: "Broadcast Center",        desc: "Mass messaging & alerts",     href: "/admin/broadcast",         bg: "bg-pink-100",    tc: "text-pink-700"    },
      { icon: Bell,        label: "Notification Center",     desc: "Push & in-app notifications", href: "/admin/notifications",     bg: "bg-amber-100",   tc: "text-amber-700"   },
      { icon: Share2,      label: "Social Media Integration",desc: "All social channels",         href: "/admin/social-media",      bg: "bg-sky-100",     tc: "text-sky-700"     },
      { icon: Inbox,       label: "Omni Channel Inbox",      desc: "All messages in one view",    href: "/admin/inbox",             bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: Globe,       label: "Website CMS",             desc: "Public pages & content",      href: "/admin/cms",               bg: "bg-teal-100",    tc: "text-teal-700"    },
      { icon: Zap,         label: "Automation Center",       desc: "Workflow automation rules",   href: "/admin/automation-center", bg: "bg-yellow-100",  tc: "text-yellow-700"  },
      { icon: Activity,    label: "Workflow Center",         desc: "Notification pipelines",      href: "/admin/workflow-center",   bg: "bg-orange-100",  tc: "text-orange-700"  },
    ],
  },

  /* ── 9. ANALYTICS & REPORTING ────────────────────────────────── */
  {
    title: "Analytics & Reporting",
    color: "from-slate-600 to-slate-800",
    items: [
      { icon: BarChart2,   label: "Reports Dashboard",       desc: "Operational reports",         href: "/admin/reports",           bg: "bg-slate-100",   tc: "text-slate-700"   },
      { icon: TrendingUp,  label: "GST Reports",             desc: "Tax & GST summaries",         href: "/admin/gst-reports",       bg: "bg-gray-100",    tc: "text-gray-700"    },
      { icon: FileText,    label: "Production Report",       desc: "System & ops metrics",        href: "/admin/production-report", bg: "bg-zinc-100",    tc: "text-zinc-700"    },
      { icon: Search,      label: "Global Search",           desc: "Search all ERP data",         href: "/admin/search",            bg: "bg-neutral-100", tc: "text-neutral-700" },
    ],
  },

  /* ── 10. SYSTEM & SECURITY ───────────────────────────────────── */
  {
    title: "System & Security",
    color: "from-red-600 to-red-800",
    items: [
      { icon: Smartphone,  label: "Mobile App Dashboard",    desc: "App configuration",           href: "/admin/mobile-app",        bg: "bg-cyan-100",    tc: "text-cyan-700"    },
      { icon: KeyRound,    label: "User & Role Management",  desc: "Accounts & permissions",      href: "/admin/user-roles",        bg: "bg-red-100",     tc: "text-red-700"     },
      { icon: ShieldCheck, label: "Permission Management",   desc: "Role permission matrix",      href: "/admin/permissions",       bg: "bg-rose-100",    tc: "text-rose-700"    },
      { icon: ClipboardList,label:"Audit Log Dashboard",     desc: "All system activity",         href: "/admin/audit-logs",        bg: "bg-orange-100",  tc: "text-orange-700"  },
      { icon: Users2,      label: "Activity Log Dashboard",  desc: "User activity stream",        href: "/admin/activity-logs",     bg: "bg-amber-100",   tc: "text-amber-700"   },
      { icon: Lock,        label: "Security Dashboard",      desc: "Security health & alerts",    href: "/admin/security",          bg: "bg-yellow-100",  tc: "text-yellow-700"  },
      { icon: Archive,     label: "Backup Dashboard",        desc: "Data backups & restore",      href: "/admin/backups",           bg: "bg-green-100",   tc: "text-green-700"   },
      { icon: Code2,       label: "API Dashboard",           desc: "API keys & endpoints",        href: "/admin/api-settings",      bg: "bg-teal-100",    tc: "text-teal-700"    },
      { icon: Plug,        label: "Integration Dashboard",   desc: "Third-party connections",     href: "/admin/integrations",      bg: "bg-indigo-100",  tc: "text-indigo-700"  },
      { icon: Heart,       label: "System Health",           desc: "Uptime & diagnostics",        href: "/admin/system-health",     bg: "bg-pink-100",    tc: "text-pink-700"    },
      { icon: CreditCard,  label: "Billing Settings",        desc: "Subscription & billing",      href: "/admin/billing-settings",  bg: "bg-purple-100",  tc: "text-purple-700"  },
      { icon: Settings2,   label: "Settings Dashboard",      desc: "Company configuration",       href: "/admin/settings",          bg: "bg-sky-100",     tc: "text-sky-700"     },
    ],
  },
];

function StatCard({ label, value, icon: Icon, bg, color, sub }: {
  label: string; value: string | number; icon: React.ElementType;
  bg: string; color: string; sub?: string;
}) {
  return (
    <Card className="p-5 border-none shadow-sm rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return map[status] || "bg-gray-100 text-gray-600";
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  if (isLoading) return <AdminLayout><div className="p-12 text-center text-muted-foreground animate-pulse">Loading dashboard...</div></AdminLayout>;
  if (!stats) return <AdminLayout><div className="p-12 text-center text-red-500">Failed to load stats.</div></AdminLayout>;

  const statCards = [
    { label: "Total Revenue",    value: formatCurrency(stats.totalRevenue),          icon: IndianRupee, bg: "bg-emerald-100", color: "text-emerald-600", sub: "Collected payments"   },
    { label: "Total Bookings",   value: stats.totalBookings,                          icon: BookOpen,    bg: "bg-blue-100",    color: "text-blue-600",    sub: "All time"             },
    { label: "Confirmed",        value: stats.confirmedBookings ?? 0,                 icon: CheckCircle, bg: "bg-teal-100",    color: "text-teal-600",    sub: "Paid & confirmed"     },
    { label: "Pending Approval", value: stats.pendingBookings,                        icon: Clock,       bg: "bg-amber-100",   color: "text-amber-600",   sub: "Awaiting action"      },
    { label: "Total Customers",  value: stats.totalCustomers,                         icon: Users,       bg: "bg-purple-100",  color: "text-purple-600",  sub: "Registered users"     },
    { label: "Rejected",         value: stats.rejectedBookings ?? 0,                  icon: XCircle,     bg: "bg-red-100",     color: "text-red-500",     sub: "Declined bookings"    },
    { label: "Total Discount",   value: formatCurrency((stats as any).totalDiscount ?? 0), icon: IndianRupee, bg: "bg-orange-100", color: "text-orange-600", sub: `${(stats as any).discountedBookings ?? 0} bookings` },
  ];

  const totalCards = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Al Burhan Tours & Travels · {totalCards} modules across {SECTIONS.length} sections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBroadcastOpen(true)} className="flex items-center gap-2">
            <Send size={14} /> Broadcast
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReportsOpen(true)} className="flex items-center gap-2">
            <FileText size={14} /> Reports
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {statCards.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>

      {/* Module Sections */}
      <div className="mb-10 space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl bg-gradient-to-r ${section.color} mb-4`}>
              <h2 className="font-bold text-white text-sm uppercase tracking-widest">{section.title}</h2>
              <span className="text-white/80 text-xs font-semibold">{section.items.length} modules</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {section.items.map((mod) => (
                <Link key={mod.label} href={mod.href}>
                  <div className="bg-white rounded-2xl border-2 border-border p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full">
                    <div className={`w-10 h-10 rounded-xl ${mod.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <mod.icon size={20} className={mod.tc} />
                    </div>
                    <p className="font-bold text-foreground text-sm leading-tight">{mod.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{mod.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom section: Recent Bookings + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border-none shadow-sm rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold font-serif">Recent Bookings</h3>
            <Link href="/admin/bookings">
              <button className="text-xs text-[#0B3D2E] hover:underline font-semibold">View All →</button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 rounded-tl-lg">Ref</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 rounded-tr-lg">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.recentBookings?.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-xs">No bookings yet.</td></tr>
                ) : stats.recentBookings?.map(booking => (
                  <tr key={booking.id} className="hover:bg-muted/20">
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs font-bold text-[#0B3D2E]">{booking.bookingNumber}</div>
                      {(booking as any).isOffline && <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">OFFLINE</span>}
                    </td>
                    <td className="px-3 py-3 font-medium text-sm">{booking.customerName}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs truncate max-w-[120px]">{booking.packageName || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={`px-2 py-0.5 text-[10px] font-bold uppercase border-0 ${getStatusBadge(booking.status)}`}>
                        {booking.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">{formatDate(booking.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 border-none shadow-sm rounded-2xl bg-[#0B3D2E] text-primary-foreground">
          <h3 className="text-base font-bold mb-4 font-serif text-white flex items-center gap-2">
            <Wallet size={18} className="text-accent" /> Quick Actions
          </h3>
          <div className="space-y-2.5">
            {[
              { icon: ClipboardPlus, label: "New Offline Booking",  href: "/admin/offline-bookings" },
              { icon: ScanLine,      label: "QR Pilgrim Tracker",   href: "/admin/qr-tracker"        },
              { icon: Printer,       label: "Print Center",         href: "/admin/print-center"      },
              { icon: BarChart2,     label: "Generate Reports",     href: "/admin/reports"           },
              { icon: UsersRound,    label: "Manage Hajj Groups",   href: "/admin/groups"            },
            ].map((item, i) => (
              <Link key={i} href={item.href}>
                <button className="w-full text-left px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3 text-sm text-white font-medium">
                  <item.icon size={16} className="text-accent" />
                  {item.label}
                </button>
              </Link>
            ))}
            <div className="pt-1 border-t border-white/10">
              <button
                onClick={() => setBroadcastOpen(true)}
                className="w-full text-left px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3 text-sm text-white font-medium"
              >
                <Send size={16} className="text-accent" /> Send Broadcast
              </button>
            </div>
          </div>
        </Card>
      </div>

      <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <ReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} />
    </AdminLayout>
  );
}

function BroadcastModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<BroadcastRequestAudience>("all");

  const mutation = useSendBroadcast({
    mutation: {
      onSuccess: (data) => {
        const result = data as BroadcastResponse;
        toast({ title: "Broadcast Sent", description: result.message });
        setMessage("");
        onClose();
      },
      onError: () => { toast({ title: "Error", description: "Failed to send broadcast.", variant: "destructive" }); },
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2"><Send size={18} /> Send Broadcast</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ data: { message, audience } }); }} className="space-y-4">
          <div>
            <Label>Audience</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={audience} onChange={e => setAudience(e.target.value as BroadcastRequestAudience)}>
              <option value="all">All Customers</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="confirmed">Confirmed Bookings</option>
            </select>
          </div>
          <div>
            <Label>Message *</Label>
            <textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1 min-h-[120px]" placeholder="Type broadcast message..." value={message} onChange={e => setMessage(e.target.value)} required />
            <p className="text-xs text-muted-foreground mt-1">Sent via SMS and WhatsApp.</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !message.trim()}>
              <Send className="w-4 h-4 mr-2" /> {mutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ReportType = "bookings" | "payments" | "customers";

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [headers.join(","), ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reportType, setReportType] = useState<ReportType>("bookings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async (format: "csv" | "print") => {
    setLoading(true);
    try {
      let data: Record<string, unknown>[];
      if (reportType === "payments") data = (await getPaymentsReport()) as unknown as Record<string, unknown>[];
      else if (reportType === "customers") data = (await getCustomersReport()) as unknown as Record<string, unknown>[];
      else data = (await getBookingsReport({ from: dateFrom || undefined, to: dateTo || undefined })) as unknown as Record<string, unknown>[];
      if (!data.length) { toast({ title: "No Data", description: "No records found." }); return; }
      if (format === "csv") {
        downloadCSV(data, `${reportType}-${new Date().toISOString().split("T")[0]}.csv`);
        toast({ title: "Report Downloaded", description: `${data.length} records exported.` });
      } else {
        const headers = Object.keys(data[0]);
        const rows = data.map(row => `<tr>${headers.map(h => `<td style="border:1px solid #ddd;padding:6px 10px;font-size:11px">${String(row[h] ?? "")}</td>`).join("")}</tr>`).join("");
        const html = `<!DOCTYPE html><html><head><title>Report</title></head><body><h2 style="font-family:serif;color:#0B3D2E">Al Burhan Tours &amp; Travels</h2><table style="border-collapse:collapse;width:100%"><thead><tr>${headers.map(h => `<th style="background:#0B3D2E;color:#fff;padding:8px 10px;font-size:10px;text-align:left">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`;
        const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
      }
      onClose();
    } catch { toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2"><BarChart2 size={18} /> Generate Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Report Type</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
              <option value="bookings">Bookings Summary</option>
              <option value="payments">Payments / Revenue</option>
              <option value="customers">Customer List</option>
            </select>
          </div>
          {reportType === "bookings" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><input type="date" className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
              <div><Label>To</Label><input type="date" className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={() => handleGenerate("print")} disabled={loading}><Printer className="w-4 h-4 mr-2" /> Print</Button>
            <Button onClick={() => handleGenerate("csv")} disabled={loading}><FileText className="w-4 h-4 mr-2" /> Download CSV</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
