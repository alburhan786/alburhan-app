import { pool } from "./db.js";
import { v4 as uuidv4 } from "uuid";
import type { Request } from "express";

export interface AuditEntry {
  userId?: string;
  username?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  severity?: "info" | "warning" | "critical";
  req?: Request;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const ip = entry.req
      ? (entry.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
        entry.req.socket.remoteAddress ||
        "unknown"
      : "system";
    const ua = entry.req?.headers["user-agent"] || null;

    await pool.query(
      `INSERT INTO pdf_audit_logs
        (id, user_id, username, action, resource_type, resource_id, resource_name, details, ip_address, user_agent, severity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuidv4(),
        entry.userId || null,
        entry.username || null,
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.resourceName || null,
        JSON.stringify(entry.details || {}),
        ip,
        ua,
        entry.severity || "info",
      ]
    );
  } catch (err) {
    console.error("[PDF-Audit] Failed to write audit log:", err);
  }
}

export function getAuditUser(req: Request): { userId?: string; username?: string } {
  const s = req.session as any;
  return { userId: s?.pdfUserId, username: s?.pdfUsername };
}
