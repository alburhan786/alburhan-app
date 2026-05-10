import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

const validTokens = new Map<string, { expiry: number; adminName: string }>();
const lockouts = new Map<string, { count: number; lockUntil: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [t, d] of validTokens) if (d.expiry < now) validTokens.delete(t);
  for (const [ip, d] of lockouts) if (d.lockUntil < now) lockouts.delete(ip);
}, 60_000);

export function validateDeleteToken(token: string): string | null {
  const data = validTokens.get(token);
  if (!data) return null;
  if (data.expiry < Date.now()) { validTokens.delete(token); return null; }
  validTokens.delete(token);
  return data.adminName;
}

router.post("/verify", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const rawIp = req.ip || (req.socket as any)?.remoteAddress || "unknown";
  const ip = rawIp.replace(/^::ffff:/, "");
  const { password, itemType, itemId } = req.body as Record<string, string | undefined>;

  const lock = lockouts.get(ip);
  if (lock && lock.count >= 3 && lock.lockUntil > Date.now()) {
    const secs = Math.ceil((lock.lockUntil - Date.now()) / 1000);
    res.status(429).json({ error: `Too many failed attempts. Try again in ${secs}s.`, locked: true, secs });
    return;
  }

  const correctPwd = process.env.DELETE_ADMIN_PASSWORD;
  if (!correctPwd || password !== correctPwd) {
    const prev = lockouts.get(ip) || { count: 0, lockUntil: 0 };
    const count = prev.count + 1;
    const lockUntil = count >= 3 ? Date.now() + 30_000 : prev.lockUntil;
    lockouts.set(ip, { count, lockUntil });
    try {
      await db.execute(sql`
        INSERT INTO delete_audit_log (action, item_type, item_id, deleted_by, ip_address, success)
        VALUES ('VERIFY_FAILED', ${itemType ?? "unknown"}, ${itemId ?? "unknown"},
                ${req.user?.mobile ?? "unknown"}, ${ip}, false)
      `);
    } catch { /* table may not be ready yet */ }
    if (count >= 3) {
      res.status(429).json({ error: "Too many failed attempts. Locked for 30 seconds.", locked: true, secs: 30 });
    } else {
      res.status(401).json({ error: "Invalid admin password.", attemptsLeft: 3 - count });
    }
    return;
  }

  lockouts.delete(ip);
  const token = randomUUID();
  const adminName = req.user?.name || req.user?.mobile || "admin";
  validTokens.set(token, { expiry: Date.now() + 60_000, adminName });

  try {
    await db.execute(sql`
      INSERT INTO delete_audit_log (action, item_type, item_id, deleted_by, ip_address, success)
      VALUES ('VERIFY_OK', ${itemType ?? "unknown"}, ${itemId ?? "unknown"},
              ${adminName}, ${ip}, true)
    `);
  } catch { /* ignore */ }

  res.json({ token, adminName });
});

export default router;
