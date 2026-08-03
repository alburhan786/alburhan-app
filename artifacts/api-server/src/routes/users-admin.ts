// @ts-nocheck
import { Router } from "express";
import { getTenantId } from "../lib/tenantContext.js";
import { scrypt as _scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { pool } from "@workspace/db";
import { requireAdmin, requirePermission, type AuthenticatedRequest } from "../lib/auth.js";
import { isValidAdminRole, ADMIN_ROLES, ROLE_LABELS } from "../lib/rbac.js";
import { auditLog } from "../lib/audit.js";
import { sendWhatsApp, sendDLTSMS } from "../lib/notifications.js";
import { sendGenericEmail } from "../services/emailService.js";

const router = Router();
const scryptAsync = promisify(_scrypt);

// ── Crypto password helpers (no external deps) ───────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isSuperAdmin(req: AuthenticatedRequest) {
  // Supports both role="admin"+adminRole="super_admin" (current) and
  // role="super_admin" (future-proof) patterns.
  return (req.user?.role === "admin" || req.user?.role === "super_admin") && req.user?.adminRole === "super_admin";
}

async function sendCredentials(
  mobile: string,
  name: string,
  password: string,
  email?: string | null
) {
  const loginUrl = "https://alburhantravels.com/login";
  const msg =
    `Welcome to Al Burhan Tours & Travels!\n\n` +
    `Your login credentials:\n` +
    `📱 Mobile: ${mobile}\n` +
    `🔑 Password: ${password}\n\n` +
    `Login at: ${loginUrl}\n\n` +
    `Al Burhan Tours & Travels\n+91 8989701701`;

  // Fire-and-forget all channels
  sendWhatsApp(mobile, msg).catch(() => {});
  sendDLTSMS(mobile, name || "User", "", "CONFIRMED").catch(() => {});
  if (email) {
    sendGenericEmail({
      to: email,
      subject: "Your Al Burhan Tours Login Credentials",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#0d5040">Welcome to Al Burhan Tours & Travels</h2>
          <p>Dear ${name || "User"},</p>
          <p>Your account has been created. Here are your login credentials:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:4px 0"><strong>Mobile:</strong> ${mobile}</p>
            <p style="margin:4px 0"><strong>Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${password}</code></p>
          </div>
          <p><a href="${loginUrl}" style="background:#0d5040;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Login Now</a></p>
          <p style="color:#6b7280;font-size:13px">Please change your password after first login. If you did not request this account, contact us immediately.</p>
          <p style="color:#6b7280;font-size:12px">Al Burhan Tours & Travels | +91 8989701701</p>
        </div>`,
    }).catch(() => {});
  }
}

// ── GET /me ──────────────────────────────────────────────────────────────────
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

// ── GET / — admin users (existing, for permissions page) ─────────────────────
router.get(
  "/",
  requirePermission("users", "view") as any,
  async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, mobile, name, email, role, admin_role, assigned_group_ids, is_active, created_at, updated_at
         FROM users WHERE role='admin' ORDER BY created_at DESC`
      );
      res.json(r.rows);
    } catch (err) {
      console.error("[admin-users] GET /:", err);
      res.status(500).json({ error: "Failed to fetch admin users" });
    }
  }
);

// ── GET /all — all non-customer users for User Management page ───────────────
router.get(
  "/all",
  requirePermission("users", "view") as any,
  async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT u.id, u.mobile, u.name, u.email, u.role, u.admin_role,
                u.is_active, u.created_at,
                b.name AS branch_name, b.id AS branch_id
         FROM users u
         LEFT JOIN branches b ON (
           (u.role='branch_manager' AND b.manager_mobile=u.mobile) OR
           (u.role='agent' AND EXISTS (
             SELECT 1 FROM agents a WHERE a.mobile=u.mobile AND a.branch_id=b.id LIMIT 1
           ))
         )
         WHERE u.role != 'customer'
         ORDER BY u.created_at DESC`
      );
      res.json(r.rows);
    } catch (err) {
      console.error("[admin-users] GET /all:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

// ── GET /branches — list active branches for dropdown ───────────────────────
router.get(
  "/branches",
  requireAdmin as any,
  async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, name, city FROM branches WHERE is_active=true ORDER BY name`
      );
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  }
);

// ── POST /create — create a new user ────────────────────────────────────────
router.post(
  "/create",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    if (!isSuperAdmin(req)) {
      return void res.status(403).json({ error: "Only Super Admins can create users" });
    }

    const {
      name, mobile, email, password,
      portal_role,   // 'super_admin'|'admin'|'branch_manager'|'agent'|'staff'
      admin_role,    // only for admin users
      branch_id,     // for branch_manager / agent
      commission_rate, // for agent
      send_credentials: doSend,
    } = req.body;

    if (!mobile || !password || !portal_role) {
      return void res.status(400).json({ error: "mobile, password and role are required" });
    }

    // Clean mobile
    const cleanMobile = mobile.replace(/\D/g, "").replace(/^91/, "").replace(/^0/, "");
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      return void res.status(400).json({ error: "Invalid Indian mobile number" });
    }

    // Unique mobile check
    const existing = await pool.query(`SELECT id FROM users WHERE mobile=$1`, [cleanMobile]);
    if (existing.rows[0]) {
      return void res.status(409).json({ error: "Mobile number already registered" });
    }

    // Unique email check
    if (email) {
      const emailCheck = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
      if (emailCheck.rows[0]) {
        return void res.status(409).json({ error: "Email address already registered" });
      }
    }

    if (password.length < 6) {
      return void res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const passwordHash = await hashPassword(password);

    // Determine user_role and admin_role
    let userRole: string;
    let finalAdminRole = "read_only";

    if (portal_role === "super_admin" || portal_role === "admin") {
      userRole = "admin";
      finalAdminRole = portal_role === "super_admin" ? "super_admin" : (admin_role || "admin");
    } else if (portal_role === "branch_manager") {
      userRole = "branch_manager";
      finalAdminRole = "read_only";
    } else if (portal_role === "agent") {
      userRole = "agent";
      finalAdminRole = "read_only";
    } else if (portal_role === "staff") {
      userRole = "staff";
      finalAdminRole = "read_only";
    } else {
      return void res.status(400).json({ error: `Unknown role: ${portal_role}` });
    }

    try {
      // Create user record
      const userId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO users (id, mobile, name, email, role, admin_role, password_hash, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [userId, cleanMobile, name || null, email || null, userRole, finalAdminRole, passwordHash]
      );

      // Role-specific entity creation
      if (portal_role === "branch_manager" && branch_id) {
        await pool.query(
          `UPDATE branches SET manager_mobile=$1, manager_name=$2, manager_email=$3, updated_at=NOW()
           WHERE id=$4`,
          [cleanMobile, name || null, email || null, branch_id]
        ).catch(() => {});
      }

      if (portal_role === "agent" && branch_id) {
        await pool.query(
          `INSERT INTO agents (name, mobile, email, branch_id, commission_rate, is_active)
           VALUES ($1,$2,$3,$4,$5,true)`,
          [name || cleanMobile, cleanMobile, email || null, branch_id, commission_rate || 0]
        ).catch(() => {});
      }

      if (portal_role === "staff") {
        const staffId = `STAFF-${Date.now()}`;
        await pool.query(
          `INSERT INTO staff (id, full_name, mobile_india, status, company_id)
           VALUES ($1,$2,$3,'active','alburhan')`,
          [staffId, name || cleanMobile, cleanMobile]
        ).catch(() => {});
      }

      await auditLog({
        req,
        action: "created",
        entityTable: "users",
        entityId: userId,
        newValue: { name, mobile: cleanMobile, role: userRole, admin_role: finalAdminRole },
      }).catch(() => {});

      // Send credentials notification
      if (doSend !== false) {
        sendCredentials(cleanMobile, name, password, email).catch(() => {});
      }

      res.json({ success: true, id: userId, role: userRole, admin_role: finalAdminRole });
    } catch (err: any) {
      console.error("[admin-users] POST /create:", err.message);
      res.status(500).json({ error: err.message || "Failed to create user" });
    }
  }
);

// ── PUT /:id/edit — edit user details ────────────────────────────────────────
router.put(
  "/:id/edit",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    if (!isSuperAdmin(req)) {
      return void res.status(403).json({ error: "Only Super Admins can edit users" });
    }
    const { name, email, admin_role } = req.body;
    try {
      const user = await pool.query(`SELECT id, mobile, role, admin_role FROM users WHERE id=$1`, [req.params.id]);
      if (!user.rows[0]) return void res.status(404).json({ error: "User not found" });

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (name !== undefined) { fields.push(`name=$${idx++}`); vals.push(name); }
      if (email !== undefined) {
        if (email) {
          const emailCheck = await pool.query(`SELECT id FROM users WHERE email=$1 AND id!=$2`, [email, req.params.id]);
          if (emailCheck.rows[0]) return void res.status(409).json({ error: "Email already used by another user" });
        }
        fields.push(`email=$${idx++}`); vals.push(email || null);
      }
      if (admin_role !== undefined && user.rows[0].role === "admin") {
        if (!isValidAdminRole(admin_role)) return void res.status(400).json({ error: "Invalid admin role" });
        fields.push(`admin_role=$${idx++}`); vals.push(admin_role);
      }

      if (fields.length === 0) return void res.status(400).json({ error: "Nothing to update" });
      fields.push(`updated_at=NOW()`);
      vals.push(req.params.id);

      await pool.query(`UPDATE users SET ${fields.join(",")} WHERE id=$${idx}`, vals);

      await auditLog({ req, action: "updated", entityTable: "users", entityId: req.params.id, newValue: req.body }).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      console.error("[admin-users] PUT /:id/edit:", err.message);
      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

// ── POST /:id/reset-password ─────────────────────────────────────────────────
router.post(
  "/:id/reset-password",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    if (!isSuperAdmin(req)) {
      return void res.status(403).json({ error: "Only Super Admins can reset passwords" });
    }
    const { password, send_credentials: doSend } = req.body;
    if (!password || password.length < 6) {
      return void res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    try {
      const user = await pool.query(`SELECT id, mobile, name, email FROM users WHERE id=$1`, [req.params.id]);
      if (!user.rows[0]) return void res.status(404).json({ error: "User not found" });
      const { mobile, name, email } = user.rows[0];

      const hash = await hashPassword(password);
      await pool.query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hash, req.params.id]);

      if (doSend !== false) {
        const msg = `Al Burhan Tours: Your password has been reset.\nMobile: ${mobile}\nNew Password: ${password}\nLogin: https://alburhantravels.com/login`;
        sendWhatsApp(mobile, msg).catch(() => {});
        if (email) {
          sendGenericEmail({
            to: email,
            subject: "Password Reset — Al Burhan Tours",
            html: `<p>Dear ${name || "User"},</p><p>Your password has been reset.<br><strong>New Password:</strong> <code>${password}</code></p><p>Login at <a href="https://alburhantravels.com/login">alburhantravels.com/login</a></p>`,
          }).catch(() => {});
        }
      }

      await auditLog({ req, action: "updated", entityTable: "users", entityId: req.params.id, newValue: { action: "password_reset" } }).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      console.error("[admin-users] POST /:id/reset-password:", err.message);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

// ── PUT /:id/toggle-status ───────────────────────────────────────────────────
router.put(
  "/:id/toggle-status",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    if (!isSuperAdmin(req)) {
      return void res.status(403).json({ error: "Only Super Admins can change user status" });
    }
    try {
      const user = await pool.query(`SELECT id, is_active FROM users WHERE id=$1`, [req.params.id]);
      if (!user.rows[0]) return void res.status(404).json({ error: "User not found" });
      if (req.params.id === req.user?.id) return void res.status(400).json({ error: "Cannot deactivate your own account" });

      const newActive = !user.rows[0].is_active;
      await pool.query(`UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2`, [newActive, req.params.id]);
      await auditLog({ req, action: "updated", entityTable: "users", entityId: req.params.id, newValue: { is_active: newActive } }).catch(() => {});
      res.json({ success: true, is_active: newActive });
    } catch (err: any) {
      console.error("[admin-users] PUT /:id/toggle-status:", err.message);
      res.status(500).json({ error: "Failed to toggle status" });
    }
  }
);

// ── DELETE /:id — delete user ────────────────────────────────────────────────
router.delete(
  "/:id",
  requireAdmin as any,
  async (req: AuthenticatedRequest, res) => {
    if (!isSuperAdmin(req)) {
      return void res.status(403).json({ error: "Only Super Admins can delete users" });
    }
    if (req.params.id === req.user?.id) {
      return void res.status(400).json({ error: "Cannot delete your own account" });
    }
    try {
      const user = await pool.query(`SELECT id, mobile, name, role FROM users WHERE id=$1`, [req.params.id]);
      if (!user.rows[0]) return void res.status(404).json({ error: "User not found" });
      const { mobile, role } = user.rows[0];

      await pool.query(`DELETE FROM users WHERE id=$1`, [req.params.id]);

      // Clean up entity records
      if (role === "branch_manager") {
        await pool.query(`UPDATE branches SET manager_mobile=NULL WHERE manager_mobile=$1`, [mobile]).catch(() => {});
      }
      if (role === "agent") {
        await pool.query(`DELETE FROM agents WHERE mobile=$1`, [mobile]).catch(() => {});
      }
      if (role === "staff") {
        await pool.query(`UPDATE staff SET status='inactive' WHERE mobile_india=$1`, [mobile]).catch(() => {});
      }

      await auditLog({ req, action: "deleted", entityTable: "users", entityId: req.params.id, oldValue: user.rows[0] }).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      console.error("[admin-users] DELETE /:id:", err.message);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

// ── PUT /:id/role (existing) ─────────────────────────────────────────────────
router.put(
  "/:id/role",
  requirePermission("users", "edit") as any,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { admin_role } = req.body;
      if (!admin_role || !isValidAdminRole(admin_role)) {
        return void res.status(400).json({ error: `Invalid admin role. Valid: ${ADMIN_ROLES.join(", ")}` });
      }
      const existing = await pool.query(
        `SELECT id, mobile, name, admin_role FROM users WHERE id=$1 AND role='admin'`,
        [req.params.id]
      );
      if (!existing.rows[0]) return void res.status(404).json({ error: "Admin user not found" });
      if (req.params.id === req.user?.id && admin_role !== "super_admin") {
        return void res.status(400).json({ error: "Cannot demote your own super_admin role" });
      }
      await pool.query(`UPDATE users SET admin_role=$1, updated_at=NOW() WHERE id=$2`, [admin_role, req.params.id]);
      await auditLog({ req, action: "updated", entityTable: "users", entityId: req.params.id, oldValue: { admin_role: existing.rows[0].admin_role }, newValue: { admin_role } }).catch(() => {});
      res.json({ success: true, id: req.params.id, admin_role, label: ROLE_LABELS[admin_role] });
    } catch (err) {
      console.error("[admin-users] PUT /:id/role:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// ── PUT /:id/assigned-groups (existing) ──────────────────────────────────────
router.put(
  "/:id/assigned-groups",
  requirePermission("users", "edit") as any,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { assigned_group_ids } = req.body;
      if (!Array.isArray(assigned_group_ids)) {
        return void res.status(400).json({ error: "assigned_group_ids must be an array" });
      }
      const existing = await pool.query(`SELECT id FROM users WHERE id=$1 AND role='admin'`, [req.params.id]);
      if (!existing.rows[0]) return void res.status(404).json({ error: "Admin user not found" });
      await pool.query(`UPDATE users SET assigned_group_ids=$1, updated_at=NOW() WHERE id=$2`, [assigned_group_ids, req.params.id]);
      res.json({ success: true, id: req.params.id, assigned_group_ids });
    } catch (err) {
      console.error("[admin-users] PUT /:id/assigned-groups:", err);
      res.status(500).json({ error: "Failed to update assigned groups" });
    }
  }
);

export default router;
