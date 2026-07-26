import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";

export async function requirePdfAuth(req: Request, res: Response, next: NextFunction) {
  const s = req.session as any;
  if (!s?.pdfUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  // Check user still active
  try {
    const { rows } = await pool.query(
      `SELECT id, username, role, is_active, session_timeout_minutes FROM pdf_users WHERE id = $1`,
      [s.pdfUserId]
    );
    if (!rows[0] || !rows[0].is_active) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Account inactive" });
    }
    // Session timeout check
    if (s.pdfLoginTime) {
      const timeoutMs = (rows[0].session_timeout_minutes || 240) * 60 * 1000;
      if (Date.now() - s.pdfLoginTime > timeoutMs) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session expired" });
      }
    }
    (req as any).pdfUser = rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: "Auth check failed" });
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).pdfUser;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
