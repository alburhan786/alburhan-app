import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { logAudit } from "../audit.js";
import { requirePdfAuth } from "../middleware.js";

const router = Router();

// POST /pdf/api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, role, totp_enabled, totp_secret, is_active FROM pdf_users WHERE username = $1`,
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      await logAudit({ username, action: "login_failed", severity: "warning", details: { reason: "user not found or inactive" } });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logAudit({ userId: user.id, username: user.username, action: "login_failed", severity: "warning", details: { reason: "wrong password" }, req });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.totp_enabled) {
      // Return partial auth — need 2FA code
      const s = req.session as any;
      s.pdfPendingUserId = user.id;
      return res.json({ requiresTwoFactor: true });
    }

    // Full login
    const s = req.session as any;
    s.pdfUserId = user.id;
    s.pdfUsername = user.username;
    s.pdfRole = user.role;
    s.pdfLoginTime = Date.now();

    await pool.query(`UPDATE pdf_users SET last_login = NOW() WHERE id = $1`, [user.id]);
    await logAudit({ userId: user.id, username: user.username, action: "login_success", req });

    return res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, twoFactorEnabled: user.totp_enabled } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

// POST /pdf/api/auth/verify-2fa
router.post("/verify-2fa", async (req, res) => {
  const { code } = req.body;
  const s = req.session as any;
  if (!s?.pdfPendingUserId) return res.status(401).json({ error: "No pending login" });

  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, totp_secret FROM pdf_users WHERE id = $1`,
      [s.pdfPendingUserId]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Session invalid" });

    const valid = authenticator.verify({ token: code, secret: user.totp_secret });
    if (!valid) {
      await logAudit({ userId: user.id, username: user.username, action: "2fa_failed", severity: "warning", req });
      return res.status(401).json({ error: "Invalid 2FA code" });
    }

    delete s.pdfPendingUserId;
    s.pdfUserId = user.id;
    s.pdfUsername = user.username;
    s.pdfRole = user.role;
    s.pdfLoginTime = Date.now();

    await pool.query(`UPDATE pdf_users SET last_login = NOW() WHERE id = $1`, [user.id]);
    await logAudit({ userId: user.id, username: user.username, action: "login_success_2fa", req });

    return res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, twoFactorEnabled: true } });
  } catch (err) {
    return res.status(500).json({ error: "2FA verification failed" });
  }
});

// POST /pdf/api/auth/logout
router.post("/logout", requirePdfAuth, async (req, res) => {
  const s = req.session as any;
  await logAudit({ userId: s.pdfUserId, username: s.pdfUsername, action: "logout", req });
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// GET /pdf/api/auth/me
router.get("/me", requirePdfAuth, async (req, res) => {
  const user = (req as any).pdfUser;
  const { rows } = await pool.query(
    `SELECT id, username, email, role, totp_enabled, last_login, session_timeout_minutes, created_at FROM pdf_users WHERE id = $1`,
    [user.id]
  );
  const u = rows[0];
  res.json({
    id: u.id, username: u.username, email: u.email, role: u.role,
    twoFactorEnabled: u.totp_enabled, lastLogin: u.last_login,
    sessionTimeoutMinutes: u.session_timeout_minutes, createdAt: u.created_at,
  });
});

// POST /pdf/api/auth/2fa/setup — generate secret + QR code
router.post("/2fa/setup", requirePdfAuth, async (req, res) => {
  const user = (req as any).pdfUser;
  const secret = authenticator.generateSecret();
  await pool.query(
    `UPDATE pdf_users SET totp_secret = $1, totp_pending = true WHERE id = $2`,
    [secret, user.id]
  );
  const otpauth = authenticator.keyuri(user.username, "AlBurhan PDF Enterprise", secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  res.json({ secret, qrDataUrl, otpauth });
});

// POST /pdf/api/auth/2fa/confirm — verify code and enable 2FA
router.post("/2fa/confirm", requirePdfAuth, async (req, res) => {
  const { code } = req.body;
  const user = (req as any).pdfUser;
  const { rows } = await pool.query(`SELECT totp_secret FROM pdf_users WHERE id = $1`, [user.id]);
  const secret = rows[0]?.totp_secret;
  if (!secret) return res.status(400).json({ error: "No pending 2FA setup" });

  const valid = authenticator.verify({ token: code, secret });
  if (!valid) return res.status(400).json({ error: "Invalid code" });

  await pool.query(`UPDATE pdf_users SET totp_enabled = true, totp_pending = false WHERE id = $1`, [user.id]);
  await logAudit({ userId: user.id, username: user.username, action: "2fa_enabled", req });
  res.json({ ok: true });
});

// POST /pdf/api/auth/2fa/disable
router.post("/2fa/disable", requirePdfAuth, async (req, res) => {
  const user = (req as any).pdfUser;
  if (user.role !== "admin" && !(req as any).pdfUser?.twoFactorEnabled) {
    return res.status(403).json({ error: "Cannot disable 2FA" });
  }
  await pool.query(
    `UPDATE pdf_users SET totp_enabled = false, totp_secret = NULL, totp_pending = false WHERE id = $1`,
    [user.id]
  );
  await logAudit({ userId: user.id, username: user.username, action: "2fa_disabled", severity: "warning", req });
  res.json({ ok: true });
});

// PUT /pdf/api/auth/change-password
router.put("/change-password", requirePdfAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const user = (req as any).pdfUser;
  const { rows } = await pool.query(`SELECT password_hash FROM pdf_users WHERE id = $1`, [user.id]);
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) return res.status(400).json({ error: "Current password incorrect" });

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query(`UPDATE pdf_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, user.id]).catch(() => {});
  await pool.query(`UPDATE pdf_users SET password_hash = $1 WHERE id = $2`, [hash, user.id]);
  await logAudit({ userId: user.id, username: user.username, action: "password_changed", severity: "warning", req });
  res.json({ ok: true });
});

export default router;
