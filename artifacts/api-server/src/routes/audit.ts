import { Router } from "express";
import { pool } from "@workspace/db";
import { requirePermission, requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { auditLog } from "../lib/audit.js";

const router = Router();

router.get(
  "/",
  requirePermission("audit_logs", "view") as any,
  async (req, res) => {
    try {
      const {
        entity_table, action, actor,
        from_date, to_date,
        limit = "200", offset = "0",
      } = req.query as Record<string, string>;

      const params: any[] = [];
      const conditions: string[] = ["created_at > NOW() - INTERVAL '12 months'"];
      let pi = 1;

      if (entity_table) { conditions.push(`entity_table=$${pi++}`); params.push(entity_table); }
      if (action) { conditions.push(`action=$${pi++}`); params.push(action); }
      if (actor) { conditions.push(`actor_name ILIKE $${pi++}`); params.push(`%${actor}%`); }
      if (from_date) { conditions.push(`created_at >= $${pi++}`); params.push(from_date); }
      if (to_date) { conditions.push(`created_at <= $${pi++}`); params.push(to_date + "T23:59:59"); }

      const where = "WHERE " + conditions.join(" AND ");
      const lim = Math.min(parseInt(limit) || 200, 500);
      const off = parseInt(offset) || 0;

      const [rows, countResult] = await Promise.all([
        pool.query(
          `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
          [...params, lim, off]
        ),
        pool.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params),
      ]);

      res.json({
        logs: rows.rows,
        total: parseInt(countResult.rows[0].count),
        limit: lim,
        offset: off,
      });
    } catch (err) {
      console.error("[audit] GET /:", err);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  }
);

router.get(
  "/entities",
  requirePermission("audit_logs", "view") as any,
  async (_req, res) => {
    try {
      const r = await pool.query(
        `SELECT DISTINCT entity_table FROM audit_logs ORDER BY entity_table`
      );
      res.json(r.rows.map((x: any) => x.entity_table));
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  }
);

router.post(
  "/:id/restore",
  requirePermission("audit_logs", "edit") as any,
  async (req: AuthenticatedRequest, res) => {
    try {
      const logResult = await pool.query(`SELECT * FROM audit_logs WHERE id=$1`, [req.params.id]);
      if (!logResult.rows[0]) return void res.status(404).json({ error: "Audit log entry not found" });

      const log = logResult.rows[0];
      if (log.action !== "deleted")
        return void res.status(400).json({ error: "Only deleted records can be restored" });
      if (!log.old_value)
        return void res.status(400).json({ error: "No snapshot available to restore from" });

      const data = typeof log.old_value === "string" ? JSON.parse(log.old_value) : log.old_value;

      if (log.entity_table === "expenses") {
        await pool.query(
          `INSERT INTO expenses
             (id, group_id, category, vendor, description, amount, date,
              paid_by, payment_method, invoice_number, notes, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            data.id, data.group_id ?? null, data.category, data.vendor ?? null,
            data.description, data.amount, data.date,
            data.paid_by ?? null, data.payment_method ?? "cash",
            data.invoice_number ?? null, data.notes ?? null,
            data.status ?? "approved", data.created_at ?? new Date().toISOString(),
          ]
        );
      } else {
        return void res.status(400).json({ error: `Restore not yet supported for '${log.entity_table}'` });
      }

      await auditLog({
        req,
        action: "restored",
        entityTable: log.entity_table,
        entityId: log.entity_id,
        newValue: data,
      });

      res.json({ success: true, entity_table: log.entity_table, entity_id: log.entity_id });
    } catch (err) {
      console.error("[audit] POST /:id/restore:", err);
      res.status(500).json({ error: "Failed to restore record" });
    }
  }
);

export default router;
