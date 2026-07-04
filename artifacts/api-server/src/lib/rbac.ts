export type AdminRole =
  | "super_admin" | "admin" | "accounts" | "manager"
  | "sales" | "operations" | "guide" | "staff" | "read_only";

export type Module =
  | "bookings" | "payments" | "expenses" | "accounting" | "payroll"
  | "gst" | "assets" | "groups" | "pilgrims" | "staff" | "customers"
  | "reports" | "audit_logs" | "settings" | "users";

export type Action = "view" | "create" | "edit" | "delete" | "approve" | "export";

export const ADMIN_ROLES: AdminRole[] = [
  "super_admin", "admin", "accounts", "manager",
  "sales", "operations", "guide", "staff", "read_only",
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accounts: "Accounts",
  manager: "Manager",
  sales: "Sales",
  operations: "Operations",
  guide: "Guide",
  staff: "Staff",
  read_only: "Read Only",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full access to everything including user management and audit logs",
  admin: "Full operational access, cannot manage user roles",
  accounts: "Full access to Expenses, Accounting, GST, Payroll, Assets",
  manager: "Manage groups, pilgrims, customers; view financial data",
  sales: "Create/manage bookings and payments; manage customers",
  operations: "Manage groups, flights, hotels, buses, pilgrims; view bookings",
  guide: "Read-only access to assigned group's pilgrim list",
  staff: "View groups and pilgrims only",
  read_only: "View and export any data but cannot create/edit/delete",
};

const ALL: Action[] = ["view", "create", "edit", "delete", "approve", "export"];
const RW: Action[] = ["view", "create", "edit", "export"];
const RO: Action[] = ["view", "export"];
const VIEW: Action[] = ["view"];

const PERMISSIONS: Record<AdminRole, Partial<Record<Module, Action[]>>> = {
  super_admin: {
    bookings: ALL, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: ALL, pilgrims: ALL, staff: ALL,
    customers: ALL, reports: ALL, audit_logs: ALL, settings: ALL, users: ALL,
  },
  admin: {
    bookings: ALL, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: ALL, pilgrims: ALL, staff: ALL,
    customers: ALL, reports: ALL, audit_logs: ALL, settings: ALL,
    users: RO,
  },
  accounts: {
    bookings: RO, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: VIEW, pilgrims: VIEW,
    customers: VIEW, reports: ALL, audit_logs: VIEW,
    staff: [], settings: [], users: [],
  },
  manager: {
    bookings: RW, payments: RO, expenses: RO, accounting: VIEW,
    groups: ALL, pilgrims: ALL, staff: VIEW, customers: RW,
    reports: VIEW, gst: VIEW, assets: VIEW,
    payroll: [], audit_logs: [], settings: [], users: [],
  },
  sales: {
    bookings: RW, payments: ["view", "create"], customers: ALL,
    groups: VIEW, pilgrims: VIEW, reports: VIEW,
    expenses: [], accounting: [], payroll: [], gst: [], assets: [],
    staff: [], audit_logs: [], settings: [], users: [],
  },
  operations: {
    groups: ALL, pilgrims: ALL, bookings: VIEW, payments: VIEW,
    expenses: VIEW, assets: VIEW, staff: VIEW, customers: VIEW,
    reports: VIEW,
    accounting: [], payroll: [], gst: [], audit_logs: [], settings: [], users: [],
  },
  guide: {
    groups: VIEW, pilgrims: VIEW,
    bookings: [], payments: [], expenses: [], accounting: [], payroll: [],
    gst: [], assets: [], staff: [], customers: [], reports: [],
    audit_logs: [], settings: [], users: [],
  },
  staff: {
    groups: VIEW, pilgrims: VIEW, staff: VIEW,
    bookings: [], payments: [], expenses: [], accounting: [], payroll: [],
    gst: [], assets: [], customers: [], reports: [],
    audit_logs: [], settings: [], users: [],
  },
  read_only: {
    bookings: RO, payments: RO, expenses: RO, accounting: VIEW,
    groups: VIEW, pilgrims: VIEW, staff: VIEW, customers: VIEW,
    reports: RO, gst: RO, assets: VIEW,
    payroll: [], audit_logs: [], settings: [], users: [],
  },
};

export function hasPermission(adminRole: AdminRole, module: Module, action: Action): boolean {
  const perms = PERMISSIONS[adminRole]?.[module] ?? [];
  return perms.includes(action);
}

export function isValidAdminRole(role: string): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

export function getAllowedModules(adminRole: AdminRole): Module[] {
  return (Object.keys(PERMISSIONS[adminRole] || {}) as Module[])
    .filter(m => (PERMISSIONS[adminRole][m] || []).length > 0);
}
