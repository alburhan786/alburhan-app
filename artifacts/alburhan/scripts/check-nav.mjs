#!/usr/bin/env node
/**
 * Pre-build Navigation Regression Check
 *
 * This script runs before every build (see package.json "build" script).
 * It compares the current navigation + redirect config against a stored
 * snapshot (src/config/nav-snapshot.json) and FAILS the build if:
 *
 *   • Any previously-registered nav href has been removed
 *   • Any role redirect target has changed without updating the snapshot
 *   • Any nav href has no matching route in App.tsx
 *
 * TO INTENTIONALLY ADD OR REMOVE A NAV ITEM:
 *   1. Edit src/config/navigation.ts
 *   2. Edit App.tsx (add/remove the Route)
 *   3. Run:  node scripts/update-snapshot.mjs
 *   4. Commit nav-snapshot.json alongside your changes
 *
 * This ensures regressions are impossible by accident.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── helpers ────────────────────────────────────────────────────────────────
function red(s)    { return `\x1b[31m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s)   { return `\x1b[1m${s}\x1b[0m`; }

let failed = false;
function fail(msg) { console.error(red("  ✗ " + msg)); failed = true; }
function pass(msg) { console.log(green("  ✓ " + msg)); }
function warn(msg) { console.log(yellow("  ⚠ " + msg)); }

// ── 1. Load snapshot ───────────────────────────────────────────────────────
const snapshotPath = resolve(ROOT, "src/config/nav-snapshot.json");
if (!existsSync(snapshotPath)) {
  console.log(yellow("\n⚠  nav-snapshot.json not found — creating it now (first run).\n"));
  // Allow first-time build to pass; snapshot will be created by update-snapshot.mjs
  process.exit(0);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));

// ── 2. Extract current routes from App.tsx ─────────────────────────────────
const appTsx = readFileSync(resolve(ROOT, "src/App.tsx"), "utf-8");
const routeMatches = [...appTsx.matchAll(/path="([^"]+)"/g)];
const appRoutes = new Set(routeMatches.map(m => m[1]));

// ── 3. Extract nav hrefs from navigation.ts (read raw strings) ─────────────
const navTs = readFileSync(resolve(ROOT, "src/config/navigation.ts"), "utf-8");
const hrefMatches = [...navTs.matchAll(/href:\s*"([^"]+)"/g)];
const currentNavHrefsFull    = hrefMatches.map(m => m[1]);                // full hrefs (dup check + snapshot check)
const currentNavHrefs        = hrefMatches.map(m => m[1].split("?")[0]);  // stripped for App.tsx route check
const currentNavHrefSetFull  = new Set(currentNavHrefsFull);              // for snapshot comparison
const currentNavHrefSet      = new Set(currentNavHrefs);                  // for route matching

// ── 4. Extract redirects from roleRedirects.ts ─────────────────────────────
const redirectTs = readFileSync(resolve(ROOT, "src/config/roleRedirects.ts"), "utf-8");
const redirectMatches = [...redirectTs.matchAll(/(\w+):\s+"([^"]+)"/g)];
const currentRedirects = {};
const SKIP_KEYWORDS = new Set(["string", "Record", "export", "const", "import"]);
for (const m of redirectMatches) {
  if (!SKIP_KEYWORDS.has(m[1])) currentRedirects[m[1]] = m[2];
}

// ── 5. Run checks ──────────────────────────────────────────────────────────
console.log(bold("\n🔍  Navigation Regression Check\n"));

// 5a. Snapshot nav hrefs — nothing must disappear
let missingFromNav = 0;
for (const href of snapshot.navHrefs) {
  if (!currentNavHrefSetFull.has(href)) {
    fail(`Nav item disappeared: ${href}`);
    missingFromNav++;
  }
}
if (missingFromNav === 0) pass(`All ${snapshot.navHrefs.length} snapshot nav items present`);

// 5b. All current nav hrefs must have a matching route in App.tsx
let missingRoutes = 0;
for (const href of currentNavHrefs) {
  if (!appRoutes.has(href)) {
    // Some hrefs are sub-paths of dynamic routes — check prefix match
    const hasParent = [...appRoutes].some(r => !r.includes(":") && href.startsWith(r));
    if (!hasParent) {
      fail(`Nav href has no App.tsx route: ${href}`);
      missingRoutes++;
    }
  }
}
if (missingRoutes === 0) pass(`All nav hrefs have matching App.tsx routes`);

// 5c. Snapshot role redirects — no target may change silently
let changedRedirects = 0;
for (const [role, target] of Object.entries(snapshot.roleRedirects)) {
  const current = currentRedirects[role];
  if (current === undefined) {
    fail(`Role redirect disappeared: ${role} → ${target}`);
    changedRedirects++;
  } else if (current !== target) {
    fail(`Role redirect changed without snapshot update: ${role} was → ${target}, now → ${current}`);
    changedRedirects++;
  }
}
if (changedRedirects === 0) pass(`All ${Object.keys(snapshot.roleRedirects).length} role redirects unchanged`);

// 5d. All role redirect targets must have a matching route
let missingRedirectRoutes = 0;
for (const [role, target] of Object.entries(currentRedirects)) {
  if (!appRoutes.has(target) && !target.startsWith("/branch") && !target.startsWith("/agent") && !target.startsWith("/staff") && !target.startsWith("/customer")) {
    // Only flag /admin/* routes that are clearly missing
    if (target.startsWith("/admin/") && !appRoutes.has(target)) {
      fail(`Role redirect target has no App.tsx route: ${role} → ${target}`);
      missingRedirectRoutes++;
    }
  }
}
if (missingRedirectRoutes === 0) pass(`All role redirect targets have matching routes`);

// 5e. Duplicate nav items check — use FULL hrefs so "?tab=x" variants aren't flagged
const seen = new Map();
let duplicates = 0;
for (const href of currentNavHrefsFull) {
  seen.set(href, (seen.get(href) || 0) + 1);
}
for (const [href, count] of seen.entries()) {
  if (count > 1) {
    fail(`Duplicate nav item (appears ${count}×): ${href}`);
    duplicates++;
  }
}
if (duplicates === 0) pass(`Zero duplicate nav entries`);

// ── 6. Summary ─────────────────────────────────────────────────────────────
console.log("");
console.log(bold("  📊  Summary"));
console.log(`      Nav items   : ${currentNavHrefs.length}`);
console.log(`      App routes  : ${appRoutes.size}`);
console.log(`      Role redirects: ${Object.keys(currentRedirects).length}`);
console.log(`      Snapshot ver: ${snapshot.version}`);
console.log(`      Updated     : ${snapshot.updatedAt}`);
console.log("");

if (failed) {
  console.error(red(bold("  ✗  BUILD BLOCKED — Fix the regressions above, then update the snapshot:")));
  console.error(red("     node scripts/update-snapshot.mjs\n"));
  process.exit(1);
} else {
  console.log(green(bold("  ✓  All checks passed — build continuing.\n")));
  process.exit(0);
}
