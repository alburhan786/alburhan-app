#!/usr/bin/env node
/**
 * MASTER REGISTRY INTEGRITY CHECK
 *
 * Runs as part of the pre-build gate (alongside check-nav.mjs).
 * Validates every protected item in master-registry.json still exists
 * in source code. Fails the build immediately with the exact file path
 * if anything is missing.
 *
 * Checks performed:
 *   1. Every dashboard URL exists as an App.tsx Route
 *   2. Every dashboard component file exists on disk
 *   3. Every portal URL exists as an App.tsx Route
 *   4. Every portal component file exists on disk
 *   5. All permission modules are still defined in use-permissions.ts
 *   6. All roles listed in registry match roleRedirects.ts
 *   7. No new App.tsx routes are orphaned (not in master registry or snapshot)
 *   8. Every registry API endpoint path is syntactically valid
 *   9. Core config files are present (navigation.ts, roleRedirects.ts, nav-snapshot.json)
 *  10. No duplicate route paths in App.tsx
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

let failed = false;
const failures = [];

function fail(check, detail, file = "") {
  const msg = file ? `${check} — ${detail}\n     ${red("File:")} ${file}` : `${check} — ${detail}`;
  console.error(red("  ✗ ") + msg);
  failures.push({ check, detail, file });
  failed = true;
}
function pass(msg) { console.log(green("  ✓ ") + msg); }
function section(title) { console.log(bold(`\n  ── ${title}`)); }

// ── Load sources ──────────────────────────────────────────────────────────────

const REGISTRY_PATH   = resolve(ROOT, "src/config/master-registry.json");
const SNAPSHOT_PATH   = resolve(ROOT, "src/config/nav-snapshot.json");
const APP_TSX_PATH    = resolve(ROOT, "src/App.tsx");
const PERMS_PATH      = resolve(ROOT, "src/hooks/use-permissions.ts");
const REDIRECTS_PATH  = resolve(ROOT, "src/config/roleRedirects.ts");
const NAV_PATH        = resolve(ROOT, "src/config/navigation.ts");

// Guard: core config files must exist
const CORE_FILES = [
  { path: REGISTRY_PATH,  label: "src/config/master-registry.json" },
  { path: SNAPSHOT_PATH,  label: "src/config/nav-snapshot.json"    },
  { path: APP_TSX_PATH,   label: "src/App.tsx"                     },
  { path: PERMS_PATH,     label: "src/hooks/use-permissions.ts"    },
  { path: REDIRECTS_PATH, label: "src/config/roleRedirects.ts"     },
  { path: NAV_PATH,       label: "src/config/navigation.ts"        },
];

console.log(bold("\n🛡   Master Registry Integrity Check\n"));

section("Core config files");
let coreOk = true;
for (const { path, label } of CORE_FILES) {
  if (!existsSync(path)) {
    fail("Missing core file", label, label);
    coreOk = false;
  } else {
    pass(label);
  }
}
if (!coreOk) {
  console.error(red(bold("\n  ✗  Core files missing — cannot continue checks.\n")));
  process.exit(1);
}

const registry  = JSON.parse(readFileSync(REGISTRY_PATH,  "utf-8"));
const snapshot  = JSON.parse(readFileSync(SNAPSHOT_PATH,  "utf-8"));
const appTsx    = readFileSync(APP_TSX_PATH,   "utf-8");
const permsSrc  = readFileSync(PERMS_PATH,     "utf-8");
const redirSrc  = readFileSync(REDIRECTS_PATH, "utf-8");

// Extract App.tsx routes (all `path="..."` values)
const appRoutes   = new Set([...appTsx.matchAll(/path="([^"]+)"/g)].map(m => m[1]));

// ── Check 1: Dashboard URLs in App.tsx ────────────────────────────────────────
section("Dashboard routes (must have App.tsx Route)");
for (const dash of registry.dashboards) {
  const base = dash.url.split("?")[0];
  const found = appRoutes.has(base)
    || [...appRoutes].some(r => !r.includes(":") && base.startsWith(r));
  if (!found) {
    fail(`Dashboard route missing in App.tsx`, `${dash.label} → ${dash.url}`, "src/App.tsx");
  } else {
    pass(`${dash.label.padEnd(28)} ${dim(dash.url)}`);
  }
}

// ── Check 2: Dashboard component files on disk ───────────────────────────────
section("Dashboard component files (must exist on disk)");
for (const dash of registry.dashboards) {
  const absPath = resolve(ROOT, dash.file);
  if (!existsSync(absPath)) {
    fail(`Dashboard component file deleted`, `${dash.label} was at ${dash.file}`, dash.file);
  } else {
    pass(`${dash.label.padEnd(28)} ${dim(dash.file)}`);
  }
}

// ── Check 3: Portal URLs in App.tsx ──────────────────────────────────────────
section("Portal routes (must have App.tsx Route)");
for (const portal of registry.portals) {
  const base = portal.url.split("?")[0];
  const found = appRoutes.has(base)
    || [...appRoutes].some(r => !r.includes(":") && base.startsWith(r));
  if (!found) {
    fail(`Portal route missing in App.tsx`, `${portal.label} → ${portal.url}`, "src/App.tsx");
  } else {
    pass(`${portal.label.padEnd(28)} ${dim(portal.url)}`);
  }
}

// ── Check 4: Portal component files on disk ───────────────────────────────────
section("Portal component files (must exist on disk)");
for (const portal of registry.portals) {
  const absPath = resolve(ROOT, portal.file);
  if (!existsSync(absPath)) {
    fail(`Portal component file deleted`, `${portal.label} was at ${portal.file}`, portal.file);
  } else {
    pass(`${portal.label.padEnd(28)} ${dim(portal.file)}`);
  }
}

// ── Check 5: Permission modules in use-permissions.ts ─────────────────────────
section("Permission modules (must be defined in use-permissions.ts)");
const { modules: permModules, adminRoles: permRoles } = registry.permissions;
let permOk = true;
for (const mod of permModules) {
  if (!permsSrc.includes(`"${mod}"`)) {
    fail(`Permission module removed from use-permissions.ts`, mod, "src/hooks/use-permissions.ts");
    permOk = false;
  }
}
if (permOk) pass(`All ${permModules.length} permission modules present in use-permissions.ts`);

// ── Check 6: Permission roles in use-permissions.ts ───────────────────────────
let rolePermOk = true;
for (const role of permRoles) {
  if (!permsSrc.includes(`"${role}"`)) {
    fail(`Admin role removed from use-permissions.ts`, role, "src/hooks/use-permissions.ts");
    rolePermOk = false;
  }
}
if (rolePermOk) pass(`All ${permRoles.length} admin roles present in use-permissions.ts`);

// ── Check 7: Registry roles match roleRedirects.ts ───────────────────────────
section("Role redirects (must match roleRedirects.ts)");
const redirectMatches = [...redirSrc.matchAll(/(\w+):\s+"([^"]+)"/g)];
const SKIP = new Set(["string","Record","export","const","import"]);
const currentRedirects = {};
for (const m of redirectMatches) {
  if (!SKIP.has(m[1])) currentRedirects[m[1]] = m[2];
}

let redirectOk = true;
for (const role of registry.roles) {
  if (!currentRedirects[role.id] && role.type !== "portal_customer") {
    // portal roles (branch_manager, agent) ARE in roleRedirects
    if (currentRedirects[role.id] === undefined) {
      // Some roles might not be in roleRedirects (customer is handled differently)
      // Only fail for roles that WERE in the registry with type=admin/portal
      if (role.id !== "customer") {
        const inRedirects = Object.keys(currentRedirects).includes(role.id);
        if (!inRedirects) {
          fail(`Role missing from roleRedirects.ts`, role.id, "src/config/roleRedirects.ts");
          redirectOk = false;
        }
      }
    }
  } else if (currentRedirects[role.id] && currentRedirects[role.id] !== role.redirect) {
    fail(
      `Role redirect changed without updating master-registry.json`,
      `${role.id}: expected → ${role.redirect}, got → ${currentRedirects[role.id]}`,
      "src/config/roleRedirects.ts"
    );
    redirectOk = false;
  }
}
if (redirectOk) pass(`All ${registry.roles.length} role redirects match roleRedirects.ts`);

// ── Check 8: No duplicate routes in App.tsx ───────────────────────────────────
section("App.tsx route integrity");
const allRouteMatches = [...appTsx.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
const routeSeen = new Map();
for (const r of allRouteMatches) routeSeen.set(r, (routeSeen.get(r) || 0) + 1);
let dupRouteOk = true;
for (const [route, count] of routeSeen.entries()) {
  if (count > 1) {
    fail(`Duplicate Route in App.tsx`, `${route} appears ${count}×`, "src/App.tsx");
    dupRouteOk = false;
  }
}
if (dupRouteOk) pass(`No duplicate Route paths in App.tsx (${appRoutes.size} unique routes)`);

// ── Check 9: Orphan routes (App.tsx routes not in snapshot or registry) ────────
section("Orphan route detection");
const snapshotRouteSet = new Set(snapshot.routes);
const registryUrls = new Set([
  ...registry.dashboards.map(d => d.url),
  ...registry.portals.map(p => p.url),
]);
const KNOWN_PUBLIC = new Set([
  "/", "/about", "/packages", "/packages/:id", "/ziyarat", "/hotels",
  "/ai-assistant", "/live-chat", "/blog", "/contact", "/privacy", "/terms",
  "/cancellation", "/refund", "/login", "/invoice/:bookingNumber",
  "/pay/:bookingNumber", "/feedback", "/verify-staff", "/verify/:id",
  "/scan/:barcodeId", "/kyc", "/branch", "/agent", "/staff", "/customer",
  "/verify/family/:groupId/:familyId", "/attendance-scan/:groupId/:eventId",
  "/agreement/:id/sign", "/verify-agreement/:token", "/knowledge",
  "/admin/branch-dashboard/:id", "/admin/groups/:groupId/pilgrims",
  "/admin/offline-bookings", "/admin/print-center", "/admin/print/spray-label",
  "/admin/production-report", "/admin/pilgrim-reports", "/admin/pilgrim-ops",
  "/admin/group-tracking", "/admin/ai-ops", "/admin/sms-production-report",
  "/admin/notification-health", "/admin/notification-templates",
  "/admin/otp-debug", "/admin/sms-test", "/admin/test-notifications",
  "/admin/sms-settings", "/admin/dlt-templates", "/admin/rcs-templates",
  "/admin/sms-templates", "/admin/email-templates", "/admin/whatsapp-templates",
  "/admin/whatsapp-history", "/admin/botbee-dashboard", "/admin/workflow-center",
  "/admin/communication-center", "/admin/automation-center", "/admin/loyalty",
  "/admin/allocations", "/admin/luggage", "/admin/ziyarat", "/admin/certificates",
  "/admin/document-expiry", "/admin/medical", "/admin/visa", "/admin/buses",
  "/admin/hotels", "/admin/flights", "/admin/groups", "/admin/qr-tracker",
  "/admin/print-center", "/admin/packages", "/admin/gallery", "/admin/marketing",
  "/admin/leads", "/admin/tasks", "/admin/support", "/admin/feedback",
  "/admin/requests", "/admin/inquiries", "/admin/broadcast", "/admin/kyc",
  "/admin/agents", "/admin/agent-dashboard", "/admin/branches",
  "/admin/reports", "/admin/staff", "/admin/expenses", "/admin/gst-reports",
  "/admin/payroll", "/admin/assets", "/admin/vendors", "/admin/suppliers",
  "/admin/family-ledger", "/admin/customer-ledger", "/admin/hajji-ledger",
  "/admin/payment-analytics", "/admin/payment-reminders", "/admin/offline-payments",
  "/admin/payment-trash", "/admin/bookings", "/admin/invoices", "/admin/payments",
  "/admin/packages", "/admin/bi", "/admin/settings", "/admin/billing-settings",
  "/admin/api-settings", "/admin/user-roles", "/admin/agreements",
  "/admin/audit-logs", "/admin/sms-audit", "/admin/system-health",
  "/admin/auto-notifications", "/admin/notification-logs", "/admin/chat",
  "/admin/ai", "/customer/documents", "/customer/support",
]);

// Collect dynamic patterns
const dynamicPatterns = [...appRoutes].filter(r => r.includes(":"));
let orphanCount = 0;
for (const route of appRoutes) {
  if (
    snapshotRouteSet.has(route) ||
    registryUrls.has(route) ||
    KNOWN_PUBLIC.has(route) ||
    route.includes(":") // dynamic routes are expected, skip deep check
  ) continue;
  // Check if it starts with a known group pattern
  const knownPrefix = [...KNOWN_PUBLIC].some(p => route.startsWith(p.replace(/\/:[^/]+/g, "")));
  if (!knownPrefix) {
    fail("Orphan route found in App.tsx (not in any registry)", route, "src/App.tsx");
    orphanCount++;
  }
}
if (orphanCount === 0) pass(`No orphan routes detected in App.tsx`);

// ── Check 10: API endpoint format ─────────────────────────────────────────────
section("API endpoint registry format");
let apiOk = true;
for (const ep of registry.apiEndpoints) {
  if (!ep.path.startsWith("/api/")) {
    fail("API endpoint path must start with /api/", ep.path, "src/config/master-registry.json");
    apiOk = false;
  }
  if (!Array.isArray(ep.acceptableStatus) || ep.acceptableStatus.length === 0) {
    fail("API endpoint must have acceptableStatus array", ep.path, "src/config/master-registry.json");
    apiOk = false;
  }
}
if (apiOk) pass(`All ${registry.apiEndpoints.length} API endpoint definitions are valid`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(bold("\n  📋  Registry Summary"));
console.log(`      Dashboards       : ${registry.dashboards.length}`);
console.log(`      Portals          : ${registry.portals.length}`);
console.log(`      Roles            : ${registry.roles.length}`);
console.log(`      Permission mods  : ${registry.permissions.modules.length}`);
console.log(`      Notification mods: ${registry.notificationModules.length}`);
console.log(`      API endpoints    : ${registry.apiEndpoints.length}`);
console.log(`      Registry version : ${registry.version} (${registry.updatedAt})`);
console.log("");

if (failed) {
  console.error(red(bold("  ✗  REGISTRY CHECK FAILED — Build blocked.")));
  console.error(red(`\n     ${failures.length} issue(s) found:\n`));
  for (const f of failures) {
    console.error(red(`     • [${f.check}] ${f.detail}`));
    if (f.file) console.error(red(`       File: ${f.file}`));
  }
  console.error(red("\n     Fix issues and re-run. To intentionally add/remove items:"));
  console.error(red("       node scripts/update-snapshot.mjs\n"));
  process.exit(1);
} else {
  console.log(green(bold("  ✓  Master registry integrity verified — build continuing.\n")));
  process.exit(0);
}
