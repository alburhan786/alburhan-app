import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Link } from "wouter";
import {
  Sparkles, Building2, UserCheck, Users, Users2, IndianRupee, Calculator,
  CreditCard, Target, Handshake, Briefcase, Package, ShoppingCart, Truck,
  FileCheck, Plane, Hotel, Bus, Tent, FileText, Scale, Receipt, BarChart2,
  TrendingUp, Brain, Megaphone, MessageSquare, Smartphone, Mail, Globe,
  LayoutGrid, KeyRound, ShieldCheck, ClipboardList, Activity, Lock,
  Archive, Code2, Plug, Settings2, RefreshCw, AlertCircle, Star,
  Zap, BookOpen,
  LayoutDashboard, Monitor, BarChart3, PieChart,
  CalendarRange, BookMarked, MapPin, Compass, FileSpreadsheet, Printer,
  QrCode, Award, Banknote, BookUser, HeartHandshake, Gift,
  Share2, Inbox, Radio, Bot, Bell, Search, GitBranch,
  Headphones, ListTodo, MessageCircle, Wallet,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) =>
  n >= 10_000_000 ? `${(n / 10_000_000).toFixed(1)}Cr` :
  n >= 100_000   ? `${(n / 100_000).toFixed(1)}L` :
  n >= 1_000     ? `${(n / 1_000).toFixed(1)}K` :
  String(n);

// ── Module card definition ─────────────────────────────────────────────────
interface Module {
  label: string;
  sub: string;
  icon: React.ElementType;
  href: string;
  kpiKey?: string;
  kpiLabel?: string;
  color: string;      // Tailwind bg for icon container
  textColor: string;  // Tailwind text for icon
  borderHover: string;
}

const MODULES: { section: string; color: string; items: Module[] }[] = [
  // ── 1. Portals ──────────────────────────────────────────────────────────────
  {
    section: "Portals",
    color: "from-violet-600 to-violet-800",
    items: [
      { label: "Super Admin Dashboard",     sub: "Command center",              icon: Sparkles,       href: "/admin/super",            kpiKey: "totalBookings",  kpiLabel: "bookings",  color: "bg-violet-100",  textColor: "text-violet-700",  borderHover: "hover:border-violet-400" },
      { label: "Branch Dashboard",          sub: "Branch performance",          icon: Building2,      href: "/admin/branch-dashboard", kpiKey: "branches",       kpiLabel: "branches",  color: "bg-blue-100",    textColor: "text-blue-700",    borderHover: "hover:border-blue-400" },
      { label: "Branch Login Management",   sub: "Branch login & access",       icon: KeyRound,       href: "/admin/branch-login",     kpiKey: "branches",       kpiLabel: "branches",  color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
      { label: "Agent Dashboard",           sub: "Agent analytics",             icon: UserCheck,      href: "/admin/agent-dashboard",  kpiKey: "agents",         kpiLabel: "agents",    color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
      { label: "Agent Login Management",    sub: "Agent login & access",        icon: ShieldCheck,    href: "/admin/agent-login",      kpiKey: "agents",         kpiLabel: "agents",    color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Staff Dashboard",           sub: "Staff management",            icon: Users,          href: "/admin/staff-dashboard",  kpiKey: "staff",          kpiLabel: "staff",     color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "Customer Dashboard",        sub: "Customer management",         icon: Users2,         href: "/admin/customers",        kpiKey: "customers",      kpiLabel: "customers", color: "bg-emerald-100", textColor: "text-emerald-700", borderHover: "hover:border-emerald-400" },
    ],
  },
  // ── 2. Dashboards & BI ──────────────────────────────────────────────────────
  {
    section: "Dashboards & Business Intelligence",
    color: "from-indigo-600 to-indigo-800",
    items: [
      { label: "Admin Dashboard",           sub: "Main operations hub",         icon: LayoutDashboard,href: "/admin/dashboard",        kpiKey: "totalBookings",  kpiLabel: "bookings",  color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
      { label: "Executive Dashboard",       sub: "KPIs & executive view",       icon: Monitor,        href: "/admin/executive",        kpiKey: "totalRevenue",   kpiLabel: "revenue",   color: "bg-blue-100",    textColor: "text-blue-700",    borderHover: "hover:border-blue-400" },
      { label: "Operations Dashboard",      sub: "Day-to-day operations",       icon: Activity,       href: "/admin/operations",       kpiKey: "pendingPayments",kpiLabel: "pending",   color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Manager Dashboard",         sub: "Team performance",            icon: BarChart3,      href: "/admin/manager",          kpiKey: "staff",          kpiLabel: "staff",     color: "bg-violet-100",  textColor: "text-violet-700",  borderHover: "hover:border-violet-400" },
      { label: "Staff Dashboard",           sub: "Staff view & tasks",          icon: ClipboardList,  href: "/admin/staff-dashboard",  kpiKey: "staff2",         kpiLabel: "staff",     color: "bg-purple-100",  textColor: "text-purple-700",  borderHover: "hover:border-purple-400" },
      { label: "Customer Dashboard",        sub: "Customer-facing portal",      icon: Users2,         href: "/admin/customer-dashboard",kpiKey: "customers",     kpiLabel: "customers", color: "bg-fuchsia-100", textColor: "text-fuchsia-700", borderHover: "hover:border-fuchsia-400" },
      { label: "Business Intelligence Dashboard",sub:"Trends & insights",       icon: PieChart,       href: "/admin/bi",               kpiKey: "biCount",        kpiLabel: "metrics",   color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
    ],
  },
  // ── 3. Finance & Accounting ─────────────────────────────────────────────────
  {
    section: "Finance & Accounting",
    color: "from-emerald-600 to-emerald-800",
    items: [
      { label: "Finance Dashboard",         sub: "P&L, cash flow, ledger",      icon: IndianRupee,    href: "/admin/finance",          kpiKey: "totalRevenue",   kpiLabel: "revenue",   color: "bg-emerald-100", textColor: "text-emerald-700", borderHover: "hover:border-emerald-400" },
      { label: "Accounting Dashboard",      sub: "Books & journal entries",      icon: Calculator,     href: "/admin/accounting",       kpiKey: "pendingPayments",kpiLabel: "pending",   color: "bg-green-100",   textColor: "text-green-700",   borderHover: "hover:border-green-400" },
      { label: "Payment Dashboard",         sub: "Transactions & receipts",      icon: CreditCard,     href: "/admin/payments",         kpiKey: "todayPayments",  kpiLabel: "today",     color: "bg-lime-100",    textColor: "text-lime-700",    borderHover: "hover:border-lime-400" },
      { label: "Offline Payments",          sub: "Bank transfer approvals",      icon: Banknote,       href: "/admin/offline-payments", kpiKey: "offlinePayments",kpiLabel: "pending",   color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "Invoice Dashboard",         sub: "Invoice management",           icon: BookOpen,       href: "/admin/invoices",         kpiKey: "invoices",       kpiLabel: "invoices",  color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
      { label: "Receipt Dashboard",         sub: "Payment receipts",             icon: Receipt,        href: "/admin/receipts",         kpiKey: "receipts",       kpiLabel: "receipts",  color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Expenses",                  sub: "Expense tracking",             icon: Wallet,         href: "/admin/expenses",         kpiKey: "expenses",       kpiLabel: "entries",   color: "bg-orange-100",  textColor: "text-orange-700",  borderHover: "hover:border-orange-400" },
      { label: "Customer Ledger",           sub: "Per-customer accounts",        icon: BookUser,       href: "/admin/customer-ledger",  kpiKey: "customers",      kpiLabel: "customers", color: "bg-amber-100",   textColor: "text-amber-700",   borderHover: "hover:border-amber-400" },
      { label: "Family Ledger",             sub: "Family payment records",       icon: HeartHandshake, href: "/admin/family-ledger",    kpiKey: "customers",      kpiLabel: "families",  color: "bg-yellow-100",  textColor: "text-yellow-700",  borderHover: "hover:border-yellow-400" },
    ],
  },
  // ── 4. CRM, Sales & Loyalty ─────────────────────────────────────────────────
  {
    section: "CRM, Sales & Loyalty",
    color: "from-blue-600 to-blue-800",
    items: [
      { label: "CRM Dashboard",            sub: "Leads & pipeline",             icon: Target,         href: "/admin/crm",              kpiKey: "leads",          kpiLabel: "leads",     color: "bg-blue-100",    textColor: "text-blue-700",    borderHover: "hover:border-blue-400" },
      { label: "Lead Manager",             sub: "Lead tracking & follow-up",    icon: TrendingUp,     href: "/admin/leads",            kpiKey: "leads",          kpiLabel: "leads",     color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Lead Dashboard",           sub: "Lead analytics & pipeline",    icon: BarChart2,      href: "/admin/leads",            kpiKey: "leads",          kpiLabel: "pipeline",  color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
      { label: "Customer 360°",            sub: "Full customer profile",        icon: Users2,         href: "/admin/customer360",      kpiKey: "customers",      kpiLabel: "profiles",  color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
      { label: "Loyalty & Rewards",        sub: "Points & redemptions",         icon: Gift,           href: "/admin/loyalty",          kpiKey: "loyaltyMembers", kpiLabel: "members",   color: "bg-violet-100",  textColor: "text-violet-700",  borderHover: "hover:border-violet-400" },
      { label: "SRM Dashboard",            sub: "Supplier relationships",       icon: Handshake,      href: "/admin/srm",              kpiKey: "vendors",        kpiLabel: "vendors",   color: "bg-purple-100",  textColor: "text-purple-700",  borderHover: "hover:border-purple-400" },
      { label: "Supplier Dashboard",       sub: "Supplier directory",           icon: Truck,          href: "/admin/suppliers",        kpiKey: "suppliers",      kpiLabel: "suppliers", color: "bg-fuchsia-100", textColor: "text-fuchsia-700", borderHover: "hover:border-fuchsia-400" },
      { label: "Marketing Dashboard",      sub: "Campaigns & broadcasts",       icon: Megaphone,      href: "/admin/marketing",        kpiKey: "broadcasts",     kpiLabel: "campaigns", color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
    ],
  },
  // ── 5. HR & Workforce ───────────────────────────────────────────────────────
  {
    section: "HR & Workforce",
    color: "from-amber-600 to-amber-800",
    items: [
      { label: "HR Dashboard",             sub: "Staff & HR management",        icon: Briefcase,      href: "/admin/hr",               kpiKey: "staff",          kpiLabel: "staff",     color: "bg-amber-100",   textColor: "text-amber-700",   borderHover: "hover:border-amber-400" },
      { label: "Staff Manager",            sub: "Staff records & roles",        icon: Users,          href: "/admin/staff",            kpiKey: "staff",          kpiLabel: "staff",     color: "bg-orange-100",  textColor: "text-orange-700",  borderHover: "hover:border-orange-400" },
      { label: "Payroll Dashboard",        sub: "Salary & payslips",            icon: IndianRupee,    href: "/admin/payroll",          kpiKey: "staff",          kpiLabel: "staff",     color: "bg-yellow-100",  textColor: "text-yellow-700",  borderHover: "hover:border-yellow-400" },
      { label: "Inventory Dashboard",      sub: "Stock & equipment",            icon: Package,        href: "/admin/inventory",        kpiKey: "assets",         kpiLabel: "items",     color: "bg-lime-100",    textColor: "text-lime-700",    borderHover: "hover:border-lime-400" },
      { label: "Procurement Dashboard",    sub: "Purchase orders",              icon: ShoppingCart,   href: "/admin/procurement",      kpiKey: "expenses",       kpiLabel: "orders",    color: "bg-green-100",   textColor: "text-green-700",   borderHover: "hover:border-green-400" },
    ],
  },
  // ── 6. Bookings & Pilgrim Operations ────────────────────────────────────────
  {
    section: "Bookings & Pilgrim Operations",
    color: "from-rose-600 to-rose-800",
    items: [
      { label: "Bookings",                 sub: "All booking records",          icon: CalendarRange,  href: "/admin/bookings",         kpiKey: "totalBookings",  kpiLabel: "bookings",  color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
      { label: "Offline Booking",          sub: "Manual & walk-in bookings",    icon: BookMarked,     href: "/admin/offline-bookings", kpiKey: "offlineBookings",kpiLabel: "pending",   color: "bg-pink-100",    textColor: "text-pink-700",    borderHover: "hover:border-pink-400" },
      { label: "Hajj Groups",              sub: "Hajj group management",        icon: Users,          href: "/admin/groups",           kpiKey: "groups",         kpiLabel: "groups",    color: "bg-fuchsia-100", textColor: "text-fuchsia-700", borderHover: "hover:border-fuchsia-400" },
      { label: "Umrah Groups",             sub: "Umrah group management",       icon: Users2,         href: "/admin/groups",           kpiKey: "groups",         kpiLabel: "groups",    color: "bg-purple-100",  textColor: "text-purple-700",  borderHover: "hover:border-purple-400" },
      { label: "Visa Dashboard",           sub: "Visa status & processing",     icon: FileCheck,      href: "/admin/visa",             kpiKey: "pendingVisas",   kpiLabel: "pending",   color: "bg-purple-100",  textColor: "text-purple-700",  borderHover: "hover:border-purple-400" },
      { label: "Flight Dashboard",         sub: "Flight management",            icon: Plane,          href: "/admin/flights",          kpiKey: "flights",        kpiLabel: "flights",   color: "bg-violet-100",  textColor: "text-violet-700",  borderHover: "hover:border-violet-400" },
      { label: "Hotel Dashboard",          sub: "Hotel management",             icon: Hotel,          href: "/admin/hotels",           kpiKey: "hotels",         kpiLabel: "hotels",    color: "bg-blue-100",    textColor: "text-blue-700",    borderHover: "hover:border-blue-400" },
      { label: "Transport Dashboard",      sub: "Buses & vehicles",             icon: Bus,            href: "/admin/buses",            kpiKey: "buses",          kpiLabel: "vehicles",  color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Room Allocation Dashboard",sub: "Mina / Arafat / Muzd.",        icon: Tent,           href: "/admin/allocations",      kpiKey: "allocations",    kpiLabel: "allocated", color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
      { label: "Ziyarat Schedule",         sub: "Ziyarat planning",             icon: MapPin,         href: "/admin/ziyarat",          kpiKey: "ziyarats",       kpiLabel: "trips",     color: "bg-emerald-100", textColor: "text-emerald-700", borderHover: "hover:border-emerald-400" },
      { label: "Guide Panel",              sub: "Tour guide management",        icon: Compass,        href: "/admin/guide-panel",      kpiKey: "guides",         kpiLabel: "guides",    color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "Pilgrim Reports",          sub: "Pilgrim data & reports",       icon: FileSpreadsheet,href: "/admin/pilgrim-reports",  kpiKey: "pilgrims",       kpiLabel: "pilgrims",  color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
      { label: "Print Center",             sub: "ID cards, labels & docs",      icon: Printer,        href: "/admin/print-center",     kpiKey: "printJobs",      kpiLabel: "jobs",      color: "bg-green-100",   textColor: "text-green-700",   borderHover: "hover:border-green-400" },
      { label: "QR Tracker",               sub: "Pilgrim QR scanning",          icon: QrCode,         href: "/admin/qr-tracker",       kpiKey: "qrScans",        kpiLabel: "scanned",   color: "bg-lime-100",    textColor: "text-lime-700",    borderHover: "hover:border-lime-400" },
      { label: "KYC Management",           sub: "Document verification",        icon: ShieldCheck,    href: "/admin/kyc",              kpiKey: "kycPending",     kpiLabel: "pending",   color: "bg-orange-100",  textColor: "text-orange-700",  borderHover: "hover:border-orange-400" },
      { label: "Certificates",             sub: "Hajj certificates",            icon: Award,          href: "/admin/certificates",     kpiKey: "certificates",   kpiLabel: "issued",    color: "bg-amber-100",   textColor: "text-amber-700",   borderHover: "hover:border-amber-400" },
      { label: "Agreement Dashboard",      sub: "Contracts & digital sign",     icon: Scale,          href: "/admin/agreements",       kpiKey: "agreements",     kpiLabel: "agreements",color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
      { label: "Document Management Dashboard",sub:"Passport, Aadhaar & docs",  icon: FileText,       href: "/admin/document-expiry",  kpiKey: "documents",      kpiLabel: "docs",      color: "bg-pink-100",    textColor: "text-pink-700",    borderHover: "hover:border-pink-400" },
    ],
  },
  // ── 7. Communication & Automation ───────────────────────────────────────────
  {
    section: "Communication & Automation",
    color: "from-teal-600 to-teal-800",
    items: [
      { label: "WhatsApp Dashboard",       sub: "Messages & templates",         icon: MessageSquare,  href: "/admin/botbee-dashboard",     kpiKey: "whatsappSent",kpiLabel: "sent",      color: "bg-emerald-100", textColor: "text-emerald-700", borderHover: "hover:border-emerald-400" },
      { label: "SMS Dashboard",            sub: "DLT & SMS campaigns",          icon: Smartphone,     href: "/admin/sms-production-report",kpiKey: "smsSent",     kpiLabel: "sent",      color: "bg-blue-100",    textColor: "text-blue-700",    borderHover: "hover:border-blue-400" },
      { label: "Email Dashboard",          sub: "Templates & delivery",         icon: Mail,           href: "/admin/email-templates",      kpiKey: "emailSent",   kpiLabel: "sent",      color: "bg-violet-100",  textColor: "text-violet-700",  borderHover: "hover:border-violet-400" },
      { label: "Social Media Integration Management", sub: "All social channels", icon: Share2,        href: "/admin/social-media",         kpiKey: "socialPosts", kpiLabel: "channels",  color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Omni Channel Dashboard",   sub: "Multi-channel overview",       icon: LayoutGrid,     href: "/admin/inbox",                kpiKey: "inboxCount",  kpiLabel: "channels",  color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
      { label: "Omnichannel Inbox",        sub: "Unified message inbox",        icon: Inbox,          href: "/admin/inbox",                kpiKey: "inboxCount",  kpiLabel: "unread",    color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Broadcast Center",         sub: "Mass messaging",               icon: Radio,          href: "/admin/broadcast",            kpiKey: "broadcasts",  kpiLabel: "sent",      color: "bg-purple-100",  textColor: "text-purple-700",  borderHover: "hover:border-purple-400" },
      { label: "Automation Center",        sub: "Workflows & triggers",         icon: Bot,            href: "/admin/automation-center",    kpiKey: "automations", kpiLabel: "rules",     color: "bg-fuchsia-100", textColor: "text-fuchsia-700", borderHover: "hover:border-fuchsia-400" },
      { label: "Communication Center",     sub: "Templates & channels",         icon: MessageCircle,  href: "/admin/communication-center", kpiKey: "commCount",   kpiLabel: "templates", color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
      { label: "Notification Center",       sub: "Push & in-app notifications",  icon: Bell,           href: "/admin/notifications",        kpiKey: "notifHealth", kpiLabel: "monitored", color: "bg-pink-100",    textColor: "text-pink-700",    borderHover: "hover:border-pink-400" },
      { label: "Website CMS Dashboard",    sub: "Public pages & content",       icon: Globe,          href: "/admin/settings",             kpiKey: "cmsPages",    kpiLabel: "pages",     color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "Mobile App Dashboard",     sub: "App configuration",            icon: LayoutGrid,     href: "/admin/api-settings",         kpiKey: "appUsers",    kpiLabel: "users",     color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
    ],
  },
  // ── 8. Reports & Analytics ──────────────────────────────────────────────────
  {
    section: "Reports & Analytics",
    color: "from-slate-600 to-slate-800",
    items: [
      { label: "Reports Dashboard",        sub: "Operational reports",          icon: BarChart2,      href: "/admin/reports",          kpiKey: "reportCount",    kpiLabel: "reports",   color: "bg-slate-100",   textColor: "text-slate-700",   borderHover: "hover:border-slate-400" },
      { label: "Business Intelligence Dashboard",sub:"Trends & BI dashboard",   icon: TrendingUp,     href: "/admin/bi",               kpiKey: "biCount",        kpiLabel: "metrics",   color: "bg-gray-100",    textColor: "text-gray-700",    borderHover: "hover:border-gray-400" },
      { label: "AI Analytics Dashboard",   sub: "ML-powered insights",          icon: Brain,          href: "/admin/ai-ops",           kpiKey: "aiCount",        kpiLabel: "models",    color: "bg-zinc-100",    textColor: "text-zinc-700",    borderHover: "hover:border-zinc-400" },
      { label: "Production Report",        sub: "System performance report",    icon: BarChart3,      href: "/admin/production-report",kpiKey: "prodReports",    kpiLabel: "reports",   color: "bg-stone-100",   textColor: "text-stone-700",   borderHover: "hover:border-stone-400" },
      { label: "GST Reports",              sub: "Tax reports & filing",         icon: FileText,       href: "/admin/gst-reports",      kpiKey: "gstFiled",       kpiLabel: "filed",     color: "bg-neutral-100", textColor: "text-neutral-700", borderHover: "hover:border-neutral-400" },
    ],
  },
  // ── 9. Tools & Operations ───────────────────────────────────────────────────
  {
    section: "Tools & Operations",
    color: "from-orange-600 to-orange-800",
    items: [
      { label: "Global Search",            sub: "Search across all data",       icon: Search,         href: "/admin/search",           kpiKey: "searchCount",    kpiLabel: "indexed",   color: "bg-orange-100",  textColor: "text-orange-700",  borderHover: "hover:border-orange-400" },
      { label: "AI Assistant",             sub: "AI-powered chat & help",       icon: Brain,          href: "/admin/ai",               kpiKey: "aiQueries",      kpiLabel: "queries",   color: "bg-amber-100",   textColor: "text-amber-700",   borderHover: "hover:border-amber-400" },
      { label: "Admin AI Chat",            sub: "Internal AI chat",             icon: MessageCircle,  href: "/admin/chat",             kpiKey: "chatSessions",   kpiLabel: "sessions",  color: "bg-yellow-100",  textColor: "text-yellow-700",  borderHover: "hover:border-yellow-400" },
      { label: "Workflow Center",          sub: "Automation workflows",         icon: GitBranch,      href: "/admin/workflow-center",  kpiKey: "workflows",      kpiLabel: "active",    color: "bg-lime-100",    textColor: "text-lime-700",    borderHover: "hover:border-lime-400" },
      { label: "Task Manager",             sub: "Team tasks & assignments",     icon: ListTodo,       href: "/admin/tasks",            kpiKey: "tasks",          kpiLabel: "open",      color: "bg-green-100",   textColor: "text-green-700",   borderHover: "hover:border-green-400" },
      { label: "Support Center",           sub: "Customer support tickets",     icon: Headphones,     href: "/admin/support",          kpiKey: "supportTickets", kpiLabel: "open",      color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "AI Operations",            sub: "AI model management",          icon: Sparkles,       href: "/admin/ai-ops",           kpiKey: "aiOpsCount",     kpiLabel: "models",    color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
    ],
  },
  // ── 10. Administration & Security ───────────────────────────────────────────
  {
    section: "Administration & Security",
    color: "from-red-600 to-red-800",
    items: [
      { label: "User & Role Management",   sub: "Accounts & permissions",       icon: KeyRound,       href: "/admin/user-roles",       kpiKey: "adminUsers",     kpiLabel: "users",     color: "bg-red-100",     textColor: "text-red-700",     borderHover: "hover:border-red-400" },
      { label: "Permission Management",    sub: "Role permission matrix",       icon: ShieldCheck,    href: "/admin/permissions",      kpiKey: "roles",          kpiLabel: "roles",     color: "bg-rose-100",    textColor: "text-rose-700",    borderHover: "hover:border-rose-400" },
      { label: "Audit Log Dashboard",      sub: "All system activity",          icon: ClipboardList,  href: "/admin/audit-logs",       kpiKey: "auditLogs",      kpiLabel: "events",    color: "bg-orange-100",  textColor: "text-orange-700",  borderHover: "hover:border-orange-400" },
      { label: "Activity Log Dashboard",   sub: "User activity stream",         icon: Activity,       href: "/admin/activity-logs",    kpiKey: "activityLogs",   kpiLabel: "events",    color: "bg-amber-100",   textColor: "text-amber-700",   borderHover: "hover:border-amber-400" },
      { label: "Security Dashboard",       sub: "System health & alerts",       icon: Lock,           href: "/admin/security",         kpiKey: "securityEvents", kpiLabel: "alerts",    color: "bg-yellow-100",  textColor: "text-yellow-700",  borderHover: "hover:border-yellow-400" },
      { label: "System Health",            sub: "Server & API health",          icon: Activity,       href: "/admin/system-health",    kpiKey: "healthScore",    kpiLabel: "uptime",    color: "bg-lime-100",    textColor: "text-lime-700",    borderHover: "hover:border-lime-400" },
      { label: "Backup Dashboard",         sub: "Data backups & restore",       icon: Archive,        href: "/admin/backups",          kpiKey: "backups",        kpiLabel: "backups",   color: "bg-green-100",   textColor: "text-green-700",   borderHover: "hover:border-green-400" },
      { label: "API Dashboard",            sub: "API keys & endpoints",         icon: Code2,          href: "/admin/api-settings",     kpiKey: "apiKeys",        kpiLabel: "keys",      color: "bg-teal-100",    textColor: "text-teal-700",    borderHover: "hover:border-teal-400" },
      { label: "Integration Dashboard",    sub: "Third-party connections",      icon: Plug,           href: "/admin/integrations",     kpiKey: "integrations",   kpiLabel: "connected", color: "bg-cyan-100",    textColor: "text-cyan-700",    borderHover: "hover:border-cyan-400" },
      { label: "Settings Dashboard",       sub: "Company configuration",        icon: Settings2,      href: "/admin/settings",         kpiKey: "settings",       kpiLabel: "modules",   color: "bg-sky-100",     textColor: "text-sky-700",     borderHover: "hover:border-sky-400" },
      { label: "Billing Settings",         sub: "Plans & subscription",         icon: CreditCard,     href: "/admin/billing-settings", kpiKey: "billing",        kpiLabel: "plan",      color: "bg-indigo-100",  textColor: "text-indigo-700",  borderHover: "hover:border-indigo-400" },
    ],
  },
];

// ── Module Card ───────────────────────────────────────────────────────────────
function ModuleCard({ mod, kpis }: { mod: Module; kpis: Record<string, string | number> }) {
  const kpiVal = mod.kpiKey ? (kpis[mod.kpiKey] ?? "—") : "—";
  return (
    <Link href={mod.href}>
      <div className={`group relative rounded-2xl border-2 border-border bg-card p-5 cursor-pointer transition-all duration-200 hover:shadow-lg ${mod.borderHover} hover:-translate-y-0.5 flex flex-col gap-3 h-full`}>
        <div className="flex items-start justify-between">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${mod.color} shrink-0`}>
            <mod.icon size={22} className={mod.textColor} />
          </div>
          <span className={`text-2xl font-bold font-mono ${mod.textColor}`}>{kpiVal}</span>
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{mod.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{mod.sub}</p>
        </div>
        {mod.kpiLabel && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{mod.kpiLabel}</p>
        )}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
          <Zap size={14} />
        </div>
      </div>
    </Link>
  );
}

// ── Hero KPI Bar ──────────────────────────────────────────────────────────────
function HeroKpi({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl bg-white border ${color}`}>
      <Icon size={20} className="text-muted-foreground shrink-0" />
      <div>
        <p className="text-xl font-bold font-mono">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SuperDashboard() {
  const [stats, setStats]   = useState<any>({});
  const [extra, setExtra]   = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [time, setTime]     = useState(new Date());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, agents, branches, staff, customers, vendors, assets, expenses, leads, adminUsers, agreements] = await Promise.all([
        fetch(`${API}/api/admin/super-stats`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/api/admin/agents`,      { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin/branches`,    { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/staff`,             { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin/customers`,   { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/vendors`,           { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/assets`,            { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/expenses`,          { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/enterprise/leads`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin-users`,       { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/agreements`,        { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setStats(s);
      setExtra({
        agents:      Array.isArray(agents)     ? agents.length     : 0,
        branches:    Array.isArray(branches)   ? branches.length   : 0,
        staff:       Array.isArray(staff)      ? staff.length      : 0,
        customers:   Array.isArray(customers)  ? customers.length  : 0,
        vendors:     Array.isArray(vendors)    ? vendors.length    : 0,
        assets:      Array.isArray(assets)     ? assets.length     : 0,
        expenses:    Array.isArray(expenses)   ? expenses.length   : 0,
        leads:       Array.isArray(leads)      ? leads.length      : 0,
        adminUsers:  Array.isArray(adminUsers) ? adminUsers.length : 0,
        agreements:  Array.isArray(agreements) ? agreements.length : 0,
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); const i = setInterval(loadAll, 120_000); return () => clearInterval(i); }, [loadAll]);
  useEffect(() => { const i = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(i); }, []);

  // ── Build KPI map for cards ────────────────────────────────────────────────
  const kpis: Record<string, string | number> = {
    totalPending:    (stats.pending?.approvals || 0) + (stats.pending?.payments || 0) + (stats.pending?.visas || 0),
    totalBookings:   stats.overall?.totalBookings   || 0,
    totalRevenue:    fmt(stats.overall?.totalRevenue || 0),
    branches:        extra.branches   || 0,
    agents:          extra.agents     || 0,
    staff:           extra.staff      || 0,
    customers:       extra.customers  || 0,
    guides:          stats.overall?.guides           || 0,
    pendingPayments: stats.pending?.payments         || 0,
    todayPayments:   stats.today?.payments           || 0,
    invoices:        stats.overall?.totalBookings    || 0,
    receipts:        stats.overall?.totalBookings    || 0,
    leads:           extra.leads    || 0,
    vendors:         extra.vendors  || 0,
    suppliers:       extra.vendors  || 0,
    broadcasts:      0,
    staff2:          extra.staff    || 0,
    assets:          extra.assets   || 0,
    expenses:        extra.expenses || 0,
    pendingVisas:    stats.pending?.visas            || 0,
    flights:         stats.flights?.total            || 0,
    hotels:          stats.hotels?.total             || 0,
    buses:           0,
    allocations:     0,
    documents:       extra.documents || 0,
    agreements:      extra.agreements || 0,
    reportCount:     0,
    prodReports:     0,
    biCount:         0,
    aiCount:         0,
    aiOpsCount:      0,
    whatsappSent:    stats.notifications?.whatsapp?.total || 0,
    smsSent:         stats.notifications?.sms?.total      || 0,
    emailSent:       stats.notifications?.email?.total    || 0,
    cmsPages:        0,
    appUsers:        0,
    socialPosts:     0,
    inboxCount:      0,
    automations:     0,
    commCount:       stats.notifications?.whatsapp?.total || 0,
    notifHealth:     100,
    chatSessions:    0,
    workflows:       0,
    tasks:           0,
    supportTickets:  stats.pending?.supportTickets   || 0,
    groups:          0,
    pilgrims:        stats.pilgrims?.total           || 0,
    offlineBookings: 0,
    kycPending:      0,
    certificates:    0,
    ziyarats:        0,
    printJobs:       0,
    qrScans:         0,
    adminUsers:      extra.adminUsers || 0,
    roles:           0,
    auditLogs:       0,
    activityLogs:    0,
    securityEvents:  0,
    healthScore:     100,
    backups:         0,
    apiKeys:         0,
    integrations:    0,
    settings:        0,
    billing:         0,
    searchCount:     0,
    aiQueries:       0,
    gstFiled:        0,
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-8 py-7 flex items-center justify-between gap-6 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                <Sparkles size={22} className="text-amber-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Enterprise Command Center</h1>
                <p className="text-sm text-white/50">Al Burhan Tours & Travels — ERP v3</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-right">
              <p className="text-2xl font-mono font-bold text-amber-300">{time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
              <p className="text-xs text-white/50">{time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2.5 transition-all"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* ── Live KPI Bar ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-3">
          <HeroKpi label="Total Revenue"       value={`₹${fmt(stats.overall?.totalRevenue || 0)}`}               icon={IndianRupee} color="border-emerald-200" />
          <HeroKpi label="Total Bookings"      value={String(stats.overall?.totalBookings || 0)}                 icon={BookOpen}    color="border-blue-200" />
          <HeroKpi label="Outstanding"         value={`₹${fmt(stats.overall?.outstanding || 0)}`}                icon={AlertCircle} color="border-amber-200" />
          <HeroKpi label="Today's Collections" value={`₹${fmt(stats.today?.revenue || 0)}`}                     icon={TrendingUp}  color="border-violet-200" />
          <HeroKpi label="Customers"           value={String(extra.customers || stats.overall?.totalCustomers || 0)} icon={Users}   color="border-rose-200" />
          <HeroKpi label="Branches"            value={String(extra.branches || 0)}                               icon={Building2}   color="border-cyan-200" />
          <HeroKpi label="Staff"               value={String(extra.staff || 0)}                                  icon={Users2}      color="border-sky-200" />
          <HeroKpi label="Guides"              value={String(stats.overall?.guides || 0)}                        icon={Compass}     color="border-teal-200" />
          <HeroKpi label="Notifications"       value={String(stats.overall?.totalNotifSent || 0)}               icon={Bell}        color="border-purple-200" />
          <HeroKpi label="System Health"       value={`${stats.overall?.systemHealth ?? 100}%`}                  icon={Activity}    color="border-green-200" />
        </div>

        {/* ── Module Grid ────────────────────────────────────────────────── */}
        {MODULES.map(group => (
          <section key={group.section} id={group.section.toLowerCase().replace(/\s+&\s+/g,"-").replace(/[^a-z0-9]+/g,"-")} className="space-y-4">
            {/* Section header */}
            <div className={`rounded-2xl bg-gradient-to-r ${group.color} px-5 py-3 flex items-center gap-3`}>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">{group.section}</h2>
              <span className="text-white/40 text-xs ml-auto">{group.items.length} modules</span>
            </div>
            {/* Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.items.map(mod => (
                <ModuleCard key={mod.href + mod.label} mod={mod} kpis={kpis} />
              ))}
            </div>
          </section>
        ))}

        {/* ── Notification Health ─────────────────────────────────────── */}
        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Notification Delivery (Last 7 Days)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { ch: "WhatsApp", data: stats.notifications?.whatsapp, color: "bg-emerald-500" },
              { ch: "SMS",      data: stats.notifications?.sms,       color: "bg-blue-500" },
              { ch: "Email",    data: stats.notifications?.email,      color: "bg-violet-500" },
            ].map(({ ch, data, color }) => (
              <div key={ch} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{ch}</span>
                  <span className="text-muted-foreground">{data?.total || 0} sent · {data?.rate || 0}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${data?.rate || 0}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="text-emerald-600">✓ {data?.delivered || 0}</span>
                  <span className="text-red-500">✗ {data?.failed || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pilgrim Status ──────────────────────────────────────────── */}
        {stats.pilgrims && (
          <section className="rounded-2xl border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Pilgrim Status</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Pilgrims",  val: stats.pilgrims?.total || 0,          color: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Visa Received",   val: stats.pilgrims?.receivedVisas || 0,  color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                { label: "Processing",      val: stats.pilgrims?.processingVisas || 0,color: "bg-amber-50 border-amber-200 text-amber-700" },
                { label: "Visa Pending",    val: stats.pilgrims?.pendingVisas || 0,   color: "bg-red-50 border-red-200 text-red-700" },
              ].map(k => (
                <div key={k.label} className={`rounded-xl border p-4 text-center ${k.color}`}>
                  <p className="text-2xl font-bold font-mono">{k.val}</p>
                  <p className="text-xs mt-1 opacity-70">{k.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Customer Satisfaction ───────────────────────────────────── */}
        {(stats.satisfaction?.totalReviews || 0) > 0 && (
          <section className="rounded-2xl border bg-card p-6 flex items-center gap-8 flex-wrap">
            <div className="text-center">
              <div className="flex items-center gap-2">
                <Star size={32} className="text-amber-500 fill-amber-400" />
                <span className="text-4xl font-bold font-mono">{stats.satisfaction?.avgRating?.toFixed(1)}</span>
                <span className="text-muted-foreground">/5</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.satisfaction?.totalReviews} reviews</p>
            </div>
            <div className="flex-1 min-w-48 space-y-1.5">
              {[5,4,3,2,1].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs w-4 text-muted-foreground">{s}★</span>
                  <div className="flex-1 h-2 bg-muted rounded-full" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
