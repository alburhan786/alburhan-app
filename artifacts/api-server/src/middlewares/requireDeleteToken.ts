import { Request, Response, NextFunction } from "express";
import { validateDeleteToken } from "../routes/delete-auth.js";

export function requireDeleteToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-delete-token"] as string | undefined;
  if (!token) {
    res.status(403).json({ error: "Delete token required. Verify admin password first." });
    return;
  }
  const adminName = validateDeleteToken(token);
  if (!adminName) {
    res.status(403).json({ error: "Invalid or expired delete token. Please re-verify." });
    return;
  }
  (req as any).deleteAuthorizedBy = adminName;
  next();
}
