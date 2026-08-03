// @ts-nocheck
/**
 * Tenant-scoped DB helpers — SaaS Phase 3
 *
 * Thin wrappers around pool.query() that automatically inject
 * `tenant_id` predicates so route handlers don't manage isolation ad-hoc.
 *
 * Design constraints:
 *  • Never modify the existing `pool` or Drizzle `db` setup.
 *  • All helpers are thin wrappers — no ORM, no magic schema introspection.
 *  • $tenantId is always appended as the LAST positional parameter.
 *  • assertTenantOwnership() throws TenantMismatchError — callers decide HTTP status.
 *
 * Naming convention:
 *  tenantQuery()           — query WITH an existing WHERE clause (appends AND tenant_id = $N)
 *  tenantQueryNoWhere()    — query with NO WHERE clause yet     (appends WHERE tenant_id = $N)
 *  tenantCount()           — convenience COUNT with tenant filter
 *  tenantInsert()          — INSERT that injects tenant_id column
 *  assertTenantOwnership() — throws TenantMismatchError on violation
 *  isTenantOwner()         — non-throwing ownership check
 *  safeId()                — fallback to DEFAULT_TENANT_ID when tenantId is falsy
 */

import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

export { DEFAULT_TENANT_ID };

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class TenantMismatchError extends Error {
  readonly code = "TENANT_MISMATCH" as const;
  constructor(table: string, id: string, requestedTenantId: string) {
    super(
      `Record '${id}' in '${table}' does not belong to tenant '${requestedTenantId}'`
    );
    this.name = "TenantMismatchError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tenantQuery
 * Appends `AND tenant_id = $N` to the query text.
 * The query MUST already have a WHERE clause.
 *
 * @example
 *   const { rows } = await tenantQuery(tenantId,
 *     `SELECT * FROM bookings WHERE id = $1`, [bookingId]);
 */
export async function tenantQuery(
  tenantId: string,
  text: string,
  values: any[] = []
): Promise<{ rows: any[] }> {
  const n = values.length + 1;
  const sql = `${text.trimEnd()} AND tenant_id = $${n}`;
  return pool.query(sql, [...values, tenantId]);
}

/**
 * tenantQueryNoWhere
 * Appends `WHERE tenant_id = $N` to the query text (no WHERE clause yet).
 *
 * @example
 *   const { rows } = await tenantQueryNoWhere(tenantId,
 *     `SELECT * FROM packages ORDER BY created_at`, []);
 */
export async function tenantQueryNoWhere(
  tenantId: string,
  text: string,
  values: any[] = []
): Promise<{ rows: any[] }> {
  const n = values.length + 1;
  const sql = `${text.trimEnd()} WHERE tenant_id = $${n}`;
  return pool.query(sql, [...values, tenantId]);
}

/**
 * tenantCount
 * Returns integer count from `SELECT COUNT(*) … WHERE … AND tenant_id = $N`.
 */
export async function tenantCount(
  tenantId: string,
  text: string,
  values: any[] = []
): Promise<number> {
  const { rows } = await tenantQuery(tenantId, text, values);
  return parseInt(rows[0]?.count ?? "0", 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Insert helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tenantInsert
 * Rewrites a named-column INSERT to inject `tenant_id` as the last column.
 * The INSERT must NOT already list `tenant_id` in its column list.
 *
 * @example
 *   await tenantInsert(tenantId,
 *     `INSERT INTO leads (id, name, mobile) VALUES ($1, $2, $3)`,
 *     [id, name, mobile]);
 *   // becomes:
 *   // INSERT INTO leads (id, name, mobile, tenant_id) VALUES ($1, $2, $3, $4)
 */
export async function tenantInsert(
  tenantId: string,
  text: string,
  values: any[] = []
): Promise<{ rows: any[]; rowCount: number }> {
  const n = values.length + 1;
  // Inject tenant_id into column list and VALUES list
  let sql = text;
  if (/RETURNING/i.test(text)) {
    sql = text.replace(/\)\s*RETURNING/i, `, tenant_id) VALUES placeholder RETURNING`);
    // This approach is fragile for complex SQLs; prefer explicit tenant_id in raw INSERTs.
    // Fall back to simple append approach:
    sql = text
      .replace(/\)\s*RETURNING/i, `, $${n}) RETURNING`)
      .replace(/VALUES\s*\(/i, (m) => {
        // Already handled above but clean up the column injection
        return m;
      });
  } else {
    sql = text.replace(/\)\s*$/, `, $${n})`);
  }
  // Inject column name
  sql = sql.replace(/\)\s*VALUES/i, `, tenant_id) VALUES`);
  return pool.query(sql, [...values, tenantId]) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ownership assertion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * assertTenantOwnership
 * Verifies a record belongs to `tenantId`. Throws TenantMismatchError if:
 *   • the record does not exist, OR
 *   • record.tenant_id ≠ tenantId (and record.tenant_id is non-null)
 */
export async function assertTenantOwnership(
  table: string,
  id: string,
  tenantId: string,
  idColumn = "id"
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT tenant_id FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`,
    [id]
  );
  if (!rows[0]) {
    throw new TenantMismatchError(table, id, tenantId);
  }
  if (rows[0].tenant_id && rows[0].tenant_id !== tenantId) {
    throw new TenantMismatchError(table, id, tenantId);
  }
}

/**
 * isTenantOwner — non-throwing version of assertTenantOwnership.
 */
export async function isTenantOwner(
  table: string,
  id: string,
  tenantId: string,
  idColumn = "id"
): Promise<boolean> {
  try {
    await assertTenantOwnership(table, id, tenantId, idColumn);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * safeId — returns DEFAULT_TENANT_ID when tenantId is falsy.
 * Use from internal jobs / crons that have no request object.
 */
export function safeId(tenantId?: string | null): string {
  return tenantId || DEFAULT_TENANT_ID;
}
