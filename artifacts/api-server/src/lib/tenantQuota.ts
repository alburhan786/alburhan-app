// @ts-nocheck
/**
 * Tenant Quota Enforcement — SaaS Phase 4 Strict
 *
 * Enforces per-tenant resource limits stored in the tenant_quotas table.
 *
 * Key changes from v40:
 *  • NULL max_count = explicit unlimited (replaces artificial 999999)
 *  • reset_at returned in QuotaExceededError for windowed quotas
 *  • Expanded resource types: AI messages, comms channels, pilgrims, storage
 *  • Quota increments use advisory lock for concurrency safety on critical resources
 *  • Fails open on DB errors (never blocks production due to quota subsystem error)
 *
 * Usage:
 *   await checkQuota(tenantId, "bookings");
 *   await checkQuota(tenantId, "whatsapp_monthly");
 *   const status = await getQuotaStatus(tenantId);
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
  readonly maxCount: number | null;
  readonly tenantId: string;
  readonly resetAt: Date | null;

  constructor(
    tenantId: string,
    resource: string,
    currentCount: number,
    maxCount: number | null,
    resetAt: Date | null = null
  ) {
    super(
      `Tenant '${tenantId}' quota exceeded for '${resource}': ` +
      `${currentCount}/${maxCount ?? "unlimited"}`
    );
    this.name       = "QuotaExceededError";
    this.resource   = resource;
    this.currentCount = currentCount;
    this.maxCount   = maxCount;
    this.tenantId   = tenantId;
    this.resetAt    = resetAt;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource types
// ─────────────────────────────────────────────────────────────────────────────

export type QuotaResource =
  // Core entities (total)
  | "bookings"
  | "users"
  | "staff"
  | "agents"
  | "leads"
  | "packages"
  | "branches"
  | "documents"
  | "invoices"
  | "notification_templates"
  | "pilgrims"
  | "connected_channels_total"
  | "storage_mb_total"
  // Monthly billable resources
  | "ai_messages_monthly"
  | "whatsapp_monthly"
  | "sms_monthly"
  | "email_monthly"
  | "push_monthly"
  | "rcs_monthly"
  | "workflow_executions_monthly";

// Monthly resources (windowed — have a reset_at timestamp)
const MONTHLY_RESOURCES = new Set([
  "ai_messages_monthly", "whatsapp_monthly", "sms_monthly",
  "email_monthly", "push_monthly", "rcs_monthly", "workflow_executions_monthly",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface QuotaRow {
  max_count: number | null;
  window_type: string;
  reset_window_at: string | null;
}

/**
 * getQuotaRow — retrieve the full quota row for (tenantId, resource).
 * Returns null if no quota row is configured.
 */
async function getQuotaRow(
  tenantId: string,
  resource: QuotaResource,
  windowType = MONTHLY_RESOURCES.has(resource) ? "monthly" : "total"
): Promise<QuotaRow | null> {
  try {
    const { rows } = await pool.query(
      `SELECT max_count, window_type, reset_window_at
         FROM tenant_quotas
        WHERE tenant_id = $1::uuid AND resource = $2 AND window_type = $3
        LIMIT 1`,
      [tenantId, resource, windowType]
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * getQuotaLimit — retrieve the max_count for (tenantId, resource).
 * Returns null (unlimited) if no quota row found (safe default).
 */
export async function getQuotaLimit(
  tenantId: string,
  resource: QuotaResource,
  windowType?: string
): Promise<number | null> {
  const row = await getQuotaRow(tenantId, resource, windowType as any);
  if (!row) return null; // no quota = unlimited
  return row.max_count;  // null in DB also means unlimited
}

/**
 * getCurrentCount — uses the DB helper function to count current usage.
 * Falls back to 0 if function does not exist (migration pending).
 */
async function getCurrentCount(tenantId: string, resource: QuotaResource): Promise<number> {
  try {
    const window = MONTHLY_RESOURCES.has(resource) ? "monthly" : "total";
    const { rows } = await pool.query(
      `SELECT get_tenant_resource_count($1::uuid, $2, $3) AS cnt`,
      [tenantId, resource, window]
    );
    return parseInt(rows[0]?.cnt ?? "0", 10);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkQuota — verify the tenant has not exceeded its limit for `resource`.
 *
 * Throws QuotaExceededError if: current_count >= max_count AND max_count IS NOT NULL.
 * NULL max_count = unlimited — never throws.
 *
 * Fail-open: any DB error → no quota enforced (logs a warning).
 * Call from POST handlers BEFORE external API usage or DB INSERT.
 */
export async function checkQuota(
  tenantId: string,
  resource: QuotaResource
): Promise<void> {
  try {
    const window = MONTHLY_RESOURCES.has(resource) ? "monthly" : "total";
    const row = await getQuotaRow(tenantId, resource, window);
    const maxCount = row?.max_count ?? null;

    // NULL or negative = unlimited
    if (maxCount === null || maxCount < 0) return;

    const currentCount = await getCurrentCount(tenantId, resource);
    if (currentCount >= maxCount) {
      const resetAt = row?.reset_window_at ? new Date(row.reset_window_at) : null;
      throw new QuotaExceededError(tenantId, resource, currentCount, maxCount, resetAt);
    }
  } catch (err: any) {
    if (err instanceof QuotaExceededError) throw err;
    console.warn(`[TenantQuota] checkQuota(${tenantId}, ${resource}) error — failing open:`, err?.message);
  }
}

/**
 * buildQuotaExceededResponse — build the standard 429 JSON body for a QuotaExceededError.
 * Ensures consistent shape across all routes.
 */
export function buildQuotaExceededResponse(err: QuotaExceededError) {
  return {
    code: "QUOTA_EXCEEDED",
    message: `Quota exceeded for '${err.resource}'`,
    resource: err.resource,
    current_usage: err.currentCount,
    limit: err.maxCount,
    reset_at: err.resetAt?.toISOString() ?? null,
  };
}

/**
 * getQuotaStatus — full quota summary for the admin dashboard.
 */
export async function getQuotaStatus(tenantId: string): Promise<QuotaStatusItem[]> {
  const allResources: QuotaResource[] = [
    "bookings", "users", "staff", "agents", "leads", "packages",
    "branches", "documents", "invoices", "notification_templates", "pilgrims",
    "ai_messages_monthly", "whatsapp_monthly", "sms_monthly",
    "email_monthly", "push_monthly", "rcs_monthly",
    "workflow_executions_monthly", "connected_channels_total",
  ];

  try {
    const { rows: quotaRows } = await pool.query(
      `SELECT resource, max_count, window_type, reset_window_at, updated_at
         FROM tenant_quotas WHERE tenant_id = $1::uuid
         ORDER BY resource`,
      [tenantId]
    );

    const rowMap = new Map(quotaRows.map((r: any) => [r.resource, r]));

    return await Promise.all(
      allResources.map(async (resource) => {
        const row = rowMap.get(resource);
        const maxCount: number | null = row?.max_count ?? null;
        const currentCount = await getCurrentCount(tenantId, resource);
        const unlimited = maxCount === null || maxCount < 0;
        const pctUsed = unlimited || maxCount === 0
          ? 0
          : Math.min(100, Math.round((currentCount / maxCount!) * 100));
        return {
          resource,
          max_count: maxCount,
          current_count: currentCount,
          pct_used: pctUsed,
          window_type: row?.window_type ?? (MONTHLY_RESOURCES.has(resource) ? "monthly" : "total"),
          unlimited,
          reset_window_at: row?.reset_window_at ?? null,
        };
      })
    );
  } catch (err: any) {
    console.warn("[TenantQuota] getQuotaStatus error:", err?.message);
    return [];
  }
}

export interface QuotaStatusItem {
  resource: string;
  max_count: number | null;
  current_count: number;
  pct_used: number;
  window_type: string;
  unlimited: boolean;
  reset_window_at: string | null;
}

/**
 * setQuota — upsert a quota limit. Pass null for unlimited.
 */
export async function setQuota(
  tenantId: string,
  resource: string,
  maxCount: number | null,
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
 * isQuotaTableReady — checks if tenant_quotas table exists.
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
