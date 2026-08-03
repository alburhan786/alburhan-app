import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";
import { hasPermission, isValidAdminRole, type AdminRole, type Module, type Action } from "./rbac.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    mobile: string;
    role: string;
    adminRole: AdminRole;
    name?: string | null;
    email?: string | null;
    assignedGroupIds: string[];
    /** SaaS Phase 3: tenant this user belongs to. Defaults to Al Burhan UUID. */
    tenantId?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Idempotent — skip DB lookup if already resolved (e.g. when used as router.use + per-route middleware)
  if (req.user) { next(); return; }
  // Support both session.userId (OTP login) and session.user.id (dev-login / legacy)
  const userId = (req.session as any)?.userId || (req.session as any)?.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized. Please login first." });
    return;
  }
  try {
    const result = await pool.query(`SELECT * FROM users WHERE id=$1 LIMIT 1`, [userId]);
    if (!result.rows[0]) {
      res.status(401).json({ message: "Session invalid. Please login again." });
      return;
    }
    const u = result.rows[0];
    req.user = {
      id: u.id,
      mobile: u.mobile,
      role: u.role,
      // Default admin/super_admin users to 'admin' role when admin_role is not set in DB
      adminRole: (u.admin_role || (u.role === "super_admin" ? "super_admin" : u.role === "admin" ? "admin" : "read_only")) as AdminRole,
      name: u.name,
      email: u.email,
      assignedGroupIds: Array.isArray(u.assigned_group_ids) ? u.assigned_group_ids : [],
      // SaaS Phase 3: propagate tenant_id from users table; default to Al Burhan for all existing accounts
      tenantId: u.tenant_id ?? DEFAULT_TENANT_ID,
    };
    next();
  } catch (err) {
    console.error("[auth] requireAuth error:", err);
    res.status(500).json({ message: "Authentication error" });
  }
}

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const PORTAL_ROLES = new Set(["admin", "super_admin", "branch_manager", "agent", "staff"]);

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (!ADMIN_ROLES.has(req.user?.role ?? "")) {
      res.status(403).json({ message: "Admin access required." });
      return;
    }
    next();
  });
}

/** Allows admin, super_admin, branch_manager, agent, staff — all roles that use the admin layout */
export async function requirePortalUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (!PORTAL_ROLES.has(req.user?.role ?? "")) {
      res.status(403).json({ message: "Portal access required." });
      return;
    }
    next();
  });
}

/** Central helper: true for any user that has admin-portal access */
function isAdminOrSuperAdmin(req: AuthenticatedRequest): boolean {
  return ADMIN_ROLES.has(req.user?.role ?? "");
}

export function requirePermission(module: Module, action: Action) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      if (!isAdminOrSuperAdmin(req)) {
        res.status(403).json({ message: "Admin access required." });
        return;
      }
      const adminRole = req.user!.adminRole;
      if (!hasPermission(adminRole, module, action)) {
        res.status(403).json({
          message: `Permission denied: role '${adminRole}' cannot perform '${action}' on '${module}'`,
        });
        return;
      }
      next();
    });
  };
}

/** Maps HTTP method → RBAC Action, then enforces permission. Use as router.use() for full module protection. */
export function requireModuleAccess(module: Module) {
  const METHOD_ACTION: Record<string, Action> = {
    GET: "view", POST: "create", PUT: "edit", PATCH: "edit", DELETE: "delete",
  };
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      if (!isAdminOrSuperAdmin(req)) {
        res.status(403).json({ message: "Admin access required." });
        return;
      }
      const action: Action = METHOD_ACTION[req.method] ?? "view";
      const adminRole = req.user!.adminRole;
      if (!hasPermission(adminRole, module, action)) {
        res.status(403).json({
          message: `Permission denied: role '${adminRole}' cannot ${action} ${module}`,
        });
        return;
      }
      next();
    });
  };
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
