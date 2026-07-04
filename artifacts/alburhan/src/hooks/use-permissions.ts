import { useEffect, useState, useCallback } from "react";

export type AdminRole =
  | "super_admin" | "admin" | "accounts" | "manager"
  | "sales" | "operations" | "guide" | "staff" | "read_only";

export type Module =
  | "bookings" | "payments" | "expenses" | "accounting" | "payroll"
  | "gst" | "assets" | "groups" | "pilgrims" | "staff" | "customers"
  | "reports" | "audit_logs" | "settings" | "users";

export type Action = "view" | "create" | "edit" | "delete" | "approve" | "export";

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

export const ROLE_COLORS: Record<AdminRole, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  accounts: "bg-green-100 text-green-800",
  manager: "bg-teal-100 text-teal-800",
  sales: "bg-orange-100 text-orange-800",
  operations: "bg-yellow-100 text-yellow-800",
  guide: "bg-sky-100 text-sky-800",
  staff: "bg-gray-100 text-gray-700",
  read_only: "bg-slate-100 text-slate-600",
};

const ALL: Action[] = ["view", "create", "edit", "delete", "approve", "export"];
const RO: Action[] = ["view", "export"];
const VIEW: Action[] = ["view"];
const RW: Action[] = ["view", "create", "edit", "export"];

const PERMISSIONS: Record<AdminRole, Partial<Record<Module, Action[]>>> = {
  super_admin: {
    bookings: ALL, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: ALL, pilgrims: ALL, staff: ALL,
    customers: ALL, reports: ALL, audit_logs: ALL, settings: ALL, users: ALL,
  },
  admin: {
    bookings: ALL, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: ALL, pilgrims: ALL, staff: ALL,
    customers: ALL, reports: ALL, audit_logs: ALL, settings: ALL, users: RO,
  },
  accounts: {
    bookings: RO, payments: ALL, expenses: ALL, accounting: ALL, payroll: ALL,
    gst: ALL, assets: ALL, groups: VIEW, pilgrims: VIEW, customers: VIEW,
    reports: ALL, audit_logs: VIEW, staff: [], settings: [], users: [],
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
    expenses: VIEW, assets: VIEW, staff: VIEW, customers: VIEW, reports: VIEW,
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
    gst: [], assets: [], customers: [], reports: [], audit_logs: [], settings: [], users: [],
  },
  read_only: {
    bookings: RO, payments: RO, expenses: RO, accounting: VIEW,
    groups: VIEW, pilgrims: VIEW, staff: VIEW, customers: VIEW,
    reports: RO, gst: RO, assets: VIEW,
    payroll: [], audit_logs: [], settings: [], users: [],
  },
};

export function can(adminRole: AdminRole, module: Module, action: Action): boolean {
  return (PERMISSIONS[adminRole]?.[module] ?? []).includes(action);
}

const API = import.meta.env.VITE_API_URL || "";
let _cached: { adminRole: AdminRole; name?: string } | null = null;
let _fetching: Promise<{ adminRole: AdminRole; name?: string }> | null = null;

async function fetchMe(): Promise<{ adminRole: AdminRole; name?: string }> {
  if (_cached) return _cached;
  if (_fetching) return _fetching;
  _fetching = fetch(`${API}/api/admin-users/me`, { credentials: "include" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const result = {
        adminRole: (data?.adminRole ?? "super_admin") as AdminRole,
        name: data?.name,
      };
      _cached = result;
      _fetching = null;
      return result;
    })
    .catch(() => {
      _fetching = null;
      return { adminRole: "super_admin" as AdminRole };
    });
  return _fetching;
}

export function invalidatePermissionsCache() {
  _cached = null;
}

export function usePermissions() {
  const [adminRole, setAdminRole] = useState<AdminRole>("super_admin");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchMe().then(({ adminRole: role }) => {
      setAdminRole(role);
      setLoaded(true);
    });
  }, []);

  const check = useCallback(
    (module: Module, action: Action) => can(adminRole, module, action),
    [adminRole]
  );

  return {
    adminRole,
    roleLabel: ROLE_LABELS[adminRole] ?? adminRole,
    roleColor: ROLE_COLORS[adminRole] ?? "",
    can: check,
    loaded,
    isSuper: adminRole === "super_admin",
    isAdminLevel: adminRole === "super_admin" || adminRole === "admin",
  };
}
