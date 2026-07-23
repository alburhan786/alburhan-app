export interface ModuleItem {
  label: string;
  desc: string;
  href: string;
  section: string;
  sectionColor: string;
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
  { label: "Payment Dashboard",        desc: "Transactions & receipts",     href: "/admin/payments",          section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Offline Payments",         desc: "Bank transfers & cash",       href: "/admin/offline-payments",  section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Invoice Dashboard",        desc: "Invoice management",          href: "/admin/invoices",          section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Expense Dashboard",        desc: "Expenses & cost tracking",    href: "/admin/expenses",          section: "Finance & Accounting",          sectionColor: "emerald" },
  { label: "Receipt Dashboard",        desc: "Payment receipts",            href: "/admin/receipts",          section: "Finance & Accounting",          sectionColor: "emerald" },

  /* ── CRM, SALES & CUSTOMER ─── */
  { label: "CRM Dashboard",            desc: "Leads & pipeline",            href: "/admin/crm",               section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Lead Manager",             desc: "Lead capture & follow-up",    href: "/admin/leads",             section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Customer 360° Profile",    desc: "Full customer history",       href: "/admin/customer360",       section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Customer Analytics",       desc: "Customer data & behaviour",   href: "/admin/customers",         section: "CRM, Sales & Customer",         sectionColor: "blue" },
  { label: "Loyalty & Rewards",        desc: "Points & redemptions",        href: "/admin/loyalty",           section: "CRM, Sales & Customer",         sectionColor: "blue" },

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
  { label: "Bookings",                 desc: "All bookings & reservations", href: "/admin/bookings",          section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Offline Booking",          desc: "Walk-in & manual bookings",   href: "/admin/offline-bookings",  section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Hajj Groups",              desc: "Hajj group management",       href: "/admin/groups",            section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
  { label: "Umrah Groups",             desc: "Umrah group management",      href: "/admin/groups",            section: "Booking & Pilgrim Operations",  sectionColor: "rose" },
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
  { label: "WhatsApp Dashboard",       desc: "Messages & templates",        href: "/admin/botbee-dashboard",  section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "SMS Dashboard",            desc: "DLT & SMS campaigns",         href: "/admin/sms-dashboard",     section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Email Dashboard",          desc: "Email templates & delivery",  href: "/admin/email-dashboard",   section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Marketing Dashboard",      desc: "Campaigns & broadcasts",      href: "/admin/marketing",         section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Broadcast Center",         desc: "Mass messaging & alerts",     href: "/admin/broadcast",         section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Notification Center",      desc: "Push & in-app notifications", href: "/admin/notifications",     section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Social Media Integration", desc: "All social channels",         href: "/admin/social-media",      section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Omni Channel Inbox",       desc: "All messages in one view",    href: "/admin/inbox",             section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Website CMS",              desc: "Public pages & content",      href: "/admin/cms",               section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Automation Center",        desc: "Workflow automation rules",   href: "/admin/automation-center", section: "Communication & Marketing",     sectionColor: "teal" },
  { label: "Workflow Center",          desc: "Notification pipelines",      href: "/admin/workflow-center",   section: "Communication & Marketing",     sectionColor: "teal" },

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
