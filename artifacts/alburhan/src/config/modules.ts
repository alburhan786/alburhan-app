export interface ModuleItem {
  label: string;
  desc: string;
  href: string;
  section: string;
  sectionColor: string;
  aliases?: string[];
}

export const ALL_MODULES: ModuleItem[] = [
  /* ── PORTALS ─── */
  { label: "Super Admin Dashboard",    desc: "Command center",              href: "/admin/super",             section: "Portals",                       sectionColor: "violet" },
  { label: "Branch Dashboard",         desc: "Branch performance",          href: "/admin/branch-dashboard",  section: "Portals",                       sectionColor: "violet" },
  { label: "Branch Login Management",  desc: "Branch login & access",       href: "/admin/branch-login",      section: "Portals",                       sectionColor: "violet" },
  { label: "Agent Dashboard",          desc: "Agent analytics",             href: "/admin/agent-dashboard",   section: "Portals",                       sectionColor: "violet" },
  { label: "Agent Login Management",   desc: "Agent login & access",        href: "/admin/agent-login",       section: "Portals",                       sectionColor: "violet" },
  { label: "Staff Dashboard",          desc: "Staff management",            href: "/admin/staff-dashboard",   section: "Portals",                       sectionColor: "violet" },
  { label: "Customer Dashboard",       desc: "Customer overview",           href: "/admin/customer-dashboard",section: "Portals",                       sectionColor: "violet" },

  /* ── OVERVIEW & INTELLIGENCE ─── */
  { label: "Executive Dashboard",      desc: "C-suite KPIs & overview",     href: "/admin/executive",         section: "Overview & Intelligence",       sectionColor: "indigo" },
  { label: "Operations Dashboard",     desc: "Ops status & tracking",       href: "/admin/operations",        section: "Overview & Intelligence",       sectionColor: "indigo" },
  { label: "Manager Dashboard",        desc: "Team & pipeline view",        href: "/admin/manager",           section: "Overview & Intelligence",       sectionColor: "indigo" },
  { label: "Business Intelligence",    desc: "Trends & insights",           href: "/admin/bi",                section: "Overview & Intelligence",       sectionColor: "indigo" },
  { label: "AI Analytics Dashboard",   desc: "ML-powered insights",         href: "/admin/ai-ops",            section: "Overview & Intelligence",       sectionColor: "indigo" },

  /* ── FINANCE & ACCOUNTING ─── */
  { label: "Finance Dashboard",        desc: "P&L, cash flow, ledger",      href: "/admin/finance",           section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Accounting Dashboard",     desc: "Books & journal entries",     href: "/admin/accounting",        section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Payment Dashboard",        desc: "Transactions & receipts",     href: "/admin/payments",          section: "Finance & Accounting",          sectionColor: "emerald", aliases: ["payment", "transaction", "receipt", "customer", "customers"] },
  { label: "Offline Payments",         desc: "Bank transfers & cash",       href: "/admin/offline-payments",  section: "Finance & Accounting",          sectionColor: "emerald", aliases: ["offline payment", "bank transfer", "cash payment"] },
  { label: "Invoice Dashboard",        desc: "Invoice management",          href: "/admin/invoices",          section: "Finance & Accounting",          sectionColor: "emerald", aliases: ["invoice", "bill", "customer", "customers"] },
  { label: "Expense Dashboard",        desc: "Expenses & cost tracking",    href: "/admin/expenses",          section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Receipt Dashboard",        desc: "Payment receipts",            href: "/admin/receipts",          section: "Finance & Accounting",          sectionColor: "emerald" },

  /* ── CRM, SALES & CUSTOMER ─── */
  { label: "CRM Dashboard",            desc: "Leads & pipeline",            href: "/admin/crm",               section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["crm", "customer relationship", "pipeline", "sales", "lead", "leads"] },
  { label: "Lead Manager",             desc: "Lead capture & follow-up",    href: "/admin/leads",             section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["lead", "leads", "prospects", "enquiry", "follow-up", "funnel", "customer"] },
  { label: "Lead Dashboard",           desc: "Lead analytics & pipeline",   href: "/admin/leads",             section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["lead", "leads", "pipeline", "analytics", "customer"] },
  { label: "Customer 360° Profile",    desc: "Full customer history",       href: "/admin/customer360",       section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["360", "customer profile", "full profile", "history", "customer", "lead", "customer 360", "360 profile"] },
  { label: "Customer Analytics",       desc: "Customer data & behaviour",   href: "/admin/customers",         section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["customers", "data", "behaviour", "analytics", "customer"] },
  { label: "Customer Dashboard",       desc: "Customer overview & stats",   href: "/admin/customer-dashboard",section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["customer dashboard", "customer overview", "customer", "bookings", "invoices"] },
  { label: "Loyalty & Rewards",        desc: "Points & redemptions",        href: "/admin/loyalty",           section: "CRM, Sales & Customer",         sectionColor: "blue",    aliases: ["loyalty", "points", "rewards", "redeem", "tier", "customer"] },

  /* ── SUPPLIER, PROCUREMENT & INVENTORY ─── */
  { label: "SRM Dashboard",            desc: "Supplier relationships",      href: "/admin/srm",               section: "Supplier, Procurement & Inventory", sectionColor: "purple" },
  { label: "Supplier Dashboard",       desc: "Supplier directory",          href: "/admin/suppliers",         section: "Supplier, Procurement & Inventory", sectionColor: "purple" },
  { label: "Procurement Dashboard",    desc: "Purchase orders",             href: "/admin/procurement",       section: "Supplier, Procurement & Inventory", sectionColor: "purple" },
  { label: "Inventory Dashboard",      desc: "Stock & equipment",           href: "/admin/inventory",         section: "Supplier, Procurement & Inventory", sectionColor: "purple" },
  { label: "Vendor Dashboard",         desc: "Vendor management",           href: "/admin/vendors",           section: "Supplier, Procurement & Inventory", sectionColor: "purple" },

  /* ── HR & WORKFORCE ─── */
  { label: "HR Dashboard",             desc: "Staff & HR management",       href: "/admin/hr",                section: "HR & Workforce",                sectionColor: "amber" },
  { label: "Payroll Dashboard",        desc: "Salary & payslips",           href: "/admin/payroll",           section: "HR & Workforce",                sectionColor: "amber" },
  { label: "Staff Manager",            desc: "Manage all staff members",    href: "/admin/staff",             section: "HR & Workforce",                sectionColor: "amber" },
  { label: "Task Dashboard",           desc: "Tasks & assignments",         href: "/admin/tasks",             section: "HR & Workforce",                sectionColor: "amber" },
  { label: "Asset Manager",            desc: "Company assets & equipment",  href: "/admin/assets",            section: "HR & Workforce",                sectionColor: "amber" },
  { label: "Attendance",               desc: "Group attendance tracking",   href: "/admin/groups",            section: "HR & Workforce",                sectionColor: "amber" },

  /* ── BOOKING & PILGRIM OPERATIONS ─── */
  { label: "Bookings",                 desc: "All bookings & reservations", href: "/admin/bookings",          section: "Booking & Pilgrim Operations",  sectionColor: "rose",  aliases: ["booking", "reservation", "hajj booking", "umrah booking", "customer", "customers"] },
  { label: "Offline Booking",          desc: "Walk-in & manual bookings",   href: "/admin/offline-bookings",  section: "Booking & Pilgrim Operations",  sectionColor: "rose",  aliases: ["offline", "walk-in", "manual booking", "counter"] },
  { label: "Hajj Groups",              desc: "Hajj group management",       href: "/admin/groups",            section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Umrah Groups",             desc: "Umrah group management",      href: "/admin/groups?type=umrah", section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Visa Dashboard",           desc: "Visa status & processing",    href: "/admin/visa",              section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Flight Dashboard",         desc: "Flight management",           href: "/admin/flights",           section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Hotel Dashboard",          desc: "Hotel management",            href: "/admin/hotels",            section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Transport Dashboard",      desc: "Buses & vehicles",            href: "/admin/buses",             section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Room Allocation",          desc: "Mina / Arafat / Muzdalifa",   href: "/admin/allocations",       section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Guide Panel",              desc: "Tour guide management",       href: "/admin/guide-panel",       section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Ziyarat Dashboard",        desc: "Ziyarat schedule & sites",    href: "/admin/ziyarat",           section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Pilgrim Reports",          desc: "Pilgrim data & reports",      href: "/admin/pilgrim-reports",   section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "QR Tracker",               desc: "Pilgrim QR tracking",         href: "/admin/qr-tracker",        section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Print Center",             desc: "ID cards, luggage & docs",    href: "/admin/print-center",      section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Agreement Dashboard",      desc: "Contracts & digital sign",    href: "/admin/agreements",        section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Certificate Center",       desc: "Haj & Umrah certificates",    href: "/admin/certificates",      section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Document Management",      desc: "Passport, Aadhaar & docs",    href: "/admin/document-expiry",   section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "KYC Dashboard",            desc: "Know Your Customer docs",     href: "/admin/kyc",               section: "Booking & Pilgrim Operations",  sectionColor: "rose" },

  /* ── COMMUNICATION & MARKETING ─── */
  { label: "WhatsApp Dashboard",       desc: "Messages & templates",        href: "/admin/botbee-dashboard",  section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["wa", "whatsapp", "waba", "botbee", "chat", "messages", "templates", "wapp"] },
  { label: "SMS Dashboard",            desc: "DLT & SMS campaigns",         href: "/admin/sms-dashboard",     section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["sms", "text", "dlt", "bulk sms", "fast2sms", "short message"] },
  { label: "Email Dashboard",          desc: "Email templates & delivery",  href: "/admin/email-dashboard",   section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["email", "mail", "smtp", "email templates", "newsletter"] },
  { label: "Marketing Dashboard",      desc: "Campaigns & broadcasts",      href: "/admin/marketing",         section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["marketing", "campaign", "broadcast", "blast", "bulk", "whatsapp", "sms"] },
  { label: "Broadcast Center",         desc: "Mass messaging & alerts",     href: "/admin/broadcast",         section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["broadcast", "mass message", "bulk", "alert", "announcement", "whatsapp", "sms", "email"] },
  { label: "Notification Center",      desc: "Push & in-app notifications", href: "/admin/notifications",     section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["notification", "push", "alert", "bell", "notify", "whatsapp", "sms", "email"] },
  { label: "Social Media Integration", desc: "All social channels",         href: "/admin/social-media",      section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["social", "facebook", "fb", "instagram", "ig", "telegram", "tg", "messenger", "channels", "social media"] },
  { label: "Instagram Dashboard",      desc: "Instagram DMs & comments",    href: "/admin/social-media#instagram", section: "Communication & Marketing", sectionColor: "teal",  aliases: ["instagram", "ig", "instagram dm", "instagram messages", "reels", "social"] },
  { label: "Facebook Dashboard",       desc: "Facebook Messenger & pages",  href: "/admin/social-media#facebook",  section: "Communication & Marketing", sectionColor: "teal",  aliases: ["facebook", "fb", "messenger", "facebook page", "meta", "social"] },
  { label: "Telegram Dashboard",       desc: "Telegram bot messages",       href: "/admin/social-media#telegram",  section: "Communication & Marketing", sectionColor: "teal",  aliases: ["telegram", "tg", "telegram bot", "telegram messages", "social"] },
  { label: "Omni Channel Dashboard",   desc: "Multi-channel overview",      href: "/admin/inbox",             section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["omni", "inbox", "multichannel", "omnichannel", "unified inbox", "all channels", "whatsapp"] },
  { label: "Website CMS",              desc: "Public pages & content",      href: "/admin/cms",               section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["cms", "website", "content", "pages", "public site"] },
  { label: "Automation Center",        desc: "Workflow automation rules",   href: "/admin/automation-center", section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["automation", "rules", "triggers", "auto", "workflow"] },
  { label: "Workflow Center",          desc: "Notification pipelines",      href: "/admin/workflow-center",   section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["workflow", "pipeline", "notification flow", "automation"] },

  /* ── EXTENDED OPERATIONS ─── */
  { label: "Flight Dashboard",         desc: "Flight status & scheduling",  href: "/admin/flight-dashboard",  section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Hotel Dashboard",          desc: "Hotel rooms & allocations",   href: "/admin/hotel-dashboard",   section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Transport Dashboard",      desc: "Buses & transport logistics", href: "/admin/transport-dashboard",section: "Booking & Pilgrim Operations", sectionColor: "rose" },
  { label: "Group Tracking",           desc: "Live group location",         href: "/admin/group-tracking",    section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Pilgrim Operations",       desc: "Pilgrim daily operations",    href: "/admin/pilgrim-ops",       section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Medical Dashboard",        desc: "Health records & medical",    href: "/admin/medical",           section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Luggage Tracker",          desc: "Luggage tagging & tracking",  href: "/admin/luggage",           section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Spray Label",              desc: "Print spray labels",          href: "/admin/print/spray-label", section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Document Management",      desc: "Pilgrims docs & expiry",      href: "/admin/documents",         section: "Booking & Pilgrim Operations",  sectionColor: "rose" },

  /* ── FINANCE EXTENDED ─── */
  { label: "Family Ledger",            desc: "Family account ledger",       href: "/admin/family-ledger",     section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Customer Ledger",          desc: "Per-customer ledger",         href: "/admin/customer-ledger",   section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Hajji Ledger",             desc: "Pilgrim financial ledger",    href: "/admin/hajji-ledger",      section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Payment Analytics",        desc: "Payment trends & charts",     href: "/admin/payment-analytics", section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Payment Reminders",        desc: "Due payment alerts",          href: "/admin/payment-reminders", section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Payment Trash",            desc: "Deleted payment records",     href: "/admin/payment-trash",     section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Booking Trash",            desc: "Deleted booking records",     href: "/admin/bookings?tab=trash",section: "Finance & Accounting",          sectionColor: "emerald" },

  /* ── COMMUNICATION EXTENDED ─── */
  { label: "WhatsApp History",         desc: "Message delivery history",    href: "/admin/whatsapp-history",  section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["whatsapp", "wa", "history", "chat log"] },
  { label: "WhatsApp Templates",       desc: "WA message templates",        href: "/admin/whatsapp-templates",section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["whatsapp", "wa", "template"] },
  { label: "SMS Templates",            desc: "SMS & DLT templates",         href: "/admin/sms-templates",     section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["sms", "dlt template"] },
  { label: "Email Templates",          desc: "Email layout templates",      href: "/admin/email-templates",   section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["email", "mail template"] },
  { label: "RCS Templates",            desc: "Rich communication templates",href: "/admin/rcs-templates",     section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["rcs", "rich communication"] },
  { label: "DLT Template Manager",     desc: "TRAI DLT template registry",  href: "/admin/dlt-templates",     section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["dlt", "sms dlt", "telecom"] },
  { label: "Sender ID Management",     desc: "SMS sender IDs",              href: "/admin/sms-settings",      section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["sender id", "sms settings"] },
  { label: "SMS Test Center",          desc: "Send test SMS messages",      href: "/admin/sms-test",          section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["sms test", "test sms"] },
  { label: "Test Notifications",       desc: "Send test alerts",            href: "/admin/test-notifications",section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["test notification"] },
  { label: "Notification Logs",        desc: "Delivery & send logs",        href: "/admin/notification-logs", section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["notification log", "message log"] },
  { label: "Notification Templates",   desc: "Alert & push templates",      href: "/admin/notification-templates", section: "Communication & Marketing",sectionColor: "teal",  aliases: ["notification template"] },
  { label: "Auto Notifications",       desc: "Scheduled alert rules",       href: "/admin/auto-notifications",section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["auto notification", "automated alerts"] },
  { label: "Notification Dashboard",   desc: "Notification health & stats", href: "/admin/notification-health",section: "Communication & Marketing",    sectionColor: "teal",  aliases: ["notification", "push", "alert", "whatsapp"] },
  { label: "SMS Production Report",    desc: "Live SMS delivery metrics",   href: "/admin/sms-production-report", section: "Communication & Marketing",sectionColor: "teal",  aliases: ["sms report", "production report"] },
  { label: "Admin Chat",               desc: "Internal team chat",          href: "/admin/chat",              section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["chat", "internal", "team"] },
  { label: "Communication Center",     desc: "Omni comms hub",              href: "/admin/communication-center", section: "Communication & Marketing", sectionColor: "teal",  aliases: ["communication", "comm center"] },
  { label: "SMS Audit Log",            desc: "SMS delivery audit trail",    href: "/admin/sms-audit",         section: "Communication & Marketing",     sectionColor: "teal",  aliases: ["sms audit", "audit sms"] },

  /* ── CRM EXTENDED ─── */
  { label: "Agent Management",         desc: "Agent accounts & config",     href: "/admin/agents",            section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Branch Management",        desc: "Office & branch setup",       href: "/admin/branches",          section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Support Manager",          desc: "Customer support tickets",    href: "/admin/support",           section: "CRM, Sales & Customer",         sectionColor: "blue",  aliases: ["support", "ticket", "help"] },
  { label: "Feedback Dashboard",       desc: "Complaints & feedback",       href: "/admin/feedback",          section: "CRM, Sales & Customer",         sectionColor: "blue",  aliases: ["feedback", "complaint", "review"] },
  { label: "Package Requests",         desc: "Custom package inquiries",    href: "/admin/requests",          section: "CRM, Sales & Customer",         sectionColor: "blue",  aliases: ["request", "package request"] },
  { label: "Inquiries",                desc: "General inquiries & leads",   href: "/admin/inquiries",         section: "CRM, Sales & Customer",         sectionColor: "blue",  aliases: ["enquiry", "inquiry"] },

  /* ── SYSTEM EXTENDED ─── */
  { label: "Dashboard",                desc: "Main admin dashboard",        href: "/admin/dashboard",         section: "System & Security",             sectionColor: "red" },
  { label: "AI Assistant",             desc: "AI help & automation",        href: "/admin/ai",                section: "System & Security",             sectionColor: "red",   aliases: ["ai", "assistant", "gpt", "chatbot"] },
  { label: "Gallery",                  desc: "Media library & gallery",     href: "/admin/gallery",           section: "System & Security",             sectionColor: "red" },
  { label: "Packages",                 desc: "Travel package catalog",      href: "/admin/packages",          section: "System & Security",             sectionColor: "red" },
  { label: "OTP Debug",                desc: "OTP delivery diagnostics",    href: "/admin/otp-debug",         section: "System & Security",             sectionColor: "red" },

  /* ── ANALYTICS & REPORTING ─── */
  { label: "Reports Dashboard",        desc: "Operational reports",         href: "/admin/reports",           section: "Analytics & Reporting",         sectionColor: "slate" },
  { label: "GST Reports",              desc: "Tax & GST summaries",         href: "/admin/gst-reports",       section: "Analytics & Reporting",         sectionColor: "slate" },
  { label: "Production Report",        desc: "System & ops metrics",        href: "/admin/production-report", section: "Analytics & Reporting",         sectionColor: "slate" },
  { label: "Global Search",            desc: "Search all ERP data",         href: "/admin/search",            section: "Analytics & Reporting",         sectionColor: "slate" },

  /* ── SYSTEM & SECURITY ─── */
  { label: "Mobile App Dashboard",     desc: "App configuration",           href: "/admin/mobile-app",        section: "System & Security",             sectionColor: "red" },
  { label: "User & Role Management",   desc: "Accounts & permissions",      href: "/admin/user-roles",        section: "System & Security",             sectionColor: "red" },
  { label: "Permission Management",    desc: "Role permission matrix",      href: "/admin/permissions",       section: "System & Security",             sectionColor: "red" },
  { label: "Audit Log Dashboard",      desc: "All system activity",         href: "/admin/audit-logs",        section: "System & Security",             sectionColor: "red" },
  { label: "Activity Log Dashboard",   desc: "User activity stream",        href: "/admin/activity-logs",     section: "System & Security",             sectionColor: "red" },
  { label: "Security Dashboard",       desc: "Security health & alerts",    href: "/admin/security",          section: "System & Security",             sectionColor: "red" },
  { label: "Backup Dashboard",         desc: "Data backups & restore",      href: "/admin/backups",           section: "System & Security",             sectionColor: "red" },
  { label: "API Dashboard",            desc: "API keys & endpoints",        href: "/admin/api-settings",      section: "System & Security",             sectionColor: "red" },
  { label: "Integration Dashboard",    desc: "Third-party connections",     href: "/admin/integrations",      section: "System & Security",             sectionColor: "red" },
  { label: "System Health",            desc: "Uptime & diagnostics",        href: "/admin/system-health",     section: "System & Security",             sectionColor: "red" },
  { label: "Billing Settings",         desc: "Subscription & billing",      href: "/admin/billing-settings",  section: "System & Security",             sectionColor: "red" },
  { label: "Settings Dashboard",       desc: "Company configuration",       href: "/admin/settings",          section: "System & Security",             sectionColor: "red" },
];

export const SECTION_COLOR_MAP: Record<string, string> = {
  violet:  "bg-violet-100 text-violet-700",
  indigo:  "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue:    "bg-blue-100 text-blue-700",
  purple:  "bg-purple-100 text-purple-700",
  amber:   "bg-amber-100 text-amber-700",
  rose:    "bg-rose-100 text-rose-700",
  teal:    "bg-teal-100 text-teal-700",
  slate:   "bg-slate-100 text-slate-700",
  red:     "bg-red-100 text-red-700",
};
