// @ts-nocheck
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

// ── Ensure error_request_logs table exists ─────────────────────────────────

export async function ensureErrorLogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_request_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        method      TEXT,
        path        TEXT,
        status_code INTEGER,
        duration_ms INTEGER,
        user_id     TEXT,
        user_role   TEXT,
        ip          TEXT,
        error_msg   TEXT,
        stack_trace TEXT,
        request_body JSONB,
        response_body TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS erl_created_idx ON error_request_logs(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS erl_status_idx  ON error_request_logs(status_code)`);
  } catch (e: any) {
    console.warn("[ErrorLog] Table init:", e.message);
  }
}

// ── Express middleware: log 4xx/5xx requests ───────────────────────────────

export function errorLogMiddleware(req: any, res: any, next: any) {
  const t0 = Date.now();
  const originalSend = res.send.bind(res);
  let capturedBody = "";
  res.send = function(body: any) {
    capturedBody = typeof body === "string" ? body.slice(0, 500) : "";
    return originalSend(body);
  };
  res.on("finish", () => {
    const sc = res.statusCode;
    if (sc >= 400 && sc !== 401 && sc !== 403) {
      const ms = Date.now() - t0;
      pool.query(
        `INSERT INTO error_request_logs
           (method, path, status_code, duration_ms, user_id, user_role, ip, response_body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          req.method, req.path, sc, ms,
          (req as any).user?.id || null,
          (req as any).user?.role || null,
          req.ip || req.headers["x-forwarded-for"] || null,
          capturedBody.slice(0, 500),
        ]
      ).catch(() => {});
    }
  });
  next();
}

// ── GET / — List error logs ────────────────────────────────────────────────

router.get("/", requireAdmin as any, async (req: any, res: any) => {
  const limit  = Math.min(Number(req.query.limit  || 50), 200);
  const offset = Number(req.query.offset || 0);
  const status = req.query.status ? Number(req.query.status) : null;
  const path   = req.query.path as string | undefined;
  const since  = req.query.since as string | undefined;

  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    let pi = 1;
    if (status)          { where.push(`status_code = $${pi++}`); params.push(status); }
    if (path)            { where.push(`path ILIKE $${pi++}`); params.push(`%${path}%`); }
    if (since)           { where.push(`created_at >= $${pi++}`); params.push(since); }

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT id, method, path, status_code, duration_ms, user_id, user_role, ip,
                error_msg, stack_trace, response_body, created_at
         FROM error_request_logs
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${pi++} OFFSET $${pi++}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM error_request_logs WHERE ${where.join(" AND ")}`,
        params
      ),
    ]);

    res.json({
      logs: rows.rows,
      total: total.rows[0]?.cnt || 0,
      limit, offset,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /summary — Error stats ─────────────────────────────────────────────

router.get("/summary", requireAdmin as any, async (_req: any, res: any) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int                                               AS total,
        COUNT(*) FILTER (WHERE status_code >= 500)::int            AS server_errors,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS client_errors,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int  AS last_hour,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        MAX(created_at)                                             AS last_error_at
      FROM error_request_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const byEndpoint = await pool.query(`
      SELECT path, COUNT(*)::int AS cnt, MAX(status_code) AS max_status
      FROM error_request_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY path ORDER BY cnt DESC LIMIT 10
    `);
    res.json({ summary: r.rows[0], topEndpoints: byEndpoint.rows });
  } catch (e: any) {
    res.json({ summary: { total: 0, server_errors: 0, client_errors: 0, last_hour: 0, last_24h: 0 }, topEndpoints: [] });
  }
});

// ── DELETE / — Clear old logs ──────────────────────────────────────────────

router.delete("/", requireAdmin as any, async (req: any, res: any) => {
  const days = Number(req.query.older_than_days || 7);
  try {
    const r = await pool.query(
      `DELETE FROM error_request_logs WHERE created_at < NOW() - ($1 || ' days')::interval RETURNING id`,
      [days]
    );
    res.json({ deleted: r.rows.length, message: `Cleared error logs older than ${days} days` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
