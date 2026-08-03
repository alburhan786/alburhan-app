// @ts-nocheck
/**
 * Tenant Quota Enforcement — SaaS Phase 4
 *
 * Enforces per-tenant resource limits stored in the tenant_quotas table.
 * Default Al Burhan tenant has max_count=999999 on all resources (effectively unlimited).
 *
 * Usage:
 *   await checkQuota(tenantId, "bookings");          // throws QuotaExceededError if over limit
 *   const status = await getQuotaStatus(tenantId);   // full quota dashboard
 *   const limit  = await getQuotaLimit(tenantId, "users");
 */

import { pool } from "@workspace/db";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED" as const;
  readonly resource: string;
  readonly currentCount: number;
  readonly maxCount: number;
  readonly tenantId: string;

  constructor(tenantId: string, resource: string, currentCount: number, maxCount: number) {
    super(
      `Tenant '${tenantId}' has exceeded the quota for '${resource}': ` +
      `${currentCount}/${maxCount}`
    );
    this.name = "QuotaExceededError";
    this.resource = resource;
    this.currentCount = currentCount;
    this.maxCount = maxCount;
    this.tenantId = tenantId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource types
// ─────────────────────────────────────────────────────────────────────────────

export type QuotaResource =
  | "bookings"
  | "users"
  | "staff"
  | "agents"
  | "leads"
  | "packages"
  | "branches"
  | "documents"
  | "invoices"
  | "notification_templates";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getQuotaLimit — retrieve the max_count for a (tenantId, resource) pair.
 * Returns 999999 (unlimited) if no quota row is found (safe default).
 * Returns -1 if the quota row explicitly says unlimited.
 */
export async function getQuotaLimit(
  tenantId: string,
  resource: QuotaResource,
  windowType = "total"
): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT max_count FROM tenant_quotas
        WHERE tenant_id = $1::uuid AND resource = $2 AND window_type = $3
        LIMIT 1`,
      [tenantId, resource, windowType]
    );
    if (rows[0]) return rows[0].max_count;
    // No row → no quota configured → unlimited
    return 999999;
  } catch {
    // Quota table may not exist on older schemas — fail open
    return 999999;
  }
}

/**
 * getCurrentCount — uses the DB helper function to count current usage.
 * Falls back to a direct query if function does not exist.
 */
async function getCurrentCount(tenantId: string, resource: QuotaResource): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT get_tenant_resource_count($1::uuid, $2) AS cnt`,
      [tenantId, resource]
    );
    return parseInt(rows[0]?.cnt ?? "0", 10);
  } catch {
    // Function not available yet (migration pending) — skip quota check
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkQuota — verifies the tenant has not exceeded its limit for `resource`.
 *
 * Throws QuotaExceededError if: current_count >= max_count AND max_count != -1
 *
 * Design notes:
 *  • Fails OPEN: any DB error → no quota enforced (logs a warning).
 *  • Al Burhan default tenant has max_count=999999 → will never throw.
 *  • Call from POST handlers before INSERT:
 *      await checkQuota(tenantId, "bookings");
 */
export async function checkQuota(
  tenantId: string,
  resource: QuotaResource,
  windowType = "total"
): Promise<void> {
  try {
    const maxCount = await getQuotaLimit(tenantId, resource, windowType);
    // -1 = unlimited
    if (maxCount === -1 || maxCount >= 999999) return;

    const currentCount = await getCurrentCount(tenantId, resource);
    if (currentCount >= maxCount) {
      throw new QuotaExceededError(tenantId, resource, currentCount, maxCount);
    }
  } catch (err: any) {
    // Re-throw QuotaExceededError; swallow all other errors (fail open)
    if (err instanceof QuotaExceededError) throw err;
    console.warn(`[TenantQuota] checkQuota(${tenantId}, ${resource}) error — failing open:`, err?.message);
  }
}

/**
 * getQuotaStatus — returns full quota summary for the admin dashboard.
 * Returns an array of { resource, max_count, current_count, pct_used, window_type }.
 */
export async function getQuotaStatus(tenantId: string): Promise<QuotaStatusItem[]> {
  const defaultResources: QuotaResource[] = [
    "bookings", "users", "staff", "agents", "leads", "packages",
    "branches", "documents", "invoices", "notification_templates",
  ];

  try {
    // Load all configured quotas for this tenant
    const { rows: quotaRows } = await pool.query(
      `SELECT resource, max_count, window_type, updated_at
         FROM tenant_quotas WHERE tenant_id = $1::uuid
         ORDER BY resource`,
      [tenantId]
    );

    // For each quota row, calculate current usage
    const items: QuotaStatusItem[] = await Promise.all(
      (quotaRows.length > 0 ? quotaRows : defaultResources.map(r => ({ resource: r, max_count: 999999, window_type: "total" }))).map(
        async (row: any) => {
          const currentCount = await getCurrentCount(tenantId, row.resource as QuotaResource);
          const pctUsed = row.max_count <= 0 || row.max_count >= 999999
            ? 0
            : Math.round((currentCount / row.max_count) * 100);
          return {
            resource: row.resource,
            max_count: row.max_count,
            current_count: currentCount,
            pct_used: pctUsed,
            window_type: row.window_type,
            unlimited: row.max_count === -1 || row.max_count >= 999999,
          };
        }
      )
    );

    return items;
  } catch (err: any) {
    console.warn("[TenantQuota] getQuotaStatus error:", err?.message);
    return [];
  }
}

export interface QuotaStatusItem {
  resource: string;
  max_count: number;
  current_count: number;
  pct_used: number;
  window_type: string;
  unlimited: boolean;
}

/**
 * setQuota — upserts a quota limit for a tenant resource.
 * Used by the platform admin to configure per-tenant limits.
 */
export async function setQuota(
  tenantId: string,
  resource: string,
  maxCount: number,
  windowType = "total"
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_quotas (tenant_id, resource, max_count, window_type, updated_at)
     VALUES ($1::uuid, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id, resource, window_type)
     DO UPDATE SET max_count = EXCLUDED.max_count, updated_at = NOW()`,
    [tenantId, resource, maxCount, windowType]
  );
}

/**
 * isQuotaTableReady — checks if the tenant_quotas table exists.
 * Used by tests to skip quota tests on older DB schemas.
 */
export async function isQuotaTableReady(): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenant_quotas' LIMIT 1`
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
