import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { hasPermission, isValidAdminRole, type AdminRole, type Module, type Action } from "./rbac.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    mobile: string;
    role: string;
    adminRole: AdminRole;
    name?: string | null;
    email?: string | null;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = (req.session as any)?.userId;
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
      adminRole: (u.admin_role || "super_admin") as AdminRole,
      name: u.name,
      email: u.email,
    };
    next();
  } catch (err) {
    console.error("[auth] requireAuth error:", err);
    res.status(500).json({ message: "Authentication error" });
  }
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ message: "Admin access required." });
      return;
    }
    next();
  });
}

export function requirePermission(module: Module, action: Action) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      if (req.user?.role !== "admin") {
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

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
