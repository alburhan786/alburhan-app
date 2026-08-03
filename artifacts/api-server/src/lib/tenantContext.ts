// @ts-nocheck
/**
 * Tenant Context Middleware — SaaS Phase 3
 *
 * Resolves the tenant for every request from TRUSTED SERVER-SIDE SOURCES ONLY.
 * Never reads tenant identity from body, query-string, or URL params.
 *
 * Resolution chain (first non-null wins):
 *   1. Automation service token  — tok.tenantId attached by automation.ts requireServiceToken()
 *   2. Authenticated session     — req.user.tenantId (loaded by requireAuth from users.tenant_id)
 *   3. Internal-job flag         — req._internalJob = true → Al Burhan default
 *   4. Default fallback          — Al Burhan tenant (10000000-1000-4000-8000-000000000001)
 *      Safe in Phase 3: Al Burhan is the only tenant.
 *      Phase 4 will promote this to a hard 400 when a second tenant exists.
 *
 * Backward compatibility:
 *   All existing sessions where user.tenantId is undefined fall through to the
 *   Al Burhan default — no login/session invalidation required.
 */

import type { Request, Response, NextFunction } from "express";
import { DEFAULT_TENANT_ID } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TenantSource = "service_token" | "session" | "internal_job" | "default";

export interface TenantContext {
  tenantId: string;
  source: TenantSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core resolver (pure function — no I/O, no throws)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolveTenantId — derive TenantContext from request.
 * Always returns a valid UUID; never throws.
 */
export function resolveTenantId(req: Request): TenantContext {
  const r = req as any;
  // 1. Automation service token (set by requireServiceToken in automation.ts)
  if (r.serviceToken?.tenantId) {
    return { tenantId: r.serviceToken.tenantId, source: "service_token" };
  }
  // 2. Authenticated session (user.tenantId populated by requireAuth)
  if (r.user?.tenantId) {
    return { tenantId: r.user.tenantId, source: "session" };
  }
  // 3. Internal job / cron caller
  if (r._internalJob) {
    return { tenantId: DEFAULT_TENANT_ID, source: "internal_job" };
  }
  // 4. Default (Al Burhan) — backward compat for all existing unenriched sessions
  return { tenantId: DEFAULT_TENANT_ID, source: "default" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * attachTenantContext — global Express middleware.
 * Register before the main API router so req.tenantId is always set.
 * Never throws; always calls next().
 */
export function attachTenantContext(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const ctx = resolveTenantId(req);
  (req as any).tenantId = ctx.tenantId;
  (req as any).tenantSource = ctx.source;
  next();
}

/**
 * requireTenantContext — strict middleware.
 * Rejects with 400 when only the fallback default would apply.
 * NOT applied globally in Phase 3; reserved for Phase 4 platform-admin routes.
 */
export function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ctx = resolveTenantId(req);
  if (ctx.source === "default") {
    res.status(400).json({
      error: "TENANT_CONTEXT_MISSING",
      message: "Request cannot be attributed to a tenant. Authenticate first.",
    });
    return;
  }
  (req as any).tenantId = ctx.tenantId;
  (req as any).tenantSource = ctx.source;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers for use inside route handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getTenantId — extract tenantId from request (set by attachTenantContext).
 * Falls back to DEFAULT_TENANT_ID defensively if middleware hasn't run.
 */
export function getTenantId(req: Request): string {
  return (req as any).tenantId ?? DEFAULT_TENANT_ID;
}
