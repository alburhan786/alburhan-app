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
 */

import {
  LayoutDashboard, PackageSearch, Users, BookOpen, MessageSquare,
  ImageIcon, UsersRound, Receipt, ClipboardPlus, ScanLine, BarChart2,
  Printer, Megaphone, ShieldCheck, Inbox, PieChart, Star, BadgeCheck, Droplets,
  TrendingDown, TrendingUp, Calculator, Plane, Activity, Home, CreditCard, Trash2,
  Building2, Bus, Heart, FileCheck, Sparkles, UserCheck, BookMarked, Truck,
  Scale, Users2, Package, ClipboardList, KeyRound, HeartPulse, Settings2, BellRing, Zap,
  MapPin, Tent, Tag, Bot, Award, Smartphone, Layers, Mail, Globe, FileText, TestTube2, History,
  Headphones, Target, Brain, AlarmClock,
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
 * Master navigation definition.
 * `openComplaints` is the only runtime value injected (badge counter).
 */
export function buildNavSections(openComplaints = 0): NavSection[] {
  return [

    // ── OVERVIEW ─────────────────────────────────────────────────────────────
    {
      section: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard",             href: "/admin/dashboard" },
        { icon: Activity,        label: "Operations Dashboard",  href: "/admin/operations",  require: ["bookings", "view"] },
        { icon: PieChart,        label: "Executive Dashboard",   href: "/admin/executive",   require: ["reports",  "view"] },
        { icon: TrendingUp,      label: "Business Intelligence", href: "/admin/bi",          require: ["reports",  "view"] },
        { icon: Users2,          label: "Manager Dashboard",     href: "/admin/manager",     require: ["groups",   "view"] },
        { icon: Sparkles,        label: "Super Admin Dashboard", href: "/admin/super",       requireSuper: true },
      ],
    },

    // ── BOOKINGS & FINANCE ────────────────────────────────────────────────────
    {
      section: "Bookings & Finance",
      items: [
        { icon: BookOpen,      label: "Bookings",           href: "/admin/bookings",          require: ["bookings",   "view"]   },
        { icon: ClipboardPlus, label: "Offline Booking",    href: "/admin/offline-bookings",  require: ["bookings",   "create"] },
        { icon: Receipt,       label: "Invoices",           href: "/admin/invoices",          require: ["bookings",   "view"]   },
        { icon: CreditCard,    label: "Payment Management", href: "/admin/payments",          require: ["payments",   "view"]   },
        { icon: BarChart2,     label: "Payment Analytics",  href: "/admin/payment-analytics", require: ["payments",   "view"]   },
        { icon: AlarmClock,    label: "Payment Reminders",  href: "/admin/payment-reminders", require: ["payments",   "view"]   },
        { icon: Building2,     label: "Offline Payments",   href: "/admin/offline-payments",  require: ["payments",   "view"]   },
        { icon: Trash2,        label: "Payment Trash",      href: "/admin/payment-trash",     require: ["payments",   "delete"] },
        { icon: TrendingDown,  label: "Expenses",           href: "/admin/expenses",          require: ["expenses",   "view"]   },
        { icon: Calculator,    label: "Accounting",         href: "/admin/accounting",        require: ["accounting", "view"]   },
        { icon: BarChart2,     label: "Finance Hub",        href: "/admin/finance",           require: ["accounting", "view"]   },
        { icon: Home,          label: "Family Ledger",      href: "/admin/family-ledger",     require: ["accounting", "view"]   },
        { icon: UserCheck,     label: "Customer Ledger",    href: "/admin/customer-ledger",   require: ["customers",  "view"]   },
        { icon: BookMarked,    label: "Hajji Ledger",       href: "/admin/hajji-ledger",      require: ["groups",     "view"]   },
        { icon: Truck,         label: "Vendors",            href: "/admin/vendors",           require: ["accounting", "view"]   },
        { icon: Package,       label: "Suppliers",          href: "/admin/suppliers",         require: ["accounting", "view"]   },
        { icon: Scale,         label: "GST Reports",        href: "/admin/gst-reports",       require: ["gst",        "view"]   },
        { icon: Users2,        label: "Payroll",            href: "/admin/payroll",           require: ["payroll",    "view"]   },
        { icon: Award,         label: "Assets",             href: "/admin/assets",            require: ["assets",     "view"]   },
        { icon: Trash2,        label: "Trash",              href: "/admin/bookings?tab=trash", require: ["bookings",  "delete"] },
      ],
    },

    // ── PILGRIMS & GROUPS ─────────────────────────────────────────────────────
    {
      section: "Pilgrims & Groups",
      items: [
        { icon: UsersRound,    label: "Hajj Groups",        href: "/admin/groups",          require: ["groups",   "view"]   },
        { icon: Plane,         label: "Flights",            href: "/admin/flights",          require: ["groups",   "view"]   },
        { icon: Building2,     label: "Hotels",             href: "/admin/hotels",           require: ["groups",   "view"]   },
        { icon: Bus,           label: "Buses",              href: "/admin/buses",            require: ["groups",   "view"]   },
        { icon: Heart,         label: "Medical",            href: "/admin/medical",          require: ["pilgrims", "view"]   },
        { icon: FileCheck,     label: "Visa Tracker",       href: "/admin/visa",             require: ["pilgrims", "view"]   },
        { icon: ClipboardList, label: "Pilgrim Reports",    href: "/admin/pilgrim-reports",  require: ["pilgrims", "view"]   },
        { icon: Activity,      label: "Pilgrim Operations", href: "/admin/pilgrim-ops",      require: ["pilgrims", "view"]   },
        { icon: ScanLine,      label: "Group Tracking",     href: "/admin/group-tracking",   require: ["groups",   "view"]   },
        { icon: BadgeCheck,    label: "Certificates",       href: "/admin/certificates",     require: ["pilgrims", "view"]   },
        { icon: FileText,      label: "Document Expiry",    href: "/admin/document-expiry",  require: ["pilgrims", "view"]   },
        { icon: BadgeCheck,    label: "Staff ID Cards",     href: "/admin/staff",            require: ["staff",    "view"]   },
        { icon: ScanLine,      label: "QR Tracker",         href: "/admin/qr-tracker",       require: ["groups",   "view"]   },
        { icon: Printer,       label: "Print Center",       href: "/admin/print-center",     require: ["groups",   "export"] },
        { icon: Droplets,      label: "Spray Label",        href: "/admin/print/spray-label",require: ["groups",   "view"]   },
      ],
    },

    // ── PACKAGES & CONTENT ────────────────────────────────────────────────────
    {
      section: "Packages & Content",
      items: [
        { icon: PackageSearch, label: "Packages",         href: "/admin/packages",    require: ["bookings",  "view"] },
        { icon: ImageIcon,     label: "Gallery",          href: "/admin/gallery",     require: ["settings",  "view"] },
        { icon: Megaphone,     label: "Marketing Center", href: "/admin/marketing",   require: ["customers", "edit"] },
        { icon: BookOpen,      label: "Guide Panel",      href: "/admin/guide-panel", require: ["bookings",  "view"] },
      ],
    },

    // ── SALES & CRM ───────────────────────────────────────────────────────────
    {
      section: "Sales & CRM",
      items: [
        { icon: Target,        label: "Leads",            href: "/admin/leads",     require: ["customers", "view"] },
        { icon: ClipboardList, label: "Tasks",            href: "/admin/tasks",     require: ["bookings",  "view"] },
        { icon: Headphones,    label: "Support Manager",  href: "/admin/support",   require: ["customers", "view"] },
        { icon: Star,          label: "Feedback",         href: "/admin/feedback",  require: ["customers", "view"], badge: openComplaints },
        { icon: Inbox,         label: "Package Requests", href: "/admin/requests",  require: ["customers", "view"] },
        { icon: MessageSquare, label: "Inquiries",        href: "/admin/inquiries", require: ["customers", "view"] },
        { icon: Megaphone,     label: "Broadcast",        href: "/admin/broadcast", require: ["customers", "edit"] },
      ],
    },

    // ── CUSTOMERS & REPORTS ───────────────────────────────────────────────────
    {
      section: "Customers & Reports",
      items: [
        { icon: Users,       label: "Customers",         href: "/admin/customers",       require: ["customers", "view"] },
        { icon: ShieldCheck, label: "KYC Management",    href: "/admin/kyc",             require: ["customers", "view"] },
        { icon: UserCheck,   label: "Agent Management",  href: "/admin/agents",          require: ["customers", "view"] },
        { icon: BarChart2,   label: "Agent Dashboard",   href: "/admin/agent-dashboard", require: ["customers", "view"] },
        { icon: Building2,   label: "Branch Management", href: "/admin/branches",        require: ["customers", "view"] },
        { icon: BarChart2,   label: "Reports",           href: "/admin/reports",         require: ["reports",   "view"] },
        { icon: BarChart2,   label: "Production Report", href: "/admin/production-report",require: ["reports",  "view"] },
      ],
    },

    // ── HAJJ OPERATIONS ───────────────────────────────────────────────────────
    {
      section: "Hajj Operations",
      items: [
        { icon: MapPin, label: "Ziyarat",                    href: "/admin/ziyarat",    require: ["groups", "view"] },
        { icon: Tent,   label: "Mina / Arafat / Muzdalifah", href: "/admin/allocations",require: ["groups", "view"] },
        { icon: Tag,    label: "Luggage",                    href: "/admin/luggage",    require: ["groups", "view"] },
      ],
    },

    // ── AUTOMATION ────────────────────────────────────────────────────────────
    {
      section: "Automation",
      items: [
        { icon: Bot,  label: "Automation Center", href: "/admin/automation-center", require: ["bookings", "edit"] },
        { icon: Zap,  label: "Loyalty & Rewards", href: "/admin/loyalty",           require: ["bookings", "view"] },
      ],
    },

    // ── COMMUNICATION CENTER ──────────────────────────────────────────────────
    {
      section: "Communication Center",
      items: [
        { icon: BellRing,     label: "Communication Center",  href: "/admin/communication-center",  require: ["customers", "edit"] },
        { icon: Zap,          label: "Workflow Center",        href: "/admin/workflow-center",        require: ["bookings",  "edit"] },
        { icon: Bot,          label: "BotBee Dashboard",       href: "/admin/botbee-dashboard",       require: ["settings",  "view"] },
        { icon: History,      label: "WhatsApp History",        href: "/admin/whatsapp-history",       require: ["settings",  "view"] },
        { icon: MessageSquare,label: "WhatsApp Templates",      href: "/admin/whatsapp-templates",     require: ["settings",  "view"] },
        { icon: Smartphone,   label: "SMS Templates",          href: "/admin/sms-templates",          require: ["settings",  "view"] },
        { icon: Layers,       label: "RCS Templates",          href: "/admin/rcs-templates",          require: ["settings",  "view"] },
        { icon: Mail,         label: "Email Templates",        href: "/admin/email-templates",        require: ["settings",  "view"] },
        { icon: FileText,     label: "DLT Template Manager",   href: "/admin/dlt-templates",          require: ["settings",  "view"] },
        { icon: Smartphone,   label: "Sender ID Management",   href: "/admin/sms-settings",           require: ["settings",  "view"] },
        { icon: TestTube2,    label: "SMS Test Center",        href: "/admin/sms-test",               require: ["settings",  "view"] },
        { icon: TestTube2,    label: "Test Notifications",     href: "/admin/test-notifications",     require: ["settings",  "view"] },
        { icon: History,      label: "Notification Logs",      href: "/admin/notification-logs",      require: ["settings",  "view"] },
        { icon: HeartPulse,   label: "Notification Health",    href: "/admin/notification-health",    require: ["settings",  "view"] },
        { icon: FileText,     label: "Notification Templates", href: "/admin/notification-templates",  require: ["settings",  "view"] },
        { icon: BellRing,     label: "Auto Notifications",     href: "/admin/auto-notifications",     require: ["settings",  "view"] },
        { icon: Smartphone,   label: "SMS Production Report",  href: "/admin/sms-production-report",  require: ["settings",  "view"] },
      ],
    },

    // ── AI TOOLS ──────────────────────────────────────────────────────────────
    {
      section: "AI Tools",
      items: [
        { icon: Sparkles, label: "AI Assistant",  href: "/admin/ai" },
        { icon: Brain,    label: "AI Operations", href: "/admin/ai-ops", require: ["bookings", "view"] },
      ],
    },

    // ── SYSTEM ────────────────────────────────────────────────────────────────
    {
      section: "System",
      items: [
        { icon: Settings2,    label: "Business Settings", href: "/admin/settings",        require: ["settings",   "view"] },
        { icon: Settings2,    label: "Billing Settings",  href: "/admin/billing-settings", require: ["settings",  "view"] },
        { icon: KeyRound,     label: "API Settings",      href: "/admin/api-settings",    require: ["settings",   "view"] },
        { icon: KeyRound,     label: "User Roles",        href: "/admin/user-roles",      require: ["users",      "view"] },
        { icon: Scale,        label: "Agreement Center",  href: "/admin/agreements",      require: ["audit_logs", "view"] },
        { icon: ClipboardList,label: "Audit Logs",        href: "/admin/audit-logs",      require: ["audit_logs", "view"] },
        { icon: MessageSquare,label: "SMS Audit Log",     href: "/admin/sms-audit",       require: ["audit_logs", "view"] },
        { icon: HeartPulse,   label: "System Health",     href: "/admin/system-health",   require: ["users",      "view"] },
        { icon: Activity,     label: "OTP Debug",         href: "/admin/otp-debug",       require: ["users",      "view"] },
        { icon: MessageSquare,label: "Admin Chat",        href: "/admin/chat",            require: ["customers",  "view"] },
      ],
    },

  ];
}

/**
 * Flat list of every href registered in the nav.
 * Used by the pre-build regression check (scripts/check-nav.mjs).
 * Update this whenever you add or remove a nav item above.
 */
export const ALL_NAV_HREFS: string[] = buildNavSections(0)
  .flatMap(s => s.items.map(i => i.href.split("?")[0])); // strip query strings
