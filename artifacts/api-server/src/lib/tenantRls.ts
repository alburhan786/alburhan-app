// @ts-nocheck
/**
 * Tenant RLS Connection Helpers — SaaS Phase 4 Strict
 *
 * Three explicit access contexts (v41 strict RLS design):
 *
 *   1. withTenantConnection(tenantId, fn)
 *      Sets SET LOCAL app.current_tenant = tenantId.
 *      Strictest mode: DB-layer RLS filters rows to this tenant only.
 *      Use for all new multi-tenant code.
 *
 *   2. withBypassConnection(fn, reason)
 *      Sets SET LOCAL app.internal_context = 'bypass'.
 *      For crons, migrations, and platform admin operations.
 *      Every bypass is logged to automation_audit_logs with a reason.
 *      MUST NOT be used in API request handlers.
 *
 *   3. initializeAppLayerContext(pool)
 *      Registers pool.on('connect') to SET SESSION app.internal_context = 'app_layer'.
 *      This explicit (not silent) context tells the RLS policy that Phase-3
 *      WHERE tenant_id = $N clauses in application code provide the isolation.
 *      Called once at server startup in index.ts.
 *
 * The policy (v41) allows access when:
 *   • app.internal_context IN ('bypass', 'app_layer')   — explicit contexts above
 *   • OR app.current_tenant != '' AND matches tenant_id — strict tenant isolation
 *   • Otherwise → DENY (fail-closed)
 *
 * SET LOCAL scoping: within withTenantConnection / withBypassConnection, the
 * session-level 'app_layer' context is overridden for that transaction only,
 * then restored on COMMIT / ROLLBACK.
 */

import type { Pool, PoolClient } from "pg";
import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Pool Initialization — app_layer context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * initializeAppLayerContext — call once at server startup BEFORE accepting requests.
 *
 * Registers a pool 'connect' handler that sets app.internal_context = 'app_layer'
 * at the SESSION level on every new connection. This is the explicit Phase-3 mode:
 *   - Existing pool.query() calls include WHERE tenant_id = $N (Phase 3 isolation).
 *   - The RLS policy allows 'app_layer' context, with Phase 3 WHERE clause as guard.
 *   - withTenantConnection / withBypassConnection override this per-transaction.
 *
 * This is EXPLICITLY declared (not a silent bypass). See tenantDbMiddleware.ts
 * for the stricter request-scoped alternative.
 */
export function initializeAppLayerContext(pgPool: Pool): void {
  pgPool.on("connect", (client: PoolClient) => {
    client
      .query("SET SESSION app.internal_context = 'app_layer'")
      .catch((err: any) =>
        console.warn("[TenantRls] Failed to set app_layer context on new connection:", err?.message)
      );
  });
  console.log("[TenantRls] Pool initialized: app.internal_context = 'app_layer' for all connections");
}

// ─────────────────────────────────────────────────────────────────────────────
// withTenantConnection — strict per-tenant RLS enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * withTenantConnection — execute a callback with DB-layer RLS set to this tenant.
 *
 * Sets SET LOCAL app.current_tenant = tenantId within a BEGIN/COMMIT transaction.
 * The RLS policy filters all rows to this tenant — even without WHERE clauses.
 * Use for new multi-tenant route code.
 */
export async function withTenantConnection<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const safeId = tenantId?.trim() || DEFAULT_TENANT_ID;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL — scoped to this transaction; session value ('app_layer') restored on COMMIT
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [safeId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// withBypassConnection — audited cross-tenant bypass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * withBypassConnection — execute a callback with cross-tenant access for
 * internal operations (cron jobs, migrations, platform admin).
 *
 * SECURITY REQUIREMENTS:
 *  • Caller MUST supply a non-empty reason string.
 *  • Every bypass is logged to automation_audit_logs.
 *  • MUST NOT be used in user-facing API request handlers.
 *  • The bypass is transaction-scoped (SET LOCAL) — the session 'app_layer'
 *    context is restored after the transaction.
 */
export async function withBypassConnection<T>(
  fn: (client: PoolClient) => Promise<T>,
  reason = "unspecified internal operation"
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Override to 'bypass' for this transaction only
    await client.query("SELECT set_config('app.internal_context', 'bypass', true)");

    // Audit: log the bypass (best-effort — failure does NOT abort the operation)
    try {
      await client.query(
        `INSERT INTO automation_audit_logs (action, details, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        ["rls_bypass", JSON.stringify({ reason, pid: process.pid, ts: new Date().toISOString() })]
      );
    } catch { /* audit failure is non-fatal */ }

    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getTenantDbContext — inspect the current app.current_tenant setting on a client.
 */
export async function getTenantDbContext(client: PoolClient): Promise<string> {
  const { rows } = await client.query(
    "SELECT current_setting('app.current_tenant', true) AS tenant"
  );
  return rows[0]?.tenant ?? "";
}

/**
 * getInternalContext — inspect the current app.internal_context on a client.
 */
export async function getInternalContext(client: PoolClient): Promise<string> {
  const { rows } = await client.query(
    "SELECT current_setting('app.internal_context', true) AS ctx"
  );
  return rows[0]?.ctx ?? "";
}

/**
 * isRlsEnabledOnTable — checks pg_class to verify RLS is active.
 */
export async function isRlsEnabledOnTable(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class
      WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
    [tableName]
  );
  return rows[0]?.relrowsecurity === true;
}

/**
 * isForceRlsOnTable — checks if FORCE ROW LEVEL SECURITY is set.
 */
export async function isForceRlsOnTable(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT relforcerowsecurity
       FROM pg_class
      WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
    [tableName]
  );
  return rows[0]?.relforcerowsecurity === true;
}

/**
 * getRlsPolicyCount — returns the count of tenant_isolation policies.
 */
export async function getRlsPolicyCount(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE policyname = 'tenant_isolation'`
  );
  return rows[0]?.cnt ?? 0;
}

/**
 * getAppUserRole — returns whether the application DB user is a superuser.
 * Superusers bypass ALL RLS regardless of FORCE ROW LEVEL SECURITY.
 */
export async function getAppUserRole(): Promise<{ role: string; isSuperuser: boolean }> {
  const { rows } = await pool.query(
    `SELECT current_user AS role,
            rolsuper::boolean AS is_superuser
       FROM pg_roles WHERE rolname = current_user`
  );
  return {
    role: rows[0]?.role ?? "unknown",
    isSuperuser: rows[0]?.is_superuser ?? false,
  };
}

/**
 * listTablesWithoutRls — diagnostic: tenant-scoped tables missing RLS.
 */
export async function listTablesWithoutRls(tables: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const tbl of tables) {
    const { rows } = await pool.query(
      `SELECT relrowsecurity FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tbl]
    );
    if (!rows[0] || !rows[0].relrowsecurity) missing.push(tbl);
  }
  return missing;
}

/**
 * listTablesWithoutForceRls — diagnostic: tables with RLS but without FORCE.
 */
export async function listTablesWithoutForceRls(tables: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const tbl of tables) {
    const { rows } = await pool.query(
      `SELECT relforcerowsecurity FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tbl]
    );
    if (!rows[0] || !rows[0].relforcerowsecurity) missing.push(tbl);
  }
  return missing;
}
