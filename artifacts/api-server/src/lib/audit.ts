import { pool } from "@workspace/db";
import type { Request } from "express";
import type { AuthenticatedRequest } from "./auth.js";

export async function auditLog({
  req,
  action,
  entityTable,
  entityId,
  oldValue,
  newValue,
}: {
  req: Request | AuthenticatedRequest;
  action: "created" | "updated" | "deleted" | "restored";
  entityTable: string;
  entityId: string;
  oldValue?: object | null;
  newValue?: object | null;
}): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    await pool.query(
      `INSERT INTO audit_logs
         (id, actor_id, actor_name, action, entity_table, entity_id, old_value, new_value, ip, created_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())`,
      [
        user?.id ?? "system",
        user?.name ?? user?.mobile ?? "unknown",
        action,
        entityTable,
        entityId,
        oldValue != null ? JSON.stringify(oldValue) : null,
        newValue != null ? JSON.stringify(newValue) : null,
        ip,
      ]
    );
  } catch (err) {
    console.error("[auditLog] Failed to write audit entry:", err);
  }
}
