import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requirePermission, type AuthenticatedRequest } from "../lib/auth.js";
import { isValidAdminRole, ADMIN_ROLES, ROLE_LABELS } from "../lib/rbac.js";
import { auditLog } from "../lib/audit.js";

const router = Router();

router.get("/me", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  res.json({
    id: req.user!.id,
    mobile: req.user!.mobile,
    name: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
    adminRole: req.user!.adminRole,
  });
});

router.get(
  "/",
  requirePermission("users", "view") as any,
  async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, mobile, name, email, role, admin_role, created_at, updated_at
         FROM users WHERE role='admin' ORDER BY created_at DESC`
      );
      res.json(r.rows);
    } catch (err) {
      console.error("[admin-users] GET /:", err);
      res.status(500).json({ error: "Failed to fetch admin users" });
    }
  }
);

router.put(
  "/:id/role",
  requirePermission("users", "edit") as any,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { admin_role } = req.body;
      if (!admin_role || !isValidAdminRole(admin_role)) {
        return res.status(400).json({ error: `Invalid admin role. Valid roles: ${ADMIN_ROLES.join(", ")}` });
      }

      const existing = await pool.query(
        `SELECT id, mobile, name, admin_role FROM users WHERE id=$1 AND role='admin'`,
        [req.params.id]
      );
      if (!existing.rows[0]) return res.status(404).json({ error: "Admin user not found" });

      if (req.params.id === req.user?.id && admin_role !== "super_admin") {
        return res.status(400).json({ error: "Cannot demote your own super_admin role" });
      }

      await pool.query(
        `UPDATE users SET admin_role=$1, updated_at=NOW() WHERE id=$2`,
        [admin_role, req.params.id]
      );

      await auditLog({
        req,
        action: "updated",
        entityTable: "users",
        entityId: req.params.id,
        oldValue: { admin_role: existing.rows[0].admin_role },
        newValue: { admin_role, name: existing.rows[0].name, mobile: existing.rows[0].mobile },
      });

      res.json({ success: true, id: req.params.id, admin_role, label: ROLE_LABELS[admin_role] });
    } catch (err) {
      console.error("[admin-users] PUT /:id/role:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

export default router;
