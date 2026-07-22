/**
 * SINGLE SOURCE OF TRUTH — Role Redirects
 *
 * Every login redirect is driven by this file.
 * Login.tsx IMPORTS from here; it never contains its own if/else chains.
 *
 * TWO-LEVEL lookup:
 *  1. PORTAL_REDIRECT   — checked against user.role (no extra API call)
 *     Covers non-admin portal users: branch_manager, agent, staff (portal)
 *
 *  2. ADMIN_ROLE_REDIRECT — checked after fetching GET /api/admin-users/me
 *     Covers every adminRole value stored in the database.
 *
 * To add a new role landing page:
 *   1. Add an entry here.
 *   2. Make sure the target route exists in App.tsx.
 *   3. The pre-build check will catch mismatches.
 */

/** user.role values that bypass the admin portal entirely */
export const PORTAL_REDIRECT: Record<string, string> = {
  branch_manager: "/branch/dashboard",
  agent:          "/agent/dashboard",
  staff:          "/staff/dashboard",   // portal staff, NOT admin sub-role
};

/**
 * adminRole values returned by GET /api/admin-users/me.
 * Covers every value defined in use-permissions.ts AdminRole type.
 */
export const ADMIN_ROLE_REDIRECT: Record<string, string> = {
  super_admin: "/admin/super",
  admin:       "/admin/dashboard",
  finance:     "/admin/finance",
  accounts:    "/admin/accounting",
  operations:  "/admin/operations",
  manager:     "/admin/manager",
  sales:       "/admin/customers",
  guide:       "/admin/guide-panel",
  staff:       "/admin/dashboard",   // admin sub-role "staff" stays in admin portal
  read_only:   "/admin/dashboard",
};

/** Fallback when adminRole is unknown or the API call fails */
export const DEFAULT_ADMIN_REDIRECT    = "/admin/dashboard";

/** Fallback for every non-admin, non-portal user */
export const DEFAULT_CUSTOMER_REDIRECT = "/customer/dashboard";
