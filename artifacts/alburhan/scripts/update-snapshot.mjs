#!/usr/bin/env node
/**
 * Snapshot Updater
 *
 * Run this INTENTIONALLY when you add or remove nav items / role redirects:
 *
 *   node scripts/update-snapshot.mjs
 *
 * It regenerates src/config/nav-snapshot.json from the current state
 * of navigation.ts and roleRedirects.ts. Commit the updated snapshot.
 *
 * The pre-build check (check-nav.mjs) will then accept the new state
 * and block any ACCIDENTAL future regressions.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const navTs      = readFileSync(resolve(ROOT, "src/config/navigation.ts"), "utf-8");
const redirectTs = readFileSync(resolve(ROOT, "src/config/roleRedirects.ts"), "utf-8");
const appTsx     = readFileSync(resolve(ROOT, "src/App.tsx"), "utf-8");

// Extract nav hrefs — keep FULL href (including query strings) for accurate tracking
const hrefMatches    = [...navTs.matchAll(/href:\s*"([^"]+)"/g)];
const navHrefs       = [...new Set(hrefMatches.map(m => m[1]))];

// Extract redirects — handles both unquoted (branch_manager: "...") and quoted ("key": "...") keys
const redirectMatches = [...redirectTs.matchAll(/(\w+):\s+"([^"]+)"/g)];
const roleRedirects   = {};
for (const m of redirectMatches) {
  // Skip TypeScript type keywords that happen to match
  if (["string", "Record", "export", "const", "import"].includes(m[1])) continue;
  roleRedirects[m[1]] = m[2];
}

// Extract App.tsx routes
const routeMatches = [...appTsx.matchAll(/path="([^"]+)"/g)];
const routes       = [...new Set(routeMatches.map(m => m[1]))].sort();

const snapshot = {
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  navHrefs,
  roleRedirects,
  routes,
  stats: {
    totalNavItems: navHrefs.length,
    totalRoles: Object.keys(roleRedirects).length,
    totalRoutes: routes.length,
  },
};

const outPath = resolve(ROOT, "src/config/nav-snapshot.json");
writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");

console.log(`\n✓  Snapshot updated → src/config/nav-snapshot.json`);
console.log(`   Nav items   : ${snapshot.stats.totalNavItems}`);
console.log(`   Roles       : ${snapshot.stats.totalRoles}`);
console.log(`   App routes  : ${snapshot.stats.totalRoutes}`);
console.log(`   Date        : ${snapshot.updatedAt}\n`);
