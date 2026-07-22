/**
 * SINGLE SOURCE OF TRUTH — Navigation
 *
 * All sidebar items, sections, and icons live here.
 * AdminLayout.tsx IMPORTS this; it never defines its own menu.
 *
 * Rules:
 *  1. Add new pages here first, then add the Route in App.tsx.
 *  2. Never add nav items inside AdminLayout.tsx.
 *  3. Never duplicate a section or item.
 *  4. The pre-build check (scripts/check-nav.mjs) will FAIL the build if any
 *     href registered here is missing from App.tsx routes.
 *
 * Sections (14 expandable):
 *  Overview · Operations · Bookings · Finance · Pilgrims
 *  CRM & SRM · HR · Inventory · Travel Operations
 *  Communication · Reports · AI · Administration · System
 */

import {
  LayoutDashboard, PackageSearch, Users, BookOpen, MessageSquare,
  ImageIcon, UsersRound, Receipt, ClipboardPlus, ScanLine, BarChart2,
  Printer, Megaphone, ShieldCheck, Inbox, PieChart, Star, BadgeCheck, Droplets,
  TrendingDown, TrendingUp, Calculator, Plane, Activity, Home, CreditCard, Trash2,
  Building2, Bus, Heart, FileCheck, Sparkles, UserCheck, BookMarked, Truck,
  Scale, Users2, Package, ClipboardList, KeyRound, HeartPulse, Settings2, BellRing, Zap,
  MapPin, Tent, Tag, Bot, Award, Smartphone, Layers, Mail, Globe, FileText, TestTube2, History,
  Headphones, Target, Brain, AlarmClock, Handshake, Briefcase, ShoppingCart,
  Workflow, Hotel, IndianRupee, LayoutGrid, Code2, Plug, Lock, Archive, Shield, Share2,
} from "lucide-react";
import type { Module, Action } from "@/hooks/use-permissions";

export interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: number;
  /** [module, action] — item is hidden if role cannot perform this */
  require?: [Module, Action];
  /** Only visible to super_admin adminRole */
  requireSuper?: boolean;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/**
 * Master navigation definition — 14 expandable sections.
 * `openComplaints` is the only runtime value injected (badge counter).
 */
export function buildNavSections(openComplaints = 0): NavSection[] {
  return [

    // ── 1. OVERVIEW ─────────────────────────────────────────────────────────
    {
      section: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard",             href: "/admin/dashboard" },
        { icon: Activity,        label: "Operations Dashboard",  href: "/admin/operations",        require: ["bookings", "view"] },
        { icon: PieChart,        label: "Executive Dashboard",   href: "/admin/executive",         require: ["reports",  "view"] },
        { icon: TrendingUp,      label: "Business Intelligence", href: "/admin/bi",                require: ["reports",  "view"] },
        { icon: Users2,          label: "Manager Dashboard",     href: "/admin/manager",           require: ["groups",   "view"] },
        { icon: Sparkles,        label: "Super Admin Dashboard", href: "/admin/super",             requireSuper: true },
        { icon: Users,           label: "Staff Dashboard",       href: "/admin/staff-dashboard",   require: ["staff",    "view"] },
        { icon: Users,           label: "Customer Dashboard",    href: "/admin/customer-dashboard",require: ["customers","view"] },
      ],
    },

    // ── 2. OPERATIONS ────────────────────────────────────────────────────────
    {
      section: "Operations",
      items: [
        { icon: BookOpen,      label: "Bookings",            href: "/admin/bookings",          require: ["bookings",   "view"]   },
        { icon: ClipboardPlus, label: "Offline Booking",     href: "/admin/offline-bookings",  require: ["bookings",   "create"] },
        { icon: Trash2,        label: "Booking Trash",       href: "/admin/bookings?tab=trash",require: ["bookings",   "delete"] },
        { icon: Trash2,        label: "Payment Trash",       href: "/admin/payment-trash",     require: ["payments",   "delete"] },
        { icon: Bot,           label: "Automation Center",   href: "/admin/automation-center", require: ["bookings",   "edit"]   },
      ],
    },

    // ── 3. BOOKINGS & PAYMENTS ───────────────────────────────────────────────
    {
      section: "Bookings",
      items: [
        { icon: Receipt,       label: "Invoices",            href: "/admin/invoices",          require: ["bookings",   "view"]   },
        { icon: CreditCard,    label: "Payments",            href: "/admin/payments",          require: ["payments",   "view"]   },
        { icon: BarChart2,     label: "Payment Analytics",   href: "/admin/payment-analytics", require: ["payments",   "view"]   },
        { icon: AlarmClock,    label: "Payment Reminders",   href: "/admin/payment-reminders", require: ["payments",   "view"]   },
        { icon: Building2,     label: "Offline Payments",    href: "/admin/offline-payments",  require: ["payments",   "view"]   },
        { icon: IndianRupee,   label: "Receipts",            href: "/admin/receipts",          require: ["payments",   "view"]   },
      ],
    },

    // ── 4. FINANCE ───────────────────────────────────────────────────────────
    {
      section: "Finance",
      items: [
        { icon: TrendingDown,  label: "Expenses",            href: "/admin/expenses",          require: ["expenses",   "view"]   },
        { icon: Calculator,    label: "Accounting",          href: "/admin/accounting",        require: ["accounting", "view"]   },
        { icon: BarChart2,     label: "Finance Hub",         href: "/admin/finance",           require: ["accounting", "view"]   },
        { icon: Home,          label: "Family Ledger",       href: "/admin/family-ledger",     require: ["accounting", "view"]   },
        { icon: UserCheck,     label: "Customer Ledger",     href: "/admin/customer-ledger",   require: ["customers",  "view"]   },
        { icon: BookMarked,    label: "Hajji Ledger",        href: "/admin/hajji-ledger",      require: ["groups",     "view"]   },
        { icon: Scale,         label: "GST Reports",         href: "/admin/gst-reports",       require: ["gst",        "view"]   },
        { icon: Users2,        label: "Payroll",             href: "/admin/payroll",           require: ["payroll",    "view"]   },
      ],
    },

    // ── 5. PILGRIMS ──────────────────────────────────────────────────────────
    {
      section: "Pilgrims",
      items: [
        { icon: UsersRound,    label: "Hajj Groups",         href: "/admin/groups",            require: ["groups",   "view"]   },
        { icon: Heart,         label: "Medical",             href: "/admin/medical",           require: ["pilgrims", "view"]   },
        { icon: FileCheck,     label: "Visa Tracker",        href: "/admin/visa",              require: ["pilgrims", "view"]   },
        { icon: ClipboardList, label: "Pilgrim Reports",     href: "/admin/pilgrim-reports",   require: ["pilgrims", "view"]   },
        { icon: Activity,      label: "Pilgrim Operations",  href: "/admin/pilgrim-ops",       require: ["pilgrims", "view"]   },
        { icon: ScanLine,      label: "Group Tracking",      href: "/admin/group-tracking",    require: ["groups",   "view"]   },
        { icon: BadgeCheck,    label: "Certificates",        href: "/admin/certificates",      require: ["pilgrims", "view"]   },
        { icon: FileText,      label: "Document Management", href: "/admin/documents",         require: ["pilgrims", "view"]   },
        { icon: FileText,      label: "Document Expiry",     href: "/admin/document-expiry",   require: ["pilgrims", "view"]   },
        { icon: BadgeCheck,    label: "Staff ID Cards",      href: "/admin/staff",             require: ["staff",    "view"]   },
        { icon: ScanLine,      label: "QR Tracker",          href: "/admin/qr-tracker",        require: ["groups",   "view"]   },
        { icon: Printer,       label: "Print Center",        href: "/admin/print-center",      require: ["groups",   "export"] },
        { icon: Droplets,      label: "Spray Label",         href: "/admin/print/spray-label", require: ["groups",   "view"]   },
      ],
    },

    // ── 6. CRM & SRM ─────────────────────────────────────────────────────────
    {
      section: "CRM & SRM",
      items: [
        { icon: UserCheck,     label: "Customer 360°",        href: "/admin/customer360",      require: ["customers", "view"] },
        { icon: Target,        label: "CRM Dashboard",       href: "/admin/crm",              require: ["customers", "view"] },
        { icon: Handshake,     label: "SRM Dashboard",       href: "/admin/srm",              require: ["accounting","view"] },
        { icon: Target,        label: "Leads",               href: "/admin/leads",            require: ["customers", "view"] },
        { icon: ClipboardList, label: "Tasks",               href: "/admin/tasks",            require: ["bookings",  "view"] },
        { icon: Headphones,    label: "Support Manager",     href: "/admin/support",          require: ["customers", "view"] },
        { icon: Star,          label: "Feedback",            href: "/admin/feedback",         require: ["customers", "view"], badge: openComplaints },
        { icon: Inbox,         label: "Package Requests",    href: "/admin/requests",         require: ["customers", "view"] },
        { icon: MessageSquare, label: "Inquiries",           href: "/admin/inquiries",        require: ["customers", "view"] },
        { icon: Megaphone,     label: "Broadcast",           href: "/admin/broadcast",        require: ["customers", "edit"] },
        { icon: Zap,           label: "Loyalty & Rewards",   href: "/admin/loyalty",          require: ["bookings",  "view"] },
      ],
    },

    // ── 7. HR ────────────────────────────────────────────────────────────────
    {
      section: "HR",
      items: [
        { icon: Briefcase,     label: "HR Dashboard",        href: "/admin/hr",               require: ["staff",    "view"] },
        { icon: KeyRound,      label: "Branch Login Mgmt",   href: "/admin/branch-login",     require: ["users",    "view"] },
        { icon: ShieldCheck,   label: "Agent Login Mgmt",    href: "/admin/agent-login",      require: ["users",    "view"] },
      ],
    },

    // ── 8. INVENTORY ─────────────────────────────────────────────────────────
    {
      section: "Inventory",
      items: [
        { icon: Package,       label: "Inventory",           href: "/admin/inventory",        require: ["assets",     "view"]   },
        { icon: ShoppingCart,  label: "Procurement",         href: "/admin/procurement",      require: ["expenses",   "view"]   },
        { icon: Truck,         label: "Vendors",             href: "/admin/vendors",          require: ["accounting", "view"]   },
        { icon: Package,       label: "Suppliers",           href: "/admin/suppliers",        require: ["accounting", "view"]   },
        { icon: Award,         label: "Assets",              href: "/admin/assets",           require: ["assets",     "view"]   },
      ],
    },

    // ── 9. TRAVEL OPERATIONS ─────────────────────────────────────────────────
    {
      section: "Travel Operations",
      items: [
        { icon: Plane,         label: "Flight Dashboard",    href: "/admin/flight-dashboard",    require: ["groups",   "view"]   },
        { icon: Plane,         label: "Flights",             href: "/admin/flights",              require: ["groups",   "view"]   },
        { icon: Hotel,         label: "Hotel Dashboard",     href: "/admin/hotel-dashboard",      require: ["groups",   "view"]   },
        { icon: Building2,     label: "Hotels",              href: "/admin/hotels",               require: ["groups",   "view"]   },
        { icon: Bus,           label: "Transport Dashboard", href: "/admin/transport-dashboard",  require: ["groups",   "view"]   },
        { icon: Bus,           label: "Buses",               href: "/admin/buses",                require: ["groups",   "view"]   },
        { icon: MapPin,        label: "Ziyarat",             href: "/admin/ziyarat",              require: ["groups",   "view"]   },
        { icon: Tent,          label: "Mina / Arafat / Muzd.", href: "/admin/allocations",       require: ["groups",   "view"]   },
        { icon: Tag,           label: "Luggage",             href: "/admin/luggage",              require: ["groups",   "view"]   },
      ],
    },

    // ── 10. COMMUNICATION ────────────────────────────────────────────────────
    {
      section: "Communication",
      items: [
        { icon: Inbox,         label: "Omnichannel Inbox",       href: "/admin/inbox",                   require: ["customers", "edit"] },
        { icon: Share2,        label: "Social Media Integration", href: "/admin/social-media",           require: ["settings",  "view"] },
        { icon: BellRing,      label: "Communication Center",  href: "/admin/communication-center",   require: ["customers", "edit"] },
        { icon: Zap,           label: "Workflow Center",        href: "/admin/workflow-center",         require: ["bookings",  "edit"] },
        { icon: Bot,           label: "WhatsApp Dashboard",     href: "/admin/botbee-dashboard",        require: ["settings",  "view"] },
        { icon: MessageSquare, label: "SMS Dashboard",          href: "/admin/sms-dashboard",           require: ["settings",  "view"] },
        { icon: Mail,          label: "Email Dashboard",        href: "/admin/email-dashboard",         require: ["settings",  "view"] },
        { icon: History,       label: "WhatsApp History",       href: "/admin/whatsapp-history",        require: ["settings",  "view"] },
        { icon: MessageSquare, label: "WhatsApp Templates",     href: "/admin/whatsapp-templates",      require: ["settings",  "view"] },
        { icon: Smartphone,    label: "SMS Templates",          href: "/admin/sms-templates",           require: ["settings",  "view"] },
        { icon: Layers,        label: "RCS Templates",          href: "/admin/rcs-templates",           require: ["settings",  "view"] },
        { icon: Mail,          label: "Email Templates",        href: "/admin/email-templates",         require: ["settings",  "view"] },
        { icon: FileText,      label: "DLT Template Manager",   href: "/admin/dlt-templates",           require: ["settings",  "view"] },
        { icon: Smartphone,    label: "Sender ID Management",   href: "/admin/sms-settings",            require: ["settings",  "view"] },
        { icon: TestTube2,     label: "SMS Test Center",        href: "/admin/sms-test",                require: ["settings",  "view"] },
        { icon: TestTube2,     label: "Test Notifications",     href: "/admin/test-notifications",      require: ["settings",  "view"] },
        { icon: History,       label: "Notification Logs",      href: "/admin/notification-logs",       require: ["settings",  "view"] },
        { icon: HeartPulse,    label: "Notification Dashboard", href: "/admin/notification-health",     require: ["settings",  "view"] },
        { icon: FileText,      label: "Notification Templates", href: "/admin/notification-templates",  require: ["settings",  "view"] },
        { icon: BellRing,      label: "Auto Notifications",     href: "/admin/auto-notifications",      require: ["settings",  "view"] },
        { icon: Smartphone,    label: "SMS Production Report",  href: "/admin/sms-production-report",   require: ["settings",  "view"] },
      ],
    },

    // ── 11. REPORTS ──────────────────────────────────────────────────────────
    {
      section: "Reports",
      items: [
        { icon: BarChart2,     label: "Reports",             href: "/admin/reports",           require: ["reports", "view"] },
        { icon: BarChart2,     label: "Production Report",   href: "/admin/production-report", require: ["reports", "view"] },
        { icon: Globe,         label: "Website CMS",         href: "/admin/cms",               require: ["settings","view"] },
        { icon: PackageSearch, label: "Packages",            href: "/admin/packages",          require: ["bookings","view"] },
        { icon: ImageIcon,     label: "Gallery",             href: "/admin/gallery",           require: ["settings","view"] },
      ],
    },

    // ── 12. AI ───────────────────────────────────────────────────────────────
    {
      section: "AI",
      items: [
        { icon: Sparkles, label: "AI Assistant",  href: "/admin/ai" },
        { icon: Brain,    label: "AI Operations", href: "/admin/ai-ops", require: ["bookings", "view"] },
      ],
    },

    // ── 13. ADMINISTRATION ───────────────────────────────────────────────────
    {
      section: "Administration",
      items: [
        { icon: Users,       label: "Customers",         href: "/admin/customers",         require: ["customers", "view"] },
        { icon: ShieldCheck, label: "KYC Management",    href: "/admin/kyc",               require: ["customers", "view"] },
        { icon: UserCheck,   label: "Agent Management",  href: "/admin/agents",            require: ["customers", "view"] },
        { icon: BarChart2,   label: "Agent Dashboard",   href: "/admin/agent-dashboard",   require: ["customers", "view"] },
        { icon: Building2,   label: "Branch Management", href: "/admin/branches",          require: ["customers", "view"] },
        { icon: Building2,   label: "Branch Dashboard",  href: "/admin/branch-dashboard",  require: ["customers", "view"] },
        { icon: Megaphone,   label: "Marketing Center",  href: "/admin/marketing",         require: ["customers", "edit"] },
        { icon: BookOpen,    label: "Guide Panel",       href: "/admin/guide-panel",       require: ["bookings",  "view"] },
        { icon: Smartphone,  label: "Mobile App",        href: "/admin/mobile-app",        require: ["settings",  "view"] },
      ],
    },

    // ── 14. SYSTEM ───────────────────────────────────────────────────────────
    {
      section: "System",
      items: [
        { icon: Settings2,    label: "Settings",           href: "/admin/settings",          require: ["settings",   "view"] },
        { icon: Settings2,    label: "Billing Settings",   href: "/admin/billing-settings",  require: ["settings",   "view"] },
        { icon: Code2,        label: "API Dashboard",      href: "/admin/api-settings",      require: ["settings",   "view"] },
        { icon: Plug,         label: "Integrations",       href: "/admin/integrations",      require: ["settings",   "view"] },
        { icon: Lock,         label: "User & Roles",       href: "/admin/user-roles",        require: ["users",      "view"] },
        { icon: ShieldCheck,  label: "Permissions",        href: "/admin/permissions",       require: ["users",      "view"] },
        { icon: Scale,        label: "Agreement Center",   href: "/admin/agreements",        require: ["audit_logs", "view"] },
        { icon: ClipboardList,label: "Audit Logs",         href: "/admin/audit-logs",        require: ["audit_logs", "view"] },
        { icon: Activity,     label: "Activity Logs",      href: "/admin/activity-logs",     require: ["audit_logs", "view"] },
        { icon: MessageSquare,label: "SMS Audit Log",      href: "/admin/sms-audit",         require: ["audit_logs", "view"] },
        { icon: Shield,       label: "Security Dashboard", href: "/admin/security",          require: ["users",      "view"] },
        { icon: Archive,      label: "Backup Dashboard",   href: "/admin/backups",           require: ["users",      "view"] },
        { icon: HeartPulse,   label: "System Health",      href: "/admin/system-health",     require: ["users",      "view"] },
        { icon: Activity,     label: "OTP Debug",          href: "/admin/otp-debug",         require: ["users",      "view"] },
        { icon: MessageSquare,label: "Admin Chat",         href: "/admin/chat",              require: ["customers",  "view"] },
      ],
    },

  ];
}
