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
  Camera, Send, Bell,
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
  /** Search aliases — sidebar search + Ctrl+K match on these keywords */
  aliases?: string[];
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
        { icon: LayoutDashboard, label: "Dashboard",                      href: "/admin/dashboard" },
        { icon: Activity,        label: "Operations Dashboard",            href: "/admin/operations",         require: ["bookings", "view"] },
        { icon: PieChart,        label: "Executive Dashboard",             href: "/admin/executive",          require: ["reports",  "view"] },
        { icon: TrendingUp,      label: "Business Intelligence Dashboard", href: "/admin/bi",                 require: ["reports",  "view"] },
        { icon: BarChart2,       label: "Booking Funnel",                  href: "/admin/funnel",             require: ["reports",  "view"], aliases: ["funnel", "pipeline analytics", "conversion analytics", "lead to booking"] },
        { icon: TrendingUp,      label: "Revenue Analytics",               href: "/admin/revenue",            require: ["reports",  "view"], aliases: ["revenue", "collection analytics", "income analytics", "financial analytics"] },
        { icon: Brain,           label: "AI Revenue Forecast",             href: "/admin/forecast",           require: ["reports",  "view"], aliases: ["forecast", "ai forecast", "revenue prediction", "future revenue"] },
        { icon: Users2,          label: "Manager Dashboard",               href: "/admin/manager",            require: ["groups",   "view"] },
        { icon: Sparkles,        label: "Super Admin Dashboard",           href: "/admin/super",              requireSuper: true },
        { icon: Users,           label: "Staff Dashboard",                 href: "/admin/staff-dashboard",    require: ["staff",    "view"] },
        { icon: Users,           label: "Customer Dashboard",              href: "/admin/customer-dashboard", require: ["customers","view"] },
      ],
    },

    // ── 2. OPERATIONS ────────────────────────────────────────────────────────
    {
      section: "Operations",
      items: [
        // Bookings & Ops
        { icon: BookOpen,      label: "Bookings",                href: "/admin/bookings",            require: ["bookings",   "view"],   aliases: ["booking", "reservation", "customer", "customers", "hajj booking", "umrah booking"] },
        { icon: ClipboardPlus, label: "Offline Booking",         href: "/admin/offline-bookings",    require: ["bookings",   "create"], aliases: ["offline", "walk-in", "counter booking"] },
        { icon: Trash2,        label: "Booking Trash",           href: "/admin/bookings?tab=trash",  require: ["bookings",   "delete"] },
        { icon: Trash2,        label: "Payment Trash",           href: "/admin/payment-trash",       require: ["payments",   "delete"] },
        { icon: Bot,           label: "Automation Center",       href: "/admin/automation-center",   require: ["bookings",   "edit"]   },
        // Payments
        { icon: Receipt,       label: "Invoice Dashboard",       href: "/admin/invoices",            require: ["bookings",   "view"],   aliases: ["invoice", "bill", "customer", "customers", "receipt"] },
        { icon: CreditCard,    label: "Payment Dashboard",       href: "/admin/payments",            require: ["payments",   "view"],   aliases: ["payment", "transaction", "customer", "customers"] },
        { icon: BarChart2,     label: "Payment Analytics",       href: "/admin/payment-analytics",   require: ["payments",   "view"],   aliases: ["payment analytics", "payment trends", "charts"] },
        { icon: AlarmClock,    label: "Payment Reminders",       href: "/admin/payment-reminders",   require: ["payments",   "view"],   aliases: ["payment reminder", "due", "overdue"] },
        { icon: Building2,     label: "Offline Payments",        href: "/admin/offline-payments",    require: ["payments",   "view"]   },
        { icon: IndianRupee,   label: "Receipt Dashboard",       href: "/admin/receipts",            require: ["payments",   "view"]   },
        // Pilgrims & Hajj
        { icon: UsersRound,    label: "Hajj Groups",              href: "/admin/groups",             require: ["groups",   "view"]   },
        { icon: Heart,         label: "Medical",                  href: "/admin/medical",            require: ["pilgrims", "view"]   },
        { icon: FileCheck,     label: "Visa Dashboard",           href: "/admin/visa",               require: ["pilgrims", "view"]   },
        { icon: ClipboardList, label: "Pilgrim Reports",          href: "/admin/pilgrim-reports",    require: ["pilgrims", "view"]   },
        { icon: Activity,      label: "Pilgrim Operations",       href: "/admin/pilgrim-ops",        require: ["pilgrims", "view"]   },
        { icon: ScanLine,      label: "Group Tracking",           href: "/admin/group-tracking",     require: ["groups",   "view"]   },
        { icon: BadgeCheck,    label: "Certificates",             href: "/admin/certificates",       require: ["pilgrims", "view"]   },
        { icon: FileText,      label: "Document Management Dashboard", href: "/admin/documents",    require: ["pilgrims", "view"]   },
        { icon: FileText,      label: "Document Expiry",          href: "/admin/document-expiry",    require: ["pilgrims", "view"]   },
        { icon: BadgeCheck,    label: "Staff ID Cards",           href: "/admin/staff",              require: ["staff",    "view"]   },
        { icon: ScanLine,      label: "QR Tracker",               href: "/admin/qr-tracker",         require: ["groups",   "view"]   },
        { icon: Printer,       label: "Print Center",             href: "/admin/print-center",       require: ["groups",   "export"] },
        { icon: Droplets,      label: "Spray Label",              href: "/admin/print/spray-label",  require: ["groups",   "view"]   },
        // Travel
        { icon: Plane,         label: "Flight Dashboard",        href: "/admin/flight-dashboard",    require: ["groups",   "view"]   },
        { icon: Plane,         label: "Flights",                 href: "/admin/flights",              require: ["groups",   "view"]   },
        { icon: Hotel,         label: "Hotel Dashboard",         href: "/admin/hotel-dashboard",      require: ["groups",   "view"]   },
        { icon: Building2,     label: "Hotels",                  href: "/admin/hotels",               require: ["groups",   "view"]   },
        { icon: Bus,           label: "Transport Dashboard",     href: "/admin/transport-dashboard",  require: ["groups",   "view"]   },
        { icon: Bus,           label: "Buses",                   href: "/admin/buses",                require: ["groups",   "view"]   },
        { icon: MapPin,        label: "Ziyarat",                 href: "/admin/ziyarat",              require: ["groups",   "view"]   },
        { icon: Tent,          label: "Room Allocation Dashboard", href: "/admin/allocations",        require: ["groups",   "view"]   },
        { icon: Tag,           label: "Luggage",                 href: "/admin/luggage",              require: ["groups",   "view"]   },
        { icon: Scale,         label: "Agreement Dashboard",     href: "/admin/agreements",           require: ["audit_logs","view"]  },
        // v29 Enterprise Ops Centers
        { icon: Plane,         label: "Flight Ops Center",       href: "/admin/flight-ops",           require: ["groups",   "view"]   },
        { icon: Hotel,         label: "Hotel Ops Center",        href: "/admin/hotel-ops",            require: ["groups",   "view"]   },
        { icon: Tent,          label: "Group Ops Center",        href: "/admin/group-ops",            require: ["groups",   "view"]   },
        { icon: Truck,         label: "Transport Ops Center",    href: "/admin/transport-ops",        require: ["groups",   "view"]   },
        { icon: Briefcase,     label: "HR Ops Center",           href: "/admin/hr-ops",               require: ["payroll",  "view"]   },
        // Finance & Accounting (merged per spec)
        { icon: TrendingDown,  label: "Expenses",                href: "/admin/expenses",             require: ["expenses",   "view"]  },
        { icon: Calculator,    label: "Accounting Dashboard",    href: "/admin/accounting",           require: ["accounting", "view"]  },
        { icon: BarChart2,     label: "Finance Dashboard",       href: "/admin/finance",              require: ["accounting", "view"]  },
        { icon: Home,          label: "Family Ledger",           href: "/admin/family-ledger",        require: ["accounting", "view"]  },
        { icon: UserCheck,     label: "Customer Ledger",         href: "/admin/customer-ledger",      require: ["customers",  "view"]  },
        { icon: BookMarked,    label: "Hajji Ledger",            href: "/admin/hajji-ledger",         require: ["groups",     "view"]  },
        { icon: Scale,         label: "GST Reports",             href: "/admin/gst-reports",          require: ["gst",        "view"]  },
        { icon: Users2,        label: "Payroll Dashboard",       href: "/admin/payroll",              require: ["payroll",    "view"]  },
        // Inventory & Supply Chain (merged per spec)
        { icon: Package,       label: "Inventory Dashboard",     href: "/admin/inventory",            require: ["assets",     "view"]  },
        { icon: ShoppingCart,  label: "Procurement Dashboard",   href: "/admin/procurement",          require: ["expenses",   "view"]  },
        { icon: Truck,         label: "Vendors",                 href: "/admin/vendors",              require: ["accounting", "view"]  },
        { icon: Package,       label: "Supplier Dashboard",      href: "/admin/suppliers",            require: ["accounting", "view"]  },
        { icon: Award,         label: "Assets",                  href: "/admin/assets",               require: ["assets",     "view"]  },
      ],
    },

    // ── 6. CRM ───────────────────────────────────────────────────────────────
    {
      section: "CRM",
      items: [
        { icon: UserCheck,     label: "Customer 360°",           href: "/admin/customer360",       require: ["customers", "view"], aliases: ["360", "customer", "lead", "profile", "history", "customer 360"] },
        { icon: Target,        label: "CRM Dashboard",           href: "/admin/crm",               require: ["customers", "view"], aliases: ["crm", "lead", "leads", "pipeline", "sales"] },
        { icon: Handshake,     label: "SRM Dashboard",           href: "/admin/srm",               require: ["accounting","view"], aliases: ["srm", "supplier", "vendor"] },
        { icon: Target,        label: "Leads",                   href: "/admin/leads",             require: ["customers", "view"], aliases: ["lead", "leads", "prospects", "enquiry", "follow-up"] },
        { icon: ClipboardList, label: "Tasks",                   href: "/admin/tasks",             require: ["bookings",  "view"] },
        { icon: Headphones,    label: "Support Manager",         href: "/admin/support",           require: ["customers", "view"] },
        { icon: Star,          label: "Feedback",                href: "/admin/feedback",          require: ["customers", "view"], badge: openComplaints },
        { icon: Inbox,         label: "Package Requests",        href: "/admin/requests",          require: ["customers", "view"] },
        { icon: MessageSquare, label: "Inquiries",               href: "/admin/inquiries",         require: ["customers", "view"] },
        { icon: Megaphone,     label: "Broadcast",               href: "/admin/broadcast",         require: ["customers", "edit"], aliases: ["broadcast", "bulk", "mass message", "whatsapp", "sms", "email", "campaign"] },
        { icon: Zap,           label: "Loyalty & Rewards",       href: "/admin/loyalty",           require: ["bookings",  "view"] },
      ],
    },

    // ── 7. MARKETING ─────────────────────────────────────────────────────────
    {
      section: "Marketing",
      items: [
        { icon: LayoutDashboard, label: "📊 Comms & Marketing Hub",      href: "/admin/comms-dashboard",         require: ["customers", "view"], aliases: ["comms dashboard", "communication dashboard", "marketing hub", "channel stats", "lead stats", "conversion"] },
        { icon: Inbox,         label: "Omnichannel Inbox",              href: "/admin/inbox",                   require: ["customers", "edit"], aliases: ["omni", "inbox", "multichannel", "omnichannel", "unified inbox", "all channels", "whatsapp", "social"] },
        { icon: Share2,        label: "Social Media Integration",       href: "/admin/social-media",            require: ["settings",  "view"], aliases: ["social", "facebook", "fb", "instagram", "ig", "telegram", "tg", "messenger", "channels", "social media"] },
        { icon: Activity,      label: "Meta Connection Health",          href: "/admin/meta-health",             require: ["settings",  "view"], aliases: ["meta", "meta health", "facebook health", "instagram health", "whatsapp meta", "meta audit", "token", "oauth"] },
        { icon: Activity,      label: "Meta Cloud API Status",           href: "/admin/meta-status",             require: ["settings",  "view"], aliases: ["meta status", "whatsapp cloud", "meta production", "cloud api", "meta activation", "certification", "meta secrets", "meta score"] },
        { icon: Share2,        label: "OAuth Hub — Social Connect",      href: "/admin/social-oauth",            require: ["settings",  "view"], aliases: ["oauth", "social oauth", "connect facebook", "connect google", "connect meta", "social login", "oauth hub"] },
        { icon: BellRing,      label: "⚡ Comms & Automation Engine",    href: "/admin/comms-engine",            require: ["customers", "edit"], aliases: ["comms engine", "communication engine", "event bus", "central comms", "automation engine", "dlq", "dead letter"] },
        { icon: Zap,           label: "⚙️ Automation Builder",          href: "/admin/automation-builder",      require: ["bookings",  "edit"], aliases: ["automation builder", "workflow builder", "rule builder", "visual automation", "configure workflow"] },
        { icon: BellRing,      label: "Communication Center",           href: "/admin/communication-center",    require: ["customers", "edit"], aliases: ["communication", "comm center", "notify", "alerts"] },
        { icon: Zap,           label: "Workflow Center",                href: "/admin/workflow-center",         require: ["bookings",  "edit"], aliases: ["workflow", "pipeline", "automation", "triggers"] },
        { icon: Bot,           label: "WhatsApp Dashboard",             href: "/admin/botbee-dashboard",        require: ["settings",  "view"], aliases: ["whatsapp", "wa", "waba", "botbee", "chat", "messages", "wapp"] },
        { icon: MessageSquare, label: "Facebook Dashboard",             href: "/admin/social-media#facebook",   require: ["settings",  "view"], aliases: ["facebook", "fb", "messenger", "facebook page", "meta", "social"] },
        { icon: Camera,        label: "Instagram Dashboard",            href: "/admin/social-media#instagram",  require: ["settings",  "view"], aliases: ["instagram", "ig", "instagram dm", "instagram messages", "reels", "social"] },
        { icon: Send,          label: "Telegram Dashboard",             href: "/admin/social-media#telegram",   require: ["settings",  "view"], aliases: ["telegram", "tg", "telegram bot", "telegram channel", "social"] },
        { icon: Bell,          label: "Notification Center",            href: "/admin/notifications",           require: ["settings",  "view"], aliases: ["notification", "notify", "push", "alert", "bell", "whatsapp", "sms", "email"] },
        { icon: MessageSquare, label: "SMS Dashboard",                  href: "/admin/sms-dashboard",           require: ["settings",  "view"], aliases: ["sms", "text", "dlt", "bulk sms", "fast2sms", "short message"] },
        { icon: Mail,          label: "Email Dashboard",                href: "/admin/email-dashboard",         require: ["settings",  "view"], aliases: ["email", "mail", "smtp", "newsletter"] },
        { icon: HeartPulse,    label: "Notification Dashboard",         href: "/admin/notification-health",     require: ["settings",  "view"], aliases: ["notification", "push", "alert", "bell", "notify", "whatsapp"] },
        { icon: Target,        label: "Lead Pipeline (26-Stage)",       href: "/admin/lead-pipeline",           require: ["customers", "edit"], aliases: ["pipeline", "kanban", "lead stage", "crm pipeline", "lead funnel", "conversion funnel", "lead board"] },
        { icon: Zap,           label: "Comment Automation",             href: "/admin/comment-automation",      require: ["settings",  "edit"], aliases: ["comment", "comment reply", "auto comment", "comment bot", "keyword reply", "comment automation", "social reply"] },
        { icon: Megaphone,     label: "Marketing Dashboard",            href: "/admin/marketing",               require: ["customers", "edit"], aliases: ["marketing", "campaign", "broadcast", "blast", "bulk"] },
        { icon: History,       label: "WhatsApp History",               href: "/admin/whatsapp-history",        require: ["settings",  "view"], aliases: ["whatsapp", "wa", "history", "chat log"] },
        { icon: MessageSquare, label: "WhatsApp Templates",             href: "/admin/whatsapp-templates",      require: ["settings",  "view"], aliases: ["whatsapp", "wa", "template", "message template"] },
        { icon: Smartphone,    label: "SMS Templates",                  href: "/admin/sms-templates",           require: ["settings",  "view"], aliases: ["sms", "dlt template", "text template"] },
        { icon: Layers,        label: "RCS Templates",                  href: "/admin/rcs-templates",           require: ["settings",  "view"], aliases: ["rcs", "rich communication", "template"] },
        { icon: Mail,          label: "Email Templates",                href: "/admin/email-templates",         require: ["settings",  "view"], aliases: ["email", "mail template", "smtp template"] },
        { icon: FileText,      label: "DLT Template Manager",           href: "/admin/dlt-templates",           require: ["settings",  "view"], aliases: ["dlt", "sms dlt", "template manager", "telecom"] },
        { icon: Smartphone,    label: "Sender ID Management",           href: "/admin/sms-settings",            require: ["settings",  "view"], aliases: ["sender id", "sms settings", "sender"] },
        { icon: TestTube2,     label: "SMS Test Center",                href: "/admin/sms-test",                require: ["settings",  "view"], aliases: ["sms test", "test sms", "test message"] },
        { icon: Bell,          label: "Push Center",                    href: "/admin/push-center",             require: ["settings",  "view"], aliases: ["push center", "fcm", "firebase", "push notification", "push test", "send push", "device notification", "mobile push"] },
        { icon: TestTube2,     label: "Test Notifications",             href: "/admin/test-notifications",      require: ["settings",  "view"], aliases: ["test notification", "test alert", "test push"] },
        { icon: History,       label: "Notification Logs",              href: "/admin/notification-logs",       require: ["settings",  "view"], aliases: ["notification log", "message log", "delivery log"] },
        { icon: FileText,      label: "Notification Templates",         href: "/admin/notification-templates",  require: ["settings",  "view"], aliases: ["notification template", "alert template"] },
        { icon: BellRing,      label: "Auto Notifications",             href: "/admin/auto-notifications",      require: ["settings",  "view"], aliases: ["auto notification", "automated alerts", "scheduled notification"] },
        { icon: Smartphone,    label: "SMS Production Report",          href: "/admin/sms-production-report",   require: ["settings",  "view"], aliases: ["sms report", "production report", "sms analytics"] },
      ],
    },

    // ── 11. REPORTS ──────────────────────────────────────────────────────────
    {
      section: "Reports",
      items: [
        { icon: BarChart2,     label: "Reports Dashboard",       href: "/admin/reports",           require: ["reports", "view"] },
        { icon: BarChart2,     label: "Production Report",       href: "/admin/production-report", require: ["reports", "view"] },
        { icon: Globe,         label: "Website CMS Dashboard",   href: "/admin/cms",               require: ["settings","view"] },
        { icon: Smartphone,    label: "Mobile App Dashboard",    href: "/admin/mobile-app",        require: ["settings","view"] },
        { icon: PackageSearch, label: "Packages",                href: "/admin/packages",          require: ["bookings","view"] },
        { icon: ImageIcon,     label: "Gallery",                 href: "/admin/gallery",           require: ["settings","view"] },
      ],
    },

    // ── 12. AI ───────────────────────────────────────────────────────────────
    {
      section: "AI",
      items: [
        { icon: Sparkles, label: "AI Assistant",          href: "/admin/ai" },
        { icon: Brain,    label: "AI Analytics Dashboard", href: "/admin/ai-ops", require: ["bookings", "view"] },
      ],
    },

    // ── 13. ADMINISTRATION ───────────────────────────────────────────────────
    {
      section: "Administration",
      items: [
        { icon: Users,        label: "Customers",               href: "/admin/customers",         require: ["customers", "view"] },
        { icon: ShieldCheck,  label: "KYC Management",          href: "/admin/kyc",               require: ["customers", "view"] },
        { icon: UserCheck,    label: "Agent Management",        href: "/admin/agents",            require: ["customers", "view"] },
        { icon: BarChart2,    label: "Agent Dashboard",         href: "/admin/agent-dashboard",   require: ["customers", "view"] },
        { icon: Building2,    label: "Branch Management",       href: "/admin/branches",          require: ["customers", "view"] },
        { icon: Building2,    label: "Branch Dashboard",        href: "/admin/branch-dashboard",  require: ["customers", "view"] },
        { icon: BookOpen,     label: "Guide Panel",             href: "/admin/guide-panel",       require: ["bookings",  "view"] },
        // HR & People (merged per spec)
        { icon: Briefcase,    label: "HR Dashboard",            href: "/admin/hr",                require: ["staff",    "view"] },
        { icon: KeyRound,     label: "Branch Login Management", href: "/admin/branch-login",      require: ["users",    "view"] },
        { icon: ShieldCheck,  label: "Agent Login Management",  href: "/admin/agent-login",       require: ["users",    "view"] },
        // System & Settings
        { icon: Settings2,    label: "Settings Dashboard",      href: "/admin/settings",          require: ["settings",   "view"] },
        { icon: Settings2,    label: "Billing Settings",        href: "/admin/billing-settings",  require: ["settings",   "view"] },
        { icon: Code2,        label: "API Dashboard",           href: "/admin/api-settings",      require: ["settings",   "view"] },
        { icon: Plug,         label: "Integration Dashboard",   href: "/admin/integrations",      require: ["settings",   "view"] },
        { icon: Lock,         label: "User & Role Management",  href: "/admin/user-roles",        require: ["users",      "view"] },
        { icon: ShieldCheck,  label: "Permission Management",   href: "/admin/permissions",       require: ["users",      "view"] },
        { icon: ClipboardList,label: "Audit Log Dashboard",     href: "/admin/audit-logs",        require: ["audit_logs", "view"] },
        { icon: Activity,     label: "Activity Log Dashboard",  href: "/admin/activity-logs",     require: ["audit_logs", "view"] },
        { icon: MessageSquare,label: "SMS Audit Log",           href: "/admin/sms-audit",         require: ["audit_logs", "view"] },
        { icon: Shield,       label: "Security Dashboard",      href: "/admin/security",          require: ["users",      "view"] },
        { icon: Archive,      label: "Backup Dashboard",        href: "/admin/backups",           require: ["users",      "view"] },
        { icon: HeartPulse,   label: "System Health",           href: "/admin/system-health",     require: ["users",      "view"] },
        { icon: Activity,     label: "Performance Monitor",      href: "/admin/performance",        require: ["users",      "view"], aliases: ["performance", "cpu", "memory", "database lag", "metrics", "throughput", "monitoring"] },
        { icon: ClipboardList,label: "Error Logs",               href: "/admin/error-logs",         require: ["users",      "view"], aliases: ["error logs", "api errors", "500 errors", "failed requests", "production errors"] },
        { icon: Activity,     label: "E2E Test Runner",          href: "/admin/e2e-test",           require: ["users",      "view"], aliases: ["e2e", "end to end test", "system test", "integration test", "live test", "workflow test"] },
        { icon: Activity,     label: "OTP Debug",               href: "/admin/otp-debug",         require: ["users",      "view"] },
        { icon: MessageSquare,label: "Admin Chat",              href: "/admin/chat",              require: ["customers",  "view"] },
      ],
    },

  ];
}
