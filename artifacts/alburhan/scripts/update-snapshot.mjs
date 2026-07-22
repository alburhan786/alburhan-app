#!/usr/bin/env node
/**
 * Snapshot + Registry Updater
 *
 * Run this INTENTIONALLY when you add or remove nav items, routes, roles,
 * or any other registered item. Never run automatically.
 *
 *   node scripts/update-snapshot.mjs
 *
 * Updates:
 *   • src/config/nav-snapshot.json   — nav hrefs, role redirects, App.tsx routes
 *   • src/config/master-registry.json — version + updatedAt + stats
 *
 * Then commit BOTH files alongside your code change.
 * The pre-build checks (check-nav.mjs + check-registry.mjs) will accept
 * the new state and block any ACCIDENTAL future regressions.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const navTs      = readFileSync(resolve(ROOT, "src/config/navigation.ts"),   "utf-8");
const redirectTs = readFileSync(resolve(ROOT, "src/config/roleRedirects.ts"), "utf-8");
const appTsx     = readFileSync(resolve(ROOT, "src/App.tsx"),                 "utf-8");

// ── Nav hrefs (keep full href including query strings) ─────────────────────
const hrefMatches = [...navTs.matchAll(/href:\s*"([^"]+)"/g)];
const navHrefs    = [...new Set(hrefMatches.map(m => m[1]))];

// ── Role redirects ─────────────────────────────────────────────────────────
const redirectMatches = [...redirectTs.matchAll(/(\w+):\s+"([^"]+)"/g)];
const SKIP = new Set(["string","Record","export","const","import"]);
const roleRedirects = {};
for (const m of redirectMatches) {
  if (!SKIP.has(m[1])) roleRedirects[m[1]] = m[2];
}

// ── App.tsx routes ─────────────────────────────────────────────────────────
const routeMatches = [...appTsx.matchAll(/path="([^"]+)"/g)];
const routes       = [...new Set(routeMatches.map(m => m[1]))].sort();

// ── Write nav-snapshot.json ────────────────────────────────────────────────
const snapshot = {
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  navHrefs,
  roleRedirects,
  routes,
  stats: {
    totalNavItems: navHrefs.length,
    totalRoles:    Object.keys(roleRedirects).length,
    totalRoutes:   routes.length,
  },
};
const snapshotPath = resolve(ROOT, "src/config/nav-snapshot.json");
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");

// ── Update master-registry.json stats + date ──────────────────────────────
const registryPath = resolve(ROOT, "src/config/master-registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf-8"));
registry.updatedAt = snapshot.updatedAt;
// Recompute stats from the live registry arrays
registry.stats = {
  totalDashboards:         registry.dashboards.length,
  totalRoles:              registry.roles.length,
  totalPermissionModules:  registry.permissions.modules.length,
  totalPermissionActions:  registry.permissions.actions.length,
  totalPortals:            registry.portals.length,
  totalNotificationModules:registry.notificationModules.length,
  totalApiEndpoints:       registry.apiEndpoints.length,
};
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

// ── Report ─────────────────────────────────────────────────────────────────
console.log(`\n✓  nav-snapshot.json updated`);
console.log(`   Nav items   : ${snapshot.stats.totalNavItems}`);
console.log(`   Roles       : ${snapshot.stats.totalRoles}`);
console.log(`   App routes  : ${snapshot.stats.totalRoutes}`);

console.log(`\n✓  master-registry.json updated`);
console.log(`   Dashboards       : ${registry.stats.totalDashboards}`);
console.log(`   Portals          : ${registry.stats.totalPortals}`);
console.log(`   Roles            : ${registry.stats.totalRoles}`);
console.log(`   Permission mods  : ${registry.stats.totalPermissionModules}`);
console.log(`   Notification mods: ${registry.stats.totalNotificationModules}`);
console.log(`   API endpoints    : ${registry.stats.totalApiEndpoints}`);
console.log(`   Date             : ${snapshot.updatedAt}`);
console.log(`\n→  Commit both files:\n   git add src/config/nav-snapshot.json src/config/master-registry.json\n`);
