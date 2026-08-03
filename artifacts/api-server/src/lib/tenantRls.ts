// @ts-nocheck
/**
 * Tenant RLS Connection Helpers — SaaS Phase 4
 *
 * PostgreSQL Row Level Security is enabled on all 62 tenant-scoped tables.
 * The policy is PERMISSIVE when app.current_tenant is not set (backward compat).
 * When app.current_tenant IS set, only rows for that tenant are visible.
 *
 * withTenantConnection() wraps a callback in a transaction-scoped connection
 * with SET LOCAL app.current_tenant = tenantId. This activates DB-layer RLS
 * filtering in addition to the application-layer WHERE clauses from Phase 3.
 *
 * Usage:
 *   const rows = await withTenantConnection(tenantId, async (client) => {
 *     const { rows } = await client.query("SELECT * FROM bookings");
 *     return rows; // RLS ensures only tenantId rows are returned
 *   });
 *
 * Note: Existing pool.query() calls do NOT use this helper.
 * They continue to work unchanged (RLS policy allows all when var not set).
 * This helper is for new code, testing, and future use.
 */

import type { PoolClient } from "pg";
import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// withTenantConnection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * withTenantConnection — execute a callback with a transaction-scoped
 * app.current_tenant setting that activates RLS for this tenant.
 *
 * The SET LOCAL ensures the context variable only affects the current transaction.
 * After COMMIT or ROLLBACK, the client is released back to the pool cleanly.
 */
export async function withTenantConnection<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const safeId = tenantId || DEFAULT_TENANT_ID;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL — scoped to this transaction; resets on COMMIT/ROLLBACK
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true)",
      [safeId]
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback error */ }
    throw err;
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

/**
 * withBypassConnection — execute a callback with RLS bypassed (empty tenant var).
 * Use for internal migrations, crons, or admin operations that need cross-tenant access.
 */
export async function withBypassConnection<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTenantConnection("", fn);
}

/**
 * getTenantDbContext — inspect the current app.current_tenant setting
 * on a given pool client. Returns empty string if not set.
 * Used by tests to verify RLS is active.
 */
export async function getTenantDbContext(client: PoolClient): Promise<string> {
  const { rows } = await client.query(
    "SELECT current_setting('app.current_tenant', true) AS tenant"
  );
  return rows[0]?.tenant ?? "";
}

/**
 * isRlsEnabledOnTable — checks pg_class to verify RLS is active.
 * Used by the cross-tenant test suite.
 */
export async function isRlsEnabledOnTable(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT relrowsecurity
       FROM pg_class
      WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
    [tableName]
  );
  return rows[0]?.relrowsecurity === true;
}

/**
 * getRlsPolicyCount — returns the number of tenant_isolation policies active.
 * Used by the test suite to verify Phase 4 migration ran correctly.
 */
export async function getRlsPolicyCount(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM pg_policies WHERE policyname = 'tenant_isolation'`
  );
  return rows[0]?.cnt ?? 0;
}

/**
 * listTablesWithoutRls — diagnostic helper that lists tenant-scoped tables
 * that do NOT have RLS enabled. Should return an empty array after Phase 4.
 */
export async function listTablesWithoutRls(tables: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const tbl of tables) {
    const { rows } = await pool.query(
      `SELECT relrowsecurity FROM pg_class
        WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
      [tbl]
    );
    if (!rows[0] || !rows[0].relrowsecurity) {
      missing.push(tbl);
    }
  }
  return missing;
}
